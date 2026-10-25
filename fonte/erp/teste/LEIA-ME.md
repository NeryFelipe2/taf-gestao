# Testes do ERP (M1, M2, M3 e M4)

Tudo roda no Node, sem navegador, sem rede e sem banco. Os dados são só da **OBRA 999 · DEMONSTRAÇÃO** (fictícia) e de cenários aleatórios inventados.
Nada aqui abre `.env`, chave ou Supabase.

## Rodar

```
node --test "fonte/erp/teste/*.test.js"
```

Precisa de Node 20 ou mais novo e do `git` (o teste "igual ao de partida" lê o ERP do commit `243d676` com `git show`).

## O que cada arquivo prova

| Arquivo | Prova |
|---|---|
| `base_igual.test.js` | Com as chaves novas desligadas (padrão), o ERP novo calcula e mostra **exatamente** o que o commit de partida mostrava: 300 cenários aleatórios + obra 999, comparando saldos, alertas, Orçamento, Pacotes, Plano de contas, painéis, semáforo, abas, remanejar e Atualizar pela planilha. |
| `m1_conta.test.js` | M1, conta única. Cenário do plano (item A meta 1.000, OC 600 no A, NF 600 rateada 100% no B): desligada conta R$ 1.200 como hoje; ligada conta R$ 600 e avisa. As 6 cópias (05, 16, 29, 44 x2, 48) dão o mesmo número em 300 cenários, com a chave ligada e desligada. |
| `m1_remaneja.test.js` | M1, remanejar acerta `meta_unit`; "Atualizar pela planilha" lista os itens remanejados e deixa escolher qual meta vale; Parâmetros liga e desliga as chaves. |
| `revisao.test.js` | Correções dos achados da revisão: botão Salvar dos Parâmetros grava as chaves; rateio para item que não existe no orçamento não faz o valor sumir; nota sem lista de rateio falha como a partida (chave desligada); semáforo do grupo vermelho quando a meta já passa do limite; pacote sem teto usa o cadastro; código de pacote com espaço; meta do pacote nos alertas; aviso de que o banco não acompanha `calc_v2`; refatoração do realizado por conta e das listas de status (igual à partida em 300 cenários); texto da 342 só na 342; link direto para Eventos. |
| `m2.test.js` | M2, a soma dos itens de cada evento e de cada pacote é o grupo; item sem evento aparece em "Sem evento"; pacotes cruzando eventos; fecha com o total da obra; a diferença de 4.1.1 e 4.1.2 aparece; obra sem evento usa o grupo; teto e alerta do pacote pela soma; aba só com a chave ligada; tela só leitura. |
| `m3.test.js` | M3, compra com várias linhas (chave `par.oc_linhas`). Pedido de plano "FOFO": linha sem meta bloqueia a solicitação inteira; sem ela sai amarela, vira OC de duas linhas, é aprovada, recebida e rateada nas mesmas linhas; nota menor que o pedido reparte proporcional; faturado por linha. Pedido antigo (OC-9001 da 999 e 300 cenários) sai igual com a chave ligada. Pedidos com `linhas` guardadas, chave desligada: igual ao ERP de partida em 300 cenários. Comprometido por linha contra uma conta escrita de novo no teste (300 cenários, `calc_v2` ligada e desligada). Todos os leitores de item do pedido e da solicitação. |
| `m4.test.js` | M4, limite em três níveis (chave `par.ev_ctrl`). Cenários do plano: (a) item verde e evento sem saldo dá amarelo; (b) pacote acima do limite dá vermelho e vai à Diretoria; (c) duas OCs pendentes no mesmo item, a segunda recalcula e muda de cor ao ser aprovada (e a reserva já vale na emissão); (d) nota sem pedido acima do saldo pede alçada; (e) quem solicitou não aprova, por usuário e não por nome. Mais D2 (verdes do mesmo pacote e dia somam), D6 (item rígido), E3 (grupo acima do limite é vermelho), obra sem evento (grupo da EAP), tela de Aprovações, cor ligada nunca mais branda que desligada em 300 cenários e 150 sequências de ponta a ponta com M3 e M4 ligadas. |
| `acoes_igual.test.js` | Gravações com as chaves novas desligadas: 150 sequências de ações na tela (solicitar, cotar, emitir OC, aprovar ou reprovar, receber, ratear a nota, conferir, liberar, nota sem pedido) deixam documentos, auditoria e mensagens iguais às do ERP de partida (`243d676`). |

## Outros arquivos

- `ambiente.js`: monta o mesmo script do `build.py` num contexto do `vm` com um `document` de mentira (o `fetch` sempre recusa; `Date.now()` nunca repete, porque o ERP monta ids com ele; `api.msgs()` devolve as mensagens que a pessoa leria na tela). `api.clicar('params-ok')` dispara o clique de verdade num botão `data-act`.
- `gerador.js`: cenários aleatórios repetíveis (mesma semente, mesmo cenário).
- `obra999.js`: a obra fictícia (itens, pacotes, eventos, um pedido e notas) e o "eventograma oficial" fictício.
- `instantaneo.js`: "fotografia" do que o ERP calcula e mostra, para comparar partida e novo.
- `acoes.js`: as ações pela tela (`solicita`, `emite`, `lancaNota`): preenchem os campos do formulário e chamam a função do ERP, como o clique faria.
- `pagina_demo.js`: gera uma página para abrir no navegador, sem rede, só com a obra 999.

## Ver a tela no navegador (sem chave, sem banco)

```
python -I fonte/erp/build.py
node fonte/erp/teste/pagina_demo.js <pasta fora do repositório>
python -m http.server 8791 --bind 127.0.0.1 --directory <pasta>
```

Abrir `http://127.0.0.1:8791/erp-demo.html`. A página sai do `public/erp.html` sem o endereço do Supabase e sem a chave pública, bloqueia qualquer conexão
(`connect-src 'none'`) e guarda o estado no próprio navegador. As chaves novas começam desligadas: ligue em **Suprimentos → Compras → Parâmetros → Chaves desta obra**.
