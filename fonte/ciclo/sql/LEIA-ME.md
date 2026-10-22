# Ciclo semanal 342 — banco (taf_ciclo_*)

Ordem: 01_tabelas.sql, 02_funcoes.sql. Reverter: 99_reverter.sql.
Só cria objetos `taf_ciclo_*` (não mexe em tabelas da WCR nem em `taf_*` existentes).
Depende de `_taf_ok` / `_taf_pessoa` (já existem no banco do site).

A carga do cronograma (03_carga_342) e as chaves pessoais NÃO ficam no repositório (repo público):
carga feita à mão no banco, chaves só como hash.

md5: 01_tabelas 1f736b9f8ef339ff39a5b029b14167a9, 02_funcoes 0f0b500e1347262cefcd5394934abeb7, 99_reverter 9c33ec4add943dd861aad87727b5a485
