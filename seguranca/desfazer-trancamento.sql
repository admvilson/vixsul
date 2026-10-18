-- ═══════════════════════════════════════════════════════════════════════════════
--  EMERGÊNCIA — desfaz o PASSO 2 (volta o banco ao modo antigo, ABERTO)
--  Use só se algo parar de funcionar depois do passo 2, até a correção.
--  Supabase → SQL Editor → New query → colar tudo → Run
-- ═══════════════════════════════════════════════════════════════════════════════
do $$
declare t text; pol record;
  tabelas text[] := array['obras','custos','faturamentos','aportes','cap','orcamentos','despesas','etapas','obra_imagens',
                          'medicoes','diario_obra','documentos','fornecedores','contratos','acoes','reunioes','planejamento','arquivos','usuarios'];
begin
  foreach t in array tabelas loop
    if to_regclass('public.' || t) is null then continue; end if;
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
    execute format('create policy "acesso_total" on public.%I for all using (true) with check (true)', t);
    execute format('drop trigger if exists vx_dono on public.%I', t);
    execute format('drop trigger if exists vx_audita on public.%I', t);
  end loop;
end $$;
