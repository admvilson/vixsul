-- ═══════════════════════════════════════════════════════════════════════════════
--  PASSO 6: FÁBRICA DE PRÉ-MOLDADOS
--  Supabase → SQL Editor → New query → colar tudo → Run
--
--  Cria a tabela "premoldados" (peças, traços, ordens de produção, diário de produção,
--  estoque, vendas, compras de insumos, custos e parâmetros da fábrica), com as mesmas
--  proteções das outras tabelas do sistema:
--   • só quem entrou no sistema (equipe interna) lê e grava — usuário externo não vê a fábrica;
--   • excluir: o Administrador ou quem lançou;
--   • o banco grava quem lançou cada registro e tudo entra na auditoria (Configurações › Segurança).
--  Pode rodar de novo sem problema.
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists public.premoldados (
  id         bigserial primary key,
  row_data   jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists premoldados_tipo on public.premoldados ((row_data->>'tipo'));

alter table public.premoldados enable row level security;
revoke all on public.premoldados from anon;
grant select, insert, update, delete on public.premoldados to authenticated;
grant usage, select on sequence public.premoldados_id_seq to authenticated;

do $$ declare pol record; begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'premoldados' loop
    execute format('drop policy %I on public.premoldados', pol.policyname);
  end loop;
end $$;
create policy vx_ler      on public.premoldados for select to authenticated using (not public.vx_externo());
create policy vx_incluir  on public.premoldados for insert to authenticated with check (not public.vx_externo());
create policy vx_alterar  on public.premoldados for update to authenticated using (not public.vx_externo()) with check (not public.vx_externo());
create policy vx_excluir  on public.premoldados for delete to authenticated using (
  public.vx_adm() or coalesce(row_data->>'criado_por_id', '') = '' or row_data->>'criado_por_id' = any(public.vx_ids()));

-- quem lançou (gravado pelo banco) e auditoria
drop trigger if exists vx_dono on public.premoldados;
create trigger vx_dono before insert or update on public.premoldados for each row execute function public.vx_dono();
drop trigger if exists vx_audita on public.premoldados;
create trigger vx_audita after insert or update or delete on public.premoldados for each row execute function public.vx_audita();

-- tempo real (as telas se atualizam sozinhas quando outra pessoa grava)
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'premoldados') then
    alter publication supabase_realtime add table public.premoldados;
  end if;
end $$;

notify pgrst, 'reload schema';
select 'Pronto: tabela da fábrica de pré-moldados criada e protegida.' as resultado;
