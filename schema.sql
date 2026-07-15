-- ═══════════════════════════════════════════════
--  Vixsul Empreendimentos — Schema Supabase
--  Cole este SQL no editor do Supabase:
--  supabase.com → seu projeto → SQL Editor → New Query
-- ═══════════════════════════════════════════════

-- ── Tabelas de dados (JSONB flexível) ──────────
CREATE TABLE IF NOT EXISTS obras (
  id         BIGSERIAL PRIMARY KEY,
  row_data   JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS custos (
  id         BIGSERIAL PRIMARY KEY,
  row_data   JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS faturamentos (
  id         BIGSERIAL PRIMARY KEY,
  row_data   JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS aportes (
  id         BIGSERIAL PRIMARY KEY,
  row_data   JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cap (
  id         BIGSERIAL PRIMARY KEY,
  row_data   JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orcamentos (
  id         BIGSERIAL PRIMARY KEY,
  row_data   JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Despesas: gastos gerais da empresa (aluguel, água/luz, material de escritório...),
-- SEM vínculo com uma obra — por isso não tem "titulo_obra" no row_data.
CREATE TABLE IF NOT EXISTS despesas (
  id         BIGSERIAL PRIMARY KEY,
  row_data   JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Etapas: cronograma de avanço da obra (uma linha por etapa).
-- row_data guarda: titulo_obra, nome_etapa, data_inicio, data_fim, peso (% físico),
-- avanco (% concluído) e valor (R$ previsto da etapa) — base do Gantt, da Curva S
-- e do Cronograma Físico-financeiro.
CREATE TABLE IF NOT EXISTS etapas (
  id         BIGSERIAL PRIMARY KEY,
  row_data   JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Índices para consultas do CAP ──────────────
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
  email      TEXT,   -- e-mail do usuário; usado no "Esqueci a senha" (código por e-mail)
  acessos    TEXT,   -- JSON com os módulos que o usuário pode ver; NULL = todos
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Se a tabela "usuarios" já existia antes desta atualização, rode só estas linhas
-- (SQL Editor → New query) para habilitar o controle de acesso e a recuperação de senha:
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS acessos TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email TEXT;

-- ── Usuário administrador inicial ──────────────
-- TROQUE o CPF e a senha antes de usar em produção!
INSERT INTO usuarios (nome, cpf, senha, perfil, status)
VALUES ('Administrador', '00000000000', 'admin123', 'admin', 'ativo')
ON CONFLICT (cpf) DO NOTHING;

-- ══════════════════════════════════════════════════════════
--  RLS — Row Level Security
--  Como o app acessa o Supabase direto do browser com a
--  anon key, precisamos habilitar RLS e criar políticas
--  que permitem todas as operações (a autenticação é feita
--  pelo próprio sistema via CPF + senha).
-- ══════════════════════════════════════════════════════════

ALTER TABLE obras        ENABLE ROW LEVEL SECURITY;
ALTER TABLE custos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE faturamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE aportes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE cap          ENABLE ROW LEVEL SECURITY;
ALTER TABLE orcamentos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios     ENABLE ROW LEVEL SECURITY;
ALTER TABLE despesas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE etapas       ENABLE ROW LEVEL SECURITY;

-- Política: permite SELECT, INSERT, UPDATE, DELETE para todos
-- (a proteção real é feita pela tela de login do sistema)

CREATE POLICY "acesso_total" ON obras        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "acesso_total" ON custos       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "acesso_total" ON faturamentos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "acesso_total" ON aportes      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "acesso_total" ON cap          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "acesso_total" ON orcamentos   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "acesso_total" ON usuarios     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "acesso_total" ON despesas     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "acesso_total" ON etapas       FOR ALL USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════
--  REALTIME — necessário para que uma máquina veja na hora
--  os lançamentos feitos em outra máquina, sem clicar em "Atualizar".
--  Se este projeto já existia antes desta atualização, rode só este
--  bloco (SQL Editor → New query) para ativar o tempo real.
-- ══════════════════════════════════════════════════════════

ALTER PUBLICATION supabase_realtime ADD TABLE obras;
ALTER PUBLICATION supabase_realtime ADD TABLE custos;
ALTER PUBLICATION supabase_realtime ADD TABLE faturamentos;
ALTER PUBLICATION supabase_realtime ADD TABLE aportes;
ALTER PUBLICATION supabase_realtime ADD TABLE cap;
ALTER PUBLICATION supabase_realtime ADD TABLE orcamentos;
ALTER PUBLICATION supabase_realtime ADD TABLE despesas;
ALTER PUBLICATION supabase_realtime ADD TABLE etapas;
