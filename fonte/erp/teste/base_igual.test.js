'use strict';
/* PROVA: com as chaves novas desligadas (padrão), o ERP novo calcula e mostra EXATAMENTE o que o ERP de partida (commit 243d676) calculava.
   O ERP de partida é lido do git; o novo vem dos arquivos da cópia. Mesmos 300 cenários aleatórios fictícios nos dois. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { carrega, abre } = require('./ambiente');
const { cenario } = require('./gerador');
const { instantaneo, limpa } = require('./instantaneo');
const { obra999, estado999 } = require('./obra999');

const base = carrega('base'), novo = carrega('trabalho');

function semErro(f, rotulo) {   /* se alguma parte da fotografia falhou, o teste não vale: acusa na hora */
  const ruim = Object.keys(f).filter(k => typeof f[k] === 'string' && f[k].startsWith('ERRO'));
  assert.deepEqual(ruim, [], rotulo + ': partes da fotografia falharam: ' + ruim.map(k => k + '=' + f[k]).join(' | '));
  return f;
}

function iguais(a, b, rotulo) {
  semErro(a, rotulo + ' (partida)'); semErro(b, rotulo + ' (novo)');
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja === jb) return;
  /* mostra a primeira diferença, sem despejar a tela inteira */
  for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) assert.deepEqual(a[k], b[k], rotulo + ' · campo ' + k);
  assert.fail(rotulo + ': fotografias diferentes');
}

test('300 cenários aleatórios: partida e novo mostram a mesma coisa (chaves desligadas)', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const cen = cenario(seed, seed % 5 === 0 ? { eventos: false } : {});
    iguais(instantaneo(base, cen), instantaneo(novo, cen), 'semente ' + seed);
  }
});

test('obra 999 com o cenário do plano: partida e novo mostram a mesma coisa', () => {
  const cen = { D: obra999(), t: estado999() };
  iguais(instantaneo(base, cen), instantaneo(novo, cen), 'obra 999');
});

test('papéis com lista de telas própria: abas iguais às de partida', () => {
  const cen = { D: obra999(), t: estado999() };
  for (const papel of ['gestao', 'diretoria', 'gerente', 'engenheiro', 'compras', 'planejamento', 'almox', 'adm', 'financeiro', 'encarregado']) {
    assert.deepEqual(instantaneo(base, cen, papel).abas, instantaneo(novo, cen, papel).abas, 'papel ' + papel);
  }
});

function semCarimbo(s) { /* auditoria e histórico levam hora e id aleatório; o resto tem de ser igual */
  const c = JSON.parse(JSON.stringify(s));
  (c.aud || []).forEach(a => { delete a.id; delete a.q; });
  (c.hist || []).forEach(h => { delete h.quando; });
  return limpa(c);
}

test('remanejar saldo (chave desligada): mesmo resultado gravado que o de partida', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const cen = cenario(seed);
    const itens = cen.D.eap.filter(e => e.tipo_linha === 'item' && e.meta_total != null);
    if (itens.length < 2) continue;
    const res = [base, novo].map(api => {
      const S = abre(api, cen.D, { ...cen.t, frozen: true, par: { tol: 0.02, limite: 100000 } }, 'gerente');
      api.derive();
      const livre = S.sd[itens[0].codigo].livre;
      api.el('#rm-de').value = itens[0].codigo; api.el('#rm-para').value = itens[1].codigo;
      api.el('#rm-v').value = String(Math.max(0.01, Math.min(100, livre > 0 ? livre : 0.01)));
      api.el('#rm-m').value = 'teste'; api.el('#rm-msg');
      api.doRemanejar();
      return { metaOv: S.t.metaOv, versao: S.t.versao, hist: S.t.hist, aud: S.t.aud, itens: S.D.items.map(i => [i.codigo, i.meta_total, i.meta_unit]) };
    });
    assert.deepEqual(semCarimbo(res[0]), semCarimbo(res[1]), 'semente ' + seed);
  }
});

test('Atualizar pela planilha (chave desligada): comparação e aplicação iguais às de partida', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const cen = cenario(seed);
    const L = { itens: [], pacotes: [{ codigo: 'P1', meta: 123456.78, teto: 234567.89, fechar_ate: '2031-01-01' }] };
    cen.D.eap.filter(e => e.tipo_linha === 'item').forEach((i, k) => { if (k % 2 === 0) L.itens.push({ codigo: i.codigo, qtd: i.qtd, meta: (i.meta_total || 1000) + 111.11, teto: (i.teto_total || 2000) + 222.22, status: 'Cotado' }); });
    const res = [base, novo].map(api => {
      const S = abre(api, cen.D, { ...cen.t, frozen: true }, 'gestao');
      api.derive();
      const d = api.calculaDiff(L);
      /* aplica: syncAplicar lê a variável SYNC do módulo; o teste a preenche pelo próprio contexto */
      api.ctx.__d = d; require('node:vm').runInContext('SYNC=Object.assign(__d,{arquivo:"teste.json"})', api.ctx);
      api.syncAplicar();
      return { dif: d.dif, pacs: d.pacs, novos: d.info.novos, semQtd: d.info.semQtd, semMov: d.semMov, dMeta: d.dMeta, baseOv: S.t.baseOv, basePac: S.t.basePac, versao: S.t.versao, itens: S.D.items.map(i => [i.codigo, i.meta_total, i.teto_total, i.meta_unit]) };
    });
    assert.deepEqual(semCarimbo(res[0]), semCarimbo(res[1]), 'semente ' + seed);
  }
});
