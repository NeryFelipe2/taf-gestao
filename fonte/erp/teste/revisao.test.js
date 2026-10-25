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

/* ============ B4 do revisor: nota rateada para item fora do orçamento fazia o valor sumir (calc_v2 ligada) ============ */
const { cenario } = require('./gerador');
const { it } = require('./obra999');
function cenOrfao(par = {}, rateio) {
  const D = obra999(); D.eap = [it('1.1', 'Item 1.1 (fictício)', '1.1.1', 'P1', 2000, 2000, 2200), it('1.2', 'Item 1.2 (fictício)', '1.1.1', 'P1', 2000, 2000, 2200)];
  D.pacotes = [{ codigo: 'P1', nome: 'Pacote 1', meta: 4000, teto: 4400 }];
  const oc = { id: 'o1', num: 'OC-9001', item: '1.1', nat: 'MAT', conta: '4.2.08', forn: 'FORNECEDOR FICTÍCIO', qtd: 1, preco: 1000, valor: 1000, status: 'aprovada', solicitante: 'x', recebido: 0 };
  const nf = { id: 'n1', num: 'NF-9001', emitente: 'FORNECEDOR FICTÍCIO', valor: 600, oc: 'o1', ocNum: 'OC-9001', rateio: rateio.map(([item, valor]) => ({ item, valor, nat: 'MAT', conta: '4.2.08' })), status: 'rateada' };
  return { D, t: { frozen: true, ocs: [oc], notas: [nf], par: { tol: 0.02, limite: 100000, ...par } } };
}
test('B4: nota de 600 rateada em item que não existe: o pedido continua comprometido e o aviso diz o porquê', () => {
  for (const ligada of [false, true]) {
    const c = cenOrfao({ calc_v2: ligada }, [['ZZ.9', 600]]); const S = abre(novo, c.D, c.t); const X = novo.derive();
    perto(S.sd['1.1'].comp, 1000, 'comprometido: o pedido inteiro, como com a chave desligada'); perto(X.real, 0, 'o realizado de item não vê a linha de ZZ.9');
    perto(X.comp + X.real, 1000, 'nada sumiu nem foi contado duas vezes (ligada: ' + ligada + ')');
  }
  const c = cenOrfao({ calc_v2: true }, [['ZZ.9', 600]]); abre(novo, c.D, c.t); const X = novo.derive();
  const av = J(novo.contaObra().avisos); assert.equal(av.length, 1); assert.deepEqual(av[0].orfaos, ['ZZ.9']); perto(av[0].valorOrfao, 600, 'valor órfão');
  const al = J(novo.alertas(X)).find(a => /fora do item/.test(a[1])); assert.match(al[2], /ZZ\.9, que não existe no orçamento/);
});
test('B4: parte do rateio em item que existe abate o pedido; a parte em item que não existe, não', () => {
  const c = cenOrfao({ calc_v2: true }, [['1.2', 200], ['ZZ.9', 400]]); const S = abre(novo, c.D, c.t); novo.derive();
  perto(S.sd['1.1'].comp, 800, 'abatido só pelos 200 que viraram realizado do 1.2'); perto(S.sd['1.2'].real, 200, 'realizado no 1.2');
  const av = J(novo.contaObra().avisos)[0]; assert.deepEqual(av.itens.sort(), ['1.2', 'ZZ.9']); assert.deepEqual(av.orfaos, ['ZZ.9']); perto(av.valorOrfao, 400, 'órfão'); perto(av.valor, 600, 'fora do item do pedido');
});
test('B4: sem item fora do orçamento o aviso não ganha campo novo (formato de antes)', () => {
  const c = cenOrfao({ calc_v2: true }, [['1.2', 600]]); abre(novo, c.D, c.t); novo.derive();
  assert.deepEqual(J(novo.contaObra().avisos), [{ tipo: 'nota_fora_do_item', oc: 'o1', ocNum: 'OC-9001', itemOC: '1.1', nota: 'n1', notaNum: 'NF-9001', itens: ['1.2'], valor: 600 }]);
});
test('B4: nas telas que trocam S.t por outra obra (S.D.items vazio) a conta não filtra item nenhum', () => {
  const c = cenOrfao({ calc_v2: true }, [['ZZ.9', 600]]); const S = abre(novo, c.D, c.t); novo.derive();
  const guarda = S.D; S.D = { obra: guarda.obra, items: [] };   /* como comObra() em 44_painel_inicio.js */
  try { perto(novo.contaObra(S.t).ocs[0].comp, 400, 'sem EAP conhecida vale a conta de antes'); } finally { S.D = guarda; }
  /* e a conta de outro t (carteira) nunca usa a EAP da obra aberta */
  const outro = J(S.t); perto(novo.contaObra(outro).ocs[0].comp, 400, 'outra obra: sem filtro');
});
test('B4: em 300 cenários com item fora do orçamento, a chave ligada nunca perde valor (pedido só é abatido pelo que virou realizado de item)', () => {
  let comOrfao = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const cen = cenario(seed); cen.t.par.calc_v2 = true;   /* itemFora padrão: ~4% das linhas vão para X.98, que não existe */
    const S = abre(novo, cen.D, cen.t); novo.derive();
    const noEap = new Set(S.D.items.map(i => i.codigo)), fat = {};
    S.t.notas.forEach(n => { if (n.status === 'lancada') return; n.rateio.forEach(l => { if (n.oc && noEap.has(l.item)) fat[n.oc] = (fat[n.oc] || 0) + +l.valor; if (!noEap.has(l.item)) comOrfao++; }); });
    const esperado = S.t.ocs.filter(o => ['aprovada', 'recebida_parcial', 'recebida'].includes(o.status)).reduce((s, o) => s + Math.max(0, o.valor - (fat[o.id] || 0)), 0);
    perto(novo.contaObra().ocs.reduce((s, x) => s + x.comp, 0), esperado, `semente ${seed}: comprometido`);
    perto(Object.values(S.sd).reduce((s, x) => s + x.comp, 0), esperado, `semente ${seed}: comprometido nas telas de item`);
  }
  assert.ok(comOrfao > 20, 'os cenários exercitam linhas fora do orçamento (' + comOrfao + ')');
});

/* ============ B5 do revisor: nota rateada sem a lista rateio ============ */
test('B5: chave DESLIGADA: nota rateada sem a lista rateio falha do mesmo jeito que o ERP de partida; ligada tolera', () => {
  const falha = (api, par) => {
    const c = cenOrfao(par, [['1.1', 100]]); delete c.t.notas[0].rateio;
    abre(api, c.D, c.t);
    try { api.derive(); return 'sem erro'; } catch (e) { return e.constructor.name + ': ' + e.message; }
  };
  const antes = falha(base, {}), agora = falha(novo, {});
  assert.match(antes, /TypeError/, 'a partida falha com TypeError'); assert.equal(agora, antes, 'desligada: mesmo erro, no mesmo lugar');
  assert.equal(falha(novo, { calc_v2: true }), 'sem erro', 'ligada: segue calculando, realizado 0 para a nota sem lista');
});
