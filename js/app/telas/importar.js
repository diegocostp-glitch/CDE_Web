// ============================================================================
// Importar OC — a terceira porta de entrada da fila de ordens.
//
// Duas fontes, o mesmo formato interno:
//   planilha .xlsx  — a solicitação da equipe, uma aba por fornecedor;
//   PDF da OC       — a ordem emitida pela planilha do gerente (leitura em
//                     js/importar-pdf.js, que não migra e continua global).
//
// O que muda em relação ao Gerador de OCs: lá a importação ia direto para o
// PDF. Aqui ela desce para Ordens de Compras como ordem PENDENTE. Assim toda
// OC emitida, não importa por qual porta entrou, fica registrada em um lugar só
// — antes, o que era importado não deixava rastro no sistema depois do download.
//
// Gerar o lote direto continua possível (o botão do .zip), e nesse caminho as
// ordens são gravadas já como geradas, com o número que cada uma recebeu.
//
// Como na tela antiga, o que foi lido é um objeto só (LIDOS) e os cartões são
// desenhados dele: digitar num cartão muda o objeto e só o subtotal e o total
// do cartão na hora; selo, placar e pendências se refazem ao redesenhar (abrir
// ou fechar um cartão, trocar o cadastro, tirar um item, trocar a unidade).
// ============================================================================
import { html, useState, useEffect, useRef } from "../html.js";
import { num, fmt, busca, chave, limpaNome, dataDoExcel, hojeISO, hojeBR, hojePonto, esc } from "../formato.js";
import * as api from "../api.js";
import { avisoCompras as aviso, Estado } from "../componentes/Aviso.js";
import {
  base, carregarBase, produtosDoFornecedor, obsDoFornecedor, fornecedorPorChave, unidadePorChave,
  casarFornecedor, casarUnidade, pendenciasDaOC, proximoNumeroOC, reservarNumerosOC,
} from "../base.js";
import { montarTela } from "../montar.js";

const PAGAMENTOS = ["Boleto", "Cartão de Crédito", "Cartão de Débito", "Pix", "Dinheiro", "Bonificação"];
const FRETES = ["CIF", "FOB", "-"];
const PARCELAS = Array.from({ length: 24 }, (_, i) => (i + 1) + "x");

// A forma de pagamento lida do arquivo precisa bater com uma das opções — senão
// a OC sai com um texto que a outra ponta não reconhece.
function normalizarPagamento(v) {
  const q = chave(v);
  if (!q) return "Boleto";
  return PAGAMENTOS.find((m) => chave(m) === q)
      || PAGAMENTOS.find((m) => q.includes(chave(m)) || chave(m).includes(q))
      || "Boleto";
}

// ============================================================================
// PLANILHA — uma aba por fornecedor, no modelo da solicitação da equipe.
// Percorre as abas procurando o cabeçalho da tabela de itens ("Descrição" +
// "Quantidade"); o que vem antes dele é metadado do pedido.
// ============================================================================
function lerAbas(wb) {
  const fora = [];
  wb.SheetNames.forEach((aba) => {
    if (chave(aba) === "base") return;
    const linhas = XLSX.utils.sheet_to_json(wb.Sheets[aba], { header: 1, defval: "" });
    const meta = { orderDate: hojeBR(), deliveryDate: "", horario: "", obs: "",
                   pagamento: "", prazoPagamento: "" };
    const itens = [];
    let naTabela = false;

    // valor imediatamente à direita de um rótulo, na mesma linha
    const apos = (linha, termo) => {
      const i = linha.findIndex((c) => busca(c).includes(termo));
      if (i === -1) return "";
      for (let k = i + 1; k < linha.length; k++) {
        if (String(linha[k]).trim() !== "") return String(linha[k]).trim();
      }
      return "";
    };

    linhas.forEach((linha) => {
      const txt = busca(linha.join(" "));
      if (!naTabela && txt.includes("descricao") && txt.includes("quantidade")) {
        naTabela = true; return;
      }
      if (naTabela) {
        const nome = limpaNome(linha[1]);
        // Linhas de instrução do próprio modelo ("Colocar Nome e Sobrenome -
        // Ex.: ...") não são produto: entrariam na OC como item fantasma.
        const molde = /^colocar\b/i.test(nome) || /ex\.:/i.test(nome) || /^-+$/.test(nome);
        if (nome && !molde && !busca(nome).includes("observ") && !busca(nome).includes("total")) {
          itens.push({ nome, un: limpaNome(linha[2]), qtd: num(linha[3]), preco: 0 });
        }
        return;
      }
      if (txt.includes("data da oc") || (txt.includes("data") && txt.includes("oc"))) {
        const v = dataDoExcel(apos(linha, "data")); if (v) meta.orderDate = v;
      }
      if (txt.includes("previsao de entrega")) {
        const v = dataDoExcel(apos(linha, "entrega")); if (v) meta.deliveryDate = v;
      }
      if (txt.includes("horario de recebimento")) meta.horario = apos(linha, "recebimento");
      if (txt.includes("forma de pagamento")) meta.pagamento = apos(linha, "pagamento");
      if (txt.includes("prazo de pagamento") || (txt.includes("prazo") && !txt.includes("entrega"))) {
        const v = apos(linha, "prazo"); if (v) meta.prazoPagamento = v;
      }
      if (txt.includes("observa")) { const v = apos(linha, "observa"); if (v) meta.obs = v; }
    });

    if (itens.length) fora.push({ fornecedorPdf: aba, fornecedor: aba, itens, meta });
  });
  return fora;
}

// Completa o que vem do cadastro: apelido, preço do catálogo, prazos, obs fixa.
function enriquecer(LIDOS) {
  LIDOS.forEach((l) => {
    const cad = casarFornecedor(l.fornecedorPdf);
    l.cadastro = cad ? cad.chave : null;
    if (cad) l.fornecedor = cad.chave;
    // O preço vem do catálogo do fornecedor. O nome no arquivo raramente vem
    // igual ao cadastrado, então o casamento é pela chave normalizada.
    const catalogo = cad ? produtosDoFornecedor(cad.chave) : [];
    l.itens.forEach((i) => {
      const p = catalogo.find((c) => chave(c.produto) === chave(i.nome));
      if (p) {
        if (!num(i.preco)) i.preco = num(p.preco);
        if (!limpaNome(i.un)) i.un = p.un;
        i.doCatalogo = true;
      } else { i.doCatalogo = false; }
    });
    l.oc = {
      dataEmissao: l.meta.orderDate || hojeBR(),
      dataEntrega: l.meta.deliveryDate || "",
      horario: l.meta.horario || "",
      pagamento: normalizarPagamento(l.meta.pagamento),
      parcelas: "1x",
      frete: "CIF",
      prazoFaturado: (cad && cad.prazoFat) || l.meta.prazoPagamento || "",
      prazoEntrega: (cad && cad.prazoEntrega) || "",
      transportadora: "",
    };
    l.obs = l.meta.obs || "";
  });
}

// ------------------------------------------------------------------ cartão
function CamposOC({ l }) {
  const d = l.oc;
  const opc = (lista) => lista.map((v) => html`<option key=${v} value=${v}>${v}</option>`);
  return html`<details class="bloco-oc">
    <summary>Dados da Ordem de Compra</summary>
    <div class="grade-oc">
      <label class="campo"><span>Data de emissão</span><input data-oc="dataEmissao" defaultValue=${d.dataEmissao} /></label>
      <label class="campo"><span>Previsão de entrega</span><input data-oc="dataEntrega" defaultValue=${d.dataEntrega} placeholder="dd/mm/aaaa" /></label>
      <label class="campo"><span>Horário de recebimento</span><input data-oc="horario" defaultValue=${d.horario} /></label>
      <label class="campo"><span>Forma de pagamento</span>
        <select data-oc="pagamento" defaultValue=${d.pagamento}>${opc(PAGAMENTOS)}</select></label>
      <label class="campo"><span>Nº de parcelas</span>
        <select data-oc="parcelas" defaultValue=${d.parcelas}>${opc(PARCELAS)}</select></label>
      <label class="campo"><span>Frete</span><select data-oc="frete" defaultValue=${d.frete}>${opc(FRETES)}</select></label>
      <label class="campo"><span>Prazo (faturado)</span><input data-oc="prazoFaturado" defaultValue=${d.prazoFaturado} /></label>
      <label class="campo"><span>Prazo de entrega</span><input data-oc="prazoEntrega" defaultValue=${d.prazoEntrega} /></label>
      <label class="campo"><span>Entrega na transportadora</span><input data-oc="transportadora" defaultValue=${d.transportadora} placeholder="dd/mm/aaaa" /></label>
    </div>
  </details>`;
}

function CartaoImportado({ l, i, aberto, alternar, trocarCadastro, tirar, previa }) {
  const BASE = base();
  const cart = useRef(null);
  const total = l.itens.reduce((s, x) => s + num(x.qtd) * num(x.preco), 0);
  const selo = l.pendencias.length
    ? html`<span class="selo ruim" title=${l.pendencias.join(" · ")}>precisa de ajuste</span>`
    : (l.temPedido ? html`<span class="selo bom">Pronta</span>` : html`<span class="selo aviso">Sem pedido</span>`);
  const cadSel = (BASE.fornecedores.find((f) => chave(f.chave) === chave(l.cadastro)) || {}).chave || "";

  // As edições vão direto para o objeto: o cartão é a fonte do que será criado,
  // e reler do formulário na hora de enviar perderia o que estivesse recolhido.
  const aoDigitar = (e) => {
    const tr = e.target.closest("tr");
    const k = e.target.dataset.k;
    if (tr && k) {
      const it = l.itens[Number(tr.dataset.n)];
      it[k] = (k === "qtd" || k === "preco") ? num(e.target.value) : e.target.value;
      const s = num(it.qtd) * num(it.preco);
      tr.querySelector(".sub").textContent = s > 0 ? "R$ " + fmt(s) : "—";
      const tot = l.itens.reduce((a, x) => a + num(x.qtd) * num(x.preco), 0);
      cart.current.querySelector(".total-cartao").innerHTML = "<strong>" + (tot > 0 ? "R$ " + fmt(tot) : "—") + "</strong>";
    }
    if (e.target.dataset.oc) l.oc[e.target.dataset.oc] = e.target.value;
    if (e.target.dataset.c === "obs") l.obs = e.target.value;
  };
  const aoMudar = (e) => {
    if (e.target.dataset.oc) l.oc[e.target.dataset.oc] = e.target.value;
    if (e.target.dataset.c === "cadastro") trocarCadastro(l, e.target.value);
  };

  return html`<section class="cartao ordem" data-i=${i} ref=${cart}>
    <div class="cabeca ordem-cabeca" data-abrir=${i} onClick=${alternar}>
      <div class="ordem-tit">
        <h2>${l.fornecedor || "(sem nome)"}</h2>
        <span class="fonte">${(l.fornecedorPdf !== l.fornecedor ? "no arquivo: " + l.fornecedorPdf + " · " : "") + l.itens.length + " item(ns)"}</span>
      </div>
      <div class="ficha-vals ordem-total">
        <span class="ficha-n">${total > 0 ? "R$ " + fmt(total) : "—"}</span>
        <span class="fonte">${total > 0 ? "valor" : "sem preços"}</span>
      </div>
      ${selo}
      <span class="ordem-chev">${aberto ? "▾" : "▸"}</span>
    </div>
    ${aberto ? html`<div class="ordem-corpo" onInput=${aoDigitar} onChange=${aoMudar}>
      ${l.pendencias.length ? html`<p class="nota-aviso">${"Não dá para gerar esta OC ainda: falta " + l.pendencias.join(" · ") + "."}</p>` : null}

      <div class="barra barra-interna">
        <label class="campo campo-largo"><span>Fornecedor no cadastro</span>
          <select data-c="cadastro" defaultValue=${cadSel}><option value="">— sem cadastro —</option>${BASE.fornecedores.map((f) =>
            html`<option key=${f.chave} value=${f.chave}>${f.chave + " — " + f.razao}</option>`)}</select></label>
        <label class="campo campo-largo"><span>Observação da ordem</span>
          <input data-c="obs" type="text" defaultValue=${l.obs || ""} /></label>
      </div>

      <div class="rolagem"><table class="tabela-itens">
        <thead><tr><th>Item</th><th>Un.</th><th>Quantidade</th><th>Preço unit.</th>
          <th>Subtotal</th><th></th></tr></thead>
        <tbody>${l.itens.map((it, n) => html`
          <tr key=${n} data-n=${n}>
            <td><input data-k="nome" defaultValue=${it.nome} style=${{ width: "100%" }} />${it.doCatalogo
              ? html`${" "}<span class="selo-mini" title="Preço veio do catálogo deste fornecedor">catálogo</span>` : null}</td>
            <td><input data-k="un" defaultValue=${it.un || ""} style=${{ width: "74px" }} /></td>
            <td><input data-k="qtd" inputmode="decimal" defaultValue=${fmt(num(it.qtd), 3)} style=${{ width: "90px" }} /></td>
            <td><input data-k="preco" inputmode="decimal" defaultValue=${fmt(num(it.preco))} style=${{ width: "96px" }}
                class=${num(it.qtd) > 0 && !num(it.preco) ? "campo-ruim" : ""} /></td>
            <td class="calc sub">${num(it.qtd) * num(it.preco) > 0 ? "R$ " + fmt(num(it.qtd) * num(it.preco)) : "—"}</td>
            <td><button class="botao-mini tira" title="Remover item" onClick=${() => tirar(l, n)}>✕</button></td>
          </tr>`)}</tbody>
        <tfoot><tr><td colSpan="4" class="calc"><strong>Total</strong></td>
          <td class="calc total-cartao"><strong>${total > 0 ? "R$ " + fmt(total) : "—"}</strong></td>
          <td></td></tr></tfoot>
      </table></div>

      <${CamposOC} l=${l} />

      <div class="ordem-acoes">
        <span style=${{ flex: 1 }}></span>
        <button class="botao previa" onClick=${() => previa(l)}>Ver PDF</button>
      </div>
    </div>` : null}
  </section>`;
}

// ------------------------------------------------------------------ tela
function Importar() {
  const LIDOS = useRef([]);           // [{ fornecedor, fornecedorPdf, cadastro, itens[], oc{} }]
  const abertos = useRef(new Set());
  const arquivoRef = useRef(null);    // o File escolhido
  const entrada = useRef(null);
  const numero = useRef(null);
  const unidadeRef = useRef("");
  const [unidade, setUnidadeEstado] = useState("");
  const setUnidade = (u) => { unidadeRef.current = u; setUnidadeEstado(u); };
  const [carregou, setCarregou] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const [arquivo, setArquivo] = useState(null);
  const [sobre, setSobre] = useState(false);
  const [recado, setRecado] = useState("");
  const [dica, setDica] = useState("");
  const [versao, setVersao] = useState(0);   // "desenhar": os cartões renascem do objeto
  const desenhar = () => setVersao((v) => v + 1);
  const [est, setEst] = useState({ texto: "", classe: "" });
  const estado = (texto, classe) => setEst({ texto: texto || "", classe: classe || "" });

  const mostrarProximo = async () => {
    const n = await proximoNumeroOC(unidadeRef.current);
    setDica(n ? "Em branco = automático. Próxima OC desta unidade: " + n + "." : "Em branco = automático.");
  };
  useEffect(() => {
    (async () => {
      estado("Carregando cadastro…");
      try { await carregarBase(); } catch (e) { setFalhou(true); return; }
      estado("");
      setUnidade((base().unidades[0] || {}).chave || "");
      setCarregou(true);
      mostrarProximo();
    })();
  }, []);

  const ehPDF = () => !!arquivoRef.current && /\.pdf$/i.test(arquivoRef.current.name);
  const escolher = (arq) => {
    if (!arq) return;
    arquivoRef.current = arq;
    setArquivo(arq);
  };
  const limpar = () => {
    arquivoRef.current = null; LIDOS.current = []; setRecado(""); abertos.current.clear();
    if (entrada.current) entrada.current.value = "";
    setArquivo(null);
    desenhar();
  };
  const ler = () => {
    if (!arquivoRef.current) return;
    estado("Lendo…");
    if (ehPDF()) lerPDF(); else lerPlanilha();
  };

  function lerPlanilha() {
    const leitor = new FileReader();
    leitor.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "binary" });
        LIDOS.current = lerAbas(wb);
        setRecado("");
        if (!LIDOS.current.length) {
          estado("");
          aviso("Nenhuma aba com itens. Confira se é a planilha de solicitação de compras.", "mau");
          desenhar();
          return;
        }
        enriquecer(LIDOS.current);
        estado("");
        desenhar();
        aviso(`Planilha lida: ${LIDOS.current.length} fornecedor(es).`, "bom");
      } catch (err) {
        estado("Falha na leitura", "erro");
        aviso("Não consegui ler a planilha: " + err.message, "mau");
      }
    };
    leitor.readAsBinaryString(arquivoRef.current);
  }

  function lerPDF() {
    const leitor = new FileReader();
    leitor.onload = async (e) => {
      let lido;
      try {
        lido = await readOcPdf(e.target.result);
      } catch (err) {
        estado("Falha na leitura", "erro");
        aviso("Não consegui ler este PDF. Confira se é a OC gerada pela planilha.", "mau");
        return;
      }
      const ocs = lido.ocs.filter((o) => o.items.length);
      if (!ocs.length) {
        estado("");
        aviso("Nenhum item encontrado no PDF — confira se o arquivo é a OC da planilha.", "mau");
        return;
      }
      const alertas = [];
      // A unidade compradora está no bloco do canto superior direito do PDF.
      const uni = casarUnidade(lido.loja);
      if (uni) setUnidade(uni.chave);
      else if (lido.loja.nome || lido.loja.cnpj) {
        alertas.push(`a loja do PDF (${lido.loja.nome || lido.loja.cnpj}) não corresponde a ` +
                     "nenhuma unidade cadastrada — escolha a unidade acima");
      }
      LIDOS.current = ocs.map((oc) => ({
        fornecedorPdf: oc.pdfSupplierName,
        fornecedor: oc.pdfSupplierName,
        itens: oc.items.map((i) => ({ nome: i.product, un: i.unit, qtd: i.qty, preco: 0 })),
        meta: { orderDate: oc.orderDate || hojeBR(), deliveryDate: oc.deliveryDate,
                horario: oc.horarioReceb, obs: oc.obs, pagamento: oc.paymentForm,
                prazoPagamento: oc.prazoPagamento },
      }));
      enriquecer(LIDOS.current);
      LIDOS.current.forEach((l) => {
        if (!l.cadastro) alertas.push(`o fornecedor "${l.fornecedorPdf || "sem nome no PDF"}" ` +
          "não foi encontrado no cadastro");
      });
      const totItens = LIDOS.current.reduce((s, l) => s + l.itens.length, 0);
      const partes = [];
      if (uni) partes.push(`unidade <strong>${esc(uni.chave)}</strong>`);
      if (ocs[0].orderDatePdf) partes.push(`data da OC <strong>${esc(ocs[0].orderDatePdf)}</strong>` +
        ` + 1 dia = <strong>${esc(ocs[0].orderDate)}</strong>`);
      if (ocs[0].deliveryDate) partes.push(`entrega <strong>${esc(ocs[0].deliveryDate)}</strong>`);
      partes.push(`<strong>${totItens}</strong> ${totItens === 1 ? "item" : "itens"}`);
      // texto montado aqui mesmo, com tudo que vem do arquivo escapado
      setRecado(`<p class="nota-info">Lido do PDF: ${partes.join(" · ")}.</p>` +
        (alertas.length ? `<p class="nota-aviso">Confira: ${esc(alertas.join(" · "))}.</p>` : ""));
      estado("");
      desenhar();
      aviso("PDF lido — confira os preços antes de enviar.", "bom");
    };
    leitor.readAsArrayBuffer(arquivoRef.current);
  }

  // ------------------------------------------------------------- cartões
  const trocarCadastro = (l, valor) => {
    l.cadastro = valor || null;
    if (l.cadastro) l.fornecedor = l.cadastro;
    // Trocar o cadastro troca o catálogo: os preços são recarregados.
    const cat = produtosDoFornecedor(l.cadastro);
    l.itens.forEach((it) => {
      const p = cat.find((c) => chave(c.produto) === chave(it.nome));
      it.doCatalogo = !!p;
      if (p && !num(it.preco)) it.preco = num(p.preco);
    });
    desenhar();
  };
  const tirar = (l, n) => { l.itens.splice(n, 1); desenhar(); };
  const dadosDoPDF = (l, num_) => {
    const uni = unidadePorChave(unidadeRef.current) || {};
    const forn = fornecedorPorChave(l.cadastro) || {};
    const obs = [obsDoFornecedor(l.cadastro), l.obs].filter(Boolean).join(" | ");
    return Object.assign({}, l.oc, {
      numero: num_, unidade: uni, fornecedor: forn, fornecedorNome: l.fornecedor,
      obs, itens: l.itens.filter((i) => num(i.qtd) > 0),
    });
  };
  const previa = (l) => {
    const itens = l.itens.filter((it) => num(it.qtd) > 0);
    if (!itens.length) { aviso("Nenhum item com quantidade preenchida.", "mau"); return; }
    montarPDF(dadosDoPDF(l, "prévia"), true);
  };

  // ------------------------------------------------------------- enviar / lote
  const paraEnviar = () => LIDOS.current.filter((l) => l.itens.some((i) => num(i.qtd) > 0));
  const corpoDaOrdem = (l) => ({
    unidade_oc: unidadeRef.current,
    fornecedor: l.fornecedor, fornecedor_base: l.cadastro,
    data: hojeISO(), origem: "importada",
    obs: l.obs || "",
    oc: Object.assign({}, l.oc, { numero_manual: "" }),
    itens: l.itens.filter((i) => num(i.qtd) > 0)
      .map((i) => ({ nome: i.nome, un: i.un, qtd: num(i.qtd), preco: num(i.preco) })),
  });

  async function enviarParaOrdens() {
    const lista = paraEnviar();
    if (!lista.length) { aviso("Nenhum fornecedor com quantidade preenchida.", "mau"); return; }
    const semCad = lista.filter((l) => !l.cadastro).length;
    if (semCad && !confirm(`${semCad} fornecedor(es) sem cadastro vinculado.\n` +
        "As ordens serão criadas, mas a OC só sai depois de vincular o cadastro. Continuar?")) return;
    estado("Criando ordens…");
    try {
      const r = await (await api.postOrdensLote({ ordens: lista.map(corpoDaOrdem) })).json();
      if (!r.ok) throw new Error(r.erro || "erro no servidor");
      estado("");
      if (r.recusadas.length) {
        aviso(`${r.criadas.length} ordem(ns) criada(s). Recusadas: ` +
          r.recusadas.map((x) => `${x.fornecedor} (${x.motivo})`).join(" · "), "mau");
      } else {
        aviso(`${r.criadas.length} ordem(ns) criada(s) em Ordens de Compras.`, "bom");
        setTimeout(() => { location.href = "ordens.html"; }, 1200);
      }
    } catch (e) {
      estado("Falha ao criar", "erro");
      aviso("Não consegui criar as ordens: " + e.message, "mau");
    }
  }

  // Gera o lote inteiro de uma vez. Reserva os números numa única ida ao servidor,
  // com a quantidade exata — reservar um por um queimaria número de fornecedor que
  // ficou de fora por pendência.
  async function gerarLoteZip() {
    const lista = paraEnviar();
    if (!lista.length) { aviso("Nenhum fornecedor com quantidade preenchida.", "mau"); return; }
    const gerar = lista.filter((l) => !pendenciasDaOC(l.cadastro, l.itens).length);
    const travados = lista.length - gerar.length;
    if (!gerar.length) {
      aviso("Nenhuma ordem está pronta: resolva as pendências de preço e cadastro.", "mau");
      return;
    }
    if (!confirm(`Gerar ${gerar.length} OC(s) agora?` +
        (travados ? `\n${travados} ficam de fora por pendência e podem ser enviadas para Ordens.` : "") +
        "\nOs números serão reservados e as ordens ficam registradas como geradas.")) return;
    estado("Reservando números…");
    try {
      const uni = unidadeRef.current;
      const numeros = await reservarNumerosOC(uni,
        gerar.map((l) => ({ fornecedor: l.fornecedor, data: l.oc.dataEmissao })),
        numero.current.value.trim());
      const zip = new JSZip();
      gerar.forEach((l, i) => {
        const doc = montarPDF(dadosDoPDF(l, numeros[i]), false);
        zip.file(nomeArquivoOC(numeros[i], uni, l.fornecedor) + ".pdf", doc.output("blob"));
      });
      // Grava as ordens já como geradas: OC no mundo sem registro no sistema é
      // exatamente o que este merge veio resolver.
      estado("Registrando as ordens…");
      const r = await (await api.postOrdensLote({ ordens: gerar.map((l, i) => Object.assign(corpoDaOrdem(l), {
        situacao_inicial: "gerada", numero_oc: numeros[i],
      })) })).json();
      if (!r.ok) throw new Error(r.erro || "erro ao registrar as ordens");
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `OCs - ${uni} - ${hojePonto()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      numero.current.value = "";
      mostrarProximo();
      estado("");
      aviso(`${gerar.length} OC(s) geradas (nº ${numeros[0]} a ${numeros[numeros.length - 1]}) e registradas.`, "bom");
    } catch (e) {
      estado("Falha ao gerar", "erro");
      aviso("Não consegui gerar o lote: " + e.message, "mau");
    }
  }

  // ------------------------------------------------------------- desenho
  // Os cartões e o placar são o retrato do último "desenhar", como antes:
  // digitar num cartão só mexe no subtotal e no total dele, e o resto espera o
  // próximo redesenho (outras atualizações da tela não o refazem).
  const retrato = useRef({ versao: -1, el: null });
  if (retrato.current.versao !== versao) retrato.current = { versao, el: desenharResultado() };
  const resultado = retrato.current.el;

  function desenharResultado() {
  let resultado = null;
  const lidos = LIDOS.current;
  if (lidos.length) {
    lidos.forEach((l) => {
      l.pendencias = pendenciasDaOC(l.cadastro, l.itens);
      l.temPedido = l.itens.some((i) => num(i.qtd) > 0);
    });
    // Ordem: pronto para gerar, depois o que precisa de ajuste, depois o zerado.
    const peso = (l) => l.pendencias.length ? 1 : (l.temPedido ? 0 : 2);
    const ordem = lidos.map((_, i) => i).sort((a, b) =>
      peso(lidos[a]) - peso(lidos[b]) || lidos[a].fornecedor.localeCompare(lidos[b].fornecedor, "pt-BR"));
    const prontos = lidos.filter((l) => l.temPedido && !l.pendencias.length).length;
    const travados = lidos.filter((l) => l.temPedido && l.pendencias.length).length;
    const vazios = lidos.filter((l) => !l.temPedido).length;
    const total = lidos.reduce((s, l) => s + l.itens.reduce((t, i) => t + num(i.qtd) * num(i.preco), 0), 0);
    resultado = html`<div class="placar">
        <div class="ficha"><div class="ficha-topo"><span class="fonte">Prontas</span></div>
          <span class="ficha-n">${prontos}</span><span class="fonte">Com pedido e sem pendência</span></div>
        <div class="ficha"><div class="ficha-topo"><span class="fonte">Precisam de ajuste</span></div>
          <span class=${"ficha-n " + (travados ? "ficha-r" : "")}>${travados}</span>
          <span class="fonte">Falta preço ou cadastro</span></div>
        <div class="ficha"><div class="ficha-topo"><span class="fonte">Sem pedido</span></div>
          <span class="ficha-n">${vazios}</span><span class="fonte">Nenhuma quantidade</span></div>
        <div class="ficha"><div class="ficha-topo"><span class="fonte">Valor total</span></div>
          <span class="ficha-n">${"R$ " + fmt(total)}</span></div>
      </div>

      <section class="barra">
        <span class="fonte">Conferido? Envie para a fila de ordens — o número da OC só é
          reservado quando cada ordem for gerada.</span>
        <span style=${{ flex: 1 }}></span>
        <button class="botao" id="btn-zip" onClick=${gerarLoteZip}>Gerar todas agora (.zip)</button>
        <button class="botao primario" id="btn-enviar" onClick=${enviarParaOrdens}>Enviar para Ordens</button>
      </section>

      ${ordem.map((i) => html`<${CartaoImportado} key=${versao + "|" + i} l=${lidos[i]} i=${i} aberto=${abertos.current.has(i)}
        alternar=${() => { if (abertos.current.has(i)) abertos.current.delete(i); else abertos.current.add(i); desenhar(); }}
        trocarCadastro=${trocarCadastro} tirar=${tirar} previa=${previa} />`)}`;
  }
  return resultado;
  }

  return html`<main class="main-content">
    <div class="screen-header">
      <div>
        <h1>Importar OC</h1>
        <p>Leia a planilha de solicitação da equipe ou o PDF da OC. Cada fornecedor
           encontrado vira uma ordem pendente em Ordens de Compras.</p>
      </div>
      <div class="header-acoes">
        <${Estado} texto=${est.texto} classe=${est.classe} />
      </div>
    </div>

    <section class="barra">
      <label class="campo campo-largo"><span>Unidade compradora</span>
        <select id="unidade" value=${unidade} onChange=${(e) => { setUnidade(e.target.value); mostrarProximo(); desenhar(); }}>${carregou
          ? base().unidades.map((u) => html`<option key=${u.chave} value=${u.chave}>${u.chave}</option>`) : null}</select></label>
      <label class="campo"><span>Nº da OC inicial</span>
        <input type="number" id="numero" min="1" placeholder="automático" style=${{ width: "150px" }} ref=${numero} /></label>
      <span class="fonte" id="dica-numero">${dica}</span>
    </section>

    <section class="cartao">
      <div class=${"zona-envio" + (sobre ? " sobre" : "")} id="zona"
           onDragEnter=${(e) => { e.preventDefault(); setSobre(true); }}
           onDragOver=${(e) => { e.preventDefault(); setSobre(true); }}
           onDragLeave=${(e) => { e.preventDefault(); setSobre(false); }}
           onDrop=${(e) => { e.preventDefault(); setSobre(false); if (carregou && e.dataTransfer.files && e.dataTransfer.files[0]) escolher(e.dataTransfer.files[0]); }}>
        <input type="file" id="arquivo" accept=".xlsx,.xlsm,.csv,.pdf" ref=${entrada}
               onChange=${(e) => { if (carregou) escolher(e.target.files[0]); }} />
        <div class="zona-ico">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/>
            <path d="M14 3v5h5"/><line x1="8" y1="13" x2="16" y2="13"/>
            <line x1="8" y1="17" x2="16" y2="17"/><line x1="12" y1="11" x2="12" y2="19"/>
          </svg>
        </div>
        <div class="zona-txt">Arraste a planilha (.xlsx) ou o PDF da OC — ou clique para escolher</div>
      </div>

      <div class="arquivo-escolhido" id="escolhido" hidden=${!arquivo}>
        <strong id="nome-arquivo">${arquivo ? arquivo.name : ""}</strong>
        <span style=${{ flex: 1 }}></span>
        <button class="botao primario" id="btn-ler" onClick=${ler}>${arquivo && /\.pdf$/i.test(arquivo.name) ? "Ler PDF" : arquivo ? "Ler planilha" : "Ler arquivo"}</button>
        <button class="botao" id="btn-cancelar" onClick=${limpar}>Cancelar</button>
      </div>
    </section>

    <div id="recado" dangerouslySetInnerHTML=${{ __html: falhou
      ? '<p class="vazio">Servidor fora do ar. Rode o Servidor.bat.</p>' : recado }}></div>
    <div id="resultado">${resultado}</div>
  </main>`;
}

montarTela("importar", Importar);
