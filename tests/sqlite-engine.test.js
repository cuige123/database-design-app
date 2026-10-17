const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const initSqlJs = require('sql.js');

async function main() {
  const SQL = await initSqlJs({ locateFile: () => path.resolve(__dirname, '../node_modules/sql.js/dist/sql-wasm.wasm') });
  const storage = new Map();
  const window = {
    initSqlJs: () => Promise.resolve(SQL),
    queryPadProjectId: 'default',
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    },
    indexedDB: null
  };
  const context = { window, Uint8Array, TextEncoder, TextDecoder, console, Date, Number, String, Array, Object, Map, Set, Promise, Error, RegExp, Math, JSON, Buffer, queueMicrotask,
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    btoa: value => Buffer.from(value, 'binary').toString('base64') };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../offline-engine.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../sqlite-engine.js'), 'utf8'), context);
  const engine = await window.queryPadEngineReady;
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  assert(engine.execute('SELECT * FROM students').values.length > 0, 'seed data missing');
  engine.execute('CREATE TABLE test_crud (id INT, value INT)');
  engine.execute('INSERT INTO test_crud VALUES (1, 2)');
  engine.execute('UPDATE test_crud SET value = 3 WHERE id = 1');
  assert(engine.execute('SELECT value FROM test_crud').values[0][0] === 3, 'CRUD failed');
  const schema = {
    tables: [
      { name:'sync_child', fields:[{ name:'id', type:'INT', pk:true, nullable:false }, { name:'parent_id', type:'INT', nullable:false }] },
      { name:'sync_parent', fields:[{ name:'id', type:'INT', pk:true, nullable:false }, { name:'label', type:'TEXT', nullable:true }] }
    ],
    relations: [{ fromTable:'sync_child', fromColumn:'parent_id', toTable:'sync_parent', toColumn:'id', cardinality:'N:1' }]
  };
  engine.syncSchema(schema);
  engine.execute("INSERT INTO sync_parent (id, label) VALUES (1, 'keep'); INSERT INTO sync_child (id, parent_id) VALUES (1, 1);");
  const foreignKeys = engine.execute('PRAGMA foreign_key_list(sync_child)').rowCount;
  assert(foreignKeys === 1, 'schema synchronization did not install the foreign key');
  schema.tables[1].fields.push({ name:'status', type:'VARCHAR', length:'20', nullable:false, defaultValue:'active' });
  engine.syncSchema(schema);
  assert(engine.execute('SELECT label, status FROM sync_parent WHERE id = 1').values[0].join(',') === 'keep,active', 'schema migration did not preserve row data and apply defaults');
  schema.tables[1].fields.push({ name:'required_value', type:'TEXT', nullable:false, defaultValue:'' });
  let migrationRejected = false;
  try { engine.syncSchema(schema); } catch (_) { migrationRejected = true; }
  assert(migrationRejected, 'non-null field without a default should reject unsafe migration');
  assert(!engine.execute('PRAGMA table_info(sync_parent)').values.some(row => row[1] === 'required_value'), 'failed migration should restore the old schema');
  assert(engine.execute('SELECT COUNT(*) FROM sync_parent').values[0][0] === 1, 'failed migration should preserve the old table and its rows');
  assert(engine.execute('PRAGMA foreign_key_check').rowCount === 0, 'schema migration introduced a foreign-key violation');
  const snapshot = engine.snapshot();
  engine.execute('DELETE FROM test_crud');
  engine.restoreSnapshot(snapshot);
  assert(engine.execute('SELECT value FROM test_crud').values[0][0] === 3, 'snapshot restore failed');
  await engine.switchProject('project-b');
  assert(!engine.execute('SHOW TABLES').values.some(row => row[0] === 'test_crud'), 'project data leaked');
  engine.execute('CREATE TABLE project_data (value INT)');
  engine.execute('INSERT INTO project_data VALUES (9)');
  await engine.switchProject('default');
  assert(engine.execute('SELECT value FROM test_crud').values[0][0] === 3, 'default project lost data');
  await engine.switchProject('project-b');
  assert(engine.execute('SELECT value FROM project_data').values[0][0] === 9, 'project data was not restored');
  engine.execute('CREATE TABLE `odd``table` (`odd``field` TEXT); INSERT INTO `odd``table` (`odd``field`) VALUES (\'ok\');');
  assert(engine.execute('SELECT `odd``field` FROM `odd``table`').values[0][0] === 'ok', 'escaped SQLite identifiers failed');
  console.log('SQLite engine tests passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
