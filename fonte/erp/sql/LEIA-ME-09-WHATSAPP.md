# WhatsApp (entrada): o que falta para ligar

Rascunho, não aplicado. Só ligar com o sim do Felipe. Nada é enviado a ninguém: o sistema só recebe e grava.

## O que já está no código

- `public/api/whatsapp.js`: webhook da Meta Cloud API. `GET` responde a verificação da Meta; `POST` confere a assinatura
  (`X-Hub-Signature-256`, HMAC do corpo bruto com o App Secret) e chama `ia_whatsapp_receber` uma vez por mensagem.
  Texto vai inteiro; áudio, imagem e documento vão só como tipo e id da mídia (nada é baixado). Sem variável, 503.
- `09_whatsapp_entrada.sql`: a função `public.ia_whatsapp_receber` (security definer), que confere o segredo pelo SHA-256 em
  `ia.config` e a lista de números liberados, e grava em `ia.fato` (hash por id da mensagem: reenvio da Meta não duplica).
- `09_teste_whatsapp.sql`: teste em transação com rollback (sem segredo, segredo errado, número fora da lista, número na
  lista, reenvio, mídia, papel anon). Tem de terminar com `09 OK`.
- `testes/whatsapp.test.js`: o endpoint com `fetch` simulado (`node --test testes/*.test.js`).

## Para ligar (nesta ordem)

1. Banco: aplicar `09_whatsapp_entrada.sql` (só cria a função; o esquema `ia` já existe no banco do centro de comando).
   Rodar `09_teste_whatsapp.sql` num banco de teste.
2. Banco: gravar o hash do segredo e a lista de números em `ia.config` (modelo no cabeçalho do 09). O segredo em texto
   não fica no banco, só o SHA-256. A lista é um array JSON de números em E.164 (`"+55DDDNUMERO"`).
3. Vercel (Settings > Environment Variables, Production, e novo Deploy): `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`,
   `WHATSAPP_SEGREDO_BANCO` (o mesmo texto do passo 2). `TAF_SUPABASE_URL` e `TAF_SUPABASE_KEY` já existem.
4. Meta (developers.facebook.com > app > WhatsApp > Configuração): URL de callback `https://<site>/api/whatsapp`, token de
   verificação = `WHATSAPP_VERIFY_TOKEN`, assinar o campo `messages`.

## O que fica gravado

Número liberado: `ia.fato` empresa GRUPO, tipo `mensagem`, título "WhatsApp de <nome>", texto da mensagem, `dados` com
`wa_id`, número, nome, quando e o bruto resumido. Número fora da lista: só "WhatsApp de número não liberado" com os 4 últimos
dígitos, sem texto e sem nome. O log da Vercel só tem contagens.

Desfazer: fim do `09_whatsapp_entrada.sql`.
