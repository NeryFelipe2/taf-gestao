'use strict';
/* Contraste AA (4,5:1) das cores de texto que o painel de Eventos usa, nas paletas do ERP: claro, escuro, embutido no Centro (claro e escuro) e o estilo Grotesk do Centro
   (o Centro manda --bg, --panel, --line e --r por cima da paleta embutida; o Grotesk usa o painel #FAF8F3, valor de public/index.html).
   As paletas saem do style.css de verdade; nada é escrito à mão aqui além do que o Centro sobrepõe. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { RAIZ } = require('./ambiente');

const css = fs.readFileSync(path.join(RAIZ, 'fonte', 'erp', 'style.css'), 'utf8');
const bloco = sel => { const i = css.indexOf(sel + '{'); assert.ok(i >= 0, 'sem o bloco ' + sel); return css.slice(i + sel.length + 1, css.indexOf('}', i)); };
const vars = txt => { const o = {}; for (const m of txt.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+)/g)) o[m[1]] = m[2].trim(); return o; };
const rgba = c => {
  let m; c = c.trim();
  if ((m = c.match(/^#([0-9a-f]{6})$/i))) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16), 1];
  if ((m = c.match(/^#([0-9a-f]{3})$/i))) return [...m[1]].map(x => parseInt(x + x, 16)).concat(1);
  if ((m = c.match(/^rgba?\(([^)]+)\)/))) { const p = m[1].split(',').map(parseFloat); return [p[0], p[1], p[2], p[3] == null ? 1 : p[3]]; }
  throw new Error('cor que o teste não sabe ler: ' + c);
};
const mix = (f, b) => f.slice(0, 3).map((x, k) => Math.round(x * f[3] + b[k] * (1 - f[3])));
const lum = ([r, g, b]) => { const f = x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const base = vars(bloco(':root')), escuro = { ...base, ...vars(bloco(':root[data-theme="dark"]')) };
const embClaro = { ...base, ...vars(bloco('html:root.emb')) }, embEscuro = { ...embClaro, ...vars(bloco('html:root.emb[data-theme="dark"]')) };
const PALETAS = { 'claro (ERP)': base, 'escuro (ERP)': escuro, 'Centro Claro': { ...embClaro, panel: '#FFFFFF' }, 'Centro Masterclass': { ...embEscuro, panel: '#0B0B19' }, 'Centro Grotesk': { ...embClaro, panel: '#FAF8F3' } };

test('texto do painel (títulos, números, notas pequenas, número negativo) tem contraste AA sobre o cartão nas 5 paletas', () => {
  for (const [nome, v] of Object.entries(PALETAS)) {
    const panel = rgba(v.panel).slice(0, 3);
    for (const cor of ['ink', 'ink-2', 'bad']) assert.ok(contraste(mix(rgba(v[cor]), panel), panel) >= 4.5, `${nome}: ${cor} sobre o cartão fica abaixo de 4,5:1`);
  }
});

test('etiqueta de cor do cartão (verde, amarelo, vermelho): texto neutro sobre o fundo da cor, também AA nas 5 paletas', () => {
  for (const [nome, v] of Object.entries(PALETAS)) {
    const panel = rgba(v.panel).slice(0, 3);
    for (const f of ['ok-bg', 'warn-bg', 'bad-bg']) { const fundo = mix(rgba(v[f]), panel); assert.ok(contraste(mix(rgba(v.ink), fundo), fundo) >= 4.5, `${nome}: texto sobre ${f}`); }
  }
});

test('o bloco do painel não usa --ink-3 (o cinza claro que não passa em todas as paletas) para texto', () => {
  const i = css.indexOf('/* ============ Eventos: painel'); assert.ok(i > 0);
  assert.doesNotMatch(css.slice(i), /var\(--ink-3\)/);
});
