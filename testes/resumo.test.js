'use strict';
// node --test testes/    (sem pacote, sem rede, sem banco real). Supabase e Resend simulados; dados só da OBRA 999 · DEMONSTRAÇÃO (fictícia).
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const handler = require('../public/api/resumo.js');
const { BASE, ANON, chamar } = require('./_apoio.js');

const sorteio = (p) => p + crypto.randomBytes(16).toString('hex');
const EMAIL_DIR = 'diretor.teste@example.com', EMAIL_OUTRO = 'outra.pessoa@example.com';

// resumo de obra como o banco devolve (taf_resumo_obra), inventado
function resumo999() {
  return {
    obra: '999', nome: 'OBRA 999 · DEMONSTRAÇÃO', hoje: '2026-10-28', semana: '2026-10-26',
    ciclo: {
      cronograma: true,
      luzes: { producao: { cor: 'AMARELO', motivo: 'PPC 75% (3 de 4)' }, plano: { cor: 'AMARELO', motivo: '2 vencida(s); 1 vence(m) até 04/11' } },
      frase: 'Semana 19/10 a 25/10 fechada com PPC 75% (3 de 4). EVENTO 2.1.1 de 11/11 (T5) em risco.',
      ultima_fechada: { seg: '2026-10-19', ensaio: false, ppc: 75, cumpridos: 3, publicados: 4, parciais: 0 },
      semana_atual: { seg: '2026-10-26', estado: 'publicada', status_pub: 'NO_PRAZO', publicados: 3, cumpridos: 0, sem_resultado: 3, propostos: 3, fora_do_prazo: false },
      atrasadas: { total: 2, lista: [{ id: 'T3', nome: 'Assentamento de tubos (fictício)', tipo: 'inicio', dias: 8 }, { id: 'T2', nome: 'Escavação (fictício)', tipo: 'termino', dias: 4 }] },
      criticas: { total: 1, lista: [{ id: 'T5', nome: 'Elevatória montada (fictício)', ev: '2.1.1', tipo: 'evento', data: '2026-11-11', nivel: 'VERMELHO', motivo: 'pela lógica vai para 19/11 (+8)' }] },
      restricoes: { vencidas: 2, vencem_7: 1, ate: '2026-11-04',
        lista_vencidas: [{ num: 1, oque: 'Projeto <script>alert(1)</script> aprovado', resp: 'Engenheiro 999', data: '2026-10-20' }, { num: 2, oque: 'Válvulas entregues — na obra', resp: 'SUPRIMENTOS', data: '2026-10-25' }],
        lista_vencem: [{ num: 3, oque: 'Frente liberada', resp: 'Engenheiro 999', data: '2026-10-30' }] },
      apontamento: { ultimo: '2026-10-23', dias_uteis_sem: 2 },
    },
    erp: { itens: 9, licitado: 109000, meta: 78000, comprometido: 6000, realizado: 8700, pedidos: 3, notas: 3 },
  };
}
function resumo998() {
  return { obra: '998', nome: 'OBRA 998 · VAZIA (fictícia)', hoje: '2026-10-28', semana: '2026-10-26', ciclo: { cronograma: false },
    erp: { itens: 0, licitado: null, meta: null, comprometido: null, realizado: null, pedidos: 0, notas: 0 } };
}

// Supabase e Resend simulados no mesmo fetch
// Resend: /emails, um e-mail por pedido. Imita a chave de idempotência da Resend (24 h): mesma chave com o mesmo corpo devolve
// a resposta guardada sem mandar de novo; mesma chave com outro corpo: 409 invalid_idempotent_request.
// modoResend: ok | erro (tudo 422) | fora (rede, nada sai) | 5xx (503, nada sai) | aceita-e-some (sai, mas a resposta não volta)
// m.emails: o que a Resend de fato mandou (cada entrega real); registrarFalha: quantas vezes o registro no banco responde 503
function criarMundo(chaves) {
  const m = { chamadas: [], emails: [], registros: [], modoBanco: 'normal', modoResend: 'ok', resendAtrasoMs: 0, envios: null, idem: new Map(),
    registrarFalha: 0, resendFalhaPara: null, previaErro: null, obraFalha: null, obraRede: false, previaEnvios: null, resumoExtra: null };
  const resp = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
  const erro = (msg) => resp({ code: 'P0001', message: msg }, 400);
  const recusa = (to) => resp({ statusCode: 422, name: 'validation_error', message: 'Invalid `to` field: ' + to }, 422);
  m.fetch = async function (url, opts) {
    url = String(url);
    m.chamadas.push({ url, opts });
    if (url === 'https://api.resend.com/emails/batch') return resp({ message: 'o resumo não usa mais o lote' }, 404);
    if (url === 'https://api.resend.com/emails') {
      if (m.resendAtrasoMs) await new Promise((r) => setTimeout(r, m.resendAtrasoMs));
      if (m.modoResend === 'fora') throw Object.assign(new Error('rede caiu'), { name: 'TypeError' });
      const b = JSON.parse(opts.body), k = opts.headers['Idempotency-Key'];
      if (k && m.idem.has(k)) {
        const g = m.idem.get(k);
        if (g.corpo !== opts.body) return resp({ statusCode: 409, name: 'invalid_idempotent_request', message: 'x' }, 409);
        return resp(g.r);
      }
      if (m.modoResend === '5xx') return resp({ statusCode: 503, name: 'internal_server_error', message: 'x' }, 503);
      if (m.modoResend === 'erro' || (m.resendFalhaPara && b.to.includes(m.resendFalhaPara))) return recusa(b.to[0]);
      m.emails.push({ headers: opts.headers, corpo: b });
      const r = { id: 'id-falso-' + m.emails.length };
      if (k) m.idem.set(k, { corpo: opts.body, r });
      if (m.modoResend === 'aceita-e-some') throw Object.assign(new Error('demorou'), { name: 'TimeoutError' });
      return resp(r);
    }
    if (m.modoBanco === 'fora') throw Object.assign(new Error('rede caiu'), { name: 'TypeError' });
    const rota = url.replace(BASE + '/rest/v1/rpc/', '');
    if (!url.startsWith(BASE + '/rest/v1/rpc/')) return resp({ message: 'rota inesperada' }, 404);
    if (opts.headers.apikey !== ANON || opts.headers.Authorization !== 'Bearer ' + ANON) return resp({ message: 'Invalid API key' }, 401);
    const a = JSON.parse(opts.body);
    const robo = a.p_chave === chaves.robo, pessoal = a.p_chave === chaves.pessoal;
    if (rota === 'taf_resumo_montar') {
      if (!robo) return erro('CHAVE DO ROBO INVALIDA');
      const envios = m.envios || [
        { envio: 11, tentativa: 1, destinatario: 1, nome: 'Diretor Teste', email: EMAIL_DIR, obras: ['998', '999'] },
        { envio: 12, tentativa: 2, destinatario: 2, nome: 'Outra Pessoa', email: EMAIL_OUTRO, obras: ['999'] },
      ];
      return resp({ hoje: '2026-10-28', dia: a.p_quando === 'semanal' ? '2026-10-26' : '2026-10-28', quando: a.p_quando, envios, restantes: 0, desistidos: 0,
        obras: [...new Set(envios.flatMap((e) => e.obras))].sort() });
    }
    if (rota === 'taf_resumo_obra') {
      if (!robo && !pessoal) return erro(a.p_chave === chaves.geral ? 'USE SUA CHAVE PESSOAL' : 'CHAVE INVALIDA');
      if (m.obraRede) throw Object.assign(new Error('rede caiu'), { name: 'TypeError' });
      if (m.obraFalha === a.p_obra) return resp({ message: 'canceling statement due to statement timeout' }, 500);
      const o = a.p_obra === '999' ? resumo999() : a.p_obra === '998' ? resumo998() : null;
      if (o && m.resumoExtra) o.ciclo.frase = (o.ciclo.frase || '') + ' ' + m.resumoExtra;   // o dado da obra mudou entre uma execução e outra
      return resp(o, o ? 200 : 400);
    }
    if (rota === 'taf_resumo_previa') {
      if (m.previaErro) return erro(m.previaErro);
      if (robo) return erro('A CHAVE DO ROBO NAO FAZ PREVIA');
      if (!pessoal) return erro(a.p_chave === chaves.geral ? 'USE SUA CHAVE PESSOAL' : 'CHAVE INVALIDA');
      return resp({ hoje: '2026-10-28', quem: 'Diretor Teste', papel: 'diretoria', obras: a.p_destinatario ? ['999'] : ['998', '999'],
        meus: [{ destinatario: 1, email: 'd***@example.com', frequencia: 'diaria' }],
        envios: a.p_enviar ? (m.previaEnvios || [{ envio: 101, destinatario: 1, nome: 'Diretor Teste', email: EMAIL_DIR, obras: ['998', '999'] }]) : null });
    }
    if (rota === 'taf_resumo_registrar') {
      if (!robo && !pessoal) return erro('CHAVE INVALIDA');
      if (m.registrarFalha > 0) { m.registrarFalha--; return resp({ message: 'fora do ar' }, 503); }
      m.registros.push({ chave: a.p_chave, envios: a.p_envios });
      return resp({ gravados: a.p_envios.length, ignorados: 0 });
    }
    return resp({ message: 'rota inesperada' }, 404);
  };
  m.rpc = (nome) => m.chamadas.filter((c) => c.url.endsWith('/rpc/' + nome)).map((c) => JSON.parse(c.opts.body));
  m.resend = () => m.chamadas.filter((c) => c.url.startsWith('https://api.resend.com/'));
  m.nada = () => { assert.equal(m.chamadas.length, 0, 'não podia ter ido ao banco nem à Resend'); };
  return m;
}

const VARS = ['TAF_SUPABASE_URL', 'TAF_SUPABASE_KEY', 'CRON_SECRET', 'RESEND_API_KEY', 'RESUMO_REMETENTE', 'TAF_CHAVE_RESUMO', 'VERCEL_PROJECT_PRODUCTION_URL'];

describe('/api/resumo (Supabase e Resend simulados)', () => {
  let chaves, mundo, fetchOriginal, envOriginal, saida, cfgOriginal;
  const logsOriginais = {};

  beforeEach(() => {
    chaves = { robo: sorteio('robo-'), pessoal: sorteio('p-'), geral: sorteio('g-'), cron: sorteio('cron-'), resend: sorteio('re_') };
    mundo = criarMundo(chaves);
    fetchOriginal = globalThis.fetch;
    globalThis.fetch = mundo.fetch;
    envOriginal = Object.fromEntries(VARS.map((k) => [k, process.env[k]]));
    Object.assign(process.env, { TAF_SUPABASE_URL: BASE, TAF_SUPABASE_KEY: ANON, CRON_SECRET: chaves.cron, RESEND_API_KEY: chaves.resend,
      RESUMO_REMETENTE: 'Resumo TAF <resumo@example.com>', TAF_CHAVE_RESUMO: chaves.robo, VERCEL_PROJECT_PRODUCTION_URL: 'taf-teste.vercel.app' });
    cfgOriginal = { ...handler.CONFIG };
    handler.CONFIG.pausaMs = 0;
    saida = [];
    for (const k of ['log', 'error', 'warn', 'info']) { logsOriginais[k] = console[k]; console[k] = (...a) => saida.push(a.map(String).join(' ')); }
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    for (const k of VARS) { if (envOriginal[k] === undefined) delete process.env[k]; else process.env[k] = envOriginal[k]; }
    Object.assign(handler.CONFIG, cfgOriginal);
    for (const k of Object.keys(logsOriginais)) console[k] = logsOriginais[k];
    // em nenhum teste chave, segredo ou e-mail aparecem no log
    const log = saida.join('\n');
    for (const [nome, v] of Object.entries(chaves)) assert.ok(!log.includes(v), 'a chave "' + nome + '" apareceu no log');
    for (const e of [EMAIL_DIR, EMAIL_OUTRO]) assert.ok(!log.includes(e), 'e-mail apareceu no log');
  });

  const cron = (extra) => Object.assign({ method: 'GET', url: '/api/resumo?quando=diario', headers: { authorization: 'Bearer ' + chaves.cron }, corpo: undefined }, extra);
  const tela = (corpo, extra) => Object.assign({ method: 'POST', url: '/api/resumo', headers: { 'x-chave': chaves.pessoal }, corpo }, extra);
  const semSegredo = (r) => { for (const [nome, v] of Object.entries(chaves)) assert.ok(!r.corpo.includes(v), 'a chave "' + nome + '" voltou na resposta'); };

  describe('agendador (GET)', () => {
    it('sem o segredo do agendador: 401 e nada vai ao banco nem à Resend', async () => {
      for (const headers of [{}, { authorization: 'Bearer ' + sorteio('x') }, { authorization: chaves.cron }, { 'x-chave': chaves.cron }, { authorization: 'Basic ' + chaves.cron }]) {
        const r = await chamar(handler, cron({ headers }));
        assert.equal(r.statusCode, 401, JSON.stringify(Object.keys(headers)));
        semSegredo(r);
      }
      mundo.nada();
    });

    it('o segredo na URL (?secret=, ?k=, ?token=) é recusado, mesmo com o cabeçalho certo', async () => {
      for (const q of ['secret', 'k', 'token', 'chave']) {
        const r = await chamar(handler, cron({ url: '/api/resumo?quando=diario&' + q + '=' + chaves.cron }));
        assert.equal(r.statusCode, 400, q);
        semSegredo(r);
      }
      mundo.nada();
    });

    it('CRON_SECRET ausente ou curto: 500 e não aceita nada', async () => {
      for (const v of [undefined, 'curto']) {
        if (v === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = v;
        const r = await chamar(handler, cron({ headers: { authorization: 'Bearer ' + (v || '') } }));
        assert.equal(r.statusCode, 500);
        assert.match(r.json().erro, /CRON_SECRET/);
      }
      mundo.nada();
    });

    it('?quando ausente, inválido ou parâmetro a mais: 400', async () => {
      for (const url of ['/api/resumo', '/api/resumo?quando=mensal', '/api/resumo?quando=diario&obra=999']) {
        const r = await chamar(handler, cron({ url }));
        assert.equal(r.statusCode, 400, url);
      }
      mundo.nada();
    });

    it('falta variável: 500 com o nome dela e sem valor nenhum', async () => {
      for (const k of ['RESEND_API_KEY', 'RESUMO_REMETENTE', 'TAF_CHAVE_RESUMO', 'TAF_SUPABASE_KEY']) {
        const antes = process.env[k];
        delete process.env[k];
        const r = await chamar(handler, cron());
        assert.equal(r.statusCode, 500, k);
        assert.match(r.json().erro, new RegExp(k));
        semSegredo(r);
        process.env[k] = antes;
      }
      process.env.RESUMO_REMETENTE = 'sem formato';
      assert.equal((await chamar(handler, cron())).statusCode, 500);
      mundo.nada();
    });

    it('endereço do banco sem https (fora do teste local): 500', async () => {
      process.env.TAF_SUPABASE_URL = 'http://projeto-de-teste.supabase.co';
      assert.equal((await chamar(handler, cron())).statusCode, 500);
      mundo.nada();
    });

    it('diário: monta com a chave do robô, lê cada obra uma vez, manda um e-mail por destinatário e registra', async () => {
      const r = await chamar(handler, cron());
      assert.equal(r.statusCode, 200, r.corpo);
      const j = r.json();
      assert.deepEqual({ ok: j.ok, quando: j.quando, destinatarios: j.destinatarios, enviados: j.enviados, falhas: j.falhas, obras: j.obras, registrado: j.registrado },
        { ok: true, quando: 'diario', destinatarios: 2, enviados: 2, falhas: 0, obras: 2, registrado: true });
      assert.ok(!r.corpo.includes('@'), 'a resposta do agendador não lista e-mail');
      semSegredo(r);
      const mo = mundo.rpc('taf_resumo_montar');
      assert.equal(mo.length, 1);
      assert.deepEqual(mo[0], { p_chave: chaves.robo, p_quando: 'diario', p_limite: handler.CONFIG.maxEnvios });
      assert.deepEqual(mundo.rpc('taf_resumo_obra').map((x) => [x.p_chave === chaves.robo, x.p_obra]), [[true, '998'], [true, '999']]);
      assert.equal(mundo.emails.length, 2);
      assert.deepEqual(mundo.resend().map((c) => c.url), ['https://api.resend.com/emails', 'https://api.resend.com/emails'], 'um pedido por e-mail');
      const reg = mundo.registros;
      assert.equal(reg.length, 1);
      assert.equal(reg[0].chave, chaves.robo);
      assert.deepEqual(reg[0].envios, [{ envio: 11, ok: true, id: 'id-falso-1', erro: null }, { envio: 12, ok: true, id: 'id-falso-2', erro: null }]);
    });

    it('o e-mail sai do jeito certo para a Resend (um por pedido; remetente, destinatário, assunto, html, texto, chave só no cabeçalho)', async () => {
      await chamar(handler, cron());
      const c = mundo.resend()[0];
      assert.equal(c.url, 'https://api.resend.com/emails');
      assert.equal(c.opts.method, 'POST');
      assert.equal(c.opts.redirect, 'error');
      assert.equal(c.opts.headers.Authorization, 'Bearer ' + chaves.resend);
      assert.equal(c.opts.headers['Idempotency-Key'], 'taf-resumo-11');
      const b = JSON.parse(c.opts.body);
      assert.deepEqual(Object.keys(b).sort(), ['from', 'html', 'subject', 'text', 'to']);
      assert.equal(b.from, 'Resumo TAF <resumo@example.com>');
      assert.deepEqual(b.to, [EMAIL_DIR]);
      assert.equal(b.subject, 'Resumo TAF 28/10: 999 em vermelho');
      assert.ok(!c.opts.body.includes(chaves.resend) && !c.opts.body.includes(chaves.robo), 'chave no corpo do e-mail');
      // texto: conclusão primeiro, uma obra por bloco, a mais grave antes, vazio não é zero, link do site
      const L = b.text.split('\n');
      assert.equal(L[0], 'Resumo TAF · qua 28/10/2026');
      assert.match(L[1], /^Pedem atenção: 999 VERMELHO \(EVENTO 2\.1\.1 \(T5\) em risco\)\. Sem dado ou sem base: 998\.$/);
      assert.ok(b.text.indexOf('OBRA 999 · DEMONSTRAÇÃO: VERMELHO') < b.text.indexOf('OBRA 998 · VAZIA (fictícia): SEM DADO'));
      assert.match(b.text, /- PPC: semana de 19\/10 fechada com 75% \(3 de 4\) · semana de 26\/10 publicada no prazo: 0 de 3 cumpridos até agora/);
      assert.match(b.text, /- Atrasadas: 2 \(T3 Assentamento de tubos \(fictício\), início 8 dias atrasado; T2 Escavação \(fictício\), término 4 dias atrasado\)/);
      assert.match(b.text, /- Restrições: 2 vencidas \(D1 .*até 20\/10; D2 .*até 25\/10\) · 1 vence até 04\/11 \(D3 Frente liberada, Engenheiro 999, até 30\/10\)/);
      assert.match(b.text, /- Apontamento: 2 dias úteis sem apontamento \(último em 23\/10\)/);
      assert.match(b.text, /- Custo \(ERP\): licitado R\$ 109\.000 · meta R\$ 78\.000 · comprometido R\$ 6\.000 · realizado R\$ 8\.700 · comprometido mais realizado: 19% da meta/);
      assert.match(b.text, /- Planejador: sem dado \(obra sem cronograma no planejador\)\n- Custo \(ERP\): sem dado \(obra sem itens no ERP\)/);
      assert.ok(!/R\$ 0\b/.test(b.text), 'obra vazia não pode aparecer como zero');
      assert.match(b.text, /Abrir: https:\/\/taf-teste\.vercel\.app\/ciclo\?obra=999&aba=sit · https:\/\/taf-teste\.vercel\.app\/erp\?obra=999/);
      assert.ok(!/[–—]/.test(b.text + b.html + b.subject), 'travessão no e-mail');
      // html simples e escapado
      assert.match(b.html, /^<!doctype html>/);
      assert.ok(!b.html.includes('<script>'), 'texto do banco entrou como html');
      assert.ok(b.html.includes('Projeto &lt;script&gt;alert(1)&lt;/script&gt; aprovado'));
      assert.ok(b.html.includes('href="https://taf-teste.vercel.app/ciclo?obra=999&amp;aba=sit"'));
      // o segundo destinatário recebe só a obra dele
      const b2 = JSON.parse(mundo.resend()[1].opts.body);
      assert.deepEqual(b2.to, [EMAIL_OUTRO]);
      assert.ok(b2.text.includes('OBRA 999') && !b2.text.includes('OBRA 998'));
    });

    it('semanal: pede ao banco a frequência semanal e marca o assunto', async () => {
      const r = await chamar(handler, cron({ url: '/api/resumo?quando=semanal' }));
      assert.equal(r.statusCode, 200);
      assert.equal(mundo.rpc('taf_resumo_montar')[0].p_quando, 'semanal');
      assert.match(mundo.emails[0].corpo.subject, /^Resumo TAF semanal 28\/10:/);
      assert.match(mundo.emails[0].corpo.text.split('\n')[0], /· semanal$/);
    });

    it('nada a mandar (já saiu hoje): 200, nenhuma obra lida, nenhum e-mail', async () => {
      mundo.envios = [];
      const r = await chamar(handler, cron());
      assert.equal(r.statusCode, 200);
      assert.equal(r.json().enviados, 0);
      assert.equal(mundo.rpc('taf_resumo_obra').length, 0);
      assert.equal(mundo.emails.length, 0);
      assert.equal(mundo.registros.length, 0);
    });

    it('limite por execução: no máximo CONFIG.maxEnvios e-mails, mesmo se vier mais', async () => {
      handler.CONFIG.maxEnvios = 3;
      mundo.envios = Array.from({ length: 8 }, (_, i) => ({ envio: 100 + i, tentativa: 1, destinatario: i, nome: 'P' + i, email: 'p' + i + '@example.com', obras: ['999'] }));
      const r = await chamar(handler, cron());
      assert.equal(r.statusCode, 200);
      assert.equal(mundo.rpc('taf_resumo_montar')[0].p_limite, 3);
      assert.equal(mundo.emails.length, 3);
      assert.equal(r.json().enviados, 3);
    });

    it('12 destinatários com a Resend lenta (50 ms) e a pausa de verdade: saem todos, um pedido por e-mail, dentro do tempo', async () => {
      handler.CONFIG.pausaMs = cfgOriginal.pausaMs;
      mundo.resendAtrasoMs = 50;
      mundo.envios = Array.from({ length: 12 }, (_, i) => ({ envio: 100 + i, tentativa: 1, destinatario: i + 1, nome: 'P' + i, email: 'p' + i + '@example.com', obras: ['999'] }));
      const t0 = Date.now();
      const r = await chamar(handler, cron());
      assert.equal(r.statusCode, 200);
      assert.deepEqual([r.json().destinatarios, r.json().enviados, r.json().falhas], [12, 12, 0]);
      assert.equal(mundo.resend().length, 12);
      assert.ok(Date.now() - t0 < 8000, 'demorou ' + (Date.now() - t0) + ' ms');
      assert.ok(mundo.registros[0].envios.every((x) => x.ok && /^id-falso-/.test(x.id)));
    });

    it('100 destinatários (o máximo do cadastro): um pedido por e-mail, ninguém fica para depois, e a função tem 60 s', async () => {
      assert.equal(handler.CONFIG.maxEnvios, 100);
      mundo.envios = Array.from({ length: 100 }, (_, i) => ({ envio: 1000 + i, tentativa: 1, destinatario: i + 1, nome: 'P' + i, email: 'p' + i + '@example.com', obras: ['999'] }));
      const r = await chamar(handler, cron());
      assert.equal(mundo.rpc('taf_resumo_montar')[0].p_limite, 100);
      assert.equal(mundo.resend().length, 100);
      assert.equal(r.json().enviados, 100);
      /* com a pausa de verdade, 100 e-mails cabem no orçamento, e o orçamento cabe na função */
      assert.ok(cfgOriginal.pausaMs * 100 < cfgOriginal.orcamentoMs);
      const v = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'vercel.json'), 'utf8'));
      assert.ok(cfgOriginal.orcamentoMs + 2 * cfgOriginal.tempoBancoMs <= v.functions['api/resumo.js'].maxDuration * 1000);
    });

    it('média (integração): a chave de idempotência é a do envio, igual em toda tentativa', async () => {
      await chamar(handler, cron());
      mundo.envios = [{ envio: 11, tentativa: 2, destinatario: 1, nome: 'D', email: EMAIL_DIR, obras: ['998', '999'] }, { envio: 12, tentativa: 3, destinatario: 2, nome: 'O', email: EMAIL_OUTRO, obras: ['999'] }];
      await chamar(handler, cron({ url: '/api/resumo?quando=diario&repescagem=1' }));
      const k = mundo.resend().map((c) => c.opts.headers['Idempotency-Key']);
      assert.deepEqual(k, ['taf-resumo-11', 'taf-resumo-12', 'taf-resumo-11', 'taf-resumo-12']);
      assert.equal(mundo.emails.length, 2, 'a repescagem não manda de novo o que já saiu');
    });

    it('média (integração): o registro no banco falha depois de mandar e a repescagem não manda de novo', async () => {
      mundo.registrarFalha = 2;
      let r = await chamar(handler, cron());
      assert.equal(r.json().enviados, 2); assert.equal(r.json().registrado, false);
      /* duas horas depois o banco devolve os dois de novo (reservado parado), com a tentativa somada */
      mundo.envios = [{ envio: 11, tentativa: 2, destinatario: 1, nome: 'D', email: EMAIL_DIR, obras: ['998', '999'] }, { envio: 12, tentativa: 2, destinatario: 2, nome: 'O', email: EMAIL_OUTRO, obras: ['999'] }];
      r = await chamar(handler, cron({ url: '/api/resumo?quando=diario&repescagem=1' }));
      assert.equal(r.json().enviados, 2); assert.equal(r.json().registrado, true);
      const por = {}; mundo.emails.forEach((e) => { por[e.corpo.to[0]] = (por[e.corpo.to[0]] || 0) + 1; });
      assert.deepEqual(por, { [EMAIL_DIR]: 1, [EMAIL_OUTRO]: 1 }, 'cada diretor recebeu uma vez só');
      assert.deepEqual(mundo.registros[mundo.registros.length - 1].envios.map((x) => [x.envio, x.ok]), [[11, true], [12, true]]);
    });

    it('média (integração): a Resend aceita e a resposta não volta; na repescagem, com o dado da obra mudado, conta como enviado sem mandar de novo', async () => {
      mundo.modoResend = 'aceita-e-some';
      let r = await chamar(handler, cron());
      assert.equal(r.json().falhas, 2);
      assert.ok(mundo.registros[0].envios.every((x) => !x.ok && /^Resend inacessível \(TimeoutError\)/.test(x.erro)));
      mundo.modoResend = 'ok'; mundo.resumoExtra = 'dado novo das 9h';
      mundo.envios = [{ envio: 11, tentativa: 2, destinatario: 1, nome: 'D', email: EMAIL_DIR, obras: ['998', '999'] }, { envio: 12, tentativa: 2, destinatario: 2, nome: 'O', email: EMAIL_OUTRO, obras: ['999'] }];
      r = await chamar(handler, cron({ url: '/api/resumo?quando=diario&repescagem=1' }));
      assert.equal(r.json().enviados, 2);
      assert.equal(mundo.emails.length, 2, 'nada saiu duas vezes');
      assert.deepEqual(mundo.registros[1].envios, [{ envio: 11, ok: true, id: null, erro: null }, { envio: 12, ok: true, id: null, erro: null }]);
    });

    it('sem tempo: o primeiro sai, os outros voltam como erro sem ter sido tentados (saem na repescagem)', async () => {
      handler.CONFIG.pausaMs = 15; handler.CONFIG.orcamentoMs = 5;
      const r = await chamar(handler, cron());
      assert.equal(r.statusCode, 200);
      assert.equal(mundo.emails.length, 1); assert.equal(mundo.resend().length, 1);
      assert.deepEqual(mundo.registros[0].envios[1], { envio: 12, ok: false, id: null, erro: 'sem tempo nesta execução' });
    });

    it('a Resend recusa um destinatário: o outro sai, o erro é registrado sem o e-mail e sem a mensagem da Resend', async () => {
      mundo.resendFalhaPara = EMAIL_OUTRO;
      const r = await chamar(handler, cron());
      assert.equal(r.statusCode, 200);
      assert.equal(r.json().enviados, 1);
      assert.equal(r.json().falhas, 1);
      assert.deepEqual(mundo.resend().map((c) => c.url.replace('https://api.resend.com', '')), ['/emails', '/emails']);
      assert.deepEqual(mundo.resend().map((c) => c.opts.headers['Idempotency-Key']), ['taf-resumo-11', 'taf-resumo-12'], 'a tentativa não entra na chave');
      const e = mundo.registros[0].envios.find((x) => x.envio === 12);
      assert.deepEqual(e, { envio: 12, ok: false, id: null, erro: 'Resend respondeu 422 (validation_error)' });
    });

    it('Resend fora do ar: registra erro e responde 200 com as falhas', async () => {
      mundo.modoResend = 'fora';
      const r = await chamar(handler, cron());
      assert.equal(r.statusCode, 200);
      assert.equal(r.json().falhas, 2);
      assert.equal(mundo.emails.length, 0);
      assert.ok(mundo.registros[0].envios.every((x) => !x.ok && /^Resend inacessível/.test(x.erro)));
    });

    it('Resend com erro dela (5xx): fica erro para a repescagem (que vai com a mesma chave)', async () => {
      mundo.modoResend = '5xx';
      const r = await chamar(handler, cron());
      assert.equal(r.json().falhas, 2);
      assert.ok(mundo.registros[0].envios.every((x) => x.erro === 'Resend respondeu 503 (internal_server_error)'));
    });

    it('baixa (integração): CRON_SECRET com espaço no meio (frase-senha) é aceito; Bearer com outro valor não', async () => {
      process.env.CRON_SECRET = 'cavalo bateria grampo correto';
      let r = await chamar(handler, cron({ headers: { authorization: 'Bearer cavalo bateria grampo correto' } }));
      assert.equal(r.statusCode, 200, r.corpo);
      r = await chamar(handler, cron({ headers: { authorization: 'Bearer cavalo bateria grampo' } }));
      assert.equal(r.statusCode, 401);
      r = await chamar(handler, cron({ headers: { authorization: 'cavalo bateria grampo correto' } }));
      assert.equal(r.statusCode, 401);
    });

    it('repescagem: ?repescagem=1 pede ao banco o mesmo dia (o banco só devolve o que não saiu); outro valor: 400', async () => {
      let r = await chamar(handler, cron({ url: '/api/resumo?quando=diario&repescagem=1' }));
      assert.equal(r.statusCode, 200, r.corpo);
      assert.equal(r.json().repescagem, true);
      assert.deepEqual(mundo.rpc('taf_resumo_montar')[0], { p_chave: chaves.robo, p_quando: 'diario', p_limite: 100 });
      assert.ok(saida.some((l) => /diario \(repescagem\)/.test(l)));
      for (const url of ['/api/resumo?quando=diario&repescagem=2', '/api/resumo?quando=semanal&repescagem=sim', '/api/resumo?quando=diario&repescagem=1&x=1']) {
        r = await chamar(handler, cron({ url }));
        assert.equal(r.statusCode, 400, url);
      }
      assert.equal(mundo.rpc('taf_resumo_montar').length, 1);
    });

    it('uma obra falha no banco: o e-mail sai com "sem dado" nela, sem derrubar o resto', async () => {
      mundo.obraFalha = '998';
      const r = await chamar(handler, cron());
      assert.equal(r.statusCode, 200);
      assert.match(mundo.emails[0].corpo.text, /OBRA 998: SEM DADO\n- Situação: sem dado \(não consegui ler esta obra agora\)/);
      assert.ok(!mundo.emails[0].corpo.text.includes('statement timeout'));
    });

    it('chave do robô recusada pelo banco: 500 com o nome da variável, sem a chave', async () => {
      process.env.TAF_CHAVE_RESUMO = sorteio('robo-velha-');
      const r = await chamar(handler, cron());
      assert.equal(r.statusCode, 500);
      assert.match(r.json().erro, /TAF_CHAVE_RESUMO/);
      assert.ok(!r.corpo.includes(process.env.TAF_CHAVE_RESUMO));
      assert.equal(mundo.emails.length, 0);
    });

    it('banco fora do ar: 502 sem vazar detalhe', async () => {
      mundo.modoBanco = 'fora';
      const r = await chamar(handler, cron());
      assert.equal(r.statusCode, 502);
      assert.ok(!r.corpo.includes('rede caiu'));
      assert.equal(mundo.emails.length, 0);
    });

    it('PUT, DELETE, HEAD e OPTIONS: 405 com Allow', async () => {
      for (const method of ['PUT', 'DELETE', 'HEAD', 'OPTIONS']) {
        const r = await chamar(handler, cron({ method }));
        assert.equal(r.statusCode, 405, method);
        assert.equal(r.headers['allow'], 'GET, POST');
      }
      mundo.nada();
    });
  });

  describe('tela do ERP (POST)', () => {
    it('sem chave: 401; chave grande: 401; chave na URL: 400', async () => {
      assert.equal((await chamar(handler, tela({ acao: 'previa' }, { headers: {} }))).statusCode, 401);
      assert.equal((await chamar(handler, tela({ acao: 'previa' }, { headers: { 'x-chave': 'a'.repeat(300) } }))).statusCode, 401);
      for (const q of ['k', 'chave', 'token']) {
        const r = await chamar(handler, tela({ acao: 'previa' }, { url: '/api/resumo?' + q + '=' + chaves.pessoal }));
        assert.equal(r.statusCode, 400, q);
        semSegredo(r);
      }
      assert.equal((await chamar(handler, tela({ acao: 'previa' }, { url: '/api/resumo?quando=diario' }))).statusCode, 400);
      mundo.nada();
    });

    it('tipo de conteúdo errado: 415; corpo grande: 413', async () => {
      assert.equal((await chamar(handler, tela({ acao: 'previa' }, { headers: { 'x-chave': chaves.pessoal, 'content-type': 'text/plain' } }))).statusCode, 415);
      assert.equal((await chamar(handler, tela({ acao: 'previa' }, { headers: { 'x-chave': chaves.pessoal, 'content-length': String(handler.LIMITE_BYTES + 1) } }))).statusCode, 413);
      assert.equal((await chamar(handler, tela('{"acao":"' + 'x'.repeat(handler.LIMITE_BYTES) + '"}'))).statusCode, 413);
      mundo.nada();
    });

    describe('corpo inválido: 400 sem ir ao banco', () => {
      const casos = { 'sem acao': {}, 'acao desconhecida': { acao: 'apagar' }, 'campo chave no corpo': { acao: 'previa', chave: 'x' },
        'campo a mais': { acao: 'previa', email: 'x@example.com' }, 'destinatario texto': { acao: 'previa', destinatario: '7' },
        'destinatario quebrado': { acao: 'previa', destinatario: 1.5 }, 'destinatario negativo': { acao: 'previa', destinatario: -1 },
        'corpo lista': [1], 'JSON quebrado': '{"acao":', 'vazio': '  ' };
      for (const [nome, corpo] of Object.entries(casos)) {
        it(nome, async () => {
          const r = await chamar(handler, tela(corpo));
          assert.equal(r.statusCode, 400, r.corpo);
          mundo.nada();
        });
      }
      it('o aviso do campo "chave" no corpo manda usar o cabeçalho e não repete o valor', async () => {
        const r = await chamar(handler, tela({ acao: 'previa', chave: 'valor-que-nao-volta' }));
        assert.match(r.json().erro, /cabeçalho/);
        assert.ok(!r.corpo.includes('valor-que-nao-volta'));
      });
    });

    it('prévia: devolve o texto e não manda nada', async () => {
      const r = await chamar(handler, tela({ acao: 'previa' }));
      assert.equal(r.statusCode, 200, r.corpo);
      const j = r.json();
      assert.equal(j.ok, true);
      assert.deepEqual(j.obras, ['998', '999']);
      assert.match(j.assunto, /^Resumo TAF 28\/10: 999 em vermelho$/);
      assert.match(j.texto, /^Resumo TAF · qua 28\/10\/2026 · prévia\nPedem atenção: 999 VERMELHO/);
      assert.match(j.whatsapp, /^\*Resumo TAF · qua 28\/10\/2026 · prévia\*\n/);
      assert.match(j.whatsapp, /\n\*OBRA 999 · DEMONSTRAÇÃO: VERMELHO\*\n/);
      assert.match(j.html, /^<!doctype html>/);
      assert.deepEqual(j.meus, [{ destinatario: 1, email: 'd***@example.com', frequencia: 'diaria' }]);
      assert.equal(mundo.emails.length, 0, 'a prévia mandou e-mail');
      assert.equal(mundo.registros.length, 0);
      const p = mundo.rpc('taf_resumo_previa');
      assert.deepEqual(p, [{ p_chave: chaves.pessoal, p_destinatario: null, p_enviar: false }]);
      assert.ok(mundo.rpc('taf_resumo_obra').every((x) => x.p_chave === chaves.pessoal), 'a prévia usa a chave de quem pediu, nunca a do robô');
      semSegredo(r);
    });

    it('prévia de um destinatário: o banco recebe o número dele', async () => {
      const r = await chamar(handler, tela({ acao: 'previa', destinatario: 2 }));
      assert.equal(r.statusCode, 200);
      assert.equal(mundo.rpc('taf_resumo_previa')[0].p_destinatario, 2);
      assert.deepEqual(r.json().obras, ['999']);
    });

    it('a prévia funciona sem RESEND_API_KEY (só "mandar" precisa)', async () => {
      delete process.env.RESEND_API_KEY;
      assert.equal((await chamar(handler, tela({ acao: 'previa' }))).statusCode, 200);
    });

    it('chave geral do site: 403 pedindo a chave pessoal', async () => {
      const r = await chamar(handler, tela({ acao: 'previa' }, { headers: { 'x-chave': chaves.geral } }));
      assert.equal(r.statusCode, 403);
      assert.match(r.json().erro, /chave pessoal/);
      semSegredo(r);
    });

    it('chave do robô na tela: 403', async () => {
      const r = await chamar(handler, tela({ acao: 'previa' }, { headers: { 'x-chave': chaves.robo } }));
      assert.equal(r.statusCode, 403);
    });

    it('mandar agora para mim: reserva no banco, manda só para o e-mail da pessoa, registra com a chave dela e devolve o e-mail mascarado', async () => {
      const r = await chamar(handler, tela({ acao: 'mandar' }));
      assert.equal(r.statusCode, 200, r.corpo);
      assert.deepEqual(r.json(), { ok: true, enviados: 1, falhas: 0, para: ['d***@example.com'] });
      assert.ok(!r.corpo.includes(EMAIL_DIR));
      assert.deepEqual(mundo.rpc('taf_resumo_previa')[0], { p_chave: chaves.pessoal, p_destinatario: null, p_enviar: true });
      assert.equal(mundo.emails.length, 1);
      assert.deepEqual(mundo.emails[0].corpo.to, [EMAIL_DIR]);
      assert.match(mundo.emails[0].corpo.subject, /^\[teste\] Resumo TAF 28\/10:/);
      assert.equal(mundo.emails[0].headers['Idempotency-Key'], 'taf-resumo-101');
      assert.equal(mundo.registros[0].chave, chaves.pessoal);
      assert.deepEqual(mundo.registros[0].envios, [{ envio: 101, ok: true, id: 'id-falso-1', erro: null }]);
    });

    it('mandar: cada teste leva só as obras do cadastro daquele e-mail (não todas as da chave)', async () => {
      mundo.previaEnvios = [{ envio: 101, destinatario: 1, nome: 'Diretor Teste', email: EMAIL_DIR, obras: ['999'] }];
      const r = await chamar(handler, tela({ acao: 'mandar' }));
      assert.equal(r.statusCode, 200, r.corpo);
      assert.deepEqual(mundo.rpc('taf_resumo_obra').map((x) => x.p_obra), ['999'], 'a 998 é da chave mas não do cadastro');
      assert.ok(mundo.emails[0].corpo.text.includes('OBRA 999') && !mundo.emails[0].corpo.text.includes('OBRA 998'));
    });

    it('mandar e o banco cai ao ler as obras: 502 e o envio reservado volta ao banco como erro (não fica "mandando")', async () => {
      mundo.obraRede = true;
      const r = await chamar(handler, tela({ acao: 'mandar' }));
      assert.equal(r.statusCode, 502);
      assert.equal(mundo.emails.length, 0);
      assert.equal(mundo.registros.length, 1);
      assert.equal(mundo.registros[0].chave, chaves.pessoal);
      assert.deepEqual(mundo.registros[0].envios, [{ envio: 101, ok: false, erro: 'não consegui ler as obras' }]);
    });

    it('envio de teste sem lista de obras: não manda e-mail vazio; volta ao banco como erro', async () => {
      mundo.previaEnvios = [{ envio: 101, destinatario: 1, nome: 'Diretor Teste', email: EMAIL_DIR }];
      const r = await chamar(handler, tela({ acao: 'mandar' }));
      assert.equal(r.statusCode, 502);
      assert.equal(mundo.emails.length, 0);
      assert.equal(mundo.rpc('taf_resumo_obra').length, 0);
      assert.deepEqual(mundo.registros[0].envios, [{ envio: 101, ok: false, id: null, erro: 'sem obra do cadastro na chave' }]);
    });

    it('mandar sem obra do cadastro na chave: 409 com o aviso', async () => {
      mundo.previaErro = 'NENHUMA OBRA DO SEU CADASTRO NA SUA CHAVE';
      const r = await chamar(handler, tela({ acao: 'mandar' }));
      assert.equal(r.statusCode, 409);
      assert.match(r.json().erro, /obras do cadastro do seu e-mail/);
      assert.equal(mundo.emails.length, 0);
    });

    it('mandar sem a Resend configurada: 500 antes de reservar no banco', async () => {
      delete process.env.RESEND_API_KEY;
      const r = await chamar(handler, tela({ acao: 'mandar' }));
      assert.equal(r.statusCode, 500);
      assert.match(r.json().erro, /RESEND_API_KEY/);
      mundo.nada();
    });

    it('mandar sem e-mail na lista: 409; limite de testes: 429', async () => {
      mundo.previaErro = 'SEU E-MAIL NAO ESTA NA LISTA';
      let r = await chamar(handler, tela({ acao: 'mandar' }));
      assert.equal(r.statusCode, 409);
      assert.match(r.json().erro, /É o meu e-mail/);
      mundo.previaErro = 'LIMITE DE 5 ENVIOS DE TESTE POR DIA';
      r = await chamar(handler, tela({ acao: 'mandar' }));
      assert.equal(r.statusCode, 429);
      assert.equal(mundo.emails.length, 0);
    });

    it('mandar e a Resend recusa: 502, registra o erro, não repete a mensagem da Resend', async () => {
      mundo.modoResend = 'erro';
      const r = await chamar(handler, tela({ acao: 'mandar' }));
      assert.equal(r.statusCode, 502);
      assert.equal(r.json().ok, false);
      assert.match(r.json().erro, /Resend respondeu 422/);
      assert.ok(!r.corpo.includes(EMAIL_DIR) && !r.corpo.includes('Invalid'));
      assert.equal(mundo.registros[0].envios[0].ok, false);
    });

    it('aceita a chave em Authorization: Bearer e o corpo em texto JSON', async () => {
      const r = await chamar(handler, tela(JSON.stringify({ acao: 'previa' }), { headers: { authorization: 'Bearer ' + chaves.pessoal } }));
      assert.equal(r.statusCode, 200);
    });

    it('aceita o corpo em fluxo (Node puro)', async () => {
      const r = await chamar(handler, { method: 'POST', url: '/api/resumo', headers: { 'x-chave': chaves.pessoal }, stream: JSON.stringify({ acao: 'previa' }) });
      assert.equal(r.statusCode, 200, r.corpo);
    });
  });
});

describe('montarEmail (vazio não é zero, texto curto)', () => {
  const { montarEmail } = handler;
  const hoje = '2026-10-28';

  it('obra fora do planejador e fora do ERP: "sem dado", nunca zero', () => {
    const m = montarEmail({ resumos: { '997': { obra: '997', nome: 'OBRA 997 · FICTÍCIA', ciclo: null, erp: null } }, obras: ['997'], quando: 'diario', hoje, base: '' });
    assert.match(m.texto, /OBRA 997 · FICTÍCIA: SEM DADO\n- Planejador: sem dado \(obra fora do planejador\)\n- Custo \(ERP\): sem dado \(obra fora do ERP\)/);
    assert.match(m.texto, /Nenhuma obra em vermelho ou amarelo\. Sem dado ou sem base: 997\./);
    assert.ok(!m.texto.includes('Abrir:'), 'sem endereço do site, sem link');
  });

  it('ERP sem pedido e sem nota: escreve isso em vez de R$ 0', () => {
    const r = resumo999(); r.erp = { itens: 9, licitado: 109000, meta: 78000, comprometido: 0, realizado: 0, pedidos: 0, notas: 0 };
    const m = montarEmail({ resumos: { '999': r }, obras: ['999'], quando: 'diario', hoje, base: '' });
    assert.match(m.texto, /comprometido sem pedido lançado · realizado sem nota lançada\n/);
  });

  it('planejador sem semana fechada, semana não publicada e sem apontamento', () => {
    const r = resumo999();
    Object.assign(r.ciclo, { ultima_fechada: null, semana_atual: { seg: '2026-10-26', estado: 'rascunho', propostos: 2, fora_do_prazo: true },
      apontamento: { ultimo: null, dias_uteis_sem: null }, atrasadas: { total: 0, lista: [] }, criticas: { total: 0, lista: [] },
      restricoes: { vencidas: 0, vencem_7: 0, ate: '2026-11-04', lista_vencidas: [], lista_vencem: [] } });
    r.ciclo.luzes = { producao: { cor: 'SEM BASE', motivo: 'nenhuma semana fechada com compromisso' }, plano: { cor: 'VERDE', motivo: '0 vencida(s)' } };
    const m = montarEmail({ resumos: { '999': r }, obras: ['999'], quando: 'diario', hoje, base: '' });
    assert.match(m.texto, /- PPC: nenhuma semana fechada · semana de 26\/10 não publicada \(2 propostos\), passou do prazo de publicar/);
    assert.match(m.texto, /- Apontamento: nenhum apontamento registrado/);
    assert.match(m.texto, /- Atrasadas: nenhuma\n- Mais críticas: nenhum EVENTO ou marco em risco\n- Restrições: nenhuma vencida · nenhuma vence até 04\/11/);
    assert.match(m.assunto, /sem obra em alerta$/);
  });

  it('planejador com erro de cálculo: "sem dado", não inventa cor', () => {
    const r = resumo999(); r.ciclo = { cronograma: true, erro: 'não consegui calcular o planejador desta obra' };
    const m = montarEmail({ resumos: { '999': r }, obras: ['999'], quando: 'diario', hoje, base: '' });
    assert.match(m.texto, /OBRA 999 · DEMONSTRAÇÃO: SEM DADO\n- Planejador: sem dado \(não consegui calcular o planejador desta obra\)/);
  });

  it('sem travessão nem quebra de linha vinda do dado', () => {
    const r = resumo999(); r.ciclo.frase = 'linha 1\nlinha 2 — com travessão – e meia-risca';
    const m = montarEmail({ resumos: { '999': r }, obras: ['999'], quando: 'diario', hoje, base: '' });
    assert.ok(!/[–—]/.test(m.texto + m.html));
    assert.ok(m.texto.includes('linha 1 linha 2 - com travessão - e meia-risca'));
  });

  it('a conclusão usa o motivo que o banco manda para a luz (o do indicador que deu a cor)', () => {
    const r = resumo999();
    r.ciclo.criticas = { total: 0, lista: [] };
    r.ciclo.luzes = { producao: { cor: 'SEM BASE', motivo: 'efetivo em campo não é apontado na v1', de: ['P3'] },
      plano: { cor: 'VERMELHO', motivo: 'sem compromisso para a semana de 26/10', de: ['P8'] } };
    const m = montarEmail({ resumos: { '999': r }, obras: ['999'], quando: 'diario', hoje, base: '' });
    assert.equal(m.texto.split('\n')[1], 'Pedem atenção: 999 VERMELHO (plano: sem compromisso para a semana de 26/10).');
    assert.match(m.texto, /- Luzes: produção SEM BASE \(efetivo em campo não é apontado na v1\) · plano VERMELHO \(sem compromisso para a semana de 26\/10\)/);
    assert.ok(!m.texto.includes('vencida(s)'), 'motivo de outro indicador');
  });

  it('obra sem acesso ao planejador com esta chave: diz isso, sem link do planejador, e o ERP continua', () => {
    const r = resumo999(); r.ciclo = { sem_acesso: true };
    const m = montarEmail({ resumos: { '999': r }, obras: ['999'], quando: 'previa', hoje, base: 'https://taf-teste.vercel.app' });
    assert.match(m.texto, /OBRA 999 · DEMONSTRAÇÃO: SEM DADO\n- Planejador: sem acesso com esta chave \(o planejador desta obra é do engenheiro dela\)\n- Custo \(ERP\): licitado/);
    assert.ok(!m.texto.includes('/ciclo?'), 'link do planejador para quem não abre o planejador');
    assert.ok(m.texto.includes('/erp?obra=999'));
  });

  it('integração (média): meta em parte dos itens não sai como a meta da obra inteira, e o % só compara os itens com meta', () => {
    const r = resumo999();
    r.erp = { itens: 4, licitado: 200000, meta: 120000, comprometido: 30000, realizado: 0, pedidos: 1, notas: 0,
      itens_com_meta: 1, licitado_com_meta: 150000, comprometido_com_meta: 0, realizado_com_meta: 0 };
    let m = montarEmail({ resumos: { '999': r }, obras: ['999'], quando: 'previa', hoje, base: '' });
    assert.match(m.texto, /- Custo \(ERP\): licitado R\$ 200\.000 · meta definida em 1 de 4 itens \(R\$ 120\.000 para R\$ 150\.000 licitados\) · comprometido R\$ 30\.000/);
    assert.match(m.texto, /nos itens com meta, comprometido mais realizado: 0% da meta deles/);
    assert.ok(!/· meta R\$ 120\.000/.test(m.texto), 'a meta parcial não aparece como meta da obra');
    assert.ok(!/25% da meta/.test(m.texto), 'o gasto de item sem meta não entra no % da meta');
    /* nenhum item com meta: sem dado, nunca zero */
    r.erp = { itens: 4, licitado: 200000, meta: null, comprometido: 30000, realizado: 0, pedidos: 1, notas: 0, itens_com_meta: 0,
      licitado_com_meta: null, comprometido_com_meta: null, realizado_com_meta: null };
    m = montarEmail({ resumos: { '999': r }, obras: ['999'], quando: 'previa', hoje, base: '' });
    assert.match(m.texto, /licitado R\$ 200\.000 · meta sem dado \(nenhum item com meta\) · comprometido R\$ 30\.000/);
    assert.ok(!/% da meta/.test(m.texto));
    /* todos os itens com meta: como antes */
    r.erp = { ...resumo999().erp, itens_com_meta: 9, licitado_com_meta: 109000, comprometido_com_meta: 6000, realizado_com_meta: 8700 };
    m = montarEmail({ resumos: { '999': r }, obras: ['999'], quando: 'previa', hoje, base: '' });
    assert.match(m.texto, /licitado R\$ 109\.000 · meta R\$ 78\.000 · comprometido R\$ 6\.000 · realizado R\$ 8\.700 · comprometido mais realizado: 19% da meta/);
  });

  it('lista vazia de obras', () => {
    assert.match(montarEmail({ resumos: {}, obras: [], quando: 'diario', hoje, base: '' }).texto, /Nenhuma obra na sua lista\./);
  });

  it('mascarar e-mail', () => {
    assert.equal(handler.mascarar('diretor.teste@example.com'), 'd***@example.com');
    assert.equal(handler.mascarar('sem-arroba'), '***');
  });
});

describe('vercel.json: só os crons do resumo foram acrescentados', () => {
  const v = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'vercel.json'), 'utf8'));
  it('diário em dia útil às 7h de Brasília (10h UTC) e semanal na segunda às 7h30 (10h30 UTC); repescagem duas horas depois', () => {
    assert.deepEqual(v.crons, [
      { path: '/api/resumo?quando=diario', schedule: '0 10 * * 1-5' },
      { path: '/api/resumo?quando=semanal', schedule: '30 10 * * 1' },
      { path: '/api/resumo?quando=diario&repescagem=1', schedule: '0 12 * * 1-5' },
      { path: '/api/resumo?quando=semanal&repescagem=1', schedule: '30 12 * * 1' },
    ]);
    // plano Hobby da Vercel: cada agendamento roda no máximo uma vez por dia (e em qualquer minuto da hora marcada)
    for (const c of v.crons) assert.match(c.schedule, /^\d{1,2} \d{1,2} \* \* [0-9-]+$/);
  });
  it('o resto continua igual (cabeçalhos e rotas)', () => {
    assert.deepEqual(Object.keys(v).filter((k) => k !== 'functions'), ['headers', 'rewrites', 'crons']);
    // funções com tempo próprio: o assistente (item da IA) e o resumo (um e-mail por pedido, até 60 s)
    assert.deepEqual(Object.keys(v.functions || {}), ['api/assistente.js', 'api/resumo.js']);
    assert.equal(v.functions['api/resumo.js'].maxDuration, 60);
    assert.deepEqual(v.rewrites.map((r) => r.source), ['/marko', '/ciclo', '/erp']);
    assert.deepEqual(v.headers[0].headers.map((h) => h.key), ['X-Robots-Tag', 'Cache-Control']);
  });
  for (const arq of ['resumo.js', '_resumo_email.js']) it(arq + ' não carrega chave, endereço do banco, token nem e-mail real', () => {
    const t = fs.readFileSync(path.join(__dirname, '..', 'public', 'api', arq), 'utf8');
    assert.ok(!/sb_(publishable|secret)_/.test(t));
    assert.ok(!/https:\/\/[a-z0-9]{12,}\.supabase\.co/.test(t));
    assert.ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(t));
    assert.ok(!/re_[A-Za-z0-9]{16,}/.test(t), 'chave da Resend no código');
    assert.ok(!/[A-Za-z0-9._%+-]+@(?!seu-dominio)[A-Za-z0-9-]+\.[A-Za-z]{2,}/.test(t), 'e-mail no código');
    assert.ok(Buffer.byteLength(t) < 30 * 1024, 'arquivo da api grande demais');
  });
});
