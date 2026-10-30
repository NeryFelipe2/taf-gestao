'use strict';
// node --test testes/    (sem pacote, sem rede, sem banco real). Supabase simulado; números, nomes e textos inventados.
// As assinaturas são SINTÉTICAS: o próprio teste as calcula pela regra do Standard Webhooks (HMAC-SHA256 de
// "{webhook-id}.{webhook-timestamp}.{corpo}", chave = segredo sem "whsec_" decodificado de base64). Ainda não há entrega real da Bird.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const handler = require('../public/api/whatsapp-bird.js');
const { BASE, ANON, chamar } = require('./_apoio.js');

const sorteio = (p) => p + crypto.randomBytes(16).toString('hex');
const NUMERO = '5500000000001', NOME = 'Pessoa Teste', TEXTO = 'Bertioga: 3 ramais hoje (teste)', BSUID = 'bsuid-de-teste-1', USUARIO = 'usuario.de.teste';
const VARS = ['TAF_SUPABASE_URL', 'TAF_SUPABASE_KEY', 'BIRD_WEBHOOK_SECRET', 'WHATSAPP_SEGREDO_BANCO'];

// ---- assinatura, escrita aqui de forma independente do código
const chaveDe = (whsec) => Buffer.from(whsec.replace(/^whsec_/, ''), 'base64');
const assinar = (whsec, id, ts, corpo) => 'v1,' + crypto.createHmac('sha256', chaveDe(whsec)).update(`${id}.${ts}.${corpo}`).digest('base64');
const novoSegredo = () => 'whsec_' + crypto.randomBytes(32).toString('base64');

// ---- eventos como a documentação da Bird descreve: envelope { type, timestamp, data }
function evento(extra, data) {
  return Object.assign({
    type: 'whatsapp.received',
    timestamp: '2026-10-30T12:00:00.000Z',
    data: Object.assign({
      whatsapp_id: 'wam_T1', workspace_id: 'ws-de-teste', direction: 'inbound',
      from: { phone_number: '+' + NUMERO, bsuid: BSUID, username: USUARIO, display_name: NOME },
      to: { phone_number: '+5500000000000' },
      text: { body: TEXTO },
    }, data || {}),
  }, extra || {});
}
// mensagem de outro tipo: sem o braço text e com o braço pedido (conteúdo inventado, com um "id de mídia" que NÃO pode ser gravado)
function eventoBraco(braco) {
  const e = evento();
  delete e.data.text;
  e.data[braco] = { id: 'midia-secreta-9', mime_type: 'x/y', caption: 'legenda que não pode ser gravada', link: 'https://exemplo.invalid/m' };
  return e;
}

// ---- banco simulado: modo normal | fora | 5xx | sem-segredo-no-banco | segredo-recusado | sem-funcao | validacao | sem-id
function criarBanco(segredoBanco) {
  const b = { chamadas: [], modo: 'normal', gravados: [], vistos: new Map() };
  const resp = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
  const erro = (msg) => resp({ code: 'P0001', message: msg }, 400);
  b.fetch = async function (url, opts) {
    url = String(url);
    b.chamadas.push({ url, opts });
    if (b.modo === 'fora') throw Object.assign(new Error('rede caiu'), { name: 'TypeError' });
    if (url !== BASE + '/rest/v1/rpc/ia_whatsapp_receber') return resp({ message: 'rota inesperada' }, 404);
    if (opts.headers.apikey !== ANON || opts.headers.Authorization !== 'Bearer ' + ANON) return resp({ message: 'Invalid API key' }, 401);
    const a = JSON.parse(opts.body);
    if (b.modo === '5xx') return resp({ message: 'connection pool exhausted' }, 500);
    if (b.modo === 'sem-funcao') return resp({ code: 'PGRST202', message: 'Could not find the function public.ia_whatsapp_receber in the schema cache' }, 404);
    if (b.modo === 'sem-segredo-no-banco') return erro('SEGREDO NAO CONFIGURADO');
    if (b.modo === 'segredo-recusado' || a.p_segredo !== segredoBanco) return erro('SEGREDO INVALIDO');
    if (b.modo === 'validacao') return erro('NUMERO INVALIDO');
    if (b.modo === 'sem-id') return erro('MENSAGEM SEM ID');
    const repetido = b.vistos.has(a.p_wa_id);
    if (!repetido) { b.gravados.push(a); b.vistos.set(a.p_wa_id, b.gravados.length); }
    return resp({ ok: true, fato_id: b.vistos.get(a.p_wa_id), liberado: true, repetido });
  };
  b.rpc = () => b.chamadas.map((c) => JSON.parse(c.opts.body));
  b.nada = () => assert.equal(b.chamadas.length, 0, 'não podia ter ido ao banco');
  return b;
}

describe('/api/whatsapp-bird (webhook da Bird, assinatura sintética, Supabase simulado)', () => {
  let segredo, segredoBanco, banco, fetchOriginal, envOriginal, saida, assinaturas;
  const logsOriginais = {};

  beforeEach(() => {
    segredo = novoSegredo();
    segredoBanco = sorteio('b-');
    banco = criarBanco(segredoBanco);
    assinaturas = [];
    fetchOriginal = globalThis.fetch;
    globalThis.fetch = banco.fetch;
    envOriginal = Object.fromEntries(VARS.map((k) => [k, process.env[k]]));
    Object.assign(process.env, { TAF_SUPABASE_URL: BASE, TAF_SUPABASE_KEY: ANON, BIRD_WEBHOOK_SECRET: segredo, WHATSAPP_SEGREDO_BANCO: segredoBanco });
    saida = [];
    for (const k of ['log', 'error', 'warn', 'info']) { logsOriginais[k] = console[k]; console[k] = (...a) => saida.push(a.map(String).join(' ')); }
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    for (const k of VARS) { if (envOriginal[k] === undefined) delete process.env[k]; else process.env[k] = envOriginal[k]; }
    for (const k of Object.keys(logsOriginais)) console[k] = logsOriginais[k];
    // em nenhum teste segredo, assinatura, número, nome, texto, bsuid, username ou id de mídia aparecem no log
    const log = saida.join('\n');
    for (const v of [segredo, segredoBanco, segredo.replace(/^whsec_/, ''), NUMERO, NOME, TEXTO, BSUID, USUARIO, '0001', 'midia-secreta-9', 'legenda que não']) assert.ok(!log.includes(v), 'dado sensível apareceu no log: ' + v.slice(0, 12));
    for (const a of assinaturas) if (a.length > 8) assert.ok(!log.includes(a.replace(/^v1,/, '')), 'uma assinatura apareceu no log');
  });

  // POST como a Vercel entrega com bodyParser desligado: o corpo em fluxo, os bytes exatos que a assinatura cobre
  const post = (corpo, o) => {
    o = o || {};
    const texto = typeof corpo === 'string' ? corpo : JSON.stringify(corpo);
    const id = o.id || sorteio('msg_');
    const ts = o.ts !== undefined ? o.ts : Math.floor(Date.now() / 1000);
    const sig = o.assinatura !== undefined ? o.assinatura : assinar(o.segredo || segredo, id, ts, texto);
    assinaturas.push(sig);
    const headers = { 'webhook-id': id, 'webhook-timestamp': String(ts), 'webhook-signature': sig };
    Object.assign(headers, o.headers || {});
    for (const k of Object.keys(headers)) if (headers[k] === undefined) delete headers[k];
    return { method: o.method || 'POST', url: '/api/whatsapp-bird', stream: texto, headers };
  };
  const semSegredo = (r) => { for (const v of [segredo, segredoBanco]) assert.ok(!r.corpo.includes(v), 'um segredo voltou na resposta'); };

  describe('assinatura (Standard Webhooks)', () => {
    it('vetor de teste conhecido das bibliotecas Standard Webhooks: a conferência aceita a assinatura publicada e recusa uma letra trocada', () => {
      // O segredo está partido em dois pedaços só para o rastreador de segredos do GitHub não confundir esta amostra pública com chave de verdade.
      const whsec = 'whsec_' + 'MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
      const id = 'msg_p5jXN8AQM9LWM0D4loKWxJek', ts = '1614265330', corpo = '{"test": 2432232314}';
      const publicada = 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=';
      assert.equal(assinar(whsec, id, ts, corpo), publicada, 'a fórmula escrita no teste bate com o vetor publicado');
      const req = (sig) => ({ headers: { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': sig } });
      const chave = handler.chaveDoSegredo(whsec), agora = Number(ts) * 1000 + 1000;
      assert.doesNotThrow(() => handler.conferirAssinatura(req(publicada), Buffer.from(corpo), chave, agora));
      assert.throws(() => handler.conferirAssinatura(req(publicada.replace('g0hM', 'g0hN')), Buffer.from(corpo), chave, agora), (e) => e.status === 400);
      assert.throws(() => handler.conferirAssinatura(req(publicada), Buffer.from(corpo + ' '), chave, agora), (e) => e.status === 400);
    });

    it('a assinatura vale para os bytes que chegaram (acentos, emoji, escapes \\u, espaços e quebras de linha), não para um JSON reescrito', async () => {
      // JSON escrito "à moda de outro sistema": com espaços, chaves em outra ordem e escapes \\u. JSON.stringify(JSON.parse(isto)) seria diferente.
      const bruto = '{ "data": { "text": { "body": "Medi\\u00e7\\u00e3o \\u2705 ok\\n<b>&amp; \u00e1\u00e9\u00ed" }, "direction": "inbound", "whatsapp_id": "wam_ACENTO",\n'
        + '  "from": { "display_name": "Jo\\u00e3o", "phone_number": "+' + NUMERO + '" } },\n  "timestamp": "2026-10-30T12:00:00.000Z", "type": "whatsapp.received" }';
      assert.notEqual(JSON.stringify(JSON.parse(bruto)), bruto, 'o teste só vale se reescrever o JSON mudar os bytes');
      const r = await chamar(handler, post(bruto));
      assert.equal(r.statusCode, 200);
      const [a] = banco.rpc();
      assert.equal(a.p_texto, 'Medição ✅ ok\n<b>&amp; áéí');
      assert.equal(a.p_nome, 'João');
      // um byte a mais depois de assinado (espaço no fim) e a assinatura deixa de valer
      const req = post(bruto, { id: 'msg_x' });
      req.stream = bruto + ' ';
      assert.equal((await chamar(handler, req)).statusCode, 400);
    });

    it('assinatura certa: 200 e a mensagem vai ao banco', async () => {
      const r = await chamar(handler, post(evento()));
      assert.equal(r.statusCode, 200);
      assert.deepEqual(r.json(), { ok: true, mensagens: 1, gravadas: 1, falhas: 0 });
      assert.equal(banco.rpc().length, 1);
      semSegredo(r);
    });

    it('assinatura errada, corpo mexido, segredo de outra conta, sem cabeçalho ou fora do formato: 400 e nada vai ao banco', async () => {
      const corpo = JSON.stringify(evento());
      const id = 'msg_fixo', ts = Math.floor(Date.now() / 1000);
      const certa = assinar(segredo, id, ts, corpo);
      const casos = {
        'segredo de outra conta': post(evento(), { id, ts, assinatura: assinar(novoSegredo(), id, ts, corpo) }),
        'assinatura trocada por uma letra': post(evento(), { id, ts, assinatura: certa.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')) }),
        'id do webhook diferente do assinado': post(evento(), { id: 'msg_outro', ts, assinatura: certa }),
        'timestamp diferente do assinado': post(evento(), { id, ts, assinatura: assinar(segredo, id, ts + 1, corpo) }),
        'versão v2': post(evento(), { id, ts, assinatura: certa.replace(/^v1,/, 'v2,') }),
        'sem a versão': post(evento(), { id, ts, assinatura: certa.replace(/^v1,/, '') }),
        'assinatura vazia': post(evento(), { id, ts, assinatura: '' }),
        'sem webhook-id': post(evento(), { id, ts, assinatura: certa, headers: { 'webhook-id': undefined } }),
        'sem webhook-timestamp': post(evento(), { id, ts, assinatura: certa, headers: { 'webhook-timestamp': undefined } }),
        'sem webhook-signature': post(evento(), { id, ts, assinatura: certa, headers: { 'webhook-signature': undefined } }),
        'timestamp que não é número': post(evento(), { id, ts: 'ontem', assinatura: certa }),
      };
      // corpo mexido depois de assinado
      casos['corpo mexido'] = { method: 'POST', url: '/api/whatsapp-bird', stream: corpo.replace(TEXTO, 'texto trocado'), headers: { 'webhook-id': id, 'webhook-timestamp': String(ts), 'webhook-signature': certa } };
      for (const [nome, req] of Object.entries(casos)) {
        const r = await chamar(handler, req);
        assert.equal(r.statusCode, 400, nome);
        assert.equal(r.json().ok, false, nome);
        semSegredo(r);
      }
      banco.nada();
    });

    it('timestamp velho ou do futuro (mais de 5 minutos): 400; dentro de 5 minutos: 200', async () => {
      const agora = Math.floor(Date.now() / 1000);
      for (const ts of [agora - 360, agora + 360, agora - 86400]) {
        const r = await chamar(handler, post(evento(), { ts }));
        assert.equal(r.statusCode, 400, String(agora - ts));
        assert.match(r.json().erro, /velha/);
      }
      banco.nada();
      for (const ts of [agora - 240, agora + 240]) {
        assert.equal((await chamar(handler, post(evento({}, { whatsapp_id: 'wam_' + ts }), { ts }))).statusCode, 200, String(agora - ts));
      }
    });

    it('troca de segredo: duas assinaturas no cabeçalho, vale se uma delas é certa (em qualquer posição)', async () => {
      const corpo = JSON.stringify(evento()), id = 'msg_rotacao', ts = Math.floor(Date.now() / 1000);
      const errada = assinar(novoSegredo(), id, ts, corpo), certa = assinar(segredo, id, ts, corpo);
      for (const lista of [errada + ' ' + certa, certa + ' ' + errada, errada + '  ' + certa]) {
        const r = await chamar(handler, post(evento(), { id, ts, assinatura: lista }));
        assert.equal(r.statusCode, 200, lista.length + '');
      }
      // duas erradas continuam recusadas
      assert.equal((await chamar(handler, post(evento(), { id, ts, assinatura: errada + ' ' + assinar(novoSegredo(), id, ts, corpo) }))).statusCode, 400);
      assert.equal(banco.rpc().length, 3);
    });

    it('segredo sem o prefixo whsec_ também funciona (a chave é o texto decodificado de base64)', async () => {
      process.env.BIRD_WEBHOOK_SECRET = segredo.replace(/^whsec_/, '');
      assert.equal((await chamar(handler, post(evento()))).statusCode, 200);
    });
  });

  describe('configuração', () => {
    it('sem BIRD_WEBHOOK_SECRET (ou vazio, ou só o prefixo): 503 com o nome da variável, mesmo com assinatura de alguma chave', async () => {
      for (const v of [undefined, '', '   ', 'whsec_']) {
        if (v === undefined) delete process.env.BIRD_WEBHOOK_SECRET; else process.env.BIRD_WEBHOOK_SECRET = v;
        const r = await chamar(handler, post(evento()));
        assert.equal(r.statusCode, 503, String(v));
        assert.deepEqual(r.json(), { ok: false, erro: 'servidor sem configuração (BIRD_WEBHOOK_SECRET na Vercel)' });
      }
      banco.nada();
    });

    it('assinatura certa mas falta o banco ou o segredo do banco: 503 (a Bird reenvia), com o nome da variável', async () => {
      for (const k of ['TAF_SUPABASE_URL', 'TAF_SUPABASE_KEY', 'WHATSAPP_SEGREDO_BANCO']) {
        const antes = process.env[k];
        delete process.env[k];
        const r = await chamar(handler, post(evento()));
        assert.equal(r.statusCode, 503, k);
        assert.match(r.json().erro, new RegExp(k));
        process.env[k] = antes;
      }
      banco.nada();
    });

    it('status e reação não dependem do banco: 200 mesmo sem as variáveis dele', async () => {
      delete process.env.WHATSAPP_SEGREDO_BANCO;
      const r = await chamar(handler, post({ type: 'whatsapp.delivered', timestamp: '2026-10-30T12:00:00Z', data: { whatsapp_id: 'wam_T1' } }));
      assert.equal(r.statusCode, 200);
      banco.nada();
    });

    it('GET, PUT, DELETE e HEAD: 405 com Allow: POST (a Bird não faz verificação por GET)', async () => {
      for (const method of ['GET', 'PUT', 'DELETE', 'HEAD', 'PATCH']) {
        const r = await chamar(handler, { method, url: '/api/whatsapp-bird', corpo: undefined, semTipo: true });
        assert.equal(r.statusCode, 405, method);
        assert.equal(r.headers.allow, 'POST', method);
      }
      banco.nada();
    });

    it('corpo grande demais: 413 antes de qualquer conta', async () => {
      const grande = JSON.stringify({ type: 'whatsapp.received', x: 'a'.repeat(3 * 1024 * 1024) });   // o limite é o do /api/whatsapp (3 MB, lote grande da Meta com mídia)
      const r = await chamar(handler, post(grande));
      assert.equal(r.statusCode, 413);
      banco.nada();
    });
  });

  describe('o que vira mensagem', () => {
    it('texto: o mesmo formato do /api/whatsapp (wa_id, número sem "+", nome, texto, quando do envelope, bruto sem dado pessoal)', async () => {
      const r = await chamar(handler, post(evento(), { id: 'msg_abc' }));
      assert.equal(r.statusCode, 200);
      const [a] = banco.rpc();
      assert.deepEqual(Object.keys(a).sort(), ['p_bruto', 'p_de', 'p_nome', 'p_quando', 'p_segredo', 'p_texto', 'p_wa_id']);
      assert.equal(a.p_segredo, segredoBanco);
      assert.equal(a.p_wa_id, 'wam_T1');
      assert.equal(a.p_de, NUMERO);
      assert.equal(a.p_nome, NOME);
      assert.equal(a.p_texto, TEXTO);
      assert.equal(a.p_quando, '2026-10-30T12:00:00.000Z');
      assert.deepEqual(a.p_bruto, { tipo: 'text', origem: 'bird', webhook_id: 'msg_abc' });
      const tudo = JSON.stringify(a);
      for (const v of [BSUID, USUARIO, 'ws-de-teste', '5500000000000']) assert.ok(!tudo.includes(v), 'dado pessoal ou da conta foi para o banco: ' + v);
      // só fala com o banco; nunca com a Bird nem com a Meta
      assert.ok(banco.chamadas.every((c) => c.url === BASE + '/rest/v1/rpc/ia_whatsapp_receber'));
    });

    it('o timestamp do envelope pode ser ISO, segundos ou milissegundos; ilegível vale a hora de agora', async () => {
      assert.equal(handler.quandoDe('2026-10-30T12:00:00.000Z'), '2026-10-30T12:00:00.000Z');
      assert.equal(handler.quandoDe(1761825600), '2025-10-30T12:00:00.000Z');
      assert.equal(handler.quandoDe('1761825600'), '2025-10-30T12:00:00.000Z');
      assert.equal(handler.quandoDe(1761825600000), '2025-10-30T12:00:00.000Z');
      const antes = Date.now();
      for (const ruim of [undefined, null, '', 'ontem', {}, -5, 1e300, NaN]) {
        const q = Date.parse(handler.quandoDe(ruim));
        assert.ok(q >= antes - 5 && q <= Date.now() + 5, 'ilegível: ' + String(ruim));
      }
    });

    it('o texto é cortado em 8000 caracteres; sem display_name o nome vai vazio', async () => {
      const e = evento({}, { text: { body: 'x'.repeat(9000) } });
      delete e.data.from.display_name;
      await chamar(handler, post(e));
      const [a] = banco.rpc();
      assert.equal(a.p_texto.length, 8000);
      assert.equal(a.p_nome, '');
    });

    it('mensagem que não é texto (imagem, áudio, vídeo, documento, figurinha, local, contatos, interativa, botão): grava só o tipo, sem texto e sem id de mídia', async () => {
      for (const braco of ['image', 'audio', 'video', 'document', 'sticker', 'location', 'contacts', 'interactive', 'button']) {
        banco.chamadas.length = 0;
        const e = eventoBraco(braco);
        e.data.whatsapp_id = 'wam_' + braco;
        const r = await chamar(handler, post(e));
        assert.equal(r.statusCode, 200, braco);
        const [a] = banco.rpc();
        assert.equal(a.p_texto, null, braco);
        assert.deepEqual(a.p_bruto, { tipo: braco, origem: 'bird', webhook_id: a.p_bruto.webhook_id }, braco);
        const tudo = JSON.stringify(a);
        for (const v of ['midia-secreta-9', 'legenda', 'exemplo.invalid', 'x/y']) assert.ok(!tudo.includes(v), braco + ' levou ' + v);
      }
    });

    it('mensagem de tipo que não conhecemos (nenhum braço da lista): grava o tipo "unknown", sem texto', async () => {
      const e = evento();
      delete e.data.text;
      e.data.algo_novo = { id: 'x' };
      assert.equal((await chamar(handler, post(e))).statusCode, 200);
      const [a] = banco.rpc();
      assert.equal(a.p_texto, null);
      assert.equal(a.p_bruto.tipo, 'unknown');
    });

    it('from sem phone_number (usuário com username/BSUID): não grava, 200, conta como sem_numero; nada de bsuid/username no log', async () => {
      for (const from of [{ bsuid: BSUID, username: USUARIO, display_name: NOME }, { phone_number: '', bsuid: BSUID }, { phone_number: '+' }, null, 'texto']) {
        const e = evento();
        e.data.from = from;
        const r = await chamar(handler, post(e));
        assert.equal(r.statusCode, 200, JSON.stringify(from));
        assert.deepEqual(r.json(), { ok: true, mensagens: 0, gravadas: 0, falhas: 0, sem_numero: 1 });
      }
      banco.nada();
      assert.ok(saida.some((l) => /sem_numero/.test(l)));
    });

    it('evento sem id da mensagem, com direção que não é inbound ou sem data: 200 e não grava', async () => {
      const semId = evento(); delete semId.data.whatsapp_id;
      const saida1 = evento({}, { direction: 'outbound' });
      const semData = { type: 'whatsapp.received', timestamp: 'x' };
      assert.equal((await chamar(handler, post(semId))).json().sem_id, 1);
      assert.equal((await chamar(handler, post(saida1))).json().nao_recebida, 1);
      assert.equal((await chamar(handler, post(semData))).json().invalido, 1);
      banco.nada();
    });
  });

  describe('o que se ignora (200, nada vai ao banco)', () => {
    it('status de entrega, reação e tipo que não conhecemos', async () => {
      for (const type of ['whatsapp.accepted', 'whatsapp.sent', 'whatsapp.delivered', 'whatsapp.read', 'whatsapp.failed', 'whatsapp.rejected', 'whatsapp.reacted', 'sms.received', 'coisa.nova', '']) {
        const r = await chamar(handler, post({ type, timestamp: '2026-10-30T12:00:00Z', data: { whatsapp_id: 'wam_T1', from: { phone_number: '+' + NUMERO }, text: { body: TEXTO } } }));
        assert.equal(r.statusCode, 200, type);
        assert.deepEqual(r.json(), { ok: true, ignorado: true }, type);
      }
      banco.nada();
    });

    it('assinado mas não é JSON, ou JSON que não é um objeto: 200 e ignora (reenviar não ajuda)', async () => {
      for (const corpo of ['isto não é json', '[1,2]', '"texto"', 'null', '123']) {
        const r = await chamar(handler, post(corpo));
        assert.equal(r.statusCode, 200, corpo);
        assert.equal(r.json().ignorado, true, corpo);
      }
      banco.nada();
    });
  });

  describe('falha do banco: reenvio', () => {
    // Antes da Bird existir já valia no /api/whatsapp (testes/whatsapp.test.js): falha passageira = 503, a Bird reenvia (8 tentativas
    // em cerca de 27,5 h com o mesmo webhook-id) e a gravação é idempotente pelo id da mensagem; falha de validação = 200 e conta.
    it('rede, 5xx, sem a função (09), segredo não configurado ou recusado no banco: 503, a Bird reenvia', async () => {
      for (const modo of ['fora', '5xx', 'sem-funcao', 'sem-segredo-no-banco', 'segredo-recusado']) {
        banco.modo = modo;
        const r = await chamar(handler, post(evento()));
        assert.equal(r.statusCode, 503, modo);
        assert.deepEqual(r.json(), { ok: false, erro: 'o banco não gravou agora; o provedor reenvia e a gravação não duplica', mensagens: 1, gravadas: 0, falhas: 1 }, modo);
        semSegredo(r);
      }
      assert.ok(saida.some((l) => /whatsapp-bird: falta aplicar o 09_whatsapp_entrada\.sql/.test(l)));
    });

    it('o reenvio depois do 503 grava uma vez só, e reenviar o que já foi gravado não duplica', async () => {
      banco.modo = 'fora';
      const id = 'msg_mesmo_evento';
      assert.equal((await chamar(handler, post(evento(), { id }))).statusCode, 503);
      banco.modo = 'normal';
      assert.equal((await chamar(handler, post(evento(), { id }))).statusCode, 200);   // a nova tentativa da Bird
      assert.equal((await chamar(handler, post(evento(), { id }))).statusCode, 200);   // e uma entrega repetida
      assert.equal(banco.gravados.length, 1);
      assert.equal(banco.rpc().length, 3);
      assert.ok(banco.rpc().every((a) => a.p_wa_id === 'wam_T1'));
    });

    it('validação (NUMERO INVALIDO, MENSAGEM SEM ID): conta a falha e responde 200', async () => {
      for (const modo of ['validacao', 'sem-id']) {
        banco.modo = modo;
        const r = await chamar(handler, post(evento()));
        assert.equal(r.statusCode, 200, modo);
        assert.deepEqual(r.json(), { ok: true, mensagens: 1, gravadas: 0, falhas: 1 }, modo);
      }
    });
  });

  it('o código não tem chave, endereço do banco, número nem chamada à Bird ou à Meta', () => {
    const t = fs.readFileSync(path.join(__dirname, '..', 'public', 'api', 'whatsapp-bird.js'), 'utf8');
    assert.ok(!/sb_(publishable|secret)_/.test(t));
    assert.ok(!/https:\/\/[a-z0-9]{12,}\.supabase\.co/.test(t));
    assert.ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(t));
    assert.ok(!/whsec_[A-Za-z0-9+/=]{16,}/.test(t), 'segredo de webhook no código');
    assert.ok(!/graph\.facebook\.com|api\.bird\.com|nest\.messagebird\.com/.test(t), 'nunca chama a Meta nem a Bird');
    assert.ok(!/\+?55\d{10,}/.test(t), 'número de telefone no código');
    assert.ok(Buffer.byteLength(t) < 30 * 1024, 'arquivo da api grande demais');
  });
});
