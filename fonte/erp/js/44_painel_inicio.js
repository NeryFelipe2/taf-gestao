/* ============ FASE 21: Painel de Contratos no Início (várias obras, filtros, detalhe por natureza e lançamento) ============ */
const EMPRESA_PAD='TAF EQUIPAMENTOS E SERVICOS LTDA',CR_PAD=['104023','CONSTRUÇÃO CIVIL - OBRAS'],NAOINF='(não informado)';
const CAD_PAD={'342':{tipo:'Contrato',situacao:'Em execução'}};
const CAD_LISTAS={tipo:['Ata','Contrato','Comissão'],situacao:['Em execução','Financeiro','Fechada'],gerente:[],vendedor:['SEM VENDEDOR']};
const GRUPOS_FLT=[['empresa','Empresa'],['gerente','Gerente'],['vendedor','Vendedor'],['tipo','Tipo de contrato'],['situacao','Situação da obra'],['obras','Nº do contrato']];
const KPI_KEYS=['provProd','provServ','contrato','fat','faturadoAnt','recebido','aReceber','atrRec','fatDireto','impDeb','impCred','pago','aPagar','atrasado','gasto','requisicao','custoFixo','cfPrev','prov','provTot','saldoFat','comprom','lucroPainel','lucroPrev'];
const fdz=s=>s?s.split('-').reverse().join('/'):'';
const cadDe=(cod,t)=>{const f=typeof cadFichaDe==='function'?cadFichaDe(cod,t):{},r=f.resp||{};
  return {empresa:EMPRESA_PAD,gerente:(r.gerente&&r.gerente.nome)||'',vendedor:(r.vendedor&&r.vendedor.nome)||'',tipo:f.tipo||'',situacao:f.situacao||'',...(CAD_PAD[cod]||{}),...(((t||{}).par||{}).cad||{})}};

/* ---------- estado de cada obra e extrato importado ---------- */
function lerT(cod){if(S.D&&S.D.obra.codigo===cod)return S.t;if(MODO_CH)return CH.T[cod]||null;if(MODO_SB)return null;
  return memo('lt'+cod,()=>{try{return JSON.parse(localStorage.getItem(cod==='342'?KEY:KEY+'_'+cod)||'null')}catch(e){return null}})}
function tEf(cod){const t=lerT(cod);if(t)return {...novoT(),...t};return memo('te'+cod,()=>{const n=novoT(),ex=S.extr&&S.extr[cod];if(ex)aplicaExtrato(n,ex);return n})}
async function extratoDe(cod){S.extr=S.extr||{};if(cod in S.extr)return S.extr[cod];return S.extr[cod]=(window.TAF_EXTRATO&&window.TAF_EXTRATO[cod])||null}
function aplicaExtrato(t,ex){const lote='extrato-'+ex.obra;t.lfxs=(t.lfxs||[]).filter(l=>l.lote!==lote);
  ex.nat.forEach((n,i)=>t.lfxs.push({id:'nat-'+ex.obra+'-'+i,tipo:'nat',origem:'Importado',lote,corte:ex.corte,...n}));
  (ex.lanc||[]).forEach((l,i)=>t.lfxs.push({id:'lan-'+ex.obra+'-'+i,tipo:'gasto',detalhe:true,origem:'Importado',lote,forn:l.parceiro,numero:l.nota,desc:l.topDesc,venc:l.venc,valor:l.valorNota,pago:l.dtBaixa,
    origemTxt:l.origem,rd:l.rd,provTxt:l.prov,nota:l.nota,empresa:l.empresa,parceiro:l.parceiro,desdob:l.desdob,valorNota:l.valorNota,dtNeg:l.dtNeg,dtBaixa:l.dtBaixa,vendComp:l.vendComp,top:l.top,topDesc:l.topDesc,tipoMov:l.tipoMov,natCod:l.natCod||''}));
  t.par=t.par||{};t.par.extratoCorte=ex.corte}
async function seedExtrato(){const cod=S.D.obra.codigo,ex=await extratoDe(cod);if(!ex||S.t.par.extratoSeed)return;
  aplicaExtrato(S.t,ex);S.t.par.extratoSeed=true;log('extrato',cod,'importar','',ex.nat.length+' naturezas, '+(ex.lanc||[]).length+' lançamentos (corte '+ex.corte+')');save()}
/* pedido aprovado sem nota (provisão): vem de contaObra() (05_motor_de_regras.js), a conta única */
const provOcsSplit=t=>{const r={prod:0,serv:0};contaObra(t).lin.forEach(({nat,comp:v})=>{if(['MO','EQP','TER'].includes(nat))r.serv+=v;else r.prod+=v});r.prod=r2(r.prod);r.serv=r2(r.serv);return r};
const provOcs=t=>r2(contaObra(t).ocs.reduce((s,x)=>s+x.comp,0));
/* roda uma função "como se" a obra de outro estado estivesse aberta (sem tocar em nada que fica gravado) */
function comObra(t,O,fn){const pv=provLigada(),sv={t:S.t,D:S.D,X:S.X,m:S.memo,p:S.provTmp};S.provTmp=pv;S.t=t;S.D={obra:O,items:[]};S.X={venda:O.valor_contrato,comp:provOcs(t)};S.memo=null;
  try{return fn()}finally{S.t=sv.t;S.D=sv.D;S.X=sv.X;S.memo=sv.m;S.provTmp=sv.p}}
function kpisObra(cod){if(S.D&&S.D.obra.codigo===cod)return painelCalc();const c=S.cart&&S.cart[cod];if(!c||!c.obra)return null;return memo('ko'+cod,()=>comObra(tEf(cod),c.obra,painelCalcRaw))}
function somaObras(cods){const T={};KPI_KEYS.forEach(k=>T[k]=0);cods.forEach(c=>{const k=kpisObra(c);if(k)KPI_KEYS.forEach(x=>T[x]=r2(T[x]+(+k[x]||0)))});return T}

/* ---------- filtros do painel (valem para todas as obras; ficam no navegador) ---------- */
function fltGet(){if(S.flt)return S.flt;let f=null;try{f=JSON.parse(localStorage.getItem('taf_flt')||'null')}catch(e){}return S.flt=f||{empresa:[],gerente:[],vendedor:[],tipo:[],situacao:[],obras:[]}}
const fltSalva=()=>{try{localStorage.setItem('taf_flt',JSON.stringify(S.flt))}catch(e){}};
const cadObra=cod=>cadDe(cod,lerT(cod));
const valFlt=(g,cod)=>g==='obras'?cod:(cadObra(cod)[g]||NAOINF);
function opcoesFlt(g){if(g==='obras')return OBRAS_PADRAO.map(([c,n])=>[c,c+' · '+n.replace(/^SANEAGO · /,'')]);
  const u=new Set(CAD_LISTAS[g]||[]);OBRAS_PADRAO.forEach(([c])=>u.add(valFlt(g,c)));if(g==='empresa')u.add(EMPRESA_PAD);return [...u].filter(Boolean).sort().map(v=>[v,v])}
const obrasSel=()=>{const f=fltGet();return OBRAS_PADRAO.map(o=>o[0]).filter(c=>GRUPOS_FLT.every(([g])=>{const L=f[g]||[];return !L.length||L.includes(valFlt(g,c))}))};
const nFlt=()=>{const f=fltGet();return GRUPOS_FLT.reduce((s,[g])=>s+((f[g]||[]).length?1:0),0)};
const provPref=()=>{try{return localStorage.getItem('taf_prov')!=='0'}catch(e){return S.provOff!==true}};
ACOES['flt-open']=()=>{S.popFlt=!S.popFlt;render()};
ACOES['flt-tog']=el=>{const f=fltGet(),g=el.dataset.g,v=el.dataset.v,L=f[g]=f[g]||[],i=L.indexOf(v);if(i<0)L.push(v);else L.splice(i,1);fltSalva();render();const b=document.querySelector(`.fpanel [data-g="${g}"][data-v="${CSS.escape(v)}"]`);b&&b.focus()};
ACOES['flt-clear']=()=>{S.flt={empresa:[],gerente:[],vendedor:[],tipo:[],situacao:[],obras:[]};fltSalva();render()};
ACOES['prov-tog']=()=>{const on=!provPref();try{localStorage.setItem('taf_prov',on?'1':'0')}catch(e){S.provOff=!on}render()};
document.addEventListener('click',e=>{if(S.popFlt&&!e.target.closest('.fwrap')){S.popFlt=false;render()}});
document.addEventListener('keydown',e=>{if(S.popFlt&&e.key==='Escape'){S.popFlt=false;render();const b=document.querySelector('[data-act=flt-open]');b&&b.focus()}});

/* ---------- cadastro da obra (gerente, vendedor, tipo, situação) ---------- */
const podeCad=()=>isRole('diretoria','gestao','gerente')||S.role==='admin';
function modalCadObra(){const c=cadDe(S.D.obra.codigo,S.t),op=(l,v)=>[...new Set([...(CAD_LISTAS[l]||[]),v].filter(Boolean))].map(x=>`<option ${x===v?'selected':''}>${esc(x)}</option>`).join('');
  modal(`<h3>Cadastro da obra ${esc(S.D.obra.codigo)}</h3><div class="sub">Esses dados alimentam os filtros do Início (empresa, gerente, vendedor, tipo e situação).</div>
  <div class="g2"><div><label>Empresa</label><input id="cd-emp" value="${esc(c.empresa)}"></div><div><label>Gerente</label><select id="cd-ger"><option value="">${NAOINF}</option>${op('gerente',c.gerente)}</select></div>
  <div><label>Vendedor</label><select id="cd-ven"><option value="">${NAOINF}</option>${op('vendedor',c.vendedor)}</select></div><div><label>Tipo de contrato</label><select id="cd-tipo"><option value="">${NAOINF}</option>${op('tipo',c.tipo)}</select></div>
  <div><label>Situação da obra</label><select id="cd-sit"><option value="">${NAOINF}</option>${op('situacao',c.situacao)}</select></div><div><label>Custo fixo previsto (% do contrato)</label><input id="cd-cf" type="number" step="0.1" min="0" value="${S.t.par.cfPrevPct==null?5:S.t.par.cfPrevPct}"></div></div>
  <div class="acts"><button class="btn" data-act="fechar">Cancelar</button><button class="btn dark" data-act="cad-obra-ok">Salvar</button></div>`)}
ACOES['cad-obra']=()=>{if(!podeCad())return toast('Só Gestão, Diretoria ou Gerente');modalCadObra()};
ACOES['cad-obra-ok']=()=>{const n={empresa:$('#cd-emp').value.trim()||EMPRESA_PAD,gerente:$('#cd-ger').value,vendedor:$('#cd-ven').value,tipo:$('#cd-tipo').value,situacao:$('#cd-sit').value},ant=JSON.stringify(cadDe(S.D.obra.codigo,S.t));
  S.t.par.cad=n;S.t.par.cfPrevPct=Math.max(0,+$('#cd-cf').value||0);log('obra',S.D.obra.codigo,'cadastro',ant,JSON.stringify(n));save();closeModal();render()};

/* ---------- tela: filtros, cartões e composição ---------- */
const KCARDS=[['gasto','Gasto','bad'],['custoFixo','Custo fixo','warn'],['prov','Prov. gasto','warn'],['fat','Faturado','ok'],['fatDireto','Fat. direto','info'],['saldoFat','Saldo a faturar','mut'],['impostos','Impostos','bad'],['lucro','Lucro','']];
const pct=(v,b)=>b?((v/b)*100).toFixed(2).replace('.',',')+' %':'0,00 %';
function kcard(k,t,cls,T){const sub=l=>`<div class="ksub">${l}</div>`,B=T.contrato;let v=0,s='';
  if(k==='gasto'){v=T.gasto;s=sub('Pago: '+brl(T.pago))+sub('A pagar: '+brl(T.aPagar))+sub('Atrasado: '+brl(T.atrasado))+sub('Requisição: '+brl(T.requisicao))}
  else if(k==='custoFixo'){v=T.custoFixo;s=sub(pct(T.custoFixo,B)+' do contrato')+sub('Previsto: '+brl(T.cfPrev))}
  else if(k==='prov'){v=T.prov;s=provPref()?sub('Produtos: '+brl(T.provProd))+sub('Serviços: '+brl(T.provServ)):sub('Provisão desligada nos filtros')}
  else if(k==='fat'){v=T.fat;s=sub('Anteriormente: '+brl(T.faturadoAnt))+sub('Recebido: '+brl(T.recebido))+sub('A receber: '+brl(T.aReceber))+sub('Atrasado: '+brl(T.atrRec))}
  else if(k==='fatDireto'){v=T.fatDireto;s=sub('Compras faturadas direto ao cliente')}
  else if(k==='saldoFat'){v=T.saldoFat;s=sub(pct(T.saldoFat,B)+' do contrato')}
  else if(k==='impostos'){v=T.impDeb;s=sub('Débito: '+brl(T.impDeb))+sub('Crédito: '+brl(T.impCred))}
  else{v=T.lucroPainel;cls=v<0?'bad':'ok';s=sub(pct(v,B)+' do contrato')+sub('Com custo fixo previsto: '+brl(T.lucroPrev))}
  return `<button class="kcard ${cls}" data-act="kdet" data-k="${k}" aria-label="${t}: ${brl(v)}. Ver detalhe"><span class="kt">${t}</span><span class="kv">${brl(v)}</span>${s}<span class="kgo" aria-hidden="true">Ver detalhe ›</span></button>`}
function composicao(cods,T){const linha=(rot,k)=>{const B=Math.max(1,k.contrato),w=v=>Math.max(0,Math.min(100,v/B*100)),cf=Math.max(k.custoFixo,k.cfPrev),
    seg=[['Faturado',k.fat,'var(--ok)'],['Gasto',k.gasto,'var(--bad)'],['Custo fixo (previsto)',cf,'var(--warn)'],['Prov. gasto',k.prov,'var(--info)']];
    return `<div class="crow"><span class="cl">${esc(rot)}</span><span class="cbar" role="img" aria-label="${esc(rot)}: ${seg.map(x=>x[0]+' '+brl(x[1])).join(', ')}">${seg.map(([n,v,c])=>v>0?`<i style="width:${Math.max(.6,w(v))}%;background:${c}" title="${n}: ${brl(v)}"></i>`:'').join('')}</span><span class="cv ${k.lucroPainel<0?'neg':''}">${brl(k.lucroPainel,true)}</span></div>`};
  const rows=cods.map(c=>{const k=kpisObra(c);return k?linha(c,k):''}).join('')+(cods.length>1?linha('Total',T):'');
  return `<div class="card" style="margin-top:14px"><div class="in"><div class="panel-t">Composição do contrato</div><div class="sub">Cada barra é o contrato (100%). À direita, o lucro do painel.</div>${rows}
  <div class="legend"><span><i style="background:var(--ok)"></i>Faturado</span><span><i style="background:var(--bad)"></i>Gasto</span><span><i style="background:var(--warn)"></i>Custo fixo (previsto)</span><span><i style="background:var(--info)"></i>Prov. gasto</span><span><i style="background:var(--line)"></i>Saldo do contrato</span></div></div></div>`}
function painelFiltros(){const f=fltGet();
  return `<span class="fwrap"><button class="pill${nFlt()?' on':''}" data-act="flt-open" aria-haspopup="dialog" aria-expanded="${!!S.popFlt}">Filtros${nFlt()?` · ${nFlt()}`:''} <span aria-hidden="true">▾</span></button>
  ${S.popFlt?`<div class="fpanel" role="dialog" aria-label="Filtros do painel">${GRUPOS_FLT.map(([g,t])=>`<fieldset><legend>${t}${(f[g]||[]).length?` <b>${f[g].length}</b>`:''}</legend>${opcoesFlt(g).map(([v,l])=>`<button role="checkbox" aria-checked="${(f[g]||[]).includes(v)}" data-act="flt-tog" data-g="${g}" data-v="${esc(v)}"><i></i>${esc(l)}</button>`).join('')}</fieldset>`).join('')}
  <div class="facts"><button class="btn sm" data-act="flt-clear">Limpar tudo</button><button class="btn sm dark" data-act="flt-open">Pronto</button></div></div>`:''}</span>`}
function painelInicio(){if(OBRAS_PADRAO.some(([c])=>!(S.cart&&S.cart[c])))setTimeout(cartCarrega,0);
  const cods=obrasSel(),T=somaObras(cods),f=fltGet(),chips=GRUPOS_FLT.flatMap(([g,t])=>(f[g]||[]).map(v=>`<button class="pill x" data-act="flt-tog" data-g="${g}" data-v="${esc(v)}" title="Remover filtro">${esc(g==='obras'?v:v)} ×</button>`)).join('');
  const bar=`<div class="pbar" style="margin-top:0">${painelFiltros()}${chips}<button class="pill${provPref()?' on':''}" role="switch" aria-checked="${provPref()}" data-act="prov-tog">Considera provisão de gasto: ${provPref()?'sim':'não'}</button>${podeCad()?'<button class="pill" data-act="cad-obra">Cadastro da obra</button>':''}<span class="presumo">${cods.length} de ${OBRAS_PADRAO.length} obras · acumulado até hoje</span></div>`;
  if(!cods.length)return bar+`<div class="card" style="margin-top:12px"><div class="in"><div class="empty">Nenhuma obra com esses filtros. <button class="btn sm" data-act="flt-clear">Limpar filtros</button></div></div></div>`;
  return bar+`<div class="kgrid" style="margin-top:10px">${KCARDS.map(([k,t,c])=>kcard(k,t,c,T)).join('')}</div>${composicao(cods,T)}`}

/* ---------- detalhe: natureza × centro de resultado → lançamentos ---------- */
const NAT_COLS=[['cod','Cód. natureza','t'],['nome','Natureza','t'],['fat','Faturado','n'],['cr','Cód. CR','t'],['crNome','Centro de resultado','t'],['saldoCR','Saldo por CR','n'],['rec','Faturado (recebido)','n'],['areceber','Faturado (a receber)','n'],['atrasoRec','Faturado (atrasado)','n'],['gasto','Gasto','n'],['pago','Gasto (pago)','n'],['aPagar','Gasto (a pagar)','n'],['atrasado','Gasto (atrasado)','n'],['req','Gasto (requisição)','n'],['prov','Prov. gasto','n'],['impD','Imposto débito','n'],['impC','Imposto crédito','n'],['impF','Imposto final','n']];
const LANC_COLS=[['origemTxt','Origem','t'],['rd','Receita/Despesa','t'],['provTxt','Provisão?','t'],['nota','Nr. nota','t'],['empresa','Empresa','t'],['parceiro','Parceiro','t'],['desdob','Vlr. desdobramento','n'],['valorNota','Vlr. nota','n'],['dtNeg','Dt. negociação','d'],['dtBaixa','Dt. baixa','d'],['vendComp','Vendedor/Comprador','t'],['venc','Dt. vencimento','d'],['top','TOP','t'],['topDesc','Descrição TOP','t'],['tipoMov','Tipo movimento','t']];
const KHL={gasto:'gasto',pago:'pago',aPagar:'aPagar',atrasado:'atrasado',requisicao:'req',prov:'prov',fat:'fat',fatDireto:'fat',saldoFat:'fat',impostos:'impD',lucro:'saldoCR',custoFixo:'gasto'};
const KNOME={gasto:'Gasto',custoFixo:'Custo fixo',prov:'Prov. gasto',fat:'Faturado',fatDireto:'Fat. direto',saldoFat:'Saldo a faturar',impostos:'Impostos',lucro:'Lucro'};
/* executam com a obra desejada "aberta" (ver comObra) */
function natRowsT(){const M=new Map(),h=hojeISO(),Z=()=>({fat:0,saldoCR:0,rec:0,areceber:0,atrasoRec:0,gasto:0,pago:0,aPagar:0,atrasado:0,req:0,prov:0,impD:0,impC:0,impF:0});
  const add=(cod,nome,cr,crNome,o,fora)=>{const k=cod+'|'+cr;let r=M.get(k);if(!r){r={cod,nome,cr,crNome,...Z()};M.set(k,r)}for(const x in o)r[x]=r2(r[x]+o[x]);if(fora)r.fora=true};
  natDe().forEach(n=>{const o={};['fat','saldoCR','rec','areceber','atrasoRec','gasto','pago','aPagar','atrasado','req','prov','impD','impC','impF'].forEach(k=>o[k]=+n[k]||0);add(n.cod,n.nome,n.cr,n.crNome,o,n.foraGasto)});
  const fatia=(n,v)=>n.status==='paga'?{pago:v}:vencNota(n)<h?{atrasado:v}:{aPagar:v};
  S.t.notas.filter(n=>n.status!=='lancada').forEach(n=>n.rateio.forEach(l=>{const v=+l.valor,c=l.nat||'ND';add(c,NATNOME[c]||c,CR_PAD[0],CR_PAD[1],{gasto:v,saldoCR:-v,...fatia(n,v)})}));
  lfxDe('gasto').forEach(l=>{const v=l.valor;add('IMP','Lançamentos importados',CR_PAD[0],CR_PAD[1],{gasto:v,saldoCR:-v,...(l.pago?{pago:v}:l.venc<h?{atrasado:v}:{aPagar:v})})});
  lfxDe('provisao').forEach(l=>add('PROV','Provisões importadas',CR_PAD[0],CR_PAD[1],{prov:l.valor}));
  const po=provOcs(S.t);if(po)add('PEDIDOS','Pedidos aprovados sem nota',CR_PAD[0],CR_PAD[1],{prov:po});
  return [...M.values()]}
function lancRowsT(cod){const R=[],cd=cadDe(S.D.obra.codigo,S.t);
  S.t.lfxs.filter(l=>l.tipo==='gasto'&&l.detalhe&&(!cod||l.natCod===cod)).forEach(l=>R.push({origemTxt:l.origemTxt,rd:l.rd,provTxt:l.provTxt,nota:l.nota,empresa:l.empresa,parceiro:l.parceiro,desdob:l.desdob,valorNota:l.valorNota,dtNeg:l.dtNeg,dtBaixa:l.dtBaixa,vendComp:l.vendComp,venc:l.venc,top:l.top,topDesc:l.topDesc,tipoMov:l.tipoMov}));
  S.t.notas.filter(n=>n.status!=='lancada').forEach(n=>n.rateio.filter(l=>!cod||(l.nat||'ND')===cod).forEach(l=>R.push({origemTxt:'Nota',rd:'Despesa',provTxt:'Não',nota:n.nfNum||n.num,empresa:cd.empresa,parceiro:n.emitente,desdob:+l.valor,valorNota:n.valor,dtNeg:n.emissao,dtBaixa:n.status==='paga'?(n.pago||''):'',vendComp:'',venc:vencNota(n),top:'',topDesc:'',tipoMov:'C-Compra'})));
  return R}
function porObras(cods,fn){const out=[];cods.forEach(c=>{if(S.D&&S.D.obra.codigo===c)out.push(...fn());else{const k=S.cart&&S.cart[c];if(k&&k.obra)out.push(...comObra(tEf(c),k.obra,fn))}});return out}
function linhasNat(cods){const M=new Map();porObras(cods,natRowsT).forEach(r=>{const k=r.cod+'|'+r.cr;let x=M.get(k);if(!x){M.set(k,{...r});return}NAT_COLS.forEach(([c,,t])=>{if(t==='n')x[c]=r2(x[c]+r[c])});x.fora=x.fora||r.fora});
  return [...M.values()].sort((a,b)=>String(a.cod).localeCompare(String(b.cod)))}
function detModal(){const d=S.det,cods=d.cods,nome=KNOME[d.k]||'Detalhe',lanc=d.vista==='lanc',tab=lanc?'lanc':'nat',def=lanc?LANC_COLS:NAT_COLS;
  let rows,corte='';
  if(lanc){rows=porObras(cods,()=>lancRowsT(d.nat))}else{rows=linhasNat(cods);cods.forEach(c=>{const t=tEf(c);if(t.par&&t.par.extratoCorte)corte=t.par.extratoCorte})}
  const nm=lanc?(linhasNat(cods).find(r=>r.cod===d.nat)||{}).nome||d.nat:'';
  return `<h3>${lanc?'Lançamentos · '+esc(nm):'Detalhe · '+nome}</h3><div class="sub">Obras: ${cods.map(esc).join(', ')}${corte?' · histórico importado até '+fdz(corte):''}${lanc?'':' · clique numa natureza para ver os lançamentos'}</div>
  <div class="dtools">${gradeBusca(tab)}${lanc?'<button class="btn sm" data-act="det-back">‹ Naturezas</button>':''}${gradeTools(tab,def,()=>abreDet({}))}<button class="btn sm" data-act="fechar">Fechar</button></div>
  ${gradeTable(tab,def,rows,{hl:lanc?'':KHL[d.k],rowAct:lanc?null:r=>`data-act="det-nat" data-c="${esc(r.cod)}"`})}
  ${lanc?'':'<div class="sub" style="margin-top:8px">Adiantamento a fornecedor aparece na tabela, mas não entra no cartão Gasto.</div>'}`}
function abreDet(patch){S.det={...(S.det||{}),...patch};modal(detModal());$('#mbox').classList.add('wide')}
ACOES['kdet']=el=>abreDet({k:el.dataset.k,cods:obrasSel(),vista:'nat',nat:'',cfg:false});
ACOES['det-nat']=el=>abreDet({vista:'lanc',nat:el.dataset.c,cfg:false});
ACOES['det-back']=()=>abreDet({vista:'nat',nat:'',cfg:false});
