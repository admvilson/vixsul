-- ═══════════════════════════════════════════════════════════════════════════════
--  SEGURANÇA — PASSO 3: VERIFICAÇÃO EM DUAS ETAPAS (código do celular no login)
--  Supabase → SQL Editor → New query → colar tudo → Run   (pode rodar a qualquer momento)
--
--  Cria na tabela de usuários (que só o servidor de login acessa) os campos do segundo fator:
--  o segredo do aplicativo autenticador, os códigos reserva (guardados só como "impressão
--  digital", nunca o código em si) e o último código usado (o mesmo código não vale duas vezes).
-- ═══════════════════════════════════════════════════════════════════════════════
alter table public.usuarios
  add column if not exists mfa_segredo  text,
  add column if not exists mfa_pendente text,
  add column if not exists mfa_reserva  text,
  add column if not exists mfa_ultimo   bigint;

-- a tabela continua fechada para o navegador (só o servidor de login lê e grava)
revoke all on public.usuarios from anon, authenticated;
