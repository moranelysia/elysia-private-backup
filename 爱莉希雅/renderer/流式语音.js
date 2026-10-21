/**
 * 流式语音 —— 把不断增长的回复快照切成完整句子，按顺序合成和播放。
 *
 * 这里只管理句段与生命周期，不知道 GPT-SoVITS、IPC 或 Audio 的细节。
 * 新一轮、静音和文本回退都会换“世代”，旧的异步合成即使稍后回来也会被丢弃。
 */
'use strict'

;(function (根, 工厂) {
  const 接口 = 工厂()
  if (typeof module === 'object' && module.exports) module.exports = 接口
  if (根) 根.流式语音 = 接口
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const 句末 = /[。！？!?；;]|[—―]/
  const 收尾符 = /[。！？!?；;—―”’」』）】\"]/

  function 完整句截止(文字, 起点 = 0) {
    let 截止 = 起点
    for (let i = 起点; i < 文字.length; i++) {
      if (!句末.test(文字[i])) continue
      let j = i + 1
      while (j < 文字.length && 收尾符.test(文字[j])) j++
      截止 = j
      i = j - 1
    }
    return 截止
  }

  function 拆出完整句们(文字, 起点 = 0) {
    const 句子们 = []
    let 句首 = 起点
    for (let i = 起点; i < 文字.length; i++) {
      if (!句末.test(文字[i])) continue
      let j = i + 1
      while (j < 文字.length && 收尾符.test(文字[j])) j++
      const 句子 = 文字.slice(句首, j).trim()
      if (句子) 句子们.push(句子)
      句首 = j
      i = j - 1
    }
    return { 句子们, 截止: 句首 }
  }

  function 创建流式语音队列({ 合成, 播放, 停止, 失败, 状态, 首声 } = {}) {
    if (typeof 合成 !== 'function') throw new Error('流式语音缺少合成函数')
    if (typeof 播放 !== 'function') throw new Error('流式语音缺少播放函数')

    let 世代 = 0
    let 活跃 = false
    let 全文 = ''
    let 已排到 = 0
    let 待合成 = []
    let 待播放 = []
    let 正在合成 = false
    let 正在播放 = false
    let 起始时刻 = 0
    let 已报首声 = false
    let 空闲等待者 = []

    function 报状态(值, 细节 = {}) {
      if (typeof 状态 === 'function') 状态(值, 细节)
    }

    function 兑现空闲() {
      if (正在合成 || 正在播放 || 待合成.length || 待播放.length) return
      const 这些 = 空闲等待者.splice(0)
      for (const 好了 of 这些) 好了()
    }

    function 停掉当前() {
      if (typeof 停止 === 'function') 停止()
    }

    function 重置(要停止 = true) {
      世代++
      活跃 = false
      全文 = ''
      已排到 = 0
      待合成 = []
      待播放 = []
      // 旧异步任务仍可能在合成，但它持有旧世代，回来后只能退出。
      // 这里必须先放开两把锁，否则紧接着开始的新一轮会一直排不上。
      正在合成 = false
      正在播放 = false
      已报首声 = false
      if (要停止) 停掉当前()
      兑现空闲()
    }

    function 开始() {
      重置(true)
      活跃 = true
      起始时刻 = Date.now()
      报状态('等待句子')
      return 世代
    }

    function 取消() {
      重置(true)
      报状态('已取消')
    }

    function 入队(句子) {
      const 干净 = String(句子 || '').trim()
      if (!干净) return
      待合成.push(干净)
      void 继续合成()
    }

    function 收到(到现在) {
      if (!活跃) return { 接受: false, 原因: '没有活动轮次' }
      const 新全文 = String(到现在 || '')
      if (新全文 === 全文) return { 接受: true, 新增: 0 }
      if (!新全文.startsWith(全文)) {
        重置(true)
        报状态('文本回退')
        if (typeof 失败 === 'function') 失败({ 说明: '流式文字发生回退，本轮声音已停止，避免念出被撤回的内容。' })
        return { 接受: false, 回退: true }
      }

      全文 = 新全文
      const 拆分 = 拆出完整句们(全文, 已排到)
      if (拆分.截止 > 已排到) {
        已排到 = 拆分.截止
        for (const 句子 of 拆分.句子们) 入队(句子)
        return { 接受: true, 新增: 拆分.句子们.length }
      }
      return { 接受: true, 新增: 0 }
    }

    function 完成(最终文字) {
      if (!活跃) return { 接受: false }
      const 结果 = 收到(最终文字)
      if (!结果.接受) return 结果
      const 尾巴 = 全文.slice(已排到).trim()
      已排到 = 全文.length
      if (尾巴) 入队(尾巴)
      活跃 = false
      兑现空闲()
      return { 接受: true }
    }

    function 本轮失败(本轮, 错误) {
      if (本轮 !== 世代) return
      重置(true)
      报状态('失败', { 错误 })
      if (typeof 失败 === 'function') 失败(错误)
    }

    // 合成和播放是两条相邻流水线：第一句开始播放后，GPU 立刻准备第二句。
    // 每条线内部仍严格串行，既不压垮本地服务，也不会打乱句子顺序。
    async function 继续合成() {
      if (正在合成) return
      正在合成 = true
      const 本轮 = 世代
      try {
        while (本轮 === 世代 && 待合成.length) {
          const 句子 = 待合成.shift()
          报状态('合成中', { 句子 })
          let 这句已开始 = false
          const 报开始 = () => {
            if (这句已开始 || 本轮 !== 世代) return
            这句已开始 = true
            if (!已报首声) {
              已报首声 = true
              if (typeof 首声 === 'function') 首声(Date.now() - 起始时刻)
            }
          }
          // 流式 PCM 可以在合成 Promise 完成前开口；旧整段驱动会忽略第二个参数，
          // 仍由后面的播放函数报告开始。
          const 结果 = await 合成(句子, 报开始)
          if (本轮 !== 世代) return
          if (!结果 || !结果.成功) throw (结果 || { 说明: '声音合成没有返回结果' })
          待播放.push({ 句子, 结果, 报开始 })
          void 继续播放()
        }
      } catch (错误) {
        本轮失败(本轮, 错误)
      } finally {
        if (本轮 === 世代) {
          正在合成 = false
          if (待合成.length) void 继续合成()
          else if (!正在播放 && !待播放.length) 报状态('空闲')
          兑现空闲()
        }
      }
    }

    async function 继续播放() {
      if (正在播放) return
      正在播放 = true
      const 本轮 = 世代
      try {
        while (本轮 === 世代 && 待播放.length) {
          const { 句子, 结果, 报开始 } = 待播放.shift()
          报状态('播放中', { 句子 })
          await 播放(结果, 报开始)
        }
      } catch (错误) {
        本轮失败(本轮, 错误)
      } finally {
        if (本轮 === 世代) {
          正在播放 = false
          if (待播放.length) void 继续播放()
          else if (!正在合成 && !待合成.length) 报状态('空闲')
          兑现空闲()
        }
      }
    }

    function 等空闲() {
      if (!正在合成 && !正在播放 && !待合成.length && !待播放.length) return Promise.resolve()
      return new Promise((好了) => 空闲等待者.push(好了))
    }

    function 忙吗() {
      return 正在合成 || 正在播放 || 待合成.length > 0 || 待播放.length > 0
    }

    return Object.freeze({ 开始, 收到, 完成, 取消, 等空闲, 忙吗 })
  }

  return Object.freeze({ 完整句截止, 拆出完整句们, 创建流式语音队列 })
})
