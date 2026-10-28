# Manual de Gerente, Diretoria e Gestão
**Seu dia:** aprovar o que passa da alçada, acompanhar indicadores e decidir.

## Tarefas
- **Dashboard e indicadores** (Início; Gestão → Indicadores e BI): cartões com meta, Curva S, caixa, desvios, funil, pessoas. Defina metas em "Escolher o que mostrar". O painel dinâmico cruza fontes (notas, estoque, ponto, títulos, contabilidade) e copia CSV.
- **Aprovar OCs** (Suprimentos → Compras → Aprovações): amarelo e verde acima do limite → Gerente; vermelho e acima do valor do Gerente → Diretoria. Reprovar exige motivo.
- **Aprovar medição de subempreiteiro** e atestar medições (Obra → Medição).
- **Congelar a linha de base** (Gestão/Diretoria) e **Parâmetros** de compras (limite verde, limite do Gerente, tolerância).
- **Contratos**: aditivos, bloqueio, alertas de vencimento e reajuste.
- **Reabrir competência** (só Diretoria, com motivo) em Contabilidade → Fechamento.
- **Administração** (Gestão e administração): grupos, acesso temporário, suplente de aprovador, horário, **alçadas por evento**.
- **Acessos** (Gestão e administração → Acessos): a chave pessoal de cada pessoa. **Criar acesso**: escolha o papel, a pessoa (o nome que vai em tudo o que ela lançar), o nome da chave (para achar na lista) e as obras. A chave aparece **uma vez só**: copie com **Copiar a chave** ou **Copiar mensagem pronta** e mande **só por mensagem direta** para a pessoa. Depois feche com **Já mandei, fechar**. **Desativar**: a chave para na hora, em todos os aparelhos; o que a pessoa lançou fica.
- **Onde cada um entra**: engenheiro e encarregado em **/marko**; gestor e Diretoria em **/erp** e **/ciclo** com a chave pessoal (o Centro, em **/**, continua com a chave geral do site).
- **Primeira chave de Diretoria (partida)**: enquanto não existe nenhuma, entre no ERP com a chave geral do site, abra Acessos e use **Criar a primeira chave de Diretoria**. Depois saia e entre com ela. A partir daí a chave geral não cria mais acesso.

## Regras
- Ninguém aprova a própria solicitação. Suplente só vale dentro do período cadastrado.
- Acesso temporário, suplência e horário valem na interface; no banco vale o papel em Usuários.
- **Quem cria acesso:** Diretoria cria qualquer papel (Diretoria, gestor, engenheiro, encarregado, só leitura). Gestor cria engenheiro, encarregado e só leitura, só nas obras da chave dele. Engenheiro e encarregado não veem Acessos.
- **Ninguém desativa a própria chave**, e a **última chave de Diretoria** não sai: crie outra antes.
- **Chave perdida não se recupera**: desative e crie outra. A chave não fica guardada em lugar nenhum, só o código dela (sha256).
- **Nome do engenheiro:** use o mesmo nome do engenheiro da obra no planejador. Se for diferente, a tela avisa: as demandas, as áreas e as tarefas do engenheiro não aparecem como desta pessoa.
- **Encarregado** só aponta o dia no planejador (andou, parado, entregue). Quem prepara, monta, publica e fecha a semana é o engenheiro.
- Obra nova não entra sozinha numa chave que já existe: crie uma chave nova com a obra e desative a antiga.
