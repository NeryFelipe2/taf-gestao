/* ============ SUPABASE: login, papel, leitura e gravação ============ */
const cmpCod=(a,b)=>{const x=a.split('.'),y=b.split('.');for(let i=0;i<Math.max(x.length,y.length);i++){const p=x[i],q=y[i];if(p===undefined)return -1;if(q===undefined)return 1;
  const n=/^\d+$/.test(p)&&/^\d+$/.test(q);const d=n?(+p)-(+q):p.localeCompare(q);if(d)return d}return 0};
const estadoObra=()=>({frozen:S.t.frozen,versao:S.t.versao,hist:S.t.hist,metaOv:S.t.metaOv,baseOv:S.t.baseOv,basePac:S.t.basePac,par:S.t.par});
const DOCS=[['sols','sol'],['elos','elo'],['ocs','oc'],['notas','nf'],['titulos','tit'],['meds','med'],['aud','aud'],['apts','apt'],['rsts','rst'],['atvs','atv'],['tars','tar'],['bcs','bc'],['fats','fat'],['recs','rec'],['lans','lan'],['lfxs','lfx'],['ctbs','ctb'],['ests','est'],['invs','inv'],['ctrs','ctr'],['prjs','prj'],['pats','pat'],['frts','frt'],['fmvs','fmv'],['cols','col'],['ptos','pto'],['ssts','sst'],['movs','mov'],['cobrs','cobr'],['fechs','fech'],['forns','forn'],['inss','ins'],['bancos','banc']];
function sbDocs(){const out=[];DOCS.forEach(([k,tipo])=>(S.t[k]||[]).forEach(o=>{if(!o.id)o.id=tipo+Date.now()+Math.random().toString(36).slice(2,6);out.push({id:o.id,obra_id:GLOBAIS.includes(tipo)?(SB.obraBase||SB.obraId):SB.obraId,tipo,dados:o})}));return out}
function sbSyncSoon(){clearTimeout(SB.timer);SB.timer=setTimeout(()=>{SB.timer=null;sbSync()},250)}
const filaKey=()=>'taf_fila_'+SB.obraId;
function filaMerge(t){try{const q=JSON.parse(localStorage.getItem(filaKey())||'[]');if(!q.length)return;const rev=Object.fromEntries(DOCS.map(([k,tp])=>[tp,k]));
  q.forEach(d=>{const k=rev[d.tipo];if(k&&!SB.sync[d.id]&&!t[k].some(o=>o.id===d.id))t[k].unshift(d.dados)})}catch(e){}}
function filaSalva(docs){try{localStorage.setItem(filaKey(),JSON.stringify(docs.map(d=>({id:d.id,tipo:d.tipo,dados:d.dados}))))}catch(e){}}
const semRede=e=>!navigator.onLine||/fetch|network|load failed/i.test(String(e&&e.message||e));
window.addEventListener('online',()=>{if(MODO_SB&&SB.obraId)sbSync()});
async function sbPool(k){if(!MODO_SB||!SB.obraId)return;SB.poolBusy=SB.poolBusy||{};if(SB.poolBusy[k])return;SB.poolBusy[k]=1;
  try{const r=await SB.c.rpc('reservar_numeros',{p_obra:SB.obraId,p_tipo:k,p_qtd:20});if(!r.error&&r.data!=null){const a=+r.data;SB.pool=SB.pool||{};SB.pool[k]=[...(SB.pool[k]||[]),...Array.from({length:20},(_,i)=>a+i)]}}catch(e){}
  SB.poolBusy[k]=0}
async function sbSync(){
  if(SB.busy){sbSyncSoon();return}SB.busy=true;
  try{
    const docs=sbDocs().filter(d=>{const j=JSON.stringify(d.dados);if(SB.sync[d.id]===j)return false;d._j=j;return true});
    if(docs.length){const {error}=await SB.c.from('documento').upsert(docs.map(d=>({id:d.id,obra_id:d.obra_id,tipo:d.tipo,dados:d.dados})),{onConflict:'id'});if(error)throw error;docs.forEach(d=>SB.sync[d.id]=d._j)}
    const est=JSON.stringify(estadoObra());
    if(est!==SB.estado){const {error}=await SB.c.from('obra').update({estado:JSON.parse(est)}).eq('id',SB.obraId);if(error)throw error;SB.estado=est}
    try{localStorage.removeItem(filaKey())}catch(_){}
  }catch(e){
    if(semRede(e)){const pend=sbDocs().filter(d=>SB.sync[d.id]!==JSON.stringify(d.dados));filaSalva(pend);toast('Sem sinal: '+pend.length+' registro(s) guardado(s) no aparelho. Sobem quando voltar a conexão.')}
    else{toast('Não salvou: '+(e.message||e));try{await sbPull();render()}catch(_){}}}
  SB.busy=false;
}
function aplicaDocs(est,docs){
  const t={...novoT(),...(est&&Object.keys(est).length?est:{})};const map=Object.fromEntries(DOCS.map(([k,tp])=>[tp,k]));
  DOCS.forEach(([k])=>t[k]=[]);SB.sync={};
  docs.forEach(r=>{if(!map[r.tipo])return;t[map[r.tipo]].push(r.dados);SB.sync[r.id]=JSON.stringify(r.dados)});
  const key=o=>parseInt(String(o.id||'').replace(/\D/g,'').slice(0,13))||0;
  DOCS.forEach(([k])=>{if(k!=='aud')t[k].sort((a,b)=>key(b)-key(a))});t.aud.sort((a,b)=>String(b.q).localeCompare(String(a.q)));
  filaMerge(t);S.t=t;if(S.D)prep();SB.estado=JSON.stringify(estadoObra());
}
async function sbPull(){
  const [o,d]=await Promise.all([SB.c.from('obra').select('estado').eq('id',SB.obraId).single(),SB.c.from('documento').select('id,tipo,dados').or(`obra_id.eq.${SB.obraId},tipo.in.(${GLOBAIS.join(',')})`).limit(10000)]);
  if(o.error||d.error)throw (o.error||d.error);aplicaDocs(o.data.estado,d.data);
}
const login=()=>$('#login');
function telaLogin(msg){
  login().classList.add('open');$('#lbox').innerHTML=`<h3>TAF Admin</h3><div class="sub">Entre com seu e-mail e senha. O primeiro cadastro vira Administrador; os demais aguardam liberação.</div>
   <label>E-mail</label><input id="l-e" type="email" autocomplete="username"><label>Senha</label><input id="l-s" type="password" autocomplete="current-password" minlength="6">
   <div id="l-msg" class="sub" style="margin-top:10px;${msg?'color:var(--bad)':''}">${esc(msg||'')}</div>
   <div class="acts"><button class="btn" data-act="l-novo">Criar conta</button><button class="btn dark" data-act="l-entrar">Entrar</button></div>`;
}
const lmsg=(m,bad=true)=>{const e=$('#l-msg');if(e){e.textContent=m;e.style.color=bad?'var(--bad)':'var(--ink-2)'}};
async function doLogin(novo){
  const email=($('#l-e').value||'').trim(),senha=$('#l-s').value||'';if(!email||senha.length<6)return lmsg('Informe e-mail e senha (mínimo 6 caracteres).');
  lmsg('Aguarde…',false);
  const r=novo?await SB.c.auth.signUp({email,password:senha,options:{data:{nome:email.split('@')[0]}}}):await SB.c.auth.signInWithPassword({email,password:senha});
  if(r.error)return lmsg(r.error.message==='Invalid login credentials'?'E-mail ou senha incorretos.':r.error.message);
  if(!r.data.session)return lmsg('Conta criada. Confirme o e-mail enviado e depois entre.',false);
  login().classList.remove('open');await sbEntrar(r.data.session.user);
}
function telaAviso(titulo,texto,acao){$('#view').innerHTML=`<div class="soon"><h2>${titulo}</h2><div style="max-width:520px">${texto}</div><div style="display:flex;gap:8px;margin-top:10px">${acao||''}<button class="btn" data-act="sair">Sair</button></div></div>`;$('#nav').innerHTML='';}
async function sbBoot(){
  $('#role').parentNode.style.display='none';
  if(!window.supabase){telaAviso('Biblioteca não carregou','Não consegui carregar o supabase-js. Abra com <code>?demo=1</code> para usar sem login.');return}
  SB.c=window.supabase.createClient(CFG.supabaseUrl,CFG.supabaseKey);
  const {data}=await SB.c.auth.getSession();
  if(!data.session){telaLogin();$('#view').innerHTML='';return}
  await sbEntrar(data.session.user);
}
async function sbEntrar(u){
  SB.user=u;const pf=await SB.c.from('perfil').select('*').eq('user_id',u.id).single();
  if(pf.error||!pf.data){telaAviso('Perfil não encontrado','Seu usuário existe, mas ainda não tem perfil. Peça ao administrador.');return}
  SB.perfil=pf.data;S.role=pf.data.papel;
  $('#userbox').style.display='block';$('#userbox').innerHTML=`<div class="note"><b>${esc(pf.data.nome)}</b><span>${esc(ROLES[S.role]?.n||S.role)}</span><div style="margin-top:8px"><button class="btn sm" data-act="sair">Sair</button></div></div>`;
  if(S.role==='pendente'){telaAviso('Aguardando liberação','Sua conta foi criada. O administrador precisa atribuir seu papel (engenheiro, compras, financeiro…) para você acessar a obra.');return}
  const ob=await SB.c.from('obra').select('*').order('codigo');
  if(ob.error){telaAviso('Erro ao ler a obra',esc(ob.error.message));return}
  if(!ob.data.length){
    const pode=isRole('gestao','diretoria');
    telaAviso('Nenhuma obra cadastrada',pode?'Importe a obra 342 (orçamento, pacotes, metas e plano de contas) a partir da planilha já processada.':'Peça ao administrador para importar a obra.',pode?'<button class="btn dark" data-act="importar">Importar obra 342</button>':'');return}
  SB.obras=ob.data;await sbCarregar(ob.data.find(o=>o.codigo===obraGuardada())||ob.data[0]);
}
async function sbCarregar(ob){
  const c=SB.c;if(SB.obraId!==ob.id)SB.pool={};SB.obraId=ob.id;SB.obraBase=SB.obraBase||ob.id;Object.keys(PX).forEach(sbPool);
  const [pc,ie,ct,fm]=await Promise.all([c.from('pacote').select('*').eq('obra_id',ob.id),c.from('item_eap').select('*').eq('obra_id',ob.id).limit(5000),c.from('conta').select('*'),c.from('funcao_mo').select('*')]);
  const err=pc.error||ie.error||ct.error;if(err){telaAviso('Erro ao carregar',esc(err.message));return}
  const N=v=>v==null?v:+v,pcode=Object.fromEntries(pc.data.map(p=>[p.id,p.codigo]));
  const eap=ie.data.map(e=>({codigo:e.codigo,descricao:e.descricao,unidade:e.unidade,qtd:N(e.qtd),nivel:e.nivel,pai:e.pai_codigo,tipo_linha:e.eh_item?'item':'grupo',preco_venda_total:N(e.preco_venda_total),meta_total:N(e.meta_total),teto_total:N(e.teto_total),meta_unit:N(e.meta_unit),fonte_meta:e.fonte_meta,status_cotacao:e.status_cotacao,evento:e.evento,pacote:pcode[e.pacote_id],tipo:e.tipo,composicao:e.composicao,natureza:e.natureza||{},hh_unit:N(e.hh_unit)})).sort((a,b)=>cmpCod(a.codigo,b.codigo));
  const venda=eap.filter(e=>e.tipo_linha==='item').reduce((s,e)=>s+e.preco_venda_total,0);
  S.D={obra:{codigo:ob.codigo,nome:ob.nome,contratante:ob.contratante,contrato:ob.contrato,municipio:ob.municipio,valor_contrato:N(ob.valor_contrato),regime:ob.regime,tributos_nota:N(ob.tributos_nota)},
    pacotes:pc.data.map(p=>({...p,meta:N(p.meta),teto:N(p.teto)})),eap,plano:ct.data.map(x=>({codigo:x.codigo,nome:x.nome,nivel:x.nivel,natureza:x.natureza})).sort((a,b)=>cmpCod(a.codigo,b.codigo)),
    banco_mo:[...new Map((fm.data||[]).map(f=>[f.funcao,{funcao:f.funcao,equipe:f.equipe,custo_hora:N(f.custo_hora)}])).values()],relatorio:{diferenca_contrato:r2(venda-N(ob.valor_contrato)),aviso:ob.codigo==='342'?'Metas vêm do Estudo 342 REV10; aguardando META REV02 e Estudo REV13.':'Esta obra ainda não tem estudo de custo: os itens só têm preço licitado.'}};
  await sbPull();
  S.exp=new Set(S.D.eap.filter(e=>e.nivel<=2).map(e=>e.codigo));
  $('#obra-av').textContent=ob.codigo;$('#obra-nome').textContent=(ob.contratante||'')+' · '+ob.nome;$('#obra-sub').textContent='Centro de custo '+ob.codigo;
  $('#src-label').textContent='Supabase';$('#src-sub').textContent='Banco conectado · '+(ROLES[S.role]?.n||S.role);
  if(S.role==='admin'){await sbPerfis()}
  render();
}
async function sbPerfis(){const r=await SB.c.from('perfil').select('*').order('criado_em');SB.perfis=r.data||[]}
async function sbImportar(){
  toast('Importando…');let d=window.TAF_DATA;if(!d){const r=await fetch('data/obra342.json');d=await r.json()}
  const r=await SB.c.rpc('importar_obra',{p:d});if(r.error)return toast('Erro: '+r.error.message);toast('Obra importada');await sbEntrar(SB.user);
}
function viewUsuarios(){
  const P=SB.perfis||[];
  return `<div class="head"><div><h1>Usuários</h1><p class="lead">Quem se cadastra entra como <b>Aguardando liberação</b>. Atribua o papel de cada pessoa: ele define o que ela vê e pode fazer.</p></div></div>
  <div class="tw"><table class="tbl"><thead><tr><th>Nome</th><th>Cadastro</th><th>Papel</th></tr></thead><tbody>${P.map(u=>`<tr><td><b>${esc(u.nome)}</b>${u.user_id===SB.user.id?' <span class="pill info">você</span>':''}</td><td>${fdata((u.criado_em||'').slice(0,10))}</td><td><select data-perfil="${u.user_id}" ${u.user_id===SB.user.id?'disabled title="Você não altera o próprio papel"':''}>${PAPEIS_ATRIBUIVEIS.map(r=>`<option value="${r}" ${u.papel===r?'selected':''}>${ROLES[r].n}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div>`}
async function sbSair(){await SB.c.auth.signOut();location.reload()}
document.addEventListener('change',async e=>{const el=e.target.closest&&e.target.closest('[data-perfil]');if(!el)return;
  const r=await SB.c.from('perfil').update({papel:el.value}).eq('user_id',el.dataset.perfil);if(r.error)return toast('Erro: '+r.error.message);log('perfil',el.dataset.perfil,'papel','',el.value);save();toast('Papel atualizado');await sbPerfis()});
window.addEventListener('focus',()=>{if(MODO_SB&&SB.obraId&&!SB.busy&&!$('#modal').classList.contains('open')&&!SB.timer)sbPull().then(render).catch(()=>{})});
setInterval(()=>{if(MODO_SB&&SB.obraId&&!SB.busy&&!SB.timer&&!$('#modal').classList.contains('open')&&document.visibilityState==='visible'&&!localStorage.getItem(filaKey()))sbPull().then(render).catch(()=>{})},30000);

