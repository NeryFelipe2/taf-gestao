/* ============ TEMA CLARO / ESCURO (Fase 19) ============ */
const temaAtual=()=>document.documentElement.getAttribute('data-theme')||(window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
function pintaTema(){const t=temaAtual();[['t-claro','light'],['t-escuro','dark']].forEach(([id,k])=>{const b=document.getElementById(id);if(b)b.setAttribute('aria-pressed',String(t===k))})}
function aplicaTema(t){document.documentElement.setAttribute('data-theme',t);try{localStorage.setItem('taf_tema',t)}catch(e){}pintaTema()}
ACOES['tema']=el=>aplicaTema(el.dataset.t);
pintaTema();
