/* ============ PLANO DE CONTAS ============ */
/* meta, comprometido e realizado por conta. Comprometido e realizado vêm de contaObra() (05_motor_de_regras.js): a conta é uma só. */
function planoSaldos(){
  const C=contaObra(S.t),real={},comp={},meta={};
  C.real.forEach(({l,v})=>{const c=l.conta||contaPadrao(l.nat,S.byCod[l.item]?.pacote);real[c]=(real[c]||0)+v});
  C.lin.forEach(({conta,comp:v})=>{comp[conta]=(comp[conta]||0)+v});
  S.D.items.forEach(i=>i.linhas.forEach(l=>{const c=contaPadrao(l.nat,i.pacote);meta[c]=(meta[c]||0)+i.meta_total*l.share}));
  return {real,comp,meta}}
function viewPlano(X){
  const {real,comp,meta}=planoSaldos();
  const soma=(m,c)=>Object.entries(m).filter(([k])=>k===c||k.startsWith(c+'.')).reduce((s,[,v])=>s+v,0);
  const P=S.D.plano||[];
  return `<div class="head"><div><h1>Plano de contas</h1><p class="lead">Cada natureza da composição tem uma conta. Quem lança só escolhe o item: a conta vem do cadastro, em toda solicitação, OC e nota. A meta abaixo é a meta de cada item distribuída pela composição.</p></div></div>
  <div class="tw"><table class="tbl"><thead><tr><th>Código</th><th>Conta</th><th>Natureza</th><th class="r">Meta</th><th class="r">Comprometido</th><th class="r">Realizado</th><th>Consumo</th></tr></thead><tbody>${P.map(c=>{const m=soma(meta,c.codigo),co=soma(comp,c.codigo),r=soma(real,c.codigo);return `<tr class="${c.nivel<=2?'grp':''}"><td class="mono">${esc(c.codigo)}</td><td style="padding-left:${(c.nivel-1)*14+10}px">${esc(c.nome)}</td><td>${c.natureza?`<span class="pill mute">${esc(c.natureza)}</span>`:''}</td><td class="r">${m?brl(m):'—'}</td><td class="r">${co?brl(co):'—'}</td><td class="r">${r?brl(r):'—'}</td><td>${m?bar(co,r,m):''}</td></tr>`}).join('')}</tbody></table></div>`}

