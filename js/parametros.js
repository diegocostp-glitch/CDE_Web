// ============================================================================
// Parâmetros — o que o sistema não tem como deduzir do lançamento.
//
// Três coisas moram aqui: o mínimo e o máximo de estoque por insumo e casa, a
// janela de cálculo da Projeção de Compras e as listas de responsável e
// fornecedor. Tudo o mais que a tela poderia querer editar é CALCULADO de
// propósito — meta de coeficiente, custo unitário, rendimento de
// processamento — e a última seção da tela diz por quê.
//
// A tela é a fonte, não um diff: ao salvar, ela manda o conjunto inteiro e o
// servidor regrava. Campo em branco é informação — significa "sem mínimo
// definido", e devolve o cálculo pela média para a Visão Geral.
// ============================================================================
let DADOS = null;
let sujo = false;

// A regra vem do servidor: se a janela ou os dias de uso mudarem na seção de
// baixo, o texto acompanha em vez de mentir um "14 × 7" fixo.
function rotuloRegra() {
  const r = (DADOS && DADOS.regra) || {};
  return `Calculado pela regra da casa: média diária dos últimos ${r.janela || 14}`
    + ` dias × ${r.dias_uso || 7} dias de uso. É este número que vale quando o`
    + ` mínimo fica em branco.`;
}

function estado(txt, classe) {
  const el = $("#estado");
  el.textContent = txt || "";
  el.className = "estado" + (classe ? " " + classe : "");
}

function marcarSujo() {
  sujo = true;
  estado("Não salvo", "erro");
}

// --------------------------------------------------------------- carregar
async function carregar() {
  estado("Carregando…");
  const r = await fetch("/api/parametros", { cache: "no-store" });
  if (!r.ok) {
    estado("Falhou ao carregar", "erro");
    return;
  }
  DADOS = await r.json();
  desenhar();
  sujo = false;
  estado("");
}

// ------------------------------------------------------- estoque: tabela
// Guarda o que está digitado por (insumo, casa), e não por posição na tela: o
// filtro redesenha a tabela, e ler os inputs na hora de salvar perderia tudo
// que estivesse fora do filtro.
const editado = new Map();
const chaveDe = (l) => l.chave + "|" + l.casa;

function valorAtual(l, campo) {
  const e = editado.get(chaveDe(l));
  if (e && campo in e) return e[campo];
  return l[campo];
}

function guardar(l, campo, valor) {
  const k = chaveDe(l);
  const e = editado.get(k) || {};
  e[campo] = valor;
  editado.set(k, e);
  marcarSujo();
}

function linhasVisiveis() {
  const texto = busca($("#f-insumo").value);
  const casa = $("#f-casa").value;
  return (DADOS.estoque || []).filter((l) =>
    (!casa || l.casa === casa) && (!texto || busca(l.insumo).includes(texto)));
}

function desenharEstoque() {
  $("#nota-regra").textContent = rotuloRegra();
  const linhas = linhasVisiveis();
  const total = (DADOS.estoque || []).length;
  const comMinimo = (DADOS.estoque || []).filter((l) => valorAtual(l, "minimo") != null
    && valorAtual(l, "minimo") !== "").length;
  $("#nota-estoque").textContent = `${comMinimo} de ${total} com mínimo definido`;

  if (!linhas.length) {
    $("#tabela-estoque").innerHTML = '<p class="vazio">Nenhum insumo com esses filtros.</p>';
    return;
  }
  let grupo = null;
  const corpo = linhas.map((l) => {
    const cab = l.grupo !== grupo
      ? `<tr class="linha-grupo"><td colspan="7">${esc(l.grupo)}</td></tr>` : "";
    grupo = l.grupo;
    const mi = valorAtual(l, "minimo");
    const ma = valorAtual(l, "maximo");
    return cab + `<tr data-k="${esc(chaveDe(l))}">
      <td>${esc(l.insumo)} <span class="un">(${esc(l.un)})</span></td>
      <td class="fonte">${esc(l.casa_nome)}</td>
      <td class="calc fonte">${fmt(l.media_dia, 3)}</td>
      <td class="calc fonte">${l.dias == null ? "—" : l.dias}</td>
      <td class="calc sugestao" title="${esc(rotuloRegra())}">${
        l.sugestao == null ? "—" : fmt(l.sugestao, 1)}</td>
      <td><input type="text" inputmode="decimal" data-campo="minimo"
           value="${mi == null || mi === "" ? "" : fmt(num(mi), 3)}"
           placeholder="calculado"></td>
      <td><input type="text" inputmode="decimal" data-campo="maximo"
           value="${ma == null || ma === "" ? "" : fmt(num(ma), 3)}"
           placeholder="sem limite"></td>
    </tr>`;
  }).join("");

  $("#tabela-estoque").innerHTML = `<table class="tabela-param">
    <thead><tr>
      <th>Insumo</th><th>Casa</th><th>Média/dia</th><th>Dias</th>
      <th>Calculado</th><th>Mínimo</th><th>Máximo</th>
    </tr></thead><tbody>${corpo}</tbody></table>`;
}

function desenharProjecao() {
  const p = DADOS.projecao || {};
  $("#p-dias-cobrir").value = p.dias_a_cobrir_padrao ?? "";
  $("#p-janela").value = p.janela_media_dias ?? "";
  $("#p-seguranca").value = p.dias_seguranca ?? "";
  desenharLista("responsaveis");
  desenharLista("fornecedores");
}

// Ficha com o nome e um × para remover. Lista curta e digitada à mão, então
// não vale um componente de busca — vale ver tudo de uma vez.
function desenharLista(campo) {
  const nomes = DADOS.projecao[campo] || [];
  const alvo = $("#lista-" + campo);
  alvo.innerHTML = nomes.length
    ? nomes.map((nome, i) => `<span class="ficha-nome">${esc(nome)}
        <button type="button" class="ficha-x" data-campo="${campo}" data-i="${i}"
                title="Remover ${esc(nome)}" aria-label="Remover ${esc(nome)}">×</button></span>`).join("")
    : '<span class="vazio">Nenhum cadastrado.</span>';
}

function desenhar() {
  const casas = [...new Map((DADOS.estoque || [])
    .map((l) => [l.casa, l.casa_nome])).entries()];
  if (!$("#f-casa").options.length) {
    $("#f-casa").innerHTML = '<option value="">Todas</option>' +
      casas.map(([c, nome]) => `<option value="${esc(c)}">${esc(nome)}</option>`).join("");
  }
  desenharEstoque();
  desenharProjecao();
}

// ----------------------------------------------------------------- salvar
async function salvar() {
  // Manda o conjunto inteiro, com o que foi editado por cima do que veio.
  const estoque = (DADOS.estoque || []).map((l) => ({
    chave: l.chave, casa: l.casa,
    minimo: valorAtual(l, "minimo"), maximo: valorAtual(l, "maximo"),
  })).map((l) => ({
    ...l,
    minimo: l.minimo === "" || l.minimo == null ? null : num(l.minimo),
    maximo: l.maximo === "" || l.maximo == null ? null : num(l.maximo),
  }));

  const corpo = {
    estoque,
    projecao: {
      dias_a_cobrir_padrao: num($("#p-dias-cobrir").value),
      janela_media_dias: num($("#p-janela").value),
      dias_seguranca: num($("#p-seguranca").value),
      responsaveis: DADOS.projecao.responsaveis || [],
      fornecedores: DADOS.projecao.fornecedores || [],
    },
  };

  estado("Salvando…");
  const r = await fetch("/api/parametros", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const resp = await r.json().catch(() => null);
  if (!r.ok || !resp || resp.ok === false) {
    // O servidor recusa máximo abaixo do mínimo e dia fora da faixa: a
    // mensagem dele diz qual linha, então vale mostrá-la em vez de um genérico.
    estado((resp && resp.erro ? String(resp.erro).split("\n").pop() : "Falhou ao salvar")
           .slice(0, 120), "erro");
    return;
  }
  DADOS = resp;
  editado.clear();
  sujo = false;
  desenhar();
  estado("Salvo", "ok");
  setTimeout(() => { if (!sujo) estado(""); }, 2500);
}

// ------------------------------------------------------------------ eventos
document.addEventListener("DOMContentLoaded", () => {
  montarSidebar("parametros");

  $("#tabela-estoque").addEventListener("input", (e) => {
    const inp = e.target.closest("input[data-campo]");
    if (!inp) return;
    const k = inp.closest("tr").dataset.k;
    const l = (DADOS.estoque || []).find((x) => chaveDe(x) === k);
    if (l) guardar(l, inp.dataset.campo, inp.value.trim());
  });
  // Ao sair do campo, o número volta no formato da casa — três decimais, como
  // no lançamento. Vazio continua vazio: é "sem mínimo definido".
  $("#tabela-estoque").addEventListener("focusout", (e) => {
    const inp = e.target.closest("input[data-campo]");
    if (!inp || inp.value.trim() === "") return;
    inp.value = fmt(num(inp.value), 3);
  });

  ["#f-insumo", "#f-casa"].forEach((s) => {
    $(s).addEventListener("input", desenharEstoque);
  });

  $("#btn-sugerir").addEventListener("click", () => {
    // Só o que está à vista e ainda sem mínimo: o botão é atalho de
    // preenchimento, não um "restaurar tudo" que apaga ajuste feito à mão.
    let n = 0;
    linhasVisiveis().forEach((l) => {
      const atual = valorAtual(l, "minimo");
      if (l.sugestao != null && (atual == null || atual === "")) {
        guardar(l, "minimo", String(l.sugestao));
        n++;
      }
    });
    $("#nota-sugestao").textContent = n
      ? `${n} mínimo(s) preenchido(s) com a sugestão — confira antes de salvar`
      : "Nada a preencher: as linhas à vista já têm mínimo";
    desenharEstoque();
  });

  [["responsaveis", "#novo-responsavel", "#btn-add-responsavel"],
   ["fornecedores", "#novo-fornecedor", "#btn-add-fornecedor"]].forEach(([campo, inp, btn]) => {
    const add = () => {
      const nome = limpaNome($(inp).value);
      if (!nome) return;
      const lista = DADOS.projecao[campo] || (DADOS.projecao[campo] = []);
      if (lista.some((x) => chave(x) === chave(nome))) {
        estado(`${nome} já está na lista`, "erro");
        return;
      }
      lista.push(nome);
      $(inp).value = "";
      desenharLista(campo);
      marcarSujo();
    };
    $(btn).addEventListener("click", add);
    $(inp).addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } });
  });

  document.addEventListener("click", (e) => {
    const x = e.target.closest(".ficha-x");
    if (!x) return;
    const campo = x.dataset.campo;
    DADOS.projecao[campo].splice(Number(x.dataset.i), 1);
    desenharLista(campo);
    marcarSujo();
  });

  ["#p-dias-cobrir", "#p-janela", "#p-seguranca"].forEach((s) => {
    $(s).addEventListener("input", marcarSujo);
  });

  $("#btn-salvar").addEventListener("click", salvar);
  window.addEventListener("beforeunload", (e) => { if (sujo) e.preventDefault(); });

  document.querySelectorAll(".cartao.dobravel").forEach((cart) => {
    const cabeca = cart.querySelector(".dobra");
    if (cabeca) cabeca.addEventListener("click", () => cart.classList.toggle("aberta"));
  });

  carregar();
});
