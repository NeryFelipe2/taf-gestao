'use strict';
/* Correções dos achados da revisão do M1 e do M2. Cada bloco reproduz o achado (cenário fictício da OBRA 999) e prova a correção.
   Onde a correção mexe em algo que existe desde a partida, o teste também compara com o ERP de partida (commit 243d676, lido do git)
   para provar que, com as chaves desligadas, nada mudou. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { carrega, abre } = require('./ambiente');
const { limpa } = require('./instantaneo');
const { obra999, estado999 } = require('./obra999');

const base = carrega('base'), novo = carrega('trabalho');
const J = x => JSON.parse(JSON.stringify(x));   /* tira o prototype de outro contexto do vm */
const perto = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.005, `${msg}: ${a} x ${b}`);
function semCarimbo(s) { /* auditoria e histórico levam hora e id aleatório; o resto tem de ser igual */
  const c = J(s);
  (c.aud || []).forEach(a => { delete a.id; delete a.q; });
  (c.hist || []).forEach(h => { delete h.quando; });
  return limpa(c);
}
const desmarca = api => { ['calc_v2', 'ev_agrega'].forEach(k => { api.el('#ch-' + k).checked = false; }); };

/* ============ M1 do revisor: o botão escuro "Salvar" da janela de Parâmetros ignorava as caixas das chaves ============ */
test('Parâmetros: "Salvar" grava as chaves marcadas e desmarcadas junto com as alçadas', () => {
  const S = abre(novo, obra999(), estado999({ calc_v2: true }), 'gestao'); novo.derive();
  novo.el('#p-l').value = '50000'; novo.el('#p-g').value = '200000'; novo.el('#p-t').value = '3';
  novo.el('#ch-calc_v2').checked = false;      /* desmarcou a que estava ligada */
  novo.el('#ch-ev_agrega').checked = true;     /* marcou a que estava desligada */
  novo.clicar('params-ok');
  assert.equal(S.t.par.calc_v2, false, 'calc_v2 desligou'); assert.equal(S.t.par.ev_agrega, true, 'ev_agrega ligou');
  assert.equal(S.t.par.alcadaOk, true); assert.equal(S.t.par.limite, 50000); assert.equal(S.t.par.gerenteAte, 200000); perto(S.t.par.tol, 0.03, 'tolerância');
  const aud = J(S.t.aud);
  const a1 = aud.find(x => x.campo === 'calc_v2'), a2 = aud.find(x => x.campo === 'ev_agrega');
  assert.deepEqual([a1.antes, a1.depois], ['ligada', 'desligada']); assert.deepEqual([a2.antes, a2.depois], ['desligada', 'ligada']);
  assert.ok(aud.some(x => x.campo === 'limite/gerente/tolerância'), 'a alçada continua indo para a auditoria');
  /* a tela passa a ter a aba Eventos e o motor acompanhou a chave */
  assert.ok(J(novo.areasVisiveis()).find(a => a.k === 'obra').tabs.some(t => t[0] === 'evt'));
  desmarca(novo);
});

test('Parâmetros: "Salvar" com as caixas como estavam deixa tudo como o ERP de partida deixava (chaves desligadas)', () => {
  const res = [base, novo].map(api => {
    const S = abre(api, obra999(), estado999(), 'gestao'); api.derive();
    if (api.origem === 'trabalho') desmarca(api);
    api.el('#p-l').value = '75000'; api.el('#p-g').value = '300000'; api.el('#p-t').value = '1.5';
    api.clicar('params-ok');
    return { par: S.t.par, aud: S.t.aud, itens: S.D.items.map(i => [i.codigo, i.meta_total, i.meta_unit]) };
  });
  assert.deepEqual(semCarimbo(res[0]), semCarimbo(res[1]));
});

test('Parâmetros: "Salvar só as chaves" continua sem mexer na alçada', () => {
  const S = abre(novo, obra999(), estado999(), 'gestao'); novo.derive();
  novo.el('#ch-calc_v2').checked = true; novo.el('#ch-ev_agrega').checked = false;
  novo.clicar('chaves-ok');
  assert.equal(S.t.par.calc_v2, true); assert.equal(S.t.par.alcadaOk, undefined); assert.equal(S.t.par.limite, 100000);
  desmarca(novo);
});
