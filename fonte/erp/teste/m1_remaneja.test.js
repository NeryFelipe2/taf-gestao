'use strict';
/* M1 (parte do navegador), remanejamento e Atualizar pela planilha, atrás da chave par.calc_v2 (padrão desligada). */
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { carrega, abre } = require('./ambiente');
const { obra999, estado999 } = require('./obra999');

const api = carrega('trabalho');
const J = x => JSON.parse(JSON.stringify(x));   /* tira o prototype de outro contexto do vm */
const perto = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.005, `${msg}: ${a} x ${b}`);
const comSync = (d, extra) => { api.ctx.__d = d; api.ctx.__x = extra; vm.runInContext('SYNC=Object.assign(__d,__x)', api.ctx); };

/* ---------- remanejamento acerta meta_unit; planilha lista os remanejados ---------- */
function remaneja(par) {
  const D = obra999(); D.eap.filter(e => e.tipo_linha === 'item').forEach(i => { i.qtd = 10; i.meta_unit = i.meta_total / 10; });
  const S = abre(api, D, { ...estado999(par) }, 'gerente'); api.derive();
  api.el('#rm-de').value = '3.4'; api.el('#rm-para').value = '3.1'; api.el('#rm-v').value = '1000'; api.el('#rm-m').value = 'teste'; api.el('#rm-msg');
  api.doRemanejar();
  return S;
}
test('remanejar com a chave LIGADA: meta_unit acompanha (meta ÷ quantidade) e a auditoria guarda o antes e o depois', () => {
  const S = remaneja({ calc_v2: true });
  perto(S.byCod['3.4'].meta_total, 3000, 'meta 3.4'); perto(S.byCod['3.4'].meta_unit, 300, 'meta_unit 3.4'); perto(S.byCod['3.1'].meta_unit, 800, 'meta_unit 3.1');
  const au = J(S.t.aud).filter(a => a.campo === 'meta_unit');
  assert.equal(au.length, 2); assert.ok(au.some(a => a.ref === '3.4' && a.antes === '400' && a.depois === '300'));
  /* desligar a chave devolve o meta_unit da carga (nada foi regravado) */
  S.t.par.calc_v2 = false; api.prep(); perto(S.byCod['3.4'].meta_unit, 400, 'meta_unit volta ao da carga'); perto(S.byCod['3.1'].meta_unit, 700, 'meta_unit 3.1 volta');
});
test('remanejar com a chave DESLIGADA: meta_unit fica parado, como hoje', () => {
  const S = remaneja({});
  perto(S.byCod['3.4'].meta_total, 3000, 'meta 3.4'); perto(S.byCod['3.4'].meta_unit, 400, 'meta_unit 3.4 não muda'); perto(S.byCod['3.1'].meta_unit, 700, 'meta_unit 3.1 não muda');
  assert.equal(J(S.t.aud).filter(a => a.campo === 'meta_unit').length, 0);
});

const planilha = () => ({ itens: [{ codigo: '3.4', qtd: 10, meta: 4200, teto: 4400, status: 'Cotado' }, { codigo: '1.1', qtd: 10, meta: 9500, teto: 9900, status: 'Cotado' }, { codigo: '3.1', qtd: 10, meta: 7000, teto: 7000, status: 'Cotado' }], pacotes: [] });
test('Atualizar pela planilha com a chave LIGADA: lista os itens com remanejamento e deixa escolher qual meta vale', () => {
  const S = remaneja({ calc_v2: true }); S.role = 'gestao';   /* remanejar é do Gerente; atualizar pela planilha é da Gestão */
  const d = api.calculaDiff(planilha()); const rm = J(d.info.remanejados);
  assert.deepEqual(rm.map(x => x.codigo).sort(), ['3.1', '3.4']);
  const x34 = rm.find(x => x.codigo === '3.4'); perto(x34.metaAtual, 3000, 'meta atual (remanejada)'); perto(x34.metaPlanilha, 4200, 'meta da planilha'); perto(x34.metaBase, 4000, 'meta sem remanejamento');
  /* o gestor escolhe a meta da planilha só no 3.4 */
  comSync(d, { arquivo: 'teste.json', usar: { '3.4': 1 } });
  api.syncAplicar();
  perto(S.byCod['3.4'].meta_total, 4200, '3.4 passa a valer a planilha'); assert.equal(S.t.metaOv['3.4'], undefined);
  perto(S.byCod['3.1'].meta_total, 8000, '3.1 continua remanejado'); assert.equal(S.t.metaOv['3.1'], 8000);
  perto(S.byCod['3.4'].meta_unit, 420, 'meta_unit acompanha');
  assert.ok(J(S.t.aud).some(a => a.ref === '3.4' && /planilha vale no lugar do remanejamento/.test(a.motivo)));
  assert.match(S.t.hist[S.t.hist.length - 1].motivo, /1 remanejamento\(s\) trocado\(s\)/);
});
test('Atualizar pela planilha com a chave LIGADA e nenhuma escolha: o remanejamento continua valendo (como hoje)', () => {
  const S = remaneja({ calc_v2: true }); S.role = 'gestao';
  const d = api.calculaDiff(planilha()); comSync(d, { arquivo: 'teste.json' });
  api.syncAplicar();
  perto(S.byCod['3.4'].meta_total, 3000, 'continua remanejado'); assert.equal(S.t.metaOv['3.4'], 3000);
});
test('Atualizar pela planilha com a chave DESLIGADA: não existe a lista de remanejados', () => {
  remaneja({}); const d = api.calculaDiff(planilha());
  assert.equal(d.info.remanejados, undefined);
});

/* ---------- a chave sozinha: Parâmetros liga e desliga sem tocar na alçada ---------- */
test('Parâmetros: "Salvar só as chaves" liga a chave, registra na auditoria e não marca a alçada como definida', () => {
  const S = abre(api, obra999(), estado999(), 'gestao'); api.derive();
  assert.equal(!!S.t.par.calc_v2, false, 'padrão desligada');
  api.el('#ch-calc_v2').checked = true;
  api.ACOES['chaves-ok']();
  assert.equal(S.t.par.calc_v2, true); assert.equal(S.t.par.alcadaOk, undefined);
  const a = J(S.t.aud).find(x => x.campo === 'calc_v2'); assert.ok(a); assert.equal(a.antes, 'desligada'); assert.equal(a.depois, 'ligada');
  api.el('#ch-calc_v2').checked = false; api.ACOES['chaves-ok'](); assert.equal(S.t.par.calc_v2, false);
});
test('Parâmetros: quem não é da Diretoria ou da Gestão não mexe nas chaves', () => {
  const S = abre(api, obra999(), estado999(), 'engenheiro');
  api.el('#ch-calc_v2').checked = true; api.ACOES['chaves-ok'](); assert.notEqual(S.t.par.calc_v2, true);
});
