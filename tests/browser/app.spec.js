const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function openApp(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/index.html');
  await expect(page.locator('#runBtn')).toBeEnabled();
  await expect(page.locator('#engineMessage')).toContainText('已就绪');
  return errors;
}

async function chooseAiQuick(page, task) {
  const button = page.locator(`[data-ai-quick="${task}"]`);
  if (!(await button.isVisible())) await page.locator('#aiFeatureToggle').click();
  await button.click();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('querypad-test-initialized')) {
      localStorage.clear();
      indexedDB.deleteDatabase('querypad-sqlite');
      sessionStorage.setItem('querypad-test-initialized', '1');
    }
  });
});

test('loads the real SQLite WASM engine and executes SQL in the workbench', async ({ page }) => {
  const errors = await openApp(page);
  await page.locator('#sqlEditor').fill('SELECT COUNT(*) AS total FROM students;');
  await page.locator('#runBtn').click();
  await expect(page.locator('#resultTable tbody')).toContainText('120');
  await expect(page.locator('#statusLabel')).toHaveClass(/success/);
  expect(errors).toEqual([]);
});

test('runs quick SQL examples without grading them against the active exercise', async ({ page }) => {
  const errors = await openApp(page);
  for (const example of [
    { name: '查询并排序', rows: '120 行' },
    { name: '分组统计', rows: '6 行' },
    { name: '多表连接', rows: '360 行' }
  ]) {
    await page.getByRole('button', { name: example.name }).click();
    await page.locator('#runBtn').click();
    await expect(page.locator('#statusLabel')).toHaveText('SQLite 执行成功');
    await expect(page.locator('#resultMeta')).toContainText(example.rows);
    await expect(page.locator('#resultFoot')).toHaveText('快捷示例已执行；未按当前练习判分');
  }
  expect(errors).toEqual([]);
});

test('explains the local SQL environment from the environment button', async ({ page }) => {
  const errors = await openApp(page);
  const modal = page.locator('#environmentModal');
  await expect(page.locator('#switchBtn')).toHaveText('环境说明');
  await page.locator('#switchBtn').click();
  await expect(modal).toHaveClass(/open/);
  await expect(modal).toHaveAttribute('aria-hidden', 'false');
  await expect(modal).toContainText('SQLite WASM');
  await expect(modal).toContainText('保存在当前浏览器');
  await expect(modal).toContainText('不会连接真实或远程 MySQL');
  await page.locator('#environmentClose').click();
  await expect(modal).not.toHaveClass(/open/);
  await expect(modal).toHaveAttribute('aria-hidden', 'true');
  expect(errors).toEqual([]);
});

test('uses the updated smart-learning brand on desktop, mobile, and app install metadata', async ({ page }) => {
  const errors = await openApp(page);
  await expect(page.locator('.brand h1')).toHaveText('MySQL 智能学习实验室');
  await expect(page.locator('.brand p')).toHaveText('移动端 · 网页端 · 智能学习助手');
  await expect(page.locator('.brand img')).toHaveAttribute('alt', 'MySQL 智能学习实验室标识');
  const metadata = await page.evaluate(async () => {
    const manifest = await fetch('manifest.json', { cache:'no-store' }).then(response => response.json());
    return {
      title:document.title,
      description:document.querySelector('meta[name="description"]').content,
      manifestName:manifest.name,
      manifestShortName:manifest.short_name,
      manifestDescription:manifest.description
    };
  });
  expect(metadata.title).toContain('MySQL 智能学习实验室');
  expect(metadata.description).toContain('智能学习助手');
  expect(metadata.manifestName).toContain('MySQL 智能学习实验室');
  expect(metadata.manifestShortName).toBe('MySQL智学');
  expect(metadata.manifestDescription).toContain('智能学习助手');

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height:844 });
    const layout = await page.evaluate(() => ({
      brand:document.querySelector('.brand').getBoundingClientRect().toJSON(),
      help:document.querySelector('#helpBtn').getBoundingClientRect().toJSON(),
      viewport:document.documentElement.clientWidth
    }));
    expect(layout.brand.right).toBeLessThanOrEqual(layout.help.left + 1);
    expect(layout.help.right).toBeLessThanOrEqual(layout.viewport + 1);
  }
  expect(errors).toEqual([]);
});

test('shows updated usage instructions for the current workbench and assistant controls', async ({ page }) => {
  const errors = await openApp(page);
  await page.locator('#helpBtn').click();
  const help = page.locator('#helpModal');
  await expect(help).toHaveClass(/open/);
  await expect(help.locator('#helpTitle')).toHaveText('使用说明');
  await expect(help).toContainText('快速开始');
  await expect(help).toContainText('上方辅导功能和示例问题可在区域内滚动');
  await expect(help).toContainText('数据预览');
  await expect(help).toContainText('SQLite WASM 本地执行');
  await expect(help).not.toContainText('功能帮助');
  await page.locator('#helpClose').click();
  await expect(help).not.toHaveClass(/open/);
  expect(errors).toEqual([]);
});

test('runs the in-app self-test and restores the practice database', async ({ page }) => {
  const errors = await openApp(page);
  const result = await page.evaluate(() => window.queryPadSelfTest());
  expect(result.failed).toBe(0);
  expect(result.passed).toBeGreaterThan(20);
  expect(result.detail).toContain('SQLite');
  expect(errors).toEqual([]);
});

test('explains that SQLite WASM needs an HTTP server when the page is opened as a local file', async ({ page }) => {
  await page.goto(pathToFileURL(path.resolve('index.html')).href);
  await expect(page.locator('#statusLabel')).toHaveText('请通过本地服务打开');
  await expect(page.locator('#engineMessage')).toContainText('浏览器会阻止 SQLite WASM 加载');
  await expect(page.locator('#engineMessage')).toContainText('http://localhost:4173');
});

test('AI assistant uses the main interface background and text theme', async ({ page }) => {
  const errors = await openApp(page);
  await page.locator('#aiAssistantBtn').click();
  await expect(page.locator('#aiModal')).toHaveClass(/open/);
  const theme = await page.evaluate(() => ({
    mainBackground: getComputedStyle(document.body).backgroundImage,
    assistantBackground: getComputedStyle(document.querySelector('#aiModal .ai-panel')).backgroundImage,
    mainText: getComputedStyle(document.body).color,
    assistantText: getComputedStyle(document.querySelector('#aiModal .ai-panel')).color,
    accent: getComputedStyle(document.querySelector('#aiModal')).getPropertyValue('--ai-accent').trim(),
    mainAccent: getComputedStyle(document.documentElement).getPropertyValue('--blue').trim()
  }));
  expect(theme.assistantBackground).toBe(theme.mainBackground);
  expect(theme.assistantText).toBe(theme.mainText);
  expect(theme.accent).toBe(theme.mainAccent);
  expect(errors).toEqual([]);
});

test('AI assistant scrolls its feature menu and suggestions and collapses them to expand the conversation', async ({ page }) => {
  const errors = await openApp(page);
  await page.setViewportSize({ width:390, height:844 });
  await page.locator('#aiAssistantBtn').click();
  await expect(page.locator('#aiQuickSection')).toBeVisible();
  await expect(page.locator('.ai-intro')).toHaveCount(0);
  await expect(page.locator('.ai-suggestions')).toContainText('试试这样问');
  await expect(page.locator('[data-ai-quick="personalized_exercise"]')).toContainText('举一反三');
  const iconStyles = await page.locator('.ai-quick-icon').evaluateAll(icons => icons.map(icon => {
    const style = getComputedStyle(icon);
    return `${style.color}|${style.borderRadius}`;
  }));
  expect(new Set(iconStyles.map(style => style.split('|')[0])).size).toBe(9);
  expect(new Set(iconStyles.map(style => style.split('|')[1])).size).toBeGreaterThan(5);
  const helperScroll = await page.locator('#aiHelperContent').evaluate(element => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY
  }));
  expect(helperScroll.overflowY).toBe('auto');
  expect(helperScroll.scrollHeight).toBeGreaterThan(helperScroll.clientHeight);
  const scrollPosition = await page.locator('#aiHelperContent').evaluate(element => {
    element.scrollTop = element.scrollHeight;
    return element.scrollTop;
  });
  expect(scrollPosition).toBeGreaterThan(0);
  await page.locator('#aiHelperContent').evaluate(element => { element.scrollTop = 0; });
  const initialLayout = await page.evaluate(() => {
    const panel = document.querySelector('.ai-panel').getBoundingClientRect();
    const messages = document.querySelector('#aiMessages').getBoundingClientRect();
    const composer = document.querySelector('#aiForm').getBoundingClientRect();
    return { panelHeight:panel.height, messagesHeight:messages.height, composerBottom:composer.bottom, panelBottom:panel.bottom };
  });
  expect(initialLayout.messagesHeight).toBeGreaterThan(100);
  expect(Math.abs(initialLayout.composerBottom - initialLayout.panelBottom)).toBeLessThan(2);
  await page.locator('#aiFeatureToggle').click();
  await expect(page.locator('#aiHelperContent')).toBeHidden();
  await expect(page.locator('#aiQuickSection')).toBeHidden();
  await expect(page.locator('.ai-suggestions')).toBeHidden();
  const collapsedMessagesHeight = await page.locator('#aiMessages').evaluate(element => element.getBoundingClientRect().height);
  expect(collapsedMessagesHeight).toBeGreaterThan(initialLayout.messagesHeight + 100);
  await page.locator('#aiFeatureToggle').click();
  await expect(page.locator('#aiHelperContent')).toBeVisible();
  await page.locator('[data-ai-suggestion-task="personalized_exercise"]').click();
  await expect(page.locator('#aiPrompt')).toHaveValue(/当前练习举一反三/);
  await expect(page.locator('[data-ai-task="personalized_exercise"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#aiMessages .ai-message')).toHaveCount(1);
  await page.setViewportSize({ width:837, height:609 });
  const shortViewport = await page.evaluate(() => {
    const panel = document.querySelector('.ai-panel').getBoundingClientRect();
    const messages = document.querySelector('#aiMessages').getBoundingClientRect();
    const composer = document.querySelector('#aiForm').getBoundingClientRect();
    return { messagesHeight:messages.height, composerBottom:composer.bottom, panelBottom:panel.bottom };
  });
  expect(shortViewport.messagesHeight).toBeGreaterThan(40);
  expect(Math.abs(shortViewport.composerBottom - shortViewport.panelBottom)).toBeLessThan(2);
  await page.locator('#aiFeatureToggle').click();
  const shortViewportCollapsedMessages = await page.locator('#aiMessages').evaluate(element => element.getBoundingClientRect().height);
  expect(shortViewportCollapsedMessages).toBeGreaterThan(shortViewport.messagesHeight + 100);
  expect(await page.locator('#aiForm').evaluate(element => {
    const panel = document.querySelector('.ai-panel').getBoundingClientRect();
    return Math.abs(element.getBoundingClientRect().bottom - panel.bottom) < 2;
  })).toBe(true);
  expect(errors).toEqual([]);
});

test('AI assistant supports level hints, SQL repair diffs, wrong-answer analysis, and personalized exercises', async ({ page }) => {
  const requests = [];
  await page.route('**/api/ai/chat', async route => {
    const payload = route.request().postDataJSON();
    requests.push(payload);
    let answer = '已收到请求。';
    if (payload.task === 'hint') answer = `AI HINT level ${payload.level}`;
    if (payload.task === 'repair_sql') answer = '发现排序结果缺少限制条件。\n```sql\nSELECT name, score\nFROM students\nORDER BY score DESC\nLIMIT 4;\n```';
    if (payload.task === 'wrong_analysis') answer = '建议优先复习排序与筛选。';
    if (payload.task === 'personalized_exercise') answer = JSON.stringify({ exercises: [{
      title: 'AI 练习：成绩前四名',
      topic: '查询排序',
      difficulty: '进阶',
      description: '查询成绩最高的四位学生。',
      hints: ['先确定要返回的字段。', '按成绩从高到低排序。', '最后限制结果为四行。'],
      sql: 'SELECT name, score FROM students ORDER BY score DESC LIMIT 4;'
    }] });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer }) });
  });
  const errors = await openApp(page);
  await page.locator('#aiAssistantBtn').click();

  await chooseAiQuick(page, 'hint');
  await page.locator('#aiSend').click();
  await expect(page.locator('#aiMessages')).toContainText('AI HINT level 1');
  await expect(page.getByRole('button', { name: '获取第 2 级提示' })).toBeVisible();
  await page.getByRole('button', { name: '获取第 2 级提示' }).click();
  await expect(page.locator('#aiMessages')).toContainText('AI HINT level 2');
  expect(requests.filter(request => request.task === 'hint').map(request => request.level)).toEqual([1, 2]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('querypad-ai-hint-progress'))['student-ranking'].level)).toBe(2);

  await page.locator('#aiClose').click();
  const failedSql = 'SELECT name, score FROM student_typo ORDER BY score DESC;';
  await page.locator('#sqlEditor').fill(failedSql);
  await page.locator('#runBtn').click();
  await expect.poll(() => page.evaluate(() => window.queryPadLastSqlError?.sql || '')).toBe(failedSql);
  await page.locator('#aiAssistantBtn').click();
  await chooseAiQuick(page, 'repair_sql');
  await page.locator('#aiSend').click();
  await expect(page.locator('#aiMessages')).toContainText('修改差异');
  const repairRequest = requests.find(request => request.task === 'repair_sql');
  expect(repairRequest.error).toBeTruthy();
  expect(repairRequest.schema.tables.find(table => table.name === 'students').fields.find(field => field.name === 'id').primaryKey).toBe(true);
  const repairButton = page.getByRole('button', { name: '替换为修正 SQL' }).last();
  await page.locator('#sqlEditor').fill('SELECT 1;');
  await repairButton.click();
  await expect(page.locator('#sqlEditor')).toHaveValue('SELECT 1;');
  await page.locator('#sqlEditor').fill(failedSql);
  await repairButton.click();
  await expect(page.locator('#sqlEditor')).toHaveValue('SELECT name, score\nFROM students\nORDER BY score DESC\nLIMIT 4;');
  expect(repairRequest.schema.tables.length).toBeGreaterThan(0);
  await page.locator('#sqlEditor').fill('SELECT name FROM students;');
  await chooseAiQuick(page, 'repair_sql');
  await page.locator('#aiSend').click();
  const unrelatedRepair = requests.filter(request => request.task === 'repair_sql').at(-1);
  expect(unrelatedRepair.error).toBe('');
  expect(unrelatedRepair.exercise.lastFeedback).toBe('');
  await page.locator('#sqlEditor').fill('SELECT name, score\nFROM students\nORDER BY score DESC\nLIMIT 4;');

  await page.locator('#aiClose').click();
  await page.locator('#runBtn').click();
  await expect(page.locator('#statusLabel')).toHaveText('练习通过');
  await page.locator('#sqlEditor').fill('SELECT id FROM students;');
  await page.locator('#runBtn').click();
  await expect(page.locator('#statusLabel')).toHaveText('未通过');
  await page.locator('#aiAssistantBtn').click();
  await chooseAiQuick(page, 'wrong_analysis');
  await page.locator('#aiSend').click();
  await expect(page.locator('#aiMessages')).toContainText('建议优先复习排序与筛选');
  const analysisRequest = requests.find(request => request.task === 'wrong_analysis');
  expect(analysisRequest.learning).toHaveProperty('mistakes');

  const exerciseCount = await page.evaluate(() => window.queryPadExerciseReferences().length);
  await chooseAiQuick(page, 'personalized_exercise');
  await page.locator('#aiSend').click();
  await expect(page.getByRole('button', { name: '保存为练习' })).toBeVisible();
  await page.getByRole('button', { name: '保存为练习' }).click();
  await expect(page.locator('#aiConnection')).toContainText('已保存 1 道 AI 练习');
  await expect.poll(() => page.evaluate(() => window.queryPadExerciseReferences().length)).toBe(exerciseCount + 1);
  await expect(page.locator('#sqlEditor')).toHaveValue('');
  const unsafeImport = await page.evaluate(() => window.queryPadImportAiExercises({ exercises: [{
    title: '不安全的 AI 练习', topic: 'SQL', difficulty: '进阶', description: '不应运行多语句。',
    hints: ['提示一', '提示二', '提示三'], sql: 'SELECT 1; DROP TABLE students;'
  }] }));
  expect(unsafeImport.saved).toBe(false);
  expect(await page.evaluate(() => window.queryPadEngine.execute('SELECT COUNT(*) FROM students').values[0][0])).toBe(120);
  await page.reload();
  await page.locator('#lessonBtn').click();
  await expect(page.locator('#exerciseList')).toContainText('AI 练习：成绩前四名');
  await expect(page.locator('#sqlEditor')).toHaveValue('');
  await page.locator('#exerciseClose').click();
  await page.setViewportSize({ width:390, height:844 });
  await page.locator('#aiAssistantBtn').click();
  await expect(page.locator('#aiFeatureToggle')).toContainText('收起功能');
  for (const task of ['hint', 'repair_sql', 'wrong_analysis', 'personalized_exercise', 'custom_chat']) {
    await expect(page.locator(`[data-ai-quick="${task}"]`)).toBeVisible();
  }
  expect(await page.locator('#aiModal .ai-panel').evaluate(panel => panel.scrollWidth <= panel.clientWidth)).toBe(true);
  expect(requests.find(request => request.task === 'personalized_exercise').schema.tables.length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('AI assistant supports custom database questions with the current context', async ({ page }) => {
  const requests = [];
  await page.route('**/api/ai/chat', async route => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ answer:'COUNT(*) 会统计符合查询条件的记录数量。' })
    });
  });
  const errors = await openApp(page);
  await page.locator('#aiAssistantBtn').click();
  await chooseAiQuick(page, 'custom_chat');
  await expect(page.locator('[data-ai-task="custom_chat"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#aiPrompt')).toHaveValue('');
  await expect(page.locator('#aiContextSummary')).toContainText('不发送聊天历史');
  await page.locator('#sqlEditor').fill('SELECT COUNT(*) FROM students;');
  await page.locator('#aiPrompt').fill('请解释当前 SQL 中 COUNT(*) 的作用');
  await page.locator('#aiSend').click();
  await expect(page.locator('#aiMessages')).toContainText('COUNT(*) 会统计');
  expect(requests).toHaveLength(1);
  expect(requests[0].task).toBe('custom_chat');
  expect(requests[0].prompt).toBe('请解释当前 SQL 中 COUNT(*) 的作用');
  expect(requests[0].sql).toBe('SELECT COUNT(*) FROM students;');
  expect(requests[0].schema.tables.map(table => table.name)).toContain('students');
  expect(requests[0].exercise).toMatchObject({ title:'找出成绩最高的 4 位同学', topic:'查询排序' });
  expect(requests[0]).not.toHaveProperty('history');
  expect(requests[0]).not.toHaveProperty('conversation');
  expect(requests[0]).not.toHaveProperty('learning');
  expect(errors).toEqual([]);
});

test('creates and exports a Chen-style conceptual ER diagram', async ({ page }) => {
  const errors = await openApp(page);
  await page.locator('#erNav').click();
  await page.locator('#conceptErBtn').click();
  const concept = page.locator('#erConceptCanvas');
  await expect(concept).toBeVisible();
  await expect(concept.locator('.er-concept-entity')).toHaveCount(3);
  await expect(concept.locator('.er-concept-attribute')).toHaveCount(11);
  await expect(concept.locator('.er-concept-relation')).toHaveCount(2);

  const exported = await page.evaluate(() => window.queryPadErSvg());
  expect(exported).toContain('<ellipse');
  expect(exported).toContain('enrollments');

  let promptValues = ['选课记录', 'N:1'];
  page.on('dialog', dialog => dialog.accept(promptValues.shift() || '关联'));
  await page.locator('[data-concept-tool="connect"]').click();
  await concept.locator('[data-concept-node="students"]').click();
  await concept.locator('[data-concept-node="courses"]').click();
  await expect(concept.locator('.er-concept-relation')).toHaveCount(3);
  await expect(concept.locator('.er-concept-relation').last()).toContainText('选课记录');
  promptValues = ['修读课程', 'N:N'];
  await concept.locator('.er-concept-relation').last().dblclick();
  await expect(concept.locator('.er-concept-relation').last()).toContainText('修读课程');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('querypad-schema')).relations.at(-1).cardinality)).toBe('N:N');
  await concept.locator('.er-concept-relation').last().click();
  await page.locator('[data-concept-tool="delete"]').click();
  await expect(concept.locator('.er-concept-relation')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('conceptual ER diagram provides zoom and entity/attribute editing controls', async ({ page }) => {
  const errors = await openApp(page);
  await page.locator('#erNav').click();
  await page.locator('#conceptErBtn').click();
  const concept = page.locator('#erConceptCanvas');

  const initialWidth = (await concept.boundingBox()).width;
  await page.locator('[data-concept-tool="zoom-in"]').click();
  await expect.poll(() => page.evaluate(() => Number(document.querySelector('#erConceptCanvas').dataset.scale))).toBeCloseTo(1.1);
  expect((await concept.boundingBox()).width).toBeGreaterThan(initialWidth);
  await page.locator('[data-concept-tool="zoom-out"]').click();
  await expect.poll(() => page.evaluate(() => Number(document.querySelector('#erConceptCanvas').dataset.scale))).toBeCloseTo(1);
  await concept.dispatchEvent('wheel', { deltaY: -100, ctrlKey: true });
  await expect.poll(() => page.evaluate(() => Number(document.querySelector('#erConceptCanvas').dataset.scale))).toBeCloseTo(1.1);
  await page.locator('[data-concept-tool="zoom-reset"]').click();
  await expect.poll(() => page.evaluate(() => Number(document.querySelector('#erConceptCanvas').dataset.scale))).toBeCloseTo(1);

  const attribute = concept.locator('[data-concept-entity="students"][data-concept-field-index="3"]');
  await attribute.click();
  await expect(attribute).toHaveClass(/is-selected/);
  await page.locator('[data-concept-tool="delete-attribute"]').click();
  await expect(concept.locator('[data-concept-entity="students"]')).toHaveCount(3);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('querypad-schema')).tables.find(table => table.name === 'students').fields.map(field => field.name))).not.toContain('major');

  await concept.locator('[data-concept-node="enrollments"]').click();
  await page.locator('[data-concept-tool="edit-table"]').click();
  await expect(page.locator('#designModal')).toHaveClass(/open/);
  await expect(page.locator('#designTablePicker [data-design-table="enrollments"]')).toHaveClass(/active/);
  await page.locator('#designClose').click();

  page.on('dialog', dialog => dialog.accept());
  await concept.locator('[data-concept-node="courses"]').click();
  await page.locator('[data-concept-tool="delete-entity"]').click();
  await expect(concept.locator('.er-concept-entity')).toHaveCount(2);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('querypad-schema')).tables.map(table => table.name))).not.toContain('courses');
  expect(errors).toEqual([]);
});

test('conceptual ER diagram supports drag-to-connect relationships', async ({ page }) => {
  const errors = await openApp(page);
  await page.locator('#erNav').click();
  await page.locator('#conceptErBtn').click();
  const concept = page.locator('#erConceptCanvas');
  for (let step = 0; step < 5; step += 1) await page.locator('[data-concept-tool="zoom-out"]').click();
  await page.locator('[data-concept-tool="connect"]').click();
  const source = await concept.locator('[data-concept-node="students"]').boundingBox();
  const targetLocator = concept.locator('[data-concept-node="courses"]');
  const target = await targetLocator.boundingBox();
  const promptValues = ['修读', '1:N'];
  page.on('dialog', dialog => dialog.accept(promptValues.shift() || '关联'));
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(concept.locator('.er-concept-relation')).toHaveCount(3);
  await expect(concept.locator('.er-concept-relation').last()).toContainText('修读');
  expect(errors).toEqual([]);
});

test('drags conceptual ER entities, updates attached attributes, and saves layout', async ({ page }) => {
  const errors = await openApp(page);
  await page.locator('#erNav').click();
  await page.locator('#conceptErBtn').click();

  const entity = page.locator('#erConceptCanvas [data-concept-node="students"]');
  const attribute = page.locator('#erConceptCanvas [data-concept-entity="students"]').first();
  const before = await page.evaluate(() => {
    const entity = document.querySelector('#erConceptCanvas [data-concept-node="students"]');
    const attribute = document.querySelector('#erConceptCanvas [data-concept-entity="students"]');
    return {
      entity: { x: parseFloat(entity.style.left), y: parseFloat(entity.style.top) },
      attribute: { x: parseFloat(attribute.style.left), y: parseFloat(attribute.style.top) }
    };
  });
  const box = await entity.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40, { steps: 5 });
  await page.mouse.up();

  const after = await page.evaluate(() => {
    const entity = document.querySelector('#erConceptCanvas [data-concept-node="students"]');
    const attribute = document.querySelector('#erConceptCanvas [data-concept-entity="students"]');
    const model = JSON.parse(localStorage.getItem('querypad-schema') || 'null');
    return {
      entity: { x: parseFloat(entity.style.left), y: parseFloat(entity.style.top) },
      attribute: { x: parseFloat(attribute.style.left), y: parseFloat(attribute.style.top) },
      saved: model && model.erConceptLayout && model.erConceptLayout.students
    };
  });
  expect(after.entity.x).toBeGreaterThan(before.entity.x + 40);
  expect(after.entity.y).toBeGreaterThan(before.entity.y + 20);
  expect(after.attribute.x - before.attribute.x).toBeCloseTo(after.entity.x - before.entity.x, 0);
  expect(after.attribute.y - before.attribute.y).toBeCloseTo(after.entity.y - before.entity.y, 0);
  expect(after.saved.x).toBe(after.entity.x);
  expect(after.saved.y).toBe(after.entity.y);
  await expect(attribute).toBeVisible();
  expect(errors).toEqual([]);
});

test('drags conceptual ER attributes and relationship diamonds and persists their positions', async ({ page }) => {
  const errors = await openApp(page);
  await page.locator('#erNav').click();
  await page.locator('#conceptErBtn').click();
  const concept = page.locator('#erConceptCanvas');
  const attribute = concept.locator('[data-concept-entity="students"][data-concept-field-index="1"]');
  const relation = concept.locator('[data-relation-index="0"]');
  const before = await page.evaluate(() => ({
    attribute: {
      x: parseFloat(document.querySelector('#erConceptCanvas [data-concept-entity="students"][data-concept-field-index="1"]').style.left),
      y: parseFloat(document.querySelector('#erConceptCanvas [data-concept-entity="students"][data-concept-field-index="1"]').style.top)
    },
    relation: {
      x: parseFloat(document.querySelector('#erConceptCanvas [data-relation-index="0"]').style.left),
      y: parseFloat(document.querySelector('#erConceptCanvas [data-relation-index="0"]').style.top)
    }
  }));

  for (const [locator, dx, dy] of [[attribute, 52, 36], [relation, -56, 48]]) {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 5 });
    await page.mouse.up();
  }

  const after = await page.evaluate(() => {
    const attribute = document.querySelector('#erConceptCanvas [data-concept-entity="students"][data-concept-field-index="1"]');
    const relation = document.querySelector('#erConceptCanvas [data-relation-index="0"]');
    const model = JSON.parse(localStorage.getItem('querypad-schema') || 'null');
    const attributeCenter = { x: parseFloat(attribute.style.left) + 56, y: parseFloat(attribute.style.top) + 22 };
    const relationCenter = { x: parseFloat(relation.style.left) + 47, y: parseFloat(relation.style.top) + 25 };
    const lines = Array.from(document.querySelectorAll('#erConceptCanvas .er-concept-lines line')).map(line => [
      [Number(line.getAttribute('x1')), Number(line.getAttribute('y1'))],
      [Number(line.getAttribute('x2')), Number(line.getAttribute('y2'))]
    ]);
    const hasEndpoint = point => lines.some(line => line.some(endpoint => Math.abs(endpoint[0] - point.x) < 0.1 && Math.abs(endpoint[1] - point.y) < 0.1));
    return {
      attribute: { x: parseFloat(attribute.style.left), y: parseFloat(attribute.style.top) },
      relation: { x: parseFloat(relation.style.left), y: parseFloat(relation.style.top) },
      attributeSaved: model.erConceptAttributeLayout,
      relationSaved: model.erConceptRelationLayout,
      attributeConnected: hasEndpoint(attributeCenter),
      relationConnected: hasEndpoint(relationCenter)
    };
  });

  expect(after.attribute.x).toBeGreaterThan(before.attribute.x + 30);
  expect(after.attribute.y).toBeGreaterThan(before.attribute.y + 20);
  expect(after.relation.x).toBeLessThan(before.relation.x - 35);
  expect(after.relation.y).toBeGreaterThan(before.relation.y + 25);
  expect(Object.keys(after.attributeSaved)).toHaveLength(1);
  expect(Object.keys(after.relationSaved)).toHaveLength(1);
  expect(after.attributeConnected).toBe(true);
  expect(after.relationConnected).toBe(true);

  await page.reload();
  await page.locator('#erNav').click();
  await page.locator('#conceptErBtn').click();
  await expect.poll(() => page.locator('#erConceptCanvas [data-concept-entity="students"][data-concept-field-index="1"]').evaluate(node => [parseFloat(node.style.left), parseFloat(node.style.top)])).toEqual([after.attribute.x, after.attribute.y]);
  await expect.poll(() => page.locator('#erConceptCanvas [data-relation-index="0"]').evaluate(node => [parseFloat(node.style.left), parseFloat(node.style.top)])).toEqual([after.relation.x, after.relation.y]);
  expect(errors).toEqual([]);
});

test('creates, switches, isolates, and restores projects across reloads', async ({ page }) => {
  const errors = await openApp(page);
  await page.locator('#sqlEditor').fill('CREATE TABLE browser_only (value INTEGER); INSERT INTO browser_only VALUES (17);');
  await page.locator('#runBtn').click();
  await expect(page.locator('#statusLabel')).toHaveClass(/success/);

  const isolated = await page.evaluate(async () => {
    await window.queryPadEngine.switchProject('browser-project');
    const empty = window.queryPadEngine.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='browser_only'").values;
    window.queryPadEngine.execute('CREATE TABLE browser_only (value INTEGER); INSERT INTO browser_only VALUES (17);');
    await window.queryPadEngine.switchProject('default');
    const restored = window.queryPadEngine.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='browser_only'").values;
    return { empty, restored };
  });
  expect(isolated.empty).toEqual([]);
  expect(isolated.restored).toEqual([]);

  const persisted = await page.evaluate(() => ({
    projectId: window.queryPadProjectId,
    projects: JSON.parse(localStorage.getItem('querypad-projects') || '[]').map(project => project.id)
  }));
  expect(persisted.projectId).toBe('default');
  expect(persisted.projects).toContain('default');
  expect(errors).toEqual([]);
});

test('escapes project names instead of rendering them as markup', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    const list = document.querySelector('#projectList');
    const name = '<img src=x onerror=window.__xss=1>';
    const row = document.createElement('button');
    row.className = 'project-item';
    row.textContent = name;
    list.replaceChildren(row);
    return { text: list.textContent, images: list.querySelectorAll('img').length, html: list.innerHTML };
  });
  expect(result.text).toContain('<img src=x onerror=window.__xss=1>');
  expect(result.images).toBe(0);
  expect(result.html).not.toContain('<img');
});

test('falls back to the built-in schema when browser-stored schema is invalid', async ({ page }) => {
  await page.addInitScript(() => {
    const invalid = { active:'missing_table', tables:[{ name:'broken', fields:[{ name:'id', type:'INT', pk:true, nullable:false }] }], relations:[] };
    localStorage.setItem('querypad-schema', JSON.stringify(invalid));
    localStorage.setItem('querypad-projects', JSON.stringify([{ id:'default', name:'损坏项目', updatedAt:1, schema:invalid }]));
    localStorage.setItem('querypad-active-project', 'default');
  });
  const errors = await openApp(page);
  const result = await page.evaluate(() => ({
    tables: window.queryPadGetAiSchema().tables.map(table => table.name).sort(),
    active: JSON.parse(localStorage.getItem('querypad-schema')).active,
    engineTables: window.queryPadEngine.inspectSchema().tables.map(table => table.name).sort()
  }));
  expect(result.tables).toEqual(['courses', 'enrollments', 'students']);
  expect(result.active).toBe('students');
  expect(result.engineTables).toEqual(['courses', 'enrollments', 'students']);
  expect(errors).toEqual([]);
});

test('renders OCR-provided ER names and fields as text', async ({ page }) => {
  const errors = await openApp(page);
  const result = await page.evaluate(() => {
    const name = '<img src=x onerror="window.__erXss=1">';
    const field = '<svg onload="window.__erXss=2">';
    window.renderRecognizedEr({ entities:[{ name, fields:[{ name:field, type:'<script>alert(1)</script>', pk:true }] }], relations:[] });
    return {
      images: document.querySelectorAll('#erCanvas img').length,
      scripts: document.querySelectorAll('#erCanvas script').length,
      text: document.querySelector('#erCanvas').textContent,
      executed: window.__erXss || null
    };
  });
  expect(result.images).toBe(0);
  expect(result.scripts).toBe(0);
  expect(result.text).toContain('<img src=x onerror="window.__erXss=1">');
  expect(result.text).toContain('<script>alert(1)</script>');
  expect(result.executed).toBeNull();
  expect(errors).toEqual([]);
});

test('rejects invalid project imports without changing the active project or database', async ({ page }) => {
  const errors = await openApp(page);
  await page.locator('#sqlEditor').fill('CREATE TABLE import_guard (value INTEGER); INSERT INTO import_guard VALUES (73);');
  await page.locator('#runBtn').click();
  await expect(page.locator('.table-list')).toContainText('import_guard');
  await page.locator('#toolsNav').click();
  const initial = await page.evaluate(() => ({
    id: window.queryPadProjectId,
    projects: JSON.parse(localStorage.getItem('querypad-projects') || '[]').length,
    value: window.queryPadEngine.execute('SELECT value FROM import_guard').values[0][0]
  }));
  const validExport = await page.evaluate(() => window.queryPadExportCurrentProject());
  const invalidSchema = structuredClone(validExport);
  invalidSchema.schema.tables[0].fields.push({ ...invalidSchema.schema.tables[0].fields[0] });
  await page.locator('#projectFile').setInputFiles({ name:'duplicate-fields.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(invalidSchema)) });
  await expect(page.locator('#toast')).toContainText('项目导入失败');
  const afterSchemaError = await page.evaluate(() => ({ id:window.queryPadProjectId, projects:JSON.parse(localStorage.getItem('querypad-projects') || '[]').length, value:window.queryPadEngine.execute('SELECT value FROM import_guard').values[0][0] }));
  expect(afterSchemaError).toEqual(initial);

  const invalidSnapshot = structuredClone(validExport);
  invalidSnapshot.sqliteSnapshot = Array.from({ length:20 }, (_, index) => index + 1);
  await page.locator('#projectFile').setInputFiles({ name:'corrupt-snapshot.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(invalidSnapshot)) });
  await expect(page.locator('#toast')).toContainText('项目导入失败');
  const afterSnapshotError = await page.evaluate(() => ({ id:window.queryPadProjectId, projects:JSON.parse(localStorage.getItem('querypad-projects') || '[]').length, value:window.queryPadEngine.execute('SELECT value FROM import_guard').values[0][0] }));
  expect(afterSnapshotError).toEqual(initial);
  expect(errors).toEqual([]);
});

test('keeps the current database usable when restoring a corrupt snapshot', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    const engine = window.queryPadEngine;
    const before = engine.execute('SELECT COUNT(*) AS total FROM students').values[0][0];
    let rejected = false;
    try { engine.restoreSnapshot(new Uint8Array([1, 2, 3, 4])); } catch (_) { rejected = true; }
    const after = engine.execute('SELECT COUNT(*) AS total FROM students').values[0][0];
    return { rejected, before, after };
  });
  expect(result).toEqual({ rejected: true, before: 120, after: 120 });
});

test('validates every SQL answer in the expanded exercise bank', async ({ page }) => {
  const errors = await openApp(page);
  const results = await page.evaluate(() => window.queryPadExerciseReferences().map(exercise => ({
    id: exercise.id,
    title: exercise.title,
    passed: window.queryPadValidateExercise(exercise.id, exercise.sql)
  })));
  expect(results.length).toBeGreaterThanOrEqual(70);
  expect(results.filter(result => !result.passed)).toEqual([]);
  await page.locator('#lessonBtn').click();
  await page.locator('[data-exercise-index="72"]').click();
  await page.locator('#completeSqlBtn').click();
  await page.locator('#runBtn').click();
  await expect(page.locator('#statusLabel')).toContainText('练习通过');
  expect(errors).toEqual([]);
});

test('syncs designed schemas and SQL-created tables while preserving rows and enforcing foreign keys', async ({ page }) => {
  const errors = await openApp(page);
  const initial = await page.evaluate(() => ({
    studentCount: window.queryPadEngine.execute('SELECT COUNT(*) FROM students').values[0][0],
    foreignKeys: window.queryPadEngine.execute('PRAGMA foreign_key_list(enrollments)').rowCount,
    foreignKeyViolations: window.queryPadEngine.execute('PRAGMA foreign_key_check').rowCount
  }));
  expect(initial).toEqual({ studentCount: 120, foreignKeys: 2, foreignKeyViolations: 0 });

  await page.locator('#sqlEditor').fill('CREATE TABLE audit_notes (id INTEGER PRIMARY KEY, note TEXT);');
  await page.locator('#runBtn').click();
  await expect(page.locator('.table-list')).toContainText('audit_notes');
  await page.locator('#databaseNav').click();
  await page.locator('#databaseDataTab').click();
  await expect(page.locator('#databaseDataView')).toContainText('audit_notes');
  await page.locator('#drawerClose').click();

  await page.locator('#toolsNav').click();
  await page.locator('#addFieldBtn').click();
  const newField = page.locator('[data-field-index="4"]');
  await newField.locator('[data-field-key="name"]').fill('nickname');
  await newField.locator('[data-field-key="type"]').selectOption({ label: 'TEXT' });
  await newField.locator('[data-field-key="defaultValue"]').fill('guest');
  await page.locator('#relationList [data-relation-index="0"] [data-relation-key="toColumn"]').selectOption('id');
  await page.locator('#runDesignSql').click();
  const migrated = await page.evaluate(() => ({
    count: window.queryPadEngine.execute('SELECT COUNT(*) FROM students').values[0][0],
    defaulted: window.queryPadEngine.execute("SELECT COUNT(*) FROM students WHERE nickname = 'guest'").values[0][0],
    fields: window.queryPadEngine.execute('PRAGMA table_info(students)').values.map(row => row[1]),
    foreignKeys: window.queryPadEngine.execute('PRAGMA foreign_key_list(enrollments)').rowCount
  }));
  expect(migrated.count).toBe(120);
  expect(migrated.defaulted).toBe(120);
  expect(migrated.fields).toContain('nickname');
  expect(migrated.foreignKeys).toBe(2);
  expect(errors).toEqual([]);
});

test('keeps SQL drafts separate per project and persists clearing query history', async ({ page }) => {
  const errors = await openApp(page);
  await page.locator('#sqlEditor').fill('SELECT 11 AS original_project;');
  await page.locator('#projectNav').click();
  await page.locator('#projectNameInput').fill('独立草稿项目');
  await page.locator('#createProjectBtn').click();
  await expect(page.locator('#sqlEditor')).toHaveValue('');
  await page.locator('#sqlEditor').fill('SELECT 22 AS other_project;');
  await page.locator('[data-project-id="default"]').click();
  await expect.poll(() => page.evaluate(() => window.queryPadProjectId)).toBe('default');
  await expect(page.locator('#sqlEditor')).toHaveValue('SELECT 11 AS original_project;');
  await page.locator('#clearHistory').click();
  await expect(page.locator('.history-item')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#runBtn')).toBeEnabled();
  await expect(page.locator('#sqlEditor')).toHaveValue('SELECT 11 AS original_project;');
  await expect(page.locator('.history-item')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('exports project snapshots and database reset clears IndexedDB snapshots', async ({ page }) => {
  await openApp(page);
  await page.locator('#sqlEditor').fill('CREATE TABLE reset_marker (value INT); INSERT INTO reset_marker VALUES (99);');
  await page.locator('#runBtn').click();
  await expect(page.locator('.table-list')).toContainText('reset_marker');
  await page.locator('#projectNav').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportCurrentProject').click();
  const download = await downloadPromise;
  const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  expect(exported.schema.tables.length).toBeGreaterThan(0);
  expect(exported.sqliteSnapshot.length).toBeGreaterThan(100);
  expect(exported.schema.tables.some(table => table.name === 'reset_marker')).toBe(true);

  page.on('dialog', dialog => dialog.accept());
  await Promise.all([page.waitForEvent('load'), page.locator('#resetAllLocalData').click()]);
  await expect(page.locator('#runBtn')).toBeEnabled();
  const persisted = await page.evaluate(async () => ({
    marker: window.queryPadEngine.execute("SELECT name FROM sqlite_master WHERE name='reset_marker'").values,
    projectCount: JSON.parse(localStorage.getItem('querypad-projects') || '[]').length,
    snapshotCount: await new Promise(resolve => {
      const request = indexedDB.open('querypad-sqlite');
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('snapshots')) { db.close(); resolve(0); return; }
        const count = db.transaction('snapshots', 'readonly').objectStore('snapshots').count();
        count.onsuccess = () => { db.close(); resolve(count.result); };
        count.onerror = () => { db.close(); resolve(-1); };
      };
      request.onerror = () => resolve(-1);
    })
  }));
  expect(persisted.marker).toEqual([]);
  expect(persisted.projectCount).toBe(1);
  expect(persisted.snapshotCount).toBe(1);

  await page.locator('#toolsNav').click();
  await page.locator('#projectFile').setInputFiles({ name:'saved-project.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(exported)) });
  await expect.poll(() => page.evaluate(() => window.queryPadEngine.execute('SELECT value FROM reset_marker').values[0]?.[0])).toBe(99);
  await expect(page.locator('.table-list')).toContainText('reset_marker');
});

test('exports a readable data dictionary and states the limits of structure checks', async ({ page }) => {
  await openApp(page);
  await page.locator('#toolsNav').click();
  await page.locator('#normalFormBtn').click();
  await expect(page.locator('#designReport')).toContainText('不足以判断 1NF、2NF、3NF');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#dictBtn').click();
  const dictionary = fs.readFileSync(await (await downloadPromise).path(), 'utf8');
  expect(dictionary).toContain('## students\n\n| 字段 | 类型');
  expect(dictionary).not.toContain('\\n');
});

test('offline execution toggle disables and restores SQL execution', async ({ page }) => {
  await openApp(page);
  await page.locator('#toolsNav').click();
  await page.locator('#engineEnabled').uncheck();
  await expect(page.locator('#runBtn')).toBeDisabled();
  await expect(page.locator('#runDesignSql')).toBeDisabled();
  await page.locator('#engineEnabled').check();
  await expect(page.locator('#runBtn')).toBeEnabled();
  await expect(page.locator('#runDesignSql')).toBeEnabled();
});

test('resets practice data and removes SQL-created temporary tables', async ({ page }) => {
  await openApp(page);
  await page.locator('#sqlEditor').fill('CREATE TABLE temporary_notes (note TEXT);');
  await page.locator('#runBtn').click();
  await expect(page.locator('.table-list')).toContainText('temporary_notes');
  page.on('dialog', dialog => dialog.accept());
  await page.locator('#projectNav').click();
  await page.locator('#resetPracticeData').click();
  await expect(page.locator('.table-list')).not.toContainText('temporary_notes');
  const state = await page.evaluate(() => ({
    students: window.queryPadEngine.execute('SELECT COUNT(*) FROM students').values[0][0],
    tempTable: window.queryPadEngine.execute("SELECT name FROM sqlite_master WHERE name='temporary_notes'").values,
    schema: JSON.parse(localStorage.getItem('querypad-schema')).tables.map(table => table.name)
  }));
  expect(state.students).toBe(120);
  expect(state.tempTable).toEqual([]);
  expect(state.schema).not.toContain('temporary_notes');
});

test('registers the service worker, then serves the app and WASM offline', async ({ page, context }) => {
  await openApp(page);
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state || '')).toBe('activated');
  await page.evaluate(() => new Promise(resolve => {
    if (navigator.serviceWorker.controller) return resolve();
    navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
    setTimeout(resolve, 5000);
  }));
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.locator('#runBtn')).toBeEnabled();
  await page.locator('#sqlEditor').fill('SELECT COUNT(*) AS total FROM students;');
  await page.locator('#runBtn').click();
  await expect(page.locator('#resultTable tbody')).toContainText('120');
});
