/* ============ ORÇAMENTO (Fase 2) ============ */
function viewEap(X){
  const q=S.q.toLowerCase();
  const rows=[];
  const agg=g=>{const its=S.D.items.filter(i=>i.codigo.startsWith(g.codigo+'.'));return {venda:its.reduce((s,i)=>s+i.preco_venda_total,0),meta:its.reduce((s,i)=>s+i.meta_total,0),comp:its.reduce((s,i)=>s+S.sd[i.codigo].comp,0),real:its.reduce((s,i)=>s+S.sd[i.codigo].real,0),teto:its.reduce((s,i)=>s+i.teto_total,0)}};
  const vis=e=>{if(q)return (e.codigo+' '+e.descricao).toLowerCase().includes(q)||S.D.items.some(i=>i.codigo.startsWith(e.codigo+'.')&&(i.codigo+' '+i.descricao).toLowerCase().includes(q));
    let p=e.pai;while(p){if(!S.exp.has(p))return false;p=S.byCod[p]?.pai}return true};
  S.D.eap.forEach(e=>{if(!vis(e))return;
    if(e.tipo_linha==='grupo'){const a=agg(e);const open=q||S.exp.has(e.codigo);
      rows.push(`<tr class="grp clk" data-exp="${e.codigo}"><td><span class="chev">${open?'▾':'▸'}</span><span class="mono">${e.codigo}</span></td><td style="padding-left:${(e.nivel-1)*14+10}px">${esc(e.descricao)}</td><td class="r mut">${brl(a.venda,true)}</td><td class="r">${brl(a.meta,true)}</td><td class="r">${brl(a.teto,true)}</td><td class="r">${brl(a.comp,true)}</td><td class="r">${brl(a.real,true)}</td><td>${bar(a.comp,a.real,a.meta)}</td><td></td></tr>`)}
    else{const s=S.sd[e.codigo];
      rows.push(`<tr class="clk" data-item="${e.codigo}"><td><span class="mono">${e.codigo}</span></td><td style="padding-left:${(e.nivel-1)*14+10}px">${esc(e.descricao.slice(0,90))}<div class="mut" style="font-size:11.5px">${num(e.qtd)} ${e.unidade||''} · ${e.pacote||'—'}</div></td><td class="r mut">${brl(e.preco_venda_total)}</td><td class="r">${brl(e.meta_total)}</td><td class="r ${e.meta_total>e.teto_total?'neg':''}">${brl(e.teto_total)}</td><td class="r">${brl(s.comp)}</td><td class="r">${brl(s.real)}</td><td>${bar(s.comp,s.real,e.meta_total)}</td><td>${e.status_cotacao==='A cotar'?'<span class="pill warn">estimado</span>':e.meta_total>e.teto_total?'<span class="pill bad">sem folga</span>':''}</td></tr>`)}});
  return `<div class="head"><div><h1>Orçamento (EAP)</h1><p class="lead">Cada item guarda meta, teto e saldos. Clique num item para ver detalhes, solicitar compra ou remanejar saldo.</p></div>
   <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="pill ${S.t.frozen?'ok':'bad'}">Linha de base v${S.t.versao} ${S.t.frozen?'congelada':'não congelada'}</span>
   ${S.t.frozen?'':`<button class="btn dark" data-act="congelar" ${can('congelar')?'':'disabled title="Só Gestão ou Diretoria"'}>Congelar v1</button>`}<button class="btn" data-act="remanejar" ${can('remanejar')&&S.t.frozen?'':'disabled'}>Remanejar saldo</button><button class="btn" data-act="sync-novo" ${can('congelar')?'':'disabled title="Só Gestão ou Diretoria"'}>Atualizar pela planilha</button></div></div>
  <div class="toolbar"><input class="search" id="q" placeholder="Buscar código ou descrição…" value="${esc(S.q)}"><span class="sub">${S.D.items.length} itens · soma do licitado ${brl(X.venda)}${S.D.relatorio?.diferenca_contrato?` · difere do contrato em ${brl(S.D.relatorio.diferenca_contrato)}`:''}</span></div>
  <div class="tw"><table class="tbl"><thead><tr><th>Código</th><th>Descrição</th><th class="r">Licitado</th><th class="r">Meta</th><th class="r">Teto</th><th class="r">Comprom.</th><th class="r">Realizado</th><th>Consumo</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
  ${S.t.hist.length?`<div class="sub" style="margin-top:10px">Histórico da linha de base: ${S.t.hist.map(h=>`${h.fora?'sem versão nova':'v'+h.versao} (${esc(h.motivo)})`).join(' · ')}</div>`:''}`;
}
function modalItem(cod){
  const i=S.byCod[cod],s=S.sd[cod];
  const ocs=S.t.ocs.filter(o=>itensDe(o).includes(cod));const rat=S.t.notas.flatMap(n=>n.rateio.filter(l=>l.item===cod).map(l=>({n,l})));
  modal(`<h3>${cod} <span class="mut">${esc(i.unidade||'')}</span></h3><div class="sub">${esc(i.descricao)}</div>
   <div class="kpi4"><div><div class="k-l">Meta</div><div class="v">${brl(i.meta_total)}</div></div><div><div class="k-l">Teto</div><div class="v ${i.meta_total>i.teto_total?'neg':''}">${brl(i.teto_total)}</div></div><div><div class="k-l">Comprometido</div><div class="v">${brl(s.comp)}</div></div><div><div class="k-l">Saldo livre</div><div class="v ${s.livre<0?'neg':''}">${brl(s.livre)}</div></div></div>
   <div class="sub" style="margin-top:10px">Pacote ${i.pacote||'—'} · evento ${i.evento||'—'} · natureza ${i.nat} · fonte da meta: ${esc(i.fonte_meta||'—')} · ${esc(i.status_cotacao||'')}</div>
   ${ocs.length?`<div class="panel-t" style="margin-top:14px">Pedidos</div>${ocs.map(o=>`<div class="sub">${o.num} · ${esc(o.forn)} · ${ocMulti(o)?brl(linhasDe(o).filter(l=>l.item===cod).reduce((s,l)=>s+ +l.valor,0))+' deste item (pedido de '+brl(o.valor)+')':brl(o.valor)} · ${o.status}</div>`).join('')}`:''}
   ${rat.length?`<div class="panel-t" style="margin-top:14px">Notas rateadas</div>${rat.map(x=>`<div class="sub">${x.n.num} · ${esc(x.n.emitente)} · ${brl(x.l.valor)}</div>`).join('')}`:''}
   <div class="acts"><button class="btn" data-act="fechar">Fechar</button>${typeof metaBotoes==='function'?metaBotoes('item',cod):''}<button class="btn dark" data-act="nova-sol" data-item="${cod}" ${can('solicitar')?'':'disabled title="Só Engenheiro ou Gerente"'}>Solicitar compra</button></div>`);
}
function modalRemanejar(){
  modal(`<h3>Remanejar saldo entre itens</h3><div class="sub">Tira meta de um item e coloca em outro. O total da obra não muda; gera nova versão da linha de base com antes e depois.</div>
   <label>De (item)</label><select id="rm-de">${itemOptions()}</select><label>Para (item)</label><select id="rm-para">${itemOptions()}</select>
   <div class="g2"><div><label>Valor (R$)</label><input id="rm-v" type="number" step="0.01" min="0.01"></div><div><label>Motivo</label><input id="rm-m" placeholder="obrigatório"></div></div><div id="rm-msg" class="sub" style="margin-top:8px"></div>
   <div class="acts"><button class="btn" data-act="fechar">Cancelar</button><button class="btn dark" data-act="rm-ok">Aprovar remanejamento</button></div>`);
}
function doRemanejar(){
  const de=$('#rm-de').value,pa=$('#rm-para').value,v=r2($('#rm-v').value),m=$('#rm-m').value.trim(),msg=$('#rm-msg');
  const err=t=>{msg.innerHTML=`<span class="neg">${t}</span>`};
  if(de===pa)return err('Escolha itens diferentes.');if(!(v>0))return err('Informe o valor.');if(!m)return err('Motivo obrigatório.');
  const a=S.byCod[de],b=S.byCod[pa],sa=S.sd[de];
  if(a.meta_total-v<sa.comp+sa.real)return err('O item de origem não tem saldo livre suficiente ('+brl(sa.livre)+').');
  const t0=S.D.items.reduce((s,i)=>s+i.meta_total,0),mu0={[de]:a.meta_unit,[pa]:b.meta_unit};
  log('item_eap',de,'meta_total',a.meta_total,r2(a.meta_total-v),m);log('item_eap',pa,'meta_total',b.meta_total,r2(b.meta_total+v),m);
  S.t.metaOv[de]=r2(a.meta_total-v);S.t.metaOv[pa]=r2(b.meta_total+v);S.t.versao++;S.t.hist.push({versao:S.t.versao,motivo:`${de} → ${pa} ${brl(v)}: ${m}`,quando:new Date().toISOString(),quem:user()});
  prep();const X=derive();if(Math.abs(X.meta-t0)>0.01)console.warn('total mudou');
  /* calc_v2 [SUPOSIÇÃO, plano M1]: meta_unit acompanha o remanejamento (prep() recalcula); o antes e depois vai para a auditoria */
  if(calcV2(S.t))[de,pa].forEach(c=>{if(mu0[c]!==S.byCod[c].meta_unit)log('item_eap',c,'meta_unit',mu0[c],S.byCod[c].meta_unit,m)});
  save();closeModal();toast('Remanejado · linha de base v'+S.t.versao);render();
}

