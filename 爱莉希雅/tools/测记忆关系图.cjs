/** 长期记忆关系图：隔离数据层、候选只读、关系 CRUD 与布局持久化。 */
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const 项目根 = path.resolve(__dirname, '..')
const 临时根 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-memory-graph-'))
process.env.ELYSIA_DATA_DIR = path.join(临时根, '记忆')
process.env.ELYSIA_CACHE_DIR = path.join(临时根, '缓存')

let 总数 = 0, 通过 = 0
function 检查(说明, 条件) {
  总数++
  if (!条件) throw new Error('✗ ' + 说明)
  通过++
  console.log('✓ ' + 说明)
}

async function main() {
  const 记忆 = require(path.join(项目根, '脑', '记忆.cjs'))
  const 模块 = require(path.join(项目根, '脑', '记忆关系图.cjs'))
  const 事实一 = 记忆.记一条('事实', '2026年10月22日他开始整理记忆关系图', '她')
  const 事实二 = 记忆.记一条('事实', '后来继续整理记忆关系图并改进交互', '她')
  const 经历 = 记忆.记一条('经历', '一起完成了记忆关系图测试', '她')
  let 序号 = 0
  const 图 = 模块.创建关系图库({
    关系文件: path.join(临时根, '记忆', '关系图.json'),
    布局文件: path.join(临时根, '缓存', '关系图布局.json'),
    长期记忆库: 记忆,
    现在: () => new Date('2026-10-22T08:00:00.000Z'),
    造编号: () => `r-${++序号}`,
  })

  const 初次 = 图.查询()
  检查('每条长期记忆成为独立节点', 初次.好 && 初次.节点.length === 3 && new Set(初次.节点.map((一) => 一.键)).size === 3)
  检查('首次只读不会创建关系或布局文件', !fs.existsSync(图.关系文件) && !fs.existsSync(图.布局文件))
  检查('节点带类别、内容和事件时间', 初次.节点.every((一) => 一.类别 && 一.内容 && 一.事件时间))
  检查('自动候选只展示而不写入正式关系', Array.isArray(初次.候选关系) && 初次.关系.length === 0 && !fs.existsSync(图.关系文件))

  const 新增 = 图.新增({ 类型: '后续发展', 从: 事实一, 到: 事实二 })
  检查('人工关系可以新增并原子落盘', 新增.好 && 新增.关系.编号 === 'r-1' && fs.existsSync(图.关系文件))
  检查('关系文件只保存端点和关系、不复制记忆正文', !fs.readFileSync(图.关系文件, 'utf8').includes('整理记忆关系图'))
  检查('重复关系幂等不产生第二条', 图.新增({ 类型: '后续发展', 从: 事实一, 到: 事实二 }).没变化 && 图.查询().关系.length === 1)
  检查('无向关系反向添加会去重', 图.新增({ 类型: '同一主题', 从: 事实一, 到: 事实二 }).好 && 图.新增({ 类型: '同一主题', 从: 事实二, 到: 事实一 }).没变化 && 图.查询().关系.length === 2)
  检查('拒绝自连接和非法关系类型', !图.新增({ 类型: '同一主题', 从: 事实一, 到: 事实一 }).好 && !图.新增({ 类型: '因为', 从: 事实一, 到: 经历 }).好)
  检查('拒绝连接不存在的记忆', !图.新增({ 类型: '更新', 从: 事实一, 到: { 类别: '事实', 编号: 'missing' } }).好)

  const 修改 = 图.修改({ 编号: 新增.关系.编号, 类型: '更新' })
  检查('人工关系类型可以修改', 修改.好 && 图.查询().关系.find((一) => 一.编号 === 新增.关系.编号).类型 === '更新')
  检查('分类筛选只返回该类节点及完整可见连线', 图.查询({ 类别: '经历' }).节点.length === 1 &&图.查询({ 类别: '经历' }).关系.length === 0)
  检查('搜索只返回匹配卡片', 图.查询({ 搜索: '完成了' }).节点.length === 1 && 图.查询({ 搜索: '完成了' }).节点[0].类别 === '经历')

  const 坐标 = { [初次.节点[0].键]: { x: 123.4, y: 456.7 }, '事实:不存在': { x: 9, y: 9 } }
  const 存布局 = 图.保存布局({ 节点: 坐标, 视图: { x: -80, y: 20, 缩放: 1.25 } })
  const 布局 = 图.查询().布局
  检查('拖动位置和视图单独写入缓存', 存布局.好 && fs.existsSync(图.布局文件) && !fs.readFileSync(图.关系文件, 'utf8').includes('123.4'))
  检查('布局只接受仍存在的节点并限制缩放', Object.keys(布局.节点).length === 1 && 布局.视图.缩放 === 1.25)

  检查('关系可以删除', 图.删除(新增.关系.编号).好 && !图.查询().关系.some((一) => 一.编号 === 新增.关系.编号))
  记忆.删一条('事实', 事实二.编号)
  const 孤儿 = 图.查询()
  检查('记忆被删除后失效关系不会误连到别的卡片', 孤儿.失效关系数 === 1 && 孤儿.关系.length === 0)

  const main = fs.readFileSync(path.join(项目根, 'main.js'), 'utf8')
  const preload = fs.readFileSync(path.join(项目根, 'preload.js'), 'utf8')
  const html = fs.readFileSync(path.join(项目根, 'renderer', 'index.html'), 'utf8')
  const js = fs.readFileSync(path.join(项目根, 'renderer', 'chat.js'), 'utf8')
  const css = fs.readFileSync(path.join(项目根, 'renderer', 'style.css'), 'utf8')
  检查('主进程提供查询、新增、修改、删除与布局接口', ['问长期记忆关系图', '新增长期记忆关系', '修改长期记忆关系', '删除长期记忆关系', '保存长期记忆图布局'].every((名) => main.includes(`ipcMain.handle('${名}'`)))
  检查('预载层裁剪图谱写入字段', preload.includes('问长期记忆关系图:') && preload.includes('新增长期记忆关系:') && preload.includes('保存长期记忆图布局:'))
  检查('长期记忆内有列表与关系图切换', html.includes('data-长期视图="列表"') && html.includes('data-长期视图="关系图"'))
  检查('图谱支持拖动、缩放、建立和编辑连线', js.includes('画长期记忆关系图') && js.includes("addEventListener('wheel'") && js.includes('保存关系图布局') && js.includes('建立连接'))
  检查('候选关系必须人工采纳', js.includes('采纳建议') && js.includes('候选关系'))
  检查('图谱使用卡片和 SVG 连线并有窄窗口布局', css.includes('.关系图卡片') && css.includes('.关系图连线') && css.includes('.记忆管理面板.图谱模式'))

  console.log(`\n记忆关系图：${通过}/${总数} 通过`)
}

main()
  .catch((错误) => { console.error(错误.stack || 错误.message); process.exitCode = 1 })
  .finally(() => { try { fs.rmSync(临时根, { recursive: true, force: true }) } catch { /* 测试结果更重要 */ } })
