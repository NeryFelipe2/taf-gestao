'use strict';
/* Item 2 do "sistema sozinho": META PELA TELA (fonte/erp/js/54_meta.js), chave par.meta_tela (padrão desligada).
   O engenheiro propõe, Gerente/Gestão/Diretoria aprovam; a meta aprovada entra no estado da obra pelo mesmo caminho do Atualizar pela planilha.
   Sem banco: as propostas ficam no navegador de mentira (as mesmas regras do 05_meta.sql). O caminho do banco é conferido com o chRpc simulado.
   Só a OBRA 999 · DEMONSTRAÇÃO (fictícia) e cenários aleatórios inventados. */
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { carrega, abre } = require('./ambiente');
const { cenario } = require('./gerador');
const { obra999, estado999 } = require('./obra999');

const J = x => JSON.parse(JSON.stringify(x));
const perto = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.005, `${msg}: ${a} x ${b}`);

function novo(par = { meta_tela: true }, papel = 'engenheiro') {
  const api = carrega('trabalho');
  const g = n => vm.runInContext(n, api.ctx);
  const S = abre(api, obra999(), estado999(par), papel); api.derive();
  return { api, g, S };
}
/* preenche a janela de propor e envia (como o clique faria) */
async function propoe(api, g, alvo, cod, { meta = '', teto = '', fechar = '', motivo = 'motivo de teste' } = {}, direta = false) {
  g('metaModal')(alvo, cod, direta);
  api.el('#mt-m').value = String(meta); api.el('#mt-t').value = String(teto); api.el('#mt-f').value = String(fechar); api.el('#mt-mo').value = motivo;
  await g('metaEnviar')();
  return J(g('MP').lista).find(p => p.alvo === alvo && p.codigo === cod);
}
async function decide(api, g, id, aprovar, motivo = '') {
  g('metaDecideModal')(id, aprovar); api.el('#md-m').value = motivo; await g('metaDecideOk')();
  return J(g('MP').lista).find(p => String(p.id) === String(id));
}
const papel = (api, S, r) => { S.role = r; api.derive(); };

test('chave desligada (padrão): sem aba Metas, sem botões e Remanejar continua de Gerente e Diretoria', () => {
  const { api, g, S } = novo({}, 'gestao');
  assert.equal(g('metaTela')(), false);
  assert.ok(!api.areasVisiveis().some(a => a.tabs.some(t => t[0] === 'metas')), 'aba escondida');
  assert.equal(g('metaBotoes')('item', '1.1'), '');
  assert.equal(api.can('remanejar'), false, 'gestão não remaneja com a chave desligada');
  papel(api, S, 'gerente'); assert.equal(api.can('remanejar'), true);
  assert.equal(api.vistaPermitida('metas'), false);
  const a = []; g('metaAlertas')(a); assert.deepEqual(a, []);
  assert.ok(api.CHAVES_OBRA.some(c => c.k === 'meta_tela'), 'chave aparece em Parâmetros');
});

test('chave ligada: aba Metas para engenheiro, gerente, gestão e diretoria; Gestão passa a remanejar', () => {
  const { api, S } = novo();
  for (const r of ['engenheiro', 'gerente', 'gestao', 'diretoria']) {
    papel(api, S, r);
    assert.ok(api.areasVisiveis().some(a => a.k === 'obra' && a.tabs.some(t => t[0] === 'metas')), 'aba para ' + r);
  }
  for (const r of ['compras', 'almox', 'encarregado', 'financeiro', 'adm', 'planejamento']) {
    papel(api, S, r);
    assert.ok(!api.areasVisiveis().some(a => a.tabs.some(t => t[0] === 'metas')), 'sem aba para ' + r);
  }
  papel(api, S, 'gestao'); assert.equal(api.can('remanejar'), true);
  papel(api, S, 'engenheiro'); assert.equal(api.can('remanejar'), false);
  assert.equal(api.vistaPermitida('metas'), true);
});

test('engenheiro propõe a meta do item: fica pendente e nada muda na meta até a aprovação', async () => {
  const { api, g, S } = novo();
  const p = await propoe(api, g, 'item', '3.4', { meta: 4200, teto: 4500, motivo: 'cotação real veio maior' });
  assert.equal(p.situacao, 'pendente'); assert.equal(p.proposto_papel, 'engenheiro'); perto(p.meta, 4200, 'meta proposta'); perto(p.teto, 4500, 'teto proposto');
  perto(p.antes.meta, 4000, 'antes'); perto(p.antes.teto, 4400, 'teto antes'); perto(p.antes.venda, 6000, 'licitado');
  perto(S.byCod['3.4'].meta_total, 4000, 'meta não muda'); assert.deepEqual(J(S.t.baseOv), {}); assert.equal(S.t.versao, 1);
  assert.ok(api.msgs().some(m => /Proposta nº 1 enviada/.test(m)));
  /* o engenheiro não aprova nem grava o estado */
  assert.equal(g('metaPodeDecidir')(p)[0], false);
  assert.equal(await g('metaAplicarAprovadas')(), 0);
  /* segunda proposta no mesmo item espera a primeira */
  api.limpaMsgs(); await propoe(api, g, 'item', '3.4', { meta: 4300 });
  assert.ok(api.msgs().some(m => /já tem uma proposta esperando decisão/.test(m)), api.msgs().join(' | '));
  /* sem motivo, sem valor ou valor igual ao de hoje: a tela recusa antes de mandar */
  api.limpaMsgs(); await propoe(api, g, 'item', '1.1', { meta: 9500, motivo: ' ' }); assert.ok(api.msgs().includes('Escreva o motivo.'));
  api.limpaMsgs(); await propoe(api, g, 'item', '1.1', {}); assert.ok(api.msgs().some(m => /Informe a meta nova/.test(m)));
  api.limpaMsgs(); await propoe(api, g, 'item', '1.1', { meta: 9000 }); assert.ok(api.msgs().some(m => /Nada muda/.test(m)));
  api.limpaMsgs(); await propoe(api, g, 'item', '1.1', { meta: -5 }); assert.ok(api.msgs().includes('Valor inválido.'));
  assert.equal(J(g('MP').lista).length, 1);
});

test('Gestão aprova: a meta entra na linha de base como versão nova, com histórico (número da proposta) e auditoria', async () => {
  const { api, g, S } = novo();
  const p = await propoe(api, g, 'item', '3.4', { meta: 4200, teto: 4500, motivo: 'cotação real veio maior' });
  papel(api, S, 'gestao');
  assert.equal(g('metaPodeDecidir')(p)[0], true);
  assert.equal(g('metaParaMim')().length, 1);
  assert.match(g('metaBadge')(), /badge hot">1</);
  const a = []; g('metaAlertas')(a); assert.equal(a.length, 1); assert.match(a[0][1], /1 proposta/);
  const d = await decide(api, g, p.id, true, 'ok, conferido');
  assert.equal(d.situacao, 'aprovada'); assert.equal(d.decidido_papel, 'gestao'); assert.ok(d.ordem > 0);
  perto(S.byCod['3.4'].meta_total, 4200, 'meta nova'); perto(S.byCod['3.4'].teto_total, 4500, 'teto novo'); perto(S.byCod['3.4'].meta_unit, 4200, 'meta unitária (qtd 1)');
  assert.equal(S.t.versao, 2, 'versão nova (linha de base congelada)');
  const h = J(S.t.hist).at(-1); assert.equal(h.prop, p.id); assert.equal(h.versao, 2); assert.match(h.motivo, /cotação real veio maior/); assert.match(h.motivo, /aprovada por/);
  const au = J(S.t.aud);
  assert.ok(au.some(x => x.ref === '3.4' && x.campo === 'meta_total' && x.antes === '4000' && x.depois === '4200'));
  assert.ok(au.some(x => x.ref === '3.4' && x.campo === 'teto_total' && x.antes === '4400' && x.depois === '4500'));
  assert.ok(au.some(x => x.campo === 'linha_base' && x.depois.startsWith('v2')));
  assert.deepEqual(J(g('metaSituacao')(d)), ['ok', 'na linha de base v2']);
  /* aplicar de novo não faz nada (a marca está no histórico) */
  assert.equal(await g('metaAplicarAprovadas')(), 0); assert.equal(S.t.versao, 2);
  /* o estado que vai para o banco leva a marca */
  assert.equal(J(api.estadoObra()).hist.at(-1).prop, p.id);
  /* o item aceita proposta nova depois da decisão */
  papel(api, S, 'engenheiro'); const p2 = await propoe(api, g, 'item', '3.4', { meta: 4250 }); assert.equal(p2.situacao, 'pendente');
});

test('recusar pede motivo; quem propôs não decide; cancelar só a própria e pendente', async () => {
  const { api, g, S } = novo();
  const p = await propoe(api, g, 'item', '2.1', { meta: 31000 });
  papel(api, S, 'diretoria');
  api.limpaMsgs(); await decide(api, g, p.id, false, '');
  assert.ok(api.msgs().includes('Escreva o motivo da recusa')); assert.equal(J(g('MP').lista)[0].situacao, 'pendente');
  const r = await decide(api, g, p.id, false, 'segurar até a medição');
  assert.equal(r.situacao, 'recusada'); assert.equal(r.decisao_motivo, 'segurar até a medição');
  perto(S.byCod['2.1'].meta_total, 30000, 'recusada não muda a meta'); assert.equal(S.t.versao, 1);
  /* a Gestão propõe e não aprova a própria; a Diretoria aprova */
  papel(api, S, 'gestao'); const q = await propoe(api, g, 'item', '1.2', { meta: 6500 });
  assert.deepEqual(J(g('metaPodeDecidir')(q)), [false, 'Quem propôs não decide a própria proposta.']);
  await assert.rejects(g('MPL').decidir(q.id, true, ''), /QUEM PROPOS NAO DECIDE/);
  /* cancelar: a Diretoria não cancela a proposta da Gestão; a Gestão cancela */
  papel(api, S, 'diretoria'); await assert.rejects(g('MPL').cancelar(q.id, ''), /SO QUEM PROPOS CANCELA/);
  papel(api, S, 'gestao'); g('metaCancelarModal')(q.id); api.el('#md-m').value = 'desisti'; await g('metaCancelaOk')();
  assert.equal(J(g('MP').lista).find(x => x.id === q.id).situacao, 'cancelada');
  await assert.rejects(g('MPL').cancelar(q.id, ''), /PROPOSTA JA DECIDIDA/);
  /* papéis sem permissão */
  papel(api, S, 'compras'); assert.equal(g('metaPodePropor')()[0], false); await assert.rejects(g('MPL').propor({ alvo: 'item', codigo: '1.1', meta: 1, motivo: 'abc' }), /NAO PROPOE META/);
});

test('pacote: meta, teto e "fechar até" aprovados entram no cadastro do pacote (basePac), como na planilha', async () => {
  const { api, g, S } = novo();
  const p = await propoe(api, g, 'pacote', 'HIDR', { meta: 46000, teto: 50000, fechar: '2030-02-15', motivo: 'proposta do fornecedor' });
  assert.equal(p.fechar_ate, '2030-02-15'); perto(p.antes.meta, 45000, 'antes'); assert.equal(p.antes.fechar_ate, '2030-01-20');
  papel(api, S, 'gerente'); await decide(api, g, p.id, true, '');
  const pc = S.D.pacotes.find(x => x.codigo === 'HIDR');
  perto(pc.meta, 46000, 'meta do pacote'); perto(pc.teto, 50000, 'teto do pacote'); assert.equal(pc.fechar_ate, '2030-02-15');
  assert.deepEqual(J(S.t.basePac.HIDR), { meta: 46000, teto: 50000, fechar_ate: '2030-02-15' });
  perto(S.byCod['2.1'].meta_total, 30000, 'itens do pacote não mudam');
  assert.ok(J(S.t.aud).some(x => x.ref === 'HIDR' && x.campo === 'fechar_ate' && x.depois === '2030-02-15'));
  assert.equal(J(S.t.hist).at(-1).prop, p.id);
  /* só a data */
  papel(api, S, 'engenheiro'); const q = await propoe(api, g, 'pacote', 'CANT', { fechar: '2030-03-01' });
  papel(api, S, 'diretoria'); await decide(api, g, q.id, true);
  const c = S.D.pacotes.find(x => x.codigo === 'CANT'); assert.equal(c.fechar_ate, '2030-03-01'); perto(c.meta, 15000, 'meta mantida'); perto(c.teto, 16500, 'teto mantido');
});

test('Gestão e Diretoria mudam a meta direto, com motivo; o Gerente não', async () => {
  const { api, g, S } = novo({ meta_tela: true }, 'gestao');
  assert.match(g('metaBotoes')('item', '2.2'), /Mudar meta/);
  const p = await propoe(api, g, 'item', '2.2', { meta: 10500, motivo: 'revisão da gestão' }, true);
  assert.equal(p.origem, 'direta'); assert.equal(p.situacao, 'aprovada'); assert.equal(p.decidido_por, p.proposto_por);
  perto(S.byCod['2.2'].meta_total, 10500, 'meta mudou na hora'); assert.equal(J(S.t.hist).at(-1).prop, p.id); assert.match(J(S.t.hist).at(-1).motivo, /mudança direta/);
  papel(api, S, 'gerente'); assert.equal(g('metaPodeDireta')()[0], false); assert.doesNotMatch(g('metaBotoes')('item', '2.2'), /Mudar meta/);
  await assert.rejects(g('MPL').direta({ alvo: 'item', codigo: '1.1', meta: 1, motivo: 'abc' }), /SO GESTAO E DIRETORIA/);
});

test('item remanejado: a meta aprovada substitui o remanejamento do item (fica na auditoria); só o teto mantém o remanejamento', async () => {
  const { api, g, S } = novo({ meta_tela: true }, 'gerente');
  api.el('#rm-de').value = '3.4'; api.el('#rm-para').value = '3.1'; api.el('#rm-v').value = '1000'; api.el('#rm-m').value = 'teste'; api.el('#rm-msg');
  api.doRemanejar(); perto(S.byCod['3.1'].meta_total, 8000, 'remanejado'); assert.equal(S.t.metaOv['3.1'], 8000);
  papel(api, S, 'engenheiro');
  const p = await propoe(api, g, 'item', '3.1', { meta: 9000 }); const q = await propoe(api, g, 'item', '3.4', { teto: 4800 });
  papel(api, S, 'diretoria'); await decide(api, g, p.id, true); await decide(api, g, q.id, true);
  perto(S.byCod['3.1'].meta_total, 9000, 'meta aprovada vale'); assert.equal(S.t.metaOv['3.1'], undefined);
  assert.ok(J(S.t.aud).some(x => x.ref === '3.1' && x.campo === 'remanejamento' && x.antes === '8000'));
  perto(S.byCod['3.4'].meta_total, 3000, 'só o teto: o remanejamento do 3.4 continua'); assert.equal(S.t.metaOv['3.4'], 3000); perto(S.byCod['3.4'].teto_total, 4800, 'teto novo');
  perto(S.byCod['3.4'].meta_base, 4000, 'meta da linha de base do 3.4 não muda');
});

test('estado velho gravado por cima: a aprovada volta a faltar e a próxima passada aplica de novo, uma vez só', async () => {
  const { api, g, S } = novo();
  const p = await propoe(api, g, 'item', '1.1', { meta: 9300 });
  papel(api, S, 'gestao');
  const velho = J(api.estadoObra());   /* o estado que outro navegador tinha antes da aprovação */
  await decide(api, g, p.id, true); perto(S.byCod['1.1'].meta_total, 9300, 'aplicada');
  /* o outro navegador grava o estado velho por cima (o ERP não confere a versão antes de gravar) */
  /* (o outro navegador abriu a obra do zero: dados fixos da carga + o estado velho) */
  S.D = obra999(); Object.assign(S.t, J(velho)); api.prep(); api.derive(); perto(S.byCod['1.1'].meta_total, 9000, 'meta voltou com o estado velho');
  assert.equal(g('metaParaAplicar')(g('MP').lista, S.t).length, 1);
  assert.equal(await g('metaAplicarAprovadas')(), 1);
  perto(S.byCod['1.1'].meta_total, 9300, 'meta aprovada de volta'); assert.equal(J(S.t.hist).filter(h => h.prop === p.id).length, 1);
  assert.equal(await g('metaAplicarAprovadas')(), 0, 'segunda passada não aplica de novo');
  /* quem não grava o estado não aplica (o engenheiro abre a obra e só vê a situação) */
  S.D = obra999(); Object.assign(S.t, J(velho)); api.prep(); papel(api, S, 'engenheiro');
  assert.equal(await g('metaAplicarAprovadas')(), 0); perto(S.byCod['1.1'].meta_total, 9000, 'engenheiro não aplica');
  assert.match(g('metaSituacao')(J(g('MP').lista)[0])[1], /entra na linha de base quando/);
});

test('ordem das aprovadas: campo que uma aprovada mais nova já mudou não volta ao valor velho; campos diferentes valem os dois', () => {
  const { g } = novo();
  const P = (id, ordem, extra) => ({ id, obra: '999', alvo: 'item', codigo: '1.1', situacao: 'aprovada', ordem, meta: null, teto: null, ...extra });
  const t = { hist: [{ versao: 2, prop: 2 }] };
  /* P1 (meta) não aplicada, P2 (meta) mais nova já aplicada: P1 fica superada */
  let r = J(g('metaParaAplicar')([P(1, 1, { meta: 100 }), P(2, 2, { meta: 200 })], t));
  assert.equal(r.length, 1); assert.equal(r[0].p.id, 1); assert.deepEqual(r[0].campos, []);
  /* P1 mexe na meta, P2 só no teto: a meta de P1 ainda entra */
  r = J(g('metaParaAplicar')([P(1, 1, { meta: 100 }), P(2, 2, { teto: 300 })], t));
  assert.deepEqual(r[0].campos, ['meta']);
  /* nenhuma aplicada: as duas, na ordem da decisão (a mais nova por último, vence) */
  r = J(g('metaParaAplicar')([P(2, 5, { meta: 200 }), P(1, 3, { meta: 100 })], { hist: [] }));
  assert.deepEqual(r.map(x => x.p.id), [1, 2]);
  /* pendente, recusada e cancelada nunca entram */
  r = J(g('metaParaAplicar')([P(3, null, { situacao: 'pendente', meta: 1 }), P(4, null, { situacao: 'recusada', meta: 1 }), P(5, null, { situacao: 'cancelada', meta: 1 })], { hist: [] }));
  assert.deepEqual(r, []);
});

test('proposta de outra obra nunca é aplicada nesta', async () => {
  const { g, S } = novo({ meta_tela: true }, 'gestao');
  const MP = g('MP'); MP.obra = '999';
  MP.lista = [{ id: 7, obra: '342', alvo: 'item', codigo: '1.1', situacao: 'aprovada', ordem: 1, meta: 1, teto: null, motivo: 'x', proposto_por: 'A', decidido_por: 'B' }];
  assert.equal(await g('metaAplicarAprovadas')(), 0); perto(S.byCod['1.1'].meta_total, 9000, 'não mudou');
});

test('tela Metas: engenheiro vê as dele e a situação; aprovador vê "Para aprovar"; texto digitado sai escapado', async () => {
  const { api, g, S } = novo();
  await propoe(api, g, 'item', '1.2', { meta: 6200, motivo: '<img src=x onerror=alert(1)> cotação' });
  S.view = 'metas'; let h = g('viewMetas')();
  assert.match(h, /Minhas propostas 1/); assert.doesNotMatch(h, /Para aprovar/); assert.match(h, /aguardando decisão/);
  assert.ok(!h.includes('<img src=x'), 'motivo escapado'); assert.ok(h.includes('&lt;img src=x'));
  assert.match(h, /Cancelar a minha proposta/);
  papel(api, S, 'gestao'); h = g('viewMetas')();
  assert.match(h, /Para aprovar <em>1<\/em>/); assert.match(h, /data-act="meta-aprovar"/); assert.match(h, /Licitado/); assert.match(h, /Margem/);
  /* histórico da linha de base no Orçamento também sai escapado */
  const p = J(g('MP').lista)[0]; await decide(api, g, p.id, true);
  const eap = api.viewEap(api.derive()); assert.ok(!eap.includes('<img src=x')); assert.ok(eap.includes('&lt;img src=x'));
  /* janela do item mostra os botões e a do pacote também */
  papel(api, S, 'engenheiro'); assert.match(g('metaBotoes')('item', '1.2'), /Propor meta/); assert.match(g('metaBotoes')('pacote', 'CANT'), /Propor meta do pacote/);
});

test('caminho do banco: as funções taf_erp_meta_* recebem os argumentos certos e os erros viram texto de obra', async () => {
  const { api, g } = novo();
  const chamadas = [];
  g('CH').chave = 'chave-de-teste'; g('CH').quem = 'Nome Digitado'; g('SB').obraId = '999';
  vm.runInContext('chRpc=async(fn,body)=>{__chamadas.push([fn,JSON.parse(JSON.stringify(body))]);return fn==="taf_erp_meta_listar"?[]:{id:1}}', Object.assign(api.ctx, { __chamadas: chamadas }));
  const R = g('MPR');
  await R.listar();
  await R.propor({ alvo: 'item', codigo: '1.1', meta: 1, teto: null, fechar_ate: null, motivo: 'abc', antes: { meta: 2 } });
  await R.decidir(5, true, '');
  await R.cancelar(6, 'm');
  await R.direta({ alvo: 'pacote', codigo: 'CANT', meta: null, teto: 3, fechar_ate: '2030-01-01', motivo: 'abc', antes: {} });
  assert.deepEqual(chamadas.map(c => c[0]), ['taf_erp_meta_listar', 'taf_erp_meta_propor', 'taf_erp_meta_decidir', 'taf_erp_meta_cancelar', 'taf_erp_meta_direta']);
  assert.deepEqual(chamadas[0][1], { p_chave: 'chave-de-teste', p_obra: '999', p_quem: 'Nome Digitado' });
  assert.deepEqual(chamadas[1][1], { p_chave: 'chave-de-teste', p_obra: '999', p_quem: 'Nome Digitado', p_papel: 'engenheiro', p_alvo: 'item', p_codigo: '1.1', p_meta: 1, p_teto: null, p_fechar_ate: null, p_motivo: 'abc', p_antes: { meta: 2 } });
  assert.deepEqual(chamadas[2][1], { p_chave: 'chave-de-teste', p_obra: '999', p_quem: 'Nome Digitado', p_papel: 'engenheiro', p_id: 5, p_aprovar: true, p_motivo: null });
  assert.deepEqual(chamadas[3][1], { p_chave: 'chave-de-teste', p_obra: '999', p_quem: 'Nome Digitado', p_id: 6, p_motivo: 'm' });
  const msg = g('metaMsg');
  assert.equal(msg(new Error('DECIDIR META SO COM CHAVE PESSOAL')), 'Decidir meta exige a chave pessoal. Com a chave geral do site ninguém aprova.');
  assert.equal(msg(new Error('QUEM PROPOS NAO DECIDE')), 'Quem propôs não decide a própria proposta.');
  assert.equal(msg(new Error('PAPEL COMPRAS NAO PROPOE META')), 'O papel Compras e suprimentos não propõe meta.');
  assert.match(msg(new Error('Could not find the function public.taf_erp_meta_listar')), /05_meta.sql não aplicado/);
  assert.match(msg(new Error('function public.taf_erp_meta_listar(p_chave => unknown) does not exist')), /05_meta.sql não aplicado/);
  assert.equal(msg(new Error('CHAVE INVALIDA')), 'Chave inválida.');
});

test('Atualizar pela planilha: pela tela a pessoa escreve o motivo, que vai para o histórico e a auditoria', () => {
  const { api, g, S } = novo({}, 'gestao');
  const L = { itens: [{ codigo: '1.1', qtd: 1, meta: 9100, teto: 9900, status: 'Cotado' }], pacotes: [] };
  const d = api.calculaDiff(L); api.ctx.__d = d; vm.runInContext('SYNC=Object.assign(__d,{arquivo:"estudo.json",pedeMotivo:true})', api.ctx);
  api.el('#sy-m').value = ' '; api.limpaMsgs(); api.syncAplicar();
  assert.ok(api.msgs().includes('Escreva o motivo da atualização')); assert.deepEqual(J(S.t.baseOv), {}); assert.equal(S.t.versao, 1);
  api.el('#sy-m').value = 'Estudo revisado com as cotações'; api.syncAplicar();
  perto(S.byCod['1.1'].meta_total, 9100, 'aplicou'); assert.equal(S.t.versao, 2);
  assert.match(J(S.t.hist).at(-1).motivo, /motivo: Estudo revisado com as cotações/);
  assert.ok(J(S.t.aud).some(x => x.campo === 'linha_base' && /estudo\.json · Estudo revisado/.test(x.motivo)));
  assert.equal(typeof g('metaAvisoPlanilha')(d), 'string');
});

test('aviso na planilha: item com meta aprovada pela tela que a planilha mudaria', async () => {
  const { api, g, S } = novo();
  const p = await propoe(api, g, 'item', '1.1', { meta: 9300 }); papel(api, S, 'gestao'); await decide(api, g, p.id, true);
  const d = api.calculaDiff({ itens: [{ codigo: '1.1', qtd: 1, meta: 9000, teto: 9900, status: 'Cotado' }], pacotes: [] });
  assert.match(g('metaAvisoPlanilha')(d), /1 item\(ns\) com meta aprovada pela tela/);
});

test('300 cenários aleatórios: aplicar uma meta aprovada muda só o item (ou pacote) dela e a meta total muda exatamente a diferença', () => {
  const api = carrega('trabalho'), g = n => vm.runInContext(n, api.ctx);
  for (let seed = 1; seed <= 300; seed++) {
    const cen = cenario(seed, seed % 5 === 0 ? { eventos: false } : {});
    const S = abre(api, cen.D, { ...cen.t, par: { ...(cen.t.par || {}), meta_tela: true } }, 'gestao'); api.derive();
    const itens = S.D.items.filter(i => i.meta_total != null);
    if (!itens.length) continue;
    const i = itens[seed % itens.length], antes = Object.fromEntries(S.D.items.map(x => [x.codigo, [x.meta_total, x.teto_total]]));
    const t0 = S.D.items.reduce((s, x) => s + (+x.meta_total || 0), 0), v0 = S.t.versao || 1;
    const nova = Math.round((i.meta_total * (0.5 + (seed % 7) / 10)) * 100) / 100;
    const p = { id: seed, obra: S.D.obra.codigo, alvo: 'item', codigo: i.codigo, meta: nova, teto: seed % 3 ? null : nova + 10, situacao: 'aprovada', ordem: 1, motivo: 'teste', proposto_por: 'A', decidido_por: 'B', origem: 'proposta' };
    const meta0 = i.meta_total;
    const r = J(g('metaAplicaUma')(p, g('metaCampos')(p))); assert.equal(r.ok, true, 'semente ' + seed);
    api.prep(); api.derive();
    perto(S.byCod[i.codigo].meta_total, nova, 'semente ' + seed + ' meta');
    if (p.teto != null) perto(S.byCod[i.codigo].teto_total, p.teto, 'semente ' + seed + ' teto');
    S.D.items.filter(x => x.codigo !== i.codigo).forEach(x => { assert.deepEqual([x.meta_total, x.teto_total], antes[x.codigo], 'semente ' + seed + ' item ' + x.codigo + ' mudou'); });
    perto(S.D.items.reduce((s, x) => s + (+x.meta_total || 0), 0) - t0, nova - meta0, 'semente ' + seed + ' total');
    assert.equal(S.t.versao, v0 + (S.t.frozen ? 1 : 0), 'semente ' + seed + ' versão');
    assert.equal(J(S.t.hist).at(-1).prop, seed);
    assert.deepEqual(J(g('metaParaAplicar')([p], S.t)), [], 'semente ' + seed + ' marcada como aplicada');
  }
});
