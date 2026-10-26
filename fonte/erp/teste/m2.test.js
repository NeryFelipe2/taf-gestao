'use strict';
/* M2: meta, limite, comprometido, realizado e saldo por evento e por pacote (só leitura), atrás da chave par.ev_agrega (padrão desligada). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { carrega, abre } = require('./ambiente');
const { cenario } = require('./gerador');
const { obra999, estado999, EV_REF_999 } = require('./obra999');

const api = carrega('trabalho');
const J = x => JSON.parse(JSON.stringify(x));   /* tira o prototype de outro contexto do vm */
const perto = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.005, `${msg}: ${a} x ${b}`);
const K = ['venda', 'meta', 'teto', 'comp', 'real', 'livre'];

/* comprometido e realizado por item, escritos de novo aqui (sem usar contaObra), para conferir a soma por grupo */
function oraculo(S) {
  const t = S.t, v2 = !!(t.par && t.par.calc_v2), real = {}, fatItem = {}, fatOC = {}, r = {};
  S.D.items.forEach(i => { r[i.codigo] = { comp: 0, real: 0 }; });
  t.notas.forEach(n => { if (n.status === 'lancada') return; n.rateio.forEach(l => { if (r[l.item]) r[l.item].real += +l.valor; if (n.oc) { fatItem[n.oc + '|' + l.item] = (fatItem[n.oc + '|' + l.item] || 0) + +l.valor; fatOC[n.oc] = (fatOC[n.oc] || 0) + +l.valor; } }); });
  t.ocs.forEach(o => { if (['aprovada', 'recebida_parcial', 'recebida'].includes(o.status) && r[o.item]) r[o.item].comp += Math.max(0, o.valor - (v2 ? fatOC[o.id] || 0 : fatItem[o.id + '|' + o.item] || 0)); });
  return r;
}
function esperado(S, chaveDe) {
  const o = oraculo(S), G = {};
  S.D.items.forEach(i => {
    const k = chaveDe(i), g = G[k] || (G[k] = { n: 0, venda: 0, meta: 0, teto: 0, comp: 0, real: 0, livre: 0, itens: [] });
    g.n++; g.itens.push(i.codigo); g.venda += i.preco_venda_total || 0; g.meta += i.meta_total || 0; g.teto += i.teto_total || 0; g.comp += o[i.codigo].comp; g.real += o[i.codigo].real;
    g.livre += Math.round((i.meta_total - o[i.codigo].comp - o[i.codigo].real) * 100) / 100;
  });
  return G;
}
const evKey = i => String(i.evento == null ? '' : i.evento).trim();
const pacKey = i => String(i.pacote == null ? '' : i.pacote).trim();

/* ---------- (c) a soma dos itens de cada evento e de cada pacote é o grupo; sem evento aparece; tudo fecha com a obra ---------- */
for (const v2 of [false, true]) {
  test(`(c) 300 cenários aleatórios: soma dos itens = evento = pacote; "Sem evento" aparece; fecha com a obra (calc_v2 ${v2 ? 'ligada' : 'desligada'})`, () => {
    let comSemEvento = 0, comCruzamento = 0, modoGrupo = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const cen = cenario(seed, seed % 6 === 0 ? { eventos: false, itemFora: false } : { itemFora: false });
      cen.t.par.ev_agrega = true; cen.t.par.calc_v2 = v2;
      const S = abre(api, cen.D, cen.t); const X = api.derive();
      const E = J(api.agregaEventos()), P = J(api.agregaPacotes());
      assert.ok(E.confere.ok && P.confere.ok, `semente ${seed}: a soma dos grupos não fecha com a obra`);
      const raiz = i => { let g = i; while (g.pai && S.byCod[g.pai]) g = S.byCod[g.pai]; return g === i ? String(i.codigo).split('.')[0] : g.codigo; };
      const modo = S.D.items.every(i => !evKey(i)) ? 'grupo' : 'evento';
      assert.equal(E.modo, modo);
      for (const [R, chaveDe, nome] of [[E, modo === 'grupo' ? raiz : evKey, 'evento'], [P, pacKey, 'pacote']]) {
        const esp = esperado(S, chaveDe);
        assert.deepEqual(R.grupos.map(g => g.chave).sort(), Object.keys(esp).sort(), `semente ${seed} · ${nome}: mesmos grupos`);
        R.grupos.forEach(g => { K.forEach(k => perto(g[k], esp[g.chave][k], `semente ${seed} · ${nome} ${g.chave || '(vazio)'} · ${k}`)); assert.equal(g.n, esp[g.chave].n); assert.deepEqual([...g.itens].sort(), [...esp[g.chave].itens].sort()); });
        K.forEach(k => perto(R.grupos.reduce((s, g) => s + g[k], 0), R.total[k], `semente ${seed} · soma dos ${nome}s x total · ${k}`));
      }
      /* total do grupo = total da obra que o resto do ERP mostra */
      perto(E.total.meta, X.meta, 'meta da obra'); perto(E.total.comp, X.comp, 'comprometido da obra'); perto(E.total.real, X.real, 'realizado da obra'); perto(E.total.venda, X.venda, 'receita da obra'); perto(E.total.teto, X.teto, 'teto da obra');
      /* X.eventos / X.pacGrupos entram no derive() com a chave ligada */
      assert.ok(X.eventos && X.pacGrupos);
      if (E.grupos.some(g => g.chave === '' && g.n > 0)) comSemEvento++;
      if (modo === 'grupo') modoGrupo++;
      if (P.grupos.some(p => p.outras.length > 1) && E.grupos.some(e => e.outras.length > 1)) comCruzamento++;
    }
    assert.ok(comSemEvento > 100, 'cenários com item sem evento: ' + comSemEvento);
    assert.ok(comCruzamento > 100, 'cenários com pacote cruzando eventos: ' + comCruzamento);
    assert.ok(modoGrupo > 30, 'cenários de obra sem evento (por grupo): ' + modoGrupo);
  });
}

test('(c) obra 999: 4 eventos + "Sem evento", 3 pacotes cruzando eventos, números conferidos à mão (calc_v2 desligada)', () => {
  const S = abre(api, obra999(), estado999({ ev_agrega: true })); const X = api.derive();
  const E = J(api.agregaEventos()), P = J(api.agregaPacotes()), ev = c => E.grupos.find(g => g.chave === c), pc = c => P.grupos.find(g => g.chave === c);
  assert.deepEqual(E.grupos.map(g => g.chave), ['1.1.1', '2.1.1', '4.1.1', '4.1.2', '']);
  assert.deepEqual(P.grupos.map(g => g.chave), ['CANT', 'ELET', 'HIDR']);
  /* 1.1.1 = itens 1.1 + 1.2: OC-9001 (3.000 no 1.1, aprovada) comprometida; NF-9003 (700 no 1.2) realizada */
  assert.deepEqual([ev('1.1.1').n, ev('1.1.1').venda, ev('1.1.1').meta, ev('1.1.1').teto, ev('1.1.1').comp, ev('1.1.1').real, ev('1.1.1').livre], [2, 20000, 15000, 16500, 3000, 700, 11300]);
  /* 2.1.1 = 2.1 + 2.2: OC-9002 8.000 no 2.1 abatida por NF-9002 5.000 (resta 3.000); NF-9001 3.000 rateada no 2.2 */
  assert.deepEqual([ev('2.1.1').comp, ev('2.1.1').real, ev('2.1.1').livre], [3000, 8000, 41000 - 3000 - 8000]);
  assert.deepEqual([ev('4.1.1').n, ev('4.1.1').meta, ev('4.1.1').teto, ev('4.1.1').venda], [3, 17000, 7000 + 5500 + 4400, 26000]);
  assert.deepEqual([ev('').n, ev('').meta, ev('').chave], [1, 2000, '']);
  /* pacotes cruzam eventos */
  assert.deepEqual(pc('HIDR').outras, ['2.1.1', '4.1.1']); assert.deepEqual(pc('ELET').outras, ['4.1.1', '4.1.2', '']); assert.deepEqual(pc('CANT').outras, ['1.1.1']);
  assert.deepEqual(ev('4.1.1').outras, ['ELET', 'HIDR']);
  /* ELET: meta 18.000 e limite 17.000 (soma dos tetos): "sem folga"; o cadastro do pacote diz teto 20.000 */
  assert.deepEqual([pc('ELET').meta, pc('ELET').teto, pc('ELET').cadastro.teto], [18000, 17000, 20000]);
  assert.ok(E.confere.ok && P.confere.ok);
});

test('(c) calc_v2 muda o evento onde a nota caiu: comprometido sai do evento do pedido e não conta duas vezes', () => {
  const off = (abre(api, obra999(), estado999({ ev_agrega: true })), api.derive(), J(api.agregaEventos()));
  const on = (abre(api, obra999(), estado999({ ev_agrega: true, calc_v2: true })), api.derive(), J(api.agregaEventos()));
  const g = (R, c) => R.grupos.find(x => x.chave === c);
  perto(g(off, '1.1.1').comp, 3000, 'desligada: 3.000 comprometidos em 1.1.1'); perto(g(on, '1.1.1').comp, 0, 'ligada: o pedido foi abatido pela nota inteira');
  perto(g(on, '2.1.1').real, g(off, '2.1.1').real, 'o realizado fica onde a nota caiu');
  const tot = R => R.total.comp + R.total.real; perto(tot(off) - tot(on), 3000, 'a diferença é a dupla contagem de 3.000');
});

/* ---------- semáforo do grupo ---------- */
test('semáforo do grupo: verde dentro da meta, amarelo acima da meta até o limite, vermelho acima do limite, sem base nunca vira verde', () => {
  const g = o => ({ n: 3, venda: 0, meta: 1000, teto: 1100, temTeto: true, comp: 0, real: 0, livre: 1000, semMeta: 0, ...o });
  const s = o => api.semGrupo(g(o))[0];
  assert.equal(s({}), 'verde'); assert.equal(s({ comp: 600, real: 400 }), 'verde', 'no limite da meta ainda é verde');
  assert.equal(s({ comp: 600, real: 401 }), 'amarelo'); assert.equal(s({ comp: 1000, real: 100 }), 'amarelo', 'no teto ainda é amarelo');
  assert.equal(s({ comp: 1000, real: 101 }), 'vermelho'); assert.equal(s({ n: 3, semMeta: 3, meta: 0 }), 'sem_base'); assert.equal(s({ n: 0 }), 'sem_base');
  assert.equal(s({ temTeto: false, comp: 5000 }), 'amarelo', 'sem teto cadastrado não há vermelho');
});
/* ---------- a diferença de 4.1.1 e 4.1.2 aparece ---------- */
test('4.1.1 e 4.1.2: a diferença contra o eventograma oficial aparece na tela, com sinais opostos (obra 999 fictícia)', () => {
  const S = abre(api, obra999(), estado999({ ev_agrega: true, evRef: EV_REF_999 })); const X = api.derive();
  const E = J(api.agregaEventos()), g = c => E.grupos.find(x => x.chave === c);
  assert.equal(E.temRef, true);
  perto(g('4.1.1').dif, 1000, '4.1.1: o ERP soma 26.000, o oficial tem 25.000'); perto(g('4.1.2').dif, -1000, '4.1.2: o ERP soma 5.000, o oficial tem 6.000');
  perto(g('1.1.1').dif, 0, '1.1.1 bate'); perto(g('2.1.1').dif, 0, '2.1.1 bate');
  S.tab.evtv = 'tabela';   /* as linhas da tabela só existem na vista "Ver como tabela" (a padrão é a de cartões) */
  const h = api.viewEventos(X);
  assert.match(h, /Eventograma oficial/); assert.match(h, /Diferença/);
  const lin = c => h.split('<tr').find(l => l.includes(`data-k="${c}"`));
  assert.match(lin('4.1.1'), /<b>\+R\$\s1\.000,00<\/b>/); assert.match(lin('4.1.2'), /<b>-R\$\s1\.000,00<\/b>/);
  assert.doesNotMatch(lin('1.1.1'), /<b>[+-]R\$/);
  assert.doesNotMatch(h, /na 342/, 'o exemplo da 342 não aparece em outra obra (revisão B7)');
});
test('4.1.1 e 4.1.2: sem o eventograma oficial carregado a tela diz que a diferença existe e por que ainda não aparece', () => {
  abre(api, obra999(), estado999({ ev_agrega: true })); const X = api.derive(); const h = api.viewEventos(X);
  assert.doesNotMatch(h, /<th class="r">Diferença<\/th>/); assert.match(h, /dividido entre dois eventos/); assert.doesNotMatch(h, /na 342/);
});
test('evento só do eventograma oficial (sem item no ERP) aparece com a diferença inteira', () => {
  abre(api, obra999(), estado999({ ev_agrega: true, evRef: { ...EV_REF_999, '9.9.9': 500 } })); api.derive();
  const g = J(api.agregaEventos()).grupos.find(x => x.chave === '9.9.9'); assert.ok(g); assert.equal(g.n, 0); perto(g.dif, -500, 'diferença'); assert.equal(g.sem[0], 'sem_base');
});

/* ---------- obra sem evento (como a 343): grupo no lugar do evento ---------- */
test('obra sem evento: usa o grupo da EAP, nada some, fecha com a obra', () => {
  const D = obra999(); D.eap.forEach(e => { e.evento = null; });
  const S = abre(api, D, estado999({ ev_agrega: true })); const X = api.derive(); const E = J(api.agregaEventos());
  assert.equal(E.modo, 'grupo'); assert.deepEqual(E.grupos.map(g => g.chave), ['1', '2', '3']); assert.ok(E.confere.ok);
  assert.equal(E.grupos.find(g => g.chave === '2').nome, 'ESTAÇÃO ELEVATÓRIA (fictícia)');
  const h = api.viewEventos(X); assert.match(h, /Grupo da EAP/); assert.match(h, /não tem evento no orçamento/); assert.doesNotMatch(h, /Sem evento/);
});

/* ---------- pacote pela soma dos itens ---------- */
test('pacote: o teto e o alerta olham a soma dos itens só com a chave ligada', () => {
  const desl = (abre(api, obra999(), estado999()), api.derive());
  const alD = J(api.alertas(desl)).filter(a => /Pacote ELET/.test(a[1]));
  assert.deepEqual(alD, [], 'desligada: valor fixo do cadastro (meta 18.000 < teto 20.000), sem alerta');
  const pD = api.S.D.pacotes.find(p => p.codigo === 'ELET'); assert.equal(pD._acima, false); perto(api.pacTeto(pD), 20000, 'teto mostrado = cadastro');
  const lig = (abre(api, obra999(), estado999({ ev_agrega: true })), api.derive());
  const alL = J(api.alertas(lig)).filter(a => /Pacote ELET: meta acima do teto/.test(a[1]));
  assert.equal(alL.length, 1); assert.match(alL[0][2], /Meta R\$\s18\.000,00 × teto R\$\s17\.000,00/);
  const pL = api.S.D.pacotes.find(p => p.codigo === 'ELET'); assert.equal(pL._acima, true); perto(api.pacTeto(pL), 17000, 'teto mostrado = soma dos itens'); perto(api.pacMeta(pL), 18000, 'meta mostrada = soma dos itens');
  const pv = api.viewPac(lig); assert.match(pv, /R\$\s17\.000,00/);
});

/* ---------- aba ---------- */
test('aba Eventos: some com a chave desligada; ligada fica ao lado de Orçamento e Pacotes', () => {
  abre(api, obra999(), estado999()); api.derive();
  const tabs = () => J(api.areasVisiveis()).find(a => a.k === 'obra').tabs.map(t => t[0]);
  assert.ok(!tabs().includes('evt'));
  api.S.t.par.ev_agrega = true;
  assert.deepEqual(tabs().slice(0, 3), ['eap', 'pac', 'evt']);
  assert.ok(J(api.NAV_BASE).some(n => n[0] === 'evt'));
  for (const papel of ['gestao', 'diretoria', 'gerente', 'engenheiro', 'compras', 'planejamento']) { api.S.role = papel; assert.ok(tabs().includes('evt'), papel + ' vê Eventos'); }
  for (const papel of ['encarregado', 'almox']) { api.S.role = papel; assert.ok(!tabs().includes('evt'), papel + ' não vê Eventos (como não vê Orçamento/Pacotes completos)'); }
});

test('tela com a chave desligada explica como ligar e não calcula nada', () => {
  abre(api, obra999(), estado999()); const X = api.derive();
  assert.equal(X.eventos, undefined); const h = api.viewEventos(X);
  assert.match(h, /desligada nesta obra/); assert.doesNotMatch(h, /<table/);
});

/* ---------- só leitura ---------- */
test('só leitura: abrir a tela, trocar de aba e abrir o detalhe não grava nada no estado da obra', () => {
  const S = abre(api, obra999(), estado999({ ev_agrega: true, evRef: EV_REF_999 }), 'gerente'); const X = api.derive();
  const antes = JSON.stringify(S.t);
  api.viewEventos(X); S.tab.evt = 'pacote'; api.viewEventos(X);
  for (const [m, k] of [['evento', '4.1.1'], ['evento', ''], ['pacote', ''], ['pacote', 'HIDR']]) api.ACOES['ev-det']({ dataset: { m, k } });
  assert.equal(JSON.stringify(S.t), antes, 'estado da obra igual antes e depois');
  assert.match(api.el('#mbox').innerHTML, /Pacote HIDR/);
});

test('detalhe do evento lista os itens e o texto do usuário não vira HTML', () => {
  const D = obra999(); D.eap.find(e => e.codigo === '1.1').evento = '<img src=x onerror=alert(1)>';
  const S = abre(api, D, estado999({ ev_agrega: true })); const X = api.derive();
  const h = api.viewEventos(X); assert.doesNotMatch(h, /<img/); assert.match(h, /&lt;img/);
  api.ACOES['ev-det']({ dataset: { m: 'evento', k: '1.2' } });
  api.ACOES['ev-det']({ dataset: { m: 'evento', k: '2.1.1' } });
  const m = api.el('#mbox').innerHTML; assert.match(m, /data-item="2\.1"/); assert.match(m, /data-item="2\.2"/); assert.doesNotMatch(m, /data-item="1\.1"/);
});
