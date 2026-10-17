// AI 助手接口配置。
// 部署为静态网页时，浏览器会直接请求 DeepSeek；填写密钥后，访问者可在开发者工具中看到它。
// 本地 localhost 仍默认走 node server.js，避免把本地密钥放进网页配置。
// 用自己的密钥替换下面的占位文本，然后重新部署网页。
const isLocalServer = ['localhost', '127.0.0.1'].includes(window.location.hostname);
window.queryPadAiDirect = !isLocalServer;
window.queryPadAiEndpoint = isLocalServer
  ? '/api/ai/chat'
  : 'https://api.deepseek.com/chat/completions';
window.queryPadAiApiKey = 'sk-5e1339c5f73f49c284c4eb36b32c0671';
window.queryPadAiModel = 'deepseek-chat';
