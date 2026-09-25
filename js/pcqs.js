// ============================================================================
// PCQS — Planilha de Controle de Qualidade do Salmão
//
// Leitura e análise do documento que a gerência preenche a cada recebimento de
// salmão. Ele chega por duas portas, as mesmas do Importar OC: a planilha
// (.xlsx) preenchida na loja e o PDF que sai dela. As duas versões têm o mesmo
// desenho — três colunas por caixa (etiqueta, físico, conformidade) e um bloco
// de seis linhas para cada caixa recebida.
//
// Em vez de decorar coordenadas de célula, a leitura junta os pedaços de texto
// em PARES rótulo→valor na ordem em que a folha se lê (esquerda para a direita,
// de cima para baixo). É isso que faz o mesmo código servir para o PDF e para a
// planilha: muda quem produz as linhas, não quem as interpreta. Onde o mesmo
// rótulo aparece duas vezes na caixa ("Libragem", "Quantidade de Peixes"), vale
// a ORDEM — a primeira ocorrência é a da coluna da esquerda, como se lê.
//
// A análise não repete o "APROVADO" da planilha: ela recalcula tudo a partir
// dos números medidos. O documento que vai ao fornecedor precisa sustentar
// cobrança, e para isso a divergência tem de ser contada aqui, não copiada.
//
// Arquivo sem DOM de propósito: o mesmo módulo alimenta a tela e o PDF, e roda
// no node nos testes.
// ============================================================================

// Libra para quilo — a libragem ("12/14") é a faixa de peso de cada peixe em
// libras, e é ela que diz se o peixe entregue é o peixe comprado.
const PCQS_LB_KG = 0.45359237;

const PCQS_AJUSTES_PADRAO = {
  // Tolerância de peso: a balança da loja e a do fornecedor nunca fecham no
  // gramo. Meio por cento é o que a área aceita sem virar cobrança; abaixo
  // disso, apontar divergência só geraria ruído.
  tolPesoPerc: 0.5,
  // Piso por caixa: 0,5% de uma caixa de 30 Kg dá 150 g, fino demais para
  // caixa com gelo. O piso evita apontar caixa por causa de um punhado de gelo.
  tolPesoKg: 0.300,
  // Validade curta é não conformidade mesmo com peso e sensorial perfeitos:
  // salmão que chega com menos de uma semana de prazo vira perda na loja.
  validadeMinDias: 7,
};

// ---------------------------------------------------------------- utilitários
const pcqsLimpa = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
const pcqsChave = (s) => pcqsLimpa(s).normalize("NFD")
  .replace(/[̀-ͯ]/g, "").toLowerCase();
// Chave de rótulo: só letras, números e espaço. "Peso Líquido (Kg):" e
// "PESO LIQUIDO (KG)" caem na mesma chave "peso liquido kg".
const pcqsRot = (s) => pcqsChave(s).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

// Número em pt-BR. A vírgula é o separador decimal: "30,900 KG" são trinta
// quilos e novecentos gramas, não trinta mil.
function pcqsNum(v) {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  let t = String(v == null ? "" : v).replace(/[^\d,.-]/g, "");
  if (!t) return 0;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = parseFloat(t);
  return isNaN(n) ? 0 : n;
}
const pcqsFmt = (n, c = 2) => (n === null || n === undefined || !isFinite(n)) ? "—"
  : Number(n).toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });
const pcqsKg = (n) => pcqsFmt(n, 3) + " Kg";
const pcqsRs = (n) => "R$ " + pcqsFmt(n, 2);
const pcqsPcs = (n) => pcqsFmt(n, 0) + " pçs";
// Sinal explícito: num relatório de acerto, "+0,340" e "-0,340" são o
// fornecedor devendo ou a loja devendo. O sinal não é enfeite.
const pcqsSinalKg = (n) => (n > 0 ? "+" : "") + pcqsKg(n);
const pcqsSinalRs = (n) => (n > 0 ? "+" : "") + pcqsRs(n);
const pcqsSinalPcs = (n) => (n > 0 ? "+" : "") + pcqsPcs(n);

// "15/09/26 - 17:38" / "26/09/2026" → Date ao meio-dia (meio-dia para a data
// não escorregar um dia por fuso na hora de contar prazo de validade).
function pcqsData(str) {
  const m = String(str || "").match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (!m) return null;
  let [, d, mo, y] = m;
  y = Number(y); if (y < 100) y += 2000;
  const dt = new Date(y, Number(mo) - 1, Number(d), 12);
  return isNaN(dt.getTime()) ? null : dt;
}
// Nome de pessoa: "DAYLSON RODRIGUES" -> "Daylson Rodrigues". Caixa alta em
// nome próprio grita no documento e ainda por cima é o formato de quem digitou
// na planilha, não uma decisão de quem assina o relatório. Preposição fica
// minúscula ("Maria da Silva") e pedaço depois de hífen ou apóstrofo também
// leva inicial maiúscula ("D'Ávila", "Santa-Rita").
const PCQS_PREPOSICOES = ["de", "da", "do", "das", "dos", "e", "di", "du", "del",
  "van", "von", "y"];
function pcqsNomeProprio(v) {
  const t = pcqsLimpa(v);
  if (!t) return "";
  return t.toLowerCase().split(" ").map((parte, i) => {
    if (i > 0 && PCQS_PREPOSICOES.includes(parte)) return parte;
    return parte.replace(/(^|[-'’])([a-zà-ÿ])/g,
      (m, antes, letra) => antes + letra.toUpperCase());
  }).join(" ");
}

const pcqsDataBR = (dt) => !dt ? "" : String(dt.getDate()).padStart(2, "0") + "/" +
  String(dt.getMonth() + 1).padStart(2, "0") + "/" + dt.getFullYear();
const pcqsDias = (de, ate) => (!de || !ate) ? null
  : Math.round((ate.getTime() - de.getTime()) / 86400000);

// ---------------------------------------------------------------- rótulos
// Alias → campo. O que muda entre a planilha e o PDF é a grafia do rótulo
// ("Peso Físico" x "Peso Físico (Kg)"); o campo é o mesmo.
const PCQS_CAMPOS = {
  // cabeçalho
  "custo unitario": "custoUnitario", "custo unitario r kg": "custoUnitario",
  "custo unitario rkg": "custoUnitario", "custo": "custoUnitario",
  "numero da nf": "nf", "no da nf": "nf", "n da nf": "nf", "nota fiscal": "nf",
  "fornecedor": "fornecedor",
  "data hora da entrega": "entrega", "datahora da entrega": "entrega",
  "data da entrega": "entrega", "data hora de entrega": "entrega",
  "data e hora da entrega": "entrega",
  "total de caixas": "caixasNF", "quantidade de caixas": "caixasNF",
  "peso total nf": "pesoNF", "peso total da nf": "pesoNF", "peso total": "pesoNF",
  "responsavel": "responsavel", "conferente": "responsavel",
  "loja": "loja", "unidade": "loja",
  "observacoes": "observacoes", "observacao": "observacoes", "obs": "observacoes",
  // caixa — coluna das etiquetas
  "n do lote": "lote", "no do lote": "lote", "numero do lote": "lote", "lote": "lote",
  "peso bruto": "pesoBruto",
  "peso liquido": "pesoLiquido",
  "validade": "validade",
  // caixa — coluna física
  "peso fisico": "pesoFisico",
  "odor": "odor", "visual": "visual", "fibra": "fibra", "gelo": "gelo",
  // repetidos nas duas colunas: a ordem de leitura resolve
  "libragem": "libragem",
  "quantidade de peixes": "peixes", "qtd de peixes": "peixes",
  "quantidade de peixe": "peixes",
  // caixa — coluna de conformidade
  "peso medio": "pesoMedio",
  "status": "status",
  "motivo da reprovacao": "motivo", "motivo de reprovacao": "motivo",
  "motivo": "motivo",
  // fim do documento
  "orientacoes": "orientacoes",
};
// Sufixos de unidade que entram no rótulo e não mudam o campo.
const PCQS_SUFIXOS = / (kg|r kg|rkg|pxs|pcs|un|nf|d)$/;
const PCQS_MAX_PALAVRAS_ROTULO = 5;

function pcqsCampoDoRotulo(rotulo) {
  let r = pcqsRot(rotulo);
  for (let i = 0; i < 3; i++) {
    if (PCQS_CAMPOS[r]) return PCQS_CAMPOS[r];
    const curto = r.replace(PCQS_SUFIXOS, "");
    if (curto === r) return null;
    r = curto;
  }
  return PCQS_CAMPOS[r] || null;
}

// Valor de planilha que significa "ninguém preencheu". As listas do PCQS vêm
// com a instrução dentro da própria célula ("SELECIONE A LIBRAGEM").
function pcqsValor(v) {
  const s = pcqsLimpa(v);
  if (!s) return "";
  const k = pcqsChave(s);
  if (k.startsWith("selecione") || k === "-" || k === "—" || k === "n/a") return "";
  return s;
}

// ---------------------------------------------------------------- gerentes
// Quem valida o relatório depende da casa que recebeu. É lista, e não regra
// espalhada pelo código: quando trocar o gerente de uma loja, troca-se aqui e
// vale para os três documentos. A tela continua deixando corrigir na hora — a
// lista é o padrão de quem assina, não uma trava.
//
// O nome da loja chega como a planilha escreveu ("SENADOR LEMOS", "Delivery
// Umarizal"), por isso o casamento é por pedaço do nome e, de quebra, pela
// sigla usada no CDE (SL, DC, DLU, DLCN).
const PCQS_GERENTE_SUPRIMENTOS = "José do Couto";
const PCQS_GERENTES_OPERACIONAIS = [
  { nome: "Emesson Soares",
    pedacos: ["senador lemos", "duque de caxias"], siglas: ["sl", "dc"] },
  { nome: "Francenilde Moraes",
    pedacos: ["umarizal", "cidade nova"], siglas: ["dlu", "dlcn"] },
];

function pcqsGerentesDaLoja(loja) {
  const k = pcqsChave(loja);
  let operacional = "";
  if (k) {
    const achado = PCQS_GERENTES_OPERACIONAIS.find((g) =>
      g.pedacos.some((p) => k.includes(p)) || g.siglas.includes(k));
    if (achado) operacional = achado.nome;
  }
  return { suprimentos: PCQS_GERENTE_SUPRIMENTOS, operacional };
}

// ---------------------------------------------------------------- linhas
// Uma linha é { y, pecas:[{x, str}] }. No PDF isso vem do pdf.js (veja
// pdfLinesFromItems, em importar-pdf.js); na planilha, da função abaixo.

// Linhas a partir da matriz da planilha (XLSX.utils.sheet_to_json header:1).
// A coluna virtual x = índice da coluna: serve para manter a ordem de leitura,
// que é o que a análise usa.
function pcqsLinhasDaPlanilha(matriz) {
  const linhas = [];
  (matriz || []).forEach((linha, iy) => {
    const pecas = [];
    (linha || []).forEach((cel, ix) => {
      const s = pcqsLimpa(cel);
      if (!s) return;
      // A coluna de índice das caixas ("ETIQUETA 01", "DADOS") é rótulo de
      // desenho, não dado: solta no pareamento, viraria valor de alguém.
      if (ix === 0 && /^(etiqueta|dados|a\d+:)/.test(pcqsChave(s))) return;
      pecas.push({ x: ix * 24, str: s });
    });
    if (pecas.length) linhas.push({ y: -iy, pecas });
  });
  return linhas;
}

// Texto da linha, para os testes de seção.
const pcqsTextoDaLinha = (l) => pcqsLimpa((l.pecas || []).map((p) => p.str).join(" "));

// Linhas a partir dos pedaços de texto do pdf.js.
//
// A montagem é a de importar-pdf.js — mesmo y, com folga, ordenado da esquerda
// para a direita — com uma diferença que aqui é decisiva: o lixo da lateral sai
// ANTES do agrupamento. No PCQS, "ETIQUETA 01" é impresso girado e o pdf.js
// devolve uma letra por linha, cada uma a um ou dois pontos de distância das
// linhas de dados. Agrupando com elas, a letra rouba a linha do rótulo e o
// valor que vinha logo abaixo ("Odor:" numa linha, "REGULAR" na seguinte)
// termina numa linha só dele — o odor chega vazio ao relatório.
function pcqsLinhasDeItens(itens, largura) {
  const pecas = pcqsSemMargem((itens || [])
    .filter((it) => it.str && it.str.trim() !== "")
    .map((it) => ({
      x: it.transform ? it.transform[4] : it.x,
      y: it.transform ? it.transform[5] : it.y,
      w: it.width || it.w || 0,
      str: pcqsLimpa(it.str),
    })), largura)
    .sort((a, b) => b.y - a.y);

  const linhas = [];
  pecas.forEach((p) => {
    // a linha MAIS PRÓXIMA, não a primeira dentro da folga: com duas linhas
    // vizinhas na folga, a primeira encontrada nem sempre é a certa
    let alvo = null, dist = Infinity;
    linhas.forEach((l) => {
      const d = Math.abs(l.y - p.y);
      if (d <= 2.5 && d < dist) { alvo = l; dist = d; }
    });
    if (alvo) alvo.pecas.push(p);
    else linhas.push({ y: p.y, pecas: [p] });
  });
  linhas.forEach((l) => l.pecas.sort((a, b) => a.x - b.x));
  return linhas;
}

// Lixo da margem esquerda: no PDF, o PCQS imprime "ETIQUETA 01" e "DADOS"
// girados na lateral, e o pdf.js devolve cada letra como um pedaço solto ("A",
// "T", "E", "U", "Q"). Junto vêm sobras do intervalo impresso ("A1:K114").
// Tudo isso mora à esquerda de onde começa a primeira coluna de rótulos.
// Só vale para o PDF, que tem margem em pontos: na planilha a limpeza é por
// célula (a coluna A inteira), feita em pcqsLinhasDaPlanilha, e aqui `largura`
// chega zerada justamente para esta função não mexer em nada.
function pcqsSemMargem(pecas, largura) {
  const limite = largura ? largura * 0.05 : 0;
  if (!limite) return (pecas || []).slice();
  return (pecas || []).filter((p) => {
    if (p.x < limite) return false;
    // letra ou duas soltas, ainda na faixa da lateral
    if (p.x < limite * 1.6 && /^[A-Za-z]{1,2}$/.test(p.str)) return false;
    return true;
  });
}

// "PRODUTO APROVADO" / "PRODUTO REPROVADO" é o veredito da planilha para a
// caixa e vem sem rótulo. Sai da linha antes do pareamento: se ficasse, seria
// engolido como valor do último rótulo da linha.
function pcqsTiraVeredito(pecas) {
  const fora = [];
  const resto = [];
  for (let i = 0; i < pecas.length; i++) {
    const a = pcqsChave(pecas[i].str);
    const b = i + 1 < pecas.length ? pcqsChave(pecas[i + 1].str) : "";
    if (a === "produto" && /^(aprovado|reprovado)$/.test(b)) {
      fora.push(b.toUpperCase()); i++; continue;
    }
    const junto = a.match(/^produto (aprovado|reprovado)$/);
    if (junto) { fora.push(junto[1].toUpperCase()); continue; }
    resto.push(pecas[i]);
  }
  return { veredito: fora[0] || "", pecas: resto };
}

// Pares rótulo→valor de uma linha, na ordem em que se leem.
//
// O pareamento é guiado pela LISTA de rótulos, não pelo dois-pontos: dentro de
// "31,240 KG Visual: REGULAR" o dois-pontos não diz onde termina o valor
// anterior e começa o rótulo seguinte — a lista, sim.
function pcqsParesDaLinha(linha, largura) {
  const limpo = pcqsTiraVeredito(pcqsSemMargem(linha.pecas, largura));
  // uma palavra por posição, guardando o x de onde ela saiu
  const palavras = [];
  limpo.pecas.forEach((p) => {
    String(p.str).split(/\s+/).filter(Boolean).forEach((w) => palavras.push({ x: p.x, w }));
  });

  const pares = [];
  let atual = null, valor = [], solto = [];
  const fecha = () => {
    if (atual) pares.push({ campo: atual.campo, rotulo: atual.rotulo, x: atual.x,
                            valor: pcqsValor(valor.join(" ")) });
    atual = null; valor = [];
  };

  let i = 0;
  while (i < palavras.length) {
    let achou = null;
    // rótulo mais longo primeiro: "quantidade de peixes" antes de "quantidade"
    for (let n = Math.min(PCQS_MAX_PALAVRAS_ROTULO, palavras.length - i); n >= 1; n--) {
      const trecho = palavras.slice(i, i + n);
      // o rótulo só vale se a planilha marcou o fim dele com dois-pontos
      if (!/:$/.test(trecho[trecho.length - 1].w)) continue;
      const campo = pcqsCampoDoRotulo(trecho.map((t) => t.w).join(" "));
      if (campo) {
        achou = { campo, n, rotulo: trecho.map((t) => t.w).join(" "), x: trecho[0].x };
        break;
      }
    }
    if (achou) { fecha(); atual = achou; i += achou.n; continue; }
    if (atual) valor.push(palavras[i].w);
    else solto.push(palavras[i].w);
    i++;
  }
  fecha();
  return { pares, solto: pcqsLimpa(solto.join(" ")), veredito: limpo.veredito };
}

// ---------------------------------------------------------------- páginas
// Página de relatório já remodelado por esta tela: se alguém reenviar o PDF de
// saída (ou o PCQS com o relatório anexado atrás), essa página não é PCQS e
// não entra na leitura.
const pcqsEhPaginaDeRelatorio = (texto) =>
  /relatorio de conferencia de recebimento/.test(pcqsChave(texto));

const PCQS_CAMPOS_CABECA = ["custoUnitario", "nf", "fornecedor", "entrega",
  "caixasNF", "pesoNF", "responsavel", "loja", "validade", "libragem"];

// Lê uma página do PCQS: cabeçalho, caixas e observações.
function lerPcqsPagina(pagina) {
  const largura = pagina.largura || pagina.width || 0;
  const linhas = pagina.linhas || pagina.lines || [];
  const cab = {};
  const caixas = [];
  const observacoes = [];
  let caixa = null, emObs = false, acabou = false;
  let passouPreliminares = false;
  let loja = "";

  // contador de repetição DENTRO da caixa: é a ordem de leitura que separa a
  // libragem da etiqueta da libragem da conformidade
  const vezes = {};

  const novaCaixa = () => {
    caixa = { n: caixas.length + 1, lote: "", libragemEtiqueta: "", pesoBruto: 0,
              pesoLiquido: 0, peixesEtiqueta: 0, validade: "", peixesFisico: 0,
              pesoFisico: 0, odor: "", visual: "", fibra: "", gelo: "",
              pesoMedioPlanilha: 0, libragemConf: "", status: "", motivo: "",
              veredito: "" };
    caixas.push(caixa);
    Object.keys(vezes).forEach((k) => delete vezes[k]);
  };

  linhas.forEach((linha) => {
    if (acabou) return;
    const texto = pcqsTextoDaLinha(linha);
    const norm = pcqsChave(texto);
    if (/^orientacoes/.test(norm) || /^1: sao as primeiras/.test(norm)) { acabou = true; return; }
    if (/informacoes preliminares/.test(norm)) { passouPreliminares = true; return; }
    // títulos dos três grupos e as notas de responsabilidade: desenho da folha
    if (/informacoes das etiquetas|informacoes fisicas|analise de conformidade/.test(norm)) return;
    if (/^\(preenchimento/.test(norm)) return;

    const { pares, solto, veredito } = pcqsParesDaLinha(linha, largura);

    // Nome da loja: linha sem rótulo, acima do bloco de recebimento e fora da
    // margem (o título do documento e as sobras da lateral ficam de fora).
    if (!passouPreliminares && !pares.length && solto) {
      if (!/pcqs|planilha controle de qualidade/.test(pcqsChave(solto))) {
        const centrais = pcqsSemMargem(linha.pecas, largura)
          .filter((p) => !largura || p.x > largura * 0.12);
        const nome = pcqsLimpa(centrais.map((p) => p.str).join(" "));
        if (!loja && nome.length > 2 && /[a-z]/i.test(nome)) loja = nome;
      }
      return;
    }

    if (veredito && caixa) caixa.veredito = veredito;

    pares.forEach((par) => {
      if (par.campo === "orientacoes") { acabou = true; return; }
      if (par.campo === "observacoes") {
        emObs = true;
        if (par.valor) observacoes.push(par.valor);
        return;
      }
      if (par.campo === "lote") { novaCaixa(); emObs = false; }

      if (!caixa) {                                   // ainda no cabeçalho
        if (PCQS_CAMPOS_CABECA.includes(par.campo) && !cab[par.campo]) cab[par.campo] = par.valor;
        return;
      }

      vezes[par.campo] = (vezes[par.campo] || 0) + 1;
      const ordem = vezes[par.campo];
      switch (par.campo) {
        case "lote": caixa.lote = par.valor; break;
        case "pesoBruto": caixa.pesoBruto = pcqsNum(par.valor); break;
        case "pesoLiquido": caixa.pesoLiquido = pcqsNum(par.valor); break;
        case "validade": caixa.validade = par.valor; break;
        case "pesoFisico": caixa.pesoFisico = pcqsNum(par.valor); break;
        case "odor": caixa.odor = par.valor; break;
        case "visual": caixa.visual = par.valor; break;
        case "fibra": caixa.fibra = par.valor; break;
        case "gelo": caixa.gelo = par.valor; break;
        case "pesoMedio": caixa.pesoMedioPlanilha = pcqsNum(par.valor); break;
        case "status": caixa.status = par.valor; break;
        case "motivo": caixa.motivo = par.valor; break;
        // a primeira "Libragem" da caixa é a da etiqueta; a segunda é a que a
        // análise de conformidade devolve depois da pesagem
        case "libragem":
          if (ordem === 1) caixa.libragemEtiqueta = par.valor;
          else caixa.libragemConf = par.valor;
          break;
        // "Quantidade de Peixes" abre a linha da coluna física e volta na
        // quinta linha, na coluna das etiquetas
        case "peixes":
          if (ordem === 1) caixa.peixesFisico = pcqsNum(par.valor);
          else caixa.peixesEtiqueta = pcqsNum(par.valor);
          break;
        default: break;
      }
    });

    // texto solto depois de "OBSERVAÇÕES:" é a observação escrita na folha
    if (emObs && !pares.length && solto) observacoes.push(solto);
  });

  if (loja) cab.loja = cab.loja || loja;
  // caixa em branco: a planilha traz oito blocos e sobram os não usados
  const usadas = caixas.filter((c) => c.lote || c.pesoFisico || c.pesoLiquido ||
                                      c.peixesFisico || c.peixesEtiqueta);
  usadas.forEach((c, i) => { c.n = i + 1; });
  return { cab, caixas: usadas, observacoes };
}

// Lê o documento inteiro. É um PCQS por recebimento, mas o arquivo costuma vir
// com duas ou três páginas (quatro caixas por página) — e nada impede que
// alguém salve dois recebimentos no mesmo arquivo. Agrupa por NF + fornecedor.
function lerPcqsPaginas(paginas) {
  const conferencias = [];
  (paginas || []).forEach((pagina) => {
    const linhas = pagina.linhas || pagina.lines || [];
    const texto = linhas.map(pcqsTextoDaLinha).join(" ");
    if (pcqsEhPaginaDeRelatorio(texto)) return;
    if (!/pcqs|controle de qualidade|do lote/.test(pcqsChave(texto))) return;

    const { cab, caixas, observacoes } = lerPcqsPagina(pagina);
    if (!caixas.length && !cab.nf) return;
    const id = pcqsChave((cab.nf || "") + "|" + (cab.fornecedor || ""));
    let alvo = conferencias.find((c) => c.id === id);
    if (!alvo) { alvo = { id, cab: {}, caixas: [], observacoes: [] }; conferencias.push(alvo); }
    // o cabeçalho se repete em toda página: fica o primeiro valor preenchido
    Object.keys(cab).forEach((k) => { if (!alvo.cab[k] && cab[k]) alvo.cab[k] = cab[k]; });
    caixas.forEach((c) => { alvo.caixas.push(c); c.n = alvo.caixas.length; });
    observacoes.forEach((o) => { if (!alvo.observacoes.includes(o)) alvo.observacoes.push(o); });
  });
  return conferencias;
}

// ---------------------------------------------------------------- análise
// Faixa de peso por peixe que a libragem promete. "12/14" = de 12 a 14 libras
// por peixe; fora dessa faixa, o peixe entregue não é o peixe comprado, mesmo
// que o peso total feche.
function pcqsFaixaDaLibragem(libragem) {
  const m = String(libragem || "").match(/(\d{1,2})\s*[/xX-]\s*(\d{1,2})/);
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[2]);
  if (!a || !b || b < a) return null;
  return { lbMin: a, lbMax: b, min: a * PCQS_LB_KG, max: b * PCQS_LB_KG,
           rotulo: String(a).padStart(2, "0") + "/" + String(b).padStart(2, "0") };
}

// Características sensoriais. A lista do PCQS é fechada, mas quem preenche
// pode digitar; o que não está em nenhuma das duas listas vira ressalva para
// alguém olhar — nunca aprovação silenciosa.
const PCQS_SENSORIAL_BOM = ["otimo", "bom", "regular", "normal", "adequado",
  "caracteristico", "proprio", "firme", "conforme"];
const PCQS_SENSORIAL_RUIM = ["ruim", "pessimo", "irregular", "alterado", "improprio",
  "forte", "amolecida", "amolecido", "mole", "desfiando", "escuro", "opaco", "nao conforme"];
const PCQS_GELO_BOM = ["congelado", "parcialmente congelado", "gelo suficiente",
  "adequado", "suficiente"];
const PCQS_GELO_RUIM = ["descongelado", "sem gelo", "ausente", "insuficiente",
  "derretido", "pouco gelo"];

function pcqsClassifica(valor, bons, ruins) {
  const k = pcqsChave(valor);
  if (!k) return "vazio";
  if (bons.includes(k)) return "bom";
  if (ruins.includes(k)) return "ruim";
  if (ruins.some((r) => k.includes(r))) return "ruim";
  if (bons.some((b) => k.includes(b))) return "bom";
  return "duvida";
}

// Valor mais repetido de uma coluna das caixas (a libragem que as caixas
// realmente trouxeram, quando elas não concordam entre si).
function pcqsMaisComum(valores) {
  const conta = {};
  (valores || []).filter(Boolean).forEach((v) => { conta[v] = (conta[v] || 0) + 1; });
  let melhor = "", n = 0;
  Object.keys(conta).forEach((v) => { if (conta[v] > n) { n = conta[v]; melhor = v; } });
  return melhor;
}

// Análise completa: números conferidos, comparativo, não conformidades,
// veredito e acerto financeiro. `conferencia.cab` já chega com os ajustes da
// tela aplicados — quem assina o relatório confere custo, pesos e nomes antes.
function analisarPcqs(conferencia, ajustes) {
  const aj = Object.assign({}, PCQS_AJUSTES_PADRAO, ajustes || {});
  const cab = Object.assign({}, conferencia.cab || {});
  const caixas = (conferencia.caixas || []).map((c) => Object.assign({}, c));

  const custo = pcqsNum(cab.custoUnitario);
  const pesoNF = pcqsNum(cab.pesoNF);
  const caixasNF = pcqsNum(cab.caixasNF);
  const faixaContratada = pcqsFaixaDaLibragem(cab.libragem);
  const dtEntrega = pcqsData(cab.entrega);
  const dtValidadeNF = pcqsData(cab.validade);

  // ---- cálculo por caixa
  caixas.forEach((c) => {
    c.peixes = c.peixesFisico || c.peixesEtiqueta;
    c.pesoMedio = c.peixes ? c.pesoFisico / c.peixes : 0;
    c.difEtiqueta = (c.pesoFisico && c.pesoLiquido) ? c.pesoFisico - c.pesoLiquido : 0;
    c.tolCaixa = Math.max(aj.tolPesoKg, (c.pesoLiquido || 0) * aj.tolPesoPerc / 100);
    c.pesoDivergente = c.pesoLiquido > 0 && c.pesoFisico > 0 &&
                       Math.abs(c.difEtiqueta) > c.tolCaixa;
    c.faixa = pcqsFaixaDaLibragem(c.libragemConf || c.libragemEtiqueta) || faixaContratada;
    c.foraDaFaixa = !!(c.faixa && c.pesoMedio > 0 &&
                       (c.pesoMedio < c.faixa.min || c.pesoMedio > c.faixa.max));
    c.libragemDivergente = !!(faixaContratada && c.faixa &&
                              c.faixa.rotulo !== faixaContratada.rotulo);
    c.peixesDivergente = !!(c.peixesEtiqueta && c.peixesFisico &&
                            c.peixesEtiqueta !== c.peixesFisico);
    c.odorTipo = pcqsClassifica(c.odor, PCQS_SENSORIAL_BOM, PCQS_SENSORIAL_RUIM);
    c.visualTipo = pcqsClassifica(c.visual, PCQS_SENSORIAL_BOM, PCQS_SENSORIAL_RUIM);
    c.fibraTipo = pcqsClassifica(c.fibra, PCQS_SENSORIAL_BOM, PCQS_SENSORIAL_RUIM);
    c.geloTipo = pcqsClassifica(c.gelo, PCQS_GELO_BOM, PCQS_GELO_RUIM);
    c.sensorialRuim = [c.odorTipo, c.visualTipo, c.fibraTipo, c.geloTipo].includes("ruim");
    c.sensorialDuvida = [c.odorTipo, c.visualTipo, c.fibraTipo, c.geloTipo].includes("duvida");
    c.reprovada = /reprovad/.test(pcqsChave(c.status + " " + c.veredito));
    const dtVal = pcqsData(c.validade);
    c.diasValidade = pcqsDias(dtEntrega, dtVal);
    c.validadeCurta = c.diasValidade !== null && c.diasValidade < aj.validadeMinDias;
    c.validadeDiferente = !!(dtVal && dtValidadeNF && pcqsDataBR(dtVal) !== pcqsDataBR(dtValidadeNF));
    // Etiqueta com validade MENOR que a da nota é o caso que interessa: a loja
    // pagou por um prazo que não recebeu. Etiqueta com prazo maior aparece na
    // tabela por transparência, mas não é não conformidade.
    c.validadeMenor = !!(dtVal && dtValidadeNF && dtVal.getTime() < dtValidadeNF.getTime());
    c.ok = !(c.pesoDivergente || c.foraDaFaixa || c.libragemDivergente || c.peixesDivergente ||
             c.sensorialRuim || c.sensorialDuvida || c.reprovada || c.validadeCurta ||
             c.validadeMenor);
  });

  // ---- totais
  const soma = (f) => caixas.reduce((s, c) => s + (f(c) || 0), 0);
  const pesoRecebido = soma((c) => c.pesoFisico);
  const pesoEtiquetas = soma((c) => c.pesoLiquido);
  const peixesFisico = soma((c) => c.peixesFisico);
  const peixesEtiqueta = soma((c) => c.peixesEtiqueta);
  const peixes = peixesFisico || peixesEtiqueta;
  const difPeso = pesoNF ? pesoRecebido - pesoNF : 0;
  const tolTotal = pesoNF * aj.tolPesoPerc / 100;
  // O quilo que a loja pagou de verdade: o valor da nota dividido pelo peso
  // que entrou. É este número, e não o da nota, que vai para o custo do prato.
  const custoReal = (pesoRecebido > 0 && custo > 0) ? custo * pesoNF / pesoRecebido : custo;
  const libragemRecebida = pcqsMaisComum(caixas.map((c) => (c.faixa || {}).rotulo));

  const tot = {
    caixas: caixas.length, caixasNF, pesoNF, pesoRecebido, pesoEtiquetas,
    peixes, peixesFisico, peixesEtiqueta,
    difPeso, difPesoPerc: pesoNF ? difPeso / pesoNF * 100 : 0, tolTotal,
    difEtiquetas: (pesoEtiquetas && pesoNF) ? pesoEtiquetas - pesoNF : 0,
    pesoMedioNF: (peixesEtiqueta && pesoNF) ? pesoNF / peixesEtiqueta : 0,
    pesoMedioRecebido: peixesFisico ? pesoRecebido / peixesFisico : 0,
    custo, custoReal, custoDif: custoReal - custo,
    libragemContratada: (faixaContratada || {}).rotulo || pcqsLimpa(cab.libragem),
    libragemRecebida, faixaContratada,
    valorNF: pesoNF * custo, valorRecebido: pesoRecebido * custo,
    acerto: Math.abs(difPeso) * custo,
  };

  // ---- comparativo: o que a nota diz x o que a loja conferiu
  const linha = (indicador, nf, rec, tipo, ok, nota) => ({
    indicador, nf, rec, tipo,
    dif: (tipo === "texto") ? null : (Number(rec) || 0) - (Number(nf) || 0),
    ok: !!ok, nota: nota || "",
  });
  const comparativo = [
    linha("Peso total (Kg)", pesoNF, pesoRecebido, "kg",
          Math.abs(difPeso) <= tolTotal || !pesoNF),
    linha("Peso somado das etiquetas (Kg)", pesoNF, pesoEtiquetas, "kg",
          Math.abs(tot.difEtiquetas) <= tolTotal || !pesoEtiquetas),
    linha("Quantidade de peixes", peixesEtiqueta, peixesFisico, "pcs",
          peixesEtiqueta === peixesFisico || !peixesEtiqueta),
    linha("Peso médio por peixe (Kg)", tot.pesoMedioNF, tot.pesoMedioRecebido, "kg",
          !faixaContratada || !tot.pesoMedioRecebido ||
          (tot.pesoMedioRecebido >= faixaContratada.min &&
           tot.pesoMedioRecebido <= faixaContratada.max),
          faixaContratada ? "faixa da libragem " + faixaContratada.rotulo + ": " +
            pcqsFmt(faixaContratada.min, 3) + " a " + pcqsFmt(faixaContratada.max, 3) + " Kg" : ""),
    linha("Total de caixas", caixasNF, caixas.length, "qtd",
          !caixasNF || caixasNF === caixas.length),
    // Vale a caixa, não a moda: com duas caixas certas e uma errada, a moda
    // fecharia "OK" no comparativo enquanto a não conformidade aponta a caixa
    // trocada — duas respostas diferentes no mesmo documento.
    linha("Libragem (classificação)", tot.libragemContratada || "—",
          libragemRecebida || "—", "texto",
          !tot.libragemContratada || !libragemRecebida ||
          !caixas.some((c) => c.libragemDivergente)),
    linha("Custo unitário (R$/Kg)", custo, custoReal, "rs",
          Math.abs(tot.custoDif) < 0.005 || !custo,
          "custo real = custo da NF x peso faturado / peso recebido"),
  ];

  // ---- não conformidades
  const ncs = [];
  const nc = (gravidade, titulo, detalhe, cs) => ncs.push({
    gravidade, titulo, detalhe, caixas: (cs || []).map((c) => c.n) });

  if (pesoNF && Math.abs(difPeso) > tolTotal) {
    const menos = difPeso < 0;
    nc(menos ? "alta" : "media",
       menos ? "Peso recebido abaixo do faturado" : "Peso recebido acima do faturado",
       "A nota fiscal traz " + pcqsKg(pesoNF) + " e a conferência mediu " +
       pcqsKg(pesoRecebido) + " — diferença de " + pcqsSinalKg(difPeso) + " (" +
       pcqsFmt(tot.difPesoPerc, 2) + "%), acima da tolerância de " +
       pcqsFmt(aj.tolPesoPerc, 2) + "% (" + pcqsKg(tolTotal) + ").");
  }
  const cxPeso = caixas.filter((c) => c.pesoDivergente);
  if (cxPeso.length) {
    const somaDif = cxPeso.reduce((s, c) => s + c.difEtiqueta, 0);
    nc("media", "Peso físico diferente do peso da etiqueta",
       cxPeso.length + (cxPeso.length > 1 ? " caixas pesaram " : " caixa pesou ") +
       "fora da tolerância do que a etiqueta declara (" + pcqsSinalKg(somaDif) +
       " no conjunto). A etiqueta é do fornecedor; a pesagem é da loja.", cxPeso);
  }
  const cxLib = caixas.filter((c) => c.libragemDivergente);
  if (cxLib.length) {
    nc("alta", "Libragem diferente da contratada",
       "Foi comprada libragem " + tot.libragemContratada + " e a caixa trouxe " +
       pcqsMaisComum(cxLib.map((c) => (c.faixa || {}).rotulo)) + ".", cxLib);
  }
  const cxFaixa = caixas.filter((c) => c.foraDaFaixa && !c.libragemDivergente);
  if (cxFaixa.length) {
    const f = cxFaixa[0].faixa || {};
    nc("media", "Peso médio do peixe fora da faixa da libragem",
       "Na libragem " + (f.rotulo || tot.libragemContratada) + " cada peixe deve pesar de " +
       pcqsFmt(f.min, 3) + " a " + pcqsFmt(f.max, 3) + " Kg.", cxFaixa);
  }
  const cxPeixes = caixas.filter((c) => c.peixesDivergente);
  if (cxPeixes.length) {
    nc("alta", "Quantidade de peixes diferente da etiqueta",
       "A contagem na abertura da caixa não fechou com o que a etiqueta declara.", cxPeixes);
  }
  const cxSens = caixas.filter((c) => c.sensorialRuim);
  if (cxSens.length) {
    const quais = ["odor", "visual", "fibra", "gelo"]
      .filter((k) => cxSens.some((c) => c[k + "Tipo"] === "ruim"));
    nc("alta", "Avaliação sensorial fora do padrão",
       "Reprovação em " + quais.join(", ") + ". Produto com alteração sensorial não entra " +
       "em produção: o tratamento é devolução, não desconto.", cxSens);
  }
  const cxDuvida = caixas.filter((c) => c.sensorialDuvida && !c.sensorialRuim);
  if (cxDuvida.length) {
    nc("media", "Característica sensorial fora da lista padrão",
       "A planilha registrou característica que não está na lista de opções — confirmar " +
       "com a gerência da loja antes do acerto.", cxDuvida);
  }
  const cxRepro = caixas.filter((c) => c.reprovada);
  if (cxRepro.length) {
    const motivos = cxRepro.map((c) => c.motivo).filter(Boolean);
    nc("alta", "Caixa reprovada na análise de conformidade",
       "A própria planilha marcou reprovação" +
       (motivos.length ? ": " + motivos.join("; ") + "." : "."), cxRepro);
  }
  const cxVal = caixas.filter((c) => c.validadeCurta);
  if (cxVal.length) {
    nc("alta", "Validade curta no recebimento",
       "Chegou com menos de " + aj.validadeMinDias + " dias de validade, mínimo aceito " +
       "para o produto entrar na loja.", cxVal);
  }
  const cxValDif = caixas.filter((c) => c.validadeMenor && !c.validadeCurta);
  if (cxValDif.length) {
    nc("media", "Validade da etiqueta menor que a informada na NF",
       "A NF informa validade " + pcqsLimpa(cab.validade) +
       " e a etiqueta da caixa traz data anterior a essa.", cxValDif);
  }
  if (caixasNF && caixas.length !== caixasNF) {
    nc("alta", "Quantidade de caixas diferente da NF",
       "A NF declara " + pcqsFmt(caixasNF, 0) + " caixas e a conferência registrou " +
       pcqsFmt(caixas.length, 0) + ".");
  }

  // ---- veredito
  // Peso e libragem se resolvem no acerto financeiro; sensorial, validade e
  // reprovação na planilha, não — produto alterado não vira desconto, vira
  // devolução. Por isso o veredito olha primeiro o que não tem preço.
  const graves = ncs.filter((n) => n.gravidade === "alta" &&
    /sensorial|reprovada|validade curta/i.test(n.titulo));
  const altas = ncs.filter((n) => n.gravidade === "alta");
  let veredito;
  if (graves.length) {
    veredito = { tipo: "reprovado", rotulo: "REPROVADO",
                 resumo: "Recebimento reprovado: " + graves[0].titulo.toLowerCase() + "." };
  } else if (ncs.length) {
    veredito = { tipo: "ressalva", rotulo: "APROVADO COM RESSALVAS",
                 resumo: ncs.length + (ncs.length > 1 ? " não conformidades registradas"
                   : " não conformidade registrada") +
                   (altas.length ? " — " + altas.length + " de tratativa imediata." : ".") };
  } else {
    veredito = { tipo: "aprovado", rotulo: "APROVADO",
                 resumo: "Recebimento conforme: peso, libragem e avaliação sensorial " +
                         "dentro do contratado." };
  }

  // ---- acerto financeiro
  const quem = pcqsLimpa(cab.fornecedor) || "o fornecedor";
  const financeiro = {
    valor: tot.acerto,
    direcao: difPeso < 0 ? "fornecedor" : (difPeso > 0 ? "loja" : "nenhum"),
    rotulo: difPeso < 0 ? "FORNECEDOR CREDITA À LOJA"
          : (difPeso > 0 ? "LOJA DEVE COMPLEMENTAR" : "SEM ACERTO A FAZER"),
    custoReal, frase: "",
  };
  if (difPeso < 0) {
    financeiro.frase = "A loja recebeu " + pcqsKg(Math.abs(difPeso)) + " abaixo do peso " +
      "faturado. Ao custo de " + pcqsRs(custo) + "/Kg, " + quem + " deve creditar " +
      pcqsRs(tot.acerto) + " à loja. O quilo efetivamente pago sobe de " + pcqsRs(custo) +
      " para " + pcqsRs(custoReal) + ".";
  } else if (difPeso > 0) {
    financeiro.frase = "A loja recebeu " + pcqsKg(difPeso) + " acima do peso faturado. Ao " +
      "custo de " + pcqsRs(custo) + "/Kg, há " + pcqsRs(tot.acerto) + " a complementar em " +
      "favor de " + quem + ".";
  } else {
    financeiro.frase = "Peso faturado e peso recebido fecham dentro da tolerância: não há " +
      "valor a acertar.";
  }

  return { cab, caixas, tot, comparativo, ncs, veredito, financeiro, ajustes: aj,
           observacoes: conferencia.observacoes || [] };
}

// Para os testes fora do navegador
if (typeof module !== "undefined" && module.exports) {
  module.exports = { pcqsLinhasDaPlanilha, pcqsLinhasDeItens, pcqsParesDaLinha, lerPcqsPagina, lerPcqsPaginas,
                     analisarPcqs, pcqsFaixaDaLibragem, pcqsNum, pcqsFmt, pcqsKg, pcqsRs,
                     pcqsPcs, pcqsSinalKg, pcqsSinalRs, pcqsSinalPcs, pcqsData, pcqsDataBR,
                     pcqsChave, pcqsLimpa, pcqsMaisComum, pcqsNomeProprio,
                     pcqsGerentesDaLoja, PCQS_AJUSTES_PADRAO };
}
