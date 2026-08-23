// ============================================================================
// Cadastros — fornecedores, produtos com preço e unidades compradoras.
//
// Vem do Gerador de OCs, com uma diferença que importa: lá o cadastro morava no
// localStorage de cada navegador e era espelhado na planilha depois. Aqui a
// planilha é a fonte única e o servidor grava direto nela. Sem isso, o mesmo
// fornecedor teria uma versão por PC e a OC sairia com o CNPJ de quem cadastrou
// por último.
//
// É a MESMA planilha que o Gerador de OCs lê. Cadastro feito aqui aparece lá.
//
// Toda gravação reescreve as quatro abas inteiras — por isso a fila de
// gravação (agendarSalvar) em vez de um POST por tecla digitada.
// ============================================================================
let ABA = "fornecedores";
let DETALHE = null;            // linha expandida (chave do registro)
const FILTRO = { prod: "", prodForn: "", forn: "" };

// Conciliação com o pedido consolidado. O produto do catálogo é o que o
// fornecedor vende; o insumo do CDE é o que a operação conta todo dia. Quem
// cadastra o produto é quem sabe qual é qual — por isso o vínculo se declara
// aqui, e não em arquivo separado que alguém teria que lembrar de editar.
let VINCULOS = {};             // { insumo_chave: [nome do produto no catálogo] }
let INSUMOS_CDE = [];          // { chave, nome } dos itens do pedido consolidado

async function carregarVinculos() {
  try {
    const r = await (await fetch("/api/vinculos", { cache: "no-store" })).json();
    VINCULOS = r.vinculos || {};
    INSUMOS_CDE = r.insumos || [];
  } catch (e) { VINCULOS = {}; INSUMOS_CDE = []; }
}

const insumoDoProduto = (nome) => Object.keys(VINCULOS).find((ik) =>
  (VINCULOS[ik] || []).some((n) => chave(n) === chave(nome))) || "";

// Um produto pertence a um insumo só: antes de ligar no novo, tira dos outros.
// Sem isso, renomear o vínculo deixaria o produto contado duas vezes no pedido.
async function definirVinculo(produto, insumo) {
  Object.keys(VINCULOS).forEach((ik) => {
    VINCULOS[ik] = (VINCULOS[ik] || []).filter((n) => chave(n) !== chave(produto));
  });
  if (insumo) (VINCULOS[insumo] = VINCULOS[insumo] || []).push(produto);
  try {
    const r = await (await fetch("/api/vinculos", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vinculos: VINCULOS }) })).json();
    if (!r.ok) throw new Error(r.erro || "erro ao gravar o vínculo");
    // O servidor recusa nome que nao existe no catalogo — vinculo apontando
    // para produto inexistente viraria item fantasma na OC.
    if ((r.ignorados || []).length) {
      aviso("Fora do catálogo, não gravado: " + r.ignorados.join(", "), "");
    }
    VINCULOS = r.vinculos || VINCULOS;
  } catch (e) {
    aviso("Não consegui gravar o vínculo: " + e.message, "mau");
  }
}

function seletorVinculo(produto, classe) {
  const atual = insumoDoProduto(produto);
  return `<select class="${classe}${atual ? " tem" : ""}" data-prod="${esc(produto)}">
    <option value="">— Sem vínculo —</option>${INSUMOS_CDE.map((i) =>
      `<option value="${esc(i.chave)}"${i.chave === atual ? " selected" : ""}>${esc(i.nome)}</option>`).join("")}
  </select>`;
}

// ------------------------------------------------------------------ gravação
let _fila = null, _gravando = false;

// Debounce de 700ms: digitar um endereço dispara um evento por campo, e cada
// gravação reescreve a planilha inteira. Sem a fila, sairiam quinze reescritas
// para uma edição só.
function agendarSalvar() {
  estado("Alterado — salvando…");
  clearTimeout(_fila);
  _fila = setTimeout(gravarAgora, 700);
}

async function gravarAgora() {
  if (_gravando) { agendarSalvar(); return; }   // uma gravação de cada vez
  // quem chama direto (ao vincular produto, ao recarregar) esvazia a fila:
  // senão o timer pendente dispara uma segunda reescrita da planilha inteira.
  clearTimeout(_fila); _fila = null;
  _gravando = true;
  try {
    await salvarBase();
  } catch (e) {
    estado("Falha ao salvar", "erro");
    aviso("Não consegui gravar a planilha: " + e.message, "mau");
  } finally { _gravando = false; }
}

// Sair da página com gravação pendente perderia a edição em silêncio.
window.addEventListener("beforeunload", (e) => {
  if (_fila && !_gravando) { gravarAgora(); e.preventDefault(); e.returnValue = ""; }
});

// ------------------------------------------------------------------ início
async function iniciar() {
  estado("Carregando cadastro…");
  try {
    await Promise.all([carregarBase(true), carregarVinculos()]);
  } catch (e) {
    $("#tela").innerHTML = '<p class="vazio">Servidor fora do ar. Rode o Servidor.bat.</p>';
    return;
  }
  estado("");
  if (BASE.erro) {
    $("#tela").innerHTML = `<p class="vazio">Não consegui abrir a base: ${esc(BASE.erro)}</p>`;
    return;
  }
  $("#fonte-arquivo").textContent = BASE.compartilhada
    ? "gravando na base compartilhada com o Gerador de OCs"
    : "atenção: base local, não compartilhada com o Gerador de OCs";
  $$("#abas button").forEach((b) => {
    b.onclick = () => {
      ABA = b.dataset.t; DETALHE = null;
      $$("#abas button").forEach((x) => x.classList.toggle("ativa", x === b));
      desenhar();
    };
  });
  $("#btn-recarregar").onclick = async () => {
    if (_fila) await gravarAgora();
    await carregarBase(true); desenhar(); aviso("Cadastro recarregado do disco.", "bom");
  };
  $("#btn-exportar").onclick = exportarCopia;
  $("#arquivo-import").onchange = (e) => importarPlanilha(e.target);
  desenhar();
}

function desenhar() {
  if (ABA === "fornecedores") telaFornecedores();
  else if (ABA === "produtos") telaProdutos();
  else telaUnidades();
}

// ============================================================================
// FORNECEDORES
// ============================================================================
// A busca redesenhava a tela inteira a cada tecla. O <input> era destruido e
// recriado no meio da digitacao, entao o cursor sumia e so a primeira letra
// entrava. Agora a tela e montada uma vez e a digitacao repinta so o corpo da
// tabela — o campo de busca, e o foco dentro dele, continuam os mesmos.
// Procura o texto digitado em TODOS os campos da linha, palavra por palavra.
//
// Duas coisas que a busca anterior não fazia e que quem usa espera:
//   - achar o produto pelo nome do FORNECEDOR ("amasa" traz os camarões da
//     Amasa, mesmo que a palavra não apareça no nome do produto). Antes, "ama"
//     achava por acaso — a sílaba está dentro de "cAMArão" — e "amasa" não
//     achava nada, o que parecia busca quebrada;
//   - aceitar mais de uma palavra em qualquer ordem ("amasa 31/35", "camarao
//     amasa"): cada palavra é procurada por conta própria.
// Trecho e nome completo funcionam do mesmo jeito, porque a comparação é
// sempre "contém".
function combina(texto, ...campos) {
  const termos = busca(texto).split(/\s+/).filter(Boolean);
  if (!termos.length) return true;
  const alvo = campos.map((c) => busca(c)).join(" ");
  return termos.every((t) => alvo.includes(t));
}

function filtrarFornecedores() {
  return BASE.fornecedores.filter((f) =>
    combina(FILTRO.forn, f.chave, f.razao, f.contato, f.cnpj, f.cidade, f.email));
}

function repintarFornecedores() {
  const lista = filtrarFornecedores();
  const corpo = $("#corpo-forn");
  if (!corpo) { telaFornecedores(); return; }
  corpo.innerHTML = lista.length ? lista.map(linhaFornecedor).join("")
    : '<tr><td colspan="6" class="vazio">Nenhum fornecedor encontrado.</td></tr>';
  $("#conta-forn").textContent = `${lista.length} de ${BASE.fornecedores.length}`;
}

function telaFornecedores() {
  const lista = filtrarFornecedores();

  $("#tela").innerHTML = `
    <section class="cartao">
      <div class="cabeca"><h2>Novo fornecedor</h2>
        <span class="fonte">Apelido, CNPJ e razão social são obrigatórios — a OC não vale sem eles</span></div>
      <div class="barra barra-interna">
        <label class="campo"><span>Apelido *</span><input id="f-chave" placeholder="Ex: BELTUBO"></label>
        <label class="campo"><span>CNPJ *</span><input id="f-cnpj" inputmode="numeric" maxlength="18" placeholder="00.000.000/0000-00"></label>
        <label class="campo campo-largo"><span>Razão social *</span><input id="f-razao"></label>
        <label class="campo"><span>Contato</span><input id="f-contato"></label>
        <button class="botao primario" id="f-add">+ Cadastrar</button>
      </div>
    </section>

    <section class="cartao">
      <div class="cabeca"><h2>Fornecedores</h2>
        <span class="fonte" id="conta-forn">${lista.length} de ${BASE.fornecedores.length}</span></div>
      <div class="barra barra-interna">
        <label class="campo campo-largo"><span>Buscar</span>
          <input id="f-busca" value="${esc(FILTRO.forn)}"
                 placeholder="apelido, razão social, contato ou CNPJ — parte ou nome inteiro"></label>
      </div>
      <div class="rolagem"><table class="tabela-cad">
        <thead><tr><th>Apelido</th><th>Razão social</th><th>CNPJ</th><th>Contato</th>
          <th>Telefone</th><th style="width:78px"></th></tr></thead>
        <tbody id="corpo-forn">${lista.length ? lista.map(linhaFornecedor).join("")
          : '<tr><td colspan="6" class="vazio">Nenhum fornecedor encontrado.</td></tr>'}</tbody>
      </table></div>
    </section>`;

  $("#f-cnpj").oninput = (e) => mascaraCNPJ(e.target);
  $("#f-add").onclick = addFornecedor;
  $("#f-busca").oninput = (e) => { FILTRO.forn = e.target.value; repintarFornecedores(); };
  ligarCelulas("fornecedores", "chave");
}

function linhaFornecedor(f) {
  const k = f.chave;
  const aberto = DETALHE === "f:" + k;
  const cnpjRuim = f.cnpj && !cnpjValido(f.cnpj);
  return `<tr data-k="${esc(k)}">
      <td><input data-campo="chave" value="${esc(f.chave)}"></td>
      <td><input data-campo="razao" value="${esc(f.razao)}" placeholder="obrigatório na OC"></td>
      <td><input data-campo="cnpj" value="${esc(f.cnpj || "")}" class="${cnpjRuim ? "campo-ruim" : ""}"
          title="${cnpjRuim ? "CNPJ inválido — a OC não pode ser gerada assim" : ""}"></td>
      <td><input data-campo="contato" value="${esc(f.contato || "")}"></td>
      <td><input data-campo="tel" value="${esc(f.tel || "")}"></td>
      <td class="acoes-cel">
        <button class="botao-mini expandir" title="Mais campos">${aberto ? "▾" : "▸"}</button>
        <button class="botao-mini apagar" title="Remover">&#10005;</button>
      </td>
    </tr>
    ${aberto ? `<tr class="linha-detalhe"><td colspan="6">
      <div class="grade-oc">
        <label class="campo"><span>E-mail</span><input data-campo="email" value="${esc(f.email || "")}"></label>
        <label class="campo"><span>I.E.</span><input data-campo="ie" value="${esc(f.ie || "")}"></label>
        <label class="campo"><span>Endereço</span><input data-campo="end" value="${esc(f.end || "")}"></label>
        <label class="campo"><span>Cidade/UF</span><input data-campo="cidade" value="${esc(f.cidade || "")}"></label>
        <label class="campo"><span>Prazo caso faturado</span>
          <input data-campo="prazoFat" value="${esc(f.prazoFat || "")}" placeholder="Ex: 28 dias"></label>
        <label class="campo"><span>Prazo de entrega</span>
          <input data-campo="prazoEntrega" value="${esc(f.prazoEntrega || "")}" placeholder="Ex: 48h após pedido"></label>
      </div>
      <label class="campo campo-largo" style="margin-top:12px">
        <span>Observação fixa — entra em toda OC deste fornecedor</span>
        <input data-obs="1" value="${esc(obsDoFornecedor(k))}"
               placeholder="Ex: agendar entrega com 24h de antecedência"></label>
    </td></tr>` : ""}`;
}

function addFornecedor() {
  const chaveNova = limpaNome($("#f-chave").value);
  const razao = limpaNome($("#f-razao").value);
  const cnpj = $("#f-cnpj").value.trim();

  if (!chaveNova) { aviso("Informe o apelido do fornecedor.", "mau"); return; }
  if (!razao) { aviso("Informe a razão social.", "mau"); return; }
  // O CNPJ é a trava contra duplicidade e o dado que a nota fiscal exige.
  if (!cnpjValido(cnpj)) { aviso("CNPJ inválido — confira os 14 dígitos.", "mau"); return; }

  const dup = BASE.fornecedores.find((f) => soDigitos(f.cnpj) === soDigitos(cnpj));
  const existe = BASE.fornecedores.find((f) => chave(f.chave) === chave(chaveNova));
  if (dup && dup !== existe) {
    aviso("Já existe fornecedor com este CNPJ: " + dup.chave + ".", "mau"); return;
  }
  const dados = { chave: chaveNova, razao, cnpj: formatarCNPJ(cnpj),
                  contato: limpaNome($("#f-contato").value) };
  if (existe) { Object.assign(existe, dados); aviso("Fornecedor atualizado.", "bom"); }
  else { BASE.fornecedores.push(Object.assign({ tel: "", email: "", ie: "", end: "", cidade: "",
         prazoFat: "", prazoEntrega: "" }, dados)); aviso("Fornecedor cadastrado.", "bom"); }

  ["#f-chave", "#f-razao", "#f-cnpj", "#f-contato"].forEach((s) => { $(s).value = ""; });
  agendarSalvar();
  telaFornecedores();
}

// ============================================================================
// PRODUTOS E PREÇOS
// ============================================================================
function filtrarProdutos() {
  const qf = chave(FILTRO.prodForn);
  return BASE.produtos.filter((p) =>
    combina(FILTRO.prod, p.produto, p.fornecedor, p.un) &&
    (!qf || chave(p.fornecedor) === qf));
}

// Mesma razao dos fornecedores: repinta o catalogo sem recriar o campo de
// busca, senao o cursor se perde e so a primeira letra e aceita.
function ligarVinculos() {
  $$(".tabela-cad select.vinculo").forEach((sel) => {
    sel.onchange = async () => {
      await definirVinculo(sel.dataset.prod, sel.value);
      sel.classList.toggle("tem", !!sel.value);
      aviso(sel.value
        ? "Produto vinculado — o pedido consolidado passa a pedir por este nome."
        : "Vínculo removido.", "bom");
    };
  });
}

function repintarProdutos() {
  const lista = filtrarProdutos();
  const corpo = $("#corpo-prod");
  if (!corpo) { telaProdutos(); return; }
  corpo.innerHTML = lista.length ? lista.map((p, i) => linhaProduto(p, i)).join("")
    : '<tr><td colspan="7" class="vazio">Nenhum produto encontrado.</td></tr>';
  ligarVinculos();
  const semPreco = lista.filter((p) => !(num(p.preco) > 0)).length;
  $("#conta-prod").textContent = `${lista.length} de ${BASE.produtos.length}`;
  const ficha = $("#sem-preco");
  ficha.textContent = semPreco;
  ficha.className = "ficha-n " + (semPreco ? "ficha-r" : "");
}

function telaProdutos() {
  const qf = chave(FILTRO.prodForn);
  const lista = filtrarProdutos();
  const semPreco = lista.filter((p) => !(num(p.preco) > 0)).length;

  $("#tela").innerHTML = `
    <section class="cartao">
      <div class="cabeca"><h2>Novo produto</h2>
        <span class="fonte">Só para fornecedor já cadastrado — produto solto não vira OC</span></div>
      <div class="barra barra-interna">
        <label class="campo campo-largo"><span>Fornecedor</span>
          <select id="p-forn"><option value="">— Escolher —</option>${BASE.fornecedores.map((f) =>
            `<option value="${esc(f.chave)}">${esc(f.chave)} — ${esc(f.razao)}</option>`).join("")}</select></label>
        <label class="campo campo-largo"><span>Produto</span><input id="p-nome" placeholder="Ex: SALMÃO INTEIRO"></label>
        <label class="campo"><span>Unidade</span><input id="p-un" placeholder="Ex: KG" style="width:130px"></label>
        <label class="campo"><span>Preço (R$)</span><input id="p-preco" inputmode="decimal" placeholder="0,00" style="width:110px"></label>
        <label class="campo"><span>Item do CDE (pedido consolidado)</span>
          <select id="p-vinculo"><option value="">— Sem vínculo —</option>${INSUMOS_CDE.map((i) =>
            `<option value="${esc(i.chave)}">${esc(i.nome)}</option>`).join("")}</select></label>
        <button class="botao primario" id="p-add">+ Adicionar</button>
      </div>
    </section>

    <div class="placar">
      <div class="ficha"><div class="ficha-topo"><span class="fonte">Produtos</span></div>
        <span class="ficha-n">${BASE.produtos.length}</span></div>
      <div class="ficha"><div class="ficha-topo"><span class="fonte">Fornecedores com catálogo</span></div>
        <span class="ficha-n">${new Set(BASE.produtos.map((p) => chave(p.fornecedor))).size}</span></div>
      <div class="ficha"><div class="ficha-topo"><span class="fonte">Sem preço na seleção</span></div>
        <span class="ficha-n ${semPreco ? "ficha-r" : ""}" id="sem-preco">${semPreco}</span>
        <span class="fonte">Item sem preço trava a OC</span></div>
    </div>

    <section class="cartao">
      <div class="cabeca"><h2>Catálogo</h2>
        <span class="fonte" id="conta-prod">${lista.length} de ${BASE.produtos.length}</span>
        <span style="flex:1"></span>
        <button class="botao" id="p-importar">Importar planilha</button></div>
      <div class="barra barra-interna">
        <label class="campo campo-largo"><span>Buscar produto ou fornecedor</span>
          <input id="p-busca" value="${esc(FILTRO.prod)}"
                 placeholder="nome do produto ou do fornecedor — parte ou nome inteiro"></label>
        <label class="campo"><span>Fornecedor</span>
          <select id="p-filtro-forn"><option value="">Todos</option>${
            [...new Set(BASE.produtos.map((p) => p.fornecedor))].sort((a, b) => a.localeCompare(b, "pt-BR"))
              .map((s) => `<option value="${esc(s)}"${chave(s) === qf ? " selected" : ""}>${esc(s)}</option>`).join("")
          }</select></label>
      </div>
      <div class="rolagem"><table class="tabela-cad">
        <thead><tr><th style="width:46px">#</th><th>Fornecedor</th><th>Produto</th>
          <th style="width:180px">Unidade</th><th style="width:120px">Preço unit.</th>
          <th style="width:190px" title="Item do pedido consolidado que este produto atende">Item do CDE</th>
          <th style="width:44px"></th></tr></thead>
        <tbody id="corpo-prod">${lista.length ? lista.map((p, i) => linhaProduto(p, i)).join("")
          : '<tr><td colspan="7" class="vazio">Nenhum produto encontrado.</td></tr>'}</tbody>
      </table></div>
    </section>`;

  $("#p-add").onclick = addProduto;
  ligarVinculos();
  $("#p-busca").oninput = (e) => { FILTRO.prod = e.target.value; repintarProdutos(); };
  $("#p-filtro-forn").onchange = (e) => { FILTRO.prodForn = e.target.value; repintarProdutos(); };
  $("#p-importar").onclick = () => $("#arquivo-import").click();
  ligarCelulas("produtos", null);
}

// A identidade do produto é (fornecedor, produto): o mesmo nome existe em vários
// fornecedores com preços diferentes, e é isso que permite comparar.
function idProduto(p) { return chave(p.fornecedor) + " " + chave(p.produto); }

function linhaProduto(p, i) {
  const semPreco = !(num(p.preco) > 0);
  return `<tr data-k="${esc(idProduto(p))}">
    <td class="fonte">${i + 1}</td>
    <td><input data-campo="fornecedor" value="${esc(p.fornecedor)}"></td>
    <td><input data-campo="produto" value="${esc(p.produto)}"></td>
    <td><input data-campo="un" value="${esc(p.un || "")}"></td>
    <td><input data-campo="preco" inputmode="decimal" value="${num(p.preco) > 0 ? fmt(p.preco) : ""}"
        placeholder="0,00" class="${semPreco ? "campo-ruim" : ""}"
        title="${semPreco ? "Sem preço — a OC deste item não pode ser gerada" : ""}"></td>
    <td>${seletorVinculo(p.produto, "vinculo")}</td>
    <td class="acoes-cel"><button class="botao-mini apagar" title="Remover">&#10005;</button></td>
  </tr>`;
}

async function addProduto() {
  const forn = $("#p-forn").value;
  let nome = limpaNome($("#p-nome").value);
  const un = limpaNome($("#p-un").value);
  const preco = num($("#p-preco").value);

  if (!forn) { aviso("Escolha o fornecedor.", "mau"); return; }
  if (!nome) { aviso("Informe o nome do produto.", "mau"); return; }
  if (!un) { aviso("Informe a unidade (KG, CAIXA, UN…).", "mau"); return; }

  // Reaproveita a grafia já usada em outro fornecedor: "STRAW" e "Straw " são o
  // mesmo produto, e nomes divergentes impedem comparar preço entre fornecedores.
  const mesmoNome = BASE.produtos.find((p) => chave(p.produto) === chave(nome));
  if (mesmoNome) nome = mesmoNome.produto;

  const existe = BASE.produtos.find((p) =>
    chave(p.fornecedor) === chave(forn) && chave(p.produto) === chave(nome));
  if (existe) {
    existe.un = un; existe.preco = preco;
    aviso("Esse produto já existia para este fornecedor — preço e unidade atualizados.", "");
  } else {
    BASE.produtos.push({ fornecedor: forn, produto: nome, un, preco });
    aviso("Produto adicionado.", "bom");
  }
  const vinculo = $("#p-vinculo").value;
  $("#p-nome").value = ""; $("#p-un").value = ""; $("#p-preco").value = "";
  $("#p-vinculo").value = "";
  agendarSalvar();
  // O servidor recusa vínculo para produto que ainda não existe na planilha —
  // então a gravação do catálogo tem que acontecer antes, não depois.
  if (vinculo) {
    await gravarAgora();
    await definirVinculo(nome, vinculo);
    const cde = INSUMOS_CDE.find((i) => i.chave === vinculo);
    aviso(`Produto adicionado e vinculado a "${cde ? cde.nome : vinculo}" no pedido consolidado.`, "bom");
  }
  telaProdutos();
}

// ============================================================================
// UNIDADES COMPRADORAS
// ============================================================================
function telaUnidades() {
  $("#tela").innerHTML = `
    <section class="cartao">
      <div class="cabeca"><h2>Nova unidade</h2>
        <span class="fonte">A chave é o que numera as OCs — mudar depois recomeça a contagem daquela unidade</span></div>
      <div class="barra barra-interna">
        <label class="campo"><span>Chave *</span><input id="u-chave" placeholder="Ex: SENADOR LEMOS"></label>
        <label class="campo campo-largo"><span>Nome / Razão social *</span><input id="u-nome"></label>
        <label class="campo"><span>CNPJ</span><input id="u-cnpj" inputmode="numeric" maxlength="18" placeholder="00.000.000/0000-00"></label>
        <button class="botao primario" id="u-add">+ Cadastrar</button>
      </div>
    </section>

    <section class="cartao">
      <div class="cabeca"><h2>Unidades</h2><span class="fonte">${BASE.unidades.length} cadastrada(s)</span></div>
      <div class="rolagem"><table class="tabela-cad">
        <thead><tr><th>Chave</th><th>Nome / Razão social</th><th>CNPJ</th>
          <th>Telefone</th><th style="width:78px"></th></tr></thead>
        <tbody>${BASE.unidades.length ? BASE.unidades.map(linhaUnidade).join("")
          : '<tr><td colspan="5" class="vazio">Nenhuma unidade cadastrada.</td></tr>'}</tbody>
      </table></div>
    </section>`;

  $("#u-cnpj").oninput = (e) => mascaraCNPJ(e.target);
  $("#u-add").onclick = addUnidade;
  ligarCelulas("unidades", "chave");
}

function linhaUnidade(u) {
  const aberto = DETALHE === "u:" + u.chave;
  return `<tr data-k="${esc(u.chave)}">
      <td><input data-campo="chave" value="${esc(u.chave)}"></td>
      <td><input data-campo="nome" value="${esc(u.nome)}"></td>
      <td><input data-campo="cnpj" value="${esc(u.cnpj || "")}"></td>
      <td><input data-campo="tel" value="${esc(u.tel || "")}"></td>
      <td class="acoes-cel">
        <button class="botao-mini expandir" title="Mais campos">${aberto ? "▾" : "▸"}</button>
        <button class="botao-mini apagar" title="Remover">&#10005;</button>
      </td>
    </tr>
    ${aberto ? `<tr class="linha-detalhe"><td colspan="5">
      <div class="grade-oc">
        <label class="campo"><span>Contato</span><input data-campo="contato" value="${esc(u.contato || "")}"></label>
        <label class="campo"><span>E-mail</span><input data-campo="email" value="${esc(u.email || "")}"></label>
        <label class="campo"><span>I.E.</span><input data-campo="ie" value="${esc(u.ie || "")}"></label>
        <label class="campo"><span>Endereço</span><input data-campo="end" value="${esc(u.end || "")}"></label>
      </div>
    </td></tr>` : ""}`;
}

function addUnidade() {
  const k = limpaNome($("#u-chave").value);
  const nome = limpaNome($("#u-nome").value);
  const cnpj = $("#u-cnpj").value.trim();
  if (!k || !nome) { aviso("Preencha a chave e o nome.", "mau"); return; }
  const existe = BASE.unidades.find((u) => chave(u.chave) === chave(k));
  const dados = { chave: k, nome, cnpj: cnpj ? formatarCNPJ(cnpj) : "" };
  if (existe) { Object.assign(existe, dados); aviso("Unidade atualizada.", "bom"); }
  else { BASE.unidades.push(Object.assign({ contato: "", email: "", ie: "", tel: "", end: "" }, dados));
         aviso("Unidade cadastrada.", "bom"); }
  ["#u-chave", "#u-nome", "#u-cnpj"].forEach((s) => { $(s).value = ""; });
  agendarSalvar();
  telaUnidades();
}

// ============================================================================
// Edição na célula — um só tratador para as três abas
// ============================================================================
function achar(colecao, k) {
  if (colecao === "produtos") return BASE.produtos.find((p) => idProduto(p) === k);
  const arr = colecao === "fornecedores" ? BASE.fornecedores : BASE.unidades;
  return arr.find((r) => chave(r.chave) === chave(k));
}

function ligarCelulas(colecao, campoChave) {
  const tabela = $(".tabela-cad");
  if (!tabela) return;

  tabela.addEventListener("change", (e) => {
    const campo = e.target.dataset.campo;
    const linha = e.target.closest("tr");
    const k = (linha.classList.contains("linha-detalhe")
      ? linha.previousElementSibling : linha).dataset.k;
    const reg = achar(colecao, k);
    if (!reg) return;

    // Observação fixa vive na aba Observações, não no registro do fornecedor
    if (e.target.dataset.obs) { gravarObs(k, e.target.value); return; }
    if (!campo) return;

    const v = e.target.value;
    if (campo === "preco") { reg.preco = num(v); }
    else if (campo === "cnpj") {
      if (soDigitos(v) && !cnpjValido(v)) {
        // Deixa o valor na tela para poder corrigir, mas marca e não grava.
        e.target.classList.add("campo-ruim");
        aviso("CNPJ inválido — corrija antes de gerar OC deste cadastro.", "mau");
      } else { e.target.classList.remove("campo-ruim"); }
      reg.cnpj = soDigitos(v).length === 14 ? formatarCNPJ(v) : v.trim();
      e.target.value = reg.cnpj;
    }
    else if (campo === campoChave) {
      const novo = limpaNome(v);
      if (!novo) { e.target.value = reg.chave; return; }
      const dup = (colecao === "fornecedores" ? BASE.fornecedores : BASE.unidades)
        .find((r) => r !== reg && chave(r.chave) === chave(novo));
      if (dup) { aviso("Já existe registro com esta chave.", "mau"); e.target.value = reg.chave; return; }
      renomearChave(colecao, reg.chave, novo);
      reg.chave = novo;
    }
    else { reg[campo] = campo === "razao" || campo === "nome" || campo === "produto" ? limpaNome(v) : v; }

    agendarSalvar();
  });

  tabela.addEventListener("click", (e) => {
    const linha = e.target.closest("tr");
    if (e.target.closest(".expandir")) {
      const pref = colecao === "fornecedores" ? "f:" : "u:";
      DETALHE = DETALHE === pref + linha.dataset.k ? null : pref + linha.dataset.k;
      desenhar();
    }
    if (e.target.closest(".apagar")) apagar(colecao, linha.dataset.k);
  });
}

// Renomear o apelido tem efeito colateral: o catálogo e a observação fixa
// apontam para ele por nome. Sem arrastar as referências, o fornecedor perderia
// os produtos e a observação no ato do rename.
function renomearChave(colecao, antigo, novo) {
  if (colecao === "fornecedores") {
    BASE.produtos.forEach((p) => { if (chave(p.fornecedor) === chave(antigo)) p.fornecedor = novo; });
    BASE.observacoes.forEach((o) => { if (chave(o.fornecedor) === chave(antigo)) o.fornecedor = novo; });
    aviso("Apelido alterado — catálogo e observação foram junto.", "");
  }
  if (colecao === "unidades") {
    aviso("A numeração de OC é contada por chave de unidade: a nova chave começa do 1.", "mau");
  }
}

function gravarObs(chaveForn, texto) {
  const t = limpaNome(texto);
  const atual = BASE.observacoes.find((o) => chave(o.fornecedor) === chave(chaveForn));
  if (t) {
    if (atual) atual.texto = t;
    else BASE.observacoes.push({ fornecedor: chaveForn, texto: t });
  } else if (atual) {
    BASE.observacoes.splice(BASE.observacoes.indexOf(atual), 1);
  }
  agendarSalvar();
}

function apagar(colecao, k) {
  if (colecao === "produtos") {
    const p = achar("produtos", k);
    if (!p || !confirm(`Remover "${p.produto}" do catálogo de ${p.fornecedor}?`)) return;
    BASE.produtos.splice(BASE.produtos.indexOf(p), 1);
  } else if (colecao === "fornecedores") {
    const f = achar("fornecedores", k);
    if (!f) return;
    const n = produtosDoFornecedor(f.chave).length;
    if (!confirm(`Remover o fornecedor ${f.chave}?` +
        (n ? `\nOs ${n} produto(s) dele no catálogo também serão removidos.` : ""))) return;
    BASE.produtos = BASE.produtos.filter((p) => chave(p.fornecedor) !== chave(f.chave));
    BASE.observacoes = BASE.observacoes.filter((o) => chave(o.fornecedor) !== chave(f.chave));
    BASE.fornecedores.splice(BASE.fornecedores.indexOf(f), 1);
  } else {
    const u = achar("unidades", k);
    if (!u) return;
    if (!confirm(`Remover a unidade ${u.chave}?\n` +
        "As OCs já emitidas por ela continuam no registro de numeração.")) return;
    BASE.unidades.splice(BASE.unidades.indexOf(u), 1);
  }
  DETALHE = null;
  agendarSalvar();
  desenhar();
}

// ============================================================================
// Planilha: exportar cópia e importar de volta
// ============================================================================
function exportarCopia() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(BASE.fornecedores.map((f) => ({
    "Chave": f.chave, "Razão Social": f.razao, "Contato": f.contato || "", "Telefone": f.tel || "",
    "E-mail": f.email || "", "CNPJ": f.cnpj || "", "I.E.": f.ie || "", "Endereço": f.end || "",
    "Cidade": f.cidade || "", "Prazo Faturado": f.prazoFat || "", "Prazo Entrega": f.prazoEntrega || "",
  }))), "Fornecedores");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(BASE.produtos.map((p) => ({
    "Fornecedor": p.fornecedor, "Produto": p.produto, "Unidade": p.un, "Preço": num(p.preco),
  }))), "Produtos");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(BASE.unidades.map((u) => ({
    "Chave": u.chave, "Nome": u.nome, "Contato": u.contato || "", "E-mail": u.email || "",
    "CNPJ": u.cnpj || "", "I.E.": u.ie || "", "Telefone": u.tel || "", "Endereço": u.end || "",
  }))), "Unidades");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(BASE.observacoes.map((o) => ({
    "Fornecedor": o.fornecedor, "Observação": o.texto,
  }))), "Observações");
  XLSX.writeFile(wb, "Base_SushiBoulevard_copia_" + hojeBR().replace(/\//g, "-") + ".xlsx");
  aviso("Cópia da base baixada.", "bom");
}

// Importação é MESCLA, não substituição: registro com a mesma chave é
// atualizado, o resto é acrescentado. Nada é apagado — planilha incompleta não
// deve zerar o cadastro inteiro.
function importarPlanilha(input) {
  const arq = input.files[0];
  if (!arq) return;
  if (!confirm("Importar vai atualizar e acrescentar registros na base compartilhada.\n" +
               "Registros com a mesma chave serão sobrescritos. Nada é apagado. Continuar?")) {
    input.value = ""; return;
  }
  const leitor = new FileReader();
  leitor.onload = (e) => {
    let conta = { f: 0, p: 0, u: 0, ignorados: 0 };
    try {
      const wb = XLSX.read(e.target.result, { type: "binary" });
      const linhas = (nome) => wb.Sheets[nome]
        ? XLSX.utils.sheet_to_json(wb.Sheets[nome], { defval: "" }) : [];
      const val = (r, ...nomes) => {
        for (const n of nomes) if (r[n] !== undefined && r[n] !== "") return String(r[n]).trim();
        return "";
      };

      linhas("Fornecedores").forEach((r) => {
        const k = limpaNome(val(r, "Chave"));
        const razao = limpaNome(val(r, "Razão Social", "Razao Social"));
        if (!k || !razao) return;
        const cnpj = formatarCNPJ(val(r, "CNPJ"));
        const dados = { chave: k, razao, cnpj,
          contato: val(r, "Contato"), tel: val(r, "Telefone"), email: val(r, "E-mail", "Email"),
          ie: val(r, "I.E.", "IE"), end: val(r, "Endereço", "Endereco"), cidade: val(r, "Cidade"),
          prazoFat: val(r, "Prazo Faturado", "Prazo Caso Faturado"),
          prazoEntrega: val(r, "Prazo Entrega", "Prazo de Entrega") };
        const dig = soDigitos(cnpj);
        const atual = (dig.length === 14 && BASE.fornecedores.find((f) => soDigitos(f.cnpj) === dig))
                   || BASE.fornecedores.find((f) => chave(f.chave) === chave(k));
        if (atual) Object.assign(atual, dados); else BASE.fornecedores.push(dados);
        conta.f++;
      });

      // Produto de fornecedor não cadastrado é recusado: o catálogo é a base do
      // preço da OC, e preço sem fornecedor com CNPJ não gera documento válido.
      linhas("Produtos").forEach((r) => {
        const forn = limpaNome(val(r, "Fornecedor", "FORNECEDOR"));
        const prod = limpaNome(val(r, "Produto", "PRODUTO", "Descrição"));
        if (!forn || !prod) return;
        const cad = BASE.fornecedores.find((f) => chave(f.chave) === chave(forn));
        if (!cad) { conta.ignorados++; return; }
        const un = limpaNome(val(r, "Unidade", "UN"));
        const preco = num(val(r, "Preço", "Preco", "Valor"));
        const atual = BASE.produtos.find((p) =>
          chave(p.fornecedor) === chave(cad.chave) && chave(p.produto) === chave(prod));
        if (atual) { atual.un = un || atual.un; atual.preco = preco; }
        else BASE.produtos.push({ fornecedor: cad.chave, produto: prod, un, preco });
        conta.p++;
      });

      linhas("Unidades").forEach((r) => {
        const k = limpaNome(val(r, "Chave"));
        const nome = limpaNome(val(r, "Nome"));
        if (!k || !nome) return;
        const dados = { chave: k, nome, contato: val(r, "Contato"),
          email: val(r, "E-mail", "Email"), cnpj: val(r, "CNPJ"), ie: val(r, "I.E.", "IE"),
          tel: val(r, "Telefone"), end: val(r, "Endereço", "Endereco") };
        const atual = BASE.unidades.find((u) => chave(u.chave) === chave(k));
        if (atual) Object.assign(atual, dados); else BASE.unidades.push(dados);
        conta.u++;
      });

      (linhas("Observações").concat(linhas("Observacoes"))).forEach((r) => {
        const forn = limpaNome(val(r, "Fornecedor"));
        if (forn) gravarObs(forn, val(r, "Observação", "Observacao"));
      });

      agendarSalvar();
      desenhar();
      aviso(`Importado: ${conta.f} fornecedor(es), ${conta.p} produto(s), ${conta.u} unidade(s)` +
            (conta.ignorados ? ` · ${conta.ignorados} produto(s) ignorado(s) por fornecedor não cadastrado` : ""),
            conta.ignorados ? "" : "bom");
    } catch (err) {
      aviso("Não consegui ler a planilha: " + err.message, "mau");
    }
    input.value = "";
  };
  leitor.readAsBinaryString(arq);
}

iniciar();
