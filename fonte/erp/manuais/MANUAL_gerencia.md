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
- **Acessos** (Gestão e administração → Acessos): a chave pessoal de cada pessoa. **Criar acesso**: escolha o papel, a pessoa (o nome que vai em tudo o que ela lançar), o nome da chave (para achar na lista) e as obras. Nenhuma obra vem marcada: marque só as que a pessoa precisa. A chave aparece **uma vez só**: copie com **Copiar a chave** ou **Copiar mensagem pronta** e mande **só por mensagem direta** para a pessoa. Depois feche com **Já mandei, fechar**. **Desativar**: a chave para na hora, em todos os aparelhos; o que a pessoa lançou fica.
- **Onde cada um entra**: engenheiro e encarregado em **/marko**; gestor e Diretoria em **/erp** e **/ciclo** com a chave pessoal (o Centro, em **/**, continua com a chave geral do site).
- **Primeira chave de Diretoria (partida)**: enquanto não existe nenhuma, entre no ERP com a chave geral do site, abra Acessos e use **Criar a primeira chave de Diretoria**, com todas as obras. Depois saia e entre com ela e confira na lista o "criada por". A partir daí a chave geral não cria mais acesso.
- **Obra nova** (importada depois): aparece no topo de Acessos para a Diretoria com todas as obras como "ainda não tem chave de Diretoria". Ela já pode dar acesso de engenheiro e encarregado na obra nova. Para a Diretoria ver a obra no ERP: crie uma chave de Diretoria com todas as obras, inclusive a nova, entre com ela e desative a antiga.

## Regras
- Ninguém aprova a própria solicitação. Suplente só vale dentro do período cadastrado.
- Acesso temporário, suplência e horário valem na interface; no banco vale o papel em Usuários.
- **Quem cria acesso:** Diretoria cria qualquer papel (Diretoria, gestor, engenheiro, encarregado, só leitura). Gestor cria engenheiro, encarregado e só leitura. Engenheiro e encarregado não veem Acessos.
- **Obras:** cada um só cria e desativa acesso nas obras que cuida. A Diretoria com todas as obras cuida de todas. A **Diretoria limitada** (ex.: sócio de consórcio, só uma obra) e o gestor cuidam só das obras da chave deles e só veem na lista as chaves que têm obra em comum (as obras de fora aparecem só como "+N obras fora da sua chave"). O gestor não vê as chaves de Diretoria.
- **Pessoa:** não dá para criar chave em nome de quem já tem chave que você não cuida (Diretoria, gestor ou outra obra). Pessoa com duas chaves ativas aparece com aviso: desative a do celular antigo.
- **Ninguém desativa a própria chave**, e sempre sobra uma **Diretoria com todas as obras**: a última (ou a única com todas) não sai. Crie outra antes.
- **Chave perdida não se recupera**: desative e crie outra. A chave não fica guardada em lugar nenhum, só o código dela (sha256).
- **Nome do engenheiro:** use o mesmo nome do engenheiro da obra no planejador. Se for diferente, a tela avisa: as demandas, as áreas e as tarefas do engenheiro não aparecem como desta pessoa.
- **Encarregado** só aponta o dia no planejador (andou, parado, entregue). Quem prepara, monta, publica e fecha a semana é o engenheiro.
- Obra nova não entra sozinha numa chave que já existe: crie uma chave nova com a obra e desative a antiga.
