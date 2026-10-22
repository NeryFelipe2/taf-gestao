/* ============ AJUDA EMBUTIDA (Fase 18): manual do papel atual, com busca ============ */
const MAN_PAPEL={encarregado:'encarregado',engenheiro:'engenheiro',compras:'compras',almox:'almoxarife',adm:'administrativo',financeiro:'financeiro',gerente:'gerencia',diretoria:'gerencia',gestao:'gerencia',planejamento:'planejamento',admin:'administrador',pendente:'geral'};
const mdInline=t=>esc(t).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/`(.+?)`/g,'<span class="mono">$1</span>');
function mdHtml(md,q){const out=[];let ul=false;const ok=l=>!q||l.toLowerCase().includes(q.toLowerCase());const fecha=()=>{if(ul){out.push('</ul>');ul=false}};
  md.split('\n').forEach(l=>{if(!l.trim()){fecha();return}if(/^# /.test(l)){fecha();out.push(`<h3>${mdInline(l.slice(2))}</h3>`);return}if(/^## /.test(l)){fecha();out.push(`<div class="panel-t" style="margin-top:12px">${mdInline(l.slice(3))}</div>`);return}
   if(/^- /.test(l)){if(!ok(l))return;if(!ul){out.push('<ul style="margin:4px 0 4px 18px;padding:0">');ul=true}out.push(`<li style="margin:4px 0">${mdInline(l.slice(2))}</li>`);return}fecha();if(ok(l))out.push(`<p class="sub">${mdInline(l)}</p>`)});fecha();return out.join('')}
function ajudaAbrir(q){const k=MAN_PAPEL[S.role]||'geral',txt=(MANUAIS[k]||MANUAIS.geral||'')+'\n\n'+(k!=='geral'?MANUAIS.geral||'':'');
  modal(`<div style="display:flex;gap:8px;align-items:center;justify-content:space-between"><b>Ajuda · ${esc(ROLES[S.role].n)}</b><button class="btn sm" data-act="fechar">Fechar</button></div><input id="aj-q" placeholder="Buscar no manual" value="${esc(q||'')}" style="margin:8px 0" aria-label="Buscar no manual"><div id="aj-t" style="max-height:60vh;overflow:auto">${mdHtml(txt,q)}</div>`);
  const i=$('#aj-q');if(i){i.focus();i.oninput=()=>{const t=(MANUAIS[k]||MANUAIS.geral||'')+'\n\n'+(MANUAIS.geral||'');$('#aj-t').innerHTML=mdHtml(t,i.value)}}}
ACOES['ajuda']=()=>ajudaAbrir('');
