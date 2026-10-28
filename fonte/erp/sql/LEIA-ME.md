# ERP TAF dentro do site (taf_erp_*)

Ordem: 01_erp.sql, 02_rastro.sql (precisa do ciclo instalado antes). Reverter: 99_reverter.sql.
Só cria objetos `taf_erp_*`. Base/itens do ERP (dados privados) NÃO ficam no repositório.

md5: 01_erp b27d3d59b53ab8e28ae304bc1d128a09, 02_rastro 6448e08045c1b33a8651fef2b1266f5a, 99_reverter e1763f5d3ae4e7f13f7abcec2191eb17

08_resumo.sql (resumo automático para o diretor: destinatários, envios, chave do robô e resumo de cada obra): RASCUNHO, NÃO APLICADO. Só com o sim do Felipe, depois de testar.
Precisa do ciclo (fonte/ciclo/sql 01 a 04) e de 01_erp e 02_rastro. Teste na obra 999 fictícia: 08_teste_resumo.sql (transação com rollback). Desfazer: fim do próprio 08.
