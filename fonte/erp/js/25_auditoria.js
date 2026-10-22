/* ============ AUDITORIA ============ */
function viewAudBase(){
  const A=S.t.aud;
  return `<div class="head"><div><h1>Auditoria</h1><p class="lead">Quem mudou o quê, quando e por quê. Nada se apaga: cancelar muda o status e grava o motivo.</p></div></div>
  <div class="tw">${A.length?`<table class="tbl"><thead><tr><th>Quando</th><th>Quem</th><th>Registro</th><th>Campo</th><th>Antes</th><th>Depois</th><th>Motivo</th></tr></thead><tbody>${A.slice(0,200).map(a=>`<tr><td class="mono">${a.q.slice(0,19).replace('T',' ')}</td><td>${esc(a.quem)}</td><td class="mono">${esc(a.ref)}</td><td>${esc(a.campo)}</td><td>${esc(a.antes)}</td><td>${esc(a.depois)}</td><td>${esc(a.motivo)}</td></tr>`).join('')}</tbody></table>`:empty('Sem eventos ainda.','Cada ação do fluxo aparece aqui.')}</div>`;
}

