-- ═══════════════════════════════════════════════════════════════════════════════
--  SEGURANÇA — PASSO 1 (pode rodar a qualquer momento; não muda nada do que já funciona)
--  Supabase → SQL Editor → New query → colar tudo → Run
--
--  Cria a tabela onde o servidor de login anota as tentativas de entrada (para bloquear
--  quem erra a senha muitas vezes) e os códigos de recuperação de senha.
--  Só o servidor (chave de serviço) lê e grava nela: o navegador não tem acesso.
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists public.seguranca_eventos (
  id      bigint generated always as identity primary key,
  quando  timestamptz not null default now(),
  tipo    text not null,          -- login · codigo · codigo_erro · codigo_usado · senha_trocada
  chave   text not null,          -- interno:<cpf> ou externo:<e-mail>
  ok      boolean not null default false,
  ip      text,
  detalhe text
);
create index if not exists seguranca_eventos_busca on public.seguranca_eventos (tipo, chave, quando desc);

alter table public.seguranca_eventos enable row level security;   -- sem políticas = ninguém de fora acessa
revoke all on public.seguranca_eventos from anon, authenticated;
