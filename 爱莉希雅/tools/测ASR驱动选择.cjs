/** 默认轻量驱动与旧模型回退选择；不加载任何真实模型。 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const 根 = path.resolve(__dirname, '..')

let 总数 = 0
let 通过 = 0
function 检查(说明, 条件) {
  总数++
  if (!条件) throw new Error('✗ ' + 说明)
  通过++
  console.log('✓ ' + 说明)
}

const 默认 = require(path.join(根, '脑', '本机ASR.cjs'))
检查('默认选择 SenseVoice', 默认.id === 'sensevoice-local' && 默认.selected === 'sensevoice-local')
检查('旧 Paraformer 仍作为回退保留', 默认.fallback && 默认.fallback.id === 'paraformer-legacy')
检查('正式 SenseVoice 资源完整', 默认.可用() && Object.values(默认.paths).every((文件, i) => i === 0 || fs.existsSync(文件)))

const 程序 = `console.log(require(${JSON.stringify(path.join(根, '脑', '本机ASR.cjs'))}).id)`
const 回退 = spawnSync(process.execPath, ['-e', 程序], {
  encoding: 'utf8',
  env: { ...process.env, ELYSIA_ASR_PROVIDER: 'paraformer' },
})
检查('环境配置可显式切回旧模型', 回退.status === 0 && 回退.stdout.trim() === 'paraformer-legacy')

const worker = fs.readFileSync(path.join(根, '脑', 'SenseVoiceASR.cjs'), 'utf8')
检查('工作进程隐藏且 Electron 下改用系统 Node', worker.includes('windowsHide: true') && worker.includes('process.versions.electron') && worker.includes("'node.exe'"))
检查('空闲一分钟会释放模型', worker.includes('const 空闲退出毫秒 = 60 * 1000'))
检查('录音缓存成功或失败都会删除', worker.includes('fs.unlinkSync(文件)'))

console.log(`\nASR 驱动选择：${通过}/${总数} 通过`)
