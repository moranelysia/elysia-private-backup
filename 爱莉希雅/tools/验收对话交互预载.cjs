'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { contextBridge } = require('electron')

const 项目根 = path.resolve(__dirname, '..')
const 源码 = fs.readFileSync(path.join(项目根, 'renderer', 'chat.js'), 'utf8')
const 名字们 = [...源码.matchAll(/window\.爱莉\.([\u4e00-\u9fffA-Za-z0-9_]+)/g)].map((一) => 一[1])
const 状态 = { 模型请求次数: 0, 新对话参数: [], 全部关掉次数: 0, 收起次数: 0 }
const 接口 = {}

for (const 名 of new Set(名字们)) {
  接口[名] = (...参数) => {
    if (typeof 参数[0] === 'function') return undefined
    return Promise.resolve({ 好: true, 列表: [], 总数: 0, 模式: 'chat', 写长期记忆: true, 临时: false })
  }
}

接口.问模式和目录 = () => Promise.resolve({ 模式: 'chat', 工作区: null, 写长期记忆: true, 临时: false })
接口.问对话们 = () => Promise.resolve({ 现在: '', 列表: [] })
接口.要状态 = () => Promise.resolve({ 好: true, 记忆: { 事实: 0, 经历: 0, 小本子: 0 } })
接口.有哪些模型 = () => {
  状态.模型请求次数++
  return new Promise((完成) => setTimeout(() => 完成({
    好: true,
    名单: ['deepseek-chat', 'deepseek-flash', 'deepseek-v4-pro'],
    现在用的: 'deepseek-chat',
    说明: '',
  }), 1200))
}
接口.开新对话 = (...参数) => {
  状态.新对话参数.push(参数)
  return Promise.resolve({ 好: true, 编号: 'visual-new-chat', 模型: 参数[0] || '' })
}
接口.全部关掉 = () => { 状态.全部关掉次数++ }
接口.收起来 = () => { 状态.收起次数++ }
接口.验收状态 = () => JSON.parse(JSON.stringify(状态))

contextBridge.exposeInMainWorld('爱莉', 接口)
