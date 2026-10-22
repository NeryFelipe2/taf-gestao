/* ============ INTEGRAÇÕES (NF-e pelo provedor): só com login ativo ============ */
const INTEG={msg:'',busy:false};
async function chamaFuncao(nome,body){if(!MODO_SB)throw new Error('As integrações usam credenciais guardadas no servidor e exigem o login ativo (config.js com modo "supabase").');
  const r=await SB.c.functions.invoke(nome,{body});if(r.error)throw new Error(r.error.message||'Falha ao chamar '+nome);return r.data}
const dataBR=iso=>iso?iso.split('-').reverse().join('/'):'';
async function nfeBuscar(){INTEG.busy=true;INTEG.msg='Buscando notas no provedor…';render();
  try{const d=await chamaFuncao('nfe-sync',{versao:S.t.par.nfeVersao,max:20});
    if(!d.configurado)INTEG.msg='Provedor ainda sem credenciais: cadastre NFE_PROVIDER_TOKEN e NFE_CNPJ nos secrets do Supabase.';
    else if(d.erro)INTEG.msg='Provedor: '+d.erro;
    else{const r=importaXmls(d.notas.map(n=>[n.nome,n.xml]));if(d.proximaVersao)S.t.par.nfeVersao=d.proximaVersao;save();INTEG.msg=`${r.ok.length} nota(s) nova(s) importada(s)${r.dup.length?' · '+r.dup.length+' já lançada(s)':''}${r.erro.length?' · '+r.erro.length+' com erro':''}.`}}
  catch(e){INTEG.msg=e.message}INTEG.busy=false;render()}
function viewIntegracoes(comp){
    const pill=MODO_SB?'<span class="pill info">Login ativo</span>':'<span class="pill mute">Requer login</span>';
  return `<div class="panel-t" style="margin-top:18px">Integrações ${pill}</div>
  <div class="sub">As credenciais ficam só nos secrets do servidor (Supabase), nunca no app. Sem login ativo os botões abaixo explicam o que falta. ${INTEG.msg?`<b>${esc(INTEG.msg)}</b>`:''}</div>
  <div class="tw"><table class="tbl"><tbody>
  <tr><td><b>NF-e recebidas (provedor)</b><div class="mut" style="font-size:11.5px">Busca os XMLs das notas emitidas contra o CNPJ da TAF e importa pela fila “sem rateio”</div></td><td class="r"><button class="btn sm dark" data-act="nfe-buscar" ${INTEG.busy||!(can('nota')||can('recFat'))?'disabled':''}>Buscar notas novas</button></td></tr>

  </tbody></table></div>`}
