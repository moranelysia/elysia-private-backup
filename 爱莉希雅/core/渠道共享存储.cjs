/** Trusted coordinator capability: one exclusive task backend shared by its two domain adapters. */
'use strict'
const { 创建异步仓储门面 } = require('../storage/sqlite-async-facade.cjs')
const scopes = new WeakMap()
async function 创建渠道共享存储(actor, id) {
  const facade = 创建异步仓储门面(actor), map = await facade.状态.打开后端('channel-map', id); let tasks
  try { tasks = await facade.状态.打开后端('channel-tasks', id) } catch (e) { await map.关闭(); throw e }
  const token = Object.freeze({}), state = { actor, id, facade, map, tasks, claims: new Set(), closed: false }; scopes.set(token, state)
  return token
}
function 申请渠道共享存储(token, actor, id, role) {
  const s = scopes.get(token)
  if (!s || s.closed || s.actor !== actor || s.id !== id || !['receive', 'send', 'coordinator'].includes(role) || s.claims.has(role)) throw Error('CHANNEL_SHARED_SCOPE_INVALID')
  s.claims.add(role)
  let released = false
  return Object.freeze({ facade: s.facade, map: s.map, tasks: s.tasks, 释放() { if (!released) { released = true; s.claims.delete(role) } } })
}
async function 关闭渠道共享存储(token) {
  const s = scopes.get(token)
  if (!s || s.closed || s.claims.size) throw Error('CHANNEL_SHARED_SCOPE_BUSY')
  s.closed = true
  try { await s.tasks.关闭() } finally { await s.map.关闭() }
}
module.exports = { 创建渠道共享存储, 申请渠道共享存储, 关闭渠道共享存储 }
