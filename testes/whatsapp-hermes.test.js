'use strict';
// node --test testes/    (sem pacote, sem rede, sem banco real). Botão de aprovação e cópia para o Hermes no /api/whatsapp.
// Supabase e Hermes simulados no mesmo fetch. Números, nomes e textos inventados; a assinatura da Meta é calculada aqui.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const handler = require('../public/api/whatsapp.js');
const bird = require('../public/api/whatsapp-bird.js');
const { BASE, ANON, chamar } = require('./_apoio.js');

const sorteio = (p) => p + crypto.randomBytes(16).toString('hex');
const NUMERO = '5500000000001', NOME = 'Pessoa Teste', TEXTO = 'Bertioga: 3 ramais hoje (teste)';
// ".invalid" nunca resolve (RFC 2606) e o caminho leva um "segredo" para provar que a URL nunca vai para o log
const HERMES = 'https://hermes.exemplo.invalid/whatsapp/webhook?k=caminho-secreto';
const VARS = ['TAF_SUPABASE_URL', 'TAF_SUPABASE_KEY', 'WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_APP_SECRET', 'WHATSAPP_SEGREDO_BANCO', 'HERMES_WEBHOOK_URL', 'BIRD_WEBHOOK_SECRET'];

// ---- mensagens e entregas como a Meta manda (documentação: "Interactive messages webhook reference")
const msgTexto = (id, body) => ({ from: NUMERO, id, timestamp: '1761825600', type: 'text', text: { body } });
const msgBotao = (id, botaoId, titulo) => ({ context: { from: '550000000000', id: 'wamid.ORIGEM' }, from: NUMERO, id, timestamp: '1761825600', type: 'interactive',
  interactive: { type: 'button_reply', button_reply: { id: botaoId, title: titulo } } });
const msgLista = (id, linhaId, titulo, descricao) => ({ context: { from: '550000000000', id: 'wamid.ORIGEM' }, from: NUMERO, id, timestamp: '1761825600', type: 'interactive',
  interactive: { type: 'list_reply', list_reply: { id: linhaId, title: titulo, description: descricao } } });
// toque em botão de resposta rápida de MODELO de mensagem: type "button" com button { payload, text }, sem interactive (documentação: "Button messages webhook reference")
const msgBotaoModelo = (id, button) => ({ context: { from: '550000000000', id: 'wamid.MODELO' }, from: NUMERO, id, timestamp: '1761825600', type: 'button', button });
const msgInterativa = (id, interactive) => ({ from: NUMERO, id, timestamp: '1761825600', type: 'interactive', interactive });
function entrega(mensagens) {
  return { object: 'whatsapp_business_account', entry: [{ id: '0', changes: [{ field: 'messages', value: {
    messaging_product: 'whatsapp', metadata: { display_phone_number: '550000000000', phone_number_id: '0' },
    contacts: [{ profile: { name: NOME }, wa_id: NUMERO }], messages: mensagens } }] }] };
}
const aviso = () => ({ object: 'whatsapp_business_account', entry: [{ id: '0', changes: [{ field: 'messages', value: {
  messaging_product: 'whatsapp', metadata: { display_phone_number: '550000000000', phone_number_id: '0' },
  statuses: [{ id: 'wamid.ENVIADA', status: 'delivered', timestamp: '1761825600', recipient_id: NUMERO }] } }] }] });

// ---- mundo simulado: o banco (RPC) e o Hermes (qualquer outra URL) no mesmo fetch
// banco.modo: normal | fora | 5xx | validacao.   hermes.modo: ok | fora | lento | 500 | 401 | 302
function criarMundo(segredoBanco) {
  const m = { banco: { chamadas: [], modo: 'normal', espera: null, terminou: false }, hermes: { chamadas: [], modo: 'ok', atrasoMs: 0, terminou: false } };
  m.hermes.chegou = new Promise((r) => { m.hermes.avisarChegada = r; });
  const resp = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
  m.fetch = async function (url, opts) {
    url = String(url);
    if (url.startsWith(BASE + '/rest/v1/rpc/')) {
      m.banco.chamadas.push({ url, opts });
      try {
        if (m.banco.espera) await m.banco.espera();
        if (m.banco.modo === 'fora') throw Object.assign(new Error('rede caiu'), { name: 'TypeError' });
        if (m.banco.modo === '5xx') return resp({ message: 'canceling statement due to statement timeout' }, 503);
        if (m.banco.modo === 'validacao') return resp({ code: 'P0001', message: 'NUMERO INVALIDO' }, 400);
        if (JSON.parse(opts.body).p_segredo !== segredoBanco) return resp({ code: 'P0001', message: 'SEGREDO INVALIDO' }, 400);
        return resp({ ok: true, fato_id: m.banco.chamadas.length, liberado: true, repetido: false });
      } finally { m.banco.terminou = true; }
    }
    // qualquer outra URL é o Hermes
    m.hermes.chamadas.push({ url, opts, corpo: Buffer.from(opts.body) });
    m.hermes.avisarChegada();
    try {
      if (m.hermes.atrasoMs) await new Promise((r) => setTimeout(r, m.hermes.atrasoMs));
      if (m.hermes.modo === 'fora') throw Object.assign(new Error('rede caiu'), { name: 'TypeError' });
      if (m.hermes.modo === 'lento') {
        const segurar = setInterval(() => {}, 1000);   // AbortSignal.timeout não mantém o event loop vivo; no Vercel quem mantém é o socket de verdade
        try { await new Promise((_, rej) => opts.signal.addEventListener('abort', () => rej(opts.signal.reason), { once: true })); } finally { clearInterval(segurar); }
      }
      if (m.hermes.modo === '500') return new Response('erro do hermes', { status: 500 });
      if (m.hermes.modo === '401') return new Response('assinatura nao confere', { status: 401 });
      if (m.hermes.modo === '302') return new Response(null, { status: 302, headers: { Location: 'https://outro.exemplo.invalid/whatsapp/webhook' } });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    } finally { m.hermes.terminou = true; }
  };
  m.rpc = () => m.banco.chamadas.map((c) => JSON.parse(c.opts.body));
  return m;
}

describe('/api/whatsapp: botão de aprovação e cópia para o Hermes (Supabase e Hermes simulados)', () => {
  let segredoApp, segredoBanco, mundo, fetchOriginal, envOriginal, saida, cfgOriginal, assinaturas;
  const logsOriginais = {};

  beforeEach(() => {
    segredoApp = sorteio('a-'); segredoBanco = sorteio('b-'); assinaturas = [];
    mundo = criarMundo(segredoBanco);
    fetchOriginal = globalThis.fetch;
    globalThis.fetch = mundo.fetch;
    envOriginal = Object.fromEntries(VARS.map((k) => [k, process.env[k]]));
    Object.assign(process.env, { TAF_SUPABASE_URL: BASE, TAF_SUPABASE_KEY: ANON, WHATSAPP_VERIFY_TOKEN: sorteio('v-'), WHATSAPP_APP_SECRET: segredoApp,
      WHATSAPP_SEGREDO_BANCO: segredoBanco, HERMES_WEBHOOK_URL: HERMES });
    delete process.env.BIRD_WEBHOOK_SECRET;
    cfgOriginal = { ...handler.CONFIG };
    saida = [];
    for (const k of ['log', 'error', 'warn', 'info']) { logsOriginais[k] = console[k]; console[k] = (...a) => saida.push(a.map(String).join(' ')); }
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    for (const k of VARS) { if (envOriginal[k] === undefined) delete process.env[k]; else process.env[k] = envOriginal[k]; }
    Object.assign(handler.CONFIG, cfgOriginal);
    for (const k of Object.keys(logsOriginais)) console[k] = logsOriginais[k];
    // em nenhum teste a URL do Hermes (nem o segredo que ela leva), segredo, número, nome, texto ou assinatura aparecem no log
    const log = saida.join('\n');
    for (const v of [segredoApp, segredoBanco, 'hermes.exemplo.invalid', 'caminho-secreto', 'senha-secreta', NUMERO, NOME, TEXTO, '0001', 'Aprovar', 'Recusar']) assert.ok(!log.includes(v), 'dado sensível apareceu no log: ' + v);
    for (const a of assinaturas) if (a.length > 16) assert.ok(!log.includes(a.replace(/^sha256=/, '')), 'uma assinatura apareceu no log');
  });

  const assinar = (texto) => 'sha256=' + crypto.createHmac('sha256', segredoApp).update(texto).digest('hex');
  // POST como a Vercel entrega com bodyParser desligado: corpo em fluxo (os bytes exatos) e a assinatura da Meta sobre eles
  const post = (corpo, o) => {
    o = o || {};
    const texto = typeof corpo === 'string' ? corpo : JSON.stringify(corpo);
    const sig = o.assinatura !== undefined ? o.assinatura : assinar(texto);
    assinaturas.push(sig);
    return { method: 'POST', url: '/api/whatsapp', stream: texto, headers: Object.assign({ 'x-hub-signature-256': sig }, o.headers || {}) };
  };
  const OK = { ok: true, mensagens: 1, gravadas: 1, falhas: 0 };

  describe('toque em botão e em lista vira texto', () => {
    it('botão de aprovar: o id "ok 12" vira o texto; tipo interactive e botao true; título e conteúdo não são gravados', async () => {
      const r = await chamar(handler, post(entrega([msgBotao('wamid.B1', 'ok 12', 'Aprovar')])));
      assert.equal(r.statusCode, 200);
      assert.deepEqual(r.json(), OK);
      const [a] = mundo.rpc();
      assert.equal(a.p_texto, 'ok 12');
      assert.equal(a.p_wa_id, 'wamid.B1');
      assert.equal(a.p_de, NUMERO);
      assert.deepEqual(a.p_bruto, { tipo: 'interactive', timestamp: '1761825600', responde_a: 'wamid.ORIGEM', botao: true });
      assert.ok(!JSON.stringify(a).includes('Aprovar'), 'o título do botão foi para o banco');
    });

    it('botão de recusar: o id "nao 12", sem acento, vira o texto', async () => {
      const r = await chamar(handler, post(entrega([msgBotao('wamid.B2', 'nao 12', 'Recusar')])));
      assert.equal(r.statusCode, 200);
      const [a] = mundo.rpc();
      assert.equal(a.p_texto, 'nao 12');
      assert.equal(a.p_bruto.tipo, 'interactive');
      assert.equal(a.p_bruto.botao, true);
      assert.ok(!JSON.stringify(a).includes('Recusar'), 'o título do botão foi para o banco');
    });

    it('linha de lista: o id da linha vira o texto; título e descrição não são gravados', async () => {
      const r = await chamar(handler, post(entrega([msgLista('wamid.L1', 'ok 7', 'Aprovar a 7', 'Compra de tubos da obra de teste')])));
      assert.equal(r.statusCode, 200);
      const [a] = mundo.rpc();
      assert.equal(a.p_texto, 'ok 7');
      assert.equal(a.p_bruto.botao, true);
      assert.equal(a.p_bruto.tipo, 'interactive');
      assert.ok(!/Aprovar a 7|tubos/.test(JSON.stringify(a)), 'título ou descrição da linha foi para o banco');
    });

    it('texto digitado continua igual: sem botao, e o corpo da mensagem vai inteiro', async () => {
      await chamar(handler, post(entrega([msgTexto('wamid.T1', 'ok 12')])));
      const [a] = mundo.rpc();
      assert.equal(a.p_texto, 'ok 12');
      assert.deepEqual(a.p_bruto, { tipo: 'text', timestamp: '1761825600' });
    });

    it('interactive de outro tipo (product, fluxo) ou resposta sem id: só o tipo, sem texto e sem botao', async () => {
      const casos = [
        { type: 'product', product: { retailer_id: 'x1', title: 'Camiseta', description: 'algodão', price_amount: 1000 } },
        { type: 'nfm_reply', nfm_reply: { name: 'flow', body: 'Sent', response_json: '{"dado-do-fluxo":"x"}' } },
        { type: 'button_reply', button_reply: { title: 'Aprovar' } },
        { type: 'button_reply', button_reply: { id: '   ', title: 'Aprovar' } },
        { type: 'button_reply', button_reply: { id: 12, title: 'Aprovar' } },
        { type: 'button_reply' },
        { type: 'list_reply', list_reply: null },
        'texto solto',
        null,
      ];
      for (const [i, interactive] of casos.entries()) {
        mundo.banco.chamadas.length = 0;
        const r = await chamar(handler, post(entrega([msgInterativa('wamid.O' + i, interactive)])));
        assert.equal(r.statusCode, 200, JSON.stringify(interactive));
        const [a] = mundo.rpc();
        assert.equal(a.p_texto, null, JSON.stringify(interactive));
        assert.equal(a.p_bruto.tipo, 'interactive');
        assert.equal(a.p_bruto.botao, undefined, JSON.stringify(interactive));
        assert.ok(!/Camiseta|algodão|dado-do-fluxo|response_json/.test(JSON.stringify(a)), 'conteúdo do interactive foi para o banco');
      }
    });

    it('o id do botão é cortado no máximo da Meta (256 caracteres)', async () => {
      await chamar(handler, post(entrega([msgBotao('wamid.G1', 'ok ' + '1'.repeat(400), 'Aprovar')])));
      assert.equal(mundo.rpc()[0].p_texto.length, 256);
    });

    it('botão de resposta rápida de MODELO (type button): o payload vira o texto; tipo button e botao true; o rótulo não é gravado', async () => {
      for (const [payload, rotulo] of [['ok 12', 'Aprovar'], ['nao 12', 'Recusar']]) {
        mundo.banco.chamadas.length = 0;
        const r = await chamar(handler, post(entrega([msgBotaoModelo(sorteio('wamid.MB'), { payload, text: rotulo })])));
        assert.equal(r.statusCode, 200, payload);
        assert.deepEqual(r.json(), OK, payload);
        const [a] = mundo.rpc();
        assert.equal(a.p_texto, payload);
        assert.deepEqual(a.p_bruto, { tipo: 'button', timestamp: '1761825600', responde_a: 'wamid.MODELO', botao: true });
        assert.ok(!JSON.stringify(a).includes(rotulo), 'o rótulo do botão foi para o banco');
      }
    });

    it('botão de modelo sem payload aproveitável: o rótulo só vale se ele mesmo for o comando (ok N, nao N, não N)', async () => {
      const valem = [[{ text: 'ok 12' }, 'ok 12'], [{ text: 'nao 7' }, 'nao 7'], [{ text: 'não 7' }, 'não 7'], [{ payload: '', text: 'ok 3' }, 'ok 3'],
        [{ payload: '   ', text: 'ok 3' }, 'ok 3'], [{ payload: 5, text: 'ok 3' }, 'ok 3'], [{ payload: { a: 1 }, text: 'nao 4' }, 'nao 4'], [{ payload: null, text: 'ok 9' }, 'ok 9'],
        [{ payload: ['ok 1'], text: 'ok 9' }, 'ok 9']];
      for (const [button, esperado] of valem) {
        mundo.banco.chamadas.length = 0;
        const r = await chamar(handler, post(entrega([msgBotaoModelo(sorteio('wamid.MR'), button)])));
        assert.equal(r.statusCode, 200, JSON.stringify(button));
        const [a] = mundo.rpc();
        assert.equal(a.p_texto, esperado, JSON.stringify(button));
        assert.deepEqual([a.p_bruto.tipo, a.p_bruto.botao], ['button', true], JSON.stringify(button));
      }
    });

    it('botão de modelo malformado ou com rótulo que não é comando: mensagem de tipo desconhecido, sem texto, sem botao e sem o rótulo', async () => {
      const ruins = [{ text: 'Aprovar' }, { text: 'Ok 12' }, { text: 'OK 12' }, { text: 'ok  12' }, { text: 'ok 12 ' }, { text: ' ok 12' }, { text: 'ok 12x' }, { text: 'ok' }, { text: 'nao' },
        { text: 'aprovar 12' }, { text: 12 }, { text: null }, {}, { payload: '', text: '' }, { payload: '  ', text: 'Aprovar' }, { payload: 5 }, { payload: { a: 1 }, text: 'Recusar' },
        { payload: null }, [], null, 'texto solto', 7];
      for (const [i, button] of ruins.entries()) {
        mundo.banco.chamadas.length = 0;
        const r = await chamar(handler, post(entrega([msgBotaoModelo('wamid.MX' + i, button)])));
        assert.equal(r.statusCode, 200, JSON.stringify(button));
        const [a] = mundo.rpc();
        assert.equal(a.p_texto, null, JSON.stringify(button));
        assert.deepEqual(a.p_bruto, { tipo: 'unknown', timestamp: '1761825600', responde_a: 'wamid.MODELO' }, JSON.stringify(button));
        assert.ok(!/Aprovar|Recusar|Ok 12/.test(JSON.stringify(a)), 'o rótulo do botão foi para o banco: ' + JSON.stringify(button));
      }
    });

    it('botão de modelo: o payload ganha do rótulo, qualquer que seja o rótulo; é o texto que o remetente definiu no envio, e é cortado em 256', async () => {
      await chamar(handler, post(entrega([msgBotaoModelo('wamid.MP1', { payload: 'ok 12', text: 'nao 99' })])));
      await chamar(handler, post(entrega([msgBotaoModelo('wamid.MP2', { payload: 'DADO-DEFINIDO-NO-ENVIO', text: 'Aprovar' })])));
      await chamar(handler, post(entrega([msgBotaoModelo('wamid.MP3', { payload: 'ok ' + '1'.repeat(400), text: 'x' })])));
      const [a, b, c] = mundo.rpc();
      assert.equal(a.p_texto, 'ok 12');
      assert.equal(b.p_texto, 'DADO-DEFINIDO-NO-ENVIO');
      assert.equal(c.p_texto.length, 256);
    });

    it('extrairMensagens: a mesma regra sem passar pelo endpoint', () => {
      const [b, l, t, o, m, d] = handler.extrairMensagens(entrega([
        msgBotao('wamid.U1', 'nao 5', 'Recusar'), msgLista('wamid.U2', 'ok 6', 'x', 'y'), msgTexto('wamid.U3', 'oi'),
        msgInterativa('wamid.U4', { type: 'product', product: { title: 'x' } }), msgBotaoModelo('wamid.U5', { payload: 'ok 8', text: 'Aprovar' }),
        msgBotaoModelo('wamid.U6', { text: 'Aprovar' })]));
      assert.deepEqual([b.texto, b.bruto.botao, l.texto, l.bruto.botao, t.texto, t.bruto.botao, o.texto, o.bruto.botao, m.texto, m.bruto.botao, d.texto, d.bruto.botao],
        ['nao 5', true, 'ok 6', true, 'oi', undefined, null, undefined, 'ok 8', true, null, undefined]);
      assert.deepEqual([b.bruto.tipo, l.bruto.tipo, t.bruto.tipo, o.bruto.tipo, m.bruto.tipo, d.bruto.tipo], ['interactive', 'interactive', 'text', 'interactive', 'button', 'unknown']);
    });
  });

  describe('cópia para o Hermes', () => {
    it('entrega com texto: grava no banco e encaminha ao Hermes uma vez, com o corpo idêntico byte a byte e a assinatura original', async () => {
      // JSON "à moda da Meta": escapes \u, emoji, espaços e quebras de linha que JSON.stringify(JSON.parse(isto)) não reproduziria
      const bruto = '{ "object": "whatsapp_business_account",\n  "entry": [ { "id": "0", "changes": [ { "field": "messages", "value": { "messaging_product": "whatsapp",\n'
        + '  "contacts": [ { "profile": { "name": "Jo\\u00e3o" }, "wa_id": "' + NUMERO + '" } ],\n'
        + '  "messages": [ { "from": "' + NUMERO + '", "id": "wamid.BYTES", "timestamp": "1761825600", "type": "text", "text": { "body": "Medi\\u00e7\\u00e3o \\u2705 áé ok" } } ] } } ] } ] }\n';
      assert.notEqual(JSON.stringify(JSON.parse(bruto)), bruto, 'o teste só vale se reescrever o JSON mudar os bytes');
      const req = post(bruto);
      const r = await chamar(handler, req);
      assert.equal(r.statusCode, 200);
      assert.deepEqual(r.json(), OK);
      assert.equal(mundo.banco.chamadas.length, 1);
      assert.equal(mundo.hermes.chamadas.length, 1);
      const h = mundo.hermes.chamadas[0];
      assert.equal(Buffer.compare(h.corpo, Buffer.from(bruto, 'utf8')), 0, 'o corpo encaminhado não é idêntico ao original');
      assert.ok(Buffer.isBuffer(h.opts.body), 'o corpo vai como bytes, não como texto reescrito');
      assert.equal(h.opts.headers['X-Hub-Signature-256'], req.headers['x-hub-signature-256']);
      assert.ok(saida.some((l) => /whatsapp: encaminhado ao Hermes/.test(l)));
    });

    it('a assinatura vai exatamente como veio, até na caixa das letras', async () => {
      const texto = JSON.stringify(entrega([msgTexto('wamid.CX', TEXTO)]));
      const maiuscula = 'sha256=' + crypto.createHmac('sha256', segredoApp).update(texto).digest('hex').toUpperCase();
      const r = await chamar(handler, post(texto, { assinatura: maiuscula }));
      assert.equal(r.statusCode, 200);
      assert.equal(mundo.hermes.chamadas[0].opts.headers['X-Hub-Signature-256'], maiuscula);
    });

    it('para o Hermes vão só o método POST, o Content-Type e a assinatura: nenhuma chave do banco, sem redirecionamento, com tempo limite', async () => {
      await chamar(handler, post(entrega([msgTexto('wamid.H1', TEXTO)])));
      const { url, opts } = mundo.hermes.chamadas[0];
      assert.equal(url, HERMES);
      assert.equal(opts.method, 'POST');
      assert.deepEqual(Object.keys(opts.headers).sort(), ['Content-Type', 'X-Hub-Signature-256']);
      assert.equal(opts.headers['Content-Type'], 'application/json');
      assert.equal(opts.redirect, 'manual');
      assert.ok(opts.signal instanceof AbortSignal);
      assert.ok(!JSON.stringify(opts.headers).includes(ANON), 'a chave do banco foi para o Hermes');
    });

    it('toque em botão, em lista e em botão de modelo que são comando de aprovação: gravados como texto, mas NÃO encaminhados (o banco trata; o Hermes responderia como conversa)', async () => {
      await chamar(handler, post(entrega([msgBotao('wamid.HB', 'ok 12', 'Aprovar')])));
      await chamar(handler, post(entrega([msgLista('wamid.HL', 'nao 12', 'Recusar', 'd')])));
      await chamar(handler, post(entrega([msgBotaoModelo('wamid.HM', { payload: 'ok 13', text: 'Aprovar' })])));
      assert.equal(mundo.hermes.chamadas.length, 0, 'toque de aprovação foi encaminhado');
      assert.deepEqual(mundo.rpc().map((a) => a.p_texto), ['ok 12', 'nao 12', 'ok 13']);
    });

    it('toque em botão, lista ou modelo que NÃO é comando de aprovação continua indo ao Hermes, inteiro, como a Meta mandou', async () => {
      await chamar(handler, post(entrega([msgBotao('wamid.HB2', 'ver 12', 'Ver detalhes')])));
      await chamar(handler, post(entrega([msgLista('wamid.HL2', 'obra 343', 'Obra 343', 'CAESB')])));
      await chamar(handler, post(entrega([msgBotaoModelo('wamid.HM2', { payload: 'detalhar 5', text: 'Detalhar' })])));
      assert.equal(mundo.hermes.chamadas.length, 3);
      assert.ok(mundo.hermes.chamadas[0].corpo.toString('utf8').includes('"button_reply"'), 'o Hermes recebe o toque inteiro, como a Meta mandou');
    });

    it('comando digitado (ok 12, sim #7, NÃO 12: falta o documento) não é encaminhado; frase comum que só parece comando é', async () => {
      const comandos = ['ok 12', 'OK 12.', 'sim #7', 'aprovo 3!', 'pode 41', 'não 12', 'NÃO 12: falta o documento', 'recuso 5 - sem nota', 'cancela 9'];
      const frases = ['ok 3 equipes', 'não 3,5 metros', 'não 12:30 da tarde', 'não 12 falta documento', 'ok', 'pode ser amanhã', 'sim 12 3'];
      let i = 0;
      for (const t of comandos) await chamar(handler, post(entrega([msgTexto('wamid.C' + (i++), t)])));
      assert.equal(mundo.hermes.chamadas.length, 0, 'comando de aprovação foi encaminhado');
      assert.equal(mundo.banco.chamadas.length, comandos.length, 'o banco precisa receber todos');
      for (const t of frases) await chamar(handler, post(entrega([msgTexto('wamid.F' + (i++), t)])));
      assert.equal(mundo.hermes.chamadas.length, frases.length, 'frase comum precisa ir ao Hermes');
    });

    it('entrega com comando e conversa juntos, ou com mensagem que o banco não leu, vai ao Hermes (na dúvida a cópia sai)', async () => {
      await chamar(handler, post(entrega([msgBotao('wamid.X1', 'ok 12', 'Aprovar'), msgTexto('wamid.X2', 'bom dia')])));
      assert.equal(mundo.hermes.chamadas.length, 1);
      const semId = { from: NUMERO, timestamp: '1', type: 'text', text: { body: 'qualquer coisa' } };
      await chamar(handler, post(entrega([msgBotao('wamid.X3', 'ok 13', 'Aprovar'), semId])));
      assert.equal(mundo.hermes.chamadas.length, 2);
    });

    it('a gramática de comando daqui é a da função do banco (10_whatsapp_aprovacao.sql): mesma resposta para uma bateria de frases', () => {
      const sql = fs.readFileSync(path.join(__dirname, '..', 'fonte', 'erp', 'sql', '10_whatsapp_aprovacao.sql'), 'utf8');
      const regs = [...sql.matchAll(/regexp_match\(v_texto, '((?:[^']|'')*)', 'i'\)/g)].map((m) => m[1].replace(/''/g, "'"));
      assert.equal(regs.length, 2, 'esperava as duas expressões (aprovar e recusar) no SQL');
      const doBanco = regs.map((r) => new RegExp(r.replace('(.*)', '([\\s\\S]*)'), 'i'));   // no Postgres o ponto também pega quebra de linha
      const frases = ['ok 12', 'OK 12.', 'sim #7', 'aprovo 3!', 'pode 41', 'aprovado 123456789', 'ok 1234567890', ' ok 7 ', '\tNao 8', 'não 12', 'NÃO 12: falta o documento',
        'não 10: motivo\nsegunda linha', 'recuso 5 - sem nota', 'recusado #2;', 'cancela 9', 'ok 3 equipes', 'não 3,5 metros', 'não 3.5 toneladas', 'não 12:30 da tarde',
        'não 12-15 pessoas', 'não 12 falta documento', 'ok', 'pode ser amanhã', 'sim 12 3', 'bom dia', '', 'ok 12 ok 13', 'aprova 12', 'não, 12'];
      for (const t of frases) assert.equal(handler.ehComandoDeAprovacao(t), doBanco.some((re) => re.test(t)), 'descompasso com o banco em: ' + JSON.stringify(t));
    });

    it('entrega com várias mensagens: uma cópia só', async () => {
      const r = await chamar(handler, post(entrega([msgTexto('wamid.M1', 'a'), msgBotao('wamid.M2', 'ok 1', 'x'), msgTexto('wamid.M3', 'c')])));
      assert.deepEqual(r.json(), { ok: true, mensagens: 3, gravadas: 3, falhas: 0 });
      assert.equal(mundo.hermes.chamadas.length, 1);
      assert.equal(mundo.banco.chamadas.length, 3);
    });

    it('aviso de status (entregue, lido...) não é encaminhado e não vai ao banco; também não: entrega vazia, de outro produto ou que não é JSON', async () => {
      const casos = [aviso(), { object: 'whatsapp_business_account', entry: [] }, entrega([]), { object: 'page', entry: entrega([msgTexto('wamid.Z', 'x')]).entry }, 'isto não é json'];
      for (const caso of casos) {
        const r = await chamar(handler, post(caso));
        assert.equal(r.statusCode, 200, JSON.stringify(caso).slice(0, 60));
      }
      assert.equal(mundo.hermes.chamadas.length, 0);
      assert.equal(mundo.banco.chamadas.length, 0);
    });

    it('o que decide é a entrega trazer mensagem, mesmo que o banco não aproveite (mensagem sem id)', async () => {
      const semId = entrega([{ from: NUMERO, timestamp: '1', type: 'text', text: { body: TEXTO } }]);
      const r = await chamar(handler, post(semId));
      assert.equal(r.statusCode, 200);
      assert.equal(mundo.banco.chamadas.length, 0);
      assert.equal(mundo.hermes.chamadas.length, 1);
    });

    it('sem HERMES_WEBHOOK_URL (ausente, vazia ou só espaços): nada é encaminhado e nada é avisado', async () => {
      for (const v of [undefined, '', '   ']) {
        if (v === undefined) delete process.env.HERMES_WEBHOOK_URL; else process.env.HERMES_WEBHOOK_URL = v;
        const r = await chamar(handler, post(entrega([msgTexto(sorteio('wamid.S'), TEXTO)])));
        assert.equal(r.statusCode, 200);
      }
      assert.equal(mundo.hermes.chamadas.length, 0);
      assert.equal(mundo.banco.chamadas.length, 3);
      assert.ok(!saida.some((l) => /HERMES|encaminh/i.test(l)), 'avisou de uma cópia que ninguém configurou');
    });

    it('URL inválida ou insegura (texto solto, ftp, http fora do localhost, usuário e senha na URL): ignorada com aviso sem a URL; a gravação segue', async () => {
      const ruins = ['isto não é url', 'hermes.exemplo.invalid/webhook', '//hermes.exemplo.invalid/webhook', 'ftp://hermes.exemplo.invalid/x', 'http://hermes.exemplo.invalid/x?k=caminho-secreto',
        'http://127.0.0.2/x', 'http://localhost.exemplo.invalid/x', 'https://usuario:senha-secreta@hermes.exemplo.invalid/x', 'javascript:alert(1)'];
      for (const url of ruins) {
        process.env.HERMES_WEBHOOK_URL = url;
        const antes = saida.length;
        const r = await chamar(handler, post(entrega([msgTexto(sorteio('wamid.U'), TEXTO)])));
        assert.equal(r.statusCode, 200, url);
        assert.deepEqual(r.json(), OK, url);
        const novos = saida.slice(antes).join('\n');
        assert.match(novos, /HERMES_WEBHOOK_URL ignorada/, url);
      }
      assert.equal(mundo.hermes.chamadas.length, 0, 'encaminhou para uma URL inválida ou insegura');
      assert.equal(mundo.banco.chamadas.length, ruins.length);
    });

    it('http só vale em 127.0.0.1 e localhost (teste local)', async () => {
      for (const url of ['http://127.0.0.1:8099/whatsapp/webhook', 'http://localhost:8099/whatsapp/webhook', '  https://hermes.exemplo.invalid/x  ']) {
        process.env.HERMES_WEBHOOK_URL = url;
        const r = await chamar(handler, post(entrega([msgTexto(sorteio('wamid.LH'), TEXTO)])));
        assert.equal(r.statusCode, 200, url);
      }
      assert.deepEqual(mundo.hermes.chamadas.map((c) => c.url), ['http://127.0.0.1:8099/whatsapp/webhook', 'http://localhost:8099/whatsapp/webhook', 'https://hermes.exemplo.invalid/x']);
    });

    it('falha da cópia (rede, 500, 401, 302) nunca muda a resposta à Meta, não tenta de novo e não segue redirecionamento', async () => {
      const base = await chamar(handler, post(entrega([msgTexto('wamid.BASE', TEXTO)])));
      assert.equal(base.statusCode, 200);
      for (const [modo, esperado] of [['fora', /encaminhamento falhou \(rede\)/], ['500', /encaminhamento falhou \(status 500\)/],
        ['401', /encaminhamento falhou \(status 401\)/], ['302', /encaminhamento falhou \(status 302\)/]]) {
        mundo.hermes.modo = modo;
        mundo.hermes.chamadas.length = 0;
        const antes = saida.length;
        const r = await chamar(handler, post(entrega([msgTexto('wamid.BASE', TEXTO)])));
        assert.equal(r.statusCode, base.statusCode, modo);
        assert.equal(r.corpo, base.corpo, modo + ': o corpo da resposta mudou');
        assert.equal(mundo.hermes.chamadas.length, 1, modo + ': tentou de novo ou seguiu o redirecionamento');
        assert.match(saida.slice(antes).join('\\n'), esperado, modo);
      }
    });

    it('tempo limite: a cópia que não responde é cortada (3 s de verdade; aqui 40 ms) e a resposta sai normal', async () => {
      assert.equal(cfgOriginal.tempoHermesMs, 3000, 'o limite de verdade é de 3 s');
      handler.CONFIG.tempoHermesMs = 40;
      mundo.hermes.modo = 'lento';
      const t0 = Date.now();
      const r = await chamar(handler, post(entrega([msgTexto('wamid.LENTO', TEXTO)])));
      const gasto = Date.now() - t0;
      assert.equal(r.statusCode, 200);
      assert.deepEqual(r.json(), OK);
      assert.ok(gasto >= 30 && gasto < 1500, 'tempo gasto: ' + gasto);
      assert.equal(mundo.hermes.chamadas.length, 1);
      assert.ok(saida.some((l) => /encaminhamento falhou \(rede\)/.test(l)));
    });

    it('a falha do banco continua dando 503 mesmo se o encaminhamento der certo; a recusa por validação continua dando 200', async () => {
      mundo.banco.modo = '5xx';
      const r = await chamar(handler, post(entrega([msgTexto('wamid.F1', TEXTO)])));
      assert.equal(r.statusCode, 503);
      assert.deepEqual(r.json(), { ok: false, erro: 'o banco não gravou agora; o provedor reenvia e a gravação não duplica', mensagens: 1, gravadas: 0, falhas: 1 });
      assert.equal(mundo.hermes.chamadas.length, 1, 'o Hermes recebe a cópia mesmo com o banco fora');
      assert.ok(saida.some((l) => /encaminhado ao Hermes/.test(l)), 'a cópia deu certo');
      // banco fora e Hermes fora ao mesmo tempo: a resposta é a mesma 503
      mundo.hermes.modo = 'fora';
      const r2 = await chamar(handler, post(entrega([msgTexto('wamid.F1', TEXTO)])));
      assert.equal(r2.statusCode, 503);
      assert.equal(r2.corpo, r.corpo);
      // validação (reenviar não adianta): 200 com a falha contada, e a cópia segue
      mundo.hermes.modo = 'ok'; mundo.banco.modo = 'validacao'; mundo.hermes.chamadas.length = 0;
      const r3 = await chamar(handler, post(entrega([msgTexto('wamid.F2', TEXTO)])));
      assert.equal(r3.statusCode, 200);
      assert.deepEqual(r3.json(), { ok: true, mensagens: 1, gravadas: 0, falhas: 1 });
      assert.equal(mundo.hermes.chamadas.length, 1);
    });

    it('banco e Hermes correm juntos, e a resposta só sai depois dos dois', async () => {
      mundo.hermes.atrasoMs = 60;
      // o banco só responde depois que o Hermes já foi chamado; se fosse um depois do outro, ficaria 1 s esperando à toa
      mundo.banco.espera = async () => {
        await Promise.race([mundo.hermes.chegou, new Promise((r) => setTimeout(r, 1000))]);
        mundo.banco.viuHermes = mundo.hermes.chamadas.length > 0;
      };
      const t0 = Date.now();
      const r = await chamar(handler, post(entrega([msgTexto('wamid.PAR', TEXTO)])));
      assert.equal(r.statusCode, 200);
      assert.equal(mundo.banco.viuHermes, true, 'o Hermes não foi chamado enquanto o banco respondia');
      assert.ok(Date.now() - t0 < 900, 'esperou o limite de segurança do teste');
      assert.equal(mundo.hermes.terminou, true, 'a resposta à Meta saiu antes de a cópia terminar');
      assert.equal(mundo.banco.terminou, true);
    });

    it('o pior caso de tempo cabe nos 10 s da função, até se banco e Hermes fossem um depois do outro', () => {
      const v = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'vercel.json'), 'utf8'));
      const limite = v.functions['api/whatsapp.js'].maxDuration * 1000;
      assert.equal(limite, 10000);
      assert.ok(handler.TEMPO_BANCO_MS + cfgOriginal.tempoHermesMs < limite, 'banco ' + handler.TEMPO_BANCO_MS + ' + Hermes ' + cfgOriginal.tempoHermesMs);
    });

    it('assinatura da Meta errada ou ausente: 401 e nada é encaminhado nem gravado', async () => {
      for (const assinatura of ['sha256=' + 'a'.repeat(64), '', 'sha1=abc']) {
        const r = await chamar(handler, post(entrega([msgTexto('wamid.A1', TEXTO)]), { assinatura }));
        assert.equal(r.statusCode, 401, assinatura);
      }
      // corpo mexido depois de assinado
      const req = post(entrega([msgTexto('wamid.A1', TEXTO)]));
      req.stream = req.stream.replace(TEXTO, 'outro texto');
      assert.equal((await chamar(handler, req)).statusCode, 401);
      assert.equal(mundo.hermes.chamadas.length, 0);
      assert.equal(mundo.banco.chamadas.length, 0);
    });

    it('sem WHATSAPP_APP_SECRET ou sem as variáveis do banco: 503 e nada é encaminhado', async () => {
      delete process.env.WHATSAPP_APP_SECRET;
      assert.equal((await chamar(handler, post(entrega([msgTexto('wamid.V1', TEXTO)])))).statusCode, 503);
      process.env.WHATSAPP_APP_SECRET = segredoApp;
      delete process.env.WHATSAPP_SEGREDO_BANCO;
      assert.equal((await chamar(handler, post(entrega([msgTexto('wamid.V1', TEXTO)])))).statusCode, 503);
      assert.equal(mundo.hermes.chamadas.length, 0);
    });

    it('a resposta à Meta é a mesma com e sem a cópia', async () => {
      const com = await chamar(handler, post(entrega([msgTexto('wamid.IG', TEXTO), msgBotao('wamid.IG2', 'ok 3', 'Aprovar')])));
      delete process.env.HERMES_WEBHOOK_URL;
      const sem = await chamar(handler, post(entrega([msgTexto('wamid.IG', TEXTO), msgBotao('wamid.IG2', 'ok 3', 'Aprovar')])));
      assert.equal(com.statusCode, sem.statusCode);
      assert.equal(com.corpo, sem.corpo);
      assert.deepEqual(Object.keys(com.headers).sort(), Object.keys(sem.headers).sort());
    });

    it('a Bird NÃO encaminha: com HERMES_WEBHOOK_URL definida, o evento da Bird só vai ao banco', async () => {
      const whsec = 'whsec_' + crypto.randomBytes(32).toString('base64');
      process.env.BIRD_WEBHOOK_SECRET = whsec;
      const corpo = JSON.stringify({ type: 'whatsapp.received', timestamp: '2026-10-30T12:00:00.000Z',
        data: { whatsapp_id: 'wam_B1', direction: 'inbound', from: { phone_number: '+' + NUMERO, display_name: NOME }, text: { body: TEXTO } } });
      const id = 'msg_bird', ts = Math.floor(Date.now() / 1000);
      const sig = 'v1,' + crypto.createHmac('sha256', Buffer.from(whsec.replace(/^whsec_/, ''), 'base64')).update(`${id}.${ts}.${corpo}`).digest('base64');
      const r = await chamar(bird, { method: 'POST', url: '/api/whatsapp-bird', stream: corpo, headers: { 'webhook-id': id, 'webhook-timestamp': String(ts), 'webhook-signature': sig } });
      assert.equal(r.statusCode, 200);
      assert.equal(mundo.banco.chamadas.length, 1);
      assert.equal(mundo.hermes.chamadas.length, 0, 'a Bird encaminhou ao Hermes');
    });
  });

  it('o código não tem a URL do Hermes, chave, endereço do banco nem número', () => {
    const t = fs.readFileSync(path.join(__dirname, '..', 'public', 'api', 'whatsapp.js'), 'utf8');
    assert.ok(!/https?:\/\/[^\s'")]*hermes/i.test(t), 'a URL do Hermes só vem da variável de ambiente');
    assert.ok(!/sb_(publishable|secret)_/.test(t));
    assert.ok(!/https:\/\/[a-z0-9]{12,}\.supabase\.co/.test(t));
    assert.ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(t));
    assert.ok(!/graph\.facebook\.com/.test(t), 'nunca chama a API da Meta');
    assert.ok(!/\+?55\d{10,}/.test(t), 'número de telefone no código');
    assert.ok(Buffer.byteLength(t) < 30 * 1024, 'arquivo da api grande demais');
  });
});
