/** M-36A：生产调度与默认关闭开关。使用假生成器，不读写正式记忆。 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const 配置 = require('../脑/配置.cjs')
const { 创建私密日记调度, 前一自然日 } = require('../脑/私密日记调度.cjs')

let 总数 = 0
let 通过 = 0
function 检查(说明, 条件) {
  总数++
  if (!条件) throw new Error('✗ ' + 说明)
  通过++
  console.log('✓ ' + 说明)
}

function 假计时器们() {
  const 延时 = []
  const 间隔 = []
  const 清掉 = []
  const 新钟 = (类型, 回调, 毫秒) => {
    const 钟 = { 类型, 回调, 毫秒, unref次数: 0, unref() { this.unref次数++ } }
    ;(类型 === '延时' ? 延时 : 间隔).push(钟)
    return 钟
  }
  return {
    延时, 间隔, 清掉,
    设延时: (回调, 毫秒) => 新钟('延时', 回调, 毫秒),
    设间隔: (回调, 毫秒) => 新钟('间隔', 回调, 毫秒),
    清延时: (钟) => 清掉.push(钟),
    清间隔: (钟) => 清掉.push(钟),
  }
}

async function main() {
  const 配置源码 = fs.readFileSync(path.join(__dirname, '..', '脑', '配置.cjs'), 'utf8')
  检查('生产开关有独立环境变量和配置字段且默认关闭', 配置源码.includes('ELYSIA_PRIVATE_DIARY_ENABLED') && 配置源码.includes('privateDiaryEnabled') && 配置源码.includes("'privateDiaryEnabled', false"))
  检查('当前开关解析结果始终是布尔值', typeof 配置.私密日记自动生成 === 'boolean')

  let 关闭建生成器 = 0
  const 关闭计时器 = 假计时器们()
  const 关闭 = 创建私密日记调度({
    已启用: false,
    创建生成器: () => { 关闭建生成器++; return { 整理一天: async () => ({ 好: true }) } },
    ...关闭计时器,
  })
  const 关闭启动 = 关闭.启动()
  const 关闭唤醒 = await 关闭.唤醒()
  检查('默认关闭时不创建生成器、不读取来源也不建立计时器', !关闭启动.已启动 && !关闭唤醒.已排队 && 关闭建生成器 === 0 && 关闭计时器.延时.length === 0 && 关闭计时器.间隔.length === 0)

  const 钟 = 假计时器们()
  let 建生成器次数 = 0
  let 整理次数 = 0
  let 收到 = null
  let 放行
  const 闸 = new Promise((完成) => { 放行 = 完成 })
  const 调度 = 创建私密日记调度({
    已启用: true,
    数据目录: path.join(__dirname, '不会写入'),
    现在: () => new Date(2026, 9, 24, 9, 30, 0),
    取连接: () => ({ 钥匙: '只在内存', 模型: 'fake' }),
    创建生成器: ({ 数据目录 }) => {
      建生成器次数++
      return {
        整理一天: async (参数) => {
          整理次数++
          收到 = { 数据目录, ...参数 }
          await 闸
          return { 好: true, 写入: false, 状态: '没有微妙情绪波动' }
        },
      }
    },
    首次延迟: 12_000,
    检查间隔: 90_000,
    ...钟,
  })
  const 首次启动 = 调度.启动()
  const 重复启动 = 调度.启动()
  检查('启用后只建立一组可释放的启动与低频检查计时器', 首次启动.已启动 && 重复启动.重复 && 钟.延时.length === 1 && 钟.间隔.length === 1 && 钟.延时[0].毫秒 === 12000 && 钟.间隔[0].毫秒 === 90000 && 钟.延时[0].unref次数 === 1 && 钟.间隔[0].unref次数 === 1)
  检查('启动调度仍保持生成器惰性，不会在建计时器时读取内容', 建生成器次数 === 0 && 整理次数 === 0)

  const 第一次 = 调度.唤醒()
  const 同时第二次 = 调度.唤醒()
  检查('同一周期并发唤醒合并为同一个承诺', 第一次 === 同时第二次)
  放行()
  const 结果 = await 第一次
  检查('只整理前一个已经结束的本地自然日', 结果.周期 === '2026-10-23' && 收到.日期.getFullYear() === 2026 && 收到.日期.getMonth() === 9 && 收到.日期.getDate() === 23)
  检查('连接信息按执行时取得且不会写入调度状态', 收到.连接.钥匙 === '只在内存' && JSON.stringify(调度.状态()).indexOf('只在内存') < 0)
  检查('并发唤醒只建一个生成器并执行一次', 建生成器次数 === 1 && 整理次数 === 1)
  const 重复结果 = await 调度.唤醒()
  检查('同一运行期已成功检查的日期不会重复调用模型', 重复结果.状态 === '本次运行已经检查' && 整理次数 === 1)

  调度.停止()
  检查('停止时清掉两只计时器并恢复未启动状态', 钟.清掉.length === 2 && !调度.状态().已启动)

  const 日志 = []
  let 失败次数 = 0
  const 失败调度 = 创建私密日记调度({
    已启用: true,
    现在: () => new Date(2026, 9, 24, 12),
    创建生成器: () => ({ 整理一天: async () => { 失败次数++; if (失败次数 === 1) throw new Error('F:\\secret\\token.txt'); return { 好: true, 写入: false } } }),
    记录: (一) => 日志.push(一),
  })
  const 失败结果 = await 失败调度.唤醒()
  const 重试结果 = await 失败调度.唤醒()
  检查('后台失败被隔离并允许下一轮重试', !失败结果.好 && 重试结果.好 && 失败次数 === 2)
  检查('普通日志不泄漏原始异常中的路径或内容', 日志.length === 1 && !日志[0].includes('secret') && !日志[0].includes('token.txt'))

  const 昨天 = 前一自然日(new Date(2026, 0, 1, 1))
  检查('跨年时仍能得到正确的前一自然日', 昨天.getFullYear() === 2025 && 昨天.getMonth() === 11 && 昨天.getDate() === 31)

  const 主进程 = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8')
  const 生成器源码 = fs.readFileSync(path.join(__dirname, '..', '脑', '私密日记.cjs'), 'utf8')
  检查('主进程已接入独立调度并在退出时停止', 主进程.includes('私密日记调度.cjs') && 主进程.includes('私密日记调度.启动()') && 主进程.includes('私密日记调度.停止()'))
  检查('正式写入仍须同时通过配置开关和目录许可', 生成器源码.includes('生产开关关闭') && 生成器源码.includes('只能用于配置的数据目录'))
  检查('本测试没有创建任何伪正式数据目录', !fs.existsSync(path.join(__dirname, '不会写入')))

  console.log(`\n私密日记生产调度：${通过}/${总数} 通过`)
}

main().catch((错误) => { console.error(错误.stack || 错误.message); process.exitCode = 1 })

