'use strict';
/* Integração dos 5 itens na tela do ERP (sem navegador, sem rede, sem banco): os achados da revisão final corrigidos.
   Só a OBRA 999 · DEMONSTRAÇÃO (fictícia). */
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { carrega, abre, RAIZ } = require('./ambiente');
const { obra999, estado999 } = require('./obra999');

const J = x => JSON.parse(JSON.stringify(x));
const ATAQUE = '<img src=x onerror=__x(1)>';

test('alta: versão e histórico da linha de base vindos do banco não viram HTML (Orçamento, Aprovar e conferência da Metas)', () => {
  const api = carrega('trabalho'), g = n => vm.runInContext(n, api.ctx);
  abre(api, obra999(), estado999({ meta_tela: true }), 'gestao');
  /* o estado como o banco devolveria depois de alguém com a chave geral gravar HTML na versão e no histórico */
  const est = { frozen: true, versao: ATAQUE, par: { meta_tela: true },
    hist: [{ versao: ATAQUE, motivo: 'motivo <b>texto</b>', quando: '2026-10-28', quem: 'Fulano', prop: '7' },
           { versao: 2, fora: 'sim', prop: '<b>', motivo: 'x' }, 'lixo', null, [1]] };
  api.aplicaDocs(J(est), []);
  assert.equal(api.S.t.versao, 1, 'versão vira número');
  assert.equal(api.S.t.hist.length, 2, 'só objeto entra no histórico');
  assert.deepEqual(J(api.S.t.hist[0]), { versao: 1, motivo: 'motivo <b>texto</b>', quando: '2026-10-28', quem: 'Fulano', prop: 7 });
  assert.equal(api.S.t.hist[1].fora, undefined, 'fora só quando é sim/não'); assert.equal(api.S.t.hist[1].prop, undefined, 'prop só número');
  api.derive();
  let h = api.viewEap(api.derive());
  assert.ok(!h.includes('<img'), 'Orçamento sem a tag plantada');
  assert.match(h, /Linha de base v1 congelada/); assert.match(h, /motivo &lt;b&gt;texto&lt;\/b&gt;/);
  /* mesmo se o estado escapar da limpeza (versão com texto), a tela escapa */
  api.S.t.versao = ATAQUE; api.S.t.hist = [{ versao: ATAQUE, motivo: 'm' }];
  h = api.viewEap(api.derive());
  assert.ok(!h.includes('<img') && h.includes('v&lt;img src=x onerror=__x(1)&gt;'), 'versão escapada');
  /* o delta de 30 s (chDelta) passa pela mesma limpeza */
  g('chDelta')({ versao: '<script>x</script>', hist: [{ versao: ATAQUE, motivo: 'z' }] }, []);
  assert.equal(api.S.t.versao, 1); assert.equal(api.S.t.hist[0].versao, 1);
  /* janelas da Metas: a versão nova é número */
  api.S.t.versao = ATAQUE; api.S.t.frozen = true;
  g("MP.lista=[{id:5,obra:'999',alvo:'item',codigo:'1.1',meta:800,teto:null,fechar_ate:null,antes:{meta:9000},motivo:'m',origem:'proposta',situacao:'pendente',proposto_por:'Eng Outro',proposto_papel:'engenheiro',proposto_pessoal:true}]");
  g('MP.obra=metaObra()'); api.S.role = 'gestao'; api.derive();
  g('metaDecideModal')(5, true);
  const jan = api.el('#mbox').innerHTML;
  assert.match(jan, /Aprovar a proposta nº 5/);
  assert.ok(!jan.includes('<img'), 'janela Aprovar sem a tag'); assert.match(jan, /como versão v2,/);
  const src = fs.readFileSync(path.join(RAIZ, 'fonte', 'erp', 'js', '54_meta.js'), 'utf8');
  assert.ok(!src.includes('+((S.t.versao||1)+1)'), 'a Metas não concatena a versão em texto');
  assert.equal((src.match(/\+\(\(Number\(S\.t\.versao\)\|\|1\)\+1\)/g) || []).length, 2);
});

test('média: nenhuma ação (ACOES) tem o mesmo nome em dois módulos; Conceder acesso e Nomear suplente abrem a janela antiga', () => {
  const JS = path.join(RAIZ, 'fonte', 'erp', 'js'), vistos = {};
  for (const f of fs.readdirSync(JS).filter(f => f.endsWith('.js')).sort()) {
    for (const m of fs.readFileSync(path.join(JS, f), 'utf8').matchAll(/ACOES\[['"]([\w-]+)['"]\]\s*=/g)) (vistos[m[1]] = vistos[m[1]] || []).push(f);
  }
  /* mv-novo: repetido de antes deste pacote (30_financeiro_nativo e 33_suprimentos), fora do escopo; fica registrado para o Felipe */
  const CONHECIDOS = new Set(['mv-novo']);
  const rep = Object.entries(vistos).filter(([k, v]) => v.length > 1 && !CONHECIDOS.has(k));
  assert.deepEqual(rep, [], 'ação definida em mais de um módulo: ' + JSON.stringify(rep));
  assert.deepEqual(vistos['ac-novo'], ['38_admin.js']); assert.deepEqual(vistos['acs-novo'], ['55_acessos.js']);
  /* o botão da Administração cai na janela de acesso temporário (#ac-n), não na de chave pessoal */
  const api = carrega('trabalho');
  abre(api, obra999(), estado999(), 'diretoria'); api.derive();
  api.ACOES['ac-novo']({ dataset: { t: 'acesso' } });
  const h = api.el('#mbox').innerHTML;
  assert.match(h, /Acesso temporário/); assert.match(h, /id="ac-n"/); assert.ok(!/Criar e mostrar a chave/.test(h));
  api.ACOES['ac-novo']({ dataset: { t: 'suplente' } });
  assert.match(api.el('#mbox').innerHTML, /Suplente de aprovador/);
});

test('média: Sair do ERP não volta sozinho para a chave geral guardada pelo Centro; digitar uma chave tira a marca', async () => {
  const api = carrega('trabalho'), g = n => vm.runInContext(n, api.ctx), ls = api.ctx.localStorage;
  api.ctx.location.reload = () => {};
  ls.setItem('taf-chave', 'chave-geral-de-teste'); ls.setItem('taf-erp-chave', 'pessoal-de-teste');
  assert.equal(g('chChaveInicial')()[0], 'pessoal-de-teste');
  g('chSair')();
  assert.equal(ls.getItem('taf-erp-chave'), null); assert.equal(ls.getItem('taf-erp-sem-site'), '1');
  assert.equal(g('chChaveInicial')()[0], '', 'depois de Sair aparece a tela de entrada');
  /* sem a marca, como antes: entra com a chave geral do site */
  ls.removeItem('taf-erp-sem-site'); assert.equal(g('chChaveInicial')()[0], 'chave-geral-de-teste');
  /* link do Marko continua usando a chave do Marko, mesmo com a marca */
  ls.setItem('taf-erp-sem-site', '1'); ls.setItem('taf-marko-chave', 'marko-de-teste'); api.ctx.location.search = '?obra=999&de=marko';
  assert.equal(g('chChaveInicial')()[0], 'marko-de-teste');
  api.ctx.location.search = ''; ls.removeItem('taf-marko-chave');
  /* digitar a chave na tela de entrada tira a marca */
  g("chRpc=async()=>({fixo:true,leitura:false,papel:'diretoria',quem:'Diretora Teste',obras:[]})");
  await g('chEntrar')('pessoal-nova', '', true);
  assert.equal(ls.getItem('taf-erp-sem-site'), null); assert.equal(ls.getItem('taf-erp-chave'), 'pessoal-nova');
});

/* embed.js num navegador de mentira: só o que ele usa */
function rodaEmbed(pathname, search, guardado = {}) {
  let foi = null;
  const ls = new Map(Object.entries(guardado));
  const W = { location: { pathname, search, origin: 'http://teste', replace: u => { foi = u; } }, localStorage: { getItem: k => (ls.has(k) ? ls.get(k) : null) },
    URLSearchParams, addEventListener() {} };
  W.parent = W;
  vm.runInNewContext(fs.readFileSync(path.join(RAIZ, 'fonte', 'embed.js'), 'utf8'), { window: W, document: { documentElement: { classList: { add() {} } }, addEventListener() {} }, URLSearchParams });
  return foi;
}
test('alta: /erp e /ciclo só vão para o Centro com a chave geral guardada e sem link do Marko ou do Ciclo', () => {
  /* só a chave pessoal (engenheiro, gestor, leitura): fica no /erp, que tem a própria entrada */
  assert.equal(rodaEmbed('/erp', ''), null);
  assert.equal(rodaEmbed('/ciclo', '?obra=999'), null);
  assert.equal(rodaEmbed('/erp', '?obra=997&tarefa=T3&de=marko', { 'taf-marko-chave': 'x' }), null);
  /* com a chave geral do site guardada: vai para o Centro, como antes */
  assert.equal(rodaEmbed('/erp', '?obra=999', { 'taf-chave': 'geral' }), '/?obra=999&ir=' + encodeURIComponent('/erp?obra=999'));
  assert.equal(rodaEmbed('/ciclo', '', { 'taf-chave': 'geral' }), '/?ir=' + encodeURIComponent('/ciclo'));
  /* link do Marko ou do Ciclo e ?solo=1 ficam na própria tela */
  assert.equal(rodaEmbed('/erp', '?obra=997&tarefa=T3&de=marko', { 'taf-chave': 'geral' }), null);
  assert.equal(rodaEmbed('/erp', '?obra=997&de=ciclo', { 'taf-chave': 'geral' }), null);
  assert.equal(rodaEmbed('/erp', '?solo=1', { 'taf-chave': 'geral' }), null);
  /* a página montada leva o mesmo embed.js */
  const erp = fs.readFileSync(path.join(RAIZ, 'public', 'erp.html'), 'utf8');
  assert.ok(erp.includes("geral && de !== 'marko' && de !== 'ciclo'"), 'public/erp.html montado com o embed novo');
});

test('baixa: a chave do robô não fica na página se a janela fechar; Esc e clique fora não fecham com a chave na tela', () => {
  const api = carrega('trabalho'), g = n => vm.runInContext(n, api.ctx);
  abre(api, obra999(), estado999(), 'diretoria'); api.derive();
  let aberta = true;
  api.ctx.document.getElementById = id => (id === 'rd-chave' && aberta ? { value: 'robo-x' } : null);
  const dispara = (tipo, ev) => { let parou = false; ev.stopPropagation = () => { parou = true; }; ev.target.closest = () => null;
    (api.ctx.__ouvintes[tipo] || []).forEach(f => { try { f(ev); } catch (e) { /* outros ouvintes do ERP pedem mais do elemento de mentira */ } }); return parou; };
  api.limpaMsgs();
  assert.equal(dispara('keydown', { key: 'Escape', target: {} }), true, 'Esc com a chave na tela é segurado');
  assert.ok(api.msgs().some(m => /Pronto/.test(m)));
  assert.equal(dispara('click', { target: { id: 'modal' } }), true, 'clique fora com a chave na tela é segurado');
  aberta = false;
  assert.equal(dispara('keydown', { key: 'Escape', target: {} }), false, 'sem a chave na tela, Esc fecha como sempre');
  /* "Pronto" tira a chave do campo e da janela */
  api.el('#rd-chave').value = 'robo-x'; api.el('#mbox').innerHTML = '<input id="rd-chave" value="robo-x">';
  api.ACOES['rd-chave-fechar']();
  assert.equal(api.el('#rd-chave').value, ''); assert.equal(api.el('#mbox').innerHTML, '');
});

test('baixa: item sem meta (obra nova) aparece como "sem meta", não R$ 0,00, e o histórico não grava "meta R$ 0,00"', () => {
  const api = carrega('trabalho');
  const D = obra999(); const it = D.eap.find(e => e.tipo_linha === 'item'); it.meta_total = null; it.teto_total = null; it.meta_unit = null;
  abre(api, D, estado999(), 'gestao');
  if (api.S.D.eap.find(e => e.codigo === it.codigo).meta_total != null) assert.fail('o cenário não ficou sem meta');
  api.S.exp = new Set(api.S.D.eap.filter(e => e.tipo_linha === 'grupo').map(e => e.codigo));
  const h = api.viewEap(api.derive());
  const linha = h.split('data-item="' + it.codigo + '"')[1].split('</tr>')[0];
  assert.match(linha, /sem meta/); assert.ok(!/R\$&nbsp;0,00|R\$ 0,00/.test(linha.split('</td>').slice(2, 5).join('')), 'meta e teto vazios não viram zero');
  api.modalItem(it.codigo);
  assert.match(api.el('#mbox').innerHTML, /<div class="k-l">Meta<\/div><div class="v">sem meta<\/div>/);
  assert.match(api.el('#mbox').innerHTML, /sem teto/);
  /* a meta aprovada aplicada no item sem meta: o histórico diz "sem meta → R$ ..." */
  const g = n => vm.runInContext(n, api.ctx);
  api.ctx.__p = { id: 9, alvo: 'item', codigo: it.codigo, meta: 120000, teto: null, motivo: 'meta do item', origem: 'direta', decidido_por: 'Diretora' };
  const r = g("metaAplicaUma(__p,['meta'])");
  assert.equal(r.ok, true);
  const mot = api.S.t.hist[api.S.t.hist.length - 1].motivo;
  assert.match(mot, /meta sem meta → R\$/); assert.ok(!/meta R\$\s?0,00/.test(mot));
});

test('baixa: congelar a linha de base registra a obra aberta, não a 342', () => {
  const api = carrega('trabalho');
  abre(api, obra999(), { ...estado999(), frozen: false }, 'gestao'); api.derive();
  vm.runInContext("ask=(t,l,p,f)=>f('teste')", api.ctx);
  api.clicar('congelar');
  const a = api.S.t.aud.find(x => x.campo === 'linha_base' || x.c === 'linha_base' || JSON.stringify(x).includes('linha_base'));
  assert.ok(a, 'auditoria do congelar');
  assert.ok(JSON.stringify(a).includes('"999"') && !JSON.stringify(a).includes('"342"'), JSON.stringify(a));
});

test('média: Acessos diz o que o encarregado vê e grava no ERP; a lista marca o robô do resumo', () => {
  const src = fs.readFileSync(path.join(RAIZ, 'fonte', 'erp', 'js', '55_acessos.js'), 'utf8');
  assert.match(src, /encarregado:'No planejador só aponta o dia[^']*No ERP entra como encarregado: vê o Orçamento \(licitado, meta e teto\)/);
  assert.match(src, /encarregado:\[\['\/marko','tela da obra: apontar o dia'\],\['\/erp',/);
  assert.match(src, /c\.robo\?' <span class="pill info">robô do resumo<\/span>'/);
  const man = fs.readFileSync(path.join(RAIZ, 'fonte', 'erp', 'manuais', 'MANUAL_gerencia.md'), 'utf8');
  assert.ok(!/Obra nova não entra sozinha numa chave que já existe: crie/.test(man), 'o manual não contradiz o 04');
  assert.match(man, /entra na chave de quem a cria pela tela e nas chaves de Diretoria com todas as obras/);
  assert.match(man, /No ERP a chave dele entra como encarregado/);
  const leia = fs.readFileSync(path.join(RAIZ, 'fonte', 'erp', 'sql', 'LEIA-ME-06-ACESSOS-PENDENTE.md'), 'utf8');
  assert.match(leia, /O que o encarregado vê no ERP/);
});
