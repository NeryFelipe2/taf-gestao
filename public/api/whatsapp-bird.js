'use strict';
// Porta de entrada do WhatsApp pela Bird (provedor oficial da Meta). SÓ RECEBE E GRAVA. Irmã de /api/whatsapp (Meta direto).
//
//   POST /api/whatsapp-bird   um evento do webhook da Bird por requisição, JSON { "type", "timestamp", "data" }
//   cabeçalhos (Standard Webhooks): webhook-id, webhook-timestamp (segundos Unix da tentativa),
//   webhook-signature ("v1,<base64>"; pode vir mais de uma, separadas por espaço, durante a troca do segredo)
//
// Este arquivo NÃO tem chave, segredo, número nem endereço do banco (o repositório é público). Fica inerte até existirem na
// Vercel (Settings > Environment Variables, Production, e novo Deploy):
//   BIRD_WEBHOOK_SECRET     segredo do webhook na Bird (whsec_...; a Bird mostra uma vez só). Sem ele, 503.
//   WHATSAPP_SEGREDO_BANCO  segredo que o banco confere pelo SHA-256 em ia.config (o mesmo do /api/whatsapp)
//   TAF_SUPABASE_URL, TAF_SUPABASE_KEY  as do /api/leitura
//
// Assinatura: HMAC-SHA256 de "{webhook-id}.{webhook-timestamp}.{corpo bruto}", chave = o segredo sem "whsec_" decodificado de
// base64; vale qualquer assinatura v1 da lista; timestamp a mais de 5 minutos do relógio: recusa. Assinatura ausente, errada ou
// velha: 400 (a própria Bird recomenda 400 para a nova tentativa funcionar durante a troca do segredo).
// Resposta à Bird: qualquer 2xx = recebido; qualquer outra = ela reenvia (8 tentativas em cerca de 27,5 h, mesmo webhook-id).
//   - whatsapp.received de texto: grava (ia_whatsapp_receber, a mesma função do banco do /api/whatsapp).
//   - mensagem que não é texto (imagem, áudio...): grava só o tipo (o nome do braço presente em data); sem id de mídia, sem texto.
//   - status (accepted, sent, delivered, read, failed, rejected), reação e tipo desconhecido: 200 e ignora.
//   - from sem phone_number (usuário com username/BSUID): não dá para conferir a lista de liberados; conta como sem_numero, 200.
//   - falha passageira do banco (rede, 5xx, segredo ou função ainda não configurados): 503, a Bird reenvia e a gravação não duplica
//     (idempotente pelo hash do id da mensagem). Recusa por validação (NUMERO INVALIDO, MENSAGEM SEM ID): conta e 200.
// Nunca responde ao remetente, nunca envia mensagem, nunca chama a API da Bird. Número, nome e texto nunca vão para o log.

const crypto = require('crypto');
const { ErroHttp, responder, lerBruto, cfgBanco, gravarMensagens, igual, LIMITE_BYTES } = require('./whatsapp.js');

const TOLERANCIA_S = 300;   // 5 minutos, para mais e para menos
const MAX_TEXTO = 8000;
const MAX_ASSINATURAS = 10;
// Braços de mensagem que não é texto, os citados na documentação da Bird. O formato interno de cada um NÃO foi lido: nunca abrimos o braço.
const BRACOS = ['image', 'audio', 'video', 'document', 'sticker', 'location', 'contacts', 'interactive', 'button'];

const objSimples = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cab = (req, k) => { const v = (req.headers || {})[k]; return String((Array.isArray(v) ? v[0] : v) || ''); };
const GRANDE = () => new ErroHttp(413, 'corpo grande demais (máx. ' + LIMITE_BYTES + ' bytes)');

// ===================================================================== assinatura (Standard Webhooks)
// "whsec_<base64>" -> bytes da chave. Vazio = variável ausente ou sem conteúdo.
function chaveDoSegredo(texto) {
  const t = String(texto || '').trim();
  return t ? Buffer.from(t.replace(/^whsec_/, ''), 'base64') : Buffer.alloc(0);
}
function cfgSegredo() {
  const chave = chaveDoSegredo(process.env.BIRD_WEBHOOK_SECRET);
  if (!chave.length) throw new ErroHttp(503, 'servidor sem configuração (BIRD_WEBHOOK_SECRET na Vercel)');
  return chave;
}

function assinaturaEsperada(chave, id, ts, bruto) {
  return crypto.createHmac('sha256', chave).update(id + '.' + ts + '.').update(bruto).digest('base64');
}

// Lança 400 se faltar cabeçalho, o timestamp estiver fora de 5 minutos ou nenhuma assinatura v1 da lista bater. `agoraMs` só para teste.
function conferirAssinatura(req, bruto, chave, agoraMs) {
  const id = cab(req, 'webhook-id').trim(), ts = cab(req, 'webhook-timestamp').trim(), lista = cab(req, 'webhook-signature').trim();
  if (!id || !ts || !lista) throw new ErroHttp(400, 'assinatura ausente (webhook-id, webhook-timestamp e webhook-signature)');
  if (id.length > 200 || lista.length > 2000 || !/^\d{1,12}$/.test(ts)) throw new ErroHttp(400, 'assinatura fora do formato');
  const agora = Math.floor((agoraMs === undefined ? Date.now() : agoraMs) / 1000);
  if (Math.abs(agora - Number(ts)) > TOLERANCIA_S) throw new ErroHttp(400, 'assinatura velha (mais de 5 minutos de diferença)');
  const esperada = assinaturaEsperada(chave, id, ts, bruto);
  let achou = false;
  for (const par of lista.split(/\s+/).slice(0, MAX_ASSINATURAS)) {   // percorre todas: o tempo não diz qual item bateu
    const [versao, sig] = par.split(',');
    if (versao === 'v1' && typeof sig === 'string' && sig && igual(sig, esperada)) achou = true;
  }
  if (!achou) throw new ErroHttp(400, 'assinatura inválida');
}

// ===================================================================== evento da Bird -> mensagem simples (a mesma do /api/whatsapp)
// O formato do "timestamp" do envelope não está na documentação lida: aceita texto ISO 8601, número em segundos ou em milissegundos
// (abaixo de 1e11 é segundos). Se não der para ler, vale a hora em que a mensagem chegou aqui.
function quandoDe(ts) {
  let ms = NaN;
  if (typeof ts === 'number' || (typeof ts === 'string' && /^\d+(\.\d+)?$/.test(ts.trim()))) {
    const n = Number(ts);
    ms = n < 1e11 ? n * 1000 : n;
  } else if (typeof ts === 'string') ms = Date.parse(ts);
  return Number.isFinite(ms) && ms > 0 && ms < 8.64e15 ? new Date(ms).toISOString() : new Date().toISOString();
}

// Devolve { msg } para gravar, ou { pular: motivo } quando não há o que gravar (a Bird recebe 2xx do mesmo jeito: reenviar não ajuda).
function mensagemDoEvento(ev, webhookId) {
  const d = objSimples(ev) ? ev.data : null;
  if (!objSimples(d)) return { pular: 'invalido' };
  if (d.direction !== undefined && d.direction !== 'inbound') return { pular: 'nao_recebida' };   // só o que chegou até nós
  if (typeof d.whatsapp_id !== 'string' || !d.whatsapp_id.trim()) return { pular: 'sem_id' };
  const de = objSimples(d.from) && typeof d.from.phone_number === 'string' ? d.from.phone_number.replace(/\D/g, '') : '';
  if (!de) return { pular: 'sem_numero' };
  const nome = typeof d.from.display_name === 'string' ? d.from.display_name.slice(0, 120) : '';
  const ehTexto = objSimples(d.text);
  const tipo = ehTexto ? 'text' : BRACOS.find((k) => d[k] !== undefined && d[k] !== null) || 'unknown';
  // bruto: só o tipo e de onde veio. Nada de bsuid, username, telefone de destino, id da conta nem conteúdo de mídia.
  const bruto = { tipo, origem: 'bird' };
  if (webhookId) bruto.webhook_id = webhookId.slice(0, 100);
  return { msg: { de: de.slice(0, 32), nome, texto: ehTexto && typeof d.text.body === 'string' ? d.text.body.slice(0, MAX_TEXTO) : null,
    wa_id: d.whatsapp_id.slice(0, 200), quando: quandoDe(ev.timestamp), bruto } };
}

// ===================================================================== POST
async function receber(req, res) {
  const chave = cfgSegredo();   // 503 sem BIRD_WEBHOOK_SECRET
  if (Number(cab(req, 'content-length')) > LIMITE_BYTES) throw GRANDE();
  const bruto = await lerBruto(req);
  if (bruto.length > LIMITE_BYTES) throw GRANDE();
  conferirAssinatura(req, bruto, chave);   // 400; daqui em diante 2xx, ou 503 só se o banco falhar por motivo passageiro
  let ev = null;
  try { ev = JSON.parse(bruto.toString('utf8')); } catch (e) { /* assinado mas não é JSON: 200 e ignora */ }
  if (!objSimples(ev) || ev.type !== 'whatsapp.received') return responder(res, 200, { ok: true, ignorado: true });
  const m = mensagemDoEvento(ev, cab(req, 'webhook-id').trim());
  if (m.pular) {
    console.error('whatsapp-bird: evento sem o que gravar (' + m.pular + ')');
    return responder(res, 200, { ok: true, mensagens: 0, gravadas: 0, falhas: 0, [m.pular]: 1 });
  }
  const cfg = cfgBanco();   // 503 sem o banco ou o segredo do banco; só aqui, para status e reações não dependerem dele
  const r = await gravarMensagens(cfg, [m.msg], 'whatsapp-bird');
  return responder(res, 200, { ok: true, mensagens: r.mensagens, gravadas: r.gravadas, falhas: r.falhas });
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    if (req.method !== 'POST') throw new ErroHttp(405, 'use POST (webhook da Bird)', { _allow: 'POST' });
    return await receber(req, res);
  } catch (e) {
    const status = e instanceof ErroHttp ? e.status : 500;
    if (!(e instanceof ErroHttp)) console.error('whatsapp-bird: erro inesperado (' + (e && e.name) + ')');
    if (typeof req.resume === 'function') req.resume(); // descarta o que sobrou do corpo
    const extra = e instanceof ErroHttp && e.extra ? e.extra : {};
    const { _allow, ...corpoExtra } = extra;
    return responder(res, status, { ok: false, erro: e instanceof ErroHttp ? e.message : 'erro interno', ...corpoExtra }, _allow ? { Allow: _allow } : null);
  }
}

module.exports = handler;
// a Vercel não converte o corpo: a assinatura da Bird é calculada sobre os bytes exatos que chegaram
module.exports.config = { api: { bodyParser: false } };
module.exports.chaveDoSegredo = chaveDoSegredo;
module.exports.conferirAssinatura = conferirAssinatura;
module.exports.mensagemDoEvento = mensagemDoEvento;
module.exports.quandoDe = quandoDe;
