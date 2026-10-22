/* ============ PAINEL DE CONTRATOS / OBRA (Fase 13) ============ */
/* Painel de Contratos da obra, calculado dos registros do sistema (+ lançamentos importados). */
const mesCorr=()=>mesDe(hojeISO());
const lfxDe=tp=>S.t.lfxs.filter(l=>l.tipo===tp&&!l.detalhe);
const natDe=()=>S.t.lfxs.filter(l=>l.tipo==='nat');
const nSum=(L,k)=>r2(L.reduce((s,x)=>s+(+x[k]||0),0));
const provLigada=()=>S.provTmp!==undefined?S.provTmp:provPref();
function vencNota(n){const t=S.t.titulos.find(x=>x.oc&&x.oc===n.oc&&!x.cancelado);return t?t.venc:addDias(n.emissao||hojeISO(),30)}
function painelCalc(){return memo('pc',painelCalcRaw)}
function painelCalcRaw(){
  const T=S.t,h=hojeISO(),O=S.D.obra,X=S.X||derive(),contrato=O.valor_contrato||X.venda,trib=O.tributos_nota||0;
  const NT=natDe(),NG=NT.filter(x=>!x.foraGasto),fats=T.fats,recs=T.recs,fat=r2(fats.reduce((s,f)=>s+f.valor,0)+nSum(NT,'fat'));
  const faturadoAnt=r2(fats.filter(f=>mesDe(f.emissao)<mesCorr()).reduce((s,f)=>s+f.valor,0));
  const recebido=r2(recs.reduce((s,r)=>s+r.valor,0)+nSum(NT,'rec')),aReceber=r2(fats.reduce((s,f)=>s+fatSaldo(f),0)+nSum(NT,'areceber'));
  const atrRec=r2(fats.filter(f=>f.venc<h).reduce((s,f)=>s+fatSaldo(f),0)+nSum(NT,'atrasoRec'));
  const fatDireto=r2(fats.filter(f=>f.fatDireto).reduce((s,f)=>s+f.valor,0)+T.notas.filter(n=>n.fatDireto&&n.status!=='lancada').reduce((s,n)=>s+n.valor,0)+lfxDe('gasto').filter(l=>l.fatDireto).reduce((s,l)=>s+l.valor,0));
  const impDeb=r2(fat*trib+nSum(NT,'impD')),impCred=nSum(NT,'impC');
  const nt=T.notas.filter(n=>n.status!=='lancada'),npg=nt.filter(n=>n.status==='paga'),nab=nt.filter(n=>n.status!=='paga');
  const lg=lfxDe('gasto');
  const pago=r2(npg.reduce((s,n)=>s+n.valor,0)+lg.filter(l=>l.pago).reduce((s,l)=>s+l.valor,0)+nSum(NG,'pago'));
  const atrasado=r2(nab.filter(n=>vencNota(n)<h).reduce((s,n)=>s+n.valor,0)+lg.filter(l=>!l.pago&&l.venc<h).reduce((s,l)=>s+l.valor,0)+nSum(NG,'atrasado'));
  const aPagar=r2(nab.filter(n=>vencNota(n)>=h).reduce((s,n)=>s+n.valor,0)+lg.filter(l=>!l.pago&&l.venc>=h).reduce((s,l)=>s+l.valor,0)+nSum(NG,'aPagar'));
  const gasto=r2(pago+atrasado+aPagar);
  const requisicao=r2(T.sols.filter(s=>['enviada','em_cotacao','cotada'].includes(s.status)).reduce((s,x)=>s+x.qtd*x.preco,0)+nSum(NG,'req'));
  const cfReal=r2(T.notas.filter(n=>n.status!=='lancada').reduce((s,n)=>s+n.rateio.filter(l=>l.nat==='ADM').reduce((a,l)=>a+ +l.valor,0),0)+lfxDe('custo_fixo').reduce((s,l)=>s+l.valor,0));
  const cfPrev=r2(contrato*((T.par.cfPrevPct==null?5:+T.par.cfPrevPct)/100));
  const custoFixo=Math.max(cfReal,0),provTot=r2(X.comp+lfxDe('provisao').reduce((s,l)=>s+l.valor,0)+nSum(NT,'prov')),prov=provLigada()?provTot:0;
  const servRe=/LOCA[CÇ]|PRESTADOR|M[AÃ]O DE OBRA|TERCEIR/i,pServ0=r2(NT.filter(n=>servRe.test(n.nome)).reduce((s,n)=>s+(+n.prov||0),0)+provOcsSplit(T).serv),provServ=provLigada()?Math.min(provTot,pServ0):0,provProd=r2(prov-provServ);
  const saldoFat=r2(contrato-fat);
  const comprom=r2(gasto+custoFixo+prov);
  const lucro=r2(contrato*(1-trib)-comprom);          // projetado com o que já está comprometido
  const lucroReal=r2(fat*(1-trib)-gasto-custoFixo);
  const lucroPainel=r2(fat*(1-trib)-gasto-custoFixo-prov),lucroPrev=r2(fat*(1-trib)-gasto-Math.max(custoFixo,cfPrev)-prov);   // realizado: só o faturado contra o gasto
  return {contrato,fat,faturadoAnt,recebido,aReceber,atrRec,fatDireto,impDeb,impCred,pago,aPagar,atrasado,gasto,requisicao,custoFixo,cfPrev,
    pctCF:contrato?custoFixo/contrato:0,prov,saldoFat,comprom,lucro,lucroReal,lucroPainel,lucroPrev,provTot,provProd,provServ,pctLucro:contrato?lucro/contrato:0,trib}}
const PAINEL_DICA={contrato:'Valor do contrato da obra.',fat:'Soma das NFs de serviço emitidas (boletins aprovados e faturados).',
 gasto:'Pago + a pagar + atrasado: notas rateadas/conferidas/pagas e lançamentos importados do tipo gasto. Atrasado = vencimento no passado e sem pagamento.',
 requisicao:'Solicitações de compra ainda sem pedido aprovado (preço × quantidade).',custoFixo:'Natureza indireta (ADM) rateada nas notas + lançamentos de custo fixo importados.',
 prov:'Comprometido: pedidos aprovados ainda sem nota + provisões importadas.',saldoFat:'Contrato − faturado.',lucro:'Contrato líquido de tributos − (gasto + custo fixo + provisão). É projeção; o realizado aparece ao lado.',impDeb:'Estimativa: faturado × tributos sobre a nota do contrato. Apuração completa na Fase 14.'};
const kv=(l,v,o={})=>`<div class="pk ${o.cls||''} ${o.k?'clk':''}" ${o.k?`data-act="pc-det" data-k="${o.k}"`:''} ${o.tip?`title="${esc(o.tip)}"`:''}><div class="k-l">${l}</div><div class="v ${o.neg&&v<0?'neg':''}">${brl(v)}</div>${o.sub?`<div class="mut" style="font-size:11.5px">${o.sub}</div>`:''}</div>`;
function svgBarrasContrato(c){
  const W=560,H=250,P=30,mx=Math.max(c.contrato,c.comprom,1)*1.08,y=v=>H-P-(v/mx)*(H-2*P),bw=70;
  const stack=[['Gasto',c.gasto,'var(--info)'],['Custo fixo',c.custoFixo,'var(--warn)'],['Provisão',c.prov,'var(--bad)']];
  let acc=0,seg='';stack.forEach(([n,v,col])=>{const y1=y(acc+v),y0=y(acc);seg+=`<rect x="${W*.5-bw/2}" y="${y1}" width="${bw}" height="${Math.max(0,y0-y1)}" fill="${col}"><title>${n}: ${brl(v)}</title></rect>`;acc+=v});
  const lx=W*.82,ly=y(Math.max(0,c.lucro)),lh=Math.abs(y(c.lucro)-y(0));
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;height:auto" role="img" aria-label="Contrato, custos empilhados e lucro">
   <line x1="${P}" x2="${W-P}" y1="${H-P}" y2="${H-P}" stroke="var(--line)"/>
   <rect x="${W*.18-bw/2}" y="${y(c.contrato)}" width="${bw}" height="${H-P-y(c.contrato)}" fill="var(--ink-4,#9aa)"><title>Contrato ${brl(c.contrato)}</title></rect>
   ${seg}
   <rect x="${lx-bw/2}" y="${c.lucro>=0?ly:y(0)}" width="${bw}" height="${Math.max(2,lh)}" fill="${c.lucro>=0?'var(--ok)':'var(--bad)'}"><title>Lucro ${brl(c.lucro)}</title></rect>
   <text x="${W*.18}" y="${H-10}" text-anchor="middle" font-size="11" fill="var(--ink-3)">Contrato</text><text x="${W*.5}" y="${H-10}" text-anchor="middle" font-size="11" fill="var(--ink-3)">Custos</text><text x="${lx}" y="${H-10}" text-anchor="middle" font-size="11" fill="var(--ink-3)">Lucro</text>
   <text x="${W*.18}" y="${y(c.contrato)-6}" text-anchor="middle" font-size="11" fill="var(--ink-2)">${brl(c.contrato,true)}</text><text x="${W*.5}" y="${y(c.comprom)-6}" text-anchor="middle" font-size="11" fill="var(--ink-2)">${brl(c.comprom,true)}</text><text x="${lx}" y="${(c.lucro>=0?ly:y(0)+lh)+(c.lucro>=0?-6:14)}" text-anchor="middle" font-size="11" fill="var(--ink-2)">${brl(c.lucro,true)}</text></svg>
   <div class="legend">${stack.map(([n,,col])=>`<span><i style="background:${col}"></i>${n}</span>`).join('')}</div>`}
function curvaS(){
  const ms=new Set([mesCorr()]);S.t.meds.forEach(m=>ms.add(mesDe(m.periodo)));S.t.fats.forEach(f=>ms.add(mesDe(f.emissao)));S.t.notas.forEach(n=>n.status!=='lancada'&&ms.add(mesDe(n.emissao)));
  const L=[...ms].filter(Boolean).sort();if(L.length<2)L.unshift(addMes(L[0],-1));
  const c={medido:0,fat:0,custo:0};return L.map(m=>{c.medido+=S.t.meds.filter(x=>x.status==='atestada'&&mesDe(x.periodo)===m).reduce((s,x)=>s+medValor(x),0);
    c.fat+=S.t.fats.filter(f=>mesDe(f.emissao)===m).reduce((s,f)=>s+f.valor,0);
    c.custo+=S.t.notas.filter(n=>n.status!=='lancada'&&mesDe(n.emissao)===m).reduce((s,n)=>s+n.valor,0);return {m,...c}}).filter(x=>{const M=typeof mesesPeriodo==='function'?mesesPeriodo():null;return !M||M.has(x.m)})}
function svgCurvaS(r){
  const W=560,H=210,P=28,mx=Math.max(1,...r.map(x=>Math.max(x.medido,x.fat,x.custo))),X=i=>P+i*(W-2*P)/Math.max(1,r.length-1),Y=v=>H-P-(v/mx)*(H-2*P);
  const ln=(k,col)=>`<polyline fill="none" stroke="${col}" stroke-width="2" points="${r.map((x,i)=>X(i)+','+Y(x[k])).join(' ')}"/>`+r.map((x,i)=>`<circle cx="${X(i)}" cy="${Y(x[k])}" r="3" fill="${col}"><title>${fmes(x.m)} · ${k}: ${brl(x[k])}</title></circle>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;height:auto" role="img" aria-label="Curva S acumulada">${ln('medido','var(--info)')}${ln('fat','var(--ok)')}${ln('custo','var(--bad)')}${r.map((x,i)=>`<text x="${X(i)}" y="${H-8}" text-anchor="middle" font-size="10" fill="var(--ink-3)">${fmes(x.m)}</text>`).join('')}</svg>
   <div class="legend"><span><i style="background:var(--info)"></i>Medido (atestado)</span><span><i style="background:var(--ok)"></i>Faturado</span><span><i style="background:var(--bad)"></i>Custo (notas)</span></div>`}
function painelContrato(X){
  const c=painelCalc(),O=S.D.obra,sf=(v,l)=>({tip:PAINEL_DICA[l]});
  const totI=S.D.items.length,semMeta=S.D.items.filter(i=>!i.meta_total).length;
  const idc=(()=>{let cm=0,va=0;S.D.items.forEach(i=>{const r=resItem(i);cm+=r.real;va+=r.va});return cm>0?va/cm:null})();
  const sem=(ok,warn)=>ok?'ok':warn?'warn':'bad';
  const desv=[...S.D.items].map(i=>({i,v:S.sd[i.codigo].comp+S.sd[i.codigo].real-i.meta_total})).filter(x=>x.v>0).sort((a,b)=>b.v-a.v).slice(0,6);
  const nat={};S.D.items.forEach(i=>{nat[i.nat]=nat[i.nat]||{meta:0,real:0};nat[i.nat].meta+=i.meta_total;nat[i.nat].real+=S.sd[i.codigo].comp+S.sd[i.codigo].real});
  const alerts=[];if(c.atrasado>0)alerts.push(['bad','Gasto atrasado',brl(c.atrasado)]);if(c.atrRec>0)alerts.push(['bad','NF vencida a receber',brl(c.atrRec)]);if(c.lucro<0)alerts.push(['bad','Lucro projetado negativo',brl(c.lucro)]);
  if(X.semFolga.length)alerts.push(['warn','Itens com meta acima do teto',String(X.semFolga.length)]);if(semMeta)alerts.push(['warn','Itens sem meta de custo',semMeta+' de '+totI]);
  const bar=(v,m)=>m>0?`<div class="bar"><i class="b" style="width:${Math.min(100,v/m*100)}%"></i></div>`:'<span class="mut">sem meta</span>';
  return `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px"><span class="mut" style="font-size:12px">Período da Curva S e do caixa</span>${barraFiltros()}</div><div class="sub" style="margin-top:6px">${esc(O.contratante)} · contrato ${esc(O.contrato)} · <b>${esc(O.codigo)}</b> ${esc(O.nome)}. Passe o mouse sobre um valor para ver como foi calculado.</div>
  <div class="pgrid">
   ${kv('Contrato',c.contrato,{...sf(0,'contrato'),cls:'big'})}
   ${kv('Faturado',c.fat,{k:'fat',...sf(0,'fat'),sub:'anteriores '+brl(c.faturadoAnt)})}${kv('Recebido',c.recebido,{k:'recebido'})}${kv('A receber',c.aReceber,{k:'aReceber'})}${kv('Atrasado (a receber)',c.atrRec,{k:'atrRec',neg:0,cls:c.atrRec>0?'bad':''})}
   ${kv('Fat. direto',c.fatDireto,{tip:'Faturamento direto: pago pelo cliente ao fornecedor (marque na NF).'})}
   ${kv('Impostos (débito)',c.impDeb,{...sf(0,'impDeb')})}${kv('Impostos (crédito)',c.impCred,{tip:'Créditos de impostos entram na apuração da Fase 14.'})}
   ${kv('Gasto',c.gasto,{k:'gasto',...sf(0,'gasto'),cls:'big'})}${kv('Gasto pago',c.pago,{k:'pago'})}${kv('Gasto a pagar',c.aPagar,{k:'aPagar'})}${kv('Gasto atrasado',c.atrasado,{k:'atrasado',cls:c.atrasado>0?'bad':''})}${kv('Requisição',c.requisicao,{k:'requisicao',...sf(0,'requisicao')})}
   ${kv('Custo fixo',c.custoFixo,{k:'custoFixo',...sf(0,'custoFixo'),sub:(c.pctCF*100).toFixed(2).replace('.',',')+' % do contrato · previsto '+brl(c.cfPrev)})}
   ${kv('Prov. gasto',c.prov,{k:'prov',...sf(0,'prov')})}${kv('Saldo a faturar',c.saldoFat,{...sf(0,'saldoFat')})}
   ${kv('Lucro (projetado)',c.lucro,{...sf(0,'lucro'),neg:1,cls:'big '+(c.lucro<0?'bad':''),sub:(c.pctLucro*100).toFixed(2).replace('.',',')+' % · realizado '+brl(c.lucroReal)})}
  </div>
  <div class="cols" style="margin-top:14px"><div class="card"><div class="in"><div class="panel-t">Contrato × custos × lucro</div>${svgBarrasContrato(c)}</div></div>
   <div class="card"><div class="in"><div class="panel-t">Curva S acumulada</div>${svgCurvaS(curvaS())}</div></div></div>
  <div class="cols" style="margin-top:14px"><div class="card"><div class="in"><div class="panel-t">Saúde da obra</div>
    <div class="row" style="grid-template-columns:1fr auto"><div><h4>IDC (valor agregado ÷ custo)</h4></div><span class="pill ${idc==null?'mute':sem(idc>=.95,idc>=.9)}">${idc==null?'0,00':idc.toFixed(2).replace('.',',')}</span></div>
    <div class="row" style="grid-template-columns:1fr auto"><div><h4>Margem projetada</h4></div><span class="pill ${sem(c.pctLucro>=.05,c.pctLucro>=0)}">${(c.pctLucro*100).toFixed(1).replace('.',',')} %</span></div>
    <div class="row" style="grid-template-columns:1fr auto"><div><h4>Comprometido ÷ contrato</h4></div><span class="pill ${sem(c.comprom/c.contrato<=.85,c.comprom/c.contrato<=1)}">${(c.comprom/c.contrato*100).toFixed(1).replace('.',',')} %</span></div>
    <div class="row" style="grid-template-columns:1fr auto"><div><h4>Caixa da obra (recebido − pago)</h4></div><span class="pill ${c.recebido-c.pago>=0?'ok':'bad'}">${brl(c.recebido-c.pago,true)}</span></div></div></div>
   <div class="card"><div class="in"><div class="panel-t">Alertas</div>${alerts.length?alerts.map(a=>`<div class="row" style="grid-template-columns:1fr auto"><div><h4>${a[1]}</h4></div><span class="pill ${a[0]}">${a[2]}</span></div>`).join(''):'<div class="sub">Nenhum alerta.</div>'}</div></div></div>
  <div class="cols" style="margin-top:14px"><div class="card"><div class="in"><div class="panel-t">Maiores desvios (acima da meta)</div>${desv.length?`<table class="tbl"><tbody>${desv.map(x=>`<tr class="clk" data-item="${x.i.codigo}"><td class="mono">${x.i.codigo}</td><td>${esc(x.i.descricao.slice(0,50))}</td><td class="r neg">+${brl(x.v)}</td></tr>`).join('')}</tbody></table>`:'<div class="sub">Nenhum item acima da meta.</div>'}</div></div>
   <div class="card"><div class="in"><div class="panel-t">Custo por natureza (meta × usado)</div><table class="tbl"><tbody>${Object.entries(nat).map(([k,v])=>`<tr><td>${NATNOME[k]||k}</td><td class="r">${brl(v.real,true)} / ${brl(v.meta,true)}</td><td style="width:90px">${bar(v.real,v.meta)}</td></tr>`).join('')}</tbody></table></div></div></div>
  <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="pc-csv">Copiar números (CSV)</button><button class="btn" data-act="pc-conf">Conferir os números</button></div>
  ${consumoView()}${pessoalView()}${carteiraView()}
  <div class="sub" style="margin-top:8px">A obra ${esc(O.codigo)} mostra o que foi lançado aqui. Para trazer histórico financeiro de planilhas, use a aba <b>Importar</b> (CSV).</div>`}
ACOES['pc-csv']=()=>{const c=painelCalc(),t='indicador;valor\n'+Object.entries({contrato:c.contrato,faturado:c.fat,recebido:c.recebido,a_receber:c.aReceber,atrasado_receber:c.atrRec,fat_direto:c.fatDireto,impostos_debito:c.impDeb,gasto:c.gasto,gasto_pago:c.pago,gasto_a_pagar:c.aPagar,gasto_atrasado:c.atrasado,requisicao:c.requisicao,custo_fixo:c.custoFixo,prov_gasto:c.prov,saldo_a_faturar:c.saldoFat,lucro:c.lucro}).map(([k,v])=>k+';'+String(v).replace('.',',')).join('\n');
  try{navigator.clipboard.writeText(t).then(()=>toast('Copiado'),()=>toast('Não consegui copiar'))}catch(e){toast('Não consegui copiar')}};
ACOES['pc-conf']=()=>{S.tab.pain='conf';render()};

/* ---------- Conferência interna (o sistema confere os próprios números) ---------- */
function confChecks(){const c=painelCalc(),X=S.X||derive(),T=S.t,nt=T.notas.filter(n=>n.status!=='lancada'),
  rat=r2(nt.reduce((s,n)=>s+n.rateio.reduce((a,l)=>a+ +l.valor,0),0)),vnt=r2(nt.reduce((s,n)=>s+n.valor,0));
  return [
  {t:'Contrato × venda da EAP',a:['Contrato',c.contrato],b:['Soma da venda da EAP',X.venda],causa:'O valor do contrato cadastrado difere da soma dos itens vendidos na EAP.'},
  {t:'Notas × rateio',a:['Valor das notas',vnt],b:['Total rateado nos itens',rat],causa:'Há nota sem rateio de 100 % nos itens da EAP.'},
  {t:'Gasto lançado × realizado na EAP',a:['Gasto (pago + a pagar + atrasado)',c.gasto],b:['Realizado na EAP',X.real],causa:'Há lançamento importado sem item da EAP, ou nota sem rateio.'},
  {t:'Faturado × recebido + a receber',a:['Faturado',c.fat],b:['Recebido + a receber',r2(c.recebido+c.aReceber)],causa:'Recebimento registrado sem fatura, ou fatura sem saldo calculado.'},
  {t:'Gasto = pago + a pagar + atrasado',a:['Gasto',c.gasto],b:['Soma das três faixas',r2(c.pago+c.aPagar+c.atrasado)],causa:'Nota com vencimento ou situação inconsistente.'},
  {t:'Comprometido dentro do teto',a:['Gasto + custo fixo + provisão',c.comprom],b:['Teto da EAP',X.teto],modo:'max',causa:'O comprometido passou do teto: revise pedidos e rateios por item.'}]}
function confView(){
  const L=confChecks().map(x=>{const d=r2(x.a[1]-x.b[1]),ok=x.modo==='max'?d<=1:Math.abs(d)<=1;return {...x,d,ok}}),dif=L.filter(x=>!x.ok).length;
  const rows=L.map(x=>`<tr><td>${x.t}</td><td class="r">${brl(x.a[1])}<div class="mut" style="font-size:11px">${x.a[0]}</div></td><td class="r">${brl(x.b[1])}<div class="mut" style="font-size:11px">${x.b[0]}</div></td><td class="r ${x.ok?'':'neg'}">${brl(x.d)}</td><td>${x.ok?'<span class="pill ok">bate</span>':'<span class="pill bad">difere</span>'}</td><td class="mut" style="font-size:12px">${x.ok?'':x.causa}</td></tr>`).join('');
  return `<div class="sub">O sistema confere os próprios números da obra <b>${esc(S.D.obra.codigo)}</b>: contrato, EAP, notas, rateio, financeiro e teto. Nada precisa ser digitado.</div>
  <div class="kpi4"><div><div class="k-l">Verificações</div><div class="v">${L.length}</div></div><div><div class="k-l">Batem</div><div class="v">${L.length-dif}</div></div><div><div class="k-l">Diferem</div><div class="v ${dif?'neg':''}">${dif}</div></div><div><div class="k-l">Tolerância</div><div class="v">R$ 1,00</div></div></div>
  <div class="tw"><table class="tbl"><thead><tr><th>Verificação</th><th class="r">Valor A</th><th class="r">Valor B</th><th class="r">Diferença</th><th>Resultado</th><th>Causa provável</th></tr></thead><tbody>${rows}</tbody></table></div>`}

/* ---------- Importar lançamentos do financeiro (CSV) ---------- */
/* Colunas: tipo;numero;fornecedor;descricao;vencimento;valor;pago_em;fat_direto  (tipo: gasto | custo_fixo | provisao). Datas dd/mm/aaaa ou aaaa-mm-dd; valores 1.234,56. */
const numBR=s=>{s=String(s||'').trim().replace(/[R$\s]/g,'');if(!s)return 0;return s.includes(',')?+s.replace(/\./g,'').replace(',','.'):+s};
const dataImp=s=>{s=String(s||'').trim();const m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?`${m[3]}-${m[2]}-${m[1]}`:/^\d{4}-\d{2}-\d{2}$/.test(s)?s:''};
function lfxParse(txt){const out=[],erros=[];String(txt||'').replace(/^﻿/,'').split(/\r?\n/).forEach((ln,i)=>{if(!ln.trim())return;const c=ln.split(';').map(x=>x.trim());
  if(i===0&&/^tipo$/i.test(c[0]))return;const tp=(c[0]||'').toLowerCase();
  if(!['gasto','custo_fixo','provisao'].includes(tp))return erros.push(`Linha ${i+1}: tipo "${c[0]}" inválido (use gasto, custo_fixo ou provisao)`);
  const v=numBR(c[5]),venc=dataImp(c[4]);if(!(v>0))return erros.push(`Linha ${i+1}: valor inválido`);if(!venc)return erros.push(`Linha ${i+1}: vencimento inválido`);
  out.push({tipo:tp,numero:c[1]||'',forn:c[2]||'',desc:c[3]||'',venc,valor:r2(v),pago:dataImp(c[6])||'',fatDireto:/^(1|s|sim|x)$/i.test(c[7]||'')})});return {out,erros}}
const lfxChave=l=>[l.tipo,l.numero,l.forn.toLowerCase(),l.venc,l.valor].join('|');
function lfxImportar(){const r=lfxParse($('#lf-csv').value),ja=new Set(S.t.lfxs.map(lfxChave));
  if(!r.out.length&&r.erros.length)return toast(r.erros[0]);
  const novos=r.out.filter(l=>!ja.has(lfxChave(l)));const lote='L'+Date.now();
  novos.forEach(l=>S.t.lfxs.push({id:'lfx'+Date.now()+Math.random().toString(36).slice(2,6),origem:'Importado',lote,...l}));
  log('lancamentos_importados',lote,'importar','',novos.length+' novos, '+(r.out.length-novos.length)+' repetidos ignorados'+(r.erros.length?', '+r.erros.length+' linhas com erro':''));
  save();toast(novos.length+' lançamentos importados, '+(r.out.length-novos.length)+' repetidos ignorados'+(r.erros.length?', '+r.erros.length+' com erro':''));S.lfxErros=r.erros;render()}
function lfxDesfazer(){const ult=S.t.lfxs[S.t.lfxs.length-1];if(!ult)return toast('Nada para desfazer');const n=S.t.lfxs.filter(l=>l.lote===ult.lote).length;
  S.t.lfxs=S.t.lfxs.filter(l=>l.lote!==ult.lote);log('lancamentos_importados',ult.lote,'desfazer','',n+' removidos');save();toast(n+' lançamentos do último lote removidos');render()}
ACOES['lf-imp']=()=>{if(!can('lan'))return toast('Só Financeiro importa lançamentos');lfxImportar()};ACOES['lf-undo']=()=>{if(!can('lan'))return toast('Só Financeiro desfaz importação');lfxDesfazer()};
function impViewBase(){const L=S.t.lfxs.filter(l=>!l.detalhe&&l.tipo!=='nat');
  return `<div class="sub">Traga para cá o histórico financeiro de planilhas ou de outros controles. Colunas separadas por ponto e vírgula: <span class="mono">tipo;numero;fornecedor;descricao;vencimento;valor;pago_em;fat_direto</span>. Tipo: <b>gasto</b>, <b>custo_fixo</b> ou <b>provisao</b>. Deixe <span class="mono">pago_em</span> vazio para títulos em aberto. Linhas repetidas (mesmo tipo, número, fornecedor, vencimento e valor) são ignoradas.</div>
  <textarea id="lf-csv" rows="6" placeholder="gasto;123;Fornecedor X;Cimento;25/11/2026;2.011,26;;&#10;provisao;;Folha;Provisão de mão de obra;30/11/2026;126.731,81;;"></textarea>
  <div style="margin-top:8px;display:flex;gap:8px"><button class="btn dark" data-act="lf-imp" ${can('lan')?'':'disabled title="Só Financeiro"'}>Importar</button><button class="btn" data-act="lf-undo" ${can('lan')&&L.length?'':'disabled'}>Desfazer último lote</button></div>
  ${(S.lfxErros||[]).length?`<div class="err" style="margin-top:8px">${S.lfxErros.slice(0,5).map(esc).join('<br>')}</div>`:''}
  ${L.length?`<div class="tw"><table class="tbl"><thead><tr><th>Tipo</th><th>Nº</th><th>Fornecedor</th><th>Vencimento</th><th class="r">Valor</th><th>Situação</th></tr></thead><tbody>${L.slice(-30).map(l=>`<tr><td>${l.tipo}${l.fatDireto?' · fat. direto':''}</td><td class="mono">${esc(l.numero)}</td><td>${esc(l.forn)}</td><td>${fdata(l.venc)}</td><td class="r">${brl(l.valor)}</td><td>${l.tipo==='gasto'?(l.pago?'pago '+fdata(l.pago):l.venc<hojeISO()?'<span class="neg">atrasado</span>':'a pagar'):'—'}</td></tr>`).join('')}</tbody></table></div>`:''}`}

/* ---------- drill-down: lista que compõe cada número ---------- */
function painelLinhas(k){const T=S.t,h=hojeISO(),R=[],add=(ref,desc,valor,data)=>R.push({ref,desc,valor:r2(valor),data});
  const nt=T.notas.filter(n=>n.status!=='lancada'),lg=lfxDe('gasto');
  const nota=n=>add(n.num,n.emitente+(n.status==='paga'?' · paga':''),n.valor,n.status==='paga'?n.pago:vencNota(n)),lf=l=>add('Importado '+(l.numero||''),l.forn+' · '+l.desc,l.valor,l.pago||l.venc);
  if(k==='fat')T.fats.forEach(f=>add(f.num,f.bcNum,f.valor,f.emissao));
  if(k==='recebido')T.recs.forEach(r=>add(r.id,'Recebimento',r.valor,r.data));
  if(k==='aReceber')T.fats.filter(f=>fatSaldo(f)>0).forEach(f=>add(f.num,'saldo a receber',fatSaldo(f),f.venc));
  if(k==='atrRec')T.fats.filter(f=>fatSaldo(f)>0&&f.venc<h).forEach(f=>add(f.num,'vencida',fatSaldo(f),f.venc));
  if(k==='pago'){nt.filter(n=>n.status==='paga').forEach(nota);lg.filter(l=>l.pago).forEach(lf)}
  if(k==='atrasado'){nt.filter(n=>n.status!=='paga'&&vencNota(n)<h).forEach(nota);lg.filter(l=>!l.pago&&l.venc<h).forEach(lf)}
  if(k==='aPagar'){nt.filter(n=>n.status!=='paga'&&vencNota(n)>=h).forEach(nota);lg.filter(l=>!l.pago&&l.venc>=h).forEach(lf)}
  if(k==='gasto'){nt.forEach(nota);lg.forEach(lf)}
  if(k==='requisicao')T.sols.filter(s=>['enviada','em_cotacao','cotada'].includes(s.status)).forEach(s=>add(s.num,s.desc,s.qtd*s.preco,s.data));
  if(k==='custoFixo'){nt.forEach(n=>{const v=n.rateio.filter(l=>l.nat==='ADM').reduce((a,l)=>a+ +l.valor,0);if(v)add(n.num,n.emitente+' (rateio ADM)',v,n.emissao)});lfxDe('custo_fixo').forEach(lf)}
  if(k==='prov'){T.ocs.filter(o=>['aprovada','recebida_parcial','recebida'].includes(o.status)).forEach(o=>{const f=T.notas.filter(n=>n.oc===o.id&&n.status!=='lancada').reduce((s,n)=>s+n.rateio.filter(l=>l.item===o.item).reduce((a,l)=>a+ +l.valor,0),0),v=Math.max(0,o.valor-f);if(v)add(o.num,o.forn+' · pedido sem nota',v,o.data)});lfxDe('provisao').forEach(lf)}
  return R}
ACOES['pc-det']=el=>{const k=el.dataset.k,R=painelLinhas(k),tot=r2(R.reduce((s,x)=>s+x.valor,0));
  modal(`<h3>Composição · ${esc(k)}</h3><div class="sub">${R.length} registros · total ${brl(tot)}</div>${R.length?`<div class="tw"><table class="tbl"><tbody>${R.map(x=>`<tr><td class="mono">${esc(x.ref)}</td><td>${esc(x.desc)}</td><td>${fdata(x.data)}</td><td class="r">${brl(x.valor)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Nada compõe este número.</div>'}<div class="acts"><button class="btn" data-act="fechar">Fechar</button></div>`)};

/* ---------- comparativo da carteira (342, 343, 281) ---------- */
S.cart=S.cart||{};
async function cartCarrega(){for(const [cod] of OBRAS_PADRAO){if(S.cart[cod])continue;try{const d=await obraData(cod);S.cart[cod]={contrato:d.obra.valor_contrato,trib:d.obra.tributos_nota,nome:d.obra.contratante+' · '+d.obra.nome,obra:d.obra};await extratoDe(cod)}catch(e){S.cart[cod]={contrato:0,trib:0,nome:cod}}}render()}
function cartLinha(cod){const c=S.cart[cod];if(!c)return null;const atual=S.D.obra.codigo===cod;let t=null;
  if(atual)t=S.t;else if(MODO_CH)t=CH.T[cod]||null;else if(!MODO_SB)try{t=JSON.parse(localStorage.getItem(cod==='342'?KEY:KEY+'_'+cod)||'null')}catch(e){}
  if(!t)return {cod,...c,sem:true};
  const nt=(t.notas||[]).filter(n=>n.status!=='lancada'),gasto=r2(nt.reduce((s,n)=>s+n.valor,0)+(t.lfxs||[]).filter(l=>l.tipo==='gasto').reduce((s,l)=>s+l.valor,0)),fat=r2((t.fats||[]).reduce((s,f)=>s+f.valor,0));
  const prov=r2((t.lfxs||[]).filter(l=>l.tipo==='provisao'||l.tipo==='custo_fixo').reduce((s,l)=>s+l.valor,0));
  return {cod,...c,gasto,fat,lucro:r2(c.contrato*(1-c.trib)-gasto-prov)}}
function carteiraView(){const L=OBRAS_PADRAO.map(([c])=>cartLinha(c));if(L.some(x=>!x))setTimeout(cartCarrega,0);
  return `<div class="panel-t" style="margin-top:16px">Carteira de obras</div><div class="tw"><table class="tbl"><thead><tr><th>Obra</th><th class="r">Contrato</th><th class="r">Faturado</th><th class="r">Gasto</th><th class="r">Lucro (proj.)</th></tr></thead><tbody>${L.map((x,k)=>x?`<tr><td><b>${x.cod}</b> ${esc(x.nome)}</td><td class="r">${brl(x.contrato)}</td><td class="r">${x.sem?'—':brl(x.fat)}</td><td class="r">${x.sem?'—':brl(x.gasto)}</td><td class="r ${x.lucro<0?'neg':''}">${x.sem?'<span class="mut">abra a obra</span>':brl(x.lucro)}</td></tr>`:`<tr><td colspan="5">${OBRAS_PADRAO[k][0]} carregando…</td></tr>`).join('')}</tbody></table></div>`}

/* ---------- extrato financeiro por natureza e lançamentos (colar do export) ---------- */
const hdrN=h=>String(h||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const EXT_NAT={cod:'codnatureza',nome:'natureza',fat:'faturado',cr:'codcr',crNome:'centroderesultado',saldoCR:'saldoporcr',rec:'faturadorecebido',areceber:'faturadoareceber',atrasoRec:'faturadoatrasado',gasto:'gasto',pago:'gastopago',aPagar:'gastoapagar',atrasado:'gastoatrasado',req:'gastorequisicao',prov:'provgasto',impD:'impostosdebito',impC:'impostocredito',impF:'impostofinal'};
const EXT_LAN={origemTxt:'origem',rd:'receitadespesa',provTxt:'provisao',nota:'nrnota',empresa:'empresa',parceiro:'parceiro',desdob:'vlrdesdobramento',valorNota:'vlrnota',dtNeg:'dtnegociacao',dtBaixa:'dtbaixa',vendComp:'vendedorcomprador',venc:'dtvencimento',top:'top',topDesc:'descricaotop',tipoMov:'tipomovimento'};
function extParse(txt,mapa,numeros,datas,opc=[]){const L=String(txt||'').replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim());if(L.length<2)return {out:[],erros:['Cole o cabeçalho e ao menos uma linha']};
  const sep=L[0].includes('\t')?'\t':';',H=L[0].split(sep).map(hdrN),ix={},erros=[],out=[];for(const k in mapa){ix[k]=H.indexOf(mapa[k]);if(ix[k]<0&&opc.includes(k)){delete ix[k];continue}if(ix[k]<0)return {out:[],erros:['Falta a coluna "'+mapa[k]+'" no cabeçalho']}}
  L.slice(1).forEach((ln,i)=>{const c=ln.split(sep).map(x=>x.trim()),o={};for(const k in ix){const v=c[ix[k]]||'';o[k]=numeros.includes(k)?r2(numBR(v)):datas.includes(k)?dataImp(v):v}if(!o[Object.keys(mapa)[0]]&&!c.some(x=>x))return;out.push(o)});return {out,erros}}
function extImportar(){if(!can('lan'))return toast('Só Financeiro importa o extrato');const cod=S.D.obra.codigo,txN=$('#ex-nat').value,txL=$('#ex-lan').value;let nN=0,nL=0,erros=[];
  if(txN.trim()){const r=extParse(txN,EXT_NAT,['fat','saldoCR','rec','areceber','atrasoRec','gasto','pago','aPagar','atrasado','req','prov','impD','impC','impF'],[]);erros.push(...r.erros);
    if(r.out.length){S.t.lfxs=S.t.lfxs.filter(l=>l.tipo!=='nat');r.out.filter(o=>o.cod).forEach((o,i)=>{S.t.lfxs.push({id:'nat-'+cod+'-'+Date.now()+'-'+i,tipo:'nat',origem:'Importado',lote:'extrato-'+cod,corte:$('#ex-corte').value||hojeISO(),...o,cr:o.cr||CR_PAD[0],crNome:o.crNome||CR_PAD[1],foraGasto:/ADIANTAMENTO A FORNECE/i.test(o.nome)});nN++});S.t.par.extratoCorte=$('#ex-corte').value||hojeISO();S.t.par.extratoSeed=true}}
  if(txL.trim()){const r=extParse(txL,EXT_LAN,['desdob','valorNota'],['dtNeg','dtBaixa','venc']);erros.push(...r.erros);const nc=$('#ex-natcod').value.trim(),ja=new Set(S.t.lfxs.filter(l=>l.detalhe).map(l=>[l.nota,l.natCod,l.desdob,l.venc].join('|')));
    r.out.filter(o=>o.nota).forEach((o,i)=>{const k=[o.nota,nc,o.desdob,o.venc].join('|');if(ja.has(k))return;ja.add(k);S.t.lfxs.push({id:'lan-'+cod+'-'+Date.now()+'-'+i,tipo:'gasto',detalhe:true,origem:'Importado',lote:'lanc-'+Date.now(),forn:o.parceiro,numero:o.nota,desc:o.topDesc,valor:o.valorNota,pago:o.dtBaixa,natCod:nc,...o});nL++})}
  if(!nN&&!nL)return toast(erros[0]||'Nada para importar');log('extrato',cod,'importar','',nN+' naturezas, '+nL+' lançamentos'+(erros.length?' · '+erros.length+' avisos':''));save();toast(nN+' naturezas e '+nL+' lançamentos importados'+(erros.length?' · '+erros[0]:''));render()}
ACOES['ex-imp']=extImportar;
function extratoView(){const N=S.t.lfxs.filter(l=>l.tipo==='nat'),D=S.t.lfxs.filter(l=>l.detalhe),pode=can('lan');
  return `<div class="panel-t" style="margin-top:18px">Extrato por natureza e lançamentos</div>
  <div class="sub">${N.length?`<b>${N.length}</b> naturezas e <b>${D.length}</b> lançamentos importados${S.t.par.extratoCorte?' · histórico até <b>'+fdz(S.t.par.extratoCorte)+'</b>':''}.`:'Nenhum extrato importado: o painel mostra 0 até você colar o extrato.'} O que for lançado aqui depois soma-se ao histórico. Cole as tabelas copiadas do relatório (colunas separadas por tabulação ou ponto e vírgula, com o cabeçalho). Importar o extrato por natureza substitui o anterior; os lançamentos repetidos são ignorados.</div>
  <div class="g3" style="grid-template-columns:1fr 1fr 1fr;margin-top:6px"><div><label style="margin-top:0">Data de corte do histórico</label><input id="ex-corte" type="date" value="${esc(S.t.par.extratoCorte||hojeISO())}"></div><div><label style="margin-top:0">Natureza dos lançamentos (código)</label><input id="ex-natcod" placeholder="ex.: 1040302"></div></div>
  <label>Por natureza e centro de resultado (cabeçalho: Cód. Natureza, Natureza, Faturado, Cód. CR., Centro de Resultado, Saldo Por CR, Faturado (Recebido)…)</label><textarea id="ex-nat" rows="4"></textarea>
  <label>Lançamentos (cabeçalho: Origem, Receita/Despesa, Provisão?, Nr. Nota, Empresa, Parceiro, Vlr. Desdobramento, Vlr. Nota, Dt. Negociação, Dt. Baixa, Vendedor/Comprador, Dt. Vencimento, TOP, Descrição TOP, Tipo Movimento)</label><textarea id="ex-lan" rows="4"></textarea>
  <div style="margin-top:8px"><button class="btn dark" data-act="ex-imp" ${pode?'':'disabled title="Só Financeiro"'}>Importar extrato</button></div>`}
const impView=()=>impViewBase()+extratoView()+(typeof pedImpView==='function'?pedImpView():'');
