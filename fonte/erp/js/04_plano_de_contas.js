/* ============ plano de contas ============ */
const MAT_PAC={FOFO:'4.2.01',PVC:'4.2.01',TCONC:'4.2.01',VALV:'4.2.02',PARAF:'4.2.08',ELET:'4.2.05',ELETS:'4.2.05',CONC:'4.2.04',ACO:'4.2.04',FORMA:'4.2.04',IMPER:'4.2.06',BOMBA:'4.2.07',GUIND:'4.2.07',CIVIL:'4.2.03'};
function contaPadrao(nat,pac){if(nat==='MO')return '4.1.01';if(nat==='EQP')return '4.3.01';if(nat==='TER')return '4.4.01';
  if(nat==='ADM')return pac==='CANT'?'4.5.02':pac==='PROJ'?'4.5.06':'4.5.01';return MAT_PAC[pac]||'4.2.08'}
const NATNOME={MO:'Mão de obra',MAT:'Material e equipamento',EQP:'Máquinas e veículos',TER:'Terceiros',ADM:'Indireto da obra'};
const nomeConta=c=>(S.D.plano||[]).find(x=>x.codigo===c)?.nome||c;
