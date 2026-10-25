/* ============ COMPRAS (Fase 3) ============ */
function semBox(r){return `<div class="sem ${r[0]}"><b>${r[0].toUpperCase()}</b><div><b>${r[1]}</b><br><span>${r[2]}</span></div></div>`}
/* M3 (par.oc_linhas): outras linhas da solicitação. A primeira linha é o formulário de sempre (mesmos campos, mesmos ids: Orçamento, Necessidades, Mín./Máx. e Rastro continuam preenchendo-o). */
let SOLX=[],SOLUPD=null;
/* o que o engenheiro precisa ver ao escolher o item: evento, pacote e saldo */
function ctxItem(cod){
  const i=S.byCod[cod];if(!i)return '';const s=S.sd[cod]||{livre:0},p=(S.D.pacotes||[]).find(x=>x.codigo===pacDe(i));
  return `evento <b class="mono">${esc(evDe(i)||'—')}</b> · pacote <b class="mono">${esc(pacDe(i)||'—')}</b>${p?' '+esc(p.nome):''} · saldo livre do item <b class="${s.livre<0?'neg':''}">${brl(s.livre)}</b>`}
function natOpts(i,sel){return i.linhas.map(l=>`<option value="${l.nat}" ${l.nat===(sel||i.nat)?'selected':''}>${NATNOME[l.nat]} · ${Math.round(l.share*100)}% da composição</option>`).join('')}
function pintaSolX(){
  const el=$('#s-lin');if(!el)return;
  el.innerHTML=SOLX.map((x,k)=>{const i=S.byCod[x.item];
    return `<div class="g3" style="grid-template-columns:2fr 1.4fr .7fr .8fr auto;align-items:end;margin-top:8px"><div><label style="margin-top:0">Item</label><select data-sx="${k}" data-f="item">${itemOptions(x.item)}</select></div><div><label style="margin-top:0">Natureza</label><select data-sx="${k}" data-f="nat">${i?natOpts(i,x.nat):''}</select></div><div><label style="margin-top:0">Quantidade</label><input type="number" step="any" min="0" data-sx="${k}" data-f="qtd" value="${x.qtd}"></div><div><label style="margin-top:0">Preço unit. (R$)</label><input type="number" step="any" min="0" data-sx="${k}" data-f="pu" value="${x.pu}"></div><button class="btn sm no" data-act="sol-del-lin" data-k="${k}">×</button>
     <div class="sub" id="sx-ctx-${k}" style="grid-column:1/-1;margin-top:-4px">${ctxItem(x.item)}</div></div>`}).join('');
  document.querySelectorAll('[data-sx]').forEach(e=>e.oninput=e.onchange=()=>{const x=SOLX[+e.dataset.sx],f=e.dataset.f;x[f]=e.value;if(f==='item'){const i=S.byCod[x.item];x.nat=i?i.nat:'';pintaSolX()}if(SOLUPD)SOLUPD()})}
/* linhas do formulário: a primeira (formulário de sempre) mais as de SOLX */
function solLinhasForm(){
  const L=[{item:$('#s-item').value,nat:$('#s-nat').value,qtd:+$('#s-qtd').value,preco:+$('#s-pu').value}];
  SOLX.forEach(x=>L.push({item:x.item,nat:x.nat,qtd:+x.qtd,preco:+x.pu}));return L}
function modalSol(cod){
  const LN=ocLinhasLigada();SOLX=[];SOLUPD=null;
  modal(`<h3>Nova solicitação de compra</h3><div class="sub">${LN?'Nasce dentro de um item do orçamento; para comprar um pacote, junte outras linhas abaixo. O preço é comparado com o saldo, a meta e o teto de cada item.':'Nasce dentro de um item do orçamento. O preço é comparado com o saldo, a meta e o teto do item.'}</div>
   <label>Item do orçamento</label><select id="s-item">${itemOptions(cod)}</select><label>Linha da composição do item (natureza e conta vêm do cadastro)</label><select id="s-nat"></select><div class="sub" id="s-conta"></div>
   <label>Insumo do estoque (opcional: a entrada na OC vai para o estoque)</label><select id="s-ins"><option value="">— nenhum —</option>${S.t.inss.map(i=>`<option value="${esc(i.cod)}">${esc(i.cod)} · ${esc(i.desc)}</option>`).join('')}</select><label>O que comprar</label><input id="s-desc" placeholder="ex.: Tubo K-7 DN300, 76 m">
   <div class="g3"><div><label>Quantidade</label><input id="s-qtd" type="number" step="any" min="0"></div><div><label>Preço unitário achado (R$)</label><input id="s-pu" type="number" step="any" min="0"></div><div><label>Necessária em</label><input id="s-dt" type="date"></div></div>
   ${LN?`<div class="sub" id="s-ctx0" style="margin-top:6px"></div><div class="panel-t" style="margin-top:14px">Outras linhas deste pedido</div><div class="sub">Compra de pacote: junte vários itens numa solicitação só. O fornecedor cota o valor total do pedido. Insumo do estoque só vale em pedido de uma linha.</div><div id="s-lin"></div><div style="margin-top:8px"><button class="btn sm" data-act="sol-add-lin">+ Linha</button></div>`:''}
   <label>Motivo</label><input id="s-mot" placeholder="opcional"><div id="s-sem"></div>
   <div class="acts"><button class="btn" data-act="fechar">Cancelar</button><button class="btn dark" data-act="sol-ok">Enviar solicitação</button></div>`);
  const upd=()=>{const i=S.byCod[$('#s-item').value],q=+$('#s-qtd').value,p=+$('#s-pu').value;
    if(i&&!$('#s-qtd').value&&i.qtd)$('#s-qtd').placeholder='orçado: '+num(i.qtd);if(i&&!$('#s-pu').value)$('#s-pu').placeholder='meta unit.: '+num(i.meta_unit);
    if(LN){const c0=$('#s-ctx0');if(c0)c0.innerHTML=ctxItem($('#s-item').value);
      const L=solLinhasForm(),ok=L.every(l=>l.item&&l.qtd>0&&l.preco>0);
      $('#s-sem').innerHTML=ok?semBox(semaforoLinhas(L.map(l=>({item:l.item,valor:r2(l.qtd*l.preco)})))):`<div class="sub" style="margin-top:10px">Informe quantidade e preço de cada linha para ver o semáforo.${L.length>1?'':' Saldo livre do item: <b>'+brl(S.sd[i.codigo].livre)+'</b>'}</div>`;return}
    $('#s-sem').innerHTML=q>0&&p>0?semBox(semaforo(i.codigo,q*p)):`<div class="sub" style="margin-top:10px">Informe quantidade e preço para ver o semáforo. Saldo livre do item: <b>${brl(S.sd[i.codigo].livre)}</b></div>`};
  const linhas=()=>{const i=S.byCod[$('#s-item').value];$('#s-nat').innerHTML=i.linhas.map(l=>`<option value="${l.nat}" ${l.nat===i.nat?'selected':''}>${NATNOME[l.nat]} · ${Math.round(l.share*100)}% da composição</option>`).join('');conta()};
  const conta=()=>{const i=S.byCod[$('#s-item').value],n=$('#s-nat').value,c=contaPadrao(n,i.pacote);$('#s-conta').innerHTML=`Conta <b class="mono">${c}</b> · ${esc(nomeConta(c))}`};
  $('#s-item').onchange=()=>{linhas();upd()};$('#s-nat').onchange=conta;linhas();
  ['s-item','s-qtd','s-pu'].forEach(id=>$('#'+id).oninput=upd);SOLUPD=upd;upd();
}
/* fim da criação: igual para a solicitação de uma linha e para a de várias */
function solGrava(s,total,sem){
  S.t.sols.unshift(s);log('solicitacao',s.num,'criada','',brl(total)+' · '+sem[0]);const volta=typeof rastroAposSol==='function'&&rastroAposSol(s);save();closeModal();toast(s.num+' enviada · '+sem[0]);if(!volta){S.view='compras';S.tab.compras='sols'}render();
}
function doSol(){
  const cod=$('#s-item').value,q=+$('#s-qtd').value,p=+$('#s-pu').value,desc=$('#s-desc').value.trim();
  if(!desc||!(q>0)||!(p>=0))return toast('Preencha descrição, quantidade e preço');
  if(ocLinhasLigada())return doSolLinhas(desc);
  const sem=semaforo(cod,q*p);if(sem[0]==='bloqueado'){toast(sem[1]);return}
  const nat=$('#s-nat').value,s={id:'s'+Date.now(),num:nextNum('sol'),item:cod,nat,conta:contaPadrao(nat,S.byCod[cod].pacote),desc,ins:($('#s-ins')||{}).value||'',qtd:q,preco:p,data:$('#s-dt').value,mot:$('#s-mot').value,solicitante:user(),status:'enviada',sem:sem[0],cots:[],criado:hojeISO()};
  solGrava(s,q*p,sem);
}
/* oc_linhas ligada: a solicitação guarda linhas [{item, nat, conta, qtd, preco, valor}]; item/nat/conta/qtd/preco do documento seguem a primeira linha, como antes.
   De várias linhas: qtd=1 e preco=total (o pacote é uma unidade; a proposta do fornecedor é o valor total do pedido). */
function doSolLinhas(desc){
  const L=solLinhasForm(),ins=($('#s-ins')||{}).value||'';
  for(const l of L.slice(1))if(!l.item||!(l.qtd>0)||!(l.preco>=0))return toast('Complete cada linha do pedido: item, quantidade e preço');
  if(L.length>1&&ins)return toast('Insumo do estoque só vale em pedido de uma linha');
  L.forEach(l=>{l.valor=r2(l.qtd*l.preco);l.conta=contaPadrao(l.nat,S.byCod[l.item].pacote)});
  const total=r2(L.reduce((a,l)=>a+l.valor,0)),sem=semaforoLinhas(L.map(l=>({item:l.item,valor:l.valor})));
  if(sem[0]==='bloqueado'){toast(sem[1]);return}
  const s={id:'s'+Date.now(),num:nextNum('sol'),item:L[0].item,nat:L[0].nat,conta:L[0].conta,desc,ins,qtd:L.length>1?1:L[0].qtd,preco:L.length>1?total:L[0].preco,data:$('#s-dt').value,mot:$('#s-mot').value,solicitante:user(),status:'enviada',sem:sem[0],cots:[],criado:hojeISO(),
    linhas:L.map(l=>({item:l.item,nat:l.nat,conta:l.conta,qtd:l.qtd,preco:l.preco,valor:l.valor}))};
  solGrava(s,total,sem);
}
ACOES['sol-add-lin']=()=>{const i=S.D.items[0];SOLX.push({item:i.codigo,nat:i.nat,qtd:'',pu:''});pintaSolX();if(SOLUPD)SOLUPD()};
ACOES['sol-del-lin']=el=>{SOLX.splice(+el.dataset.k,1);pintaSolX();if(SOLUPD)SOLUPD()};
function viewCompras(X){
  const tab=S.tab.compras||'sols';
  const sols=S.t.sols,ocs=S.t.ocs;
  const nAprov=X.pendAprov.length;
  let body='';
  if(tab==='sols')body=sols.length?`<table class="tbl"><thead><tr><th>Nº</th><th>Item</th><th>O que</th><th class="r">Total est.</th><th>Semáforo</th><th>Status</th><th></th></tr></thead><tbody>${sols.map(s=>`<tr><td class="mono">${s.num}</td><td class="mono">${itensTxt(s)}</td><td>${esc(s.desc)}<div class="mut" style="font-size:11.5px">${esc(s.solicitante)} · ${fdata(s.criado)}</div></td><td class="r">${brl(s.qtd*s.preco)}</td><td>${semPill(s.sem)}</td><td><span class="pill mute">${s.status.replace('_',' ')}</span></td><td class="r">${['enviada','em_cotacao'].includes(s.status)?`<button class="btn sm" data-act="mapa" data-id="${s.id}" ${can('cotar')?'':'disabled title="Só Compras"'}>Mapa de cotação</button>`:''}</td></tr>`).join('')}</tbody></table>`:empty('Nenhuma solicitação ainda.','Abra um item em Orçamento e clique em “Solicitar compra”.');
  if(tab==='ocs')body=ocs.length?`<table class="tbl"><thead><tr><th>OC</th><th>Item / Fornecedor</th><th class="r">Valor</th><th>Semáforo</th><th>Status</th><th>Receb.</th><th></th></tr></thead><tbody>${ocs.map(o=>{const i=S.byCod[o.item];return `<tr><td class="mono">${o.num}</td><td><span class="mono">${itensTxt(o)}</span> · ${esc(o.forn)}<div class="mut" style="font-size:11.5px">${ocMulti(o)?linhasDe(o).length+' linhas · recebido como um pacote':num(o.qtd)+' '+(i.unidade||'')+' × '+brl(o.preco)}${o.emergencia?' · EMERGÊNCIA':''} · ${ocMulti(o)?'contas por linha':'conta <span class="mono">'+(o.conta||'—')+'</span>'}</div></td><td class="r">${brl(o.valor)}</td><td>${semPill(o.sem)}</td><td><span class="pill ${o.status==='aprovada'||o.status==='recebida'?'ok':o.status==='em_alcada'?'warn':o.status==='reprovada'||o.status==='cancelada'?'bad':'mute'}">${o.status.replace('_',' ')}</span></td><td class="mono">${num(o.recebido||0)}/${num(o.qtd)}</td>
   <td class="r">${o.status==='em_alcada'?aprovBtns(o):''}${ocMulti(o)?`<button class="btn sm" data-act="oc-lin" data-id="${o.id}">Linhas</button> `:''}<button class="btn sm" data-act="oc-ocor" data-id="${o.id}">Ocorrência${o.ocorr&&o.ocorr.length?' ('+o.ocorr.length+')':''}</button> ${['recebida','recebida_parcial'].includes(o.status)&&o.ins?`<button class="btn sm" data-act="oc-dev" data-id="${o.id}" ${can('receber')?'':'disabled'}>Devolver</button> `:''}${['aprovada','recebida_parcial'].includes(o.status)?`<button class="btn sm" data-act="receber" data-id="${o.id}" ${can('receber')?'':'disabled title="Só Almoxarife"'}>Receber</button> <button class="btn sm no" data-act="cancelar-oc" data-id="${o.id}">Cancelar</button>`:''}</td></tr>`}).join('')}</tbody></table>`:empty('Nenhuma OC ainda.','A OC nasce no mapa de cotação, depois da escolha do fornecedor.');
  if(tab==='aprov')body=nAprov?`<table class="tbl"><thead><tr><th>OC</th><th>Item</th><th class="r">Valor</th><th>Alçada</th><th>Justificativa</th><th></th></tr></thead><tbody>${X.pendAprov.map(o=>`<tr><td class="mono">${o.num}</td><td><span class="mono">${itensTxt(o)}</span> · ${esc(o.forn)}</td><td class="r">${brl(o.valor)}</td><td>${semPill(o.sem)} <span class="mut">${ROLES[o.alcada].n}</span></td><td>${esc(o.just||'—')}</td><td class="r">${aprovBtns(o)}</td></tr>`).join('')}</tbody></table>`:empty('Nada aguardando aprovação.','Compras acima da meta ou do teto aparecem aqui.');
  return `<div class="head"><div><h1>Compras</h1><p class="lead">Solicitação → cotação (3 preços) → OC. Verde passa direto; amarelo vai ao Gerente; vermelho, à Diretoria; fora da planilha, bloqueado.</p></div>
   <div style="display:flex;gap:8px"><button class="btn" data-act="params" ${can('param')?'':'disabled title="Só Diretoria ou Gestão"'}>Parâmetros</button><button class="btn dark" data-act="nova-sol" ${can('solicitar')?'':'disabled title="Só Engenheiro ou Gerente"'}>Nova solicitação</button></div></div>
   ${alcadaAviso()}<div class="toolbar">${tabs('compras',[['sols','Solicitações '+sols.length],['ocs','Ordens de compra '+ocs.length],['aprov','Aprovações',nAprov]],tab)}<span class="sub">Verde sem confirmação até ${brl(S.t.par.limite)} · Gerente até ${brl(gerAte())} · tolerância nota×pedido ${(S.t.par.tol*100).toFixed(1)}%</span></div><div class="tw">${body}</div>`;
}
const empty=(a,b)=>`<div class="soon" style="min-height:200px"><h2 style="font-size:16px">${a}</h2><div>${b}</div></div>`;
function aprovBtns(o){
  const ok=can_aprovar(o);return `<button class="btn sm ok" data-act="aprovar" data-id="${o.id}" ${ok?'':'disabled title="Sem alçada ou é o próprio solicitante"'}>Aprovar</button> <button class="btn sm no" data-act="reprovar" data-id="${o.id}" ${ok?'':'disabled'}>Reprovar</button>`}
const gerAte=()=>S.t.par.gerenteAte??250000;
/* alçadas e tolerância ainda não foram definidas pela Diretoria: os números são os de partida do sistema e aparecem como pendência */
const alcadaAviso=()=>MODO_CH&&!S.t.par.alcadaOk?`<div class="alert" style="margin:0 0 10px"><div class="g" style="color:var(--warn)"><svg class="ic" viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg></div><div><b>Alçadas ainda não definidas</b><p>Os limites abaixo (verde até ${brl(S.t.par.limite)}, Gerente até ${brl(gerAte())}, tolerância nota × pedido ${(S.t.par.tol*100).toFixed(1)}%) são os de partida do sistema, não foram aprovados. A Diretoria ou a Gestão define em Parâmetros; até lá, valem como provisórios.</p></div></div>`:'';
const alcadaDe=(sem,total)=>{let a=sem==='verde'?(total>S.t.par.limite?'gerente':null):sem==='amarelo'?'gerente':'diretoria';if(a==='gerente'&&total>gerAte())a='diretoria';return a};
function can_aprovar(o){if(o.solicitante===user())return false;if(o.alcada==='diretoria')return isRole('diretoria');return isRole('gerente','diretoria')}
/* proposta do fornecedor -> linhas do pedido. Pedido de uma linha: a linha única de sempre. Pedido de várias linhas: a proposta é o valor TOTAL do pacote e cada linha recebe a parte
   proporcional ao valor estimado da solicitação (o centavo que sobra vai para a linha com maior resto). [SUPOSIÇÃO: o fornecedor ainda não cota linha por linha.] */
function linhasDaProposta(s,c){
  const total=r2(s.qtd*c.preco);
  if(!ocMulti(s))return [{item:s.item,nat:s.nat,conta:s.conta,qtd:s.qtd,valor:total}];
  const v=repartirR(total,s.linhas.map(l=>+l.valor||0));
  return s.linhas.map((l,k)=>({item:l.item,nat:l.nat,conta:l.conta,qtd:l.qtd,valor:v[k]}))}
/* semáforo da proposta escolhida */
function semProposta(s,c){return ocLinhasLigada()?semaforoLinhas(linhasDaProposta(s,c).map(l=>({item:l.item,valor:l.valor}))):semaforo(s.item,s.qtd*c.preco)}
function modalMapa(id){
  const s=S.t.sols.find(x=>x.id===id),i=S.byCod[s.item],multi=ocMulti(s);
  const L=s.cots.map((c,k)=>`<tr><td><input type="radio" name="esc" value="${k}" ${s.escolhida===k?'checked':''}></td><td>${esc(c.forn)}</td><td class="r">${brl(c.preco)}</td><td>${esc(c.prazo||'—')}</td><td class="r">${brl(c.preco*s.qtd)}</td><td>${c.preco===Math.min(...s.cots.map(x=>x.preco))?'<span class="pill ok">menor</span>':''}</td></tr>`).join('');
  const linhasTab=multi?`<div class="tw" style="max-height:30vh"><table class="tbl"><thead><tr><th>Item</th><th>Evento</th><th>Pacote</th><th class="r">Qtd.</th><th class="r">Valor estimado</th></tr></thead><tbody>${s.linhas.map(l=>{const it=S.byCod[l.item]||{};return `<tr><td><span class="mono">${esc(l.item)}</span><div class="mut" style="font-size:11.5px">${esc((it.descricao||'').slice(0,60))}</div></td><td class="mono">${esc(evDe(it)||'—')}</td><td class="mono">${esc(pacDe(it)||'—')}</td><td class="r">${num(l.qtd)}</td><td class="r">${brl(l.valor)}</td></tr>`}).join('')}</tbody></table></div>`:'';
  modal(`<h3>Mapa de cotação · ${s.num}</h3><div class="sub">${multi?`${s.linhas.length} linhas · ${esc(s.desc)} · total estimado ${brl(s.preco)}. A proposta do fornecedor é o valor total do pedido; cada linha recebe a parte proporcional ao valor estimado.`:`<span class="mono">${s.item}</span> · ${esc(s.desc)} · ${num(s.qtd)} ${i.unidade||''} · meta unitária ${brl(i.meta_unit)}`}</div>${linhasTab}
   <div class="tw"><table class="tbl"><thead><tr><th></th><th>Fornecedor</th><th class="r">${multi?'Proposta (total)':'Preço unit.'}</th><th>Prazo</th><th class="r">Total</th><th></th></tr></thead><tbody>${L||'<tr><td colspan="6" class="mut">Sem propostas.</td></tr>'}</tbody></table></div>
   <div class="g3"><div><label>Fornecedor</label><input id="c-f"></div><div><label>${multi?'Valor total da proposta (R$)':'Preço unit. (R$)'}</label><input id="c-p" type="number" step="any" min="0"></div><div><label>Prazo / condição</label><input id="c-z"></div></div>
   <div style="margin-top:8px"><button class="btn sm" data-act="add-cot" data-id="${id}">Adicionar proposta</button></div>
   <label>Resposta do fornecedor por arquivo: cole linhas <span class="mono">${multi?'fornecedor;valor total;prazo':'fornecedor;preço;prazo'}</span></label><textarea id="c-csv" rows="3"></textarea><div style="margin:6px 0;display:flex;gap:8px"><button class="btn sm" data-act="cot-colar" data-id="${id}">Adicionar propostas coladas</button><button class="btn sm" data-act="cot-sug" data-id="${id}">Sugerir melhor</button></div>
   <label>Justificativa (obrigatória se escolher fora da menor ou com menos de 3 propostas)</label><input id="c-j" value="${esc(s.just||'')}">
   <label style="display:flex;gap:8px;align-items:center;text-transform:none;font-family:inherit;letter-spacing:0"><input type="checkbox" id="c-em" style="width:auto"> Compra de emergência (frente parada): permite OC sem 3 cotações; regularizar em 2 dias úteis</label>
   <div id="c-sem"></div><div class="acts"><button class="btn" data-act="fechar">Fechar</button><button class="btn dark" data-act="emitir-oc" data-id="${id}">Emitir OC</button></div>`);
  const upd=()=>{const r=document.querySelector('input[name=esc]:checked');if(!r){$('#c-sem').innerHTML='';return}const c=s.cots[+r.value];$('#c-sem').innerHTML=semBox(semProposta(s,c))};
  document.querySelectorAll('input[name=esc]').forEach(e=>e.onchange=upd);upd();
}
function addCot(id){const s=S.t.sols.find(x=>x.id===id);const f=$('#c-f').value.trim(),p=+$('#c-p').value;if(!f||!(p>0))return toast('Informe fornecedor e preço');
  s.cots.push({forn:f,preco:p,prazo:$('#c-z').value});s.status='em_cotacao';s.just=$('#c-j').value;save();modalMapa(id)}
function emitirOC(id){
  const s=S.t.sols.find(x=>x.id===id);const r=document.querySelector('input[name=esc]:checked');if(!r)return toast('Escolha uma proposta');
  const c=s.cots[+r.value],menor=Math.min(...s.cots.map(x=>x.preco)),just=$('#c-j').value.trim(),em=$('#c-em').checked;
  if(!em&&s.cots.length<3&&!just)return toast('Menos de 3 propostas: justifique ou marque emergência');
  if(c.preco>menor&&!just)return toast('Escolheu fora da menor: justifique');
  const LN=ocLinhasLigada(),total=r2(s.qtd*c.preco),L=LN?linhasDaProposta(s,c):null,sem=LN?semaforoLinhas(L.map(l=>({item:l.item,valor:l.valor}))):semaforo(s.item,total);if(sem[0]==='bloqueado')return toast(sem[1]);
  if(sem[0]==='amarelo'&&!just)return toast('Acima da meta: justificativa escrita é obrigatória');
  if(sem[0]==='vermelho'&&!just)return toast('Acima do teto: justificativa é obrigatória');
  const alc=alcadaDe(sem[0],total),st=alc?'em_alcada':'aprovada';
  const o={id:'o'+Date.now()+Math.random().toString(36).slice(2,5),num:nextNum('oc'),sol:s.id,item:s.item,nat:s.nat,conta:s.conta,forn:c.forn,ins:s.ins||'',qtd:s.qtd,preco:c.preco,valor:total,sem:sem[0],status:st,alcada:alc,just,emergencia:em,solicitante:s.solicitante,recebido:0,criado:hojeISO()};
  if(LN)o.linhas=L;
  S.t.ocs.unshift(o);if(st==='aprovada')criaTitulo(o);s.status='atendida';s.oc=o.num;log('ordem_compra',o.num,'emitida','',brl(total)+' · '+sem[0]+' · '+st,just);save();closeModal();toast(o.num+(st==='aprovada'?' aprovada (verde)':' aguarda '+ROLES[alc].n));S.tab.compras='ocs';render();
}
let ASK=null;
function ask(titulo,rotulo,padrao,cb){ASK=cb;modal(`<h3>${esc(titulo)}</h3><label>${esc(rotulo)}</label><input id="ask-v" value="${esc(padrao||'')}"><div class="acts"><button class="btn" data-act="fechar">Cancelar</button><button class="btn dark" data-act="ask-ok">Confirmar</button></div>`);setTimeout(()=>{const e=$('#ask-v');e&&e.focus()},0)}
function askOk(){const v=($('#ask-v').value||'').trim(),f=ASK;if(!v)return toast('Preencha o campo');ASK=null;closeModal();f(v)}
function decidir(id,ok){const o=S.t.ocs.find(x=>x.id===id);if(!can_aprovar(o))return toast('Sem alçada');
  if(!ok)return ask('Reprovar '+o.num,'Motivo da reprovação (volta para renegociar ou remanejar saldo)','',m=>decidirFim(o,false,m));
  decidirFim(o,true,'')}
function decidirFim(o,ok,m){
  const a=o.status;o.status=ok?'aprovada':'reprovada';o.aprovador=user();if(ok)criaTitulo(o);log('ordem_compra',o.num,'status',a,o.status,m);save();toast(o.num+(ok?' aprovada':' reprovada'));render()}
function modalReceber(id){const o=S.t.ocs.find(x=>x.id===id),i=S.byCod[o.item],falta=o.qtd-(o.recebido||0);
  modal(`<h3>Receber ${o.num}</h3><div class="sub">${esc(o.forn)} · ${num(o.qtd)} ${ocUn(o)} pedidos · ${num(o.recebido||0)} já recebidos</div><label>Quantidade recebida agora</label><input id="rc-q" type="number" step="any" value="${falta}" min="0" max="${falta}">${o.ins&&(insBy(o.ins)||{}).unAlt&&insBy(o.ins).unAlt.length?`<label>Unidade da entrada no estoque</label><select id="rc-u"><option value="">${esc(insBy(o.ins).un)} (base)</option>${insBy(o.ins).unAlt.map(u=>`<option value="${esc(u.un)}">${esc(u.un)} (1 = ${u.fator} ${esc(insBy(o.ins).un)})</option>`).join('')}</select>`:''}
   <div class="acts"><button class="btn" data-act="fechar">Cancelar</button><button class="btn dark" data-act="rc-ok" data-id="${id}">Confirmar recebimento</button></div>`)}
function doReceber(id){const o=S.t.ocs.find(x=>x.id===id),q=+$('#rc-q').value;if(!(q>0)||q>o.qtd-(o.recebido||0)+1e-9)return toast('Quantidade inválida');
  const a=o.recebido||0;o.recebido=a+q;estEntradaOC(o,q,($('#rc-u')||{}).value);o.status=o.recebido>=o.qtd-1e-9?'recebida':'recebida_parcial';log('ordem_compra',o.num,'recebido',a,o.recebido);save();closeModal();toast('Recebimento registrado');render()}
function cancelarOC(id){const o=S.t.ocs.find(x=>x.id===id);ask('Cancelar '+o.num,'Motivo do cancelamento (obrigatório)','',m=>cancelarFim(o,m))}
function cancelarFim(o,m){
  const a=o.status;o.status='cancelada';o.motivo=m;const tt=S.t.titulos.find(t=>t.oc===o.id);if(tt&&!tt.cancelado)tt.cancelado=true;log('ordem_compra',o.num,'status',a,'cancelada',m);save();toast('OC cancelada · comprometido liberado');render()}
function modalParams(){modal(`<h3>Parâmetros</h3><div class="sub">Valores de alçada ainda são decisão da Diretoria (seção 18 do doc). Os padrões abaixo são sugestão e valem para as próximas OCs.</div>
  <div class="g3"><div><label>Verde sem confirmação até (R$)</label><input id="p-l" type="number" value="${S.t.par.limite}"></div><div><label>Gerente aprova até (R$)</label><input id="p-g" type="number" value="${gerAte()}"></div><div><label>Tolerância nota × pedido (%)</label><input id="p-t" type="number" step="0.1" value="${S.t.par.tol*100}"></div></div>
  <div class="sub" style="margin-top:8px">Regra: verde até o limite é aprovada sozinha; verde acima do limite e amarelo vão ao Gerente; acima do valor do Gerente, ou acima do teto, vai à Diretoria.</div>
  <div class="panel-t" style="margin-top:16px">Chaves desta obra · regras novas, desligadas por padrão</div>
  <div class="sub">Cada chave vale só para esta obra. Desligada, o ERP calcula e mostra exatamente como antes. As regras novas ainda são suposição do plano, até o ok da Diretoria.</div>
  ${CHAVES_OBRA.map(c=>`<label style="display:flex;gap:8px;align-items:flex-start;text-transform:none;font-family:inherit;letter-spacing:0;margin-top:8px"><input type="checkbox" id="ch-${c.k}" style="width:auto;margin-top:3px" ${chaveLigada(c.k)?'checked':''}><span><b>${c.n}</b><br><span class="sub">${c.d}</span></span></label>`).join('')}
  <div class="acts"><button class="btn" data-act="fechar">Cancelar</button><button class="btn" data-act="chaves-ok">Salvar só as chaves</button><button class="btn dark" data-act="params-ok">Salvar</button></div>`)}
/* lê as caixas das chaves na janela de Parâmetros e grava só as que mudaram (com auditoria). Os dois botões usam esta função: "Salvar só as chaves" e "Salvar" (que também grava a alçada).
   Só Diretoria ou Gestão mudam chave (can('param')); sem mudança nada é lido nem gravado. Devolve quantas chaves mudaram. */
function gravaChaves(){
  const mud=CHAVES_OBRA.map(c=>{const e=$('#ch-'+c.k);if(!e)return null;const novo=!!e.checked,ant=chaveLigada(c.k);return novo===ant?null:{k:c.k,ant,novo}}).filter(Boolean);
  if(!mud.length||!can('param'))return 0;
  mud.forEach(m=>{S.t.par[m.k]=m.novo;log('parametros','chave',m.k,m.ant?'ligada':'desligada',m.novo?'ligada':'desligada')});
  return mud.length}
/* grava só as chaves liga/desliga; não mexe nas alçadas (por isso não marca "alçadas definidas") */
ACOES['chaves-ok']=()=>{if(!can('param'))return toast('Só Diretoria ou Gestão');
  gravaChaves();prep();save();closeModal();toast('Chaves salvas');render()};

/* M3: linhas de um pedido (item, evento, pacote, valor, quanto já foi faturado e o saldo atual do item) */
ACOES['oc-lin']=el=>{const o=S.t.ocs.find(x=>x.id===el.dataset.id),L=linhasDe(o);
  modal(`<h3>Linhas de ${o.num}</h3><div class="sub">${esc(o.forn)} · ${brl(o.valor)} · ${o.status.replace('_',' ')}. A nota rateia nestes mesmos itens.</div>
   <div class="tw" style="max-height:50vh"><table class="tbl"><thead><tr><th>Item</th><th>Evento</th><th>Pacote</th><th class="r">Qtd.</th><th class="r">Valor</th><th class="r">Faturado</th><th class="r">Saldo do item</th></tr></thead><tbody>${L.map(l=>{const it=S.byCod[l.item]||{},sd=S.sd[l.item]||{livre:0},fat=S.t.notas.filter(n=>n.oc===o.id&&n.status!=='lancada').reduce((a,n)=>a+n.rateio.filter(r=>r.item===l.item).reduce((b,r)=>b+ +r.valor,0),0);
    return `<tr><td><span class="mono">${esc(l.item)}</span><div class="mut" style="font-size:11.5px">${esc((it.descricao||'').slice(0,60))}</div></td><td class="mono">${esc(evDe(it)||'—')}</td><td class="mono">${esc(pacDe(it)||'—')}</td><td class="r">${num(l.qtd)}</td><td class="r">${brl(l.valor)}</td><td class="r">${brl(fat)}</td><td class="r ${sd.livre<0?'neg':''}">${brl(sd.livre)}</td></tr>`}).join('')}</tbody></table></div>
   <div class="acts"><button class="btn" data-act="fechar">Fechar</button></div>`)};
