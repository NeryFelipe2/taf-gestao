/* ============ MODO CHAVE: o ERP dentro do site taf-gestao ============
   Entra com a mesma chave do site; lê e grava só pelas funções taf_erp_* do banco (nada direto nas tabelas).
   A chave fica só neste aparelho. Papel: fixo na chave pessoal; com a chave geral do site, escolhido na tela.
   Os dados fixos de cada obra (EAP, pacotes, metas, extrato, ficha) vêm do banco em gzip, nunca do código público. */
const CH={chave:'',quem:'',fixo:false,leitura:false,ver:0,obras:[],T:{}};
const CHK='taf-erp-chave',CHQ='taf-erp-quem',CHP='taf-erp-papel';
const chLs=(k,v)=>{try{if(v===undefined)return localStorage.getItem(k);if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v)}catch(e){}return null};
async function chRpc(fn,body){
  const r=await fetch(CFG.supabaseUrl+'/rest/v1/rpc/'+fn,{method:'POST',headers:{apikey:CFG.supabaseKey,Authorization:'Bearer '+CFG.supabaseKey,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const tx=await r.text();let j=null;try{j=tx?JSON.parse(tx):null}catch(e){j=tx}
  if(!r.ok){const e=new Error((j&&j.message)||tx||('erro '+r.status));e.status=r.status;throw e}return j}
const chMsg=e=>{const m=String(e&&e.message||e);return /CHAVE INVALIDA/.test(m)?'Chave inválida.':/SEM ACESSO A OBRA/.test(m)?'Esta chave não abre esta obra.':
  /CHAVE SO DE LEITURA/.test(m)?'Chave só de leitura: nada foi salvo.':/INFORME SEU NOME/.test(m)?'Informe seu nome antes de lançar.':m};
const chMotivo=m=>{const s=String(m||'');let x;if(x=s.match(/^PAPEL (\w+) NAO GRAVA (\w+)$/))return 'o papel '+((ROLES[x[1].toLowerCase()]||{}).n||x[1])+' não grava este tipo de registro';
  if(x=s.match(/^COMPETENCIA (\S+) FECHADA$/))return 'competência '+x[1].split('-').reverse().join('/')+' fechada';if(/REABRE/.test(s))return 'só a Diretoria reabre competência';return s.toLowerCase()};
const chArgs=o=>({p_chave:CH.chave,p_obra:SB.obraId,p_quem:CH.quem||null,...o});

/* ---------- dados fixos da obra (gzip+base64 no banco, guardados no aparelho pela impressão) ---------- */
async function chGunzip(b64){const bin=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
  const st=new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));return JSON.parse(await new Response(st).text())}
const chShaGuardado=cod=>{try{const c=JSON.parse(chLs('taf-erp-base-'+cod)||'null');return c&&c.gz?c.sha:null}catch(e){return null}};
function chUsaBase(cod,b){window.TAF_OBRAS=window.TAF_OBRAS||{};window.TAF_OBRAS[cod]=b.D;
  window.TAF_EXTRATO=window.TAF_EXTRATO||{};if(b.extrato)window.TAF_EXTRATO[cod]=b.extrato;else delete window.TAF_EXTRATO[cod];
  if(b.ficha)FICHA_PAD[cod]=b.ficha;
  if(b.listas)Object.entries(b.listas).forEach(([k,v])=>{const l=CAD_LISTAS[k];if(Array.isArray(l))(v||[]).forEach(x=>{if(!l.includes(x))l.push(x)})})}
async function chBaseDe(cod,r){let gz=r&&r.base_gz;
  if(!gz){try{const c=JSON.parse(chLs('taf-erp-base-'+cod)||'null');if(c&&c.sha===r.base_sha)gz=c.gz}catch(e){}}
  else chLs('taf-erp-base-'+cod,JSON.stringify({sha:r.base_sha,gz}));
  if(!gz)throw new Error('A obra '+cod+' ainda não tem dados no banco.');
  const b=await chGunzip(gz);chUsaBase(cod,b);return b}
const chPB={};
async function chObraData(cod){if(window.TAF_OBRAS&&window.TAF_OBRAS[cod])return window.TAF_OBRAS[cod];
  if(!chPB[cod])chPB[cod]=chRpc('taf_erp_base',{p_chave:CH.chave,p_obra:cod,p_quem:CH.quem||null}).then(r=>chBaseDe(cod,r)).then(b=>b.D).finally(()=>{delete chPB[cod]});
  return chPB[cod]}

/* ---------- entrada com a chave ---------- */
function chTela(msg){login().classList.add('open');const k=chLs(CHK)||chLs('taf-marko-chave')||'';
  $('#lbox').innerHTML=`<h3>ERP TAF</h3><div class="sub">Entre com a mesma chave do site TAF. A chave fica guardada só neste aparelho.</div>
   <label>Chave</label><input id="ch-k" type="password" autocomplete="current-password" value="${esc(k)}">
   <label>Seu nome</label><input id="ch-q" type="text" autocomplete="name" value="${esc(chLs(CHQ)||'')}" placeholder="aparece em tudo que você lançar">
   <div id="l-msg" class="sub" style="margin-top:10px;${msg?'color:var(--bad)':''}">${esc(msg||'')}</div>
   <div class="acts"><a class="btn" href="/">Voltar ao site</a><button class="btn dark" data-act="l-entrar">Entrar</button></div>`;
  setTimeout(()=>{const i=$(k?'#ch-q':'#ch-k');if(i)i.focus()},50)}
async function chLoginForm(){const k=($('#ch-k').value||'').trim(),q=($('#ch-q').value||'').trim();if(!k)return lmsg('Informe a chave.');
  lmsg('Aguarde…',false);try{await chEntrar(k,q,true)}catch(e){lmsg(chMsg(e))}}
document.addEventListener('keydown',e=>{if(MODO_CH&&e.key==='Enter'&&e.target&&(e.target.id==='ch-k'||e.target.id==='ch-q'))chLoginForm()});
async function chEntrar(k,q,doForm){
  const pp=chLs(CHP);const r=await chRpc('taf_erp_entrar',{p_chave:k,p_quem:q||null,p_papel:pp||null});
  CH.fixo=!!r.fixo;CH.leitura=!!r.leitura;CH.obras=r.obras||[];CH.quem=CH.fixo?(r.quem||q):q;
  if(!CH.quem){if(doForm)throw new Error('Informe seu nome.');chTela('Informe seu nome.');return}
  CH.chave=k;chLs(CHK,k);if(q)chLs(CHQ,q);login().classList.remove('open');
  S.role=CH.fixo?r.papel:(pp&&ROLES[pp]&&!['admin','pendente'].includes(pp)?pp:r.papel);
  SB.perfil={nome:CH.quem,papel:S.role};
  const rs=$('#role');if(CH.fixo)rs.parentNode.style.display='none';else{rs.parentNode.style.display='';rs.value=S.role}
  $('#userbox').style.display='block';
  $('#userbox').innerHTML=`<div class="note"><b>${esc(CH.quem)}</b><span>${CH.leitura?'Só leitura':CH.fixo?esc(ROLES[S.role]?.n||S.role)+' · chave pessoal':'Chave do site · papel escolhido acima'}</span><div style="margin-top:8px;display:flex;gap:6px"><a class="btn sm" href="/">Site</a><button class="btn sm" data-act="sair">Sair</button></div></div>`;
  OBRAS_PADRAO.length=0;CH.obras.forEach(o=>OBRAS_PADRAO.push([o.codigo,(o.contratante||'')+' · '+o.nome]));
  SB.obras=CH.obras.map(o=>({...o,id:o.codigo}));
  if(!SB.obras.length){telaAviso('Nenhuma obra no banco','As obras ainda não foram carregadas.');return}
  /* link vindo do Marko ou da gestão (/erp?obra=342&tarefa=T18&demanda=3): abre a obra e a tarefa pedidas, na tela "da tarefa à compra" */
  const po=new URLSearchParams(location.search).get('obra');
  await chCarregar(SB.obras.find(o=>o.codigo===po)||SB.obras.find(o=>o.codigo===obraGuardada())||SB.obras[0]);
}
$('#role').addEventListener('change',e=>{if(!MODO_CH||CH.fixo)return;chLs(CHP,e.target.value);if(SB.perfil)SB.perfil.papel=e.target.value});
/* a chave vem de onde a pessoa chegou: link do /marko (?de=marko) ou do /ciclo (?de=ciclo) usa a chave daquela tela; senão a última do ERP, a do Ciclo, a do Marko, a do site */
function chChaveInicial(){const de=new URLSearchParams(location.search).get('de'),site=chLs('taf-chave'),cc=chLs('taf-ciclo-chave')||(chLs('taf-ciclo-sem-site')==='1'?null:site),mk=chLs('taf-marko-chave')||site;
  const ordem=de==='marko'?[mk,cc]:de==='ciclo'?[cc,mk]:[];const k=ordem.find(Boolean)||chLs(CHK)||cc||mk||site||'';
  return [k,chLs(CHQ)||chLs('taf-quem')||'']}
async function chBoot(){const [k,qq]=chChaveInicial();
  if(!k){chTela();$('#view').innerHTML='';return}
  try{await chEntrar(k,qq,false)}
  catch(e){if(semRede(e)||e.status>=500){telaAviso('Sem conexão','Não consegui falar com o banco. Tente de novo quando tiver sinal.','<button class="btn dark" onclick="location.reload()">Tentar de novo</button>');return}
    $('#view').innerHTML='';chTela(chMsg(e))}}
function chSair(){chLs(CHK,null);location.reload()}

/* ---------- carregar a obra, ler o que mudou ---------- */
const poolKey=()=>'taf-erp-pool-'+SB.obraId;
async function chCarregar(ob){
  const cod=ob.codigo;SB.obraId=cod;SB.obraBase=cod;
  try{SB.pool=JSON.parse(chLs(poolKey())||'{}')||{}}catch(e){SB.pool={}}
  const r=await chRpc('taf_erp_ler',chArgs({p_base_sha:chShaGuardado(cod)}));
  const b=await chBaseDe(cod,r);
  S.D=JSON.parse(JSON.stringify(b.D));aplicaDocs(r.estado,r.docs);CH.ver=r.versao;
  S.exp=new Set(S.D.eap.filter(e=>e.nivel<=2).map(e=>e.codigo));
  pintaObra();$('#src-label').textContent='Banco do site TAF';$('#src-sub').textContent=CH.leitura?'Só leitura':'Tudo que você lança fica salvo para todos';
  if(!CH.leitura)Object.keys(PX).forEach(k=>{if(!(SB.pool[k]||[]).length||SB.pool[k].length<5)chPool(k)});
  /* o extrato financeiro histórico da obra (quando existe na base) NÃO é lançado sozinho: só entra quando alguém conferir e mandar */
  if(!CH.linkFeito&&new URLSearchParams(location.search).get('tarefa')){CH.linkFeito=1;S.view='rastro'}
  render();chOutras();
}
/* estado das outras obras, só para ler (painel da carteira, RH, comparativo): nunca é gravado por aqui */
function chTDe(est,docs){const t={...novoT(),...(est&&Object.keys(est).length?est:{})},map=Object.fromEntries(DOCS.map(([k,tp])=>[tp,k]));
  DOCS.forEach(([k])=>t[k]=[]);(docs||[]).forEach(r=>{if(map[r.tipo])t[map[r.tipo]].push(r.dados)});return t}
async function chOutras(){const atual=SB.obraId;
  for(const o of CH.obras){if(o.codigo===atual)continue;
    try{const r=await chRpc('taf_erp_ler',{p_chave:CH.chave,p_obra:o.codigo,p_quem:CH.quem||null,p_base_sha:chShaGuardado(o.codigo)});CH.T[o.codigo]=chTDe(r.estado,r.docs)}catch(e){}}
  if(SB.obraId===atual)render()}
async function chRecarrega(){const r=await chRpc('taf_erp_ler',chArgs({p_base_sha:chShaGuardado(SB.obraId)}));aplicaDocs(r.estado,r.docs);CH.ver=r.versao}
function chDelta(est,docs){const map=Object.fromEntries(DOCS.map(([k,tp])=>[tp,k]));
  (docs||[]).forEach(r=>{const k=map[r.tipo];if(!k)return;const a=S.t[k]||(S.t[k]=[]);const i=a.findIndex(o=>o.id===r.id);if(i>=0)a[i]=r.dados;else a.unshift(r.dados);SB.sync[r.id]=JSON.stringify(r.dados)});
  if(est&&Object.keys(est).length)Object.assign(S.t,est);
  if(S.D)prep();SB.estado=JSON.stringify(estadoObra())}
async function chPull(){if(!SB.obraId)return;
  const v=await chRpc('taf_erp_versao',{p_chave:CH.chave,p_obra:SB.obraId});if(+v===+CH.ver)return;
  const r=await chRpc('taf_erp_ler',chArgs({p_base_sha:chShaGuardado(SB.obraId),p_desde:CH.ver}));
  if(r.base_gz){await chCarregar(SB.obras.find(o=>o.codigo===SB.obraId)||{codigo:SB.obraId});return}
  chDelta(r.estado,r.docs);CH.ver=r.versao}

/* ---------- gravar: só o que mudou, em lotes; o banco confere papel e competência ---------- */
async function chSync(){
  if(SB.busy){sbSyncSoon();return}SB.busy=true;
  try{chLs(poolKey(),JSON.stringify(SB.pool||{}));
    const docs=sbDocs().filter(d=>{const j=JSON.stringify(d.dados);if(SB.sync[d.id]===j)return false;d._j=j;return true});
    const est=JSON.stringify(estadoObra()),estMudou=est!==SB.estado;
    if(!docs.length&&!estMudou)return;
    if(CH.leitura){toast('Chave só de leitura: nada foi salvo.');await chRecarrega();render();return}
    let rec=[],ign=false;
    for(let i=0;i<Math.max(docs.length,1);i+=200){const lote=docs.slice(i,i+200),comEst=i===0&&estMudou;
      if(!lote.length&&!comEst)break;
      const r=await chRpc('taf_erp_salvar',chArgs({p_papel:S.role,p_docs:lote.map(d=>({id:d.id,tipo:d.tipo,dados:d.dados})),p_estado:comEst?JSON.parse(est):null}));
      const bad=new Set((r.recusados||[]).map(x=>x.id));lote.forEach(d=>{if(!bad.has(d.id))SB.sync[d.id]=d._j});rec=rec.concat(r.recusados||[]);
      if(comEst){if(r.estado==='gravado')SB.estado=est;else ign=true}}
    try{localStorage.removeItem(filaKey())}catch(_){}
    if(rec.length||ign){toast(rec.length?'Não salvou '+rec.length+' registro(s): '+chMotivo(rec[0].motivo)+'.':'Linha de base e parâmetros só são salvos por Gestão, Diretoria ou Gerente.');await chRecarrega();render()}
  }catch(e){
    if(semRede(e)){const pend=sbDocs().filter(d=>SB.sync[d.id]!==JSON.stringify(d.dados));filaSalva(pend);toast('Sem sinal: '+pend.length+' registro(s) guardado(s) no aparelho. Sobem quando voltar a conexão.')}
    else{toast('Não salvou: '+chMsg(e));try{await chRecarrega();render()}catch(_){}}}
  finally{SB.busy=false}
}
async function chPool(k){if(!SB.obraId||CH.leitura)return;SB.poolBusy=SB.poolBusy||{};if(SB.poolBusy[k])return;SB.poolBusy[k]=1;
  try{const a=+(await chRpc('taf_erp_numeros',chArgs({p_tipo:k,p_qtd:20})));if(a){SB.pool=SB.pool||{};SB.pool[k]=[...(SB.pool[k]||[]),...Array.from({length:20},(_,i)=>a+i)];chLs(poolKey(),JSON.stringify(SB.pool))}}catch(e){}
  SB.poolBusy[k]=0}

/* ---------- o planejamento da semana fica no Ciclo do site ---------- */
function chViewLean(){return `<div class="head"><div><h1>Planejamento semanal</h1><p class="lead">O plano da semana, as restrições, as demandas para compras e o PPC da obra agora ficam no <b>Ciclo semanal</b> do site: o engenheiro preenche no celular e a gestão acompanha.</p></div></div>
  <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn dark" href="/marko">Tela do engenheiro</a><a class="btn" href="/ciclo">Visão da gestão</a></div>`}

if(MODO_CH){sbBoot=chBoot;sbSync=chSync;sbPull=chPull;sbPool=chPool;sbCarregar=chCarregar;sbSair=chSair;doLogin=chLoginForm;obraData=chObraData;viewLean=chViewLean;
  sbImportar=async()=>toast('As obras são carregadas no banco pelo site.');importarObraBanco=sbImportar;
  chamaFuncao=async()=>{throw new Error('As integrações externas ficam desligadas no site TAF.')}}
