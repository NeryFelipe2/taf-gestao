/* ============ MEDIÇÃO E RESULTADO POR ITEM ============ */
const medAcum=(cod,so)=>S.t.meds.filter(m=>m.item===cod&&(so?m.status==='atestada':true)).reduce((s,m)=>s+m.qtd,0);
function resItem(i){const s=S.sd[i.codigo],q=medAcum(i.codigo,true),pu=i.qtd?i.preco_venda_total/i.qtd:0,rec=q*pu,fis=i.qtd?Math.min(1,Math.max(q,prodAcum(i.codigo))/i.qtd):0,va=fis*i.meta_total;
  const idc=s.real>0?va/s.real:null,res=rec-s.real;
  let sem='mute',txt='sem dados';if(s.real>0||rec>0){if(res<0||(idc!=null&&idc<.9)){sem='bad';txt=res<0?'prejuízo':'IDC < 0,90'}else if(idc!=null&&idc<.95){sem='warn';txt='atenção'}else{sem='ok';txt='lucro'}}
  return {q,rec,fis,va,idc,res,real:s.real,sem,txt,mg:rec>0?res/rec:null}}
function viewMed(X){
  const tab=S.tab.med||'res';const M=S.t.meds;
  const todos=S.D.items.map(i=>({i,r:resItem(i)}));
  const comDado=todos.filter(x=>x.r.rec>0||x.r.real>0);
  const rec=todos.reduce((s,x)=>s+x.r.rec,0),cus=todos.reduce((s,x)=>s+x.r.real,0),va=todos.reduce((s,x)=>s+x.r.va,0);
  const idc=cus>0?va/cus:null,eac=idc?cus+(X.meta-va)/idc:null;
  let b='';
  if(tab==='res'){
    b=`<div class="kpi4"><div><div class="k-l">Receita medida (atestada)</div><div class="v">${brl(rec,true)}</div></div><div><div class="k-l">Custo realizado</div><div class="v">${brl(cus,true)}</div></div><div><div class="k-l">Resultado</div><div class="v ${rec-cus>=0?'pos':'neg'}">${brl(rec-cus,true)}</div></div><div><div class="k-l">IDC da obra</div><div class="v ${idc!=null&&idc<.95?'neg':''}">${idc!=null?idc.toFixed(2).replace('.',','):'—'}</div></div></div>
    <div class="sub" style="margin-top:8px">${eac?`EAC (previsão de custo final) = realizado + (meta − VA) ÷ IDC = <b>${brl(eac,true)}</b> contra meta de ${brl(X.meta,true)}. `:''}VA = % físico × meta do item; o % físico vem do apontamento aprovado (Campo) ou da medição atestada, o que for maior. IDC abaixo de 0,95 alerta; abaixo de 0,90 entra na pauta.</div>
    <div class="tw">${comDado.length?`<table class="tbl"><thead><tr><th>Item</th><th class="r">% físico</th><th class="r">Receita medida</th><th class="r">Custo realizado</th><th class="r">Resultado</th><th class="r">IDC</th><th>Situação</th></tr></thead><tbody>${comDado.map(({i,r})=>`<tr class="clk" data-item="${i.codigo}"><td><span class="mono">${i.codigo}</span><div class="mut" style="font-size:11.5px">${esc(i.descricao.slice(0,60))}</div></td><td class="r">${Math.round(r.fis*100)}%</td><td class="r">${brl(r.rec)}</td><td class="r">${brl(r.real)}</td><td class="r ${r.res<0?'neg':'pos'}">${brl(r.res)}</td><td class="r">${r.idc!=null?r.idc.toFixed(2).replace('.',','):'—'}</td><td><span class="pill ${r.sem}">${r.txt}</span></td></tr>`).join('')}</tbody></table>`:empty('Ainda sem medição nem custo.','Lance e ateste uma medição; o custo vem das notas rateadas.')}</div>`}
  if(tab==='pac'){
    const L=S.D.pacotes.filter(p=>p._it.length).map(p=>{const rs=p._it.map(resItem);const rec=rs.reduce((s,r)=>s+r.rec,0),cus=rs.reduce((s,r)=>s+r.real,0),va=rs.reduce((s,r)=>s+r.va,0);return {p,rec,cus,va,idc:cus>0?va/cus:null}}).filter(x=>x.rec>0||x.cus>0);
    b=L.length?`<div class="tw"><table class="tbl"><thead><tr><th>Pacote</th><th class="r">Receita medida</th><th class="r">Custo realizado</th><th class="r">Resultado</th><th class="r">IDC</th></tr></thead><tbody>${L.map(x=>`<tr><td><b>${esc(x.p.nome)}</b><div class="mono mut">${x.p.codigo}</div></td><td class="r">${brl(x.rec)}</td><td class="r">${brl(x.cus)}</td><td class="r ${x.rec-x.cus<0?'neg':'pos'}">${brl(x.rec-x.cus)}</td><td class="r">${x.idc!=null?x.idc.toFixed(2).replace('.',','):'—'}</td></tr>`).join('')}</tbody></table></div>`:empty('Sem dados por pacote ainda.','Medição atestada e notas rateadas alimentam esta visão.')}
  if(tab==='bm'){
    b=M.length?`<div class="tw"><table class="tbl"><thead><tr><th>BM</th><th>Item</th><th class="r">Qtd medida</th><th class="r">Valor</th><th>Status</th><th></th></tr></thead><tbody>${M.map(m=>{const i=S.byCod[m.item],pu=i.qtd?i.preco_venda_total/i.qtd:0;return `<tr><td class="mono">${m.num}<div class="mut" style="font-size:11.5px">${fdata(m.periodo)} · ${esc(m.quem)}</div></td><td><span class="mono">${m.item}</span><div class="mut" style="font-size:11.5px">${esc(i.descricao.slice(0,50))}</div></td><td class="r">${num(m.qtd)} ${i.unidade||''}</td><td class="r">${brl(m.qtd*pu)}</td><td><span class="pill ${m.status==='atestada'?'ok':'warn'}">${m.status}</span></td><td class="r">${m.status==='lancada'?`<button class="btn sm ok" data-act="atestar" data-id="${m.id}" ${can('atestar')&&m.quem!==user()?'':'disabled title="Só Gerente/Diretoria, e não quem lançou"'}>Atestar</button>`:''}</td></tr>`}).join('')}</tbody></table></div>`:empty('Nenhuma medição ainda.','O engenheiro lança a quantidade medida do item; o gerente atesta.')}
  return `<div class="head"><div><h1>Medição e resultado</h1><p class="lead">De cada item da planilha vem uma medição. Receita medida contra custo realizado diz se o item dá <b>lucro ou prejuízo</b>.</p></div>
   <button class="btn dark" data-act="nova-med" ${can('medir')?'':'disabled title="Só Engenheiro ou Gerente"'}>Lançar medição</button></div>
   <div class="toolbar">${tabs('med',[['res','Resultado por item'],['pac','Por pacote'],['bm','Boletins '+M.length]],tab)}</div>${b}`}
function modalMed(){
  modal(`<h3>Lançar medição</h3><div class="sub">Quantidade executada no período, por item. Receita = quantidade × preço licitado unitário.</div>
   <label>Item</label><select id="m-item">${itemOptions()}</select><div class="g2"><div><label>Quantidade medida</label><input id="m-q" type="number" step="any" min="0"></div><div><label>Período</label><input id="m-d" type="date" value="${hojeISO()}"></div></div><div id="m-info" class="sub" style="margin-top:8px"></div>
   <div class="acts"><button class="btn" data-act="fechar">Cancelar</button><button class="btn dark" data-act="med-ok">Lançar</button></div>`);
  const upd=()=>{const i=S.byCod[$('#m-item').value],ac=medAcum(i.codigo);$('#m-info').innerHTML=`Orçado ${num(i.qtd)} ${i.unidade||''} · já medido ${num(ac)} · restam <b>${num(i.qtd-ac)}</b> · preço unit. ${brl(i.qtd?i.preco_venda_total/i.qtd:0)}`};$('#m-item').onchange=upd;upd()}
function doMed(){const cod=$('#m-item').value,q=+$('#m-q').value,i=S.byCod[cod];if(!(q>0))return toast('Informe a quantidade');
  if(medAcum(cod)+q>i.qtd+1e-6)return toast('Medido acima do orçado ('+num(medAcum(cod)+q)+' > '+num(i.qtd)+')');
  const m={id:'m'+Date.now(),num:nextNum('bm'),item:cod,qtd:q,periodo:$('#m-d').value||hojeISO(),status:'lancada',quem:user()};S.t.meds.unshift(m);log('medicao',m.num,'lançada','',num(q)+' '+(i.unidade||'')+' · '+cod);save();closeModal();toast(m.num+' lançada · aguarda atesto');S.tab.med='bm';render()}
function doAtestar(id){const m=S.t.meds.find(x=>x.id===id);if(m.quem===user())return toast('Quem lança não atesta');if(!can('atestar'))return toast('Sem alçada');
  m.status='atestada';m.atestado=user();log('medicao',m.num,'status','lancada','atestada');save();toast(m.num+' atestada');render()}

