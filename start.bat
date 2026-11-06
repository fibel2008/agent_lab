@echo off
chcp 65001 >nul
cd /d "%~dp0"
set ASSISTANT_OPEN_BROWSER=1
".\.venv\Scripts\python.exe" -m Assistant
if errorlevel 1 pause
