'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { contextBridge } = require('electron')

const 项目根 = path.resolve(__dirname, '..')
const 源码 = fs.readFileSync(path.join(项目根, 'renderer', 'chat.js'), 'utf8')
const 名字们 = [...源码.matchAll(/window\.爱莉\.([\u4e00-\u9fffA-Za-z0-9_]+)/g)].map((一) => 一[1])
const 接口 = {}
for (const 名 of new Set(名字们)) {
  接口[名] = (...参数) => {
    if (typeof 参数[0] === 'function') return undefined
    return Promise.resolve({ 好: true, 列表: [], 总数: 0, 模式: 'chat', 写长期记忆: true, 临时: false })
  }
}

const 记忆 = require(path.join(项目根, '脑', '记忆.cjs'))
const 关系图 = require(path.join(项目根, '脑', '记忆关系图.cjs'))
接口.问长期记忆 = (条件 = {}) => Promise.resolve({ 好: true, ...记忆.列长期记忆(条件) })
接口.问长期记忆关系图 = (条件 = {}) => {
  const 果 = 关系图.查询(条件)
  // 只供隔离视觉验收：在内存返回值里放一条自动关系，不写真实关系文件。
  if (process.env.ELYSIA_AUTO_RELATION_FIXTURE === '1' && 果.节点.length >= 2) {
    const 从 = 果.节点[0], 到 = 果.节点[1]
    果.关系 = [{
      编号: 'visual-auto-relation', 类型: '同一主题', 从: { 类别: 从.类别, 编号: 从.编号 }, 到: { 类别: 到.类别, 编号: 到.编号 },
      从键: 从.键, 到键: 到.键, 来源: '自动整理', 创建于: '2026-10-22T08:00:00.000Z', 修改于: '2026-10-22T08:00:00.000Z',
      自动依据: { 规则版本: 'memory-relations-v1', 置信度: 0.96, 关联置信度: 0.96, 依据: '隔离视觉验收的高置信关系' },
    }]
    果.自动关系总数 = 1; 果.关系总数 = 1
  }
  return Promise.resolve(果)
}
接口.问模式和目录 = () => Promise.resolve({ 模式: 'chat', 工作区: null, 写长期记忆: true, 临时: false })
接口.问对话们 = () => Promise.resolve({ 现在: '', 列表: [] })
接口.要状态 = () => Promise.resolve({ 好: true, 记忆: { 事实: 0, 经历: 0, 小本子: 0 } })

contextBridge.exposeInMainWorld('爱莉', 接口)
