/** 录音编码与 IPC/UI 接线检查；不申请真实麦克风。 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const 根 = path.resolve(__dirname, '..')
const { 编码WAV, 创建断句器, 录音约束 } = require(path.join(根, 'renderer', '语音输入.js'))

let 总数 = 0
let 通过 = 0
function 检查(说明, 条件) {
  总数++
  if (!条件) throw new Error('✗ ' + 说明)
  通过++
  console.log('✓ ' + 说明)
}

const 样本 = new Float32Array(4800)
for (let i = 0; i < 样本.length; i++) 样本[i] = Math.sin(2 * Math.PI * 440 * i / 48000)
const WAV = 编码WAV([样本.subarray(0, 2000), 样本.subarray(2000)], 48000, 16000)
const 视图 = new DataView(WAV)
const 字 = (位置, 长度) => String.fromCharCode(...new Uint8Array(WAV, 位置, 长度))
检查('输出标准 RIFF/WAVE', 字(0, 4) === 'RIFF' && 字(8, 4) === 'WAVE')
检查('输出 PCM 单声道 16bit', 视图.getUint16(20, true) === 1 && 视图.getUint16(22, true) === 1 && 视图.getUint16(34, true) === 16)
检查('重采样到 16kHz', 视图.getUint32(24, true) === 16000)
检查('0.1 秒音频大小正确', WAV.byteLength === 44 + 1600 * 2)

const 断句 = 创建断句器()
for (let i = 0; i < 5; i++) 断句.喂(0.002, 100)
let 开始信号 = ''
for (let i = 0; i < 3; i++) 开始信号 = 断句.喂(0.08, 100) || 开始信号
let 断句信号 = ''
for (let i = 0; i < 9; i++) 断句信号 = 断句.喂(0.001, 100) || 断句信号
检查('连续人声后才确认开口', 开始信号 === '开始' && 断句.已开口)
检查('开口后静音 0.85 秒自动断句', 断句信号 === '断句')
const 空等 = 创建断句器()
let 空等信号 = ''
for (let i = 0; i < 200; i++) 空等信号 = 空等.喂(0.002, 100) || 空等信号
检查('二十秒没人说话时轮换录音缓存', 空等信号 === '空等' && !空等.已开口)
检查('默认录音使用系统默认设备', !录音约束('').audio.deviceId && 录音约束('').video === false)
检查('指定麦克风使用精确设备编号', 录音约束('mic-123').audio.deviceId.exact === 'mic-123')

const main = fs.readFileSync(path.join(根, 'main.js'), 'utf8')
const preload = fs.readFileSync(path.join(根, 'preload.js'), 'utf8')
const html = fs.readFileSync(path.join(根, 'renderer', 'index.html'), 'utf8')
const chat = fs.readFileSync(path.join(根, 'renderer', 'chat.js'), 'utf8')
const dialog = fs.readFileSync(path.join(根, '脑', '对话.cjs'), 'utf8')
const css = fs.readFileSync(path.join(根, 'renderer', 'style.css'), 'utf8')
检查('主进程只通过 ASR 适配器识别', main.includes("require(path.join(脑, 'ASR.cjs')).默认ASR") && main.includes("ipcMain.handle('识别语音'"))
检查('预载层只暴露固定 WAV 入口', preload.includes("识别语音: (字节) => ipcRenderer.invoke('识别语音', { 类型: 'audio/wav', 字节 })"))
检查('界面有按住说话按钮和持续提示', html.includes('id="麦克风"') && html.includes('id="录音状态"'))
检查('设置界面可选择和刷新麦克风', html.includes('id="麦克风设备"') && html.includes('id="刷新麦克风"'))
检查('麦克风偏好由主进程校验并保存', main.includes("ipcMain.handle('语音输入设置'") && main.includes("ipcMain.handle('保存麦克风设备'") && preload.includes('保存麦克风设备:'))
检查('录音使用保存的设备编号', chat.includes('deviceId: 麦克风设备编号'))
检查('设备失效时明确引导重新选择', chat.includes('选中的麦克风不在了') && chat.includes('上次选择的麦克风（当前未找到）'))
检查('识别结果只填输入框不自动发送', chat.includes('输入.value = 原文 +') && chat.includes('确认文字后再发送'))
检查('通话入口默认关闭且状态可访问', html.includes('id="通话开关"') && html.includes('aria-pressed="false"') && chat.includes('let 通话模式 = false'))
检查('通话模式识别后直接发送', chat.includes('if (通话模式) {') && chat.includes('正在发送…') && chat.includes('await 说一句()'))
检查('普通按住说话仍保留人工确认', chat.includes('确认文字后再发送'))
检查('通话时不会抢在她回复或朗读中录音', chat.includes('她正在说 || 流式朗读.忙吗()') && chat.includes('等她说完这一句'))
检查('通话按钮有明确开启状态', css.includes('.通话开关.开着') && chat.includes("setAttribute('aria-pressed', String(通话模式))"))
检查('通话开启后自动进入免提监听', chat.includes('安排通话监听(150)') && chat.includes('开始语音输入(null, { 免提: true })'))
检查('本地音量断句后自动识别', chat.includes("信号 === '断句'") && chat.includes("{ 免提: true }") && chat.includes('停顿约 1 秒后自动发送'))
检查('播放结束后自动恢复监听', chat.includes("阶段 === '空闲' && !她正在说") && chat.includes('安排通话监听(250)'))
检查('窗口失焦暂停、回到窗口恢复', chat.includes('通话已暂停，回到窗口后继续') && chat.includes("window.addEventListener('focus'"))
检查('关闭通话会立即停止当前录音', chat.includes("取消语音输入('通话模式已关闭')"))
检查('语音草稿随发送请求带上来源标记', chat.includes('输入含语音草稿 = true') && chat.includes('{ 已确认工作, 来自语音 }') && preload.includes('来自语音: !!选项.来自语音'))
检查('主进程固定裁剪并转交语音来源', main.includes('const 来自语音 = !是字符串') && main.includes('来自语音,'))
检查('只有语音消息才附加大模型听写提示', dialog.includes("if (选项.来自语音) 消息们.push({ role: 'system', content: ASR专名.拼给模型() })"))
检查('录音最长 45 秒', chat.includes('}, 45000)'))
检查('Esc 和窗口失焦会取消录音', chat.includes("if (语音输入状态 !== '空闲')") && chat.includes("window.addEventListener('blur'"))
检查('摄像头权限被主进程拒绝', main.includes("媒体们.length === 1 && 媒体们[0] === 'audio'"))
检查('录音状态足够明显', css.includes('.录音状态') && css.includes('.麦克风.录着'))

console.log(`\n语音输入：${通过}/${总数} 通过`)
