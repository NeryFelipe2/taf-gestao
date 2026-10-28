/* ============ ACESSOS (item 3): a chave pessoal do engenheiro, do encarregado, do gestor e da Diretoria, criada pela tela ============
   Só no modo chave (site TAF). Tudo passa pelas funções taf_acesso_* do banco (fonte/erp/sql/06_acessos.sql):
   o banco gera a chave, grava só o sha256 e devolve o texto UMA vez. Esta tela mostra a chave uma vez e não guarda em lugar nenhum
   (nem no aparelho, nem no estado do ERP). Quem pode o quê é o banco que decide; a tela só esconde o botão que o banco recusaria.
   Regras do banco: Diretoria cria qualquer papel; gestor cria engenheiro, encarregado e leitura nas obras dele; a chave geral do site
   só cria a PRIMEIRA chave de Diretoria (partida); ninguém desativa a própria chave nem a última de Diretoria. */
CAN.acessos=['diretoria','gestao'];
const AC={dados:null,pend:0,erro:'',criando:0,desativando:0,ult:null};
const AC_PAPEL={diretoria:'Diretoria',gestor:'Gestor',engenheiro:'Engenheiro',encarregado:'Encarregado',leitura:'Só leitura'};
const AC_FAZ={
  diretoria:'Vê tudo, aprova acima da alçada e cria qualquer acesso.',
  gestor:'Gestão da carteira: decide e cobra demandas, dá de acordo e reabre semana. Cria acesso de engenheiro, encarregado e leitura nas obras dele.',
  engenheiro:'Prepara, monta, publica, aponta e fecha a semana no planejador. Solicita compra no ERP.',
  encarregado:'Só aponta o dia no planejador (andou, parado, entregue). Não monta, não publica e não fecha a semana.',
  leitura:'Só consulta. Não grava nada.'};
/* onde cada papel entra (com a chave pessoal). O Centro (/) continua entrando com a chave geral do site. */
const AC_ENTRADA={engenheiro:[['/marko','tela do engenheiro: planejar e apontar']],encarregado:[['/marko','tela da obra: apontar o dia']],
  gestor:[['/erp','ERP'],['/ciclo','planejador, visão da gestão'],['/','Centro de Gestão (entra com a chave geral do site; o ERP dentro dele usa esta chave)']],
  diretoria:[['/erp','ERP'],['/ciclo','planejador, visão da gestão'],['/','Centro de Gestão (entra com a chave geral do site; o ERP dentro dele usa esta chave)']],
  leitura:[['/erp','ERP, só leitura'],['/ciclo','planejador, só leitura']]};
const acOrigem=()=>{try{return location.origin&&/^https?:/.test(location.origin)?location.origin:''}catch(e){return ''}};
/* a aba aparece para Diretoria e Gestão no site; a chave de leitura não vê */
const acVisivel=()=>MODO_CH&&(isRole('diretoria','gestao')||S.role==='admin')&&!(typeof CH!=='undefined'&&CH.leitura);

/* mensagens do banco em português de obra */
const AC_MSG=[
  [/Could not find the function|PGRST202|taf_acesso_\w+ does not exist|function public\.taf_acesso/i,()=>'O banco ainda não tem a tela de acessos. Falta aplicar o 06_acessos.sql (só com o sim do Felipe).'],
  [/^SEM PERMISSAO: SO A DIRETORIA E O GESTOR CUIDAM DOS ACESSOS/,()=>'Só a Diretoria e o gestor cuidam dos acessos, com a chave pessoal.'],
  [/^A CHAVE GERAL NAO CRIA ACESSO/,()=>'Já existe chave de Diretoria: a chave geral do site não cria mais acessos. Entre com a sua chave pessoal.'],
  [/^A CHAVE GERAL NAO DESATIVA ACESSO/,()=>'Com a chave geral do site não se desativa acesso. Entre com a sua chave pessoal.'],
  [/^NA PARTIDA A CHAVE GERAL/,()=>'Com a chave geral do site só dá para criar a primeira chave de Diretoria.'],
  [/^SEM PERMISSAO: (\w+) NAO CRIA CHAVE DE (\w+)/,x=>'Quem é '+(AC_PAPEL[x[1].toLowerCase()]||x[1]).toLowerCase()+' não cria chave de '+(AC_PAPEL[x[2].toLowerCase()]||x[2]).toLowerCase()+'.'],
  [/^SEM ACESSO A OBRA (\S+?):/,x=>'A obra '+x[1]+' não está na sua chave. Só a Diretoria cria acesso nela.'],
  [/^OBRA (.+) NAO EXISTE$/,x=>'A obra '+x[1]+' não existe no sistema.'],
  [/^ESCOLHA AO MENOS UMA OBRA/,()=>'Escolha ao menos uma obra.'],
  [/^OBRAS DEMAIS/,()=>'Obras demais numa chave só.'],
  [/^NOME DA CHAVE: DE 3 A 60/,()=>'O nome da chave precisa ter de 3 a 60 letras.'],
  [/^NOME DA PESSOA: DE 2 A 60/,()=>'O nome da pessoa precisa ter de 2 a 60 letras.'],
  [/^NOME COM SINAL/,()=>'Tire do nome os sinais < > " ` \\ { } |.'],
  [/^JA EXISTE CHAVE ATIVA COM O NOME (.+?):/,x=>'Já existe chave ativa com o nome '+x[1]+'. Use outro nome ou desative a antiga.'],
  [/^INFORME A PESSOA/,()=>'Informe a pessoa.'],
  [/^INFORME O NOME DA CHAVE/,()=>'Informe o nome da chave.'],
  [/^INFORME SEU NOME/,()=>'Informe seu nome no ERP (ele fica registrado em quem criou).'],
  [/^PAPEL INVALIDO/,()=>'Papel inválido.'],
  [/^NAO DESATIVE A PROPRIA CHAVE/,()=>'Você não desativa a sua própria chave. Peça a outra pessoa da Diretoria.'],
  [/^ULTIMA CHAVE DE DIRETORIA ATIVA/,()=>'É a última chave de Diretoria ativa. Crie outra antes de desativar esta.'],
  [/^SEM PERMISSAO: O GESTOR SO DESATIVA/,()=>'O gestor só desativa chave de engenheiro, encarregado e leitura.'],
  [/^SEM PERMISSAO: A CHAVE TEM OBRA FORA DAS SUAS/,()=>'Esta chave tem obra que não está na sua. Peça à Diretoria.'],
  [/^CHAVE JA DESATIVADA/,()=>'Esta chave já está desativada.'],
  [/^CHAVE NAO ENCONTRADA/,()=>'Chave não encontrada. Atualize a lista.'],
  [/^IDENTIFICADOR/,()=>'Não achei esta chave. Atualize a lista.'],
  [/^NAO CONSEGUI GERAR A CHAVE/,()=>'Não consegui gerar a chave. Tente de novo.']];
function acMsg(e){const m=String(e&&e.message||e||'');for(const [r,f] of AC_MSG){const x=m.match(r);if(x)return f(x)}
  if(semRede(e))return 'Sem conexão com o banco. Tente de novo quando tiver sinal.';return chMsg(e)}
const acArgs=o=>({p_chave:CH.chave,p_quem:CH.quem||null,...o});

/* ---------- carregar a lista ---------- */
async function acCarregar(){AC.pend=1;
  try{AC.dados=await chRpc('taf_acesso_listar',acArgs({}));AC.erro=''}catch(e){AC.erro=acMsg(e)}
  AC.pend=0;if(S.view==='acessos')render()}
ACOES['ac-atualizar']=()=>{AC.dados=null;AC.erro='';render()};
ACOES['ac-desativadas']=()=>{S.tab.acdes=S.tab.acdes?0:1;render()};

/* ---------- tela ---------- */
const acData=s=>s?fdata(String(s).slice(0,10)):'—';
const acPapelPill=p=>`<span class="pill ${p==='diretoria'?'bad':p==='gestor'?'warn':p==='leitura'?'mute':'info'}">${esc(AC_PAPEL[p]||p)}</span>`;
const acLinks=(p,curto)=>(AC_ENTRADA[p]||[]).filter(x=>!curto||x[0]!=='/').map(([u,t])=>curto?`<span class="mono">${esc(u)}</span>`:`<li><span class="mono">${esc(acOrigem()+u)}</span> · ${esc(t)}</li>`).join(curto?' ':'');
/* por que não tem botão de desativar, em poucas palavras (a frase inteira fica no title) */
const acBloqCurto=b=>/PROPRIA/.test(b)?'É a sua chave.':/ULTIMA/.test(b)?'Última chave de Diretoria.':/OBRA FORA/.test(b)?'Tem obra fora da sua chave.':/SEM PERMISSAO/.test(b)?'Só a Diretoria desativa.':acMsg(b);
function acLinha(c){
  const des=!c.ativo,av=(c.avisos||[]);
  const acao=des?'':c.bloqueio?`<span class="sub" style="font-size:12px" title="${esc(acMsg(c.bloqueio))}">${esc(acBloqCurto(c.bloqueio))}</span>`:`<button class="btn sm no" data-act="ac-desativar" data-id="${esc(c.id)}">Desativar</button>`;
  return `<div class="ac-i${des?' ac-des':''}" data-ac="${esc(c.id)}">
    <div class="ac-nome"><b>${esc(c.nome)}</b>${c.sua?' <span class="pill ok">você</span>':''}<div class="mut" style="font-size:12.5px">${c.pessoa?esc(c.pessoa):'sem pessoa (só leitura)'}</div></div>
    <div data-r="Papel">${acPapelPill(c.papel)}</div>
    <div data-r="Obras" class="mono">${(c.obras||[]).map(esc).join(', ')}</div>
    <div data-r="Situação">${des?`<span class="pill mute">desativada</span><div class="mut" style="font-size:12px">${esc(acData(c.desativado_em))}${c.desativado_por?' · '+esc(c.desativado_por):''}</div>`:'<span class="pill ok">ativa</span>'}</div>
    <div data-r="Criada em">${esc(acData(c.criado_em))}<div class="mut" style="font-size:12px">${c.criado_por?esc(c.criado_por):'pelo banco'}</div></div>
    <div data-r="Entra por">${acLinks(c.papel,true)}</div>
    <div class="ac-act">${acao}</div>
    ${av.length&&!des?`<div class="ac-av">${av.map(a=>`<div><span class="pill warn">nome</span> ${esc(a)}</div>`).join('')}</div>`:''}
  </div>`}
function viewAcessos(){
  acCss();
  const head=`<div class="head"><div><h1>Acessos</h1><p class="lead">A chave pessoal de cada pessoa. Com ela o nome vai certo em tudo o que a pessoa lançar e o papel vem da chave, não da tela. Só a chave pessoal aprova.</p></div>`;
  if(!MODO_CH)return head+`</div><div class="sub">Disponível no site, com a chave do TAF.</div>`;
  if(!AC.dados&&!AC.pend&&!AC.erro)acCarregar();
  const D=AC.dados,pode=(D&&D.pode_criar)||[];
  const botoes=`<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="ac-atualizar">Atualizar</button>${pode.length?`<button class="btn dark" data-act="ac-novo">${D.partida&&D.ator.tipo==='geral'?'Criar a primeira chave de Diretoria':'Criar acesso'}</button>`:''}</div></div>`;
  if(AC.erro)return head+botoes+`<div class="card" style="margin-top:12px"><div class="in"><div class="neg">${esc(AC.erro)}</div></div></div>`;
  if(!D)return head+botoes+'<div class="sub" style="padding:18px">Carregando…</div>';
  const a=D.ator||{},geral=a.tipo==='geral';
  const quem=`<div class="note" style="margin-top:4px"><b>${esc(a.nome||'sem nome')} · ${geral?'chave geral do site':esc(AC_PAPEL[a.papel]||a.papel)+' · chave pessoal'}</b>${pode.length?'Você cria: '+pode.map(p=>esc((AC_PAPEL[p]||p).toLowerCase())).join(', ')+'.':'Você não cria acesso.'}</div>`;
  if(geral){
    const txt=D.partida?`<div class="panel-t">Partida</div><p class="sub" style="margin:4px 0 10px">Ainda não existe chave de Diretoria. Crie a primeira agora, em nome de quem vai cuidar dos acessos. Com ela, a Diretoria cria as outras (gestor, engenheiro, encarregado). <b>Depois disso a chave geral do site não cria mais nenhuma.</b></p><button class="btn dark" data-act="ac-novo">Criar a primeira chave de Diretoria</button>`
      :`<div class="panel-t">Entre com a sua chave pessoal</div><p class="sub" style="margin:4px 0 0">Você entrou com a chave geral do site. A lista de acessos, criar e desativar ficam só com a chave pessoal de Diretoria ou de gestor. Peça a sua para a Diretoria.</p>`;
    return head+botoes+quem+`<div class="card" style="margin-top:12px"><div class="in">${txt}</div></div>`}
  const L=D.chaves||[],at=L.filter(c=>c.ativo),des=L.filter(c=>!c.ativo),ver=S.tab.acdes?L:at,nav=at.filter(c=>(c.avisos||[]).length).length;
  const frase=`${at.length} ${at.length===1?'chave ativa':'chaves ativas'}${des.length?' e '+des.length+' '+(des.length===1?'desativada':'desativadas'):''}.${nav?` ${nav} com aviso de nome.`:''}`;
  return head+botoes+quem+`<p class="sub" style="margin:12px 0 0">${frase} ${des.length?`<button class="btn sm" data-act="ac-desativadas">${S.tab.acdes?'Esconder as desativadas':'Mostrar as desativadas'}</button>`:''}</p>
   <div class="ac-l" role="list">${ver.length?`<div class="ac-i ac-h" aria-hidden="true"><div>Nome e pessoa</div><div>Papel</div><div>Obras</div><div>Situação</div><div>Criada em</div><div>Entra por</div><div></div></div>`+ver.map(acLinha).join(''):'<div class="sub" style="padding:12px">Nenhuma chave pessoal ainda.</div>'}</div>
   <div class="sub" style="margin-top:12px">A chave só aparece uma vez, na hora de criar. Perdeu? Desative e crie outra. Desativada para de funcionar na hora, em todos os aparelhos.</div>`}

/* estilo da lista: só variáveis do tema do ERP (vale no claro, no escuro e dentro do Centro); no celular cada chave vira um cartão */
function acCss(){if(typeof document==='undefined'||!document.head||document.getElementById('ac-css'))return;const s=document.createElement('style');s.id='ac-css';
  s.textContent='.ac-l{display:flex;flex-direction:column;gap:6px;margin-top:10px}'+
  '.ac-i{display:grid;grid-template-columns:minmax(0,2fr) minmax(128px,1fr) minmax(0,.8fr) minmax(0,1.1fr) minmax(0,1.3fr) minmax(0,1fr) 130px;gap:10px;align-items:center;border:1px solid var(--line);border-radius:10px;background:var(--panel);padding:9px 12px}'+
  '.ac-i.ac-h{background:var(--panel-2);border-color:transparent;font:500 10.5px var(--mono);letter-spacing:.07em;text-transform:uppercase;color:var(--ink-3);padding:6px 12px}'+
  '.ac-i.ac-des{background:var(--panel-2)}.ac-i.ac-des .ac-nome b{color:var(--ink-3)}.ac-act{justify-self:end;text-align:right}'+
  '.ac-av{grid-column:1/-1;display:flex;flex-direction:column;gap:4px;font-size:12.5px;color:var(--ink-2)}.ac-nome{min-width:0;overflow-wrap:anywhere}'+
  '.ac-chave{font:600 17px var(--mono);letter-spacing:.03em;resize:none;line-height:1.4;overflow:hidden}'+
  '.ac-obs{display:flex;flex-direction:column;gap:6px;max-height:240px;overflow:auto;border:1px solid var(--line);border-radius:9px;padding:8px 10px}'+
  '.ac-obs label{display:flex;gap:8px;align-items:flex-start;text-transform:none;font-family:inherit;letter-spacing:0;font-size:13px;color:var(--ink);margin:0}.ac-obs input{width:auto;margin-top:3px}'+
  '@media (max-width:820px){.ac-i{grid-template-columns:1fr 1fr}.ac-i.ac-h{display:none}.ac-i .ac-nome,.ac-i .ac-act{grid-column:1/-1}.ac-act{justify-self:start;text-align:left}'+
  '.ac-i [data-r]::before{content:attr(data-r);display:block;font:500 10px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);margin-bottom:2px}}';
  document.head.appendChild(s)}

/* ---------- criar ---------- */
function acObrasHtml(O,papel){const um=O.length===1;
  return O.map(o=>`<label><input type="checkbox" class="ac-ob" value="${esc(o.codigo)}" ${um||['diretoria','gestor'].includes(papel)?'checked':''}><span><b class="mono">${esc(o.codigo)}</b> · ${esc(o.nome||'')}<br><span class="mut" style="font-size:12px">${o.planejador?(o.engenheiro?'engenheiro no planejador: '+esc(o.engenheiro):'no planejador'):'sem cronograma no planejador'}</span></span></label>`).join('')}
ACOES['ac-novo']=()=>{const D=AC.dados;if(!D||!(D.pode_criar||[]).length)return toast('Você não cria acesso.');
  const P=D.pode_criar,ini=P.includes('engenheiro')?'engenheiro':P[0],O=D.obras||[];
  if(!O.length)return toast('Nenhuma obra no sistema para dar acesso.');
  modal(`<h3>${D.ator.tipo==='geral'?'Primeira chave de Diretoria':'Criar acesso'}</h3><div class="sub">A chave nasce no banco e aparece uma vez só, na próxima janela. Fica registrado quem criou.</div>
   <label for="ac-papel">Papel</label><select id="ac-papel">${P.map(p=>`<option value="${esc(p)}" ${p===ini?'selected':''}>${esc(AC_PAPEL[p]||p)}</option>`).join('')}</select>
   <div id="ac-faz" class="sub" style="margin-top:4px">${esc(AC_FAZ[ini]||'')}</div>
   <label for="ac-pessoa">Pessoa (o nome que vai em tudo o que ela lançar)</label><input id="ac-pessoa" autocomplete="off" maxlength="60" placeholder="nome e sobrenome">
   <div id="ac-aviso"></div>
   <label for="ac-nome">Nome da chave (para achar na lista; vazio = o nome da pessoa)</label><input id="ac-nome" autocomplete="off" maxlength="60" placeholder="ex.: celular da obra">
   <label>Obras</label><div class="ac-obs" id="ac-obs">${acObrasHtml(O,ini)}</div>
   <div id="ac-msg" class="sub" style="margin-top:8px" role="alert"></div>
   <div class="acts"><button class="btn" data-act="fechar">Cancelar</button><button class="btn dark" data-act="ac-criar-ok">Criar e mostrar a chave</button></div>`);
  acCss();acPintaAviso()};
const acObrasMarcadas=()=>[...document.querySelectorAll('.ac-ob:checked')].map(e=>e.value);
/* o planejador só reconhece como do engenheiro o que está no nome do engenheiro da obra: avisa antes de criar */
function acPintaAviso(){const box=document.getElementById('ac-aviso');if(!box)return;const D=AC.dados||{},p=($('#ac-papel')||{}).value,pes=(($('#ac-pessoa')||{}).value||'').trim().replace(/\s+/g,' ');
  const f=document.getElementById('ac-faz');if(f)f.textContent=AC_FAZ[p]||'';
  if(p!=='engenheiro'){box.innerHTML='';return}
  const obs=(D.obras||[]).filter(o=>acObrasMarcadas().includes(o.codigo)&&o.planejador&&o.engenheiro&&o.engenheiro!==pes);
  box.innerHTML=obs.map(o=>`<div class="sem amarelo" style="margin-top:8px"><span class="pill warn">nome</span><span>Obra ${esc(o.codigo)}: o engenheiro no planejador é <b>${esc(o.engenheiro)}</b>. ${pes?'Com outro nome, as demandas, as áreas e as tarefas do engenheiro não aparecem como desta pessoa.':'Use o mesmo nome.'} <button class="btn sm" data-act="ac-usar-nome" data-n="${esc(o.engenheiro)}">Usar ${esc(o.engenheiro)}</button></span></div>`).join('')}
ACOES['ac-usar-nome']=el=>{const i=$('#ac-pessoa');if(i){i.value=el.dataset.n||'';acPintaAviso()}};
document.addEventListener('input',e=>{if(e.target&&e.target.id==='ac-pessoa')acPintaAviso()});
document.addEventListener('change',e=>{const t=e.target;if(!t)return;
  if(t.id==='ac-papel'){if(['diretoria','gestor'].includes(t.value))document.querySelectorAll('.ac-ob').forEach(x=>{x.checked=true});acPintaAviso()}
  else if(t.classList&&t.classList.contains('ac-ob'))acPintaAviso()});
ACOES['ac-criar-ok']=async el=>{if(AC.criando)return;const msg=t=>{const m=$('#ac-msg');if(m){m.textContent=t;m.style.color='var(--bad)'}};
  const papel=($('#ac-papel')||{}).value,pessoa=(($('#ac-pessoa')||{}).value||'').trim(),nome=(($('#ac-nome')||{}).value||'').trim(),obras=acObrasMarcadas();
  if(!papel)return msg('Escolha o papel.');if(!pessoa&&papel!=='leitura')return msg('Informe a pessoa.');if(!pessoa&&!nome)return msg('Informe o nome da chave.');
  if(!obras.length)return msg('Escolha ao menos uma obra.');
  AC.criando=1;if(el)el.disabled=true;msg('');const m=$('#ac-msg');if(m){m.textContent='Criando…';m.style.color='var(--ink-2)'}
  try{const r=await chRpc('taf_acesso_criar',acArgs({p_nome:nome||null,p_pessoa:pessoa||null,p_papel:papel,p_obras:obras}));
    AC.dados=null;AC.erro='';acMostraChave(r)}
  catch(e){msg(acMsg(e));if(el)el.disabled=false}
  finally{AC.criando=0}};

/* ---------- a chave, uma vez ---------- */
function acMostraChave(r){AC.ult={pessoa:r.pessoa||r.nome,papel:r.papel};
  const av=r.avisos||[];
  modal(`<h3>Chave criada: copie agora</h3><div class="sub">É a única vez que esta chave aparece. Depois de fechar, nem você nem o sistema veem de novo. Perdeu? Desative e crie outra.</div>
   <div class="sem amarelo" style="margin-top:12px"><span class="pill warn">atenção</span><span><b>Mande só por mensagem direta para ${esc(r.pessoa||r.nome)}.</b> Nunca em grupo, e-mail aberto ou print. Quem tiver a chave entra como essa pessoa.</span></div>
   <label for="ac-chave">Chave de ${esc(r.pessoa||r.nome)} · ${esc(AC_PAPEL[r.papel]||r.papel)} · obras ${(r.obras||[]).map(esc).join(', ')}</label>
   <textarea id="ac-chave" class="ac-chave" readonly rows="2" autocomplete="off" spellcheck="false" autocapitalize="off">${esc(r.chave)}</textarea>
   <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn dark" data-act="ac-copiar">Copiar a chave</button><button class="btn" data-act="ac-copiar-msg">Copiar mensagem pronta</button></div>
   <label>Onde entrar</label><ul style="margin:4px 0 0 18px;padding:0" class="sub">${acLinks(r.papel)}</ul>
   ${av.length?`<div style="margin-top:10px">${av.map(a=>`<div class="sem amarelo" style="margin-top:6px"><span class="pill warn">aviso</span><span>${esc(a)}</span></div>`).join('')}</div>`:''}
   ${r.partida?'<div class="sem verde" style="margin-top:10px"><span class="pill ok">próximo passo</span><span>Saia e entre no ERP com esta chave. Com ela você cria as outras (gestor, engenheiro, encarregado). A chave geral do site não cria mais acesso.</span></div>':''}
   <div class="acts"><button class="btn dark" data-act="ac-fechar-chave">Já mandei, fechar</button></div>`);
  setTimeout(()=>{const i=$('#ac-chave');if(i&&i.select)i.select()},0)}
const acChaveAberta=()=>!!document.getElementById('ac-chave');
function acCopiar(txt,ok){
  const sel=()=>{const i=$('#ac-chave');if(i&&i.select){i.focus();i.select()}let f=false;try{f=document.execCommand&&document.execCommand('copy')}catch(e){}toast(f?ok:'Chave selecionada: segure e copie (no computador, Ctrl+C).')};
  try{if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(txt).then(()=>toast(ok),sel);else sel()}catch(e){sel()}}
ACOES['ac-copiar']=()=>{const i=$('#ac-chave');if(i)acCopiar(i.value,'Chave copiada. Mande por mensagem direta.')};
ACOES['ac-copiar-msg']=()=>{const i=$('#ac-chave'),u=AC.ult||{};if(!i)return;const L=(AC_ENTRADA[u.papel]||[]).filter(x=>x[0]!=='/'),o=acOrigem();
  const t=`Olá, ${u.pessoa}. Este é o seu acesso ao sistema da TAF (${(AC_PAPEL[u.papel]||u.papel||'').toLowerCase()}).\nEntre em ${L.map(x=>o+x[0]).join(' ou ')} e digite a chave:\n${i.value}\nA chave é só sua: não mostre nem mande para ninguém. Tudo o que você lançar sai no seu nome.`;
  acCopiar(t,'Mensagem copiada. Mande por mensagem direta.')};
function acFechaChave(){const i=$('#ac-chave');if(i)i.value='';$('#mbox').innerHTML='';AC.ult=null;closeModal();render()}
ACOES['ac-fechar-chave']=acFechaChave;
/* com a chave na tela, Esc e clique fora não fecham (só o botão "Já mandei, fechar"): ninguém perde a chave sem querer */
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&acChaveAberta()){e.stopPropagation();toast('Copie a chave e use o botão "Já mandei, fechar".')}},true);
document.addEventListener('click',e=>{if(e.target&&e.target.id==='modal'&&acChaveAberta()){e.stopPropagation();toast('Copie a chave e use o botão "Já mandei, fechar".')}},true);

/* ---------- desativar ---------- */
ACOES['ac-desativar']=el=>{const c=((AC.dados||{}).chaves||[]).find(x=>x.id===el.dataset.id);if(!c)return toast('Atualize a lista.');
  modal(`<h3>Desativar a chave ${esc(c.nome)}</h3><div class="sub">${esc(c.pessoa||'sem pessoa')} · ${esc(AC_PAPEL[c.papel]||c.papel)} · obras ${(c.obras||[]).map(esc).join(', ')}</div>
   <p class="sub" style="margin-top:10px">A chave para de funcionar na hora, em todos os aparelhos. O que a pessoa já lançou fica. Não dá para reativar: se precisar, crie outra.</p>
   <label for="ac-mot">Motivo (fica registrado)</label><input id="ac-mot" maxlength="300" placeholder="ex.: trocou de celular, saiu da obra">
   <div id="ac-msg" class="sub" style="margin-top:8px" role="alert"></div>
   <div class="acts"><button class="btn" data-act="fechar">Cancelar</button><button class="btn no" data-act="ac-desativar-ok" data-id="${esc(c.id)}">Desativar</button></div>`)};
ACOES['ac-desativar-ok']=async el=>{if(AC.desativando)return;AC.desativando=1;if(el)el.disabled=true;
  try{await chRpc('taf_acesso_desativar',acArgs({p_id:el.dataset.id,p_motivo:(($('#ac-mot')||{}).value||'').trim()||null}));
    closeModal();toast('Chave desativada.');AC.dados=null;AC.erro='';render()}
  catch(e){const m=$('#ac-msg');if(m){m.textContent=acMsg(e);m.style.color='var(--bad)'}if(el)el.disabled=false}
  finally{AC.desativando=0}};
