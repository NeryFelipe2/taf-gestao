'use strict';
/* M4: limite em três níveis (item, pacote, evento) para toda saída de dinheiro (solicitação, OC e nota sem pedido), atrás da chave par.ev_ctrl (padrão desligada).
   Cenários (a) a (e) do plano 00-MATRIZ-E-PLANO.md, seção M4, mais as decisões D2, D4, D6, D7 e E3. Tudo fictício (OBRA 999 e cenários aleatórios). Nada de rede, banco ou chave. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { carrega, abre } = require('./ambiente');
const { cenario, comLinhas, rng } = require('./gerador');
const { obra999, it, gr, oc } = require('./obra999');
const { solicita, emite, lancaNota } = require('./acoes');

const api = carrega('trabalho');
const J = x => JSON.parse(JSON.stringify(x));
const perto = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.005, `${msg}: ${a} x ${b}`);
const SEV = { verde: 0, amarelo: 1, vermelho: 2, bloqueado: 3 };
const hoje = () => api.hojeISO();

/* obra fictícia com um cantinho para cada cenário. Cada grupo de itens vive num evento e num pacote próprios para um cenário não mexer no outro. */
function obraCtrl() {
  const D = obra999();
  D.eap = [
    gr('1', 'Cenário (c) e (e)'), it('1.1', 'C1: item do cenário (fictício)', 'EC', 'PC', 2000, 1000, 1100), it('1.2', 'C2: item grande do mesmo evento e pacote', 'EC', 'PC', 200000, 100000, 110000),
    gr('2', 'Cenário (a)'), it('2.1', 'X1: item (fictício)', '9.1.1', 'PX1', 2000, 1000, 1200), it('2.2', 'X2: outro item do mesmo evento', '9.1.1', 'PX2', 2000, 1000, 1200),
    gr('3', 'Cenário (b)'), it('3.1', 'Z1: item (fictício)', 'E-Z1', 'PZ', 2000, 1000, 1100), it('3.2', 'Z2: outro item do mesmo pacote', 'E-Z2', 'PZ', 2000, 1000, 1100),
    it('3.3', 'ZB1: item grande no evento de Z1', 'E-Z1', 'PW', 200000, 100000, 110000), it('3.4', 'ZB2: item grande no evento de Z2', 'E-Z2', 'PW', 200000, 100000, 110000),
    gr('5', 'Cenário (d)'), it('5.1', 'D1: item (fictício)', 'ED', 'PD', 2000, 1000, 1100), it('5.2', 'D2: item grande do mesmo evento e pacote', 'ED', 'PD', 200000, 100000, 110000),
    it('5.3', 'N1: item sem meta (fictício)', 'EN', 'PD', 1000, null, null),
    gr('6', 'E3'), it('6.1', 'E3: meta acima do limite (fictício)', 'EE', 'PE', 2000, 1000, 900), it('6.2', 'E3: item grande do mesmo evento', 'EE', 'PG', 200000, 100000, 110000),
    gr('7', 'D2'), it('7.1', 'S1: item grande (fictício)', 'ES1', 'PS', 3000000, 1000000, 1100000), it('7.2', 'S2: outro item grande do mesmo pacote', 'ES2', 'PS', 3000000, 1000000, 1100000),
    it('7.3', 'S3: item grande de outro pacote', 'ES3', 'PT', 3000000, 1000000, 1100000),
  ];
  D.pacotes = ['PC', 'PX1', 'PX2', 'PZ', 'PW', 'PD', 'PE', 'PG', 'PS', 'PT'].map(c => ({ codigo: c, nome: 'Pacote ' + c + ' (fictício)', meta: 1, teto: 1, fechar_ate: '2031-01-10', precisa_em_obra: '2031-02-01', responsavel: 'Engenheiro 999', condicao_pagamento: '30 dias', observacoes: '' }));
  return D;
}
const est = (par, ocs = [], notas = []) => ({ frozen: true, par: { tol: 0.02, limite: 100000, ...par }, ocs, notas });
const pend = (num, item, valor, extra = {}) => oc(num, item, valor, 'em_alcada', { alcada: 'gerente', sem: 'verde', criado: hoje(), solicitante: 'Marko Aurélio', solicitanteId: 'papel:engenheiro', ...extra });
const nivel = (r, n) => (r[3] || []).filter(x => x.nivel === n).map(x => x.cor);

/* ============ (a) item verde, evento sem saldo, resultado amarelo ============ */
test('(a) item verde e evento sem saldo: a cor é amarela e diz que é o evento; com a chave desligada continua verde', () => {
  for (const ec of [false, true]) {
    const S = abre(api, obraCtrl(), est({ ev_ctrl: ec }, [oc('OC-9001', '2.2', 1900)]), 'engenheiro'); api.derive();
    const r = J(api.semaforo('2.1', 500));
    if (!ec) { assert.equal(r[0], 'verde', 'desligada: só olha o item'); assert.equal(r.length, 3); continue; }
    assert.equal(r[0], 'amarelo'); assert.match(r[1], /Evento 9\.1\.1: acima da meta, até o limite/);
    assert.deepEqual([nivel(r, 'item'), nivel(r, 'pacote'), nivel(r, 'evento')], [['verde'], ['verde'], ['amarelo']], 'item verde, pacote verde, evento amarelo');
    /* a mesma conta na solicitação e na OC: nasce amarela, pede justificativa e vai ao Gerente */
    const sol = solicita(api, [{ item: '2.1', qtd: 1, pu: 500 }]); assert.ok(sol); assert.equal(sol.sem, 'amarelo');
    const o = emite(api, sol, 500); assert.equal(o.sem, 'amarelo'); assert.equal(o.status, 'em_alcada'); assert.equal(o.alcada, 'gerente');
  }
});

/* ============ (b) pacote acima do teto: vermelho e vai à Diretoria ============ */
test('(b) pacote acima do limite: vermelho, vai à Diretoria e o Gerente não aprova', () => {
  const S = abre(api, obraCtrl(), est({ ev_ctrl: true }, [oc('OC-9001', '3.2', 1500)]), 'engenheiro'); api.derive();
  const r = J(api.semaforo('3.1', 800));
  assert.equal(r[0], 'vermelho'); assert.match(r[1], /Pacote PZ: acima do limite/);
  assert.deepEqual([nivel(r, 'item'), nivel(r, 'pacote'), nivel(r, 'evento')], [['verde'], ['vermelho'], ['verde']]);
  abre(api, obraCtrl(), est({ ev_ctrl: false }, [oc('OC-9001', '3.2', 1500)]), 'engenheiro'); api.derive(); assert.equal(api.semaforo('3.1', 800)[0], 'verde', 'desligada: o item sozinho cabe');
  abre(api, obraCtrl(), est({ ev_ctrl: true }, [oc('OC-9001', '3.2', 1500)]), 'engenheiro'); api.derive();
  const sol = solicita(api, [{ item: '3.1', qtd: 1, pu: 800 }]); assert.equal(sol.sem, 'vermelho');
  const o = emite(api, sol, 800); assert.equal(o.sem, 'vermelho'); assert.equal(o.status, 'em_alcada'); assert.equal(o.alcada, 'diretoria');
  api.S.role = 'gerente'; api.limpaMsgs(); api.decidir(o.id, true);
  assert.equal(o.status, 'em_alcada', 'o Gerente não aprova vermelho'); assert.match(api.msgs().join('|'), /só a Diretoria aprova/);
  api.S.role = 'diretoria'; api.decidir(o.id, true); assert.equal(o.status, 'aprovada');
});

test('(b) sem sinal de estouro o pacote não muda a cor; pacote e evento de compra pequena ficam verdes', () => {
  abre(api, obraCtrl(), est({ ev_ctrl: true }), 'engenheiro'); api.derive();
  const r = J(api.semaforo('3.1', 800)); assert.equal(r[0], 'verde'); assert.deepEqual([nivel(r, 'pacote'), nivel(r, 'evento')], [['verde'], ['verde']]);
  assert.equal(r[3].length, 3, 'item, pacote e evento');
});

/* ============ (c) duas OCs pendentes no mesmo item: ao aprovar a segunda, ela recalcula e muda de cor ============ */
test('(c) duas OCs verdes aguardando aprovação no mesmo item: a segunda, ao ser aprovada, recalcula e vira vermelha (quem vem depois não passa)', () => {
  const S = abre(api, obraCtrl(), est({ ev_ctrl: true, limite: 300 }, [pend('OC-9002', '1.1', 600), pend('OC-9001', '1.1', 600)]), 'gerente'); api.derive();
  const [o2, o1] = [S.t.ocs.find(o => o.num === 'OC-9002'), S.t.ocs.find(o => o.num === 'OC-9001')];
  /* os dois reservam saldo: 1.200 reservados de um item de meta 1.000 */
  perto(S.sd['1.1'].res, 1200, 'reservado'); perto(S.sd['1.1'].comp, 0, 'ainda nada comprometido');
  api.limpaMsgs(); api.decidir(o1.id, true);
  assert.equal(o1.status, 'aprovada', 'a primeira (mais antiga) passa: o saldo é dela'); assert.equal(o1.sem, 'verde');
  api.derive(); perto(S.sd['1.1'].comp, 600, 'primeira comprometida'); perto(S.sd['1.1'].res, 600, 'segunda ainda reserva');
  api.limpaMsgs(); api.decidir(o2.id, true);
  assert.equal(o2.status, 'em_alcada', 'a segunda NÃO é aprovada pelo Gerente'); assert.equal(o2.sem, 'vermelho', 'a cor foi recalculada'); assert.equal(o2.alcada, 'diretoria');
  assert.match(api.msgs().join('|'), /agora é vermelho \(era verde\)/);
  assert.ok(S.t.aud.some(a => a.ref === 'OC-9002' && a.campo === 'semáforo' && a.motivo === 'recalculado na aprovação' && /verde/.test(a.antes) && /vermelho/.test(a.depois)), 'o antes e o depois ficam na auditoria');
  S.role = 'diretoria'; api.decidir(o2.id, true); assert.equal(o2.status, 'aprovada', 'a Diretoria aprova o vermelho');
});

test('(c) aprovar a segunda ANTES da primeira também a recalcula (a primeira reserva o saldo); a primeira segue aprovável', () => {
  const S = abre(api, obraCtrl(), est({ ev_ctrl: true, limite: 300 }, [pend('OC-9002', '1.1', 600), pend('OC-9001', '1.1', 600)]), 'gerente'); api.derive();
  const [o2, o1] = [S.t.ocs.find(o => o.num === 'OC-9002'), S.t.ocs.find(o => o.num === 'OC-9001')];
  api.decidir(o2.id, true); assert.equal(o2.status, 'em_alcada'); assert.equal(o2.sem, 'vermelho');
  assert.equal(o1.sem, 'verde', 'a primeira não muda de cor por causa da segunda'); api.derive(); api.decidir(o1.id, true); assert.equal(o1.status, 'aprovada');
});

test('(c) contraste: com a chave desligada a segunda é aprovada e o item passa do teto (o que o plano chama de achado A4)', () => {
  const S = abre(api, obraCtrl(), est({ limite: 300 }, [pend('OC-9002', '1.1', 600), pend('OC-9001', '1.1', 600)]), 'gerente'); api.derive();
  S.t.ocs.forEach(o => api.decidir(o.id, true)); api.derive();
  assert.deepEqual(S.t.ocs.map(o => o.status), ['aprovada', 'aprovada']); perto(S.sd['1.1'].comp, 1200, 'item comprometido acima do teto 1.100'); assert.equal(S.sd['1.1'].res, undefined);
});

test('(c) reserva já na emissão: com um pedido de 600 aguardando aprovação, outro de 600 no mesmo item já nasce vermelho (desligada: verde; reserva desligada: verde)', () => {
  const sai = par => { abre(api, obraCtrl(), est({ limite: 300, ...par }, [pend('OC-9001', '1.1', 600)]), 'engenheiro'); api.derive(); return api.semaforo('1.1', 600)[0]; };
  assert.equal(sai({ ev_ctrl: true }), 'vermelho'); assert.equal(sai({}), 'verde'); assert.equal(sai({ ev_ctrl: true, ev: { reservaEmAlcada: false } }), 'verde');
  assert.match(api.ctxItem('1.1'), /saldo livre do item/);
  abre(api, obraCtrl(), est({ ev_ctrl: true, limite: 300 }, [pend('OC-9001', '1.1', 600)]), 'engenheiro'); api.derive();
  assert.match(api.ctxItem('1.1'), /já descontados <b>R\$\s*600,00<\/b> reservados/); assert.match(api.ctxItem('1.1'), /saldo livre do item <b class="">R\$\s*400,00/);
});

/* ============ (d) nota sem pedido acima do saldo pede alçada ============ */
test('(d) nota sem pedido acima do saldo: passa pelo mesmo semáforo, pede o Gerente, não segue para conferir até ser aprovada', () => {
  const S = abre(api, obraCtrl(), est({ ev_ctrl: true }), 'adm'); let X = api.derive();
  const n = lancaNota(api, null, 1050, [{ item: '5.1', valor: 1050 }]);
  assert.ok(n, 'nota gravada'); assert.equal(n.sem, 'amarelo'); assert.equal(n.alcada, 'gerente'); assert.equal(n.aprov, 'pendente'); assert.equal(n.solicitanteId, 'papel:adm');
  X = api.derive(); assert.equal(X.pendNotas.length, 1); assert.ok(api.alertas(X).some(a => /NF-0001 \(nota sem pedido\) aguarda Gerente de contrato/.test(a[1])));
  perto(S.sd['5.1'].real, 1050, 'a nota já é custo realizado, mesmo aguardando');
  S.role = 'financeiro'; api.limpaMsgs(); api.conferir(n.id); assert.equal(n.status, 'rateada'); assert.match(api.msgs().join('|'), /aguarda aprovação \(Gerente de contrato\) antes de conferir/);
  api.liberar(n.id); assert.equal(n.status, 'rateada');
  S.role = 'adm'; assert.equal(api.can_aprovar(n), false, 'quem lançou não aprova');
  S.role = 'gerente'; api.decidir(n.id, true);
  assert.equal(n.aprov, 'aprovada', 'o Gerente aprova'); assert.ok(!S.t.aud.some(a => a.ref === n.num && a.campo === 'semáforo'), 'a própria nota não conta contra si: nada foi recalculado');
  S.role = 'financeiro'; api.conferir(n.id); assert.equal(n.status, 'conferida');
});

test('(d) nota sem pedido: vermelho vai à Diretoria; dentro do saldo e do limite não pede nada; verde acima do limite pede o Gerente; item sem meta não grava', () => {
  const S = abre(api, obraCtrl(), est({ ev_ctrl: true, limite: 100 }), 'adm'); api.derive();
  const dentro = lancaNota(api, null, 50, [{ item: '5.1', valor: 50 }]); assert.equal(dentro.sem, 'verde'); assert.equal(dentro.alcada, null); assert.equal(dentro.aprov, '');
  api.derive(); const verdeAlto = lancaNota(api, null, 200, [{ item: '5.1', valor: 200 }]); assert.equal(verdeAlto.sem, 'verde'); assert.equal(verdeAlto.alcada, 'gerente', 'verde acima de R$ 100 (limite desta obra de teste) pede o Gerente');
  api.derive(); const verm = lancaNota(api, null, 1500, [{ item: '5.1', valor: 1500 }]); assert.equal(verm.sem, 'vermelho'); assert.equal(verm.alcada, 'diretoria'); assert.equal(verm.aprov, 'pendente');
  api.derive(); api.limpaMsgs(); const sem = lancaNota(api, null, 300, [{ item: '5.3', valor: 300 }]);
  assert.equal(sem, null, 'item sem meta: bloqueado, nada grava'); assert.match(api.msgs().join('|'), /Item sem meta de custo/);
  S.role = 'gerente'; assert.equal(api.can_aprovar(verm), false, 'o Gerente não aprova vermelho');
});

test('(d) nota reprovada na alçada volta para a fila sem rateio, com o rateio recusado guardado, e deixa de contar como realizada', () => {
  const S = abre(api, obraCtrl(), est({ ev_ctrl: true }), 'adm'); api.derive();
  const n = lancaNota(api, null, 1050, [{ item: '5.1', valor: 1050 }]); api.derive(); perto(S.sd['5.1'].real, 1050, 'conta enquanto aguarda');
  S.role = 'gerente'; api.decidir(n.id, false); api.el('#ask-v').value = 'não era para este item'; api.clicar('ask-ok');
  assert.equal(n.status, 'lancada'); assert.equal(n.aprov, 'reprovada'); assert.equal(n.rateio.length, 0); assert.equal(n.rateioRecusado.length, 1); assert.equal(n.motivoAlcada, 'não era para este item');
  api.derive(); perto(S.sd['5.1'].real, 0, 'voltou para a fila: não é custo'); assert.equal(api.derive().semRateio.length, 1);
});

test('(d) chave desligada: a mesma nota sem pedido não ganha semáforo nem alçada (como sempre)', () => {
  const S = abre(api, obraCtrl(), est({}), 'adm'); api.derive();
  const n = lancaNota(api, null, 1500, [{ item: '5.1', valor: 1500 }]); assert.ok(n);
  assert.equal(n.sem, undefined); assert.equal(n.alcada, undefined); assert.equal(n.aprov, undefined); assert.equal(api.derive().pendNotas, undefined);
  S.role = 'financeiro'; api.conferir(n.id); assert.equal(n.status, 'conferida');
});

/* ============ (e) quem solicitou tenta aprovar: bloqueado, por usuário e não por nome ============ */
test('(e) quem solicitou tenta aprovar o próprio pedido: bloqueado, com o motivo na tela', () => {
  const S = abre(api, obraCtrl(), est({ ev_ctrl: true }), 'gerente'); api.derive();
  const sol = solicita(api, [{ item: '1.1', qtd: 1, pu: 1050 }]); assert.equal(sol.solicitanteId, 'papel:gerente');
  const o = emite(api, sol, 1050); assert.equal(o.status, 'em_alcada'); assert.equal(o.solicitanteId, 'papel:gerente');
  assert.equal(api.can_aprovar(o), false); api.limpaMsgs(); api.decidir(o.id, true);
  assert.equal(o.status, 'em_alcada'); assert.match(api.msgs().join('|'), /Quem solicitou não aprova/);
  S.role = 'diretoria'; assert.equal(api.can_aprovar(o), true, 'outro usuário (Diretoria) pode'); api.decidir(o.id, true); assert.equal(o.status, 'aprovada'); assert.equal(o.aprovadorId, 'papel:diretoria');
});

test('(e) por usuário e não por nome: mesmo usuário com o nome escrito diferente é bloqueado; nome igual de outro usuário não é', () => {
  const SB = api.SB; SB.perfil = { nome: 'Marko Aurelio', papel: 'gerente', fixo: true, uid: 'pessoa:marko aurelio' };
  try {
    for (const ec of [false, true]) {
      const S = abre(api, obraCtrl(), est({ ev_ctrl: ec }, [pend('OC-9001', '1.1', 600, { solicitante: 'Marko Aurélio', solicitanteId: 'pessoa:marko aurelio' })]), 'gerente'); api.derive();
      assert.equal(api.can_aprovar(S.t.ocs[0]), !ec, 'mesmo usuário (nome com acento): ' + (ec ? 'bloqueado' : 'a chave desligada compara nome e deixa passar'));
    }
    for (const ec of [false, true]) {   /* o nome é igual ao do usuário (Gerente), mas é outra pessoa */
      SB.perfil = { nome: 'Gerente', papel: 'gerente', fixo: true, uid: 'pessoa:beltrano' };
      const S = abre(api, obraCtrl(), est({ ev_ctrl: ec }, [pend('OC-9001', '1.1', 600, { solicitante: 'Gerente', solicitanteId: 'pessoa:fulano' })]), 'gerente'); api.derive();
      assert.equal(api.can_aprovar(S.t.ocs[0]), ec, 'outro usuário com o mesmo nome: ' + (ec ? 'pode aprovar' : 'a chave desligada bloqueia pelo nome'));
    }
    /* documento antigo, sem identidade: compara o nome sem acento nem caixa */
    SB.perfil = null;
    for (const ec of [false, true]) {
      const S = abre(api, obraCtrl(), est({ ev_ctrl: ec }, [pend('OC-9001', '1.1', 600, { solicitante: 'GERENTE', solicitanteId: undefined })]), 'gerente'); api.derive();
      assert.equal(api.can_aprovar(S.t.ocs[0]), !ec, 'documento antigo: ' + (ec ? 'nome igual sem caixa bloqueia' : 'comparação exata deixa passar'));
    }
  } finally { SB.perfil = null; }
});

test('(e) aprovar exige chave pessoal: com a chave geral do site (nome digitado) ninguém aprova; o parâmetro da obra pode soltar', () => {
  const SB = api.SB;
  try {
    SB.perfil = { nome: 'Digitado', papel: 'gerente', fixo: false, uid: 'nome:digitado' };
    const S = abre(api, obraCtrl(), est({ ev_ctrl: true }, [pend('OC-9001', '1.1', 600)]), 'gerente'); api.derive();
    assert.equal(api.can_aprovar(S.t.ocs[0]), false); api.limpaMsgs(); api.decidir(S.t.ocs[0].id, true); assert.match(api.msgs().join('|'), /Aprovar exige a chave pessoal/);
    S.t.par.ev = { aprovaExigeChavePessoal: false }; assert.equal(api.can_aprovar(S.t.ocs[0]), true);
    SB.perfil = { nome: 'Pessoa', papel: 'gerente', fixo: true, uid: 'pessoa:pessoa' };
    S.t.par.ev = {}; assert.equal(api.can_aprovar(S.t.ocs[0]), true, 'chave pessoal aprova');
    /* chave desligada: nada disso vale */
    SB.perfil = { nome: 'Digitado', papel: 'gerente', fixo: false, uid: 'nome:digitado' };
    const S2 = abre(api, obraCtrl(), est({}, [pend('OC-9001', '1.1', 600)]), 'gerente'); api.derive(); assert.equal(api.can_aprovar(S2.t.ocs[0]), true);
  } finally { SB.perfil = null; }
});

/* ============ D2: pedidos verdes do mesmo pacote no mesmo dia somam para a alçada ============ */
test('D2: três pedidos verdes de R$ 40.000 no mesmo pacote e no mesmo dia: o terceiro passa de R$ 100.000 somado e pede o Gerente', () => {
  const sai = (par, extra = {}) => {
    const S = abre(api, obraCtrl(), est(par), 'engenheiro'); api.derive(); const st = [];
    [['7.1', 40000], ['7.2', 40000], ['7.1', 40000]].forEach(([item, v]) => { const sol = solicita(api, [{ item, qtd: 1, pu: v }]); const o = emite(api, sol, v); st.push(o.status + (o.alcada ? ':' + o.alcada : '')); api.derive(); });
    return st;
  };
  assert.deepEqual(sai({ ev_ctrl: true }), ['aprovada', 'aprovada', 'em_alcada:gerente'], 'o terceiro soma 120.000 no pacote PS');
  assert.deepEqual(sai({}), ['aprovada', 'aprovada', 'aprovada'], 'chave desligada: cada pedido sozinho');
  assert.deepEqual(sai({ ev_ctrl: true, ev: { somaDiaPacote: false } }), ['aprovada', 'aprovada', 'aprovada'], 'parâmetro somaDiaPacote desligado');
});

test('D2: outro pacote, outro dia, pedido não verde, cancelado ou reprovado não somam', () => {
  const T = (extra, itemNovo = '7.1') => {
    const o1 = oc('OC-9001', '7.2', 70000, 'aprovada', { sem: 'verde', criado: hoje(), ...extra });
    const S = abre(api, obraCtrl(), est({ ev_ctrl: true }, [o1]), 'engenheiro'); api.derive();
    const sol = solicita(api, [{ item: itemNovo, qtd: 1, pu: 40000 }]); return emite(api, sol, 40000);
  };
  assert.equal(T({}).status, 'em_alcada', 'mesmo pacote e dia: soma 110.000'); assert.equal(T({}, '7.3').status, 'aprovada', 'outro pacote não soma');
  assert.equal(T({ criado: '2020-01-01' }).status, 'aprovada', 'outro dia não soma'); assert.equal(T({ sem: 'amarelo' }).status, 'aprovada', 'só soma pedido verde');
  assert.equal(T({ status: 'cancelada' }).status, 'aprovada'); assert.equal(T({ status: 'reprovada' }).status, 'aprovada');
});

test('D2: acima do valor do Gerente a soma leva à Diretoria', () => {
  const S = abre(api, obraCtrl(), est({ ev_ctrl: true }, [oc('OC-9001', '7.2', 200000, 'aprovada', { sem: 'verde', criado: hoje() })]), 'engenheiro'); api.derive();
  const o = emite(api, solicita(api, [{ item: '7.1', qtd: 1, pu: 90000 }]), 90000); assert.equal(o.alcada, 'diretoria', '200.000 + 90.000 = 290.000 > 250.000');
});

/* ============ D6: item continua rígido; E3: grupo acima do limite é vermelho ============ */
test('D6: acima da meta do item é amarelo mesmo com saldo sobrando no pacote e no evento', () => {
  abre(api, obraCtrl(), est({ ev_ctrl: true }), 'engenheiro'); api.derive();
  const r = J(api.semaforo('1.1', 1050));   /* meta do item 1.000, teto 1.100; pacote e evento têm 100.000 de meta */
  assert.equal(r[0], 'amarelo'); assert.deepEqual([nivel(r, 'item'), nivel(r, 'pacote'), nivel(r, 'evento')], [['amarelo'], ['verde'], ['verde']]);
  assert.equal(J(api.semaforo('1.1', 1150))[0], 'vermelho', 'acima do teto do item continua vermelho');
});

test('E3: pacote com meta acima do limite (soma dos itens) é vermelho para qualquer compra, até a de R$ 100; desligada não existe esse nível', () => {
  for (const ec of [false, true]) {
    abre(api, obraCtrl(), est({ ev_ctrl: ec }), 'engenheiro'); api.derive();
    const r = J(api.semaforo('6.1', 100));
    if (!ec) { assert.equal(r[0], 'verde'); continue; }
    assert.equal(r[0], 'vermelho'); assert.match(r[1], /Pacote PE: meta acima do limite/); assert.match(r[2], /sem folga/);
    assert.deepEqual(nivel(r, 'item'), ['verde']); assert.deepEqual(nivel(r, 'pacote'), ['vermelho']);
  }
});

test('obra sem evento (como a 343): o terceiro nível é o grupo da EAP', () => {
  const D = obraCtrl(); D.eap.forEach(e => { e.evento = null; });
  abre(api, D, est({ ev_ctrl: true }, [oc('OC-9001', '2.2', 1900)]), 'engenheiro'); api.derive();
  const r = J(api.semaforo('2.1', 500));   /* grupo 2 = 2.1 + 2.2: meta 2.000, limite 2.400, gasto 1.900 + 500 */
  assert.equal(r[0], 'amarelo'); assert.match(r[1], /Grupo 2: acima da meta, até o limite/); assert.deepEqual(nivel(r, 'evento'), ['amarelo']);
});

/* ============ a tela e as telas de apoio ============ */
test('semBox mostra os três níveis; sem a chave o quadro é o de sempre', () => {
  abre(api, obraCtrl(), est({ ev_ctrl: true }, [oc('OC-9001', '2.2', 1900)]), 'engenheiro'); api.derive();
  const h = String(api.semBox(api.semaforo('2.1', 500)));
  assert.match(h, /Item 2\.1: verde/); assert.match(h, /Pacote PX1: verde/); assert.match(h, /Evento 9\.1\.1: amarelo/);
  abre(api, obraCtrl(), est({}, [oc('OC-9001', '2.2', 1900)]), 'engenheiro'); api.derive();
  assert.doesNotMatch(String(api.semBox(api.semaforo('2.1', 500))), /niveis/);
});

test('Eventos: o reservado por pedido aguardando aprovação entra na conta do grupo (só com ev_ctrl); sem a chave o grupo é o de sempre', () => {
  const sai = ec => { const S = abre(api, obraCtrl(), est({ ev_ctrl: ec, ev_agrega: true }, [pend('OC-9001', '1.1', 600)]), 'gestao'); api.derive(); return J(api.agregaEventos()).grupos.find(g => g.chave === 'EC'); };
  const on = sai(true), off = sai(false);
  perto(on.res, 600, 'reservado do evento EC'); assert.equal(off.res, undefined, 'sem a chave o grupo não ganha campo novo'); perto(off.comp, 0, 'não comprometido'); perto(on.comp, 0, 'não comprometido');
});

test('Aprovações: a aba lista OC e nota sem pedido com o motivo quando o botão está desligado; o selo da área soma os dois', () => {
  const S = abre(api, obraCtrl(), est({ ev_ctrl: true }, [pend('OC-9001', '1.1', 600)]), 'adm'); api.derive();
  lancaNota(api, null, 1050, [{ item: '5.1', valor: 1050 }]); const X = api.derive();
  S.tab.compras = 'aprov'; const h = String(api.viewCompras(X)); assert.match(h, /OC \/ NF/); assert.match(h, /NF-0001 <span class="pill info">NF<\/span>/); assert.match(h, /OC-9001/);
  assert.match(h, /title="Só o Gerente de contrato ou a Diretoria aprovam\."/);
  S.role = 'gerente'; const h2 = String(api.viewCompras(api.derive())); assert.doesNotMatch(h2.split('NF-0001')[1].split('</tr>')[0], /disabled/, 'o Gerente vê o botão da nota ligado');
});

/* ============ propriedades em cenários aleatórios ============ */
test('em 300 cenários, a cor com a chave ligada nunca é mais branda que a desligada (e bloqueado não muda); só pedidos antigos', () => {
  let mais = 0, iguais = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const cen = cenario(seed, seed % 5 === 0 ? { eventos: false, itemFora: false } : { itemFora: false });
    const cor = ec => { const t = J(cen.t); t.par.ev_ctrl = ec; abre(api, cen.D, t); api.derive(); return api.S.D.items.flatMap(i => [100, 5000, 250000].map(v => api.semaforo(i.codigo, v)[0])); };
    const off = cor(false), on = cor(true);
    off.forEach((c, k) => { assert.ok(SEV[on[k]] >= SEV[c], `semente ${seed}: ${c} virou ${on[k]}`); if (c === 'bloqueado') assert.equal(on[k], 'bloqueado'); if (on[k] === c) iguais++; else mais++; });
  }
  assert.ok(mais > 100 && iguais > 100, `a chave muda parte das cores e deixa parte igual (mais severas ${mais}, iguais ${iguais})`);
});

test('com a chave ligada o semáforo de uma linha só dá o mesmo que o de várias linhas com o mesmo item repetido', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const cen = cenario(seed, { itemFora: false }); cen.t.par.ev_ctrl = true; abre(api, cen.D, cen.t); api.derive();
    for (const i of api.S.D.items.slice(0, 6)) {
      const a = J(api.semaforoLinhas([{ item: i.codigo, valor: 3000 }])), b = J(api.semaforoLinhas([{ item: i.codigo, valor: 1000 }, { item: i.codigo, valor: 2000 }]));
      assert.deepEqual(b, a, `semente ${seed} item ${i.codigo}`);
    }
  }
});

/* ============ sequências aleatórias de ponta a ponta com M3 e M4 ligadas: nada quebra e os números fecham ============ */
test('150 sequências de ações com oc_linhas e ev_ctrl ligadas: sem erro, pedido = soma das linhas, comprometido fecha com os pedidos, reserva fecha com os pendentes', () => {
  let ocs = 0, multi = 0, pendentes = 0, notas = 0;
  for (let seed = 1; seed <= 150; seed++) {
    const cen = cenario(seed, seed % 5 === 0 ? { eventos: false, itemFora: false } : { itemFora: false }); cen.t.ocs = []; cen.t.notas = []; cen.t.frozen = true;
    Object.assign(cen.t.par, { oc_linhas: true, ev_ctrl: true, calc_v2: seed % 3 === 0, limite: [300, 5000, 100000][seed % 3] });
    const S = abre(api, cen.D, cen.t, 'engenheiro'); api.derive();
    const R = rng(seed * 7 + 1), pick = a => a[Math.floor(R() * a.length)], itens = S.D.items.filter(i => i.meta_total != null).map(i => i.codigo);
    if (itens.length < 3) continue;
    for (let passo = 0; passo < 4; passo++) {
      S.role = 'engenheiro'; const n = pick([1, 1, 2, 3]), L = [];
      for (let k = 0; k < n; k++) { const i = S.byCod[pick(itens)], tot = i.meta_total * pick([0.1, 0.5, 0.9, 1.2]); L.push({ item: i.codigo, qtd: 2, pu: Math.round(tot / 2 * 100) / 100 || 1 }); }
      const sol = solicita(api, L); api.derive(); if (!sol) continue;
      if (sol.linhas) assert.equal(sol.item, sol.linhas[0].item, 'item = primeira linha');
      const o = emite(api, sol, Math.round(sol.preco * sol.qtd * 100) / 100); api.derive(); if (!o) continue; ocs++;
      if (o.linhas && o.linhas.length > 1) multi++;
      assert.ok(Math.abs(o.linhas.reduce((s, l) => s + l.valor, 0) - o.valor) < 0.005, 'pedido = soma das linhas');
      if (o.status === 'em_alcada') {
        pendentes++; S.role = o.alcada === 'diretoria' ? 'diretoria' : 'gerente'; api.decidir(o.id, R() < 0.7); api.derive();
      }
      if (['aprovada', 'recebida_parcial'].includes(o.status)) {
        S.role = 'almox'; api.el('#rc-q').value = String(o.qtd * pick([0.5, 1])); api.doReceber(o.id);
        S.role = 'adm'; api.modalNF(); api.NF.oc = o.id; const v = Math.round(o.valor * pick([1, 0.5]) * 100) / 100; api.NF.valor = v; const rat = api.rateioDoPedido(o);
        const nn = lancaNota(api, o, v, rat); if (nn) notas++; api.derive();
      }
      if (R() < 0.4) { S.role = 'adm'; const it = S.byCod[pick(itens)]; if (lancaNota(api, null, 500, [{ item: it.codigo, valor: 500 }])) notas++; api.derive(); }
      /* invariantes */
      const C = api.contaObra(); api.derive();
      const somaSd = Object.values(S.sd).reduce((s, x) => s + x.comp, 0), somaOC = C.ocs.reduce((s, x) => s + x.comp, 0);
      perto(somaSd, somaOC, `semente ${seed} passo ${passo}: comprometido por item fecha com o dos pedidos`);
      Object.values(S.sd).forEach(x => { assert.ok(x.comp > -1e-9 && x.res > -1e-9, 'sem saldo negativo de comprometido ou reservado'); });
      perto(Object.values(S.sd).reduce((s, x) => s + x.res, 0), S.t.ocs.filter(q => q.status === 'em_alcada').reduce((s, q) => s + q.valor, 0), `semente ${seed}: reservado fecha com os pedidos aguardando`);
      S.t.notas.filter(q => q.aprov === 'pendente').forEach(q => assert.ok(['gerente', 'diretoria'].includes(q.alcada)));
    }
  }
  assert.ok(ocs > 150 && multi > 30 && pendentes > 30 && notas > 100, `a sequência exercita o caminho (pedidos ${ocs}, de várias linhas ${multi}, em alçada ${pendentes}, notas ${notas})`);
});
