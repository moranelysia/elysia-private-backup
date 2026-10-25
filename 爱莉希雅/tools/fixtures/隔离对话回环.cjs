'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path')
const { 创建假模型连接, 创建严格凭据 } = require('../../脑/模型连接.cjs')
const { 创建隔离对话核心 } = require('../../core/隔离对话核心.cjs')
const { 创建渠道权限, 创建渠道权限守卫 } = require('../../脑/渠道权限.cjs')
const { 创建假渠道适配器 } = require('../../脑/假渠道适配器.cjs')
const { 创建渠道会话映射 } = require('../../脑/渠道会话映射.cjs')
const { 创建渠道任务调度 } = require('../../脑/渠道任务调度.cjs')
const [根, 场景] = process.argv.slice(2), 配置文件 = path.join(根, 'headless.config.json')
const 配置 = JSON.parse(fs.readFileSync(配置文件, 'utf8'))
const 正常日志 = console.log, 诊断 = []; console.log = (...值) => { 诊断.push(值.map(String).join(' ')) }
let 核心, 调度, 守卫, 权限, 适配器, 映射
const 现在 = '2026-10-25T05:00:10.000Z'; let 刻度 = 场景 === 'restart-second' ? 1000 : 0
const 取现在 = () => new Date(Date.parse(现在) + ++刻度 * 10)
const 来信 = (编号 = 'm1', 会话 = 'a', 正文 = '你好', 改 = {}) => ({ 版本: 1, 端点: { 渠道: 'fake', 账号: 'local-fixture' }, 会话: { 类型: 'private', 编号: 会话 }, 发送者编号: 'owner-fixture', 消息编号: 编号, 发生于: '2026-10-25T05:00:00.000Z', 接收于: 现在, 回复消息编号: null, 正文, 附件: [], ...改 })
const 上下文 = (编号 = 'channel-test-a', 中止) => ({ 内部对话编号: 编号, ...(中止 ? { 中止 } : {}) })
const 历史文件 = path.join(配置.数据目录, '聊天记录', '聊天记录.jsonl')
const 建 = (生成 = async () => '固定回复。') => (核心 = 创建隔离对话核心({ 配置文件, 模型连接: 创建假模型连接({ 生成 }) }))
const 读历史 = () => fs.existsSync(历史文件) ? fs.readFileSync(历史文件, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : []
const 写历史 = (值) => { fs.mkdirSync(path.dirname(历史文件), { recursive: true }); fs.writeFileSync(历史文件, 值) }
function 渠道(处理 = 核心.处理) {
  权限 = 创建渠道权限({ 绑定: ['a', 'b'].map((私聊会话编号) => ({ 端点: 来信().端点, 本人编号: 'owner-fixture', 私聊会话编号, 允许主动发送: false })), 取现在 })
  适配器 = 创建假渠道适配器({ 取现在 }); 守卫 = 创建渠道权限守卫({ 适配器, 权限, 取现在 })
  映射 = 创建渠道会话映射({ 权限, 文件: path.join(配置.缓存目录, 'mapping.json') })
  调度 = 创建渠道任务调度({ 守卫, 权限, 映射, 处理, 文件: path.join(配置.缓存目录, 'tasks.json'), 取现在, 最小间隔毫秒: 1 })
  调度.启动()
}
async function main() {
  if (场景 === 'credentials') {
    assert.throws(() => 创建严格凭据(), /CORE_CREDENTIAL_PROVIDER_REQUIRED/u)
    for (const 值 of [null, '', 'short', Promise.resolve('fake'), { 钥匙: 'fake' }, 'x'.repeat(5000), 'x'.repeat(24) + '\n']) assert.throws(() => 创建严格凭据({ 读取: () => 值 }).取(), /CORE_CREDENTIAL_UNAVAILABLE/u)
    assert.throws(() => 创建严格凭据({ 读取: () => { throw new Error('PRIVATE-SENTINEL') } }).取(), /^Error: CORE_CREDENTIAL_UNAVAILABLE$/u)
    const 凭据 = 创建严格凭据({ 读取: () => 'fixture-credential-only-123456789' }); assert.equal(凭据.取(), 'fixture-credential-only-123456789')
  } else if (场景 === 'invalid-model') {
    for (const 模型连接 of [undefined, null, { 模式: 'fake', 要一轮: async () => ({ 全文: 'fake' }) }]) assert.throws(() => 创建隔离对话核心({ 配置文件, 模型连接 }), /CORE_MODEL_REQUIRED/u)
    assert(!fs.existsSync(配置.数据目录))
  } else if (场景 === 'early-import') {
    process.env.ELYSIA_CONFIG_FILE = 配置文件; process.env.ELYSIA_WORKSPACE_ROOT = 配置.工作区; process.env.ELYSIA_DATA_DIR = 配置.数据目录; process.env.ELYSIA_CACHE_DIR = 配置.缓存目录
    require('../../脑/配置.cjs'); assert.throws(() => 建(), /CORE_DEDICATED_PROCESS_REQUIRED/u)
  } else if (场景 === 'wrong-mode') {
    fs.writeFileSync(配置文件, JSON.stringify({ ...配置, 模式: 'health' })); assert.throws(() => 建(), /HEADLESS_CONFIG_INVALID/u)
  } else if (场景 === 'env-conflict') {
    process.env.ELYSIA_LLM_URL = 'https://invalid.example'; assert.throws(() => 建(), /CORE_ENV_CONFLICT/u)
  } else if (场景 === 'locked') {
    fs.mkdirSync(配置.数据目录, { recursive: true }); const 锁 = path.join(配置.数据目录, '.headless-fake.lock'); fs.writeFileSync(锁, 'other-fixture-owner')
    assert.throws(() => 建(), /CORE_STORE_IN_USE/u); assert.equal(fs.readFileSync(锁, 'utf8'), 'other-fixture-owner')
  } else if (场景 === 'roundtrip' || 场景 === 'restart-first' || 场景 === 'restart-second') {
    const 看到 = []
    建(async (消息) => { 看到.push(消息); return '固定回复。[表情:星星眼][记住:不应写入][经历:不应写入]' })
    const 记忆 = require('../../脑/记忆.cjs'); 记忆.设当前对话('desktop-fixture')
    渠道()
    if (场景 === 'restart-second') {
      const 先前 = fs.readFileSync(历史文件, 'utf8')
      await 适配器.注入接收(来信('m1', 'a', 'A第一条'))
      assert.equal(看到.length, 0); assert.equal(fs.readFileSync(历史文件, 'utf8'), 先前)
      await 适配器.注入接收(来信('m3', 'a', 'A第二条'))
      assert(看到[0].some((条) => 条.role === 'user' && 条.content.endsWith('\nA第一条')))
    } else {
      await 适配器.注入接收(来信('m1', 'a', 'A第一条')); await 适配器.注入接收(来信('m2', 'b', 'B第一条'))
      await 适配器.注入接收(来信('m1', 'a', 'A第一条'))
      assert.equal(看到.length, 2)
      assert(!看到[1].some((条) => String(条.content).includes('A第一条')))
      if (场景 === 'roundtrip') {
        await 适配器.注入接收(来信('m3', 'a', 'A第二条'))
        assert(看到[2].some((条) => 条.role === 'user' && 条.content.endsWith('\nA第一条')))
        assert(!看到[2].some((条) => String(条.content).includes('B第一条')))
        for (const 消息 of [来信('x', 'a', '陌生', { 发送者编号: 'stranger' }), 来信('y', 'a', '群', { 会话: { 类型: 'group', 编号: 'group' } })]) await 适配器.注入接收(消息)
        assert.equal(看到.length, 3)
      }
    }
    assert.equal(记忆.现在哪一段(), 'desktop-fixture'); assert.equal(记忆.读最近聊天(20).length, 0)
    const 记录 = 读历史(); assert.equal(new Set(记录.map((条) => 条.对话)).size, 2)
    assert(!JSON.stringify(记录).includes('不应写入'))
    assert(!fs.existsSync(path.join(配置.数据目录, '事实.json')))
    assert(调度.取任务状态().every((条) => 条.状态 === 'sent'))
    const 发送 = 适配器.取发送记录(); assert(发送.length > 0); assert(!JSON.stringify(发送).includes('[记住:'))
    assert.equal(核心.取状态().后台任务, 0)
  } else if (场景 === 'timestamps') {
    建(); await 核心.处理(来信('old', 'a', '早先的话', { 发生于: '2026-10-24T15:59:59.000Z', 接收于: '2026-10-24T16:00:01.000Z' }), 上下文())
    await 核心.处理(来信('unknown', 'a', '时间未知', { 发生于: null }), 上下文())
    const 记录 = 读历史(); assert.equal(记录[0].时间, '2026-10-24T15:59:59.000Z'); assert.equal(记录[0].接收于, '2026-10-24T16:00:01.000Z')
    assert.equal(记录[2].发生于, null); assert.equal(记录[2].时间, 现在)
  } else if (场景 === 'concurrent') {
    let 数 = 0, 最大 = 0; const 看到 = []
    建(async (消息) => { 最大 = Math.max(最大, ++数); await new Promise(setImmediate); 看到.push(消息); 数--; return '固定回复。' })
    await Promise.all([核心.处理(来信(), 上下文()), 核心.处理(来信('m2'), 上下文()), 核心.处理(来信('m3'), 上下文('channel-test-b'))])
    assert.equal(最大, 1); assert(看到[1].some((条) => 条.role === 'assistant')); assert.equal(读历史().length, 6)
  } else if (场景 === 'corrupt-history') {
    写历史('{broken\n'); const 前 = fs.readFileSync(历史文件); let 调用数 = 0; 建(async () => { 调用数++; return 'fake' })
    await assert.rejects(核心.处理(来信(), 上下文()), /CHAT_HISTORY_UNAVAILABLE/u); assert.equal(调用数, 0); assert.deepEqual(fs.readFileSync(历史文件), 前)
  } else if (场景 === 'corrupt-index') {
    const 文件 = path.join(配置.数据目录, '聊天记录', '对话索引.json'); fs.mkdirSync(path.dirname(文件), { recursive: true }); fs.writeFileSync(文件, '{broken'); 建()
    await assert.rejects(核心.处理(来信(), 上下文()), /CHAT_REGISTRATION_FAILED/u); assert.equal(fs.readFileSync(文件, 'utf8'), '{broken'); assert.equal(读历史().length, 0)
  } else if (场景 === 'write-failure') {
    建(); 渠道(); const 原 = fs.writeSync; fs.writeSync = function (fd, ...参数) { if (Buffer.isBuffer(参数[0])) throw new Error('PRIVATE-DISK-SENTINEL'); return 原.call(this, fd, ...参数) }
    await 适配器.注入接收(来信()); fs.writeSync = 原
    assert.equal(调度.取任务状态()[0].状态, 'failed'); assert.equal(适配器.取观测().模拟送达数, 0)
    await 适配器.注入接收(来信()); assert.equal(核心.取状态().处理数, 0)
  } else if (场景 === 'partial-write' || 场景 === 'fsync-failure') {
    建(); const 记忆 = require('../../脑/记忆.cjs'), 原写 = fs.writeSync, 原同步 = fs.fsyncSync
    const 内容 = { 对话: 'channel-partial', 用户正文: '虚构提问', 回复正文: '虚构回复', 发生于: null, 接收于: 现在, 完成于: 现在 }
    if (场景 === 'partial-write') {
      let 首次 = true; fs.writeSync = function (fd, 字节, 偏移, 长度) { if (首次) { 首次 = false; return 原写.call(this, fd, 字节, 偏移, 5) }; throw new Error('PRIVATE-WRITE-SENTINEL') }
    } else fs.fsyncSync = () => { throw new Error('PRIVATE-FSYNC-SENTINEL') }
    const 回执 = 记忆.存对话一轮(内容); fs.writeSync = 原写; fs.fsyncSync = 原同步
    assert.deepEqual(回执, { 好: false, 状态: 'unknown', 代码: 'CHAT_TURN_WRITE_FAILED', 对话: 'channel-partial' })
    if (场景 === 'partial-write') assert.throws(() => 记忆.读最近聊天(20, { 对话: 'channel-partial' }), /CHAT_HISTORY_UNAVAILABLE/u)
  } else if (场景 === 'no-final-newline') {
    写历史(JSON.stringify({ 时间: 现在, 角色: 'user', 内容: '既有虚构消息', 对话: 'channel-test-a' }))
    建(); await 核心.处理(来信(), 上下文()); assert.equal(读历史().length, 3)
  } else if (场景 === 'missing-history' || 场景 === 'missing-index') {
    建(); await 核心.处理(来信(), 上下文())
    const 文件 = 场景 === 'missing-history' ? 历史文件 : path.join(path.dirname(历史文件), '对话索引.json')
    fs.unlinkSync(文件); await assert.rejects(核心.处理(来信('m2'), 上下文()), /CORE_STORE_MISSING/u); assert(!fs.existsSync(文件))
  } else if (场景 === 'junction-before' || 场景 === 'junction-during') {
    const 外部夹具 = path.join(根, 'other-fixture'); fs.mkdirSync(外部夹具); fs.writeFileSync(path.join(外部夹具, 'sentinel'), 'fixture-only')
    const 链接 = path.join(配置.数据目录, 'linked')
    if (场景 === 'junction-before') {
      fs.mkdirSync(配置.数据目录); fs.symlinkSync(外部夹具, 链接, process.platform === 'win32' ? 'junction' : 'dir')
      assert.throws(() => 建(), /CORE_STORE_LINK/u)
    } else {
      建(async () => { fs.symlinkSync(外部夹具, 链接, process.platform === 'win32' ? 'junction' : 'dir'); return '固定回复。' })
      await assert.rejects(核心.处理(来信(), 上下文()), /CORE_STORE_LINK/u); assert.equal(读历史().length, 0)
    }
    assert.deepEqual(fs.readdirSync(外部夹具), ['sentinel'])
  } else if (场景 === 'disabled-tools') {
    建(async () => '固定回复。[搜索:PRIVATE-TOOL-SENTINEL][时间:现在][写:ignored]')
    const 草稿 = await 核心.处理(来信(), 上下文()); assert.deepEqual(Object.keys(草稿).sort(), ['可见性', '正文', '附件'].sort())
    assert(!JSON.stringify(草稿).includes('PRIVATE-TOOL-SENTINEL')); assert(!JSON.stringify(读历史()).includes('PRIVATE-TOOL-SENTINEL'))
  } else if (场景 === 'bad-input') {
    建(); for (const 输入 of [来信('a', 'a', 'hi', { 端点: { 渠道: 'qq', 账号: 'fixture' } }), { ...来信(), 模式: 'work' }]) await assert.rejects(核心.处理(输入, 上下文()), /CORE_INPUT_INVALID/u)
    for (const 归属 of [undefined, {}, { ...上下文(), 回复许可: 'fake' }, 上下文('../escape')]) await assert.rejects(核心.处理(来信(), 归属), /CORE_INPUT_INVALID/u)
    assert.equal(读历史().length, 0)
  } else if (场景 === 'abort-before') {
    建(); const 控制 = new AbortController(); 控制.abort(); await assert.rejects(核心.处理(来信(), 上下文('channel-test-a', 控制.signal)), /CORE_ABORTED/u); assert.equal(读历史().length, 0)
  } else if (场景 === 'abort-during' || 场景 === 'close-during' || 场景 === 'revoke-during') {
    let 开始, 放行; const 开始了 = new Promise((好) => { 开始 = 好 }), 等待 = new Promise((好) => { 放行 = 好 })
    建(async () => { 开始(); await 等待; return '迟到的回复。' }); const 控制 = new AbortController()
    if (场景 === 'revoke-during') {
      渠道(); const 本次 = 适配器.注入接收(来信()); await 开始了; 权限.更新绑定([]); 放行(); await 本次
      assert.equal(适配器.取观测().模拟送达数, 0)
    } else {
      const 本次 = 核心.处理(来信(), 上下文('channel-test-a', 控制.signal)); await 开始了
      if (场景 === 'close-during') 核心.关闭(); else 控制.abort()
      放行(); await assert.rejects(本次, /CORE_ABORTED/u)
    }
    assert.equal(读历史().length, 0)
  } else if (场景 === 'changed-path') {
    建(async () => { process.env.ELYSIA_DATA_DIR = path.join(根, 'changed'); return '固定回复。' })
    await assert.rejects(核心.处理(来信(), 上下文()), /HEADLESS_ENV_CONFLICT/u); assert.equal(读历史().length, 0)
  } else if (场景 === 'changed-config') {
    建(async () => { fs.writeFileSync(配置文件, JSON.stringify({ ...配置, 工作区: path.join(根, 'other') })); return '固定回复。' })
    await assert.rejects(核心.处理(来信(), 上下文()), /HEADLESS_ENV_CONFLICT|CORE_CONFIG_CHANGED/u); assert.equal(读历史().length, 0)
  } else if (场景 === 'model-error' || 场景 === 'model-error-prefix' || 场景 === 'bad-output') {
    建(async () => { if (场景 !== 'bad-output') throw new Error(场景 === 'model-error-prefix' ? 'CORE_PRIVATE_MODEL_SENTINEL' : 'PRIVATE-MODEL-SENTINEL'); return { 正文: 'invalid' } })
    await assert.rejects(核心.处理(来信(), 上下文()), 场景 !== 'bad-output' ? /^Error: CORE_MODEL_FAILED$/u : /CORE_MODEL_INVALID/u)
    assert.equal(读历史().length, 0)
  } else if (场景 === 'lost-lock') {
    建(); fs.unlinkSync(path.join(配置.数据目录, '.headless-fake.lock'))
    await assert.rejects(核心.处理(来信(), 上下文()), /CORE_STORE_OWNERSHIP/u); assert.equal(读历史().length, 0)
  } else if (场景 === 'legacy') {
    建(); const 记忆 = require('../../脑/记忆.cjs'); 记忆.设当前对话('desktop-fixture')
    assert(记忆.存聊天('user', '桌面原指针')); assert(记忆.存聊天('assistant', '显式保存', { 对话: 'channel-explicit' }))
    assert.equal(记忆.读聊天记录(0)[0].内容, '桌面原指针'); assert.equal(记忆.读最近聊天(1, { 对话: 'channel-explicit' })[0].内容, '显式保存')
    assert.throws(() => 记忆.读最近聊天(20, { 对话: '' }), /CHAT_ID_INVALID/u)
    const 登记 = 记忆.登记对话('channel-explicit'); assert(登记.好 && 登记.新建); assert.equal(记忆.登记对话('channel-explicit').新建, false)
    const 对话 = require('../../脑/对话.cjs'); await assert.rejects(对话.说话({ 模型连接: {} }), /CORE_MODEL_INVALID/u)
  } else if (场景 === 'shutdown') {
    建(); 核心.关闭(); 核心.关闭(); assert.equal(核心.取状态().已关闭, true)
    assert(!fs.existsSync(path.join(配置.数据目录, '.headless-fake.lock')))
    await assert.rejects(核心.处理(来信(), 上下文()), /CORE_CLOSED/u); assert.throws(() => 建(), /CORE_DEDICATED_PROCESS_REQUIRED/u)
  } else throw new Error('UNKNOWN_TEST_CASE')
}
main().then(() => { assert.deepEqual(诊断, [], '假核心不能输出原始业务诊断'); 正常日志('CASE_OK') }).catch((错) => { process.stderr.write(String(错.stack) + '\n'); process.exitCode = 1 }).finally(() => {
  调度?.关闭(); 守卫?.关闭(); 权限?.关闭(); 适配器?.关闭(); 映射?.关闭(); 核心?.关闭()
})
