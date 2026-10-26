'use strict';
/* Cenários aleatórios (mas repetíveis: mesma semente, mesmo cenário) para comparar o ERP de partida com o ERP novo.
   Tudo fictício. Valores em centavos inteiros, para a soma não ter ruído de ponto flutuante. */

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const cent = v => Math.round(v * 100) / 100;

const PLANO = ['4', '4.1', '4.1.01', '4.2', '4.2.01', '4.2.02', '4.2.03', '4.2.04', '4.2.05', '4.2.06', '4.2.07', '4.2.08', '4.3', '4.3.01', '4.4', '4.4.01', '4.5', '4.5.01', '4.5.02', '4.5.06']
  .map(c => ({ codigo: c, nome: 'Conta ' + c, nivel: c.split('.').length, natureza: null }));

/* opções: { itens, eventos: bool (false = obra sem evento, como a 343), semEvento: fração de itens sem evento } */
function cenario(seed, opc = {}) {
  const R = rng(seed), pick = a => a[Math.floor(R() * a.length)], int = (a, b) => a + Math.floor(R() * (b - a + 1));
  const nIt = opc.itens || int(6, 14);
  const EVS = ['1.1.1', '1.1.2', '2.1.1', '4.1.1', '4.1.2', '10.2.1'], PCS = ['P1', 'P2', 'P3'];
  const NAT = [{ MAT: 1 }, { MO: 0.6, MAT: 0.4 }, { EQP: 1 }, { TER: 1 }, { ADM: 1 }];
  const eap = [];
  for (let g = 1; g <= 3; g++) eap.push({ codigo: String(g), descricao: 'Grupo ' + g, unidade: null, qtd: null, nivel: 1, pai: null, tipo_linha: 'grupo', preco_venda_total: null, meta_total: null, teto_total: null, meta_unit: null, evento: null, pacote: null, natureza: {} });
  for (let k = 1; k <= nIt; k++) {
    const g = 1 + (k % 3), cod = g + '.' + k, qtd = int(1, 50), meta = cent(int(1000, 900000) / 100), venda = cent(meta * (1 + R()));
    const teto = R() < 0.1 ? null : R() < 0.15 ? cent(meta * 0.9) : cent(meta * (1 + R() * 0.2));
    const semMeta = R() < 0.07;
    const evento = opc.eventos === false ? null : (R() < (opc.semEvento ?? 0.15) ? pick([null, '', '  ']) : pick(EVS));
    eap.push({
      codigo: cod, descricao: 'Item fictício ' + cod, unidade: 'un', qtd, nivel: 2, pai: String(g), tipo_linha: 'item', preco_venda_total: venda,
      meta_total: semMeta ? null : meta, teto_total: teto, meta_unit: semMeta ? null : cent(meta / qtd), fonte_meta: 'FICTÍCIO',
      status_cotacao: R() < 0.3 ? 'A cotar' : 'Cotado', evento, pacote: R() < 0.12 ? null : pick(PCS), tipo: pick(['material', 'servico']),
      composicao: R() < 0.3 ? [{ nat: 'MO', share: 0.5 }, { nat: 'MAT', share: 0.5 }] : null, natureza: pick(NAT), hh_unit: 0,
    });
  }
  const itens = eap.filter(e => e.tipo_linha === 'item'), cods = itens.map(i => i.codigo);
  const pacotes = PCS.map((c, i) => ({ codigo: c, nome: 'Pacote ' + c, meta: cent(int(50000, 500000)), teto: cent(int(50000, 500000)), fechar_ate: '2030-0' + (i + 1) + '-15', precisa_em_obra: '2030-06-01', responsavel: 'Fulano', condicao_pagamento: '30 dias', observacoes: '' }));
  const D = { obra: { codigo: '999', nome: 'OBRA 999 · DEMONSTRAÇÃO', contratante: 'DEMONSTRAÇÃO', contrato: 'FICTÍCIO', municipio: 'Fictícia', valor_contrato: 1000000, regime: 'Preço global por evento', tributos_nota: 0 }, pacotes, eap, plano: PLANO, banco_mo: [], relatorio: {} };

  const t = { frozen: R() < 0.9, versao: 1, hist: [], metaOv: {}, baseOv: {}, basePac: {}, ocs: [], notas: [], par: { tol: 0.02, limite: 100000 } };
  itens.forEach(i => {
    if (R() < 0.2) t.metaOv[i.codigo] = cent(int(1000, 900000) / 100);
    if (R() < 0.15) t.baseOv[i.codigo] = { meta_total: cent(int(1000, 900000) / 100), teto_total: cent(int(1000, 1200000) / 100), status_cotacao: 'Cotado', meta_unit: cent(int(10, 5000) / 100) };
  });
  if (R() < 0.4) t.basePac.P1 = { meta: cent(int(1000, 900000)), teto: cent(int(1000, 900000)), fechar_ate: '2030-09-09' };
  const ST_OC = ['aprovada', 'recebida', 'recebida_parcial', 'em_alcada', 'reprovada', 'cancelada'], ST_NF = ['lancada', 'rateada', 'conferida', 'divergente', 'liberada', 'paga'];
  const nOc = int(0, 12), nNf = int(0, 14);
  for (let k = 0; k < nOc; k++) {
    const valor = cent(int(10000, 2000000) / 100), item = pick(cods);   /* OC com item fora da EAP derruba derive() já hoje (economia): fora do cenário */
    t.ocs.push({ id: 'o' + seed + '_' + k, num: 'OC-' + String(k + 1).padStart(4, '0'), item, nat: pick(['MO', 'MAT', 'EQP', 'TER', 'ADM']), conta: pick(['4.1.01', '4.2.01', '4.2.08', '4.3.01', '4.4.01', '4.5.01']), forn: 'FORN FICTÍCIO ' + (k % 3),
      qtd: 1, preco: valor, valor, sem: 'verde', status: pick(ST_OC), alcada: pick(['gerente', 'diretoria']), just: '', solicitante: 'Fulano', recebido: 0, criado: '2030-01-05', data: '2030-01-05' });
  }
  for (let k = 0; k < nNf; k++) {
    const status = pick(ST_NF), o = t.ocs.length && R() < 0.75 ? pick(t.ocs) : null, nl = status === 'lancada' ? 0 : int(1, 3), rateio = [];
    for (let j = 0; j < nl; j++) {
      const item = o && R() < 0.6 ? o.item : (opc.itemFora !== false && R() < 0.04 ? 'X.98' : pick(cods));   /* X.98 = item fora da EAP; itemFora:false desliga */
      const l = { item, valor: cent(int(1000, 800000) / 100), nat: pick(['MO', 'MAT', 'EQP', 'TER', 'ADM']) };
      if (R() < 0.7) l.conta = pick(['4.1.01', '4.2.01', '4.2.08', '4.3.01', '4.4.01', '4.5.01']);
      rateio.push(l);
    }
    const valor = cent(rateio.reduce((s, l) => s + l.valor, 0)) || cent(int(1000, 800000) / 100);
    t.notas.push({ id: 'n' + seed + '_' + k, num: 'NF-' + String(k + 1).padStart(4, '0'), emitente: 'FORN FICTÍCIO', chave: '', valor, emissao: '2030-01-08', oc: o ? o.id : '', ocNum: o ? o.num : '', rateio, status });
  }
  return { D, t };
}

/* M3: converte parte dos pedidos em pedidos de várias linhas (mesmo valor total) e faz parte das notas ratear nas linhas do pedido.
   Usa outra semente: o cenário base não muda. O pedido de várias linhas guarda qtd 1 e preço = valor, e item = primeira linha, como o ERP grava. */
function comLinhas(cen, seed) {
  const R = rng(seed * 7919 + 13), pick = a => a[Math.floor(R() * a.length)], int = (a, b) => a + Math.floor(R() * (b - a + 1));
  const itens = cen.D.eap.filter(e => e.tipo_linha === 'item').map(i => i.codigo);
  cen.t.ocs.forEach(o => {
    if (R() < 0.55 && itens.length > 3) {
      const n = int(1, 3), outros = []; let tent = 0;
      while (outros.length < n && tent++ < 30) { const c = pick(itens); if (c !== o.item && !outros.includes(c)) outros.push(c); }
      const partes = outros.map(() => cent(o.valor * (0.1 + R() * 0.2))), resto = cent(o.valor - partes.reduce((s, x) => s + x, 0));
      if (resto <= 0 || !outros.length) return;
      o.linhas = [{ item: o.item, nat: o.nat, conta: o.conta, qtd: 1, valor: resto }, ...outros.map((c, k) => ({ item: c, nat: pick(['MO', 'MAT', 'EQP', 'TER', 'ADM']), conta: pick(['4.1.01', '4.2.01', '4.2.08', '4.3.01']), qtd: 1, valor: partes[k] }))];
      o.qtd = 1; o.preco = o.valor;
    }
  });
  cen.t.notas.forEach(n => { const o = n.oc && cen.t.ocs.find(x => x.id === n.oc); if (o && o.linhas && n.rateio.length && R() < 0.6) n.rateio[0].item = pick(o.linhas).item; });
  return cen;
}

module.exports = { cenario, comLinhas, rng, PLANO };
