/** 只供C-15测试的独立子进程：在指定断点退出，故意留下隔离存档与锁。 */
'use strict'
const path = require('node:path')
const { 创建渠道权限, 创建渠道权限守卫 } = require('../../脑/渠道权限.cjs')
const { 创建假渠道适配器 } = require('../../脑/假渠道适配器.cjs')
const { 创建渠道会话映射 } = require('../../脑/渠道会话映射.cjs')
const { 创建渠道任务调度 } = require('../../脑/渠道任务调度.cjs')
const 根 = process.argv[2], 模式 = process.argv[3]
if (!path.isAbsolute(根) || !['processing', 'sending', 'queued'].includes(模式)) process.exit(2)
const 消息 = JSON.parse(JSON.stringify(require('./渠道契约-v1.json').本人私聊))
消息.端点 = { 渠道: 'fake', 账号: 'local-fixture' }
const 取现在 = () => new Date('2026-10-25T05:00:10.000Z')
const 权限 = 创建渠道权限({ 绑定: [{ 端点: 消息.端点, 本人编号: 消息.发送者编号, 私聊会话编号: 消息.会话.编号, 允许主动发送: false }], 取现在 })
const 适配器 = 创建假渠道适配器({ 取现在 })
const 基础守卫 = 创建渠道权限守卫({ 适配器, 权限, 取现在 })
const 守卫 = 模式 === 'sending' ? { ...基础守卫, 发送: async () => process.exit(0) } : 基础守卫
const 映射 = 创建渠道会话映射({ 权限, 文件: path.join(根, 'mapping.json') })
const 调度 = 创建渠道任务调度({ 守卫, 权限, 映射, 文件: path.join(根, 'tasks.json'), 取现在,
  处理: async () => {
    if (模式 === 'processing') process.exit(0)
    if (模式 === 'queued') 适配器.设连接(false)
    return { 可见性: 'shared', 正文: '本地固定回复。', 附件: [] }
  },
})
调度.启动()
适配器.注入接收(消息).then(() => process.exit(0), () => process.exit(3))
