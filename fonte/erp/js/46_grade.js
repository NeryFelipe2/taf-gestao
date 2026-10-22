/* ============ GRADE GENÉRICA (Fase 22): colunas escolhíveis, busca, Σ estatísticas, CSV e Excel ============ */
const colsKey=id=>'taf_cols_'+id;
function colsVis(id,def){let v=null;try{v=JSON.parse(localStorage.getItem(colsKey(id))||'null')}catch(e){}if(!v&&S.colMem)v=S.colMem[id];const ok=Array.isArray(v)?v.filter(k=>def.some(d=>d[0]===k)):null;return ok&&ok.length?ok:def.map(d=>d[0])}
const fcel=(t,v)=>t==='n'?brl(v):t==='q'?(+v||0).toLocaleString('pt-BR',{maximumFractionDigits:3}):t==='d'?fdz(v):esc(v==null?'':v);
const gnum=t=>t==='n'||t==='q';
S.grRows=S.grRows||{};S.grDef=S.grDef||{};S.grBack=S.grBack||{};
function gradeTable(id,def,rows,o={}){S.grRows[id]=rows;S.grDef[id]=def;const vis=colsVis(id,def),C=vis.map(k=>def.find(d=>d[0]===k)),tot=C.map(([k,,t])=>gnum(t)?r2(rows.reduce((s,r)=>s+(+r[k]||0),0)):null),hl=o.hl;
  return `<div class="tw detw grw" data-id="${id}"><table class="tbl"><thead><tr>${C.map(([k,l,t])=>`<th class="${gnum(t)?'r':''} ${hl===k?'hl':''}">${l}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr ${o.rowAct?`class="clk" tabindex="0" ${o.rowAct(r)}`:''}>${C.map(([k,,t])=>`<td class="${gnum(t)?'r':''} ${hl===k?'hl':''} ${gnum(t)&&+r[k]<0?'neg':''}">${fcel(t,r[k])}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${C.length}"><span class="zero">0</span> registros</td></tr>`}</tbody>
  <tfoot><tr>${C.map(([k,,t],i)=>`<td class="${gnum(t)?'r':''}">${i===0?'Total ('+rows.length+')':gnum(t)&&o.total!==false?(t==='q'?(tot[i]).toLocaleString('pt-BR',{maximumFractionDigits:3}):brl(tot[i])):''}</td>`).join('')}</tr></tfoot></table></div>`}
const gradeBusca=id=>`<input class="gr-q" data-id="${id}" type="search" placeholder="Buscar na tabela" aria-label="Buscar na tabela">`;
function gradeTools(id,def,back){S.grBack[id]=back;return `<button class="btn sm" data-act="gr-cfg" data-id="${id}">Colunas</button><button class="btn sm" data-act="gr-sum" data-id="${id}" title="Estatísticas das colunas numéricas">Σ Estatísticas</button><button class="btn sm" data-act="gr-csv" data-id="${id}">Copiar CSV</button><button class="btn sm" data-act="gr-xls" data-id="${id}">Baixar Excel</button>`}
function gradeLinhas(id){const def=S.grDef[id],vis=colsVis(id,def),C=vis.map(k=>def.find(d=>d[0]===k)),rows=S.grRows[id]||[];
  return [C.map(c=>c[1]),...rows.map(r=>C.map(([k,,t])=>gnum(t)?((typeof apresGet==='function'&&apresGet().val)?'•••':(t==='q'?String(+r[k]||0):String(r2(+r[k]||0))).replace('.',',')):t==='d'?fdz(r[k]):String(r[k]??'')))]}
const gradeCsv=id=>'﻿'+gradeLinhas(id).map(l=>l.map(csvCel).join(';')).join('\r\n');
const mascara=t=>typeof apresMascara==='function'?apresMascara(t):t;
/* Σ estatísticas: soma, média, ocorrências, maior e menor de cada coluna numérica visível */
function gradeStats(id){const def=S.grDef[id],rows=S.grRows[id]||[],vis=colsVis(id,def),C=vis.map(k=>def.find(d=>d[0]===k)).filter(c=>gnum(c[2]));
  return C.map(([k,l,t])=>{const v=rows.map(r=>+r[k]||0),n=v.length,soma=r2(v.reduce((a,b)=>a+b,0));return {k,l,t,soma,media:n?r2(soma/n):0,n,maior:n?Math.max(...v):0,menor:n?Math.min(...v):0}})}
ACOES['gr-sum']=el=>{const id=el.dataset.id,E=gradeStats(id),f=(t,v)=>t==='q'?(+v).toLocaleString('pt-BR',{maximumFractionDigits:3}):brl(v);
  modal(`<h3>Estatísticas</h3><div class="sub">${(S.grRows[id]||[]).length} linhas da tabela.</div><div class="tw"><table class="tbl"><thead><tr><th>Coluna</th><th class="r">Soma</th><th class="r">Média</th><th class="r">Ocorrências</th><th class="r">Maior</th><th class="r">Menor</th></tr></thead><tbody>${E.map(x=>`<tr><td>${x.l}</td><td class="r">${f(x.t,x.soma)}</td><td class="r">${f(x.t,x.media)}</td><td class="r">${x.n}</td><td class="r">${f(x.t,x.maior)}</td><td class="r">${f(x.t,x.menor)}</td></tr>`).join('')||'<tr><td colspan="6"><span class="zero">0</span> colunas numéricas</td></tr>'}</tbody></table></div><div class="acts"><button class="btn dark" data-act="cfg-cancel" data-id="${id}">Fechar</button></div>`);$('#mbox').classList.add('wide')};
ACOES['gr-csv']=el=>{const t=mascara(gradeCsv(el.dataset.id).replace('﻿',''));try{navigator.clipboard.writeText(t).then(()=>toast('CSV copiado'),()=>toast('Não consegui copiar'))}catch(e){toast('Não consegui copiar')}};
/* Excel: tabela HTML com tipo MIME do Excel (abre direto no Excel/Planilhas) */
function gradeXls(id,nome){const L=gradeLinhas(id).map(l=>l.map(mascara)),h=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  return '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1">'+L.map((l,i)=>'<tr>'+l.map(c=>(i?'<td>':'<th>')+h(c)+(i?'</td>':'</th>')).join('')+'</tr>').join('')+'</table></body></html>'}
ACOES['gr-xls']=el=>{const id=el.dataset.id,t=gradeXls(id);try{const b=new Blob([t],{type:'application/vnd.ms-excel;charset=utf-8'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=id+'_'+hojeISO()+'.xls';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2000);toast('Planilha gerada')}catch(e){toast('Não consegui baixar aqui; use Copiar CSV')}};
/* configuração das colunas */
function cfgHtml(o,m,def){return `<h3>Configuração da grade</h3><div class="sub">Marque as colunas que quer ver e ajuste a ordem. Fica salvo neste navegador.</div><div class="colcfg">${o.map(k=>{const [,l]=def.find(c=>c[0]===k);return `<div class="colrow"><label><input type="checkbox" data-colk="${k}" ${m.includes(k)?'checked':''}> ${l}</label><button class="btn sm" data-act="col-up" data-k="${k}" aria-label="Subir ${l}">↑</button><button class="btn sm" data-act="col-down" data-k="${k}" aria-label="Descer ${l}">↓</button></div>`}).join('')}</div>
  <div class="acts"><button class="btn" data-act="col-reset">Restaurar padrão</button><button class="btn" data-act="cfg-cancel" data-id="${S.cfg.id}">Cancelar</button><button class="btn dark" data-act="col-save">Salvar</button></div>`}
const colMarcadas=()=>[...document.querySelectorAll('#mbox [data-colk]')].filter(x=>x.checked).map(x=>x.dataset.colk),colOrdem=()=>[...document.querySelectorAll('#mbox [data-colk]')].map(x=>x.dataset.colk);
function colGrava(id,v){try{localStorage.setItem(colsKey(id),JSON.stringify(v))}catch(e){}S.colMem=S.colMem||{};S.colMem[id]=v}
const cfgAbre=(o,m)=>{modal(cfgHtml(o,m,S.cfg.def));$('#mbox').classList.add('wide')};
ACOES['gr-cfg']=el=>{const id=el.dataset.id,def=S.grDef[id],vis=colsVis(id,def);S.cfg={id,def};cfgAbre([...vis,...def.map(c=>c[0]).filter(k=>!vis.includes(k))],vis)};
function colMove(k,d){const o=colOrdem(),m=colMarcadas(),i=o.indexOf(k),j=i+d;if(j<0||j>=o.length)return;[o[i],o[j]]=[o[j],o[i]];cfgAbre(o,m)}
const gradeVolta=id=>{closeModal();(S.grBack[id]||render)()};
ACOES['col-up']=el=>colMove(el.dataset.k,-1);ACOES['col-down']=el=>colMove(el.dataset.k,1);
ACOES['col-save']=()=>{const m=colMarcadas();if(!m.length)return toast('Deixe ao menos uma coluna');colGrava(S.cfg.id,colOrdem().filter(k=>m.includes(k)));gradeVolta(S.cfg.id)};
ACOES['col-reset']=()=>{try{localStorage.removeItem(colsKey(S.cfg.id))}catch(e){}if(S.colMem)delete S.colMem[S.cfg.id];gradeVolta(S.cfg.id)};
ACOES['cfg-cancel']=el=>gradeVolta(el.dataset.id||(S.cfg&&S.cfg.id));
document.addEventListener('input',e=>{if(e.target.classList&&e.target.classList.contains('gr-q')){const q=e.target.value.toLowerCase();document.querySelectorAll(`.grw[data-id="${e.target.dataset.id}"] tbody tr`).forEach(r=>{r.style.display=!q||r.innerText.toLowerCase().includes(q)?'':'none'})}});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches&&e.target.matches('tr.clk'))e.target.click()});
