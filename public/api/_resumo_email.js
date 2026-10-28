'use strict';
// Texto do e-mail do resumo para o diretor (o mesmo da prévia e do "Copiar para WhatsApp"). Usado só por public/api/resumo.js.
// O nome começa com "_": a Vercel não publica este arquivo como endpoint; ele entra junto no pacote do /api/resumo.
// Sem dado, chave nem e-mail aqui. Vazio não é zero: o que não tem dado sai como "sem dado".

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
  // [integração] meta parcial: a soma da meta só conta os itens com meta. Vazio não é zero: o e-mail diz em quantos itens a meta
  // está definida e quanto do licitado eles somam, e o "% da meta" só compara o gasto desses itens com a meta deles.
  const ni = n(e.itens), nm = n(e.itens_com_meta), parcial = nm !== null && ni !== null && nm < ni;
  let txtMeta = 'meta ' + reais(e.meta);
  if (parcial) txtMeta = nm === 0 ? 'meta sem dado (nenhum item com meta)'
    : 'meta definida em ' + nm + ' de ' + ni + ' itens (' + reais(e.meta) + ' para ' + reais(e.licitado_com_meta) + ' licitados)';
  let s = 'licitado ' + reais(e.licitado) + ' · ' + txtMeta + ' · comprometido ' + comp + ' · realizado ' + real;
  const meta = n(e.meta);
  const usado = parcial ? (n(e.comprometido_com_meta) ?? 0) + (n(e.realizado_com_meta) ?? 0) : (n(e.comprometido) ?? 0) + (n(e.realizado) ?? 0);
  if (meta && meta > 0 && (n(e.pedidos) || n(e.notas)) && (!parcial || n(e.comprometido_com_meta) !== null)) {
    s += parcial ? ' · nos itens com meta, comprometido mais realizado: ' + Math.round((usado / meta) * 100) + '% da meta deles'
      : ' · comprometido mais realizado: ' + Math.round((usado / meta) * 100) + '% da meta';
  }
  return s;
}

// Um bloco por obra: título, cor (a pior entre as luzes do planejador e o EVENTO mais crítico), frase e itens.
function blocoObra(cod, r, base) {
  const b = { cod, titulo: tituloObra(r, cod), cor: 'SEM DADO', motivo: '', frase: '', itens: [], links: [] };
  if (!r || r.erro) { b.itens.push(['Situação', 'sem dado (não consegui ler esta obra agora)']); return b; }
  const c = r.ciclo;
  if (!c) b.itens.push(['Planejador', 'sem dado (obra fora do planejador)']);
  else if (c.cronograma === false) b.itens.push(['Planejador', 'sem dado (obra sem cronograma no planejador)']);
  else if (c.sem_acesso) b.itens.push(['Planejador', 'sem acesso com esta chave (o planejador desta obra é do engenheiro dela)']);
  else if (c.erro) b.itens.push(['Planejador', 'sem dado (não consegui calcular o planejador desta obra)']);
  else {
    const lz = c.luzes || {}, pr = lz.producao || {}, pa = lz.plano || {};
    const crit = ((c.criticas || {}).lista || [])[0];
    const cor = pior([pr.cor, pa.cor, crit && crit.nivel]);
    if (cor) b.cor = cor;
    if (crit && crit.nivel === cor) b.motivo = nomeCritica(crit) + ' em risco';
    else if (pa.cor === cor && pa.motivo) b.motivo = 'plano: ' + txt(pa.motivo, 160);
    else if (pr.cor === cor && pr.motivo) b.motivo = 'produção: ' + txt(pr.motivo, 160);
    b.frase = txt(c.frase, 400);
    // o motivo de cada luz é o do indicador que deu a cor (o banco manda só esse), nunca o de outro indicador
    b.itens.push(['Luzes', 'produção ' + (txt(pr.cor, 12) || 'sem dado') + (pr.motivo ? ' (' + txt(pr.motivo, 160) + ')' : '') +
      ' · plano ' + (txt(pa.cor, 12) || 'sem dado') + (pa.motivo ? ' (' + txt(pa.motivo, 160) + ')' : '')]);
    b.itens.push(['PPC', linhaPpc(c)]);
    b.itens.push(['Atrasadas', linhaAtrasadas(c)]);
    b.itens.push(['Mais críticas', linhaCriticas(c)]);
    b.itens.push(['Restrições', linhaRestricoes(c)]);
    b.itens.push(['Apontamento', linhaApont(c)]);
  }
  b.itens.push(['Custo (ERP)', linhaErp(r.erp)]);
  if (base) {
    if (c && c.cronograma !== false && !c.sem_acesso) b.links.push(['Planejador', base + '/ciclo?obra=' + encodeURIComponent(cod) + '&aba=sit']);
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

const mascarar = (email) => { const s = String(email || ''), i = s.indexOf('@'); return i > 0 ? s[0] + '***' + s.slice(i) : '***'; };

module.exports = { montarEmail, blocoObra, mascarar, n };
