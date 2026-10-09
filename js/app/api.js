// ============================================================================
// O ÚNICO lugar com fetch. Uma função por rota do server.py, com o nome da
// rota no nome da função.
//
// Cada função devolve a Response do fetch, sem abrir o JSON: as telas antigas
// tratam a resposta de jeitos diferentes (umas olham r.ok, outras só r.json(),
// outras engolem a falha), e a migração mantém cada tratamento como era. As
// opções (cache: "no-store") são as mesmas que cada tela já usava.
// ============================================================================
const postJSON = (url, corpo) => fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(corpo),
});
const qs = (obj) => {
  const q = new URLSearchParams();
  Object.entries(obj || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") q.set(k, v);
  });
  const s = q.toString();
  return s ? "?" + s : "";
};

// ------------------------------------------------------------ configuração
export const getConfig = () => fetch("/api/config");

// ------------------------------------------------------------ lançamento
export const getDia = (data) => fetch("/api/dia?data=" + data);
export const postDia = (corpo) => postJSON("/api/dia", corpo);
// sem período: mês do último lançamento até hoje (o servidor decide);
// com { inicio, fim }: reimporta os dias escolhidos.
export const getSincronizar = (periodo) => fetch("/api/sincronizar"
  + (periodo ? "?inicio=" + periodo.inicio + "&fim=" + periodo.fim : ""));

// ------------------------------------------------------------ painel
export const getPainel = (inicio, fim) => fetch("/api/painel"
  + (inicio && fim ? `?inicio=${inicio}&fim=${fim}` : ""));
export const getSerie = (insumo, casa, inicio, fim) =>
  fetch(`/api/serie?insumo=${insumo}&casa=${casa}&inicio=${inicio}&fim=${fim}`);
export const getOcorrencias = (insumo, casa, n, semana) =>
  fetch(`/api/ocorrencias?insumo=${insumo}&casa=${casa}&n=${n}`
    + (semana ? "&semana=" + encodeURIComponent(semana) : ""));

// ------------------------------------------------------------ projeção
export const getProjecao = (data, dias) => fetch("/api/projecao?data=" + data
  + (dias !== undefined ? "&dias=" + dias : ""));
export const postPedido = (corpo) => postJSON("/api/pedido", corpo);

// ------------------------------------------------------------ visão geral
export const getOverview = (mes) => fetch("/api/overview" + (mes ? "?mes=" + mes : ""),
  { cache: "no-store" });

// ------------------------------------------------------------ movimentações
// filtros: { inicio, fim, casa, insumo, tipo, limite, sem_preco } — vazio some
export const getMovimentacoes = (filtros) => fetch("/api/movimentacoes" + qs(filtros),
  { cache: "no-store" });
export const postPreco = (corpo) => postJSON("/api/preco", corpo);
export const postMovimentacao = (corpo) => postJSON("/api/movimentacao", corpo);

// ------------------------------------------------------------ cadastros
export const getBase = () => fetch("/api/base", { cache: "no-store" });
export const postBase = (corpo) => postJSON("/api/base", corpo);
export const getVinculos = () => fetch("/api/vinculos", { cache: "no-store" });
export const postVinculos = (corpo) => postJSON("/api/vinculos", corpo);

// ------------------------------------------------------------ ordens e OCs
export const getOrdens = (situacao) => fetch("/api/ordens" + (situacao ? "?situacao=" + situacao : ""));
export const postOrdem = (corpo) => postJSON("/api/ordem", corpo);
export const postOrdemNova = (corpo) => postJSON("/api/ordem/nova", corpo);
export const postOrdensLote = (corpo) => postJSON("/api/ordens/lote", corpo);
export const getOcs = () => fetch("/api/ocs");
// Numeração nunca é calculada no navegador: vem do Registro_OCs.json
// compartilhado com o Gerador de OCs.
export const getOcsProximo = (unidade) =>
  fetch("/api/ocs/proximo?unidade=" + encodeURIComponent(unidade), { cache: "no-store" });
export const postOcsReservar = (corpo) => postJSON("/api/ocs/reservar", corpo);

// ------------------------------------------------------------ parâmetros
export const getParametros = () => fetch("/api/parametros", { cache: "no-store" });
export const postParametros = (corpo) => postJSON("/api/parametros", corpo);
