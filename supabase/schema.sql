-- ═══════════════════════════════════════════════════════════════
-- منظومة Strategic Workbench · Canonical Schema
-- Database: Supabase (Manzuma Dashboard project)
-- Applied via: Supabase migration `create_workbench_layer`
-- Date: 2026-06-09
--
-- All workbench tables prefixed with wb_
-- Existing tables (bot_entities, pm_snapshots, task_activity, etc.)
-- are reused — only the wb_* layer is new.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Portfolios ────────────────────────────────────────────────
-- 3 strategic portfolio categories for grouping concepts:
--   - محفظة التأسيس (Foundation): core stable concepts
--   - محفظة النمو (Growth):       concepts in expansion
--   - محفظة 0/1 (Zero-to-One):    innovations & breakthroughs

CREATE TABLE wb_portfolios (
  id              TEXT PRIMARY KEY,
  key             TEXT UNIQUE NOT NULL,           -- machine key: foundation | growth | zero_to_one
  name_ar         TEXT NOT NULL,                  -- display name in Arabic
  description_ar  TEXT,
  color           TEXT,                            -- e.g. '#8B6914' (text color)
  bg_color        TEXT,                            -- background tint
  sort_order      INT  DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

INSERT INTO wb_portfolios (id, key, name_ar, description_ar, color, bg_color, sort_order) VALUES
  ('pf_foundation', 'foundation',  'محفظة التأسيس', 'المفاهيم الأساسية المستقرة', '#8B6914', '#FBF5E4', 1),
  ('pf_growth',     'growth',      'محفظة النمو',   'المفاهيم في طور التوسع',    '#085041', '#E1F5EE', 2),
  ('pf_zero_one',   'zero_to_one', 'محفظة 0/1',    'الابتكارات والاختراقات',     '#3C3489', '#EEEDFE', 3);

-- ─── 2. Individuals (الأفراد) ─────────────────────────────────────
-- Pool of individuals participating in team formations.

CREATE TABLE wb_individuals (
  id          TEXT PRIMARY KEY,
  name_ar     TEXT NOT NULL,
  sector      TEXT,        -- ربحي | غير ربحي | أكاديمي | مبادرة | ابتكار | أخرى
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ─── 3. Institutional Entities (الكيانات المؤسسية) ──────────────
-- Pool of companies, associations, initiatives that team formations link to.

CREATE TABLE wb_entities (
  id          TEXT PRIMARY KEY,
  name_ar     TEXT NOT NULL,
  kind        TEXT,         -- شركة | شركة غ.ر | جمعية | مبادرة | مركز | وقف | أخرى
  sector      TEXT,         -- ربحي | غير ربحي | أكاديمي | ...
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ─── 4. Team Formations (التشكيلات) ──────────────────────────────
-- Belongs to a concept. Has members (M:N individuals) and entities (M:N).
-- Produces products (1:N — products have formation_id added to bot_entities).

CREATE TABLE wb_formations (
  id                  TEXT PRIMARY KEY,
  concept_entity_id   BIGINT REFERENCES bot_entities(id) ON DELETE CASCADE,
  name_ar             TEXT NOT NULL,
  sort_order          INT  DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at          TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_wb_formations_concept ON wb_formations(concept_entity_id);

-- ─── 5. Formation ↔ Individuals (M:N) ────────────────────────────

CREATE TABLE wb_formation_members (
  formation_id   TEXT REFERENCES wb_formations(id) ON DELETE CASCADE,
  individual_id  TEXT REFERENCES wb_individuals(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (formation_id, individual_id)
);

-- ─── 6. Formation ↔ Entities (M:N) ───────────────────────────────

CREATE TABLE wb_formation_entities (
  formation_id  TEXT REFERENCES wb_formations(id) ON DELETE CASCADE,
  entity_id     TEXT REFERENCES wb_entities(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (formation_id, entity_id)
);

-- ─── 7. Project Phases (مراحل المشاريع) ──────────────────────────
-- Each project (bot_entities entity_type='مشروع') has 0..N phases for the Gantt chart.

CREATE TABLE wb_project_phases (
  id                 TEXT PRIMARY KEY,
  project_entity_id  BIGINT REFERENCES bot_entities(id) ON DELETE CASCADE,
  name_ar            TEXT NOT NULL,
  description_ar     TEXT,
  start_date         DATE,
  end_date           DATE,
  status             TEXT NOT NULL DEFAULT 'not_started'
                       CHECK (status IN ('not_started','in_progress','completed','blocked')),
  progress           INT  DEFAULT 0
                       CHECK (progress >= 0 AND progress <= 100),
  sort_order         INT  DEFAULT 0,
  created_at         TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at         TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_wb_phases_project ON wb_project_phases(project_entity_id);

-- ─── 8. Audit Log (سجل التغييرات) ────────────────────────────────
-- Workbench-specific audit (separate from task_activity which is for ClickUp tasks).

CREATE TABLE wb_audit_log (
  id           BIGSERIAL PRIMARY KEY,
  action       TEXT NOT NULL,             -- e.g. 'concept_portfolio_change'
  entity_type  TEXT,                       -- 'concept' | 'formation' | 'phase' | ...
  entity_id    TEXT,
  before_data  JSONB,
  after_data   JSONB,
  actor        TEXT,
  summary_ar   TEXT,                       -- human-readable summary for the activity feed
  created_at   TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_wb_audit_created ON wb_audit_log(created_at DESC);

-- ─── 9. Baselines (نقاط Baseline) ────────────────────────────────
-- JSONB snapshot of the entire workbench state at a point in time.

CREATE TABLE wb_baselines (
  id             TEXT PRIMARY KEY,
  name           TEXT,
  description    TEXT,
  snapshot_data  JSONB NOT NULL,
  created_by     TEXT,
  created_at     TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ─── 10. Extensions to bot_entities ──────────────────────────────
-- Pure additive — does not break existing queries.

ALTER TABLE bot_entities
  ADD COLUMN portfolio_id TEXT REFERENCES wb_portfolios(id),
  ADD COLUMN formation_id TEXT REFERENCES wb_formations(id),
  ADD COLUMN sort_order   INT  DEFAULT 0;

CREATE INDEX idx_bot_entities_portfolio ON bot_entities(portfolio_id);
CREATE INDEX idx_bot_entities_formation ON bot_entities(formation_id);

-- ─── 11. Row-Level Security ───────────────────────────────────────
-- Permissive policies for now (anon role has full access).
-- Tighten later when auth is wired.

ALTER TABLE wb_portfolios          ENABLE ROW LEVEL SECURITY;
ALTER TABLE wb_individuals         ENABLE ROW LEVEL SECURITY;
ALTER TABLE wb_entities            ENABLE ROW LEVEL SECURITY;
ALTER TABLE wb_formations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE wb_formation_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE wb_formation_entities  ENABLE ROW LEVEL SECURITY;
ALTER TABLE wb_project_phases      ENABLE ROW LEVEL SECURITY;
ALTER TABLE wb_audit_log           ENABLE ROW LEVEL SECURITY;
ALTER TABLE wb_baselines           ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wb_portfolios_all"         ON wb_portfolios         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "wb_individuals_all"        ON wb_individuals        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "wb_entities_all"           ON wb_entities           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "wb_formations_all"         ON wb_formations         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "wb_formation_members_all"  ON wb_formation_members  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "wb_formation_entities_all" ON wb_formation_entities FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "wb_project_phases_all"     ON wb_project_phases     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "wb_audit_log_all"          ON wb_audit_log          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "wb_baselines_all"          ON wb_baselines          FOR ALL USING (true) WITH CHECK (true);

-- ─── 12. Auto-update updated_at ──────────────────────────────────

CREATE OR REPLACE FUNCTION wb_set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER wb_portfolios_uat      BEFORE UPDATE ON wb_portfolios      FOR EACH ROW EXECUTE FUNCTION wb_set_updated_at();
CREATE TRIGGER wb_individuals_uat     BEFORE UPDATE ON wb_individuals     FOR EACH ROW EXECUTE FUNCTION wb_set_updated_at();
CREATE TRIGGER wb_entities_uat        BEFORE UPDATE ON wb_entities        FOR EACH ROW EXECUTE FUNCTION wb_set_updated_at();
CREATE TRIGGER wb_formations_uat      BEFORE UPDATE ON wb_formations      FOR EACH ROW EXECUTE FUNCTION wb_set_updated_at();
CREATE TRIGGER wb_project_phases_uat  BEFORE UPDATE ON wb_project_phases  FOR EACH ROW EXECUTE FUNCTION wb_set_updated_at();
