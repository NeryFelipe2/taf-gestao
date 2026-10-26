'use strict';
// Leitura da rev6 -> conferir, guardar em JSON local ou enviar ao banco. NÃO escreve nada em public/.
//
//   node fonte/gerar-seed.js <rev6.xlsx | leitura.json>                  só confere e mostra o resumo
//   node fonte/gerar-seed.js <rev6.xlsx | leitura.json> --salvar [arq]   grava JSON local (padrão: leitura-local.json na raiz; o Git ignora)
//   node fonte/gerar-seed.js <rev6.xlsx | leitura.json> --enviar         POST para /api/leitura (chave em TAF_CHAVE)
//
// Opções: --url <endereço do endpoint> (ou variável TAF_URL)   --quem <nome>
// A chave vai SÓ pela variável de ambiente TAF_CHAVE e SÓ no cabeçalho x-chave. Nunca em argumento, nunca na URL.
// Para ler .xlsx precisa do pacote: npm i xlsx@0.18.5 (fora do repositório).
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { validarSnap, LIMITE_BYTES } = require('../public/api/leitura.js');

const RAIZ = path.join(__dirname, '..');
const PUBLICO = path.join(RAIZ, 'public');
const URL_PADRAO = 'https://taf-gestao.vercel.app/api/leitura';
const LOCAIS = ['localhost', '127.0.0.1', '[::1]', '::1'];

function lerArgs(argv, env) {
  env = env || process.env;
  const a = { arquivo: null, enviar: false, salvar: null, url: env.TAF_URL || URL_PADRAO, quem: 'Claude' };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--enviar') a.enviar = true;
    else if (t === '--salvar') {
      const p = argv[i + 1];
      if (p && !p.startsWith('--')) { a.salvar = p; i++; } else a.salvar = path.join(RAIZ, 'leitura-local.json');
    } else if (t === '--url') a.url = argv[++i];
    else if (t === '--quem') a.quem = argv[++i];
    else if (/^--(chave|k|key|token|senha)/i.test(t)) throw new Error('a chave não vai na linha de comando: use a variável de ambiente TAF_CHAVE');
    else if (t.startsWith('--')) throw new Error('opção desconhecida: ' + t);
    else if (!a.arquivo) a.arquivo = t;
    else throw new Error('argumento a mais: ' + t);
  }
  if (!a.url) throw new Error('--url sem valor');
  if (!a.quem) throw new Error('--quem sem valor');
  return a;
}

function lerEntrada(arq) {
  if (/\.json$/i.test(arq)) {
    const o = JSON.parse(fs.readFileSync(arq, 'utf8'));
    return { snap: o.snap, fonte: o.fonte || path.basename(arq) };
  }
  let X;
  try { X = require('xlsx'); } catch (e) { throw new Error('falta o pacote xlsx: npm i xlsx@0.18.5 (fora do repositório)'); }
  const extract = require('./extract.js');
  const snap = extract(X.readFile(arq));
  return { snap, fonte: path.basename(arq) + ' (corte ' + (snap.corte && snap.corte.v) + ')' };
}

function conferir(snap, fonte, quem) {
  const problemas = validarSnap(snap);
  if (problemas.length) throw new Error('leitura fora do formato:\n  - ' + problemas.join('\n  - '));
  const bytes = Buffer.byteLength(JSON.stringify({ snap, fonte, quem }));
  if (bytes > LIMITE_BYTES) throw new Error('leitura grande demais: ' + bytes + ' bytes (máx. ' + LIMITE_BYTES + ')');
  return bytes;
}

function resumo(snap) {
  return Object.keys(snap).map((k) => (Array.isArray(snap[k]) ? k + ': ' + snap[k].length : null)).filter(Boolean).join(', ');
}

function destinoSalvarOk(arq) {
  const rel = path.relative(PUBLICO, path.resolve(arq));
  return rel.startsWith('..') || path.isAbsolute(rel); // fora de public/
}

function salvarLocal(arq, snap, fonte) {
  if (!destinoSalvarOk(arq)) throw new Error('não gravo a leitura dentro de public/ (vai para o repositório público)');
  fs.writeFileSync(arq, JSON.stringify({ fonte, snap }), { mode: 0o600 });
  let avisoGit = null;
  try {
    const r = cp.spawnSync('git', ['check-ignore', '-q', path.resolve(arq)], { cwd: RAIZ });
    if (r.status === 1) avisoGit = 'ATENÇÃO: ' + arq + ' NÃO está no .gitignore; não faça commit dele';
  } catch (e) { /* sem git: segue */ }
  return avisoGit;
}

function conferirDestino(url, chave) {
  let u;
  try { u = new URL(url); } catch (e) { throw new Error('endereço do endpoint inválido'); }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && LOCAIS.includes(u.hostname))) throw new Error('a chave só pode ir por https (http só para localhost)');
  if (u.search || u.hash || u.username || u.password) throw new Error('o endereço não pode ter ?parâmetros, #trecho nem usuário:senha');
  if (!chave) throw new Error('defina a variável de ambiente TAF_CHAVE (a chave de acesso do site)');
  return u;
}

async function enviar(o) {
  const chave = o.chave !== undefined ? o.chave : process.env.TAF_CHAVE;
  const u = conferirDestino(o.url, chave);
  const f = o.fetchImpl || globalThis.fetch;
  const r = await f(u.href, {
    method: 'POST',
    redirect: 'error', // um redirecionamento levaria o cabeçalho x-chave para outro lugar
    headers: { 'content-type': 'application/json', 'x-chave': chave },
    body: JSON.stringify({ snap: o.snap, fonte: o.fonte, quem: o.quem }),
  });
  const t = await r.text();
  let j = null;
  try { j = JSON.parse(t); } catch (e) { /* não é JSON */ }
  return { ok: r.ok, status: r.status, corpo: j };
}

async function principal(argv, env) {
  const a = lerArgs(argv, env);
  if (!a.arquivo) {
    console.error('uso: node fonte/gerar-seed.js <rev6.xlsx | leitura.json> [--salvar [arquivo]] [--enviar] [--url endereço] [--quem nome]');
    return 1;
  }
  const { snap, fonte } = lerEntrada(a.arquivo);
  const bytes = conferir(snap, fonte, a.quem);
  console.log('leitura ok: ' + fonte + ' | ' + bytes + ' bytes | ' + resumo(snap));
  if (a.salvar) {
    const aviso = salvarLocal(a.salvar, snap, fonte);
    console.log('guardada em ' + a.salvar + ' (arquivo local; o Git ignora)');
    if (aviso) console.error(aviso);
  }
  if (a.enviar) {
    const r = await enviar({ snap, fonte, quem: a.quem, url: a.url, chave: (env || process.env).TAF_CHAVE });
    if (!r.ok) {
      console.error('NÃO gravou (' + r.status + '): ' + ((r.corpo && r.corpo.erro) || 'sem detalhe'));
      return 1;
    }
    console.log('enviada e gravada no banco' + (r.corpo && r.corpo.id != null ? ' (id ' + r.corpo.id + ')' : ''));
  }
  if (!a.salvar && !a.enviar) console.log('só conferi: nada foi gravado nem enviado (use --salvar ou --enviar)');
  return 0;
}

module.exports = { lerArgs, lerEntrada, conferir, enviar, conferirDestino, destinoSalvarOk, principal };

if (require.main === module) {
  principal(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error('erro: ' + e.message); process.exit(1); });
}
