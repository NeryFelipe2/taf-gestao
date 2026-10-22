/* ============ VÁRIAS OBRAS e histórico da 281 (Fase 12, item 7b) ============ */
/* Obras ativas: 342, 343 e 281 (dados em web/data/obraNNN.json). */
const OBRAS_PADRAO=[['342','SANEAGO · UTR ETA Santo Antônio do Descoberto'],['343','CAESB · Subadutora de Água Tratada Sobradinho I'],['281','SANEAGO · Ampliação do SAA de Mozarlândia/GO, Lote I (consórcio)']];
async function obraData(cod){if(window.TAF_OBRAS&&window.TAF_OBRAS[cod])return window.TAF_OBRAS[cod];if(cod==='342'&&window.TAF_DATA)return window.TAF_DATA;
  const r=await fetch('data/obra'+cod+'.json');if(!r.ok)throw new Error('Dados da obra '+cod+' indisponíveis');return r.json()}
const obraGuardada=()=>{try{return localStorage.getItem('taf_obra_sel')}catch(e){return null}};
const guardaObra=c=>{try{localStorage.setItem('taf_obra_sel',c)}catch(e){}};
const chaveObra=()=>S.D&&S.D.obra&&S.D.obra.codigo&&S.D.obra.codigo!=='342'?KEY+'_'+S.D.obra.codigo:KEY;
function modalObras(){
  const atual=S.D?S.D.obra.codigo:'',podeImp=MODO_SB&&isRole('gestao','diretoria');
  const emBanco=MODO_SB?SB.obras.map(o=>({cod:o.codigo,nome:(o.contratante||'')+' · '+o.nome,id:o.id})):OBRAS_PADRAO.map(([c,n])=>({cod:c,nome:n}));
  const faltam=MODO_SB?OBRAS_PADRAO.filter(([c])=>!emBanco.some(o=>o.cod===c)):[];
  modal(`<h3>Obras</h3><div class="sub">Cada obra é um centro de custo. Fornecedores, insumos e bancos valem para todas.</div>
   <div class="tw"><table class="tbl"><tbody>${emBanco.map(o=>`<tr><td><span class="mono">${esc(o.cod)}</span></td><td>${esc(o.nome)}</td><td class="r">${o.cod===atual?'<span class="pill ok">Aberta</span>':`<button class="btn sm dark" data-act="obra-abrir" data-cod="${esc(o.cod)}">Abrir</button>`}</td></tr>`).join('')}
   ${faltam.map(([c,n])=>`<tr><td><span class="mono">${c}</span></td><td>${esc(n)}<div class="mut" style="font-size:11.5px">ainda não está no banco</div></td><td class="r"><button class="btn sm" data-act="obra-imp" data-cod="${c}" ${podeImp?'':'disabled title="Só Gestão ou Diretoria"'}>Importar</button></td></tr>`).join('')}</tbody></table></div>
   <div class="acts"><button class="btn" data-act="fechar">Fechar</button></div>`)}
async function abrirObra(cod){closeModal();guardaObra(cod);
  if(MODO_SB){const o=SB.obras.find(x=>x.codigo===cod);if(!o)return toast('Obra não encontrada');S.tab={};S.view='dash';await sbCarregar(o);return}
  await abreDemo(cod)}
async function importarObraBanco(cod){if(!MODO_SB)return;toast('Importando obra '+cod+'…');
  try{const d=await obraData(cod);const r=await SB.c.rpc('importar_obra',{p:d});if(r.error)return toast('Erro: '+r.error.message);
    const ob=await SB.c.from('obra').select('*').order('codigo');SB.obras=ob.data;toast('Obra '+cod+' importada');await abrirObra(cod)}catch(e){toast('Erro: '+e.message)}}
/* Histórico do consórcio da 281: despesas viram notas já rateadas no item S.1 (fila "sem item"); aportes viram lançamentos de caixa. */
const historicoPendente=()=>S.D&&S.D.obra.codigo==='281'&&!S.t.notas.some(n=>n.historico);
async function importaHistorico281(){
  if(!can('recFat')&&!isRole('gestao','diretoria'))return toast('Só Financeiro, Adm, Gestão ou Diretoria');
  const d=await obraData('281'),H=d.historico||[];if(!H.length)return toast('Sem histórico para importar');
  let nN=0,nA=0;
  H.forEach(h=>{if(h.tipo==='APORTE'){S.t.lans.push({id:'h281a-'+h.n,data:h.vencimento||h.emissao,valor:h.valor,desc:'Aporte: '+(h.fornecedor||h.descricao),quem:'Importação do histórico',historico:true});nA++;return}
    const pago=/REALIZADO/.test(h.situacao||'');
    S.t.notas.push({id:'h281-'+h.n,num:'H281-'+String(h.n).padStart(4,'0'),emitente:h.fornecedor||'(sem fornecedor)',chave:'',nfNum:h.documento,valor:h.valor,emissao:h.emissao||h.vencimento,oc:'',ocNum:'',
      rateio:[{item:'S.1',valor:h.valor,nat:h.nat,conta:h.conta}],status:pago?'paga':'conferida',pago:pago?(h.vencimento||h.emissao):undefined,historico:true,descricao:h.descricao,justSemOC:'Histórico importado do consórcio (aba 08D)',central:h.central});nN++});
  log('obra','281','historico','',nN+' despesas e '+nA+' aportes importados');save();toast(nN+' despesas e '+nA+' aportes importados');render()}
