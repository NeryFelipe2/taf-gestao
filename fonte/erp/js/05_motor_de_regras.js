/* ============ motor de regras (espelha o SQL) ============ */
const byCod=()=>S.byCod;
const dominante=i=>{const n=i.natureza||{};const k=Object.keys(n).sort((a,b)=>n[b]-n[a])[0];
  if(n[k]>0)return k;return /material/.test(i.tipo||'')?'MAT':'TER'};
function prep(){
  const D=S.D;D.items=D.eap.filter(e=>e.tipo_linha==='item');
  D.items.forEach(i=>{const ov=S.t.baseOv&&S.t.baseOv[i.codigo];if(ov){i.meta_base=ov.meta_total;i.teto_total=ov.teto_total;i.status_cotacao=ov.status_cotacao;i.meta_unit=ov.meta_unit}else i.meta_base=i.meta_base??i.meta_total;if(S.t.metaOv[i.codigo]!=null)i.meta_total=S.t.metaOv[i.codigo];else i.meta_total=i.meta_base;i.nat=dominante(i)});
  D.pacotes.forEach(p=>{const o=S.t.basePac&&S.t.basePac[p.codigo];if(o)Object.assign(p,o)});
  S.byCod=Object.fromEntries(D.eap.map(e=>[e.codigo,e]));
  D.items.forEach(i=>{i.linhas=i.composicao||[{nat:i.nat,share:1}]});
  D.pacotes.forEach(p=>p._it=D.items.filter(i=>i.pacote===p.codigo));
}
function saldos(){
  const m={};S.D.items.forEach(i=>m[i.codigo]={comp:0,real:0});
  const fat={};
  S.t.notas.forEach(n=>{if(n.status==='lancada')return;n.rateio.forEach(l=>{m[l.item]&&(m[l.item].real+=+l.valor);if(n.oc)fat[n.oc+'|'+l.item]=(fat[n.oc+'|'+l.item]||0)+ +l.valor})});
  S.t.ocs.forEach(o=>{if(['aprovada','recebida_parcial','recebida'].includes(o.status)&&m[o.item])m[o.item].comp+=Math.max(0,o.valor-(fat[o.id+'|'+o.item]||0))});
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
const SEM_CLASS={verde:'ok',amarelo:'warn',vermelho:'bad',bloqueado:'bad'};
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

