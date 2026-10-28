'use strict';
/* Tela "Resumo para o diretor" (56_resumo.js), sem navegador, sem rede e sem banco: o fetch é simulado.
   Confere: só aparece com a chave do site (modo chave), lugar no menu, quem vê, texto do banco escapado,
   a prévia chama o /api/resumo do site com a chave no cabeçalho e não manda nada, cadastro com as obras certas. */
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { carrega, abre } = require('./ambiente');
const { obra999, estado999 } = require('./obra999');

const URL_BANCO = 'https://projeto-de-teste.supabase.co';
const J = (x) => JSON.parse(JSON.stringify(x));

/* o ERP no modo chave (o mesmo do site): o ambiente cria o contexto com TAF_CONFIG vazio; aqui troca na hora de criar */
function carregaModoChave() {
  const orig = vm.createContext;
  vm.createContext = (sb) => { sb.TAF_CONFIG = { modo: 'chave', supabaseUrl: URL_BANCO, supabaseKey: 'publicavel-de-teste', marca: 'TAF' }; return orig(sb); };
  try { return carrega(); } finally { vm.createContext = orig; }
}

/* fetch de mentira: guarda as chamadas e responde pelo caminho */
function rede(api, respostas) {
  const chamadas = [];
  api.ctx.fetch = async (url, opts) => {
    chamadas.push({ url: String(url), opts, corpo: opts && opts.body ? JSON.parse(opts.body) : null });
    const chave = String(url).startsWith(URL_BANCO) ? String(url).split('/rpc/')[1] : String(url);
    const [status, corpo] = typeof respostas[chave] === 'function' ? respostas[chave](chamadas[chamadas.length - 1].corpo) : (respostas[chave] || [404, null]);
    const txt = corpo === null ? '' : JSON.stringify(corpo);
    return { status, ok: status >= 200 && status < 300, text: async () => txt, json: async () => JSON.parse(txt) };
  };
  return chamadas;
}
const espera = () => new Promise((r) => setImmediate(r));
const run = (api, js) => vm.runInContext(js, api.ctx);

const DEST = {
  quem: 'Diretor Teste', papel: 'diretoria', cobre_todas: true,
  obras: [{ obra: '998', nome: 'OBRA 998 · VAZIA (fictícia)' }, { obra: '999', nome: 'OBRA 999 · DEMONSTRAÇÃO' }],
  robo: { criado_em: '2026-10-28T09:00:00Z', criado_por: 'Diretor Teste' },
  destinatarios: [
    { id: 1, nome: 'Diretor Teste', email: 'diretor.teste@example.com', obras: null, todas: true, frequencia: 'diaria', ativo: true, meu: true, cadastrado_por: 'Diretor Teste',
      ultimo: { quando: 'diario', dia: '2026-10-28', estado: 'enviado', erro: null } },
    { id: 7, nome: '<img src=x onerror=alert(1)>', email: 'x"><script>@example.com', obras: ['999'], todas: false, frequencia: 'semanal', ativo: true, meu: false, cadastrado_por: 'Gestor <b>',
      ultimo: { quando: 'semanal', dia: '2026-10-26', estado: 'erro', erro: 'Resend respondeu 422 <x>' } },
    { id: 8, nome: 'Pessoa Desativada', email: 'pessoa@example.com', obras: ['999'], todas: false, frequencia: 'diaria', ativo: false, meu: false, cadastrado_por: 'Diretor Teste', ultimo: null },
  ],
};

test('modo aberto (sem a chave do site): a tela não entra no menu', () => {
  const api = carrega();
  assert.ok(!J(api.AREAS).find((a) => a.k === 'adm').tabs.some((t) => t[0] === 'resumo'));
  assert.ok(!J(api.NAV_BASE).some((n) => n[0] === 'resumo'));
  assert.equal(api.vistaPermitida('resumo'), false);
});

test('modo chave: "Resumo para o diretor" fica em Gestão e administração, logo depois de Administração, e só para quem vê Administração ou tudo', () => {
  const api = carregaModoChave();
  abre(api, obra999(), estado999(), 'diretoria');
  const adm = J(api.AREAS).find((a) => a.k === 'adm');
  const i = adm.tabs.findIndex((t) => t[0] === 'admin');
  assert.deepEqual(adm.tabs[i + 1], ['resumo', 'Resumo para o diretor']);
  assert.equal(J(api.NAV_BASE).filter((n) => n[0] === 'resumo').length, 1);
  assert.equal(api.vistaPermitida('resumo'), true);
  for (const p of ['diretoria', 'gestao', 'gerente', 'engenheiro', 'admin']) { api.S.role = p; assert.equal(api.tabVisivel('resumo'), true, p); }
  for (const p of ['financeiro', 'encarregado', 'adm', 'compras', 'almox', 'planejamento']) { api.S.role = p; assert.equal(api.tabVisivel('resumo'), false, p); }
});

test('a lista escapa tudo que vem do banco e mostra situação e último envio', async () => {
  const api = carregaModoChave();
  abre(api, obra999(), estado999(), 'diretoria');
  run(api, "CH.chave='chave-de-teste'");
  const chamadas = rede(api, { taf_resumo_destinatarios: [200, DEST] });
  run(api, 'viewResumo()');   // primeira abertura: pede a lista ao banco
  await espera(); await espera();
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].url, URL_BANCO + '/rest/v1/rpc/taf_resumo_destinatarios');
  assert.deepEqual(chamadas[0].corpo, { p_chave: 'chave-de-teste' });
  const h = run(api, 'viewResumo()');
  assert.equal(chamadas.length, 1, 'não pede de novo a cada desenho da tela');
  assert.ok(!h.includes('<img src=x') && h.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!h.includes('"><script>') && h.includes('x&quot;&gt;&lt;script&gt;@example.com'));
  assert.ok(!h.includes('Gestor <b>') && !h.includes('422 <x>'));
  assert.match(h, /<span class="pill info">seu e-mail<\/span>/);
  assert.match(h, /<td>Todas<\/td>/);
  assert.match(h, /pill ok">enviado/);
  assert.match(h, /pill bad"[^>]*>não saiu/);
  assert.match(h, /pill mute">desativado/);
  assert.match(h, /data-act="rd-reativar" data-id="8"/);
  assert.match(h, /Novo destinatário/);
  assert.match(h, /Robô do envio[\s\S]*Trocar a chave do robô/);
  assert.match(h, /CRON_SECRET, RESEND_API_KEY, RESUMO_REMETENTE e TAF_CHAVE_RESUMO/);
  assert.ok(!/[–—]/.test(h), 'travessão na tela');
});

test('quem não é Diretoria nem gestor: vê o aviso, sem cadastro e sem robô; a prévia continua', async () => {
  const api = carregaModoChave();
  abre(api, obra999(), estado999(), 'engenheiro');
  run(api, "CH.chave='chave-do-engenheiro'");
  rede(api, { taf_resumo_destinatarios: [400, { code: 'P0001', message: 'SO DIRETORIA OU GESTOR' }] });
  run(api, 'viewResumo()');
  await espera(); await espera();
  const h = run(api, 'viewResumo()');
  assert.match(h, /Só a Diretoria ou o gestor, com a chave pessoal, cadastram quem recebe/);
  assert.ok(!h.includes('Novo destinatário') && !h.includes('Robô do envio'));
  assert.match(h, /data-act="rd-previa"/);
  assert.ok(!h.includes('data-act="rd-mandar"'), 'sem e-mail ligado à chave, não mostra "Mandar agora para mim"');
});

test('Ver prévia: chama o /api/resumo do site com a chave no cabeçalho, mostra o texto escapado e não manda nada', async () => {
  const api = carregaModoChave();
  abre(api, obra999(), estado999(), 'diretoria');
  run(api, "CH.chave='chave-de-teste';RD.carregado=true;RD.dados=" + JSON.stringify(DEST));
  const chamadas = rede(api, { '/api/resumo': (c) => [200, { ok: true, assunto: 'Resumo TAF 28/10: 999 em vermelho', texto: 'Resumo TAF\n<b>OBRA 999</b>: VERMELHO',
    whatsapp: '*Resumo TAF*', obras: c.destinatario ? ['999'] : ['998', '999'], meus: [{ destinatario: 1, email: 'd***@example.com' }] }] });
  await api.ACOES['rd-previa']({ dataset: {} });
  assert.equal(chamadas.length, 1);
  const c = chamadas[0];
  assert.equal(c.url, '/api/resumo', 'a prévia vai ao site, nunca direto ao banco');
  assert.equal(c.opts.method, 'POST');
  assert.equal(c.opts.headers['x-chave'], 'chave-de-teste');
  assert.deepEqual(c.corpo, { acao: 'previa' });
  const h = run(api, 'viewResumo()');
  assert.match(h, /<pre id="rd-texto"[^>]*>Resumo TAF\n&lt;b&gt;OBRA 999&lt;\/b&gt;: VERMELHO<\/pre>/);
  assert.match(h, /Copiar para WhatsApp/);
  assert.match(h, /"Mandar agora para mim" vai para diretor\.teste@example\.com, com as obras do cadastro de cada e-mail\./);
  // de um destinatário
  await api.ACOES['rd-previa']({ dataset: { id: '7' } });
  assert.deepEqual(chamadas[1].corpo, { acao: 'previa', destinatario: 7 });
  assert.match(run(api, 'viewResumo()'), /O que &lt;img src=x onerror=alert\(1\)&gt; recebe \(999\)/);
});

test('Ver prévia sem o endpoint publicado ou com recusa: a mensagem aparece na tela', async () => {
  const api = carregaModoChave();
  abre(api, obra999(), estado999(), 'diretoria');
  run(api, "CH.chave='chave-geral';RD.carregado=true");
  rede(api, {});
  await api.ACOES['rd-previa']({ dataset: {} });
  assert.match(run(api, 'viewResumo()'), /O envio automático ainda não está publicado neste site\./);
  rede(api, { '/api/resumo': [403, { ok: false, erro: 'use a sua chave pessoal: a chave geral do site não serve aqui' }] });
  await api.ACOES['rd-previa']({ dataset: {} });
  assert.match(run(api, 'viewResumo()'), /Use a sua chave pessoal: a chave geral do site não serve aqui\./);
});

test('Mandar agora para mim: pede "mandar" ao site e avisa para onde foi', async () => {
  const api = carregaModoChave();
  abre(api, obra999(), estado999(), 'diretoria');
  run(api, "CH.chave='chave-de-teste';RD.carregado=true;RD.dados=" + JSON.stringify(DEST));
  const chamadas = rede(api, { '/api/resumo': [200, { ok: true, enviados: 1, falhas: 0, para: ['d***@example.com'] }], taf_resumo_destinatarios: [200, DEST] });
  api.limpaMsgs();
  await api.ACOES['rd-mandar']();
  assert.deepEqual(chamadas[0].corpo, { acao: 'mandar' });
  assert.ok(api.msgs().includes('Mandado para d***@example.com.'));
});

test('cadastro: confere antes de gravar e manda as obras certas ao banco (null = todas)', async () => {
  const api = carregaModoChave();
  abre(api, obra999(), estado999(), 'diretoria');
  run(api, "CH.chave='chave-de-teste';RD.carregado=true;RD.dados=" + JSON.stringify(DEST));
  const chamadas = rede(api, { taf_resumo_destinatario_salvar: [200, DEST.destinatarios[0]], taf_resumo_destinatarios: [200, DEST] });
  const campo = (id, v) => { api.el(id).value = v; };
  const marca = (id, v) => { api.el(id).checked = v; };
  campo('#rd-n', 'Diretor Teste'); campo('#rd-e', 'nao-e-email'); campo('#rd-f', 'diaria'); marca('#rd-todas', true); marca('#rd-meu', true);
  await api.ACOES['rd-salvar']({ dataset: { id: '' } });
  assert.equal(chamadas.length, 0, 'e-mail errado não vai ao banco');
  assert.match(api.el('#rd-msg').textContent, /E-mail fora do formato/);
  campo('#rd-e', ' Diretor.Teste@Example.com ');
  await api.ACOES['rd-salvar']({ dataset: { id: '' } });
  await espera();
  const s = chamadas.find((c) => c.url.endsWith('/taf_resumo_destinatario_salvar'));
  assert.deepEqual(s.corpo, { p_chave: 'chave-de-teste', p_id: null, p_nome: 'Diretor Teste', p_email: 'diretor.teste@example.com', p_obras: null, p_frequencia: 'diaria', p_meu: true });
  // obras marcadas uma a uma
  marca('#rd-todas', false);
  const qsa = api.ctx.document.querySelectorAll;
  api.ctx.document.querySelectorAll = (sel) => (sel === '.rd-o:checked' ? [{ value: '999' }] : []);
  try { await api.ACOES['rd-salvar']({ dataset: { id: '7' } }); } finally { api.ctx.document.querySelectorAll = qsa; }
  const s2 = chamadas.filter((c) => c.url.endsWith('/taf_resumo_destinatario_salvar'))[1];
  assert.equal(s2.corpo.p_id, 7);
  assert.deepEqual(s2.corpo.p_obras, ['999']);
  // nenhuma obra marcada: não grava
  const antes = chamadas.length;
  await api.ACOES['rd-salvar']({ dataset: { id: '' } });
  assert.equal(chamadas.length, antes);
  assert.match(api.el('#rd-msg').textContent, /Marque pelo menos uma obra/);
});

/* cadastro com dono: só o dono ou a Diretoria mexem; os botões de cadastro seguem can('resumo'); quem ficou sem receber aparece */
function destComDono(papel) {
  const D = J(DEST);
  D.papel = papel;
  D.destinatarios.push({ id: 9, nome: 'Diretora <i>Dois</i>', email: 'diretora.dois@example.com', obras: ['999'], todas: false, frequencia: 'diaria', ativo: true,
    meu: false, tem_dono: true, falhou: true, cadastrado_por: 'Diretora Dois', ultimo: { quando: 'diario', dia: '2026-10-28', estado: 'erro', erro: 'Resend respondeu 503' } });
  return D;
}
const linha = (h, id) => (h.split('<tr>').find((x) => x.includes('data-id="' + id + '"')) || '');

test('gestor: no e-mail de outra pessoa (com dono) só a prévia; Editar e Desativar não aparecem e não abrem', () => {
  const api = carregaModoChave();
  abre(api, obra999(), estado999(), 'gestao');
  run(api, "CH.chave='chave-do-gestor';RD.carregado=true;RD.dados=" + JSON.stringify(destComDono('gestao')));
  const h = run(api, 'viewResumo()');
  const l9 = linha(h, 9);
  assert.match(l9, /data-act="rd-previa" data-id="9"/);
  assert.ok(!/rd-editar|rd-desativar/.test(l9), 'botão de mexer no e-mail de outra pessoa');
  assert.match(l9, /e-mail de outra pessoa: só ela ou a Diretoria mexem/);
  assert.match(linha(h, 7), /data-act="rd-editar" data-id="7"/, 'cadastro sem dono o gestor mexe');
  api.limpaMsgs();
  api.ACOES['rd-editar']({ dataset: { id: '9' } });
  assert.ok(api.msgs().some((x) => /só ela ou a Diretoria mexem/.test(x)));
  assert.ok(!/Editar destinatário/.test(api.el('#mbox').innerHTML || ''), 'abriu o formulário');
});

test('Diretoria: mexe no e-mail de outra pessoa e o formulário avisa que trocar o e-mail tira o dono', () => {
  const api = carregaModoChave();
  abre(api, obra999(), estado999(), 'diretoria');
  run(api, "CH.chave='chave-de-teste';RD.carregado=true;RD.dados=" + JSON.stringify(destComDono('diretoria')));
  const h = run(api, 'viewResumo()');
  assert.match(linha(h, 9), /data-act="rd-editar" data-id="9"[\s\S]*data-act="rd-desativar" data-id="9"/);
  api.ACOES['rd-editar']({ dataset: { id: '9' } });
  assert.match(api.el('#mbox').innerHTML, /Editar destinatário[\s\S]*Se você trocar o e-mail, ele deixa de ser dela/);
});

test('quem ficou sem o último resumo aparece em aviso no alto da lista, escapado', () => {
  const api = carregaModoChave();
  abre(api, obra999(), estado999(), 'diretoria');
  run(api, "CH.chave='chave-de-teste';RD.carregado=true;RD.dados=" + JSON.stringify(destComDono('diretoria')));
  const h = run(api, 'viewResumo()');
  assert.match(h, /<div class="alert"[\s\S]*1 pessoa ficou sem o último resumo[\s\S]*Diretora &lt;i&gt;Dois&lt;\/i&gt;\. O site tenta de novo na repescagem/);
  assert.ok(h.indexOf('class="alert"') < h.indexOf('<table'), 'o aviso vem antes da tabela');
  assert.match(linha(h, 9), /pill bad">ficou sem/);
  run(api, 'RD.dados.destinatarios.forEach(d=>{d.falhou=false})');
  assert.ok(!run(api, 'viewResumo()').includes('sem o último resumo'));
});

test("botões de cadastro seguem can('resumo'): papel sem cadastro não vê Novo, Editar nem Robô", () => {
  const api = carregaModoChave();
  abre(api, obra999(), estado999(), 'diretoria');
  run(api, "CH.chave='chave-de-teste';RD.carregado=true;RD.dados=" + JSON.stringify(DEST));
  assert.equal(run(api, "can('resumo')"), true);
  assert.match(run(api, 'viewResumo()'), /Novo destinatário/);
  run(api, "S.role='engenheiro'");
  assert.equal(run(api, "can('resumo')"), false);
  const h = run(api, 'viewResumo()');
  assert.ok(!/Novo destinatário|rd-editar|rd-desativar|rd-reativar|Robô do envio/.test(h));
  assert.match(h, /data-act="rd-previa" data-id="1"/, 'a prévia continua');
});

test('mensagens do banco viram texto de obra', () => {
  const api = carregaModoChave();
  const m = (t) => run(api, 'rdMsg(' + JSON.stringify(t) + ')');
  assert.match(m('USE SUA CHAVE PESSOAL'), /chave geral do site/);
  assert.equal(m('ESTE E-MAIL JA RECEBE O RESUMO SEMANAL'), 'Este e-mail já recebe o resumo semanal.');
  assert.equal(m('SEM ACESSO A OBRA 998'), 'Sua chave não abre a obra 998.');
  assert.equal(m('ESCOLHA AS OBRAS: SUA CHAVE NAO TEM TODAS'), 'Sua chave não tem todas as obras: marque as obras.');
  assert.equal(m('SO O DONO OU A DIRETORIA MEXE NESTE DESTINATARIO'), 'Este e-mail é de outra pessoa da lista: só ela ou a Diretoria mexem.');
});
