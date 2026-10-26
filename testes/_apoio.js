'use strict';
// Apoio dos testes: Supabase simulado, req/res simulados e leitura FICTÍCIA. Nada aqui é dado real.
const crypto = require('crypto');
const { Readable } = require('stream');

const BASE = 'https://projeto-de-teste.supabase.co';
const ANON = 'publicavel-de-teste-' + crypto.randomBytes(6).toString('hex');

// chave de acesso de teste: sorteada a cada execução, existe só na memória
function novaChave() { return 't-' + crypto.randomBytes(18).toString('base64url'); }
function sha256(t) { return crypto.createHash('sha256').update(String(t || '')).digest('hex'); }

function snapFalso() {
  return {
    corte: { v: '2000-01-01', ref: 'ABA-FALSA!B1' },
    semana: { v: 'semana de teste', ref: 'ABA-FALSA!C3' },
    obras: { T1: { nome: { v: 'Obra fictícia 1', ref: 'x' } }, T2: { nome: { v: 'Obra fictícia 2', ref: 'x' } } },
    perguntas: [{ n: { v: 1 }, q: { v: 'pergunta de teste' }, por: { T1: { num: { v: 0 }, cor: { v: 'VERDE' } } } }],
    carteira: { v: 1, ref: 'x' }, contratos: { v: 2, ref: 'x' }, medidoTaf: { v: 3, ref: 'x' },
    caixa: { meses: ['2000-01-01'], prev: [0], real: [0] }, curva: { meses: [], obras: {} },
    restricoes: [
      { row: 5, n: 1, obra: 'T1', txt: 'restrição fictícia A' },
      { row: 6, n: 2, obra: 'T2', txt: 'restrição fictícia B' },
    ],
    decisoes: [], compromissos: [], checks: [], master: { v: 'ok', ref: 'x' }, base: { T1: {} },
    bms: [], nfs: [], apont: [], semanas: [], changelog: [],
  };
}

// Banco simulado: confere a chave como o banco de verdade (SHA-256 contra a "tabela" taf_chave) e guarda o que gravou.
function criarBancoFalso(chaveBoa) {
  const hashBom = sha256(chaveBoa);
  const banco = { chamadas: [], gravados: [], modo: 'normal' };
  banco.fetch = async function (url, opts) {
    banco.chamadas.push({ url: String(url), opts });
    if (banco.modo === 'fora') throw Object.assign(new Error('rede caiu'), { name: 'TypeError' });
    if (String(url) !== BASE + '/rest/v1/rpc/taf_snap_salvar') {
      return new Response(JSON.stringify({ message: 'rota inesperada' }), { status: 404 });
    }
    const h = opts.headers || {};
    if (h.apikey !== ANON || h.Authorization !== 'Bearer ' + ANON) return new Response(JSON.stringify({ message: 'Invalid API key' }), { status: 401 });
    const b = JSON.parse(opts.body);
    if (banco.modo === 'erro-generico') return new Response(JSON.stringify({ message: 'falha qualquer do banco' }), { status: 500 });
    if (sha256(b.p_chave) !== hashBom) return new Response(JSON.stringify({ code: 'P0001', message: 'CHAVE INVALIDA' }), { status: 400 });
    if (!b.p_snap || !Array.isArray(b.p_snap.restricoes)) return new Response(JSON.stringify({ code: 'P0001', message: 'LEITURA INVALIDA' }), { status: 400 });
    banco.gravados.push({ snap: b.p_snap, fonte: b.p_fonte, quem: b.p_quem });
    return new Response(JSON.stringify(banco.gravados.length), { status: 200 });
  };
  return banco;
}

function fazerRes() {
  return {
    statusCode: 200, headers: {}, corpo: '', terminou: false,
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    end(t) { this.corpo = t || ''; this.terminou = true; },
    json() { return JSON.parse(this.corpo); },
  };
}

// req no estilo da Vercel (body já convertido) ou, com `stream`, no estilo Node puro (corpo em fluxo)
function fazerReq(o) {
  o = o || {};
  const headers = Object.assign({ 'content-type': 'application/json' }, o.headers || {});
  if (o.semTipo) delete headers['content-type'];
  let req;
  if (o.stream !== undefined) {
    req = Readable.from([Buffer.from(o.stream)]);
    headers['content-length'] = String(Buffer.byteLength(o.stream));
  } else {
    req = {};
    if (o.corpo !== undefined) req.body = o.corpo;
    // corpoQuebra: true = JSON quebrado; ou o erro que o ajudante da Vercel lançaria (ex.: { statusCode: 413 })
    if (o.corpoQuebra) Object.defineProperty(req, 'body', { get() { throw o.corpoQuebra === true ? new Error('Invalid JSON') : o.corpoQuebra; } });
  }
  req.method = o.method || 'POST';
  req.url = o.url || '/api/leitura';
  req.headers = headers;
  return req;
}

async function chamar(handler, o) {
  const req = fazerReq(o), res = fazerRes();
  await handler(req, res);
  return res;
}

module.exports = { BASE, ANON, novaChave, sha256, snapFalso, criarBancoFalso, fazerRes, fazerReq, chamar };
