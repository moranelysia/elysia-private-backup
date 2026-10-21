'use strict'

const assert = require('node:assert/strict')
const {
  取Live2D偶数尺寸,
  按中心距离计算缩放,
  取中心缩放边界,
  取鼠标跟随边界,
  取Live2D快聊边界,
} = require('../main/live2d-window.cjs')

const 公共参数 = {
  起始缩放: 1,
  起始半径: 100,
  中心X: 500,
  中心Y: 400,
  最小缩放: 0.45,
  最大缩放: 1.8,
}

const 向外 = 按中心距离计算缩放({ ...公共参数, 当前X: 650, 当前Y: 400 })
const 向内 = 按中心距离计算缩放({ ...公共参数, 当前X: 550, 当前Y: 400 })
const 同半径换方向 = 按中心距离计算缩放({ ...公共参数, 当前X: 500, 当前Y: 500 })
assert.ok(向外 > 1, '鼠标远离人物中心时应放大')
assert.ok(向内 < 1, '鼠标靠近人物中心时应缩小')
assert.equal(同半径换方向, 1, '围绕人物中心改变方向不应引起缩放抖动')

for (let 缩放 = 0.45; 缩放 <= 1.8; 缩放 += 0.013) {
  const 尺寸 = 取Live2D偶数尺寸(430, 530, 缩放)
  assert.equal(尺寸.width % 2, 0, '窗口宽度必须保持偶数')
  assert.equal(尺寸.height % 2, 0, '窗口高度必须保持偶数')
  const 边界 = 取中心缩放边界({
    中心X: 700,
    中心Y: 500,
    ...尺寸,
    工作区: { x: 0, y: 0, width: 1920, height: 1040 },
  })
  assert.equal(边界.x + 边界.width / 2, 700, '缩放时水平中心发生漂移')
  assert.equal(边界.y + 边界.height / 2, 500, '缩放时垂直中心发生漂移')
}

const 高速拖动 = 取鼠标跟随边界({
  鼠标X: 1450,
  鼠标Y: 760,
  偏移X: -180,
  偏移Y: -220,
  width: 430,
  height: 530,
  工作区: { x: 0, y: 0, width: 1920, height: 1040 },
})
assert.deepEqual(高速拖动, { x: 1270, y: 510, width: 430, height: 530 }, '高速拖动应一步抵达鼠标对应位置')

const 拖到边缘 = 取鼠标跟随边界({
  鼠标X: 2500,
  鼠标Y: -100,
  偏移X: -180,
  偏移Y: -220,
  width: 430,
  height: 530,
  工作区: { x: 0, y: 0, width: 1920, height: 1040 },
})
assert.deepEqual(拖到边缘, { x: 1490, y: 0, width: 430, height: 530 }, '高速拖动仍应限制在工作区内')

const 工作区 = { x: 0, y: 0, width: 1920, height: 1040 }
assert.deepEqual(
  取Live2D快聊边界({ 人物: { x: 1400, y: 400, width: 430, height: 530 }, 工作区 }),
  { x: 1010, y: 485, width: 380, height: 360 },
  '右侧人物的快聊框应贴在左边',
)
assert.deepEqual(
  取Live2D快聊边界({ 人物: { x: 20, y: 400, width: 430, height: 530 }, 工作区 }),
  { x: 460, y: 485, width: 380, height: 360 },
  '左侧人物的快聊框应贴在右边',
)

console.log(`✓ Live2D 缩放方向、稳定中心与高速鼠标跟随通过：向外 ${向外.toFixed(3)}，向内 ${向内.toFixed(3)}`)
