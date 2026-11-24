@echo off
setlocal
chcp 65001 >nul
title AF Office - start
cd /d "%~dp0"

echo.
echo ===== AF Office: update and start =====
echo.

echo [1/7] Getting the latest updates from GitHub...
git pull --ff-only
if errorlevel 1 (
  echo.
  echo ERROR: could not get the updates. Send a photo of this window.
  pause
  exit /b 1
)

echo [2/7] Settings file...
cd /d "%~dp0backend"
if not exist .env copy .env.example .env >nul
powershell -NoProfile -Command "$f='.env'; $c=Get-Content $f; $set=@{'DB_CONNECTION'='mysql';'DB_HOST'='127.0.0.1';'DB_PORT'='3306';'DB_DATABASE'='af_office';'DB_USERNAME'='root';'DB_PASSWORD'=''}; foreach($k in $set.Keys){ $line=$k+'='+$set[$k]; if($c -match ('^#?\s*'+$k+'=')){ $c=$c -replace ('^#?\s*'+$k+'=.*'),$line } else { $c+=$line } }; Set-Content $f $c"

echo [3/7] Server libraries (composer)...
call composer install --no-interaction
if errorlevel 1 goto failed

findstr /r /c:"^APP_KEY=base64" .env >nul
if errorlevel 1 php artisan key:generate --force

echo [4/7] Checking MySQL...
php -r "try { $p = new PDO('mysql:host=127.0.0.1;port=3306', 'root', ''); $p->exec('CREATE DATABASE IF NOT EXISTS af_office CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'); } catch (Exception $e) { exit(1); }"
if errorlevel 1 (
  echo.
  echo ERROR: MySQL is not running. Open Laragon, press "Start All", then run this file again.
  pause
  exit /b 1
)

echo [5/7] Database tables...
php artisan migrate --force
if errorlevel 1 goto failed

echo [6/7] Interface libraries (npm)...
cd /d "%~dp0frontend"
call npm install --no-audit --no-fund
if errorlevel 1 goto failed

echo [7/7] Starting...
start "AF Office - server (keep open)" /d "%~dp0backend" cmd /k php artisan serve
start "AF Office - interface (keep open)" /d "%~dp0frontend" cmd /k npm run dev
timeout /t 6 /nobreak >nul
start "" http://localhost:5173

echo.
echo Done. Two windows opened: keep them open while you work.
echo To stop the system, close those two windows.
echo.
pause
exit /b 0

:failed
echo.
echo ERROR: a step failed. Send a photo of this window.
pause
exit /b 1
