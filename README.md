# Site TAF (Vercel + Supabase)

Mesmo modelo do site da WCR: uma página só (`public/index.html`), dados no Supabase.
Aba Tarefas = restrições R01-R110 da rev6. Quem edita, todos veem (salva a cada edição, confere a cada 30 s).

## Como funciona
- Entra com uma **chave de acesso** (guardada no navegador). Sem a chave, nada dos números aparece.
- Os números vêm da rev6: o banco guarda a última leitura. Para atualizar: botão **Atualizar com a rev6** e escolher o .xlsx (salva para todos).
- Edições das tarefas ficam por cima da rev6, no banco (`taf_tarefa_edicao`, com histórico em `taf_tarefa_hist`). Não mexem na planilha.
- Banco: Supabase `construdata-platform`, só tabelas `taf_*` (ver `supabase/schema.sql`). Nada da WCR foi alterado.

## Publicar no Vercel (3 passos)
1. Subir esta pasta num repositório do GitHub.
2. Vercel > Add New > Project > escolher o repositório. Framework: Other. Root Directory: `public`. Deploy.
3. Abrir o link, digitar a chave e o seu nome. Banco vazio: escolher a rev6 (.xlsx) uma vez.

## Refazer o index.html
`fonte/transform.py` monta `public/index.html` a partir de `template2.html`, `wcr.css`, `extract.js` e `loader.html` (rodar dentro de `fonte/` com Python + Pillow).

## Atualizar os números (quem faz: o Claude)
1. `npm i xlsx@0.18.5` (fora do repositório) e `node fonte/gerar-seed.js "<caminho da rev6.xlsx>"` (gera `public/api/seed.js`).
2. Commit + push; esperar o deploy ficar READY.
3. Abrir `https://taf-gestao.vercel.app/api/seed?k=<chave>`: grava a nova leitura no banco. Quem já está com o site aberto vê na próxima abertura.
Tarefas editadas no site (taf_tarefa_edicao) ficam por cima e não são apagadas por uma nova leitura.
