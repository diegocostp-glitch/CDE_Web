"""Mantem o servidor do CDE Web no ar, sem janela, no PC do servidor.

Roda pelo pythonw (atalho na pasta Inicializar do Windows e pelo Abrir.bat):
- sobe o `python server.py` escondido. E o python.exe, e nao o pythonw, que
  escuta a porta, porque a regra do firewall que libera os outros PCs e dele;
- se o servidor cair, sobe de novo depois de alguns segundos;
- se a porta ja estiver ocupada (servidor aberto a mao pelo Servidor.bat),
  so espera, sem abrir um segundo;
- um vigia por vez: o segundo que abrir percebe o primeiro e sai;
- grava tudo que o servidor escreveria na janela em logs/servidor.log.

Para parar o sistema: Gerenciador de Tarefas, encerre "pythonw" e "python".
"""
import ctypes
import socket
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
LOGS = RAIZ / "logs"
LOG = LOGS / "servidor.log"
PORTA = 8935
SERVIDOR = "DESKTOP-LC0FQC1"
ESPERA = 10                     # segundos entre uma verificacao e outra
LIMITE_LOG = 5 * 1024 * 1024    # 5 MB: passa disso, guarda um .old e recomeca


def porta_ocupada():
    try:
        with socket.create_connection(("127.0.0.1", PORTA), timeout=2):
            return True
    except OSError:
        return False


def anotar(msg):
    LOGS.mkdir(exist_ok=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write("%s  [vigia] %s\n" % (datetime.now().strftime("%Y-%m-%d %H:%M:%S"), msg))


def girar_log():
    try:
        if LOG.exists() and LOG.stat().st_size > LIMITE_LOG:
            LOG.replace(LOG.with_suffix(".old"))
    except OSError:
        pass


def python_exe():
    exe = Path(sys.executable)
    console = exe.with_name("python.exe")
    return str(console if console.exists() else exe)


def main():
    if socket.gethostname().upper() != SERVIDOR:
        return                                   # so o PC do servidor sobe o sistema
    # Um vigia so. O mutex some sozinho quando este processo termina.
    ctypes.windll.kernel32.CreateMutexW(None, False, "Local\\CDEWebVigia")
    if ctypes.windll.kernel32.GetLastError() == 183:      # ERROR_ALREADY_EXISTS
        return
    anotar("vigia iniciado")
    avisou_ocupada = False
    while True:
        if porta_ocupada():
            if not avisou_ocupada:
                anotar("porta %d ja em uso: servidor aberto por fora, so observando" % PORTA)
                avisou_ocupada = True
            time.sleep(ESPERA)
            continue
        avisou_ocupada = False
        girar_log()
        anotar("subindo o servidor")
        LOGS.mkdir(exist_ok=True)
        with open(LOG, "a", encoding="utf-8") as saida:
            proc = subprocess.Popen(
                [python_exe(), "-u", "server.py"], cwd=str(RAIZ),
                stdout=saida, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                env=dict(__import__("os").environ, PYTHONIOENCODING="utf-8"),
                creationflags=subprocess.CREATE_NO_WINDOW)
            codigo = proc.wait()
        anotar("servidor parou (codigo %s); sobe de novo em %d s" % (codigo, ESPERA))
        time.sleep(ESPERA)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:                       # sem janela: o erro so aparece no log
        anotar("falha do vigia: %r" % e)
        raise
