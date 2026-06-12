-- ═══════════════════════════════════════════════════════════════
-- منظومة Strategic Workbench · Canonical Schema v2
-- Database: Supabase (Manzuma Dashboard project)
-- Applied via migration: decouple_workbench_native_tables_and_seed
-- Date: 2026-06-11
--
-- ARCHITECTURE: DECOUPLED FROM CLICKUP
--   ┌─ ClickUp layer (untouched): bot_entities, pm_snapshots,
--   │  pm_lists_config, task_activity, maturity_history, bot_* …
--   └─ Workbench layer (native CRUD): wb_concepts, wb_items,
--      wb_formations, wb_individuals, wb_entities, wb_project_phases,
--      wb_portfolios, wb_audit_log, wb_baselines
--
--   Future manual linking: linked_bot_entity_id (nullable FK) on
--   wb_concepts and wb_items → bot_entities. A picker UI (phase 2)
--   will let the user connect a workbench item to a ClickUp list.
-- ═══════════════════════════════════════════════════════════════

-- ─── Concepts (المفاهيم) — full CRUD from the UI ─────────────────
CREATE TABLE wb_concepts (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name          TEXT NOT NULL,
  description   TEXT,
  portfolio_id  TEXT REFERENCES wb_portfolios(id) ON DELETE SET NULL,
  linked_bot_entity_id BIGINT REFERENCES bot_entities(id) ON DELETE SET NULL,
  sort_order    INT DEFAULT 0,
  is_active     BOOLEAN DEFAULT true NOT NULL,   -- soft delete
  created_at    TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX idx_wb_concepts_portfolio ON wb_concepts(portfolio_id);

-- ─── Formations (التشكيلات) ──────────────────────────────────────
CREATE TABLE wb_formations (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  concept_id  TEXT REFERENCES wb_concepts(id) ON DELETE CASCADE,
  name_ar     TEXT NOT NULL,
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX idx_wb_formations_concept ON wb_formations(concept_id);

CREATE TABLE wb_formation_members (
  formation_id   TEXT REFERENCES wb_formations(id) ON DELETE CASCADE,
  individual_id  TEXT REFERENCES wb_individuals(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (formation_id, individual_id)
);
CREATE TABLE wb_formation_entities (
  formation_id  TEXT REFERENCES wb_formations(id) ON DELETE CASCADE,
  entity_id     TEXT REFERENCES wb_entities(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (formation_id, entity_id)
);

-- ─── Items (منتج · مبادرة · مشروع) — one table, typed ────────────
CREATE TABLE wb_items (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  parent_id       TEXT REFERENCES wb_concepts(id) ON DELETE CASCADE,    -- المفهوم
  parent_item_id  TEXT REFERENCES wb_items(id) ON DELETE SET NULL,      -- المنتج الأم (للمشاريع)
  formation_id    TEXT REFERENCES wb_formations(id) ON DELETE SET NULL, -- التشكيل المنتِج
  entity_type     TEXT NOT NULL CHECK (entity_type IN ('منتج','مبادرة','مشروع')),
  name            TEXT NOT NULL,
  description     TEXT,
  owner           TEXT,
  linked_bot_entity_id BIGINT REFERENCES bot_entities(id) ON DELETE SET NULL,
  sort_order      INT DEFAULT 0,
  is_active       BOOLEAN DEFAULT true NOT NULL,   -- soft delete
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX idx_wb_items_parent    ON wb_items(parent_id);
CREATE INDEX idx_wb_items_formation ON wb_items(formation_id);
CREATE INDEX idx_wb_items_type      ON wb_items(entity_type);

-- ─── Phases (المراحل) — Gantt data ───────────────────────────────
CREATE TABLE wb_project_phases (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  item_id         TEXT REFERENCES wb_items(id) ON DELETE CASCADE,
  name_ar         TEXT NOT NULL,
  description_ar  TEXT,
  start_date      DATE,
  end_date        DATE,
  status          TEXT NOT NULL DEFAULT 'not_started'
                    CHECK (status IN ('not_started','in_progress','completed','blocked')),
  progress        INT DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  sort_order      INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX idx_wb_phases_item ON wb_project_phases(item_id);

-- ─── Shared layer tables (created in v1, unchanged) ──────────────
-- wb_portfolios   : المحافظ الثلاث (التأسيس · النمو · 0/1)
-- wb_individuals  : الأفراد (CRUD من الواجهة)
-- wb_entities     : الكيانات المؤسسية (CRUD من الواجهة)
-- wb_audit_log    : سجل التغييرات
-- wb_baselines    : لقطات Baseline (JSONB)

-- ─── RLS (permissive during development — tighten before public) ─
-- Each wb_* table: ENABLE ROW LEVEL SECURITY + policy FOR ALL
--   USING (true) WITH CHECK (true)

-- ─── Seeded structure (مشاريع_منظومة_2026) ───────────────────────
-- 5 مفاهيم  : بناء الأهلية · نموذج الوعي · التوجه الإيجابي · MI · مختبر الابتكار
-- 6 أفراد   : علي · سرور · مشبب · د. ناصر عشوي · د. محمود شرف · باسل
-- 7 كيانات  : راز التطويرية · شركة علي غ.ر · شركة سرور · نبوغ · عطاءات العلم
--             · سفراء الهداية · مركز الابتكار
-- 6 تشكيلات : المدربون الثلاثة · علي وسرور · مشبب منفرداً · فريق نموذج الوعي
--             · فريق MI · باسل
-- 9 منتجات  : رواد الأيتام · رواد الشباب · رواد الموهوبين · رواد أبناء الذوات
--             · مجتهد · ملكة الباحث · قيّم · إدارة المشاريع للقادة · مختبر الحكمة
-- 19 عنصراً : 16 مشروعاً + 3 مبادرات (أيتام بقية الدول · جمعية الصناديق
--             · مختبر الابتكار الريادي)
-- 4 مراحل   : لمشروع «أيتام ألبانيا» (يناير—يونيو 2026)


-- ═══════════════════════════════════════════════════════════════
-- Phase 2 — ClickUp Bridge (migration: wb_clickup_bridge_rpc)
-- bot_entities / pm_snapshots stay RLS-locked. Two SECURITY DEFINER
-- functions expose the minimal READ-ONLY surface for the workbench:
--   wb_list_clickup_entities() → link-picker directory
--   wb_clickup_list_stats()    → per-list task stats (latest snapshot)
-- Granted: EXECUTE to anon, authenticated. No table grants.
-- The only workbench WRITE related to linking is to its own columns:
--   wb_concepts.linked_bot_entity_id / wb_items.linked_bot_entity_id
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.wb_list_clickup_entities()
RETURNS TABLE (id bigint, name text, entity_type text, source_list_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT be.id, be.name, be.entity_type, be.source_list_id
  FROM bot_entities be WHERE be.is_active = true
  ORDER BY be.entity_type, be.name;
$$;

CREATE OR REPLACE FUNCTION public.wb_clickup_list_stats()
RETURNS TABLE (list_id text, total int, open_n int, inprogress_n int,
               pending_n int, closed_n int, overdue_n int, snapshot_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH latest AS (
    SELECT data, saved_at FROM pm_snapshots ORDER BY saved_at DESC LIMIT 1
  ), tasks AS (
    SELECT t.task->>'listId' AS list_id, t.task->>'status' AS status,
           NULLIF(t.task->>'due','')::date AS due, l.saved_at
    FROM latest l, jsonb_each(l.data->'taskMap') AS t(task_id, task)
  )
  SELECT list_id, count(*)::int,
    count(*) FILTER (WHERE status = 'open')::int,
    count(*) FILTER (WHERE status = 'inprogress')::int,
    count(*) FILTER (WHERE status = 'pending')::int,
    count(*) FILTER (WHERE status = 'closed')::int,
    count(*) FILTER (WHERE status NOT IN ('closed','pending')
      AND due IS NOT NULL AND due < CURRENT_DATE)::int,
    max(saved_at)
  FROM tasks WHERE list_id IS NOT NULL GROUP BY list_id;
$$;

REVOKE ALL ON FUNCTION public.wb_list_clickup_entities() FROM public;
REVOKE ALL ON FUNCTION public.wb_clickup_list_stats() FROM public;
GRANT EXECUTE ON FUNCTION public.wb_list_clickup_entities() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wb_clickup_list_stats() TO anon, authenticated;


-- ═══════════════════════════════════════════════════════════════
-- v4.3 (migration: wb_v43_phase_deps_realtime)
-- 1) Phase dependencies: single predecessor per phase
-- 2) Realtime publication on the 9 workbench display tables
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE wb_project_phases
  ADD COLUMN IF NOT EXISTS depends_on_phase_id text
  REFERENCES wb_project_phases(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_wb_phases_depends
  ON wb_project_phases(depends_on_phase_id);
-- Realtime: wb_portfolios, wb_concepts, wb_items, wb_project_phases,
-- wb_formations, wb_formation_members, wb_formation_entities,
-- wb_individuals, wb_entities → added to publication supabase_realtime.


-- ═══════════════════════════════════════════════════════════════
-- v4.4 (migration: wb_v44_auth_rls) — المصادقة والأدوار
-- wb_user_roles(user_id, email, role∈{owner,editor,viewer,pending})
-- Trigger: أول مستخدم owner، البقية pending.
-- دوال: wb_current_role / wb_can_read / wb_can_write / wb_is_admin
-- RLS: anon محجوب كلياً؛ SELECT للأدوار الفعّالة؛ كتابة owner/editor؛
--      wb_audit_log إضافة-فقط. RPCs (owner): wb_list_users / wb_set_user_role.
-- ClickUp RPCs: EXECUTE للمصادَقين فقط (سُحبت من anon).
-- النص الكامل في تاريخ الترحيلات على Supabase.

-- v4.4.1 (migration: wb_v441_fix_signup):
-- حذف trigger قديم (wb_first_owner) كان يتعارض مع wb_on_auth_user_created،
-- واستبدال قيد الأدوار ليشمل: owner, editor, viewer, pending.

-- v4.5 (migration: wb_v45_item_portfolio_override):
-- wb_items.portfolio_override_id → wb_portfolios(id) ON DELETE SET NULL
-- المحفظة الفعلية للعنصر = override ?? محفظة المفهوم الأم.
