/* ---------- Aba "Tarefas por Obra" (#tarobra): mesma lista da aba Tarefas, no formato do painel da WCR ----------
   Lê tarAll() (planilha de gestão + edições do banco). Toda edição passa por setCampo/edAplica: salva em taf_tarefa_edicao e todos veem.
   Link direto: #tarobra, #tarobra/<pessoa> (ex.: #tarobra/marko) e #tarobra/obra-<código> (ex.: #tarobra/obra-342). */
var CX_TIME=['Thadeu','Fabrício','Alecio','Felipe','Marko Aurélio','Elias','Thalita','Carlos Quirino'];
var CX_ALIAS={tadeu:'thadeu'};
var CX_CARGO0={thadeu:'Diretoria',fabricio:'Diretoria',alecio:'Gestão',felipe:'Gestão'};
var CX_GRP=['Diretoria','Gestão','Equipe'];
var CX_ENC0={'342':'Marko Aurélio (eng.) · Fabrício (dir. de obra)','343':'Elias (eng.) · Fabrício (dir. de obra)'};
var CX_CARGO_KEY='taf-tarobra-cargo-v1',CX_ENC_KEY='taf-tarobra-enc-v1',CXC={},CXE={},CXPREV=null,CXHASH=null;
try{CXC=JSON.parse(localStorage.getItem(CX_CARGO_KEY)||'{}')||{};CXE=JSON.parse(localStorage.getItem(CX_ENC_KEY)||'{}')||{}}catch(e){}
function cxSave(){try{localStorage.setItem(CX_CARGO_KEY,JSON.stringify(CXC));localStorage.setItem(CX_ENC_KEY,JSON.stringify(CXE))}catch(e){}}
var cxK=function(n){var k=norm(n).trim().split(/\s+/)[0]||'';return CX_ALIAS[k]||k};
var cxSlug=function(n){return norm(n).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')};
function cxCanon(n){var k=cxK(n),t=null;CX_TIME.forEach(function(x){if(cxK(x)===k)t=x});return t||n}
/* "Alecio, Thadeu e Felipe" vira três pessoas; "(Thadeu nomeia, R42)" sai; sem dono vira "Sem dono" */
function cxPes(d){var s=String(d||'').replace(/\([^)]*\)/g,'').trim();if(!s)return ['Sem dono'];
  var o=[];s.split(/\s*,\s*|\s+e\s+/).forEach(function(x){x=cxCanon(x.trim());if(x&&o.indexOf(x)<0)o.push(x)});return o.length?o:['Sem dono']}
var cxCargo=function(p){return CXC[p]||CX_CARGO0[cxK(p)]||'Equipe'};
var cxEnc=function(o){return CXE[o]!=null?CXE[o]:(CX_ENC0[o]||'')};
var CXN={fe:'Feita',ea:'Em andamento',ab:'Aberta',at:'Atrasada'},CXCOR=['fe','ea','ab','at'],CXORD={at:0,ab:1,ea:2,fe:3};
/* com pessoa ou obra escolhida, tudo numa página só (é a tela do print da manhã) */
var CX={vis:'p',fp:'',fo:'',grp:'',dd:'',st:{ab:1,ea:1,at:1,fe:0},q:'',sort:'cat',page:1,per:20,dias:0};
function cxIsoMs(ms){var d=new Date(ms);return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2)}
function cxRows(){var h=hojeEf(),c0=corte()||h,nn=0;return tarAll().map(function(t){
  var ped=t.pedido||(t.novo&&/^N\d{12,15}$/.test(t.id)?cxIsoMs(+t.id.slice(1)):c0),cat=t.sit==='RESOLVIDA'?'fe':t.alerta==='VENCIDA'?'at':t.sit==='MONITORAR'?'ea':'ab',ps=cxPes(t.dono);
  return {id:t.id,ref:t.novo?'NOVA '+(++nn):t.n,novo:t.novo,dono:t.dono||'',ps:ps,d:ped,dPl:!t.pedido&&!t.novo,t:t.txt||'',r:t.resposta||'',obra:String(t.obra||''),prazo:t.prazo||'',atraso:t.atraso,
    cat:cat,pr:!!t.prio,age:Math.max(0,dif(h,ped)),cargos:ps.map(cxCargo)}})}
var cxTemP=function(r,p){return r.ps.indexOf(p)>=0};
var cxBase=function(rows,skip){return rows.filter(function(r){return (skip==='p'||!CX.fp||cxTemP(r,CX.fp))&&(skip==='o'||!CX.fo||r.obra===CX.fo)&&(!CX.grp||r.cargos.indexOf(CX.grp)>=0)&&(!CX.dias||r.age<=CX.dias)&&(!CX.dd||r.d===CX.dd)})};
var cxCnt=function(a){var c={fe:0,ea:0,ab:0,at:0};a.forEach(function(r){c[r.cat]++});return c};
var cxTot=function(c){return c.fe+c.ea+c.ab+c.at};
var cxBar=function(c){var t=cxTot(c)||1;return CXCOR.map(function(k){return '<i class="'+k+'" style="width:'+(c[k]/t*100)+'%"></i>'}).join('')};
var cxPill=function(k){return '<span class="cx-pill '+k+'">'+CXN[k]+'</span>'};
var cxIni=function(n){return esc(String(n).trim().charAt(0).toUpperCase())};
var cxPct=function(a,b){return b?Math.round(a/b*100):0};
var cxON=function(o){return o?nomeObra(o):'Sem obra'};
function cxPg(n,cur){var s={},o=[],last=0;[1,2,cur-1,cur,cur+1,n-1,n].forEach(function(p){if(p>=1&&p<=n)s[p]=1});Object.keys(s).map(Number).sort(function(a,b){return a-b}).forEach(function(p){if(last&&p-last>1)o.push('…');o.push(p);last=p});return o}
function cxFill(el,opts,val){var sig=opts.map(function(o){return o[0]}).join('|');if(el.dataset.sig!==sig){el.innerHTML=opts.map(function(o){return '<option value="'+esc(o[0])+'">'+esc(o[1])+'</option>'}).join('');el.dataset.sig=sig}if(val!=null)el.value=val}
function cxPessoas(all){var m={};CX_TIME.forEach(function(p){m[p]=1});all.forEach(function(r){r.ps.forEach(function(p){m[p]=1})});
  var ab={};all.forEach(function(r){if(r.cat!=='fe')r.ps.forEach(function(p){ab[p]=(ab[p]||0)+1})});
  return Object.keys(m).sort(function(a,b){return (CX_GRP.indexOf(cxCargo(a))-CX_GRP.indexOf(cxCargo(b)))||((ab[b]||0)-(ab[a]||0))||a.localeCompare(b)})}
function cxObras(all){var l=obrasTodas().slice();all.forEach(function(r){if(l.indexOf(r.obra)<0)l.push(r.obra)});return l}
function cxDonos(all){var m={};CX_TIME.forEach(function(p){m[p]=1});all.forEach(function(r){if(r.dono)m[r.dono]=1});return [['','sem dono']].concat(Object.keys(m).sort().map(function(d){return [d,d]}))}
function cxLink(spec){var b=location.origin+location.pathname;return b+'#tarobra'+(spec&&spec!=='all'?'/'+(spec.charAt(0)==='o'?'obra-'+spec.slice(2):cxSlug(spec.slice(2))):'')}
function cxHashSet(){if(S.tab!=='tarobra')return;var h='#tarobra'+(CX.fp?'/'+cxSlug(CX.fp):CX.fo?'/obra-'+CX.fo:'');try{if(location.hash!==h)history.replaceState(null,'',location.pathname+location.search+h)}catch(e){}}
function cxHashLe(pes){var m=/^#tarobra\/(.+)$/.exec(location.hash||'');CXHASH=null;if(!m)return;var v=decodeURIComponent(m[1]);
  if(/^obra-/.test(v)){CX.vis='o';CX.fo=v.slice(5);CX.fp='';return}
  var s=cxSlug(v),a=pes.filter(function(p){return cxSlug(p)===s})[0]||pes.filter(function(p){return cxSlug(p).indexOf(s)===0||cxK(p)===s})[0];if(a){CX.vis='p';CX.fp=a;CX.fo=''}}
function rTarobra(){var side=$('cx-side');if(!side)return '';
  var all=cxRows(),pes=cxPessoas(all),obs=cxObras(all);
  if(CXHASH!==location.hash){CXHASH=location.hash;cxHashLe(pes);CXHASH=location.hash}
  $('n-to').textContent=all.filter(function(r){return r.cat!=='fe'}).length;
  /* ---- lateral: controle de tarefas */
  var vp=CX.vis==='p',bs=cxBase(all,vp?'p':'o');
  var nomes=vp?pes.filter(function(p){return !CX.grp||cxCargo(p)===CX.grp}):obs;
  var item=function(nm,rs,cur){var c=cxCnt(rs),t=cxTot(c),abertas=t-c.fe,np={};rs.forEach(function(r){r.ps.forEach(function(p){np[p]=1})});var peps=Object.keys(np).length,key=nm?(vp?'p:':'o:')+nm:'all',enc=(!vp&&nm)?cxEnc(nm):'';
    return '<div class="cx-it'+(cur?' on':'')+'"><button type="button" class="cx-itb" '+(vp?'data-fp':'data-fo')+'="'+esc(nm)+'"><span class="cx-av">'+cxIni(nm||'T')+'</span><span class="cx-nm"><b>'+esc(nm?(vp?nm:cxON(nm)):(vp?'Todas as pessoas':'Todas as obras'))+'</b>'+(enc?'<small title="'+esc(enc)+'">'+esc(enc)+'</small>':'')+'<small>'+(vp&&nm?esc(cxCargo(nm))+' · ':'')+abertas+' em aberto de '+t+(vp?'':' · '+peps+' pessoa'+(peps===1?'':'s'))+'</small><span class="cx-pb">'+cxBar(c)+'</span></span>'+(c.at?'<em class="cx-late">'+c.at+' atras.</em>':'')+'</button>'+
      '<div class="cx-ia"><button type="button" data-xc="'+esc(key)+'" title="Copiar a cobrança (abertas, atrasadas e em andamento) para colar no WhatsApp">Copiar</button><button type="button" data-xv="'+esc(key)+'" title="Baixar CSV (abertas, atrasadas e em andamento)">CSV</button><button type="button" data-xl="'+esc(key)+'" title="Copiar o link direto desta lista">Link</button></div></div>'};
  side.innerHTML='<div class="cx-ht"><span class="cx-ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 13 9 5 9-5"/></svg></span><h3>Controle de tarefas</h3></div>'+
    '<div class="cx-seg" role="group" aria-label="Visão"><button type="button" data-vis="p" aria-pressed="'+vp+'">Por pessoa</button><button type="button" data-vis="o" aria-pressed="'+(!vp)+'">Por obra</button></div>'+
    (vp?'<div class="cx-gr" role="group" aria-label="Grupo">'+[''].concat(CX_GRP).map(function(g){return '<button type="button" data-grp="'+g+'" aria-pressed="'+(CX.grp===g)+'">'+(g||'Todos')+'</button>'}).join('')+'</div>':'')+
    '<div class="cx-list">'+item('',bs,vp?!CX.fp:!CX.fo)+nomes.map(function(n){return item(n,bs.filter(function(r){return vp?cxTemP(r,n):r.obra===n}),vp?CX.fp===n:CX.fo===n)}).join('')+'</div>';
  /* ---- resumo */
  var base=cxBase(all),c=cxCnt(base),t=cxTot(c),pm={},om={};base.forEach(function(r){r.ps.forEach(function(p){pm[p]=(pm[p]||0)+1});om[r.obra]=(om[r.obra]||0)+1});
  var pesN=Object.keys(pm).length,obN=Object.keys(om).length,sig=JSON.stringify(c),sm=$('cx-sum');
  sm.innerHTML='<h3 class="cx-h">Resumo</h3><div class="cx-l1"><span>Total de tarefas: <b>'+t+'</b> <em>'+pesN+' pessoa'+(pesN===1?'':'s')+' · '+obN+' obra'+(obN===1?'':'s')+'</em></span><span>Concluído: <b>'+cxPct(c.fe,t)+'%</b></span></div><div class="cx-sb">'+cxBar(c)+'</div>'+
    '<div class="cx-lg">'+CXCOR.map(function(k){return '<span><i class="'+k+'"></i>'+CXN[k]+((c[k]===1||k==='ea')?'':'s')+' <em>'+c[k]+'</em> <b>'+cxPct(c[k],t)+'%</b></span>'}).join('')+'</div>'+
    '<div class="cx-sec"><h4>Pendentes por obra (abertas, atrasadas e em andamento)</h4><div class="cx-chs">'+obs.map(function(o){var L=base.filter(function(r){return r.cat!=='fe'&&r.obra===o}),a=L.filter(function(r){return r.cat==='at'}).length;return L.length?'<button type="button" class="cx-chip" data-fo="'+esc(o)+'">'+esc(cxON(o))+' <b>'+L.length+'</b>'+(a?' <em class="cx-late">'+a+' atras.</em>':'')+'</button>':''}).join('')+'</div></div>';
  if(CXPREV&&CXPREV!==sig){sm.classList.remove('cx-flash');void sm.offsetWidth;sm.classList.add('cx-flash')}CXPREV=sig;
  /* ---- detalhe */
  var tit=CX.fp&&CX.fo?CX.fp+' em '+cxON(CX.fo):(CX.fp||(CX.fo?cxON(CX.fo):'')||'Todas as tarefas'),pend=base.filter(function(r){return r.cat!=='fe'}).sort(function(a,b){return (b.atraso||0)-(a.atraso||0)||b.age-a.age}),ult=base.reduce(function(m,r){return r.d>m?r.d:m},'');
  var srt=function(m){return Object.keys(m).map(function(k){return [k,m[k]]}).sort(function(a,b){return b[1]-a[1]})};
  var lst=function(arr,att,lab){return arr.map(function(x){return '<button type="button" class="cx-chip" '+att+'="'+esc(x[0])+'">'+esc(lab?lab(x[0]):x[0])+' <b>'+x[1]+'</b></button>'}).join('')||'<span class="cx-mu">-</span>'};
  var maisAtr=pend.filter(function(r){return r.cat==='at'})[0];
  $('cx-det').innerHTML='<div class="cx-ht"><span class="cx-ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg></span><h3>Detalhe</h3></div>'+
    '<div class="cx-who"><span class="cx-av big">'+cxIni(tit)+'</span><div><b>'+esc(tit)+'</b><small>'+(CX.fp?esc(cxCargo(CX.fp)):(CX.fo?esc(cxEnc(CX.fo)||'Obra'):'Equipe completa'))+'</small></div><span class="cx-badge '+(c.at?'at':'fe')+'">'+(c.at?c.at+' atrasada'+(c.at>1?'s':''):'Em dia')+'</span></div>'+
    '<div class="cx-kv"><div><small>Tarefas</small><b>'+t+'</b></div><div><small>Concluído</small><b>'+cxPct(c.fe,t)+'%</b></div><div><small>Em andamento</small><b>'+c.ea+'</b></div><div><small>Abertas</small><b>'+c.ab+'</b></div><div><small>Último pedido</small><b>'+(ult?ddmm(ult):'-')+'</b></div><div><small>Maior atraso</small><b>'+(maisAtr?dTxt(maisAtr.atraso):'-')+'</b></div>'+
    (CX.fp?'<div class="w2"><small>Grupo (editável, fica neste aparelho)</small><select data-cxcargo>'+CX_GRP.map(function(g){return '<option'+(g===cxCargo(CX.fp)?' selected':'')+'>'+g+'</option>'}).join('')+'</select></div>':'')+
    (CX.fo?'<div class="w2"><small>Responsáveis da obra (editável, fica neste aparelho)</small><input data-cxenc value="'+esc(cxEnc(CX.fo))+'" aria-label="Responsáveis da obra"></div>':'')+'</div>'+
    '<div class="cx-sec"><h4>Obras</h4><div class="cx-chs">'+lst(srt(om),'data-fo',cxON)+'</div></div>'+
    '<div class="cx-sec"><h4>Pessoas</h4><div class="cx-chs">'+lst(srt(pm),'data-fp')+'</div></div>'+
    '<div class="cx-sec"><h4>Mais atrasadas</h4>'+(pend.slice(0,3).map(function(r){return '<div class="cx-pd"><span class="cx-pdi">!</span><div><b>'+esc(r.t.length>60?r.t.slice(0,60)+'…':r.t)+'</b><small>'+esc(r.ps.join(', '))+' · '+esc(r.obra)+' · '+(r.cat==='at'?dTxt(r.atraso)+' de atraso':r.prazo?'até '+ddmm(r.prazo):'sem prazo')+'</small></div>'+cxPill(r.cat)+'</div>'}).join('')||'<span class="cx-mu">Nada pendente.</span>')+'</div>';
  /* ---- matriz pessoa x obra */
  var mxr=all.filter(function(r){return (!CX.grp||r.cargos.indexOf(CX.grp)>=0)&&(!CX.dias||r.age<=CX.dias)}),cols=obs.filter(function(o){return mxr.some(function(r){return r.obra===o})}),lins=pes.filter(function(p){return mxr.some(function(r){return cxTemP(r,p)})});
  $('cx-mx').innerHTML='<h3 class="cx-h">Matriz pessoa × obra</h3><p class="cx-hint">Cada número é a quantidade de tarefas. O vermelho mostra as atrasadas. Tarefa com mais de uma pessoa conta para cada uma. Clique numa célula para filtrar a tabela.</p><div class="cx-scroll"><table class="cx-mt"><thead><tr><th></th>'+cols.map(function(o){return '<th>'+esc(o)+'</th>'}).join('')+'<th>Total</th></tr></thead><tbody>'+
    lins.map(function(p){var rp=mxr.filter(function(r){return cxTemP(r,p)});return '<tr><th>'+esc(p)+'<small>'+esc(cxCargo(p))+'</small></th>'+cols.map(function(o){var rs=rp.filter(function(r){return r.obra===o}),a=rs.filter(function(r){return r.cat==='at'}).length,on=CX.fp===p&&CX.fo===o;return '<td><button type="button" class="cx-cell'+(on?' on':'')+(rs.length?'':' z')+'" '+(rs.length?'data-cell="'+esc(p)+'|'+esc(o)+'"':'disabled')+'>'+(rs.length||'·')+(a?'<em>'+a+'</em>':'')+'</button></td>'}).join('')+'<td><b>'+rp.length+'</b></td></tr>'}).join('')+'</tbody></table></div>';
  /* ---- tabela: situação (várias), busca, ordem */
  var q=norm(CX.q).trim(),b2=base.filter(function(r){return !q||norm([r.ref,r.t,r.r,r.dono,r.obra].join(' ')).indexOf(q)>=0}),cc=cxCnt(b2);
  $('cx-st').innerHTML=[['ab','Aberta'],['ea','Em andamento'],['at','Atrasada'],['fe','Feita']].map(function(x){return '<button type="button" class="cx-stb '+x[0]+'" data-st="'+x[0]+'" aria-pressed="'+(!!CX.st[x[0]])+'"><i class="'+x[0]+'"></i>'+x[1]+' <b>'+cc[x[0]]+'</b></button>'}).join('');
  var L=b2.filter(function(r){return CX.st[r.cat]}),sk=CX.sort.split('-')[0],sd=CX.sort.split('-')[1];
  var pz=function(r){return r.prazo||'9999'};
  L.sort(function(a,b){return sk==='idade'?(sd==='d'?b.age-a.age:a.age-b.age):sk==='cat'?(CXORD[a.cat]-CXORD[b.cat])||(pz(a)<pz(b)?-1:pz(a)>pz(b)?1:0)||(b.age-a.age):sk==='prazo'?(pz(a)<pz(b)?-1:pz(a)>pz(b)?1:0):sk==='t'?a.t.localeCompare(b.t):String(sk==='p'?a.dono:a.obra).localeCompare(String(sk==='p'?b.dono:b.obra))||(b.age-a.age)});
  L=L.filter(function(r){return r.pr}).concat(L.filter(function(r){return !r.pr}));
  var per=CX.fp||CX.fo?100:CX.per,np=Math.max(1,Math.ceil(L.length/per));if(CX.page>np)CX.page=np;var pg=L.slice((CX.page-1)*per,CX.page*per),donos=cxDonos(all);
  $('cx-sub').textContent=(CX.fp||'Todas as pessoas')+' · '+(CX.fo?cxON(CX.fo):'Todas as obras');
  $('cx-chips').innerHTML=[CX.dd?['Pedido em '+ddmm(CX.dd),'dd']:null,CX.dias?['Últimos '+CX.dias+' dias','dias']:null,CX.grp?[CX.grp,'grp']:null,CX.fo?[cxON(CX.fo),'fo']:null,CX.fp?[CX.fp,'fp']:null].filter(Boolean).map(function(x){return '<span class="cx-fc">'+esc(x[0])+'<button type="button" data-clr="'+x[1]+'" aria-label="Remover filtro '+esc(x[0])+'">×</button></span>'}).join('')||'<span class="cx-mu">Sem filtro de pessoa ou obra: mostrando todas as pessoas e obras.</span>';
  var vazio=!CXCOR.some(function(k){return CX.st[k]})?'Selecione ao menos uma situação acima.':'Nenhuma tarefa com esses filtros.';
  var opt=function(l,v){var tem=l.some(function(o){return o[0]===v});return (tem?'':'<option selected value="'+esc(v)+'">'+esc(v)+'</option>')+l.map(function(o){return '<option value="'+esc(o[0])+'"'+(o[0]===v?' selected':'')+'>'+esc(o[1])+'</option>'}).join('')};
  var obOpt=obs.map(function(o){return [o,o]});
  $('cx-tbody').innerHTML=pg.map(function(r){var k=esc(r.id);return '<tr data-k="'+k+'"'+(r.pr?' class="cx-prow"':'')+'>'+
    '<td class="cx-ref" data-l="Ref">'+esc(r.ref)+'</td>'+
    '<td data-l="Tarefa"><div class="cx-tt" contenteditable="true" spellcheck="false" data-cxt="'+k+'" title="Clique para editar o texto">'+esc(r.t)+'</div><small class="cx-rt" contenteditable="true" spellcheck="false" data-cxr="'+k+'" title="Clique para escrever o retorno">'+esc(r.r)+'</small></td>'+
    '<td data-l="Pessoa"><select data-cxp="'+k+'" aria-label="Pessoa">'+opt(donos,r.dono)+'</select></td>'+
    '<td data-l="Obra"><select data-cxo="'+k+'" aria-label="Obra">'+opt(obOpt,r.obra)+'</select></td>'+
    '<td class="cx-dn" data-l="Pedido" title="'+(r.dPl?'Veio da planilha de gestão (corte de '+esc(dt(r.d))+')':'Criada no site')+'">'+ddmm(r.d)+'</td>'+
    '<td data-l="Prazo"><input type="date" class="cx-pz" data-cxz="'+k+'" value="'+esc(r.prazo)+'" aria-label="Prazo"></td>'+
    '<td class="cx-dn" data-l="Idade">'+r.age+' d</td>'+
    '<td data-l="Status"><select class="cx-ss '+r.cat+'" data-cxst="'+k+'" aria-label="Status">'+[['ab','Aberta'],['ea','Em andamento'],['at','Atrasada'],['fe','Feita']].map(function(x){return '<option value="'+x[0]+'"'+(x[0]===r.cat?' selected':'')+(x[0]==='at'&&r.cat!=='at'?' disabled':'')+'>'+x[1]+'</option>'}).join('')+'</select>'+(r.cat==='at'?'<small class="cx-rt">'+dTxt(r.atraso)+' de atraso</small>':'')+'</td>'+
    '<td class="cx-prc" data-l="Prioridade"><input type="checkbox" class="cx-pr" data-cxpr="'+k+'"'+(r.pr?' checked':'')+' aria-label="Prioridade"></td></tr>'}).join('')||'<tr><td colspan="9" class="cx-empty">'+vazio+'</td></tr>';
  $('cx-pg').innerHTML='<span>Página '+CX.page+' de '+np+' · '+L.length+' tarefa'+(L.length===1?'':'s')+'</span><div class="cx-pn">'+cxPg(np,CX.page).map(function(p){return p==='…'?'<span>…</span>':'<button type="button" data-pgn="'+p+'" class="'+(p===CX.page?'on':'')+'">'+p+'</button>'}).join('')+'</div><div><button type="button" class="cx-btn" data-pg="-1"'+(CX.page<=1?' disabled':'')+'>Anterior</button><button type="button" class="cx-btn" data-pg="1"'+(CX.page>=np?' disabled':'')+'>Próxima</button></div>';
  $('cx-crumb').textContent='Tarefas › Por obra'+(CX.fo?' › '+cxON(CX.fo):'')+(CX.fp?' › '+CX.fp:'');
  cxFill($('cx-np'),donos);cxFill($('cx-no'),obOpt);
  $('cx-dias').value=String(CX.dias);$('cx-sort').value=CX.sort;
  cxHashSet();CXHASH=location.hash;
  return L.length+' tarefas'+(CX.fp?' de '+CX.fp:'')+(CX.fo?' na obra '+CX.fo:'');
}
/* ---- exportar: só abertas, atrasadas e em andamento. spec: 'all' | 'p:Nome' | 'o:Obra' */
var cxPend=function(spec){var a=cxRows().filter(function(r){return r.cat!=='fe'});if(spec==='all')return a;var k=spec.charAt(0),v=spec.slice(2);return a.filter(function(r){return k==='p'?cxTemP(r,v):r.obra===v})};
var cxSit=function(r){return r.cat==='at'?'atrasada '+dTxt(r.atraso):r.cat==='ea'?'em andamento':r.prazo?'até '+ddmm(r.prazo):'sem prazo'};
var cxOrd=function(a,b){return (b.pr-a.pr)||(CXORD[a.cat]-CXORD[b.cat])||((a.prazo||'9999')<(b.prazo||'9999')?-1:1)};
var cxLinha=function(r,i,comObra){return (i+1)+'. '+(r.pr?'[PRIORIDADE] ':'')+r.t+' ('+(comObra?r.obra+', ':'')+cxSit(r)+')'+(r.r?' --> '+r.r:'')};
function cxTxt(spec){var rows=cxPend(spec).sort(cxOrd),hj=dt(hojeEf());if(!rows.length)return '';
  if(spec.charAt(0)==='o'){var o=spec.slice(2),e=cxEnc(o);return '*'+cxON(o)+'*'+(e?' ('+e+')':'')+', pendências em '+hj+':\n'+rows.map(function(r,i){return cxLinha(r,i,false).replace(/ \(/,' ('+r.ps.join(', ')+', ')}).join('\n')+'\nLista: '+cxLink(spec)}
  var pes=spec==='all'?cxPessoas(rows):[spec.slice(2)];
  return pes.map(function(p){var L=rows.filter(function(r){return cxTemP(r,p)});return L.length?'*'+p+'*, pendências em '+hj+':\n'+L.map(function(r,i){return cxLinha(r,i,true)}).join('\n')+'\nLista: '+cxLink('p:'+p):''}).filter(Boolean).join('\n\n')}
function cxCsv(spec){var rows=cxPend(spec).sort(cxOrd);if(!rows.length){toast('Nada pendente nessa seleção.');return}
  var cell=function(s){return '"'+String(s==null?'':s).replace(/"/g,'""')+'"'},nome=spec==='all'?'todos':cxSlug(spec.slice(2));
  var csv='﻿'+[['Ref','Tarefa','Pessoa','Grupo','Obra','Responsáveis da obra','Pedido','Prazo','Idade (dias)','Status','Prioridade','Retorno'].join(';')].concat(rows.map(function(r){return [r.ref,r.t,r.dono||'sem dono',r.cargos.join(', '),r.obra,cxEnc(r.obra),dt(r.d),dt(r.prazo),r.age,cxSit(r),r.pr?'Sim':'',r.r].map(cell).join(';')})).join('\n');
  try{var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='TAF - tarefas - '+nome+' - '+hojeEf()+'.csv';document.body.appendChild(a);a.click();a.remove();toast('CSV com '+rows.length+' tarefa'+(rows.length===1?'':'s')+' (abertas, atrasadas e em andamento)')}catch(e){toast('Não consegui gerar o CSV')}}
function cxSet(id,c,v){setCampo(id,c,v);TKW='Tarefas por Obra: '+c+' de '+nomeT(id);edAplica()}
function cxInit(){var sec=$('p-tarobra');if(!sec)return;
  var go=function(){CX.page=1;render()};
  sec.addEventListener('click',function(e){var t=e.target,g=function(a){return t.closest('['+a+']')},b;
    if((b=g('data-xc'))){var spec=b.dataset.xc,txt=cxTxt(spec);if(!txt){toast('Nada pendente nessa seleção.');return}copiar(txt,'Cobrança copiada ('+cxPend(spec).length+' tarefas). Cole no WhatsApp.');return}
    if((b=g('data-xv'))){cxCsv(b.dataset.xv);return}
    if((b=g('data-xl'))){copiar(cxLink(b.dataset.xl),'Link copiado');return}
    if((b=g('data-vis'))){CX.vis=b.dataset.vis;CX.fp='';CX.fo='';go();return}
    if((b=g('data-grp'))){CX.grp=b.dataset.grp;if(CX.fp&&CX.grp&&cxCargo(CX.fp)!==CX.grp)CX.fp='';go();return}
    if((b=g('data-fp'))){var v=b.dataset.fp;CX.fp=(v&&CX.fp===v)?'':v;go();return}
    if((b=g('data-fo'))){var w=b.dataset.fo;CX.fo=(w&&CX.fo===w)?'':w;go();return}
    if((b=g('data-cell'))){var pc=b.dataset.cell.split('|');if(CX.fp===pc[0]&&CX.fo===pc[1]){CX.fp='';CX.fo=''}else{CX.fp=pc[0];CX.fo=pc[1]}go();return}
    if((b=g('data-st'))){CX.st[b.dataset.st]=CX.st[b.dataset.st]?0:1;go();return}
    if((b=g('data-clr'))){var k=b.dataset.clr;if(k==='dias')CX.dias=0;else CX[k]='';if(k==='dd')$('cx-dd').value='';go();return}
    if((b=g('data-pg'))){CX.page=Math.max(1,CX.page+ +b.dataset.pg);render();return}
    if((b=g('data-pgn'))){CX.page=+b.dataset.pgn;render();return}
    if(t.closest('#cx-xall')){var tx=cxTxt('all');if(!tx){toast('Nada pendente.');return}copiar(tx,'Cobrança de todos copiada ('+cxPend('all').length+' tarefas). Cole no WhatsApp.');return}
    if(t.closest('#cx-xcsv')){cxCsv('all');return}
    if(t.closest('#cx-newb')){var f=$('cx-nf');f.hidden=!f.hidden;if(!f.hidden){if(CX.fp&&CX.fp!=='Sem dono')$('cx-np').value=CX.fp;if(CX.fo)$('cx-no').value=CX.fo;if(!$('cx-nd').value)$('cx-nd').value=addD(hojeEf(),7);$('cx-nt').focus()}return}
    if(t.closest('#cx-na')){var nt=$('cx-nt').value.trim();if(!nt){toast('Escreva a tarefa.');return}ens();
      ED.add.push({id:'N'+Date.now(),obra:$('cx-no').value||OB[0],frente:'',txt:nt,dono:$('cx-np').value,sit:'ABERTA',prazo:$('cx-nd').value||'',resposta:'',pedido:hojeReal()});
      $('cx-nt').value='';$('cx-nd').value='';TKW='Nova tarefa criada em Tarefas por Obra';CX.st.ab=1;edAplica();toast('Tarefa criada e salva para todos');return}
  });
  sec.addEventListener('change',function(e){var t=e.target,d=t.dataset||{};
    if(d.cxst!=null){var v=t.value,r=cxRows().filter(function(x){return x.id===d.cxst})[0];if(!r)return;
      cxSet(d.cxst,'sit',v==='fe'?'RESOLVIDA':v==='ea'?'MONITORAR':'ABERTA');
      if(v!=='fe'&&r.prazo&&dif(hojeEf(),r.prazo)>atrEf())toast('Continua atrasada: o prazo ('+ddmm(r.prazo)+') já passou. Mude o prazo para tirar do atraso.');return}
    if(d.cxpr!=null){cxSet(d.cxpr,'prio',t.checked?true:undefined);return}
    if(d.cxo!=null){cxSet(d.cxo,'obra',t.value);return}
    if(d.cxp!=null){cxSet(d.cxp,'dono',t.value);return}
    if(d.cxz!=null){cxSet(d.cxz,'prazo',t.value);return}
    if(d.cxcargo!=null&&CX.fp){CXC[CX.fp]=t.value;cxSave();render();return}
    if(d.cxenc!=null&&CX.fo){CXE[CX.fo]=t.value.trim();cxSave();render();return}
    if(t.id==='cx-dias'){CX.dias=+t.value;go();return}
    if(t.id==='cx-dd'){CX.dd=t.value;if(CX.dd)CX.st={ab:1,ea:1,at:1,fe:1};go();return}
    if(t.id==='cx-sort'){CX.sort=t.value;go();return}});
  $('cx-q').addEventListener('input',function(e){CX.q=e.target.value;go()});
  sec.addEventListener('focusout',function(e){var t=e.target,d=t.dataset||{},id=d.cxt!=null?d.cxt:d.cxr,c=d.cxt!=null?'txt':'resposta';if(id==null)return;
    var r=cxRows().filter(function(x){return x.id===id})[0],v=t.innerText.replace(/\s+/g,' ').trim();if(!r)return;
    if(c==='txt'&&!v){render();return}
    if(v!==(c==='txt'?r.t:r.r))cxSet(id,c,v)});
  sec.addEventListener('keydown',function(e){var d=e.target.dataset||{};if(e.key==='Enter'&&(d.cxt!=null||d.cxr!=null)){e.preventDefault();e.target.blur()}});
}
