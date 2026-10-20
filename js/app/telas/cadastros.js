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
//
// As células da tabela gravam no "change" nativo (ao sair do campo, ou Enter),
// e o registro editado é o da própria linha. Na tela antiga a linha guardava a
// chave num atributo que só se atualizava ao redesenhar: depois de renomear o
// apelido, editar outro campo da mesma linha se perdia em silêncio. Aqui não.
// ============================================================================
import { html, useState, useEffect, useRef, Fragment } from "../html.js";
import { num, fmt, chave, busca, limpaNome, soDigitos, formatarCNPJ, cnpjValido, hojeBR } from "../formato.js";
import * as api from "../api.js";
import { avisoCompras as aviso, Estado } from "../componentes/Aviso.js";
import { base, carregarBase, salvarBase, produtosDoFornecedor, obsDoFornecedor } from "../base.js";
import { montarTela } from "../montar.js";

// Conciliação com o pedido consolidado. O produto do catálogo é o que o
// fornecedor vende; o insumo do CDE é o que a operação conta todo dia. Quem
// cadastra o produto é quem sabe qual é qual — por isso o vínculo se declara
// aqui, e não em arquivo separado que alguém teria que lembrar de editar.
let VINCULOS = {};             // { insumo_chave: [nome do produto no catálogo] }
let INSUMOS_CDE = [];          // { chave, nome } dos itens do pedido consolidado

async function carregarVinculos() {
  try {
    const r = await (await api.getVinculos()).json();
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
    const r = await (await api.postVinculos({ vinculos: VINCULOS })).json();
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

// ------------------------------------------------------------------ gravação
let _fila = null, _gravando = false;
let estado = () => {};         // a barra de estado da tela (ligada pelo componente)

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
    await salvarBase(estado);
  } catch (e) {
    estado("Falha ao salvar", "erro");
    aviso("Não consegui gravar a planilha: " + e.message, "mau");
  } finally { _gravando = false; }
}

// Procura o texto digitado em TODOS os campos da linha, palavra por palavra.
//
// Duas coisas que quem usa espera:
//   - achar o produto pelo nome do FORNECEDOR ("amasa" traz os camarões da
//     Amasa, mesmo que a palavra não apareça no nome do produto);
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

// Identidade estável de cada registro na tela: o React reaproveita a linha
// mesmo quando o apelido (ou o nome do produto) muda, e o foco não se perde.
const IDS = new WeakMap();
let proximoId = 0;
const idDe = (reg) => { if (!IDS.has(reg)) IDS.set(reg, ++proximoId); return IDS.get(reg); };
// a identidade do produto é (fornecedor, produto), como no catálogo
const idProduto = (p) => chave(p.fornecedor) + "␟" + chave(p.produto);

// Célula que grava no "change" nativo (ao sair, ou Enter), como a tabela
// antiga. O campo não é controlado: o que se digita fica nele, e quem trata a
// mudança pode reescrevê-lo (CNPJ formatado, chave recusada).
function Celula({ aoMudar, ...resto }) {
  const ref = useRef(null);
  const cb = useRef(aoMudar);
  cb.current = aoMudar;
  useEffect(() => {
    const el = ref.current;
    const h = () => cb.current(el);
    el.addEventListener("change", h);
    return () => el.removeEventListener("change", h);
  }, []);
  return html`<input ref=${ref} ...${resto} />`;
}

// ------------------------------------------------------------------ tela
function Cadastros() {
  const [, setVersao] = useState(0);
  const redesenhar = () => setVersao((v) => v + 1);
  // muda quando a tela é refeita do zero (aba, cadastro novo, remoção, detalhe,
  // importação, recarga): os campos voltam a mostrar o que está na base
  const [versaoTela, setVersaoTela] = useState(0);
  const desenhar = () => { setVersaoTela((v) => v + 1); redesenhar(); };
  const [carregado, setCarregado] = useState(false);
  const [msgTela, setMsgTela] = useState(null);
  const [aba, setAba] = useState("fornecedores");
  const detalhe = useRef(null);            // linha expandida ("f:" ou "u:" + chave)
  const [filtro, setFiltro] = useState({ prod: "", prodForn: "", forn: "" });
  const [est, setEst] = useState({ texto: "", classe: "" });
  const arquivo = useRef(null);
  const form = useRef({});                 // campos dos formulários de cadastro
  const campoForm = (nome) => (el) => { form.current[nome] = el; };
  estado = (texto, classe) => setEst({ texto: texto || "", classe: classe || "" });

  const BASE = base();

  useEffect(() => {
    (async () => {
      estado("Carregando cadastro…");
      try {
        await Promise.all([carregarBase(true), carregarVinculos()]);
      } catch (e) {
        setMsgTela("Servidor fora do ar. Rode o Servidor.bat.");
        return;
      }
      estado("");
      if (base().erro) { setMsgTela(`Não consegui abrir a base: ${base().erro}`); return; }
      setCarregado(true);
      desenhar();
    })();
    // Sair da página com gravação pendente perderia a edição em silêncio.
    const sair = (e) => { if (_fila && !_gravando) { gravarAgora(); e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", sair);
    return () => window.removeEventListener("beforeunload", sair);
  }, []);

  // ============================================================ edição na célula
  function mudarCelula(colecao, campoChave, reg, campo, el) {
    const v = el.value;
    if (campo === "preco") { reg.preco = num(v); }
    else if (campo === "cnpj") {
      if (soDigitos(v) && !cnpjValido(v)) {
        // Deixa o valor na tela para poder corrigir, mas marca e não grava.
        el.classList.add("campo-ruim");
        aviso("CNPJ inválido — corrija antes de gerar OC deste cadastro.", "mau");
      } else { el.classList.remove("campo-ruim"); }
      reg.cnpj = soDigitos(v).length === 14 ? formatarCNPJ(v) : v.trim();
      el.value = reg.cnpj;
    }
    else if (campo === campoChave) {
      const novo = limpaNome(v);
      if (!novo) { el.value = reg.chave; return; }
      const dup = (colecao === "fornecedores" ? BASE.fornecedores : BASE.unidades)
        .find((r) => r !== reg && chave(r.chave) === chave(novo));
      if (dup) { aviso("Já existe registro com esta chave.", "mau"); el.value = reg.chave; return; }
      renomearChave(colecao, reg.chave, novo);
      if (detalhe.current === (colecao === "fornecedores" ? "f:" : "u:") + reg.chave) {
        detalhe.current = (colecao === "fornecedores" ? "f:" : "u:") + novo;
      }
      reg.chave = novo;
    }
    else { reg[campo] = campo === "razao" || campo === "nome" || campo === "produto" ? limpaNome(v) : v; }
    agendarSalvar();
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

  function apagar(colecao, reg) {
    if (colecao === "produtos") {
      if (!confirm(`Remover "${reg.produto}" do catálogo de ${reg.fornecedor}?`)) return;
      BASE.produtos.splice(BASE.produtos.indexOf(reg), 1);
    } else if (colecao === "fornecedores") {
      const n = produtosDoFornecedor(reg.chave).length;
      if (!confirm(`Remover o fornecedor ${reg.chave}?` +
          (n ? `\nOs ${n} produto(s) dele no catálogo também serão removidos.` : ""))) return;
      BASE.produtos = BASE.produtos.filter((p) => chave(p.fornecedor) !== chave(reg.chave));
      BASE.observacoes = BASE.observacoes.filter((o) => chave(o.fornecedor) !== chave(reg.chave));
      BASE.fornecedores.splice(BASE.fornecedores.indexOf(reg), 1);
    } else {
      if (!confirm(`Remover a unidade ${reg.chave}?\n` +
          "As OCs já emitidas por ela continuam no registro de numeração.")) return;
      BASE.unidades.splice(BASE.unidades.indexOf(reg), 1);
    }
    detalhe.current = null;
    agendarSalvar();
    desenhar();
  }

  const expandir = (pref, reg) => {
    detalhe.current = detalhe.current === pref + reg.chave ? null : pref + reg.chave;
    desenhar();
  };
  const celula = (colecao, campoChave, reg, campo, valor, extra) => html`<${Celula} data-campo=${campo}
    defaultValue=${valor} ...${extra || {}} aoMudar=${(el) => mudarCelula(colecao, campoChave, reg, campo, el)} />`;
  const acoes = (colecao, pref, reg, aberto) => html`<td class="acoes-cel">${pref ? html`<button class="botao-mini expandir" title="Mais campos"
      onClick=${() => expandir(pref, reg)}>${aberto ? "▾" : "▸"}</button>` : null}<button class="botao-mini apagar" title="Remover"
      onClick=${() => apagar(colecao, reg)}>✕</button></td>`;
  const mascara = (e) => { e.target.value = formatarCNPJ(e.target.value); };

  // ============================================================ FORNECEDORES
  function addFornecedor() {
    const f = form.current;
    const chaveNova = limpaNome(f.fChave.value);
    const razao = limpaNome(f.fRazao.value);
    const cnpj = f.fCnpj.value.trim();

    if (!chaveNova) { aviso("Informe o apelido do fornecedor.", "mau"); return; }
    if (!razao) { aviso("Informe a razão social.", "mau"); return; }
    // O CNPJ é a trava contra duplicidade e o dado que a nota fiscal exige.
    if (!cnpjValido(cnpj)) { aviso("CNPJ inválido — confira os 14 dígitos.", "mau"); return; }

    const dup = BASE.fornecedores.find((x) => soDigitos(x.cnpj) === soDigitos(cnpj));
    const existe = BASE.fornecedores.find((x) => chave(x.chave) === chave(chaveNova));
    if (dup && dup !== existe) {
      aviso("Já existe fornecedor com este CNPJ: " + dup.chave + ".", "mau"); return;
    }
    const dados = { chave: chaveNova, razao, cnpj: formatarCNPJ(cnpj),
                    contato: limpaNome(f.fContato.value) };
    if (existe) { Object.assign(existe, dados); aviso("Fornecedor atualizado.", "bom"); }
    else { BASE.fornecedores.push(Object.assign({ tel: "", email: "", ie: "", end: "", cidade: "",
           prazoFat: "", prazoEntrega: "" }, dados)); aviso("Fornecedor cadastrado.", "bom"); }
    [f.fChave, f.fRazao, f.fCnpj, f.fContato].forEach((el) => { el.value = ""; });
    agendarSalvar();
    desenhar();
  }

  function telaFornecedores() {
    const lista = BASE.fornecedores.filter((f) =>
      combina(filtro.forn, f.chave, f.razao, f.contato, f.cnpj, f.cidade, f.email));
    const cel = (reg, campo, valor, extra) => celula("fornecedores", "chave", reg, campo, valor, extra);
    const linha = (f) => {
      const aberto = detalhe.current === "f:" + f.chave;
      const cnpjRuim = f.cnpj && !cnpjValido(f.cnpj);
      return html`<${Fragment} key=${idDe(f)}><tr data-k=${f.chave}>
          <td>${cel(f, "chave", f.chave)}</td>
          <td>${cel(f, "razao", f.razao, { placeholder: "obrigatório na OC" })}</td>
          <td>${cel(f, "cnpj", f.cnpj || "", { class: cnpjRuim ? "campo-ruim" : "",
            title: cnpjRuim ? "CNPJ inválido — a OC não pode ser gerada assim" : "" })}</td>
          <td>${cel(f, "contato", f.contato || "")}</td>
          <td>${cel(f, "tel", f.tel || "")}</td>
          ${acoes("fornecedores", "f:", f, aberto)}
        </tr>${aberto ? html`<tr class="linha-detalhe"><td colSpan="6">
          <div class="grade-oc">
            <label class="campo"><span>E-mail</span>${cel(f, "email", f.email || "")}</label>
            <label class="campo"><span>I.E.</span>${cel(f, "ie", f.ie || "")}</label>
            <label class="campo"><span>Endereço</span>${cel(f, "end", f.end || "")}</label>
            <label class="campo"><span>Cidade/UF</span>${cel(f, "cidade", f.cidade || "")}</label>
            <label class="campo"><span>Prazo caso faturado</span>${cel(f, "prazoFat", f.prazoFat || "", { placeholder: "Ex: 28 dias" })}</label>
            <label class="campo"><span>Prazo de entrega</span>${cel(f, "prazoEntrega", f.prazoEntrega || "", { placeholder: "Ex: 48h após pedido" })}</label>
          </div>
          <label class="campo campo-largo" style=${{ marginTop: "12px" }}>
            <span>Observação fixa — entra em toda OC deste fornecedor</span>
            <${Celula} data-obs="1" defaultValue=${obsDoFornecedor(f.chave)}
              placeholder="Ex: agendar entrega com 24h de antecedência"
              aoMudar=${(el) => gravarObs(f.chave, el.value)} /></label>
        </td></tr>` : null}<//>`;
    };
    return html`<section class="cartao">
        <div class="cabeca"><h2>Novo fornecedor</h2>
          <span class="fonte">Apelido, CNPJ e razão social são obrigatórios — a OC não vale sem eles</span></div>
        <div class="barra barra-interna">
          <label class="campo"><span>Apelido *</span><input id="f-chave" ref=${campoForm("fChave")} placeholder="Ex: BELTUBO" /></label>
          <label class="campo"><span>CNPJ *</span><input id="f-cnpj" ref=${campoForm("fCnpj")} inputmode="numeric" maxlength="18" placeholder="00.000.000/0000-00" onInput=${mascara} /></label>
          <label class="campo campo-largo"><span>Razão social *</span><input id="f-razao" ref=${campoForm("fRazao")} /></label>
          <label class="campo"><span>Contato</span><input id="f-contato" ref=${campoForm("fContato")} /></label>
          <button class="botao primario" id="f-add" onClick=${addFornecedor}>+ Cadastrar</button>
        </div>
      </section>

      <section class="cartao">
        <div class="cabeca"><h2>Fornecedores</h2>
          <span class="fonte" id="conta-forn">${`${lista.length} de ${BASE.fornecedores.length}`}</span></div>
        <div class="barra barra-interna">
          <label class="campo campo-largo"><span>Buscar</span>
            <input id="f-busca" value=${filtro.forn} onInput=${(e) => setFiltro({ ...filtro, forn: e.target.value })} onChange=${() => {}}
                   placeholder="apelido, razão social, contato ou CNPJ — parte ou nome inteiro" /></label>
        </div>
        <div class="rolagem"><table class="tabela-cad">
          <thead><tr><th>Apelido</th><th>Razão social</th><th>CNPJ</th><th>Contato</th>
            <th>Telefone</th><th style=${{ width: "78px" }}></th></tr></thead>
          <tbody id="corpo-forn">${lista.length ? lista.map(linha)
            : html`<tr><td colSpan="6" class="vazio">Nenhum fornecedor encontrado.</td></tr>`}</tbody>
        </table></div>
      </section>`;
  }

  // ============================================================ PRODUTOS E PREÇOS
  async function addProduto() {
    const f = form.current;
    const forn = f.pForn.value;
    let nome = limpaNome(f.pNome.value);
    const un = limpaNome(f.pUn.value);
    const preco = num(f.pPreco.value);

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
    const vinculo = f.pVinculo.value;
    f.pNome.value = ""; f.pUn.value = ""; f.pPreco.value = "";
    f.pVinculo.value = "";
    agendarSalvar();
    // O servidor recusa vínculo para produto que ainda não existe na planilha —
    // então a gravação do catálogo tem que acontecer antes, não depois.
    if (vinculo) {
      await gravarAgora();
      await definirVinculo(nome, vinculo);
      const cde = INSUMOS_CDE.find((i) => i.chave === vinculo);
      aviso(`Produto adicionado e vinculado a "${cde ? cde.nome : vinculo}" no pedido consolidado.`, "bom");
    }
    desenhar();
  }

  function telaProdutos() {
    const qf = chave(filtro.prodForn);
    const lista = BASE.produtos.filter((p) =>
      combina(filtro.prod, p.produto, p.fornecedor, p.un) && (!qf || chave(p.fornecedor) === qf));
    const semPreco = lista.filter((p) => !(num(p.preco) > 0)).length;
    const cel = (reg, campo, valor, extra) => celula("produtos", null, reg, campo, valor, extra);
    const seletorVinculo = (p) => {
      const atual = insumoDoProduto(p.produto);
      return html`<select class=${"vinculo" + (atual ? " tem" : "")} data-prod=${p.produto} defaultValue=${atual}
        onChange=${async (e) => {
          const sel = e.target;
          await definirVinculo(p.produto, sel.value);
          sel.classList.toggle("tem", !!sel.value);
          aviso(sel.value
            ? "Produto vinculado — o pedido consolidado passa a pedir por este nome."
            : "Vínculo removido.", "bom");
        }}>
        <option value="">— Sem vínculo —</option>${INSUMOS_CDE.map((i) =>
          html`<option key=${i.chave} value=${i.chave}>${i.nome}</option>`)}
      </select>`;
    };
    const linha = (p, i) => {
      const sem = !(num(p.preco) > 0);
      return html`<tr key=${idDe(p)} data-k=${idProduto(p)}>
        <td class="fonte">${i + 1}</td>
        <td>${cel(p, "fornecedor", p.fornecedor)}</td>
        <td>${cel(p, "produto", p.produto)}</td>
        <td>${cel(p, "un", p.un || "")}</td>
        <td>${cel(p, "preco", num(p.preco) > 0 ? fmt(p.preco) : "", { inputmode: "decimal", placeholder: "0,00",
          class: sem ? "campo-ruim" : "", title: sem ? "Sem preço — a OC deste item não pode ser gerada" : "" })}</td>
        <td>${seletorVinculo(p)}</td>
        ${acoes("produtos", null, p, false)}
      </tr>`;
    };
    const fornsCatalogo = [...new Set(BASE.produtos.map((p) => p.fornecedor))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const filtroForn = fornsCatalogo.find((s) => chave(s) === qf) || "";
    return html`<section class="cartao">
        <div class="cabeca"><h2>Novo produto</h2>
          <span class="fonte">Só para fornecedor já cadastrado — produto solto não vira OC</span></div>
        <div class="barra barra-interna">
          <label class="campo campo-largo"><span>Fornecedor</span>
            <select id="p-forn" ref=${campoForm("pForn")}><option value="">— Escolher —</option>${BASE.fornecedores.map((f) =>
              html`<option key=${idDe(f)} value=${f.chave}>${f.chave + " — " + f.razao}</option>`)}</select></label>
          <label class="campo campo-largo"><span>Produto</span><input id="p-nome" ref=${campoForm("pNome")} placeholder="Ex: SALMÃO INTEIRO" /></label>
          <label class="campo"><span>Unidade</span><input id="p-un" ref=${campoForm("pUn")} placeholder="Ex: KG" style=${{ width: "130px" }} /></label>
          <label class="campo"><span>Preço (R$)</span><input id="p-preco" ref=${campoForm("pPreco")} inputmode="decimal" placeholder="0,00" style=${{ width: "110px" }} /></label>
          <label class="campo"><span>Item do CDE (pedido consolidado)</span>
            <select id="p-vinculo" ref=${campoForm("pVinculo")}><option value="">— Sem vínculo —</option>${INSUMOS_CDE.map((i) =>
              html`<option key=${i.chave} value=${i.chave}>${i.nome}</option>`)}</select></label>
          <button class="botao primario" id="p-add" onClick=${addProduto}>+ Adicionar</button>
        </div>
      </section>

      <div class="placar">
        <div class="ficha"><div class="ficha-topo"><span class="fonte">Produtos</span></div>
          <span class="ficha-n">${BASE.produtos.length}</span></div>
        <div class="ficha"><div class="ficha-topo"><span class="fonte">Fornecedores com catálogo</span></div>
          <span class="ficha-n">${new Set(BASE.produtos.map((p) => chave(p.fornecedor))).size}</span></div>
        <div class="ficha"><div class="ficha-topo"><span class="fonte">Sem preço na seleção</span></div>
          <span class=${"ficha-n " + (semPreco ? "ficha-r" : "")} id="sem-preco">${semPreco}</span>
          <span class="fonte">Item sem preço trava a OC</span></div>
      </div>

      <section class="cartao">
        <div class="cabeca"><h2>Catálogo</h2>
          <span class="fonte" id="conta-prod">${`${lista.length} de ${BASE.produtos.length}`}</span>
          <span style=${{ flex: 1 }}></span>
          <button class="botao" id="p-importar" onClick=${() => arquivo.current.click()}>Importar planilha</button></div>
        <div class="barra barra-interna">
          <label class="campo campo-largo"><span>Buscar produto ou fornecedor</span>
            <input id="p-busca" value=${filtro.prod} onInput=${(e) => setFiltro({ ...filtro, prod: e.target.value })} onChange=${() => {}}
                   placeholder="nome do produto ou do fornecedor — parte ou nome inteiro" /></label>
          <label class="campo"><span>Fornecedor</span>
            <select id="p-filtro-forn" value=${filtroForn}
              onChange=${(e) => setFiltro({ ...filtro, prodForn: e.target.value })}><option value="">Todos</option>${
              fornsCatalogo.map((s) => html`<option key=${s} value=${s}>${s}</option>`)}</select></label>
        </div>
        <div class="rolagem"><table class="tabela-cad">
          <thead><tr><th style=${{ width: "46px" }}>#</th><th>Fornecedor</th><th>Produto</th>
            <th style=${{ width: "180px" }}>Unidade</th><th style=${{ width: "120px" }}>Preço unit.</th>
            <th style=${{ width: "190px" }} title="Item do pedido consolidado que este produto atende">Item do CDE</th>
            <th style=${{ width: "44px" }}></th></tr></thead>
          <tbody id="corpo-prod">${lista.length ? lista.map(linha)
            : html`<tr><td colSpan="7" class="vazio">Nenhum produto encontrado.</td></tr>`}</tbody>
        </table></div>
      </section>`;
  }

  // ============================================================ UNIDADES COMPRADORAS
  function addUnidade() {
    const f = form.current;
    const k = limpaNome(f.uChave.value);
    const nome = limpaNome(f.uNome.value);
    const cnpj = f.uCnpj.value.trim();
    if (!k || !nome) { aviso("Preencha a chave e o nome.", "mau"); return; }
    const existe = BASE.unidades.find((u) => chave(u.chave) === chave(k));
    const dados = { chave: k, nome, cnpj: cnpj ? formatarCNPJ(cnpj) : "" };
    if (existe) { Object.assign(existe, dados); aviso("Unidade atualizada.", "bom"); }
    else { BASE.unidades.push(Object.assign({ contato: "", email: "", ie: "", tel: "", end: "" }, dados));
           aviso("Unidade cadastrada.", "bom"); }
    [f.uChave, f.uNome, f.uCnpj].forEach((el) => { el.value = ""; });
    agendarSalvar();
    desenhar();
  }

  function telaUnidades() {
    const cel = (reg, campo, valor) => celula("unidades", "chave", reg, campo, valor);
    const linha = (u) => {
      const aberto = detalhe.current === "u:" + u.chave;
      return html`<${Fragment} key=${idDe(u)}><tr data-k=${u.chave}>
          <td>${cel(u, "chave", u.chave)}</td>
          <td>${cel(u, "nome", u.nome)}</td>
          <td>${cel(u, "cnpj", u.cnpj || "")}</td>
          <td>${cel(u, "tel", u.tel || "")}</td>
          ${acoes("unidades", "u:", u, aberto)}
        </tr>${aberto ? html`<tr class="linha-detalhe"><td colSpan="5">
          <div class="grade-oc">
            <label class="campo"><span>Contato</span>${cel(u, "contato", u.contato || "")}</label>
            <label class="campo"><span>E-mail</span>${cel(u, "email", u.email || "")}</label>
            <label class="campo"><span>I.E.</span>${cel(u, "ie", u.ie || "")}</label>
            <label class="campo"><span>Endereço</span>${cel(u, "end", u.end || "")}</label>
          </div>
        </td></tr>` : null}<//>`;
    };
    return html`<section class="cartao">
        <div class="cabeca"><h2>Nova unidade</h2>
          <span class="fonte">A chave é o que numera as OCs — mudar depois recomeça a contagem daquela unidade</span></div>
        <div class="barra barra-interna">
          <label class="campo"><span>Chave *</span><input id="u-chave" ref=${campoForm("uChave")} placeholder="Ex: SENADOR LEMOS" /></label>
          <label class="campo campo-largo"><span>Nome / Razão social *</span><input id="u-nome" ref=${campoForm("uNome")} /></label>
          <label class="campo"><span>CNPJ</span><input id="u-cnpj" ref=${campoForm("uCnpj")} inputmode="numeric" maxlength="18" placeholder="00.000.000/0000-00" onInput=${mascara} /></label>
          <button class="botao primario" id="u-add" onClick=${addUnidade}>+ Cadastrar</button>
        </div>
      </section>

      <section class="cartao">
        <div class="cabeca"><h2>Unidades</h2><span class="fonte">${BASE.unidades.length + " cadastrada(s)"}</span></div>
        <div class="rolagem"><table class="tabela-cad">
          <thead><tr><th>Chave</th><th>Nome / Razão social</th><th>CNPJ</th>
            <th>Telefone</th><th style=${{ width: "78px" }}></th></tr></thead>
          <tbody>${BASE.unidades.length ? BASE.unidades.map(linha)
            : html`<tr><td colSpan="5" class="vazio">Nenhuma unidade cadastrada.</td></tr>`}</tbody>
        </table></div>
      </section>`;
  }

  // ============================================================ planilha
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
      const conta = { f: 0, p: 0, u: 0, ignorados: 0 };
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

  const recarregar = async () => {
    if (!carregado) return;
    if (_fila) await gravarAgora();
    await carregarBase(true); desenhar(); aviso("Cadastro recarregado do disco.", "bom");
  };
  const trocarAba = (t) => { if (!carregado) return; setAba(t); detalhe.current = null; desenhar(); };

  let tela = null;
  if (msgTela) tela = html`<p class="vazio">${msgTela}</p>`;
  else if (carregado) {
    tela = html`<${Fragment} key=${versaoTela}>${aba === "fornecedores" ? telaFornecedores()
      : aba === "produtos" ? telaProdutos() : telaUnidades()}<//>`;
  }

  return html`<main class="main-content">
    <div class="screen-header">
      <div>
        <h1>Cadastros</h1>
        <p>Fornecedores, produtos com preço e unidades compradoras. É a mesma base do
           Gerador de OCs — o que você muda aqui vale nos dois sistemas.</p>
      </div>
      <div class="header-acoes">
        <${Estado} texto=${est.texto} classe=${est.classe} />
        <button class="botao" id="btn-exportar" title="Baixa uma cópia da planilha para backup"
          onClick=${() => { if (carregado) exportarCopia(); }}>Exportar cópia</button>
        <button class="botao" id="btn-recarregar" title="Relê a planilha do disco" onClick=${recarregar}>Recarregar</button>
      </div>
    </div>

    <section class="barra">
      <nav class="abas abas-cad" id="abas">
        ${[["fornecedores", "Fornecedores"], ["produtos", "Produtos e preços"], ["unidades", "Unidades"]].map(([t, r]) =>
          html`<button key=${t} data-t=${t} class=${aba === t ? "ativa" : ""} onClick=${() => trocarAba(t)}>${r}</button>`)}
      </nav>
      <span class="fonte" id="fonte-arquivo">${carregado ? (BASE.compartilhada
        ? "gravando na base compartilhada com o Gerador de OCs"
        : "atenção: base local, não compartilhada com o Gerador de OCs") : ""}</span>
    </section>

    <div id="tela">${tela}</div>
    <input type="file" id="arquivo-import" accept=".xlsx,.xlsm" hidden ref=${arquivo}
      onChange=${(e) => importarPlanilha(e.target)} />
  </main>`;
}

montarTela("cadastros", Cadastros);
