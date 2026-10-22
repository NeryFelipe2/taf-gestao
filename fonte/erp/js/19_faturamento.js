/* ============ FATURAMENTO, RECEBIMENTO, DRE E CAIXA (Fase 9) ============ */
const mesDe=s=>String(s||'').slice(0,7);
const addMes=(m,n)=>{const [y,x]=m.split('-').map(Number);const d=new Date(y,x-1+n,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')};
const fmes=m=>{const [y,x]=m.split('-');return ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][+x-1]+'/'+y.slice(2)};
const puItem=i=>i.qtd?i.preco_venda_total/i.qtd:0;
const medValor=m=>m.qtd*puItem(S.byCod[m.item]||{qtd:0,preco_venda_total:0});
const medsLivres=()=>S.t.meds.filter(m=>m.status==='atestada'&&!m.bc);
const bcBruto=b=>r2(b.medIds.reduce((s,id)=>{const m=S.t.meds.find(x=>x.id===id);return s+(m?medValor(m):0)},0));
const bcTotal=b=>r2(bcBruto(b)*(1+(b.reajuste||0)/100));
const bcAprov=b=>b.valorAprovado!=null?b.valorAprovado:bcTotal(b);
const bcGlosa=b=>b.valorAprovado!=null?r2(Math.max(0,bcTotal(b)-b.valorAprovado)):0;
const fatLiq=f=>r2(f.valor*(1-(f.ret||0)/100));
const fatRec=f=>r2(S.t.recs.filter(r=>r.fat===f.id).reduce((s,r)=>s+r.valor,0));
const fatSaldo=f=>r2(Math.max(0,fatLiq(f)-fatRec(f)));
const BC_ST={rascunho:['mute','Rascunho'],enviado:['info','Enviado ao cliente'],aprovado:['warn','Aprovado, a faturar'],faturado:['ok','Faturado']};
function realPorConta(){const real={};S.t.notas.forEach(n=>{if(n.status==='lancada')return;n.rateio.forEach(l=>{const c=l.conta||contaPadrao(l.nat,S.byCod[l.item]?.pacote);real[c]=(real[c]||0)+ +l.valor})});return real}
function dre(){
  const trib=S.D.obra.tributos_nota,bcs=S.t.bcs.filter(b=>b.status==='aprovado'||b.status==='faturado');
  const bruto=bcs.reduce((s,b)=>s+bcBruto(b),0),reaj=bcs.reduce((s,b)=>s+r2(bcBruto(b)*(b.reajuste||0)/100),0),glosa=bcs.reduce((s,b)=>s+bcGlosa(b),0);
  const aprov=bcs.reduce((s,b)=>s+bcAprov(b),0),ded=r2(aprov*trib),liq=r2(aprov-ded);
  const real=realPorConta(),custoPorConta=Object.entries(real).sort(([a],[b])=>cmpCod(a,b));const custo=custoPorConta.reduce((s,[,v])=>s+v,0);
  return {bruto,reaj,glosa,aprov,ded,liq,custoPorConta,custo,resultado:r2(liq-custo),margem:liq>0?(liq-custo)/liq:null}}
function proxMeses(n0,n1){const m0=mesDe(hojeISO());return Array.from({length:n1-n0+1},(_,k)=>addMes(m0,n0+k))}
function caixa(){return memo('cx',caixaRaw)}
function caixaRaw(){
  const meses=proxMeses(-2,6),L={};meses.forEach(m=>L[m]={entP:0,entR:0,saiP:0,saiR:0,man:0});
  const put=(m,k,v)=>{if(L[m])L[m][k]+=v};
  S.t.fats.forEach(f=>{put(mesDe(f.venc),'entP',fatSaldo(f))});
  S.t.recs.forEach(r=>put(mesDe(r.data),'entR',r.valor));
  S.t.titulos.filter(t=>!t.cancelado).forEach(t=>{const i=tituloInfo(t);if(t.parcelas&&t.parcelas.length){let pg=i.pago;t.parcelas.forEach(q=>{const u=Math.min(pg,q.valor);pg=r2(pg-u);put(mesDe(q.venc),'saiP',r2(q.valor-u))})}else put(mesDe(t.venc),'saiP',i.saldo)});
  S.t.notas.filter(n=>n.status==='paga').forEach(n=>put(mesDe(n.pago),'saiR',n.valor));
  S.t.lans.forEach(l=>put(mesDe(l.data),'man',l.valor));
  let acc=0,minAcc=0;
  const rows=meses.map(m=>{const x=L[m],liq=x.entR+x.entP-x.saiR-x.saiP+x.man;acc+=liq;minAcc=Math.min(minAcc,acc);return {m,...x,liq,acc}});
  return {rows,minAcc}}
function svgCaixa(rows){
  const W=640,H=180,P=24,mx=Math.max(1,...rows.map(r=>Math.max(r.entR+r.entP,r.saiR+r.saiP))),bw=(W-2*P)/rows.length;
  const y=v=>H-P-(v/mx)*(H-2*P);
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;height:auto" role="img" aria-label="Entradas e saídas por mês">${rows.map((r,k)=>{const x=P+k*bw,e=r.entR+r.entP,s=r.saiR+r.saiP;
   return `<rect x="${x+bw*.12}" y="${y(e)}" width="${bw*.34}" height="${H-P-y(e)}" fill="var(--ok)" rx="2"/><rect x="${x+bw*.52}" y="${y(s)}" width="${bw*.34}" height="${H-P-y(s)}" fill="var(--bad)" rx="2"/><text x="${x+bw/2}" y="${H-8}" text-anchor="middle" font-size="10" fill="var(--ink-3)">${fmes(r.m)}</text>`}).join('')}</svg>
   <div class="legend"><span><i style="background:var(--ok)"></i>Entradas (previstas + realizadas)</span><span><i style="background:var(--bad)"></i>Saídas (previstas + realizadas)</span></div>`}
function viewFat(X){
  const tab=S.tab.fat||'bc',T=S.t,livres=medsLivres(),vl=livres.reduce((s,m)=>s+medValor(m),0);
  let b='';
  if(tab==='bc'){
    b=`<div class="kpi4"><div><div class="k-l">Atestado a medir ao cliente</div><div class="v">${brl(vl,true)}</div></div><div><div class="k-l">Boletins</div><div class="v">${T.bcs.length}</div></div><div><div class="k-l">Aprovados a faturar</div><div class="v ${T.bcs.some(x=>x.status==='aprovado')?'neg':''}">${brl(T.bcs.filter(x=>x.status==='aprovado').reduce((s,x)=>s+bcAprov(x),0),true)}</div></div><div><div class="k-l">Glosas</div><div class="v">${brl(T.bcs.reduce((s,x)=>s+bcGlosa(x),0),true)}</div></div></div>
    <div class="tw">${T.bcs.length?`<table class="tbl"><thead><tr><th>Boletim</th><th class="r">Medido</th><th class="r">Reajuste</th><th class="r">Aprovado</th><th class="r">Glosa</th><th>Situação</th><th></th></tr></thead><tbody>${T.bcs.map(x=>{const st=BC_ST[x.status];
      return `<tr><td class="mono">${x.num}<div class="mut" style="font-size:11.5px">${fdata(x.periodo)} · ${x.medIds.length} medição(ões)</div></td><td class="r">${brl(bcBruto(x))}</td><td class="r">${x.reajuste?x.reajuste+'%':'—'}</td><td class="r">${x.valorAprovado!=null?brl(x.valorAprovado):'—'}</td><td class="r ${bcGlosa(x)?'neg':''}">${brl(bcGlosa(x))}</td><td><span class="pill ${st[0]}">${st[1]}</span></td>
      <td class="r">${x.status==='rascunho'?`<button class="btn sm" data-act="bc-env" data-id="${x.id}" ${can('bc')?'':'disabled'}>Enviar</button>`:x.status==='enviado'?`<button class="btn sm ok" data-act="bc-apr" data-id="${x.id}" ${can('bc')?'':'disabled'}>Registrar aprovação</button>`:x.status==='aprovado'?`<button class="btn sm dark" data-act="bc-fat" data-id="${x.id}" ${can('faturar')?'':'disabled title="Só Financeiro, Adm ou Gerente"'}>Faturar</button>`:''}</td></tr>`}).join('')}</tbody></table>`:'<div class="sub" style="padding:18px">Nenhum boletim. Medições atestadas em “Medição e resultado” entram aqui.</div>'}</div>`}
  if(tab==='nf'){
    const ab=T.fats.reduce((s,f)=>s+fatSaldo(f),0),venc=T.fats.filter(f=>fatSaldo(f)>0&&f.venc<hojeISO());
    b=`<div class="kpi4"><div><div class="k-l">NFs emitidas</div><div class="v">${T.fats.length}</div></div><div><div class="k-l">A receber (líquido de retenção)</div><div class="v">${brl(ab,true)}</div></div><div><div class="k-l">Vencidas</div><div class="v ${venc.length?'neg':''}">${venc.length}</div></div><div><div class="k-l">Recebido</div><div class="v">${brl(T.recs.reduce((s,r)=>s+r.valor,0),true)}</div></div></div>
    <div class="tw">${T.fats.length?`<table class="tbl"><thead><tr><th>NF de serviço</th><th>Vence</th><th class="r">Valor</th><th class="r">Retenção</th><th class="r">Recebido</th><th class="r">Saldo</th><th></th></tr></thead><tbody>${T.fats.map(f=>`<tr><td class="mono">${f.num}<div class="mut" style="font-size:11.5px">${f.bcNum} · emitida ${fdata(f.emissao)}</div></td><td class="${f.venc<hojeISO()&&fatSaldo(f)>0?'neg':''}">${fdata(f.venc)}</td><td class="r">${brl(f.valor)}</td><td class="r">${f.ret?f.ret+'%':'—'}</td><td class="r">${brl(fatRec(f))}</td><td class="r">${brl(fatSaldo(f))}</td><td class="r">${fatSaldo(f)>0?`<button class="btn sm ok" data-act="rec-novo" data-id="${f.id}" ${can('recFat')?'':'disabled title="Só Financeiro, Adm ou Diretoria"'}>Receber</button>`:'<span class="pill ok">Quitada</span>'}</td></tr>`).join('')}</tbody></table>`:'<div class="sub" style="padding:18px">Nenhuma NF emitida.</div>'}</div>
    <div class="panel-t" style="margin-top:16px">Conciliar recebimentos</div><div class="sub">Linhas do extrato <span class="mono">dd/mm/aaaa;descrição;valor</span> com valor positivo casam com recebimentos de mesmo valor.</div><textarea id="ofx-e" rows="3" placeholder="20/11/2026;TED SANEAGO;50000,00"></textarea><div style="margin-top:8px"><button class="btn dark" data-act="conc-ent" ${can('recFat')?'':'disabled'}>Conciliar</button> <span class="sub">${S.msgConcE||''}</span></div>`}
  if(tab==='caixa'){
    const c=caixa();
    b=`<div class="kpi4"><div><div class="k-l">Exposição máxima de caixa</div><div class="v ${c.minAcc<0?'neg':''}">${brl(c.minAcc,true)}</div></div><div><div class="k-l">A receber</div><div class="v">${brl(T.fats.reduce((s,f)=>s+fatSaldo(f),0),true)}</div></div><div><div class="k-l">A pagar</div><div class="v">${brl(T.titulos.filter(t=>!t.cancelado).reduce((s,t)=>s+tituloInfo(t).saldo,0),true)}</div></div><div><div class="k-l">Lançamentos manuais</div><div class="v">${T.lans.length}</div></div></div>
    <div class="card" style="margin-top:14px"><div class="in">${svgCaixa(c.rows)}</div></div>
    <div class="tw"><table class="tbl"><thead><tr><th>Mês</th><th class="r">Entradas previstas</th><th class="r">Recebido</th><th class="r">Saídas previstas</th><th class="r">Pago</th><th class="r">Manual</th><th class="r">Saldo do mês</th><th class="r">Acumulado</th></tr></thead><tbody>${c.rows.map(r=>`<tr><td>${fmes(r.m)}</td><td class="r">${brl(r.entP)}</td><td class="r">${brl(r.entR)}</td><td class="r">${brl(r.saiP)}</td><td class="r">${brl(r.saiR)}</td><td class="r">${brl(r.man)}</td><td class="r ${r.liq<0?'neg':''}">${brl(r.liq)}</td><td class="r ${r.acc<0?'neg':''}">${brl(r.acc)}</td></tr>`).join('')}</tbody></table></div>
    <div class="sub" style="margin-top:8px">Entradas: NFs a receber pelo vencimento e recebimentos. Saídas: títulos a pagar pelo vencimento e notas pagas. Use lançamentos manuais para impostos, financeiro e o que não passa pelo fluxo.</div>
    ${T.lans.length?`<div class="tw"><table class="tbl"><tbody>${T.lans.map(l=>`<tr><td>${fdata(l.data)}</td><td>${esc(l.desc)}</td><td class="r ${l.valor<0?'neg':'pos'}">${brl(l.valor)}</td></tr>`).join('')}</tbody></table></div>`:''}`}
  return `<div class="head"><div><h1>Faturamento e caixa</h1><p class="lead">Medições atestadas viram <b>boletim ao cliente</b>; aprovado, vira NF de serviço; o recebimento baixa e alimenta o caixa junto com as contas a pagar.</p></div>
   <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="lan-novo" ${can('lan')?'':'disabled title="Só Financeiro ou Diretoria"'}>Lançamento manual</button><button class="btn dark" data-act="bc-novo" ${can('bc')&&livres.length?'':'disabled title="Sem medição atestada a faturar"'}>Gerar boletim</button></div></div>
   <div class="toolbar">${tabs('fat',[['bc','Boletins ao cliente '+T.bcs.length],['nf','NFs e recebimentos '+T.fats.length],['caixa','Caixa']],tab)}</div>${b}`}
function modalBc(){const l=medsLivres();
  modal(`<h3>Gerar boletim ao cliente</h3><div class="sub">Entram ${l.length} medição(ões) atestada(s) ainda não faturadas, no total de <b>${brl(l.reduce((s,m)=>s+medValor(m),0))}</b>.</div>
   <div class="g2"><div><label>Período</label><input id="b-per" type="date" value="${hojeISO()}"></div><div><label>Reajuste (%)</label><input id="b-rj" type="number" step="any" value="0"></div></div>
   <div class="acts"><button class="btn" data-act="fechar">Cancelar</button><button class="btn dark" data-act="bc-ok">Gerar</button></div>`)}
function doBc(){const l=medsLivres();if(!l.length)return toast('Nada a faturar');const b={id:'bc'+Date.now(),num:nextNum('bc'),periodo:$('#b-per').value||hojeISO(),reajuste:+$('#b-rj').value||0,medIds:l.map(m=>m.id),status:'rascunho',quem:user()};
  l.forEach(m=>m.bc=b.id);S.t.bcs.unshift(b);log('boletim',b.num,'gerado','',brl(bcTotal(b)));save();closeModal();S.tab.fat='bc';toast(b.num+' gerado');render()}
function bcEnv(id){const b=S.t.bcs.find(x=>x.id===id);b.status='enviado';b.enviado=hojeISO();log('boletim',b.num,'status','rascunho','enviado');save();render()}
function bcAprModal(id){const b=S.t.bcs.find(x=>x.id===id);
  modal(`<h3>Aprovação do cliente · ${b.num}</h3><div class="sub">Total medido com reajuste: <b>${brl(bcTotal(b))}</b>. Se o cliente aprovou menos, a diferença vira glosa.</div><label>Valor aprovado (R$)</label><input id="b-ap" type="number" step="any" value="${bcTotal(b)}">
   <div class="acts"><button class="btn" data-act="fechar">Cancelar</button><button class="btn dark" data-act="bc-apr-ok" data-id="${id}">Registrar</button></div>`)}
function bcAprOk(id){const b=S.t.bcs.find(x=>x.id===id),v=+$('#b-ap').value;if(!(v>0))return toast('Informe o valor aprovado');if(v>bcTotal(b)+0.005)return toast('Aprovado acima do medido');
  b.valorAprovado=r2(v);b.status='aprovado';log('boletim',b.num,'aprovado',brl(bcTotal(b)),brl(v));save();closeModal();render()}
function bcFat(id){const b=S.t.bcs.find(x=>x.id===id);if(bloqueada(hojeISO(),'faturamento'))return;if(b.status!=='aprovado'||S.t.fats.some(f=>f.bc===id))return toast('Já faturado');
  const par=S.t.par,emi=hojeISO(),f={id:'ft'+Date.now(),num:nextNum('fat'),bc:id,bcNum:b.num,valor:bcAprov(b),ret:par.ret||0,emissao:emi,venc:addDias(emi,par.prazoRec||30),quem:user()};
  S.t.fats.unshift(f);b.status='faturado';log('nf_servico',f.num,'emitida','',brl(f.valor));save();S.tab.fat='nf';toast(f.num+' emitida');render()}
function modalRec(id){const f=S.t.fats.find(x=>x.id===id);
  modal(`<h3>Recebimento · ${f.num}</h3><div class="sub">Saldo a receber: <b>${brl(fatSaldo(f))}</b> (líquido de retenção de ${f.ret||0}%).</div><div class="g2"><div><label>Data</label><input id="rc-d" type="date" value="${hojeISO()}"></div><div><label>Valor (R$)</label><input id="rc-v" type="number" step="any" value="${fatSaldo(f)}"></div></div>
   <div class="acts"><button class="btn" data-act="fechar">Cancelar</button><button class="btn dark" data-act="rec-ok" data-id="${id}">Registrar</button></div>`)}
function doRec(id){const f=S.t.fats.find(x=>x.id===id),v=+$('#rc-v').value;if(!(v>0))return toast('Informe o valor');if(v>fatSaldo(f)+0.005)return toast('Acima do saldo da NF');if(bloqueada($('#rc-d').value||hojeISO(),'recebimento'))return;
  S.t.recs.unshift({id:'rc'+Date.now(),fat:id,data:$('#rc-d').value||hojeISO(),valor:r2(v),quem:user()});log('nf_servico',f.num,'recebido','',brl(v));save();closeModal();toast('Recebimento registrado');render()}
function concEnt(){const linhas=($('#ofx-e').value||'').split('\n').map(l=>l.trim()).filter(Boolean);let ok=0,sem=0;
  linhas.forEach(l=>{const c=l.split(';'),v=parseFloat((c[2]||'').replace(/\./g,'').replace(',','.'));if(!(v>0))return sem++;const r=S.t.recs.find(r=>!r.conc&&Math.abs(r.valor-v)<.005);if(!r)return sem++;r.conc=hojeISO();ok++});
  S.msgConcE=`${ok} conciliado(s)${sem?` · ${sem} sem correspondência`:''}`;save();render()}
function modalLan(){modal(`<h3>Lançamento manual de caixa</h3><div class="sub">Para o que não passa por compra nem faturamento (impostos, financeiro). Negativo = saída.</div><div class="g3"><div><label>Data</label><input id="l-d" type="date" value="${hojeISO()}"></div><div><label>Valor (R$)</label><input id="l-v" type="number" step="any"></div><div><label>Descrição</label><input id="l-t"></div></div>
   <div class="acts"><button class="btn" data-act="fechar">Cancelar</button><button class="btn dark" data-act="lan-ok">Lançar</button></div>`)}
function doLan(){const v=+$('#l-v').value,t=$('#l-t').value.trim();if(!v||!t)return toast('Informe valor e descrição');if(bloqueada($('#l-d').value||hojeISO(),'lançamento de caixa'))return;const l={id:'ln'+Date.now(),data:$('#l-d').value||hojeISO(),valor:r2(v),desc:t,quem:user()};
  S.t.lans.unshift(l);log('caixa',t,'lançamento','',brl(v));save();closeModal();S.tab.fat='caixa';render()}

