/* ============ OBRA NOVA PELA TELA (53) ============
   A Gestão ou a Diretoria cria a obra no ERP e grava o orçamento dela a partir da planilha do órgão (.xlsx ou .csv), sem programa de fora.
   Passos: 1) código, nome e contratante; 2) planilha: aba, linha do cabeçalho e colunas; 3) prévia com avisos; 4) gravar.
   O banco confere tudo de novo (fonte/erp/sql/04_obra_nova.sql: taf_erp_obra_criar e taf_erp_base_gravar) e guarda a versão anterior.
   A obra nasce SEM meta de custo: o ERP abre e mostra o Orçamento, e a compra fica bloqueada até a meta ser definida (de propósito, 05_motor_de_regras.js).
   Formato da base = o que o ERP já lê (03b_chave.js, chBaseDe e chUsaBase): {D, origem}; D igual ao da obra fictícia 999 (teste/obra999.js).
   Segurança: o banco não abre o gzip, então a base gravada pela tela volta marcada "tela:" no base_sha (marca posta pelo banco) e o ERP
   abre essa base só pela lista fechada de campos (obnLimpaBase, abaixo). Texto que vai para a base e para o banco sai sem < > e aspas. */
CAN.obra_nova=['gestao','diretoria'];
const OBN_LIM_GZ=3000000,OBN_LIM_ITENS=5000;   /* os mesmos limites do banco */
const OBN_COD=/^[0-9A-Za-z][0-9A-Za-z._\/-]{0,39}$/,OBN_PAC=/^[0-9A-Za-z][0-9A-Za-z._\/-]{0,29}$/,OBN_EV=/^[0-9A-Za-z][0-9A-Za-z._\/-]{0,19}$/;
/* campos que a tela liga às colunas: [chave, rótulo, obrigatório] (preço: o unitário, o total ou os dois) */
const OBN_CAMPOS=[['codigo','Código do item',1],['descricao','Descrição',1],['unidade','Unidade',0],['qtd','Quantidade',1],['pu','Preço unitário',0],['total','Preço total',0],['evento','Evento',0],['pacote','Pacote',0]];
let ON=null;
/* sem obra aberta (a primeira obra do banco) S.t ainda não existe e can() não roda: vale só o papel */
const obnPode=()=>MODO_CH&&!CH.leitura&&(S.t&&S.t.par?can('obra_nova'):CAN.obra_nova.includes(S.role));
const obnNovo=cod=>({passo:1,cod:cod||'',nome:'',contratante:'',criada:false,arq:'',abas:[],aba:0,hdr:0,map:{},valor:'',valorDaSoma:false,papel:'',avisoAba:false,L:null,msg:'',grav:false,lendo:false});
/* papel que vai para o banco: o da chave pessoal; com a chave do site, o escolhido de propósito na prévia (nunca o padrão da entrada) */
const obnPapel=()=>CH.fixo?S.role:(ON&&ON.papel)||'';

/* ---------- ler a planilha (funções puras, testadas em teste/obra_nova.test.js) ---------- */
/* texto do cabeçalho sem acento, maiúsculo, só letras e números: "P.UNIT. (R$)" vira "P UNIT R" */
const obnNorm=s=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
const obnBdi=(h,s)=>s+(/\bC BDI\b|\bCOM BDI\b/.test(h)?1:0)-(/\bS BDI\b|\bSEM BDI\b/.test(h)?2:0);
/* nota de cada campo para um cabeçalho (0 = não é este campo) */
const OBN_REGRA={
  codigo:h=>/^(ITEM|ITENS|N|NO|NUM|NUMERO|ITEM N|N ITEM|NO ITEM|NUMERO DO ITEM)$/.test(h)?5:/^COD(IGO)?( DO ITEM)?$/.test(h)?4:/\bITEM\b/.test(h)&&!/DESCRI|UNIT|TOTAL|QUANT/.test(h)?3:/\bCOD(IGO)?\b/.test(h)&&!/SINAPI|SICRO|ORSE|FONTE|BANCO|REF|EVENTO/.test(h)?2:0,
  descricao:h=>/^(DESCRICAO|DISCRIMINACAO|ESPECIFICACAO|DESCRICAO DOS SERVICOS|DESCRICAO DO SERVICO|SERVICO|SERVICOS)$/.test(h)?5:/DESCRI|DISCRIMIN|ESPECIFIC/.test(h)?4:/\bSERVICOS?\b/.test(h)?2:0,
  unidade:h=>/^(UN|UND|UNID|UNIDADE|UNIDADES|UM|UNID MEDIDA|UNIDADE DE MEDIDA)$/.test(h)?5:/\bUNIDADE\b/.test(h)?3:0,
  qtd:h=>/^(QUANT|QUANTIDADE|QTD|QTDE|QUANTID|QUANT TOTAL|QTD TOTAL|QUANTIDADE TOTAL)$/.test(h)?5:/\b(QUANT|QUANTIDADE|QTD|QTDE)\b/.test(h)&&!/UNIT|TOTAL R|PRECO|VALOR/.test(h)?3:0,
  pu:h=>/\bUNIT|\bUNITARIO\b|^PU$|^P U\b|\bPRECO UN\b|\bVALOR UN\b|\bVLR UN\b/.test(h)?obnBdi(h,/^(P UNIT|P UNITARIO|PRECO UNITARIO|PRECO UNIT|VALOR UNITARIO|VALOR UNIT|VLR UNIT|PU|CUSTO UNITARIO)$/.test(h)?5:3):0,
  total:h=>/\bTOTAL\b/.test(h)&&!/\bUNIT|\bQUANT|\bQTD|\bITEM\b|DESCRI/.test(h)?obnBdi(h,/^(TOTAL|P TOTAL|PRECO TOTAL|VALOR TOTAL|VLR TOTAL|TOTAL R|PRECO TOTAL R|VALOR TOTAL R|SUBTOTAL)$/.test(h)?5:3):0,
  evento:h=>/^(EVENTO|EVENTOS|COD EVENTO|CODIGO DO EVENTO|N EVENTO|EVENTO N)$/.test(h)?5:/\bEVENTO/.test(h)?3:0,
  pacote:h=>/^(PACOTE|PACOTES|PACOTE DE COMPRA|COD PACOTE)$/.test(h)?5:/\bPACOTE/.test(h)?3:0};
/* sugestão de colunas para uma linha de cabeçalho: {campo: índice da coluna}; a melhor nota ganha, empate fica com a coluna mais à esquerda */
function obnSugere(cab){
  const C=[];(cab||[]).forEach((c,k)=>{const h=obnNorm(c);if(!h)return;OBN_CAMPOS.forEach(([f],fi)=>{const n=OBN_REGRA[f](h);if(n>0)C.push([n,fi,k,f])})});
  C.sort((a,b)=>b[0]-a[0]||a[2]-b[2]||a[1]-b[1]);const m={},usada=new Set();
  C.forEach(([,,k,f])=>{if(m[f]==null&&!usada.has(k)){m[f]=k;usada.add(k)}});return m}
/* linha do cabeçalho: a das primeiras 40 que liga mais campos (pelo menos 3); senão a primeira */
function obnAchaCab(txt){let best=0,bn=2;for(let r=0;r<Math.min((txt||[]).length,40);r++){const n=Object.keys(obnSugere(txt[r])).length;if(n>bn){bn=n;best=r}}return best}
/* número da planilha: número de verdade, ou texto "1.234,56", "1234.56", "R$ 10,00", "(5,00)". dec = separador decimal provável do arquivo.
   Vazio ou "-" = null (vazio não é zero); texto que não é número = undefined. */
function obnNum(v,dec){
  if(v==null)return null;if(typeof v==='number')return Number.isFinite(v)?v:undefined;
  let s=String(v).replace(/R\$/gi,'').replace(/[\s ]/g,'');if(s===''||/^[-–—]$/.test(s))return null;
  let neg=false;if(/^\(.*\)$/.test(s)){neg=true;s=s.slice(1,-1)}
  const v1=s.lastIndexOf(','),p1=s.lastIndexOf('.');
  if(v1>=0&&p1>=0)s=v1>p1?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
  else if(v1>=0)s=dec==='.'&&/^-?\d{1,3}(,\d{3})+$/.test(s)?s.replace(/,/g,''):(s.split(',').length===2?s.replace(',','.'):s);
  else if(p1>=0&&dec!=='.'&&/^-?\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,'');
  if(!/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(s))return undefined;
  const n=+s;return neg?-n:n}
/* texto de CSV: separador ; , ou tab (o que mais aparece fora de aspas na primeira linha com conteúdo), aspas duplas */
function obnCsv(t){
  t=String(t||'').replace(/^﻿/,'');const l1=(t.split(/\r?\n/).find(l=>l.trim())||'').replace(/"[^"]*"/g,'');
  const cont=c=>l1.split(c).length-1,sep=[';','\t',','].reduce((a,c)=>cont(c)>cont(a)?c:a,';');
  const rows=[];let row=[],cel='',q=false;
  for(let i=0;i<t.length;i++){const c=t[i];
    if(q){if(c==='"'){if(t[i+1]==='"'){cel+='"';i++}else q=false}else cel+=c;continue}
    if(c==='"'&&cel===''){q=true;continue}
    if(c===sep){row.push(cel);cel='';continue}
    if(c==='\r'||c==='\n'){if(c==='\r'&&t[i+1]==='\n')i++;row.push(cel);rows.push(row);row=[];cel='';continue}
    cel+=c}
  if(cel!==''||row.length){row.push(cel);rows.push(row)}
  return {rows,sep,dec:sep===','?'.':','}}
/* CSV do Excel brasileiro vem em Windows-1252; UTF-8 quando dá */
function obnDecod(buf){try{return new TextDecoder('utf-8',{fatal:true}).decode(buf)}catch(e){return new TextDecoder('windows-1252').decode(buf)}}
const obnLetra=k=>{let s='';k++;while(k>0){const m=(k-1)%26;s=String.fromCharCode(65+m)+s;k=Math.floor((k-1)/26)}return s};
const obnTxt=v=>String(v??'').replace(/[\u0000-\u001f\u007f ]/g,' ').replace(/\s+/g,' ').trim();
/* texto que vai para a base e para o banco: < > e aspas viram ‹ › ″ (leem-se igual; o banco recusa os de verdade) */
const obnSeguro=v=>obnTxt(v).replace(/</g,'‹').replace(/>/g,'›').replace(/"/g,'″');
const obnCodDe=v=>String(v??'').replace(/[\s ]/g,'').replace(/\.+$/,'');
/* código de pacote a partir do texto da planilha: "Tubos PVC" vira TUBOS_PVC (o nome fica como veio) */
const obnPacDe=v=>obnNorm(v).replace(/ /g,'_').slice(0,30);
const obnUnDe=v=>obnTxt(v).replace(/[<>&"']/g,'').slice(0,20);
/* lê as linhas abaixo do cabeçalho. aba = {raw, txt, dec, r0} (r0 = número da primeira linha da aba no Excel, a partir de 1).
   Devolve {linhas (itens e grupos na ordem dos códigos, com nivel e pai), erros (impedem gravar), avisos, totais}. */
function obnLinhas(aba,hdr,map){
  const raw=aba.raw||[],txt=aba.txt||raw,dec=aba.dec||',',r0=aba.r0||1,col=f=>map[f]==null||map[f]===''?null:+map[f];
  const cel=(r,f,bruto)=>{const k=col(f);if(k==null)return null;const x=(bruto?raw:txt)[r];return x?x[k]:null};
  const L=[],erros=[],ign=[],naoNum=[],codNum=[],semPreco=[],difTot=[],neg=[],evFora=[],qtdZero=[],sinais=[],pacs=new Map(),vistos=new Map();
  for(let r=hdr+1;r<raw.length;r++){const lin=r+r0;
    const cod=obnCodDe(cel(r,'codigo')),desc0=obnTxt(cel(r,'descricao')),desc=obnSeguro(desc0).slice(0,2000);
    if(!cod&&!desc)continue;
    if(!cod){ign.push({lin,desc});continue}
    const rc=cel(r,'codigo',true);if(typeof rc==='number'&&!Number.isInteger(rc))codNum.push(cod);
    const n=f=>{if(col(f)==null)return null;const b=cel(r,f,true),v=obnNum(b===''?null:b,dec);if(v===undefined){naoNum.push({lin,cod,campo:f,v:obnTxt(b)});return null}return v};
    const qtd=n('qtd'),pu=n('pu'),tot=n('total');
    if(!OBN_COD.test(cod)){erros.push(`Linha ${lin}: código "${cod.slice(0,40)}" com caractere não aceito (use números, letras, ponto, traço ou barra).`);continue}
    if(vistos.has(cod)){erros.push(`Código ${cod} repetido (linhas ${vistos.get(cod)} e ${lin}).`);continue}
    vistos.set(cod,lin);
    if(desc!==desc0.slice(0,2000))sinais.push(cod);
    /* vazio não é zero: só vira grupo a linha SEM quantidade e SEM preço unitário; quantidade 0 continua item (com aviso) */
    const grupo=qtd==null&&pu==null;
    const x={lin,codigo:cod,descricao:desc,tipo:grupo?'grupo':'item',tot};
    if(!grupo){
      x.unidade=obnUnDe(cel(r,'unidade'))||null;x.qtd=qtd;x.pu=pu;
      x.venda=tot!=null?r2(tot):(qtd!=null&&pu!=null?r2(qtd*pu):null);
      if(pu==null&&tot==null)semPreco.push(cod);
      if(qtd===0)qtdZero.push(cod);
      if(tot!=null&&pu!=null&&qtd!=null&&Math.abs(tot-r2(qtd*pu))>0.011)difTot.push({cod,qtd,pu,tot,conta:r2(qtd*pu)});
      if((qtd!=null&&qtd<0)||(pu!=null&&pu<0)||(tot!=null&&tot<0))neg.push(cod);
      const ev=obnCodDe(cel(r,'evento'));
      if(ev){if(!OBN_EV.test(ev)){erros.push(`Item ${cod}: evento "${ev.slice(0,20)}" com caractere não aceito.`);continue}x.evento=ev;if(!/^\d\.\d\.\d$/.test(ev))evFora.push(cod)}else x.evento=null;
      const pt=obnTxt(cel(r,'pacote')),pc=pt?obnPacDe(pt):'';
      if(pt&&!OBN_PAC.test(pc)){erros.push(`Item ${cod}: pacote "${pt.slice(0,30)}" sem letra ou número.`);continue}
      x.pacote=pc||null;if(pc&&!pacs.has(pc))pacs.set(pc,obnSeguro(pt).slice(0,80))}
    L.push(x)}
  L.sort((a,b)=>cmpCod(a.codigo,b.codigo));
  const cods=new Set(L.map(x=>x.codigo)),subItem=[];
  L.forEach(x=>{const p=x.codigo.split('.');x.nivel=p.length;x.pai=null;for(let k=p.length-1;k>0;k--){const c=p.slice(0,k).join('.');if(cods.has(c)){x.pai=c;break}}});
  const porCod=Object.fromEntries(L.map(x=>[x.codigo,x]));
  L.forEach(x=>{if(x.pai&&porCod[x.pai].tipo==='item'&&!subItem.includes(x.pai))subItem.push(x.pai)});
  const itens=L.filter(x=>x.tipo==='item'),grupos=L.filter(x=>x.tipo==='grupo');
  const difGrupo=grupos.filter(g=>g.tot!=null).map(g=>({cod:g.codigo,tot:r2(g.tot),soma:r2(itens.filter(i=>i.codigo.startsWith(g.codigo+'.')).reduce((s,i)=>s+(i.venda||0),0))})).filter(d=>Math.abs(d.tot-d.soma)>0.011);
  if(!itens.length)erros.push('Nenhum item com quantidade ou preço abaixo do cabeçalho: confira a linha do cabeçalho e as colunas.');
  if(itens.length>OBN_LIM_ITENS)erros.push(`São ${itens.length} itens; o limite é ${OBN_LIM_ITENS}.`);
  const semPonto=grupos.length>0&&L.every(x=>!x.codigo.includes('.'));
  return {linhas:L,erros,total:r2(itens.reduce((s,i)=>s+(i.venda||0),0)),nItens:itens.length,nGrupos:grupos.length,
    pacotes:[...pacs.entries()].map(([codigo,nome])=>({codigo,nome})),
    avisos:{semPreco,difTot,difGrupo,ign,naoNum,codNum,neg,evFora,subItem,semPonto,qtdZero,sinais}}}
/* aba do orçamento: a que liga mais campos no cabeçalho achado; ok = liga código, descrição, quantidade e um dos preços.
   Aba de capa ou resumo na frente não ganha da aba do orçamento; se nenhuma liga o mínimo, a tela avisa para escolher. */
function obnMelhorAba(abas){let best=-1,bn=-1,bok=false;
  (abas||[]).forEach((a,i)=>{const t=(a&&a.txt)||[];if(t.length<2)return;const m=obnSugere(t[obnAchaCab(t)]),n=Object.keys(m).length,
    ok=m.codigo!=null&&m.descricao!=null&&m.qtd!=null&&(m.pu!=null||m.total!=null);
    if((ok&&!bok)||(ok===bok&&n>bn)){best=i;bn=n;bok=ok}});
  return {i:Math.max(best,0),ok:bok}}
/* a base que o ERP abre: {D, origem}. Itens sem meta (meta, teto e meta unitária vazias). */
function obnMontaBase(st,plano){
  const L=st.L,v=obnNum(st.valor,','),valor=v==null||v===undefined?null:r2(v);
  const eap=L.linhas.map(x=>x.tipo==='grupo'
    ?{codigo:x.codigo,descricao:x.descricao,unidade:null,qtd:null,nivel:x.nivel,pai:x.pai,tipo_linha:'grupo',preco_venda_total:null,meta_total:null,teto_total:null,meta_unit:null,evento:null,pacote:null,natureza:{}}
    :{codigo:x.codigo,descricao:x.descricao,unidade:x.unidade,qtd:x.qtd,nivel:x.nivel,pai:x.pai,tipo_linha:'item',preco_venda_total:x.venda,preco_venda_unit:x.pu,
      meta_total:null,teto_total:null,meta_unit:null,fonte_meta:null,status_cotacao:null,evento:x.evento,pacote:x.pacote,tipo:null,composicao:null,natureza:{},hh_unit:null});
  const pacotes=L.pacotes.map(p=>({codigo:p.codigo,nome:p.nome,meta:null,teto:null,fechar_ate:null,precisa_em_obra:null,responsavel:null,condicao_pagamento:null,observacoes:''}));
  const aba=st.abas[st.aba]||{},colunas={};OBN_CAMPOS.forEach(([f])=>{const k=st.map[f];if(k!=null&&k!=='')colunas[f]=obnLetra(+k+(aba.c0||0))});
  return {D:{obra:{codigo:st.cod,nome:st.nome,contratante:st.contratante,contrato:null,municipio:null,valor_contrato:valor!=null?valor:L.total,regime:null,tributos_nota:null},
      pacotes,eap,plano:plano||[],banco_mo:[],
      relatorio:{diferenca_contrato:valor!=null?r2(L.total-valor):0,aviso:'Obra nova: os itens só têm o preço do contrato. Defina a meta de custo de cada item antes de comprar.'}},
    origem:{tela:'ERP · Nova obra',arquivo:st.arq,aba:aba.nome||'',linha_cabecalho:st.hdr+(aba.r0||1),colunas,itens:L.nItens,grupos:L.nGrupos,total:L.total,
      valor_contrato:valor,valor_contrato_fonte:valor==null?'soma da planilha (contrato não informado)':st.valorDaSoma&&Math.abs(valor-L.total)<0.005?'soma da planilha, confirmada na tela':'informado',
      plano_de:st.planoDe||null,quem:typeof user==='function'?user():'',em:new Date().toISOString()}}}
/* índice do banco (taf_erp_item): só os itens, sem meta */
const obnIndice=D=>D.eap.filter(e=>e.tipo_linha==='item').map(e=>({codigo:e.codigo,descricao:e.descricao||null,unidade:e.unidade||null,qtd:e.qtd??null,pacote:e.pacote||null,evento:e.evento||null,venda:e.preco_venda_total??null,meta:null,teto:null,meta_unit:null}));

/* ---------- abrir a base gravada pela tela: lista fechada de campos (chamada em 03b_chave.js, chBaseDe) ----------
   O banco não abre o gzip: quem tem a chave pode mandar qualquer coisa dentro da base (taf_erp_base_gravar). Por isso a base com a
   marca "tela:" no base_sha (posta pelo banco, ninguém de fora tira) é refeita aqui campo a campo, antes de qualquer tela ver:
   - só os campos que esta tela grava (os do D da obra 999); o resto some, inclusive extrato, ficha e listas;
   - código, pacote, evento só com os caracteres que o banco aceita; unidade sem < > & aspas; natureza só MO, MAT, EQP, TER, ADM;
   - todo texto sem < > e aspas (viram ‹ › ″) e sem caractere de controle, com tamanho máximo; número só número de verdade;
   - nível e pai refeitos pelo código (pai que não existe ou em círculo não trava a árvore do Orçamento).
   A mesma limpeza roda antes de gravar: o que vai para o banco é igual ao que o ERP abre. */
const OBN_NAT=['MO','MAT','EQP','TER','ADM'];
function obnLimpaBase(b,cod){
  const ob=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{},arr=v=>Array.isArray(v)?v:[];
  const tx=(v,n)=>typeof v==='string'||typeof v==='number'?obnSeguro(v).slice(0,n)||null:null;
  const nu=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
  const cd=(v,re)=>typeof v==='string'&&re.test(v)?v:null;
  const dt=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v:null;
  const nat=v=>{const n={},o=ob(v);OBN_NAT.forEach(k=>{if(Object.prototype.hasOwnProperty.call(o,k)&&nu(o[k])!=null)n[k]=o[k]});return n};
  const comp=v=>Array.isArray(v)?v.slice(0,20).map(ob).filter(l=>OBN_NAT.includes(l.nat)&&nu(l.share)!=null).map(l=>({nat:l.nat,share:l.share})):null;
  const B=ob(b),D=ob(B.D),O=ob(D.obra),R=ob(D.relatorio),G=ob(B.origem);
  const pv=new Set(),pacotes=[];
  arr(D.pacotes).slice(0,2000).map(ob).forEach(p=>{const c=cd(p.codigo,OBN_PAC);if(!c||pv.has(c))return;pv.add(c);
    pacotes.push({codigo:c,nome:tx(p.nome,80)||c,meta:nu(p.meta),teto:nu(p.teto),fechar_ate:dt(p.fechar_ate),precisa_em_obra:dt(p.precisa_em_obra),
      responsavel:tx(p.responsavel,80),condicao_pagamento:tx(p.condicao_pagamento,80),observacoes:tx(p.observacoes,500)||''})});
  const ev=new Set(),eap=[];
  arr(D.eap).slice(0,20000).map(ob).forEach(x=>{const c=cd(x.codigo,OBN_COD);if(!c||ev.has(c))return;ev.add(c);
    eap.push(x.tipo_linha==='grupo'
      ?{codigo:c,descricao:tx(x.descricao,2000)||'',unidade:null,qtd:null,nivel:1,pai:null,tipo_linha:'grupo',preco_venda_total:null,meta_total:null,teto_total:null,meta_unit:null,evento:null,pacote:null,natureza:{}}
      :{codigo:c,descricao:tx(x.descricao,2000)||'',unidade:typeof x.unidade==='string'?obnUnDe(x.unidade)||null:null,qtd:nu(x.qtd),nivel:1,pai:null,tipo_linha:'item',
        preco_venda_total:nu(x.preco_venda_total),preco_venda_unit:nu(x.preco_venda_unit),meta_total:nu(x.meta_total),teto_total:nu(x.teto_total),meta_unit:nu(x.meta_unit),
        fonte_meta:tx(x.fonte_meta,80),status_cotacao:tx(x.status_cotacao,40),evento:cd(x.evento,OBN_EV),pacote:pv.has(x.pacote)?x.pacote:null,tipo:tx(x.tipo,40),
        composicao:comp(x.composicao),natureza:nat(x.natureza),hh_unit:nu(x.hh_unit)})});
  eap.sort((a,b)=>cmpCod(a.codigo,b.codigo));
  eap.forEach(e=>{const p=e.codigo.split('.');e.nivel=p.length;for(let k=p.length-1;k>0;k--){const c=p.slice(0,k).join('.');if(ev.has(c)){e.pai=c;break}}});
  const plano=arr(D.plano).slice(0,2000).map(ob).filter(x=>cd(x.codigo,OBN_PAC)).map(x=>({codigo:x.codigo,nome:tx(x.nome,120)||x.codigo,
    nivel:Number.isInteger(x.nivel)&&x.nivel>0&&x.nivel<10?x.nivel:x.codigo.split('.').length,natureza:tx(x.natureza,40)}));
  const banco_mo=arr(D.banco_mo).slice(0,500).map(ob).map(f=>({funcao:tx(f.funcao,60),equipe:tx(f.equipe,60),custo_hora:nu(f.custo_hora)})).filter(f=>f.funcao);
  const colunas={},gc=ob(G.colunas);OBN_CAMPOS.forEach(([f])=>{if(typeof gc[f]==='string'&&/^[A-Z]{1,3}$/.test(gc[f]))colunas[f]=gc[f]});
  return {D:{obra:{codigo:String(cod),nome:tx(O.nome,120)||'Obra '+cod,contratante:tx(O.contratante,80),contrato:tx(O.contrato,80),municipio:tx(O.municipio,80),
        valor_contrato:nu(O.valor_contrato),regime:tx(O.regime,80),tributos_nota:nu(O.tributos_nota)},
      pacotes,eap,plano,banco_mo,relatorio:{diferenca_contrato:nu(R.diferenca_contrato)||0,aviso:tx(R.aviso,300)}},
    origem:{tela:tx(G.tela,60),arquivo:tx(G.arquivo,200),aba:tx(G.aba,80),linha_cabecalho:nu(G.linha_cabecalho),colunas,itens:nu(G.itens),grupos:nu(G.grupos),total:nu(G.total),
      valor_contrato:nu(G.valor_contrato),valor_contrato_fonte:tx(G.valor_contrato_fonte,60),plano_de:cd(G.plano_de,/^\d{3}$/),quem:tx(G.quem,60),em:tx(G.em,40)}}}
/* gzip + base64 + sha256 (o banco confere o sha do texto base64) */
async function obnGz(obj){const st=new Blob([new TextEncoder().encode(JSON.stringify(obj))]).stream().pipeThrough(new CompressionStream('gzip'));
  const b=new Uint8Array(await new Response(st).arrayBuffer());let s='';for(let i=0;i<b.length;i+=0x8000)s+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000));return btoa(s)}
async function obnDesGz(b64){const st=new Blob([Uint8Array.from(atob(b64),c=>c.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream('gzip'));return new Response(st).text()}
async function obnSha(t){if(!(window.crypto&&crypto.subtle))throw new Error('Este navegador não calcula o sha256 (abra o site pelo endereço https).');
  const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t));return [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,'0')).join('')}
/* lê o arquivo escolhido: uma "aba" por planilha do Excel (ou uma só do CSV), com os valores brutos (números) e os textos */
async function obnLerArquivo(file){
  if(/\.(csv|txt)$/i.test(file.name)){const c=obnCsv(obnDecod(await file.arrayBuffer()));return [{nome:file.name.replace(/\.[^.]+$/,''),raw:c.rows,txt:c.rows,dec:c.dec,r0:1,c0:0}]}
  const X=await carregaXlsx(),wb=X.read(await file.arrayBuffer(),{type:'array',sheetRows:20001});
  return wb.SheetNames.map(n=>{const ws=wb.Sheets[n];if(!ws||!ws['!ref'])return {nome:n,raw:[],txt:[],dec:',',r0:1,c0:0};
    const R=X.utils.decode_range(ws['!ref']);R.e.c=Math.min(R.e.c,R.s.c+59);R.e.r=Math.min(R.e.r,R.s.r+20000);ws['!ref']=X.utils.encode_range(R);   /* planilha formatada até a última linha do Excel não trava a tela */
    return {nome:n,raw:X.utils.sheet_to_json(ws,{header:1,raw:true,defval:null,blankrows:true}),txt:X.utils.sheet_to_json(ws,{header:1,raw:false,defval:'',blankrows:true}),dec:',',r0:R.s.r+1,c0:R.s.c}})}

/* ---------- tela ---------- */
function obraNovaBtn(){if(!MODO_CH)return '';return `<button class="btn dark" data-act="obra-nova" ${obnPode()?'':'disabled title="Só Gestão ou Diretoria"'}>Nova obra</button>`}
function modalObraNova(cod,semBase){
  if(!obnPode())return toast(CH.leitura?'Chave só de leitura: nada é gravado.':'Só Gestão ou Diretoria cria obra.');
  ON=obnNovo(cod&&/^\d{3}$/.test(cod)?cod:'');
  if(semBase){const o=SB.obras.find(x=>x.codigo===cod);if(o){ON.nome=o.nome||'';ON.contratante=o.contratante||'';ON.criada=true;ON.passo=2}}
  obnPinta()}
const obnPassos=['Dados da obra','Planilha do órgão','Prévia','Gravar'];
function obnTopo(){const st=ON,at=st.grav?4:st.passo;return `<h3>${st.cod&&st.passo>1?'Nova obra '+esc(st.cod):'Nova obra'}</h3>
  <div class="sub" aria-live="polite">${obnPassos.map((t,i)=>`<span class="pill ${i+1===at?'info':i+1<at?'ok':'mute'}">${i+1} ${t}</span>`).join(' ')}</div>`}
const obnMsg=()=>ON.msg?`<div class="sub" role="alert" style="margin-top:10px;color:var(--bad)">${esc(ON.msg)}</div>`:'';
function obnHtml1(){const st=ON;
  return `${obnTopo()}<div class="sub">Comece pelos dados da obra. Depois você sobe a planilha do órgão e confere a prévia. Nada é gravado antes do passo 4.</div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:0 12px">
   <div><label for="on-cod">Código da obra (3 números)</label><input id="on-cod" inputmode="numeric" maxlength="3" autocomplete="off" placeholder="ex.: 344" value="${esc(st.cod)}"></div>
   <div><label for="on-nome">Nome da obra</label><input id="on-nome" maxlength="120" autocomplete="off" value="${esc(st.nome)}"></div>
   <div><label for="on-ct">Contratante</label><input id="on-ct" maxlength="80" autocomplete="off" placeholder="ex.: SANEAGO" value="${esc(st.contratante)}"></div></div>
  ${obnMsg()}<div class="acts"><button class="btn" data-act="fechar">Cancelar</button><button class="btn dark" data-act="on-p1">Próximo</button></div>`}
const obnColOpts=(cab,sel,c0)=>`<option value="">(não tem)</option>`+(cab||[]).map((c,k)=>`<option value="${k}" ${String(sel)===String(k)?'selected':''}>${obnLetra(k+(c0||0))} · ${esc(obnTxt(c).slice(0,40)||'(sem título)')}</option>`).join('');
function obnFaltaCol(){const m=ON.map,f=OBN_CAMPOS.filter(([k,,o])=>o&&(m[k]==null||m[k]==='')).map(([,n])=>n.toLowerCase());
  if((m.pu==null||m.pu==='')&&(m.total==null||m.total===''))f.push('preço unitário ou preço total');return f}
/* o campo do arquivo fica fora do bloco que redesenha (#on-p2box): o navegador continua mostrando o arquivo escolhido */
function obnHtml2(){return `${obnTopo()}<div class="sub">Suba a planilha do órgão (.xlsx ou .csv). Escolha a aba e a linha do cabeçalho e ligue cada coluna. A tela já sugere pelos nomes de sempre (ITEM, CÓDIGO, DESCRIÇÃO, UND, QUANT, P.UNIT, TOTAL, EVENTO). Linha sem quantidade e sem preço unitário vira grupo.</div>
   <label for="on-arq">Planilha do órgão</label><input id="on-arq" type="file" accept=".xlsx,.xlsm,.xls,.csv,.txt"><div id="on-p2box">${obnCorpo2()}</div>`}
function obnCorpo2(){const st=ON,a=st.abas[st.aba],cab=a?a.txt[st.hdr]||[]:[];
  let h=st.lendo?'<div class="sub" aria-live="polite">Lendo a planilha…</div>':st.arq?`<div class="sub" aria-live="polite">Arquivo: <b>${esc(st.arq)}</b> · ${st.abas.length} ${st.abas.length===1?'aba':'abas'}</div>`:'';
  if(a){const falta=obnFaltaCol();
    if(st.avisoAba)h+='<div class="sub" role="alert" style="margin-top:8px"><span class="pill warn">escolha a aba</span> Nenhuma aba tem as colunas de código, descrição, quantidade e preço com os nomes de sempre. Escolha a aba do orçamento e a linha do cabeçalho, e ligue as colunas.</div>';
    h+=`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:0 12px;align-items:end">
     <div><label for="on-aba">Aba</label><select id="on-aba">${st.abas.map((x,i)=>`<option value="${i}" ${i===st.aba?'selected':''}>${esc(x.nome)}</option>`).join('')}</select></div>
     <div><label for="on-hdr">Linha do cabeçalho</label><input id="on-hdr" type="number" inputmode="numeric" min="${a.r0}" max="${a.r0+Math.max(a.raw.length-1,0)}" value="${st.hdr+a.r0}"></div></div>
     <div class="panel-t" style="margin-top:14px">Colunas</div>
     <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:0 12px;align-items:end">${OBN_CAMPOS.map(([f,n,o])=>`<div><label for="on-c-${f}">${n}${o?' · obrigatório':f==='pu'||f==='total'?' · este ou o outro preço':' · se tiver'}</label><select id="on-c-${f}" data-on-col="${f}">${obnColOpts(cab,st.map[f],a.c0)}</select></div>`).join('')}</div>
     ${falta.length?`<div class="sub" style="margin-top:8px"><span class="pill warn">falta ligar</span> ${esc(falta.join(', '))}</div>`:''}
     ${obnAmostra()}`}
  return h+`${obnMsg()}<div class="acts">${st.criada?'<button class="btn" data-act="fechar">Fechar</button>':'<button class="btn" data-act="on-voltar">Voltar</button>'}<button class="btn dark" data-act="on-p2" ${a&&!obnFaltaCol().length?'':'disabled'}>Ver prévia</button></div>`}
/* as primeiras linhas como a tela vai ler, para conferir a ligação das colunas */
function obnAmostra(){const st=ON,a=st.abas[st.aba];if(!a)return '';const L=obnLinhas(a,st.hdr,st.map).linhas.slice(0,6);
  if(!L.length)return '<div class="sub" style="margin-top:10px">Nenhuma linha com código abaixo do cabeçalho. Confira a linha do cabeçalho e a coluna do código.</div>';
  return `<div class="panel-t" style="margin-top:14px">Primeiras linhas, como serão lidas</div><div class="tw"><table class="tbl"><thead><tr><th>Linha</th><th>Código</th><th>Descrição</th><th>Und</th><th class="r">Quant.</th><th class="r">P. unit.</th><th class="r">Total</th><th>Vira</th></tr></thead><tbody>${L.map(x=>`<tr class="${x.tipo==='grupo'?'grp':''}"><td class="mono">${x.lin}</td><td class="mono">${esc(x.codigo)}</td><td>${esc(x.descricao.slice(0,60))}</td><td>${esc(x.unidade||'')}</td><td class="r">${x.qtd==null?'—':num(x.qtd)}</td><td class="r">${x.pu==null?'—':brl(x.pu)}</td><td class="r">${x.tipo==='grupo'?(x.tot==null?'—':brl(x.tot)):x.venda==null?'—':brl(x.venda)}</td><td>${x.tipo==='grupo'?'<span class="pill mute">grupo</span>':'<span class="pill info">item</span>'}</td></tr>`).join('')}</tbody></table></div>`}
const obnLista=(L,n=8)=>esc(L.slice(0,n).join(', '))+(L.length>n?' e mais '+(L.length-n):'');
/* o valor do contrato é obrigatório (número sem fonte não entra como fato): se ainda não tem o contrato, a pessoa usa a soma da planilha de propósito */
const obnValorOk=()=>{const v=ON&&ON.L?obnNum(ON.valor,','):undefined;return v!=null&&v!==undefined&&v>0};
const obnPapelOk=()=>CH.fixo||['gestao','diretoria'].includes(ON&&ON.papel);
const obnPodeGravar=()=>{const st=ON;return !!(st&&st.L&&!st.L.erros.length&&!st.grav&&obnValorOk()&&obnPapelOk())};
function obnFalta3(){const st=ON,f=[];if(!st||!st.L||st.grav)return '';if(st.L.erros.length)f.push('corrigir a planilha');if(!obnValorOk())f.push('digitar o valor do contrato');if(!obnPapelOk())f.push('escolher o seu papel');
  return f.length?'Para gravar falta: '+f.join(', ')+'.':''}
function obnBotao3(){const b=document.querySelector('[data-act="on-gravar"]'),x=document.getElementById('on-falta');if(b)b.disabled=!obnPodeGravar();if(x)x.textContent=obnFalta3()}
function obnConf(){const st=ON,L=st.L,v=obnNum(st.valor,',');
  if(v==null)return `<span class="pill warn">falta</span> Digite o valor do contrato. Se ainda não tem o contrato, use a soma da planilha: fica registrado que o valor veio da planilha. <button class="btn sm" data-act="on-usa-soma">Usar a soma da planilha (${brl(L.total)})</button>`;
  if(v<=0)return '<span class="pill warn">confira</span> Valor do contrato tem que ser maior que zero.';
  if(v===undefined)return '<span class="pill warn">confira</span> Valor do contrato não é número.';
  const d=r2(L.total-v);return Math.abs(d)<0.005?'<span class="pill ok">confere</span> A soma da planilha é igual ao valor do contrato.':`<span class="pill warn">difere</span> A soma da planilha difere do contrato em ${brl(d)} (${d>0?'planilha maior':'planilha menor'}).`}
function obnHtml3(){const st=ON,L=st.L,A=L.avisos,av=[];
  const ad=(cor,t)=>av.push(`<li style="margin:4px 0"><span class="pill ${cor}">${cor==='warn'?'atenção':'info'}</span> ${t}</li>`);
  if(A.semPreco.length)ad('warn',`${A.semPreco.length} ${A.semPreco.length===1?'item sem preço':'itens sem preço'}: ${obnLista(A.semPreco)}.`);
  if(A.difTot.length)ad('warn',`${A.difTot.length} ${A.difTot.length===1?'item com total diferente':'itens com total diferente'} de quantidade × unitário (vale o total da planilha): ${A.difTot.slice(0,5).map(d=>esc(d.cod)+' ('+num(d.qtd)+' × '+brl(d.pu)+' = '+brl(d.conta)+', planilha '+brl(d.tot)+')').join('; ')}${A.difTot.length>5?' e mais '+(A.difTot.length-5):''}.`);
  if(A.difGrupo.length)ad('warn',`Subtotal de grupo diferente da soma dos itens: ${A.difGrupo.slice(0,5).map(d=>esc(d.cod)+' (planilha '+brl(d.tot)+', itens '+brl(d.soma)+')').join('; ')}.`);
  if(A.naoNum.length)ad('warn',`${A.naoNum.length} ${A.naoNum.length===1?'valor que não é número ficou vazio':'valores que não são número ficaram vazios'}: ${A.naoNum.slice(0,5).map(x=>'linha '+x.lin+' ('+esc(x.v.slice(0,20))+')').join(', ')}.`);
  if(A.codNum.length)ad('warn',`${A.codNum.length} ${A.codNum.length===1?'código estava gravado':'códigos estavam gravados'} como número na planilha (ex.: ${esc(A.codNum[0])}). Se a planilha mostra 1.10, ele vira 1.1: confira.`);
  if(A.neg.length)ad('warn',`Quantidade ou preço negativo: ${obnLista(A.neg)}.`);
  if(A.qtdZero.length)ad('warn',`${A.qtdZero.length} ${A.qtdZero.length===1?'item com quantidade zero':'itens com quantidade zero'} (continua item, não vira grupo): ${obnLista(A.qtdZero)}.`);
  if(A.subItem.length)ad('warn',`Item com subitens (o item fica e os subitens aparecem só na busca): ${obnLista(A.subItem)}.`);
  if(A.semPonto)ad('warn','Os códigos não têm ponto (1, 2, 3…): os grupos não vão somar os itens no Orçamento.');
  if(A.evFora.length)ad('info',`${A.evFora.length} ${A.evFora.length===1?'item com evento':'itens com evento'} fora do formato 1.1.1 do cronograma (não ligam ao evento do BM): ${obnLista(A.evFora,5)}.`);
  if(A.ign.length)ad('info',`${A.ign.length} ${A.ign.length===1?'linha sem código ficou':'linhas sem código ficaram'} de fora: ${A.ign.slice(0,4).map(x=>'linha '+x.lin+(x.desc?' ('+esc(x.desc.slice(0,30))+')':'')).join(', ')}${A.ign.length>4?'…':''}.`);
  if(A.sinais.length)ad('info',`${A.sinais.length} ${A.sinais.length===1?'descrição tinha':'descrições tinham'} < > ou aspas: viraram ‹ › ″ (o banco não aceita esses sinais): ${obnLista(A.sinais,5)}.`);
  if(L.pacotes.length)ad('info',`${L.pacotes.length} ${L.pacotes.length===1?'pacote criado':'pacotes criados'} sem meta: ${obnLista(L.pacotes.map(p=>p.codigo))}.`);
  ad('info',st.planoDe?`Plano de contas: copiado da obra ${esc(st.planoDe)} (${(S.D&&S.D.plano||[]).length} contas).`:'Plano de contas: vazio (nenhuma obra aberta para copiar).');
  const lin=L.linhas.slice(0,200);
  return `${obnTopo()}<div class="sub">Confira antes de gravar. Os itens entram <b>sem meta de custo</b>: o Orçamento abre, e a compra fica bloqueada até a meta de cada item ser definida.</div>
   <div class="kpi4"><div><div class="k-l">Itens</div><div class="v">${L.nItens}</div></div><div><div class="k-l">Grupos</div><div class="v">${L.nGrupos}</div></div><div><div class="k-l">Total geral</div><div class="v">${brl(L.total,true)}</div><div class="sub">${brl(L.total)}</div></div><div><div class="k-l">Pacotes</div><div class="v">${L.pacotes.length}</div></div></div>
   <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0 12px;align-items:end">
    <div><label for="on-valor">Valor do contrato · obrigatório</label><input id="on-valor" inputmode="decimal" autocomplete="off" placeholder="ex.: 1.234.567,89" value="${esc(st.valor)}"></div>
    <div id="on-conf" class="sub" style="margin-bottom:10px">${obnConf()}</div>
    ${CH.fixo?'':`<div><label for="on-papel">Seu papel (chave do site) · obrigatório</label><select id="on-papel"><option value="">(escolha)</option>${[['gestao','Gestão'],['diretoria','Diretoria']].map(([k,n])=>`<option value="${k}" ${st.papel===k?'selected':''}>${n}</option>`).join('')}</select><div class="sub">Com a chave do site o banco registra o nome e o papel escolhidos aqui. A chave do site grava o orçamento uma vez só.</div></div>`}</div>
   ${L.erros.length?`<div class="panel-t" style="margin-top:14px">Precisa corrigir na planilha (não grava)</div><ul style="margin:4px 0 4px 18px;padding:0">${L.erros.slice(0,15).map(e=>`<li class="neg" style="margin:4px 0">${esc(e)}</li>`).join('')}${L.erros.length>15?`<li>e mais ${L.erros.length-15}</li>`:''}</ul>`:''}
   <div class="panel-t" style="margin-top:14px">Avisos</div><ul style="list-style:none;margin:4px 0;padding:0">${av.join('')}</ul>
   <div class="tw" style="max-height:320px;overflow:auto"><table class="tbl"><thead><tr><th>Código</th><th>Descrição</th><th>Und</th><th class="r">Quant.</th><th class="r">P. unit.</th><th class="r">Total</th><th>Evento</th><th>Pacote</th></tr></thead><tbody>${lin.map(x=>x.tipo==='grupo'
     ?`<tr class="grp"><td class="mono">${esc(x.codigo)}</td><td style="padding-left:${(x.nivel-1)*14+10}px">${esc(x.descricao)}</td><td></td><td></td><td></td><td class="r mut">${x.tot==null?'':brl(x.tot)}</td><td></td><td></td></tr>`
     :`<tr><td class="mono">${esc(x.codigo)}</td><td style="padding-left:${(x.nivel-1)*14+10}px">${esc(x.descricao.slice(0,90))}</td><td>${esc(x.unidade||'')}</td><td class="r">${x.qtd==null?'—':num(x.qtd)}</td><td class="r">${x.pu==null?'—':brl(x.pu)}</td><td class="r">${x.venda==null?'<span class="pill warn">sem preço</span>':brl(x.venda)}</td><td class="mono">${esc(x.evento||'—')}</td><td class="mono">${esc(x.pacote||'—')}</td></tr>`).join('')}
     ${L.linhas.length>200?`<tr><td colspan="8" class="sub">… mais ${L.linhas.length-200} linhas</td></tr>`:''}</tbody></table></div>
   ${obnMsg()}<div id="on-falta" class="sub" aria-live="polite" style="margin-top:8px">${esc(obnFalta3())}</div><div class="acts"><button class="btn" data-act="on-voltar" ${st.grav?'disabled':''}>Voltar</button><button class="btn dark" data-act="on-gravar" ${obnPodeGravar()?'':'disabled'}>${st.grav?'Gravando…':'Gravar a obra '+esc(st.cod)}</button></div>`}
function obnPinta(){if(!ON)return;const fid=document.activeElement&&document.activeElement.id,box=document.getElementById('on-p2box');
  if(ON.passo===2&&ON.p2vivo&&box&&$('#modal').classList.contains('open')&&$('#mbox').contains(box))box.innerHTML=obnCorpo2();
  else{modal(ON.passo===1?obnHtml1():ON.passo===2?obnHtml2():obnHtml3());ON.p2vivo=ON.passo===2;if(ON.passo>1)$('#mbox').classList.add('wide')}
  if(fid&&/^on-/.test(fid)&&fid!=='on-arq'){const e=document.getElementById(fid);if(e&&e.focus)e.focus()}}

/* passo 1: dados da obra */
ACOES['on-p1']=()=>{const st=ON;if(!st)return;st.cod=($('#on-cod').value||'').trim();st.nome=obnSeguro($('#on-nome').value);st.contratante=obnSeguro($('#on-ct').value);st.msg='';
  if(!/^\d{3}$/.test(st.cod))st.msg='Código da obra: 3 números, por exemplo 344.';
  else if(SB.obras.some(o=>o.codigo===st.cod))st.msg='Já existe a obra '+st.cod+' no ERP. Escolha outro código.';
  else if(st.nome.length<3||st.nome.length>120)st.msg='Nome da obra: de 3 a 120 letras.';
  else if(st.contratante.length<2||st.contratante.length>80)st.msg='Contratante: de 2 a 80 letras.';
  else st.passo=2;
  obnPinta()};
ACOES['on-voltar']=()=>{if(!ON||ON.grav)return;ON.msg='';ON.passo=Math.max(ON.criada?2:1,ON.passo-1);obnPinta()};
/* passo 2: planilha lida e colunas ligadas */
ACOES['on-p2']=()=>{const st=ON,a=st&&st.abas[st.aba];if(!a||obnFaltaCol().length)return;st.L=obnLinhas(a,st.hdr,st.map);st.msg='';st.passo=3;
  st.planoDe=S.D&&S.D.obra&&Array.isArray(S.D.plano)&&S.D.plano.length?S.D.obra.codigo:null;obnPinta()};
function obnUsaAba(i){const st=ON,a=st.abas[i];st.aba=i;st.hdr=a?obnAchaCab(a.txt):0;st.map=a?obnSugere(a.txt[st.hdr]):{}}
document.addEventListener('change',async e=>{const t=e.target;if(!ON||!t||!t.id||!/^on-/.test(t.id))return;const st=ON;
  if(t.id==='on-arq'){const f=t.files&&t.files[0];if(!f)return;st.lendo=true;st.msg='';obnPinta();
    try{st.abas=await obnLerArquivo(f);st.arq=obnSeguro(f.name).slice(0,200);const m=obnMelhorAba(st.abas);obnUsaAba(m.i);st.avisoAba=!m.ok}
    catch(er){st.abas=[];st.arq='';st.avisoAba=false;st.msg='Não consegui ler a planilha: '+(er&&er.message||er)}
    st.lendo=false;obnPinta();return}
  if(t.id==='on-aba'){obnUsaAba(+t.value||0);st.avisoAba=false;obnPinta();return}
  if(t.id==='on-papel'){st.papel=['gestao','diretoria'].includes(t.value)?t.value:'';obnBotao3();return}
  if(t.id==='on-hdr'){const a=st.abas[st.aba];if(!a)return;const r=Math.round(+t.value||0)-a.r0;st.hdr=Math.max(0,Math.min(r,a.raw.length-1));st.map=obnSugere(a.txt[st.hdr]);obnPinta();return}
  if(t.dataset&&t.dataset.onCol){st.map[t.dataset.onCol]=t.value;obnPinta()}});
document.addEventListener('input',e=>{const t=e.target;if(!ON||!t||t.id!=='on-valor'||!ON.L)return;ON.valor=t.value;ON.valorDaSoma=false;const c=$('#on-conf');if(c)c.innerHTML=obnConf();obnBotao3()});
ACOES['on-usa-soma']=()=>{const st=ON;if(!st||!st.L||st.grav)return;st.valor=st.L.total.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});st.valorDaSoma=true;obnPinta()};

/* passo 4: gravar. Cria a obra (se ainda não existe), grava a base e abre a obra no Orçamento. */
const obnErro=e=>{const m=String(e&&e.message||e);
  if(/Could not find the function|PGRST202/.test(m))return 'O banco ainda não tem a obra nova: falta aplicar o 04_obra_nova.sql (pedido de autorização do Felipe).';
  if(/SEM PERMISSAO/.test(m))return 'Só Gestão ou Diretoria cria obra. Com a chave do site, escolha o papel Gestão ou Diretoria.';
  if(/JA EXISTE NO ERP/.test(m))return 'Já existe esta obra no ERP. Escolha outro código.';
  if(/CARACTERE NAO ACEITO/.test(m))return 'Nome ou contratante com caractere não aceito (< > ou aspas).';
  if(/NAO FOI CRIADA PELA TELA/.test(m))return 'Esta obra não foi criada pela tela: o orçamento dela só muda por Orçamento → Atualizar pela planilha.';
  if(/JA TEM DOCUMENTO LANCADO|JA TEM META|JA CONGELADA/.test(m))return 'A obra já tem lançamento, meta ou linha de base congelada: o orçamento não se regrava. Use Orçamento → Atualizar pela planilha.';
  if(/SO E GRAVADO UMA VEZ/.test(m))return 'Com a chave do site o orçamento é gravado uma vez só. Para regravar, entre com a chave pessoal de Gestão ou Diretoria.';
  if(/CRIADA COM CHAVE PESSOAL/.test(m))return 'Esta obra foi criada com chave pessoal: o orçamento dela só é gravado com a chave pessoal de Gestão ou Diretoria.';
  if(/GRANDE DEMAIS/.test(m))return 'Planilha grande demais para gravar ('+m.toLowerCase()+').';
  if(/ORCAMENTO RECUSADO/.test(m))return 'O banco recusou o orçamento: '+m.replace(/^ORCAMENTO RECUSADO/,'').trim();
  if(semRede(e))return 'Sem conexão: tente de novo quando tiver sinal.';
  return chMsg(e)};
function obnNaLista(o){const x={codigo:o.codigo,nome:o.nome,contratante:o.contratante};
  if(!CH.obras.some(y=>y.codigo===x.codigo))CH.obras.push(x);if(!SB.obras.some(y=>y.codigo===x.codigo))SB.obras.push({...x,id:x.codigo});
  if(!OBRAS_PADRAO.some(([c])=>c===x.codigo))OBRAS_PADRAO.push([x.codigo,(x.contratante||'')+' · '+x.nome])}
/* resposta da criação perdida (sem sinal) e a obra ficou criada: segue para a base se é a mesma obra e ela ainda não tem base */
async function obnJaCriada(st){try{const r=await chRpc('taf_erp_entrar',{p_chave:CH.chave,p_quem:CH.quem||null,p_papel:obnPapel()||null}),o=(r.obras||[]).find(x=>x.codigo===st.cod);
  if(!o||o.nome!==st.nome||o.contratante!==st.contratante)return false;const b=await chRpc('taf_erp_base',{p_chave:CH.chave,p_obra:st.cod,p_quem:CH.quem||null});
  if(b&&b.base_sha)return false;obnNaLista(o);return true}catch(e){return false}}
ACOES['on-gravar']=async()=>{const st=ON;if(!st||st.grav||!st.L||st.L.erros.length)return;if(!obnPode())return toast('Só Gestão ou Diretoria cria obra.');
  if(!obnPodeGravar()){st.msg=obnFalta3();obnPinta();return}
  const papel=obnPapel();st.grav=true;st.msg='';obnPinta();
  /* a base passa pela mesma limpeza que o ERP usa para abrir: o que vai para o banco é igual ao que abre */
  try{const b=obnLimpaBase(obnMontaBase(st,st.planoDe&&S.D?JSON.parse(JSON.stringify(S.D.plano)):[]),st.cod),gz=await obnGz(b);
    if(gz.length>OBN_LIM_GZ)throw new Error('BASE GRANDE DEMAIS ('+gz.length+' caracteres; o limite é '+OBN_LIM_GZ+')');
    if(await obnDesGz(gz)!==JSON.stringify(b))throw new Error('A compressão da base não confere. Nada foi gravado; tente de novo.');
    const sha=await obnSha(gz),itens=obnIndice(b.D);
    if(!st.criada){try{const r=await chRpc('taf_erp_obra_criar',{p_chave:CH.chave,p_codigo:st.cod,p_nome:st.nome,p_contratante:st.contratante,p_quem:CH.quem||null,p_papel:papel});
        st.nome=r.obra.nome;st.contratante=r.obra.contratante;obnNaLista(r.obra)}
      catch(e){if(!(/JA EXISTE NO ERP/.test(String(e&&e.message))&&st.talvez&&await obnJaCriada(st))){if(semRede(e))st.talvez=true;throw e}}
      st.criada=true;st.talvez=false}
    const r=await chRpc('taf_erp_base_gravar',{p_chave:CH.chave,p_obra:st.cod,p_base_gz:gz,p_base_sha:sha,p_itens:itens,p_quem:CH.quem||null,p_papel:papel});
    chLs('taf-erp-base-'+st.cod,JSON.stringify({sha:r.base_sha||'tela:'+sha,gz}));   /* o ERP abre a obra sem baixar a base de novo (sha com a marca "tela:" do banco) */
    const cod=st.cod;ON=null;closeModal();guardaObra(cod);S.tab={};S.view='eap';S.q='';
    toast('Obra '+cod+' gravada: '+r.itens+' itens. Defina a meta antes de comprar.');
    await sbCarregar(SB.obras.find(o=>o.codigo===cod)||{codigo:cod})}
  catch(e){if(ON===st){st.grav=false;st.msg=(st.criada?'A obra '+st.cod+' foi criada, mas o orçamento não foi gravado: ':'Nada foi gravado: ')+obnErro(e);obnPinta()}else toast('Não abriu a obra: '+obnErro(e))}};
ACOES['obra-nova']=()=>modalObraNova();
ACOES['obra-nova-base']=el=>modalObraNova(el.dataset.cod,true);

/* obra que existe no ERP mas ainda não tem orçamento gravado (a gravação caiu no meio): tela de aviso em vez de travar a entrada */
function obraSemBase(ob){SB.obraId=null;S.D=null;CH.semBase=ob.codigo;
  $('#obra-av').textContent=ob.codigo;$('#obra-nome').textContent=(ob.contratante||'')+' · '+(ob.nome||'');$('#obra-sub').textContent='Centro de custo '+ob.codigo;
  telaAviso('Obra '+esc(ob.codigo)+' ainda sem orçamento','A obra existe no ERP, mas o orçamento dela ainda não foi gravado. '+(obnPode()?'Suba a planilha do órgão para terminar.':'Peça à Gestão ou à Diretoria para subir a planilha do órgão.'),
    `<button class="btn dark" data-act="obra-nova-base" data-cod="${esc(ob.codigo)}" ${obnPode()?'':'disabled title="Só Gestão ou Diretoria"'}>Subir a planilha do órgão</button>${SB.obras.length>1?'<button class="btn" data-act="obras">Outra obra</button>':''}`)}
/* com a chave geral o papel muda na tela: o aviso acompanha */
$('#role').addEventListener('change',()=>{if(MODO_CH&&CH.semBase&&!S.D){const o=SB.obras.find(x=>x.codigo===CH.semBase);if(o)setTimeout(()=>obraSemBase(o),0)}});

/* no site TAF o botão Importar do modo banco abre a obra nova (antes só mostrava um aviso) */
/* sem obra aberta (banco sem obra, ou obra sem orçamento) não há o que salvar: trocar o papel na tela não tenta gravar numa obra que não existe */
if(MODO_CH){sbImportar=()=>modalObraNova();importarObraBanco=cod=>modalObraNova(cod);
  const sync0=sbSync;sbSync=()=>SB.obraId?sync0():Promise.resolve()}
