(function () {
  function imageFromFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = reject;
      reader.onload = function () { var image = new Image(); image.onload = function () { resolve({ image: image, dataUrl: reader.result }); }; image.onerror = reject; image.src = reader.result; };
      reader.readAsDataURL(file);
    });
  }

  function parseNativeText(text) {
    var entities = [];
    var lines = String(text || '').split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);
    lines.forEach(function (line, index) {
      var entityMatch = line.match(/^([\w\u4e00-\u9fa5-]{2,32})(?:表|实体|entity|table)?\s*[:：]?\s*(.*)$/i);
      if (!entityMatch) return;
      var name = entityMatch[1];
      if (/^(id|name|type|字段|属性|实体|联系|关系|说明)$/i.test(name)) return;
      var fields = [];
      var rest = entityMatch[2] || '';
      rest.split(/[;,，；|]/).map(function (part) { return part.trim(); }).filter(Boolean).forEach(function (part) {
        var field = part.match(/^([\w\u4e00-\u9fa5-]{1,32})\s*(?:[:： ]\s*)?([A-Z][A-Z0-9_()]*|整数|文本|日期|数字)?$/i);
        if (field) fields.push({ name: field[1], type: field[2] || 'TEXT', pk: /^id$|编号|主键/i.test(field[1]) });
      });
      entities.push({ name: name.replace(/表$/, ''), fields: fields.length ? fields : [{ name: 'id', type: 'INT', pk: true }, { name: 'field_1', type: 'TEXT' }], x: 30 + (entities.length % 3) * 245, y: 55 + Math.floor(entities.length / 3) * 180 });
    });
    var relations = [];
    lines.forEach(function (line) { var relation = line.match(/([\w\u4e00-\u9fa5-]{2,32})\s*(?:[-—>]|连接|关联|belongs to|has)\s*([\w\u4e00-\u9fa5-]{2,32})/i); if (!relation) return; var from = entities.findIndex(function (entity) { return entity.name === relation[1].replace(/表$/, ''); }); var to = entities.findIndex(function (entity) { return entity.name === relation[2].replace(/表$/, ''); }); if (from >= 0 && to >= 0) relations.push({ from: from, to: to, cardinality: /N\s*[:：]\s*N|多对多/.test(line) ? 'N:N' : /1\s*[:：]\s*1/.test(line) ? '1:1' : /1\s*[:：]\s*N|一对多/.test(line) ? '1:N' : 'N:1' }); });
    return { entities: entities, relations: relations, source: 'native-ocr', rawText: text };
  }

  function detectBoxes(image) {
    var maxWidth = 1000;
    var scale = Math.min(1, maxWidth / image.width);
    var width = Math.max(1, Math.round(image.width * scale));
    var height = Math.max(1, Math.round(image.height * scale));
    var canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    var context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(image, 0, 0, width, height);
    var pixels = context.getImageData(0, 0, width, height).data;
    var darkRows = []; var darkCols = [];
    for (var y = 0; y < height; y += 1) { var rowCount = 0; for (var x = 0; x < width; x += 2) { var p = (y * width + x) * 4; var gray = (pixels[p] + pixels[p + 1] + pixels[p + 2]) / 3; if (gray < 155) rowCount += 1; } darkRows[y] = rowCount; }
    for (var x = 0; x < width; x += 1) { var colCount = 0; for (var y = 0; y < height; y += 2) { var p = (y * width + x) * 4; var gray = (pixels[p] + pixels[p + 1] + pixels[p + 2]) / 3; if (gray < 155) colCount += 1; } darkCols[x] = colCount; }
    var boxes = [];
    for (var top = 0; top < height - 55; top += 8) {
      if (darkRows[top] < width * 0.12) continue;
      var bottom = -1;
      for (var candidate = top + 45; candidate < Math.min(height, top + 300); candidate += 8) { if (darkRows[candidate] >= width * 0.12) { bottom = candidate; break; } }
      if (bottom < 0) continue;
      var left = -1; var right = -1;
      for (var leftCandidate = 0; leftCandidate < width - 70; leftCandidate += 8) { if (darkCols[leftCandidate] > (bottom - top) * 0.14) { left = leftCandidate; break; } }
      for (var rightCandidate = width - 1; rightCandidate > (left > 0 ? left + 70 : 70); rightCandidate -= 8) { if (darkCols[rightCandidate] > (bottom - top) * 0.14) { right = rightCandidate; break; } }
      if (left >= 0 && right > left && right - left >= 90 && bottom - top >= 45) {
        var candidateBox = { x: Math.round(left / scale), y: Math.round(top / scale), width: Math.round((right - left) / scale), height: Math.round((bottom - top) / scale) };
        if (!boxes.some(function (box) { return Math.abs(box.x - candidateBox.x) < 35 && Math.abs(box.y - candidateBox.y) < 35; })) boxes.push(candidateBox);
      }
    }
    boxes = boxes.slice(0, 8);
    if (!boxes.length) boxes = [{ x: 32, y: 72, width: 178, height: 130 }, { x: 300, y: 200, width: 178, height: 130 }, { x: 585, y: 72, width: 178, height: 130 }];
    return boxes.map(function (box, index) { return { name: '识别实体' + (index + 1), fields: [{ name: 'id', type: 'INT', pk: true }, { name: 'field_1', type: 'TEXT' }, { name: 'field_2', type: 'TEXT' }], x: Math.min(650, box.x), y: Math.min(410, box.y), box: box }; });
  }

  window.queryPadRecognizeEr = async function (file) {
    if (!file) return;
    try {
      if (window.AndroidOcr && typeof window.AndroidOcr.recognize === 'function') {
        var nativeReader = new FileReader();
        nativeReader.onload = function () { window.AndroidOcr.recognize(nativeReader.result); };
        nativeReader.readAsDataURL(file);
        window.showQueryPadToast && window.showQueryPadToast('正在使用 Android 本地 OCR 识别');
        return;
      }
      var loaded = await imageFromFile(file);
      var entities = detectBoxes(loaded.image);
      var result = { entities: entities, relations: [], source: 'local-layout', rawText: '' };
      if (window.renderRecognizedEr) window.renderRecognizedEr(result);
      window.showQueryPadToast && window.showQueryPadToast(`检测到 ${entities.length} 个版面候选；浏览器未识别文字或关系，请手动核对，Android OCR 可识别文字`);
    } catch (error) { window.showQueryPadToast && window.showQueryPadToast('图片识别失败：' + (error.message || '无法读取图片')); }
  };
  window.onNativeOcrResult = function (text) { var result = parseNativeText(text); if (window.renderRecognizedEr) window.renderRecognizedEr(result); window.showQueryPadToast && window.showQueryPadToast(`OCR 识别到 ${result.entities.length} 个实体候选，请确认结果`); };
})();
