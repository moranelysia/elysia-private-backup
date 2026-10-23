/** 账本窗口尺寸约束：纯静态测试，不启动 Electron、不读写用户数据。 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const 根 = path.join(__dirname, '..')
const 主 = fs.readFileSync(path.join(根, 'main.js'), 'utf8')
const 试看 = fs.readFileSync(path.join(根, 'tools', '看账本.cjs'), 'utf8')
const { 创建账本跟随调度 } = require(path.join(根, 'main', '账本跟随.cjs'))

let 总数 = 0
let 通过 = 0
function 检查(名字, 条件) {
  总数++
  if (条件) { 通过++; console.log('  ✓ ' + 名字) }
  else console.log('  ✗ ' + 名字)
}

检查('固定尺寸集中定义为 208×236', 主.includes('账本固定尺寸 = Object.freeze({ 宽: 208, 高: 236 })'))
检查('宽度上下限锁死', 主.includes('minWidth: 账本固定尺寸.宽') && 主.includes('maxWidth: 账本固定尺寸.宽'))
检查('高度上下限锁死', 主.includes('minHeight: 账本固定尺寸.高') && 主.includes('maxHeight: 账本固定尺寸.高'))
检查('禁止手动缩放', 主.includes('resizable: false'))
检查('禁止最大化', 主.includes('maximizable: false'))
检查('禁止全屏', 主.includes('fullscreenable: false'))
检查('不使用会阻断程序修复的 will-resize', !主.includes("账本窗.on('will-resize'"))
检查('异常 resize 后会重新扶正', 主.includes("账本窗.on('resize', () => setImmediate(扶正账本尺寸))"))
检查('显示前会自动扶正', /if \(目标\) \{\s*扶正账本尺寸\(\)/.test(主))
检查('跟随定位原子设置位置和固定尺寸', /function 设置账本边界\([\s\S]+?setBounds\(\{[\s\S]+?width: 账本固定尺寸\.宽,[\s\S]+?height: 账本固定尺寸\.高/.test(主))
检查('摆放不再分开调用 setPosition', !主.includes('账本窗.setPosition('))
检查('连续 move 事件使用无固定延迟的调度器', 主.includes('创建账本跟随调度') && !主.includes('账本跟随计时器'))
检查('跟随不再硬等 60ms', !/账本跟着挪[\s\S]{0,500}setTimeout\([\s\S]{0,200}, 60\)/.test(主))
检查('主窗口关闭时取消未执行跟随', 主.includes("窗口.once('closed', 账本跟着挪.取消)"))
检查('试看窗口也使用相同限制', 试看.includes('maximizable: false') && 试看.includes('maxHeight: 236'))

const 队列 = []
let 执行次数 = 0
const 跟随 = 创建账本跟随调度({
  更新: () => { 执行次数++ },
  排队: (任务) => {
    const 句柄 = { 任务, 已取消: false }
    队列.push(句柄)
    return 句柄
  },
  取消排队: (句柄) => { 句柄.已取消 = true },
})
for (let i = 0; i < 20; i++) 跟随()
检查('同一轮二十次 move 只排一次 setBounds', 队列.length === 1)
队列[0].任务()
检查('第一轮立即执行一次跟随', 执行次数 === 1)
跟随()
检查('上一轮完成后下一次 move 可立刻排队', 队列.length === 2)
队列[1].任务()
检查('连续事件循环会连续更新而非等到拖动停止', 执行次数 === 2)
跟随()
跟随.取消()
if (!队列[2].已取消) 队列[2].任务()
检查('窗口关闭会取消待执行更新', 执行次数 === 2 && 队列[2].已取消)

console.log(`\n  ${通过} / ${总数} ${通过 === 总数 ? '✓' : '✗'}`)
if (通过 !== 总数) process.exitCode = 1
