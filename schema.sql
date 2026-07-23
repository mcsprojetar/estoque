-- ============================================================================
-- SISTEMA DE CONFERÊNCIA DE MERCADORIAS — SCHEMA SUPABASE
-- ============================================================================
-- Como usar:
-- 1. Crie um projeto em https://supabase.com (plano gratuito serve para começar)
-- 2. Abra "SQL Editor" no painel do Supabase
-- 3. Cole este arquivo inteiro e clique em "Run"
-- 4. Vá em Authentication > Providers e confirme que "Email" está ativado
-- 5. Crie o primeiro usuário administrador (veja instruções no fim do arquivo)
--
-- MIGRAÇÃO: se você já rodou uma versão anterior deste schema (com a
-- coluna codigo_barras), pode rodar este arquivo de novo sem medo — os
-- comandos abaixo removem essa coluna automaticamente e o restante usa
-- "create or replace" / "if not exists", então não duplica nada.
-- ============================================================================

-- Extensão para gerar UUIDs
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. PERFIS DE USUÁRIO (papéis de acesso)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null,
  role text not null default 'funcionario' check (role in ('funcionario', 'gerente', 'administrador')),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Todo usuário autenticado pode ver a lista de perfis (nomes, para exibir "quem fez o quê")
create policy "profiles_select_all" on public.profiles
  for select using (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- Função auxiliar: retorna o papel do usuário logado — SOMENTE se o perfil
-- estiver ativo. Isso é o que faz o botão "Desativar" da tela Usuários
-- realmente revogar o acesso do usuário no banco (e não só escondê-lo na
-- interface). Toda policy de autorização do sistema usa esta função — por
-- isso ela precisa ser criada ANTES de qualquer policy que a referencie.
-- ----------------------------------------------------------------------------
create or replace function public.meu_papel()
returns text
language sql
security definer
stable
as $$
  select role from public.profiles where id = auth.uid() and ativo = true;
$$;

-- Usuário só edita o próprio perfil (e só se ainda estiver ativo); administrador edita qualquer perfil
create policy "profiles_update_self_or_admin" on public.profiles
  for update using (
    (auth.uid() = id and ativo = true)
    or public.meu_papel() = 'administrador'
  );

create policy "profiles_insert_self" on public.profiles
  for insert with check (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- [CRÍTICO] Trava de escalonamento de privilégio.
-- A policy "profiles_update_self_or_admin" permite que o próprio usuário
-- edite sua linha em "profiles" (para trocar nome, por exemplo). Sem esta
-- trigger, nada impediria uma chamada direta à API alterando também as
-- colunas "role" e "ativo" da própria linha — ou seja, qualquer funcionário
-- autenticado poderia se autopromover a administrador. A trigger abaixo
-- ignora qualquer tentativa de alterar "role" ou "ativo" que não venha de
-- um administrador ativo, e força novos cadastros a nascerem sempre como
-- 'funcionario' e ativos, não importa o que o cliente envie.
-- ----------------------------------------------------------------------------
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
as $$
begin
  if TG_OP = 'INSERT' then
    new.role := 'funcionario';
    new.ativo := true;
    return new;
  end if;

  if public.meu_papel() <> 'administrador' then
    new.role := old.role;
    new.ativo := old.ativo;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_privileges on public.profiles;
create trigger trg_protect_profile_privileges
  before insert or update on public.profiles
  for each row execute function public.protect_profile_privileges();

-- ----------------------------------------------------------------------------
-- 2. PRODUTOS (conferência + dados gerenciais no mesmo registro)
-- ----------------------------------------------------------------------------
create table if not exists public.produtos (
  id uuid primary key default gen_random_uuid(),

  -- Campos da Área de Conferência (todo funcionário pode preencher)
  data_conferencia date not null default current_date,
  fornecedor text not null,
  marca text not null,
  descricao text not null,
  quantidade numeric not null default 0,
  observacao text,

  -- Campos da Área Gerencial (somente gerente/administrador)
  valor_compra numeric,
  valor_venda numeric,
  estoque_minimo numeric,
  categoria text,
  localizacao text,
  observacoes_gerencial text,

  criado_por uuid references public.profiles(id),
  atualizado_por uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Migração: remove apenas a coluna código de barras (descontinuada);
-- localizacao/categoria continuam existindo normalmente
alter table public.produtos drop column if exists codigo_barras;
alter table public.produtos add column if not exists localizacao text;
drop index if exists idx_produtos_codigo_barras;

create index if not exists idx_produtos_descricao on public.produtos using gin (to_tsvector('portuguese', descricao));
create index if not exists idx_produtos_fornecedor on public.produtos (fornecedor);
create index if not exists idx_produtos_marca on public.produtos (marca);
create index if not exists idx_produtos_categoria on public.produtos (categoria);
create index if not exists idx_produtos_data on public.produtos (data_conferencia);

alter table public.produtos enable row level security;

-- Qualquer usuário autenticado E ATIVO pode ver os produtos
create policy "produtos_select_all" on public.produtos
  for select using (public.meu_papel() is not null);

-- Qualquer usuário autenticado e ativo pode cadastrar (conferência)
create policy "produtos_insert_all" on public.produtos
  for insert with check (public.meu_papel() is not null);

-- Apenas gerente/administrador (ativos) pode editar ou excluir
create policy "produtos_update_gerencia" on public.produtos
  for update using (public.meu_papel() in ('gerente', 'administrador'));

create policy "produtos_delete_gerencia" on public.produtos
  for delete using (public.meu_papel() in ('gerente', 'administrador'));

-- Atualiza automaticamente updated_at e preenche criado_por/atualizado_por
-- pelo lado do servidor (nunca confiar no valor enviado pelo cliente, que
-- poderia ser falsificado para atribuir uma alteração a outra pessoa).
create or replace function public.trigger_set_updated_at()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    new.criado_por := auth.uid();
  end if;
  new.atualizado_por := auth.uid();
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.produtos;
create trigger set_updated_at before insert or update on public.produtos
  for each row execute function public.trigger_set_updated_at();

-- ----------------------------------------------------------------------------
-- VIEW pública para Funcionários: esconde os campos financeiros/gerenciais.
-- O RLS do Postgres não filtra colunas, só linhas — por isso usamos esta view
-- na tela de Conferência para funcionários, e a tabela completa (produtos)
-- apenas na Área Gerencial, que já é restrita por papel na interface e nas
-- policies de update/delete acima.
-- ----------------------------------------------------------------------------
create or replace view public.produtos_conferencia as
  select id, data_conferencia, fornecedor, marca, descricao,
         quantidade, observacao, criado_por, created_at, updated_at
  from public.produtos;

-- ----------------------------------------------------------------------------
-- 3. LOG DE AUDITORIA
-- ----------------------------------------------------------------------------
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid references public.produtos(id) on delete set null,
  usuario_id uuid references public.profiles(id),
  usuario_nome text,
  acao text not null check (acao in ('criar', 'editar', 'excluir')),
  detalhes jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;

create policy "audit_select_gerencia" on public.audit_log
  for select using (public.meu_papel() in ('gerente', 'administrador'));

create policy "audit_insert_all" on public.audit_log
  for insert with check (public.meu_papel() is not null);

-- ----------------------------------------------------------------------------
-- 4. REALTIME
-- ----------------------------------------------------------------------------
-- Usa um bloco condicional porque "alter publication ... add table" dá erro
-- se a tabela já estiver na publicação — isso quebraria a reexecução segura
-- do script em bancos que já rodaram uma versão anterior deste schema.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'produtos'
  ) then
    alter publication supabase_realtime add table public.produtos;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'audit_log'
  ) then
    alter publication supabase_realtime add table public.audit_log;
  end if;
end $$;

-- ============================================================================
-- CRIANDO O PRIMEIRO ADMINISTRADOR
-- ============================================================================
-- 1. No painel Supabase, vá em Authentication > Users > Add user
--    (ou deixe alguém se cadastrar pela tela de login do sistema)
-- 2. Depois de criado, rode (trocando o e-mail):
--
--    update public.profiles set role = 'administrador'
--    where email = 'seuemail@empresa.com';
--
-- Novos usuários entram por padrão como 'funcionario'; promova-os pela
-- própria Área Gerencial > Usuários (disponível para administrador).
--
-- Observação: o comando UPDATE acima funciona mesmo com a trava de
-- escalonamento de privilégio (trg_protect_profile_privileges), porque ao
-- rodar direto no SQL Editor não existe um usuário autenticado na sessão
-- (auth.uid() é nulo) — a trava só entra em ação quando a alteração vem de
-- uma sessão autenticada comum (via app/API) e o autor não é administrador.
-- ============================================================================
