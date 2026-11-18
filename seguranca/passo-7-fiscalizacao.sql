-- ═══════════════════════════════════════════════════════════════════════════════
--  SEGURANÇA — PASSO 7: A FISCALIZAÇÃO PARA QUEM TEM PAPEL NA TABELA DA OBRA
--  Supabase → SQL Editor → New query → colar tudo → Run   (pode rodar de novo sem problema)
--
--  O problema: a Fiscalização (Diário de obra › Fiscalização) guarda as linhas e os movimentos na tabela
--  "planejamento", e o passo 2 só deixa usuário INTERNO gravar nela. O usuário EXTERNO (ex.: o fiscal da
--  contratante) recebia "new row violates row-level security policy for table planejamento" ao incluir,
--  responder, aceitar ou rejeitar. E "excluir de vez" valia só para quem lançou cada registro — na
--  Fiscalização, cada movimento da linha é de uma pessoa diferente.
--
--  Agora, SÓ nas linhas da Fiscalização (reprov_item = a linha, reprov_ev = cada movimento) de uma obra que
--  a pessoa vê:
--    • grava e altera quem o Administrador colocou em "Quem faz cada ação" (Configurar a tabela) nessa obra
--      — também o usuário externo;
--    • exclui de vez quem tem o papel "Exclui linhas" nessa obra.
--  O resto do banco continua como no passo 2 (nada é aberto além disso). A configuração da tabela
--  (reprov_cfg) não entra aqui: o usuário externo não mexe nela.
--  Para desfazer: os três "drop policy" do fim deste arquivo.
-- ═══════════════════════════════════════════════════════════════════════════════

-- a pessoa (pelo passe do login) está em algum papel — ou no papel pedido — da tabela da Fiscalização da obra?
-- (os papéis guardam o CPF de quem é interno e o e-mail de quem é externo: o mesmo "app_uid" do passe)
create or replace function public.vx_fisc_papel(obra text, papel text default null) returns boolean
language sql stable security definer set search_path = public as $$
  select public.vx_adm() or exists (
    select 1
    from public.planejamento c
    cross join lateral (
      select case jsonb_typeof(c.row_data->'papeis')
               when 'object' then c.row_data->'papeis'
               when 'string' then case when left(btrim(c.row_data->>'papeis'), 1) = '{' then (c.row_data->>'papeis')::jsonb else '{}'::jsonb end
               else '{}'::jsonb end as p) x
    where c.row_data->>'tipo' = 'reprov_cfg'
      and c.row_data->>'titulo_obra' = obra
      and coalesce(c.row_data->>'_lixeira_em', '') = ''
      and exists (select 1 from jsonb_each(x.p) e
                  where (papel is null or e.key = papel)
                    and jsonb_typeof(e.value) = 'array'
                    and e.value ? public.vx_uid()))
$$;
revoke all on function public.vx_fisc_papel(text, text) from public, anon;
grant execute on function public.vx_fisc_papel(text, text) to authenticated;

-- as regras novas SOMAM com as do passo 2 (basta uma delas deixar)
drop policy if exists vx_fisc_incluir on public.planejamento;
create policy vx_fisc_incluir on public.planejamento for insert to authenticated
  with check (row_data->>'tipo' in ('reprov_item', 'reprov_ev')
              and public.vx_ve(row_data) and public.vx_fisc_papel(row_data->>'titulo_obra'));

drop policy if exists vx_fisc_alterar on public.planejamento;
create policy vx_fisc_alterar on public.planejamento for update to authenticated
  using      (row_data->>'tipo' in ('reprov_item', 'reprov_ev')
              and public.vx_ve(row_data) and public.vx_fisc_papel(row_data->>'titulo_obra'))
  with check (row_data->>'tipo' in ('reprov_item', 'reprov_ev')
              and public.vx_ve(row_data) and public.vx_fisc_papel(row_data->>'titulo_obra'));

drop policy if exists vx_fisc_excluir on public.planejamento;
create policy vx_fisc_excluir on public.planejamento for delete to authenticated
  using (row_data->>'tipo' in ('reprov_item', 'reprov_ev')
         and public.vx_ve(row_data) and public.vx_fisc_papel(row_data->>'titulo_obra', 'excluir'));

-- conferência: as três regras novas (deve listar vx_fisc_alterar, vx_fisc_excluir e vx_fisc_incluir)
select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'planejamento' and policyname like 'vx_fisc_%' order by 1;
