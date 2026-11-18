// ============================================================================
// CDE Web - tela de lancamento diario
// Estoque inicial vem encadeado do dia anterior (o servidor calcula).
// Uso diario = inicial + chegada - transferencia - perda - final.
// Perda e informacao propria e NAO e consumo (mesma conta do uso_do_dia do servidor).
// ============================================================================

let CONFIG = null;
let DIA = null;
let CASA = "SL";
let sujo = false;
const FATOR_LIBRA = { salmao_0810: 1.00, salmao_1012: 1.25, salmao_1214: 1.48, salmao_1416: 1.67 };

const $ = (s) => document.querySelector(s);
// Cuidado com a origem do número: o campo é preenchido com fmt(), que escreve
// "19.313,76" — ponto de MILHAR. O parse ingênuo trocava a vírgula por ponto e
// entregava "19.313.76" ao parseFloat, que para no segundo ponto e devolve
// 19,313. Era isso que fazia o coeficiente sair mil vezes maior: uso 2 kg sobre
// faturamento de R$ 19.313,76 dá 0,104, e a tela mostrava 103,5.
// A vírgula é o que distingue: só quando ela aparece o ponto é separador de
// milhar. Mesma regra do js/comum.js.
const num = (v) => {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  let t = String(v == null ? "" : v).replace(/[^\d,.-]/g, "");
  if (!t) return 0;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = parseFloat(t);
  return isNaN(n) ? 0 : n;
};
const fmt = (n, casas = 2) => n == null ? "—" : n.toLocaleString("pt-BR",
  { minimumFractionDigits: casas, maximumFractionDigits: casas });

// Valor que vai DENTRO de um campo de digitação, sempre no padrão pt-BR.
//
// Não é enfeite: o num() acima decide pela vírgula se o ponto é milhar. Um
// número cru do servidor chega no campo como "0.184" — sem vírgula, e casando
// com o padrão de milhar —, e ao salvar voltava como 184. Mil vezes maior, em
// silêncio. Com "0,184" no campo o caminho de volta é o mesmo que o de quem
// digita à mão, e o valor fecha.
//
// Três casas SEMPRE, como na planilha da casa (formato #,##0.000): antes o
// mínimo era livre e a coluna misturava "14" com "3,850", o que atrapalha a
// leitura de cima para baixo. O caminho de volta continua fechando — num()
// lê "14,000" como 14, porque a vírgula manda.
const qtd = (n) => (n === null || n === undefined || n === "") ? ""
  : Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 3,
                                        maximumFractionDigits: 3 });

// As quatro colunas do meio, na ordem da tela.
const COLS_DERIVADAS = ["entrada", "transferencia", "desperdicio", "final"];

// Meio milésimo: a tela mostra três casas, então tudo abaixo disso É zero para
// quem olha. O limite existe porque soma de decimais em binário não fecha em
// zero exato — a Cidade Nova tinha 20,945 + 9,995 − 30,940, que dá
// -0,0000000000000036 e acendia "contagem maior que o disponível" num dia em
// que o estoque fechava na vírgula. Comparar com zero cru acusava o usuário de
// um erro que era da aritmética.
const QUASE_ZERO = 0.0005;
const zerado = (n) => Math.abs(n) < QUASE_ZERO;

// Contagem final suspeita: o uso do dia passou de ALERTA_VEZES o MAIOR uso da
// casa nos últimos 30 dias, e por pelo menos ALERTA_MINIMO unidades. É o erro de
// preenchimento típico — final zerado ou com um dígito trocado onde deviam sobrar
// 10 kg — que vira consumo e infla a média: foi assim que 57 pacotes de arroz
// entraram num dia só na DLCN, onde o maior dia tinha sido 7.
// A régua é o maior uso, e não a média, porque muito insumo sai em lote (saco de
// kani, leva de lula para processar): contra 3× a média acendia em 7% das
// contagens de jul–out; contra 1,5× o maior uso, em 0,3%.
const ALERTA_VEZES = 1.5;
const ALERTA_MINIMO = 1;

// Quilos de filé limpo -> peixes inteiros equivalentes. Os fatores vêm do
// servidor (que os lê de dados/compras.json) para não existir uma terceira
// versão do mesmo rendimento entre tela, servidor e Conversor de Salmão.
const fileEmPeixes = (kg) => {
  const c = (CONFIG && CONFIG.conversao_file) || {};
  const rend = c.rendimento > 0 ? c.rendimento : 0.538;
  const kgPeixe = c.kg_por_peixe > 0 ? c.kg_por_peixe : 30 / 7;
  return !kg ? 0 : (kg / rend) / kgPeixe;
};

// O inicial que vale na linha: o digitado na contagem da manhã ou, com a caixa
// vazia, o que veio do servidor (o final de ontem).
function inicialDaLinha(tr, ins) {
  const el = tr && tr.querySelector('[data-campo="inicial"]');
  return el && el.value.trim() !== "" ? num(el.value) : num(ins.inicial);
}

// "30/10": a data da coluna do final de ontem, relativa ao dia aberto.
function rotuloOntem(iso) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() - 1);
  return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0");
}

// Inicial digitado que diverge do final de ontem: é o que, ao salvar, pede
// confirmação antes de regravar ontem. Caixa vazia ou sem final ontem não conta.
function divergeDeOntem(el, ins) {
  if (!el || el.value.trim() === "" || ins.final_ontem == null) return false;
  return Math.abs(num(el.value) - num(ins.final_ontem)) > QUASE_ZERO;
}

// O que está digitado numa linha agora, mais o uso do dia. Campo vazio vira
// null (e não 0) para a linha derivada saber distinguir "não contaram ainda"
// de "contaram e deu zero".
function valoresDaLinha(chave) {
  const linha = document.querySelector('tr[data-chave="' + chave + '"]');
  const ins = DIA.casas[CASA].insumos.find((i) => i.chave === chave);
  if (!linha || !ins) return null;
  const v = { inicial: inicialDaLinha(linha, ins) };
  COLS_DERIVADAS.forEach((c) => {
    const el = linha.querySelector('[data-campo="' + c + '"]');
    v[c] = (!el || el.value === "") ? null : num(el.value);
  });
  v.uso = v.final === null ? null
    : v.inicial + num(v.entrada) - num(v.transferencia) - num(v.desperdicio) - v.final;
  return v;
}

function hoje() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function aviso(texto, tipo) {
  const el = $("#aviso");
  el.textContent = texto;
  el.className = "aviso-flut " + (tipo || "");
  el.hidden = false;
  clearTimeout(aviso._t);
  aviso._t = setTimeout(() => { el.hidden = true; }, 3200);
}

function estado(texto, classe) {
  const el = $("#estado");
  el.textContent = texto || "";
  el.className = "estado " + (classe || "");
}

// ------------------------------------------------------ motivo do erro
// Erro identificado na conta deixa a célula em vermelho e o MOTIVO guardado
// nela; o texto só aparece num pop-up pequeno ao passar o mouse. Escrito
// embaixo do número, ele alargava a linha e empurrava a tabela inteira.
function marcarErro(el, motivo) {
  if (!el) return;
  if (motivo) el.dataset.motivo = motivo;
  else delete el.dataset.motivo;
}

// Um pop-up só, preso ao body e com posição fixa: dentro da célula ele seria
// cortado pela área de rolagem da tabela nas últimas linhas.
function ligarPopupMotivo() {
  const pop = document.createElement("div");
  pop.className = "pop-motivo";
  pop.hidden = true;
  document.body.appendChild(pop);
  document.addEventListener("mouseover", (e) => {
    const alvo = e.target.closest && e.target.closest("[data-motivo]");
    if (!alvo) { pop.hidden = true; return; }
    pop.textContent = alvo.dataset.motivo;
    pop.hidden = false;
    const r = alvo.getBoundingClientRect();
    const larg = pop.offsetWidth, alt = pop.offsetHeight;
    const x = Math.max(8, Math.min(r.left + r.width / 2 - larg / 2, innerWidth - larg - 8));
    // abaixo da célula; sem espaço embaixo, acima
    const y = r.bottom + 6 + alt > innerHeight ? r.top - alt - 6 : r.bottom + 6;
    pop.style.left = x + "px";
    pop.style.top = y + "px";
  });
  document.addEventListener("scroll", () => { pop.hidden = true; }, true);
}

// ------------------------------------------------------------------ carregar
async function carregarDia(data) {
  if (sujo && !confirm("Há alterações não salvas neste dia. Descartar?")) return;
  estado("Carregando…");
  try {
    const r = await fetch("/api/dia?data=" + data);
    if (!r.ok) throw new Error("HTTP " + r.status);
    DIA = await r.json();
    sujo = false;
    estado("");
    desenhar();
  } catch (e) {
    estado("Falha ao carregar", "erro");
    aviso("Não consegui carregar o dia: " + e.message, "mau");
  }
}

// ------------------------------------------------------------------ desenhar
function desenharAbas() {
  const nav = $("#abas-casas");
  nav.innerHTML = "";
  CONFIG.casas.forEach((c) => {
    const b = document.createElement("button");
    const casa = DIA && DIA.casas[c.chave];
    // O número é o que FALTA contar naquela casa no dia — serve para varrer as
    // quatro abas sem abrir uma por uma e descobrir onde o lançamento parou.
    // Casa fechada mostra o certo verde em vez de um espaço vazio, que poderia
    // ser lido como "ainda não olhei aqui".
    const contaveis = casa ? casa.insumos.filter((i) => !i.derivado) : [];
    const faltam = contaveis.filter((i) => i.final == null || i.final === "").length;
    b.innerHTML = c.chave + (faltam
      ? ' <span class="pend" title="insumos sem contagem">' + faltam + "</span>"
      : ' <span class="pend feito" title="dia completo">✓</span>');
    b.title = casa
      ? c.nome + (faltam
          ? ` — faltam ${faltam} de ${contaveis.length} insumos sem contagem final`
          : ` — dia completo, ${contaveis.length} insumos contados`)
      : c.nome;
    b.className = c.chave === CASA ? "ativa" : "";
    b.onclick = () => { CASA = c.chave; desenhar(); };
    nav.appendChild(b);
  });
}

function desenhar() {
  desenharAbas();
  const alvo = $("#painel");
  if (!DIA) { alvo.innerHTML = '<p class="vazio">Escolha uma data.</p>'; return; }
  const casa = DIA.casas[CASA];

  function fonteFaturamento(casa) {
    const p = casa.faturamento_pendente;
    if (p && p.erro) {
      return '<strong class="pendente">R$ ' + fmt(p.valor) + " ainda não foi gravado na planilha "
        + "Faturamento - 2026: " + p.erro + ". O sistema tenta de novo sozinho.</strong>";
    }
    if (p) return "Gravando R$ " + fmt(p.valor) + " na planilha Faturamento - 2026…";
    return casa.faturamento_da_planilha
      ? "Faturamento bruto da planilha Faturamento - 2026. Se editar aqui, o valor digitado é gravado nela."
      : "Sem faturamento bruto na planilha para esta data — o que for digitado aqui é gravado nela.";
  }

  const cartao = document.createElement("section");
  cartao.className = "cartao cartao-lancamento";
  cartao.innerHTML =
    '<div class="cabeca">' +
      "<h2>" + casa.nome + "</h2>" +
      // Faturamento = total de pedidos - total de descontos. Com o total de
      // pedidos preenchido, o faturamento e so o resultado e fica travado;
      // sem ele (dia antigo, vindo da planilha), continua digitavel.
      '<div class="fat">' +
        '<label><span>Total de pedidos (R$)</span>' +
        '<input id="total-pedidos" class="dinheiro" type="text" inputmode="decimal" value="' +
          (casa.total_pedidos != null ? fmt(casa.total_pedidos) : "") + '"></label>' +
        '<span class="op" aria-hidden="true">−</span>' +
        '<label><span>Total de descontos (R$)</span>' +
        '<input id="total-descontos" class="dinheiro" type="text" inputmode="decimal" value="' +
          (casa.total_descontos != null ? fmt(casa.total_descontos) : "") + '"></label>' +
        '<span class="op" aria-hidden="true">=</span>' +
        '<label><span>Faturamento (Bruto) do Dia (R$)</span>' +
        '<input id="faturamento" class="dinheiro" type="text" inputmode="decimal" value="' +
          (casa.faturamento ? fmt(casa.faturamento) : "") + '"></label>' +
      "</div>" +
    "</div>" +
    '<p class="fonte">' + fonteFaturamento(casa) + "</p>";

  const tab = document.createElement("table");
  tab.className = "tabela-lancamento";
  // A ordem das colunas segue a vida do estoque no dia: o que tinha, o que
  // entrou, o que saiu para outra casa, o que se perdeu e o que sobrou na
  // contagem. Assim a linha e lida da esquerda para a direita na mesma ordem
  // em que os numeros acontecem no balcao.
  tab.innerHTML = "<thead><tr>" +
    "<th>Insumo</th>" +
    "<th>" + rotuloOntem(DIA.data) + "<br><span class=\"un\">final de ontem</span></th>" +
    "<th>Inicial<br><span class=\"un\">contagem da manhã</span></th>" +
    // o esclarecimento vai embaixo, em linha própria: ao lado do título ele
    // estourava a coluna e o cabeçalho aparecia cortado
    "<th>Entrada<br><span class=\"un\">chegada</span></th>" +
    "<th>Saída<br><span class=\"un\">transferência</span></th>" +
    "<th>Desperdício</th><th>Final<br><span class=\"un\">contagem</span></th>" +
    "<th>Uso do dia</th><th>Coef.</th></tr></thead>";
  const corpo = document.createElement("tbody");

  let grupo = null;
  casa.insumos.forEach((ins) => {
    if (ins.grupo !== grupo) {
      grupo = ins.grupo;
      const tr = document.createElement("tr");
      tr.className = "grupo";
      tr.innerHTML = '<td colspan="9">' + grupo + "</td>";
      corpo.appendChild(tr);
    }
    const tr = document.createElement("tr");
    tr.dataset.chave = ins.chave;
    // Linha derivada: só leitura. Só existe uma, o salmão equivalente 08/10.
    // As quatro colunas do meio deixaram de ser uma frase e passaram a mostrar
    // o número: entrada, saída, perda e contagem também somam.
    if (ins.derivado) {
      tr.classList.add("derivada");
      const origem = "Soma das libragens convertidas para peixe-equivalente 08/10, "
        + "mais o filé limpo que sobrou, também convertido. O filé entra no final "
        + "do dia e vira o inicial do dia seguinte — calculado.";
      tr.innerHTML =
        "<td>" + ins.nome + ' <span class="un">(' + ins.un + ")</span>" +
          ' <span class="selo-mini" title="' + origem + '">calculado</span></td>' +
        '<td class="calc d-ontem"></td>' +
        '<td class="calc d-inicial">' + fmt(ins.inicial, 3) + "</td>" +
        '<td class="calc d-entrada"></td><td class="calc d-transferencia"></td>' +
        '<td class="calc d-desperdicio"></td><td class="calc d-final"></td>' +
        '<td class="calc uso"></td><td class="calc coef"></td>';
      corpo.appendChild(tr);
      return;
    }
    // Veio da planilha: o selo diz de onde, mas o campo ACEITA correção. Ao
    // salvar um número diferente, o servidor solta a marca de planilha e a
    // sincronização passa a respeitar o valor digitado — antes a linha era
    // somente-leitura e não havia como corrigir contagem sem abrir o Excel.
    const dica = ins.editado
      ? ' title="Corrigido aqui, por cima do valor da planilha. A sincronização não sobrescreve mais esta linha."'
      : ins.da_planilha
        ? ' title="Valor sincronizado da planilha. Pode corrigir: ao salvar, este número passa a valer."'
        : "";
    if (ins.da_planilha) tr.classList.add("da-planilha");
    if (ins.editado) tr.classList.add("editada");
    const campo = (nome, valor) =>
      '<td><input data-campo="' + nome + '" type="text" inputmode="decimal" value="' +
      qtd(valor) + '"' + dica + "></td>";
    const selo = ins.editado
      ? ' <span class="selo-mini editado" title="Corrigido no sistema, por cima da planilha">editado</span>'
      : ins.da_planilha
        ? ' <span class="selo-mini" title="Sincronizado da planilha">planilha</span>' : "";
    // Linha de contagem (o filé de produção): só início e fim. As colunas de
    // movimento ficam vazias porque não existem — filé não é comprado nem
    // transferido, é produzido do peixe que a libragem já contou —, e uso e
    // coeficiente também, porque o consumo do salmão é medido no equivalente,
    // que já soma este filé.
    const vazias = '<td class="calc"></td>';
    // Final de ontem, só leitura, ao lado do inicial: a conferência da manhã
    // compara os dois de olho.
    const ontem = '<td class="calc ontem">' + (ins.final_ontem == null ? "—"
      : fmt(num(ins.final_ontem), 3)) + "</td>";
    // Inicial de verdade: a contagem da manhã, digitada. Vem preenchido só se o
    // dia já tem um gravado (planilha ou digitação anterior); vazio, a conta usa
    // o final de ontem. Diferente de ontem, ao salvar a tela pergunta se o
    // final de ontem deve ser regravado com o mesmo número.
    const valIni = ins.inicial_gravado ? qtd(ins.inicial) : "";
    const inicial = '<td><input data-campo="inicial" type="text" inputmode="decimal" value="' +
      valIni + '" data-original="' + valIni + '" placeholder="' +
      (ins.final_ontem == null ? "" : qtd(ins.final_ontem)) + '" title="Contagem da manhã. ' +
      'Vazio, vale o final de ontem. Se divergir, ao salvar você escolhe se o final de ' +
      'ontem recebe o mesmo número."></td>';
    tr.innerHTML =
      "<td>" + ins.nome + ' <span class="un">(' + ins.un + ")</span>" + selo + "</td>" +
      ontem + inicial +
      (ins.so_contagem
        ? vazias + vazias + vazias + campo("final", ins.final) + vazias + vazias
        : campo("entrada", ins.entrada) + campo("transferencia", ins.transferencia) +
          campo("desperdicio", ins.desperdicio) + campo("final", ins.final) +
          '<td class="calc uso"></td><td class="calc coef"></td>');
    corpo.appendChild(tr);
  });

  tab.appendChild(corpo);
  const rol = document.createElement("div");
  rol.className = "rolagem";
  rol.appendChild(tab);
  cartao.appendChild(rol);
  alvo.innerHTML = "";
  alvo.appendChild(cartao);
  alvo.appendChild(desenharProcessamento(casa));

  alvo.addEventListener("input", aoDigitar);
  alvo.addEventListener("focusout", aoSairDoCampo);
  calcularFaturamento();
  recalcular();
}

// ------------------------------------------------------ processamento
// Anel de lula, tentaculo de lula e lombo de atum chegam crus e passam pelo
// processamento antes de ir ao balcao. Aqui a casa informa DOIS numeros: quanto
// colocou para processar e quanto rendeu. A perda e o rendimento saem dessa
// conta — nao sao digitados, justamente para nao existir um rendimento
// "combinado" diferente do que a balanca mostrou.
//
// O rendimento daqui e o que a Projecao de Compras usa para transformar o
// estoque processado de volta em in natura. Antes disso ela usava uma media
// fixa (lula 70%, polvo 30%, atum 85%), que e so o meio da faixa padrao.
function desenharProcessamento(casa) {
  const itens = Object.values(casa.processamento || {});
  // servidor antigo (ou resposta em cache) nao manda o bloco: melhor nada do
  // que um cartao vazio no meio da tela
  if (!itens.length) return document.createDocumentFragment();
  const sec = document.createElement("section");
  sec.className = "cartao cartao-processamento";

  sec.innerHTML =
    '<div class="cabeca"><h2>Processamento do dia</h2></div>' +
    '<p class="fonte">Informe quanto foi para processar e quanto rendeu. A perda e o ' +
    "rendimento são calculados. É este rendimento que a Projeção de Compras usa para " +
    "converter o estoque processado de volta em in natura.</p>";

  const tab = document.createElement("table");
  tab.className = "tabela-lancamento tabela-processamento";
  tab.innerHTML = "<thead><tr>" +
    "<th>Item</th>" +
    "<th>In natura<br><span class=\"un\">foi processar</span></th>" +
    "<th>Processado<br><span class=\"un\">rendeu</span></th>" +
    "<th>Perda<br><span class=\"un\">no processamento</span></th>" +
    "<th>Rendimento</th><th>Faixa padrão</th></tr></thead>";
  const corpo = document.createElement("tbody");

  itens.forEach((p) => {
    const tr = document.createElement("tr");
    tr.dataset.proc = p.chave;
    const campo = (nome, valor) =>
      '<td><input data-pcampo="' + nome + '" type="text" inputmode="decimal" value="' +
      qtd(valor) + '"></td>';
    tr.innerHTML =
      "<td>" + p.nome + ' <span class="un">(' + p.un + ")</span></td>" +
      campo("in_natura", p.in_natura) + campo("processado", p.processado) +
      '<td class="calc perda"></td><td class="calc rend"></td>' +
      '<td class="fonte faixa">' + fmt(p.padrao_min * 100, 0) + "% a " +
        fmt(p.padrao_max * 100, 0) + "%</td>";
    corpo.appendChild(tr);
  });
  tab.appendChild(corpo);
  const rol = document.createElement("div");
  rol.className = "rolagem";
  rol.appendChild(tab);
  sec.appendChild(rol);
  return sec;
}

function recalcularProcessamento() {
  const casa = DIA.casas[CASA];
  document.querySelectorAll("tr[data-proc]").forEach((tr) => {
    const p = (casa.processamento || {})[tr.dataset.proc];
    if (!p) return;
    const bruto = tr.querySelector('[data-pcampo="in_natura"]').value;
    const rendeu = tr.querySelector('[data-pcampo="processado"]').value;
    const tdPerda = tr.querySelector(".perda");
    const tdRend = tr.querySelector(".rend");
    if (bruto === "" || num(bruto) <= 0) {
      tdPerda.textContent = "—";
      tdRend.textContent = "—";
      tdPerda.className = "calc perda";
      tdRend.className = "calc rend";
      marcarErro(tdPerda, null);
      marcarErro(tdRend, null);
      return;
    }
    const perda = num(bruto) - num(rendeu);
    const r = num(rendeu) / num(bruto);
    // Perda negativa quer dizer que rendeu mais do que entrou: ou o peso do
    // cru foi anotado errado, ou o processado ja tinha saldo somado ali.
    tdPerda.className = "calc perda" + (perda < 0 ? " neg" : "");
    tdPerda.textContent = fmt(perda, 3);
    marcarErro(tdPerda, perda < 0
      ? `Rendeu mais do que entrou: ${fmt(num(rendeu), 3)} processado sobre ${fmt(num(bruto), 3)} `
        + "in natura. Confira o peso do cru ou se o processado já tinha saldo somado."
      : null);
    const fora = r < p.padrao_min || r > p.padrao_max;
    tdRend.className = "calc rend" + (fora ? " neg" : "");
    tdRend.textContent = fmt(r * 100, 2) + "%";
    marcarErro(tdRend, fora
      ? `Fora da faixa padrão: rendeu ${fmt(r * 100, 2)}%, o esperado é de `
        + `${fmt(p.padrao_min * 100, 0)}% a ${fmt(p.padrao_max * 100, 0)}%.`
      : null);
  });
}

// ------------------------------------------------------------------ calculo
function recalcular() {
  const casa = DIA.casas[CASA];
  const fat = num($("#faturamento").value);
  document.querySelectorAll("tbody tr[data-chave]").forEach((tr) => {
    const ins = casa.insumos.find((i) => i.chave === tr.dataset.chave);
    if (ins.derivado) {
      const col = { entrada: 0, transferencia: 0, desperdicio: 0, final: 0 };
      let uso = 0, temUso = false, temCol = false;
      const somar = (o, fator) => {
        if (!o) return;
        COLS_DERIVADAS.forEach((c) => {
          if (o[c] !== null) { col[c] += o[c] * fator; temCol = true; }
        });
        if (o.uso !== null) { uso += o.uso * fator; temUso = true; }
      };
      {
        for (const [banda, fator] of Object.entries(FATOR_LIBRA)) {
          somar(valoresDaLinha(banda), fator);
        }
        // O filé limpo que sobrou é salmão parado na geladeira, então entra no
        // FINAL do dia. O inicial já chega do servidor com o filé de ONTEM
        // somado — é o mesmo número, visto como fechamento de um dia e como
        // abertura do outro.
        //
        // Com o filé nos dois lados, o uso do equivalente deixa de ser a soma
        // dos usos das faixas e passa a ser a conta de estoque, a mesma das
        // linhas digitadas. Somar os usos das faixas ignoraria o filé e o dia
        // sairia com consumo inflado.
        const fil = valoresDaLinha("salmao_file");
        if (fil && fil.final !== null) {
          col.final += fileEmPeixes(fil.final);
          temCol = true;
        }
        // O inicial do equivalente acompanha o das faixas e o do filé, que
        // agora podem ser corrigidos na tela: sem refazer a soma aqui, o uso
        // ficaria com o inicial antigo até salvar.
        let ini = 0;
        for (const [banda, fator] of Object.entries(FATOR_LIBRA)) {
          const v = valoresDaLinha(banda);
          if (v) ini += v.inicial * fator;
        }
        if (fil) ini += fileEmPeixes(fil.inicial);
        tr.querySelector(".d-inicial").textContent = fmt(ini, 3);
        // O final de ontem do equivalente: mesma soma, sobre os finais de
        // ontem das faixas e do filé.
        let ont = 0, temOnt = false;
        casa.insumos.forEach((i) => {
          if (i.final_ontem == null) return;
          if (FATOR_LIBRA[i.chave]) { ont += num(i.final_ontem) * FATOR_LIBRA[i.chave]; temOnt = true; }
          else if (i.chave === "salmao_file") { ont += fileEmPeixes(num(i.final_ontem)); temOnt = true; }
        });
        tr.querySelector(".d-ontem").textContent = temOnt ? fmt(ont, 3) : "—";
        if (temCol) {
          uso = ini + col.entrada - col.transferencia - col.desperdicio - col.final;
          temUso = true;
        }
      }
      COLS_DERIVADAS.forEach((c) => {
        const td = tr.querySelector(".d-" + c);
        if (td) td.textContent = temCol ? fmt(col[c], 3) : "—";
      });
      tr.querySelector(".uso").textContent = temUso ? fmt(uso, 3) : "—";
      tr.querySelector(".coef").textContent = temUso && fat > 0 ? fmt((uso / fat) * 1000, 3) : "—";
      return;
    }
    // inicial contado diferente do final de ontem acende, para ser visto
    // antes de salvar
    const elIni = tr.querySelector('[data-campo="inicial"]');
    if (elIni) elIni.classList.toggle("diverge", divergeDeOntem(elIni, ins));
    if (ins.so_contagem) return;   // só início e fim: não há uso a calcular
    const val = (c) => {
      const el = tr.querySelector('[data-campo="' + c + '"]');
      return el ? el.value : "";
    };
    const temFinal = val("final") !== "";
    const uso = inicialDaLinha(tr, ins) + num(val("entrada")) - num(val("transferencia"))
      - num(val("desperdicio")) - num(val("final"));
    const tdUso = tr.querySelector(".uso");
    const tdCoef = tr.querySelector(".coef");
    const elFinal = tr.querySelector('[data-campo="final"]');
    if (!temFinal) {
      tdUso.textContent = "—"; tdCoef.textContent = "—"; tdUso.className = "calc uso";
      elFinal.classList.remove("suspeito");
      marcarErro(tdUso, null);
      marcarErro(elFinal.parentElement, null);
      return;
    }
    const negativo = uso < -QUASE_ZERO;
    const media = ins.media_diaria || 0;
    const maior = ins.maior_uso;
    const suspeito = !negativo && maior > 0 && uso > ALERTA_VEZES * maior
      && uso - maior >= ALERTA_MINIMO;
    const esperado = Math.max(0, uso + num(val("final")) - media);
    elFinal.classList.toggle("suspeito", suspeito);
    // O motivo vai no pop-up da célula, e não mais escrito embaixo do número.
    // O title do campo sai enquanto o alerta está aceso (o navegador abriria
    // a dica dele por cima do pop-up) e volta, com a origem, quando apaga.
    if (elFinal.dataset.dica === undefined) elFinal.dataset.dica = elFinal.title;
    elFinal.title = suspeito ? "" : elFinal.dataset.dica;
    const disponivel = uso + num(val("final"));
    const motivo = negativo
      ? `Contagem maior que o disponível: o final (${fmt(num(val("final")), 3)}) passa do que `
        + `havia no dia — inicial + entrada − saída − desperdício = ${fmt(disponivel, 3)}. `
        + "Confira a contagem ou se falta lançar alguma entrada."
      : suspeito
        ? `Possível erro de contagem: o uso do dia (${fmt(uso, 3)}) passa do maior dos últimos `
          + `30 dias (${fmt(maior, 3)}). Com o consumo médio de ${fmt(media, 3)} ${ins.un}/dia, `
          + `o final esperado seria perto de ${fmt(esperado, 3)}.`
        : null;
    marcarErro(elFinal.parentElement, suspeito ? motivo : null);
    tdUso.className = "calc uso" + (negativo || suspeito ? " neg" : "");
    // zerado() também na exibição: sem isso a coluna mostrava "-0,000".
    tdUso.textContent = fmt(zerado(uso) ? 0 : uso, 3);
    marcarErro(tdUso, motivo);
    tdCoef.textContent = fat > 0 ? fmt((uso / fat) * 1000, 3) : "—";
  });
  recalcularProcessamento();
}

// Faturamento do dia = total de pedidos - total de descontos. Sem o total de
// pedidos, o campo de faturamento volta a ser digitável (dia antigo, planilha).
function calcularFaturamento() {
  const ped = $("#total-pedidos"), desc = $("#total-descontos"), fat = $("#faturamento");
  if (!ped || !fat) return;
  const temPedidos = ped.value.trim() !== "";
  // Total de pedidos apagado: o faturamento era só o resultado da conta e não
  // pode ficar com o último valor calculado — sem a conta, a soma zera.
  // Dia antigo (faturamento digitado, nunca calculado) não passa por aqui.
  if (!temPedidos && fat.classList.contains("calculado")) fat.value = "";
  fat.readOnly = temPedidos;
  fat.classList.toggle("calculado", temPedidos);
  fat.title = temPedidos ? "Total de pedidos menos total de descontos" : "";
  if (!temPedidos) { marcarErro(desc, null); return; }
  const total = num(ped.value) - num(desc.value);
  fat.value = fmt(total);
  marcarErro(desc, total < 0
    ? "O total de descontos é maior que o total de pedidos: o faturamento ficaria negativo."
    : null);
}

function aoDigitar(e) {
  if (!e.target.matches("input")) return;
  sujo = true;
  estado("Não salvo", "erro");
  if (e.target.matches("#total-pedidos, #total-descontos")) calcularFaturamento();
  recalcular();
}

// Ao sair do campo, o que foi digitado volta no formato 0,000 — quem digita
// "14" ou "14," vê "14,000" e a coluna inteira fica na mesma régua. Só as
// caixas de quantidade: o faturamento é dinheiro e tem duas casas.
//
// Campo VAZIO continua vazio, nunca vira "0,000": vazio quer dizer "não
// contado", que é diferente de contado zero — e é essa diferença que o
// servidor usa para não gravar contagem que ninguém fez.
function aoSairDoCampo(e) {
  const el = e.target;
  if (!el.matches) return;
  if (el.value.trim() === "") return;
  // O faturamento e dinheiro: duas casas, e nao as tres da quantidade.
  if (el.matches("input.dinheiro")) { el.value = fmt(num(el.value)); return; }
  if (!el.matches("input[data-campo], input[data-pcampo]")) return;
  el.value = qtd(num(el.value));
}

// ------------------------------------------------------------------ salvar
async function salvar() {
  const casa = DIA.casas[CASA];
  // Inicial mexido agora e diferente do final de ontem: o final de ontem só é
  // regravado com o mesmo número se quem salva confirmar. Sem confirmar, o
  // inicial vale só para hoje e ontem fica como estava.
  const divergentes = [];
  document.querySelectorAll("tbody tr[data-chave]").forEach((tr) => {
    const ins = casa.insumos.find((i) => i.chave === tr.dataset.chave);
    const el = tr.querySelector('[data-campo="inicial"]');
    if (!el || ins.derivado || el.value.trim() === el.dataset.original) return;
    if (divergeDeOntem(el, ins)) {
      divergentes.push(ins.nome + ": " + fmt(num(ins.final_ontem), 3) + " → " + qtd(num(el.value)));
    }
  });
  let regravarOntem = true;
  if (divergentes.length) {
    const dia = rotuloOntem(DIA.data);
    regravarOntem = confirm("O inicial contado diverge do final de " + dia + " em "
      + divergentes.length + " insumo(s):\n\n" + divergentes.slice(0, 10).join("\n")
      + (divergentes.length > 10 ? "\n…" : "")
      + "\n\nOK: regravar o final de " + dia + " com a contagem da manhã."
      + "\nCancelar: gravar o inicial só em hoje, sem mexer no final de " + dia + ".");
  }
  const pedTxt = $("#total-pedidos").value.trim(), descTxt = $("#total-descontos").value.trim();
  casa.total_pedidos = pedTxt === "" ? null : num(pedTxt);
  casa.total_descontos = descTxt === "" ? null : num(descTxt);
  if (casa.total_pedidos != null && casa.total_pedidos - (casa.total_descontos || 0) < 0) {
    aviso("Não salvei: o total de descontos é maior que o total de pedidos.", "mau");
    return;
  }
  casa.faturamento = num($("#faturamento").value);
  document.querySelectorAll("tbody tr[data-chave]").forEach((tr) => {
    const ins = casa.insumos.find((i) => i.chave === tr.dataset.chave);
    if (ins.derivado) return;
    ["inicial", "final", "entrada", "transferencia", "desperdicio"].forEach((c) => {
      // A linha de contagem não tem as caixas de movimento: sem esta guarda o
      // querySelector devolve null e o salvamento inteiro quebra.
      const el = tr.querySelector('[data-campo="' + c + '"]');
      if (!el) return;
      const v = el.value.trim();
      ins[c] = v === "" ? null : num(v);
    });
  });

  // processamento da casa aberta: so os dois numeros digitados vao ao servidor,
  // que recalcula perda e rendimento na leitura
  document.querySelectorAll("tr[data-proc]").forEach((tr) => {
    const p = (casa.processamento || {})[tr.dataset.proc];
    if (!p) return;
    ["in_natura", "processado"].forEach((c) => {
      const v = tr.querySelector('[data-pcampo="' + c + '"]').value.trim();
      p[c] = v === "" ? null : num(v);
    });
  });

  const corpo = { data: DIA.data, regravar_ontem: regravarOntem, casas: {} };
  Object.entries(DIA.casas).forEach(([ck, c]) => {
    const insumos = {};
    c.insumos.forEach((i) => {
      insumos[i.chave] = { inicial: i.inicial, final: i.final, entrada: i.entrada,
                          transferencia: i.transferencia, desperdicio: i.desperdicio };
    });
    const proc = {};
    Object.entries(c.processamento || {}).forEach(([pk, p]) => {
      proc[pk] = { in_natura: p.in_natura, processado: p.processado };
    });
    corpo.casas[ck] = { faturamento: c.faturamento, total_pedidos: c.total_pedidos,
                        total_descontos: c.total_descontos, insumos: insumos,
                        processamento: proc };
  });

  $("#btn-salvar").disabled = true;
  estado("Salvando…");
  try {
    const r = await fetch("/api/dia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const resp = await r.json();
    if (!resp.ok) throw new Error(resp.erro || "erro no servidor");
    sujo = false;
    estado("Salvo", "ok");
    // inicial corrigido grava o final de ontem (e final corrigido, o inicial
    // de amanhã que vinha da planilha): avisa o que mudou fora do dia aberto
    const outros = (resp.encadeados || []).map((e) => {
      const ins = (DIA.casas[e.casa] || {}).insumos || [];
      const nome = (ins.find((i) => i.chave === e.insumo) || {}).nome || e.insumo;
      return nome + " (" + e.casa + ", " + e.data.split("-").reverse().slice(0, 2).join("/") + ")";
    });
    // faturamento que não foi para a planilha (abaixo do piso) não pode passar calado
    const barrados = Object.entries(resp.faturamento_planilha || {})
      .filter(([, s]) => s !== "pedido")
      .map(([ck, s]) => ((DIA.casas[ck] || {}).nome || ck) + ": " + s);
    const pedidos = Object.values(resp.faturamento_planilha || {}).filter((s) => s === "pedido").length;
    aviso("Dia " + DIA.data.split("-").reverse().join("/") + " salvo." + (outros.length
      ? " Também atualizado: " + outros.join("; ") + "." : "")
      + (pedidos ? " Faturamento sendo gravado na planilha." : "")
      + (barrados.length ? " Faturamento " + barrados.join(" ") : ""),
      barrados.length ? "mau" : "bom");
    await carregarDia(DIA.data);      // recarrega para reencadear o estoque inicial
  } catch (e) {
    estado("Falha ao salvar", "erro");
    aviso("Não consegui salvar: " + e.message, "mau");
  } finally {
    $("#btn-salvar").disabled = false;
  }
}


// ------------------------------------------------------------------ sincronizar
// Enquanto o sistema roda em paralelo com o Excel, o que voce digita nas
// planilhas de cada casa nao chega aqui sozinho. Este botao traz.
//
// Sem periodo, le o mes do ultimo lancamento — o caso de todo dia. Com periodo
// (a setinha ao lado do botao), reimporta os dias escolhidos mesmo que ja
// estejam aqui: planilha corrigida dias depois, num mes que a leitura normal
// nao alcanca, so chegava ao sistema por linha de comando.
async function sincronizar(periodo) {
  if (sujo && !confirm("Há alterações não salvas. Sincronizar vai recarregar o dia. Continuar?")) return;
  const btn = periodo ? $("#btn-sinc-periodo") : $("#btn-sinc");
  btn.disabled = true;
  const rotulo = btn.textContent;
  btn.textContent = "Lendo as planilhas…";
  estado("Sincronizando…");
  try {
    const busca = periodo
      ? "?inicio=" + periodo.inicio + "&fim=" + periodo.fim : "";
    const r = await fetch("/api/sincronizar" + busca);
    const d = await r.json();
    if (!d.ok) throw new Error(d.erro || "falha no servidor");
    // Não existe mais "nenhuma planilha aberta": a sincronização lê a planilha
    // fechada também. O que pode acontecer é o arquivo estar travado na hora.
    if ((d.bloqueadas || []).length) {
      aviso(`Não consegui ler: ${d.bloqueadas.join(", ")}. Tente de novo em alguns segundos — `
            + "o OneDrive costuma soltar o arquivo rápido.", "mau");
      estado("Sincronizado em parte", "erro");
      await carregarDia($("#data").value);
      return;
    }
    const n = d.dias_novos.length, a = d.dias_alterados.length;
    const lidas = (d.planilhas || []).join(", ");
    const onde = d.periodo ? ` no período ${brData(d.periodo[0])} a ${brData(d.periodo[1])}` : "";
    // Dia corrigido na tela não é reescrito pela planilha (regra do gravar do
    // importar_diario). Sem dizer isso, quem pede o período de novo e vê "nada
    // novo" fica achando que a sincronização não leu o arquivo.
    const mantidos = (d.dias_preservados || []).length;
    const nota = mantidos
      ? ` ${mantidos} dia(s) já corrigidos aqui na tela continuam como estão.`
      : "";
    // Insumo sem estoque final na planilha não entra (o uso sairia com o
    // estoque inteiro). Avisa quais, para quem sincronizou no meio do dia.
    const pend = d.pendentes || [];
    const notaPend = pend.length
      ? ` ${pend.length} item(ns) ainda sem estoque final na planilha ficaram de fora`
        + ` (${pend.slice(0, 4).join(", ")}${pend.length > 4 ? "…" : ""}) — entram`
        + " quando o final for preenchido e você sincronizar de novo."
      : "";
    // Do corte em diante a planilha espelha o sistema: reler seria importar o
    // próprio sistema de volta. Diz que esses dias foram pulados de propósito.
    const notaSist = d.do_sistema
      ? ` A partir de ${brData(d.corte_sistema)} o lançamento é feito aqui: as planilhas`
        + " só espelham o sistema e não foram relidas."
      : "";
    aviso((n || a
      ? `${n} dia(s) novo(s) e ${a} atualizado(s)${onde} — de ${lidas}.`
      : `Nada novo${onde} em ${lidas} — já estava tudo aqui.`) + nota + notaPend + notaSist,
      pend.length ? "mau" : "bom");
    estado("Sincronizado", "ok");
    await carregarDia($("#data").value);
  } catch (e) {
    estado("Falha ao sincronizar", "erro");
    aviso("Não consegui ler as planilhas: " + e.message, "mau");
  } finally {
    btn.disabled = false;
    btn.textContent = rotulo;
  }
}

// ------------------------------------------- escolha do periodo a reimportar
const brData = (iso) => (iso || "").split("-").reverse().join("/");
const primeiroDoMes = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const isoLocal = (d) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function abrirPeriodo(abrir) {
  $("#painel-periodo").hidden = !abrir;
  $("#btn-periodo").setAttribute("aria-expanded", abrir ? "true" : "false");
  // Abre no mês atual: é o pedido mais comum, e um campo de data em branco
  // obrigaria a digitar duas datas para o caso de sempre.
  if (abrir && !$("#sinc-inicio").value) presetPeriodo("mes");
}

function presetPeriodo(qual) {
  const agora = new Date();
  let inicio = primeiroDoMes(agora), fim = agora;
  if (qual === "anterior") {
    inicio = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
    fim = new Date(agora.getFullYear(), agora.getMonth(), 0);
  } else if (qual === "7") {
    inicio = new Date(agora.getTime() - 6 * 86400000);
  }
  $("#sinc-inicio").value = isoLocal(inicio);
  $("#sinc-fim").value = isoLocal(fim);
}

function ligarPeriodo() {
  $("#btn-periodo").onclick = () => abrirPeriodo($("#painel-periodo").hidden);
  $("#painel-periodo").querySelectorAll("[data-preset]").forEach((b) => {
    b.onclick = () => presetPeriodo(b.dataset.preset);
  });
  $("#btn-sinc-periodo").onclick = async () => {
    const inicio = $("#sinc-inicio").value, fim = $("#sinc-fim").value;
    if (!inicio || !fim) { aviso("Informe as duas datas do período.", "mau"); return; }
    abrirPeriodo(false);
    await sincronizar({ inicio, fim });
  };
  document.addEventListener("click", (e) => {
    if (!$("#painel-periodo").hidden && !e.target.closest(".botao-duplo")) abrirPeriodo(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#painel-periodo").hidden) abrirPeriodo(false);
  });
}

// ------------------------------------------------------------------ inicio
function mudarDia(passo) {
  const d = new Date($("#data").value + "T12:00:00");
  d.setDate(d.getDate() + passo);
  const iso = d.toISOString().slice(0, 10);
  $("#data").value = iso;
  carregarDia(iso);
}

(async function iniciar() {
  try {
    CONFIG = await (await fetch("/api/config")).json();
  } catch (e) {
    $("#painel").innerHTML = '<p class="vazio">Servidor fora do ar. Rode o Servidor.bat.</p>';
    return;
  }
  if (!CONFIG.faturamento_ok) {
    aviso("Planilha de faturamento não encontrada — o campo virá em branco.", "mau");
  }
  // ?data=AAAA-MM-DD abre direto num dia: o Resumo do dia do Painel manda
  // para ca a pendencia de uma casa naquele dia.
  const pedido = (new URLSearchParams(location.search).get("data") || "").match(/^\d{4}-\d{2}-\d{2}$/);
  const inicio = pedido ? pedido[0] : hoje();
  $("#data").value = inicio;
  $("#data").onchange = (e) => carregarDia(e.target.value);
  $("#dia-anterior").onclick = () => mudarDia(-1);
  $("#dia-seguinte").onclick = () => mudarDia(1);
  $("#dia-hoje").onclick = () => { $("#data").value = hoje(); carregarDia(hoje()); };
  $("#btn-salvar").onclick = salvar;
  $("#btn-sinc").onclick = () => sincronizar();
  ligarPeriodo();
  ligarPopupMotivo();
  window.addEventListener("beforeunload", (e) => { if (sujo) e.preventDefault(); });
  carregarDia(inicio);
})();
