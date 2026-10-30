'use strict';
// node --test testes/    (sem pacote, sem rede, sem banco real). Supabase simulado; números e textos inventados.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const handler = require('../public/api/whatsapp.js');
const { BASE, ANON, chamar } = require('./_apoio.js');

const sorteio = (p) => p + crypto.randomBytes(16).toString('hex');
const NUMERO = '5500000000001', NOME = 'Pessoa Teste', TEXTO = 'Bertioga: 3 ramais hoje (teste)';
const VARS = ['TAF_SUPABASE_URL', 'TAF_SUPABASE_KEY', 'WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_APP_SECRET', 'WHATSAPP_SEGREDO_BANCO'];

// lote como a Meta manda: 1 texto e 1 áudio
function lote() {
  return {
    object: 'whatsapp_business_account',
    entry: [{ id: '0', changes: [{ field: 'messages', value: {
      messaging_product: 'whatsapp', metadata: { display_phone_number: '550000000000', phone_number_id: '0' },
      contacts: [{ profile: { name: NOME }, wa_id: NUMERO }],
      messages: [
        { from: NUMERO, id: 'wamid.T1', timestamp: '1761825600', type: 'text', text: { body: TEXTO } },
        { from: NUMERO, id: 'wamid.T2', timestamp: '1761825660', type: 'audio', audio: { id: 'midia-1', mime_type: 'audio/ogg', voice: true } },
      ] } }] }],
  };
}

// modo (para todas as mensagens) ou modoPor[wa_id] (só para uma): normal | fora | corta | 5xx | sem-funcao | chave-recusada |
// sem-segredo-no-banco | validacao | sem-id | 5xx-com-texto-de-validacao. Como a função do banco, o mesmo id de mensagem não grava duas vezes (repetido: true).
function criarBanco(segredos) {
  const b = { chamadas: [], modo: 'normal', modoPor: {}, gravados: [], vistos: new Map() };
  const resp = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
  const erro = (msg) => resp({ code: 'P0001', message: msg }, 400);
  b.fetch = async function (url, opts) {
    url = String(url);
    b.chamadas.push({ url, opts });
    if (url !== BASE + '/rest/v1/rpc/ia_whatsapp_receber') return resp({ message: 'rota inesperada' }, 404);
    const a = JSON.parse(opts.body);
    const modo = b.modoPor[a.p_wa_id] || b.modo;
    if (modo === 'fora') throw Object.assign(new Error('rede caiu'), { name: 'TypeError' });
    if (modo === 'corta') return { ok: true, status: 200, text: async () => { throw Object.assign(new Error('terminated'), { name: 'TypeError' }); } };   // a conexão cai no meio da resposta
    if (modo === '5xx') return resp({ message: 'canceling statement due to statement timeout' }, 503);
    if (modo === '5xx-com-texto-de-validacao') return resp({ message: 'NUMERO INVALIDO' }, 500);   // só 4xx conta como validação
    if (modo === 'chave-recusada' || opts.headers.apikey !== ANON || opts.headers.Authorization !== 'Bearer ' + ANON) return resp({ message: 'Invalid API key' }, 401);
    if (modo === 'sem-funcao') return resp({ code: 'PGRST202', message: 'Could not find the function public.ia_whatsapp_receber in the schema cache' }, 404);
    if (modo === 'sem-segredo-no-banco') return erro('SEGREDO NAO CONFIGURADO');
    if (a.p_segredo !== segredos.banco) return erro('SEGREDO INVALIDO');
    if (modo === 'validacao') return erro('NUMERO INVALIDO');
    if (modo === 'sem-id') return erro('MENSAGEM SEM ID');
    if (b.vistos.has(a.p_wa_id)) return resp({ ok: true, fato_id: b.vistos.get(a.p_wa_id), liberado: true, repetido: true });
    b.gravados.push(a);
    b.vistos.set(a.p_wa_id, b.gravados.length);
    return resp({ ok: true, fato_id: b.gravados.length, liberado: true, repetido: false });
  };
  b.rpc = () => b.chamadas.map((c) => JSON.parse(c.opts.body));
  b.nada = () => assert.equal(b.chamadas.length, 0, 'não podia ter ido ao banco');
  return b;
}

describe('/api/whatsapp (Meta Cloud API, Supabase simulado)', () => {
  let segredos, banco, fetchOriginal, envOriginal, saida;
  const logsOriginais = {};

  beforeEach(() => {
    segredos = { verify: sorteio('v-'), app: sorteio('a-'), banco: sorteio('b-') };
    banco = criarBanco(segredos);
    fetchOriginal = globalThis.fetch;
    globalThis.fetch = banco.fetch;
    envOriginal = Object.fromEntries(VARS.map((k) => [k, process.env[k]]));
    Object.assign(process.env, { TAF_SUPABASE_URL: BASE, TAF_SUPABASE_KEY: ANON, WHATSAPP_VERIFY_TOKEN: segredos.verify, WHATSAPP_APP_SECRET: segredos.app, WHATSAPP_SEGREDO_BANCO: segredos.banco });
    saida = [];
    for (const k of ['log', 'error', 'warn', 'info']) { logsOriginais[k] = console[k]; console[k] = (...a) => saida.push(a.map(String).join(' ')); }
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    for (const k of VARS) { if (envOriginal[k] === undefined) delete process.env[k]; else process.env[k] = envOriginal[k]; }
    for (const k of Object.keys(logsOriginais)) console[k] = logsOriginais[k];
    // em nenhum teste segredo, número, nome ou texto aparecem no log
    const log = saida.join('\n');
    for (const [nome, v] of Object.entries(segredos)) assert.ok(!log.includes(v), 'o segredo "' + nome + '" apareceu no log');
    for (const v of [NUMERO, NOME, TEXTO, '0001']) assert.ok(!log.includes(v), 'dado da mensagem apareceu no log: ' + v);
  });

  const assinar = (corpo, segredo) => 'sha256=' + crypto.createHmac('sha256', segredo).update(corpo).digest('hex');
  // POST como chega na Vercel sem bodyParser: corpo em fluxo, assinatura sobre os bytes
  const post = (corpo, extra) => {
    const texto = typeof corpo === 'string' ? corpo : JSON.stringify(corpo);
    const headers = Object.assign({ 'x-hub-signature-256': assinar(texto, segredos.app) }, (extra && extra.headers) || {});
    return Object.assign({ method: 'POST', url: '/api/whatsapp', stream: texto }, extra, { headers });
  };
  const get = (q) => ({ method: 'GET', url: '/api/whatsapp' + (q || ''), corpo: undefined, semTipo: true });
  const semSegredo = (r) => { for (const [nome, v] of Object.entries(segredos)) assert.ok(!r.corpo.includes(v), 'o segredo "' + nome + '" voltou na resposta'); };

  describe('verificação (GET)', () => {
    it('token certo: 200 com o hub.challenge cru, em texto', async () => {
      const r = await chamar(handler, get('?hub.mode=subscribe&hub.verify_token=' + encodeURIComponent(segredos.verify) + '&hub.challenge=desafio-123'));
      assert.equal(r.statusCode, 200);
      assert.equal(r.corpo, 'desafio-123');
      assert.match(r.headers['content-type'], /text\/plain/);
      banco.nada();
    });

    it('token errado, modo errado ou sem desafio: 403 e nada volta', async () => {
      for (const q of ['?hub.mode=subscribe&hub.verify_token=' + sorteio('x') + '&hub.challenge=d', '?hub.mode=unsubscribe&hub.verify_token=' + segredos.verify + '&hub.challenge=d',
        '?hub.mode=subscribe&hub.verify_token=' + segredos.verify, '']) {
        const r = await chamar(handler, get(q));
        assert.equal(r.statusCode, 403, q);
        semSegredo(r);
      }
      banco.nada();
    });

    it('sem WHATSAPP_VERIFY_TOKEN: 503 com o nome da variável', async () => {
      delete process.env.WHATSAPP_VERIFY_TOKEN;
      const r = await chamar(handler, get('?hub.mode=subscribe&hub.verify_token=qualquer&hub.challenge=d'));
      assert.equal(r.statusCode, 503);
      assert.deepEqual(r.json(), { ok: false, erro: 'servidor sem configuração (WHATSAPP_VERIFY_TOKEN na Vercel)' });
      banco.nada();
    });

    it('segredo na URL (?token=, ?secret=) é recusado: 400', async () => {
      const r = await chamar(handler, get('?hub.mode=subscribe&hub.verify_token=' + segredos.verify + '&hub.challenge=d&token=x'));
      assert.equal(r.statusCode, 400);
      banco.nada();
    });
  });

  describe('mensagens (POST)', () => {
    it('sem WHATSAPP_APP_SECRET: 503, nada vai ao banco', async () => {
      delete process.env.WHATSAPP_APP_SECRET;
      const r = await chamar(handler, post(lote()));
      assert.equal(r.statusCode, 503);
      assert.match(r.json().erro, /WHATSAPP_APP_SECRET/);
      banco.nada();
    });

    it('assinatura inválida, ausente ou fora do formato: 401, nada vai ao banco', async () => {
      for (const headers of [{ 'x-hub-signature-256': assinar(JSON.stringify(lote()), sorteio('outro-')) }, { 'x-hub-signature-256': '' }, { 'x-hub-signature-256': 'sha1=abc' }]) {
        const r = await chamar(handler, post(lote(), { headers }));
        assert.equal(r.statusCode, 401, JSON.stringify(headers));
        semSegredo(r);
      }
      // corpo alterado depois de assinado
      const texto = JSON.stringify(lote());
      const r = await chamar(handler, { method: 'POST', url: '/api/whatsapp', stream: texto.replace(TEXTO, 'outro texto'), headers: { 'x-hub-signature-256': assinar(texto, segredos.app) } });
      assert.equal(r.statusCode, 401);
      banco.nada();
    });

    it('a assinatura vale para os bytes que chegaram (acentos, emoji, escapes \\u e espaços), não para um JSON reescrito', async () => {
      const bruto = '{ "object": "whatsapp_business_account", "entry": [ { "id": "0", "changes": [ { "field": "messages", "value": { "messaging_product": "whatsapp",\n'
        + '  "contacts": [ { "profile": { "name": "Jo\\u00e3o" }, "wa_id": "' + NUMERO + '" } ],\n'
        + '  "messages": [ { "from": "' + NUMERO + '", "id": "wamid.ACENTO", "timestamp": "1761825600", "type": "text", "text": { "body": "Medi\\u00e7\\u00e3o \\u2705 \u00e1\u00e9" } } ] } } ] } ] }';
      assert.notEqual(JSON.stringify(JSON.parse(bruto)), bruto, 'o teste só vale se reescrever o JSON mudar os bytes');
      const r = await chamar(handler, post(bruto));
      assert.equal(r.statusCode, 200);
      const [a] = banco.rpc();
      assert.equal(a.p_texto, 'Medição ✅ áé');
      assert.equal(a.p_nome, 'João');
      const req = post(bruto);
      req.stream = bruto + ' ';
      assert.equal((await chamar(handler, req)).statusCode, 401);
    });

    it('lote com 1 texto e 1 áudio: 200, a função do banco é chamada 2 vezes com o segredo do banco', async () => {
      const r = await chamar(handler, post(lote()));
      assert.equal(r.statusCode, 200);
      assert.deepEqual(r.json(), { ok: true, mensagens: 2, gravadas: 2, falhas: 0 });
      const ch = banco.rpc();
      assert.equal(ch.length, 2);
      for (const a of ch) {
        assert.equal(a.p_segredo, segredos.banco);
        assert.equal(a.p_de, NUMERO);
        assert.equal(a.p_nome, NOME);
        assert.deepEqual(Object.keys(a).sort(), ['p_bruto', 'p_de', 'p_nome', 'p_quando', 'p_segredo', 'p_texto', 'p_wa_id']);
      }
      assert.equal(ch[0].p_wa_id, 'wamid.T1');
      assert.equal(ch[0].p_texto, TEXTO);
      assert.equal(ch[0].p_quando, '2025-10-30T12:00:00.000Z');
      assert.equal(ch[0].p_bruto.tipo, 'text');
      assert.equal(ch[0].p_bruto.midia, undefined);
      assert.equal(ch[1].p_wa_id, 'wamid.T2');
      assert.equal(ch[1].p_texto, null);
      assert.deepEqual(ch[1].p_bruto.midia, { tipo: 'audio', id: 'midia-1' });
      assert.equal(JSON.stringify(ch[1]).includes('audio/ogg'), false, 'só tipo e id da mídia');
      // nunca pede nada à Meta nem baixa mídia
      assert.ok(banco.chamadas.every((c) => c.url.startsWith(BASE + '/rest/v1/rpc/ia_whatsapp_receber')));
      semSegredo(r);
    });

    // MUDANÇA DELIBERADA (reenvio em falha passageira). Antes este teste afirmava 200 quando o banco falhava, e a mensagem se perdia:
    // a Meta só reenvia o que não recebe 200. Agora falha PASSAGEIRA (rede, resposta cortada, 5xx, chave do banco recusada, função do
    // 09 ainda não aplicada, segredo ainda não configurado ou recusado no banco) responde 503 e a Meta reenvia o mesmo lote. Reenviar
    // é seguro: a função do banco grava uma vez só por id de mensagem (hash md5('wa:'||id)), e o banco simulado aqui faz o mesmo.
    it('falha passageira do banco (rede, resposta cortada, 5xx, chave recusada, sem a função, segredo não configurado ou recusado): 503 para a Meta reenviar', async () => {
      for (const modo of ['fora', 'corta', '5xx', '5xx-com-texto-de-validacao', 'chave-recusada', 'sem-funcao', 'sem-segredo-no-banco']) {
        banco.modo = modo;
        const r = await chamar(handler, post(lote()));
        assert.equal(r.statusCode, 503, modo);
        assert.deepEqual(r.json(), { ok: false, erro: 'o banco não gravou agora; o provedor reenvia e a gravação não duplica', mensagens: 2, gravadas: 0, falhas: 2 }, modo);
        semSegredo(r);
      }
      banco.modo = 'normal';
      process.env.WHATSAPP_SEGREDO_BANCO = sorteio('errado-');   // o banco recusa o segredo (SEGREDO INVALIDO)
      const r = await chamar(handler, post(lote()));
      assert.equal(r.statusCode, 503);
      assert.ok(saida.some((l) => /falta aplicar o 09_whatsapp_entrada\.sql/.test(l)), 'o log diz o que falta aplicar');
      assert.ok(saida.some((l) => /segredo recusado pelo banco/.test(l)));
      assert.ok(saida.some((l) => /segredo não configurado no banco/.test(l)));
    });

    // Falha PERMANENTE: o banco leu a mensagem e disse que não presta. Reenviar não muda nada, então conta e responde 200 (não fica
    // reenviando para sempre). Isto continua como era; só ficou explícito que é a exceção.
    it('recusa por validação do banco (NUMERO INVALIDO, MENSAGEM SEM ID): conta a falha e responde 200, reenviar não adiantaria', async () => {
      for (const modo of ['validacao', 'sem-id']) {
        banco.modo = modo;
        const r = await chamar(handler, post(lote()));
        assert.equal(r.statusCode, 200, modo);
        assert.deepEqual(r.json(), { ok: true, mensagens: 2, gravadas: 0, falhas: 2 }, modo);
      }
      assert.ok(saida.some((l) => /recusada pelo banco \(validação\)/.test(l)));
    });

    it('lote misto: uma gravada e uma falha passageira = 503; a Meta reenvia o lote e a já gravada volta repetida, sem duplicar', async () => {
      banco.modoPor['wamid.T2'] = 'fora';
      const r1 = await chamar(handler, post(lote()));
      assert.equal(r1.statusCode, 503);
      assert.deepEqual({ m: r1.json().mensagens, g: r1.json().gravadas, f: r1.json().falhas }, { m: 2, g: 1, f: 1 });
      assert.equal(banco.gravados.length, 1);
      banco.modoPor = {};   // o banco voltou
      const r2 = await chamar(handler, post(lote()));   // o reenvio da Meta: o mesmo lote
      assert.equal(r2.statusCode, 200);
      assert.deepEqual(r2.json(), { ok: true, mensagens: 2, gravadas: 2, falhas: 0 });
      assert.deepEqual(banco.gravados.map((g) => g.p_wa_id), ['wamid.T1', 'wamid.T2'], 'cada mensagem gravada uma vez só');
    });

    it('lote misto: uma gravada e uma recusada por validação = 200 com a falha contada', async () => {
      banco.modoPor['wamid.T2'] = 'validacao';
      const r = await chamar(handler, post(lote()));
      assert.equal(r.statusCode, 200);
      assert.deepEqual(r.json(), { ok: true, mensagens: 2, gravadas: 1, falhas: 1 });
    });

    it('uma falha passageira e uma permanente no mesmo lote: 503 (a passageira manda)', async () => {
      banco.modoPor['wamid.T1'] = 'validacao';
      banco.modoPor['wamid.T2'] = '5xx';
      const r = await chamar(handler, post(lote()));
      assert.equal(r.statusCode, 503);
    });

    it('status de entrega, lote vazio ou JSON que não é da Meta: 200 e nada vai ao banco', async () => {
      const status = { object: 'whatsapp_business_account', entry: [{ id: '0', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', statuses: [{ id: 'wamid.T1', status: 'delivered' }] } }] }] };
      for (const corpo of [status, { object: 'whatsapp_business_account', entry: [] }, { object: 'page', entry: [] }, 'texto que não é json']) {
        const r = await chamar(handler, post(corpo));
        assert.equal(r.statusCode, 200, JSON.stringify(corpo).slice(0, 40));
        assert.equal(r.json().gravadas || 0, 0);
      }
      banco.nada();
    });

    it('falta WHATSAPP_SEGREDO_BANCO ou o banco: 503 depois de conferir a assinatura', async () => {
      for (const k of ['WHATSAPP_SEGREDO_BANCO', 'TAF_SUPABASE_KEY']) {
        const antes = process.env[k];
        delete process.env[k];
        const r = await chamar(handler, post(lote()));
        assert.equal(r.statusCode, 503, k);
        assert.match(r.json().erro, new RegExp(k));
        process.env[k] = antes;
      }
      banco.nada();
    });

    it('corpo já convertido pelo ajudante da Vercel (objeto): a assinatura é conferida sobre o JSON compacto', async () => {
      const texto = JSON.stringify(lote());
      const r = await chamar(handler, { method: 'POST', url: '/api/whatsapp', corpo: JSON.parse(texto), headers: { 'x-hub-signature-256': assinar(texto, segredos.app) } });
      assert.equal(r.statusCode, 200);
      assert.equal(banco.rpc().length, 2);
    });

    it('outro método: 405; corpo grande: 413', async () => {
      assert.equal((await chamar(handler, { method: 'PUT', url: '/api/whatsapp', corpo: {} })).statusCode, 405);
      const grande = JSON.stringify({ object: 'whatsapp_business_account', entry: [], x: 'a'.repeat(handler.LIMITE_BYTES) });
      assert.equal((await chamar(handler, post(grande))).statusCode, 413);
      banco.nada();
    });
  });

  it('extrairMensagens: ignora entrada torta e limita a 50 por lote', () => {
    assert.deepEqual(handler.extrairMensagens(null), []);
    assert.deepEqual(handler.extrairMensagens({ entry: [{ changes: [{ value: { messages: [{ id: 'x' }, { from: '1' }, 'nada'] } }] }] }), []);
    const muitos = lote();
    muitos.entry[0].changes[0].value.messages = Array.from({ length: 80 }, (_, i) => ({ from: NUMERO, id: 'wamid.' + i, timestamp: '1', type: 'text', text: { body: 'm' + i } }));
    assert.equal(handler.extrairMensagens(muitos).length, 50);
  });

  it('o endpoint não tem chave, endereço do banco nem número no código', () => {
    const t = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'api', 'whatsapp.js'), 'utf8');
    assert.ok(!/sb_(publishable|secret)_/.test(t));
    assert.ok(!/https:\/\/[a-z0-9]{12,}\.supabase\.co/.test(t));
    assert.ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(t));
    assert.ok(!/graph\.facebook\.com/.test(t), 'nunca chama a API da Meta');
    assert.ok(!/\+?55\d{10,}/.test(t), 'número de telefone no código');
  });
});
