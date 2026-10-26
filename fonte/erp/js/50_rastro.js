/* ============ DA TAREFA À COMPRA, AO CUSTO E AO BM (modo chave) ============
   Parte de uma tarefa do cronograma da semana (Ciclo) e mostra, com os vínculos que existem de verdade:
   tarefa -> solicitação -> cotação -> pedido -> recebimento -> nota (custo), e tarefa -> eventos que ela alimenta -> medição -> boletim -> NF -> recebimento.
   Os números vêm da função taf_erp_rastro (mesmas regras do ERP). Nada aqui pressupõe 1 tarefa = 1 pedido = 1 item de BM. */
const CANTEIRO={sem_pedido:['mute','Ainda sem pedido'],aguarda_aprovacao:['warn','Pedido aguarda aprovação'],pedido_emitido:['warn','Pedido emitido: o material ainda não chegou'],
  recebido_parcial:['warn','Chegou parte do material'],recebido:['ok','Material recebido no canteiro'],solicitacao_nao_encontrada:['bad','Solicitação não encontrada']};
const SOL_TXT={enviada:'Enviada',em_cotacao:'Em cotação',atendida:'Atendida (pedido emitido)',cancelada:'Cancelada'};
const OC_TXT={em_alcada:'Aguarda alçada',aprovada:'Aprovado',recebida_parcial:'Recebido em parte',recebida:'Recebido',cancelada:'Cancelada',reprovada:'Reprovado'};
const RS={tarefa:null,crono:null,dados:null,carregando:false,erro:'',todos:false,sig:'',dem:(+new URLSearchParams(location.search).get('demanda')||null),demandas:[]};
/* a tela se refaz sozinha quando o que foi lançado aqui (solicitação, pedido, recebimento, nota, medição, boletim, NF, recebimento) já foi gravado no banco */
const rsSig=()=>{const s=JSON.stringify(['elos','sols','ocs','notas','meds','bcs','fats','recs'].map(k=>S.t[k]||[]));let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return h+':'+s.length};
const rsSincronizado=()=>!SB.busy&&sbDocs().every(d=>SB.sync[d.id]===JSON.stringify(d.dados));
async function rastroCrono(){if(RS.crono)return RS.crono;
  const r=await chRpc('taf_ciclo_ler',{p_chave:CH.chave,p_obra:SB.obraId,p_seg:null,p_quem:CH.quem||null});
  RS.crono=(r.crono||[]).map(a=>({id:a.id,nome:a.nome,tipo:a.tipo,fase:a.fase,ini:a.ini,fim:a.fim}));
  RS.comps=((r.semana||{}).comps||[]).map(c=>c.ativ||c.id).filter(Boolean);RS.seg=r.seg;rastroDem(r);return RS.crono}
/* demandas do Ciclo (taf_ciclo_ler): o ERP só lê; a demanda continua uma só, com o mesmo número nas três telas */
function rastroDem(r){RS.demandas=(r.demandas||[]).map(d=>({num:d.num,area:d.area,oque:d.oque,resp:d.resp,prazo:d.prazo,efetivo:d.efetivo||d.prazo,nova_data:d.nova_data,
  ativs:d.ativs||[],item:d.item,situacao:d.situacao,ref_ext:d.ref_ext,vezes:d.vezes||0}))}
async function rastroRelerDem(){try{rastroDem(await chRpc('taf_ciclo_ler',{p_chave:CH.chave,p_obra:SB.obraId,p_seg:null,p_quem:CH.quem||null}))}catch(e){/* mantém as que já tinha */}}
const AREA_ROT={TECNICA:'Técnica',OPERACIONAL:'Operacional',SUPRIMENTOS:'Suprimentos (compras)',ADMINISTRATIVA:'Administrativa',FINANCEIRA:'Financeira',ECONOMICA:'Econômica',DIRETORIA:'Diretoria',CLIENTE:'Cliente / fiscal'};
const DEM_SIT={aberta:['warn','Aberta'],respondida:['warn','Respondida'],resolvida:['ok','Resolvida'],cancelada:['mute','Cancelada']};
const demDaTarefa=id=>(RS.demandas||[]).filter(d=>(d.ativs||[]).includes(id)&&d.situacao!=='cancelada');
async function rastroCarrega(id,manter){RS.tarefa=id;if(!manter)RS.dados=null;RS.erro='';RS.carregando=true;RS.sig=rsSig();if(!manter)render();
  if(RS.crono&&!manter&&RS.demLidas)await rastroRelerDem();RS.demLidas=true;
  try{RS.dados=await chRpc('taf_erp_rastro',{p_chave:CH.chave,p_obra:SB.obraId,p_ativ:id,p_quem:CH.quem||null})}
  catch(e){RS.erro=chMsg(e)}RS.carregando=false;render()}
function rastroVigia(){if(!RS.tarefa||!RS.dados||RS.carregando||RS.sig===rsSig())return;setTimeout(()=>{if(S.view!=='rastro'||RS.carregando)return;if(rsSincronizado())rastroCarrega(RS.tarefa,true);else render()},400)}
const rsPill=(k,t)=>`<span class="pill ${k}">${esc(t)}</span>`;
function viewRastro(X){
  if(!MODO_CH)return `<div class="head"><div><h1>Da tarefa à compra</h1><p class="lead">Disponível no site com a chave do TAF.</p></div></div>`;
  if(!RS.crono&&!RS.cronoPend){RS.cronoPend=1;rastroCrono().then(()=>{if(!RS.tarefa){const p=new URLSearchParams(location.search).get('tarefa');const ini=(p&&RS.crono.find(a=>a.id===p))?p:((RS.comps||[])[0]||null);if(ini){rastroCarrega(ini);return}}render()}).catch(e=>{RS.erro=chMsg(e);render()})}
  rastroVigia();const C=RS.crono||[],d=RS.dados;
  const opt=C.filter(a=>a.tipo!=='marco').map(a=>`<option value="${a.id}" ${a.id===RS.tarefa?'selected':''}>${a.id} · ${esc(String(a.nome).slice(0,70))}</option>`).join('');
  let corpo='';
  if(RS.erro)corpo=`<div class="err">${esc(RS.erro)}</div>`;
  else if(RS.carregando)corpo='<div class="sub" style="padding:18px">Carregando…</div>';
  else if(!d)corpo=`<div class="sub" style="padding:18px">${RS.crono?'Escolha uma tarefa do cronograma.':'Carregando o cronograma…'}</div>`;
  else corpo=rastroCorpo(d);
  return `<div class="head"><div><h1>Da tarefa à compra, ao custo e ao BM</h1><p class="lead">Escolha uma tarefa do cronograma e veja o que foi pedido para ela, se o material chegou, quanto já virou custo e a quais eventos de medição ela leva. Tarefa, pedido e item de BM não são um para um: aqui aparecem só os vínculos que existem.</p></div>
   <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn" href="/marko?obra=${encodeURIComponent(SB.obraId||'342')}">Tela do engenheiro</a><a class="btn" href="/ciclo?obra=${encodeURIComponent(SB.obraId||'342')}&aba=sit">Visão da gestão</a></div></div>
   ${avisoSqlCalc()}${avisoSqlLinhas()}<div class="toolbar"><select id="rs-sel" style="min-width:min(520px,100%)"><option value="">Escolha a tarefa…</option>${opt}</select></div>${corpo}`}
/* demandas do Ciclo que travam esta tarefa, e se cada uma já tem compra ligada (o vínculo guarda o número da demanda) */
function rastroDemandas(d){
  const L=demDaTarefa(d.ativ.id);if(!L.length)return `<div class="card"><div class="in"><div class="panel-t">Demandas desta tarefa no Ciclo</div><div class="sub">Nenhuma demanda aberta aponta para a tarefa ${esc(d.ativ.id)}. A compra pode ser ligada mesmo assim.</div></div></div>`;
  const lig=n=>(d.compras||[]).filter(c=>+c.demanda===+n);
  return `<div class="card"><div class="in"><div class="panel-t">Demandas desta tarefa no Ciclo</div>
   <div class="tw"><table class="tbl"><thead><tr><th>Demanda</th><th>O que precisa</th><th>Responsável e prazo</th><th>Compra ligada</th><th></th></tr></thead><tbody>${L.map(x=>{const sit=DEM_SIT[x.situacao]||['mute',x.situacao],ls=lig(x.num),ehCompra=x.area==='SUPRIMENTOS'||x.item==='material';
    return `<tr${+x.num===RS.dem?' style="outline:2px solid var(--brand,#2b6cb0);outline-offset:-2px"':''}><td><b class="mono">D${x.num}</b><div class="mut" style="font-size:11.5px">${esc(AREA_ROT[x.area]||x.area)}${x.item?' · '+esc(x.item):''}</div></td>
     <td>${esc(x.oque)}</td><td>${esc(x.resp)}<div class="mut" style="font-size:11.5px">precisa até ${fdata(x.prazo)}${x.nova_data?' · nova data '+fdata(x.nova_data):''}</div>${rsPill(sit[0],sit[1])}</td>
     <td>${ls.length?ls.map(c=>`<b class="mono">${esc((c.sol||{}).num||'?')}</b>${c.item?' · item '+esc(c.item.codigo):''}`).join('<br>'):(ehCompra?'<span class="mut">Ainda sem compra ligada</span>':'<span class="mut">não é compra</span>')}</td>
     <td class="r" style="white-space:nowrap">${ehCompra?`<button class="btn sm dark" data-act="rs-nova" data-dem="${x.num}" ${can('rastro')?'':'disabled'}>Nova solicitação</button> <button class="btn sm" data-act="rs-liga" data-dem="${x.num}" ${can('rastro')?'':'disabled'}>Ligar existente</button> `:''}<a class="btn sm" href="/ciclo?obra=${encodeURIComponent(SB.obraId||'342')}&aba=dem&demanda=${x.num}">Ver na semana</a></td></tr>`}).join('')}</tbody></table></div>
   <div class="sub">A demanda é a do Marko, com o mesmo número. A compra fica no ERP e só é ligada aqui; nada é digitado duas vezes.</div></div></div>`}
function rastroCorpo(d){
  /* primeiro os eventos dos itens que já têm compra ligada, depois o próprio evento da tarefa, depois os mais próximos no tempo */
  const evCompra=new Set((d.compras||[]).map(c=>c.item&&c.item.evento).filter(Boolean));
  const pri=e=>evCompra.has(e.evento)?0:e.via==='propria'?1:2;
  const a=d.ativ,E=[...(d.eventos||[])].sort((x,y)=>pri(x)-pri(y)||String(x.previsto_fim).localeCompare(String(y.previsto_fim)));
  const mostra=RS.todos?E:E.slice(0,5);
  const exec=a.fim_real?rsPill('ok','Concluída em '+fdata(a.fim_real)):a.ini_real?rsPill('warn','Em andamento desde '+fdata(a.ini_real)):rsPill('mute','Sem início registrado');
  let h=rastroDemandas(d);
  h+=`<div class="card" style="margin-top:12px"><div class="in"><div class="panel-t">1. Tarefa no cronograma</div>
    <div class="row" style="grid-template-columns:1fr auto"><div><h4>${esc(a.id)} · ${esc(a.nome)}</h4><p>${esc(a.fase||'')} · previsto ${fdata(a.prev_ini)} a ${fdata(a.prev_fim)}${a.evento?' · é o evento '+esc(a.evento):''}</p></div>${exec}</div>
    <div class="sub">Início e fim reais vêm do apontamento do Marko, no Ciclo. Pedido emitido ou nota lançada não contam como execução.</div></div></div>`;
  h+=`<div class="card" style="margin-top:12px"><div class="in"><div class="panel-t">2. Compras ligadas a esta tarefa</div>`;
  const cs=d.compras||[];
  h+=cs.length?`<div class="tw"><table class="tbl"><thead><tr><th>Solicitação</th><th>Item da planilha</th><th>Cotação e pedido</th><th>No canteiro</th><th class="r">Pedido</th><th class="r">Nota (custo)</th><th></th></tr></thead><tbody>${cs.map(c=>{const s=c.sol||{},it=c.item,cn=CANTEIRO[c.canteiro]||['mute',c.canteiro],ocs=c.oc||[];
    return `<tr><td><b class="mono">${esc(s.num||'?')}</b><div class="mut" style="font-size:11.5px">${esc(SOL_TXT[s.status]||s.status||'')}${c.demanda?' · D'+c.demanda:''}</div><div class="mut" style="font-size:11.5px">${esc(s.desc||'')}</div></td>
     <td>${it?`<span class="mono">${esc(it.codigo)}</span><div class="mut" style="font-size:11.5px">evento ${esc(it.evento||'—')} · pacote ${esc(it.pacote||'—')}</div>`:'<span class="mut">item fora da planilha</span>'}</td>
     <td>${s.cotacoes?`${s.cotacoes} cotação(ões), menor ${brl(s.menor_cotacao)}`:'sem cotação'}${ocs.map(o=>`<div class="mono" style="font-size:12px">${esc(o.num)} · ${esc(OC_TXT[o.status]||o.status)}</div>`).join('')}</td>
     <td>${rsPill(cn[0],cn[1])}${ocs.length?`<div class="mut" style="font-size:11.5px">${num(ocs.reduce((t,o)=>t+(+o.recebido_qtd||0),0))} de ${num(ocs.reduce((t,o)=>t+(+o.qtd||0),0))} ${esc((it||{}).unidade||'')}</div>`:''}</td>
     <td class="r">${ocs.length?brl(c.pedido_valor):'—'}</td><td class="r">${(c.notas||[]).length?brl(c.nota_valor)+`<div class="mut" style="font-size:11.5px">${(c.notas||[]).map(n=>esc(n.num)).join(', ')}</div>`:'—'}</td>
     <td class="r"><button class="btn sm" data-act="rs-abrir" data-sol="${esc(c.sol?c.sol.id:'')}">Abrir</button> <button class="btn sm" data-act="rs-solta" data-elo="${esc(c.elo)}" ${can('rastro')?'':'disabled'}>Soltar</button></td></tr>`}).join('')}</tbody></table></div>
    <div class="sub">A mesma solicitação pode atender várias tarefas, e uma tarefa pode ter várias solicitações. O valor fica no pedido e na nota, uma vez só.</div>`
    :`<div class="sub">Nenhuma solicitação foi ligada a esta tarefa ainda.</div>`;
  h+=`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn dark" data-act="rs-nova" ${can('rastro')?'':'disabled title="Seu papel não liga compras a tarefas"'}>Nova solicitação para esta tarefa</button><button class="btn" data-act="rs-liga" ${can('rastro')?'':'disabled'}>Ligar solicitação que já existe</button></div></div></div>`;
  const sv=d.compras_do_evento_sem_vinculo||[];
  if(sv.length)h+=`<div class="card" style="margin-top:12px"><div class="in"><div class="panel-t">Compras nos mesmos eventos, sem vínculo com esta tarefa</div><div class="sub">Aparecem só pelo evento. Não são da tarefa até alguém ligar.</div>
    <div class="tw"><table class="tbl"><tbody>${sv.slice(0,8).map(x=>`<tr><td class="mono">${esc(x.sol)}</td><td>${esc(x.desc||'')}</td><td class="mono">${esc(x.item)}</td><td>evento ${esc(x.evento)}</td><td>${esc(SOL_TXT[x.status]||x.status)}</td><td class="r">${brl(x.valor)}</td></tr>`).join('')}</tbody></table></div></div></div>`;
  h+=`<div class="card" style="margin-top:12px"><div class="in"><div class="panel-t">3. Eventos de medição que esta tarefa alimenta (pelas dependências do cronograma)</div>`;
  h+=E.length?`<div class="tw"><table class="tbl"><thead><tr><th>Evento</th><th>BM previsto</th><th class="r">Receita contratual</th><th class="r">Meta de custo</th><th class="r">Cotado em aberto</th><th class="r">Comprometido</th><th class="r">Realizado</th></tr></thead><tbody>${mostra.map(e=>`<tr><td><b class="mono">${esc(e.evento)}</b><div class="mut" style="font-size:11.5px">${esc(String(e.ativ_nome).replace(/^EVENTO [\d.]+ - /,'').slice(0,60))} · ${e.via==='propria'?'é esta tarefa':'via '+esc(e.ativ)}${evCompra.has(e.evento)?' · <b>tem compra ligada</b>':''}</div></td>
     <td>${esc(e.bm_previsto||'—')}<div class="mut" style="font-size:11.5px">fim ${fdata(e.previsto_fim)}</div></td><td class="r">${brl(e.receita_contratual)}</td><td class="r">${brl(e.meta_custo)}</td><td class="r">${brl(e.cotado_aberto)}</td><td class="r">${brl(e.comprometido)}</td><td class="r">${brl(e.realizado)}</td></tr>
     <tr><td colspan="7" style="padding-top:0"><span class="mut" style="font-size:11.5px">Medição: lançada ${brl(e.medicao.lancada)} · atestada ${brl(e.medicao.atestada)} · em boletim ${brl(e.medicao.em_boletim)} · aprovada pelo cliente ${brl(e.medicao.aprovada_cliente)} · faturada ${brl(e.medicao.faturada)} · recebida ${brl(e.medicao.recebida)}</span></td></tr>`).join('')}</tbody></table></div>
    ${E.length>5?`<button class="btn sm" data-act="rs-todos">${RS.todos?'Mostrar só os 5 primeiros':'Mostrar os '+E.length+' eventos'}</button>`:''}
    <div class="sub">Receita é o preço licitado dos itens do evento. Meta é o custo interno. Comprometido é pedido aprovado que ainda não virou nota; realizado é a nota rateada. Nada disso é dinheiro recebido: a linha de medição separa cada etapa.</div>`
    :`<div class="sub">Pelas dependências conhecidas, esta tarefa não leva a nenhum evento de medição.</div>`;
  h+=`</div></div>`;
  if((d.avisos||[]).length)h+=`<div class="card" style="margin-top:12px"><div class="in"><div class="panel-t">Atenção</div>${d.avisos.map(t=>`<div class="alert"><div class="g" style="color:var(--warn)"><svg class="ic" viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01"/></svg></div><div><p>${esc(t)}</p></div></div>`).join('')}</div></div>`;
  h+=`<div class="sub" style="margin-top:12px">${(d.regras||[]).map(esc).join(' · ')}</div>`;
  return h}
document.addEventListener('change',e=>{if(e.target&&e.target.id==='rs-sel'){const v=e.target.value;if(v)rastroCarrega(v);else{RS.tarefa=null;RS.dados=null;render()}}});
async function rastroGrava(){for(let i=0;i<30&&SB.busy;i++)await new Promise(r=>setTimeout(r,100));await chSync();if(RS.tarefa)await rastroCarrega(RS.tarefa)}
function rastroElo(sol,demanda){const ativ=RS.tarefa,id='elo-'+ativ+'-'+sol,ex=S.t.elos.find(x=>x.id===id);
  if(ex){if(ex.cancelado){ex.cancelado=false;delete ex.cancelado_por}else return toast('Já está ligada.')}
  else S.t.elos.unshift({id,ativ,sol,demanda:demanda||null,quem:user(),em:new Date().toISOString()});
  log('vinculo',ativ,'solicitação '+sol,'','ligada');save()}
ACOES['rs-todos']=()=>{RS.todos=!RS.todos;render()};
ACOES['rs-abrir']=el=>{S.view='compras';S.tab.compras='sols';render()};
ACOES['rs-nova']=el=>{if(!RS.tarefa)return;const dn=+(el&&el.dataset&&el.dataset.dem)||null,dm=dn?(RS.demandas||[]).find(x=>x.num===dn):null;
  S.rastroPend={ativ:RS.tarefa,demanda:dn};S.view='compras';S.tab.compras='sols';render();modalSol();
  if(dm){const a=$('#s-desc'),b=$('#s-dt'),m=$('#s-mot');if(a&&!a.value)a.value=String(dm.oque).slice(0,80);if(b&&!b.value)b.value=dm.efetivo||dm.prazo||'';if(m&&!m.value)m.value='Demanda D'+dm.num+' do Ciclo, tarefa '+RS.tarefa}};
ACOES['rs-liga']=el=>{const ja=new Set(S.t.elos.filter(x=>x.ativ===RS.tarefa&&!x.cancelado).map(x=>x.sol)),dn=+(el&&el.dataset&&el.dataset.dem)||RS.dem||0;
  const L=S.t.sols.filter(s=>s.status!=='cancelada'&&!ja.has(s.id)),ds=demDaTarefa(RS.tarefa);
  modal(`<h3>Ligar solicitação à tarefa ${esc(RS.tarefa)}</h3><div class="sub">Só liga: a solicitação continua uma só, com o mesmo valor. Pode atender mais de uma tarefa.</div>
   <label>Solicitação</label><select id="rl-sol">${L.map(s=>`<option value="${s.id}">${esc(s.num)} · ${esc(s.desc)} · item ${esc(itensTxt(s))}</option>`).join('')||'<option value="">Nenhuma solicitação disponível</option>'}</select>
   <label>Demanda do Ciclo que esta compra atende (opcional)</label><select id="rl-dem"><option value="">nenhuma</option>${ds.map(x=>`<option value="${x.num}" ${x.num===dn?'selected':''}>D${x.num} · ${esc(String(x.oque).slice(0,70))}</option>`).join('')}</select>
   <div class="acts"><button class="btn" data-act="fechar">Cancelar</button><button class="btn dark" data-act="rs-liga-ok" ${L.length?'':'disabled'}>Ligar</button></div>`)};
ACOES['rs-liga-ok']=async()=>{const s=$('#rl-sol').value;if(!s)return;rastroElo(s,+$('#rl-dem').value||null);closeModal();await rastroGrava();toast('Solicitação ligada à tarefa.')};
ACOES['rs-solta']=async el=>{const x=S.t.elos.find(o=>o.id===el.dataset.elo);if(!x)return;x.cancelado=true;x.cancelado_por=user();log('vinculo',x.ativ,'solicitação '+x.sol,'ligada','solta');save();await rastroGrava();toast('Vínculo desfeito. A solicitação continua existindo.')};
/* o vínculo nasce junto com a solicitação criada a partir da tarefa */
function rastroAposSol(s){if(!S.rastroPend)return false;const p=S.rastroPend;S.rastroPend=null;RS.tarefa=p.ativ;rastroElo(s.id,p.demanda||null);S.view='rastro';setTimeout(rastroGrava,60);return true}
