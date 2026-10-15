// AI 助手接口地址配置。
//
// 本地运行（node server.js / 启动MySQL实验室.bat）：保持默认值即可，无需修改。
// 部署到 GitHub Pages 等纯静态托管时：没有同源后端，需要把这里改成你部署的代理接口地址，
// 例如 Cloudflare Worker：
//   window.queryPadAiEndpoint = 'https://querypad-ai.你的子域.workers.dev/api/ai/chat';
//
// 不要把 DeepSeek API Key 填在这里：这个文件会被公开发布。密钥只能配置在服务端环境变量中。
window.queryPadAiEndpoint = '/api/ai/chat';
