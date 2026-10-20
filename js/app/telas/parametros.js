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
//
// Como na tela antiga, a tabela de estoque é "redesenhada" (os campos voltam a
// mostrar o valor guardado, e a contagem do topo se refaz) ao filtrar, ao
// preencher com a sugestão e ao salvar — não a cada tecla.
// ============================================================================
import { html, useState, useEffect, useRef } from "../html.js";
import { num, fmt, busca, chave, limpaNome } from "../formato.js";
import * as api from "../api.js";
import { Estado } from "../componentes/Aviso.js";
import { montarTela } from "../montar.js";

const CASAS_PRAZO = ["SL", "DC", "DLU", "DLCN"];

// A regra vem do servidor: se a janela ou os dias de uso mudarem na seção de
// baixo, o texto acompanha em vez de mentir um "14 × 7" fixo.
function rotuloRegra(DADOS) {
  const r = (DADOS && DADOS.regra) || {};
  return `Calculado pela regra da casa: média diária dos últimos ${r.janela || 14}`
    + ` dias × prazo de entrega do insumo (coluna Prazo) — o estoque que precisa`
    + ` existir quando o pedido sai, para a casa não zerar antes de a mercadoria`
    + ` chegar. Insumo sem prazo cadastrado usa ${r.dias_uso ?? 7} dia(s) de segurança.`
    + ` Peixe, pacote e bisnaga arredondam para cima, inteiros.`;
}

function textoPrazo(l) {
  if (l.origem === "sem_fornecedor") return "sem fornecedor";
  if (l.cobertura == null) return "—";
  return fmt(l.cobertura, 0) + " d" + (l.origem === "seguranca" ? " (segurança)" : "");
}

const chaveDe = (l) => l.chave + "|" + l.casa;
const formatado = (v) => v == null || v === "" ? "" : fmt(num(v), 3);

function Parametros() {
  const D = useRef(null);
  // Guarda o que está digitado por (insumo, casa), e não por posição na tela: o
  // filtro redesenha a tabela, e ler os inputs na hora de salvar perderia tudo
  // que estivesse fora do filtro.
  const editado = useRef(new Map());
  // o que cada campo mostra enquanto a tabela não é redesenhada
  const naTela = useRef(new Map());
  const sujo = useRef(false);
  const [, setVersao] = useState(0);
  const redesenhar = () => setVersao((v) => v + 1);
  const [versaoTudo, setVersaoTudo] = useState(0);   // carga e salvar refazem a tela inteira
  const [notaEstoque, setNotaEstoque] = useState("");
  const [notaSugestao, setNotaSugestao] = useState("");
  const [filtro, setFiltro] = useState({ insumo: "", casa: "" });
  const [abertas, setAbertas] = useState({ estoque: true, prazos: true, projecao: true });
  const [est, setEst] = useState({ texto: "", classe: "" });
  const opcoesCasa = useRef(null);
  const proj = useRef({});
  const novoNome = useRef({});
  const estado = (texto, classe) => setEst({ texto: texto || "", classe: classe || "" });
  const marcarSujo = () => { sujo.current = true; estado("Não salvo", "erro"); };
  const DADOS = D.current;

  const valorAtual = (l, campo) => {
    const e = editado.current.get(chaveDe(l));
    if (e && campo in e) return e[campo];
    return l[campo];
  };
  const guardar = (l, campo, valor) => {
    const k = chaveDe(l);
    const e = editado.current.get(k) || {};
    e[campo] = valor;
    editado.current.set(k, e);
    marcarSujo();
  };
  const linhasVisiveis = (f = filtro) => {
    const texto = busca(f.insumo);
    return (D.current.estoque || []).filter((l) =>
      (!f.casa || l.casa === f.casa) && (!texto || busca(l.insumo).includes(texto)));
  };
  // "Redesenhar" a tabela de estoque: campos voltam ao valor guardado e a
  // contagem do topo se refaz.
  const desenharEstoque = () => {
    naTela.current = new Map();
    const lista = D.current.estoque || [];
    const comMinimo = lista.filter((l) => valorAtual(l, "minimo") != null && valorAtual(l, "minimo") !== "").length;
    setNotaEstoque(`${comMinimo} de ${lista.length} com mínimo definido`);
    redesenhar();
  };
  const desenhar = () => {
    if (!opcoesCasa.current) {
      opcoesCasa.current = [...new Map((D.current.estoque || []).map((l) => [l.casa, l.casa_nome])).entries()];
    }
    desenharEstoque();
    setVersaoTudo((v) => v + 1);
  };

  async function carregar() {
    estado("Carregando…");
    const r = await api.getParametros();
    if (!r.ok) { estado("Falhou ao carregar", "erro"); return; }
    D.current = await r.json();
    desenhar();
    sujo.current = false;
    estado("");
  }
  useEffect(() => {
    carregar();
    const sair = (e) => { if (sujo.current) e.preventDefault(); };
    window.addEventListener("beforeunload", sair);
    return () => window.removeEventListener("beforeunload", sair);
  }, []);

  // ----------------------------------------------------------------- salvar
  async function salvar() {
    if (!D.current) return;
    // Manda o conjunto inteiro, com o que foi editado por cima do que veio.
    const estoque = (D.current.estoque || []).map((l) => ({
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
        dias_a_cobrir_padrao: num(proj.current.diasCobrir.value),
        janela_media_dias: num(proj.current.janela.value),
        dias_seguranca: num(proj.current.seguranca.value),
        responsaveis: D.current.projecao.responsaveis || [],
        fornecedores: D.current.projecao.fornecedores || [],
        prazo_entrega: (D.current.prazos || []).map((p) => ({
          chave: p.chave,
          padrao: p.padrao === "" || p.padrao == null ? null : num(p.padrao),
          casas: Object.fromEntries(Object.entries(p.casas || {})
            .filter(([, v]) => v !== "" && v != null).map(([c, v]) => [c, num(v)])),
        })),
      },
    };
    estado("Salvando…");
    const r = await api.postParametros(corpo);
    const resp = await r.json().catch(() => null);
    if (!r.ok || !resp || resp.ok === false) {
      // O servidor recusa máximo abaixo do mínimo e dia fora da faixa: a
      // mensagem dele diz qual linha, então vale mostrá-la em vez de um genérico.
      estado((resp && resp.erro ? String(resp.erro).split("\n").pop() : "Falhou ao salvar")
             .slice(0, 120), "erro");
      return;
    }
    D.current = resp;
    editado.current.clear();
    sujo.current = false;
    desenhar();
    estado("Salvo", "ok");
    setTimeout(() => { if (!sujo.current) estado(""); }, 2500);
  }

  // ------------------------------------------------------------ eventos
  const mudarFiltro = (mudanca) => { setFiltro((f) => ({ ...f, ...mudanca })); desenharEstoque(); };
  const sugerir = () => {
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
    setNotaSugestao(n
      ? `${n} mínimo(s) preenchido(s) com a sugestão — confira antes de salvar`
      : "Nada a preencher: as linhas à vista já têm mínimo");
    desenharEstoque();
  };
  const adicionar = (campo) => {
    const el = novoNome.current[campo];
    const nome = limpaNome(el.value);
    if (!nome) return;
    const lista = D.current.projecao[campo] || (D.current.projecao[campo] = []);
    if (lista.some((x) => chave(x) === chave(nome))) {
      estado(`${nome} já está na lista`, "erro");
      return;
    }
    lista.push(nome);
    el.value = "";
    marcarSujo();
  };
  const remover = (campo, i) => {
    D.current.projecao[campo].splice(i, 1);
    marcarSujo(); redesenhar();
  };
  const alternar = (id) => setAbertas((a) => ({ ...a, [id]: !a[id] }));

  // ------------------------------------------------------------ desenho
  function tabelaEstoque() {
    const linhas = linhasVisiveis();
    if (!linhas.length) return html`<p class="vazio">Nenhum insumo com esses filtros.</p>`;
    const regra = rotuloRegra(DADOS);
    let grupo = null;
    const corpo = [];
    linhas.forEach((l) => {
      if (l.grupo !== grupo) {
        corpo.push(html`<tr class="linha-grupo" key=${"g" + l.grupo}><td colSpan="8">${l.grupo}</td></tr>`);
        grupo = l.grupo;
      }
      const k = chaveDe(l);
      const campo = (c, placeholder) => {
        const chaveTela = k + "|" + c;
        const valor = naTela.current.has(chaveTela) ? naTela.current.get(chaveTela) : formatado(valorAtual(l, c));
        return html`<td><input type="text" inputmode="decimal" data-campo=${c} value=${valor} placeholder=${placeholder}
          onInput=${(e) => { naTela.current.set(chaveTela, e.target.value); guardar(l, c, e.target.value.trim()); redesenhar(); }}
          onChange=${() => {}}
          onBlur=${(e) => {
            // Ao sair do campo, o número volta no formato da casa — três
            // decimais, como no lançamento. Vazio continua vazio.
            if (e.target.value.trim() === "") return;
            naTela.current.set(chaveTela, fmt(num(e.target.value), 3)); redesenhar();
          }} /></td>`;
      };
      corpo.push(html`<tr key=${k} data-k=${k}>
        <td>${l.insumo + " "}<span class="un">${"(" + l.un + ")"}</span></td>
        <td class="fonte">${l.casa_nome}</td>
        <td class="calc fonte">${fmt(l.media_dia, 3)}</td>
        <td class="calc fonte">${l.dias == null ? "—" : l.dias}</td>
        <td class="calc fonte">${textoPrazo(l)}</td>
        <td class="calc sugestao" title=${regra}>${l.sugestao == null ? "—" : fmt(l.sugestao, 1)}</td>
        ${campo("minimo", "calculado")}
        ${campo("maximo", "sem limite")}
      </tr>`);
    });
    return html`<table class="tabela-param">
      <thead><tr>
        <th>Insumo</th><th>Casa</th><th>Média/dia</th><th>Dias</th>
        <th>Prazo</th><th>Calculado</th><th>Mínimo</th><th>Máximo</th>
      </tr></thead><tbody>${corpo}</tbody></table>`;
  }

  // Uma linha por insumo comprado. O padrão vale para as quatro casas; a
  // coluna da casa só se preenche quando ela recebe em outro prazo (o camarão
  // chega em 1 dia na cidade e em 2 na Cidade Nova). Padrão em branco = sem
  // fornecedor disponível: o insumo fica sem mínimo. Os campos são refeitos
  // só na carga e ao salvar; o que se digita vai direto ao prazo.
  function tabelaPrazos() {
    const lista = DADOS.prazos || [];
    if (!lista.length) return html`<p class="vazio">Nenhum prazo cadastrado.</p>`;
    const cel = (v) => v == null || v === "" ? "" : fmt(num(v), 0);
    return html`<table class="tabela-param" key=${versaoTudo}>
      <thead><tr><th>Insumo</th><th>Prazo padrão (dias)</th>${CASAS_PRAZO.map((c) => html`<th key=${c}>${c}</th>`)}</tr></thead>
      <tbody>${lista.map((p, i) => html`<tr key=${i} data-i=${i}>
        <td>${p.insumo}${p._semFornecedor ? html`${" "}<span class="selo-mini">sem fornecedor</span>` : null}</td>
        <td><input type="text" inputmode="numeric" data-prazo="padrao" defaultValue=${cel(p.padrao)} placeholder="sem fornecedor"
          onInput=${(e) => { p.padrao = e.target.value.trim(); marcarSujo(); }} /></td>
        ${CASAS_PRAZO.map((c) => html`<td key=${c}><input type="text" inputmode="numeric" data-prazo=${c}
          defaultValue=${cel((p.casas || {})[c])} placeholder="padrão"
          onInput=${(e) => { (p.casas = p.casas || {})[c] = e.target.value.trim(); marcarSujo(); }} /></td>`)}
      </tr>`)}</tbody></table>`;
  }
  // o selo "sem fornecedor" é do momento em que a tabela foi desenhada
  if (DADOS && DADOS._marcado !== versaoTudo) {
    (DADOS.prazos || []).forEach((p) => { p._semFornecedor = p.padrao == null || p.padrao === ""; });
    DADOS._marcado = versaoTudo;
  }

  // Ficha com o nome e um × para remover. Lista curta e digitada à mão, então
  // não vale um componente de busca — vale ver tudo de uma vez.
  const lista = (campo) => {
    const nomes = (DADOS && DADOS.projecao[campo]) || [];
    return nomes.length
      ? nomes.map((nome, i) => html`<span class="ficha-nome" key=${i}>${nome + " "}<button type="button" class="ficha-x" data-campo=${campo} data-i=${i}
          title=${"Remover " + nome} aria-label=${"Remover " + nome} onClick=${() => remover(campo, i)}>×</button></span>`)
      : html`<span class="vazio">Nenhum cadastrado.</span>`;
  };
  const p = (DADOS && DADOS.projecao) || {};
  const dobra = (id, titulo, fonte, corpo) => html`<section class=${"cartao dobravel" + (abertas[id] ? " aberta" : "")} data-secao=${id}>
    <div class="cabeca dobra" onClick=${() => alternar(id)}><h2>${titulo}</h2>
      ${fonte}
      <span style=${{ flex: 1 }}></span><span class="ordem-chev">▸</span></div>
    <div class="dobra-corpo">${corpo}</div>
  </section>`;
  const add = (campo, placeholder) => html`<div class="param-add">
    <input type="text" id=${campo === "responsaveis" ? "novo-responsavel" : "novo-fornecedor"} placeholder=${placeholder}
      ref=${(el) => { novoNome.current[campo] = el; }}
      onKeyDown=${(e) => { if (e.key === "Enter") { e.preventDefault(); adicionar(campo); redesenhar(); } }} />
    <button class="botao" id=${campo === "responsaveis" ? "btn-add-responsavel" : "btn-add-fornecedor"} type="button"
      onClick=${() => { adicionar(campo); redesenhar(); }}>Adicionar</button>
  </div>`;

  return html`<main class="main-content tela-parametros">
    <div class="screen-header">
      <div>
        <h1>Parâmetros</h1>
        <p>O que o sistema não tem como adivinhar: quanto de cada insumo cada casa
           precisa ter em estoque, quem responde pela projeção de compras e de
           quantos dias ela olha para trás. Fora daqui, tudo é calculado do
           lançamento diário.</p>
      </div>
      <div class="header-acoes">
        <${Estado} texto=${est.texto} classe=${est.classe} />
        <button class="botao primario" id="btn-salvar" onClick=${salvar}>Salvar</button>
      </div>
    </div>

    ${dobra("estoque", "Mínimo e máximo de estoque", html`<span class="fonte" id="nota-estoque">${notaEstoque}</span>`, html`
      <p class="fonte nota-secao" id="nota-regra">${DADOS ? rotuloRegra(DADOS) : ""}</p>
      <p class="fonte nota-secao">A coluna <strong>Calculado</strong> é o que essa regra dá hoje —
        é o valor que vale enquanto o mínimo estiver em branco. Preencher o${" "}<strong>Mínimo</strong> substitui o cálculo para aquele insumo naquela casa; apagar
        devolve o cálculo. O <strong>Máximo</strong> aponta o contrário do mínimo: estoque parado
        além do necessário.</p>
      <div class="param-barra">
        <label class="campo"><span>Filtrar insumo</span>
          <input type="text" id="f-insumo" placeholder="nome do insumo" value=${filtro.insumo}
            onInput=${(e) => mudarFiltro({ insumo: e.target.value })} onChange=${() => {}} /></label>
        <label class="campo"><span>Casa</span><select id="f-casa" value=${filtro.casa}
          onChange=${(e) => mudarFiltro({ casa: e.target.value })}>${opcoesCasa.current
            ? html`<option value="">Todas</option>${opcoesCasa.current.map(([c, nome]) => html`<option key=${c} value=${c}>${nome}</option>`)}`
            : null}</select></label>
        <button class="botao" id="btn-sugerir" type="button" onClick=${() => { if (DADOS) sugerir(); }}>Preencher mínimos com a sugestão</button>
        <span class="fonte" id="nota-sugestao">${notaSugestao}</span>
      </div>
      <div class="rolagem" id="tabela-estoque">${DADOS ? tabelaEstoque() : null}</div>`)}

    ${dobra("prazos", "Prazo de entrega", html`<span class="fonte">Dias entre o pedido e a chegada — é a cobertura do mínimo</span>`, html`
      <p class="fonte nota-secao">O mínimo calculado é o consumo médio diário × este prazo:
        o estoque que precisa existir no dia do pedido para a casa não zerar antes de a
        mercadoria chegar. O <strong>prazo padrão</strong> vale para as quatro casas; preencha a
        coluna de uma casa só quando ela recebe em outro prazo. Padrão em branco quer dizer${" "}<strong>sem fornecedor disponível</strong> — o insumo fica sem mínimo. Lula e polvo:
        o prazo vale para o in natura, que é o que se compra. Mudou o prazo, salve e use${" "}<strong>Preencher mínimos com a sugestão</strong> para levar o novo cálculo à tabela.</p>
      <div class="rolagem" id="tabela-prazos">${DADOS ? tabelaPrazos() : null}</div>`)}

    ${dobra("projecao", "Projeção de compras", html`<span class="fonte">Janela de cálculo e quem assina</span>`, html`
      <div class="param-grade" key=${versaoTudo}>
        <label class="campo"><span>Dias a cobrir (padrão)</span>
          <input type="number" id="p-dias-cobrir" min="1" max="60" step="1" defaultValue=${p.dias_a_cobrir_padrao ?? ""}
            ref=${(el) => { proj.current.diasCobrir = el; }} onInput=${marcarSujo} />
          <small class="fonte">Quantos dias de consumo o pedido deve cobrir, quando ninguém
            muda na tela.</small></label>
        <label class="campo"><span>Janela da média (dias)</span>
          <input type="number" id="p-janela" min="1" max="120" step="1" defaultValue=${p.janela_media_dias ?? ""}
            ref=${(el) => { proj.current.janela = el; }} onInput=${marcarSujo} />
          <small class="fonte">De quantos dias para trás sai o consumo médio que projeta o
            pedido.</small></label>
        <label class="campo"><span>Dias de segurança</span>
          <input type="number" id="p-seguranca" min="0" max="60" step="1" defaultValue=${p.dias_seguranca ?? ""}
            ref=${(el) => { proj.current.seguranca = el; }} onInput=${marcarSujo} />
          <small class="fonte">Cobertura do mínimo calculado para o insumo que não tem
            prazo de entrega cadastrado (hoje: lula e polvo processados).</small></label>
      </div>
      <div class="param-listas">
        <div class="param-lista">
          <h3>Responsáveis</h3>
          <p class="fonte">Quem pode assinar uma projeção. Aparece na lista da tela de
            Projeção de Compras.</p>
          <div id="lista-responsaveis" class="fichas">${DADOS ? lista("responsaveis") : null}</div>
          ${add("responsaveis", "nome do responsável")}
        </div>
        <div class="param-lista">
          <h3>Fornecedores</h3>
          <p class="fonte">Para quem o pedido pode ser endereçado.</p>
          <div id="lista-fornecedores" class="fichas">${DADOS ? lista("fornecedores") : null}</div>
          ${add("fornecedores", "nome do fornecedor")}
        </div>
      </div>`)}

    <section class="cartao">
      <h2>O que não se define aqui</h2>
      <ul class="notas-param">
        <li><strong>Metas de coeficiente</strong> — saem do histórico pelo${" "}<code>recalcular_metas.py</code>, que compara três estimadores e põe piso no melhor mês
          já realizado. Meta digitada à mão perderia esse critério.</li>
        <li><strong>Custo unitário dos insumos</strong> — vem do preço cadastrado em
          Movimentações e da planilha Cadastro de Preços, por data e casa. Um valor fixo aqui
          brigaria com o preço real de cada compra.</li>
        <li><strong>Rendimento de processamento</strong> (lula, tentáculo, atum) — medido do
          processamento que a casa lança, não estipulado.</li>
        <li><strong>Unidade de cada insumo</strong> — é a que a planilha da casa usa para contar;
          mudar aqui descolaria o sistema da origem.</li>
      </ul>
    </section>
  </main>`;
}

montarTela("parametros", Parametros, { acoes: false });
