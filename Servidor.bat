@echo off
cd /d "%~dp0"
title Servidor do CDE Web - NAO FECHE ESTA JANELA

netstat -an | findstr ":8935" | findstr "LISTENING" >nul
if not errorlevel 1 (
    echo O servidor ja estava rodando. Nada a fazer.
    ping -n 4 127.0.0.1 >nul
    exit /b
)

python --version >/dev/null 2>&1
if errorlevel 1 (
    echo Python nao encontrado. Instale o Python e tente de novo.
    pause
    exit /b
)

python server.py
pause
