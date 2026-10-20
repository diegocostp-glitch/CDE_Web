// ============================================================================
// CDE Web - tela de lancamento diario
// Estoque inicial vem encadeado do dia anterior (o servidor calcula).
// Uso diario = inicial + chegada - transferencia - final (mesma conta da planilha).
// Desperdicio/perda e registrado a parte e NAO entra no uso.
//
// O dia mora num objeto só (a resposta de /api/dia), como na tela antiga. Na
// casa à vista, o que vale é o que está DIGITADO nos campos (o "rascunho"): o
// uso, o coeficiente e a linha do salmão equivalente saem dele a cada tecla, e
// ele só vai ao objeto ao salvar. Trocar de casa refaz os campos a partir do
// objeto — o que estava digitado e não foi salvo some, exatamente como antes
// (anotado como pendência no MIGRACAO-REACT.md, para decidir fora da migração).
// ============================================================================
import { html, useState, useEffect, useRef, Fragment } from "../html.js";
import { num, fmt, qtd, QUASE_ZERO, zerado, hojeLocal } from "../formato.js";
import * as api from "../api.js";
import { aviso, Estado } from "../componentes/Aviso.js";
import { montarTela } from "../montar.js";

const FATOR_LIBRA = { salmao_0810: 1.00, salmao_1012: 1.25, salmao_1214: 1.48, salmao_1416: 1.67 };
// As quatro colunas do meio, na ordem da tela.
const COLS_DERIVADAS = ["entrada", "transferencia", "desperdicio", "final"];

// Contagem final suspeita: o uso do dia passou de ALERTA_VEZES o MAIOR uso da
// casa nos últimos 30 dias, e por pelo menos ALERTA_MINIMO unidades. É o erro de
// preenchimento típico — final zerado ou com um dígito trocado onde deviam sobrar
// 10 kg — que vira consumo e infla a média: foi assim que 57 pacotes de arroz
// entraram num dia só na DLCN, onde o maior dia tinha sido 7.
// A régua é o maior uso, e não a média, porque muito insumo sai em lote (saco de
// kani, leva de lula para processar): contra 3× a média acendia em 7% das
// contagens de jul–out; contra 1,5× o maior uso, em 0,3%.
const ALERTA_VEZES = 1.5;
const ALERTA_MINIMO = 1;

const brData = (iso) => (iso || "").split("-").reverse().join("/");
const primeiroDoMes = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const isoLocal = (d) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

const ORIGEM_DERIVADA = "Soma das libragens convertidas para peixe-equivalente 08/10, "
  + "mais o filé limpo que sobrou, também convertido. O filé entra no final "
  + "do dia e vira o inicial do dia seguinte — calculado.";

// A dica de origem do campo: o selo diz de onde veio, mas o campo ACEITA
// correção. Ao salvar um número diferente, o servidor solta a marca de planilha
// e a sincronização passa a respeitar o valor digitado.
const dicaDe = (ins) => ins.editado
  ? "Corrigido aqui, por cima do valor da planilha. A sincronização não sobrescreve mais esta linha."
  : ins.da_planilha
    ? "Valor sincronizado da planilha. Pode corrigir: ao salvar, este número passa a valer."
    : undefined;

function Lancamento() {
  const CONFIG = useRef(null);
  const DIA = useRef(null);
  const casaRef = useRef("SL");
  const sujo = useRef(false);
  // o que está digitado na casa à vista: { fat, ins: {chave: {campo: texto,
  // alerta}}, proc: {chave: {in_natura, processado}} }
  const rasc = useRef(null);
  const [, setVersao] = useState(0);
  const redesenhar = () => setVersao((v) => v + 1);
  const [data, setDataEstado] = useState("");
  // a data do campo, lida no fim da sincronização (que recarrega o dia que
  // estiver no campo naquela hora, como antes)
  const dataRef = useRef("");
  const setData = (d) => { dataRef.current = d; setDataEstado(d); };
  const [msgPainel, setMsgPainel] = useState(null);
  const [est, setEst] = useState({ texto: "", classe: "" });
  const [salvando, setSalvando] = useState(false);
  const [sincronizando, setSincronizando] = useState(null);   // null | "normal" | "periodo"
  const [periodoAberto, setPeriodoAberto] = useState(false);
  const periodoRef = useRef(false);
  const [periodo, setPeriodo] = useState({ inicio: "", fim: "" });
  const estado = (texto, classe) => setEst({ texto: texto || "", classe: classe || "" });

  const CASA = casaRef.current;
  const dia = DIA.current;

  // Quilos de filé limpo -> peixes inteiros equivalentes. Os fatores vêm do
  // servidor (que os lê de dados/compras.json) para não existir uma terceira
  // versão do mesmo rendimento entre tela, servidor e Conversor de Salmão.
  const fileEmPeixes = (kg) => {
    const c = (CONFIG.current && CONFIG.current.conversao_file) || {};
    const rend = c.rendimento > 0 ? c.rendimento : 0.538;
    const kgPeixe = c.kg_por_peixe > 0 ? c.kg_por_peixe : 30 / 7;
    return !kg ? 0 : (kg / rend) / kgPeixe;
  };

  // ---- o alerta de contagem suspeita fica guardado no rascunho da linha:
  // como na tela antiga, ele só é reavaliado quando há final digitado — apagar
  // o final não apaga o alerta que estava aceso.
  function avaliarAlerta(ins, r) {
    if ((r.final || "") === "") return;
    const uso = num(ins.inicial) + num(r.entrada) - num(r.transferencia) - num(r.final);
    const negativo = uso < -QUASE_ZERO;
    const media = ins.media_diaria || 0;
    const maior = ins.maior_uso;
    const suspeito = !negativo && maior > 0 && uso > ALERTA_VEZES * maior
      && uso - maior >= ALERTA_MINIMO;
    const esperado = Math.max(0, uso + num(r.final) - media);
    r.suspeito = suspeito;
    r.titulo = suspeito
      ? `Possível erro de contagem: o uso do dia (${fmt(uso, 3)}) passa do maior dos últimos `
        + `30 dias (${fmt(maior, 3)}). Com o consumo médio de ${fmt(media, 3)} ${ins.un}/dia, `
        + `o final esperado seria perto de ${fmt(esperado, 3)}. Confira a contagem.`
      : dicaDe(ins);
  }

  // A casa é desenhada do objeto: os campos voltam a mostrar o que está nele.
  function refazerCampos() {
    const casa = DIA.current.casas[casaRef.current];
    const r = { fat: casa.faturamento ? fmt(casa.faturamento) : "", ins: {}, proc: {} };
    casa.insumos.forEach((ins) => {
      if (ins.derivado) return;
      const campos = ins.so_contagem ? ["final"] : COLS_DERIVADAS;
      const linha = { suspeito: false, titulo: dicaDe(ins) };
      campos.forEach((c) => { linha[c] = qtd(ins[c]); });
      r.ins[ins.chave] = linha;
      if (!ins.so_contagem) avaliarAlerta(ins, linha);
    });
    Object.values(casa.processamento || {}).forEach((p) => {
      r.proc[p.chave] = { in_natura: qtd(p.in_natura), processado: qtd(p.processado) };
    });
    rasc.current = r;
  }

  // ------------------------------------------------------------------ carregar
  async function carregarDia(d) {
    if (sujo.current && !confirm("Há alterações não salvas neste dia. Descartar?")) return;
    estado("Carregando…");
    try {
      const r = await api.getDia(d);
      if (!r.ok) throw new Error("HTTP " + r.status);
      DIA.current = await r.json();
      sujo.current = false;
      estado("");
      refazerCampos();
      redesenhar();
    } catch (e) {
      estado("Falha ao carregar", "erro");
      aviso("Não consegui carregar o dia: " + e.message, "mau");
    }
  }

  useEffect(() => {
    (async () => {
      try {
        CONFIG.current = await (await api.getConfig()).json();
      } catch (e) {
        setMsgPainel("Servidor fora do ar. Rode o Servidor.bat.");
        return;
      }
      if (!CONFIG.current.faturamento_ok) {
        aviso("Planilha de faturamento não encontrada — o campo virá em branco.", "mau");
      }
      setData(hojeLocal());
      redesenhar();
      carregarDia(hojeLocal());
    })();
    const sair = (e) => { if (sujo.current) e.preventDefault(); };
    window.addEventListener("beforeunload", sair);
    // Período de sincronização: clicar fora ou Esc fecha.
    const fora = (e) => { if (periodoRef.current && !e.target.closest(".botao-duplo")) abrirPeriodo(false); };
    const esc = (e) => { if (e.key === "Escape" && periodoRef.current) abrirPeriodo(false); };
    document.addEventListener("click", fora);
    document.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("beforeunload", sair);
      document.removeEventListener("click", fora);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  // ------------------------------------------------------------------ digitar
  const marcarSujo = () => { sujo.current = true; estado("Não salvo", "erro"); };
  const mudarCampo = (ins, campo, valor) => {
    const r = rasc.current.ins[ins.chave];
    r[campo] = valor;
    if (!ins.so_contagem) avaliarAlerta(ins, r);
    marcarSujo(); redesenhar();
  };
  const mudarProc = (chave, campo, valor) => {
    rasc.current.proc[chave][campo] = valor;
    marcarSujo(); redesenhar();
  };
  const mudarFat = (valor) => { rasc.current.fat = valor; marcarSujo(); redesenhar(); };

  // Ao sair do campo, o que foi digitado volta no formato 0,000 — quem digita
  // "14" ou "14," vê "14,000" e a coluna inteira fica na mesma régua. Só as
  // caixas de quantidade: o faturamento é dinheiro e tem duas casas.
  //
  // Campo VAZIO continua vazio, nunca vira "0,000": vazio quer dizer "não
  // contado", que é diferente de contado zero — e é essa diferença que o
  // servidor usa para não gravar contagem que ninguém fez.
  const sairQtd = (obj, campo) => {
    if (obj[campo].trim() === "") return;
    obj[campo] = qtd(num(obj[campo]));
    redesenhar();
  };
  const sairFat = () => {
    if (rasc.current.fat.trim() === "") return;
    rasc.current.fat = fmt(num(rasc.current.fat));
    redesenhar();
  };

  // ------------------------------------------------------------------ salvar
  async function salvar() {
    if (!DIA.current) return;
    const casa = DIA.current.casas[casaRef.current];
    const r = rasc.current;
    casa.faturamento = num(r.fat);
    casa.insumos.forEach((ins) => {
      if (ins.derivado) return;
      // A linha de contagem não tem as caixas de movimento: só o que existe
      // na linha vai ao objeto.
      const linha = r.ins[ins.chave];
      ["final", "entrada", "transferencia", "desperdicio"].forEach((c) => {
        if (linha[c] === undefined) return;
        const v = linha[c].trim();
        ins[c] = v === "" ? null : num(v);
      });
    });
    // processamento da casa aberta: so os dois numeros digitados vao ao servidor,
    // que recalcula perda e rendimento na leitura
    Object.entries(r.proc).forEach(([pk, campos]) => {
      const p = (casa.processamento || {})[pk];
      if (!p) return;
      ["in_natura", "processado"].forEach((c) => {
        const v = campos[c].trim();
        p[c] = v === "" ? null : num(v);
      });
    });

    const corpo = { data: DIA.current.data, casas: {} };
    Object.entries(DIA.current.casas).forEach(([ck, c]) => {
      const insumos = {};
      c.insumos.forEach((i) => {
        insumos[i.chave] = { final: i.final, entrada: i.entrada,
                            transferencia: i.transferencia, desperdicio: i.desperdicio };
      });
      const proc = {};
      Object.entries(c.processamento || {}).forEach(([pk, p]) => {
        proc[pk] = { in_natura: p.in_natura, processado: p.processado };
      });
      corpo.casas[ck] = { faturamento: c.faturamento, insumos: insumos,
                          processamento: proc };
    });

    setSalvando(true);
    estado("Salvando…");
    try {
      const resp = await (await api.postDia(corpo)).json();
      if (!resp.ok) throw new Error(resp.erro || "erro no servidor");
      sujo.current = false;
      estado("Salvo", "ok");
      aviso("Dia " + DIA.current.data.split("-").reverse().join("/") + " salvo.", "bom");
      await carregarDia(DIA.current.data);      // recarrega para reencadear o estoque inicial
    } catch (e) {
      estado("Falha ao salvar", "erro");
      aviso("Não consegui salvar: " + e.message, "mau");
    } finally {
      setSalvando(false);
    }
  }

  // ------------------------------------------------------------------ sincronizar
  // Enquanto o sistema roda em paralelo com o Excel, o que voce digita nas
  // planilhas de cada casa nao chega aqui sozinho. Este botao traz.
  //
  // Sem periodo, le o mes do ultimo lancamento — o caso de todo dia. Com periodo
  // (a setinha ao lado do botao), reimporta os dias escolhidos mesmo que ja
  // estejam aqui: planilha corrigida dias depois, num mes que a leitura normal
  // nao alcanca, so chegava ao sistema por linha de comando.
  async function sincronizar(per) {
    if (sujo.current && !confirm("Há alterações não salvas. Sincronizar vai recarregar o dia. Continuar?")) return;
    setSincronizando(per ? "periodo" : "normal");
    estado("Sincronizando…");
    try {
      const d = await (await api.getSincronizar(per)).json();
      if (!d.ok) throw new Error(d.erro || "falha no servidor");
      // Não existe mais "nenhuma planilha aberta": a sincronização lê a planilha
      // fechada também. O que pode acontecer é o arquivo estar travado na hora.
      if ((d.bloqueadas || []).length) {
        aviso(`Não consegui ler: ${d.bloqueadas.join(", ")}. Tente de novo em alguns segundos — `
              + "o OneDrive costuma soltar o arquivo rápido.", "mau");
        estado("Sincronizado em parte", "erro");
        await carregarDia(dataRef.current);
        return;
      }
      const n = d.dias_novos.length, a = d.dias_alterados.length;
      const lidas = (d.planilhas || []).join(", ");
      const onde = d.periodo ? ` no período ${brData(d.periodo[0])} a ${brData(d.periodo[1])}` : "";
      // Dia corrigido na tela não é reescrito pela planilha (regra do gravar do
      // importar_diario). Sem dizer isso, quem pede o período de novo e vê "nada
      // novo" fica achando que a sincronização não leu o arquivo.
      const mantidos = (d.dias_preservados || []).length;
      const nota = mantidos
        ? ` ${mantidos} dia(s) já corrigidos aqui na tela continuam como estão.`
        : "";
      // Insumo sem estoque final na planilha não entra (o uso sairia com o
      // estoque inteiro). Avisa quais, para quem sincronizou no meio do dia.
      const pend = d.pendentes || [];
      const notaPend = pend.length
        ? ` ${pend.length} item(ns) ainda sem estoque final na planilha ficaram de fora`
          + ` (${pend.slice(0, 4).join(", ")}${pend.length > 4 ? "…" : ""}) — entram`
          + " quando o final for preenchido e você sincronizar de novo."
        : "";
      aviso((n || a
        ? `${n} dia(s) novo(s) e ${a} atualizado(s)${onde} — de ${lidas}.`
        : `Nada novo${onde} em ${lidas} — já estava tudo aqui.`) + nota + notaPend,
        pend.length ? "mau" : "bom");
      estado("Sincronizado", "ok");
      await carregarDia(dataRef.current);
    } catch (e) {
      estado("Falha ao sincronizar", "erro");
      aviso("Não consegui ler as planilhas: " + e.message, "mau");
    } finally {
      setSincronizando(null);
    }
  }

  // ------------------------------------------- escolha do periodo a reimportar
  function presetPeriodo(qual) {
    const agora = new Date();
    let inicio = primeiroDoMes(agora), fim = agora;
    if (qual === "anterior") {
      inicio = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
      fim = new Date(agora.getFullYear(), agora.getMonth(), 0);
    } else if (qual === "7") {
      inicio = new Date(agora.getTime() - 6 * 86400000);
    }
    setPeriodo({ inicio: isoLocal(inicio), fim: isoLocal(fim) });
  }
  function abrirPeriodo(abrir) {
    periodoRef.current = abrir;
    setPeriodoAberto(abrir);
    // Abre no mês atual: é o pedido mais comum, e um campo de data em branco
    // obrigaria a digitar duas datas para o caso de sempre.
    if (abrir && !periodo.inicio) presetPeriodo("mes");
  }

  // ------------------------------------------------------------------ navegar
  const mudarDia = (passo) => {
    const d = new Date(data + "T12:00:00");
    d.setDate(d.getDate() + passo);
    const iso = d.toISOString().slice(0, 10);
    setData(iso);
    carregarDia(iso);
  };
  const pronto = () => !!CONFIG.current;

  // ------------------------------------------------------------------ desenho
  // O número da aba é o que FALTA contar naquela casa no dia — serve para varrer
  // as quatro abas sem abrir uma por uma e descobrir onde o lançamento parou.
  // Casa fechada mostra o certo verde em vez de um espaço vazio, que poderia ser
  // lido como "ainda não olhei aqui".
  const abas = !CONFIG.current || !dia ? null : CONFIG.current.casas.map((c) => {
    const casa = dia.casas[c.chave];
    const contaveis = casa ? casa.insumos.filter((i) => !i.derivado) : [];
    const faltam = contaveis.filter((i) => i.final == null || i.final === "").length;
    const titulo = casa
      ? c.nome + (faltam
          ? ` — faltam ${faltam} de ${contaveis.length} insumos sem contagem final`
          : ` — dia completo, ${contaveis.length} insumos contados`)
      : c.nome;
    return html`<button key=${c.chave} title=${titulo} class=${c.chave === CASA ? "ativa" : ""}
      onClick=${() => { casaRef.current = c.chave; refazerCampos(); redesenhar(); }}>${c.chave + " "}${faltam
        ? html`<span class="pend" title="insumos sem contagem">${faltam}</span>`
        : html`<span class="pend feito" title="dia completo">✓</span>`}</button>`;
  });

  function tabela() {
    const casa = dia.casas[CASA];
    const r = rasc.current;
    const fat = num(r.fat);
    // O que está digitado numa linha agora, mais o uso do dia. Campo vazio vira
    // null (e não 0) para a linha derivada saber distinguir "não contaram ainda"
    // de "contaram e deu zero".
    const valoresDaLinha = (chave) => {
      const ins = casa.insumos.find((i) => i.chave === chave);
      const linha = r.ins[chave];
      if (!linha || !ins) return null;
      const v = { inicial: num(ins.inicial) };
      COLS_DERIVADAS.forEach((c) => {
        v[c] = (linha[c] === undefined || linha[c] === "") ? null : num(linha[c]);
      });
      v.uso = v.final === null ? null
        : v.inicial + num(v.entrada) - num(v.transferencia) - v.final;
      return v;
    };

    const linhaDerivada = (ins) => {
      const col = { entrada: 0, transferencia: 0, desperdicio: 0, final: 0 };
      let uso = 0, temUso = false, temCol = false;
      const somar = (o, fator) => {
        if (!o) return;
        COLS_DERIVADAS.forEach((c) => {
          if (o[c] !== null) { col[c] += o[c] * fator; temCol = true; }
        });
        if (o.uso !== null) { uso += o.uso * fator; temUso = true; }
      };
      for (const [banda, fator] of Object.entries(FATOR_LIBRA)) somar(valoresDaLinha(banda), fator);
      // O filé limpo que sobrou é salmão parado na geladeira, então entra no
      // FINAL do dia. O inicial já chega do servidor com o filé de ONTEM
      // somado — é o mesmo número, visto como fechamento de um dia e como
      // abertura do outro.
      //
      // Com o filé nos dois lados, o uso do equivalente deixa de ser a soma
      // dos usos das faixas e passa a ser a conta de estoque, a mesma das
      // linhas digitadas. Somar os usos das faixas ignoraria o filé e o dia
      // sairia com consumo inflado.
      const fil = valoresDaLinha("salmao_file");
      if (fil && fil.final !== null) {
        col.final += fileEmPeixes(fil.final);
        temCol = true;
      }
      if (temCol) {
        uso = num(ins.inicial) + col.entrada - col.transferencia - col.final;
        temUso = true;
      }
      return html`<tr data-chave=${ins.chave} class="derivada">
        <td>${ins.nome + " "}<span class="un">${"(" + ins.un + ")"}</span>${" "}<span class="selo-mini" title=${ORIGEM_DERIVADA}>calculado</span></td>
        <td class="calc">${fmt(ins.inicial, 3)}</td>
        ${COLS_DERIVADAS.map((c) => html`<td key=${c} class=${"calc d-" + c}>${temCol ? fmt(col[c], 3) : "—"}</td>`)}
        <td class="calc uso">${temUso ? fmt(uso, 3) : "—"}</td>
        <td class="calc coef">${temUso && fat > 0 ? fmt((uso / fat) * 1000, 3) : "—"}</td>
      </tr>`;
    };

    const linhaDigitada = (ins) => {
      const lr = r.ins[ins.chave];
      const dica = dicaDe(ins);
      const campo = (nome) => html`<td><input data-campo=${nome} type="text" inputmode="decimal"
        class=${nome === "final" && lr.suspeito ? "suspeito" : undefined}
        title=${nome === "final" ? lr.titulo : dica} value=${lr[nome]}
        onInput=${(e) => mudarCampo(ins, nome, e.target.value)} onChange=${() => {}}
        onBlur=${() => sairQtd(lr, nome)} /></td>`;
      const selo = ins.editado
        ? html`${" "}<span class="selo-mini editado" title="Corrigido no sistema, por cima da planilha">editado</span>`
        : ins.da_planilha
          ? html`${" "}<span class="selo-mini" title="Sincronizado da planilha">planilha</span>` : null;
      const cls = [ins.da_planilha ? "da-planilha" : "", ins.editado ? "editada" : ""].filter(Boolean).join(" ");
      // Linha de contagem (o filé de produção): só início e fim. As colunas de
      // movimento ficam vazias porque não existem — filé não é comprado nem
      // transferido, é produzido do peixe que a libragem já contou —, e uso e
      // coeficiente também, porque o consumo do salmão é medido no equivalente,
      // que já soma este filé.
      if (ins.so_contagem) {
        return html`<tr data-chave=${ins.chave} class=${cls || undefined}>
          <td>${ins.nome + " "}<span class="un">${"(" + ins.un + ")"}</span>${selo}</td>
          <td class="calc">${fmt(ins.inicial, 3)}</td>
          <td class="calc"></td><td class="calc"></td><td class="calc"></td>${campo("final")}<td class="calc"></td><td class="calc"></td>
        </tr>`;
      }
      const temFinal = lr.final !== "";
      const uso = num(ins.inicial) + num(lr.entrada) - num(lr.transferencia) - num(lr.final);
      const negativo = uso < -QUASE_ZERO;
      const maior = ins.maior_uso;
      const esperado = Math.max(0, uso + num(lr.final) - (ins.media_diaria || 0));
      let celUso;
      if (!temFinal) celUso = html`<td class="calc uso">—</td><td class="calc coef">—</td>`;
      else {
        // o vermelho do uso acompanha o alerta guardado na linha
        const suspeito = lr.suspeito && !negativo;
        celUso = html`<td class=${"calc uso" + (negativo || suspeito ? " neg" : "")}>${
          // zerado() também na exibição: sem isso a coluna mostrava "-0,000".
          fmt(zerado(uso) ? 0 : uso, 3)}${negativo
          ? html`<span class="msg-neg">contagem maior que o disponível</span>`
          : suspeito
            ? html`<span class="msg-neg">${`acima do maior dia (${fmt(maior, 3)}) — final esperado ≈ ${fmt(esperado, 3)}`}</span>`
            : null}</td><td class="calc coef">${fat > 0 ? fmt((uso / fat) * 1000, 3) : "—"}</td>`;
      }
      return html`<tr data-chave=${ins.chave} class=${cls || undefined}>
        <td>${ins.nome + " "}<span class="un">${"(" + ins.un + ")"}</span>${selo}</td>
        <td class="calc">${fmt(ins.inicial, 3)}</td>
        ${campo("entrada")}${campo("transferencia")}${campo("desperdicio")}${campo("final")}
        ${celUso}
      </tr>`;
    };

    let grupo = null;
    const linhas = [];
    casa.insumos.forEach((ins) => {
      if (ins.grupo !== grupo) {
        grupo = ins.grupo;
        linhas.push(html`<tr class="grupo" key=${"g-" + grupo}><td colSpan="8">${grupo}</td></tr>`);
      }
      linhas.push(html`<${Fragment} key=${ins.chave}>${ins.derivado ? linhaDerivada(ins) : linhaDigitada(ins)}<//>`);
    });

    // A ordem das colunas segue a vida do estoque no dia: o que tinha, o que
    // entrou, o que saiu para outra casa, o que se perdeu e o que sobrou na
    // contagem. Assim a linha e lida da esquerda para a direita na mesma ordem
    // em que os numeros acontecem no balcao. O esclarecimento vai embaixo do
    // título, em linha própria: ao lado ele estourava a coluna.
    return html`<section class="cartao cartao-lancamento"><div class="cabeca"><h2>${casa.nome}</h2><div class="fat"><span>Faturamento (Bruto) do Dia (R$)</span><input id="faturamento" type="text" inputmode="decimal" value=${r.fat}
        onInput=${(e) => mudarFat(e.target.value)} onChange=${() => {}} onBlur=${sairFat} /></div></div><p class="fonte">${casa.faturamento_da_planilha
        ? "Faturamento bruto lido da planilha Faturamento - 2026. Se editar aqui, o valor digitado prevalece."
        : "Sem faturamento bruto na planilha para esta data — digite manualmente."}</p><div class="rolagem"><table class="tabela-lancamento"><thead><tr><th>Insumo</th><th>Inicial</th><th>Entrada<br /><span class="un">chegada</span></th><th>Saída<br /><span class="un">transferência</span></th><th>Desperdício</th><th>Final<br /><span class="un">contagem</span></th><th>Uso do dia</th><th>Coef.</th></tr></thead><tbody>${linhas}</tbody></table></div></section>${processamento(casa)}`;
  }

  // ------------------------------------------------------ processamento
  // Anel de lula, tentaculo de lula e lombo de atum chegam crus e passam pelo
  // processamento antes de ir ao balcao. Aqui a casa informa DOIS numeros: quanto
  // colocou para processar e quanto rendeu. A perda e o rendimento saem dessa
  // conta — nao sao digitados, justamente para nao existir um rendimento
  // "combinado" diferente do que a balanca mostrou.
  //
  // O rendimento daqui e o que a Projecao de Compras usa para transformar o
  // estoque processado de volta em in natura.
  function processamento(casa) {
    const itens = Object.values(casa.processamento || {});
    // servidor antigo (ou resposta em cache) nao manda o bloco: melhor nada do
    // que um cartao vazio no meio da tela
    if (!itens.length) return null;
    return html`<section class="cartao cartao-processamento"><div class="cabeca"><h2>Processamento do dia</h2></div><p class="fonte">Informe quanto foi para processar e quanto rendeu. A perda e o rendimento são calculados. É este rendimento que a Projeção de Compras usa para converter o estoque processado de volta em in natura.</p><div class="rolagem"><table class="tabela-lancamento tabela-processamento"><thead><tr><th>Item</th><th>In natura<br /><span class="un">foi processar</span></th><th>Processado<br /><span class="un">rendeu</span></th><th>Perda<br /><span class="un">no processamento</span></th><th>Rendimento</th><th>Faixa padrão</th></tr></thead><tbody>${
      itens.map((p) => {
        const rp = rasc.current.proc[p.chave];
        const campo = (nome) => html`<td><input data-pcampo=${nome} type="text" inputmode="decimal" value=${rp[nome]}
          onInput=${(e) => mudarProc(p.chave, nome, e.target.value)} onChange=${() => {}}
          onBlur=${() => sairQtd(rp, nome)} /></td>`;
        let perdaRend;
        if (rp.in_natura === "" || num(rp.in_natura) <= 0) {
          perdaRend = html`<td class="calc perda">—</td><td class="calc rend">—</td>`;
        } else {
          const perda = num(rp.in_natura) - num(rp.processado);
          const rend = num(rp.processado) / num(rp.in_natura);
          const fora = rend < p.padrao_min || rend > p.padrao_max;
          // Perda negativa quer dizer que rendeu mais do que entrou: ou o peso do
          // cru foi anotado errado, ou o processado ja tinha saldo somado ali.
          perdaRend = html`<td class=${"calc perda" + (perda < 0 ? " neg" : "")}>${fmt(perda, 3)}${perda < 0
            ? html`<span class="msg-neg">rendeu mais do que entrou</span>` : null}</td><td class=${"calc rend" + (fora ? " neg" : "")}>${fmt(rend * 100, 2) + "%"}${fora
            ? html`<span class="msg-neg">fora da faixa padrão</span>` : null}</td>`;
        }
        return html`<tr key=${p.chave} data-proc=${p.chave}><td>${p.nome + " "}<span class="un">${"(" + p.un + ")"}</span></td>${campo("in_natura")}${campo("processado")}${perdaRend}<td class="fonte faixa">${
          fmt(p.padrao_min * 100, 0) + "% a " + fmt(p.padrao_max * 100, 0) + "%"}</td></tr>`;
      })}</tbody></table></div></section>`;
  }

  // Sincronizar continua a um clique (o mês do último lançamento). A setinha ao
  // lado abre a escolha de período, para reimportar dias que JÁ estão no
  // sistema — o caso de a planilha ter sido corrigida depois, num mês que a
  // sincronização normal não relê.
  return html`<main class="main-content tela-lancamento">
    <div class="screen-header">
      <div>
        <h1>Lançamento Diário</h1>
        <p>Preencha na ordem das colunas. O estoque inicial vem do dia anterior
           e o uso é calculado sozinho.</p>
      </div>
      <div class="header-acoes">
        <div class="botao-duplo">
          <button id="btn-sinc" class="botao" title="Traz para o sistema o que foi digitado nas planilhas de cada casa"
            disabled=${sincronizando === "normal"}
            onClick=${() => { if (pronto()) sincronizar(); }}>${
            sincronizando === "normal" ? "Lendo as planilhas…" : "Sincronizar planilhas"}</button>
          <button id="btn-periodo" class="botao botao-caret" title="Escolher o período a reimportar"
                  aria-expanded=${periodoAberto ? "true" : "false"} aria-haspopup="true"
                  onClick=${() => { if (pronto()) abrirPeriodo(!periodoAberto); }}>▾</button>
          <div class="painel-periodo" id="painel-periodo" hidden=${!periodoAberto} role="group"
               aria-label="Sincronizar um período">
            <p class="fonte">Relê as planilhas e reimporta <strong>todos os dias</strong> do
              período, não só os que ainda faltam. Dia corrigido aqui na tela continua
              como está.</p>
            <div class="pp-datas">
              <label class="campo"><span>De</span><input type="date" id="sinc-inicio" value=${periodo.inicio}
                onChange=${(e) => setPeriodo({ ...periodo, inicio: e.target.value })} /></label>
              <label class="campo"><span>Até</span><input type="date" id="sinc-fim" value=${periodo.fim}
                onChange=${(e) => setPeriodo({ ...periodo, fim: e.target.value })} /></label>
            </div>
            <div class="pp-atalhos">
              <button type="button" class="multi-acao" data-preset="mes" onClick=${() => presetPeriodo("mes")}>Mês atual</button>
              <button type="button" class="multi-acao" data-preset="anterior" onClick=${() => presetPeriodo("anterior")}>Mês anterior</button>
              <button type="button" class="multi-acao" data-preset="7" onClick=${() => presetPeriodo("7")}>Últimos 7 dias</button>
            </div>
            <button class="botao primario" id="btn-sinc-periodo" disabled=${sincronizando === "periodo"}
              onClick=${async () => {
                if (!periodo.inicio || !periodo.fim) { aviso("Informe as duas datas do período.", "mau"); return; }
                abrirPeriodo(false);
                await sincronizar({ inicio: periodo.inicio, fim: periodo.fim });
              }}>${sincronizando === "periodo" ? "Lendo as planilhas…" : "Sincronizar o período"}</button>
          </div>
        </div>
        <${Estado} texto=${est.texto} classe=${est.classe} />
        <button id="btn-salvar" class="botao primario" disabled=${salvando}
          onClick=${() => { if (pronto()) salvar(); }}>Salvar o dia</button>
      </div>
    </div>

    <section class="barra">
      <label class="campo"><span>Data</span><input type="date" id="data" value=${data}
        onChange=${(e) => { setData(e.target.value); if (pronto()) carregarDia(e.target.value); }} /></label>
      <div class="navdata">
        <button class="botao" id="dia-anterior" title="Dia anterior" onClick=${() => { if (pronto()) mudarDia(-1); }}>◀</button>
        <button class="botao" id="dia-hoje" onClick=${() => { if (pronto()) { setData(hojeLocal()); carregarDia(hojeLocal()); } }}>Hoje</button>
        <button class="botao" id="dia-seguinte" title="Próximo dia" onClick=${() => { if (pronto()) mudarDia(1); }}>▶</button>
      </div>
      <nav class="abas" id="abas-casas">${abas}</nav>
      <span class="fonte legenda-abas">O número ao lado de cada casa é quantos insumos ainda
        estão sem contagem final no dia; <span class="pend feito">✓</span> é dia fechado.</span>
    </section>

    <div id="painel">${msgPainel ? html`<p class="vazio">${msgPainel}</p>` : dia && rasc.current ? tabela() : null}</div>
  </main>`;
}

montarTela("lancamento", Lancamento);
