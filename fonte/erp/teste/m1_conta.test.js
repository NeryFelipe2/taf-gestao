'use strict';
/* M1 (parte do navegador), conta única: comprometido, realizado e saldo saem de contaObra(), atrás da chave par.calc_v2 (padrão desligada). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { carrega, abre } = require('./ambiente');
const { cenario } = require('./gerador');
const { it, obra999, estado999 } = require('./obra999');

const api = carrega('trabalho');
const J = x => JSON.parse(JSON.stringify(x));   /* tira o prototype de outro contexto do vm */
const perto = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.005, `${msg}: ${a} x ${b}`);

/* ---------- (a) cenário do plano: item A meta 1.000, OC 600 no A, NF 600 rateada 100% no B ---------- */
function cenA(par = {}) {
  const D = obra999(); D.eap = [it('A', 'Item A (fictício)', '1.1.1', 'P1', 2000, 1000, 1100), it('B', 'Item B (fictício)', '1.1.1', 'P1', 2000, 1000, 1100)];
  D.pacotes = [{ codigo: 'P1', nome: 'Pacote 1', meta: 2000, teto: 2200 }];
  const oc = { id: 'o1', num: 'OC-9001', item: 'A', nat: 'MAT', conta: '4.2.08', forn: 'FORNECEDOR FICTÍCIO', qtd: 1, preco: 600, valor: 600, status: 'aprovada', solicitante: 'x', recebido: 0 };
  const nf = { id: 'n1', num: 'NF-9001', emitente: 'FORNECEDOR FICTÍCIO', valor: 600, oc: 'o1', ocNum: 'OC-9001', rateio: [{ item: 'B', valor: 600, nat: 'MAT', conta: '4.2.08' }], status: 'rateada' };
  return { D, t: { frozen: true, ocs: [oc], notas: [nf], par: { tol: 0.02, limite: 100000, ...par } } };
}

test('(a) chave DESLIGADA: conta como hoje (R$ 1.200) e não emite aviso', () => {
  const c = cenA(); const S = abre(api, c.D, c.t); const X = api.derive();
  perto(S.sd.A.comp, 600, 'comprometido A'); perto(S.sd.B.real, 600, 'realizado B'); perto(S.sd.A.livre, 400, 'saldo livre A');
  perto(X.comp + X.real, 1200, 'total contado');
  assert.deepEqual(J(api.contaObra().avisos), []);
  assert.ok(!J(api.alertas(X)).some(a => /fora do item/.test(a[1])), 'sem aviso com a chave desligada');
  assert.equal(api.semaforo('A', 900)[0], 'vermelho');   /* 600 + 900 > teto 1.100: a dupla contagem de hoje */
});

test('(a) chave LIGADA: conta R$ 600 e emite o aviso', () => {
  const c = cenA({ calc_v2: true }); const S = abre(api, c.D, c.t); const X = api.derive();
  perto(S.sd.A.comp, 0, 'comprometido A'); perto(S.sd.B.real, 600, 'realizado B'); perto(S.sd.A.livre, 1000, 'saldo livre A');
  perto(X.comp + X.real, 600, 'total contado');
  const av = J(api.contaObra().avisos);
  assert.equal(av.length, 1);
  assert.deepEqual(av[0], { tipo: 'nota_fora_do_item', oc: 'o1', ocNum: 'OC-9001', itemOC: 'A', nota: 'n1', notaNum: 'NF-9001', itens: ['B'], valor: 600 });
  const al = J(api.alertas(X)).find(a => /fora do item/.test(a[1]));
  assert.ok(al, 'alerta de nota fora do item'); assert.equal(al[0], 'warn'); assert.match(al[1], /NF-9001 rateada fora do item do pedido OC-9001/);
  assert.equal(api.semaforo('A', 900)[0], 'verde');   /* 0 + 900 cabe no saldo de 1.000 */
});

test('(a) variações: nota parcial em outro item, duas notas, nota não rateada, OC não aprovada', () => {
  const c = cenA({ calc_v2: true });
  c.t.ocs[0].valor = 1000; c.t.ocs[0].preco = 1000;
  c.t.notas = [
    { id: 'n1', num: 'NF-1', oc: 'o1', valor: 400, rateio: [{ item: 'A', valor: 100 }, { item: 'B', valor: 300 }], status: 'rateada' },
    { id: 'n2', num: 'NF-2', oc: 'o1', valor: 250, rateio: [{ item: 'B', valor: 250 }], status: 'conferida' },
    { id: 'n3', num: 'NF-3', oc: 'o1', valor: 500, rateio: [], status: 'lancada' },   /* ainda sem rateio: não abate nem realiza */
  ];
  const S = abre(api, c.D, c.t); const X = api.derive();
  perto(S.sd.A.comp, 1000 - 650, 'OC 1.000 menos as notas ligadas (650)'); perto(S.sd.A.real, 100, 'real A'); perto(S.sd.B.real, 550, 'real B');
  perto(X.comp + X.real, 1000, 'pedido de 1.000 inteiro, uma vez só');
  const av = J(api.contaObra().avisos); assert.equal(av.length, 2); assert.deepEqual(av.map(a => a.notaNum).sort(), ['NF-1', 'NF-2']);
  assert.equal(av.find(a => a.notaNum === 'NF-1').valor, 300);
  c.t.ocs[0].status = 'em_alcada';   /* pedido que ainda não foi aprovado não compromete e não gera aviso */
  abre(api, c.D, c.t); api.derive(); assert.deepEqual(J(api.contaObra().avisos), []); perto(api.S.sd.A.comp, 0, 'OC em alçada não compromete');
  c.t.ocs[0].status = 'aprovada'; c.t.notas[0].oc = ''; abre(api, c.D, c.t); api.derive();
  assert.equal(api.contaObra().avisos.length, 1, 'só a NF-2 continua ligada à OC');
});

/* ---------- (b) as cópias dão o mesmo número ---------- */
function copias(S) {
  const sd = Object.values(S.sd), ocsC = api.contaObra(S.t).ocs;
  const prov29 = J(api.painelLinhas('prov')).reduce((s, r) => s + r.valor, 0);
  const split = J(api.provOcsSplit(S.t));
  const prov48 = J(api.provLinhas()).filter(r => r.origem === 'Pedido sem nota').reduce((s, r) => s + r.valor, 0);
  const plano = api.planoSaldos(); const soma = o => Object.values(J(o)).reduce((s, v) => s + v, 0);
  return {
    '05 saldos()': sd.reduce((s, x) => s + x.comp, 0), '16 plano de contas': soma(plano.comp), '29 painel do contrato': prov29,
    '44 provOcs': api.provOcs(S.t), '44 provOcsSplit': split.prod + split.serv, '48 ficha do contrato': prov48, 'motor contaObra': ocsC.reduce((s, x) => s + x.comp, 0),
    '05 realizado': sd.reduce((s, x) => s + x.real, 0), '16 realizado': soma(plano.real),
  };
}
for (const ligada of [false, true]) {
  test(`(b) as 6 cópias (05, 16, 29, 44 x2, 48) dão o mesmo número em 300 cenários, chave ${ligada ? 'LIGADA' : 'desligada'}`, () => {
    let comNota = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const cen = cenario(seed, { itemFora: false });
      cen.t.par.calc_v2 = ligada;
      const S = abre(api, cen.D, cen.t); api.derive();
      const c = copias(S);
      for (const k of ['16 plano de contas', '29 painel do contrato', '44 provOcs', '44 provOcsSplit', '48 ficha do contrato', 'motor contaObra']) perto(c[k], c['05 saldos()'], `semente ${seed} · ${k} x 05`);
      perto(c['16 realizado'], c['05 realizado'], `semente ${seed} · realizado 16 x 05`);
      if (api.contaObra().ocs.length && J(S.t.notas).some(n => n.oc && n.status !== 'lancada')) comNota++;
    }
    assert.ok(comNota > 100, 'os cenários exercitam pedidos com nota (' + comNota + ')');
  });
}

test('(b) ligada nunca conta mais que desligada, e só difere quando há nota fora do item (e então avisa)', () => {
  let diferentes = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const cen = cenario(seed, { itemFora: false });
    const tot = lig => { const c = J(cen.t); c.par.calc_v2 = lig; const S = abre(api, cen.D, c); api.derive(); return { comp: Object.values(S.sd).reduce((s, x) => s + x.comp, 0), real: Object.values(S.sd).reduce((s, x) => s + x.real, 0), av: api.contaObra().avisos.length }; };
    const off = tot(false), on = tot(true);
    perto(on.real, off.real, `semente ${seed} realizado não muda`);
    assert.ok(on.comp <= off.comp + 1e-6, `semente ${seed}: ligada conta mais que desligada`);
    if (Math.abs(on.comp - off.comp) > 0.004) { diferentes++; assert.ok(on.av > 0, `semente ${seed}: mudou o número sem avisar`); }
    if (on.av === 0) perto(on.comp, off.comp, `semente ${seed}: sem nota fora do item os números são iguais`);
  }
  assert.ok(diferentes > 50, 'há cenários em que a chave faz diferença (' + diferentes + ')');
});
