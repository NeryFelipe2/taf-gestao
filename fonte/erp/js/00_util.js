/* ============ util ============ */
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const brl=(v,c=false)=>{v=+v||0;return c&&Math.abs(v)>=1e6?'R$ '+(v/1e6).toFixed(2).replace('.',',')+' mi':c&&Math.abs(v)>=1e3?'R$ '+Math.round(v/1e3).toLocaleString('pt-BR')+' mil':v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})};
/* [integração] valor que pode estar vazio (meta e teto de obra nova): vazio não é zero */
const brlOu=(v,vazio='—')=>v==null||v===''?vazio:brl(v);
const num=v=>(+v||0).toLocaleString('pt-BR',{maximumFractionDigits:2});
const r2=v=>Math.round((+v||0)*100)/100;
const hojeISO=()=>new Date().toISOString().slice(0,10);
const diasAte=s=>s?Math.round((new Date(s+'T00:00:00')-new Date(hojeISO()+'T00:00:00'))/864e5):null;
const fdata=s=>s?s.split('-').reverse().join('/'):'—';
const ico=n=>`<svg class="ic" viewBox="0 0 24 24">${ICON[n]||''}</svg>`;
const ICON={campo:'<path d="M3 21h18M5 21V10l7-6 7 6v11M10 21v-6h4v6"/>',lean:'<path d="M4 6h16M4 12h16M4 18h10M17 17l2 2 3-4"/>',hoje:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 eap:'<path d="M4 6h16M4 12h10M4 18h6"/>',pac:'<path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8"/>',
 compras:'<path d="M5 6h15l-1.5 9h-12zM5 6L4 3H2M9 20a1 1 0 1 0 0 .01M17 20a1 1 0 1 0 0 .01"/>',
 nota:'<path d="M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6"/>',pain:'<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',fin:'<path d="M3 7h18v12H3zM3 11h18M7 15h3"/>',med:'<path d="M3 17l5-5 4 4 8-9"/>',plano:'<path d="M4 5h16M4 10h12M4 15h8M4 20h4"/>',aud:'<path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/><path d="M9 12l2 2 4-4"/>'};

const ACOES={};/* ações registradas pelos módulos novos (Fase 13+) */

/* memo por ciclo de render: dentro de render() repete o resultado de cálculos caros; fora dele sempre recalcula (testes e ações veem dados novos) */
const memo=(k,f)=>{const M=typeof S!=='undefined'&&S&&S.memo;if(!M)return f();return k in M?M[k]:(M[k]=f())};
