(async function(){
"use strict";
var $=function(s,r){return(r||document).querySelector(s)},$$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
var reduce=matchMedia("(prefers-reduced-motion: reduce)").matches,fine=matchMedia("(pointer:fine)").matches,wide=matchMedia("(min-width: 768px)").matches;
var root=document.documentElement,body=document.body;
var D=await (window.TAF_DADOS||fetch("snap.json").then(function(r){return r.json()}));
var MES=["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
var fm=function(v){return (v/1e6).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})};
var dm=function(s){return s.slice(8,10)+"/"+s.slice(5,7)+"/"+s.slice(0,4)};
var mm=function(s){return MES[+s.slice(5,7)-1]+"/"+s.slice(2,4)};
var T=function(s,t){var e=$(s);if(e)e.textContent=t};
var OB=["342","343","281"];
var venc=0,sem=0;OB.forEach(function(k){venc+=D.obras[k].vencidas.v;sem+=D.obras[k].vencemSemana.v});
var abertas=D.restricoes.filter(function(r){return r.sit!=="RESOLVIDA"});
var corte=dm(D.corte.v),cxPior="−R$ "+fm(-D.caixa.pior.v)+" mi",cxMes=mm(D.caixa.piorMes.v);

/* textos */
T("#pl-corte","Corte "+corte);T("#nv-corte","Corte "+corte);T("#ct-corte","Corte "+corte+" · master check "+D.master.v);T("#mn-sem",D.semana.v);
T("#mf-cart","R$ "+fm(D.carteira.v)+" mi em carteira.");T("#mf-venc",venc+" tarefas vencidas.");T("#mf-cx","O caixa aperta em "+cxMes+".");
$("#mf-sem").innerHTML="Semana<br>"+D.semana.v.replace(/^semana de /,"");
T("#mf-p",sem+" restrições vencem até sexta. O pior saldo previsto da empresa é "+cxPior+", em "+cxMes+". As três obras estão abaixo, uma de cada vez.");
T("#mt-master",D.master.v);$("#mt-venc").dataset.c=venc;$("#mt-sem").dataset.c=sem;$("#mt-ab").dataset.c=abertas.length;
T("#ft-code","TAF / GESTÃO DAS OBRAS / REV6 / CORTE "+corte.replace(/\//g,"-"));
var strip=[];OB.forEach(function(k){var o=D.obras[k];strip.push("Obra "+k);strip.push(o.vencidas.v+" vencidas");strip.push("Fim "+dm(o.fim.v))});strip.push("Carteira R$ "+fm(D.carteira.v)+" mi");
$("#strip").innerHTML=strip.concat(strip).map(function(s){return"<span>"+s+"</span>"}).join("");

/* obras = capítulos */
var LC={VERDE:"var(--ok)",AMARELO:"var(--am)",VERMELHO:"var(--no)"};
$("#chapters").innerHTML=OB.map(function(k,i){var o=D.obras[k],nm=o.nome.v.replace(/^\d+\s—\s/,""),cli=nm.split(" ")[0],resto=nm.slice(cli.length+1),pct=typeof o.pct.v==="number"?o.pct.v:null,pc=o.piorCaixa.v;
 var lz=[["PRODUCAO","Produção"],["DINHEIRO","Dinheiro"],["PLANO","Plano"]].map(function(l){var v=o.luz[l[0]].v,c=LC[v];return'<span><i class="'+(c?"":"o")+'" style="--c:'+(c||"transparent")+'"></i>'+l[1]+"</span>"}).join("");
 return'<article class="chapter" data-screen-label="Obra '+k+'"><div class="chapter__copy"><span class="chapter__number">OBRA_'+k+" / "+cli+'</span><h2>'+k+'<i>'+cli.toLowerCase().replace(/^./,function(c){return c.toUpperCase()})+'.</i></h2>'+
 '<div class="chapter__body"><small>Fim do prazo<br>'+dm(o.fim.v)+'</small><p>'+resto+". "+o.vencidas.v+" restrições vencidas, "+o.vencemSemana.v+" vencem na semana e "+o.semDono.v+" sem dono.</p></div></div>"+
 '<div class="chapter__media"><div class="ob-facts">'+
 '<div><small>Contrato</small><div><b data-c="'+(o.contrato.v/1e6)+'" data-d="2">0</b><em>R$ mi · parte TAF '+Math.round(o.parte.v*100)+"%</em></div></div>"+
 '<div><small>Medido</small><div>'+(pct==null?'<b class="sb">SEM BASE</b>':'<b data-c="'+(pct*100)+'" data-d="1" data-s="%">0</b>')+"<em>R$ "+fm(o.medido.v)+" mi aprovado</em></div></div>"+
 '<div><small>Vencidas</small><div><b class="'+(o.vencidas.v?"neg":"")+'" data-c="'+o.vencidas.v+'" data-d="0">0</b><em>'+o.vencemSemana.v+" vencem na semana</em></div></div>"+
 '<div><small>Pior caixa</small><div>'+(pc==null?'<b class="sb">SEM BASE</b><em>sem fluxo projetado</em>':'<b class="neg" data-c="'+(-pc/1e6)+'" data-d="2" data-p="−">0</b><em>R$ mi · '+mm(o.piorMes.v)+"</em>")+"</div></div>"+
 '</div><span class="chapter__tag lzt"><span class="lz">'+lz+"</span></span></div></article>"}).join("");

/* responsáveis */
var by={};abertas.forEach(function(r){var k=r.dono||"Sem dono",o=by[k]=by[k]||{t:0,v:0,s:0,list:[]};o.t++;if(r.alerta==="VENCIDA")o.v++;else if(r.alerta==="ESTA SEMANA")o.s++;o.list.push(r)});
var donos=Object.keys(by).map(function(k){return[k,by[k]]}).sort(function(a,b){return b[1].v-a[1].v||b[1].t-a[1].t}).slice(0,6);
var rank={VENCIDA:0,"ESTA SEMANA":1};
$("#caps").innerHTML=donos.map(function(d,i){return'<div class="capability" tabindex="0" data-i="'+i+'"><small>'+String(i+1).padStart(2,"0")+"</small><strong>"+d[0]+"</strong><span>↗</span></div>"}).join("");
var vw=$(".capabilities__viewer");
function pick(i){var d=donos[i],o=d[1],top=o.list.slice().sort(function(a,b){return(rank[a.alerta]??2)-(rank[b.alerta]??2)||String(a.ate).localeCompare(String(b.ate))})[0];
 T("#vw-who",d[0]);T("#vw-n",String(o.t).padStart(2,"0"));T("#vw-lbl",o.v+" vencidas · "+o.s+" esta semana");
 $("#vw-txt").innerHTML=top.txt+'<span class="viewer__meta"><span>'+top.n+" · obra "+top.obra+"</span><span>"+(top.alerta||"")+"</span><span>até "+(top.ate?dm(top.ate):"—")+"</span></span>";
 if(window.gsap&&!reduce)gsap.fromTo("#vw-txt",{opacity:0,y:24},{opacity:1,y:0,duration:.6,ease:"power3.out"})}
$$(".capability").forEach(function(c){var f=function(){pick(+c.dataset.i)};c.addEventListener("mouseenter",f);c.addEventListener("focus",f)});pick(0);

/* caixa */
var P=D.caixa.prev.map(function(v){return v/1000}),W=1200,H=400,mn=Math.min.apply(0,P),mx=Math.max.apply(0,P),pd=20;
var X=function(i){return i*(W/(P.length-1))},Y=function(v){return pd+(mx-v)/(mx-mn)*(H-pd*2)},Z=Y(0),wi=P.indexOf(mn);
var ln=P.map(function(v,i){return(i?"L":"M")+X(i).toFixed(1)+" "+Y(v).toFixed(1)}).join(" "),ar=ln+" L"+W+" "+Z+" L0 "+Z+"Z";
$("#cx").innerHTML='<svg viewBox="0 0 '+W+" "+(H+30)+'" preserveAspectRatio="none"><defs><clipPath id="cu"><rect x="0" y="-10" width="'+W+'" height="'+(Z+10)+'"/></clipPath><clipPath id="cd"><rect x="0" y="'+Z+'" width="'+W+'" height="'+H+'"/></clipPath></defs>'+
 '<path d="'+ar+'" fill="rgba(5,5,6,.08)" clip-path="url(#cu)"/><path d="'+ar+'" fill="rgba(198,47,47,.28)" clip-path="url(#cd)"/>'+
 '<line x1="0" x2="'+W+'" y1="'+Z+'" y2="'+Z+'" stroke="rgba(5,5,6,.45)" stroke-dasharray="3 6" vector-effect="non-scaling-stroke"/>'+
 '<path id="cl" d="'+ln+'" fill="none" stroke="#050506" stroke-width="2" vector-effect="non-scaling-stroke"/>'+
 '<circle r="6" fill="#c62f2f" cx="'+X(wi)+'" cy="'+Y(mn)+'"/>'+
 D.caixa.meses.map(function(m,i){return i%2?"":'<text class="ax" x="'+X(i)+'" y="'+(H+26)+'" text-anchor="'+(i===0?"start":"middle")+'">'+mm(m)+"</text>"}).join("")+"</svg>";
T("#fc-v",cxPior);T("#fc-p","Pior saldo previsto da empresa, em "+cxMes+". A linha mostra o caixa mês a mês; abaixo do tracejado, falta dinheiro.");

/* decisões */
var DEC=D.decisoes.filter(function(d){return d.sit!=="RESOLVIDA"}).slice(0,4);
T("#nf-mark",String(D.decisoes.length).padStart(2,"0"));T("#nf-top",D.decisoes.length+" na pauta · 4 primeiras");
function head(t){var c=t.split(/[,(:]| e /)[0].trim().split(" ");if(c.length>8)c=c.slice(0,7);var h=Math.ceil(c.length/2);return c.slice(0,h).join(" ")+" <i>"+c.slice(h).join(" ")+".</i>"}
$("#nf").innerHTML=DEC.map(function(d,i){return'<article class="no-formula__statement"><small>Decisão '+String(i+1).padStart(2,"0")+" / "+(d.obra?"Obra "+d.obra:"Geral")+" · "+d.dono+" · até "+dm(d.prazo)+"</small><h2>"+head(d.txt)+"</h2><p>"+d.txt+"</p></article>"}).join("");

/* contagem */
function count(el){var c=parseFloat(el.dataset.c),d=+(el.dataset.d||0),p=el.dataset.p||"",s=el.dataset.s||"",o={n:0},f=function(n){var t=n.toLocaleString("pt-BR",{minimumFractionDigits:d,maximumFractionDigits:d});return p+(d===0&&t.length<2?"0"+t:t)+s};
 if(reduce||!window.gsap){el.textContent=f(c);return}gsap.to(o,{n:c,duration:1.4,ease:"power3.out",onUpdate:function(){el.textContent=f(o.n)}})}

/* curvas de nível (hero e menu) */
var mouseX=innerWidth/2,mouseY=innerHeight/2;
function topo(cv,light){var g=cv.getContext("2d"),CS=18,cols,rows,F;function fit(){cv.width=cv.clientWidth;cv.height=cv.clientHeight;cols=Math.ceil(cv.width/CS)+1;rows=Math.ceil(cv.height/CS)+1;F=new Float32Array((cols+1)*(rows+1))}fit();addEventListener("resize",fit);
 var LV=[-1.3,-.95,-.6,-.25,.1,.45,.8,1.15,1.5],last=0;
 function draw(){var now=performance.now();if(now-last<42||!cv.clientWidth)return;if(cv.width!==cv.clientWidth)fit();last=now;var t=now/6000,R=cv.getBoundingClientRect();if(R.bottom<0||R.top>innerHeight)return;var bx=mouseX-R.left,by=mouseY-R.top;
  for(var j=0;j<=rows;j++)for(var i=0;i<=cols;i++){var x=i*CS,y=j*CS,v=Math.sin(x*.0075+t)+Math.sin(y*.011-t*.8)+Math.sin((x+y)*.0052+t*.6)*.9+Math.sin(Math.hypot(x-cv.width*.7,y-cv.height*.4)*.006-t)*.8,dd=Math.hypot(x-bx,y-by);v+=1.9*Math.exp(-dd*dd/57800);F[j*(cols+1)+i]=v}
  g.clearRect(0,0,cv.width,cv.height);
  LV.forEach(function(L,li){g.beginPath();g.strokeStyle=li%3===1?"rgba(157,190,255,.55)":"rgba(241,240,234,.16)";g.lineWidth=li%3===1?1.3:1;
   for(var j=0;j<rows;j++)for(var i=0;i<cols;i++){var a=F[j*(cols+1)+i],b=F[j*(cols+1)+i+1],c=F[(j+1)*(cols+1)+i+1],d=F[(j+1)*(cols+1)+i],id=(a>L?8:0)|(b>L?4:0)|(c>L?2:0)|(d>L?1:0);if(id===0||id===15)continue;
    var x=i*CS,y=j*CS,tp=[x+CS*(L-a)/(b-a),y],rt=[x+CS,y+CS*(L-b)/(c-b)],bt=[x+CS*(L-d)/(c-d),y+CS],lf=[x,y+CS*(L-a)/(d-a)],S;
    switch(id){case 1:case 14:S=[[lf,bt]];break;case 2:case 13:S=[[bt,rt]];break;case 3:case 12:S=[[lf,rt]];break;case 4:case 11:S=[[tp,rt]];break;case 5:S=[[tp,lf],[bt,rt]];break;case 6:case 9:S=[[tp,bt]];break;case 7:case 8:S=[[tp,lf]];break;case 10:S=[[tp,rt],[lf,bt]];break}
    S.forEach(function(s){g.moveTo(s[0][0],s[0][1]);g.lineTo(s[1][0],s[1][1])})}
   g.stroke()})}
 if(reduce){draw();return}(function loop(){draw();requestAnimationFrame(loop)})()}
topo($("#topo"));topo($("#mn-topo"));

/* cursor + revelação do projeto */
var hero=$(".hero__visual"),human=$(".hero__image--human"),cursor=$(".cursor"),ring=$(".cursor-ring"),st=$("[data-state]"),cX=$("[data-x]"),cY=$("[data-y]"),ringX=mouseX,ringY=mouseY;
addEventListener("pointermove",function(e){mouseX=e.clientX;mouseY=e.clientY});
if(!reduce&&fine){(function mv(){ringX+=(mouseX-ringX)*.14;ringY+=(mouseY-ringY)*.14;cursor.style.transform="translate("+mouseX+"px,"+mouseY+"px) translate(-50%,-50%)";ring.style.transform="translate("+ringX+"px,"+ringY+"px) translate(-50%,-50%)";requestAnimationFrame(mv)})();
 $$("a, button, [tabindex], .hero__visual").forEach(function(n){n.addEventListener("mouseenter",function(){ring.classList.add("is-active")});n.addEventListener("mouseleave",function(){ring.classList.remove("is-active")})});
 hero.addEventListener("pointermove",function(e){var b=hero.getBoundingClientRect(),x=(e.clientX-b.left)/b.width*100,y=(e.clientY-b.top)/b.height*100;root.style.setProperty("--mx",x+"%");root.style.setProperty("--my",y+"%");human.style.clipPath="circle(clamp(115px, 12vw, 210px) at "+x+"% "+y+"%)";cX.textContent=x.toFixed(1).padStart(5,"0");cY.textContent=y.toFixed(1).padStart(5,"0");st.textContent="PROJETO"});
 hero.addEventListener("pointerleave",function(){human.style.clipPath="circle(0 at var(--mx) var(--my))";st.textContent="TERRENO"})}

/* menu */
var mb=$(".menu-button"),menu=$(".menu"),open=false;
function toggle(f){open=typeof f==="boolean"?f:!open;mb.setAttribute("aria-expanded",String(open));mb.setAttribute("aria-label",open?"Fechar menu":"Abrir menu");menu.setAttribute("aria-hidden",String(!open));
 gsap.to(menu,{autoAlpha:open?1:0,clipPath:open?"inset(0 0 0% 0)":"inset(0 0 100% 0)",duration:.8,ease:"power4.inOut"});
 gsap.to(".menu__links a",{y:open?0:40,opacity:open?1:0,duration:.6,stagger:.06,delay:open?.3:0,ease:"power3.out"});
 gsap.to(".menu-button span:first-child",{rotate:open?15:0,y:open?3:0,duration:.4});gsap.to(".menu-button span:last-child",{rotate:open?-15:0,y:open?-4:0,width:open?"100%":"68%",duration:.4})}
mb.addEventListener("click",function(){toggle()});$$(".menu a").forEach(function(a){a.addEventListener("click",function(){toggle(false)})});addEventListener("keydown",function(e){if(e.key==="Escape"&&open)toggle(false)});

if(reduce||!window.gsap||!window.ScrollTrigger){$(".preloader").remove();body.classList.remove("loading");$$("[data-c]").forEach(count);$$(".chapter").forEach(function(c){c.style.opacity=1;c.style.position="relative"});$$(".no-formula__statement").forEach(function(s){s.style.opacity=1;s.style.position="relative";s.style.transform="none"});return}
gsap.registerPlugin(ScrollTrigger);

/* abertura */
gsap.to(".global-progress span",{scaleX:1,ease:"none",scrollTrigger:{start:0,end:function(){return ScrollTrigger.maxScroll(window)},scrub:.15}});
gsap.set(".preloader__mark",{scale:.82,opacity:0});var pl={v:0};
gsap.to(pl,{v:100,duration:1.5,ease:"power3.inOut",onUpdate:function(){T(".preloader__percent",String(Math.round(pl.v)).padStart(2,"0"))},onComplete:function(){
 gsap.timeline({onComplete:function(){$(".preloader").remove();body.classList.remove("loading");ScrollTrigger.refresh()}})
 .to(".preloader__mark",{scale:1,opacity:1,duration:.45,ease:"power3.out"}).to(".preloader",{clipPath:"inset(0 0 100% 0)",duration:.9,ease:"power4.inOut"},"+=.12")
 .from(".hero h1",{yPercent:115,opacity:0,duration:1.1,ease:"power4.out"},"-=.55").from(".hero .eyebrow, .hero__sub, .hero__coordinates, .hero__mode",{opacity:0,y:18,duration:.8,stagger:.08},"-=.75")}});
gsap.to(".hero__image, .hero__ghost, .hero__topo",{yPercent:12,scale:1.08,ease:"none",scrollTrigger:{trigger:".hero",start:"top top",end:"bottom top",scrub:true}});
gsap.to(".hero__copy",{yPercent:-22,opacity:0,ease:"none",scrollTrigger:{trigger:".hero",start:"30% top",end:"bottom top",scrub:true}});

/* manifesto + números */
gsap.from(".manifesto__line span",{yPercent:115,rotate:2,duration:1.1,stagger:.12,ease:"power4.out",scrollTrigger:{trigger:".manifesto__statement",start:"top 78%"}});
gsap.from(".manifesto__foot",{opacity:0,x:80,scrollTrigger:{trigger:".manifesto__foot",start:"top 85%",end:"bottom 65%",scrub:true}});
gsap.to(".manifesto__orb",{rotate:90,xPercent:-18,ease:"none",scrollTrigger:{trigger:".manifesto",start:"top bottom",end:"bottom top",scrub:true}});
$$(".metric [data-c]").forEach(function(n){ScrollTrigger.create({trigger:n,start:"top 90%",once:true,onEnter:function(){count(n)}})});

/* obras: capítulos presos */
var ch=$$(".chapter"),N=ch.length,seen=[];
function enter(i){if(seen[i])return;seen[i]=1;$$("[data-c]",ch[i]).forEach(count)}
var ptl=gsap.timeline({scrollTrigger:{trigger:".protocol__stage",start:"top top",end:"+="+(N*105)+"%",pin:true,scrub:1,anticipatePin:1,onEnter:function(){enter(0)},onUpdate:function(s){var i=Math.min(N-1,Math.floor(s.progress*N+.15));for(var k=0;k<=i;k++)enter(k)}}});
ptl.to(".protocol__progress span",{height:(100/N)+"%",duration:1},0);
for(var i=1;i<N;i++){ptl.to(ch[i-1],{opacity:0,scale:.96,duration:.35},i-.3).fromTo(ch[i],{opacity:0,xPercent:8},{opacity:1,xPercent:0,duration:.35},i-.18)
 .fromTo($(".chapter__media",ch[i]),{clipPath:i%2?"inset(0 100% 0 0)":"inset(100% 0 0 0)"},{clipPath:"inset(0% 0% 0% 0%)",duration:.45},i-.22).to(".protocol__progress span",{height:((i+1)/N*100)+"%",duration:1},i)}

/* velocidade */
gsap.to(".velocity__row:first-child",{xPercent:-22,ease:"none",scrollTrigger:{trigger:".velocity",start:"top bottom",end:"bottom top",scrub:true}});
gsap.to(".velocity__row:nth-child(2)",{xPercent:8,ease:"none",scrollTrigger:{trigger:".velocity",start:"top bottom",end:"bottom top",scrub:true}});

/* responsáveis */
gsap.from(".capability",{x:-55,opacity:0,duration:.8,stagger:.09,ease:"power3.out",scrollTrigger:{trigger:".capabilities__list",start:"top 78%"}});

/* caixa */
var cl=$("#cl"),L=cl.getTotalLength();cl.style.strokeDasharray=L;cl.style.strokeDashoffset=L;
if(wide){gsap.timeline({scrollTrigger:{trigger:".field__pin",start:"top top",end:"+=210%",pin:true,scrub:1,anticipatePin:1}})
 .to(".field__image",{clipPath:"inset(0% 0% 0% 0%)",duration:1.2,ease:"none"},0).to(cl,{strokeDashoffset:0,duration:1.3,ease:"none"},.1)
 .to(".field__veil",{opacity:.18,duration:.85},.25).to(".field__title span:first-child",{xPercent:-14,duration:1},0).to(".field__title span:last-child",{xPercent:16,duration:1},0)
 .from(".field__card",{y:90,opacity:0,duration:.4},.75)}
else{gsap.to(".field__image",{clipPath:"inset(0% 0% 0% 0%)",ease:"none",scrollTrigger:{trigger:".field",start:"top bottom",end:"bottom top",scrub:true}});gsap.to(cl,{strokeDashoffset:0,ease:"none",scrollTrigger:{trigger:".field",start:"top 80%",end:"center center",scrub:true}})}

/* decisões presas */
var rf=$$(".no-formula__statement"),M=rf.length;
if(M>1){var rtl=gsap.timeline({scrollTrigger:{trigger:".no-formula__pin",start:"top top",end:"+="+(M*75)+"%",pin:true,scrub:1,anticipatePin:1}});
 rtl.to(".no-formula__rail span",{width:(100/M)+"%",duration:.6},0).to(".no-formula__mark",{rotate:-8,scale:1.03,duration:.7},0);
 for(var j=1;j<M;j++){var t0=j*.8-.08;rtl.to(rf[j-1],{opacity:0,y:-70,duration:.25},t0).fromTo(rf[j],{opacity:0,y:70},{opacity:1,y:0,duration:.3},t0+.1)
  .to(".no-formula__rail span",{width:((j+1)/M*100)+"%",duration:.6},t0).to(".no-formula__mark",{rotate:[5,-4,0][(j-1)%3],scale:[.95,1.07,1][(j-1)%3],duration:.7},t0)}}

/* tese + fim */
gsap.to(".thesis__rings",{scale:1.32,rotate:45,ease:"none",scrollTrigger:{trigger:".thesis",start:"top bottom",end:"bottom top",scrub:true}});
gsap.from(".thesis__copy h2",{opacity:.1,scale:.82,filter:"blur(18px)",ease:"none",scrollTrigger:{trigger:".thesis",start:"top 70%",end:"center 45%",scrub:true}});
gsap.from(".cta h2",{yPercent:60,opacity:0,ease:"none",scrollTrigger:{trigger:".cta",start:"top bottom",end:"center center",scrub:true}});
$$(".magnetic").forEach(function(m){if(!fine)return;m.addEventListener("pointermove",function(e){var r=m.getBoundingClientRect();gsap.to(m,{x:(e.clientX-r.left-r.width/2)*.25,y:(e.clientY-r.top-r.height/2)*.35,duration:.5,ease:"power3.out"})});m.addEventListener("pointerleave",function(){gsap.to(m,{x:0,y:0,duration:.8,ease:"elastic.out(1,.5)"})})});
ScrollTrigger.refresh();
})();
