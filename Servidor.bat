@echo off
cd /d "%~dp0"
title Servidor do CDE Web - NAO FECHE ESTA JANELA

rem Servidor so no PC do servidor: veja o comentario no Abrir.bat.
set SERVIDOR=DESKTOP-LC0FQC1

if /i not "%COMPUTERNAME%"=="%SERVIDOR%" (
    echo Este PC nao e o servidor do CDE Web.
    echo Use o endereco http://%SERVIDOR%:8935 no navegador.
    echo Rodar um servidor aqui separaria os dados deste PC dos demais.
    pause
    exit /b
)

netstat -an | findstr ":8935" | findstr "LISTENING" >nul
if not errorlevel 1 (
    echo O servidor ja estava rodando. Nada a fazer.
    ping -n 4 127.0.0.1 >nul
    exit /b
)

python --version >nul 2>&1
if errorlevel 1 (
    echo Python nao encontrado. Instale o Python e tente de novo.
    pause
    exit /b
)

python server.py
pause
