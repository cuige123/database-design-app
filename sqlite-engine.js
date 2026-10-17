(function () {
  const storageKey = 'querypad-sqlite-database';
  const databaseName = 'querypad-sqlite';
  const databaseVersion = 1;
  const databaseStore = 'snapshots';
  const defaultProjectId = 'default';

  function currentSeedVersion() {
    return Number(window.queryPadSeedVersion || 1) || 1;
  }

  function readSeedVersion() {
    return typeof window.queryPadReadSeedVersion === 'function' ? window.queryPadReadSeedVersion() : 0;
  }

  function writeSeedVersion() {
    if (typeof window.queryPadWriteSeedVersion === 'function') window.queryPadWriteSeedVersion();
  }

  function bytesToBase64(bytes) {
    return toBase64(bytes);
  }

  function base64ToBytes(value) {
    const binary = atob(String(value || ''));
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  }

  function openSnapshotStore() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB 不可用')); return; }
      const request = window.indexedDB.open(databaseName, databaseVersion);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(databaseStore)) request.result.createObjectStore(databaseStore);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB 打开失败'));
    });
  }

  function idbRequest(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB 操作失败'));
    });
  }

  function quoteIdentifier(identifier) {
    return `"${String(identifier).replace(/"/g, '""')}"`;
  }

  function schemaType(field) {
    const type = String(field?.type || 'TEXT').toUpperCase();
    if (!/^(?:INT|INTEGER|VARCHAR|CHAR|TEXT|DATE|DATETIME|DECIMAL|NUMERIC|REAL|FLOAT|DOUBLE|BLOB|BOOLEAN)$/.test(type)) throw new Error(`不支持的字段类型：${type}`);
    const length = String(field?.length || '').replace(/[^0-9,]/g, '');
    return `${type}${length && /VARCHAR|CHAR|DECIMAL|NUMERIC/.test(type) ? `(${length})` : ''}`;
  }

  function defaultSql(value) {
    if (value === undefined || value === null || String(value).trim() === '') return '';
    const text = String(value).trim();
    const scalar = /^(?:null|current_timestamp|current_date|current_time|true|false|[+-]?\d+(?:\.\d+)?)$/i;
    const quoted = /^(?:'(?:''|[^'])*'|"(?:""|[^"])*")$/;
    const parenthesizedScalar = /^\(\s*(?:null|current_timestamp|current_date|current_time|true|false|[+-]?\d+(?:\.\d+)?|'(?:''|[^'])*'|"(?:""|[^"])*")\s*\)$/i;
    if (scalar.test(text) || quoted.test(text) || parenthesizedScalar.test(text)) return ` DEFAULT ${text}`;
    return ` DEFAULT '${text.replace(/'/g, "''")}'`;
  }

  function inferType(rows, column) {
    const values = rows.map(row => row[column]).filter(value => value !== null && value !== undefined);
    if (!values.length) return 'TEXT';
    if (values.every(Number.isInteger)) return 'INTEGER';
    if (values.every(value => typeof value === 'number' && Number.isFinite(value))) return 'REAL';
    if (values.every(value => typeof value === 'string' && !Number.isNaN(Date.parse(value)))) return 'TEXT';
    return 'TEXT';
  }

  function toBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  }

  function splitStatements(sql) {
    const statements = [];
    let start = 0;
    let quote = '';
    let lineComment = false;
    let blockComment = false;
    for (let index = 0; index < sql.length; index += 1) {
      const character = sql[index];
      const next = sql[index + 1];
      if (lineComment) {
        if (character === '\n') lineComment = false;
      } else if (blockComment) {
        if (character === '*' && next === '/') {
          blockComment = false;
          index += 1;
        }
      } else if (quote) {
        if (character === quote && next === quote) index += 1;
        else if (character === quote && sql[index - 1] !== '\\') quote = '';
      } else if ((character === '-' && next === '-') || character === '#') {
        lineComment = true;
        if (character === '-') index += 1;
      } else if (character === '/' && next === '*') {
        blockComment = true;
        index += 1;
      } else if (character === "'" || character === '"' || character === '`') {
        quote = character;
      } else if (character === ';') {
        const part = sql.slice(start, index).trim();
        if (part) statements.push(part);
        start = index + 1;
      }
    }
    if (quote || blockComment) throw new Error('SQL 引号或注释未闭合');
    const tail = sql.slice(start).trim();
    if (tail) statements.push(tail);
    return statements;
  }

  function isReadOnly(statement) {
    if (/^(?:select|pragma|explain)\b/i.test(statement)) return true;
    return /^with\b/i.test(statement) && !/\b(?:insert|update|delete|replace)\b/i.test(statement);
  }

  class SQLiteEngine {
    constructor(SQL) {
      this.SQL = SQL;
      this.db = null;
      this.ready = false;
      this.restoreError = '';
      this.transactionDepth = 0;
      this.projectId = defaultProjectId;
      this.snapshotStore = null;
    }

    initialize(projectId) {
      this.projectId = String(projectId || defaultProjectId);
      const seedOutdated = this.projectId === defaultProjectId && readSeedVersion() < currentSeedVersion();
      const saved = window.localStorage && window.localStorage.getItem(`${storageKey}:${this.projectId}`) || (this.projectId === defaultProjectId && window.localStorage && window.localStorage.getItem(storageKey));
      let preserveCorruptSnapshot = false;
      if (saved) {
        try {
          const binary = atob(saved);
          const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
          this.db = new this.SQL.Database(bytes);
        } catch (error) {
          this.restoreError = `保存的 SQLite 数据库损坏，已在内存中打开练习样例；原快照暂时保留。${error.message}`;
          preserveCorruptSnapshot = true;
          console.error(this.restoreError, error);
        }
      }

      // 样例升级只替换未被改动过的初始样例；用户改动过的练习库保持原样
      this.seedUpgraded = false;
      if (seedOutdated && this.db) {
        if (this.isUntouchedLegacySample()) {
          this.db.close();
          this.db = null;
        } else if (this.isCurrentSample()) {
          // 数据已是当前样例（例如浏览器存储被部分清理），只需补写版本号
          writeSeedVersion();
        }
      }

      if (!this.db) {
        this.db = new this.SQL.Database();
        const legacy = window.queryPadLegacyEngine;
        const useNewSeed = seedOutdated || !legacy || !legacy.tables;
        this.seedUpgraded = seedOutdated && Boolean(saved);
        this.importTables(useNewSeed ? this.seedTables() : legacy.tables);
      }
      this.configure();
      this.ready = true;
      if (this.seedUpgraded) writeSeedVersion();
      if (!preserveCorruptSnapshot) this.persist();
      return this;
    }

    sampleCountsMatch(expected) {
      try {
        const names = this.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';").values.map(row => String(row[0]).toLowerCase()).sort();
        if (names.join(',') !== Object.keys(expected).sort().join(',')) return false;
        return Object.entries(expected).every(([name, count]) => {
          const result = this.query(`SELECT COUNT(*) FROM ${quoteIdentifier(name)};`);
          return result.values.length === 1 && result.values[0][0] === count;
        });
      } catch (error) {
        return false;
      }
    }

    isUntouchedLegacySample() {
      return this.sampleCountsMatch({ students: 30, courses: 16, enrollments: 123 });
    }

    isCurrentSample() {
      const tables = this.seedTables();
      const expected = Object.fromEntries(Object.entries(tables).map(([name, table]) => [name, table.rows.length]));
      return this.sampleCountsMatch(expected);
    }

    async initializePersistence(projectId) {
      this.projectId = String(projectId || this.projectId || defaultProjectId);
      let persistedRecordRead = false;
      try {
        this.snapshotStore = await openSnapshotStore();
        const record = await idbRequest(this.snapshotStore.transaction(databaseStore, 'readonly').objectStore(databaseStore).get(this.projectId));
        if (record && record.data && !this.seedUpgraded) {
          persistedRecordRead = true;
          this.restoreSnapshot(base64ToBytes(record.data), false);
          this.restoreError = '';
        } else if (record && record.data) {
          this.persist();
        } else {
          const legacy = this.seedUpgraded ? null : window.localStorage && window.localStorage.getItem(`${storageKey}:${this.projectId}`) || (this.projectId === defaultProjectId && window.localStorage && window.localStorage.getItem(storageKey));
          if (legacy) this.restoreSnapshot(base64ToBytes(legacy), false);
          this.persist();
        }
      } catch (error) {
        this.snapshotStore = null;
        const preserveExistingSnapshot = Boolean(this.restoreError) || persistedRecordRead;
        this.restoreError = this.restoreError || (persistedRecordRead
          ? `IndexedDB 中保存的 SQLite 数据库损坏，已保留原快照并继续使用当前内存数据库：${error.message}`
          : `IndexedDB 快照不可用，将使用浏览器本地存储：${error.message}`);
        if (!preserveExistingSnapshot) this.persist();
      }
      return this;
    }

    async switchProject(projectId) {
      if (!this.ready) throw new Error('SQLite 引擎尚未就绪');
      projectId = String(projectId || defaultProjectId);
      if (projectId === this.projectId) return this;
      this.persist();
      this.projectId = String(projectId || defaultProjectId);
      let restored = false;
      if (this.snapshotStore) {
        const record = await idbRequest(this.snapshotStore.transaction(databaseStore, 'readonly').objectStore(databaseStore).get(this.projectId));
        if (record && record.data) {
          this.restoreSnapshot(base64ToBytes(record.data), false);
          restored = true;
        }
      }
      if (!restored) {
        const saved = window.localStorage && window.localStorage.getItem(`${storageKey}:${this.projectId}`) || (this.projectId === defaultProjectId && window.localStorage && window.localStorage.getItem(storageKey));
        if (saved) { this.restoreSnapshot(base64ToBytes(saved), false); restored = true; }
      }
      if (!restored) {
        if (this.db) this.db.close();
        this.db = new this.SQL.Database();
        this.configure();
        this.transactionDepth = 0;
        const legacy = window.queryPadLegacyEngine;
        this.importTables(legacy && legacy.tables ? legacy.tables : this.seedTables());
      }
      this.persist();
      return this;
    }

    seedTables() {
      const seed = new window.OfflineEngine();
      seed.seed();
      return seed.tables;
    }

    configure() {
      this.db.exec('PRAGMA foreign_keys = ON;');
      this.db.create_function('CONCAT', (...values) => values.map(value => value == null ? '' : String(value)).join(''));
      this.db.create_function('YEAR', value => this.datePart(value, 'year'));
      this.db.create_function('MONTH', value => this.datePart(value, 'month'));
      this.db.create_function('DAY', value => this.datePart(value, 'day'));
      this.db.create_function('DATE_FORMAT', (value, format) => this.dateFormat(value, format));
    }

    datePart(value, part) {
      if (value == null) return null;
      const date = new Date(String(value).length === 10 ? `${value}T00:00:00Z` : value);
      if (Number.isNaN(date.getTime())) return null;
      if (part === 'year') return date.getUTCFullYear();
      if (part === 'month') return date.getUTCMonth() + 1;
      return date.getUTCDate();
    }

    dateFormat(value, format) {
      if (value == null || format == null) return null;
      const date = new Date(String(value).length === 10 ? `${value}T00:00:00Z` : value);
      if (Number.isNaN(date.getTime())) return null;
      const pad = number => String(number).padStart(2, '0');
      const parts = {
        '%Y': String(date.getUTCFullYear()),
        '%y': pad(date.getUTCFullYear() % 100),
        '%m': pad(date.getUTCMonth() + 1),
        '%c': String(date.getUTCMonth() + 1),
        '%d': pad(date.getUTCDate()),
        '%e': String(date.getUTCDate()),
        '%H': pad(date.getUTCHours()),
        '%i': pad(date.getUTCMinutes()),
        '%s': pad(date.getUTCSeconds()),
        '%M': date.toLocaleString('en', { month: 'long', timeZone: 'UTC' }),
        '%b': date.toLocaleString('en', { month: 'short', timeZone: 'UTC' })
      };
      return String(format).replace(/%[YymscdeHisMb]/g, token => parts[token] || token);
    }

    importTables(tables) {
      Object.entries(tables).forEach(([name, table]) => {
        if (!table || !Array.isArray(table.columns) || !Array.isArray(table.rows)) {
          throw new Error(`旧练习数据库格式无效：${name}`);
        }
        const columns = table.columns;
        if (!columns.length) return;
        const definitions = columns.map(column => `${quoteIdentifier(column)} ${inferType(table.rows, column)}`).join(', ');
        this.db.exec(`CREATE TABLE ${quoteIdentifier(name)} (${definitions});`);
        const placeholders = columns.map(() => '?').join(', ');
        const insert = this.db.prepare(`INSERT INTO ${quoteIdentifier(name)} VALUES (${placeholders});`);
        try {
          table.rows.forEach(row => {
            insert.run(columns.map(column => row[column] === undefined ? null : row[column]));
          });
        } finally {
          insert.free();
        }
      });
    }

    get tables() {
      const tables = {};
      this.db.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name;")
        .forEach(result => result.values.forEach(([name]) => {
          const table = this.table(name);
          tables[name.toLowerCase()] = table;
        }));
      return tables;
    }

    table(name) {
      const actualName = this.db.exec(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND lower(name) = lower(${this.sqlString(name)}) LIMIT 1;`
      )[0]?.values[0]?.[0];
      if (!actualName) throw new Error(`找不到数据表：${name}`);
      const result = this.query(`SELECT * FROM ${quoteIdentifier(actualName)};`);
      return {
        columns: result.columns,
        rows: result.values.map(values => Object.fromEntries(result.columns.map((column, index) => [column, values[index]])))
      };
    }

    query(statement) {
      const query = this.db.prepare(statement);
      try {
        const columns = query.getColumnNames();
        const values = [];
        while (query.step()) values.push(query.get());
        return { columns, values };
      } finally {
        query.free();
      }
    }

    sqlString(value) {
      return `'${String(value).replace(/'/g, "''")}'`;
    }

    translate(sql) {
      let statement = sql.replace(/`((?:``|[^`])+?)`/g, (_, name) => quoteIdentifier(name.replace(/``/g, '`')));
      statement = statement.replace(/\s+ENGINE\s*=\s*\w+/gi, '');
      statement = statement.replace(/\s+DEFAULT\s+CHARSET\s*=\s*[\w-]+/gi, '');
      statement = statement.replace(/\s+CHARSET\s*=\s*[\w-]+/gi, '');
      statement = statement.replace(/\s+COLLATE\s*=\s*[\w-]+/gi, '');
      statement = statement.replace(/\s+COMMENT\s+'(?:''|[^'])*'/gi, '');
      statement = statement.replace(/\bUNSIGNED\b/gi, '');
      statement = statement.replace(/\bINSERT\s+IGNORE\s+INTO\b/gi, 'INSERT OR IGNORE INTO');
      statement = statement.replace(/\bLIMIT\s+(\d+)\s*,\s*(\d+)\b/gi, 'LIMIT $2 OFFSET $1');
      statement = statement.replace(/\bTRUNCATE\s+TABLE\b/gi, 'DELETE FROM');
      return statement.trim();
    }

    metadata(statement) {
      if (/^show\s+tables\b/i.test(statement)) {
        const result = this.db.exec("SELECT name AS Tables FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name;");
        return { columns: result[0]?.columns || ['Tables'], values: result[0]?.values || [], rowCount: result[0]?.values.length || 0, kind: 'query' };
      }
      const match = statement.match(/^(?:describe|desc|show\s+(?:columns|fields)\s+from)\s+`?([\w-]+)`?/i);
      if (!match) throw new Error('当前 SQLite 兼容层不支持这条元数据语句');
      const result = this.db.exec(`PRAGMA table_info(${quoteIdentifier(match[1])});`);
      if (!result[0]) throw new Error(`找不到数据表：${match[1]}`);
      const values = result[0].values.map(row => [
        row[1],
        row[2],
        row[3] ? 'NO' : 'YES',
        row[5] ? 'PRI' : '',
        row[4],
        ''
      ]);
      return { columns: ['Field', 'Type', 'Null', 'Key', 'Default', 'Extra'], values, rowCount: values.length, kind: 'query' };
    }

    execute(sql) {
      if (!this.ready) throw new Error('SQLite 引擎尚未就绪');
      const statements = splitStatements(String(sql || ''));
      if (!statements.length) throw new Error('请输入 SQL 语句');
      let response = null;
      const mutates = statements.some(statement => !isReadOnly(statement) && !/^(?:show\s+(?:tables|columns|fields)\b|describe\b|desc\b)/i.test(statement));
      const snapshot = mutates && this.transactionDepth === 0 ? this.db.export() : null;
      let persistAfterExecution = mutates && this.transactionDepth === 0;
      try {
        statements.forEach(original => {
          if (/^(?:begin\b|savepoint\b)/i.test(original)) {
            if (/^savepoint\b/i.test(original)) this.transactionDepth += 1;
            else this.transactionDepth = 1;
            persistAfterExecution = false;
          } else if (/^(?:commit\b|end\b)/i.test(original)) {
            this.transactionDepth = 0;
            persistAfterExecution = true;
          } else if (/^rollback\b/i.test(original)) {
            if (!/\bto\b/i.test(original)) this.transactionDepth = 0;
            persistAfterExecution = false;
          } else if (/^release\b/i.test(original) && this.transactionDepth > 0) {
            this.transactionDepth -= 1;
            persistAfterExecution = this.transactionDepth === 0;
          }
          const mysqlMetadata = /^(?:show\s+(?:tables|columns|fields)\b|describe\b|desc\b)/i.test(original);
          if (mysqlMetadata) {
            response = this.metadata(original);
            return;
          }
          const statement = this.translate(original);
          if (isReadOnly(statement)) {
            const result = this.query(statement);
            response = { ...result, rowCount: result.values.length, kind: 'query' };
            return;
          }
          const results = this.db.exec(statement);
          const last = results[results.length - 1];
          if (last) {
            response = { columns: last.columns, values: last.values, rowCount: last.values.length, kind: 'query' };
          } else {
            const changes = this.db.getRowsModified();
            const command = statement.match(/^\s*([a-z]+)/i)?.[1]?.toUpperCase() || 'SQL';
            response = {
              columns: ['message'],
              values: [[`${command} 执行成功${changes ? `，影响 ${changes} 行` : ''}`]],
              rowCount: 1,
              kind: 'message'
            };
          }
        });
        if (persistAfterExecution && this.transactionDepth === 0) this.persist();
        return response;
      } catch (error) {
        if (snapshot && this.transactionDepth === 0) {
          this.db.close();
          this.db = new this.SQL.Database(snapshot);
          this.configure();
        }
        throw new Error(`SQLite 执行失败：${error.message}`);
      }
    }

    synchronizeTable(name, createSql, options = {}) {
      if (!this.ready || !this.db) throw new Error('SQLite 引擎尚未就绪');
      if (this.transactionDepth) throw new Error('请先提交或回滚当前事务，再同步表结构');
      const tableName = String(name || '');
      const ddl = this.translate(String(createSql || '').trim().replace(/;\s*$/, ''));
      const header = ddl.match(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?("(?:[^"]|"")*"|[A-Za-z_][\w$]*)\s*\(/i);
      if (!header || header[1].replace(/^"|"$/g, '').replace(/""/g, '"') !== tableName) throw new Error('建表语句与当前数据表不一致');
      const exists = this.db.exec(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${this.sqlString(tableName)};`)[0]?.values.length > 0;
      const oldDb = this.db;
      const candidate = new this.SQL.Database(oldDb.export());
      const tempName = `__querypad_migrate_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
      const signature = (db, target) => {
        const columns = db.exec(`PRAGMA table_info(${quoteIdentifier(target)});`)[0]?.values || [];
        const foreignKeys = db.exec(`PRAGMA foreign_key_list(${quoteIdentifier(target)});`)[0]?.values || [];
        return JSON.stringify({
          columns: columns.map(row => [row[1], String(row[2] || '').toUpperCase(), row[3], row[4], row[5]]),
          foreignKeys: foreignKeys.map(row => [row[2], row[3], row[4], row[5], row[6], row[7]]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
        });
      };
      try {
        candidate.exec('PRAGMA foreign_keys = OFF;');
        candidate.exec(ddl.replace(header[0], `CREATE TABLE ${quoteIdentifier(tempName)} (`));
        if (exists && signature(candidate, tableName) === signature(candidate, tempName)) {
          candidate.close();
          return false;
        }
        candidate.exec('BEGIN TRANSACTION;');
        if (exists) {
          const uniqueIndexes = candidate.exec(`PRAGMA index_list(${quoteIdentifier(tableName)});`)[0]?.values || [];
          if (uniqueIndexes.some(row => row[3] === 'u')) throw new Error('原表含 UNIQUE 约束，请先用 SQL 手工迁移，以免丢失约束');
          const dependent = candidate.exec(`SELECT sql FROM sqlite_master WHERE tbl_name = ${this.sqlString(tableName)} AND type IN ('index', 'trigger') AND sql IS NOT NULL ORDER BY type;`)[0]?.values.map(row => row[0]) || [];
          const oldColumns = (candidate.exec(`PRAGMA table_info(${quoteIdentifier(tableName)});`)[0]?.values || []).map(row => row[1]);
          const newColumns = (candidate.exec(`PRAGMA table_info(${quoteIdentifier(tempName)});`)[0]?.values || []).map(row => row[1]);
          const shared = newColumns.map(column => ({ target:column, source:oldColumns.find(oldColumn => oldColumn.toLowerCase() === column.toLowerCase()) })).filter(column => column.source);
          const rowCount = candidate.exec(`SELECT COUNT(*) FROM ${quoteIdentifier(tableName)};`)[0]?.values[0]?.[0] || 0;
          if (rowCount && !shared.length) throw new Error('新旧表没有同名字段，无法安全保留原数据');
          if (shared.length) {
            const targetColumns = shared.map(column => quoteIdentifier(column.target)).join(', ');
            const sourceColumns = shared.map(column => quoteIdentifier(column.source)).join(', ');
            candidate.exec(`INSERT INTO ${quoteIdentifier(tempName)} (${targetColumns}) SELECT ${sourceColumns} FROM ${quoteIdentifier(tableName)};`);
          }
          candidate.exec(`DROP TABLE ${quoteIdentifier(tableName)};`);
          candidate.exec(`ALTER TABLE ${quoteIdentifier(tempName)} RENAME TO ${quoteIdentifier(tableName)};`);
          dependent.forEach(sql => candidate.exec(sql));
        } else candidate.exec(`ALTER TABLE ${quoteIdentifier(tempName)} RENAME TO ${quoteIdentifier(tableName)};`);
        if (!options.skipForeignKeyCheck) {
          const violations = candidate.exec('PRAGMA foreign_key_check;')[0]?.values || [];
          if (violations.length) throw new Error(`外键校验未通过：${violations[0].join(' / ')}`);
        }
        candidate.exec('COMMIT; PRAGMA foreign_keys = ON;');
        this.db = candidate;
        this.configure();
        try { if (!options.skipPersist) this.persist(); }
        catch (error) { this.db = oldDb; throw error; }
        oldDb.close();
        return true;
      } catch (error) {
        if (this.db === candidate) this.db = oldDb;
        candidate.close();
        throw new Error(`表结构同步失败：${error.message}`);
      }
    }

    async clearStoredSnapshots() {
      if (this.snapshotStore) {
        this.snapshotStore.close();
        this.snapshotStore = null;
      }
      if (!window.indexedDB) return;
      await new Promise((resolve, reject) => {
        const request = window.indexedDB.deleteDatabase(databaseName);
        request.onsuccess = resolve;
        request.onerror = () => reject(request.error || new Error('IndexedDB 删除失败'));
        request.onblocked = () => reject(new Error('其他页面仍在使用数据库，请关闭本应用的其他标签页后重试'));
      });
    }

    inspectSchema() {
      const tables = this.db.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name;")[0]?.values.map(row => row[0]) || [];
      const result = { tables: [], relations: [] };
      tables.forEach(name => {
        const info = this.db.exec(`PRAGMA table_info(${quoteIdentifier(name)});`)[0]?.values || [];
        result.tables.push({
          name,
          fields: info.map(row => {
            const rawType = String(row[2] || 'TEXT').toUpperCase();
            const type = /INT/.test(rawType) ? 'INT' : /VARCHAR/.test(rawType) ? 'VARCHAR' : /CHAR|CLOB|TEXT/.test(rawType) ? 'TEXT' : /DATE|TIME/.test(rawType) ? 'DATE' : /DEC|NUM/.test(rawType) ? 'DECIMAL' : /REAL|FLOA|DOUB/.test(rawType) ? 'REAL' : 'TEXT';
            const length = rawType.match(/\(([^)]+)\)/)?.[1] || '';
            return { name: row[1], type, length, pk: Number(row[5]) > 0, nullable: !Number(row[3]), defaultValue: row[4] == null ? '' : String(row[4]), comment: '' };
          })
        });
        const foreignKeys = this.db.exec(`PRAGMA foreign_key_list(${quoteIdentifier(name)});`)[0]?.values || [];
        foreignKeys.forEach(row => result.relations.push({ fromTable: name, fromColumn: row[3], toTable: row[2], toColumn: row[4], cardinality: 'N:1' }));
      });
      return result;
    }

    syncSchema(schema, options = {}) {
      if (!schema || !Array.isArray(schema.tables)) throw new Error('待同步的表结构无效');
      const relations = Array.isArray(schema.relations) ? schema.relations : [];
      const byName = new Map(schema.tables.map(table => [String(table.name).toLowerCase(), table]));
      const sorted = [];
      const seen = new Set();
      const visiting = new Set();
      const visit = table => {
        const key = String(table.name).toLowerCase();
        if (seen.has(key) || visiting.has(key)) return;
        visiting.add(key);
        relations.filter(relation => relation.fromTable?.toLowerCase() === key && relation.cardinality !== 'N:N')
          .forEach(relation => { const parent = byName.get(relation.toTable?.toLowerCase()); if (parent) visit(parent); });
        visiting.delete(key);
        seen.add(key);
        sorted.push(table);
      };
      schema.tables.forEach(visit);
      const original = this.snapshot();
      try {
        sorted.forEach(table => {
          if (!table || !table.name || !Array.isArray(table.fields) || !table.fields.length) throw new Error('表结构必须包含表名和至少一个字段');
          const primaryKeys = table.fields.filter(field => field.pk);
          const fields = table.fields.map(field => `${quoteIdentifier(field.name || 'new_field')} ${schemaType(field)}${field.nullable ? '' : ' NOT NULL'}${primaryKeys.length === 1 && field.pk ? ' PRIMARY KEY' : ''}${defaultSql(field.defaultValue)}`);
          if (primaryKeys.length > 1) fields.push(`PRIMARY KEY (${primaryKeys.map(field => quoteIdentifier(field.name)).join(', ')})`);
          const foreignKeys = relations.filter(relation => relation.fromTable === table.name && relation.cardinality !== 'N:N' && relation.fromColumn && relation.toTable && relation.toColumn)
            .map((relation, index) => `CONSTRAINT ${quoteIdentifier(`fk_${table.name}_${relation.fromColumn}_${index}`)} FOREIGN KEY (${quoteIdentifier(relation.fromColumn)}) REFERENCES ${quoteIdentifier(relation.toTable)} (${quoteIdentifier(relation.toColumn)})`);
          const ddl = `CREATE TABLE ${quoteIdentifier(table.name)} (${[fields.join(', '), foreignKeys.join(', ')].filter(Boolean).join(', ')});`;
          this.synchronizeTable(table.name, ddl, { skipForeignKeyCheck:true, skipPersist:true });
        });
        const violations = this.db.exec('PRAGMA foreign_key_check;')[0]?.values || [];
        if (violations.length) throw new Error(`外键校验未通过：${violations[0].join(' / ')}`);
        if (!options.skipPersist) this.persist();
        return this.inspectSchema();
      } catch (error) {
        this.restoreSnapshot(original, false);
        throw error;
      }
    }

    prepareProjectSnapshot(bytes, schema) {
      if (bytes !== null && bytes !== undefined && !(bytes instanceof Uint8Array)) throw new Error('数据库快照格式无效');
      const candidate = new SQLiteEngine(this.SQL);
      candidate.projectId = '__querypad_import_validation__';
      candidate.ready = true;
      candidate.db = bytes ? new this.SQL.Database(bytes) : new this.SQL.Database();
      candidate.configure();
      try {
        if (!bytes) candidate.importTables(candidate.seedTables());
        const check = candidate.db.exec('PRAGMA quick_check;')[0]?.values?.[0]?.[0];
        if (check !== 'ok') throw new Error('SQLite 快照完整性检查失败');
        candidate.syncSchema(schema, { skipPersist: true });
        return { snapshot: candidate.snapshot(), schema: candidate.inspectSchema() };
      } finally {
        candidate.db?.close();
      }
    }

    async deleteProjectSnapshot(projectId) {
      const id = String(projectId || '');
      if (!id || id === defaultProjectId) throw new Error('不能删除默认项目的 SQLite 快照');
      if (window.localStorage) window.localStorage.removeItem(`${storageKey}:${id}`);
      if (!this.snapshotStore) return;
      await idbRequest(this.snapshotStore.transaction(databaseStore, 'readwrite').objectStore(databaseStore).delete(id));
    }

    persist() {
      if (!window.localStorage || !this.db) return;
      try {
        const data = bytesToBase64(this.db.export());
        window.localStorage.setItem(`${storageKey}:${this.projectId}`, data);
        if (this.projectId === defaultProjectId) window.localStorage.setItem(storageKey, data);
        if (this.snapshotStore) {
          const transaction = this.snapshotStore.transaction(databaseStore, 'readwrite');
          transaction.objectStore(databaseStore).put({ projectId: this.projectId, data, updatedAt: Date.now() }, this.projectId);
          transaction.onerror = error => console.warn('SQLite IndexedDB 快照保存失败', error);
        }
      } catch (error) {
        throw new Error(`SQLite 数据库无法保存到浏览器本地存储：${error.message}`);
      }
    }

    snapshot() {
      return this.db.export();
    }

    restoreSnapshot(bytes, persist = true) {
      if (!(bytes instanceof Uint8Array)) throw new Error('数据库快照无效');
      let nextDb;
      try {
        nextDb = new this.SQL.Database(bytes);
        nextDb.exec('SELECT name FROM sqlite_master LIMIT 1');
      } catch (error) {
        if (nextDb) nextDb.close();
        throw new Error(`数据库快照无效或已损坏：${error.message}`);
      }
      if (this.db) this.db.close();
      this.db = nextDb;
      this.configure();
      this.transactionDepth = 0;
      if (persist) this.persist();
    }

    reset() {
      if (this.db) this.db.close();
      this.db = new this.SQL.Database();
      this.configure();
      this.transactionDepth = 0;
      this.importTables(this.seedTables());
      writeSeedVersion();
      this.persist();
    }
  }

  window.queryPadEngineReady = window.initSqlJs({
    locateFile: file => `vendor/sql.js/${file}`
  }).then(SQL => {
    const engine = new SQLiteEngine(SQL);
    const projectId = window.queryPadProjectId || defaultProjectId;
    engine.initialize(projectId);
    window.queryPadEngine = engine;
    return engine.initializePersistence(projectId);
  });
})();
