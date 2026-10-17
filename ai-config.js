// AI 助手接口地址配置。
//
// 本地服务使用同源 Node 接口；部署到静态站点时使用 Cloudflare Worker。
//
// 不要把 DeepSeek API Key 填在这里：这个文件会被公开发布。密钥只能配置在服务端环境变量中。
const isLocalServer = ['localhost', '127.0.0.1'].includes(window.location.hostname);
window.queryPadAiEndpoint = isLocalServer
  ? '/api/ai/chat'
  : 'https://database-design-app.3259143991.workers.dev/api/ai/chat';
