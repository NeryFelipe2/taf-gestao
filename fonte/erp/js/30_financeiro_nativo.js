/* ============ FINANCEIRO NATIVO (Fase 13): contas, extrato OFX, baixa múltipla, cobrança, remessa CNAB ============ */
const contaSel=()=>S.contaSel&&S.t.bancos.some(b=>b.id===S.contaSel)?S.contaSel:(S.t.bancos[0]||{}).id;
const saldoConta=b=>r2((b.saldoIni||0)+S.t.movs.filter(m=>m.banco===b.id&&!m.dup).reduce((s,m)=>s+m.valor,0));
function ofxParse(txt){const out=[];String(txt||'').replace(/<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>|$)/gi,(_,b)=>{
  const g=t=>{const m=b.match(new RegExp('<'+t+'>([^<\\r\\n]*)','i'));return m?m[1].trim():''};
  const d=g('DTPOSTED').slice(0,8),v=numOfx(g('TRNAMT'));if(!/^\d{8}$/.test(d)||!isFinite(v)||v===0)return;
  out.push({data:`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`,valor:r2(v),desc:g('MEMO')||g('NAME'),fitid:g('FITID')})});return out}
const numOfx=s=>{s=String(s).trim();return s.includes(',')&&!s.includes('.')?+s.replace(',','.'):+s};
function ofxImportar(){const id=contaSel();if(!id)return toast('Cadastre uma conta bancária antes (Suprimentos → Cadastros)');
  const L=ofxParse($('#ofx-arq').value);if(!L.length)return toast('Nenhuma transação encontrada no OFX');
  const ja=new Set(S.t.movs.filter(m=>m.banco===id).map(m=>m.fitid).filter(Boolean));let n=0,rep=0;
  L.forEach(t=>{if(t.fitid&&ja.has(t.fitid)){rep++;return}S.t.movs.push({id:'mv'+Date.now()+Math.random().toString(36).slice(2,6),banco:id,data:t.data,valor:t.valor,desc:t.desc,fitid:t.fitid,origem:'OFX'});n++});
  const c=conciliaMovs(id);log('extrato','OFX','importar','',n+' movimentos, '+rep+' repetidos, '+c+' conciliados');save();toast(n+' movimentos importados, '+rep+' repetidos, '+c+' conciliados');render()}
/* concilia saídas com notas pagas de mesmo valor e entradas com recebimentos de mesmo valor */
function conciliaMovs(id){let c=0;S.t.movs.filter(m=>m.banco===id&&!m.conc&&m.origem!=='baixa').forEach(m=>{
  if(m.valor<0){/* extrato confirma uma baixa já feita no sistema, ou uma nota paga sem baixa pela conta */
    const bx=S.t.movs.find(x=>x.banco===id&&x.origem==='baixa'&&!x.conc&&Math.abs(x.valor-m.valor)<.005);
    if(bx){const n=S.t.notas.find(n=>n.id===bx.nota);bx.conc=m.conc=n?n.num:"baixa";m.dup=true;if(n)n.conc=m.data;c++;return}
    const n=S.t.notas.find(n=>n.status==='paga'&&!n.conc&&Math.abs(n.valor+(n.encargos||0)-Math.abs(m.valor))<.005);if(n){n.conc=m.data;m.conc=n.num;c++}}
  else{const r=S.t.recs.find(r=>!r.conc&&Math.abs(r.valor-m.valor)<.005);if(r){r.conc=m.data;m.conc=r.id;c++}}});return c}
function movManual(){const id=contaSel(),v=+$('#mv-v').value,d=$('#mv-d').value||hojeISO(),ds=$('#mv-t').value.trim();if(!id||!v||!ds)return toast('Informe conta, descrição e valor (negativo = saída)');
  S.t.movs.push({id:'mv'+Date.now(),banco:id,data:d,valor:r2(v),desc:ds,origem:'manual'});log('extrato','manual','lançar','',brl(v)+' · '+ds);save();toast('Lançado');render()}
/* baixa múltipla: paga várias notas liberadas de uma vez, com juros, multa e desconto rateados proporcionalmente */
function baixaMultipla(){const ids=[...document.querySelectorAll('.bx:checked')].map(e=>e.value);if(!ids.length)return toast('Marque as notas');const banco=contaSel();if(!banco)return toast('Cadastre uma conta bancária');
  const ju=+$('#bx-j').value||0,mu=+$('#bx-m').value||0,de=+$('#bx-d').value||0,dt=$('#bx-dt').value||hojeISO(),ns=ids.map(i=>S.t.notas.find(n=>n.id===i)).filter(n=>n&&n.status==='liberada');
  if(!ns.length)return toast('Nenhuma nota liberada marcada');const base=ns.reduce((s,n)=>s+n.valor,0),adj=r2(ju+mu-de);let rest=adj;
  ns.forEach((n,k)=>{const q=k===ns.length-1?rest:r2(adj*n.valor/base);rest=r2(rest-q);n.status='paga';n.pago=dt;n.encargos=q;
    S.t.movs.push({id:'mv'+Date.now()+k,banco,data:dt,valor:-r2(n.valor+q),desc:'Pagamento '+n.num+' · '+n.emitente,origem:'baixa',nota:n.id});
    log('nota_fiscal',n.num,'status','liberada','paga (baixa múltipla'+(q?', encargos '+brl(q):'')+')')});
  save();toast(ns.length+' notas pagas · total '+brl(base+adj));render()}
ACOES['ofx-imp']=()=>{if(!can('liberar'))return toast('Só Financeiro');ofxImportar()};
ACOES['mv-novo']=()=>{if(!can('lan'))return toast('Só Financeiro');movManual()};
ACOES['bx-ok']=()=>{if(!can('liberar'))return toast('Só Financeiro');baixaMultipla()};
ACOES['conta-sel']=el=>{S.contaSel=el.dataset.id;render()};
function viewContas(){
  const B=S.t.bancos,id=contaSel(),b=B.find(x=>x.id===id),M=S.t.movs.filter(m=>m.banco===id).sort((x,y)=>y.data.localeCompare(x.data)),lib=S.t.notas.filter(n=>n.status==='liberada');
  if(!B.length)return `<div class="empty">Nenhuma conta bancária cadastrada. Cadastre em Suprimentos → Cadastros → Bancos.</div>`;
  return `<div class="kpi4">${B.map(x=>`<div class="clk" data-act="conta-sel" data-id="${x.id}" style="${x.id===id?'outline:2px solid var(--ink)':''}"><div class="k-l">${esc(x.desc)}</div><div class="v ${saldoConta(x)<0?'neg':''}">${brl(saldoConta(x),true)}</div></div>`).join('')}</div>
  <div class="cols" style="margin-top:14px"><div class="card"><div class="in"><div class="panel-t">Importar extrato OFX</div><div class="sub">Cole o conteúdo do arquivo .ofx do banco. Transações já importadas (mesmo FITID) são ignoradas e o sistema concilia sozinho com notas pagas e recebimentos de mesmo valor.</div>
    <textarea id="ofx-arq" rows="4" placeholder="<STMTTRN>…"></textarea><div style="margin-top:8px"><button class="btn dark" data-act="ofx-imp" ${can('liberar')?'':'disabled title="Só Financeiro"'}>Importar e conciliar</button></div></div></div>
   <div class="card"><div class="in"><div class="panel-t">Lançamento manual na conta</div><div class="g3"><div><label>Data</label><input id="mv-d" type="date" value="${hojeISO()}"></div><div><label>Valor (− saída)</label><input id="mv-v" type="number" step="any"></div><div><label>Descrição</label><input id="mv-t"></div></div><div style="margin-top:8px"><button class="btn" data-act="mv-novo" ${can('lan')?'':'disabled title="Só Financeiro"'}>Lançar</button></div></div></div></div>
  <div class="panel-t" style="margin-top:16px">Baixa múltipla de notas liberadas</div>
  ${lib.length?`<div class="tw"><table class="tbl"><tbody>${lib.map(n=>`<tr><td><input type="checkbox" class="bx" value="${n.id}"></td><td class="mono">${n.num}</td><td>${esc(n.emitente)}</td><td>vence ${fdata(vencNota(n))}</td><td class="r">${brl(n.valor)}</td></tr>`).join('')}</tbody></table></div>
   <div class="g3"><div><label>Juros</label><input id="bx-j" type="number" step="any" value="0"></div><div><label>Multa</label><input id="bx-m" type="number" step="any" value="0"></div><div><label>Desconto</label><input id="bx-d" type="number" step="any" value="0"></div></div><div class="g3"><div><label>Pago em</label><input id="bx-dt" type="date" value="${hojeISO()}"></div></div>
   <div style="margin-top:8px"><button class="btn dark" data-act="bx-ok" ${can('liberar')?'':'disabled title="Só Financeiro"'}>Pagar marcadas</button> <button class="btn" data-act="cnab-gera" ${can('liberar')?'':'disabled'}>Gerar remessa CNAB 240 (genérica)</button></div>
   ${S.cnabOut?`<label>Remessa gerada — layout genérico, <b>validar com o banco antes de enviar</b></label><textarea rows="6" readonly style="font-family:monospace;font-size:11px">${esc(S.cnabOut)}</textarea>`:''}`:'<div class="sub">Nenhuma nota liberada para pagamento.</div>'}
  <div class="panel-t" style="margin-top:16px">Extrato de ${b?esc(b.desc):''}</div>${M.length?`<div class="tw"><table class="tbl"><thead><tr><th>Data</th><th>Descrição</th><th class="r">Valor</th><th>Origem</th><th>Conciliação</th></tr></thead><tbody>${M.slice(0,60).map(m=>`<tr><td>${fdata(m.data)}</td><td>${esc(m.desc)}</td><td class="r ${m.valor<0?'neg':'pos'}">${brl(m.valor)}</td><td>${m.origem}</td><td>${m.conc?'<span class="pill ok">conciliado</span>':'<span class="pill mute">pendente</span>'}</td></tr>`).join('')}</tbody></table></div>`:'<div class="sub">Sem movimentos.</div>'}`}
/* Remessa CNAB 240 genérica (pagamento a fornecedores). Posições seguem o padrão FEBRABAN de forma simplificada: o banco exige homologação do layout. */
function cnabGera(){const b=S.t.bancos.find(x=>x.id===contaSel()),ns=S.t.notas.filter(n=>n.status==='liberada');if(!b||!ns.length)return toast('Sem conta ou notas liberadas');
  const pad=(s,n,c=' ')=>String(s).slice(0,n).padEnd(n,c),num=(v,n)=>String(Math.round(v)).replace(/\D/g,'').padStart(n,'0').slice(-n),dd=hojeISO().split('-').reverse().join('');
  const emp=S.t.par.emp||{};const L=[pad('00000000'+pad(b.banco,3)+'00000'+'         2'+num((emp.cnpj||'').replace(/\D/g,'')||0,14)+pad(emp.razao||"TAF",30)+pad(b.banco,30)+'          1'+dd,240)];
  L.push(pad('0000130000100'+'C2001'+'046'+' 2'+num((emp.cnpj||'').replace(/\D/g,'')||0,14),240));
  ns.forEach((n,k)=>{const f=S.t.forns.find(x=>x.nome===n.emitente)||{};L.push(pad('00000013'+num(k+1,5)+'A000000'+pad(f.banco||'',3,'0')+'00000'+num(0,13)+pad(n.emitente,30)+pad(n.num,20)+dd+'BRL'+num(0,15)+num(n.valor*100,15),240))});
  L.push(pad('00000015         '+num(ns.length+2,6)+num(ns.reduce((s,n)=>s+n.valor*100,0),18),240));L.push(pad('99999999         000001'+num(ns.length+4,6),240));
  S.cnabOut=L.join('\r\n');log('remessa','CNAB240','gerar','',ns.length+' pagamentos');save();render()}
ACOES['cnab-gera']=cnabGera;
/* ---- cobrança ---- */
const msgCobr=f=>`Olá! Identificamos que a nota ${f.num} (${brl(fatSaldo(f))}) venceu em ${fdata(f.venc)} e consta em aberto. Pode nos confirmar a previsão de pagamento? Obrigado.`;
ACOES['cobr-reg']=el=>{if(!can('recFat'))return toast('Sem permissão');const f=S.t.fats.find(x=>x.id===el.dataset.id);S.t.cobrs.push({id:'cb'+Date.now(),fat:f.id,num:f.num,data:hojeISO(),canal:'WhatsApp',quem:user()});log('cobranca',f.num,'enviada','','régua: WhatsApp');save();render()};
function viewCobranca(){const V=S.t.fats.filter(f=>fatSaldo(f)>0&&f.venc<hojeISO()).sort((a,b)=>a.venc.localeCompare(b.venc)),dias=f=>Math.round((new Date(hojeISO())-new Date(f.venc))/864e5);
  const etapa=d=>d>60?['bad','Jurídico']:d>30?['bad','Diretoria']:d>15?['warn','Gerente']:['info','Lembrete'];
  return `<div class="sub">Notas de serviço vencidas e não recebidas. A mensagem abre no WhatsApp para você enviar (o sistema não envia sozinho) e o contato fica registrado.</div>
  ${V.length?`<div class="tw"><table class="tbl"><thead><tr><th>NF</th><th>Vencida há</th><th class="r">Saldo</th><th>Etapa</th><th>Contatos</th><th></th></tr></thead><tbody>${V.map(f=>{const d=dias(f),e=etapa(d),n=S.t.cobrs.filter(c=>c.fat===f.id).length;return `<tr><td class="mono">${f.num}</td><td>${d} dias</td><td class="r">${brl(fatSaldo(f))}</td><td><span class="pill ${e[0]}">${e[1]}</span></td><td>${n}</td><td class="r"><a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msgCobr(f))}">Abrir mensagem</a> <button class="btn sm" data-act="cobr-reg" data-id="${f.id}" ${can('recFat')?'':'disabled'}>Registrar contato</button></td></tr>`}).join('')}</tbody></table></div>`:'<div class="empty">Nenhuma nota vencida a receber.</div>'}`}
