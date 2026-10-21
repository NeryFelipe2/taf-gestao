# Site TAF (Vercel + Supabase)

Mesmo modelo do site da WCR: uma página só (`public/index.html`), dados no Supabase.
Aba Tarefas = restrições R01-R110 da rev6. Quem edita, todos veem (salva a cada edição, confere a cada 30 s).

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

## Refazer o index.html
`fonte/transform.py` monta `public/index.html` a partir de `template2.html`, `wcr.css`, `extract.js` e `loader.html` (rodar dentro de `fonte/` com Python + Pillow). Ele grava `fonte/index.html` (copiar para `public/index.html` e apagar o de `fonte/`) e `public/versao.json` com o código da versão: quem está com o site aberto recebe a versão nova sozinho (confere a cada 2 minutos e ao voltar para a aba; não recarrega enquanto a pessoa digita).

## Atualizar os números (quem faz: o Claude)
1. `npm i xlsx@0.18.5` (fora do repositório) e `node fonte/gerar-seed.js "<caminho da rev6.xlsx>"` (gera `public/api/seed.js`).
2. Commit + push; esperar o deploy ficar READY.
3. Abrir `https://taf-gestao.vercel.app/api/seed?k=<chave>`: grava a nova leitura no banco. Quem já está com o site aberto vê na próxima abertura.
Tarefas editadas no site (taf_tarefa_edicao) ficam por cima e não são apagadas por uma nova leitura.
