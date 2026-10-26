/** 全部为虚构材料；串起原fake渠道/权限/任务和B/C/D，同一内存库。 */
'use strict'
const assert = require('node:assert/strict'), path = require('node:path')
const { 创建隔离仓储, 备份范围 } = require('../../storage/sqlite-backup.cjs')
const { 创建渠道权限, 创建渠道权限守卫 } = require('../../脑/渠道权限.cjs')
const { 创建假渠道适配器 } = require('../../脑/假渠道适配器.cjs')
const { 创建渠道会话映射 } = require('../../脑/渠道会话映射.cjs')
const { 创建渠道任务调度 } = require('../../脑/渠道任务调度.cjs')
const { 创建关系图库 } = require('../../脑/记忆关系图.cjs')
const 样例 = require('./渠道契约-v1.json')
const 时间 = '2026-10-26T00:00:00.000Z', 本机 = { 用途: 'local-private-diary' }
const 拷 = (值) => JSON.parse(JSON.stringify(值))
function 篇(私密 = false, 周期 = '2026-10-25') {
  return { 格式版本: 1, 编号: (私密 ? '私密日:' : '日:') + 周期, 类型: '日', 周期, 开始: 周期 + 'T00:00:00.000Z', 结束: 时间, 标题: 私密 ? '没说出口' : '一起听歌', 可见性: 私密 ? 'private' : 'shared', 模块: [{ 名字: '陪伴片段', 正文: 私密 ? '你说起最近的难处。我捏着衣角，想靠近一点，话却停在了嘴边。' : '我们一起听了曲子，我很开心。', 来源: ['source-a'] }], 来源: [{ 编号: 'source-a', 类型: '对话', 时间, 标题: '听歌', 摘要: '我们聊起最近的心事。' }], 生成于: 时间, 修改于: '', 用户修改: false, 扩展: { 空值: null, 空串: '', 未来字段: [1, false] } }
}
function 存状态(仓, 类, 值, 号 = 'main') { const 后端 = 仓.状态.创建后端(类, 号); try { 后端.读取(); 后端.保存(值) } finally { 后端.关闭() } }
async function 渠道(仓, 处理, { 目录 } = {}) {
  const 消息 = { ...拷(样例.本人私聊), 端点: { 渠道: 'fake', 账号: 'local-fixture' }, 发生于: 时间, 接收于: 时间, 正文: '我喜欢雨后的散步' }
  const 取现在 = () => new Date(时间), 权限 = 创建渠道权限({ 绑定: [{ 端点: 消息.端点, 本人编号: 消息.发送者编号, 私聊会话编号: 消息.会话.编号, 允许主动发送: false }], 取现在 })
  const 适配器 = 创建假渠道适配器({ 取现在 }), 守卫 = 创建渠道权限守卫({ 适配器, 权限, 取现在 })
  const 映射 = 创建渠道会话映射({ 权限, ...(目录 ? { 文件: path.join(目录, 'channels/fake/映射.json') } : { 存储: 仓.状态.创建后端('channel-map', 'fake') }) })
  const 调度 = 创建渠道任务调度({ 权限, 守卫, 映射, 取现在, ...(目录 ? { 文件: path.join(目录, 'channels/fake/任务.json') } : { 存储: 仓.状态.创建后端('channel-tasks', 'fake') }), 处理 })
  try { 调度.启动(); await 适配器.注入接收(消息); await 调度.推进(); return { 任务: 调度.取任务状态(), 观测: 适配器.取观测() } }
  finally { 调度.关闭(); 映射.关闭(); 守卫.关闭(); 权限.关闭(); 适配器.关闭() }
}
async function 场景() {
  const 仓 = 创建隔离仓储({ 用途: 'synthetic-sqlite-repository' }); let 操 = 0, 对话, 轮, 回执, 晋升输入, 晋升, 临时
  const 调 = (方法, 参数) => 仓.记忆[方法]({ 操作编号: 'op-' + (++操), 时间, 预期版本: 仓.记忆.取统计().版本, ...参数 })
  try {
    const 渠道回 = await 渠道(仓, async (消息, { 内部对话编号 }) => {
      对话 = 内部对话编号
      assert.equal(仓.会话.登记对话(对话, { 建于: 时间, 写长期记忆: true, 扩展: { 空值: null, 空串: '' } }).好, true)
      轮 = { 对话, 轮次: 'round-a', 用户正文: '我喜欢雨后的散步', 回复正文: '下次我们一起去吧。', 接收于: 时间, 完成于: 时间 }
      回执 = 仓.会话.存对话一轮(轮); assert.equal(回执.好, true)
      const 回 = 调('新增临时', { 类别: '候选偏好', 内容: '你喜欢雨后的散步', 来源消息编号: 回执.消息编号[0], 依据原文: '喜欢雨后的散步', 扩展: { 来源注记: '' } }); assert.equal(回.好, true); 临时 = 回.临时编号
      晋升输入 = { 操作编号: 'op-' + (++操), 时间, 预期版本: 仓.记忆.取统计().版本, 编号: 临时, 消息编号: [回执.消息编号[0]] }
      晋升 = 仓.记忆.评估并晋升(晋升输入); assert.equal(晋升.晋升, true)
      return { 可见性: 'shared', 正文: 轮.回复正文, 附件: [] }
    })
    assert.equal(渠道回.任务[0].状态, 'sent'); assert.equal(渠道回.观测.模拟送达数, 1)
    // 第二条长期记忆用于验证编辑与删除互不影响。
    const 二 = 调('新增临时', { 类别: '近期事件', 内容: '我们一起听了曲子', 细节: { 手动: true } }); assert.equal(二.好, true)
    const 长二 = 调('人工确认晋升', { 编号: 二.临时编号, 去向: '经历' }); assert.equal(长二.晋升, true)
    const 图 = 创建关系图库({ 存储: { 关系: 仓.状态.创建后端('relations'), 布局: 仓.状态.创建后端('relation-layout') }, 长期记忆库: { 全部长期记忆: () => 仓.记忆.列长期().列表 }, 现在: () => new Date(时间), 造编号: () => 'edge-a' })
    const 候选 = { 类型: '同一主题', 从: { 类别: '事实', 编号: 晋升.目标编号 }, 到: { 类别: '经历', 编号: 长二.目标编号 }, 置信度: 1, 依据: '虚构关联' }
    const 关联 = 图.应用自动候选({ 候选们: [候选] }); assert.equal(关联.新增数, 1)
    assert.equal(图.保存布局({ 节点: { ['事实:' + 晋升.目标编号]: { x: 20, y: 40 } }, 视图: { x: 1, y: 2, 缩放: 1 } }).好, true)
    for (const 一 of [篇(), 篇(false, '2026-10-24')]) assert.equal(仓.日记.写入共享({ 日记: 一, 预期版本: 0 }).好, true)
    assert.equal(仓.日记.写入私密({ 日记: 篇(true), 预期版本: 0 }).好, true)
    存状态(仓, 'extraction-buffer', { 版本: 1, 轮次: [{ 对话, 消息编号: 回执.消息编号[0], 用户原话: 轮.用户正文, 她的回复: 轮.回复正文, 消息时间: 时间, 接收于: 时间 }] })
    for (const 号 of ['desktop', 'headless']) 存状态(仓, 'usage', [{ 时间, 模型: 'fixture', 状态: '成功', 输入: 12, 输出: 9, 元: 0.001, 扩展: { 未知: null } }], 号)
    存状态(仓, 'work-index', [{ 编号: 'work-a', 状态: '已完成', 对话, 目标: '虚构任务', 产物: [], 完成时间: 时间, 结果摘要: '完成' }])
    存状态(仓, 'background-state', { 格式版本: 1, 更新于: 时间, 扩展: { 不猜测: true } }, 'relations')
    存状态(仓, 'background-state', { 上次完成于: 时间, 端: 'headless' }, 'relations-headless')
    存状态(仓, 'cluster-state', require('../../脑/记忆聚类候选.cjs').生成报告({ 记录们: [], 现在: () => new Date(时间) }), 'clusters')
    存状态(仓, 'cluster-state', require('../../脑/记忆时间线候选.cjs').生成报告({ 记录们: [], 现在: () => new Date(时间) }), 'timeline')
    const 文件 = [{ 路径: 'data/附件/fixture.bin', base64: Buffer.from([0, 1, 255, 42]).toString('base64') }, { 路径: 'workspace/学习/进度.md', base64: Buffer.from('# 虚构学习\r\n原Markdown不改写。\r\n').toString('base64') }]
    const 备份 = () => 仓.创建备份({ 时间, 外部文件: 文件, 必须文件: 文件.map((x) => x.路径) }, 备份范围)
    function 改动() {
      assert.equal(仓.会话.更新对话(对话, { 预期版本: 1, 标题: '新标题' }).好, true)
      assert.equal(仓.会话.存对话一轮({ ...轮, 轮次: 'round-b', 用户正文: '我们明天再聊', 回复正文: '明天见。' }).好, true)
      assert.equal(调('人工修改长期', { 类别: '经历', 编号: 长二.目标编号, 内容: '我们一起听了新的曲子' }).好, true)
      assert.equal(图.删除(关联.关系[0].编号).好, true)
      assert.equal(调('人工遗忘长期', { 类别: '事实', 编号: 晋升.目标编号 }).好, true)
      assert.equal(仓.日记.修改共享({ 编号: 篇().编号, 预期版本: 1, 时间, 标题: '后来改过的标题', 模块: 篇().模块 }).好, true)
      assert.equal(仓.日记.删除共享({ 编号: 篇(false, '2026-10-24').编号, 预期版本: 1, 时间 }).好, true)
      assert.equal(仓.日记.删除私密({ 编号: 篇(true).编号, 预期版本: 1, 时间 }, 本机).好, true)
      assert.equal(仓.日记.写入共享({ 日记: 篇(false, '2026-10-23'), 预期版本: 0 }).好, true)
      return { 长期: 长二.目标编号, 已删: 晋升.目标编号 }
    }
    return { 仓, 对话, 轮, 回执, 晋升输入, 晋升, 临时, 文件, 备份, 改动, 候选 }
  } catch (错) { 仓.关闭(); throw 错 }
}
module.exports = { 场景, 渠道, 篇, 存状态, 时间, 本机, 拷 }
