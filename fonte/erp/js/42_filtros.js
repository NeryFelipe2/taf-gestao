/* ============ FILTROS INTERATIVOS EM TODAS AS TABELAS (Fase 19) ============ */
/* Roda após cada render: acrescenta a toda tabela com 2+ linhas uma barra de busca, filtros por coluna, datas, valores, ordenação pelo cabeçalho,
   contador "N de M", limpar e copiar CSV. Filtra escondendo linhas (sem redesenhar, mantém o foco) e guarda o estado por tela e tabela. */
S.flt=S.flt||{};
const fNum=t=>{t=String(t).replace(/−/g,'-').replace(/R\$|\s|%/g,'');if(!/^-?[\d.]*(,\d+)?$/.test(t)||!/\d/.test(t))return null;return parseFloat(t.replace(/\./g,'').replace(',','.'))};
const fData=t=>{const m=String(t).match(/(\d{2})\/(\d{2})\/(\d{4})/);return m?m[3]+'-'+m[2]+'-'+m[1]:null};
const fSemData=t=>String(t).replace(/\d{2}\/\d{2}\/\d{4}/g,' ').replace(/\s+/g,' ').trim();
const fChave=(t,i)=>S.view+'|'+JSON.stringify(S.tab)+'|'+i;
const fCelula=(tr,i)=>{const c=tr.cells[i];return c?c.textContent.trim():''};
const fTx=(tr,i)=>fSemData(fCelula(tr,i));
function fLinhas(t){return [...t.tBodies].flatMap(b=>[...b.rows]).filter(r=>!(r.cells.length===1&&r.cells[0].colSpan>1))}
function fAnalisa(t,L){const th=[...t.tHead.rows[t.tHead.rows.length-1].cells],cols=[];
  th.forEach((h,i)=>{const nome=h.textContent.trim();const vals=L.slice(0,3000).map(r=>fCelula(r,i)).filter(v=>v!==''),n=vals.length;if(!n){cols.push({i,nome,tipo:'vazio'});return}
    const datas=vals.filter(v=>fData(v)).length,nums=vals.filter(v=>fNum(v)!==null).length,uniq=[...new Set(L.slice(0,3000).map(r=>fTx(r,i)).filter(v=>v!==''))];
    let tipo='texto';if(datas>=n*.7&&fSemData(vals[0]).length<=2)tipo='data';else if(nums>=n*.7)tipo='num';const temData=datas>=n*.5;
    cols.push({i,nome,tipo,temData,uniq:tipo==='texto'&&uniq.length>=2&&uniq.length<=12&&uniq.length<=L.length*.8?uniq.sort((a,b)=>a.localeCompare(b,'pt-BR')):null,dinheiro:tipo==='num'&&vals.some(v=>/R\$/.test(v))})});return cols}
function fBarra(t,L,cols,st){
  const sel=cols.filter(c=>c.uniq&&c.nome).map(c=>`<select class="f-c" data-i="${c.i}" aria-label="Filtrar por ${esc(c.nome)}"><option value="">${esc(c.nome)}: todos</option>${c.uniq.map(v=>`<option ${st.cols&&st.cols[c.i]===v?'selected':''} value="${esc(v)}">${esc(v.slice(0,40))}</option>`).join('')}</select>`).join('');
  const d=cols.find(c=>c.tipo==='data')||cols.find(c=>c.temData),m=cols.find(c=>c.dinheiro);
  return `<div class="fbar" role="search"><input class="f-q" type="search" placeholder="Filtrar esta lista…" aria-label="Filtrar linhas da tabela" value="${esc(st.q||'')}">${sel}`+
   (d?`<label class="f-l">${esc(d.nome)} de <input class="f-d" data-k="de" type="date" value="${st.de||''}" aria-label="${esc(d.nome)} a partir de"></label><label class="f-l">até <input class="f-d" data-k="ate" type="date" value="${st.ate||''}" aria-label="${esc(d.nome)} até"></label>`:'')+
   (m?`<label class="f-l">${esc(m.nome)} ≥ <input class="f-v" data-k="min" type="number" step="any" value="${st.min??''}" aria-label="${esc(m.nome)} mínimo"></label><label class="f-l">≤ <input class="f-v" data-k="max" type="number" step="any" value="${st.max??''}" aria-label="${esc(m.nome)} máximo"></label>`:'')+
   `<label class="f-l"><input class="f-al" type="checkbox" ${st.al?'checked':''} aria-label="Só linhas com alerta"> só alertas</label><span class="f-n" aria-live="polite"></span><button class="btn sm f-x" type="button">Limpar</button><button class="btn sm f-csv" type="button">Copiar CSV</button></div>`}
function fAplica(t){const bar=t.__bar;if(!bar)return;const st=t.__st,L=fLinhas(t),cols=t.__cols,dc=cols.find(c=>c.tipo==='data')||cols.find(c=>c.temData),mc=cols.find(c=>c.dinheiro);let n=0;
  const q=(st.q||'').toLowerCase().trim();
  L.forEach(r=>{let ok=true;
    if(q){if(r.__t===undefined)r.__t=r.textContent.toLowerCase();ok=r.__t.includes(q)}
    if(ok&&st.cols)for(const i in st.cols){if(st.cols[i]&&fTx(r,+i)!==st.cols[i]){ok=false;break}}
    if(ok&&dc&&(st.de||st.ate)){const v=fData(fCelula(r,dc.i));if(!v||(st.de&&v<st.de)||(st.ate&&v>st.ate))ok=false}
    if(ok&&mc&&(st.min!==undefined&&st.min!==''||st.max!==undefined&&st.max!=='')){const v=fNum(fCelula(r,mc.i));if(v===null||(st.min!==''&&st.min!==undefined&&v<+st.min)||(st.max!==''&&st.max!==undefined&&v>+st.max))ok=false}
    if(ok&&st.al&&!r.querySelector('.neg,.pill.bad,.pill.warn'))ok=false;
    r.style.display=ok?'':'none';if(ok)n++});
  const c=bar.querySelector('.f-n');if(c)c.textContent=n+' de '+L.length;
  const ativo=!!(q||(st.cols&&Object.values(st.cols).some(Boolean))||st.de||st.ate||(st.min!==undefined&&st.min!=='')||(st.max!==undefined&&st.max!=='')||st.al);bar.classList.toggle('f-on',ativo)}
function fOrdena(t,i,dir){const body=t.tBodies[0];if(!body)return;const L=fLinhas(t),col=t.__cols.find(c=>c.i===i)||{tipo:'texto'};
  const val=r=>{const v=fCelula(r,i);return col.tipo==='data'?(fData(v)||''):col.tipo==='num'?(fNum(v)??-Infinity):v.toLowerCase()};
  L.sort((a,b)=>{const x=val(a),y=val(b);const c=typeof x==='number'?x-y:String(x).localeCompare(String(y),'pt-BR');return dir*c});L.forEach(r=>body.appendChild(r))}
function filtrosPass(){const R=document.getElementById('view');if(!R)return;
  [...R.querySelectorAll('table.tbl')].forEach((t,k)=>{if(!t.tHead||!t.tHead.rows.length||t.closest('.grw'))return;const L=fLinhas(t);if(L.length<2)return;
    const key=fChave(null,k),st=S.flt[key]||(S.flt[key]={});t.__st=st;t.__key=key;const cols=fAnalisa(t,L);t.__cols=cols;
    const host=t.closest('.tw')||t,div=document.createElement('div');div.innerHTML=fBarra(t,L,cols,st);const bar=div.firstChild;host.parentNode.insertBefore(bar,host);t.__bar=bar;bar.__t=t;
    [...t.tHead.rows[t.tHead.rows.length-1].cells].forEach((h,i)=>{const c=cols[i];if(!c||c.tipo==='vazio'||!h.textContent.trim())return;h.classList.add('f-th');h.tabIndex=0;h.setAttribute('role','columnheader');h.setAttribute('aria-sort',st.sort&&st.sort.i===i?(st.sort.dir>0?'ascending':'descending'):'none');h.title='Ordenar por '+h.textContent.trim()});
    if(st.sort)fOrdena(t,st.sort.i,st.sort.dir);fAplica(t)})}
const fTab=el=>{const b=el.closest('.fbar');return b&&b.__t};
document.addEventListener('input',e=>{const t=fTab(e.target);if(!t)return;const st=t.__st;
  if(e.target.classList.contains('f-q'))st.q=e.target.value;else if(e.target.classList.contains('f-d')||e.target.classList.contains('f-v'))st[e.target.dataset.k]=e.target.value;else return;fAplica(t)});
document.addEventListener('change',e=>{const t=fTab(e.target);if(!t)return;const st=t.__st,el=e.target;
  if(el.classList.contains('f-c')){st.cols=st.cols||{};st.cols[el.dataset.i]=el.value}else if(el.classList.contains('f-al'))st.al=el.checked;else return;fAplica(t)});
document.addEventListener('click',e=>{const el=e.target;
  const th=el.closest&&el.closest('th.f-th');if(th){const t=th.closest('table'),i=th.cellIndex,st=t.__st;if(!st)return;const dir=st.sort&&st.sort.i===i?-st.sort.dir:1;st.sort={i,dir};fOrdena(t,i,dir);t.tHead.rows[t.tHead.rows.length-1].querySelectorAll('th').forEach((h,j)=>h.setAttribute('aria-sort',j===i?(dir>0?'ascending':'descending'):'none'));return}
  const t=fTab(el);if(!t)return;
  if(el.classList.contains('f-x')){const k=t.__key;S.flt[k]={};t.__st=S.flt[k];const b=t.__bar;b.querySelectorAll('input[type=search],input[type=date],input[type=number]').forEach(x=>x.value='');b.querySelectorAll('select').forEach(x=>x.value='');b.querySelectorAll('input[type=checkbox]').forEach(x=>x.checked=false);fAplica(t)}
  else if(el.classList.contains('f-csv')){const H=[...t.tHead.rows[t.tHead.rows.length-1].cells].map(h=>h.textContent.trim()),R=fLinhas(t).filter(r=>r.style.display!=='none').map(r=>[...r.cells].map(c=>c.textContent.trim().replace(/[;\n\r]+/g,' ')).join(';'));
    const txt=H.join(';')+'\n'+R.join('\n');try{navigator.clipboard.writeText(txt).then(()=>toast(R.length+' linhas copiadas'),()=>toast('Não consegui copiar'))}catch(x){toast('Não consegui copiar')}}});
/* duplo clique em uma célula de coluna com lista: filtra por aquele valor */
document.addEventListener('dblclick',e=>{const td=e.target.closest&&e.target.closest('td');if(!td)return;const t=td.closest('table');if(!t||!t.__bar)return;const c=t.__cols.find(c=>c.i===td.cellIndex);if(!c||!c.uniq)return;
  const v=fSemData(td.textContent);if(!c.uniq.includes(v))return;t.__st.cols=t.__st.cols||{};t.__st.cols[c.i]=v;const s=t.__bar.querySelector(`select.f-c[data-i="${c.i}"]`);if(s)s.value=v;fAplica(t)});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.classList&&e.target.classList.contains('f-th')){e.preventDefault();e.target.click()}});
