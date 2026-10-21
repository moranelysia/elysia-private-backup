/** 手动声音入口：离线测试，不启动真实 GPT-SoVITS。 */
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { EventEmitter } = require('node:events')
const { 创建声音启动器 } = require('../main/voice-launcher.cjs')

let 总数 = 0
let 通过 = 0
function 检查(说明, 条件) {
  总数++
  if (!条件) throw new Error('✗ ' + 说明)
  通过++
  console.log('✓ ' + 说明)
}

const 临时 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-voice-launcher-'))
const 工作区根 = path.join(临时, 'work')
const 声音目录 = path.join(临时, 'gpt-sovits')
const voice目录 = path.join(工作区根, 'tools', 'voice')
const runtime = path.join(声音目录, 'runtime')
fs.mkdirSync(voice目录, { recursive: true })
fs.mkdirSync(runtime, { recursive: true })
for (const 文件 of [
  path.join(voice目录, 'run-logged.cjs'),
  path.join(voice目录, 'tts-bridge.cjs'),
  path.join(runtime, 'python.exe'),
  path.join(runtime, 'ffmpeg.exe'),
]) fs.writeFileSync(文件, '', 'utf8')
const 配置文件 = path.join(voice目录, 'voice.json')
fs.writeFileSync(配置文件, JSON.stringify({ ffmpeg: path.join(runtime, 'ffmpeg.exe') }), 'utf8')

async function 主() {
  const 启动记录 = []
  let 时刻 = 1000
  const 假启动 = (命令, 参数, 选项) => {
    const 子 = new EventEmitter()
    子.unref = () => { 子.已放手 = true }
    启动记录.push({ 命令, 参数, 选项, 子 })
    return 子
  }
  const 启动器 = 创建声音启动器({
    工作区根,
    配置文件,
    状态: async () => ({ 在: false }),
    启动进程: 假启动,
    现在: () => 时刻,
    保护毫秒: 5000,
  })

  const 第一次 = await 启动器.启动()
  检查('离线时会启动本体与转接层', 第一次.成功 && 第一次.正在加载 && 启动记录.length === 2)
  检查('不再调用会显示终端的 cmd 启动脚本', 启动记录.every((x) => !/cmd(?:\.exe)?$/i.test(x.命令)))
  检查('没有 cmd /k 参数', 启动记录.every((x) => !x.参数.some((p) => String(p).toLowerCase() === '/k')))
  检查('两个后台进程都隐藏', 启动记录.every((x) => x.选项.windowsHide === true && x.选项.stdio === 'ignore'))
  检查('两个后台进程都与主窗口脱离', 启动记录.every((x) => x.选项.detached === true && x.子.已放手))
  检查('Electron 以 Node 模式运行看门狗', 启动记录.every((x) => x.选项.env.ELECTRON_RUN_AS_NODE === '1'))
  检查('本体使用配置推导出的 python', 启动记录[0].参数.includes(path.join(runtime, 'python.exe')))
  检查('转接层使用固定项目文件', 启动记录[1].参数.includes(path.join(voice目录, 'tts-bridge.cjs')))

  时刻 = 2000
  const 第二次 = await 启动器.启动()
  检查('加载保护期内不会重复启动', 第二次.正在加载 && 启动记录.length === 2)

  let 不该启动 = 0
  const 已在线 = 创建声音启动器({
    工作区根,
    配置文件,
    状态: async () => ({ 在: true }),
    启动进程: () => { 不该启动++; throw new Error('不该走到这里') },
  })
  const 第三次 = await 已在线.启动()
  检查('已经在线时不重复启动', 第三次.已就绪 && 不该启动 === 0)

  const 根 = path.resolve(__dirname, '..')
  const main = fs.readFileSync(path.join(根, 'main.js'), 'utf8')
  const preload = fs.readFileSync(path.join(根, 'preload.js'), 'utf8')
  const html = fs.readFileSync(path.join(根, 'renderer', 'index.html'), 'utf8')
  const chat = fs.readFileSync(path.join(根, 'renderer', 'chat.js'), 'utf8')
  const css = fs.readFileSync(path.join(根, 'renderer', 'style.css'), 'utf8')
  检查('主进程注册手动启动入口', main.includes("ipcMain.handle('启动声音服务'"))
  检查('预载层只暴露无参数启动', preload.includes("启动声音服务: () => ipcRenderer.invoke('启动声音服务')"))
  检查('主界面有声音弹窗', html.includes('id="声音提示"'))
  检查('弹窗会自动关闭', chat.includes("setTimeout(() => 声音提示.classList.add('收着'), 4200)"))
  检查('加载完成有单独成功提示', chat.includes("弹声音提示('声音准备好了"))
  检查('弹窗样式醒目但不挡操作', css.includes('.声音提示') && css.includes('pointer-events: none'))

  console.log(`\n手动声音入口：${通过}/${总数} 通过`)
}

主()
  .catch((错误) => { console.error(错误.stack || 错误); process.exitCode = 1 })
  .finally(() => fs.rmSync(临时, { recursive: true, force: true }))
