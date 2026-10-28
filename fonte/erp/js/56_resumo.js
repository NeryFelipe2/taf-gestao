/* ============ RESUMO PARA O DIRETOR (item 5): quem recebe o e-mail do horário, prévia e "Mandar agora para mim" ============
   Só existe no ERP com a chave do site (MODO_CH). Fica em Gestão e administração, depois de Administração.
   Cadastro e chave do robô: direto no banco (taf_resumo_*, fonte/erp/sql/08_resumo.sql); o banco só aceita chave pessoal de Diretoria ou gestor.
   Prévia e envio de teste: pelo /api/resumo do site, que monta o mesmo texto do e-mail (com a chave pessoal de quem está na tela).
   Nada aqui guarda e-mail ou chave no aparelho. Todo texto que vem do banco passa por esc().
   Os botões de cadastro (Novo, Editar, Desativar, Reativar, Robô) só aparecem para can('resumo'); o banco confere de novo.
   Cadastro com dono ("É o meu e-mail" de outra pessoa): só o dono ou a Diretoria mexem (regra do banco). */
CAN.resumo=['gestao','diretoria'];
const RD={carregado:false,carregando:false,erro:'',semCadastro:false,dados:null,previa:null,previaDe:'',previaErro:'',ocupado:'',meus:null};
const RD_API='/api/resumo';
const RD_FREQ={diaria:'Diária: todo dia útil às 7h',semanal:'Semanal: segunda às 7h30'};
if(MODO_CH){const a=AREAS.find(x=>x.k==='adm');
  if(a&&!a.tabs.some(t=>t[0]==='resumo')){const i=a.tabs.findIndex(t=>t[0]==='admin')+1;a.tabs.splice(i||a.tabs.length,0,['resumo','Resumo para o diretor']);
    const j=NAV_BASE.findIndex(n=>n[0]==='admin')+1;NAV_BASE.splice(j||NAV_BASE.length,0,['resumo','Resumo para o diretor',a.i])}}

/* mensagens do banco em português de obra */
function rdMsg(e){const m=String(e&&e.message||e);let x;
  if(/USE SUA CHAVE PESSOAL/.test(m))return 'Com a chave geral do site não dá para mexer no resumo. Entre com a sua chave pessoal.';
  if(/SO DIRETORIA OU GESTOR/.test(m))return 'Só a Diretoria ou o gestor, com a chave pessoal, cadastram quem recebe. Você pode ver a prévia das suas obras.';
  if(x=m.match(/ESTE E-MAIL JA RECEBE O RESUMO (\w+)/))return 'Este e-mail já recebe o resumo '+(x[1]==='SEMANAL'?'semanal':'diário')+'.';
  if(/E-MAIL INVALIDO/.test(m))return 'E-mail fora do formato. Exemplo: nome@empresa.com.br';
  if(/NOME INVALIDO/.test(m))return 'Informe o nome (2 a 80 letras).';
  if(/SUA CHAVE NAO TEM TODAS/.test(m))return 'Sua chave não tem todas as obras: marque as obras.';
  if(/ESCOLHA AS OBRAS/.test(m))return 'Marque pelo menos uma obra.';
  if(x=m.match(/SEM ACESSO A OBRA (\S+)/))return 'Sua chave não abre a obra '+x[1]+'.';
  if(/SEM ACESSO A ESTE DESTINATARIO/.test(m))return 'Sua chave não mexe neste destinatário.';
  if(/SO O DONO OU A DIRETORIA/.test(m))return 'Este e-mail é de outra pessoa da lista: só ela ou a Diretoria mexem.';
  if(/LIMITE DE 100/.test(m))return 'Limite de 100 destinatários ativos.';
  if(/SO QUEM TEM TODAS AS OBRAS/.test(m))return 'Só quem tem todas as obras na chave gera a chave do robô.';
  if(/DESTINATARIO NAO EXISTE/.test(m))return 'Este destinatário não existe mais. Atualize a tela.';
  return chMsg(e)}

async function rdCarregar(){if(RD.carregando)return;RD.carregando=true;
  try{RD.dados=await chRpc('taf_resumo_destinatarios',{p_chave:CH.chave});RD.erro='';RD.semCadastro=false}
  catch(e){RD.dados=null;RD.erro=semRede(e)?'Não consegui falar com o banco. Tente de novo quando tiver sinal.':rdMsg(e);RD.semCadastro=/USE SUA CHAVE PESSOAL|SO DIRETORIA OU GESTOR/.test(String(e&&e.message))}
  finally{RD.carregando=false;RD.carregado=true;if(S.view==='resumo')render()}}

/* o /api/resumo do site (a resposta de erro dele já vem em português) */
async function rdApi(corpo){let r,j=null;
  try{r=await fetch(RD_API,{method:'POST',headers:{'Content-Type':'application/json','x-chave':CH.chave},body:JSON.stringify(corpo)})}
  catch(e){throw new Error('Não consegui falar com o site. Tente de novo quando tiver sinal.')}
  try{j=await r.json()}catch(e){j=null}
  if(r.status===404&&!(j&&j.erro))throw new Error('O envio automático ainda não está publicado neste site.');
  if(!r.ok||!j||j.ok===false){const t=String(j&&j.erro||('erro '+r.status));throw new Error(t.charAt(0).toUpperCase()+t.slice(1)+'.')}
  return j}

const rdDest=id=>((RD.dados&&RD.dados.destinatarios)||[]).find(d=>String(d.id)===String(id));
const rdCad=()=>!!RD.dados&&can('resumo');
const rdMexe=d=>rdCad()&&(!d.tem_dono||d.meu||RD.dados.papel==='diretoria');
const rdObras=d=>d.todas?'Todas':(d.obras||[]).map(esc).join(', ');
function rdUltimo(u){if(!u)return '<span class="sub">ainda não saiu</span>';
  const p=u.estado==='enviado'?'<span class="pill ok">enviado</span>':u.estado==='erro'?`<span class="pill bad" title="${esc(u.erro||'')}">não saiu</span>`:'<span class="pill warn">mandando</span>';
  return `${p} <span class="mono">${esc(fdata(String(u.dia||'').slice(0,10)))}</span>${u.quando==='teste'?' <span class="sub">teste</span>':''}${u.estado==='erro'&&u.erro?`<div class="sub">${esc(u.erro)}</div>`:''}`}

function rdFalhas(D){const F=D.filter(d=>d.ativo&&d.falhou);if(!F.length)return '';
  return `<div class="alert" style="margin:0 0 10px"><div class="g" style="color:var(--warn)">!</div><div><b>${F.length===1?'1 pessoa ficou':F.length+' pessoas ficaram'} sem o último resumo</b><p>${F.map(d=>esc(d.nome)).join(', ')}. O site tenta de novo na repescagem (9h; na segunda, 9h30 o semanal) e no próximo envio, com quem ficou sem na frente da fila. O motivo está em "Último envio".</p></div></div>`}
function rdLista(){const D=RD.dados.destinatarios||[];
  if(!D.length)return '<div class="sub" style="margin:8px 4px">Ninguém cadastrado ainda. Sem destinatário, o e-mail do horário não sai.</div>';
  /* os botões ficam na primeira coluna: no celular aparecem sem rolar a tabela para o lado */
  return `${rdFalhas(D)}<div class="tw"><table class="tbl"><thead><tr><th>Nome</th><th>E-mail</th><th>Obras</th><th>Frequência</th><th>Situação</th><th>Último envio</th></tr></thead><tbody>${D.map(d=>`<tr>
    <td style="min-width:190px"><b>${esc(d.nome)}</b>${d.meu?' <span class="pill info">seu e-mail</span>':''}<div class="sub">cadastrado por ${esc(d.cadastrado_por)}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">${d.ativo?`${rdMexe(d)?`<button class="btn sm" data-act="rd-editar" data-id="${esc(d.id)}">Editar</button>`:''}<button class="btn sm" data-act="rd-previa" data-id="${esc(d.id)}">Prévia</button>${rdMexe(d)?`<button class="btn sm" data-act="rd-desativar" data-id="${esc(d.id)}">Desativar</button>`:''}`
      :rdMexe(d)?`<button class="btn sm" data-act="rd-reativar" data-id="${esc(d.id)}">Reativar</button>`:''}</div>${rdCad()&&!rdMexe(d)?'<div class="sub">e-mail de outra pessoa: só ela ou a Diretoria mexem</div>':''}</td>
    <td class="mono">${esc(d.email)}</td><td>${rdObras(d)}</td><td>${esc(RD_FREQ[d.frequencia]||d.frequencia)}</td>
    <td>${d.ativo?'<span class="pill ok">ativo</span>':'<span class="pill mute">desativado</span>'}${d.ativo&&d.falhou?' <span class="pill bad">ficou sem</span>':''}</td><td>${rdUltimo(d.ultimo)}</td></tr>`).join('')}</tbody></table></div>`}

function rdRobo(){const r=RD.dados.robo;
  return `<div class="card" style="margin-top:14px"><div class="in"><div class="panel-t">Robô do envio</div>
    ${r?`<div class="sub">Chave do robô criada em ${esc(fdata(String(r.criado_em||'').slice(0,10)))} por ${esc(r.criado_por)}. Ela fica só na Vercel, na variável TAF_CHAVE_RESUMO; aqui não aparece de novo.</div>`
      :'<div class="sub">Ainda não tem chave do robô. Sem ela o e-mail do horário não sai.</div>'}
    <div class="sub">Para ligar o envio, a Vercel precisa de 4 variáveis: CRON_SECRET, RESEND_API_KEY, RESUMO_REMETENTE e TAF_CHAVE_RESUMO. Depois de mudar, faça um novo Deploy.</div>
    <div style="margin-top:8px"><button class="btn sm" data-act="rd-robo">${r?'Trocar a chave do robô':'Gerar chave do robô'}</button></div></div></div>`}

function rdPrevia(){
  if(RD.ocupado)return `<div class="sub" style="margin-top:12px">${esc(RD.ocupado)}</div>`;
  if(RD.previaErro)return `<div class="sub" style="margin-top:12px;color:var(--bad)">${esc(RD.previaErro)}</div>`;
  if(!RD.previa)return '';
  const p=RD.previa;
  return `<div style="margin-top:12px"><div class="sub">${RD.previaDe?'O que '+esc(RD.previaDe)+' recebe':'O que sai para as suas obras'}${p.obras&&p.obras.length?' ('+p.obras.map(esc).join(', ')+')':''}. Assunto do e-mail:</div>
    <div style="margin:2px 4px 8px"><b>${esc(p.assunto)}</b></div>
    <pre id="rd-texto" style="white-space:pre-wrap;word-break:break-word;font:12.5px/1.5 var(--mono);background:var(--panel-2);border:1px solid var(--line);border-radius:10px;padding:12px;margin:0;max-height:60vh;overflow:auto">${esc(p.texto)}</pre>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn" data-act="rd-copiar">Copiar para WhatsApp</button><button class="btn" data-act="rd-fechar">Fechar prévia</button></div></div>`}

function viewResumo(){
  if(!RD.carregado&&!RD.carregando)rdCarregar();
  const meus=RD.dados?(RD.dados.destinatarios||[]).filter(d=>d.meu&&d.ativo).map(d=>({email:d.email})):(RD.meus||[]);
  /* quem não cadastra (engenheiro, leitura) não tem e-mail ligado à chave: fica com a prévia e o "Copiar para WhatsApp" */
  const mandar=!RD.semCadastro?`<button class="btn" data-act="rd-mandar" ${RD.ocupado?'disabled':''}>Mandar agora para mim</button>`:'';
  const cad=RD.carregando&&!RD.carregado?'<div class="sub" style="margin:8px 4px">Carregando a lista.</div>'
    :RD.dados?rdLista()+(rdCad()?`<div style="margin-top:8px"><button class="btn sm dark" data-act="rd-novo">Novo destinatário</button></div>`:'')
    :`<div class="sub" style="margin:8px 4px;${RD.semCadastro?'':'color:var(--bad)'}">${esc(RD.erro)}</div>`;
  return `<div class="head"><div><h1>Resumo para o diretor</h1><p class="lead">Todo dia útil às 7h o site manda por e-mail o resumo de cada obra: <b>PPC, atrasos, restrições, apontamento e custo x meta</b>. Na segunda às 7h30 sai o semanal. Aqui você escolhe quem recebe e confere o texto antes.</p></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="rd-atualizar">Atualizar</button></div></div>
  <div class="card"><div class="in"><div class="panel-t">O que vai sair</div>
    <div class="sub">A prévia usa as obras da sua chave pessoal. Ver a prévia não manda nada.${meus.length?' "Mandar agora para mim" vai para '+meus.map(m=>esc(m.email)).join(', ')+', com as obras do cadastro de cada e-mail.':''}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn dark" data-act="rd-previa" ${RD.ocupado?'disabled':''}>Ver prévia</button>${mandar}</div>
    ${rdPrevia()}</div></div>
  <div class="card" style="margin-top:14px"><div class="in"><div class="panel-t">Quem recebe</div>${cad}</div></div>
  ${rdCad()&&RD.dados.cobre_todas?rdRobo():''}`}

/* ---------- ações ---------- */
ACOES['rd-atualizar']=()=>{RD.carregado=false;rdCarregar();render()};
ACOES['rd-fechar']=()=>{RD.previa=null;RD.previaErro='';render()};
ACOES['rd-previa']=async el=>{const id=el&&el.dataset&&el.dataset.id?+el.dataset.id:null,d=id?rdDest(id):null;
  RD.ocupado='Montando a prévia.';RD.previaErro='';RD.previa=null;RD.previaDe=d?d.nome:'';render();
  try{const j=await rdApi(id?{acao:'previa',destinatario:id}:{acao:'previa'});RD.previa=j;if(!id&&Array.isArray(j.meus))RD.meus=j.meus}
  catch(e){RD.previaErro=String(e&&e.message||e)}
  finally{RD.ocupado='';render()}};
ACOES['rd-mandar']=async()=>{RD.ocupado='Mandando para o seu e-mail.';RD.previaErro='';render();
  try{const j=await rdApi({acao:'mandar'});toast('Mandado para '+(j.para||[]).join(', ')+'.');RD.carregado=false;rdCarregar()}
  catch(e){RD.previaErro=String(e&&e.message||e)}
  finally{RD.ocupado='';render()}};
ACOES['rd-copiar']=()=>{const t=RD.previa&&RD.previa.whatsapp;if(!t)return;
  try{navigator.clipboard.writeText(t).then(()=>toast('Copiado. Cole no WhatsApp.'),()=>toast('Não consegui copiar: selecione o texto e copie.'))}catch(e){toast('Não consegui copiar: selecione o texto e copie.')}};

const RD_CHK='style="display:flex;gap:8px;align-items:center;text-transform:none;font-family:inherit;letter-spacing:0;font-size:13.5px;color:var(--ink)"';
function rdForm(d){const D=RD.dados||{},obras=D.obras||[],todas=d?d.todas:!!D.cobre_todas;
  modal(`<h3>${d?'Editar destinatário':'Novo destinatário'}</h3>
    <label for="rd-n">Nome</label><input id="rd-n" maxlength="80" autocomplete="name" value="${esc(d?d.nome:'')}">
    <label for="rd-e">E-mail</label><input id="rd-e" type="email" inputmode="email" autocomplete="email" maxlength="200" value="${esc(d?d.email:'')}">
    <label for="rd-f">Frequência</label><select id="rd-f">${Object.entries(RD_FREQ).map(([k,v])=>`<option value="${k}" ${(d?d.frequencia:'diaria')===k?'selected':''}>${v}</option>`).join('')}</select>
    <label>Obras</label>
    ${D.cobre_todas?`<label ${RD_CHK}><input type="checkbox" id="rd-todas" style="width:auto" ${todas?'checked':''}> Todas as obras (entra também obra nova)</label>`:''}
    ${obras.map(o=>`<label ${RD_CHK}><input type="checkbox" class="rd-o" value="${esc(o.obra)}" style="width:auto" ${todas?'disabled':''} ${d&&!d.todas&&(d.obras||[]).includes(o.obra)?'checked':''}> ${esc(o.obra)} · ${esc(o.nome||'')}</label>`).join('')}
    <label ${RD_CHK} style="margin-top:12px"><input type="checkbox" id="rd-meu" style="width:auto" ${d&&d.meu?'checked':''}> É o meu e-mail (posso usar "Mandar agora para mim")</label>
    ${d&&d.tem_dono&&!d.meu?'<div class="sub">Este e-mail é de outra pessoa da lista. Se você trocar o e-mail, ele deixa de ser dela.</div>':''}
    <div id="rd-msg" class="sub" style="color:var(--bad)"></div>
    <div class="acts"><button class="btn" data-act="fechar">Cancelar</button><button class="btn dark" data-act="rd-salvar" data-id="${d?esc(d.id):''}">Salvar</button></div>`)}
document.addEventListener('change',e=>{const t=e.target;if(t&&t.id=== 'rd-todas')document.querySelectorAll('.rd-o').forEach(x=>{x.disabled=t.checked})});
const rdPode=d=>{if(!rdCad()){toast(RD.erro||'Só a Diretoria ou o gestor cadastram.');return false}
  if(d&&!rdMexe(d)){toast('Este e-mail é de outra pessoa da lista: só ela ou a Diretoria mexem.');return false}return true};
ACOES['rd-novo']=()=>{if(rdPode())rdForm(null)};
ACOES['rd-editar']=el=>{const d=rdDest(el.dataset.id);if(d&&rdPode(d))rdForm(d)};
async function rdGravar(id,campos,ok){
  try{await chRpc('taf_resumo_destinatario_salvar',{p_chave:CH.chave,p_id:id||null,...campos});toast(ok);closeModal();RD.carregado=false;await rdCarregar()}
  catch(e){const m=$('#rd-msg');if(m&&$('#modal').classList.contains('open'))m.textContent=rdMsg(e);else toast(rdMsg(e))}}
ACOES['rd-salvar']=el=>{const msg=t=>{const m=$('#rd-msg');if(m)m.textContent=t};
  const nome=($('#rd-n').value||'').trim(),email=($('#rd-e').value||'').trim().toLowerCase(),freq=$('#rd-f').value,todas=!!($('#rd-todas')&&$('#rd-todas').checked);
  const obras=[...document.querySelectorAll('.rd-o:checked')].map(x=>x.value);
  if(nome.length<2)return msg('Informe o nome.');
  if(!/^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(email))return msg('E-mail fora do formato. Exemplo: nome@empresa.com.br');
  if(!todas&&!obras.length)return msg('Marque pelo menos uma obra.');
  rdGravar(el.dataset.id?+el.dataset.id:null,{p_nome:nome,p_email:email,p_obras:todas?null:obras,p_frequencia:freq,p_meu:!!($('#rd-meu')&&$('#rd-meu').checked)},'Salvo. '+nome+' recebe a partir do próximo envio.')};
ACOES['rd-reativar']=el=>{const d=rdDest(el.dataset.id);if(!d||!rdPode(d))return;
  rdGravar(d.id,{p_nome:d.nome,p_email:d.email,p_obras:d.todas?null:d.obras,p_frequencia:d.frequencia,p_meu:!!d.meu},'Reativado.')};
ACOES['rd-desativar']=el=>{const d=rdDest(el.dataset.id);if(!d||!rdPode(d))return;
  modal(`<h3>Desativar ${esc(d.nome)}</h3><div class="sub">Para de receber o resumo. Nada se apaga: dá para reativar depois.</div><div id="rd-msg" class="sub" style="color:var(--bad)"></div>
    <div class="acts"><button class="btn" data-act="fechar">Cancelar</button><button class="btn dark" data-act="rd-desativar-ok" data-id="${esc(d.id)}">Desativar</button></div>`)};
ACOES['rd-desativar-ok']=async el=>{
  try{await chRpc('taf_resumo_destinatario_desativar',{p_chave:CH.chave,p_id:+el.dataset.id});toast('Desativado.');closeModal();RD.carregado=false;await rdCarregar()}
  catch(e){const m=$('#rd-msg');if(m)m.textContent=rdMsg(e)}};
ACOES['rd-robo']=()=>{if(!rdPode())return;const tem=!!RD.dados.robo;
  modal(`<h3>${tem?'Trocar a chave do robô':'Gerar chave do robô'}</h3><div class="sub">O robô usa esta chave para montar o e-mail do horário. Ela só lê o resumo; não abre o ERP nem o planejador.${tem?' A chave atual para de valer na hora: o envio só volta depois de colar a nova na Vercel.':''}</div><div id="rd-msg" class="sub" style="color:var(--bad)"></div>
    <div class="acts"><button class="btn" data-act="fechar">Cancelar</button><button class="btn dark" data-act="rd-robo-ok">${tem?'Trocar':'Gerar'}</button></div>`)};
ACOES['rd-robo-ok']=async()=>{let r;
  try{r=await chRpc('taf_resumo_robo_gerar',{p_chave:CH.chave})}catch(e){const m=$('#rd-msg');if(m)m.textContent=rdMsg(e);return}
  modal(`<h3>Chave do robô</h3><div class="sub">Copie agora: ela não aparece de novo.</div>
    <input id="rd-chave" readonly class="mono" value="${esc(r.chave)}" aria-label="Chave do robô">
    <div class="sub" style="margin-top:8px">1. Copie a chave. 2. Na Vercel: Settings, Environment Variables, TAF_CHAVE_RESUMO: cole e salve. 3. Faça um novo Deploy.</div>
    <div class="acts"><button class="btn" data-act="rd-chave-copiar">Copiar chave</button><button class="btn dark" data-act="rd-chave-fechar">Pronto</button></div>`);
  r=null;RD.carregado=false;rdCarregar()};
ACOES['rd-chave-copiar']=()=>{const i=$('#rd-chave');if(!i)return;try{navigator.clipboard.writeText(i.value).then(()=>toast('Chave copiada.'),()=>{i.select();toast('Selecionada: use Ctrl+C.')})}catch(e){i.select();toast('Selecionada: use Ctrl+C.')}};
ACOES['rd-chave-fechar']=()=>{const i=$('#rd-chave');if(i)i.value='';closeModal()};
