'use strict';
// node --test testes/    (Node 18 ou mais novo; sem pacote nenhum; sem rede; sem banco real)
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../public/api/leitura.js');
const { BASE, ANON, novaChave, snapFalso, criarBancoFalso, chamar } = require('./_apoio.js');

describe('POST /api/leitura (Supabase simulado)', () => {
  let chave, banco, fetchOriginal, envOriginal, saida;
  const logsOriginais = {};

  beforeEach(() => {
    chave = novaChave();
    banco = criarBancoFalso(chave);
    fetchOriginal = globalThis.fetch;
    globalThis.fetch = banco.fetch;
    envOriginal = { u: process.env.TAF_SUPABASE_URL, k: process.env.TAF_SUPABASE_KEY };
    process.env.TAF_SUPABASE_URL = BASE;
    process.env.TAF_SUPABASE_KEY = ANON;
    saida = [];
    for (const n of ['log', 'error', 'warn', 'info']) {
      logsOriginais[n] = console[n];
      console[n] = (...a) => saida.push(a.map(String).join(' '));
    }
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    for (const [k, v] of [['TAF_SUPABASE_URL', envOriginal.u], ['TAF_SUPABASE_KEY', envOriginal.k]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    for (const n of Object.keys(logsOriginais)) console[n] = logsOriginais[n];
    // em nenhum teste a chave pode aparecer no log
    assert.ok(!saida.join('\n').includes(chave), 'a chave apareceu no log');
  });

  const corpoBom = () => ({ snap: snapFalso(), fonte: 'teste (corte 2000-01-01)', quem: 'Teste' });
  const ok = (extra) => Object.assign({ headers: { 'x-chave': chave }, corpo: corpoBom() }, extra);
  const nada = () => { assert.equal(banco.chamadas.length, 0, 'não podia ter ido ao banco'); assert.equal(banco.gravados.length, 0); };

  describe('recusas (não gravam nada)', () => {
    it('GET é recusado com 405 e Allow: POST', async () => {
      const r = await chamar(handler, { method: 'GET', headers: { 'x-chave': chave } });
      assert.equal(r.statusCode, 405);
      assert.equal(r.headers['allow'], 'POST');
      nada();
    });

    it('GET no estilo antigo (?k=chave) também é recusado e a chave não vai a lugar nenhum', async () => {
      const r = await chamar(handler, { method: 'GET', url: '/api/leitura?k=' + chave, corpo: undefined });
      assert.equal(r.statusCode, 405);
      assert.ok(!r.corpo.includes(chave));
      nada();
    });

    it('HEAD, PUT e OPTIONS (pré-voo de navegador) são recusados', async () => {
      for (const method of ['HEAD', 'PUT', 'DELETE', 'OPTIONS']) {
        const r = await chamar(handler, ok({ method }));
        assert.equal(r.statusCode, 405, method);
      }
      nada();
    });

    it('POST sem chave: 401', async () => {
      const r = await chamar(handler, { corpo: corpoBom() });
      assert.equal(r.statusCode, 401);
      nada();
    });

    it('POST com chave em branco: 401', async () => {
      const r = await chamar(handler, ok({ headers: { 'x-chave': '   ' } }));
      assert.equal(r.statusCode, 401);
      nada();
    });

    it('POST com a chave na URL (?k=, ?chave=, ?token=) é recusado, mesmo com o cabeçalho certo', async () => {
      for (const q of ['k', 'chave', 'token', 'apikey']) {
        const r = await chamar(handler, ok({ url: '/api/leitura?' + q + '=' + chave }));
        assert.equal(r.statusCode, 400, q);
        assert.match(r.json().erro, /URL/);
        assert.ok(!r.corpo.includes(chave));
      }
      nada();
    });

    it('chave errada: 403 e nada gravado', async () => {
      const r = await chamar(handler, ok({ headers: { 'x-chave': novaChave() } }));
      assert.equal(r.statusCode, 403);
      assert.equal(r.json().ok, false);
      assert.equal(banco.chamadas.length, 1, 'a conferência é feita pelo banco');
      assert.equal(banco.gravados.length, 0);
    });

    it('chave grande demais: 401 sem ir ao banco', async () => {
      const r = await chamar(handler, ok({ headers: { 'x-chave': 'a'.repeat(500) } }));
      assert.equal(r.statusCode, 401);
      nada();
    });

    it('tipo de conteúdo errado: 415', async () => {
      for (const t of ['text/plain', 'application/x-www-form-urlencoded']) {
        const r = await chamar(handler, ok({ headers: { 'x-chave': chave, 'content-type': t } }));
        assert.equal(r.statusCode, 415, t);
      }
      assert.equal((await chamar(handler, ok({ semTipo: true }))).statusCode, 415);
      nada();
    });

    describe('corpo inválido: 400 sem ir ao banco', () => {
      const casos = {
        'JSON quebrado (texto)': { corpo: '{"snap": {' },
        'JSON quebrado (a Vercel não conseguiu ler)': { corpoQuebra: true, corpo: undefined },
        'corpo vazio (texto)': { corpo: '   ' },
        'sem corpo': { corpo: undefined },
        'corpo é lista': { corpo: [1, 2] },
        'corpo é número': { corpo: 7 },
        'sem snap': { corpo: { fonte: 'x' } },
        'snap não é objeto': { corpo: { snap: 'texto' } },
        'snap sem restricoes': { corpo: (() => { const b = corpoBom(); delete b.snap.restricoes; return b; })() },
        'restricoes vazia': { corpo: (() => { const b = corpoBom(); b.snap.restricoes = []; return b; })() },
        'restricoes não é lista': { corpo: (() => { const b = corpoBom(); b.snap.restricoes = {}; return b; })() },
        'item de restricoes não é objeto': { corpo: (() => { const b = corpoBom(); b.snap.restricoes = ['x']; return b; })() },
        'sem corte': { corpo: (() => { const b = corpoBom(); delete b.snap.corte; return b; })() },
        'sem obras': { corpo: (() => { const b = corpoBom(); b.snap.obras = {}; return b; })() },
        'seção conhecida com tipo errado': { corpo: (() => { const b = corpoBom(); b.snap.bms = 'x'; return b; })() },
        'seção com itens demais': { corpo: (() => { const b = corpoBom(); b.snap.perguntas = new Array(51).fill({}); return b; })() },
        'fonte longa demais': { corpo: Object.assign(corpoBom(), { fonte: 'f'.repeat(201) }) },
        'fonte que não é texto': { corpo: Object.assign(corpoBom(), { fonte: 5 }) },
        'quem longo demais': { corpo: Object.assign(corpoBom(), { quem: 'q'.repeat(81) }) },
        'campo extra "chave" no corpo': { corpo: Object.assign(corpoBom(), { chave: 'x' }) },
        'campo extra qualquer': { corpo: Object.assign(corpoBom(), { p_chave: 'x' }) },
      };
      for (const [nome, o] of Object.entries(casos)) {
        it(nome, async () => {
          const r = await chamar(handler, ok(o));
          assert.equal(r.statusCode, 400, r.corpo);
          assert.equal(r.json().ok, false);
          nada();
        });
      }

      it('o aviso de campo "chave" no corpo manda usar o cabeçalho e não repete o valor', async () => {
        const segredo = 'valor-que-nao-pode-voltar';
        const r = await chamar(handler, ok({ corpo: Object.assign(corpoBom(), { chave: segredo }) }));
        assert.match(r.json().erro, /cabeçalho/);
        assert.ok(!r.corpo.includes(segredo));
      });
    });

    it('JSON "null" já convertido pela Vercel (body null, fluxo já consumido): 400 na hora, sem esperar o fluxo', async () => {
      const { fazerReq, fazerRes } = require('./_apoio.js');
      const req = fazerReq({ headers: { 'x-chave': chave }, corpo: null });
      req.on = function () { return this; }; // fluxo encerrado: nunca dispara 'data' nem 'end'
      const res = fazerRes();
      let timer;
      const limite = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('travou esperando o fluxo')), 1500); });
      try { await Promise.race([handler(req, res), limite]); } finally { clearTimeout(timer); }
      assert.equal(res.statusCode, 400);
      assert.equal(res.json().ok, false);
      nada();
    });

    describe('tamanho', () => {
      it('a Vercel recusa o corpo grande ao ler (statusCode 413): responde 413, não 400', async () => {
        const r = await chamar(handler, ok({ corpoQuebra: { statusCode: 413, message: 'Body exceeded 1mb limit' }, corpo: undefined }));
        assert.equal(r.statusCode, 413);
        assert.ok(!r.corpo.includes('Body exceeded'));
        nada();
      });

      it('Content-Length acima do limite: 413 sem ler o corpo', async () => {
        const r = await chamar(handler, ok({ headers: { 'x-chave': chave, 'content-length': String(handler.LIMITE_BYTES + 1) } }));
        assert.equal(r.statusCode, 413);
        nada();
      });

      it('corpo (já em objeto) acima do limite: 413', async () => {
        const b = corpoBom();
        b.snap.restricoes = [{ txt: 'x'.repeat(handler.LIMITE_BYTES) }];
        const r = await chamar(handler, ok({ corpo: b }));
        assert.equal(r.statusCode, 413);
        nada();
      });

      it('corpo em texto acima do limite: 413', async () => {
        const r = await chamar(handler, ok({ corpo: '{"a":"' + 'x'.repeat(handler.LIMITE_BYTES) + '"}' }));
        assert.equal(r.statusCode, 413);
        nada();
      });

      it('corpo em fluxo acima do limite, mesmo sem Content-Length verdadeiro: 413', async () => {
        const grande = JSON.stringify({ snap: { restricoes: [{ txt: 'x'.repeat(handler.LIMITE_BYTES) }] } });
        const req = require('./_apoio.js').fazerReq({ headers: { 'x-chave': chave }, stream: grande });
        req.headers['content-length'] = '100'; // mentindo
        const res = require('./_apoio.js').fazerRes();
        await handler(req, res);
        assert.equal(res.statusCode, 413);
        nada();
      });
    });

    it('sem configuração do servidor: 500 e não vai ao banco', async () => {
      delete process.env.TAF_SUPABASE_KEY;
      const r = await chamar(handler, ok());
      assert.equal(r.statusCode, 500);
      assert.match(r.json().erro, /configuração/);
      nada();
    });

    it('endereço do banco sem https: 500 e a chave não sai', async () => {
      process.env.TAF_SUPABASE_URL = 'http://projeto-de-teste.supabase.co';
      const r = await chamar(handler, ok());
      assert.equal(r.statusCode, 500);
      nada();
    });
  });

  describe('POST válido', () => {
    it('grava a leitura, devolve 200 e não repete a chave', async () => {
      const corpo = corpoBom();
      const r = await chamar(handler, ok({ corpo }));
      assert.equal(r.statusCode, 200, r.corpo);
      const j = r.json();
      assert.equal(j.ok, true);
      assert.equal(j.id, 1);
      assert.equal(j.restricoes, corpo.snap.restricoes.length);
      assert.ok(!r.corpo.includes(chave));
      assert.equal(banco.gravados.length, 1);
      assert.deepEqual(banco.gravados[0].snap, corpo.snap);
      assert.equal(banco.gravados[0].fonte, corpo.fonte);
      assert.equal(banco.gravados[0].quem, 'Teste');
      assert.equal(r.headers['cache-control'], 'no-store');
    });

    it('fala com o banco do jeito certo: rota da função, chave publicável nos cabeçalhos, sem redirecionamento, chave de acesso só no corpo para o banco', async () => {
      await chamar(handler, ok());
      const c = banco.chamadas[0];
      assert.equal(c.url, BASE + '/rest/v1/rpc/taf_snap_salvar');
      assert.ok(!c.url.includes(chave), 'a chave não pode ir na URL do banco');
      assert.equal(c.opts.method, 'POST');
      assert.equal(c.opts.redirect, 'error');
      assert.equal(c.opts.headers.apikey, ANON);
      assert.equal(c.opts.headers.Authorization, 'Bearer ' + ANON);
      const corpoBanco = JSON.parse(c.opts.body);
      assert.deepEqual(Object.keys(corpoBanco).sort(), ['p_chave', 'p_fonte', 'p_quem', 'p_snap']);
      assert.equal(corpoBanco.p_chave, chave);
    });

    it('aceita a chave em Authorization: Bearer', async () => {
      const r = await chamar(handler, ok({ headers: { authorization: 'Bearer ' + chave } }));
      assert.equal(r.statusCode, 200);
      assert.equal(banco.gravados.length, 1);
    });

    it('x-chave vale mais que Authorization', async () => {
      const r = await chamar(handler, ok({ headers: { 'x-chave': chave, authorization: 'Bearer ' + novaChave() } }));
      assert.equal(r.statusCode, 200);
    });

    it('aceita Content-Type com charset e corpo em texto JSON', async () => {
      const r = await chamar(handler, ok({ headers: { 'x-chave': chave, 'content-type': 'application/json; charset=utf-8' }, corpo: JSON.stringify(corpoBom()) }));
      assert.equal(r.statusCode, 200);
    });

    it('aceita corpo em fluxo (Node puro, sem ajudante da Vercel)', async () => {
      const r = await chamar(handler, { headers: { 'x-chave': chave }, stream: JSON.stringify(corpoBom()) });
      assert.equal(r.statusCode, 200, r.corpo);
      assert.equal(banco.gravados.length, 1);
    });

    it('sem fonte e sem quem usa os padrões', async () => {
      const r = await chamar(handler, ok({ corpo: { snap: snapFalso() } }));
      assert.equal(r.statusCode, 200);
      assert.equal(banco.gravados[0].quem, 'Claude');
      assert.ok(banco.gravados[0].fonte.length > 0);
    });

    it('aceita seção nova que a extração venha a gerar', async () => {
      const b = corpoBom();
      b.snap.secaoNova = [{ a: 1 }];
      const r = await chamar(handler, ok({ corpo: b }));
      assert.equal(r.statusCode, 200);
    });

    it('a leitura de uma gravação segue a anterior (duas leituras, dois registros)', async () => {
      await chamar(handler, ok());
      await chamar(handler, ok());
      assert.equal(banco.gravados.length, 2);
    });
  });

  describe('falhas do banco', () => {
    it('banco fora do ar: 502 sem vazar detalhe', async () => {
      banco.modo = 'fora';
      const r = await chamar(handler, ok());
      assert.equal(r.statusCode, 502);
      assert.ok(!r.corpo.includes('rede caiu'));
    });

    it('erro genérico do banco: 502 e não repete a resposta do banco', async () => {
      banco.modo = 'erro-generico';
      const r = await chamar(handler, ok());
      assert.equal(r.statusCode, 502);
      assert.equal(r.json().status_banco, 500);
      assert.ok(!r.corpo.includes('falha qualquer'));
    });

    it('banco recusa o formato: 422', async () => {
      // força o caminho "LEITURA INVALIDA" do banco simulado
      const original = banco.fetch;
      globalThis.fetch = async (url, opts) => {
        const b = JSON.parse(opts.body); b.p_snap = {}; opts = Object.assign({}, opts, { body: JSON.stringify(b) });
        return original(url, opts);
      };
      const r = await chamar(handler, ok());
      assert.equal(r.statusCode, 422);
    });
  });
});

describe('validarSnap', () => {
  it('aceita a leitura fictícia completa', () => {
    assert.deepEqual(handler.validarSnap(snapFalso()), []);
  });
  it('só lista caminhos, nunca valores', () => {
    const s = snapFalso(); s.bms = 'segredo-no-valor'; s.restricoes = [];
    const txt = JSON.stringify(handler.validarSnap(s));
    assert.ok(!txt.includes('segredo-no-valor'));
    assert.match(txt, /bms/);
    assert.match(txt, /restricoes/);
  });
  it('não estoura com aninhamento enorme', () => {
    let fundo = {}; const topo = fundo;
    for (let i = 0; i < 100000; i++) { fundo.x = {}; fundo = fundo.x; }
    const s = snapFalso(); s.caixa = topo;
    assert.deepEqual(handler.validarSnap(s), []);
    assert.throws(() => handler.validarCorpo({ snap: s }), (e) => e.status === 400);
  });
});
