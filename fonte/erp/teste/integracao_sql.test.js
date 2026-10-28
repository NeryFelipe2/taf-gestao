'use strict';
/* Integração dos 5 itens (obra nova, meta, acessos, IA, resumo): conferências do texto dos rascunhos SQL e dos roteiros.
   Só lê arquivos do repositório; nada de banco, rede ou chave. As regras de verdade são testadas nos *_teste*.sql no banco local. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..', '..', '..');
const SQL = path.join(RAIZ, 'fonte', 'erp', 'sql');
const ler = (...p) => fs.readFileSync(path.join(...p), 'utf8');

test('alta: nenhum roteiro manda guardar cópia em tabela nova do esquema public (no Supabase ela nasce aberta ao site)', () => {
  const arqs = fs.readdirSync(SQL).filter(f => /\.(sql|md)$/.test(f)).map(f => path.join(SQL, f))
    .concat([path.join(RAIZ, 'fonte', 'ciclo', 'sql', 'LEIA-ME.md'), path.join(RAIZ, 'README.md')]);
  for (const a of arqs) {
    const t = fs.readFileSync(a, 'utf8');
    for (const [i, l] of t.split('\n').entries()) {
      if (/create table (if not exists )?public\.\w+\s+as\s+select/i.test(l) && !/nunca/i.test(l))
        assert.fail(`${path.relative(RAIZ, a)}:${i + 1} manda criar cópia em public: ${l.trim()}`);
    }
  }
  const leia = ler(SQL, 'LEIA-ME-06-ACESSOS-PENDENTE.md');
  assert.match(leia, /PASSO A de `fonte\/ciclo\/sql\/99_reverter\.sql`/);
  assert.match(leia, /revoke all on schema taf_copia from public, anon, authenticated;/);
  assert.match(leia, /enable row level security;/);
});

test('baixa: o 06 trava antes de mexer (md5 do _taf_ciclo_pode e lock_timeout) e troca a regra de papel num comando só', () => {
  const t = ler(SQL, '06_acessos.sql');
  const iLock = t.indexOf("set lock_timeout = '3s';"), iMd5 = t.indexOf('FUNCAO _taf_ciclo_pode DO BANCO DIFERENTE DO REPOSITORIO');
  const iAlter = t.indexOf('alter table public.taf_ciclo_chave');
  assert.ok(iLock > 0 && iMd5 > iLock && iAlter > iMd5, 'as travas vêm antes de mexer na tabela');
  assert.match(t, /'0b8e6eba22d91ff6fcba227ae952048c'/);
  assert.match(t, /'e181c6427042a76781e61ec36c2be373'/);
  /* o drop da regra antiga e o add da nova estão dentro do mesmo do $$ ... $$ */
  const bloco = t.slice(t.indexOf('do $$ declare r record; begin'), t.indexOf('end $$;', t.indexOf('do $$ declare r record; begin')));
  assert.match(bloco, /drop constraint/); assert.match(bloco, /add constraint taf_ciclo_chave_papel_check/);
  assert.match(t, /reset lock_timeout;/);
  assert.match(t, /rode este 06 de novo logo depois/i, 'avisa que o 02 do ciclo desfaz a linha do encarregado');
});

test('baixa: o desfazer do 06 não apaga chave (desativa) e o do 04 avisa da proposta de meta', () => {
  const t = ler(SQL, '06_acessos.sql'), fim = t.slice(t.indexOf('desfazer (manual, na ordem)'));
  assert.ok(!/delete from public\.taf_ciclo_chave/i.test(fim), 'o desfazer não apaga linha de taf_ciclo_chave');
  assert.match(fim, /update public\.taf_ciclo_chave set ativo = false where papel = 'encarregado'/);
  const q = ler(SQL, '04_obra_nova.sql');
  assert.match(q, /disable trigger taf_erp_meta_trg/);
  assert.match(q, /select count\(\*\) from public\.taf_erp_meta_prop where obra = '<código>'/);
});

test('baixa: a chave do robô (sem obra) só a Diretoria com todas desativa, e a troca do robô fica no registro de Acessos', () => {
  const t = ler(SQL, '06_acessos.sql');
  const bloq = t.split('create or replace function public._taf_acesso_bloqueio(')[1].split('end $$;')[0];
  assert.match(bloq, /cardinality\(p_c\.obras\) = 0 and not public\._taf_acesso_geral\(p_tipo, p_papel, p_obras\)/);
  const des = t.split('create or replace function public.taf_acesso_desativar(')[1].split('end $$;')[0];
  assert.match(des, /update public\.taf_resumo_robo set ativo = false/);
  const r = ler(SQL, '08_resumo.sql').split('create or replace function public.taf_resumo_robo_gerar(')[1].split('end $$;')[0];
  assert.match(r, /insert into public\.taf_acesso_log/);
  assert.ok(r.indexOf("'desativar'") < r.indexOf('update public.taf_ciclo_chave set ativo = false'), 'registra a desativação antes de desativar');
});

test('média: o 08 usa a regra do 06 para a Diretoria com todas as obras e manda o e-mail saber da meta parcial', () => {
  const t = ler(SQL, '08_resumo.sql');
  const g = t.split('create or replace function public._taf_resumo_gestor(')[1].split('end $$;')[0];
  assert.match(g, /a\.papel = 'diretoria' and public\._taf_resumo_dir_todas\(a\.obras\) then null/);
  assert.match(t, /c\.papel = 'diretoria' and c\.ativo\), '\{\}'\) <@ p_obras/);
  for (const k of ['itens_com_meta', 'licitado_com_meta', 'comprometido_com_meta', 'realizado_com_meta']) assert.match(t, new RegExp(`'${k}'`));
});

test('baixa: 05 compara quem propôs sem caractere invisível e devolve a ligação com a obra', () => {
  const t = ler(SQL, '05_meta.sql');
  const n = t.split('create or replace function public._taf_erp_meta_norm(')[1].split(' $$;')[0];
  assert.match(n, /\\u200B-\\u200F/); assert.match(n, /\\uFEFF/);
  assert.match(t, /add constraint taf_erp_meta_prop_obra_fkey foreign key \(obra\) references public\.taf_erp_obra\(codigo\)/);
});

test('baixa: os testes 06 e 08 dizem que só rodam num banco de teste novo; o 05 a 08 pedem fora do horário de uso', () => {
  assert.match(ler(SQL, '06_teste_acessos.sql'), /SÓ NUM BANCO DE TESTE NOVO/);
  assert.ok(!/noutro banco, troque o texto abaixo/.test(ler(SQL, '06_teste_acessos.sql')));
  assert.match(ler(SQL, '08_teste_resumo.sql'), /Só num banco de teste novo/);
  for (const f of ['05_meta.sql', '06_acessos.sql', '07_ia.sql', '08_resumo.sql']) assert.match(ler(SQL, f), /Fora do horário de uso/, f);
  assert.match(ler(SQL, 'LEIA-ME-06-ACESSOS-PENDENTE.md'), /\*\*No banco de verdade não rodar\*\*/);
});
