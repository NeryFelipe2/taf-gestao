/* ============ NOTAS E RATEIO (Fase 4) ============ */
let NF=null;
function viewNota(X){
  const tab=S.tab.nota||'notas';const N=S.t.notas;
  const pill=n=>`<span class="pill ${{lancada:'warn',rateada:'info',conferida:'info',liberada:'ok',paga:'ok',divergente:'bad'}[n.status]}">${n.status}</span>`;
  const acao=n=>{
    if(n.status==='lancada')return `<button class="btn sm" data-act="ratear" data-id="${n.id}" ${can('nota')?'':'disabled title="Só Administrativo"'}>Ratear</button>`;
    if(n.status==='rateada')return `<button class="btn sm" data-act="conferir" data-id="${n.id}" ${can('nota')?'':'disabled'}>Conferir</button>`;
    if(n.status==='divergente')return `<button class="btn sm" data-act="conferir" data-id="${n.id}" ${can('nota')?'':'disabled'}>Reconferir</button>`;
    if(n.status==='conferida')return `<button class="btn sm ok" data-act="liberar" data-id="${n.id}" ${can('liberar')?'':'disabled title="Só Financeiro"'}>Liberar</button>`;
    if(n.status==='liberada')return `<button class="btn sm ok" data-act="pagar" data-id="${n.id}" ${can('liberar')?'':'disabled'}>Pagar</button>`;return ''};
  const list=tab==='sem'?N.filter(n=>n.status==='lancada'||!n.oc):N;
  const body=list.length?`<table class="tbl"><thead><tr><th>Nota</th><th>Emitente</th><th>OC</th><th class="r">Valor</th><th>Rateio</th><th>Status</th><th></th></tr></thead><tbody>${list.map(n=>{const soma=n.rateio.reduce((s,l)=>s+ +l.valor,0);return `<tr><td class="mono">${n.num}<div class="mut">${esc(n.chave||'')}</div></td><td>${esc(n.emitente)}<div class="mut" style="font-size:11.5px">${fdata(n.emissao)}</div></td><td class="mono">${n.ocNum||'<span class="pill warn">sem pedido</span>'}</td><td class="r">${brl(n.valor)}</td><td class="r ${Math.abs(soma-n.valor)<.005?'pos':'neg'}">${Math.round(soma/n.valor*100)}%</td><td>${pill(n)}${n.diverg?`<div class="neg" style="font-size:11.5px">${esc(n.diverg)}</div>`:''}</td><td class="r">${acao(n)}</td></tr>`}).join('')}</tbody></table>`:empty('Nenhuma nota ainda.','Lance a nota recebida para ratear nos itens.');
  return `<div class="head"><div><h1>Notas e rateio</h1><p class="lead">A nota é rateada à mão entre itens e obras. A soma tem que fechar <b>100%</b>; linha sem item não grava; pagamento só com recebimento confirmado.</p></div>
   <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="xml-novo" ${can('nota')?'':'disabled title="Só Administrativo ou Engenheiro"'}>Importar XML</button><button class="btn dark" data-act="nova-nf" ${can('nota')?'':'disabled title="Só Administrativo ou Engenheiro"'}>Lançar nota</button></div></div>
   <div class="toolbar">${tabs('nota',[['notas','Todas '+N.length],['sem','Sem rateio / sem pedido',X.semRateio.length+X.semPedido.filter(n=>n.status!=='lancada').length]],tab)}</div><div class="tw">${body}</div>`;
}
function modalNF(id){
  const ex=id?S.t.notas.find(n=>n.id===id):null;
  NF=ex?{...ex,rateio:ex.rateio.map(l=>({...l}))}:{id:'n'+Date.now(),oc:'',rateio:[],valor:0,emitente:'',chave:'',emissao:hojeISO()};
  const ocsOk=S.t.ocs.filter(o=>OC_COMPROMETE.includes(o.status));
  modal(`<h3>${ex?'Ratear '+ex.num:'Lançar nota fiscal'}</h3><div class="sub">Prefira “Importar XML”, que traz emitente, chave e valor da NF-e; aqui o administrativo confere e rateia.</div>
   <div class="g2"><div><label>Emitente</label><input id="n-e" value="${esc(NF.emitente)}" ${ex?'disabled':''}></div><div><label>Chave / número</label><input id="n-c" value="${esc(NF.chave)}" ${ex?'disabled':''}></div></div>
   <div class="g3"><div><label>Valor da nota (R$)</label><input id="n-v" type="number" step="0.01" value="${NF.valor||''}" ${ex?'disabled':''}></div><div><label>Emissão</label><input id="n-d" type="date" value="${NF.emissao}" ${ex?'disabled':''}></div>
   <div><label>Pedido (OC)</label><select id="n-o" ${ex?'disabled':''}><option value="">Sem pedido</option>${ocsOk.map(o=>`<option value="${o.id}" ${NF.oc===o.id?'selected':''}>${o.num} · ${esc(o.forn)} · ${brl(o.valor)}</option>`).join('')}</select></div></div>
   <div id="n-js" style="display:none"><label>Justificativa (nota sem pedido)</label><input id="n-j" value="${esc(NF.justSemOC||'')}"></div>
   <div class="panel-t" style="margin-top:16px">Rateio</div><div id="n-rat"></div><div style="margin-top:8px;display:flex;gap:8px"><button class="btn sm" data-act="add-lin">+ Linha</button><button class="btn sm" data-act="sug-lin">Sugerir pelo pedido</button></div>
   <div class="bar-fecha" id="n-bar"><i></i></div><div class="sub" id="n-fecha" style="margin-top:6px"></div>
   <div class="acts"><button class="btn" data-act="fechar">Cancelar</button><button class="btn" data-act="nf-ok" data-modo="lancada">Salvar sem ratear</button><button class="btn dark" data-act="nf-ok" data-modo="rateada">Salvar rateio</button></div>`);
  $('#n-o').onchange=()=>{NF.oc=$('#n-o').value;$('#n-js').style.display=NF.oc?'none':'block';
    /* oc_linhas: ao escolher o pedido, o rateio nasce igual às linhas do pedido (só se ainda não foi preenchido à mão) */
    if(ocLinhasLigada()&&NF.oc&&NF.rateio.every(l=>!(+l.valor>0))){const o=S.t.ocs.find(x=>x.id===NF.oc);if(o){NF.rateio=rateioDoPedido(o);pintaRat();return}}
    if(calcV2(S.t))pintaRat()};$('#n-js').style.display=NF.oc?'none':'block';
  $('#n-v').oninput=()=>{NF.valor=+$('#n-v').value;pintaRat()};if(!NF.rateio.length)NF.rateio.push({item:S.D.items[0].codigo,valor:0});pintaRat();
}
/* rateio que nasce do pedido: as linhas do pedido (mesmo item, mesmo valor). Nota de valor menor que o pedido: cada linha recebe a parte proporcional. Linhas do mesmo item somam. */
function rateioDoPedido(o){
  const alvo=Math.min(+NF.valor||o.valor,o.valor),L=linhasDe(o);
  if(L.length<=1)return [{item:o.item,valor:alvo}];
  const v=repartirR(alvo,L.map(l=>+l.valor||0)),M=new Map();L.forEach((l,k)=>M.set(l.item,r2((M.get(l.item)||0)+v[k])));
  return [...M.entries()].map(([item,valor])=>({item,valor}))}
function natLin(l){const oc=NF&&NF.oc?S.t.ocs.find(o=>o.id===NF.oc):null,i=S.byCod[l.item];const ol=oc?linhasDe(oc).find(x=>x.item===l.item):null;const nat=ol&&ol.nat?ol.nat:i.nat;return {n:nat,c:contaPadrao(nat,i.pacote)}}
function pintaRat(){
  const ocNF=calcV2(S.t)&&NF.oc?S.t.ocs.find(o=>o.id===NF.oc):null;   /* calc_v2: avisa a linha rateada fora do item do pedido */
  $('#n-rat').innerHTML=NF.rateio.map((l,k)=>{const i=S.byCod[l.item],s=S.sd[l.item];
   return `<div class="g3" style="grid-template-columns:2fr 1fr .6fr auto;align-items:end;margin-top:8px"><div><label style="margin-top:0">Item</label><select data-lin="${k}" data-f="item">${itemOptions(l.item)}</select></div><div><label style="margin-top:0">Valor (R$)</label><input type="number" step="0.01" data-lin="${k}" data-f="valor" value="${l.valor||''}"></div><div><label style="margin-top:0">Conta</label><span class="pill info" title="${esc(nomeConta(natLin(l).c))}">${natLin(l).c}</span></div><button class="btn sm no" data-act="del-lin" data-k="${k}">×</button>
   <div class="sub" style="grid-column:1/-1;margin-top:-4px">saldo livre do item ${brl(s.livre)}${l.valor>s.livre?' · <b class="neg">acima da meta</b>':''}${ocNF&&!itensDe(ocNF).includes(l.item)?` · <b style="color:var(--warn)">fora do item do pedido (${esc(itensDe(ocNF).join(', '))}): o pedido é abatido pela nota inteira</b>`:''}</div></div>`}).join('');
  document.querySelectorAll('[data-lin]').forEach(e=>e.oninput=e.onchange=()=>{const l=NF.rateio[+e.dataset.lin];l[e.dataset.f]=e.dataset.f==='valor'?+e.value:e.value;if(e.dataset.f==='item')pintaRat();else fechaBar()});fechaBar();
}
function fechaBar(){const soma=r2(NF.rateio.reduce((s,l)=>s+(+l.valor||0),0)),v=r2(NF.valor);const p=v>0?Math.min(100,soma/v*100):0;
  $('#n-bar').className='bar-fecha'+(Math.abs(soma-v)>.004?(soma>v?' bad':''):'');$('#n-bar i').style.width=p+'%';
  $('#n-fecha').innerHTML=Math.abs(soma-v)<.005&&v>0?`<b class="pos">Fecha 100%</b> · ${brl(soma)}`:`Rateado ${brl(soma)} de ${brl(v)} · falta <b class="${soma>v?'neg':''}">${brl(v-soma)}</b>`}
function doNF(modo){
  const ex=S.t.notas.find(n=>n.id===NF.id);
  NF.emitente=ex?ex.emitente:$('#n-e').value.trim();NF.valor=ex?ex.valor:r2($('#n-v').value);NF.chave=ex?ex.chave:$('#n-c').value.trim();NF.emissao=ex?ex.emissao:$('#n-d').value;NF.oc=ex?ex.oc:$('#n-o').value;
  if(!NF.emitente||!(NF.valor>0))return toast('Informe emitente e valor');if(bloqueada(NF.emissao||hojeISO(),'lançamento de nota'))return;
  if(!ex&&/^\d{44}$/.test(NF.chave)&&S.t.notas.some(n=>n.chave===NF.chave))return toast('Esta chave de acesso já foi lançada');
  if(!NF.oc){const j=$('#n-j').value.trim();if(!j)return toast('Nota sem pedido: justifique');NF.justSemOC=j}
  const lin=NF.rateio.filter(l=>+l.valor>0);
  if(modo==='rateada'){if(!lin.length||lin.some(l=>!l.item))return toast('Toda linha precisa de obra e item');
    if(Math.abs(r2(lin.reduce((s,l)=>s+ +l.valor,0))-NF.valor)>.004)return toast('O rateio não fecha 100% da nota')}
  const n={...NF,rateio:lin.map(l=>({item:l.item,valor:r2(l.valor),nat:natLin(l).n,conta:natLin(l).c})),status:modo,ocNum:NF.oc?S.t.ocs.find(o=>o.id===NF.oc).num:''};
  if(ex){Object.assign(ex,n)}else{n.num=nextNum('nf');S.t.notas.unshift(n)}
  log('nota_fiscal',n.num||ex.num,'status','',modo+' · '+brl(NF.valor));save();closeModal();toast('Nota '+(modo==='rateada'?'rateada':'lançada (fila sem rateio)'));render();
}
function conferir(id){
  const n=S.t.notas.find(x=>x.id===id);n.diverg='';
  if(n.oc){const o=S.t.ocs.find(x=>x.id===n.oc);
    const outras=S.t.notas.filter(x=>x.oc===o.id&&x.id!==n.id&&x.status!=='lancada').reduce((s,x)=>s+x.valor,0);
    const esperado=r2(ocRecebido(o)-outras);
    if(esperado<=0){n.status='divergente';n.diverg='Sem recebimento registrado para esta nota';}
    else if(Math.abs(n.valor-esperado)/esperado>S.t.par.tol){n.status='divergente';n.diverg=`Nota ${brl(n.valor)} × esperado ${brl(esperado)} (tolerância ${(S.t.par.tol*100).toFixed(1)}%)`}
    else n.status='conferida'}
  else n.status='conferida';
  log('nota_fiscal',n.num,'status','rateada',n.status,n.diverg);save();toast(n.status==='conferida'?'Conferida':'Divergente: volta para Compras');render()}
function liberar(id){const n=S.t.notas.find(x=>x.id===id);
  if(n.oc){const o=S.t.ocs.find(x=>x.id===n.oc);if(!(o.recebido>0))return toast('Pagamento só com recebimento confirmado (E19)')}
  n.status='liberada';log('nota_fiscal',n.num,'status','conferida','liberada');save();toast('Liberada para pagamento');render()}
function pagar(id){const n=S.t.notas.find(x=>x.id===id);if(bloqueada(hojeISO(),'pagamento'))return;n.status='paga';n.pago=hojeISO();log('nota_fiscal',n.num,'status','liberada','paga');save();toast('Pago');render()}

