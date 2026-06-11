/**
 * clickup-adapter.js  (STUB)
 *
 * Future bidirectional sync with ClickUp.
 *
 * Architecture plan:
 *   - Communicates via a Cloudflare Worker proxy (to avoid CORS + hide token)
 *   - Maps workbench entities to ClickUp objects:
 *
 *   Workbench entity   ↔  ClickUp object
 *   -----------------------------------------
 *   concept            ↔  Folder (top-level)
 *   product            ↔  Folder
 *   initiative/project ↔  List
 *   project_phase      ↔  Task (with status mapping)
 *   audit_log entry    ↔  Task activity event
 *
 * Status mapping (workbench → ClickUp custom status):
 *   not_started  → "غير مبدوء"     (gray)
 *   in_progress  → "قيد التنفيذ"   (yellow)
 *   completed    → "مكتمل"         (green)
 *   blocked      → "متعثر"         (red)
 *
 * Implementation phases:
 *   1. Read-only sync: pull ClickUp lists into bot_entities (already partly done via pm_lists_config)
 *   2. Phase sync: import/export project phases as ClickUp tasks
 *   3. Real-time webhook: ClickUp → Cloudflare Worker → Supabase write
 *
 * Until wired, methods return null/false and log a warning.
 */

import { DataAdapter } from './adapter.js';
import { CLICKUP } from '../../config.js';

export class ClickUpAdapter extends DataAdapter {

  async init() {
    if (!CLICKUP.proxy_url) {
      console.info('[ClickUpAdapter] not configured yet — proxy_url is empty');
      return false;
    }
    return true;
  }

  async loadAll() {
    console.warn('[ClickUpAdapter] loadAll() not implemented yet');
    return null;
  }

  async create() { console.warn('[ClickUpAdapter] create() stub'); return null; }
  async update() { console.warn('[ClickUpAdapter] update() stub'); return null; }
  async remove() { console.warn('[ClickUpAdapter] remove() stub'); return false; }

  /* Planned method: pulls ClickUp tasks for a list and maps to project phases */
  async syncPhasesFromList(_listId) {
    console.warn('[ClickUpAdapter] syncPhasesFromList() stub');
    return [];
  }

  /* Planned method: pushes a phase update to ClickUp */
  async pushPhaseToClickUp(_phaseId) {
    console.warn('[ClickUpAdapter] pushPhaseToClickUp() stub');
    return false;
  }
}
