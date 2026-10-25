'use strict';
/* PROVA (gravações): com as chaves novas desligadas, a mesma sequência de ações na tela (solicitar, cotar, emitir a OC, aprovar ou reprovar, receber, lançar e ratear a nota,
   conferir, liberar, nota sem pedido) deixa os documentos, a auditoria e as mensagens EXATAMENTE como no ERP de partida (commit 243d676). O que muda de um lado para o outro
   são só os ids e as horas, que o teste tira. Cenários aleatórios e fictícios; nada de rede, banco ou chave. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { carrega, abre } = require('./ambiente');
const { cenario, rng } = require('./gerador');
const { limpa } = require('./instantaneo');

const base = carrega('base'), novo = carrega('trabalho');
const J = x => JSON.parse(JSON.stringify(x));

/* o que importa do estado depois das ações, sem ids nem horas (os ids vêm de Date.now() e sorteio) */
function foto(S) {
  const t = J(S.t), tira = (L, ks) => L.map(x => { ks.forEach(k => delete x[k]); return x; });
  return limpa({
    sols: tira(t.sols, ['id']), ocs: tira(t.ocs, ['id', 'sol']), notas: tira(t.notas, ['id', 'oc']),
    titulos: tira(t.titulos, ['id', 'oc']), aud: tira(t.aud, ['id', 'q']), par: t.par, hist: t.hist.map(h => ({ ...h, quando: undefined })),
  });
}

/* plano da sequência: tudo sorteado só pela semente, para os dois ERPs receberem as mesmas ordens */
function plano(seed, itens) {
  const R = rng(seed * 104729 + 17), pick = a => a[Math.floor(R() * a.length)];
  return {
    item: pick(itens), fator: pick([0.2, 0.6, 0.95, 1.05, 1.4, 3]), qtd: pick([1, 2, 5]), cots: pick([1, 2, 3]), escolhe: 0, justifica: R() < 0.6, emergencia: R() < 0.15,
    aprovador: pick(['gerente', 'diretoria']), decide: R() < 0.7, recebe: pick([0, 0.5, 1]), nfFracao: pick([1, 0.5]), conferir: R() < 0.8,
    nfSemPedido: R() < 0.5, nfSemPedidoItem: pick(itens), nfSemPedidoValor: pick([50, 5000, 150000, 300000]), segundoItem: pick(itens),
  };
}

function roda(api, cen, pl) {
  const S = abre(api, cen.D, { ...cen.t, frozen: true }, 'engenheiro'); api.derive(); api.limpaMsgs();
  const i = S.byCod[pl.item], total = (i.meta_total || 1000) * pl.fator, pu = Math.round(total / pl.qtd * 100) / 100;
  /* 1. solicitação */
  api.el('#s-item').value = i.codigo; api.el('#s-nat').value = i.nat; api.el('#s-qtd').value = String(pl.qtd); api.el('#s-pu').value = String(pu);
  api.el('#s-desc').value = 'Compra fictícia'; api.el('#s-dt').value = '2030-02-01'; api.el('#s-mot').value = 'teste'; api.el('#s-ins').value = '';
  api.doSol();
  const sol = S.t.sols[0]; if (!sol) return foto(S) && { foto: foto(S), msgs: api.msgs() };
  /* 2. cotações e OC */
  for (let k = 0; k < pl.cots; k++) {
    api.el('#c-f').value = 'FORN ' + k; api.el('#c-p').value = String(Math.round(pu * (1 + k * 0.05) * 100) / 100 || 1); api.el('#c-z').value = '10'; api.el('#c-j').value = pl.justifica ? 'justificativa' : '';
    api.addCot(sol.id);
  }
  api.el('input[name=esc]:checked').value = String(pl.escolhe); api.el('#c-em').checked = pl.emergencia; api.el('#c-j').value = pl.justifica ? 'justificativa' : '';
  api.emitirOC(sol.id);
  const oc = S.t.ocs[0]; if (!oc) return { foto: foto(S), msgs: api.msgs() };
  /* 3. aprovação */
  if (oc.status === 'em_alcada') {
    S.role = pl.aprovador;
    if (pl.decide) api.decidir(oc.id, true);
    else { api.decidir(oc.id, false); if (api.can_aprovar(oc)) { api.el('#ask-v').value = 'motivo de teste'; api.clicar('ask-ok'); } }
  }
  /* 4. recebimento */
  if (['aprovada', 'recebida_parcial'].includes(oc.status) && pl.recebe > 0) { S.role = 'almox'; api.el('#rc-q').value = String(oc.qtd * pl.recebe); api.doReceber(oc.id); }
  /* 5. nota com pedido: rateio sugerido pelo pedido */
  if (['aprovada', 'recebida_parcial', 'recebida'].includes(oc.status)) {
    S.role = 'adm'; api.modalNF(); const v = Math.round(oc.valor * pl.nfFracao * 100) / 100;
    api.el('#n-e').value = oc.forn; api.el('#n-c').value = 'NF-X'; api.el('#n-v').value = String(v); api.el('#n-d').value = '2030-02-10'; api.el('#n-o').value = oc.id;
    api.NF.oc = oc.id; api.NF.valor = v; api.NF.rateio = [{ item: oc.item, valor: v }]; api.doNF('rateada');
    const n = S.t.notas[0];
    if (n && pl.conferir) { S.role = 'financeiro'; api.conferir(n.id); if (n.status === 'conferida') api.liberar(n.id); }
  }
  /* 6. nota sem pedido */
  if (pl.nfSemPedido) {
    S.role = 'adm'; api.modalNF(); const v = pl.nfSemPedidoValor;
    api.el('#n-e').value = 'EMITENTE SEM PEDIDO'; api.el('#n-c').value = 'NF-Y'; api.el('#n-v').value = String(v); api.el('#n-d').value = '2030-02-11'; api.el('#n-o').value = ''; api.el('#n-j').value = 'sem pedido de teste';
    api.NF.oc = ''; api.NF.valor = v; api.NF.rateio = [{ item: pl.nfSemPedidoItem, valor: v }]; api.doNF('rateada');
  }
  api.derive();
  return { foto: foto(S), msgs: api.msgs() };
}

for (const flags of [{}, { oc_linhas: false, ev_ctrl: false }]) {
  test(`150 sequências de ações (solicitar, cotar, OC, aprovar, receber, nota, conferir, liberar): chaves novas desligadas dão o mesmo resultado do ERP de partida ${Object.keys(flags).length ? '(chaves escritas como false)' : '(chaves ausentes)'}`, () => {
    let comOC = 0, comNota = 0, aprovadas = 0, reprovadas = 0, msgsDistintas = new Set(), cores = new Set();
    for (let seed = 1; seed <= 150; seed++) {
      const cen = cenario(seed, seed % 5 === 0 ? { eventos: false } : {}); cen.t.ocs = []; cen.t.notas = [];   /* parte de uma obra limpa: as ações criam tudo */
      Object.assign(cen.t.par, flags);
      const itens = cen.D.eap.filter(e => e.tipo_linha === 'item').map(e => e.codigo), pl = plano(seed, itens);
      const a = roda(base, J(cen), pl), b = roda(novo, J(cen), pl);
      assert.deepEqual(b.msgs, a.msgs, 'mensagens da semente ' + seed);
      assert.deepEqual(b.foto, a.foto, 'estado final da semente ' + seed);
      if (a.foto.ocs.length) comOC++; if (a.foto.notas.length) comNota++;
      a.foto.ocs.forEach(o => { if (o.status === 'reprovada') reprovadas++; if (['aprovada', 'recebida', 'recebida_parcial'].includes(o.status)) aprovadas++; });
      a.msgs.forEach(m => msgsDistintas.add(m.replace(/[0-9A-Z-]{6,}/g, '#')));
      a.foto.sols.forEach(x => cores.add(x.sem));
    }
    assert.ok(comOC > 50 && comNota > 50 && aprovadas > 20 && reprovadas > 2, `o teste exercita o caminho todo (OC ${comOC}, nota ${comNota}, aprovadas ${aprovadas}, reprovadas ${reprovadas})`);
    assert.deepEqual([...cores].sort(), ['amarelo', 'verde', 'vermelho'], 'as três cores do semáforo apareceram nas solicitações');
    assert.ok(msgsDistintas.size > 8, 'várias mensagens diferentes foram comparadas (' + msgsDistintas.size + ')');
  });
}
