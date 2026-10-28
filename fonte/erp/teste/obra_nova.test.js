'use strict';
/* Obra nova pela tela (53_obra_nova.js e fonte/erp/sql/04_obra_nova.sql). Sem rede e sem banco: a planilha é fictícia (OBRA 998 · TESTE)
   e o banco é simulado em memória no fetch do contexto (mesmas regras de entrada do 04_obra_nova.sql que a tela precisa). */
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { carrega, abre, RAIZ } = require('./ambiente');

const api = carrega('trabalho');
const C = api.ctx;
const f = n => vm.runInContext(n, C);   /* funções do módulo 53 (não estão na lista do ambiente.js) */
const J = x => JSON.parse(JSON.stringify(x));
Object.assign(C, { CompressionStream, DecompressionStream, Response, crypto: globalThis.crypto });

/* planilha fictícia de órgão, como o Excel brasileiro salva em CSV (separador ;, vírgula decimal) */
const CSV998 = [
  'PREFEITURA FICTÍCIA DE TESTE;;;;;;;',
  'PLANILHA ORÇAMENTÁRIA · OBRA 998 (fictícia);;;;;;;',
  ';;;;;;;',
  'ITEM;CÓDIGO;DESCRIÇÃO DOS SERVIÇOS;UND;QUANT.;P.UNIT. C/ BDI (R$);P.TOTAL (R$);EVENTO',
  '1;;SERVIÇOS PRELIMINARES;;;;"13.000,00";',
  '1.1;SINAPI 1;Placa de obra em chapa galvanizada;m²;6;"500,00";"3.000,00";1.1.1',
  '1.2;SINAPI 2;Mobilização de equipamentos;vb;1;"10.000,00";"10.000,00";1.1.1',
  '2;;REDE DE ÁGUA;;;;;',
  '2.1;;Tubo PVC DN 100 "fictício";m;"1.200";"85,50";"102.600,00";2.1.1',
  '2.2;;Escavação de vala;m³;"350,5";"40,00";"14.020,00";2.1.1',
  '2.3;;Ligação domiciliar;un;40;;;2.1.2',
  '2.4;;Assentamento de rede;m;"1.200";"12,00";"14.500,00";EV-2',
  ';;TOTAL GERAL;;;;"144.120,00";',
].join('\r\n');
const ABA998 = () => { const c = f('obnCsv')(CSV998); return { nome: 'CSV', raw: c.rows, txt: c.rows, dec: c.dec, r0: 1, c0: 0 }; };

test('cabeçalho: acha a linha e sugere as colunas pelos nomes de sempre', () => {
  const a = ABA998(), hdr = f('obnAchaCab')(a.txt);
  assert.equal(hdr, 3, 'linha 4 do arquivo (índice 3)');
  assert.deepEqual(J(f('obnSugere')(a.txt[hdr])), { codigo: 0, descricao: 2, unidade: 3, qtd: 4, pu: 5, total: 6, evento: 7 });
  /* ITEM ganha de CÓDIGO (código SINAPI); P.UNIT com BDI ganha do sem BDI; PACOTE quando tem */
  assert.deepEqual(J(f('obnSugere')(['CÓDIGO', 'ITEM', 'DISCRIMINAÇÃO', 'UNID.', 'QUANTIDADE', 'P. UNIT. S/ BDI', 'P. UNIT. C/ BDI', 'VALOR TOTAL', 'PACOTE'])),
    { codigo: 1, descricao: 2, unidade: 3, qtd: 4, pu: 6, total: 7, pacote: 8 });
  assert.deepEqual(J(f('obnSugere')(['Cód.', 'Descrição', 'Un', 'Qtde', 'Preço unitário (R$)', 'Preço total (R$)'])), { codigo: 0, descricao: 1, unidade: 2, qtd: 3, pu: 4, total: 5 });
  assert.equal(f('obnAchaCab')([['nada'], ['ainda nada'], ['ITEM', 'DESCRIÇÃO', 'UND', 'QUANT']]), 2);
  assert.equal(f('obnAchaCab')([['A', 'B'], ['1', '2']]), 0, 'sem cabeçalho reconhecível: primeira linha');
});

test('números da planilha: vírgula decimal, ponto de milhar, R$, vazio não é zero', () => {
  const n = f('obnNum');
  const casos = [[1234.5, ',', 1234.5], ['1.234,56', ',', 1234.56], ['1234.56', '.', 1234.56], ['1.234', ',', 1234], ['1.5', ',', 1.5], ['1,5', ',', 1.5],
    ['R$ 10,00', ',', 10], ['(5,00)', ',', -5], ['1,234.56', '.', 1234.56], ['1,234', '.', 1234], ['-12,5', ',', -12.5], ['1.234.567,8', ',', 1234567.8]];
  for (const [v, d, e] of casos) assert.equal(n(v, d), e, String(v));
  for (const v of [null, '', ' ', '-', '—']) assert.equal(n(v, ','), null, 'vazio: ' + JSON.stringify(v));
  for (const v of ['abc', '1,2,3', 'vb', NaN]) assert.equal(n(v, ','), undefined, 'não é número: ' + v);
});

test('CSV: separador ; e , , aspas, quebra de linha dentro de aspas e arquivo em Windows-1252', () => {
  const c = f('obnCsv')('a;"b;c";"d ""e"""\r\n1;"linha\ncom quebra";3');
  assert.equal(c.sep, ';'); assert.equal(c.dec, ',');
  assert.deepEqual(J(c.rows), [['a', 'b;c', 'd "e"'], ['1', 'linha\ncom quebra', '3']]);
  const d = f('obnCsv')('ITEM,DESCRICAO,QTD\n1.1,"Tubo, PVC",2.5\n');
  assert.equal(d.sep, ','); assert.equal(d.dec, '.'); assert.deepEqual(J(d.rows[1]), ['1.1', 'Tubo, PVC', '2.5']);
  const latin1 = Buffer.from('DESCRIÇÃO;UND\r\nPlaca;m²', 'latin1');
  assert.equal(f('obnDecod')(new Uint8Array(latin1)), 'DESCRIÇÃO;UND\r\nPlaca;m²');
  assert.equal(f('obnDecod')(new Uint8Array(Buffer.from('DESCRIÇÃO', 'utf8'))), 'DESCRIÇÃO');
});

test('linhas da obra 998: itens, grupos (sem quantidade e sem preço), hierarquia, total e avisos', () => {
  const a = ABA998(), map = J(f('obnSugere')(a.txt[3])), L = f('obnLinhas')(a, 3, map);
  assert.deepEqual(J(L.erros), []);
  assert.equal(L.nItens, 6); assert.equal(L.nGrupos, 2);
  assert.deepEqual(J(L.linhas.map(x => x.codigo + ':' + x.tipo + ':' + x.nivel + ':' + (x.pai || '-'))),
    ['1:grupo:1:-', '1.1:item:2:1', '1.2:item:2:1', '2:grupo:1:-', '2.1:item:2:2', '2.2:item:2:2', '2.3:item:2:2', '2.4:item:2:2']);
  const i21 = L.linhas.find(x => x.codigo === '2.1');
  assert.equal(i21.qtd, 1200); assert.equal(i21.pu, 85.5); assert.equal(i21.venda, 102600); assert.equal(i21.unidade, 'm'); assert.equal(i21.descricao, 'Tubo PVC DN 100 ″fictício″', 'aspas viram ″ (o banco recusa aspas na descrição)');
  assert.deepEqual(J(L.avisos.sinais), ['2.1']);
  assert.equal(L.linhas.find(x => x.codigo === '2.2').qtd, 350.5);
  assert.equal(L.linhas.find(x => x.codigo === '2.3').venda, null, 'item sem preço fica vazio, não zero');
  assert.equal(L.total, 3000 + 10000 + 102600 + 14020 + 14500);
  assert.deepEqual(J(L.avisos.semPreco), ['2.3']);
  assert.deepEqual(J(L.avisos.difTot.map(d => d.cod)), ['2.4'], '1.200 × 12 = 14.400, a planilha diz 14.500');
  assert.deepEqual(J(L.avisos.difGrupo), [], 'subtotal do grupo 1 confere (13.000)');
  assert.deepEqual(J(L.avisos.ign.map(x => x.lin)), [13], 'a linha TOTAL GERAL sem código fica de fora');
  assert.deepEqual(J(L.avisos.evFora), ['2.4'], 'EV-2 não liga ao cronograma');
  assert.deepEqual(J(L.pacotes), []);
});

test('linhas: código repetido e caractere estranho impedem gravar; pacote vira código; subtotal de grupo errado avisa', () => {
  const aba = rows => ({ raw: rows, txt: rows, dec: ',', r0: 1 });
  const cab = ['ITEM', 'DESCRIÇÃO', 'UND', 'QUANT', 'P.UNIT', 'TOTAL', 'PACOTE'], m = J(f('obnSugere')(cab));
  const L = f('obnLinhas')(aba([cab, ['1', 'GRUPO', '', '', '', '999,00', ''], ['1.1', 'Tubo', 'm', '2', '10', '20', 'Tubos PVC'], ['1.1', 'Tubo de novo', 'm', '1', '1', '1', ''],
    ['1.2"><b>', 'Ruim', 'm', '1', '1', '1', ''], ['1.3', 'Válvula', 'un<script>', '1', '5', '5', 'Válvulas']]), 0, m);
  assert.equal(L.erros.length, 2, JSON.stringify(L.erros));
  assert.match(L.erros[0], /^Código 1\.1 repetido \(linhas 3 e 4\)/);
  assert.match(L.erros[1], /^Linha 5: código "1\.2"><b>" com caractere não aceito/);
  const i = L.linhas.find(x => x.codigo === '1.3');
  assert.equal(i.unidade, 'unscript', 'unidade sem < > & aspas');
  assert.deepEqual(J(L.pacotes), [{ codigo: 'TUBOS_PVC', nome: 'Tubos PVC' }, { codigo: 'VALVULAS', nome: 'Válvulas' }]);
  assert.deepEqual(J(L.avisos.difGrupo), [{ cod: '1', tot: 999, soma: 25 }]);
  const V = f('obnLinhas')(aba([cab, ['', 'só texto', '', '', '', '', '']]), 0, m);
  assert.match(V.erros[0], /^Nenhum item/);
});

test('linhas vindas do Excel: código gravado como número avisa (1.10 vira 1.1) e números de verdade passam direto', () => {
  const raw = [['ITEM', 'DESCRIÇÃO', 'UND', 'QUANT', 'P.UNIT', 'TOTAL'], [1, 'GRUPO', null, null, null, null], [1.1, 'Item', 'm', 2.5, 4, 10], ['1.10', 'Outro', 'm', 1, 1, 1]];
  const txt = raw.map(r => r.map(v => v == null ? '' : String(v)));
  const L = f('obnLinhas')({ raw, txt, dec: ',', r0: 1 }, 0, J(f('obnSugere')(raw[0])));
  assert.deepEqual(J(L.erros), []);
  assert.deepEqual(J(L.linhas.map(x => x.codigo)), ['1', '1.1', '1.10'], 'ordem pelos números do código: 1.1 antes de 1.10');
  assert.deepEqual(J(L.avisos.codNum), ['1.1']);
  assert.equal(L.linhas[1].qtd, 2.5);
});

function base998(valor = '144.000,00', plano = []) {
  const a = ABA998(), st = J(f('obnNovo')('998'));
  Object.assign(st, { nome: 'OBRA 998 · TESTE (fictícia)', contratante: 'PREFEITURA FICTÍCIA', arq: 'planilha-998.csv', abas: [a], aba: 0, hdr: 3, map: J(f('obnSugere')(a.txt[3])), valor });
  st.L = f('obnLinhas')(a, st.hdr, st.map);
  return { st, b: f('obnMontaBase')(st, plano) };
}

test('base: formato que o ERP abre (D como o da obra 999), sem meta, e índice do banco só com itens', () => {
  const { b } = base998();
  const D = b.D;
  assert.deepEqual(Object.keys(D).sort(), ['banco_mo', 'eap', 'obra', 'pacotes', 'plano', 'relatorio']);
  assert.deepEqual(J(D.obra), { codigo: '998', nome: 'OBRA 998 · TESTE (fictícia)', contratante: 'PREFEITURA FICTÍCIA', contrato: null, municipio: null, valor_contrato: 144000, regime: null, tributos_nota: null });
  assert.equal(D.relatorio.diferenca_contrato, 120);
  const it = D.eap.filter(e => e.tipo_linha === 'item');
  assert.ok(it.every(e => e.meta_total === null && e.teto_total === null && e.meta_unit === null && typeof e.descricao === 'string'));
  const ref = require('./obra999').obra999().eap.find(e => e.tipo_linha === 'item');
  for (const k of Object.keys(ref)) assert.ok(k in it[0], 'campo do item da 999 que falta: ' + k);
  assert.equal(b.origem.linha_cabecalho, 4); assert.equal(b.origem.colunas.codigo, 'A'); assert.equal(b.origem.valor_contrato_fonte, 'informado');
  const ix = J(f('obnIndice')(D));
  assert.equal(ix.length, 6);
  assert.deepEqual(ix[0], { codigo: '1.1', descricao: 'Placa de obra em chapa galvanizada', unidade: 'm²', qtd: 6, pacote: null, evento: '1.1.1', venda: 3000, meta: null, teto: null, meta_unit: null });
  assert.equal(base998('').b.D.obra.valor_contrato, 144120, 'sem valor do contrato vale a soma da planilha');
  assert.equal(base998('').b.origem.valor_contrato_fonte, 'soma da planilha (contrato não informado)');
  const { st: s2 } = base998(''); s2.valor = '144.120,00'; s2.valorDaSoma = true;
  assert.equal(f('obnMontaBase')(s2, []).origem.valor_contrato_fonte, 'soma da planilha, confirmada na tela');
});

test('ERP abre a obra nova sem meta: todas as telas desenham e a compra fica bloqueada até a meta', () => {
  const { b } = base998('144.000,00', [{ codigo: '4', nome: 'Custos', nivel: 1 }]);
  const S = abre(api, b.D, { frozen: false });
  S.exp = new (vm.runInContext('Set', C))(b.D.eap.filter(e => e.nivel <= 2).map(e => e.codigo));   /* como o chCarregar abre */
  const html = String(api.viewEap(api.derive()));
  assert.match(html, /Orçamento \(EAP\)/); assert.match(html, /6 itens/); assert.match(html, /Placa de obra/);
  assert.deepEqual(J(api.semaforo('1.1', 100)).slice(0, 2), ['bloqueado', 'Linha de base não congelada']);
  S.t.frozen = true; api.prep();
  assert.deepEqual(J(api.semaforo('1.1', 100)).slice(0, 2), ['bloqueado', 'Item sem meta de custo']);
  /* todas as telas do menu desenham sem erro com a obra sem meta */
  const vistas = api.NAV_BASE.map(n => n[0]).filter(v => v !== 'usuarios');
  for (const v of vistas) { S.view = v; assert.doesNotThrow(() => vm.runInContext('render()', C), 'tela ' + v); }
  assert.doesNotThrow(() => api.modalItem('2.3'));
  assert.doesNotThrow(() => api.modalPac && b.D.pacotes.length && api.modalPac(b.D.pacotes[0].codigo));
});

test('gzip + base64 + sha256 do navegador: o Node lê a mesma base e o sha é o do texto base64 (o que o banco confere)', async () => {
  const { b } = base998();
  const gz = await f('obnGz')(b);
  assert.match(gz, /^H4sI[A-Za-z0-9+/]*={0,2}$/); assert.equal(gz.length % 4, 0);
  assert.deepEqual(JSON.parse(zlib.gunzipSync(Buffer.from(gz, 'base64')).toString('utf8')), J(b));
  assert.equal(await f('obnDesGz')(gz), JSON.stringify(b));
  assert.equal(await f('obnSha')(gz), crypto.createHash('sha256').update(gz).digest('hex'));
});

test('fora do site TAF (modo aberto) a janela Obras não muda: sem botão Nova obra', () => {
  assert.equal(f('obraNovaBtn()'), '');
  abre(api, require('./obra999').obra999(), {});
  vm.runInContext('modalObras()', C);
  assert.ok(!/obra-nova/.test(String(api.el('#mbox').innerHTML)));
});

/* ---------- a tela inteira com a chave do site: banco simulado em memória ---------- */
function carregaComChave(banco) {
  const orig = vm.createContext;
  vm.createContext = sb => {
    sb.TAF_CONFIG = { modo: 'chave', supabaseUrl: 'http://banco.teste', supabaseKey: 'chave-publica-de-teste' };
    sb.fetch = async (url, op) => {
      const fn = String(url).split('/rest/v1/rpc/')[1], body = JSON.parse(op.body);
      banco.chamadas.push(fn);
      try { const r = banco.rpc(fn, body); return { ok: true, status: 200, text: async () => JSON.stringify(r) }; }
      catch (e) { return { ok: false, status: 400, text: async () => JSON.stringify({ message: e.message }) }; }
    };
    Object.assign(sb, { CompressionStream, DecompressionStream, Response, crypto: globalThis.crypto });
    return orig(sb);
  };
  try { return carrega('trabalho'); } finally { vm.createContext = orig; }
}
/* o mínimo das regras do 04_obra_nova.sql e do 01_erp.sql que a tela usa */
function bancoFalso() {
  const B = { obras: [], itens: {}, chamadas: [], papeis: [] };
  const sha = t => crypto.createHash('sha256').update(t).digest('hex');
  const gestor = b => { if (b.p_chave !== 'chave-do-site') throw new Error('CHAVE INVALIDA'); if (!['gestao', 'diretoria'].includes(b.p_papel)) throw new Error('SEM PERMISSAO: SO GESTAO OU DIRETORIA CRIA OBRA E GRAVA O ORCAMENTO'); if (!b.p_quem) throw new Error('INFORME SEU NOME'); };
  B.rpc = (fn, b) => {
    const o = B.obras.find(x => x.codigo === b.p_obra);
    switch (fn) {
      case 'taf_erp_entrar': return { quem: b.p_quem, papel: b.p_papel || 'gestao', fixo: false, leitura: false, obras: B.obras.map(x => ({ codigo: x.codigo, nome: x.nome, contratante: x.contratante })) };
      case 'taf_erp_obra_criar': gestor(b); B.papeis.push(fn + ':' + b.p_papel); if (!/^\d{3}$/.test(b.p_codigo)) throw new Error('CODIGO DA OBRA INVALIDO');
        if (B.obras.some(x => x.codigo === b.p_codigo)) throw new Error('OBRA ' + b.p_codigo + ' JA EXISTE NO ERP');
        B.obras.push({ codigo: b.p_codigo, nome: b.p_nome, contratante: b.p_contratante, base_gz: null, base_sha: null, ver: 1 });
        return { ok: true, obra: { codigo: b.p_codigo, nome: b.p_nome, contratante: b.p_contratante }, quem: b.p_quem, papel: b.p_papel, chave: 'geral' };
      case 'taf_erp_base_gravar': gestor(b); B.papeis.push(fn + ':' + b.p_papel); if (!o) throw new Error('OBRA INVALIDA');
        if (!/^H4sI/.test(b.p_base_gz) || sha(b.p_base_gz) !== b.p_base_sha) throw new Error('BASE_SHA NAO CONFERE COM A BASE ENVIADA');
        if (B.falharBase) { B.falharBase = false; throw new Error('Failed to fetch'); }
        if (o.base_sha === 'tela:' + b.p_base_sha) return { ok: true, igual: true, obra: o.codigo, base_sha: o.base_sha, itens: B.itens[o.codigo].length, versao: o.ver };
        if (o.base_sha) throw new Error('COM A CHAVE DO SITE O ORCAMENTO SO E GRAVADO UMA VEZ: PARA REGRAVAR, USE A CHAVE PESSOAL DE GESTAO OU DIRETORIA');
        o.base_gz = b.p_base_gz; o.base_sha = 'tela:' + b.p_base_sha; o.ver++; B.itens[o.codigo] = b.p_itens;   /* a marca "tela:" quem põe é o banco */
        return { ok: true, igual: false, obra: o.codigo, base_sha: o.base_sha, itens: b.p_itens.length, versao: o.ver };
      case 'taf_erp_ler': if (!o) throw new Error('OBRA INVALIDA');
        return { obra: { codigo: o.codigo, nome: o.nome, contratante: o.contratante }, base_sha: o.base_sha, base_gz: b.p_base_sha === o.base_sha ? null : o.base_gz, estado: {}, docs: [], parcial: false, versao: o.ver };
      case 'taf_erp_base': return { codigo: o.codigo, base_gz: o.base_gz, base_sha: o.base_sha };
      case 'taf_erp_numeros': return 1;
      case 'taf_erp_versao': return o ? o.ver : 0;
      default: throw new Error('função não simulada: ' + fn);
    }
  };
  return B;
}
const espera = () => new Promise(r => setImmediate(r));
/* alvo de um evento de mentira: responde o que os outros ouvintes do ERP perguntam */
const alvo = o => ({ dataset: {}, value: '', files: [], closest: () => null, matches: () => false, getAttribute: () => null, hasAttribute: () => false, ...o });
async function preencheEGrava(A, banco, valor, papel = 'gestao') {
  const g = n => vm.runInContext(n, A.ctx);
  g("ACOES['obra-nova']()");
  assert.match(String(A.el('#mbox').innerHTML), /1 Dados da obra/);
  A.el('#on-cod').value = '998'; A.el('#on-nome').value = '  OBRA 998 · TESTE (fictícia) '; A.el('#on-ct').value = 'PREFEITURA FICTÍCIA';
  g("ACOES['on-p1']()");
  assert.equal(g('ON.passo'), 2); assert.equal(g('ON.nome'), 'OBRA 998 · TESTE (fictícia)');
  /* o arquivo: o mesmo caminho do input (obnLerArquivo) com um File de mentira */
  const file = { name: 'planilha-998.csv', arrayBuffer: async () => new Uint8Array(Buffer.from(CSV998, 'latin1')).buffer };
  const ouv = A.ctx.__ouvintes.change || [];
  await Promise.all(ouv.map(fn => fn({ target: alvo({ id: 'on-arq', files: [file] }) })));
  assert.equal(g('ON.hdr'), 3); assert.match(String(A.el('#mbox').innerHTML), /Primeiras linhas, como serão lidas/);
  g("ACOES['on-p2']()");
  assert.equal(g('ON.passo'), 3);
  const h3 = String(A.el('#mbox').innerHTML);
  assert.match(h3, /Total geral/); assert.match(h3, /1 item sem preço: 2\.3/); assert.match(h3, /total diferente/); assert.match(h3, /Gravar a obra 998/);
  (A.ctx.__ouvintes.input || []).forEach(fn => fn({ target: alvo({ id: 'on-valor', value: valor }) }));
  /* chave do site: sem escolher o papel de propósito não grava (o padrão da entrada não vale) */
  const antes = banco.chamadas.length;
  assert.match(String(A.el('#mbox').innerHTML), /Seu papel \(chave do site\) · obrigatório/);
  await g("ACOES['on-gravar']()");
  assert.equal(banco.chamadas.length, antes, 'sem papel escolhido nada vai ao banco');
  assert.match(g('ON.msg'), /escolher o seu papel/);
  if (valor === '') {   /* valor do contrato é obrigatório: sem ele, só usando a soma da planilha de propósito */
    assert.match(g('ON.msg'), /digitar o valor do contrato/);
    assert.match(String(A.el('#mbox').innerHTML), /data-act="on-usa-soma"/);
    g("ACOES['on-usa-soma']()");
    assert.equal(g('ON.valor'), '144.120,00');
  }
  await Promise.all((A.ctx.__ouvintes.change || []).map(fn => fn({ target: alvo({ id: 'on-papel', value: papel }) })));
  await g("ACOES['on-gravar']()");
  for (let k = 0; k < 20; k++) await espera();
}

test('tela com a chave do site: banco sem obra, Nova obra, planilha CSV, prévia, gravar e abrir no Orçamento', async () => {
  const banco = bancoFalso(), A = carregaComChave(banco), g = n => vm.runInContext(n, A.ctx);
  A.ctx.localStorage.setItem('taf-erp-papel', 'gestao');
  await g("chEntrar('chave-do-site','Gestor de Teste',false)");
  const tela = String(A.el('#view').innerHTML);
  assert.match(tela, /Nenhuma obra no banco/); assert.match(tela, /data-act="obra-nova"/); assert.ok(!/disabled/.test(tela.split('data-act="obra-nova"')[1].split('>')[0]));
  await preencheEGrava(A, banco, '144.120,00', 'diretoria');
  assert.deepEqual(banco.chamadas.filter(c => c.startsWith('taf_erp_obra') || c.startsWith('taf_erp_base')), ['taf_erp_obra_criar', 'taf_erp_base_gravar']);
  assert.deepEqual(banco.papeis, ['taf_erp_obra_criar:diretoria', 'taf_erp_base_gravar:diretoria'], 'vai o papel escolhido na prévia, não o padrão da entrada');
  assert.match(banco.obras[0].base_sha, /^tela:[0-9a-f]{64}$/);
  assert.match(JSON.parse(A.ctx.localStorage.getItem('taf-erp-base-998')).sha, /^tela:/, 'o aparelho guarda o sha com a marca do banco');
  assert.equal(banco.itens['998'].length, 6);
  assert.ok(banco.itens['998'].every(i => i.meta === null));
  const D = JSON.parse(zlib.gunzipSync(Buffer.from(banco.obras[0].base_gz, 'base64')).toString('utf8')).D;
  assert.equal(D.obra.valor_contrato, 144120); assert.equal(D.eap.length, 8);
  assert.equal(D.eap.find(e => e.codigo === '2.1').descricao, 'Tubo PVC DN 100 ″fictício″');
  assert.ok(banco.itens['998'].every(i => !/[<>"]/.test(i.descricao || '')), 'descrição sem < > e aspas no índice do banco');
  assert.equal(g('S.D.obra.codigo'), '998'); assert.equal(g('S.view'), 'eap'); assert.equal(g('SB.obraId'), '998');
  assert.match(String(A.el('#view').innerHTML), /Orçamento \(EAP\)/);
  assert.ok(!banco.chamadas.includes('taf_erp_salvar'), 'nada foi salvo como documento');
  assert.ok(A.msgs().some(m => /Obra 998 gravada: 6 itens/.test(m)), A.msgs().join(' | '));
});

test('tela com a chave do site: papel engenheiro não cria; a gravação da base cai e a obra sem orçamento não trava a entrada', async () => {
  const banco = bancoFalso(), A = carregaComChave(banco), g = n => vm.runInContext(n, A.ctx);
  A.ctx.localStorage.setItem('taf-erp-papel', 'engenheiro');
  await g("chEntrar('chave-do-site','Engenheira de Teste',false)");
  assert.match(String(A.el('#view').innerHTML), /data-act="obra-nova" disabled/);
  g("ACOES['obra-nova']()"); assert.ok(A.msgs().some(m => /Só Gestão ou Diretoria/.test(m)));
  g("S.role='gestao'");
  banco.falharBase = true;
  await preencheEGrava(A, banco, '');
  assert.match(String(A.el('#mbox').innerHTML), /A obra 998 foi criada, mas o orçamento não foi gravado/);
  assert.equal(g('ON.criada'), true);
  /* quem entra depois cai na tela de obra sem orçamento, com o botão para subir a planilha */
  const B = carregaComChave(banco), gb = n => vm.runInContext(n, B.ctx);
  B.ctx.localStorage.setItem('taf-erp-papel', 'diretoria');
  await gb("chEntrar('chave-do-site','Diretor de Teste',false)");
  const v = String(B.el('#view').innerHTML);
  assert.match(v, /Obra 998 ainda sem orçamento/); assert.match(v, /data-act="obra-nova-base" data-cod="998"/);
  assert.equal(gb('SB.obraId'), null);
  gb("ACOES['obra-nova-base']({dataset:{cod:'998'}})");
  assert.equal(gb('ON.passo'), 2); assert.equal(gb('ON.criada'), true);
  /* tentar de novo na primeira tela: só grava a base (não cria de novo) */
  const antes = banco.chamadas.filter(c => c === 'taf_erp_obra_criar').length;
  await g("ACOES['on-gravar']()"); for (let k = 0; k < 20; k++) await espera();
  assert.equal(banco.chamadas.filter(c => c === 'taf_erp_obra_criar').length, antes);
  assert.equal(g('S.D.obra.codigo'), '998'); assert.equal(g('S.view'), 'eap');
});

/* ---------- revisão cética: XSS gravado pela base, alcance da chave geral, aba, quantidade zero, valor do contrato ---------- */
const XSS = `<img src=x onerror="window.__pwn=localStorage.getItem('taf-erp-chave');document.title='PWN '+window.__pwn">`;
/* marcação que só pode ter vindo da base de ataque (o ERP usa <b> de propósito em outros lugares) */
const ATAQUE = /<img|<b>Y<|<b>EV<|<b>A cotar<|<b>P<|<script|onerror="|onmouseover="/i;
const semTag = (h, onde) => { assert.ok(!ATAQUE.test(h), onde + ': HTML com marcação vinda da base: ' + (h.match(new RegExp('.{0,60}(' + ATAQUE.source + ').{0,60}', 'i')) || [''])[0]); };
const setON = o => { C.__o = o; vm.runInContext('Object.assign(ON,__o)', C); };
const ON_ = k => vm.runInContext('ON.' + k, C);
/* base de ataque: o que alguém com a chave do site mandaria direto para taf_erp_base_gravar, sem passar pela tela */
function baseAtaque() {
  const { b } = base998();
  const B = J(b);
  B.D.obra.nome = XSS; B.D.obra.contratante = 'X" onmouseover="alert(1)';
  const i11 = B.D.eap.find(e => e.codigo === '1.1');
  Object.assign(i11, { unidade: XSS, pacote: 'X<b>Y</b>', evento: '<b>EV</b>', natureza: { [XSS]: 1, MAT: 1 }, composicao: [{ nat: XSS, share: 1 }], status_cotacao: '<b>A cotar</b>', fonte_meta: XSS, pai: '1.2', nivel: XSS });
  B.D.eap.find(e => e.codigo === '1.2').pai = '1.1';   /* pai em círculo: travaria a árvore do Orçamento */
  B.D.eap.push({ codigo: '"><img src=x onerror=alert(1)>', tipo_linha: 'item', descricao: 'código com tag', qtd: 1, preco_venda_total: 1 });
  B.D.eap.push({ codigo: '9.9', tipo_linha: 'item', descricao: XSS, unidade: 'm', qtd: '1', preco_venda_total: '10', meta_total: { x: 1 } });
  B.D.pacotes = [{ codigo: '<b>P</b>', nome: XSS }, { codigo: 'TUBO', nome: XSS, responsavel: XSS, observacoes: XSS, fechar_ate: '<b>' }];
  B.D.plano = [{ codigo: '4', nome: XSS, nivel: 1, natureza: XSS }, { codigo: '4.1"><b>', nome: 'x', nivel: 2 }];
  B.D.banco_mo = [{ funcao: XSS, equipe: XSS, custo_hora: 10 }];
  B.D.relatorio = { diferenca_contrato: 5, aviso: XSS };
  B.extrato = { linhas: [XSS] }; B.ficha = { contrato: XSS }; B.listas = { tipo: [XSS] };
  return B;
}

test('revisão (alta): base com a marca "tela:" abre pela lista fechada de campos; o XSS da revisão não vira HTML em tela nenhuma', async () => {
  const banco = bancoFalso(), sha = t => crypto.createHash('sha256').update(t).digest('hex');
  /* o caminho que continua aberto à chave do site: criar a própria obra e gravar a primeira base, chamando o banco direto */
  banco.rpc('taf_erp_obra_criar', { p_chave: 'chave-do-site', p_codigo: '997', p_nome: 'Obra do intruso', p_contratante: 'Intruso', p_quem: 'Intruso', p_papel: 'gestao' });
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(baseAtaque()))).toString('base64');
  const r = banco.rpc('taf_erp_base_gravar', { p_chave: 'chave-do-site', p_obra: '997', p_base_gz: gz, p_base_sha: sha(gz), p_quem: 'Intruso', p_papel: 'gestao',
    p_itens: [{ codigo: '1.1', descricao: 'limpo', unidade: 'm', qtd: 1, pacote: null, evento: null, venda: 1, meta: null, teto: null, meta_unit: null }] });
  assert.match(r.base_sha, /^tela:/);
  /* quem abre: Diretoria com a chave guardada no aparelho (é o que o script do ataque queria ler) */
  const V = carregaComChave(banco), g = n => vm.runInContext(n, V.ctx);
  V.ctx.localStorage.setItem('taf-erp-papel', 'diretoria');
  await g("chEntrar('chave-do-site','Diretora de Teste',false)");
  assert.equal(g('SB.obraId'), '997');
  const D = J(g('S.D'));
  assert.equal(D.obra.nome, XSS.replace(/</g, '‹').replace(/>/g, '›').replace(/"/g, '″'));
  assert.deepEqual(D.eap.map(e => e.codigo), ['1', '1.1', '1.2', '2', '2.1', '2.2', '2.3', '2.4', '9.9'], 'código com tag fica de fora');
  const i11 = D.eap.find(e => e.codigo === '1.1'), i12 = D.eap.find(e => e.codigo === '1.2');
  assert.equal(i11.pai, '1'); assert.equal(i12.pai, '1'); assert.equal(i11.nivel, 2, 'nível e pai refeitos pelo código');
  assert.equal(i11.pacote, null); assert.equal(i11.evento, null); assert.deepEqual(i11.natureza, { MAT: 1 }); assert.deepEqual(i11.composicao, []);
  assert.ok(!/[<>"]/.test(i11.unidade));
  const i99 = D.eap.find(e => e.codigo === '9.9');
  assert.equal(i99.qtd, null, 'texto não vira número'); assert.equal(i99.preco_venda_total, null); assert.equal(i99.meta_total, null);
  assert.deepEqual(D.pacotes.map(p => p.codigo), ['TUBO']); assert.equal(D.pacotes[0].fechar_ate, null);
  assert.deepEqual(D.plano.map(p => p.codigo), ['4']);
  assert.equal(g("window.TAF_EXTRATO['997']"), undefined, 'extrato da base gravada pela tela não entra');
  assert.equal(g("FICHA_PAD['997']"), undefined, 'ficha não entra');
  assert.ok(!g('CAD_LISTAS.tipo').some(x => /img/.test(x)), 'listas não entram');
  /* todas as telas do menu e os detalhes desenham sem marcação vinda da base */
  const vistas = V.NAV_BASE.map(n => n[0]).filter(v => v !== 'usuarios');
  for (const v of vistas) { g(`S.view=${JSON.stringify(v)}`); g('render()'); semTag(String(V.el('#view').innerHTML), 'tela ' + v); }
  for (const e of D.eap.filter(x => x.tipo_linha === 'item')) { V.modalItem(e.codigo); semTag(String(V.el('#mbox').innerHTML), 'item ' + e.codigo); }
  V.modalPac('TUBO'); semTag(String(V.el('#mbox').innerHTML), 'pacote');
  assert.equal(g('window.__pwn'), undefined);
});

test('revisão (alta): sem a marca "tela:" (base do carga.py) a base abre como sempre; e as telas escapam o que vem da base', async () => {
  const banco = bancoFalso(), A = carregaComChave(banco), g = n => vm.runInContext(n, A.ctx);
  const B = baseAtaque(); delete B.D.eap.find(e => e.codigo === '1.2').pai;   /* sem o círculo: a base antiga não passa pela limpeza */
  B.D.eap = B.D.eap.filter(e => !/^"/.test(e.codigo) && e.codigo !== '9.9');
  B.D.pacotes = [{ codigo: 'TUBO', nome: XSS }]; B.D.eap.find(e => e.codigo === '1.1').pacote = 'TUBO';
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(B))).toString('base64');
  banco.obras.push({ codigo: '990', nome: 'Obra antiga', contratante: 'Fictício', base_gz: gz, base_sha: 'a'.repeat(64), ver: 1 });
  A.ctx.localStorage.setItem('taf-erp-papel', 'gestao');
  await g("chEntrar('chave-do-site','Gestor de Teste',false)");
  assert.equal(g('SB.obraId'), '990');
  assert.ok(g("window.TAF_EXTRATO['990']"), 'extrato da base antiga continua entrando');
  assert.equal(g('S.D.obra.nome'), XSS, 'base antiga não é mexida');
  /* 10_orcamento, 11_pacotes, 15_medicao e 16_plano_de_contas agora escapam código, unidade, pacote, evento e natureza */
  g("S.exp=new Set(S.D.eap.map(e=>e.codigo));S.t.meds=[{id:'m1',num:'BM-1',item:'1.1',qtd:1,periodo:'2030-01-01',status:'lancada',quem:'x'}];prep()");
  for (const v of ['eap', 'pac', 'plano']) { g(`S.view='${v}'`); g('render()'); semTag(String(A.el('#view').innerHTML), 'tela ' + v); }
  g("S.view='med';S.tab.med='bm'"); g('render()'); semTag(String(A.el('#view').innerHTML), 'medição');
  A.modalItem('1.1'); semTag(String(A.el('#mbox').innerHTML), 'item 1.1');
  A.modalPac('TUBO'); semTag(String(A.el('#mbox').innerHTML), 'pacote');
});

test('revisão: a limpeza da base é idempotente e não muda a base que a tela monta', () => {
  const { b } = base998('144.000,00', [{ codigo: '4', nome: 'Custos', nivel: 1, natureza: null }, { codigo: '4.2.08', nome: 'Material "geral"', nivel: 3, natureza: 'MAT' }]);
  const L1 = J(f('obnLimpaBase')(b, '998')), L2 = J(f('obnLimpaBase')(L1, '998'));
  assert.deepEqual(L2, L1);
  const semPlano = x => { const y = J(x); y.D.plano = []; return y; };
  assert.deepEqual(semPlano(L1).D, semPlano(J(b)).D, 'a base da tela já sai limpa (o D é o mesmo)');
  assert.equal(L1.D.plano[1].nome, 'Material ″geral″');
  assert.deepEqual(Object.keys(L1).sort(), ['D', 'origem']);
});

test('revisão (baixa): quantidade 0 continua item (vazio não é zero) e avisa; só linha sem quantidade e sem preço vira grupo', () => {
  const rows = [['ITEM', 'DESCRIÇÃO', 'UND', 'QUANT.', 'P.UNIT.', 'TOTAL'], ['1', 'GRUPO', '', '', '', '100'], ['1.1', 'Item qtd zero', 'un', '0', '', '0'],
    ['1.2', 'Item normal', 'm', '2', '50', '100'], ['1.3', 'Item com preço sem quantidade', 'vb', '', '30', '30'], ['2', 'Outro grupo', '', '', '', '']];
  const L = f('obnLinhas')({ raw: rows, txt: rows, dec: ',', r0: 1 }, 0, J(f('obnSugere')(rows[0])));
  assert.deepEqual(J(L.linhas.map(x => x.codigo + ':' + x.tipo)), ['1:grupo', '1.1:item', '1.2:item', '1.3:item', '2:grupo']);
  const z = L.linhas.find(x => x.codigo === '1.1');
  assert.equal(z.qtd, 0); assert.equal(z.unidade, 'un'); assert.equal(z.venda, 0);
  assert.deepEqual(J(L.avisos.qtdZero), ['1.1']);
  vm.runInContext("ON=obnNovo('998')", C); setON({ L, passo: 3 });
  assert.match(String(f('obnHtml3()')), /1 item com quantidade zero \(continua item, não vira grupo\): 1\.1/);
});

test('revisão (baixa): a aba do orçamento ganha da CAPA na frente; sem aba que sirva, a tela avisa para escolher', () => {
  const capa = { nome: 'CAPA', txt: [['PREFEITURA FICTÍCIA'], ['Obra 998 · DEMONSTRAÇÃO']], raw: [['PREFEITURA FICTÍCIA'], ['Obra 998 · DEMONSTRAÇÃO']], r0: 1, c0: 0 };
  const resumo = { nome: 'RESUMO', txt: [['ITEM', 'TOTAL'], ['1', '10'], ['2', '20']], raw: [], r0: 1, c0: 0 };
  const orc = ABA998(); orc.nome = 'ORÇAMENTO';
  assert.deepEqual(J(f('obnMelhorAba')([capa, resumo, orc])), { i: 2, ok: true });
  assert.deepEqual(J(f('obnMelhorAba')([capa, resumo])), { i: 1, ok: false }, 'nenhuma liga o mínimo: fica a que liga mais, com aviso');
  assert.deepEqual(J(f('obnMelhorAba')([])), { i: 0, ok: false });
  vm.runInContext("ON=obnNovo('998')", C); setON({ passo: 2, abas: [capa, resumo], aba: 1, avisoAba: true });
  assert.match(String(f('obnCorpo2()')), /escolha a aba.*Nenhuma aba tem as colunas de código, descrição, quantidade e preço/);
});

test('revisão (baixa): sem valor do contrato não grava; "Usar a soma da planilha" é escolha de propósito e fica registrada', () => {
  const { st } = base998('');
  vm.runInContext("ON=obnNovo('998');CH.fixo=true", C); setON({ ...st, passo: 3 });
  assert.equal(f('obnPodeGravar()'), false);
  assert.match(String(f('obnHtml3()')), /Para gravar falta: digitar o valor do contrato/);
  assert.match(String(f('obnHtml3()')), /data-act="on-gravar" disabled/);
  for (const v of ['abc', '0', '-5']) { setON({ valor: v }); assert.equal(f('obnPodeGravar()'), false, v); }
  setON({ valor: '' });
  f("ACOES['on-usa-soma']()");
  assert.equal(ON_('valor'), '144.120,00'); assert.equal(ON_('valorDaSoma'), true); assert.equal(f('obnPodeGravar()'), true);
  assert.equal(f('obnMontaBase(ON,[])').origem.valor_contrato_fonte, 'soma da planilha, confirmada na tela');
  vm.runInContext('CH.fixo=false', C);
  assert.equal(f('obnPodeGravar()'), false, 'chave do site: falta o papel');
  setON({ papel: 'diretoria' }); assert.equal(f('obnPodeGravar()'), true); assert.equal(f('obnPapel()'), 'diretoria');
  vm.runInContext('CH.fixo=false;ON=null', C);
});

test('SQL 04: rascunho não aplicado, idempotente, funções security definer com search_path e só as duas entradas abertas ao site', () => {
  const sql = fs.readFileSync(path.join(RAIZ, 'fonte', 'erp', 'sql', '04_obra_nova.sql'), 'utf8');
  assert.match(sql, /RASCUNHO\. NÃO APLICADO\. Só aplicar no banco com o sim do Felipe, depois de testar/);
  assert.ok(!/^\s*create (table|index) (?!if not exists)/im.test(sql), 'create sem if not exists');
  assert.ok(!/^\s*create function/im.test(sql), 'função sem or replace');
  const fns = [...sql.matchAll(/create or replace function public\.(\w+)\(/g)].map(m => m[1]);
  assert.deepEqual(fns, ['_taf_erp_gestor', 'taf_erp_obra_criar', '_taf_erp_base_trava_meta', 'taf_erp_base_gravar', '_taf_erp_base_voltar']);
  for (const bloco of sql.split(/create or replace function /).slice(1)) assert.match(bloco.split('$$')[0], /security definer set search_path = public/);
  const grant = sql.match(/grant execute on function([\s\S]*?) to anon, authenticated;/)[1];
  assert.ok(grant.includes('taf_erp_obra_criar') && grant.includes('taf_erp_base_gravar') && !/_taf_erp/.test(grant));
  assert.match(sql, /revoke all on function public\._taf_erp_gestor\(text, text, text\), public\._taf_erp_base_voltar\(text, bigint, text\),\s+public\._taf_erp_base_trava_meta\(text\) from public, anon, authenticated/);
  assert.match(sql, /revoke all on public\.taf_erp_base_hist from public, anon, authenticated/);
  assert.ok(!/function public\.(taf_erp_salvar|_taf_erp_pode|_taf_erp_ator)\(/.test(sql), 'não redefine funções que já existem');
  assert.match(sql, /como desfazer/i);
  /* revisão: marca "tela:" posta pelo banco, só obra criada pela tela, nenhum documento, estado sem meta, chave geral só a primeira vez */
  assert.match(sql, /v_sha := 'tela:' \|\| p_base_sha;/);
  assert.match(sql, /update public\.taf_erp_obra set base_gz = p_base_gz, base_sha = v_sha/);
  assert.match(sql, /NAO FOI CRIADA PELA TELA/);
  assert.match(sql, /select count\(\*\) into v_docs from public\.taf_erp_doc d where d\.obra = p_obra;/);
  assert.ok(!/d\.tipo in \('sol'/.test(sql), 'a trava de documento vale para todos os tipos');
  assert.match(sql, /JA TEM META OU AJUSTE NA LINHA DE BASE/);
  assert.match(sql, /SO E GRAVADO UMA VEZ/); assert.match(sql, /FOI CRIADA COM CHAVE PESSOAL/);
  assert.match(sql, /copia_obras_da_tela/, 'cópia das obras da tela antes do 99_reverter');
});

test('integração (alta e média): obra do planejador, Diretoria com todas as obras e proposta de meta no 04, e a tela explica a recusa', () => {
  const sql = fs.readFileSync(path.join(RAIZ, 'fonte', 'erp', 'sql', '04_obra_nova.sql'), 'utf8');
  const criar = sql.split('create or replace function public.taf_erp_obra_criar(')[1].split('end $$;')[0];
  /* código que já existe no planejador: a chave geral não cria, e a pessoal só se já tem a obra ou é Diretoria com todas */
  assert.match(criar, /from public\.taf_ciclo_obra o where o\.obra = v_cod/);
  assert.match(criar, /JA EXISTE NO PLANEJADOR: O ERP DELA SO E CRIADO COM A CHAVE PESSOAL/);
  assert.match(criar, /JA EXISTE NO PLANEJADOR E NAO ESTA NA SUA CHAVE/);
  assert.ok(criar.indexOf('JA EXISTE NO PLANEJADOR') < criar.indexOf('insert into public.taf_erp_obra'), 'a recusa vem antes de criar');
  /* a obra nova entra nas Diretorias com todas as obras, contadas antes de criar */
  assert.match(criar, /where c\.ativo and c\.papel = 'diretoria' and v_cob <@ c\.obras and not \(v_cod = any\(c\.obras\)\)/);
  assert.ok(criar.indexOf('into v_cob') < criar.indexOf('insert into public.taf_erp_obra'), 'Diretorias contadas antes');
  /* proposta de meta pendente ou aprovada trava a gravação e a volta da base */
  const gravar = sql.split('create or replace function public.taf_erp_base_gravar(')[1].split('end $$;')[0];
  const voltar = sql.split('create or replace function public._taf_erp_base_voltar(')[1].split('end $$;')[0];
  for (const b of [gravar, voltar]) assert.match(b, /perform public\._taf_erp_base_trava_meta\(p_obra\);/);
  assert.match(sql, /PROPOSTA DE META PENDENTE \(%\): DECIDA OU CANCELE ANTES DE MUDAR O ORCAMENTO/);
  /* o desfazer avisa da proposta de meta (chave estrangeira) */
  assert.match(sql, /taf_erp_meta_prop_obra|proposta aponta para a obra \(chave estrangeira\)/);
  const obnErro = f('obnErro');
  assert.match(obnErro(new Error('OBRA 996 JA EXISTE NO PLANEJADOR E NAO ESTA NA SUA CHAVE: PECA A DIRETORIA')), /já existe no planejador/);
  assert.match(obnErro(new Error('OBRA 996 JA EXISTE NO PLANEJADOR: O ERP DELA SO E CRIADO COM A CHAVE PESSOAL DE QUEM JA CUIDA DELA')), /chave pessoal de quem já cuida dela/);
  assert.match(obnErro(new Error('OBRA 951 TEM PROPOSTA DE META PENDENTE (1): DECIDA OU CANCELE ANTES DE MUDAR O ORCAMENTO')), /proposta de meta pendente.*Metas/);
  assert.match(obnErro(new Error('OBRA 951 JA TEM META APROVADA: O ORCAMENTO NAO SE REGRAVA. USE ATUALIZAR PELA PLANILHA')), /Atualizar pela planilha/);
});
