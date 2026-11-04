@echo off
cd /d "%~dp0"
title CDE Web - Sushi Boulevard

rem O sistema tem UM servidor so, neste PC. A pasta chega aos outros PCs pelo
rem OneDrive; se cada um subisse o proprio servidor, cada um gravaria na sua
rem copia dos dados e um nao veria o que o outro lancou (e o OneDrive ainda
rem criaria arquivos de conflito, como pedidos-COMPRADORSB.json).
set SERVIDOR=DESKTOP-LC0FQC1

if /i not "%COMPUTERNAME%"=="%SERVIDOR%" (
    start "" "http://%SERVIDOR%:8935"
    exit /b
)

netstat -an | findstr ":8935" | findstr "LISTENING" >nul
if not errorlevel 1 (
    start "" "http://localhost:8935"
    exit /b
)

start "" /min cmd /c "python server.py"
ping -n 3 127.0.0.1 >nul
start "" "http://localhost:8935"
