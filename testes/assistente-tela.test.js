'use strict';
// Regras da tela do assistente (fonte/ciclo-ia.js) e a chamada CC.assistente (fonte/ciclo-core.js), sem navegador e sem rede.
// Dado só da OBRA 999 · DEMONSTRAÇÃO (fictícia).
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm'), fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

function carregar() {
  const mem = {};
  const window = {
    location: { search: '?obra=999', pathname: '/marko' }, navigator: { onLine: true }, addEventListener() {},
    localStorage: { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } },
    crypto: require('crypto').webcrypto, AbortController,
  };
  const document = { getElementById: () => null, addEventListener() {}, createElement: () => ({}), head: null, visibilityState: 'visible' };
  // relógios soltos (unref): o núcleo agenda a fila a cada 15 s e o teste não pode ficar preso esperando
  const solto = (fn) => (f, ms) => { const t = fn(f, ms); if (t && t.unref) t.unref(); return t; };
  const ctx = { window, document, console, setTimeout: solto(setTimeout), clearTimeout, setInterval: solto(setInterval), clearInterval, Intl, Promise, Date, Math, JSON, Blob,
    chamadas: [], resposta: null };
  ctx.fetch = async (url, opts) => { ctx.chamadas.push({ url: String(url), opts }); if (!ctx.resposta) throw new TypeError('sem rede'); return ctx.resposta(url, opts); };
  vm.createContext(ctx);
  vm.runInContext(ler('fonte/ciclo-core.js'), ctx);
  vm.runInContext(ler('fonte/ciclo-ia.js'), ctx);
  return { CC: window.CC, ctx, mem };
}

const SEG = '2026-10-26', HOJE = '2026-10-28';
function leitura() {
  return { seg: SEG, hoje: HOJE, semana: { seg: SEG, estado: 'publicada', comps: [
    { cid: 'C1', ativ: 'T1', ativ_nome: 'Escavação de vala Rua A', qtd: 120, un: 'm', entrega: '120 m', prometido: '2026-10-30',
      apont: [{ dia: '2026-10-26', situacao: 'parado', causa: 'CHUVA', causa_det: 'acima do normal (no diário)', qtd: 3, obs: 'nota antiga', link: 'https://exemplo.invalid/foto', demanda: 2, em: '2026-10-26T20:00:00Z', quem: 'Eng. Teste 999' }] },
    { cid: 'C2', ativ: null, titulo: 'Placa da obra', frente: 'ADM', qtd: null, un: null, entrega: 'Placa instalada', prometido: '2026-10-29', apont: [] },
    { cid: 'C3', ativ: 'T3', qtd: 12, un: 'un', entrega: '12 ligações', prometido: '2026-10-30', cancelado_em: '2026-10-27T10:00:00Z', resultado: 'nao', apont: [] },
    { cid: 'C4', ativ: 'T4', qtd: 10, un: 'm', entrega: '10 m', prometido: '2026-10-30', resultado: 'cumprido', apont: [] },
  ] } };
}

describe('CC.ia: regras puras', () => {
  let CC;
  beforeEach(() => { CC = carregar().CC; });

  it('dias permitidos: da segunda até hoje, nunca o futuro', () => {
    assert.deepEqual(Array.from(CC.ia.diasPermitidos(leitura(), HOJE)), ['2026-10-26', '2026-10-27', '2026-10-28']);
    assert.deepEqual(Array.from(CC.ia.diasPermitidos(leitura(), '2026-11-05')).length, 7);
    assert.deepEqual(Array.from(CC.ia.diasPermitidos(leitura(), '2026-10-20')), []);
    assert.deepEqual(Array.from(CC.ia.diasPermitidos({ seg: 'x' }, HOJE)), []);
  });

  it('conferir: aceita o certo e recusa o que o banco recusaria', () => {
    const L = leitura(), p = (x) => Object.assign({ cid: 'C1', dia: '2026-10-27', situacao: 'andou', qtd: '35', causa: '', obs: '' }, x);
    assert.equal(CC.ia.conferir(p(), L, HOJE), '');
    assert.equal(CC.ia.conferir(p({ qtd: '' }), L, HOJE), '', 'quantidade vazia = não informado');
    assert.equal(CC.ia.conferir(p({ qtd: '2,5' }), L, HOJE), '', 'vírgula decimal');
    assert.equal(CC.ia.conferir(p({ situacao: 'parado', causa: 'CHUVA', qtd: '' }), L, HOJE), '');
    assert.match(CC.ia.conferir(p({ cid: 'C9' }), L, HOJE), /não existe/);
    assert.match(CC.ia.conferir(p({ cid: 'C3' }), L, HOJE), /cancelado/);
    assert.match(CC.ia.conferir(p({ cid: 'C4' }), L, HOJE), /fechado/);
    assert.match(CC.ia.conferir(p({ dia: '2026-10-29' }), L, HOJE), /até hoje/);
    assert.match(CC.ia.conferir(p({ dia: '2026-10-19' }), L, HOJE), /até hoje/);
    assert.match(CC.ia.conferir(p({ situacao: 'feito' }), L, HOJE), /situação/);
    assert.match(CC.ia.conferir(p({ situacao: 'parado', causa: '' }), L, HOJE), /causa/);
    assert.match(CC.ia.conferir(p({ situacao: 'parado', causa: 'FALTA DE SORTE' }), L, HOJE), /causa/);
    assert.match(CC.ia.conferir(p({ qtd: '-1' }), L, HOJE), /Quantidade/);
    assert.match(CC.ia.conferir(p({ qtd: 'muito' }), L, HOJE), /Quantidade/);
    assert.match(CC.ia.conferir(p({ obs: 'x'.repeat(301) }), L, HOJE), /300/);
    const fech = leitura(); fech.semana.estado = 'fechada';
    assert.match(CC.ia.conferir(p(), fech, HOJE), /publicada/);
  });

  it('dados da ação apont: iguais ao apontamento à mão, guardando o que já estava no dia', () => {
    const L = leitura(), c1 = L.semana.comps[0], c2 = L.semana.comps[1];
    // dia com apontamento: troca a situação, mas link, demanda e em_lido seguem; quantidade e nota vazias ficam as de antes
    let d = CC.ia.dados({ cid: 'C1', dia: '2026-10-26', situacao: 'andou', qtd: '', causa: '', obs: '' }, c1, SEG);
    assert.deepEqual(JSON.parse(JSON.stringify(d)), { seg: SEG, cid: 'C1', dia: '2026-10-26', situacao: 'andou', qtd: 3, obs: 'nota antiga',
      link: 'https://exemplo.invalid/foto', demanda: 2, em_lido: '2026-10-26T20:00:00Z' });
    // quantidade e nota da proposta valem
    d = CC.ia.dados({ cid: 'C1', dia: '2026-10-26', situacao: 'andou', qtd: '35,5', causa: '', obs: ' vala aberta ' }, c1, SEG);
    assert.equal(d.qtd, 35.5);
    assert.equal(d.obs, 'vala aberta');
    // parado: leva a causa, sem quantidade; o detalhe da causa fica se a causa é a mesma
    d = CC.ia.dados({ cid: 'C1', dia: '2026-10-26', situacao: 'parado', qtd: '9', causa: 'CHUVA', obs: '' }, c1, SEG);
    assert.equal(d.causa, 'CHUVA');
    assert.equal(d.causa_det, 'acima do normal (no diário)');
    assert.ok(!('qtd' in d));
    d = CC.ia.dados({ cid: 'C1', dia: '2026-10-26', situacao: 'parado', qtd: '', causa: 'MATERIAL', obs: '' }, c1, SEG);
    assert.ok(!('causa_det' in d));
    // dia novo, sem apontamento: só o que a proposta traz
    d = CC.ia.dados({ cid: 'C1', dia: '2026-10-27', situacao: 'andou', qtd: '', causa: 'CHUVA', obs: '' }, c1, SEG);
    assert.deepEqual(JSON.parse(JSON.stringify(d)), { seg: SEG, cid: 'C1', dia: '2026-10-27', situacao: 'andou' });
    // compromisso sem unidade não leva quantidade
    d = CC.ia.dados({ cid: 'C2', dia: '2026-10-28', situacao: 'entregue', qtd: '2', causa: '', obs: '' }, c2, SEG);
    assert.ok(!('qtd' in d));
  });

  it('erro amigável: sem sinal, tempo esgotado e texto do servidor', () => {
    assert.match(CC.ia.erroTexto({ rede: true }), /Sem sinal/);
    assert.match(CC.ia.erroTexto({ rede: true, tempo: true }), /demorou/);
    assert.equal(CC.ia.erroTexto(new Error('A IA ainda não está ligada neste sistema.')), 'A IA ainda não está ligada neste sistema.');
  });
});

describe('CC.assistente: chamada ao /api/assistente', () => {
  const chave = 'chave-de-teste-' + Date.now();
  const resp = (status, obj) => async () => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

  it('POST no mesmo site, chave só no cabeçalho, obra e nome no corpo', async () => {
    const { CC, ctx } = carregar();
    CC.init({ chave, quem: 'Eng. Teste 999', obra: '999' });
    ctx.resposta = resp(200, { ok: true, acao: 'relato', propostas: [] });
    const r = await CC.assistente({ acao: 'relato', relato: 'texto do relato de teste', seg: SEG });
    assert.equal(r.ok, true);
    const c = ctx.chamadas.filter((x) => x.url === '/api/assistente');
    assert.equal(c.length, 1);
    assert.equal(c[0].opts.method, 'POST');
    assert.equal(c[0].opts.headers['x-chave'], chave);
    assert.ok(!c[0].url.includes(chave));
    const b = JSON.parse(c[0].opts.body);
    assert.deepEqual(b, { obra: '999', quem: 'Eng. Teste 999', acao: 'relato', relato: 'texto do relato de teste', seg: SEG });
    assert.ok(!c[0].opts.body.includes(chave), 'a chave não vai no corpo');
  });

  it('erro do servidor vira mensagem: IA desligada (503), limite (429), endpoint fora (404), sem sinal', async () => {
    const { CC, ctx } = carregar();
    CC.init({ chave, obra: '999' });
    ctx.resposta = resp(503, { ok: false, erro: 'A IA ainda não está ligada neste sistema.' });
    await assert.rejects(CC.assistente({ acao: 'pergunta', pergunta: 'Tudo certo?' }), (e) => e.status === 503 && /não está ligada/.test(CC.ia.erroTexto(e)));
    ctx.resposta = resp(429, { ok: false, erro: 'Você já usou a IA 30 vez(es) hoje, o limite do dia.' });
    await assert.rejects(CC.assistente({ acao: 'pergunta', pergunta: 'Tudo certo?' }), (e) => e.status === 429 && /limite do dia/.test(e.message));
    ctx.resposta = async () => new Response('não achei', { status: 404 });
    await assert.rejects(CC.assistente({ acao: 'pergunta', pergunta: 'Tudo certo?' }), (e) => /ainda não está no ar/.test(e.message));
    ctx.resposta = null;
    await assert.rejects(CC.assistente({ acao: 'pergunta', pergunta: 'Tudo certo?' }), (e) => e.rede === true && /Sem sinal/.test(CC.ia.erroTexto(e)));
  });

  it('sem chave não chama nada', async () => {
    const { CC, ctx } = carregar();
    await assert.rejects(CC.assistente({ acao: 'pergunta', pergunta: 'Tudo certo?' }), (e) => e.status === 401);
    assert.equal(ctx.chamadas.filter((x) => x.url === '/api/assistente').length, 0);
  });
});

describe('telas: ligação e regras do código', () => {
  const ia = ler('fonte/ciclo-ia.js'), marko = ler('fonte/marko.html'), ciclo = ler('fonte/ciclo.html');
  it('o módulo não grava: não usa a fila, nem rpc, nem função de gravação', () => {
    const codigo = ia.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!/CC\.enviar|CC\.rpc|taf_ciclo_salvar|localStorage|CC\.ls\./.test(codigo));
    assert.ok(!/<\/script/i.test(ia) && !ia.includes('<!--'), 'não pode fechar a tag script nem abrir comentário HTML');
  });
  it('o /marko grava os marcados pelo mesmo caminho do apontamento à mão (enviar apont no cartão do compromisso)', () => {
    const f = /function iaGravar\(lista\)\{[\s\S]*?\n\}\n/.exec(marko);
    assert.ok(f, 'iaGravar existe');
    assert.match(f[0], /enviar\('apont',d,\{k:k,/);
    assert.match(f[0], /k='hc:'\+L\.seg\+'\|'\+c\.cid/, 'mesma chave de cartão do apontamento à mão');
    assert.match(f[0], /guardarAntes\(p,/, 'desfaz na hora se o servidor recusar');
    assert.match(marko, /CC\.ia\.painelRelato\(host,\{ler:Lh,hoje:hj,gravar:iaGravar\}\)/);
    assert.match(marko, /if\(!ro&&CC\.ia\)it\.push\(\{k:'hia:'/, 'só aparece para quem aponta e em semana aberta');
  });
  it('o /ciclo põe "Perguntar ao assistente" na Situação, depois do Copiar resumo', () => {
    assert.match(ciclo, /<div id="s-copiar"><\/div>\n\s*<div id="s-ia"><\/div>/);
    assert.match(ciclo, /CC\.ia\.painelPergunta\(\$\('s-ia'\), \{ papel: papel \}\)/);
  });
  it('as duas montagens juntam o módulo da IA', () => {
    assert.match(ler('fonte/marko.py'), /ciclo-ia\.js/);
    assert.match(ler('fonte/ciclo.py'), /ciclo-ia\.js/);
  });
});
