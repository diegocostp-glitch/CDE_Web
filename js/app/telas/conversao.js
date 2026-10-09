// ============================================================================
// Conversão de salmão — cópia do módulo do Gerador de OCs, no padrão do CDE.
// O Gerador continua com o seu; este é independente e não mexe naquele.
//
// Converte o preço pago no insumo principal (R$/kg do peixe inteiro) no custo
// de cada subproduto, em dois estágios de rendimento:
//   Estágio 1 — bandagem:    inteiro       → filé com pele
//   Estágio 2 — filetamento: filé com pele → filé sem pele (limpo)
//
// Em cada estágio só os coprodutos que vão ao estoque absorvem parte do custo;
// o que sobra é jogado no produto principal daquele estágio. Descarte
// (cabeça+espinhaço, apara, pele, lixo+perda) não absorve nada.
//
// A apara e a pele saem no ESTÁGIO 2, não na bandagem — por isso a pesagem
// intermediária se chama "filé com pele E APARA": ali as duas ainda estão
// dentro da peça. Consequência ao ler a tabela: as linhas APARA e PELE estão
// DENTRO do peso do filé com pele, então a coluna de fatores não soma 1. Quem
// fecha em 1 é cada estágio separadamente — é isso que as verificações checam.
//
// Os fatores não são fixos no código: podem ser recalibrados na própria tela e
// ficam no localStorage deste sistema (chave própria, separada do Gerador). O
// botão de ações lê a mesma chave.
// ============================================================================
import { html, useState, useRef } from "../html.js";
import { numSemMilhar as num, fmtZero as fmt } from "../formato.js";
import { aviso } from "../componentes/Aviso.js";
import { montarTela } from "../montar.js";

const CV_KEY = "cde_conversor_fatores_v1";
const CV_TOL = 0.01;
const AVISO_MS = 3400;      // o tempo de aviso que esta tela sempre usou

const CV_SEED = {
  SALMAO_INTEIRO_EVISCERADO: {
    nome: "Salmão inteiro eviscerado",
    // O BANDADO é o mesmo peixe num estado anterior ao filé — inteiro sem
    // cabeça, espinhaço, espinha e líquido —, e é assim que ele vai para a
    // câmara. Por isso ele NÃO entra na soma dos estágios: não é uma saída do
    // processo ao lado da apara e da pele, é o produto principal antes do corte
    // seguinte. Fator medido na planilha "conversos salmao.xlsx": 10,318 kg de
    // bandado a partir dos mesmos 12,874 kg de inteiro.
    intermediario: { fator_bandado: 0.8015 },
    // Bandagem — 12,874 kg de inteiro → 8,646 filé c/ pele · 0,140 raspa · 4,088 descarte.
    estagio1: { fator_file_com_pele: 0.6716, fator_cabeca_espinhaco: 0.1833,
                fator_raspa: 0.0109, fator_lixo_perda: 0.1342 },
    // Filetamento — 8,646 kg de filé c/ pele → 6,926 limpo · 0,766 apara · 0,954 pele.
    // Fecha sem sobra: a perda deste estágio é zero nos três processos medidos.
    estagio2: { fator_file_limpo: 0.8011, fator_apara: 0.0886,
                fator_pele: 0.1103, fator_lixo_perda: 0 },
    fonte: "Relatório de processamento — Delivery Umarizal (3 peixes, 12,874 kg de inteiro), "
         + "planilha conversos salmao.xlsx",
  },
};

const CV_CAMPOS = {
  intermediario: [["fator_bandado", "Salmão bandado (armazenamento)"]],
  estagio1: [["fator_file_com_pele", "Filé com pele (leva apara e pele)"],
             ["fator_cabeca_espinhaco", "Cabeça + espinhaço"],
             ["fator_raspa", "Raspa"], ["fator_lixo_perda", "Lixo + perda"]],
  estagio2: [["fator_file_limpo", "Filé sem pele (limpo)"], ["fator_apara", "Apara"],
             ["fator_pele", "Pele"], ["fator_lixo_perda", "Lixo + perda"]],
};

// Fatores salvos sobrescrevem o padrão campo a campo — assim, se o padrão
// ganhar um campo novo, quem já calibrou também recebe o campo.
function carregarFatores() {
  const base = JSON.parse(JSON.stringify(CV_SEED));
  try {
    const salvos = JSON.parse(localStorage.getItem(CV_KEY)) || {};
    Object.keys(salvos).forEach((k) => {
      if (!base[k]) { base[k] = salvos[k]; return; }
      Object.assign(base[k].intermediario, salvos[k].intermediario || {});
      Object.assign(base[k].estagio1, salvos[k].estagio1 || {});
      Object.assign(base[k].estagio2, salvos[k].estagio2 || {});
    });
  } catch (e) { /* localStorage indisponível: segue no padrão */ }
  return base;
}
const salvarFatores = (cv) => { try { localStorage.setItem(CV_KEY, JSON.stringify(cv)); } catch (e) {} };

// ------------------------------------------------------------------ cálculo
function calcular(cfg, preco) {
  const e1 = cfg.estagio1, e2 = cfg.estagio2;
  const fBandado = (cfg.intermediario || {}).fator_bandado || 0;

  // Bandado: o que sai antes dele (cabeça, espinhaço, espinha e líquido) é
  // descarte e não absorve custo, então o quilo do inteiro inteiro se concentra
  // nos 0,8015 kg que sobram. É a mesma regra dos outros cortes, um passo antes.
  const precoBandado = fBandado > 0 ? preco / fBandado : 0;

  // Estágio 1: a raspa absorve o custo do seu próprio peso; o resto sobe no filé.
  const absorvidoRaspa = e1.fator_raspa * preco;
  const precoFileComPele = e1.fator_file_com_pele > 0
    ? (preco - absorvidoRaspa) / e1.fator_file_com_pele : 0;
  // Estágio 2: apara, pele e perda são descarte e não absorvem nada, então todo
  // o custo que entrou é jogado no filé limpo.
  const precoFileLimpo = e2.fator_file_limpo > 0 ? precoFileComPele / e2.fator_file_limpo : 0;

  // Ponte entre os estágios: os fatores do estágio 2 são por kg de filé COM
  // pele; multiplicar pelo rendimento da bandagem os traz para kg de inteiro.
  const f = e1.fator_file_com_pele;
  const linhas = [
    { item: "Salmão bandado (armazenamento)", fator: fBandado, preco: precoBandado,
      estoque: true, intermediario: true },
    { item: "Filé com pele (limpo)", fator: f, preco: precoFileComPele, estoque: true },
    { item: "Filé sem pele (limpo)", fator: f * e2.fator_file_limpo, preco: precoFileLimpo, estoque: true },
    { item: "Raspa", fator: e1.fator_raspa, preco: preco, estoque: true },
    { item: "Cabeça + espinhaço", fator: e1.fator_cabeca_espinhaco, preco: 0, estoque: false },
    { item: "Apara", fator: f * e2.fator_apara, preco: 0, estoque: false },
    { item: "Pele", fator: f * e2.fator_pele, preco: 0, estoque: false },
    { item: "Lixo + perda", fator: e1.fator_lixo_perda + f * e2.fator_lixo_perda, preco: 0, estoque: false },
  ];

  // Verificações, a cada render: (1) os fatores de cada estágio somam 1 — todo
  // o peso que entrou saiu; (2) o custo distribuído fecha com o que entrou.
  const avisos = [];
  const soma = (obj, est) => CV_CAMPOS[est].reduce((a, c) => a + (obj[c[0]] || 0), 0);
  const s1 = soma(e1, "estagio1"), s2 = soma(e2, "estagio2");
  if (!isFinite(s1) || Math.abs(s1 - 1) > CV_TOL)
    avisos.push("Os fatores do estágio 1 somam " + fmt(s1, 4) + " — deveriam somar 1,0000.");
  if (!isFinite(s2) || Math.abs(s2 - 1) > CV_TOL)
    avisos.push("Os fatores do estágio 2 somam " + fmt(s2, 4) + " — deveriam somar 1,0000.");
  // O bandado fica fora da soma dos estágios, mas tem duas coerências próprias:
  // é uma fração do peixe e vem ANTES do filé, então precisa ser maior que ele.
  if (fBandado <= 0 || fBandado > 1)
    avisos.push("O fator do salmão bandado precisa ficar entre 0 e 1 (medido: 0,8015).");
  else if (fBandado < e1.fator_file_com_pele)
    avisos.push("O bandado (" + fmt(fBandado, 4) + ") ficou menor que o filé com pele ("
      + fmt(e1.fator_file_com_pele, 4) + ") — o bandado vem antes na linha, não pode render menos.");
  if (e1.fator_file_com_pele <= 0) avisos.push("O fator de filé com pele precisa ser maior que zero.");
  if (e2.fator_file_limpo <= 0) avisos.push("O fator de filé sem pele precisa ser maior que zero.");
  if (preco > 0) {
    const v1 = absorvidoRaspa + e1.fator_file_com_pele * precoFileComPele;
    const v2 = e2.fator_file_limpo * precoFileLimpo;
    if (!isFinite(v1) || Math.abs(v1 - preco) > CV_TOL)
      avisos.push("O estágio 1 não fechou: R$ " + fmt(v1) + " distribuídos contra R$ " + fmt(preco) + " de entrada.");
    if (!isFinite(v2) || Math.abs(v2 - precoFileComPele) > CV_TOL)
      avisos.push("O estágio 2 não fechou: R$ " + fmt(v2) + " distribuídos contra R$ " + fmt(precoFileComPele) + " de entrada.");
  }
  return { precoBandado, precoFileComPele, precoFileLimpo, linhas, avisos };
}

// ------------------------------------------------------------------ fatores
// Campo de fator: livre enquanto se digita; ao sair (change), valida, arredonda
// em quatro casas, grava no localStorage e reescreve no formato 0,0000.
function CampoFator({ est, campo, rotulo, valor, aoMudar }) {
  const [texto, setTexto] = useState(fmt(valor || 0, 4));
  // Como o "change" do campo antigo: sair sem ter mexido não grava nada.
  const gravado = useRef(texto);
  const confirmar = () => {
    if (texto === gravado.current) return;
    let v = num(texto);
    if (!isFinite(v) || v < 0) {
      v = valor || 0;
      aviso("Fator inválido — informe um número positivo (ex.: 0,6716).", "mau", AVISO_MS);
    }
    v = Math.round(v * 10000) / 10000;
    gravado.current = fmt(v, 4);
    setTexto(gravado.current);
    aoMudar(est, campo, v);
  };
  return html`<label class="campo"><span>${rotulo}</span>
    <input type="text" inputmode="decimal" data-est=${est} data-campo=${campo}
      value=${texto} onInput=${(e) => setTexto(e.target.value)} onChange=${() => {}}
      onBlur=${confirmar} onKeyDown=${(e) => { if (e.key === "Enter") confirmar(); }} /></label>`;
}

function Fatores({ cfg, chaveInsumo, versao, aoMudar, aoRestaurar }) {
  const grade = (est) => html`<div class="grade-fatores">${CV_CAMPOS[est].map(([campo, rot]) =>
    html`<${CampoFator} key=${chaveInsumo + est + campo + versao} est=${est} campo=${campo}
      rotulo=${rot} valor=${cfg[est][campo]} aoMudar=${aoMudar} />`)}</div>`;
  return html`<div class="ordem-corpo">
    <div class="cv-estagio">Armazenamento — bandado (inteiro → bandado) · kg por kg de inteiro</div>
    ${grade("intermediario")}
    <p class="fonte">O bandado é o peixe sem cabeça, espinhaço, espinha e líquido, do jeito que
      vai para a câmara. Fica fora da soma dos estágios porque é etapa, não saída.</p>
    <div class="cv-estagio">Estágio 1 — bandagem (inteiro → filé com pele) · kg por kg de inteiro</div>
    ${grade("estagio1")}
    <div class="cv-estagio">Estágio 2 — filetamento (filé com pele → filé limpo) · kg por kg de filé com pele</div>
    ${grade("estagio2")}
    <div class="ordem-acoes">
      <span class="fonte">Fonte: ${cfg.fonte || "não informada"} ·
        os fatores de cada estágio devem somar 1,0000.</span>
      <span style=${{ flex: 1 }}></span>
      <button class="botao" id="cv-restaurar" onClick=${aoRestaurar}>Restaurar padrão</button>
    </div></div>`;
}

// ------------------------------------------------------------------ tela
function Conversao() {
  const [cv, setCv] = useState(carregarFatores);
  const [chaveInsumo, setChaveInsumo] = useState(() => Object.keys(cv)[0]);
  const [bruto, setBruto] = useState("");
  const [aberto, setAberto] = useState(false);
  // muda a cada "Restaurar padrão", para os campos de fator renascerem com o
  // valor original (eles guardam o texto digitado no próprio estado)
  const [versao, setVersao] = useState(0);

  const cfg = cv[chaveInsumo];
  const preco = num(bruto.trim());
  const valido = isFinite(preco) && preco > 0;
  const invalido = !!bruto.trim() && !valido;
  const r = calcular(cfg, valido ? preco : 0);
  const dinheiro = (v) => "R$ " + fmt(isFinite(v) ? v : 0);
  const val = (v) => (valido ? dinheiro(v) : "—");
  const rend = cfg.estagio1.fator_file_com_pele * cfg.estagio2.fator_file_limpo;

  const mudarFator = (est, campo, v) => {
    setCv((velho) => {
      const novo = JSON.parse(JSON.stringify(velho));
      novo[chaveInsumo][est][campo] = v;
      salvarFatores(novo);
      return novo;
    });
  };
  const restaurar = () => {
    if (!CV_SEED[chaveInsumo]) { aviso("Este insumo não tem fatores padrão.", "", AVISO_MS); return; }
    if (!confirm("Os fatores voltarão aos valores do relatório original. A calibração atual será perdida.")) return;
    const novo = Object.assign({}, cv, { [chaveInsumo]: JSON.parse(JSON.stringify(CV_SEED[chaveInsumo])) });
    salvarFatores(novo);
    setCv(novo);
    setVersao((n) => n + 1);
    aviso("Fatores restaurados.", "bom", AVISO_MS);
  };
  const alternar = () => setAberto((a) => !a);

  return html`<main class="main-content">
    <div class="screen-header">
      <div>
        <h1>Conversão de Salmão</h1>
        <p>Transforma o preço pago no peixe inteiro no custo real de cada subproduto,
           em dois estágios de rendimento.</p>
      </div>
    </div>

    <section class="barra">
      <label class="campo"><span>Insumo</span>
        <select id="cv-insumo" value=${chaveInsumo} onChange=${(e) => setChaveInsumo(e.target.value)}>
          ${Object.keys(cv).map((k) => html`<option key=${k} value=${k}>${cv[k].nome || k}</option>`)}
        </select></label>
      <label class="campo"><span>Preço pago por quilo do inteiro</span>
        <input type="text" id="cv-preco" inputmode="decimal" placeholder="R$ 0,00" style=${{ width: "150px" }}
          value=${bruto}
          onInput=${(e) => setBruto(e.target.value)} onChange=${() => {}}
          onFocus=${() => { const v = num(bruto); setBruto(v > 0 ? fmt(v) : ""); }}
          onBlur=${() => { const v = num(bruto); setBruto(v > 0 ? "R$ " + fmt(Math.round(v * 100) / 100) : ""); }} /></label>
      <span class="fonte" id="cv-hint" style=${invalido ? { color: "var(--ruim)" } : null}>
        ${invalido ? "Informe um valor maior que zero." : "Informe o valor por quilo do insumo inteiro eviscerado."}</span>
    </section>

    <div id="cv-alerta">${r.avisos.length ? html`<p class="nota-aviso">
      <strong>Verifique os fatores de rendimento</strong><br />
      ${r.avisos.map((a, i) => html`${i ? html`<br />` : null}${a}`)}</p>` : null}</div>

    <div class="placar" id="cv-stats">
      ${[
        [val(r.precoBandado), "Bandado (armazenamento)"],
        [val(r.precoFileComPele), "Filé com pele (estágio 1)"],
        [val(r.precoFileLimpo), "Filé sem pele (estágio 2)"],
        [fmt(rend * 100, 2) + "%", "Rendimento até o filé sem pele"],
      ].map(([n, r2]) => html`<div key=${r2} class="ficha estatica"><div class="ficha-vals">
          <span class="ficha-n">${n}</span><span class="fonte">${r2}</span>
        </div></div>`)}
    </div>

    <section class="cartao">
      <div class="cabeca"><h2>Custo por subproduto</h2>
        <span class="fonte">Só o que vai para o estoque absorve custo</span></div>
      <div class="rolagem"><table>
        <thead><tr><th>Item</th><th>Fator (kg por kg de inteiro)</th>
          <th>Custo por kg</th><th>Vai para o estoque</th></tr></thead>
        <tbody id="cv-body">
          ${r.linhas.map((l) => html`<tr key=${l.item}>
            <td>${l.item}</td>
            <td class="calc">${fmt(isFinite(l.fator) ? l.fator : 0, 4)}</td>
            <td class="calc">${l.estoque ? val(l.preco) : dinheiro(0)}</td>
            <td>${l.estoque
              ? html`<span class="selo bom">Sim</span>${l.intermediario
                  ? html` <span class="selo-mini" title="É o mesmo peixe antes do corte seguinte: não some com os outros">etapa</span>`
                  : null}`
              : html`<span class="selo neutro">Não — descarte</span>`}</td>
          </tr>`)}
        </tbody>
      </table></div>
    </section>

    <section class="cartao">
      <div class="cabeca cv-toggle" id="cv-abrir" role="button" tabindex="0"
        onClick=${alternar}
        onKeyDown=${(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alternar(); } }}>
        <h2>Fatores de rendimento</h2>
        <span class="fonte" id="cv-fonte">${cfg.fonte || ""}</span>
        <span class="ordem-chev" id="cv-chev">${aberto ? "▾" : "▸"}</span>
      </div>
      <div id="cv-fatores" hidden=${!aberto}>
        <${Fatores} cfg=${cfg} chaveInsumo=${chaveInsumo} versao=${versao}
          aoMudar=${mudarFator} aoRestaurar=${restaurar} />
      </div>
    </section>
  </main>`;
}

montarTela("conversao", Conversao);
