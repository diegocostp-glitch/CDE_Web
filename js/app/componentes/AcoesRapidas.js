// ============================================================================
// Botão de ação — as três coisas que interrompem qualquer tela (antes js/acoes.js).
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
// como conferir o que já entrou sem sair da tela.
//
// O painel tem que nascer FECHADO: `display:flex` numa classe vence o [hidden]
// do HTML, e é a regra `.acao-painel[hidden] { display:none }` do style.css
// que segura — ela precisa continuar existindo.
//
// Diferença consciente em relação ao acoes.js: lá o atalho de conversão usava o
// id "cv-preco", o mesmo campo da tela de Conversão, e aberto NAQUELA tela lia
// o campo errado. Aqui o atalho usa referência própria (o id é mantido para o
// CSS), e o conflito some.
// ============================================================================
import { html, useState, useEffect, useRef, useCallback } from "../html.js";
import { numSemMilhar as num, fmt, hojeLocal as hojeISO, hojeBR } from "../formato.js";
import { getConfig, getBase, postMovimentacao, postOrdemNova } from "../api.js";
import { Icone } from "./Sidebar.js";

// Comparação de nomes como o acoes.js fazia (maiúscula, sem acento, espaços
// colapsados). Simétrica, então equivale a formato.chave nas comparações.
const chave = (t) => String(t == null ? "" : t).normalize("NFD")
  .replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();

// Fatores do Conversor de Salmão. Se alguém recalibrou na tela dele, a
// calibração vale aqui também — dois números diferentes para o mesmo peixe
// seria pior que não ter o atalho.
const CV_KEY = "cde_conversor_fatores_v1";
const FATORES = { bandado: 0.8015, file_com_pele: 0.6716, raspa: 0.0109, file_limpo: 0.8011 };
function fatores() {
  try {
    const salvo = (JSON.parse(localStorage.getItem(CV_KEY)) || {}).SALMAO_INTEIRO_EVISCERADO;
    if (!salvo) return FATORES;
    // Campo a campo, como em conversao.js: uma calibração gravada antes do
    // bandado existir não tem o bloco dele, e aí vale o padrão — não um zero,
    // que apagaria a linha em vez de mostrar o número medido.
    return {
      bandado: (salvo.intermediario || {}).fator_bandado || FATORES.bandado,
      file_com_pele: salvo.estagio1.fator_file_com_pele,
      raspa: salvo.estagio1.fator_raspa,
      file_limpo: salvo.estagio2.fator_file_limpo,
    };
  } catch (e) { return FATORES; }
}

// ------------------------------------------------------------------ dados
let CFG = null, BASE_OC = null;
async function config() {
  if (!CFG) CFG = await (await getConfig()).json();
  return CFG;
}
async function base() {
  if (!BASE_OC) BASE_OC = await (await getBase()).json();
  return BASE_OC;
}

const ICONE = {
  mais: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  fechar: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  mov: '<path d="M17 3v12"/><path d="m21 11-4 4-4-4"/><path d="M7 21V9"/><path d="m3 13 4-4 4 4"/>',
  oc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="m9 15 2 2 4-4"/>',
  salmao: '<path d="M12 3v18"/><path d="M5 7h14"/><path d="m5 7-3 6h6z"/><path d="m19 7-3 6h6z"/><path d="M8 21h8"/>',
  voltar: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
};

const ACOES = {
  movimentacao: { titulo: "Nova Movimentação", icone: ICONE.mov,
    resumo: "Entrada, saída, desperdício ou contagem" },
  ordem: { titulo: "Nova Ordem de Compra", icone: ICONE.oc,
    resumo: "Monta a ordem e envia para a fila" },
  salmao: { titulo: "Conversão de Salmão", icone: ICONE.salmao,
    resumo: "Preço do inteiro para custo de cada corte" },
};

const TIPOS = [
  ["entrada", "Entrada (chegada)"],
  ["transferencia", "Saída (transferência)"],
  ["desperdicio", "Desperdício"],
  ["final", "Contagem Final"],
];

// ------------------------------------------------------------------ menu
function TelaMenu({ irPara }) {
  return Object.entries(ACOES).map(([k, a]) => html`
    <button key=${k} class="acao-opcao" data-ir=${k} onClick=${() => irPara(k)}>
      <span class="acao-opcao-ico"><${Icone} d=${a.icone} /></span>
      <span class="acao-opcao-txt"><strong>${a.titulo}</strong>
        <small>${a.resumo}</small></span>
      <span class="acao-opcao-seta">→</span>
    </button>`);
}

// ------------------------------------------------------------------ movimentação
function TelaMovimentacao({ dizer }) {
  const [cfg, setCfg] = useState(CFG);
  const [enviando, setEnviando] = useState(false);
  const r = { data: useRef(), casa: useRef(), insumo: useRef(), tipo: useRef(), qtd: useRef() };
  useEffect(() => { if (!cfg) config().then(setCfg); }, []);
  if (!cfg) return html`<p class="acao-carregando">Carregando…</p>`;

  const gravar = async () => {
    const dados = {
      data: r.data.current.value,
      casa: r.casa.current.value,
      insumo: r.insumo.current.value,
      tipo: r.tipo.current.value,
      qtd: num(r.qtd.current.value),
    };
    if (dados.tipo !== "final" && dados.qtd <= 0) {
      dizer("Informe uma quantidade maior que zero.", "erro");
      r.qtd.current.focus();
      return;
    }
    setEnviando(true);
    try {
      const resp = await (await postMovimentacao(dados)).json();
      if (!resp.ok) throw new Error(resp.erro || "erro no servidor");
      const casaNome = (CFG.casas.find((c) => c.chave === resp.casa) || {}).nome || resp.casa;
      dizer(html`<strong>${resp.tipo_nome}</strong> de ${fmt(resp.qtd, 3)} ${resp.un} —
        ${" "}${resp.insumo_nome}, ${casaNome}, ${resp.data.split("-").reverse().join("/")}.
        <br /><span class="acao-msg-sub">Total do dia neste movimento: ${fmt(resp.total_no_dia, 3)} ${resp.un}.</span>`,
        "ok", html`<button class="acao-link" data-recarregar="1" onClick=${() => location.reload()}>Atualizar a tela</button>`);
      r.qtd.current.value = "";
      r.qtd.current.focus();
    } catch (e) {
      dizer("Não consegui registrar: " + e.message, "erro");
    } finally {
      setEnviando(false);
    }
  };

  return html`
    <div class="acao-grade">
      <label class="campo"><span>Data</span><input type="date" id="mv-data" ref=${r.data} defaultValue=${hojeISO()} /></label>
      <label class="campo"><span>Casa</span><select id="mv-casa" ref=${r.casa}>${cfg.casas.map((c) =>
        html`<option key=${c.chave} value=${c.chave}>${c.nome}</option>`)}</select></label>
      <label class="campo campo-largo"><span>Insumo</span><select id="mv-insumo" ref=${r.insumo}>${cfg.insumos
        // Linha calculada não é destino de lançamento: a chegada de salmão
        // entra na libragem que chegou, e o equivalente se recalcula dela.
        .filter((i) => !i.derivado)
        .map((i) => html`<option key=${i.chave} value=${i.chave}>${i.nome} (${i.un})</option>`)}</select></label>
      <label class="campo campo-largo"><span>Movimento</span><select id="mv-tipo" ref=${r.tipo}>${TIPOS.map(([v, t]) =>
        html`<option key=${v} value=${v}>${t}</option>`)}</select></label>
      <label class="campo"><span>Quantidade</span>
        <input type="text" id="mv-qtd" ref=${r.qtd} inputMode="decimal" placeholder="0,000"
          onKeyDown=${(e) => { if (e.key === "Enter") gravar(); }} /></label>
    </div>
    <p class="acao-nota" id="mv-nota">Entrada, saída e desperdício <strong>somam</strong> ao que já foi
      lançado no dia. A contagem final <strong>substitui</strong> o valor.</p>
    <button class="botao primario acao-enviar" id="mv-gravar" disabled=${enviando} onClick=${gravar}>
      ${enviando ? "Registrando…" : "Registrar Movimentação"}</button>`;
}

// ------------------------------------------------------------------ ordem de compra
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

function TelaOrdem({ dizer }) {
  const [b, setB] = useState(BASE_OC);
  const [itens, setItens] = useState([]);
  const [catalogo, setCatalogo] = useState([]);
  const [criando, setCriando] = useState(false);
  const [montando, setMontando] = useState(false);
  const r = { forn: useRef(), unidade: useRef(), data: useRef(), item: useRef(), qtd: useRef(), preco: useRef() };
  useEffect(() => { if (!b) base().then(setB); }, []);
  if (!b) return html`<p class="acao-carregando">Carregando cadastro…</p>`;
  if (b.erro) return html`<p class="acao-nota">Cadastro indisponível: ${b.erro}</p>`;

  const fornecedorEscolhido = () => {
    const t = chave(r.forn.current.value);
    if (!t) return null;
    return BASE_OC.fornecedores.find((f) => chave(f.chave) === t)
        || BASE_OC.fornecedores.find((f) => chave(f.razao) === t)
        || BASE_OC.fornecedores.find((f) => chave(f.chave).includes(t) || chave(f.razao).includes(t))
        || null;
  };
  const catalogoDoFornecedor = () => {
    const f = fornecedorEscolhido();
    setCatalogo(f ? BASE_OC.produtos.filter((p) => chave(p.fornecedor) === chave(f.chave)) : []);
  };
  // Preço vem do catálogo assim que o item é reconhecido: é o preço negociado,
  // e digitar de novo é a chance de errar um dígito.
  const precoDoItem = () => {
    const f = fornecedorEscolhido();
    if (!f) return;
    const achado = BASE_OC.produtos.find((p) => chave(p.fornecedor) === chave(f.chave)
      && chave(p.produto) === chave(r.item.current.value));
    if (achado) r.preco.current.value = achado.preco > 0 ? fmt(achado.preco) : "";
  };
  const incluirItem = () => {
    const f = fornecedorEscolhido();
    if (!f) { dizer("Escolha o fornecedor primeiro.", "erro"); r.forn.current.focus(); return; }
    const nome = r.item.current.value.trim();
    if (!nome) { r.item.current.focus(); return; }
    const achado = BASE_OC.produtos.find((p) => chave(p.fornecedor) === chave(f.chave)
      && chave(p.produto) === chave(nome));
    // O item é montado AGORA, antes de limpar os campos: a função passada ao
    // setItens só roda depois, e leria os campos já zerados.
    const novo = { nome: achado ? achado.produto : nome, un: achado ? achado.un : "Un",
      qtd: num(r.qtd.current.value) || 1, preco: num(r.preco.current.value) };
    setItens((v) => v.concat([novo]));
    r.item.current.value = ""; r.qtd.current.value = "1"; r.preco.current.value = "";
    r.item.current.focus();
  };
  const criarOrdem = async () => {
    const f = fornecedorEscolhido();
    if (!f) { dizer("Escolha um fornecedor do cadastro.", "erro"); return; }
    if (!itens.length) { dizer("Inclua pelo menos um item.", "erro"); return; }
    setCriando(true);
    try {
      const resp = await (await postOrdemNova({
        unidade_oc: r.unidade.current.value,
        fornecedor: f.chave, fornecedor_base: f.chave,
        data: r.data.current.value || hojeISO(),
        origem: "avulsa",
        oc: { dataEmissao: hojeBR(), prazoFaturado: f.prazoFat || "", prazoEntrega: f.prazoEntrega || "" },
        itens,
      })).json();
      if (!resp.ok) throw new Error(resp.erro || "erro no servidor");
      const total = itens.reduce((s, i) => s + i.qtd * i.preco, 0);
      dizer(html`Ordem de <strong>${f.chave}</strong> criada com ${itens.length} item(ns)
        — R$ ${fmt(total)}. Ela entrou na fila como pendente; o PDF é gerado em Ordens de Compras.`,
        "ok", html`<a class="acao-link" href=${"ordens.html?f=" + encodeURIComponent(f.chave)}>Abrir a Ordem</a>`);
      setItens([]);
      r.item.current.value = "";
    } catch (e) {
      dizer("Não consegui criar a ordem: " + e.message, "erro");
    } finally {
      setCriando(false);
    }
  };
  // Prévia do documento, antes de criar a ordem. O PDF é montado pelo mesmo
  // `oc-pdf.js` que gera a OC de verdade — prévia desenhada de outro jeito
  // mostraria um documento que não é o que o fornecedor vai receber.
  const verPrevia = async () => {
    const f = fornecedorEscolhido();
    if (!f) { dizer("Escolha um fornecedor do cadastro.", "erro"); return; }
    if (!itens.length) { dizer("Inclua pelo menos um item.", "erro"); return; }
    setMontando(true);
    try {
      await prepararPDF();
      const bb = await base();
      const uni = bb.unidades.find((u) => chave(u.chave) === chave(r.unidade.current.value)) || {};
      const obs = (bb.observacoes || []).find((o) => chave(o.fornecedor) === chave(f.chave));
      // número ainda não existe: a prévia não reserva numeração, senão um
      // documento que talvez nem vire ordem já teria queimado um número
      montarPDF({
        numero: "prévia", unidade: uni, fornecedor: f, fornecedorNome: f.chave,
        dataEmissao: hojeBR(), dataEntrega: "", horario: "",
        pagamento: "Boleto", parcelas: "1x", frete: "CIF",
        prazoFaturado: f.prazoFat || "", prazoEntrega: f.prazoEntrega || "",
        obs: obs ? obs.texto : "", itens,
      }, true);
      dizer(html`Prévia aberta em outra aba. Ela <strong>não</strong> reserva número de OC — ${""}o número só é puxado quando a ordem é gerada em Ordens de Compras.`, "");
    } catch (e) {
      dizer("Não consegui montar a prévia: " + e.message, "erro");
    } finally {
      setMontando(false);
    }
  };

  const total = itens.reduce((s, i) => s + i.qtd * i.preco, 0);
  return html`
    <div class="acao-grade">
      <label class="campo campo-largo"><span>Fornecedor</span>
        <input id="oc-forn" ref=${r.forn} list="oc-forn-lista" autoComplete="off" placeholder="digite as primeiras letras"
          onInput=${catalogoDoFornecedor} />
        <datalist id="oc-forn-lista">${b.fornecedores.map((f) =>
          html`<option key=${f.chave} value=${f.chave}>${f.razao}</option>`)}</datalist></label>
      <label class="campo"><span>Unidade</span><select id="oc-unidade" ref=${r.unidade}>${b.unidades.map((u) =>
        html`<option key=${u.chave} value=${u.chave}>${u.chave}</option>`)}</select></label>
      <label class="campo"><span>Data</span><input type="date" id="oc-data" ref=${r.data} defaultValue=${hojeISO()} /></label>
    </div>

    <div class="acao-item">
      <label class="campo campo-largo"><span>Item</span>
        <input id="oc-item" ref=${r.item} list="oc-item-lista" autoComplete="off" placeholder="produto do catálogo"
          onInput=${precoDoItem}
          onKeyDown=${(e) => { if (e.key === "Enter") { e.preventDefault(); incluirItem(); } }} />
        <datalist id="oc-item-lista">${catalogo.map((p, n) =>
          html`<option key=${n} value=${p.produto}>${p.un} · R$ ${fmt(p.preco)}</option>`)}</datalist></label>
      <label class="campo"><span>Qtd.</span><input id="oc-qtd" ref=${r.qtd} inputMode="decimal" defaultValue="1" /></label>
      <label class="campo"><span>Preço</span><input id="oc-preco" ref=${r.preco} inputMode="decimal" placeholder="0,00" /></label>
      <button class="botao" id="oc-add" onClick=${incluirItem}>+ Adicionar à ordem</button>
      <span class="acao-nota" id="oc-dica">Uma ordem tem vários itens: preencha item,
        quantidade e preço e adicione. Repita para cada produto; a lista aparece abaixo.</span>
    </div>

    <div id="oc-lista">${!itens.length
      ? html`<p class="acao-nota">Nenhum item incluído ainda.</p>`
      : html`<div class="acao-itens">${itens.map((i, n) => html`
          <div key=${n} class="acao-item-linha">
            <span class="ai-nome">${i.nome}<small>${fmt(i.qtd, 3)} ${i.un} × R$ ${fmt(i.preco)}</small></span>
            <span class="ai-val">${i.qtd * i.preco > 0 ? "R$ " + fmt(i.qtd * i.preco) : "—"}</span>
            <button class="botao-mini" data-tira=${n} title="Remover"
              onClick=${() => setItens((v) => v.filter((_, k) => k !== n))}>✕</button>
          </div>`)}
          <div class="acao-item-total"><span>Total</span><strong>R$ ${fmt(total)}</strong></div>
        </div>`}</div>
    <div class="acao-botoes">
      <button class="botao" id="oc-previa" disabled=${montando} onClick=${verPrevia}>${montando ? "Montando…" : "Ver prévia da OC"}</button>
      <button class="botao primario" id="oc-criar" disabled=${criando} onClick=${criarOrdem}>${criando ? "Criando…" : "Criar Ordem"}</button>
    </div>`;
}

// ------------------------------------------------------------------ conversão
function TelaSalmao() {
  const [bruto, setBruto] = useState("");
  // Os fatores são lidos ao abrir e a cada tecla, como no acoes.js — não a
  // cada desenho: reabrir o painel não troca o número que já está na tela.
  const [f, setF] = useState(fatores);
  const campo = useRef();
  useEffect(() => { campo.current && campo.current.focus(); }, []);
  const preco = num(bruto);
  let saida;
  if (preco <= 0) {
    saida = html`<p class="acao-nota">Informe o valor por quilo do peixe inteiro eviscerado.</p>`;
  } else {
    // O bandado é o mesmo peixe um passo antes do filé: cabeça, espinhaço,
    // espinha e líquido saem como descarte e não absorvem custo, então o quilo
    // do inteiro se concentra no que sobra. É a linha que vai para a câmara.
    const bandado = f.bandado > 0 ? preco / f.bandado : 0;
    // a raspa absorve o custo do próprio peso; o que sobra sobe para o filé
    const comPele = f.file_com_pele > 0 ? (preco - f.raspa * preco) / f.file_com_pele : 0;
    const semPele = f.file_limpo > 0 ? comPele / f.file_limpo : 0;
    const linha = (nome, valor, nota) => html`
      <div class="cv-linha"><span class="cv-item">${nome}<small>${nota}</small></span>
        <span class="cv-val">R$ ${fmt(valor)}</span></div>`;
    saida = html`<div class="acao-itens">
      ${linha("Salmão bandado", bandado, `armazenamento · rendimento de ${fmt(f.bandado * 100, 2)}%`)}
      ${linha("Filé com pele", comPele, `rendimento de ${fmt(f.file_com_pele * 100, 2)}%`)}
      ${linha("Filé sem pele", semPele, `rendimento de ${fmt(f.file_com_pele * f.file_limpo * 100, 2)}%`)}
      ${linha("Raspa", preco, "absorve o custo do próprio peso")}
    </div>`;
  }
  return html`
    <div class="acao-grade">
      <label class="campo campo-largo"><span>Preço pago por quilo do inteiro</span>
        <input id="cv-preco" ref=${campo} inputMode="decimal" placeholder="R$ 0,00"
          value=${bruto} onInput=${(e) => { setBruto(e.target.value); setF(fatores()); }} onChange=${() => {}} /></label>
    </div>
    <div id="cv-saida">${saida}</div>
    <p class="acao-nota">Mesmos fatores da tela de Conversão de Salmão — se você recalibrou lá,
      o cálculo aqui acompanha.${" "}
      <a href="conversao.html">Abrir a tela completa</a></p>`;
}

// ------------------------------------------------------------------ painel
export function AcoesRapidas() {
  const [aberto, setAberto] = useState(false);
  const [tela, setTela] = useState("menu");
  const [conversa, setConversa] = useState([]);
  const corpo = useRef(), caixaConversa = useRef();

  const alternar = useCallback((forcar) => setAberto((a) => (forcar === undefined ? !a : forcar)), []);
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, []);
  // Ao abrir, o foco vai para o primeiro campo ou botão do corpo.
  useEffect(() => {
    if (!aberto || !corpo.current) return;
    const primeiro = corpo.current.querySelector("input, select, button");
    if (primeiro) primeiro.focus();
  }, [aberto]);
  useEffect(() => {
    if (caixaConversa.current) caixaConversa.current.scrollTop = caixaConversa.current.scrollHeight;
  }, [conversa]);

  // Mensagem no topo do painel: fica registrado o que já foi feito nesta sessão.
  const dizer = useCallback((texto, tipo, extra) => {
    setConversa((c) => c.concat([{ id: c.length, texto, tipo: tipo || "", extra }]));
  }, []);

  const info = ACOES[tela];
  return html`
    <button class=${"acao-botao" + (aberto ? " aberto" : "")} id="acao-botao" title="Ações rápidas"
      aria-label="Ações rápidas" onClick=${() => alternar()}>
      <${Icone} d=${ICONE.mais} tam=${22} />
    </button>
    <section class="acao-painel" id="acao-painel" hidden=${!aberto} aria-label="Ações rápidas">
      <header class="acao-cabeca">
        <button class="acao-voltar" id="acao-voltar" title="Voltar" hidden=${!info} onClick=${() => setTela("menu")}>
          <${Icone} d=${ICONE.voltar} tam=${16} /></button>
        <h2 id="acao-titulo">${info ? info.titulo : "Ações Rápidas"}</h2>
        <button class="acao-fechar" id="acao-fechar" title="Fechar" onClick=${() => alternar(false)}>
          <${Icone} d=${ICONE.fechar} tam=${16} /></button>
      </header>
      <div class="acao-conversa" id="acao-conversa" ref=${caixaConversa}>
        ${conversa.map((m) => html`<div key=${m.id} class=${"acao-msg " + m.tipo}>${m.texto}${m.extra
          ? html`<div class="acao-msg-acoes">${m.extra}</div>` : null}</div>`)}
      </div>
      <div class="acao-corpo" id="acao-corpo" ref=${corpo}>
        ${tela === "menu" ? html`<${TelaMenu} irPara=${setTela} />`
          : tela === "movimentacao" ? html`<${TelaMovimentacao} dizer=${dizer} />`
          : tela === "ordem" ? html`<${TelaOrdem} dizer=${dizer} />`
          : html`<${TelaSalmao} />`}
      </div>
    </section>`;
}
