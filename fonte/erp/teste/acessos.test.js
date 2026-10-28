'use strict';
/* Item 3: tela Acessos (fonte/erp/js/55_acessos.js), o papel encarregado no planejador (fonte/ciclo-core.js) e o SQL (fonte/erp/sql/06_acessos.sql).
   Sem rede e sem banco: o ERP roda no vm do ambiente.js em modo chave, com um banco de mentira no fetch (respostas fictícias, obra 999).
   O teste do SQL de verdade (06_teste_acessos.sql) roda num Postgres local só quando TAF_PGTEST_DB está definido; sem isso fica de fora. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');
const { carrega, abre, RAIZ } = require('./ambiente');
const { obra999, estado999 } = require('./obra999');

const J = x => JSON.parse(JSON.stringify(x));
const CHAVE_SITE = 'chave-de-teste-do-aparelho';

/* banco de mentira: guarda as chamadas e responde o que o teste mandar */
function bancoFalso() {
  const B = { chamadas: [], resp: {} };
  B.fetch = async (url, op) => {
    const fn = String(url).split('/rpc/')[1], body = JSON.parse(op.body || '{}');
    B.chamadas.push({ fn, body });
    const r = typeof B.resp[fn] === 'function' ? B.resp[fn](body) : B.resp[fn];
    if (r && r.erro) return { ok: false, status: 400, text: async () => JSON.stringify({ code: 'P0001', message: r.erro }) };
    return { ok: true, status: 200, text: async () => JSON.stringify(r === undefined ? null : r) };
  };
  return B;
}
/* ERP em modo chave (como no site), com o fetch do banco de mentira */
function carregaChave(B) {
  const orig = vm.createContext;
  vm.createContext = sb => { sb.TAF_CONFIG = { modo: 'chave', supabaseUrl: 'http://banco.simulado', supabaseKey: 'publica-de-teste' }; sb.fetch = B.fetch; return orig(sb); };
  try { return carrega('trabalho'); } finally { vm.createContext = orig; }
}
const run = (api, js) => vm.runInContext(js, api.ctx);
function entra(api, papel, extra = {}) {
  abre(api, obra999(), estado999(), papel);
  run(api, `CH.chave=${JSON.stringify(CHAVE_SITE)};CH.quem='Diretor Demonstração';CH.fixo=true;CH.leitura=${!!extra.leitura};S.role=${JSON.stringify(papel)};S.view='acessos';S.tab={};AC.dados=null;AC.erro='';AC.pend=0;`);
}
const espera = () => new Promise(r => setImmediate(r));

const OBRAS = [{ codigo: '999', nome: 'OBRA 999 · DEMONSTRAÇÃO', engenheiro: 'Engenheira Demonstração', planejador: true, erp: true },
  { codigo: '998', nome: 'OBRA 998 · DEMONSTRAÇÃO (fictícia)', engenheiro: null, planejador: false, erp: true }];
const LISTA_DIR = {
  ator: { tipo: 'pessoal', nome: 'Diretor Demonstração', papel: 'diretoria', verificado: true, id: 'aaaaaaaaaa' }, partida: false,
  pode_criar: ['diretoria', 'gestor', 'engenheiro', 'encarregado', 'leitura'], obras: OBRAS,
  chaves: [
    { id: 'aaaaaaaaaa', nome: 'Diretor Demonstração', pessoa: 'Diretor Demonstração', papel: 'diretoria', obras: ['998', '999'], ativo: true, criado_em: '2026-10-28T10:00:00Z', criado_por: 'Felipe (chave geral)', sua: true, bloqueio: 'NAO DESATIVE A PROPRIA CHAVE: PECA A OUTRA PESSOA DA DIRETORIA', avisos: [] },
    { id: 'bbbbbbbbbb', nome: '<img src=x onerror=alert(1)>', pessoa: 'Eng "Outro" & Cia', papel: 'engenheiro', obras: ['999'], ativo: true, criado_em: '2026-10-28T11:00:00Z', criado_por: 'Diretor Demonstração', sua: false, bloqueio: null,
      avisos: ['Obra 999: o engenheiro no planejador é Engenheira Demonstração e esta chave está em nome de Eng "Outro" & Cia. <b>x</b>'] },
    { id: 'cccccccccc', nome: 'Encarregado 999', pessoa: 'Encarregado Demonstração', papel: 'encarregado', obras: ['999'], ativo: true, criado_em: '2026-10-28T12:00:00Z', criado_por: null, sua: false, bloqueio: null, avisos: [] },
    { id: 'dddddddddd', nome: 'Antiga', pessoa: 'Pessoa Antiga', papel: 'leitura', obras: ['999'], ativo: false, criado_em: '2026-10-01T12:00:00Z', criado_por: 'Diretor Demonstração', desativado_em: '2026-10-20T12:00:00Z', desativado_por: 'Diretor Demonstração', sua: false, bloqueio: 'CHAVE JA DESATIVADA', avisos: [] }] };

test('a aba Acessos aparece só no site, para Diretoria e Gestão; nunca para engenheiro, encarregado, gerente ou chave de leitura', () => {
  const B = bancoFalso(), api = carregaChave(B);
  const tem = () => J(api.areasVisiveis()).some(a => a.tabs.some(t => t[0] === 'acessos'));
  for (const p of ['diretoria', 'gestao']) { entra(api, p); assert.ok(tem(), p + ' vê'); }
  for (const p of ['engenheiro', 'encarregado', 'gerente', 'compras', 'financeiro', 'adm', 'almox', 'planejamento']) { entra(api, p); assert.ok(!tem(), p + ' não vê'); }
  entra(api, 'gestao', { leitura: true }); assert.ok(!tem(), 'chave de leitura não vê');
  assert.equal(api.vistaPermitida('acessos'), false, 'link direto com chave de leitura não abre Acessos');
  for (const p of ['diretoria', 'gestao']) { entra(api, p); assert.equal(api.vistaPermitida('acessos'), true, 'link direto vale no site para ' + p); }
  /* revisão 2: ?vista=acessos de quem não tem a aba cai na tela padrão, não abre Acessos com o caminho errado */
  for (const p of ['engenheiro', 'encarregado', 'compras']) { entra(api, p); assert.equal(api.vistaPermitida('acessos'), false, 'link direto não vale para ' + p); }
  /* e se mesmo assim a tela for pedida, não chama o banco */
  const B2 = bancoFalso(), api2 = carregaChave(B2); entra(api2, 'encarregado');
  assert.match(String(run(api2, 'viewAcessos()')), /Só a Diretoria e o gestor cuidam dos acessos/); assert.equal(B2.chamadas.length, 0);
  const adm = J(api.AREAS).find(a => a.k === 'adm').tabs.map(t => t[0]);
  assert.deepEqual(adm.slice(0, 3), ['bi', 'admin', 'acessos'], 'logo depois de Administração');
  /* fora do site (modo aberto, demo): nem aba nem link */
  const aberto = carrega('trabalho'); aberto.S.role = 'diretoria';
  assert.ok(!J(aberto.areasVisiveis()).some(a => a.tabs.some(t => t[0] === 'acessos'))); assert.equal(aberto.vistaPermitida('acessos'), false);
});

test('lista: nome, pessoa, papel, obras, situação, criada em e link de entrada; tudo que vem do banco sai escapado', async () => {
  const B = bancoFalso(); B.resp.taf_acesso_listar = LISTA_DIR; const api = carregaChave(B); entra(api, 'diretoria');
  const v = () => String(run(api, 'viewAcessos()'));
  assert.match(v(), /Carregando/); await espera();
  assert.deepEqual(B.chamadas.map(c => c.fn), ['taf_acesso_listar']);
  assert.deepEqual(B.chamadas[0].body, { p_chave: CHAVE_SITE, p_quem: 'Diretor Demonstração' });
  const h = v();
  assert.doesNotMatch(h, /<img src=x/, 'nome com HTML não vira HTML'); assert.match(h, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(h, /Eng &quot;Outro&quot; &amp; Cia/); assert.doesNotMatch(h, /<b>x<\/b>/); assert.match(h, /&lt;b&gt;x&lt;\/b&gt;/);
  assert.match(h, /3 chaves ativas e 1 desativada\. 1 com aviso\./); assert.match(h, /<span class="pill warn">aviso<\/span> Obra 999/);
  assert.match(h, /data-r="Papel"><span class="pill info">Engenheiro<\/span>/); assert.match(h, /Encarregado<\/span>/);
  assert.match(h, /data-r="Obras"><span class="mono">998, 999<\/span>/);
  assert.match(h, /28\/10\/2026<div class="mut" style="font-size:12px">Felipe \(chave geral\)/); assert.match(h, /pelo banco/, 'chave criada por SQL');
  assert.match(h, /data-r="Entra por"><span class="mono">\/marko<\/span>/, 'engenheiro e encarregado: /marko');
  assert.match(h, /data-r="Entra por"><span class="mono">\/erp<\/span> <span class="mono">\/ciclo<\/span>/, 'Diretoria: /erp e /ciclo');
  assert.match(h, /<span class="pill ok">você<\/span>/); assert.match(h, /É a sua chave\./, 'a própria chave não tem botão');
  assert.equal((h.match(/data-act="acs-desativar"/g) || []).length, 2, 'só as que o banco deixa');
  assert.doesNotMatch(h, /Antiga/, 'desativadas escondidas por padrão');
  run(api, "ACOES['acs-desativadas']()"); assert.match(v(), /Antiga[\s\S]*desativada[\s\S]*20\/10\/2026 · Diretor Demonstração/);
  assert.match(h, /Criar acesso<\/button>/);
});

test('partida: com a chave geral e sem Diretoria, só o botão da primeira chave de Diretoria; depois, nada além do aviso', async () => {
  const B = bancoFalso(); const api = carregaChave(B); entra(api, 'gestao'); run(api, 'CH.fixo=false');
  B.resp.taf_acesso_listar = { ator: { tipo: 'geral', nome: 'Felipe', papel: 'chave geral', verificado: false }, partida: true, pode_criar: ['diretoria'], obras: OBRAS, chaves: [] };
  run(api, 'viewAcessos()'); await espera();
  let h = String(run(api, 'viewAcessos()'));
  assert.match(h, /Ainda não existe chave de Diretoria/); assert.match(h, /Criar a primeira chave de Diretoria/); assert.doesNotMatch(h, /ac-i ac-h/);
  run(api, "ACOES['acs-novo']()"); const m = String(api.dom['#mbox'].innerHTML);
  assert.match(m, /Primeira chave de Diretoria/); assert.equal((m.match(/<option /g) || []).length, 1); assert.match(m, /value="diretoria" selected/);
  run(api, "AC.dados=null;AC.erro=''"); B.resp.taf_acesso_listar = { ator: { tipo: 'geral', nome: 'Felipe', papel: 'chave geral' }, partida: false, pode_criar: [], obras: [], chaves: [] };
  run(api, 'viewAcessos()'); await espera(); h = String(run(api, 'viewAcessos()'));
  assert.match(h, /Entre com a sua chave pessoal/); assert.doesNotMatch(h, /data-act="acs-novo"/);
});

test('criar: manda nome, pessoa, papel e obras; a chave aparece uma vez, com copiar, aviso de mensagem direta e link; nada fica guardado', async () => {
  const B = bancoFalso(); B.resp.taf_acesso_listar = LISTA_DIR; const api = carregaChave(B); entra(api, 'diretoria');
  run(api, 'viewAcessos()'); await espera();
  run(api, "ACOES['acs-novo']()"); let m = String(api.dom['#mbox'].innerHTML);
  assert.equal((m.match(/<option /g) || []).length, 5); assert.match(m, /value="engenheiro" selected/, 'padrão: engenheiro');
  assert.match(m, /engenheiro no planejador: Engenheira Demonstração/); assert.match(m, /sem cronograma no planejador/);
  assert.doesNotMatch(m, /class="ac-ob"[^>]*checked/, 'revisão 2: nenhuma obra vem marcada (o padrão é o mínimo)');
  {const caixas = [{ value: '999', checked: false }, { value: '998', checked: false }], qsa = api.ctx.document.querySelectorAll;
   api.ctx.document.querySelectorAll = s => (s === '.ac-ob' ? caixas : s === '.ac-ob:checked' ? caixas.filter(c => c.checked) : []);
   for (const papel of ['diretoria', 'gestor']) (api.ctx.__ouvintes.change || []).forEach(f => f({ target: { id: 'ac-papel', value: papel, classList: { contains: () => false }, closest: () => null, matches: () => false, dataset: {} } }));
   assert.ok(caixas.every(c => !c.checked), 'trocar o papel para Diretoria ou gestor não marca as obras sozinho');
   api.ctx.document.querySelectorAll = qsa;}
  /* campos do formulário (o ambiente devolve o mesmo elemento para o mesmo seletor) */
  api.el('#ac-papel').value = 'engenheiro'; api.el('#ac-pessoa').value = '  Fulano   Teste '; api.el('#ac-nome').value = '';
  api.ctx.document.querySelectorAll = s => (s === '.ac-ob:checked' ? [{ value: '999' }] : []);
  const gid = api.ctx.document.getElementById, box = { innerHTML: '' }, faz = { textContent: '' };
  api.ctx.document.getElementById = id => (id === 'ac-aviso' ? box : id === 'ac-faz' ? faz : id === 'ac-chave' ? null : gid(id));
  run(api, 'acPintaAviso()');
  assert.match(box.innerHTML, /o engenheiro no planejador é <b>Engenheira Demonstração<\/b>/); assert.match(box.innerHTML, /data-act="acs-usar-nome" data-n="Engenheira Demonstração"/);
  assert.match(faz.textContent, /publica/);
  api.el('#ac-pessoa').value = 'Engenheira Demonstração'; run(api, 'acPintaAviso()'); assert.equal(box.innerHTML, '', 'nome igual: sem aviso');
  api.el('#ac-pessoa').value = 'Fulano Teste';
  const CH_TXT = 'fulano-1a2b-3c4d-5e6f-7a8b-9c0d-1e2f';
  B.resp.taf_acesso_criar = { ok: true, id: '1234567890', chave: CH_TXT, nome: 'Fulano Teste', pessoa: 'Fulano Teste', papel: 'engenheiro', obras: ['999'], partida: false,
    avisos: ['Obra 999: o engenheiro no planejador é Engenheira Demonstração e esta chave está em nome de Fulano Teste.'] };
  api.ctx.location.origin = 'https://site.exemplo';
  await run(api, "ACOES['acs-criar-ok']({disabled:false})");
  const c = B.chamadas.find(x => x.fn === 'taf_acesso_criar');
  assert.deepEqual(c.body, { p_chave: CHAVE_SITE, p_quem: 'Diretor Demonstração', p_nome: null, p_pessoa: 'Fulano Teste', p_papel: 'engenheiro', p_obras: ['999'] });
  m = String(api.dom['#mbox'].innerHTML);
  assert.equal(m.split(CH_TXT).length - 1, 1, 'a chave aparece uma vez');
  assert.match(m, /Chave criada: copie agora/); assert.match(m, /É a única vez que esta chave aparece/); assert.match(m, /Mande só por mensagem direta para Fulano Teste/);
  assert.match(m, /data-act="acs-copiar"/); assert.match(m, /data-act="acs-copiar-msg"/); assert.match(m, /https:\/\/site\.exemplo\/marko/);
  assert.match(m, /o engenheiro no planejador é Engenheira Demonstração/, 'aviso do nome também no resultado');
  /* nada guarda a chave: estado do ERP, AC, aparelho */
  assert.ok(!JSON.stringify(run(api, 'AC')).includes(CH_TXT)); assert.ok(!JSON.stringify(run(api, 'S.t')).includes(CH_TXT));
  for (const k of ['taf-erp-chave', 'taf-chave', 'taf-ciclo-chave', 'taf-marko-chave']) assert.ok(!String(api.ctx.localStorage.getItem(k) || '').includes(CH_TXT), k);
  assert.equal(run(api, 'AC.dados'), null, 'a lista recarrega depois');
  /* mensagem pronta e copiar */
  let copiado = ''; api.ctx.navigator.clipboard = { writeText: t => { copiado = t; return Promise.resolve(); } };
  api.el('#ac-chave').value = CH_TXT; api.ctx.document.getElementById = id => (id === 'ac-chave' ? api.el('#ac-chave') : gid(id));
  run(api, "ACOES['acs-copiar']()"); await espera(); assert.equal(copiado, CH_TXT);
  run(api, "ACOES['acs-copiar-msg']()"); await espera();
  assert.match(copiado, /^Olá, Fulano Teste\. Este é o seu acesso ao sistema da TAF \(engenheiro\)\.\nEntre em https:\/\/site\.exemplo\/marko ou https:\/\/site\.exemplo\/erp e digite a chave:\nfulano-1a2b/);
  assert.match(copiado, /não mostre nem mande para ninguém/);
  run(api, "ACOES['acs-fechar-chave']()"); assert.equal(api.el('#ac-chave').value, ''); assert.equal(api.dom['#mbox'].innerHTML, '');
  assert.equal(run(api, 'AC.ult'), null);
});

test('criar: o formulário confere antes de mandar e mostra o recado do banco em português', async () => {
  const B = bancoFalso(); B.resp.taf_acesso_listar = LISTA_DIR; const api = carregaChave(B); entra(api, 'gestao');
  run(api, 'viewAcessos()'); await espera(); run(api, "ACOES['acs-novo']()");
  api.ctx.document.querySelectorAll = () => [];
  api.el('#ac-papel').value = 'engenheiro'; api.el('#ac-pessoa').value = 'Fulano Teste';
  await run(api, "ACOES['acs-criar-ok']({})"); assert.equal(api.el('#ac-msg').textContent, 'Escolha ao menos uma obra.');
  api.el('#ac-pessoa').value = ''; api.ctx.document.querySelectorAll = s => (s === '.ac-ob:checked' ? [{ value: '999' }] : []);
  await run(api, "ACOES['acs-criar-ok']({})"); assert.equal(api.el('#ac-msg').textContent, 'Informe a pessoa.');
  assert.ok(!B.chamadas.some(c => c.fn === 'taf_acesso_criar'), 'nada foi ao banco');
  api.el('#ac-pessoa').value = 'Fulano Teste'; B.resp.taf_acesso_criar = { erro: 'SEM ACESSO A OBRA 998: O GESTOR SO CRIA ACESSO NAS OBRAS DA PROPRIA CHAVE' };
  await run(api, "ACOES['acs-criar-ok']({})"); assert.equal(api.el('#ac-msg').textContent, 'A obra 998 não está na sua chave. Peça à Diretoria que tem todas as obras.');
});

test('recados do banco viram frase de obra', () => {
  const api = carregaChave(bancoFalso()); const m = s => run(api, `acMsg(${JSON.stringify(s)})`);
  assert.equal(m('SEM PERMISSAO: GESTOR NAO CRIA CHAVE DE DIRETORIA'), 'Quem é gestor não cria chave de diretoria.');
  assert.equal(m('A CHAVE GERAL NAO CRIA ACESSO: JA EXISTE CHAVE DE DIRETORIA. ENTRE COM A SUA CHAVE PESSOAL'), 'Já existe chave de Diretoria: a chave geral do site não cria mais acessos. Entre com a sua chave pessoal.');
  assert.equal(m('NA PARTIDA A CHAVE GERAL SO CRIA A PRIMEIRA CHAVE DE DIRETORIA'), 'Com a chave geral do site só dá para criar a primeira chave de Diretoria.');
  assert.equal(m('ULTIMA CHAVE DE DIRETORIA ATIVA: CRIE OUTRA ANTES DE DESATIVAR ESTA'), 'É a última chave de Diretoria ativa. Crie outra antes de desativar esta.');
  assert.equal(m('NAO DESATIVE A PROPRIA CHAVE: PECA A OUTRA PESSOA DA DIRETORIA'), 'Você não desativa a sua própria chave. Peça a outra pessoa da Diretoria.');
  assert.equal(m('JA EXISTE CHAVE ATIVA COM O NOME Fulano: USE OUTRO NOME OU DESATIVE A ANTIGA'), 'Já existe chave ativa com o nome Fulano. Use outro nome ou desative a antiga.');
  assert.equal(m('OBRA 123 NAO EXISTE'), 'A obra 123 não existe no sistema.');
  assert.equal(m('SEM PERMISSAO: SO A DIRETORIA E O GESTOR CUIDAM DOS ACESSOS'), 'Só a Diretoria e o gestor cuidam dos acessos, com a chave pessoal.');
  assert.equal(m('CHAVE INVALIDA'), 'Chave inválida.');
  /* revisão 2 */
  assert.equal(m('SEM ACESSO A OBRA 998: SO CRIA ACESSO NAS OBRAS QUE A SUA CHAVE CUIDA'), 'A obra 998 não está na sua chave. Peça à Diretoria que tem todas as obras.');
  assert.equal(m('OBRA SEM DIRETORIA (997): A PRIMEIRA CHAVE DE DIRETORIA DELA TEM DE TER TAMBEM AS OBRAS 998, 999'),
    'A obra 997 ainda não tem Diretoria. A primeira chave de Diretoria dela tem de ter também as obras 998, 999, para sempre sobrar uma Diretoria com todas.');
  assert.equal(m('SEM OUTRA DIRETORIA COM TODAS AS OBRAS: CRIE ANTES OUTRA CHAVE DE DIRETORIA COM TODAS AS OBRAS'), 'Esta é a única chave de Diretoria com todas as obras. Crie outra com todas as obras antes de desativar esta.');
  assert.equal(m('A PESSOA Diretor Teste JA TEM CHAVE QUE VOCE NAO CUIDA: PECA A DIRETORIA'), 'Diretor Teste já tem chave que você não cuida (de Diretoria, de gestor ou de outra obra). Peça à Diretoria.');
  assert.equal(m('NOME DA CHAVE: USE AO MENOS 2 LETRAS OU NUMEROS'), 'O nome da chave precisa ter ao menos 2 letras ou números.');
  assert.equal(m('NOME DA PESSOA: USE AO MENOS 2 LETRAS OU NUMEROS'), 'O nome da pessoa precisa ter ao menos 2 letras ou números.');
  assert.match(m('Could not find the function public.taf_acesso_listar(p_chave, p_quem) in the schema cache'), /Falta aplicar o 06_acessos\.sql/);
  for (const s of ['NOME DA CHAVE: DE 3 A 60 LETRAS', 'NOME COM SINAL QUE NAO PODE (< > " ` \\ { } |)', 'INFORME A PESSOA', 'CHAVE JA DESATIVADA', 'SEM PERMISSAO: A CHAVE TEM OBRA FORA DAS SUAS'])
    assert.doesNotMatch(m(s), /^[A-Z ]+$/, s + ' vira frase');
});

test('desativar: confirma com motivo, manda o id curto e recarrega; recusa do banco aparece na janela', async () => {
  const B = bancoFalso(); B.resp.taf_acesso_listar = LISTA_DIR; const api = carregaChave(B); entra(api, 'diretoria');
  run(api, 'viewAcessos()'); await espera();
  run(api, "ACOES['acs-desativar']({dataset:{id:'cccccccccc'}})"); const m = String(api.dom['#mbox'].innerHTML);
  assert.match(m, /Desativar a chave Encarregado 999/); assert.match(m, /para de funcionar na hora/); assert.match(m, /data-act="acs-desativar-ok" data-id="cccccccccc"/);
  api.el('#ac-mot').value = 'saiu da obra'; B.resp.taf_acesso_desativar = { ok: true, id: 'cccccccccc' };
  await run(api, "ACOES['acs-desativar-ok']({dataset:{id:'cccccccccc'}})");
  assert.deepEqual(B.chamadas.find(c => c.fn === 'taf_acesso_desativar').body, { p_chave: CHAVE_SITE, p_quem: 'Diretor Demonstração', p_id: 'cccccccccc', p_motivo: 'saiu da obra' });
  assert.ok(api.msgs().includes('Chave desativada.')); assert.equal(run(api, 'AC.dados'), null);
  run(api, 'viewAcessos()'); await espera();
  B.resp.taf_acesso_desativar = { erro: 'ULTIMA CHAVE DE DIRETORIA ATIVA: CRIE OUTRA ANTES DE DESATIVAR ESTA' };
  await run(api, "ACOES['acs-desativar-ok']({dataset:{id:'bbbbbbbbbb'}})");
  assert.equal(api.el('#ac-msg').textContent, 'É a última chave de Diretoria ativa. Crie outra antes de desativar esta.');
});

test('revisão 2: Diretoria limitada vê o aviso das obras dela e as chaves só com as obras em comum; a Diretoria com todas vê a obra nova sem Diretoria', async () => {
  const B = bancoFalso();
  B.resp.taf_acesso_listar = { ator: { tipo: 'pessoal', nome: 'Socio Demonstração', papel: 'diretoria', verificado: true, id: 'eeeeeeeeee', geral: false, obras: ['999'] },
    partida: false, pode_criar: ['diretoria', 'gestor', 'engenheiro', 'encarregado', 'leitura'], sem_diretoria: [], obras: [OBRAS[0]],
    chaves: [{ id: 'aaaaaaaaaa', nome: 'Diretor Demonstração', pessoa: 'Diretor Demonstração', papel: 'diretoria', obras: ['999'], outras_obras: 1, ativo: true,
      criado_em: '2026-10-28T10:00:00Z', criado_por: 'Felipe (chave geral)', sua: false, bloqueio: 'SEM PERMISSAO: A CHAVE TEM OBRA FORA DAS SUAS', avisos: [] },
      { id: 'eeeeeeeeee', nome: 'Socio 999', pessoa: 'Socio Demonstração', papel: 'diretoria', obras: ['999'], outras_obras: 0, ativo: true, criado_em: '2026-10-28T11:00:00Z',
        criado_por: 'Diretor Demonstração', sua: true, bloqueio: 'NAO DESATIVE A PROPRIA CHAVE: PECA A OUTRA PESSOA DA DIRETORIA', avisos: [] }] };
  const api = carregaChave(B); entra(api, 'diretoria'); run(api, 'viewAcessos()'); await espera();
  let h = String(run(api, 'viewAcessos()'));
  assert.match(h, /Sua chave de Diretoria vale só nas obras <b class="mono">999<\/b>/);
  assert.match(h, /data-r="Obras"><span class="mono">999<\/span><div class="mut"[^>]*>\+1 obra fora da sua chave/);
  assert.match(h, /title="Esta chave tem obra que não está na sua\. Peça à Diretoria\.">Tem obra fora da sua chave\./);
  assert.equal((h.match(/data-act="acs-desativar"/g) || []).length, 0);
  assert.doesNotMatch(h, /998/, 'a obra de fora não aparece');
  /* a Diretoria com todas as obras: obra nova sem Diretoria */
  run(api, "AC.dados=null;AC.erro=''");
  B.resp.taf_acesso_listar = { ...LISTA_DIR, ator: { ...LISTA_DIR.ator, geral: true, obras: ['998', '999'] }, sem_diretoria: ['997'] };
  run(api, 'viewAcessos()'); await espera(); h = String(run(api, 'viewAcessos()'));
  assert.match(h, /A obra <b class="mono">997<\/b> ainda não tem chave de Diretoria/); assert.doesNotMatch(h, /vale só nas obras/);
  assert.equal(String(run(api, "acBloqCurto('SEM OUTRA DIRETORIA COM TODAS AS OBRAS: CRIE ANTES OUTRA CHAVE DE DIRETORIA COM TODAS AS OBRAS')")), 'Única Diretoria com todas as obras.');
  /* gestor: só as obras dele */
  run(api, "AC.dados=null;AC.erro=''"); entra(api, 'gestao');
  B.resp.taf_acesso_listar = { ...LISTA_DIR, ator: { tipo: 'pessoal', nome: 'Gestor Teste', papel: 'gestor', verificado: true, id: 'ffffffffff', geral: false, obras: ['999'] }, pode_criar: ['engenheiro', 'encarregado', 'leitura'], chaves: [] };
  run(api, 'viewAcessos()'); await espera(); h = String(run(api, 'viewAcessos()'));
  assert.match(h, /Você cuida dos acessos das obras <b class="mono">999<\/b>/);
});

test('banco sem o 06 aplicado: a tela diz o que falta, sem quebrar', async () => {
  const B = bancoFalso(); B.resp.taf_acesso_listar = { erro: 'Could not find the function public.taf_acesso_listar(p_chave, p_quem) in the schema cache' };
  const api = carregaChave(B); entra(api, 'diretoria'); run(api, 'viewAcessos()'); await espera();
  assert.match(String(run(api, 'viewAcessos()')), /Falta aplicar o 06_acessos\.sql/);
});

/* ---------- planejador: o encarregado só aponta (ciclo-core.js espelha o _taf_ciclo_pode do banco) ---------- */
function cicloCore() {
  const ctx = vm.createContext({ window: { location: { search: '' }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, addEventListener() {} },
    document: { getElementById: () => null, addEventListener() {}, createElement: () => ({}) }, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, console });
  ctx.window.document = ctx.document;
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'fonte', 'ciclo-core.js'), 'utf8'), ctx);
  return ctx.window.CC;
}
function podeDoSql() {
  const s = fs.readFileSync(path.join(RAIZ, 'fonte', 'erp', 'sql', '06_acessos.sql'), 'utf8');
  const f = s.slice(s.indexOf('create or replace function public._taf_ciclo_pode'), s.indexOf('else false end $$', s.indexOf('create or replace function public._taf_ciclo_pode')));
  const out = {}; const re = /when '(\w+)' then p_acao = any\(array\[([^\]]*)\]\)/g; let x;
  while ((x = re.exec(f))) out[x[1]] = x[2].split(',').map(t => t.trim().replace(/'/g, '')).filter(Boolean);
  return out;
}
test('planejador: encarregado aponta o dia e não monta, não publica, não fecha; a tela e o banco dizem a mesma coisa', () => {
  const CC = cicloCore(), SQL = podeDoSql();
  for (const a of ['apont', 'apont_lote', 'apont_apagar']) assert.ok(CC.pode('encarregado', a), a);
  for (const a of ['preparo', 'comp', 'publicar', 'fechar_semana', 'fechar_item', 'replan', 'real', 'demanda', 'acordo', 'simular']) assert.ok(!CC.pode('encarregado', a), a);
  assert.equal(CC.rot('papel', 'encarregado'), 'encarregado');
  assert.deepEqual(Object.keys(SQL).sort(), ['diretoria', 'encarregado', 'engenheiro', 'gestor']);
  for (const p of Object.keys(SQL)) {
    const tela = ['preparo', 'preparo_ok', 'comp', 'comp_tirar', 'comp_cancelar', 'fora', 'publicar', 'apont', 'apont_lote', 'apont_apagar', 'real', 'fechar_item', 'fechar_semana',
      'reabrir', 'replan', 'efeito', 'acordo', 'saldo', 'demanda', 'demanda_resp', 'cobrar', 'impacto'].filter(a => CC.pode(p, a));
    assert.deepEqual(tela.sort(), SQL[p].slice().sort(), 'papel ' + p);
  }
  /* o resto do _taf_ciclo_pode é cópia exata do 02_funcoes.sql */
  const atual = fs.readFileSync(path.join(RAIZ, 'fonte', 'ciclo', 'sql', '02_funcoes.sql'), 'utf8'), novo = fs.readFileSync(path.join(RAIZ, 'fonte', 'erp', 'sql', '06_acessos.sql'), 'utf8');
  const corpo = t => { const i = t.indexOf('create or replace function public._taf_ciclo_pode'); return t.slice(i, t.indexOf('$$;', i) + 3); };
  assert.equal(corpo(novo).split('\n').filter(l => !/-- 06:/.test(l)).join('\n'), corpo(atual));
  /* o Marko deixa de dizer "quem aponta é o engenheiro" para o encarregado */
  assert.match(fs.readFileSync(path.join(RAIZ, 'fonte', 'marko.html'), 'utf8'), /a\.papel==='encarregado'\)\{fx\.hidden=false;fx\.textContent='Você entra como encarregado: aponta o dia/);
});

/* ---------- regras de escrita do SQL ---------- */
test('06_acessos.sql: rascunho, idempotente, security definer com search_path, só três funções abertas ao site, não mexe no que não pode', () => {
  const s = fs.readFileSync(path.join(RAIZ, 'fonte', 'erp', 'sql', '06_acessos.sql'), 'utf8');
  assert.match(s, /RASCUNHO\. NÃO APLICADO\. Só aplicar no banco com o sim do Felipe, depois de testar/);
  assert.match(s, /-- ===+ desfazer/);
  assert.doesNotMatch(s, /^create table (?!if not exists)/m); assert.doesNotMatch(s, /^create function/m);
  for (const f of s.split(/(?=create or replace function)/).slice(1)) {
    const cab = f.slice(0, f.indexOf('$$'));
    if (/security definer/.test(cab)) assert.match(cab, /set search_path = public/, cab.split('\n')[0]);
  }
  const grants = [...s.matchAll(/grant execute on function ([\s\S]*?) to anon, authenticated;/g)].map(m => m[1].replace(/\s+/g, ' '));
  assert.deepEqual(grants, ['public.taf_acesso_listar(text, text), public.taf_acesso_criar(text, text, text, text, text[], text), public.taf_acesso_desativar(text, text, text, text)']);
  for (const nao of ['taf_erp_salvar', '_taf_erp_pode', 'taf_ciclo_ler', 'taf_ciclo_importar', '_taf_ciclo_condicao', '_taf_erp_ator', '_taf_ciclo_ator'])
    assert.doesNotMatch(s, new RegExp('create or replace function public\\.' + nao + '\\('), nao + ' não é redefinida');
  assert.doesNotMatch(s, /sb_(publishable|secret)_|supabase\.co|eyJ[A-Za-z0-9_-]{20,}/, 'sem chave nem endereço');
  /* nenhuma chave de verdade no teste: só textos de teste que nascem e somem na transação */
  const t = fs.readFileSync(path.join(RAIZ, 'fonte', 'erp', 'sql', '06_teste_acessos.sql'), 'utf8');
  assert.match(t, /^begin;/m); assert.match(t, /^rollback;\s*$/m); assert.doesNotMatch(t, /^commit;/m);
});

const DB = process.env.TAF_PGTEST_DB;
test('06_teste_acessos.sql no Postgres local (só com TAF_PGTEST_DB)', { skip: !DB && 'defina TAF_PGTEST_DB=<banco local novo, com o 06 aplicado> para rodar' }, () => {
  const sql = path.join(RAIZ, 'fonte', 'erp', 'sql', '06_teste_acessos.sql');
  const r = cp.spawnSync('psql', ['-h', process.env.TAF_PGTEST_HOST || '/opt/pgtest', '-p', process.env.TAF_PGTEST_PORT || '5433', '-U', 'postgres', '-d', DB, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', sql], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr); assert.match(r.stderr, /NOTICE:\s+06 OK/);
});
