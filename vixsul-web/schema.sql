-- ═══════════════════════════════════════════════
--  Vixsul Empreendimentos — Schema Supabase
--  Cole este SQL no editor do Supabase:
--  supabase.com → seu projeto → SQL Editor → New Query
-- ═══════════════════════════════════════════════

-- ── Tabelas de dados (JSONB flexível) ──────────
-- A coluna row_data armazena as mesmas chaves que
-- o Google Sheets usava (normalizadas pelo sistema).

CREATE TABLE IF NOT EXISTS obras (
  id         BIGSERIAL PRIMARY KEY,
  row_data   JSONB     NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS custos (
  id         BIGSERIAL PRIMARY KEY,
  row_data   JSONB     NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS faturamentos (
  id         BIGSERIAL PRIMARY KEY,
  row_data   JSONB     NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS aportes (
  id         BIGSERIAL PRIMARY KEY,
  row_data   JSONB     NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cap (
  id         BIGSERIAL PRIMARY KEY,
  row_data   JSONB     NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Índices para consultas frequentes no CAP ───
CREATE INDEX IF NOT EXISTS idx_cap_lancamento
  ON cap ((row_data->>'data_lancamento'));

CREATE INDEX IF NOT EXISTS idx_cap_titulo_obra
  ON cap ((row_data->>'titulo_obra'));

-- ── Tabela de usuários (colunas fixas) ─────────
CREATE TABLE IF NOT EXISTS usuarios (
  id         BIGSERIAL PRIMARY KEY,
  nome       TEXT,
  cpf        TEXT UNIQUE NOT NULL,
  senha      TEXT NOT NULL,
  perfil     TEXT NOT NULL DEFAULT 'Usuário',
  status     TEXT NOT NULL DEFAULT 'ativo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Usuário administrador inicial ──────────────
-- TROQUE o CPF e a senha antes de usar em produção!
INSERT INTO usuarios (nome, cpf, senha, perfil, status)
VALUES ('Administrador', '00000000000', 'admin123', 'admin', 'ativo')
ON CONFLICT (cpf) DO NOTHING;

-- ── RLS: desabilitado (API usa service key) ────
-- As rotas /api/* no Vercel usam SUPABASE_SERVICE_KEY,
-- que bypassa o RLS por design. Não exponha essa chave
-- no frontend — ela fica apenas nas variáveis do Vercel.
ALTER TABLE obras        DISABLE ROW LEVEL SECURITY;
ALTER TABLE custos       DISABLE ROW LEVEL SECURITY;
ALTER TABLE faturamentos DISABLE ROW LEVEL SECURITY;
ALTER TABLE aportes      DISABLE ROW LEVEL SECURITY;
ALTER TABLE cap          DISABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios     DISABLE ROW LEVEL SECURITY;
