/** 在独立进程由原JSON模块读取新发布的虚构回退目录。 */
'use strict'
const assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs'), os = require('node:os'), Module = require('node:module')
const [目录, 对话, 临时编号, 模式] = process.argv.slice(2), 根 = fs.realpathSync(目录)
assert.equal(path.basename(根), 'ready'); assert.ok(path.basename(path.dirname(根)).startsWith('elysia-sqlite-E-')); assert.equal(path.dirname(path.dirname(根)).toLowerCase(), fs.realpathSync(os.tmpdir()).toLowerCase())
if (模式 === 'private') process.env.ELYSIA_DATA_DIR = path.join(根, 'nonformal')
const 原载入 = Module._load
Module._load = function (名, ...余) { if (/^(?:node:)?(?:https?|net|tls|electron)$/u.test(名) || /(?:钥匙|模型客户端|deepseek)/iu.test(名)) throw Error('READER_NETWORK_FORBIDDEN'); return 原载入.call(this, 名, ...余) }
global.fetch = () => { throw Error('READER_NETWORK_FORBIDDEN') }
// 配置路径由父进程固定到本次隔离目录；正文文件只能读回退目录，源码加载除外。
const 原读 = fs.readFileSync, 源码根 = path.resolve(__dirname, '../..')
fs.readFileSync = function (文件, ...余) { if (typeof 文件 !== 'number') { const p = path.resolve(String(文件)), rel = path.relative(path.dirname(根), p), source = path.relative(源码根, p); assert.ok((!rel.startsWith('..') && !path.isAbsolute(rel)) || (!source.startsWith('..') && /\.(cjs|js|json)$/u.test(p) && !/(?:记忆|\.cache)[\\/]/u.test(source)), 'READER_FILE_OUTSIDE_SANDBOX') }; return 原读.call(this, 文件, ...余) }
;(async () => {
  const 私密 = require('../../脑/私密日记.cjs')
  if (模式 === 'before') {
    const 共享 = require('../../脑/记忆日记.cjs').创建日记系统({ 数据目录: path.join(根, 'data') }).给界面().列表
    assert.equal(共享.length, 2); assert.equal(JSON.stringify(共享).includes('捏着衣角'), false)
    const 本机 = 私密.创建私密日记库({ 数据目录: path.join(根, 'data') }).给本机界面()
    assert.equal(本机.列表.length, 1); assert.equal(本机.跳过, 0); assert.ok(本机.列表[0].模块[0].正文.includes('捏着衣角'))
    process.stdout.write('SQLITE_ROLLBACK_BEFORE_OK\n'); return
  }
  if (模式 === 'private') {
    const 生成器 = 私密.创建私密日记生成器({ 数据目录: path.join(根, 'data'), 允许隔离写入: true, 取现在: () => new Date('2026-10-26T00:00:00.000Z'), 取来源: () => assert.fail('DELETED_SOURCE_REUSED'), 生成: () => assert.fail('DELETED_GENERATED') })
    const 回 = await 生成器.整理一天({ 日期: '2026-10-25' }); assert.equal(回.状态, '已删除'); assert.equal(回.写入, false)
    process.stdout.write('SQLITE_ROLLBACK_PRIVATE_OK\n'); return
  }
  const 记忆 = require('../../脑/记忆.cjs'), 临时 = require('../../脑/临时记忆.cjs')
  assert.equal(记忆.对话列表().find((x) => x.编号 === 对话).标题, '新标题')
  assert.equal(记忆.读聊天记录(0, { 对话 }).length, 4)
  const 长 = 记忆.全部长期记忆(); assert.equal(长.length, 1); assert.equal(长[0].内容, '我们一起听了新的曲子')
  const 条 = 临时.取一条(临时编号); assert.equal(条.生命周期, '已晋升'); assert.equal(条.评估账本.证据.length, 1)
  const 回 = require('../../脑/临时记忆晋升.cjs').晋升到长期({ 临时库: 临时, 长期库: 记忆, 编号: 临时编号, 去向: '事实' }); assert.equal(回.没变化, true); assert.equal(记忆.全部长期记忆().length, 1)
  const 日记 = require('../../脑/记忆日记.cjs').创建日记系统({ 数据目录: path.join(根, 'data') }), 列 = 日记.给界面().列表
  assert.equal(列.length, 2); assert.ok(列.every((x) => x.状态 === '已完成')); assert.ok(列.some((x) => x.标题 === '后来改过的标题')); assert.equal(JSON.stringify(列).includes('捏着衣角'), false)
  assert.equal(私密.创建私密日记库({ 数据目录: path.join(根, 'data') }).给本机界面().列表.length, 0)
  assert.equal(私密.读评估索引(path.join(根, 'data')).任务[0].状态, '已删除')
  assert.equal(require('../../脑/工作索引.cjs').给界面().列表[0].目标, '虚构任务')
  const 图 = require('../../脑/记忆关系图.cjs').创建关系图库({ 长期记忆库: 记忆 })
  assert.equal(图.查询().关系.length, 0)
  assert.equal(require('../../脑/用量.cjs').读全部().length, 1)
  assert.equal(require('../../脑/记忆聚类候选.cjs').读旧报告(path.join(根, 'cache/记忆聚类候选.json')).格式版本, 2)
  const 后台 = require('../../core/记忆后台.cjs').创建记忆后台({ 所有者: {}, 配置: { 数据目录: path.join(根, 'data'), 缓存目录: path.join(根, 'cache') }, 模型连接: { 要一轮: () => assert.fail('MODEL_CALLED') }, 检查写入: () => {}, 设置: { extract: true }, 现在: () => new Date('2026-10-26T00:00:00.000Z'), 设延时: () => assert.fail('TIMER_STARTED') })
  assert.equal(后台.取状态().待提取轮数, 1); await 后台.停止()
  const 渠道回 = await require('./sqlite-backup-scenario.cjs').渠道(null, () => assert.fail('DUPLICATE_CHANNEL_CORE'), { 目录: 根 })
  assert.equal(渠道回.任务[0].状态, 'sent'); assert.equal(渠道回.观测.模拟送达数, 0)
  process.stdout.write('SQLITE_ROLLBACK_READERS_OK\n')
})().catch((e) => { console.error(e.stack); process.exitCode = 1 })
