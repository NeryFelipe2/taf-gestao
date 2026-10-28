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
     aplica as aprovadas que ainda não estão no histórico, na ordem em que foram aprovadas; campo que uma aprovada mais nova já mudou não volta para o valor velho.
   - conferência antes de aplicar: na decisão o banco guarda o que a tela de quem decidiu mostrava (antes_decisao: meta, teto, fechar até). Só entra sozinha a
     aprovada cujo item (ou pacote) ainda está como na decisão. Se mudou depois (remanejamento, planilha ou um navegador com o estado velho que gravou por cima
     da meta já aplicada), ela NÃO entra sozinha: fica "precisa de conferência" na aba Metas e Gerente, Gestão ou Diretoria (chave pessoal) escolhem
     "Aplicar mesmo assim" ou "Não aplicar", com motivo. As duas escolhas ficam no histórico da linha de base (a de "não aplicar" sem versão nova).
   - prep() sem valor grudado (só com a chave ligada): quando o estado lido do banco perde a linha de base de um item ou pacote, o item volta ao valor da carga,
     em vez de continuar com o último valor que este navegador aplicou.
   RISCOS QUE FICAM (ver também o cabeçalho de 05_meta.sql):
   - o ERP não confere a versão do estado antes de gravar: um navegador com o estado velho grava por cima do que outro gravou. A meta que some assim volta a entrar
     (ou fica para conferência), mas o que o navegador velho apagou de outros (remanejamento, planilha) se perde. A janela sem a meta no banco dura até um
     navegador de Gestão, Diretoria ou Gerente com a obra aberta ler o banco (a cada 30 s) e esta tela conferir (a cada minuto), ou, se nenhum estiver aberto,
     até alguém desses papéis abrir a obra. A correção de fundo é conferir a versão antes de gravar (chSync e taf_erp_salvar), fora deste item.
   - a regra D4 vale para a proposta e a decisão. O estado da obra (onde a meta mora) o taf_erp_salvar grava também para a chave geral com papel Gestão,
     Diretoria ou Gerente escolhido na tela: com a chave geral dá para mudar baseOv/metaOv pela planilha, pelo Remanejar de Gerente e Diretoria ou chamando a
     função direto, e para gravar marcas hist[].prop falsas. Os botões de meta exigirem chave pessoal é proteção de tela. Só fecha com taf_erp_salvar recusando
     mudança de linha de base vinda de chave não pessoal (precisa do sim do Felipe).
   Sem banco (demonstração e testes do Node) as propostas ficam no próprio navegador, com as mesmas regras do banco. */
CHAVES_OBRA.push({k:'meta_tela',n:'Meta pela tela: proposta e aprovação (item 2)',d:'O engenheiro propõe meta e teto do item, ou meta, teto e “fechar até” do pacote, com motivo. Gerente, Gestão ou Diretoria aprovam ou recusam com a chave pessoal (com a chave geral do site ninguém aprova) e quem propôs não decide. A meta aprovada entra na linha de base como versão nova, com motivo, histórico e auditoria. Gestão e Diretoria com chave pessoal também mudam a meta direto, com motivo. Com a chave ligada a Gestão também remaneja saldo. Precisa do 05_meta.sql aplicado no banco (ainda é rascunho): antes disso, ligue só na obra 999 de teste.'});
const metaTela=t=>chaveLigada('meta_tela',t);
CAN.metaPropor=['engenheiro','gerente','gestao','diretoria'];
CAN.metaDecidir=['gerente','gestao','diretoria'];
CAN.metaDireta=['gestao','diretoria'];
/* Remanejar: com a chave ligada a Gestão também remaneja, com a chave pessoal (com a chave geral do site o papel é escolhido na tela).
   Desligada continua Gerente e Diretoria (01_papeis.js), igual ao ERP de partida. */
{const base=CAN.remanejar.slice();Object.defineProperty(CAN,'remanejar',{configurable:true,enumerable:true,get:()=>metaTela()&&metaPessoal()?[...base,'gestao']:base})}
/* prep() sem valor grudado. prep() (05_motor_de_regras.js) põe a linha de base (estado.baseOv / basePac) por cima dos dados da carga, mas quando o estado
   lido do banco não tem mais a linha de base de um item, o item continua com o último valor aplicado neste navegador. Aqui: na primeira passada guarda o valor
   da carga de cada item e pacote (_b0, como o _mu0 do próprio prep) e, com a chave ligada, devolve esse valor antes do prep quando a linha de base sumiu.
   Desligada, só guarda: o ERP é o de sempre. */
{const prep0=prep;
  prep=function(){const D=S.D,liga=!!(S.t&&metaTela());
    if(D&&Array.isArray(D.eap)){
      D.eap.forEach(i=>{if(!i||i.tipo_linha!=='item')return;
        if(!('_b0' in i))i._b0={meta_base:i.meta_base??i.meta_total,teto_total:i.teto_total,status_cotacao:i.status_cotacao};
        if(liga&&!(S.t.baseOv&&S.t.baseOv[i.codigo])&&i._b0){i.meta_base=i._b0.meta_base;i.teto_total=i._b0.teto_total;i.status_cotacao=i._b0.status_cotacao}});
      (D.pacotes||[]).forEach(p=>{if(!p)return;if(!('_b0' in p))p._b0={meta:p.meta,teto:p.teto,fechar_ate:p.fechar_ate};if(liga&&p._b0)Object.assign(p,p._b0)})}
    return prep0.apply(this,arguments)}}

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
  decidir:(id,ap,m,antes)=>chRpc('taf_erp_meta_decidir',chArgs({p_papel:S.role,p_id:id,p_aprovar:!!ap,p_motivo:m||null,p_antes:antes||null})),
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
/* o que a tela de quem decide mostrava (mesma limpeza do _taf_erp_meta_tela do banco: só número com 2 casas e data) */
const metaTelaLimpa=a=>{const o={},x=a||{};['meta','teto'].forEach(c=>{const v=x[c];if(typeof v==='number'&&Number.isFinite(v)&&v>=0)o[c]=r2(v)});
  if(/^\d{4}-\d{2}-\d{2}$/.test(String(x.fechar_ate||'')))o.fechar_ate=x.fechar_ate;return o};
const MPL={
  listar:async()=>mplLer().sort((a,b)=>b.id-a.id),
  propor:async o=>{const L=mplLer();if(!CAN.metaPropor.includes(S.role)&&S.role!=='admin')mplErr('PAPEL '+S.role.toUpperCase()+' NAO PROPOE META');mplValida(L,o);const p=mplNovo(L,o);L.push(p);mplGrava(L);return p},
  direta:async o=>{const L=mplLer();if(!CAN.metaDireta.includes(S.role)&&S.role!=='admin')mplErr('SO GESTAO E DIRETORIA MUDAM META DIRETO');mplValida(L,o);
    const p=mplNovo(L,o,{origem:'direta',situacao:'aprovada',decidido_por:user(),decidido_papel:S.role,decidido_em:new Date().toISOString(),ordem:mplOrdem(L),antes_decisao:metaTelaLimpa(o.antes)});L.push(p);mplGrava(L);return p},
  decidir:async(id,ap,m,antes)=>{const L=mplLer(),p=L.find(x=>+x.id===+id);if(!CAN.metaDecidir.includes(S.role)&&S.role!=='admin')mplErr('PAPEL '+S.role.toUpperCase()+' NAO DECIDE META');
    if(!p)mplErr('PROPOSTA NAO EXISTE');if(p.situacao!=='pendente')mplErr('PROPOSTA JA DECIDIDA');if(nomeNorm(p.proposto_por)===nomeNorm(user()))mplErr('QUEM PROPOS NAO DECIDE');
    if(!ap&&String(m||'').trim().length<3)mplErr('RECUSAR PEDE MOTIVO');
    Object.assign(p,{situacao:ap?'aprovada':'recusada',decidido_por:user(),decidido_papel:S.role,decidido_em:new Date().toISOString(),decisao_motivo:String(m||'').trim().slice(0,500)||null,ordem:ap?mplOrdem(L):null,antes_decisao:metaTelaLimpa(antes)});mplGrava(L);return p},
  cancelar:async(id,m)=>{const L=mplLer(),p=L.find(x=>+x.id===+id);if(!p)mplErr('PROPOSTA NAO EXISTE');if(p.situacao!=='pendente')mplErr('PROPOSTA JA DECIDIDA');
    if(nomeNorm(p.proposto_por)!==nomeNorm(user()))mplErr('SO QUEM PROPOS CANCELA');
    Object.assign(p,{situacao:'cancelada',decidido_por:user(),decidido_papel:S.role,decidido_em:new Date().toISOString(),decisao_motivo:String(m||'').trim().slice(0,500)||null});mplGrava(L);return p}};
const metaBack=()=>MODO_CH?MPR:!MODO_SB?MPL:null;   /* o login antigo do TAF Admin (Supabase com e-mail) não tem as funções de meta */

/* ---------- o que está aplicado e o que falta aplicar ---------- */
/* marcas no histórico da linha de base: hist[].prop = número da proposta. Sem "fora": entrou. Com fora:true: não entrou, por decisão na conferência. */
const metaMarcas=t=>{const M=new Map();((((t||S.t)||{}).hist)||[]).forEach(h=>{if(h&&h.prop!=null)M.set(String(h.prop),h)});return M};
const metaAplicadas=t=>new Set([...metaMarcas(t)].filter(([,h])=>!h.fora).map(([k])=>k));
const META_CAMPOS={item:['meta','teto'],pacote:['meta','teto','fechar_ate']};
const metaTem=(p,c)=>p[c]!=null&&p[c]!=='';
const metaCampos=p=>(META_CAMPOS[p.alvo]||[]).filter(c=>metaTem(p,c));
/* aprovadas que ainda não têm marca no histórico, na ordem da decisão. Para cada campo, se uma aprovada MAIS NOVA do mesmo item já entrou, o campo fica de fora
   (não volta para o valor velho). Devolve [{p, campos}]; campos vazio = superada por outra mais nova. */
function metaParaAplicar(lista,t){
  const M=metaMarcas(t),entrou=q=>{const h=M.get(String(q.id));return !!h&&!h.fora},G={};
  const A=(lista||[]).filter(p=>p&&p.situacao==='aprovada'&&p.ordem!=null).sort((a,b)=>+a.ordem-+b.ordem);
  A.forEach(p=>{const k=p.alvo+'|'+p.codigo;(G[k]=G[k]||[]).push(p)});
  return A.filter(p=>!M.has(String(p.id))).map(p=>({p,campos:metaCampos(p).filter(c=>!G[p.alvo+'|'+p.codigo].some(q=>+q.ordem>+p.ordem&&entrou(q)&&metaTem(q,c)))}))}
/* conferência: o item (ou pacote) ainda está como a tela de quem decidiu mostrava? */
const metaVal=(alvo,cod)=>{const h=metaHoje(alvo,cod);if(!h)return null;
  return {meta:h.meta==null?null:+h.meta,teto:h.teto==null?null:+h.teto,fechar_ate:alvo==='pacote'&&h.fechar_ate?String(h.fechar_ate).slice(0,10):null}};
const metaIgual=(c,a,b)=>{const va=a==null||a==='',vb=b==null||b==='';if(va||vb)return va&&vb;
  return c==='fechar_ate'?String(a).slice(0,10)===String(b).slice(0,10):Math.abs(+a-+b)<0.006};
/* o que valia na decisão (antes_decisao); proposta sem isso (rascunho antigo): o que valia na proposta */
const metaBase=p=>{const b=p&&p.antes_decisao;return b&&typeof b==='object'&&Object.keys(b).length?b:((p&&p.antes)||{})};
/* plano: as que faltam, na ordem, com o conflito de cada uma ([{campo, base, hoje}] ou null). O "hoje" de cada item anda junto com o plano:
   uma aprovada do mesmo item que entraria antes, sem conflito, já conta para a seguinte. */
function metaPlano(lista,t){
  const val={};
  return metaParaAplicar(lista,t).map(x=>{const k=x.p.alvo+'|'+x.p.codigo;
    if(!(k in val))val[k]=metaVal(x.p.alvo,x.p.codigo);
    const v=val[k];if(!v||!x.campos.length)return {...x,conflito:null};
    const b=metaBase(x.p),dif=x.campos.filter(c=>!metaIgual(c,b[c],v[c])).map(c=>({campo:c,base:b[c]??null,hoje:v[c]}));
    if(dif.length)return {...x,conflito:dif};
    x.campos.forEach(c=>{v[c]=c==='fechar_ate'?String(x.p[c]).slice(0,10):r2(+x.p[c])});
    return {...x,conflito:null}})}
const metaPlanoTela=()=>memo('metaPlano',()=>metaPlano(metaDaObra(),S.t));   /* uma conta por desenho da tela */
const metaConflitos=()=>metaPlanoTela().filter(x=>x.conflito&&x.campos.length&&!MP.falhas[x.p.id]);
const META_CNOME={meta:'meta',teto:'teto',fechar_ate:'fechar até'};
const metaConfTxt=L=>(L||[]).map(d=>META_CNOME[d.campo]+' na aprovação '+(d.base==null?'vazio':d.campo==='fechar_ate'?fdata(String(d.base).slice(0,10)):brl(+d.base))+', hoje '+(d.hoje==null?'vazio':d.campo==='fechar_ate'?fdata(d.hoje):brl(d.hoje))).join('; ');
const metaAlvoTxt=p=>(p.alvo==='pacote'?'pacote ':'item ')+p.codigo;
const metaDeQuem=p=>p.origem==='direta'?'mudança direta de '+p.decidido_por:'proposta de '+p.proposto_por+', aprovada por '+p.decidido_por;
/* aplica UMA aprovada no estado (mesmo caminho do Atualizar pela planilha). Precisa do prep() em dia. Não grava: quem chama faz prep() e save().
   conf = {motivo, conflito} quando entra "mesmo assim", depois da conferência. */
function metaAplicaUma(p,campos,conf){
  const motivo='Meta '+metaAlvoTxt(p)+' (nº '+p.id+', '+metaDeQuem(p)+'): '+p.motivo+(conf?' · aplicada mesmo assim na conferência de '+user()+' ('+metaConfTxt(conf.conflito)+'): '+conf.motivo:'');
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
  log('obra',S.D.obra.codigo,'linha_base','v'+(v-(S.t.frozen?1:0)),'v'+v+' · meta '+metaAlvoTxt(p)+' · nº '+p.id+(conf?' · aplicada mesmo assim na conferência':''),conf?conf.motivo:p.motivo);
  return {ok:true,versao:v}}
/* "não aplicar", depois da conferência: marca no histórico (sem versão nova) e auditoria. A meta aprovada não entra. */
function metaForaUma(p,motivo,conflito){
  S.t.hist.push({versao:S.t.versao||1,fora:true,prop:p.id,quando:new Date().toISOString(),quem:user(),
    motivo:'Meta '+metaAlvoTxt(p)+' (nº '+p.id+', '+metaDeQuem(p)+') não entrou na linha de base: '+(p.alvo==='pacote'?'o pacote':'o item')+' mudou depois da aprovação'+(conflito?' ('+metaConfTxt(conflito)+')':'')+'. Conferência de '+user()+': '+motivo});
  log('obra',S.D.obra.codigo,'meta_conferencia','nº '+p.id+' aprovada','não aplicada'+(conflito?' · '+metaConfTxt(conflito):''),motivo);
  return {ok:true}}
/* aplica as aprovadas que faltam e estão como na decisão. Só quem grava o estado; antes relê o estado do banco (outro navegador pode ter aplicado).
   conf = {nº: {acao:'aplicar'|'fora', motivo}}: o que a pessoa escolheu na conferência. Devolve quantas resolveu (entraram ou ficaram de fora). */
async function metaAplicarAprovadas(conf){
  if(!metaTela()||MP.aplicando||!metaGravaEstado()||!S.D)return 0;
  const ob=metaObra(),C={...(conf||{})},
    fila=()=>metaPlano(metaDaObra(),S.t).filter(x=>!MP.falhas[x.p.id]&&(C[x.p.id]?true:x.campos.length&&!x.conflito));
  prep();if(!fila().length)return 0;
  if(MODO_SB&&(SB.busy||SB.timer))return 0;   /* gravação em andamento: tenta de novo na próxima passada */
  MP.aplicando=true;
  try{if(MODO_SB){await sbPull();if(metaObra()!==ob)return 0}
    prep();let n=0,f=0;
    for(let volta=0;volta<2000;volta++){const x=fila()[0];if(!x)break;const c=C[x.p.id];delete C[x.p.id];
      if(!x.campos.length)continue;   /* superada por outra mais nova: nada a aplicar */
      if(c&&c.acao==='fora'){metaForaUma(x.p,c.motivo,x.conflito);f++}
      else if(!x.conflito||c){const r=metaAplicaUma(x.p,x.campos,x.conflito?{motivo:c.motivo,conflito:x.conflito}:null);if(r.ok)n++;else MP.falhas[x.p.id]=r.motivo}
      prep()}
    if(n||f){save();toast(f&&!n?'Meta aprovada fica de fora da linha de base: registrado no histórico':n===1?'Meta aprovada entrou na linha de base v'+S.t.versao:n+' metas aprovadas entraram na linha de base (v'+S.t.versao+')')}
    return n+f}
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
/* conferência de aprovada que não entrou porque o item mudou depois da decisão: as mesmas regras de decidir (chave pessoal, quem propôs não decide)
   e quem confere tem de gravar o estado (aplica no navegador dele) */
function metaPodeConferir(p){if(!metaTela()||!p||p.situacao!=='aprovada')return [false,''];if(metaLeitura())return [false,'Chave só de leitura.'];
  if(!can('metaDecidir'))return [false,'Só Gerente, Gestão ou Diretoria conferem meta.'];
  if(!metaPessoal())return [false,'Conferir exige a chave pessoal: com a chave geral do site ninguém decide meta.'];
  if(!metaGravaEstado())return [false,'Este acesso não grava a linha de base.'];
  if(p.origem!=='direta'&&metaEhMeu(p))return [false,'Quem propôs não decide a própria proposta.'];return [true,'']}
const metaPendenteDe=(alvo,cod)=>metaDaObra().find(p=>p.alvo===alvo&&p.codigo===cod&&p.situacao==='pendente');
const metaDecidirMinhas=()=>metaDaObra().filter(p=>p.situacao==='pendente'&&metaPodeDecidir(p)[0]);
const metaConferirMinhas=()=>metaConflitos().filter(x=>metaPodeConferir(x.p)[0]).map(x=>x.p);
const metaParaMim=()=>[...metaConferirMinhas(),...metaDecidirMinhas()];

/* situação de uma proposta, em texto de obra */
function metaSituacao(p){
  if(p.situacao==='pendente')return ['warn','aguardando decisão'];
  if(p.situacao==='recusada')return ['bad','recusada'];
  if(p.situacao==='cancelada')return ['mute','cancelada'];
  const h=metaMarcas(S.t).get(String(p.id));
  if(h)return h.fora?['mute','aprovada · não entrou (conferência de '+(h.quem||'?')+')']:['ok','na linha de base v'+h.versao];
  if(MP.falhas[p.id])return ['bad','aprovada · não entrou: '+MP.falhas[p.id]];
  const f=metaPlanoTela().find(x=>String(x.p.id)===String(p.id));
  if(f&&!f.campos.length)return ['mute','aprovada · superada por outra mais nova'];
  if(f&&f.conflito)return ['bad','aprovada · precisa de conferência'];
  return ['info','aprovada · entra na linha de base quando Gestão, Diretoria ou Gerente abrir a obra']}

/* valores de hoje do item ou do pacote (o que a tela mostra) */
function metaHoje(alvo,cod){
  if(alvo==='item'){const i=S.byCod[cod];if(!i||i.tipo_linha!=='item')return null;
    return {nome:i.descricao||'',venda:+i.preco_venda_total||0,meta:i.meta_total,teto:i.teto_total,real:S.sd&&S.sd[cod]?S.sd[cod].comp+S.sd[cod].real:0}}
  const p=S.D.pacotes.find(x=>x.codigo===cod);if(!p)return null;const its=p._it||[];
  return {nome:p.nome||'',venda:its.reduce((s,i)=>s+(+i.preco_venda_total||0),0),meta:p.meta,teto:p.teto,fechar_ate:p.fechar_ate,somaMeta:its.reduce((s,i)=>s+(+i.meta_total||0),0),
    somaTeto:its.reduce((s,i)=>s+(+i.teto_total||0),0),n:its.length,soma:typeof pacSoma==='function'&&pacSoma(p)}}
const metaMargem=(venda,meta)=>venda>0&&meta!=null?(venda-meta)/venda:null;
const metaR2=v=>v==null||v===''||!Number.isFinite(+v)?null:r2(+v);
/* o que a tela mostra hoje, só os campos da meta, com 2 casas (vai para o banco como antes_decisao) */
const metaHojeCampos=h=>({meta:metaR2(h&&h.meta),teto:metaR2(h&&h.teto),fechar_ate:h&&h.fechar_ate?String(h.fechar_ate).slice(0,10):null});
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
  const o={alvo:x.alvo,codigo:x.cod,meta:m==null?null:r2(m),teto:t==null?null:r2(t),fechar_ate:f,motivo:mo,antes:{meta:metaR2(h.meta),teto:metaR2(h.teto),venda:metaR2(h.venda),...(x.alvo==='pacote'?{fechar_ate:h.fechar_ate||null}:{})}};
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
  const pd=metaPodeDecidir(p);if(!pd[0])return toast(pd[1]||'Sem permissão');const h=metaHoje(p.alvo,p.codigo)||{};
  /* antes: o que esta janela mostra como "Hoje". Vai para o banco com a decisão: a meta só entra sozinha se o item ainda estiver assim */
  MDX={id:p.id,ap:!!ap,antes:metaHojeCampos(h)};
  modal(`<h3>${ap?'Aprovar':'Recusar'} a proposta nº ${esc(p.id)}</h3><div class="sub">${esc(metaAlvoTxt(p))} · ${esc(h.nome||'')}</div>
   ${metaTabela(p,h,metaColunas(p,h,null))}
   <div class="sub" style="margin-top:8px">Motivo de ${esc(p.proposto_por)}: ${esc(p.motivo)}</div>
   <label for="md-m">${ap?'Observação (opcional)':'Motivo da recusa (obrigatório)'}</label><textarea id="md-m" rows="2" maxlength="500"></textarea><div id="md-msg" class="sub"></div>
   ${ap?`<div class="sub" style="margin-top:8px">Ao aprovar, a meta entra na linha de base${S.t.frozen?' como versão v'+((S.t.versao||1)+1):''}, com histórico e auditoria.</div>`:''}
   <div class="acts"><button class="btn" data-act="fechar">Voltar</button><button class="btn ${ap?'ok':'no'}" data-act="meta-decide-ok">${ap?'Aprovar':'Recusar'}</button></div>`)}
async function metaDecideOk(){const x=MDX,B=metaBack();if(!x||!B)return;const m=String(($('#md-m')||{}).value||'').trim();
  if(!x.ap&&m.length<3){const e=$('#md-msg');if(e)e.innerHTML='<span class="neg">Escreva o motivo da recusa.</span>';return toast('Escreva o motivo da recusa')}
  if(MP.enviando)return;MP.enviando=true;
  try{const p=await B.decidir(x.id,x.ap,m,x.antes);metaGuarda(p);closeModal();MDX=null;
    if(x.ap){const n=await metaAplicarAprovadas(),st=metaSituacao(p);
      toast(n&&metaAplicadas(S.t).has(String(p.id))?'Aprovada · meta na linha de base v'+S.t.versao:/conferência/.test(st[1])?'Aprovada. O item mudou enquanto você decidia: confira em Obra → Metas':metaGravaEstado()?'Aprovada':'Aprovada: entra na linha de base quando Gestão, Diretoria ou Gerente abrir a obra')}
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

/* ---------- conferência: aprovada que não entrou porque o item mudou depois da decisão ---------- */
let MCX=null;
const metaConflitoDe=id=>metaPlanoTela().find(x=>String(x.p.id)===String(id)&&x.conflito&&x.campos.length&&!MP.falhas[x.p.id]);
function metaConfModal(id,aplicar){const x=metaConflitoDe(id);if(!x)return toast('Esta meta não precisa mais de conferência. A lista foi atualizada.');
  const p=x.p,pd=metaPodeConferir(p);if(!pd[0])return toast(pd[1]||'Sem permissão');const h=metaHoje(p.alvo,p.codigo)||{};MCX={id:p.id,aplicar:!!aplicar};
  const rem=p.alvo==='item'&&x.campos.includes('meta')&&S.t.metaOv&&S.t.metaOv[p.codigo]!=null;
  modal(`<h3>${aplicar?'Aplicar mesmo assim':'Não aplicar'} a meta nº ${esc(p.id)}</h3><div class="sub">${esc(metaAlvoTxt(p))} · ${esc(h.nome||'')}</div>
   <div class="alert" style="margin-top:10px"><div class="g" style="color:var(--warn)">!</div><div><b>${p.alvo==='pacote'?'O pacote':'O item'} mudou depois da aprovação</b><p>${esc(metaConfTxt(x.conflito))}. Pode ter sido um remanejamento, uma planilha ou um navegador com dados velhos que gravou por cima. Confira antes de decidir.</p></div></div>
   ${metaTabela(p,h,metaColunas(p,h,x))}
   ${rem&&aplicar?`<div class="sub neg" style="margin-top:8px">Este item tem remanejamento: a meta de hoje (${brl(S.t.metaOv[p.codigo])}) veio de um remanejamento. Aplicar a meta aprovada desfaz o remanejamento deste item; o outro item do remanejamento fica como está e o total da obra muda.</div>`:''}
   <div class="sub" style="margin-top:8px">${aplicar?'A meta aprovada entra agora'+(S.t.frozen?' como versão v'+((S.t.versao||1)+1):'')+', por cima do valor de hoje, com histórico e auditoria.':'A meta aprovada não entra. Fica registrado no histórico da linha de base, sem versão nova. Para mudar a meta depois, faça uma proposta nova.'}</div>
   <label for="mc-m">Motivo (obrigatório)</label><textarea id="mc-m" rows="2" maxlength="500"></textarea><div id="mc-msg" class="sub"></div>
   <div class="acts"><button class="btn" data-act="fechar">Voltar</button><button class="btn ${aplicar?'ok':'no'}" data-act="meta-conf-ok">${aplicar?'Aplicar mesmo assim':'Não aplicar'}</button></div>`)}
async function metaConfOk(){const x=MCX;if(!x)return;const m=String(($('#mc-m')||{}).value||'').trim();
  const msg=t=>{const e=$('#mc-msg');if(e)e.innerHTML=`<span class="neg">${esc(t)}</span>`;toast(t)};
  if(m.length<3)return msg('Escreva o motivo.');
  const p=metaDaObra().find(y=>String(y.id)===String(x.id)),pd=metaPodeConferir(p);if(!pd[0])return msg(pd[1]||'Sem permissão');
  if(MP.enviando)return;MP.enviando=true;
  try{await metaAplicarAprovadas({[x.id]:{acao:x.aplicar?'aplicar':'fora',motivo:m.slice(0,500)}});
    const h=metaMarcas(S.t).get(String(x.id));
    if(!h){msg('Não deu para registrar agora (gravação em andamento ou a lista mudou). Tente de novo em alguns segundos.');MP.quando=0;return}
    closeModal();MCX=null;toast(h.fora?'Meta nº '+x.id+' não aplicada: fica no histórico':'Meta nº '+x.id+' aplicada · linha de base v'+h.versao);render()}
  catch(e){msg(metaMsg(e))}
  finally{MP.enviando=false}}

/* colunas da tabela do cartão: esperando decisão = hoje; precisa de conferência = na aprovação e hoje; decidida = antes (o que valia na decisão) */
const metaColHoje=h=>({t:'Hoje',v:metaHojeCampos(h)});
function metaColunas(p,h,x){if(p.situacao==='pendente')return [metaColHoje(h)];
  if(x&&x.conflito)return [{t:'Na aprovação',v:metaBase(p)},metaColHoje(h)];
  return [{t:'Antes',v:metaBase(p)}]}
/* tabela: colunas da esquerda e, por último, o proposto (ou aprovado); licitado, folga até o teto e margem */
function metaTabela(p,h,cols){
  cols=cols&&cols.length?cols:[metaColHoje(h)];
  const ult=cols[cols.length-1].v||{},novo=c=>metaTem(p,c)?(c==='fechar_ate'?String(p[c]).slice(0,10):+p[c]):null;
  const val=(v,c)=>{const x=(v||{})[c];return x==null||x===''?null:c==='fechar_ate'?String(x).slice(0,10):+x};
  const metaN=novo('meta')!=null?novo('meta'):val(ult,'meta'),tetoN=novo('teto')!=null?novo('teto'):val(ult,'teto');
  const folga=(m,t)=>m==null||t==null?null:t-m,venda=h.venda,neg=x=>x!=null&&x<0?'neg':'';
  const linha=(rot,c,f)=>`<tr><td>${rot}</td>${cols.map(k=>`<td class="r">${val(k.v,c)==null?'—':esc(f(val(k.v,c)))}</td>`).join('')}<td class="r">${novo(c)==null?'<span class="mut">mantém</span>':'<b>'+esc(f(novo(c)))+'</b>'}</td></tr>`;
  const fol=(m,t)=>{const f=folga(m,t);return `<td class="r ${neg(f)}">${f==null?'—':brl(f)}</td>`};
  const mg=m=>{const x=metaMargem(venda,m);return `<td class="r ${neg(x)}">${metaPct(x)}</td>`};
  /* grw: tabela curta do cartão, sem a barra de filtros que 42_filtros.js põe nas listas */
  return `<div class="tw grw"><table class="tbl"><thead><tr><th></th>${cols.map(k=>`<th class="r">${esc(k.t)}</th>`).join('')}<th class="r">${p.situacao==='aprovada'?'Aprovado':'Proposto'}</th></tr></thead><tbody>
   ${linha('Meta','meta',v=>brl(v))}${linha('Teto','teto',v=>brl(v))}
   ${p.alvo==='pacote'?linha('Fechar até','fechar_ate',fdata):''}
   <tr><td>Licitado</td>${cols.map(()=>`<td class="r mut">${brl(venda)}</td>`).join('')}<td class="r mut">${brl(venda)}</td></tr>
   <tr><td>Folga até o teto</td>${cols.map(k=>fol(val(k.v,'meta'),val(k.v,'teto'))).join('')}${fol(metaN,tetoN)}</tr>
   ${p.alvo==='pacote'?`<tr><td>Margem dos itens (hoje)</td><td class="r">${metaPct(metaMargem(venda,h.somaMeta))}</td>${cols.slice(1).map(()=>'<td class="r mut">igual</td>').join('')}<td class="r mut">igual</td></tr>`
     :`<tr><td>Margem (licitado menos meta)</td>${cols.map(k=>mg(val(k.v,'meta'))).join('')}${mg(metaN)}</tr>`}
   </tbody></table></div>`}

/* ---------- tela Obra → Metas ---------- */
const metaQuemTxt=p=>`${esc(p.proposto_por)} · ${esc((ROLES[p.proposto_papel]||{}).n||p.proposto_papel)}${p.proposto_pessoal?'':' · chave do site (nome digitado)'}`;
const metaQuando=s=>s?esc(fdata(String(s).slice(0,10))+' '+String(s).slice(11,16)):'';
function metaCartao(p){const h=metaHoje(p.alvo,p.codigo)||{},st=metaSituacao(p),pd=metaPodeDecidir(p),x=p.situacao==='aprovada'?metaConflitoDe(p.id):null,pc=x?metaPodeConferir(p):[false,''];
  const dec=p.situacao!=='pendente'&&p.decidido_por?`<div class="sub">${p.situacao==='cancelada'?'Cancelada':p.origem==='direta'?'Mudada direto':p.situacao==='aprovada'?'Aprovada':'Recusada'} por ${esc(p.decidido_por)} (${esc((ROLES[p.decidido_papel]||{}).n||p.decidido_papel||'')}) em ${metaQuando(p.decidido_em)}${p.decisao_motivo?': '+esc(p.decisao_motivo):''}</div>`:'';
  const acoes=x?(pc[0]?`<button class="btn sm no" data-act="meta-conf-fora" data-id="${esc(p.id)}">Não aplicar</button><button class="btn sm ok" data-act="meta-conf-aplicar" data-id="${esc(p.id)}">Aplicar mesmo assim</button>`
      :can('metaDecidir')?`<span class="sub">${esc(pc[1])}</span>`:'')
    :p.situacao!=='pendente'?'':pd[0]?`<button class="btn sm no" data-act="meta-recusar" data-id="${esc(p.id)}">Recusar</button><button class="btn sm ok" data-act="meta-aprovar" data-id="${esc(p.id)}">Aprovar</button>`
    :metaEhMeu(p)?`<button class="btn sm no" data-act="meta-cancelar" data-id="${esc(p.id)}">Cancelar a minha proposta</button>`
    :can('metaDecidir')?`<span class="sub">${esc(pd[1])}</span>`:'';
  const conf=x?`<div class="sub neg" style="margin-top:6px">Não entrou sozinha: ${esc(metaConfTxt(x.conflito))}.${can('metaDecidir')?' Confira e escolha.':' Gerente, Gestão ou Diretoria conferem.'}</div>`:'';
  return `<div class="card"><div class="in">
   <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:flex-start"><div><b>${p.alvo==='pacote'?'Pacote':'Item'} <span class="mono">${esc(p.codigo)}</span></b><div class="mut" style="font-size:12px">${esc(String(h.nome||'').slice(0,80))}</div></div><span class="pill ${st[0]}" style="white-space:normal;max-width:100%">${esc(st[1])}</span></div>
   ${metaTabela(p,h,metaColunas(p,h,x))}${conf}
   <div class="sub" style="margin-top:6px">Motivo: ${esc(p.motivo)}</div>
   <div class="sub">${p.origem==='direta'?'Mudança direta':'Proposta'} nº ${esc(p.id)} · ${metaQuemTxt(p)} · ${metaQuando(p.proposto_em)}</div>${dec}
   ${acoes?`<div class="acts" style="margin-top:10px">${acoes}</div>`:''}</div></div>`}
function viewMetas(){
  const L=metaDaObra(),aprova=can('metaDecidir'),meus=L.filter(metaEhMeu),conf=metaConflitos(),pend=L.filter(p=>p.situacao==='pendente'),pm=metaParaMim();
  const tab=S.tab.metas||(aprova?'aprovar':'minhas');
  const lista=tab==='aprovar'?[...conf.map(x=>x.p),...pend]:tab==='minhas'?meus:L;
  const pp=metaPodePropor(),faltam=metaPlanoTela().filter(x=>x.campos.length&&!x.conflito&&!MP.falhas[x.p.id]).length;
  const avisoChave=aprova&&!metaPessoal()?`<div class="alert" style="margin:10px 0"><div class="g" style="color:var(--warn)">!</div><div><b>Você entrou com a chave geral do site</b><p>Pode propor e acompanhar. Aprovar, recusar, conferir e mudar meta direto exigem a chave pessoal (regra D4).</p></div></div>`:'';
  const avisoErro=MP.erro?`<div class="alert" style="margin:10px 0"><div class="g" style="color:var(--bad)">!</div><div><b>Não consegui ler as propostas</b><p>${esc(MP.erro)}</p><button class="btn sm" data-act="meta-atualizar">Tentar de novo</button></div></div>`:'';
  const avisoFalta=faltam?`<div class="alert" style="margin:10px 0"><div class="g" style="color:var(--info)">i</div><div><b>${faltam} meta(s) aprovada(s) ainda fora da linha de base</b><p>${metaGravaEstado()?'Entram agora, quando a lista for lida.':'Entram quando Gestão, Diretoria ou Gerente abrir esta obra.'}</p></div></div>`:'';
  const avisoConf=conf.length?`<div class="alert" style="margin:10px 0"><div class="g" style="color:var(--bad)">!</div><div><b>${conf.length} meta(s) aprovada(s) precisam de conferência</b><p>O item mudou depois da aprovação, então a meta não entrou sozinha. ${aprova?'Veja em “Para aprovar”: aplique mesmo assim ou não aplique, com motivo.':'Gerente, Gestão ou Diretoria conferem.'}</p></div></div>`:'';
  const vazio=tab==='aprovar'?empty('Nada esperando decisão.','As propostas de meta do engenheiro aparecem aqui.'):tab==='minhas'?empty('Você ainda não propôs meta.','Abra um item em Orçamento, ou um pacote em Pacotes, e clique em “Propor meta”.'):empty('Nenhuma proposta nesta obra.','');
  return `<div class="head"><div><h1>Metas</h1><p class="lead">O engenheiro propõe a meta e o teto do item, ou do pacote, com motivo. Gerente, Gestão ou Diretoria aprovam com a chave pessoal. A meta aprovada entra na linha de base como versão nova, com histórico e auditoria.</p></div>
   <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="meta-atualizar">Atualizar</button><button class="btn" data-act="meta-propor" data-alvo="pacote" ${pp[0]?'':`disabled title="${esc(pp[1])}"`}>Propor meta de pacote</button><button class="btn dark" data-act="meta-propor" data-alvo="item" ${pp[0]?'':`disabled title="${esc(pp[1])}"`}>Propor meta de item</button></div></div>
   ${avisoErro}${avisoChave}${avisoConf}${avisoFalta}
   <div class="toolbar">${tabs('metas',[...(aprova?[['aprovar','Para aprovar',pm.length]]:[]),['minhas','Minhas propostas '+meus.length],['todas','Todas '+L.length]],tab)}<span class="sub">${MP.quando&&MP.obra===metaObra()?'Lida às '+new Date(MP.quando).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'Lendo…'}</span></div>
   ${lista.length?`<div class="ev-grid" style="margin-top:8px">${lista.map(metaCartao).join('')}</div>`:vazio}`}

/* ---------- contador no menu, alertas e aviso na Atualizar pela planilha ---------- */
function metaBadge(){if(!metaTela())return '';const n=metaParaMim().length;return n?`<span class="badge hot">${n}</span>`:''}
function metaAlertas(a){if(!metaTela())return;const n=metaDecidirMinhas().length,c=metaConferirMinhas().length;
  if(c)a.push(['bad',c+' meta(s) aprovada(s) precisam de conferência','O item mudou depois da aprovação. Obra → Metas: aplique mesmo assim ou não aplique, com motivo.']);
  if(n)a.push(['warn',n+' proposta(s) de meta aguardando sua decisão','Obra → Metas: aprove ou recuse, com motivo.']);
  if(MP.erro)a.push(['warn','Metas: não consegui ler as propostas',esc(MP.erro)])}
/* itens e pacotes da planilha que voltariam a meta, o teto ou o "fechar até" aprovados pela tela */
function metaAvisoPlanilha(d){if(!metaTela()||!d)return '';const ap=metaAplicadas(S.t);
  const L=metaDaObra().filter(p=>p.situacao==='aprovada'&&ap.has(String(p.id)));if(!L.length)return '';
  const tem=(alvo,c)=>L.some(p=>p.alvo===alvo&&p.codigo===c),lista=a=>a.slice(0,8).map(esc).join(', ')+(a.length>8?'…':'');
  const its=[...new Set((d.dif||[]).filter(x=>tem('item',x.codigo)).map(x=>x.codigo))],pcs=[...new Set((d.pacs||[]).filter(x=>tem('pacote',x.codigo)).map(x=>x.codigo))];
  if(!its.length&&!pcs.length)return '';
  const partes=[its.length?its.length+' item(ns) ('+lista(its)+')':'',pcs.length?pcs.length+' pacote(s) ('+lista(pcs)+')':''].filter(Boolean).join(' e ');
  return `<div class="sub neg" style="margin-top:8px">Atenção: esta planilha muda ${partes} com meta aprovada pela tela. Se a planilha está desatualizada, não aplique.</div>`}

ACOES['meta-propor']=el=>metaModal(el.dataset.alvo||'item',el.dataset.cod,false);
ACOES['meta-mudar']=el=>metaModal(el.dataset.alvo||'item',el.dataset.cod,true);
ACOES['meta-enviar']=()=>metaEnviar();
ACOES['meta-aprovar']=el=>metaDecideModal(el.dataset.id,true);
ACOES['meta-recusar']=el=>metaDecideModal(el.dataset.id,false);
ACOES['meta-decide-ok']=()=>metaDecideOk();
ACOES['meta-cancelar']=el=>metaCancelarModal(el.dataset.id);
ACOES['meta-cancela-ok']=()=>metaCancelaOk();
ACOES['meta-conf-aplicar']=el=>metaConfModal(el.dataset.id,true);
ACOES['meta-conf-fora']=el=>metaConfModal(el.dataset.id,false);
ACOES['meta-conf-ok']=()=>metaConfOk();
ACOES['meta-atualizar']=()=>{MP.quando=0;MP.erro='';metaSincroniza()};
