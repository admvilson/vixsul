-- ═══════════════════════════════════════════════════════════════════════════════
--  SEGURANÇA — PASSO 4: AUDITORIA ENXUTA (economiza espaço no banco)
--  Supabase → SQL Editor → New query → colar tudo → Run
--
--  Antes: cada gravação guardava o registro INTEIRO duas vezes (antes e depois), até 60 KB
--  cada lado — inclusive quando nada tinha mudado — e nada era apagado nunca.
--  Agora:
--   • gravou igual (nada mudou)  → não registra nada;
--   • alteração                  → guarda SÓ os campos que mudaram (antes e depois);
--   • inclusão de linha grande   → guarda só o resumo (obra, descrição, nº…);
--   • exclusão                   → continua guardando tudo (é o que permite "Desfazer a exclusão");
--   • o que tiver mais de 90 dias é apagado sozinho (a cópia diária no GitHub guarda os dados);
--   • os registros de login com mais de 180 dias também são apagados.
--  O "Desfazer" da tela Usuários › Auditoria continua funcionando.
--  No fim, aparece quanto espaço o banco e a auditoria estão usando.
-- ═══════════════════════════════════════════════════════════════════════════════

alter table public.auditoria add column if not exists parcial boolean not null default false;

-- quantos dias a auditoria fica guardada (para mudar, troque o 90 e rode de novo)
create or replace function public.vx_aud_dias() returns int language sql immutable as $$ select 90 $$;

-- campos que mudaram de "a" para "b": os valores de "a" + a lista "_sem" dos campos que não existiam em "a"
create or replace function public.vx_dif(a jsonb, b jsonb) returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(k, a->k) filter (where a ? k), '{}'::jsonb)
      || case when count(*) filter (where not (a ? k)) > 0
              then jsonb_build_object('_sem', jsonb_agg(k) filter (where not (a ? k))) else '{}'::jsonb end
  from (select distinct k from jsonb_object_keys(coalesce(a, '{}'::jsonb) || coalesce(b, '{}'::jsonb)) k
        where (a->k) is distinct from (b->k)) x
$$;

-- o que identifica o registro na lista da auditoria (obra, descrição, nº…)
create or replace function public.vx_aud_id(r jsonb) returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(k, left(r->>k, 80)), '{}'::jsonb)
  from unnest(array['titulo_obra','fornecedor','descricao','nome','n_nf','numero','titulo','o_que','data_medicao']) k
  where r ? k and coalesce(r->>k, '') <> ''
$$;

create or replace function public.vx_audita() returns trigger language plpgsql security definer set search_path = public as $$
declare a jsonb; d jsonb; rid bigint; parc boolean := false;
begin
  if tg_op = 'UPDATE' then
    if old.row_data is not distinct from new.row_data then return new; end if;     -- gravou igual: nada a registrar
    a := vx_dif(old.row_data, new.row_data);
    d := vx_dif(new.row_data, old.row_data) || jsonb_build_object('_id', vx_aud_id(new.row_data));
    rid := new.id; parc := true;
  elsif tg_op = 'INSERT' then
    d := new.row_data; rid := new.id;
    if pg_column_size(d) > 4000 then d := jsonb_build_object('_grande', true, '_id', vx_aud_id(new.row_data)); end if;
  else
    a := old.row_data; rid := old.id;
  end if;
  if pg_column_size(a) > 60000 then a := jsonb_build_object('_grande', true); end if;   -- planilha enorme: só marca
  if pg_column_size(d) > 60000 then d := jsonb_build_object('_grande', true, '_id', vx_aud_id(coalesce(new.row_data, old.row_data))); end if;
  insert into public.auditoria (quem, quem_nome, tabela, acao, registro, antes, depois, parcial)
  values (nullif(vx_uid(), ''), coalesce(auth.jwt()->>'nome', 'servidor'), tg_table_name, tg_op, rid, a, d, parc);
  -- de vez em quando (1 a cada ~100 gravações) apaga o que passou do prazo
  if random() < 0.01 then
    delete from public.auditoria where quando < now() - make_interval(days => vx_aud_dias());
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- limpeza agora: auditoria com mais de 90 dias e registros de login com mais de 180 dias
delete from public.auditoria where quando < now() - make_interval(days => public.vx_aud_dias());
do $$ begin
  if to_regclass('public.seguranca_eventos') is not null then
    delete from public.seguranca_eventos where quando < now() - interval '180 days';
  end if;
end $$;

-- quanto espaço está sendo usado (o plano grátis do Supabase vai até 500 MB)
select 'banco inteiro' as o_que, pg_size_pretty(pg_database_size(current_database())) as tamanho, null::bigint as linhas
union all
select 'auditoria', pg_size_pretty(pg_total_relation_size('public.auditoria')), (select count(*) from public.auditoria)
union all
select * from (
  select 'tabela ' || c.relname, pg_size_pretty(pg_total_relation_size(c.oid)), c.reltuples::bigint
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'auditoria'
  order by pg_total_relation_size(c.oid) desc limit 6
) t;
