'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), Module = require('node:module')
const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'elysia-S16D3-prompt-fixture-')), data = path.join(root, 'data'), persona = path.join(root, 'fake-persona.json')
fs.mkdirSync(data, { recursive: true }); fs.writeFileSync(persona, JSON.stringify({ data: { personality: '虚构人物个性', scenario: '虚构场景', system_prompt: '虚构系统规则', mes_example: '虚构对白', extensions: { dshCosplay: { style: '虚构语言风格', rules: '虚构规则' } } } }))
for (const [k, v] of Object.entries({ ELYSIA_WORKSPACE_ROOT: root, ELYSIA_CONFIG_FILE: path.join(root, 'absent.json'), ELYSIA_PERSONA_PATH: persona, ELYSIA_DATA_DIR: data, ELYSIA_CACHE_DIR: path.join(root, 'cache'), TZ: 'Asia/Shanghai' })) process.env[k] = v
const project = path.resolve(__dirname, '..'), read = fs.readFileSync, load = Module._load, approved = new Set([root]), inside = (a, b) => { const r = path.relative(a, b); return !path.isAbsolute(r) && r !== '..' && !r.startsWith('..' + path.sep) }
const auditedRead = function (file, ...args) { if (typeof file === 'string') { const p = path.resolve(file); if (![...approved].some(r => inside(r, p)) && !(inside(project, p) && (/\.(cjs|js)$/u.test(p) || path.basename(p) === 'package.json'))) throw Error('PROMPT_FIXTURE_READ_OUTSIDE') } return read.call(this, file, ...args) }
fs.readFileSync = auditedRead
Module._load = function (id, ...args) { if (/^(node:)?(http|https|net|tls|dns)$/u.test(id)) throw Error('PROMPT_FIXTURE_NETWORK_FORBIDDEN'); return load.call(this, id, ...args) }
const 原提示词 = require('../脑/提示词.cjs'), 原对话 = require('../脑/对话.cjs'), 原记忆 = require('../脑/记忆.cjs'), 原临时 = require('../脑/临时记忆召回.cjs'), 尺 = require('../脑/量长度.cjs'), 修 = require('../脑/修剪工具结果.cjs')
// Restore Node's loader after module initialization; only explicit fixture paths are used below.
Module._load = load; fs.readFileSync = read
const { 新建隔离盘库 } = require('../storage/sqlite-disk.cjs'), { 启动隔离存储Worker, 内部Worker测试 } = require('../storage/sqlite-worker.cjs'), { 创建异步仓储门面 } = require('../storage/sqlite-async-facade.cjs'), { 创建异步角色提示 } = require('../core/异步角色提示.cjs'), { 创建异步假对话核心 } = require('../core/异步假对话核心.cjs'), { 创建假模型连接 } = require('../脑/模型连接.cjs')
const roots = new Set([root]), actors = new Set(), tests = [], test = (name, fn) => tests.push([name, fn]), time = '2026-10-27T00:00:00.000Z'
async function setup(local = false) { const options = local ? { 用途: 'isolated-local-sqlite-disk', 包含私密: true } : { 用途: 'synthetic-sqlite-disk' }, disk = 新建隔离盘库(options), dir = disk.目录; disk.关闭(); roots.add(dir); approved.add(dir); const actor = await 启动隔离存储Worker({ ...options, 目录: dir }); actors.add(actor); return { actor, f: 创建异步仓储门面(actor) } }
const adapter = (actor, at = time) => 创建异步角色提示({ actor, 原提示词, 创建临时召回器: 原临时.创建召回器, 挑历史: 原对话.挑历史, 历史内容: 原对话.给模型的历史内容, 估算: 尺.估, 默认线: 修.默认线, 取现在: () => new Date(at) })
async function add(f, id, fields) { const v = (await f.记忆.取统计()).版本; return f.记忆.新增长期({ 操作编号: id, 时间: time, 预期版本: v, ...fields }) }
async function temp(f, id, fields) { const v = (await f.记忆.取统计()).版本; return f.记忆.新增临时({ 操作编号: id, 时间: time, 预期版本: v, ...fields }) }
test('虚构角色卡和长期记忆输出与原提示拼法一致，临时召回复用原规则', async () => {
  const { actor, f } = await setup(); await add(f, 'long-fact', { 类别: '事实', 内容: '你喜欢雨后的散步' }); await add(f, 'long-story', { 类别: '经历', 内容: '我们一起听过一首曲子' }); await add(f, 'long-note', { 类别: '小本子', 内容: '我想起那天的晚风' }); await temp(f, 'temp-one', { 类别: '候选偏好', 内容: '你喜欢雨后的散步', 细节: { 手动: true } })
  for (const category of ['事实', '经历', '小本子']) fs.writeFileSync(path.join(data, category + '.json'), JSON.stringify((await f.记忆.列长期({ 类别: category })).列表))
  const input = { 历史: [{ role: 'user', content: '先前对话', 时间: '2026-09-01 19:03' }, { role: 'assistant', content: '先前回复', 时间: '' }], 输入: '你记得我喜欢雨后的散步吗' }; let messages
  fs.readFileSync = auditedRead; try { messages = await adapter(actor).拼提示(input) } finally { fs.readFileSync = read }
  const expected = 原提示词.拼({ ...原记忆.取记忆(), 模式: 'chat', 工具说明: '', 环境说明: '', 范围说明: '' }); assert.equal(messages[0].content, expected); assert(messages[0].content.includes('虚构人物个性')); assert(messages[0].content.includes('你喜欢雨后的散步'))
  const tempRows = await f.记忆.查询临时({ 生命周期: '有效', 确认状态: '已确认', 限量: 1000 }), original = 原临时.创建召回器({ 临时记忆库: { 查询: () => tempRows }, 现在: () => Date.parse(time) }), expectedTemp = original.拼给模型(original.召回({ 查询: input.输入 })); assert(expectedTemp); assert.equal(messages[2].content, expectedTemp); assert(messages.some(x => x.content.includes('[这条消息记录于 2026-09-01 19:03]')))
})
test('历史按原挑选/时间格式传给假核心，输出被Worker保存', async () => {
  const { actor, f } = await setup(), builder = adapter(actor); let captured; const core = 创建异步假对话核心({ actor, 模型连接: 创建假模型连接({ 生成: async m => { captured = m; return '虚构回答' } }), 拼提示: builder.拼提示, 取现在: () => new Date(time) })
  const base = require('./fixtures/渠道契约-v1.json').本人私聊, msg = { ...base, 端点: { 渠道: 'fake', 账号: 'local-fixture' } }; await core.处理(msg, { 内部对话编号: 'channel-a' }); await core.处理({ ...msg, 消息编号: 'second' }, { 内部对话编号: 'channel-a' }); assert(captured[0].content.includes('虚构人物个性')); assert(captured.some(x => x.role === 'assistant' && x.content.includes('虚构回答'))); assert.equal((await f.会话.取统计()).轮次数, 2); await core.关闭()
})
test('记忆中途变更明确拒绝，不混合不同版本', async () => {
  const { actor, f } = await setup(), w = 内部Worker测试(actor).worker, old = w.postMessage; let injected, write
  w.postMessage = function (message, ...args) { const result = old.call(this, message, ...args); if (!injected && message?.data?.操作 === '记忆.列长期') { injected = true; write = f.记忆.新增长期({ 操作编号: 'concurrent', 时间: time, 预期版本: 0, 类别: '事实', 内容: '你喜欢茶' }) } return result }
  try { await assert.rejects(adapter(actor).拼提示({ 历史: [], 输入: '你好' }), { message: 'ASYNC_CHARACTER_PROMPT_VERSION_CONFLICT' }); await write } finally { w.postMessage = old }
})
test('确有虚构私密日记也不进入普通提示', async () => {
  const { actor, f } = await setup(true), privateFacade = 创建异步仓储门面(actor, { 本机私密: true }), diary = require('./fixtures/sqlite-backup-scenario.cjs').篇(true)
  await privateFacade.日记.写入私密({ 日记: diary, 预期版本: 0 }, { 操作编号: 'private-diary' }); assert.equal((await privateFacade.日记.读取本机私密()).length, 1); assert.equal(f.日记.读取本机私密, undefined)
  const result = await adapter(actor).拼提示({ 历史: [], 输入: '你好' }); assert.equal(result.at(-1).content, '你好'); assert.equal(JSON.stringify(result).includes(diary.模块[0].正文), false)
})
test('临时记忆过期或待确认时不会进入提示', async () => {
  const { actor, f } = await setup(); await temp(f, 'expiring', { 类别: '候选偏好', 内容: '你喜欢雨后的散步', 细节: { 手动: true, 保留天数: 1 } })
  await f.会话.登记对话('channel-evidence', { 建于: time, 写长期记忆: true }, { 操作编号: 'evidence-register' }); const round = await f.会话.存对话一轮({ 对话: 'channel-evidence', 轮次: 'evidence-turn', 用户正文: '我喜欢紫罗兰', 回复正文: '知道了', 接收于: time, 完成于: time }, { 操作编号: 'evidence-turn' })
  const pending = await temp(f, 'pending', { 类别: '候选偏好', 内容: '你喜欢紫罗兰', 来源消息编号: round.消息编号[0], 依据原文: '喜欢紫罗兰' }); assert.equal((await f.记忆.读取临时(pending.临时编号)).条.确认状态, '待确认')
  const result = await adapter(actor, '2026-11-01T00:00:00.000Z').拼提示({ 历史: [], 输入: '你记得我喜欢雨后的散步和紫罗兰吗' }), all = JSON.stringify(result); assert.equal(all.includes('你喜欢雨后的散步'), false); assert.equal(all.includes('你喜欢紫罗兰'), false)
})
test('长期事实沿用原来只取最后40条的顺序', async () => {
  const { actor, f } = await setup(); for (let i = 0; i < 41; i++) await add(f, 'fact-' + i, { 类别: '事实', 内容: '你喜欢虚构条目' + i })
  const result = await adapter(actor).拼提示({ 历史: [], 输入: '你好' }); assert.equal(result[0].content.includes('你喜欢虚构条目0'), false); assert(result[0].content.includes('你喜欢虚构条目40'))
})
;(async () => { let pass = 0; try { for (const [name, fn] of tests) { try { await fn(); pass++; console.log('PASS ' + name) } catch (e) { process.exitCode = 1; console.error('FAIL ' + name, e) } } console.log(`S16D3 prompt: ${pass}/${tests.length}`) } finally { fs.readFileSync = read; Module._load = load; for (const a of actors) try { await a.关闭() } catch {} for (const dir of roots) { const real = fs.realpathSync(dir); if (path.dirname(real) !== fs.realpathSync(os.tmpdir()) || !/^elysia-(sqlite-disk|S16D3-prompt-fixture)-[a-zA-Z0-9]+$/u.test(path.basename(real)) || fs.lstatSync(dir).isSymbolicLink()) throw Error('CLEANUP_OUTSIDE'); fs.rmSync(real, { recursive: true, force: true }) } } })()
