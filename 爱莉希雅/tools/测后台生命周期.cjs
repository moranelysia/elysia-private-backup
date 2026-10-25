'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-background-life-'))
for (const [键, 值] of Object.entries({ ELYSIA_WORKSPACE_ROOT: 根, ELYSIA_CONFIG_FILE: path.join(根, 'config.json'), ELYSIA_DATA_DIR: path.join(根, 'data'), ELYSIA_CACHE_DIR: path.join(根, 'cache'), ELYSIA_学习区: path.join(根, 'learning') })) process.env[键] = 值
process.env.TZ = 'Asia/Shanghai'
global.fetch = () => { throw new Error('NO_NETWORK_ALLOWED') }
const { 创建后台任务 } = require('../core/后台任务.cjs')
const { 创建记忆后台 } = require('../core/记忆后台.cjs')
const { 创建假模型连接 } = require('../脑/模型连接.cjs')
const { 创建日记系统, 日期间 } = require('../脑/记忆日记.cjs')
const { 创建私密日记生成器 } = require('../脑/私密日记.cjs')
const 让步 = () => new Promise(setImmediate)
function 延后() { let 放; const 等 = new Promise((好) => { 放 = 好 }); return { 等, 放 } }
function 时钟() { let 时 = Date.parse('2026-10-25T05:00:00.000Z'), 编号 = 0; const 表 = new Map(); return { 表, 现在: () => 时, 加: (数) => { 时 += 数 }, 设延时: (做, 延迟) => { const 号 = ++编号; 表.set(号, { 做, 于: 时 + 延迟 }); return 号 }, 清延时: (号) => 表.delete(号) } }
function 快照(目录) { const 结果 = []; if (!fs.existsSync(目录)) return '[]'; for (const 名 of fs.readdirSync(目录).sort()) { const 文件 = path.join(目录, 名); if (fs.statSync(文件).isDirectory()) 结果.push([名, 快照(文件)]); else 结果.push([名, fs.readFileSync(文件).toString('base64')]) }; return JSON.stringify(结果) }
let 数 = 0, 用例 = 0; const 资源 = []
async function 测(名, 做) { await 做(); 数++; console.log('✓ ' + 名) }
function 管理(任务们, 钟 = 时钟(), 所有者 = {}) { const 一 = 创建后台任务({ 所有者, 任务们, 现在: 钟.现在, 设延时: 钟.设延时, 清延时: 钟.清延时 }); 资源.push(一); return 一 }
const 项 = (名字, 执行, 改 = {}) => ({ 名字, 执行, 首次: 0, 间隔: 1000, ...改 })
async function main() {
  await 测('同所有者不能重复实例，启动幂等、只有一个周期时钟', async () => {
    const 所有者 = {}, 钟 = 时钟(), 一 = 管理([项('diary', async () => {}), 项('relations', async () => {})], 钟, 所有者)
    assert.throws(() => 管理([], 钟, 所有者), /BACKGROUND_OWNER_IN_USE/u); 一.启动(); 一.启动(); assert.equal(钟.表.size, 1)
    await 一.停止(); assert.equal(钟.表.size, 0); assert.equal(一.通知('diary'), false); assert.throws(() => 一.启动(), /BACKGROUND_STOPPED/u)
  })
  await 测('在途任务不重入，通知合并，后台全局串行', async () => {
    const 闸 = 延后(), 调用 = []; const 一 = 管理([项('first', async () => { 调用.push('first'); await 闸.等 }), 项('second', async () => { 调用.push('second') })])
    一.启动(); const 首 = 一.推进(); await 让步(); 一.通知('first'); 一.通知('first'); assert.equal(一.推进(), 首)
    闸.放(); await 首; await 一.推进(); await 一.推进(); assert.deepEqual(调用, ['first', 'first', 'second']); await 一.停止()
  })
  await 测('防抖与最小间隔不能被通知绕过', async () => {
    const 钟 = 时钟(); let 次 = 0; const 一 = 管理([项('relations', async () => { 次++ }, { 仅通知: true, 防抖: 45, 最小间隔: 600 })], 钟)
    一.启动(); 一.通知('relations'); await 一.推进(); assert.equal(次, 0); 钟.加(45); await 一.推进(); assert.equal(次, 1)
    一.通知('relations'); 钟.加(46); await 一.推进(); assert.equal(次, 1); 钟.加(554); await 一.推进(); assert.equal(次, 2); await 一.停止()
  })
  await 测('停止有界返回，迟到生成不能经过提交检查', async () => {
    const 闸 = 延后(); let 写入 = 0; const 一 = 管理([项('diary', async (任务) => { await 闸.等; 任务.检查写入(); 写入++ })])
    一.启动(); const 在途 = 一.推进(); await 让步(); const 结果 = await 一.停止({ 等待毫秒: 10 }); assert(结果.超时); 闸.放(); await 在途; assert.equal(写入, 0)
  })
  await 测('六类任务通过同一注册器，异常仅固定状态计数', async () => {
    const 一 = 管理(['diary', 'private', 'relations', 'clusters', 'facts', 'extract'].map((名) => 项(名, async () => { throw new Error('PRIVATE-SENTINEL') })))
    一.启动(); for (let i = 0; i < 6; i++) await 一.推进(); assert(!JSON.stringify(一.取状态()).includes('SENTINEL')); assert.equal(一.取状态().任务.reduce((和, 条) => 和 + 条.失败数, 0), 6); await 一.停止()
  })
  for (const 阶段 of ['source', 'model']) await 测('普通日记在' + 阶段 + '阶段停止后不写正文或失败状态', async () => {
    const 目录 = path.join(根, 'diary-' + ++用例), 闸 = 延后(), 控制 = new AbortController()
    const 系统 = 创建日记系统({ 数据目录: 目录, 现在: () => new Date('2026-10-25T05:00:00.000Z'),
      取来源: async () => { if (阶段 === 'source') await 闸.等; return [{ 编号: 'fixture', 类型: '聊天', 时间: '2026-10-24T10:00:00.000Z', 摘要: '虚构片段' }] },
      生成: async () => { if (阶段 === 'model') await 闸.等; return { 标题: '测试', 模块: [{ 名字: '回顾', 正文: '我记得这段虚构对话。', 来源: ['fixture'] }] } },
    })
    系统.安排(); const 在途 = 系统.执行待办({ 中止: 控制.signal }, 1); await 让步(); const 前 = 快照(目录); 控制.abort(); 闸.放(); await assert.rejects(在途, /TASK_ABORTED/u); assert.equal(快照(目录), 前)
  })
  for (const 阶段 of ['source', 'model']) await 测('私密日记在' + 阶段 + '阶段停止后不写评估重试', async () => {
    const 目录 = path.join(根, 'private-' + ++用例), 闸 = 延后(), 控制 = new AbortController()
    const 系统 = 创建私密日记生成器({ 数据目录: 目录, 允许隔离写入: true, 现在: () => new Date('2026-10-25T05:00:00.000Z'),
      取来源: async () => { if (阶段 === 'source') await 闸.等; return [{ 编号: 'fixture', 类型: '聊天', 时间: '2026-10-24T10:00:00.000Z', 摘要: '你说最近遇到了难处。', 标题: '对话' }] },
      生成: async () => { if (阶段 === 'model') await 闸.等; return { 触发: false } },
    })
    const 在途 = 系统.整理一天({ 日期: new Date('2026-10-24T04:00:00.000Z'), 连接: { 中止: 控制.signal } }); await 让步(); const 前 = 快照(目录); 控制.abort(); 闸.放(); await assert.rejects(在途, /TASK_ABORTED/u); assert.equal(快照(目录), 前)
  })
  await 测('事实整理第二次模型复核停止后保留原事实且不写快照', async () => {
    const 记忆 = require('../脑/记忆.cjs'); const 甲 = 记忆.记一条('事实', '你喜欢草莓蛋糕。'), 乙 = 记忆.记一条('事实', '你很喜欢草莓蛋糕。')
    const 闸 = 延后(), 控制 = new AbortController(); let 次 = 0
    const 在途 = require('../脑/记忆整理.cjs').整理一次({ 钥匙: 'fixture', 地址: 'fixture', 中止: 控制.signal,
      fetch函数: async () => { const 值 = ++次 === 1 ? { 合并: [{ 编号们: [甲.编号, 乙.编号], 新内容: '你喜欢草莓蛋糕。' }] } : (await 闸.等, { 批准组号: [0] }); return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(值) } }] })) },
    }); await 让步(); assert.equal(次, 2); const 前 = 快照(process.env.ELYSIA_DATA_DIR); 控制.abort(); 闸.放(); await assert.rejects(在途, /TASK_ABORTED/u); assert.equal(快照(process.env.ELYSIA_DATA_DIR), 前)
  })
  await 测('临时提取停止后不新增/晋升或通知', async () => {
    const 库 = require('../脑/临时记忆.cjs').创建临时记忆库({ 数据目录: path.join(根, 'extract-late') }), 闸 = 延后(), 控制 = new AbortController(); let 通知 = 0
    const 提取器 = require('../脑/临时记忆提取.cjs').创建提取器({ 临时记忆库: 库 })
    const 在途 = 提取器.提取一次({ 钥匙: 'fixture', 地址: 'fixture', 用户原话: '我喜欢草莓蛋糕', 她的回复: '嗯', 中止: 控制.signal, 通知: () => { 通知++ },
      fetch函数: async () => { await 闸.等; return new Response(JSON.stringify({ choices: [{ message: { content: '{"候选":[]}' } }] })) },
    }); await 让步(); const 前 = 快照(根); 控制.abort(); 闸.放(); await assert.rejects(在途, /TASK_ABORTED/u); assert.equal(快照(根), 前); assert.equal(通知, 0)
  })
  await 测('Node提取有显式通知，禁用时不启动桌面队列', async () => {
    const 库 = require('../脑/临时记忆.cjs').创建临时记忆库({ 数据目录: path.join(根, 'notify') }); const 通知 = []
    const 果 = await require('../脑/临时记忆提取.cjs').创建提取器({ 临时记忆库: 库 }).提取一次({ 钥匙: 'fixture', 地址: 'fixture', 用户原话: '我周六想去图书馆', 她的回复: '嗯', 消息时间: '2026-10-24T15:59:59.000Z', 通知: (一) => 通知.push(一),
      fetch函数: async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ 候选: [{ 类别: '近期计划', 记忆类型: 'episodic', 内容: '你周六想去图书馆', 依据原文: '我周六想去图书馆', 元数据: { backstory: '近期计划', person: '用户本人', relationship: '本人' } }] }) } }] })),
    }); assert.equal(果.新增数, 1); assert.equal(通知.length, 1); assert.equal(通知[0].临时变化, true); assert.equal(库.查询({ 生命周期: '有效' }).列表[0].来源.消息时间, '2026-10-24T15:59:59.000Z')
    const 晋升 = await require('../脑/临时记忆提取.cjs').创建提取器({ 临时记忆库: 库 }).提取一次({ 钥匙: 'fixture', 地址: 'fixture', 用户原话: '我喜欢听小提琴，请记住这个偏好', 她的回复: '嗯', 通知: (一) => 通知.push(一),
      fetch函数: async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ 候选: [{ 类别: '候选偏好', 记忆类型: 'semantic', 内容: '你喜欢听小提琴', 依据原文: '我喜欢听小提琴', 元数据: { backstory: '你明确要求记住的偏好', person: '用户本人', relationship: '本人' } }] }) } }] })),
    }); assert(晋升.自主处理.some((一) => 一.晋升?.好)); assert.equal(通知[1].长期变化, true)
  })
  await 测('上海跨午夜归属正确，前一日不随接收时间改写', () => {
    const 前 = 日期间(new Date('2026-10-24T15:59:59.000Z')), 后 = 日期间(new Date('2026-10-24T16:00:01.000Z'))
    assert.equal(前.周期, '2026-10-24'); assert.equal(后.周期, '2026-10-25'); assert.equal(后.开始.toISOString(), '2026-10-24T16:00:00.000Z')
  })
  await 测('桌面private调度停止传播中止，重启可重新检查而不并发', async () => {
    const 闸 = 延后(); let 次 = 0, 连接
    const 一 = require('../脑/私密日记调度.cjs').创建私密日记调度({ 已启用: true, 现在: () => new Date('2026-10-25T05:00:00.000Z'), 记录() {},
      创建生成器: () => ({ 整理一天: async (参数) => { 次++; 连接 = 参数.连接; await 闸.等; 参数.连接.检查写入(); return { 好: true, 写入: false } } }),
      设延时: () => 1, 清延时() {}, 设间隔: () => 2, 清间隔() {},
    })
    一.启动(); const 在途 = 一.唤醒(); await 让步(); 一.停止(); assert(连接.中止.aborted); assert.equal((await 一.唤醒()).已排队, false)
    闸.放(); await 在途; assert.equal(一.状态().本次已检查.length, 0); 一.启动(); await 一.唤醒(); assert.equal(次, 2); 一.停止()
  })
  await 测('Node缓冲持久恢复、三轮或五分钟提取且不串对话', async () => {
    const 缓存 = path.join(根, 'service-cache'), 钟 = 时钟(), 批次 = []
    const 参数 = { 配置: { 数据目录: process.env.ELYSIA_DATA_DIR, 缓存目录: 缓存 }, 检查写入() {}, 设置: { extract: true }, 现在: () => new Date(钟.现在()), 设延时: 钟.设延时, 清延时: 钟.清延时,
      模型连接: 创建假模型连接({ 生成: async (消息) => { 批次.push(JSON.parse(消息[1].content).本批对话); return '{"候选":[]}' } }),
    }
    const 记录 = (一, 会话, 编号) => 一.记录轮次({ 对话: 'channel-' + 会话, 消息编号: 编号, 用户原话: 会话 + 编号, 她的回复: '嗯', 发生于: '2026-10-24T15:59:59.000Z', 接收于: new Date(钟.现在()).toISOString() })
    const 一 = 创建记忆后台({ ...参数, 所有者: {} }); 资源.push(一); 一.启动(); 记录(一, 'a', 'one'); 记录(一, 'b', 'one'); await 一.推进(); assert.equal(批次.length, 0); await 一.停止()
    const 二 = 创建记忆后台({ ...参数, 所有者: {} }); 资源.push(二); 二.启动(); assert.equal(二.取状态().待提取轮数, 2)
    记录(二, 'a', 'two'); 记录(二, 'a', 'three'); await 二.推进(); assert.equal(批次.length, 1); assert(批次[0].every((条) => 条.用户原话.startsWith('a')))
    钟.加(300000); await 二.推进(); assert.equal(批次.length, 2); assert.equal(批次[1][0].用户原话, 'bone'); assert.equal(二.取状态().待提取轮数, 0); await 二.停止()
  })
  await 测('损坏缓冲不按空表覆盖，private默认关闭且不能借参数越权', () => {
    const 缓存目录 = path.join(根, 'bad-cache'); fs.mkdirSync(缓存目录); fs.writeFileSync(path.join(缓存目录, '后台缓冲.json'), '{broken')
    const 公共 = { 所有者: {}, 配置: { 缓存目录 }, 检查写入() {}, 模型连接: 创建假模型连接({ 生成: async () => 'fake' }) }
    assert.throws(() => 创建记忆后台({ ...公共, 设置: { extract: true } }), /BACKGROUND_BUFFER_INVALID/u); assert.throws(() => 创建记忆后台({ ...公共, 设置: { private: true } }), /BACKGROUND_POLICY_INVALID/u)
    assert.equal(fs.readFileSync(path.join(缓存目录, '后台缓冲.json'), 'utf8'), '{broken')
  })
  console.log(`后台生命周期：${数}/${数} 通过（隔离目录、假模型与假时钟）`)
}
main().catch((错) => { console.error(错); process.exitCode = 1 }).finally(async () => {
  for (const 一 of 资源) await 一.停止()
  const 相对 = path.relative(path.resolve(os.tmpdir()), path.resolve(根))
  if (相对 && !path.isAbsolute(相对) && !相对.startsWith('..') && path.basename(根).startsWith('elysia-background-life-')) fs.rmSync(根, { recursive: true, force: true })
})
