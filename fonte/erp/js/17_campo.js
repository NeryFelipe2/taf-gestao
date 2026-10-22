/* ============ CAMPO: apontamento diário (Fase 8) ============ */
const dow=s=>new Date(s+'T12:00:00').getDay();
const segunda=s=>addDias(s,-((dow(s)+6)%7));
const duDesde=s=>{let n=0,d=s;while(d<hojeISO()){d=addDias(d,1);if(![0,6].includes(dow(d)))n++}return n};
const ontemUtil=()=>{let d=addDias(hojeISO(),-1);while([0,6].includes(dow(d)))d=addDias(d,-1);return d};
const custoHora=f=>((S.D.banco_mo||[]).find(x=>x.funcao===f)||{}).custo_hora||0;
const FUNCOES=()=>(S.D.banco_mo||[]).map(x=>x.funcao);
function aptCalc(a){const i=S.byCod[a.item]||{};const hh=(a.pessoas||[]).reduce((s,p)=>s+p.n*p.h,0);
  const cmo=(a.pessoas||[]).reduce((s,p)=>s+p.n*p.h*custoHora(p.funcao),0),ceq=(a.equip||[]).reduce((s,e)=>s+(+e.h||0)*(+e.rh||0),0);
  return {hh,cmo,ceq,custo:cmo+ceq,va:a.qtd*(i.meta_unit||0),ref:(i.hh_unit||0)*a.qtd}}
const prodAcum=cod=>S.t.apts.filter(a=>a.item===cod&&a.status==='aprovado').reduce((s,a)=>s+a.qtd,0);
const APT_ST={rascunho:['mute','Rascunho'],conferido:['info','Conferido'],aprovado:['ok','Aprovado']};
function prodTabela(){
  const m={};S.t.apts.filter(a=>a.status==='aprovado').forEach(a=>{const c=aptCalc(a);const r=m[a.item]=m[a.item]||{qtd:0,hh:0,ref:0,custo:0,va:0};r.qtd+=a.qtd;r.hh+=c.hh;r.ref+=c.ref;r.custo+=c.custo;r.va+=c.va});
  return Object.entries(m).map(([cod,r])=>({i:S.byCod[cod],...r,fis:S.byCod[cod].qtd?Math.min(1,r.qtd/S.byCod[cod].qtd):0,ind:r.hh>0&&r.ref>0?r.ref/r.hh:null}))}
function tabProd(L){
  return L.length?`<div class="tw"><table class="tbl"><thead><tr><th>Item</th><th class="r">Produzido</th><th class="r">% físico</th><th class="r">HH real</th><th class="r">HH referência</th><th class="r">Produtividade</th><th class="r">Custo MO</th><th class="r">Valor agregado</th></tr></thead><tbody>${L.map(r=>`<tr class="clk" data-item="${r.i.codigo}"><td><span class="mono">${r.i.codigo}</span><div class="mut" style="font-size:11.5px">${esc(r.i.descricao.slice(0,60))}</div></td><td class="r">${num(r.qtd)} ${esc(r.i.unidade||'')}</td><td class="r">${Math.round(r.fis*100)}%</td><td class="r">${num(r.hh)}</td><td class="r">${r.ref?num(r.ref):'—'}</td><td class="r ${r.ind!=null&&r.ind<.9?'neg':''}">${r.ind!=null?r.ind.toFixed(2).replace('.',','):'—'}</td><td class="r">${brl(r.custo)}</td><td class="r">${brl(r.va)}</td></tr>`).join('')}</tbody></table></div><div class="sub" style="margin-top:8px">Produtividade = HH de referência (CPU Saneago) ÷ HH real: abaixo de 1,00 gasta mais horas que o previsto. O % físico alimenta VA e IDC.</div>`:'<div class="sub" style="padding:18px">Nenhum apontamento aprovado ainda.</div>'}
let APT=null;
function viewCampo(X){
  const tab=S.tab.campo||'dia',A=S.t.apts;
  const pend=A.filter(a=>a.status!=='aprovado');
  const hoje=A.filter(a=>a.data===hojeISO()),cs=hoje.map(aptCalc);
  const sem=S.t.frozen&&!A.some(a=>a.data===ontemUtil());
  let b='';
  if(tab==='dia'){
    b=`${sem?`<div class="alert" style="margin-top:12px"><div class="g" style="color:var(--warn)">!</div><div><b>Sem apontamento em ${fdata(ontemUtil())}</b><p>Último dia útil sem registro. Lance ou justifique (retroativo fica marcado).</p></div></div>`:''}
    <div class="tw">${A.length?`<table class="tbl"><thead><tr><th>Apontamento</th><th>Item</th><th class="r">Qtd</th><th class="r">HH</th><th class="r">Custo MO</th><th>Status</th><th></th></tr></thead><tbody>${A.slice(0,150).map(a=>{const c=aptCalc(a),i=S.byCod[a.item]||{},st=APT_ST[a.status];
      return `<tr><td class="mono">${a.num}<div class="mut" style="font-size:11.5px">${fdata(a.data)} · ${esc(a.quem)}${a.retro?' · retroativo':''}${a.tarde?' · conferido após 9h':''}</div></td><td><span class="mono">${a.item}</span><div class="mut" style="font-size:11.5px">${esc((i.descricao||'').slice(0,50))}${a.parou?' · parada '+num(a.horasParada)+'h: '+esc(a.motivoParada||''):''}${a.chuva?' · chuva '+a.chuva+' mm':''}</div></td><td class="r">${num(a.qtd)} ${esc(i.unidade||'')}</td><td class="r">${num(c.hh)}</td><td class="r">${brl(c.cmo)}</td><td><span class="pill ${st[0]}">${st[1]}</span></td>
      <td class="r">${a.status==='rascunho'?`<button class="btn sm" data-act="apt-conf" data-id="${a.id}" ${can('apontar')?'':'disabled'}>Conferir</button>`:a.status==='conferido'?`<button class="btn sm ok" data-act="apt-apr" data-id="${a.id}" ${can('aprovarApt')?'':'disabled title="Só Engenheiro ou Gerente"'}>Aprovar</button>`:''}</td></tr>`}).join('')}</tbody></table>`:'<div class="sub" style="padding:18px">Nenhum apontamento. Toque em “Novo apontamento” para registrar o dia da frente.</div>'}</div>`}
  if(tab==='prod')b=tabProd(prodTabela());
  return `<div class="head"><div><h1>Campo</h1><p class="lead">Apontamento diário por frente: quantidade, equipe, máquinas, chuva e paradas. Fluxo <b>rascunho → conferido → aprovado</b>; só o aprovado vira % físico (VA e IDC). ${MODO_SB?'Sem sinal, o registro fica guardado no aparelho e sobe sozinho.':''}</p></div>
   <button class="btn dark" data-act="novo-apt" ${can('apontar')?'':'disabled title="Só Encarregado, Engenheiro ou Gerente"'}>Novo apontamento</button></div>
   <div class="kpi4"><div><div class="k-l">Aguardando aprovação</div><div class="v ${pend.length?'neg':''}">${pend.length}</div></div><div><div class="k-l">Produzido hoje (VA)</div><div class="v">${brl(cs.reduce((s,c)=>s+c.va,0),true)}</div></div><div><div class="k-l">HH hoje</div><div class="v">${num(cs.reduce((s,c)=>s+c.hh,0))}</div></div><div><div class="k-l">Custo MO hoje</div><div class="v">${brl(cs.reduce((s,c)=>s+c.cmo,0),true)}</div></div></div>
   <div class="toolbar">${tabs('campo',[['dia','Apontamentos '+A.length],['prod','Produção por item']],tab)}</div>${b}`}
function modalApt(){
  APT={data:hojeISO(),item:S.D.items[0].codigo,qtd:'',chuva:0,pessoas:[{funcao:FUNCOES()[0]||'',n:1,h:8}],equip:[],parou:false,motivoParada:'',horasParada:0,obs:''};pintaApt()}
function lerApt(){if(!APT||!$('#a-item'))return;APT.data=$('#a-d').value;APT.item=$('#a-item').value;APT.qtd=$('#a-q').value;APT.chuva=+$('#a-ch').value||0;APT.parou=$('#a-pa').checked;APT.motivoParada=$('#a-mo').value;APT.horasParada=+$('#a-hp').value||0;APT.obs=$('#a-ob').value;
  document.querySelectorAll('[data-pk]').forEach(e=>{const k=+e.dataset.pk,f=e.dataset.f;const v=f==='funcao'?e.value:+e.value||0;APT.pessoas[k][f]=v});
  document.querySelectorAll('[data-ek]').forEach(e=>{const k=+e.dataset.ek,f=e.dataset.f;APT.equip[k][f]=f==='nome'?e.value:+e.value||0})}
function pintaApt(){
  const i=S.byCod[APT.item];
  modal(`<h3>Apontamento do dia</h3><div class="sub">Um registro por frente (item da EAP) e dia.</div>
  <div class="g2"><div><label>Data</label><input id="a-d" type="date" value="${APT.data}" max="${hojeISO()}"></div><div><label>Chuva (mm)</label><input id="a-ch" type="number" min="0" step="any" value="${APT.chuva}"></div></div>
  <label>Frente / item</label><select id="a-item">${itemOptions(APT.item)}</select>
  <label>Quantidade executada ${i&&i.unidade?'('+esc(i.unidade)+')':''}</label><input id="a-q" type="number" min="0" step="any" value="${APT.qtd}" inputmode="decimal">
  <div class="sub" style="margin-top:6px">${i?`Orçado ${num(i.qtd)} · já aprovado ${num(prodAcum(i.codigo))}${i.hh_unit?` · referência ${num(i.hh_unit)} HH/${esc(i.unidade||'un')}`:''}`:''}</div>
  <label>Equipe (pessoas × horas) <button class="btn sm" data-act="apt-ponto" style="margin-left:8px">Puxar do ponto</button></label>${APT.pessoas.map((p,k)=>`<div class="pr"><select data-pk="${k}" data-f="funcao">${FUNCOES().map(f=>`<option ${f===p.funcao?'selected':''}>${esc(f)}</option>`).join('')}</select><input data-pk="${k}" data-f="n" type="number" min="0" step="1" value="${p.n}" aria-label="pessoas"><input data-pk="${k}" data-f="h" type="number" min="0" step="any" value="${p.h}" aria-label="horas"><button class="btn sm" data-act="apt-delp" data-k="${k}">×</button></div>`).join('')}<button class="btn sm" style="margin-top:6px" data-act="apt-addp">+ função</button>
  <label>Equipamentos (horas, R$/h opcional, horas paradas)</label>${APT.equip.map((e,k)=>`<div class="pr"><input data-ek="${k}" data-f="nome" placeholder="Equipamento" list="frota-l" value="${esc(e.nome)}"><input data-ek="${k}" data-f="h" type="number" min="0" step="any" value="${e.h}" aria-label="horas"><input data-ek="${k}" data-f="rh" type="number" min="0" step="any" value="${e.rh}" aria-label="R$/h"><button class="btn sm" data-act="apt-dele" data-k="${k}">×</button></div>`).join('')}<button class="btn sm" style="margin-top:6px" data-act="apt-adde">+ equipamento</button><datalist id="frota-l">${(S.t.frts||[]).map(v=>`<option value="${esc(v.cod)}">${esc(v.desc)}</option>`).join('')}</datalist>
  <label style="display:flex;gap:8px;align-items:center;text-transform:none;letter-spacing:0"><input id="a-pa" type="checkbox" style="width:auto" ${APT.parou?'checked':''}> Houve parada</label>
  <div class="g2"><div><label>Motivo da parada</label><input id="a-mo" value="${esc(APT.motivoParada)}"></div><div><label>Horas paradas</label><input id="a-hp" type="number" min="0" step="any" value="${APT.horasParada}"></div></div>
  <label>Observação</label><textarea id="a-ob" rows="2">${esc(APT.obs)}</textarea>
  <div class="acts"><button class="btn" data-act="fechar">Cancelar</button><button class="btn dark" data-act="apt-ok">Salvar rascunho</button></div>`);
  $('#a-item').onchange=()=>{lerApt();pintaApt()}}
function doApt(){lerApt();frotaAplicaRh();const q=+APT.qtd;if(!(q>=0)||APT.qtd==='')return toast('Informe a quantidade (0 se não produziu)');
  if(!APT.data||APT.data>hojeISO())return toast('Data inválida');
  if(!APT.pessoas.some(p=>p.n>0&&p.h>0)&&q>0)return toast('Informe a equipe');
  if(S.t.apts.some(a=>a.data===APT.data&&a.item===APT.item&&a.status!=='rascunho'))return toast('Já há apontamento conferido/aprovado deste item neste dia');
  const a={id:'apt'+Date.now(),num:nextNum('apt'),data:APT.data,item:APT.item,qtd:q,chuva:APT.chuva,pessoas:APT.pessoas.filter(p=>p.n>0&&p.h>0),equip:APT.equip.filter(e=>e.nome),parou:APT.parou,motivoParada:APT.motivoParada,horasParada:APT.horasParada,obs:APT.obs,status:'rascunho',quem:user(),criado:new Date().toISOString()};
  S.t.apts.unshift(a);log('apontamento',a.num,'lançado','',num(q)+' · '+a.item);save();closeModal();toast(a.num+' salvo como rascunho');render()}
function aptConf(id){const a=S.t.apts.find(x=>x.id===id);if(!can('apontar'))return;a.status='conferido';a.conferidoPor=user();a.conferidoEm=new Date().toISOString();
  if(a.conferidoEm.slice(0,10)>addDias(a.data,1)||(a.conferidoEm.slice(0,10)===addDias(a.data,1)&&new Date().getHours()>=9))a.tarde=true;
  log('apontamento',a.num,'status','rascunho','conferido');save();toast(a.num+' conferido');render()}
function aptApr(id){const a=S.t.apts.find(x=>x.id===id);if(!can('aprovarApt'))return toast('Sem alçada');if(a.quem===user()&&S.role!=='admin')return toast('Quem lança não aprova');
  a.status='aprovado';a.aprovadoPor=user();if(hojeISO()>addDias(a.data,1))a.retro=true;log('apontamento',a.num,'status','conferido','aprovado'+(a.retro?' (retroativo)':''));save();toast(a.num+' aprovado · % físico atualizado');render()}

