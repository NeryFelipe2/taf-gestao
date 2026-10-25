'use strict';
/* Ambiente simulado para testar o ERP no Node, sem navegador, sem rede e sem banco.
   Monta o mesmo script que fonte/erp/build.py monta (embed.js + js/*.js em ordem de nome), roda dentro de um contexto
   do módulo vm com um "document" de mentira, e devolve as funções do ERP para os testes chamarem.
   Nada aqui abre chave, lê .env ou fala com o Supabase: o fetch do contexto sempre recusa. */
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const RAIZ = path.resolve(__dirname, '..', '..', '..');
const JS = path.join(RAIZ, 'fonte', 'erp', 'js');
/* commit de partida do branch (antes de M1 e M2): serve de "como era hoje" nas provas de resultado idêntico */
const BASE_REF = '243d676';
/* o boot abre a obra pela rede; no teste quem abre a obra é o próprio teste */
const FORA = new Set(['99_boot.js']);

function nomesTrabalho() { return fs.readdirSync(JS).filter(f => f.endsWith('.js')).sort(); }
function lerTrabalho(n) { return fs.readFileSync(path.join(JS, n), 'utf8'); }
function nomesBase() {
  const o = cp.execFileSync('git', ['ls-tree', '--name-only', BASE_REF, 'fonte/erp/js/'], { cwd: RAIZ, encoding: 'utf8' });
  return o.split('\n').filter(Boolean).map(p => path.basename(p)).filter(f => f.endsWith('.js')).sort();
}
function lerBase(n) { return cp.execFileSync('git', ['show', BASE_REF + ':fonte/erp/js/' + n], { cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); }

/* elemento de mentira: aceita qualquer atribuição e responde o mínimo que o ERP pergunta */
function el() {
  const e = {
    style: {}, dataset: {}, children: [], files: [], value: '', innerHTML: '', textContent: '', checked: false, disabled: false, id: '',
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    querySelectorAll: () => [], querySelector: () => el(), closest: () => null, getAttribute: () => null, setAttribute() {}, removeAttribute() {},
    contains: () => false, matches: () => false, appendChild() {}, remove() {}, addEventListener() {}, removeEventListener() {},
    focus() {}, select() {}, setSelectionRange() {}, click() {}, getBoundingClientRect: () => ({ width: 0, height: 0, top: 0, left: 0 }),
  };
  e.parentNode = { style: {}, appendChild() {}, removeChild() {} };
  return e;
}

function criaContexto() {
  const mem = new Map();
  const ouvintes = {};   /* addEventListener do document guarda aqui, para o teste disparar o clique de verdade (api.clicar) */
  const dom = {};   /* elementos por seletor: o teste preenche dom['#rm-v'].value e a função do ERP lê o mesmo elemento */
  const doc = {
    querySelector: s => dom[s] || (dom[s] = el()), querySelectorAll: () => [], getElementById: () => el(), createElement: () => el(),
    addEventListener(t, f) { (ouvintes[t] = ouvintes[t] || []).push(f); }, removeEventListener() {}, activeElement: el(), documentElement: el(), body: el(), head: el(),
    contains: () => false, visibilityState: 'visible', cookie: '',
  };
  const sb = {
    console, document: doc, navigator: { onLine: true, userAgent: 'node-teste' },
    location: { search: '', pathname: '/teste', href: 'http://teste/teste', origin: 'http://teste', hash: '' },
    localStorage: { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: k => { mem.delete(k); } },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: () => Promise.reject(new Error('sem rede (ambiente de teste)')),
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    URLSearchParams, Blob, TextEncoder, TextDecoder, atob, btoa, Intl, Date, Math, JSON, Promise,
  };
  sb.window = sb;
  sb.__dom = dom;
  sb.__ouvintes = ouvintes;
  sb.addEventListener = () => {};
  sb.removeEventListener = () => {};
  sb.parent = sb;
  sb.TAF_CONFIG = {};   /* modo aberto: sem URL nem chave, nada de Supabase */
  return vm.createContext(sb);
}

/* nomes que os testes pedem ao ERP; os que não existirem (ex.: contaObra no código de partida) vêm como undefined */
const NOMES = ['S', 'novoT', 'prep', 'saldos', 'derive', 'alertas', 'semaforo', 'contaObra', 'calcV2', 'viewEap', 'viewPac', 'viewPlano', 'planoSaldos',
  'painelLinhas', 'provOcs', 'provOcsSplit', 'provLinhas', 'areasVisiveis', 'calculaDiff', 'syncAplicar', 'modalSync', 'doRemanejar', 'modalRemanejar', 'pacRow', 'viewHoje',
  'viewEventos', 'agregaEventos', 'agregaPacotes', 'agregaGrupos', 'semGrupo', 'pacTeto', 'pacMeta', 'ACOES', 'AREAS', 'tabVisivel', 'NAV_BASE', 'cmpCod', 'brl', 'r2',
  'pintaRat', 'modalParams', 'painelCalc', 'resItem', 'medAcum', 'aplicaDocs', 'estadoObra', 'log', 'save', 'user', 'can', 'ROLES', 'modalItem', 'modalPac',
  'chavesObra', 'CHAVES_OBRA', 'DOCS', 'SEM_CLASS', 'restAuto', 'pacDe', 'evDe', 'realPorConta', 'dre', 'sugereOC', 'modalNF', 'vistaPermitida', 'chaveLigada', 'avisoSqlCalc', 'viewRastro'];

/* origem: 'trabalho' (os arquivos da cópia) ou 'base' (como era no commit de partida, lido do git) */
function carrega(origem = 'trabalho') {
  const ctx = criaContexto();
  const nomes = origem === 'base' ? nomesBase() : nomesTrabalho();
  const ler = origem === 'base' ? lerBase : lerTrabalho;
  const partes = ['const MANUAIS={};', fs.readFileSync(path.join(RAIZ, 'fonte', 'embed.js'), 'utf8')];
  nomes.filter(n => !FORA.has(n)).forEach(n => partes.push(ler(n)));
  vm.runInContext(partes.join('\n'), ctx, { filename: 'erp-' + origem + '.js' });
  const expr = '({' + NOMES.map(n => `get ${n}(){return typeof ${n}!=='undefined'?${n}:undefined}`).join(',') + '})';
  const api = vm.runInContext(expr, ctx);
  api.ctx = ctx;
  api.dom = ctx.__dom;
  api.el = sel => ctx.document.querySelector(sel);   /* cria (se preciso) e devolve o elemento do seletor */
  api.origem = origem;
  /* clique de verdade num botão data-act (o mesmo caminho da tela: document click -> tabela A -> ACOES) */
  api.clicar = (act, extra = {}) => {
    const alvo = el();
    alvo.closest = sel => (sel === '[data-act]' ? { dataset: { act, ...extra }, disabled: false } : null);
    (ctx.__ouvintes.click || []).forEach(f => f({ target: alvo }));
  };
  return api;
}

/* abre uma obra de mentira no ERP carregado: D = dados fixos (eap, pacotes...), t = estado (ocs, notas, par...) */
function abre(api, D, t = {}, papel = 'gestao') {
  const S = api.S;
  S.D = JSON.parse(JSON.stringify(D));
  S.t = Object.assign(api.novoT(), JSON.parse(JSON.stringify(t)));
  if (t.par) S.t.par = Object.assign({ tol: 0.02, limite: 100000 }, JSON.parse(JSON.stringify(t.par)));
  S.role = papel; S.exp = new Set(); S.tab = {}; S.view = 'dash'; S.q = ''; S.memo = null;
  api.prep();
  return S;
}

module.exports = { carrega, abre, RAIZ, BASE_REF };
