/* ============ inicialização ============ */
(async()=>{
  {const mk=String(CFG.marca||'Grupo Nery');$('#marca').textContent=mk;$('#marca-logo').textContent=mk.trim().charAt(0).toUpperCase()||'G'}
  $('#today').textContent=new Date().toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});
  $('#role').innerHTML=Object.entries(ROLES).filter(([k])=>!['admin','pendente'].includes(k)).map(([k,v])=>`<option value="${k}">${v.n} · ${v.u}</option>`).join('');
  if(MODO_SB){try{await sbBoot()}catch(e){telaAviso('Erro de conexão',esc(e.message||e))}return}
  await abreDemo(OBRAS_PADRAO.some(o=>o[0]===obraGuardada())?obraGuardada():'342');
})();
