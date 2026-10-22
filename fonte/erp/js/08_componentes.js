/* ============ componentes ============ */
/* Navegação: 8 áreas com abas internas. S.view continua sendo a chave da tela; a área é derivada. Áreas sem telas ainda ficam ocultas. */
const AREAS=[
 {k:'inicio',n:'Início',i:'hoje',tabs:[['dash','Dashboard'],['hoje','Hoje'],['pain','Painéis']]},
 {k:'obra',n:'Obra',i:'eap',tabs:[['eap','Orçamento (EAP)'],['pac','Pacotes'],['campo','Campo'],['lean','Planejamento semanal'],['rastro','Da tarefa à compra e ao BM'],['med','Medição e resultado']]},
 {k:'sup',n:'Suprimentos',i:'compras',tabs:[['compras','Compras'],['cdash','Dashboard de compras'],['pedc','Consulta de pedidos'],['nota','Notas e rateio'],['cad','Cadastros'],['est','Estoque']]},
 {k:'fin',n:'Financeiro',i:'fin',tabs:[['fin','Pagar e conciliar'],['fat','Faturamento e caixa']]},
 {k:'cont',n:'Contábil e fiscal',i:'plano',tabs:[['plano','Plano de contas'],['ctb','Contabilidade']]},
 {k:'pess',n:'Pessoas',i:'hoje',tabs:[['pes','Pessoas e ponto'],['sst','Segurança (SST)']]},
 {k:'ativos',n:'Contratos e ativos',i:'eap',tabs:[['ctr','Contratos'],['prj','Projetos'],['pat','Patrimônio'],['frt','Frota']]},
 {k:'adm',n:'Gestão e administração',i:'aud',tabs:[['bi','Indicadores e BI'],['admin','Administração'],['fluxo','Fluxos e SLA'],['aud','Auditoria'],['usuarios','Usuários']]},
];
/* Quais telas cada papel vê no menu (as ações dentro de cada tela continuam limitadas por can()). Papéis de gestão veem tudo. */
const TELAS_PAPEL={encarregado:['hoje','eap','campo','lean','frt','pes'],almox:['hoje','pac','rastro','compras','cdash','pedc','nota','cad','est','frt','lean'],planejamento:['hoje','pain','eap','pac','campo','lean','rastro','med','prj'],
  compras:['hoje','pain','eap','pac','rastro','compras','cdash','pedc','nota','cad','est','lean'],adm:['hoje','rastro','compras','cdash','pedc','nota','cad','est','ctr','pat','frt','pes','sst','fluxo','fin','plano','ctb','aud'],financeiro:['hoje','pain','rastro','ctr','pat','compras','cdash','pedc','nota','cad','fin','fat','plano','ctb','aud']};
const tabVisivel=k=>{if(k==='dash')return true;if(k==='admin')return isRole('diretoria','gestao','gerente')||S.role==='admin';if(k==='usuarios')return MODO_SB&&S.role==='admin';const l=TELAS_PAPEL[S.role];return !l||l.includes(k)};
const areasVisiveis=()=>AREAS.map(a=>({...a,tabs:a.tabs.filter(t=>tabVisivel(t[0]))})).filter(a=>a.tabs.length);
const areaDe=v=>areasVisiveis().find(a=>a.tabs.some(t=>t[0]===v))||areasVisiveis()[0];
const NAV_BASE=AREAS.flatMap(a=>a.tabs.map(t=>[t[0],t[1],a.i]));
const navItens=()=>NAV_BASE.filter(n=>tabVisivel(n[0]));
const badgeArea=(a,X)=>a.tabs.map(t=>badgeFor(t[0],X)).join('');
const abasDaArea=a=>a.tabs.length<2?'':`<div class="tabs areatabs">${a.tabs.map(([k,l])=>`<button data-v="${k}" class="${S.view===k?'on':''}">${l}</button>`).join('')}</div>`;
function badgeFor(k,X){return k==='compras'?(X.pendAprov.length?`<span class="badge hot">${X.pendAprov.length}</span>`:''):k==='nota'?(X.semRateio.length?`<span class="badge hot">${X.semRateio.length}</span>`:''):''}
function ticks(items){return items.map(i=>`<i class="${i.meta_total>i.teto_total?'r':i.status_cotacao==='A cotar'?'w':''}" title="${i.codigo}"></i>`).join('')}
function ring(p,c){return `<div class="ring" style="--p:${Math.round(p*100)};--c:${c}"><span>${Math.round(p*100)}</span></div>`}
function bar(a,b,tot){const w=x=>tot>0?Math.min(100,Math.max(0,x/tot*100)):0;return `<div class="bar" title="comprometido ${brl(a)} · realizado ${brl(b)} · meta ${brl(tot)}"><i class="b" style="width:${w(b)}%"></i><i class="a" style="width:${Math.min(w(a),100-w(b))}%"></i></div>`}
function tabs(id,list,cur){return `<div class="tabs" data-tabs="${id}">${list.map(([k,l,n])=>`<button data-t="${k}" class="${cur===k?'on':''}">${l}${n?` <em>${n}</em>`:''}</button>`).join('')}</div>`}
let FOCO_ANT=null;
function modal(html){$('#mbox').classList.remove('wide');if(!$('#modal').classList.contains('open'))FOCO_ANT=document.activeElement;$('#mbox').innerHTML=html;const h=$('#mbox').querySelector('h3');$('#mbox').setAttribute('aria-label',h?h.textContent:'Janela');$('#modal').classList.add('open');
  if(typeof apresPass==='function')apresPass();setTimeout(()=>{const f=$('#mbox').querySelector('input:not([type=hidden]),select,textarea,button');if(f&&!$('#mbox').contains(document.activeElement))f.focus()},0)}
function closeModal(){$('#modal').classList.remove('open');if(FOCO_ANT&&FOCO_ANT.focus&&document.contains(FOCO_ANT)){try{FOCO_ANT.focus()}catch(e){}}FOCO_ANT=null}
const itemOptions=(sel)=>S.D.items.map(i=>`<option value="${i.codigo}" ${sel===i.codigo?'selected':''}>${i.codigo} · ${esc(i.descricao.slice(0,70))}</option>`).join('');

