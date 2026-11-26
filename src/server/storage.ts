import { AsyncLocalStorage } from 'node:async_hooks';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import { Pool, type PoolClient } from '@neondatabase/serverless';

type TransactionContext = { client?: PoolClient; sqlite: boolean };

const connectionString =
  process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.POSTGRES_URL || '';
const pool = connectionString ? new Pool({ connectionString, max: 4 }) : null;
const sqlite = pool ? null : new Database(':memory:');
const txContext = new AsyncLocalStorage<TransactionContext>();
let localQueue: Promise<void> = Promise.resolve();

if (sqlite) {
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
}

export const hasDurableStorage = Boolean(pool);

function toPostgresSql(sql: string) {
  let parameterIndex = 0;
  return sql.replace(/\?/g, () => `$${++parameterIndex}`);
}

async function withLocalLock<T>(callback: () => T | Promise<T>): Promise<T> {
  const previous = localQueue;
  let release!: () => void;
  localQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await callback();
  } finally {
    release();
  }
}

async function runSql<T>(sql: string, params: unknown[], operation: 'get' | 'all' | 'run') {
  if (pool) {
    const context = txContext.getStore();
    const executor = context?.client || pool;
    const result = await executor.query(toPostgresSql(sql), params);
    if (operation === 'get') return result.rows[0] as T | undefined;
    if (operation === 'all') return result.rows as T[];
    return { changes: result.rowCount || 0 } as T;
  }

  const execute = () => {
    const statement = sqlite!.prepare(sql);
    if (operation === 'get') return statement.get(...params) as T | undefined;
    if (operation === 'all') return statement.all(...params) as T[];
    const result = statement.run(...params);
    return { changes: result.changes, lastInsertRowid: result.lastInsertRowid } as T;
  };
  if (txContext.getStore()?.sqlite) return execute();
  return withLocalLock(execute);
}

async function withTransaction<T>(callback: () => T | Promise<T>): Promise<T> {
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await txContext.run({ client, sqlite: false }, callback);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  return withLocalLock(async () => {
    sqlite!.exec('BEGIN IMMEDIATE');
    try {
      const result = await txContext.run({ sqlite: true }, callback);
      sqlite!.exec('COMMIT');
      return result;
    } catch (error) {
      sqlite!.exec('ROLLBACK');
      throw error;
    }
  });
}

export const db = {
  prepare(sql: string) {
    return {
      get: (...params: unknown[]) => runSql(sql, params, 'get'),
      all: (...params: unknown[]) => runSql(sql, params, 'all'),
      run: (...params: unknown[]) => runSql(sql, params, 'run'),
    };
  },
  transaction<TArgs extends unknown[], TResult>(callback: (...args: TArgs) => TResult | Promise<TResult>) {
    return (...args: TArgs) => withTransaction(() => callback(...args));
  },
  exec(sql: string) {
    if (pool) return pool.query(sql);
    sqlite!.exec(sql);
  },
  pragma(statement: string) {
    if (sqlite) sqlite.pragma(statement);
  },
};

export async function initializeStorage(sqliteSchema: string) {
  const schemaPath = path.resolve(process.cwd(), 'migrations/001_arena_and_game_ads.sql');
  const schema = await readFile(schemaPath, 'utf8');
  if (pool) {
    await pool.query(schema);
    return;
  }
  sqlite!.exec(sqliteSchema);
  sqlite!.exec(schema.replace(/BIGSERIAL PRIMARY KEY/g, 'INTEGER PRIMARY KEY AUTOINCREMENT'));
}

export async function tryAcquireDatabaseLock(lockId: number) {
  if (!pool) return false;
  const client = await pool.connect();
  const result = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [lockId]);
  if (result.rows[0]?.acquired !== true) {
    client.release();
    return false;
  }
  return {
    ping: async () => { await client.query('SELECT 1'); },
    release: async () => {
      await client.query('SELECT pg_advisory_unlock($1)', [lockId]).catch(() => undefined);
      client.release();
    },
  };
}

export async function tryAcquireArenaWorkerLock() {
  return tryAcquireDatabaseLock(807245181);
}

export async function tryAcquireRevenueReconciliationLock() {
  return tryAcquireDatabaseLock(807245182);
}

export async function tryAcquirePublisherPayoutLock() {
  return tryAcquireDatabaseLock(807245183);
}

export async function closeStorage() {
  await pool?.end();
  sqlite?.close();
}
