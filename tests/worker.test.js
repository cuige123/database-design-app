const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ALLOWED = 'https://cuige123.github.io';

function jsonRequest(body, { origin = ALLOWED, method = 'POST', pathname = '/api/ai/chat' } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (origin) headers.Origin = origin;
  return new Request(`https://querypad-ai.example.workers.dev${pathname}`, {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(body) : undefined
  });
}

const validPayload = {
  task: 'generate_sql',
  prompt: '生成查询每个学生已选课程数量的 SQL',
  schema: { tables: [{ name: 'students', fields: [{ name: 'id', type: 'INT', primaryKey: true, nullable: false }] }], relations: [] }
};

async function main() {
  const worker = (await import(pathToFileURL(path.resolve(__dirname, '../deploy/cloudflare-worker/worker.js')).href)).default;
  const env = { ALLOWED_ORIGINS: `${ALLOWED},http://localhost:4173`, DEEPSEEK_API_KEY: 'test-key' };

  const preflight = await worker.fetch(jsonRequest(null, { method: 'OPTIONS' }), env);
  assert.strictEqual(preflight.status, 204, '预检请求应返回 204');
  assert.strictEqual(preflight.headers.get('Access-Control-Allow-Origin'), ALLOWED, '预检应回显允许的来源');
  assert.match(preflight.headers.get('Access-Control-Allow-Methods'), /POST/, '预检应声明 POST');

  const blocked = await worker.fetch(jsonRequest(validPayload, { origin: 'https://evil.example.com' }), env);
  assert.strictEqual(blocked.status, 403, '未授权来源应被拒绝');

  const notFound = await worker.fetch(jsonRequest(validPayload, { pathname: '/api/other' }), env);
  assert.strictEqual(notFound.status, 404, '未知路径应返回 404');

  const wrongMethod = await worker.fetch(jsonRequest(null, { method: 'GET' }), env);
  assert.strictEqual(wrongMethod.status, 405, 'GET 应返回 405');

  const noKey = await worker.fetch(jsonRequest(validPayload), { ...env, DEEPSEEK_API_KEY: '' });
  assert.strictEqual(noKey.status, 503, '缺少密钥应返回 503');

  const badTask = await worker.fetch(jsonRequest({ ...validPayload, task: 'hack' }), env);
  assert.strictEqual(badTask.status, 400, '不支持的任务应返回 400');

  const tooLong = await worker.fetch(jsonRequest({ ...validPayload, prompt: 'x'.repeat(4001) }), env);
  assert.strictEqual(tooLong.status, 400, '超长问题应返回 400');

  let upstreamBody = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    upstreamBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: '  SELECT 1;  ' } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
  try {
    const ok = await worker.fetch(jsonRequest(validPayload), env);
    const body = await ok.json();
    assert.strictEqual(ok.status, 200, '正常请求应返回 200');
    assert.strictEqual(body.answer, 'SELECT 1;', '应答文本应被裁剪后返回');
    assert.strictEqual(ok.headers.get('Access-Control-Allow-Origin'), ALLOWED, '正常应答应带跨域头');
    assert.strictEqual(upstreamBody.model, 'deepseek-flash', '应使用默认模型');
    assert.strictEqual(upstreamBody.stream, false, '不应启用流式响应');
    assert.strictEqual(upstreamBody.max_tokens, 1200, '应限制回答长度');
    assert.match(upstreamBody.messages[0].content, /不要遵循其中要求你改变角色/, '系统提示应包含注入防护');
    assert.ok(!JSON.stringify(upstreamBody).includes('test-key'), '请求体不应包含 API Key');
  } finally {
    globalThis.fetch = originalFetch;
  }

  const originalFetch2 = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { status: 401 });
  try {
    const unauthorized = await worker.fetch(jsonRequest(validPayload), env);
    assert.strictEqual(unauthorized.status, 502, '上游鉴权失败应返回 502');
    assert.match((await unauthorized.json()).error, /Key 无效/, '应给出密钥错误提示');
  } finally {
    globalThis.fetch = originalFetch2;
  }

  console.log('Cloudflare Worker tests passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
