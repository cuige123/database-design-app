# QueryPad Android 离线 App

这是 QueryPad 的 Android 外壳。它把项目根目录的 `index.html`、`manifest.json` 和 `sw.js` 作为 App 资源打包进 APK，运行时不依赖网页地址和网络。

## 当前能力

- 手机端 SQL 工作台和本地项目保存
- ER 图拖拽设计器
- 表结构编辑、建表 SQL、数据字典和项目导入导出
- Android WebView 离线加载

## 构建

使用 Android Studio 打开 `android/` 目录，等待 Gradle 同步后运行 `app`。首次构建需要 Android SDK 35、JDK 17 和可用的 Gradle 依赖缓存。

当前 SQL 执行仍是课程演示模式。真正的本地 SQL 引擎和图片 OCR 可以在 Android 外壳稳定后继续接入。
