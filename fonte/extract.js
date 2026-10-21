function extractRev6(wb) {
  var S = {
    PAR: '02. PARÂMETROS', G: '01A. GESTÃO DA SEMANA', B: '08B. TODAS AS OBRAS', CX: '10. CAIXA',
    FL: 'FLUXO PROJETADO TAF', R: '05C. RESTRIÇÕES', P: 'PAUTA DE SEGUNDA TAF', C: '05A. COMPROMISSO DA SEMANA',
    E: '12. EVM E CURVA S', K: '13. CHECKS', PN: '01. PAINEL'
  };
  function cell(s, a) { var ws = wb.Sheets[s]; var c = ws && ws[a]; return c ? c.v : null; }
  function iso(x) {
    if (x == null || x === '') return null;
    if (typeof x === 'number') { var d = new Date(Math.round((x - 25569) * 864e5)); return d.toISOString().slice(0, 10); }
    if (x instanceof Date) return x.toISOString().slice(0, 10);
    return String(x);
  }
  function f(s, a, isDate) { var v = cell(s, a); return { v: isDate ? iso(v) : (v === undefined ? null : v), ref: s + '!' + a }; }
  var cols = 'CDEFGHIJKLMNOPQR'.split('');
  var obras = ['342', '343', '281'];
  var luzCol = { '342': 'D', '343': 'F', '281': 'H' };
  var numCol = { '342': 'C', '343': 'E', '281': 'G' };
  var bRow = { '342': 5, '343': 6, '281': 7 };
  var out = { corte: f(S.PAR, 'B5', true), semana: f(S.G, 'C3'), obras: {}, perguntas: [] };
  obras.forEach(function (o) {
    var r = bRow[o];
    out.obras[o] = {
      nome: f(S.B, 'A' + r), contrato: f(S.B, 'B' + r), parte: f(S.B, 'Q' + r), medido: f(S.B, 'C' + r),
      pct: f(S.B, 'D' + r), idp: f(S.B, 'J' + r), enviado: f(S.B, 'L' + r), recebido: f(S.B, 'F' + r), fim: f(S.PN, 'K' + (r + 5), true),
      luz: { PRODUCAO: f(S.G, luzCol[o] + '18'), DINHEIRO: f(S.G, luzCol[o] + '19'), PLANO: f(S.G, luzCol[o] + '20') },
      vencidas: f(S.G, numCol[o] + '33'), vencemSemana: f(S.G, numCol[o] + '34'), semDono: f(S.G, numCol[o] + '35'),
      piorCaixa: f(S.FL, { '342': 'C', '343': 'D', '281': null }[o] ? ({ '342': 'C', '343': 'D' }[o] + '14') : 'ZZ1'),
      piorMes: f(S.FL, ({ '342': 'C', '343': 'D' }[o] || 'ZZ') + '15', true)
    };
  });
  for (var i = 6; i <= 15; i++) {
    var p = { n: f(S.G, 'A' + i), q: f(S.G, 'B' + i), por: {} };
    obras.forEach(function (o) { p.por[o] = { num: f(S.G, numCol[o] + i), cor: f(S.G, luzCol[o] + i) }; });
    out.perguntas.push(p);
  }
  out.carteira = f(S.B, 'B9'); out.contratos = f(S.B, 'B8'); out.medidoTaf = f(S.B, 'C9');
  out.caixa = {
    pior: f(S.CX, 'C15'), piorMes: f(S.CX, 'D15', true), giro: f(S.CX, 'C17'), limite: f(S.PAR, 'B11'),
    meses: cols.map(function (c) { return iso(cell(S.CX, c + '3')); }),
    prev: cols.map(function (c) { return cell(S.CX, c + '8'); }),
    real: cols.map(function (c) { return cell(S.CX, c + '13'); }),
    entReal: cols.map(function (c) { return cell(S.CX, c + '10'); }),
    saiReal: cols.map(function (c) { return cell(S.CX, c + '11'); }),
    refPrev: S.CX + '!C8:R8', refReal: S.CX + '!C13:R13', banco: f(S.CX, 'C21')
  };
  out.curva = { meses: cols.map(function (c) { return iso(cell(S.E, c + '3')); }), obras: {} };
  [['342', 5, 6], ['343', 11, 12], ['281', 17, 18]].forEach(function (x) {
    out.curva.obras[x[0]] = {
      vp: cols.map(function (c) { return cell(S.E, c + x[1]); }), va: cols.map(function (c) { return cell(S.E, c + x[2]); }),
      refVp: S.E + '!C' + x[1] + ':R' + x[1], refVa: S.E + '!C' + x[2] + ':R' + x[2]
    };
  });
  out.restricoes = [];
  for (var r = 5; r <= 204; r++) {
    if (!cell(S.R, 'D' + r)) continue;
    out.restricoes.push({
      row: r, n: cell(S.R, 'A' + r), obra: String(cell(S.R, 'B' + r) || ''), frente: cell(S.R, 'C' + r), txt: cell(S.R, 'D' + r),
      tipo: cell(S.R, 'E' + r), ate: iso(cell(S.R, 'F' + r)), dono: cell(S.R, 'G' + r), sit: cell(S.R, 'H' + r),
      resolvida: iso(cell(S.R, 'I' + r)), dias: cell(S.R, 'K' + r), alerta: cell(S.R, 'L' + r), natureza: cell(S.R, 'M' + r),
      impacto: cell(S.R, 'O' + r), pxi: cell(S.R, 'Q' + r), resposta: cell(S.R, 'R' + r), nova: iso(cell(S.R, 'U' + r))
    });
  }
  out.decisoes = [];
  for (var d = 23; d <= 25; d++) {
    out.decisoes.push({ ref: S.G + '!A' + d + ':F' + d, fonte: '01A', obra: String(cell(S.G, 'A' + d)), txt: cell(S.G, 'B' + d), dono: cell(S.G, 'C' + d), prazo: iso(cell(S.G, 'D' + d)), sit: cell(S.G, 'E' + d), obs: cell(S.G, 'F' + d) });
  }
  for (var q = 67; q <= 110; q++) {
    if (!cell(S.P, 'A' + q) || !cell(S.P, 'D' + q)) continue;
    out.decisoes.push({ ref: S.P + '!A' + q + ':E' + q, fonte: 'PAUTA', obra: '', txt: cell(S.P, 'A' + q), dono: cell(S.P, 'B' + q), prazo: iso(cell(S.P, 'C' + q)), sit: cell(S.P, 'D' + q), obs: cell(S.P, 'E' + q) });
  }
  out.compromissos = [];
  for (var k = 5; k <= 204; k++) {
    if (!cell(S.C, 'E' + k)) continue;
    out.compromissos.push({ row: k, semana: iso(cell(S.C, 'A' + k)), obra: String(cell(S.C, 'B' + k)), frente: cell(S.C, 'D' + k), txt: cell(S.C, 'E' + k), qtd: cell(S.C, 'F' + k), un: cell(S.C, 'G' + k), resp: cell(S.C, 'H' + k), trav: cell(S.C, 'I' + k), conf: cell(S.C, 'J' + k), apont: cell(S.C, 'K' + k), cumprida: cell(S.C, 'M' + k) });
  }
  out.checks = [];
  for (var j = 5; j <= 40; j++) {
    if (!cell(S.K, 'B' + j)) continue;
    out.checks.push({ ref: S.K + '!A' + j, n: cell(S.K, 'A' + j), txt: cell(S.K, 'B' + j), res: cell(S.K, 'C' + j), fazer: cell(S.K, 'D' + j) });
  }
  out.master = f(S.K, 'C3');
  out.base = {};
  obras.forEach(function (o) { out.base[o] = { uteis: f(S.G, numCol[o] + '28'), apont: f(S.G, numCol[o] + '29'), cob: f(S.G, numCol[o] + '30'), conf: f(S.G, numCol[o] + '31'), prop: f(S.G, numCol[o] + '32'), paradas: f(S.G, numCol[o] + '36') }; });
  var BM = '06. MEDIÇÃO (BM)', NF = '07. FATURAMENTO E RECEBIMENTO', AP = '05B. APONTAMENTO DIÁRIO', SE = '05. SEMANAS', CL = '15. CHANGELOG';
  out.bms = [];
  for (var b = 5; b <= 44; b++) { if (!cell(BM, 'C' + b)) continue;
    out.bms.push({ row: b, obra: String(cell(BM, 'B' + b)), bm: cell(BM, 'C' + b), mes: iso(cell(BM, 'D' + b)), envio: iso(cell(BM, 'E' + b)), sit: cell(BM, 'F' + b), bruto: cell(BM, 'G' + b), liq: cell(BM, 'I' + b), aprov: iso(cell(BM, 'J' + b)), obs: cell(BM, 'K' + b), pago: iso(cell(BM, 'L' + b)) }); }
  out.nfs = [];
  for (var n2 = 5; n2 <= 44; n2++) { if (!cell(NF, 'C' + n2)) continue;
    out.nfs.push({ row: n2, obra: String(cell(NF, 'B' + n2)), bm: cell(NF, 'C' + n2), nf: cell(NF, 'D' + n2), emissao: iso(cell(NF, 'E' + n2)), valor: cell(NF, 'F' + n2), prevista: iso(cell(NF, 'J' + n2)), recebido: iso(cell(NF, 'K' + n2)), vrec: cell(NF, 'L' + n2), obs: cell(NF, 'N' + n2), reaj: cell(NF, 'S' + n2) }); }
  out.apont = [];
  for (var a2 = 5; a2 <= 1004; a2++) { if (!cell(AP, 'A' + a2) || !cell(AP, 'B' + a2)) continue;
    out.apont.push({ row: a2, data: iso(cell(AP, 'A' + a2)), obra: String(cell(AP, 'B' + a2)), frente: cell(AP, 'C' + a2), equipe: cell(AP, 'D' + a2), serv: cell(AP, 'E' + a2), qtd: cell(AP, 'F' + a2), un: cell(AP, 'G' + a2), pessoas: cell(AP, 'H' + a2), parou: cell(AP, 'K' + a2), motivo: cell(AP, 'L' + a2), hparadas: cell(AP, 'M' + a2), obs: cell(AP, 'N' + a2) }); }
  out.semanas = [];
  for (var s2 = 5; s2 <= 64; s2++) { if (!cell(SE, 'B' + s2)) continue;
    out.semanas.push({ row: s2, sexta: iso(cell(SE, 'A' + s2)), obra: String(cell(SE, 'B' + s2)), prom: cell(SE, 'C' + s2), cump: cell(SE, 'D' + s2), ppc: cell(SE, 'E' + s2), efetivo: cell(SE, 'F' + s2), dias: cell(SE, 'G' + s2), uteis: cell(SE, 'H' + s2), restr: cell(SE, 'I' + s2), cli: cell(SE, 'J' + s2), causa: cell(SE, 'K' + s2) }); }
  out.changelog = [];
  for (var c2 = 5; c2 <= 60; c2++) { if (!cell(CL, 'B' + c2)) continue; out.changelog.push({ row: c2, data: iso(cell(CL, 'A' + c2)), txt: cell(CL, 'B' + c2) }); }
  return out;
}
if (typeof module !== 'undefined') module.exports = extractRev6;
