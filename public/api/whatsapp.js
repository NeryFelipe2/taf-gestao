'use strict';
// Porta de entrada do WhatsApp oficial (Meta Cloud API) para o centro de comando. SÓ RECEBE E GRAVA.
//
//   GET  /api/whatsapp?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...   verificação do webhook pela Meta
//   POST /api/whatsapp   cabeçalho X-Hub-Signature-256: sha256=<HMAC do corpo bruto>   mensagens recebidas
//
// Este arquivo NÃO tem chave, segredo, número nem endereço do banco (o repositório é público). Fica inerte até existirem
// na Vercel (Settings > Environment Variables, Production, e novo Deploy):
//   WHATSAPP_VERIFY_TOKEN   texto sorteado, o mesmo digitado no painel da Meta ao cadastrar o webhook
//   WHATSAPP_APP_SECRET     "App Secret" do app da Meta: assina cada POST (sem ele, 503; assinatura errada, 401)
//   WHATSAPP_SEGREDO_BANCO  segredo que o banco confere pelo SHA-256 em ia.config (chave whatsapp_segredo_banco)
//   TAF_SUPABASE_URL, TAF_SUPABASE_KEY  as do /api/leitura
// Cada mensagem de texto vira uma linha em ia.fato pela função do banco ia_whatsapp_receber (fonte/erp/sql/09_whatsapp_entrada.sql),
// que confere o segredo e a lista de números liberados. Áudio, imagem e documento: só o tipo e o id da mídia; nada é baixado.
// Nunca responde ao remetente, nunca envia mensagem, nunca chama a API da Meta. Com a assinatura certa responde 200 quando a mensagem
// foi gravada ou quando o banco a recusou por validação (NUMERO INVALIDO, MENSAGEM SEM ID: reenviar não adianta, só conta). Falha
// passageira do banco (rede, 5xx, segredo ou função ainda não configurados) responde 503: a Meta reenvia, e reenviar é seguro porque a
// gravação é idempotente pelo hash md5('wa:'||id da mensagem). Número, nome e texto nunca vão para o log, só contagens.
// O endpoint irmão da Bird (api/whatsapp-bird.js) usa gravar/gravarMensagens/lerBruto/cfgBanco daqui (exports no fim do arquivo).

const crypto = require('crypto');

const LIMITE_BYTES = 256 * 1024;   // um lote da Meta tem poucos KB
const TEMPO_BANCO_MS = 4000;       // por mensagem; a função tem 10 s (maxDuration em vercel.json)
const MAX_MENSAGENS = 50;          // por POST
const MAX_TEXTO = 8000;
const PARAMS_PROIBIDOS = ['k', 'chave', 'key', 'token', 'apikey', 'api_key', 'senha', 'password', 'secret', 'segredo'];
const TIPOS = ['text', 'audio', 'image', 'document', 'video', 'sticker', 'location', 'contacts', 'reaction', 'button', 'interactive', 'order', 'system', 'unknown', 'unsupported'];

class ErroHttp extends Error {
  constructor(status, msg, extra) { super(msg); this.status = status; this.extra = extra || null; }
}
const objSimples = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cab = (req, k) => { const v = (req.headers || {})[k]; return String((Array.isArray(v) ? v[0] : v) || ''); };

function responder(res, status, obj, cabecalhos) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  for (const k of Object.keys(cabecalhos || {})) res.setHeader(k, cabecalhos[k]);
  res.end(JSON.stringify(obj));
}

// compara sem vazar pelo tempo de resposta
const h256 = (t) => crypto.createHash('sha256').update(String(t)).digest();
const igual = (a, b) => crypto.timingSafeEqual(h256(a), h256(b));

function paramsDaUrl(req) {
  const v = {}, todos = [];
  try {
    const u = new URL(String(req.url || '/'), 'http://local');
    for (const [k, x] of u.searchParams.entries()) { todos.push(k.toLowerCase()); if (!(k in v)) v[k] = x; }
  } catch (e) { /* url estranha: segue */ }
  if (req.query && typeof req.query === 'object') for (const k of Object.keys(req.query)) { todos.push(k.toLowerCase()); if (!(k in v) && typeof req.query[k] === 'string') v[k] = req.query[k]; }
  return { v, proibidos: todos.filter((k) => PARAMS_PROIBIDOS.includes(k)) };
}

// ===================================================================== configuração (nada aqui, só nomes de variável)
function cfgVerificacao() {
  const t = String(process.env.WHATSAPP_VERIFY_TOKEN || '').trim();
  if (!t) throw new ErroHttp(503, 'servidor sem configuração (WHATSAPP_VERIFY_TOKEN na Vercel)');
  return t;
}
function cfgAssinatura() {
  const s = String(process.env.WHATSAPP_APP_SECRET || '').trim();
  if (!s) throw new ErroHttp(503, 'servidor sem configuração (WHATSAPP_APP_SECRET na Vercel)');
  return s;
}
function cfgBanco() {
  const base = String(process.env.TAF_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const anon = String(process.env.TAF_SUPABASE_KEY || '').trim();
  const segredo = String(process.env.WHATSAPP_SEGREDO_BANCO || '').trim();
  let ok = false;   // http só no teste local
  try { const u = new URL(base); ok = u.protocol === 'https:' || (u.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(u.hostname)); } catch (e) { /* falso */ }
  const faltam = [(!ok || !anon) && 'TAF_SUPABASE_URL e TAF_SUPABASE_KEY', !segredo && 'WHATSAPP_SEGREDO_BANCO'].filter(Boolean);
  if (faltam.length) throw new ErroHttp(503, 'servidor sem configuração (' + faltam.join(', ') + ' na Vercel)');
  return { base, anon, segredo };
}

// ===================================================================== corpo bruto (a assinatura é do byte, não do objeto)
const GRANDE = () => new ErroHttp(413, 'corpo grande demais (máx. ' + LIMITE_BYTES + ' bytes)');
function lerStream(req) {
  return new Promise((resolve, reject) => {
    const partes = [];
    let total = 0;
    req.on('data', (c) => { total += c.length; if (total <= LIMITE_BYTES) partes.push(c); });
    req.on('end', () => (total > LIMITE_BYTES ? reject(GRANDE()) : resolve(Buffer.concat(partes))));
    req.on('error', reject);
  });
}

// Devolve o corpo como Buffer. Com bodyParser desligado (config abaixo) a Vercel entrega o fluxo cru. Se algum ajudante já
// tiver convertido em objeto, o último recurso é serializar de novo: a Meta manda JSON compacto, sem espaço, na mesma ordem.
async function lerBruto(req) {
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody;
  if (typeof req.rawBody === 'string') return Buffer.from(req.rawBody, 'utf8');
  let b;
  try { b = req.body; } catch (e) { throw e && e.statusCode === 413 ? GRANDE() : new ErroHttp(400, 'JSON inválido'); }
  if (b === undefined && typeof req.on === 'function' && !req.readableEnded) b = await lerStream(req);
  if (Buffer.isBuffer(b)) return b;
  if (typeof b === 'string') return Buffer.from(b, 'utf8');
  if (b === undefined || b === null) throw new ErroHttp(400, 'corpo vazio');
  return Buffer.from(JSON.stringify(b), 'utf8');
}

function conferirAssinatura(req, bruto) {
  const segredo = cfgAssinatura();
  const recebida = cab(req, 'x-hub-signature-256').trim();
  const m = /^sha256=([0-9a-f]{64})$/i.exec(recebida);
  if (!m) throw new ErroHttp(401, 'assinatura ausente ou fora do formato');
  const esperada = crypto.createHmac('sha256', segredo).update(bruto).digest('hex');
  if (!igual(m[1].toLowerCase(), esperada)) throw new ErroHttp(401, 'assinatura inválida');
}

// ===================================================================== payload da Cloud API -> mensagens simples
const texto = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const quandoDe = (ts) => { const n = Number(ts); return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : new Date().toISOString(); };

function extrairMensagens(payload) {
  const out = [];
  if (!objSimples(payload) || !Array.isArray(payload.entry)) return out;
  for (const e of payload.entry) {
    if (!objSimples(e) || !Array.isArray(e.changes)) continue;
    for (const c of e.changes) {
      const v = objSimples(c) && objSimples(c.value) ? c.value : null;
      if (!v || (c.field && c.field !== 'messages') || !Array.isArray(v.messages)) continue;   // statuses (entregue, lido) não interessam
      const nomes = {};
      for (const ct of Array.isArray(v.contacts) ? v.contacts : []) {
        if (objSimples(ct) && typeof ct.wa_id === 'string') nomes[ct.wa_id] = texto(objSimples(ct.profile) ? ct.profile.name : '', 120);
      }
      for (const m of v.messages) {
        if (!objSimples(m) || typeof m.id !== 'string' || !m.id || typeof m.from !== 'string' || !m.from) continue;
        const tipo = TIPOS.includes(m.type) ? m.type : 'unknown';
        const bruto = { tipo, timestamp: texto(String(m.timestamp || ''), 20) };
        if (objSimples(m.context) && typeof m.context.id === 'string') bruto.responde_a = m.context.id.slice(0, 200);
        let corpo = null;
        if (tipo === 'text') corpo = texto(objSimples(m.text) ? m.text.body : '', MAX_TEXTO);
        else if (objSimples(m[tipo]) && typeof m[tipo].id === 'string') bruto.midia = { tipo, id: m[tipo].id.slice(0, 200) };   // só o tipo e o id; nada é baixado
        out.push({ de: m.from.slice(0, 32), nome: nomes[m.from] || '', texto: corpo, wa_id: m.id.slice(0, 200), quando: quandoDe(m.timestamp), bruto });
        if (out.length >= MAX_MENSAGENS) return out;
      }
    }
  }
  return out;
}

// ===================================================================== banco
// Falha PERMANENTE: o banco leu a mensagem e disse que ela não presta (resposta 4xx do PostgREST com um destes textos, que vêm de
// "raise exception" na função). Reenviar não muda nada: conta e responde 200. TODO o resto é passageiro e responde 503 para o
// provedor reenviar: rede, tempo esgotado, 5xx, chave do banco recusada (401), função ainda não aplicada (404), 429, segredo ainda
// não configurado ou recusado pelo banco. Reenviar é seguro: a gravação é idempotente pelo hash md5('wa:'||id da mensagem).
const FALHA_PERMANENTE = /NUMERO INVALIDO|MENSAGEM SEM ID/;

// Devolve { ok: true, fato_id, liberado, comando } ou { ok: false, erro, transitoria }. `rotulo` é só o começo da linha de log.
async function gravar(cfg, msg, rotulo) {
  const pre = rotulo || 'whatsapp';
  let r, texto;
  try {
    r = await globalThis.fetch(cfg.base + '/rest/v1/rpc/ia_whatsapp_receber', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(TEMPO_BANCO_MS),
      headers: { apikey: cfg.anon, Authorization: 'Bearer ' + cfg.anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_segredo: cfg.segredo, p_de: msg.de, p_nome: msg.nome, p_texto: msg.texto, p_wa_id: msg.wa_id, p_quando: msg.quando, p_bruto: msg.bruto }),
    });
    texto = await r.text();   // a conexão pode cair no meio da resposta: também é falha de rede
  } catch (e) {
    console.error(pre + ': banco inacessível (' + String(e && e.name).slice(0, 30) + ')');   // nunca o corpo, o número nem o texto
    return { ok: false, erro: 'rede', transitoria: true };
  }
  let j = null;
  try { j = JSON.parse(texto); } catch (e) { /* resposta não é JSON */ }
  if (r.ok) return { ok: true, fato_id: j && j.fato_id != null ? j.fato_id : null, liberado: !!(j && j.liberado), comando: j && typeof j.comando === 'string' ? j.comando : null };
  const msgBanco = String((j && (j.message || j.error)) || '');
  const permanente = r.status >= 400 && r.status < 500 && FALHA_PERMANENTE.test(msgBanco);
  const motivo = permanente ? 'mensagem recusada pelo banco (validação), não adianta reenviar'
    : /SEGREDO NAO CONFIGURADO/.test(msgBanco) ? 'segredo não configurado no banco' : /SEGREDO INVALIDO/.test(msgBanco) ? 'segredo recusado pelo banco'
    : /Could not find the function/.test(msgBanco) ? 'falta aplicar o 09_whatsapp_entrada.sql' : 'banco respondeu ' + r.status;
  console.error(pre + ': ' + motivo);
  return { ok: false, erro: motivo, transitoria: !permanente };
}

// Grava as mensagens (uma chamada ao banco por mensagem, juntas) e decide a resposta ao provedor: se alguma falhou por motivo
// passageiro, lança 503 (o provedor reenvia o evento inteiro; as já gravadas voltam como repetidas, sem duplicar). Senão devolve
// as contagens para o 200, com as recusadas por validação em `falhas`. Usada por este endpoint e pelo da Bird.
async function gravarMensagens(cfg, msgs, rotulo) {
  const pre = rotulo || 'whatsapp';
  const resultados = await Promise.all(msgs.map((m) => gravar(cfg, m, pre)));
  const gravadas = resultados.filter((r) => r.ok).length;
  const liberadas = resultados.filter((r) => r.ok && r.liberado).length;
  const comandos = resultados.filter((r) => r.ok && r.comando).length;
  const passageiras = resultados.filter((r) => !r.ok && r.transitoria).length;
  const falhas = msgs.length - gravadas;
  if (msgs.length) {
    console.error(pre + ': ' + msgs.length + ' mensagem(ns), ' + gravadas + ' gravada(s), ' + liberadas + ' de número liberado'
      + (comandos ? ', ' + comandos + ' comando(s) de aprovação' : '')
      + (falhas ? ', ' + falhas + ' falha(s)' + (passageiras ? ' (' + passageiras + ' para reenviar)' : '') : ''));
  }
  if (passageiras) throw new ErroHttp(503, 'o banco não gravou agora; o provedor reenvia e a gravação não duplica', { mensagens: msgs.length, gravadas, falhas });
  return { mensagens: msgs.length, gravadas, falhas };
}

// ===================================================================== GET (verificação da Meta)
function verificar(req, res, url) {
  const esperado = cfgVerificacao();
  const modo = url.v['hub.mode'], token = url.v['hub.verify_token'], desafio = url.v['hub.challenge'];
  if (modo !== 'subscribe' || typeof token !== 'string' || !token || typeof desafio !== 'string' || !desafio || desafio.length > 200) throw new ErroHttp(403, 'verificação recusada');
  if (!igual(token, esperado)) throw new ErroHttp(403, 'verificação recusada');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(desafio);   // a Meta espera o hub.challenge de volta, cru
}

// ===================================================================== POST (mensagens)
async function receber(req, res) {
  if (Number(cab(req, 'content-length')) > LIMITE_BYTES) throw GRANDE();
  const bruto = await lerBruto(req);
  if (bruto.length > LIMITE_BYTES) throw GRANDE();
  conferirAssinatura(req, bruto);   // 503 sem o segredo, 401 se não bater; daqui em diante 200, ou 503 se o banco falhar por motivo passageiro
  const cfg = cfgBanco();
  let payload = null;
  try { payload = JSON.parse(bruto.toString('utf8')); } catch (e) { /* assinado mas não é JSON: responde 200 e ignora */ }
  if (!objSimples(payload) || (payload.object && payload.object !== 'whatsapp_business_account')) return responder(res, 200, { ok: true, mensagens: 0, ignorado: true });
  const msgs = extrairMensagens(payload);
  const r = await gravarMensagens(cfg, msgs, 'whatsapp');   // 503 se alguma falhou por motivo passageiro (a Meta reenvia)
  return responder(res, 200, { ok: true, mensagens: r.mensagens, gravadas: r.gravadas, falhas: r.falhas });
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    if (req.method !== 'GET' && req.method !== 'POST') throw new ErroHttp(405, 'use GET (verificação) ou POST (webhook)', { _allow: 'GET, POST' });
    const url = paramsDaUrl(req);
    if (url.proibidos.length) throw new ErroHttp(400, 'segredo não pode ir na URL');
    if (req.method === 'GET') return verificar(req, res, url);
    return await receber(req, res);
  } catch (e) {
    const status = e instanceof ErroHttp ? e.status : 500;
    if (!(e instanceof ErroHttp)) console.error('whatsapp: erro inesperado (' + (e && e.name) + ')');
    if (typeof req.resume === 'function') req.resume(); // descarta o que sobrou do corpo
    const extra = e instanceof ErroHttp && e.extra ? e.extra : {};
    const { _allow, ...corpoExtra } = extra;
    return responder(res, status, { ok: false, erro: e instanceof ErroHttp ? e.message : 'erro interno', ...corpoExtra }, _allow ? { Allow: _allow } : null);
  }
}

module.exports = handler;
// a Vercel não converte o corpo: a assinatura da Meta é calculada sobre os bytes exatos que chegaram
module.exports.config = { api: { bodyParser: false } };
module.exports.extrairMensagens = extrairMensagens;
module.exports.LIMITE_BYTES = LIMITE_BYTES;
// para public/api/whatsapp-bird.js (só exportados; o comportamento destas funções é o daqui)
module.exports.cfgBanco = cfgBanco;
module.exports.gravar = gravar;
module.exports.gravarMensagens = gravarMensagens;
module.exports.lerBruto = lerBruto;
module.exports.responder = responder;
module.exports.ErroHttp = ErroHttp;
module.exports.igual = igual;
