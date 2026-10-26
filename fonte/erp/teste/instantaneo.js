'use strict';
/* "Fotografia" do que o ERP calcula e mostra para um cenário. Serve para comparar o ERP de partida com o novo:
   com as chaves desligadas as duas fotografias têm de ser iguais. Só usa funções que existem nos dois. */
const { abre } = require('./ambiente');

/* arredonda números soltos a 1e-6 (ruído de ponto flutuante não conta como diferença) e tira o que depende do relógio */
function limpa(v) {
  if (typeof v === 'number') return Math.abs(v) < 1e-9 ? 0 : Math.round(v * 1e6) / 1e6;
  if (Array.isArray(v)) { const r = []; for (const x of v) r.push(limpa(x)); return r; }   /* sem v.map: o array do ERP vem de outro contexto do vm */
  if (v && typeof v === 'object') { const o = {}; Object.keys(v).sort().forEach(k => { o[k] = limpa(v[k]); }); return o; }
  return v;
}

function tenta(f) { try { return f(); } catch (e) { return 'ERRO: ' + e.message; } }

function instantaneo(api, cen, papel = 'gestao') {
  const S = abre(api, cen.D, cen.t, papel);
  const X = api.derive(); S.X = X;
  const out = {};
  out.sd = S.sd;
  out.X = { meta: X.meta, venda: X.venda, teto: X.teto, comp: X.comp, real: X.real, economia: tenta(() => X.economia), aCotar: X.aCotar.length, semFolga: X.semFolga.length, pend: X.pendAprov.length, semRateio: X.semRateio.length, semPedido: X.semPedido.length };
  out.itens = S.D.items.map(i => ({ c: i.codigo, m: i.meta_total, mb: i.meta_base, mu: i.meta_unit, te: i.teto_total, st: i.status_cotacao, nat: i.nat }));
  out.pacotes = S.D.pacotes.map(p => ({ c: p.codigo, meta: p.meta, teto: p.teto, _meta: p._meta, _comp: p._comp, _real: p._real, _acima: p._acima, _semFolga: p._semFolga, _cot: p._cot, _temOC: p._temOC }));
  out.alertas = tenta(() => api.alertas(X));
  out.viewEap = tenta(() => api.viewEap(X));
  out.viewPac = tenta(() => api.viewPac(X));
  out.viewPlano = tenta(() => api.viewPlano(X));
  out.pacRow = tenta(() => S.D.pacotes.map(p => api.pacRow(p)));
  out.prov29 = tenta(() => api.painelLinhas('prov'));
  out.prov44 = tenta(() => [api.provOcs(S.t), api.provOcsSplit(S.t)]);
  out.prov48 = tenta(() => api.provLinhas());
  out.sem = S.D.items.map(i => [100, 5000, 250000, 1e7].map(v => api.semaforo(i.codigo, v)));
  out.semFora = api.semaforo('NAO.EXISTE', 100);
  out.abas = api.areasVisiveis().map(a => a.k + ':' + a.tabs.map(t => t[0]).join(','));
  return limpa(out);
}

module.exports = { instantaneo, limpa, tenta };
