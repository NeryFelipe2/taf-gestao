import re,base64,io,json
from PIL import Image
t=open('template2.html',encoding='utf-8').read()
css=open('wcr.css',encoding='utf-8').read()
ex=open('extract.js',encoding='utf-8').read().replace("if (typeof module !== 'undefined')","if (false && typeof module !== 'undefined')")

def webp(name,w):
    im=Image.open(io.BytesIO(base64.b64decode(open(name+'.b64').read())))
    h=round(im.size[1]*w/im.size[0]); im=im.resize((w,h),Image.LANCZOS)
    b=io.BytesIO(); im.save(b,'WEBP',quality=55,alpha_quality=30,method=6); return base64.b64encode(b.getvalue()).decode()
canto=webp('logo_canto',240); marca=webp('logo_marca',400)
css=css.replace('data:image/png;base64,/*LOGOMARCA*/','data:image/webp;base64,'+marca)
t=t.replace('data:image/png;base64,/*LOGOCANTO*/','data:image/webp;base64,'+canto)

def sub(old,new,cnt=1):
    global t
    assert t.count(old)==cnt,(old[:60],t.count(old))
    t=t.replace(old,new)

# dados vêm do banco
sub('var D=/*SNAP*/;\nvar W=/*WA*/;','var D=null,W={acoes:[]};')
sub('(function(){\n"use strict";','window.__iniciar=function(){\n"use strict";')
sub('tkInit();\nrender();\n})();','tkInit();\nrender();\npollIni();\n};')
sub("var FONTE='rev6 do projeto, lida em 19/10/2026';","var FONTE='rev6';")
# edicoes compartilhadas
old=t[t.index("try{var _e=JSON.parse(localStorage.getItem(EK)"):t.index("var edVazio=")]
new="""var HK='taf-tarefas-param-v1',REM=window.__REM||{},REMQ=window.__REMQ||{};
var cl=function(x){return JSON.parse(JSON.stringify(x))};
function edDeDocs(m){var e={hoje:null,atr:0,ov:{},add:[],del:{},nid:1};try{var p=JSON.parse(localStorage.getItem(HK)||'null');if(p){e.hoje=/^\\d{4}-\\d\\d-\\d\\d$/.test(p.hoje||'')?p.hoje:null;e.atr=Math.max(0,Math.min(365,+p.atr||0))}}catch(x){}
  Object.keys(m).sort().forEach(function(id){var v=m[id]||{};if(id.charAt(0)==='R'){if(v.del)e.del[id]=1;else if(v.ov)e.ov[id]=cl(v.ov)}else if(v.add)e.add.push(cl(v.add))});
  e.add.sort(function(a,b){return +a.id.slice(1)-+b.id.slice(1)});return e}
ED=edDeDocs(REM);
function docsDeED(){var m={};if(!ED)return m;Object.keys(ED.ov).forEach(function(k){m[k]={ov:ED.ov[k]}});Object.keys(ED.del).forEach(function(k){m[k]={del:1}});ED.add.forEach(function(a){m[a.id]={add:a}});return m}
"""
t=t.replace(old,new)
sub("var edVazio=function(){return !ED||(!ED.hoje&&!ED.atr&&!Object.keys(ED.ov).length&&!ED.add.length&&!Object.keys(ED.del).length)};",
    "var edVazio=function(){return !ED||(!ED.hoje&&!ED.atr&&!Object.keys(ED.ov).length&&!ED.add.length&&!Object.keys(ED.del).length)};\nvar semEdicao=function(){return !ED||(!Object.keys(ED.ov).length&&!ED.add.length&&!Object.keys(ED.del).length)};")
sub("function edSave(){try{if(edVazio())localStorage.removeItem(EK);else localStorage.setItem(EK,JSON.stringify(ED))}catch(e){}}",
"""function edSave(){try{localStorage.setItem(HK,JSON.stringify({hoje:ED&&ED.hoje,atr:ED&&ED.atr}))}catch(e){}syncAg()}
var syncT=null,syncBusy=false;
function syncAg(){clearTimeout(syncT);syncT=setTimeout(sync,500)}
async function sync(){
  if(syncBusy){syncAg();return}
  var cur=docsDeED(),ids={};Object.keys(cur).concat(Object.keys(REM)).forEach(function(k){ids[k]=1});
  var dif=Object.keys(ids).filter(function(k){return JSON.stringify(cur[k]||null)!==JSON.stringify(REM[k]||null)});
  if(!dif.length)return;syncBusy=true;var ok=0,falha=false;
  for(var i=0;i<dif.length;i++){var k=dif[i];
    try{await TAF.rpc('taf_tarefa_salvar',{p_chave:TAF.chave,p_id:k,p_dados:cur[k]||null,p_quem:TAF.quem()});if(cur[k]){REM[k]=cl(cur[k]);REMQ[k]={quem:TAF.quem(),em:new Date().toISOString()}}else{delete REM[k];delete REMQ[k]}ok++}catch(e){falha=true;if(e.status===401||/CHAVE/.test(e.message)){TAF.sair();return}}}
  syncBusy=false;
  if(falha){toast('Sem conexão com o banco. A edição ficou só neste navegador; tento de novo em instantes.');setTimeout(syncAg,15000)}else if(ok)toast('Salvo para todos');
}
async function puxar(){
  if(syncBusy||syncT)return;var a=document.activeElement;if(a&&/^(TEXTAREA|INPUT|SELECT)$/.test(a.tagName)&&a.closest('#p-tarefas'))return;
  try{var rows=await TAF.rpc('taf_edicoes',{p_chave:TAF.chave}),m={},q={};rows.forEach(function(r){m[r.id]=r.dados;q[r.id]={quem:r.quem,em:r.em}});
    if(JSON.stringify(m)!==JSON.stringify(REM)&&JSON.stringify(docsDeED())===JSON.stringify(REM)){REM=m;window.__REM=m;REMQ=q;window.__REMQ=q;ED=edDeDocs(m);TKW='Atualizado com edições de outra pessoa';render()}}catch(e){}
}
function pollIni(){setInterval(puxar,30000);document.addEventListener('visibilitychange',function(){if(!document.hidden)puxar()})}""")
sub("var o=ED.ov[id]=ED.ov[id]||{}","var o=ED.ov[id]=ED.ov[id]||{}")  # sanity
# nova tarefa: id único
sub("var id='N'+(ED.nid++);","var id='N'+Date.now();")
sub("if(ED)ED.add.forEach(function(a){var t={id:a.id,n:'NOVA '+a.id.slice(1),","if(ED)ED.add.forEach(function(a,ix){var t={id:a.id,n:'NOVA '+(ix+1),")
# restaurar = apaga edicoes de todos
sub("'Confirmar: apagar edições',function(){ED=null;TKW='Restaurado à rev6';edSave();render();toast('Dados originais da rev6 restaurados')}",
    "'Confirmar: apagar edições de todos',function(){ens();ED.ov={};ED.add=[];ED.del={};ED.hoje=null;ED.atr=0;TKW='Restaurado à rev6';edSave();render();toast('Dados originais da rev6 restaurados')}")
# textos
t=t.replace('Simulação local, não altera a rev6','Edição compartilhada, não altera a planilha rev6').replace('Tarefa nova (simulação local)','Tarefa nova (edição compartilhada)').replace("' (simulação local)'","' (com edições)'").replace('simulação local','edição compartilhada')
t=t.replace("sim=!edVazio()","sim=!semEdicao()") if "sim=!edVazio()" in t else t
sub("function tkSim(){var s=$('ed-sim');if(s)s.hidden=edVazio()}","function tkSim(){var s=$('ed-sim');if(s)s.hidden=semEdicao()}")
# upload da rev6 salva para todos
sub("D=extractRev6(wb);FONTE=f.name+', lido agora';","D=extractRev6(wb);FONTE=f.name+', lido agora';TAF.rpc('taf_snap_salvar',{p_chave:TAF.chave,p_snap:D,p_fonte:f.name,p_quem:TAF.quem()}).then(function(){toast('rev6 salva para todos')},function(){toast('Li a rev6 aqui, mas não consegui salvar no banco')});")
# aba WhatsApp some se vazia
sub("$('n-wa').textContent=W.acoes.length;","$('n-wa').textContent=W.acoes.length;$('t-whatsapp').hidden=!W.acoes.length;")
sub("if(TABS.indexOf(h0)>=0)S.tab=h0;","if(TABS.indexOf(h0)>=0)S.tab=h0;if(S.tab==='whatsapp'&&!W.acoes.length)S.tab='painel';")
# head
sub('<title>Painel de Gestão TAF</title>','<title>Gestão das obras TAF</title>\n<meta name="robots" content="noindex,nofollow">')
sub('/*WCRCSS*/',css+"""
#gate{position:fixed;inset:0;z-index:100;background:var(--bg);display:flex;align-items:center;justify-content:center;padding:16px}
#gate[hidden]{display:none}
#gate .box{max-width:380px;width:100%;background:var(--panel);border:1px solid var(--line2);border-radius:14px;padding:22px;display:flex;flex-direction:column;gap:12px}
#gate h2{margin:0;font:600 22px var(--f-hd);color:var(--hd)}
#gate p{margin:0;color:var(--mu);font-size:14px}
#gate input[type=text],#gate input[type=password]{padding:10px 12px;border:1px solid var(--line2);border-radius:8px;background:var(--raised);color:var(--tx);font:500 15px var(--f-tx)}
#gate .err{color:var(--s-ne);font-size:13px;min-height:1em}
""")
sub('/*EXTRACT*/',ex)
# gate + loader
loader=open('loader.html',encoding='utf-8').read()
sub('<div id="tip" hidden></div>',loader+'\n<div id="tip" hidden></div>')
open('index.html','w',encoding='utf-8').write(t)
print(len(t))
