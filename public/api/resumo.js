'use strict';
// Resumo para o diretor: e-mail no horário com o BI de cada obra (planejador + ERP).
//   GET  /api/resumo?quando=diario|semanal[&repescagem=1]   Authorization: Bearer <CRON_SECRET> (o agendador da Vercel manda sozinho)
//        manda o e-mail de cada destinatário ativo da frequência, um pedido à Resend por e-mail, com a chave de idempotência
//        do envio (a mesma em toda tentativa): nada sai duas vezes no mesmo dia, nem quando uma execução repete.
//        A repescagem, duas horas depois, manda só o que não saiu (erro ou cadastro novo).
//   POST /api/resumo   x-chave: <chave pessoal>   corpo { "acao": "previa" | "mandar", "destinatario"?: 7 }
//        previa: devolve o texto, não manda nada; mandar: manda agora para o e-mail de quem pediu.
// Sem dado, chave, e-mail nem endereço do banco aqui (o repositório é público). Variáveis da Vercel:
//   TAF_SUPABASE_URL, TAF_SUPABASE_KEY (as do /api/leitura), CRON_SECRET (16+ caracteres; espaço no meio vale), RESEND_API_KEY,
//   RESUMO_REMETENTE (ex.: Resumo TAF <resumo@seu-dominio>), TAF_CHAVE_RESUMO (chave do robô, gerada na tela do ERP),
//   VERCEL_PROJECT_PRODUCTION_URL (a Vercel preenche) para o link do site.
// Quem decide o que cada chave pode é o banco (fonte/erp/sql/08_resumo.sql). Nunca vai para log nem para resposta:
// chave, segredo, e-mail completo de outra pessoa, corpo do banco. Sem pacote npm: só fetch.
// O texto do e-mail fica em _resumo_email.js (o "_" faz a Vercel não publicar o arquivo como endpoint).

const crypto = require('crypto');
const { montarEmail, blocoObra, mascarar, n } = require('./_resumo_email.js');

// maxEnvios: por execução (o banco aceita até 100, o máximo de destinatários ativos); obrasJuntas: obras lidas no banco ao
// mesmo tempo; pausaMs: entre pedidos à Resend (ela aceita 10 por segundo por conta; aqui no máximo 4); orcamentoMs: depois
// disso, contado do começo da execução, não começa e-mail novo: o que sobrar não foi tentado e sai na repescagem ou no dia
// seguinte, primeiro da fila. A função tem até 60 s (maxDuration em vercel.json): sobra tempo para registrar no banco.
const CONFIG = { maxEnvios: 100, maxObras: 30, obrasJuntas: 4, pausaMs: 250, orcamentoMs: 40000, tempoBancoMs: 8000, tempoEmailMs: 8000 };
const LIMITE_BYTES = 4 * 1024;
const RESEND_URL = 'https://api.resend.com/emails';
const PARAMS_PROIBIDOS = ['k', 'chave', 'key', 'token', 'apikey', 'api_key', 'senha', 'password', 'secret', 'segredo'];
const CAMPOS_CORPO = ['acao', 'destinatario'];
const ACOES = ['previa', 'mandar'];

class ErroHttp extends Error {
  constructor(status, msg, extra, codigo) { super(msg); this.status = status; this.extra = extra || null; this.codigo = codigo || null; }
}
const objSimples = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ===================================================================== entrada (mesmas proteções do /api/leitura)
const GRANDE = () => new ErroHttp(413, 'corpo grande demais (máx. ' + LIMITE_BYTES + ' bytes)');
function lerStream(req) {
  return new Promise((resolve, reject) => {
    const partes = [];
    let total = 0;
    req.on('data', (c) => { total += c.length; if (total <= LIMITE_BYTES) partes.push(c); });
    req.on('end', () => (total > LIMITE_BYTES ? reject(GRANDE()) : resolve(Buffer.concat(partes).toString('utf8'))));
    req.on('error', reject);
  });
}

async function lerCorpo(req) {
  let b;
  try { b = req.body; } // a Vercel já lê e converte o JSON
  catch (e) { throw e && e.statusCode === 413 ? GRANDE() : new ErroHttp(400, 'JSON inválido'); }
  // só lê o fluxo se ninguém leu antes (Node puro); com a Vercel o fluxo já foi consumido
  if (b === undefined && typeof req.on === 'function' && !req.readableEnded) b = await lerStream(req);
  if (Buffer.isBuffer(b)) b = b.toString('utf8');
  if (typeof b === 'string') {
    if (Buffer.byteLength(b) > LIMITE_BYTES) throw GRANDE();
    if (!b.trim()) throw new ErroHttp(400, 'corpo vazio');
    try { b = JSON.parse(b); } catch (e) { throw new ErroHttp(400, 'JSON inválido'); }
  }
  if (b === undefined || b === null) throw new ErroHttp(400, 'corpo vazio');
  return b;
}

function validarCorpo(b) {
  if (!objSimples(b)) throw new ErroHttp(400, 'corpo precisa ser um objeto JSON { acao }');
  const extras = Object.keys(b).filter((k) => !CAMPOS_CORPO.includes(k));
  if (extras.length) {
    const dica = extras.some((k) => PARAMS_PROIBIDOS.includes(String(k).toLowerCase())) ? ' (a chave vai só no cabeçalho x-chave)' : '';
    throw new ErroHttp(400, 'campo não aceito no corpo: ' + extras.slice(0, 5).map((k) => String(k).slice(0, 30)).join(', ') + dica);
  }
  if (!ACOES.includes(b.acao)) throw new ErroHttp(400, 'acao: use "previa" ou "mandar"');
  let dest = null;
  if (b.destinatario !== undefined && b.destinatario !== null) {
    if (!Number.isSafeInteger(b.destinatario) || b.destinatario < 1 || b.destinatario > 1e12) throw new ErroHttp(400, 'destinatario: número do cadastro');
    dest = b.destinatario;
  }
  if (Buffer.byteLength(JSON.stringify(b)) > LIMITE_BYTES) throw GRANDE();
  return { acao: b.acao, destinatario: dest };
}

const cab = (req, k) => { const v = (req.headers || {})[k]; return String((Array.isArray(v) ? v[0] : v) || ''); };
const bearer = (req) => { const m = /^Bearer\s+(\S+)\s*$/i.exec(cab(req, 'authorization')); return m ? m[1] : ''; };
const chaveDoCabecalho = (req) => (cab(req, 'x-chave') || bearer(req)).trim();

function paramsDaUrl(req) {
  const todos = [], v = { quando: null, repescagem: null };
  try {
    const u = new URL(String(req.url || '/'), 'http://local');
    for (const [k, x] of u.searchParams.entries()) { todos.push(k.toLowerCase()); if (k in v && v[k] === null) v[k] = x; }
  } catch (e) { /* url estranha: segue */ }
  if (req.query && typeof req.query === 'object') {
    for (const k of Object.keys(req.query)) todos.push(k.toLowerCase());
    for (const k of Object.keys(v)) if (v[k] === null && typeof req.query[k] === 'string') v[k] = req.query[k];
  }
  return { todos: [...new Set(todos)], proibidos: todos.filter((k) => PARAMS_PROIBIDOS.includes(k)), ...v };
}

function responder(res, status, obj, cabecalhos) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  for (const k of Object.keys(cabecalhos || {})) res.setHeader(k, cabecalhos[k]);
  res.end(JSON.stringify(obj));
}

// compara sem vazar pelo tempo de resposta
const h256 = (t) => crypto.createHash('sha256').update(String(t)).digest();
const segredoConfere = (recebido, esperado) => crypto.timingSafeEqual(h256(recebido), h256(esperado));

// ===================================================================== banco
function bancoCfg() {
  const base = String(process.env.TAF_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const anon = String(process.env.TAF_SUPABASE_KEY || '').trim();
  let ok = false;   // http só no teste local
  try { const u = new URL(base); ok = u.protocol === 'https:' || (u.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(u.hostname)); } catch (e) { /* falso */ }
  if (!ok || !anon) throw new ErroHttp(500, 'servidor sem configuração (TAF_SUPABASE_URL e TAF_SUPABASE_KEY na Vercel)');
  return { base, anon };
}

// mensagem do banco -> resposta para a tela (nunca repete o corpo do banco)
const ERROS_BANCO = [
  [/CHAVE DO ROBO INVALIDA/, 500, 'o banco recusou a chave do robô (TAF_CHAVE_RESUMO): gere outra no ERP e troque na Vercel', 'robo'],
  [/A CHAVE DO ROBO NAO FAZ PREVIA/, 403, 'a chave do robô não faz prévia', 'chave'],
  [/CHAVE INVALIDA/, 403, 'chave recusada', 'chave'],
  [/USE SUA CHAVE PESSOAL/, 403, 'use a sua chave pessoal: a chave geral do site não serve aqui', 'chave'],
  [/SEM ACESSO A ESTE DESTINATARIO/, 403, 'sua chave não vê este destinatário'],
  [/SEM ACESSO A OBRA/, 403, 'sua chave não abre esta obra'],
  [/OBRA INVALIDA/, 404, 'obra não existe'],
  [/DESTINATARIO NAO EXISTE/, 404, 'destinatário não existe'],
  [/SEU E-MAIL NAO ESTA NA LISTA/, 409, 'seu e-mail não está na lista: cadastre e marque "É o meu e-mail"'],
  [/LIMITE DE 5 ENVIOS DE TESTE POR DIA/, 429, 'limite de 5 envios de teste por dia'],
  [/NENHUMA OBRA DO SEU CADASTRO NA SUA CHAVE/, 409, 'as obras do cadastro do seu e-mail não estão na sua chave: confira o cadastro'],
];

async function rpc(fn, args) {
  const { base, anon } = bancoCfg();
  let r;
  try {
    r = await globalThis.fetch(base + '/rest/v1/rpc/' + fn, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(CONFIG.tempoBancoMs),
      headers: { apikey: anon, Authorization: 'Bearer ' + anon, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  } catch (e) {
    console.error('resumo: banco inacessível em ' + fn + ' (' + (e && e.name) + ')');
    throw new ErroHttp(502, 'banco inacessível', null, 'rede');
  }
  const texto = await r.text();
  let j = null;
  try { j = JSON.parse(texto); } catch (e) { /* resposta não é JSON */ }
  if (r.ok) return j;
  const msg = String((j && (j.message || j.error)) || '');
  for (const [re, st, txt, cod] of ERROS_BANCO) if (re.test(msg)) throw new ErroHttp(st, txt, null, cod);
  console.error('resumo: banco respondeu ' + r.status + ' em ' + fn);
  throw new ErroHttp(502, 'o banco recusou o pedido', { status_banco: r.status }, 'banco');
}

// lê o resumo de cada obra (uma chamada por obra, algumas ao mesmo tempo); obra que falha vira bloco "sem dado",
// não derruba o e-mail. Chave recusada ou banco fora do ar param tudo.
async function lerObras(chave, obras) {
  const lista = obras.slice(0, CONFIG.maxObras), out = {};
  let i = 0, parou = null;
  const leitor = async () => {
    while (!parou && i < lista.length) {
      const o = lista[i++];
      try { out[o] = await rpc('taf_resumo_obra', { p_chave: chave, p_obra: o }); }
      catch (e) {
        if (e instanceof ErroHttp && (e.codigo === 'robo' || e.codigo === 'chave' || e.codigo === 'rede')) { parou = parou || e; return; }
        out[o] = { obra: o, erro: true };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONFIG.obrasJuntas, lista.length) }, leitor));
  if (parou) throw parou;
  return out;
}

const obrasDe = (envios) => [...new Set(envios.flatMap((e) => (Array.isArray(e.obras) ? e.obras : [])).map(String))].sort();

function siteBase(req) {
  const fixo = String(process.env.VERCEL_PROJECT_PRODUCTION_URL || '').trim().toLowerCase();
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(fixo)) return 'https://' + fixo;
  const h = String((req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || '').split(',')[0].trim().toLowerCase();
  if (/^(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(h)) return 'http://' + h;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(:\d{1,5})?$/.test(h)) return 'https://' + h;
  return '';
}

function emailCfg() {
  const resend = String(process.env.RESEND_API_KEY || '').trim(), remetente = String(process.env.RESUMO_REMETENTE || '').trim();
  const faltam = [!resend && 'RESEND_API_KEY', !remetente && 'RESUMO_REMETENTE'].filter(Boolean);
  if (faltam.length) throw new ErroHttp(500, 'servidor sem configuração (' + faltam.join(' e ') + ' na Vercel)');
  if (!/^([^<>@\r\n]{1,80}<)?[^@\s<>]+@[^@\s<>]+\.[A-Za-z]{2,}>?$/.test(remetente)) throw new ErroHttp(500, 'RESUMO_REMETENTE fora do formato (ex.: Resumo TAF <resumo@seu-dominio>)');
  return { resend, remetente };
}

const corpoEmail = (cfg, m) => ({ from: cfg.remetente, to: [m.para], subject: m.assunto, html: m.html, text: m.texto });

// POST na Resend; devolve { status, j } ou { erro } se a rede caiu (sem repetir nada da resposta além do nome do erro)
async function postResend(cfg, url, idem, corpo) {
  let r;
  try {
    r = await globalThis.fetch(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(CONFIG.tempoEmailMs),
      headers: { Authorization: 'Bearer ' + cfg.resend, 'Content-Type': 'application/json', 'Idempotency-Key': idem }, body: JSON.stringify(corpo) });
  } catch (e) { return { erro: 'Resend inacessível (' + String(e && e.name).slice(0, 30) + ')' }; }
  let j = null;
  try { j = JSON.parse(await r.text()); } catch (e) { /* resposta não é JSON */ }
  const nome = j && typeof j.name === 'string' && /^[a-z_]{1,40}$/.test(j.name) ? ' (' + j.name + ')' : '';
  return { ok: r.ok, status: r.status, j, erro: r.ok ? null : 'Resend respondeu ' + r.status + nome };
}

// 409 invalid_idempotent_request: a chave deste envio já foi usada com outro texto (o dado da obra mudou entre a primeira
// tentativa e esta). A primeira já saiu: conta como enviado, sem mandar de novo. 409 concurrent_idempotent_requests: outra
// execução está mandando este mesmo envio agora: fica como erro, e a próxima tentativa (mesma chave) não repete.
// 429: a Resend pediu para esperar; esta execução para de mandar (os outros não foram tentados).
async function mandarEmail(cfg, msg) {
  const r = await postResend(cfg, RESEND_URL, msg.idem, corpoEmail(cfg, msg));
  if (r.ok && r.j && typeof r.j.id === 'string') return { ok: true, id: r.j.id.slice(0, 100) };
  if (r.status === 409 && r.j && r.j.name === 'invalid_idempotent_request') return { ok: true, id: null, jaSaiu: true };
  return { ok: false, erro: r.erro || 'Resend respondeu ' + r.status, limite: r.status === 429 };
}

async function registrar(chave, resultados) {   // tenta duas vezes
  if (!resultados.length) return true;
  for (let i = 0; i < 2; i++) {
    try { await rpc('taf_resumo_registrar', { p_chave: chave, p_envios: resultados }); return true; } catch (e) { if (!i) await esperar(300); }
  }
  console.error('resumo: não consegui registrar ' + resultados.length + ' envio(s) no banco');
  return false;
}

// Idempotency-Key do envio: 'taf-resumo-' + número do envio, sem a tentativa. O envio é único por destinatário e dia (o de
// teste, por pedido) e a Resend guarda a chave por 24 h: se a execução repetir porque o registro no banco falhou, a resposta
// não chegou (tempo esgotado) ou a Resend deu erro depois de aceitar, a nova tentativa leva a MESMA chave e a Resend não
// manda de novo. (Antes a chave tinha a tentativa, que o banco soma a cada reserva: toda nova tentativa saía de novo.)
const idemDe = (env) => 'taf-resumo-' + env.envio;

// Manda os envios [{envio, tentativa, email, obras}] e devolve o que registrar. Um pedido à Resend por e-mail, com pausa
// entre eles. Sem lote: no lote a chave de idempotência vale para o pedido inteiro, e um e-mail que tivesse saído num lote
// e voltasse noutro (ou sozinho) sairia de novo. Até o fim do orçamento de tempo (o primeiro sempre sai); o resto não foi
// tentado e fica para a repescagem. Erro da Resend, rede caída ou tempo esgotado: fica como erro e a repescagem tenta de
// novo com a mesma chave (se tinha saído, não sai outra vez).
async function mandarTodos(cfg, envios, resumos, quando, hoje, base, inicio) {
  const t0 = n(inicio) || Date.now(), out = [];
  let parou = null;
  for (let k = 0; k < envios.length; k++) {
    const env = envios[k];
    if (!parou && k > 0 && CONFIG.pausaMs) await esperar(CONFIG.pausaMs);
    if (parou || (k > 0 && Date.now() - t0 > CONFIG.orcamentoMs)) { out.push({ envio: env.envio, ok: false, id: null, erro: parou || 'sem tempo nesta execução' }); continue; }
    const m = montarEmail({ resumos, obras: env.obras, quando, hoje, base });
    const r = await mandarEmail(cfg, { para: env.email, assunto: m.assunto, html: m.html, texto: m.texto, idem: idemDe(env) });
    if (r.limite) parou = 'limite da Resend: fica para a próxima execução';
    out.push({ envio: env.envio, ok: !!r.ok, id: r.id || null, erro: r.ok ? null : r.erro || 'não saiu' });
  }
  return out;
}

// lê as obras dos envios já reservados; se não der, devolve os envios ao banco como erro (não ficam "mandando" para sempre)
async function lerOuDevolver(chave, envios) {
  try { return await lerObras(chave, obrasDe(envios)); }
  catch (e) { await registrar(chave, envios.map((x) => ({ envio: x.envio, ok: false, erro: 'não consegui ler as obras' }))); throw e; }
}

// ===================================================================== GET (agendador)
async function agendador(req, res, url) {
  const inicio = Date.now();
  const bruto = String(process.env.CRON_SECRET || ''), segredo = bruto.trim();
  if (segredo.length < 16) throw new ErroHttp(500, 'servidor sem configuração (CRON_SECRET na Vercel, com pelo menos 16 caracteres)');
  // a Vercel manda "Authorization: Bearer <CRON_SECRET>" com o valor exato: compara o cabeçalho inteiro (o segredo pode ter
  // espaço no meio, como uma frase-senha), sempre pelo hash e em tempo constante
  const auth = cab(req, 'authorization');
  if (!auth || !(segredoConfere(auth, 'Bearer ' + bruto) || segredoConfere(auth, 'Bearer ' + segredo))) throw new ErroHttp(401, 'não autorizado');
  const outros = url.todos.filter((k) => k !== 'quando' && k !== 'repescagem');
  if (outros.length) throw new ErroHttp(400, 'parâmetro não aceito: ' + outros.slice(0, 3).map((k) => k.slice(0, 20)).join(', '));
  if (!['diario', 'semanal'].includes(url.quando)) throw new ErroHttp(400, 'use ?quando=diario ou ?quando=semanal');
  if (url.repescagem !== null && url.repescagem !== '1') throw new ErroHttp(400, 'use ?repescagem=1');
  const rotulo = url.quando + (url.repescagem ? ' (repescagem)' : '');
  const robo = String(process.env.TAF_CHAVE_RESUMO || '').trim();
  if (!robo || robo.length > 200) throw new ErroHttp(500, 'servidor sem configuração (TAF_CHAVE_RESUMO na Vercel)');
  const cfg = emailCfg();
  bancoCfg();

  const mo = await rpc('taf_resumo_montar', { p_chave: robo, p_quando: url.quando, p_limite: CONFIG.maxEnvios });
  const envios = Array.isArray(mo && mo.envios) ? mo.envios.slice(0, CONFIG.maxEnvios) : [];
  const resumo = { ok: true, quando: url.quando, repescagem: !!url.repescagem, dia: (mo && mo.dia) || null, destinatarios: envios.length, enviados: 0, falhas: 0,
    restantes: n(mo && mo.restantes) ?? 0, desistidos: n(mo && mo.desistidos) ?? 0, obras: 0 };
  if (!envios.length) { console.error('resumo: ' + rotulo + ', nada a mandar'); return responder(res, 200, resumo); }
  const resumos = await lerOuDevolver(robo, envios);
  resumo.obras = Object.keys(resumos).length;
  const out = await mandarTodos(cfg, envios, resumos, url.quando, mo.hoje, siteBase(req), inicio);
  resumo.enviados = out.filter((x) => x.ok).length;
  resumo.falhas = out.length - resumo.enviados;
  resumo.registrado = await registrar(robo, out);
  console.error('resumo: ' + rotulo + ', ' + envios.length + ' destinatário(s), ' + resumo.enviados + ' enviado(s), ' + resumo.falhas + ' falha(s), ' + resumo.restantes + ' para depois');
  return responder(res, 200, resumo);
}

// ===================================================================== POST (tela do ERP)
async function tela(req, res) {
  const chave = chaveDoCabecalho(req);
  if (!chave) throw new ErroHttp(401, 'falta a chave no cabeçalho x-chave');
  if (chave.length > 200) throw new ErroHttp(401, 'chave recusada');
  if (cab(req, 'content-type').split(';')[0].trim().toLowerCase() !== 'application/json') throw new ErroHttp(415, 'o corpo precisa ser application/json');
  if (Number(cab(req, 'content-length')) > LIMITE_BYTES) throw GRANDE();
  const corpo = validarCorpo(await lerCorpo(req));
  bancoCfg();
  const cfg = corpo.acao === 'mandar' ? emailCfg() : null;   // confere antes de reservar o envio

  const p = await rpc('taf_resumo_previa', { p_chave: chave, p_destinatario: corpo.destinatario, p_enviar: corpo.acao === 'mandar' });
  const obras = Array.isArray(p && p.obras) ? p.obras.map(String) : [];
  const base = siteBase(req);
  if (corpo.acao === 'previa') {
    const resumos = await lerObras(chave, obras);
    const m = montarEmail({ resumos, obras: obras.slice(0, CONFIG.maxObras), quando: 'previa', hoje: p.hoje, base });
    return responder(res, 200, { ok: true, hoje: p.hoje || null, obras, assunto: m.assunto, texto: m.texto, whatsapp: m.whatsapp, html: m.html,
      blocos: m.blocos, meus: Array.isArray(p.meus) ? p.meus : [] });
  }
  // cada teste leva só as obras do cadastro daquele e-mail (o banco já cortou pelas obras da chave)
  const envios = (Array.isArray(p.envios) ? p.envios : []).slice(0, 3)
    .map((e) => ({ ...e, obras: (Array.isArray(e.obras) ? e.obras.map(String) : []).slice(0, CONFIG.maxObras) }));
  const resumos = await lerOuDevolver(chave, envios);
  const out = (await mandarTodos(cfg, envios.filter((e) => e.obras.length), resumos, 'teste', p.hoje, base))
    .concat(envios.filter((e) => !e.obras.length).map((e) => ({ envio: e.envio, ok: false, id: null, erro: 'sem obra do cadastro na chave' })));
  await registrar(chave, out);
  const ok = out.filter((x) => x.ok).length;
  return responder(res, ok ? 200 : 502, { ok: ok > 0, enviados: ok, falhas: out.length - ok,
    para: envios.map((e) => mascarar(e.email)), erro: ok ? undefined : 'o e-mail não saiu: ' + ((out[0] && out[0].erro) || 'sem destinatário') });
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    if (req.method !== 'GET' && req.method !== 'POST') throw new ErroHttp(405, 'use GET (agendador) ou POST (tela)', { _allow: 'GET, POST' });
    const url = paramsDaUrl(req);
    if (url.proibidos.length) throw new ErroHttp(400, 'a chave não pode ir na URL; use o cabeçalho');
    if (req.method === 'GET') return await agendador(req, res, url);
    if (url.todos.length) throw new ErroHttp(400, 'o POST não aceita parâmetro na URL');
    return await tela(req, res);
  } catch (e) {
    const status = e instanceof ErroHttp ? e.status : 500;
    if (!(e instanceof ErroHttp)) console.error('resumo: erro inesperado (' + (e && e.name) + ')');
    if (typeof req.resume === 'function') req.resume(); // descarta o que sobrou do corpo
    const extra = e instanceof ErroHttp && e.extra ? e.extra : {};
    const { _allow, ...corpoExtra } = extra;
    return responder(res, status, { ok: false, erro: e instanceof ErroHttp ? e.message : 'erro interno', ...corpoExtra }, _allow ? { Allow: _allow } : null);
  }
}

module.exports = handler;
module.exports.montarEmail = montarEmail;
module.exports.blocoObra = blocoObra;
module.exports.validarCorpo = validarCorpo;
module.exports.mascarar = mascarar;
module.exports.CONFIG = CONFIG;
module.exports.LIMITE_BYTES = LIMITE_BYTES;
