@echo off
rem Adds invented demo data (branches, people, attendance, payroll, tasks, messages) to try the system.
rem For the test computer only: never run it on the company's real server.
if not "%~1"=="run" (
  cmd /k ""%~f0" run"
  exit /b
)
chcp 65001 >nul
cd /d "%~dp0backend"
echo Adding demo data... (about half a minute)
cmd /c php artisan migrate --force
cmd /c php artisan app:demo
echo.
echo Demo accounts use the password 123456  (for example: hr.demo, mgmt.demo, camp2.manager, camp2.t1)
goto :eof
