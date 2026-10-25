/* ============ motor de regras (espelha o SQL) ============ */
const byCod=()=>S.byCod;
const dominante=i=>{const n=i.natureza||{};const k=Object.keys(n).sort((a,b)=>n[b]-n[a])[0];
  if(n[k]>0)return k;return /material/.test(i.tipo||'')?'MAT':'TER'};
function prep(){
  const D=S.D;D.items=D.eap.filter(e=>e.tipo_linha==='item');
  D.items.forEach(i=>{if(!('_mu0' in i))i._mu0=i.meta_unit;   /* meta_unit como veio da carga, para a chave calc_v2 poder voltar atrás */
    const ov=S.t.baseOv&&S.t.baseOv[i.codigo];if(ov){i.meta_base=ov.meta_total;i.teto_total=ov.teto_total;i.status_cotacao=ov.status_cotacao;i.meta_unit=ov.meta_unit}else i.meta_base=i.meta_base??i.meta_total;if(S.t.metaOv[i.codigo]!=null)i.meta_total=S.t.metaOv[i.codigo];else i.meta_total=i.meta_base;i.nat=dominante(i);
    /* calc_v2 [SUPOSIÇÃO, plano M1]: o remanejamento grava só a meta do item; meta_unit passa a acompanhá-la (meta ÷ quantidade, mesma conta de 21_sync_planilha.js). Derivado na leitura: nada é regravado. */
    {const mu=calcV2(S.t)&&S.t.metaOv[i.codigo]!=null&&i.qtd>0?r2(i.meta_total/i.qtd*10000)/10000:(ov?ov.meta_unit:i._mu0);if(i.meta_unit!==mu)i.meta_unit=mu}});
  D.pacotes.forEach(p=>{const o=S.t.basePac&&S.t.basePac[p.codigo];if(o)Object.assign(p,o)});
  S.byCod=Object.fromEntries(D.eap.map(e=>[e.codigo,e]));
  D.items.forEach(i=>{i.linhas=i.composicao||[{nat:i.nat,share:1}]});
  D.pacotes.forEach(p=>p._it=D.items.filter(i=>i.pacote===p.codigo));
}
/* ---------- conta única de comprometido, realizado e saldo (M1) ----------
   Toda tela que mostra "pedido sem nota" (comprometido) ou "realizado" chama contaObra(): ninguém repete a conta.
   Comprometido = pedido aprovado ainda sem nota; realizado = nota rateada (qualquer status menos "lancada"). Os dois nunca somam o mesmo valor.
   Chave par.calc_v2 (por obra, padrão DESLIGADA, vale para o navegador; o SQL _taf_erp_valores continua como era, ver LEIA-ME-M1-SQL-PENDENTE.md):
   - desligada: conta de sempre. A OC é abatida só pelas notas rateadas NO MESMO ITEM da OC (chave oc|item).
   - ligada [SUPOSIÇÃO: regra do plano 00-MATRIZ-E-PLANO, M1; ainda sem ok do Felipe]: a OC é abatida pelo TOTAL das notas ligadas a ela, em qualquer item
     do rateio que exista no orçamento. Nota rateada fora do item da OC deixa de contar duas vezes e gera aviso (contaObra().avisos).
     Rateio para item que NÃO existe no orçamento não abate o pedido (não viraria realizado de item nenhum): o valor continua comprometido e o aviso diz isso. */
const OC_COMPROMETE=['aprovada','recebida_parcial','recebida'];
/* Chaves liga/desliga POR OBRA, guardadas em estado.par (vão para o banco junto com os parâmetros). Todas nascem DESLIGADAS: desligada = o ERP de sempre. [SUPOSIÇÃO: mecanismo proposto no plano 00-MATRIZ-E-PLANO] */
const CHAVES_OBRA=[
 {k:'calc_v2',n:'Cálculo único de comprometido e realizado (M1)',d:'Nota rateada em outro item não conta duas vezes: o pedido é abatido pela nota inteira, com aviso. Remanejar meta também acerta a meta unitária. Atualizar pela planilha lista os itens remanejados. Atenção: o banco (tela “Da tarefa à compra e ao BM”, Ciclo e Marko) ainda não acompanha esta chave e continua contando como antes; em obra real, os números desses lugares podem diferir de Orçamento, Eventos e Painéis.'},
 {k:'ev_agrega',n:'Eventos e pacotes pela soma dos itens (M2)',d:'O teto e o alerta do pacote passam a olhar a soma dos itens. Liga a aba Eventos (só leitura): meta, limite, comprometido, realizado, saldo e semáforo por evento e por pacote.'},
 {k:'oc_linhas',n:'Compra com várias linhas (M3)',d:'Solicitação e pedido (OC) passam a ter várias linhas {item, quantidade, valor}. O comprometido e o faturado são contados por linha, o rateio da nota nasce igual às linhas do pedido e a tela mostra evento, pacote e saldo de cada item ao escolher. Pedido antigo com um item só continua igual. Atenção: o banco (tela “Da tarefa à compra e ao BM”, Ciclo e Marko) ainda lê só o item da primeira linha.'},
 {k:'ev_ctrl',n:'Limite em três níveis: item, pacote e evento (M4)',d:'O semáforo devolve a pior cor entre item, pacote e evento e vale na solicitação, no pedido e na nota sem pedido. Pedido aguardando aprovação reserva saldo; a decisão recalcula o semáforo; quem solicitou não aprova (por usuário); pedidos verdes do mesmo pacote no mesmo dia somam para a alçada. Alçadas e valores seguem provisórios.'}];
const chaveLigada=(k,t)=>{const p=(t||S.t||{}).par;return !!(p&&p[k])};
const calcV2=t=>chaveLigada('calc_v2',t);
const ocLinhasLigada=t=>chaveLigada('oc_linhas',t);
const evCtrl=t=>chaveLigada('ev_ctrl',t);
/* parâmetros da chave ev_ctrl: os de partida (02_estado.js, EV_PADRAO) com o que a obra trocou em par.ev */
const evPar=t=>({...EV_PADRAO,...(((t||S.t||{}).par||{}).ev||{})});
/* ---------- M3: linhas de solicitação e de pedido ----------
   Com par.oc_linhas ligada, uma solicitação ou OC pode ter várias linhas [{item, nat, conta, qtd, valor}] (campo doc.linhas). O campo doc.item guarda sempre a PRIMEIRA linha
   (compatibilidade: quem não conhece linhas lê só o primeiro item). Documento sem lista (antigo) ou chave desligada: vale a linha única {item}. Nada é regravado: é derivado na leitura.
   Pedido de várias linhas guarda qtd=1 e preco=valor (o pacote é uma unidade só: recebimento, conferência da nota e proposta do fornecedor falam em valor do pacote). [SUPOSIÇÃO] */
function linhasDe(d,t){
  if(ocLinhasLigada(t)&&Array.isArray(d.linhas)&&d.linhas.length)return d.linhas;
  return [{item:d.item,nat:d.nat,conta:d.conta,qtd:d.qtd,valor:d.valor!=null?d.valor:r2((+d.qtd||0)*(+d.preco||0))}]}
const ocMulti=(d,t)=>ocLinhasLigada(t)&&Array.isArray(d.linhas)&&d.linhas.length>1;
const itensDe=(d,t)=>[...new Set(linhasDe(d,t).map(l=>l.item))];
/* texto curto dos itens de um documento: "1.1" ou "1.1 +2" quando há mais itens */
const itensTxt=(d,t)=>{const L=itensDe(d,t);return L.length>1?L[0]+' +'+(L.length-1):String(L[0]==null?'':L[0])};
/* unidade do pedido: pedido de várias linhas é recebido como um pacote só */
const ocUn=o=>ocMulti(o)?'pacote':(S.byCod[o.item].unidade||'');
/* reparte um total em centavos entre pesos (maior resto): a soma é sempre exatamente o total e ninguém passa do próprio peso. Pesos todos zero: partes iguais. */
function repartir(totalCent,pesos){
  const n=pesos.length;if(!n)return [];const W=pesos.reduce((s,x)=>s+x,0),T=Math.max(0,Math.round(totalCent));
  const sh=pesos.map(w=>W>0?T*w/W:T/n),out=sh.map(Math.floor);let falta=T-out.reduce((s,x)=>s+x,0);
  sh.map((x,k)=>[x-Math.floor(x),k]).sort((a,b)=>b[0]-a[0]||a[1]-b[1]).forEach(([f,k])=>{if(falta>0&&(W<=0||out[k]<pesos[k])){out[k]++;falta--}});
  for(let k=0;falta>0;k=(k+1)%n){out[k]++;falta--}
  return out}
/* o mesmo em reais (2 casas) */
const repartirR=(total,pesos)=>repartir(Math.round(total*100),pesos.map(w=>Math.round((+w||0)*100))).map(c=>c/100);
/* Aviso fixo enquanto o SQL (_taf_erp_valores) não acompanha calc_v2 (LEIA-ME-M1-SQL-PENDENTE.md): aparece onde o número do banco convive com o do navegador. Só com a chave ligada. */
const AVISO_SQL_CALC='Esta obra está com o cálculo novo de comprometido e realizado ligado. O banco ainda não acompanha: “Da tarefa à compra e ao BM”, o Ciclo e o Marko continuam contando como antes. Onde há nota rateada fora do item do pedido, os números desses lugares podem diferir de Orçamento, Eventos e Painéis até o banco ser atualizado.';
const avisoSqlCalc=()=>calcV2()?`<div class="sub" style="margin-top:10px"><span class="pill warn">atenção</span> ${AVISO_SQL_CALC}</div>`:'';
/* Idem para a compra de várias linhas (M3): o SQL do rastro lê só o item da primeira linha (LEIA-ME-M3-SQL-PENDENTE.md). Só com a chave oc_linhas ligada. */
const AVISO_SQL_LINHAS='Esta obra está com a compra de várias linhas ligada. O banco ainda não acompanha: “Da tarefa à compra e ao BM”, o Ciclo e o Marko leem só o item da primeira linha de cada solicitação e de cada pedido. Nos pedidos de várias linhas, os números e o evento mostrados nessas telas podem diferir de Orçamento, Eventos e Painéis até o banco ser atualizado.';
const avisoSqlLinhas=()=>ocLinhasLigada()?`<div class="sub" style="margin-top:10px"><span class="pill warn">atenção</span> ${AVISO_SQL_LINHAS}</div>`:'';
function contaObra(t){
  t=t||S.t;const v2=calcV2(t),LN=ocLinhasLigada(t),EC=evCtrl(t),ocs=t.ocs||[],real=[],fatItem={},fatOC={},porId={};
  /* itens do orçamento (EAP) da obra aberta. Só vale para a obra aberta (t===S.t) e quando há EAP: nas telas que trocam S.t por outra obra (comObra, 44_painel_inicio.js)
     S.D.items vem vazio, e aí não há como saber o que existe naquela obra (sem filtro). Usado só com a chave calc_v2 ligada. */
  const eap=v2&&t===S.t&&S.D&&S.D.items&&S.D.items.length?new Set(S.D.items.map(i=>String(i.codigo))):null;
  const naEAP=l=>!eap||eap.has(String(l.item));
  ocs.forEach(o=>{porId[o.id]=o});
  /* desligada: nota rateada sem a lista rateio derruba a conta (TypeError), como no ERP de partida; ligada tolera a nota sem lista */
  (t.notas||[]).forEach(n=>{if(n.status==='lancada')return;(v2?(n.rateio||[]):n.rateio).forEach(l=>{const v=+l.valor;real.push({n,l,v});
    /* fatOC (só da chave ligada) soma o que a nota realiza em item que existe no orçamento: rateio para item que não existe não vira realizado do item,
       então não pode abater o pedido (senão o valor sumia das duas pontas). Fica comprometido no pedido e vira aviso. */
    if(n.oc){const k=n.oc+'|'+l.item;fatItem[k]=(fatItem[k]||0)+v;if(naEAP(l))fatOC[n.oc]=(fatOC[n.oc]||0)+v}})});
  /* comp = um registro por pedido (valor do pedido que ainda não virou nota); lin = um registro por LINHA do pedido (item, natureza e conta de cada linha), usado por quem precisa do item;
     res (só com ev_ctrl) = pedidos aguardando aprovação, que reservam saldo. Sem oc_linhas cada pedido tem uma linha só e lin repete comp. */
  const comp=[],lin=[],res=[],avisos=[];
  ocs.forEach(o=>{
    if(EC&&evPar(t).reservaEmAlcada&&o.status==='em_alcada')linhasDe(o,t).forEach(l=>res.push({oc:o,item:l.item,valor:+l.valor||0}));
    if(!OC_COMPROMETE.includes(o.status))return;
    const L=LN?linhasDe(o,t):null;
    /* chave desligada, ou pedido de uma linha só: a conta de sempre (a linha única é o item do pedido) */
    if(!L||L.length===1){const it=L?L[0].item:o.item,vl=L?L[0].valor:o.valor,abate=v2?(fatOC[o.id]||0):(fatItem[o.id+'|'+it]||0),c=Math.max(0,vl-abate);comp.push({oc:o,comp:c,abate});lin.push({oc:o,item:it,nat:L?L[0].nat||o.nat:o.nat,conta:L?L[0].conta||o.conta:o.conta,comp:c});return}
    /* oc_linhas ligada [SUPOSIÇÃO, plano M3], pedido de várias linhas: o pedido é abatido linha a linha. 1) cada linha é abatida primeiro pelas notas rateadas NO MESMO ITEM (várias linhas do mesmo item dividem a nota na ordem);
       2) com calc_v2 ligada, o que a nota realizou em outros itens do orçamento abate o que sobrou do pedido, repartido na proporção do que sobrou em cada linha (em centavos, a soma fecha exata).
       Com uma linha só dá exatamente o número das duas contas de antes (ramo acima). */
    const vals=L.map(l=>+l.valor||0),usado={};
    const ab=L.map((l,k)=>{const disp=Math.max(0,(fatItem[o.id+'|'+l.item]||0)-(usado[l.item]||0)),a=Math.min(vals[k],disp);usado[l.item]=(usado[l.item]||0)+a;return a});
    const resto=vals.map((v,k)=>v-ab[k]),al=resto.map(()=>0);
    if(v2){const sobra=Math.max(0,(fatOC[o.id]||0)-ab.reduce((x,y)=>x+y,0)),soma=resto.reduce((x,y)=>x+y,0);
      if(sobra>0&&soma>0){const dist=Math.min(sobra,soma),parte=repartir(Math.round(dist*100),resto.map(r=>Math.round(r*100)));parte.forEach((c,k)=>{al[k]=c/100})}}
    const cl=resto.map((r,k)=>Math.max(0,r2(r-al[k])));
    L.forEach((l,k)=>lin.push({oc:o,item:l.item,nat:l.nat||o.nat,conta:l.conta||o.conta,comp:cl[k]}));
    comp.push({oc:o,comp:r2(cl.reduce((x,y)=>x+y,0)),abate:r2(ab.reduce((x,y)=>x+y,0)+al.reduce((x,y)=>x+y,0))})});
  /* aviso: nota rateada em item diferente do item da OC. Uma linha por nota+OC, com os itens e o valor que caiu fora.
     orfaos/valorOrfao (só quando existem): parte que caiu em item que não está no orçamento. Com oc_linhas, "item do pedido" é qualquer item das linhas do pedido. */
  if(v2)(t.notas||[]).forEach(n=>{const o=n.status!=='lancada'&&n.oc&&porId[n.oc];if(!o||!OC_COMPROMETE.includes(o.status))return;
    const itOC=LN?new Set(linhasDe(o,t).map(l=>l.item)):new Set([o.item]);
    const fora=(n.rateio||[]).filter(l=>!itOC.has(l.item));if(!fora.length)return;
    const av={tipo:'nota_fora_do_item',oc:o.id,ocNum:o.num,itemOC:o.item,nota:n.id,notaNum:n.num,itens:[...new Set(fora.map(l=>l.item))],valor:r2(fora.reduce((s,l)=>s+ +l.valor,0))};
    if(itOC.size>1)av.itensOC=[...itOC];
    const orf=fora.filter(l=>!naEAP(l));if(orf.length){av.orfaos=[...new Set(orf.map(l=>l.item))];av.valorOrfao=r2(orf.reduce((s,l)=>s+ +l.valor,0))}
    avisos.push(av)});
  return {v2,real,ocs:comp,lin,res,avisos};
}
function saldos(){
  const m={};S.D.items.forEach(i=>m[i.codigo]={comp:0,real:0});
  const C=S.conta=contaObra(S.t);
  C.real.forEach(x=>{m[x.l.item]&&(m[x.l.item].real+=x.v)});
  C.lin.forEach(x=>{if(m[x.item])m[x.item].comp+=x.comp});
  /* ev_ctrl: pedido aguardando aprovação reserva saldo (campo res, só existe com a chave ligada); comp e livre continuam como sempre */
  if(evCtrl()){S.D.items.forEach(i=>m[i.codigo].res=0);C.res.forEach(x=>{if(m[x.item])m[x.item].res+=x.valor})}
  S.sd=m;S.idx=null;S.D.items.forEach(i=>{const s=m[i.codigo];s.meta=i.meta_total;s.teto=i.teto_total;s.livre=r2(i.meta_total-s.comp-s.real)});
  return m;
}
/* semáforo de UM item: o de sempre. adj (só com ev_ctrl) = {res: saldo reservado por pedidos aguardando aprovação, real: realizado a descontar (nota que está sendo decidida)}. */
function semaforoItem(cod,total,adj){
  const i=S.byCod[cod];
  if(!S.t.frozen)return ['bloqueado','Linha de base não congelada','Obra sem linha de base não abre compra (E01). Peça à Gestão para congelar a versão 1 em Orçamento.'];
  if(i&&i.tipo_linha==='item'&&i.meta_total==null)return ['bloqueado','Item sem meta de custo','Esta obra ainda não tem estudo de custo: defina a meta do item (Orçamento → Atualizar pela planilha) antes de comprar.'];
  if(!i||i.tipo_linha!=='item'||i.meta_total==null)return ['bloqueado','Fora da planilha do contrato','Sem item com meta não há compra: abra pedido de inclusão ou aditivo.'];
  const s=S.sd[i.codigo],rs=adj&&adj.res||0,rl=adj&&adj.real||0,aj=rs||rl;
  const gasto=aj?s.comp+s.real-rl+rs:s.comp+s.real,livre=aj?r2(s.livre+rl-rs):s.livre;
  if(i.teto_total!=null&&gasto+total>i.teto_total)return ['vermelho','Acima do teto','Teto '+brl(i.teto_total)+' (margem zero). Só a Diretoria aprova.'];
  if(total<=livre)return ['verde','Cabe no saldo da meta','Saldo livre '+brl(livre)+'. Vira pedido sem alçada.'];
  return ['amarelo','Acima da meta, até o teto','Saldo livre '+brl(livre)+'. O Gerente de contrato aprova com justificativa.'];
}
function semaforo(cod,total,pendId){return evCtrl()?semaforoLinhas([{item:cod,valor:total}],{ocId:pendId}):semaforoItem(cod,total)}
const SEV={verde:0,amarelo:1,vermelho:2,bloqueado:3};

/* ---------- M4: limite em três níveis (item, pacote, evento) ----------
   Chave par.ev_ctrl (por obra, padrão DESLIGADA). Desligada, tudo isto fica parado e o semáforo é o de sempre (semaforoItem).
   Ligada [SUPOSIÇÃO do plano, decisões D1, D2, D4, D6, D7 e E3 do Felipe de 25/10/2026]:
   - a cor de uma compra é a PIOR entre o item, o pacote e o evento (obra sem evento: o grupo da EAP faz o papel do evento, como em Eventos);
   - item continua rígido (D6): acima da meta do item é amarelo mesmo com saldo no pacote;
   - pacote e evento usam a soma das metas e dos tetos dos itens, a mesma conta da tela Eventos: verde dentro da meta, amarelo acima da meta até o limite (teto), vermelho acima do limite;
   - grupo com meta acima do limite (sem folga) é vermelho para qualquer compra (E3);
   - pedido aguardando aprovação reserva saldo (par.ev.reservaEmAlcada) e a decisão recalcula tudo (12_compras.js, decidirCtrl). */
function idxCtrl(){
  if(S.idx)return S.idx;
  const its=S.D.items,modo=its.length&&its.every(i=>!evDe(i))?'grupo':'evento',pac=new Map(),ev=new Map();
  its.forEach(i=>{const p=pacDe(i),e=modo==='grupo'?grupoRaiz(i):evDe(i);
    if(p!=='')(pac.get(p)||pac.set(p,[]).get(p)).push(i);if(e!=='')(ev.get(e)||ev.set(e,[]).get(e)).push(i)});
  return S.idx={modo,pac,ev}}
/* ordem de emissão do pedido (fila): o número do pedido; sem número válido, a posição na lista (a lista guarda o mais novo primeiro) */
const ordemOC=o=>{const n=parseInt(String(o.num||'').replace(/\D/g,''));return n>0?n:(S.t.ocs.length-S.t.ocs.indexOf(o))};
/* o que descontar do saldo na hora de calcular a cor de um documento: reserva dos pedidos aguardando aprovação (todos, para um documento novo; só os mais antigos, para um pedido já emitido)
   e o realizado da própria nota (quando a nota que está sendo decidida já conta como realizada). ctx = {ocId, notaId} */
function ajusteCtrl(ctx){
  const C=S.conta||contaObra(S.t),res={},real={},P=evPar();
  const me=ctx.ocId?S.t.ocs.find(o=>o.id===ctx.ocId):null,ord=me?ordemOC(me):Infinity;
  (C.res||[]).forEach(x=>{if(ctx.ocId&&x.oc.id===ctx.ocId)return;if(me&&P.reservaPorOrdem&&ordemOC(x.oc)>ord)return;res[x.item]=(res[x.item]||0)+x.valor});
  if(ctx.notaId){const n=S.t.notas.find(x=>x.id===ctx.notaId);if(n&&n.status!=='lancada')(n.rateio||[]).forEach(l=>{real[l.item]=(real[l.item]||0)+ +l.valor})}
  return {res,real}}
/* soma de um grupo de itens (pacote ou evento) para a conta da compra: meta, limite (teto), gasto (comprometido + realizado + reservado) e saldo */
function somaGrupoCtrl(its,adj){
  const g={meta:0,teto:0,temTeto:false,gasto:0};
  its.forEach(i=>{const s=S.sd[i.codigo]||{comp:0,real:0};g.meta+=+i.meta_total||0;if(i.teto_total!=null){g.teto+=+i.teto_total||0;g.temTeto=true}
    g.gasto+=s.comp+s.real-(adj.real[i.codigo]||0)+(adj.res[i.codigo]||0)});
  g.meta=r2(g.meta);g.teto=r2(g.teto);g.gasto=r2(g.gasto);g.livre=r2(g.meta-g.gasto);return g}
/* cor de uma compra de valor tot dentro de um grupo (pacote ou evento) */
function corGrupoCtrl(rot,g,tot){
  if(g.temTeto&&g.meta>g.teto)return ['vermelho',rot+': meta acima do limite','Meta '+brl(g.meta)+' × limite '+brl(g.teto)+' (soma dos itens): sem folga, toda compra nasce vermelha. Só a Diretoria aprova.'];
  const novo=r2(g.gasto+tot);
  if(g.temTeto&&novo>g.teto)return ['vermelho',rot+': acima do limite','Limite '+brl(g.teto)+' (soma dos tetos dos itens); já usado '+brl(g.gasto)+'. Só a Diretoria aprova.'];
  if(novo>g.meta)return ['amarelo',rot+': acima da meta, até o limite','Saldo livre '+brl(g.livre)+'. O Gerente de contrato aprova com justificativa.'];
  return ['verde',rot+': cabe no saldo da meta','Saldo livre '+brl(g.livre)+'.']}
const PIOR=(a,b)=>SEV[b.r[0]]>SEV[a.r[0]]?b:a;
/* semáforo de um documento com várias linhas [{item, valor}] (M3 e M4): linhas do mesmo item somam; vale a PIOR cor.
   Sem ev_ctrl: só o nível do item. Uma linha só dá o mesmo resultado de semaforo(). A resposta é a de sempre [cor, título, texto]; com mais de um item o texto diz de qual item vem a cor.
   Com ev_ctrl vem um quarto elemento, a lista dos níveis [{nivel, chave, rot, cor, titulo, texto}], que a tela mostra. ctx = {ocId, notaId}: documento já existente que está sendo decidido (não conta contra si mesmo). */
function semaforoLinhas(L,ctx){
  ctx=ctx||{};const EC=evCtrl(),porItem=new Map();
  (L||[]).forEach(l=>{if(l&&l.item!=null&&l.item!=='')porItem.set(l.item,(porItem.get(l.item)||0)+(+l.valor||0))});
  if(!porItem.size)return ['bloqueado','Pedido sem linha','Informe ao menos um item com quantidade e preço.'];
  const adj=EC?ajusteCtrl(ctx):null;
  const rs=[...porItem.entries()].map(([cod,tot])=>({cod,tot,r:semaforoItem(cod,tot,EC?{res:adj.res[cod]||0,real:adj.real[cod]||0}:null)}));
  const multi=rs.length>1,txt=x=>multi?[x.r[0],x.r[1],x.r[2]+' (item '+x.cod+')']:x.r;
  const bl=rs.find(x=>x.r[0]==='bloqueado');if(bl)return txt(bl);
  const pior=rs.reduce(PIOR);
  if(!EC)return txt(pior);
  /* pacote e evento: soma dos itens de cada grupo que as linhas tocam */
  const ix=idxCtrl(),niveis=rs.map(x=>({nivel:'item',chave:x.cod,rot:'Item '+x.cod,cor:x.r[0],titulo:x.r[1],texto:x.r[2]}));
  const piorN=[{r:txt(pior),n:niveis[rs.indexOf(pior)]}];
  const grupo=(nivel,mapa,rotulo,chaveDe)=>{const tot=new Map();rs.forEach(x=>{const i=S.byCod[x.cod],k=chaveDe(i);if(k!=='')tot.set(k,(tot.get(k)||0)+x.tot)});
    tot.forEach((t,k)=>{const its=mapa.get(k)||[],g=somaGrupoCtrl(its,adj),rot=rotulo+' '+k,r=corGrupoCtrl(rot,g,t),n={nivel,chave:k,rot,cor:r[0],titulo:r[1],texto:r[2],meta:g.meta,teto:g.temTeto?g.teto:null,gasto:g.gasto,livre:g.livre,compra:r2(t)};niveis.push(n);
      if(SEV[r[0]]>SEV[piorN[0].r[0]])piorN[0]={r,n}})};
  grupo('pacote',ix.pac,'Pacote',i=>pacDe(i));
  grupo('evento',ix.ev,ix.modo==='grupo'?'Grupo':'Evento',i=>ix.modo==='grupo'?grupoRaiz(i):evDe(i));
  const w=piorN[0].r;return [w[0],w[1],w[2],niveis]}
/* alçada de um documento (OC ou nota sem pedido) com a regra D2: pedidos VERDES do mesmo pacote no mesmo dia somam para a alçada (quem parte uma compra grande em várias pequenas não escapa da aprovação).
   Só conta pedido verde, não cancelado nem reprovado, criado no mesmo dia e com linha em algum pacote que o documento também toca. ctx = {ocId, dia}. */
function somaVerdesDia(L,ctx){
  const pacs=new Set(L.map(l=>S.byCod[l.item]).filter(Boolean).map(pacDe).filter(Boolean));if(!pacs.size)return 0;
  const dia=ctx.dia||hojeISO();
  return S.t.ocs.filter(o=>o.id!==ctx.ocId&&o.sem==='verde'&&o.criado===dia&&!['cancelada','reprovada'].includes(o.status))
    .reduce((s,o)=>s+linhasDe(o).reduce((a,l)=>{const i=S.byCod[l.item];return a+(i&&pacs.has(pacDe(i))?+l.valor||0:0)},0),0)}
function alcadaCtrl(sem,total,L,ctx){return alcadaDe(sem,sem==='verde'&&evPar().somaDiaPacote?total+somaVerdesDia(L,ctx||{}):total)}
/* quem é o usuário (identidade, não nome): chave pessoal -> 'pessoa:nome sem acento'; login do banco -> 'auth:id'; chave geral do site -> 'nome:nome digitado'; sem login (demonstração) -> 'papel:papel escolhido' */
const nomeNorm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
function usuarioId(){
  const p=(typeof SB!=='undefined'&&SB.perfil)||null;
  if(p&&p.uid)return p.uid;
  if(p&&p.user_id)return 'auth:'+p.user_id;
  return 'papel:'+S.role}
/* o usuário atual é quem solicitou este documento? Com ev_ctrl compara a identidade gravada no documento (solicitanteId); documento sem identidade (antigo) compara o nome sem acento nem caixa.
   Sem a chave: o que sempre foi (nome igual ao do usuário). */
function ehSolicitante(o){
  if(!evCtrl())return o.solicitante===user();
  if(o.solicitanteId)return o.solicitanteId===usuarioId();
  return nomeNorm(o.solicitante)!==''&&nomeNorm(o.solicitante)===nomeNorm(user())}
const SEM_CLASS={verde:'ok',amarelo:'warn',vermelho:'bad',bloqueado:'bad',sem_base:'mute'};
const semPill=s=>`<span class="pill ${SEM_CLASS[s]||'mute'}">${s||'—'}</span>`;
const PX={sol:'SC',oc:'OC',nf:'NF',bm:'BM',apt:'AP',rst:'RE',tar:'TA',bc:'BC',fat:'FT'};
const fmtNum=(k,n)=>PX[k]+'-'+String(n).padStart(4,'0');
/* Numeração: com banco compartilhado os números vêm de faixas reservadas no servidor (sem repetir entre pessoas); sem sinal ou no modo aberto, maior número local + 1. */
function nextNum(k){
  if(MODO_SB&&SB.pool&&SB.pool[k]&&SB.pool[k].length){const n=SB.pool[k].shift();if(SB.pool[k].length<5)sbPool(k);return fmtNum(k,n)}
  const arr={sol:S.t.sols,oc:S.t.ocs,nf:S.t.notas,bm:S.t.meds,apt:S.t.apts,rst:S.t.rsts,tar:S.t.tars,bc:S.t.bcs,fat:S.t.fats}[k];
  const mx=arr.reduce((m,o)=>Math.max(m,parseInt(String(o.num||'').replace(/\D/g,''))||0),0);if(MODO_SB)sbPool(k);return fmtNum(k,mx+1)}
const ocFat=oc=>S.t.notas.filter(n=>n.oc===oc.id&&n.status!=='lancada').reduce((s,n)=>s+n.rateio.reduce((a,l)=>a+ +l.valor,0),0);
const ocRecebido=oc=>r2(oc.preco*(oc.recebido||0));

