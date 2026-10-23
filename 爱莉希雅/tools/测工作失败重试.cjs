/** 失败工作重试入口：静态检查 UI 契约，不调用模型、不写任何数据。 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const 根 = path.resolve(__dirname, '..')
// Git 在 Windows 工作区可能把 LF 转为 CRLF；静态契约不应被换行风格误判。
const 前端 = fs.readFileSync(path.join(根, 'renderer', 'chat.js'), 'utf8').replace(/\r\n/g, '\n')
const 样式 = fs.readFileSync(path.join(根, 'renderer', 'style.css'), 'utf8')

let 总数 = 0
let 通过 = 0
function 检查(说明, 条件) {
  总数++
  if (!条件) throw new Error('✗ ' + 说明)
  通过++
  console.log('✓ ' + 说明)
}

const 开始 = 前端.indexOf('function 重新准备工作')
const 结束 = 前端.indexOf('\n}\n', 开始) + 3
const 重试函数 = 前端.slice(开始, 结束)
const 草稿开始 = 前端.indexOf('function 把工作草稿放进输入框')
const 草稿结束 = 前端.indexOf('\n}\n', 草稿开始) + 3
const 草稿函数 = 前端.slice(草稿开始, 草稿结束)

检查('提供独立的重新准备函数', 开始 >= 0 && 结束 > 开始)
检查('只有失败和部分完成显示入口', 前端.includes("一.状态 === '失败' || 一.状态 === '部分完成'"))
检查('部分完成使用更准确的按钮文字', 前端.includes('重新准备未完成工作…'))
检查('失败任务显示重新提交入口', 前端.includes("'重新提交…'"))
检查('入口明确不会自动发送或沿用权限', 前端.includes('不会自动发送或沿用旧权限'))
检查('重新准备只取索引中的原目标', 重试函数.includes('一.目标'))
检查('输入框已有草稿时先确认', 草稿函数.includes('window.confirm'))
检查('恢复后触发输入框高度刷新', 草稿函数.includes("输入.dispatchEvent(new Event('input'))"))
检查('恢复后收起索引并聚焦输入框', 草稿函数.includes('收起工作索引抽屉()') && 草稿函数.includes('输入.focus()'))
检查('重新准备函数不会直接发送', !(草稿函数 + 重试函数).includes('说一句(') && !(草稿函数 + 重试函数).includes('window.爱莉.说话'))
检查('重新发送仍由原任务卡入口负责', 前端.includes('弹工作任务卡(文字, 带上的, 来自语音)'))
检查('重试按钮有独立样式', 样式.includes('.工作索引重试'))

console.log(`\n工作失败重试：${通过}/${总数} 通过`)
