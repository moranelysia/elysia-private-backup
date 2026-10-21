'use strict'

const fs = require('node:fs')
const path = require('node:path')
const 故障 = require('../脑/故障状态.cjs')
const 根 = path.join(__dirname, '..')
const 主 = fs.readFileSync(path.join(根, 'main.js'), 'utf8')
const 页面 = fs.readFileSync(path.join(根, 'renderer', 'index.html'), 'utf8')
const 界面 = fs.readFileSync(path.join(根, 'renderer', 'chat.js'), 'utf8')

let 总数 = 0
let 通过 = 0
function 检查(名字, 条件) {
  总数++
  if (条件) { 通过++; console.log('  ✓ ' + 名字) }
  else console.log('  ✗ ' + 名字)
}

function 错(种类, message = '测试说明') { return Object.assign(new Error(message), { 种类 }) }

检查('网络错误单独归类', 故障.从对话错误(错('网')).类别 === '网络')
检查('模型忙归到模型', 故障.从对话错误(错('忙')).标题.includes('模型服务'))
检查('API Key 错误提供设置入口', 故障.从对话错误(错('钥匙')).操作 === '打开设置')
检查('欠费给出余额提示', 故障.从对话错误(错('欠费')).标题.includes('余额'))
检查('请求错误不会冒充网络问题', 故障.从对话错误(错('请求')).类别 === '模型')
检查('本地服务有独立类别', 故障.服务('声音服务', '没开').类别 === '服务')
检查('权限拒绝有独立类别', 故障.权限('不同意').类别 === '权限')
检查('长错误会截短', 故障.干净文字('x'.repeat(300)).length === 240)
检查('错误里的 Key 会脱敏', !故障.干净文字('sk-1234567890abcdef').includes('1234567890'))
检查('主进程返回结构化对话故障', 主.includes('const 故障 = 故障状态.从对话错误(错误)') && 主.includes('说明: 故障.说明'))
检查('声音状态返回结构化服务故障', 主.includes("故障状态.服务('声音服务'"))
检查('页面有统一故障条', 页面.includes('id="故障条"') && 页面.includes('id="故障类别"'))
检查('界面能显示结构化故障', 界面.includes('function 显示故障(故障)'))
检查('权限拒绝能从工具记录识别', 界面.includes('function 权限故障(记录们)'))
检查('声音没启动时关闭自动朗读', /if \(!状态结果\.在\) \{\s*要出声 = false/.test(界面))
检查('API Key 故障按钮会打开设置', 界面.includes("当前故障.操作 === '打开设置'") && 界面.includes('开设置()'))

console.log(`\n  ${通过} / ${总数} ${通过 === 总数 ? '✓' : '✗'}`)
if (通过 !== 总数) process.exitCode = 1
