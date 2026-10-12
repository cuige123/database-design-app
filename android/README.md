# QueryPad Android 离线 App

这是 QueryPad 的 Android 外壳。它把项目根目录的 `index.html`、`manifest.json` 和 `sw.js` 作为 App 资源打包进 APK，运行时不依赖网页地址和网络。

## 当前能力

- 手机端 SQL 工作台和本地项目保存
- ER 图拖拽设计器
- 表结构编辑、建表 SQL、数据字典和项目导入导出
- Android WebView 离线加载
- 浏览器内 SQLite WASM SQL 引擎与本地数据库持久化

## 构建

使用 Android Studio 打开 `android/` 目录，等待 Gradle 同步后运行 `app`。首次构建需要 Android SDK 35、JDK 17 和可用的 Gradle 依赖缓存。

SQLite WASM JavaScript 与 `.wasm` 文件由项目资源打包进 APK，不要求 App 启动时联网。引擎执行 SQLite SQL，并兼容部分 MySQL 语法；它不是 MySQL Server。浏览器缓存与 Android WebView 的本地存储相互独立。
