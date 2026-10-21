// node gerar-seed.js <rev6.xlsx> : lê a rev6 (mesmas células do painel) e gera public/api/seed.js
// precisa do pacote: npm i xlsx@0.18.5 (fora do repositório)
const fs = require('fs'), path = require('path');
const X = require('xlsx'), extract = require('./extract.js');
const f = process.argv[2];
if (!f) { console.error('uso: node gerar-seed.js <rev6.xlsx>'); process.exit(1); }
const snap = extract(X.readFile(f));
if (!snap.restricoes || !snap.restricoes.length) throw new Error('sem restrições: arquivo errado?');
const tpl = fs.readFileSync(path.join(__dirname, 'seed.template.js'), 'utf8');
const fonte = path.basename(f) + ' (corte ' + (snap.corte && snap.corte.v) + ')';
const out = tpl.replace('/*FONTE*/', JSON.stringify(fonte)).replace('/*SNAP*/', () => JSON.stringify(snap));
fs.writeFileSync(path.join(__dirname, '..', 'public', 'api', 'seed.js'), out);
console.log('ok', fonte, snap.restricoes.length + ' restrições', out.length + ' bytes');
