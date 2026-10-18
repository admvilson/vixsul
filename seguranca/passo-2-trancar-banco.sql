-- ═══════════════════════════════════════════════════════════════════════════════
--  SEGURANÇA — PASSO 2: TRANCAR O BANCO
--  ⚠ Rode SÓ DEPOIS de confirmar que o login novo funciona (ver as instruções).
--  Supabase → SQL Editor → New query → colar tudo → Run
--
--  O que muda:
--  • Antes: a regra "acesso_total" deixava QUALQUER pessoa com a chave pública (que fica no código do
--    site) ler, alterar e apagar tudo, inclusive a tabela de usuários.
--  • Agora: só quem entrou no sistema (com o passe emitido pelo servidor de login) lê e grava.
--    – Excluir: só quem lançou o registro, ou um Administrador (registro antigo sem dono: qualquer
--      usuário logado, para não travar rotinas do sistema).
--    – O "dono" (criado_por_id) é gravado pelo próprio banco a partir do passe — não dá para forjar —
--      e não muda nas edições.
--    – Usuário externo e usuário com obras marcadas só recebem as linhas das obras dele (e os cadastros
--      sem obra); despesas da empresa e aportes ficam de fora para eles. Usuário externo só grava no
--      diário, nas fotos e no avanço das etapas.
--    – A tabela de usuários (com as senhas) fica fechada: só o servidor de login acessa.
--    – Toda inclusão, alteração e exclusão fica registrada na tabela "auditoria" (quem, quando, o antes
--      e o depois) — só o Administrador consulta.
--  Para voltar atrás numa emergência: seguranca/desfazer-trancamento.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── quem está usando (lido do passe) ──
create or replace function public.vx_uid() returns text language sql stable as $$ select coalesce(auth.jwt()->>'app_uid','') $$;
create or replace function public.vx_adm() returns boolean language sql stable as $$ select coalesce((auth.jwt()->>'adm')::boolean, false) $$;
create or replace function public.vx_externo() returns boolean language sql stable as $$ select coalesce(auth.jwt()->>'tipo','') = 'externo' $$;
create or replace function public.vx_ids() returns text[] language sql stable as $$
  select coalesce(array(select jsonb_array_elements_text(coalesce(auth.jwt()->'ids','[]'::jsonb))), '{}'::text[]) $$;
create or replace function public.vx_obras() returns text[] language sql stable as $$
  select coalesce(array(select jsonb_array_elements_text(coalesce(auth.jwt()->'obras','[]'::jsonb))), '{}'::text[]) $$;
-- a linha é de uma obra que o usuário pode ver? (sem obra = cadastro/configuração: todos veem)
create or replace function public.vx_ve(r jsonb) returns boolean language sql stable as $$
  select vx_adm() or cardinality(vx_obras()) = 0
      or coalesce(r->>'titulo_obra', r->>'nome_obra', '') = ''
      or r->>'titulo_obra' = any(vx_obras()) or r->>'nome_obra' = any(vx_obras())
      or coalesce(r->>'responsavel','') = coalesce(auth.jwt()->>'nome','#')
$$;

-- ── dono gravado pelo banco ──
create or replace function public.vx_dono() returns trigger language plpgsql as $$
begin
  if vx_uid() = '' then return new; end if;              -- servidor (chave de serviço): não carimba
  if tg_op = 'INSERT' then
    if not (tg_table_name = 'arquivos' and coalesce(new.row_data->>'tipo','') = 'anexo_parte') then
      new.row_data := coalesce(new.row_data, '{}'::jsonb)
        || jsonb_build_object('criado_por_id', vx_uid(), 'criado_por', coalesce(auth.jwt()->>'nome',''));
    end if;
  elsif old.row_data ? 'criado_por_id' then               -- edição: o dono continua o mesmo
    new.row_data := coalesce(new.row_data, '{}'::jsonb)
      || jsonb_build_object('criado_por_id', old.row_data->'criado_por_id', 'criado_por', coalesce(old.row_data->'criado_por', to_jsonb(''::text)));
  end if;
  return new;
end $$;

-- ── auditoria ──
create table if not exists public.auditoria (
  id        bigint generated always as identity primary key,
  quando    timestamptz not null default now(),
  quem      text, quem_nome text,
  tabela    text, acao text, registro bigint,
  antes     jsonb, depois jsonb
);
create index if not exists auditoria_quando on public.auditoria (quando desc);
alter table public.auditoria enable row level security;
revoke all on public.auditoria from anon, authenticated;
grant select on public.auditoria to authenticated;
drop policy if exists vx_aud_ler on public.auditoria;
create policy vx_aud_ler on public.auditoria for select to authenticated using (vx_adm());

create or replace function public.vx_audita() returns trigger language plpgsql security definer set search_path = public as $$
declare a jsonb; d jsonb; rid bigint;
begin
  if tg_op in ('UPDATE','DELETE') then a := old.row_data; rid := old.id; end if;
  if tg_op in ('INSERT','UPDATE') then d := new.row_data; rid := new.id; end if;
  if pg_column_size(a) > 60000 then a := jsonb_build_object('_grande', true); end if;   -- linha enorme (planilha): só marca
  if pg_column_size(d) > 60000 then d := jsonb_build_object('_grande', true); end if;
  insert into public.auditoria (quem, quem_nome, tabela, acao, registro, antes, depois)
  values (nullif(vx_uid(),''), coalesce(auth.jwt()->>'nome','servidor'), tg_table_name, tg_op, rid, a, d);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- ── políticas de cada tabela ──
do $$
declare t text; pol record;
  tabelas text[] := array['obras','custos','faturamentos','aportes','cap','orcamentos','despesas','etapas','obra_imagens',
                          'medicoes','diario_obra','documentos','fornecedores','contratos','acoes','reunioes','planejamento','arquivos'];
  externo_grava text[] := array['diario_obra','obra_imagens','arquivos','etapas'];
begin
  foreach t in array tabelas loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table public.%I enable row level security', t);
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);

    -- ler
    if t in ('despesas') then
      execute format('create policy vx_ler on public.%I for select to authenticated using (vx_adm() or (cardinality(vx_obras()) = 0 and not vx_externo()))', t);
    elsif t = 'aportes' then
      execute format('create policy vx_ler on public.%I for select to authenticated using (not vx_externo() and vx_ve(row_data))', t);
    else
      execute format('create policy vx_ler on public.%I for select to authenticated using (vx_ve(row_data))', t);
    end if;
    -- incluir e alterar (usuário externo só no diário, fotos e avanço)
    if t = any(externo_grava) then
      execute format('create policy vx_incluir on public.%I for insert to authenticated with check (vx_ve(row_data))', t);
      execute format('create policy vx_alterar on public.%I for update to authenticated using (vx_ve(row_data)) with check (vx_ve(row_data))', t);
    else
      execute format('create policy vx_incluir on public.%I for insert to authenticated with check (not vx_externo() and vx_ve(row_data))', t);
      execute format('create policy vx_alterar on public.%I for update to authenticated using (not vx_externo() and vx_ve(row_data)) with check (not vx_externo() and vx_ve(row_data))', t);
    end if;
    -- excluir: o Administrador, ou quem lançou (registro antigo sem dono: qualquer usuário logado)
    execute format($p$create policy vx_excluir on public.%I for delete to authenticated using (
      vx_adm() or coalesce(row_data->>'criado_por_id','') = '' or row_data->>'criado_por_id' = any(vx_ids()))$p$, t);

    execute format('drop trigger if exists vx_dono on public.%I', t);
    execute format('create trigger vx_dono before insert or update on public.%I for each row execute function public.vx_dono()', t);
    if t <> 'arquivos' then
      execute format('drop trigger if exists vx_audita on public.%I', t);
      execute format('create trigger vx_audita after insert or update or delete on public.%I for each row execute function public.vx_audita()', t);
    end if;
  end loop;
end $$;

-- ── usuários: fechada (senhas). Só o servidor de login, com a chave de serviço, acessa ──
alter table public.usuarios enable row level security;
do $$ declare pol record; begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'usuarios' loop
    execute format('drop policy %I on public.usuarios', pol.policyname);
  end loop;
end $$;
revoke all on public.usuarios from anon, authenticated;
