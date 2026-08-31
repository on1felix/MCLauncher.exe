use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::{Emitter, Listener, Manager, WindowEvent};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use base64::Engine as _;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

mod discord_rpc;

static GAME: Mutex<Option<std::process::Child>> = Mutex::new(None);

/// Игра ещё запущена (для потока Discord RPC).
pub fn game_is_running() -> bool {
    GAME.lock()
        .unwrap()
        .as_mut()
        .map(|c| c.try_wait().ok().flatten().is_none())
        .unwrap_or(false)
}

/// PID запущенной игры (для проверки её сетевых подключений).
pub fn game_pid() -> Option<u32> {
    GAME.lock().unwrap().as_ref().map(|c| c.id())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SkinPayload {
    pub url: String,
    pub slim: bool,
}

#[tauri::command]
async fn fetch_skin(nick: String) -> Option<SkinPayload> {
    let client = reqwest::Client::new();

    // Официальный Mojang API: ник → UUID → текстуры скина → PNG
    let r = client
        .get(format!(
            "https://api.mojang.com/users/profiles/minecraft/{}",
            nick
        ))
        .send()
        .await
        .ok()?;
    if !r.status().is_success() {
        return None;
    }
    let uuid = r
        .json::<serde_json::Value>()
        .await
        .ok()?
        .get("id")?
        .as_str()?
        .to_string();

    let profile = client
        .get(format!(
            "https://sessionserver.mojang.com/session/minecraft/profile/{}?unsigned=false",
            uuid
        ))
        .send()
        .await
        .ok()?;
    if !profile.status().is_success() {
        return None;
    }
    let pj: serde_json::Value = profile.json().await.ok()?;
    let value = pj
        .get("properties")?
        .as_array()?
        .iter()
        .find(|x| x.get("name").and_then(|v| v.as_str()) == Some("textures"))?
        .get("value")?
        .as_str()?;
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(value)
        .ok()?;
    let tex: serde_json::Value = serde_json::from_slice(&decoded).ok()?;
    let skin = tex.get("textures")?.get("SKIN")?;
    let skin_url = skin.get("url")?.as_str()?;
    let slim = skin
        .get("metadata")
        .and_then(|m| m.get("model"))
        .and_then(|v| v.as_str())
        == Some("slim");

    let bytes = client.get(skin_url).send().await.ok()?.bytes().await.ok()?;
    Some(SkinPayload {
        url: format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(&bytes)
        ),
        slim,
    })
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LauncherState {
    pub nickname: String,
    pub raw_config: String,
    pub active_profile: String,
    pub profiles: Vec<String>,
    pub profile_configs: HashMap<String, String>,
    pub ram: u32,
    #[serde(default = "default_true")]
    pub discord_rpc: bool,
}

fn default_true() -> bool {
    true
}

impl Default for LauncherState {
    fn default() -> Self {
        Self {
            nickname: "Player".to_string(),
            raw_config: String::new(),
            active_profile: String::new(),
            profiles: Vec::new(),
            profile_configs: HashMap::new(),
            ram: 4,
            discord_rpc: true,
        }
    }
}

fn data_dir() -> PathBuf {
    let app_data = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(app_data).join("mclauncher")
}

fn state_file() -> PathBuf {
    data_dir().join("state.json")
}

fn clean_raw_config(text: &str) -> String {
    let lines: Vec<&str> = text
        .trim()
        .lines()
        .filter(|l| !l.trim().chars().all(|c| c == '-'))
        .map(|l| l.trim())
        .collect();
    let mut joined = lines.join(" ");
    loop {
        let prev = joined.clone();
        joined = joined.replace("\\\\", "\\").replace("\\\"", "\"");
        if joined == prev {
            break;
        }
    }
    joined.trim().to_string()
}

impl LauncherState {
    pub fn load() -> Self {
        let mut state = Self::default();

        // Миграция из state.json (старый формат)
        let file = state_file();
        if file.exists() {
            if let Ok(data) = fs::read_to_string(&file) {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&data) {
                    if let Some(n) = parsed.get("nickname").and_then(|v| v.as_str()) {
                        state.nickname = n.to_string();
                    }
                    if let Some(a) = parsed.get("active_profile").and_then(|v| v.as_str()) {
                        state.active_profile = a.to_string();
                    }
                    if let Some(ps) = parsed.get("profiles").and_then(|v| v.as_array()) {
                        for p in ps {
                            if let Some(name) = p.as_str() {
                                if !state.profiles.contains(&name.to_string()) {
                                    state.profiles.push(name.to_string());
                                }
                            }
                        }
                    }
                    if let Some(r) = parsed.get("ram").and_then(|v| v.as_u64()) {
                        state.ram = r as u32;
                    }
                    if let Some(d) = parsed.get("discord_rpc").and_then(|v| v.as_bool()) {
                        state.discord_rpc = d;
                    }
                }
            }
        }

        // Читаем профили из profiles.json (формат консольной версии)
        let profiles_file = data_dir().join("profiles.json");
        if profiles_file.exists() {
            if let Ok(data) = fs::read_to_string(&profiles_file) {
                if let Ok(map) = serde_json::from_str::<HashMap<String, String>>(&data) {
                    for (name, cfg) in map {
                        let cfg = clean_raw_config(&cfg);
                        if !state.profiles.contains(&name) {
                            state.profiles.push(name.clone());
                        }
                        state.profile_configs.insert(name, cfg);
                    }
                }
            }
        }
        state.profiles.sort();

        // Читаем mclauncher.json (никнейм, активный профиль, raw_config)
        let cfg_file = data_dir().join("mclauncher.json");
        if cfg_file.exists() {
            if let Ok(data) = fs::read_to_string(&cfg_file) {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&data) {
                    if let Some(n) = parsed.get("nickname").and_then(|v| v.as_str()) {
                        if !n.is_empty() {
                            state.nickname = n.to_string();
                        }
                    }
                    if let Some(a) = parsed.get("active_profile").and_then(|v| v.as_str()) {
                        state.active_profile = a.to_string();
                    }
                    if let Some(r) = parsed.get("raw_config").and_then(|v| v.as_str()) {
                        state.raw_config = clean_raw_config(r);
                    }
                    if let Some(d) = parsed.get("discord_rpc").and_then(|v| v.as_bool()) {
                        state.discord_rpc = d;
                    }
                }
            }
        }

        state
    }

    pub fn save(&self) -> Result<(), String> {
        let dir = data_dir();
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

        // mclauncher.json — как в консольной версии
        let settings = serde_json::json!({
            "nickname": self.nickname,
            "raw_config": self.raw_config,
            "active_profile": self.active_profile,
            "discord_rpc": self.discord_rpc,
        });
        fs::write(
            dir.join("mclauncher.json"),
            serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;

        // profiles.json — как в консольной версии
        let mut prof_map = HashMap::new();
        for name in &self.profiles {
            if let Some(cfg) = self.profile_configs.get(name) {
                prof_map.insert(name.clone(), cfg.clone());
            }
        }
        fs::write(
            dir.join("profiles.json"),
            serde_json::to_string_pretty(&prof_map).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;

        Ok(())
    }
}

// ---------------- Запуск (порт из mclauncher.py) ----------------

fn fix_and_patch_command(cmd: &str, username: &str) -> String {
    let mut s = clean_raw_config(cmd);

    let javaw = Regex::new(r"(?i)javaw\.exe").unwrap();
    s = javaw.replace_all(&s, "java.exe").to_string();

    let un = Regex::new(r"--username\s+\S+").unwrap();
    s = un
        .replace_all(&s, &format!("--username {}", username))
        .to_string();

    if !s.contains("--accessToken null") {
        s = s.replace("--accessToken", "--accessToken null");
    }

    let demo = Regex::new(r"\s*--demo\b").unwrap();
    s = demo.replace_all(&s, "").to_string();

    s.trim().to_string()
}

fn get_param_value(cmd: &str, param: &str) -> String {
    let re = Regex::new(&format!(r"{}\s+(\S+)", regex::escape(param))).unwrap();
    if let Some(caps) = re.captures(cmd) {
        caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default()
    } else {
        String::new()
    }
}

fn get_java_path(cmd: &str) -> Option<String> {
    let s = cmd.trim_start();
    if let Some(rest) = s.strip_prefix('"') {
        if let Some(end) = rest.find('"') {
            return Some(rest[..end].to_string());
        }
    }
    s.split_whitespace().next().map(|t| t.to_string())
}

// Разделяет команду на исполняемый файл и аргументы,
// корректно обрабатывая кавычки вокруг пути к java.exe
fn split_exe_and_args(cmd: &str) -> Option<(String, String)> {
    let s = cmd.trim_start();
    let (exe, rest) = if let Some(r) = s.strip_prefix('"') {
        let end = r.find('"')?;
        (r[..end].to_string(), r[end + 1..].trim_start().to_string())
    } else {
        match s.find(char::is_whitespace) {
            Some(i) => (s[..i].to_string(), s[i..].trim_start().to_string()),
            None => (s.to_string(), String::new()),
        }
    };
    if exe.is_empty() {
        return None;
    }
    // Убираем висячие кавычки в конце (напр. после удаления --demo)
    let rest = rest.trim_end_matches('"').trim_end().to_string();
    Some((exe, rest))
}

fn get_game_dir(cmd: &str) -> Option<String> {
    let re_quoted = Regex::new(r#"--gameDir\s+"([^"]+)""#).unwrap();
    if let Some(caps) = re_quoted.captures(cmd) {
        return Some(caps.get(1).unwrap().as_str().to_string());
    }
    let v = get_param_value(cmd, "--gameDir");
    if v.is_empty() || v == "Н/Д" {
        None
    } else {
        Some(v)
    }
}

fn get_formatted_ram(cmd: &str) -> String {
    let re = Regex::new(r"-Xmx(\d+)([GMgm])").unwrap();
    if let Some(caps) = re.captures(cmd) {
        let val: u32 = caps.get(1).unwrap().as_str().parse().unwrap_or(4);
        let unit = caps.get(2).unwrap().as_str().to_uppercase();
        if unit == "M" {
            if val % 1024 == 0 {
                format!("{} GB", val / 1024)
            } else {
                format!("{} MB", val)
            }
        } else {
            format!("{} GB", val)
        }
    } else {
        "4 GB".to_string()
    }
}

fn parse_ram_gb(cmd: &str) -> u32 {
    let re = Regex::new(r"-Xmx(\d+)([GMgm])").unwrap();
    if let Some(caps) = re.captures(cmd) {
        let val: u32 = caps.get(1).unwrap().as_str().parse().unwrap_or(4);
        let unit = caps.get(2).unwrap().as_str().to_uppercase();
        if unit == "M" {
            (val / 1024).max(1)
        } else {
            val
        }
    } else {
        4
    }
}

fn set_ram_in_cmd(cmd: &str, gb: u32) -> String {
    let re = Regex::new(r"-Xmx\S+").unwrap();
    if re.is_match(cmd) {
        re.replace_all(cmd, &format!("-Xmx{}G", gb)).to_string()
    } else {
        format!("{} -Xmx{}G", cmd.trim(), gb)
    }
}

fn capture_launcher_command() -> Option<String> {
    #[cfg(windows)]
    {
        let script = "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^java' -and $_.CommandLine -match '--gameDir' } | ForEach-Object { $_.CommandLine }";
        let out = Command::new("powershell")
            .args(["-NoProfile", "-Command", script])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .ok()?;
        let text = String::from_utf8_lossy(&out.stdout).to_string();
        for line in text.lines() {
            if line.contains("--gameDir") {
                return Some(clean_raw_config(line));
            }
        }
    }
    None
}

// ---------------- Tauri commands ----------------

#[derive(Debug, Serialize, Clone)]
struct ConfigInfo {
    raw_empty: bool,
    profile: String,
    nickname: String,
    version: String,
    ram: String,
    uuid: String,
    java: String,
    game_dir: String,
    assets_dir: String,
}

#[tauri::command]
fn get_state() -> Result<LauncherState, String> {
    let mut state = LauncherState::load();
    state.ram = parse_ram_gb(&state.raw_config).max(1);
    Ok(state)
}

#[tauri::command]
fn get_config_info() -> Result<ConfigInfo, String> {
    let state = LauncherState::load();
    let cmd = &state.raw_config;
    let raw_empty = cmd.trim().is_empty();
    let profile = if state.active_profile.is_empty()
        || !state.profiles.contains(&state.active_profile)
    {
        "не выбран".to_string()
    } else {
        state.active_profile.clone()
    };
    let java = get_java_path(cmd).unwrap_or_else(|| "Н/Д".to_string());
    let game_dir = get_game_dir(cmd).unwrap_or_else(|| "Н/Д".to_string());
    let assets = get_param_value(cmd, "--assetsDir");
    let assets = if assets.is_empty() || assets == "Н/Д" {
        "Н/Д".to_string()
    } else {
        assets
    };
    let version = get_param_value(cmd, "--version");
    let version = if version.is_empty() || version == "Н/Д" {
        "—".to_string()
    } else {
        version
    };
    let uuid = get_param_value(cmd, "--uuid");
    let uuid = if uuid.is_empty() || uuid == "Н/Д" {
        "—".to_string()
    } else {
        uuid
    };

    Ok(ConfigInfo {
        raw_empty,
        profile,
        nickname: state.nickname,
        ram: get_formatted_ram(cmd),
        version,
        uuid,
        java,
        game_dir,
        assets_dir: assets,
    })
}

#[tauri::command]
fn set_nickname(nickname: String) -> Result<LauncherState, String> {
    let mut state = LauncherState::load();
    state.nickname = nickname;
    state.save()?;
    Ok(state)
}

#[tauri::command]
fn set_discord(enabled: bool) -> Result<LauncherState, String> {
    let mut state = LauncherState::load();
    state.discord_rpc = enabled;
    if enabled {
        // Переподключаемся, если тумблер включили при открытом лаунчере
        discord_rpc::start_menu();
    } else {
        discord_rpc::stop();
    }
    state.save()?;
    Ok(state)
}

#[tauri::command]
fn set_ram(ram: u32) -> Result<LauncherState, String> {
    let mut state = LauncherState::load();
    if state.raw_config.trim().is_empty() {
        return Err("Конфиг пуст. Сначала вставьте конфигурацию.".to_string());
    }
    state.raw_config = set_ram_in_cmd(&state.raw_config, ram);
    state.ram = ram;
    // Сохраняем обновлённый конфиг в профиле
    if !state.active_profile.is_empty() {
        if let Some(cfg) = state.profile_configs.get_mut(&state.active_profile) {
            *cfg = state.raw_config.clone();
        }
    }
    state.save()?;
    Ok(state)
}

#[tauri::command]
fn paste_config(name: String, raw: String) -> Result<LauncherState, String> {
    let mut state = LauncherState::load();
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Укажите название профиля.".to_string());
    }
    let cleaned = clean_raw_config(&raw);
    if cleaned.is_empty() {
        return Err("Конфиг пуст.".to_string());
    }
    if !state.profiles.contains(&name) {
        state.profiles.push(name.clone());
        state.profiles.sort();
    }
    state.profile_configs.insert(name.clone(), cleaned.clone());
    state.active_profile = name;
    state.raw_config = cleaned;
    state.ram = parse_ram_gb(&state.raw_config).max(1);
    state.save()?;
    Ok(state)
}

#[tauri::command]
fn activate_profile(name: String) -> Result<LauncherState, String> {
    let mut state = LauncherState::load();
    if let Some(cfg) = state.profile_configs.get(&name) {
        state.raw_config = cfg.clone();
        state.active_profile = name;
        state.ram = parse_ram_gb(&state.raw_config).max(1);
        state.save()?;
        return Ok(state);
    }
    Err("Профиль не найден.".to_string())
}

#[tauri::command]
fn rename_profile(old_name: String, new_name: String) -> Result<LauncherState, String> {
    let mut state = LauncherState::load();
    let new_name = new_name.trim().to_string();
    if !state.profiles.contains(&old_name) || new_name.is_empty() {
        return Ok(state);
    }
    // Защита от дубликатов и потери данных
    if new_name != old_name && state.profiles.iter().any(|p| p == &new_name) {
        return Err("Профиль с таким названием уже существует.".to_string());
    }
    if let Some(pos) = state.profiles.iter().position(|p| p == &old_name) {
        state.profiles[pos] = new_name.clone();
    }
    state.profiles.sort();
    if let Some(cfg) = state.profile_configs.remove(&old_name) {
        state.profile_configs.insert(new_name.clone(), cfg);
    }
    if state.active_profile == old_name {
        state.active_profile = new_name;
    }
    state.save()?;
    Ok(state)
}

#[tauri::command]
fn delete_profile(name: String) -> Result<LauncherState, String> {
    let mut state = LauncherState::load();
    state.profiles.retain(|p| p != &name);
    state.profile_configs.remove(&name);
    // Если удалён активный профиль — переключаемся на первый оставшийся
    if state.active_profile == name {
        if let Some(next) = state.profiles.first() {
            state.active_profile = next.clone();
            state.raw_config = state
                .profile_configs
                .get(next)
                .cloned()
                .unwrap_or_default();
            state.ram = parse_ram_gb(&state.raw_config).max(1);
        } else {
            state.active_profile = String::new();
            state.raw_config = String::new();
            state.ram = 4;
        }
    }
    state.save()?;
    Ok(state)
}

#[tauri::command]
fn capture_config() -> Result<String, String> {
    capture_launcher_command().ok_or_else(|| "Процесс Minecraft не найден.".to_string())
}

#[tauri::command]
fn launch_game(app: tauri::AppHandle) -> Result<u32, String> {
    // Если игра уже запущена — не запускаем повторно
    let already_running = GAME
        .lock()
        .unwrap()
        .as_mut()
        .map(|c| c.try_wait().ok().flatten().is_none())
        .unwrap_or(false);
    if already_running {
        return Err("Minecraft уже запущена.".to_string());
    }

    let state = LauncherState::load();
    if state.raw_config.trim().is_empty() {
        return Err("Конфиг пуст. Сначала вставьте или захватите конфигурацию.".to_string());
    }
    if state.active_profile.is_empty() {
        return Err("Профиль не выбран.".to_string());
    }

    let final_cmd = fix_and_patch_command(&state.raw_config, &state.nickname);
    let (java_path, rest) = split_exe_and_args(&final_cmd)
        .ok_or_else(|| "Не удалось определить путь к Java.".to_string())?;

    if !PathBuf::from(&java_path).is_file() {
        return Err(format!("Java не найдена: {}", java_path));
    }

    let cwd = get_game_dir(&final_cmd)
        .map(PathBuf::from)
        .filter(|d| d.is_dir())
        .unwrap_or_else(data_dir);

    #[cfg(windows)]
    let mut cmd = {
        let mut c = Command::new(&java_path);
        c.raw_arg(&rest);
        c.current_dir(&cwd);
        c.creation_flags(CREATE_NO_WINDOW);
        c.stdout(Stdio::piped());
        c.stderr(Stdio::piped());
        c
    };
    #[cfg(not(windows))]
    let mut cmd = {
        let mut c = Command::new(&java_path);
        c.arg(&rest);
        c.current_dir(&cwd);
        c.stdout(Stdio::piped());
        c.stderr(Stdio::piped());
        c
    };

    let mut child = cmd.spawn().map_err(|e| format!("Ошибка запуска Java: {}", e))?;
    let pid = child.id();

    // Стримим stdout/stderr игры в событие game-log
    if let Some(mut out) = child.stdout.take() {
        let app_clone = app.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(&mut out);
            for line in reader.lines() {
                if let Ok(l) = line {
                    if !l.trim().is_empty() {
                        let _ = app_clone.emit("game-log", l);
                    }
                }
            }
        });
    }
    if let Some(mut err) = child.stderr.take() {
        let app_clone = app.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(&mut err);
            for line in reader.lines() {
                if let Ok(l) = line {
                    if !l.trim().is_empty() {
                        let _ = app_clone.emit("game-log", l);
                    }
                }
            }
        });
    }

    *GAME.lock().unwrap() = Some(child);

    // Discord Rich Presence: статус + слежение за сервером в логе игры
    discord_rpc::start(cwd.clone());

    // Поток ожидания: следит за процессом через try_wait, НЕ забирает
    // child из GAME — иначе close_game не смог бы убить игру.
    let app_clone = app.clone();
    std::thread::spawn(move || {
        loop {
            let exited = {
                let mut g = GAME.lock().unwrap();
                match g.as_mut() {
                    Some(child) => child.try_wait().ok().flatten().is_some(),
                    None => true,
                }
            };
            if exited {
                let _ = GAME.lock().unwrap().take();
                discord_rpc::back_to_menu();
                let _ = app_clone.emit("game-exited", ());
                return;
            }
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
    });

    Ok(pid)
}

#[tauri::command]
fn open_game_dir() -> Result<String, String> {
    let state = LauncherState::load();
    let dir = get_game_dir(&state.raw_config).map(PathBuf::from).filter(|d| d.is_dir());
    let dir = dir
        .or_else(|| {
            let alt = PathBuf::from(std::env::var("APPDATA").unwrap_or_default()).join(".minecraft");
            if alt.is_dir() {
                Some(alt)
            } else {
                None
            }
        })
        .ok_or_else(|| "Папка игры не найдена.".to_string())?;

    #[cfg(windows)]
    Command::new("explorer")
        .arg(&dir)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Не удалось открыть папку: {}", e))?;

    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
fn close_game() -> Result<bool, String> {
    // Забираем child сразу, чтобы не блокировать поток ожидания.
    // wait() не вызываем: TerminateProcess убивает мгновенно, а ожидание
    // может зависнуть, если процесс не отдаёт хендл завершения.
    let child = GAME.lock().unwrap().take();
    if let Some(mut child) = child {
        let _ = child.kill();
        Ok(true)
    } else {
        Ok(false)
    }
}

#[tauri::command]
fn cancel_launch() -> Result<bool, String> {
    // Отмена запуска: мгновенно убиваем только что запущенный процесс игры
    let child = GAME.lock().unwrap().take();
    if let Some(mut child) = child {
        let _ = child.kill();
        Ok(true)
    } else {
        Ok(false)
    }
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    // Мгновенно убиваем игру и сразу завершаем процесс лаунчера.
    if let Some(mut child) = GAME.lock().unwrap().take() {
        let _ = child.kill();
    }
    app.exit(0);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_real_config_flow() {
        let dir = std::env::var("APPDATA").expect("APPDATA");
        let path = PathBuf::from(&dir).join("mclauncher/mclauncher.json");
        let raw = fs::read_to_string(&path).expect("config file");
        let v: serde_json::Value = serde_json::from_str(&raw).expect("parse");
        let cmd = v["raw_config"].as_str().expect("raw_config");

        let final_cmd = fix_and_patch_command(cmd, "AisFelix");
        let (exe, rest) = split_exe_and_args(&final_cmd).expect("split");

        assert!(exe.ends_with("java.exe"), "exe = {exe}");
        assert!(PathBuf::from(&exe).is_file(), "java exists: {exe}");
        assert!(!rest.starts_with('"'), "rest starts with quote");
        assert!(!rest.contains("--demo"), "demo still present");
        assert!(rest.contains("--accessToken null"), "accessToken null");
        assert!(rest.contains("--username AisFelix"), "username patched");
        println!("EXE: {exe}\nREST[:300]: {}", &rest[..rest.len().min(300)]);
    }
}

// ── Автообновление через GitHub Releases ─────────────────────────────
const GITHUB_API: &str = "https://api.github.com/repos/on1felix/MCLauncher.exe/releases/latest";

#[derive(Serialize)]
pub struct UpdateInfo {
    pub current: String,
    pub latest: String,
    pub download_url: String,
    pub size: u64,
}

#[derive(Clone, Serialize)]
pub struct UpdateProgress {
    pub downloaded: u64,
    pub total: u64,
    pub percent: f64,
    pub speed_mbps: f64,
}

fn parse_version(s: &str) -> Vec<u64> {
    s.split('.').filter_map(|p| p.parse::<u64>().ok()).collect()
}

fn is_newer_version(latest: &str, current: &str) -> bool {
    let mut lat = parse_version(latest);
    let mut cur = parse_version(current);
    let len = lat.len().max(cur.len());
    lat.resize(len, 0);
    cur.resize(len, 0);
    lat > cur
}

/// Проверка последнего релиза на GitHub
#[tauri::command]
async fn check_update(app: tauri::AppHandle) -> Result<Option<UpdateInfo>, String> {
    let client = reqwest::Client::new();
    let json: serde_json::Value = client
        .get(GITHUB_API)
        .header("User-Agent", "MCLauncher-Updater")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let tag = json["tag_name"].as_str().unwrap_or("");
    let latest = tag
        .replace("MCLauncher-", "")
        .replace("MCLauncher_", "")
        .trim_start_matches('v')
        .to_string();
    if latest.is_empty() {
        return Ok(None);
    }

    let current = app.package_info().version.to_string();
    if !is_newer_version(&latest, &current) {
        return Ok(None);
    }

    let mut download_url: Option<String> = None;
    let mut size = 0u64;
    if let Some(assets) = json["assets"].as_array() {
        for a in assets {
            if a["name"].as_str().unwrap_or("").ends_with(".exe") {
                download_url = a["browser_download_url"].as_str().map(String::from);
                size = a["size"].as_u64().unwrap_or(0);
                break;
            }
        }
    }
    match download_url {
        Some(url) => Ok(Some(UpdateInfo { current, latest, download_url: url, size })),
        None => Ok(None),
    }
}

/// Скачивание новой версии во временную папку с прогрессом
#[tauri::command]
async fn download_update(app: tauri::AppHandle, url: String) -> Result<String, String> {
    use std::io::Write;

    let client = reqwest::Client::new();
    let mut res = client
        .get(&url)
        .header("User-Agent", "MCLauncher-Updater")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let total = res.content_length().unwrap_or(0);

    let tmp = std::env::temp_dir().join("MCLauncher_update.exe");
    let mut file = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;

    let mut downloaded: u64 = 0;
    let mut last_time = std::time::Instant::now();
    let mut last_bytes: u64 = 0;
    let mut speed = 0.0f64;

    while let Some(chunk) = res.chunk().await.map_err(|e| e.to_string())? {
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;

        let elapsed = last_time.elapsed().as_secs_f64();
        if elapsed >= 0.25 {
            let instant = (downloaded - last_bytes) as f64 / elapsed / (1024.0 * 1024.0);
            speed = if speed == 0.0 { instant } else { speed * 0.7 + instant * 0.3 };
            last_time = std::time::Instant::now();
            last_bytes = downloaded;
            let _ = app.emit(
                "update-progress",
                UpdateProgress {
                    downloaded,
                    total,
                    percent: if total > 0 { downloaded as f64 / total as f64 * 100.0 } else { 0.0 },
                    speed_mbps: speed,
                },
            );
        }
    }
    file.flush().ok();
    drop(file);

    let _ = app.emit(
        "update-progress",
        UpdateProgress { downloaded, total, percent: 100.0, speed_mbps: speed },
    );
    Ok(tmp.to_string_lossy().into_owned())
}

/// Замена текущего exe на скачанный и перезапуск.
/// Скрытый bat-скрипт: дожидается закрытия приложения → удаляет старую версию →
/// перемещает скачанный файл на её место → запускает новую версию → удаляет себя.
#[tauri::command]
fn apply_update() -> Result<(), String> {
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let new_exe = std::env::temp_dir().join("MCLauncher_update.exe");
    if !new_exe.exists() {
        return Err("Файл обновления не найден".into());
    }
    let cur = std::env::current_exe().map_err(|e| format!("Не удалось определить путь: {}", e))?;
    let pid = std::process::id();

    let bat = std::env::temp_dir().join("mclauncher_update.bat");
    let script = String::from(
        "@echo off\r\n\
         setlocal\r\n\
         set /a TRIES=0\r\n\
         :wait_loop\r\n\
         tasklist /FI \"PID eq %1\" 2>NUL | find \"%1\" >NUL\r\n\
         if errorlevel 1 goto proc_dead\r\n\
         set /a TRIES+=1\r\n\
         if %TRIES% GEQ 30 goto force_kill\r\n\
         ping -n 2 127.0.0.1 >NUL\r\n\
         goto wait_loop\r\n\
         :force_kill\r\n\
         taskkill /F /PID %1 >NUL 2>&1\r\n\
         ping -n 3 127.0.0.1 >NUL\r\n\
         :proc_dead\r\n\
         ping -n 4 127.0.0.1 >NUL\r\n\
         del /f /q \"%2\"\r\n\
         if exist \"%2\" (\r\n\
           ping -n 4 127.0.0.1 >NUL\r\n\
           del /f /q \"%2\"\r\n\
         )\r\n\
         move /y \"%3\" \"%2\"\r\n\
         start \"\" \"%2\"\r\n\
         endlocal\r\n\
         (goto) 2>NUL & del /f /q \"%~f0\"\r\n",
    );
    std::fs::write(&bat, script).map_err(|e| format!("Не удалось создать скрипт обновления: {}", e))?;

    std::process::Command::new("cmd")
        .args([
            "/C",
            &bat.to_string_lossy(),
            &pid.to_string(),
            &cur.to_string_lossy(),
            &new_exe.to_string_lossy(),
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Не удалось запустить обновление: {}", e))?;
    std::process::exit(0);
}

// ── Modrinth: поиск и установка модов/ресурспаков ────────────────────
const MODRINTH_API: &str = "https://api.modrinth.com/v2";

fn modrinth_client() -> reqwest::Client {
    reqwest::ClientBuilder::new()
        .user_agent("MCLauncher/1.2 (+https://github.com/on1felix/MCLauncher.exe)")
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

#[derive(Debug, Serialize, Clone)]
struct SearchHit {
    project_id: String,
    slug: String,
    title: String,
    description: String,
    author: String,
    icon_url: String,
    downloads: u64,
    follows: u64,
    categories: Vec<String>,
}

#[derive(Debug, Serialize)]
struct SearchResult {
    hits: Vec<SearchHit>,
    total: u64,
}

#[derive(Debug, Serialize, Clone)]
struct ModVersion {
    id: String,
    version_number: String,
    game_versions: Vec<String>,
    loaders: Vec<String>,
    date_published: String,
    file_name: String,
    file_url: String,
    file_size: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct InstalledItem {
    version_id: String,
    project_id: String,
    title: String,
    kind: String,
    file_name: String,
    path: String,
    version_number: String,
    installed_at: u64,
}

#[derive(Clone, Serialize)]
struct InstallProgress {
    project_id: String,
    percent: f64,
}

fn installed_file() -> PathBuf {
    data_dir().join("installed_content.json")
}

fn load_installed() -> Vec<InstalledItem> {
    let f = installed_file();
    if !f.exists() {
        return Vec::new();
    }
    fs::read_to_string(&f)
        .ok()
        .and_then(|d| serde_json::from_str(&d).ok())
        .unwrap_or_default()
}

fn save_installed(items: &[InstalledItem]) -> Result<(), String> {
    let dir = data_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(
        installed_file(),
        serde_json::to_string_pretty(items).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

/// Папка игры: --gameDir из активного профиля, иначе %APPDATA%/.minecraft
fn resolve_game_dir() -> PathBuf {
    let state = LauncherState::load();
    if !state.raw_config.is_empty() {
        if let Some(d) = get_game_dir(&state.raw_config) {
            let p = PathBuf::from(&d);
            if p.is_dir() {
                return p;
            }
        }
    }
    PathBuf::from(std::env::var("APPDATA").unwrap_or_default()).join(".minecraft")
}

/// Основной файл версии (primary, либо первый)
fn pick_file(v: &serde_json::Value) -> Option<(String, String, u64)> {
    let files = v["files"].as_array()?;
    let f = files
        .iter()
        .find(|f| f["primary"].as_bool().unwrap_or(false))
        .or_else(|| files.first())?;
    Some((
        f["filename"].as_str()?.to_string(),
        f["url"].as_str()?.to_string(),
        f["size"].as_u64().unwrap_or(0),
    ))
}

#[tauri::command]
async fn modrinth_search(
    query: String,
    project_type: String,
    game_version: String,
    offset: u32,
) -> Result<SearchResult, String> {
    let mut facets = format!("[[\"project_type:{}\"]]", project_type);
    if !game_version.is_empty() && game_version != "all" {
        facets = format!(
            "[[\"project_type:{}\"],[\"versions:{}\"]]",
            project_type, game_version
        );
    }

    let json: serde_json::Value = modrinth_client()
        .get(format!("{}/search", MODRINTH_API))
        .query(&[
            ("query", query.as_str()),
            ("limit", "20"),
            ("offset", &offset.to_string()),
            ("index", "relevance"),
            ("facets", facets.as_str()),
        ])
        .send()
        .await
        .map_err(|e| format!("Ошибка сети: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Ошибка ответа: {}", e))?;

    let total = json["total_hits"].as_u64().unwrap_or(0);
    let mut hits = Vec::new();
    if let Some(arr) = json["hits"].as_array() {
        for h in arr {
            hits.push(SearchHit {
                project_id: h["project_id"].as_str().unwrap_or("").to_string(),
                slug: h["slug"].as_str().unwrap_or("").to_string(),
                title: h["title"].as_str().unwrap_or("").to_string(),
                description: h["description"].as_str().unwrap_or("").to_string(),
                author: h["author"].as_str().unwrap_or("").to_string(),
                icon_url: h["icon_url"].as_str().unwrap_or("").to_string(),
                downloads: h["downloads"].as_u64().unwrap_or(0),
                follows: h["follows"].as_u64().unwrap_or(0),
                categories: h["display_categories"]
                    .as_array()
                    .map(|a| {
                        a.iter()
                            .filter_map(|c| c.as_str().map(String::from))
                            .collect()
                    })
                    .unwrap_or_default(),
            });
        }
    }
    Ok(SearchResult { hits, total })
}

#[derive(Debug, Clone, Serialize)]
struct GalleryItem {
    url: String,
    raw_url: String,
    title: String,
    description: String,
}

#[derive(Debug, Clone, Serialize)]
struct ProjectInfo {
    project_id: String,
    title: String,
    description: String,
    body: String,
    icon_url: String,
    downloads: u64,
    follows: u64,
    categories: Vec<String>,
    gallery: Vec<GalleryItem>,
}

/// Универсальный парсер объекта проекта.
/// Поиск отдаёт project_id/follows/display_categories, объекты проектов — id/followers/categories.
fn project_info_from_json(j: &serde_json::Value) -> ProjectInfo {
    ProjectInfo {
        project_id: j["project_id"]
            .as_str()
            .or_else(|| j["id"].as_str())
            .unwrap_or("")
            .to_string(),
        title: j["title"].as_str().unwrap_or("").to_string(),
        description: j["description"].as_str().unwrap_or("").to_string(),
        body: j["body"].as_str().unwrap_or("").to_string(),
        icon_url: j["icon_url"].as_str().unwrap_or("").to_string(),
        downloads: j["downloads"].as_u64().unwrap_or(0),
        follows: j["follows"]
            .as_u64()
            .or_else(|| j["followers"].as_u64())
            .unwrap_or(0),
        categories: j["display_categories"]
            .as_array()
            .or_else(|| j["categories"].as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|c| c.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default(),
        gallery: j["gallery"]
            .as_array()
            .map(|a| {
                a.iter()
                    .filter_map(|g| {
                        Some(GalleryItem {
                            url: g["url"].as_str()?.to_string(),
                            raw_url: g["raw_url"].as_str().unwrap_or("").to_string(),
                            title: g["title"].as_str().unwrap_or("").to_string(),
                            description: g["description"].as_str().unwrap_or("").to_string(),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default(),
    }
}

/// Полные данные проекта с Modrinth (для окна установки)
#[tauri::command]
async fn modrinth_project(project_id: String) -> Result<ProjectInfo, String> {
    let json: serde_json::Value = modrinth_client()
        .get(format!("{}/project/{}", MODRINTH_API, project_id))
        .send()
        .await
        .map_err(|e| format!("Ошибка сети: {}", e))?
        .error_for_status()
        .map_err(|e| format!("Ошибка ответа: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Ошибка разбора: {}", e))?;

    Ok(project_info_from_json(&json))
}

/// Данные нескольких проектов одним запросом (для списка установленного)
#[tauri::command]
async fn modrinth_projects(ids: Vec<String>) -> Result<Vec<ProjectInfo>, String> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let arr = serde_json::to_string(&ids).map_err(|e| e.to_string())?;
    let json: serde_json::Value = modrinth_client()
        .get(format!("{}/projects", MODRINTH_API))
        .query(&[("ids", arr.as_str())])
        .send()
        .await
        .map_err(|e| format!("Ошибка сети: {}", e))?
        .error_for_status()
        .map_err(|e| format!("Ошибка ответа: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Ошибка разбора: {}", e))?;

    let mut out = Vec::new();
    if let Some(list) = json.as_array() {
        for j in list {
            out.push(project_info_from_json(j));
        }
    }
    Ok(out)
}

#[derive(Debug, Serialize)]
struct LoaderTag {
    name: String,
    icon: String,
}

/// Список загрузчиков с Modrinth (/v2/tag/loader)
#[tauri::command]
async fn modrinth_loaders() -> Result<Vec<LoaderTag>, String> {
    let json: serde_json::Value = modrinth_client()
        .get(format!("{}/tag/loader", MODRINTH_API))
        .send()
        .await
        .map_err(|e| format!("Ошибка сети: {}", e))?
        .error_for_status()
        .map_err(|e| format!("Ошибка ответа: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Ошибка разбора: {}", e))?;

    let mut out = Vec::new();
    if let Some(arr) = json.as_array() {
        for v in arr {
            out.push(LoaderTag {
                name: v["name"].as_str().unwrap_or("").to_string(),
                icon: v["icon"].as_str().unwrap_or("").to_string(),
            });
        }
    }
    Ok(out)
}

/// Настройки раздела «Моды» (версия игры, загрузчик) — сохраняются между запусками
fn mods_prefs_file() -> PathBuf {
    data_dir().join("mods_prefs.json")
}

#[tauri::command]
fn get_mods_prefs() -> Result<serde_json::Value, String> {
    Ok(fs::read_to_string(mods_prefs_file())
        .ok()
        .and_then(|d| serde_json::from_str(&d).ok())
        .unwrap_or_else(|| serde_json::json!({})))
}

#[tauri::command]
fn set_mods_prefs(mc_version: String, loader: String) -> Result<(), String> {
    let dir = data_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let v = serde_json::json!({ "mc_version": mc_version, "loader": loader });
    fs::write(
        mods_prefs_file(),
        serde_json::to_string_pretty(&v).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

#[derive(Debug, Serialize)]
struct GameVersionTag {
    version: String,
    version_type: String,
    date: String,
}

/// Список версий игры с Modrinth (/v2/tag/game_version).
/// Данные обновляются автоматически по мере выхода новых версий Minecraft.
#[tauri::command]
async fn modrinth_game_versions() -> Result<Vec<GameVersionTag>, String> {
    let json: serde_json::Value = modrinth_client()
        .get(format!("{}/tag/game_version", MODRINTH_API))
        .send()
        .await
        .map_err(|e| format!("Ошибка сети: {}", e))?
        .error_for_status()
        .map_err(|e| format!("Ошибка ответа: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Ошибка разбора: {}", e))?;

    let mut out = Vec::new();
    if let Some(arr) = json.as_array() {
        for v in arr {
            out.push(GameVersionTag {
                version: v["version"].as_str().unwrap_or("").to_string(),
                version_type: v["version_type"].as_str().unwrap_or("").to_string(),
                date: v["date"].as_str().unwrap_or("").to_string(),
            });
        }
    }
    Ok(out)
}

#[tauri::command]
async fn modrinth_versions(
    project_id: String,
    game_version: String,
) -> Result<Vec<ModVersion>, String> {
    // Внимание: у Modrinth эндпоинт /project/{id}/version (в единственном числе)
    let json: serde_json::Value = modrinth_client()
        .get(format!("{}/project/{}/version", MODRINTH_API, project_id))
        .send()
        .await
        .map_err(|e| format!("Ошибка сети: {}", e))?
        .error_for_status()
        .map_err(|e| format!("Ошибка ответа: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Ошибка разбора: {}", e))?;

    let mut out = Vec::new();
    if let Some(arr) = json.as_array() {
        for v in arr {
            let gv: Vec<String> = v["game_versions"]
                .as_array()
                .map(|a| {
                    a.iter()
                        .filter_map(|x| x.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default();
            // Фильтр по выбранной версии игры
            if !game_version.is_empty() && game_version != "all" && !gv.contains(&game_version) {
                continue;
            }
            let (file_name, file_url, file_size) = match pick_file(v) {
                Some(x) => x,
                None => continue,
            };
            out.push(ModVersion {
                id: v["id"].as_str().unwrap_or("").to_string(),
                version_number: v["version_number"].as_str().unwrap_or("").to_string(),
                loaders: v["loaders"]
                    .as_array()
                    .map(|a| {
                        a.iter()
                            .filter_map(|x| x.as_str().map(String::from))
                            .collect()
                    })
                    .unwrap_or_default(),
                date_published: v["date_published"].as_str().unwrap_or("").to_string(),
                game_versions: gv,
                file_name,
                file_url,
                file_size,
            });
        }
    }
    Ok(out)
}

/// Скачивание мода/ресурспака в папку игры и запись в installed_content.json
#[tauri::command]
async fn install_modrinth(
    app: tauri::AppHandle,
    project_id: String,
    title: String,
    kind: String,
    version_id: String,
    version_number: String,
    file_name: String,
    file_url: String,
) -> Result<InstalledItem, String> {
    use std::io::Write;

    let subdir = match kind.as_str() {
        "resourcepack" => "resourcepacks",
        "shader" => "shaderpacks",
        _ => "mods",
    };
    let target_dir = resolve_game_dir().join(subdir);
    fs::create_dir_all(&target_dir).map_err(|e| format!("Не удалось создать папку: {}", e))?;
    let dest = target_dir.join(&file_name);

    let mut res = modrinth_client()
        .get(&file_url)
        .send()
        .await
        .map_err(|e| format!("Ошибка скачивания: {}", e))?;
    if !res.status().is_success() {
        return Err(format!("Сервер вернул статус {}", res.status()));
    }
    let total = res.content_length().unwrap_or(0);

    let mut file = std::fs::File::create(&dest)
        .map_err(|e| format!("Не удалось создать файл: {}", e))?;
    let mut downloaded: u64 = 0;
    while let Some(chunk) = res.chunk().await.map_err(|e| e.to_string())? {
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        if total > 0 {
            let _ = app.emit(
                "mod-install-progress",
                InstallProgress {
                    project_id: project_id.clone(),
                    percent: downloaded as f64 / total as f64 * 100.0,
                },
            );
        }
    }
    file.flush().ok();
    drop(file);

    let item = InstalledItem {
        version_id,
        project_id: project_id.clone(),
        title,
        kind,
        file_name,
        path: dest.to_string_lossy().into_owned(),
        version_number,
        installed_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64,
    };

    let mut items = load_installed();
    // Обновление: удаляем старые файлы этой же модификации, если имя изменилось
    let prev: Vec<InstalledItem> = items
        .iter()
        .filter(|x| x.project_id == item.project_id && x.kind == item.kind)
        .cloned()
        .collect();
    for p in prev {
        if p.path != item.path {
            let _ = fs::remove_file(&p.path);
        }
    }
    items.retain(|x| !(x.project_id == item.project_id && x.kind == item.kind));
    items.insert(0, item.clone());
    save_installed(&items)?;

    let _ = app.emit(
        "mod-install-progress",
        InstallProgress { project_id, percent: 100.0 },
    );
    Ok(item)
}

/// Список установленного через лаунчер (записи с удалёнными файлами чистятся)
#[tauri::command]
fn get_installed() -> Result<Vec<InstalledItem>, String> {
    let items = load_installed();
    let (kept, removed): (Vec<_>, Vec<_>) = items
        .into_iter()
        .partition(|i| PathBuf::from(&i.path).exists());
    if !removed.is_empty() {
        save_installed(&kept)?;
    }
    Ok(kept)
}

// ---------- Встроенные моды клиента (поставляются с лаунчером) ----------

#[derive(Debug, Clone, Serialize)]
struct BuiltinMod {
    id: String,
    title: String,
    description: String,
    author: String,
    version_number: String,
    mc_versions: Vec<String>,
    file_name: String,
    installed: bool,
}

/// Путь к файлу ресурса: рядом с exe (ресурс бандла), иначе в исходниках src-tauri/resources
fn resource_path(rel: &str) -> Option<PathBuf> {
    if let Ok(exe) = std::env::current_exe() {
        let p = exe.parent()?.join("resources").join(rel);
        if p.is_file() {
            return Some(p);
        }
    }
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources").join(rel);
    if dev.is_file() {
        return Some(dev);
    }
    None
}

const BUILTIN_MOD_JAR: &str = "betthernear-1.12.8.jar";

fn builtin_mod_defs() -> Vec<(String, String, String, String, Vec<String>, &'static str)> {
    vec![(
        "Better Near".to_string(),
        "Shows nearby players in a compact HUD panel with avatars, names and distance."
            .to_string(),
        "on1felix".to_string(),
        "1.12.8".to_string(),
        vec!["1.21.1".to_string()],
        BUILTIN_MOD_JAR,
    )]
}

#[tauri::command]
fn get_builtin_mods() -> Result<Vec<BuiltinMod>, String> {
    let mods_dir = resolve_game_dir().join("mods");
    let mut out = Vec::new();
    for (title, desc, author, ver, mc_versions, jar) in builtin_mod_defs() {
        let _jar_res =
            resource_path(jar).ok_or_else(|| format!("Ресурс {} не найден", jar))?;
        let dest = mods_dir.join(jar);
        out.push(BuiltinMod {
            id: format!("builtin-{}", jar.trim_end_matches(".jar")),
            title,
            description: desc,
            author,
            version_number: ver,
            mc_versions,
            file_name: jar.to_string(),
            installed: dest.is_file(),
        });
    }
    Ok(out)
}

/// Вкл/выкл встроенного мода: копируем jar из ресурсов в mods или удаляем оттуда
#[tauri::command]
fn set_builtin_mod(id: String, enabled: bool) -> Result<bool, String> {
    let defs = builtin_mod_defs();
    let def = defs
        .iter()
        .find(|(_, _, _, _, _, jar)| format!("builtin-{}", jar.trim_end_matches(".jar")) == id)
        .ok_or("Встроенный мод не найден.")?;

    let jar = def.5;
    let target_dir = resolve_game_dir().join("mods");
    fs::create_dir_all(&target_dir).map_err(|e| format!("Не удалось создать папку: {}", e))?;
    let dest = target_dir.join(jar);

    if !enabled {
        // Пока игра запущена, jar может быть занят процессом Java
        fs::remove_file(&dest).map_err(|_| {
            "Не удалось выключить мод: файл занят игрой. Закройте Minecraft и попробуйте снова."
                .to_string()
        })?;
        let mut items = load_installed();
        items.retain(|x| !(x.project_id == id && x.kind == "client"));
        save_installed(&items)?;
        return Ok(false);
    }

    // Старые версии этого мода (с другим номером) убираем
    if let Ok(rd) = fs::read_dir(&target_dir) {
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            if name.starts_with("betthernear-") && name.ends_with(".jar") && name != jar {
                let _ = fs::remove_file(e.path());
            }
        }
    }

    let src = resource_path(jar).ok_or_else(|| format!("Ресурс {} не найден", jar))?;
    fs::copy(&src, &dest).map_err(|e| format!("Не удалось скопировать: {}", e))?;

    let item = InstalledItem {
        version_id: id.clone(),
        project_id: id.clone(),
        title: def.0.clone(),
        kind: "client".to_string(),
        file_name: jar.to_string(),
        path: dest.to_string_lossy().into_owned(),
        version_number: def.3.clone(),
        installed_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64,
    };

    let mut items = load_installed();
    items.retain(|x| !(x.project_id == item.project_id && x.kind == item.kind));
    items.insert(0, item.clone());
    save_installed(&items)?;
    Ok(true)
}

/// Удаление установленного файла по id версии
#[tauri::command]
fn uninstall_content(version_id: String) -> Result<Vec<InstalledItem>, String> {
    let items = load_installed();
    let mut kept = Vec::new();
    for i in items {
        if i.version_id == version_id {
            let _ = fs::remove_file(&i.path);
        } else {
            kept.push(i);
        }
    }
    save_installed(&kept)?;
    Ok(kept)
}

#[derive(Debug, Serialize)]
struct GameFile {
    file_name: String,
    path: String,
    kind: String,
    size: u64,
    modified: u64,
    from_launcher: bool,
}

/// Суммарный размер папки (рекурсивно)
fn dir_size(p: &std::path::Path) -> u64 {
    let mut total = 0u64;
    if let Ok(rd) = fs::read_dir(p) {
        for e in rd.flatten() {
            if let Ok(m) = e.metadata() {
                if m.is_dir() {
                    total += dir_size(&e.path());
                } else {
                    total += m.len();
                }
            }
        }
    }
    total
}

/// Все файлы в папках mods, shaderpacks и resourcepacks игры.
/// Файлы, установленные через лаунчер, помечаются from_launcher.
#[tauri::command]
fn list_game_files() -> Result<Vec<GameFile>, String> {
    let base = resolve_game_dir();
    // Пути сравниваем без учёта регистра (Windows)
    let launcher_paths: Vec<String> = load_installed()
        .into_iter()
        .map(|i| i.path.to_lowercase())
        .collect();
    let mut out = Vec::new();
    for (kind, subdir) in [
        ("mod", "mods"),
        ("shader", "shaderpacks"),
        ("resourcepack", "resourcepacks"),
    ] {
        let dir = base.join(subdir);
        let rd = match fs::read_dir(&dir) {
            Ok(r) => r,
            Err(_) => continue,
        };
        for entry in rd.flatten() {
            let p = entry.path();
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            let name = entry.file_name().to_string_lossy().into_owned();
            if kind == "shader" {
                // Шейдерпаки — это папки или архивы (zip/jar).
                // Файлы рядом (*.txt/*.json) — это настройки пака, не сам пак.
                if meta.is_file() {
                    let lower = name.to_lowercase();
                    if !lower.ends_with(".zip") && !lower.ends_with(".jar") {
                        continue;
                    }
                }
            } else if meta.is_dir() {
                continue;
            }
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            let ps = p.to_string_lossy().to_string();
            out.push(GameFile {
                file_name: name,
                path: ps.clone(),
                kind: kind.to_string(),
                size: if meta.is_dir() { dir_size(&p) } else { meta.len() },
                modified,
                from_launcher: launcher_paths.contains(&ps.to_lowercase()),
            });
        }
    }
    // Свежие сверху: сортируем по дате изменения файла (время установки/копирования)
    out.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(out)
}

/// Удаление файла или папки из папки игры (+ чистка записи лаунчера, если была)
#[tauri::command]
fn delete_game_file(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err("Элемент не найден.".to_string());
    }
    let remove = if p.is_dir() {
        fs::remove_dir_all(&p)
    } else {
        fs::remove_file(&p)
    };
    remove.map_err(|e| format!("Не удалось удалить: {}", e))?;
    let mut items = load_installed();
    let before = items.len();
    items.retain(|i| i.path != path);
    if items.len() != before {
        save_installed(&items)?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Второй запуск — показываем и фокусируем уже открытое окно
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .setup(|app| {
            // Удаляем старую версию после автообновления.
            // Старый процесс может ещё держать файл — пробуем в фоне с ретраями
            if let Ok(cur) = std::env::current_exe() {
                let old = cur.with_file_name("MCLauncher_old.exe");
                if old.exists() {
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(1500));
                        for _ in 0..30 {
                            match std::fs::remove_file(&old) {
                                Ok(_) => break,
                                Err(_) => std::thread::sleep(std::time::Duration::from_millis(500)),
                            }
                        }
                    });
                }
            }
            // Окно скрыто при старте — показываем, когда фронтенд прогрузился
            let window = app.get_webview_window("main").expect("main window");
            let w2 = window.clone();
            app.listen("app-ready", move |_| {
                let _ = w2.show();
            });
            // Страховка: показать окно в любом случае
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(6));
                let _ = window.show();
            });
            // Discord Rich Presence: активность лаунчера
            discord_rpc::start_menu();
            Ok(())
        })
        .on_window_event(|window, event| {
            // Если игра запущена — перехватываем закрытие окна
            if let WindowEvent::CloseRequested { api, .. } = event {
                let running = GAME
                    .lock()
                    .unwrap()
                    .as_mut()
                    .map(|c| c.try_wait().ok().flatten().is_none())
                    .unwrap_or(false);
                if running {
                    api.prevent_close();
                    let _ = window.emit("close-requested", ());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_state,
            get_config_info,
            set_nickname,
            set_ram,
            set_discord,
            paste_config,
            activate_profile,
            rename_profile,
            delete_profile,
            capture_config,
            launch_game,
            close_game,
            cancel_launch,
            quit_app,
            open_game_dir,
            fetch_skin,
            check_update,
            download_update,
            apply_update,
            modrinth_search,
            modrinth_project,
            modrinth_projects,
            modrinth_game_versions,
            modrinth_loaders,
            get_mods_prefs,
            set_mods_prefs,
            get_builtin_mods,
            set_builtin_mod,
            modrinth_versions,
            install_modrinth,
            get_installed,
            uninstall_content,
            list_game_files,
            delete_game_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
