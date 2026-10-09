(function () {
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  ready(function () {
    if (window.queryPadReady) return;
    var toast = document.getElementById('toast');
    function message(text) {
      if (!toast) return;
      toast.textContent = text;
      toast.classList.add('show');
      window.clearTimeout(window.__queryPadToast);
      window.__queryPadToast = window.setTimeout(function () { toast.classList.remove('show'); }, 1800);
    }
    function click(id, fn) {
      var element = document.getElementById(id);
      if (element && !element.dataset.fallbackBound) {
        element.dataset.fallbackBound = '1';
        element.addEventListener('click', fn);
      }
    }
    function showModal(id) {
      var modal = document.getElementById(id);
      if (modal) { modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); }
    }
    function hideModal(id) {
      var modal = document.getElementById(id);
      if (modal) { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); }
    }
    function renderResult(result) {
      var table = document.getElementById('resultTable');
      if (!table || !result) return;
      var columns = result.columns || [];
      var values = result.values || [];
      table.querySelector('thead tr').innerHTML = ['#'].concat(columns).map(function (item) { return '<th>' + item + '</th>'; }).join('');
      table.querySelector('tbody').innerHTML = values.map(function (row, index) { return '<tr><td>' + String(index + 1).padStart(2, '0') + '</td>' + row.map(function (value) { return '<td>' + (value == null ? 'NULL' : value) + '</td>'; }).join('') + '</tr>'; }).join('');
      var meta = document.getElementById('resultMeta');
      if (meta) meta.textContent = (result.rowCount || values.length) + ' 行 · 本地';
    }
    function run() {
      var editor = document.getElementById('sqlEditor');
      var sql = editor ? editor.value.trim() : '';
      if (!sql) { message('先输入一条 SQL 语句'); return; }
      try {
        if (!window.queryPadEngine) throw new Error('本地引擎尚未加载，请刷新页面重试');
        renderResult(window.queryPadEngine.execute(sql));
        message('离线执行成功');
      } catch (error) { message(error.message || 'SQL 执行失败'); }
    }
    click('runBtn', run);
    click('mobileRun', run);
    click('clearBtn', function () { var editor = document.getElementById('sqlEditor'); if (editor) editor.value = ''; message('编辑器已清空'); });
    click('formatBtn', function () { var editor = document.getElementById('sqlEditor'); if (editor) editor.value = editor.value.replace(/\\s+/g, ' ').replace(/\\s+(FROM|WHERE|ORDER BY|GROUP BY|JOIN|LIMIT)\\s+/ig, '\\n$1 ').trim(); message('SQL 已格式化'); });
    document.querySelectorAll('.chip').forEach(function (chip) { if (!chip.dataset.fallbackBound) { chip.dataset.fallbackBound = '1'; chip.addEventListener('click', function () { var editor = document.getElementById('sqlEditor'); if (editor) editor.value = chip.dataset.query.replace(/\\n/g, '\\n'); }); } });
    click('schemaBtn', function () { document.body.classList.add('drawer-open'); });
    click('erBtn', function () { showModal('erModal'); });
    click('designBtn', function () { showModal('designModal'); });
    click('projectBtnTop', function () { showModal('projectModal'); });
    click('projectNav', function () { showModal('projectModal'); });
    click('workbenchNav', function () { window.scrollTo(0, 0); });
    click('databaseNav', function () { document.body.classList.add('drawer-open'); });
    click('erNav', function () { showModal('erModal'); });
    click('practiceNav', function () { message('练习题功能已打开'); });
    click('toolsNav', function () { showModal('designModal'); });
    click('drawerClose', function () { document.body.classList.remove('drawer-open'); });
    click('erClose', function () { hideModal('erModal'); });
    click('designClose', function () { hideModal('designModal'); });
    click('projectClose', function () { hideModal('projectModal'); });
    var drawerBackdrop = document.getElementById('drawerBackdrop');
    if (drawerBackdrop) drawerBackdrop.addEventListener('click', function () { document.body.classList.remove('drawer-open'); });
    ['erModal', 'designModal', 'projectModal'].forEach(function (id) { var modal = document.getElementById(id); if (modal) modal.addEventListener('click', function (event) { if (event.target === modal) hideModal(id); }); });
    window.addEventListener('error', function (event) { message('页面脚本出现问题：' + (event.message || '未知错误')); });
  });
})();
