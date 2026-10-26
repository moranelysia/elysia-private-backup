'use strict'
const assert = require('node:assert/strict'), Module = require('node:module')
const 原 = Module._load
const 允许 = new Set(['node:sqlite', 'node:crypto', '../../storage/sqlite-context.cjs', '../../storage/sqlite-chat.cjs', '../../storage/sqlite-memory.cjs', './sqlite-context.cjs', './sqlite-chat.cjs', '../脑/临时记忆状态.cjs', '../脑/临时记忆自主评估.cjs', '../脑/记忆结构.cjs', '../脑/记忆叙述.cjs', '../脑/临时记忆晋升.cjs', './记忆结构.cjs', './记忆叙述.cjs', './临时记忆自主评估.cjs'])
允许.add('./sqlite-legacy-source.cjs')
Module._load = function (名, 父, 主) { if (!允许.has(名)) throw new Error('SQLITE_MEMORY_AUDIT_DEPENDENCY'); return 原.call(this, 名, 父, 主) }
global.fetch = () => { throw new Error('SQLITE_MEMORY_AUDIT_NETWORK') }
const { 创建内存上下文 } = require('../../storage/sqlite-context.cjs'), { 创建会话仓储 } = require('../../storage/sqlite-chat.cjs'), { 创建记忆仓储 } = require('../../storage/sqlite-memory.cjs')
const ctx = 创建内存上下文({ 用途: 'synthetic-sqlite-repository' }), 时间 = '2026-10-25T00:00:00.000Z'
try {
  const chat = 创建会话仓储(ctx), mem = 创建记忆仓储(ctx)
  chat.登记对话('audit', { 建于: 时间, 写长期记忆: true })
  const 消息 = chat.存对话一轮({ 对话: 'audit', 轮次: 'turn-a', 用户正文: '我喜欢雨后的散步', 回复正文: '好呀。', 接收于: 时间, 完成于: 时间 }).消息编号[0]
  const 临时 = mem.新增临时({ 操作编号: 'create', 时间, 预期版本: 0, 类别: '候选偏好', 内容: '你喜欢雨后的散步', 来源消息编号: 消息, 依据原文: '喜欢雨后的散步' })
  assert.equal(临时.好, true)
  const 晋升 = mem.评估并晋升({ 操作编号: 'promote', 时间, 预期版本: 1, 编号: 临时.临时编号, 消息编号: [消息] })
  assert.equal(晋升.分数, 60); assert.equal(晋升.晋升, true); assert.equal(mem.核验().好, true)
  process.stdout.write('SQLITE_MEMORY_AUDIT_OK\n')
} finally { ctx.关闭(); Module._load = 原 }
