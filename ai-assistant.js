(function () {
  const endpoint = (typeof window.queryPadAiEndpoint === 'string' && window.queryPadAiEndpoint.trim()) || '/api/ai/chat';
  const taskNames = {
    design_review: '设计建议',
    explain_sql: '解释 SQL',
    generate_sql: '生成 SQL',
    diagnose_sql: 'SQL 错误诊断',
    hint: '分级提示',
    repair_sql: 'SQL 自动修正',
    wrong_analysis: '错题分析',
    personalized_exercise: '个性化出题·举一反三',
    custom_chat: '自定义对话'
  };
  const placeholders = {
    design_review: '例如：检查主键、外键和关系设计，并指出可能的规范化问题',
    explain_sql: '例如：说明这条查询如何关联表，以及每个子句的作用',
    generate_sql: '例如：生成查询每个学生已选课程数量的 SQL，并解释查询逻辑',
    diagnose_sql: '例如：说明报错原因，并给出修改建议',
    hint: 'AI 会根据当前题目和提示级别给出下一步思路',
    repair_sql: '说明你希望重点修正什么；也可以留空使用默认问题',
    wrong_analysis: '例如：优先分析反复答错的知识点，并给我复习建议',
    personalized_exercise: '例如：根据我的薄弱点生成一道进阶练习',
    custom_chat: '例如：用简单例子解释主键和外键的区别'
  };
  const modal = document.querySelector('#aiModal');
  const dialog = modal.querySelector('[role="dialog"]');
  const launcher = document.querySelector('#aiAssistantBtn');
  const closeButton = document.querySelector('#aiClose');
  const minimizeButton = document.querySelector('#aiMinimize');
  const form = document.querySelector('#aiForm');
  const promptInput = document.querySelector('#aiPrompt');
  const promptLabel = document.querySelector('#aiPromptLabel');
  const sendButton = document.querySelector('#aiSend');
  const messages = document.querySelector('#aiMessages');
  const contextSummary = document.querySelector('#aiContextSummary');
  const currentContext = document.querySelector('#aiCurrentContext');
  const connection = document.querySelector('#aiConnection');
  const clearChatButton = document.querySelector('#aiClearChat');
  const featureToggle = document.querySelector('#aiFeatureToggle');
  const featureSection = document.querySelector('#aiHelperContent');
  const launcherPositionKey = 'querypad-ai-launcher-position';
  const mobileLauncherPositionKey = `${launcherPositionKey}-mobile`;
  let currentTask = 'design_review';
  let conversationGeneration = 0;
  let activeRequestController = null;
  let dragState = null;
  let suppressLauncherClick = false;
  let launcherViewportIsMobile = window.innerWidth <= 740;

  function getLauncherPositionKey() {
    return window.innerWidth <= 740 ? mobileLauncherPositionKey : launcherPositionKey;
  }

  function clearLauncherPosition() {
    launcher.style.removeProperty('left');
    launcher.style.removeProperty('top');
    launcher.style.removeProperty('right');
    launcher.style.removeProperty('bottom');
    delete launcher.dataset.positioned;
  }

  function clampLauncherPosition(left, top) {
    const margin = 8;
    return {
      left: Math.max(margin, Math.min(window.innerWidth - launcher.offsetWidth - margin, left)),
      top: Math.max(margin, Math.min(window.innerHeight - launcher.offsetHeight - margin, top))
    };
  }

  function placeLauncher(left, top) {
    const position = clampLauncherPosition(left, top);
    launcher.style.left = `${position.left}px`;
    launcher.style.top = `${position.top}px`;
    launcher.style.right = 'auto';
    launcher.style.bottom = 'auto';
    launcher.dataset.positioned = 'true';
    return position;
  }

  function saveLauncherPosition(position) {
    try {
      window.localStorage.setItem(getLauncherPositionKey(), JSON.stringify(position));
    } catch (error) {
      console.warn('AI 助手悬浮按钮位置无法保存到浏览器', error);
    }
  }

  function restoreLauncherPosition() {
    try {
      const saved = window.localStorage.getItem(getLauncherPositionKey());
      if (!saved) return;
      const position = JSON.parse(saved);
      if (!Number.isFinite(position.left) || !Number.isFinite(position.top)) {
        throw new Error('保存的位置格式无效');
      }
      placeLauncher(position.left, position.top);
    } catch (error) {
      console.warn('AI 助手悬浮按钮位置无法恢复，继续使用默认位置', error);
    }
  }

  launcher.addEventListener('pointerdown', event => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const rect = launcher.getBoundingClientRect();
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
      moved: false
    };
    launcher.setPointerCapture(event.pointerId);
  });

  launcher.addEventListener('pointermove', event => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    if (!dragState.moved && Math.hypot(deltaX, deltaY) < 5) return;
    dragState.moved = true;
    launcher.classList.add('dragging');
    event.preventDefault();
    placeLauncher(dragState.left + deltaX, dragState.top + deltaY);
  });

  function finishLauncherDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    if (dragState.moved) {
      saveLauncherPosition({
        left: launcher.getBoundingClientRect().left,
        top: launcher.getBoundingClientRect().top
      });
      suppressLauncherClick = true;
      window.setTimeout(() => { suppressLauncherClick = false; }, 0);
    }
    launcher.classList.remove('dragging');
    dragState = null;
  }

  launcher.addEventListener('pointerup', finishLauncherDrag);
  launcher.addEventListener('pointercancel', finishLauncherDrag);
  launcher.addEventListener('click', event => {
    if (!suppressLauncherClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  window.addEventListener('resize', () => {
    const viewportIsMobile = window.innerWidth <= 740;
    if (viewportIsMobile !== launcherViewportIsMobile) {
      launcherViewportIsMobile = viewportIsMobile;
      clearLauncherPosition();
      restoreLauncherPosition();
      return;
    }
    if (launcher.dataset.positioned !== 'true') return;
    const position = placeLauncher(launcher.getBoundingClientRect().left, launcher.getBoundingClientRect().top);
    saveLauncherPosition(position);
  });

  function buildSchemaPayload(schema) {
    if (!schema || !Array.isArray(schema.tables) || !Array.isArray(schema.relations)) {
      throw new Error('无法读取当前表结构，请重新打开表设计器后再试');
    }
    return {
      tables: schema.tables.map(table => ({
        name: String(table.name || ''),
        fields: (Array.isArray(table.fields) ? table.fields : []).map(field => ({
          name: String(field.name || ''),
          type: String(field.type || ''),
          length: String(field.length || ''),
          primaryKey: Boolean(field.primaryKey || field.pk),
          nullable: field.nullable === undefined ? !(field.primaryKey || field.pk) : Boolean(field.nullable)
        }))
      })),
      relations: schema.relations.map(relation => ({
        fromTable: String(relation.fromTable || ''),
        fromColumn: String(relation.fromColumn || ''),
        toTable: String(relation.toTable || ''),
        toColumn: String(relation.toColumn || ''),
        cardinality: String(relation.cardinality || '')
      }))
    };
  }

  function buildPayload(task, prompt, sql, schema, sqlError, exercise, learning) {
    if (!Object.prototype.hasOwnProperty.call(taskNames, task)) throw new Error('请选择有效的助手任务');
    const question = String(prompt || (task === 'diagnose_sql'
      ? '请分析 SQL 执行错误，说明原因并给出修改建议；如果合适，请提供修正后的 SQL。'
      : task === 'repair_sql'
        ? '请根据当前题目和 SQLite 的执行结果修正这条 SQL，并说明修改点。'
        : task === 'wrong_analysis'
          ? '分析我目前的错题，指出优先复习的知识点和练习建议。'
          : task === 'personalized_exercise'
            ? '请根据我的薄弱知识点生成一道循序渐进、可在当前数据库中练习的新题。'
      : '')).trim();
    if (!question) throw new Error('请先输入你的问题');
    if (question.length > 4000) throw new Error('问题不能超过 4,000 字');

    const payload = { task, prompt: question };
    if (task === 'hint') {
      if (!exercise) throw new Error('无法读取当前练习，请重新选择题目后再试');
      const level = typeof window.queryPadGetAiHintLevel === 'function' ? window.queryPadGetAiHintLevel(exercise.id) : 1;
      if (level > 3) throw new Error('这道题的 AI 分级提示已全部查看；选择其他题目可重新开始提示。');
      const statement = String(sql || '').trim();
      if (statement.length > 8000) throw new Error('当前 SQL 超过 8,000 字，请缩短后再试');
      payload.level = level;
      payload.exercise = { ...exercise, lastFeedback: '', lastQuery: '' };
      payload.sql = statement;
    } else if (task === 'explain_sql' || task === 'diagnose_sql' || task === 'repair_sql') {
      const statement = String(sql || '').trim();
      if (!statement) throw new Error('SQL 编辑器目前为空，请先输入要解释的 SQL');
      if (statement.length > 8000) throw new Error('当前 SQL 超过 8,000 字，请缩短后再试');
      payload.sql = statement;
      if (task === 'repair_sql') {
        payload.schema = buildSchemaPayload(schema);
        const matchingMistake = exercise && Array.isArray(learning?.mistakes)
          ? learning.mistakes.find(item => item.id === exercise.id && String(item.lastQuery || '').trim() === statement)
          : null;
        payload.exercise = exercise ? { ...exercise, lastFeedback:'', lastQuery:'' } : null;
        const error = sqlError && String(sqlError.sql || '').trim() === statement ? String(sqlError.message || '') : '';
        payload.error = (error || matchingMistake?.lastError || '').slice(0, 1000);
      } else if (task === 'diagnose_sql') {
        const message = String(sqlError && sqlError.message || '').trim();
        if (!message) throw new Error('请先运行一条执行失败的 SQL，再进行错误诊断');
        if (String(sqlError.sql || '').trim() !== statement) throw new Error('当前 SQL 与最近的失败语句不同，请重新运行后再诊断');
        if (message.length > 1000) throw new Error('SQL 错误信息过长，无法进行诊断');
        payload.error = message;
        payload.schema = buildSchemaPayload(schema);
      }
    } else if (task === 'wrong_analysis') {
      if (!learning) throw new Error('无法读取本地错题记录，请刷新页面后重试');
      payload.learning = {
        ...learning,
        topicCounts: (learning.topicCounts || []).slice(0, 20),
        mistakes: (learning.mistakes || []).slice(0, 10).map(item => ({
          ...item,
          lastQuery: String(item.lastQuery || '').slice(0, 1200),
          lastError: String(item.lastError || '').slice(0, 500)
        }))
      };
      payload.exercise = exercise ? { ...exercise, lastFeedback:'', lastQuery:'' } : null;
    } else if (task === 'personalized_exercise') {
      if (!learning) throw new Error('无法读取本地学习记录，请刷新页面后重试');
      payload.learning = {
        ...learning,
        topicCounts: (learning.topicCounts || []).slice(0, 20),
        mistakes: (learning.mistakes || []).slice(0, 20).map(({ id, title, topic, difficulty, attempts, errorCategory }) => ({
          id: String(id || '').slice(0, 120),
          title: String(title || '').slice(0, 200),
          topic: String(topic || '').slice(0, 120),
          difficulty: String(difficulty || '').slice(0, 32),
          attempts: Number(attempts) || 0,
          errorCategory: String(errorCategory || '').slice(0, 120)
        }))
      };
      payload.schema = buildSchemaPayload(schema);
      payload.exercise = exercise ? { ...exercise, lastFeedback:'', lastQuery:'' } : null;
    } else if (task === 'custom_chat') {
      const statement = String(sql || '').trim();
      if (statement.length > 8000) throw new Error('当前 SQL 超过 8,000 字，请缩短后再试');
      payload.sql = statement;
      payload.schema = buildSchemaPayload(schema);
      payload.exercise = exercise ? {
        index: Number(exercise.index),
        total: Number(exercise.total),
        title: String(exercise.title || '').slice(0, 200),
        topic: String(exercise.topic || '').slice(0, 120),
        description: String(exercise.description || '').slice(0, 1000),
        difficulty: String(exercise.difficulty || '').slice(0, 32)
      } : null;
    } else {
      payload.schema = buildSchemaPayload(schema);
    }
    const serializedPayload = JSON.stringify(payload);
    const payloadBytes = new TextEncoder().encode(serializedPayload).length;
    if (payloadBytes > 60 * 1024) throw new Error('当前请求内容过大，请精简表结构或问题后再试');
    return payload;
  }

  window.queryPadBuildAiPayload = buildPayload;

  function setConnection(text, state) {
    connection.classList.toggle('error', state === 'error');
    connection.classList.toggle('ready', state === 'ready');
    connection.querySelector('span:last-child').textContent = text;
  }

  function currentSchema() {
    if (typeof window.queryPadGetAiSchema !== 'function') return null;
    return window.queryPadGetAiSchema();
  }

  function updateContextSummary() {
    const exercise = typeof window.queryPadGetAiExerciseContext === 'function'
      ? window.queryPadGetAiExerciseContext()
      : null;
    const error = window.queryPadLastSqlError;
    const sql = document.querySelector('#sqlEditor').value.trim();
    if (currentContext) {
      currentContext.textContent = exercise
        ? `✦ 当前练习 ${exercise.index}/${exercise.total} · ${exercise.title}`
        : '✦ SQL 工作台 · 正在读取练习';
      currentContext.title = exercise ? `${exercise.topic}：${exercise.description}` : '';
    }
    const diagnosticButton = document.querySelector('[data-ai-quick="diagnose_sql"]');
    if (diagnosticButton) diagnosticButton.disabled = !error || error.sql !== sql;
    const diagnosticHint = document.querySelector('#aiErrorQuickHint');
    if (diagnosticHint) diagnosticHint.textContent = error && error.sql === sql ? '分析最近一次错误' : '先运行失败语句';
    const hintButton = document.querySelector('[data-ai-quick="hint"]');
    if (hintButton && exercise && typeof window.queryPadGetAiHintLevel === 'function') hintButton.disabled = window.queryPadGetAiHintLevel(exercise.id) > 3;
    const repairButton = document.querySelector('[data-ai-quick="repair_sql"]');
    if (repairButton) repairButton.disabled = !sql;
    const repairHint = document.querySelector('#aiRepairQuickHint');
    if (repairHint) repairHint.textContent = error && error.sql === sql ? '修正最近一次错误' : sql ? '检查题目要求' : '先输入 SQL';

    if (currentTask === 'diagnose_sql') {
      contextSummary.textContent = error
        ? '诊断只发送失败的 SQL、错误文本和表结构；不发送练习数据行或对话历史。'
        : '请先运行一条执行失败的 SQL，再进行错误诊断。诊断仅发送 SQL、错误信息和表结构，不发送练习数据行或对话历史。';
      return;
    }
    if (currentTask === 'explain_sql') {
      contextSummary.textContent = sql
        ? `解释只发送当前 SQL（${sql.length} 字符）；不发送表结构、练习数据行或对话历史。`
        : 'SQL 编辑器为空。解释 SQL 时只会发送 SQL 文本和你的问题，不发送练习数据行或对话历史。';
      return;
    }
    if (currentTask === 'hint') {
      contextSummary.textContent = 'AI 分级提示会根据当前题目给出下一步思路；提示级别越高越接近解题结构，不会自动改写或执行 SQL。';
      return;
    }
    if (currentTask === 'repair_sql') {
      contextSummary.textContent = sql
        ? '自动修正会发送当前 SQL、最近错误或判题反馈、当前题目和表结构；修正结果只会在你确认后插入。'
        : 'SQL 编辑器为空，请先输入要修正的 SQL。';
      return;
    }
    if (currentTask === 'generate_sql') {
      contextSummary.textContent = '生成任务会发送表结构和你的问题；点击“本题提示”时，问题会包含当前练习标题和要求。不会发送练习数据行或对话历史。';
      return;
    }
    if (currentTask === 'wrong_analysis') {
      contextSummary.textContent = '错题分析只发送本地错题统计、失败 SQL 和错误反馈，不发送练习数据行或聊天历史。';
      return;
    }
    if (currentTask === 'personalized_exercise') {
      contextSummary.textContent = '个性化出题会发送学习统计和当前表结构，生成的练习需要先保存并检查后才会加入本地题库。';
      return;
    }
    if (currentTask === 'custom_chat') {
      contextSummary.textContent = '自定义对话会发送当前问题、当前 SQL（可为空）、练习要求和表结构；不发送聊天历史或数据库数据行。AI 提供建议，不会自动执行或替换 SQL。';
      return;
    }
    const schema = currentSchema();
    const tableCount = schema && Array.isArray(schema.tables) ? schema.tables.length : 0;
    const relationCount = schema && Array.isArray(schema.relations) ? schema.relations.length : 0;
    const fieldCount = schema && Array.isArray(schema.tables)
      ? schema.tables.reduce((total, table) => total + (Array.isArray(table.fields) ? table.fields.length : 0), 0)
      : 0;
    contextSummary.textContent = `本次只发送当前设计的 ${tableCount} 张表、${fieldCount} 个字段及 ${relationCount} 条关系；不发送练习数据行或对话历史。`;
  }

  function selectTask(task) {
    currentTask = task;
    document.querySelectorAll('[data-ai-task]').forEach(button => {
      const selected = button.dataset.aiTask === task;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    promptLabel.textContent = task === 'design_review'
      ? '描述你希望检查的设计'
      : task === 'explain_sql'
        ? '你希望了解 SQL 的哪些部分？'
        : task === 'diagnose_sql' || task === 'repair_sql'
          ? '补充说明（可选）'
          : task === 'hint'
            ? '描述你希望获得的提示方向'
            : task === 'wrong_analysis'
              ? '描述你希望重点分析的错题问题'
              : task === 'personalized_exercise'
                ? '描述你希望练习的方向'
                : task === 'custom_chat'
                  ? '输入你想和数据库学习助手讨论的问题'
                  : '描述你需要的 SQL';
    promptInput.placeholder = placeholders[task];
    updateContextSummary();
  }

  function appendInlineMarkdown(parent, text) {
    const tokens = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_)/g;
    let previousEnd = 0;
    let match;
    while ((match = tokens.exec(text))) {
      if (match.index > previousEnd) {
        parent.appendChild(document.createTextNode(text.slice(previousEnd, match.index)));
      }
      const token = match[0];
      const isCode = token.startsWith('`');
      const isBold = token.startsWith('**') || token.startsWith('__');
      const element = document.createElement(isCode ? 'code' : isBold ? 'strong' : 'em');
      const markerLength = isBold ? 2 : 1;
      element.textContent = token.slice(markerLength, token.length - markerLength);
      parent.appendChild(element);
      previousEnd = tokens.lastIndex;
    }
    if (previousEnd < text.length) {
      parent.appendChild(document.createTextNode(text.slice(previousEnd)));
    }
  }

  function renderMarkdown(text, container) {
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    let index = 0;
    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) {
        index += 1;
        continue;
      }

      const fence = line.match(/^\s*```(?:[\w+-]+)?\s*$/);
      if (fence) {
        const codeLines = [];
        index += 1;
        while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
          codeLines.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) index += 1;
        const pre = document.createElement('pre');
        pre.className = 'ai-code-block';
        const code = document.createElement('code');
        code.textContent = codeLines.join('\n');
        pre.appendChild(code);
        container.appendChild(pre);
        continue;
      }

      const heading = line.match(/^\s{0,3}(#{1,4})\s+(.+?)\s*#*\s*$/);
      if (heading) {
        const element = document.createElement(heading[1].length <= 2 ? 'h3' : 'h4');
        appendInlineMarkdown(element, heading[2]);
        container.appendChild(element);
        index += 1;
        continue;
      }

      if (/^\s{0,3}([-*_]\s*){3,}$/.test(line)) {
        container.appendChild(document.createElement('hr'));
        index += 1;
        continue;
      }

      const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
      const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
      if (unordered || ordered) {
        const list = document.createElement(ordered ? 'ol' : 'ul');
        while (index < lines.length) {
          const item = lines[index].match(ordered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-*+]\s+(.+)$/);
          if (!item) break;
          const listItem = document.createElement('li');
          appendInlineMarkdown(listItem, item[1]);
          list.appendChild(listItem);
          index += 1;
        }
        container.appendChild(list);
        continue;
      }

      const quote = line.match(/^\s*&gt;\s?(.*)$/) || line.match(/^\s*>\s?(.*)$/);
      if (quote) {
        const blockquote = document.createElement('blockquote');
        appendInlineMarkdown(blockquote, quote[1]);
        container.appendChild(blockquote);
        index += 1;
        continue;
      }

      const paragraph = document.createElement('p');
      while (index < lines.length && lines[index].trim()
        && !/^\s*```/.test(lines[index])
        && !/^\s{0,3}#{1,4}\s+/.test(lines[index])
        && !/^\s*[-*+]\s+/.test(lines[index])
        && !/^\s*\d+[.)]\s+/.test(lines[index])
        && !/^\s*>/.test(lines[index])
        && !/^\s*([-*_]\s*){3,}$/.test(lines[index])) {
        if (paragraph.childNodes.length) paragraph.appendChild(document.createElement('br'));
        appendInlineMarkdown(paragraph, lines[index]);
        index += 1;
      }
      container.appendChild(paragraph);
    }
  }

  function extractSqlBlock(text) {
    const match = String(text || '').match(/```(?:sql)?\s*([\s\S]*?)```/i);
    return match ? match[1].trim() : '';
  }

  function extractExercisePlan(text) {
    const source = String(text || '').trim();
    const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
    for (const candidate of [fenced ? fenced[1].trim() : '', source]) {
      if (!candidate) continue;
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && (Array.isArray(parsed.exercises) || parsed.title)) return parsed;
      } catch (_) {}
    }
    return null;
  }

  function renderSqlDiff(original, proposed, container) {
    const before = String(original || '').trim().split(/\r?\n/);
    const after = String(proposed || '').trim().split(/\r?\n/);
    const maxCells = 250000;
    if (before.length * after.length > maxCells) {
      const fallback = document.createElement('p');
      fallback.className = 'ai-diff-empty';
      fallback.textContent = 'SQL 较长，暂不展开逐行差异；请使用复制或插入按钮检查修改。';
      container.appendChild(fallback);
      return;
    }
    const table = Array.from({ length: before.length + 1 }, () => Array(after.length + 1).fill(0));
    for (let row = before.length - 1; row >= 0; row -= 1) {
      for (let column = after.length - 1; column >= 0; column -= 1) {
        table[row][column] = before[row] === after[column]
          ? table[row + 1][column + 1] + 1
          : Math.max(table[row + 1][column], table[row][column + 1]);
      }
    }
    const diff = document.createElement('div');
    diff.className = 'ai-sql-diff';
    let row = 0;
    let column = 0;
    while (row < before.length || column < after.length) {
      const line = document.createElement('span');
      line.className = 'ai-sql-diff-line';
      if (row < before.length && column < after.length && before[row] === after[column]) {
        line.classList.add('context');
        line.textContent = `  ${before[row]}`;
        row += 1;
        column += 1;
      } else if (column < after.length && (row === before.length || table[row][column + 1] >= table[row + 1][column])) {
        line.classList.add('added');
        line.textContent = `+ ${after[column]}`;
        column += 1;
      } else {
        line.classList.add('removed');
        line.textContent = `- ${before[row]}`;
        row += 1;
      }
      diff.appendChild(line);
    }
    container.appendChild(diff);
  }

  function appendMessage(role, text, response, taskOverride, sourceSql, workflowExercise) {
    const responseTask = taskOverride || currentTask;
    const article = document.createElement('article');
    article.className = `ai-message ${role}`;
    const heading = document.createElement('strong');
    heading.textContent = role === 'user' ? '你' : '助手';
    const content = document.createElement(role === 'assistant' ? 'div' : 'p');
    const parsedExercisePlan = response && responseTask === 'personalized_exercise' ? extractExercisePlan(text) : null;
    const exercisePlan = parsedExercisePlan
      && Array.isArray(parsedExercisePlan.exercises)
      && parsedExercisePlan.exercises.length >= 1
      && parsedExercisePlan.exercises.length <= 3
      && parsedExercisePlan.exercises.every(exercise => exercise && typeof exercise === 'object' && !Array.isArray(exercise))
      ? parsedExercisePlan
      : null;
    if (role === 'assistant' && response) {
      content.className = 'ai-message-content';
      if (exercisePlan && Array.isArray(exercisePlan.exercises)) {
        const intro = document.createElement('p');
        intro.textContent = `已生成 ${exercisePlan.exercises.length} 道个性化练习。确认后可保存到本地题库。`;
        content.appendChild(intro);
        exercisePlan.exercises.forEach((exercise, index) => {
          const title = document.createElement('h4');
          title.textContent = `${index + 1}. ${String(exercise.title || '未命名练习')}`;
          const details = document.createElement('p');
          details.textContent = `${exercise.topic || 'SQL'} · ${exercise.difficulty || '基础'}：${exercise.description || ''}`;
          content.append(title, details);
        });
      } else {
        renderMarkdown(text, content);
      }
    } else {
      content.textContent = text;
    }
    article.append(heading, content);
    if (role === 'assistant' && response) {
      const actions = document.createElement('div');
      actions.className = 'ai-message-actions';
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.textContent = '复制回答';
      copy.addEventListener('click', async () => {
        try {
          const plainText = content.innerText || content.textContent || text;
          await navigator.clipboard.writeText(plainText.trim());
          setConnection('已复制回答。', 'ready');
        } catch (error) {
          setConnection(`复制失败：${error.message || '浏览器未授予剪贴板权限'}`, 'error');
        }
      });
      actions.appendChild(copy);
      const sql = extractSqlBlock(text);
      if (responseTask === 'repair_sql' && sql) {
        const diffHeading = document.createElement('strong');
        diffHeading.className = 'ai-diff-heading';
        diffHeading.textContent = '修改差异';
        article.appendChild(diffHeading);
        renderSqlDiff(sourceSql, sql, article);
      }
      if (responseTask === 'generate_sql' || responseTask === 'repair_sql' || (responseTask === 'diagnose_sql' && sql)) {
        const insert = document.createElement('button');
        insert.type = 'button';
        insert.textContent = responseTask === 'repair_sql' ? '替换为修正 SQL' : responseTask === 'diagnose_sql' ? '插入修正 SQL' : '插入 SQL 编辑器';
        insert.addEventListener('click', () => {
          const editor = document.querySelector('#sqlEditor');
          if (responseTask === 'repair_sql') {
            if (editor.value.trim() !== String(sourceSql || '').trim()) {
              setConnection('编辑器内容已变化，未覆盖当前 SQL。请重新发起修正后再试。', 'error');
              return;
            }
            editor.value = sql;
            editor.setSelectionRange(sql.length, sql.length);
          } else {
            editor.setRangeText(sql, editor.selectionStart, editor.selectionEnd, 'end');
          }
          editor.dispatchEvent(new Event('input', { bubbles:true }));
          editor.focus();
          setConnection('SQL 已插入编辑器；请检查后再运行。', 'ready');
        });
        actions.appendChild(insert);
      }
      if (responseTask === 'personalized_exercise') {
        const saveExercise = document.createElement('button');
        saveExercise.type = 'button';
        saveExercise.textContent = '保存为练习';
        saveExercise.disabled = !exercisePlan;
        saveExercise.addEventListener('click', () => {
          if (typeof window.queryPadImportAiExercises !== 'function') {
            setConnection('当前页面还未准备好题库，请刷新后重试。', 'error');
            return;
          }
          const result = window.queryPadImportAiExercises(exercisePlan || text);
          setConnection(result.message, result.saved ? 'ready' : 'error');
          if (result.saved) {
            saveExercise.disabled = true;
            saveExercise.textContent = '已保存到练习题库';
          }
        });
        actions.appendChild(saveExercise);
      }
      if (responseTask === 'hint' && workflowExercise && Number(workflowExercise.level) < 3) {
        const nextHint = document.createElement('button');
        nextHint.type = 'button';
        nextHint.textContent = `获取第 ${Number(workflowExercise.level) + 1} 级提示`;
        nextHint.addEventListener('click', () => {
          const activeExercise = typeof window.queryPadGetAiExerciseContext === 'function' ? window.queryPadGetAiExerciseContext() : null;
          if (activeExercise?.id !== workflowExercise.id) {
            setConnection('当前题目已切换，请为新题重新开始分级提示。', 'error');
            return;
          }
          selectTask('hint');
          promptInput.value = `请只给我当前题目的第 ${Number(workflowExercise.level) + 1} 级提示，不要重复前面的提示，也不要直接给出完整 SQL。`;
          form.requestSubmit();
        });
        actions.appendChild(nextHint);
      }
      article.appendChild(actions);
    }
    messages.appendChild(article);
    messages.scrollTop = messages.scrollHeight;
    return article;
  }

  function createStreamingMessage() {
    const article = document.createElement('article');
    article.className = 'ai-message assistant';
    const heading = document.createElement('strong');
    heading.textContent = '助手';
    const content = document.createElement('div');
    content.className = 'ai-message-content ai-streaming';
    content.textContent = '正在生成…';
    article.append(heading, content);
    messages.appendChild(article);
    messages.scrollTop = messages.scrollHeight;
    return { article, content };
  }

  async function readEventStream(response, onDelta) {
    if (!response.body || typeof response.body.getReader !== 'function') {
      throw new Error('浏览器无法读取模型的流式响应');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let dataLines = [];
    let answer = '';
    let finished = false;

    function dispatchEvent() {
      if (!dataLines.length) return;
      const data = dataLines.join('\n');
      dataLines = [];
      if (data === '[DONE]') {
        finished = true;
        return;
      }
      let event;
      try { event = JSON.parse(data); }
      catch (_) { throw new Error('模型流式响应格式无效'); }
      if (event.error) throw new Error(event.error.message || '模型生成失败');
      const delta = event.choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta) {
        answer += delta;
        onDelta(delta, answer);
      }
      if (event.choices?.[0]?.finish_reason) finished = true;
    }

    function processLine(line) {
      const normalized = line.endsWith('\r') ? line.slice(0, -1) : line;
      if (!normalized) {
        dispatchEvent();
      } else if (normalized.startsWith('data:')) {
        dataLines.push(normalized.slice(5).replace(/^ /, ''));
      }
    }

    try {
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        let newline = buffer.indexOf('\n');
        while (newline >= 0) {
          processLine(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf('\n');
        }
        if (done) break;
      }
      if (buffer) processLine(buffer);
      dispatchEvent();
      if (!answer.trim()) throw new Error(finished ? '模型返回了空回答' : '模型流式响应中没有回答内容');
      if (!finished) throw new Error('模型回答未完整生成，请重试');
      return answer.trim();
    } finally {
      reader.releaseLock();
    }
  }

  function openAssistant() {
    updateContextSummary();
    modal.classList.remove('minimized');
    dialog.setAttribute('aria-modal', 'true');
    minimizeButton.textContent = '收起';
    minimizeButton.setAttribute('aria-expanded', 'true');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    launcher.setAttribute('aria-expanded', 'true');
    promptInput.focus();
  }

  function closeAssistant() {
    modal.classList.remove('open');
    modal.classList.remove('minimized');
    modal.setAttribute('aria-hidden', 'true');
    dialog.setAttribute('aria-modal', 'false');
    launcher.setAttribute('aria-expanded', 'false');
    minimizeButton.setAttribute('aria-expanded', 'false');
    launcher.focus();
  }

  function toggleMinimized() {
    const minimized = modal.classList.toggle('minimized');
    minimizeButton.textContent = minimized ? '展开' : '收起';
    minimizeButton.setAttribute('aria-expanded', String(!minimized));
    dialog.setAttribute('aria-modal', String(!minimized));
    updateContextSummary();
  }

  function clearConversation() {
    conversationGeneration += 1;
    if (activeRequestController) {
      activeRequestController.abort();
      activeRequestController = null;
    }
    sendButton.disabled = false;
    sendButton.textContent = '发送';
    const welcome = document.createElement('article');
    welcome.className = 'ai-message assistant ai-welcome';
    const heading = document.createElement('strong');
    heading.textContent = '学习助手';
    const text = document.createElement('p');
    text.textContent = '对话已清空。可以选择辅导功能，或直接输入你想问的问题。';
    welcome.append(heading, text);
    messages.replaceChildren(welcome);
    promptInput.value = '';
    setConnection('已清空本页对话；对话历史本来就不会发送给模型。', '');
  }

  function useQuickPrompt(task) {
    const exercise = typeof window.queryPadGetAiExerciseContext === 'function'
      ? window.queryPadGetAiExerciseContext()
      : null;
    selectTask(task);
    if (task === 'hint') {
      promptInput.value = '请只给我当前题目的下一步提示，不要直接给出完整 SQL。';
    } else if (task === 'explain_sql') {
      promptInput.value = '请用初学者能理解的方式逐句解释当前 SQL 的执行逻辑，并指出关键字的作用。';
    } else if (task === 'diagnose_sql') {
      promptInput.value = '请解释这次报错的根因，给出逐步修正思路；如果合适，请提供修正后的 SQL。';
    } else if (task === 'repair_sql') {
      promptInput.value = '请检查当前 SQL 是否满足题目要求；如果有执行错误或判题反馈，请说明修改点并给出修正后的 SQL。';
    } else if (task === 'generate_sql') {
      const exerciseDescription = exercise
        ? `当前练习是“${exercise.title}”：${exercise.description}`
        : '请根据当前练习内容';
      promptInput.value = `${exerciseDescription}。先给一个循序渐进的提示，再提供可检查的参考 SQL，并指出容易出错的地方。`;
    } else if (task === 'wrong_analysis') {
      promptInput.value = '请分析我的错题模式，按优先级列出需要复习的知识点，并给出下一步练习建议。';
    } else if (task === 'personalized_exercise') {
      promptInput.value = '请根据当前练习举一反三，生成一道相似但条件不同的 SQL 练习，并附上分级提示和参考 SQL。';
    } else if (task === 'custom_chat') {
      promptInput.value = '';
    } else {
      promptInput.value = '请检查当前表结构的主键、字段设计和表关系，给出优点、风险和改进建议。';
    }
    updateContextSummary();
    promptInput.focus();
  }

  launcher.addEventListener('click', openAssistant);
  restoreLauncherPosition();
  closeButton.addEventListener('click', closeAssistant);
  minimizeButton.addEventListener('click', toggleMinimized);
  clearChatButton.addEventListener('click', clearConversation);
  featureToggle.addEventListener('click', () => {
    featureSection.hidden = !featureSection.hidden;
    featureToggle.setAttribute('aria-expanded', String(!featureSection.hidden));
    featureToggle.textContent = featureSection.hidden ? '展开功能⌄' : '收起功能⌃';
    featureToggle.setAttribute('aria-label', featureSection.hidden ? '展开功能和示例问题' : '收起功能和示例问题');
  });
  document.querySelectorAll('[data-ai-suggestion-task]').forEach(button => {
    button.addEventListener('click', () => {
      selectTask(button.dataset.aiSuggestionTask);
      promptInput.value = button.dataset.aiSuggestionText || '';
      promptInput.focus();
      updateContextSummary();
    });
  });
  document.querySelector('#aiHintBtn')?.addEventListener('click', () => {
    document.querySelector('#aiAssistantBtn').click();
    useQuickPrompt('hint');
  });
  document.querySelectorAll('[data-ai-quick]').forEach(button => {
    button.addEventListener('click', () => {
      if (button.disabled) return;
      useQuickPrompt(button.dataset.aiQuick);
    });
  });
  modal.addEventListener('click', event => {
    if (event.target === modal) closeAssistant();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && modal.classList.contains('open')) closeAssistant();
  });
  document.querySelector('#sqlEditor').addEventListener('input', () => {
    if (!modal.classList.contains('open')) return;
    window.setTimeout(() => {
      if (modal.classList.contains('open')) updateContextSummary();
    }, 0);
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    let payload;
    try {
      const exercise = typeof window.queryPadGetAiExerciseContext === 'function' ? window.queryPadGetAiExerciseContext() : null;
      const learning = typeof window.queryPadGetAiLearningContext === 'function' ? window.queryPadGetAiLearningContext() : null;
      payload = buildPayload(
        currentTask,
        promptInput.value,
        document.querySelector('#sqlEditor').value,
        currentSchema(),
        window.queryPadLastSqlError,
        exercise,
        learning
      );
      updateContextSummary();
    } catch (error) {
      setConnection(error.message, 'error');
      return;
    }

    appendMessage('user', payload.prompt);
    promptInput.value = '';
    sendButton.disabled = true;
    sendButton.textContent = '发送中…';
    setConnection('正在连接模型服务…', '');
    const requestGeneration = conversationGeneration;
    const controller = new AbortController();
    activeRequestController = controller;
    const timeout = window.setTimeout(() => controller.abort(), 60000);
    let streamingMessage = null;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream, application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      if (!response.ok) {
        const bodyText = await response.text();
        let body;
        try { body = bodyText ? JSON.parse(bodyText) : {}; }
        catch (_) { body = {}; }
        const detail = typeof body.error === 'string' ? body.error.slice(0, 300) : `HTTP ${response.status}`;
        throw new Error(`模型服务请求失败：${detail}`);
      }

      let answer;
      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        streamingMessage = createStreamingMessage();
        answer = await readEventStream(response, (_delta, accumulated) => {
          if (requestGeneration !== conversationGeneration) return;
          streamingMessage.content.textContent = accumulated;
          messages.scrollTop = messages.scrollHeight;
        });
      } else {
        const bodyText = await response.text();
        let body;
        try { body = bodyText ? JSON.parse(bodyText) : {}; }
        catch (_) { throw new Error(`AI 接口返回了无法识别的内容（HTTP ${response.status}）`); }
        if (!body || typeof body.answer !== 'string' || !body.answer.trim()) {
          throw new Error('AI 接口响应缺少有效的 answer 文本');
        }
        answer = body.answer;
      }
      if (requestGeneration === conversationGeneration) {
        let hintProgressSaved = true;
        if (payload.task === 'hint' && typeof window.queryPadAdvanceAiHint === 'function') {
          hintProgressSaved = window.queryPadAdvanceAiHint(payload.level, payload.exercise?.id, answer) !== false;
          updateContextSummary();
        }
        appendMessage('assistant', answer, true, payload.task, payload.sql,
          payload.task === 'hint' && hintProgressSaved ? { id:payload.exercise?.id, level:payload.level } : null);
        streamingMessage?.article.remove();
        setConnection(hintProgressSaved
          ? '回答完成。请核对 AI 建议和生成内容。'
          : '提示已生成，但本地进度未能保存；当前页面关闭后可能无法恢复。', hintProgressSaved ? 'ready' : 'error');
      }
    } catch (error) {
      if (requestGeneration !== conversationGeneration) return;
      const message = error.name === 'AbortError'
        ? '请求超时，请检查模型服务后重试。'
        : error instanceof TypeError
          ? `无法连接 ${endpoint}。请通过 HTTP(S) 运行应用，并先部署后端代理接口。`
          : error.message;
      if (streamingMessage && streamingMessage.article.isConnected) {
        streamingMessage.content.replaceChildren();
        streamingMessage.content.textContent = `请求未完成：${message}`;
        streamingMessage.article.classList.add('error');
      } else {
        appendMessage('assistant', `请求未完成：${message}`);
      }
      setConnection(message, 'error');
    } finally {
      window.clearTimeout(timeout);
      if (requestGeneration === conversationGeneration) {
        activeRequestController = null;
        sendButton.disabled = false;
        sendButton.textContent = '发送';
      }
    }
  });

  selectTask(currentTask);
})();
