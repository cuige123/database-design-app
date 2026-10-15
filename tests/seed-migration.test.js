const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const initSqlJs = require('sql.js');

const LEGACY_COUNTS = { students: 30, courses: 16, enrollments: 123 };
const EXPANDED_COUNTS = { students: 120, courses: 40, enrollments: 360 };

function createStorage(seed) {
  const storage = new Map(Object.entries(seed || {}));
  return {
    storage,
    api: {
      getItem: key => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key)
    }
  };
}

async function bootEngine(SQL, storageApi) {
  const window = {
    initSqlJs: () => Promise.resolve(SQL),
    queryPadProjectId: 'default',
    localStorage: storageApi,
    indexedDB: null
  };
  const context = {
    window, Uint8Array, TextEncoder, TextDecoder, console, Date, Number, String, Array, Object, Map, Set, Promise, Error, RegExp, Math, JSON, Buffer, queueMicrotask,
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    btoa: value => Buffer.from(value, 'binary').toString('base64')
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../offline-engine.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../sqlite-engine.js'), 'utf8'), context);
  return { engine: await window.queryPadEngineReady, window };
}

async function buildLegacySnapshot(SQL, mutate) {
  const db = new SQL.Database();
  const tables = {
    students: { columns: ['id', 'name', 'score', 'major'], rows: [] },
    courses: { columns: ['id', 'title', 'credits'], rows: [] },
    enrollments: { columns: ['id', 'student_id', 'course_id', 'enrolled_at'], rows: [] }
  };
  for (let index = 0; index < LEGACY_COUNTS.students; index += 1) {
    tables.students.rows.push({ id: index + 1, name: `学生${index + 1}`, score: 60 + index, major: '计算机科学' });
  }
  for (let index = 0; index < LEGACY_COUNTS.courses; index += 1) {
    tables.courses.rows.push({ id: index + 1, title: `课程${index + 1}`, credits: 3 });
  }
  for (let index = 0; index < LEGACY_COUNTS.enrollments; index += 1) {
    tables.enrollments.rows.push({ id: index + 1, student_id: (index % LEGACY_COUNTS.students) + 1, course_id: (index % LEGACY_COUNTS.courses) + 1, enrolled_at: '2026-09-01' });
  }
  Object.entries(tables).forEach(([name, table]) => {
    db.exec(`CREATE TABLE "${name}" (${table.columns.map(column => `"${column}"`).join(', ')});`);
    const placeholders = table.columns.map(() => '?').join(', ');
    const insert = db.prepare(`INSERT INTO "${name}" VALUES (${placeholders});`);
    table.rows.forEach(row => insert.run(table.columns.map(column => row[column])));
    insert.free();
  });
  if (mutate) mutate(db);
  return Buffer.from(db.export()).toString('base64');
}

function counts(engine) {
  return Object.fromEntries(Object.keys(EXPANDED_COUNTS).map(name =>
    [name, engine.execute(`SELECT COUNT(*) FROM ${name};`).values[0][0]]
  ));
}

async function main() {
  const SQL = await initSqlJs({ locateFile: () => path.resolve(__dirname, '../node_modules/sql.js/dist/sql-wasm.wasm') });
  const assert = (condition, message) => { if (!condition) throw new Error(message); };

  const fresh = createStorage();
  const freshEngine = (await bootEngine(SQL, fresh.api)).engine;
  assert(JSON.stringify(counts(freshEngine)) === JSON.stringify(EXPANDED_COUNTS), '全新安装未使用扩充后的样例数据');
  assert(freshEngine.seedUpgraded === false, '全新安装不应标记为样例升级');

  const legacySql = await buildLegacySnapshot(SQL);
  const upgradable = createStorage({
    'querypad-sqlite-database:default': legacySql,
    'querypad-sqlite-database': legacySql,
    'querypad-database': JSON.stringify({ students: { columns: ['id'], rows: [] } })
  });
  const upgradedEngine = (await bootEngine(SQL, upgradable.api)).engine;
  assert(upgradedEngine.seedUpgraded === true, '未改动过的旧样例数据应升级');
  assert(JSON.stringify(counts(upgradedEngine)) === JSON.stringify(EXPANDED_COUNTS), '升级后样例数量不正确');
  assert(upgradable.storage.get('querypad-seed-version') === '2', '升级后应记录样例版本号');
  assert(!upgradable.storage.has('querypad-database'), '升级后应清除旧版离线样例数据');

  const modifiedSql = await buildLegacySnapshot(SQL, db => db.exec('CREATE TABLE my_notes (note TEXT); INSERT INTO my_notes VALUES (\'keep me\');'));
  const modified = createStorage({
    'querypad-sqlite-database:default': modifiedSql,
    'querypad-sqlite-database': modifiedSql
  });
  const preservedEngine = (await bootEngine(SQL, modified.api)).engine;
  assert(preservedEngine.seedUpgraded === false, '用户改动过的练习库不应被替换');
  assert(JSON.stringify(counts(preservedEngine)) === JSON.stringify(LEGACY_COUNTS), '用户改动过的练习库数据被误改');
  assert(preservedEngine.execute("SELECT note FROM my_notes;").values[0][0] === 'keep me', '用户自建表丢失');

  preservedEngine.reset();
  assert(JSON.stringify(counts(preservedEngine)) === JSON.stringify(EXPANDED_COUNTS), '手动重置后应载入扩充样例');

  const currentSql = await buildLegacySnapshot(SQL, db => {
    db.exec('DELETE FROM students WHERE id > 120; DELETE FROM courses WHERE id > 40; DELETE FROM enrollments WHERE id > 360;');
    for (let index = 31; index <= 120; index += 1) db.exec(`INSERT INTO students (id, name, score, major) VALUES (${index}, '学生${index}', 70, '计算机科学');`);
    for (let index = 17; index <= 40; index += 1) db.exec(`INSERT INTO courses (id, title, credits) VALUES (${index}, '课程${index}', 3);`);
    for (let index = 124; index <= 360; index += 1) db.exec(`INSERT INTO enrollments (id, student_id, course_id, enrolled_at) VALUES (${index}, 1, 1, '2026-09-01');`);
  });
  const currentOnly = createStorage({ 'querypad-sqlite-database:default': currentSql, 'querypad-sqlite-database': currentSql });
  const currentEngine = (await bootEngine(SQL, currentOnly.api)).engine;
  assert(currentEngine.seedUpgraded === false, '已是当前样例的数据不应被替换');
  assert(JSON.stringify(counts(currentEngine)) === JSON.stringify(EXPANDED_COUNTS), '当前样例数据被误改');
  assert(currentOnly.storage.get('querypad-seed-version') === '2', '已存在的当前样例应补写版本号');

  const editedSql = await buildLegacySnapshot(SQL, db => db.exec('DELETE FROM students WHERE id = 1; INSERT INTO courses (title, credits) VALUES (\'我的课程\', 2);'));
  const edited = createStorage({
    'querypad-sqlite-database:default': editedSql,
    'querypad-sqlite-database': editedSql
  });
  const editedEngine = (await bootEngine(SQL, edited.api)).engine;
  assert(editedEngine.seedUpgraded === false, '内容被改动过的练习库不应被替换');
  assert(editedEngine.execute('SELECT COUNT(*) FROM students;').values[0][0] === LEGACY_COUNTS.students - 1, '改动过的练习库数据被误重置');
  assert(editedEngine.execute("SELECT title FROM courses WHERE title = '我的课程';").values.length === 1, '用户新增的课程丢失');

  const upgradedAgain = (await bootEngine(SQL, upgradable.api)).engine;
  assert(JSON.stringify(counts(upgradedAgain)) === JSON.stringify(EXPANDED_COUNTS), '已升级的浏览器再次加载数据不一致');
  assert(upgradedAgain.seedUpgraded === false, '已升级的浏览器不应重复升级');

  console.log('Seed migration tests passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
