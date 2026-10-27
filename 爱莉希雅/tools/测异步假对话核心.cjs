'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), wt = require('node:worker_threads')
const envRoot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'elysia-S16D3-fixture-'))
for (const [k, v] of Object.entries({ ELYSIA_WORKSPACE_ROOT: envRoot, ELYSIA_CONFIG_FILE: path.join(envRoot, 'absent.json'), ELYSIA_PERSONA_PATH: path.join(envRoot, 'absent-persona.json'), ELYSIA_DATA_DIR: path.join(envRoot, 'data'), ELYSIA_CACHE_DIR: path.join(envRoot, 'cache') })) process.env[k] = v
const NativeWorker = wt.Worker; let injection
class TestWorker extends NativeWorker {
  constructor(file, options) { const cfg = injection; injection = undefined; super(file, cfg ? { ...options, execArgv: ['--require', path.join(__dirname, 'fixtures/sqlite-worker-fault.cjs')], env: { ...options.env, SQLITE_FIXTURE_FAULT: JSON.stringify(cfg) } } : options); const emit = this.emit; this.fixture = []; this.emit = function (event, ...args) { if (event === 'message' && args[0]?.fixture === true) { this.fixture.push(args[0]); return emit.call(this, 'fixture', args[0]) } return emit.call(this, event, ...args) } }
}
wt.Worker = TestWorker
const { 新建隔离盘库 } = require('../storage/sqlite-disk.cjs'), { 启动隔离存储Worker, 内部Worker测试 } = require('../storage/sqlite-worker.cjs'), { 创建异步仓储门面 } = require('../storage/sqlite-async-facade.cjs'), { 创建假模型连接 } = require('../脑/模型连接.cjs'), { 创建异步假对话核心 } = require('../core/异步假对话核心.cjs')
const { 创建隔离输出标记 } = require('../core/隔离输出标记.cjs'), 原对话 = require('../脑/对话.cjs'), 原工具解析 = require('../脑/解析工具调用.cjs')
const output = 创建隔离输出标记({ 拆标记: 原对话.拆标记, 拆工具: x => 原工具解析.拆(x, () => null) })
const sample = require('./fixtures/渠道契约-v1.json').本人私聊, msg = { ...sample, 端点: { 渠道: 'fake', 账号: 'local-fixture' } }, time = '2026-10-27T00:00:00.000Z', roots = new Set([envRoot]), actors = new Set(), tests = [], test = (name, fn) => tests.push([name, fn])
function fresh(options = { 用途: 'synthetic-sqlite-disk' }, pack, scope) { const d = 新建隔离盘库(options, pack, scope); d.关闭(); roots.add(d.目录); return { ...options, 目录: d.目录 } }
async function start(options = fresh()) { const a = await 启动隔离存储Worker(options); actors.add(a); return a }
const ctx = (id = 'channel-a') => ({ 内部对话编号: id })
const prompt = ({ 历史, 输入 }) => [{ role: 'system', content: '隔离测试提示' }, ...历史.map(x => ({ role: x.role, content: x.content })), { role: 'user', content: 输入 }]
const core = (a, fn = async () => '虚构回复', build = prompt) => 创建异步假对话核心({ actor: a, 模型连接: 创建假模型连接({ 生成: fn }), 拼提示: build, 取现在: () => new Date(time) })
const markedCore = (a, fn, build = prompt) => 创建异步假对话核心({ actor: a, 模型连接: 创建假模型连接({ 生成: fn }), 拼提示: build, 输出标记: output, 取现在: () => new Date(time) })
async function registerMarked(a, enabled = true) { const f = 创建异步仓储门面(a); await f.会话.登记对话('channel-a', { 建于: time, 写长期记忆: enabled }, { 操作编号: 'marked-register' }); return f }
async function phase(a) { const w = 内部Worker测试(a).worker; if (w.fixture.some(x => x.kind === 'phase')) return; await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('PHASE_TIMEOUT')), 10000); w.on('fixture', function got(m) { if (m.kind === 'phase') { clearTimeout(timer); w.off('fixture', got); resolve() } }) }) }
test('多会话历史隔离，重复消息复用已保存回复，冲突不再次调用模型', async () => {
  const a = await start(), seen = [], c = core(a, async messages => { seen.push(messages); return '回复' + seen.length })
  assert.equal((await c.处理(msg, ctx())).正文, '回复1'); assert.equal((await c.处理({ ...msg, 消息编号: 'next', 正文: '第二句' }, ctx())).正文, '回复2')
  assert.equal((await c.处理(msg, ctx('channel-b'))).正文, '回复3'); assert.equal(seen[1].some(x => x.content === msg.正文), true); assert.equal(seen[2].some(x => x.content === '回复1'), false)
  assert.equal((await c.处理({ ...msg, 接收于: '2026-10-25T05:00:02.000Z' }, ctx())).正文, '回复1'); await assert.rejects(c.处理({ ...msg, 正文: '不同内容' }, ctx()), { message: 'ASYNC_FAKE_CORE_DUPLICATE_CONFLICT_OR_UNAVAILABLE' }); assert.equal(seen.length, 3); await c.关闭()
  const f = 创建异步仓储门面(a); assert.equal((await f.会话.取统计()).轮次数, 3); assert.equal((await f.会话.读最近聊天(10, { 对话: 'channel-a' })).length, 4)
})
test('并发重复输入串行处理且只调用一次假模型', async () => {
  const a = await start(); let calls = 0, release, ready; const begun = new Promise(r => { ready = r }), wait = new Promise(r => { release = r }), c = core(a, async () => { calls++; ready(); await wait; return '只回复一次' })
  const p = c.处理(msg, ctx()); await begun; const q = c.处理(msg, ctx()); release(); assert.equal((await p).正文, '只回复一次'); assert.equal((await q).正文, '只回复一次'); assert.equal(calls, 1); await c.关闭()
})
test('假模型失败和无效提示不保存聊天整轮', async () => {
  const a = await start(), c = core(a, async () => { throw Error('fixture failure') }); await assert.rejects(c.处理(msg, ctx()), { message: 'CORE_MODEL_FAILED' }); await c.关闭(); assert.equal((await 创建异步仓储门面(a).会话.取统计()).轮次数, 0)
  const other = core(a, async () => assert.fail('unexpected model'), () => [{ role: 'tool', content: 'not allowed' }]); await assert.rejects(other.处理(msg, ctx()), { message: 'ASYNC_FAKE_CORE_PROMPT_INVALID' }); await other.关闭()
})
test('关闭会中止等待中的假模型，迟到结果不保存', async () => {
  const a = await start(); let ready, release; const begun = new Promise(r => { ready = r }), wait = new Promise(r => { release = r }), c = core(a, async () => { ready(); await wait; return '迟到回复' })
  const p = c.处理(msg, ctx()), rejected = assert.rejects(p, { message: 'ASYNC_FAKE_CORE_ABORTED' }); await begun; await c.关闭(); await rejected; release(); await new Promise(r => setImmediate(r)); assert.equal((await 创建异步仓储门面(a).会话.取统计()).轮次数, 0)
})
test('关闭时等待已开始的整轮写入确认，不返回迟到回复', async () => {
  const options = fresh(), initial = await start(options), f = 创建异步仓储门面(initial); await f.会话.登记对话('fixture-target', { 建于: time }, { 操作编号: 'fixture-seed' }); await f.会话.登记对话('channel-a', { 建于: time }, { 操作编号: 'chat-seed' }); await initial.关闭()
  injection = { stage: 'before', delay: 500 }; const a = await start(options), c = core(a), p = c.处理(msg, ctx()), rejected = assert.rejects(p, { message: 'ASYNC_FAKE_CORE_ABORTED' }); await phase(a); await c.关闭(); await rejected; assert.equal((await 创建异步仓储门面(a).会话.取统计()).轮次数, 1)
})
test('关闭时不再等待不合作的提示构造器', async () => {
  const a = await start(); let ready; const begun = new Promise(r => { ready = r }), c = core(a, async () => assert.fail('unexpected model'), () => { ready(); return new Promise(() => {}) })
  const p = c.处理(msg, ctx()), rejected = assert.rejects(p, { message: 'ASYNC_FAKE_CORE_ABORTED' }); await begun; await c.关闭(); await rejected; assert.equal((await 创建异步仓储门面(a).会话.取统计()).轮次数, 0)
})
test('非假模型与非fake渠道拒绝，不读取凭据', async () => {
  const a = await start(); assert.throws(() => 创建异步假对话核心({ actor: a, 模型连接: { 要一轮() {} }, 拼提示: prompt }), { message: 'ASYNC_FAKE_CORE_DEPENDENCY_INVALID' }); const c = core(a); await assert.rejects(c.处理({ ...msg, 端点: { ...msg.端点, 渠道: 'qq' } }, ctx()), { message: 'ASYNC_FAKE_CORE_INPUT_INVALID' }); await c.关闭()
})
test('原输出标记与工具清理规则用于显示、持久化及重复读取', async () => {
  const a = await start(), f = 创建异步仓储门面(a), raw = '好呀！【表情：星星眼】\n<tool_call>虚构工具</tool_call>', expected = 原工具解析.拆(原对话.拆标记(raw).正文, () => null).正文; let calls = 0
  const c = 创建异步假对话核心({ actor: a, 模型连接: 创建假模型连接({ 生成: async () => { calls++; return raw } }), 拼提示: prompt, 输出标记: output, 取现在: () => new Date(time) })
  assert.equal((await c.处理(msg, ctx())).正文, expected); assert.equal((await c.处理(msg, ctx())).正文, expected); assert.equal(calls, 1)
  const history = await f.会话.读最近聊天(10, { 对话: 'channel-a' }); assert.equal(history.at(-1).内容, expected); assert(!expected.includes('表情')); assert(!expected.includes('tool_call')); await c.关闭()
})
test('假模型标记原子写事实和经历，正文干净且重复输入不重复', async () => {
  const a = await start(), f = await registerMarked(a); let calls = 0
  const c = markedCore(a, async () => { calls++; return '好呀！[记住:你喜欢花]【经历：我们一起赏花】[表情:开心]' })
  assert.equal((await c.处理(msg, ctx())).正文, '好呀！'); assert.equal((await c.处理(msg, ctx())).正文, '好呀！'); assert.equal(calls, 1)
  assert.equal((await f.会话.取统计()).轮次数, 1); const facts = (await f.记忆.列长期({ 类别: '事实' })).列表, events = (await f.记忆.列长期({ 类别: '经历' })).列表; assert.equal(facts.length, 1); assert.equal(events.length, 1); assert.equal(facts[0].来源, '她'); assert.equal(events[0].内容, '我们一起赏花'); await c.关闭()
})
test('关闭记忆时清除标记但保留聊天，后续开启不补写旧轮', async () => {
  const a = await start(), f = await registerMarked(a, false), c = markedCore(a, async () => '好呀[记住:你喜欢花]【经历：我们赏花】')
  assert.equal((await c.处理(msg, ctx())).正文, '好呀'); assert.equal((await f.会话.取统计()).轮次数, 1); assert.equal((await f.记忆.取统计()).长期数, 0)
  await f.会话.更新对话('channel-a', { 预期版本: 1, 写长期记忆: true }, { 操作编号: 'enable-memory' }); assert.equal((await c.处理(msg, ctx())).正文, '好呀'); assert.equal((await f.记忆.取统计()).长期数, 0); await c.关闭()
})
test('生成期间会话开关变动，拒绝整个旧轮', async () => {
  const a = await start(), f = await registerMarked(a); let started, release; const begin = new Promise(r => { started = r }), paused = new Promise(r => { release = r })
  const c = markedCore(a, async () => { started(); await paused; return '好[记住:你喜欢花]' }), p = c.处理(msg, ctx()), rejected = assert.rejects(p, { message: 'SQLITE_CHAT_VERSION_CONFLICT' })
  await begin; await f.会话.更新对话('channel-a', { 预期版本: 1, 写长期记忆: false }, { 操作编号: 'disable-inflight' }); release(); await rejected; assert.equal((await f.会话.取统计()).轮次数, 0); assert.equal((await f.记忆.取统计()).长期数, 0); await c.关闭()
})
test('生成期间记忆变动时拒绝基于旧提示的写入', async () => {
  const a = await start(), f = await registerMarked(a); let started, release; const begin = new Promise(r => { started = r }), paused = new Promise(r => { release = r })
  const c = markedCore(a, async () => { started(); await paused; return '好[记住:你喜欢花]' }), p = c.处理(msg, ctx()), rejected = assert.rejects(p, { message: 'SQLITE_MEMORY_VERSION_CONFLICT' })
  await begin; await f.记忆.新增长期({ 操作编号: 'concurrent-memory', 时间: time, 预期版本: 0, 类别: '事实', 内容: '你喜欢茶' }); release(); await rejected; assert.equal((await f.会话.取统计()).轮次数, 0); assert.equal((await f.记忆.取统计()).长期数, 1); await c.关闭()
})
test('构造提示期间记忆变化，在调用假模型前拒绝', async () => {
  const a = await start(), f = await registerMarked(a); let calls = 0
  const c = markedCore(a, async () => { calls++; return '好' }, async input => { await f.记忆.新增长期({ 操作编号: 'prompt-memory', 时间: time, 预期版本: 0, 类别: '事实', 内容: '你喜欢花' }); return prompt(input) })
  await assert.rejects(c.处理(msg, ctx()), { message: 'ASYNC_FAKE_CORE_PROMPT_MEMORY_VERSION_CONFLICT' }); assert.equal(calls, 0); assert.equal((await f.会话.取统计()).轮次数, 0); await c.关闭()
})
test('标记更正现存事实并避免同内容重复新增', async () => {
  const a = await start(), f = await registerMarked(a), old = await f.记忆.新增长期({ 操作编号: 'old-fact', 时间: time, 预期版本: 0, 类别: '事实', 内容: '你喜欢咖啡' })
  const c = markedCore(a, async () => `明白[更正事实:${old.目标编号}|你喜欢茶][记住:你喜欢茶]`); assert.equal((await c.处理(msg, ctx())).正文, '明白')
  const facts = (await f.记忆.列长期({ 类别: '事实' })).列表; assert.equal(facts.length, 1); assert.equal(facts[0].内容, '你喜欢茶'); assert.equal(facts[0].编号, old.目标编号); await c.关闭()
})
test('已写记忆后关闭开关，重复输入不绕过回执授权', async () => {
  const a = await start(), f = await registerMarked(a), c = markedCore(a, async () => '好[记住:你喜欢花]'); await c.处理(msg, ctx()); await f.会话.更新对话('channel-a', { 预期版本: 1, 写长期记忆: false }, { 操作编号: 'disable-replay' })
  await assert.rejects(c.处理(msg, ctx()), { message: 'ASYNC_FAKE_CORE_MEMORY_SWITCH_OFF' }); assert.equal((await f.记忆.取统计()).长期数, 1); await c.关闭()
})
test('组合回执失败回滚整条假核心输出，恢复后可重试', async () => {
  const options = fresh(), initial = await start(options), seed = 创建异步仓储门面(initial); await seed.会话.登记对话('fixture-target', { 建于: time }, { 操作编号: 'fault-seed' }); await registerMarked(initial); await initial.关闭()
  injection = { stage: 'journal-fail' }; const a = await start(options), f = 创建异步仓储门面(a), c = markedCore(a, async () => '好呀[记住:你喜欢花]')
  await assert.rejects(c.处理(msg, ctx()), { message: 'SQLITE_WORKER_FIXTURE_JOURNAL_FAILURE' }); assert.equal((await f.会话.取统计()).轮次数, 0); assert.equal((await f.记忆.取统计()).长期数, 0); await c.关闭(); await a.关闭()
  const b = await start(options), retry = markedCore(b, async () => '好呀[记住:你喜欢花]'); assert.equal((await retry.处理(msg, ctx())).正文, '好呀'); assert.equal((await 创建异步仓储门面(b).记忆.取统计()).长期数, 1); await retry.关闭()
})
test('标记组合写入期间关闭，等待提交且不返回迟到回复', async () => {
  const options = fresh(), initial = await start(options), seed = 创建异步仓储门面(initial); await seed.会话.登记对话('fixture-target', { 建于: time }, { 操作编号: 'close-seed' }); await registerMarked(initial); await initial.关闭()
  injection = { stage: 'before', delay: 500 }; const a = await start(options), c = markedCore(a, async () => '好呀[记住:你喜欢花]'), p = c.处理(msg, ctx()), rejected = assert.rejects(p, { message: 'ASYNC_FAKE_CORE_ABORTED' })
  await phase(a); await c.关闭(); await rejected; const f = 创建异步仓储门面(a); assert.equal((await f.会话.取统计()).轮次数, 1); assert.equal((await f.记忆.取统计()).长期数, 1)
})
test('缺少解析器和未闭合标记都拒绝保存，避免内部标记漏出', async () => {
  const a = await start(), f = 创建异步仓储门面(a), c = core(a, async () => '好[记住:你的喜好]')
  await assert.rejects(c.处理(msg, ctx()), { message: 'ASYNC_FAKE_CORE_OUTPUT_ADAPTER_REQUIRED' }); await c.关闭()
  const marked = 创建异步假对话核心({ actor: a, 模型连接: 创建假模型连接({ 生成: async () => '好[记住:未闭合' }), 拼提示: prompt, 输出标记: output, 取现在: () => new Date(time) })
  await assert.rejects(marked.处理({ ...msg, 消息编号: 'unfinished' }, ctx()), { message: 'ISOLATED_OUTPUT_INCOMPLETE_MARKER' }); await marked.关闭(); assert.equal((await f.会话.取统计()).轮次数, 0)
})
test('解析依赖不可伪造或返回非法结果', async () => {
  const a = await start(); assert.throws(() => 创建隔离输出标记({}), { message: 'ISOLATED_OUTPUT_DEPENDENCY_INVALID' }); assert.throws(() => 创建异步假对话核心({ actor: a, 模型连接: 创建假模型连接({ 生成: async () => 'x' }), 拼提示: prompt, 输出标记: { 解析: () => ({ 正文: 'x', 待写记忆: false }) } }), { message: 'ASYNC_FAKE_CORE_DEPENDENCY_INVALID' })
  const invalid = 创建隔离输出标记({ 拆标记: () => ({}), 拆工具: () => ({ 正文: 'x' }) }); assert.throws(() => invalid.解析('x'), { message: 'ISOLATED_OUTPUT_DEPENDENCY_INVALID' })
})
test('虚构旧档与新历史按物理顺序进入注入提示，不并入无归属记录', async () => {
  const { 创建本机影子仓储, 备份范围 } = require('../storage/sqlite-backup.cjs'), { 旧格式范围 } = require('../storage/sqlite-legacy.cjs'), m = 创建本机影子仓储({ 用途: 'local-shadow-repository', 包含私密: true }), rows = [{ 角色: 'user', 内容: '无归属', 时间: '' }, { 对话: 'channel-a', 角色: 'user', 内容: '旧问题', 时间: '2026-09-01 19:03' }, { 对话: 'channel-a', 角色: 'assistant', 内容: '旧回答', 时间: '' }]; let pack
  try { m.旧格式.导入({ 版本: 1, 用途: 旧格式范围.用途, 文档: [{ 路径: 'data/聊天记录/聊天记录.jsonl', 类型: 'messages', 原文: rows.map(x => JSON.stringify(x)).join('\n') + '\n' }] }, 旧格式范围); pack = m.创建备份({ 时间: time, 外部文件: [], 必须文件: [] }, 备份范围) } finally { m.关闭() }
  const a = await start(fresh({ 用途: 'isolated-local-sqlite-disk', 包含私密: true }, pack, 备份范围)); let got; const c = core(a, async () => '新回复', x => { got = x; return prompt(x) }); await c.处理(msg, ctx()); assert.deepEqual(got.历史.map(x => x.content), ['旧问题', '旧回答']); assert.equal(got.历史[0].时间, '2026-09-01 19:03'); assert.equal(got.历史.some(x => x.content === '无归属'), false); await c.关闭()
})
for (const stage of ['before', 'after']) test('整轮提交' + stage + '终止Worker，查回执后不重复已提交轮次', async () => {
  const options = fresh(), initial = await start(options), f = 创建异步仓储门面(initial)
  await f.会话.登记对话('fixture-target', { 建于: time }, { 操作编号: 'fixture-seed' }); await f.会话.登记对话('channel-a', { 建于: time }, { 操作编号: 'chat-seed' }); await initial.关闭()
  injection = { stage }; const a = await start(options); let calls = 0, c = core(a, async () => { calls++; return '一次回复' }); let failure
  const p = c.处理(msg, ctx()), bad = assert.rejects(p, e => { failure = e; return e.状态 === 'unknown' }); await phase(a); await 内部Worker测试(a).worker.terminate(); await bad; await c.关闭(); await a.恢复(); const receipt = await a.查询回执(failure.操作编号); assert.equal(receipt !== null, stage === 'after')
  c = core(a, async () => { calls++; return '一次回复' }); assert.equal((await c.处理(msg, ctx())).正文, '一次回复'); assert.equal(calls, stage === 'after' ? 1 : 2); await c.关闭(); assert.equal((await 创建异步仓储门面(a).会话.取统计()).轮次数, 1)
})
for (const stage of ['before', 'after']) test('标记整链提交' + stage + '终止Worker，恢复时不重复聊天或记忆', async () => {
  const options = fresh(), initial = await start(options), f = 创建异步仓储门面(initial); await f.会话.登记对话('fixture-target', { 建于: time }, { 操作编号: 'fixture-seed' }); await registerMarked(initial); await initial.关闭()
  injection = { stage }; const a = await start(options); let calls = 0, c = markedCore(a, async () => { calls++; return '好呀[记住:你喜欢花]' }), failure
  const p = c.处理(msg, ctx()), bad = assert.rejects(p, e => { failure = e; return e.状态 === 'unknown' }); await phase(a); await 内部Worker测试(a).worker.terminate(); await bad; await c.关闭(); await a.恢复(); assert.equal(!!(await a.查询回执(failure.操作编号)), stage === 'after')
  c = markedCore(a, async () => { calls++; return '好呀[记住:你喜欢花]' }); assert.equal((await c.处理(msg, ctx())).正文, '好呀'); assert.equal(calls, stage === 'after' ? 1 : 2); await c.关闭(); const check = 创建异步仓储门面(a); assert.equal((await check.会话.取统计()).轮次数, 1); assert.equal((await check.记忆.取统计()).长期数, 1)
})
;(async () => { let pass = 0; try { for (const [name, fn] of tests) { try { await fn(); pass++; console.log('PASS ' + name) } catch (e) { process.exitCode = 1; console.error('FAIL ' + name, e) } } console.log(`S16D3 fake core: ${pass}/${tests.length}`) } finally { for (const a of actors) try { await a.关闭() } catch {} for (const root of roots) { const real = fs.realpathSync(root); if (path.dirname(real) !== fs.realpathSync(os.tmpdir()) || !/^elysia-(sqlite-disk|S16D3-fixture)-[a-zA-Z0-9]+$/u.test(path.basename(real)) || fs.lstatSync(root).isSymbolicLink()) throw Error('CLEANUP_OUTSIDE'); fs.rmSync(real, { recursive: true, force: true }) } wt.Worker = NativeWorker } })()
