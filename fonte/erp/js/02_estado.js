/* ============ estado ============ */
const KEY='taf_admin_v3';
const CFG=window.TAF_CONFIG||{};
const MODO_CH=CFG.modo==='chave'&&!!(CFG.supabaseUrl&&CFG.supabaseKey);   /* site taf-gestao: mesma chave do site, funções taf_erp_* (03b_chave.js) */
const MODO_SB=MODO_CH||!!(CFG.supabaseUrl&&CFG.supabaseKey)&&(CFG.modo==='supabase'||/[?&]sb=1/.test(location.search))&&!/[?&]demo=1/.test(location.search);
const SB={c:null,user:null,perfil:null,obraId:null,sync:{},estado:'',timer:null,busy:false,perfis:[]};
let S={view:'dash',tab:{},role:'engenheiro',D:null,t:null,exp:new Set(),q:''};
const novoT=()=>({titulos:[],frozen:false,versao:1,hist:[],metaOv:{},baseOv:{},basePac:{},sols:[],elos:[],ocs:[],notas:[],aud:[],meds:[],conc:[],apts:[],rsts:[],atvs:[],tars:[],bcs:[],fats:[],recs:[],lans:[],lfxs:[],ctbs:[],ests:[],invs:[],ctrs:[],prjs:[],pats:[],frts:[],fmvs:[],cols:[],ptos:[],ssts:[],movs:[],cobrs:[],fechs:[],forns:[],inss:[],bancos:[],seq:{sol:0,oc:0,nf:0,bm:0},par:{tol:0.02,limite:100000}});
/* Cadastros (fornecedores, insumos, bancos) valem para todas as obras: no modo aberto ficam numa chave própria do navegador. */
const GL_KEYS=['forns','inss','bancos'];
const save=()=>{if(MODO_SB){sbSyncSoon();return}try{const g={};GL_KEYS.forEach(k=>g[k]=S.t[k]);localStorage.setItem('taf_global',JSON.stringify(g));localStorage.setItem(chaveObra(),JSON.stringify({...S.t,role:S.role}))}catch(e){}};
function loadT(){let t=novoT();try{const j=JSON.parse(localStorage.getItem(chaveObra())||'null');if(j){S.role=j.role||S.role;delete j.role;t={...t,...j}}}catch(e){}
  try{const g=JSON.parse(localStorage.getItem('taf_global')||'null');if(g)GL_KEYS.forEach(k=>{if(Array.isArray(g[k])&&(g[k].length||!(t[k]||[]).length))t[k]=g[k]})}catch(e){}return t}
const log=(ent,ref,campo,antes,depois,motivo='')=>S.t.aud.unshift({id:'a'+Date.now()+Math.random().toString(36).slice(2,6),q:new Date().toISOString(),quem:user()+' ('+ROLES[S.role].n+')',ent,ref,campo,antes:String(antes??''),depois:String(depois??''),motivo});
function toast(m){document.querySelectorAll('.toast').forEach(x=>x.remove());const e=document.createElement('div');e.className='toast';e.textContent=m;document.body.appendChild(e);setTimeout(()=>e.remove(),2600)}


