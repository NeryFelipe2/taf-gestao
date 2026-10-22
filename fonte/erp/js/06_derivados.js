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
    p._temOC=S.t.ocs.some(o=>S.byCod[o.item]?.pacote===p.codigo&&o.status!=='cancelada'&&o.status!=='reprovada')});
  X.vencidos=D.pacotes.filter(p=>p._dias!=null&&p._dias<0&&p._it.length&&!p._temOC);
  X.pendAprov=S.t.ocs.filter(o=>o.status==='em_alcada');
  X.semRateio=S.t.notas.filter(n=>n.status==='lancada');
  X.semPedido=S.t.notas.filter(n=>!n.oc);
  X.economia=S.t.ocs.filter(o=>['aprovada','recebida_parcial','recebida'].includes(o.status)).reduce((s,o)=>{const i=S.byCod[o.item];return s+(i.meta_unit*o.qtd-o.valor)},0);
  return X;
}

