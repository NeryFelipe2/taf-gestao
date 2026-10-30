# WhatsApp pela Bird, reenvio em falha e aprovação por comando

Rascunho, não aplicado. Só ligar com o sim do Felipe. Nada é enviado a ninguém: o sistema só recebe e grava. Continuação do `LEIA-ME-09-WHATSAPP.md`.

**Construído conforme a documentação da Bird, testado só com assinatura sintética; ainda não recebeu uma entrega real.**

## 1. Os dois caminhos de entrada

| Caminho | Endpoint | Quando usar |
|---|---|---|
| Bird | `POST /api/whatsapp-bird` | O número está numa conta WhatsApp Business (WABA) que fica na Bird. É o caso da empresa hoje. |
| Meta direto | `GET` e `POST /api/whatsapp` | Só se um número for ligado direto na Cloud API da Meta, sem a Bird. Fica pronto, parado. |

Os dois gravam do mesmo jeito: chamam a mesma função do banco (`ia_whatsapp_receber`), que confere o segredo e a lista de números e grava em `ia.fato`. Um número usa um caminho só.

## 2. Variáveis da Vercel (Settings > Environment Variables, Production, e novo Deploy)

| Variável | Meta direto | Bird | O que é |
|---|---|---|---|
| `WHATSAPP_VERIFY_TOKEN` | sim | não | texto sorteado, digitado no painel da Meta |
| `WHATSAPP_APP_SECRET` | sim | não | App Secret do app da Meta |
| `BIRD_WEBHOOK_SECRET` | não | sim | segredo do webhook na Bird (`whsec_...`, aparece uma vez) |
| `WHATSAPP_SEGREDO_BANCO` | sim | sim | segredo que o banco confere pelo SHA-256 em `ia.config` |
| `TAF_SUPABASE_URL`, `TAF_SUPABASE_KEY` | sim | sim | as do `/api/leitura` (já existem) |

Sem a variável do caminho, o endpoint responde 503 e não faz nada. Nada disso entra no repositório (ele é público).

## 3. Cadastrar o webhook na Bird

Guia oficial: https://bird.com/docs/guides/webhooks (o menu pode mudar de lugar; o guia manda).

1. Na Bird, criar um webhook novo com a URL `https://<site>/api/whatsapp-bird`.
2. Inscrever só o evento `whatsapp.received`. A Bird só entrega esse evento a quem se inscreveu nele. Status de entrega e reação não são necessários.
3. A Bird mostra o segredo (`whsec_...`) **uma vez só**. Copiar direto para a variável `BIRD_WEBHOOK_SECRET` da Vercel. Não colar em conversa, e-mail ou arquivo do repositório.
4. Conferir que `WHATSAPP_SEGREDO_BANCO` está na Vercel e que `ia.config` tem `whatsapp_segredo_banco` e `whatsapp_allowlist` (modelo no cabeçalho do `09_whatsapp_entrada.sql`).
5. Novo Deploy na Vercel.
6. Mandar uma mensagem de texto de um número da lista. Conferir em `ia.fato` (`fonte = 'whatsapp'`) e nos Runtime Logs da Vercel (`whatsapp-bird: 1 mensagem(ns), 1 gravada(s)...`).

Se o webhook for criado antes da variável existir, as entregas dessa janela recebem 503 e a Bird reenvia (8 tentativas em cerca de 27,5 horas, com o mesmo `webhook-id`). Nada se perde, e reenviar não duplica.

Para trocar o segredo: usar a rotação do segredo do webhook na Bird e trocar `BIRD_WEBHOOK_SECRET` na Vercel. Durante a rotação a Bird pode mandar mais de uma assinatura no mesmo cabeçalho; o endpoint aceita se uma delas bater.

## 4. O que o endpoint da Bird faz com cada coisa

| O que chega | Resposta | O que acontece |
|---|---|---|
| Assinatura ausente, errada ou com mais de 5 minutos | 400 | nada é gravado; a Bird reenvia |
| Sem `BIRD_WEBHOOK_SECRET`, ou sem as variáveis do banco | 503 | nada é gravado; a Bird reenvia |
| `whatsapp.received` de texto | 200 | grava o texto, o nome e o número |
| `whatsapp.received` de outro tipo (imagem, áudio, vídeo, documento, figurinha, local, contatos, interativa, botão) | 200 | grava só o tipo; sem texto, sem id de mídia |
| `from` sem `phone_number` (usuário com username/BSUID) | 200 | não grava (não dá para conferir a lista); conta como `sem_numero` |
| Status (`accepted`, `sent`, `delivered`, `read`, `failed`, `rejected`), reação e tipo desconhecido | 200 | ignora |
| O banco recusa por validação (`NUMERO INVALIDO`, `MENSAGEM SEM ID`) | 200 | conta a falha; reenviar não adiantaria |
| Falha passageira do banco (rede, 5xx, segredo ou função ainda não configurados) | **503** | a Bird reenvia; a gravação é idempotente pelo id da mensagem |

O mesmo vale para o caminho da Meta direto: antes, falha do banco virava 200 e a mensagem se perdia; agora vira 503 e a Meta reenvia.

Limites desta versão, para não ter surpresa:
- O formato do `timestamp` do envelope não estava na documentação lida. O código aceita texto ISO, segundos ou milissegundos; se não entender, usa a hora em que a mensagem chegou.
- O formato de dentro de cada tipo de mensagem que não é texto também não foi lido. Por isso o código só olha qual tipo veio e nunca abre o conteúdo.
- O corpo precisa chegar inteiro, byte a byte, para a assinatura bater. O código desliga a leitura automática de corpo da Vercel (`config.api.bodyParser = false`, o modo que a documentação da Vercel indica). Na primeira entrega real, confirmar que o endpoint respondeu 200 e não 400.

## 5. Aprovar pelo celular

Para aplicar: `10_whatsapp_aprovacao.sql` troca a função do 09 por uma com os comandos, com a mesma assinatura (não muda quem chama). O arquivo inteiro pode ser aplicado no banco real: o primeiro bloco só cria tabela que não existe, e as de verdade já existem. Fora do horário de uso: `psql -1 -v ON_ERROR_STOP=1 -f 10_whatsapp_aprovacao.sql`. Para desfazer, rodar de novo a função do 09.

Comandos (mensagem de **texto**, de um número da lista, e só o comando, sem mais nada na frase):

| Para | Escrever | Exemplos |
|---|---|---|
| Aprovar | `ok`, `sim`, `aprovo`, `aprovado` ou `pode` + o número | `ok 12`, `Sim #12.`, `pode 12!` |
| Recusar | `não`, `nao`, `recuso`, `recusado` ou `cancela` + o número. Para dar o motivo: um separador e o motivo | `não 12`, `NÃO 12`, `não 12: falta o documento` |

- Maiúscula e minúscula valem igual. O `#` antes do número é opcional.
- Separador do motivo na recusa: dois pontos, ponto e vírgula, vírgula, ponto, hífen ou travessão (`:` `;` `,` `.` `-` `–` `—`). O motivo vai até 500 caracteres. Sem o separador, não é comando.
- Só muda uma aprovação que existe e está `pendente`. Qualquer outra (inexistente, já aprovada, recusada, enviada, expirada) não é alterada, e a mensagem fica marcada `nao_encontrado`.
- Aprovar grava `status = 'aprovado'`, `decidido_em` e `decidido_por = 'whatsapp final <4 últimos dígitos>'`. Recusar faz o mesmo com `'recusado'` e guarda o motivo (até 500 caracteres; sem motivo, fica vazio).
- Número fora da lista nunca aprova nem recusa.
- A mesma mensagem entregue duas vezes (reenvio da Meta ou da Bird) nunca vale duas vezes.
- A mensagem continua gravada em `ia.fato` (texto, para auditoria), e `dados` ganha `comando` (`aprovado`, `recusado` ou `nao_encontrado`) e `aprovacao_id`.
- **O sistema não responde no WhatsApp.** Para saber se pegou, olhar `ia.aprovacao` (status) ou `ia.fato` (`dados->>'comando'`).
- **Frase comum não vira comando.** O comando é só a palavra e o número; na recusa, o motivo só entra depois de um separador. Por isso `não 3 equipes foram à obra`, `não 12 falta documento` (sem separador) e `ok 3 equipes` não fazem nada: a mensagem só fica gravada em `ia.fato`.
- Limite que sobra: depois de um separador vale qualquer texto. Então `não 3,5 metros`, `não 3.5 toneladas`, `não 12:30 da tarde` ou `não 12-15 pessoas` ainda valem como recusa da aprovação 3 ou 12, se ela estiver pendente. Se isso incomodar, dá para não aceitar dígito logo depois do separador (mudança de uma linha no 10).

## 6. Testar

- `node --test testes/*.test.js` (inclui `whatsapp.test.js` e `whatsapp-bird.test.js`, sem rede e sem banco).
- No Postgres de teste (nunca no banco real: o teste mexe em `ia.config` dentro da transação): aplicar o 09, o 10 por cima, e rodar `09_teste_whatsapp.sql` (tem de dar `09 OK`) e `10_teste_whatsapp_aprovacao.sql` (tem de dar `10 OK`). Os dois desfazem tudo no fim (rollback).
- No banco real, depois de aplicar: criar uma aprovação de teste `pendente`, mandar `ok <número>` do celular da lista, conferir `ia.aprovacao` e `ia.fato`, e apagar a de teste.
