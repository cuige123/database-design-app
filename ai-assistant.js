(function () {
  const endpoint = '/api/ai/chat';
  const taskNames = {
    design_review: '设计建议',
    explain_sql: '解释 SQL',
    generate_sql: '生成 SQL'
  };
  const placeholders = {
    design_review: '例如：检查主键、外键和关系设计，并指出可能的规范化问题',
    explain_sql: '例如：说明这条查询如何关联表，以及每个子句的作用',
    generate_sql: '例如：生成查询每个学生已选课程数量的 SQL，并解释查询逻辑'
  };
  const modal = document.querySelector('#aiModal');
  const launcher = document.querySelector('#aiAssistantBtn');
  const closeButton = document.querySelector('#aiClose');
  const form = document.querySelector('#aiForm');
  const promptInput = document.querySelector('#aiPrompt');
  const promptLabel = document.querySelector('#aiPromptLabel');
  const sendButton = document.querySelector('#aiSend');
  const messages = document.querySelector('#aiMessages');
  const contextSummary = document.querySelector('#aiContextSummary');
  const connection = document.querySelector('#aiConnection');
  let currentTask = 'design_review';

  function buildPayload(task, prompt, sql, schema) {
    if (!Object.prototype.hasOwnProperty.call(taskNames, task)) throw new Error('请选择有效的助手任务');
    const question = String(prompt || '').trim();
    if (!question) throw new Error('请先输入你的问题');
    if (question.length > 4000) throw new Error('问题不能超过 4,000 字');

    const payload = { task, prompt: question };
    if (task === 'explain_sql') {
      const statement = String(sql || '').trim();
      if (!statement) throw new Error('SQL 编辑器目前为空，请先输入要解释的 SQL');
      if (statement.length > 8000) throw new Error('当前 SQL 超过 8,000 字，请缩短后再试');
      payload.sql = statement;
    } else {
      if (!schema || !Array.isArray(schema.tables) || !Array.isArray(schema.relations)) {
        throw new Error('无法读取当前表结构，请重新打开表设计器后再试');
      }
      payload.schema = {
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
    if (currentTask === 'explain_sql') {
      const sql = document.querySelector('#sqlEditor').value.trim();
      contextSummary.textContent = sql
        ? `本次只发送 SQL 编辑器中的 ${sql.length} 个字符及你的问题；不发送表结构、练习数据或聊天历史。`
        : 'SQL 编辑器为空。解释 SQL 时只会发送 SQL 文本和你的问题，不发送练习数据或聊天历史。';
      return;
    }
    const schema = currentSchema();
    const tableCount = schema && Array.isArray(schema.tables) ? schema.tables.length : 0;
    const relationCount = schema && Array.isArray(schema.relations) ? schema.relations.length : 0;
    const fieldCount = schema && Array.isArray(schema.tables)
      ? schema.tables.reduce((total, table) => total + (Array.isArray(table.fields) ? table.fields.length : 0), 0)
      : 0;
    contextSummary.textContent = `本次将发送当前设计的 ${tableCount} 张表、${fieldCount} 个字段及 ${relationCount} 条关系；不发送练习数据、字段注释或聊天历史。API Key 由后端保管。`;
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
        : '描述你需要的 SQL';
    promptInput.placeholder = placeholders[task];
    updateContextSummary();
  }

  function appendMessage(role, text, response) {
    const article = document.createElement('article');
    article.className = `ai-message ${role}`;
    const heading = document.createElement('strong');
    heading.textContent = role === 'user' ? '你' : '助手';
    const content = document.createElement('p');
    content.textContent = text;
    article.append(heading, content);
    if (role === 'assistant' && response) {
      const actions = document.createElement('div');
      actions.className = 'ai-message-actions';
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.textContent = '复制回答';
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(text);
          setConnection('已复制回答。', 'ready');
        } catch (error) {
          setConnection(`复制失败：${error.message || '浏览器未授予剪贴板权限'}`, 'error');
        }
      });
      actions.appendChild(copy);
      if (currentTask === 'generate_sql') {
        const insert = document.createElement('button');
        insert.type = 'button';
        insert.textContent = '插入 SQL 编辑器';
        insert.addEventListener('click', () => {
          const match = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
          const sql = (match ? match[1] : text).trim();
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
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    promptInput.focus();
  }

  function closeAssistant() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    launcher.focus();
  }

  launcher.addEventListener('click', openAssistant);
  closeButton.addEventListener('click', closeAssistant);
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
    if (currentTask === 'explain_sql' && modal.classList.contains('open')) updateContextSummary();
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    let payload;
    try {
      payload = buildPayload(
        currentTask,
        promptInput.value,
        document.querySelector('#sqlEditor').value,
        currentSchema()
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
    const controller = new AbortController();
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
      appendMessage('assistant', body.answer, true);
      setConnection('模型服务已响应。请核对 AI 建议和生成内容。', 'ready');
    } catch (error) {
      const message = error.name === 'AbortError'
        ? '请求超时，请检查模型服务后重试。'
        : error instanceof TypeError
          ? `无法连接 ${endpoint}。请通过 HTTP(S) 运行应用，并先部署后端代理接口。`
          : error.message;
      appendMessage('assistant', `请求未完成：${message}`);
      setConnection(message, 'error');
    } finally {
      window.clearTimeout(timeout);
      sendButton.disabled = false;
      sendButton.textContent = '发送';
    }
  });

  selectTask(currentTask);
})();
