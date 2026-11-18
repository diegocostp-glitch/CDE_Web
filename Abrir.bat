@echo off
cd /d "%~dp0"
title CDE Web - Sushi Boulevard

rem O sistema tem UM servidor so, neste PC. A pasta chega aos outros PCs pelo
rem OneDrive; se cada um subisse o proprio servidor, cada um gravaria na sua
rem copia dos dados e um nao veria o que o outro lancou (e o OneDrive ainda
rem criaria arquivos de conflito, como pedidos-COMPRADORSB.json).
set SERVIDOR=DESKTOP-LC0FQC1
set ENDERECO=http://%SERVIDOR%:8935

if /i not "%COMPUTERNAME%"=="%SERVIDOR%" goto outro_pc

rem No PC do servidor o vigia_servidor.pyw sobe sozinho com o Windows (atalho
rem em Inicializar). Se nao estiver rodando, sobe agora, sem janela.
netstat -an | findstr ":8935" | findstr "LISTENING" >nul
if errorlevel 1 (
    start "" pythonw vigia_servidor.pyw
    ping -n 5 127.0.0.1 >nul
)
start "" "http://localhost:8935"
exit /b

:outro_pc
rem Servidor velho que tenha ficado rodando neste PC: ele grava na copia local
rem dos dados. Derruba antes de abrir. Este PC nao precisa de Python.
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8935" ^| findstr "LISTENING"') do taskkill /pid %%p /f >nul 2>&1

rem Confere se o servidor responde, para dizer o motivo em vez de o navegador
rem mostrar so "nao foi possivel acessar".
curl -s -o nul -m 5 %ENDERECO%/api/config
if errorlevel 1 goto sem_servidor
start "" "%ENDERECO%"
exit /b

:sem_servidor
echo.
echo   O servidor do CDE Web (%SERVIDOR%) nao respondeu.
echo.
echo   Causas provaveis:
echo    - o notebook do servidor esta desligado, fechado ou fora do escritorio;
echo    - ele esta em outra rede Wi-Fi (precisa estar na REDE SB OFFICE);
echo    - este PC esta em outra rede Wi-Fi.
echo.
echo   Abrindo o endereco mesmo assim: %ENDERECO%
echo.
start "" "%ENDERECO%"
pause
exit /b
