# Seed privado: o que mudou e o que falta (25/10/2026)

Decisão E7 do Felipe: tirar o dado real do repositório público do taf-gestao e trocar a chave.
Branch: `fix/seed-privado` (base 243d676). **Nada foi publicado, enviado nem aplicado**: sem push, sem deploy, sem SQL, sem rede.

## 1. O que mudou

| Antes | Agora |
|---|---|
| `public/api/seed.js` (100 KB, a leitura da rev6 embutida no código) rastreado num repo **público** | **Removido** (`git rm`) e ignorado no `.gitignore` |
| `GET /api/seed?k=<chave>`: chave na URL (histórico do navegador, log da Vercel) | `POST /api/leitura`: chave só no cabeçalho `x-chave` (ou `Authorization: Bearer`). `GET` é recusado (405). Chave na URL é recusada (400) |
| `fonte/gerar-seed.js` escrevia `public/api/seed.js` para ir no commit | Lê a rev6 no computador e **envia por POST** (`--enviar`) ou grava JSON local (`--salvar`). **Não escreve em `public/`** (recusa) |
| `fonte/seed.template.js` com endereço do banco e chave publicável no código | Removido. O endpoint novo (`public/api/leitura.js`) não tem dado, chave nem endereço: lê `TAF_SUPABASE_URL` e `TAF_SUPABASE_KEY` da Vercel |
| README: "gerar, commit, push, abrir URL com ?k=" | README: conferir, `--enviar`, pronto. Sem commit e sem push para atualizar números |

**Como a chave é conferida (preservado):** o endpoint não confere nada sozinho. Repassa a chave a `taf_snap_salvar(p_chave, ...)`, que chama `_taf_ok` e compara o SHA-256 com a tabela `taf_chave`. Chave errada vira 403. É o mesmo caminho do botão "Atualizar com a rev6" do site.

**O que o endpoint recusa antes de ir ao banco:** método que não é POST; chave na URL (`k`, `chave`, `key`, `token`, `apikey`...); sem chave; tipo diferente de `application/json` (415); corpo acima de 1 MB (413; a leitura de hoje tem ~100 KB); JSON quebrado; campo desconhecido no corpo (inclusive `chave`); leitura fora do formato (precisa de `corte`, `obras`, `restricoes` com pelo menos 1 item e tipos certos nas demais seções); `fonte` acima de 200 e `quem` acima de 80 caracteres. A resposta nunca repete a chave nem o texto do erro do banco, e nada disso vai para o log.

**O que não mudou:** `public/index.html`, `erp.html`, `ciclo.html`, `marko.html`, `centro*`, `vercel.json`, `versao.json`, `supabase/schema.sql`. O site no ar **não chama** `/api/seed` (conferido com `git grep`: só README, `gerar-seed.js` e o template citavam). Ele atualiza pelo botão, direto no Supabase.

## 2. Como testar sem banco real

```
node --test "testes/*.test.js"
```
Node 18+, nenhum pacote, nenhuma rede. Supabase e `fetch` são simulados; a leitura é fictícia; a chave de teste é sorteada a cada execução e só existe na memória. Resultado esperado: 76 testes, 0 falhas.

Cobre exatamente o pedido:
- **GET recusado** (405 + `Allow: POST`, também o formato antigo `?k=`), e HEAD/PUT/DELETE/OPTIONS.
- **Sem chave recusado** (401), em branco, grande demais.
- **Chave errada recusada** (403, o banco simulado confere o SHA-256 como o real; nada gravado).
- **Corpo inválido recusado** (21 casos: JSON quebrado, vazio, lista, sem `snap`, sem `restricoes`, tipo errado, itens demais, campo extra, fonte/quem fora do limite) e tamanho (413 por Content-Length, por objeto, por texto e por fluxo mentindo no Content-Length).
- **POST válido grava**: o banco simulado recebe a leitura idêntica, `apikey`/`Authorization` com a chave publicável, `redirect: 'error'`, chave de acesso só no corpo para o banco, nunca na URL.
- Extras: chave na URL recusada mesmo com cabeçalho certo; `Authorization: Bearer`; banco fora do ar (502); banco recusa o formato (422); servidor sem configuração (500); **a chave nunca aparece em log nem em resposta**; script local (`--enviar`, `--salvar`, recusa gravar em `public/`, recusa `http` fora de localhost e URL com `?`); **ponta a ponta** (script, HTTP real em 127.0.0.1, endpoint, Supabase simulado) com chave certa e errada.
- Trava de higiene (`testes/repositorio.test.js`): falha se `seed*.js` voltar a ser rastreado, se algo grande aparecer em `public/api`, se o código carregar chave/endereço do banco, ou se o `.gitignore` deixar de cobrir leitura, planilha e chave.

Também conferi que cada proteção tem dente: tirei de propósito, uma de cada vez, a recusa de GET, a recusa de chave na URL, o `redirect: 'error'`, o log com a chave, a validação de formato e o limite de Content-Length. Os testes quebraram nas seis. Arquivo restaurado depois.

## 3. O dado antigo CONTINUA no histórico do Git público: tratar como exposto

Remover o arquivo agora **não apaga** o que já foi publicado.
- `public/api/seed.js` entrou no commit `3fa816a` (22/10/2026) e nunca mais foi alterado: é **um único blob** no histórico. Esse commit está em `main` e em `origin/main` (último estado conhecido aqui: 243d676 de 24/10). Qualquer pessoa pode abrir esse commit no GitHub enquanto o repositório for público.
- Seções que a leitura carrega (só a estrutura, sem valores): contratos, medido, recebido, carteira, caixa e saldo, BMs, NFs, restrições com nomes de donos, compromissos, semanas.
- Mesmo reescrevendo o histórico, **cópias podem existir**: forks, clones de terceiros, caches de busca, espelhos e arquivos da web, e as páginas em cache do próprio GitHub (SHA antigo continua abrindo até o GitHub limpar). Tratar como exposto desde 22/10.
- O README de antes ensinava `?k=<chave>` na URL. Essa chave pode estar em histórico de navegador, log da Vercel e em conversas. Por isso a troca da chave (item 5).
- As chaves publicáveis do Supabase continuam nos arquivos do site (`index.html` etc.). É por desenho (o navegador precisa delas; quem manda é a chave de acesso e as regras do banco). Não são o problema desta correção.

## 4. Reescrever o histórico (NÃO executei nada disto; decisão do Felipe)

Reescrever muda todos os hashes: quem tem clone ou worktree antigo precisa recriar (inclui `_NUVEM - PROJETO TAF\site-taf-repo\taf-gestao`, o worktree `taf-gestao-trabalho` com `feat/orcamento-m3-m4` e este). Ordem sugerida: (1) mesclar `fix/seed-privado` na `main`; (2) limpar; (3) recriar as outras branches em cima do histórico novo (`git rebase --onto` ou cherry-pick).

**Contenção imediata, sem reescrever nada:** GitHub > repositório > Settings > Danger Zone > Change visibility > Private. Depois conferir se a Vercel continua fazendo deploy. Forks públicos que já existem ficam com a cópia deles (ver Insights > Forks).

**Opção A, git filter-repo (recomendada):**
```
git clone --mirror https://github.com/NeryFelipe2/taf-gestao taf-gestao-BACKUP.git   # cópia de segurança, guardar fora do GitHub
git clone https://github.com/NeryFelipe2/taf-gestao taf-gestao-limpo
cd taf-gestao-limpo
pip install git-filter-repo
git filter-repo --invert-paths --path public/api/seed.js
git log --all --oneline -- public/api/seed.js            # tem que sair vazio
git rev-list --all --objects | grep "api/seed.js"        # tem que sair vazio
git remote add origin https://github.com/NeryFelipe2/taf-gestao   # o filter-repo remove o origin de propósito
git push --force --all origin
git push --force --tags origin
```

**Opção B, BFG:**
```
git clone --mirror https://github.com/NeryFelipe2/taf-gestao taf-gestao-espelho.git
java -jar bfg.jar --delete-files seed.js taf-gestao-espelho.git
cd taf-gestao-espelho.git
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push --force
```
O BFG protege o commit atual (HEAD): só rode depois do passo (1), com `seed.js` já fora da `main`. Ele apaga arquivos chamados `seed.js` em qualquer pasta (conferi em todas as refs: só existe `public/api/seed.js`; `seed.template.js` e `gerar-seed.js` têm outro nome e ficam). O push do espelho pode avisar que não consegue atualizar `refs/pull/*`: é normal.

**Depois do push forçado:** pedir ao Suporte do GitHub para remover visões em cache e commits órfãos do commit `3fa816a` (o push forçado não limpa `refs/pull/*` nem o cache de SHA). O push forçado também não limpa forks de terceiros: conferir Insights > Forks e tratar caso a caso (ver a página do GitHub "Removing sensitive data from a repository").

## 5. Trocar a chave (E7): SQL para o Felipe aplicar, não apliquei

Pelo E2 e pela regra de "nada de SQL em produção", fica para ele. A tabela guarda só o hash (SHA-256), então a chave antiga não aparece nela.

1. Gerar uma chave nova e longa **no seu computador** (não colar em chat, URL nem arquivo do repositório):
   `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`
2. No SQL Editor do Supabase:
```sql
-- ver o que existe (nome e data; o hash não revela a chave)
select nome, criado_em, left(hash, 8) as inicio_do_hash from public.taf_chave order by criado_em;

-- criar a nova (troque os textos entre < >)
insert into public.taf_chave(hash, nome)
values (encode(extensions.digest('<NOVA-CHAVE>', 'sha256'), 'hex'), '<quem usa>');
```
3. Testar a nova no site e no script (`TAF_CHAVE`). Só então apagar a antiga:
```sql
delete from public.taf_chave where nome = '<nome da chave antiga>';
```
4. Cada pessoa que usa o site digita a chave nova uma vez (o navegador guarda a antiga). As chaves de página pessoal (`taf_pessoa_chave`) são outras e só precisam de troca se também tiverem circulado em URL.

## 6. Riscos e pontos de atenção

- **Ordem do deploy:** até o merge e o deploy desta branch, o `/api/seed` antigo continua no ar em produção (a função não devolve a leitura, só grava; mas aceita chave na URL). Não use mais esse formato. Depois do deploy, `/api/seed` passa a dar 404.
- **Sem as duas variáveis na Vercel, o endpoint novo responde 500** ("servidor sem configuração"). O botão do site continua funcionando sem elas.
- **Deploys antigos da Vercel** guardam o código antigo (com a leitura). A função não é baixável por HTTP, mas quem tem acesso ao projeto na Vercel vê. Se quiser, apagar deploys antigos.
- **Sem limite de tentativas de chave** no endpoint (função serverless não guarda contador entre chamadas). A defesa é a chave longa e aleatória. Opção: regra de rate limit no Firewall da Vercel para `/api/leitura`.
- O endpoint não manda CORS de propósito: navegador de outro site não consegue chamá-lo. Só script/terminal.
- Se alguma rotina, fluxo do n8n ou agendamento de fora chamar `GET /api/seed?k=...`, vai passar a falhar (de propósito). Não achei nenhum no repositório; fora dele não tenho como saber.
- Se a extração (`fonte/extract.js`) ganhar seção nova, o endpoint aceita (até 40 seções). Se mudar o tipo de uma seção conhecida (`bms` deixar de ser lista, por exemplo), é preciso ajustar `SECOES` em `public/api/leitura.js`.
- `*.xlsx` e `*.xls` entraram no `.gitignore`: a rev6 não vai por engano para o repositório.
- Não li a rev6 de verdade nem abri `.env`/`CHAVES*`. Para provar que o validador aceita o formato real, rodei a validação **em memória** sobre a leitura que estava no `seed.js` antigo (aceitou, corpo de ~100 KB, 10x de folga no limite) sem imprimir nem copiar valor.

## 7. O que depende do Felipe

1. Sim/não: mesclar `fix/seed-privado` na `main` (e fazer push/deploy; eu não fiz).
2. Cadastrar na Vercel `TAF_SUPABASE_URL` e `TAF_SUPABASE_KEY` (a publicável, nunca a `service_role`) e redeployar.
3. Sim/não: deixar o repositório **privado agora** (contenção imediata).
4. Sim/não: reescrever o histórico (opção A ou B) e depois pedir limpeza de cache ao GitHub.
5. Trocar a chave no Supabase (item 5) e avisar quem usa o site.
6. Decidir se e quem avisar do dado exposto desde 22/10 (sócios dos consórcios, diretoria).
7. Conferir se alguma rotina de fora chamava `/api/seed`.
