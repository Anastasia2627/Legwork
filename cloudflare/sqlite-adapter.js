/**
 * Adapter for SQLite-backed Durable Object storage.
 *
 * LEGWORK's existing repository uses better-sqlite3's synchronous query API.
 * Durable Object SqlStorage is also synchronous, unlike D1, so the existing
 * business rules and transactions can be retained without converting every
 * route to asynchronous D1 queries.
 *
 * This is NOT a general-purpose better-sqlite3 replacement.
 */
export function createDurableSqlite(storage) {
  if (!storage?.sql?.exec || !storage?.transactionSync) {
    throw new TypeError('SQLite-backed Durable Object storage is required');
  }
  const sql = storage.sql;
  const bind = (args) => args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
  const query = (statement, args) => sql.exec(statement, ...bind(args));
  const isRead = (statement) => /^(?:SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(statement.trim());

  return {
    prepare(statement) {
      if (typeof statement !== 'string' || !statement.trim()) throw new TypeError('SQL statement required');
      return {
        get(...args) {
          const row = query(statement, args).next();
          return row.done ? undefined : row.value;
        },
        all(...args) {
          return query(statement, args).toArray();
        },
        run(...args) {
          if (isRead(statement)) throw new Error('run() requires a write statement');
          query(statement, args).toArray();
          // Obtain changes/insert id immediately, in the same synchronous turn.
          const info = sql.exec('SELECT changes() AS changes, last_insert_rowid() AS id').one();
          return { changes: Number(info.changes || 0), lastInsertRowid: Number(info.id || 0) };
        },
      };
    },
    exec(statements) {
      // SqlStorage.exec supports multiple semicolon-separated statements.
      sql.exec(statements).toArray();
      return this;
    },
    pragma(expression) {
      const pragma = String(expression).trim();
      // These are storage-engine concerns handled by Durable Objects.
      if (/^(?:journal_mode=WAL|wal_checkpoint\(TRUNCATE\)|foreign_keys=ON)$/i.test(pragma)) return [];
      // Never allow caller-controlled arbitrary pragma execution.
      if (!/^table_info\([a-z_][a-z0-9_]*\)$/i.test(pragma)) {
        throw new Error('Unsupported Durable Object pragma: ' + pragma);
      }
      return sql.exec('PRAGMA ' + pragma).toArray();
    },
    transaction(fn) {
      if (typeof fn !== 'function') throw new TypeError('Transaction callback required');
      return (...args) => storage.transactionSync(() => fn(...args));
    },
    close() { /* Durable Object storage is managed by Cloudflare. */ },
  };
}
