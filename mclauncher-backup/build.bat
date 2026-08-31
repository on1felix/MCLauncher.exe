@echo off
setlocal
cd /d "%~dp0"

echo === MCLauncher manual build ===

rem 1. Close running launcher
taskkill /f /im MCLauncher.exe >nul 2>&1

rem 2. Rust toolchain: local folder next to backup, else the main project one
if exist "%~dp0..\rust-cargo\bin" (
  set "CARGO_HOME=%~dp0..\rust-cargo"
  set "RUSTUP_HOME=%~dp0..\rustup"
  set "PATH=%~dp0..\rust-cargo\bin;%PATH%"
) else if exist "F:\MCLuancher 2.0\rust-cargo\bin" (
  set "CARGO_HOME=F:\MCLuancher 2.0\rust-cargo"
  set "RUSTUP_HOME=F:\MCLuancher 2.0\rustup"
  set "PATH=F:\MCLuancher 2.0\rust-cargo\bin;%PATH%"
)

where cargo >nul 2>&1
if errorlevel 1 (
  echo [ERROR] cargo not found. Rust toolchain missing.
  goto :err
)

rem 3. Check node/npm
where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm not found in PATH. Install Node.js first.
  goto :err
)

rem 4. Install frontend dependencies if needed
if not exist "node_modules" (
  echo Installing npm dependencies...
  call npm install
  if errorlevel 1 goto :err
)

rem 5. Build (frontend + rust + nsis installer)
call npx tauri build
if errorlevel 1 goto :err

echo.
echo === DONE. Installer: src-tauri\target\release\bundle\nsis\ ===
echo === Raw exe:     src-tauri\target\release\MCLauncher.exe ===
exit /b 0

:err
echo.
echo === BUILD FAILED ===
exit /b 1
