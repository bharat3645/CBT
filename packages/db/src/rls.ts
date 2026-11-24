/**
 * Row-level security + audit plumbing, applied as idempotent SQL after every drizzle migration
 * (`applySecurity(db)`), so tables added later by any module are covered automatically.
 *
 * Model
 *  - The API connects as the owner/superuser (migrations, Better Auth, system jobs).
 *  - Per request it opens a transaction, sets app.* settings and runs `SET LOCAL ROLE cbt_app`
 *    (a NOLOGIN, NOBYPASSRLS role). Every statement in that transaction is subject to RLS.
 *  - Policy for any table with an `institute_id` column: institute_id = app.institute_id, or app.is_super.
 *    Tables whose institute_id is nullable (global templates) also allow SELECT of NULL rows.
 *    text-typed institute_id columns (some modules) are compared as text.
 *  - audit_log is insert-only (trigger + no UPDATE/DELETE grants); rows come from row triggers
 *    attached with app_attach_audit() and from app_audit_event().
 */
import { sql } from "drizzle-orm";
import type { Db } from "./client";

/** Tables that get the generic row-change audit trigger. Append here (names only; missing tables are skipped). */
export const AUDITED_TABLES: string[] = [
  "institutes",
  "memberships",
  "students",
  "teachers",
  "guardians",
  "guardian_student_links",
  "batches",
  "enrolments",
  "batch_teachers",
  // other modules: add e.g. "papers", "answer_keys", "results", "tests"
];

const STATEMENTS: string[] = [
  // --- roles -------------------------------------------------------------
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cbt_app') THEN
       CREATE ROLE cbt_app NOLOGIN NOBYPASSRLS;
     END IF;
   END $$`,
  `GRANT USAGE ON SCHEMA public TO cbt_app`,

  // --- request context accessors ------------------------------------------
  `CREATE OR REPLACE FUNCTION app_institute_id() RETURNS uuid LANGUAGE sql STABLE AS
   $$ SELECT NULLIF(current_setting('app.institute_id', true), '')::uuid $$`,
  `CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid LANGUAGE sql STABLE AS
   $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$`,
  `CREATE OR REPLACE FUNCTION app_role() RETURNS text LANGUAGE sql STABLE AS
   $$ SELECT NULLIF(current_setting('app.role', true), '') $$`,
  `CREATE OR REPLACE FUNCTION app_is_super() RETURNS boolean LANGUAGE sql STABLE AS
   $$ SELECT COALESCE(current_setting('app.is_super', true), 'off') = 'on' $$`,

  // --- generic tenant policies --------------------------------------------
  `CREATE OR REPLACE FUNCTION app_apply_tenant_rls() RETURNS void LANGUAGE plpgsql AS $$
   DECLARE r record; pred text;
   BEGIN
     FOR r IN
       SELECT c.table_name, c.data_type, c.is_nullable
       FROM information_schema.columns c
       JOIN information_schema.tables t
         ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
       WHERE c.table_schema = 'public' AND c.column_name = 'institute_id'
         AND c.table_name NOT IN ('audit_log')
     LOOP
       IF r.data_type = 'uuid' THEN
         pred := 'institute_id = app_institute_id()';
       ELSE
         pred := 'institute_id = app_institute_id()::text';
       END IF;
       EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.table_name);
       EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', r.table_name);
       EXECUTE format('DROP POLICY IF EXISTS tenant_read_global ON public.%I', r.table_name);
       EXECUTE format(
         'CREATE POLICY tenant_isolation ON public.%I FOR ALL USING (app_is_super() OR %s) WITH CHECK (app_is_super() OR %s)',
         r.table_name, pred, pred);
       IF r.is_nullable = 'YES' THEN
         EXECUTE format('CREATE POLICY tenant_read_global ON public.%I FOR SELECT USING (institute_id IS NULL)', r.table_name);
       END IF;
     END LOOP;
   END $$`,

  // --- grants -------------------------------------------------------------
  `CREATE OR REPLACE FUNCTION app_apply_grants() RETURNS void LANGUAGE plpgsql AS $$
   BEGIN
     GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cbt_app;
     GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cbt_app;
     -- credentials and sessions are never reachable from tenant code
     REVOKE ALL ON public.sessions, public.accounts, public.verifications FROM cbt_app;
     -- tenant code can read people but never write global identities
     REVOKE ALL ON public.users FROM cbt_app;
     GRANT SELECT (id, name, email, phone, status, image, created_at) ON public.users TO cbt_app;
     -- audit is insert-only
     REVOKE ALL ON public.audit_log FROM cbt_app;
     GRANT SELECT ON public.audit_log TO cbt_app;
   END $$`,

  // --- institutes / users / audit_log specific policies --------------------
  `CREATE OR REPLACE FUNCTION app_apply_core_rls() RETURNS void LANGUAGE plpgsql AS $$
   BEGIN
     ALTER TABLE public.institutes ENABLE ROW LEVEL SECURITY;
     DROP POLICY IF EXISTS tenant_isolation ON public.institutes;
     CREATE POLICY tenant_isolation ON public.institutes FOR ALL
       USING (app_is_super() OR id = app_institute_id())
       WITH CHECK (app_is_super() OR id = app_institute_id());

     ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
     DROP POLICY IF EXISTS tenant_visible ON public.users;
     CREATE POLICY tenant_visible ON public.users FOR SELECT USING (
       app_is_super() OR id = app_user_id()
       OR EXISTS (SELECT 1 FROM public.memberships m WHERE m.user_id = users.id AND m.institute_id = app_institute_id()));

     ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
     DROP POLICY IF EXISTS tenant_read ON public.audit_log;
     CREATE POLICY tenant_read ON public.audit_log FOR SELECT
       USING (app_is_super() OR (institute_id IS NOT NULL AND institute_id = app_institute_id()));
   END $$`,

  // --- audit --------------------------------------------------------------
  `CREATE OR REPLACE FUNCTION app_audit_row() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
   DECLARE rec jsonb; inst uuid;
   BEGIN
     IF TG_OP = 'UPDATE' AND to_jsonb(OLD) = to_jsonb(NEW) THEN RETURN NULL; END IF;
     IF TG_OP = 'DELETE' THEN rec := to_jsonb(OLD); ELSE rec := to_jsonb(NEW); END IF;
     IF TG_TABLE_NAME = 'institutes' THEN inst := (rec->>'id')::uuid;
     ELSE inst := NULLIF(rec->>'institute_id', '')::uuid; END IF;
     INSERT INTO audit_log (institute_id, actor_id, actor_role, action, entity, entity_id, before, after)
     VALUES (inst, app_user_id(), app_role(), lower(TG_OP), TG_TABLE_NAME, rec->>'id',
             CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
             CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END);
     RETURN NULL;
   END $$`,
  `CREATE OR REPLACE FUNCTION app_audit_event(p_action text, p_entity text, p_entity_id text, p_meta jsonb DEFAULT NULL)
   RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS
   $$ INSERT INTO audit_log (institute_id, actor_id, actor_role, action, entity, entity_id, meta)
      VALUES (app_institute_id(), app_user_id(), app_role(), p_action, p_entity, p_entity_id, p_meta) $$`,
  `CREATE OR REPLACE FUNCTION app_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN RAISE EXCEPTION 'audit_log is insert-only'; END $$`,
  `CREATE OR REPLACE FUNCTION app_attach_audit(tbl text) RETURNS void LANGUAGE plpgsql AS $$
   BEGIN
     IF to_regclass('public.' || quote_ident(tbl)) IS NULL THEN RETURN; END IF;
     EXECUTE format('DROP TRIGGER IF EXISTS app_audit ON public.%I', tbl);
     EXECUTE format('CREATE TRIGGER app_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION app_audit_row()', tbl);
   END $$`,
  `DROP TRIGGER IF EXISTS app_audit_no_change ON public.audit_log`,
  `CREATE TRIGGER app_audit_no_change BEFORE UPDATE OR DELETE ON public.audit_log
     FOR EACH ROW EXECUTE FUNCTION app_audit_immutable()`,
  `DROP TRIGGER IF EXISTS app_audit_no_truncate ON public.audit_log`,
  `CREATE TRIGGER app_audit_no_truncate BEFORE TRUNCATE ON public.audit_log
     FOR EACH STATEMENT EXECUTE FUNCTION app_audit_immutable()`,
];

/** Idempotent. Run after every `migrate()`. */
export async function applySecurity(db: Db, audited: string[] = AUDITED_TABLES): Promise<void> {
  for (const stmt of STATEMENTS) await db.execute(sql.raw(stmt));
  await db.execute(sql`SELECT app_apply_tenant_rls()`);
  await db.execute(sql`SELECT app_apply_core_rls()`);
  for (const t of audited) await db.execute(sql`SELECT app_attach_audit(${t})`);
  await db.execute(sql`SELECT app_apply_grants()`);
}

/** Tables with an institute_id column that lack RLS or a policy. Used by the CI harness; must be empty. */
export async function findUnprotectedTenantTables(db: Db): Promise<string[]> {
  const res: any = await db.execute(sql`
    SELECT c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'institute_id' AND NOT a.attisdropped
    WHERE c.relkind = 'r'
      AND (NOT c.relrowsecurity OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid))
    ORDER BY 1`);
  const rows = res.rows ?? res;
  return rows.map((r: any) => r.name);
}
