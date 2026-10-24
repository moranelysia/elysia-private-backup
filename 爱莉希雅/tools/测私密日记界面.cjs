/** M-33：私密日记本机显式查看/删除。全程只用隔离临时目录。 */
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  创建私密日记生成器,
  创建私密日记库,
} = require('../脑/私密日记.cjs')

const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-private-ui-'))
const 数据目录 = path.join(根, '数据')
const 日期 = new Date(2026, 9, 14, 12)
let 总数 = 0
let 通过 = 0

function 检查(说明, 条件) {
  总数++
  if (!条件) throw new Error('✗ ' + 说明)
  通过++
  console.log('✓ ' + 说明)
}
function 源码(相对) { return fs.readFileSync(path.join(__dirname, '..', 相对), 'utf8') }
function 文件们(目录) {
  if (!fs.existsSync(目录)) return []
  return fs.readdirSync(目录, { withFileTypes: true }).flatMap((项) => {
    const 完整 = path.join(目录, 项.name)
    return 项.isDirectory() ? 文件们(完整) : [完整]
  })
}
function 来源() {
  return [
    { 编号: '聊天:1', 类型: '聊天', 时间: '2026-10-14 20:00', 标题: '那天', 摘要: '他说最近有一点难。' },
    { 编号: '聊天:2', 类型: '聊天', 时间: '2026-10-14 20:01', 标题: '没说出口', 摘要: '她只是把声音放轻。' },
  ]
}
function 结果() {
  return {
    触发: true,
    标题: '没有说出口的话',
    微妙情绪: '想再靠近一点，又怕显得太用力',
    正文: '他说起那一点难处时，我想再靠近一点，又怕显得太用力。最后只是把声音放轻了一些。',
    来源: ['聊天:1', '聊天:2'],
  }
}

async function main() {
  const 生成器 = 创建私密日记生成器({
    数据目录, 允许隔离写入: true, 现在: () => new Date(2026, 9, 15, 9),
    取来源: async () => 来源(), 生成: async () => 结果(),
  })
  const 写入 = await 生成器.整理一天({ 日期 })
  检查('隔离夹具生成成功', 写入.好 && 写入.写入)

  const 普通文件 = path.join(数据目录, '日记', '日', '2026', '2026-10-14.json')
  fs.mkdirSync(path.dirname(普通文件), { recursive: true })
  fs.writeFileSync(普通文件, '{"普通":true}', 'utf8')
  const 库 = 创建私密日记库({ 数据目录 })
  const 第一次 = 库.给本机界面()
  检查('本机界面只列出独立私密目录的一篇日记', 第一次.总数 === 1 && 第一次.列表[0].编号 === '私密日:2026-10-14')
  检查('界面投影不暴露路径、可见性或内部删除元数据', !('文件' in 第一次.列表[0]) && !('可见性' in 第一次.列表[0]) && !('删除于' in 第一次.列表[0]))
  检查('界面投影保留可核对的正文和来源链', 第一次.列表[0].模块[0].正文.includes('靠近') && 第一次.列表[0].来源.length === 2)
  检查('私密搜索只匹配私密投影内容', 库.给本机界面({ 搜索: '声音放轻' }).总数 === 1 && 库.给本机界面({ 搜索: '不存在' }).总数 === 0)
  const 读前 = fs.statSync(生成器.日记路径('2026-10-14')).mtimeMs
  库.给本机界面()
  检查('查看私密日记不会改写文件', fs.statSync(生成器.日记路径('2026-10-14')).mtimeMs === 读前)

  const 坏文件 = path.join(数据目录, '日记', '私密', '2026', '2026-10-13.json')
  fs.writeFileSync(坏文件, '{坏', 'utf8')
  const 带坏文件 = 库.给本机界面()
  检查('单篇坏文件不会拖垮列表且会被计数', 带坏文件.总数 === 1 && 带坏文件.跳过 === 1)
  let 冲突 = false
  try { 库.删除日记({ 编号: '私密日:2026-10-14', 版本标记: '旧版本' }) } catch (错误) { 冲突 = 错误.message.includes('发生过变化') }
  检查('删除前校验版本冲突', 冲突 && fs.existsSync(生成器.日记路径('2026-10-14')))

  const 删除 = 库.删除日记({ 编号: '私密日:2026-10-14', 版本标记: 第一次.列表[0].版本标记 })
  const 墓碑文件 = path.join(数据目录, '日记', '私密', '已删除.json')
  const 墓碑 = JSON.parse(fs.readFileSync(墓碑文件, 'utf8'))
  检查('确认删除移除正文并只留下周期墓碑', 删除.好 && !fs.existsSync(生成器.日记路径('2026-10-14')) && JSON.stringify(墓碑) === JSON.stringify({ 格式版本: 1, 周期: ['2026-10-14'] }))
  检查('私密删除不触碰普通日记', fs.readFileSync(普通文件, 'utf8') === '{"普通":true}')
  let 再生成次数 = 0
  const 再生成器 = 创建私密日记生成器({
    数据目录, 允许隔离写入: true, 现在: () => new Date(2026, 9, 15, 9),
    取来源: async () => 来源(), 生成: async () => { 再生成次数++; return 结果() },
  })
  const 再生成 = await 再生成器.整理一天({ 日期 })
  检查('删除墓碑阻止同一周期重新生成且不调用模型', 再生成.状态 === '已删除' && 再生成次数 === 0)
  检查('删除记录不含标题、正文或来源摘要', !JSON.stringify(墓碑).includes('靠近') && !JSON.stringify(墓碑).includes('聊天:'))

  const 坏墓碑目录 = path.join(根, '坏墓碑')
  fs.mkdirSync(path.join(坏墓碑目录, '日记', '私密'), { recursive: true })
  fs.writeFileSync(path.join(坏墓碑目录, '日记', '私密', '已删除.json'), '{坏', 'utf8')
  let 失败关闭 = false
  try {
    await 创建私密日记生成器({ 数据目录: 坏墓碑目录, 允许隔离写入: true, 现在: () => new Date(2026, 9, 15), 取来源: async () => 来源(), 生成: async () => 结果() }).整理一天({ 日期 })
  } catch (错误) { 失败关闭 = 错误.message.includes('已停止操作') }
  检查('删除记录损坏时失败关闭而不覆盖', 失败关闭 && fs.readFileSync(path.join(坏墓碑目录, '日记', '私密', '已删除.json'), 'utf8') === '{坏')

  const 主 = 源码('main.js'), 预载 = 源码('preload.js'), 页面 = 源码(path.join('renderer', 'index.html'))
  const 脚本 = 源码(path.join('renderer', 'chat.js')), 样式 = 源码(path.join('renderer', 'style.css'))
  检查('主进程私密读取必须先显式打开并会在关闭窗口时重锁', 主.includes("ipcMain.handle('打开私密记忆日记'") && 主.includes('if (!私密日记已打开)') && 主.includes('私密日记已打开 = false'))
  检查('删除 IPC 要求界面二次确认', 主.includes("ipcMain.handle('删除私密记忆日记'") && 主.includes('值.已确认 !== true'))
  检查('预载只暴露打开关闭查询删除且没有私密导出编辑通道', ['打开私密记忆日记', '关闭私密记忆日记', '问私密记忆日记', '删除私密记忆日记'].every((一) => 预载.includes(一)) && !预载.includes('导出私密') && !预载.includes('修改私密'))
  检查('日记页面默认停在普通日记并有独立私密入口', 页面.includes('data-日记视图="普通"') && 页面.includes('data-日记视图="私密"') && /class="选中" data-日记视图="普通"/.test(页面))
  检查('私密入口说明本机边界且关闭记忆库会重新上锁', 脚本.includes('只在本机这次打开期间显示') && 脚本.includes('锁上私密日记()') && 脚本.includes('不进入聊天、导出或分享'))
  检查('私密卡片只有删除动作且使用统一液态玻璃样式', 脚本.includes("卡.className = '记忆卡 日记卡 私密日记卡'") && 样式.includes('.私密日记卡') && 样式.includes('.关系图确认操作 .主要'))
  检查('没有原子写入或删除临时残留', 文件们(数据目录).every((一) => !path.basename(一).includes('.tmp-') && !path.basename(一).includes('.delete-')))

  console.log(`\n私密日记本机界面：${通过}/${总数} 通过`)
}

main().catch((错误) => { console.error(错误.stack || 错误.message); process.exitCode = 1 }).finally(() => {
  try { fs.rmSync(根, { recursive: true, force: true }) } catch { /* 测试结果更重要 */ }
})
