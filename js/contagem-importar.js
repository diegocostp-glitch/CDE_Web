// ============================================================================
// Conferência das lojas — a ponte entre o artefato e as telas de contagem.
//
// As lojas preenchem a contagem no artefato "Conferência das Lojas"; o
// Suprimentos baixa de lá um CSV e importa aqui. Este arquivo faz as duas
// pontas do lado do CDE:
//   - "Lista para o artefato": exporta a lista desta contagem (com os ids), que
//     o artefato usa para mostrar às lojas os mesmos itens, na mesma ordem;
//   - "Importar das lojas": lê o CSV, mostra por casa o que vai ser gravado e
//     as divergências, e grava pelo mesmo /api/contagem do botão Salvar.
//
// CSV em formato longo, uma linha por valor, separado por ponto e vírgula:
//   tipo;periodo;casa;secao;chave;codigo;item;campo;valor
//   secao: cab (resp, obs, fat), item (id do item), filetamento, processamento.
// Os números vêm com vírgula decimal e já na unidade do item (o artefato
// converte as embalagens). Depende de contagem.js (DADOS, CASA, carregar).
// ============================================================================
(function () {
  const COLUNAS = ["tipo", "periodo", "casa", "secao", "chave", "codigo", "item", "campo", "valor"];
  const TEXTOS = { diaria: ["mot"], semanal: ["obs"] };
  const NUMEROS = { diaria: ["ini", "ent", "entp", "sai", "desp", "fin"], semanal: ["qtd"] };
  const NOME = { diaria: "contagem diária", semanal: "contagem semanal" };
  let LOTE = null;          // o que foi lido do arquivo, à espera de "Gravar"

  // ---------------------------------------------------------------- botões
  const acoes = document.querySelector(".header-acoes");
  const salvarBtn = document.getElementById("btn-salvar");
  if (!acoes || !salvarBtn) return;
  const arq = Object.assign(document.createElement("input"), { type: "file", accept: ".csv,text/csv", hidden: true });
  const bImp = Object.assign(document.createElement("button"), { className: "botao", textContent: "Importar das lojas",
    title: "CSV baixado do artefato Conferência das Lojas" });
  const bLista = Object.assign(document.createElement("button"), { className: "botao", textContent: "Lista para o artefato",
    title: "Exporta esta lista de itens para o artefato que as lojas preenchem" });
  acoes.insertBefore(bLista, salvarBtn);
  acoes.insertBefore(bImp, salvarBtn);
  acoes.appendChild(arq);
  bImp.onclick = () => arq.click();
  bLista.onclick = exportarLista;
  arq.onchange = () => { if (arq.files[0]) lerArquivo(arq.files[0]); arq.value = ""; };

  // ---------------------------------------------------------------- lista
  function exportarLista() {
    if (!DADOS || !DADOS.itens.length) { aviso("A lista desta contagem ainda não tem itens.", "mau"); return; }
    const corpo = { origem: "CDE Web", tipo: TIPO_CONTAGEM, exportadoEm: new Date().toISOString(),
      casas: DADOS.casas, itens: DADOS.itens };
    const blob = new Blob([JSON.stringify(corpo, null, 1)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob),
      download: `lista-contagem-${TIPO_CONTAGEM}.json` });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    aviso(`Lista exportada (${DADOS.itens.length} itens). No artefato: Listas de itens, escolher este arquivo.`, "bom");
  }

  // ---------------------------------------------------------------- CSV
  function partirCsv(txt) {
    const linhas = [];
    let lin = [], campo = "", aspas = false;
    txt = txt.replace(/^﻿/, "");
    for (let i = 0; i < txt.length; i++) {
      const ch = txt[i];
      if (aspas) {
        if (ch === '"' && txt[i + 1] === '"') { campo += '"'; i++; }
        else if (ch === '"') aspas = false;
        else campo += ch;
      } else if (ch === '"') aspas = true;
      else if (ch === ";") { lin.push(campo); campo = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && txt[i + 1] === "\n") i++;
        lin.push(campo); campo = "";
        if (lin.some((c) => c !== "")) linhas.push(lin);
        lin = [];
      } else campo += ch;
    }
    if (campo !== "" || lin.length) { lin.push(campo); if (lin.some((c) => c !== "")) linhas.push(lin); }
    return linhas;
  }
  const numCsv = (s) => { const t = String(s || "").trim(); return t === "" ? null : num(t); };

  function lerArquivo(f) {
    const r = new FileReader();
    r.onload = () => {
      try { montarLote(partirCsv(String(r.result))); }
      catch (e) { aviso("Não consegui ler o arquivo: " + e.message, "mau"); }
    };
    r.readAsText(f, "utf-8");
  }

  function montarLote(linhas) {
    const cab = (linhas.shift() || []).map((c) => c.trim().toLowerCase());
    if (COLUNAS.some((c, k) => cab[k] !== c))
      throw new Error("não é o CSV do artefato Conferência das Lojas (cabeçalho diferente)");
    const casas = new Set(DADOS.casas.map((c) => c.chave));
    const porId = new Map(DADOS.itens.map((i) => [i.id, i]));
    const porCod = new Map(DADOS.itens.filter((i) => i.codigo).map((i) => [String(i.codigo), i]));
    const porNome = new Map(DADOS.itens.map((i) => [chave(i.nome), i]));
    const grupos = new Map();
    let outroTipo = 0;
    for (const l of linhas) {
      const [tipo, periodo, casa, secao, ch, codigo, item, campo, valor] = l.map((x) => (x || "").trim());
      if (tipo !== TIPO_CONTAGEM) { outroTipo++; continue; }
      const k = periodo + "|" + casa;
      if (!grupos.has(k)) grupos.set(k, { periodo, casa, reg: { itens: {}, resp: "", obs: "" },
        fora: new Set(), status: "", enviado: "", erroCasa: !casas.has(casa) });
      const g = grupos.get(k);
      if (secao === "cab") {
        if (ch === "resp" || ch === "obs") g.reg[ch] = valor;
        else if (ch === "fat") g.reg.fat = numCsv(valor);
        else if (ch === "status") g.status = valor;
        else if (ch === "enviado_em") g.enviado = valor;
      } else if (secao === "item") {
        // O id liga a linha ao item; se a lista do CDE mudou desde que a loja
        // contou, ainda tenta pelo código do ERP e pelo nome.
        const it = porId.get(ch) || (codigo && porCod.get(codigo)) || porNome.get(chave(item));
        if (!it) { g.fora.add(item || ch); continue; }
        const v = g.reg.itens[it.id] || (g.reg.itens[it.id] = {});
        if (TEXTOS[TIPO_CONTAGEM].includes(campo)) { if (valor) v[campo] = valor; }
        else if (NUMEROS[TIPO_CONTAGEM].includes(campo)) { const n = numCsv(valor); if (n != null) v[campo] = n; }
      } else if (TIPO_CONTAGEM === "diaria" && (secao === "filetamento" || secao === "processamento")) {
        const bloco = g.reg[secao] || (g.reg[secao] = {});
        const v = bloco[ch] || (bloco[ch] = {});
        if (campo === "obs") { if (valor) v.obs = valor; }
        else { const n = numCsv(valor); if (n != null) v[campo] = n; }
      }
    }
    if (!grupos.size) {
      aviso(outroTipo ? `O arquivo só tem linhas de outra contagem. Abra a tela da ${TIPO_CONTAGEM === "diaria" ? "contagem semanal" : "contagem diária"} para importar.`
        : "O arquivo não tem contagens.", "mau");
      return;
    }
    LOTE = { grupos: [...grupos.values()].sort((a, b) => (a.periodo + a.casa).localeCompare(b.periodo + b.casa)), outroTipo };
    conferirLote();
  }

  // ---------------------------------------------------------------- divergências
  // Para cada casa e período, lê o que o CDE já tem (e a contagem anterior)
  // e aponta o que precisa de olho antes de gravar.
  async function conferirLote() {
    estado("Conferindo o arquivo…");
    const porPeriodo = {};
    for (const g of LOTE.grupos) {
      if (!porPeriodo[g.periodo]) {
        try {
          porPeriodo[g.periodo] = await (await fetch(`/api/contagem?tipo=${TIPO_CONTAGEM}&data=${encodeURIComponent(g.periodo)}`,
            { cache: "no-store" })).json();
        } catch (e) { porPeriodo[g.periodo] = null; }
      }
      const d = porPeriodo[g.periodo];
      g.periodoCde = d ? d.data : g.periodo;
      g.existe = !!(d && d.registros && d.registros[g.casa] && Object.keys(d.registros[g.casa].itens || {}).length);
      const ant = d && d.anteriores ? d.anteriores[g.casa] : null;
      g.erros = []; g.alertas = [];
      if (g.erroCasa) g.erros.push(`Casa desconhecida no CDE: ${g.casa}`);
      const nome = (id) => (DADOS.itens.find((i) => i.id === id) || {}).nome || id;
      Object.entries(g.reg.itens).forEach(([id, v]) => {
        if (Object.values(v).some((n) => typeof n === "number" && n < 0)) g.erros.push(`${nome(id)}: quantidade negativa`);
        if (TIPO_CONTAGEM === "diaria") {
          if (v.desp && !v.mot) g.erros.push(`${nome(id)}: desperdício sem motivo`);
          const antFin = ant && ant.itens[id] ? ant.itens[id].fin : null;
          const ini = v.ini != null ? v.ini : antFin;
          if (v.fin != null && ini != null) {
            const uso = Math.round((ini + (v.ent || 0) + (v.entp || 0) - (v.sai || 0) - (v.desp || 0) - v.fin) * 1000) / 1000;
            if (uso < -0.0005) g.alertas.push(`${nome(id)}: uso negativo (${numBR(uso)})`);
          }
        } else if (ant && ant.itens[id] && ant.itens[id].qtd > 0 && v.qtd != null) {
          const a = ant.itens[id].qtd;
          if (Math.abs(v.qtd - a) / a > 0.5) g.alertas.push(`${nome(id)}: ${numBR(a)} → ${numBR(v.qtd)} desde a semana anterior`);
        }
      });
      const contados = itensDaCasa(DADOS.itens, g.casa).filter((i) => {
        const v = g.reg.itens[i.id]; return v && v[TIPO_CONTAGEM === "diaria" ? "fin" : "qtd"] != null;
      }).length;
      g.contados = contados;
      g.total = itensDaCasa(DADOS.itens, g.casa).length;
      if (contados < g.total) g.alertas.push(`${g.total - contados} itens sem contagem`);
      if (g.fora.size) g.alertas.push(`fora da lista do CDE (ignorados): ${[...g.fora].join(", ")}`);
      g.marcado = !g.erros.length;
    }
    estado("");
    desenharLote();
  }

  // ---------------------------------------------------------------- tela
  function desenharLote() {
    let sec = document.getElementById("importacao");
    if (!sec) {
      sec = Object.assign(document.createElement("section"), { id: "importacao", className: "cartao imp-cartao" });
      document.getElementById("painel").before(sec);
    }
    const nomeCasa = (k) => (DADOS.casas.find((c) => c.chave === k) || {}).nome || k;
    const marcados = LOTE.grupos.filter((g) => g.marcado).length;
    sec.innerHTML = `<div class="cabeca"><h2>Importar das lojas</h2>
        <span class="fonte">${LOTE.grupos.length} ${LOTE.grupos.length === 1 ? "contagem" : "contagens"} da ${NOME[TIPO_CONTAGEM]} no arquivo${
          LOTE.outroTipo ? ` · ${LOTE.outroTipo} linhas de outra contagem ficaram de fora` : ""}</span></div>
      <div class="rolagem"><table class="tabela-lancamento imp-tabela"><thead><tr>
        <th></th><th>${TIPO_CONTAGEM === "semanal" ? "Semana" : "Data"}</th><th>Casa</th><th>Responsável</th>
        <th>Itens contados</th><th>No CDE</th><th class="col-texto">Divergências</th></tr></thead><tbody>
      ${LOTE.grupos.map((g, n) => `<tr>
        <td><input type="checkbox" data-imp="${n}" ${g.marcado ? "checked" : ""} ${g.erros.length ? "disabled" : ""}
          aria-label="Gravar ${esc(nomeCasa(g.casa))} ${esc(brDate(g.periodoCde))}"></td>
        <td>${esc(brDate(g.periodoCde))}</td><td>${esc(nomeCasa(g.casa))}</td><td>${esc(g.reg.resp || "—")}</td>
        <td>${g.contados} de ${g.total}</td>
        <td>${g.existe ? '<span class="selo laranja" title="A contagem desta casa nesta data será substituída">já tem: substitui</span>' : "nova"}</td>
        <td class="col-texto imp-div">${g.erros.map((x) => `<span class="imp-erro">${esc(x)}</span>`).join("")}${
          g.alertas.map((x) => `<span class="imp-alerta">${esc(x)}</span>`).join("")}${
          !g.erros.length && !g.alertas.length ? '<span class="fonte">nenhuma</span>' : ""}</td></tr>`).join("")}
      </tbody></table></div>
      <p class="fonte">Em vermelho, o que o CDE recusa (negativo, desperdício sem motivo): peça à loja para corrigir no artefato e baixe de novo.
        Os alertas não impedem a gravação; depois de gravar, a tela mostra o uso de cada item para conferir.</p>
      <div class="ordem-acoes"><button class="botao" id="imp-cancelar">Cancelar</button><span style="flex:1"></span>
        <button class="botao primario" id="imp-gravar" ${marcados ? "" : "disabled"}>Gravar ${marcados} ${marcados === 1 ? "contagem" : "contagens"}</button></div>`;
    sec.querySelectorAll("[data-imp]").forEach((el) => {
      el.onchange = () => { LOTE.grupos[+el.dataset.imp].marcado = el.checked; desenharLote(); };
    });
    sec.querySelector("#imp-cancelar").onclick = () => { LOTE = null; sec.remove(); };
    sec.querySelector("#imp-gravar").onclick = gravarLote;
    sec.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function gravarLote() {
    const alvo = LOTE.grupos.filter((g) => g.marcado);
    if (!alvo.length) return;
    if (SUJO && !confirm("Há anotação digitada e não salva na tela. A importação recarrega a tela e ela se perde. Continuar?")) return;
    const subst = alvo.filter((g) => g.existe).length;
    if (subst && !confirm(`${subst} ${subst === 1 ? "contagem já existe" : "contagens já existem"} no CDE e ${subst === 1 ? "será substituída" : "serão substituídas"} pelo que a loja enviou. Continuar?`)) return;
    estado("Gravando…");
    const ok = [], falhas = [];
    for (const g of alvo) {
      try {
        const r = await (await fetch("/api/contagem", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tipo: TIPO_CONTAGEM, data: g.periodoCde, casa: g.casa, registro: g.reg }) })).json();
        if (!r.ok) throw new Error(r.erro);
        ok.push(g);
      } catch (e) { falhas.push(`${g.casa} ${brDate(g.periodoCde)}: ${e.message}`); }
    }
    estado(falhas.length ? "Importação com falhas" : "Importado", falhas.length ? "erro" : "ok");
    const sec = document.getElementById("importacao");
    if (sec) sec.remove();
    LOTE = null;
    if (ok.length) {
      SUJO = false;
      CASA = ok[0].casa;
      await carregar(ok[0].periodoCde);
    }
    aviso(`${ok.length} ${ok.length === 1 ? "contagem gravada" : "contagens gravadas"}` +
      (falhas.length ? `; não gravou: ${falhas.join(" · ")}` : ". Confira o uso de cada item na tabela."), falhas.length ? "mau" : "bom");
  }
})();
