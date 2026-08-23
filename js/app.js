// ============================================================================
// CDE Web - tela de lancamento diario
// Estoque inicial vem encadeado do dia anterior (o servidor calcula).
// Uso diario = inicial + chegada - transferencia - final (mesma conta da planilha).
// Desperdicio/perda e registrado a parte e NAO entra no uso.
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

  const cartao = document.createElement("section");
  cartao.className = "cartao cartao-lancamento";
  cartao.innerHTML =
    '<div class="cabeca">' +
      "<h2>" + casa.nome + "</h2>" +
      '<div class="fat"><span>Faturamento (Bruto) do Dia (R$)</span>' +
      '<input id="faturamento" type="text" inputmode="decimal" value="' +
        (casa.faturamento ? fmt(casa.faturamento) : "") + '"></div>' +
    "</div>" +
    '<p class="fonte">' + (casa.faturamento_da_planilha
      ? "Faturamento bruto lido da planilha Faturamento - 2026. Se editar aqui, o valor digitado prevalece."
      : "Sem faturamento bruto na planilha para esta data — digite manualmente.") + "</p>";

  const tab = document.createElement("table");
  tab.className = "tabela-lancamento";
  // A ordem das colunas segue a vida do estoque no dia: o que tinha, o que
  // entrou, o que saiu para outra casa, o que se perdeu e o que sobrou na
  // contagem. Assim a linha e lida da esquerda para a direita na mesma ordem
  // em que os numeros acontecem no balcao.
  tab.innerHTML = "<thead><tr>" +
    "<th>Insumo</th><th>Inicial</th>" +
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
      tr.innerHTML = '<td colspan="8">' + grupo + "</td>";
      corpo.appendChild(tr);
    }
    const tr = document.createElement("tr");
    tr.dataset.chave = ins.chave;
    // linha derivada (salmao equivalente): so leitura, ela vem das faixas acima
    if (ins.derivado) {
      tr.classList.add("derivada");
      tr.innerHTML =
        "<td>" + ins.nome + ' <span class="un">(' + ins.un + ")</span></td>" +
        '<td class="calc">' + fmt(ins.inicial, 3) + "</td>" +
        '<td colspan="4" class="fonte">Soma das faixas convertidas — calculado</td>' +
        '<td class="calc uso"></td><td class="calc coef"></td>';
      corpo.appendChild(tr);
      return;
    }
    // Veio da planilha: fica travado. Só outra sincronização muda esses
    // valores — assim o CDE e a planilha não divergem sem ninguém notar.
    const trava = ins.travado
      ? ' readonly title="Valor vindo da planilha. Para alterar, clique em Sincronizar planilhas."'
      : "";
    if (ins.travado) tr.classList.add("travada");
    const campo = (nome, valor) =>
      '<td><input data-campo="' + nome + '" type="text" inputmode="decimal" value="' +
      (valor ?? "") + '"' + trava + "></td>";
    tr.innerHTML =
      "<td>" + ins.nome + ' <span class="un">(' + ins.un + ")</span>" +
        (ins.travado ? ' <span class="selo-mini" title="Sincronizado da planilha">planilha</span>' : "") + "</td>" +
      '<td class="calc">' + fmt(ins.inicial, 3) + "</td>" +
      campo("entrada", ins.entrada) + campo("transferencia", ins.transferencia) +
      campo("desperdicio", ins.desperdicio) + campo("final", ins.final) +
      '<td class="calc uso"></td><td class="calc coef"></td>';
    corpo.appendChild(tr);
  });

  tab.appendChild(corpo);
  const rol = document.createElement("div");
  rol.className = "rolagem";
  rol.appendChild(tab);
  cartao.appendChild(rol);
  alvo.innerHTML = "";
  alvo.appendChild(cartao);

  alvo.addEventListener("input", aoDigitar);
  recalcular();
}

// ------------------------------------------------------------------ calculo
function recalcular() {
  const casa = DIA.casas[CASA];
  const fat = num($("#faturamento").value);
  document.querySelectorAll("tbody tr[data-chave]").forEach((tr) => {
    const ins = casa.insumos.find((i) => i.chave === tr.dataset.chave);
    if (ins.derivado) {
      let eq = 0, tem = false;
      for (const [banda, fator] of Object.entries(FATOR_LIBRA)) {
        const linha = document.querySelector('tr[data-chave="' + banda + '"]');
        if (!linha) continue;
        const f = linha.querySelector('[data-campo="final"]');
        if (!f || f.value === "") continue;
        const b = casa.insumos.find((x) => x.chave === banda);
        const u = num(b.inicial) + num(linha.querySelector('[data-campo="entrada"]').value)
                - num(linha.querySelector('[data-campo="transferencia"]').value) - num(f.value);
        eq += u * fator; tem = true;
      }
      tr.querySelector(".uso").textContent = tem ? fmt(eq, 3) : "—";
      tr.querySelector(".coef").textContent = tem && fat > 0 ? fmt((eq / fat) * 1000, 3) : "—";
      return;
    }
    const val = (c) => tr.querySelector('[data-campo="' + c + '"]').value;
    const temFinal = val("final") !== "";
    const uso = num(ins.inicial) + num(val("entrada")) - num(val("transferencia")) - num(val("final"));
    const tdUso = tr.querySelector(".uso");
    const tdCoef = tr.querySelector(".coef");
    if (!temFinal) { tdUso.textContent = "—"; tdCoef.textContent = "—"; tdUso.className = "calc uso"; return; }
    tdUso.className = "calc uso" + (uso < 0 ? " neg" : "");
    tdUso.innerHTML = fmt(uso, 3) + (uso < 0
      ? '<span class="msg-neg">contagem maior que o disponível</span>' : "");
    tdCoef.textContent = fat > 0 ? fmt((uso / fat) * 1000, 3) : "—";
  });
}

function aoDigitar(e) {
  if (!e.target.matches("input")) return;
  sujo = true;
  estado("Não salvo", "erro");
  recalcular();
}

// ------------------------------------------------------------------ salvar
async function salvar() {
  const casa = DIA.casas[CASA];
  casa.faturamento = num($("#faturamento").value);
  document.querySelectorAll("tbody tr[data-chave]").forEach((tr) => {
    const ins = casa.insumos.find((i) => i.chave === tr.dataset.chave);
    if (ins.derivado) return;
    ["final", "entrada", "transferencia", "desperdicio"].forEach((c) => {
      const v = tr.querySelector('[data-campo="' + c + '"]').value.trim();
      ins[c] = v === "" ? null : num(v);
    });
  });

  const corpo = { data: DIA.data, casas: {} };
  Object.entries(DIA.casas).forEach(([ck, c]) => {
    const insumos = {};
    c.insumos.forEach((i) => {
      insumos[i.chave] = { final: i.final, entrada: i.entrada,
                          transferencia: i.transferencia, desperdicio: i.desperdicio };
    });
    corpo.casas[ck] = { faturamento: c.faturamento, insumos: insumos };
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
    aviso("Dia " + DIA.data.split("-").reverse().join("/") + " salvo.", "bom");
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
async function sincronizar() {
  if (sujo && !confirm("Há alterações não salvas. Sincronizar vai recarregar o dia. Continuar?")) return;
  const btn = $("#btn-sinc");
  btn.disabled = true;
  const rotulo = btn.textContent;
  btn.textContent = "Lendo as planilhas…";
  estado("Sincronizando…");
  try {
    const r = await fetch("/api/sincronizar");
    const d = await r.json();
    if (!d.ok) throw new Error(d.erro || "falha no servidor");
    if (d.nenhuma_aberta) {
      estado("Nada a sincronizar");
      aviso("Nenhuma planilha aberta no Excel. Abra a do mês que quer sincronizar e clique de novo.", "");
      return;
    }
    const n = d.dias_novos.length, a = d.dias_alterados.length;
    const lidas = (d.planilhas || []).join(", ");
    aviso(n || a
      ? `${n} dia(s) novo(s) e ${a} atualizado(s) — de ${lidas}.`
      : `Nada novo em ${lidas} — já estava tudo aqui.`, "bom");
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
  $("#data").value = hoje();
  $("#data").onchange = (e) => carregarDia(e.target.value);
  $("#dia-anterior").onclick = () => mudarDia(-1);
  $("#dia-seguinte").onclick = () => mudarDia(1);
  $("#dia-hoje").onclick = () => { $("#data").value = hoje(); carregarDia(hoje()); };
  $("#btn-salvar").onclick = salvar;
  $("#btn-sinc").onclick = sincronizar;
  window.addEventListener("beforeunload", (e) => { if (sujo) e.preventDefault(); });
  carregarDia(hoje());
})();
