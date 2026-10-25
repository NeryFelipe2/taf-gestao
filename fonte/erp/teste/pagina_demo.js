'use strict';
/* Gera uma página de demonstração do ERP para abrir no navegador SEM banco e SEM rede:
   parte do public/erp.html já gerado pelo build.py, tira o endereço do Supabase e a chave pública (o ERP cai no modo aberto, com os dados no próprio navegador),
   bloqueia qualquer conexão de rede pela política de segurança da página (connect-src 'none') e embute só a OBRA 999 · DEMONSTRAÇÃO (fictícia).
   Uso:  node fonte/erp/teste/pagina_demo.js <pasta de saída>     (a pasta de saída deve ficar fora do repositório; sai erp-demo.html) */
const fs = require('node:fs');
const path = require('node:path');
const { obra999, estado999, EV_REF_999 } = require('./obra999');

const RAIZ = path.resolve(__dirname, '..', '..', '..');
const saida = process.argv[2];
if (!saida) { console.error('Uso: node pagina_demo.js <pasta de saída>'); process.exit(2); }

let h = fs.readFileSync(path.join(RAIZ, 'public', 'erp.html'), 'utf8');
const troca = (de, para, rotulo) => { if (!h.includes(de)) throw new Error('não achei: ' + rotulo); h = h.replace(de, () => para); };

/* 1) sem Supabase: tira a configuração injetada pelo build.py (URL e chave pública) */
const cfg = h.match(/<script>window\.TAF_CONFIG=\{[^<]*\};<\/script>/);
if (!cfg) throw new Error('não achei a configuração do build.py');
if (/supabase/i.test(cfg[0]) === false) throw new Error('a configuração não tem o Supabase? confira o build');

/* 2) estado inicial da 999 no navegador (só se ainda não existir, para o recarregar não apagar o que a pessoa fez na tela) */
const estado = { ...estado999(), role: 'gestao' };   /* chaves novas DESLIGADAS: a tela liga pelos Parâmetros */
const pre = `<script>window.TAF_CONFIG={"marca":"TAF"};
window.fetch=function(){return Promise.reject(new Error('sem rede (demonstração sem banco)'))};   /* o ERP em modo aberto tenta ler data/obraNNN.json das outras obras: aqui falha na hora, sem sair do navegador */
window.TAF_OBRAS={"999":${JSON.stringify(obra999()).replace(/</g, '\\u003c')}};
window.TAF_REF_999=${JSON.stringify(EV_REF_999)};
try{localStorage.setItem('taf_obra_sel','999');if(!localStorage.getItem('taf_admin_v3_999'))localStorage.setItem('taf_admin_v3_999',${JSON.stringify(JSON.stringify(estado)).replace(/</g, '\\u003c')})}catch(e){}</script>`;
h = h.replace(cfg[0], () => pre);

/* 3) a 999 entra na lista de obras do modo aberto */
troca("const OBRAS_PADRAO=[[", "const OBRAS_PADRAO=[['999','OBRA 999 · DEMONSTRAÇÃO (fictícia)'],[", 'OBRAS_PADRAO');

/* 4) nenhuma conexão: política da página + sem fontes externas */
troca('<meta charset="utf-8">', `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'">`, 'meta charset');
h = h.replace(/<link rel="preconnect"[^>]*>\s*/g, '').replace(/<link rel="stylesheet" href="https:\/\/fonts[^>]*>\s*/g, '');
if (/https?:\/\/fonts\./.test(h.split('<body>')[0])) throw new Error('ainda há fonte externa no cabeçalho');
h = h.replace('<title>ERP TAF</title>', '<title>ERP TAF · demonstração 999 (sem rede)</title>');

fs.mkdirSync(saida, { recursive: true });
const arq = path.join(saida, 'erp-demo.html');
fs.writeFileSync(arq, h);
console.log('gerado', arq, Math.round(h.length / 1024) + ' KB');
