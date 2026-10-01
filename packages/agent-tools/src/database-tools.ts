import { softFail } from './util';
import { isAdminRole, type ToolDef } from './types';

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_ROWS = 500;
const SECRET_COLUMN = /passw|secret|token|api[-_]?key|apikey|credential|private/i;
const WRITE_KEYWORDS = /\b(insert|update|delete|merge|drop|alter|truncate|create|grant|revoke|copy|call|execute|vacuum|reindex|cluster)\b/i;
const DANGEROUS_CALLS = /\b(pg_sleep|pg_read_file|pg_read_binary_file|pg_ls_dir|dblink|lo_import|lo_export|pg_terminate_backend|pg_cancel_backend)\s*\(/i;

function assertAdmin(ctx: any) {
  if (!isAdminRole(ctx?.user?.role)) {
    const error: any = new Error('403 Forbidden: database tools are restricted to administrators');
    error.statusCode = 403;
    throw error;
  }
}

const str = (value: unknown): string => String(value ?? '').trim();

function prepareReadOnly(raw: unknown): string {
  let sql = String(raw ?? '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[ \t]*--.*$/gm, ' ')
    .trim();
  if (!sql) throw new Error('sql is required');
  if (sql.endsWith(';')) sql = sql.slice(0, -1).trim();
  if (sql.includes(';')) throw new Error('Only a single SQL statement is allowed');
  const first = (sql.match(/^[A-Za-z]+/)?.[0] ?? '').toUpperCase();
  if (first !== 'SELECT' && first !== 'WITH') throw new Error('Only SELECT (or WITH … SELECT) statements are allowed');
  if (WRITE_KEYWORDS.test(sql)) throw new Error('Write/ddl keywords are not allowed in this read-only tool');
  if (DANGEROUS_CALLS.test(sql)) throw new Error('This SQL function is blocked');
  return sql;
}

function assertIdent(value: string, what: string): string {
  if (!IDENT.test(value)) throw new Error(`Invalid ${what} "${String(value).slice(0, 60)}" — identifiers must match [A-Za-z_][A-Za-z0-9_]*`);
  return value;
}

function redactRows(rows: any[]): any[] {
  if (!Array.isArray(rows)) return rows;
  return rows.map((row) => {
    if (!row || typeof row !== 'object') return row;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) out[key] = SECRET_COLUMN.test(key) ? '[REDACTED]' : value;
    return out;
  });
}

export function buildDatabaseTools(prisma: any): Record<string, ToolDef> {
  async function auditTool(ctx: any, action: string, metadata: Record<string, unknown>) {
    try {
      await prisma.auditLog.create({
        data: {
          organizationId: ctx.user.organizationId,
          userId: ctx.user.id,
          action,
          resource: 'tool',
          resourceId: 'database',
          metadata: { runId: ctx.runId, ...metadata } as any,
        },
      });
    } catch {}
  }

  async function tableColumns(table: string): Promise<Set<string>> {
    const rows: Array<{ column_name: string }> = await prisma.$queryRaw`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${table}`;
    if (!rows.length) throw new Error(`Table "${table}" does not exist in the public schema`);
    return new Set(rows.map((row) => row.column_name));
  }

  return {
    database_schema: {
      name: 'database_schema',
      description:
        'Inspect the database schema (tables, columns, types, primary keys and approximate row counts). Input: { table?: string (limit to one table) }. Admin only — returns 403 for non-admins.',
      category: 'Database',
      scope: 'database:read',
      requiresApproval: false,
      adminOnly: true,
      execute: async (input: Record<string, unknown>, ctx: any) => {
        assertAdmin(ctx);
        return softFail(async () => {
          const filter = str(input.table);
          const columns: Array<{ table_name: string; column_name: string; data_type: string; is_nullable: string; column_default: string | null }> = await prisma.$queryRaw`
            SELECT table_name, column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = 'public'
            ORDER BY table_name, ordinal_position`;
          const pks: Array<{ table_name: string; column_name: string }> = await prisma.$queryRaw`
            SELECT tc.table_name, kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
            WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'`;
          const counts: Array<{ relname: string; n_live_tup: number }> = await prisma.$queryRaw`
            SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 200`;
          const countsByTable = new Map(counts.map((row) => [row.relname, Number(row.n_live_tup ?? 0)]));
          const pkByTable = new Map<string, string[]>();
          for (const row of pks) pkByTable.set(row.table_name, [...(pkByTable.get(row.table_name) ?? []), row.column_name]);
          const grouped = new Map<string, Array<Record<string, unknown>>>();
          for (const column of columns) {
            if (filter && column.table_name !== filter) continue;
            const list = grouped.get(column.table_name) ?? [];
            list.push({
              name: column.column_name,
              type: column.data_type,
              nullable: column.is_nullable === 'YES',
              default: column.column_default,
              primaryKey: (pkByTable.get(column.table_name) ?? []).includes(column.column_name),
            });
            grouped.set(column.table_name, list);
          }
          if (filter && !grouped.size) throw new Error(`Table "${filter}" does not exist in the public schema`);
          const tables = [...grouped.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([name, cols]) => ({ table: name, columns: cols, approximateRows: countsByTable.get(name) ?? null }));
          await auditTool(ctx, 'tool.database.schema', { table: filter || null, tables: tables.length });
          return { tables, tableCount: tables.length, filteredBy: filter || null };
        });
      },
    },

    database_query: {
      name: 'database_query',
      description:
        'Run a read-only SQL query (single SELECT statement) against the workspace database and return rows with secret columns redacted. Input: { sql: string, limit?: number (1-500, default 100) }. Admin only — returns 403 for non-admins.',
      category: 'Database',
      scope: 'database:read',
      requiresApproval: false,
      adminOnly: true,
      execute: async (input: Record<string, unknown>, ctx: any) => {
        assertAdmin(ctx);
        return softFail(async () => {
          const sql = prepareReadOnly(input.sql ?? input.query);
          const limit = Math.min(Math.max(Number(input.limit ?? 100) || 100, 1), MAX_ROWS);
          const rows: any[] = await prisma.$queryRawUnsafe(sql);
          const capped = rows.slice(0, limit);
          await auditTool(ctx, 'tool.database.query', { rows: rows.length, preview: sql.slice(0, 200) });
          return {
            rows: redactRows(capped),
            rowCount: capped.length,
            totalRows: rows.length,
            truncated: rows.length > limit,
            sql,
          };
        });
      },
    },

    database_explain: {
      name: 'database_explain',
      description:
        'Return the PostgreSQL query plan for a SELECT statement. Input: { sql: string, analyze?: boolean (default false — set true to run the query and report actual timing), format?: "text" | "json" (default json) }. Admin only — returns 403 for non-admins.',
      category: 'Database',
      scope: 'database:read',
      requiresApproval: false,
      adminOnly: true,
      execute: async (input: Record<string, unknown>, ctx: any) => {
        assertAdmin(ctx);
        return softFail(async () => {
          const sql = prepareReadOnly(input.sql ?? input.query);
          const analyze = input.analyze === true || input.analyze === 'true';
          const format = String(input.format ?? 'json').toLowerCase() === 'text' ? 'text' : 'json';
          const options = [analyze ? 'ANALYZE' : null, `FORMAT ${format.toUpperCase()}`].filter(Boolean).join(', ');
          const rows: any[] = await prisma.$queryRawUnsafe(`EXPLAIN (${options}) ${sql}`);
          const plan = rows.map((row) => row['QUERY PLAN'] ?? row);
          await auditTool(ctx, 'tool.database.explain', { analyze, preview: sql.slice(0, 200) });
          return { plan, analyze, format, sql };
        });
      },
    },

    database_insert: {
      name: 'database_insert',
      description:
        'Insert a row into a database table with parameterized values (admin only, requires human approval). Input: { table: string, values: object }. organizationId is forced to your workspace when the column exists. Returns 403 for non-admins.',
      category: 'Database',
      scope: 'database:write',
      requiresApproval: true,
      adminOnly: true,
      execute: async (input: Record<string, unknown>, ctx: any) => {
        assertAdmin(ctx);
        return softFail(async () => {
          const table = assertIdent(str(input.table), 'table name');
          const values = input.values && typeof input.values === 'object' && !Array.isArray(input.values) ? { ...(input.values as Record<string, unknown>) } : null;
          if (!values || !Object.keys(values).length) throw new Error('values must be a non-empty object');
          const columns = await tableColumns(table);
          for (const key of Object.keys(values)) assertIdent(key, 'column name');
          const missing = Object.keys(values).filter((key) => !columns.has(key));
          if (missing.length) throw new Error(`Unknown column(s) on "${table}": ${missing.join(', ')}`);
          if (columns.has('organizationId')) values.organizationId = ctx.user.organizationId;
          const ordered = Object.entries(values);
          const columnSql = ordered.map(([key]) => `"${key}"`).join(', ');
          const placeholders = ordered.map((_, index) => `$${index + 1}`).join(', ');
          const sql = `INSERT INTO "${table}" (${columnSql}) VALUES (${placeholders}) RETURNING *`;
          const rows: any[] = await prisma.$queryRawUnsafe(sql, ...ordered.map(([, value]) => value));
          await auditTool(ctx, 'tool.database.insert', { table, rows: rows.length });
          return { table, inserted: rows.length, rows: redactRows(rows.slice(0, 20)) };
        });
      },
    },

    database_update: {
      name: 'database_update',
      description:
        'Update rows in a database table with parameterized values and an equality WHERE filter (admin only, requires human approval). Input: { table: string, values: object, where: object (at least one equality condition) }. organizationId is forced to your workspace when the column exists. Returns 403 for non-admins.',
      category: 'Database',
      scope: 'database:write',
      requiresApproval: true,
      adminOnly: true,
      execute: async (input: Record<string, unknown>, ctx: any) => {
        assertAdmin(ctx);
        return softFail(async () => {
          const table = assertIdent(str(input.table), 'table name');
          const values = input.values && typeof input.values === 'object' && !Array.isArray(input.values) ? { ...(input.values as Record<string, unknown>) } : null;
          const where = input.where && typeof input.where === 'object' && !Array.isArray(input.where) ? { ...(input.where as Record<string, unknown>) } : null;
          if (!values || !Object.keys(values).length) throw new Error('values must be a non-empty object');
          if (!where || !Object.keys(where).length) throw new Error('where must be a non-empty object of equality conditions');
          const columns = await tableColumns(table);
          for (const key of [...Object.keys(values), ...Object.keys(where)]) assertIdent(key, 'column name');
          const unknown = [...new Set([...Object.keys(values), ...Object.keys(where)])].filter((key) => !columns.has(key));
          if (unknown.length) throw new Error(`Unknown column(s) on "${table}": ${unknown.join(', ')}`);
          if (columns.has('organizationId')) {
            values.organizationId = ctx.user.organizationId;
            where.organizationId = ctx.user.organizationId;
          }
          const params: unknown[] = [];
          const setEntries = Object.entries(values);
          const whereEntries = Object.entries(where);
          const setSql = setEntries.map(([key, value]) => { params.push(value); return `"${key}" = $${params.length}`; }).join(', ');
          const whereSql = whereEntries.map(([key, value]) => { params.push(value); return `"${key}" = $${params.length}`; }).join(' AND ');
          const sql = `UPDATE "${table}" SET ${setSql} WHERE ${whereSql} RETURNING *`;
          const rows: any[] = await prisma.$queryRawUnsafe(sql, ...params);
          await auditTool(ctx, 'tool.database.update', { table, rows: rows.length });
          return { table, updated: rows.length, rows: redactRows(rows.slice(0, 20)) };
        });
      },
    },
  };
}
