-- ═══════════════════════════════════════════════════════════════════════════════
--  PASSO 5: ARQUIVOS NO STORAGE + MEDIDOR DE ESPAÇO
--  Supabase → SQL Editor → New query → colar tudo → Run
--
--  • Cria o "Storage" (pasta de arquivos do Supabase, 1 GB grátis, separado dos 500 MB do banco):
--    os anexos das obras, documentos, notas, fotos do diário e desenhos do projeto passam a ser
--    guardados lá — o banco fica só com o cabeçalho (nome, tipo, quem enviou).
--  • Pasta PRIVADA: só quem entrou no sistema (com o passe do login) lê e grava; os nomes dos
--    arquivos são sorteados e só aparecem para quem tem acesso à obra.
--  • Cria o medidor de espaço que aparece em Usuários › Segurança (só o Administrador vê).
--  Depois de rodar: Usuários › Segurança › "Mover para o Storage" leva os arquivos que já existem.
-- ═══════════════════════════════════════════════════════════════════════════════

-- pasta privada "anexos", até 20 MB por arquivo
insert into storage.buckets (id, name, public, file_size_limit)
values ('anexos', 'anexos', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- quem pode o quê na pasta
drop policy if exists vx_anexos_ler     on storage.objects;
drop policy if exists vx_anexos_incluir on storage.objects;
drop policy if exists vx_anexos_alterar on storage.objects;
drop policy if exists vx_anexos_excluir on storage.objects;
create policy vx_anexos_ler on storage.objects for select to authenticated
  using (bucket_id = 'anexos' and coalesce(auth.jwt()->>'vx', '') = '1');
create policy vx_anexos_incluir on storage.objects for insert to authenticated
  with check (bucket_id = 'anexos' and coalesce(auth.jwt()->>'vx', '') = '1');
create policy vx_anexos_alterar on storage.objects for update to authenticated
  using (bucket_id = 'anexos' and coalesce(auth.jwt()->>'vx', '') = '1')
  with check (bucket_id = 'anexos' and coalesce(auth.jwt()->>'vx', '') = '1');
-- excluir: o Administrador, a equipe interna, ou o usuário externo que enviou o arquivo
create policy vx_anexos_excluir on storage.objects for delete to authenticated
  using (bucket_id = 'anexos' and coalesce(auth.jwt()->>'vx', '') = '1'
         and (public.vx_adm() or not public.vx_externo() or owner_id = (auth.jwt()->>'sub')));

-- medidor de espaço (só responde para o Administrador)
create or replace function public.vx_espaco() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.vx_adm() then return null; end if;
  return jsonb_build_object(
    'banco',     pg_database_size(current_database()),
    'arquivos',  pg_total_relation_size('public.arquivos'),
    'auditoria', pg_total_relation_size('public.auditoria'),
    'storage',   coalesce((select sum((metadata->>'size')::bigint) from storage.objects where bucket_id = 'anexos'), 0),
    'storage_n', (select count(*) from storage.objects where bucket_id = 'anexos'));
end $$;
revoke all on function public.vx_espaco() from public, anon;
grant execute on function public.vx_espaco() to authenticated;

select 'Pronto: pasta "anexos" criada e medidor de espaço instalado.' as resultado;
