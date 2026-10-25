/* ============ HOJE ============ */
function pacRow(p){
  const d=p._dias;const pill=p._temOC?'<span class="pill ok">Com pedido</span>':d==null?'':d<0?`<span class="pill bad">Vencido ${-d}d</span>`:d<=7?`<span class="pill warn">Em ${d} dias</span>`:`<span class="pill ok">Em ${d} dias</span>`;
  const c=p._acima?'var(--bad)':p._cot?'var(--warn)':'var(--ok)';
  return `<div class="row">${ring(p._pctCot,c)}<div><h4>${esc(p.nome)}<span class="mono">${p.codigo}</span></h4><p>${p._it.length} ${p._it.length===1?'item':'itens'} · ${p._cot?p._cot+' sem cotação':'todos cotados'}${p._semFolga?` · ${p._semFolga} sem folga`:''}</p></div>
   <div>${p._acima?'<span class="pill bad">Meta &gt; teto</span> ':''}${pill}</div><div class="val"><b>${brl(pacMeta(p),true)}</b><span>teto ${brl(pacTeto(p),true)}</span></div></div>`}
function minhaFila(X){
  const f=[];
  if(!S.t.frozen&&can('congelar'))f.push(['bad','Congelar a linha de base v1','Libera a abertura de compras na obra.','eap']);
  if(isRole('gerente','diretoria'))X.pendAprov.filter(o=>o.alcada===S.role||(isRole('diretoria')&&o.alcada==='gerente')||S.role==='admin').forEach(o=>f.push([o.alcada==='diretoria'?'bad':'warn',`Aprovar ${o.num} · ${brl(o.valor)}`,`${o.item} · ${esc(o.forn)}`,'compras']));
  if(isRole('compras'))S.t.sols.filter(s=>s.status==='enviada'||s.status==='em_cotacao').forEach(s=>f.push(['warn',`Cotar ${s.num}`,`${esc(s.desc)} · ${s.item}`,'compras']));
  if(isRole('almox'))S.t.ocs.filter(o=>['aprovada','recebida_parcial'].includes(o.status)).forEach(o=>f.push(['info',`Receber ${o.num}`,`${esc(o.forn)} · ${num(o.qtd-(o.recebido||0))} ${S.byCod[o.item].unidade||''} a receber`,'compras']));
  if(isRole('gerente','diretoria'))S.t.meds.filter(m=>m.status==='lancada'&&m.quem!==user()).forEach(m=>f.push(['warn',`Atestar ${m.num}`,`${m.item} · ${num(m.qtd)} medidos`,'med']));
  if(isRole('adm'))X.semRateio.forEach(n=>f.push(['warn',`Ratear ${n.num}`,`${esc(n.emitente)} · ${brl(n.valor)}`,'nota']));
  if(isRole('financeiro'))S.t.notas.filter(n=>n.status==='conferida'||n.status==='liberada').forEach(n=>f.push(['info',`${n.status==='conferida'?'Liberar':'Pagar'} ${n.num}`,`${esc(n.emitente)} · ${brl(n.valor)}`,'nota']));
  return f;
}
function viewHoje(X){
  const ord=[...S.D.pacotes].filter(p=>p._it.length).sort((a,b)=>(a.fechar_ate||'9').localeCompare(b.fechar_ate||'9'));
  const tab=S.tab.hoje||'fechar';
  const L={fechar:ord.filter(p=>p._dias!=null&&p._dias<=30&&!p._temOC),cotar:ord.filter(p=>p._cot),todos:ord};
  const rows=(L[tab]||[]).map(pacRow).join('')||'<div class="sub" style="padding:18px">Nada por aqui.</div>';
  const folga=S.D.items.reduce((s,i)=>s+Math.max(0,i.teto_total-i.meta_total),0);
  const fila=minhaFila(X);
  const mx=ord.slice(0,6).map(p=>`<div class="mx"><h5>${esc(p.nome)}<small>${p._semFolga?`<b>${p._semFolga} sem folga</b> · `:''}${p._it.length-p._cot}/${p._it.length}</small></h5><div class="sq">${ticks(p._it)}</div></div>`).join('');
  return `<div class="head"><div><h1>Bom dia, Administrador!</h1>
   <p class="lead"><b>${X.vencidos.length} pacotes</b> com data de fechar vencida e sem pedido, <b>${X.aCotar.length} itens</b> sem cotação (${brl(X.aCotar.reduce((s,i)=>s+i.meta_total,0),true)}) e <b>${X.semFolga.length} itens</b> com meta acima do teto.${S.t.frozen?'':' <b style="color:var(--bad)">Linha de base ainda não congelada: compras bloqueadas.</b>'}</p></div>
   <button class="btn dark" data-act="alertas">Ver alertas</button></div>
  <div class="card" style="margin-top:22px"><div class="in kpis">
   <div><div class="k-l">Meta de custo</div><div class="big">${brl(X.meta,true).replace('R$ ','')}</div><span class="pill ok">Folga ${brl(folga,true)}</span> <span class="sub">entre meta e teto</span></div>
   <div><div class="stats"><div><div class="k-l">Comprometido</div><div class="v" style="color:var(--info)">${brl(X.comp,true)}</div></div><div><div class="k-l">Realizado</div><div class="v">${brl(X.real,true)}</div></div>
    <div><div class="k-l">Saldo livre</div><div class="v">${brl(X.meta-X.comp-X.real,true)}</div></div><div><div class="k-l">Economia em OCs</div><div class="v ${X.economia>=0?'pos':'neg'}">${brl(X.economia,true)}</div></div></div>
    <div class="ticks">${ticks(S.D.items)}</div>
    <div class="legend"><span><i style="background:var(--ink)"></i>Cotado / orçado</span><span><i style="background:var(--warn)"></i>Estimado</span><span><i style="background:var(--bad)"></i>Meta acima do teto</span><span style="margin-left:auto">Cada marca é um item da EAP</span></div></div></div></div>
  ${fila.length?`<div class="card" style="margin-top:18px"><div class="in"><div class="panel-t">Aguardando você · ${ROLES[S.role].n}</div>${fila.slice(0,6).map(f=>`<div class="row" style="grid-template-columns:28px 1fr auto"><span class="pill ${f[0]}">!</span><div><h4>${f[1]}</h4><p>${f[2]}</p></div><button class="btn sm" data-go="${f[3]}">Abrir</button></div>`).join('')}</div></div>`:''}
  <div class="cols"><div class="card"><div class="in"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
   ${tabs('hoje',[['fechar','A fechar em 30 dias',L.fechar.length],['cotar','Sem cotação'],['todos','Todos '+ord.length]],tab)}<span class="sub">Por data de fechar</span></div>${rows}</div></div>
   <div class="card"><div class="in mx"><div class="panel-t">Matriz de metas por pacote</div><div class="sub">Um quadrado por item</div>${mx}</div></div></div>`;
}

