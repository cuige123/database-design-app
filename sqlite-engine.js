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
      if (saved) {
        try {
          const binary = atob(saved);
          const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
          this.db = new this.SQL.Database(bytes);
        } catch (error) {
          this.restoreError = `保存的 SQLite 数据库无法加载，原有数据未被覆盖：${error.message}`;
          console.error(this.restoreError, error);
          throw new Error(this.restoreError);
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
      this.persist();
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
      try {
        this.snapshotStore = await openSnapshotStore();
        const record = await idbRequest(this.snapshotStore.transaction(databaseStore, 'readonly').objectStore(databaseStore).get(this.projectId));
        if (record && record.data && !this.seedUpgraded) {
          this.restoreSnapshot(base64ToBytes(record.data), false);
        } else if (record && record.data) {
          this.persist();
        } else {
          const legacy = this.seedUpgraded ? null : window.localStorage && window.localStorage.getItem(`${storageKey}:${this.projectId}`) || (this.projectId === defaultProjectId && window.localStorage && window.localStorage.getItem(storageKey));
          if (legacy) this.restoreSnapshot(base64ToBytes(legacy), false);
          this.persist();
        }
      } catch (error) {
        this.snapshotStore = null;
        this.restoreError = `IndexedDB 快照不可用，将使用浏览器本地存储：${error.message}`;
        this.persist();
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
      let statement = sql.replace(/`([^`]+)`/g, (_, name) => quoteIdentifier(name));
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
