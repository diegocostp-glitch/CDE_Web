// ============================================================================
// Ordens de compra — o módulo completo de geração de OCs.
//
// Três portas de entrada, uma única fila:
//   avulsa    — montada aqui, pelo catálogo do fornecedor (o caminho principal);
//   projecao  — criada ao salvar o pedido na Projeção de Compras;
//   importada — lida de uma planilha ou do PDF da OC em Importar OC.
//
// A Projeção calcula quanto comprar dos 14 insumos que o CDE controla. Ela
// nunca soube de embalagem, gás, material de limpeza ou manutenção — e nem
// deveria, porque não existe contagem diária desses itens para projetar. Por
// isso ela é uma FONTE da fila, não a entrada dela.
//
// A origem de cada item fica gravada: item da projeção é recalculado se o
// pedido for salvo de novo; item incluído à mão sobrevive.
//
// Como na tela antiga, os campos de cada ordem e do catálogo da nova ordem são
// lidos do próprio formulário na hora de salvar, gerar ou ver o PDF; trezentas
// linhas de catálogo não pagam um estado por tecla. E os mesmos redesenhos
// (filtro, troca do fornecedor do cadastro, recarga) refazem os cartões a
// partir do servidor.
//
// O PDF continua saindo pelo js/oc-pdf.js + js/header-img.js (globais
// montarPDF e nomeArquivoOC), sem alteração.
// ============================================================================
import { html, useState, useEffect, useRef, useLayoutEffect } from "../html.js";
import { num, fmt, busca, chave, limpaNome, cnpjValido, brDate, hojeISO, hojeBR } from "../formato.js";
import * as api from "../api.js";
import { avisoCompras as aviso, Estado } from "../componentes/Aviso.js";
import {
  base, carregarBase, salvarBase, produtosDoFornecedor, obsDoFornecedor, fornecedorPorChave,
  unidadePorChave, casarFornecedor, pendenciasDaOC, proximoNumeroOC, reservarNumerosOC,
} from "../base.js";
import { montarTela } from "../montar.js";

let estado = () => {};          // barra de estado da tela (ligada pelo componente)

const SELO_ORIGEM = {
  avulsa: html`<span class="selo neutro" title="Montada direto nesta tela">Avulsa</span>`,
  projecao: html`<span class="selo info" title="Veio do pedido salvo na Projeção de Compras">Projeção</span>`,
  importada: html`<span class="selo info" title="Lida de planilha ou do PDF da OC">Importada</span>`,
};

// Formas de pagamento e frete: as mesmas opções do Gerador de OCs, para a OC
// não sair com uma condição que a outra ponta não reconhece.
const PAGAMENTOS = ["Boleto", "Cartão de Crédito", "Cartão de Débito", "Pix", "Dinheiro", "Bonificação"];
const FRETES = ["CIF", "FOB", "-"];
const PARCELAS = Array.from({ length: 24 }, (_, i) => (i + 1) + "x");

// ------------------------------------------------------------- leitura do formulário
// Soma os subtotais e o total direto nos campos do cartão (como antes: os
// números moram nos campos até a ordem ser salva).
function somar(cart) {
  if (!cart) return;
  let total = 0;
  cart.querySelectorAll(".tabela-itens tbody tr").forEach((tr) => {
    const q = num(tr.querySelector('[data-c="qtd"]').value);
    const p = num(tr.querySelector('[data-c="preco"]').value);
    const s = q * p;
    total += s;
    tr.querySelector(".sub").textContent = s > 0 ? "R$ " + fmt(s) : "—";
  });
  const alvo = cart.querySelector(".total-geral");
  if (alvo) alvo.innerHTML = total > 0 ? "<strong>R$ " + fmt(total) + "</strong>" : "—";
}

function lerItens(cart, o) {
  return [...cart.querySelectorAll(".tabela-itens tbody tr")].map((tr, n) => {
    const campo = (c) => { const el = tr.querySelector(`[data-c="${c}"]`); return el ? el.value : ""; };
    const antigo = o.itens[Number(tr.dataset.n)];
    const daProjecao = antigo && antigo.origem === "projecao" && !tr.querySelector('[data-c="nome"]');
    return {
      chave: daProjecao ? antigo.chave : (antigo ? antigo.chave : "manual_" + n),
      nome: daProjecao ? antigo.nome : limpaNome(campo("nome")),
      un: campo("un"), qtd: num(campo("qtd")), preco: num(campo("preco")),
      origem: daProjecao ? "projecao" : "manual",
    };
  });
}

function lerOC(cart) {
  const d = {};
  cart.querySelectorAll("[data-oc]").forEach((el) => { d[el.dataset.oc] = el.value.trim(); });
  return d;
}

// Monta o objeto que o PDF consome. A unidade vem do cadastro pela chave
// gravada na ordem; o fornecedor, do cadastro escolhido nela.
function dadosDoPDF(cart, o, numero) {
  const uni = unidadePorChave(o.unidade_oc) || {};
  const forn = fornecedorPorChave(o.fornecedor_base) || {};
  const d = lerOC(cart);
  // A observação fixa do fornecedor entra sempre; a da ordem vem depois dela.
  const obs = [obsDoFornecedor(o.fornecedor_base),
               cart.querySelector('[data-c="obs"]').value.trim()].filter(Boolean).join(" | ");
  return Object.assign({}, d, {
    numero: numero, unidade: uni, fornecedor: forn, fornecedorNome: o.fornecedor,
    obs: obs, itens: lerItens(cart, o),
  });
}

// Prazo digitado na OC volta para o cadastro do fornecedor — é dado dele, não
// desta ordem. Só grava quando mudou, para não reescrever a planilha à toa.
async function persistirPrazos(chaveForn, d) {
  const f = fornecedorPorChave(chaveForn);
  if (!f) return;
  let mudou = false;
  if (d.prazoFaturado !== undefined && (f.prazoFat || "") !== d.prazoFaturado) {
    f.prazoFat = d.prazoFaturado; mudou = true;
  }
  if (d.prazoEntrega !== undefined && (f.prazoEntrega || "") !== d.prazoEntrega) {
    f.prazoEntrega = d.prazoEntrega; mudou = true;
  }
  if (mudou) {
    try { await salvarBase(estado); } catch (e) { console.warn("prazo não gravado no cadastro:", e); }
  }
}

// ------------------------------------------------------------- cartão da ordem
let proximaLinha = 0;
const linhasDe = (o) => o.itens.map((i, n) => ({ id: ++proximaLinha, n, i }));

// Campos que só a Ordem de Compra usa. Abertos enquanto a ordem está pendente:
// no dia a dia, os padrões (Boleto, 1x, CIF, prazos do cadastro) resolvem.
function CamposOC({ o }) {
  const f = fornecedorPorChave(o.fornecedor_base) || {};
  const d = o.oc || {};
  const opc = (lista) => lista.map((v) => html`<option key=${v} value=${v}>${v}</option>`);
  return html`<details class="bloco-oc" open=${o.situacao !== "gerada"}>
    <summary>Dados da Ordem de Compra${o.numero_oc ? html`${" "}<span class="selo bom">${"Nº " + o.numero_oc}</span>` : null}</summary>
    <div class="grade-oc">
      <label class="campo"><span>Data de emissão</span>
        <input data-oc="dataEmissao" type="text" defaultValue=${d.dataEmissao || hojeBR()} /></label>
      <label class="campo"><span>Previsão de entrega</span>
        <input data-oc="dataEntrega" type="text" placeholder="dd/mm/aaaa" defaultValue=${d.dataEntrega || ""} /></label>
      <label class="campo"><span>Horário de recebimento</span>
        <input data-oc="horario" type="text" placeholder="Ex: 08h às 11h" defaultValue=${d.horario || ""} /></label>
      <label class="campo"><span>Forma de pagamento</span>
        <select data-oc="pagamento" defaultValue=${d.pagamento || "Boleto"}>${opc(PAGAMENTOS)}</select></label>
      <label class="campo"><span>Nº de parcelas</span>
        <select data-oc="parcelas" defaultValue=${d.parcelas || "1x"}>${opc(PARCELAS)}</select></label>
      <label class="campo"><span>Frete</span>
        <select data-oc="frete" defaultValue=${d.frete || "CIF"}>${opc(FRETES)}</select></label>
      <label class="campo"><span>Prazo (faturado)</span>
        <input data-oc="prazoFaturado" type="text" defaultValue=${d.prazoFaturado ?? f.prazoFat ?? ""} /></label>
      <label class="campo"><span>Prazo de entrega</span>
        <input data-oc="prazoEntrega" type="text" defaultValue=${d.prazoEntrega ?? f.prazoEntrega ?? ""} /></label>
      <label class="campo"><span>Entrega na transportadora</span>
        <input data-oc="transportadora" type="text" placeholder="dd/mm/aaaa" defaultValue=${d.transportadora || ""} /></label>
      <label class="campo"><span>Nº da OC (vazio = automático)</span>
        <input data-oc="numero_manual" type="number" min="1" placeholder="automático"
               defaultValue=${d.numero_manual || ""} /></label>
    </div>
  </details>`;
}

function CorpoOrdem({ o, cartRef, acoes }) {
  const BASE = base();
  const [linhas, setLinhas] = useState(() => linhasDe(o));
  const buscaItem = useRef(null);
  // a soma usa o próprio corpo: o ref do cartão (o pai) ainda não está ligado
  // quando o corpo acaba de nascer
  const corpo = useRef(null);
  const catalogo = produtosDoFornecedor(o.fornecedor_base);
  const obsFixa = obsDoFornecedor(o.fornecedor_base);
  const fornSel = (BASE.fornecedores.find((f) => chave(f.chave) === chave(o.fornecedor_base)) || {}).chave || "";
  useLayoutEffect(() => { somar(corpo.current); }, [linhas]);

  const incluir = () => {
    const campo = buscaItem.current;
    const nome = limpaNome(campo.value);
    if (!nome) { campo.focus(); return; }
    const achado = catalogo.find((p) => chave(p.produto) === chave(nome));
    // a linha nova leva o número de ordem que a tabela tem agora, como antes
    setLinhas((ls) => ls.concat([{ id: ++proximaLinha, n: ls.length, novo: true,
      i: { nome: achado ? achado.produto : nome, un: achado ? achado.un : "Un", qtd: 1, preco: achado ? achado.preco : 0 } }]));
    campo.value = ""; campo.focus();
    if (!achado && o.fornecedor_base) aviso("Item fora do catálogo — confira o preço antes de gerar.", "");
  };

  return html`<div class="ordem-corpo" ref=${corpo} onInput=${(e) => { if (e.target.matches('[data-c="qtd"],[data-c="preco"]')) somar(corpo.current); }}>
    <div class="barra barra-interna">
      <label class="campo"><span>Fornecedor no cadastro</span><select data-c="fornecedor_base" defaultValue=${fornSel}
        onChange=${(e) => acoes.trocarFornecedor(o, e.target.value)}><option value="">— escolher cadastro —</option>${
        BASE.fornecedores.map((f) => html`<option key=${f.chave} value=${f.chave}>${f.chave + " — " + f.razao}</option>`)}</select></label>
      <label class="campo campo-largo"><span>Observação da ordem</span>
        <input data-c="obs" type="text" defaultValue=${o.obs || ""} placeholder="prazo, condição de pagamento, instrução de entrega…" /></label>
    </div>
    ${o.sem_cadastro ? html`<p class="nota-aviso">O nome <strong>${o.fornecedor}</strong> não está vinculado a
      nenhum cadastro. Escolha acima para a ordem sair com CNPJ e endereço — sem isso a OC não pode ser gerada.</p>` : null}
    ${obsFixa ? html`<p class="nota-info"><strong>Observação fixa deste fornecedor:</strong>${" " + obsFixa}<span class="fonte"> — entra na OC automaticamente</span></p>` : null}

    <div class="rolagem"><table class="tabela-itens">
      <thead><tr><th>Item</th><th>Un.</th><th>Quantidade</th><th>Preço unit.</th><th>Subtotal</th><th></th></tr></thead>
      <tbody>${linhas.map((l) => html`<tr key=${l.id} data-n=${l.n}>
        <td>${!l.novo && l.i.origem === "projecao"
          ? html`${l.i.nome + " "}<span class="selo-mini" title="Veio do cálculo da Projeção — será recalculado se o pedido for salvo de novo">Projeção</span>`
          : html`<input data-c="nome" type="text" defaultValue=${l.i.nome} style=${{ width: "100%" }} />`}</td>
        <td><input data-c="un" type="text" defaultValue=${l.i.un} style=${{ width: "74px" }} /></td>
        <td><input data-c="qtd" type="text" inputmode="decimal" defaultValue=${fmt(num(l.i.qtd), 3)} style=${{ width: "90px" }} /></td>
        <td><input data-c="preco" type="text" inputmode="decimal" defaultValue=${fmt(num(l.i.preco))} style=${{ width: "96px" }} /></td>
        <td class="calc sub"></td>
        <td><button class="botao-mini remover" title="Remover item" onClick=${() => setLinhas((ls) => ls.filter((x) => x.id !== l.id))}>✕</button></td>
      </tr>`)}</tbody>
      <tfoot><tr><td colSpan="4" class="calc"><strong>Total</strong></td>
        <td class="calc total-geral"></td><td></td></tr></tfoot>
    </table></div>

    <div class="add-item">
      <label class="campo campo-largo"><span>Incluir item deste fornecedor</span>
        <input type="text" class="busca-item" list=${"cat-" + o.id} ref=${buscaItem}
          placeholder="digite para buscar no catálogo, ou escreva um item novo"
          onKeyDown=${(e) => { if (e.key === "Enter") { e.preventDefault(); incluir(); } }} />
        <datalist id=${"cat-" + o.id}>${catalogo.map((p, n) =>
          html`<option key=${n} value=${p.produto}>${p.un + " · R$ " + fmt(p.preco)}</option>`)}</datalist>
      </label>
      <button class="botao add" onClick=${incluir}>Incluir</button>
      <span class="fonte">${catalogo.length + " produto(s) no catálogo deste fornecedor"}</span>
    </div>

    <${CamposOC} o=${o} />

    <div class="ordem-acoes">
      <button class="botao excluir" onClick=${() => acoes.excluir(o)}>Excluir ordem</button>
      <span style=${{ flex: 1 }}></span>
      <button class="botao salvar" onClick=${() => acoes.salvar(cartRef.current, o, {})}>Salvar alterações</button>
      <button class="botao previa" onClick=${() => acoes.verPDF(cartRef.current, o)}>Ver PDF</button>
      ${o.situacao === "pendente"
        ? html`<button class="botao primario gerar" onClick=${() => acoes.gerarOC(cartRef.current, o)}>Gerar OC</button>`
        : html`<button class="botao reabrir" onClick=${() => acoes.salvar(cartRef.current, o, { situacao: "pendente" })}>Reabrir</button>`}
    </div>
  </div>`;
}

function CartaoOrdem({ o, aberta, alternar, acoes }) {
  const cartRef = useRef(null);
  const total = o.itens.reduce((s, i) => s + num(i.qtd) * num(i.preco), 0);
  return html`<section class="cartao ordem" data-id=${o.id} ref=${cartRef}>
    <div class="cabeca ordem-cabeca" data-abrir=${o.id} onClick=${alternar}>
      <div class="ordem-tit">
        <h2>${o.fornecedor}</h2>
        <span class="fonte">${`${o.casa_nome} · pedido de ${brDate(o.data)} · ${o.itens.length} item(ns)`}</span>
      </div>
      <div class="ficha-vals ordem-total">
        <span class="ficha-n">${total > 0 ? "R$ " + fmt(total) : "—"}</span>
        <span class="fonte">${total > 0 ? "valor estimado" : "sem preços"}</span>
      </div>
      ${SELO_ORIGEM[o.origem || "projecao"] || null}
      ${o.situacao === "gerada" ? html`<span class="selo bom">Gerada</span>` : html`<span class="selo aviso">Pendente</span>`}
      ${o.sem_cadastro ? html`<span class="selo ruim" title="Este fornecedor não está vinculado a um cadastro">Sem cadastro</span>` : null}
      <span class="ordem-chev">${aberta ? "▾" : "▸"}</span>
    </div>
    ${aberta ? html`<${CorpoOrdem} o=${o} cartRef=${cartRef} acoes=${acoes} />` : null}
  </section>`;
}

// ============================================================================
// NOVA ORDEM — fornecedor, catálogo dele, quantidades. Nasce como ordem
// pendente igual às outras: daí para frente o fluxo é o mesmo cartão, o mesmo
// PDF e a mesma numeração compartilhada.
// ============================================================================
// O catálogo do fornecedor escolhido. Quantidade, preço e unidade moram nos
// campos (são trezentas linhas): marcar, filtrar e somar mexem direto neles.
function Catalogo({ fornecedor, raiz, redesenho, aoMudar }) {
  const produtos = produtosDoFornecedor(fornecedor.chave);
  const linhas = () => raiz.current ? [...raiz.current.querySelectorAll(".tabela-catalogo tbody tr")] : [];
  const filtrar = () => {
    const el = raiz.current && raiz.current.querySelector("#nova-busca");
    const q = busca(el ? el.value.trim() : "");
    let vis = 0;
    linhas().forEach((tr) => {
      const casa = !q || busca(tr.querySelector(".nome-prod").textContent).includes(q);
      // linha com quantidade nunca é escondida pelo filtro: esconder o que já foi
      // pedido é o caminho mais curto para emitir OC sem um item
      const pedida = num(tr.querySelector('[data-k="qtd"]').value) > 0;
      tr.hidden = !(casa || pedida);
      if (!tr.hidden) vis++;
    });
    const c = raiz.current && raiz.current.querySelector("#nova-contagem");
    if (c) c.textContent = vis + " produto(s) à vista";
  };
  // Cada "redesenho" (item fora do catálogo incluído ou tirado) devolve a busca
  // ao vazio e refaz a soma — como a tela antiga, que refazia o painel inteiro
  // guardando só as quantidades digitadas.
  useLayoutEffect(() => {
    const el = raiz.current.querySelector("#nova-busca");
    if (el) el.value = "";
    filtrar();
    aoMudar();
  }, [redesenho]);

  const pend = [];
  if (!limpaNome(fornecedor.razao)) pend.push("razão social");
  if (!cnpjValido(fornecedor.cnpj)) pend.push("CNPJ válido");
  const obsFixa = obsDoFornecedor(fornecedor.chave);

  // Marcar a linha e digitar quantidade são o mesmo gesto: quem digita
  // quantidade quer o item, e quem marca vai querer quantidade 1.
  const aoDigitar = (e) => {
    const tr = e.target.closest("tr");
    if (!tr) return;
    if (e.target.matches('[data-k="qtd"]')) tr.querySelector(".marca").checked = num(e.target.value) > 0;
    aoMudar();
  };
  const aoMarcar = (e) => {
    const tr = e.target.closest("tr");
    const q = tr.querySelector('[data-k="qtd"]');
    if (e.target.checked && !num(q.value)) { q.value = "1,000"; q.focus(); q.select(); }
    if (!e.target.checked) q.value = "";
    aoMudar();
  };
  const limpar = () => {
    linhas().forEach((tr) => { tr.querySelector('[data-k="qtd"]').value = ""; tr.querySelector(".marca").checked = false; });
    aoMudar();
  };

  return html`
    ${pend.length ? html`<p class="nota-aviso">O cadastro de <strong>${fornecedor.chave}</strong> está incompleto:
      falta ${pend.join(" e ")}. Dá para montar a ordem, mas a OC só sai depois de
      completar em <a href="cadastros.html">Cadastros</a>.</p>` : null}
    ${obsFixa ? html`<p class="nota-info"><strong>Observação fixa:</strong>${" " + obsFixa}</p>` : null}

    <div class="barra barra-interna">
      <label class="campo campo-largo"><span>Buscar produto</span>
        <input type="text" id="nova-busca" placeholder="parte do nome do produto" onInput=${filtrar} /></label>
      <span class="fonte" id="nova-contagem"></span>
      <span style=${{ flex: 1 }}></span>
      <button class="botao" id="nova-limpar" onClick=${limpar}>Limpar quantidades</button>
    </div>

    ${produtos.length ? html`<div class="rolagem"><table class="tabela-itens tabela-catalogo">
      <thead><tr><th style=${{ width: "34px" }}></th><th>Produto</th><th>Un.</th>
        <th>Preço unit.</th><th>Quantidade</th><th>Subtotal</th></tr></thead>
      <tbody onInput=${aoDigitar} onChange=${(e) => { if (e.target.matches(".marca")) aoMarcar(e); }}>${produtos.map((p, n) => html`
        <tr key=${n} data-p=${n}>
          <td><input type="checkbox" class="marca" /></td>
          <td class="nome-prod">${p.produto}</td>
          <td><input data-k="un" type="text" defaultValue=${p.un} style=${{ width: "110px" }} /></td>
          <td><input data-k="preco" type="text" inputmode="decimal" defaultValue=${fmt(p.preco)} style=${{ width: "96px" }} /></td>
          <td><input data-k="qtd" type="text" inputmode="decimal" placeholder="0" style=${{ width: "90px" }} /></td>
          <td class="calc sub">—</td>
        </tr>`)}</tbody>
      <tfoot><tr><td colSpan="5" class="calc"><strong>Total da ordem</strong></td>
        <td class="calc total-nova">—</td></tr></tfoot>
    </table></div>`
    : html`<p class="vazio">${fornecedor.chave + " ainda não tem produto no catálogo."}<br /><span class="fonte">Cadastre os produtos em <a href="cadastros.html">Cadastros</a>,
        ou inclua os itens à mão abaixo.</span></p>`}`;
}

function NovaOrdem({ aberto, focar, fechar, criada }) {
  const BASE = base();
  const [iniciado, setIniciado] = useState(false);
  const [fornecedor, setFornecedor] = useState(null);
  const [extras, setExtras] = useState([]);      // itens fora do catálogo
  const [redesenho, setRedesenho] = useState(0);
  // cada abertura refaz o catálogo (as quantidades digitadas antes se perdem,
  // como na tela antiga); o fornecedor e os itens fora do catálogo ficam
  const [aberturas, setAberturas] = useState(0);
  const [placeholderNumero, setPlaceholderNumero] = useState("automático");
  const secao = useRef(null);
  const caixaCatalogo = useRef(null);
  const campo = useRef({});
  const ref = (nome) => (el) => { campo.current[nome] = el; };

  const mostrarProximoNumero = async () => {
    const n = await proximoNumeroOC(campo.current.unidade.value);
    setPlaceholderNumero(n ? "automático (próximo: " + n + ")" : "automático");
  };
  // Ao abrir: o próximo número da unidade, o catálogo de novo, e o foco no
  // fornecedor.
  useEffect(() => {
    if (!aberto) return;
    if (!iniciado) setIniciado(true);
    setAberturas((n) => n + 1);
    setRedesenho((r) => r + 1);
  }, [aberto, focar]);
  useLayoutEffect(() => {
    if (!aberto || !iniciado) return;
    mostrarProximoNumero();
    secao.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (campo.current.forn) campo.current.forn.focus();
  }, [aberto, focar, iniciado]);

  // Fornecedor digitado no combo. Aceita apelido ou razão social — quem digita
  // "hortifruti" não precisa saber que o apelido cadastrado é outro.
  const escolherFornecedor = (texto) => {
    const f = fornecedorPorChave(texto) || casarFornecedor(texto);
    setFornecedor((limpaNome(texto) && f) ? f : null);
    setExtras([]);
    setRedesenho((r) => r + 1);
  };

  const raizCatalogo = () => secao.current;
  const itensDaNova = () => {
    const fora = [];
    raizCatalogo().querySelectorAll(".tabela-catalogo tbody tr").forEach((tr) => {
      const q = num(tr.querySelector('[data-k="qtd"]').value);
      if (q <= 0) return;
      fora.push({ nome: tr.querySelector(".nome-prod").textContent,
                  un: tr.querySelector('[data-k="un"]').value,
                  qtd: q, preco: num(tr.querySelector('[data-k="preco"]').value) });
    });
    return extras.concat(fora);
  };
  const somarNova = () => {
    let total = 0;
    raizCatalogo().querySelectorAll(".tabela-catalogo tbody tr").forEach((tr) => {
      const s = num(tr.querySelector('[data-k="qtd"]').value) * num(tr.querySelector('[data-k="preco"]').value);
      total += s;
      tr.querySelector(".sub").textContent = s > 0 ? "R$ " + fmt(s) : "—";
    });
    extras.forEach((i) => { total += i.qtd * i.preco; });
    const alvo = raizCatalogo().querySelector(".total-nova");
    if (alvo) alvo.innerHTML = total > 0 ? "<strong>R$ " + fmt(total) + "</strong>" : "—";
    const st = raizCatalogo().querySelector("#nova-status");
    if (st) {
      const n = itensDaNova().length;
      st.textContent = n
        ? `${n} item(ns) · R$ ${fmt(total)}` + (extras.length ? ` · ${extras.length} fora do catálogo` : "")
        : "marque os itens ou preencha as quantidades";
    }
  };
  useLayoutEffect(() => { if (fornecedor) somarNova(); }, [extras]);

  // Itens fora do catálogo ficam numa tabela à parte: são poucos e precisam ficar
  // visíveis, senão somem no meio de trezentos produtos.
  const incluirExtra = () => {
    const c = campo.current;
    const nome = limpaNome(c.extra.value);
    if (!nome) { c.extra.focus(); return; }
    setExtras((x) => x.concat([{ nome, un: c.extraUn.value.trim() || "Un",
      qtd: num(c.extraQtd.value), preco: num(c.extraPreco.value) }]));
    setRedesenho((r) => r + 1);
    aviso("Item incluído fora do catálogo — confira o preço.", "");
  };

  async function criarOrdem() {
    const f = fornecedor;
    const itens = itensDaNova();
    if (!f) { aviso("Escolha o fornecedor.", "mau"); return; }
    if (!itens.length) { aviso("Nenhum item com quantidade preenchida.", "mau"); return; }
    estado("Criando ordem…");
    try {
      const r = await (await api.postOrdemNova({
        unidade_oc: campo.current.unidade.value,
        fornecedor: f.chave, fornecedor_base: f.chave,
        data: campo.current.data.value || hojeISO(),
        origem: "avulsa",
        oc: { dataEmissao: hojeBR(), numero_manual: campo.current.numero.value.trim(),
              prazoFaturado: f.prazoFat || "", prazoEntrega: f.prazoEntrega || "" },
        itens,
      })).json();
      if (!r.ok) throw new Error(r.erro || "erro no servidor");
      setFornecedor(null); setExtras([]);
      campo.current.forn.value = ""; campo.current.numero.value = "";
      fechar();
      await criada(r.id);
    } catch (e) {
      estado("Falha ao criar", "erro");
      aviso("Não consegui criar a ordem: " + e.message, "mau");
    }
  }

  // Recolhido por padrão: no dia a dia, quem abre esta tela vem terminar ordem
  // pendente.
  return html`<section class="cartao" id="painel-nova" hidden=${!aberto} ref=${secao}>
    <div class="cabeca">
      <h2>Nova ordem de compra</h2>
      <span class="fonte">Escolha o fornecedor e marque os itens</span>
      <button class="botao-mini" id="fechar-nova" title="Fechar" onClick=${fechar}>✕</button>
    </div>

    <div class="barra barra-interna">
      <label class="campo campo-largo"><span>Fornecedor</span>
        <span id="slot-forn">${iniciado ? html`<input class="combo" id="nova-forn" list="nova-forn-lista" autocomplete="off"
            placeholder="digite as primeiras letras do fornecedor" ref=${ref("forn")}
            onInput=${(e) => escolherFornecedor(e.target.value)} />
          <datalist id="nova-forn-lista">${BASE.fornecedores.map((f) =>
            html`<option key=${f.chave} value=${f.chave}>${f.razao || ""}</option>`)}</datalist>` : null}</span></label>
      <label class="campo"><span>Unidade compradora</span>
        <select id="nova-unidade" ref=${ref("unidade")} onChange=${mostrarProximoNumero}>${iniciado
          ? BASE.unidades.map((u) => html`<option key=${u.chave} value=${u.chave}>${u.chave}</option>`) : null}</select></label>
      <label class="campo"><span>Data do pedido</span>
        <input type="date" id="nova-data" ref=${ref("data")} defaultValue=${hojeISO()} /></label>
      <label class="campo"><span>Nº da OC</span>
        <input type="number" id="nova-numero" min="1" placeholder=${placeholderNumero} style=${{ width: "120px" }} ref=${ref("numero")} /></label>
    </div>

    <div id="nova-catalogo" ref=${caixaCatalogo}>${!fornecedor
      ? html`<p class="vazio">Escolha um fornecedor do cadastro para ver o catálogo dele.<br /><span class="fonte">Fornecedor novo? Cadastre em <a href="cadastros.html">Cadastros</a> — a OC precisa de CNPJ e razão social para valer.</span></p>`
      : html`<${Catalogo} key=${fornecedor.chave + "|" + aberturas} fornecedor=${fornecedor} raiz=${caixaCatalogo} redesenho=${redesenho} aoMudar=${somarNova} />

        ${extras.length ? html`<div class="rolagem"><table class="tabela-itens tabela-extras">
          <thead><tr><th>Item fora do catálogo</th><th>Un.</th><th>Quantidade</th>
            <th>Preço unit.</th><th>Subtotal</th><th></th></tr></thead>
          <tbody>${extras.map((i, n) => html`
            <tr key=${n}><td>${i.nome}</td><td>${i.un}</td><td>${fmt(i.qtd, 3)}</td>
            <td>${"R$ " + fmt(i.preco)}</td><td class="calc">${i.qtd * i.preco > 0 ? "R$ " + fmt(i.qtd * i.preco) : "—"}</td>
            <td><button class="botao-mini tira-extra" data-n=${n} title="Remover"
              onClick=${() => { setExtras((x) => x.filter((_, k) => k !== n)); setRedesenho((r) => r + 1); }}>✕</button></td></tr>`)}
          </tbody></table></div>` : null}

        <div class="add-item" key=${"extra" + redesenho}>
          <label class="campo campo-largo"><span>Incluir item fora do catálogo</span>
            <input type="text" id="nova-extra" placeholder="nome do item" ref=${ref("extra")}
              onKeyDown=${(e) => { if (e.key === "Enter") { e.preventDefault(); incluirExtra(); } }} /></label>
          <label class="campo"><span>Un.</span><input type="text" id="nova-extra-un" defaultValue="Un" style=${{ width: "80px" }} ref=${ref("extraUn")} /></label>
          <label class="campo"><span>Qtd.</span><input type="text" id="nova-extra-qtd" inputmode="decimal" defaultValue="1,000" style=${{ width: "90px" }} ref=${ref("extraQtd")} /></label>
          <label class="campo"><span>Preço</span><input type="text" id="nova-extra-preco" inputmode="decimal" defaultValue="0,00" style=${{ width: "96px" }} ref=${ref("extraPreco")} /></label>
          <button class="botao" id="nova-add" onClick=${incluirExtra}>Incluir</button>
        </div>

        <div class="ordem-acoes">
          <span class="fonte" id="nova-status"></span>
          <span style=${{ flex: 1 }}></span>
          <button class="botao" id="nova-cancelar" onClick=${() => { setFornecedor(null); setExtras([]); fechar(); }}>Cancelar</button>
          <button class="botao primario" id="nova-criar" onClick=${criarOrdem}>Criar ordem</button>
        </div>`}</div>
  </section>`;
}

// ------------------------------------------------------------------ tela
function Ordens() {
  const [ordens, setOrdens] = useState([]);
  const [carregou, setCarregou] = useState(false);
  const [msgLista, setMsgLista] = useState(null);
  const [aberta, setAberta] = useState(null);
  const abertaRef = useRef(null);
  const [filtro, setFiltro] = useState({ situacao: "pendente", unidade: "", origem: "", busca: "" });
  const filtroRef = useRef(filtro);
  const [versao, setVersao] = useState(0);      // "desenhar": os cartões são refeitos
  const desenhar = () => setVersao((v) => v + 1);
  const opcoesUnidade = useRef(null);
  const [nova, setNova] = useState({ aberto: false, vez: 0 });
  const rolarAte = useRef(null);
  const [est, setEst] = useState({ texto: "", classe: "" });
  estado = (texto, classe) => setEst({ texto: texto || "", classe: classe || "" });
  const abrir = (id) => { abertaRef.current = id; setAberta(id); };

  async function carregar() {
    estado("Carregando…");
    let r;
    try {
      const sit = filtroRef.current.situacao;
      [r] = await Promise.all([
        api.getOrdens(sit).then((x) => x.json()),
        carregarBase(),
      ]);
    } catch (e) {
      setMsgLista("Servidor fora do ar. Rode o Servidor.bat.");
      estado(""); return;
    }
    estado("");
    if (base().erro) aviso("Cadastro indisponível: " + base().erro, "mau");
    if (!opcoesUnidade.current) opcoesUnidade.current = base().unidades.map((u) => u.chave);
    setMsgLista(null);
    setOrdens(r.ordens || []);
    setCarregou(true);
    desenhar();
    return r.ordens || [];
  }

  // A Projeção manda "?f=Fornecedor" ao clicar em Editar OC. Se houver uma
  // ordem pendente desse fornecedor, ela já abre — quem clicou lá quer editar
  // esta ordem, não procurar de novo numa lista.
  useEffect(() => {
    carregar().then((lista) => {
      if (!lista) return;
      const p = new URLSearchParams(location.search);
      if (p.get("nova") !== null) { setNova((n) => ({ aberto: true, vez: n.vez + 1 })); history.replaceState(null, "", "ordens.html"); return; }
      const alvo = p.get("f");
      if (!alvo) return;
      const achada = lista.find((o) => chave(o.fornecedor) === chave(alvo));
      if (achada) abrir(achada.id);
      else aviso(`Nenhuma ordem pendente de ${alvo}. Salve o pedido na Projeção.`, "");
      history.replaceState(null, "", "ordens.html");   // não reabre no F5
      desenhar();
    });
  }, []);

  useLayoutEffect(() => {
    if (!rolarAte.current) return;
    const cart = document.querySelector(`.ordem[data-id="${CSS.escape(rolarAte.current)}"]`);
    rolarAte.current = null;
    if (cart) cart.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // ---- ações de um cartão
  async function salvar(cart, o, extra) {
    const corpoReq = Object.assign({
      id: o.id, itens: lerItens(cart, o),
      fornecedor_base: cart.querySelector('[data-c="fornecedor_base"]').value || null,
      obs: cart.querySelector('[data-c="obs"]').value,
      oc: lerOC(cart),
    }, extra);
    estado("Salvando…");
    try {
      const r = await (await api.postOrdem(corpoReq)).json();
      if (!r.ok) throw new Error(r.erro || "erro no servidor");
      estado("Salvo", "ok");
      if (extra.situacao !== "gerada") aviso("Alterações salvas.", "bom");
      await carregar();
    } catch (e) {
      estado("Falha ao salvar", "erro");
      aviso("Não consegui salvar: " + e.message, "mau");
    }
  }
  async function excluir(o) {
    const daProjecao = (o.origem || "projecao") === "projecao";
    if (!confirm(`Excluir a ordem de ${o.fornecedor} (${o.casa_nome}, ${brDate(o.data)})?\n` +
        (daProjecao
          ? "Os itens incluídos à mão serão perdidos. Salvar o pedido na Projeção recria a ordem só com os itens calculados."
          : "Esta ordem não vem da Projeção — não há como recriá-la automaticamente."))) return;
    try {
      const r = await (await api.postOrdem({ id: o.id, excluir: true })).json();
      if (!r.ok) throw new Error(r.erro || "erro no servidor");
      abrir(null);
      aviso("Ordem excluída.", "bom");
      await carregar();
    } catch (e) { aviso("Não consegui excluir: " + e.message, "mau"); }
  }
  function verPDF(cart, o) {
    const itens = lerItens(cart, o).filter((i) => i.qtd > 0);
    if (!itens.length) { aviso("Nenhum item com quantidade preenchida.", "mau"); return; }
    // prévia não reserva número: mostra o próximo só para conferência
    montarPDF(dadosDoPDF(cart, o, o.numero_oc || "prévia"), true);
  }
  async function gerarOC(cart, o) {
    const itens = lerItens(cart, o).filter((i) => i.qtd > 0);
    if (!itens.length) { aviso("Nenhum item com quantidade preenchida.", "mau"); return; }
    // Mesma trava do Gerador de OCs: OC sem CNPJ válido é nota recusada na
    // portaria, e item sem preço é conferência impossível na entrega.
    const pend = pendenciasDaOC(cart.querySelector('[data-c="fornecedor_base"]').value, itens);
    if (pend.length) {
      aviso("Não é possível gerar a OC — falta: " + pend.join(" · ") + ".", "mau");
      return;
    }
    if (!o.unidade_oc) { aviso("Ordem sem unidade compradora definida.", "mau"); return; }
    const d = lerOC(cart);
    estado("Reservando número…");
    try {
      // O número vem do registro compartilhado com o Gerador: é o mesmo contador,
      // então a OC daqui não repete a numeração de lá.
      const numeros = await reservarNumerosOC(o.unidade_oc,
        [{ fornecedor: o.fornecedor, data: d.dataEmissao }], d.numero_manual);
      const numero = numeros[0];
      const doc = montarPDF(dadosDoPDF(cart, o, numero), false);
      doc.save(nomeArquivoOC(numero, o.unidade_oc, o.fornecedor) + ".pdf");
      await persistirPrazos(cart.querySelector('[data-c="fornecedor_base"]').value, d);
      await salvar(cart, o, { situacao: "gerada", numero_oc: numero });
      aviso("OC nº " + numero + " gerada e baixada.", "bom");
    } catch (e) {
      estado("Falha ao gerar", "erro");
      aviso("Não consegui gerar a OC: " + e.message, "mau");
    }
  }
  const trocarFornecedor = (o, valor) => {
    o.fornecedor_base = valor || null;
    o.sem_cadastro = !o.fornecedor_base;
    desenhar();                      // o catálogo do datalist depende disso
  };
  const acoes = { salvar, excluir, verPDF, gerarOC, trocarFornecedor };

  const criada = async (id) => {
    // A ordem já abre: quem acabou de montar quer conferir os dados da OC e gerar.
    abrir(id);
    filtroRef.current = { ...filtroRef.current, situacao: "pendente" };
    setFiltro(filtroRef.current);
    await carregar();
    aviso("Ordem criada. Confira os dados da OC e gere o PDF.", "bom");
    rolarAte.current = id;
    desenhar();
  };

  // ---- lista
  const visiveis = ordens.filter((o) => {
    if (filtro.unidade && chave(o.unidade_oc) !== chave(filtro.unidade)) return false;
    if (filtro.origem && (o.origem || "projecao") !== filtro.origem) return false;
    const q = busca(filtro.busca.trim());
    if (q && !busca(o.fornecedor).includes(q) && !o.itens.some((i) => busca(i.nome).includes(q))) return false;
    return true;
  });
  const totItens = visiveis.reduce((s, o) => s + o.itens.length, 0);
  const valor = visiveis.reduce((s, o) => s + o.itens.reduce((t, i) => t + num(i.qtd) * num(i.preco), 0), 0);
  const semCad = visiveis.filter((o) => o.sem_cadastro).length;
  const resumo = carregou && visiveis.length
    ? `${visiveis.length} ordem(ns) · ${totItens} item(ns)` + (valor > 0 ? ` · R$ ${fmt(valor)}` : "")
      + (semCad ? ` · ${semCad} sem cadastro de fornecedor` : "")
    : "";
  const mudarFiltro = (mudanca, recarregar) => {
    filtroRef.current = { ...filtroRef.current, ...mudanca };
    setFiltro(filtroRef.current);
    if (recarregar) { abrir(null); carregar(); } else desenhar();
  };

  let lista = null;
  if (msgLista) lista = html`<p class="vazio">${msgLista}</p>`;
  else if (carregou) {
    lista = !visiveis.length
      ? html`<p class="vazio">Nenhuma ordem nesta situação.<br />Use <strong>+ Nova ordem</strong> para montar uma agora, ou traga o pedido da${" "}<a href="compras.html">Projeção de Compras</a> ou de <a href="importar.html">Importar OC</a>.</p>`
      : visiveis.map((o) => html`<${CartaoOrdem} key=${versao + "|" + o.id} o=${o} aberta=${aberta === o.id}
          alternar=${() => { abrir(abertaRef.current === o.id ? null : o.id); desenhar(); }} acoes=${acoes} />`);
  }

  return html`<main class="main-content">
    <div class="screen-header">
      <div>
        <h1>Ordens de Compras</h1>
        <p>Monte a ordem de qualquer fornecedor pelo catálogo. A Projeção de Compras
           e a importação de planilha entram nesta mesma fila.</p>
      </div>
      <div class="header-acoes">
        <${Estado} texto=${est.texto} classe=${est.classe} />
        <button id="btn-nova" class="botao primario"
          onClick=${() => { if (carregou) setNova((n) => ({ aberto: !n.aberto, vez: n.vez + 1 })); }}>+ Nova ordem</button>
      </div>
    </div>

    ${carregou ? html`<${NovaOrdem} aberto=${nova.aberto} focar=${nova.vez}
      fechar=${() => setNova((n) => ({ ...n, aberto: false }))} criada=${criada} />`
      : html`<section class="cartao" id="painel-nova" hidden></section>`}

    <section class="barra">
      <label class="campo"><span>Situação</span>
        <select id="filtro-situacao" value=${filtro.situacao} onChange=${(e) => mudarFiltro({ situacao: e.target.value }, true)}>
          <option value="pendente">Pendentes</option>
          <option value="">Todas</option>
          <option value="gerada">Geradas</option>
        </select></label>
      <label class="campo"><span>Unidade</span><select id="filtro-unidade" value=${filtro.unidade}
        onChange=${(e) => mudarFiltro({ unidade: e.target.value })}>${opcoesUnidade.current
          ? html`<option value="">Todas</option>${opcoesUnidade.current.map((u) => html`<option key=${u} value=${u}>${u}</option>`)}` : null}</select></label>
      <label class="campo"><span>Origem</span>
        <select id="filtro-origem" value=${filtro.origem} onChange=${(e) => mudarFiltro({ origem: e.target.value })}>
          <option value="">Todas</option>
          <option value="avulsa">Avulsa</option>
          <option value="projecao">Projeção</option>
          <option value="importada">Importada</option>
        </select></label>
      <label class="campo campo-largo"><span>Buscar</span>
        <input type="text" id="filtro-busca" placeholder="fornecedor ou item" value=${filtro.busca}
          onInput=${(e) => mudarFiltro({ busca: e.target.value })} onChange=${() => {}} /></label>
      <span class="fonte" id="resumo">${resumo}</span>
    </section>

    <div id="lista">${lista}</div>
  </main>`;
}

montarTela("ordens", Ordens);
