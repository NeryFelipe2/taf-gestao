'use strict';
/* Tira os prints de uma tela do ERP com o Chrome sem janela (só localhost, perfil temporário). Não faz parte do ERP: é ferramenta de conferência do visual.
   Uso:  node fonte/erp/teste/tirar_prints.js <pasta de saída> [filtro] [página] [prefixo]
   Antes: python -I fonte/erp/build.py; gerar a página com  node fonte/erp/teste/pagina_demo.js <pasta> --chaves=ev_agrega --vista=evt --nome=erp-eventos.html;
   copiar capa_temas.html para a mesma pasta como capa.html e servir a pasta em http://127.0.0.1:8791 (python -m http.server 8791 --bind 127.0.0.1 --directory <pasta>).
   Combinações: tema (ERP claro, ERP escuro e, dentro do Centro de Gestão, Claro, Masterclass e Grotesk) x largura (1440, 1024, 390). A largura 390 vem de um quadro (iframe) de 390 px:
   o Chrome sem janela não faz janela abaixo de 500 px. O Centro é simulado por capa_temas.html (?embed=1 + as variáveis do estilo, com os valores de public/index.html). */
const cp = require('node:child_process'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const CHROME = process.env.CHROME_EXE || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const saida = process.argv[2], filtro = process.argv[3] || '', alvo = process.argv[4] || 'erp-eventos.html', prefixo = process.argv[5] || 'eventos';
const saidaAbs = path.resolve(saida);
fs.mkdirSync(saidaAbs, { recursive: true });
const BASE = 'http://127.0.0.1:8791/capa.html';
const TEMAS = [
  ['claro-erp', `modo=solo&tema=light`], ['escuro-erp', `modo=solo&tema=dark`],
  ['centro-claro', `modo=embed&estilo=claro`], ['centro-masterclass', `modo=embed&estilo=masterclass`], ['centro-grotesk', `modo=embed&estilo=grotesk`],
];
const LARGS = [[1440, 1500], [1024, 1700], [390, 2300]];
const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'taf-prints-'));   /* perfil do Chrome só para isto, apagado no fim */
let n = 0;
for (const [nome, q] of TEMAS) for (const [w, h] of LARGS) {
  const rot = `${prefixo}_${nome}_${w}`; if (filtro && !rot.includes(filtro)) continue;
  const arq = path.join(saidaAbs, rot + '.png'), url = `${BASE}?${q}&iw=${w}&h=${h}&alvo=${encodeURIComponent(alvo)}`;
  const r = cp.spawnSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${perfil}`, `--window-size=${w},${h}`, '--virtual-time-budget=9000', `--screenshot=${arq}`, url], { encoding: 'utf8', timeout: 60000 });
  console.log(rot, fs.existsSync(arq) ? Math.round(fs.statSync(arq).size / 1024) + ' KB' : 'FALHOU ' + (r.stderr || '').slice(0, 200)); n++;
}
console.log('total', n);
try { fs.rmSync(perfil, { recursive: true, force: true }); } catch (e) {}
