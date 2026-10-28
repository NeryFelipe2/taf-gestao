'use strict';
/* Gera o SQL que carrega a OBRA 999 · DEMONSTRAÇÃO (fictícia) num banco de TESTE local: taf_erp_obra (base_gz igual ao que o ERP lê,
   estado da linha de base), taf_erp_item (índice dos itens) e os documentos do cenário do plano (pedidos e notas de obra999.js).
   Uso (só em banco local de teste, nunca no Supabase real):
     node fonte/erp/teste/carga999_sql.js > /tmp/carga999.sql
     psql -h <socket> -p <porta> -U postgres -d <banco_de_teste> -f /tmp/carga999.sql
   Com --chaves também cria chaves pessoais de teste (textos inventados, só para o banco local):
     teste-eng-999 (engenheira), teste-gestor-999 (gestor), teste-dir-999 (diretoria), teste-leitura-999 (só leitura). */
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { obra999, estado999 } = require('./obra999');

const lit = v => v === null || v === undefined ? 'null' : "'" + String(v).replace(/'/g, "''") + "'";
const num = v => v === null || v === undefined || !Number.isFinite(+v) ? 'null' : String(+v);

function sql({ chaves = false } = {}) {
  const D = obra999(), t = estado999();
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify({ D }), 'utf8')).toString('base64');
  const sha = crypto.createHash('sha256').update(gz).digest('hex');
  const estado = { frozen: t.frozen, versao: t.versao, hist: t.hist, metaOv: {}, baseOv: {}, basePac: {}, par: t.par };
  const out = ['-- OBRA 999 · DEMONSTRAÇÃO (fictícia). Só para banco local de teste.', 'begin;',
    `insert into public.taf_erp_obra (codigo, nome, contratante, ordem, base_gz, base_sha, estado) values ('999', ${lit(D.obra.nome)}, ${lit(D.obra.contratante)}, 99, ${lit(gz)}, ${lit(sha)}, ${lit(JSON.stringify(estado))}::jsonb)
  on conflict (codigo) do update set nome = excluded.nome, contratante = excluded.contratante, base_gz = excluded.base_gz, base_sha = excluded.base_sha, estado = excluded.estado;`];
  D.eap.filter(e => e.tipo_linha === 'item').forEach(i => out.push(
    `insert into public.taf_erp_item (obra, codigo, descricao, unidade, qtd, pacote, evento, venda, meta, teto, meta_unit) values ('999', ${lit(i.codigo)}, ${lit(i.descricao)}, ${lit(i.unidade)}, ${num(i.qtd)}, ${lit(i.pacote)}, ${lit(i.evento)}, ${num(i.preco_venda_total)}, ${num(i.meta_total)}, ${num(i.teto_total)}, ${num(i.meta_unit)})
  on conflict (obra, codigo) do update set descricao = excluded.descricao, pacote = excluded.pacote, evento = excluded.evento, venda = excluded.venda, meta = excluded.meta, teto = excluded.teto, meta_unit = excluded.meta_unit;`));
  [['ocs', 'oc'], ['notas', 'nf']].forEach(([k, tipo]) => (t[k] || []).forEach(d => out.push(
    `insert into public.taf_erp_doc (obra, id, tipo, dados, criado_por, atualizado_por, papel) values ('999', ${lit(d.id)}, '${tipo}', ${lit(JSON.stringify(d))}::jsonb, 'carga de teste', 'carga de teste', 'gestao') on conflict (obra, id) do nothing;`)));
  if (chaves) [['teste-eng-999', 'Engenheira Teste', 'engenheiro'], ['teste-gestor-999', 'Gestor Teste', 'gestor'], ['teste-dir-999', 'Diretora Teste', 'diretoria'], ['teste-leitura-999', null, 'leitura']]
    .forEach(([k, p, papel]) => out.push(`insert into public.taf_ciclo_chave (hash, nome, pessoa, papel, obras) values (encode(extensions.digest(${lit(k)}, 'sha256'), 'hex'), 'teste', ${lit(p)}, '${papel}', array['999']) on conflict (hash) do nothing;`));
  out.push('commit;');
  return out.join('\n') + '\n';
}

if (require.main === module) process.stdout.write(sql({ chaves: process.argv.includes('--chaves') }));
module.exports = { sql };
