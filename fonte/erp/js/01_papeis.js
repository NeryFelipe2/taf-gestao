/* ============ papéis ============ */
const ROLES={gestao:{n:'Gestão da carteira',u:'Felipe'},diretoria:{n:'Diretoria',u:'Thadeu'},gerente:{n:'Gerente de contrato',u:'Gerente'},
 engenheiro:{n:'Engenheiro residente',u:'Marko Aurélio'},compras:{n:'Compras e suprimentos',u:'Compras'},almox:{n:'Almoxarife',u:'Almoxarife'},
 adm:{n:'Administrativo de obra',u:'Administrativo'},financeiro:{n:'Financeiro',u:'Financeiro'},
 encarregado:{n:'Encarregado de campo',u:'Encarregado'},planejamento:{n:'Planejamento',u:'Planejamento'},
 admin:{n:'Administrador',u:'Administrador'},pendente:{n:'Aguardando liberação',u:'Novo usuário'}};
const PAPEIS_ATRIBUIVEIS=['admin','gestao','diretoria','gerente','engenheiro','compras','almox','adm','financeiro','encarregado','planejamento','pendente'];
const CAN={congelar:['gestao','diretoria'],solicitar:['engenheiro','gerente'],cotar:['compras'],receber:['almox','engenheiro'],
 nota:['adm','engenheiro'],liberar:['financeiro'],remanejar:['gerente','diretoria'],medir:['engenheiro','gerente'],atestar:['gerente','diretoria'],param:['diretoria','gestao'],apontar:['encarregado','engenheiro','gerente'],aprovarApt:['engenheiro','gerente'],lean:['engenheiro','gerente','planejamento','encarregado','compras','diretoria'],bc:['gerente','engenheiro','diretoria'],faturar:['financeiro','adm','gerente','diretoria'],recFat:['financeiro','adm','diretoria'],lan:['financeiro','diretoria'],cadastro:['compras','adm','financeiro','gerente','diretoria','gestao','almox'],cadastroBanco:['financeiro','adm','diretoria','gestao']};
CAN.rastro=['engenheiro','gerente','planejamento','compras','diretoria','gestao'];
const extras=()=>typeof papeisExtras==='function'?papeisExtras():[];
const isRole=(...r)=>r.includes(S.role)||S.role==='admin'||extras().some(x=>r.includes(x));
const can=a=>S.role==='admin'||(!(typeof horarioBloqueado==='function'&&horarioBloqueado())&&(CAN[a].includes(S.role)||extras().some(x=>CAN[a].includes(x))));
const user=()=>(MODO_SB&&SB.perfil)?SB.perfil.nome:ROLES[S.role].u;

