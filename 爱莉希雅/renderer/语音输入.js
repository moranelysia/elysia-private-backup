/** 麦克风录音与 16kHz 单声道 WAV 编码；不负责发送聊天消息。 */
(function (根) {
  'use strict'

  function 重采样(输入, 原采样率, 目标采样率) {
    if (目标采样率 >= 原采样率) return 输入
    const 比例 = 原采样率 / 目标采样率
    const 长度 = Math.max(1, Math.round(输入.length / 比例))
    const 输出 = new Float32Array(长度)
    for (let i = 0; i < 长度; i++) {
      const 开始 = Math.floor(i * 比例)
      const 结束 = Math.min(输入.length, Math.floor((i + 1) * 比例))
      let 和 = 0
      for (let j = 开始; j < 结束; j++) 和 += 输入[j]
      输出[i] = 和 / Math.max(1, 结束 - 开始)
    }
    return 输出
  }

  function 编码WAV(片段们, 原采样率, 目标采样率 = 16000) {
    const 总长 = 片段们.reduce((和, 一段) => 和 + 一段.length, 0)
    const 合并 = new Float32Array(总长)
    let 游标 = 0
    for (const 一段 of 片段们) { 合并.set(一段, 游标); 游标 += 一段.length }
    const 样本 = 重采样(合并, 原采样率, 目标采样率)
    const 缓冲 = new ArrayBuffer(44 + 样本.length * 2)
    const 视图 = new DataView(缓冲)
    const 写字 = (位置, 文字) => { for (let i = 0; i < 文字.length; i++) 视图.setUint8(位置 + i, 文字.charCodeAt(i)) }
    写字(0, 'RIFF')
    视图.setUint32(4, 36 + 样本.length * 2, true)
    写字(8, 'WAVE'); 写字(12, 'fmt ')
    视图.setUint32(16, 16, true); 视图.setUint16(20, 1, true); 视图.setUint16(22, 1, true)
    视图.setUint32(24, 目标采样率, true); 视图.setUint32(28, 目标采样率 * 2, true)
    视图.setUint16(32, 2, true); 视图.setUint16(34, 16, true)
    写字(36, 'data'); 视图.setUint32(40, 样本.length * 2, true)
    let 位置 = 44
    for (const 值 of 样本) {
      const 限制 = Math.max(-1, Math.min(1, 值))
      视图.setInt16(位置, 限制 < 0 ? 限制 * 0x8000 : 限制 * 0x7fff, true)
      位置 += 2
    }
    return 缓冲
  }

  /**
   * 轻量本地断句器。只看短时音量，不保存声音、不判断内容。
   * 返回“开始”用于更新界面，“断句”表示说完，“空等”用于定期释放录音缓存。
   */
  function 创建断句器({ 起声毫秒 = 180, 静音毫秒 = 850, 空等毫秒 = 20000, 最长说话毫秒 = 30000 } = {}) {
    let 总毫秒 = 0
    let 噪声 = 0.004
    let 连续人声 = 0
    let 连续静音 = 0
    let 已开口 = false
    let 开口时刻 = 0
    function 喂(音量, 帧毫秒) {
      const rms = Math.max(0, Number(音量) || 0)
      const ms = Math.max(1, Number(帧毫秒) || 0)
      总毫秒 += ms
      const 阈值 = Math.max(0.012, 噪声 * 3.2)
      const 像人声 = rms >= 阈值
      if (!已开口 && !像人声) 噪声 = 噪声 * 0.94 + rms * 0.06
      if (!已开口) {
        连续人声 = 像人声 ? 连续人声 + ms : Math.max(0, 连续人声 - ms * 0.5)
        if (连续人声 >= 起声毫秒) {
          已开口 = true
          开口时刻 = 总毫秒
          连续静音 = 0
          return '开始'
        }
        if (总毫秒 >= 空等毫秒) return '空等'
        return ''
      }
      // 开口后的门限稍低，避免一句话中较轻的尾音被过早截断。
      if (rms >= Math.max(0.009, 阈值 * 0.68)) 连续静音 = 0
      else 连续静音 += ms
      if (连续静音 >= 静音毫秒 || 总毫秒 - 开口时刻 >= 最长说话毫秒) return '断句'
      return ''
    }
    return { 喂, get 已开口() { return 已开口 }, get 噪声() { return 噪声 } }
  }

  function 录音约束(deviceId = '') {
    const audio = { channelCount: 1, echoCancellation: true, noiseSuppression: true }
    const 编号 = String(deviceId || '').trim()
    if (编号) audio.deviceId = { exact: 编号 }
    return { audio, video: false }
  }

  async function 开始录音({ mediaDevices, AudioContext, on音量, deviceId = '' }) {
    if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') throw new Error('这台设备不能使用麦克风')
    const 流 = await mediaDevices.getUserMedia(录音约束(deviceId))
    const 上下文 = new AudioContext()
    await 上下文.resume()
    const 来源 = 上下文.createMediaStreamSource(流)
    const 处理器 = 上下文.createScriptProcessor(4096, 1, 1)
    const 静音 = 上下文.createGain()
    静音.gain.value = 0
    const 片段们 = []
    处理器.onaudioprocess = (事件) => {
      const 片段 = new Float32Array(事件.inputBuffer.getChannelData(0))
      片段们.push(片段)
      if (typeof on音量 === 'function') {
        let 平方和 = 0
        for (const 值 of 片段) 平方和 += 值 * 值
        on音量(Math.sqrt(平方和 / Math.max(1, 片段.length)), 片段.length / 上下文.sampleRate * 1000)
      }
    }
    来源.connect(处理器); 处理器.connect(静音); 静音.connect(上下文.destination)
    let 已停 = false
    async function 收尾(要音频) {
      if (已停) return null
      已停 = true
      处理器.onaudioprocess = null
      try { 来源.disconnect(); 处理器.disconnect(); 静音.disconnect() } catch {}
      for (const 轨 of 流.getTracks()) 轨.stop()
      await 上下文.close().catch(() => {})
      return 要音频 && 片段们.length ? 编码WAV(片段们, 上下文.sampleRate) : null
    }
    return { 停止: () => 收尾(true), 取消: () => 收尾(false) }
  }

  const API = { 编码WAV, 创建断句器, 录音约束, 开始录音 }
  if (typeof module !== 'undefined' && module.exports) module.exports = API
  else 根.语音输入 = API
})(typeof window !== 'undefined' ? window : globalThis)
