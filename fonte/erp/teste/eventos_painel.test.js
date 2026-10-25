'use strict';
/* Tela Eventos refeita com a skill design-de-painel: uma frase com a mensagem, números com origem, um cartão por evento ou pacote (os mais graves primeiro),
   tabela só se a pessoa pedir ("Ver como tabela"). Só leitura: os números são os mesmos de agregaEventos() e agregaPacotes() (provados em m2.test.js). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { carrega, abre, RAIZ } = require('./ambiente');
const { cenario } = require('./gerador');
const { obra999, estado999, EV_REF_999, oc } = require('./obra999');

const api = carrega('trabalho');
const J = x => JSON.parse(JSON.stringify(x));
const cartoes = h => h.split('<div class="ev-card').slice(1).map(c => '<div class="ev-card' + c);
const chavesDe = h => cartoes(h).map(c => (c.match(/data-k="([^"]*)"/) || [])[1]);

test('a vista padrão é de cartões: um por evento, com os mesmos dados que abrem o detalhe; a tabela só aparece com "Ver como tabela"', () => {
  const S = abre(api, obra999(), estado999({ ev_agrega: true, evRef: EV_REF_999 })); const X = api.derive();
  const h = String(api.viewEventos(X));
  assert.equal(cartoes(h).length, 5, '4 eventos e "Sem evento"'); assert.doesNotMatch(h, /<table/, 'sem parede de tabela');
  cartoes(h).forEach(c => { assert.match(c, /data-act="ev-det" data-m="evento" data-k="/); assert.match(c, /class="ev-card clk /); });
  S.tab.evtv = 'tabela'; const t = String(api.viewEventos(X)); assert.match(t, /<table/); assert.doesNotMatch(t, /ev-card/); assert.match(t, /Eventograma oficial/);
  S.tab.evtv = 'cards'; S.tab.evt = 'pacote'; const p = String(api.viewEventos(X)); assert.deepEqual(chavesDe(p).sort(), ['CANT', 'ELET', 'HIDR']);
});

test('os mais graves vêm primeiro; "Sem evento" fica por último; dentro da mesma cor vale a ordem dos códigos', () => {
  abre(api, obra999(), estado999({ ev_agrega: true })); const X = api.derive();
  const h = String(api.viewEventos(X)), ks = chavesDe(h);
  assert.deepEqual(ks, ['4.1.1', '1.1.1', '2.1.1', '4.1.2', ''], 'vermelho (4.1.1), depois os verdes em ordem de código, e "Sem evento" no fim');
});

test('mensagem principal em uma frase, com a contagem certa por cor', () => {
  abre(api, obra999(), estado999({ ev_agrega: true })); const X = api.derive(), E = J(api.agregaEventos());
  const cor = c => E.grupos.filter(g => g.n > 0 && g.sem[0] === c).length;
  assert.equal(api.eventosFrase(E, 'evento'), `${cor('vermelho') + cor('amarelo')} de ${E.grupos.filter(g => g.n > 0).length} eventos pedem atenção: ${cor('vermelho')} em vermelho.`);
  const bom = J(E); bom.grupos.forEach(g => { g.sem = ['verde', 'Dentro da meta']; }); assert.equal(api.eventosFrase(bom, 'evento'), `Os ${bom.grupos.filter(g => g.n > 0).length} eventos estão dentro da meta.`);
  assert.match(String(api.viewEventos(X)), /<p class="ev-sub">2 de 5 eventos pedem atenção: 2 em vermelho\.<\/p>/);
});

test('cada número do topo diz de onde vem; o total bate com a soma dos cartões', () => {
  abre(api, obra999(), estado999({ ev_agrega: true })); const X = api.derive(), E = J(api.agregaEventos());
  const h = String(api.viewEventos(X));
  assert.match(h, /R\$ 109\.000<\/div>/, 'em reais inteiros, com o valor exato ao passar o mouse'); assert.match(h, /title="R\$\s109\.000,00"/);
  assert.match(h, /Receita licitada[\s\S]*?preço licitado dos 9 itens/); assert.match(h, /Meta de custo[\s\S]*?soma da meta dos 9 itens/);
  assert.match(h, /Já consumido[\s\S]*?pedidos aprovados sem nota mais notas rateadas · \d+% da meta/); assert.match(h, /Saldo livre[\s\S]*?meta menos comprometido e realizado/);
  assert.doesNotMatch(h, /Reservado/, 'sem ev_ctrl não há campo de reservado');
  const soma = E.grupos.reduce((s, g) => s + g.livre, 0), tot = E.total.livre; assert.ok(Math.abs(soma - tot) < 0.005, 'a soma dos saldos dos cartões é o saldo do topo');
});

test('cor sempre com texto: todo cartão tem a etiqueta e, se não é verde, o motivo escrito', () => {
  abre(api, obra999(), estado999({ ev_agrega: true })); const X = api.derive();
  for (const c of cartoes(String(api.viewEventos(X)))) {
    assert.match(c, /<span class="pill (ok|warn|bad|mute)" title="[^"]*">(verde|amarelo|vermelho|sem base)<\/span>/);
    if (!/pill ok"/.test(c)) assert.match(c, /<p class="ev-why">[^<]+\.<\/p>/);
  }
});

test('filtros: Atenção e Dentro da meta separam os cartões; filtro vazio mostra a mensagem', () => {
  const S = abre(api, obra999(), estado999({ ev_agrega: true })); const X = api.derive();
  S.tab.evtf = 'atencao'; assert.deepEqual(chavesDe(String(api.viewEventos(X))), ['4.1.1', '']);
  S.tab.evtf = 'ok'; assert.deepEqual(chavesDe(String(api.viewEventos(X))), ['1.1.1', '2.1.1', '4.1.2']);
  assert.match(String(api.viewEventos(X)), /Atenção \(2\)/); assert.match(String(api.viewEventos(X)), /Dentro da meta \(3\)/);
  const bom = abre(api, (() => { const D = obra999(); D.eap.forEach(e => { if (e.tipo_linha === 'item') { e.teto_total = e.meta_total * 2; } }); return D; })(), estado999({ ev_agrega: true })); const Xb = api.derive();
  bom.tab.evtf = 'atencao'; assert.match(String(api.viewEventos(Xb)), /Nenhum evento neste filtro\./);
});

test('com o limite em três níveis ligado entra o reservado: no topo, no cartão e na barra', () => {
  const S = abre(api, obra999(), estado999({ ev_agrega: true, ev_ctrl: true })); const X = api.derive();   /* OC-9003 (2.500, item 3.1 do evento 4.1.1) está aguardando aprovação */
  const h = String(api.viewEventos(X));
  assert.match(h, /Reservado[\s\S]*?1 pedido aguardando aprovação/); const c = cartoes(h).find(x => /data-k="4\.1\.1"/.test(x));
  assert.match(c, /mais R\$ 2\.500 reservados/); assert.match(c, /<i class="v" style="width:/); assert.match(h, /<i class="v"><\/i>reservado/);
});

test('a barra de cada cartão: realizado + comprometido (+ reservado) nunca passam de 100% e a meta e o limite têm marca', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const cen = cenario(seed, { itemFora: false }); cen.t.par.ev_agrega = true; cen.t.par.ev_ctrl = seed % 2 === 0; abre(api, cen.D, cen.t); const X = api.derive();
    for (const tab of ['evento', 'pacote']) {
      api.S.tab.evt = tab; const h = String(api.viewEventos(X));
      for (const c of cartoes(h)) {
        const b = c.match(/<div class="ev-bar"[\s\S]*?<\/div>/)[0], ws = [...b.matchAll(/<i class="[rcv]" style="width:([\d.]+)%/g)].map(m => +m[1]);
        assert.ok(ws.reduce((a, x) => a + x, 0) <= 100.2, `semente ${seed}: barra passa de 100% (${ws})`);
        [...b.matchAll(/<i class="[ml]" style="left:([\d.]+)%/g)].forEach(m => assert.ok(+m[1] >= 0 && +m[1] <= 100, 'marca dentro da barra'));
      }
    }
  }
});

test('obra sem evento: cartões por grupo da EAP, sem a palavra "Sem evento"; texto dos nomes é escapado', () => {
  const D = obra999(); D.eap.forEach(e => { e.evento = null; }); D.eap[0].descricao = '<img src=x onerror=alert(1)>';
  abre(api, D, estado999({ ev_agrega: true })); const X = api.derive(); const h = String(api.viewEventos(X));
  assert.deepEqual(chavesDe(h).sort(), ['1', '2', '3']); assert.match(h, /Grupo da EAP/); assert.match(h, /não tem evento no orçamento/); assert.doesNotMatch(h, /Sem evento/);
  assert.doesNotMatch(h, /<img/); assert.match(h, /&lt;img/);
});

test('300 cenários aleatórios: a vista de cartões nunca quebra e tem um cartão por grupo, nos dois sentidos (evento e pacote)', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const cen = cenario(seed, seed % 5 === 0 ? { eventos: false, itemFora: false } : { itemFora: false }); cen.t.par.ev_agrega = true; cen.t.par.ev_ctrl = seed % 3 === 0; cen.t.par.oc_linhas = seed % 4 === 0;
    const S = abre(api, cen.D, cen.t); const X = api.derive(); const E = J(api.agregaEventos()), P = J(api.agregaPacotes());
    S.tab.evt = 'evento'; assert.equal(cartoes(String(api.viewEventos(X))).length, E.grupos.length, 'semente ' + seed);
    S.tab.evt = 'pacote'; assert.equal(cartoes(String(api.viewEventos(X))).length, P.grupos.length, 'semente ' + seed);
    S.tab.evtv = 'tabela'; String(api.viewEventos(X)); S.tab.evtv = 'cards';
  }
});

test('o detalhe (clique no cartão) mostra meta, limite, comprometido + realizado e saldo, e a lista dos itens', () => {
  const S = abre(api, obra999(), estado999({ ev_agrega: true })); api.derive();
  api.ACOES['ev-det']({ dataset: { m: 'evento', k: '4.1.1' } }); const h = String(api.el('#mbox').innerHTML);
  assert.match(h, /Evento 4\.1\.1/); assert.match(h, /pill bad/); assert.match(h, /Comprometido \+ realizado/); assert.match(h, /Cada valor é a soma dos itens abaixo/);
  ['3.1', '3.2', '3.4'].forEach(i => assert.match(h, new RegExp(`data-item="${i.replace('.', '\\.')}"`)));
});

test('tema: o bloco de estilo do painel usa só variáveis de tema (nenhuma cor escrita à mão), então vale no claro, no escuro e dentro do Centro (Claro, Masterclass, Grotesk)', () => {
  const css = fs.readFileSync(path.join(RAIZ, 'fonte', 'erp', 'style.css'), 'utf8'), ini = css.indexOf('/* ============ Eventos: painel');
  assert.ok(ini > 0, 'o bloco existe'); const bloco = css.slice(ini);
  assert.doesNotMatch(bloco, /#[0-9a-fA-F]{3,8}\b/, 'cor em hexadecimal'); assert.doesNotMatch(bloco, /\brgba?\(/, 'cor em rgb'); assert.doesNotMatch(bloco, /\bhsla?\(/);
  const usadas = new Set([...bloco.matchAll(/var\(--([a-z0-9-]+)/g)].map(m => m[1]));
  const definidas = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1].slice(2)));
  for (const v of usadas) assert.ok(definidas.has(v), 'a variável --' + v + ' existe no tema do ERP');
  /* a mesma regra vale para o HTML que a tela gera */
  abre(api, obra999(), estado999({ ev_agrega: true, ev_ctrl: true })); const h = String(api.viewEventos(api.derive()));
  assert.doesNotMatch(h, /style="[^"]*(#[0-9a-fA-F]{3,6}|rgb)/, 'o HTML não carrega cor escrita à mão');
});
