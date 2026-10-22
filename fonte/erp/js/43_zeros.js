/* ============ VAZIO = 0 (Fase 19): quando não há dado, o elemento aparece com valor 0 ============ */
function zerosPass(){const R=document.getElementById('view');if(!R)return;
  R.querySelectorAll('.empty,.soon').forEach(e=>{if(e.querySelector('.zero'))return;const h=[...e.querySelectorAll('h2,h3,div')].map(x=>x.textContent.trim()).filter(Boolean),t=e.textContent.trim().replace(/\s+/g,' ');
    e.innerHTML=`<div class="zero"><b>0</b> registros</div><div class="sub">${esc(t)}</div>`});
  R.querySelectorAll('.sub,p.sub').forEach(e=>{if(e.children.length||e.dataset.z)return;const t=e.textContent.trim();if(/^(Sem |Nenhum|Nenhuma|Nada )/i.test(t)&&!/^0 /.test(t)){e.dataset.z='1';e.textContent='0 · '+t}});
  R.querySelectorAll('td,.v,.k-v,.pk .v').forEach(e=>{if(e.children.length)return;const t=e.textContent.trim();if(t==='—'||t==='-')e.textContent='0'})}
