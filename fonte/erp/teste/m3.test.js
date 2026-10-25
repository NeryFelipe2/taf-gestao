'use strict';
/* M3: compra com várias linhas (solicitação e OC com linhas [{item, qtd, valor}]), atrás da chave par.oc_linhas (padrão desligada).
   Tudo fictício (OBRA 999 e cenários aleatórios). Nada de rede, banco ou chave. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { carrega, abre } = require('./ambiente');
const { cenario, comLinhas } = require('./gerador');
const { instantaneo } = require('./instantaneo');
const { obra999, estado999, it, gr } = require('./obra999');

const api = carrega('trabalho'), base = carrega('base');
const J = x => JSON.parse(JSON.stringify(x));   /* tira o prototype de outro contexto do vm */
const perto = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.005, `${msg}: ${a} x ${b}`);
const soma = (L, f) => L.reduce((s, x) => s + f(x), 0);
/* com a chave ligada os Alertas ganham o aviso fixo de que o banco ainda não acompanha (LEIA-ME-M3-SQL-PENDENTE.md); fora ele, o resto tem de ser igual */
const semAviso = f => { const g = { ...f }; g.alertas = f.alertas.filter(a => !/Compra de várias linhas ligada/.test(a[1])); return g; };

/* ---------- obra fictícia do pedido de FoFo: 2 eventos, 1 pacote, um item sem meta ---------- */
function obraFofo() {
  const D = obra999();
  D.eap = [gr('2', 'ESTAÇÃO ELEVATÓRIA (fictícia)'),
    it('2.1', 'Tubos de FoFo (fictício)', '2.1.1', 'HIDR', 20000, 10000, 11000),
    it('2.2', 'Conexões de FoFo (fictício)', '2.1.1', 'HIDR', 6000, 3000, 3300),
    it('2.3', 'Válvulas (fictício, sem meta)', '2.1.2', 'HIDR', 5000, null, null),
    it('2.4', 'Medidores (fictício)', '2.1.2', 'HIDR', 4000, 2000, 2200)];
  D.pacotes = [{ codigo: 'HIDR', nome: 'Hidráulica (fictício)', meta: 15000, teto: 16500, fechar_ate: '2030-01-20', precisa_em_obra: '2030-03-01', responsavel: 'Engenheiro 999', condicao_pagamento: '30 dias', observacoes: '' }];
  return D;
}
const estFofo = par => ({ frozen: true, par: { tol: 0.02, limite: 100000, ...par } });

/* ---------- ações pela tela (o mesmo caminho do clique: campos do formulário e funções do ERP) ---------- */
function solicita(a, L, desc = 'Pedido FoFo (fictício)') {
  a.el('#s-item').value = L[0].item; a.el('#s-nat').value = 'MAT'; a.el('#s-qtd').value = String(L[0].qtd); a.el('#s-pu').value = String(L[0].pu);
  a.el('#s-desc').value = desc; a.el('#s-dt').value = '2030-02-01'; a.el('#s-mot').value = 'teste'; a.el('#s-ins').value = '';
  a.SOLX.length = 0; L.slice(1).forEach(l => a.SOLX.push({ item: l.item, nat: 'MAT', qtd: String(l.qtd), pu: String(l.pu) }));
  const antes = a.S.t.sols.length; a.doSol();
  return a.S.t.sols.length > antes ? a.S.t.sols[0] : null;
}
function emite(a, sol, preco, just = 'justificativa de teste') {
  a.el('#c-f').value = 'FORNECEDOR FICTÍCIO LTDA'; a.el('#c-p').value = String(preco); a.el('#c-z').value = '10'; a.el('#c-j').value = just;
  a.addCot(sol.id); a.el('input[name=esc]:checked').value = '0'; a.el('#c-em').checked = false; a.el('#c-j').value = just;
  const antes = a.S.t.ocs.length; a.emitirOC(sol.id);
  return a.S.t.ocs.length > antes ? a.S.t.ocs[0] : null;
}
function lancaNota(a, ocObj, valor, rateio) {
  a.modalNF(); a.el('#n-e').value = 'FORNECEDOR FICTÍCIO LTDA'; a.el('#n-c').value = 'NF-TESTE'; a.el('#n-v').value = String(valor); a.el('#n-d').value = '2030-02-10'; a.el('#n-o').value = ocObj ? ocObj.id : '';
  a.NF.oc = ocObj ? ocObj.id : ''; a.NF.valor = valor; a.NF.rateio = rateio; a.doNF('rateada');
  return a.S.t.notas[0];
}

/* ============ (1) o pedido do plano: 3 linhas em 2 eventos (uma cabe, uma passa da meta, uma sem meta) ============ */
test('FOFO: linha sem meta bloqueia a solicitação inteira; sem ela a solicitação sai amarela, vira OC, é aprovada, recebida e rateada nas mesmas linhas', () => {
  const S = abre(api, obraFofo(), estFofo({ oc_linhas: true }), 'engenheiro'); api.derive();
  api.limpaMsgs();
  /* 2.1 cabe (6.000 de 10.000), 2.2 passa da meta (3.200 de 3.000, mas dentro do teto 3.300), 2.3 não tem meta */
  const ruim = solicita(api, [{ item: '2.1', qtd: 10, pu: 600 }, { item: '2.2', qtd: 10, pu: 320 }, { item: '2.3', qtd: 1, pu: 500 }]);
  assert.equal(ruim, null, 'a solicitação com linha sem meta não nasce');
  assert.match(api.msgs().join('|'), /Item sem meta de custo/); assert.equal(S.t.sols.length, 0);
  assert.match(String(api.semaforoLinhas([{ item: '2.1', valor: 6000 }, { item: '2.3', valor: 500 }])[2]), /item 2\.3/, 'o texto diz de qual item vem a cor');

  assert.equal(api.semaforoLinhas([{ item: '2.1', valor: 6000 }, { item: '2.2', valor: 4000 }])[0], 'vermelho', 'a linha 2.2 com 4.000 passa do teto 3.300: vale a pior cor');
  const sol = solicita(api, [{ item: '2.1', qtd: 10, pu: 600 }, { item: '2.2', qtd: 10, pu: 320 }]);
  assert.ok(sol, 'solicitação criada'); assert.equal(sol.sem, 'amarelo');
  assert.equal(sol.item, '2.1', 'item = primeira linha (compatibilidade)'); assert.equal(sol.qtd, 1); assert.equal(sol.preco, 9200);
  assert.deepEqual(J(sol.linhas).map(l => [l.item, l.qtd, l.valor]), [['2.1', 10, 6000], ['2.2', 10, 3200]]);

  const oc = emite(api, sol, 9200);
  assert.ok(oc, 'OC criada'); assert.equal(oc.sem, 'amarelo'); assert.equal(oc.status, 'em_alcada'); assert.equal(oc.alcada, 'gerente');
  assert.equal(oc.item, '2.1'); assert.equal(oc.valor, 9200); assert.equal(oc.qtd, 1); assert.equal(oc.preco, 9200);
  assert.deepEqual(J(oc.linhas).map(l => [l.item, l.valor]), [['2.1', 6000], ['2.2', 3200]]);
  api.derive(); perto(S.sd['2.1'].comp, 0, 'em alçada ainda não compromete');

  S.role = 'gerente'; api.decidir(oc.id, true);
  assert.equal(oc.status, 'aprovada', 'o Gerente aprova (quem solicitou é outro)');
  let X = api.derive();
  perto(S.sd['2.1'].comp, 6000, 'comprometido da linha 2.1'); perto(S.sd['2.2'].comp, 3200, 'comprometido da linha 2.2'); perto(S.sd['2.3'].comp, 0, '2.3 sem compra');
  perto(S.sd['2.1'].livre, 4000, 'saldo livre 2.1'); perto(S.sd['2.2'].livre, -200, 'saldo livre 2.2 (passou da meta)');
  const E = J(api.agregaEventos()), e211 = E.grupos.find(g => g.chave === '2.1.1'), e212 = E.grupos.find(g => g.chave === '2.1.2');
  perto(e211.comp, 9200, 'evento 2.1.1 comprometido'); perto(e212.comp, 0, 'evento 2.1.2 sem compra');
  assert.ok(E.confere.ok, 'os eventos fecham com a obra');
  perto(J(api.agregaPacotes()).grupos.find(g => g.chave === 'HIDR').comp, 9200, 'pacote HIDR');
  perto(X.comp, 9200, 'total comprometido da obra');

  S.role = 'almox'; api.el('#rc-q').value = '1'; api.doReceber(oc.id);
  assert.equal(oc.status, 'recebida'); assert.equal(oc.recebido, 1);

  /* nota de R$ 9.200: o rateio nasce igual às linhas do pedido */
  S.role = 'adm';
  api.modalNF(); api.NF.oc = oc.id;
  assert.deepEqual(J(api.rateioDoPedido(oc)), [{ item: '2.1', valor: 6000 }, { item: '2.2', valor: 3200 }]);
  const n = lancaNota(api, oc, 9200, api.rateioDoPedido(oc));
  assert.equal(n.status, 'rateada'); assert.deepEqual(J(n.rateio).map(l => [l.item, l.valor]), [['2.1', 6000], ['2.2', 3200]]);
  X = api.derive();
  perto(S.sd['2.1'].comp, 0, 'faturado 2.1: nada mais comprometido'); perto(S.sd['2.2'].comp, 0, 'faturado 2.2'); perto(S.sd['2.1'].real, 6000, 'realizado 2.1'); perto(S.sd['2.2'].real, 3200, 'realizado 2.2');
  perto(X.comp + X.real, 9200, 'o pedido conta uma vez só');
});

test('FOFO: nota menor que o pedido, faturado por linha (parcial): cada linha abate a parte dela e o resto continua comprometido', () => {
  const S = abre(api, obraFofo(), estFofo({ oc_linhas: true }), 'engenheiro'); api.derive();
  const sol = solicita(api, [{ item: '2.1', qtd: 10, pu: 600 }, { item: '2.2', qtd: 10, pu: 320 }]);
  const oc = emite(api, sol, 9200); S.role = 'gerente'; api.decidir(oc.id, true); S.role = 'almox'; api.el('#rc-q').value = '0.5'; api.doReceber(oc.id);
  S.role = 'adm'; api.modalNF(); api.NF.oc = oc.id; api.NF.valor = 4600;
  const rat = J(api.rateioDoPedido(oc)); assert.deepEqual(rat, [{ item: '2.1', valor: 3000 }, { item: '2.2', valor: 1600 }], 'nota de 4.600: parte proporcional de cada linha');
  lancaNota(api, oc, 4600, rat); api.derive();
  perto(S.sd['2.1'].comp, 3000, 'resta comprometido em 2.1'); perto(S.sd['2.2'].comp, 1600, 'resta comprometido em 2.2'); perto(S.sd['2.1'].real, 3000, '2.1 realizado'); perto(S.sd['2.2'].real, 1600, '2.2 realizado');
  /* nota só na linha 2.2: a linha 2.1 continua inteira comprometida */
  api.derive(); S.t.notas.length = 0; lancaNota(api, oc, 1500, [{ item: '2.2', valor: 1500 }]); api.derive();
  perto(S.sd['2.1'].comp, 6000, '2.1 intacta'); perto(S.sd['2.2'].comp, 1700, '2.2 abatida só pela nota do próprio item');
});

/* ============ (2) pedido antigo com um item só continua funcionando ============ */
test('OC antiga (OC-9001 da 999, só com item): com a chave ligada tudo sai igual ao que sai desligada', () => {
  for (const calc of [false, true]) {
    const cen = { D: obra999(), t: estado999({ calc_v2: calc }) };
    const off = instantaneo(api, cen), ligada = J(cen.t); ligada.par.oc_linhas = true;
    const on = instantaneo(api, { D: cen.D, t: ligada });
    assert.equal(on.alertas.length, off.alertas.length + 1, 'só o aviso fixo a mais'); assert.deepEqual(semAviso(on), off, 'calc_v2 ' + calc);
  }
  const S = abre(api, obra999(), estado999({ oc_linhas: true })); api.derive();
  const o1 = S.t.ocs.find(o => o.num === 'OC-9001');
  assert.deepEqual(J(api.linhasDe(o1)), [{ item: '1.1', nat: 'MAT', conta: '4.2.08', qtd: 1, valor: 3000 }], 'a OC antiga vira uma linha só, derivada na leitura');
  assert.equal(o1.linhas, undefined, 'nada é regravado no documento antigo');
  assert.equal(api.ocMulti(o1), false);
});

test('300 cenários aleatórios só com pedidos antigos: chave oc_linhas ligada = desligada (calc_v2 desligada e ligada)', () => {
  let comOC = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const cen = cenario(seed, seed % 5 === 0 ? { eventos: false, itemFora: false } : {});
    for (const calc of [false, true]) {
      cen.t.par.calc_v2 = calc; cen.t.par.oc_linhas = false; const off = instantaneo(api, cen);
      cen.t.par.oc_linhas = true; const on = instantaneo(api, cen);
      assert.deepEqual(semAviso(on), off, 'semente ' + seed + ' calc_v2 ' + calc);
    }
    if (cen.t.ocs.length) comOC++;
  }
  assert.ok(comOC > 200, 'os cenários têm pedidos (' + comOC + ')');
});

/* ============ (3) chave desligada: documento com linhas é lido como no ERP de partida ============ */
test('chave desligada: pedidos com linhas guardadas são lidos pelo item (primeira linha), igual ao ERP de partida, em 300 cenários', () => {
  let multi = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const cen = comLinhas(cenario(seed, seed % 5 === 0 ? { eventos: false } : {}), seed);
    multi += cen.t.ocs.filter(o => o.linhas).length;
    assert.deepEqual(instantaneo(api, cen), instantaneo(base, cen), 'semente ' + seed);
  }
  assert.ok(multi > 300, 'há muitos pedidos de várias linhas nos cenários (' + multi + ')');
});

/* ============ (4) comprometido e faturado por linha, em cenários aleatórios, contra uma conta escrita de novo aqui ============ */
function oraculo(S, v2) {
  const t = S.t, fatItem = {}, fatOC = {}, comp = {}, real = {};
  S.D.items.forEach(i => { comp[i.codigo] = 0; real[i.codigo] = 0; });
  t.notas.forEach(n => { if (n.status === 'lancada') return; n.rateio.forEach(l => { if (n.oc && real[l.item] !== undefined) { const k = n.oc + '|' + l.item; fatItem[k] = (fatItem[k] || 0) + +l.valor; fatOC[n.oc] = (fatOC[n.oc] || 0) + +l.valor; } if (real[l.item] !== undefined) real[l.item] += +l.valor; }); });
  const porOC = {};
  t.ocs.forEach(o => {
    if (!['aprovada', 'recebida_parcial', 'recebida'].includes(o.status)) return;
    const L = o.linhas || [{ item: o.item, valor: o.valor }];
    const ab = L.map(l => Math.min(l.valor, fatItem[o.id + '|' + l.item] || 0)), resto = L.map((l, k) => l.valor - ab[k]);
    const sobra = v2 ? Math.max(0, (fatOC[o.id] || 0) - ab.reduce((a, b) => a + b, 0)) : 0, somaResto = resto.reduce((a, b) => a + b, 0);
    L.forEach((l, k) => { const c = v2 ? Math.max(0, resto[k] - (somaResto > 0 ? Math.min(sobra, somaResto) * resto[k] / somaResto : 0)) : resto[k]; comp[l.item] += c; });
    porOC[o.id] = v2 ? Math.max(0, o.valor - (fatOC[o.id] || 0)) : resto.reduce((a, b) => a + b, 0);
  });
  return { comp, real, porOC };
}
for (const v2 of [false, true]) {
  test(`300 cenários com pedidos de várias linhas: comprometido por linha e por pedido batem com a conta independente (calc_v2 ${v2 ? 'ligada' : 'desligada'})`, () => {
    let linhasVistas = 0, comNota = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const cen = comLinhas(cenario(seed, seed % 5 === 0 ? { eventos: false, itemFora: false } : { itemFora: false }), seed);
      cen.t.par.oc_linhas = true; cen.t.par.calc_v2 = v2;
      const S = abre(api, cen.D, cen.t); api.derive();
      const o = oraculo(S, v2);
      /* com calc_v2 o que sobrou é repartido em centavos entre as linhas: até 1 centavo por linha de diferença da conta sem arredondar */
      const tol = v2 ? 0.0251 : 0.005, quase = (a, b, m) => assert.ok(Math.abs(a - b) < tol, `${m}: ${a} x ${b}`);
      for (const i of S.D.items) { quase(S.sd[i.codigo].comp, o.comp[i.codigo], `semente ${seed} · comprometido ${i.codigo}`); perto(S.sd[i.codigo].real, o.real[i.codigo], `semente ${seed} · realizado ${i.codigo}`); }
      const C = api.contaObra();
      for (const x of C.ocs) quase(x.comp, o.porOC[x.oc.id], `semente ${seed} · pedido ${x.oc.num}`);
      /* o total por pedido é a soma das linhas */
      for (const x of C.ocs) perto(x.comp, soma(C.lin.filter(l => l.oc.id === x.oc.id), l => l.comp), `semente ${seed} · pedido ${x.oc.num} = soma das linhas`);
      linhasVistas += S.t.ocs.filter(q => q.linhas && ['aprovada', 'recebida', 'recebida_parcial'].includes(q.status)).length;
      comNota += S.t.notas.filter(n => n.oc && n.status !== 'lancada' && (S.t.ocs.find(q => q.id === n.oc) || {}).linhas).length;
    }
    assert.ok(linhasVistas > 200, 'pedidos de várias linhas comprometidos (' + linhasVistas + ')');
    assert.ok(comNota > 100, 'notas ligadas a pedidos de várias linhas (' + comNota + ')');
  });
}

test('300 cenários com várias linhas: as 6 cópias do comprometido (05, 16, 29, 44 x2, 48) dão o mesmo número, chave ligada', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const cen = comLinhas(cenario(seed, { itemFora: false }), seed); cen.t.par.oc_linhas = true; cen.t.par.calc_v2 = seed % 2 === 0;
    const S = abre(api, cen.D, cen.t); api.derive();
    const c05 = soma(Object.values(S.sd), x => x.comp), plano = api.planoSaldos(), c16 = soma(Object.values(J(plano.comp)), v => v);
    const c29 = soma(J(api.painelLinhas('prov')), r => r.valor), split = J(api.provOcsSplit(S.t)), c48 = soma(J(api.provLinhas()).filter(r => r.origem === 'Pedido sem nota'), r => r.valor);
    for (const [rot, v] of [['16', c16], ['29', c29], ['44 provOcs', api.provOcs(S.t)], ['44 split', split.prod + split.serv], ['48', c48]]) perto(v, c05, `semente ${seed} · ${rot} x 05`);
  }
});

/* ============ (5) todos os leitores de item do pedido e da solicitação ============ */
test('leitores: telas e listas leem as linhas (Compras, Aprovações, Alertas, Hoje, Orçamento, Pacotes, Consulta de pedidos, Necessidades), sem erro, em 150 cenários', () => {
  for (let seed = 1; seed <= 150; seed++) {
    const cen = comLinhas(cenario(seed, { itemFora: false }), seed); cen.t.par.oc_linhas = true; cen.t.par.ev_agrega = true; cen.t.par.calc_v2 = seed % 2 === 0;
    cen.t.sols = cen.t.ocs.filter(o => o.linhas).map(o => ({ id: 's' + o.id, num: 'SC-' + o.num, item: o.item, desc: 'fictícia', qtd: 1, preco: o.valor, status: 'enviada', sem: 'verde', cots: [], solicitante: 'x', criado: '2030-01-01', linhas: o.linhas.map(l => ({ ...l, preco: l.valor })) }));
    const S = abre(api, cen.D, cen.t, 'gestao'); const X = api.derive(); S.X = X;
    for (const tab of ['sols', 'ocs', 'aprov']) { S.tab.compras = tab; const h = String(api.viewCompras(X)); if (tab === 'ocs' && S.t.ocs.some(o => o.linhas)) assert.match(h, /linhas · recebido como um pacote/); }
    api.alertas(X); api.viewHoje(X); api.viewEap(X); api.viewPac(X); api.viewEventos(X); api.viewNota(X);
    S.D.items.slice(0, 4).forEach(i => api.modalItem(i.codigo));
    const R = api.pedRowsT(); const multi = S.t.ocs.filter(o => o.linhas);
    multi.forEach(o => { const rs = J(R).filter(r => r.nrUnico === o.num); assert.equal(rs.length, o.linhas.length, 'uma linha de consulta por linha do pedido'); perto(soma(rs, r => r.vlrTotal), o.valor, 'o total da consulta fecha com o pedido ' + o.num); });
    api.necessidades();
  }
});

test('Consulta de pedidos: pedido recebido pela metade mostra a metade entregue em cada linha; cancelado não tem pendente', () => {
  const S = abre(api, obraFofo(), estFofo({ oc_linhas: true }), 'engenheiro'); api.derive();
  const sol = solicita(api, [{ item: '2.1', qtd: 10, pu: 600 }, { item: '2.2', qtd: 10, pu: 320 }]); const oc = emite(api, sol, 9200);
  S.role = 'gerente'; api.decidir(oc.id, true); S.role = 'almox'; api.el('#rc-q').value = '0.5'; api.doReceber(oc.id);
  let rs = J(api.pedRowsT()); assert.equal(rs.length, 2);
  assert.deepEqual(rs.map(r => [r.item, r.qtd, r.qtdEntregue, r.qtdPend, r.vlrTotal, r.pend]), [['2.1', 10, 5, 5, 6000, 'S'], ['2.2', 10, 5, 5, 3200, 'S']]);
  oc.status = 'cancelada'; rs = J(api.pedRowsT()); assert.deepEqual(rs.map(r => r.qtdPend), [0, 0]);
});

test('Necessidades: item que só aparece na segunda linha de um pedido já não é "necessidade"; com a chave desligada a segunda linha não existe para o ERP', () => {
  for (const lig of [true, false]) {
    const S = abre(api, obraFofo(), { ...estFofo({ oc_linhas: lig }), atvs: [{ id: 'a1', item: '2.2', status: 'planejada' }] }, 'engenheiro'); api.derive();
    const sol = solicita(api, [{ item: '2.1', qtd: 10, pu: 600 }, { item: '2.2', qtd: 10, pu: 320 }]);
    if (lig) { const oc = emite(api, sol, 9200); assert.ok(oc); }
    else assert.equal(sol.linhas, undefined, 'desligada: a solicitação é de uma linha só');
    api.derive();
    assert.equal(api.necessidades().some(x => x.i.codigo === '2.2'), !lig, 'chave ' + lig);
  }
});

test('Alertas: nota rateada fora do pedido de várias linhas só avisa para item que não está em nenhuma linha (calc_v2)', () => {
  const S = abre(api, obraFofo(), estFofo({ oc_linhas: true, calc_v2: true }), 'engenheiro'); api.derive();
  const sol = solicita(api, [{ item: '2.1', qtd: 10, pu: 600 }, { item: '2.2', qtd: 10, pu: 320 }]); const oc = emite(api, sol, 9200);
  S.role = 'gerente'; api.decidir(oc.id, true); S.role = 'adm';
  lancaNota(api, oc, 9200, [{ item: '2.1', valor: 6000 }, { item: '2.2', valor: 3200 }]); api.derive();
  assert.deepEqual(J(api.contaObra().avisos), [], 'rateio nas linhas do pedido não avisa');
  S.t.notas[0].rateio = [{ item: '2.1', valor: 6000 }, { item: '2.4', valor: 3200 }]; api.derive();
  const av = J(api.contaObra().avisos); assert.equal(av.length, 1); assert.deepEqual(av[0].itens, ['2.4']); assert.deepEqual(av[0].itensOC, ['2.1', '2.2']);
  assert.ok(api.alertas(api.S.X || api.derive()).some(a => /dos itens 2\.1, 2\.2/.test(a[2])), 'o alerta fala dos itens do pedido');
});

/* ============ (6) a tela: evento, pacote e saldo de cada item; formulário de linhas ============ */
test('Tela da solicitação: ao escolher o item aparecem evento, pacote e saldo; a chave desligada não tem o bloco de linhas', () => {
  for (const lig of [true, false]) {
    const S = abre(api, obraFofo(), estFofo({ oc_linhas: lig }), 'engenheiro'); api.derive();
    Object.keys(api.dom).forEach(k => { api.dom[k].innerHTML = ''; });
    api.modalSol('2.1');
    const todo = JSON.stringify(Object.values(api.dom).map(e => e.innerHTML));
    assert.ok(/Nova solicitação de compra/.test(todo), 'a janela abriu');
    assert.equal(/sol-add-lin/.test(todo) && /Outras linhas deste pedido/.test(todo), lig, 'bloco de linhas só com a chave ligada');
  }
  const S = abre(api, obraFofo(), estFofo({ oc_linhas: true }), 'engenheiro'); api.derive();
  const c = api.ctxItem('2.1');
  assert.match(c, /evento <b class="mono">2\.1\.1<\/b>/); assert.match(c, /pacote <b class="mono">HIDR<\/b> Hidráulica/); assert.match(c, /saldo livre do item <b class="">R\$\s*10\.000,00/);
  assert.match(api.ctxItem('2.3'), /evento <b class="mono">2\.1\.2<\/b>/);
});

test('Proposta do fornecedor num pedido de várias linhas: a soma das linhas é sempre exatamente o total proposto (centavos incluídos)', () => {
  const S = abre(api, obraFofo(), estFofo({ oc_linhas: true }), 'engenheiro'); api.derive();
  const sol = solicita(api, [{ item: '2.1', qtd: 3, pu: 100 }, { item: '2.2', qtd: 3, pu: 100 }, { item: '2.4', qtd: 3, pu: 100 }]);
  for (const total of [900, 899.99, 1000.01, 0.03, 333.34]) {
    const L = J(api.linhasDaProposta(sol, { preco: total }));
    perto(soma(L, l => l.valor), total, 'soma das linhas para ' + total); L.forEach(l => assert.ok(Math.abs(l.valor * 100 - Math.round(l.valor * 100)) < 1e-6, 'centavos inteiros'));
  }
  assert.deepEqual(J(api.linhasDaProposta(sol, { preco: 900 })).map(l => l.valor), [300, 300, 300]);
});

test('repartir: soma exata, ninguém passa do próprio peso, pesos zero repartem por igual', () => {
  for (let seed = 1; seed <= 500; seed++) {
    const n = 1 + (seed * 7) % 6, pesos = Array.from({ length: n }, (_, k) => ((seed * 31 + k * 17) % 97) + 1), W = soma(pesos, x => x);
    const tot = (seed * 13) % (W + 1), r = api.repartir(tot, pesos);
    assert.equal(soma(r, x => x), tot, 'soma exata'); r.forEach((x, k) => assert.ok(x <= pesos[k], 'não passa do peso'));
  }
  assert.deepEqual(J(api.repartir(10, [0, 0, 0])), [4, 3, 3]); assert.deepEqual(J(api.repartir(0, [5, 5])), [0, 0]);
});

/* ============ (7) o pedido de uma linha só, criado com a chave ligada, é igual ao de sempre mais o campo linhas ============ */
test('Pedido de uma linha criado com a chave ligada: mesmos campos de sempre (qtd, preço unitário, valor) e mais linhas; desligada não grava linhas', () => {
  const sai = lig => {
    const S = abre(api, obraFofo(), estFofo({ oc_linhas: lig }), 'engenheiro'); api.derive();
    const sol = solicita(api, [{ item: '2.1', qtd: 10, pu: 600 }]); const oc = emite(api, sol, 600);
    const c = x => { const y = J(x); delete y.id; delete y.sol; delete y.criado; delete y.num; delete y.oc; delete y.linhas; return y; };
    return { sol: c(sol), oc: c(oc), linhasSol: sol.linhas, linhasOC: oc.linhas };
  };
  const on = sai(true), off = sai(false);
  assert.deepEqual(on.sol, off.sol); assert.deepEqual(on.oc, off.oc);
  assert.equal(off.linhasSol, undefined); assert.equal(off.linhasOC, undefined);
  assert.deepEqual(J(on.linhasOC.map(l => [l.item, l.qtd, l.valor])), [['2.1', 10, 6000]]);
  assert.equal(on.oc.qtd, 10); assert.equal(on.oc.preco, 600);
});
