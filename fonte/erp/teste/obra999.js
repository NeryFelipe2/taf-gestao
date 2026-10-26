'use strict';
/* OBRA 999 · DEMONSTRAÇÃO. Obra FICTÍCIA para os testes e para a conferência na tela.
   Todo nome, código e valor daqui é inventado; nada vem de obra real nem do banco. */

const it = (codigo, descricao, evento, pacote, venda, meta, teto, extra = {}) => ({
  codigo, descricao, unidade: 'vb', qtd: 1, nivel: codigo.split('.').length, pai: codigo.includes('.') ? codigo.split('.').slice(0, -1).join('.') : null,
  tipo_linha: 'item', preco_venda_total: venda, meta_total: meta, teto_total: teto, meta_unit: meta, fonte_meta: 'FICTÍCIO', status_cotacao: 'Cotado',
  evento, pacote, tipo: 'servico', composicao: null, natureza: { MAT: 1 }, hh_unit: 0, ...extra,
});
const gr = (codigo, descricao) => ({ codigo, descricao, unidade: null, qtd: null, nivel: 1, pai: null, tipo_linha: 'grupo', preco_venda_total: null, meta_total: null, teto_total: null, meta_unit: null, evento: null, pacote: null, natureza: {} });

function obra999() {
  const eap = [
    gr('1', 'CANTEIRO E MOBILIZAÇÃO (fictício)'),
    it('1.1', 'Barracão e instalações provisórias', '1.1.1', 'CANT', 12000, 9000, 9900),
    it('1.2', 'Mobilização de equipamentos', '1.1.1', 'CANT', 8000, 6000, 6600),
    gr('2', 'ESTAÇÃO ELEVATÓRIA (fictícia)'),
    it('2.1', 'Tubos e conexões da elevatória', '2.1.1', 'HIDR', 40000, 30000, 33000),
    it('2.2', 'Montagem hidráulica', '2.1.1', 'HIDR', 15000, 11000, 12100),
    gr('3', 'ELÉTRICA E AUTOMAÇÃO (fictícia)'),
    it('3.1', 'Quadro elétrico de comando', '4.1.1', 'ELET', 10000, 7000, 7000),
    /* no eventograma oficial fictício este item é dividido 90/10 entre 4.1.1 e 4.1.2; no ERP está ligado só a 4.1.1 */
    it('3.2', 'Cabos e eletrodutos (dividido 90/10 no eventograma oficial)', '4.1.1', 'ELET', 10000, 6000, 5500),
    it('3.3', 'Comissionamento e partida', '4.1.2', 'ELET', 5000, 3000, 3000),
    it('3.4', 'Tubulação de recalque', '4.1.1', 'HIDR', 6000, 4000, 4400),
    it('3.5', 'Serviços diversos (sem evento)', null, 'ELET', 3000, 2000, 1500),
  ];
  return {
    obra: { codigo: '999', nome: 'OBRA 999 · DEMONSTRAÇÃO', contratante: 'DEMONSTRAÇÃO (fictícia)', contrato: 'FICTÍCIO 999/0000', municipio: 'Cidade Fictícia', valor_contrato: 109000, regime: 'Preço global por evento', tributos_nota: 0 },
    pacotes: [
      { codigo: 'CANT', nome: 'Canteiro (fictício)', meta: 15000, teto: 16500, fechar_ate: '2030-01-10', precisa_em_obra: '2030-02-01', responsavel: 'Engenheiro 999', condicao_pagamento: '30 dias', observacoes: '' },
      { codigo: 'HIDR', nome: 'Hidráulica (fictício)', meta: 45000, teto: 49500, fechar_ate: '2030-01-20', precisa_em_obra: '2030-03-01', responsavel: 'Engenheiro 999', condicao_pagamento: '30 dias', observacoes: '' },
      /* valores fixos do pacote parecem folgados (meta 18.000 < teto 20.000), mas a soma dos itens não é: meta 18.000 e teto 17.000 */
      { codigo: 'ELET', nome: 'Elétrica (fictício)', meta: 18000, teto: 20000, fechar_ate: '2030-01-30', precisa_em_obra: '2030-03-15', responsavel: 'Engenheiro 999', condicao_pagamento: '30 dias', observacoes: '' },
    ],
    eap,
    plano: [], banco_mo: [], relatorio: { diferenca_contrato: 0, aviso: 'OBRA 999 · DEMONSTRAÇÃO: dados fictícios.' },
  };
}

/* "eventograma oficial" fictício: o item 3.2 (venda 10.000) é 90/10 entre 4.1.1 e 4.1.2, então 4.1.1 = 26.000 - 1.000 e 4.1.2 = 5.000 + 1.000 */
const EV_REF_999 = { '1.1.1': 20000, '2.1.1': 55000, '4.1.1': 25000, '4.1.2': 6000 };

let _id = 0;
const oc = (num, item, valor, status = 'aprovada', extra = {}) => ({ id: 'o999' + (++_id), num, sol: 's' + _id, item, nat: 'MAT', conta: '4.2.08', forn: 'FORNECEDOR FICTÍCIO LTDA', ins: '', qtd: 1, preco: valor, valor, sem: 'verde', status, alcada: null, just: '', solicitante: 'Alguém', recebido: 0, criado: '2030-01-05', data: '2030-01-05', ...extra });
const nf = (num, ocObj, valor, rateio, status = 'rateada', extra = {}) => ({ id: 'n999' + (++_id), num, emitente: 'FORNECEDOR FICTÍCIO LTDA', chave: '', valor, emissao: '2030-01-08', oc: ocObj ? ocObj.id : '', ocNum: ocObj ? ocObj.num : '', rateio: rateio.map(([item, v]) => ({ item, valor: v, nat: 'MAT', conta: '4.2.08' })), status, ...extra });

/* estado da 999 com o cenário do plano (M1): pedido de 3.000 no item 1.1 e nota de 3.000 rateada 100% no item 2.2 */
function estado999(par = {}) {
  _id = 0;
  const o1 = oc('OC-9001', '1.1', 3000), o2 = oc('OC-9002', '2.1', 8000), o3 = oc('OC-9003', '3.1', 2500, 'em_alcada', { alcada: 'gerente', sem: 'amarelo' });
  const n1 = nf('NF-9001', o1, 3000, [['2.2', 3000]]);          /* rateada fora do item do pedido */
  const n2 = nf('NF-9002', o2, 5000, [['2.1', 5000]]);          /* parcial no mesmo item */
  const n3 = nf('NF-9003', null, 700, [['1.2', 700]], 'rateada', { justSemOC: 'FICTÍCIO' });
  return {
    frozen: true, versao: 1, hist: [{ versao: 1, motivo: 'FICTÍCIO', quando: '2030-01-01T00:00:00.000Z', quem: 'teste' }],
    ocs: [o3, o2, o1], notas: [n3, n2, n1], par: { tol: 0.02, limite: 100000, ...par },
  };
}

module.exports = { obra999, estado999, EV_REF_999, it, gr, oc, nf };
