'use strict';
// Trava de higiene: o repositório é PÚBLICO. Falha se dado real ou chave voltar a ser rastreado.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), cp = require('child_process');

const RAIZ = path.join(__dirname, '..');
function git(...args) { return cp.spawnSync('git', args, { cwd: RAIZ, encoding: 'utf8' }); }
function rastreados() { return git('ls-files', '-z').stdout.split('\0').filter(Boolean); }

describe('repositório público sem dado real', () => {
  it('public/api/seed.js (e qualquer seed*.js) não está rastreado', () => {
    const ruins = rastreados().filter((f) => /(^|\/)seed[^/]*\.js$/i.test(f) && !/^fonte\/erp\//.test(f));
    assert.deepEqual(ruins, []);
  });

  it('todo arquivo rastreado em public/api é só código (< 30 KB)', () => {
    const api = rastreados().filter((f) => f.startsWith('public/api/'));
    assert.ok(api.includes('public/api/leitura.js'), 'o endpoint novo precisa estar rastreado');
    for (const f of api) assert.ok(fs.statSync(path.join(RAIZ, f)).size < 30 * 1024, f + ' grande demais: parece dado embutido');
  });

  it('o site não chama o endpoint antigo /api/seed', () => {
    for (const f of rastreados().filter((x) => x.startsWith('public/') && /\.(html|js|json)$/.test(x))) {
      assert.ok(!fs.readFileSync(path.join(RAIZ, f), 'utf8').includes('/api/seed'), f);
    }
  });

  it('endpoint e script não carregam chave, endereço do banco nem leitura', () => {
    for (const f of ['public/api/leitura.js', 'fonte/gerar-seed.js']) {
      const t = fs.readFileSync(path.join(RAIZ, f), 'utf8');
      assert.ok(!/sb_(publishable|secret)_/.test(t), f + ': chave do Supabase no código');
      assert.ok(!/https:\/\/[a-z0-9]{12,}\.supabase\.co/.test(t), f + ': endereço do projeto no código');
      assert.ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(t), f + ': token JWT no código');
      assert.ok(!/"restricoes"\s*:\s*\[\s*\{/.test(t), f + ': leitura embutida');
    }
  });

  it('gerar-seed.js não escreve em public/', () => {
    const t = fs.readFileSync(path.join(RAIZ, 'fonte/gerar-seed.js'), 'utf8');
    assert.ok(!/writeFileSync\([^)]*public/.test(t));
    assert.match(t, /destinoSalvarOk/);
  });

  it('o .gitignore cobre leituras, planilhas e chaves; e não esconde o código novo', () => {
    const ignora = (f) => git('check-ignore', '-q', f).status === 0;
    for (const f of ['public/api/seed.js', 'leitura-local.json', 'fonte/leitura-x.json', 'rev6.xlsx', '.env', 'CHAVES-teste.txt']) assert.ok(ignora(f), f + ' deveria ser ignorado');
    for (const f of ['public/api/leitura.js', 'fonte/gerar-seed.js', 'testes/leitura.test.js', 'public/vercel.json']) assert.ok(!ignora(f), f + ' não pode ser ignorado');
  });
});
