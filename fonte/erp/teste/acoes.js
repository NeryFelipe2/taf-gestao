'use strict';
/* Ações do ERP pela tela, do jeito que a pessoa faria: preenche os campos do formulário (o mesmo caminho dos botões) e chama a função do ERP.
   Servem aos testes de M3 e M4. Tudo fictício. */

/* L = [{item, qtd, pu}]: a primeira linha é o formulário de sempre; as outras vão para SOLX (só existem com a chave oc_linhas). Devolve a solicitação criada ou null. */
function solicita(a, L, desc = 'Pedido fictício') {
  a.el('#s-item').value = L[0].item; a.el('#s-nat').value = L[0].nat || 'MAT'; a.el('#s-qtd').value = String(L[0].qtd); a.el('#s-pu').value = String(L[0].pu);
  a.el('#s-desc').value = desc; a.el('#s-dt').value = '2030-02-01'; a.el('#s-mot').value = 'teste'; a.el('#s-ins').value = '';
  a.SOLX.length = 0; L.slice(1).forEach(l => a.SOLX.push({ item: l.item, nat: l.nat || 'MAT', qtd: String(l.qtd), pu: String(l.pu) }));
  const antes = a.S.t.sols.length; a.doSol();
  return a.S.t.sols.length > antes ? a.S.t.sols[0] : null;
}

/* uma cotação (ou mais, se preco for lista) e a emissão da OC. Devolve a OC criada ou null. */
function emite(a, sol, preco, just = 'justificativa de teste') {
  const precos = Array.isArray(preco) ? preco : [preco];
  precos.forEach((p, k) => { a.el('#c-f').value = 'FORNECEDOR FICTÍCIO ' + k; a.el('#c-p').value = String(p); a.el('#c-z').value = '10'; a.el('#c-j').value = just; a.addCot(sol.id); });
  a.el('input[name=esc]:checked').value = '0'; a.el('#c-em').checked = false; a.el('#c-j').value = just;
  const antes = a.S.t.ocs.length; a.emitirOC(sol.id);
  return a.S.t.ocs.length > antes ? a.S.t.ocs[0] : null;
}

/* lança e ratea uma nota. ocObj = pedido (ou null para nota sem pedido). Devolve a nota (a mais nova) ou null se não gravou. */
function lancaNota(a, ocObj, valor, rateio, just = 'sem pedido de teste') {
  const antes = a.S.t.notas.length;
  a.modalNF(); a.el('#n-e').value = 'FORNECEDOR FICTÍCIO LTDA'; a.el('#n-c').value = 'NF-TESTE'; a.el('#n-v').value = String(valor); a.el('#n-d').value = '2030-02-10'; a.el('#n-o').value = ocObj ? ocObj.id : ''; a.el('#n-j').value = just;
  a.NF.oc = ocObj ? ocObj.id : ''; a.NF.valor = valor; a.NF.rateio = rateio; a.doNF('rateada');
  return a.S.t.notas.length > antes ? a.S.t.notas[0] : null;
}

module.exports = { solicita, emite, lancaNota };
