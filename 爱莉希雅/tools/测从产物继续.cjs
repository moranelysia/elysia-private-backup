/** 从历史产物继续：检查路径复核和只恢复草稿的安全链路。 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const 根 = path.resolve(__dirname, '..')
const 主进程 = fs.readFileSync(path.join(根, 'main.js'), 'utf8')
const 预载 = fs.readFileSync(path.join(根, 'preload.js'), 'utf8')
const 前端 = fs.readFileSync(path.join(根, 'renderer', 'chat.js'), 'utf8')
const 样式 = fs.readFileSync(path.join(根, 'renderer', 'style.css'), 'utf8')

let 总数 = 0
let 通过 = 0
function 检查(说明, 条件) {
  总数++
  if (!条件) throw new Error('✗ ' + 说明)
  通过++
  console.log('✓ ' + 说明)
}

function 函数片段(名字) {
  const 开始 = 前端.indexOf('function ' + 名字)
  const 下一个 = 前端.indexOf('\nfunction ', 开始 + 10)
  return 前端.slice(开始, 下一个 > 开始 ? 下一个 : 开始 + 4000)
}

const 继续函数 = 函数片段('继续准备工作产物')
const 草稿函数 = 函数片段('把工作草稿放进输入框')
const ipc开始 = 主进程.indexOf("ipcMain.handle('核对工作产物'")
const ipc结束 = 主进程.indexOf("ipcMain.handle('问工作索引'", ipc开始)
const ipc片段 = 主进程.slice(ipc开始, ipc结束)

检查('主进程提供历史产物复核入口', ipc开始 >= 0 && ipc结束 > ipc开始)
检查('输入最多接受 20 条并截短路径', ipc片段.includes('.slice(0, 20)') && ipc片段.includes('.slice(0, 1000)'))
检查('每个路径重新经过路径安全核对', ipc片段.includes('准备文件权限()') && ipc片段.includes('产物.核对文件(路径)'))
检查('失效路径不会回给网页', ipc片段.includes('失效数++') && ipc片段.includes('continue'))
检查('有效路径去重', ipc片段.includes('见过.has') && ipc片段.includes('见过.add'))
检查('复核只返回路径和名字', ipc片段.includes('有效.push({ 路径: 果.路径, 名字: path.basename(果.路径) })'))
检查('预载层同样限制数量和长度', 预载.includes('核对工作产物:') && 预载.includes("'核对工作产物'"))
检查('有产物的记录显示继续入口', 前端.includes("继续按钮.textContent = '继续处理这些产物…'"))
检查('点击后先调用主进程复核', 继续函数.includes('window.爱莉.核对工作产物(历史路径)'))
检查('草稿只使用主进程确认的可用路径', 继续函数.includes('...可用.map((产物) =>') && !继续函数.includes('...历史路径.map'))
检查('没有可用产物时弹出明确提示并停止', 继续函数.includes('window.alert(说明)') && 继续函数.includes('输入框没有改变') && 继续函数.includes('return'))
检查('部分失效时告诉用户数量', 继续函数.includes('果.失效数') && 继续函数.includes('个已失效'))
检查('继续草稿保留原目标并等待补要求', 继续函数.includes("'原目标：'") && 继续函数.includes("'接下来请：'"))
检查('不会自动发送或调用模型', !继续函数.includes('说一句(') && !继续函数.includes('window.爱莉.说话'))
检查('已有草稿仍需确认后替换', 草稿函数.includes('window.confirm'))
检查('继续按钮有独立样式', 样式.includes('.工作索引继续'))

console.log(`\n从产物继续：${通过}/${总数} 通过`)
