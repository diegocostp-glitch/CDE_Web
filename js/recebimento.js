// ============================================================================
// CDE Web - Recebimento de Salmão. Regras e gravação em server.py
// (sincronizar_recebimento / gravar_recebimento).
//
// Três números lado a lado, de propósito:
//   Pedido   — o que a OC pediu (não muda aqui)
//   Enviado  — o pedido real do fornecedor: caixas de peso variável
//   Recebido — o que a loja pesou e contou na chegada
// A divergência que importa para a loja é Recebido × Enviado: é o que o
// fornecedor disse que mandou. Enviado × Pedido é só informação para Compras.
// ============================================================================
(() => {
  const ETAPA = {
    aguardando_real: { rotulo: "Aguardando pedido real", cls: "aviso" },
    aguardando_recebimento: { rotulo: "Aguardando recebimento", cls: "info" },
    conferido: { rotulo: "Conferido", cls: "bom" },
  };
  const TOL_KG = 0.1;
  let D = null, FILTRO = "aguardando_real", ABERTA = null, PODE = true;

  const vazio = (v) => v === null || v === undefined || v === "";
  const n3 = (v) => vazio(v) ? "" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 3, useGrouping: false });
  const kg = (v) => vazio(v) ? "—" : fmt(Number(v), 3) + " kg";
  const int = (v) => vazio(v) ? "—" : fmt(Number(v), 0);
  const quando = (iso) => iso ? brDate(iso.slice(0, 10)) + " " + iso.slice(11, 16) : "";

  async function carregar() {
    estado("Carregando…");
    const r = await fetch("/api/recebimentos", { cache: "no-store" });
    if (!r.ok) { $("#lista").innerHTML = '<p class="fonte">Sem acesso.</p>'; estado(""); return; }
    D = await r.json();
    $$("[data-n]").forEach((b) => { const n = D[b.dataset.n]; b.textContent = n ? n : ""; });
    estado("");
    desenhar();
  }

  function seloEtapa(r) {
    const e = ETAPA[r.situacao];
    let s = `<span class="selo ${e.cls}">${e.rotulo}</span>`;
    if (r.situacao === "conferido") {
      s += r.divergencias.length
        ? ' <span class="selo ruim">Com divergência</span>'
        : ' <span class="selo bom">Bateu com o enviado</span>';
    }
    return s;
  }

  function totais(r) {
    const soma = (c) => r.itens.reduce((s, i) => s + (vazio(i[c]) ? 0 : Number(i[c])), 0);
    const tem = (c) => r.itens.some((i) => !vazio(i[c]));
    return { pedido: r.itens.every((i) => !vazio(i.pedido_kg)) ? soma("pedido_kg") : null,
             real: tem("real_kg") ? soma("real_kg") : null,
             rec: tem("rec_kg") ? soma("rec_kg") : null };
  }

  function desenhar() {
    const lista = D.recebimentos.filter((r) => !FILTRO || r.situacao === FILTRO);
    $("#lista").innerHTML = lista.length ? lista.map(cartao).join("")
      : `<section class="cartao"><p class="fonte">Nenhuma ordem de recebimento ${
          FILTRO ? "em “" + ETAPA[FILTRO].rotulo.toLowerCase() + "”" : ""}. Ela nasce sozinha quando a OC
          com salmão é gerada na tela de Ordens de Compras.</p></section>`;
    ligar();
  }

  function cartao(r) {
    const t = totais(r), aberta = ABERTA === r.id;
    return `<section class="cartao ordem" data-id="${esc(r.id)}">
      <div class="cabeca ordem-cabeca" data-abrir="${esc(r.id)}">
        <div class="ordem-tit">
          <h2>${esc(r.fornecedor)}</h2>
          <span class="fonte">${esc(r.casa_nome)} · OC ${r.numero_oc ? "nº " + esc(r.numero_oc) : "sem número"}
            · pedido de ${brDate(r.data)}${r.pedido_real.previsto ? " · chega " + brDate(r.pedido_real.previsto) : ""}</span>
        </div>
        <div class="ficha-vals ordem-total">
          <span class="ficha-n">${t.real !== null ? kg(t.real) : t.pedido !== null ? kg(t.pedido) : "—"}</span>
          <span class="fonte">${t.real !== null ? "enviado pelo fornecedor" : "pedido na OC"}</span>
        </div>
        ${seloEtapa(r)}
        <span class="ordem-chev">${aberta ? "▾" : "▸"}</span>
      </div>
      ${aberta ? corpo(r) : ""}
    </section>`;
  }

  // ---------------------------------------------------------------- corpo
  function campo(i, c, dica, largura) {
    return `<input data-i="${esc(i.chave)}" data-c="${c}" type="text" inputmode="decimal"
      value="${c.endsWith("calibre") || c === "obs" ? esc(i[c] || "") : n3(i[c])}" title="${dica}"
      style="width:${largura || 74}px"${PODE ? "" : " disabled"}>`;
  }

  function corpo(r) {
    if (r.situacao === "aguardando_real") return corpoReal(r);
    return corpoRec(r);
  }

  function corpoReal(r) {
    const pr = r.pedido_real;
    return `<div class="rec-corpo">
      <p class="fonte">Quando o fornecedor mandar o romaneio ou a nota, lance aqui o que ele vai enviar.
        É isso que a loja confere na chegada.</p>
      <div class="barra barra-interna">
        <label class="campo"><span>Documento do fornecedor (NF / romaneio)</span>
          <input data-p="documento" value="${esc(pr.documento)}"${PODE ? "" : " disabled"}></label>
        <label class="campo"><span>Chegada prevista</span>
          <input data-p="previsto" type="date" value="${esc(pr.previsto)}"${PODE ? "" : " disabled"}></label>
        <label class="campo campo-largo"><span>Observação</span>
          <input data-p="obs" value="${esc(pr.obs)}"${PODE ? "" : " disabled"}></label>
      </div>
      <div class="rolagem"><table class="rec-tab">
        <thead><tr><th>Item</th><th>Pedido (OC)</th><th>Enviado (kg)</th><th>Peixes</th>
          <th>Caixas</th><th>Calibre</th><th>Enviado × pedido</th></tr></thead>
        <tbody>${r.itens.map((i) => `<tr data-linha="${esc(i.chave)}">
          <td>${esc(i.nome)}</td>
          <td class="calc">${fmt(i.pedido_qtd, 3)} <span class="un">${esc(i.pedido_un)}</span></td>
          <td>${campo(i, "real_kg", "Quilos que o fornecedor diz que enviou")}</td>
          <td>${campo(i, "real_peixes", "Quantidade de peixes enviados", 60)}</td>
          <td>${campo(i, "real_caixas", "Quantidade de caixas", 60)}</td>
          <td>${campo(i, "real_calibre", "Libragem/calibre enviado, ex. 10/12", 70)}</td>
          <td class="calc dif-real"></td></tr>`).join("")}</tbody>
      </table></div>
      <p class="login-erro" id="erro-${esc(r.id)}" role="alert"></p>
      <div class="us-acoes">
        ${PODE ? `<button class="botao" data-acao="salvar">Salvar rascunho</button>
        <button class="botao primario" data-acao="real">Lançar pedido real</button>` : ""}
      </div>
    </div>`;
  }

  function corpoRec(r) {
    const pr = r.pedido_real, cf = r.conferencia, fechado = r.situacao === "conferido";
    const ed = PODE && !fechado;
    const cel = (i, c, dica, w) => ed ? campo(i, c, dica, w)
      : (c === "rec_kg" ? kg(i[c]) : c === "obs" ? esc(i.obs || "") : int(i[c]));
    return `<div class="rec-corpo">
      <p class="fonte">Pedido real ${pr.documento ? "<b>" + esc(pr.documento) + "</b> " : ""}lançado
        ${quando(pr.lancado_em)}${pr.lancado_por ? " por " + esc(pr.lancado_por) : ""}${
        pr.obs ? " · " + esc(pr.obs) : ""}.
        ${fechado ? `Conferido ${quando(cf.conferido_em)}${cf.conferido_por ? " por " + esc(cf.conferido_por) : ""}.`
                  : "Pese e conte na chegada e lance o recebido."}</p>
      <div class="rolagem"><table class="rec-tab">
        <thead><tr><th>Item</th><th>Pedido</th><th>Enviado</th><th>Recebido (kg)</th><th>Peixes</th>
          <th>Caixas</th><th>Recebido × enviado</th><th>Observação</th></tr></thead>
        <tbody>${r.itens.map((i) => `<tr data-linha="${esc(i.chave)}">
          <td>${esc(i.nome)}</td>
          <td class="calc">${fmt(i.pedido_qtd, 3)} <span class="un">${esc(i.pedido_un)}</span></td>
          <td class="calc">${kg(i.real_kg)}<span class="msg-conv">${int(i.real_peixes)} px · ${int(i.real_caixas)} cx${
            i.real_calibre ? " · " + esc(i.real_calibre) : ""}</span></td>
          <td>${cel(i, "rec_kg", "Quilos pesados na chegada")}</td>
          <td>${cel(i, "rec_peixes", "Peixes contados", 60)}</td>
          <td>${cel(i, "rec_caixas", "Caixas recebidas", 60)}</td>
          <td class="calc dif-rec"></td>
          <td style="text-align:left">${ed ? `<input data-i="${esc(i.chave)}" data-c="obs" value="${esc(i.obs || "")}"
                style="width:170px;text-align:left">` : esc(i.obs || "")}</td></tr>`).join("")}</tbody>
      </table></div>
      ${ed ? `<label class="campo campo-largo" style="margin-top:12px"><span>Observação da conferência</span>
          <input data-cf="obs" value="${esc(cf.obs || "")}"></label>`
          : cf.obs ? `<p class="fonte">Observação: ${esc(cf.obs)}</p>` : ""}
      <p class="login-erro" id="erro-${esc(r.id)}" role="alert"></p>
      <div class="us-acoes">
        <button class="botao" data-acao="imprimir">Imprimir documento</button>
        ${ed ? `<button class="botao" data-acao="salvar">Salvar</button>
          <button class="botao primario" data-acao="conferir">Confirmar recebimento</button>
          <button class="botao" data-acao="reabrir" data-para="aguardando_real"
            title="Volta para lançar de novo o pedido real">Corrigir pedido real</button>` : ""}
        ${PODE && fechado ? `<button class="botao" data-acao="reabrir" data-para="aguardando_recebimento">Reabrir conferência</button>` : ""}
      </div>
    </div>`;
  }

  // ---------------------------------------------------------------- diferenças ao vivo
  function difTexto(a, b, un, tol) {
    if (vazio(a) || vazio(b)) return "";
    const d = Number(a) - Number(b);
    if (Math.abs(d) <= tol + 1e-9) return `<span class="selo-mini">bate</span>`;
    const casas = un === "kg" ? 3 : 0;
    return `<span class="rec-dif">${d > 0 ? "sobrou " : "faltou "}${fmt(Math.abs(d), casas)} ${un}</span>`;
  }

  function atualizarDifs(r) {
    const sec = document.querySelector(`section[data-id="${CSS.escape(r.id)}"]`);
    if (!sec) return;
    r.itens.forEach((i) => {
      const tr = sec.querySelector(`tr[data-linha="${CSS.escape(i.chave)}"]`);
      if (!tr) return;
      const dr = tr.querySelector(".dif-real");
      if (dr) {
        if (vazio(i.real_kg) || vazio(i.pedido_kg)) dr.textContent = "—";
        else {
          const d = Number(i.real_kg) - Number(i.pedido_kg);
          const pct = i.pedido_kg ? (d / i.pedido_kg) * 100 : 0;
          dr.innerHTML = Math.abs(d) <= TOL_KG ? "igual ao pedido"
            : `${d > 0 ? "acima" : "abaixo"} ${fmt(Math.abs(d), 3)} kg (${fmt(Math.abs(pct), 1)}%)`;
        }
      }
      const dc = tr.querySelector(".dif-rec");
      if (dc) {
        const partes = [difTexto(i.rec_kg, i.real_kg, "kg", TOL_KG),
                        difTexto(i.rec_peixes, i.real_peixes, "px", 0),
                        difTexto(i.rec_caixas, i.real_caixas, "cx", 0)].filter(Boolean);
        const bate = partes.every((p) => p.includes(">bate<"));
        dc.innerHTML = !partes.length ? "—" : bate ? '<span class="selo bom">bate</span>'
          : partes.filter((p) => !p.includes(">bate<")).join("<br>");
      }
    });
  }

  // ---------------------------------------------------------------- ações
  function ligar() {
    $$("[data-abrir]").forEach((c) => {
      c.onclick = () => { ABERTA = ABERTA === c.dataset.abrir ? null : c.dataset.abrir; desenhar(); };
    });
    if (!ABERTA) return;
    const r = D.recebimentos.find((x) => x.id === ABERTA);
    const sec = document.querySelector(`section[data-id="${CSS.escape(ABERTA)}"]`);
    if (!r || !sec) return;
    atualizarDifs(r);
    sec.querySelectorAll("input[data-c]").forEach((el) => {
      el.oninput = () => {
        const i = r.itens.find((x) => x.chave === el.dataset.i);
        const c = el.dataset.c;
        i[c] = c === "obs" || c.endsWith("calibre") ? el.value
          : (el.value.trim() === "" ? null : num(el.value));
        atualizarDifs(r);
      };
    });
    sec.querySelectorAll("input[data-p]").forEach((el) => {
      el.oninput = () => { r.pedido_real[el.dataset.p] = el.value; };
    });
    sec.querySelectorAll("input[data-cf]").forEach((el) => {
      el.oninput = () => { r.conferencia.obs = el.value; };
    });
    sec.querySelectorAll("[data-acao]").forEach((b) => {
      b.onclick = () => acao(r, b.dataset.acao, b.dataset.para);
    });
  }

  async function acao(r, qual, para) {
    if (qual === "imprimir") return imprimir(r);
    const erro = document.getElementById("erro-" + r.id);
    if (qual === "conferir") {
      const dv = r.itens.some((i) => [["kg", TOL_KG], ["peixes", 0], ["caixas", 0]].some(([c, tol]) =>
        !vazio(i["rec_" + c]) && !vazio(i["real_" + c]) && Math.abs(i["rec_" + c] - i["real_" + c]) > tol + 1e-9));
      if (!confirm(dv ? "O recebido NÃO bate com o enviado pelo fornecedor. Confirmar o recebimento com divergência?"
                      : "Confirmar o recebimento? Tudo bate com o enviado.")) return;
    }
    if (qual === "real" && !confirm("Lançar o pedido real? A loja passa a conferir com estes números.")) return;
    if (qual === "reabrir" && !confirm(para === "aguardando_real"
        ? "Voltar para o lançamento do pedido real?" : "Reabrir a conferência deste recebimento?")) return;
    const corpo = { id: r.id, acao: qual, para,
      itens: r.itens.map((i) => ({ chave: i.chave, real_kg: i.real_kg, real_peixes: i.real_peixes,
        real_caixas: i.real_caixas, real_calibre: i.real_calibre, rec_kg: i.rec_kg,
        rec_peixes: i.rec_peixes, rec_caixas: i.rec_caixas, obs: i.obs })),
      pedido_real: r.pedido_real, conferencia: { obs: r.conferencia.obs } };
    if (erro) erro.textContent = "";
    const resp = await fetch("/api/recebimento", { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const j = await resp.json().catch(() => ({}));
    if (!resp.ok) { if (erro) erro.textContent = j.erro || "não foi possível salvar"; return; }
    const msg = { salvar: "Salvo.", real: "Pedido real lançado — aguardando recebimento na loja.",
                  conferir: j.recebimento.divergencias.length ? "Recebimento conferido com divergência."
                    : "Recebimento conferido.", reabrir: "Reaberto." }[qual];
    aviso(msg, qual === "conferir" && j.recebimento.divergencias.length ? "mau" : "bom");
    if (qual !== "salvar") FILTRO = j.recebimento.situacao === "conferido" ? "conferido" : j.recebimento.situacao;
    $$("#filtro button").forEach((b) => b.classList.toggle("ativa", b.dataset.f === FILTRO));
    await carregar();
  }

  // ---------------------------------------------------------------- documento impresso
  function imprimir(r) {
    const pr = r.pedido_real, t = totais(r);
    $("#doc-rec").innerHTML = `
      <div class="dr-cab">
        <div><h1>Ordem de Recebimento — Salmão</h1>
          <p>${esc(r.casa_nome)} · ${esc(r.fornecedor)}</p></div>
        <div class="dr-ids">OC ${r.numero_oc ? "nº " + esc(r.numero_oc) : "—"}<br>
          Pedido real: ${esc(pr.documento || "—")}<br>
          Pedido de ${brDate(r.data)}${pr.previsto ? " · chegada " + brDate(pr.previsto) : ""}</div>
      </div>
      <p class="dr-instr">Pese o que chegou, conte as caixas e anote nas colunas em branco. Diferença em relação ao
        enviado: anote na observação e avise Compras antes de assinar.</p>
      <table class="dr-tab">
        <thead><tr><th rowspan="2">Item</th>
          <th colspan="3">Enviado pelo fornecedor</th><th colspan="2">Recebido na loja</th><th rowspan="2">Observação</th></tr>
          <tr><th>kg</th><th>Caixas</th><th>Calibre</th><th>kg</th><th>Caixas</th></tr></thead>
        <tbody>${r.itens.map((i) => `<tr><td>${esc(i.nome)}</td>
          <td>${vazio(i.real_kg) ? "" : fmt(i.real_kg, 3)}</td>
          <td>${vazio(i.real_caixas) ? "" : fmt(i.real_caixas, 0)}</td><td>${esc(i.real_calibre || "")}</td>
          <td class="dr-branco">${vazio(i.rec_kg) ? "" : fmt(i.rec_kg, 3)}</td>
          <td class="dr-branco">${vazio(i.rec_caixas) ? "" : fmt(i.rec_caixas, 0)}</td>
          <td class="dr-branco">${esc(i.obs || "")}</td></tr>`).join("")}
          <tr class="dr-total"><td>Total</td>
            <td>${t.real !== null ? fmt(t.real, 3) : ""}</td><td colspan="2"></td>
            <td class="dr-branco">${t.rec !== null ? fmt(t.rec, 3) : ""}</td><td colspan="2" class="dr-branco"></td></tr>
        </tbody>
      </table>
      ${pr.obs ? `<p class="dr-instr">Obs. do pedido real: ${esc(pr.obs)}</p>` : ""}
      <div class="dr-assin">
        <div>Recebido por<span></span></div><div>Data e hora da chegada<span></span></div>
        <div>Temperatura na chegada<span></span></div>
      </div>
      <p class="dr-rodape">Emitido pelo CDE em ${new Date().toLocaleString("pt-BR")}</p>`;
    document.body.classList.add("imprimindo-rec");
    const fim = () => { document.body.classList.remove("imprimindo-rec"); window.removeEventListener("afterprint", fim); };
    window.addEventListener("afterprint", fim);
    window.print();
  }

  // ---------------------------------------------------------------- início
  $$("#filtro button").forEach((b) => {
    b.onclick = () => {
      FILTRO = b.dataset.f;
      $$("#filtro button").forEach((x) => x.classList.toggle("ativa", x === b));
      desenhar();
    };
  });
  (async () => {
    try {
      const eu = await window.CDE_EU;
      if (eu && eu.permissoes && eu.permissoes.recebimento !== "editar") PODE = false;
    } catch (e) { /* login desligado: pode */ }
    const alvo = new URLSearchParams(location.search).get("id");
    await carregar();
    if (alvo) {
      const r = D.recebimentos.find((x) => x.id === alvo);
      if (r) {
        ABERTA = r.id; FILTRO = r.situacao;
        $$("#filtro button").forEach((b) => b.classList.toggle("ativa", b.dataset.f === FILTRO));
        desenhar();
      }
    }
  })();
})();
