/** 每场景独立Node进程与临时根；不读取正式配置/角色/聊天/凭据。 */
'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const { spawnSync } = require('node:child_process')
const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-headless-chat-'))
const 子入口 = path.resolve(__dirname, 'fixtures/隔离对话回环.cjs'), 审计 = path.resolve(__dirname, 'fixtures/隔离对话审计.cjs')
let 总数 = 0
function 夹具(名) {
  const 隔离根 = path.join(根, 名); fs.mkdirSync(隔离根)
  const 配置 = { 版本: 1, 模式: 'fake-chat', 隔离根, 工作区: path.join(隔离根, 'workspace'), 角色卡: path.join(隔离根, 'persona.json'), 数据目录: path.join(隔离根, 'data'), 缓存目录: path.join(隔离根, 'cache'), 学习区: path.join(隔离根, 'learning'), 附件目录: path.join(隔离根, 'data', 'attachments'), 纸条目录: path.join(隔离根, 'cache', 'notes'), 进度文件: path.join(隔离根, 'learning', 'progress.md') }
  fs.writeFileSync(path.join(隔离根, '.elysia-isolated-root.json'), JSON.stringify({ 版本: 1, 用途: 'headless-test' }))
  fs.writeFileSync(path.join(隔离根, 'headless.config.json'), JSON.stringify(配置))
  fs.writeFileSync(配置.角色卡, JSON.stringify({ data: { name: '爱莉希雅', personality: '隔离测试角色。', scenario: '虚构测试。' } }))
  return 隔离根
}
function 执行(场景, 隔离根 = 夹具(场景)) {
  const 环境 = { ...process.env }
  for (const 名 of Object.keys(环境)) if (名.startsWith('ELYSIA_')) delete 环境[名]
  Object.assign(环境, { CORE_AUDIT_ROOT: 隔离根, DEEPSEEK_API_KEY: 'PRIVATE-CREDENTIAL-SENTINEL-123456789' })
  const 果 = spawnSync(process.execPath, ['--require', 审计, 子入口, 隔离根, 场景], { env: 环境, encoding: 'utf8', timeout: 10000, windowsHide: true })
  assert.ifError(果.error); assert.equal(果.status, 0, 场景 + ': ' + 果.stderr)
  assert.equal(果.stdout.trim(), 'CASE_OK', 场景); assert.equal(果.stderr.trim(), 'CORE_AUDIT_OK', 场景)
  总数++; console.log('✓ ' + 场景); return 隔离根
}
try {
  for (const 名 of ['credentials', 'invalid-model', 'early-import', 'wrong-mode', 'env-conflict', 'locked', 'roundtrip', 'timestamps', 'concurrent', 'corrupt-history', 'corrupt-index', 'write-failure', 'partial-write', 'fsync-failure', 'no-final-newline', 'missing-history', 'missing-index', 'junction-before', 'junction-during', 'disabled-tools', 'bad-input', 'abort-before', 'abort-during', 'close-during', 'revoke-during', 'changed-path', 'changed-config', 'model-error', 'bad-output', 'legacy', 'shutdown']) 执行(名)
  const 跨进程 = 执行('restart-first'); 执行('restart-second', 跨进程)
  执行('model-error-prefix'); 执行('lost-lock')
  console.log(`隔离对话核心：${总数}/${总数} 通过`)
} finally {
  const 绝对根 = path.resolve(根), 临时根 = path.resolve(os.tmpdir()), 相对 = path.relative(临时根, 绝对根)
  if (!path.isAbsolute(相对) && 相对 && !相对.startsWith('..') && path.basename(绝对根).startsWith('elysia-headless-chat-')) fs.rmSync(绝对根, { recursive: true, force: true })
}
