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
     do rateio. Nota rateada fora do item da OC deixa de contar duas vezes e gera aviso (contaObra().avisos). */
const OC_COMPROMETE=['aprovada','recebida_parcial','recebida'];
/* Chaves liga/desliga POR OBRA, guardadas em estado.par (vão para o banco junto com os parâmetros). Todas nascem DESLIGADAS: desligada = o ERP de sempre. [SUPOSIÇÃO: mecanismo proposto no plano 00-MATRIZ-E-PLANO] */
const CHAVES_OBRA=[
 {k:'calc_v2',n:'Cálculo único de comprometido e realizado (M1)',d:'Nota rateada em outro item não conta duas vezes: o pedido é abatido pela nota inteira, com aviso. Remanejar meta também acerta a meta unitária. Atualizar pela planilha lista os itens remanejados.'},
 {k:'ev_agrega',n:'Eventos e pacotes pela soma dos itens (M2)',d:'O teto e o alerta do pacote passam a olhar a soma dos itens. Liga a aba Eventos (só leitura): meta, limite, comprometido, realizado, saldo e semáforo por evento e por pacote.'}];
const chaveLigada=(k,t)=>{const p=(t||S.t||{}).par;return !!(p&&p[k])};
const calcV2=t=>chaveLigada('calc_v2',t);
function contaObra(t){
  t=t||S.t;const v2=calcV2(t),ocs=t.ocs||[],real=[],fatItem={},fatOC={},porId={};
  ocs.forEach(o=>{porId[o.id]=o});
  (t.notas||[]).forEach(n=>{if(n.status==='lancada')return;(n.rateio||[]).forEach(l=>{const v=+l.valor;real.push({n,l,v});
    if(n.oc){const k=n.oc+'|'+l.item;fatItem[k]=(fatItem[k]||0)+v;fatOC[n.oc]=(fatOC[n.oc]||0)+v}})});
  const comp=[],avisos=[];
  ocs.forEach(o=>{if(!OC_COMPROMETE.includes(o.status))return;
    const abate=v2?(fatOC[o.id]||0):(fatItem[o.id+'|'+o.item]||0);comp.push({oc:o,comp:Math.max(0,o.valor-abate),abate})});
  /* aviso: nota rateada em item diferente do item da OC. Uma linha por nota+OC, com os itens e o valor que caiu fora. */
  if(v2)(t.notas||[]).forEach(n=>{const o=n.status!=='lancada'&&n.oc&&porId[n.oc];if(!o||!OC_COMPROMETE.includes(o.status))return;
    const fora=(n.rateio||[]).filter(l=>l.item!==o.item);if(!fora.length)return;
    avisos.push({tipo:'nota_fora_do_item',oc:o.id,ocNum:o.num,itemOC:o.item,nota:n.id,notaNum:n.num,itens:[...new Set(fora.map(l=>l.item))],valor:r2(fora.reduce((s,l)=>s+ +l.valor,0))})});
  return {v2,real,ocs:comp,avisos};
}
function saldos(){
  const m={};S.D.items.forEach(i=>m[i.codigo]={comp:0,real:0});
  const C=S.conta=contaObra(S.t);
  C.real.forEach(x=>{m[x.l.item]&&(m[x.l.item].real+=x.v)});
  C.ocs.forEach(x=>{if(m[x.oc.item])m[x.oc.item].comp+=x.comp});
  S.sd=m;S.D.items.forEach(i=>{const s=m[i.codigo];s.meta=i.meta_total;s.teto=i.teto_total;s.livre=r2(i.meta_total-s.comp-s.real)});
  return m;
}
function semaforo(cod,total,pendId){
  const i=S.byCod[cod];
  if(!S.t.frozen)return ['bloqueado','Linha de base não congelada','Obra sem linha de base não abre compra (E01). Peça à Gestão para congelar a versão 1 em Orçamento.'];
  if(i&&i.tipo_linha==='item'&&i.meta_total==null)return ['bloqueado','Item sem meta de custo','Esta obra ainda não tem estudo de custo: defina a meta do item (Orçamento → Atualizar pela planilha) antes de comprar.'];
  if(!i||i.tipo_linha!=='item'||i.meta_total==null)return ['bloqueado','Fora da planilha do contrato','Sem item com meta não há compra: abra pedido de inclusão ou aditivo.'];
  const s=S.sd[i.codigo];
  if(i.teto_total!=null&&s.comp+s.real+total>i.teto_total)return ['vermelho','Acima do teto','Teto '+brl(i.teto_total)+' (margem zero). Só a Diretoria aprova.'];
  if(total<=s.livre)return ['verde','Cabe no saldo da meta','Saldo livre '+brl(s.livre)+'. Vira pedido sem alçada.'];
  return ['amarelo','Acima da meta, até o teto','Saldo livre '+brl(s.livre)+'. O Gerente de contrato aprova com justificativa.'];
}
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

