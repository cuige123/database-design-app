(function () {
  class OfflineEngine {
    constructor() {
      this.tables = {};
      this.ready = false;
      this.seed();
    }

    seed() {
      this.tables.students = {
        columns: ['id', 'name', 'score', 'major'],
        rows: [
          { id: 1, name: '陈思远', score: 96, major: '计算机科学' },
          { id: 2, name: '林晓雨', score: 92, major: '软件工程' },
          { id: 3, name: '周子航', score: 88, major: '计算机科学' },
          { id: 4, name: '赵可欣', score: 85, major: '数据科学' }
        ]
      };
      const additionalStudentNames = ['吴一凡','郑雨桐','孙浩然','马嘉宁','朱子墨','胡安琪','郭明轩','何若溪','高逸飞','罗欣怡','梁宇航','宋佳音','谢承泽','唐婉清','许知远','韩思齐','冯嘉树','邓语嫣','曹景行','彭星月','曾梓涵','萧亦辰','田梦瑶','董书言','袁子恒','潘雨薇'];
      const majors = ['计算机科学', '软件工程', '数据科学'];
      additionalStudentNames.forEach((name, index) => {
        this.tables.students.rows.push({
          id: index + 5,
          name,
          score: 60 + ((index * 17 + 9) % 41),
          major: majors[index % majors.length]
        });
      });
      this.tables.courses = {
        columns: ['id', 'title', 'credits'],
        rows: [
          { id: 1, title: 'MySQL 基础', credits: 3 },
          { id: 2, title: 'Web 开发实战', credits: 2 },
          { id: 3, title: '数据结构', credits: 4 }
        ]
      };
      const additionalCourses = [
        ['Python 数据分析', 3],
        ['数据库系统', 4],
        ['算法设计', 5],
        ['操作系统', 4],
        ['网络安全', 2],
        ['数据可视化', 3],
        ['Java 程序设计', 4],
        ['Web 前端进阶', 2],
        ['云计算导论', 3],
        ['MySQL 高级应用', 5],
        ['软件测试基础', 2],
        ['人工智能导论', 4],
        ['Web 安全实践', 3]
      ];
      additionalCourses.forEach(([title, credits], index) => {
        this.tables.courses.rows.push({ id: index + 4, title, credits });
      });
      this.tables.enrollments = {
        columns: ['id', 'student_id', 'course_id', 'enrolled_at'],
        rows: [
          { id: 1, student_id: 1, course_id: 1, enrolled_at: '2026-09-01' },
          { id: 2, student_id: 2, course_id: 2, enrolled_at: '2026-09-02' },
          { id: 3, student_id: 3, course_id: 1, enrolled_at: '2026-09-03' }
        ]
      };
      for (let index = 0; index < 120; index += 1) {
        const day = String(index % 30 + 1).padStart(2, '0');
        this.tables.enrollments.rows.push({
          id: index + 4,
          student_id: index % this.tables.students.rows.length + 1,
          course_id: index % this.tables.courses.rows.length + 1,
          enrolled_at: `2026-09-${day}`
        });
      }
      this.ready = true;
    }

    normalize(sql) {
      return sql.trim().replace(/`/g, '').replace(/\s+/g, ' ');
    }

    literal(value) {
      const text = value.trim();
      if (/^null$/i.test(text)) return null;
      if ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"'))) return text.slice(1, -1).replace(/''/g, "'");
      if (!Number.isNaN(Number(text))) return Number(text);
      return text;
    }

    splitValues(input) {
      const values = [];
      let current = '';
      let quote = '';
      for (let index = 0; index < input.length; index += 1) {
        const char = input[index];
        if (quote) {
          current += char;
          if (char === quote && input[index + 1] === quote) {
            current += input[index + 1];
            index += 1;
          } else if (char === quote) quote = '';
        } else if (char === "'" || char === '"') {
          quote = char;
          current += char;
        } else if (char === ',') {
          values.push(this.literal(current));
          current = '';
        } else current += char;
      }
      if (current.trim()) values.push(this.literal(current));
      return values;
    }

    splitTopLevel(input) {
      const parts = [];
      let current = '';
      let quote = '';
      let depth = 0;
      for (let index = 0; index < input.length; index += 1) {
        const char = input[index];
        if (quote) {
          current += char;
          if (char === quote && input[index + 1] === quote) {
            current += input[index + 1];
            index += 1;
          } else if (char === quote) quote = '';
        } else if (char === "'" || char === '"') {
          quote = char;
          current += char;
        } else if (char === '(') {
          depth += 1;
          current += char;
        } else if (char === ')') {
          depth -= 1;
          if (depth < 0) throw new Error('SQL 括号不匹配');
          current += char;
        } else if (char === ',' && depth === 0) {
          parts.push(current.trim());
          current = '';
        } else current += char;
      }
      if (quote || depth !== 0) throw new Error('SQL 引号或括号不匹配');
      if (current.trim()) parts.push(current.trim());
      return parts;
    }

    makeContext(sources, sourceRows) {
      const context = { __tables: sourceRows, __columns: {} };
      sources.forEach(source => {
        source.table.columns.forEach(column => {
          const value = sourceRows[source.alias][column];
          context.__columns[`${source.alias}.${column}`] = [value];
          if (!context.__columns[column]) context.__columns[column] = [];
          context.__columns[column].push(value);
        });
      });
      Object.keys(context.__columns).forEach(key => {
        if (context.__columns[key].length === 1) context[key] = context.__columns[key][0];
      });
      return context;
    }

    resolveColumn(row, reference, allowedColumns) {
      if (row.__columns) {
        const values = row.__columns[reference];
        if (!values) throw new Error(`WHERE 字段不存在：${reference}`);
        if (values.length !== 1) throw new Error(`WHERE 字段 ${reference} 不明确，请使用表别名限定`);
        return values[0];
      }
      const key = reference.split('.').pop();
      if (allowedColumns && !allowedColumns.includes(key)) throw new Error(`WHERE 字段不存在：${reference}`);
      if (!Object.prototype.hasOwnProperty.call(row, key)) throw new Error(`WHERE 字段不存在：${reference}`);
      return row[key];
    }

    splitLogical(expression, keyword) {
      const parts = [];
      let quote = '';
      let start = 0;
      const upper = expression.toUpperCase();
      for (let index = 0; index <= expression.length - keyword.length; index += 1) {
        const char = expression[index];
        if (quote) {
          if (char === quote && expression[index + 1] === quote) index += 1;
          else if (char === quote) quote = '';
          continue;
        }
        if (char === "'" || char === '"') { quote = char; continue; }
        if (upper.slice(index, index + keyword.length) !== keyword) continue;
        const before = expression[index - 1] || ' ';
        const after = expression[index + keyword.length] || ' ';
        if (/\w/.test(before) || /\w/.test(after)) continue;
        parts.push(expression.slice(start, index).trim());
        index += keyword.length - 1;
        start = index + 1;
      }
      if (parts.length) parts.push(expression.slice(start).trim());
      return parts;
    }

    execute(sql) {
      if (!this.ready) throw new Error('本地引擎尚未就绪');
      const statement = this.normalize(sql).replace(/;$/, '');
      if (!statement) throw new Error('请输入 SQL 语句');
      if (/^select\s+/i.test(statement)) return this.select(statement);
      if (/^create\s+table\s+/i.test(statement)) return this.create(statement);
      if (/^insert\s+into\s+/i.test(statement)) return this.insert(statement);
      if (/^update\s+/i.test(statement)) return this.update(statement);
      if (/^delete\s+from\s+/i.test(statement)) return this.remove(statement);
      if (/^(?:show\s+tables(?:\s|$)|describe\s+|desc\s+)/i.test(statement)) return this.metadata(statement);
      throw new Error('离线引擎暂不支持这条语句，请使用课程常用的增删改查 SQL。');
    }

    table(name) {
      const table = this.tables[name.toLowerCase()];
      if (!table) throw new Error(`找不到数据表：${name}`);
      return table;
    }

    create(sql) {
      const match = sql.match(/^create\s+table\s+(if\s+not\s+exists\s+)?([\w-]+)\s*\(/i);
      if (!match) throw new Error('CREATE TABLE 语法无法识别');
      const openIndex = match[0].lastIndexOf('(');
      let depth = 1;
      let quote = '';
      let closeIndex = -1;
      for (let index = openIndex + 1; index < sql.length; index += 1) {
        const char = sql[index];
        if (quote) {
          if (char === quote && sql[index + 1] === quote) index += 1;
          else if (char === quote) quote = '';
        } else if (char === "'" || char === '"') quote = char;
        else if (char === '(') depth += 1;
        else if (char === ')') {
          depth -= 1;
          if (depth === 0) { closeIndex = index; break; }
        }
      }
      if (closeIndex < 0 || quote) throw new Error('CREATE TABLE 括号或引号不匹配');
      const suffix = sql.slice(closeIndex + 1).trim();
      if (suffix && !/^(?:engine\s*=\s*\w+)?(?:\s+default\s+charset\s*=\s*[\w-]+)?$/i.test(suffix)) throw new Error('CREATE TABLE 选项暂不支持');
      const name = match[2];
      const key = name.toLowerCase();
      if (this.tables[key] && match[1]) return { columns: ['message'], values: [['数据表已存在 ' + name]], rowCount: 1, kind: 'message' };
      const definitions = this.splitTopLevel(sql.slice(openIndex + 1, closeIndex));
      const columns = definitions.filter(part => !/^(?:constraint\b|primary\s+key\b|foreign\s+key\b|unique\b|key\b|index\b)/i.test(part))
        .map(part => part.match(/^`?([\w-]+)`?\s+/)?.[1])
        .filter(Boolean);
      if (!columns.length) throw new Error('CREATE TABLE 至少需要一个字段');
      if (columns.length !== definitions.filter(part => !/^(?:constraint\b|primary\s+key\b|foreign\s+key\b|unique\b|key\b|index\b)/i.test(part)).length) throw new Error('CREATE TABLE 字段定义无法识别');
      this.tables[key] = { columns, rows: [] };
      return { columns: ['message'], values: [['已创建表 ' + name]], rowCount: 1, kind: 'message' };
    }

    insert(sql) {
      const match = sql.match(/^insert\s+into\s+([\w-]+)\s*(?:\(([^)]+)\))?\s*values\s*\((.+)\)$/i);
      if (!match) throw new Error('INSERT 语法无法识别');
      const table = this.table(match[1]);
      const columns = (match[2] ? match[2].split(',') : table.columns).map(item => item.trim());
      const values = this.splitValues(match[3]);
      if (columns.length !== values.length) throw new Error('字段数量和数据数量不一致');
      const row = Object.fromEntries(table.columns.map(column => [column, null]));
      columns.forEach((column, index) => { if (!table.columns.includes(column)) throw new Error(`字段不存在：${column}`); row[column] = values[index]; });
      table.rows.push(row);
      return { columns: ['message'], values: [['已插入 1 行']], rowCount: 1, kind: 'message' };
    }

    condition(row, expression, allowedColumns) {
      if (!expression) return true;
      const text = expression.trim();
      const orParts = this.splitLogical(text, 'OR');
      if (orParts.length) return orParts.some(part => this.condition(row, part, allowedColumns));
      const andParts = this.splitLogical(text, 'AND');
      if (andParts.length) return andParts.every(part => this.condition(row, part, allowedColumns));
      const match = text.match(/^([\w.]+)\s*(IS\s+NOT\s+NULL|IS\s+NULL|LIKE|>=|<=|<>|!=|=|>|<)\s*(.*?)$/i);
      if (!match) throw new Error(`WHERE 条件无法识别：${text}`);
      const actual = this.resolveColumn(row, match[1], allowedColumns);
      const operator = match[2].toUpperCase().replace(/\s+/g, ' ');
      if (operator === 'IS NULL') return actual === null || actual === undefined;
      if (operator === 'IS NOT NULL') return actual !== null && actual !== undefined;
      if (!match[3]) throw new Error(`WHERE 运算符缺少比较值：${operator}`);
      const value = this.literal(match[3]);
      if (operator === 'LIKE') return String(actual ?? '').toLowerCase().includes(String(value).replace(/%/g, '').toLowerCase());
      if (operator === '=') return actual !== null && actual !== undefined && String(actual) === String(value);
      if (operator === '!=' || operator === '<>') return String(actual) !== String(value);
      if (operator === '>') return actual > value;
      if (operator === '<') return actual < value;
      if (operator === '>=') return actual >= value;
      if (operator === '<=') return actual <= value;
      throw new Error(`WHERE 运算符暂不支持：${operator}`);
    }

    validateCondition(row, expression, allowedColumns) {
      const text = expression.trim();
      if (!text) throw new Error('WHERE 条件不能为空');
      const orParts = this.splitLogical(text, 'OR');
      if (orParts.length) { orParts.forEach(part => this.validateCondition(row, part, allowedColumns)); return; }
      const andParts = this.splitLogical(text, 'AND');
      if (andParts.length) { andParts.forEach(part => this.validateCondition(row, part, allowedColumns)); return; }
      const match = text.match(/^([\w.]+)\s*(IS\s+NOT\s+NULL|IS\s+NULL|LIKE|>=|<=|<>|!=|=|>|<)\s*(.*?)$/i);
      if (!match) throw new Error(`WHERE 条件无法识别：${text}`);
      this.resolveColumn(row, match[1], allowedColumns);
      const operator = match[2].toUpperCase().replace(/\s+/g, ' ');
      if (operator !== 'IS NULL' && operator !== 'IS NOT NULL' && !match[3]) throw new Error(`WHERE 运算符缺少比较值：${operator}`);
    }

    select(sql) {
      const match = sql.match(/^select\s+([\s\S]+?)\s+from\s+([\w-]+)(?:\s+(?:as\s+)?(?!inner\b|join\b|left\b|right\b|full\b|cross\b|outer\b|where\b|group\b|order\b|limit\b)(\w+))?([\s\S]*)$/i);
      if (!match) throw new Error('SELECT 语法无法识别');
      const fieldsText = match[1].trim();
      const baseTable = this.table(match[2]);
      const sources = [{ table: baseTable, alias: match[3] || match[2] }];
      let rest = match[4] || '';
      let contexts = baseTable.rows.map(row => this.makeContext(sources, { [sources[0].alias]: row }));
      let joinMatch;
      const joinPattern = /^\s+(?:inner\s+)?join\s+([\w-]+)(?:\s+(?:as\s+)?(?!on\b|where\b|group\b|order\b|limit\b|join\b|left\b|right\b|full\b|cross\b|outer\b)(\w+))?\s+on\s+([\w.]+)\s*=\s*([\w.]+)/i;
      while ((joinMatch = rest.match(joinPattern))) {
        const table = this.table(joinMatch[1]);
        const source = { table, alias: joinMatch[2] || joinMatch[1] };
        if (sources.some(item => item.alias === source.alias)) throw new Error(`JOIN 别名重复：${source.alias}`);
        sources.push(source);
        const leftName = joinMatch[3];
        const rightName = joinMatch[4];
        const leftSource = sources.find(item => item.alias === leftName.split('.')[0]);
        const rightSource = sources.find(item => item.alias === rightName.split('.')[0]);
        if (!leftSource || !rightSource) throw new Error('JOIN 条件请使用有效的表别名和字段名');
        const leftColumn = leftName.split('.').pop();
        const rightColumn = rightName.split('.').pop();
        if (!leftSource.table.columns.includes(leftColumn) || !rightSource.table.columns.includes(rightColumn)) throw new Error('JOIN 条件包含不存在的字段');
        const previousSources = sources.slice(0, -1);
        const nextContexts = [];
        contexts.forEach(context => {
          table.rows.forEach(row => {
            const combined = this.makeContext(sources, { ...context.__tables, [source.alias]: row });
            if (String(this.resolveColumn(combined, leftName)) === String(this.resolveColumn(combined, rightName))) nextContexts.push(combined);
          });
        });
        contexts = nextContexts;
        rest = rest.slice(joinMatch[0].length);
        if (previousSources.length === 0) throw new Error('JOIN 缺少左侧数据表');
      }
      if (/^\s+(?:left|right|full|cross|outer)\s+join\b/i.test(rest)) throw new Error('离线引擎当前仅支持 INNER JOIN');
      let where = null;
      let group = null;
      let order = null;
      let limit = null;
      let clause = rest.match(/^\s+where\s+([\s\S]+?)(?=\s+(?:group\s+by|order\s+by|limit)\b|$)/i);
      if (clause) { where = clause[1]; rest = rest.slice(clause[0].length); }
      clause = rest.match(/^\s+group\s+by\s+([\w.]+)\b/i);
      if (clause) { group = clause[1]; rest = rest.slice(clause[0].length); }
      clause = rest.match(/^\s+order\s+by\s+([\w.]+)(?:\s+(asc|desc))?/i);
      if (clause) { order = { column: clause[1], direction: (clause[2] || 'asc').toLowerCase() }; rest = rest.slice(clause[0].length); }
      clause = rest.match(/^\s+limit\s+(\d+)/i);
      if (clause) { limit = Number(clause[1]); rest = rest.slice(clause[0].length); }
      if (rest.trim()) throw new Error(`SELECT 语法暂不支持：${rest.trim()}`);
      if (where !== null) {
        const emptyRows = Object.fromEntries(sources.map(source => [source.alias, Object.fromEntries(source.table.columns.map(column => [column, null]))]));
        this.validateCondition(this.makeContext(sources, emptyRows), where);
        contexts = contexts.filter(row => this.condition(row, where));
      }
      if (order) {
        this.resolveColumn(contexts[0] || this.makeContext(sources, Object.fromEntries(sources.map(source => [source.alias, Object.fromEntries(source.table.columns.map(column => [column, null]))]))), order.column);
        const direction = order.direction === 'desc' ? -1 : 1;
        contexts.sort((a, b) => { const left = this.resolveColumn(a, order.column); const right = this.resolveColumn(b, order.column); return left > right ? direction : left < right ? -direction : 0; });
      }
      const fields = this.splitTopLevel(fieldsText).map(expression => {
        const field = expression.match(/^([\w.]+|\*|[\w.]+\.\*)\s*(?:as\s+([\w-]+))?$/i);
        const count = expression.match(/^count\s*\(\s*(\*|[\w.]+)\s*\)\s*(?:as\s+([\w-]+))?$/i);
        if (!field && !count) throw new Error(`SELECT 字段暂不支持：${expression}`);
        return count ? { expression, count: count[1], output: count[2] || 'COUNT(*)' } : { expression: field[1], output: field[2] || field[1].split('.').pop() };
      });
      const emptyRows = Object.fromEntries(sources.map(source => [source.alias, Object.fromEntries(source.table.columns.map(column => [column, null]))]));
      const emptyContext = this.makeContext(sources, emptyRows);
      fields.forEach(field => {
        if (field.count && field.count !== '*') this.resolveColumn(emptyContext, field.count);
        else if (!field.count && field.expression !== '*' && !field.expression.endsWith('.*')) this.resolveColumn(emptyContext, field.expression);
        else if (field.expression.endsWith('.*') && !sources.some(source => source.alias === field.expression.slice(0, -2))) throw new Error(`找不到 JOIN 别名：${field.expression.slice(0, -2)}`);
      });
      if (group) {
        this.resolveColumn(contexts[0] || this.makeContext(sources, Object.fromEntries(sources.map(source => [source.alias, Object.fromEntries(source.table.columns.map(column => [column, null]))]))), group);
        const grouped = new Map();
        contexts.forEach(row => { const value = this.resolveColumn(row, group); if (!grouped.has(value)) grouped.set(value, []); grouped.get(value).push(row); });
        contexts = Array.from(grouped.values()).map(rows => ({ __groupRows: rows, __groupValue: this.resolveColumn(rows[0], group), __groupKey: group }));
        contexts.forEach(row => { row[group] = row.__groupValue; });
      }
      const hasAggregate = fields.some(field => field.count);
      if (hasAggregate && !group) contexts = [{ __groupRows: contexts }];
      if (limit !== null && !hasAggregate) contexts = contexts.slice(0, limit);
      const columns = [];
      const values = contexts.map(row => {
        const groupRows = row.__groupRows;
        const output = [];
        fields.forEach(field => {
          if (field.count) {
            const count = groupRows.filter(item => field.count === '*' || this.resolveColumn(item, field.count) !== null).length;
            if (!columns.includes(field.output)) columns.push(field.output);
            output.push(count);
          } else if (field.expression === '*') {
            sources.forEach(source => source.table.columns.forEach(column => {
              const label = sources.filter(item => item.table.columns.includes(column)).length > 1 ? `${source.alias}.${column}` : column;
              if (!columns.includes(label)) columns.push(label);
              output.push(row.__groupRows ? this.resolveColumn(row.__groupRows[0], `${source.alias}.${column}`) : this.resolveColumn(row, `${source.alias}.${column}`));
            }));
          } else if (field.expression.endsWith('.*')) {
            const alias = field.expression.slice(0, -2);
            const source = sources.find(item => item.alias === alias);
            if (!source) throw new Error(`找不到 JOIN 别名：${alias}`);
            source.table.columns.forEach(column => {
              const label = `${alias}.${column}`;
              if (!columns.includes(label)) columns.push(label);
              output.push(row.__groupRows ? this.resolveColumn(row.__groupRows[0], label) : this.resolveColumn(row, label));
            });
          } else {
            const sourceRows = row.__groupRows || [row];
            const value = row.__groupRows && group && field.expression === group ? row.__groupValue : this.resolveColumn(sourceRows[0], field.expression);
            if (!columns.includes(field.output)) columns.push(field.output);
            output.push(value);
          }
        });
        return output;
      });
      return { columns, values, rowCount: values.length, kind: 'query' };
    }

    update(sql) {
      const match = sql.match(/^update\s+([\w-]+)\s+set\s+([\w-]+)\s*=\s*(.+?)(?:\s+where\s+(.+))?$/i);
      if (!match) throw new Error('UPDATE 语法无法识别');
      const table = this.table(match[1]);
      if (!table.columns.includes(match[2])) throw new Error(`字段不存在：${match[2]}`);
      const value = this.literal(match[3]);
      if (match[4]) this.validateCondition(Object.fromEntries(table.columns.map(column => [column, null])), match[4], table.columns);
      let count = 0;
      table.rows.forEach(row => { if (this.condition(row, match[4], table.columns)) { row[match[2]] = value; count += 1; } });
      return { columns: ['message'], values: [[`已更新 ${count} 行`]], rowCount: 1, kind: 'message' };
    }

    remove(sql) {
      const match = sql.match(/^delete\s+from\s+([\w-]+)(?:\s+where\s+(.+))?$/i);
      if (!match) throw new Error('DELETE 语法无法识别');
      const table = this.table(match[1]);
      if (match[2]) this.validateCondition(Object.fromEntries(table.columns.map(column => [column, null])), match[2], table.columns);
      const before = table.rows.length;
      table.rows = table.rows.filter(row => !this.condition(row, match[2], table.columns));
      return { columns: ['message'], values: [[`已删除 ${before - table.rows.length} 行`]], rowCount: 1, kind: 'message' };
    }

    metadata(sql) {
      if (/show\s+tables/i.test(sql)) return { columns: ['Tables'], values: Object.keys(this.tables).map(name => [name]), rowCount: Object.keys(this.tables).length, kind: 'query' };
      const name = sql.split(/\s+/).pop();
      const table = this.table(name);
      return { columns: ['Field', 'Type'], values: table.columns.map(column => [column, 'TEXT']), rowCount: table.columns.length, kind: 'query' };
    }
  }

  window.queryPadEngine = new OfflineEngine();
})();
