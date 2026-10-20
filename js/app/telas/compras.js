// ============================================================================
// Projeção de Compras — o modelo do PCPOE, sem os vínculos externos.
//
//   Duração do estoque = (estoque + trânsito) ÷ (média diária × fator)
//   Dias a cobrir      = dias desejados − duração atual
//   Pedido             = dias a cobrir × média diária × fator
//
// Os dias desejados são digitados por item na Senador Lemos (SL) e valem para
// o mesmo item nas outras casas. Item sem número próprio segue o "Dias a cobrir
// (padrão)" do topo. A média diária
// sai, por padrão, dos últimos 14 dias; em semana atípica (feriado, evento) dá
// para escolher, item a item, quais dias entram na média.
//
// O salmão é medido em peixes e pedido em quilos: a conversão (30 kg por caixa
// ÷ 7 peixes por caixa) vive em dados/compras.json, à vista de quem precisar ajustar.
//
// O pedido mora num objeto só (a resposta de /api/projecao), alterado aos
// poucos como na tela antiga — dias da média, quantidade ajustada, produto da
// OC, repartição do salmão. Na casa à vista, trânsito, fator e fornecedor valem
// como estão DIGITADOS (o "rascunho"), e só passam ao objeto ao trocar de casa
// ou salvar: é assim que "1.500" digitado vira 1500 depois da troca, e que o
// consolidado das outras casas sai do que já foi guardado. O React só redesenha.
// ============================================================================
import { html, useState, useEffect, useRef, Fragment } from "../html.js";
import { num, fmt, brDate, hojeLocal } from "../formato.js";
import * as api from "../api.js";
import { aviso as avisoBase, Estado } from "../componentes/Aviso.js";
import { montarTela } from "../montar.js";

const aviso = (texto, tipo) => avisoBase(texto, tipo, 3400);   // o tempo que esta tela sempre usou

// Opções da lista de dias a cobrir. O padrão de Parâmetros ou o dia salvo no
// pedido entra na lista mesmo que não esteja aqui.
const OPCOES_DIAS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 18, 21, 25, 28, 30, 35, 40, 45, 60];
const DOW = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
// Casa mostrada no consolidado. "" = todas juntas. Fica no navegador porque é
// preferência de leitura, não dado do pedido — e quem trabalha uma casa por vez
// não quer reescolher a cada abertura da tela.
const CONS_KEY = "cde_consolidado_casa_v1";
const CASA_DIAS = "SL";
const CHAVE_SALMAO = "salmao_equivalente";
const CAB = ["Insumo", "Estoque", "Trânsito", "Média/dia", "Fator", "Duração",
             "Dias a cobrir", "Pedido", "Fornecedor"];

const listaDias = (dias) => OPCOES_DIAS.includes(dias) ? OPCOES_DIAS
  : OPCOES_DIAS.concat([dias]).sort((a, b) => a - b);
const norm = (t) => String(t == null ? "" : t)
  .normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();

// ------------------------------------------------------------------ média
// Dias escolhidos para a média: null = os da janela padrão. A conta é a mesma
// do servidor (media_dos_dias): só dia com consumo lançado entra, e a média
// divide pelos dias escolhidos que têm lançamento.
const diasEscolhidos = (ins) => Array.isArray(ins.dias_media) ? ins.dias_media
  : (ins.dias_media_padrao || []);

function mediaDe(ins) {
  if (!Array.isArray(ins.dias_media)) return { media: ins.media_diaria, n: ins.dias_com_uso };
  const alvo = new Set(ins.dias_media);
  const usos = (ins.historico || []).filter((h) => alvo.has(h.data)).map((h) => h.uso);
  return { media: usos.length ? usos.reduce((a, b) => a + b, 0) / usos.length : 0, n: usos.length };
}

function rotuloDia(iso) {
  const d = new Date(iso + "T12:00:00");
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${DOW[d.getDay()]}`;
}

// Lula, tentaculo e atum: a casa CONTA o processado e COMPRA o in natura. A
// linha ja vem convertida para in natura pelo servidor; o selo diz com que
// rendimento, e se ele foi medido num processamento real ou ainda e a media de
// partida — a diferenca entre "o pedido saiu da balanca" e "o pedido saiu de um
// palpite do meio da faixa".
function Selo({ i }) {
  const p = i.processamento;
  if (!p) return null;
  return p.medido
    ? html` <span class="selo-mini" title=${"Convertido para in natura pelo rendimento"
        + ` medido em ${brDate(p.rendimento_de)}: ${fmt(p.rendimento * 100, 2)}%`}>${fmt(p.rendimento * 100, 1) + "%"}</span>`
    : html` <span class="selo-mini aviso" title=${"Nenhum processamento lançado ainda —"
        + ` usando o rendimento médio de partida (${fmt(p.rendimento_padrao * 100, 0)}%).`
        + " Lance o processamento no dia para o pedido usar o rendimento real."}>${fmt(p.rendimento_padrao * 100, 0) + "% est."}</span>`;
}

function dicaEstoque(i) {
  const base = `lançado em ${brDate(i.estoque_de)}`;
  const p = i.processamento;
  if (!p) return base;
  return `${base} — ${fmt(p.estoque_in_natura, 3)} in natura + ` +
         `${fmt(p.estoque_processado, 3)} processado ÷ ${fmt(p.rendimento * 100, 2)}%`;
}

// Os dias que formam a média do item: um quadradinho por dia, com o consumo
// daquele dia ao lado ("10/10 sex — 19 Px"). Os dias da janela vêm marcados;
// desmarcar o feriado tira o feriado da média, marcar um dia de 30 dias atrás
// põe na conta um dia parecido com o que vem.
const UN_INTEIRA = ["Px", "Pxs", "Pct", "Bng"];

function BlocoDias({ ins, proj, casaNome, acao, marcar }) {
  const hist = ins.historico || [];
  if (!hist.length) return html`<p class="fonte">${`Sem consumo lançado nos últimos ${proj.historico_dias} dias.`}</p>`;
  const marcados = new Set(diasEscolhidos(ins));
  const janela = new Set(ins.dias_media_padrao || []);
  const m = mediaDe(ins);
  // o equivalente de salmão sai fracionado (11,6 peixes): uma casa basta
  const dec = UN_INTEIRA.includes(ins.un) ? 1 : 2;
  const jan = proj.janela_media_dias;
  return html`<div class="dias-caixa">
    <div class="dias-topo">
      <span>Média de <strong>${m.n}</strong> dia(s): <strong>${fmt(m.media, 3) + " " + ins.un + "/dia"}</strong>${" "}${
        Array.isArray(ins.dias_media) ? html`<span class="selo-mini aviso">dias escolhidos</span>`
          : html`<span class="selo-mini">${`últimos ${jan} dias`}</span>`}</span>
      <span style=${{ flex: 1 }}></span>
      <button type="button" class="botao-mini dias-acao" data-acao="padrao" data-k=${ins.chave}
        onClick=${() => acao("padrao", ins)}>${`Voltar aos últimos ${jan} dias`}</button>
      <button type="button" class="botao-mini dias-acao" data-acao="nenhum" data-k=${ins.chave}
        onClick=${() => acao("nenhum", ins)}>Desmarcar todos</button>
      <button type="button" class="botao-mini dias-acao" data-acao="todos-itens" data-k=${ins.chave}
        title=${`Usa estes mesmos dias em todos os itens de ${casaNome}`}
        onClick=${() => acao("todos-itens", ins)}>Usar estes dias em todos os itens da casa</button>
    </div>
    <div class="dias-grade">${hist.slice().sort((a, b) => a.data.localeCompare(b.data)).map((h) => html`
      <label key=${h.data} class=${"dia-chip" + (marcados.has(h.data) ? " marcado" : "") + (janela.has(h.data) ? " janela" : "") + (h.uso < 0 ? " neg" : "")}
        title=${h.uso < 0 ? "Consumo negativo: divergência de contagem em dia de recebimento. Marcado, ele rebaixa a média." : undefined}>
        <input type="checkbox" data-dia=${h.data} data-k=${ins.chave} checked=${marcados.has(h.data)}
          onChange=${(e) => marcar(ins, h.data, e.target.checked)} />
        <span class="dia-data">${rotuloDia(h.data)}</span>
        <span class="dia-uso">${fmt(h.uso, dec) + " " + ins.un}</span>
      </label>`)}</div>
  </div>`;
}

// Campo com a semântica do "change" nativo: avisa ao sair (ou no Enter) e só
// se o texto mudou desde que o foco entrou. Enquanto tem o foco, guarda o que
// se digita; fora dele, mostra `valor`.
function CampoMudanca({ valor, aoMudar, ...resto }) {
  const [texto, setTexto] = useState(null);
  const naEntrada = useRef(null);
  return html`<input ...${resto} value=${texto === null ? valor : texto}
    onFocus=${(e) => { naEntrada.current = e.target.value; setTexto(e.target.value); }}
    onInput=${(e) => setTexto(e.target.value)} onChange=${() => {}}
    onKeyDown=${(e) => { if (e.key === "Enter") e.target.blur(); }}
    onBlur=${(e) => { const t = e.target.value; setTexto(null); if (t !== naEntrada.current) aoMudar(t); }} />`;
}

// ------------------------------------------------------------------ tela
function Compras() {
  // ---- o pedido (objeto alterado aos poucos) e o que se digita na casa à vista
  const P = useRef(null);
  const rasc = useRef({});            // chave -> { transito, fator, fornecedor, dias } (texto)
  const sujo = useRef(false);
  const casaRef = useRef("SL");
  const diasRef = useRef(7);
  const [, setVersao] = useState(0);
  const redesenhar = () => setVersao((v) => v + 1);
  const [versaoTabela, setVersaoTabela] = useState(0);   // muda quando a tabela é refeita do objeto
  const [data, setData] = useState(hojeLocal);
  const [opcoesDias, setOpcoesDias] = useState(() => listaDias(7));
  const [responsaveis, setResponsaveis] = useState(null);
  const [resp, setResp] = useState("");
  const [consCasa, setConsCasa] = useState(() => {
    let c = null;
    try { c = localStorage.getItem(CONS_KEY); } catch (e) { /* sem storage */ }
    return c === null ? "SL" : c;     // 1ª vez: uma casa, não as quatro
  });
  const [msgTela, setMsgTela] = useState(null);
  const [est, setEst] = useState({ texto: "", classe: "" });
  const [salvando, setSalvando] = useState(false);
  const estado = (texto, classe) => setEst({ texto: texto || "", classe: classe || "" });
  const marcarSujo = () => { sujo.current = true; estado("Não salvo", "erro"); };

  const proj = P.current;
  const CASA = casaRef.current, DIAS = diasRef.current;
  const insumoDa = (casa, chave) => P.current.casas[casa].insumos.find((i) => i.chave === chave);
  const fornecedores = proj ? (proj.config.fornecedores || []) : [];

  // Dias a cobrir do item: o digitado na SL vale para as quatro casas; vazio,
  // vale o padrão do topo.
  const diasDe = (chave) => {
    const sl = insumoDa(CASA_DIAS, chave);
    const v = sl ? sl.dias_item : null;
    return v !== null && v !== undefined && v !== "" ? num(v) : diasRef.current;
  };

  function calcular(ins, campos) {
    const media = mediaDe(ins).media, fator = num(campos.fator) || 1;
    const disponivel = ins.estoque + num(campos.transito);
    const consumoDia = media * fator;
    const duracao = consumoDia > 0 ? disponivel / consumoDia : (disponivel > 0 ? Infinity : 0);
    const cobrir = Math.max(0, diasDe(ins.chave) - (isFinite(duracao) ? duracao : 0));
    const qtd = cobrir * consumoDia;
    // o peso da caixa varia; os peixes por caixa nao. Guardamos os dois e
    // derivamos o fator, em vez de esconder a conta num numero solto.
    const c = ins.conversao;
    const conv = c ? (c.kg_por_caixa / c.peixes_por_caixa) : 1;
    const calculado = qtd * conv;
    // Ajuste feito no resumo vence o cálculo. O calculado segue junto para a
    // tela poder mostrar de quanto foi o desvio, em vez de só esquecer o número.
    const manual = ins.qtd_manual;
    const ajustado = manual !== null && manual !== undefined && manual !== "";
    return { duracao, cobrir, qtd, calculado, ajustado,
             pedido: ajustado ? num(manual) : calculado, conv: conv,
             un_pedido: c ? c.un_pedido : ins.un };
  }

  // O que está digitado na casa à vista: o rascunho; nas outras, o objeto.
  const camposDe = (ck, ins) => (ck === casaRef.current && rasc.current[ins.chave])
    ? rasc.current[ins.chave]
    : { transito: ins.transito, fator: ins.fator, fornecedor: ins.fornecedor };

  // A tabela é refeita do objeto (carga, troca de casa, dias aplicados à casa):
  // os campos voltam a mostrar o que está guardado.
  function refazerTabela() {
    const r = {};
    const forns = P.current.config.fornecedores || [];
    P.current.casas[casaRef.current].insumos.forEach((i) => {
      r[i.chave] = { transito: String(i.transito ?? ""), fator: String(i.fator ?? 1),
                     fornecedor: forns.includes(i.fornecedor) ? i.fornecedor : "",
                     dias: String(i.dias_item ?? "") };
    });
    rasc.current = r;
    setVersaoTabela((v) => v + 1);
  }

  // O que está digitado na casa à vista vai para o objeto do insumo. Precisa
  // acontecer antes de trocar de casa, senão o redesenho apaga o que foi digitado.
  function guardarLinhas() {
    if (!P.current) return;
    P.current.casas[casaRef.current].insumos.forEach((ins) => {
      const c = rasc.current[ins.chave];
      if (!c) return;
      ins.transito = c.transito === "" ? null : num(c.transito);
      ins.fator = num(c.fator) || 1;
      ins.fornecedor = c.fornecedor || null;
    });
  }

  // ------------------------------------------------------------------ carregar
  async function carregar(dataPedido) {
    if (sujo.current && !confirm("Há alterações não salvas. Recarregar mesmo assim?")) return;
    estado("Carregando…");
    let d;
    try {
      d = await (await api.getProjecao(dataPedido, diasRef.current)).json();
    } catch (e) {
      setMsgTela("Servidor fora do ar. Rode o Servidor.bat.");
      return;
    }
    sujo.current = false; estado("");
    P.current = d;
    const cfg = d.config;
    // Cada data é um pedido: o que já foi salvo volta com os dias com que foi
    // salvo; pedido novo começa no padrão de Parâmetros.
    diasRef.current = d.dias_salvo || cfg.dias_a_cobrir_padrao || 7;
    setOpcoesDias(listaDias(diasRef.current));
    setResponsaveis((r) => r || (cfg.responsaveis || []));
    const rc = d.casas[casaRef.current].responsavel;
    if (rc) setResp(rc);
    // O seletor do consolidado é INDEPENDENTE das abas de cima: dá para conferir
    // a tabela de uma casa enquanto se olha o pedido de outra.
    setConsCasa((c) => d.casas[c] ? c : "");
    setMsgTela(null);
    refazerTabela();
    redesenhar();
  }
  useEffect(() => { carregar(data); }, []);
  useEffect(() => {
    const sair = (e) => { if (sujo.current) e.preventDefault(); };
    window.addEventListener("beforeunload", sair);
    return () => window.removeEventListener("beforeunload", sair);
  }, []);

  // ------------------------------------------------------------------ salvar
  async function salvar() {
    guardarLinhas();
    // o select mostra "—" quando o nome guardado não está mais na lista
    P.current.casas[casaRef.current].responsavel =
      ((responsaveis || []).includes(resp) ? resp : "") || null;
    const corpo = { data: P.current.data, dias_cobrir: diasRef.current, casas: {} };
    Object.entries(P.current.casas).forEach(([ck, casa]) => {
      const insumos = {};
      casa.insumos.forEach((i) => {
        insumos[i.chave] = { transito: i.transito, fator: i.fator,
                             dias_cobrir: diasDe(i.chave), fornecedor: i.fornecedor,
                             dias_item: ck === CASA_DIAS ? (i.dias_item ?? null) : null,
                             dias_media: Array.isArray(i.dias_media) ? i.dias_media : null,
                             qtd_manual: i.qtd_manual ?? null,
                             produto_oc: i.produto_oc ?? null,
                             split: i.split ?? null };
      });
      corpo.casas[ck] = { responsavel: casa.responsavel, insumos: insumos };
    });
    setSalvando(true); estado("Salvando…");
    try {
      const r = await (await api.postPedido(corpo)).json();
      if (!r.ok) throw new Error(r.erro || "erro no servidor");
      sujo.current = false; estado("Salvo", "ok");
      aviso("Pedido de " + brDate(P.current.data) + " salvo.", "bom");
    } catch (e) {
      estado("Falha ao salvar", "erro");
      aviso("Não consegui salvar: " + e.message, "mau");
    } finally { setSalvando(false); }
  }

  // Leva para a tela de Ordens de Compras já na ordem deste fornecedor. Salva
  // antes, senão a ordem ainda não existe do outro lado.
  async function editarOC(forn) {
    if (sujo.current) {
      if (!confirm("As alterações precisam ser salvas antes de abrir a ordem. Salvar agora?")) return;
      await salvar();
      if (sujo.current) return;                // salvar falhou: não navega
    }
    window.location = "ordens.html?f=" + encodeURIComponent(forn);
  }

  // ------------------------------------------------------------------ tabela
  const mudarCampo = (ins, c, valor) => {
    rasc.current[ins.chave] = { ...rasc.current[ins.chave], [c]: valor };
    if (c === "dias") {
      const v = valor.trim();
      ins.dias_item = v === "" ? null : Math.min(60, Math.max(1, num(v) || 1));
    }
    marcarSujo(); redesenhar();
  };
  const marcarDia = (ins, dia, sim) => {
    const sel = new Set(diasEscolhidos(ins));
    if (sim) sel.add(dia); else sel.delete(dia);
    ins.dias_media = [...sel].sort().reverse();
    marcarSujo(); redesenhar();
  };
  const acaoDias = (acao, ins) => {
    const casa = P.current.casas[casaRef.current];
    if (acao === "padrao") ins.dias_media = null;
    else if (acao === "nenhum") ins.dias_media = [];
    else if (acao === "todos-itens") {
      // Mesmos dias de calendário para todos — feriado é feriado para a casa
      // inteira. Dia sem consumo lançado num item simplesmente não conta nele.
      const padrao = !Array.isArray(ins.dias_media);
      const dias = diasEscolhidos(ins).slice();
      guardarLinhas();
      casa.insumos.forEach((o) => { o.dias_media = padrao ? null : dias.slice(); });
      aviso(`Dias de ${ins.nome} aplicados aos ${casa.insumos.length} itens de ${casa.nome}.`, "bom");
      marcarSujo(); refazerTabela(); redesenhar(); return;
    }
    marcarSujo(); redesenhar();
  };
  const trocarCasa = (ck) => { guardarLinhas(); casaRef.current = ck; refazerTabela(); redesenhar(); };

  // Funções que devolvem desenho, e não componentes: declaradas aqui dentro,
  // como componentes seriam um tipo novo a cada desenho e o React recriaria os
  // campos a cada tecla (quem digita perderia o foco).
  function tabela() {
    const casa = proj.casas[CASA];
    return html`<section class="cartao">
      <div class="cabeca"><h2>${casa.nome}</h2>
        <span class="fonte">Estoque do último lançamento de cada item</span></div>
      <div class="rolagem"><table><thead><tr>${CAB.map((h) => html`<th key=${h}>${h}</th>`)}</tr></thead>
      <tbody>${casa.insumos.map((i) => {
        const campos = rasc.current[i.chave];
        const r = calcular(i, campos);
        const m = mediaDe(i);
        return html`<${Fragment} key=${i.chave}>
        <tr data-k=${i.chave}>
          <td>${i.nome + " "}<span class="un">${"(" + i.un + ")"}</span><${Selo} i=${i} /></td>
          <td class="calc" title=${dicaEstoque(i)}>${fmt(i.estoque, 3)}</td>
          <td><input data-c="transito" type="text" inputmode="decimal" value=${campos.transito}
            onInput=${(e) => mudarCampo(i, "transito", e.target.value)} onChange=${() => {}} /></td>
          <td class="calc media">${fmt(m.media, 3) + " "}<button type="button"
            class=${"botao-mini abrir-dias" + (Array.isArray(i.dias_media) ? " ajustado" : "")}
            data-k=${i.chave} title="Escolher os dias que formam a média"
            onClick=${() => { i._diasAbertos = !i._diasAbertos; redesenhar(); }}>${m.n + " dia" + (m.n === 1 ? "" : "s")}</button></td>
          <td><input data-c="fator" type="text" inputmode="decimal" value=${campos.fator} style=${{ width: "64px" }}
            onInput=${(e) => mudarCampo(i, "fator", e.target.value)} onChange=${() => {}} /></td>
          <td class=${"calc dur" + (isFinite(r.duracao) && r.duracao < 3 ? " neg" : "")}>${
            r.duracao === Infinity ? "sem consumo" : fmt(r.duracao, 1) + " d"}</td>
          ${CASA === CASA_DIAS
            ? html`<td><input data-c="dias" type="text" inputmode="numeric" style=${{ width: "56px" }}
                 value=${campos.dias} placeholder=${DIAS}
                 title="Dias a cobrir deste item — vale também para as outras casas. Vazio: usa o padrão do topo"
                 onInput=${(e) => mudarCampo(i, "dias", e.target.value)} onChange=${() => {}} /></td>`
            : html`<td class="calc cobrir" title=${`Digitado na ${proj.casas[CASA_DIAS].nome} (SL) — vale para as quatro casas`}>${diasDe(i.chave) + " d"}</td>`}
          <td class="calc ped">${r.pedido <= 0.0005
            ? html`<span class="selo bom">Não pedir</span>`
            : html`<strong>${fmt(r.pedido, r.un_pedido === "Kg" ? 1 : 3)}</strong> <span class="un">${r.un_pedido}</span>${
                i.conversao ? html`<span class="msg-conv">${`${fmt(r.qtd, 1)} ${i.un} × ${fmt(r.conv, 3)} kg `}<span title="peso da caixa ÷ peixes por caixa">${
                  `(${i.conversao.kg_por_caixa} kg ÷ ${i.conversao.peixes_por_caixa} px)`}</span></span>` : null}`}</td>
          <td><select data-c="fornecedor" value=${campos.fornecedor}
            onChange=${(e) => mudarCampo(i, "fornecedor", e.target.value)}><option value="">Selecione</option>${
            fornecedores.map((f) => html`<option key=${f} value=${f}>${f}</option>`)}</select></td>
        </tr>
        <tr class="linha-dias" data-k=${i.chave} hidden=${!i._diasAbertos}>
          <td colSpan=${CAB.length}>${i._diasAbertos ? html`<${BlocoDias} ins=${i} proj=${proj} casaNome=${casa.nome}
            acao=${acaoDias} marcar=${marcarDia} />` : null}</td></tr>
        <//>`;
      })}</tbody></table></div>
    </section>`;
  }

  // ------------------------------------------------------------------ conciliação
  // O pedido consolidado fala a língua do CDE ("Camarão M"); a OC precisa falar a
  // língua do fornecedor ("CAMARÃO ROSA 31/50 DESC - SC 1KG"). O de-para vem
  // pronto do servidor (dados/vinculos.json) junto com o preço já negociado —
  // aqui só escolhemos, quando o insumo tem mais de um produto possível.
  function opcoesCatalogo(chaveInsumo, fornecedor) {
    const cad = (proj.fornecedor_cadastro || {})[fornecedor];
    const lista = (proj.catalogo || {})[chaveInsumo] || [];
    if (!cad) return [];
    return lista.filter((p) => norm(p.fornecedor) === norm(cad));
  }
  const produtoEscolhido = (ins, opcoes) => {
    const alvo = norm(ins.produto_oc || "");
    return opcoes.find((p) => norm(p.produto) === alvo) || opcoes[0] || null;
  };
  const partesSalmao = () => (proj.config && proj.config.salmao_partes) || [];

  // Quanto de peixe INTEIRO cada parte pedida consome. Pedir 10 kg de filé com
  // pele não tira 10 kg da necessidade: tira 10 ÷ 0,6716 = 14,9 kg de inteiro.
  function equivalenteDoSplit(ins) {
    const split = ins.split || {};
    return partesSalmao().reduce((soma, parte) => {
      const q = num((split[parte.chave] || {}).qtd);
      const rend = parte.rendimento || 1;
      return soma + (q > 0 && rend > 0 ? q / rend : 0);
    }, 0);
  }

  function resumoPartes(necessario, repartido) {
    const falta = necessario - repartido;
    if (repartido <= 0.0005) return "Nada repartido — o pedido sai inteiro em peixe inteiro.";
    if (falta > 0.05)
      return `Repartido: ${fmt(repartido, 1)} kg equivalentes · faltam ${fmt(falta, 1)} kg,
            que entram na OC como peixe inteiro.`;
    if (falta < -0.05)
      return `Repartido: ${fmt(repartido, 1)} kg equivalentes · ${fmt(-falta, 1)} kg acima do projetado.`;
    return `Repartido: ${fmt(repartido, 1)} kg equivalentes — cobre a necessidade inteira.`;
  }

  // Mexer na quantidade projetada é uma decisão, não um deslize de teclado:
  // pede confirmação mostrando de quanto para quanto, e desfaz se cancelar.
  function confirmarQtd(i, texto) {
    const novo = num(texto), antes = num(fmt(i.qtd, 1));
    const calc = num(i.calculado);
    if (Math.abs(novo - antes) < 0.0005) { redesenhar(); return; }
    const ins = insumoDa(i.casa, i.chave);
    const dif = calc > 0 ? ((novo - calc) / calc) * 100 : 0;
    const msg = `Alterar a quantidade de ${ins.nome} (${i.casa})?\n\n` +
      `De ${fmt(antes, 1)} para ${fmt(novo, 1)}\n` +
      `O cálculo projetou ${fmt(calc, 1)}` +
      (calc > 0 ? ` — a alteração fica ${dif > 0 ? "+" : ""}${fmt(dif, 1)}% em relação ao projetado.` : ".");
    if (!confirm(msg)) { redesenhar(); return; }
    // guardado no insumo: vale para a ordem de compra e sobrevive ao recálculo
    ins.qtd_manual = novo;
    marcarSujo(); redesenhar();
  }

  const mudarParte = (casa, parte, campo, valor) => {
    const ins = insumoDa(casa, CHAVE_SALMAO);
    ins._partesAbertas = true;
    ins.split = ins.split || {};
    const atual = ins.split[parte] || {};
    if (campo === "qtd") atual.qtd = valor === "" ? null : num(valor);
    else atual.produto = valor || null;
    ins.split[parte] = atual;
    marcarSujo(); redesenhar();
  };

  // Repartição do salmão. A projeção calcula a necessidade em peixe inteiro; a
  // compra pode ser feita em filé. Informar 10 kg de filé com pele não cobre
  // 10 kg da necessidade — cobre 14,9, porque 1 kg de inteiro vira 0,6716 kg de
  // filé. É essa conta que a linha de baixo mostra, para o pedido não encolher
  // sem ninguém perceber.
  function blocoPartes(i, ins, forn, colunas, repartido) {
    const split = ins.split || {};
    const aberto = !!ins._partesAbertas || repartido > 0;
    const ops = opcoesCatalogo(i.chave, forn);
    const falta = i.qtd - repartido;
    return html`<tr class="linha-partes" hidden=${!aberto} data-casa=${i.casa}>
      <td colSpan=${colunas}>
        <div class="partes-caixa">
          <div class="fonte">Necessidade projetada: <strong>${fmt(i.qtd, 1) + " kg"}</strong> de peixe inteiro. Informe quanto quer pedir de cada tipo — o que sobrar continua indo como peixe inteiro.</div>
          ${partesSalmao().map((parte) => {
            const atual = split[parte.chave] || {};
            const q = num(atual.qtd);
            const rend = parte.rendimento || 1;
            const alvo = norm(atual.produto || "");
            const sel = ops.find((p) => norm(p.produto) === alvo);
            return html`<div class="parte-linha" key=${parte.chave}>
              <span class="parte-nome">${parte.nome}<small>${fmt(rend, 4) + " kg por kg de inteiro"}</small></span>
              <${CampoMudanca} class="parte-qtd" type="text" inputmode="decimal" data-casa=${i.casa}
                data-parte=${parte.chave} valor=${q > 0 ? fmt(q, 1) : ""} placeholder="0,0"
                aoMudar=${(t) => mudarParte(i.casa, parte.chave, "qtd", t)} />
              <span class="un">Kg</span>
              <select class="parte-prod" data-casa=${i.casa} data-parte=${parte.chave} value=${sel ? sel.produto : ""}
                onChange=${(e) => mudarParte(i.casa, parte.chave, "produto", e.target.value)}>
                <option value="">Produto na OC…</option>
                ${ops.map((p) => html`<option key=${p.produto} value=${p.produto}>${p.produto + (p.preco > 0 ? " — R$ " + fmt(p.preco) : "")}</option>`)}
              </select>
              <span class="fonte parte-eq">${q > 0 && rend > 0 ? "consome " + fmt(q / rend, 1) + " kg de inteiro" : ""}</span>
            </div>`;
          })}
          <div class=${"partes-resumo" + (falta < -0.05 ? " neg" : "")}>${resumoPartes(i.qtd, repartido)}</div>
        </div>
      </td></tr>`;
  }

  // Uma linha do consolidado: quantidade, o produto do catálogo em que ela vira
  // e o custo estimado por esse preço. Salmão ganha a linha extra de repartição.
  function linhaConsolidada(i, forn) {
    const ins = insumoDa(i.casa, i.chave);
    const ops = opcoesCatalogo(i.chave, forn);
    const escolhido = produtoEscolhido(ins, ops);
    const colunas = consCasa ? 6 : 7;
    const custo = escolhido ? i.qtd * escolhido.preco : 0;
    const ehSalmao = i.chave === CHAVE_SALMAO && partesSalmao().length;
    const repartido = ehSalmao ? equivalenteDoSplit(ins) : 0;
    const seletor = ops.length
      ? html`<select class="prod-oc" data-casa=${i.casa} data-k=${i.chave} value=${escolhido ? escolhido.produto : ""}
          onChange=${(e) => { insumoDa(i.casa, i.chave).produto_oc = e.target.value || null; marcarSujo(); redesenhar(); }}>${
          ops.map((p) => html`<option key=${p.produto} value=${p.produto}>${p.produto + (p.preco > 0 ? " — R$ " + fmt(p.preco) : " — sem preço")}</option>`)}</select>`
      : html`<span class="fonte" title="Sem produto vinculado para este fornecedor">${"Sem vínculo — "}<a href="cadastros.html">cadastre o produto</a></span>`;
    return html`<${Fragment} key=${i.casa + "|" + i.chave}><tr>
        <td>${i.nome + (ehSalmao ? " " : "")}${ehSalmao ? html`<button class="botao-mini abrir-partes" data-casa=${i.casa}
          title="Pedir em filé em vez de peixe inteiro"
          onClick=${() => { const s = insumoDa(i.casa, CHAVE_SALMAO); s._partesAbertas = !s._partesAbertas; redesenhar(); }}>Repartir</button>` : null}</td>
        ${consCasa ? null : html`<td>${i.casa}</td>`}
        <td><${CampoMudanca} class=${"qtd-resumo" + (i.ajustado ? " ajustada" : "")} type="text"
               inputmode="decimal" data-casa=${i.casa} data-k=${i.chave}
               data-calc=${i.calculado} valor=${fmt(i.qtd, 1)}
               title=${i.ajustado ? "Ajustado à mão — o cálculo dava " + fmt(i.calculado, 1) : "Quantidade projetada pelo cálculo"}
               aoMudar=${(t) => confirmarQtd(i, t)} /></td>
        <td class="un">${i.un}</td>
        <td>${seletor}</td>
        <td class="calc">${escolhido && escolhido.preco > 0 ? "R$ " + fmt(custo) : "—"}</td>
        <td class="calc">${i.ajustado
          ? html`<span class="selo-mini" title="Quantidade alterada à mão">${fmt(i.calculado, 1) + " calc."}</span>`
          : "—"}</td>
      </tr>${ehSalmao ? blocoPartes(i, ins, forn, colunas, repartido) : null}<//>`;
  }

  // ------------------------------------------------------------------ consolidado
  function Consolidado() {
    const grupos = {};
    Object.entries(proj.casas).forEach(([ck, casa]) => {
      casa.insumos.forEach((ins) => {
        const campos = camposDe(ck, ins);
        const r = calcular(ins, campos);
        if (r.pedido <= 0.0005) return;
        const forn = campos.fornecedor || "Sem fornecedor";
        grupos[forn] = grupos[forn] || { forn: forn, itens: [], total: 0 };
        grupos[forn].itens.push({
          casa: ck, chave: ins.chave, nome: ins.nome, un: r.un_pedido,
          qtd: r.pedido, calculado: r.calculado, ajustado: r.ajustado });
        grupos[forn].total += r.pedido;
      });
    });
    // O cálculo acima é sempre das quatro casas — o filtro decide só o que
    // aparece. Somar apenas a casa escolhida daria um consolidado que muda de
    // valor conforme quem está olhando.
    let lista = Object.values(grupos).sort((a, b) => a.forn.localeCompare(b.forn));
    if (consCasa) {
      lista = lista
        .map((g) => Object.assign({}, g, { itens: g.itens.filter((i) => i.casa === consCasa) }))
        .filter((g) => g.itens.length);
    }
    const nomeCasa = consCasa ? (proj.casas[consCasa] || {}).nome : "";
    const itensTotais = lista.reduce((n, g) => n + g.itens.length, 0);
    const nota = itensTotais
      ? `${lista.length} fornecedor(es) · ${itensTotais} item(ns)` +
        (consCasa ? ` · só ${nomeCasa}` : " · as quatro casas somadas")
      : "";
    let corpo;
    if (!lista.length) {
      corpo = html`<p class="vazio">${consCasa
        ? html`${`Nenhum item a pedir para ${nomeCasa} com os parâmetros atuais.`}<br /><span class="fonte">Outra casa pode ter pedido — troque a casa acima ou escolha <strong>Todas as casas</strong>.</span>`
        : "Nenhum item a pedir com os parâmetros atuais."}</p>`;
    } else {
      // Um bloco por fornecedor: é assim que a compra acontece — uma ligação,
      // uma entrega. Item repetido em casas diferentes aparece uma vez por casa,
      // porque cada casa vira uma ordem separada.
      corpo = lista.map((g) => {
        const itens = g.itens.slice().sort((a, b) =>
          a.nome.localeCompare(b.nome) || a.casa.localeCompare(b.casa));
        return html`<div class="grupo-forn" key=${g.forn}>
          <div class="grupo-forn-cab">
            <h3>${g.forn}</h3>
            <span class="fonte">${itens.length + " item(ns)" + (consCasa ? ""
              : " · " + new Set(itens.map((i) => i.casa)).size + " casa(s)")}</span>
            <span style=${{ flex: 1 }}></span>
            ${g.forn === "Sem fornecedor"
              ? html`<span class="fonte">Escolha o fornecedor na tabela acima para gerar a ordem</span>`
              : html`<button class="botao editar-oc" data-forn=${g.forn} onClick=${() => editarOC(g.forn)}>Editar OC</button>`}
          </div>
          <table class="tabela-curta">
            <thead><tr><th>Item</th>${consCasa ? null : html`<th>Casa</th>`}<th>Quantidade</th><th>Un.</th>
              <th>Produto na OC</th><th>Custo estimado</th><th>Projetado</th></tr></thead>
            <tbody>${itens.map((i) => linhaConsolidada(i, g.forn))}</tbody>
          </table>
        </div>`;
      });
    }
    return { nota, corpo };
  }

  const cons = proj ? Consolidado() : { nota: "", corpo: null };

  return html`<main class="main-content">
    <div class="screen-header">
      <div>
        <h1>Projeção de Compras</h1>
        <p>Estoque e consumo médio vêm do histórico do sistema. Você informa o que está
           em trânsito, o fator e quantos dias quer cobrir.</p>
      </div>
      <div class="header-acoes">
        <${Estado} texto=${est.texto} classe=${est.classe} />
        <button id="btn-salvar" class="botao primario" disabled=${salvando} onClick=${salvar}>Salvar pedido</button>
      </div>
    </div>

    <section class="barra">
      <label class="campo"><span>Data do pedido</span><input type="date" id="data" value=${data}
        onChange=${(e) => { setData(e.target.value); carregar(e.target.value); }} /></label>
      <label class="campo" title="Vale para os itens sem dias próprios digitados na SL"><span>Dias a cobrir (padrão)</span>
        <select id="dias" style=${{ width: "120px" }} value=${DIAS}
          onChange=${(e) => { diasRef.current = num(e.target.value) || 7; marcarSujo(); redesenhar(); }}>${
          opcoesDias.map((d) => html`<option key=${d} value=${d}>${d + " dia" + (d > 1 ? "s" : "")}</option>`)}</select></label>
      <label class="campo"><span>Responsável</span><select id="responsavel" value=${resp}
        onChange=${(e) => setResp(e.target.value)}>${responsaveis ? html`<option value="">—</option>${
          responsaveis.map((r) => html`<option key=${r} value=${r}>${r}</option>`)}` : null}</select></label>
      <span class="fonte" id="janela-txt">${proj
        ? `Média diária dos últimos ${proj.janela_media_dias} dias, ou dos dias escolhidos no item · estoque do último lançamento`
        : ""}</span>
      <nav class="abas" id="abas-casas">${proj ? Object.entries(proj.casas).map(([ck, c]) =>
        html`<button key=${ck} data-c=${ck} class=${ck === CASA ? "ativa" : ""} title=${c.nome}
          onClick=${() => trocarCasa(ck)}>${ck}</button>`) : null}</nav>
    </section>

    <div id="tela">${msgTela ? html`<p class="vazio">${msgTela}</p>`
      : proj ? html`<${Fragment} key=${versaoTabela}>${tabela()}<//>` : null}</div>

    <section class="cartao">
      <div class="cabeca"><h2>Pedido consolidado por fornecedor</h2></div>
      <div class="filtros">
        <label class="campo"><span>Casa</span><select id="cons-casa" value=${consCasa}
          onChange=${(e) => { setConsCasa(e.target.value); try { localStorage.setItem(CONS_KEY, e.target.value); } catch (x) {} }}>${
          proj ? html`${Object.entries(proj.casas).map(([ck, c]) =>
            html`<option key=${ck} value=${ck}>${ck + " — " + c.nome}</option>`)}<option value="">Todas as Casas (juntas)</option>` : null}</select></label>
        <span class="fonte" id="cons-nota">${cons.nota}</span>
      </div>
      <div class="rolagem" id="consolidado">${cons.corpo}</div>
    </section>
  </main>`;
}

montarTela("compras", Compras);
