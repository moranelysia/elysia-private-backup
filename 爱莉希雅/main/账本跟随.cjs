/**
 * 账本跟随调度：把同一轮事件循环里挤在一起的 move / resize 合并，
 * 但不增加固定等待时间。这样既不会重复 setBounds，也不会等拖动停下才追上。
 */
'use strict'

function 创建账本跟随调度({ 更新, 排队 = setImmediate, 取消排队 = clearImmediate } = {}) {
  if (typeof 更新 !== 'function') throw new TypeError('账本跟随缺少更新函数')

  let 待执行 = null
  let 已停止 = false

  function 请求更新() {
    if (已停止 || 待执行 !== null) return false
    待执行 = 排队(() => {
      待执行 = null
      if (!已停止) 更新()
    })
    return true
  }

  请求更新.取消 = () => {
    已停止 = true
    if (待执行 !== null) {
      取消排队(待执行)
      待执行 = null
    }
  }

  return 请求更新
}

module.exports = { 创建账本跟随调度 }
