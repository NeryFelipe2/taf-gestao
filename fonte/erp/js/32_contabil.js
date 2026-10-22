/* ============ CONTABILIDADE (Fase 14): partidas dobradas, Diário, Razão, Balancete, DRE/Balanço, orçamento, fechamento, livros ============ */
Object.assign(CAN,{ctb:['financeiro','adm'],fechaCtb:['financeiro','diretoria'],reabreCtb:['diretoria']});
/* Plano contábil base: A ativo, P passivo, PL patrimônio líquido, R receita, D custo/despesa. Natureza = lado em que a conta aumenta. Contas de custo 5.x.xx espelham o plano gerencial 4.x.xx da obra. */
const PLANO_CONT=[['1.1.01','Caixa e bancos','A'],['1.1.02','Clientes a receber','A'],['1.1.03','Retenções a compensar','A'],['1.2.01','Imobilizado','A'],['1.2.02','(−) Depreciação acumulada','A'],
 ['2.1.01','Fornecedores a pagar','P'],['2.1.02','Tributos sobre faturamento a recolher','P'],['2.1.03','INSS retido a recolher','P'],['2.1.04','ISS retido a recolher','P'],['2.1.06','Outras retenções a recolher','P'],
 ['3.1.01','Capital social','PL'],['3.1.03','Aportes e outras entradas','PL'],['3.1.02','Lucros e prejuízos acumulados','PL'],
 ['4.1.01','Receita de medições (BM faturados)','R'],['4.9.01','Deduções: tributos sobre a receita','D'],
 ['5.9.01','Juros, multas e descontos','D'],['5.9.02','Gastos importados do financeiro','D'],['5.9.03','Depreciação','D'],['5.9.04','Perda na baixa de bens','D'],['5.9.05','(−) Aquisições ativadas no imobilizado','D'],['5.9.09','Outras saídas de caixa','D']];
const gerParaCtb=g=>g&&String(g).startsWith('4')?'5'+String(g).slice(1):'5.9.02';
function planoCtb(){const L=PLANO_CONT.map(([c,n,t])=>({codigo:c,nome:n,tipo:t,auto:true}));
  (S.D.plano||[]).filter(x=>String(x.codigo).startsWith('4.')&&x.nivel>=3).forEach(x=>L.push({codigo:gerParaCtb(x.codigo),nome:x.nome,tipo:'D',ger:x.codigo,auto:true}));
  (S.t.par.ctbContas||[]).forEach(x=>L.push({...x,auto:false}));
  return L.sort((a,b)=>cmpCod(a.codigo,b.codigo))}
const ctbNat=c=>{const t=(planoCtb().find(x=>x.codigo===c)||{}).tipo||(c[0]==='1'||c[0]==='5'?(c[0]==='1'?'A':'D'):c[0]==='4'?'R':c[0]==='2'?'P':'PL');return t};
const devedora=c=>['A','D'].includes(ctbNat(c));
const compFechada=d=>S.t.fechs.some(f=>f.comp===mesDe(d)&&!f.reaberta);
const bloqueada=(d,oque)=>{if(compFechada(d)){toast('Competência '+mesDe(d)+' fechada: '+oque+' bloqueado. Só a Diretoria reabre.');return true}return false};
/* partidas automáticas: calculadas dos registros operacionais, sempre consistentes (sem cópia para divergir) */
function partidasAuto(){return memo('pa',partidasAutoRaw)}
function partidasAutoRaw(){const T=S.t,E=[],f=fisc(),push=(ref,origem,data,desc,L)=>{const linhas=L.filter(l=>(l.d||0)>0||(l.c||0)>0).map(l=>({conta:l.conta,d:r2(l.d||0),c:r2(l.c||0)}));if(linhas.length)E.push({ref,origem,data,comp:mesDe(data),desc,linhas,auto:true})};
  T.notas.filter(n=>n.status!=='lancada').forEach(n=>{const rt=retencoesNota(n),porConta={};
    n.rateio.forEach(l=>{const g=l.conta||contaPadrao(l.nat,S.byCod[l.item]?.pacote),c=gerParaCtb(g);porConta[c]=(porConta[c]||0)+ +l.valor});
    push('nf:'+n.id,'Nota '+n.num,n.emissao,'Nota '+n.num+' · '+n.emitente,[...Object.entries(porConta).map(([c,v])=>({conta:c,d:v})),{conta:'2.1.01',c:n.valor}]);
    if(rt.total>0)push('rt:'+n.id,'Retenção '+n.num,n.emissao,'Retenções na nota '+n.num,[{conta:'2.1.01',d:rt.total},{conta:'2.1.03',c:rt.inss},{conta:'2.1.04',c:rt.iss},{conta:'2.1.06',c:rt.out}]);
    if(n.status==='paga'){const liq=rt.liquido;push('pg:'+n.id,'Pagamento '+n.num,n.pago||n.emissao,'Pagamento da nota '+n.num,[{conta:'2.1.01',d:liq},{conta:'5.9.01',d:n.encargos||0},{conta:'1.1.01',c:r2(liq+(n.encargos||0))}])}});
  T.lfxs.filter(l=>l.tipo==='gasto'&&!l.detalhe).forEach(l=>{push('lx:'+l.id,'Importado',l.venc,'Gasto importado · '+l.forn+' '+l.desc,[{conta:'5.9.02',d:l.valor},{conta:'2.1.01',c:l.valor}]);
    if(l.pago)push('lp:'+l.id,'Importado',l.pago,'Pagamento importado · '+l.forn,[{conta:'2.1.01',d:l.valor},{conta:'1.1.01',c:l.valor}])});
  T.fats.forEach(x=>{const ret=r2(x.valor*(x.ret||0)/100),tr=r2(x.valor*(f.iss+f.pis+f.cofins+f.irpjCsll)/100);
    push('ft:'+x.id,'NF serviço '+x.num,x.emissao,'Faturamento '+x.num,[{conta:'1.1.02',d:r2(x.valor-ret)},{conta:'1.1.03',d:ret},{conta:'4.1.01',c:x.valor}]);
    push('tb:'+x.id,'Tributos '+x.num,x.emissao,'Tributos estimados sobre '+x.num,[{conta:'4.9.01',d:tr},{conta:'2.1.02',c:tr}])});
  T.recs.forEach(r=>push('rc:'+r.id,'Recebimento',r.data,'Recebimento '+(T.fats.find(x=>x.id===r.fat)||{}).num,[{conta:'1.1.01',d:r.valor},{conta:'1.1.02',c:r.valor}]));
  T.lans.forEach(l=>push('ln:'+l.id,'Caixa',l.data,l.desc,l.valor>=0?[{conta:'1.1.01',d:l.valor},{conta:'3.1.03',c:l.valor}]:[{conta:'5.9.09',d:-l.valor},{conta:'1.1.01',c:-l.valor}]));
  return E.concat(typeof partidasPatrimonio==='function'?partidasPatrimonio():[])}
const partidasTodas=()=>memo('pt',()=>[...partidasAuto(),...S.t.ctbs.map(e=>({...e,auto:false}))].filter(e=>e.data).sort((a,b)=>a.data.localeCompare(b.data)||String(a.ref).localeCompare(String(b.ref))));
function balancete(comp){return memo('bal'+(comp||''),()=>balanceteRaw(comp))}
function balanceteRaw(comp){const E=partidasTodas().filter(e=>!comp||e.comp<=comp),m={};
  E.forEach(e=>e.linhas.forEach(l=>{const x=m[l.conta]=m[l.conta]||{conta:l.conta,d:0,c:0};x.d+=l.d;x.c+=l.c}));
  const L=Object.values(m).map(x=>({...x,d:r2(x.d),c:r2(x.c),saldo:r2(devedora(x.conta)?x.d-x.c:x.c-x.d)})).sort((a,b)=>cmpCod(a.conta,b.conta));
  return {L,D:r2(L.reduce((s,x)=>s+x.d,0)),C:r2(L.reduce((s,x)=>s+x.c,0))}}
const nomeCtb=c=>(planoCtb().find(x=>x.codigo===c)||{}).nome||nomeConta(c);
function dreCtb(comp){const B=balancete(comp).L,s=p=>r2(B.filter(x=>x.conta.startsWith(p)).reduce((a,x)=>a+x.saldo,0));
  const rec=s('4.1'),ded=s('4.9'),custos=B.filter(x=>x.conta[0]==='5'),cust=r2(custos.reduce((a,x)=>a+x.saldo,0));
  return {rec,ded,liq:r2(rec-ded),custos,cust,resultado:r2(rec-ded-cust)}}
function balancoCtb(comp){const B=balancete(comp).L,s=n=>r2(B.filter(x=>x.conta[0]===n).reduce((a,x)=>a+x.saldo,0)),d=dreCtb(comp);
  const A=s('1'),P=s('2'),PL=s('3');return {B,A,P,PL,res:d.resultado,pasPL:r2(P+PL+d.resultado)}}
/* lançamento manual / ajuste / estorno */
function ctbNovo(est){const contas=planoCtb(),opt=sel=>contas.map(c=>`<option value="${c.codigo}" ${sel===c.codigo?'selected':''}>${c.codigo} · ${esc(c.nome)}</option>`).join('');
  modal(`<h3>Lançamento contábil</h3><div class="sub">Partida dobrada: débito e crédito de mesmo valor. Ajuste exige motivo.</div><div class="g3"><div><label>Data</label><input id="cb-d" type="date" value="${hojeISO()}"></div><div><label>Valor (R$)</label><input id="cb-v" type="number" step="any"></div></div>
  <div class="g2"><div><label>Débito</label><select id="cb-dc">${opt('')}</select></div><div><label>Crédito</label><select id="cb-cc">${opt('')}</select></div></div><label>Descrição</label><input id="cb-t"><label>Motivo (obrigatório em ajuste)</label><input id="cb-m"><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="cb-aj"> É um ajuste</label>
  <div class="acts"><button class="btn" data-act="fechar">Cancelar</button><button class="btn dark" data-act="ctb-ok">Lançar</button></div>`)}
ACOES['ctb-novo']=()=>{if(!can('ctb'))return toast('Sem permissão');ctbNovo()};
ACOES['ctb-ok']=()=>{const d=$('#cb-d').value,v=r2($('#cb-v').value),dc=$('#cb-dc').value,cc=$('#cb-cc').value,t=$('#cb-t').value.trim(),m=$('#cb-m').value.trim(),aj=$('#cb-aj').checked;
  if(!d||!(v>0)||!t)return toast('Informe data, valor e descrição');if(dc===cc)return toast('Débito e crédito não podem ser a mesma conta');if(aj&&!m)return toast('Ajuste exige motivo');if(bloqueada(d,'lançamento'))return;if(aj&&!alcadaOk('ajuste_ctb',v))return;
  const e={id:'cx'+Date.now(),ref:'man:'+Date.now(),origem:aj?'Ajuste':'Manual',data:d,comp:mesDe(d),desc:t,motivo:m,ajuste:aj,linhas:[{conta:dc,d:v,c:0},{conta:cc,d:0,c:v}],quem:user()};
  S.t.ctbs.push(e);log('contabil',e.ref,aj?'ajuste':'lançamento','',brl(v)+' · '+dc+' / '+cc+(m?' · '+m:''));save();closeModal();toast('Lançado');render()};
ACOES['ctb-est']=el=>{if(!can('ctb'))return toast('Sem permissão');const o=S.t.ctbs.find(x=>x.id===el.dataset.id);if(!o||o.estornado)return;
  ask('Estornar lançamento','Motivo do estorno','',m=>{const d=hojeISO();if(!m.trim())return toast('Informe o motivo');if(bloqueada(d,'estorno'))return;
    S.t.ctbs.push({id:'cx'+Date.now(),ref:'est:'+o.id,origem:'Estorno',data:d,comp:mesDe(d),desc:'Estorno de: '+o.desc,motivo:m,ajuste:true,linhas:o.linhas.map(l=>({conta:l.conta,d:l.c,c:l.d})),quem:user()});o.estornado=true;
    log('contabil',o.ref,'estorno','',m);save();render()})};
/* orçamento contábil: meta por conta × realizado */
function orcamentoCtb(){const meta={},B=balancete().L;S.D.items.forEach(i=>i.linhas.forEach(l=>{const c=gerParaCtb(contaPadrao(l.nat,i.pacote));meta[c]=(meta[c]||0)+i.meta_total*l.share}));
  const real={};B.filter(x=>x.conta[0]==='5').forEach(x=>real[x.conta]=x.saldo);
  return [...new Set([...Object.keys(meta),...Object.keys(real)])].sort(cmpCod).map(c=>({c,meta:r2(meta[c]||0),real:r2(real[c]||0),des:r2((real[c]||0)-(meta[c]||0)),lib:(S.t.par.libCtb||{})[c]}))}
ACOES['ctb-lib']=el=>{if(!can('fechaCtb'))return toast('Sem permissão');const c=el.dataset.c;ask('Solicitar liberação de excesso '+c,'Justificativa','',m=>{if(!m.trim())return toast('Informe a justificativa');
  S.t.par.libCtb={...(S.t.par.libCtb||{}),[c]:{motivo:m,quem:user(),data:hojeISO(),status:'solicitada'}};log('contabil',c,'liberação de limite','',m);save();render()})};
/* fechamento por competência */
ACOES['ctb-fechar']=()=>{if(!can('fechaCtb'))return toast('Só Financeiro ou Diretoria fecha');const comp=S.ctbComp||mesDe(hojeISO());if(compFechada(comp+'-01'))return toast('Competência já fechada');const q=partidasTodas().filter(e=>e.comp===comp).length,ex=S.t.fechs.find(f=>f.comp===comp);
  if(ex)Object.assign(ex,{reaberta:false,quando:new Date().toISOString(),quem:user(),linhas:q,ctb:true});else S.t.fechs.push({id:'fe'+Date.now(),comp,quando:new Date().toISOString(),quem:user(),linhas:q,ctb:true});log('fechamento',comp,'competência','aberta','fechada (contábil e fiscal)');save();toast('Competência '+comp+' fechada');render()};
ACOES['ctb-reabrir']=el=>{if(!can('reabreCtb'))return toast('Só a Diretoria reabre');const comp=el.dataset.c;ask('Reabrir '+comp,'Motivo da reabertura','',m=>{if(!m.trim())return toast('Informe o motivo');
  const f=S.t.fechs.find(x=>x.comp===comp);if(f){f.reaberta=true;f.reabertaPor=user();f.motivoReab=m}log('fechamento',comp,'competência','fechada','reaberta',m);save();render()})};
/* livros e arquivo de apoio (relatório, sem transmissão) */
function livrosCsv(comp){const L=['livro;competencia;documento;parte;valor;retencoes'];
  S.t.notas.filter(n=>n.status!=='lancada'&&mesDe(n.emissao)===comp).forEach(n=>L.push(['entrada',comp,n.nfNum||n.num,n.emitente,String(n.valor).replace('.',','),String(retencoesNota(n).total).replace('.',',')].join(';')));
  S.t.fats.filter(f=>mesDe(f.emissao)===comp).forEach(f=>L.push(['servico',comp,f.num,S.D.obra.contratante,String(f.valor).replace('.',','),String(r2(f.valor*(f.ret||0)/100)).replace('.',',')].join(';')));return L.join('\n')}
ACOES['liv-copy']=()=>{const t=livrosCsv(S.ctbComp||mesDe(hojeISO()));try{navigator.clipboard.writeText(t).then(()=>toast('Copiado'),()=>toast('Não consegui copiar'))}catch(e){toast('Não consegui copiar')}};
ACOES['proc-add']=()=>{const t=($('#pr-t').value||'').trim();if(!t)return;S.t.par.procs=[...(S.t.par.procs||[]),{data:hojeISO(),texto:t,quem:user()}];log('contabil','processo','registrado','',t);save();render()};
document.addEventListener('change',e=>{if(e.target.id==='ctb-comp'){S.ctbComp=e.target.value;render()}});
function viewCtb(X){
  const tab=S.tab.ctb||'bal',comp=S.ctbComp||mesDe(hojeISO());let b='';
  const tb=(h,rows)=>`<div class="tw"><table class="tbl"><thead><tr>${h.map(x=>`<th ${/^[RN]:/.test(x)?'class="r"':''}>${x.replace(/^[RN]:/,'')}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
  if(tab==='bal'){const B=balancete(),ok=Math.abs(B.D-B.C)<0.005;
    b=`<div class="kpi4"><div><div class="k-l">Débitos</div><div class="v">${brl(B.D,true)}</div></div><div><div class="k-l">Créditos</div><div class="v">${brl(B.C,true)}</div></div><div><div class="k-l">Débito = Crédito</div><div class="v ${ok?'':'neg'}">${ok?'Fecha':'NÃO FECHA'}</div></div><div><div class="k-l">Contas movimentadas</div><div class="v">${B.L.length}</div></div></div>
    ${tb(['Conta','Nome','R:Débito','R:Crédito','R:Saldo'],B.L.map(x=>`<tr class="clk" data-act="ctb-razao" data-c="${x.conta}"><td class="mono">${x.conta}</td><td>${esc(nomeCtb(x.conta))}</td><td class="r">${brl(x.d)}</td><td class="r">${brl(x.c)}</td><td class="r">${brl(x.saldo)}</td></tr>`).join(''))}`}
  if(tab==='diario'){const E=partidasTodas();
    b=`<div style="margin:12px 0"><button class="btn dark" data-act="ctb-novo" ${can('ctb')?'':'disabled title="Só Financeiro e Administrativo"'}>Novo lançamento / ajuste</button></div>${E.length?tb(['Data','Origem','Histórico','Partidas','',''],E.slice(-80).reverse().map(e=>`<tr><td>${fdata(e.data)}</td><td>${esc(e.origem)}${e.ajuste?' <span class="pill warn">ajuste</span>':''}</td><td>${esc(e.desc||'')}${e.motivo?`<div class="mut" style="font-size:11.5px">${esc(e.motivo)}</div>`:''}</td><td class="mono" style="font-size:11.5px">${e.linhas.map(l=>(l.d?'D ':'C ')+l.conta+' '+brl(l.d||l.c)).join('<br>')}</td><td>${e.auto?'<span class="pill mute">automático</span>':''}</td><td>${!e.auto&&!e.estornado&&e.origem!=='Estorno'?`<button class="btn sm" data-act="ctb-est" data-id="${e.id}">Estornar</button>`:e.estornado?'estornado':''}</td></tr>`).join('')):'<div class="empty">Sem lançamentos ainda.</div>'}`}
  if(tab==='razao'){const c=S.ctbConta||(balancete().L[0]||{}).conta,L=partidasTodas().flatMap(e=>e.linhas.filter(l=>l.conta===c).map(l=>({e,l})));let sd=0;
    b=`<label>Conta</label><select id="rz-c" onchange="S.ctbConta=this.value;render()">${planoCtb().map(x=>`<option value="${x.codigo}" ${x.codigo===c?'selected':''}>${x.codigo} · ${esc(x.nome)}</option>`).join('')}</select>${L.length?tb(['Data','Histórico','R:Débito','R:Crédito','R:Saldo'],L.map(({e,l})=>{sd=r2(sd+(devedora(c)?l.d-l.c:l.c-l.d));return `<tr><td>${fdata(e.data)}</td><td>${esc(e.desc||'')}</td><td class="r">${l.d?brl(l.d):''}</td><td class="r">${l.c?brl(l.c):''}</td><td class="r">${brl(sd)}</td></tr>`}).join('')):'<div class="empty">Sem movimento nesta conta.</div>'}`}
  if(tab==='dre'){const d=dreCtb(),ba=balancoCtb(),g=dre(),l=(n,v,neg)=>`<tr><td>${n}</td><td class="r ${neg&&v<0?'neg':''}">${brl(v)}</td></tr>`;
    b=`<div class="cols" style="margin-top:14px"><div class="card"><div class="in"><div class="panel-t">DRE contábil</div><table class="tbl"><tbody>${l('Receita de medições',d.rec)}${l('(−) Tributos sobre a receita',d.ded)}${l('Receita líquida',d.liq)}${d.custos.map(x=>l('(−) '+x.conta+' '+esc(nomeCtb(x.conta)),x.saldo)).join('')}${l('Resultado',d.resultado,1)}</tbody></table><div class="sub" style="margin-top:8px">DRE gerencial (BM aprovados): resultado ${brl(g.resultado)}${Math.abs(g.resultado-d.resultado)<1?' · confere':' · difere: a contábil usa NFs emitidas e alíquotas estimadas'}.</div></div></div>
    <div class="card"><div class="in"><div class="panel-t">Balanço patrimonial</div><table class="tbl"><tbody>${l('Ativo',ba.A)}${l('Passivo',ba.P)}${l('Patrimônio líquido',ba.PL)}${l('Resultado do período',ba.res,1)}${l('Passivo + PL + resultado',ba.pasPL)}</tbody></table><div class="sub" style="margin-top:8px">${Math.abs(ba.A-ba.pasPL)<0.005?'Ativo = Passivo + PL + resultado.':'Atenção: balanço não fecha.'}</div></div></div></div>`}
  if(tab==='orc'){const O=orcamentoCtb();
    b=`<div class="sub">Meta da obra (EAP) por conta × realizado nas notas. Excesso pede liberação registrada.</div>${tb(['Conta','Nome','R:Orçado','R:Realizado','R:Desvio','Situação'],O.map(x=>`<tr><td class="mono">${x.c}</td><td>${esc(nomeCtb(x.c))}</td><td class="r">${brl(x.meta)}</td><td class="r">${brl(x.real)}</td><td class="r ${x.des>0?'neg':''}">${brl(x.des)}</td><td>${x.des>0.005?(x.lib?`<span class="pill warn" title="${esc(x.lib.motivo)}">liberação ${x.lib.status}</span>`:`<button class="btn sm" data-act="ctb-lib" data-c="${x.c}" ${can('fechaCtb')?'':'disabled'}>Pedir liberação</button>`):'<span class="pill ok">dentro</span>'}</td></tr>`).join(''))}`}
  if(tab==='fech'){const meses=[...new Set([...partidasTodas().map(e=>e.comp),comp,...S.t.fechs.map(f=>f.comp)])].sort().reverse();
    b=`<div class="sub">Fechar a competência bloqueia nota, pagamento, faturamento, recebimento e lançamento retroativos. Só a Diretoria reabre, com motivo.</div><div class="g3" style="grid-template-columns:1fr 3fr"><div><label>Competência</label><input id="ctb-comp" type="month" value="${comp}"></div></div>
    <div style="margin:8px 0"><button class="btn dark" data-act="ctb-fechar" ${can('fechaCtb')?'':'disabled title="Só Financeiro ou Diretoria"'}>Fechar ${comp}</button></div>${tb(['Competência','Situação','Fechada por',''],meses.map(m=>{const f=S.t.fechs.find(x=>x.comp===m&&!x.reaberta);return `<tr><td>${m}</td><td>${f?'<span class="pill ok">fechada</span>':'<span class="pill mute">aberta</span>'}</td><td>${f?esc(f.quem)+' · '+fdata(f.quando.slice(0,10)):''}</td><td class="r">${f?`<button class="btn sm" data-act="ctb-reabrir" data-c="${m}" ${can('reabreCtb')?'':'disabled title="Só Diretoria"'}>Reabrir</button>`:''}</td></tr>`}).join(''))}`}
  if(tab==='liv'){const csv=livrosCsv(comp),pr=S.t.par.procs||[];
    b=`<div class="g3" style="grid-template-columns:1fr 3fr"><div><label>Competência</label><input id="ctb-comp" type="month" value="${comp}"></div></div><div class="sub">Livros de entrada (notas recebidas) e de serviço (NFs emitidas) em CSV de apoio ao contador. Relatório: o sistema <b>não transmite</b> SPED nem Reinf; validar com o contador. A apuração estimada está em Financeiro → Apuração de tributos.</div>
    <textarea rows="6" readonly style="font-family:monospace;font-size:11.5px">${esc(csv)}</textarea><div style="margin-top:8px"><button class="btn" data-act="liv-copy">Copiar</button></div>
    <div class="panel-t" style="margin-top:16px">Processos (administrativos e fiscais)</div>${pr.map(x=>`<div class="row" style="grid-template-columns:1fr auto"><div><h4>${esc(x.texto)}</h4></div><span class="mut">${fdata(x.data)}</span></div>`).join('')}<div class="g2"><div><input id="pr-t" placeholder="Número, órgão e situação do processo"></div><div><button class="btn" data-act="proc-add" ${can('ctb')?'':'disabled'}>Registrar</button></div></div>`}
  if(tab==='plano'){b=tb(['Código','Nome','Tipo','Vínculo gerencial'],planoCtb().map(x=>`<tr><td class="mono">${x.codigo}</td><td>${esc(x.nome)}</td><td>${{A:'Ativo',P:'Passivo',PL:'Patrimônio líquido',R:'Receita',D:'Custo/despesa'}[x.tipo]}</td><td class="mono">${x.ger||''}</td></tr>`).join(''))}
  return `<div class="head"><div><h1>Contabilidade</h1><p class="lead">Partidas dobradas geradas das notas, pagamentos, faturamento e recebimentos; lançamento manual e de ajuste com motivo.</p></div></div>
  <div class="toolbar">${tabs('ctb',[['bal','Balancete'],['diario','Diário e lançamentos'],['razao','Razão'],['dre','DRE e Balanço'],['orc','Orçamento'],['fech','Fechamento'],['liv','Livros e apoio'],['plano','Plano contábil']],tab)}</div>${b}`}
ACOES['ctb-razao']=el=>{S.ctbConta=el.dataset.c;S.tab.ctb='razao';render()};
