// Discord Rich Presence: статус «играет в Minecraft» с сервером и онлайном.
use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const APP_ID: &str = "1541041521082634250";

static CLIENT: Mutex<Option<DiscordIpcClient>> = Mutex::new(None);
static START_TS: Mutex<u64> = Mutex::new(0);
static STATE_TEXT: Mutex<String> = Mutex::new(String::new());
// Счётчик поколений наблюдателей сервера
static NEXT_GEN: AtomicU64 = AtomicU64::new(0);
// Поколение активного сервера: Some(gen) — сейчас показываем сервер, None — меню/одиночка.
// Старые потоки опроса останавливаются сами, когда их поколение перестаёт быть активным.
static ACTIVE_SERVER: Mutex<Option<u64>> = Mutex::new(None);

const MENU_LAUNCHER: &str = "В меню лаунчера";
const MENU_GAME: &str = "В главном меню";
const SINGLEPLAYER: &str = "Одиночная игра";

fn active_server_gen() -> Option<u64> {
    *ACTIVE_SERVER.lock().unwrap()
}

fn set_active_server(gen: Option<u64>) {
    *ACTIVE_SERVER.lock().unwrap() = gen;
}

fn now_ts() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn build_payload<'a>(details: &'a str, state_text: &'a str) -> activity::Activity<'a> {
    let start = *START_TS.lock().unwrap() as i64;
    // Большая иконка — клиент; в игре сверху маленький бейдж Minecraft
    let assets = if state_text == MENU_LAUNCHER {
        activity::Assets::new()
            .large_image("launcher")
            .large_text("MCLauncher")
    } else {
        activity::Assets::new()
            .large_image("launcher")
            .large_text("MCLauncher")
            .small_image("minecraft")
            .small_text("Minecraft")
    };
    activity::Activity::new()
        .details(details)
        .state(state_text)
        .assets(assets)
        .timestamps(activity::Timestamps::new().start(start))
}

fn send_current() {
    let mut guard = CLIENT.lock().unwrap();
    if let Some(c) = guard.as_mut() {
        let st = STATE_TEXT.lock().unwrap().clone();
        // В лаунчере подписываем игру как MCLauncher, в игре — Minecraft
        let details = if st == MENU_LAUNCHER { "MCLauncher" } else { "Minecraft" };
        if c.set_activity(build_payload(details, &st)).is_err() {
            // Дискорд мог перезапуститься — пробуем переподключиться один раз
            if c.connect().is_ok() {
                let _ = c.set_activity(build_payload(details, &st));
            }
        }
    }
}

fn set_state(text: &str) {
    {
        let mut cur = STATE_TEXT.lock().unwrap();
        if *cur == text {
            return;
        }
        *cur = text.to_string();
    }
    send_current();
}

/// Подключение к локальному Discord (если он запущен).
fn connect_client() -> Option<DiscordIpcClient> {
    let mut c = DiscordIpcClient::new(APP_ID).ok()?;
    c.connect().ok()?;
    Some(c)
}

/// Вызывается при старте лаунчера: активность живёт постоянно.
pub fn start_menu() {
    {
        let guard = CLIENT.lock().unwrap();
        if guard.is_some() {
            return;
        }
    }
    if !crate::LauncherState::load().discord_rpc {
        return;
    }
    let mut client = match connect_client() {
        Some(c) => c,
        None => return, // Discord не запущен
    };

    *START_TS.lock().unwrap() = now_ts();
    *STATE_TEXT.lock().unwrap() = MENU_LAUNCHER.into();
    {
        let st = STATE_TEXT.lock().unwrap().clone();
        let _ = client.set_activity(build_payload("MCLauncher", &st));
    }
    *CLIENT.lock().unwrap() = Some(client);
}

/// Запуск игры: переключаем ту же активность на Minecraft.
pub fn start(game_dir: PathBuf) {
    set_active_server(None);
    if !crate::LauncherState::load().discord_rpc {
        return;
    }

    // Если клиента ещё нет (например, Discord запустили позже лаунчера) — подключаемся
    {
        let mut guard = CLIENT.lock().unwrap();
        if guard.is_none() {
            match connect_client() {
                Some(c) => *guard = Some(c),
                None => return,
            }
        }
    }

    if *START_TS.lock().unwrap() == 0 {
        *START_TS.lock().unwrap() = now_ts();
    }
    // При запуске игры игрок находится в главном меню Minecraft
    *STATE_TEXT.lock().unwrap() = MENU_GAME.into();
    send_current();

    std::thread::spawn(move || watch_log(game_dir));
}

/// Игра закрыта — возвращаемся к активности лаунчера (без сброса таймера).
pub fn back_to_menu() {
    set_active_server(None);
    set_state(MENU_LAUNCHER);
}

/// Полный сброс статуса (выключение тумблера или выход из приложения).
pub fn stop() {
    set_active_server(None);
    let mut guard = CLIENT.lock().unwrap();
    if let Some(mut c) = guard.take() {
        let _ = c.clear_activity();
        let _ = c.close();
    }
}

/// Слежение за logs/latest.log: определяем текущий сервер / одиночную игру.
/// Читаем только новые строки — историю прошлых сессий не трогаем.
fn watch_log(game_dir: PathBuf) {
    let log_path = game_dir.join("logs").join("latest.log");

    // Начинаем с конца файла: всё, что записано до старта этой сессии игры,
    // относится к прошлым запускам и нас не интересует.
    let mut offset: u64 = std::fs::metadata(&log_path).map(|m| m.len()).unwrap_or(0);
    let mut pending = String::new();

    loop {
        if !crate::game_is_running() {
            break;
        }
        if log_path.is_file() {
            if let Ok(data) = std::fs::read(&log_path) {
                if (data.len() as u64) < offset {
                    offset = 0; // лог пересоздан новой сессией
                    pending.clear();
                }
                if (data.len() as u64) > offset {
                    let tail = String::from_utf8_lossy(&data[offset as usize..]).to_string();
                    offset += tail.len() as u64;
                    pending.push_str(&tail);
                    while let Some(pos) = pending.find('\n') {
                        let line: String = pending.drain(..=pos).collect();
                        process_line(line.trim());
                    }
                    if pending.len() > 8192 {
                        pending.clear(); // защита от переполнения на длинных строках
                    }
                }
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(1500));
    }
}

fn process_line(line: &str) {
    if let Some(idx) = line.find("Connecting to") {
        let rest = line[idx + "Connecting to".len()..].trim();
        let rest = rest.trim_start_matches('(');
        let mut parts = rest.split([',', ' ', '\t']).filter(|p| !p.is_empty());
        let raw_host = parts
            .next()
            .unwrap_or("")
            .trim_matches(|c| c == '\'' || c == '"')
            .to_string();
        let log_port: Option<u16> = parts.next().and_then(|p| {
            p.trim_end_matches(|c| c == ')' || c == '.' || c == '\'' || c == '"')
                .trim()
                .parse()
                .ok()
        });

        // host может быть "host:port" или "[ipv6]:port"
        let (host, port) = if raw_host.starts_with('[') {
            (raw_host.clone(), log_port.unwrap_or(25565))
        } else if let Some(i) = raw_host.rfind(':') {
            let p = raw_host[i + 1..].parse().ok();
            (
                raw_host[..i].to_string(),
                p.or(log_port).unwrap_or(25565),
            )
        } else {
            (raw_host.clone(), log_port.unwrap_or(25565))
        };

        // Принимаем только похожие на адрес хосты: домен (с точкой),
        // IPv6 в скобках или localhost. Отсекает строки модов типа
        // "Connecting to voice chat server" (Simple Voice Chat).
        let looks_like_host =
            host.contains('.') || host.starts_with('[') || host.eq_ignore_ascii_case("localhost");
        if !host.is_empty() && looks_like_host {
            spawn_server_watch(host, port);
        }
    } else if line.contains("Starting integrated minecraft server") {
        // Одиночный мир: гасим наблюдателя сервера
        set_active_server(None);
        set_state(SINGLEPLAYER);
    } else if line.contains("Stopping server") || line.contains("Disconnected") {
        // Выход из мира/сервера в главное меню игры
        set_active_server(None);
        set_state(MENU_GAME);
    }
}

/// Гасит активный сервер (если был) и возвращает его прежнее поколение.
#[allow(dead_code)]
fn set_active_server_if_was(gen: Option<u64>) -> Option<u64> {
    let mut guard = ACTIVE_SERVER.lock().unwrap();
    let was = *guard;
    *guard = gen;
    was
}

/// Наблюдение за активным сервером.
/// Истина о том, на сервере ли игрок, берётся из реальных TCP-соединений
/// процесса игры (netstat), а не только из строк лога.
fn spawn_server_watch(host: String, port: u16) {
    let gen = NEXT_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    set_active_server(Some(gen));
    let target = Arc::new((host, port));

    set_state(&target.0);

    std::thread::spawn(move || {
        let mut tick: u32 = 0;
        loop {
            if !crate::game_is_running() || active_server_gen() != Some(gen) {
                break;
            }

            // Соединение с портом сервера пропало → мы в меню игры
            if !server_connection_alive(target.1) {
                if set_active_server_if_was(None) == Some(gen) {
                    set_state(MENU_GAME);
                }
                break;
            }

            // Онлайн-счётчик обновляем раз в ~30 секунд
            if tick % 5 == 0 {
                match query_players(&target.0, target.1) {
                    Some((online, max)) => {
                        if active_server_gen() != Some(gen) {
                            break;
                        }
                        set_state(&format!("{} · {} из {}", target.0, online, max));
                    }
                    None => {
                        if active_server_gen() != Some(gen) {
                            break;
                        }
                        set_state(&target.0);
                    }
                }
            }
            tick += 1;

            // Спим ~6 секунд с проверками актуальности
            for _ in 0..2 {
                if !crate::game_is_running() || active_server_gen() != Some(gen) {
                    return;
                }
                std::thread::sleep(Duration::from_secs(3));
            }
        }
    });
}

/// Есть ли у процесса игры установленное TCP-соединение с портом сервера.
#[cfg(windows)]
fn server_connection_alive(port: u16) -> bool {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let Some(pid) = crate::game_pid() else {
        return false;
    };
    let Ok(out) = Command::new("netstat")
        .args(["-ano", "-p", "tcp"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
    else {
        return true; // не смогли проверить — считаем что на месте
    };

    let text = String::from_utf8_lossy(&out.stdout);
    let suffix = format!(":{port}");
    let pid_str = pid.to_string();
    for line in text.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 5
            && parts[0].eq_ignore_ascii_case("tcp")
            && parts[2].ends_with(&suffix)
            && parts[3].eq_ignore_ascii_case("established")
            && parts[4] == pid_str
        {
            return true;
        }
    }
    false
}

#[cfg(not(windows))]
fn server_connection_alive(_port: u16) -> bool {
    true
}

// ---------- Server List Ping (Java Edition) ----------

fn put_varint(out: &mut Vec<u8>, mut value: u32) {
    loop {
        let mut b = (value & 0x7F) as u8;
        value >>= 7;
        if value != 0 {
            b |= 0x80;
        }
        out.push(b);
        if value == 0 {
            break;
        }
    }
}

fn read_varint_stream(s: &mut TcpStream) -> Option<i32> {
    let mut result: i32 = 0;
    for i in 0..5u32 {
        let mut byte = [0u8; 1];
        if s.read_exact(&mut byte).is_err() {
            return None;
        }
        result |= ((byte[0] & 0x7F) as i32) << (7 * i);
        if byte[0] & 0x80 == 0 {
            return Some(result);
        }
    }
    None
}

fn read_varint_slice(buf: &[u8], pos: &mut usize) -> Option<i32> {
    let mut result: i32 = 0;
    for i in 0..5u32 {
        let b = *buf.get(*pos)?;
        *pos += 1;
        result |= ((b & 0x7F) as i32) << (7 * i);
        if b & 0x80 == 0 {
            return Some(result);
        }
    }
    None
}

fn send_packet(s: &mut TcpStream, payload: &[u8]) -> std::io::Result<()> {
    let mut framed = Vec::with_capacity(payload.len() + 5);
    put_varint(&mut framed, payload.len() as u32);
    framed.extend_from_slice(payload);
    s.write_all(&framed)
}

/// Запрос статуса сервера: возвращает (онлайн, слоты).
fn query_players(host: &str, port: u16) -> Option<(u32, u32)> {
    let mut s = TcpStream::connect((host, port)).ok()?;
    s.set_read_timeout(Some(Duration::from_secs(5))).ok()?;
    s.set_write_timeout(Some(Duration::from_secs(5))).ok()?;

    // Handshake
    let mut hs = Vec::new();
    put_varint(&mut hs, 0x00);
    put_varint(&mut hs, 763); // протокол 1.20.1 — для статуса не критично
    put_varint(&mut hs, host.len() as u32);
    hs.extend_from_slice(host.as_bytes());
    hs.extend_from_slice(&port.to_be_bytes());
    put_varint(&mut hs, 1); // next state: status
    send_packet(&mut s, &hs).ok()?;

    // Status Request
    send_packet(&mut s, &[0x00]).ok()?;

    // Ответ: [varint длина пакета][varint id=0][varint длина JSON][JSON]
    let len = read_varint_stream(&mut s)?;
    if len <= 0 || len > 262_144 {
        return None;
    }
    let mut body = vec![0u8; len as usize];
    s.read_exact(&mut body).ok()?;

    let mut pos = 0usize;
    let _packet_id = read_varint_slice(&body, &mut pos)?;
    let json_len = read_varint_slice(&body, &mut pos)? as usize;
    if pos + json_len > body.len() {
        return None;
    }
    let json: serde_json::Value = serde_json::from_slice(&body[pos..pos + json_len]).ok()?;
    let online = json.pointer("/players/online")?.as_u64()? as u32;
    let max = json.pointer("/players/max")?.as_u64()? as u32;
    Some((online, max))
}
