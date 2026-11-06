@echo off
chcp 65001 >nul
cd /d "%~dp0"
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":8000 .*LISTENING"') do (
    taskkill /F /PID %%a >nul 2>nul
)
set ASSISTANT_OPEN_BROWSER=1
".\.venv\Scripts\python.exe" -m Assistant
if errorlevel 1 pause
