(function () {
  const endpoint = '/api/ai/chat';
  const taskNames = {
    design_review: '设计建议',
    explain_sql: '解释 SQL',
    generate_sql: '生成 SQL',
    diagnose_sql: 'SQL 错误诊断'
  };
  const placeholders = {
    design_review: '例如：检查主键、外键和关系设计，并指出可能的规范化问题',
    explain_sql: '例如：说明这条查询如何关联表，以及每个子句的作用',
    generate_sql: '例如：生成查询每个学生已选课程数量的 SQL，并解释查询逻辑',
    diagnose_sql: '例如：说明报错原因，并给出修改建议'
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
          primaryKey: Boolean(field.primaryKey),
          nullable: Boolean(field.nullable)
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

  function buildPayload(task, prompt, sql, schema, sqlError) {
    if (!Object.prototype.hasOwnProperty.call(taskNames, task)) throw new Error('请选择有效的助手任务');
    const question = String(prompt || (task === 'diagnose_sql'
      ? '请分析 SQL 执行错误，说明原因并给出修改建议；如果合适，请提供修正后的 SQL。'
      : '')).trim();
    if (!question) throw new Error('请先输入你的问题');
    if (question.length > 4000) throw new Error('问题不能超过 4,000 字');

    const payload = { task, prompt: question };
    if (task === 'explain_sql' || task === 'diagnose_sql') {
      const statement = String(sql || '').trim();
      if (!statement) throw new Error('SQL 编辑器目前为空，请先输入要解释的 SQL');
      if (statement.length > 8000) throw new Error('当前 SQL 超过 8,000 字，请缩短后再试');
      payload.sql = statement;
      if (task === 'diagnose_sql') {
        const message = String(sqlError && sqlError.message || '').trim();
        if (!message) throw new Error('请先运行一条执行失败的 SQL，再进行错误诊断');
        if (String(sqlError.sql || '').trim() !== statement) throw new Error('当前 SQL 与最近的失败语句不同，请重新运行后再诊断');
        if (message.length > 1000) throw new Error('SQL 错误信息过长，无法进行诊断');
        payload.error = message;
        payload.schema = buildSchemaPayload(schema);
      }
    } else {
      payload.schema = buildSchemaPayload(schema);
    }
    if (JSON.stringify(payload).length > 64000) throw new Error('当前请求内容过大，请精简表结构或问题后再试');
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
    if (currentTask === 'generate_sql') {
      contextSummary.textContent = '生成任务会发送表结构和你的问题；点击“本题提示”时，问题会包含当前练习标题和要求。不会发送练习数据行或对话历史。';
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
        : task === 'diagnose_sql'
          ? '补充说明（可选）'
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

  function appendMessage(role, text, response) {
    const responseTask = currentTask;
    const article = document.createElement('article');
    article.className = `ai-message ${role}`;
    const heading = document.createElement('strong');
    heading.textContent = role === 'user' ? '你' : '助手';
    const content = document.createElement(role === 'assistant' ? 'div' : 'p');
    if (role === 'assistant' && response) {
      content.className = 'ai-message-content';
      renderMarkdown(text, content);
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
      const sqlCodeBlock = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
      if (responseTask === 'generate_sql' || (responseTask === 'diagnose_sql' && sqlCodeBlock)) {
        const insert = document.createElement('button');
        insert.type = 'button';
        insert.textContent = responseTask === 'diagnose_sql' ? '插入修正 SQL' : '插入 SQL 编辑器';
        insert.addEventListener('click', () => {
          const sql = (sqlCodeBlock ? sqlCodeBlock[1] : text).trim();
          const editor = document.querySelector('#sqlEditor');
          editor.setRangeText(sql, editor.selectionStart, editor.selectionEnd, 'end');
          editor.dispatchEvent(new Event('input', { bubbles:true }));
          editor.focus();
          setConnection('SQL 已插入编辑器；请检查后再运行。', 'ready');
        });
        actions.appendChild(insert);
      }
      article.appendChild(actions);
    }
    messages.appendChild(article);
    messages.scrollTop = messages.scrollHeight;
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
    text.textContent = '对话已清空。选择上方快捷功能，或输入你想问的问题。';
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
    if (task === 'explain_sql') {
      promptInput.value = '请用初学者能理解的方式逐句解释当前 SQL 的执行逻辑，并指出关键字的作用。';
    } else if (task === 'diagnose_sql') {
      promptInput.value = '请解释这次报错的根因，给出逐步修正思路；如果合适，请提供修正后的 SQL。';
    } else if (task === 'generate_sql') {
      const exerciseDescription = exercise
        ? `当前练习是“${exercise.title}”：${exercise.description}`
        : '请根据当前练习内容';
      promptInput.value = `${exerciseDescription}。先给一个循序渐进的提示，再提供可检查的参考 SQL，并指出容易出错的地方。`;
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
  document.querySelectorAll('[data-ai-task]').forEach(button => {
    button.addEventListener('click', () => selectTask(button.dataset.aiTask));
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
      payload = buildPayload(
        currentTask,
        promptInput.value,
        document.querySelector('#sqlEditor').value,
        currentSchema(),
        window.queryPadLastSqlError
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
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const bodyText = await response.text();
      let body;
      try { body = bodyText ? JSON.parse(bodyText) : {}; }
      catch (_) { throw new Error(`AI 接口返回了无法识别的内容（HTTP ${response.status}）`); }
      if (!response.ok) {
        const detail = typeof body.error === 'string' ? body.error.slice(0, 300) : `HTTP ${response.status}`;
        throw new Error(`模型服务请求失败：${detail}`);
      }
      if (!body || typeof body.answer !== 'string' || !body.answer.trim()) {
        throw new Error('AI 接口响应缺少有效的 answer 文本');
      }
      if (requestGeneration === conversationGeneration) {
        appendMessage('assistant', body.answer, true);
        setConnection('模型服务已响应。请核对 AI 建议和生成内容。', 'ready');
      }
    } catch (error) {
      if (requestGeneration !== conversationGeneration) return;
      const message = error.name === 'AbortError'
        ? '请求超时，请检查模型服务后重试。'
        : error instanceof TypeError
          ? `无法连接 ${endpoint}。请通过 HTTP(S) 运行应用，并先部署后端代理接口。`
          : error.message;
      appendMessage('assistant', `请求未完成：${message}`);
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
