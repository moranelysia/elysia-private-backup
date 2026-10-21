/**
 * 账本.js —— 小面板的脑子：把数字摆上去
 *
 * 它做的事很少：主进程把一份汇总送过来（或者它自己问一次），
 * 它就把那几个数字填进页面上。
 *
 * 【单位怎么显示】
 *   钱用"分"做单位，小数点后两位。为什么不用"元"：
 *   一句大概 0.5 分，用元显示就是 0.005 —— 一串零看不出大小。
 *   用分就是 0.50，一眼知道几斤几两。
 *   上了 100 分（也就是 1 元）再换成元显示。
 */
'use strict'

const 这次钱 = document.getElementById('这次钱')
const 这次字 = document.getElementById('这次字')
const 今天钱 = document.getElementById('今天钱')
const 今天次 = document.getElementById('今天次')
const 总共钱 = document.getElementById('总共钱')
const 总共次 = document.getElementById('总共次')
const 输入 = document.getElementById('输入')
const 命中 = document.getElementById('命中')
const 输出 = document.getElementById('输出')
const 命中率 = document.getElementById('命中率')

/** 把"元"写成人看得懂的样子 */
function 写钱(元) {
  const 分 = 元 * 100
  if (分 >= 100) return (元).toFixed(2) + ' 元'
  if (分 >= 10) return 分.toFixed(1) + ' 分'
  return 分.toFixed(2) + ' 分'
}

/** 大数字加千分位：7296 → 7,296 */
function 写数(n) {
  return (n || 0).toLocaleString('zh-CN')
}

function 摆上去(数) {
  if (!数) return

  // ---- 这一句 ----
  if (数.这次) {
    这次钱.textContent = 写钱(数.这次.合计)
    // 括号里给个更直观的量：她这次回了多少字
    这次字.textContent =
      `输入 ${写数(数.这次.输入)} → 输出 ${写数(数.这次.输出)} token`
  } else {
    这次钱.textContent = '—'
    这次字.textContent = '还没说话'
  }

  // ---- 今天 / 一共 ----
  今天钱.textContent = 写钱(数.今天.元)
  今天次.textContent = 数.今天.次数 + ' 次'
  总共钱.textContent = 写钱(数.一共.元)
  总共次.textContent = 数.一共.次数 + ' 次'

  // ---- 明细（这一句的）----
  const 这 = 数.这次 || { 输入: 0, 命中: 0, 输出: 0 }
  输入.textContent = 写数(这.输入)
  命中.textContent = 写数(这.命中)
  输出.textContent = 写数(这.输出)

  命中率.textContent = '缓存命中率 ' + (数.命中率 * 100).toFixed(1) + '%'
}

// ---- 接上对讲机 ----

// 主进程每次她说完话就推一份过来
window.账本.收到更新(摆上去)

// 「试看」模式：地址后面带 ?试看=1 的时候，拿一组假数字显示出来。
// 为什么留着这个：想调外观的时候不用真去说话、真花钱。
//   （打开方式：node tools\看账本.cjs）
if (location.search.includes('试看')) {
  摆上去({
    这次: { 合计: 0.005, 输入: 7505, 命中: 7296, 未命中: 209, 输出: 45 },
    今天: { 次数: 23, 元: 0.118, 输入: 172000, 命中: 168000, 未命中: 4000, 输出: 1100 },
    一共: { 次数: 214, 元: 1.08, 输入: 1600000, 命中: 1560000, 未命中: 40000, 输出: 9800 },
    命中率: 0.975,
  })
} else {
  // 也可以自己问一次（页面刚打开的时候）
  window.账本.要账本().then(摆上去)
}

// 面板上的按钮
document.getElementById('收起').addEventListener('click', () => window.账本.收起来())
document.getElementById('看流水').addEventListener('click', () => window.账本.打开账本文件())

// 按 Esc 也能收
document.addEventListener('keydown', (事件) => {
  if (事件.key === 'Escape') window.账本.收起来()
})
