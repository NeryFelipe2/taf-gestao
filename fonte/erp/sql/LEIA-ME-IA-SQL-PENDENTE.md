# IA no sistema (relato do WhatsApp e pergunta sobre a obra): o que falta para ligar

Rascunho, não aplicado. Só ligar com o sim do Felipe.

## O que já está no código

- `public/api/assistente.js`: endpoint `POST /api/assistente` (chave só no cabeçalho `x-chave`). Lê o relato e devolve a
  proposta de apontamentos, ou responde uma pergunta sobre a situação da obra. **Não grava nada.**
- `/marko`, aba Hoje (Apontar o dia): cartão "Relato do WhatsApp". A pessoa confere, marca e grava pela fila de sempre
  (`taf_ciclo_salvar`, ação `apont`), igual ao apontamento à mão.
- `/ciclo`, aba Situação: "Perguntar ao assistente", embaixo do "Copiar resumo".
- `07_ia.sql`: controle de uso por chave, obra, ação e dia (`taf_ia_contar`, `taf_ia_uso`, `taf_ia_param`).

Sem os passos abaixo, as telas mostram "A IA ainda não está ligada neste sistema" e o resto continua igual.

## Para ligar (nesta ordem)

1. Banco: aplicar `07_ia.sql` (só cria objetos `taf_ia_*`; não muda nada que existe). Depois rodar `07_teste_999.sql`:
   tem de terminar com `07 OK` (roda numa transação e desfaz tudo).
2. Vercel, variáveis do projeto: `ANTHROPIC_API_KEY` (chave da conta da IA, só no servidor). Opcional: `TAF_IA_MODELO`
   (padrão `claude-haiku-5-5`, o modelo pequeno). `TAF_SUPABASE_URL` e `TAF_SUPABASE_KEY` já existem (as do `/api/leitura`).
3. Publicar o site (o `vercel.json` já dá 30 s para a função do assistente).

## Limite e desligar

- Padrão: 30 usos por chave por dia (relato e pergunta somados), dia de Brasília. O endpoint lê a obra primeiro e só
  conta logo antes de chamar a IA: semana fechada, não publicada ou sem compromisso aberto não gasta uso; IA que falha
  depois de chamada (ocupada, demorou) conta. Mudar:
  `update public.taf_ia_param set valor = 50, em = now(), quem = 'Felipe' where nome = 'limite_dia';`
- Desligar pelo banco: `valor = 0`. Desligar pelo site: apagar `ANTHROPIC_API_KEY` na Vercel.
- Quem usa: relato só quem aponta (engenheiro); pergunta engenheiro, gestor e diretoria. Chave de leitura não usa.

## O que vai para a IA

Só o recorte de uma obra: os compromissos abertos da semana (com o que já foi apontado) e o texto colado; na pergunta,
a situação da obra (luzes, o que decidir, eventos em risco, qualidade do dado). A chave de acesso nunca vai. O texto
colado pode ter nome e telefone de quem escreveu no grupo: a tela pede para tirar antes de colar.

Desfazer o banco: fim do `07_ia.sql`.
