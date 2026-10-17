# MySQL 智能学习实验室

一个面向数据库初学者、课程实验和日常练习的轻量学习工具。它把 SQL 查询练习、示例数据浏览、数据表结构设计和 ER 图编辑集中在一个网页中，帮助学习者从认识表结构开始，逐步练习查询、筛选、排序、分组统计与多表连接，并将数据库设计思路转化为可查看、可编辑的图表和 SQL。

应用以静态网页方式运行，不需要登录或连接远程数据库。SQL 由 SQLite WASM 在浏览器中执行；数据库文件、项目、示例数据和练习进度保存在当前浏览器中。离线缓存就绪后无需访问模型服务或远程数据库，适合教学演示和个人练习。

## 项目特点

- **SQLite WASM 数据库引擎**：使用真实 SQLite 执行查询，支持复杂查询、LEFT JOIN、子查询、CTE、事务、索引、视图和 SQLite 内置函数；数据序列化后保存在浏览器本地。
- **常见 MySQL 语法兼容**：转换部分建表选项、反引号标识符、`SHOW TABLES`、`DESC`、`INSERT IGNORE`、`TRUNCATE TABLE` 和 `LIMIT offset,count` 写法；不是完整 MySQL 兼容实现。
- **循序渐进的 SQL 练习**：内置 73 道 SQL 练习题，涵盖条件筛选、HAVING、子查询、CTE、窗口函数、日期与字符串函数、UNION 和多表连接；全部参考 SQL 均通过 SQLite 引擎回归验证。支持空白练习、按需载入完整参考 SQL 和本地自动判题。
- **增强型 SQL 编辑器**：高亮关键字、函数、字符串、数字和注释；输入时补全关键字、当前表名和字段名（Ctrl+空格可调出建议）；自动配对括号与引号，支持 Tab 缩进，并在执行失败时标记疑似错误行。
- **学习路径与错题复习**：按知识点和难度筛选练习，逐级查看思路提示；进度、提示等级与错误尝试保存在本地，通过题目后自动移出错题复习。
- **SQL 收藏、草稿与版本**：当前草稿自动保存在浏览器，可收藏常用语句并搜索/载入；编辑后的最近 40 个 SQL 版本保存在本地，支持恢复。
- **SQLite 执行计划**：查看单条只读查询的 SQLite `EXPLAIN QUERY PLAN` 和通用索引建议，不会自动建索引；执行计划不代表 MySQL 服务器执行情况。
- **按需查看参考代码**：切换练习题时默认提供空白 SQL 编辑区；可自行编写并执行，也可用“补全代码”载入当前题目的完整参考 SQL，用“初始化”重新清空编辑区。
- **可操作的示例数据库**：提供学生、课程和选课等练习数据，包括 120 名学生（覆盖 6 个专业，含少量未录入成绩的记录）、40 门课程及 360 条选课记录，便于观察查询结果和练习不同条件。样例数据集有版本号，升级后旧版本样例数据会自动替换为新样例。
- **数据预览**：数据库抽屉的“数据预览”页可查看每张表的数据（默认前 20 行），并可复制为 INSERT 语句或 CSV，或直接载入查询。
- **结果集展示上限**：查询结果最多渲染前 200 行，表格会提示“仅显示前 N 行”；判题仍使用完整结果。
- **移动端结果卡片**：窄屏下查询结果自动从表格切换为逐行卡片，避免横向滚动。
- **可视化 ER 图设计**：包含表结构 ER 图和 Chen 记法概念 ER 图两种视图。概念视图使用矩形实体、椭圆属性、菱形关系，并可标注 1:1、1:N、N:1、N:N 基数；支持拖动布局、创建/编辑/删除实体、编辑/删除属性、创建/编辑/删除关系、进入表结构编辑器、主键标识、自动排列和放大缩小（按钮、Ctrl + 滚轮、触屏双指）。两种视图共用项目中的表与关系数据，布局保存在本地项目中。
- **表结构与 SQL 辅助**：可编辑表和字段信息，生成建表 SQL 与数据字典；同步表结构时保留同名字段的数据、创建实际外键并校验约束。结构检查只检查主键和重复字段名，不声称能仅凭字段名验证 1NF、2NF 或 3NF。
- **DeepSeek AI 助手**：提供当前练习的三级 AI 提示、SQL 自动修正与逐行差异对比、错题模式分析和个性化出题，也支持 SQL 解释、错误诊断和表结构建议。提示逐级解锁；修正 SQL 只有在用户确认后替换；新题先检查只读 SQL 并确认保存，再加入本地题库。快捷问题可编辑后再发送，前端按任务最小化请求，不发送练习数据行或对话历史。本地 Node.js 模式把 API Key 放在服务端；静态网页直连模式从 `ai-config.js` 读取 API Key，网页访问者可以查看并使用它。
- **自定义 AI 对话**：在 AI 助手中选择“自定义对话”，自由输入概念、SQL 思路或项目使用问题；按本次问题附带当前 SQL（可为空）、练习要求和表结构，不发送数据库数据行或旧聊天记录，也不会自动执行或改写 SQL。
- **项目与图表管理**：支持在本地保存和切换独立项目草稿，导入和导出包含 SQLite 数据快照的项目，并按当前视图将 ER 图导出为 PNG 或 SVG。
- **本地数据重置**：项目窗口可单独恢复练习数据库初始样例并保留项目/草稿/进度，也可清除本应用保存在当前浏览器中的全部本地数据；均需用户确认。
- **面向移动设备**：界面支持触屏操作；项目还包含 Android WebView 外壳代码。
- **深色界面**：页面背景、工作区卡片和设置面板采用统一的暗色配色，降低夜间使用时的整体亮度。
- **离线使用**：网页资源可由 Service Worker 缓存；首次加载和缓存更新仍需要网络环境配合。

## 快速开始

### 一键启动（Windows）

双击项目根目录的 `启动MySQL实验室.bat` 即可：脚本会检测 Node.js、在 4173 端口启动服务器，并自动打开浏览器。保持该窗口开启即为运行中，关闭窗口即停止服务器。若服务器已在运行，再次双击只会打开浏览器，不会重复启动。

### 通过本地服务器运行

SQLite WASM 需要从 HTTP(S) 加载 WebAssembly 文件。直接以 `file://` 打开页面不能启动 SQL 引擎；请使用本地静态服务器，或运行 Android App。此外，浏览器在 `file://` 下会禁用 `localStorage` 和 `IndexedDB`，练习数据与项目将无法保存，因此不建议绕过本地服务器。

### 使用本地静态服务器

本地 Node.js 模式需要 Node.js 20 或更高版本启动同源后端，AI 密钥通过环境变量读取：

```powershell
$env:DEEPSEEK_API_KEY="在服务器环境中配置你的新密钥"
npm start
```

然后访问 <http://localhost:4173/index.html>。本地 AI 请求由 Node.js 服务端转发，密钥放在 `DEEPSEEK_API_KEY` 环境变量中。部署到其他 Node 托管平台时，在平台服务端设置同名变量，并使用平台提供的 `PORT`；可选用 `DEEPSEEK_MODEL` 覆盖默认模型。

## 部署到 GitHub Pages

前端是纯静态页面，可以部署到 GitHub Pages 或 Cloudflare Pages。当前配置为静态网页直接请求 DeepSeek API，不需要部署 Worker。直接调用时必须在 `ai-config.js` 填写密钥；该密钥会出现在公开网页的源代码和浏览器网络请求中，任何访客都能复制并使用。

### 第一步：部署前端

仓库已包含工作流 `.github/workflows/deploy-pages.yml`，它会挑选网页资源（不含 `server.js`、`tests/`、`android/`、`deploy/`）并发布：

1. 推送到 `master` 分支。
2. 打开仓库 **Settings → Pages**，把 **Source** 设为 **GitHub Actions**。
3. 等待 Actions 完成，站点地址为 `https://<用户名>.github.io/database-design-app/`。

页面内所有资源都使用相对路径，因此项目站点这种子路径部署可以直接工作，Service Worker 也能在子目录下正常注册和离线缓存。注意：`index.html` 和 `ai-config.js` 采用网络优先策略，部署后刷新即可看到新版本；其余资源由缓存版本号控制。

### 可选：使用 Worker 代理代替网页直连

GitHub Pages 不能运行服务端代码，因此用 Cloudflare Worker 承载 AI 代理，免费额度足够个人使用：

```powershell
cd deploy/cloudflare-worker
npx wrangler login
npx wrangler deploy
npx wrangler secret put DEEPSEEK_API_KEY
```

如果不希望将密钥放进网页，可部署 Worker 代理。`wrangler.toml` 里的 `ALLOWED_ORIGINS` 需要包含你的实际网站来源；Worker Secret 使用 `DEEPSEEK_API_KEY`。如需更换模型，取消注释 `DEEPSEEK_MODEL`。

配置网页直连

编辑 `ai-config.js`，填写 DeepSeek API Key：

```js
window.queryPadAiApiKey = '在这里粘贴你的 DeepSeek API Key';
```

推送后 Pages 会自动重新发布。由于密钥在前端公开，使用前请在 DeepSeek 控制台设置消费上限；若不接受公开密钥，请改用上方 Worker 代理，并将 `queryPadAiDirect` 设为 `false`、把接口地址设为 Worker 的 `/api/ai/chat` 路由。

### 其他可选后端

`server.js` 同样可以部署到任意 Node 托管平台。此时设置环境变量 `ALLOWED_ORIGINS`（逗号分隔，留空表示不启用跨域）即可让它在独立域名上为 GitHub Pages 提供 AI 接口，再在 `ai-config.js` 里填写该地址。

静态网页直连时，API Key 会公开给所有访客。设置消费上限并定期检查用量；怀疑密钥泄露时应立即在 DeepSeek 控制台撤销并重建。本项目静态页面默认使用直连模式；要切换成 Worker 代理，请将 `window.queryPadAiDirect` 设为 `false`，并把接口地址改为 Worker URL 加 `/api/ai/chat`。

该 Node.js 服务同时提供网页静态文件和 `POST /api/ai/chat`，代理请求到 DeepSeek。服务端会校验并限制请求大小和任务数据、设置每 IP 每 15 分钟最多 20 次及每服务实例每小时最多 30 次的调用限制、限制模型回答长度并设置上游超时，不记录密钥或用户请求内容。部署在纯静态托管上时，需要另行部署此 Node.js 服务或编写对应的服务端函数，并把网页/API 配置到同源；仅上传前端文件无法调用模型。若面向公众开放，还应接入用户鉴权，并在模型服务商侧设置额度/消费告警；应用级频率限制不能代替账户预算保护。

## 主要文件

| 文件 | 用途 |
| --- | --- |
| `index.html` | 网页界面、题库和主要交互逻辑 |
| `启动MySQL实验室.bat` | Windows 一键启动脚本：启动本地服务器并打开浏览器 |
| `ai-config.js` | AI 接口模式、模型地址和前端直连密钥配置 |
| `offline-engine.js` | 旧版练习数据种子和本地数据迁移兼容 |
| `sqlite-engine.js` | SQLite WASM 数据库、MySQL 语法兼容和本地持久化 |
| `vendor/sql.js/` | sql.js WASM/JavaScript 运行时和 MIT 许可证 |
| `er-editor.js` | ER 图编辑、关系管理和自动布局 |
| `concept-er-editor.js` | Chen 记法概念 ER 图、独立布局和 SVG 输出 |
| `er-recognizer.js` | ER 图图片导入相关识别逻辑 |
| `self-test.js` | 页面内置功能自检 |
| `ai-assistant.js`、`assistant.css` | AI 助手界面、任务请求和上下文最小化 |
| `manifest.json`、`sw.js` | PWA 元数据与离线缓存配置 |
| `package.json`、`package-lock.json` | sql.js 运行时依赖及锁定版本 |
| `deploy/cloudflare-worker/` | AI 代理 Worker（GitHub Pages 部署时的后端） |
| `.github/workflows/deploy-pages.yml` | GitHub Pages 自动发布工作流 |
| `android/` | Android WebView 外壳项目 |

## 使用说明与限制

### AI 助手配置

本地 Node.js 模式向同源 `POST /api/ai/chat` 发送任务数据；静态网页直连模式则发送 OpenAI 兼容格式的流式请求到 DeepSeek。接口任务数据约定：

- 设计建议和 SQL 生成：`{ "task": "design_review" | "generate_sql", "prompt": "...", "schema": { "tables": [...], "relations": [...] } }`
- SQL 解释：`{ "task": "explain_sql", "prompt": "...", "sql": "..." }`
- 自定义对话：`{ "task": "custom_chat", "prompt": "...", "sql": "...", "schema": { "tables": [...], "relations": [...] }, "exercise": { ... } }`。SQL 可为空，当前练习可省略；每次回答只使用本次问题和当前页面上下文，不读取历史聊天。
- SQL 错误诊断：`{ "task": "diagnose_sql", "prompt": "...", "sql": "...", "error": "...", "schema": { "tables": [...], "relations": [...] } }`
- 分级提示：`{ "task": "hint", "prompt": "...", "level": 1, "sql": "...", "exercise": { ... } }`；`level` 只能是 1、2、3。
- SQL 自动修正：`{ "task": "repair_sql", "prompt": "...", "sql": "...", "error": "...", "schema": { "tables": [...], "relations": [...] }, "exercise": { ... } }`
- 错题分析和个性化出题：`{ "task": "wrong_analysis" | "personalized_exercise", "prompt": "...", "learning": { ... }, "schema": { ... } }`。个性化出题要求模型返回 JSON 练习列表；每题包含 `title`、`topic`、`difficulty`、`description`、三个 `hints` 和只读参考 `sql`。
- 成功响应：`{ "answer": "模型回答" }`；失败响应建议为 `{ "error": "可向用户展示的错误信息" }`。

设计建议和 SQL 生成只传当前设计的表名、字段与关系；SQL 解释只传 SQL 文本；错误诊断发送失败 SQL、SQLite 错误文本和表结构，不发送练习数据或聊天历史。错误诊断需先运行一条失败的 SQL；修改编辑器中的 SQL 后，旧错误会清除。生成或诊断的 SQL 仅供检查，不会自动执行。请在 DeepSeek 控制台管理 API Key 和额度；如果密钥曾粘贴到聊天或公开仓库，应立即撤销并创建新密钥。

AI 分级提示、自动修正、错题分析和个性化出题会按当前任务发送当前 SQL、题目说明或本地学习统计；错题分析只提交有限条错题记录，个性化出题只提交薄弱知识点、错误分类与当前表结构。以上任务都不发送数据库记录行或聊天历史。AI 自动修正不会运行结果对比，逐行差异只对照原 SQL 和模型建议；替换前请检查，运行验证仍由你决定。生成的新题保存在当前浏览器，可在题目列表继续选择；清理站点数据会移除这些本地题目。

AI 辅导面板的快捷入口只会填入可编辑的问题，不会自动发送。使用“本题提示”入口时，当前练习标题和要求会写入问题文本；练习数据库的记录行和面板中的聊天历史不会发送。清空对话只清理当前页面展示，不会影响 SQL 编辑器、练习进度或本地项目。

- 本项目使用 SQLite 作为浏览器内数据库，**不是 MySQL Server**。常用的查询、连接、聚合、事务、视图、索引和子查询由 SQLite 原生执行；MySQL 专有语法、类型和函数仅部分兼容，行为可能与 MySQL 不同。
- 数据库以 SQLite 文件序列化后保存在浏览器的 localStorage 中，空间受浏览器配额限制；达到配额时写入会报错，不会静默丢弃。
- 直接双击 `index.html` 的 `file://` 方式无法加载 SQLite WASM；请使用上面的 HTTP 本地服务器。Service Worker 缓存成功后，后续网页可离线打开。
- 练习数据、项目和完成状态保存在使用者自己的浏览器中，不会自动上传或在不同设备间同步。清理浏览器站点数据可能导致本地保存内容丢失；重要项目请及时导出备份。
- 浏览器中的 ER 图片导入只做版面候选处理，不提供 OCR 文字识别；Android 本地 OCR 能力以及 APK 构建需在对应设备和 Android SDK/Gradle 环境中另行验证。
- 网页适合学习、练习和演示，不应用于生产数据库管理或存储敏感数据。
