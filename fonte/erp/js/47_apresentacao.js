/* ============ MODO APRESENTAÇÃO (Fase 22): esconde obra, fornecedores/parceiros e valores só na tela ============ */
const apresGet=()=>{if(S.apres)return S.apres;let a=null;try{a=JSON.parse(localStorage.getItem('taf_apres')||'null')}catch(e){}return S.apres=a||{obra:false,forn:false,val:false}};
const apresOn=()=>{const a=apresGet();return !!(a.obra||a.forn||a.val)};
const apresSalva=()=>{try{localStorage.setItem('taf_apres',JSON.stringify(S.apres))}catch(e){}};
function pintaObra(){if(!S.D)return;const o=S.D.obra;$('#obra-av').textContent=o.codigo;$('#obra-nome').textContent=o.contratante+' · '+o.nome;$('#obra-sub').textContent='Centro de custo '+o.codigo}
function paintApres(){const a=apresGet();document.querySelectorAll('#ap-menu [data-k]').forEach(b=>b.setAttribute('aria-checked',String(!!a[b.dataset.k])));
  const n=['obra','forn','val'].filter(k=>a[k]).length,m=$('#ap-menu'),bt=$('#ap-btn');if(m)m.hidden=!S.apMenu;if(bt)bt.setAttribute('aria-expanded',String(!!S.apMenu));
  const e=$('#ap-estado');if(e)e.textContent=n?n+' ativo'+(n>1?'s':''):'';const f=$('#ap-faixa');if(f)f.hidden=!n}
ACOES['apres-menu']=()=>{S.apMenu=!S.apMenu;paintApres()};
ACOES['apres-tog']=el=>{const a=apresGet();a[el.dataset.k]=!a[el.dataset.k];apresSalva();paintApres();pintaObra();render()};
document.addEventListener('click',e=>{if(S.apMenu&&!e.target.closest('#apres')){S.apMenu=false;paintApres()}});
/* nomes a trocar (montados a cada passagem; os dados gravados nunca mudam) */
function apresNomes(){const obra=[],forn=new Set(),add=(arr,n,r)=>{n=String(n||'').trim();if(n.length>=4)arr.push([n,r])};
  OBRAS_PADRAO.forEach(([c,n])=>{add(obra,n,'Obra '+c);const k=S.cart&&S.cart[c]&&S.cart[c].obra;if(k){add(obra,k.contratante+' · '+k.nome,'Obra '+c);add(obra,k.nome,'Obra '+c);add(obra,k.contratante,'Cliente');add(obra,k.municipio,'Município')}});
  if(S.D){const o=S.D.obra;add(obra,o.contratante+' · '+o.nome,'Obra '+o.codigo);add(obra,o.nome,'Obra '+o.codigo);add(obra,o.contratante,'Cliente');add(obra,o.municipio,'Município');add(obra,o.contrato&&o.contrato.length>5?o.contrato:'', 'Contrato')}
  OBRAS_PADRAO.forEach(([c])=>{const f=typeof cadFichaDe==='function'?cadFichaDe(c,lerT(c)):null;if(f)add(obra,f.parceiro,'Cliente')});
  const coleta=t=>{if(!t)return;(t.forns||[]).forEach(f=>forn.add(f.nome));(t.notas||[]).forEach(n=>forn.add(n.emitente));(t.ocs||[]).forEach(o=>forn.add(o.forn));(t.lfxs||[]).forEach(l=>{forn.add(l.forn);forn.add(l.parceiro)})};
  OBRAS_PADRAO.forEach(([c])=>{try{coleta(tEf(c))}catch(e){}});if(S.t)coleta(S.t);
  const F=[...forn].filter(x=>x&&String(x).trim().length>=4).map(x=>String(x).trim()).sort().map((x,i)=>[x,'Fornecedor '+String(i+1).padStart(2,'0')]);
  const len=(a,b)=>b[0].length-a[0].length;return {obra:obra.sort(len),forn:F.sort(len)}}
const reEsc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function apresMascaraCom(txt,N){const a=apresGet();let t=String(txt==null?'':txt);
  if(a.forn)N.forn.forEach(([n,r])=>{if(t.includes(n))t=t.split(n).join(r)});
  if(a.obra)N.obra.forEach(([n,r])=>{if(t.includes(n))t=t.split(n).join(r)});
  if(a.val)t=t.replace(/-?R\$\s?-?\d[\d.]*(?:,\d+)?(?:\s?(?:mil|mi)\b)?/g,'R$ •••');
  return t}
const apresMascara=t=>apresOn()?apresMascaraCom(t,apresNomes()):t;
function apresPass(){if(!apresOn()||typeof S.t==='undefined'||!S.t)return;const N=apresNomes(),roots=[$('#view'),$('#mbox'),document.querySelector('.side')].filter(Boolean);
  roots.forEach(r=>{const w=document.createTreeWalker(r,NodeFilter.SHOW_TEXT,{acceptNode:n=>/^(SCRIPT|STYLE|TEXTAREA)$/.test(n.parentNode.nodeName)||!n.nodeValue.trim()?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});const L=[];while(w.nextNode())L.push(w.currentNode);
    L.forEach(n=>{const v=apresMascaraCom(n.nodeValue,N);if(v!==n.nodeValue)n.nodeValue=v});
    r.querySelectorAll('[title],[aria-label],[placeholder]').forEach(e=>['title','aria-label','placeholder'].forEach(at=>{const v=e.getAttribute(at);if(v){const m=apresMascaraCom(v,N);if(m!==v)e.setAttribute(at,m)}}))})}
paintApres();
