'use strict';
/* REVISÃO CÉTICA de M3 e M4 (branch feat/orcamento-m3-m4). Casos novos, escritos para quebrar o que o construtor entregou. Tudo fictício (OBRA 999 e cenários aleatórios).
   Nada de rede, banco, chave ou .env.
   1) Chaves desligadas: roteiros de várias ações em sequência (várias OCs no mesmo pacote e dia, nota parcial, nota fora do item, solicitante aprovando a própria, devolução,
      item sem evento, pacote sem teto) deixam estado, mensagens e telas IGUAIS ao ERP de partida (243d676).
   2) oc_linhas ligada com pedidos de uma linha só (os que a tela cria) = ERP de partida (fora o campo novo "linhas").
   3) Casos de M3 e M4 que a primeira prova não cobria. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { carrega, abre } = require('./ambiente');
const { rng, cenario } = require('./gerador');
const { instantaneo, limpa, tenta } = require('./instantaneo');
const { obra999, it, gr, oc, nf } = require('./obra999');
const { solicita, emite, lancaNota } = require('./acoes');

const base = carrega('base'), novo = carrega('trabalho');
const J = x => JSON.parse(JSON.stringify(x));
const perto = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.005, `${msg}: ${a} x ${b}`);
const hoje = () => novo.hojeISO();

/* ---------- ferramentas que servem aos dois ERPs (a de partida não tem SOLX nem linhas) ---------- */
function solicitaB(a, item, qtd, pu, ins = '') {
  a.el('#s-item').value = item; a.el('#s-nat').value = a.S.byCod[item].nat; a.el('#s-qtd').value = String(qtd); a.el('#s-pu').value = String(pu);
  a.el('#s-desc').value = 'Compra fictícia'; a.el('#s-dt').value = '2030-02-01'; a.el('#s-mot').value = 'teste'; a.el('#s-ins').value = ins;
  const antes = a.S.t.sols.length; a.doSol();
  return a.S.t.sols.length > antes ? a.S.t.sols[0] : null;
}
function lancaB(a, ocObj, valor, rateio, just = 'sem pedido de teste') {
  const antes = a.S.t.notas.length;
  a.modalNF(); a.el('#n-e').value = 'FORNECEDOR FICTÍCIO LTDA'; a.el('#n-c').value = 'NF-TESTE'; a.el('#n-v').value = String(valor); a.el('#n-d').value = '2030-02-10'; a.el('#n-o').value = ocObj ? ocObj.id : ''; a.el('#n-j').value = just;
  a.NF.oc = ocObj ? ocObj.id : ''; a.NF.valor = valor; a.NF.rateio = rateio; a.doNF('rateada');
  return a.S.t.notas.length > antes ? a.S.t.notas[0] : null;
}

/* obra com tudo que o pedido manda testar: item sem evento, pacote sem teto, pacote com teto, vários itens no mesmo pacote */
function obraRev() {
  const D = obra999();
  D.eap = [
    gr('1', 'G1'), it('1.1', 'A1 com evento', 'E1', 'PA', 3000000, 1000000, 1100000), it('1.2', 'A2 mesmo pacote', 'E2', 'PA', 3000000, 1000000, 1100000), it('1.3', 'A3 sem evento', null, 'PA', 3000000, 1000000, 1100000),
    gr('2', 'G2'), it('2.1', 'B1 pacote sem teto', 'E3', 'PB', 3000000, 1000000, null), it('2.2', 'B2 pacote sem teto', 'E3', 'PB', 3000000, 1000000, null),
    gr('3', 'G3'), it('3.1', 'C1 pequeno', 'E4', 'PC', 6000, 3000, 3300), it('3.2', 'C2 pequeno', 'E4', 'PC', 6000, 3000, 3300), it('3.3', 'D1 sem pacote', 'E5', null, 6000, 3000, 3300),
  ];
  D.pacotes = ['PA', 'PB', 'PC'].map(c => ({ codigo: c, nome: 'Pacote ' + c + ' (fictício)', meta: 1, teto: 1, fechar_ate: '2031-01-10', precisa_em_obra: '2031-02-01', responsavel: 'Engenheiro 999', condicao_pagamento: '30 dias', observacoes: '' }));
  return D;
}
const tRev = (par = {}) => ({ frozen: true, par: { tol: 0.02, limite: 100000, ...par }, inss: [{ cod: 'INS-T', desc: 'Insumo de teste', un: 'un' }] });

/* ---------- o que importa do estado depois de um roteiro (sem ids nem horas) ---------- */
function foto(S, semCamposNovos) {
  const t = J(S.t), tira = (L, ks) => L.map(x => { ks.forEach(k => delete x[k]); return x; });
  const novos = semCamposNovos ? ['linhas'] : []; if (semCamposNovos) delete t.par.oc_linhas;
  return limpa({
    sols: tira(t.sols, ['id', ...novos]), ocs: tira(t.ocs, ['id', 'sol', ...novos]), notas: tira(t.notas, ['id', 'oc']), titulos: tira(t.titulos, ['id', 'oc']),
    ests: tira(t.ests, ['id', 'oc']), aud: tira(t.aud, ['id', 'q']), par: t.par, hist: t.hist.map(h => ({ ...h, quando: undefined })),
  });
}

/* telas que leem pedido e solicitação: o texto tem de sair igual (espaço em branco não conta) */
/* ids de documento (o/s/n + Date.now() + sorteio) e espaço em branco não contam */
const comp = h => String(h == null ? '' : h).replace(/[osn]\d{10,}[a-z0-9]*/g, '#id').replace(/\s+/g, ' ').replace(/> </g, '><').trim();
function telas(a, S) {
  const X = a.derive(), out = {};
  S.tab.compras = 'sols'; out.sols = comp(a.viewCompras(X)); S.tab.compras = 'ocs'; out.ocs = comp(a.viewCompras(X)); S.tab.compras = 'aprov'; out.aprov = comp(a.viewCompras(X));
  S.tab.nota = 'notas'; out.notas = comp(a.viewNota(X)); S.tab.nota = 'sem'; out.sem = comp(a.viewNota(X));
  out.hoje = comp(a.viewHoje(X)); out.alertas = limpa(a.alertas(X)); out.economia = limpa(X.economia); out.pendencias = comp(a.dashPend(X));
  out.ped = limpa(tenta(() => a.pedRowsT())); out.nec = limpa(tenta(() => a.necessidades().map(x => [x.i.codigo, x.livre])));
  out.itens = S.D.items.map(i => { a.modalItem(i.codigo); return comp(a.el('#mbox').innerHTML); });
  out.receber = S.t.ocs.filter(o => ['aprovada', 'recebida_parcial'].includes(o.status)).map(o => { a.modalReceber(o.id); return comp(a.el('#mbox').innerHTML); });
  out.mapa = S.t.sols.filter(s => ['enviada', 'em_cotacao'].includes(s.status)).map(s => { a.modalMapa(s.id); return comp(a.el('#mbox').innerHTML); });
  a.modalSol(S.D.items[0].codigo); out.modalSol = comp(a.el('#mbox').innerHTML);
  return limpa(out);
}


/* compara as telas chave a chave e, se uma difere, mostra o trecho em volta da primeira diferença (o assert padrão corta o texto) */
function igualTelas(novoT, partidaT, rot) {
  const ks = new Set([...Object.keys(novoT), ...Object.keys(partidaT)]);
  for (const k of ks) {
    const a = novoT[k], b = partidaT[k];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if (typeof a === 'string' && typeof b === 'string') {
      let i = 0; while (i < a.length && a[i] === b[i]) i++;
      assert.fail(`${rot}: tela "${k}" difere na posição ${i}
  novo:    ...${a.slice(Math.max(0, i - 120), i + 200)}
  partida: ...${b.slice(Math.max(0, i - 120), i + 200)}`);
    }
    assert.deepEqual(a, b, `${rot}: "${k}"`);
  }
}

/* um roteiro: a mesma ordem para os dois ERPs (tudo sorteado só pela semente). O que cada passo faz depende só do estado, que tem de ser igual nos dois. */
function roteiro(a, D, t0, seed, passos = 16) {
  const S = abre(a, D, { ...J(t0), frozen: true }, 'engenheiro'); a.derive(); a.limpaMsgs();
  const R = rng(seed * 977 + 5), pick = l => l[Math.floor(R() * l.length)];
  const itens = S.D.items.filter(i => i.meta_total != null).map(i => i.codigo), usadas = { compra: 0, decide: 0, recebe: 0, nota: 0, notaSP: 0, conf: 0, lib: 0, pag: 0, dev: 0, propria: 0 };
  for (let p = 0; p < passos; p++) {
    a.derive(); const quer = pick(['compra', 'compra', 'compra', 'decide', 'decide', 'propria', 'recebe', 'recebe', 'recebe', 'nota', 'nota', 'nota', 'notaSP', 'conf', 'conf', 'lib', 'pag', 'dev', 'dev']);
    const ocs = S.t.ocs, notas = S.t.notas;
    if (quer === 'compra') {
      S.role = pick(['engenheiro', 'gerente']); const cod = pick(itens), i = S.byCod[cod], qtd = pick([1, 2, 5]), fator = pick([0.05, 0.3, 0.6, 0.95, 1.05, 1.4]);
      const pu = Math.round(i.meta_total * fator / qtd * 100) / 100 || 1, ins = R() < 0.5 ? 'INS-T' : '';
      const sol = solicitaB(a, cod, qtd, pu, ins); if (!sol) continue;
      S.role = 'compras'; emite(a, sol, pick([[pu], [pu, pu * 1.05, pu * 1.1]])); usadas.compra++;
    } else if (quer === 'decide' || quer === 'propria') {
      const o = ocs.find(x => x.status === 'em_alcada'); if (!o) continue;
      /* "propria": quem decide é a mesma pessoa que solicitou (o papel e o nome do solicitante) */
      S.role = quer === 'propria' ? pick(['gerente', 'engenheiro']) : pick(['gerente', 'diretoria', 'engenheiro']);
      if (quer === 'propria') { o.solicitante = a.ROLES[S.role].u; usadas.propria++; }
      const ok = R() < 0.7; a.decidir(o.id, ok);
      if (!ok && a.can_aprovar(o)) { a.el('#ask-v').value = 'motivo de teste'; a.clicar('ask-ok'); }
      usadas.decide++;
    } else if (quer === 'recebe') {
      const o = ocs.find(x => ['aprovada', 'recebida_parcial'].includes(x.status)); if (!o) continue;
      S.role = 'almox'; a.el('#rc-q').value = String(Math.round((o.qtd - (o.recebido || 0)) * pick([0.5, 1]) * 1e6) / 1e6); a.doReceber(o.id); usadas.recebe++;
    } else if (quer === 'nota') {
      const o = ocs.find(x => ['aprovada', 'recebida_parcial', 'recebida'].includes(x.status) && notas.filter(n => n.oc === x.id).length < 2); if (!o) continue;
      S.role = 'adm'; const v = Math.round(o.valor * pick([1, 0.4, 0.5]) * 100) / 100, outro = pick(itens), v1 = Math.round(v * 0.3 * 100) / 100;
      const rateio = pick([[{ item: o.item, valor: v }], [{ item: outro, valor: v }], [{ item: o.item, valor: v1 }, { item: outro, valor: Math.round((v - v1) * 100) / 100 }]]);
      lancaB(a, o, v, rateio); usadas.nota++;
    } else if (quer === 'notaSP') {
      S.role = 'adm'; const v = pick([50, 5000, 150000, 300000]); lancaB(a, null, v, [{ item: pick(itens), valor: v }]); usadas.notaSP++;
    } else if (quer === 'conf') {
      const n = notas.find(x => x.status === 'rateada' || x.status === 'divergente'); if (!n) continue; S.role = 'financeiro'; a.conferir(n.id); usadas.conf++;
    } else if (quer === 'lib') {
      const n = notas.find(x => x.status === 'conferida'); if (!n) continue; S.role = 'financeiro'; a.liberar(n.id); usadas.lib++;
    } else if (quer === 'pag') {
      const n = notas.find(x => x.status === 'liberada'); if (!n) continue; S.role = 'financeiro'; a.pagar(n.id); usadas.pag++;
    } else if (quer === 'dev') {
      const o = ocs.find(x => x.ins && ['recebida', 'recebida_parcial'].includes(x.status) && (x.recebido || 0) > (x.devolvido || 0)); if (!o) continue;
      S.role = 'almox'; a.el('#dv-q').value = String(Math.round(((o.recebido || 0) - (o.devolvido || 0)) * pick([0.5, 1]) * 1e6) / 1e6); a.el('#dv-m').value = 'avaria de teste'; a.ACOES['oc-dev-ok']({ dataset: { id: o.id } }); usadas.dev++;
    }
  }
  S.role = 'gestao'; a.derive();
  return { S, usadas };
}

/* ============ 1) chaves desligadas: roteiros longos, com várias OCs no mesmo pacote e dia ============ */
for (const par of [{}, { oc_linhas: false, ev_ctrl: false, calc_v2: false, ev_agrega: false }]) {
  test(`100 roteiros de 16 ações (várias OCs no mesmo pacote e dia, nota parcial, nota fora do item, solicitante aprovando a própria, devolução): chaves desligadas ${Object.keys(par).length ? '(escritas como false)' : '(ausentes)'} = ERP de partida, estado, mensagens e telas`, () => {
    const tot = { compra: 0, decide: 0, recebe: 0, nota: 0, notaSP: 0, conf: 0, lib: 0, pag: 0, dev: 0, propria: 0 }; let multiOC = 0, aprovadas = 0, reprov = 0, devol = 0, proprias = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const D = obraRev(), t = tRev(par);
      const A = roteiro(base, D, t, seed), B = roteiro(novo, D, t, seed);
      assert.deepEqual(B.S.t.sols.length, A.S.t.sols.length, 'semente ' + seed);
      assert.deepEqual(novo.msgs(), base.msgs(), 'mensagens da semente ' + seed);
      assert.deepEqual(foto(B.S), foto(A.S), 'estado final da semente ' + seed);
      igualTelas(telas(novo, B.S), telas(base, A.S), 'semente ' + seed);
      assert.deepEqual(instantaneo(novo, { D, t: J(B.S.t) }), instantaneo(base, { D, t: J(A.S.t) }), 'fotografia dos números da semente ' + seed);
      Object.keys(tot).forEach(k => { tot[k] += B.usadas[k]; });
      if (A.S.t.ocs.length > 1) multiOC++; A.S.t.ocs.forEach(o => { if (['aprovada', 'recebida', 'recebida_parcial'].includes(o.status)) aprovadas++; if (o.status === 'reprovada') reprov++; if (o.devolvido) devol++; });
      proprias += A.usadas.propria;
    }
    assert.ok(multiOC > 60 && aprovadas > 80 && reprov > 5 && devol > 3 && proprias > 20 && tot.nota > 60 && tot.notaSP > 40 && tot.conf > 20 && tot.lib > 5, `o roteiro exercita o caminho (várias OCs ${multiOC}, aprovadas ${aprovadas}, reprovadas ${reprov}, devoluções ${devol}, própria ${proprias}, notas ${tot.nota}, sem pedido ${tot.notaSP}, conferidas ${tot.conf})`);
  });
}

/* ============ 2) oc_linhas ligada, mas só pedidos de uma linha (o que a tela cria): o resto é como o ERP de partida ============ */
test('oc_linhas ligada com pedidos de uma linha só: números, mensagens e telas iguais ao ERP de partida (fora o campo novo "linhas" e o aviso fixo do banco)', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const D = obraRev(), A = roteiro(base, D, tRev(), seed), B = roteiro(novo, D, tRev({ oc_linhas: true }), seed);
    assert.deepEqual(novo.msgs(), base.msgs(), 'mensagens da semente ' + seed);
    assert.deepEqual(foto(B.S, true), foto(A.S), 'estado final da semente ' + seed);
    const ta = telas(base, A.S), tb = telas(novo, B.S);
    ['alertas'].forEach(k => { tb[k] = tb[k].filter(x => !/Compra de várias linhas ligada/.test(x[1])); });
    ['ocs', 'sols'].forEach(k => { assert.deepEqual(tb[k], ta[k], `tela ${k} da semente ${seed}`); });
    assert.deepEqual(tb.alertas, ta.alertas); assert.deepEqual(tb.economia, ta.economia); assert.deepEqual(tb.hoje, ta.hoje); assert.deepEqual(tb.ped, ta.ped); assert.deepEqual(tb.nec, ta.nec);
    assert.deepEqual(tb.notas, ta.notas); assert.deepEqual(tb.itens, ta.itens);
    B.S.t.sols.concat(B.S.t.ocs).forEach(d => { if (d.linhas) assert.equal(d.linhas.length, 1, 'pedido de uma linha só guarda uma linha'); });
  }
});

/* ============ 3) casos que a primeira prova não cobria ============ */
test('item sem evento e item sem pacote: com ev_ctrl a cor vem do item e do nível que o item tem; sem evento não vira "evento vazio" nem derruba a compra', () => {
  abre(novo, obraRev(), tRev({ ev_ctrl: true }), 'engenheiro'); novo.derive();
  const r = J(novo.semaforoLinhas([{ item: '1.3', valor: 100 }]));   /* 1.3 não tem evento */
  assert.equal(r[0], 'verde'); assert.deepEqual(r[3].map(n => n.nivel), ['item', 'pacote'], 'só item e pacote: sem evento não há terceiro nível');
  const r2 = J(novo.semaforoLinhas([{ item: '3.3', valor: 100 }]));   /* 3.3 não tem pacote */
  assert.equal(r2[0], 'verde'); assert.deepEqual(r2[3].map(n => n.nivel), ['item', 'evento'], 'só item e evento');
  /* e o pacote que tem o item sem evento continua somando o item sem evento */
  abre(novo, obraRev(), { ...tRev({ ev_ctrl: true }), ocs: [oc('OC-9001', '1.3', 1900000)] }, 'engenheiro'); novo.derive();
  const r3 = J(novo.semaforoLinhas([{ item: '1.1', valor: 300000 }]));   /* PA: 3 itens, meta 3.000.000, já 1.900.000 em 1.3 */
  assert.equal(r3[3].find(n => n.nivel === 'pacote').cor, 'verde'); perto(r3[3].find(n => n.nivel === 'pacote').gasto, 1900000, 'gasto do pacote inclui o item sem evento');
});

test('pacote sem teto em nenhum item: nunca fica vermelho pelo pacote; passa da meta = amarelo; desligada igual', () => {
  for (const ec of [false, true]) {
    abre(novo, obraRev(), tRev({ ev_ctrl: ec }), 'engenheiro'); novo.derive();
    const r = J(novo.semaforoLinhas([{ item: '2.1', valor: 1500000 }, { item: '2.2', valor: 1000000 }]));   /* PB: meta 2.000.000, nenhum teto */
    assert.equal(r[0], 'amarelo', 'sem teto não existe vermelho'); if (ec) assert.equal(r[3].find(n => n.nivel === 'pacote').cor, 'amarelo');
  }
});

test('OC antiga só com item, chave oc_linhas ligada e desligada: comprometido, notas e saldos idênticos; nota parcial e nota fora do item', () => {
  const mk = par => { const o1 = oc('OC-9001', '3.1', 2000), n1 = nf('NF-9001', o1, 800, [['3.1', 800]]), o2 = oc('OC-9002', '3.2', 2000), n2 = nf('NF-9002', o2, 1500, [['3.1', 1500]]);
    return { ...tRev(par), ocs: [o2, o1], notas: [n2, n1] }; };
  for (const v2 of [false, true]) {
    const a = abre(novo, obraRev(), mk({ calc_v2: v2 }), 'gestao'); novo.derive(); const off = limpa(J(a.sd));
    abre(novo, obraRev(), mk({ calc_v2: v2, oc_linhas: true }), 'gestao'); novo.derive(); assert.deepEqual(limpa(J(novo.S.sd)), off, 'oc_linhas não muda número de pedido antigo (calc_v2 ' + v2 + ')');
    abre(novo, obraRev(), mk({ calc_v2: v2, oc_linhas: true, ev_ctrl: true }), 'gestao'); novo.derive();
    Object.keys(off).forEach(c => { perto(novo.S.sd[c].comp, off[c].comp, 'comp ' + c); perto(novo.S.sd[c].real, off[c].real, 'real ' + c); });
  }
  /* nota parcial: pedido de 2.000, nota de 800 no mesmo item: sobra 1.200 comprometido */
  abre(novo, obraRev(), mk({}), 'gestao'); novo.derive(); perto(novo.S.sd['3.1'].comp, 1200, 'comprometido do 3.1 (pedido 2.000 menos nota parcial 800)'); perto(novo.S.sd['3.2'].comp, 2000, '3.2: a nota foi para o 3.1 e, sem calc_v2, o pedido do 3.2 fica inteiro (dupla contagem de sempre)');
  abre(novo, obraRev(), mk({ calc_v2: true }), 'gestao'); novo.derive(); perto(novo.S.sd['3.2'].comp, 500, '3.2 com calc_v2: o pedido é abatido pela nota inteira (1.500)');
});

/* ============ todas as chaves ligadas: nenhuma tela quebra, em pedidos de várias linhas, notas aguardando alçada e itens fora do orçamento ============ */
test('com as quatro chaves ligadas, 200 cenários (pedidos de várias linhas, notas aguardando alçada, item fora do orçamento): nenhuma tela lança erro e o reservado fecha', () => {
  const { comLinhas } = require('./gerador');
  let multi = 0, pendNotas = 0, emAlcada = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const cen = comLinhas(cenario(seed, seed % 6 === 0 ? { eventos: false } : {}), seed); const t = cen.t;
    Object.assign(t.par, { oc_linhas: true, ev_ctrl: true, calc_v2: seed % 2 === 0, ev_agrega: true }); t.frozen = true;
    t.notas.forEach((n, k) => { if (!n.oc && n.status !== 'lancada' && k % 2 === 0) Object.assign(n, { sem: 'amarelo', alcada: 'gerente', aprov: 'pendente', solicitante: 'Fulano', solicitanteId: 'papel:adm', rateadaEm: hoje() }); });
    t.ocs.forEach(o => { if (o.status === 'em_alcada') { o.sem = 'verde'; o.criado = hoje(); o.solicitanteId = 'papel:engenheiro'; } });
    const S = abre(novo, cen.D, t, ['gestao', 'gerente', 'diretoria', 'adm'][seed % 4]);
    let X; try { X = novo.derive(); } catch (e) { assert.fail(`semente ${seed}: derive quebrou: ${e.message}`); }
    try {
      const tel = telas(novo, S); assert.ok(tel.sols.length > 100);
      S.view = 'evt'; novo.viewEventos(X);
      S.D.items.slice(0, 5).forEach(i => { novo.ctxItem(i.codigo); novo.semaforoLinhas([{ item: i.codigo, valor: 1000 }, { item: S.D.items[(S.D.items.length - 1)].codigo, valor: 500 }]); });
      S.t.ocs.filter(o => o.status === 'em_alcada').forEach(o => { S.role = 'gerente'; novo.can_aprovar(o); novo.recalculaDoc && novo.recalculaDoc(o); });
    } catch (e) { assert.fail(`semente ${seed}: tela quebrou: ${e.stack.split('\n').slice(0, 3).join(' | ')}`); }
    multi += S.t.ocs.filter(o => o.linhas && o.linhas.length > 1).length; pendNotas += X.pendNotas.length; emAlcada += X.pendAprov.length;
    const res = Object.values(S.sd).reduce((s, x) => s + (x.res || 0), 0), pend = S.t.ocs.filter(o => o.status === 'em_alcada').reduce((s, o) => s + o.valor, 0);
    perto(res, pend, `semente ${seed}: reservado = soma dos pedidos aguardando`);
  }
  assert.ok(multi > 100 && pendNotas > 50 && emAlcada > 100, `o cenário exercita o caminho (várias linhas ${multi}, notas aguardando ${pendNotas}, pedidos aguardando ${emAlcada})`);
});

/* ============ contraste dos textos que a tela Eventos usa mas não são dela (.sub, .mut, cabeçalho de tabela, abas, etiquetas) ============
   A prova do construtor olhava só o texto das classes .ev-*. A tela também usa .sub, .mut, .tbl th, .tabs button e .pill.ok/.warn/.bad/.info, que vêm do resto do ERP.
   Dentro do Centro de Gestão (paletas Claro, Masterclass e Grotesk) o cinza terciário (--ink-3) e o verde das etiquetas ficavam abaixo de 4,5:1 (medido no navegador). */
const fs = require('node:fs'), path = require('node:path');
const { RAIZ } = require('./ambiente');
const cssTxt = fs.readFileSync(path.join(RAIZ, 'fonte', 'erp', 'style.css'), 'utf8');
const blocoCss = sel => { const i = cssTxt.indexOf(sel + '{'); assert.ok(i >= 0, 'sem o bloco ' + sel); return cssTxt.slice(i + sel.length + 1, cssTxt.indexOf('}', i)); };
const varsCss = txt => { const o = {}; for (const m of txt.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+)/g)) o[m[1]] = m[2].trim(); return o; };
const rgbaCss = c => { let m; c = c.trim();
  if ((m = c.match(/^#([0-9a-f]{6})$/i))) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16), 1];
  if ((m = c.match(/^rgba?\(([^)]+)\)/))) { const p = m[1].split(',').map(parseFloat); return [p[0], p[1], p[2], p[3] == null ? 1 : p[3]]; }
  throw new Error('cor que o teste não sabe ler: ' + c); };
const sobre = (f, b) => f.slice(0, 3).map((x, k) => Math.round(x * f[3] + b[k] * (1 - f[3])));
const lumC = ([r, g, b]) => { const f = x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const razao = (a, b) => { const [x, y] = [lumC(a), lumC(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
{
  const base0 = varsCss(blocoCss(':root')), esc0 = { ...base0, ...varsCss(blocoCss(':root[data-theme="dark"]')) };
  const embC = { ...base0, ...varsCss(blocoCss('html:root.emb')) }, embE = { ...embC, ...varsCss(blocoCss('html:root.emb[data-theme="dark"]')) };
  /* fundos que o Centro põe por baixo: o painel e a página (valores de public/index.html, os mesmos de capa_temas.html) */
  const PAL = {
    'claro (ERP)': [base0, ['#ffffff', '#f8f8f9', '#f3f3f4']], 'escuro (ERP)': [esc0, ['#25262b', '#2c2d33', '#1c1d21']],
    'Centro Claro': [embC, ['#FFFFFF', embC['panel-2'], '#F6F7FA']], 'Centro Masterclass': [embE, ['#0B0B19', embE['panel-2'], '#060610']], 'Centro Grotesk': [embC, ['#FAF8F3', embC['panel-2'], '#F4F1EA']],
  };
  test('texto de apoio (--ink-3: .sub, .mut, cabeçalho de tabela, abas) e etiquetas (.pill ok/warn/bad/info) da tela Eventos: AA (4,5:1) sobre painel, painel-2 e fundo da página, nas 5 paletas', () => {
    const falhas = [];
    for (const [nome, [v, fundos]] of Object.entries(PAL)) {
      for (const f of fundos) {
        const fundo = rgbaCss(f).slice(0, 3), r3 = razao(rgbaCss(v['ink-3']).slice(0, 3), fundo);
        if (r3 < 4.5) falhas.push(`${nome}: --ink-3 ${v['ink-3']} sobre ${f}: ${r3.toFixed(2)}`);
        for (const c of ['ok', 'warn', 'bad', 'info']) {
          const bg = sobre(rgbaCss(v[c + '-bg']), fundo), cor = v[c + '-ink'] || v[c], rc = razao(rgbaCss(cor).slice(0, 3), bg);
          if (rc < 4.5) falhas.push(`${nome}: etiqueta ${c} (${cor}) sobre ${f}: ${rc.toFixed(2)}`);
        }
      }
    }
    assert.deepEqual(falhas, []);
  });
}

/* ============ toda regra nova que ninguém decidiu carrega [SUPOSIÇÃO] ou [PROVISÓRIO] no código ============ */
test('regras escolhidas pelo construtor (decisão na aprovação, nota reprovada, nota aguardando alçada, rateio proporcional, nota sem meta, consulta de pedido) têm [SUPOSIÇÃO] perto delas; a chave ev_ctrl avisa que só vale no navegador', () => {
  const js = f => fs.readFileSync(path.join(RAIZ, 'fonte', 'erp', 'js', f), 'utf8');
  const marca = /\[(SUPOSIÇÃO|PROVISÓRIO)/;
  const CASOS = [
    ['12_compras.js', 'function recalculaDoc', 'a aprovação não acontece quando a alçada sobe'], ['12_compras.js', 'function notaDecideFim', 'destino da nota reprovada'],
    ['13_notas.js', 'function rateioDoPedido', 'divisão proporcional da nota menor'], ['13_notas.js', 'Bloqueado (item sem meta ou fora da planilha)', 'nota com item sem meta não grava'],
    ['13_notas.js', "antes de conferir')", 'nota aguardando alçada não confere nem libera'], ['49_compras_consulta.js', 'a parte entregue de cada linha', 'fração entregue por linha'],
  ];
  const sem = [];
  for (const [f, ancora, rotulo] of CASOS) {
    const t = js(f), i = t.indexOf(ancora); assert.ok(i >= 0, 'não achei ' + ancora);
    if (!marca.test(t.slice(Math.max(0, i - 1500), i + 700))) sem.push(`${f}: ${rotulo}`);
  }
  assert.deepEqual(sem, [], 'regra sem marca');
  const d = String(novo.CHAVES_OBRA.find(c => c.k === 'ev_ctrl').d);
  assert.match(d, /só no navegador/); assert.match(d, /subempreiteiro/); assert.match(d, /Ligue junto com/); assert.match(d, /não fica salvo no banco/);
});

/* ============ PENDÊNCIAS que dependem de decisão (mostradas como "todo": aparecem na saída, não derrubam a suíte) ============ */
test('PENDENTE P1: pacote com um item SEM teto e outro com teto: o limite do pacote é a soma dos tetos que existem, e a compra pequena já nasce vermelha ("meta acima do limite")', { todo: 'decisão do Felipe: item com meta e sem teto não deveria inventar limite de grupo (M2 já somava assim; M4 passa a barrar a compra)' }, () => {
  const D = obra999();
  D.eap = [gr('1', 'g'), it('1.1', 'A (com teto)', 'E1', 'PA', 2000, 1000, 1100), it('1.2', 'B (meta, sem teto)', 'E1', 'PA', 2000, 1000, null)];
  D.pacotes = [{ codigo: 'PA', nome: 'PA', meta: 2000, teto: 2200, fechar_ate: '2031-01-10', precisa_em_obra: '2031-02-01', responsavel: 'x', condicao_pagamento: '30', observacoes: '' }];
  abre(novo, D, tRev({ ev_ctrl: true }), 'engenheiro'); novo.derive();
  assert.equal(novo.semaforoLinhas([{ item: '1.1', valor: 100 }])[0], 'verde', 'compra de R$ 100 no item A, que está folgado, não devia ficar vermelha por causa do item B sem teto');
});

test('PENDENTE P2: duas notas sem pedido verdes de R$ 90.000 no mesmo pacote e dia não somam para a alçada (D2 fala só de OC); duas OCs iguais somam', () => {
  const sai = (ehNota) => {
    abre(novo, obraRev(), tRev({ ev_ctrl: true }), 'adm'); novo.derive(); const r = [];
    for (let k = 0; k < 2; k++) {
      if (ehNota) { const n = lancaB(novo, null, 90000, [{ item: '1.' + (k + 1), valor: 90000 }]); r.push(n.alcada || 'sem alçada'); }
      else { S0(); const o = emite(novo, solicitaB(novo, '1.' + (k + 1), 1, 90000), 90000); r.push(o.alcada || 'sem alçada'); }
      novo.derive();
    }
    return r;
  };
  const S0 = () => { novo.S.role = 'engenheiro'; };
  assert.deepEqual(sai(false), ['sem alçada', 'gerente'], 'OCs: a segunda soma 180.000 no pacote');
  assert.deepEqual(sai(true), ['sem alçada', 'sem alçada'], 'notas sem pedido: hoje não somam (fica registrado para decisão)');
});

/* ============ pendências da Gestão: nota sem pedido aguardando alçada também aparece (só com ev_ctrl) ============ */
test('Gestão > pendências: com ev_ctrl a nota sem pedido aguardando alçada entra na lista; sem a chave a lista é a de sempre', () => {
  const S = abre(novo, obraRev(), tRev({ ev_ctrl: true }), 'adm'); novo.derive();
  assert.ok(lancaB(novo, null, 1200000, [{ item: '1.1', valor: 1200000 }]).aprov === 'pendente');
  assert.match(comp(novo.dashPend(novo.derive())), /Notas sem pedido aguardando alçada/);
  const S2 = abre(novo, obraRev(), tRev({}), 'adm'); novo.derive(); lancaB(novo, null, 1200000, [{ item: '1.1', valor: 1200000 }]);
  assert.doesNotMatch(comp(novo.dashPend(novo.derive())), /aguardando alçada/);
});

/* ============ paridade: o semáforo e a alçada da nota sem pedido são os mesmos da OC (mesmas linhas, mesmo estado) ============ */
test('nota sem pedido e OC com as mesmas linhas, no mesmo estado, saem com a mesma cor e a mesma alçada (200 cenários, uma a três linhas)', () => {
  const { cenario: cen0 } = require('./gerador');
  let comparados = 0; const cores = new Set(), alc = new Set();
  for (let seed = 1; seed <= 200; seed++) {
    const cen = cen0(seed, seed % 6 === 0 ? { eventos: false, itemFora: false } : { itemFora: false }); cen.t.frozen = true;
    Object.assign(cen.t.par, { oc_linhas: true, ev_ctrl: true, limite: [300, 5000, 100000][seed % 3], calc_v2: seed % 2 === 0 });
    cen.t.ocs.forEach(o => { if (o.status === 'em_alcada') { o.solicitanteId = 'papel:engenheiro'; o.criado = hoje(); o.sem = 'verde'; } });
    const R = rng(seed * 13 + 3), pick = l => l[Math.floor(R() * l.length)];
    const ate = abre(novo, cen.D, J(cen.t), 'engenheiro'); novo.derive();
    const itens = ate.D.items.filter(i => i.meta_total != null).map(i => i.codigo); if (itens.length < 3) continue;
    const L = Array.from({ length: pick([1, 2, 3]) }, () => { const i = ate.byCod[pick(itens)]; return { item: i.codigo, valor: Math.round(i.meta_total * pick([0.05, 0.4, 0.9, 1.2]) * 100) / 100 }; });
    const total = Math.round(L.reduce((s, l) => s + l.valor, 0) * 100) / 100; if (!(total > 0)) continue;
    /* como OC */
    const a = abre(novo, cen.D, J(cen.t), 'engenheiro'); novo.derive();
    const sol = solicita(novo, L.map(l => ({ item: l.item, qtd: 1, pu: l.valor })), 'Pedido fictício'); if (!sol) continue;
    novo.S.role = 'compras'; const o = emite(novo, sol, sol.linhas && sol.linhas.length > 1 ? total : sol.preco); if (!o) continue;
    /* como nota sem pedido */
    abre(novo, cen.D, J(cen.t), 'adm'); novo.derive();
    const n = lancaNota(novo, null, total, L.map(l => ({ ...l })));
    if (!n) continue;
    assert.equal(n.sem, o.sem, `semente ${seed}: cor da nota ${n.sem} x da OC ${o.sem}`);
    assert.equal(n.alcada || null, o.alcada || null, `semente ${seed}: alçada da nota ${n.alcada} x da OC ${o.alcada}`);
    comparados++; cores.add(o.sem); alc.add(o.alcada || 'nenhuma');
  }
  assert.ok(comparados > 120 && cores.size === 3 && alc.size >= 2, `paridade exercitada (comparados ${comparados}, cores ${[...cores]}, alçadas ${[...alc]})`);
});

/* ============ linhas extras da solicitação em tela de celular ============ */
test('linha extra da solicitação: a grade vem do CSS (e vira duas colunas abaixo de 620 px); não há mais grade fixa de 5 colunas escrita na linha (o preço unitário ficava com 32 px em 390 px)', () => {
  const js = fs.readFileSync(path.join(RAIZ, 'fonte', 'erp', 'js', '12_compras.js'), 'utf8');
  assert.match(js, /<div class="sol-lin">/); assert.doesNotMatch(js, /grid-template-columns:2fr 1\.4fr/);
  assert.match(cssTxt, /\.sol-lin\{display:grid;grid-template-columns:2fr 1\.4fr \.7fr \.8fr auto/);
  assert.match(cssTxt, /@media \(max-width:620px\)\{\.sol-lin\{grid-template-columns:1fr 1fr\}/);
  abre(novo, obraRev(), tRev({ oc_linhas: true }), 'engenheiro'); novo.derive(); novo.modalSol('1.1'); novo.SOLX.push({ item: '1.2', nat: 'MAT', qtd: '', pu: '' }); novo.pintaSolX();
  assert.match(String(novo.el('#s-lin').innerHTML), /class="sol-lin"/);
});

/* ============ P3: o servidor não deixa Gerente nem Diretoria gravar nota (achado lendo 01_erp.sql) ============ */
const papeisQueGravam = tipo => { const sql = fs.readFileSync(path.join(RAIZ, 'fonte', 'erp', 'sql', '01_erp.sql'), 'utf8'); const i = sql.indexOf("when '" + tipo + "'"); assert.ok(i >= 0, 'não achei o tipo ' + tipo + ' na matriz'); const m = sql.slice(i).match(/any\(array\[([^\]]*)\]\)/); assert.ok(m, 'não achei a lista de papéis de ' + tipo); return [...m[1].matchAll(/'(\w+)'/g)].map(x => x[1]); };
test('a matriz de papéis do servidor deixa o Gerente e a Diretoria gravar OC (aprovação de pedido funciona em obra real), mas NÃO nota (aprovação de nota sem pedido não fica salva)', () => {
  const oc = papeisQueGravam('oc'), nf = papeisQueGravam('nf');
  assert.ok(oc.includes('gerente') && oc.includes('diretoria'), 'OC: Gerente e Diretoria gravam');
  assert.deepEqual(nf.sort(), ['adm', 'engenheiro', 'financeiro'], 'nota: hoje só estes três gravam (se isto mudar, tirar o aviso AVISO_SQL_CTRL e o P3)');
});
test('PENDENTE P3: Gerente e Diretoria precisam poder gravar a decisão sobre a nota sem pedido (SQL parado por E2: LEIA-ME-M4-SQL-PENDENTE.md)', { todo: 'precisa de ok separado do Felipe para mexer no banco' }, () => {
  const nf = papeisQueGravam('nf'); assert.ok(nf.includes('gerente') && nf.includes('diretoria'));
});
test('com ev_ctrl o ERP avisa do banco: alerta fixo e faixa na aba Aprovações (só quando há nota aguardando); sem a chave nada disso aparece', () => {
  for (const ec of [false, true]) {
    const S = abre(novo, obraRev(), tRev({ ev_ctrl: ec }), 'adm'); novo.derive(); const n = lancaB(novo, null, 1200000, [{ item: '1.1', valor: 1200000 }]); assert.ok(n);
    const X = novo.derive(); S.tab.compras = 'aprov'; S.role = 'gerente'; const h = String(novo.viewCompras(X));
    assert.equal(novo.alertas(X).some(a => /aprovar nota sem pedido ainda não grava no banco/.test(a[1])), ec);
    assert.equal(/não deixa Gerente nem Diretoria gravar nota/.test(h), ec);
  }
  const S2 = abre(novo, obraRev(), tRev({ ev_ctrl: true }), 'gerente'); novo.derive(); S2.tab.compras = 'aprov'; assert.doesNotMatch(String(novo.viewCompras(novo.derive())), /não deixa Gerente nem Diretoria gravar nota/, 'sem nota aguardando não há faixa');
});

/* ============ pedido de duas linhas com números à mão: nota parcial nas linhas e nota fora das linhas ============ */
test('pedido de 2 linhas (A 600 + B 400): nota parcial nas linhas abate cada linha; nota fora das linhas só deixa de contar em dobro com calc_v2 (e avisa)', () => {
  const mk = (par, nota) => { const o = oc('OC-9001', '3.1', 1000, 'aprovada', { linhas: [{ item: '3.1', nat: 'MAT', conta: '4.2.08', qtd: 1, valor: 600 }, { item: '3.2', nat: 'MAT', conta: '4.2.08', qtd: 1, valor: 400 }], qtd: 1, preco: 1000 });
    return { ...tRev({ oc_linhas: true, ...par }), ocs: [o], notas: nota ? [nf('NF-9001', o, nota.valor, nota.rateio)] : [] }; };
  const sd = (par, nota) => { abre(novo, obraRev(), mk(par, nota), 'gestao'); novo.derive(); return J(novo.S.sd); };
  /* sem nota: cada linha no seu item */
  let s = sd({}, null); perto(s['3.1'].comp, 600, 'A'); perto(s['3.2'].comp, 400, 'B');
  /* nota parcial de 500 rateada 300 em A e 200 em B (a divisão que a tela sugere): sobram 300 e 200, com ou sem calc_v2 */
  for (const v2 of [false, true]) { s = sd({ calc_v2: v2 }, { valor: 500, rateio: [['3.1', 300], ['3.2', 200]] }); perto(s['3.1'].comp, 300, 'A calc_v2 ' + v2); perto(s['3.2'].comp, 200, 'B calc_v2 ' + v2); perto(s['3.1'].real + s['3.2'].real, 500, 'realizado ' + v2); }
  /* nota de 500 rateada 100% fora das linhas (item 1.1): sem calc_v2 conta em dobro (1.000 + 500); com calc_v2 o pedido é abatido na proporção das linhas (300 e 200) */
  s = sd({}, { valor: 500, rateio: [['1.1', 500]] }); perto(s['3.1'].comp + s['3.2'].comp, 1000, 'dupla contagem de sempre, sem calc_v2'); perto(s['1.1'].real, 500, 'realizado no item de fora');
  s = sd({ calc_v2: true }, { valor: 500, rateio: [['1.1', 500]] }); perto(s['3.1'].comp, 300, 'A'); perto(s['3.2'].comp, 200, 'B'); perto(s['3.1'].comp + s['3.2'].comp + s['1.1'].real, 1000, 'nada conta duas vezes');
  abre(novo, obraRev(), mk({ calc_v2: true }, { valor: 500, rateio: [['1.1', 500]] }), 'gestao'); novo.derive();
  const av = novo.contaObra().avisos; assert.equal(av.length, 1); assert.deepEqual(J(av[0].itensOC), ['3.1', '3.2']); assert.deepEqual(J(av[0].itens), ['1.1']);
});
