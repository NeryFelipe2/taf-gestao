/* ============ ACESSIBILIDADE (Fase 18) ============ */
/* Passada após cada render: linhas clicáveis viram botões de teclado, tabelas ganham scope, ícones e campos ganham rótulo. */
function a11yPass(){const R=$('#view');if(!R)return;
  R.querySelectorAll('.clk:not([tabindex])').forEach(e=>{e.tabIndex=0;if(!e.getAttribute('role'))e.setAttribute('role','button')});
  R.querySelectorAll('th:not([scope])').forEach(e=>e.setAttribute('scope','col'));
  /* campos sem rótulo visível: usa placeholder, título, nome do dado ou id (sem forçar layout: nada de .labels) */
  R.querySelectorAll('input:not([aria-label]):not([type=hidden]),select:not([aria-label]),textarea:not([aria-label])').forEach(e=>{if(e.closest('label'))return;if(e.id&&R.querySelector('label[for="'+e.id+'"]'))return;const l=e.getAttribute('placeholder')||e.title||(e.dataset&&(e.dataset.f||e.dataset.k||e.dataset.cf))||e.name||e.id||(e.type==='checkbox'?'selecionar':'');if(l)e.setAttribute('aria-label',l)});
  R.querySelectorAll('button[title]:not([aria-label])').forEach(b=>{if(!b.firstChild||(b.firstChild.nodeType===1&&!b.textContent.trim()))b.setAttribute('aria-label',b.title)});
  R.querySelectorAll('svg[role=img]:not([aria-label])').forEach(s=>s.setAttribute('aria-label','Gráfico'))}
document.addEventListener('keydown',e=>{
  const t=e.target;if((e.key==='Enter'||e.key===' ')&&t&&t.classList&&t.classList.contains('clk')&&t.tagName!=='BUTTON'&&t.tagName!=='A'){e.preventDefault();t.click();return}
  if(e.key==='Tab'&&$('#modal').classList.contains('open')){const F=[...$('#mbox').querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')].filter(x=>x.offsetParent!==null);
    if(!F.length)return;const a=F[0],z=F[F.length-1];if(e.shiftKey&&(document.activeElement===a||!$('#mbox').contains(document.activeElement))){e.preventDefault();z.focus()}else if(!e.shiftKey&&(document.activeElement===z||!$('#mbox').contains(document.activeElement))){e.preventDefault();a.focus()}}});
