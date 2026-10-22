# Manual de Compras e suprimentos
**Seu dia:** cotar, emitir pedidos, acompanhar entregas e ocorrências.

## Tarefas
- **Cotar** (Suprimentos → Compras → Solicitações → Mapa de cotação): adicione propostas uma a uma ou **cole o arquivo do fornecedor** (`fornecedor;preço;prazo`). **Sugerir melhor** escolhe o menor preço (empate: menor prazo). Emita a OC.
- **Ordens de compra**: acompanhe aprovação, recebimento, **Ocorrência** (atraso, avaria, divergência) e **Devolver** (baixa o estoque e registra o crédito).
- **Necessidade e mín./máx.** (Suprimentos → Estoque → Necessidade): itens com atividade no lookahead sem compra em andamento, e insumos abaixo do mínimo.
- **Cadastros** (Suprimentos → Cadastros): fornecedores (CNPJ validado), insumos (unidade de compra com fator, mínimo e máximo).

## Regras que bloqueiam
- Menos de 3 propostas exige justificativa ou marca de emergência (regularizar em 2 dias úteis). Escolher fora da menor também exige justificativa.
- Semáforo e alçadas: verde até o limite sai sozinho; amarelo e verde acima do limite vão ao Gerente; acima do valor do Gerente ou do teto, à Diretoria. Quem solicitou não aprova a própria OC.
- Item sem meta ou fora da planilha: bloqueado.

## Erros comuns
- "Escolheu fora da menor: justifique".
- Preço colado com vírgula decimal: use `1.234,56` ou `1234.56`.
