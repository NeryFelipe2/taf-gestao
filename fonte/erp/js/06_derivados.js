/* ============ derivados ============ */
function derive(){
  const D=S.D,X={};saldos();
  const it=D.items;
  X.meta=it.reduce((s,i)=>s+i.meta_total,0);X.venda=it.reduce((s,i)=>s+i.preco_venda_total,0);X.teto=it.reduce((s,i)=>s+i.teto_total,0);
  X.comp=it.reduce((s,i)=>s+S.sd[i.codigo].comp,0);X.real=it.reduce((s,i)=>s+S.sd[i.codigo].real,0);
  X.aCotar=it.filter(i=>i.status_cotacao==='A cotar');X.semFolga=it.filter(i=>i.meta_total>i.teto_total);
  D.pacotes.forEach(p=>{p._dias=diasAte(p.fechar_ate);p._cot=p._it.filter(i=>i.status_cotacao==='A cotar').length;p._pctCot=p._it.length?1-p._cot/p._it.length:1;
    p._semFolga=p._it.filter(i=>i.meta_total>i.teto_total).length;p._acima=p.meta>p.teto;
    p._meta=p._it.reduce((s,i)=>s+i.meta_total,0);p._comp=p._it.reduce((s,i)=>s+S.sd[i.codigo].comp,0);p._real=p._it.reduce((s,i)=>s+S.sd[i.codigo].real,0);
    /* M2 [SUPOSIÇÃO, plano 00-MATRIZ-E-PLANO]: teto do pacote = soma dos tetos dos itens. Com par.ev_agrega ligada o alerta "meta acima do teto" usa essa soma; desligada vale o teto fixo do pacote, como sempre. */
    p._teto=p._it.reduce((s,i)=>s+(+i.teto_total||0),0);p._temTeto=p._it.some(i=>i.teto_total!=null);
    if(chaveLigada('ev_agrega'))p._acima=p._temTeto&&r2(p._meta)>r2(p._teto);
    p._temOC=S.t.ocs.some(o=>S.byCod[o.item]?.pacote===p.codigo&&o.status!=='cancelada'&&o.status!=='reprovada')});
  X.vencidos=D.pacotes.filter(p=>p._dias!=null&&p._dias<0&&p._it.length&&!p._temOC);
  X.pendAprov=S.t.ocs.filter(o=>o.status==='em_alcada');
  X.semRateio=S.t.notas.filter(n=>n.status==='lancada');
  X.semPedido=S.t.notas.filter(n=>!n.oc);
  X.economia=S.t.ocs.filter(o=>['aprovada','recebida_parcial','recebida'].includes(o.status)).reduce((s,o)=>{const i=S.byCod[o.item];return s+(i.meta_unit*o.qtd-o.valor)},0);
  if(chaveLigada('ev_agrega')){X.eventos=agregaEventos();X.pacGrupos=agregaPacotes()}
  return X;
}
/* meta, teto e alerta do pacote como a tela mostra: pela soma dos itens (chave ligada) ou pelo valor fixo do cadastro do pacote (desligada) */
const pacMeta=p=>chaveLigada('ev_agrega')?p._meta:p.meta;
const pacTeto=p=>chaveLigada('ev_agrega')?p._teto:p.teto;

/* ============ M2: o que já existe por item (meta, teto, comprometido, realizado, saldo) somado por evento e por pacote ============
   Só leitura: não grava nada. Usado pela tela Eventos (52_eventos.js). A soma dos itens de cada grupo é o grupo; item sem evento (ou sem pacote) fica
   em "Sem evento" ("Sem pacote"), nunca some. Na obra sem nenhum evento (a 343) o grupo da EAP faz o papel do evento [SUPOSIÇÃO: o plano manda usar grupo na 343;
   grupo = linha de nível 1 da EAP].
   Cor do grupo [SUPOSIÇÃO: D1 do plano, "limite" = o teto que o ERP já tem, mesma regra do item]: verde = comprometido + realizado dentro da meta;
   amarelo = acima da meta, até o limite; vermelho = acima do limite; "sem base" = nenhum item com meta (nunca vira verde). */
const evDe=i=>String(i.evento==null?'':i.evento).trim();
const pacDe=i=>String(i.pacote==null?'':i.pacote).trim();
function grupoRaiz(i){let g=i,n=0;while(g&&g.pai&&S.byCod[g.pai]&&n++<30)g=S.byCod[g.pai];return g&&g!==i&&g.tipo_linha==='grupo'?g.codigo:String(i.codigo).split('.')[0]}
function somaItens(its){
  const g={n:its.length,venda:0,meta:0,teto:0,temTeto:false,comp:0,real:0,livre:0,semMeta:0,itens:its.map(i=>i.codigo)};
  its.forEach(i=>{const s=S.sd[i.codigo]||{comp:0,real:0,livre:0};g.venda+=+i.preco_venda_total||0;g.meta+=+i.meta_total||0;if(i.teto_total!=null){g.teto+=+i.teto_total||0;g.temTeto=true}
    if(i.meta_total==null)g.semMeta++;g.comp+=s.comp;g.real+=s.real;g.livre+=s.livre});
  return g}
function semGrupo(g){
  if(!g.n||g.semMeta===g.n)return ['sem_base',g.n?'Nenhum item com meta de custo':'Nenhum item no orçamento'];
  const gasto=r2(g.comp+g.real);
  if(g.temTeto&&gasto>r2(g.teto))return ['vermelho','Comprometido + realizado acima do limite (teto)'];
  if(gasto>r2(g.meta))return ['amarelo','Acima da meta, até o limite'];
  return ['verde','Dentro da meta']}
/* agrupa os itens por chaveDe(item); outraDe = a outra dimensão, para mostrar por onde o grupo cruza (pacotes de um evento, eventos de um pacote) */
function agregaGrupos(chaveDe,outraDe,extras){
  const M=new Map();S.D.items.forEach(i=>{const k=chaveDe(i);if(!M.has(k))M.set(k,[]);M.get(k).push(i)});
  (extras||[]).forEach(k=>{if(!M.has(k))M.set(k,[])});
  const ks=[...M.keys()].sort((a,b)=>a===''?1:b===''?-1:cmpCod(a,b));
  const grupos=ks.map(k=>{const its=M.get(k),g=somaItens(its);g.chave=k;g.outras=[...new Set(its.map(outraDe))].sort((a,b)=>a===''?1:b===''?-1:cmpCod(a,b));g.sem=semGrupo(g);return g});
  const total=somaItens(S.D.items);
  const campos=['venda','meta','teto','comp','real','livre'],soma=k=>grupos.reduce((s,g)=>s+g[k],0);
  const confere={n:grupos.reduce((s,g)=>s+g.n,0)===total.n,campos:Object.fromEntries(campos.map(k=>[k,Math.abs(soma(k)-total[k])<0.005]))};
  confere.ok=confere.n&&campos.every(k=>confere.campos[k]);
  return {grupos,total,confere}}
/* par.evRef = {código do evento: valor do eventograma oficial (Anexo VII)}, só para comparar com a receita somada pelos itens. [SUPOSIÇÃO: formato provisório;
   hoje nada grava essa chave, a carga definitiva da lista de eventos é o M6 do plano.] Sem ela a tela não mostra a coluna de diferença. */
function agregaEventos(){
  const its=S.D.items,modo=its.length&&its.every(i=>!evDe(i))?'grupo':'evento',ref=(S.t.par&&S.t.par.evRef)||null;
  const R=agregaGrupos(modo==='grupo'?grupoRaiz:evDe,pacDe,modo==='evento'&&ref?Object.keys(ref):[]);
  R.modo=modo;R.temRef=modo==='evento'&&!!ref&&Object.keys(ref).length>0;
  R.grupos.forEach(g=>{g.nome=modo==='grupo'?((S.byCod[g.chave]||{}).descricao||''):'';if(R.temRef&&ref[g.chave]!=null){g.ref=+ref[g.chave];g.dif=g.venda-g.ref}});
  return R}
function agregaPacotes(){
  const R=agregaGrupos(pacDe,evDe,[]);R.grupos.forEach(g=>{const p=S.D.pacotes.find(x=>x.codigo===g.chave);g.nome=p?p.nome:'';g.cadastro=p?{meta:p.meta,teto:p.teto}:null});return R}

