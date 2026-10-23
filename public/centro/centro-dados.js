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
return D})();
