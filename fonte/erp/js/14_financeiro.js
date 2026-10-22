/* ============ CONTAS A PAGAR / CONCILIAÇÃO ============ */
const addDias=(iso,n)=>{const d=new Date(iso+'T00:00:00');d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)};
function criaTitulo(o){if(S.t.titulos.some(t=>t.oc===o.id))return;S.t.titulos.push({id:'t'+Date.now()+Math.random().toString(36).slice(2,5),oc:o.id,ocNum:o.num,forn:o.forn,valor:o.valor,venc:addDias(hojeISO(),30)});log('titulo_pagar',o.num,'criado','',brl(o.valor)+' · venc '+fdata(addDias(hojeISO(),30)))}
const notasOc=()=>memo('no',()=>{const m={};S.t.notas.forEach(n=>(m[n.oc]=m[n.oc]||[]).push(n));return m});
function tituloInfo(t){return memo('ti'+t.id,()=>tituloInfoRaw(t))}
function tituloInfoRaw(t){const ocs=t.agrupaDe?t.agrupaDe.map(id=>(S.t.titulos.find(x=>x.id===id)||{}).oc):[t.oc],NO=notasOc(),notas=[...new Set(ocs.flatMap(o=>NO[o]||[]))],pago=notas.filter(n=>['paga'].includes(n.status)).reduce((s,n)=>s+n.valor,0);
  const nf=notas.reduce((s,n)=>s+n.valor,0);const st=t.cancelado?'cancelado':pago>=t.valor-.01?'pago':pago>0?'parcial':nf>0?'nota lançada':'previsto';return {notas,pago,nf,st,saldo:Math.max(0,t.valor-pago)}}
function viewFin(X){
  const tab=S.tab.fin||'tit';const T=S.t.titulos;
  const avulsas=S.t.notas.filter(n=>!n.oc&&n.status!=='lancada');
  const pagas=S.t.notas.filter(n=>n.status==='paga');
  let b='';
  if(tab==='tit'){
    const aberto=T.filter(t=>!t.cancelado).reduce((s,t)=>s+tituloInfo(t).saldo,0),venc=T.filter(t=>!t.cancelado&&t.venc<hojeISO()&&tituloInfo(t).saldo>0).length;
    b=`<div class="kpi4"><div><div class="k-l">Títulos</div><div class="v">${T.length}</div></div><div><div class="k-l">A pagar (saldo)</div><div class="v">${brl(aberto,true)}</div></div><div><div class="k-l">Vencidos</div><div class="v ${venc?'neg':''}">${venc}</div></div><div><div class="k-l">Notas sem pedido</div><div class="v ${avulsas.length?'neg':''}">${avulsas.length}</div></div></div>
    <div class="tw">${T.length?`<table class="tbl"><thead><tr><th>Título</th><th>Fornecedor</th><th>Vence</th><th class="r">Valor</th><th class="r">Pago</th><th class="r">Saldo</th><th>Situação</th><th>Nota(s)</th><th></th></tr></thead><tbody>${T.map(t=>{const i=tituloInfo(t);return `<tr><td class="mono">${t.ocNum}</td><td>${esc(t.forn)}</td><td class="${t.venc<hojeISO()&&i.saldo>0&&!t.cancelado?'neg':''}">${fdata(t.venc)}</td><td class="r">${brl(t.valor)}</td><td class="r">${brl(i.pago)}</td><td class="r">${brl(i.saldo)}</td><td><span class="pill ${i.st==='pago'?'ok':i.st==='cancelado'?'bad':i.st==='previsto'?'mute':'warn'}">${i.st}</span></td><td class="mono">${i.notas.map(n=>n.num).join(', ')||'—'}${t.parcelas?` <span class="pill mute">${t.parcelas.length}x</span>`:''}${t.hist&&t.hist.length?` <span class="pill info" title="${esc(t.hist.map(h=>fdata(h.data)+': '+h.motivo).join(' | '))}">renegociado</span>`:''}</td><td class="r">${i.saldo>0&&!t.cancelado?`<button class="btn sm" data-act="tit-parc" data-id="${t.id}">Parcelar</button> <button class="btn sm" data-act="tit-reneg" data-id="${t.id}">Renegociar</button> <input type="checkbox" class="tg" value="${t.id}" title="agrupar">`:''}</td></tr>`}).join('')}</tbody></table>`:empty('Nenhum título ainda.','Toda OC aprovada gera o título; depois a nota é alocada a ele.')}</div>
    <div style="margin-top:8px"><button class="btn" data-act="tit-agrup" ${can('liberar')?'':'disabled title="Só Financeiro"'}>Agrupar marcados (mesmo fornecedor)</button></div>`}
  if(tab==='contas')b=viewContas();
  if(tab==='cobr')b=viewCobranca();
  if(tab==='fech')b=viewFiscal();
  if(tab==='apur')b=viewApuracao();
  if(tab==='conc'){
    b=`<div class="sub">Cole as linhas do extrato (<span class="mono">dd/mm/aaaa;descrição;valor</span>). O valor pago casa com a nota paga de mesmo valor.</div>
    <textarea id="ofx" rows="5" placeholder="16/11/2026;PIX Forn A;-1600,00"></textarea><div style="margin-top:8px"><button class="btn dark" data-act="conciliar" ${can('liberar')?'':'disabled title="Só Financeiro"'}>Conciliar</button></div>
    <div id="conc-msg" class="sub" style="margin-top:8px">${S.msgConc||''}</div>
    <div class="tw">${pagas.length?`<table class="tbl"><thead><tr><th>Nota</th><th>Emitente</th><th class="r">Valor</th><th>Pago em</th><th>Banco</th></tr></thead><tbody>${pagas.map(n=>`<tr><td class="mono">${n.num}</td><td>${esc(n.emitente)}</td><td class="r">${brl(n.valor)}</td><td>${fdata(n.pago)}</td><td>${n.conc?`<span class="pill ok">conciliado ${fdata(n.conc)}</span>`:'<span class="pill warn">pendente</span>'}</td></tr>`).join('')}</tbody></table>`:empty('Nenhum pagamento ainda.','Pague uma nota em Notas e rateio.')}</div>`}
  const banner=historicoPendente()?`<div class="alert" style="margin-top:12px"><div class="g" style="color:var(--info)">i</div><div><b>Histórico do consórcio da obra 281</b><p>Há 342 lançamentos (despesas e aportes até abril/2026) prontos para entrar: despesas viram notas na fila “sem item” e aportes viram caixa.</p><button class="btn sm dark" data-act="hist-281">Importar histórico</button></div></div>`:'';
  return `<div class="head"><div><h1>Financeiro</h1><p class="lead">A OC aprovada gera a conta a pagar; a nota é alocada a ela, o pagamento baixa o título e o extrato concilia.</p></div></div>
   ${banner}<div class="toolbar">${tabs('fin',[['tit','Contas a pagar '+T.length],['conc','Conciliação bancária'],['contas','Contas e extrato'],['cobr','Cobrança'],['apur','Apuração de tributos'],['fech','Fechamento e integrações']],tab)}</div>${b}`}
function doConciliar(){
  const linhas=($('#ofx').value||'').split('\n').map(l=>l.trim()).filter(Boolean);let ok=0;const sem=[];
  linhas.forEach(l=>{const c=l.split(';');const v=Math.abs(parseFloat((c[2]||'').replace(/\./g,'').replace(',','.')));if(!(v>0))return sem.push(l);
    const n=S.t.notas.find(n=>n.status==='paga'&&!n.conc&&Math.abs(n.valor-v)<.005);if(!n)return sem.push(l);n.conc=hojeISO();ok++;log('nota_fiscal',n.num,'conciliada','',brl(v))});
  S.msgConc=`${ok} conciliado(s)${sem.length?` · ${sem.length} linha(s) sem nota correspondente`:''}`;save();render()}

