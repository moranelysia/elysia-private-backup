'use strict'
// 在新Node进程中阻断业务模块、文件API和网络依赖，仍须能完成仓储回环。
const assert = require('node:assert/strict')
const Module = require('node:module')
const 原加载 = Module._load, 依赖 = []
Module._load = function (名, 父, 主) {
  if (!['node:sqlite', 'node:crypto', '../../storage/sqlite-context.cjs', '../../storage/sqlite-chat.cjs', './sqlite-context.cjs', './sqlite-legacy-source.cjs'].includes(名)) throw new Error('SQLITE_AUDIT_UNEXPECTED_DEPENDENCY')
  依赖.push(名); return 原加载.call(this, 名, 父, 主)
}
global.fetch = () => { throw new Error('SQLITE_AUDIT_NETWORK_FORBIDDEN') }
const { 创建内存上下文 } = require('../../storage/sqlite-context.cjs')
const { 创建会话仓储 } = require('../../storage/sqlite-chat.cjs')
const 上下文 = 创建内存上下文({ 用途: 'synthetic-sqlite-repository' })
try {
  const 库 = 创建会话仓储(上下文), 时间 = '2026-10-25T00:00:00.000Z'
  assert.equal(库.登记对话('audit-chat', { 建于: 时间 }).好, true)
  assert.equal(库.存对话一轮({ 对话: 'audit-chat', 轮次: 'audit-turn', 用户正文: '虚构输入', 回复正文: '虚构回复', 接收于: 时间, 完成于: 时间 }).好, true)
  assert.equal(库.读最近聊天(2, { 对话: 'audit-chat' }).length, 2); assert.equal(库.核验().好, true)
  assert.ok(依赖.includes('node:sqlite'))
  process.stdout.write('SQLITE_CHAT_AUDIT_OK\n')
} finally { 上下文.关闭(); Module._load = 原加载 }
