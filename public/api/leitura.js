'use strict';
// Recebe a leitura da rev6 e grava no banco (Supabase) pela função taf_snap_salvar.
//
//   POST /api/leitura
//   Cabeçalho  x-chave: <chave de acesso>      (ou  Authorization: Bearer <chave de acesso>)
//   Corpo JSON { "snap": { ...leitura... }, "fonte": "texto curto", "quem": "nome" }
//
// Este arquivo NÃO tem dado, chave nem endereço do banco (o repositório é público).
// Configuração: variáveis de ambiente da Vercel
//   TAF_SUPABASE_URL  = endereço do projeto Supabase (https://<projeto>.supabase.co)
//   TAF_SUPABASE_KEY  = a chave publicável (publishable/anon) do mesmo projeto
//
// A chave de acesso NÃO é conferida aqui: ela segue para o banco, que compara o SHA-256
// com a tabela taf_chave (função _taf_ok). Sem mudança em relação ao endpoint antigo.
// Recusas antes de ir ao banco: método diferente de POST, chave na URL, sem chave,
// tipo de conteúdo errado, corpo grande ou fora do formato.

const LIMITE_BYTES = 1024 * 1024; // 1 MB (a leitura de hoje tem ~100 KB; o banco aceita até 3 MB)
const TEMPO_BANCO_MS = 8000;
const PARAMS_PROIBIDOS = ['k', 'chave', 'key', 'token', 'apikey', 'api_key', 'senha', 'password'];
const CAMPOS_CORPO = ['snap', 'fonte', 'quem'];

// [tipo, máximo de itens]. 'obj' = objeto simples; 'lista' = array.
// Só estas seções são conferidas; seção nova que a extração passar a gerar é aceita (até 40 seções).
const SECOES = {
  semana: ['obj'], carteira: ['obj'], contratos: ['obj'], medidoTaf: ['obj'], caixa: ['obj'],
  curva: ['obj'], master: ['obj'], base: ['obj'],
  perguntas: ['lista', 50], decisoes: ['lista', 500], compromissos: ['lista', 2000], checks: ['lista', 500],
  bms: ['lista', 500], nfs: ['lista', 500], apont: ['lista', 5000], semanas: ['lista', 2000], changelog: ['lista', 1000],
};
const MAX_RESTRICOES = 2000;
const MAX_SECOES = 40;

class ErroHttp extends Error {
  constructor(status, msg, extra) { super(msg); this.status = status; this.extra = extra || null; }
}

function objSimples(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

// Devolve a lista de problemas (vazia = formato ok). Só caminhos e tipos; nunca valores.
function validarSnap(snap) {
  const p = [];
  if (!objSimples(snap)) return ['snap: precisa ser um objeto'];
  if (Object.keys(snap).length > MAX_SECOES) p.push('snap: seções demais (máx. ' + MAX_SECOES + ')');
  if (!objSimples(snap.corte)) p.push('corte: precisa ser um objeto');
  if (!objSimples(snap.obras) || !Object.keys(snap.obras).length) p.push('obras: precisa ser um objeto com pelo menos uma obra');
  else for (const k of Object.keys(snap.obras)) if (!objSimples(snap.obras[k])) { p.push('obras.' + k + ': precisa ser um objeto'); break; }
  if (!Array.isArray(snap.restricoes) || !snap.restricoes.length) p.push('restricoes: precisa ser uma lista com pelo menos 1 item');
  else if (snap.restricoes.length > MAX_RESTRICOES) p.push('restricoes: itens demais (máx. ' + MAX_RESTRICOES + ')');
  else if (!snap.restricoes.every(objSimples)) p.push('restricoes: todo item precisa ser um objeto');
  for (const k of Object.keys(SECOES)) {
    if (snap[k] === undefined) continue;
    const [tipo, max] = SECOES[k];
    if (tipo === 'obj' && !objSimples(snap[k])) p.push(k + ': precisa ser um objeto');
    if (tipo === 'lista') {
      if (!Array.isArray(snap[k])) p.push(k + ': precisa ser uma lista');
      else if (snap[k].length > max) p.push(k + ': itens demais (máx. ' + max + ')');
    }
  }
  return p;
}

// Confere o corpo já em objeto. Devolve { snap, fonte, quem } limpos ou lança ErroHttp 400.
function validarCorpo(b) {
  if (!objSimples(b)) throw new ErroHttp(400, 'corpo precisa ser um objeto JSON { snap, fonte, quem }');
  const extras = Object.keys(b).filter((k) => !CAMPOS_CORPO.includes(k));
  if (extras.length) {
    const dica = extras.some((k) => PARAMS_PROIBIDOS.includes(String(k).toLowerCase())) ? ' (a chave vai só no cabeçalho x-chave)' : '';
    throw new ErroHttp(400, 'campo não aceito no corpo: ' + extras.slice(0, 5).join(', ') + dica);
  }
  const problemas = validarSnap(b.snap);
  if (problemas.length) throw new ErroHttp(400, 'leitura fora do formato', { problemas: problemas.slice(0, 10) });
  let fonte = b.fonte === undefined ? 'leitura enviada por POST' : b.fonte;
  let quem = b.quem === undefined ? 'Claude' : b.quem;
  if (typeof fonte !== 'string' || !fonte.trim() || fonte.length > 200) throw new ErroHttp(400, 'fonte: texto de 1 a 200 caracteres');
  if (typeof quem !== 'string' || !quem.trim() || quem.length > 80) throw new ErroHttp(400, 'quem: texto de 1 a 80 caracteres');
  let tamanho;
  try { tamanho = Buffer.byteLength(JSON.stringify(b)); } catch (e) { throw new ErroHttp(400, 'leitura fora do formato (aninhamento excessivo)'); }
  if (tamanho > LIMITE_BYTES) throw new ErroHttp(413, 'leitura grande demais (máx. ' + LIMITE_BYTES + ' bytes)');
  return { snap: b.snap, fonte: fonte.trim(), quem: quem.trim() };
}

function lerStream(req, limite) {
  return new Promise((resolve, reject) => {
    const partes = [];
    let total = 0, estourou = false;
    req.on('data', (c) => { total += c.length; if (total > limite) estourou = true; else partes.push(c); });
    req.on('end', () => (estourou ? reject(new ErroHttp(413, 'corpo grande demais (máx. ' + limite + ' bytes)')) : resolve(Buffer.concat(partes).toString('utf8'))));
    req.on('error', reject);
  });
}

async function lerCorpo(req) {
  let b;
  try { b = req.body; } // a Vercel já lê e converte o JSON
  catch (e) {
    if (e && e.statusCode === 413) throw new ErroHttp(413, 'corpo grande demais (máx. ' + LIMITE_BYTES + ' bytes)');
    throw new ErroHttp(400, 'JSON inválido');
  }
  // Só lê o fluxo se ninguém leu antes (Node puro). Com a Vercel o fluxo já foi consumido, e o JSON "null"
  // chega como body null: esperar o fluxo de novo travaria a função até estourar o tempo.
  if (b === undefined && typeof req.on === 'function' && !req.readableEnded) b = await lerStream(req, LIMITE_BYTES);
  if (Buffer.isBuffer(b)) b = b.toString('utf8');
  if (typeof b === 'string') {
    if (Buffer.byteLength(b) > LIMITE_BYTES) throw new ErroHttp(413, 'corpo grande demais (máx. ' + LIMITE_BYTES + ' bytes)');
    if (!b.trim()) throw new ErroHttp(400, 'corpo vazio');
    try { b = JSON.parse(b); } catch (e) { throw new ErroHttp(400, 'JSON inválido'); }
  }
  if (b === undefined || b === null) throw new ErroHttp(400, 'corpo vazio');
  return b;
}

function chaveDoCabecalho(headers) {
  const h = headers || {};
  let v = h['x-chave'];
  if (Array.isArray(v)) v = v[0];
  if (!v) {
    let a = h['authorization'];
    if (Array.isArray(a)) a = a[0];
    const m = /^Bearer\s+(\S+)\s*$/i.exec(String(a || ''));
    v = m ? m[1] : '';
  }
  return String(v || '').trim();
}

function paramsDaUrl(req) {
  const achados = [];
  try {
    const u = new URL(String(req.url || '/'), 'http://local');
    for (const k of u.searchParams.keys()) achados.push(k.toLowerCase());
  } catch (e) { /* url estranha: segue */ }
  if (req.query && typeof req.query === 'object') for (const k of Object.keys(req.query)) achados.push(k.toLowerCase());
  return achados.filter((k) => PARAMS_PROIBIDOS.includes(k));
}

function responder(res, status, obj, cabecalhos) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (cabecalhos) for (const k of Object.keys(cabecalhos)) res.setHeader(k, cabecalhos[k]);
  res.end(JSON.stringify(obj));
}

async function gravarNoBanco(chave, dados) {
  const base = String(process.env.TAF_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const anon = String(process.env.TAF_SUPABASE_KEY || '').trim();
  let urlOk = false;
  try { urlOk = new URL(base).protocol === 'https:'; } catch (e) { /* fica falso */ }
  if (!urlOk || !anon) throw new ErroHttp(500, 'servidor sem configuração (TAF_SUPABASE_URL e TAF_SUPABASE_KEY na Vercel)');
  let r;
  try {
    r = await globalThis.fetch(base + '/rest/v1/rpc/taf_snap_salvar', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(TEMPO_BANCO_MS),
      headers: { apikey: anon, Authorization: 'Bearer ' + anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_chave: chave, p_snap: dados.snap, p_fonte: dados.fonte, p_quem: dados.quem }),
    });
  } catch (e) {
    console.error('leitura: banco inacessível (' + (e && e.name) + ')'); // nunca registrar corpo nem chave
    throw new ErroHttp(502, 'banco inacessível');
  }
  const texto = await r.text();
  let j = null;
  try { j = JSON.parse(texto); } catch (e) { /* resposta não é JSON */ }
  if (r.ok) return j;
  const msg = String((j && (j.message || j.error)) || '');
  if (/CHAVE INVALIDA/i.test(msg)) throw new ErroHttp(403, 'chave recusada');
  if (/LEITURA INVALIDA/i.test(msg)) throw new ErroHttp(422, 'o banco recusou o formato da leitura');
  console.error('leitura: banco respondeu ' + r.status);
  throw new ErroHttp(502, 'o banco recusou a gravação', { status_banco: r.status });
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    if (req.method !== 'POST') throw new ErroHttp(405, 'use POST com a chave no cabeçalho x-chave', { _allow: 'POST' });
    const naUrl = paramsDaUrl(req);
    if (naUrl.length) throw new ErroHttp(400, 'a chave não pode ir na URL; use o cabeçalho x-chave');
    const chave = chaveDoCabecalho(req.headers);
    if (!chave) throw new ErroHttp(401, 'falta a chave no cabeçalho x-chave');
    if (chave.length > 200) throw new ErroHttp(401, 'chave recusada');
    const tipo = String((req.headers && req.headers['content-type']) || '').split(';')[0].trim().toLowerCase();
    if (tipo !== 'application/json') throw new ErroHttp(415, 'o corpo precisa ser application/json');
    const cl = Number(req.headers && req.headers['content-length']);
    if (cl > LIMITE_BYTES) throw new ErroHttp(413, 'corpo grande demais (máx. ' + LIMITE_BYTES + ' bytes)');
    const dados = validarCorpo(await lerCorpo(req));
    const id = await gravarNoBanco(chave, dados);
    return responder(res, 200, { ok: true, id: id === undefined ? null : id, fonte: dados.fonte, restricoes: dados.snap.restricoes.length });
  } catch (e) {
    const status = e instanceof ErroHttp ? e.status : 500;
    if (!(e instanceof ErroHttp)) console.error('leitura: erro inesperado (' + (e && e.name) + ')');
    if (typeof req.resume === 'function') req.resume(); // descarta o que sobrou do corpo
    const extra = e instanceof ErroHttp && e.extra ? e.extra : {};
    const { _allow, ...corpoExtra } = extra;
    return responder(res, status, { ok: false, erro: e instanceof ErroHttp ? e.message : 'erro interno', ...corpoExtra }, _allow ? { Allow: _allow } : null);
  }
}

module.exports = handler;
module.exports.validarSnap = validarSnap;
module.exports.validarCorpo = validarCorpo;
module.exports.LIMITE_BYTES = LIMITE_BYTES;
