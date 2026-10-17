(function () {
  'use strict';

  var canvas;
  var wrap;
  var concept;
  var connectMode = false;
  var connectStart = null;
  var connectingPath = null;
  var connectDragActive = false;
  var connectPointerOrigin = null;
  var dragging = null;
  var dragState = null;
  var selectedConceptEntity = '';
  var selectedConceptAttribute = null;
  var selectedConceptRelation = -1;
  var dragOffset = { x: 0, y: 0 };
  var scale = 1;
  var minScale = 0.5;
  var maxScale = 2.5;
  var scaleStep = 0.1;
  var pointers = new Map();
  var pinchStartDistance = 0;
  var pinchStartScale = 1;
  var originalAutoLayout = null;
  var originalRenderEr = null;
  var originalDescription = '';
  var originalSideNote = '';

  var style = document.createElement('style');
  style.textContent = `
    .er-concept-canvas[hidden] { display:none; }
    .er-concept-canvas { position:relative; flex:0 0 1100px; width:1100px; height:700px; min-width:1100px; min-height:700px; margin:auto; overflow:hidden; background-color:#fff; background-image:radial-gradient(#d9e2ee 1px, transparent 1px); background-size:18px 18px; touch-action:none; }
    .er-concept-lines { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; overflow:visible; }
    .er-concept-line { stroke:#71839b; stroke-width:1.35; fill:none; }
    .er-concept-cardinality { fill:#526a87; font:700 11px 'DM Mono',monospace; pointer-events:none; }
    .er-concept-entity { position:absolute; z-index:3; display:grid; place-items:center; width:154px; min-height:56px; padding:10px 12px; border:1.5px solid #4b6584; border-radius:2px; background:#fff; color:#233c5e; box-shadow:0 4px 12px rgba(44,71,107,.12); font:700 13px Manrope,system-ui,sans-serif; text-align:center; cursor:grab; user-select:none; touch-action:none; }
    .er-concept-entity:active { cursor:grabbing; box-shadow:0 8px 20px rgba(44,71,107,.2); }
    .er-concept-entity.is-selected { outline:2px solid #2d6cdf; outline-offset:3px; }
    .er-concept-entity.er-concept-connect-source { outline:2px solid #f49b44; outline-offset:3px; }
    .er-concept-attribute { position:absolute; z-index:4; display:grid; place-items:center; width:112px; height:45px; padding:7px 9px; border:1.35px solid #71839b; border-radius:50%; background:#fff; color:#526a87; font:10px 'DM Mono',monospace; text-align:center; box-shadow:0 3px 8px rgba(44,71,107,.08); cursor:grab; user-select:none; pointer-events:auto; touch-action:none; }
    .er-concept-attribute.is-key { border-width:2px; color:#315a9b; text-decoration:underline; }
    .er-concept-attribute:active, .er-concept-relation:active { cursor:grabbing; }
    .er-concept-attribute.is-selected { outline:2px solid #2d6cdf; outline-offset:3px; }
    .er-concept-relation { position:absolute; z-index:5; display:grid; place-items:center; width:94px; height:50px; border:1.35px solid #71839b; background:#fff; color:#526a87; transform:rotate(45deg); cursor:grab; user-select:none; touch-action:none; box-shadow:0 3px 8px rgba(44,71,107,.08); }
    .er-concept-relation span { display:block; max-width:76px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; transform:rotate(-45deg); font:10px Manrope,system-ui,sans-serif; }
    .er-concept-relation.is-selected { border-color:#f49b44; outline:2px solid rgba(244,155,68,.3); outline-offset:3px; }
    .er-concept-toolbar { position:absolute; z-index:4; top:12px; left:12px; display:flex; flex-wrap:wrap; align-items:center; gap:6px; max-width:calc(100% - 24px); padding:8px; border:1px solid #e5ebf2; border-radius:10px; background:rgba(255,255,255,.96); box-shadow:0 4px 14px rgba(48,76,111,.08); }
    .er-concept-toolbar[hidden], .er-edit-toolbar[hidden] { display:none !important; }
    .er-concept-toolbar button { border:1px solid #e5ebf2; border-radius:8px; padding:7px 9px; color:#708097; background:#fff; font:10px Manrope,sans-serif; cursor:pointer; }
    .er-concept-toolbar button.active, .er-concept-toolbar button.primary { color:#fff; background:#2d6cdf; border-color:#2d6cdf; font-weight:800; }
    .er-concept-toolbar .er-concept-hint { flex-basis:100%; color:#9aa8b8; font:10px Manrope,sans-serif; }
    .er-concept-badge { display:inline-flex; margin-top:9px; padding:5px 8px; border-radius:99px; background:#eaf1ff; color:#315a9b; font:800 9px Manrope,sans-serif; }
    .er-concept-canvas-wrap { justify-content:flex-start; }
    .er-canvas-wrap.concept-active { justify-content:flex-start; }
    @media (max-width:740px) { .er-concept-canvas { flex-basis:1000px; width:1000px; height:680px; min-width:1000px; min-height:680px; } .er-concept-toolbar { gap:4px; padding:6px; } .er-concept-toolbar button { padding:7px 8px; } .er-concept-toolbar .er-concept-hint { font-size:9px; } }
    @media (prefers-color-scheme: dark) { .er-concept-canvas { background-color:#111621; background-image:radial-gradient(#30394a 1px, transparent 1px); } .er-concept-entity, .er-concept-attribute, .er-concept-relation, .er-concept-toolbar { background:#1a2030; border-color:#71839b; color:#d9e4f5; } .er-concept-attribute { color:#c0c9d7; } .er-concept-cardinality { fill:#c0c9d7; } .er-concept-toolbar button { background:#202635; border-color:#384155; color:#c0c9d7; } }
  `;
  document.head.appendChild(style);

  function toast(text) {
    if (typeof window.showQueryPadToast === 'function') window.showQueryPadToast(text);
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[<>&'\"]/g, function (character) {
      return ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[character];
    });
  }

  function getSchema() {
    return typeof schema === 'undefined' ? null : schema;
  }

  function orderedTables(tables, relations) {
    var ordered = (tables || []).slice();
    if (ordered.length < 3 || !(relations || []).length) return ordered;
    var degree = new Map(ordered.map(function (table) { return [table.name, 0]; }));
    (relations || []).forEach(function (relation) {
      if (degree.has(relation.fromTable)) degree.set(relation.fromTable, degree.get(relation.fromTable) + 1);
      if (degree.has(relation.toTable)) degree.set(relation.toTable, degree.get(relation.toTable) + 1);
    });
    var hub = ordered.reduce(function (best, table) { return degree.get(table.name) > degree.get(best.name) ? table : best; }, ordered[0]);
    if (!degree.get(hub.name)) return ordered;
    ordered.splice(ordered.indexOf(hub), 1);
    ordered.splice(1, 0, hub);
    return ordered;
  }

  function defaultPosition(table, fallbackIndex) {
    var model = getSchema();
    var visualIndex = model ? orderedTables(model.tables, model.relations).indexOf(table) : fallbackIndex;
    if (visualIndex < 0) visualIndex = fallbackIndex;
    return { x: 180 + (visualIndex % 3) * 550, y: 130 + Math.floor(visualIndex / 3) * 360 };
  }

  function ensureModel() {
    var model = getSchema();
    if (!model) return;
    if (!model.erConceptLayout) model.erConceptLayout = {};
    (model.tables || []).forEach(function (table, index) {
      if (!model.erConceptLayout[table.name]) {
        model.erConceptLayout[table.name] = defaultPosition(table, index);
      }
    });
  }

  function saveModel() {
    if (typeof persistSchema === 'function') persistSchema(true);
    else {
      var model = getSchema();
      if (model && window.localStorage) localStorage.setItem('querypad-schema', JSON.stringify(model));
    }
  }

  function setScale(nextScale) {
    scale = Math.max(minScale, Math.min(maxScale, nextScale));
    if (!concept) return;
    concept.style.transformOrigin = '0 0';
    concept.style.transform = 'scale(' + scale + ')';
    concept.dataset.scale = String(scale);
  }

  function zoomIn() { setScale(scale + scaleStep); }
  function zoomOut() { setScale(scale - scaleStep); }
  function zoomReset() { setScale(1); }

  function entityPosition(table, index) {
    var model = getSchema();
    return (model && model.erConceptLayout && model.erConceptLayout[table.name]) || defaultPosition(table, index);
  }

  function entityCenter(position) {
    return { x: position.x + 77, y: position.y + 28 };
  }

  function entityEdge(position, target) {
    var center = entityCenter(position);
    var dx = target.x - center.x;
    var dy = target.y - center.y;
    if (!dx && !dy) return center;
    var scale = Math.min(77 / Math.max(1, Math.abs(dx)), 28 / Math.max(1, Math.abs(dy)));
    return { x: center.x + dx * scale, y: center.y + dy * scale };
  }

  function pointToSegmentDistance(point, start, end) {
    var dx = end.x - start.x;
    var dy = end.y - start.y;
    var lengthSquared = dx * dx + dy * dy;
    if (!lengthSquared) return Math.hypot(point.x - start.x, point.y - start.y);
    var t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
    return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
  }

  function setActive(active) {
    if (!canvas) return;
    canvas.hidden = active;
    var concept = document.querySelector('#erConceptCanvas');
    if (concept) concept.hidden = !active;
    if (wrap) { wrap.classList.toggle('concept-active', active); if (active) wrap.scrollLeft = 0; }
    document.body.classList.toggle('er-concept-mode', active);
    var button = document.querySelector('#conceptErBtn');
    if (button) {
      button.classList.toggle('primary', active);
      button.textContent = active ? '表 ER 图' : '概念 ER 图';
      button.setAttribute('aria-pressed', String(active));
    }
    var heading = document.querySelector('#erModal .er-head p');
    if (heading) heading.textContent = active ? 'Chen 记法：矩形实体、椭圆属性、菱形关系；双击关系可编辑' : originalDescription;
    var sideNote = document.querySelector('#erModal .er-note');
    if (sideNote) sideNote.textContent = active ? '概念 ER 图使用 Chen 记法：实体为矩形，属性为椭圆，关系为菱形。下划线属性表示主键。' : originalSideNote;
    var standardToolbar = wrap && wrap.querySelector('.er-edit-toolbar');
    if (standardToolbar) standardToolbar.hidden = active;
    var conceptToolbar = wrap && wrap.querySelector('.er-concept-toolbar');
    if (conceptToolbar) conceptToolbar.hidden = !active;
    if (!active && originalRenderEr) originalRenderEr();
    if (active) render();
  }

  function clearConceptConnection() {
    if (connectingPath) { connectingPath.remove(); connectingPath = null; }
    if (concept) concept.querySelectorAll('.er-concept-entity').forEach(function (item) { item.classList.remove('er-concept-connect-source'); });
    connectStart = null;
    connectDragActive = false;
    connectPointerOrigin = null;
  }

  function beginConceptConnection(node, event) {
    connectStart = node.dataset.conceptNode;
    connectDragActive = false;
    connectPointerOrigin = { x: event.clientX, y: event.clientY };
    node.classList.add('er-concept-connect-source');
    var model = getSchema();
    var position = model && model.erConceptLayout && model.erConceptLayout[connectStart];
    if (!position || !concept) return;
    var center = entityCenter(position);
    var svg = concept.querySelector('.er-concept-lines');
    connectingPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    connectingPath.classList.add('er-concept-line', 'er-concept-temporary-line');
    connectingPath.setAttribute('stroke-dasharray', '5 4');
    connectingPath.setAttribute('d', 'M ' + center.x + ' ' + center.y + ' L ' + center.x + ' ' + center.y);
    svg.appendChild(connectingPath);
    node.setPointerCapture?.(event.pointerId);
  }

  function moveConceptConnection(event) {
    if (!connectStart || !connectingPath) return;
    if (connectPointerOrigin && Math.hypot(event.clientX - connectPointerOrigin.x, event.clientY - connectPointerOrigin.y) > 6) connectDragActive = true;
    var model = getSchema();
    var position = model && model.erConceptLayout && model.erConceptLayout[connectStart];
    if (!position) return;
    var start = entityCenter(position);
    var point = canvasPoint(event);
    connectingPath.setAttribute('d', 'M ' + start.x + ' ' + start.y + ' L ' + point.x + ' ' + point.y);
  }

  function finishConceptConnection(event) {
    if (!connectStart) return;
    if (!connectDragActive) return;
    var source = connectStart;
    var target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.er-concept-entity');
    clearConceptConnection();
    if (target && target.dataset.conceptNode && target.dataset.conceptNode !== source) addConceptRelation(source, target.dataset.conceptNode);
  }

  function createToolbar() {
    if (!wrap || wrap.querySelector('.er-concept-toolbar')) return;
    var toolbar = document.createElement('div');
    toolbar.className = 'er-concept-toolbar';
    toolbar.innerHTML = '<button class="primary" data-concept-tool="new">＋ 新建实体</button><button data-concept-tool="attribute">＋ 添加属性</button><button data-concept-tool="delete-attribute">删除属性</button><button data-concept-tool="delete-entity">删除实体</button><button data-concept-tool="edit-table">编辑表结构</button><button data-concept-tool="connect">↗ 连接关系</button><button data-concept-tool="edit-relation">编辑关系</button><button data-concept-tool="delete">删除关系</button><button data-concept-tool="layout">自动布局</button><button data-concept-tool="zoom-in">＋ 放大</button><button data-concept-tool="zoom-out">－ 缩小</button><button data-concept-tool="zoom-reset">重置缩放</button><button data-concept-tool="standard">表 ER 图</button><span class="er-concept-hint">拖动矩形、椭圆或菱形调整布局；双击实体添加属性；双击菱形修改关系；支持 Ctrl + 滚轮或双指缩放</span>';
    wrap.appendChild(toolbar);
    toolbar.querySelector('[data-concept-tool="new"]').addEventListener('click', function () {
      var standardButton = wrap.querySelector('[data-er-tool="new"]');
      if (standardButton) standardButton.click();
      window.setTimeout(render, 50);
    });
    toolbar.querySelector('[data-concept-tool="connect"]').addEventListener('click', function () { connectMode = !connectMode; if (!connectMode) clearConceptConnection(); toolbar.querySelector('[data-concept-tool="connect"]').classList.toggle('active', connectMode); toast(connectMode ? '连接模式：拖动一个实体到另一个实体，也可依次点击两个实体' : '已退出连接模式'); });
    toolbar.querySelector('[data-concept-tool="attribute"]').addEventListener('click', function () {
      if (!selectedConceptEntity) { toast('请先选择一个实体'); return; }
      var standard = document.querySelector('#erCanvas [data-node="' + CSS.escape(selectedConceptEntity) + '"] [data-add-field]');
      if (standard) { standard.click(); window.setTimeout(render, 80); }
    });
    toolbar.querySelector('[data-concept-tool="delete-attribute"]').addEventListener('click', function () {
      if (!selectedConceptAttribute) { toast('请先选择一个属性椭圆'); return; }
      var entity = document.querySelector('#erCanvas [data-node="' + CSS.escape(selectedConceptAttribute.entity) + '"]');
      var standard = entity && entity.querySelector('[data-remove-field="' + selectedConceptAttribute.index + '"]');
      if (standard) { selectedConceptAttribute = null; standard.click(); window.setTimeout(render, 80); }
    });
    toolbar.querySelector('[data-concept-tool="delete-entity"]').addEventListener('click', function () {
      if (!selectedConceptEntity) { toast('请先选择一个实体'); return; }
      var standard = document.querySelector('#erCanvas [data-node="' + CSS.escape(selectedConceptEntity) + '"] [data-delete-entity]');
      if (standard) { var name = selectedConceptEntity; selectedConceptEntity = ''; selectedConceptAttribute = null; standard.click(); toast('正在删除实体：' + name); }
    });
    toolbar.querySelector('[data-concept-tool="edit-table"]').addEventListener('click', function () {
      if (!selectedConceptEntity) { toast('请先选择一个实体'); return; }
      var name = selectedConceptEntity;
      var open = document.querySelector('#designBtn');
      if (!open) return;
      open.click();
      var tab = document.querySelector('#designTablePicker [data-design-table="' + CSS.escape(name) + '"]');
      if (tab) tab.click();
    });
    toolbar.querySelector('[data-concept-tool="edit-relation"]').addEventListener('click', function () {
      if (selectedConceptRelation < 0) { toast('请先选择一个关系菱形'); return; }
      editConceptRelation(selectedConceptRelation);
    });
    toolbar.querySelector('[data-concept-tool="delete"]').addEventListener('click', deleteSelectedRelation);
    toolbar.querySelector('[data-concept-tool="layout"]').addEventListener('click', conceptAutoLayout);
    toolbar.querySelector('[data-concept-tool="zoom-in"]').addEventListener('click', zoomIn);
    toolbar.querySelector('[data-concept-tool="zoom-out"]').addEventListener('click', zoomOut);
    toolbar.querySelector('[data-concept-tool="zoom-reset"]').addEventListener('click', zoomReset);
    toolbar.querySelector('[data-concept-tool="standard"]').addEventListener('click', function () { setActive(false); });
  }

  function addConceptRelation(fromName, toName) {
    var model = getSchema();
    if (!model) return;
    if (fromName === toName) { toast('不能连接同一个实体'); return; }
    if ((model.relations || []).some(function (relation) { return (relation.fromTable === fromName && relation.toTable === toName) || (relation.fromTable === toName && relation.toTable === fromName); })) { toast('这两个实体已经存在关系'); return; }
    var from = model.tables.find(function (table) { return table.name === fromName; });
    var to = model.tables.find(function (table) { return table.name === toName; });
    if (!from || !to) return;
    var label = window.prompt('关系名称（例如：选课、拥有）', '关联');
    if (label === null) return;
    var cardinality = window.prompt('基数（例如：1:1、1:N、N:N）', '1:N');
    if (cardinality === null) return;
    if (!Array.isArray(model.relations)) model.relations = [];
    model.relations.push({ fromTable: fromName, fromColumn: (from.fields.find(function (field) { return field.pk; }) || from.fields[0]).name, toTable: toName, toColumn: (to.fields.find(function (field) { return field.pk; }) || to.fields[0]).name, cardinality: cardinality.trim() || '1:N', label: label.trim() || '关联' });
    saveModel();
    render();
    toast('概念关系已创建');
  }

  function relationName(relation) {
    return relation.label || relation.name || relation.relationName || '关联';
  }

  function cardinalityEnds(relation) {
    var parts = String(relation.cardinality || '1:N').split(/\s*[:：]\s*/);
    return parts.length > 1 ? [parts[0], parts[1]] : [parts[0], ''];
  }

  function editConceptRelation(index) {
    var model = getSchema();
    var relation = model && model.relations[index];
    if (!relation) return;
    var nextLabel = window.prompt('关系名称', relationName(relation));
    if (nextLabel === null) return;
    var nextCardinality = window.prompt('基数（例如：1:N）', relation.cardinality || '1:N');
    if (nextCardinality === null) return;
    relation.label = nextLabel.trim() || '关联';
    relation.cardinality = nextCardinality.trim() || '1:N';
    saveModel();
    render();
    toast('关系已更新');
  }

  function selectConceptEntity(node) {
    selectedConceptEntity = node.dataset.conceptNode;
    selectedConceptAttribute = null;
    if (concept) {
      concept.querySelectorAll('.er-concept-entity').forEach(function (item) { item.classList.toggle('is-selected', item === node); });
      concept.querySelectorAll('.er-concept-attribute').forEach(function (item) { item.classList.remove('is-selected'); });
    }
  }

  function selectConceptAttribute(node) {
    selectedConceptEntity = node.dataset.conceptEntity;
    selectedConceptAttribute = { entity: node.dataset.conceptEntity, index: Number(node.dataset.conceptFieldIndex) };
    if (concept) {
      concept.querySelectorAll('.er-concept-entity').forEach(function (item) { item.classList.toggle('is-selected', item.dataset.conceptNode === selectedConceptEntity); });
      concept.querySelectorAll('.er-concept-attribute').forEach(function (item) { item.classList.toggle('is-selected', item === node); });
    }
  }

  function deleteSelectedRelation() {
    var model = getSchema();
    if (!model || selectedConceptRelation < 0 || !model.relations[selectedConceptRelation]) { toast('请先点击一个关系菱形'); return; }
    model.relations.splice(selectedConceptRelation, 1);
    selectedConceptRelation = -1;
    saveModel(); render(); toast('关系已删除');
  }

  function relationPoint(relation, index) {
    var model = getSchema();
    var from = model.tables.find(function (table) { return table.name === relation.fromTable; });
    var to = model.tables.find(function (table) { return table.name === relation.toTable; });
    if (!from || !to) return null;
    var a = entityCenter(entityPosition(from, model.tables.indexOf(from)));
    var b = entityCenter(entityPosition(to, model.tables.indexOf(to)));
    var offset = ((index % 3) - 1) * 22;
    var blocked = model.tables.some(function (table) {
      if (table.name === from.name || table.name === to.name) return false;
      var center = entityCenter(entityPosition(table, model.tables.indexOf(table)));
      return pointToSegmentDistance(center, a, b) < 92;
    });
    var point;
    if (blocked) {
      var lowestCenter = model.tables.reduce(function (lowest, table) {
        return Math.max(lowest, entityCenter(entityPosition(table, model.tables.indexOf(table))).y);
      }, 0);
      point = { x: (a.x + b.x) / 2 + offset, y: lowestCenter + 280 };
    } else {
      point = { x: (a.x + b.x) / 2 + offset, y: (a.y + b.y) / 2 + (index % 2 ? 16 : -16) };
    }
    var layout = model.erConceptRelationLayout;
    return layout && layout[relationLayoutKey(relation)] || point;
  }

  function relationLayoutKey(relation) {
    return JSON.stringify([relation.fromTable, relation.fromColumn, relation.toTable, relation.toColumn]);
  }

  function fieldPoint(position, fieldIndex, fieldCount) {
    var center = entityCenter(position);
    var angle = -Math.PI / 2 + (fieldIndex / Math.max(1, fieldCount)) * Math.PI * 2;
    return { x: center.x + Math.cos(angle) * (126 + (fieldIndex % 2) * 12), y: center.y + Math.sin(angle) * (94 + (fieldIndex % 3) * 8) };
  }

  function attributeLayoutKey(table, fieldIndex) {
    var field = table.fields && table.fields[fieldIndex];
    return JSON.stringify([table.name, field && field.name || 'field_' + fieldIndex]);
  }

  function attributePosition(table, fieldIndex, fieldCount) {
    var model = getSchema();
    var position = fieldPoint(entityPosition(table, model.tables.indexOf(table)), fieldIndex, fieldCount);
    var layout = model.erConceptAttributeLayout;
    var offset = layout && layout[attributeLayoutKey(table, fieldIndex)];
    return offset ? { x: position.x + offset.x, y: position.y + offset.y } : position;
  }

  function setAttributePosition(table, fieldIndex, fieldCount, position) {
    var model = getSchema();
    if (!model.erConceptAttributeLayout) model.erConceptAttributeLayout = {};
    var base = fieldPoint(entityPosition(table, model.tables.indexOf(table)), fieldIndex, fieldCount);
    model.erConceptAttributeLayout[attributeLayoutKey(table, fieldIndex)] = { x: position.x - base.x, y: position.y - base.y };
  }

  function bindConceptShapeDrag(node, getPosition, setPosition, onSelect) {
    node.addEventListener('pointerdown', function (event) {
      if ((event.button !== undefined && event.button !== 0) || connectMode || pointers.size > 1) return;
      event.preventDefault();
      if (onSelect) onSelect();
      var point = canvasPoint(event);
      var position = getPosition();
      dragging = node;
      dragState = { offset: { x: point.x - position.x, y: point.y - position.y }, setPosition: setPosition };
      node.setPointerCapture?.(event.pointerId);
    });
    node.addEventListener('pointermove', function (event) {
      if (pointers.size > 1) { if (dragging === node) { dragging = null; dragState = null; } return; }
      if (dragging !== node || !dragState) return;
      var point = canvasPoint(event);
      var position = {
        x: Math.max(0, Math.min(concept.clientWidth - node.offsetWidth, point.x - dragState.offset.x)),
        y: Math.max(0, Math.min(concept.clientHeight - node.offsetHeight, point.y - dragState.offset.y))
      };
      dragState.setPosition(position);
      node.style.left = position.x + 'px';
      node.style.top = position.y + 'px';
      refreshConceptLayout();
    });
    node.addEventListener('pointerup', function () {
      if (dragging !== node) return;
      dragging = null; dragState = null; saveModel();
    });
    node.addEventListener('pointercancel', function () {
      if (dragging !== node) return;
      dragging = null; dragState = null; saveModel();
    });
  }

  function addSvgLine(svg, x1, y1, x2, y2, className) {
    var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1); line.setAttribute('y1', y1); line.setAttribute('x2', x2); line.setAttribute('y2', y2); line.setAttribute('class', className || 'er-concept-line'); svg.appendChild(line);
  }

  function renderAttributeLines(svg, entity, table, position) {
    var center = entityCenter(position);
    var fields = (table.fields || []).slice(0, 14);
    fields.forEach(function (field, index) {
      var angle = -Math.PI / 2 + (index / Math.max(1, fields.length)) * Math.PI * 2;
      var radiusX = 126 + (index % 2) * 12;
      var radiusY = 94 + (index % 3) * 8;
      var x = center.x + Math.cos(angle) * radiusX;
      var y = center.y + Math.sin(angle) * radiusY;
      field.__concept = { x: x, y: y };
      addSvgLine(svg, center.x, center.y, x, y, 'er-concept-line');
    });
  }

  function bindEntity(node) {
    node.addEventListener('pointerdown', function (event) {
      if (event.button !== undefined && event.button !== 0) return;
      if (connectMode) {
        event.preventDefault();
        if (!connectStart) { beginConceptConnection(node, event); }
        else if (connectStart !== node.dataset.conceptNode) { var from = connectStart; clearConceptConnection(); addConceptRelation(from, node.dataset.conceptNode); }
        return;
      }
      if (pointers.size > 1) return;
      event.preventDefault();
      var model = getSchema();
      var position = model.erConceptLayout[node.dataset.conceptNode];
      selectConceptEntity(node);
      var point = canvasPoint(event);
      dragging = node;
      dragOffset = { x: point.x - position.x, y: point.y - position.y };
      node.setPointerCapture?.(event.pointerId);
      node.classList.add('is-selected');
    });
    node.addEventListener('pointermove', function (event) {
      if (connectMode && connectStart === node.dataset.conceptNode) { moveConceptConnection(event); return; }
      if (pointers.size > 1) { dragging = null; return; }
      if (dragging !== node) return;
      var model = getSchema();
      var point = canvasPoint(event);
      model.erConceptLayout[node.dataset.conceptNode] = { x: Math.max(120, Math.min(concept.clientWidth - 320, point.x - dragOffset.x)), y: Math.max(120, Math.min(concept.clientHeight - 210, point.y - dragOffset.y)) };
      node.style.left = model.erConceptLayout[node.dataset.conceptNode].x + 'px';
      node.style.top = model.erConceptLayout[node.dataset.conceptNode].y + 'px';
      refreshConceptLayout();
    });
    node.addEventListener('pointerup', function (event) { if (connectMode && connectStart === node.dataset.conceptNode) { finishConceptConnection(event); return; } if (dragging === node) { dragging = null; saveModel(); } });
    node.addEventListener('pointercancel', function () { if (connectMode && connectStart === node.dataset.conceptNode) { clearConceptConnection(); return; } if (dragging === node) { dragging = null; saveModel(); } });
    node.addEventListener('click', function () { if (connectMode) return; selectConceptEntity(node); });
    node.addEventListener('dblclick', function () {
      var standard = document.querySelector('#erCanvas [data-node="' + CSS.escape(node.dataset.conceptNode) + '"] [data-add-field]');
      if (standard) { standard.click(); window.setTimeout(render, 80); }
    });
  }

  function canvasPoint(event) {
    var activeCanvas = document.querySelector('#erConceptCanvas:not([hidden])') || canvas;
    var rect = activeCanvas.getBoundingClientRect();
    var currentScale = activeCanvas === concept ? scale : 1;
    return { x: (event.clientX - rect.left) / currentScale, y: (event.clientY - rect.top) / currentScale };
  }

  function refreshConceptLayout() {
    var model = getSchema();
    var concept = document.querySelector('#erConceptCanvas');
    if (!model || !concept) return;
    concept.querySelectorAll('[data-concept-attribute]').forEach(function (attribute) {
      var table = model.tables.find(function (item) { return item.name === attribute.dataset.conceptEntity; });
      if (!table) return;
      var point = attributePosition(table, Number(attribute.dataset.conceptFieldIndex), Math.max(1, Math.min(14, table.fields.length)));
      attribute.style.left = (point.x - 56) + 'px';
      attribute.style.top = (point.y - 22) + 'px';
    });
    var svg = concept.querySelector('.er-concept-lines');
    if (!svg) return;
    svg.innerHTML = '';
    model.tables.forEach(function (table, index) {
      var position = entityPosition(table, index); var center = entityCenter(position);
      (table.fields || []).slice(0, 14).forEach(function (_, fieldIndex) { var point = attributePosition(table, fieldIndex, Math.max(1, Math.min(14, table.fields.length))); addSvgLine(svg, center.x, center.y, point.x, point.y, 'er-concept-line'); });
    });
    (model.relations || []).forEach(function (relation, index) {
      var from = model.tables.find(function (table) { return table.name === relation.fromTable; }); var to = model.tables.find(function (table) { return table.name === relation.toTable; }); var point = relationPoint(relation, index); if (!from || !to || !point) return;
      var a = entityEdge(entityPosition(from, model.tables.indexOf(from)), point); var b = entityEdge(entityPosition(to, model.tables.indexOf(to)), point);
      addSvgLine(svg, a.x, a.y, point.x, point.y, 'er-concept-line'); addSvgLine(svg, point.x, point.y, b.x, b.y, 'er-concept-line');
      var diamond = concept.querySelector('[data-relation-index="' + index + '"]');
      if (diamond) { diamond.style.left = (point.x - 47) + 'px'; diamond.style.top = (point.y - 25) + 'px'; }
      var ends = cardinalityEnds(relation);
      var leftLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text'); leftLabel.setAttribute('class', 'er-concept-cardinality'); leftLabel.setAttribute('x', (a.x + point.x) / 2 - 12); leftLabel.setAttribute('y', (a.y + point.y) / 2 - 7); leftLabel.textContent = ends[0]; svg.appendChild(leftLabel);
      if (ends[1]) { var rightLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text'); rightLabel.setAttribute('class', 'er-concept-cardinality'); rightLabel.setAttribute('x', (b.x + point.x) / 2 + 5); rightLabel.setAttribute('y', (b.y + point.y) / 2 - 7); rightLabel.textContent = ends[1]; svg.appendChild(rightLabel); }
    });
  }

  function render(saveAfter) {
    var model = getSchema();
    if (!canvas || !model) return;
    ensureModel();
    var concept = document.querySelector('#erConceptCanvas');
    if (!concept) return;
    var columns = Math.min(3, Math.max(1, model.tables.length));
    var conceptWidth = Math.max(1100, 500 + (columns - 1) * 550);
    var conceptHeight = Math.max(700, 520 + Math.floor(Math.max(0, model.tables.length - 1) / 3) * 360);
    concept.style.width = conceptWidth + 'px'; concept.style.minWidth = conceptWidth + 'px'; concept.style.height = conceptHeight + 'px'; concept.style.minHeight = conceptHeight + 'px'; concept.style.flexBasis = conceptWidth + 'px';
    concept.innerHTML = '<svg class="er-concept-lines" viewBox="0 0 ' + conceptWidth + ' ' + conceptHeight + '" preserveAspectRatio="none"></svg>';
    var svg = concept.querySelector('.er-concept-lines');
    (model.tables || []).forEach(function (table, index) {
      var position = entityPosition(table, index);
      var node = document.createElement('div'); node.className = 'er-concept-entity'; node.dataset.conceptNode = table.name; node.style.left = position.x + 'px'; node.style.top = position.y + 'px'; node.textContent = table.name; concept.appendChild(node);
      node.classList.toggle('is-selected', selectedConceptEntity === table.name);
      bindEntity(node);
      (table.fields || []).slice(0, 14).forEach(function (field, fieldIndex) {
        var point = attributePosition(table, fieldIndex, Math.max(1, Math.min(14, table.fields.length)));
        var attr = document.createElement('div'); attr.className = 'er-concept-attribute' + (field.pk ? ' is-key' : ''); attr.dataset.conceptAttribute = field.name || 'field_' + fieldIndex; attr.dataset.conceptEntity = table.name; attr.dataset.conceptFieldIndex = fieldIndex; attr.style.left = (point.x - 56) + 'px'; attr.style.top = (point.y - 22) + 'px'; attr.textContent = field.name || '属性'; attr.title = (field.pk ? '主键：' : '') + (field.type || 'TEXT'); concept.appendChild(attr);
        attr.classList.toggle('is-selected', Boolean(selectedConceptAttribute && selectedConceptAttribute.entity === table.name && selectedConceptAttribute.index === fieldIndex));
        bindConceptShapeDrag(attr, function () { return { x: parseFloat(attr.style.left), y: parseFloat(attr.style.top) }; }, function (next) {
          setAttributePosition(table, fieldIndex, Math.max(1, Math.min(14, table.fields.length)), { x: next.x + 56, y: next.y + 22 });
        }, function () { selectConceptAttribute(attr); });
        attr.addEventListener('click', function (event) { event.stopPropagation(); selectConceptAttribute(attr); });
      });
    });
    refreshConceptLayout();
    (model.relations || []).forEach(function (relation, index) {
      var from = model.tables.find(function (table) { return table.name === relation.fromTable; }); var to = model.tables.find(function (table) { return table.name === relation.toTable; }); var point = relationPoint(relation, index); if (!from || !to || !point) return;
      var a = entityEdge(entityPosition(from, model.tables.indexOf(from)), point); var b = entityEdge(entityPosition(to, model.tables.indexOf(to)), point);
      addSvgLine(svg, a.x, a.y, point.x, point.y, 'er-concept-line'); addSvgLine(svg, point.x, point.y, b.x, b.y, 'er-concept-line');
      var diamond = document.createElement('div'); diamond.className = 'er-concept-relation'; diamond.dataset.relationIndex = index; diamond.style.left = (point.x - 47) + 'px'; diamond.style.top = (point.y - 25) + 'px'; var label = document.createElement('span'); label.textContent = relationName(relation); diamond.appendChild(label); diamond.title = '双击修改关系名称和基数'; concept.appendChild(diamond);
      diamond.classList.toggle('is-selected', selectedConceptRelation === index);
      bindConceptShapeDrag(diamond, function () { return { x: parseFloat(diamond.style.left), y: parseFloat(diamond.style.top) }; }, function (next) {
        if (!model.erConceptRelationLayout) model.erConceptRelationLayout = {};
        model.erConceptRelationLayout[relationLayoutKey(relation)] = { x: next.x + 47, y: next.y + 25 };
      }, function () {
        selectedConceptRelation = index;
        concept.querySelectorAll('.er-concept-relation').forEach(function (item) { item.classList.toggle('is-selected', Number(item.dataset.relationIndex) === index); });
      });
      diamond.addEventListener('click', function (event) { event.stopPropagation(); selectedConceptRelation = index; concept.querySelectorAll('.er-concept-relation').forEach(function (item) { item.classList.toggle('is-selected', Number(item.dataset.relationIndex) === index); }); });
      diamond.addEventListener('dblclick', function (event) { event.stopPropagation(); editConceptRelation(index); });
      var ends = cardinalityEnds(relation);
      var leftLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text'); leftLabel.setAttribute('class', 'er-concept-cardinality'); leftLabel.setAttribute('x', (a.x + point.x) / 2 - 12); leftLabel.setAttribute('y', (a.y + point.y) / 2 - 7); leftLabel.textContent = ends[0]; svg.appendChild(leftLabel);
      if (ends[1]) { var rightLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text'); rightLabel.setAttribute('class', 'er-concept-cardinality'); rightLabel.setAttribute('x', (b.x + point.x) / 2 + 5); rightLabel.setAttribute('y', (b.y + point.y) / 2 - 7); rightLabel.textContent = ends[1]; svg.appendChild(rightLabel); }
    });
    if (saveAfter !== false) saveModel();
  }

  function conceptAutoLayout() {
    var model = getSchema(); if (!model) return; ensureModel();
    orderedTables(model.tables, model.relations).forEach(function (table, index) { model.erConceptLayout[table.name] = { x: 180 + (index % 3) * 550, y: 130 + Math.floor(index / 3) * 360 }; });
    saveModel(); render(); toast('概念 ER 图已自动排列');
  }

  function init() {
    canvas = document.querySelector('#erCanvas'); wrap = document.querySelector('.er-canvas-wrap'); if (!canvas || !wrap) return;
    concept = document.querySelector('#erConceptCanvas'); if (!concept) return;
    originalDescription = document.querySelector('#erModal .er-head p')?.textContent || '';
    originalSideNote = document.querySelector('#erModal .er-note')?.textContent || '';
    createToolbar(); ensureModel();
    setActive(false);
    document.querySelector('#conceptErBtn')?.addEventListener('click', function () { setActive(concept.hidden); });
    originalAutoLayout = window.queryPadAutoLayout;
    window.queryPadAutoLayout = function () { if (window.queryPadConceptErActive) conceptAutoLayout(); else if (originalAutoLayout) originalAutoLayout(); };
    var originalRender = window.renderErFromSchema;
    originalRenderEr = originalRender;
    window.renderErFromSchema = function () {
      if (originalRender) originalRender();
      else if (window.queryPadConceptErActive) render();
    };
    Object.defineProperty(window, 'queryPadConceptErActive', { configurable: true, get: function () { return !concept.hidden; } });
    window.queryPadConceptErSvg = function () { return conceptSvgMarkup(); };
    window.renderQueryPadConceptEr = render;
    document.querySelector('[data-concept-tool="standard"]')?.addEventListener('click', function () { setActive(false); });
    setScale(1);
    concept.addEventListener('wheel', function (event) {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      if (event.deltaY > 0) zoomOut(); else zoomIn();
    }, { passive: false });
    concept.addEventListener('pointerdown', function (event) {
      if (event.pointerType !== 'touch') return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) {
        var values = pointers.values();
        var first = values.next().value;
        var second = values.next().value;
        pinchStartDistance = Math.hypot(first.x - second.x, first.y - second.y);
        pinchStartScale = scale;
      }
    });
    concept.addEventListener('pointermove', function (event) {
      if (event.pointerType !== 'touch' || !pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2 && pinchStartDistance > 0) {
        var values = pointers.values();
        var first = values.next().value;
        var second = values.next().value;
        var distance = Math.hypot(first.x - second.x, first.y - second.y);
        if (distance > 0) setScale(pinchStartScale * distance / pinchStartDistance);
      }
    });
    concept.addEventListener('pointerup', function (event) {
      if (event.pointerType !== 'touch') return;
      pointers.delete(event.pointerId);
      if (pointers.size < 2) { pinchStartDistance = 0; pinchStartScale = scale; }
    });
    concept.addEventListener('pointercancel', function (event) {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) { pinchStartDistance = 0; pinchStartScale = scale; }
    });
    concept.addEventListener('click', function (event) { if (connectMode || event.target.closest('.er-concept-entity') || event.target.closest('.er-concept-attribute') || event.target.closest('.er-concept-relation')) return; selectedConceptEntity = ''; selectedConceptAttribute = null; concept.querySelectorAll('.is-selected').forEach(function (item) { item.classList.remove('is-selected'); }); });
  }

  function conceptSvgMarkup() {
    var model = getSchema(); if (!model) return '<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="700"></svg>';
    ensureModel();
    var columns = Math.min(3, Math.max(1, model.tables.length));
    var conceptWidth = Math.max(1100, 500 + (columns - 1) * 550);
    var conceptHeight = Math.max(700, 520 + Math.floor(Math.max(0, model.tables.length - 1) / 3) * 360);
    var lines = []; var entities = []; var attrs = []; var relations = [];
    function line(x1, y1, x2, y2) { lines.push('<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="#71839b" stroke-width="1.35"/>'); }
    (model.tables || []).forEach(function (table, index) { var p = entityPosition(table, index); var c = entityCenter(p); entities.push('<rect x="' + p.x + '" y="' + p.y + '" width="154" height="56" fill="#fff" stroke="#4b6584" stroke-width="1.5"/><text x="' + c.x + '" y="' + (c.y + 5) + '" fill="#233c5e" font-family="sans-serif" font-size="13" font-weight="700" text-anchor="middle">' + esc(table.name) + '</text>'); (table.fields || []).slice(0, 14).forEach(function (field, fieldIndex) { var point = attributePosition(table, fieldIndex, Math.max(1, Math.min(14, table.fields.length))); line(c.x, c.y, point.x, point.y); attrs.push('<ellipse cx="' + point.x + '" cy="' + point.y + '" rx="56" ry="22" fill="#fff" stroke="#71839b" stroke-width="' + (field.pk ? '2' : '1.35') + '"/><text x="' + point.x + '" y="' + (point.y + 4) + '" fill="#526a87" font-family="monospace" font-size="10" text-anchor="middle"' + (field.pk ? ' text-decoration="underline"' : '') + '>' + esc(field.name || '属性') + '</text>'); }); });
    (model.relations || []).forEach(function (relation, index) { var from = model.tables.find(function (table) { return table.name === relation.fromTable; }); var to = model.tables.find(function (table) { return table.name === relation.toTable; }); var point = relationPoint(relation, index); if (!from || !to || !point) return; var a = entityEdge(entityPosition(from, model.tables.indexOf(from)), point); var b = entityEdge(entityPosition(to, model.tables.indexOf(to)), point); var ends = cardinalityEnds(relation); line(a.x, a.y, point.x, point.y); line(point.x, point.y, b.x, b.y); relations.push('<g transform="translate(' + point.x + ' ' + point.y + ') rotate(45)"><rect x="-33" y="-33" width="66" height="66" fill="#fff" stroke="#71839b" stroke-width="1.35"/></g><text x="' + point.x + '" y="' + (point.y + 4) + '" fill="#526a87" font-family="sans-serif" font-size="10" text-anchor="middle">' + esc(relationName(relation)) + '</text><text x="' + ((a.x + point.x) / 2 - 12) + '" y="' + ((a.y + point.y) / 2 - 7) + '" fill="#526a87" font-family="monospace" font-size="11">' + esc(ends[0]) + '</text><text x="' + ((b.x + point.x) / 2 + 5) + '" y="' + ((b.y + point.y) / 2 - 7) + '" fill="#526a87" font-family="monospace" font-size="11">' + esc(ends[1]) + '</text>'); });
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + conceptWidth + '" height="' + conceptHeight + '" viewBox="0 0 ' + conceptWidth + ' ' + conceptHeight + '"><rect width="100%" height="100%" fill="#fff"/>' + lines.join('') + attrs.join('') + relations.join('') + entities.join('') + '</svg>';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
