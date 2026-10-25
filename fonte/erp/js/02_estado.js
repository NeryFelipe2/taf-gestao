/* ============ estado ============ */
const KEY='taf_admin_v3';
const CFG=window.TAF_CONFIG||{};
const MODO_CH=CFG.modo==='chave'&&!!(CFG.supabaseUrl&&CFG.supabaseKey);   /* site taf-gestao: mesma chave do site, funções taf_erp_* (03b_chave.js) */
const MODO_SB=MODO_CH||!!(CFG.supabaseUrl&&CFG.supabaseKey)&&(CFG.modo==='supabase'||/[?&]sb=1/.test(location.search))&&!/[?&]demo=1/.test(location.search);
const SB={c:null,user:null,perfil:null,obraId:null,sync:{},estado:'',timer:null,busy:false,perfis:[]};
let S={view:'dash',tab:{},role:'engenheiro',D:null,t:null,exp:new Set(),q:''};
const novoT=()=>({titulos:[],frozen:false,versao:1,hist:[],metaOv:{},baseOv:{},basePac:{},sols:[],elos:[],ocs:[],notas:[],aud:[],meds:[],conc:[],apts:[],rsts:[],atvs:[],tars:[],bcs:[],fats:[],recs:[],lans:[],lfxs:[],ctbs:[],ests:[],invs:[],ctrs:[],prjs:[],pats:[],frts:[],fmvs:[],cols:[],ptos:[],ssts:[],movs:[],cobrs:[],fechs:[],forns:[],inss:[],bancos:[],seq:{sol:0,oc:0,nf:0,bm:0},par:{tol:0.02,limite:100000}});
/* [PROVISÓRIO] Parâmetros da chave par.ev_ctrl (M4, limite em três níveis). Vêm das decisões do Felipe de 25/10/2026 (DECISOES-DO-FELIPE.md) e valem só com a chave ligada na obra.
   Cada obra pode trocar um deles em estado.par.ev = {nome: valor}, sem mexer em código. Os valores de alçada em R$ (verde sem confirmação até R$ 100.000, Gerente até R$ 250.000) e a tolerância
   nota x pedido (2%) continuam em novoT().par e na janela de Parâmetros: seguem provisórios até a Diretoria definir (D2). Nenhum percentual de desvio existe (D3).
   Regras que NÃO são parâmetro porque valem sempre que a chave está ligada: item continua rígido (D6, vale a pior cor entre item, pacote e evento) e grupo com meta acima do limite fica vermelho (E3). */
const EV_PADRAO={
  somaDiaPacote:true,           /* [PROVISÓRIO] D2: pedidos verdes do mesmo pacote no mesmo dia somam para a alçada */
  reservaEmAlcada:true,         /* [PROVISÓRIO] pedido aguardando aprovação reserva saldo (corrige o achado A4) */
  reservaPorOrdem:true,         /* [PROVISÓRIO] na decisão, só reservam saldo os pedidos emitidos ANTES do que está sendo decidido (fila): o primeiro a ser aprovado não vira vermelho por causa do segundo */
  aprovaExigeChavePessoal:true, /* [PROVISÓRIO] D4: com a chave geral do site (nome digitado) ninguém aprova; vale a chave pessoal (ou o login do banco) */
  notaSemPedido:true            /* [PROVISÓRIO] D7: nota sem pedido passa pelo mesmo semáforo e alçada de uma OC */
};
/* Cadastros (fornecedores, insumos, bancos) valem para todas as obras: no modo aberto ficam numa chave própria do navegador. */
const GL_KEYS=['forns','inss','bancos'];
const save=()=>{if(MODO_SB){sbSyncSoon();return}try{const g={};GL_KEYS.forEach(k=>g[k]=S.t[k]);localStorage.setItem('taf_global',JSON.stringify(g));localStorage.setItem(chaveObra(),JSON.stringify({...S.t,role:S.role}))}catch(e){}};
function loadT(){let t=novoT();try{const j=JSON.parse(localStorage.getItem(chaveObra())||'null');if(j){S.role=j.role||S.role;delete j.role;t={...t,...j}}}catch(e){}
  try{const g=JSON.parse(localStorage.getItem('taf_global')||'null');if(g)GL_KEYS.forEach(k=>{if(Array.isArray(g[k])&&(g[k].length||!(t[k]||[]).length))t[k]=g[k]})}catch(e){}return t}
const log=(ent,ref,campo,antes,depois,motivo='')=>S.t.aud.unshift({id:'a'+Date.now()+Math.random().toString(36).slice(2,6),q:new Date().toISOString(),quem:user()+' ('+ROLES[S.role].n+')',ent,ref,campo,antes:String(antes??''),depois:String(depois??''),motivo});
function toast(m){document.querySelectorAll('.toast').forEach(x=>x.remove());const e=document.createElement('div');e.className='toast';e.textContent=m;document.body.appendChild(e);setTimeout(()=>e.remove(),2600)}


