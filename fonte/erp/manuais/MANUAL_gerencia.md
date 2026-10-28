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
- **Resumo para o diretor** (Gestão e administração, logo depois de Administração): o site manda sozinho, por e-mail, o resumo de cada obra. Diário em dia útil às 7h; semanal na segunda às 7h30. Traz PPC da última semana fechada e da atual, se a semana foi publicada, atrasadas, EVENTOs e marcos em risco, restrições vencidas e as que vencem em 7 dias, dias úteis sem apontamento e, do ERP, licitado, meta, comprometido e realizado. O que não tem dado sai como "sem dado", nunca como zero.
- **Quem recebe**: "Novo destinatário" pede nome, e-mail, frequência e obras. "Todas as obras" só aparece para quem tem todas as obras na chave. Marque "É o meu e-mail" no seu cadastro para poder usar "Mandar agora para mim". "Desativar" para o envio sem apagar; "Reativar" volta. O e-mail marcado como de outra pessoa só ela ou a Diretoria editam ou desativam; se a Diretoria trocar esse e-mail, ele deixa de ser da pessoa.
- **Aviso de quem ficou sem**: se o último resumo de alguém não saiu, aparece um aviso no alto da lista e "ficou sem" na linha. O motivo fica em "Último envio".
- **Ver prévia**: mostra o texto que vai sair, sem mandar nada. "Copiar para WhatsApp" copia o mesmo texto com negrito do WhatsApp. "Prévia" na linha de um destinatário mostra o que ele recebe. "Mandar agora para mim" manda o e-mail de teste para o seu e-mail (até 5 por dia), com as obras do cadastro desse e-mail que estão na sua chave.
- **Robô do envio**: "Gerar chave do robô" cria a chave que o envio automático usa. Ela aparece uma vez: copie e cole na Vercel em TAF_CHAVE_RESUMO e faça um novo Deploy. A Vercel também precisa de CRON_SECRET, RESEND_API_KEY e RESUMO_REMETENTE. "Trocar a chave do robô" desliga a anterior na hora.

## Regras
- Ninguém aprova a própria solicitação. Suplente só vale dentro do período cadastrado.
- Acesso temporário, suplência e horário valem na interface; no banco vale o papel em Usuários.
- Resumo para o diretor: só a Diretoria ou o gestor, com a **chave pessoal**, cadastram quem recebe. Com a chave geral do site não dá (ninguém manda e-mail para qualquer endereço). Cada um só cadastra as obras da própria chave.
- A cor de cada obra no resumo é a pior entre as luzes de produção e de plano do planejador e o EVENTO mais crítico. O motivo que aparece ao lado da cor é o do indicador que deu aquela cor. A obra mais grave vem primeiro.
- A parte do planejador só aparece para quem abre o planejador da obra. Com a chave do site, só o engenheiro da obra vê; os outros veem "sem acesso com esta chave" e o custo do ERP.
- Todos os e-mails saem de uma vez. O mesmo e-mail não sai duas vezes no mesmo dia. Se o envio falhar, a repescagem tenta de novo às 9h (na segunda, 9h30 o semanal), até 3 vezes no dia. No dia seguinte, quem ficou sem vai primeiro. O "Último envio" da lista mostra o que aconteceu.
