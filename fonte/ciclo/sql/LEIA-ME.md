# Ciclo semanal 342 — banco (taf_ciclo_*)

Ordem: 01_tabelas.sql, 02_funcoes.sql, 03_ligar_05c.sql (ligar restrição 05C a atividades; `frente` no ler),
04_obras_e_importacao.sql (lista de obras por chave, importação de cronograma de qualquer obra, regra do compromisso
condicionado). O 04 só entra no banco com o sim do Felipe; o desfazer dele está no fim do próprio arquivo.
Reverter tudo: 99_reverter.sql.
Só cria objetos `taf_ciclo_*` (não mexe em tabelas da WCR nem em `taf_*` existentes).
Depende de `_taf_ok` / `_taf_pessoa` (já existem no banco do site).

A carga do cronograma (03_carga_342) e as chaves pessoais NÃO ficam no repositório (repo público):
carga feita à mão no banco, chaves só como hash.

md5: 01_tabelas 1f736b9f8ef339ff39a5b029b14167a9, 02_funcoes 0f0b500e1347262cefcd5394934abeb7, 03_ligar_05c 26eda23652deb13f7969b91d9944bae7, 04_obras_e_importacao 6c21a229977ac4360d10b18fbbbf8b7c, 99_reverter 9c33ec4add943dd861aad87727b5a485
