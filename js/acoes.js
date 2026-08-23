// ============================================================================
// Botão de ação — as três coisas que interrompem qualquer tela.
//
// Chegou caminhão, o gerente pediu o custo do filé, faltou lançar uma perda:
// nenhuma dessas tarefas justifica abandonar a tela em que a pessoa está,
// perder o filtro que ela montou e voltar depois. O botão abre um painel no
// canto, resolve ali e devolve a pessoa ao lugar onde ela estava.
//
//   Movimentação     grava entrada, saída, desperdício ou contagem do dia;
//   Ordem de compra  monta e cria a ordem, que aparece na fila de Ordens;
//   Conversão        preço do salmão inteiro -> custo de cada corte.
//
// O painel tem cara de conversa: cada coisa feita vira uma mensagem no topo,
// com o que foi gravado. Sem isso, quem lança três chegadas seguidas não tem
// como conferir o que já entrou sem sair da tela — que é justamente o que este
// painel existe para evitar.
//
// Tudo vive dentro de uma função anônima: a página já carrega navegacao.js e o
// script da tela, e um nome global repetido derruba a página inteira.
// ============================================================================
(function () {
  "use strict";

  const $$$ = (sel, raiz) => (raiz || document).querySelector(sel);
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v) => {
    const t = String(v == null ? "" : v).replace(/[^\d,.-]/g, "");
    const n = parseFloat(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
    return isNaN(n) ? 0 : n;
  };
  const fmt = (n, c = 2) => (n === null || n === undefined || !isFinite(n)) ? "—"
    : n.toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });
  const chave = (t) => String(t == null ? "" : t).normalize("NFD")
    .replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
  const hojeISO = () => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };
  const hojeBR = () => new Date().toLocaleDateString("pt-BR");

  // Fatores do Conversor de Salmão. Se alguém recalibrou na tela dele, a
  // calibração vale aqui também — dois números diferentes para o mesmo peixe
  // seria pior que não ter o atalho.
  const CV_KEY = "cde_conversor_fatores_v1";
  const FATORES = { file_com_pele: 0.6716, raspa: 0.0109, file_limpo: 0.8011 };
  function fatores() {
    try {
      const salvo = (JSON.parse(localStorage.getItem(CV_KEY)) || {}).SALMAO_INTEIRO_EVISCERADO;
      if (!salvo) return FATORES;
      return {
        file_com_pele: salvo.estagio1.fator_file_com_pele,
        raspa: salvo.estagio1.fator_raspa,
        file_limpo: salvo.estagio2.fator_file_limpo,
      };
    } catch (e) { return FATORES; }
  }

  // ------------------------------------------------------------------ dados
  let CFG = null, BASE_OC = null;

  async function config() {
    if (!CFG) CFG = await (await fetch("/api/config")).json();
    return CFG;
  }
  async function base() {
    if (!BASE_OC) BASE_OC = await (await fetch("/api/base", { cache: "no-store" })).json();
    return BASE_OC;
  }

  // ------------------------------------------------------------------ desenho
  const ICONE = {
    mais: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    fechar: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    mov: '<path d="M17 3v12"/><path d="m21 11-4 4-4-4"/><path d="M7 21V9"/><path d="m3 13 4-4 4 4"/>',
    oc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="m9 15 2 2 4-4"/>',
    salmao: '<path d="M12 3v18"/><path d="M5 7h14"/><path d="m5 7-3 6h6z"/><path d="m19 7-3 6h6z"/><path d="M8 21h8"/>',
    voltar: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  };
  const svg = (d, t = 18) => `<svg width="${t}" height="${t}" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

  const ACOES = {
    movimentacao: { titulo: "Nova Movimentação", icone: ICONE.mov,
      resumo: "Entrada, saída, desperdício ou contagem" },
    ordem: { titulo: "Nova Ordem de Compra", icone: ICONE.oc,
      resumo: "Monta a ordem e envia para a fila" },
    salmao: { titulo: "Conversão de Salmão", icone: ICONE.salmao,
      resumo: "Preço do inteiro para custo de cada corte" },
  };

  let aberto = false, tela = "menu";

  function montar() {
    document.body.insertAdjacentHTML("beforeend", `
      <button class="acao-botao" id="acao-botao" title="Ações rápidas" aria-label="Ações rápidas">
        ${svg(ICONE.mais, 22)}
      </button>
      <section class="acao-painel" id="acao-painel" hidden aria-label="Ações rápidas">
        <header class="acao-cabeca">
          <button class="acao-voltar" id="acao-voltar" title="Voltar" hidden>${svg(ICONE.voltar, 16)}</button>
          <h2 id="acao-titulo">Ações Rápidas</h2>
          <button class="acao-fechar" id="acao-fechar" title="Fechar">${svg(ICONE.fechar, 16)}</button>
        </header>
        <div class="acao-conversa" id="acao-conversa"></div>
        <div class="acao-corpo" id="acao-corpo"></div>
      </section>`);

    $$$("#acao-botao").onclick = () => alternar();
    $$$("#acao-fechar").onclick = () => alternar(false);
    $$$("#acao-voltar").onclick = () => irPara("menu");
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && aberto) alternar(false);
    });
    irPara("menu");
  }

  function alternar(forcar) {
    aberto = forcar === undefined ? !aberto : forcar;
    $$$("#acao-painel").hidden = !aberto;
    $$$("#acao-botao").classList.toggle("aberto", aberto);
    if (aberto) {
      const primeiro = $$$("#acao-corpo input, #acao-corpo select, #acao-corpo button");
      if (primeiro) primeiro.focus();
    }
  }

  // Mensagem no topo do painel: fica registrado o que já foi feito nesta sessão.
  function dizer(texto, tipo, extra) {
    const conversa = $$$("#acao-conversa");
    conversa.insertAdjacentHTML("beforeend",
      `<div class="acao-msg ${tipo || ""}">${texto}${extra ? `<div class="acao-msg-acoes">${extra}</div>` : ""}</div>`);
    conversa.scrollTop = conversa.scrollHeight;
  }

  function irPara(nova) {
    tela = nova;
    const info = ACOES[nova];
    $$$("#acao-titulo").textContent = info ? info.titulo : "Ações Rápidas";
    $$$("#acao-voltar").hidden = !info;
    if (nova === "menu") return telaMenu();
    if (nova === "movimentacao") return telaMovimentacao();
    if (nova === "ordem") return telaOrdem();
    if (nova === "salmao") return telaSalmao();
  }

  // ------------------------------------------------------------------ menu
  function telaMenu() {
    $$$("#acao-corpo").innerHTML = Object.entries(ACOES).map(([k, a]) => `
      <button class="acao-opcao" data-ir="${k}">
        <span class="acao-opcao-ico">${svg(a.icone)}</span>
        <span class="acao-opcao-txt"><strong>${esc(a.titulo)}</strong>
          <small>${esc(a.resumo)}</small></span>
        <span class="acao-opcao-seta">→</span>
      </button>`).join("");
    $$$("#acao-corpo").querySelectorAll("[data-ir]").forEach((b) => {
      b.onclick = () => irPara(b.dataset.ir);
    });
  }

  // ------------------------------------------------------------------ movimentação
  const TIPOS = [
    ["entrada", "Entrada (chegada)"],
    ["transferencia", "Saída (transferência)"],
    ["desperdicio", "Desperdício"],
    ["final", "Contagem Final"],
  ];

  async function telaMovimentacao() {
    const corpo = $$$("#acao-corpo");
    corpo.innerHTML = '<p class="acao-carregando">Carregando…</p>';
    const cfg = await config();
    corpo.innerHTML = `
      <div class="acao-grade">
        <label class="campo"><span>Data</span><input type="date" id="mv-data" value="${hojeISO()}"></label>
        <label class="campo"><span>Casa</span><select id="mv-casa">${cfg.casas.map((c) =>
          `<option value="${c.chave}">${esc(c.nome)}</option>`).join("")}</select></label>
        <label class="campo campo-largo"><span>Insumo</span><select id="mv-insumo">${cfg.insumos
          .filter((i) => !i.derivado || i.chave === "salmao_equivalente")
          .map((i) => `<option value="${i.chave}">${esc(i.nome)} (${esc(i.un)})</option>`).join("")}</select></label>
        <label class="campo campo-largo"><span>Movimento</span><select id="mv-tipo">${TIPOS.map(([v, t]) =>
          `<option value="${v}">${esc(t)}</option>`).join("")}</select></label>
        <label class="campo"><span>Quantidade</span>
          <input type="text" id="mv-qtd" inputmode="decimal" placeholder="0,000"></label>
      </div>
      <p class="acao-nota" id="mv-nota">Entrada, saída e desperdício <strong>somam</strong> ao que já foi
        lançado no dia. A contagem final <strong>substitui</strong> o valor.</p>
      <button class="botao primario acao-enviar" id="mv-gravar">Registrar Movimentação</button>`;

    $$$("#mv-gravar").onclick = gravarMovimentacao;
    $$$("#mv-qtd").onkeydown = (e) => { if (e.key === "Enter") gravarMovimentacao(); };
  }

  async function gravarMovimentacao() {
    const botao = $$$("#mv-gravar");
    const dados = {
      data: $$$("#mv-data").value,
      casa: $$$("#mv-casa").value,
      insumo: $$$("#mv-insumo").value,
      tipo: $$$("#mv-tipo").value,
      qtd: num($$$("#mv-qtd").value),
    };
    if (dados.tipo !== "final" && dados.qtd <= 0) {
      dizer("Informe uma quantidade maior que zero.", "erro");
      $$$("#mv-qtd").focus();
      return;
    }
    botao.disabled = true;
    botao.textContent = "Registrando…";
    try {
      const r = await (await fetch("/api/movimentacao", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(dados) })).json();
      if (!r.ok) throw new Error(r.erro || "erro no servidor");
      const casaNome = (CFG.casas.find((c) => c.chave === r.casa) || {}).nome || r.casa;
      dizer(`<strong>${esc(r.tipo_nome)}</strong> de ${fmt(r.qtd, 3)} ${esc(r.un)} —
        ${esc(r.insumo_nome)}, ${esc(casaNome)}, ${esc(r.data.split("-").reverse().join("/"))}.
        <br><span class="acao-msg-sub">Total do dia neste movimento: ${fmt(r.total_no_dia, 3)} ${esc(r.un)}.</span>`,
        "ok", '<button class="acao-link" data-recarregar="1">Atualizar a tela</button>');
      $$$("#acao-conversa").querySelectorAll("[data-recarregar]").forEach((b) => {
        b.onclick = () => location.reload();
      });
      $$$("#mv-qtd").value = "";
      $$$("#mv-qtd").focus();
    } catch (e) {
      dizer("Não consegui registrar: " + esc(e.message), "erro");
    } finally {
      botao.disabled = false;
      botao.textContent = "Registrar Movimentação";
    }
  }

  // ------------------------------------------------------------------ ordem de compra
  let ITENS = [];

  async function telaOrdem() {
    const corpo = $$$("#acao-corpo");
    corpo.innerHTML = '<p class="acao-carregando">Carregando cadastro…</p>';
    const b = await base();
    if (b.erro) { corpo.innerHTML = `<p class="acao-nota">Cadastro indisponível: ${esc(b.erro)}</p>`; return; }
    ITENS = [];
    corpo.innerHTML = `
      <div class="acao-grade">
        <label class="campo campo-largo"><span>Fornecedor</span>
          <input id="oc-forn" list="oc-forn-lista" autocomplete="off" placeholder="digite as primeiras letras">
          <datalist id="oc-forn-lista">${b.fornecedores.map((f) =>
            `<option value="${esc(f.chave)}">${esc(f.razao)}</option>`).join("")}</datalist></label>
        <label class="campo"><span>Unidade</span><select id="oc-unidade">${b.unidades.map((u) =>
          `<option value="${esc(u.chave)}">${esc(u.chave)}</option>`).join("")}</select></label>
        <label class="campo"><span>Data</span><input type="date" id="oc-data" value="${hojeISO()}"></label>
      </div>

      <div class="acao-item">
        <label class="campo campo-largo"><span>Item</span>
          <input id="oc-item" list="oc-item-lista" autocomplete="off" placeholder="produto do catálogo">
          <datalist id="oc-item-lista"></datalist></label>
        <label class="campo"><span>Qtd.</span><input id="oc-qtd" inputmode="decimal" value="1"></label>
        <label class="campo"><span>Preço</span><input id="oc-preco" inputmode="decimal" placeholder="0,00"></label>
        <button class="botao" id="oc-add">+ Adicionar à ordem</button>
        <span class="acao-nota" id="oc-dica">Uma ordem tem vários itens: preencha item,
          quantidade e preço e adicione. Repita para cada produto; a lista aparece abaixo.</span>
      </div>

      <div id="oc-lista"></div>
      <div class="acao-botoes">
        <button class="botao" id="oc-previa">Ver prévia da OC</button>
        <button class="botao primario" id="oc-criar">Criar Ordem</button>
      </div>`;

    $$$("#oc-forn").oninput = catalogoDoFornecedor;
    $$$("#oc-item").oninput = precoDoItem;
    $$$("#oc-add").onclick = incluirItem;
    $$$("#oc-item").onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); incluirItem(); } };
    $$$("#oc-criar").onclick = criarOrdem;
    $$$("#oc-previa").onclick = verPrevia;
    desenharItens();
  }

  function fornecedorEscolhido() {
    const t = chave($$$("#oc-forn").value);
    if (!t) return null;
    return BASE_OC.fornecedores.find((f) => chave(f.chave) === t)
        || BASE_OC.fornecedores.find((f) => chave(f.razao) === t)
        || BASE_OC.fornecedores.find((f) => chave(f.chave).includes(t) || chave(f.razao).includes(t))
        || null;
  }

  function catalogoDoFornecedor() {
    const f = fornecedorEscolhido();
    const produtos = f ? BASE_OC.produtos.filter((p) => chave(p.fornecedor) === chave(f.chave)) : [];
    $$$("#oc-item-lista").innerHTML = produtos.map((p) =>
      `<option value="${esc(p.produto)}">${esc(p.un)} · R$ ${fmt(p.preco)}</option>`).join("");
  }

  // Preço vem do catálogo assim que o item é reconhecido: é o preço negociado,
  // e digitar de novo é a chance de errar um dígito.
  function precoDoItem() {
    const f = fornecedorEscolhido();
    if (!f) return;
    const achado = BASE_OC.produtos.find((p) => chave(p.fornecedor) === chave(f.chave)
      && chave(p.produto) === chave($$$("#oc-item").value));
    if (achado) $$$("#oc-preco").value = achado.preco > 0 ? fmt(achado.preco) : "";
  }

  function incluirItem() {
    const f = fornecedorEscolhido();
    if (!f) { dizer("Escolha o fornecedor primeiro.", "erro"); $$$("#oc-forn").focus(); return; }
    const nome = $$$("#oc-item").value.trim();
    if (!nome) { $$$("#oc-item").focus(); return; }
    const achado = BASE_OC.produtos.find((p) => chave(p.fornecedor) === chave(f.chave)
      && chave(p.produto) === chave(nome));
    ITENS.push({ nome: achado ? achado.produto : nome, un: achado ? achado.un : "Un",
                 qtd: num($$$("#oc-qtd").value) || 1, preco: num($$$("#oc-preco").value) });
    $$$("#oc-item").value = ""; $$$("#oc-qtd").value = "1"; $$$("#oc-preco").value = "";
    $$$("#oc-item").focus();
    desenharItens();
  }

  function desenharItens() {
    const alvo = $$$("#oc-lista");
    if (!alvo) return;
    if (!ITENS.length) {
      alvo.innerHTML = '<p class="acao-nota">Nenhum item incluído ainda.</p>';
      return;
    }
    const total = ITENS.reduce((s, i) => s + i.qtd * i.preco, 0);
    alvo.innerHTML = `<div class="acao-itens">${ITENS.map((i, n) => `
      <div class="acao-item-linha">
        <span class="ai-nome">${esc(i.nome)}<small>${fmt(i.qtd, 3)} ${esc(i.un)} × R$ ${fmt(i.preco)}</small></span>
        <span class="ai-val">${i.qtd * i.preco > 0 ? "R$ " + fmt(i.qtd * i.preco) : "—"}</span>
        <button class="botao-mini" data-tira="${n}" title="Remover">&#10005;</button>
      </div>`).join("")}
      <div class="acao-item-total"><span>Total</span><strong>R$ ${fmt(total)}</strong></div>
    </div>`;
    alvo.querySelectorAll("[data-tira]").forEach((b) => {
      b.onclick = () => { ITENS.splice(Number(b.dataset.tira), 1); desenharItens(); };
    });
  }

  async function criarOrdem() {
    const f = fornecedorEscolhido();
    if (!f) { dizer("Escolha um fornecedor do cadastro.", "erro"); return; }
    if (!ITENS.length) { dizer("Inclua pelo menos um item.", "erro"); return; }
    const botao = $$$("#oc-criar");
    botao.disabled = true;
    botao.textContent = "Criando…";
    try {
      const r = await (await fetch("/api/ordem/nova", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unidade_oc: $$$("#oc-unidade").value,
          fornecedor: f.chave, fornecedor_base: f.chave,
          data: $$$("#oc-data").value || hojeISO(),
          origem: "avulsa",
          oc: { dataEmissao: hojeBR(), prazoFaturado: f.prazoFat || "", prazoEntrega: f.prazoEntrega || "" },
          itens: ITENS,
        }) })).json();
      if (!r.ok) throw new Error(r.erro || "erro no servidor");
      const total = ITENS.reduce((s, i) => s + i.qtd * i.preco, 0);
      dizer(`Ordem de <strong>${esc(f.chave)}</strong> criada com ${ITENS.length} item(ns)
        — R$ ${fmt(total)}. Ela entrou na fila como pendente; o PDF é gerado em Ordens de Compras.`,
        "ok", `<a class="acao-link" href="ordens.html?f=${encodeURIComponent(f.chave)}">Abrir a Ordem</a>`);
      ITENS = [];
      $$$("#oc-item").value = "";
      desenharItens();
    } catch (e) {
      dizer("Não consegui criar a ordem: " + esc(e.message), "erro");
    } finally {
      botao.disabled = false;
      botao.textContent = "Criar Ordem";
    }
  }

  // Prévia do documento, antes de criar a ordem. O PDF é montado pelo mesmo
  // `oc-pdf.js` que gera a OC de verdade — prévia desenhada de outro jeito
  // mostraria um documento que não é o que o fornecedor vai receber.
  //
  // As bibliotecas do PDF (jsPDF, autoTable, cabeçalho) só existem nas telas de
  // Ordens e Importar. Como este painel abre em qualquer tela, elas são
  // carregadas na hora do clique e ficam em memória para os próximos.
  const PDF_SCRIPTS = [
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js",
    "js/header-img.js",
    "js/oc-pdf.js",
  ];

  function carregarScript(src) {
    return new Promise((ok, erro) => {
      if (document.querySelector(`script[src="${src}"]`)) return ok();
      const el = document.createElement("script");
      el.src = src;
      el.onload = () => ok();
      el.onerror = () => erro(new Error("não consegui carregar " + src));
      document.head.appendChild(el);
    });
  }

  async function prepararPDF() {
    for (const src of PDF_SCRIPTS) await carregarScript(src);
    if (typeof montarPDF !== "function") throw new Error("montador de PDF indisponível");
  }

  async function verPrevia() {
    const f = fornecedorEscolhido();
    if (!f) { dizer("Escolha um fornecedor do cadastro.", "erro"); return; }
    if (!ITENS.length) { dizer("Inclua pelo menos um item.", "erro"); return; }
    const botao = $$$("#oc-previa");
    botao.disabled = true;
    botao.textContent = "Montando…";
    try {
      await prepararPDF();
      const b = await base();
      const uni = b.unidades.find((u) => chave(u.chave) === chave($$$("#oc-unidade").value)) || {};
      const obs = (b.observacoes || []).find((o) => chave(o.fornecedor) === chave(f.chave));
      // número ainda não existe: a prévia não reserva numeração, senão um
      // documento que talvez nem vire ordem já teria queimado um número
      montarPDF({
        numero: "prévia", unidade: uni, fornecedor: f, fornecedorNome: f.chave,
        dataEmissao: hojeBR(), dataEntrega: "", horario: "",
        pagamento: "Boleto", parcelas: "1x", frete: "CIF",
        prazoFaturado: f.prazoFat || "", prazoEntrega: f.prazoEntrega || "",
        obs: obs ? obs.texto : "", itens: ITENS,
      }, true);
      dizer("Prévia aberta em outra aba. Ela <strong>não</strong> reserva número de OC — " +
            "o número só é puxado quando a ordem é gerada em Ordens de Compras.", "");
    } catch (e) {
      dizer("Não consegui montar a prévia: " + esc(e.message), "erro");
    } finally {
      botao.disabled = false;
      botao.textContent = "Ver prévia da OC";
    }
  }

  // ------------------------------------------------------------------ conversão
  function telaSalmao() {
    $$$("#acao-corpo").innerHTML = `
      <div class="acao-grade">
        <label class="campo campo-largo"><span>Preço pago por quilo do inteiro</span>
          <input id="cv-preco" inputmode="decimal" placeholder="R$ 0,00"></label>
      </div>
      <div id="cv-saida"></div>
      <p class="acao-nota">Mesmos fatores da tela de Conversão de Salmão — se você recalibrou lá,
        o cálculo aqui acompanha.
        <a href="conversao.html">Abrir a tela completa</a></p>`;
    $$$("#cv-preco").oninput = calcularSalmao;
    $$$("#cv-preco").focus();
    calcularSalmao();
  }

  function calcularSalmao() {
    const preco = num($$$("#cv-preco").value);
    const f = fatores();
    if (preco <= 0) {
      $$$("#cv-saida").innerHTML = '<p class="acao-nota">Informe o valor por quilo do peixe inteiro eviscerado.</p>';
      return;
    }
    // a raspa absorve o custo do próprio peso; o que sobra sobe para o filé
    const comPele = f.file_com_pele > 0 ? (preco - f.raspa * preco) / f.file_com_pele : 0;
    const semPele = f.file_limpo > 0 ? comPele / f.file_limpo : 0;
    const linha = (nome, valor, nota) => `
      <div class="cv-linha"><span class="cv-item">${nome}<small>${nota}</small></span>
        <span class="cv-val">R$ ${fmt(valor)}</span></div>`;
    $$$("#cv-saida").innerHTML = `<div class="acao-itens">
      ${linha("Filé com pele", comPele, `rendimento de ${fmt(f.file_com_pele * 100, 2)}%`)}
      ${linha("Filé sem pele", semPele, `rendimento de ${fmt(f.file_com_pele * f.file_limpo * 100, 2)}%`)}
      ${linha("Raspa", preco, "absorve o custo do próprio peso")}
    </div>`;
  }

  // ------------------------------------------------------------------ início
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montar);
  else montar();
})();
