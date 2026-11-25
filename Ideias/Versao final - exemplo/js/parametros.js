// ============================================================================
// Configurações — parâmetros, a senha de quem está logado e os usuários.
//
// Parâmetros é o que o sistema não tem como deduzir do lançamento.
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

// Dica da coluna Calculado: a regra vem do servidor, então acompanha a janela
// e os dias de segurança em vez de mentir um "14 × 7" fixo.
function rotuloRegra() {
  const r = (DADOS && DADOS.regra) || {};
  return `Média diária dos últimos ${r.janela || 14} dias × prazo de entrega do insumo.`
    + ` Sem prazo cadastrado: ${r.dias_uso ?? 7} dia(s) de segurança.`;
}

function textoPrazo(l) {
  if (l.origem === "sem_fornecedor") return "sem fornecedor";
  if (l.cobertura == null) return "—";
  return fmt(l.cobertura, 0) + " d" + (l.origem === "seguranca" ? " (segurança)" : "");
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
  const linhas = linhasVisiveis();

  if (!linhas.length) {
    $("#tabela-estoque").innerHTML = '<p class="vazio">Nenhum insumo com esses filtros.</p>';
    return;
  }
  let grupo = null;
  const corpo = linhas.map((l) => {
    const cab = l.grupo !== grupo
      ? `<tr class="linha-grupo"><td colspan="8">${esc(l.grupo)}</td></tr>` : "";
    grupo = l.grupo;
    const mi = valorAtual(l, "minimo");
    const ma = valorAtual(l, "maximo");
    return cab + `<tr data-k="${esc(chaveDe(l))}">
      <td>${esc(l.insumo)} <span class="un">(${esc(l.un)})</span></td>
      <td class="fonte">${esc(l.casa_nome)}</td>
      <td class="calc fonte">${fmt(l.media_dia, 3)}</td>
      <td class="calc fonte">${l.dias == null ? "—" : l.dias}</td>
      <td class="calc fonte">${textoPrazo(l)}</td>
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
      <th>Prazo</th><th>Calculado</th><th>Mínimo</th><th>Máximo</th>
    </tr></thead><tbody>${corpo}</tbody></table>`;
}

// ------------------------------------------------------- prazo de entrega
// Uma linha por insumo comprado. O padrão vale para as quatro casas; a
// coluna da casa só se preenche quando ela recebe em outro prazo (o camarão
// chega em 1 dia na cidade e em 2 na Cidade Nova). Padrão em branco = sem
// fornecedor disponível: o insumo fica sem mínimo.
const CASAS_PRAZO = ["SL", "DC", "DLU", "DLCN"];

function desenharPrazos() {
  const lista = DADOS.prazos || [];
  if (!lista.length) {
    $("#tabela-prazos").innerHTML = '<p class="vazio">Nenhum prazo cadastrado.</p>';
    return;
  }
  const cel = (v) => v == null || v === "" ? "" : fmt(num(v), 0);
  $("#tabela-prazos").innerHTML = `<table class="tabela-param">
    <thead><tr><th>Insumo</th><th>Prazo padrão (dias)</th>${
      CASAS_PRAZO.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
    <tbody>${lista.map((p, i) => `<tr data-i="${i}">
      <td>${esc(p.insumo)}${p.padrao == null || p.padrao === ""
        ? ' <span class="selo-mini">sem fornecedor</span>' : ""}</td>
      <td><input type="text" inputmode="numeric" data-prazo="padrao" value="${cel(p.padrao)}"
           placeholder="sem fornecedor"></td>
      ${CASAS_PRAZO.map((c) => `<td><input type="text" inputmode="numeric" data-prazo="${c}"
           value="${cel((p.casas || {})[c])}" placeholder="padrão"></td>`).join("")}
    </tr>`).join("")}</tbody></table>`;
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
// não vale um componente de busca — vale ver tudo de uma vez. Fornecedores é
// só leitura: sai do catálogo de compras (quem tem item da projeção vinculado).
function desenharLista(campo) {
  const nomes = DADOS.projecao[campo] || [];
  const alvo = $("#lista-" + campo);
  const fixa = campo === "fornecedores";
  alvo.innerHTML = nomes.length
    ? nomes.map((nome, i) => `<span class="ficha-nome">${esc(nome)}${fixa ? "" : `
        <button type="button" class="ficha-x" data-campo="${campo}" data-i="${i}"
                title="Remover ${esc(nome)}" aria-label="Remover ${esc(nome)}">×</button>`}</span>`).join("")
    : `<span class="vazio">${fixa ? "Nenhum fornecedor com item da projeção no catálogo."
                                  : "Nenhum cadastrado."}</span>`;
}

function desenhar() {
  const casas = [...new Map((DADOS.estoque || [])
    .map((l) => [l.casa, l.casa_nome])).entries()];
  if (!$("#f-casa").options.length) {
    $("#f-casa").innerHTML = '<option value="">Todas</option>' +
      casas.map(([c, nome]) => `<option value="${esc(c)}">${esc(nome)}</option>`).join("");
  }
  desenharEstoque();
  desenharPrazos();
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
      prazo_entrega: (DADOS.prazos || []).map((p) => ({
        chave: p.chave,
        padrao: p.padrao === "" || p.padrao == null ? null : num(p.padrao),
        casas: Object.fromEntries(Object.entries(p.casas || {})
          .filter(([, v]) => v !== "" && v != null).map(([c, v]) => [c, num(v)])),
      })),
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

  $("#tabela-prazos").addEventListener("input", (e) => {
    const inp = e.target.closest("input[data-prazo]");
    if (!inp) return;
    const p = DADOS.prazos[Number(inp.closest("tr").dataset.i)];
    const v = inp.value.trim();
    if (inp.dataset.prazo === "padrao") p.padrao = v;
    else (p.casas = p.casas || {})[inp.dataset.prazo] = v;
    marcarSujo();
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

  [["responsaveis", "#novo-responsavel", "#btn-add-responsavel"]].forEach(([campo, inp, btn]) => {
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

  // Toda parte nasce fechada: o clique no título abre e fecha.
  document.querySelectorAll(".cartao.dobravel").forEach((cart) => {
    const cabeca = cart.querySelector(".dobra");
    if (cabeca) cabeca.addEventListener("click", () => cart.classList.toggle("aberta"));
  });
  // "Novo usuário" mora no título da parte: abre a parte sem fechá-la de volta
  $("#novo").addEventListener("click", (e) => {
    e.stopPropagation();
    $("#sec-usuarios").classList.add("aberta");
  });
  $("#f-senha").addEventListener("submit", trocarSenha);
  $("#btn-reiniciar").addEventListener("click", reiniciar);

  iniciarConfiguracoes();
});

// Quem vê o quê: parâmetros seguem o nível "parametros" do usuário; a senha
// aparece para todo mundo logado; Usuários, só para administrador. Sem login
// ligado (nenhum usuário criado), ficam só os parâmetros, como antes.
async function iniciarConfiguracoes() {
  const eu = await window.CDE_EU;
  const nivel = eu && eu.login ? (eu.permissoes.parametros || "nenhum") : "editar";
  if (nivel === "nenhum") {
    document.querySelectorAll(".so-parametros").forEach((s) => s.remove());
    $("#btn-salvar").remove();
  } else {
    if (nivel === "ver") {
      $("#btn-salvar").disabled = true;
      $("#btn-salvar").title = "Você pode consultar os parâmetros, mas não alterar";
    }
    carregar();
  }
  if (eu && eu.login) $("#sec-senha").hidden = false;
  // Sem login ligado, o servidor so aceita o reinicio vindo do proprio PC dele
  if (!eu || !eu.login || eu.admin) {
    $("#sec-servidor").hidden = false;
    mostrarInicio();
  }
  if (eu && eu.login && eu.admin) {
    $("#sec-usuarios").hidden = false;
    const s = document.createElement("script");
    s.src = "js/usuarios.js";
    document.body.appendChild(s);
  }
  // #senha ou #usuarios no endereço: abre direto aquela parte
  const alvo = location.hash && document.querySelector(`.dobravel[data-secao="${location.hash.slice(1)}"]`);
  if (alvo && !alvo.hidden) {
    alvo.classList.add("aberta");
    alvo.scrollIntoView({ block: "start" });
  }
}

async function trocarSenha(e) {
  e.preventDefault();
  const erro = $("#s-erro");
  erro.textContent = "";
  erro.style.color = "";
  if ($("#s-nova").value !== $("#s-nova2").value) { erro.textContent = "As duas senhas não são iguais."; return; }
  const r = await fetch("/api/senha", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ atual: $("#s-atual").value, nova: $("#s-nova").value }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { erro.textContent = j.erro || "não foi possível trocar"; return; }
  e.target.reset();
  erro.style.color = "var(--bom)";
  erro.textContent = "Senha trocada. Os outros aparelhos vão pedir a senha nova.";
}

// ------------------------------------------------------------- servidor
// Reiniciar carrega o código novo sem ir ao PC do servidor. O primeiro clique
// pede confirmação no próprio botão (sem janela do navegador); depois a tela
// espera o servidor voltar e mostra a hora em que ele subiu.
const horaDe = (iso) => iso ? brDate(iso.slice(0, 10)) + " às " + iso.slice(11, 16) : "—";

async function mostrarInicio() {
  try {
    const r = await fetch("/api/servidor", { cache: "no-store" });
    if (r.ok) $("#srv-estado").textContent = "No ar desde " + horaDe((await r.json()).iniciado);
  } catch (e) { /* sem resposta: fica em branco */ }
}

let confirmaAte = 0;
async function reiniciar() {
  const btn = $("#btn-reiniciar");
  if (Date.now() > confirmaAte) {
    confirmaAte = Date.now() + 5000;
    btn.textContent = "Confirmar reinício";
    setTimeout(() => { if (Date.now() > confirmaAte) btn.textContent = "Reiniciar servidor"; }, 5100);
    return;
  }
  confirmaAte = 0;
  btn.disabled = true;
  btn.textContent = "Reiniciando…";
  $("#srv-estado").textContent = "O sistema volta em alguns segundos.";
  let antes = null;
  try {
    const r = await fetch("/api/reiniciar", { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || "não foi possível reiniciar");
    antes = j.iniciado;
  } catch (e) {
    $("#srv-estado").textContent = e.message;
    btn.disabled = false;
    btn.textContent = "Reiniciar servidor";
    return;
  }
  // espera ate 60 s um servidor com hora de inicio diferente da de antes
  for (let i = 0; i < 30; i++) {
    await new Promise((ok) => setTimeout(ok, 2000));
    try {
      const r = await fetch("/api/servidor", { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      if (j && j.iniciado !== antes) {
        $("#srv-estado").textContent = "Reiniciado. No ar desde " + horaDe(j.iniciado) + ".";
        btn.disabled = false;
        btn.textContent = "Reiniciar servidor";
        return;
      }
    } catch (e) { /* ainda subindo */ }
  }
  $("#srv-estado").textContent = "O servidor não voltou em 1 minuto. Confira o PC do servidor.";
  btn.disabled = false;
  btn.textContent = "Reiniciar servidor";
}
