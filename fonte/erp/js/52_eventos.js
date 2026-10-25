/* ============ EVENTOS (M2): meta, limite, comprometido, realizado, saldo e semáforo por evento e por pacote ============
   Só leitura: nada daqui grava. Os números vêm de agregaEventos() e agregaPacotes() (06_derivados.js), que só somam o que o ERP já guarda por item.
   Aparece quando a chave par.ev_agrega da obra está ligada (Compras → Parâmetros → Chaves desta obra).
   As cores seguem a regra do item aplicada ao grupo e o "limite" é o teto que o ERP já tem [SUPOSIÇÃO: D1 do plano, ainda sem ok do Felipe]. */
const SEMG_TXT={verde:'verde',amarelo:'amarelo',vermelho:'vermelho',sem_base:'sem base'};
const semGPill=s=>`<span class="pill ${SEM_CLASS[s[0]]||'mute'}" title="${esc(s[1])}">${SEMG_TXT[s[0]]||esc(s[0])}</span>`;
function eventosRotulo(g,modo){
  if(g.chave==='')return `<b>${modo==='pacote'?'Sem pacote':modo==='grupo'?'Sem grupo':'Sem evento'}</b><div class="mut" style="font-size:11.5px">${g.n} ${g.n===1?'item':'itens'} sem ${modo==='pacote'?'pacote':modo==='grupo'?'grupo':'evento'} · entram nas somas</div>`;
  if(modo==='pacote'&&g.semCadastro)return `<b class="mono">${rotCod(g.chave)}</b><div><span class="pill warn">pacote não cadastrado</span></div><div class="mut" style="font-size:11.5px">o código do pacote nos itens não é igual a nenhum pacote do cadastro</div>`;
  if(modo==='pacote')return `<b>${esc(g.nome||g.chave)}</b><div class="mono mut">${esc(g.chave)}</div>`;
  return `<span class="mono"><b>${esc(g.chave)}</b></span>${g.nome?`<div class="mut" style="font-size:11.5px">${esc(g.nome)}</div>`:''}`}
/* código com espaço no começo ou no fim aparece entre aspas, para não parecer igual ao do cadastro */
const rotCod=c=>esc(c!==c.trim()?'“'+c+'”':c);
const eventosOutras=(L,vazio)=>L.length?L.map(c=>c===''?`<span class="mut">${vazio}</span>`:`<span class="mono">${rotCod(c)}</span>`).join(' '):'—';
function eventosLinha(g,modo,temRef){
  const dif=temRef&&modo==='evento'?(g.ref!=null?`<td class="r">${brl(g.ref)}</td><td class="r ${Math.abs(g.dif)>0.004?'neg':''}">${Math.abs(g.dif)>0.004?`<b>${g.dif>0?'+':''}${brl(g.dif)}</b>`:'—'}</td>`:'<td class="r mut">—</td><td class="r mut">—</td>'):'';
  const cad=modo==='pacote'&&g.cadastro&&g.cadastro.teto!=null&&Math.abs(g.cadastro.teto-g.teto)>0.004?`<div class="mut" style="font-size:11.5px" title="Valor fixo do cadastro do pacote">cadastro do pacote: ${brl(g.cadastro.teto)}</div>`:'';
  return `<tr class="clk" data-act="ev-det" data-m="${modo}" data-k="${esc(g.chave)}"><td>${eventosRotulo(g,modo)}</td><td>${eventosOutras(g.outras,modo==='pacote'?'sem evento':'sem pacote')}</td><td class="r">${g.n}</td><td class="r mut">${brl(g.venda)}</td>${dif}<td class="r">${brl(g.meta)}</td><td class="r ${grupoSemFolga(g)?'neg':''}">${g.temTeto?brl(g.teto):'—'}${cad}</td><td class="r">${brl(g.comp)}</td><td class="r">${brl(g.real)}</td><td class="r ${g.livre<0?'neg':''}">${brl(g.livre)}</td><td>${bar(g.comp,g.real,g.meta)}</td><td>${semGPill(g.sem)}</td></tr>`}
function eventosTabela(R,modo){
  const temRef=!!R.temRef&&modo==='evento',tot=R.total,cab=modo==='pacote'?'Pacote':modo==='grupo'?'Grupo da EAP':'Evento';
  const c=R.confere,falhas=Object.keys(c.campos).filter(k=>!c.campos[k]);
  const conf=c.ok?`<span class="pill ok">fecha com a obra</span> A soma ${modo==='pacote'?'dos pacotes':modo==='grupo'?'dos grupos':'dos eventos'} (inclusive “sem ${modo==='pacote'?'pacote':modo==='grupo'?'grupo':'evento'}”) é igual ao total da obra em receita, meta, limite, comprometido, realizado e saldo.`
    :`<span class="pill bad">não fecha com a obra</span> Diferença em: ${falhas.join(', ')||'quantidade de itens'}. Avise a Gestão.`;
  return `<div class="tw"><table class="tbl"><thead><tr><th>${cab}</th><th>${modo==='pacote'?'Eventos':'Pacotes'}</th><th class="r">Itens</th><th class="r">Receita (licitado)</th>${temRef?'<th class="r">Eventograma oficial</th><th class="r">Diferença</th>':''}<th class="r">Meta</th><th class="r">Limite (teto)</th><th class="r">Comprom.</th><th class="r">Realizado</th><th class="r">Saldo</th><th>Consumo</th><th>Semáforo</th></tr></thead>
   <tbody>${R.grupos.map(g=>eventosLinha(g,modo,temRef)).join('')}</tbody>
   <tfoot><tr class="grp"><td><b>Total da obra</b></td><td></td><td class="r">${tot.n}</td><td class="r">${brl(tot.venda)}</td>${temRef?`<td class="r">${brl(R.grupos.reduce((s,g)=>s+(g.ref||0),0))}</td><td class="r"></td>`:''}<td class="r">${brl(tot.meta)}</td><td class="r">${brl(tot.teto)}</td><td class="r">${brl(tot.comp)}</td><td class="r">${brl(tot.real)}</td><td class="r ${tot.livre<0?'neg':''}">${brl(tot.livre)}</td><td>${bar(tot.comp,tot.real,tot.meta)}</td><td></td></tr></tfoot></table></div>
   <div class="sub" style="margin-top:8px">${conf}</div>`}
/* ---------- painel (skill design-de-painel): mensagem principal, 4 a 5 números com origem, um cartão por evento ou pacote, tabela só se a pessoa pedir ----------
   Hierarquia: título > frase > números > cartões. Cada número diz de onde vem. A cor do cartão sempre vem com texto (a etiqueta e o motivo).
   Só variáveis de tema do ERP (style.css, bloco "Eventos"): vale nos temas claro e escuro. Os cartões mais graves vêm primeiro; "Sem evento" e "Sem pacote" ficam no fim. */
const SEM_ORDEM={vermelho:0,amarelo:1,sem_base:2,verde:3};
/* no painel os valores vão em reais inteiros (centavos são ruído em obra de milhões); o valor exato aparece ao passar o mouse e no detalhe de cada cartão */
const brlInt=v=>{v=Math.round(+v||0);return (v<0?'-':'')+'R$ '+Math.abs(v).toLocaleString('pt-BR')};
const eventosPct=(a,b)=>b>0?Math.round(a/b*100):null;
const eventosUn=modo=>modo==='pacote'?['pacote','pacotes']:modo==='grupo'?['grupo','grupos']:['evento','eventos'];
/* a mensagem principal da tela, em uma frase */
function eventosFrase(R,modo){
  const gs=R.grupos.filter(g=>g.n>0),u=eventosUn(modo),v=gs.filter(g=>g.sem[0]==='vermelho').length,a=gs.filter(g=>g.sem[0]==='amarelo').length,sb=gs.filter(g=>g.sem[0]==='sem_base').length;
  if(!gs.length)return 'Nenhum item no orçamento desta obra.';
  if(!v&&!a&&!sb)return `Os ${gs.length} ${u[1]} estão dentro da meta.`;
  const p=[];if(v)p.push(`${v} em vermelho`);if(a)p.push(`${a} em amarelo`);if(sb)p.push(`${sb} sem meta`);
  return `${v+a+sb} de ${gs.length} ${u[1]} pedem atenção: ${p.join(', ')}.`}
const eventosAtencao=g=>['vermelho','amarelo','sem_base'].includes(g.sem[0]);
/* os números do topo, cada um com a origem em letra pequena */
function eventosKpis(R){
  const t=R.total,cons=r2(t.comp+t.real),p=eventosPct(cons,t.meta),nRes=S.t.ocs.filter(o=>o.status==='em_alcada').length;
  const k=(l,v,o,cl,ex)=>`<div class="ev-kpi"><div class="l">${l}</div><div class="v ${cl||''}" title="${esc(brl(ex))}">${brlInt(ex)}</div><div class="o">${o}</div></div>`;
  return `<div class="ev-kpis">${k('Receita licitada','',`preço licitado dos ${t.n} ${t.n===1?'item':'itens'}`,'',t.venda)}${k('Meta de custo','',`soma da meta dos ${t.n} ${t.n===1?'item':'itens'}`,'',t.meta)}${k('Já consumido','',`pedidos aprovados sem nota mais notas rateadas${p!=null?' · '+p+'% da meta':''}`,'',cons)}${k('Saldo livre','','meta menos comprometido e realizado',t.livre<0?'neg':'',t.livre)}${t.res!==undefined?k('Reservado','',nRes?`${nRes} ${nRes===1?'pedido aguardando aprovação':'pedidos aguardando aprovação'}`:'nenhum pedido aguardando aprovação','',t.res):''}</div>`}
/* o cartão de um grupo (evento, pacote ou grupo da EAP) */
function eventosCard(g,modo,temRef){
  const cor=g.sem[0],cons=r2(g.comp+g.real),res=g.res||0,escala=Math.max(g.meta,g.temTeto?g.teto:0,r2(cons+res),1),w=x=>Math.min(100,Math.max(0,x/escala*100));
  const wr=w(g.real),wc=Math.min(w(g.comp),100-wr),wv=Math.min(w(res),100-wr-wc),p=eventosPct(cons,g.meta);
  const dica=`realizado ${brl(g.real)} · comprometido ${brl(g.comp)}${res?' · reservado '+brl(res):''} · meta ${brl(g.meta)}${g.temTeto?' · limite '+brl(g.teto):''}`;
  const barra=`<div class="ev-bar" role="img" aria-label="${esc(dica)}" title="${esc(dica)}"><i class="r" style="width:${wr.toFixed(1)}%"></i><i class="c" style="width:${wc.toFixed(1)}%"></i>${res?`<i class="v" style="width:${wv.toFixed(1)}%"></i>`:''}${g.meta>0?`<i class="m" style="left:${w(g.meta).toFixed(1)}%"></i>`:''}${g.temTeto?`<i class="l" style="left:${w(g.teto).toFixed(1)}%"></i>`:''}</div>`;
  const cad=modo==='pacote'&&g.cadastro&&g.cadastro.teto!=null&&Math.abs(g.cadastro.teto-g.teto)>0.004?`<span title="Valor fixo do cadastro do pacote">cadastro do pacote: ${brl(g.cadastro.teto)}</span>`:'';
  const ref=temRef&&modo==='evento'?(g.ref!=null?`<span>Eventograma oficial ${brl(g.ref)}</span><span class="${Math.abs(g.dif)>0.004?'neg':''}">Diferença ${Math.abs(g.dif)>0.004?`<b>${g.dif>0?'+':''}${brl(g.dif)}</b>`:'zero'}</span>`:'<span>Eventograma oficial: sem valor</span>'):'';
  const outras=`<span>${modo==='pacote'?'Eventos':'Pacotes'}: ${eventosOutras(g.outras,modo==='pacote'?'sem evento':'sem pacote')}</span>`;
  const resTxt=res?` · mais ${brlInt(res)} reservados`:'';
  return `<div class="ev-card clk ${cor}" data-act="ev-det" data-m="${modo}" data-k="${esc(g.chave)}" aria-label="Ver os itens: ${esc(g.chave||'sem grupo')}">
   <div class="ev-top"><div class="ev-id">${eventosRotulo(g,modo)}</div>${semGPill(g.sem)}</div>
   <div class="ev-saldo"><span class="n ${g.livre<0?'neg':''}" title="${esc(brl(g.livre))}">${brlInt(g.livre)}</span><span class="t">saldo livre</span></div>
   ${cor==='verde'?'':`<p class="ev-why">${esc(g.sem[1])}.</p>`}${barra}
   <div class="ev-cap" title="${esc(dica)}">${brlInt(cons)} consumidos${g.meta>0?' de '+brlInt(g.meta)+' da meta'+(p!=null?' ('+p+'%)':''):''}${resTxt}</div>
   <dl class="ev-fatos"><div><dt>Meta</dt><dd title="${esc(brl(g.meta))}">${brlInt(g.meta)}</dd></div><div><dt>Limite (teto)</dt><dd class="${grupoSemFolga(g)?'neg':''}" title="${g.temTeto?esc(brl(g.teto)):''}">${g.temTeto?brlInt(g.teto):'—'}</dd></div><div><dt>Itens</dt><dd>${g.n}</dd></div></dl>
   <div class="ev-rod">${outras}<span title="${esc(brl(g.venda))}">Receita ${brlInt(g.venda)}</span>${ref}${cad}</div></div>`}
/* "Sem evento" e "Sem pacote" ficam por último; o resto vai do mais grave para o menos grave, e por código dentro da mesma cor */
function eventosOrdem(gs){const pos=new Map(gs.map((g,i)=>[g,i]));return [...gs].sort((a,b)=>(a.chave===''?1:0)-(b.chave===''?1:0)||SEM_ORDEM[a.sem[0]]-SEM_ORDEM[b.sem[0]]||pos.get(a)-pos.get(b))}
/* o aviso de que o banco ainda não acompanha as chaves ligadas: uma linha que abre, em vez de um parágrafo no meio da tela */
function eventosAvisos(){const a=avisoSqlCalc()+avisoSqlLinhas();return a?`<details class="ev-aviso"><summary><span class="pill warn">atenção</span> O banco ainda não acompanha as chaves ligadas nesta obra: números de outras telas podem diferir</summary>${a}</details>`:''}
function eventosCards(R,modo,filtro){
  const temRef=!!R.temRef&&modo==='evento',u=eventosUn(modo);
  let gs=eventosOrdem(R.grupos);
  if(filtro==='atencao')gs=gs.filter(eventosAtencao);else if(filtro==='ok')gs=gs.filter(g=>g.sem[0]==='verde');
  const c=R.confere,falhas=Object.keys(c.campos).filter(k=>!c.campos[k]);
  const conf=c.ok?`<span class="pill ok">fecha com a obra</span> A soma ${modo==='pacote'?'dos pacotes':modo==='grupo'?'dos grupos':'dos eventos'} (inclusive “sem ${modo==='pacote'?'pacote':modo==='grupo'?'grupo':'evento'}”) é igual ao total da obra em receita, meta, limite, comprometido, realizado e saldo.`
    :`<span class="pill bad">não fecha com a obra</span> Diferença em: ${falhas.join(', ')||'quantidade de itens'}. Avise a Gestão.`;
  const leg=`<div class="ev-leg"><span><i class="r"></i>realizado</span><span><i class="c"></i>comprometido</span>${R.total.res!==undefined?'<span><i class="v"></i>reservado</span>':''}<span><i class="m"></i>meta</span><span><i class="l"></i>limite (teto)</span></div>`;
  return `${gs.length?`<div class="ev-grid">${gs.map(g=>eventosCard(g,modo,temRef)).join('')}</div>`:`<div class="empty">Nenhum ${u[0]} neste filtro.</div>`}${leg}<div class="sub" style="margin-top:12px">${conf}</div>`}
function viewEventos(X){
  if(!chaveLigada('ev_agrega'))return `<div class="head"><div><h1>Eventos</h1><p class="lead">Esta tela está desligada nesta obra. A Gestão ou a Diretoria liga em <b>Suprimentos → Compras → Parâmetros</b>, na chave “Eventos e pacotes pela soma dos itens”. Desligada, o ERP calcula e mostra como sempre.</p></div></div>`;
  const tab=S.tab.evt||'evento',vista=S.tab.evtv==='tabela'?'tabela':'cards',filtro=['atencao','ok'].includes(S.tab.evtf)?S.tab.evtf:'todos',E=X.eventos||agregaEventos(),P=X.pacGrupos||agregaPacotes();
  const R=tab==='pacote'?P:E,modo=tab==='pacote'?'pacote':E.modo,u=eventosUn(modo);
  const semEv=E.modo==='evento'?E.grupos.find(g=>g.chave===''):null,semPac=P.grupos.find(g=>g.chave==='');
  const nAt=R.grupos.filter(eventosAtencao).length,nOk=R.grupos.filter(g=>g.sem[0]==='verde').length;
  const ex342=S.D&&S.D.obra&&S.D.obra.codigo==='342'?' (na 342, 4.1.1 e 4.1.2)':'';   /* o exemplo de item dividido 90/10 é da 342; nas outras obras o texto fica genérico */
  const nota=E.modo==='grupo'?'':E.temRef?`<p>A diferença compara a receita somada pelos itens com o valor do eventograma oficial carregado na obra. Item dividido entre dois eventos no eventograma oficial está ligado a um evento só no ERP: a diferença aparece nos dois eventos, com sinais opostos${ex342}.</p>`
    :`<p>Item dividido entre dois eventos no eventograma oficial está ligado a um evento só no ERP, então a receita desses eventos difere do eventograma${ex342}. A diferença aparece quando os valores do eventograma oficial estiverem carregados na obra; hoje o ERP ainda não os guarda.</p>`;
  const sub=E.modo==='grupo'?'Esta obra não tem evento no orçamento: o controle é por <b>grupo da EAP</b> (e por pacote).':'Meta, limite (teto), comprometido, realizado e saldo somados dos itens do orçamento, <b>por evento</b> e <b>por pacote</b>.';
  const comoLer=`<details class="ev-como"><summary>Como ler esta tela</summary>
   <p>${sub} Só leitura: nada aqui grava.${E.modo==='grupo'?'':' Item sem evento aparece em “Sem evento” e entra nas somas.'}</p>
   <p>A cor usa a regra do item aplicada ao grupo: verde dentro da meta, amarelo acima da meta até o limite (teto), vermelho acima do limite ou com a meta já acima do limite (sem folga, o mesmo “meta acima do teto” de Pacotes).${chaveLigada('ev_ctrl')?' Com o limite em três níveis ligado, a compra nova usa estas mesmas somas de pacote e de evento, e o reservado conta no saldo.':''}</p>${nota}</details>`;
  const lista=vista==='tabela'?eventosTabela(R,modo):eventosCards(R,modo,filtro);
  const cabLista=modo==='pacote'?'Pacote':modo==='grupo'?'Grupo da EAP':'Evento';
  return `<div class="head"><div><h1>Eventos</h1><p class="ev-sub">${eventosFrase(R,modo)}</p></div>
   <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="pill info">chave ligada nesta obra</span>${semEv?`<span class="pill warn">${semEv.n} ${semEv.n===1?'item sem evento':'itens sem evento'}</span>`:''}${semPac?`<span class="pill warn">${semPac.n} ${semPac.n===1?'item sem pacote':'itens sem pacote'}</span>`:''}</div></div>
   ${eventosKpis(R)}${eventosAvisos()}
   <div class="ev-bar-top"><div class="ev-ctl">${tabs('evt',[['evento',E.modo==='grupo'?'Por grupo':'Por evento'],['pacote','Por pacote']],tab)}${vista==='cards'?tabs('evtf',[['todos','Todos ('+R.grupos.length+')'],['atencao','Atenção ('+nAt+')'],['ok','Dentro da meta ('+nOk+')']],filtro):''}</div>
    <div class="ev-ctl"><span class="ev-sec" title="${esc(cabLista)}">${R.grupos.length} ${R.grupos.length===1?u[0]:u[1]} · ${S.D.items.length} itens</span>${tabs('evtv',[['cards','Cartões'],['tabela','Ver como tabela']],vista)}</div></div>
   ${lista}${comoLer}`}
ACOES['ev-det']=el=>{const m=el.dataset.m,k=el.dataset.k,R=m==='pacote'?agregaPacotes():agregaEventos(),g=R.grupos.find(x=>x.chave===k);if(!g)return;
  const nome=k===''?(m==='pacote'?'Sem pacote':m==='grupo'?'Sem grupo':'Sem evento'):(m==='pacote'?'Pacote ':m==='grupo'?'Grupo ':'Evento ')+k;
  const its=g.itens.map(c=>S.byCod[c]).filter(Boolean),cons=r2(g.comp+g.real);
  modal(`<h3>${esc(nome)} ${g.nome?`<span class="mut">${esc(g.nome)}</span>`:''} ${semGPill(g.sem)}</h3><div class="sub">${g.n} ${g.n===1?'item':'itens'}${g.sem[0]==='verde'?'':' · '+esc(g.sem[1])}. Cada valor é a soma dos itens abaixo.</div>
   <div class="kpi4"><div><div class="k-l">Meta</div><div class="v">${brl(g.meta)}</div></div><div><div class="k-l">Limite (teto)</div><div class="v ${grupoSemFolga(g)?'neg':''}">${g.temTeto?brl(g.teto):'—'}</div></div><div><div class="k-l">Comprometido + realizado</div><div class="v">${brl(cons)}</div><div class="sub">${brl(g.comp)} + ${brl(g.real)}</div></div><div><div class="k-l">Saldo livre</div><div class="v ${g.livre<0?'neg':''}">${brl(g.livre)}</div>${g.res?`<div class="sub">${brl(g.res)} reservados</div>`:''}</div></div>
   ${its.length?`<div class="tw" style="max-height:50vh"><table class="tbl"><thead><tr><th>Item</th><th>${m==='pacote'?'Evento':'Pacote'}</th><th class="r">Receita</th><th class="r">Meta</th><th class="r">Teto</th><th class="r">Comprom.</th><th class="r">Realizado</th><th class="r">Saldo</th></tr></thead><tbody>
   ${its.map(i=>{const s=S.sd[i.codigo]||{comp:0,real:0,livre:0};return `<tr class="clk" data-item="${esc(i.codigo)}"><td><span class="mono">${esc(i.codigo)}</span><div class="mut" style="font-size:11.5px">${esc((i.descricao||'').slice(0,60))}</div></td><td class="mono">${esc((m==='pacote'?evDe(i):pacDe(i))||'—')}</td><td class="r mut">${brl(i.preco_venda_total)}</td><td class="r">${i.meta_total==null?'—':brl(i.meta_total)}</td><td class="r ${i.meta_total>i.teto_total?'neg':''}">${i.teto_total==null?'—':brl(i.teto_total)}</td><td class="r">${brl(s.comp)}</td><td class="r">${brl(s.real)}</td><td class="r ${s.livre<0?'neg':''}">${brl(s.livre)}</td></tr>`}).join('')}</tbody></table></div>`:'<div class="empty">Nenhum item neste grupo.</div>'}
   <div class="acts"><button class="btn" data-act="fechar">Fechar</button></div>`)};
