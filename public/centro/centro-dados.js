/* Centro TAF: lê o snapshot da rev6 no Supabase com a chave já salva pelo index.html (localStorage 'taf-chave'). */
window.TAF_DADOS=(async function(){
var URL_='https://vblfdikfobsirwpdnybw.supabase.co/rest/v1/rpc/',KEY='sb_publishable_pXs7_21V-PWatZ0iqZJ_ew_1Rm3JogW';
var ch=null;try{ch=localStorage.getItem('taf-chave')}catch(e){}
var nunca=new Promise(function(){});
if(!ch){location.replace('/?volta=centro');return nunca}
var r=await fetch(URL_+'taf_ler',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json'},body:JSON.stringify({p_chave:ch})});
var t=await r.text(),j;try{j=JSON.parse(t)}catch(e){j=t}
if(!r.ok){if(/CHAVE/.test((j&&j.message)||t)){try{localStorage.removeItem('taf-chave')}catch(e){}location.replace('/?volta=centro');return nunca}throw new Error((j&&j.message)||t)}
if(!j||!j.snap){location.replace('/');return nunca}
var D=j.snap,ed={};(j.edicoes||[]).forEach(function(x){ed[x.id]=x.dados||{}});
/* edições do site por cima da rev6: mesma regra do index.html (tarAll): {del}, {ov:{campo}}, {add:{...}} */
var CAMPOS=['obra','frente','txt','dono','sit','prazo','resposta'];
D.restricoes=(D.restricoes||[]).map(function(x){var e=ed[x.n];if(!e)return x;if(e.del)return null;var o=e.ov||{},y=Object.assign({},x);
  CAMPOS.forEach(function(c){if(o[c]===undefined)return;if(c==='prazo'){y.ate=o.prazo;y.nova=''}else y[c]=o[c]});return y}).filter(Boolean);
Object.keys(ed).sort().forEach(function(id){var a=ed[id]&&ed[id].add;if(!a)return;
  D.restricoes.push({n:'NOVA',obra:a.obra,frente:a.frente||'',txt:a.txt,dono:a.dono||'',sit:a.sit,ate:a.prazo||'',resposta:a.resposta||''})});
/* alertas e contagens iguais ao painel (tarAll/alertaDe): hoje real ou o do painel, limite de atraso salvo no navegador */
var hojeR=(function(d){return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2)})(new Date()),hoje=hojeR,atr=0;
try{var pp=JSON.parse(localStorage.getItem('taf-tarefas-param-v1')||'null');if(pp){if(/^\d{4}-\d\d-\d\d$/.test(pp.hoje||'')&&pp.em===hojeR)hoje=pp.hoje;atr=Math.max(0,Math.min(365,+pp.atr||0))}}catch(e){}
var dif=function(a,b){return Math.round((Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/864e5)};
D.restricoes.forEach(function(r){var pr=r.nova||r.ate||'';
  if(r.sit==='RESOLVIDA')r.alerta='RESOLVIDA';else if(!String(r.dono||'').trim())r.alerta='SEM DONO';else if(!pr)r.alerta=r.natureza==='RISCO'?'RISCO':'SEM PRAZO';
  else{var d=dif(hoje,pr);r.alerta=d>atr?'VENCIDA':d>=-7?'ESTA SEMANA':d>=-42?'PRÓXIMAS 6 SEMANAS':'NO PRAZO'}});
Object.keys(D.obras||{}).forEach(function(k){var o=D.obras[k],rs=D.restricoes.filter(function(r){return String(r.obra)===k&&r.sit!=='RESOLVIDA'}),n=function(al){return rs.filter(function(r){return r.alerta===al}).length};
  o.vencidas={v:n('VENCIDA'),ref:'restrições 05C com as edições do site'};o.vencemSemana={v:n('ESTA SEMANA'),ref:o.vencemSemana&&o.vencemSemana.ref};o.semDono={v:n('SEM DONO'),ref:o.semDono&&o.semDono.ref}});
return D})();
