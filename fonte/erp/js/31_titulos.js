/* ============ TÍTULOS: parcelas, agrupamento e renegociação (Fase 13) ============ */
const tituloPorId=id=>S.t.titulos.find(t=>t.id===id);
ACOES['tit-parc']=el=>{if(!can('liberar'))return toast('Só Financeiro');const t=tituloPorId(el.dataset.id),i=tituloInfo(t);
  modal(`<h3>Parcelar ${esc(t.ocNum||t.forn)}</h3><div class="sub">Saldo a parcelar: <b>${brl(t.valor)}</b>. Parcelas iguais, uma por mês a partir do primeiro vencimento.</div><div class="g3"><div><label>Nº de parcelas</label><input id="pa-n" type="number" min="2" max="60" value="3"></div><div><label>1º vencimento</label><input id="pa-d" type="date" value="${t.venc}"></div></div>
  <div class="acts"><button class="btn" data-act="fechar">Cancelar</button><button class="btn dark" data-act="tit-parc-ok" data-id="${t.id}">Parcelar</button></div>`)};
function parcelar(t,n,d1){const v=t.valor,base=Math.floor(v/n*100)/100,P=[];let rest=v;
  for(let k=0;k<n;k++){const val=k===n-1?r2(rest):base;rest=r2(rest-val);const dt=new Date(d1+'T12:00:00');dt.setMonth(dt.getMonth()+k);P.push({n:k+1,venc:dt.toISOString().slice(0,10),valor:val})}return P}
ACOES['tit-parc-ok']=el=>{const t=tituloPorId(el.dataset.id),n=Math.round(+$('#pa-n').value),d=$('#pa-d').value;if(!(n>=2&&n<=60)||!d)return toast('Informe 2 a 60 parcelas e o 1º vencimento');
  t.parcelas=parcelar(t,n,d);t.venc=d;log('titulo_pagar',t.ocNum||t.forn,'parcelado','',n+'x · '+brl(t.valor));save();closeModal();toast('Parcelado em '+n+'x');render()};
ACOES['tit-reneg']=el=>{if(!can('liberar'))return toast('Só Financeiro');const t=tituloPorId(el.dataset.id);
  modal(`<h3>Renegociar ${esc(t.ocNum||t.forn)}</h3><div class="sub">Valor atual ${brl(t.valor)} · vence ${fdata(t.venc)}. O histórico fica no título e na auditoria.</div><div class="g3"><div><label>Novo valor</label><input id="rn-v" type="number" step="any" value="${t.valor}"></div><div><label>Novo vencimento</label><input id="rn-d" type="date" value="${t.venc}"></div></div><label>Motivo</label><input id="rn-m">
  <div class="acts"><button class="btn" data-act="fechar">Cancelar</button><button class="btn dark" data-act="tit-reneg-ok" data-id="${t.id}">Registrar</button></div>`)};
ACOES['tit-reneg-ok']=el=>{const t=tituloPorId(el.dataset.id),v=r2($('#rn-v').value),d=$('#rn-d').value,m=$('#rn-m').value.trim();if(!(v>0)||!d||!m)return toast('Informe valor, vencimento e motivo');
  (t.hist=t.hist||[]).push({data:hojeISO(),valorAntes:t.valor,vencAntes:t.venc,motivo:m,quem:user()});log('titulo_pagar',t.ocNum||t.forn,'renegociado',brl(t.valor)+' · '+fdata(t.venc),brl(v)+' · '+fdata(d),m);
  t.valor=v;t.venc=d;if(t.parcelas)t.parcelas=parcelar(t,t.parcelas.length,d);save();closeModal();toast('Renegociado');render()};
ACOES['tit-agrup']=()=>{if(!can('liberar'))return toast('Só Financeiro');const ids=[...document.querySelectorAll('.tg:checked')].map(e=>e.value),L=ids.map(tituloPorId).filter(Boolean);
  if(L.length<2)return toast('Marque 2 ou mais títulos');if(new Set(L.map(t=>t.forn)).size>1)return toast('Só é possível agrupar títulos do mesmo fornecedor');
  const g={id:'t'+Date.now(),oc:'grp'+Date.now(),ocNum:'AGR-'+String(S.t.titulos.filter(t=>t.agrupaDe).length+1).padStart(3,'0'),forn:L[0].forn,valor:r2(L.reduce((s,t)=>s+t.valor,0)),venc:L.map(t=>t.venc).sort()[0],origem:'agrupado',agrupaDe:L.map(t=>t.id)};
  L.forEach(t=>{t.cancelado=true;t.agrupadoEm=g.id});S.t.titulos.push(g);log('titulo_pagar',g.ocNum,'agrupado','',L.map(t=>t.ocNum).join(' + ')+' = '+brl(g.valor));save();toast('Agrupado em '+g.ocNum);render()};
