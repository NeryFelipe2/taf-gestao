/* ============ META PELA TELA (item 2 do "sistema sozinho"): o engenheiro propõe, a Gestão aprova ============
   Chave da obra "meta_tela" (Compras → Parâmetros → Chaves desta obra). Padrão DESLIGADA: desligada, o ERP é o de sempre e nada daqui chama o banco.
   Ligada:
   - Orçamento → item: "Propor meta" (Engenheiro, Gerente, Gestão, Diretoria) e, para Gestão e Diretoria com chave pessoal, "Mudar meta" (direto, com motivo).
   - Pacotes → pacote: "Propor meta do pacote" (meta, teto, fechar até) e "Mudar meta do pacote".
   - Obra → Metas: "Para aprovar" (Gerente, Gestão e Diretoria com chave pessoal, regra D4; quem propôs não decide), "Minhas propostas" e o histórico.
   - A Gestão também remaneja saldo (Remanejar passa a ser de Gerente, Gestão e Diretoria).
   Onde fica cada coisa:
   - a proposta e a decisão ficam no banco, tabela taf_erp_meta_prop (fonte/erp/sql/05_meta.sql), pelas funções taf_erp_meta_*;
   - a meta aprovada entra no estado da obra pelo MESMO caminho do Atualizar pela planilha: estado.baseOv do item (meta, teto, meta unitária),
     estado.basePac do pacote, versão nova da linha de base (só depois de congelada, como na planilha), histórico com o motivo e auditoria (antes e depois).
     Quem aplica é o navegador de quem grava o estado (Gestão, Diretoria ou Gerente: taf_erp_salvar só grava o estado desses papéis).
   - o histórico da linha de base guarda o número da proposta aplicada (hist[].prop). Ao abrir a obra (e a cada minuto com a obra aberta), quem grava o estado
     aplica as aprovadas que ainda não estão no histórico, na ordem em que foram aprovadas. Se um navegador com o estado velho gravar por cima, a marca some junto
     com a meta e a próxima passada aplica de novo; campo que uma aprovada mais nova já mudou não volta para o valor velho.
   Sem banco (demonstração e testes do Node) as propostas ficam no próprio navegador, com as mesmas regras do banco. */
CHAVES_OBRA.push({k:'meta_tela',n:'Meta pela tela: proposta e aprovação (item 2)',d:'O engenheiro propõe meta e teto do item, ou meta, teto e “fechar até” do pacote, com motivo. Gerente, Gestão ou Diretoria aprovam ou recusam com a chave pessoal (com a chave geral do site ninguém aprova) e quem propôs não decide. A meta aprovada entra na linha de base como versão nova, com motivo, histórico e auditoria. Gestão e Diretoria com chave pessoal também mudam a meta direto, com motivo. Com a chave ligada a Gestão também remaneja saldo. Precisa do 05_meta.sql aplicado no banco (ainda é rascunho): antes disso, ligue só na obra 999 de teste.'});
const metaTela=t=>chaveLigada('meta_tela',t);
CAN.metaPropor=['engenheiro','gerente','gestao','diretoria'];
CAN.metaDecidir=['gerente','gestao','diretoria'];
CAN.metaDireta=['gestao','diretoria'];
/* Remanejar: com a chave ligada a Gestão também remaneja. Desligada continua Gerente e Diretoria (01_papeis.js), igual ao ERP de partida. */
{const base=CAN.remanejar.slice();Object.defineProperty(CAN,'remanejar',{configurable:true,enumerable:true,get:()=>metaTela()?[...base,'gestao']:base})}

const MP={obra:null,lista:[],quando:0,erro:'',busy:false,aplicando:false,falhas:{}};
const metaObra=()=>MODO_SB?SB.obraId:(S.D&&S.D.obra?S.D.obra.codigo:null);
const metaDaObra=()=>(MP.obra===metaObra()?MP.lista:[]).filter(p=>p&&String(p.obra)===String(metaObra()));
const metaPessoal=()=>MODO_CH?!!CH.fixo:true;   /* sem banco (demonstração) não existe chave: vale como pessoal */
const metaLeitura=()=>MODO_CH&&!!CH.leitura;
const metaEhMeu=p=>nomeNorm(p.proposto_por)!==''&&nomeNorm(p.proposto_por)===nomeNorm(user());
/* quem grava o estado da obra no banco (taf_erp_salvar): admin, gestão, diretoria e gerente */
const metaGravaEstado=()=>!metaLeitura()&&['admin','gestao','diretoria','gerente'].includes(S.role);
const metaNum=v=>{const s=String(v??'').trim();if(s==='')return null;const n=Number(s.replace(',','.'));return Number.isFinite(n)?n:NaN};

/* ---------- mensagens do banco em português de obra ---------- */
const META_ERR=[['DECIDIR META SO COM CHAVE PESSOAL','Decidir meta exige a chave pessoal. Com a chave geral do site ninguém aprova.'],
 ['MUDAR META DIRETO SO COM CHAVE PESSOAL','Mudar a meta direto exige a chave pessoal.'],['SO GESTAO E DIRETORIA MUDAM META DIRETO','Só Gestão e Diretoria mudam a meta direto.'],
 ['QUEM PROPOS NAO DECIDE','Quem propôs não decide a própria proposta.'],['RECUSAR PEDE MOTIVO','Para recusar, escreva o motivo.'],['MOTIVO OBRIGATORIO','Escreva o motivo.'],
 ['MOTIVO GRANDE DEMAIS','Motivo grande demais: no máximo 500 letras.'],['PROPOSTA JA DECIDIDA','Esta proposta já foi decidida. A lista foi atualizada.'],
 ['JA HA PROPOSTA PENDENTE PARA ESTE ITEM','Este item já tem uma proposta esperando decisão.'],['JA HA PROPOSTA PENDENTE PARA ESTE PACOTE','Este pacote já tem uma proposta esperando decisão.'],
 ['SO QUEM PROPOS CANCELA','Só quem propôs cancela.'],['CANCELE COM A SUA CHAVE PESSOAL','Esta proposta foi feita com chave pessoal: cancele com a sua chave pessoal.'],
 ['INFORME META, TETO OU DATA','Informe a meta, o teto ou a data.'],['VALOR INVALIDO','Valor inválido.'],['DATA INVALIDA','Data inválida.'],['FECHAR ATE SO NO PACOTE','“Fechar até” só existe no pacote.'],
 ['ITEM NAO EXISTE NA OBRA','Este item não está no banco desta obra.'],['PACOTE NAO EXISTE NA OBRA','Este pacote não está no banco desta obra.'],
 ['MUITAS PROPOSTAS PENDENTES NA OBRA','Muitas propostas esperando decisão nesta obra. Decida as antigas antes.'],['PROPOSTA NAO EXISTE','Proposta não encontrada.'],['ALVO INVALIDO','Pedido inválido.']];
function metaMsg(e){const m=String(e&&e.message||e||'');
  if(/does not exist|Could not find the function|PGRST202|schema cache/i.test(m))return 'O banco ainda não tem a parte de metas (05_meta.sql não aplicado). Peça ao administrador.';
  const x=m.match(/PAPEL (\w+) NAO (PROPOE|DECIDE) META/);if(x)return 'O papel '+((ROLES[x[1].toLowerCase()]||{}).n||x[1])+(x[2]==='PROPOE'?' não propõe meta.':' não decide meta.');
  const k=META_ERR.find(([c])=>m.includes(c));if(k)return k[1];return typeof chMsg==='function'?chMsg(e):m}

/* ---------- onde ficam as propostas: banco (modo chave do site) ou o próprio navegador (sem banco) ---------- */
const MPR={   /* banco: funções taf_erp_meta_* (05_meta.sql), com a chave do site */
  listar:()=>chRpc('taf_erp_meta_listar',chArgs({})),
  propor:o=>chRpc('taf_erp_meta_propor',chArgs({p_papel:S.role,p_alvo:o.alvo,p_codigo:o.codigo,p_meta:o.meta,p_teto:o.teto,p_fechar_ate:o.fechar_ate,p_motivo:o.motivo,p_antes:o.antes})),
  direta:o=>chRpc('taf_erp_meta_direta',chArgs({p_papel:S.role,p_alvo:o.alvo,p_codigo:o.codigo,p_meta:o.meta,p_teto:o.teto,p_fechar_ate:o.fechar_ate,p_motivo:o.motivo,p_antes:o.antes})),
  decidir:(id,ap,m)=>chRpc('taf_erp_meta_decidir',chArgs({p_papel:S.role,p_id:id,p_aprovar:!!ap,p_motivo:m||null})),
  cancelar:(id,m)=>chRpc('taf_erp_meta_cancelar',chArgs({p_id:id,p_motivo:m||null}))};
/* sem banco: as mesmas regras do 05_meta.sql, guardadas neste navegador (demonstração e testes). Erros com o mesmo texto do banco. */
const mplK=()=>'taf_meta_prop_'+metaObra();
const mplLer=()=>{try{const L=JSON.parse(localStorage.getItem(mplK())||'[]');return Array.isArray(L)?L:[]}catch(e){return []}};
const mplGrava=L=>{try{localStorage.setItem(mplK(),JSON.stringify(L))}catch(e){}};
const mplErr=m=>{throw new Error(m)};
function mplValida(L,o){
  if(!['item','pacote'].includes(o.alvo))mplErr('ALVO INVALIDO');
  if(o.alvo==='item'&&!(S.byCod[o.codigo]&&S.byCod[o.codigo].tipo_linha==='item'))mplErr('ITEM NAO EXISTE NA OBRA');
  if(o.alvo==='pacote'&&!S.D.items.some(i=>i.pacote===o.codigo))mplErr('PACOTE NAO EXISTE NA OBRA');
  if(o.meta==null&&o.teto==null&&!o.fechar_ate)mplErr('INFORME META, TETO OU DATA');
  if([o.meta,o.teto].some(v=>v!=null&&!(v>=0&&v<=9999999999)))mplErr('VALOR INVALIDO');
  if(o.alvo==='item'&&o.fechar_ate)mplErr('FECHAR ATE SO NO PACOTE');
  if(String(o.motivo||'').trim().length<3)mplErr('MOTIVO OBRIGATORIO');
  if(L.some(p=>p.alvo===o.alvo&&p.codigo===o.codigo&&p.situacao==='pendente'))mplErr('JA HA PROPOSTA PENDENTE PARA ESTE '+o.alvo.toUpperCase())}
const mplNovo=(L,o,extra)=>({id:L.reduce((m,p)=>Math.max(m,+p.id||0),0)+1,obra:metaObra(),alvo:o.alvo,codigo:o.codigo,meta:o.meta==null?null:r2(o.meta),teto:o.teto==null?null:r2(o.teto),
  fechar_ate:o.fechar_ate||null,antes:o.antes||{},motivo:String(o.motivo).trim(),origem:'proposta',situacao:'pendente',proposto_por:user(),proposto_papel:S.role,proposto_pessoal:true,
  proposto_em:new Date().toISOString(),decidido_por:null,decidido_papel:null,decidido_em:null,decisao_motivo:null,ordem:null,...extra});
const mplOrdem=L=>L.reduce((m,p)=>Math.max(m,+p.ordem||0),0)+1;
const MPL={
  listar:async()=>mplLer().sort((a,b)=>b.id-a.id),
  propor:async o=>{const L=mplLer();if(!CAN.metaPropor.includes(S.role)&&S.role!=='admin')mplErr('PAPEL '+S.role.toUpperCase()+' NAO PROPOE META');mplValida(L,o);const p=mplNovo(L,o);L.push(p);mplGrava(L);return p},
  direta:async o=>{const L=mplLer();if(!CAN.metaDireta.includes(S.role)&&S.role!=='admin')mplErr('SO GESTAO E DIRETORIA MUDAM META DIRETO');mplValida(L,o);
    const p=mplNovo(L,o,{origem:'direta',situacao:'aprovada',decidido_por:user(),decidido_papel:S.role,decidido_em:new Date().toISOString(),ordem:mplOrdem(L)});L.push(p);mplGrava(L);return p},
  decidir:async(id,ap,m)=>{const L=mplLer(),p=L.find(x=>+x.id===+id);if(!CAN.metaDecidir.includes(S.role)&&S.role!=='admin')mplErr('PAPEL '+S.role.toUpperCase()+' NAO DECIDE META');
    if(!p)mplErr('PROPOSTA NAO EXISTE');if(p.situacao!=='pendente')mplErr('PROPOSTA JA DECIDIDA');if(nomeNorm(p.proposto_por)===nomeNorm(user()))mplErr('QUEM PROPOS NAO DECIDE');
    if(!ap&&String(m||'').trim().length<3)mplErr('RECUSAR PEDE MOTIVO');
    Object.assign(p,{situacao:ap?'aprovada':'recusada',decidido_por:user(),decidido_papel:S.role,decidido_em:new Date().toISOString(),decisao_motivo:String(m||'').trim().slice(0,500)||null,ordem:ap?mplOrdem(L):null});mplGrava(L);return p},
  cancelar:async(id,m)=>{const L=mplLer(),p=L.find(x=>+x.id===+id);if(!p)mplErr('PROPOSTA NAO EXISTE');if(p.situacao!=='pendente')mplErr('PROPOSTA JA DECIDIDA');
    if(nomeNorm(p.proposto_por)!==nomeNorm(user()))mplErr('SO QUEM PROPOS CANCELA');
    Object.assign(p,{situacao:'cancelada',decidido_por:user(),decidido_papel:S.role,decidido_em:new Date().toISOString(),decisao_motivo:String(m||'').trim().slice(0,500)||null});mplGrava(L);return p}};
const metaBack=()=>MODO_CH?MPR:!MODO_SB?MPL:null;   /* o login antigo do TAF Admin (Supabase com e-mail) não tem as funções de meta */

/* ---------- o que está aplicado e o que falta aplicar ---------- */
const metaAplicadas=t=>new Set((((t||S.t)||{}).hist||[]).filter(h=>h&&h.prop!=null).map(h=>String(h.prop)));
const META_CAMPOS={item:['meta','teto'],pacote:['meta','teto','fechar_ate']};
const metaTem=(p,c)=>p[c]!=null&&p[c]!=='';
const metaCampos=p=>(META_CAMPOS[p.alvo]||[]).filter(c=>metaTem(p,c));
/* aprovadas que ainda não estão no histórico, na ordem da decisão. Para cada campo, se uma aprovada MAIS NOVA do mesmo item já está aplicada, o campo fica de fora
   (não volta para o valor velho). Devolve [{p, campos}]; campos vazio = superada por outra mais nova. */
function metaParaAplicar(lista,t){
  const ap=metaAplicadas(t),A=(lista||[]).filter(p=>p.situacao==='aprovada'&&p.ordem!=null).sort((a,b)=>+a.ordem-+b.ordem);
  return A.filter(p=>!ap.has(String(p.id))).map(p=>({p,campos:metaCampos(p).filter(c=>!A.some(q=>+q.ordem>+p.ordem&&q.alvo===p.alvo&&q.codigo===p.codigo&&ap.has(String(q.id))&&metaTem(q,c)))}))}
const metaAlvoTxt=p=>(p.alvo==='pacote'?'pacote ':'item ')+p.codigo;
const metaDeQuem=p=>p.origem==='direta'?'mudança direta de '+p.decidido_por:'proposta de '+p.proposto_por+', aprovada por '+p.decidido_por;
/* aplica UMA aprovada no estado (mesmo caminho do Atualizar pela planilha). Precisa do prep() em dia. Não grava: quem chama faz prep() e save(). */
function metaAplicaUma(p,campos){
  const motivo='Meta '+metaAlvoTxt(p)+' (nº '+p.id+', '+metaDeQuem(p)+'): '+p.motivo;
  const v=(S.t.versao||1)+(S.t.frozen?1:0),mud=[];
  if(p.alvo==='item'){const i=S.byCod[p.codigo];if(!i||i.tipo_linha!=='item')return {ok:false,motivo:'o item '+p.codigo+' não existe no orçamento desta obra'};
    S.t.baseOv=S.t.baseOv||{};const ov=S.t.baseOv[p.codigo],mu0=ov?ov.meta_unit:i._mu0;
    const nm=campos.includes('meta')?r2(+p.meta):null,nt=campos.includes('teto')?r2(+p.teto):null;
    S.t.baseOv[p.codigo]={meta_total:nm!=null?nm:i.meta_base,teto_total:nt!=null?nt:i.teto_total,status_cotacao:i.status_cotacao,meta_unit:nm!=null&&i.qtd?r2(nm/i.qtd*10000)/10000:mu0};
    if(nm!=null){if(S.t.metaOv&&S.t.metaOv[p.codigo]!=null){log('item_eap',p.codigo,'remanejamento',S.t.metaOv[p.codigo],'substituído pela meta aprovada',motivo);delete S.t.metaOv[p.codigo]}
      log('item_eap',p.codigo,'meta_total',i.meta_total,nm,motivo);mud.push('meta '+brl(i.meta_total)+' → '+brl(nm))}
    if(nt!=null){log('item_eap',p.codigo,'teto_total',i.teto_total,nt,motivo);mud.push('teto '+brl(i.teto_total)+' → '+brl(nt))}}
  else{const pc=S.D.pacotes.find(x=>x.codigo===p.codigo);if(!pc)return {ok:false,motivo:'o pacote '+p.codigo+' não existe nesta obra'};
    S.t.basePac=S.t.basePac||{};const novo={meta:pc.meta,teto:pc.teto,fechar_ate:pc.fechar_ate};
    campos.forEach(c=>{const nv=c==='fechar_ate'?String(p[c]).slice(0,10):r2(+p[c]);log('pacote',p.codigo,c,pc[c],nv,motivo);mud.push(c==='fechar_ate'?'fechar até '+fdata(pc[c])+' → '+fdata(nv):c+' '+brl(pc[c])+' → '+brl(nv));novo[c]=nv});
    S.t.basePac[p.codigo]={...(S.t.basePac[p.codigo]||{}),...novo}}
  S.t.versao=v;S.t.hist.push({versao:v,motivo:motivo+' · '+mud.join(', '),quando:new Date().toISOString(),quem:user(),prop:p.id});
  log('obra',S.D.obra.codigo,'linha_base','v'+(v-(S.t.frozen?1:0)),'v'+v+' · meta '+metaAlvoTxt(p)+' · nº '+p.id,p.motivo);
  return {ok:true,versao:v}}
/* aplica as aprovadas que faltam. Só quem grava o estado; antes relê o estado do banco (outro navegador pode ter aplicado). Devolve quantas aplicou. */
async function metaAplicarAprovadas(){
  if(!metaTela()||MP.aplicando||!metaGravaEstado()||!S.D)return 0;
  const ob=metaObra(),fila=()=>metaParaAplicar(metaDaObra(),S.t).filter(x=>x.campos.length&&!MP.falhas[x.p.id]);
  if(!fila().length)return 0;
  if(MODO_SB&&(SB.busy||SB.timer))return 0;   /* gravação em andamento: tenta de novo na próxima passada */
  MP.aplicando=true;
  try{if(MODO_SB){await sbPull();if(metaObra()!==ob)return 0}
    const F=fila();if(!F.length)return 0;
    prep();let n=0;F.forEach(x=>{const r=metaAplicaUma(x.p,x.campos);if(r.ok)n++;else MP.falhas[x.p.id]=r.motivo});
    if(n){prep();save();toast(n===1?'Meta aprovada entrou na linha de base v'+S.t.versao:n+' metas aprovadas entraram na linha de base (v'+S.t.versao+')')}
    return n}
  finally{MP.aplicando=false}}

/* ---------- leitura da lista (ao abrir a obra e a cada minuto) ---------- */
async function metaSincroniza(){
  const ob=metaObra(),B=metaBack();if(!ob||MP.busy||!metaTela())return;
  MP.busy=true;if(MP.obra!==ob){MP.lista=[];MP.erro='';MP.falhas={}}
  let L=null,err='';
  try{if(!B)throw new Error('A meta pela tela usa o banco do site (entrada com a chave do site).');L=await B.listar()}catch(e){err=metaMsg(e)}
  if(metaObra()===ob){if(L)MP.lista=Array.isArray(L)?L:[];MP.erro=err;MP.obra=ob;MP.quando=Date.now()}
  MP.busy=false;
  if(metaObra()!==ob)return;
  try{await metaAplicarAprovadas()}catch(e){MP.erro=metaMsg(e)}
  if(metaObra()===ob)render()}
/* chamado no fim de cada render(): agenda a leitura quando a obra mudou ou a lista tem mais de um minuto. Nunca lê dentro do render. */
function metaPass(){if(!metaTela()||!S.D||MP.busy)return;const ob=metaObra();if(!ob)return;
  if(MP.obra!==ob||Date.now()-MP.quando>60000){MP.quando=Date.now();setTimeout(()=>metaSincroniza(),0)}}
window.addEventListener('focus',()=>{MP.quando=0});

/* ---------- regras da tela (o banco confere de novo) ---------- */
function metaPodePropor(){if(!metaTela())return [false,''];if(!metaBack())return [false,'A meta pela tela usa o banco do site.'];if(metaLeitura())return [false,'Chave só de leitura.'];
  if(!can('metaPropor'))return [false,'Só Engenheiro, Gerente, Gestão ou Diretoria propõem meta.'];return [true,'']}
function metaPodeDireta(){if(!metaTela()||!metaBack()||metaLeitura())return [false,''];if(!can('metaDireta'))return [false,'Só Gestão e Diretoria mudam a meta direto.'];
  if(!metaPessoal())return [false,'Mudar a meta direto exige a chave pessoal.'];return [true,'']}
function metaPodeDecidir(p){if(!metaTela()||!p||p.situacao!=='pendente')return [false,''];if(metaLeitura())return [false,'Chave só de leitura.'];
  if(!can('metaDecidir'))return [false,'Só Gerente, Gestão ou Diretoria decidem meta.'];
  if(!metaPessoal())return [false,'Decidir exige a chave pessoal: com a chave geral do site ninguém aprova.'];
  if(metaEhMeu(p))return [false,'Quem propôs não decide a própria proposta.'];return [true,'']}
const metaPendenteDe=(alvo,cod)=>metaDaObra().find(p=>p.alvo===alvo&&p.codigo===cod&&p.situacao==='pendente');
const metaParaMim=()=>metaDaObra().filter(p=>p.situacao==='pendente'&&metaPodeDecidir(p)[0]);

/* situação de uma proposta, em texto de obra */
function metaSituacao(p){
  if(p.situacao==='pendente')return ['warn','aguardando decisão'];
  if(p.situacao==='recusada')return ['bad','recusada'];
  if(p.situacao==='cancelada')return ['mute','cancelada'];
  const h=(S.t.hist||[]).find(x=>x&&String(x.prop)===String(p.id));if(h)return ['ok','na linha de base v'+h.versao];
  if(MP.falhas[p.id])return ['bad','aprovada · não entrou: '+MP.falhas[p.id]];
  const f=metaParaAplicar(metaDaObra(),S.t).find(x=>String(x.p.id)===String(p.id));
  if(f&&!f.campos.length)return ['mute','aprovada · superada por outra mais nova'];
  return ['info','aprovada · entra na linha de base quando Gestão, Diretoria ou Gerente abrir a obra']}

/* valores de hoje do item ou do pacote (o que a tela mostra) */
function metaHoje(alvo,cod){
  if(alvo==='item'){const i=S.byCod[cod];if(!i||i.tipo_linha!=='item')return null;
    return {nome:i.descricao||'',venda:+i.preco_venda_total||0,meta:i.meta_total,teto:i.teto_total,real:S.sd&&S.sd[cod]?S.sd[cod].comp+S.sd[cod].real:0}}
  const p=S.D.pacotes.find(x=>x.codigo===cod);if(!p)return null;const its=p._it||[];
  return {nome:p.nome||'',venda:its.reduce((s,i)=>s+(+i.preco_venda_total||0),0),meta:p.meta,teto:p.teto,fechar_ate:p.fechar_ate,somaMeta:its.reduce((s,i)=>s+(+i.meta_total||0),0),
    somaTeto:its.reduce((s,i)=>s+(+i.teto_total||0),0),n:its.length,soma:typeof pacSoma==='function'&&pacSoma(p)}}
const metaMargem=(venda,meta)=>venda>0&&meta!=null?(venda-meta)/venda:null;
const metaPct=x=>x==null?'—':(x*100).toFixed(1).replace('.',',')+'%';

/* ---------- botões no item (Orçamento) e no pacote (Pacotes) ---------- */
function metaBotoes(alvo,cod){
  if(!metaTela())return '';const pp=metaPodePropor(),pd=metaPodeDireta(),pe=metaPendenteDe(alvo,cod),rot=alvo==='pacote'?' do pacote':'';
  return `${pe?`<span class="pill warn" title="${esc('Proposta nº '+pe.id+' de '+pe.proposto_por)}">proposta aguardando</span>`:''}`+
   `<button class="btn" data-act="meta-propor" data-alvo="${alvo}" data-cod="${esc(cod)}" ${pp[0]?'':`disabled title="${esc(pp[1])}"`}>Propor meta${rot}</button>`+
   (can('metaDireta')?`<button class="btn" data-act="meta-mudar" data-alvo="${alvo}" data-cod="${esc(cod)}" ${pd[0]?'':`disabled title="${esc(pd[1])}"`}>Mudar meta${rot}</button>`:'')}

/* ---------- janela de propor (ou mudar direto) ---------- */
let MTX=null;   /* {alvo, cod, direta} da janela aberta */
function metaModal(alvo,cod,direta){
  if(!metaTela())return;const pd=direta?metaPodeDireta():metaPodePropor();if(!pd[0])return toast(pd[1]||'Sem permissão');
  const lista=alvo==='pacote'?S.D.pacotes.filter(p=>(p._it||[]).length):S.D.items;
  if(!cod||!(alvo==='pacote'?lista.some(p=>p.codigo===cod):S.byCod[cod]))cod=lista.length?lista[0].codigo:'';
  MTX={alvo,cod,direta:!!direta};const h=metaHoje(alvo,cod);if(!h)return toast('Nada para propor nesta obra');
  const pe=metaPendenteDe(alvo,cod),rot=alvo==='pacote'?'do pacote':'do item';
  const opts=alvo==='pacote'?lista.map(p=>`<option value="${esc(p.codigo)}" ${p.codigo===cod?'selected':''}>${esc(p.codigo)} · ${esc(String(p.nome||'').slice(0,60))}</option>`).join(''):itemOptions(cod);
  const mg=metaMargem(h.venda,alvo==='pacote'?h.somaMeta:h.meta);
  modal(`<h3>${direta?'Mudar meta':'Propor meta'} ${rot} <span class="mono mut">${esc(cod)}</span></h3>
   <div class="sub">${direta?'A meta muda agora, sem proposta, e entra na linha de base como versão nova com o seu motivo.':'A proposta vai para Gerente, Gestão ou Diretoria aprovar. Nada muda na meta até a aprovação.'}</div>
   <label for="mt-alvo">${alvo==='pacote'?'Pacote':'Item'}</label><select id="mt-alvo" data-mt-alvo="1">${opts}</select>
   <div class="sub">${esc(h.nome)}</div>
   <div class="kpi4"><div><div class="k-l">Licitado</div><div class="v">${brl(h.venda)}</div></div><div><div class="k-l">Meta hoje</div><div class="v">${h.meta==null?'—':brl(h.meta)}</div></div>
    <div><div class="k-l">Teto hoje</div><div class="v ${h.meta!=null&&h.teto!=null&&h.meta>h.teto?'neg':''}">${h.teto==null?'—':brl(h.teto)}</div></div><div><div class="k-l">Margem hoje</div><div class="v ${mg!=null&&mg<0?'neg':''}">${metaPct(mg)}</div></div></div>
   ${alvo==='pacote'?`<div class="sub" style="margin-top:8px">${h.n} itens · soma das metas dos itens ${brl(h.somaMeta)} · soma dos tetos ${brl(h.somaTeto)} · fechar até ${fdata(h.fechar_ate)}${h.soma?'. Com a chave “Eventos e pacotes pela soma dos itens” ligada, as telas usam a soma dos itens: a meta e o teto do pacote ficam como valor de cadastro.':''}</div>`:''}
   ${pe?`<div class="alert" style="margin-top:12px"><div class="g" style="color:var(--warn)">!</div><div><b>Já tem proposta esperando decisão</b><p>Nº ${esc(pe.id)} de ${esc(pe.proposto_por)} em ${metaQuando(pe.proposto_em)}: ${esc(metaResumoProp(pe))}. Motivo: ${esc(pe.motivo)}</p>${metaEhMeu(pe)?`<button class="btn sm no" data-act="meta-cancelar" data-id="${esc(pe.id)}">Cancelar a minha proposta</button>`:''}</div></div>`:''}
   <div class="${alvo==='pacote'?'g3':'g2'}" style="margin-top:10px"><div><label for="mt-m">Meta nova (R$)</label><input id="mt-m" data-mt="1" type="number" inputmode="decimal" step="0.01" min="0" placeholder="mantém"></div>
    <div><label for="mt-t">Teto novo (R$)</label><input id="mt-t" data-mt="1" type="number" inputmode="decimal" step="0.01" min="0" placeholder="mantém"></div>
    ${alvo==='pacote'?`<div><label for="mt-f">Fechar até</label><input id="mt-f" data-mt="1" type="date"></div>`:''}</div>
   <label for="mt-mo">Motivo (obrigatório)</label><textarea id="mt-mo" rows="2" maxlength="500" placeholder="ex.: cotação do fornecedor veio acima da meta"></textarea>
   <div id="mt-prev" class="sub" style="margin-top:8px"></div><div id="mt-msg" class="sub"></div>
   <div class="acts"><button class="btn" data-act="fechar">Cancelar</button><button class="btn dark" data-act="meta-enviar" ${pe?'disabled title="Espere a decisão da proposta que já existe"':''}>${direta?'Mudar a meta agora':'Enviar para aprovação'}</button></div>`)}
const metaResumoProp=p=>[metaTem(p,'meta')?'meta '+brl(p.meta):'',metaTem(p,'teto')?'teto '+brl(p.teto):'',metaTem(p,'fechar_ate')?'fechar até '+fdata(String(p.fechar_ate).slice(0,10)):''].filter(Boolean).join(', ');
/* lê a janela: {alvo, codigo, meta, teto, fechar_ate, motivo, antes} ou {erro} */
function metaLeForm(){const x=MTX;if(!x)return {erro:'Abra a janela de novo.'};const h=metaHoje(x.alvo,x.cod);if(!h)return {erro:'Item não encontrado.'};
  const m=metaNum(($('#mt-m')||{}).value),t=metaNum(($('#mt-t')||{}).value),f=x.alvo==='pacote'?String(($('#mt-f')||{}).value||'').trim()||null:null,mo=String(($('#mt-mo')||{}).value||'').trim();
  if(Number.isNaN(m)||Number.isNaN(t)||(m!=null&&m<0)||(t!=null&&t<0))return {erro:'Valor inválido.'};
  if(f&&!/^\d{4}-\d{2}-\d{2}$/.test(f))return {erro:'Data inválida.'};
  const o={alvo:x.alvo,codigo:x.cod,meta:m==null?null:r2(m),teto:t==null?null:r2(t),fechar_ate:f,motivo:mo,antes:{meta:h.meta,teto:h.teto,venda:h.venda,...(x.alvo==='pacote'?{fechar_ate:h.fechar_ate||null}:{})}};
  const igual=(a,b)=>a!=null&&b!=null&&Math.abs(a-b)<0.005;
  if(o.meta==null&&o.teto==null&&!o.fechar_ate)return {erro:'Informe a meta nova, o teto novo'+(x.alvo==='pacote'?' ou a data':'')+'.',o};
  if((o.meta==null||igual(o.meta,h.meta))&&(o.teto==null||igual(o.teto,h.teto))&&(!o.fechar_ate||o.fechar_ate===h.fechar_ate))return {erro:'Nada muda: os valores são iguais aos de hoje.',o};
  if(mo.length<3)return {erro:'Escreva o motivo.',o};
  return {o,h}}
/* prévia ao digitar: como fica meta, teto e margem */
function metaPrevia(){const e=$('#mt-prev');if(!e||!MTX)return;const r=metaLeForm(),o=r.o,h=r.h||metaHoje(MTX.alvo,MTX.cod);if(!o||!h){e.innerHTML='';return}
  const meta=o.meta!=null?o.meta:h.meta,teto=o.teto!=null?o.teto:h.teto,venda=h.venda,txt=[];
  if(o.meta!=null)txt.push(`Meta ${h.meta==null?'—':brl(h.meta)} → <b>${brl(o.meta)}</b> (${o.meta-(h.meta||0)>=0?'+':''}${brl(o.meta-(h.meta||0))})`);
  if(o.teto!=null)txt.push(`Teto ${h.teto==null?'—':brl(h.teto)} → <b>${brl(o.teto)}</b>`);
  if(o.fechar_ate)txt.push(`Fechar até ${fdata(h.fechar_ate)} → <b>${fdata(o.fechar_ate)}</b>`);
  if(MTX.alvo==='item'&&o.meta!=null)txt.push('Margem fica '+metaPct(metaMargem(venda,meta)));
  if(meta!=null&&teto!=null&&meta>teto)txt.push('<span class="neg">Meta acima do teto: sem folga, qualquer compra nasce vermelha.</span>');
  if(MTX.alvo==='item'&&o.meta!=null&&h.real>meta)txt.push('<span class="neg">Já tem '+brl(h.real)+' comprometido ou realizado: a meta nova fica abaixo do gasto.</span>');
  e.innerHTML=txt.join(' · ')}
document.addEventListener('input',e=>{const t=e.target;if(t&&t.dataset&&t.dataset.mt!==undefined)metaPrevia()});
document.addEventListener('change',e=>{const t=e.target;if(t&&t.dataset&&t.dataset.mtAlvo!==undefined&&MTX)metaModal(MTX.alvo,t.value,MTX.direta)});
const metaMsgModal=m=>{const e=$('#mt-msg');if(e)e.innerHTML=m?`<span class="neg">${esc(m)}</span>`:''};
async function metaEnviar(){const x=MTX,B=metaBack();if(!x||!B)return;const r=metaLeForm();if(r.erro){metaMsgModal(r.erro);return toast(r.erro)}
  if(MP.enviando)return;MP.enviando=true;
  try{const p=await (x.direta?B.direta(r.o):B.propor(r.o));metaGuarda(p);closeModal();MTX=null;
    if(x.direta){const n=await metaAplicarAprovadas();toast(n?'Meta mudada · linha de base v'+S.t.versao:'Mudança registrada: entra na linha de base em seguida')}
    else toast('Proposta nº '+p.id+' enviada para aprovação');render()}
  catch(e){const m=metaMsg(e);metaMsgModal(m);toast(m)}
  finally{MP.enviando=false}}
/* põe na lista a linha que o banco devolveu (sem esperar a próxima leitura) */
function metaGuarda(p){if(!p||p.id==null)return;if(MP.obra!==metaObra()){MP.obra=metaObra();MP.lista=[]}
  const i=MP.lista.findIndex(x=>String(x.id)===String(p.id));if(i>=0)MP.lista[i]=p;else MP.lista.unshift(p)}

/* ---------- decidir e cancelar ---------- */
let MDX=null;
function metaDecideModal(id,ap){const p=metaDaObra().find(x=>String(x.id)===String(id));if(!p)return toast('Proposta não encontrada');
  const pd=metaPodeDecidir(p);if(!pd[0])return toast(pd[1]||'Sem permissão');MDX={id:p.id,ap:!!ap};const h=metaHoje(p.alvo,p.codigo)||{};
  modal(`<h3>${ap?'Aprovar':'Recusar'} a proposta nº ${esc(p.id)}</h3><div class="sub">${esc(metaAlvoTxt(p))} · ${esc(h.nome||'')}</div>
   ${metaTabela(p,h)}
   <div class="sub" style="margin-top:8px">Motivo de ${esc(p.proposto_por)}: ${esc(p.motivo)}</div>
   <label for="md-m">${ap?'Observação (opcional)':'Motivo da recusa (obrigatório)'}</label><textarea id="md-m" rows="2" maxlength="500"></textarea><div id="md-msg" class="sub"></div>
   ${ap?`<div class="sub" style="margin-top:8px">Ao aprovar, a meta entra na linha de base${S.t.frozen?' como versão v'+((S.t.versao||1)+1):''}, com histórico e auditoria.</div>`:''}
   <div class="acts"><button class="btn" data-act="fechar">Voltar</button><button class="btn ${ap?'ok':'no'}" data-act="meta-decide-ok">${ap?'Aprovar':'Recusar'}</button></div>`)}
async function metaDecideOk(){const x=MDX,B=metaBack();if(!x||!B)return;const m=String(($('#md-m')||{}).value||'').trim();
  if(!x.ap&&m.length<3){const e=$('#md-msg');if(e)e.innerHTML='<span class="neg">Escreva o motivo da recusa.</span>';return toast('Escreva o motivo da recusa')}
  if(MP.enviando)return;MP.enviando=true;
  try{const p=await B.decidir(x.id,x.ap,m);metaGuarda(p);closeModal();MDX=null;
    if(x.ap){const n=await metaAplicarAprovadas();toast(n?'Aprovada · meta na linha de base v'+S.t.versao:metaGravaEstado()?'Aprovada':'Aprovada: entra na linha de base quando Gestão, Diretoria ou Gerente abrir a obra')}
    else toast('Proposta recusada');render()}
  catch(e){const mm=metaMsg(e);const el=$('#md-msg');if(el)el.innerHTML=`<span class="neg">${esc(mm)}</span>`;toast(mm);if(/decidida/.test(mm)){MP.quando=0;metaSincroniza()}}
  finally{MP.enviando=false}}
function metaCancelarModal(id){const p=metaDaObra().find(x=>String(x.id)===String(id));if(!p)return toast('Proposta não encontrada');
  if(!metaEhMeu(p)||p.situacao!=='pendente')return toast('Só quem propôs cancela, enquanto espera decisão');MDX={id:p.id,cancelar:true};
  modal(`<h3>Cancelar a proposta nº ${esc(p.id)}</h3><div class="sub">${esc(metaAlvoTxt(p))}: ${esc(metaResumoProp(p))}</div>
   <label for="md-m">Motivo (opcional)</label><textarea id="md-m" rows="2" maxlength="500"></textarea><div id="md-msg" class="sub"></div>
   <div class="acts"><button class="btn" data-act="fechar">Voltar</button><button class="btn no" data-act="meta-cancela-ok">Cancelar a proposta</button></div>`)}
async function metaCancelaOk(){const x=MDX,B=metaBack();if(!x||!B||!x.cancelar)return;const m=String(($('#md-m')||{}).value||'').trim();
  try{const p=await B.cancelar(x.id,m);metaGuarda(p);closeModal();MDX=null;toast('Proposta cancelada');render()}
  catch(e){const mm=metaMsg(e);const el=$('#md-msg');if(el)el.innerHTML=`<span class="neg">${esc(mm)}</span>`;toast(mm)}}

/* hoje x proposto, com licitado, folga até o teto e margem */
function metaTabela(p,h){
  const linha=(rot,a,b,f)=>`<tr><td>${rot}</td><td class="r">${a==null?'—':esc(f(a))}</td><td class="r">${b==null?'<span class="mut">mantém</span>':'<b>'+esc(f(b))+'</b>'}</td></tr>`;
  const metaN=metaTem(p,'meta')?+p.meta:h.meta,tetoN=metaTem(p,'teto')?+p.teto:h.teto,folga=(m,t)=>m==null||t==null?null:t-m;
  const venda=h.venda,mg0=metaMargem(venda,p.alvo==='pacote'?h.somaMeta:h.meta),mg1=p.alvo==='pacote'?null:metaMargem(venda,metaN);
  /* grw: tabela curta do cartão, sem a barra de filtros que 42_filtros.js põe nas listas */
  return `<div class="tw grw"><table class="tbl"><thead><tr><th></th><th class="r">Hoje</th><th class="r">Proposto</th></tr></thead><tbody>
   ${linha('Meta',h.meta,metaTem(p,'meta')?+p.meta:null,v=>brl(v))}${linha('Teto',h.teto,metaTem(p,'teto')?+p.teto:null,v=>brl(v))}
   ${p.alvo==='pacote'?linha('Fechar até',h.fechar_ate||null,metaTem(p,'fechar_ate')?String(p.fechar_ate).slice(0,10):null,fdata):''}
   <tr><td>Licitado</td><td class="r mut">${brl(venda)}</td><td class="r mut">${brl(venda)}</td></tr>
   <tr><td>Folga até o teto</td><td class="r">${folga(h.meta,h.teto)==null?'—':brl(folga(h.meta,h.teto))}</td><td class="r ${folga(metaN,tetoN)!=null&&folga(metaN,tetoN)<0?'neg':''}">${folga(metaN,tetoN)==null?'—':brl(folga(metaN,tetoN))}</td></tr>
   ${p.alvo==='pacote'?`<tr><td>Margem dos itens</td><td class="r">${metaPct(mg0)}</td><td class="r mut">igual</td></tr>`:`<tr><td>Margem (licitado menos meta)</td><td class="r">${metaPct(mg0)}</td><td class="r ${mg1!=null&&mg1<0?'neg':''}">${metaPct(mg1)}</td></tr>`}
   </tbody></table></div>`}

/* ---------- tela Obra → Metas ---------- */
const metaQuemTxt=p=>`${esc(p.proposto_por)} · ${esc((ROLES[p.proposto_papel]||{}).n||p.proposto_papel)}${p.proposto_pessoal?'':' · chave do site (nome digitado)'}`;
const metaQuando=s=>s?esc(fdata(String(s).slice(0,10))+' '+String(s).slice(11,16)):'';
function metaCartao(p){const h=metaHoje(p.alvo,p.codigo)||{},st=metaSituacao(p),pd=metaPodeDecidir(p);
  const dec=p.situacao!=='pendente'&&p.decidido_por?`<div class="sub">${p.situacao==='cancelada'?'Cancelada':p.origem==='direta'?'Mudada direto':p.situacao==='aprovada'?'Aprovada':'Recusada'} por ${esc(p.decidido_por)} (${esc((ROLES[p.decidido_papel]||{}).n||p.decidido_papel||'')}) em ${metaQuando(p.decidido_em)}${p.decisao_motivo?': '+esc(p.decisao_motivo):''}</div>`:'';
  const acoes=p.situacao!=='pendente'?'':pd[0]?`<button class="btn sm no" data-act="meta-recusar" data-id="${esc(p.id)}">Recusar</button><button class="btn sm ok" data-act="meta-aprovar" data-id="${esc(p.id)}">Aprovar</button>`
    :metaEhMeu(p)?`<button class="btn sm no" data-act="meta-cancelar" data-id="${esc(p.id)}">Cancelar a minha proposta</button>`
    :can('metaDecidir')?`<span class="sub">${esc(pd[1])}</span>`:'';
  return `<div class="card"><div class="in">
   <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:flex-start"><div><b>${p.alvo==='pacote'?'Pacote':'Item'} <span class="mono">${esc(p.codigo)}</span></b><div class="mut" style="font-size:12px">${esc(String(h.nome||'').slice(0,80))}</div></div><span class="pill ${st[0]}">${esc(st[1])}</span></div>
   ${metaTabela(p,h)}
   <div class="sub" style="margin-top:6px">Motivo: ${esc(p.motivo)}</div>
   <div class="sub">${p.origem==='direta'?'Mudança direta':'Proposta'} nº ${esc(p.id)} · ${metaQuemTxt(p)} · ${metaQuando(p.proposto_em)}</div>${dec}
   ${acoes?`<div class="acts" style="margin-top:10px">${acoes}</div>`:''}</div></div>`}
function viewMetas(){
  const L=metaDaObra(),aprova=can('metaDecidir'),meus=L.filter(metaEhMeu),pend=L.filter(p=>p.situacao==='pendente'),pm=metaParaMim();
  const tab=S.tab.metas||(aprova?'aprovar':'minhas');
  const lista=tab==='aprovar'?pend:tab==='minhas'?meus:L;
  const pp=metaPodePropor(),faltam=metaParaAplicar(L,S.t).filter(x=>x.campos.length&&!MP.falhas[x.p.id]).length;
  const avisoChave=aprova&&!metaPessoal()?`<div class="alert" style="margin:10px 0"><div class="g" style="color:var(--warn)">!</div><div><b>Você entrou com a chave geral do site</b><p>Pode propor e acompanhar. Aprovar, recusar e mudar meta direto exigem a chave pessoal (regra D4).</p></div></div>`:'';
  const avisoErro=MP.erro?`<div class="alert" style="margin:10px 0"><div class="g" style="color:var(--bad)">!</div><div><b>Não consegui ler as propostas</b><p>${esc(MP.erro)}</p><button class="btn sm" data-act="meta-atualizar">Tentar de novo</button></div></div>`:'';
  const avisoFalta=faltam?`<div class="alert" style="margin:10px 0"><div class="g" style="color:var(--info)">i</div><div><b>${faltam} meta(s) aprovada(s) ainda fora da linha de base</b><p>${metaGravaEstado()?'Entram agora, quando a lista for lida.':'Entram quando Gestão, Diretoria ou Gerente abrir esta obra.'}</p></div></div>`:'';
  const vazio=tab==='aprovar'?empty('Nada esperando decisão.','As propostas de meta do engenheiro aparecem aqui.'):tab==='minhas'?empty('Você ainda não propôs meta.','Abra um item em Orçamento, ou um pacote em Pacotes, e clique em “Propor meta”.'):empty('Nenhuma proposta nesta obra.','');
  return `<div class="head"><div><h1>Metas</h1><p class="lead">O engenheiro propõe a meta e o teto do item, ou do pacote, com motivo. Gerente, Gestão ou Diretoria aprovam com a chave pessoal. A meta aprovada entra na linha de base como versão nova, com histórico e auditoria.</p></div>
   <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="meta-atualizar">Atualizar</button><button class="btn" data-act="meta-propor" data-alvo="pacote" ${pp[0]?'':`disabled title="${esc(pp[1])}"`}>Propor meta de pacote</button><button class="btn dark" data-act="meta-propor" data-alvo="item" ${pp[0]?'':`disabled title="${esc(pp[1])}"`}>Propor meta de item</button></div></div>
   ${avisoErro}${avisoChave}${avisoFalta}
   <div class="toolbar">${tabs('metas',[...(aprova?[['aprovar','Para aprovar',pm.length]]:[]),['minhas','Minhas propostas '+meus.length],['todas','Todas '+L.length]],tab)}<span class="sub">${MP.quando&&MP.obra===metaObra()?'Lida às '+new Date(MP.quando).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'Lendo…'}</span></div>
   ${lista.length?`<div class="ev-grid" style="margin-top:8px">${lista.map(metaCartao).join('')}</div>`:vazio}`}

/* ---------- contador no menu, alertas e aviso na Atualizar pela planilha ---------- */
function metaBadge(){if(!metaTela())return '';const n=metaParaMim().length;return n?`<span class="badge hot">${n}</span>`:''}
function metaAlertas(a){if(!metaTela())return;const n=metaParaMim().length;
  if(n)a.push(['warn',n+' proposta(s) de meta aguardando sua decisão','Obra → Metas: aprove ou recuse, com motivo.']);
  if(MP.erro)a.push(['warn','Metas: não consegui ler as propostas',esc(MP.erro)])}
/* itens da planilha que voltariam a meta ou o teto aprovados pela tela */
function metaAvisoPlanilha(d){if(!metaTela()||!d||!d.dif)return '';const ap=metaAplicadas(S.t);
  const L=metaDaObra().filter(p=>p.alvo==='item'&&p.situacao==='aprovada'&&ap.has(String(p.id)));if(!L.length)return '';
  const cods=[...new Set(d.dif.filter(x=>L.some(p=>p.codigo===x.codigo)).map(x=>x.codigo))];if(!cods.length)return '';
  return `<div class="sub neg" style="margin-top:8px">Atenção: ${cods.length} item(ns) com meta aprovada pela tela mudam com esta planilha (${cods.slice(0,8).map(esc).join(', ')}${cods.length>8?'…':''}). Se a planilha está desatualizada, não aplique.</div>`}

ACOES['meta-propor']=el=>metaModal(el.dataset.alvo||'item',el.dataset.cod,false);
ACOES['meta-mudar']=el=>metaModal(el.dataset.alvo||'item',el.dataset.cod,true);
ACOES['meta-enviar']=()=>metaEnviar();
ACOES['meta-aprovar']=el=>metaDecideModal(el.dataset.id,true);
ACOES['meta-recusar']=el=>metaDecideModal(el.dataset.id,false);
ACOES['meta-decide-ok']=()=>metaDecideOk();
ACOES['meta-cancelar']=el=>metaCancelarModal(el.dataset.id);
ACOES['meta-cancela-ok']=()=>metaCancelaOk();
ACOES['meta-atualizar']=()=>{MP.quando=0;MP.erro='';metaSincroniza()};
