/* Dentro do Centro de Gestão (?embed=1): o Centro manda a tela (vista) e a tarefa/demanda; a tela já aberta muda sem recarregar. */
if(window.TAF_EMB&&window.TAF_EMB.ativo)window.TAF_EMB.on(m=>{
  const c=m.ir||m;
  if(!S.D)return;
  if(c.vista&&vistaPermitida(c.vista)){S.view=c.vista;render()}
  if(c.tarefa&&typeof rastroCarrega==='function'){S.view='rastro';RS.dem=+c.demanda||null;render();rastroCarrega(c.tarefa)}
});
