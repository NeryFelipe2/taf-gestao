/* ciclo-ia.js · assistente (IA) nas telas do /marko (relato do WhatsApp) e do /ciclo (pergunta sobre a obra).
   Entra depois do ciclo-erp.js (marko.py e ciclo.py juntam no marcador CICLOCORE). Define CC.ia. Chama /api/assistente por
   CC.assistente (ciclo-core.js), que leva a chave só no cabeçalho.
   Regras deste módulo:
   - a IA só PROPÕE. A pessoa confere, corrige e marca; a gravação é da página, pela fila de sempre (no /marko a mesma do
     apontamento à mão: enviar('apont') -> CC.enviar -> taf_ciclo_salvar). Aqui nada grava;
   - o texto colado, a pergunta e a resposta ficam só na memória da tela (nem no aparelho, nem no banco);
   - todo texto que vem do servidor ou da IA passa por CC.esc.
   API: CC.ia.painelRelato(host, {ler, hoje, gravar}) e CC.ia.painelPergunta(host, {papel}) devolvem {fechar, digitando};
        CC.ia.diasPermitidos, CC.ia.conferir, CC.ia.dados e CC.ia.erroTexto são puros (testes em testes/assistente-tela.test.js).
   Nunca escrever a sequência que fecha a tag script nem a que abre comentário HTML. */
(function (W, D) {
'use strict';
var CC = W.CC;
if (!CC || !CC.assistente) return;
var IA = CC.ia = {};
var esc = CC.esc;
var SIT = [{ v: 'andou', r: 'Andou' }, { v: 'parado', r: 'Parado' }, { v: 'entregue', r: 'Entregue' }];
var CONF = { alta: ['confiança alta', 'ok'], media: ['confiança média', 'cf'], baixa: ['confiança baixa', 'ne'] };
var MAX_RELATO = 20000, MIN_RELATO = 10, MAX_PERGUNTA = 500, MAX_OBS = 300;
var PAPEIS_PERGUNTA = ['engenheiro', 'gestor', 'diretoria'];

// ===================================================================== regras (puras)
function apDe(c, dia) { var l = (c && c.apont) || []; for (var i = 0; i < l.length; i++) if (l[i].dia === dia) return l[i]; return null; }
function compDe(L, cid) { var l = (L && L.semana && L.semana.comps) || []; for (var i = 0; i < l.length; i++) if (l[i].cid === cid) return l[i]; return null; }
function aberto(c) { return !!c && !c.cancelado_em && !c.resultado; }
function titulo(c) { return c.ativ ? c.ativ + ' ' + CC.curto(c.ativ_nome || '', 60) : CC.curto(c.titulo || '', 70) + (c.frente ? ' (' + c.frente + ')' : ''); }
function ehCausa(v) { return CC.CAUSAS.some(function (x) { return x.v === v; }); }
function vazio(v) { return v == null || String(v).trim() === ''; }

// dias da semana em foco que ainda dá para apontar (o banco recusa dia futuro)
IA.diasPermitidos = function (L, hoje) {
  var r = [], seg = L && L.seg;
  if (!CC.ehData(seg)) return r;
  for (var i = 0; i < 7; i++) { var d = CC.mais(seg, i); if (!hoje || d <= hoje) r.push(d); }
  return r;
};
// '' se a proposta (já editada) pode ir para a fila; senão o que corrigir. Mesmas regras do banco (_taf_ciclo_a_apont).
IA.conferir = function (p, L, hoje) {
  var S = (L && L.semana) || {}, c = compDe(L, p && p.cid);
  if (!p || !c) return 'Compromisso não existe nesta semana.';
  if (S.estado !== 'publicada') return 'A semana não está publicada e aberta.';
  if (!aberto(c)) return c.cancelado_em ? 'Compromisso cancelado.' : 'Compromisso já fechado.';
  if (IA.diasPermitidos(L, hoje).indexOf(p.dia) < 0) return 'Escolha um dia desta semana, até hoje.';
  if (!SIT.some(function (s) { return s.v === p.situacao; })) return 'Escolha a situação.';
  if (p.situacao === 'parado' && !ehCausa(p.causa)) return 'Parado precisa da causa.';
  if (!vazio(p.qtd) && p.situacao !== 'parado' && c.un) {
    var q = Number(String(p.qtd).replace(',', '.'));
    if (!isFinite(q) || q < 0 || q >= 1e11) return 'Quantidade inválida (número, zero ou mais).';
  }
  if (String(p.obs || '').length > MAX_OBS) return 'Nota com mais de ' + MAX_OBS + ' letras.';
  return '';
};
// dados da ação 'apont' de taf_ciclo_salvar, como o apontamento à mão (hjEnviar do /marko): o que a proposta não traz
// (quantidade, nota, link, demanda) fica como estava no dia; em_lido protege contra gravar por cima de outra pessoa.
IA.dados = function (p, c, seg) {
  var ap = apDe(c, p.dia) || {};
  var d = { seg: seg, cid: c.cid, dia: p.dia, situacao: p.situacao };
  if (p.situacao !== 'parado' && c.un) {
    var q = vazio(p.qtd) ? ap.qtd : Number(String(p.qtd).replace(',', '.'));
    if (q != null && q !== '' && isFinite(+q)) d.qtd = Math.round(+q * 1000) / 1000;
  }
  if (p.situacao === 'parado') { d.causa = p.causa; if (ap.causa === p.causa && ap.causa_det) d.causa_det = ap.causa_det; }
  var obs = vazio(p.obs) ? ap.obs : String(p.obs).trim();
  if (obs) d.obs = String(obs).slice(0, MAX_OBS);
  if (ap.link) d.link = ap.link;
  if (ap.demanda) d.demanda = ap.demanda;
  if (ap.em) d.em_lido = ap.em;
  return d;
};
IA.erroTexto = function (e) {
  if (!e) return '';
  if (e.rede) return e.tempo ? 'O assistente demorou demais. Tente de novo; se o relato for longo, cole um dia por vez.' :
    'Sem sinal: o assistente precisa de internet. Tente de novo quando o sinal voltar.';
  return String(e.message || 'O assistente não respondeu.');
};

// ===================================================================== estilo (prefixo cc-ia-, cores da página)
var CSS = [
  '.cc-ia-prop{border:1px solid var(--line2,rgba(15,23,42,.14));border-radius:10px;padding:10px 12px;margin-top:10px;min-width:0}',
  '.cc-ia-prop.cc-ia-off{border-style:dashed}',
  '.cc-ia-prop.cc-ia-off .cc-ia-grade{opacity:.7}',
  '.cc-ia-grade{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:10px 14px;margin-top:8px}',
  '.cc-ia-campos{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;min-width:0}',
  '.cc-ia-campos label{display:block;min-width:0}',
  '.cc-ia-largo{grid-column:1/-1}',
  '.cc-ia-trecho{margin:0;padding:8px 10px;border-left:3px solid var(--ac,#0F766E);background:var(--raised,#EEF1F6);border-radius:0 8px 8px 0;font-size:13.5px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}',
  '.cc-ia-marca{display:inline-flex;align-items:center;gap:8px;min-height:44px;cursor:pointer;font-weight:600;color:var(--hd,#0F172A)}',
  '.cc-ia-marca input{width:22px;height:22px;margin:0;accent-color:var(--ac,#0F766E)}',
  '.cc-ia-cid{font-weight:700;color:var(--hd,#0F172A)}',
  '.cc-ia-sec{margin-top:14px;padding-top:10px;border-top:1px dashed var(--line2,rgba(15,23,42,.18))}',
  '.cc-ia-lista{margin:6px 0 0;padding-left:18px;font-size:13.5px}',
  '.cc-ia-lista li{margin:4px 0;overflow-wrap:anywhere}',
  '.cc-ia-resp{white-space:pre-wrap;overflow-wrap:anywhere;font-size:14.5px;line-height:1.5;margin-top:4px}',
  '.cc-ia-qa{margin-top:12px;padding-top:10px;border-top:1px dashed var(--line2,rgba(15,23,42,.18))}',
  '.cc-ia-txt{min-height:150px!important;resize:vertical}',
  '@media (max-width:640px){.cc-ia-grade{grid-template-columns:1fr}}'
].join('\n');
function estilo() {
  if (!D.head || D.getElementById('cc-ia-css')) return;
  var s = D.createElement('style');
  s.id = 'cc-ia-css'; s.textContent = CSS;
  var cc = D.getElementById('cc-css');
  if (cc && cc.nextSibling) D.head.insertBefore(s, cc.nextSibling); else D.head.insertBefore(s, D.head.firstChild);
}
function botao(acao, txt, cls, dis) { return '<button type="button" class="cc-btn' + (cls ? ' ' + cls : '') + '" data-ia="' + acao + '"' + (dis ? ' disabled' : '') + '>' + esc(txt) + '</button>'; }
function opcoes(lista, sel) {
  return lista.map(function (o) { return '<option value="' + esc(o.v) + '"' + (String(o.v) === String(sel) ? ' selected' : '') + '>' + esc(o.r) + '</option>'; }).join('');
}
function erroBox(m) { return m ? '<div class="cc-recusa" role="alert">' + esc(m) + '</div>' : ''; }
function usoTxt(u) { return u && u.limite ? '<div class="cc-cinza">Uso da IA hoje com esta chave: ' + esc(u.usado) + ' de ' + esc(u.limite) + '.</div>' : ''; }
function contador(n, max) { return '<div class="cc-conta" data-ia-conta>' + esc(CC.num(n, 0) || '0') + ' de ' + esc(CC.num(max, 0)) + ' letras</div>'; }

// ===================================================================== /marko: relato do WhatsApp
// o: { ler(): leitura atual da semana (taf_ciclo_ler), hoje(): 'AAAA-MM-DD' do servidor,
//      gravar(lista [{p, c}], L): põe na fila pelo caminho do apontamento à mão e devolve quantos foram }
IA.painelRelato = function (host, o) {
  estilo();
  host.setAttribute('data-cc-fn', '1');
  var S = { aberto: false, texto: '', lendo: false, erro: '', res: null, props: [], enviados: 0, seq: 0 };
  function L() { return o.ler() || {}; }
  function hoje() { return (o.hoje && o.hoje()) || CC.hoje(); }
  function marcados() { return S.props.filter(function (p) { return p.marcado; }); }

  function htmlProp(p, i, Lx, dias) {
    var c = compDe(Lx, p.cid), ap = c ? apDe(c, p.dia) : null, cf = CONF[p.confianca] || CONF.baixa;
    var ds = dias.indexOf(p.dia) >= 0 ? dias : dias.concat([p.dia]);
    var h = '<div class="cc-ia-prop' + (p.marcado ? '' : ' cc-ia-off') + '" data-i="' + i + '">' +
      '<div class="cc-cab"><label class="cc-ia-marca"><input type="checkbox" data-ia-f="marcado" data-i="' + i + '"' + (p.marcado ? ' checked' : '') +
      ' aria-label="Gravar ' + esc(p.cid) + '"> Gravar</label><span class="cc-ia-cid">' + esc(p.cid) + '</span><span>' + esc(c ? titulo(c) : 'compromisso não encontrado') + '</span>' +
      CC.selo(cf[0], cf[1]) + (p.trecho_confere ? '' : CC.selo('trecho não achado no relato', 'ne')) + '</div>';
    if (c) h += '<div class="cc-cinza">' + esc(c.entrega || '') + (c.qtd != null ? ' · meta ' + esc(CC.num(c.qtd)) + ' ' + esc(c.un || '') : '') + ' · até ' + esc(CC.dd(c.prometido)) + '</div>';
    h += '<div class="cc-ia-grade"><div class="cc-ia-campos">' +
      '<label><span class="cc-rot">Dia</span><select class="cc-campo" data-ia-f="dia" data-i="' + i + '">' +
        opcoes(ds.map(function (d) { return { v: d, r: CC.dd(d) }; }), p.dia) + '</select></label>' +
      '<label><span class="cc-rot">Situação</span><select class="cc-campo" data-ia-f="situacao" data-i="' + i + '">' + opcoes(SIT, p.situacao) + '</select></label>';
    if (p.situacao === 'parado') {
      h += '<label><span class="cc-rot">Causa</span><select class="cc-campo" data-ia-f="causa" data-i="' + i + '">' +
        opcoes([{ v: '', r: 'Escolha a causa' }].concat(CC.CAUSAS), p.causa) + '</select></label>';
    } else if (c && c.un) {
      h += '<label><span class="cc-rot">' + esc(c.un) + ' no dia</span><input class="cc-campo" type="number" inputmode="decimal" step="any" min="0" data-ia-f="qtd" data-i="' + i +
        '" value="' + esc(p.qtd) + '" placeholder="não informado"></label>';
    }
    h += '<label class="cc-ia-largo"><span class="cc-rot">Nota <span class="cc-cinza">opcional, até ' + MAX_OBS + ' letras</span></span><input class="cc-campo" type="text" maxlength="' + MAX_OBS +
      '" data-ia-f="obs" data-i="' + i + '" value="' + esc(p.obs) + '"></label></div>' +
      '<div><span class="cc-rot">Do relato</span><blockquote class="cc-ia-trecho">' + esc(p.trecho || 'sem trecho') + '</blockquote></div></div>';
    if (ap) h += '<div class="cc-aviso">Já tem apontamento neste dia: ' + esc(CC.rot('situacao', ap.situacao)) + (ap.qtd != null ? ' ' + esc(CC.num(ap.qtd)) + ' ' + esc((c && c.un) || '') : '') +
      (ap.causa ? ' (' + esc(CC.rot('causa', ap.causa)) + ')' : '') + '. Gravar troca pelo que está aqui.</div>';
    if (p.erro) h += '<div class="cc-erro" role="alert">' + esc(p.erro) + '</div>';
    return h + '</div>';
  }
  function html() {
    var Lx = L(), h = '<div class="cc-cab"><span class="cc-tit">Relato do WhatsApp</span>' + CC.selo('IA', 'ac') + '</div>';
    if (!S.aberto) {
      h += '<div class="cc-lin cc-mu">Cole o relato do grupo da obra. A IA propõe os apontamentos da semana; você confere, corrige e grava.</div>' +
        '<div class="cc-acts">' + botao('abrir', 'Colar relato do WhatsApp', 'cc-pri') + '</div>';
      if (S.enviados) h += '<div class="mk-ok cc-lin">' + esc(S.enviados) + ' apontamento(s) enviados para gravar. Acompanhe nos cartões abaixo.</div>';
      return h;
    }
    h += '<div class="cc-form" style="border-top:0;padding-top:0">' +
      '<label><span class="cc-rot">Relato colado</span><textarea class="cc-campo cc-ia-txt" data-ia-f="texto" maxlength="' + MAX_RELATO + '" rows="8"' +
      ' placeholder="Cole aqui o texto do grupo (pode ser a conversa exportada do WhatsApp). Ex.: [27/10 17:20] choveu forte, parou a escavação."' +
      (S.lendo ? ' readonly' : '') + '>' + esc(S.texto) + '</textarea></label>' + contador(S.texto.length, MAX_RELATO) +
      '<div class="cc-cinza">O texto vai para a IA só para esta leitura e não fica guardado. Tire telefone e dado pessoal antes de colar.</div></div>' +
      '<div class="cc-acts">' + botao('ler', S.lendo ? 'Lendo…' : 'Ler com a IA', 'cc-cheio', S.lendo || S.texto.trim().length < MIN_RELATO) +
      botao('limpar', 'Limpar', '', S.lendo) + botao('fechar', 'Fechar', '', false) + '</div>';
    if (S.lendo) h += '<div class="cc-pend" role="status">Lendo o relato com a IA. Leva alguns segundos.</div>';
    h += erroBox(S.erro);
    if (S.enviados) h += '<div class="mk-ok cc-lin" role="status">' + esc(S.enviados) + ' apontamento(s) enviados para gravar. Acompanhe nos cartões abaixo.</div>';
    var r = S.res;
    if (!r) return h;
    var dias = IA.diasPermitidos(Lx, hoje()), nm = marcados().length;
    h += '<div class="cc-ia-sec"><div class="cc-lin"><b>' + (S.props.length ? esc(S.props.length) + ' proposta(s) da IA.' : 'Nenhuma proposta para gravar.') + '</b> ' +
      (S.props.length ? 'Confira cada uma: nada foi gravado ainda.' : '') + '</div>' + usoTxt(r.uso);
    h += S.props.map(function (p, i) { return htmlProp(p, i, Lx, dias); }).join('');
    if (S.props.length) {
      h += '<div class="cc-acts">' + botao('gravar', 'Gravar os marcados (' + nm + ')', 'cc-cheio', !nm) + botao('descartar', 'Descartar a proposta') + '</div>' +
        '<div class="cc-cinza">Grava pelo mesmo caminho do apontamento à mão: cada um aparece no cartão do compromisso.</div>';
    } else h += '<div class="cc-acts">' + botao('descartar', 'Fechar a leitura') + '</div>';
    h += '</div>';
    var nc = r.nao_casou || [];
    if (nc.length) {
      h += '<div class="cc-ia-sec"><div class="cc-rot">Não casou com nenhum compromisso (' + esc(nc.length) + ')</div><ul class="cc-ia-lista">' +
        nc.map(function (x) { return '<li><q>' + esc(x.trecho) + '</q>' + (x.motivo ? ' <span class="cc-mu">· ' + esc(x.motivo) + '</span>' : '') + '</li>'; }).join('') +
        '</ul><div class="cc-cinza">Se for serviço da semana, aponte à mão no cartão. Se for serviço novo, crie um compromisso extra em Semana.</div></div>';
    }
    var dc = r.descartadas || [];
    if (dc.length) {
      h += '<div class="cc-ia-sec"><div class="cc-rot">A conferência tirou (' + esc(dc.length) + ')</div><ul class="cc-ia-lista">' +
        dc.map(function (x) { return '<li>' + esc([x.cid, x.dia ? CC.dd(x.dia) : ''].filter(Boolean).join(' · ') || 'sem compromisso') + ': ' + esc(x.motivo) +
          (x.trecho ? ' <q class="cc-mu">' + esc(x.trecho) + '</q>' : '') + '</li>'; }).join('') + '</ul></div>';
    }
    return h;
  }
  function desenhar(foco) {
    host.innerHTML = html();
    if (foco) { var el = host.querySelector(foco); if (el) try { el.focus({ preventScroll: true }); } catch (e) { /* ok */ } }
  }
  function ler() {
    var t = S.texto.trim();
    if (S.lendo) return;
    if (t.length < MIN_RELATO) { S.erro = 'Cole o relato (pelo menos uma frase).'; desenhar(); return; }
    var Lx = L(), seq = ++S.seq;
    S.lendo = true; S.erro = ''; S.res = null; S.props = []; S.enviados = 0;
    desenhar();
    CC.assistente({ acao: 'relato', relato: t, seg: Lx.seg || null }).then(function (r) {
      if (seq !== S.seq) return;
      S.lendo = false; S.res = r;
      S.props = (r.propostas || []).map(function (p) {
        var c = compDe(L(), p.cid);
        return { cid: p.cid, dia: p.dia, situacao: p.situacao, qtd: p.qtd == null ? '' : String(p.qtd), causa: p.causa || '', obs: p.obs || '',
          trecho: p.trecho || '', confianca: p.confianca, trecho_confere: !!p.trecho_confere,
          marcado: p.confianca !== 'baixa' && !!p.trecho_confere && !(c && apDe(c, p.dia)), erro: '' };
      });
      desenhar();
    }, function (e) {
      if (seq !== S.seq) return;
      S.lendo = false; S.erro = IA.erroTexto(e);
      desenhar();
    });
  }
  function gravar() {
    var Lx = L(), h = hoje(), ms = marcados(), ruim = 0;
    if (!ms.length) return;
    ms.forEach(function (p) { p.erro = IA.conferir(p, Lx, h); if (p.erro) ruim++; });
    var vistos = {};
    ms.forEach(function (p) { var k = p.cid + '|' + p.dia; if (!p.erro && vistos[k]) { p.erro = 'Outro marcado já aponta ' + p.cid + ' neste dia.'; ruim++; } vistos[k] = 1; });
    if (ruim) { S.erro = 'Corrija os marcados com aviso em vermelho (ou desmarque) e grave de novo.'; desenhar(); return; }
    S.erro = '';
    var lista = ms.map(function (p) { return { p: { cid: p.cid, dia: p.dia, situacao: p.situacao, qtd: p.qtd, causa: p.causa, obs: p.obs }, c: compDe(Lx, p.cid) }; });
    var n = +o.gravar(lista, Lx) || 0;
    S.enviados += n;
    S.props = S.props.filter(function (p) { return !p.marcado; });
    desenhar();
    if (n) CC.toast(n + ' apontamento(s) na fila para gravar.');
  }
  function clk(e) {
    var b = e.target.closest('button[data-ia]');
    if (!b || !host.contains(b) || b.disabled) return;
    var a = b.getAttribute('data-ia');
    if (a === 'abrir') { S.aberto = true; S.enviados = 0; desenhar('[data-ia-f="texto"]'); return; }
    if (a === 'fechar') { S.seq++; S.aberto = false; S.lendo = false; S.texto = ''; S.res = null; S.props = []; S.erro = ''; desenhar(); return; }
    if (a === 'limpar') { S.texto = ''; S.res = null; S.props = []; S.erro = ''; S.enviados = 0; desenhar('[data-ia-f="texto"]'); return; }
    if (a === 'ler') { ler(); return; }
    if (a === 'gravar') { gravar(); return; }
    if (a === 'descartar') { S.res = null; S.props = []; S.erro = ''; desenhar(); return; }
  }
  function inp(e) {
    var t = e.target, f = t.getAttribute && t.getAttribute('data-ia-f');
    if (!f || !host.contains(t)) return;
    if (f === 'texto') {
      S.texto = String(t.value || '');
      var ct = host.querySelector('[data-ia-conta]'); if (ct) ct.textContent = (CC.num(S.texto.length, 0) || '0') + ' de ' + CC.num(MAX_RELATO, 0) + ' letras';
      var bl = host.querySelector('button[data-ia="ler"]'); if (bl) bl.disabled = S.lendo || S.texto.trim().length < MIN_RELATO;
      return;
    }
    var p = S.props[+t.getAttribute('data-i')];
    if (!p) return;
    if (f === 'marcado') {
      p.marcado = !!t.checked; p.erro = '';
      var box = t.closest('.cc-ia-prop'); if (box) box.classList.toggle('cc-ia-off', !p.marcado);
      var bg = host.querySelector('button[data-ia="gravar"]'), n = marcados().length;
      if (bg) { bg.textContent = 'Gravar os marcados (' + n + ')'; bg.disabled = !n; }
      return;
    }
    p[f] = String(t.value == null ? '' : t.value);
    if (e.type === 'change' && (f === 'situacao' || f === 'dia' || f === 'causa')) { p.erro = ''; desenhar('[data-ia-f="' + f + '"][data-i="' + t.getAttribute('data-i') + '"]'); }
  }
  host.addEventListener('click', clk);
  host.addEventListener('input', inp);
  host.addEventListener('change', inp);
  desenhar();
  return {
    fechar: function () { S.seq++; host.removeEventListener('click', clk); host.removeEventListener('input', inp); host.removeEventListener('change', inp);
      host.removeAttribute('data-cc-fn'); host.innerHTML = ''; },
    digitando: function () { return S.lendo || !!S.texto.trim() || S.props.length > 0; }
  };
};

// ===================================================================== /ciclo: pergunta sobre a situação da obra
// o: { papel(): papel da chave (engenheiro, gestor, diretoria, leitura) }
IA.painelPergunta = function (host, o) {
  estilo();
  host.setAttribute('data-cc-fn', '1');
  var S = { aberto: false, texto: '', lendo: false, erro: '', hist: [], uso: null, seq: 0 };
  function pode() { return PAPEIS_PERGUNTA.indexOf(o.papel ? o.papel() : '') >= 0; }
  function html() {
    var h = '<div class="card"><div class="cc-cab"><h3>Perguntar ao assistente</h3>' + CC.selo('IA', 'ac') + '</div>' +
      '<div class="cc-lin cc-mu">A IA responde só com o que está na situação da obra: luzes, o que decidir, riscos e qualidade do dado. Não grava nada.</div>';
    if (!pode()) return h + '<div class="cc-cinza" style="margin-top:8px">Seu acesso é só de leitura: o assistente fica para engenheiro, gestor e diretoria.</div></div>';
    if (!S.aberto) h += '<div class="cc-acts">' + botao('abrir', 'Perguntar ao assistente', 'cc-pri') + '</div>';
    else {
      h += '<div class="cc-form" style="border-top:0;padding-top:0"><label><span class="cc-rot">Sua pergunta</span><textarea class="cc-campo" data-ia-f="texto" rows="3" maxlength="' + MAX_PERGUNTA +
        '" placeholder="Ex.: o que trava o próximo EVENTO? Quais demandas vencem esta semana?"' + (S.lendo ? ' readonly' : '') + '>' + esc(S.texto) + '</textarea></label>' +
        contador(S.texto.length, MAX_PERGUNTA) + '</div><div class="cc-acts">' +
        botao('perguntar', S.lendo ? 'Pensando…' : 'Perguntar', 'cc-cheio', S.lendo || S.texto.trim().length < 3) + botao('fechar', 'Fechar') + '</div>';
      if (S.lendo) h += '<div class="cc-pend" role="status">O assistente está lendo a situação da obra.</div>';
    }
    h += erroBox(S.erro);
    h += S.hist.map(function (x) {
      return '<div class="cc-ia-qa"><div class="cc-rot">Você perguntou</div><div class="cc-lin">' + esc(x.q) + '</div>' +
        '<div class="cc-rot" style="margin-top:8px">Resposta do assistente <span class="cc-cinza">' + esc(CC.quando(x.em)) + '</span></div>' +
        '<div class="cc-ia-resp">' + esc(x.r) + '</div>' +
        (x.achou ? '' : '<div class="cc-aviso">O assistente não achou isso nos dados da obra.</div>') + '</div>';
    }).join('');
    if (S.hist.length) h += '<div class="cc-cinza" style="margin-top:8px">Confira nos números da Situação antes de decidir.</div>' + usoTxt(S.uso);
    return h + '</div>';
  }
  function desenhar(foco) {
    host.innerHTML = html();
    if (foco) { var el = host.querySelector(foco); if (el) try { el.focus({ preventScroll: true }); } catch (e) { /* ok */ } }
  }
  function perguntar() {
    var q = S.texto.replace(/\s+/g, ' ').trim();
    if (S.lendo || q.length < 3) return;
    var seq = ++S.seq;
    S.lendo = true; S.erro = '';
    desenhar();
    CC.assistente({ acao: 'pergunta', pergunta: q.slice(0, MAX_PERGUNTA) }).then(function (r) {
      if (seq !== S.seq) return;
      S.lendo = false; S.uso = r.uso || null; S.texto = '';
      S.hist.unshift({ q: q, r: String(r.resposta || ''), achou: r.achou_nos_dados !== false, em: CC.agora() });
      S.hist = S.hist.slice(0, 3);
      desenhar('[data-ia-f="texto"]');
    }, function (e) {
      if (seq !== S.seq) return;
      S.lendo = false; S.erro = IA.erroTexto(e);
      desenhar();
    });
  }
  function clk(e) {
    var b = e.target.closest('button[data-ia]');
    if (!b || !host.contains(b) || b.disabled) return;
    var a = b.getAttribute('data-ia');
    if (a === 'abrir') { S.aberto = true; desenhar('[data-ia-f="texto"]'); return; }
    if (a === 'fechar') { S.seq++; S.aberto = false; S.lendo = false; S.erro = ''; desenhar(); return; }
    if (a === 'perguntar') perguntar();
  }
  function inp(e) {
    var t = e.target;
    if (!t.getAttribute || t.getAttribute('data-ia-f') !== 'texto' || !host.contains(t)) return;
    S.texto = String(t.value || '');
    var ct = host.querySelector('[data-ia-conta]'); if (ct) ct.textContent = (CC.num(S.texto.length, 0) || '0') + ' de ' + CC.num(MAX_PERGUNTA, 0) + ' letras';
    var bp = host.querySelector('button[data-ia="perguntar"]'); if (bp) bp.disabled = S.lendo || S.texto.trim().length < 3;
  }
  function tecla(e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target.getAttribute && e.target.getAttribute('data-ia-f') === 'texto') { e.preventDefault(); perguntar(); } }
  host.addEventListener('click', clk);
  host.addEventListener('input', inp);
  host.addEventListener('keydown', tecla);
  desenhar();
  return {
    fechar: function () { S.seq++; host.removeEventListener('click', clk); host.removeEventListener('input', inp); host.removeEventListener('keydown', tecla);
      host.removeAttribute('data-cc-fn'); host.innerHTML = ''; },
    redesenhar: function () { if (!CC.digitando(host)) desenhar(); },
    digitando: function () { return S.lendo || !!S.texto.trim(); }
  };
};
}(window, document));
