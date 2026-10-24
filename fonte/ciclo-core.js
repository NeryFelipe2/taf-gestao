/* ciclo-core.js · núcleo comum do /marko (engenheiro) e do /ciclo (gestor), obra 342.
   JS puro, sem dependências. Entra no marcador CICLOCORE do marko.html e do ciclo.html (marko.py / ciclo.py),
   num script antes do script da página. Define window.CC. A API está descrita em cada bloco abaixo.
   Regra deste arquivo: nunca escrever a sequência que fecha a tag script nem a que abre comentário HTML. */
(function (W, D) {
'use strict';

var CC = W.CC = {};
CC.VERSAO = '1.0';
CC.URL = 'https://vblfdikfobsirwpdnybw.supabase.co/rest/v1/rpc/';
CC.KEY = 'sb_publishable_pXs7_21V-PWatZ0iqZJ_ew_1Rm3JogW';
// ?obra=NNN troca a obra da tela (a obra 999 é o cenário de teste); quem autoriza é o banco, pela chave
CC.OBRA = (function () { var m = /[?&]obra=(\d{3})(?:&|$)/.exec(window.location.search || ''); return m ? m[1] : null; })();   // obra sempre explícita: sem ?obra= nenhuma é escolhida sozinha
CC.semObra = function (titulo, onde) {   // tela 'Selecione uma obra' (sem escolher sozinho)
  var d = document.createElement('div'); d.className = 'wrap'; d.id = 'sem-obra';
  d.innerHTML = '<div class="card" style="margin:40px auto;max-width:520px"><h2 style="margin-top:0">Selecione uma obra</h2><p>' + esc(titulo || '') + ' abre sempre numa obra escolhida. Abra pelo Centro de Gestão (a obra marcada lá vale aqui) ou informe a obra:</p>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap"><input id="so-obra" inputmode="numeric" maxlength="3" placeholder="ex.: 342" aria-label="Código da obra (3 dígitos)" style="min-height:44px;padding:0 12px;border:1px solid var(--line2);border-radius:10px;font-size:16px;width:120px">' +
    '<button class="btn pri" id="so-ok" type="button">Abrir</button></div><div class="err" id="so-err" role="alert"></div>' + (onde || '') + '</div>';
  document.body.insertBefore(d, document.body.firstChild);
  var ir = function () { var v = String(document.getElementById('so-obra').value || '').trim(); if (!/^\d{3}$/.test(v)) { document.getElementById('so-err').textContent = 'A obra tem 3 dígitos (ex.: 342).'; return; }
    var q = window.location.search.replace(/[?&]obra=[^&]*/, ''); q = q ? q.replace(/^&/, '?') : ''; window.location.search = (q ? q + '&' : '?') + 'obra=' + v; };
  document.getElementById('so-ok').addEventListener('click', ir);
  document.getElementById('so-obra').addEventListener('keydown', function (e) { if (e.key === 'Enter') ir(); });
  d.querySelectorAll('[data-so]').forEach(function (b) { b.addEventListener('click', function () { document.getElementById('so-obra').value = b.getAttribute('data-so'); ir(); }); });
};
CC.versao = 0;          // última versão vista (taf_ciclo_ler, respostas de salvar)
CC.ator = null;         // {nome, papel, verificado} do último ler
CC.ultimo = null;       // último objeto devolvido por CC.ler

var C = { chave: '', quem: '', obra: CC.OBRA };   // configuração privada (a chave não fica exposta em CC)

// ===================================================================== utilidades
function pad(n) { n = +n; return (n < 10 ? '0' : '') + n; }
var esc = CC.esc = function (s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
};
CC.$ = function (id) { return D.getElementById(id); };
CC.ls = {
  get: function (k) { try { return W.localStorage.getItem(k); } catch (e) { return null; } },
  set: function (k, v) { try { W.localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  del: function (k) { try { W.localStorage.removeItem(k); } catch (e) { /* sem storage */ } }
};
CC.ls.g = CC.ls.get; CC.ls.s = CC.ls.set; CC.ls.d = CC.ls.del;
function jparse(t, padrao) { if (t == null || t === '') return padrao; try { var v = JSON.parse(t); return v == null ? padrao : v; } catch (e) { return padrao; } }
function copia(o) { try { return JSON.parse(JSON.stringify(o == null ? null : o)); } catch (e) { return null; } }
function semAcento(s) {
  s = String(s == null ? '' : s).toLowerCase();
  return s.normalize ? s.normalize('NFD').replace(/[̀-ͯ]/g, '') : s;
}
function curto(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function uniq(a) { var o = []; (a || []).forEach(function (x) { if (x != null && x !== '' && o.indexOf(x) < 0) o.push(x); }); return o; }
CC.curto = curto;

// eventos internos: 'fila' (estado), 'ok' (item, resposta), 'recusa' (item, motivo, erro), 'ler' (ler),
// 'chave' (motivo): a chave caiu (revogada, trocada, sem acesso). A fila fica parada, presa à chave, até CC.init({chave}) de novo.
var EV = {};
CC.ouvir = function (nome, fn) {
  (EV[nome] = EV[nome] || []).push(fn);
  return function () { var a = EV[nome] || [], i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); };
};
function emitir(nome) {
  var args = [].slice.call(arguments, 1);
  (EV[nome] || []).slice().forEach(function (fn) {
    try { fn.apply(null, args); } catch (e) { setTimeout(function () { throw e; }, 0); }
  });
}

// ===================================================================== datas
// Datas 'AAAA-MM-DD' sem fuso (conta em UTC puro). Timestamps: CC.hm / CC.quando / CC.diaSP no fuso de Brasília.
var DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
function partes(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso == null ? '' : iso)); return m ? [+m[1], +m[2], +m[3]] : null; }
function utc(iso) { var p = partes(iso); return p ? Date.UTC(p[0], p[1] - 1, p[2]) : NaN; }
function isoUtc(t) { var d = new Date(t); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
CC.ehData = function (iso) { return /^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) && isoUtc(utc(iso)) === iso; };   // 2026-02-30 não vale
CC.d = function (iso) { var p = partes(iso); return p ? pad(p[2]) + '/' + pad(p[1]) : ''; };
CC.dl = function (iso) { var p = partes(iso); return p ? pad(p[2]) + '/' + pad(p[1]) + '/' + p[0] : ''; };
CC.dow = function (iso) { var t = utc(iso); return isNaN(t) ? '' : DOW[new Date(t).getUTCDay()]; };
CC.dd = function (iso) { return partes(iso) ? CC.dow(iso) + ' ' + CC.d(iso) : ''; };
CC.mais = function (iso, n) { var t = utc(iso); return isNaN(t) ? '' : isoUtc(t + Math.round(+n || 0) * 864e5); };
CC.seg = function (iso) { var t = utc(iso); return isNaN(t) ? '' : isoUtc(t - ((new Date(t).getUTCDay() + 6) % 7) * 864e5); };
CC.dif = function (a, b) { var x = utc(a), y = utc(b); return isNaN(x) || isNaN(y) ? null : Math.round((x - y) / 864e5); };
CC.semana = function (seg) { return partes(seg) ? CC.d(seg) + ' a ' + CC.d(CC.mais(seg, 6)) : ''; };

// timestamp do PostgREST ('2026-10-22T17:37:43.425437+00:00', '... -03', sem fuso = Brasília) -> ms
CC.ts = function (s) {
  if (s == null || s === '') return NaN;
  if (typeof s === 'number') return s;
  if (s instanceof Date) return s.getTime();
  var m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i.exec(String(s).trim());
  if (!m) return Date.parse(s);
  var t = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0), m[7] ? +((m[7] + '00').slice(0, 3)) : 0);
  var z = m[8];
  if (!z) return t + 3 * 36e5;
  if (z.toUpperCase() === 'Z') return t;
  var sg = z.charAt(0) === '-' ? -1 : 1, r = z.slice(1).replace(':', '');
  return t - sg * ((+r.slice(0, 2)) * 60 + (+(r.slice(2, 4) || 0))) * 6e4;
};
var FMT = null;
try {
  FMT = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false });
  if (!FMT.formatToParts) FMT = null;
} catch (e) { FMT = null; }
function sp(ts) {
  var t = CC.ts(ts);
  if (isNaN(t)) return null;
  if (FMT) {
    var o = {};
    FMT.formatToParts(new Date(t)).forEach(function (x) { o[x.type] = x.value; });
    return { iso: o.year + '-' + o.month + '-' + o.day, h: o.hour === '24' ? '00' : o.hour, mi: o.minute };
  }
  var d = new Date(t - 3 * 36e5);   // Brasília sem horário de verão desde 2019
  return { iso: isoUtc(d.getTime()), h: pad(d.getUTCHours()), mi: pad(d.getUTCMinutes()) };
}
CC.hm = function (ts) { var p = sp(ts); return p ? p.h + ':' + p.mi : ''; };
CC.diaSP = function (ts) { var p = sp(ts); return p ? p.iso : ''; };
CC.quando = function (ts) { var p = sp(ts); return p ? CC.dd(p.iso) + ' ' + p.h + ':' + p.mi : ''; };

// relógio do servidor: CC.ler acerta o desvio com o 'agora' devolvido; as telas usam CC.hoje()/CC.agora()
var DESVIO = 0, RELOGIO_OK = false, ULT_SEM_HORA = false;
CC.relogio = function (agora) {
  var t = CC.ts(agora);
  if (!isNaN(t)) { DESVIO = t - Date.now(); RELOGIO_OK = true; if (ULT_SEM_HORA) { ULT_SEM_HORA = false; ULT = CC.agora(); CC.ls.set(EK, ULT); } }
  return DESVIO;
};
CC.relogioOk = function () { return RELOGIO_OK; };
CC.agoraMs = function () { return Date.now() + DESVIO; };
CC.agora = function () { return new Date(CC.agoraMs()).toISOString(); };
CC.hoje = function () { return CC.diaSP(CC.agoraMs()); };

// números e vazios
CC.num = function (v, casas) {
  if (v == null || v === '' || isNaN(+v)) return '';
  return (+v).toLocaleString('pt-BR', { maximumFractionDigits: casas == null ? 2 : casas });
};
CC.ou = function (v, vazio) { return v == null || v === '' ? (vazio || 'não informado') : v; };

// ===================================================================== chamada ao banco
// CC.rpc(fn, body, {timeout}) -> Promise(json). Erro: Error com .message (do PostgREST), .status, .code,
// .details, .hint, .json (true se veio a mensagem do PostgREST) e .rede (true = sem sinal ou tempo esgotado).
function erroRede(tempo) {
  var e = new Error(tempo ? 'SEM RESPOSTA DO SERVIDOR (TEMPO ESGOTADO)' : 'SEM SINAL');
  e.rede = true; e.tempo = !!tempo; e.status = 0; e.code = null; e.json = false;
  return e;
}
CC.rpc = function (fn, body, o) {
  o = o || {};
  var ctl = W.AbortController ? new W.AbortController() : null, tm = null, estourou = false;
  return new Promise(function (ok, falha) {
    if (ctl) tm = setTimeout(function () { estourou = true; ctl.abort(); }, o.timeout || 45000);
    fetch(CC.URL + fn, {
      method: 'POST',
      headers: { apikey: CC.KEY, Authorization: 'Bearer ' + CC.KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}), signal: ctl ? ctl.signal : undefined
    }).then(function (r) {
      return r.text().then(function (t) {
        clearTimeout(tm);
        var j, temJ = true;
        try { j = t ? JSON.parse(t) : null; } catch (e) { temJ = false; }
        if (!r.ok) {
          var msg = temJ && j && typeof j.message === 'string' ? j.message : '';
          var e = new Error(msg || ('ERRO ' + r.status));
          e.status = r.status; e.code = (temJ && j && j.code) || null; e.details = (temJ && j && j.details) || null;
          e.hint = (temJ && j && j.hint) || null; e.json = !!msg; e.rede = false;
          falha(e); return;
        }
        ok(temJ ? j : t);
      }, function () { clearTimeout(tm); falha(erroRede(estourou)); });
    }, function () { clearTimeout(tm); falha(erroRede(estourou)); });
  });
};

// leituras com a chave atual (CC.init): ler, situacao, historico, simular, folga
CC.ler = function (seg) {
  return CC.rpc('taf_ciclo_ler', { p_chave: C.chave, p_obra: C.obra, p_seg: seg || null, p_quem: C.quem || null }).then(function (L) {
    if (L && L.agora) CC.relogio(L.agora);
    if (L && typeof L.versao === 'number') CC.versao = L.versao;
    if (L && L.ator) CC.ator = L.ator;
    CC.ultimo = L;
    emitir('ler', L);
    return L;
  }, function (e) { if (CC.ehChave(e)) chaveCaiu(e); throw e; });
};
CC.situacao = function () { return CC.rpc('taf_ciclo_situacao', { p_chave: C.chave, p_obra: C.obra, p_quem: C.quem || null }); };
CC.historico = function (o) {
  o = o || {};
  return CC.rpc('taf_ciclo_historico', { p_chave: C.chave, p_obra: C.obra, p_tabela: o.tabela || null, p_item: o.item || null,
    p_ativ: o.ativ || null, p_limite: o.limite || 200 });
};
CC.simular = function (ativ, ini, fim, dispensa) {
  return CC.rpc('taf_ciclo_simular', { p_chave: C.chave, p_obra: C.obra, p_ativ: ativ, p_ini: ini || null, p_fim: fim || null,
    p_dispensa: dispensa || [], p_quem: C.quem || null });
};
// leitura no ERP com a mesma chave e o mesmo nome (só funções taf_erp_*; quem usa é ciclo-erp.js)
CC.rpcErp = function (fn, extra, o) {
  if (!/^taf_erp_[a-z_]+$/.test(fn)) return Promise.reject(new Error('FUNCAO DO ERP INVALIDA'));
  return CC.rpc(fn, Object.assign({ p_chave: C.chave, p_obra: C.obra, p_quem: C.quem || null }, extra || {}), o);
};
CC.folga = function (ativ) { return CC.rpc('taf_ciclo_folga', { p_chave: C.chave, p_obra: C.obra, p_ativ: ativ, p_quem: C.quem || null }); };

// ===================================================================== tradução de erro
// CHECK nomeado (frase) -> o nome. CHECK sem nome (gerado pelo Postgres) -> frase curta equivalente.
var AMIGAVEL = {
  taf_ciclo_causa_check: 'CAUSA INVALIDA',
  taf_ciclo_comp_entrega_check: 'ENTREGA PRECISA DE 3 A 300 LETRAS',
  taf_ciclo_comp_resp_check: 'RESPONSAVEL PRECISA DE 2 A 60 LETRAS',
  taf_ciclo_comp_titulo_check: 'TITULO PODE TER ATE 120 LETRAS',
  taf_ciclo_comp_frente_check: 'FRENTE PODE TER ATE 40 LETRAS',
  taf_ciclo_comp_local_check: 'LOCAL PODE TER ATE 60 LETRAS',
  taf_ciclo_comp_qtd_check: 'QUANTIDADE PRECISA SER MAIOR QUE ZERO',
  taf_ciclo_comp_un_check: 'UNIDADE INVALIDA',
  taf_ciclo_comp_entrega_tipo_check: 'TIPO DE ENTREGA INVALIDO',
  taf_ciclo_comp_feito_pct_check: 'PERCENTUAL FEITO PRECISA SER DE 1 A 99',
  taf_ciclo_comp_feito_qtd_check: 'QUANTIDADE FEITA NAO PODE SER NEGATIVA',
  taf_ciclo_comp_falta_check: 'O QUE FALTA PODE TER ATE 300 LETRAS',
  taf_ciclo_comp_causa_det_check: 'DETALHE DA CAUSA PODE TER ATE 40 LETRAS',
  taf_ciclo_comp_causa_txt_check: 'TEXTO DA CAUSA PODE TER ATE 500 LETRAS',
  taf_ciclo_comp_justif_restricao_check: 'JUSTIFICATIVA PODE TER ATE 500 LETRAS',
  taf_ciclo_comp_cancel_motivo_check: 'MOTIVO PODE TER ATE 300 LETRAS',
  taf_ciclo_comp_saldo_motivo_check: 'MOTIVO PODE TER ATE 300 LETRAS',
  taf_ciclo_apont_obs_check: 'NOTA PODE TER ATE 300 LETRAS',
  taf_ciclo_apont_link_check: 'LINK PRECISA COMECAR COM https:// (ATE 300 LETRAS)',
  taf_ciclo_apont_qtd_check: 'QUANTIDADE DO DIA NAO PODE SER NEGATIVA',
  taf_ciclo_apont_causa_det_check: 'DETALHE DA CAUSA PODE TER ATE 40 LETRAS',
  taf_ciclo_apont_check: 'DIA FORA DA SEMANA',
  taf_ciclo_demanda_oque_check: 'O QUE E PRECISO: DE 5 A 300 LETRAS',
  taf_ciclo_demanda_resp_check: 'RESPONSAVEL PRECISA DE 2 A 60 LETRAS',
  taf_ciclo_demanda_contraparte_check: 'CONTRAPARTE PODE TER ATE 80 LETRAS',
  taf_ciclo_demanda_ref_ext_check: 'PROTOCOLO PODE TER ATE 80 LETRAS',
  taf_ciclo_demanda_tarefa_id_check: 'TAREFA DO SITE INVALIDA (USE R05, R103...)',
  taf_ciclo_demanda_resposta_check: 'RESPOSTA PODE TER ATE 1000 LETRAS',
  taf_ciclo_preparo_obs_check: 'OBSERVACAO PODE TER ATE 300 LETRAS',
  taf_ciclo_replan_acao_check: 'ACAO PRECISA DE 3 A 300 LETRAS',
  taf_ciclo_replan_resp_check: 'RESPONSAVEL PRECISA DE 2 A 60 LETRAS',
  taf_ciclo_replan_causa_det_check: 'DETALHE DA CAUSA PODE TER ATE 40 LETRAS',
  taf_ciclo_replan_justif_check: 'JUSTIFICATIVA PODE TER ATE 500 LETRAS',
  taf_ciclo_replan_motivo_txt_check: 'TEXTO DO MOTIVO PODE TER ATE 300 LETRAS',
  taf_ciclo_replan_acordo_obs_check: 'OBSERVACAO PODE TER ATE 500 LETRAS',
  taf_ciclo_replan_check1: 'NOVO TERMINO ANTES DO NOVO INICIO',
  taf_ciclo_fora_txt_check: 'TEXTO PODE TER ATE 300 LETRAS',
  taf_ciclo_semana_nota_check: 'NOTA PODE TER ATE 1000 LETRAS',
  taf_ciclo_ativ_check5: 'TERMINO ANTES DO INICIO',
  taf_ciclo_ativ_check6: 'MARCO: INICIO E TERMINO NO MESMO DIA'
};
function ultimasAspas(s) {
  var b = s.lastIndexOf('"');
  if (b <= 0) return '';
  var a = s.lastIndexOf('"', b - 1);
  return a >= 0 ? s.slice(a + 1, b) : '';
}
CC.erro = function (e) {
  if (e == null) return '';
  if (typeof e === 'string') e = { message: e };
  if (e.recusa && e.motivo) return e.motivo;
  var msg = String(e.message == null ? '' : e.message).replace(/^ERROR:\s*/, ''), code = e.code || '';
  if (e.rede) return msg || 'SEM SINAL';
  if (code === '23514' || /violates check constraint "/.test(msg)) {
    var x = ultimasAspas(msg);
    if (x) return AMIGAVEL[x] || x;
  }
  if (code === '23502') { var col = /column "([^"]+)"/.exec(msg); return 'FALTA PREENCHER: ' + (col ? col[1].replace(/_/g, ' ').toUpperCase() : 'CAMPO OBRIGATORIO'); }
  if (code === '23503') return /ativ/.test(msg) ? 'ATIVIDADE NAO EXISTE' : /demanda/.test(msg) ? 'DEMANDA NAO EXISTE' : 'REFERENCIA NAO EXISTE';
  if (code === '22007' || code === '22008') return 'DATA INVALIDA';
  if (code === '22P02') return /integer|numeric|bigint|smallint/.test(msg) ? 'NUMERO INVALIDO' : 'VALOR INVALIDO';
  return msg || ('ERRO ' + (e.status || ''));
};
CC.mudouDepois = function (motivo) { return /^MUDOU DEPOIS/.test(String(motivo || '')); };

// ===================================================================== permissões (espelho da matriz 5.3)
var PODE = {
  gestor: ['demanda', 'demanda_resp', 'cobrar', 'impacto', 'acordo', 'reabrir', 'simular'],
  engenheiro: ['preparo', 'preparo_ok', 'comp', 'comp_tirar', 'comp_cancelar', 'fora', 'publicar', 'apont', 'apont_lote',
    'apont_apagar', 'real', 'fechar_item', 'fechar_semana', 'replan', 'efeito', 'saldo', 'demanda', 'demanda_resp', 'cobrar', 'impacto', 'simular'],
  diretoria: ['demanda', 'demanda_resp', 'cobrar', 'impacto', 'acordo', 'simular']
};
CC.pode = function (papel, acao) { return (PODE[papel] || []).indexOf(acao) >= 0; };
// diretoria só mexe (responder, nova data, editar, cancelar) nas demandas em que é responsável ou decide
CC.podeDemanda = function (ator, d) {
  ator = ator && ator.ator ? ator.ator : ator;
  if (!ator || !d) return false;
  if (ator.papel === 'engenheiro' || ator.papel === 'gestor') return true;
  if (ator.papel === 'diretoria') return !!ator.nome && (d.resp === ator.nome || (d.decisores || []).indexOf(ator.nome) >= 0);
  return false;
};

// ===================================================================== fila de envio
// Toda escrita: CC.enviar(acao, dados, meta) -> Promise(resposta do servidor). Grava em localStorage 'taf-ciclo-fila'
// (sem a chave: cada item guarda só uma impressão curta da chave, 'dono', para ser enviado pela mesma chave).
var FK = 'taf-ciclo-fila', RK = 'taf-ciclo-recusas', EK = 'taf-ciclo-enviado';
var MEM = [], SO_MEM = false, PEND = {}, ENVIANDO = null, DE_NOVO = false, EMVOO = null, TIMER = null, FALHA = null;
var ULT = CC.ls.get(EK) || null, REC_MEM = null, INIT = false, CBS = {}, CHAVE_RUIM = null;

function fp(s) {      // FNV-1a 32 bits: só para separar os itens de cada chave, não é segredo
  var h = 0x811c9dc5; s = String(s || '');
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return ('0000000' + h.toString(16)).slice(-8);
}
CC.uid = function () {
  try { if (W.crypto && typeof W.crypto.randomUUID === 'function') return W.crypto.randomUUID(); } catch (e) { /* segue */ }
  var b = new Array(16), i;
  try { var u = new Uint8Array(16); W.crypto.getRandomValues(u); for (i = 0; i < 16; i++) b[i] = u[i]; }
  catch (e) { for (i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256); }
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  var h = b.map(function (x) { return (x + 0x100).toString(16).slice(1); }).join('');
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
};
function filaLer() {
  if (SO_MEM) return MEM.slice();
  var t;
  try { t = W.localStorage.getItem(FK); } catch (e) { SO_MEM = true; return MEM.slice(); }
  var a = jparse(t, []);
  if (!Array.isArray(a)) a = [];
  MEM = a;
  return a.slice();
}
function filaGravar(a) {
  MEM = a.slice();
  if (SO_MEM) return;
  try { if (a.length) W.localStorage.setItem(FK, JSON.stringify(a)); else W.localStorage.removeItem(FK); }
  catch (e) { SO_MEM = true; }
}
function meu(it) { return it && it.dono === fp(C.chave) && it.obra === C.obra; }
function tirar(uid) { filaGravar(filaLer().filter(function (x) { return x.uid !== uid; })); }
function offline() { return W.navigator && W.navigator.onLine === false; }

CC.estado = function () {
  var a = filaLer(), meus = a.filter(meu), n = meus.length, txt;
  // a hora só aparece depois que o servidor deu o relógio (nunca a do aparelho)
  if (!n) txt = 'tudo enviado' + (!ULT || !RELOGIO_OK ? '' : CC.diaSP(ULT) === CC.hoje() ? ' ' + CC.hm(ULT) : ' ' + CC.quando(ULT));   // de outro dia: com a data
  else if (CHAVE_RUIM) txt = n + ' aguardando: entre de novo com a chave';
  else if (FALHA || offline()) txt = n + ' aguardando sinal';
  else txt = 'enviando ' + n + '…';
  return { pendentes: n, outros: a.length - n, enviando: !!EMVOO, memoria: SO_MEM, ultimo: ULT,
    erro: FALHA ? FALHA.msg : null, chave: CHAVE_RUIM, texto: txt, itens: meus };
};
function emitirFila() { emitir('fila', CC.estado()); }

CC.enviar = function (acao, dados, meta) {
  meta = meta || {};
  var it = { uid: CC.uid(), acao: String(acao || ''), dados: copia(dados || {}) || {}, meta: copia(meta) || {}, obra: C.obra,
    dono: fp(C.chave), quem: C.quem || null, criado: new Date().toISOString(), tent: 0,
    nao_antes: meta.segurar ? Date.now() + (+meta.segurar || 0) : 0 };
  var res, rej, p = new Promise(function (a, b) { res = a; rej = b; });
  p.catch(function () { /* quem não tratar a recusa recebe pelo onRecusa */ });
  p.uid = it.uid; p.item = it;
  if (!C.chave) { var e = new Error('SEM CHAVE'); e.recusa = true; e.motivo = 'SEM CHAVE: ENTRE DE NOVO'; rej(e); return p; }
  PEND[it.uid] = { res: res, rej: rej, item: it };
  var a = filaLer(); a.push(it); filaGravar(a);
  emitirFila();
  drenar();
  return p;
};
CC.cancelar = function (uid) {
  if (EMVOO === uid) return false;
  var a = filaLer(), n = a.length;
  a = a.filter(function (x) { return x.uid !== uid; });
  var p = PEND[uid];
  if (a.length === n && !p) return false;
  filaGravar(a);
  if (p) { delete PEND[uid]; var e = new Error('CANCELADO'); e.cancelado = true; p.rej(e); }
  emitirFila();
  drenar();
  return true;
};
function proximo() {
  var a = filaLer().filter(meu);
  if (a.length) return a[0];
  for (var u in PEND) if (meu(PEND[u].item)) return PEND[u].item;   // outra aba já tirou: reenvia (volta 'repetido')
  return null;
}
// chave revogada, trocada ou sem acesso à obra: não é recusa do item; o item fica na fila, preso à chave, e a página volta ao gate
CC.ehChave = function (e) {
  var m = CC.erro(e);
  return !!e && !e.rede && /^(CHAVE INVALIDA|SEM ACESSO A OBRA|OBRA INVALIDA)/.test(String(m || ''));
};
function chaveCaiu(e) {
  var m = CC.erro(e);
  if (CHAVE_RUIM) return;
  CHAVE_RUIM = m || 'CHAVE INVALIDA';
  emitirFila();
  emitir('chave', CHAVE_RUIM);
}
function ehRecusa(e) {
  return !!e && !e.rede && e.json && e.status >= 400 && e.status < 500 && [401, 403, 404, 408, 425, 429].indexOf(e.status) < 0;
}
function lerRecusas() { if (REC_MEM) return REC_MEM.slice(); var a = jparse(CC.ls.get(RK), []); return Array.isArray(a) ? a : []; }
function gravarRecusas(a) { a = a.slice(-30); if (!CC.ls.set(RK, JSON.stringify(a))) REC_MEM = a; else REC_MEM = null; }
CC.recusas = function () { return lerRecusas().filter(meu); };
CC.descartarRecusa = function (uid) { gravarRecusas(lerRecusas().filter(function (x) { return x.uid !== uid; })); };

function concluir(it, r) {
  var p = PEND[it.uid];
  delete PEND[it.uid];
  emitir('ok', it, r);
  if (p) p.res(r);
}
function recusar(it, e) {
  var m = CC.erro(e), p = PEND[it.uid];
  delete PEND[it.uid];
  var a = lerRecusas().filter(function (x) { return x.uid !== it.uid; });
  a.push({ uid: it.uid, acao: it.acao, dados: it.dados, meta: it.meta, obra: it.obra, dono: it.dono, motivo: m, em: CC.agora() });
  gravarRecusas(a);
  var er = new Error(m);
  er.recusa = true; er.motivo = m; er.status = e.status; er.code = e.code; er.item = it;
  emitir('recusa', it, m, e);
  if (p) p.rej(er);
}
function passo() {
  var it = proximo();
  if (!it) return Promise.resolve();
  var falta = (it.nao_antes || 0) - Date.now();
  if (falta > 0) { clearTimeout(TIMER); TIMER = setTimeout(drenar, falta + 30); return Promise.resolve(); }
  EMVOO = it.uid;
  emitirFila();
  return CC.rpc('taf_ciclo_salvar', { p_chave: C.chave, p_obra: it.obra, p_acao: it.acao, p_dados: it.dados, p_uid: it.uid,
    p_quem: it.quem || C.quem || null }, { timeout: 20000 }).then(function (r) {
    tirar(it.uid); FALHA = null; EMVOO = null;
    if (RELOGIO_OK) { ULT = CC.agora(); CC.ls.set(EK, ULT); } else { ULT = null; ULT_SEM_HORA = true; }
    if (r && typeof r.versao === 'number' && r.versao > CC.versao) CC.versao = r.versao;
    emitirFila();          // o cabeçalho já mostra o novo estado quando a promessa resolve
    concluir(it, r);
    return passo();
  }, function (e) {
    EMVOO = null;
    if (CC.ehChave(e)) { FALHA = { em: Date.now(), msg: CC.erro(e), status: e.status, chave: true }; chaveCaiu(e); return undefined; }
    if (ehRecusa(e)) { tirar(it.uid); FALHA = null; emitirFila(); recusar(it, e); return passo(); }
    FALHA = { em: Date.now(), msg: CC.erro(e), status: e.status };      // sem sinal ou servidor fora: fica na fila
    var a = filaLer();
    a.forEach(function (x) { if (x.uid === it.uid) { x.tent = (x.tent || 0) + 1; x.ultimo_erro = FALHA.msg; } });
    filaGravar(a);
    return undefined;
  });
}
// um envio por vez; um pedido que chega durante uma rodada (item novo, 'online', intervalo) faz mais uma rodada no fim
function drenar() {
  if (!C.chave || CHAVE_RUIM) return Promise.resolve();
  if (ENVIANDO) { DE_NOVO = true; var r = ENVIANDO; return r.then(function () { return ENVIANDO && ENVIANDO !== r ? ENVIANDO : undefined; }); }
  DE_NOVO = false;
  function fim() { ENVIANDO = null; EMVOO = null; emitirFila(); if (DE_NOVO) { DE_NOVO = false; drenar(); } }
  ENVIANDO = passo().then(fim, fim);
  return ENVIANDO;
}
CC.fila = {
  itens: function () { return filaLer().filter(meu); },
  todos: function () { return filaLer(); },
  estado: CC.estado,
  tentar: function () { return drenar(); },
  cancelar: CC.cancelar
};

// CC.init({chave, quem, obra:'342', onFila(estado), onRecusa(item, motivo, erro), onOk(item, resposta), onChave(motivo)})
CC.init = function (o) {
  o = o || {};
  if ('chave' in o) { C.chave = o.chave || ''; CHAVE_RUIM = null; FALHA = null; }
  if ('quem' in o) C.quem = o.quem || '';
  if (o.obra) { C.obra = String(o.obra); CC.OBRA = C.obra; }
  [['onFila', 'fila'], ['onRecusa', 'recusa'], ['onOk', 'ok'], ['onChave', 'chave']].forEach(function (k) {
    if (!(k[0] in o)) return;
    if (CBS[k[0]]) { CBS[k[0]](); delete CBS[k[0]]; }
    if (typeof o[k[0]] === 'function') CBS[k[0]] = CC.ouvir(k[1], o[k[0]]);
  });
  CC.estilo();
  if (!INIT) {
    INIT = true;
    setInterval(function () { if (filaLer().some(meu)) drenar(); }, 15000);
    W.addEventListener('online', function () { drenar(); });
    D.addEventListener('visibilitychange', function () { if (D.visibilityState === 'visible') drenar(); });
    W.addEventListener('storage', function (e) { if (e.key === FK) emitirFila(); });
  }
  emitirFila();
  drenar();
  return CC;
};

// ===================================================================== polling de versão
// CC.vigiar(onMudou, digitando, ms=30000): com a aba visível chama taf_ciclo_versao; se mudou, ninguém está digitando
// e a fila deste aparelho está vazia, chama onMudou(versao). onMudou deve reler com CC.ler (que acerta CC.versao).
var VIG = null;
CC.vigiar = function (onMudou, digitando, ms) {
  if (VIG) VIG();
  var parado = false, ocupado = false, avisado = null, avisadoEm = 0;
  function checar() {
    if (parado || ocupado || !C.chave) return;
    if (D.visibilityState && D.visibilityState !== 'visible') return;
    if (filaLer().some(meu)) return;
    ocupado = true;
    CC.rpc('taf_ciclo_versao', { p_chave: C.chave, p_obra: C.obra }, { timeout: 15000 }).then(function (v) {
      ocupado = false;
      v = +v;
      if (isNaN(v) || v === CC.versao) return;
      if (v === avisado && Date.now() - avisadoEm < 3 * (ms || 30000)) return;   // já avisou: esperando o reler
      if (typeof digitando === 'function' && digitando()) return;
      avisado = v; avisadoEm = Date.now();
      if (typeof onMudou === 'function') onMudou(v);
    }, function (e) { ocupado = false; if (CC.ehChave(e)) chaveCaiu(e); });
  }
  var t = setInterval(checar, ms || 30000);
  function vis() { if (D.visibilityState === 'visible') checar(); }
  D.addEventListener('visibilitychange', vis);
  VIG = function () { parado = true; clearInterval(t); D.removeEventListener('visibilitychange', vis); VIG = null; };
  VIG.checar = checar;
  return VIG;
};
// true se o foco está num campo de texto (dentro de root, se informado)
CC.digitando = function (root) {
  var a = D.activeElement;
  if (!a || a === D.body) return false;
  if (root && !root.contains(a)) return false;
  return /^(INPUT|TEXTAREA)$/.test(a.tagName) || !!a.isContentEditable;
};

// ===================================================================== listas fixas (espec 7)
CC.CAUSAS = [
  { v: 'MÃO DE OBRA', r: 'Mão de obra', tipo: 'interna', det: ['faltou gente', 'equipe não contratada', 'produtividade abaixo', 'segurança (integração, ASO, EPI)', 'pagamento não liberado'] },
  { v: 'PLANEJAMENTO', r: 'Planejamento', tipo: 'interna', det: ['meta mal dimensionada', 'serviço anterior não terminou', 'restrição não prevista', 'mudança de prioridade', 'compromisso cancelado'] },
  { v: 'MATERIAL', r: 'Material', tipo: 'interna', det: ['não pedido', 'fornecedor atrasou', 'pagamento não liberado', 'material errado'] },
  { v: 'EQUIPAMENTO', r: 'Equipamento', tipo: 'interna', det: ['não contratado', 'quebrou', 'locador atrasou', 'pagamento não liberado'] },
  { v: 'PROJETO', r: 'Projeto', tipo: 'interna', det: ['projeto faltando', 'projeto com erro', 'definição técnica pendente'] },
  { v: 'CLIENTE / FISCAL', r: 'Cliente / fiscal', tipo: 'externa', det: ['liberação do cliente', 'fiscalização', 'concessionária', 'ligação provisória', 'documento não aprovado'] },
  { v: 'CHUVA', r: 'Chuva', tipo: 'externa só se acima do normal', det: ['acima do normal (no diário)', 'dentro do normal'] },
  { v: 'OUTRO', r: 'Outro', tipo: 'interna', det: [], txt: true }
];
CC.causa = function (v) { for (var i = 0; i < CC.CAUSAS.length; i++) if (CC.CAUSAS[i].v === v) return CC.CAUSAS[i]; return null; };
CC.ITENS = [
  { v: 'material', r: 'Material' }, { v: 'equipe', r: 'Equipe' }, { v: 'equipamento', r: 'Equipamento' },
  { v: 'projeto', r: 'Projeto' }, { v: 'liberacao', r: 'Liberação da frente', dica: 'cliente, fiscalização, SST, documentos' }
];
CC.ESTADO_ITEM = [{ v: 'ok', r: 'OK' }, { v: 'pendente', r: 'Pendente' }, { v: 'na', r: 'Não se aplica' }];
CC.AREAS = [
  { v: 'TECNICA', r: 'Técnica', rotulo: 'Técnica: projeto, ART, traçado, topografia' },
  { v: 'OPERACIONAL', r: 'Operacional', rotulo: 'Operacional: equipe, equipamento, frente' },
  { v: 'SUPRIMENTOS', r: 'Suprimentos', rotulo: 'Suprimentos: compra e entrega de material' },
  { v: 'ADMINISTRATIVA', r: 'Administrativa', rotulo: 'Administrativa: pessoal, SST, documentos, ligações' },
  { v: 'FINANCEIRA', r: 'Financeira', rotulo: 'Financeira: pagamento, adiantamento' },
  { v: 'ECONOMICA', r: 'Econômica', rotulo: 'Econômica: medição, BM, aditivo, preço' },
  { v: 'DIRETORIA', r: 'Diretoria', rotulo: 'Diretoria: decisão da empresa' },
  { v: 'CLIENTE', r: 'Cliente / fiscal', rotulo: 'Cliente / fiscal: SANEAGO' }
];
CC.UNIDADES = ['m', 'm²', 'm³', 'un', 'kg', 't', 'trecho', 'evento', 'vb'];
CC.UNIDADES_ANDAMENTO = ['trecho', 'evento'];   // lembrete: "o metro do dia é andamento; conta o que fechou"
CC.ENTREGA_TIPOS = [{ v: 'concluir', r: 'Concluir' }, { v: 'etapa', r: 'Etapa' }, { v: 'qtd', r: 'Quantidade' }];
CC.NAO_ENTRA = [
  { v: 'NAO_COMECA', r: 'Não começa nesta semana' }, { v: 'TRAVADA', r: 'Travada por restrição' },
  { v: 'OUTRA_PRIORIDADE', r: 'Outra prioridade' }, { v: 'JA_TERMINOU', r: 'Já terminou' },
  { v: 'OUTRO', r: 'Outro motivo', txt: true }
];
CC.ACOES_REPLAN = ['Continua', 'Reforçar equipe', 'Cobrar fornecedor', 'Cobrar cliente', 'Trocar sequência', 'Outra'];
CC.FRENTES_AVULSO = ['ADM', 'BM', 'APONT'];
CC.CANAIS = [{ v: 'whatsapp', r: 'WhatsApp' }, { v: 'email', r: 'E-mail' }];
function mapa(l) { var o = {}; l.forEach(function (x) { o[x.v] = x.r; }); return o; }
CC.ROT = {
  situacao: { andou: 'Andou', parado: 'Parado', entregue: 'Entregue', '': 'sem apontamento' },
  resultado: { cumprido: 'Cumprido', parcial: 'Parcial', nao: 'Não cumprido', '': 'não fechado' },
  entrega_tipo: mapa(CC.ENTREGA_TIPOS),
  semana: { nova: 'NOVA', rascunho: 'RASCUNHO', publicada: 'PUBLICADA', fechada: 'FECHADA', '': 'não fechada' },
  status_pub: { NO_PRAZO: 'NO PRAZO', ATRASADA: 'ATRASADA', FORA_DO_PRAZO: 'SEM PROGRAMAÇÃO' },
  cobertura: { COMPLETA: 'COMPLETA', INCOMPLETA: 'INCOMPLETA', 'MUITO INCOMPLETA': 'MUITO INCOMPLETA' },
  demanda: { aberta: 'Aberta', respondida: 'Respondida', resolvida: 'Resolvida', cancelada: 'Cancelada' },
  alerta: { VENCIDA: 'VENCIDA', 'ESTA SEMANA': 'ESTA SEMANA', 'PRÓXIMAS 6 SEMANAS': 'PRÓXIMAS 6 SEMANAS', 'NO PRAZO': 'NO PRAZO', 'SEM DONO (setor)': 'SEM DONO (setor)' },
  origem_demanda: { preparo: 'da preparação', apontamento: 'do apontamento', fechamento: 'do fechamento', replan: 'do replanejamento', manual: 'aberta à mão', segunda: 'da reunião de segunda' },
  origem_replan: { fechamento: 'do fechamento', data_real: 'da data real', preparo: 'da preparação', manual: 'manual', revisao: 'revisão pedida no de acordo' },
  decisao: { pendente: 'Decidir depois', sem_efeito: 'Sem efeito', tudo: 'Aceitou tudo', so_esta: 'Só esta atividade' },
  acordo: { pendente: 'De acordo pendente', ok: 'De acordo', revisar: 'Pediu revisão' },
  papel: { engenheiro: 'engenheiro', gestor: 'gestor', diretoria: 'diretoria', leitura: 'só leitura' },
  tipo_ativ: { ativ: 'atividade', continua: 'contínua', marco: 'marco', evento: 'EVENTO', evento_pct: 'EVENTO %' },
  cal: { CORRIDOS: 'dias corridos', UTEIS: 'd.u.' },
  luz: { VERDE: 'VERDE', AMARELO: 'AMARELO', VERMELHO: 'VERMELHO', 'SEM BASE': 'SEM BASE' },
  saldo: { aceito: 'aceito', descartado: 'descartado', '': 'a decidir' },
  item: mapa(CC.ITENS),
  item_estado: { ok: 'OK', pendente: 'Pendente', na: 'Não se aplica', '': 'não conferido' },
  nao_entra: mapa(CC.NAO_ENTRA),
  canal: mapa(CC.CANAIS),
  causa: mapa(CC.CAUSAS),
  area: mapa(CC.AREAS)
};
CC.COR = {
  alerta: { VENCIDA: 'ne', 'ESTA SEMANA': 'pe', 'PRÓXIMAS 6 SEMANAS': 'cf', 'NO PRAZO': 'ok', 'SEM DONO (setor)': 'ne' },
  luz: { VERDE: 'ok', AMARELO: 'cf', VERMELHO: 'ne', 'SEM BASE': 'mu' },
  status_pub: { NO_PRAZO: 'ok', ATRASADA: 'cf', FORA_DO_PRAZO: 'ne' },
  cobertura: { COMPLETA: 'ok', INCOMPLETA: 'cf', 'MUITO INCOMPLETA': 'ne' },
  resultado: { cumprido: 'ok', parcial: 'cf', nao: 'ne' },
  situacao: { andou: 'ok', parado: 'ne', entregue: 'ac' },
  semana: { nova: 'mu', rascunho: 'cf', publicada: 'ac', fechada: 'ok' },
  demanda: { aberta: 'pe', respondida: 'ac', resolvida: 'ok', cancelada: 'mu' },
  acordo: { pendente: 'cf', ok: 'ok', revisar: 'ne' },
  item_estado: { ok: 'ok', pendente: 'ne', na: 'mu', '': 'mu' }
};
// nome simples das 22 ações (linha do tempo e Mudanças): nunca mostrar o código interno
var ACAO_TXT = { preparo: 'conferiu a preparação', preparo_ok: 'preparação: tudo OK', comp: 'compromisso', comp_tirar: 'tirou do rascunho',
  comp_cancelar: 'cancelou', fora: 'não entra', publicar: 'publicou', apont: 'apontou', apont_lote: 'apontou em lote', apont_apagar: 'apagou apontamento',
  real: 'data real', fechar_item: 'fechou', fechar_semana: 'fechou a semana', replan: 'replanejou', efeito: 'decidiu o efeito', saldo: 'decidiu o saldo',
  demanda: 'demanda', demanda_resp: 'respondeu', cobrar: 'cobrou', impacto: 'recalculou o impacto', acordo: 'de acordo', reabrir: 'reabriu',
  CARGA: 'carga inicial' };
CC.acaoTxt = function (a) { return ACAO_TXT[a] || String(a == null ? '' : a).replace(/_/g, ' '); };
// quem gravou, para mostrar: a carga do sistema não é uma pessoa
CC.quemTxt = function (r) { return !r ? '' : r.papel === 'carga' || r.acao === 'CARGA' ? 'Carga inicial do sistema' : (r.quem || ''); };
CC.rot = function (grupo, v, vazio) {
  var g = CC.ROT[grupo] || {};
  if (v == null || v === '') return g[''] || vazio || 'não informado';
  return g[v] != null ? g[v] : String(v);
};

// ===================================================================== interface
CC.selo = function (txt, cor) { return '<span class="cc-selo cc-' + esc(cor || 'mu') + '">' + esc(txt) + '</span>'; };
CC.seloDe = function (grupo, v) { return CC.selo(CC.rot(grupo, v), ((CC.COR[grupo] || {})[v == null ? '' : v]) || 'mu'); };
// CC.chips(opcoes, selecionado, atributo, {rotulo, solto}) -> HTML de botões com aria-pressed (>= 44 px).
// opcoes: ['a','b'] ou [{v, r, sub, title, dis, cls}]; selecionado: valor ou lista (várias escolhas);
// atributo: 'causa' vira data-causa="valor".
CC.chips = function (opcoes, sel, attr, o) {
  o = o || {};
  attr = String(attr || 'v');
  if (attr.indexOf('data-') !== 0) attr = 'data-' + attr;
  var multi = Array.isArray(sel);
  var h = (opcoes || []).map(function (op) {
    if (op == null) return '';
    var ob = typeof op === 'object', v = ob ? op.v : op, r = ob ? (op.r != null ? op.r : op.v) : op;
    var on = multi ? sel.indexOf(v) >= 0 : (sel != null && sel !== '' && String(sel) === String(v));
    return '<button type="button" class="cc-chip' + (ob && op.cls ? ' ' + esc(op.cls) : '') + '" ' + attr + '="' + esc(v) +
      '" aria-pressed="' + (on ? 'true' : 'false') + '"' + (ob && op.dis ? ' disabled' : '') +
      (ob && op.title ? ' title="' + esc(op.title) + '"' : '') + '>' + esc(r) +
      (ob && op.sub ? ' <small>' + esc(op.sub) + '</small>' : '') + '</button>';
  }).join('');
  if (o.solto) return h;
  return '<div class="cc-chips" role="group"' + (o.rotulo ? ' aria-label="' + esc(o.rotulo) + '"' : '') + '>' + h + '</div>';
};
// marca um chip no lugar (sem redesenhar): único no grupo, ou alterna (multi)
CC.chipMarcar = function (btn, multi) {
  if (!btn) return;
  if (multi) { btn.setAttribute('aria-pressed', btn.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); return; }
  var g = btn.parentNode;
  [].forEach.call(g.children, function (b) { if (b.classList && b.classList.contains('cc-chip')) b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
};
CC.chipsCausa = function (sel, attr) { return CC.chips(CC.CAUSAS, sel, attr || 'causa', { rotulo: 'Causa' }); };
CC.chipsDetalhe = function (causa, sel, attr) {
  var c = CC.causa(causa);
  return c && c.det.length ? CC.chips(c.det, sel, attr || 'det', { rotulo: 'Detalhe da causa' }) : '';
};
CC.htmlRecusa = function (motivo, uid, o) {
  o = o || {};
  return '<div class="cc-recusa" role="alert"><div><b>Não salvou:</b> ' + esc(motivo) + '</div>' +
    (o.extra ? '<div class="cc-lin">' + esc(o.extra) + '</div>' : '') +
    '<div class="cc-acts">' + (o.semCorrigir ? '' : '<button type="button" class="cc-btn" data-cc-a="corrigir" data-uid="' + esc(uid) + '">Corrigir</button>') +
    '<button type="button" class="cc-btn" data-cc-a="descartar" data-uid="' + esc(uid) + '">Descartar</button></div></div>';
};
var TT = null;
CC.toast = function (msg, ms) {
  var t = D.getElementById('cc-toast');
  if (!t) { t = D.createElement('div'); t.id = 'cc-toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite'); D.body.appendChild(t); }
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(TT);
  TT = setTimeout(function () { t.hidden = true; }, ms || 2800);
};
// CC.copiar(texto ou Promise de texto) -> Promise(true se copiou). Tenta a API nova (com Promise, para o Safari),
// depois writeText e por fim o execCommand. Se der false, mostre o texto na tela com um botão Copiar.
CC.copiar = function (x) {
  var P = Promise.resolve(x).then(function (t) { return String(t == null ? '' : t); });
  var cb = W.navigator && W.navigator.clipboard;
  function viaTexto(t) {
    var ok = false, foco = D.activeElement, ta = D.createElement('textarea');
    ta.value = t; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
    D.body.appendChild(ta); ta.select();
    try { ta.setSelectionRange(0, t.length); } catch (e) { /* ok */ }
    try { ok = D.execCommand('copy'); } catch (e) { ok = false; }
    D.body.removeChild(ta);
    if (foco && foco.focus) { try { foco.focus({ preventScroll: true }); } catch (e) { /* ok */ } }
    return ok;
  }
  function viaApi(t) {
    if (!cb || !cb.writeText) return Promise.resolve(viaTexto(t));
    return cb.writeText(t).then(function () { return true; }, function () { return viaTexto(t); });
  }
  if (typeof x !== 'string' && cb && cb.write && W.ClipboardItem) {
    var tent;
    try {
      var B = P.then(function (t) { return new Blob([t], { type: 'text/plain' }); });
      B.catch(function () { /* tratado abaixo; evita 'unhandled rejection' se o navegador nem chegar a ler */ });
      tent = cb.write([new W.ClipboardItem({ 'text/plain': B })]);
    } catch (e) { tent = Promise.reject(e); }
    return tent.then(function () { return true; }, function () { return P.then(viaApi); }).catch(function () { return false; });
  }
  return P.then(viaApi).catch(function () { return false; });
};

// CSS mínimo comum (prefixo cc-). Usa as variáveis de cor da página (--panel, --ac, --ne...), com padrão.
CC.CSS = [
  '.cc-chips{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0;min-width:0}',
  '.cc-chip{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:8px 14px;border:1px solid var(--line2,rgba(15,23,42,.14));border-radius:22px;background:var(--panel,#fff);color:var(--tx,#1B2433);font:inherit;font-size:14px;line-height:1.25;cursor:pointer;text-align:left;max-width:100%;overflow-wrap:anywhere;-webkit-tap-highlight-color:transparent}',
  '.cc-chip:hover{border-color:var(--ac,#0F766E)}',
  '.cc-chip[aria-pressed="true"]{background:var(--ac,#0F766E);border-color:var(--ac,#0F766E);color:var(--bg,#fff);font-weight:600}',
  '.cc-chip[disabled]{opacity:.45;cursor:default}',
  '.cc-chip small{font-size:12px;opacity:.85;font-weight:400}',
  '.cc-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:8px 14px;border:1px solid var(--line2,rgba(15,23,42,.14));border-radius:10px;background:var(--panel,#fff);color:var(--tx,#1B2433);font:inherit;font-size:14px;line-height:1.2;cursor:pointer;text-align:center;max-width:100%}',
  '.cc-btn:hover{border-color:var(--line,rgba(15,118,110,.28));background:var(--hover,#E7ECF3)}',
  '.cc-btn.cc-pri{border-color:var(--ac,#0F766E);color:var(--ac,#0F766E);font-weight:600}',
  '.cc-btn.cc-cheio{background:var(--ac,#0F766E);border-color:var(--ac,#0F766E);color:var(--bg,#fff);font-weight:600}',
  '.cc-btn.cc-perigo{border-color:var(--ne,#B91C1C);color:var(--ne,#B91C1C)}',
  '.cc-btn.cc-on{border-color:var(--ac,#0F766E);background:var(--acbg,rgba(15,118,110,.10))}',
  '.cc-btn[disabled]{opacity:.45;cursor:default}',
  '.cc-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}',
  '.cc-card{background:var(--panel,#fff);border:1px solid var(--line2,rgba(15,23,42,.10));border-radius:var(--r,12px);padding:12px 14px;margin:0 0 12px;overflow-wrap:anywhere;min-width:0}',
  '.cc-recusa{border:1px solid var(--ne,#B91C1C);background:rgba(185,28,28,.07);color:var(--ne,#B91C1C);border-radius:10px;padding:10px 12px;margin-top:10px}',
  '.cc-recusa b{color:var(--ne,#B91C1C)}',
  '.cc-recusa .cc-btn{border-color:var(--ne,#B91C1C);color:var(--ne,#B91C1C)}',
  '.cc-card.cc-vermelho{border-color:var(--ne,#B91C1C)}',
  '.cc-pend{color:var(--mu,#4B5563);font-size:13px;margin-top:8px;padding:8px 10px;border:1px dashed var(--line2,rgba(15,23,42,.18));border-radius:8px}',
  '.cc-selo{display:inline-block;font-size:11.5px;font-weight:600;line-height:1.35;padding:2px 8px;border-radius:999px;border:1px solid currentColor;white-space:nowrap;vertical-align:middle;letter-spacing:.02em}',
  '.cc-selo.cc-ne{color:var(--ne,#B91C1C)}.cc-selo.cc-ok{color:var(--ok,#15803D)}.cc-selo.cc-pe{color:var(--pe,#C2410C)}',
  '.cc-selo.cc-cf{color:var(--cf,#B45309)}.cc-selo.cc-mu{color:var(--mu2,#6B7280)}.cc-selo.cc-ac{color:var(--ac,#0F766E)}',
  '.cc-cinza{font-size:12px;color:var(--mu2,#6B7280)}',
  '.cc-mu{color:var(--mu,#4B5563)}',
  '.cc-lin{margin-top:5px;font-size:14px;line-height:1.45}',
  '.cc-aviso{margin-top:8px;padding:8px 10px;border-radius:8px;background:rgba(180,83,9,.09);color:var(--cf,#B45309);font-size:13px}',
  '.cc-form{display:grid;gap:12px;margin-top:12px;padding-top:12px;border-top:1px dashed var(--line2,rgba(15,23,42,.18));min-width:0}',
  '.cc-form>div{min-width:0}',
  '.cc-rot{display:block;font-size:13px;font-weight:600;color:var(--hd,#0F172A);margin:0 0 4px}',
  '.cc-form input[type=text],.cc-form input[type=search],.cc-form input[type=date],.cc-form input[type=number],.cc-form textarea,.cc-campo{display:block;width:100%;max-width:100%;min-height:44px;padding:10px 12px;border:1px solid var(--line2,rgba(15,23,42,.14));border-radius:8px;background:var(--raised,#EEF1F6);color:var(--tx,#1B2433);font:inherit;font-size:16px;line-height:1.35;box-sizing:border-box}',
  '.cc-form textarea{min-height:76px;resize:vertical}',
  '.cc-erro{color:var(--ne,#B91C1C);font-size:13.5px;font-weight:500}',
  '.cc-erro:empty{display:none}',
  '.cc-conta{font-size:12px;color:var(--mu2,#6B7280);text-align:right;margin-top:2px}',
  '.cc-cab{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px}',
  '.cc-tit{font:600 16px var(--f-hd,inherit);color:var(--hd,#0F172A)}',
  '.cc-dem-topo{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:12px}',
  '.cc-dem-topo .cc-chips{flex:1 1 260px}',
  '.cc-dem-nova:not(:empty){margin:0 0 16px;padding-bottom:12px;border-bottom:1px dashed var(--line2,rgba(15,23,42,.18))}',
  '.cc-dem-n{font:700 15px var(--f-hd,inherit);color:var(--hd,#0F172A)}',
  '.cc-dem-oque{font-weight:600;color:var(--hd,#0F172A);font-size:15px;margin-top:4px}',
  '.cc-dem-grupo{font:600 14px var(--f-hd,inherit);color:var(--hd,#0F172A);margin:18px 0 8px}',
  '.cc-dem-pend{border-style:dashed}',
  '.cc-vazio{color:var(--mu,#4B5563);padding:12px 2px}',
  '.cc-cob{margin-top:10px}',
  '.cc-cob textarea{display:block;width:100%;min-height:96px;padding:10px 12px;border:1px solid var(--line2,rgba(15,23,42,.14));border-radius:8px;background:var(--raised,#EEF1F6);color:var(--tx,#1B2433);font:inherit;font-size:16px;box-sizing:border-box}',
  '#cc-toast{position:fixed;left:50%;bottom:calc(18px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:var(--hd,#0F172A);color:var(--bg,#fff);padding:10px 14px;border-radius:10px;font-size:14px;z-index:300;max-width:calc(100vw - 32px);box-shadow:0 4px 16px rgba(0,0,0,.18)}',
  '@media (max-width:640px){#cc-toast{bottom:calc(84px + env(safe-area-inset-bottom,0px))}}'
].join('\n');
CC.estilo = function () {
  if (!D.head || D.getElementById('cc-css')) return;
  var s = D.createElement('style');
  s.id = 'cc-css';
  s.textContent = CC.CSS;
  D.head.insertBefore(s, D.head.firstChild);   // antes do CSS da página: a página pode sobrescrever
};

// ===================================================================== demandas (espec 3.7), nas duas páginas
var DM = CC.demandas = {};
var S = null;
var FILTROS = [{ v: 'abertas', r: 'Abertas' }, { v: 'vencidas', r: 'Vencidas' }, { v: 'minhas', r: 'Minhas' }, { v: 'area', r: 'Por área' }, { v: 'todas', r: 'Todas' }];
var FILTRO_KEY = 'taf-ciclo-dem-filtro';
var ROT_FORM = { resp: 'resposta', data: 'nova data', editar: 'edição', cancelar: 'cancelamento', reabrir: 'reabertura', cobrar: 'cobrança', impacto: 'cálculo do impacto' };
var RX_TAREFA = /^(R\d{1,4}|N\d{1,15})$/;
var FORM_CORRIGE = { resp: 1, data: 1, editar: 1, cancelar: 1, reabrir: 1 };

function aberta(d) { return d && (d.situacao === 'aberta' || d.situacao === 'respondida'); }
function ehSetor(L, n) { return ((L && L.obra && L.obra.setores) || []).indexOf(n) >= 0; }
function areaDe(L, a) { var l = (L && L.areas) || []; for (var i = 0; i < l.length; i++) if (l[i].area === a) return l[i]; return null; }
function areaCurta(L, a) {
  var ar = areaDe(L, a);
  if (ar && ar.rotulo) return ar.rotulo.split(':')[0];
  return CC.rot('area', a);
}
function nomeAtiv(L, t) {
  var c = (L && L.crono) || [];
  if (!L.__nomes) { L.__nomes = {}; c.forEach(function (x) { L.__nomes[x.id] = x; }); }
  var x = L.__nomes[t];
  return x ? x.nome : '';
}
function ativDe(L, t) { nomeAtiv(L, t); return L.__nomes[t] || null; }
// pessoas para os chips: equipe da obra + donos das áreas (+ extras), na ordem
DM.pessoas = function (L, extras) {
  var o = (L && L.obra) || {}, l = [];
  function add(n) { if (n && l.indexOf(n) < 0) l.push(n); }
  (o.equipe || []).forEach(add);
  ((L && L.areas) || []).forEach(function (a) { add(a.dono); });
  add(o.engenheiro);
  (extras || []).forEach(add);
  return l;
};
function dias(n) {
  if (n == null) return '';
  if (n > 1) return 'faltam ' + n + ' dias';
  if (n === 1) return 'falta 1 dia';
  if (n === 0) return 'vence hoje';
  if (n === -1) return 'venceu ontem';
  return 'venceu há ' + (-n) + ' dias';
}
function vezTxt(n) { return n + (n === 1 ? ' vez' : ' vezes'); }
function evRot(e) { return e.ev ? 'EVENTO ' + e.ev + ' (' + e.id + ')' : 'Marco ' + e.id; }
// texto do impacto gravado na demanda: {linhas:[...], quando}
DM.textoImpacto = function (imp) {
  if (!imp || typeof imp !== 'object') return null;
  var lin = [], ef = imp.efetivo, it = imp.itens || [];
  var np = imp.no_prazo, m7 = imp.mais_7, cen = imp.cenario;
  if (!it.length) lin.push('Não trava atividade que ainda não começou.');
  else {
    var p = it.map(function (x) {
      return x.d > 0 ? x.ativ + ' começa ' + CC.d(x.ini_se_resolver) + ' (+' + x.d + ')' : x.ativ + ' começa ' + CC.d(x.ini_vig) + ' (sem atraso)';
    });
    var evs = ((np && np.eventos) || []).slice(0, 3).map(function (e) {
      return evRot(e) + ' vai para ' + CC.d(e.para) + ' (+' + e.d + ')' + (e.bm_de && e.bm_para && e.bm_de !== e.bm_para ? ', BM ' + e.bm_de + ' → ' + e.bm_para : '');
    });
    var resto = ((np && np.eventos) || []).length - evs.length;
    lin.push('Se resolver em ' + CC.d(ef) + ': ' + p.concat(evs).join('; ') + (resto > 0 ? '; mais ' + resto : '') + '.');
    if (m7 && m7.n > 0) {
      var e7 = (m7.eventos || []).slice(0, 3).map(function (e) { return evRot(e) + ' +' + e.d; });
      lin.push('Se atrasar 7 dias: ' + (e7.length ? e7.join(', ') : m7.n + ' atividade(s) mudam, nenhum EVENTO') + '.');
    } else lin.push('Se atrasar 7 dias: nada muda.');
  }
  if (cen && cen.efeito) {
    var ce = (cen.efeito.eventos || []).slice(0, 2).map(function (e) { return evRot(e) + ' +' + e.d; });
    lin.push('Cenário' + (cen.fonte ? ' ' + cen.fonte : '') + ': ' + (cen.ativ || '') + (cen.fim ? ' até ' + CC.d(cen.fim) : cen.ini ? ' começa ' + CC.d(cen.ini) : '') +
      ' → ' + (ce.length ? ce.join(', ') : 'nenhum EVENTO muda') + '.');
  }
  return { linhas: lin, quando: imp.calculado_em ? 'calculado ' + CC.quando(imp.calculado_em) : '' };
};
// recalcula efetivo, dias, alerta e vencida_7 como o SQL (_taf_ciclo_alerta)
DM.recalcular = function (L, d) {
  var hoje = CC.hoje() || (L && L.hoje);
  d.efetivo = d.nova_data || d.prazo;
  d.dias = CC.dif(d.efetivo, hoje);
  var ab = aberta(d);
  d.alerta = !ab ? null : ehSetor(L, d.resp) ? 'SEM DONO (setor)' : d.dias < 0 ? 'VENCIDA' : d.dias <= 7 ? 'ESTA SEMANA' : d.dias <= 42 ? 'PRÓXIMAS 6 SEMANAS' : 'NO PRAZO';
  d.vencida_7 = ab && d.dias < -7;
  return d;
};
function sextaPadrao() {
  var h = CC.hoje(), s = CC.mais(CC.seg(h), 4);
  return s < h ? CC.mais(s, 7) : s;
}

// ---------- pedaços de formulário compartilhados (responsável, decisores, atividades)
function respHtml(L, st, extras) {
  var ps = DM.pessoas(L, extras), on = st.outro ? '' : st.resp;
  var ops = ps.map(function (n) { return { v: n, r: n, sub: ehSetor(L, n) ? 'setor' : '' }; });
  return '<div><span class="cc-rot">Responsável</span>' +
    '<div class="cc-chips" role="group" aria-label="Responsável">' + CC.chips(ops, on, 'campo-v', { solto: true }).replace(/data-campo-v=/g, 'data-campo="resp" data-v=') +
    '<button type="button" class="cc-chip" data-campo="outro" aria-pressed="' + (st.outro ? 'true' : 'false') + '">Outra pessoa</button></div>' +
    '<input type="text" data-campo="resp_outro" maxlength="60" placeholder="Nome de quem resolve" value="' + esc(st.resp_outro || '') + '"' + (st.outro ? '' : ' hidden') + '>' +
    '<div class="cc-cinza" data-dica="resp">' + esc(respDica(L, st)) + '</div></div>';
}
function respDica(L, st) {
  var r = st.outro ? st.resp_outro : st.resp, ar = areaDe(L, st.area);
  if (r && ehSetor(L, r)) return r + ' é setor: a demanda fica SEM DONO até ter uma pessoa.';
  if (ar && ar.falta_pessoa && !r) return 'Área sem pessoa (falta pessoa): escolha quem resolve.';
  if (ar && st.respAuto && r) return 'Padrão: dono da área.';
  return '';
}
function respMarcar(root, L, st) {
  [].forEach.call(root.querySelectorAll('[data-campo="resp"]'), function (b) { b.setAttribute('aria-pressed', !st.outro && b.getAttribute('data-v') === st.resp ? 'true' : 'false'); });
  var o = root.querySelector('[data-campo="outro"]'); if (o) o.setAttribute('aria-pressed', st.outro ? 'true' : 'false');
  var i = root.querySelector('[data-campo="resp_outro"]'); if (i) i.hidden = !st.outro;
  var dc = root.querySelector('[data-dica="resp"]'); if (dc) dc.textContent = respDica(L, st);
}
function decHtml(L, st, extras) {
  var ps = DM.pessoas(L, (extras || []).concat(st.decisores)).filter(function (n) { return !ehSetor(L, n); });
  return CC.chips(ps, st.decisores, 'campo-v', { rotulo: 'Quem decide' }).replace(/data-campo-v=/g, 'data-campo="decisores" data-v=');
}
function pkSel(L, st) {
  if (!st.ativs.length) return '<span class="cc-cinza">' + (st.sem_ativ ? 'não trava atividade' : 'nenhuma escolhida') + '</span>';
  return st.ativs.map(function (t) {
    return '<button type="button" class="cc-chip" data-cc-a="ativ-tirar" data-t="' + esc(t) + '" aria-pressed="true" title="Tirar ' + esc(t) + '">' +
      esc(t + ' ' + curto(nomeAtiv(L, t), 44)) + ' ✕</button>';
  }).join('');
}
function pkSug(L, st) {
  var b = semAcento(String(st.busca || '').trim()), hoje = CC.hoje(), lim = CC.mais(hoje, 42), lst;
  var c = ((L && L.crono) || []).filter(function (x) { return st.ativs.indexOf(x.id) < 0; });
  if (b) {
    var bt = b.replace(/\s+/g, '');
    lst = c.filter(function (x) { var id = x.id.toLowerCase(); return id === bt || id.indexOf(bt) === 0 || semAcento(x.nome).indexOf(b) >= 0; })
      .sort(function (x, y) { return (!!x.fim_real - !!y.fim_real) || (x.o - y.o); });
  } else {
    lst = c.filter(function (x) { return !x.fim_real && (x.tipo === 'ativ' || x.tipo === 'continua') && x.ini <= lim; })
      .sort(function (x, y) { return x.ini < y.ini ? -1 : x.ini > y.ini ? 1 : x.o - y.o; });
  }
  lst = lst.slice(0, 6);
  if (!lst.length) return '<span class="cc-cinza">' + (b ? 'nenhuma atividade com esse nome' : '') + '</span>';
  return lst.map(function (x) {
    return '<button type="button" class="cc-chip" data-cc-a="ativ-add" data-t="' + esc(x.id) + '" aria-pressed="false" title="' + esc(x.nome) + '">+ ' +
      esc(x.id + ' ' + curto(x.nome, 44)) + (x.fim_real ? ' <small>terminada</small>' : '') + '</button>';
  }).join('');
}
function pkHtml(L, st) {
  return '<div data-pk><span class="cc-rot">Atividades travadas</span>' +
    '<div class="cc-chips" data-pk-sel>' + pkSel(L, st) + '</div>' +
    '<input type="search" data-campo="busca" value="' + esc(st.busca || '') + '" placeholder="Buscar atividade: nome ou T30" autocomplete="off" enterkeyhint="search">' +
    '<div class="cc-chips" data-pk-sug>' + pkSug(L, st) + '</div>' +
    '<div class="cc-chips"><button type="button" class="cc-chip" data-campo="sem_ativ" aria-pressed="' + (st.sem_ativ ? 'true' : 'false') + '">Não trava atividade</button></div></div>';
}
function pkPinta(root, L, st, soSug) {
  var s = root.querySelector('[data-pk-sug]'); if (s) s.innerHTML = pkSug(L, st);
  if (soSug) return;
  var e = root.querySelector('[data-pk-sel]'); if (e) e.innerHTML = pkSel(L, st);
  var n = root.querySelector('[data-campo="sem_ativ"]'); if (n) n.setAttribute('aria-pressed', st.sem_ativ ? 'true' : 'false');
}
// trata clique em chip de responsável/decisor/atividade; devolve true se tratou
function partilhadoClique(root, L, st, b) {
  var a = b.getAttribute('data-cc-a'), campo = b.getAttribute('data-campo'), v = b.getAttribute('data-v');
  if (a === 'ativ-add') {
    var t = b.getAttribute('data-t'); if (st.ativs.indexOf(t) < 0) st.ativs.push(t); st.sem_ativ = false;
    st.busca = ''; var bu = root.querySelector('[data-campo="busca"]'); if (bu) bu.value = '';   // volta às sugestões da semana
    pkPinta(root, L, st); return true;
  }
  if (a === 'ativ-tirar') { var t2 = b.getAttribute('data-t'); st.ativs = st.ativs.filter(function (x) { return x !== t2; }); pkPinta(root, L, st); return true; }
  if (campo === 'sem_ativ') { st.sem_ativ = !st.sem_ativ; if (st.sem_ativ) st.ativs = []; pkPinta(root, L, st); return true; }
  if (campo === 'resp') { st.resp = v; st.outro = false; st.respAuto = false; respMarcar(root, L, st); return true; }
  if (campo === 'outro') {
    st.outro = !st.outro; st.respAuto = false; respMarcar(root, L, st);
    var i = root.querySelector('[data-campo="resp_outro"]'); if (i && st.outro) i.focus();
    return true;
  }
  if (campo === 'decisores') {
    var k = st.decisores.indexOf(v);
    if (k >= 0) st.decisores.splice(k, 1); else st.decisores.push(v);
    CC.chipMarcar(b, true); return true;
  }
  return false;
}

// ---------- formulário de nova demanda (também usado sozinho: CC.demandas.formNova)
function estadoNova(L, p) {
  p = p || {};
  var ar = areaDe(L, p.area), ps = DM.pessoas(L);
  var st = { area: p.area || '', oque: p.oque || '', resp: p.resp || (ar && ar.dono) || '', outro: false, resp_outro: '', respAuto: !p.resp,
    prazo: p.prazo || sextaPadrao(), nova_data: p.nova_data || '', tarefa_id: p.tarefa_id || '', ref_ext: p.ref_ext || '',
    ativs: uniq(p.ativs || []), sem_ativ: !!p.sem_ativ, busca: '', pede: !!(p.pede_decisao || (p.decisores && p.decisores.length)),
    decisores: uniq(p.decisores || []), contraparte: p.contraparte || '', origem: p.origem || null, origem_ref: p.origem_ref || null,
    item: p.item || null, cenario: p.cenario || null };
  if (p.resp && ps.indexOf(p.resp) < 0) { st.outro = true; st.resp_outro = p.resp; st.resp = ''; }
  return st;
}
function FormNova(root, L, o) {
  o = o || {};
  var st = o.estado || estadoNova(L, o.preset);
  var semAtivs = o.ativs === false;
  function areasOps() {
    var l = (L.areas && L.areas.length) ? L.areas.map(function (a) { return { v: a.area, r: a.rotulo ? a.rotulo.split(':')[0] : a.area, title: a.rotulo } })
      : CC.AREAS.map(function (a) { return { v: a.v, r: a.r, title: a.rotulo }; });
    return l;
  }
  function html() {
    var hoje = CC.hoje(), s1 = sextaPadrao(), s2 = CC.mais(s1, 7);
    return '<div class="cc-form cc-fn">' +
      '<div class="cc-tit">' + esc(o.titulo || 'Nova demanda') + '</div>' +
      '<div><span class="cc-rot">Área</span>' + CC.chips(areasOps(), st.area, 'campo-v', { rotulo: 'Área' }).replace(/data-campo-v=/g, 'data-campo="area" data-v=') +
      '<div class="cc-cinza" data-dica="area">' + esc(areaDica()) + '</div></div>' +
      '<div><label class="cc-rot">O que é preciso</label><textarea data-campo="oque" maxlength="300" rows="2" placeholder="Escreva como já resolvido. Ex.: Pacote TERRA contratado">' + esc(st.oque) + '</textarea>' +
      '<div class="cc-conta" data-conta="oque">' + st.oque.trim().length + '/300</div></div>' +
      respHtml(L, st, [st.resp]) +
      '<div><span class="cc-rot">Precisa até</span>' +
      CC.chips([{ v: s1, r: 'esta sexta ' + CC.d(s1) }, { v: s2, r: 'próxima sexta ' + CC.d(s2) }], st.prazo, 'campo-v', { rotulo: 'Prazo rápido' }).replace(/data-campo-v=/g, 'data-campo="prazo_r" data-v=') +
      '<input type="date" data-campo="prazo" value="' + esc(st.prazo) + '" aria-label="Precisa até"></div>' +
      '<div data-bloco="passou"' + (st.prazo && st.prazo < hoje ? '' : ' hidden') + '><div class="cc-aviso">Esse prazo já passou. Informe a nova data (hoje ou depois)' + (o.origemRef ? '' : ' e onde foi combinado (Rxx do site ou protocolo)') + '.</div>' +
      '<label class="cc-rot" style="margin-top:8px">Nova data</label><input type="date" data-campo="nova_data" min="' + esc(hoje) + '" value="' + esc(st.nova_data) + '"></div>' +
      (semAtivs ? '' : pkHtml(L, st)) +
      '<div><span class="cc-rot">Pede decisão de alguém?</span>' +
      CC.chips([{ v: 'nao', r: 'Não' }, { v: 'sim', r: 'Sim' }], st.pede ? 'sim' : 'nao', 'campo-v', { rotulo: 'Pede decisão' }).replace(/data-campo-v=/g, 'data-campo="pede" data-v=') +
      '<div data-bloco="dec"' + (st.pede ? '' : ' hidden') + '><span class="cc-rot" style="margin-top:6px">Quem decide</span>' + decHtml(L, st) + '</div></div>' +
      '<div><label class="cc-rot">Contraparte <span class="cc-cinza">(opcional)</span></label><input type="text" data-campo="contraparte" maxlength="80" placeholder="Ex.: SANEAGO, concessionária" value="' + esc(st.contraparte) + '"></div>' +
      '<div><label class="cc-rot">Rxx do site <span class="cc-cinza">(opcional)</span></label><input type="text" data-campo="tarefa_id" maxlength="16" placeholder="Ex.: R05" autocapitalize="characters" value="' + esc(st.tarefa_id) + '"></div>' +
      '<div><label class="cc-rot">Protocolo ou onde foi combinado <span class="cc-cinza">(opcional)</span></label><input type="text" data-campo="ref_ext" maxlength="80" placeholder="Ex.: ofício, e-mail de 21/10" value="' + esc(st.ref_ext) + '"></div>' +
      '<div class="cc-erro" data-erro role="alert"></div>' +
      '<div class="cc-acts"><button type="button" class="cc-btn cc-cheio" data-cc-a="fn-ok">' + esc(o.botao || 'Criar demanda') + '</button>' +
      '<button type="button" class="cc-btn" data-cc-a="fn-voltar">Voltar</button></div></div>';
  }
  function areaDica() {
    var ar = areaDe(L, st.area);
    if (!ar) return st.area ? '' : 'Escolha a área que precisa resolver.';
    return ar.falta_pessoa ? (ar.rotulo + ' · falta pessoa') : (ar.rotulo + ' · dono: ' + (ar.dono || 'falta pessoa'));
  }
  function ajusta() {
    var hoje = CC.hoje();
    var b = root.querySelector('[data-bloco="passou"]'); if (b) b.hidden = !(st.prazo && st.prazo < hoje);
    var dc = root.querySelector('[data-bloco="dec"]'); if (dc) dc.hidden = !st.pede;
    [].forEach.call(root.querySelectorAll('[data-campo="prazo_r"]'), function (x) { x.setAttribute('aria-pressed', x.getAttribute('data-v') === st.prazo ? 'true' : 'false'); });
    var da = root.querySelector('[data-dica="area"]'); if (da) da.textContent = areaDica();
    respMarcar(root, L, st);
  }
  function erro(m) { var e = root.querySelector('[data-erro]'); if (e) e.textContent = m || ''; return { erro: m }; }
  function validar() {
    var hoje = CC.hoje(), oq = String(st.oque || '').trim(), resp = String(st.outro ? st.resp_outro : st.resp || '').trim();
    var rx = String(st.tarefa_id || '').trim().toUpperCase(), ref = String(st.ref_ext || '').trim(), ct = String(st.contraparte || '').trim();
    if (!st.area) return erro('Escolha a área.');
    if (oq.length < 5) return erro('Escreva o que é preciso (5 letras ou mais).');
    if (resp.length < 2) return erro('Escolha o responsável.');
    if (!CC.ehData(st.prazo)) return erro('Informe até quando precisa.');
    var passou = st.prazo < hoje;
    if (passou && (!CC.ehData(st.nova_data) || st.nova_data < hoje)) return erro('O prazo já passou: informe a nova data (hoje ou depois).');
    if (passou && !o.origemRef && !rx && !ref && !st.origem_ref) return erro('O prazo já passou: diga onde foi combinado (Rxx do site ou protocolo).');
    if (!semAtivs && !st.ativs.length && !st.sem_ativ) return erro('Escolha as atividades travadas ou toque em "Não trava atividade".');
    if (st.pede && !st.decisores.length) return erro('Escolha quem decide.');
    if (rx && !RX_TAREFA.test(rx)) return erro('Rxx do site: use o código, por exemplo R05.');
    var d = { area: st.area, oque: oq, resp: resp, prazo: st.prazo };
    if (passou) d.nova_data = st.nova_data;
    if (!semAtivs) { if (st.ativs.length) d.ativs = st.ativs.slice(); else d.sem_ativ = true; }
    if (st.pede) { d.pede_decisao = true; d.decisores = st.decisores.slice(); }
    if (ct) d.contraparte = ct;
    if (rx) d.tarefa_id = rx;
    if (ref) d.ref_ext = ref;
    if (st.origem) d.origem = st.origem;
    if (st.origem_ref) d.origem_ref = st.origem_ref;
    if (st.item) d.item = st.item;
    if (st.cenario) d.cenario = st.cenario;
    erro('');
    return { dados: d };
  }
  function clk(e) {
    var b = e.target.closest('button');
    if (!b || !root.contains(b)) return;
    var a = b.getAttribute('data-cc-a'), campo = b.getAttribute('data-campo'), v = b.getAttribute('data-v');
    if (a === 'fn-ok') { var r = validar(); if (r.dados && o.onPronto) o.onPronto(r.dados, st); return; }
    if (a === 'fn-voltar') { if (o.onVoltar) o.onVoltar(st); return; }
    if (partilhadoClique(root, L, st, b)) { erro(''); return; }
    if (campo === 'area') {
      st.area = v; CC.chipMarcar(b);
      if (st.respAuto) { var ar = areaDe(L, v); st.resp = (ar && ar.dono) || ''; st.outro = false; }
      ajusta(); erro(''); return;
    }
    if (campo === 'prazo_r') { st.prazo = v; var i = root.querySelector('[data-campo="prazo"]'); if (i) i.value = v; ajusta(); return; }
    if (campo === 'pede') { st.pede = v === 'sim'; CC.chipMarcar(b); ajusta(); return; }
  }
  function inp(e) {
    var t = e.target, campo = t.getAttribute && t.getAttribute('data-campo');
    if (!campo || !(campo in st) || st[campo] === t.value) return;
    st[campo] = t.value;
    if (campo === 'oque') { var c = root.querySelector('[data-conta="oque"]'); if (c) c.textContent = t.value.trim().length + '/300'; }
    if (campo === 'busca') pkPinta(root, L, st, true);
    if (campo === 'prazo' || campo === 'resp_outro') ajusta();
  }
  root.setAttribute('data-cc-fn', '1');
  root.innerHTML = html();
  root.addEventListener('click', clk);
  root.addEventListener('input', inp);
  root.addEventListener('change', inp);
  return {
    estado: st, validar: validar,
    fechar: function () { root.removeEventListener('click', clk); root.removeEventListener('input', inp); root.removeEventListener('change', inp); root.removeAttribute('data-cc-fn'); root.innerHTML = ''; }
  };
}
// formulário sozinho (ex.: [Abrir demanda] no Hoje, Pendente no Preparar): devolve os dados prontos em onPronto
DM.formNova = function (el, L, o) { return FormNova(el, L, o || {}); };

// ---------- módulo da aba Demandas
function achar(num) { var l = (S && S.L && S.L.demandas) || []; for (var i = 0; i < l.length; i++) if (+l[i].num === +num) return l[i]; return null; }
function minha(d) { var n = S.L.ator && S.L.ator.nome; return !!n && (d.resp === n || (d.decisores || []).indexOf(n) >= 0); }
function ordenar(l) {
  return l.sort(function (a, b) {
    var x = aberta(a), y = aberta(b);
    if (x !== y) return x ? -1 : 1;
    if (x) { var ea = a.efetivo || a.prazo, eb = b.efetivo || b.prazo; if (ea !== eb) return ea < eb ? -1 : 1; return a.num - b.num; }
    return b.num - a.num;
  });
}
function filtrar(f) {
  var ds = ((S.L && S.L.demandas) || []).slice(), ab = ds.filter(aberta);
  if (f === 'vencidas') return ordenar(ab.filter(function (d) { return d.dias != null && d.dias < 0; }));
  if (f === 'minhas') return ordenar(ab.filter(minha));
  if (f === 'todas') return ordenar(ds);
  return ordenar(ab);
}
function contagens() {
  var o = {};
  FILTROS.forEach(function (f) { o[f.v] = f.v === 'area' ? null : filtrar(f.v).length; });
  return o;
}
function papel() { return S.L.ator && S.L.ator.papel; }
function podeMexer(d) { return CC.podeDemanda(S.L.ator, d); }

function dmTopo() {
  var n = contagens();
  var ops = FILTROS.map(function (f) { return { v: f.v, r: f.r + (n[f.v] != null ? ' (' + n[f.v] + ')' : '') }; });
  return CC.chips(ops, S.filtro, 'campo-v', { rotulo: 'Filtro das demandas' }).replace(/data-campo-v=/g, 'data-cc-a="filtro" data-v=') +
    (CC.pode(papel(), 'demanda') ? '<button type="button" class="cc-btn cc-pri" data-cc-a="nova" aria-expanded="' + (S.novaAberta ? 'true' : 'false') + '">+ Nova demanda</button>' : '');
}
function dmInfo(d) {
  var L = S.L, ar = areaDe(L, d.area), sel = '', h = '';
  if (d.situacao === 'resolvida') sel += CC.selo('RESOLVIDA' + (d.resolvida_em ? ' ' + CC.d(d.resolvida_em) : ''), 'ok');
  else if (d.situacao === 'cancelada') sel += CC.selo('CANCELADA', 'mu');
  else {
    if (d.situacao === 'respondida') sel += CC.selo('RESPONDIDA', 'ac');
    if (d.alerta) sel += CC.selo(d.alerta, CC.COR.alerta[d.alerta] || 'mu');
    if (d.vencida_7) sel += CC.selo('vencida há mais de 7 dias', 'ne');
  }
  if (S.novos[d.num]) sel += CC.selo('NOVA', 'ac');
  h += '<div class="cc-cab"><span class="cc-dem-n">D' + esc(d.num) + '</span><span class="cc-mu">· ' + esc(areaCurta(L, d.area)) + '</span>' + sel + '</div>';
  h += '<div class="cc-dem-oque">' + esc(d.oque) + '</div>';
  var setor = ehSetor(L, d.resp);
  h += '<div class="cc-lin">Responsável: ' + (setor ? CC.selo('SEM DONO (' + d.resp + ')', 'ne') + ' <span class="cc-cinza">falta pessoa</span>' : '<b>' + esc(d.resp) + '</b>') +
    (!setor && ar && ar.falta_pessoa ? ' <span class="cc-cinza">· área sem dono: falta pessoa</span>' : '') +
    ((d.decisores || []).length ? ' · decide: ' + esc(d.decisores.join(', ')) : '') +
    (d.contraparte ? ' · com ' + esc(d.contraparte) : '') + '</div>';
  h += '<div class="cc-lin">Precisa até <b>' + esc(CC.d(d.prazo)) + '</b>' + (d.nova_data ? ' · nova data <b>' + esc(CC.d(d.nova_data)) + '</b>' : '') +
    (d.vezes ? ' · replanejada ' + vezTxt(d.vezes) : '') + (aberta(d) ? ' <span class="cc-mu">· ' + esc(dias(d.dias)) + '</span>' : '') + '</div>';
  if ((d.ativs || []).length) {
    h += '<div class="cc-lin">Trava: ' + d.ativs.map(function (t) { return '<b>' + esc(t) + '</b> ' + esc(nomeAtiv(L, t)); }).join('; ') + '</div>';
  } else if (d.sem_ativ) h += '<div class="cc-lin cc-mu">Não trava atividade</div>';
  if (aberta(d)) {
    var im = DM.textoImpacto(d.impacto);
    h += im ? '<div class="cc-lin cc-imp"><span class="cc-mu">Impacto:</span> ' + im.linhas.map(esc).join('<br>') + (im.quando ? ' <span class="cc-cinza">(' + esc(im.quando) + ')</span>' : '') + '</div>'
      : '<div class="cc-lin cc-mu cc-imp">Impacto: ainda não calculado</div>';
  }
  if (d.resposta) {
    h += '<div class="cc-lin"><span class="cc-mu">Resposta' + (d.respondida_por ? ' de ' + esc(d.respondida_por) : '') +
      (d.respondida_em ? ' · ' + esc(CC.quando(d.respondida_em)) : '') + ':</span> ' + esc(d.resposta) + '</div>';
  }
  if (d.situacao === 'resolvida' && d.resolvida_por) h += '<div class="cc-lin cc-mu">Resolvida por ' + esc(d.resolvida_por) + (d.resolvida_em ? ' em ' + esc(CC.d(d.resolvida_em)) : '') + '</div>';
  var cb = d.cobrancas || [];
  if (aberta(d) || cb.length) {
    var u = cb[cb.length - 1];
    h += '<div class="cc-lin cc-mu">' + (cb.length ? 'Cobrada ' + vezTxt(cb.length) + ' · última ' + esc(CC.quando(u.em)) + ' (' + esc(u.quem || '') + ', ' + esc(CC.rot('canal', u.canal)) + ')' : 'Ainda não cobrada') + '</div>';
  }
  if (d.diverge) h += '<div class="cc-aviso">' + esc(d.diverge) + '</div>';
  var rod = [];
  if (d.tarefa_id) rod.push(d.tarefa_id);
  if (d.ref_ext) rod.push('protocolo: ' + d.ref_ext);
  if (d.origem && d.origem !== 'manual') rod.push(CC.rot('origem_demanda', d.origem));
  if (d.criada_por) rod.push('aberta por ' + d.criada_por + (d.criada_em ? ' ' + CC.quando(d.criada_em) : ''));
  if (rod.length) h += '<div class="cc-lin cc-cinza">' + esc(rod.join(' · ')) + '</div>';
  return h;
}
function bAbrir(num, f, txt) {
  var on = S.forms[num] === f;
  return '<button type="button" class="cc-btn' + (on ? ' cc-on' : '') + (f === 'cancelar' ? ' cc-perigo' : '') + '" data-cc-a="abrir" data-v="' + f + '" aria-expanded="' + (on ? 'true' : 'false') + '">' + esc(txt) + '</button>';
}
function dmActs(d) {
  var p = papel(), b = [], mexe = podeMexer(d), extra = [];
  if (aberta(d)) {
    if (CC.pode(p, 'cobrar')) b.push(bAbrir(d.num, 'cobrar', 'Copiar cobrança'));
    if (mexe && CC.pode(p, 'demanda_resp')) b.push(bAbrir(d.num, 'resp', 'Responder'));
    if (mexe && CC.pode(p, 'demanda')) b.push(bAbrir(d.num, 'data', 'Nova data'));
    if (CC.pode(p, 'impacto')) extra.push('<button type="button" class="cc-btn" data-cc-a="impacto">Recalcular impacto</button>');
    if (mexe && CC.pode(p, 'demanda')) { extra.push(bAbrir(d.num, 'editar', 'Editar')); extra.push(bAbrir(d.num, 'cancelar', 'Cancelar')); }
    if (extra.length) {
      if (S.mais[d.num]) b = b.concat(extra, ['<button type="button" class="cc-btn" data-cc-a="mais" aria-expanded="true">Menos ▴</button>']);
      else b.push('<button type="button" class="cc-btn" data-cc-a="mais" aria-expanded="false">Mais ▾</button>');
    }
  } else if (mexe && CC.pode(p, 'demanda')) b.push(bAbrir(d.num, 'reabrir', 'Reabrir'));
  return b.length ? '<div class="cc-acts">' + b.join('') + '</div>' : '';
}
function rascDe(num, f) { return S.rasc[num + '|' + f]; }
function iniRasc(num, f) {
  var k = num + '|' + f, d = achar(num);
  if (S.rasc[k] || !d) return;
  if (f === 'resp') S.rasc[k] = { resposta: '', resolver: false };
  else if (f === 'data') S.rasc[k] = { nova_data: '', motivo: '' };
  else if (f === 'cancelar' || f === 'reabrir') S.rasc[k] = { motivo: '' };
  else if (f === 'editar') {
    var ps = DM.pessoas(S.L, [d.resp]);
    var fora = ps.indexOf(d.resp) < 0;
    S.rasc[k] = { resp: fora ? '' : d.resp, outro: fora, resp_outro: fora ? d.resp : '', respAuto: false, decisores: (d.decisores || []).slice(),
      contraparte: d.contraparte || '', ativs: (d.ativs || []).slice(), sem_ativ: !!d.sem_ativ, busca: '', tarefa_id: d.tarefa_id || '', ref_ext: d.ref_ext || '', area: d.area };
    S.rasc[k].orig = editCampos(S.rasc[k]);   // o que estava no cartão ao abrir: só vai o que a pessoa mudou
  } else S.rasc[k] = {};
}
function editCampos(st) {
  return { resp: String(st.outro ? st.resp_outro : st.resp || '').trim(), decisores: (st.decisores || []).slice().sort(),
    contraparte: String(st.contraparte || '').trim(), ativs: (st.ativs || []).slice().sort(), sem_ativ: !!st.sem_ativ && !(st.ativs || []).length,
    tarefa_id: String(st.tarefa_id || '').trim().toUpperCase(), ref_ext: String(st.ref_ext || '').trim() };
}
function difere(a, b) { return JSON.stringify(a) !== JSON.stringify(b); }
// Corrigir depois de recusa: parte do cartão como está agora e reaplica só o que a pessoa tinha mudado
function editRebase(novo, velho) {
  if (!velho || !velho.orig) return novo;
  var a = editCampos(velho), o = velho.orig;
  if (a.resp !== o.resp) { novo.resp = velho.resp; novo.outro = velho.outro; novo.resp_outro = velho.resp_outro; }
  if (difere(a.decisores, o.decisores)) novo.decisores = (velho.decisores || []).slice();
  if (a.contraparte !== o.contraparte) novo.contraparte = velho.contraparte;
  if (difere(a.ativs, o.ativs) || a.sem_ativ !== o.sem_ativ) { novo.ativs = (velho.ativs || []).slice(); novo.sem_ativ = !!velho.sem_ativ; }
  if (a.tarefa_id !== o.tarefa_id) novo.tarefa_id = velho.tarefa_id;
  if (a.ref_ext !== o.ref_ext) novo.ref_ext = velho.ref_ext;
  return novo;
}
function txtArea(campo, val, rot, ph, max) {
  return '<div><label class="cc-rot">' + esc(rot) + '</label><textarea data-campo="' + campo + '" rows="3" maxlength="' + (max || 300) + '" placeholder="' + esc(ph || '') + '">' + esc(val || '') + '</textarea></div>';
}
function dmForm(d) {
  var f = S.forms[d.num];
  if (!f || !achar(d.num)) return '';
  var st = rascDe(d.num, f) || {}, h = '<div class="cc-form" data-form="' + f + '">', hoje = CC.hoje();
  if (f === 'cobrar') {
    h += '<span class="cc-rot">Por onde vai cobrar? O texto vai para a área de transferência.</span>' +
      CC.chips(CC.CANAIS, null, 'campo-v', { rotulo: 'Canal da cobrança' }).replace(/data-campo-v=/g, 'data-cc-a="cobrar" data-v=');
  } else if (f === 'resp') {
    h += txtArea('resposta', st.resposta, 'Resposta (3 letras ou mais)', 'O que foi feito ou combinado', 1000) +
      '<div><span class="cc-rot">Resolvida?</span>' + CC.chips([{ v: 'nao', r: 'Não, só respondi' }, { v: 'sim', r: 'Sim, resolvida' }], st.resolver ? 'sim' : 'nao', 'campo-v', { rotulo: 'Resolvida?' }).replace(/data-campo-v=/g, 'data-campo="resolver" data-v=') + '</div>';
  } else if (f === 'data') {
    var base = (d.efetivo && d.efetivo > hoje) ? d.efetivo : hoje;
    var ops = [3, 7, 14].map(function (n) { var x = CC.mais(base, n); return { v: x, r: '+' + n + ' d · ' + CC.d(x) }; });
    h += '<div class="cc-cinza">Precisa até ' + esc(CC.d(d.prazo)) + ' (original, não muda)' + (d.nova_data ? ' · nova data atual ' + esc(CC.d(d.nova_data)) : '') + '</div>' +
      '<div><span class="cc-rot">Nova data (hoje ou depois)</span>' + CC.chips(ops, st.nova_data, 'campo-v', { rotulo: 'Nova data rápida' }).replace(/data-campo-v=/g, 'data-campo="nova_r" data-v=') +
      '<input type="date" data-campo="nova_data" min="' + esc(hoje) + '" value="' + esc(st.nova_data) + '" aria-label="Nova data"></div>' +
      txtArea('motivo', st.motivo, 'Motivo (5 letras ou mais)', 'Por que mudou');
  } else if (f === 'editar') {
    h += respHtml(S.L, st, [d.resp]) +
      '<div><span class="cc-rot">Quem decide <span class="cc-cinza">(opcional)</span></span>' + decHtml(S.L, st, d.decisores) + '</div>' +
      '<div><label class="cc-rot">Contraparte</label><input type="text" data-campo="contraparte" maxlength="80" placeholder="Ex.: SANEAGO" value="' + esc(st.contraparte) + '"></div>' +
      pkHtml(S.L, st) +
      '<div><label class="cc-rot">Rxx do site</label><input type="text" data-campo="tarefa_id" maxlength="16" placeholder="Ex.: R05" value="' + esc(st.tarefa_id) + '"></div>' +
      '<div><label class="cc-rot">Protocolo ou onde foi combinado</label><input type="text" data-campo="ref_ext" maxlength="80" value="' + esc(st.ref_ext) + '"></div>';
  } else if (f === 'cancelar') {
    h += txtArea('motivo', st.motivo, 'Por que cancelar? (5 letras ou mais)', 'Ex.: resolvido de outro jeito');
  } else if (f === 'reabrir') {
    h += txtArea('motivo', st.motivo, 'Por que reabrir? (5 letras ou mais)', 'Ex.: voltou a travar');
  }
  h += '<div class="cc-erro" data-erro role="alert"></div><div class="cc-acts">';
  if (f !== 'cobrar') {
    var rot = { resp: 'Enviar resposta', data: 'Gravar nova data', editar: 'Salvar', cancelar: 'Cancelar demanda', reabrir: 'Reabrir demanda' }[f];
    h += '<button type="button" class="cc-btn cc-cheio" data-cc-a="enviar">' + esc(rot) + '</button>';
  }
  return h + '<button type="button" class="cc-btn" data-cc-a="voltar">Voltar</button></div></div>';
}
function pendDe(num) {
  return CC.fila.itens().filter(function (it) { return it.meta && it.meta.mod === 'dem' && +it.meta.num === +num; });
}
function pendTxt() { var e = CC.estado(); return e.erro || offline() ? 'Aguardando sinal' : 'Enviando'; }
function dmMsg(d) {
  var h = '', m = S.msgs[d.num];
  pendDe(d.num).forEach(function (it) { h += '<div class="cc-pend">' + esc(pendTxt()) + ': ' + esc(it.meta.rotulo || it.acao) + '</div>'; });
  if (m && m.t === 'recusa') {
    h += CC.htmlRecusa(m.motivo, m.uid, { extra: CC.mudouDepois(m.motivo) ? 'Outra pessoa mudou esta demanda. O cartão foi relido: confira e tente de novo.' : '', semCorrigir: !m.form || m.form === 'impacto' || m.form === 'cobrar' });
  } else if (m && m.t === 'cobranca') {
    h += '<div class="cc-cob"><span class="cc-rot">Texto da cobrança' + (m.copiado ? ' · copiado' : '') + '</span>' +
      '<textarea readonly rows="4" aria-label="Texto da cobrança">' + esc(m.texto) + '</textarea>' +
      '<div class="cc-acts"><button type="button" class="cc-btn cc-pri" data-cc-a="copiar">Copiar</button><button type="button" class="cc-btn" data-cc-a="fechar-msg">Fechar</button></div></div>';
  }
  return h;
}
function dmCard(d) {
  S.snap[d.num] = JSON.stringify(d);
  return '<article class="cc-card cc-dem-card" id="cc-dem-' + esc(d.num) + '" data-num="' + esc(d.num) + '">' +
    '<div class="cc-dem-info">' + dmInfo(d) + '</div><div class="cc-dem-acts">' + dmActs(d) + '</div>' +
    '<div class="cc-dem-erp" data-cc-erp-dem="' + esc(d.num) + '" data-ativs="' + esc((d.ativs || []).join(',')) + '" data-elig="' + (d.area === 'SUPRIMENTOS' || d.item === 'material' ? '1' : '0') +
    '" data-aberta="' + (aberta(d) ? '1' : '0') + '"></div>' +
    '<div class="cc-dem-form">' + dmForm(d) + '</div><div class="cc-dem-msg" aria-live="polite">' + dmMsg(d) + '</div></article>';
}
function cardEl(num) { return S.el.querySelector('article.cc-dem-card[data-num="' + (+num) + '"]'); }
function dmRedesenhar(num, comForm) {
  var el = cardEl(num), d = achar(num);
  if (!el || !d) return;
  S.snap[d.num] = JSON.stringify(d);
  el.querySelector('.cc-dem-info').innerHTML = dmInfo(d);
  el.querySelector('.cc-dem-acts').innerHTML = dmActs(d);
  if (comForm) el.querySelector('.cc-dem-form').innerHTML = dmForm(d);
  el.querySelector('.cc-dem-msg').innerHTML = dmMsg(d);
}
function dmMsgs() {     // só as mensagens (fila mudou)
  if (!S || !S.el.isConnected) return;
  [].forEach.call(S.el.querySelectorAll('article.cc-dem-card[data-num]'), function (el) {
    var d = achar(el.getAttribute('data-num')); if (!d) return;
    var m = el.querySelector('.cc-dem-msg'), h = dmMsg(d);
    if (m.innerHTML !== h) m.innerHTML = h;
  });
  var nv = S.el.querySelector('.cc-dem-novas'); if (nv) { var hn = dmNovas(); if (nv.innerHTML !== hn) nv.innerHTML = hn; }
}
function dmNovas() {
  var h = '', txt = pendTxt();
  CC.fila.itens().forEach(function (it) {
    if (!it.meta || it.meta.mod !== 'dem' || !it.meta.nova) return;
    var dd = it.dados || {};
    h += '<article class="cc-card cc-dem-card cc-dem-pend"><div class="cc-cab"><b>Nova demanda</b>' + CC.selo(txt.toLowerCase(), 'mu') + '</div>' +
      '<div class="cc-dem-oque">' + esc(dd.oque) + '</div><div class="cc-lin cc-mu">' + esc(areaCurta(S.L, dd.area)) + ' · ' + esc(dd.resp || '') + ' · precisa até ' + esc(CC.d(dd.prazo)) + '</div></article>';
  });
  S.novasRec.forEach(function (r) {
    var dd = r.dados || {};
    h += '<article class="cc-card cc-dem-card cc-vermelho"><div class="cc-cab"><b>Nova demanda</b></div><div class="cc-dem-oque">' + esc(dd.oque) + '</div>' +
      CC.htmlRecusa(r.motivo, r.uid) + '</article>';
  });
  return h;
}
function dmLista() {
  var l = filtrar(S.filtro), h = '';
  if (S.filtro === 'area') {
    ((S.L.areas && S.L.areas.length) ? S.L.areas : CC.AREAS.map(function (a) { return { area: a.v, rotulo: a.rotulo }; })).forEach(function (ar) {
      var g = l.filter(function (d) { return d.area === ar.area; });
      if (!g.length) return;
      h += '<div class="cc-dem-grupo">' + esc(ar.rotulo ? ar.rotulo.split(':')[0] : ar.area) + ' <span class="cc-cinza">· ' +
        esc(ar.falta_pessoa ? 'falta pessoa' : 'dono ' + (ar.dono || 'falta pessoa')) + ' · ' + g.length + (g.length === 1 ? ' aberta' : ' abertas') + '</span></div>' +
        g.map(dmCard).join('');
    });
  } else h = l.map(dmCard).join('');
  if (!h) h = '<div class="cc-vazio">' + esc({ abertas: 'Nenhuma demanda aberta.', vencidas: 'Nenhuma demanda vencida.', minhas: 'Nenhuma demanda aberta com você.', area: 'Nenhuma demanda aberta.', todas: 'Nenhuma demanda ainda.' }[S.filtro] || 'Nada aqui.') + '</div>';
  return h;
}
function focoGuardar() {
  var a = D.activeElement;
  if (!a || !S.el.contains(a)) return null;
  var c = a.closest('[data-num]'), f = a.closest('[data-cc-fn]');
  return { num: c ? c.getAttribute('data-num') : null, fn: !!f, campo: a.getAttribute('data-campo'), cca: a.getAttribute('data-cc-a'), v: a.getAttribute('data-v'),
    ini: a.selectionStart, fim: a.selectionEnd };
}
function focoVoltar(g) {
  if (!g) return;
  var raiz = g.fn ? S.el.querySelector('[data-cc-fn]') : g.num ? cardEl(g.num) : S.el;
  if (!raiz) return;
  var sel = g.campo ? '[data-campo="' + g.campo + '"]' : g.cca ? '[data-cc-a="' + g.cca + '"]' : null;
  if (!sel) return;
  if (g.v) sel += '[data-v="' + String(g.v).replace(/"/g, '\\"') + '"]';
  var x = raiz.querySelector(sel);
  if (!x) return;
  try { x.focus({ preventScroll: true }); if (g.ini != null && x.setSelectionRange) x.setSelectionRange(g.ini, g.fim); } catch (e) { /* ok */ }
}
function dmDesenhar() {
  var g = focoGuardar();
  if (S.fn) { S.fn.fechar(); S.fn = null; }
  S.el.innerHTML = '<div class="cc-dem">' +
    '<div class="cc-dem-topo">' + dmTopo() + '</div>' +
    '<div class="cc-dem-nova"></div>' +
    '<div class="cc-dem-novas">' + dmNovas() + '</div>' +
    '<div class="cc-dem-lista">' + dmLista() + '</div></div>';
  if (S.novaAberta) abrirNova(null, true);
  focoVoltar(g);
}
function dmTopoAtualiza() { var t = S.el.querySelector('.cc-dem-topo'); if (t) t.innerHTML = dmTopo(); }
function abrirNova(preset, refazer) {
  var box = S.el.querySelector('.cc-dem-nova');
  if (!box) return;
  if (S.fn) { S.fn.fechar(); S.fn = null; }
  if (!refazer || !S.novaSt) S.novaSt = estadoNova(S.L, preset || {});
  S.novaAberta = true;
  S.fn = FormNova(box, S.L, {
    estado: S.novaSt,
    onPronto: function (dados, st) {
      if (!dados.origem) dados.origem = 'manual';
      CC.enviar('demanda', dados, { mod: 'dem', nova: true, rotulo: 'nova demanda', rasc: copia(st) });
      fecharNova();
      CC.toast(CC.estado().erro || offline() ? 'Demanda guardada: vai quando voltar o sinal.' : 'Enviando a demanda…');
    },
    onVoltar: function () { fecharNova(); }
  });
  dmTopoAtualiza();
}
function fecharNova() {
  if (S.fn) { S.fn.fechar(); S.fn = null; }
  S.novaAberta = false; S.novaSt = null;
  dmTopoAtualiza();
  dmMsgs();
}
function erroForm(num, m) { var el = cardEl(num), e = el && el.querySelector('.cc-dem-form [data-erro]'); if (e) e.textContent = m; }
function emLido(d, o) { if (d && d.em) o.em_lido = d.em; return o; }
function dmEnviar(num) {
  var f = S.forms[num], st = rascDe(num, f), d = achar(num), hoje = CC.hoje(), dados, acao = 'demanda';
  if (!f || !st || !d) return;
  if (f === 'resp') {
    var r = String(st.resposta || '').trim();
    if (r.length < 3) return erroForm(num, 'Escreva a resposta (3 letras ou mais).');
    acao = 'demanda_resp'; dados = emLido(d, { num: d.num, resposta: r, resolver: !!st.resolver });
  } else if (f === 'data') {
    if (!CC.ehData(st.nova_data) || st.nova_data < hoje) return erroForm(num, 'Escolha a nova data (hoje ou depois).');
    if (st.nova_data === d.nova_data) return erroForm(num, 'Essa já é a nova data.');
    if (String(st.motivo || '').trim().length < 5) return erroForm(num, 'Escreva o motivo (5 letras ou mais).');
    dados = emLido(d, { num: d.num, nova_data: st.nova_data, motivo: String(st.motivo).trim() });
  } else if (f === 'cancelar' || f === 'reabrir') {
    if (String(st.motivo || '').trim().length < 5) return erroForm(num, 'Escreva o motivo (5 letras ou mais).');
    dados = emLido(d, { num: d.num, situacao: f === 'cancelar' ? 'cancelada' : 'aberta', motivo: String(st.motivo).trim() });
  } else if (f === 'editar') {
    var c = editCampos(st), o0 = st.orig || editCampos({}), mud = {};
    if (c.resp.length < 2) return erroForm(num, 'Escolha o responsável.');
    if (c.tarefa_id && !RX_TAREFA.test(c.tarefa_id)) return erroForm(num, 'Rxx do site: use o código, por exemplo R05.');
    if (!c.ativs.length && !c.sem_ativ) return erroForm(num, 'Escolha as atividades travadas ou toque em "Não trava atividade".');
    if (c.resp !== o0.resp) mud.resp = c.resp;
    if (difere(c.decisores, o0.decisores)) { mud.decisores = c.decisores; mud.pede_decisao = c.decisores.length > 0; }
    if (c.contraparte !== o0.contraparte) mud.contraparte = c.contraparte;
    if (difere(c.ativs, o0.ativs) || c.sem_ativ !== o0.sem_ativ) { mud.ativs = c.ativs; mud.sem_ativ = !c.ativs.length; }
    if (c.tarefa_id !== o0.tarefa_id) mud.tarefa_id = c.tarefa_id;
    if (c.ref_ext !== o0.ref_ext) mud.ref_ext = c.ref_ext;
    if (!Object.keys(mud).length) return erroForm(num, 'Nada mudou.');
    mud.num = d.num;
    dados = emLido(d, mud);
  } else return;
  S.forms[num] = null;
  delete S.msgs[num];
  CC.enviar(acao, dados, { mod: 'dem', num: d.num, tipo: f, rotulo: ROT_FORM[f], rasc: copia(st) });
  delete S.rasc[num + '|' + f];
  dmRedesenhar(num, true);
}
function enviarCobrar(num, canal) {
  var d = achar(num); if (!d) return;
  S.forms[num] = null;
  if (S.msgs[num] && S.msgs[num].t !== 'cobranca') delete S.msgs[num];
  var p = CC.enviar('cobrar', { num: d.num, canal: canal || 'whatsapp' }, { mod: 'dem', num: d.num, tipo: 'cobrar', rotulo: ROT_FORM.cobrar });
  dmRedesenhar(num, true);
  CC.copiar(p.then(function (r) { return r.texto; })).then(function (ok) {
    var m = S && S.msgs[num];
    if (!m || m.t !== 'cobranca') return;
    m.copiado = ok;
    dmRedesenhar(num);
    CC.toast(ok ? 'Cobrança copiada. Cole no ' + CC.rot('canal', canal) + '.' : 'Cobrança pronta: toque em Copiar.');
  });
}
function reler() {
  var f = S.o.reler, L0 = S.L;
  var p = typeof f === 'function' ? f() : CC.ler(L0 && L0.seg);
  Promise.resolve(p).then(function (L) { if (L && L.demandas && S) DM.atualizar(L); }).catch(function () { /* fica como está */ });
}
function dmClick(e) {
  if (!S) return;
  if (e.target.closest('[data-cc-fn]')) return;          // o formulário de nova demanda cuida de si
  var b = e.target.closest('button');
  if (!b || !S.el.contains(b)) return;
  var a = b.getAttribute('data-cc-a'), card = b.closest('article[data-num]'), num = card ? +card.getAttribute('data-num') : null, v = b.getAttribute('data-v');
  if (a === 'filtro') { S.filtro = v; CC.ls.set(FILTRO_KEY, v); dmDesenhar(); return; }
  if (a === 'nova') { if (S.novaAberta) fecharNova(); else abrirNova(); return; }
  if (a === 'descartar' || a === 'corrigir') {
    var uid = b.getAttribute('data-uid');
    CC.descartarRecusa(uid);
    if (num != null && S.msgs[num] && S.msgs[num].uid === uid) {
      var m = S.msgs[num]; delete S.msgs[num];
      if (a === 'corrigir' && m.form && FORM_CORRIGE[m.form]) {
        var k = num + '|' + m.form;
        S.forms[num] = m.form; delete S.rasc[k]; iniRasc(num, m.form);
        if (m.rasc && S.rasc[k]) S.rasc[k] = m.form === 'editar' ? editRebase(S.rasc[k], m.rasc) : m.rasc;
      }
      dmRedesenhar(num, true);
    } else {
      var r = null;
      S.novasRec = S.novasRec.filter(function (x) { if (x.uid === uid) { r = x; return false; } return true; });
      if (a === 'corrigir' && r) { S.novaSt = r.rasc || estadoNova(S.L, r.dados); abrirNova(null, true); }
      dmMsgs();
    }
    return;
  }
  if (num == null) return;
  if (a === 'abrir') { S.forms[num] = S.forms[num] === v ? null : v; if (S.forms[num]) iniRasc(num, v); dmRedesenhar(num, true);
    var x = cardEl(num), ip = x && x.querySelector('.cc-dem-form textarea'); if (ip && S.forms[num] && v !== 'data') ip.focus(); return; }
  if (a === 'mais') { S.mais[num] = !S.mais[num]; dmRedesenhar(num); return; }
  if (a === 'voltar') { var f0 = S.forms[num]; S.forms[num] = null; delete S.rasc[num + '|' + f0]; dmRedesenhar(num, true); return; }
  if (a === 'impacto') { delete S.msgs[num]; CC.enviar('impacto', { num: num }, { mod: 'dem', num: num, tipo: 'impacto', rotulo: ROT_FORM.impacto }); dmRedesenhar(num); return; }
  if (a === 'cobrar') { enviarCobrar(num, v); return; }
  if (a === 'enviar') { dmEnviar(num); return; }
  if (a === 'copiar') { var mm = S.msgs[num]; if (mm && mm.texto) CC.copiar(mm.texto).then(function (ok) { mm.copiado = ok || mm.copiado; dmRedesenhar(num); CC.toast(ok ? 'Copiado.' : 'Não deu para copiar: segure o texto e copie.'); }); return; }
  if (a === 'fechar-msg') { delete S.msgs[num]; dmRedesenhar(num); return; }
  var f = S.forms[num], st = f && rascDe(num, f), root = card.querySelector('.cc-dem-form');
  if (!st) return;
  if (partilhadoClique(root, S.L, st, b)) { erroForm(num, ''); return; }
  var campo = b.getAttribute('data-campo');
  if (campo === 'resolver') { st.resolver = v === 'sim'; CC.chipMarcar(b); return; }
  if (campo === 'nova_r') { st.nova_data = v; CC.chipMarcar(b); var i = root.querySelector('[data-campo="nova_data"]'); if (i) i.value = v; return; }
}
function dmInput(e) {
  if (!S || e.target.closest('[data-cc-fn]')) return;
  var t = e.target, campo = t.getAttribute && t.getAttribute('data-campo'), card = t.closest && t.closest('article[data-num]');
  if (!campo || !card) return;
  var num = +card.getAttribute('data-num'), f = S.forms[num], st = f && rascDe(num, f);
  if (!st || st[campo] === t.value) return;
  st[campo] = t.value;
  var root = card.querySelector('.cc-dem-form');
  if (campo === 'busca') pkPinta(root, S.L, st, true);
  if (campo === 'resp_outro') respMarcar(root, S.L, st);
  if (campo === 'nova_data') [].forEach.call(root.querySelectorAll('[data-campo="nova_r"]'), function (x) { x.setAttribute('aria-pressed', x.getAttribute('data-v') === t.value ? 'true' : 'false'); });
}
function dmFoco(e) { var t = e.target; if (t && t.matches && t.matches('.cc-cob textarea')) { try { t.select(); } catch (er) { /* ok */ } } }

// aplica no cartão o que o servidor gravou (sem reler o taf_ciclo_ler inteiro)
function dmAplicar(it, r) {
  if (!S || !it || !it.meta || it.meta.mod !== 'dem') return;
  if (S.aplic[it.uid]) return;
  S.aplic[it.uid] = 1;
  r = r || {};
  var dd = it.dados || {}, L = S.L, nome = r.quem || (L.ator && L.ator.nome) || '', num = +(dd.num || r.num), d = achar(num);
  if (it.acao === 'demanda' && !dd.num) {
    if (!num) return;
    if (!d) {
      var ar = areaDe(L, dd.area);
      d = { num: num, area: dd.area, oque: dd.oque, resp: dd.resp || (ar && ar.dono) || '', pede_decisao: !!dd.pede_decisao,
        decisores: dd.decisores || [], contraparte: dd.contraparte || null, prazo: dd.prazo,
        nova_data: dd.nova_data && dd.nova_data !== dd.prazo ? dd.nova_data : null, ativs: uniq(dd.ativs || []).sort(), sem_ativ: !!dd.sem_ativ,
        item: dd.item || null, situacao: 'aberta', resposta: null, origem: dd.origem || 'manual', origem_ref: dd.origem_ref || null,
        ref_ext: dd.ref_ext || null, tarefa_id: dd.tarefa_id || null, cenario: dd.cenario || null, impacto: null, cobrancas: [],
        criada_por: nome, criada_em: CC.agora(), em: CC.agora(), quem: nome, area_rotulo: ar && ar.rotulo, diverge: null, tarefa: null };
      // em aproximado (hora do servidor ao receber a resposta): a próxima edição deste cartão já leva em_lido
      d.vezes = d.nova_data ? 1 : 0;
      DM.recalcular(L, d);
      (L.demandas = L.demandas || []).push(d);
      S.novos[num] = 1;
      var lista = S.el.querySelector('.cc-dem-lista');
      if (lista) { var vz = lista.querySelector('.cc-vazio'); if (vz) vz.remove(); lista.insertAdjacentHTML('afterbegin', dmCard(d)); }
    }
    CC.toast('D' + num + ' criada.');
  } else if (d) {
    if (it.acao === 'demanda') {
      if ('resp' in dd && dd.resp) d.resp = dd.resp;
      if ('decisores' in dd) d.decisores = (dd.decisores || []).slice();
      if ('pede_decisao' in dd) d.pede_decisao = !!dd.pede_decisao;
      if ('contraparte' in dd) d.contraparte = String(dd.contraparte || '').trim() || null;
      if ('ativs' in dd) d.ativs = uniq(dd.ativs).sort();
      if ('sem_ativ' in dd) d.sem_ativ = !!dd.sem_ativ;
      if ('ref_ext' in dd) d.ref_ext = String(dd.ref_ext || '').trim() || null;
      if ('tarefa_id' in dd) { d.tarefa_id = dd.tarefa_id || null; d.diverge = null; d.tarefa = null; }
      if ('nova_data' in dd && dd.nova_data !== d.nova_data) { d.nova_data = dd.nova_data; d.vezes = (d.vezes || 0) + 1; }
      if (dd.situacao) { d.situacao = dd.situacao; if (dd.situacao === 'aberta') { d.resolvida_em = null; d.resolvida_por = null; } }
      CC.toast('D' + num + ': ' + (ROT_FORM[it.meta.tipo] || 'mudança') + ' gravada.');
    } else if (it.acao === 'demanda_resp') {
      var res = !!dd.resolver;
      d.situacao = res ? 'resolvida' : 'respondida';
      d.resposta = String(dd.resposta || '').trim().slice(0, 1000);
      d.respondida_por = nome; d.respondida_em = CC.agora();
      d.resolvida_em = res ? (dd.resolvida_em || CC.hoje()) : null; d.resolvida_por = res ? nome : null;
      CC.toast('D' + num + ': resposta gravada.');
    } else if (it.acao === 'cobrar') {
      d.cobrancas = d.cobrancas || [];
      if (!r.cobrancas || d.cobrancas.length < r.cobrancas) d.cobrancas.push({ em: CC.agora(), quem: nome, canal: dd.canal || 'whatsapp' });
      if (r.texto) S.msgs[num] = { t: 'cobranca', texto: r.texto, copiado: false };
    } else if (it.acao === 'impacto') {
      if (r.impacto) d.impacto = r.impacto;
      CC.toast('D' + num + ': impacto recalculado.');
    }
    DM.recalcular(L, d);
    dmRedesenhar(num);
  }
  dmTopoAtualiza();
  if (typeof S.o.onMudou === 'function') { try { S.o.onMudou(it.acao, r, d); } catch (er) { setTimeout(function () { throw er; }, 0); } }
}
function dmRecusa(it, motivo) {
  if (!S || !it || !it.meta || it.meta.mod !== 'dem') return;
  if (it.meta.nova) {
    S.novasRec = S.novasRec.filter(function (x) { return x.uid !== it.uid; });
    S.novasRec.push({ uid: it.uid, motivo: motivo, dados: it.dados, rasc: it.meta.rasc });
    dmMsgs();
    return;
  }
  var num = +it.meta.num;
  S.msgs[num] = { t: 'recusa', motivo: motivo, uid: it.uid, form: it.meta.tipo, rasc: it.meta.rasc };
  dmRedesenhar(num);
  if (CC.mudouDepois(motivo)) reler();
}
function recusasGuardadas() {      // recusas de antes de recarregar a página
  CC.recusas().forEach(function (r) {
    if (!r.meta || r.meta.mod !== 'dem') return;
    if (r.meta.nova) { if (!S.novasRec.some(function (x) { return x.uid === r.uid; })) S.novasRec.push({ uid: r.uid, motivo: r.motivo, dados: r.dados, rasc: r.meta.rasc }); }
    else if (!S.msgs[+r.meta.num]) S.msgs[+r.meta.num] = { t: 'recusa', motivo: r.motivo, uid: r.uid, form: r.meta.tipo, rasc: r.meta.rasc };
  });
}
// CC.demandas.render(container, ler, opts): desenha a aba Demandas. Chamar de novo com outro ler redesenha tudo.
DM.render = function (el, L, o) {
  if (!el) return null;
  if (!S || S.el !== el) {
    if (S) DM.destruir();
    S = { el: el, rasc: {}, forms: {}, msgs: {}, mais: {}, novos: {}, aplic: {}, snap: {}, novasRec: [], fn: null, novaAberta: false, novaSt: null,
      filtro: CC.ls.get(FILTRO_KEY) || 'abertas', des: [] };
    el.addEventListener('click', dmClick);
    el.addEventListener('input', dmInput);
    el.addEventListener('change', dmInput);
    el.addEventListener('focusin', dmFoco);
    S.des.push(CC.ouvir('ok', dmAplicar), CC.ouvir('recusa', dmRecusa), CC.ouvir('fila', dmMsgs));
    if (o && o.filtro) S.filtro = o.filtro;
  }
  if (FILTROS.every(function (f) { return f.v !== S.filtro; })) S.filtro = 'abertas';
  S.L = L || { demandas: [] };
  S.o = o || {};
  recusasGuardadas();
  dmDesenhar();
  return DM;
};
// CC.demandas.atualizar(ler): depois de reler; redesenha só os cartões que mudaram (ou a lista, se mudou quem aparece)
DM.atualizar = function (L) {
  if (!S || !L) return;
  S.L = L;
  var dom = [].map.call(S.el.querySelectorAll('.cc-dem-lista article[data-num]'), function (x) { return x.getAttribute('data-num'); }).join(',');
  var novo = filtrar(S.filtro).map(function (d) { return String(d.num); });
  if (S.filtro === 'area') { var ord = ((L.areas || []).map(function (a) { return a.area; })); var fl = filtrar('area'); novo = []; ord.forEach(function (a) { fl.forEach(function (d) { if (d.area === a) novo.push(String(d.num)); }); }); }
  if (dom !== novo.join(',')) { dmDesenhar(); return; }
  (L.demandas || []).forEach(function (d) { if (S.snap[d.num] !== JSON.stringify(d)) dmRedesenhar(d.num); });
  dmTopoAtualiza();
};
DM.abrirNova = function (preset) { if (S) abrirNova(preset || {}); };
DM.filtro = function (f) { if (S && f) { S.filtro = f; CC.ls.set(FILTRO_KEY, f); dmDesenhar(); } return S ? S.filtro : null; };
DM.contagens = function () { return S ? contagens() : null; };
// true se há formulário aberto com texto digitado ou foco num campo do módulo (não reler agora)
DM.digitando = function () {
  if (!S) return false;
  if (CC.digitando(S.el)) return true;
  if (S.novaAberta && S.novaSt && (String(S.novaSt.oque || '').trim() || String(S.novaSt.resp_outro || '').trim())) return true;
  return Object.keys(S.forms).some(function (n) {
    var f = S.forms[n], st = f && rascDe(n, f);
    return !!st && ['resposta', 'motivo', 'contraparte', 'ref_ext', 'resp_outro', 'busca'].some(function (k) { return st[k] && String(st[k]).trim() && (f !== 'editar' || k === 'resp_outro' || k === 'busca'); });
  });
};
DM.destruir = function () {
  if (!S) return;
  S.el.removeEventListener('click', dmClick); S.el.removeEventListener('input', dmInput);
  S.el.removeEventListener('change', dmInput); S.el.removeEventListener('focusin', dmFoco);
  S.des.forEach(function (f) { f(); });
  if (S.fn) S.fn.fechar();
  S = null;
};
}(window, document));
