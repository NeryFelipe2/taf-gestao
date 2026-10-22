/* ============ FISCAL: XML de NF-e, fechamento ao contador e integrações (Fase 10) ============ */
const FISCAL={provedor:null};   // provedor externo (ex.: Focus NFe) ainda não contratado: nada é chamado sem credencial
const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
function xmlTxt(doc,tag){const e=doc.getElementsByTagName(tag)[0];return e?e.textContent.trim():''}
function parseNFe(txt){
  const doc=new DOMParser().parseFromString(txt,'application/xml');
  if(doc.getElementsByTagName('parsererror').length)throw new Error('XML inválido');
  const inf=doc.getElementsByTagName('infNFe')[0];if(!inf)throw new Error('Não é uma NF-e (sem infNFe)');
  const chave=(inf.getAttribute('Id')||'').replace(/\D/g,'');
  const emit=doc.getElementsByTagName('emit')[0],ide=doc.getElementsByTagName('ide')[0];
  const g=(p,t)=>{const e=p&&p.getElementsByTagName(t)[0];return e?e.textContent.trim():''};
  const dh=g(ide,'dhEmi')||g(ide,'dEmi');
  const itens=[...doc.getElementsByTagName('det')].map(d=>({desc:g(d,'xProd'),qtd:+g(d,'qCom')||0,valor:+g(d,'vProd')||0}));
  const v=+xmlTxt(doc,'vNF')||0;
  return {chave,num:g(ide,'nNF'),serie:g(ide,'serie'),emissao:dh.slice(0,10),emitente:g(emit,'xNome'),cnpj:g(emit,'CNPJ')||g(emit,'CPF'),valor:r2(v),itens,
    inss:r2(+xmlTxt(doc,'vRetPrev')||0),iss:r2(+xmlTxt(doc,'vISSRet')||+xmlTxt(doc,'vISS')||0)}}
function sugereOC(x){
  const ocs=S.t.ocs.filter(o=>['aprovada','recebida_parcial','recebida'].includes(o.status)&&norm(o.forn)&&(norm(x.emitente).includes(norm(o.forn))||norm(o.forn).includes(norm(x.emitente))));
  const bons=ocs.filter(o=>Math.abs(o.valor-x.valor)/Math.max(o.valor,1)<=S.t.par.tol);return bons.length===1?bons[0]:null}
function importaXmls(textos){
  const res={ok:[],dup:[],erro:[]};
  textos.forEach(([nome,t])=>{try{const x=parseNFe(t);
    if(x.chave&&S.t.notas.some(n=>n.chave===x.chave)){res.dup.push(nome+' (chave já lançada)');return}
    if(!(x.valor>0)){res.erro.push(nome+': sem valor');return}
    const o=sugereOC(x);
    const n={id:'n'+Date.now()+Math.random().toString(36).slice(2,5),num:nextNum('nf'),emitente:x.emitente,cnpj:x.cnpj,chave:x.chave||x.num,nfNum:x.num,valor:x.valor,emissao:x.emissao||hojeISO(),oc:o?o.id:'',ocNum:o?o.num:'',rateio:[],status:'lancada',origemXml:true,itensXml:x.itens,retInss:x.inss,retIss:x.iss,justSemOC:o?'':'Importada de XML sem pedido correspondente'};
    S.t.notas.unshift(n);log('nota_fiscal',n.num,'importada_xml','',x.emitente+' · '+brl(x.valor)+(o?' · sugerida '+o.num:''));res.ok.push(n.num+' '+x.emitente+' '+brl(x.valor)+(o?' → '+o.num:' (sem pedido)'))}
   catch(e){res.erro.push(nome+': '+e.message)}});
  save();return res}
function modalXml(){modal(`<h3>Importar XML de NF-e</h3><div class="sub">Escolha um ou mais arquivos .xml, ou cole o conteúdo. A nota entra em “Sem rateio”; o rateio continua manual e precisa fechar 100%. Chave já lançada é recusada.</div>
  <label>Arquivos</label><input id="x-f" type="file" accept=".xml,text/xml" multiple><label>Ou cole o XML</label><textarea id="x-t" rows="5"></textarea><div id="x-r" class="sub" style="margin-top:8px"></div>
  <div class="acts"><button class="btn" data-act="fechar">Fechar</button><button class="btn dark" data-act="xml-ok">Importar</button></div>`)}
async function doXml(){
  const T=[];const f=$('#x-f').files;for(const a of f)T.push([a.name,await a.text()]);const t=$('#x-t').value.trim();if(t)T.push(['texto colado',t]);
  if(!T.length)return toast('Escolha um arquivo ou cole o XML');
  const r=importaXmls(T);S.msgXml=r;
  $('#x-r').innerHTML=`<b>${r.ok.length} importada(s)</b>${r.ok.map(x=>'<div>• '+esc(x)+'</div>').join('')}${r.dup.length?'<div class="neg">'+r.dup.map(esc).join('<br>')+'</div>':''}${r.erro.length?'<div class="neg">'+r.erro.map(esc).join('<br>')+'</div>':''}`;render()}
/* fechamento mensal */
const csvCel=v=>{const s=String(v??'');return /[;"\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
const csvNum=v=>(+v||0).toFixed(2).replace('.',',');
function linhasFechamento(comp){
  const L=[];S.t.notas.filter(n=>n.status!=='lancada'&&mesDe(n.emissao)===comp).forEach(n=>{
    const bruto=n.rateio.reduce((s,l)=>s+ +l.valor,0)||n.valor;const rt=retencoesNota(n);
    n.rateio.forEach(l=>{const i=S.byCod[l.item]||{};const k=bruto?l.valor/bruto:0;
      L.push([n.emissao,comp,n.emitente,n.cnpj||'',n.nfNum||n.num,n.chave||'',csvNum(n.valor),csvNum(l.valor),csvNum(l.nat==='TER'&&rt.base>0?rt.inss*l.valor/rt.base:0),csvNum(l.nat==='TER'&&rt.base>0?rt.iss*l.valor/rt.base:0),S.D.obra.codigo,S.t.par.cno||'',l.item,i.descricao||'',l.conta,l.nat,n.status,n.pago||''])})});
  return L}
const CAB_FECH=['emissao','competencia','fornecedor','cnpj','nota','chave','valor_nota','valor_rateado','retencao_inss','retencao_iss','obra','cno','item_eap','descricao_item','conta_plano','natureza','status','pago_em'];
const montaCsv=(cab,L)=>'﻿'+[cab,...L].map(r=>r.map(csvCel).join(';')).join('\r\n');
function viewFiscal(){
  const comp=S.comp||mesDe(hojeISO()),L=linhasFechamento(comp),sem=S.t.notas.filter(n=>n.status==='lancada'&&mesDe(n.emissao)===comp);
  const tot=L.reduce((s,r)=>s+parseFloat(String(r[7]).replace(',','.')),0);
  const fe=S.t.fechs.find(f=>f.comp===comp&&!f.reaberta);
  return `<div class="g3" style="grid-template-columns:1fr 1fr 2fr;margin-top:12px"><div><label style="margin-top:0">Competência</label><input id="f-comp" type="month" value="${comp}"></div><div><label style="margin-top:0">CNO da obra</label><input id="f-cno" value="${esc(S.t.par.cno||'')}" placeholder="ex.: 90.123.45678/12"></div><div><label style="margin-top:0">Município de execução</label><input id="f-mun" value="${esc(S.t.par.mun||S.D.obra.municipio||'')}"></div></div>
  <div class="kpi4"><div><div class="k-l">Notas rateadas no mês</div><div class="v">${new Set(L.map(r=>r[4]+r[5])).size}</div></div><div><div class="k-l">Valor rateado</div><div class="v">${brl(tot,true)}</div></div><div><div class="k-l">Ainda sem rateio</div><div class="v ${sem.length?'neg':''}">${sem.length}</div></div><div><div class="k-l">Situação</div><div class="v" style="font-size:16px">${fe?'Fechada em '+fdata(fe.quando.slice(0,10)):'Aberta'}</div></div></div>
  ${sem.length?`<div class="alert" style="margin-top:12px"><div class="g" style="color:var(--warn)">!</div><div><b>${sem.length} nota(s) do mês sem rateio</b><p>Não entram no arquivo do contador até serem rateadas.</p></div></div>`:''}
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn dark" data-act="fech-csv" ${L.length?'':'disabled'}>Gerar arquivo do contador</button><button class="btn ok" data-act="fech-fechar" ${L.length&&!fe&&can('recFat')?'':'disabled title="Só Financeiro, Adm ou Diretoria, com notas no mês"'}>Fechar competência</button></div>
  ${S.csvOut?`<label>Arquivo gerado (copie ou baixe)</label><textarea id="f-out" rows="6" readonly>${esc(S.csvOut.replace('﻿',''))}</textarea><div style="display:flex;gap:8px;margin-top:8px"><button class="btn" data-act="fech-copy">Copiar</button><a class="btn" id="f-dl" download="${S.csvNome||'fechamento.csv'}" href="${'data:text/csv;charset=utf-8,'+encodeURIComponent(S.csvOut)}">Baixar .csv</a></div>`:''}
  <div class="sub" style="margin-top:10px">Cada linha é um item da EAP com sua conta do plano, para o contador conciliar custo por obra e CNO.</div>
  ${viewIntegracoes(comp)}`}
function fechGerar(){const comp=S.comp||mesDe(hojeISO());S.csvOut=montaCsv(CAB_FECH,linhasFechamento(comp));S.csvNome='contador_'+S.D.obra.codigo+'_'+comp+'.csv';log('fechamento',comp,'arquivo_contador','','gerado');render()}
function fechFechar(){const comp=S.comp||mesDe(hojeISO());if(S.t.fechs.some(f=>f.comp===comp&&!f.reaberta))return;const L=linhasFechamento(comp);
  S.t.fechs.push({id:'fe'+Date.now(),comp,quando:new Date().toISOString(),quem:user(),linhas:L.length});log('fechamento',comp,'competência','aberta','fechada · '+L.length+' linhas');save();toast('Competência '+comp+' fechada');render()}
