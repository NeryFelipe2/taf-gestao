/* ============ PACOTES ============ */
function viewPac(X){
  const tab=S.tab.pac||'todos';
  let L=[...S.D.pacotes].filter(p=>p._it.length).sort((a,b)=>(a.fechar_ate||'9').localeCompare(b.fechar_ate||'9'));
  if(tab==='cotar')L=L.filter(p=>p._cot);if(tab==='acima')L=L.filter(p=>p._acima||p._semFolga);if(tab==='venc')L=L.filter(p=>X.vencidos.includes(p));
  const folgaOutros=S.D.pacotes.filter(p=>p.codigo!=='ADM').reduce((s,p)=>s+(pacTeto(p)-pacMeta(p)),0);
  return `<div class="head"><div><h1>Pacotes</h1><p class="lead">Itens agrupados para comprar em escala. Sem o ADM, os demais pacotes têm folga de <b>${brl(folgaOutros,true)}</b> entre meta e teto.</p></div></div>
  <div class="toolbar">${tabs('pac',[['todos','Todos '+L.length],['venc','Vencidos',X.vencidos.length],['cotar','Sem cotação'],['acima','Meta ≥ teto']],tab)}</div>
  <div class="tw"><table class="tbl"><thead><tr><th>Pacote</th><th class="r">Itens</th><th class="r">Meta</th><th class="r">Teto</th><th class="r">Comprom.</th><th class="r">Realizado</th><th>Consumo</th><th>Fechar até</th><th>Situação</th></tr></thead><tbody>
  ${L.map(p=>{const d=p._dias;const st=p._temOC?'<span class="pill ok">com pedido</span>':d<0?`<span class="pill bad">vencido ${-d}d</span>`:d<=30?`<span class="pill warn">em ${d}d</span>`:`<span class="pill ok">em ${d}d</span>`;
   return `<tr class="clk" data-pac="${p.codigo}"><td><b>${esc(p.nome)}</b><div class="mono mut">${p.codigo} · ${esc(p.responsavel||'')}</div></td><td class="r">${p._it.length}${p._cot?`<div class="pill warn" style="margin-top:3px">${p._cot} s/ cotação</div>`:''}</td><td class="r">${brl(p._meta)}</td><td class="r ${p._acima?'neg':''}">${brl(pacTeto(p))}</td><td class="r">${brl(p._comp)}</td><td class="r">${brl(p._real)}</td><td>${bar(p._comp,p._real,p._meta)}</td><td>${fdata(p.fechar_ate)}</td><td>${st}</td></tr>`}).join('')}</tbody></table></div>`;
}
function modalPac(cod){
  const p=S.D.pacotes.find(x=>x.codigo===cod);
  modal(`<h3>${esc(p.nome)} <span class="mono mut">${p.codigo}</span></h3><div class="sub">Precisa em obra ${fdata(p.precisa_em_obra)} · fechar até ${fdata(p.fechar_ate)} · ${esc(p.condicao_pagamento||'')}</div>
   ${p.observacoes?`<div class="sub" style="margin-top:6px">${esc(p.observacoes)}</div>`:''}
   <div class="tw" style="max-height:50vh"><table class="tbl"><thead><tr><th>Item</th><th class="r">Meta</th><th class="r">Teto</th><th class="r">Saldo</th><th></th></tr></thead><tbody>
   ${p._it.map(i=>`<tr class="clk" data-item="${i.codigo}"><td><span class="mono">${i.codigo}</span><div class="mut" style="font-size:11.5px">${esc(i.descricao.slice(0,60))}</div></td><td class="r">${brl(i.meta_total)}</td><td class="r ${i.meta_total>i.teto_total?'neg':''}">${brl(i.teto_total)}</td><td class="r">${brl(S.sd[i.codigo].livre)}</td><td>${i.status_cotacao==='A cotar'?'<span class="pill warn">estimado</span>':''}</td></tr>`).join('')}</tbody></table></div>
   <div class="acts"><button class="btn" data-act="fechar">Fechar</button>${typeof metaBotoes==='function'?metaBotoes('pacote',cod):''}</div>`);
}

