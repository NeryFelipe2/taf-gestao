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

/* ============ M2 do revisor: o semáforo do grupo ficava verde onde o resto da tela mostra "meta acima do teto" ============ */
const linhaDe = (h, k, m) => h.split('<tr').find(l => l.includes(`data-k="${k}"`) && (!m || l.includes(`data-m="${m}"`)));
test('M2: pacote e evento com meta somada acima do limite (teto) saem vermelhos no Eventos, como em Pacotes, Alertas e Hoje', () => {
  const S = abre(novo, obra999(), estado999({ ev_agrega: true })); const X = novo.derive();
  const P = J(novo.agregaPacotes()), E = J(novo.agregaEventos()), sem = (R, c) => R.grupos.find(g => g.chave === c).sem;
  /* ELET: meta 18.000, teto somado 17.000 (a tela de Pacotes pinta o teto de vermelho e o alerta diz "meta acima do teto") */
  assert.equal(S.D.pacotes.find(p => p.codigo === 'ELET')._acima, true);
  assert.equal(sem(P, 'ELET')[0], 'vermelho'); assert.match(sem(P, 'ELET')[1], /Meta acima do limite/);
  assert.equal(sem(E, '4.1.1')[0], 'vermelho', 'evento 4.1.1: meta 17.000, limite 16.900'); assert.equal(sem(E, '')[0], 'vermelho', 'Sem evento: meta 2.000, limite 1.500');
  assert.equal(sem(P, 'HIDR')[0], 'verde'); assert.equal(sem(P, 'CANT')[0], 'verde'); assert.equal(sem(E, '1.1.1')[0], 'verde');
  S.tab.evt = 'pacote'; S.tab.evtv = 'tabela'; const h = novo.viewEventos(X);   /* linhas da tabela: vista "Ver como tabela" */
  assert.match(linhaDe(h, 'ELET', 'pacote'), /pill bad" title="Meta acima do limite/); assert.match(linhaDe(h, 'HIDR', 'pacote'), /pill ok"/);
  assert.match(h, /meta já acima do limite/, 'a tela explica a regra');
});
test('M2: ordem das regras do semáforo do grupo (acima do limite, meta acima do limite, acima da meta, dentro)', () => {
  const g = o => ({ n: 3, venda: 0, meta: 1000, teto: 1100, temTeto: true, comp: 0, real: 0, livre: 1000, semMeta: 0, ...o }), s = o => novo.semGrupo(g(o));
  assert.equal(s({})[0], 'verde'); assert.equal(s({ teto: 1000 })[0], 'verde', 'meta igual ao limite ainda é folga zero, não excesso');
  assert.equal(s({ teto: 999.99 })[0], 'vermelho'); assert.match(s({ teto: 900 })[1], /Meta acima do limite/);
  assert.match(s({ teto: 900, comp: 950 })[1], /Comprometido \+ realizado acima do limite/, 'gasto acima do limite continua a primeira razão');
  assert.equal(s({ teto: 0, temTeto: false })[0], 'verde', 'sem teto em nenhum item não há o que comparar'); assert.equal(s({ semMeta: 3 })[0], 'sem_base');
});
test('M2: em 300 cenários, todo pacote que Pacotes marca "meta acima do teto" (pela soma) sai vermelho no Eventos', () => {
  let marcados = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const cen = cenario(seed); cen.t.par.ev_agrega = true;
    const S = abre(novo, cen.D, cen.t); novo.derive(); const P = J(novo.agregaPacotes());
    S.D.pacotes.filter(p => p._acima && p._temTeto && p._temMeta && p._it.length).forEach(p => { marcados++; assert.equal(P.grupos.find(g => g.chave === p.codigo).sem[0], 'vermelho', `semente ${seed}, pacote ${p.codigo}`); });
  }
  assert.ok(marcados > 50, 'cenários exercitam pacote acima do teto (' + marcados + ')');
});

/* ============ B1 do revisor: pacote cujos itens não têm teto mostrava teto R$ 0 e folga negativa ============ */
const semTetoNoElet = D => { D.eap.filter(e => e.pacote === 'ELET').forEach(e => { e.teto_total = null; }); return D; };
test('B1: itens do pacote sem teto: com a chave ligada o pacote mostra o teto do cadastro, como desligada', () => {
  const folga = h => (h.match(/folga de <b>([^<]*)<\/b>/) || [])[1];
  const desl = (abre(novo, semTetoNoElet(obra999()), estado999()), novo.derive()), pD = novo.S.D.pacotes.find(p => p.codigo === 'ELET'), hD = novo.viewPac(desl), tD = novo.pacTeto(pD), fD = folga(hD);
  const lig = (abre(novo, semTetoNoElet(obra999()), estado999({ ev_agrega: true })), novo.derive()), pL = novo.S.D.pacotes.find(p => p.codigo === 'ELET'), hL = novo.viewPac(lig);
  perto(tD, 20000, 'desligada: teto do cadastro'); perto(novo.pacTeto(pL), 20000, 'ligada: sem teto nos itens vale o cadastro, não R$ 0');
  assert.equal(folga(hL), fD, 'o texto de folga é o mesmo');
  assert.equal(pL._acima, false);
  const linha = hL.split('<tr').find(l => l.includes('data-pac="ELET"')); assert.match(linha, /R\$\s18\.000,00<\/td><td class="r ">R\$\s20\.000,00/, 'colunas Meta e Teto da linha do pacote');
  /* o Eventos continua mostrando "—" (nenhum item tem limite) e avisa o valor do cadastro */
  const X = novo.S.X = novo.derive(); novo.S.tab.evt = 'pacote'; novo.S.tab.evtv = 'tabela'; const he = novo.viewEventos(X); assert.match(linhaDe(he, 'ELET', 'pacote'), /cadastro do pacote: R\$\s20\.000,00/);
});
test('B1: sem meta em nenhum item do pacote vale o cadastro (meta e teto), igual desligada; com meta e teto nos itens vale a soma', () => {
  const D = obra999(); D.eap.filter(e => e.pacote === 'ELET').forEach(e => { e.meta_total = null; });
  const S = abre(novo, D, estado999({ ev_agrega: true })); novo.derive(); const p = S.D.pacotes.find(x => x.codigo === 'ELET');
  perto(novo.pacMeta(p), 18000, 'meta do cadastro'); perto(novo.pacTeto(p), 20000, 'teto do cadastro (não mistura com a soma dos tetos dos itens)');
  assert.equal(p._acima, false, 'cadastro: meta 18.000 < teto 20.000, como na chave desligada');
  const q = S.D.pacotes.find(x => x.codigo === 'HIDR'); perto(novo.pacMeta(q), 45000, 'meta somada'); perto(novo.pacTeto(q), 49500, 'teto somado');
  const e = S.D.pacotes.find(x => x.codigo === 'CANT'); assert.equal(e._acima, false);
});

/* ============ B2 do revisor: o Eventos agrupava o código do pacote com trim e a tela de Pacotes não ============ */
test('B2: item com código de pacote "CANT " (espaço no fim): Eventos e Pacotes contam igual e o item solto aparece como "não cadastrado"', () => {
  const D = obra999(); D.eap.find(e => e.codigo === '1.1').pacote = 'CANT ';
  const S = abre(novo, D, estado999({ ev_agrega: true })); const X = novo.derive();
  const P = J(novo.agregaPacotes()), canto = P.grupos.find(g => g.chave === 'CANT'), solto = P.grupos.find(g => g.chave === 'CANT ');
  assert.equal(canto.n, S.D.pacotes.find(p => p.codigo === 'CANT')._it.length, 'mesma contagem da tela de Pacotes'); assert.equal(canto.n, 1);
  assert.ok(solto && solto.n === 1 && solto.semCadastro === true, 'o item de "CANT " não some nem é juntado em silêncio'); assert.equal(canto.semCadastro, false);
  assert.ok(P.confere.ok, 'continua fechando com a obra');
  S.tab.evt = 'pacote'; S.tab.evtv = 'tabela'; const h = novo.viewEventos(X); assert.match(linhaDe(h, 'CANT ', 'pacote'), /pacote não cadastrado/); assert.match(linhaDe(h, 'CANT ', 'pacote'), /“CANT ”/);
  assert.doesNotMatch(linhaDe(h, 'CANT', 'pacote'), /não cadastrado/);
});
test('B2: pacote só com espaços vira "Sem pacote"; pacote que não está no cadastro é avisado', () => {
  const D = obra999(); D.eap.find(e => e.codigo === '1.1').pacote = '   '; D.eap.find(e => e.codigo === '1.2').pacote = 'FANTASMA';
  abre(novo, D, estado999({ ev_agrega: true })); novo.derive(); const P = J(novo.agregaPacotes());
  assert.ok(P.grupos.find(g => g.chave === '' && g.itens.includes('1.1')), 'só espaços fica em Sem pacote');
  const f = P.grupos.find(g => g.chave === 'FANTASMA'); assert.ok(f && f.semCadastro);
  assert.equal(novo.pacDe({ pacote: ' ELET' }), ' ELET', 'não corta mais o código'); assert.equal(novo.pacDe({ pacote: null }), '');
});

/* ============ B3 do revisor: dois lugares ainda usavam o valor fixo do cadastro do pacote com a chave ligada ============ */
function vencida(par) {   /* pacote ELET vencido e sem pedido; cadastro 25.000 contra 18.000 somados dos itens */
  const D = obra999(); D.pacotes.find(p => p.codigo === 'ELET').meta = 25000; D.pacotes.find(p => p.codigo === 'ELET').fechar_ate = '2020-01-01';
  const t = estado999(par); t.ocs = []; t.notas = [];   /* sem pedido nenhum: vencido de verdade */
  return abre(novo, D, t);
}
test('B3: alerta de pacote vencido e restrição automática usam a meta que a tela mostra (chave ligada); desligada fica como sempre', () => {
  for (const [par, esperado] of [[{}, 25000], [{ ev_agrega: true }, 18000]]) {
    vencida(par); const X = novo.derive();
    const al = J(novo.alertas(X)).find(a => /Pacote ELET: fechar até/.test(a[1]));
    assert.match(al[2], esperado === 25000 ? /R\$ 25 mil de meta/ : /R\$ 18 mil de meta/);
    perto(novo.restAuto(X).find(r => r.id === 'auto-ELET').valor, esperado, 'valor da restrição automática');
  }
});
test('B3: chaves desligadas, pacotes vencidos: alertas e restrições automáticas iguais às do ERP de partida (300 cenários)', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const cen = cenario(seed); cen.D.pacotes.forEach((p, i) => { if ((seed + i) % 2) p.fechar_ate = '2020-0' + (i + 1) + '-10'; });
    const f = api => { abre(api, cen.D, cen.t); const X = api.derive(); return limpa({ al: api.alertas(X), ra: api.restAuto(X), v: X.vencidos.map(p => p.codigo) }); };
    assert.deepEqual(f(novo), f(base), 'semente ' + seed);
  }
});

/* ============ M3 do revisor: nada na tela avisava que o banco não acompanha calc_v2 ============ */
test('M3: com calc_v2 ligada o aviso aparece nos Alertas, em Eventos e na janela de Parâmetros; desligada não aparece nos Alertas nem em Eventos', () => {
  const sql = /banco ainda não acompanha/;
  for (const ligada of [false, true]) {
    const S = abre(novo, obra999(), estado999({ ev_agrega: true, calc_v2: ligada })); const X = novo.derive();
    const al = J(novo.alertas(X)).filter(a => /Cálculo novo ligado/.test(a[1]));
    assert.equal(al.length, ligada ? 1 : 0, 'alerta fixo só com a chave ligada'); if (ligada) { assert.equal(al[0][0], 'warn'); assert.match(al[0][2], sql); assert.match(al[0][2], /Da tarefa à compra e ao BM/); }
    const h = novo.viewEventos(X); assert.equal(sql.test(h), ligada, 'aviso na tela Eventos só com a chave ligada');
    assert.equal(novo.avisoSqlCalc() !== '', ligada);
  }
  /* a janela de Parâmetros explica antes de ligar */
  abre(novo, obra999(), estado999()); novo.modalParams(); assert.match(novo.el('#mbox').innerHTML, /o banco \(tela “Da tarefa à compra e ao BM”, Ciclo e Marko\) ainda não acompanha esta chave/);
  /* a tela "Da tarefa à compra e ao BM" (só existe com a chave do site, não dá para abrir aqui) chama o aviso */
  assert.match(String(novo.viewRastro), /avisoSqlCalc\(\)/);
});
test('M3: sem calc_v2 os Alertas e Eventos ficam iguais ao que eram (só ev_agrega)', () => {
  abre(novo, obra999(), estado999({ ev_agrega: true })); const X = novo.derive();
  assert.ok(!J(novo.alertas(X)).some(a => /banco ainda/.test(a[1] + a[2]))); assert.doesNotMatch(novo.viewEventos(X), /<span class="pill warn">atenção<\/span>/);
});

/* ============ B6 do revisor: cópias do cálculo que ficaram fora de contaObra (só refatoração: nada pode mudar) ============ */
test('B6: realizado por conta (DRE do Faturamento) e listas de status de pedido: iguais ao ERP de partida em 300 cenários, chaves desligadas', () => {
  const NAO = new Set(); let comNota = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const cen = cenario(seed);
    const f = api => {
      const S = abre(api, cen.D, cen.t); const X = api.derive();
      const r = { rpc: api.realPorConta(), dre: api.dre(), economia: X.economia };
      const emit = ['FORN FICTÍCIO 0', 'FORN FICTÍCIO 1', 'FORN FICTÍCIO 2'];
      r.sug = emit.flatMap(e => [1000, 1500.5, 20000].map(v => { const o = api.sugereOC({ emitente: e, valor: v }); return o ? o.id : null; }));
      api.modalNF(); r.modal = api.el('#mbox').innerHTML;
      return limpa(r);
    };
    assert.deepEqual(f(novo), f(base), 'semente ' + seed);
    if (cen.t.notas.some(n => n.status !== 'lancada' && n.rateio.length)) comNota++;
  }
  assert.ok(comNota > 150, 'os cenários têm notas rateadas (' + comNota + ')');
});
test('B6: com a chave ligada o realizado por conta continua igual (o realizado não depende de calc_v2)', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const cen = cenario(seed); const f = lig => { const c = J(cen.t); c.par.calc_v2 = lig; abre(novo, cen.D, c); novo.derive(); return limpa(novo.realPorConta()); };
    assert.deepEqual(f(true), f(false), 'semente ' + seed);
  }
});

/* ============ B7 do revisor: texto fixo da 342 aparecia em todas as obras ============ */
test('B7: o exemplo "(na 342, 4.1.1 e 4.1.2)" só aparece na obra 342, com ou sem o eventograma oficial carregado', () => {
  for (const [cod, com] of [['999', false], ['342', true]]) {
    for (const ref of [false, true]) {
      const D = obra999(); D.obra.codigo = cod;
      abre(novo, D, estado999(ref ? { ev_agrega: true, evRef: { '4.1.1': 25000, '4.1.2': 6000 } } : { ev_agrega: true })); const X = novo.derive(); const h = novo.viewEventos(X);
      assert.equal(/\(na 342, 4\.1\.1 e 4\.1\.2\)/.test(h), com, `obra ${cod}, eventograma ${ref ? 'carregado' : 'não carregado'}`);
      assert.match(h, /dividido entre dois eventos|aparece nos dois eventos/, 'o texto genérico continua explicando');
    }
  }
});

/* ============ B8 do revisor: link direto para Eventos com a chave desligada ============ */
test('B8: link direto (vista=evt) só vale com a chave ligada; as outras telas continuam valendo como antes', () => {
  abre(novo, obra999(), estado999());
  assert.equal(novo.vistaPermitida('evt'), false, 'chave desligada: Eventos não abre por link'); assert.equal(novo.vistaPermitida('xyz'), false, 'tela que não existe');
  for (const v of ['eap', 'pac', 'rastro', 'compras', 'hoje', 'admin', 'usuarios']) assert.equal(novo.vistaPermitida(v), true, v + ' continua aceita, como a lista antiga');
  novo.S.t.par.ev_agrega = true; assert.equal(novo.vistaPermitida('evt'), true);
  /* os dois pontos de entrada usam a mesma regra */
  const ler = n => require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'js', n), 'utf8');
  assert.match(ler('51_embed.js'), /vistaPermitida\(c\.vista\)/); assert.match(ler('03b_chave.js'), /vistaPermitida\(pv\)/);
});
test('B8: a lista de telas aceitas por link com a chave desligada é a de partida (nada além de Eventos muda)', () => {
  abre(novo, obra999(), estado999()); abre(base, obra999(), estado999());
  const antes = J(base.NAV_BASE).map(n => n[0]), agora = J(novo.NAV_BASE).map(n => n[0]).filter(v => novo.vistaPermitida(v));
  assert.deepEqual(agora, antes);
});
