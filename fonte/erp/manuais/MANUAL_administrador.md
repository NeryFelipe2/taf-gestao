# Manual do Administrador do sistema
**Seu dia:** usuários, papéis, backup e saúde do sistema.

## Tarefas
- **Usuários** (Gestão e administração → Usuários): quem se cadastra entra como "Aguardando liberação"; atribua o papel. **O primeiro cadastro vira Admin**: crie o seu e, depois de cadastrar a equipe, **feche o cadastro aberto** no Supabase (Authentication → Providers → desligar "Allow new users to sign up").
- **Obras** (botão Obras): importe 343 e 281 a partir dos dados do repositório.
- **Administração**: grupos, acessos temporários, horário, suplentes, alçadas por evento, parâmetros de pessoas.
- **Acessos** (site TAF): chave pessoal de Diretoria, gestor, engenheiro, encarregado e só leitura, criada e desativada pela tela (ver Manual de Gerente, Diretoria e Gestão). Precisa do `fonte/erp/sql/06_acessos.sql` aplicado no banco.
- **Auditoria**: filtre por entidade, período e pessoa; copie CSV.
- **Backup**: Administração → Gerar backup (JSON da obra). Backup do banco: veja `docs/BACKUP_E_RECUPERACAO.md`.

## Cuidados
- Nunca coloque a chave `service_role` no front. A chave publicável em `web/config.js` é pública por desenho; a segurança vem do RLS.
- Mudanças de banco: sempre migração em `supabase/migrations` e teste em `supabase/tests`.
