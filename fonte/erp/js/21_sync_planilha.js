/* ============ ATUALIZAR METAS PELA PLANILHA (Fase 11) ============ */
const XLSX_URL='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
let SYNC=null;
function carregaXlsx(){return new Promise((ok,no)=>{if(window.XLSX)return ok(window.XLSX);const s=document.createElement('script');s.src=XLSX_URL;s.onload=()=>ok(window.XLSX);s.onerror=()=>no(new Error('Não consegui carregar o leitor de Excel (precisa de internet). Use o arquivo .json gerado pelo importador.'));document.head.appendChild(s)})}
const nOrNull=v=>{const n=typeof v==='number'?v:parseFloat(String(v??'').replace(/\./g,'').replace(',','.'));return Number.isFinite(n)?n:null};
async function linhasDaPlanilha(file){
  if(/\.json$/i.test(file.name)){const j=JSON.parse(await file.text());return {itens:(j.eap||[]).filter(e=>e.tipo_linha==='item'&&e.meta_total!=null).map(e=>({codigo:e.codigo,qtd:e.qtd,meta:e.meta_total,teto:e.teto_total,status:e.status_cotacao})),pacotes:(j.pacotes||[]).map(p=>({codigo:p.codigo,meta:p.meta,teto:p.teto,fechar_ate:p.fechar_ate}))}}
  const X=await carregaXlsx();const wb=X.read(await file.arrayBuffer(),{type:'array',cellDates:true});
  const aba=(pref)=>{const n=wb.SheetNames.find(x=>x.startsWith(pref));if(!n)throw new Error('Aba "'+pref+'" não encontrada. É o Estudo de Obra interno?');return X.utils.sheet_to_json(wb.Sheets[n],{header:1,defval:null,raw:true})};
  const tabela=(rows,chave)=>{const h=rows.findIndex(r=>r&&r.includes(chave));if(h<0)throw new Error('Cabeçalho "'+chave+'" não encontrado');const cab=rows[h];return rows.slice(h+1).map(r=>Object.fromEntries(cab.map((c,k)=>[c,r[k]])))};
  const itens=tabela(aba('12.'),'Item').filter(r=>r['Item']).map(r=>({codigo:String(r['Item']).trim(),qtd:nOrNull(r['Qtd']),meta:nOrNull(r['Custo adotado'])??nOrNull(r['Meta custo total']),teto:nOrNull(r['Teto total (margem zero)']),status:r['Status']}));
  const dt=v=>v instanceof Date?v.toISOString().slice(0,10):null;
  const pacotes=tabela(aba('11.'),'Pacote').filter(r=>r['Pacote']&&r['Pacote']!=='TOTAL').map(r=>({codigo:r['Pacote'],meta:nOrNull(r['Meta de custo']),teto:nOrNull(r['Teto (margem zero)']),fechar_ate:dt(r['Fechar até'])}));
  return {itens,pacotes}}
function calculaDiff(L){
  const dif=[],info={novos:[],semQtd:[]},seen=new Set();
  L.itens.forEach(r=>{const i=S.byCod[r.codigo];seen.add(r.codigo);
    if(!i||i.tipo_linha!=='item'){info.novos.push(r.codigo);return}
    if(r.qtd!=null&&i.qtd!=null&&Math.abs(r.qtd-i.qtd)>1e-6)info.semQtd.push(`${r.codigo}: planilha ${num(r.qtd)} × orçamento ${num(i.qtd)}`);
    const m=r.meta!=null?r2(r.meta):null,t=r.teto!=null?r2(r.teto):null,mudou=[];
    if(m!=null&&(i.meta_base==null||Math.abs(m-i.meta_base)>0.005))mudou.push(['Meta',i.meta_base,m]);
    if(t!=null&&(i.teto_total==null||Math.abs(t-i.teto_total)>0.005))mudou.push(['Teto',i.teto_total,t]);
    if(r.status&&r.status!==i.status_cotacao)mudou.push(['Status',i.status_cotacao,r.status]);
    if(mudou.length)dif.push({codigo:r.codigo,mudou,novo:{meta_total:m??i.meta_base,teto_total:t??i.teto_total,status_cotacao:r.status||i.status_cotacao,qtd:i.qtd}})});
  const pacs=[];L.pacotes.forEach(r=>{const p=S.D.pacotes.find(x=>x.codigo===r.codigo);if(!p)return;
    if((r.meta!=null&&Math.abs(r2(r.meta)-p.meta)>0.005)||(r.teto!=null&&Math.abs(r2(r.teto)-p.teto)>0.005)||(r.fechar_ate&&r.fechar_ate!==p.fechar_ate))pacs.push({codigo:r.codigo,nome:p.nome,meta:r.meta!=null?r2(r.meta):p.meta,teto:r.teto!=null?r2(r.teto):p.teto,fechar_ate:r.fechar_ate||p.fechar_ate,antes:{meta:p.meta,teto:p.teto,fechar_ate:p.fechar_ate}})});
  const semMov=S.D.items.filter(i=>!seen.has(i.codigo)).length;
  /* calc_v2 [SUPOSIÇÃO, plano M1]: itens com remanejamento. A meta remanejada vence a meta nova da planilha (prep(): metaOv por cima de baseOv);
     a tela lista esses itens para o gestor escolher qual meta vale. */
  if(calcV2(S.t))info.remanejados=L.itens.map(r=>({r,i:S.byCod[r.codigo]})).filter(({i})=>i&&i.tipo_linha==='item'&&S.t.metaOv[i.codigo]!=null)
    .map(({r,i})=>({codigo:i.codigo,metaAtual:i.meta_total,metaBase:i.meta_base,metaPlanilha:r.meta!=null?r2(r.meta):null}));
  return {dif,pacs,info,semMov,dMeta:r2(dif.reduce((s,d)=>s+(d.novo.meta_total||0)-(S.byCod[d.codigo].meta_base||0),0))}}
function modalSync(){SYNC=null;modal(`<h3>Atualizar metas pela planilha</h3><div class="sub">Escolha o Estudo de Obra (.xlsx, abas 11 e 12) ou o .json do importador. O app mostra o que mudou e só aplica depois da sua confirmação, como <b>nova versão da linha de base</b>. Preço licitado e quantidades do contrato não são alterados.</div>
  <label>Arquivo</label><input id="sy-f" type="file" accept=".xlsx,.xlsm,.json"><div id="sy-r" style="margin-top:10px"></div>
  <div class="acts"><button class="btn" data-act="fechar">Fechar</button><button class="btn dark" data-act="sync-ler">Comparar</button><button class="btn ok" id="sy-ap" data-act="sync-aplicar" disabled>Aplicar como nova versão</button></div>`)}
const syncPode=()=>{const d=SYNC;return !!d&&can('congelar')&&!!(d.dif.length||d.pacs.length||Object.keys(d.usar||{}).length)};
/* bloco "itens com remanejamento" da tela de comparação (só existe com calc_v2 ligada) */
function syncRemanejados(d){const L=d.info.remanejados;if(!L||!L.length)return '';
  return `<div class="panel-t" style="margin-top:12px">Itens com remanejamento (${L.length})</div>
   <div class="sub">Nestes itens vale a meta remanejada, não a da planilha. Marque os itens em que a meta da planilha deve substituir o remanejamento: o remanejamento do item é desfeito, fica na auditoria e o total da obra pode mudar.</div>
   <div class="tw" style="max-height:200px;overflow:auto"><table class="tbl"><thead><tr><th></th><th>Item</th><th class="r">Meta atual (remanejada)</th><th class="r">Meta da planilha</th><th class="r">Meta sem o remanejamento</th></tr></thead><tbody>${L.map(x=>`<tr><td><input type="checkbox" data-sy-rm="${esc(x.codigo)}" ${x.metaPlanilha==null?'disabled title="A planilha não traz meta para este item"':''} aria-label="Usar a meta da planilha no item ${esc(x.codigo)}"></td><td class="mono">${esc(x.codigo)}</td><td class="r">${brl(x.metaAtual)}</td><td class="r">${x.metaPlanilha==null?'—':brl(x.metaPlanilha)}</td><td class="r mut">${brl(x.metaBase)}</td></tr>`).join('')}</tbody></table></div>`}
document.addEventListener('change',e=>{const t=e.target;if(!t||!t.dataset||t.dataset.syRm===undefined||!SYNC)return;
  SYNC.usar=SYNC.usar||{};if(t.checked)SYNC.usar[t.dataset.syRm]=1;else delete SYNC.usar[t.dataset.syRm];const b=$('#sy-ap');if(b)b.disabled=!syncPode()});
async function syncLer(){const f=$('#sy-f').files[0];if(!f)return toast('Escolha o arquivo');$('#sy-r').innerHTML='<div class="sub">Lendo…</div>';
  try{const L=await linhasDaPlanilha(f);SYNC=calculaDiff(L);SYNC.arquivo=f.name;
    const d=SYNC;$('#sy-r').innerHTML=`<div class="kpi4"><div><div class="k-l">Itens com mudança</div><div class="v">${d.dif.length}</div></div><div><div class="k-l">Pacotes com mudança</div><div class="v">${d.pacs.length}</div></div><div><div class="k-l">Variação da meta</div><div class="v ${d.dMeta>0?'neg':'pos'}">${brl(d.dMeta,true)}</div></div><div><div class="k-l">Itens fora do orçamento</div><div class="v">${d.info.novos.length}</div></div></div>
    ${d.dif.length?`<div class="tw" style="max-height:260px;overflow:auto"><table class="tbl"><thead><tr><th>Item</th><th>Mudança</th></tr></thead><tbody>${d.dif.slice(0,200).map(x=>`<tr><td class="mono">${x.codigo}</td><td>${x.mudou.map(m=>`${m[0]}: ${typeof m[1]==='number'?brl(m[1]):esc(m[1]||'—')} → <b>${typeof m[2]==='number'?brl(m[2]):esc(m[2])}</b>`).join(' · ')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="sub">Nenhuma diferença de meta, teto ou status nos itens.</div>'}
    ${syncRemanejados(d)}
    ${d.pacs.length?`<div class="sub" style="margin-top:8px">Pacotes: ${d.pacs.map(p=>esc(p.codigo)).join(', ')}</div>`:''}${d.info.semQtd.length?`<div class="sub neg" style="margin-top:8px">Quantidade diferente do orçamento (não aplicada): ${d.info.semQtd.slice(0,5).map(esc).join('; ')}${d.info.semQtd.length>5?'…':''}</div>`:''}${d.info.novos.length?`<div class="sub" style="margin-top:8px">Fora do orçamento (ignorados): ${d.info.novos.slice(0,8).join(', ')}${d.info.novos.length>8?'…':''}</div>`:''}`;
    $('#sy-ap').disabled=!syncPode()}catch(e){$('#sy-r').innerHTML=`<div class="neg">${esc(e.message)}</div>`}}
function syncAplicar(){const d=SYNC;if(!d||!can('congelar'))return;
  S.t.baseOv=S.t.baseOv||{};S.t.basePac=S.t.basePac||{};
  d.dif.forEach(x=>{const i=S.byCod[x.codigo];S.t.baseOv[x.codigo]={meta_total:x.novo.meta_total,teto_total:x.novo.teto_total,status_cotacao:x.novo.status_cotacao,meta_unit:i.qtd?r2(x.novo.meta_total/i.qtd*10000)/10000:i.meta_unit}});
  d.pacs.forEach(p=>S.t.basePac[p.codigo]={meta:p.meta,teto:p.teto,fechar_ate:p.fechar_ate});
  /* calc_v2: itens em que o gestor escolheu a meta da planilha no lugar do remanejamento (o remanejamento do item é desfeito) */
  const usar=calcV2(S.t)?(d.info.remanejados||[]).filter(x=>x.metaPlanilha!=null&&d.usar&&d.usar[x.codigo]):[];
  usar.forEach(x=>{log('item_eap',x.codigo,'meta_total',x.metaAtual,x.metaPlanilha,'planilha vale no lugar do remanejamento · '+d.arquivo);delete S.t.metaOv[x.codigo]});
  const v=(S.t.versao||1)+(S.t.frozen?1:0);S.t.versao=v;S.t.hist.push({versao:v,motivo:'Atualização pela planilha '+d.arquivo+' · '+d.dif.length+' itens, '+d.pacs.length+' pacotes'+(usar.length?', '+usar.length+' remanejamento(s) trocado(s) pela meta da planilha':''),quando:new Date().toISOString(),quem:user()});
  log('obra',S.D.obra.codigo,'linha_base','v'+(v-(S.t.frozen?1:0)),'v'+v+' · '+d.dif.length+' itens · variação '+brl(d.dMeta),d.arquivo);
  prep();save();closeModal();toast('Linha de base v'+v+' aplicada');render()}

