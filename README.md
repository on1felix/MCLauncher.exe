# MCLauncher

A GUI Minecraft launcher for Windows that runs on top of the official Minecraft Launcher. It captures the game's real launch command once, stores it as a profile, then starts Minecraft directly with your own nickname, RAM, mods and Discord Rich Presence — no official launcher window needed.

**Download:** [MCLauncher.exe (latest release)](https://github.com/on1felix/MCLauncher.exe/releases/latest/download/MCLauncher.exe)

Requires Minecraft itself, installed through the official Minecraft Launcher (at least one version launched once — the launcher needs its Java and game files).

## Features

- **Config capture** — finds the running Minecraft process (via `Win32_Process`) and saves its full Java launch command as a named profile. One click, nothing to copy.
- **Manual paste** — alternatively paste the command line copied from System Informer; it's cleaned automatically and saved as a profile.
- **Profiles** — each profile stores its own captured command (version + mods setup). Activate, rename and delete profiles; the active one is used for launch.
- **Nickname** — any offline nickname, patched into `--username` on every launch, with a live skin preview (fetched from the official Mojang API by nickname).
- **RAM allocation** — set memory in GB, rewritten right into the saved command (`-Xmx`).
- **Mods — Modrinth built in** — search the Modrinth catalog (mods, resource packs, shaders), filter by game version and loader (Forge / Fabric / …), view description and gallery, install with one click, manage installed content and uninstall.
- **Bundled mods** — three client mods for 1.21.1 ship with the launcher and toggle on/off into the `mods` folder: **Better Near** (nearby-players HUD), **Projectiles Trajectory Prediction** and **FantomCraft** (ghost recipe preview).
- **Game files manager** — browse the game folder's files with type, size and date; delete leftover files without opening Explorer.
- **Live game log** — the game's stdout/stderr streams into the built-in console with color highlighting; close or cancel the game from the launcher.
- **Discord Rich Presence** — shows "MCLauncher" in the menu and Minecraft session details in game (can be turned off).
- **Auto-update** — checks GitHub Releases on start, downloads the new version with a progress bar and applies it.
- **Quick access** — buttons to open the game directory and the mods folder.

## How to use

1. Install any Minecraft version through the official Minecraft Launcher and run the game once.
2. In MCLauncher press **Capture** (while the game runs) or paste a config manually.
3. Set the nickname and RAM, pick the profile — play.

Profiles and settings are stored in `%APPDATA%\mclauncher\state.json` and survive reinstalls.

## How it works

The official launcher builds a full `java ... --username ... --accessToken ...` command. MCLauncher reads that command, stores it, then replays it directly: `javaw` is swapped for `java` so the log can be streamed, the nickname is replaced, the access token is set to `null` (offline play) and the `--demo` flag is stripped. That is why the game version must already be downloaded by the official launcher — MCLauncher does not download game files itself.

Offline nicknames work in singleplayer and on offline-mode servers only.

## Tech

- **Backend:** Rust + Tauri 2 (single-instance), launches the game and streams its log, Modrinth API client, Mojang skin API, Discord IPC.
- **Frontend:** React 19 + TypeScript + Tailwind CSS + Zustand + framer-motion.
- **Build:** `build.bat` → `npx tauri build` (NSIS installer + raw `MCLauncher.exe`).

## Notes

- Windows 10/11, 64-bit.
- Some antiviruses may flag the unsigned `.exe` — false positive. The download comes only from official GitHub Releases.

---

By [on1felix](https://github.com/on1felix). Free, no ads, no telemetry.
Questions: Telegram [@On1Felix](https://t.me/On1Felix).
