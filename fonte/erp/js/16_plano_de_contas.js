/* ============ PLANO DE CONTAS ============ */
function viewPlano(X){
  const real={},comp={};
  S.t.notas.forEach(n=>{if(n.status==='lancada')return;n.rateio.forEach(l=>{const c=l.conta||contaPadrao(l.nat,S.byCod[l.item]?.pacote);real[c]=(real[c]||0)+ +l.valor})});
  S.t.ocs.forEach(o=>{if(!['aprovada','recebida_parcial','recebida'].includes(o.status))return;const f=S.t.notas.filter(n=>n.oc===o.id&&n.status!=='lancada').reduce((s,n)=>s+n.rateio.filter(l=>l.item===o.item).reduce((a,l)=>a+ +l.valor,0),0);comp[o.conta]=(comp[o.conta]||0)+Math.max(0,o.valor-f)});
  const meta={};S.D.items.forEach(i=>i.linhas.forEach(l=>{const c=contaPadrao(l.nat,i.pacote);meta[c]=(meta[c]||0)+i.meta_total*l.share}));
  const soma=(m,c)=>Object.entries(m).filter(([k])=>k===c||k.startsWith(c+'.')).reduce((s,[,v])=>s+v,0);
  const P=S.D.plano||[];
  return `<div class="head"><div><h1>Plano de contas</h1><p class="lead">Cada natureza da composição tem uma conta. Quem lança só escolhe o item: a conta vem do cadastro, em toda solicitação, OC e nota. A meta abaixo é a meta de cada item distribuída pela composição.</p></div></div>
  <div class="tw"><table class="tbl"><thead><tr><th>Código</th><th>Conta</th><th>Natureza</th><th class="r">Meta</th><th class="r">Comprometido</th><th class="r">Realizado</th><th>Consumo</th></tr></thead><tbody>${P.map(c=>{const m=soma(meta,c.codigo),co=soma(comp,c.codigo),r=soma(real,c.codigo);return `<tr class="${c.nivel<=2?'grp':''}"><td class="mono">${c.codigo}</td><td style="padding-left:${(c.nivel-1)*14+10}px">${esc(c.nome)}</td><td>${c.natureza?`<span class="pill mute">${c.natureza}</span>`:''}</td><td class="r">${m?brl(m):'—'}</td><td class="r">${co?brl(co):'—'}</td><td class="r">${r?brl(r):'—'}</td><td>${m?bar(co,r,m):''}</td></tr>`}).join('')}</tbody></table></div>`}

