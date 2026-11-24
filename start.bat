@echo off
rem Keep this window open whatever happens, so any error stays readable.
if not "%~1"=="run" (
  cmd /k ""%~f0" run"
  exit /b
)
chcp 65001 >nul
title AF Office - start
cd /d "%~dp0"
set LOG=%~dp0start-log.txt
echo AF Office start %date% %time% > "%LOG%"

echo.
echo ===== AF Office: update and start =====
echo (everything is also written to start-log.txt)
echo.

echo [1/7] Getting the latest updates from GitHub...
git checkout -- frontend/package-lock.json >> "%LOG%" 2>&1
git pull --ff-only >> "%LOG%" 2>&1
if errorlevel 1 goto pullfailed

echo [2/7] Settings and MySQL...
php tools\prepare.php >> "%LOG%" 2>&1
if errorlevel 2 goto nomysql
if errorlevel 1 goto failed

echo [3/7] Server libraries (composer), this can take a few minutes...
cd /d "%~dp0backend"
call composer install --no-interaction >> "%LOG%" 2>&1
if errorlevel 1 goto failed
findstr /r /c:"^APP_KEY=base64" .env >nul
if errorlevel 1 php artisan key:generate --force >> "%LOG%" 2>&1

echo [4/7] Database tables...
php artisan migrate --force >> "%LOG%" 2>&1
if errorlevel 1 goto failed

echo [5/7] Interface libraries (npm), this can take a few minutes...
cd /d "%~dp0frontend"
call npm install --no-audit --no-fund >> "%LOG%" 2>&1
if errorlevel 1 goto failed

echo [6/7] Starting the server and the interface...
start "AF Office - server - keep open" /d "%~dp0backend" cmd /k php artisan serve
start "AF Office - interface - keep open" /d "%~dp0frontend" cmd /k npm run dev

echo [7/7] Opening the browser...
timeout /t 8 /nobreak >nul
start "" http://localhost:5173

echo.
echo Done. Two new windows are open: keep them open while you work.
echo To stop the system, close those two windows.
echo You can close this window.
goto :eof

:pullfailed
echo.
echo ERROR: could not get the updates from GitHub.
echo Send a photo of this window, or send the file start-log.txt
type "%LOG%"
goto :eof

:nomysql
echo.
echo ERROR: MySQL is not running.
echo Open Laragon, press "Start All", then run start.bat again.
goto :eof

:failed
echo.
echo ERROR: a step failed. Send a photo of this window, or send the file start-log.txt
echo ---- last lines of the log ----
powershell -NoProfile -Command "Get-Content '%LOG%' -Tail 25"
goto :eof
