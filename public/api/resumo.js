'use strict';
// Resumo para o diretor: e-mail no horário com o BI de cada obra (planejador + ERP).
//   GET  /api/resumo?quando=diario|semanal   Authorization: Bearer <CRON_SECRET> (o agendador da Vercel manda sozinho)
//        manda o e-mail de cada destinatário ativo da frequência; nada sai duas vezes no mesmo dia.
//   POST /api/resumo   x-chave: <chave pessoal>   corpo { "acao": "previa" | "mandar", "destinatario"?: 7 }
//        previa: devolve o texto, não manda nada; mandar: manda agora para o e-mail de quem pediu.
// Sem dado, chave, e-mail nem endereço do banco aqui (o repositório é público). Variáveis da Vercel:
//   TAF_SUPABASE_URL, TAF_SUPABASE_KEY (as do /api/leitura), CRON_SECRET (16+ caracteres), RESEND_API_KEY,
//   RESUMO_REMETENTE (ex.: Resumo TAF <resumo@seu-dominio>), TAF_CHAVE_RESUMO (chave do robô, gerada na tela do ERP),
//   VERCEL_PROJECT_PRODUCTION_URL (a Vercel preenche) para o link do site.
// Quem decide o que cada chave pode é o banco (fonte/erp/sql/08_resumo.sql). Nunca vai para log nem para resposta:
// chave, segredo, e-mail completo de outra pessoa, corpo do banco. Sem pacote npm: só fetch.

const crypto = require('crypto');

// maxEnvios: por execução (o banco aceita até 50); pausaMs: entre e-mails (a Resend aceita poucos por segundo);
// orcamentoMs: depois disso não começa e-mail novo (o que sobrar sai na próxima execução)
const CONFIG = { maxEnvios: 20, maxObras: 30, pausaMs: 600, orcamentoMs: 7000, tempoBancoMs: 8000, tempoEmailMs: 8000 };
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
  const todos = [];
  let quando = null;
  try {
    const u = new URL(String(req.url || '/'), 'http://local');
    for (const [k, v] of u.searchParams.entries()) { todos.push(k.toLowerCase()); if (k === 'quando') quando = v; }
  } catch (e) { /* url estranha: segue */ }
  if (req.query && typeof req.query === 'object') {
    for (const k of Object.keys(req.query)) todos.push(k.toLowerCase());
    if (quando === null && typeof req.query.quando === 'string') quando = req.query.quando;
  }
  return { todos: [...new Set(todos)], proibidos: todos.filter((k) => PARAMS_PROIBIDOS.includes(k)), quando };
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
const mascarar = (email) => { const s = String(email || ''), i = s.indexOf('@'); return i > 0 ? s[0] + '***' + s.slice(i) : '***'; };

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

// lê o resumo de cada obra (uma chamada por obra); obra que falha vira bloco "sem dado", não derruba o e-mail
async function lerObras(chave, obras) {
  const out = {};
  for (const o of obras.slice(0, CONFIG.maxObras)) {
    try { out[o] = await rpc('taf_resumo_obra', { p_chave: chave, p_obra: o }); }
    catch (e) {
      if (e instanceof ErroHttp && (e.codigo === 'robo' || e.codigo === 'chave' || e.codigo === 'rede')) throw e;
      out[o] = { obra: o, erro: true };
    }
  }
  return out;
}

// ===================================================================== e-mail
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const ORDEM_COR = { VERMELHO: 4, AMARELO: 3, 'SEM BASE': 2, VERDE: 1 };
const isoOk = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s);
const dm = (s) => (isoOk(s) ? s.slice(8, 10) + '/' + s.slice(5, 7) : 'sem data');
const dmy = (s) => (isoOk(s) ? dm(s) + '/' + s.slice(0, 4) : 'sem data');
const diaSem = (s) => (isoOk(s) ? DIAS[new Date(s.slice(0, 10) + 'T12:00:00Z').getUTCDay()] : '');
const n = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const pl = (k, um, varios) => (k === 1 ? um : varios);
const REAIS = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0, minimumFractionDigits: 0 });
const reais = (v) => (n(v) === null ? 'sem dado' : REAIS.format(n(v)).replace(/\s/g, ' '));
const txt = (v, max = 160) => String(v === null || v === undefined ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[\u2013\u2014]/g, '-').trim().slice(0, max);
const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const pior = (cores) => cores.filter((c) => ORDEM_COR[c]).sort((a, b) => ORDEM_COR[b] - ORDEM_COR[a])[0] || null;
const tituloObra = (r, cod) => { const nome = txt(r && r.nome, 80); return !nome ? 'OBRA ' + cod : nome.includes(cod) ? nome : 'OBRA ' + cod + ' · ' + nome; };
const eMais = (tot, l) => (tot > l.length ? '; e mais ' + (tot - l.length) : '');
const de = (a, b) => (n(a) ?? 0) + ' de ' + (n(b) ?? 0);

function linhaPpc(c) {
  const p = [];
  const f = c.ultima_fechada;
  if (f && isoOk(f.seg)) {
    p.push(n(f.ppc) === null ? 'semana de ' + dm(f.seg) + ' fechada sem compromisso publicado'
      : 'semana de ' + dm(f.seg) + ' fechada com ' + n(f.ppc) + '% (' + de(f.cumpridos, f.publicados) + ')' + (f.ensaio ? ', ensaio' : ''));
  } else p.push('nenhuma semana fechada');
  const a = c.semana_atual || {};
  const s = 'semana de ' + dm(a.seg);
  const prazo = a.fora_do_prazo ? ', passou do prazo de publicar' : '';
  if (a.estado === 'sem_plano') p.push(s + ' sem plano' + prazo);
  else if (a.estado === 'rascunho') p.push(s + ' não publicada (' + (n(a.propostos) ?? 0) + ' ' + pl(n(a.propostos), 'proposto', 'propostos') + ')' + prazo);
  else if (a.estado === 'publicada') {
    const st = a.status_pub === 'NO_PRAZO' ? ' no prazo' : a.status_pub === 'ATRASADA' ? ' com atraso' : a.status_pub === 'FORA_DO_PRAZO' ? ' fora do prazo' : '';
    p.push(s + ' publicada' + st + ': ' + de(a.cumpridos, a.publicados) + ' ' + pl(n(a.cumpridos), 'cumprido', 'cumpridos') + ' até agora');
  } else if (a.estado === 'fechada') p.push(s + ' fechada com ' + (n(a.ppc) === null ? 'sem dado' : n(a.ppc) + '%') + ' (' + de(a.cumpridos, a.publicados) + ')');
  else p.push(s + ': sem dado');
  return p.join(' · ');
}

function linhaAtrasadas(c) {
  const a = c.atrasadas || {}, tot = n(a.total);
  if (!tot) return tot === 0 ? 'nenhuma' : 'sem dado';
  const l = (Array.isArray(a.lista) ? a.lista : []).slice(0, 3).map((x) =>
    txt(x.id, 8) + ' ' + txt(x.nome, 60) + ', ' + (x.tipo === 'termino' ? 'término' : 'início') + ' ' + (n(x.dias) ?? 0) + ' ' + pl(n(x.dias), 'dia', 'dias') + ' atrasado');
  return tot + ' (' + l.join('; ') + eMais(tot, l) + ')';
}

const nomeCritica = (x) => (x.tipo === 'evento' || x.tipo === 'evento_pct' ? 'EVENTO ' + txt(x.ev, 10) + ' (' + txt(x.id, 8) + ')' : 'Marco ' + txt(x.id, 8) + ' ' + txt(x.nome, 50));

function linhaCriticas(c) {
  const k = c.criticas || {}, tot = n(k.total);
  if (!tot) return tot === 0 ? 'nenhum EVENTO ou marco em risco' : 'sem dado';
  const l = (Array.isArray(k.lista) ? k.lista : []).slice(0, 3).map((x) =>
    nomeCritica(x) + ' de ' + dm(x.data) + ' ' + txt(x.nivel, 10) + ': ' + txt(x.motivo, 160));
  return l.join('; ') + eMais(tot, l);
}

function linhaRestricoes(c) {
  const r = c.restricoes || {};
  const v = n(r.vencidas), f = n(r.vencem_7);
  if (v === null || f === null) return 'sem dado';
  const item = (x) => 'D' + txt(x.num, 6) + ' ' + txt(x.oque, 60) + ', ' + txt(x.resp, 40) + ', até ' + dm(x.data);
  const lv = (r.lista_vencidas || []).slice(0, 3).map(item), lf = (r.lista_vencem || []).slice(0, 3).map(item);
  const p1 = v === 0 ? 'nenhuma vencida' : v + ' ' + pl(v, 'vencida', 'vencidas') + ' (' + lv.join('; ') + eMais(v, lv) + ')';
  const p2 = f === 0 ? 'nenhuma vence até ' + dm(r.ate) : f + ' ' + pl(f, 'vence', 'vencem') + ' até ' + dm(r.ate) + ' (' + lf.join('; ') + eMais(f, lf) + ')';
  return p1 + ' · ' + p2;
}

function linhaApont(c) {
  const a = c.apontamento || {}, d = n(a.dias_uteis_sem);
  if (!isoOk(a.ultimo)) return 'nenhum apontamento registrado';
  return d === null ? 'último em ' + dm(a.ultimo) : d === 0 ? 'último em ' + dm(a.ultimo) + ', em dia'
    : d + ' ' + pl(d, 'dia útil', 'dias úteis') + ' sem apontamento (último em ' + dm(a.ultimo) + ')';
}

function linhaErp(e) {
  if (!e) return 'sem dado (obra fora do ERP)';
  if (!n(e.itens)) return 'sem dado (obra sem itens no ERP)';
  const comp = n(e.pedidos) ? reais(e.comprometido) : 'sem pedido lançado';
  const real = n(e.notas) ? reais(e.realizado) : 'sem nota lançada';
  let s = 'licitado ' + reais(e.licitado) + ' · meta ' + reais(e.meta) + ' · comprometido ' + comp + ' · realizado ' + real;
  const meta = n(e.meta), usado = (n(e.comprometido) ?? 0) + (n(e.realizado) ?? 0);
  if (meta && meta > 0 && (n(e.pedidos) || n(e.notas))) s += ' · comprometido mais realizado: ' + Math.round((usado / meta) * 100) + '% da meta';
  return s;
}

// Um bloco por obra: título, cor (a pior entre as luzes do planejador e o EVENTO mais crítico), frase e itens.
function blocoObra(cod, r, base) {
  const b = { cod, titulo: tituloObra(r, cod), cor: 'SEM DADO', motivo: '', frase: '', itens: [], links: [] };
  if (!r || r.erro) { b.itens.push(['Situação', 'sem dado (não consegui ler esta obra agora)']); return b; }
  const c = r.ciclo;
  if (!c) b.itens.push(['Planejador', 'sem dado (obra fora do planejador)']);
  else if (c.cronograma === false) b.itens.push(['Planejador', 'sem dado (obra sem cronograma no planejador)']);
  else if (c.erro) b.itens.push(['Planejador', 'sem dado (não consegui calcular o planejador desta obra)']);
  else {
    const lz = c.luzes || {}, pr = lz.producao || {}, pa = lz.plano || {};
    const crit = ((c.criticas || {}).lista || [])[0];
    const cor = pior([pr.cor, pa.cor, crit && crit.nivel]);
    if (cor) b.cor = cor;
    if (crit && crit.nivel === cor) b.motivo = nomeCritica(crit) + ' em risco';
    else if (pa.cor === cor) b.motivo = 'plano: ' + txt(pa.motivo, 90);
    else if (pr.cor === cor) b.motivo = 'produção: ' + txt(pr.motivo, 90);
    b.frase = txt(c.frase, 400);
    b.itens.push(['Luzes', 'produção ' + (txt(pr.cor, 12) || 'sem dado') + (pr.motivo ? ' (' + txt(pr.motivo, 90) + ')' : '') +
      ' · plano ' + (txt(pa.cor, 12) || 'sem dado') + (pa.motivo ? ' (' + txt(pa.motivo, 90) + ')' : '')]);
    b.itens.push(['PPC', linhaPpc(c)]);
    b.itens.push(['Atrasadas', linhaAtrasadas(c)]);
    b.itens.push(['Mais críticas', linhaCriticas(c)]);
    b.itens.push(['Restrições', linhaRestricoes(c)]);
    b.itens.push(['Apontamento', linhaApont(c)]);
  }
  b.itens.push(['Custo (ERP)', linhaErp(r.erp)]);
  if (base) {
    if (c && c.cronograma !== false) b.links.push(['Planejador', base + '/ciclo?obra=' + encodeURIComponent(cod) + '&aba=sit']);
    if (r.erp) b.links.push(['ERP', base + '/erp?obra=' + encodeURIComponent(cod)]);
  }
  return b;
}

// resumos: { '999': {...} }; obras: ordem dos blocos; quando: diario | semanal | teste | previa
function montarEmail({ resumos, obras, quando, hoje, base }) {
  const lista = Array.isArray(obras) ? obras : Object.keys(resumos || {});
  const peso = (b) => ({ VERMELHO: 0, AMARELO: 1 }[b.cor] ?? 2);   // conclusão primeiro: obra em alerta vem antes
  const blocos = lista.map((cod) => blocoObra(String(cod), (resumos || {})[cod], base))
    .sort((a, b) => peso(a) - peso(b) || (a.cod < b.cod ? -1 : a.cod > b.cod ? 1 : 0));
  const verm = blocos.filter((b) => b.cor === 'VERMELHO'), amar = blocos.filter((b) => b.cor === 'AMARELO');
  const semDado = blocos.filter((b) => b.cor === 'SEM DADO' || b.cor === 'SEM BASE');
  let conclusao;
  if (!blocos.length) conclusao = 'Nenhuma obra na sua lista.';
  else if (verm.length || amar.length) {
    conclusao = 'Pedem atenção: ' + [...verm, ...amar].map((b) => b.cod + ' ' + b.cor + (b.motivo ? ' (' + b.motivo + ')' : '')).join('; ') + '.';
  } else conclusao = 'Nenhuma obra em vermelho ou amarelo.';
  if (semDado.length) conclusao += ' Sem dado ou sem base: ' + semDado.map((b) => b.cod).join(', ') + '.';
  const tipo = quando === 'semanal' ? ' · semanal' : quando === 'teste' ? ' · teste pedido na tela' : quando === 'previa' ? ' · prévia' : '';
  const titulo = 'Resumo TAF · ' + (diaSem(hoje) ? diaSem(hoje) + ' ' : '') + dmy(hoje) + tipo;
  const alerta = verm.length ? verm.map((b) => b.cod).join(', ') + ' em vermelho' : amar.length ? amar.map((b) => b.cod).join(', ') + ' em amarelo' : 'sem obra em alerta';
  const assunto = (quando === 'teste' ? '[teste] ' : '') + 'Resumo TAF' + (quando === 'semanal' ? ' semanal' : '') + ' ' + dm(hoje) + ': ' + alerta;
  const rodape = 'Mandado pelo site TAF. Quem recebe e quais obras: ERP > Gestão e administração > Resumo para o diretor.';

  const linhasTexto = (negrito) => {
    const B = (s) => (negrito ? '*' + s + '*' : s);
    const L = [B(titulo), conclusao, ''];
    for (const b of blocos) {
      L.push(B(b.titulo + ': ' + b.cor));
      if (b.frase) L.push(b.frase);
      for (const [rot, t] of b.itens) L.push('- ' + rot + ': ' + t);
      if (b.links.length) L.push('Abrir: ' + b.links.map(([, u]) => u).join(' · '));
      L.push('');
    }
    L.push(rodape);
    return L.join('\n');
  };

  const E = escHtml, COR = { VERMELHO: '#fde2e1;color:#8a1c14', AMARELO: '#fdf0c4;color:#5c4300', VERDE: '#dcf3e3;color:#14532d' };
  const selo = (cor) => '<span style="padding:2px 8px;border-radius:10px;font-size:12px;font-weight:bold;background:' + (COR[cor] || '#e8e8e8;color:#333333') + '">' + E(cor) + '</span>';
  const html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + E(assunto) + '</title></head>' +
    '<body style="margin:0;padding:12px;background:#f4f4f1;font:14px/1.45 Arial,Helvetica,sans-serif;color:#1d1d1b"><div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #dddddd;border-radius:8px;padding:16px">' +
    '<h1 style="font-size:18px;margin:0 0 6px">' + E(titulo) + '</h1><p style="font-size:15px;margin:0 0 12px"><b>' + E(conclusao) + '</b></p>' +
    blocos.map((b) => '<div style="border-top:1px solid #e5e5e5;padding:12px 0"><h2 style="font-size:16px;margin:0 0 6px">' + E(b.titulo) + ' ' + selo(b.cor) + '</h2>' +
      (b.frase ? '<p style="margin:0 0 6px">' + E(b.frase) + '</p>' : '') +
      '<ul style="padding-left:18px;margin:6px 0">' + b.itens.map(([rot, t]) => '<li><b>' + E(rot) + ':</b> ' + E(t) + '</li>').join('') + '</ul>' +
      (b.links.length ? '<p style="margin:6px 0 0">' + b.links.map(([rot, u]) => '<a href="' + E(u) + '" style="color:#0b57d0">Abrir ' + E(rot) + '</a>').join(' · ') + '</p>' : '') + '</div>').join('') +
    '<p style="font-size:12px;color:#555555;margin:12px 0 0">' + E(rodape) + '</p></div></body></html>';

  return { assunto, texto: linhasTexto(false), whatsapp: linhasTexto(true), html, blocos: blocos.map((b) => ({ obra: b.cod, cor: b.cor })) };
}

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

async function mandarEmail(cfg, msg) {
  let r;
  try {
    r = await globalThis.fetch(RESEND_URL, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(CONFIG.tempoEmailMs),
      headers: { Authorization: 'Bearer ' + cfg.resend, 'Content-Type': 'application/json', 'Idempotency-Key': msg.idem },
      body: JSON.stringify({ from: cfg.remetente, to: [msg.para], subject: msg.assunto, html: msg.html, text: msg.texto }) });
  } catch (e) { return { ok: false, erro: 'Resend inacessível (' + String(e && e.name).slice(0, 30) + ')' }; }
  let j = null;
  try { j = JSON.parse(await r.text()); } catch (e) { /* resposta não é JSON */ }
  if (r.ok && j && typeof j.id === 'string') return { ok: true, id: j.id.slice(0, 100) };
  const nome = j && typeof j.name === 'string' && /^[a-z_]{1,40}$/.test(j.name) ? ' (' + j.name + ')' : '';
  return { ok: false, erro: 'Resend respondeu ' + r.status + nome };
}

async function registrar(chave, resultados) {   // tenta duas vezes
  if (!resultados.length) return true;
  for (let i = 0; i < 2; i++) {
    try { await rpc('taf_resumo_registrar', { p_chave: chave, p_envios: resultados }); return true; } catch (e) { if (!i) await esperar(300); }
  }
  console.error('resumo: não consegui registrar ' + resultados.length + ' envio(s) no banco');
  return false;
}

// manda cada envio [{envio, tentativa, email, obras}] e devolve o que registrar (o primeiro sempre sai).
// Idempotency-Key = envio + tentativa: se o registro no banco falhar e a execução repetir, a Resend não manda de novo.
async function mandarTodos(cfg, envios, resumos, quando, hoje, base) {
  const t0 = Date.now(), out = [];
  for (let i = 0; i < envios.length; i++) {
    const env = envios[i];
    if (i > 0 && CONFIG.pausaMs) await esperar(CONFIG.pausaMs);
    if (i > 0 && Date.now() - t0 > CONFIG.orcamentoMs) { out.push({ envio: env.envio, ok: false, erro: 'sem tempo nesta execução' }); continue; }
    const m = montarEmail({ resumos, obras: env.obras, quando, hoje, base });
    const r = await mandarEmail(cfg, { para: env.email, assunto: m.assunto, html: m.html, texto: m.texto, idem: 'taf-resumo-' + env.envio + '-' + (n(env.tentativa) || 1) });
    out.push({ envio: env.envio, ok: r.ok, id: r.id || null, erro: r.erro || null });
  }
  return out;
}

// ===================================================================== GET (agendador)
async function agendador(req, res, url) {
  const segredo = String(process.env.CRON_SECRET || '').trim();
  if (segredo.length < 16) throw new ErroHttp(500, 'servidor sem configuração (CRON_SECRET na Vercel, com pelo menos 16 caracteres)');
  const b = bearer(req);
  if (!b || !segredoConfere(b, segredo)) throw new ErroHttp(401, 'não autorizado');
  const outros = url.todos.filter((k) => k !== 'quando');
  if (outros.length) throw new ErroHttp(400, 'parâmetro não aceito: ' + outros.slice(0, 3).map((k) => k.slice(0, 20)).join(', '));
  if (!['diario', 'semanal'].includes(url.quando)) throw new ErroHttp(400, 'use ?quando=diario ou ?quando=semanal');
  const robo = String(process.env.TAF_CHAVE_RESUMO || '').trim();
  if (!robo || robo.length > 200) throw new ErroHttp(500, 'servidor sem configuração (TAF_CHAVE_RESUMO na Vercel)');
  const cfg = emailCfg();
  bancoCfg();

  const mo = await rpc('taf_resumo_montar', { p_chave: robo, p_quando: url.quando, p_limite: CONFIG.maxEnvios });
  const envios = Array.isArray(mo && mo.envios) ? mo.envios.slice(0, CONFIG.maxEnvios) : [];
  const resumo = { ok: true, quando: url.quando, dia: (mo && mo.dia) || null, destinatarios: envios.length, enviados: 0, falhas: 0,
    restantes: n(mo && mo.restantes) ?? 0, desistidos: n(mo && mo.desistidos) ?? 0, obras: 0 };
  if (!envios.length) { console.error('resumo: ' + url.quando + ', nada a mandar'); return responder(res, 200, resumo); }
  const obras = [...new Set(envios.flatMap((e) => (Array.isArray(e.obras) ? e.obras : [])).map(String))].sort();
  let resumos;
  try { resumos = await lerObras(robo, obras); }
  catch (e) { await registrar(robo, envios.map((x) => ({ envio: x.envio, ok: false, erro: 'não consegui ler as obras' }))); throw e; }
  resumo.obras = Object.keys(resumos).length;
  const out = await mandarTodos(cfg, envios, resumos, url.quando, mo.hoje, siteBase(req));
  resumo.enviados = out.filter((x) => x.ok).length;
  resumo.falhas = out.length - resumo.enviados;
  resumo.registrado = await registrar(robo, out);
  console.error('resumo: ' + url.quando + ', ' + envios.length + ' destinatário(s), ' + resumo.enviados + ' enviado(s), ' + resumo.falhas + ' falha(s), ' + resumo.restantes + ' para depois');
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
  const resumos = await lerObras(chave, obras);
  const base = siteBase(req);
  if (corpo.acao === 'previa') {
    const m = montarEmail({ resumos, obras: obras.slice(0, CONFIG.maxObras), quando: 'previa', hoje: p.hoje, base });
    return responder(res, 200, { ok: true, hoje: p.hoje || null, obras, assunto: m.assunto, texto: m.texto, whatsapp: m.whatsapp, html: m.html,
      blocos: m.blocos, meus: Array.isArray(p.meus) ? p.meus : [] });
  }
  const envios = (Array.isArray(p.envios) ? p.envios : []).slice(0, 3).map((e) => ({ ...e, obras: obras.slice(0, CONFIG.maxObras) }));
  const out = await mandarTodos(cfg, envios, resumos, 'teste', p.hoje, base);
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
