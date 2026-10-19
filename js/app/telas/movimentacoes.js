// ============================================================================
// Movimentações — o extrato do estoque.
//
// O lançamento diário guarda o dia inteiro num registro só, por casa. Aqui esse
// registro é aberto em uma linha por movimento, que é como a pergunta chega:
// "quando chegou camarão na Duque?", "quanto saiu daqui para o delivery?",
// "quanto se perdeu de anchova na semana passada?".
//
// O servidor faz o recorte (/api/movimentacoes) porque são oito meses de
// lançamento: filtrar no navegador significaria baixar o histórico inteiro a
// cada troca de filtro.
// ============================================================================
import { html, useState, useEffect, useRef } from "../html.js";
import { num, fmt, fmtQ, fmtPreco, fmtCentavos, fmtCheio, centavos, brDate,
         hojeISO, hojeLocal } from "../formato.js";
import * as api from "../api.js";
import { aviso as avisoBase, Estado } from "../componentes/Aviso.js";
import { FiltroInsumos, agrupar } from "../componentes/FiltroInsumos.js";
import { montarTela } from "../montar.js";

const AVISO_MS = 3400;      // o tempo de aviso que esta tela sempre usou
const aviso = (texto, tipo) => avisoBase(texto, tipo, AVISO_MS);

const COR_CASA = { SL: "var(--casa-sl)", DC: "var(--casa-dc)",
                   DLU: "var(--casa-dlu)", DLCN: "var(--casa-dlcn)" };
const corCasa = (ck) => COR_CASA[ck] || "var(--tinta-3)";
const SELO = { entrada: "bom", transferencia: "info", desperdicio: "ruim", consumo: "neutro" };
// Quem recebe cadastro de preço. Desperdício aparece no extrato mas não entra:
// o produto perdido foi pago na linha da chegada dele.
const TEM_PRECO = ["entrada", "transferencia"];
const ICO_MOV = {
  entrada: html`<polyline points="19 12 12 19 5 12"/><line x1="12" y1="5" x2="12" y2="19"/>`,
  transferencia: html`<polyline points="5 12 12 5 19 12"/><line x1="12" y1="19" x2="12" y2="5"/>`,
  desperdicio: html`<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>`,
  consumo: html`<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>`,
};
const Icone = ({ t }) => html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICO_MOV[t] || null}</svg>`;

function primeiroDoMes() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

// Casas e insumos vêm da configuração, não do resultado: uma lista que encolhe
// conforme o filtro esconde justamente a opção que a pessoa quer escolher.
// Lida uma vez, depois da primeira consulta que deu certo (como sempre foi).
let configPromessa = null;
const lerConfig = () => configPromessa || (configPromessa = api.getConfig()
  .then((r) => r.json())
  .catch((e) => { configPromessa = null; throw e; }));

// ------------------------------------------------------------------ títulos
// Digita-se o VALOR TOTAL da nota — é o número que vem impresso nela — e o
// preço unitário sai sozinho: total ÷ quantidade, dividido no servidor com a
// quantidade gravada. O cadastro guarda esse unitário com até dez casas, para
// quantidade × preço voltar ao centavo digitado. A coluna mostra até quatro
// casas, e o CSV também. Só grava se o número mudou.
const TITULO_TOTAL = "Valor total pago pela linha, como está na nota. "
  + "O preço unitário é calculado sozinho. Em branco apaga o cadastro.";
const tituloUnitario = (p) => "Calculado: valor total ÷ quantidade."
  + (p === null || p === undefined ? "" : " Valor gravado: R$ " + fmtCheio(p) + ".");

// O lançamento que veio da planilha pode ser corrigido aqui: o número digitado
// SUBSTITUI o lançado (não soma, como o botão de ação). O valor total pago fica
// — é o da nota —, e o preço unitário se refaz sobre a quantidade nova. O
// registro passa a "Editado", e a sincronização deixa de voltá-lo ao número da
// planilha. Zero apaga o movimento.
const TITULO_ORIGEM = {
  Planilha: "Veio da planilha da casa, pela sincronização",
  Digitado: "Digitado na tela de lançamento",
  Editado: "Corrigido na tela de lançamento — a sincronização da planilha não muda mais este número",
  "Movimentações": "Quantidade informada em Movimentações (correção ou notas fiscais), independente do lançamento diário",
  "Nota fiscal": "Lançada no quadro de notas fiscais — independente do lançamento diário",
  "Transferência": "Parte da entrada que veio de outra casa — lançada no quadro de notas fiscais e transferências",
};
const tituloLancamento = (m) => m.qtd_lancamento
  ? `Lançamento diário (${m.origem_lancamento || "—"}) — não muda por Movimentações`
  : "Sem lançamento diário neste dia — o movimento existe só em Movimentações";
const tituloAlerta = (m) => `Movimentações tem ${fmtQ(m.qtd)} ${m.un}, menos que os ` +
  `${fmtQ(m.qtd_lancamento)} ${m.un} do lançamento diário — confira as notas ou a contagem`;

// Só há o que excluir quando Movimentações acrescentou algo ao lançamento
// diário (nota, correção, preço, kg, fornecedor/NF) ou quando o movimento só
// existe aqui. Linha que apenas espelha o lançamento diário se exclui lá.
const temDadoProprio = (m) => m.propria || m.preco !== null || !!m.kg || !!m.parceiro
  || !!m.nf || !m.qtd_lancamento;
const tituloExcluir = (m) => m.qtd_lancamento
  ? "Apagar o que foi informado em Movimentações (quantidade corrigida, valor, kg, fornecedor, NF). O lançamento diário continua."
  : "Excluir este movimento — ele só existe em Movimentações";
const resumoNotas = (m) => m.notas.map((n) =>
  `${n.parceiro}${n.nf ? " · NF " + n.nf : ""}: ${fmtQ(n.qtd)} ${m.un} por R$ ${fmt(n.total)}`).join("\n");

// O salmão é contado em peças por faixa e faturado em kg. A entrada de cada
// libragem guarda os kg da nota (para o relatório mensal), e o preço por kg é
// calculado — valor total ÷ kg —, como o unitário: nunca desmente o total.
const precoKgTexto = (m) => m.kg > 0 && m.valor_total !== null
  ? "R$ " + fmtPreco(m.valor_total / m.kg) : "—";

const nomeCasa = (cfg, ck) => ((cfg ? cfg.casas.find((c) => c.chave === ck) : null) || {}).nome || ck;

// ------------------------------------------------------------ campo da linha
// Grava ao sair do campo (e no Enter). Salvar a cada tecla mandaria um POST
// por dígito; salvar só num botão "Salvar tudo" faria perder o cadastro de
// quem troca de filtro no meio — o valor é digitado linha a linha.
// Enquanto tem o foco o campo guarda o que se digita; ao sair, volta a mostrar
// `valor`, que a linha decide (o gravado, ou o que está sendo salvo). Com
// `valorFoco`, o foco troca o texto (o preço perde o separador de milhar, para
// editar sem tropeçar no ponto).
function Campo({ valor, valorFoco, aoSair, ...resto }) {
  const [texto, setTexto] = useState(null);
  return html`<input type="text" ...${resto} value=${texto === null ? valor : texto}
    onFocus=${() => setTexto(valorFoco ? valorFoco() : valor)}
    onInput=${(e) => setTexto(e.target.value)} onChange=${() => {}}
    onBlur=${() => { const t = texto === null ? valor : texto; setTexto(null); aoSair(t); }}
    onKeyDown=${(e) => { if (e.key === "Enter") e.target.blur(); }} />`;
}

// ------------------------------------------------- fornecedor, NF e exclusão
// Os lançamentos antigos chegaram da planilha sem fornecedor e sem número de
// nota. As duas colunas se editam na própria linha: numa linha de nota mudam
// aquela nota; numa linha sem nota guardam só os dois dados, sem mexer em
// quantidade ou preço. Desperdício não tem fornecedor nem nota.
// O select grava na troca, os campos de texto ao sair. Os dois valores andam
// juntos (a rota recebe os dois), por isso ficam no estado da célula.
function CelulasInfo({ m, parceiro, nf, nota, cfg, aoGravar }) {
  const [v, setV] = useState({ parceiro: parceiro || "", nf: nf || "" });
  if (!m.precificavel) return html`<td></td><td></td>`;
  const gravar = (novo) => aoGravar(novo.parceiro.trim(), novo.nf.trim(),
    (volta) => setV((x) => ({ ...x, ...volta })));
  const sair = (e) => { if (e.key === "Enter") e.target.blur(); };
  const campoParceiro = m.tipo === "transferencia" || (nota && nota.origem === "transferencia")
    ? html`<select class="info-parceiro" value=${v.parceiro}
        onChange=${(e) => { const novo = { ...v, parceiro: e.target.value }; setV(novo); gravar(novo); }}>
        <option value="">—</option>${(cfg ? cfg.casas : []).filter((c) => c.chave !== m.casa).map((c) =>
          html`<option key=${c.chave} value=${c.chave}>${c.nome}</option>`)}</select>`
    : html`<input class="info-parceiro" list="nf-fornecedores" value=${v.parceiro} placeholder="—"
        onInput=${(e) => setV({ ...v, parceiro: e.target.value })} onChange=${() => {}}
        onBlur=${() => gravar(v)} onKeyDown=${sair} />`;
  return html`<td>${campoParceiro}</td>
        <td><input class="info-nf" value=${v.nf} placeholder="—"
          onInput=${(e) => setV({ ...v, nf: e.target.value })} onChange=${() => {}}
          onBlur=${() => gravar(v)} onKeyDown=${sair} /></td>`;
}

// ------------------------------------------------------------ linha comum
// `p` é o que está sendo salvo nesta linha (texto digitado, ou o total já
// assentado): o campo mostra isso e fica travado até o servidor responder.
function LinhaMovimento({ m, temKg, cfg, p, acoes }) {
  const salvandoTotal = p.total !== undefined;
  const preco = salvandoTotal ? (p.total === null || !m.qtd ? null : p.total / m.qtd) : m.preco;
  const total = salvandoTotal ? p.total : m.valor_total;
  return html`<tr class=${(m.precificavel && m.preco === null ? "sem-preco" : "") + (m.alerta ? " alerta-qtd" : "")}
        title=${m.alerta ? tituloAlerta(m) : undefined}>
      <td class="fonte">${brDate(m.data)}</td>
      <td><span class="ponto" style=${{ background: corCasa(m.casa) }}></span>${m.casa_nome}</td>
      <td>${m.insumo}</td>
      <td><span class=${"selo " + (SELO[m.tipo] || "neutro")}>${m.tipo_nome}</span></td>
      <${CelulasInfo} m=${m} parceiro=${m.parceiro} nf=${m.nf} cfg=${cfg}
        aoGravar=${(parceiro, nf, volta) => acoes.gravarInfo(null, parceiro, nf, volta)} />
      <td class="calc"><${Campo} class="qtd" inputmode="decimal"
          valor=${p.qtd !== undefined ? p.qtd : fmtQ(m.qtd)} disabled=${p.qtd !== undefined}
          title="Quantidade de Movimentações — corrigi-la não muda o lançamento diário."
          aoSair=${acoes.gravarQtd} />${" "}<span class="un">${m.un}</span></td>
      <td class="calc lancamento" title=${tituloLancamento(m)}>${
        m.qtd_lancamento ? fmtQ(m.qtd_lancamento) : "—"}</td>
      ${m.precificavel
        ? html`<td class="calc unitario" title=${tituloUnitario(preco)}>${
               preco === null ? "—" : "R$ " + fmtPreco(preco)}</td>
             <td><${Campo} class="preco" inputmode="decimal" placeholder="—" title=${TITULO_TOTAL}
               valor=${total === null ? "" : fmtCentavos(total)} disabled=${salvandoTotal}
               valorFoco=${() => m.valor_total === null ? "" : fmtCheio(m.valor_total)}
               aoSair=${acoes.gravarTotal} /></td>`
        : html`<td class="calc nao-precifica"
               title=${"Desperdício não recebe preço: não se paga para jogar fora. O valor vem do último preço pago por este insumo até a data — da própria casa, ou da rede quando a casa ainda não o tinha comprado" + (
                 m.custo_un === null ? ". Aqui não há compra precificada dele em casa nenhuma antes desta data, então não há custo para aplicar." : ".")}
             >${m.custo_un === null ? "—" : "R$ " + fmt(m.custo_un)}</td>
             <td class="calc total perda">${m.valor_perdido === null ? "—" : "R$ " + fmt(m.valor_perdido)}</td>`}
      ${!temKg ? null : !m.pesavel ? html`<td></td><td></td>`
        : html`<td class="calc"><${Campo} class="kg" inputmode="decimal" placeholder="—"
                  valor=${p.kg !== undefined ? p.kg : m.kg ? fmtQ(m.kg) : ""} disabled=${p.kg !== undefined}
                  title="Kg faturados na nota fiscal. Em branco apaga." aoSair=${acoes.gravarKg} /> <span class="un">kg</span></td>
             <td class="calc preco-kg" title="Calculado: valor total ÷ kg da nota">${precoKgTexto(m)}</td>`}
      <td class="fonte origem" title=${TITULO_ORIGEM[m.origem] || ""}>${m.origem}</td>
      <td class="acoes">${m.precificavel ? html`<button type="button" class="botao-mini abrir-nota"
            title="Abrir no quadro de notas fiscais (dividir em notas, fornecedor, NF, valores)"
            onClick=${acoes.abrirNota}>Editar</button>` : null}${
        temDadoProprio(m) ? html`<button type="button" class="botao-mini excluir" title=${tituloExcluir(m)}
            onClick=${() => acoes.excluir(null)}>Excluir</button>` : null}</td>
    </tr>`;
}

// ------------------------------------------------- uma linha por nota fiscal
// Movimento que chegou em mais de uma nota (5 pacotes de nori da Nippobraz e
// 210 da Damerlin, no mesmo dia) aparece no extrato como uma linha POR NOTA,
// com fornecedor, quantidade, preço e valor de cada uma — e não somado numa
// linha só. O lançamento diário é um número para o dia inteiro, então ocupa
// uma célula só para o grupo; o alerta (notas abaixo do lançamento) pinta o
// grupo todo. As linhas de nota não se editam aqui: o botão de notas abre o
// quadro, onde elas são corrigidas juntas.
function LinhaNota({ m, n, j, temKg, cfg, acoes }) {
  const k = m.notas.length;
  const deTransferencia = n.origem === "transferencia";
  return html`<tr class=${"linha-nota" + (j === 0 ? " nota-primeira" : "") + (j === k - 1 ? " nota-ultima" : "")
         + (m.alerta ? " alerta-qtd" : "")} title=${m.alerta ? tituloAlerta(m) : undefined}>
      <td class="fonte">${brDate(m.data)}</td>
      <td><span class="ponto" style=${{ background: corCasa(m.casa) }}></span>${m.casa_nome}</td>
      <td>${m.insumo}${j === 0 && k > 1 ? html` <span class="un">${k} notas</span>` : null}</td>
      <td><span class=${"selo " + (SELO[m.tipo] || "neutro")}>${m.tipo_nome}</span></td>
      <${CelulasInfo} m=${m} parceiro=${n.parceiro} nf=${n.nf} nota=${n} cfg=${cfg}
        aoGravar=${(parceiro, nf, volta) => acoes.gravarInfo(j, parceiro, nf, volta)} />
      <td class="calc" title="Quantidade desta nota — corrija pelo botão de notas">${fmtQ(n.qtd)}${" "}<span class="un">${m.un}</span></td>
      ${j === 0 ? html`<td class="calc lancamento" rowSpan=${k} title=${tituloLancamento(m)}>${
        m.qtd_lancamento ? fmtQ(m.qtd_lancamento) : "—"}${k > 1
          ? html`<small class="nota-soma">notas: ${fmtQ(m.qtd)}</small>` : null}</td>` : null}
      <td class="calc">${n.qtd > 0 ? "R$ " + fmtPreco(n.total / n.qtd) : "—"}</td>
      <td class="calc">R$ ${fmt(n.total)}</td>
      ${!temKg ? null : !m.pesavel ? html`<td></td><td></td>`
        : html`<td class="calc">${n.kg ? html`${fmtQ(n.kg)} <span class="un">kg</span>` : "—"}</td>
             <td class="calc">${n.kg > 0 ? "R$ " + fmtPreco(n.total / n.kg) : "—"}</td>`}
      <td class="fonte origem" title=${TITULO_ORIGEM[deTransferencia ? "Transferência" : "Nota fiscal"]}>${
        deTransferencia ? "Transferência" : "Nota fiscal"}</td>
      <td class="acoes"><button type="button" class="botao-mini abrir-nota"
            title=${resumoNotas(m)} onClick=${acoes.abrirNota}>Editar</button><button type="button"
            class="botao-mini excluir" title="Excluir esta nota" onClick=${() => acoes.excluir(j)}>Excluir</button></td>
    </tr>`;
}

// ------------------------------------------------- notas fiscais e transferências
// Um movimento do dia pode ter vindo em mais de uma nota: 215 pacotes de nori
// na Senador Lemos, 5 de um fornecedor e 210 de outro, cada um com seu preço.
// O quadro abre o movimento escolhido (data, casa, tipo, insumo), mostra o que
// já está lançado — normalmente vindo da planilha — e deixa detalhá-lo por
// nota. O preço da linha do extrato vira a média ponderada das notas.
//
// Se as notas somam diferente do lançado, a tela avisa antes de salvar; se
// nada foi lançado ainda, a nota cria o movimento.
// Na transferência, o "parceiro" é a casa de destino.
//
// As linhas ficam como TEXTO (o que está nos campos); os números saem de
// lerLinha a cada desenho. Acrescentar, tirar ou trocar a origem de uma nota
// reescreve os campos já formatados, como a tela sempre fez.
const linhaVazia = () => ({ parceiro: "", nf: "", qtd: null, total: null });
const paraTexto = (l) => ({ origem: l.origem, parceiro: l.parceiro || "", nf: l.nf || "",
  qtd: l.qtd === null ? "" : fmtQ(l.qtd),
  total: l.total === null ? "" : fmtCentavos(l.total),
  kg: l.kg ? fmtQ(l.kg) : "" });

function QuadroNotas({ cfg, abrirRef, estado, recarregarExtrato }) {
  const [form, setForm] = useState({ data: "", casa: "", tipo: "entrada", insumo: "" });
  const [nota, setNota] = useState(null);  // { lancado, origem, preco, valor_total, pesavel, ... }
  const [linhas, setLinhas] = useState([]);
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [fornecedores, setFornecedores] = useState([]);
  const focarUltima = useRef(false);
  const corpoRef = useRef(null);
  const areaRef = useRef(null);

  const ehEntrada = form.tipo === "entrada";
  const insumos = cfg ? cfg.insumos.filter((i) => !i.derivado) : [];
  const ins = (cfg ? cfg.insumos.find((i) => i.chave === form.insumo) : null) || {};
  const pesavel = !!(nota && nota.pesavel);
  const outrasCasas = cfg ? cfg.casas.filter((c) => c.chave !== form.casa) : [];
  const usaCasa = (l) => form.tipo === "transferencia" || l.origem === "transferencia";

  // Lê o que está no campo. Casa fora da lista (o select mostra "Casa de …")
  // vale vazio, como valia no select antigo.
  const lerLinha = (l) => {
    const parceiro = l.parceiro.trim();
    return {
      origem: ehEntrada && l.origem === "transferencia" ? "transferencia" : "nf",
      parceiro: usaCasa(l) && !outrasCasas.some((c) => c.chave === parceiro) ? "" : parceiro,
      nf: l.nf.trim(),
      qtd: l.qtd.trim() === "" ? null : num(l.qtd.trim()),
      total: l.total.trim() === "" ? null : Math.round(num(l.total.trim()) * 100) / 100,
      kg: !pesavel || l.kg.trim() === "" ? null : Math.round(num(l.kg.trim()) * 1000) / 1000,
    };
  };
  const reescrever = (ls) => ls.map((l) => paraTexto(lerLinha(l)));

  async function carregarNota(f) {
    if (!f.data || !f.insumo) return;
    let d;
    try {
      d = await (await api.getNota({ data: f.data, casa: f.casa, tipo: f.tipo, insumo: f.insumo })).json();
      if (d.erro) throw new Error(d.erro);
    } catch (e) {
      setErro("Não consegui ler o movimento: " + e.message);
      return;
    }
    const n = { lancado: d.qtd, qtd_mov: d.qtd_mov, propria: !!d.propria,
                origem: d.origem, preco: d.preco,
                valor_total: d.valor_total, pesavel: !!d.pesavel, kg: d.kg || null,
                info: d.info || {} };
    const ls = d.notas.map((x) => ({ ...x }));
    // Movimento já lançado e ainda sem nota: a primeira linha nasce com a
    // quantidade inteira (e o valor, se havia preço) — no caso comum de uma
    // nota só, basta escrever o fornecedor.
    if (!ls.length) {
      ls.push(n.lancado > 0
        ? { parceiro: n.info.parceiro || "", nf: n.info.nf || "",
            qtd: n.qtd_mov || n.lancado, total: n.valor_total, kg: n.kg }
        : linhaVazia());
    }
    setErro(null);
    setNota(n);
    setLinhas(ls.map(paraTexto));
  }

  const mudarForm = (mudanca) => {
    const f = { ...form, ...mudanca };
    setForm(f);
    carregarNota(f);
  };

  // Abre no quadro o movimento de uma linha do extrato.
  abrirRef.current = (m) => {
    mudarForm({ data: m.data, casa: m.casa, tipo: m.tipo, insumo: m.insumo_chave });
    areaRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    if (!cfg) return;
    const f = { data: hojeLocal(), casa: (cfg.casas[0] || {}).chave || "", tipo: "entrada",
                insumo: (insumos[0] || {}).chave || "" };
    setForm(f);
    // Fornecedores do cadastro do Gerador de OCs, como sugestão: quem não está
    // lá ainda pode ser digitado à mão.
    api.getBase().then((r) => r.json()).then((b) => setFornecedores(b.fornecedores || [])).catch(() => {});
    carregarNota(f);
  }, [cfg]);

  useEffect(() => {
    if (!focarUltima.current) return;
    focarUltima.current = false;
    const campo = corpoRef.current && corpoRef.current.querySelector("tbody tr:last-child [data-k]");
    if (campo) campo.focus();
  });

  const mudarLinha = (i, k, valor) => setLinhas((ls) => ls.map((l, x) => x === i ? { ...l, [k]: valor } : l));
  const maisNota = () => { if (!nota) return; setErro(null); focarUltima.current = true; setLinhas([...reescrever(linhas), paraTexto(linhaVazia())]); };
  const limpar = () => { if (!nota) return; setErro(null); focarUltima.current = true; setLinhas([paraTexto(linhaVazia())]); };
  const tirar = (i) => {
    const ls = reescrever(linhas);
    ls.splice(i, 1);
    if (!ls.length) ls.push(paraTexto(linhaVazia()));
    setErro(null);
    setLinhas(ls);
  };
  // a casa de origem e o fornecedor não se aproveitam um no outro
  const trocarOrigem = (i, origem) => {
    setErro(null);
    setLinhas(reescrever(linhas.map((l, x) => x === i ? { ...l, origem, parceiro: "" } : l)));
  };

  async function salvarNota() {
    if (!nota) return;
    const corpo = { data: form.data, casa: form.casa, tipo: form.tipo, insumo: form.insumo,
                    linhas: linhas.map(lerLinha).map((l) => ({ ...l, qtd: l.qtd || 0, total: l.total || 0,
                                                                kg: l.kg || 0 })) };
    setSalvando(true);
    estado("Salvando notas…");
    try {
      const r = await api.postNota(corpo);
      const d = await r.json();
      if (!d.ok) throw new Error(d.erro || "erro no servidor");
      estado("Notas salvas", "ok");
      aviso(d.notas.length
        ? `${d.notas.length} nota(s) de ${ins.nome} em ${nomeCasa(cfg, corpo.casa)} salvas` +
          (d.alerta ? ` — abaixo dos ${fmtQ(d.qtd_lancamento)} do lançamento diário` : "")
        : "Notas apagadas", d.alerta ? "mau" : "ok");
      await carregarNota(form);
      recarregarExtrato();
    } catch (e) {
      estado("Falha ao salvar", "erro");
      aviso("Não consegui salvar as notas: " + e.message, "mau");
    } finally {
      setSalvando(false);
    }
  }

  // ---- desenho
  const un = ins.un || "";
  const situacao = erro ? erro : !nota ? "Escolha o dia, a casa e o insumo"
    : nota.lancado > 0
      ? `Lançamento diário: ${fmtQ(nota.lancado)} ${un} (${nota.origem})` +
        (nota.propria ? ` · em Movimentações: ${fmtQ(nota.qtd_mov)}` : "") +
        (nota.preco === null ? " · sem preço" : ` · R$ ${fmt(nota.valor_total)}`)
      : "Sem lançamento diário neste dia — a nota cria o movimento só em Movimentações";

  const lidas = linhas.map(lerLinha);
  let sq = 0, st = 0, sk = 0;
  lidas.forEach((l) => { sq += l.qtd || 0; st += l.total || 0; sk += l.kg || 0; });
  const soma = !nota ? "" : `Soma: ${fmtQ(sq)} ${un} · R$ ${fmt(st)}` +
    (sq > 0 ? ` · preço médio R$ ${fmtPreco(st / sq)}` : "") +
    (pesavel && sk > 0 ? ` · ${fmtQ(sk)} kg a R$ ${fmtPreco(st / sk)}/kg` : "");
  // As notas não mexem no lançamento diário. Somando menos que ele, a linha do
  // extrato fica vermelha — o aviso adianta isso antes de salvar.
  const menor = !!nota && nota.lancado > 0 && sq > 0 && sq < nota.lancado - 0.0005;
  const maior = !!nota && nota.lancado > 0 && sq > nota.lancado + 0.0005;
  const ajuste = menor
    ? `As notas somam ${fmtQ(sq)} ${un}, menos que os ${fmtQ(nota.lancado)} do lançamento diário — a linha ficará em vermelho`
    : maior
      ? `As notas somam ${fmtQ(sq)} ${un}, mais que os ${fmtQ(nota.lancado)} do lançamento diário — o lançamento não muda`
      : "";

  const casaSel = (l, i, rotulo) => html`<select data-k="parceiro" value=${l.parceiro}
      onChange=${(e) => mudarLinha(i, "parceiro", e.target.value)}>
      <option value="">${rotulo}</option>${outrasCasas.map((c) =>
        html`<option key=${c.chave} value=${c.chave}>${c.nome}</option>`)}</select>`;
  // Entrada pode ser dividida entre notas fiscais (fornecedor) e
  // transferências recebidas de outra casa (casa de origem): cada linha diz
  // de onde veio, e o campo ao lado muda conforme.
  const parceiro = (l, i) => form.tipo === "transferencia" ? casaSel(l, i, "Casa de destino…")
    : l.origem === "transferencia" ? casaSel(l, i, "Casa de origem…")
    : html`<input data-k="parceiro" list="nf-fornecedores" value=${l.parceiro} placeholder="Fornecedor"
        onInput=${(e) => mudarLinha(i, "parceiro", e.target.value)} onChange=${() => {}} />`;
  const campo = (l, i, k, extra) => html`<input data-k=${k} ...${extra} value=${l[k]}
      onInput=${(e) => mudarLinha(i, k, e.target.value)} onChange=${() => {}} />`;

  return html`<section class="cartao" id="area-nota" ref=${areaRef}>
    <div class="cabeca"><h2>Notas fiscais e transferências</h2>
      <span class="fonte" id="nota-situacao">${situacao}</span>
      <span style=${{ flex: 1 }}></span>
      <button class="botao" id="nf-limpar" type="button" onClick=${limpar}>Limpar</button></div>
    <div class="barra barra-interna">
      <label class="campo"><span>Data</span><input type="date" id="nf-data" value=${form.data}
        onChange=${(e) => mudarForm({ data: e.target.value })} /></label>
      <label class="campo"><span>Casa</span><select id="nf-casa" value=${form.casa}
        onChange=${(e) => mudarForm({ casa: e.target.value })}>
        ${(cfg ? cfg.casas : []).map((c) => html`<option key=${c.chave} value=${c.chave}>${c.nome}</option>`)}
      </select></label>
      <label class="campo"><span>Movimento</span>
        <select id="nf-tipo" value=${form.tipo} onChange=${(e) => mudarForm({ tipo: e.target.value })}>
          <option value="entrada">Entrada (nota fiscal)</option>
          <option value="transferencia">Saída (transferência entre lojas)</option>
        </select></label>
      <label class="campo"><span>Insumo</span><select id="nf-insumo" value=${form.insumo}
        onChange=${(e) => mudarForm({ insumo: e.target.value })}>
        ${agrupar(insumos).map((g) => html`<optgroup key=${g.nome} label=${g.nome}>${
          g.itens.map((i) => html`<option key=${i.chave} value=${i.chave}>${i.nome} (${i.un})</option>`)}</optgroup>`)}
      </select></label>
    </div>
    <div class="rolagem" id="nf-linhas" ref=${corpoRef}>${!nota ? null : html`<table class="tabela-notas">
      <thead><tr>${ehEntrada ? html`<th>Origem</th>` : null}
        <th>${form.tipo === "transferencia" ? "Casa de destino" : "Fornecedor / casa de origem"}</th>
        <th>Nº da nota</th><th>${"Quantidade (" + un + ")"}</th><th>Valor total (R$)</th>
        <th>Preço unit.</th>${pesavel ? html`<th>Quantidade Kg NF</th><th>Preço Unit. Kg</th>` : null}
        <th></th></tr></thead>
      <tbody>${linhas.map((l, i) => { const n = lidas[i]; return html`
        <tr key=${i}>
          ${ehEntrada ? html`<td><select data-k="origem" value=${l.origem === "transferencia" ? "transferencia" : "nf"}
              onChange=${(e) => trocarOrigem(i, e.target.value)}>
            <option value="nf">Nota fiscal</option>
            <option value="transferencia">Transferência</option>
          </select></td>` : null}
          <td>${parceiro(l, i)}</td>
          <td>${campo(l, i, "nf", { placeholder: "opcional" })}</td>
          <td>${campo(l, i, "qtd", { class: "num", inputmode: "decimal" })}</td>
          <td>${campo(l, i, "total", { class: "num", inputmode: "decimal" })}</td>
          <td class="calc nf-unit">${n.qtd > 0 && n.total !== null ? "R$ " + fmtPreco(n.total / n.qtd) : "—"}</td>
          ${pesavel ? html`<td>${campo(l, i, "kg", { class: "num", inputmode: "decimal", placeholder: "kg" })}</td>
            <td class="calc nf-unit-kg">${n.kg > 0 && n.total !== null ? "R$ " + fmtPreco(n.total / n.kg) : "—"}</td>` : null}
          <td><button type="button" class="botao-mini nf-tirar" title="Tirar esta nota"
               onClick=${() => tirar(i)}>×</button></td>
        </tr>`; })}</tbody></table>`}</div>
    <div class="nf-pe">
      <button class="botao" id="nf-mais" type="button" onClick=${maisNota}>+ Nota</button>
      <span class="nf-soma" id="nf-soma">${soma}</span>
      <span class=${"nf-ajuste" + (menor ? " alerta" : "")} id="nf-ajuste" hidden=${!ajuste}>${ajuste}</span>
      <span style=${{ flex: 1 }}></span>
      <button class="botao primario" id="nf-salvar" type="button" disabled=${salvando}
        onClick=${salvarNota}>Salvar notas</button>
    </div>
    <datalist id="nf-fornecedores">${fornecedores.map((f) =>
      html`<option key=${f.chave} value=${f.chave}>${f.razao || ""}</option>`)}</datalist>
  </section>`;
}

// ------------------------------------------------------------------ CSV
// Ponto e vírgula e vírgula decimal: é o que o Excel em português abre sem
// pedir assistente de importação.
function exportarCSV(dados, cfg) {
  if (!dados || !dados.movimentos.length) return;
  const nomeParceiro = (m, p, n) => !p ? "" : m.tipo === "transferencia" ? "→ " + nomeCasa(cfg, p)
    : n && n.origem === "transferencia" ? "← " + nomeCasa(cfg, p) : p;
  const linhas = [["Data", "Casa", "Insumo", "Movimento", "Fornecedor / destino", "Nº NF",
                   "Quantidade", "Lançamento diário", "Unidade",
                   "Preço unitário", "Valor total", "Quantidade Kg NF", "Preço Unit. Kg",
                   "Origem"]]
    .concat(dados.movimentos.flatMap((m) => m.notas.length ? m.notas.map((n) => [
      brDate(m.data), m.casa_nome, m.insumo, m.tipo_nome,
      nomeParceiro(m, n.parceiro, n), n.nf || "", fmt(n.qtd, 3), m.qtd_lancamento ? fmt(m.qtd_lancamento, 3) : "", m.un,
      n.qtd > 0 ? fmtPreco(n.total / n.qtd) : "", fmt(n.total),
      n.kg ? fmtQ(n.kg) : "", n.kg > 0 ? fmtPreco(n.total / n.kg) : "",
      n.origem === "transferencia" ? "Transferência" : "Nota fiscal"])
    : [[brDate(m.data), m.casa_nome, m.insumo, m.tipo_nome,
      nomeParceiro(m, m.parceiro), m.nf || "", fmt(m.qtd, 3), m.qtd_lancamento ? fmt(m.qtd_lancamento, 3) : "", m.un,
      m.preco === null ? "" : fmtPreco(m.preco),
      m.valor_total === null ? "" : fmt(m.valor_total),
      m.kg ? fmtQ(m.kg) : "",
      m.kg > 0 && m.valor_total !== null ? fmtPreco(m.valor_total / m.kg) : "",
      m.origem]]));
  const csv = "﻿" + linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `movimentacoes_${dados.inicio}_a_${dados.fim}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ------------------------------------------------------------------ tela
function Movimentacoes() {
  const [cfg, setCfg] = useState(null);
  const [filtros, setFiltros] = useState({ inicio: "", fim: "", casa: "", tipo: "", preco: "" });
  // Filtro de insumo com mais de uma escolha: guarda as chaves MARCADAS; lista
  // vazia é "todos", que é como a tela abre. `enviado` é o que o servidor já
  // recebeu — a consulta só é refeita quando a escolha muda, senão marcar
  // camarão G, M e P custaria três buscas no histórico inteiro.
  const [insSel, setInsSel] = useState([]);
  const [dados, setDados] = useState(null);
  const [foraDoAr, setForaDoAr] = useState(false);
  const [est, setEst] = useState({ texto: "", classe: "" });
  // O que está sendo salvo, por linha: { qtd: texto, kg: texto, total: número }
  const [pend, setPend] = useState({});
  // Depois de gravar um preço, o pé das fichas de entrada e saída conta os sem
  // preço DESTA lista (o resumo do servidor é do período todo).
  const [placarDaLista, setPlacarDaLista] = useState(false);
  const filtrosRef = useRef(filtros);
  const insRef = useRef(insSel);
  const enviado = useRef("");
  // Cada consulta é uma "carga": resposta de gravação que chega depois de a
  // lista ter sido recarregada não escreve na lista nova (o índice mudou).
  const carga = useRef(0);
  const abrirNotaRef = useRef(null);

  const estado = (texto, classe) => setEst({ texto: texto || "", classe: classe || "" });

  async function carregar(mudanca) {
    const f = { ...filtrosRef.current, ...(mudanca || {}) };
    filtrosRef.current = f;
    setFiltros(f);
    estado("Carregando…");
    let d;
    try {
      d = await (await api.getMovimentacoes({ inicio: f.inicio, fim: f.fim, casa: f.casa,
        insumo: insRef.current.join(","), tipo: f.tipo, sem_preco: f.preco ? "1" : "",
        limite: "600" })).json();
    } catch (e) {
      setForaDoAr(true);
      estado("");
      return;
    }
    estado("");
    enviado.current = insRef.current.join(",");
    filtrosRef.current = { ...filtrosRef.current, inicio: d.inicio, fim: d.fim };
    setFiltros(filtrosRef.current);
    setCfg(await lerConfig());
    carga.current += 1;
    setPend({});
    setPlacarDaLista(false);
    setForaDoAr(false);
    setDados(d);
  }

  useEffect(() => { carregar(); }, []);

  // ---- gravação linha a linha
  const cargaDe = () => carga.current;
  const mudarDados = (c, fn) => setDados((d) => (!d || carga.current !== c) ? d : fn(d));
  const mudarMov = (c, i, fn) => mudarDados(c, (d) => {
    const movimentos = d.movimentos.slice();
    movimentos[i] = { ...movimentos[i], ...fn(movimentos[i]) };
    return { ...d, movimentos };
  });
  const marcarPend = (c, i, k, v) => setPend((p) => carga.current !== c ? p : { ...p, [i]: { ...p[i], [k]: v } });
  const soltarPend = (c, i, k) => setPend((p) => {
    if (carga.current !== c || !p[i]) return p;
    const linha = { ...p[i] };
    delete linha[k];
    return { ...p, [i]: linha };
  });

  async function gravarTotal(m, i, texto) {
    const c = cargaDe();
    const bruto = texto.trim();
    const total = bruto === "" ? null : centavos(num(bruto));
    // Sair do campo sem mudar o número não grava nada: regravar o mesmo valor só
    // marcaria a linha como editada.
    if (total === m.valor_total || (total !== null && m.valor_total !== null
                                    && Math.abs(total - m.valor_total) < 0.005)) return;
    // Assenta o campo e o unitário na hora, sem esperar a resposta: quem digita
    // em sequência com o Tab já está duas linhas abaixo quando o POST volta
    // (o lancamentos.json tem 3 MB e mora no OneDrive, que às vezes segura o
    // arquivo). A resposta confirma os dois números; se falhar, voltam os antigos.
    marcarPend(c, i, "total", total);
    estado("Salvando valor…");
    try {
      const r = await api.postPreco({ data: m.data, casa: m.casa, insumo: m.insumo_chave,
                                      tipo: m.tipo, total });
      const d = await r.json();
      if (!d.ok) throw new Error(d.erro || "erro no servidor");
      mudarMov(c, i, () => ({ preco: d.preco, valor_total: d.valor_total }));
      estado("Valor salvo", "ok");
      // Recalcula o placar com o que está na tela, sem ir ao servidor de novo:
      // recarregar tudo a cada preço digitado jogaria o foco fora do campo seguinte.
      if (carga.current === c) setPlacarDaLista(true);
    } catch (e) {
      estado("Falha ao salvar", "erro");
      aviso("Não consegui salvar o valor: " + e.message, "mau");
    } finally {
      soltarPend(c, i, "total");
    }
  }

  async function gravarKg(m, i, texto) {
    const c = cargaDe();
    const bruto = texto.trim();
    const kg = bruto === "" ? null : Math.round(num(bruto) * 1000) / 1000;
    if (kg === (m.kg || null) || (kg !== null && m.kg && Math.abs(kg - m.kg) < 0.0005)) return;
    if (kg !== null && kg <= 0) {
      aviso("Informe kg maior que zero — em branco apaga", "mau");
      return;
    }
    marcarPend(c, i, "kg", texto);
    estado("Salvando kg…");
    try {
      const r = await api.postKg({ data: m.data, casa: m.casa, insumo: m.insumo_chave,
                                   tipo: m.tipo, kg });
      const d = await r.json();
      if (!d.ok) throw new Error(d.erro || "erro no servidor");
      mudarMov(c, i, () => ({ kg: d.kg }));
      estado("Kg salvo", "ok");
    } catch (e) {
      estado("Falha ao salvar", "erro");
      aviso("Não consegui salvar os kg: " + e.message, "mau");
    } finally {
      soltarPend(c, i, "kg");
    }
  }

  async function gravarQtd(m, i, texto) {
    const c = cargaDe();
    const bruto = texto.trim();
    const nova = bruto === "" ? m.qtd : Math.round(num(bruto) * 10000) / 10000;
    if (Math.abs(nova - m.qtd) <= 0.0005) return;
    marcarPend(c, i, "qtd", texto);
    estado("Salvando quantidade…");
    try {
      const r = await api.postMovimentoEditar({ data: m.data, casa: m.casa, insumo: m.insumo_chave,
                                                tipo: m.tipo, qtd: nova });
      const d = await r.json();
      if (!d.ok) throw new Error(d.erro || "erro no servidor");
      estado("Quantidade salva", "ok");
      if (d.qtd <= 0.0005 && d.qtd_lancamento <= 0.0005) {
        // movimento que só existia em Movimentações: zero o apaga
        aviso(`${m.insumo} de ${brDate(m.data)} apagado`, "ok");
        carregar();
        return;
      }
      mudarDados(c, (dd) => {
        const antes = dd.movimentos[i];
        const resumo = { ...(dd.resumo || {}) };
        const r0 = resumo[antes.tipo];
        if (r0) {
          resumo[antes.tipo] = { ...r0,
            qtd: Math.round((r0.qtd + d.qtd - antes.qtd) * 1000) / 1000,
            alerta: (r0.alerta || 0) + (d.alerta ? 1 : 0) - (antes.alerta ? 1 : 0) };
        }
        const novo = { ...antes, qtd: d.qtd, origem: d.origem, alerta: d.alerta, propria: d.propria };
        if (antes.precificavel) {
          novo.preco = d.preco;
          novo.valor_total = d.valor_total;
        } else {
          novo.valor_perdido = antes.custo_un === null ? null
            : Math.round(novo.qtd * antes.custo_un * 100) / 100;
        }
        const movimentos = dd.movimentos.slice();
        movimentos[i] = novo;
        return { ...dd, resumo, movimentos };
      });
      if (carga.current === c) setPlacarDaLista(false);
      if (d.alerta) {
        aviso(`${m.insumo}: ${fmtQ(d.qtd)} em Movimentações, abaixo dos ${fmtQ(d.qtd_lancamento)} ` +
              `do lançamento diário`, "mau");
      }
    } catch (e) {
      estado("Falha ao salvar", "erro");
      aviso("Não consegui salvar a quantidade: " + e.message, "mau");
    } finally {
      soltarPend(c, i, "qtd");
    }
  }

  // j: índice da nota, ou null para a linha sem nota. `volta` devolve os campos
  // ao que estava gravado.
  async function gravarInfo(m, i, j, parceiro, nf, volta) {
    const c = cargaDe();
    const antes = j === null ? m : m.notas[j];
    if ((antes.parceiro || "") === parceiro && (antes.nf || "") === nf) return;
    if (j !== null && !parceiro) {
      aviso("A nota precisa de " + (m.tipo === "transferencia" || m.notas[j].origem === "transferencia"
        ? "casa" : "fornecedor"), "mau");
      volta({ parceiro: antes.parceiro || "" });
      return;
    }
    estado("Salvando…");
    try {
      const r = await api.postMovimentoInfo({ data: m.data, casa: m.casa, insumo: m.insumo_chave,
                                              tipo: m.tipo, nota: j, parceiro, nf });
      const d = await r.json();
      if (!d.ok) throw new Error(d.erro || "erro no servidor");
      mudarMov(c, i, (mm) => j === null ? { parceiro: d.parceiro, nf: d.nf }
        : { notas: mm.notas.map((n, x) => x === j ? { ...n, parceiro: d.parceiro, nf: d.nf } : n) });
      estado("Salvo", "ok");
    } catch (e) {
      estado("Falha ao salvar", "erro");
      aviso("Não consegui salvar: " + e.message, "mau");
      volta({ parceiro: antes.parceiro || "", nf: antes.nf || "" });
    }
  }

  async function excluir(m, j) {
    const oque = j !== null
      ? `${m.notas[j].origem === "transferencia" ? "a transferência de " + nomeCasa(cfg, m.notas[j].parceiro)
           : "a nota de " + (m.notas[j].parceiro || "fornecedor não informado")} (${fmtQ(m.notas[j].qtd)} ${m.un})`
      : m.qtd_lancamento ? `o que foi informado em Movimentações para ${m.insumo}`
      : `o movimento de ${m.insumo}`;
    if (!confirm(`Excluir ${oque} de ${brDate(m.data)} em ${m.casa_nome}?` +
                 (j === null && m.qtd_lancamento ? "\n\nO lançamento diário continua." : ""))) return;
    estado("Excluindo…");
    try {
      const r = await api.postMovimentoExcluir({ data: m.data, casa: m.casa, insumo: m.insumo_chave,
                                                 tipo: m.tipo, nota: j });
      const d = await r.json();
      if (!d.ok) throw new Error(d.erro || "erro no servidor");
      estado("Excluído", "ok");
      aviso(j !== null ? "Nota excluída" : d.sobrou
        ? "Informações de Movimentações apagadas — o lançamento diário continua" : "Movimento excluído", "ok");
      carregar();
    } catch (e) {
      estado("Falha ao excluir", "erro");
      aviso("Não consegui excluir: " + e.message, "mau");
    }
  }

  const acoesDa = (m, i) => ({
    gravarTotal: (t) => gravarTotal(m, i, t),
    gravarKg: (t) => gravarKg(m, i, t),
    gravarQtd: (t) => gravarQtd(m, i, t),
    gravarInfo: (j, parceiro, nf, volta) => gravarInfo(m, i, j, parceiro, nf, volta),
    excluir: (j) => excluir(m, j),
    abrirNota: () => abrirNotaRef.current && abrirNotaRef.current(m),
  });

  // ---- filtro de insumos
  const insumosFiltro = cfg ? cfg.insumos.filter((i) => !i.derivado) : [];
  const mudarInsumos = (lista) => { insRef.current = lista; setInsSel(lista); };
  const aplicarInsumos = () => { if (insRef.current.join(",") !== enviado.current) carregar(); };

  // ---- desenho
  const r = (dados && dados.resumo) || {};
  const peFicha = (t) => {
    const x = r[t] || {};
    if (placarDaLista && TEM_PRECO.includes(t) && dados.resumo && dados.resumo[t]) {
      const linhas = dados.movimentos.filter((m) => m.tipo === t);
      if (linhas.length) {
        const sem = linhas.filter((m) => m.preco === null).length;
        return `${x.n} lançamento(s) no período` +
          (sem ? ` · ${sem} sem preço nesta lista` : " · todos com preço nesta lista");
      }
    }
    return `${x.n || 0} lançamento(s) no período` +
      (x.sem_preco ? ` · ${x.sem_preco} sem preço` : "") +
      (x.sem_custo ? ` · ${x.sem_custo} sem custo` : "") +
      (x.alerta ? ` · ${x.alerta} abaixo do lançamento` : "");
  };
  // As colunas de kg só aparecem quando a lista tem entrada de salmão por
  // libragem: nos outros insumos elas seriam duas colunas sempre vazias.
  const temKg = !!dados && dados.movimentos.some((m) => m.pesavel);
  const c = carga.current;

  // Insumo aceita mais de um: um <select> comum obrigava a ver camarão G, M e P
  // em três consultas e somar de cabeça. O botão abre a lista com caixas de
  // marcação e resume a escolha ("3 insumos").
  // Notas fiscais e transferências: a quantidade do dia vem da planilha; o
  // quadro a detalha por nota (5 pacotes de um fornecedor, 210 de outro, cada
  // um com seu preço) ou a lança, quando ainda não existe.
  return html`<main class="main-content">
    <div class="screen-header">
      <div>
        <h1>Movimentações</h1>
        <p>O que entrou e saiu do estoque, dia a dia: chegada por nota fiscal,
           transferência entre lojas e desperdício. É aqui também que o preço
           é cadastrado — digite o valor total da nota na coluna de valor e saia do
           campo para salvar; o preço unitário é calculado sozinho (total ÷ quantidade).
           Quando o dia chegou em mais de uma nota, lance cada uma no quadro de notas
           fiscais e transferências: o preço da linha vira a média delas. A quantidade
           também pode ser corrigida na própria linha. O que se corrige ou lança aqui
           fica em Movimentações e não muda o lançamento diário, que aparece ao lado
           como referência; quando Movimentações fica abaixo dele, a linha acende em
           vermelho. Desperdício não recebe preço — não se paga para jogar fora, e o
           produto perdido já foi pago na linha da chegada dele —, mas é
           valorizado pelo último preço pago por aquele insumo até a data da perda —
           da própria casa, ou da rede quando a casa ainda não o tinha comprado. Esse valor fica na coluna de valor em tom apagado e tem
           total próprio no placar: é o quanto se perdeu, e nunca entra no valor
           das compras.</p>
      </div>
      <div class="header-acoes">
        <${Estado} texto=${est.texto} classe=${est.classe} />
        <button class="botao" id="btn-csv" onClick=${() => exportarCSV(dados, cfg)}>Exportar CSV</button>
      </div>
    </div>

    <section class="barra">
      <label class="campo"><span>De</span><input type="date" id="inicio" value=${filtros.inicio}
        onChange=${(e) => carregar({ inicio: e.target.value })} /></label>
      <label class="campo"><span>Até</span><input type="date" id="fim" value=${filtros.fim}
        onChange=${(e) => carregar({ fim: e.target.value })} /></label>
      <button class="botao" id="mes-atual"
        onClick=${() => carregar({ inicio: primeiroDoMes(), fim: hojeISO() })}>Mês atual</button>
      <label class="campo"><span>Casa</span><select id="f-casa" value=${filtros.casa}
        onChange=${(e) => carregar({ casa: e.target.value })}>
        ${cfg ? html`<option value="">Todas</option>${cfg.casas.map((k) =>
          html`<option key=${k.chave} value=${k.chave}>${k.nome}</option>`)}` : null}
      </select></label>
      <div class="campo"><span>Insumo</span>
        <${FiltroInsumos} insumos=${insumosFiltro} marcados=${insSel}
          aoMudar=${mudarInsumos} aoAplicar=${aplicarInsumos} />
      </div>
      <label class="campo"><span>Movimento</span><select id="f-tipo" value=${filtros.tipo}
        onChange=${(e) => carregar({ tipo: e.target.value })}>
        ${dados ? html`<option value="">Todos</option>${Object.entries(dados.tipos).map(([k, v]) =>
          html`<option key=${k} value=${k}>${v}</option>`)}` : null}
      </select></label>
      <label class="campo"><span>Preço</span>
        <select id="f-preco" value=${filtros.preco} onChange=${(e) => carregar({ preco: e.target.value })}>
          <option value="">Todos</option>
          <option value="1">Sem preço cadastrado</option>
        </select></label>
      <span class="fonte" id="contagem">${dados ? `${dados.total} movimento(s) no período` : ""}</span>
    </section>

    <div class="placar" id="placar">${dados ? Object.entries(dados.tipos).map(([t, nome]) => html`
      <button key=${t} class=${"ficha " + (SELO[t] === "neutro" ? "" : SELO[t]) + (filtros.tipo === t ? " ativa" : "")}
              data-t=${t} onClick=${() => carregar({ tipo: filtrosRef.current.tipo === t ? "" : t })}>
        <span class="ficha-topo">
          <span class="ficha-vals">
            <span class="ficha-n">${fmt((r[t] || {}).qtd, 1)}</span>
            <span class="ficha-r">${nome}</span>
          </span>
          <span class="ficha-ico"><${Icone} t=${t} /></span>
        </span>
        <span class="ficha-meio">${TEM_PRECO.includes(t)
          ? ((r[t] || {}).valor ? "R$ " + fmt((r[t] || {}).valor) + " cadastrado"
                                : "sem preço cadastrado")
          : ((r[t] || {}).valor_perdido ? "R$ " + fmt((r[t] || {}).valor_perdido) + " perdido"
                                        : "sem custo para valorizar")}</span>
        <span class="ficha-pe">${peFicha(t)}</span>
      </button>`) : null}</div>

    <${QuadroNotas} cfg=${cfg} abrirRef=${abrirNotaRef} estado=${estado}
      recarregarExtrato=${() => carregar()} />

    <section class="cartao">
      <div class="cabeca"><h2>Extrato</h2><span class="fonte" id="nota">${!dados ? "—"
        : dados.total > dados.movimentos.length
          ? `Mostrando os ${dados.movimentos.length} mais recentes de ${dados.total} — aperte o filtro para ver o resto`
          : `${brDate(dados.inicio)} a ${brDate(dados.fim)}`}</span></div>
      <div class="rolagem" id="tabela">${foraDoAr
        ? html`<p class="vazio">Servidor fora do ar. Rode o Servidor.bat.</p>`
        : !dados ? null
        : !dados.movimentos.length ? html`<p class="vazio">Nenhum movimento com esses filtros.</p>`
        : html`<table class="tabela-extrato">
        <thead><tr><th>Data</th><th>Casa</th><th>Insumo</th><th>Movimento</th>
          <th>Fornecedor / destino</th><th>Nº NF</th>
          <th>Quantidade</th><th>Lançamento diário</th><th>Preço unit. (R$)</th><th>Valor total</th>
          ${temKg ? html`<th>Quantidade Kg NF</th><th>Preço Unit. Kg</th>` : null}
          <th>Origem do dado</th><th></th></tr></thead>
        <tbody>${dados.movimentos.map((m, i) => m.notas.length
          ? m.notas.map((n, j) => html`<${LinhaNota} key=${c + "-" + i + "-" + j} m=${m} n=${n} j=${j}
              temKg=${temKg} cfg=${cfg} acoes=${acoesDa(m, i)} />`)
          : html`<${LinhaMovimento} key=${c + "-" + i} m=${m} temKg=${temKg} cfg=${cfg}
              p=${pend[i] || {}} acoes=${acoesDa(m, i)} />`)}</tbody></table>`}</div>
    </section>
  </main>`;
}

montarTela("movimentacoes", Movimentacoes);
