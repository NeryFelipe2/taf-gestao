/* ciclo-erp.js · "Compras e custo" nas telas do /marko e do /ciclo, ligadas ao /erp pelos vínculos reais.
   Entra logo depois do ciclo-core.js (marko.py e ciclo.py juntam os dois no marcador CICLOCORE). Define CC.erp.
   Regras deste módulo:
   - só LÊ o ERP (taf_erp_resumo, pela mesma chave e pelo mesmo nome da página); não grava nada e não copia valor: o número mostrado é o do ERP;
   - quem liga a tarefa à compra é o /erp (link "Abrir no ERP", que leva a mesma tarefa e a mesma demanda);
   - pedido emitido NÃO prova material no canteiro: o selo vem de "canteiro" (recebimento do pedido), nunca do pedido;
   - se o ERP não responde, a tela do ciclo continua igual (mostra uma linha cinza, sem travar nada).
   Marcadores de DOM que as páginas colocam (o módulo preenche e repreenche sozinho quando a tela se refaz):
     <div data-cc-erp-ativ="T18"></div>                      bloco da tarefa (data-vazio="1" mostra "sem compra ligada"; data-demanda="3" filtra; data-link-demanda="3" só põe a demanda no link do ERP)
     <div data-cc-erp-dem="3" data-ativs="T18,T19" data-elig="1" data-aberta="1"></div>   linha da demanda (feito pelo próprio cartão de demanda)
   Nunca escrever a sequência que fecha a tag script nem a que abre comentário HTML. */
(function (W, D) {
'use strict';
var CC = W.CC;
if (!CC || !CC.rpcErp) return;
var E = CC.erp = {};
var esc = CC.esc;

var TTL = 25000;                  // um valor lido vale 25 s; depois a tela pede de novo
var MAX = 150;                    // tarefas por chamada (o servidor aceita até 200)
var cache = {};                   // ativ -> {t, linhas:[...]}
var erro = null;                  // {msg, rede, ate}
var voo = null;                   // promessa em andamento
var agendado = null;
var ultimo = null;                // ISO da última leitura boa
var det = {};                     // ativ -> {aberto, carregando, t, d, erro}: cadeia até o BM (taf_erp_rastro), só quando a pessoa abre

// ---------------------------------------------------------------- texto
E.CANTEIRO = {
  sem_pedido: ['sem pedido', 'mu'],
  aguarda_aprovacao: ['pedido aguarda aprovação', 'cf'],
  pedido_emitido: ['pedido emitido: material ainda não chegou', 'cf'],
  recebido_parcial: ['chegou parte do material', 'pe'],
  recebido: ['material recebido', 'ok'],
  solicitacao_nao_encontrada: ['solicitação não encontrada', 'ne']
};
E.SOLICITACAO = { enviada: 'solicitação enviada', em_cotacao: 'em cotação', atendida: 'atendida', cancelada: 'cancelada' };
function brl(v) { return v == null || v === '' || isNaN(+v) ? '' : 'R$ ' + (+v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// link para o ERP na mesma obra, tarefa e demanda (os identificadores seguem os mesmos nas três telas)
E.url = function (ativ, demanda) {
  var q = ['obra=' + encodeURIComponent(CC.OBRA), 'tarefa=' + encodeURIComponent(ativ), 'de=' + (/\/marko/.test(W.location.pathname) ? 'marko' : 'ciclo')];
  if (demanda) q.push('demanda=' + encodeURIComponent(demanda));
  return '/erp?' + q.join('&');
};

function linhaHtml(l) {
  var ca = E.CANTEIRO[l.canteiro] || [l.canteiro || '?', 'mu'];
  var sel = CC.selo(l.canteiro === 'sem_pedido' && l.solicitacao && E.SOLICITACAO[l.solicitacao] ? E.SOLICITACAO[l.solicitacao] : ca[0], ca[1]);
  var h = '<div class="cc-erp-lin" data-erp-sol="' + esc(l.sol || '') + '" data-erp-canteiro="' + esc(l.canteiro || '') + '">' +
    '<b class="cc-erp-id">' + esc(l.sol || '?') + '</b>' +
    (l.item ? '<span class="cc-cinza">item ' + esc(l.item) + (l.evento ? ' · evento ' + esc(l.evento) : '') + '</span>' : '<span class="cc-cinza">item fora da planilha</span>') +
    sel;
  if (l.pedido) h += '<span class="cc-erp-ped">pedido <b>' + esc(l.pedido) + '</b>' + (+l.pedido_valor > 0 ? ' ' + esc(brl(l.pedido_valor)) : '') + '</span>';
  if (+l.nota_valor > 0) h += '<span class="cc-erp-nf">custo lançado (nota) <b>' + esc(brl(l.nota_valor)) + '</b></span>';
  if (l.demanda) h += '<span class="cc-cinza">demanda D' + esc(l.demanda) + '</span>';
  return h + '</div>';
}

function hora() { return ultimo ? CC.hm(ultimo) : ''; }
function rodape() {
  return ultimo ? '<span class="cc-cinza cc-erp-lido">ERP lido às ' + esc(hora()) + '</span>' : '';
}

// cadeia até o BM (mesmos números do /erp: vem de taf_erp_rastro, nada é recalculado aqui)
function detHtml(ativ) {
  var x = det[ativ];
  if (!x || !x.aberto) return '';
  if (x.carregando && !x.d) return '<div class="cc-erp-det cc-cinza">Carregando a cadeia no ERP…</div>';
  if (x.erro && !x.d) return '<div class="cc-erp-det cc-cinza">' + esc(x.erro) + '</div>';
  var d = x.d || {}, evs = d.eventos || [], comp = d.compras || [];
  var comCompra = {};
  comp.forEach(function (c) { if (c.item && c.item.evento) comCompra[c.item.evento] = 1; });
  var ord = evs.slice().sort(function (a, b) {
    var pa = comCompra[a.evento] ? 0 : a.via === 'propria' ? 1 : 2, pb = comCompra[b.evento] ? 0 : b.via === 'propria' ? 1 : 2;
    return pa - pb || String(a.previsto_fim).localeCompare(String(b.previsto_fim));
  });
  var mostra = ord.slice(0, 3), h = '<div class="cc-erp-det" data-erp-det-aberto="' + esc(ativ) + '">';
  if (!evs.length) h += '<div class="cc-cinza">Pelas dependências conhecidas, esta tarefa não leva a nenhum evento de medição.</div>';
  mostra.forEach(function (e) {
    var m = e.medicao || {};
    h += '<div class="cc-erp-ev" data-erp-evento="' + esc(e.evento) + '"><div><b>Evento ' + esc(e.evento) + '</b> <span class="cc-cinza">' +
      esc(String(e.ativ_nome || '').replace(/^EVENTO [\d.]+ - /, '')) + ' · ' + (e.via === 'propria' ? 'é esta tarefa' : 'via ' + esc(e.ativ)) +
      (comCompra[e.evento] ? ' · <b>tem compra ligada</b>' : '') + ' · BM previsto ' + esc(e.bm_previsto || 'não informado') + ' (fim ' + esc(CC.d(e.previsto_fim)) + ')</span></div>' +
      '<div class="cc-cinza">Receita contratual ' + esc(brl(e.receita_contratual)) + ' · meta de custo ' + esc(brl(e.meta_custo)) + ' · cotado em aberto ' + esc(brl(e.cotado_aberto)) +
      ' · comprometido ' + esc(brl(e.comprometido)) + ' · realizado (nota) ' + esc(brl(e.realizado)) + '</div>' +
      '<div class="cc-cinza">Medição: lançada ' + esc(brl(m.lancada)) + ' · atestada ' + esc(brl(m.atestada)) + ' · em boletim ' + esc(brl(m.em_boletim)) +
      ' · aprovada pelo cliente ' + esc(brl(m.aprovada_cliente)) + ' · faturada ' + esc(brl(m.faturada)) + ' · recebida ' + esc(brl(m.recebida)) + '</div></div>';
  });
  if (ord.length > mostra.length) h += '<div class="cc-cinza">Mais ' + (ord.length - mostra.length) + ' evento(s) no ERP.</div>';
  (d.avisos || []).forEach(function (a) { h += '<div class="cc-cinza">Atenção: ' + esc(a) + '</div>'; });
  h += '<div class="cc-cinza">Pedido emitido não prova material no canteiro. Comprometido (pedido sem nota) e realizado (nota) nunca se somam para o mesmo valor. Receita e meta não são dinheiro recebido.</div>';
  return h + '</div>';
}
E.detalhe = function (ativ, abrir) {
  var x = det[ativ] || (det[ativ] = {});
  x.aberto = abrir == null ? !x.aberto : !!abrir;
  if (!x.aberto) { pintar(); return Promise.resolve(); }
  x.carregando = true; x.erro = null; pintar();
  return CC.rpcErp('taf_erp_rastro', { p_ativ: ativ }, { timeout: 20000 }).then(function (d) {
    x.d = d; x.t = Date.now(); x.carregando = false; pintar();
  }, function (e) {
    x.carregando = false; x.erro = e && e.rede ? 'Sem resposta do ERP agora.' : 'O ERP não liberou a leitura para esta chave.'; pintar();
  });
};

// bloco da tarefa
function htmlAtiv(el) {
  var ativ = el.getAttribute('data-cc-erp-ativ'), dem = el.getAttribute('data-demanda') || '';
  var ldem = dem || el.getAttribute('data-link-demanda') || '';   // data-demanda filtra as linhas; data-link-demanda só leva a demanda no link do ERP
  var c = cache[ativ];
  if (!c) return erro && el.getAttribute('data-vazio') === '1' ? msgErro() : '';
  var ls = c.linhas.filter(function (l) { return !dem || String(l.demanda) === String(dem); });
  if (!ls.length && el.getAttribute('data-vazio') !== '1') return '';
  var h = '<div class="cc-erp-t">Compras e custo</div>';
  if (ls.length) h += ls.map(linhaHtml).join('');
  else h += '<div class="cc-erp-lin cc-mu" data-erp-vazio="1">Nenhuma compra ligada a esta tarefa' + (dem ? ' para a demanda D' + esc(dem) : '') + '.</div>';
  h += '<div class="cc-acts"><a class="cc-btn" data-erp-abrir="' + esc(ativ) + '" href="' + esc(E.url(ativ, ldem)) + '" target="_blank" rel="noopener">' +
    (ls.length ? 'Abrir no ERP' : 'Ligar a compra no ERP') + '</a>' + (ls.length ? btnDet(ativ) : '') + rodape() + '</div>' + detHtml(ativ);
  return h;
}
function btnDet(ativ) {
  var ab = det[ativ] && det[ativ].aberto;
  return '<button type="button" class="cc-btn" data-erp-det="' + esc(ativ) + '" aria-expanded="' + (ab ? 'true' : 'false') + '">' + (ab ? 'Esconder a cadeia até o BM' : 'Ver a cadeia até o BM') + '</button>';
}

// linha da demanda
function htmlDem(el) {
  var num = el.getAttribute('data-cc-erp-dem'), ativs = (el.getAttribute('data-ativs') || '').split(',').filter(Boolean);
  var elig = el.getAttribute('data-elig') === '1', aberta = el.getAttribute('data-aberta') === '1';
  if (!ativs.length) return '';
  var ls = [], todas = true;
  ativs.forEach(function (a) {
    var c = cache[a];
    if (!c) { todas = false; return; }
    c.linhas.forEach(function (l) { if (String(l.demanda) === String(num)) ls.push(l); });
  });
  if (!todas && !ls.length) return erro && elig ? msgErro() : '';
  if (!ls.length && !(elig && aberta)) return '';
  var h = '<div class="cc-erp-t">Compra no ERP</div>';
  if (ls.length) h += ls.map(linhaHtml).join('');
  else h += '<div class="cc-erp-lin cc-mu" data-erp-vazio="1">Ainda sem compra ligada a esta demanda.</div>';
  var alvo = ls.length ? String(ls[0].ativ || ativs[0]) : ativs[0];
  h += '<div class="cc-acts"><a class="cc-btn" data-erp-abrir="' + esc(alvo) + '" href="' + esc(E.url(alvo, num)) + '" target="_blank" rel="noopener">' +
    (ls.length ? 'Abrir no ERP' : 'Ligar a compra no ERP') + '</a>' + (ls.length ? btnDet(alvo) : '') + rodape() + '</div>' + detHtml(alvo);
  return h;
}

function msgErro() {
  return '<div class="cc-erp-t">Compras e custo</div><div class="cc-cinza">' + (erro && erro.rede ? 'Sem resposta do ERP agora.' : 'O ERP não liberou a leitura para esta chave.') + '</div>';
}

// ---------------------------------------------------------------- leitura
function marcadores() { return [].slice.call(D.querySelectorAll('[data-cc-erp-ativ],[data-cc-erp-dem]')); }
function idsDe(els) {
  var o = [];
  els.forEach(function (el) {
    var l = el.hasAttribute('data-cc-erp-ativ') ? [el.getAttribute('data-cc-erp-ativ')] : (el.getAttribute('data-ativs') || '').split(',');
    l.forEach(function (a) { if (a && /^T\d{1,4}$/.test(a) && o.indexOf(a) < 0) o.push(a); });
  });
  return o;
}
function pedir(ids, forcar) {
  var agora = Date.now();
  var falta = ids.filter(function (a) { return forcar || !cache[a] || agora - cache[a].t > TTL; });
  if (!falta.length) return Promise.resolve(false);
  if (erro && erro.ate > agora && !forcar) return Promise.resolve(false);
  var lotes = [];
  for (var i = 0; i < falta.length; i += MAX) lotes.push(falta.slice(i, i + MAX));
  return Promise.all(lotes.map(function (lote) {
    return CC.rpcErp('taf_erp_resumo', { p_ativs: lote }, { timeout: 20000 }).then(function (m) {
      m = m || {};
      var t = Date.now();
      lote.forEach(function (a) { cache[a] = { t: t, linhas: (m[a] || []).map(function (l) { return Object.assign({ ativ: a }, l); }) }; });
      ultimo = new Date(t).toISOString();
      erro = null;
    });
  })).then(function () { return true; }, function (e) {
    erro = { msg: e && e.message, rede: !!(e && e.rede), ate: Date.now() + 30000 };
    return true;
  });
}
function pintar() {
  var a = marcadores();
  a.forEach(function (el) {
    var h = el.hasAttribute('data-cc-erp-ativ') ? htmlAtiv(el) : htmlDem(el);
    el.className = (el.className || '').replace(/\bcc-erp\b/g, '').trim() + (h ? ' cc-erp' : '');
    if (el.__cch !== h) { el.__cch = h; el.innerHTML = h; }
  });
}
function varrer(forcar) {
  var els = marcadores();
  if (!els.length) return Promise.resolve();
  var ids = idsDe(els);
  pintar();                                   // pinta já o que está no cache
  if (voo) return voo;
  voo = pedir(ids, forcar).then(function (mudou) {
    voo = null; if (mudou) { pintar(); reabrirDet(); }
    // apareceu marcador novo enquanto a leitura andava: vai de novo (não repete se deu erro, pois o erro segura por 30 s)
    if (idsDe(marcadores()).some(function (a) { return !cache[a]; }) && !(erro && erro.ate > Date.now())) agendar();
  }, function () { voo = null; });
  return voo;
}
function reabrirDet() {     // detalhe aberto: lê de novo junto com o resumo (valores novos sem a pessoa precisar fechar e abrir)
  Object.keys(det).forEach(function (a) {
    var x = det[a];
    if (x.aberto && !x.carregando && (!x.t || Date.now() - x.t > TTL)) E.detalhe(a, true);
  });
}
function agendar() {
  if (agendado) return;
  agendado = setTimeout(function () { agendado = null; varrer(false); }, 120);
}

// Lê de novo agora (depois de ligar algo no ERP, por exemplo). Devolve a promessa da releitura.
E.atualizar = function () {
  erro = null;
  var go = function () { return varrer(true); };
  return voo ? voo.then(go) : go();
};
E.estado = function () {
  var o = {};
  Object.keys(cache).forEach(function (a) { o[a] = cache[a].linhas.slice(); });
  return { tarefas: o, lido_em: ultimo, erro: erro ? erro.msg || 'erro' : null };
};
E.limpar = function () { cache = {}; ultimo = null; erro = null; };

// ---------------------------------------------------------------- estilo e gatilhos
var CSS = [
  '.cc-erp{margin-top:8px;padding:8px 10px;border:1px solid var(--line2,rgba(15,23,42,.14));border-radius:8px;background:var(--raised,#EEF1F6);font-size:13.5px;min-width:0}',
  '.cc-erp-t{font-size:11.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--mu2,#6B7280)}',
  '.cc-erp-lin{margin-top:5px;display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;line-height:1.4}',
  '.cc-erp-id{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;color:var(--hd,#0F172A)}',
  '.cc-erp .cc-acts{align-items:center;margin-top:6px}',
  '.cc-erp-det{margin-top:8px;padding-top:8px;border-top:1px dashed var(--line2,rgba(15,23,42,.18))}',
  '.cc-erp-ev{margin:0 0 8px}',
  '.cc-erp a.cc-btn{text-decoration:none;min-height:36px;padding:5px 12px}'
].join('\n');
function estilo() {
  if (!D.head || D.getElementById('cc-erp-css')) return;
  var s = D.createElement('style');
  s.id = 'cc-erp-css'; s.textContent = CSS;
  D.head.appendChild(s);
}
function iniciar() {
  estilo();
  var obs = new W.MutationObserver(function (ms) {
    // ignora o que este módulo mesmo escreveu (só dentro dos marcadores)
    var ext = ms.some(function (m) {
      var n = m.target && m.target.nodeType === 1 ? m.target : m.target && m.target.parentElement;
      return !(n && n.closest && n.closest('[data-cc-erp-ativ],[data-cc-erp-dem]'));
    });
    if (ext) agendar();
  });
  obs.observe(D.body, { childList: true, subtree: true });
  D.addEventListener('click', function (ev) {
    var b = ev.target && ev.target.closest ? ev.target.closest('[data-erp-det]') : null;
    if (b) { ev.preventDefault(); E.detalhe(b.getAttribute('data-erp-det')); }
  });
  D.addEventListener('visibilitychange', function () { if (D.visibilityState === 'visible') varrer(true); });
  W.addEventListener('focus', function () { varrer(false); });
  setInterval(function () { if (D.visibilityState === 'visible') varrer(false); }, 30000);
  CC.ouvir('ler', function () { agendar(); });
  agendar();
}
if (D.body) iniciar(); else D.addEventListener('DOMContentLoaded', iniciar);
})(window, document);
