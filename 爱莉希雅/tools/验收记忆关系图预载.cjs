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
接口.问长期记忆关系图 = (条件 = {}) => Promise.resolve(关系图.查询(条件))
接口.问模式和目录 = () => Promise.resolve({ 模式: 'chat', 工作区: null, 写长期记忆: true, 临时: false })
接口.问对话们 = () => Promise.resolve({ 现在: '', 列表: [] })
接口.要状态 = () => Promise.resolve({ 好: true, 记忆: { 事实: 0, 经历: 0, 小本子: 0 } })

contextBridge.exposeInMainWorld('爱莉', 接口)
