// ============================================================================
// CDE Web - tela Usuarios (so administrador). Regras e gravacao em acesso.py.
// ============================================================================
(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ROTULO = { nenhum: "Sem acesso", ver: "Só ver", editar: "Ver e editar" };
  let D = null, ATUAL = null, PERM = {};

  async function carregar() {
    const r = await fetch("/api/usuarios");
    if (!r.ok) { $("#lista").innerHTML = '<tr><td>Sem acesso a esta tela.</td></tr>'; return; }
    D = await r.json();
    document.querySelectorAll(".sm").forEach((e) => { e.textContent = D.senha_minima; });
    $("#ed-perfil").innerHTML = '<option value="">—</option>' +
      Object.keys(D.modelos).map((m) => `<option>${esc(m)}</option>`).join("");
    desenharLista();
  }

  function resumo(u) {
    const n = { editar: 0, ver: 0 };
    Object.values(u.permissoes).forEach((v) => { if (n[v] !== undefined) n[v]++; });
    return `${n.editar} para editar · ${n.ver} só ver`;
  }

  function desenharLista() {
    $("#lista").innerHTML = "<thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Acesso</th>" +
      "<th>Situação</th></tr></thead><tbody>" +
      (D.usuarios.length ? D.usuarios.map((u) => `
        <tr data-u="${esc(u.usuario)}" class="clicavel">
          <td>${esc(u.nome)}${u.admin ? ' <span class="selo laranja">administrador</span>' : ""}</td>
          <td>${esc(u.usuario)}</td><td>${esc(u.perfil || "—")}</td>
          <td>${resumo(u)}</td>
          <td>${u.ativo ? (u.troca_senha ? '<span class="selo aviso">senha provisória</span>'
                                         : '<span class="selo bom">ativo</span>')
                        : '<span class="selo neutro">desativado</span>'}</td>
        </tr>`).join("") : '<tr><td colspan="5">Nenhum usuário.</td></tr>') + "</tbody>";
    document.querySelectorAll("#lista [data-u]").forEach((tr) => {
      tr.onclick = () => abrir(D.usuarios.find((u) => u.usuario === tr.dataset.u));
    });
  }

  function desenharMatriz() {
    $("#matriz").innerHTML = "<thead><tr><th>Tela</th>" +
      D.niveis.map((n) => `<th>${ROTULO[n]}</th>`).join("") + "</tr></thead><tbody>" +
      D.telas.map((t) => `<tr><td>${esc(t.rotulo)}</td>` + D.niveis.map((n) =>
        `<td><input type="radio" name="p-${t.id}" value="${n}" ${PERM[t.id] === n ? "checked" : ""}
           aria-label="${esc(t.rotulo)}: ${ROTULO[n]}"></td>`).join("") + "</tr>").join("") + "</tbody>";
    $("#matriz").querySelectorAll("input").forEach((i) => {
      i.onchange = () => { PERM[i.name.slice(2)] = i.value; };
    });
  }

  function abrir(u) {
    ATUAL = u;
    const novo = !u;
    $("#editor").hidden = false;
    $("#ed-titulo").textContent = novo ? "Novo usuário" : "Editar " + u.nome;
    $("#ed-nome").value = novo ? "" : u.nome;
    $("#ed-usuario").value = novo ? "" : u.usuario;
    $("#ed-usuario-l").hidden = !novo;
    $("#ed-senha-l").hidden = !novo;
    $("#ed-senha").value = "";
    $("#ed-redefinir").hidden = novo;
    $("#ed-nova").value = "";
    $("#ed-ativo-l").hidden = novo;
    $("#ed-ativo").checked = novo ? true : u.ativo;
    $("#ed-admin").checked = novo ? false : u.admin;
    $("#ed-perfil").value = novo ? "" : (u.perfil || "");
    PERM = novo ? Object.fromEntries(D.telas.map((t) => [t.id, "nenhum"])) : { ...u.permissoes };
    $("#ed-erro").textContent = "";
    desenharMatriz();
    $("#editor").scrollIntoView({ behavior: "smooth" });
  }

  async function postar(corpo) {
    $("#ed-erro").textContent = "";
    const r = await fetch("/api/usuarios", { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { $("#ed-erro").textContent = j.erro || "não foi possível salvar"; return null; }
    D = j;
    desenharLista();
    return j;
  }

  $("#ed-perfil").onchange = () => {
    const m = D.modelos[$("#ed-perfil").value];
    if (!m) return;
    PERM = { ...m.permissoes };
    $("#ed-admin").checked = m.admin;
    desenharMatriz();
  };

  $("#ed-salvar").onclick = async () => {
    const base = { nome: $("#ed-nome").value, perfil: $("#ed-perfil").value,
                   admin: $("#ed-admin").checked, permissoes: PERM };
    const j = ATUAL
      ? await postar({ acao: "salvar", usuario: ATUAL.usuario, ativo: $("#ed-ativo").checked, ...base })
      : await postar({ acao: "criar", usuario: $("#ed-usuario").value, senha: $("#ed-senha").value, ...base });
    if (j) {
      const login = ATUAL ? ATUAL.usuario : $("#ed-usuario").value.trim().toLowerCase();
      abrir(D.usuarios.find((u) => u.usuario === login));
      $("#ed-erro").textContent = "Salvo.";
    }
  };

  $("#ed-redefinir-btn").onclick = async () => {
    if (!ATUAL) return;
    const j = await postar({ acao: "redefinir_senha", usuario: ATUAL.usuario, senha: $("#ed-nova").value });
    if (j) {
      $("#ed-nova").value = "";
      $("#ed-erro").textContent = "Senha redefinida. Na próxima entrada a pessoa escolhe a dela.";
    }
  };

  $("#novo").onclick = () => abrir(null);
  $("#ed-fechar").onclick = () => { $("#editor").hidden = true; };
  carregar();
})();
