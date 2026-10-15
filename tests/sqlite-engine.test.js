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
  console.log('SQLite engine tests passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });