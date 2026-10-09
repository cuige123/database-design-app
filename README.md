# Database Design App

面向数据库课程实验的离线数据库设计工具，当前以 Web 界面和 Android WebView 外壳为基础。

## 当前功能

- 触屏/鼠标绘制 ER 图
- 新建实体、编辑实体字段
- 创建、编辑和删除实体关系
- 设置一对一、一对多和多对一关系
- 数据表结构编辑
- 自动生成建表 SQL 和数据字典
- 本地项目保存、导入和导出
- ER 图导出为 PNG/SVG
- 导入 ER 图片；浏览器仅检测版面候选，Android 可调用本地 OCR 识别文字
- 基础离线 SQL 执行
- 51 道数据库练习题，支持切换题目、载入参考 SQL 和本地自动判题；包含查看所有学生完整信息
- 练习示例数据：30 名学生、16 门课程、123 条选课记录
- 页面内置自检

## 运行

直接用浏览器打开 `index.html`，或在项目目录启动静态服务器：

```powershell
python -m http.server 4173
```

然后访问 `http://localhost:4173/index.html`。

## Android

`android` 目录是 Android WebView 外壳。当前项目仍需配置 Android SDK/Gradle 后才能构建 APK。

## 说明

当前离线 SQL 模块是轻量兼容层，支持基础查询、INNER JOIN 和建表，不等同于完整 MySQL Server；未支持的 SQL 子句会明确报错。浏览器图片导入不识别文字，Android 本地 OCR 和最终 APK 需要在对应设备与环境中单独验证。
