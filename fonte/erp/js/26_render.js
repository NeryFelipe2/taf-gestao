/* ============ render / eventos ============ */
function render(){S.memo={};try{renderCore()}finally{S.memo=null}if(typeof zerosPass==='function')zerosPass();if(typeof filtrosPass==='function')filtrosPass();if(typeof a11yPass==='function')a11yPass();if(typeof apresPass==='function')apresPass()}
function renderCore(){
  const X=derive();S.X=X;
  const AR=areaDe(S.view);
  $('#nav').innerHTML=areasVisiveis().map(a=>`<button class="${a.k===AR.k?'on':''}" data-v="${a.k===AR.k?S.view:a.tabs[0][0]}">${ico(a.i)}${a.n}${badgeArea(a,X)}</button>`).join('');
  $('#crumb').textContent=AR.n+(AR.tabs.length>1?' · '+(AR.tabs.find(t=>t[0]===S.view)||AR.tabs[0])[1]:'');
  const V={rastro:viewRastro,fat:viewFat,campo:viewCampo,lean:viewLean,hoje:viewHoje,eap:viewEap,pac:viewPac,evt:viewEventos,compras:viewCompras,cdash:viewCdash,pedc:viewPedc,nota:viewNota,fin:viewFin,med:viewMed,plano:viewPlano,pain:viewPain,ctb:viewCtb,est:viewEst,dash:viewDash,pes:viewPessoas,sst:viewSst,bi:biView,admin:viewAdmin,acessos:viewAcessos,fluxo:viewFluxo,ctr:viewCtr,prj:viewPrj,pat:viewPat,frt:viewFrt,aud:viewAud,usuarios:viewUsuarios,cad:viewCadastros}[S.view]||viewHoje;
  const keepQ=document.activeElement&&document.activeElement.id==='q';
  $('#view').innerHTML=abasDaArea(AR)+V(X);
  if(keepQ){const q=$('#q');if(q){q.focus();q.setSelectionRange(q.value.length,q.value.length)}}
  const al=alertas(X);const nb=al.filter(a=>a[0]==='bad').length;$('#pip').style.display=nb?'block':'none';
  const G={bad:'var(--bad)',warn:'var(--warn)',info:'var(--info)'};
  $('#alerts').innerHTML=al.map(([k,t,p])=>`<div class="alert"><div class="g" style="color:${G[k]}"><svg class="ic" viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg></div><div><b>${t}</b><p>${p}</p><span class="pill ${k}">${k==='bad'?'Crítico':k==='warn'?'Atenção':'Info'}</span></div></div>`).join('');
  if(!MODO_SB)$('#role').value=S.role;
}
const openDrawer=()=>{$('#drawer').classList.add('open');$('#scrim').classList.add('open')},closeDrawer=()=>{$('#drawer').classList.remove('open');$('#scrim').classList.remove('open')};
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeDrawer();closeModal()}});
$('#bell').onclick=openDrawer;$('#close').onclick=closeDrawer;$('#scrim').onclick=closeDrawer;
$('#modal').onclick=e=>{if(e.target.id==='modal')closeModal()};
$('#role').onchange=e=>{S.role=e.target.value;save();render()};

document.addEventListener('change',e=>{const t=e.target;if(t.id==='f-comp'||t.id==='a-comp'){S.comp=t.value;S.csvOut='';render()}else if(t.dataset&&t.dataset.fisc){S.t.par.fisc={...(S.t.par.fisc||{}),[t.dataset.fisc]:+t.value||0};log('parametros','fiscal',t.dataset.fisc,'',t.value);save();render()}else if(t.dataset&&t.dataset.emp){S.t.par.emp={...(S.t.par.emp||{}),[t.dataset.emp]:t.value.trim()};save();render()}else if(t.id==='f-cno'){S.t.par.cno=t.value.trim();save()}else if(t.id==='f-mun'){S.t.par.mun=t.value.trim();save()}});
document.addEventListener('input',e=>{if(e.target.id==='q'){S.q=e.target.value;render()}});
document.addEventListener('click',e=>{
  const t=e.target;let el;
  if(el=t.closest('[data-tabs] button')){S.tab[el.parentNode.dataset.tabs]=el.dataset.t;return render()}
  if(el=t.closest('#nav button')||t.closest('.areatabs button')){S.view=el.dataset.v;return render()}
  if(el=t.closest('[data-go]')){S.view=el.dataset.go;return render()}
  if(el=t.closest('[data-act]')){const a=el.dataset.act,id=el.dataset.id;if(el.disabled)return;
    const A={'l-entrar':()=>doLogin(false),'l-novo':()=>doLogin(true),sair:sbSair,importar:sbImportar,alertas:openDrawer,fechar:closeModal,congelar:()=>{if(!can('congelar'))return;ask('Congelar a linha de base v1','Motivo ou observação','Estudo REV10 + META da aba 11/12',m=>{S.t.frozen=true;S.t.hist.push({versao:1,motivo:m||'congelada',quando:new Date().toISOString(),quem:user()});log('obra','342','linha_base','aberta','v1 congelada',m);save();toast('Linha de base v1 congelada · compras liberadas');render()})},
     remanejar:modalRemanejar,'rm-ok':doRemanejar,'nova-sol':()=>modalSol(el.dataset.item),'sol-ok':doSol,mapa:()=>modalMapa(id),'add-cot':()=>addCot(id),'emitir-oc':()=>emitirOC(id),
     aprovar:()=>decidir(id,true),reprovar:()=>decidir(id,false),receber:()=>modalReceber(id),'rc-ok':()=>doReceber(id),'cancelar-oc':()=>cancelarOC(id),params:modalParams,
     'params-ok':()=>{S.t.par.limite=+$('#p-l').value||0;S.t.par.gerenteAte=+$('#p-g').value||0;S.t.par.tol=(+$('#p-t').value||0)/100;S.t.par.alcadaOk=true;log('parametros','alçada','limite/gerente/tolerância','',brl(S.t.par.limite)+' / '+brl(S.t.par.gerenteAte)+' / '+$('#p-t').value+'%');if(gravaChaves())prep();save();closeModal();render()},
     'nova-nf':()=>modalNF(),ratear:()=>modalNF(id),'add-lin':()=>{NF.rateio.push({item:S.D.items[0].codigo,valor:0});pintaRat()},'del-lin':()=>{NF.rateio.splice(+el.dataset.k,1);pintaRat()},
     'sug-lin':()=>{const o=S.t.ocs.find(x=>x.id===NF.oc);if(!o)return toast('Escolha um pedido');NF.rateio=ocLinhasLigada()?rateioDoPedido(o):[{item:o.item,valor:Math.min(+NF.valor||o.valor,o.valor)}];pintaRat()},
     'nf-ok':()=>doNF(el.dataset.modo),conciliar:doConciliar,'nova-med':modalMed,'ask-ok':askOk,'obras':modalObras,'obra-abrir':()=>abrirObra(el.dataset.cod),'obra-imp':()=>importarObraBanco(el.dataset.cod),'hist-281':importaHistorico281,'cad-novo':()=>modalCad(el.dataset.k),'cad-edit':()=>modalCad(el.dataset.k,id),'cad-ok':doCad,'nfe-buscar':nfeBuscar,'sync-novo':modalSync,'sync-ler':syncLer,'sync-aplicar':syncAplicar,'xml-novo':modalXml,'xml-ok':doXml,'fech-csv':()=>fechGerar(),'fech-fechar':fechFechar,'fech-copy':()=>{const t=$('#f-out');t.select();try{navigator.clipboard.writeText(t.value).then(()=>toast('Copiado'),()=>toast('Selecionado: use Ctrl+C'))}catch(e){toast('Selecionado: use Ctrl+C')}},'bc-novo':modalBc,'bc-ok':doBc,'bc-env':()=>bcEnv(id),'bc-apr':()=>bcAprModal(id),'bc-apr-ok':()=>bcAprOk(id),'bc-fat':()=>bcFat(id),'rec-novo':()=>modalRec(id),'rec-ok':()=>doRec(id),'conc-ent':concEnt,'lan-novo':modalLan,'lan-ok':doLan,'novo-apt':modalApt,'apt-ok':doApt,'apt-conf':()=>aptConf(id),'apt-apr':()=>aptApr(id),'apt-addp':()=>{lerApt();APT.pessoas.push({funcao:FUNCOES()[0]||'',n:1,h:8});pintaApt()},'apt-delp':()=>{lerApt();APT.pessoas.splice(+el.dataset.k,1);pintaApt()},'apt-adde':()=>{lerApt();APT.equip.push({nome:'',h:8,rh:0});pintaApt()},'apt-dele':()=>{lerApt();APT.equip.splice(+el.dataset.k,1);pintaApt()},'nova-atv':modalAtv,'atv-salvar':doAtv,'atv-ok':()=>atvOk(id),'atv-no':()=>atvNo(id),'atv-no-ok':()=>atvNoOk(id),'nova-rst':modalRst,'rst-salvar':doRst,'rst-ok':()=>rstOk(id),'rst-rep':()=>rstRep(id),'nova-tar':modalTar,'tar-salvar':doTar,'tar-mv':()=>tarMv(id),'med-ok':doMed,atestar:()=>doAtestar(id),conferir:()=>conferir(id),liberar:()=>liberar(id),pagar:()=>pagar(id),
     reset:()=>{if(MODO_SB)return toast('No modo conectado nada é apagado');if(!S.confirmReset){S.confirmReset=1;return toast('Clique de novo em Restaurar para apagar tudo');}S.confirmReset=0;localStorage.removeItem(chaveObra());S.t=novoT();prep();toast('Dados restaurados');render()}};
    if(A[a])A[a]();else if(ACOES[a])ACOES[a](el);return}
  if(el=t.closest('[data-exp]')){const c=el.dataset.exp;S.exp.has(c)?S.exp.delete(c):S.exp.add(c);return render()}
  if(el=t.closest('[data-item]')){return modalItem(el.dataset.item)}
  if(el=t.closest('[data-pac]')){return modalPac(el.dataset.pac)}
});

async function load(cod){
  const d=await obraData(cod||'342');S.src=window.TAF_DATA?['Obra 342','Dados da planilha embutidos']:['Obra 342','Dados da planilha · lançamentos salvos neste navegador'];return d}
async function abreDemo(cod){
  try{S.D=await load(cod);S.t=loadT();await seedExtrato();S.exp=new Set();S.tab={};S.view='dash';prep();
    S.D.eap.filter(e=>e.nivel<=2).forEach(e=>S.exp.add(e.codigo));
    pintaObra();
    $('#src-label').textContent=S.src[0];$('#src-sub').textContent=S.src[1];render();
  }catch(e){$('#view').innerHTML=`<div class="err">Não consegui carregar os dados: ${esc(e.message)}<br><span class="sub">Rode um servidor estático em <code>web/</code> ou use o arquivo único.</span></div>`}
}
