/* ============ APURAÇÃO ESTIMADA DE TRIBUTOS (Fase 11) ============ */
const FISC_PAD={iss:2,pis:0.65,cofins:3,irpjCsll:2.85,inssRet:11,issRet:0,outrasRet:0};   // padrões do Estudo (8,5% no total); o contador confirma
const fisc=()=>({...FISC_PAD,...(S.t.par.fisc||{})});
const baseServico=n=>n.rateio.filter(l=>l.nat==='TER').reduce((s,l)=>s+ +l.valor,0);
function retencoesNota(n){const f=fisc(),b=r2(baseServico(n));
  const inss=n.retInss?n.retInss:r2(b*f.inssRet/100),iss=n.retIss?n.retIss:r2(b*f.issRet/100),out=r2(b*f.outrasRet/100);
  return {base:b,inss,iss,out,total:r2(inss+iss+out),liquido:r2(n.valor-inss-iss-out)}}
function apuraFaturamento(comp){const f=fisc();
  const L=S.t.fats.filter(x=>mesDe(x.emissao)===comp).map(x=>{const b=x.valor,t={iss:r2(b*f.iss/100),pis:r2(b*f.pis/100),cofins:r2(b*f.cofins/100),irpjCsll:r2(b*f.irpjCsll/100)};return {f:x,base:b,...t,total:r2(t.iss+t.pis+t.cofins+t.irpjCsll)}});
  const T=L.reduce((a,x)=>({base:a.base+x.base,iss:a.iss+x.iss,pis:a.pis+x.pis,cofins:a.cofins+x.cofins,irpjCsll:a.irpjCsll+x.irpjCsll,total:a.total+x.total}),{base:0,iss:0,pis:0,cofins:0,irpjCsll:0,total:0});
  return {L,T:Object.fromEntries(Object.entries(T).map(([k,v])=>[k,r2(v)]))}}
function apuraRetencoes(comp){
  const L=S.t.notas.filter(n=>n.status!=='lancada'&&mesDe(n.emissao)===comp).map(n=>({n,...retencoesNota(n)})).filter(x=>x.base>0);
  return {L,total:r2(L.reduce((s,x)=>s+x.total,0)),inss:r2(L.reduce((s,x)=>s+x.inss,0)),iss:r2(L.reduce((s,x)=>s+x.iss,0))}}
function viewApuracao(){
  const comp=S.comp||mesDe(hojeISO()),f=fisc(),A=apuraFaturamento(comp),R=apuraRetencoes(comp);
  const campo=(k,l)=>`<div><label style="margin-top:0">${l}</label><input data-fisc="${k}" type="number" step="0.01" value="${f[k]}"></div>`;
  return `<div class="g3" style="grid-template-columns:1fr 3fr;margin-top:12px"><div><label style="margin-top:0">Competência</label><input id="a-comp" type="month" value="${comp}"></div><div class="sub" style="align-self:end">Estimativa para conferência. Alíquotas editáveis (padrão do Estudo: 8,5% sobre o faturamento). O contador valida e apura de fato.</div></div>
  <div class="g3" style="grid-template-columns:repeat(4,1fr);margin-top:8px">${campo('iss','ISS (%)')}${campo('pis','PIS (%)')}${campo('cofins','COFINS (%)')}${campo('irpjCsll','IRPJ+CSLL efetivo (%)')}</div>
  <div class="g3" style="grid-template-columns:repeat(3,1fr);margin-top:4px">${campo('inssRet','INSS retido em serviços tomados (%)')}${campo('issRet','ISS retido em serviços tomados (%)')}${campo('outrasRet','Outras retenções (IRRF/PIS/COFINS/CSLL, %)')}</div>
  <div class="kpi4"><div><div class="k-l">Faturado no mês</div><div class="v">${brl(A.T.base,true)}</div></div><div><div class="k-l">Tributos s/ faturamento</div><div class="v">${brl(A.T.total,true)}</div></div><div><div class="k-l">Retido em serviços tomados</div><div class="v">${brl(R.total,true)}</div></div><div><div class="k-l">Total a recolher (estimado)</div><div class="v">${brl(A.T.total+R.total,true)}</div></div></div>
  <div class="panel-t" style="margin-top:14px">Notas de serviço emitidas</div>${A.L.length?`<div class="tw"><table class="tbl"><thead><tr><th>NF</th><th class="r">Valor</th><th class="r">ISS</th><th class="r">PIS</th><th class="r">COFINS</th><th class="r">IRPJ+CSLL</th><th class="r">Total</th></tr></thead><tbody>${A.L.map(x=>`<tr><td class="mono">${x.f.num}</td><td class="r">${brl(x.base)}</td><td class="r">${brl(x.iss)}</td><td class="r">${brl(x.pis)}</td><td class="r">${brl(x.cofins)}</td><td class="r">${brl(x.irpjCsll)}</td><td class="r"><b>${brl(x.total)}</b></td></tr>`).join('')}</tbody></table></div>`:'<div class="sub">Nenhuma NF de serviço emitida na competência.</div>'}
  <div class="panel-t" style="margin-top:14px">Retenções em notas de serviço recebidas (natureza terceiros)</div>${R.L.length?`<div class="tw"><table class="tbl"><thead><tr><th>Nota</th><th>Fornecedor</th><th class="r">Base de serviço</th><th class="r">INSS</th><th class="r">ISS</th><th class="r">Outras</th><th class="r">Líquido a pagar</th></tr></thead><tbody>${R.L.map(x=>`<tr><td class="mono">${x.n.num}</td><td>${esc(x.n.emitente)}</td><td class="r">${brl(x.base)}</td><td class="r">${brl(x.inss)}</td><td class="r">${brl(x.iss)}</td><td class="r">${brl(x.out)}</td><td class="r">${brl(x.liquido)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="sub">Nenhuma nota de serviço rateada na competência.</div>'}`}
