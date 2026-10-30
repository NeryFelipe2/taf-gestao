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
//   HERMES_WEBHOOK_URL      (opcional) https://... do webhook do Hermes: recebe uma CÓPIA de cada entrega que traz mensagem (ver abaixo)
// Cada mensagem de texto vira uma linha em ia.fato pela função do banco ia_whatsapp_receber (fonte/erp/sql/09_whatsapp_entrada.sql),
// que confere o segredo e a lista de números liberados. Áudio, imagem e documento: só o tipo e o id da mídia; nada é baixado.
// Toque em botão vira TEXTO igual ao id do botão ("ok 12", "nao 12"), como se tivesse sido digitado; rótulo, título e descrição não são
// gravados, e bruto.botao = true. Dois formatos da Meta: mensagem interativa livre (type "interactive", interactive.type "button_reply"
// ou "list_reply"; bruto.tipo = 'interactive') e botão de resposta rápida de MODELO (type "button", button.payload; bruto.tipo = 'button').
// Outro tipo de interactive: só o tipo. Toque de modelo sem payload aproveitável: mensagem de tipo desconhecido (ver textoDoBotaoDeModelo).
// Nunca responde ao remetente, nunca envia mensagem, nunca chama a API da Meta. Com a assinatura certa responde 200 quando a mensagem
// foi gravada ou quando o banco a recusou por validação (NUMERO INVALIDO, MENSAGEM SEM ID: reenviar não adianta, só conta). Falha
// passageira do banco (rede, 5xx, segredo ou função ainda não configurados) responde 503: a Meta reenvia, e reenviar é seguro porque a
// gravação é idempotente pelo hash md5('wa:'||id da mensagem). Número, nome e texto nunca vão para o log, só contagens.
// O endpoint irmão da Bird (api/whatsapp-bird.js) usa gravar/gravarMensagens/lerBruto/cfgBanco daqui (exports no fim do arquivo).
// CÓPIA PARA O HERMES (só aqui, a Bird não encaminha): com HERMES_WEBHOOK_URL válida, depois de conferir a assinatura da Meta, a mesma
// entrega vai por POST para essa URL, com os MESMOS bytes do corpo e o X-Hub-Signature-256 original (o Hermes confere com o mesmo App
// Secret). Só entrega que traz mensagem (aviso de status não). Sai junto com a gravação no banco; a resposta à Meta espera os dois.
// Não vai a entrega que só traz comando de aprovação ("ok 12", "nao 12: motivo", digitado ou por botão): o banco já trata e o Hermes responderia como conversa.
// A falha da cópia (rede, tempo de 3 s, status fora de 2xx) vira uma linha de log sem URL, sem corpo e sem número, e NUNCA muda a
// resposta à Meta: o status vem só do banco. Sem nova tentativa e sem seguir redirecionamento.

const crypto = require('crypto');

const LIMITE_BYTES = 3 * 1024 * 1024;   // a Meta documenta payload de até 3 MB; abaixo disso uma rajada legítima e assinada seria recusada com 413
const TEMPO_BANCO_MS = 4000;       // por mensagem; a função tem 10 s (maxDuration em vercel.json)
const CONFIG = { tempoHermesMs: 3000 };   // a cópia para o Hermes sai junto com o banco: o pior caso é o maior dos dois, não a soma
const MAX_ID_BOTAO = 256;          // máximo do id de botão na documentação da Meta (o da linha de lista é 200)
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

// Toque em botão de resposta rápida de MODELO de mensagem (documentação da Meta, "Button messages webhook reference"): type "button" com
//   button: { payload, text }   (sem interactive). O payload é o texto definido no ENVIO do modelo ("ok 12"); o text é o rótulo do botão.
// Sem payload (ausente, vazio ou que não é texto), o rótulo só vale se ele mesmo for o comando; senão null e a mensagem vira de tipo desconhecido.
const COMANDO_NO_ROTULO = /^(ok|nao|não) \d+$/;
function textoDoBotaoDeModelo(b) {
  if (!objSimples(b)) return null;
  if (typeof b.payload === 'string' && b.payload.trim()) return b.payload.slice(0, MAX_ID_BOTAO);
  return typeof b.text === 'string' && COMANDO_NO_ROTULO.test(b.text) ? b.text : null;
}

// Id do botão ou da linha de lista que o usuário tocou (documentação da Meta, webhook de mensagens interativas):
//   interactive: { type: 'button_reply', button_reply: { id, title } }   ou   { type: 'list_reply', list_reply: { id, title, description } }
// Devolve só o id (nunca título nem descrição); null se não for resposta de botão/lista ou se vier sem id.
function idDaResposta(it) {
  if (!objSimples(it)) return null;
  const r = it.type === 'button_reply' ? it.button_reply : it.type === 'list_reply' ? it.list_reply : null;
  return objSimples(r) && typeof r.id === 'string' && r.id.trim() ? r.id.slice(0, MAX_ID_BOTAO) : null;
}
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
        let tipo = TIPOS.includes(m.type) ? m.type : 'unknown';
        const botaoModelo = tipo === 'button' ? textoDoBotaoDeModelo(m.button) : null;
        if (tipo === 'button' && botaoModelo === null) tipo = 'unknown';   // toque de modelo sem payload aproveitável: tipo desconhecido, sem texto
        const bruto = { tipo, timestamp: texto(String(m.timestamp || ''), 20) };
        if (objSimples(m.context) && typeof m.context.id === 'string') bruto.responde_a = m.context.id.slice(0, 200);
        let corpo = null;
        if (tipo === 'text') corpo = texto(objSimples(m.text) ? m.text.body : '', MAX_TEXTO);
        else if (tipo === 'interactive') {
          const id = idDaResposta(m.interactive);   // toque em botão ou lista: o id vira o texto ("ok 12"); os outros interactive ficam só com o tipo
          if (id !== null) { corpo = id; bruto.botao = true; }
        } else if (tipo === 'button') { corpo = botaoModelo; bruto.botao = true; }   // toque em botão de modelo: o payload vira o texto
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

// ===================================================================== cópia para o Hermes (opcional)
// URL da cópia. Sem a variável: nada. Com ela: https obrigatório (http só para 127.0.0.1/localhost, em teste), sem usuário/senha na
// URL. Qualquer outra coisa é ignorada com um aviso que NÃO traz a URL (o caminho dela pode ser segredo).
function urlHermes() {
  const bruta = String(process.env.HERMES_WEBHOOK_URL || '').trim();
  if (!bruta) return null;
  let u = null;
  try { u = new URL(bruta); } catch (e) { /* inválida: cai no aviso */ }
  const ok = u && !u.username && !u.password && (u.protocol === 'https:' || (u.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(u.hostname)));
  if (!ok) { console.error('whatsapp: HERMES_WEBHOOK_URL ignorada (precisa ser uma URL https), não encaminhei'); return null; }
  return u.href;
}

// Quantas mensagens a entrega traz (entry[].changes[].value.messages[])? Aviso de status (entregue, lido) traz zero.
function contarMensagens(payload) {
  let n = 0;
  for (const e of Array.isArray(payload.entry) ? payload.entry : []) {
    if (!objSimples(e)) continue;
    for (const c of Array.isArray(e.changes) ? e.changes : []) {
      if (objSimples(c) && (!c.field || c.field === 'messages') && objSimples(c.value) && Array.isArray(c.value.messages)) n += c.value.messages.length;
    }
  }
  return n;
}

// Comando de aprovação: a MESMA gramática da função do banco (fonte/erp/sql/10_whatsapp_aprovacao.sql). Quem trata "ok 12" e "não 12: motivo"
// é o banco; o Hermes não precisa ver (e responderia como conversa a um toque de botão que ele nunca mandou). Se a gramática do banco mudar,
// mudar aqui também: o único efeito de um descompasso é o Hermes ver (ou não) um comando, nunca um comando deixar de ser aplicado.
// espaço = só ASCII ([ \t\n\r\f\v]): o \s do JS inclui NBSP e BOM, o do Postgres não, e a diferença faria o comando não ser copiado ao Hermes nem aplicado pelo banco
const ESP = '[ \\t\\n\\r\\f\\v]';
const CMD_APROVAR = new RegExp('^' + ESP + '*(ok|sim|aprovo|aprovado|pode)' + ESP + '+#?\\d{1,9}' + ESP + '*[.!]?' + ESP + '*$', 'i');
const CMD_RECUSAR = new RegExp('^' + ESP + '*(n[aãÃ]o|recuso|recusado|cancela)' + ESP + '+#?\\d{1,9}' + ESP + '*(?:[:;,.\\-–—](?!\\d)' + ESP + '*[\\s\\S]*)?$', 'i');
const ehComandoDeAprovacao = (t) => typeof t === 'string' && (CMD_APROVAR.test(t) || CMD_RECUSAR.test(t));

// A entrega só traz comandos de aprovação (toque em botão ou texto digitado)? Só vale se TODA mensagem da entrega foi entendida e é comando:
// na dúvida (mensagem que não deu para ler, mistura com conversa) a cópia vai.
function soComandosDeAprovacao(msgs, total) {
  return total > 0 && msgs.length === total && msgs.every((m) => ehComandoDeAprovacao(m.texto));
}

// Um POST para o Hermes com os MESMOS bytes do corpo e o X-Hub-Signature-256 como a Meta mandou. Nunca lança e nunca tenta de novo;
// o único efeito de uma falha é uma linha de log (sem URL, sem corpo, sem número). Não segue redirecionamento: 3xx conta como falha.
async function encaminhar(req, bruto) {
  try {
    const url = urlHermes();
    if (!url) return;
    const r = await globalThis.fetch(url, {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(CONFIG.tempoHermesMs),
      headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': cab(req, 'x-hub-signature-256') },
      body: bruto,
    });
    try { await r.body.cancel(); } catch (e) { /* a resposta do Hermes não interessa */ }
    if (r.status < 200 || r.status > 299) console.error('whatsapp: encaminhamento falhou (status ' + r.status + ')');
    else console.error('whatsapp: encaminhado ao Hermes');
  } catch (e) {
    console.error('whatsapp: encaminhamento falhou (rede)');
  }
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
  // Banco e cópia para o Hermes correm juntos (o pior caso é o maior dos dois tempos, bem abaixo dos 10 s da função) e a resposta só
  // sai depois dos dois. A cópia nunca lança; se o banco falhar por motivo passageiro o 503 sai do mesmo jeito, mesmo que a cópia tenha dado certo.
  const total = contarMensagens(payload);
  // acima do teto as excedentes não seriam gravadas e a Meta não reenviaria (200): melhor 503 e log, a Meta repete
  if (total > MAX_MENSAGENS) { console.error('whatsapp: entrega com ' + total + ' mensagens, acima do teto de ' + MAX_MENSAGENS + ', pedindo reenvio'); throw new ErroHttp(503, 'lote acima do teto; reenvie'); }
  const copiar = total > 0 && !soComandosDeAprovacao(msgs, total);
  // Grava primeiro; só se o banco aceitou (ou recusou por validação) a entrega segue ao Hermes. Assim um 503 do banco, que a Meta reenvia, não faz o Hermes ver a mesma mensagem várias vezes.
  const r = await gravarMensagens(cfg, msgs, 'whatsapp');   // lança 503 se alguma falhou por motivo passageiro
  if (copiar) await encaminhar(req, bruto);   // nunca lança; falha só vira linha de log
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
module.exports.CONFIG = CONFIG;
module.exports.ehComandoDeAprovacao = ehComandoDeAprovacao;
module.exports.TEMPO_BANCO_MS = TEMPO_BANCO_MS;
// para public/api/whatsapp-bird.js (só exportados; o comportamento destas funções é o daqui)
module.exports.cfgBanco = cfgBanco;
module.exports.gravar = gravar;
module.exports.gravarMensagens = gravarMensagens;
module.exports.lerBruto = lerBruto;
module.exports.responder = responder;
module.exports.ErroHttp = ErroHttp;
module.exports.igual = igual;
