(function () {
  var style = document.createElement('style');
  style.textContent = `
    .er-edit-toolbar { position:absolute; z-index:2; top:12px; left:12px; display:flex; flex-wrap:wrap; align-items:center; gap:6px; max-width:calc(100% - 24px); padding:8px; border:1px solid #e5ebf2; border-radius:10px; background:rgba(255,255,255,.96); box-shadow:0 4px 14px rgba(48,76,111,.08); }
    .er-edit-toolbar button { border:1px solid #e5ebf2; border-radius:8px; padding:7px 9px; color:#708097; background:#fff; font:10px Manrope, sans-serif; }
    .er-edit-toolbar button.active, .er-edit-toolbar button.primary { color:#fff; background:#2d6cdf; border-color:#2d6cdf; font-weight:800; }
    .er-edit-toolbar .er-hint { flex-basis:100%; color:#9aa8b8; font:10px Manrope, sans-serif; }
    .er-input-dialog[hidden] { display:none; }
    .er-input-dialog { position:fixed; inset:0; z-index:30; display:grid; place-items:center; padding:16px; background:rgba(12,28,45,.38); }
    .er-input-panel { width:min(360px,100%); padding:18px; border:1px solid #e5ebf2; border-radius:14px; background:#fff; box-shadow:0 18px 50px rgba(18,35,56,.22); }
    .er-input-panel h3 { margin:0 0 14px; color:#315a9b; font:700 15px Manrope,sans-serif; }
    .er-input-panel input { box-sizing:border-box; width:100%; padding:10px 11px; border:1px solid #d8e1ed; border-radius:8px; outline-color:#2d6cdf; font:13px Manrope,sans-serif; }
    .er-input-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:14px; }
    .er-input-actions button { padding:8px 12px; border:1px solid #e5ebf2; border-radius:8px; color:#536881; background:#fff; font:11px Manrope,sans-serif; cursor:pointer; }
    .er-input-actions button[type="submit"] { border-color:#2d6cdf; color:#fff; background:#2d6cdf; }
    .er-node.er-selected { outline:2px solid #2d6cdf; outline-offset:2px; }
    .er-node .er-node-head { cursor:grab; }
    .er-node .er-node-head button { border:0; width:20px; height:20px; padding:0; border-radius:6px; color:#2d6cdf; background:#fff; font-size:14px; line-height:20px; cursor:pointer; }
    .er-node .er-node-head .er-connect-handle { margin-left:auto; color:#fff; background:#2d6cdf; border-radius:50%; font-size:11px; }
    .er-node .er-field { position:relative; padding-right:30px; }
    .er-node .er-field button { position:absolute; right:7px; width:18px; height:18px; border:0; border-radius:5px; color:#c56b53; background:#fff1ee; font-size:12px; line-height:16px; cursor:pointer; }
    .er-node.er-connect-source { outline:2px solid #f49b44; outline-offset:3px; }
    .er-line.er-relation-selected { stroke:#f49b44; stroke-width:3; }
    .er-line { pointer-events:stroke; cursor:pointer; }
    .er-relation-label { cursor:pointer; }
    .er-side { flex:0 0 190px; width:190px; transition:flex-basis .18s ease,width .18s ease,padding .18s ease; }
    .er-side-toggle { width:100%; margin:0 0 12px; padding:7px 8px; border:1px solid #e5ebf2; border-radius:8px; color:#536881; background:#fff; font:10px Manrope,sans-serif; text-align:left; cursor:pointer; }
    .er-side-content[hidden] { display:none; }
    .er-side.er-side-collapsed { flex-basis:42px; width:42px; padding:10px 5px; }
    .er-side.er-side-collapsed .er-side-toggle { margin:0; padding:7px 0; text-align:center; }
    .er-relation-guide { margin-top:12px; padding-top:10px; border-top:1px solid #e5ebf2; color:#708097; font:10px/1.8 Manrope,sans-serif; }
    .er-relation-guide strong { color:#536881; }
    .relation-row { grid-template-columns:1fr .65fr 1fr .6fr .85fr 25px; }
    .relation-row [data-relation-custom][hidden] { display:none; }
    @media (max-width:740px) { .er-edit-toolbar { gap:4px; padding:6px; } .er-edit-toolbar button { padding:7px 8px; } .er-edit-toolbar .er-hint { font-size:9px; } }
  `;
  document.head.appendChild(style);

  var canvas;
  var connectMode = false;
  var connectStart = null;
  var selectedRelation = -1;
  var connectingPath = null;
  var inputDialog;
  var inputForm;
  var inputTitle;
  var inputControl;
  function toast(text) { if (typeof window.showQueryPadToast === 'function') window.showQueryPadToast(text); else if (typeof showToast === 'function') showToast(text); }
  function save() { if (typeof persistSchema === 'function') persistSchema(true); else if (window.localStorage) localStorage.setItem('querypad-schema', JSON.stringify(schema)); }
  function ensureModel() {
    if (!schema.erLayout) schema.erLayout = {};
    if (!Array.isArray(schema.relations)) schema.relations = [];
    schema.tables.forEach(function (table, index) {
      if (!table.fields) table.fields = [];
      if (!schema.erLayout[table.name]) schema.erLayout[table.name] = { x: 24 + (index % 3) * 245, y: 50 + Math.floor(index / 3) * 180 };
    });
  }
  function safeName(value, fallback) { var name = String(value || '').trim().replace(/[^\w\u4e00-\u9fa5-]/g, '_'); return name || fallback; }
  function nodePosition(table, index) { return schema.erLayout[table.name] || { x: 24 + (index % 3) * 245, y: 50 + Math.floor(index / 3) * 180 }; }
  function pointFor(node) { return { x: (parseFloat(node.style.left) || 0) + node.offsetWidth / 2, y: (parseFloat(node.style.top) || 0) + node.offsetHeight / 2 }; }
  function canvasPoint(event) { var rect = canvas.getBoundingClientRect(); var wrap = canvas.parentElement; return { x: event.clientX - rect.left + wrap.scrollLeft, y: event.clientY - rect.top + wrap.scrollTop }; }

  function createToolbar() {
    var wrap = canvas.parentElement;
    if (wrap.querySelector('.er-edit-toolbar')) return;
    var toolbar = document.createElement('div');
    toolbar.className = 'er-edit-toolbar';
    toolbar.innerHTML = '<button class="primary" data-er-tool="new">＋ 新建实体</button><button data-er-tool="connect">↗ 连接关系</button><button data-er-tool="delete">删除选中关系</button><button data-er-tool="layout">自动布局</button><span class="er-hint">空白处新建实体；连接：拖动实体到另一实体；删除：先点关系线选中</span>';
    wrap.insertBefore(toolbar, canvas);
    toolbar.querySelector('[data-er-tool="new"]').addEventListener('click', function () { createEntity(); });
    toolbar.querySelector('[data-er-tool="connect"]').addEventListener('click', function () { setConnectMode(!connectMode); });
    toolbar.querySelector('[data-er-tool="delete"]').addEventListener('click', function () { deleteSelectedRelation(); });
    toolbar.querySelector('[data-er-tool="layout"]').addEventListener('click', function () { autoLayout(); });
  }

  function createInputDialog() {
    if (inputDialog) return;
    inputDialog = document.createElement('div');
    inputDialog.className = 'er-input-dialog';
    inputDialog.hidden = true;
    inputDialog.innerHTML = '<form class="er-input-panel" role="dialog" aria-modal="true"><h3></h3><input type="text" autocomplete="off" required><div class="er-input-actions"><button type="button" data-input-cancel>取消</button><button type="submit">确定</button></div></form>';
    document.body.appendChild(inputDialog);
    inputForm = inputDialog.querySelector('form');
    inputTitle = inputDialog.querySelector('h3');
    inputControl = inputDialog.querySelector('input');
    var finish = function (value) {
      if (inputDialog.hidden) return;
      inputDialog.hidden = true;
      var resolve = inputDialog.resolveValue;
      inputDialog.resolveValue = null;
      if (resolve) resolve(value);
    };
    inputForm.addEventListener('submit', function (event) { event.preventDefault(); finish(inputControl.value); });
    inputDialog.querySelector('[data-input-cancel]').addEventListener('click', function () { finish(null); });
    inputDialog.addEventListener('click', function (event) { if (event.target === inputDialog) finish(null); });
    inputDialog.addEventListener('keydown', function (event) { if (event.key === 'Escape') { event.preventDefault(); finish(null); } });
  }

  function requestText(title, current) {
    createInputDialog();
    inputTitle.textContent = title;
    inputControl.value = current || '';
    inputDialog.hidden = false;
    return new Promise(function (resolve) {
      inputDialog.resolveValue = resolve;
      inputControl.focus();
      inputControl.select();
    });
  }

  function createSideToggle() {
    var side = document.querySelector('.er-side');
    if (!side || side.querySelector('.er-side-toggle')) return;
    var content = document.createElement('div');
    content.className = 'er-side-content';
    while (side.firstChild) content.appendChild(side.firstChild);
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'er-side-toggle';
    button.setAttribute('aria-controls', 'erSideContent');
    var guide = document.createElement('div');
    guide.className = 'er-relation-guide';
    guide.innerHTML = '<strong>关系类型</strong><br>1:1 一对一<br>1:N 一对多<br>N:1 多对一<br>N:N 多对多<br>其他 可自定义描述<br><small>N:N 实际建表建议使用中间表拆成两条 N:1。</small>';
    var note = content.querySelector('.er-note');
    content.insertBefore(guide, note || null);
    button.addEventListener('click', function () {
      var collapsed = side.classList.toggle('er-side-collapsed');
      content.hidden = collapsed;
      button.setAttribute('aria-expanded', String(!collapsed));
      button.textContent = collapsed ? '›' : '‹ 收起说明';
      button.title = collapsed ? '展开实体关系说明' : '收起实体关系说明';
    });
    content.id = 'erSideContent';
    side.appendChild(button);
    side.appendChild(content);
    button.textContent = '‹ 收起说明';
    button.setAttribute('aria-expanded', 'true');
    button.title = '收起实体关系说明';
  }

  async function createEntity(x, y) {
    var requested = await requestText('新建实体（例如 students）', '');
    if (requested === null) return;
    var name = safeName(requested, 'entity_' + (schema.tables.length + 1));
    if (schema.tables.some(function (table) { return table.name === name; })) { toast('实体名称已存在'); return; }
    var table = { name: name, comment: '', fields: [{ name: 'id', type: 'INT', length: '', pk: true, nullable: false, defaultValue: '', comment: '主键' }] };
    schema.tables.push(table);
    schema.erLayout[name] = { x: Math.max(12, Math.min(620, x || 30)), y: Math.max(20, Math.min(430, y || 60)) };
    save();
    render();
    toast('已新建实体：' + name);
  }

  async function createField(table) {
    var requested = await requestText('添加属性（例如 user_name）', '');
    if (requested === null) return;
    var name = safeName(requested, 'field_' + (table.fields.length + 1));
    if (table.fields.some(function (field) { return field.name === name; })) { toast('属性名称已存在'); return; }
    table.fields.push({ name: name, type: 'VARCHAR', length: '50', pk: false, nullable: true, defaultValue: '', comment: '' });
    save(); render(); toast('已添加属性：' + name);
  }

  function removeField(table, index) {
    if (table.fields.length <= 1) { toast('实体至少保留一个属性'); return; }
    var removedName = table.fields[index] && table.fields[index].name;
    table.fields.splice(index, 1);
    schema.relations = schema.relations.filter(function (relation) { return !(relation.fromTable === table.name && relation.fromColumn === removedName) && !(relation.toTable === table.name && relation.toColumn === removedName); });
    save(); render(); toast('属性已删除');
  }

  function setConnectMode(enabled) {
    connectMode = enabled;
    if (!enabled) { connectStart = null; removeTempPath(); }
    var button = document.querySelector('[data-er-tool="connect"]');
    if (button) { button.classList.toggle('active', enabled); button.textContent = enabled ? '取消连接' : '↗ 连接关系'; }
    toast(enabled ? '连接模式：拖动一个实体到另一个实体' : '已退出连接模式');
  }

  function relationExists(from, to) { return schema.relations.some(function (relation) { return relation.fromTable === from && relation.toTable === to; }); }
  async function readRelationType(title, current) {
    var answer = await requestText(title, current || '1:N');
    if (answer === null) return null;
    var value = answer.trim();
    if (!value) { toast('关系类型不能为空'); return null; }
    if (value.length > 40) { toast('关系类型最多 40 个字符'); return null; }
    return value;
  }
  async function addRelation(fromName, toName) {
    if (fromName === toName) { toast('不能连接实体自身'); return; }
    if (relationExists(fromName, toName) || relationExists(toName, fromName)) { toast('这两个实体已经存在关系'); return; }
    var from = schema.tables.find(function (table) { return table.name === fromName; });
    var to = schema.tables.find(function (table) { return table.name === toName; });
    var cardinality = await readRelationType('关系类型：1:1、1:N、N:1、N:N 或自定义描述', '1:N');
    if (cardinality === null) return;
    schema.relations.push({ fromTable: from.name, fromColumn: (from.fields.find(function (field) { return field.pk; }) || from.fields[0]).name, toTable: to.name, toColumn: (to.fields.find(function (field) { return field.pk; }) || to.fields[0]).name, cardinality: cardinality });
    selectedRelation = schema.relations.length - 1;
    save(); render(); toast('关系已创建：' + cardinality);
  }

  async function editRelation(index) {
    var relation = schema.relations[index];
    if (!relation) return;
    var answer = await readRelationType('修改关系类型：1:1、1:N、N:1、N:N 或自定义描述', relation.cardinality || '1:N');
    if (answer === null) return;
    var value = answer.trim();
    if (!value) { toast('关系类型不能为空'); return; }
    if (value.length > 40) { toast('关系类型最多 40 个字符'); return; }
    relation.cardinality = value; save(); render(); toast('关系类型已更新');
  }

  function deleteSelectedRelation() {
    if (selectedRelation < 0 || !schema.relations[selectedRelation]) { toast('请先点击一条关系线'); return; }
    schema.relations.splice(selectedRelation, 1); selectedRelation = -1; save(); render(); toast('关系已删除');
  }

  function selectRelation(index) {
    selectedRelation = index;
    canvas.querySelectorAll('.er-line[data-relation-index]').forEach(function (path) {
      path.classList.toggle('er-relation-selected', Number(path.dataset.relationIndex) === index);
    });
    toast('已选中关系，点击“删除选中关系”可删除；点击关系标签可修改类型');
  }

  function removeTempPath() { if (connectingPath) { connectingPath.remove(); connectingPath = null; } }
  function beginConnection(node, event) {
    connectStart = node.dataset.node;
    node.classList.add('er-connect-source');
    var p = pointFor(node); var startX = (parseFloat(node.style.left) || 0) + node.offsetWidth; var startY = p.y;
    var svg = canvas.querySelector('.er-lines');
    connectingPath = document.createElementNS('http://www.w3.org/2000/svg', 'path'); connectingPath.classList.add('er-line'); connectingPath.setAttribute('stroke-dasharray', '5 4'); connectingPath.setAttribute('d', `M ${startX} ${startY} L ${startX} ${startY}`); svg.appendChild(connectingPath);
    node.setPointerCapture?.(event.pointerId);
  }
  function moveConnection(event) { if (!connectStart || !connectingPath) return; var node = canvas.querySelector(`[data-node="${connectStart}"]`); var startX = (parseFloat(node.style.left) || 0) + node.offsetWidth; var startY = pointFor(node).y; var point = canvasPoint(event); connectingPath.setAttribute('d', `M ${startX} ${startY} C ${(startX + point.x) / 2} ${startY}, ${(startX + point.x) / 2} ${point.y}, ${point.x} ${point.y}`); }
  function finishConnection(event) { if (!connectStart) return; var target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.er-node'); var from = connectStart; var node = canvas.querySelector(`[data-node="${from}"]`); node?.classList.remove('er-connect-source'); removeTempPath(); connectStart = null; if (target && target.dataset.node) addRelation(from, target.dataset.node); }

  function bindNode(node) {
    var dragging = false; var offset = { x: 0, y: 0 };
    node.addEventListener('pointerdown', function (event) {
      if (event.target.closest('button')) return;
      if (connectMode) { beginConnection(node, event); return; }
      dragging = true; node.classList.add('er-selected'); var point = canvasPoint(event); offset.x = point.x - (parseFloat(node.style.left) || 0); offset.y = point.y - (parseFloat(node.style.top) || 0); node.setPointerCapture?.(event.pointerId);
    });
    node.addEventListener('pointermove', function (event) {
      if (connectMode && connectStart) { moveConnection(event); return; }
      if (!dragging) return; var point = canvasPoint(event); var x = Math.max(8, Math.min(canvas.clientWidth - node.offsetWidth - 8, point.x - offset.x)); var y = Math.max(8, Math.min(canvas.clientHeight - node.offsetHeight - 8, point.y - offset.y)); node.style.left = x + 'px'; node.style.top = y + 'px'; schema.erLayout[node.dataset.node] = { x: x, y: y }; save(); drawRelations();
    });
    node.addEventListener('pointerup', function (event) { if (connectMode && connectStart) { finishConnection(event); return; } dragging = false; });
    node.addEventListener('pointercancel', function () { dragging = false; if (connectStart) { removeTempPath(); connectStart = null; } });
    node.addEventListener('click', function () { document.querySelectorAll('.er-node').forEach(function (item) { item.classList.remove('er-selected'); }); node.classList.add('er-selected'); });
    node.querySelector('[data-add-field]')?.addEventListener('click', function (event) { event.stopPropagation(); createField(schema.tables.find(function (table) { return table.name === node.dataset.node; })); });
    node.querySelector('[data-connect-from]')?.addEventListener('pointerdown', function (event) { event.stopPropagation(); connectMode = true; beginConnection(node, event); });
    node.querySelectorAll('[data-remove-field]').forEach(function (button) { button.addEventListener('click', function (event) { event.stopPropagation(); removeField(schema.tables.find(function (table) { return table.name === node.dataset.node; }), Number(button.dataset.removeField)); }); });
  }

  function drawRelations() {
    var svg = canvas.querySelector('.er-lines');
    if (selectedRelation >= schema.relations.length) selectedRelation = -1;
    svg.querySelectorAll('[data-relation-index]').forEach(function (element) { element.remove(); });
    schema.relations.forEach(function (relation, index) {
      var from = canvas.querySelector(`[data-node="${relation.fromTable}"]`); var to = canvas.querySelector(`[data-node="${relation.toTable}"]`); if (!from || !to) return;
      var a = pointFor(from); var b = pointFor(to); var x1 = a.x < b.x ? (parseFloat(from.style.left) || 0) + from.offsetWidth : parseFloat(from.style.left) || 0; var x2 = a.x < b.x ? parseFloat(to.style.left) || 0 : (parseFloat(to.style.left) || 0) + to.offsetWidth; var y1 = a.y; var y2 = b.y;
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.classList.add('er-line'); path.dataset.relationIndex = index; path.classList.toggle('er-relation-selected', index === selectedRelation); path.setAttribute('d', `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`); path.addEventListener('click', function (event) { event.stopPropagation(); selectRelation(index); }); svg.appendChild(path);
      var label = document.createElementNS('http://www.w3.org/2000/svg', 'text'); label.classList.add('er-line-label', 'er-relation-label'); label.dataset.relationIndex = index; label.setAttribute('x', (x1 + x2) / 2); label.setAttribute('y', (y1 + y2) / 2 - 8); label.textContent = relation.cardinality || '1:N'; label.addEventListener('click', function (event) { event.stopPropagation(); selectRelation(index); editRelation(index); }); svg.appendChild(label);
    });
    var placeholders = [{ id: 'studentLine' }, { id: 'courseLine' }]; placeholders.forEach(function (item) { if (!svg.querySelector('#' + item.id)) { var path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.id = item.id; path.setAttribute('d', 'M 0 0 L 0 0'); path.setAttribute('opacity', '0'); svg.appendChild(path); } });
  }

  function render() {
    ensureModel();
    canvas.innerHTML = '<svg class="er-lines" viewBox="0 0 760 510" preserveAspectRatio="none"></svg>';
    schema.tables.forEach(function (table, index) {
      var position = nodePosition(table, index); schema.erLayout[table.name] = position;
      var node = document.createElement('article'); node.className = 'er-node'; node.dataset.node = table.name; node.style.left = position.x + 'px'; node.style.top = position.y + 'px';
      var header = document.createElement('div'); header.className = 'er-node-head'; header.innerHTML = `<span>实体</span><span style="color:#315a9b;font:inherit">${table.name}</span><button data-connect-from="${table.name}" class="er-connect-handle" title="拖动创建关系">↗</button><button data-add-field="${table.name}" title="添加属性">＋</button>`; node.appendChild(header);
      table.fields.forEach(function (field, fieldIndex) { var row = document.createElement('div'); row.className = 'er-field'; row.innerHTML = `<b class="${field.pk ? 'er-key' : field.foreignKey ? 'er-fk' : ''}">${field.pk ? '◆' : field.foreignKey ? '↗' : '·'}</b> ${field.name} <em>${field.type || 'TEXT'}${field.length ? '(' + field.length + ')' : ''}</em><button data-remove-field="${fieldIndex}" title="删除属性">×</button>`; node.appendChild(row); });
      canvas.appendChild(node); bindNode(node);
    });
    drawRelations(); save();
  }

  function autoLayout() { ensureModel(); schema.tables.forEach(function (table, index) { schema.erLayout[table.name] = { x: 24 + (index % 3) * 245, y: 50 + Math.floor(index / 3) * 180 }; }); save(); render(); toast('已自动排列所有实体'); }
  function init() {
    canvas = document.querySelector('#erCanvas'); if (!canvas || typeof schema === 'undefined') return;
    ensureModel(); createToolbar(); createSideToggle(); createInputDialog(); render();
    window.queryPadAutoLayout = autoLayout;
    canvas.addEventListener('click', function (event) { if (connectMode || event.target.closest?.('.er-node') || event.target.closest?.('.er-line') || event.target.closest?.('.er-line-label')) return; var point = canvasPoint(event); createEntity(point.x - 89, point.y - 30); });
    canvas.addEventListener('pointermove', function (event) { if (connectMode && connectStart) moveConnection(event); });
    canvas.addEventListener('pointerup', function (event) { if (connectMode && connectStart) finishConnection(event); });
    document.addEventListener('click', function (event) { if (event.target.closest('#erBtn, #erNav, #openDatabaseEr')) window.setTimeout(render, 30); });
    window.renderErFromSchema = render;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
