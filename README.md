# Site TAF (Vercel + Supabase)

Mesmo modelo do site da WCR: uma página só (`public/index.html`), dados no Supabase.
Aba Tarefas = restrições R01-R110 da rev6. Quem edita, todos veem (salva a cada edição, confere a cada 30 s).

**Este repositório é PÚBLICO.** Dado real (a leitura da rev6: contrato, medido, recebido, nomes), chave e senha nunca entram nele. A leitura vai do computador direto para o banco (ver "Atualizar os números").

## Como funciona
- Entra com uma **chave de acesso** (guardada no navegador). Sem a chave, nada dos números aparece.
- Os números vêm da rev6: o banco guarda a última leitura. Para atualizar: botão **Atualizar com a rev6** e escolher o .xlsx (salva para todos).
- Edições das tarefas ficam por cima da rev6, no banco (`taf_tarefa_edicao`, com histórico em `taf_tarefa_hist`). Não mexem no arquivo da rev6: quem aplica na planilha é a gestão, com as abas MUDANÇAS e NOVAS do botão **Baixar planilha**.
- **Baixar planilha** (cabeçalho e barra de edição da aba Tarefas) gera `TAF - TAREFAS DO SITE - <data>.xlsx` no navegador, com 3 abas: TAREFAS (lista inteira com as edições), MUDANÇAS (rev6) (campo, valor da rev6, valor de agora, linha e coluna da 05C) e NOVAS (05C) (tarefas criadas no site, na ordem das colunas da 05C). Antes de Restaurar original e de Importar JSON o site baixa essa planilha como cópia de segurança.
- Quando sair uma rev nova com as edições aplicadas: recarregar a leitura (abaixo) e apagar de `taf_tarefa_edicao` as edições já aplicadas, senão elas aparecem duas vezes.
- O campo **Hoje** abre na data real; uma data digitada vale só no dia.
- Banco: Supabase `construdata-platform`, só tabelas `taf_*` (ver `supabase/schema.sql`). Nada da WCR foi alterado.

## Publicar no Vercel (3 passos)
1. Subir esta pasta num repositório do GitHub.
2. Vercel > Add New > Project > escolher o repositório. Framework: Other. Root Directory: `public`. Deploy.
3. Abrir o link, digitar a chave e o seu nome. Banco vazio: escolher a rev6 (.xlsx) uma vez.

Para o endpoint `/api/leitura` (abaixo) funcionar, cadastrar uma vez em Vercel > Settings > Environment Variables (Production) e fazer novo Deploy:
- `TAF_SUPABASE_URL`: endereço do projeto Supabase (Supabase > Project Settings > API > Project URL).
- `TAF_SUPABASE_KEY`: a chave **publicável** (publishable/anon) do mesmo projeto. Nunca a `service_role`.

## Refazer o index.html
`fonte/transform.py` monta `public/index.html` a partir de `template2.html`, `wcr.css`, `extract.js` e `loader.html` (rodar dentro de `fonte/` com Python + Pillow). Ele grava `fonte/index.html` (copiar para `public/index.html` e apagar o de `fonte/`) e `public/versao.json` com o código da versão: quem está com o site aberto recebe a versão nova sozinho (confere a cada 2 minutos e ao voltar para a aba; não recarrega enquanto a pessoa digita).

## Atualizar os números (quem faz: o Claude)
A leitura **não passa mais pelo Git**: sem `seed.js`, sem commit, sem push, sem chave na URL. O script lê a rev6 no computador e envia por POST; o banco confere a chave (como sempre).

O envio (`--enviar`) só funciona depois que esta versão for publicada na Vercel **e** as duas variáveis acima estiverem cadastradas; antes disso responde 404 ou 500. Enquanto isso, atualizar pelo botão **Atualizar com a rev6** do site (passo 6). Nunca voltar ao `/api/seed?k=`.

1. `npm i xlsx@0.18.5` (fora do repositório).
2. Guardar a chave só na sessão do terminal (não digitar na linha do comando, nem em URL, nem em arquivo do repositório):
   - Git Bash: `read -s TAF_CHAVE; export TAF_CHAVE`
   - PowerShell: `$env:TAF_CHAVE = Read-Host "chave"` (a chave aparece na tela enquanto digita)
3. Conferir sem enviar: `node fonte/gerar-seed.js "<caminho da rev6.xlsx>"` (mostra o resumo; nada é gravado nem enviado).
4. Enviar: `node fonte/gerar-seed.js "<caminho da rev6.xlsx>" --enviar`. Grava a nova leitura no banco; quem está com o site aberto vê na próxima abertura.
   - Outro endereço (teste local, por exemplo): `--url http://127.0.0.1:3000/api/leitura` ou variável `TAF_URL`. Fora de localhost só aceita https.
5. Guardar uma cópia local em vez de enviar (ou antes de enviar): `--salvar` grava `leitura-local.json` na raiz (o Git ignora; o script recusa gravar dentro de `public/`). Depois: `node fonte/gerar-seed.js leitura-local.json --enviar`.
6. Sem terminal: o botão **Atualizar com a rev6** do próprio site continua funcionando.

Como o endpoint funciona (`public/api/leitura.js`): só aceita `POST` com a chave no cabeçalho `x-chave` (ou `Authorization: Bearer`), corpo JSON `{ snap, fonte, quem }` de até 1 MB e no formato esperado; chave na URL é recusada; `GET` é recusado. O endpoint não conhece a chave: repassa ao banco (`taf_snap_salvar`), que compara o SHA-256 com `taf_chave`.

Tarefas editadas no site (taf_tarefa_edicao) ficam por cima e não são apagadas por uma nova leitura.

## Resumo automático para o diretor (e-mail no horário)
O site manda sozinho, por e-mail, o resumo de cada obra: diário em dia útil às 7h de Brasília e semanal na segunda às 7h30 (os `crons` de `public/vercel.json`, em UTC). Quem recebe é cadastrado na tela do ERP: **Gestão e administração > Resumo para o diretor** (só chave pessoal de Diretoria ou gestor). Lá também ficam "Ver prévia", "Copiar para WhatsApp" e "Mandar agora para mim".

Endpoint `public/api/resumo.js` (irmão do `/api/leitura`): `GET ?quando=diario|semanal` só com `Authorization: Bearer <CRON_SECRET>` (o agendador da Vercel manda sozinho); `POST` com a chave pessoal em `x-chave` para a prévia e o teste. O texto junta o planejador e o ERP pelo banco (`fonte/erp/sql/08_resumo.sql`, rascunho até o sim do Felipe). E-mail pela API da Resend, só `fetch`.

Para ligar (Vercel > Settings > Environment Variables, Production, e novo Deploy), além de `TAF_SUPABASE_URL` e `TAF_SUPABASE_KEY`:
- `CRON_SECRET`: um texto sorteado de 16 caracteres ou mais.
- `RESEND_API_KEY`: a chave da API da Resend.
- `RESUMO_REMETENTE`: por exemplo `Resumo TAF <resumo@seu-dominio>` (domínio conferido na Resend).
- `TAF_CHAVE_RESUMO`: a chave do robô, gerada na própria tela ("Gerar chave do robô"); aparece uma vez.

## Testes (sem banco real, sem rede)
`node --test "testes/*.test.js"` (Node 18 ou mais novo, sem instalar pacote). Usam Supabase e `fetch` simulados e leitura fictícia. Cobrem: GET recusado, sem chave, chave errada, chave na URL, corpo inválido, tamanho, POST válido gravando, o script local e uma trava que falha se dado real voltar a ser rastreado.

## Segurança do repositório
Ver `SEED-PRIVADO-LEIA-ME.md`: o `seed.js` antigo continua no histórico do Git público (tratar como exposto) e como limpar/trocar a chave.
