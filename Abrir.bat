@echo off
cd /d "%~dp0"
title CDE Web - Sushi Boulevard

netstat -an | findstr ":8935" | findstr "LISTENING" >nul
if not errorlevel 1 (
    start "" "http://localhost:8935"
    exit /b
)

start "" /min cmd /c "python server.py"
ping -n 3 127.0.0.1 >nul
start "" "http://localhost:8935"
