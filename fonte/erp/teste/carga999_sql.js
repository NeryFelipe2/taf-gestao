'use strict';
/* Gera o SQL que carrega a OBRA 999 · DEMONSTRAÇÃO (fictícia) num banco de TESTE local: taf_erp_obra (base_gz igual ao que o ERP lê,
   estado da linha de base), taf_erp_item (índice dos itens) e os documentos do cenário do plano (pedidos e notas de obra999.js).
   Uso (só em banco local de teste, nunca no Supabase real):
     node fonte/erp/teste/carga999_sql.js > /tmp/carga999.sql
     psql -h <socket> -p <porta> -U postgres -d <banco_de_teste> -v ON_ERROR_STOP=1 -f /tmp/carga999.sql
   Proteções:
   - o SQL para (e desfaz tudo) se o banco tiver qualquer obra fora da 999 e da 998: banco com obra de verdade não recebe esta carga;
   - chaves pessoais de teste (--chaves) só com CARGA_LOCAL=1 no ambiente. As chaves são sorteadas a cada execução e saem só na saída de erro
     (stderr, em JSON), nunca no SQL: no SQL vai só o hash. Exemplo:
       CARGA_LOCAL=1 node fonte/erp/teste/carga999_sql.js --chaves > /tmp/carga999.sql 2> /tmp/chaves999.json
     /tmp/chaves999.json fica com {"engenheira": "...", "gestor": "...", "diretoria": "...", "leitura": "..."} (só para o banco local). */
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { obra999, estado999 } = require('./obra999');

const lit = v => v === null || v === undefined ? 'null' : "'" + String(v).replace(/'/g, "''") + "'";
const num = v => v === null || v === undefined || !Number.isFinite(+v) ? 'null' : String(+v);
const sha256 = t => crypto.createHash('sha256').update(String(t), 'utf8').digest('hex');
/* chave de teste sorteada: ninguém adivinha (18 bytes aleatórios) */
const sorteia = rot => 'teste-' + rot + '-' + crypto.randomBytes(18).toString('base64url');
const TRAVA = `do $trava$ begin
  if exists (select 1 from public.taf_erp_obra where codigo not in ('999', '998')) then
    raise exception 'CARGA DE TESTE RECUSADA: este banco tem obra fora da 999 e da 998. Esta carga é só para banco local de teste.';
  end if;
end $trava$;`;

/* chaves: null (sem chaves) ou {engenheira, gestor, diretoria, leitura} com os textos das chaves (só o hash vai para o SQL) */
function sql({ chaves = null } = {}) {
  const D = obra999(), t = estado999();
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify({ D }), 'utf8')).toString('base64');
  const sha = crypto.createHash('sha256').update(gz).digest('hex');
  const estado = { frozen: t.frozen, versao: t.versao, hist: t.hist, metaOv: {}, baseOv: {}, basePac: {}, par: t.par };
  const out = ['-- OBRA 999 · DEMONSTRAÇÃO (fictícia). Só para banco local de teste. Para se o banco tiver obra fora da 999 e da 998.', 'begin;', TRAVA,
    `insert into public.taf_erp_obra (codigo, nome, contratante, ordem, base_gz, base_sha, estado) values ('999', ${lit(D.obra.nome)}, ${lit(D.obra.contratante)}, 99, ${lit(gz)}, ${lit(sha)}, ${lit(JSON.stringify(estado))}::jsonb)
  on conflict (codigo) do update set nome = excluded.nome, contratante = excluded.contratante, base_gz = excluded.base_gz, base_sha = excluded.base_sha, estado = excluded.estado;`];
  D.eap.filter(e => e.tipo_linha === 'item').forEach(i => out.push(
    `insert into public.taf_erp_item (obra, codigo, descricao, unidade, qtd, pacote, evento, venda, meta, teto, meta_unit) values ('999', ${lit(i.codigo)}, ${lit(i.descricao)}, ${lit(i.unidade)}, ${num(i.qtd)}, ${lit(i.pacote)}, ${lit(i.evento)}, ${num(i.preco_venda_total)}, ${num(i.meta_total)}, ${num(i.teto_total)}, ${num(i.meta_unit)})
  on conflict (obra, codigo) do update set descricao = excluded.descricao, pacote = excluded.pacote, evento = excluded.evento, venda = excluded.venda, meta = excluded.meta, teto = excluded.teto, meta_unit = excluded.meta_unit;`));
  [['ocs', 'oc'], ['notas', 'nf']].forEach(([k, tipo]) => (t[k] || []).forEach(d => out.push(
    `insert into public.taf_erp_doc (obra, id, tipo, dados, criado_por, atualizado_por, papel) values ('999', ${lit(d.id)}, '${tipo}', ${lit(JSON.stringify(d))}::jsonb, 'carga de teste', 'carga de teste', 'gestao') on conflict (obra, id) do nothing;`)));
  if (chaves) [['engenheira', 'Engenheira Teste', 'engenheiro'], ['gestor', 'Gestor Teste', 'gestor'], ['diretoria', 'Diretora Teste', 'diretoria'], ['leitura', null, 'leitura']]
    .forEach(([k, p, papel]) => out.push(`insert into public.taf_ciclo_chave (hash, nome, pessoa, papel, obras) values ('${sha256(chaves[k])}', 'teste', ${lit(p)}, '${papel}', array['999']) on conflict (hash) do nothing;`));
  out.push('commit;');
  return out.join('\n') + '\n';
}

function principal(argv, env) {
  if (!argv.includes('--chaves')) return { sql: sql() };
  if (env.CARGA_LOCAL !== '1') return { erro: 'Chaves de teste só com CARGA_LOCAL=1 (banco local de teste). Nada foi gerado.' };
  const chaves = { engenheira: sorteia('eng'), gestor: sorteia('ges'), diretoria: sorteia('dir'), leitura: sorteia('lei') };
  return { sql: sql({ chaves }), chaves };
}

if (require.main === module) {
  const r = principal(process.argv.slice(2), process.env);
  if (r.erro) { process.stderr.write(r.erro + '\n'); process.exit(2); }
  process.stdout.write(r.sql);
  if (r.chaves) process.stderr.write(JSON.stringify(r.chaves) + '\n');
}
module.exports = { sql, principal, TRAVA };
