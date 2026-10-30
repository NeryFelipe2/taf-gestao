# WhatsApp pela Meta: botão de aprovação e cópia para o Hermes

Rascunho, não ligado. Só ligar com o sim do Felipe. Continuação do `LEIA-ME-09-WHATSAPP.md` e do `LEIA-ME-10-WHATSAPP-BIRD.md`.

**Construído conforme a documentação, testado só com assinatura simulada; ainda não recebeu entrega real da Meta.**

## 1. O fluxo

```
Meta  ->  Vercel (/api/whatsapp)  ->  banco   (ia.fato; comando de aprovação)
                                  ->  Hermes  (cópia da mesma entrega)
```

1. A Meta entrega o POST no `/api/whatsapp`. Esse é o **único callback cadastrado na Meta**; o Hermes não é cadastrado lá.
2. O endpoint confere a assinatura `X-Hub-Signature-256` com o App Secret. Errada: 401 e nada acontece.
3. Grava cada mensagem no banco (`ia_whatsapp_receber`) e, ao mesmo tempo, manda a cópia ao Hermes se a entrega traz mensagem. A resposta à Meta só sai depois dos dois, ou do tempo limite de cada um (banco 4 s, Hermes 3 s; a função tem 10 s).
4. A resposta vem **só do banco**: 200 se gravou (ou se o banco recusou por validação); 503 se o banco falhou por motivo passageiro, e a Meta reenvia. A cópia nunca muda isso.

A única coisa que sai do endpoint é essa cópia da própria entrega. Mensagem para pessoa continua não saindo daqui.

## 2. Variáveis da Vercel (Settings > Environment Variables, Production, e novo Deploy)

| Variável | Para quê |
|---|---|
| `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_SEGREDO_BANCO` | as do caminho Meta (LEIA-ME-09) |
| `TAF_SUPABASE_URL`, `TAF_SUPABASE_KEY` | as do `/api/leitura` (já existem) |
| **`HERMES_WEBHOOK_URL`** (nova, opcional) | endereço do webhook do Hermes |

`HERMES_WEBHOOK_URL`:
- Tem de ser `https://...`. `http://` só vale para `127.0.0.1` e `localhost` (teste local). URL com usuário e senha não vale.
- A documentação do Hermes diz que o caminho padrão do webhook dele é `/whatsapp/webhook` (muda com `WHATSAPP_CLOUD_WEBHOOK_PATH`) e que ele precisa de um endereço público https (túnel ou domínio). Exemplo: `https://<endereço público do Hermes>/whatsapp/webhook`.
- URL inválida ou insegura é **ignorada**, com um aviso no log que não traz a URL (o caminho dela pode ser segredo).
- Sem a variável (ou vazia), nada muda: o endpoint só grava no banco.

## 3. O que o Hermes precisa para conferir a assinatura

O **mesmo App Secret** do app da Meta. A cópia leva o corpo com os mesmos bytes e o `X-Hub-Signature-256` original, então o Hermes confere como se a Meta tivesse chamado direto. Na documentação do Hermes a variável é `WHATSAPP_CLOUD_APP_SECRET`; sem ela ele recusa a entrega com 503. Lá também ficam o `WHATSAPP_CLOUD_ALLOWED_USERS` (números que ele aceita, com código do país e sem `+`) e, se quiser, o `WHATSAPP_CLOUD_WABA_ID` (a cópia traz o mesmo corpo, então bate).

A verificação do webhook (o `GET` com `hub.challenge`) é entre a Meta e o `/api/whatsapp`. O Hermes só recebe `POST`.

## 4. Botões de aprovação

O remetente do banco manda a aprovação com botões. Estes são os formatos que a Meta entrega no toque (conferidos na documentação oficial):

| O que o usuário toca | O que chega | O que vai ao banco |
|---|---|---|
| Botão de mensagem interativa (janela de 24 h) | `type: "interactive"`, `interactive.type: "button_reply"`, `button_reply.id` | o `id`, como texto; `tipo = interactive`, `botao = true` |
| Linha de lista | `type: "interactive"`, `interactive.type: "list_reply"`, `list_reply.id` | o `id`, como texto; `tipo = interactive`, `botao = true` |
| Botão de resposta rápida de **modelo** de mensagem | `type: "button"`, `button.payload` e `button.text` (sem `interactive`) | o `payload`, como texto; `tipo = button`, `botao = true` |

- O texto que o banco recebe é igual ao digitado: `ok 12` aprova, `nao 12` recusa (a regra do 10 aceita `nao` sem acento). Só número da lista, só aprovação pendente, e a mesma mensagem entregue duas vezes vale uma vez só.
- Título, rótulo e descrição do botão **não** são gravados.
- Modelo sem `payload` aproveitável: o rótulo só vale se ele mesmo for o comando (`ok 12`, `nao 12`, `não 12`); senão a mensagem entra como tipo desconhecido, sem texto. Outros `interactive` (produto, fluxo): só o tipo.
- Quem manda tem de pôr os ids exatamente `ok N` e `nao N` (N = número da aprovação). Em **modelo**, o payload tem de ser definido no envio (`parameters: [{ "type": "payload", "payload": "ok 12" }]`). Sem isso a Meta devolve um valor genérico (a documentação mostra o próprio rótulo, e a antiga mostra `No-Button-Payload`), que não é comando.
- Limite de tamanho (Meta): id de botão 256 caracteres, id de linha de lista 200. O texto é cortado em 256. O tamanho máximo do payload de modelo não foi confirmado.

**Comando de aprovação não vai ao Hermes.** A documentação do Hermes diz que o toque em botão antigo ("stale") cai como texto comum e não diz o que ele faz com toque em botão que ele nunca mandou. Para ele não responder como conversa a um "ok 12", o `/api/whatsapp` **não copia** a entrega em que TODA mensagem é comando de aprovação (toque em botão, lista ou modelo com id `ok N`/`nao N`, ou o mesmo texto digitado), na mesma gramática da função do banco (`10_whatsapp_aprovacao.sql`; um teste compara as duas expressões). Quem trata o comando é o banco. Na dúvida a cópia sai: entrega que mistura comando e conversa, ou com mensagem que o banco não leu, vai inteira (a assinatura só vale para o corpo inteiro). O pior efeito de um descompasso é o Hermes ver, ou não, um comando; nunca um comando deixar de ser aplicado. No SOUL.md do Hermes vale a regra de ignorar em silêncio mensagem que seja só `ok N` ou `nao N`.

## 5. Se o Hermes cair

**Nada se perde: o banco já gravou.** A gravação não depende do Hermes, e a Meta recebe o mesmo 200 de sempre.

- A falha vira uma linha no log da Vercel: `whatsapp: encaminhamento falhou (rede)` ou `(status N)`. Sem URL, sem corpo, sem número. Tempo esgotado conta como `(rede)`; redirecionamento (3xx) conta como falha e não é seguido.
- Não há nova tentativa, e a Meta não reenvia (ela recebeu 200). Então o Hermes **não** recebe depois o que perdeu enquanto estava fora. O texto fica em `ia.fato` (`fonte = 'whatsapp'`) para quem precisar reler.
- Mensagem repetida: se o banco falhar (503), a Meta reenvia a entrega e a cópia sai de novo, com o mesmo id de mensagem. A documentação do Hermes não diz se ele ignora repetidas; confirmar.
- Para desligar a cópia: apagar `HERMES_WEBHOOK_URL` e fazer novo Deploy.

## 6. Limites

- Só o `/api/whatsapp` encaminha. A Bird **não** encaminha.
- Só entrega que traz mensagem, e que não seja só comando de aprovação (ver acima). Aviso de status (entregue, lido) não é encaminhado.
- Um POST por entrega, com tempo limite de 3 s, sem nova tentativa e sem seguir redirecionamento. Vão só `Content-Type` e `X-Hub-Signature-256`; nenhuma chave do banco.
- O endpoint continua respondendo 503, sem encaminhar, se faltarem as variáveis do banco ou do App Secret (inerte até configurar).
- Mídia: nada é baixado aqui. Pela documentação do Hermes, ele baixa imagem, áudio e documento com o token dele.

## 7. Testar

- `node --test testes/*.test.js` (o arquivo `whatsapp-hermes.test.js` cobre botão, lista, modelo, cópia, falhas, URL inválida, corpo idêntico byte a byte e o 503 do banco com a cópia dando certo).
- No Postgres de teste: `10_teste_whatsapp_aprovacao.sql` (casos 3m: toque em botão `ok N` e `nao N`). Nunca no banco real.
- Primeira entrega real: conferir no log da Vercel `whatsapp: encaminhado ao Hermes`, em `ia.fato` a mensagem, e no Hermes que a assinatura bateu.
