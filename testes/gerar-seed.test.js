'use strict';
// Script local fonte/gerar-seed.js + ponta a ponta (script -> HTTP real em 127.0.0.1 -> endpoint -> Supabase simulado).
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const cp = require('child_process');
const handler = require('../public/api/leitura.js');
const gs = require('../fonte/gerar-seed.js');
const { BASE, ANON, novaChave, snapFalso, criarBancoFalso } = require('./_apoio.js');

const RAIZ = path.join(__dirname, '..');
const PUBLICO = path.join(RAIZ, 'public');

function listar(dir) { return fs.readdirSync(dir, { recursive: true }).map(String).sort(); }

describe('gerar-seed.js: argumentos e destino', () => {
  it('não aceita a chave na linha de comando', () => {
    for (const t of ['--chave', '--chave=abc', '--k', '--key=abc', '--token', '--senha']) {
      assert.throws(() => gs.lerArgs(['x.json', t, 'abc'], {}), /TAF_CHAVE/, t);
    }
  });
  it('recusa opção desconhecida e argumento a mais', () => {
    assert.throws(() => gs.lerArgs(['a.json', '--foo'], {}), /desconhecida/);
    assert.throws(() => gs.lerArgs(['a.json', 'b.json'], {}), /a mais/);
  });
  it('--salvar sem nome usa leitura-local.json na raiz; com nome usa o nome', () => {
    assert.equal(gs.lerArgs(['a.json', '--salvar'], {}).salvar, path.join(RAIZ, 'leitura-local.json'));
    assert.equal(gs.lerArgs(['a.json', '--salvar', 'x.json', '--enviar'], {}).salvar, 'x.json');
  });
  it('endereço vem de --url, de TAF_URL ou do padrão https', () => {
    assert.match(gs.lerArgs(['a.json'], {}).url, /^https:\/\/.+\/api\/leitura$/);
    assert.equal(gs.lerArgs(['a.json'], { TAF_URL: 'https://x.test/api/leitura' }).url, 'https://x.test/api/leitura');
    assert.equal(gs.lerArgs(['a.json', '--url', 'https://y.test/api/leitura'], { TAF_URL: 'https://x.test/api/leitura' }).url, 'https://y.test/api/leitura');
  });
  it('não grava dentro de public/', () => {
    assert.equal(gs.destinoSalvarOk(path.join(PUBLICO, 'api', 'seed.js')), false);
    assert.equal(gs.destinoSalvarOk(path.join(PUBLICO, 'x.json')), false);
    assert.equal(gs.destinoSalvarOk(path.join(RAIZ, 'leitura-local.json')), true);
    assert.equal(gs.destinoSalvarOk(path.join(os.tmpdir(), 'x.json')), true);
  });
  it('só envia a chave por https (http só para localhost) e sem ?parâmetro ou usuário:senha', () => {
    assert.throws(() => gs.conferirDestino('http://exemplo.test/api/leitura', 'c'), /https/);
    assert.throws(() => gs.conferirDestino('https://exemplo.test/api/leitura?k=c', 'c'), /parâmetros/);
    assert.throws(() => gs.conferirDestino('https://u:s@exemplo.test/api/leitura', 'c'), /parâmetros|usuário/);
    assert.throws(() => gs.conferirDestino('não é endereço', 'c'), /inválido/);
    assert.throws(() => gs.conferirDestino('https://exemplo.test/api/leitura', ''), /TAF_CHAVE/);
    assert.throws(() => gs.conferirDestino('https://exemplo.test/api/leitura', undefined), /TAF_CHAVE/);
    assert.ok(gs.conferirDestino('https://exemplo.test/api/leitura', 'c'));
    assert.ok(gs.conferirDestino('http://127.0.0.1:3000/api/leitura', 'c'));
    assert.ok(gs.conferirDestino('http://localhost:3000/api/leitura', 'c'));
  });
});

describe('gerar-seed.js: enviar() com fetch simulado', () => {
  it('manda POST com a chave só no cabeçalho x-chave, sem redirecionamento, corpo sem chave e URL sem chave', async () => {
    const chave = novaChave();
    let visto;
    const fetchFalso = async (url, opts) => { visto = { url: String(url), opts }; return new Response(JSON.stringify({ ok: true, id: 9 }), { status: 200 }); };
    const r = await gs.enviar({ snap: snapFalso(), fonte: 'f', quem: 'q', url: 'https://exemplo.test/api/leitura', chave, fetchImpl: fetchFalso });
    assert.equal(r.ok, true);
    assert.equal(visto.opts.method, 'POST');
    assert.equal(visto.opts.redirect, 'error');
    assert.equal(visto.opts.headers['x-chave'], chave);
    assert.ok(!visto.url.includes(chave));
    assert.ok(!visto.opts.body.includes(chave));
    assert.deepEqual(Object.keys(JSON.parse(visto.opts.body)).sort(), ['fonte', 'quem', 'snap']);
  });
  it('sem chave não chama a rede', async () => {
    let chamou = false;
    await assert.rejects(gs.enviar({ snap: {}, fonte: 'f', quem: 'q', url: 'https://exemplo.test/api/leitura', chave: '', fetchImpl: async () => { chamou = true; } }), /TAF_CHAVE/);
    assert.equal(chamou, false);
  });
});

describe('gerar-seed.js: linha de comando e ponta a ponta', () => {
  let tmp, arq, chave, banco, fetchOriginal, envOriginal, servidor, porta, saida, logsOriginais;

  beforeEach(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'taf-teste-'));
    arq = path.join(tmp, 'leitura-de-teste.json');
    fs.writeFileSync(arq, JSON.stringify({ fonte: 'teste (corte 2000-01-01)', snap: snapFalso() }));
    chave = novaChave();
    banco = criarBancoFalso(chave);
    fetchOriginal = globalThis.fetch;
    // o Supabase simulado atende o endereço do banco; qualquer outro endereço (o servidor local) usa o fetch de verdade
    globalThis.fetch = (url, opts) => (String(url).startsWith(BASE) ? banco.fetch(url, opts) : fetchOriginal(url, opts));
    envOriginal = { u: process.env.TAF_SUPABASE_URL, k: process.env.TAF_SUPABASE_KEY };
    process.env.TAF_SUPABASE_URL = BASE;
    process.env.TAF_SUPABASE_KEY = ANON;
    servidor = http.createServer((req, res) => { handler(req, res); });
    await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
    porta = servidor.address().port;
    saida = [];
    logsOriginais = {};
    for (const n of ['log', 'error']) { logsOriginais[n] = console[n]; console[n] = (...a) => saida.push(a.map(String).join(' ')); }
  });

  afterEach(async () => {
    for (const n of Object.keys(logsOriginais)) console[n] = logsOriginais[n];
    globalThis.fetch = fetchOriginal;
    for (const [k, v] of [['TAF_SUPABASE_URL', envOriginal.u], ['TAF_SUPABASE_KEY', envOriginal.k]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    servidor.closeAllConnections();
    await new Promise((ok) => servidor.close(ok));
    fs.rmSync(tmp, { recursive: true, force: true });
    assert.ok(!saida.join('\n').includes(chave), 'a chave apareceu na saída do script');
  });

  const url = () => 'http://127.0.0.1:' + porta + '/api/leitura';

  it('sem --salvar nem --enviar: só confere, não grava arquivo nem envia', async () => {
    const antes = listar(PUBLICO), tmpAntes = listar(tmp);
    const c = await gs.principal([arq], { TAF_CHAVE: chave });
    assert.equal(c, 0);
    assert.match(saida.join('\n'), /só conferi/);
    assert.deepEqual(listar(PUBLICO), antes, 'public/ mudou');
    assert.deepEqual(listar(tmp), tmpAntes);
    assert.equal(banco.chamadas.length, 0);
  });

  it('--salvar grava JSON local fora de public/ e o conteúdo é a leitura', async () => {
    const dest = path.join(tmp, 'saida.json');
    const antes = listar(PUBLICO);
    assert.equal(await gs.principal([arq, '--salvar', dest], {}), 0);
    const o = JSON.parse(fs.readFileSync(dest, 'utf8'));
    assert.deepEqual(o.snap, snapFalso());
    assert.deepEqual(listar(PUBLICO), antes);
  });

  it('--salvar para dentro de public/ é recusado e nada é criado', async () => {
    const dest = path.join(PUBLICO, 'api', 'seed.js');
    const existia = fs.existsSync(dest);
    await assert.rejects(gs.principal([arq, '--salvar', dest], {}), /public/);
    assert.equal(fs.existsSync(dest), existia);
  });

  it('leitura fora do formato é recusada antes de salvar ou enviar', async () => {
    const ruim = path.join(tmp, 'ruim.json');
    const s = snapFalso(); s.restricoes = [];
    fs.writeFileSync(ruim, JSON.stringify({ fonte: 'x', snap: s }));
    await assert.rejects(gs.principal([ruim, '--enviar', '--url', url()], { TAF_CHAVE: chave }), /fora do formato/);
    assert.equal(banco.chamadas.length, 0);
  });

  it('--enviar sem TAF_CHAVE: erro claro e nada sai', async () => {
    await assert.rejects(gs.principal([arq, '--enviar', '--url', url()], {}), /TAF_CHAVE/);
    assert.equal(banco.chamadas.length, 0);
  });

  it('ponta a ponta: --enviar com a chave certa grava no banco simulado', async () => {
    const c = await gs.principal([arq, '--enviar', '--url', url(), '--quem', 'Teste'], { TAF_CHAVE: chave });
    assert.equal(c, 0, saida.join('\n'));
    assert.equal(banco.gravados.length, 1);
    assert.deepEqual(banco.gravados[0].snap, snapFalso());
    assert.equal(banco.gravados[0].quem, 'Teste');
    assert.match(saida.join('\n'), /gravada no banco/);
  });

  it('ponta a ponta: chave errada é recusada e nada é gravado', async () => {
    const c = await gs.principal([arq, '--enviar', '--url', url()], { TAF_CHAVE: novaChave() });
    assert.equal(c, 1);
    assert.equal(banco.gravados.length, 0);
    assert.match(saida.join('\n'), /403/);
  });

  it('ponta a ponta: o GET antigo no endereço novo é recusado (405) e não grava', async () => {
    const r = await fetchOriginal('http://127.0.0.1:' + porta + '/api/leitura?k=' + chave);
    assert.equal(r.status, 405);
    assert.equal(r.headers.get('allow'), 'POST');
    assert.equal(banco.chamadas.length, 0);
  });

  it('ponta a ponta: POST cru sem chave é recusado (401)', async () => {
    const r = await fetchOriginal(url(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ snap: snapFalso() }) });
    assert.equal(r.status, 401);
    assert.equal(banco.chamadas.length, 0);
  });

  it('o script roda como processo (node fonte/gerar-seed.js) e sem argumentos mostra o uso', () => {
    const r = cp.spawnSync(process.execPath, [path.join(RAIZ, 'fonte', 'gerar-seed.js')], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /uso:/);
    const r2 = cp.spawnSync(process.execPath, [path.join(RAIZ, 'fonte', 'gerar-seed.js'), arq], { encoding: 'utf8' });
    assert.equal(r2.status, 0, r2.stderr);
    assert.match(r2.stdout, /leitura ok/);
  });
});
