/* embed.js · as telas do ciclo, do engenheiro e do ERP dentro do Centro de Gestão.
   Dentro do Centro (?embed=1): sem cabeçalho próprio, links entre telas viram navegação do Centro (obra e contexto vão junto), tema e comandos vêm do Centro.
   Fora do Centro: /ciclo e /erp abrem o Centro já na tela certa (?solo=1 mantém a tela sozinha). O /marko continua sendo a visão do engenheiro.
   [integração] Só vai para o Centro quem tem a chave geral do site guardada neste aparelho e não veio de um link do /marko ou do
   /ciclo (?de=marko, ?de=ciclo): o Centro só aceita a chave geral. Quem só tem a chave pessoal (engenheiro, encarregado, gestor,
   leitura, sócio) fica na própria tela, que tem a entrada dela. */
(function () {
  var W = window, D = document, Q = new URLSearchParams(W.location.search), P = W.location.pathname.replace(/\/$/, '');
  var EMB = Q.get('embed') === '1' && W.parent !== W;
  var ouv = [];
  W.TAF_EMB = { ativo: EMB, on: function (f) { ouv.push(f); } };
  if (!EMB) {
    var geral = false; try { geral = !!W.localStorage.getItem('taf-chave'); } catch (e) {}
    var de = Q.get('de');
    if ((P === '/ciclo' || P === '/erp') && Q.get('solo') !== '1' && !/[?&]solo=1/.test(W.location.search) && geral && de !== 'marko' && de !== 'ciclo') {
      var o = Q.get('obra');
      W.location.replace('/?' + (o ? 'obra=' + encodeURIComponent(o) + '&' : '') + 'ir=' + encodeURIComponent(P + W.location.search));
    }
    return;
  }
  D.documentElement.classList.add('emb');
  function envia(m) { m.taf = 1; try { W.parent.postMessage(m, W.location.origin); } catch (e) {} }
  W.TAF_EMB.envia = envia;
  D.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var h = a.getAttribute('href') || '';
    if (/^\/(erp|ciclo|marko)?(\?|#|$)/.test(h)) { e.preventDefault(); e.stopPropagation(); envia({ ir: h }); }
  }, true);
  W.addEventListener('message', function (e) {
    if (e.origin !== W.location.origin || !e.data || !e.data.taf) return;
    var m = e.data;
    if (m.tema) D.documentElement.setAttribute('data-theme', m.tema);
    if (m.vars) Object.keys(m.vars).forEach(function (k) { D.documentElement.style.setProperty(k, m.vars[k]); });
    ouv.forEach(function (f) { try { f(m); } catch (x) {} });
  });
  envia({ pronto: 1, pagina: P });
  if (P !== '/erp' && W.ResizeObserver) {
    var ult = 0, mede = function () {   // altura do conteúdo (body), nunca a da janela, para não crescer sem parar
      var h = D.body ? D.body.scrollHeight : 0;
      if (h && Math.abs(h - ult) > 4) { ult = h; envia({ altura: h + 8 }); }
    };
    var liga = function () { new W.ResizeObserver(mede).observe(D.body); mede(); W.setInterval(mede, 1500); };   // o intervalo cobre navegador em segundo plano
    if (D.body) liga(); else D.addEventListener('DOMContentLoaded', liga);
  }
}());
