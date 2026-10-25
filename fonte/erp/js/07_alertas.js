/* ============ alertas ============ */
function alertas(X){
  const a=[];
  if(!S.t.frozen)a.push(['bad','Linha de base não congelada','Compras bloqueadas até a Gestão congelar a versão 1 (E01).']);
  X.vencidos.forEach(p=>a.push(['bad',`Pacote ${p.codigo}: fechar até ${fdata(p.fechar_ate)} vencido`,`${-p._dias} dia(s) de atraso, sem pedido. ${brl(p.meta,true)} de meta; vira restrição na frente.`]));
  S.D.pacotes.filter(p=>p._acima).forEach(p=>a.push(['bad',`Pacote ${p.codigo}: meta acima do teto`,`Meta ${brl(pacMeta(p))} × teto ${brl(pacTeto(p))}. Solicitação nasce vermelha.`]));
  X.pendAprov.forEach(o=>a.push([o.alcada==='diretoria'?'bad':'warn',`${o.num} aguarda ${ROLES[o.alcada].n}`,`${brl(o.valor)} · ${o.item} · ${esc(o.forn)}`]));
  X.semRateio.forEach(n=>a.push(['warn',`${n.num} sem rateio`,`${esc(n.emitente)} · ${brl(n.valor)}. Não entra no custo do item.`]));
  X.semPedido.filter(n=>n.status!=='paga').forEach(n=>a.push(['warn',`${n.num} sem pedido`,`Alerta de governança: ${esc(n.justSemOC||'sem justificativa')}`]));
  S.t.notas.filter(n=>n.status==='divergente').forEach(n=>a.push(['bad',`${n.num} divergente do pedido`,'Pagamento bloqueado até Compras resolver.']));
  if(calcV2())contaObra().avisos.forEach(v=>a.push(['warn',`${esc(v.notaNum)} rateada fora do item do pedido ${esc(v.ocNum)}`,`O pedido é do item ${esc(v.itemOC)}, mas ${brl(v.valor)} da nota foram para ${v.itens.map(esc).join(', ')}. Com o cálculo novo o pedido é abatido pela nota inteira (conta uma vez só); confira o item do rateio.`]));
  S.t.meds.filter(m=>m.status==='lancada').forEach(m=>a.push(['warn',`${m.num} aguarda atesto`,`${m.item} · ${num(m.qtd)} medidos por ${esc(m.quem)}`]));
  S.t.titulos.filter(t=>!t.cancelado&&t.venc<hojeISO()&&tituloInfo(t).saldo>0).forEach(t=>a.push(['bad',`Título ${t.ocNum} vencido`,`${esc(t.forn)} · saldo ${brl(tituloInfo(t).saldo)}`]));
  S.D.items.forEach(i=>{const r=resItem(i);if(r.sem==='bad')a.push(['bad',`Item ${i.codigo}: ${r.txt}`,`Receita ${brl(r.rec)} × custo ${brl(r.real)}${r.idc!=null?' · IDC '+r.idc.toFixed(2).replace('.',','):''}`])});
  restAb().filter(escalada).forEach(r=>a.push(['bad','Restrição escalada: '+r.desc,`${r.dono} · parada há ${duDesde(r.atualizada||r.criada)} dias úteis`]));
  if(S.t.frozen&&!S.t.apts.some(x=>x.data===ontemUtil()))a.push(['warn','Sem apontamento no último dia útil',fdata(ontemUtil())+': lance ou justifique em Campo.']);
  S.t.apts.filter(x=>x.status==='conferido').forEach(x=>a.push(['warn',x.num+' aguarda aprovação',x.item+' · '+num(x.qtd)+' apontados']));
  S.t.bcs.filter(x=>x.status==='aprovado').forEach(x=>a.push(['warn',x.num+' aprovado e não faturado',brl(bcAprov(x))+': emita a NF de serviço.']));
  S.t.fats.filter(f=>fatSaldo(f)>0&&f.venc<hojeISO()).forEach(f=>a.push(['bad','NF '+f.num+' vencida sem recebimento','Saldo '+brl(fatSaldo(f))]));
  if(medsLivres().length)a.push(['info',medsLivres().length+' medição(ões) atestada(s) sem boletim',brl(medsLivres().reduce((q,m)=>q+medValor(m),0))+' a medir ao cliente.']);
  {const c=caixa();if(c.minAcc<0)a.push(['bad','Caixa projetado negativo','Exposição máxima '+brl(c.minAcc)])}
  a.push(['warn',`${X.aCotar.length} itens sem cotação`,`${brl(X.aCotar.reduce((s,i)=>s+i.meta_total,0),true)} do custo-meta é estimativa.`]);
  a.push(['warn',`${X.semFolga.length} itens com meta acima do teto`,'Sem folga: qualquer compra neles fica vermelha.']);
  if(S.D.relatorio?.aviso)a.push(['info','Versão da META a confirmar',S.D.relatorio.aviso]);
  if(typeof sstVenc==='function'){sstVenc(30).forEach(x=>a.push([x.validade<hojeISO()?'bad':'warn','SST '+x.tipo+' '+(x.validade<hojeISO()?'vencido':'vence em 30 dias'),((colPorId(x.col)||{}).nome||'?')+' · '+fdata(x.validade)]));
    S.t.ctrs.forEach(c=>ctrAvisos(c).filter(v=>v[0]!=='info').forEach(v=>a.push([v[0],'Contrato '+c.num+': '+v[1],c.parte])));
    S.t.pats.filter(b=>!b.baixa&&b.seguro&&b.seguro.venc<=addDias(hojeISO(),30)).forEach(b=>a.push(['warn','Seguro do bem '+b.cod+' vence em '+fdata(b.seguro.venc),b.desc]));
    S.t.frts.forEach(v=>{const p=prevVencida(v);if(p)a.push(['bad','Preventiva vencida: '+v.cod,p])});
    S.t.ctrs.forEach(c=>(c.bms||[]).filter(b=>b.status==='lancado').forEach(b=>a.push(['warn','Medição de subempreiteiro a aprovar',c.num+' · BM '+b.n+' · '+brl(b.valor)])));
    if(invAb())a.push(['info','Inventário aberto desde '+fdata(invAb().data),'Conte e feche para gerar os ajustes.']);
    {const ant=addMes(mesDe(hojeISO()),-1);if(!S.t.fechs.some(f=>f.comp===ant&&!f.reaberta)&&partidasTodas().some(e=>e.comp===ant))a.push(['info','Competência '+ant+' ainda aberta','Feche em Contabilidade → Fechamento depois da conferência.'])}}
  return a;
}

