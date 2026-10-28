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
- **Obra nova** (só Gestão e Diretoria): clique na obra no alto do menu e em **Nova obra**. Passo 1: código de 3 números, nome e contratante. Passo 2: suba a planilha do órgão (.xlsx ou .csv), escolha a aba e a linha do cabeçalho e confira as colunas que a tela sugeriu (código do item, descrição, unidade, quantidade, preço unitário ou total, evento e pacote se tiver). Linha sem quantidade e sem preço unitário vira grupo; linha sem código fica de fora. Passo 3: prévia com itens, grupos, total geral e avisos (código repetido, item sem preço, total diferente de quantidade × unitário). Digite o valor do contrato para conferir. Passo 4: **Gravar a obra**: o ERP abre a obra no Orçamento.
- **Cronograma da obra nova** fica no Centro de Gestão: em Tarefas → Cronograma (ou no quadro "As obras estão no prazo?"), digite o código em **Obra nova (código)** e clique em Importar cronograma.

## Regras
- Ninguém aprova a própria solicitação. Suplente só vale dentro do período cadastrado.
- Acesso temporário, suplência e horário valem na interface; no banco vale o papel em Usuários.
- Obra nova entra **sem meta de custo**: a compra fica bloqueada até a meta de cada item ser definida e a linha de base ser congelada.
- Código repetido na planilha não grava: corrija a planilha e suba de novo. O banco confere tudo outra vez e guarda a versão anterior do orçamento.
- Obra que já tem compra, nota ou linha de base congelada não regrava o orçamento: use Orçamento → **Atualizar pela planilha**.
- Com a chave do site, escolha o papel Gestão ou Diretoria antes de criar a obra; o seu nome fica registrado.
