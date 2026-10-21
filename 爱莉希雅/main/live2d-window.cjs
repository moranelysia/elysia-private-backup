'use strict'

function 限制数值(值, 最小, 最大) {
  const 数 = Number(值)
  return Math.max(最小, Math.min(最大, Number.isFinite(数) ? 数 : 最小))
}

/**
 * 宽高固定取偶数，窗口以整数中心缩放时不会因奇偶交替左右/上下跳半个像素。
 */
function 取Live2D偶数尺寸(基准宽, 基准高, 缩放) {
  return {
    width: Math.max(2, Math.round(Number(基准宽) * Number(缩放) / 2) * 2),
    height: Math.max(2, Math.round(Number(基准高) * Number(缩放) / 2) * 2),
  }
}

/** 向人物中心拉近就缩小，远离人物中心就放大；旋转方向不会影响比例。 */
function 按中心距离计算缩放({ 起始缩放, 起始半径, 当前X, 当前Y, 中心X, 中心Y, 最小缩放, 最大缩放, 灵敏度 = 260 }) {
  const 当前半径 = Math.hypot(Number(当前X) - Number(中心X), Number(当前Y) - Number(中心Y))
  const 半径变化 = 当前半径 - Number(起始半径)
  return 限制数值(Number(起始缩放) * Math.exp(半径变化 / 灵敏度), 最小缩放, 最大缩放)
}

function 取中心缩放边界({ 中心X, 中心Y, width, height, 工作区 }) {
  const 最小X = 工作区.x
  const 最小Y = 工作区.y
  const 最大X = 工作区.x + 工作区.width - width
  const 最大Y = 工作区.y + 工作区.height - height
  return {
    x: Math.round(限制数值(中心X - width / 2, 最小X, 最大X)),
    y: Math.round(限制数值(中心Y - height / 2, 最小Y, 最大Y)),
    width,
    height,
  }
}

/**
 * 左键拖动始终按“鼠标当前位置 + 按下时偏移”定位，不依赖中途收到多少个 pointermove。
 * 鼠标瞬间跨越很远时也会直接到最终位置，不会用累计增量慢慢追赶。
 */
function 取鼠标跟随边界({ 鼠标X, 鼠标Y, 偏移X, 偏移Y, width, height, 工作区 }) {
  const 最小X = 工作区.x
  const 最小Y = 工作区.y
  const 最大X = 工作区.x + 工作区.width - width
  const 最大Y = 工作区.y + 工作区.height - height
  return {
    x: Math.round(限制数值(Number(鼠标X) + Number(偏移X), 最小X, 最大X)),
    y: Math.round(限制数值(Number(鼠标Y) + Number(偏移Y), 最小Y, 最大Y)),
    width,
    height,
  }
}

/**
 * 快聊框优先贴在人物左侧，左边放不下再放右侧；两边都不够时才覆盖到工作区内。
 * 只计算位置，不改 Live2D 本身的边界。
 */
function 取Live2D快聊边界({ 人物, 工作区, width = 380, height = 360, 间隔 = 10 }) {
  const 最小X = 工作区.x + 8
  const 最小Y = 工作区.y + 8
  const 最大X = 工作区.x + 工作区.width - width - 8
  const 最大Y = 工作区.y + 工作区.height - height - 8
  const 左边 = 人物.x - width - 间隔
  const 右边 = 人物.x + 人物.width + 间隔
  const x = 左边 >= 最小X ? 左边 : 右边 <= 最大X ? 右边 : 限制数值(人物.x - width / 2, 最小X, 最大X)
  const y = 限制数值(人物.y + (人物.height - height) / 2, 最小Y, 最大Y)
  return { x: Math.round(x), y: Math.round(y), width, height }
}

module.exports = {
  取Live2D偶数尺寸,
  按中心距离计算缩放,
  取中心缩放边界,
  取鼠标跟随边界,
  取Live2D快聊边界,
}
