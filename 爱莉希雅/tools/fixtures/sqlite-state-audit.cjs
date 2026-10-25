'use strict'
const assert = require('node:assert/strict'), Module = require('node:module')
const 原 = Module._load, 白名单 = new Set(['node:sqlite', 'node:crypto', '../../storage/sqlite-context.cjs', '../../storage/sqlite-state.cjs', '../../storage/sqlite-diary.cjs', './sqlite-context.cjs', './sqlite-state.cjs', '../脑/渠道契约.cjs', '../脑/日记共用规则.cjs', './记忆叙述.cjs'])
Module._load = function (名, 父, 主) { if (!白名单.has(名)) throw new Error('SQLITE_STATE_AUDIT_DEPENDENCY'); return 原.call(this, 名, 父, 主) }
global.fetch = () => { throw new Error('SQLITE_STATE_AUDIT_NETWORK') }
const { 创建内存上下文 } = require('../../storage/sqlite-context.cjs'), { 创建状态仓储 } = require('../../storage/sqlite-state.cjs'), { 创建日记仓储 } = require('../../storage/sqlite-diary.cjs')
const ctx = 创建内存上下文({ 用途: 'synthetic-sqlite-repository' }), 时间 = '2026-10-26T00:00:00.000Z'
try {
  const state = 创建状态仓储(ctx), diary = 创建日记仓储(ctx), 后端 = state.创建后端('extraction-buffer'); 后端.读取(); 后端.保存({ 版本: 1, 轮次: [{ 对话: 'chat-a', 消息编号: 'msg-a', 用户原话: '明天见。', 她的回复: '我等你。', 消息时间: 时间, 接收于: 时间 }] })
  const 日记 = { 格式版本: 1, 编号: '私密日:2026-10-25', 类型: '日', 周期: '2026-10-25', 开始: '2026-10-25T00:00:00.000Z', 结束: 时间, 标题: '没说出口', 可见性: 'private', 模块: [{ 名字: '陪伴片段', 正文: '你说起最近的难处。我想再靠近一点，话却停在了嘴边。', 来源: ['source-a'] }], 来源: [{ 编号: 'source-a', 类型: '对话', 摘要: '你说起最近的难处。' }], 生成于: 时间, 用户修改: false }
  assert.equal(diary.写入私密({ 日记, 预期版本: 0 }).好, true); assert.equal(diary.导出共享().length, 0); assert.equal(state.核验().好, true); assert.equal(diary.核验().好, true)
  process.stdout.write('SQLITE_STATE_AUDIT_OK\n')
} finally { ctx.关闭(); Module._load = 原 }
