"""Login e permissoes do CDE Web.

Por que existe: o CDE nao tinha login, e quem chegava ao endereco via tudo,
inclusive o faturamento das casas. Com o acesso de fora (Tailscale) e cinco
pessoas com papeis diferentes, cada uma passa a entrar com usuario e senha e
ve so as telas liberadas para ela.

Como funciona:
- usuarios em dados/usuarios.json (fora do git). A senha nunca e guardada: so
  o resultado do PBKDF2-SHA256 com sal aleatorio por usuario;
- sessao por navegador: cookie HttpOnly e SameSite=Strict com um token
  aleatorio. No disco (dados/sessoes.json) fica so o hash do token, entao quem
  ler o arquivo nao consegue entrar com ele;
- cada tela tem um nivel por usuario: "nenhum", "ver" ou "editar". O
  SERVIDOR confere o nivel em toda pagina e em toda chamada de /api — esconder
  o botao na tela nao bastaria, a chamada direta passaria;
- 5 senhas erradas seguidas para o mesmo usuario no mesmo aparelho travam o
  login por 15 minutos;
- enquanto nao existir nenhum usuario, o sistema funciona aberto, como antes, e
  o primeiro administrador so pode ser criado no proprio PC do servidor. Assim
  ligar o login nao tranca ninguem para fora sem querer;
- toda gravacao fica registrada em logs/acessos.log com quem fez.
"""
import hashlib
import hmac
import json
import secrets
import threading
import time
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).parent
ARQ_USUARIOS = RAIZ / "dados" / "usuarios.json"
ARQ_SESSOES = RAIZ / "dados" / "sessoes.json"
LOG_ACESSOS = RAIZ / "logs" / "acessos.log"

COOKIE = "cde_sessao"
DURACAO_SESSAO = 7 * 24 * 3600         # 7 dias; "Sair" encerra antes
ITERACOES = 310_000                    # PBKDF2-SHA256, recomendacao OWASP
SENHA_MINIMA = 8
TENTATIVAS = 5
BLOQUEIO = 15 * 60

NIVEIS = ("nenhum", "ver", "editar")

# Telas do menu, na ordem do menu. "paginas" sao os .html de cada uma.
TELAS = [
    {"id": "overview", "rotulo": "Visão Geral", "paginas": ["overview.html"]},
    {"id": "lancamento", "rotulo": "Lançamento Diário", "paginas": ["index.html"]},
    {"id": "painel", "rotulo": "Painel de Consumo",
     "paginas": ["painel.html", "painel-exemplo-colunas.html"]},
    {"id": "movimentacoes", "rotulo": "Movimentações", "paginas": ["movimentacoes.html"]},
    {"id": "contagem_diaria", "rotulo": "Contagem diária",
     "paginas": ["contagem-diaria.html"]},
    {"id": "contagem_semanal", "rotulo": "Contagem semanal",
     "paginas": ["contagem-semanal.html"]},
    {"id": "ordens", "rotulo": "Ordens de Compras", "paginas": ["ordens.html"]},
    {"id": "compras", "rotulo": "Projeção de Compras", "paginas": ["compras.html"]},
    {"id": "importar", "rotulo": "Importar OC", "paginas": ["importar.html"]},
    {"id": "recebimento", "rotulo": "Recebimento de Salmão", "paginas": ["recebimento.html"]},
    {"id": "conversao", "rotulo": "Conversão de Salmão", "paginas": ["conversao.html"]},
    {"id": "qualidade", "rotulo": "Qualidade do Salmão", "paginas": ["qualidade.html"]},
    {"id": "cadastros", "rotulo": "Cadastros", "paginas": ["cadastros.html"]},
    {"id": "parametros", "rotulo": "Parâmetros", "paginas": ["parametros.html"]},
]
IDS = [t["id"] for t in TELAS]
PAGINA_TELA = {p: t["id"] for t in TELAS for p in t["paginas"]}
# ficha de contagem (impressao) acompanha as duas contagens
PAGINA_TELA_VARIAS = {"ficha-contagem.html": {"contagem_diaria", "contagem_semanal"}}
# paginas de qualquer usuario logado
PAGINAS_LIVRES = {"ajuda.html", "senha.html"}
PAGINAS_ADMIN = {"usuarios.html"}
# sem login: so o que a tela de login usa
PUBLICAS = {"/login.html", "/centurion_menu.png", "/centurion_aba.png",
            "/logo_menu.png", "/logo_aba.png", "/favicon.ico", "/css/style.css"}

# Perfis sugeridos. Sao so um ponto de partida: na tela Usuarios cada pessoa
# pode ter qualquer combinacao.
def _modelo(padrao, **excecoes):
    return {t: excecoes.get(t, padrao) for t in IDS}

MODELOS = {
    "Diretor": {"admin": True, "permissoes": _modelo("ver")},
    "Gerente": {"admin": False, "permissoes": _modelo(
        "ver", lancamento="editar", movimentacoes="editar", contagem_diaria="editar",
        contagem_semanal="editar", importar="nenhum", recebimento="editar")},
    "Analista pleno": {"admin": True, "permissoes": _modelo("editar")},
    "Analista júnior": {"admin": False, "permissoes": _modelo(
        "editar", overview="ver", painel="ver", cadastros="ver", parametros="ver")},
    "Auxiliar de suprimentos": {"admin": False, "permissoes": _modelo(
        "nenhum", lancamento="editar", movimentacoes="editar", contagem_diaria="editar",
        contagem_semanal="editar", ordens="ver", compras="ver", conversao="editar",
        qualidade="editar", recebimento="editar")},
}

# Quem pode chamar cada /api. Leitura: basta "ver" em UMA das telas; escrita:
# "editar" em uma delas. "*" = qualquer usuario logado; "admin" = administrador.
API_LEITURA = {
    "/api/config": "*",
    "/api/eu": "*",
    "/api/dia": {"lancamento"},
    "/api/sincronizar": "editar:lancamento",   # GET que importa da planilha e grava
    "/api/painel": {"painel"}, "/api/serie": {"painel"}, "/api/ocorrencias": {"painel"},
    "/api/resumo-dia": {"painel"},
    "/api/overview": {"overview"},
    "/api/movimentacoes": {"movimentacoes"}, "/api/nota": {"movimentacoes"},
    "/api/projecao": {"compras"},
    "/api/parametros": {"parametros", "compras"},
    "/api/vinculos": {"cadastros"},
    "/api/base": {"cadastros", "ordens", "importar", "qualidade", "conversao",
                  "contagem_diaria", "contagem_semanal", "movimentacoes",
                  "parametros", "lancamento"},
    "/api/ordens": {"ordens", "importar", "recebimento"},
    "/api/recebimentos": {"recebimento", "ordens", "compras"},
    "/api/ocs": {"ordens", "importar", "qualidade"},
    "/api/ocs/proximo": {"ordens", "importar", "qualidade"},
    "/api/contagem": {"contagem_diaria", "contagem_semanal"},
    "/api/usuarios": "admin",
}
API_ESCRITA = {
    "/api/dia": {"lancamento"},
    "/api/movimentacao": {"lancamento", "movimentacoes"},
    "/api/preco": {"movimentacoes"}, "/api/nota": {"movimentacoes"},
    "/api/movimento/editar": {"movimentacoes"}, "/api/movimento/info": {"movimentacoes"},
    "/api/movimento/excluir": {"movimentacoes"}, "/api/kg": {"movimentacoes"},
    "/api/pedido": {"compras"},
    "/api/ordem": {"ordens"}, "/api/ordem/nova": {"ordens", "importar"},
    "/api/ordens/lote": {"importar", "ordens"},
    "/api/recebimento": {"recebimento"},
    "/api/parametros": {"parametros"},
    "/api/base": {"cadastros"},
    "/api/vinculos": {"cadastros"},
    "/api/contagem": {"contagem_diaria", "contagem_semanal"},
    "/api/contagem/itens": {"contagem_diaria", "contagem_semanal"},
    "/api/ocs/reservar": {"ordens", "importar", "qualidade"},
    "/api/usuarios": "admin",
    "/api/senha": "*",
    "/api/sair": "*",
}

_trava = threading.Lock()
_falhas = {}            # (usuario, ip) -> [quantas, desde]


# ------------------------------------------------------------------ arquivos
def _ler(arq, padrao):
    try:
        with open(arq, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return padrao


def _gravar(arq, obj):
    arq.parent.mkdir(exist_ok=True)
    tmp = arq.with_suffix(".%d.tmp" % threading.get_ident())
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    tmp.replace(arq)


def usuarios():
    return _ler(ARQ_USUARIOS, {}).get("usuarios", {})


def _salvar_usuarios(us):
    _gravar(ARQ_USUARIOS, {"_leia": "Gerado pelo CDE Web. Senhas guardadas so como "
                                    "hash PBKDF2; nao edite a mao.", "usuarios": us})


def login_ligado():
    """O login vale a partir do primeiro usuario ativo."""
    return any(u.get("ativo", True) for u in usuarios().values())


# ------------------------------------------------------------------ senha
def _hash(senha, sal=None, it=ITERACOES):
    sal = sal or secrets.token_bytes(16)
    h = hashlib.pbkdf2_hmac("sha256", senha.encode("utf-8"), sal, it)
    return "pbkdf2_sha256$%d$%s$%s" % (it, sal.hex(), h.hex())


def _confere(senha, guardado):
    try:
        _alg, it, sal, h = guardado.split("$")
        novo = hashlib.pbkdf2_hmac("sha256", senha.encode("utf-8"), bytes.fromhex(sal), int(it))
        return hmac.compare_digest(novo.hex(), h)
    except (ValueError, AttributeError):
        return False


def _valida_senha(senha):
    if not isinstance(senha, str) or len(senha) < SENHA_MINIMA:
        raise ValueError("a senha precisa ter pelo menos %d caracteres" % SENHA_MINIMA)


def _valida_login(login):
    login = (login or "").strip().lower()
    if not login or not all(c.isalnum() or c in "._-" for c in login) or len(login) > 40:
        raise ValueError("usuário: só letras, números, ponto, hífen e sublinhado")
    return login


def _limpa_permissoes(p):
    p = p or {}
    return {t: (p.get(t) if p.get(t) in NIVEIS else "nenhum") for t in IDS}


# ------------------------------------------------------------------ sessoes
def _h(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _sessoes():
    agora = time.time()
    return {k: v for k, v in _ler(ARQ_SESSOES, {}).items() if v.get("expira", 0) > agora}


def entrar(login, senha, ip):
    """Devolve (token, usuario) ou levanta ValueError com a mensagem para a tela."""
    login = (login or "").strip().lower()
    chave = (login, ip)
    with _trava:
        n, desde = _falhas.get(chave, (0, 0))
        if n >= TENTATIVAS and time.time() - desde < BLOQUEIO:
            falta = int((BLOQUEIO - (time.time() - desde)) // 60) + 1
            raise ValueError("Muitas tentativas erradas. Tente de novo em %d min." % falta)
    u = usuarios().get(login)
    ok = bool(u) and u.get("ativo", True) and _confere(senha or "", u.get("senha", ""))
    if not u:
        _hash(senha or "x")            # mesmo tempo de resposta com ou sem usuario
    with _trava:
        if not ok:
            n, desde = _falhas.get(chave, (0, time.time()))
            if time.time() - desde >= BLOQUEIO:
                n, desde = 0, time.time()
            _falhas[chave] = (n + 1, desde)
            raise ValueError("Usuário ou senha incorretos.")
        _falhas.pop(chave, None)
        token = secrets.token_urlsafe(32)
        s = _sessoes()
        s[_h(token)] = {"usuario": login, "criada": datetime.now().isoformat(timespec="seconds"),
                        "expira": time.time() + DURACAO_SESSAO, "ip": ip}
        _gravar(ARQ_SESSOES, s)
    registrar(login, ip, "LOGIN", "/api/login")
    return token, publico(login, u)


def sessao(token):
    """Usuario da sessao (dict publico) ou None."""
    if not token:
        return None
    s = _sessoes().get(_h(token))
    if not s:
        return None
    u = usuarios().get(s["usuario"])
    if not u or not u.get("ativo", True):
        return None
    return publico(s["usuario"], u)


def sair(token):
    with _trava:
        s = _sessoes()
        s.pop(_h(token or ""), None)
        _gravar(ARQ_SESSOES, s)


def _derrubar(login, menos=None):
    """Encerra as sessoes de um usuario (troca de senha, desativacao)."""
    with _trava:
        s = {k: v for k, v in _sessoes().items()
             if v["usuario"] != login or (menos and k == _h(menos))}
        _gravar(ARQ_SESSOES, s)


def publico(login, u):
    return {"usuario": login, "nome": u.get("nome") or login, "admin": bool(u.get("admin")),
            "perfil": u.get("perfil", ""), "permissoes": _limpa_permissoes(u.get("permissoes"))}


# ------------------------------------------------------------------ permissao
def nivel(u, tela):
    if u is None:                      # login desligado: tudo liberado, como antes
        return "editar"
    return u["permissoes"].get(tela, "nenhum")


def pode_pagina(u, pagina):
    """pagina: nome do .html. True/False."""
    if u is None or pagina in PAGINAS_LIVRES:
        return True
    if pagina in PAGINAS_ADMIN:
        return u["admin"]
    if pagina in PAGINA_TELA_VARIAS:
        return any(nivel(u, t) != "nenhum" for t in PAGINA_TELA_VARIAS[pagina])
    tela = PAGINA_TELA.get(pagina)
    return tela is None or nivel(u, tela) != "nenhum"


def primeira_pagina(u):
    for t in TELAS:
        if nivel(u, t["id"]) != "nenhum":
            return t["paginas"][0]
    return "ajuda.html"


def pode_api(u, metodo, rota):
    """None se pode; senao, o motivo."""
    if u is None:
        return None
    regra = (API_ESCRITA if metodo == "POST" else API_LEITURA).get(rota)
    if regra is None:
        return "rota sem regra de acesso"
    if regra == "*":
        return None
    if regra == "admin":
        return None if u["admin"] else "só administradores"
    exige = "ver"
    if isinstance(regra, str) and regra.startswith("editar:"):
        exige, regra = "editar", {regra.split(":", 1)[1]}
    if metodo == "POST":
        exige = "editar"
    ok = any((nivel(u, t) == "editar") if exige == "editar" else (nivel(u, t) != "nenhum")
             for t in regra)
    if ok:
        return None
    return ("seu acesso a esta tela é só de consulta" if exige == "editar"
            and any(nivel(u, t) == "ver" for t in regra) else "sem acesso a esta tela")


def registrar(login, ip, metodo, rota):
    try:
        LOG_ACESSOS.parent.mkdir(exist_ok=True)
        with open(LOG_ACESSOS, "a", encoding="utf-8") as f:
            f.write("%s\t%s\t%s\t%s\t%s\n" % (datetime.now().isoformat(timespec="seconds"),
                                              login or "-", ip, metodo, rota))
    except OSError:
        pass


# ------------------------------------------------------------------ administracao
def para_tela():
    us = usuarios()
    return {"usuarios": [dict(publico(k, v), ativo=v.get("ativo", True),
                              criado=v.get("criado", ""), troca_senha=v.get("trocar_senha", False))
                         for k, v in sorted(us.items())],
            "telas": [{"id": t["id"], "rotulo": t["rotulo"]} for t in TELAS],
            "niveis": list(NIVEIS), "modelos": MODELOS, "senha_minima": SENHA_MINIMA}


def _admins_ativos(us):
    return [k for k, v in us.items() if v.get("admin") and v.get("ativo", True)]


def administrar(corpo, quem):
    """Acoes da tela Usuarios. quem: login do administrador que pediu."""
    acao = corpo.get("acao")
    with _trava:
        us = usuarios()
        if acao == "criar":
            login = _valida_login(corpo.get("usuario"))
            if login in us:
                raise ValueError("já existe o usuário %s" % login)
            _valida_senha(corpo.get("senha"))
            us[login] = {"nome": (corpo.get("nome") or login).strip()[:80],
                         "perfil": (corpo.get("perfil") or "")[:40],
                         "admin": bool(corpo.get("admin")),
                         "permissoes": _limpa_permissoes(corpo.get("permissoes")),
                         "senha": _hash(corpo["senha"]), "ativo": True,
                         "trocar_senha": True,
                         "criado": datetime.now().isoformat(timespec="seconds")}
        elif acao == "salvar":
            login = corpo.get("usuario")
            if login not in us:
                raise ValueError("usuário não encontrado")
            u = us[login]
            u["nome"] = (corpo.get("nome") or u.get("nome") or login).strip()[:80]
            u["perfil"] = (corpo.get("perfil") or "")[:40]
            u["admin"] = bool(corpo.get("admin"))
            u["ativo"] = bool(corpo.get("ativo", True))
            u["permissoes"] = _limpa_permissoes(corpo.get("permissoes"))
            if not _admins_ativos(us):
                raise ValueError("precisa sobrar pelo menos um administrador ativo")
        elif acao == "redefinir_senha":
            login = corpo.get("usuario")
            if login not in us:
                raise ValueError("usuário não encontrado")
            _valida_senha(corpo.get("senha"))
            us[login]["senha"] = _hash(corpo["senha"])
            us[login]["trocar_senha"] = True
        else:
            raise ValueError("ação desconhecida")
        _salvar_usuarios(us)
    if acao in ("salvar", "redefinir_senha") and (
            acao == "redefinir_senha" or not us[corpo["usuario"]].get("ativo", True)):
        _derrubar(corpo["usuario"])
    return {"ok": True, **para_tela()}


def trocar_senha(login, atual, nova, token):
    with _trava:
        us = usuarios()
        u = us.get(login)
        if not u or not _confere(atual or "", u.get("senha", "")):
            raise ValueError("a senha atual não confere")
        _valida_senha(nova)
        if nova == atual:
            raise ValueError("a nova senha precisa ser diferente da atual")
        u["senha"] = _hash(nova)
        u["trocar_senha"] = False
        _salvar_usuarios(us)
    _derrubar(login, menos=token)       # outros aparelhos saem; este continua
    return {"ok": True}


def primeiro_admin(corpo):
    """Cria o primeiro administrador. So vale enquanto nao ha nenhum usuario."""
    with _trava:
        if usuarios():
            raise ValueError("já existem usuários; entre com um administrador")
        login = _valida_login(corpo.get("usuario"))
        _valida_senha(corpo.get("senha"))
        _salvar_usuarios({login: {
            "nome": (corpo.get("nome") or login).strip()[:80],
            "perfil": (corpo.get("perfil") or "Analista pleno")[:40], "admin": True,
            "permissoes": _modelo("editar"), "senha": _hash(corpo["senha"]),
            "ativo": True, "trocar_senha": False,
            "criado": datetime.now().isoformat(timespec="seconds")}})
    return {"ok": True}


def precisa_trocar(login):
    return bool(usuarios().get(login, {}).get("trocar_senha"))
