/**
 * chat.js —— 窗口里那页网页的"脑子"
 *
 * 【它负责什么】
 *   看着输入框、把你打的话递出去、把她回来的字一个个显示出来、
 *   顺便把她的声音放出来。就这么几件事。
 *
 * 【它不能负责什么】
 *   它碰不到电脑上的任何东西 —— 读文件、跑程序、跟模型说话，
 *   全都得喊主进程（main.js）去做。喊的方式写在 preload.js 里，
 *   这边看起来就是一个普通的异步函数：
 *
 *     const 结果 = await window.爱莉.说话("在吗")
 *
 *   注意那个 await：不写它，程序会"话还没回来就往下走"。
 *   这个坑我们在做桌宠的时候踩过一次，终端只留下一句
 *   「unhandled rejection」，什么线索都没有。
 */

'use strict'

// ---------- 先把要用的东西都找出来 ----------

const 聊天区 = document.getElementById('聊天区')
const 开场 = document.getElementById('开场')
const 输入 = document.getElementById('输入')
const 发送按钮 = document.getElementById('发送')
const 待发条 = document.getElementById('待发')
const 选文件 = document.getElementById('选文件')
const 附件按钮 = document.getElementById('附件按钮')
const 通话开关 = document.getElementById('通话开关')
const 麦克风 = document.getElementById('麦克风')
const 录音状态 = document.getElementById('录音状态')
const 录音状态字 = document.getElementById('录音状态字')
const 喇叭 = document.getElementById('喇叭')
const 桌宠开关 = document.getElementById('桌宠开关')
const 收起按钮 = document.getElementById('收起')
const 状态 = document.getElementById('状态')
const 小状态 = document.getElementById('小状态')
const 故障条 = document.getElementById('故障条')
const 故障类别 = document.getElementById('故障类别')
const 故障标题 = document.getElementById('故障标题')
const 故障说明 = document.getElementById('故障说明')
const 故障建议 = document.getElementById('故障建议')
const 故障操作 = document.getElementById('故障操作')
const 故障关闭 = document.getElementById('故障关闭')
const 工具记录入口 = document.getElementById('工具记录入口')
const 工具记录遮罩 = document.getElementById('工具记录遮罩')
const 工具记录关闭 = document.getElementById('工具记录关闭')
const 工具记录列表 = document.getElementById('工具记录列表')
const 设置开关 = document.getElementById('设置开关')
const 设置遮罩 = document.getElementById('设置遮罩')
const 设置关闭 = document.getElementById('设置关闭')
const 密钥状态字 = document.getElementById('密钥状态')
const 密钥输入 = document.getElementById('密钥输入')
const 显示密钥 = document.getElementById('显示密钥')
const 保存密钥 = document.getElementById('保存密钥')
const 测试密钥 = document.getElementById('测试密钥')
const 清除密钥 = document.getElementById('清除密钥')
const 搜索密钥状态字 = document.getElementById('搜索密钥状态')
const 搜索密钥输入 = document.getElementById('搜索密钥输入')
const 显示搜索密钥 = document.getElementById('显示搜索密钥')
const 保存搜索密钥 = document.getElementById('保存搜索密钥')
const 测试搜索密钥 = document.getElementById('测试搜索密钥')
const 清除搜索密钥 = document.getElementById('清除搜索密钥')
const 搜索供应商下拉 = document.getElementById('搜索供应商')
const 搜索供应商状态字 = document.getElementById('搜索供应商状态')
const 打开数据目录 = document.getElementById('打开数据目录')
const 查看表达反馈 = document.getElementById('查看表达反馈')
const 导出备份 = document.getElementById('导出备份')
const 设置结果 = document.getElementById('设置结果')
const 表达反馈遮罩 = document.getElementById('表达反馈遮罩')
const 表达反馈关闭 = document.getElementById('表达反馈关闭')
const 表达反馈统计 = document.getElementById('表达反馈统计')
const 表达反馈筛选 = document.getElementById('表达反馈筛选')
const 表达反馈列表 = document.getElementById('表达反馈列表')
const 麦克风设备 = document.getElementById('麦克风设备')
const 刷新麦克风 = document.getElementById('刷新麦克风')
const 麦克风设备状态 = document.getElementById('麦克风设备状态')
const 主动陪伴开启 = document.getElementById('主动陪伴开启')
const 陪伴最短 = document.getElementById('陪伴最短')
const 陪伴最长 = document.getElementById('陪伴最长')
const 安静时段开启 = document.getElementById('安静时段开启')
const 安静开始 = document.getElementById('安静开始')
const 安静结束 = document.getElementById('安静结束')
const 陪伴每日上限 = document.getElementById('陪伴每日上限')
const 保存主动陪伴 = document.getElementById('保存主动陪伴')
const 测试主动陪伴 = document.getElementById('测试主动陪伴')
const 主动陪伴状态字 = document.getElementById('主动陪伴状态')
const 记忆开关 = document.getElementById('记忆开关')
const 状态详情开关 = document.getElementById('状态详情开关')
const 状态详情 = document.getElementById('状态详情')
const 情感状态按钮 = document.getElementById('情感状态')
const 缓慢情绪按钮 = document.getElementById('缓慢情绪')
const 记忆管理入口 = document.getElementById('记忆管理入口')
const 记忆管理遮罩 = document.getElementById('记忆管理遮罩')
const 记忆管理关闭 = document.getElementById('记忆管理关闭')
const 记忆导出 = document.getElementById('记忆导出')
const 记忆清空 = document.getElementById('记忆清空')
const 临时记忆新增 = document.getElementById('临时记忆新增')
const 记忆管理统计 = document.getElementById('记忆管理统计')
const 记忆管理列表 = document.getElementById('记忆管理列表')
const 记忆搜索 = document.getElementById('记忆搜索')
const 记忆层切换 = document.querySelector('.记忆层切换')
const 记忆管理面板 = document.querySelector('.记忆管理面板')
const 长期记忆筛选 = document.getElementById('长期记忆筛选')
const 长期记忆视图切换 = document.getElementById('长期记忆视图切换')
const 临时记忆筛选 = document.getElementById('临时记忆筛选')
const 临时记忆分类 = document.getElementById('临时记忆分类')
const 临时记忆生命周期 = document.getElementById('临时记忆生命周期')
const 临时记忆确认状态 = document.getElementById('临时记忆确认状态')
const 日记筛选 = document.getElementById('日记筛选')
const 工作索引入口 = document.getElementById('工作索引入口')
const 工作索引抽屉 = document.getElementById('工作索引抽屉')
const 工作索引刷新 = document.getElementById('工作索引刷新')
const 工作索引收起 = document.getElementById('工作索引收起')
const 工作索引统计 = document.getElementById('工作索引统计')
const 工作索引搜索 = document.getElementById('工作索引搜索')
const 工作索引筛选 = document.getElementById('工作索引筛选')
const 工作索引列表 = document.getElementById('工作索引列表')

// ---------- 她这边的一些开关 ----------

let 要出声 = true // 出声开关（点右上角那个 ♪）
let 正在启动声音 = false
let 她正在说 = false // 她还在回话的时候，别让她同时回两句
let 开场收起来了 = false
let 当前工作任务 = null // 工作模式正在确认或执行的任务卡
let 近期工具调用 = [] // 只活在这次程序运行里；不另写磁盘
let 当前写长期记忆 = true // 每段对话各有一份；旧对话默认开
let 语音输入状态 = '空闲'
let 当前录音 = null
let 仍按着麦克风 = false
let 录音超时钟 = null
let 识别世代 = 0
let 输入含语音草稿 = false
let 通话模式 = false
let 通话重听钟 = null
let 通话正在断句 = false
let 麦克风设备编号 = ''

桌宠开关.addEventListener('click', () => window.爱莉.切换桌宠())
window.爱莉.桌宠显示状态((显示) => {
  桌宠开关.classList.toggle('开着', 显示)
  桌宠开关.setAttribute('aria-pressed', String(显示))
  桌宠开关.title = 显示 ? '桌宠：收起 Live2D' : '桌宠：显示 Live2D'
})

function 摆通话开关(开) {
  通话模式 = !!开
  通话开关.classList.toggle('开着', 通话模式)
  通话开关.setAttribute('aria-pressed', String(通话模式))
  通话开关.title = 通话模式 ? '通话模式已开启：静音约 1 秒后自动发送' : '开启免提通话模式'
}

function 安排通话监听(延迟 = 350) {
  clearTimeout(通话重听钟)
  通话重听钟 = null
  if (!通话模式) return
  通话重听钟 = setTimeout(() => {
    通话重听钟 = null
    if (!通话模式 || !document.hasFocus() || 她正在说 || 语音输入状态 !== '空闲' || 流式朗读.忙吗()) return
    void 开始语音输入(null, { 免提: true })
  }, 延迟)
}

// 左侧默认只留模式。其余功能需要时再展开，不让常驻状态把对话列表往下挤。
状态详情开关.addEventListener('click', () => {
  const 要展开 = 状态详情.classList.contains('收着')
  状态详情.classList.toggle('收着', !要展开)
  状态详情开关.setAttribute('aria-expanded', String(要展开))
  状态详情开关.title = 要展开
    ? '隐藏长期记忆、记忆库、任务和工作区以及即时反应'
    : '显示长期记忆、记忆库、任务和工作区以及即时反应'
})

function 摆情感状态(数据) {
  if (!数据 || 数据.好 === false || (数据.对话 && 当前对话编号 && 数据.对话 !== 当前对话编号)) return
  const 情绪 = String(数据.情绪 || '平静')
  const 强度 = Math.max(0, Math.min(100, Math.round(Number(数据.强度 || 0) * 100)))
  情感状态按钮.textContent = 情绪 === '平静' ? '平静' : `${情绪} · ${强度}%`
  情感状态按钮.classList.toggle('有反应', 情绪 !== '平静' && 强度 > 0)
  情感状态按钮.title = 情绪 === '平静'
    ? '当前没有明确的即时反应；点击保持平静'
    : `${数据.原因 || '本轮即时反应'}；约 ${数据.剩余分钟 || 1} 分钟内逐渐恢复平静。点击立即复位。`
  const 慢 = 数据.缓慢 || {}
  const 慢情绪 = String(慢.情绪 || '平稳')
  const 慢强度 = Math.max(0, Math.min(45, Math.round(Number(慢.强度 || 0) * 100)))
  缓慢情绪按钮.textContent = 慢情绪 === '平稳' ? '平稳' : `${慢情绪} · ${慢强度}%`
  缓慢情绪按钮.classList.toggle('有情绪', 慢情绪 !== '平稳' && 慢强度 > 0)
  缓慢情绪按钮.title = 慢情绪 === '平稳'
    ? '近期没有累积的表达基调；点击保持平稳'
    : `${慢.原因 || '近期多轮的轻微表达基调'}；约 ${慢.剩余小时 || 1} 小时内逐渐回落。点击立即复位。`
}

async function 刷新情感状态() {
  try { 摆情感状态(await window.爱莉.问情感状态()) } catch { /* 状态显示失败不影响聊天 */ }
}

情感状态按钮.addEventListener('click', async () => {
  try { 摆情感状态(await window.爱莉.重置情感状态()) } catch { /* 复位失败不影响聊天 */ }
})
缓慢情绪按钮.addEventListener('click', async () => {
  try { 摆情感状态(await window.爱莉.重置缓慢情绪()) } catch { /* 复位失败不影响聊天 */ }
})

// 她正在生成的那个气泡。第一小段字到的时候开一个，
// 之后每来一段就改这个气泡的内容 —— 这样看起来就是"她正在说"。
let 流式把手 = null
let 正在重播按钮 = null

// ============================================================
// 小工具
// ============================================================

/** 现在的时刻，写成 21:10 */
function 现在() {
  const d = new Date()
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

/** 把聊天区滚到底（新消息总是在下面） */
function 滚到底() {
  聊天区.scrollTop = 聊天区.scrollHeight
}

/** 把开场那段收走 —— 第一次说话之后就不需要它了 */
function 收开场() {
  if (开场收起来了) return
  开场收起来了 = true
  开场.remove()
}

/**
 * 往聊天区加一条消息（时间用"现在"）。
 * @param {'她的'|'他的'} 谁的
 * @returns {{条:HTMLElement, 改文字: Function}} 返回一个能改这条消息内容的把手
 */
function 加一条(谁的, 文字 = '', 附件们 = null) {
  收开场()
  return 画一条(谁的, 文字, 现在(), 附件们)
}

/**
 * 画一条消息 —— 时间和内容都由调用方给。
 *
 * 【为什么要跟 加一条 分开】
 *   从聊天记录里恢复上次的对话时，时间得用**记录里那个时间**
 *   （比如"昨天 21:10"），不是现在。要是走 加一条，昨天说过的话
 *   会被盖上今天的时间戳，看着就像刚才说的。
 */
function 画一条(谁的, 文字, 时间字, 直接给的附件们 = null, 来源 = '') {
  const 条 = document.createElement('div')
  条.className = '一条 ' + 谁的

  const 气泡 = document.createElement('div')
  气泡.className = '气泡'

  // 附件有两种来路：
  //   · 从聊天记录里重画 → 从文字里那几行 `[附件] ...` 抠出来
  //   · 刚刚发出去的     → 界面手上就有（还带着本机生成的预览图），直接给
  const 拆的 = 直接给的附件们 ? { 正文: 文字, 附件们: 直接给的附件们 } : 拆附件行(文字)
  let 当前正文 = 拆的.正文
  气泡.textContent = 当前正文
  if (拆的.附件们.length) 气泡.appendChild(画附件条(拆的.附件们))

  const 时间 = document.createElement('div')
  时间.className = '时间'
  let 反馈菜单节点 = null
  const 时刻字 = document.createElement('span')
  时刻字.textContent = 时间字
  时间.appendChild(时刻字)
  if (谁的 === '她的' && 来源 === '主动陪伴') {
    const 标记 = document.createElement('span')
    标记.className = '主动陪伴标记'
    标记.textContent = '主动陪伴'
    时间.appendChild(标记)
  }
  if (谁的 === '她的') {
    const 重播 = document.createElement('button')
    重播.type = 'button'
    重播.className = '重播声音'
    重播.textContent = '↻'
    重播.title = '重播这条回复'
    重播.setAttribute('aria-label', '重播这条回复')
    重播.addEventListener('click', () => void 重播回复(当前正文, 重播))
    时间.appendChild(重播)

    const 反馈按钮 = document.createElement('button')
    反馈按钮.type = 'button'
    反馈按钮.className = '表达反馈按钮'
    反馈按钮.textContent = '◇'
    反馈按钮.title = '标记这条回复的表达问题'
    反馈按钮.setAttribute('aria-label', '标记这条回复的表达问题')
    时间.appendChild(反馈按钮)

    const 菜单 = document.createElement('div')
    菜单.className = '表达反馈菜单'
    菜单.hidden = true
    const 标题 = document.createElement('div')
    标题.className = '表达反馈标题'
    标题.textContent = '这句话哪里不像她？'
    菜单.appendChild(标题)
    const 标签区 = document.createElement('div')
    标签区.className = '表达反馈标签区'
    const 标签按钮们 = new Map()
    const 已选 = new Set()
    let 正在保存反馈 = false

    function 画反馈选中() {
      for (const [标签, 按钮] of 标签按钮们) 按钮.classList.toggle('选中', 已选.has(标签))
      反馈按钮.classList.toggle('已标记', 已选.size > 0)
      反馈按钮.title = 已选.size ? `已标记：${[...已选].join('、')}` : '标记这条回复的表达问题'
    }

    for (const 标签 of ['讨好腔', '套路句式', '空洞', '莫名其妙', '不像爱莉希雅']) {
      const 按钮 = document.createElement('button')
      按钮.type = 'button'
      按钮.textContent = 标签
      按钮.addEventListener('click', async (事件) => {
        事件.stopPropagation()
        if (正在保存反馈) return
        const 原来 = new Set(已选)
        if (已选.has(标签)) 已选.delete(标签)
        else 已选.add(标签)
        画反馈选中()
        正在保存反馈 = true
        try {
          const 结果 = await window.爱莉.保存表达反馈(当前正文, [...已选])
          if (!结果 || !结果.好) throw new Error((结果 && 结果.说明) || '没有保存成功')
          已选.clear()
          for (const 一 of 结果.标签 || []) 已选.add(一)
          画反馈选中()
          提示(已选.size ? '已记下这条回复的表达问题' : '已撤销这条回复的表达标记')
        } catch (错误) {
          已选.clear()
          for (const 一 of 原来) 已选.add(一)
          画反馈选中()
          提示('标记失败：' + 错误.message, '#c9779d')
        } finally {
          正在保存反馈 = false
        }
      })
      标签按钮们.set(标签, 按钮)
      标签区.appendChild(按钮)
    }
    菜单.appendChild(标签区)
    反馈菜单节点 = 菜单

    反馈按钮.addEventListener('click', async (事件) => {
      事件.stopPropagation()
      if (!菜单.hidden) {
        菜单.hidden = true
        return
      }
      try {
        const 结果 = await window.爱莉.问表达反馈(当前正文)
        if (!结果 || !结果.好) throw new Error((结果 && 结果.说明) || '读取失败')
        已选.clear()
        for (const 一 of 结果.标签 || []) 已选.add(一)
        画反馈选中()
        菜单.hidden = false
        滚到底()
      } catch (错误) {
        提示('暂时不能标记：' + 错误.message, '#c9779d')
      }
    })
  }

  条.appendChild(气泡)
  条.appendChild(时间)
  if (反馈菜单节点) 条.appendChild(反馈菜单节点)
  聊天区.appendChild(条)
  滚到底()

  return {
    条,
    读文字: () => 当前正文,
    改文字: (新文字) => {
      // 【注意】textContent 赋值会把气泡里所有子节点冲掉 ——
      //   所以附件条得跟着重新画一遍，不然它会消失。
      const 拆的2 = 拆附件行(新文字)
      当前正文 = 拆的2.正文
      气泡.textContent = 拆的2.正文
      if (拆的2.附件们.length) 气泡.appendChild(画附件条(拆的2.附件们))
      滚到底()
    },
  }
}

/** 换了一天就插一条「—— 9月27日 ——」，不然昨天和今天看着像一口气说的 */
function 加日期分隔(那天) {
  const 部分 = String(那天 || '').split('-')
  const 文本 = 部分.length === 3 ? Number(部分[1]) + '月' + Number(部分[2]) + '日' : 那天
  const 条 = document.createElement('div')
  条.className = '日期分隔'
  条.textContent = '—— ' + 文本 + ' ——'
  聊天区.appendChild(条)
}

/** 从 "2026-09-27 19:04" 里抠出 "19:04" */
function 只留时刻(时间) {
  const 部分 = String(时间 || '').split(' ')
  return 部分[1] || ''
}

/** 她"正在想"的样子：三个点一跳一跳 */
function 加一个在打字() {
  const 条 = document.createElement('div')
  条.className = '一条 她的 在打字'
  条.innerHTML = '<div class="气泡"><span class="点"></span><span class="点"></span><span class="点"></span></div>'
  聊天区.appendChild(条)
  滚到底()
  return 条
}

/** 在底下那行小字里说句话（出问题了就靠它告诉你） */
function 提示(文字, 颜色 = '') {
  小状态.textContent = 文字
  小状态.style.color = 颜色
}

const 声音提示 = document.getElementById('声音提示')
let 声音提示闹钟 = null
function 弹声音提示(文字, 类型 = '') {
  clearTimeout(声音提示闹钟)
  声音提示.textContent = 文字
  声音提示.className = '声音提示' + (类型 ? ' ' + 类型 : '')
  声音提示闹钟 = setTimeout(() => 声音提示.classList.add('收着'), 4200)
}

let 当前故障 = null

function 显示故障(故障) {
  if (!故障) return
  当前故障 = 故障
  故障条.hidden = false
  故障条.dataset.类别 = 故障.类别 || '本地'
  故障类别.textContent = 故障.类别 || '本地'
  故障标题.textContent = 故障.标题 || '这次没有成功'
  故障说明.textContent = 故障.说明 || ''
  故障建议.textContent = 故障.建议 || ''
  故障操作.hidden = !故障.操作
  故障操作.textContent = 故障.操作 || ''
}

function 收起故障(只收类别 = '') {
  if (只收类别 && 当前故障 && 当前故障.类别 !== 只收类别) return
  当前故障 = null
  故障条.hidden = true
}

function 权限故障(记录们) {
  if (!Array.isArray(记录们)) return null
  const 一条 = 记录们.find((记录) =>
    记录 && !记录.成功 && /不同意|拒绝|没有问.*办法|需要.*确认|权限/.test(String(记录.结果摘要 || '')),
  )
  if (!一条) return null
  return {
    类别: '权限',
    标题: '这一步没有获得权限',
    说明: 一条.结果摘要 || `${一条.名字 || '操作'}没有执行。`,
    建议: '需要时重新发起，并在确认卡中决定是否允许。',
  }
}

// ============================================================
// 他说话：按住录音，松开识别，只填输入框
// ============================================================

function 摆语音输入状态(新状态, 文字 = '') {
  语音输入状态 = 新状态
  麦克风.classList.toggle('录着', 新状态 === '录音')
  麦克风.classList.toggle('识别中', 新状态 === '识别')
  录音状态.classList.toggle('收着', 新状态 === '空闲')
  录音状态.classList.toggle('识别中', 新状态 === '识别' || 新状态 === '申请')
  if (文字) 录音状态字.textContent = 文字
  麦克风.title = 新状态 === '识别'
    ? '正在识别；点一下取消'
    : 通话模式 && 新状态 === '录音'
      ? '通话中：停顿约 1 秒后自动发送'
      : '按住说话，松开后识别'
}

async function 开始语音输入(事件, { 免提 = false } = {}) {
  if (语音输入状态 === '识别') {
    取消语音输入('已取消识别')
    return
  }
  if (语音输入状态 !== '空闲') return
  if (通话模式 && (她正在说 || 流式朗读.忙吗())) {
    提示('等她说完这一句，再按住麦克风')
    return
  }
  if (通话模式 && (输入.value.trim() || 待发的.length)) {
    提示('输入框或附件还没发送，先处理它们再开始通话')
    return
  }
  事件?.preventDefault()
  仍按着麦克风 = true
  通话正在断句 = false
  const 这一代 = ++识别世代
  摆语音输入状态('申请', '正在打开麦克风…')
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    const 断句器 = 免提 ? window.语音输入.创建断句器() : null
    const 录音 = await window.语音输入.开始录音({
      mediaDevices: navigator.mediaDevices,
      AudioContext,
      deviceId: 麦克风设备编号,
      on音量: 断句器 ? (音量, 帧毫秒) => {
        if (这一代 !== 识别世代 || 通话正在断句 || !通话模式) return
        const 信号 = 断句器.喂(音量, 帧毫秒)
        if (信号 === '开始') 摆语音输入状态('录音', '听到你了 · 停顿约 1 秒后自动发送')
        else if (信号 === '断句') {
          通话正在断句 = true
          void 结束语音输入(false, '正在识别…', { 免提: true })
        } else if (信号 === '空等') {
          通话正在断句 = true
          void 结束语音输入(true, '', { 静默: true, 重新监听: true })
        }
      } : undefined,
    })
    if (!仍按着麦克风 || 这一代 !== 识别世代) {
      await 录音.取消()
      摆语音输入状态('空闲')
      return
    }
    当前录音 = 录音
    摆语音输入状态('录音', 免提 ? '通话中 · 正在听，停顿约 1 秒自动发送' : '正在听 · 松开后识别，移出或按 Esc 取消')
    录音超时钟 = setTimeout(() => {
      仍按着麦克风 = false
      void 结束语音输入(false, '已到 45 秒，正在识别…')
    }, 45000)
  } catch (错误) {
    仍按着麦克风 = false
    当前录音 = null
    摆语音输入状态('空闲')
    if (免提) 摆通话开关(false)
    const 被拒绝 = 错误 && (错误.name === 'NotAllowedError' || 错误.name === 'SecurityError')
    const 设备失效 = 麦克风设备编号 && 错误 && (错误.name === 'NotFoundError' || 错误.name === 'OverconstrainedError')
    显示故障({
      类别: '权限',
      标题: 被拒绝 ? '没有获得麦克风权限' : 设备失效 ? '选中的麦克风不在了' : '麦克风没有打开',
      说明: 被拒绝 ? '录音没有开始，爱莉希雅没有听到任何内容。' : 设备失效 ? '可能是耳机已拔出，或者 Windows 更换了设备编号。' : String(错误 && 错误.message || '无法使用麦克风'),
      建议: 被拒绝 ? '需要时重新按住麦克风，并在系统提示中允许。' : 设备失效 ? '打开设置，在“语音输入”里选择系统默认或重新选择设备。' : '检查麦克风连接和 Windows 隐私设置后重试。',
    })
  }
}

async function 结束语音输入(取消 = false, 状态文字 = '', { 免提 = false, 静默 = false, 重新监听 = false } = {}) {
  仍按着麦克风 = false
  clearTimeout(录音超时钟)
  录音超时钟 = null
  const 录音 = 当前录音
  当前录音 = null
  if (!录音) {
    if (语音输入状态 !== '识别') 摆语音输入状态('空闲')
    return
  }
  const 这一代 = 识别世代
  if (取消) {
    await 录音.取消()
    摆语音输入状态('空闲')
    if (!静默) 提示('录音已取消')
    if (重新监听) 安排通话监听(200)
    return
  }
  const WAV = await 录音.停止()
  if (!WAV || WAV.byteLength <= 44) {
    摆语音输入状态('空闲')
    if (!静默) 提示('没有录到声音，请按住麦克风再说')
    if (免提) 安排通话监听(500)
    return
  }
  摆语音输入状态('识别', 状态文字 || '正在识别… 首次使用大约需要 7 秒')
  let 结果
  try {
    结果 = await window.爱莉.识别语音(WAV)
  } catch (错误) {
    结果 = { 成功: false, 说明: String(错误 && 错误.message || '语音识别失败') }
  }
  if (这一代 !== 识别世代) return
  摆语音输入状态('空闲')
  if (!结果 || !结果.成功) {
    if (结果 && 结果.已取消) return
    显示故障(结果 && 结果.故障 || { 类别: '服务', 标题: '语音没有识别成功', 说明: 结果 && 结果.说明 || '', 建议: '可以重试，或直接在输入框里打字。' })
    if (免提) 安排通话监听(1200)
    return
  }
  const 识别文字 = String(结果.文字 || '').trim()
  if (!识别文字) {
    if (免提) 安排通话监听(500)
    return
  }
  const 原文 = 输入.value
  输入.value = 原文 + (原文 && !/\s$/.test(原文) ? ' ' : '') + 识别文字
  输入含语音草稿 = true
  输入.dispatchEvent(new Event('input'))
  输入.focus()
  输入.setSelectionRange(输入.value.length, 输入.value.length)
  收起故障('服务')
  if (通话模式) {
    提示(`听到了（${Number(结果.用时 || 0).toFixed(1)} 秒），正在发送…`)
    await 说一句()
  } else {
    提示(`听清了（${Number(结果.用时 || 0).toFixed(1)} 秒），确认文字后再发送`)
  }
}

function 取消语音输入(说明 = '录音已取消') {
  仍按着麦克风 = false
  通话正在断句 = false
  识别世代++
  clearTimeout(录音超时钟)
  录音超时钟 = null
  if (当前录音) void 当前录音.取消()
  当前录音 = null
  if (语音输入状态 === '识别') window.爱莉.取消语音识别()
  摆语音输入状态('空闲')
  提示(说明)
}

// ============================================================
// 让她出声
// ============================================================

// 旧整段 MP3 播放器保留作流式服务不可用时的回退。
let 正在放的声音 = null
let PCM上下文 = null
let PCM下次时刻 = 0
const PCM源们 = new Set()
const PCM流们 = new Map()
let PCM编号 = 0
let 口型分析器 = null
let 口型波形 = null
let 口型采样帧 = 0
let 口型采样中 = false
let 上次口型强度 = -1

function 停止HTML声音() {
  if (!正在放的声音) return
  const 当前 = 正在放的声音
  正在放的声音 = null
  try { 当前.声音.pause() } catch { /* 停不掉就算了 */ }
  当前.收尾()
}

function 停止所有声音() {
  停止口型采样()
  停止HTML声音()
  for (const [编号, 会话] of PCM流们) {
    window.爱莉.取消流式语音(编号)
    会话.取消()
  }
  PCM流们.clear()
  for (const 源 of PCM源们) {
    try { 源.stop() } catch { /* 已经结束 */ }
  }
  PCM源们.clear()
  if (PCM上下文) PCM下次时刻 = PCM上下文.currentTime
}

function 取PCM上下文() {
  if (!PCM上下文) {
    const AudioContext类 = window.AudioContext || window.webkitAudioContext
    if (!AudioContext类) throw new Error('当前窗口不支持连续 PCM 播放')
    PCM上下文 = new AudioContext类()
  }
  if (PCM上下文.state === 'suspended') void PCM上下文.resume()
  return PCM上下文
}

function 取口型分析器() {
  if (!口型分析器) {
    const 上下文 = 取PCM上下文()
    口型分析器 = 上下文.createAnalyser()
    口型分析器.fftSize = 256
    口型分析器.smoothingTimeConstant = 0.18
    口型分析器.connect(上下文.destination)
    口型波形 = new Float32Array(口型分析器.fftSize)
  }
  return 口型分析器
}

function 发送口型强度(强度, 强制 = false) {
  const 值 = Math.max(0, Math.min(1, Number(强度) || 0))
  if (!强制 && Math.abs(值 - 上次口型强度) < 0.015) return
  上次口型强度 = 值
  window.爱莉.Live2D口型强度(值)
}

function 开始口型采样() {
  if (口型采样中) return
  const 分析器 = 取口型分析器()
  口型采样中 = true
  const 采样 = () => {
    if (!口型采样中) return
    分析器.getFloatTimeDomainData(口型波形)
    let 平方和 = 0
    let 峰值 = 0
    for (const 样本 of 口型波形) {
      平方和 += 样本 * 样本
      峰值 = Math.max(峰值, Math.abs(样本))
    }
    const 均方根 = Math.sqrt(平方和 / 口型波形.length)
    // 先滤掉编码底噪，再将人声常见的 RMS 区间映射到 0~1；幂曲线让轻声也有可见开合。
    const 线性 = 峰值 < 0.01 ? 0 : Math.max(0, Math.min(1, (均方根 - 0.004) / 0.115))
    发送口型强度(Math.pow(线性, 0.72))
    口型采样帧 = requestAnimationFrame(采样)
  }
  采样()
}

function 停止口型采样() {
  口型采样中 = false
  if (口型采样帧) cancelAnimationFrame(口型采样帧)
  口型采样帧 = 0
  发送口型强度(0, true)
}

/** 一个 HTTP PCM 流对应一个会话；所有会话共用 PCM下次时刻，所以句子能无缝接在一起。 */
function 创建PCM会话(编号, 报开始) {
  let 零头 = null
  let 未结束音频 = 0
  let 输入结束 = false
  let 已收尾 = false
  let 字节数 = 0
  let 完成播放
  const 播放完 = new Promise((好) => { 完成播放 = 好 })

  function 看看结束() {
    if (!已收尾 && 输入结束 && 未结束音频 === 0) {
      已收尾 = true
      完成播放()
    }
  }

  function 收到(原字节, 采样率) {
    if (已收尾) return
    let 字节 = new Uint8Array(原字节)
    字节数 += 字节.byteLength
    if (零头 !== null) {
      const 合并 = new Uint8Array(字节.byteLength + 1)
      合并[0] = 零头
      合并.set(字节, 1)
      字节 = 合并
      零头 = null
    }
    if (字节.byteLength % 2) {
      零头 = 字节[字节.byteLength - 1]
      字节 = 字节.subarray(0, 字节.byteLength - 1)
    }
    if (!字节.byteLength) return

    const 上下文 = 取PCM上下文()
    const 样本数 = 字节.byteLength / 2
    const 音频 = 上下文.createBuffer(1, 样本数, 采样率 || 32000)
    const 声道 = 音频.getChannelData(0)
    const 视图 = new DataView(字节.buffer, 字节.byteOffset, 字节.byteLength)
    for (let i = 0; i < 样本数; i++) 声道[i] = 视图.getInt16(i * 2, true) / 32768

    const 源 = 上下文.createBufferSource()
    源.buffer = 音频
    源.connect(取口型分析器())
    const 开始时刻 = Math.max(上下文.currentTime + 0.035, PCM下次时刻)
    PCM下次时刻 = 开始时刻 + 音频.duration
    未结束音频++
    PCM源们.add(源)
    源.onended = () => {
      PCM源们.delete(源)
      try { 源.disconnect() } catch { /* 已断开 */ }
      未结束音频--
      看看结束()
    }
    源.start(开始时刻)
    报开始()
  }

  function 完成输入() {
    输入结束 = true
    零头 = null
    看看结束()
  }

  function 取消() {
    if (已收尾) return
    已收尾 = true
    完成播放()
  }

  return { 编号, 收到, 完成输入, 取消, 播放完, get 字节数() { return 字节数 } }
}

window.爱莉.语音流片段((数据) => {
  const 会话 = PCM流们.get(String(数据 && 数据.编号 || ''))
  if (!会话 || !数据.字节) return
  会话.收到(数据.字节, Number(数据.采样率) || 32000)
})

async function 合成流式声音(文字, 报开始) {
  const 编号 = `pcm_${Date.now()}_${++PCM编号}`
  const 会话 = 创建PCM会话(编号, () => {
    状态.textContent = '在说话…'
    报开始()
  })
  PCM流们.set(编号, 会话)
  let 结果
  try {
    结果 = await window.爱莉.流式合成语音(编号, 文字)
  } catch (错误) {
    结果 = { 成功: false, 说明: 错误.message }
  } finally {
    PCM流们.delete(编号)
  }

  if (结果 && 结果.成功) {
    会话.完成输入()
    return { ...结果, 流式: true, 播放完: 会话.播放完 }
  }

  const 已经出声 = 会话.字节数 > 0
  会话.取消()
  if (结果 && 结果.已取消) return 结果
  // 老转接层或流式端点启动失败时，只有尚未播出任何 PCM 才能安全退回整段 MP3。
  if (!已经出声) return window.爱莉.合成语音(文字)
  return 结果 || { 成功: false, 说明: '声音流中断' }
}

/** 把已经合成好的字节播放完；Promise 到 onended 才完成，保证句子不会互相盖住。 */
function 播放合成声音(结果, 已开始) {
  return new Promise((完成, 失败) => {
    const 包 = new Blob([结果.音频], { type: 结果.类型 || 'audio/mpeg' })
    const 网址 = URL.createObjectURL(包)
    const 声音 = new Audio(网址)
    const 媒体源 = 取PCM上下文().createMediaElementSource(声音)
    媒体源.connect(取口型分析器())
    let 收过了 = false
    const 收尾 = (错误 = null) => {
      if (收过了) return
      收过了 = true
      URL.revokeObjectURL(网址)
      try { 媒体源.disconnect() } catch { /* 已断开 */ }
      if (正在放的声音 && 正在放的声音.声音 === 声音) 正在放的声音 = null
      if (错误) 失败(错误)
      else 完成()
    }

    停止HTML声音()
    正在放的声音 = { 声音, 媒体源, 收尾 }
    声音.onended = () => 收尾()
    声音.onerror = () => 收尾(new Error('这段声音没放出来'))
    声音.play()
      .then(() => {
        if (typeof 已开始 === 'function') 已开始()
      })
      .catch((错误) => 收尾(错误))
  })
}

function 播放声音结果(结果, 已开始) {
  if (结果 && 结果.流式 && 结果.播放完) {
    已开始()
    return 结果.播放完
  }
  return 播放合成声音(结果, 已开始)
}

function 清除重播状态() {
  if (!正在重播按钮) return
  正在重播按钮.classList.remove('播放中')
  正在重播按钮.textContent = '↻'
  正在重播按钮.title = '重播这条回复'
  正在重播按钮.setAttribute('aria-label', '重播这条回复')
  正在重播按钮 = null
}

const 流式朗读 = window.流式语音.创建流式语音队列({
  合成: 合成流式声音,
  播放: 播放声音结果,
  停止: 停止所有声音,
  首声: (毫秒) => console.log(`流式语音首声：${毫秒}ms`),
  状态: (阶段) => {
    if (阶段 === '合成中') 状态.textContent = '在准备声音…'
    else if (阶段 === '播放中') {
      状态.textContent = '在说话…'
      window.爱莉.Live2D说话中(true)
      开始口型采样()
    }
    else if (阶段 === '空闲' && !她正在说) {
      状态.textContent = '在的'
      if (通话模式) 安排通话监听(250)
    }
    if (['空闲', '已取消', '失败', '文本回退'].includes(阶段)) {
      停止口型采样()
      window.爱莉.Live2D说话中(false)
    }
    if (['空闲', '已取消', '失败', '文本回退'].includes(阶段) || (阶段 === '等待句子' && 她正在说)) 清除重播状态()
  },
  失败: (错误) => {
    const 说明 = (错误 && (错误.说明 || 错误.message)) || '没反应'
    提示('说不出声：' + 说明, '#c9779d')
    显示故障((错误 && 错误.故障) || {
      类别: '服务', 标题: '声音服务没有响应', 说明, 建议: '启动声音服务后再打开声音。',
    })
  },
})

async function 重播回复(原文, 按钮) {
  if (正在重播按钮 === 按钮 && 流式朗读.忙吗()) {
    流式朗读.取消()
    提示('已停止重播')
    return
  }
  if (她正在说) {
    提示('等她把这一轮说完，再重播这条')
    return
  }
  const 文字 = String(原文 || '').trim()
  if (!文字) {
    提示('这条回复没有可朗读的文字')
    return
  }
  if (!要出声) {
    提示('声音现在关着，请先点右上角的 ♪')
    return
  }
  let 声音状态
  try {
    声音状态 = await window.爱莉.声音状态()
  } catch (错误) {
    显示故障({ 类别: '本地', 标题: '没能检查声音服务', 说明: 错误.message, 建议: '重新打开窗口后再试。' })
    return
  }
  if (!声音状态 || !声音状态.在) {
    提示('声音服务还没准备好，请先点右上角的 ♪')
    return
  }
  if (语音输入状态 !== '空闲') 取消语音输入('正在重播，结束后会继续通话')
  流式朗读.取消()
  正在重播按钮 = 按钮
  按钮.classList.add('播放中')
  按钮.textContent = '■'
  按钮.title = '停止重播'
  按钮.setAttribute('aria-label', '停止重播')
  流式朗读.开始()
  流式朗读.完成(文字)
}

// ============================================================
// 说话这件事的完整流程
// ============================================================

// ============================================================
// 附件：图片和文件（2026-10-04 加的）
// ============================================================
//
// 【为什么要把文件读成字节，而不是只传一个路径】
//   渲染进程默认读不了本地文件（Electron 的 webSecurity 是开着的），
//   而且新版 Electron 里 File 对象上那个 path 属性已经拿掉了。
//   所以读成 ArrayBuffer 走 IPC 传过去 —— 主进程拿到就能直接写盘。
//   代价是内容要在内存里过一趟，所以卡了个 20MB 上限。
//
// 【能怎么给它】
//   · 截图 / 复制来的图片 → 直接在输入框里 Ctrl+V
//   · 硬盘上的文件       → 拖进窗口，或者点那个 📎
// 三条路最后都汇到 收文件们() 一个函数里。

/** 等着发出去的东西。每一项：{名字, 类型, 字节, 大小, 是图片, 预览} */
let 待发的 = []

/** 一次最多带几个 —— 对面单次请求有上限，而且多了她也看不过来 */
const 最多带几个 = 6

const 单个别超过 = 20 * 1024 * 1024

/** 2234567 → "2.1 MB" */
function 人话大小(数) {
  const n = Number(数) || 0
  if (n < 1024) return n + ' 字节'
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB'
  return (n / 1024 / 1024).toFixed(1) + ' MB'
}

/** 把一串 File 收进待发区（粘贴、拖拽、点选三条路都走它） */
async function 收文件们(文件们) {
  const 列表 = Array.from(文件们 || [])
  if (!列表.length) return

  for (const 文件 of 列表) {
    if (待发的.length >= 最多带几个) {
      提示(`一次最多带 ${最多带几个} 个 —— 剩下的下一条再发`, '#c9779d')
      break
    }
    const 是图 = String(文件.type || '').startsWith('image/')
    if (文件.size > 单个别超过) {
      提示(`「${文件.name}」太大了（${人话大小(文件.size)}），单个别超过 20MB`, '#c9779d')
      continue
    }
    try {
      const 字节 = await 文件.arrayBuffer()
      待发的.push({
        名字: 文件.name || '文件',
        类型: 文件.type || '',
        字节,
        大小: 文件.size,
        是图片: 是图,
        // 图片先在本机生成个临时地址给他看预览。
        // 用 blob: 而不是去读文件 —— 内容这会儿就在手上，不用再绕一趟。
        预览: 是图 ? URL.createObjectURL(文件) : '',
      })
    } catch (错误) {
      提示('这个文件读不出来：' + 错误.message, '#c9779d')
    }
  }
  画待发()
}

/** 把待发区画出来 */
function 画待发() {
  if (!待发的.length) {
    待发条.classList.add('收着')
    待发条.innerHTML = ''
    附件按钮.classList.remove('有话要说')
    return
  }

  待发条.classList.remove('收着')
  附件按钮.classList.add('有话要说')
  待发条.innerHTML = ''

  for (const [号, 一个] of 待发的.entries()) {
    const 格 = document.createElement('div')
    格.className = '一个'
    格.title = 一个.名字 + '（' + 人话大小(一个.大小) + '）'

    if (一个.预览) {
      const 图 = document.createElement('img')
      图.src = 一个.预览
      格.appendChild(图)
    } else {
      const 图标 = document.createElement('div')
      图标.className = '图标'
      图标.textContent = '📄'
      格.appendChild(图标)
    }

    const 名字 = document.createElement('span')
    名字.className = '名字'
    名字.textContent = 一个.名字
    格.appendChild(名字)

    const 去掉 = document.createElement('button')
    去掉.className = '去掉'
    去掉.textContent = '✕'
    去掉.title = '这个不发了'
    去掉.addEventListener('click', () => {
      待发的.splice(号, 1)
      画待发()
    })
    格.appendChild(去掉)

    待发条.appendChild(格)
  }
}

/** 发出去了（或者不发了）—— 清空，顺手把临时的 blob 地址还回去 */
function 清空待发() {
  const 旧的 = 待发的
  待发的 = []
  画待发()

  // 【为什么不是立刻还】这些地址刚交给聊天区里那条新消息用，
  //   立刻撤掉的话图片当场就变成破图。晚一分钟再还 —— 那时候早加载完了。
  setTimeout(() => {
    for (const 一个 of 旧的) {
      if (!一个.预览) continue
      try {
        URL.revokeObjectURL(一个.预览)
      } catch {
        /* 已经没了就算了 */
      }
    }
  }, 60000)
}

// ---- 三条投喂的路 ----

附件按钮.addEventListener('click', () => 选文件.click())

选文件.addEventListener('change', async () => {
  await 收文件们(选文件.files)
  // 【这句不能省】不清空的话，同一个文件选第二次 change 不触发，
  // 表现就是"再选一次没反应"。
  选文件.value = ''
})

// 截图直接 Ctrl+V
输入.addEventListener('paste', (事件) => {
  const 文件们 = 事件.clipboardData && 事件.clipboardData.files
  if (!文件们 || !文件们.length) return
  // 【为什么要拦下来】不拦的话，图片会被当成文字粘进输入框 ——
  // 那会进来一坨谁也看不懂的东西。
  事件.preventDefault()
  收文件们(文件们)
})

// 拖进来
//
// 【为什么 dragover 也要拦】不拦的话 Electron 会按默认行为办事：
// 把那个文件**直接打开**，整个窗口就跳成那张图了。
document.addEventListener('dragover', (事件) => {
  事件.preventDefault()
})
document.addEventListener('drop', (事件) => {
  事件.preventDefault()
  const 文件们 = 事件.dataTransfer && 事件.dataTransfer.files
  if (文件们 && 文件们.length) 收文件们(文件们)
})

// ---- 聊天记录里那行附件 ----

/**
 * 从消息文字里把附件行抠出来。
 *
 * 格式是我们自己定的（见 脑\附件.cjs 的 一行()）：
 *   [附件] 20261004-163012-截图.png（图片，12 KB）
 * 一行一个，排在正文后面。
 *
 * 【为什么要从文字里抠，不单独存个字段】
 *   聊天记录是一行一条的 jsonl，加字段要动"存"和"读"两头；
 *   而这行本来就是给他看的文字的一部分 ——
 *   抠出来只是为了画得好看点，抠不出来也不影响他读到什么。
 */
function 拆附件行(文字) {
  const 剩下 = []
  const 附件们 = []
  for (const 行 of String(文字 || '').split('\n')) {
    const 命中 = /^\[附件\]\s*(.+?)（(图片|文件)，(.+?)）\s*$/.exec(行.trim())
    if (命中) {
      附件们.push({
        显示名: 好看名字(命中[1]),
        存成: 命中[1],
        大小字: 命中[3],
        是图片: 命中[2] === '图片',
        预览: '',
      })
    } else {
      剩下.push(行)
    }
  }
  return { 正文: 剩下.join('\n').trim(), 附件们 }
}

/** 20261004-163012-截图.png → 截图.png（前面那截是防重名用的，不用给他看） */
function 好看名字(存成) {
  return String(存成 || '').replace(/^\d{8}-\d{6}-/, '')
}

/** 缩略图缓存：同一张不重复问主进程要 */
const 缩略图缓存 = new Map()

async function 要缩略图(存成) {
  if (缩略图缓存.has(存成)) return 缩略图缓存.get(存成)
  let 地址 = ''
  try {
    const 果 = await window.爱莉.读附件(存成)
    地址 = 果 && 果.好 ? 果.dataUrl : ''
  } catch {
    地址 = ''
  }
  缩略图缓存.set(存成, 地址)
  return 地址
}

/** 把一串附件画成小条（聊天记录里用） */
function 画附件条(附件们) {
  const 条 = document.createElement('div')
  条.className = '附件条'

  for (const 一个 of 附件们) {
    const 格 = document.createElement('div')
    格.className = '一个'
    格.title =
      一个.显示名 + (一个.大小字 ? '（' + 一个.大小字 + '）' : '') + ' —— 点一下用系统程序打开'

    const 图标 = document.createElement('div')
    图标.className = '图标'
    图标.textContent = 一个.是图片 ? '🖼' : '📄'

    if (一个.是图片 && (一个.预览 || 一个.存成)) {
      const 图 = document.createElement('img')
      图.alt = ''
      格.appendChild(图)
      if (一个.预览) {
        图.src = 一个.预览
      } else {
        要缩略图(一个.存成).then((地址) => {
          // 拿不到就退回那个图标 —— 别在屏幕上留一个破图
          if (地址) 图.src = 地址
          else 图.replaceWith(图标)
        })
      }
    } else {
      格.appendChild(图标)
    }

    const 名字 = document.createElement('span')
    名字.className = '名字'
    名字.textContent = 一个.显示名
    格.appendChild(名字)

    // 点一下用系统程序打开它（图片进看图软件、pdf 进阅读器）
    if (一个.存成) {
      格.addEventListener('click', () => {
        window.爱莉.打开附件(一个.存成).catch(() => {})
      })
    }

    条.appendChild(格)
  }

  return 条
}

/** 改工作任务卡上的状态，同时让顶栏也说清楚她正处在哪一步。 */
function 改工作任务状态(任务, 新状态, 说明 = '') {
  if (!任务 || !任务.条 || !任务.条.isConnected) return
  任务.状态 = 新状态
  任务.状态字.textContent = 说明 ? `${新状态} · ${说明}` : 新状态
  任务.条.dataset.状态 = 新状态

  const 顶栏字 = {
    待确认: '任务等你确认',
    执行中: '她在执行…',
    等待权限: '等你点头',
    已完成: '在的',
    部分完成: '在的',
    失败: '在的',
    已取消: '在的',
  }
  状态.textContent = 顶栏字[新状态] || '在的'
}

function 工具时间(时间) {
  const d = new Date(时间)
  if (Number.isNaN(d.getTime())) return '--:--:--'
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((x) => String(x).padStart(2, '0')).join(':')
}

function 画工具记录() {
  工具记录列表.replaceChildren()
  if (!近期工具调用.length) {
    const 空 = document.createElement('div')
    空.className = '工具记录空态'
    空.textContent = '还没有调用过工具。'
    工具记录列表.appendChild(空)
    return
  }
  for (const 一条 of 近期工具调用) {
    const 卡 = document.createElement('article')
    const 需注意 = 一条.执行状态 !== '成功' || 一条.验证状态 === '未验证' || ['部分', '否'].includes(一条.目标完成) || Boolean(一条.错误类别)
    卡.className = '工具记录卡 ' + (一条.执行状态 === '成功' ? '成功' : '失败') + (需注意 ? ' 需注意' : '')

    const 头 = document.createElement('div')
    头.className = '工具记录卡头'
    const 名 = document.createElement('strong')
    名.textContent = 一条.名字 || '未知工具'
    const 时间 = document.createElement('time')
    时间.textContent = 工具时间(一条.时间)
    头.append(名, 时间)

    const 状态组 = document.createElement('div')
    状态组.className = '工具状态组'
    const 状态们 = [
      ['执行', 一条.执行状态 || (一条.成功 ? '成功' : '失败')],
      ['验证', 一条.验证状态 || '未记录'],
      ['目标', 一条.目标完成 || '未知'],
    ]
    for (const [标签, 值] of 状态们) {
      const 状态 = document.createElement('span')
      状态.className = `工具状态 工具状态-${String(值).replace(/[^\p{L}\p{N}]+/gu, '-')}`
      状态.textContent = `${标签} · ${值}`
      状态组.appendChild(状态)
    }

    const 参数 = document.createElement('div')
    参数.className = '工具记录参数'
    参数.textContent = 一条.参数 || '（无参数）'
    const 摘要 = document.createElement('div')
    摘要.className = '工具记录摘要'
    摘要.textContent = 一条.结果摘要 || '没有更多说明'
    卡.append(头, 状态组, 参数, 摘要)

    if (一条.状态说明 || 一条.错误类别) {
      const 提醒 = document.createElement('div')
      提醒.className = '工具记录提醒'
      提醒.textContent = 一条.状态说明 || 一条.错误类别
      卡.appendChild(提醒)
    }

    const 详情们 = []
    if (Number(一条.重试次数) > 0) 详情们.push(`重试 ${一条.重试次数} 次`)
    if (一条.截断 && 一条.截断.有) 详情们.push('结果已截断')
    if (Array.isArray(一条.来源) && 一条.来源.length) 详情们.push(`来源 ${一条.来源.length} 个`)
    if (详情们.length || (Array.isArray(一条.来源) && 一条.来源.length)) {
      const 详情 = document.createElement('details')
      详情.className = '工具记录详情'
      const 概要 = document.createElement('summary')
      概要.textContent = 详情们.join(' · ') || '查看详情'
      详情.appendChild(概要)
      if (Array.isArray(一条.来源)) {
        for (const 来源 of 一条.来源) {
          const 行 = document.createElement('div')
          行.className = '工具记录来源'
          行.textContent = 来源
          详情.appendChild(行)
        }
      }
      卡.appendChild(详情)
    }
    工具记录列表.appendChild(卡)
  }
}

function 收下工具记录(记录们) {
  if (!Array.isArray(记录们) || !记录们.length) return
  近期工具调用 = [...记录们].reverse().concat(近期工具调用).slice(0, 30)
  工具记录入口.hidden = false
  工具记录入口.classList.remove('执行中')
  工具记录入口.textContent = `刚刚调用 ${记录们.length} 项 · 查看记录`
  画工具记录()
}

function 开工具记录() {
  画工具记录()
  工具记录遮罩.classList.remove('收着')
  工具记录遮罩.setAttribute('aria-hidden', 'false')
}

function 关工具记录() {
  工具记录遮罩.classList.add('收着')
  工具记录遮罩.setAttribute('aria-hidden', 'true')
}

// ============================================================
// 长期记忆管理：查看、搜索、来源、修改、遗忘与完整导出
// ============================================================

let 当前记忆层 = '长期'
let 当前记忆类别 = ''
let 当前长期视图 = '列表'
let 当前日记类型 = ''
let 记忆搜索计时 = null
let 记忆请求号 = 0
let 关系图保存计时 = null
const 临时分类们 = ['近期状态', '近期计划', '未完话题', '候选偏好', '近期事件', '关系语境']
const 重要性名字 = ['低', '普通', '重要', '核心']
const 记忆类型名字 = { episodic: '事件', semantic: '事实', procedural: '方法' }
const 记忆关系类型们 = ['同一主题', '后续发展', '更新', '矛盾', '先于', '后于']

function 记忆类型选择(当前 = 'semantic') {
  const 选择 = document.createElement('select')
  选择.setAttribute('aria-label', '记忆类型')
  for (const 名 of ['episodic', 'semantic', 'procedural']) {
    const 项 = document.createElement('option')
    项.value = 名
    项.textContent = `${记忆类型名字[名]} · ${名}`
    项.selected = 当前 === 名
    选择.appendChild(项)
  }
  return 选择
}

function 重要性选择(当前 = 1) {
  const 选择 = document.createElement('select')
  选择.setAttribute('aria-label', '记忆重要性')
  for (let i = 0; i < 重要性名字.length; i++) {
    const 项 = document.createElement('option')
    项.value = String(i)
    项.textContent = `${i} · ${重要性名字[i]}`
    项.selected = Number(当前) === i
    选择.appendChild(项)
  }
  return 选择
}

function 显示日期时间(值) {
  const d = new Date(值)
  if (Number.isNaN(d.getTime())) return '时间未记录'
  return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function 输入框日期时间(值) {
  const d = new Date(值)
  if (Number.isNaN(d.getTime())) return ''
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function 标签数组(文字) {
  return [...new Set(String(文字 || '').split(/[，,、\s]+/).map((一) => 一.trim()).filter(Boolean))].slice(0, 12)
}

function 记忆卡提示(卡, 文字, 是错 = false) {
  let 一行 = 卡.querySelector('.记忆操作提示')
  if (!一行) {
    一行 = document.createElement('div')
    一行.className = '记忆操作提示'
    卡.appendChild(一行)
  }
  一行.textContent = 文字
  一行.classList.toggle('失败', 是错)
}

function 开始编辑记忆(卡, 一, 内容节点, 操作节点) {
  if (!一.编号 || 卡.querySelector('.记忆编辑区')) return
  内容节点.hidden = true
  操作节点.hidden = true

  const 编辑区 = document.createElement('div')
  编辑区.className = '记忆编辑区'
  const 输入框 = document.createElement('textarea')
  输入框.maxLength = 2000
  输入框.value = 一.内容 || ''
  输入框.setAttribute('aria-label', '修改记忆内容')
  const 按钮区 = document.createElement('div')
  按钮区.className = '记忆编辑按钮'
  const 保存 = document.createElement('button')
  保存.className = '记忆保存'
  保存.textContent = '保存'
  const 取消 = document.createElement('button')
  取消.textContent = '取消'
  按钮区.append(保存, 取消)
  编辑区.append(输入框, 按钮区)
  卡.appendChild(编辑区)

  const 收起 = () => {
    编辑区.remove()
    内容节点.hidden = false
    操作节点.hidden = false
  }
  取消.addEventListener('click', 收起)
  保存.addEventListener('click', async () => {
    const 新内容 = 输入框.value.trim()
    if (!新内容) {
      记忆卡提示(卡, '记忆内容不能为空。', true)
      return
    }
    保存.disabled = true
    取消.disabled = true
    try {
      const 果 = await window.爱莉.修改长期记忆({ 类别: 一.类别, 编号: 一.编号, 内容: 新内容 })
      if (!果 || !果.好) {
        记忆卡提示(卡, (果 && 果.说明) || '没有保存成功。', true)
        保存.disabled = false
        取消.disabled = false
        return
      }
      await 刷新长期记忆()
    } catch (错误) {
      记忆卡提示(卡, '保存失败：' + 错误.message, true)
      保存.disabled = false
      取消.disabled = false
    }
  })
  // 窄窗口里普通 focus 会把整个固定面板顶出视口；只把光标交给编辑框，不滚页面。
  输入框.focus({ preventScroll: true })
  输入框.setSelectionRange(输入框.value.length, 输入框.value.length)
}

function 画长期记忆(果) {
  记忆管理列表.innerHTML = ''
  if (!果 || !果.好) {
    记忆管理统计.textContent = (果 && 果.说明) || '暂时读不到'
    const 空 = document.createElement('div')
    空.className = '记忆管理空态'
    空.textContent = '长期记忆暂时读不到。'
    记忆管理列表.appendChild(空)
    return
  }

  const 条们 = Array.isArray(果.列表) ? 果.列表 : []
  记忆管理统计.textContent = `找到 ${果.总数 || 0} 条${果.截断 ? ' · 先显示最近 500 条' : ''}`
  if (!条们.length) {
    const 空 = document.createElement('div')
    空.className = '记忆管理空态'
    空.textContent = 记忆搜索.value.trim() || 当前记忆类别 ? '没有符合条件的记忆。' : '还没有长期记忆。'
    记忆管理列表.appendChild(空)
    return
  }

  for (const 一 of 条们) {
    const 卡 = document.createElement('article')
    卡.className = '记忆卡'
    const 头 = document.createElement('div')
    头.className = '记忆卡头'
    const 类别 = document.createElement('strong')
    类别.textContent = `${一.类别 || '记忆'} · ${记忆类型名字[一.记忆类型] || 一.记忆类型 || '类型未记录'}`
    const 时间 = document.createElement('time')
    时间.textContent = 一.时间 || '时间未记录'
    头.append(类别, 时间)

    const 内容 = document.createElement('div')
    内容.className = '记忆内容'
    内容.textContent = 一.内容 || ''

    const 来源 = document.createElement('div')
    来源.className = '记忆来源'
    const 谁 = 一.来源 && 一.来源 !== '未记录' ? 一.来源 : '来源未记录'
    const 来自哪里 = 一.会话标题 ? `${谁} · 来自会话「${一.会话标题}」` : `${谁} · 会话来源未记录`
    const 更正哪里 = 一.修改会话标题 ? ` · 更正来自会话「${一.修改会话标题}」` : ''
    const 整理信息 = 一.整理于 ? ` · 后台整理于 ${一.整理于}` : ''
    const 人物信息 = 一.元数据 ? ` · 关于${一.元数据.person || '人物未记录'}（${一.元数据.relationship || '关系未记录'}）` : ''
    const 记录缘由 = 一.元数据 && 一.元数据.backstory ? ` · ${一.元数据.backstory}` : ''
    const 自主说明 = 一.自主评估 && 一.自主评估.分数
      ? ` · 自动评估 ${一.自主评估.分数} 分（${(一.自主评估.依据 || []).join('；')}）`
      : 一.评估账本 && Number.isFinite(Number(一.评估账本.当前分数))
        ? ` · 当前评估 ${一.评估账本.当前分数} 分（累计 ${一.评估账本.提及次数 || 0} 次，${一.评估账本.最近决定 || '继续观察'}）`
      : ''
    来源.textContent = 来自哪里 + 人物信息 + 记录缘由 + 自主说明 + (一.修改于 ? ` · 修改于 ${一.修改于}` : '') + 更正哪里 + 整理信息

    const 操作 = document.createElement('div')
    操作.className = '记忆操作'
    if (一.编号) {
      const 编辑 = document.createElement('button')
      编辑.textContent = '编辑'
      编辑.addEventListener('click', () => 开始编辑记忆(卡, 一, 内容, 操作))
      const 遗忘 = document.createElement('button')
      遗忘.className = '遗忘记忆'
      遗忘.textContent = '遗忘'
      遗忘.addEventListener('click', async () => {
        const 摘要 = String(一.内容 || '').replace(/\s+/g, ' ').slice(0, 48)
        if (!window.confirm(`遗忘这条${一.类别 || '记忆'}？\n“${摘要}${String(一.内容 || '').length > 48 ? '…' : ''}”\n\n删除后不会再提供给她。`)) return
        编辑.disabled = true
        遗忘.disabled = true
        try {
          const 果 = await window.爱莉.遗忘长期记忆({ 类别: 一.类别, 编号: 一.编号 })
          if (!果 || !果.好) {
            记忆卡提示(卡, (果 && 果.说明) || '没有删除成功。', true)
            编辑.disabled = false
            遗忘.disabled = false
            return
          }
          await 刷新长期记忆()
        } catch (错误) {
          记忆卡提示(卡, '遗忘失败：' + 错误.message, true)
          编辑.disabled = false
          遗忘.disabled = false
        }
      })
      操作.append(编辑, 遗忘)
    } else {
      const 说明 = document.createElement('span')
      说明.textContent = '这条旧记忆没有编号，请在记忆文件中手动修改。'
      操作.appendChild(说明)
    }
    卡.append(头, 内容, 来源, 操作)
    记忆管理列表.appendChild(卡)
  }
}

async function 刷新长期记忆() {
  if (当前长期视图 === '关系图') return 刷新长期记忆关系图()
  const 这次 = ++记忆请求号
  记忆管理统计.textContent = '读取中……'
  try {
    const 果 = await window.爱莉.问长期记忆({ 类别: 当前记忆类别, 搜索: 记忆搜索.value })
    if (这次 === 记忆请求号) 画长期记忆(果)
  } catch (错误) {
    if (这次 === 记忆请求号) 画长期记忆({ 好: false, 说明: 错误.message })
  }
}

function 默认关系图位置(节点们) {
  const 分组 = { 事实: [], 经历: [], 小本子: [] }
  for (const 一 of 节点们) (分组[一.类别] || 分组.事实).push(一)
  const 位置 = {}
  const 类别们 = ['事实', '经历', '小本子']
  类别们.forEach((类别, 列) => {
    分组[类别].sort((a, b) => {
      const 甲 = a.事件时间 && a.事件时间.排序键 || '', 乙 = b.事件时间 && b.事件时间.排序键 || ''
      if (!!甲 !== !!乙) return 甲 ? -1 : 1
      return 甲.localeCompare(乙) || String(a.时间 || '').localeCompare(String(b.时间 || '')) || a.键.localeCompare(b.键)
    }).forEach((一, 行) => { 位置[一.键] = { x: 54 + 列 * 330, y: 86 + 行 * 154 } })
  })
  return 位置
}

function 关系图端点(节点) { return { 类别: 节点.类别, 编号: 节点.编号 } }

function 关系图关系颜色(类型) {
  return ({ 同一主题: '#b788c4', 后续发展: '#d378a0', 更新: '#d58b63', 矛盾: '#c76272', 先于: '#7799c6', 后于: '#739f91' })[类型] || '#a584a5'
}

async function 刷新长期记忆关系图() {
  const 这次 = ++记忆请求号
  记忆管理统计.textContent = '正在整理关系图……'
  try {
    const 果 = await window.爱莉.问长期记忆关系图({ 类别: 当前记忆类别, 搜索: 记忆搜索.value })
    if (这次 === 记忆请求号) 画长期记忆关系图(果)
  } catch (错误) {
    if (这次 === 记忆请求号) 画长期记忆关系图({ 好: false, 说明: 错误.message })
  }
}

function 画长期记忆关系图(果) {
  记忆管理列表.replaceChildren()
  if (!果 || !果.好) {
    记忆管理统计.textContent = (果 && 果.说明) || '关系图暂时读不到'
    const 空 = document.createElement('div'); 空.className = '记忆管理空态'; 空.textContent = '长期记忆关系图暂时读不到。'; 记忆管理列表.appendChild(空)
    return
  }
  const 节点们 = Array.isArray(果.节点) ? 果.节点 : []
  const 关系们 = Array.isArray(果.关系) ? 果.关系 : []
  const 候选关系 = Array.isArray(果.候选关系) ? 果.候选关系 : []
  记忆管理统计.textContent = `${节点们.length} 张卡片 · ${关系们.length} 条关系${果.自动关系总数 ? `（${果.自动关系总数} 条自动整理）` : ''}${候选关系.length ? ` · ${候选关系.length} 条待确认建议` : ''}${果.失效关系数 ? ` · ${果.失效关系数} 条失效关系未显示` : ''}`
  if (!节点们.length) {
    const 空 = document.createElement('div'); 空.className = '记忆管理空态'; 空.textContent = 记忆搜索.value.trim() || 当前记忆类别 ? '没有符合条件的记忆卡片。' : '还没有长期记忆。'; 记忆管理列表.appendChild(空)
    return
  }

  const 壳 = document.createElement('section'); 壳.className = '记忆关系图'
  const 工具 = document.createElement('div'); 工具.className = '关系图工具栏'
  const 类型选择 = document.createElement('select'); 类型选择.setAttribute('aria-label', '新关系类型')
  for (const 名 of 记忆关系类型们) { const 项 = document.createElement('option'); 项.value = 名; 项.textContent = 名; 类型选择.appendChild(项) }
  const 建立 = document.createElement('button'); 建立.textContent = '建立连接'; 建立.title = '再依次选择起点和终点卡片'
  const 全图 = document.createElement('button'); 全图.textContent = '回到全图'; 全图.title = '退出单张记忆聚焦并回到全图'
  const 帮助 = document.createElement('span'); 帮助.className = '关系图帮助'; 帮助.textContent = '点击卡片聚焦关联 · 拖动空白或滚轮滑动画布'
  工具.append(类型选择, 建立, 全图, 帮助)
  const 视口 = document.createElement('div'); 视口.className = '关系图视口'
  const 世界 = document.createElement('div'); 世界.className = '关系图世界'
  const 连线层 = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); 连线层.classList.add('关系图连线层'); 连线层.setAttribute('width', '2800'); 连线层.setAttribute('height', '6200'); 连线层.setAttribute('viewBox', '0 0 2800 6200')
  const 卡片层 = document.createElement('div'); 卡片层.className = '关系图卡片层'
  const 聚焦条 = document.createElement('div'); 聚焦条.className = '关系图聚焦条'; 聚焦条.hidden = true
  const 聚焦文字 = document.createElement('div'); 聚焦文字.className = '关系图聚焦文字'
  const 聚焦标题 = document.createElement('strong')
  const 聚焦说明 = document.createElement('span')
  聚焦文字.append(聚焦标题, 聚焦说明)
  const 退出聚焦按钮 = document.createElement('button'); 退出聚焦按钮.textContent = '×'; 退出聚焦按钮.setAttribute('aria-label', '退出记忆聚焦')
  聚焦条.append(聚焦文字, 退出聚焦按钮)
  世界.append(连线层, 卡片层); 视口.append(世界, 聚焦条); 壳.append(工具, 视口); 记忆管理列表.appendChild(壳)

  const 默认位置 = 默认关系图位置(节点们)
  const 已存视图 = 果.布局 && 果.布局.视图 || {}
  const 位置 = {}
  const 展示位置 = {}
  for (const 一 of 节点们) {
    位置[一.键] = { ...默认位置[一.键] }
    展示位置[一.键] = { ...默认位置[一.键] }
  }
  const 视图 = {
    x: Number.isFinite(Number(已存视图.x)) ? Number(已存视图.x) : 18,
    y: Number.isFinite(Number(已存视图.y)) ? Number(已存视图.y) : 18,
    缩放: 1,
  }
  const 卡宽 = 260, 卡高 = 132
  const 卡片映射 = new Map(), 节点映射 = new Map(节点们.map((一) => [一.键, 一]))
  const 全部关系 = [...候选关系.map((一) => ({ ...一, 候选: true })), ...关系们]
  let 连接起点 = null, 正在连接 = false, 编辑器 = null, 确认遮罩 = null, 焦点键 = '', 聚焦前视图 = null

  function 应用视图() {
    世界.style.transform = `translate(${视图.x}px, ${视图.y}px)`
  }
  function 保存关系图布局() {
    clearTimeout(关系图保存计时)
    关系图保存计时 = setTimeout(() => void window.爱莉.保存长期记忆图布局({ 节点: {}, 视图: { x: 视图.x, y: 视图.y, 缩放: 1 } }).catch(() => {}), 350)
  }
  function 关编辑器() { if (编辑器) 编辑器.remove(); 编辑器 = null }

  function 问关系图确认({ 标题, 正文, 确认文字 = '确认', 取消文字 = '取消' }) {
    return new Promise((完成) => {
      if (确认遮罩) 确认遮罩.remove()
      const 遮罩 = document.createElement('div'); 遮罩.className = '关系图确认遮罩'; 确认遮罩 = 遮罩
      const 卡 = document.createElement('section'); 卡.className = '关系图确认卡'; 卡.setAttribute('role', 'alertdialog'); 卡.setAttribute('aria-modal', 'true')
      const 图标 = document.createElement('div'); 图标.className = '关系图确认图标'; 图标.textContent = '◇'; 图标.setAttribute('aria-hidden', 'true')
      const 标题节点 = document.createElement('strong'); 标题节点.textContent = 标题
      const 正文节点 = document.createElement('p'); 正文节点.textContent = 正文
      const 操作 = document.createElement('div'); 操作.className = '关系图确认操作'
      const 取消 = document.createElement('button'); 取消.textContent = 取消文字
      const 确认 = document.createElement('button'); 确认.className = '危险'; 确认.textContent = 确认文字
      操作.append(取消, 确认); 卡.append(图标, 标题节点, 正文节点, 操作); 遮罩.appendChild(卡); 壳.appendChild(遮罩)
      const 收起 = (答案) => {
        if (确认遮罩 === 遮罩) 确认遮罩 = null
        遮罩.remove(); document.removeEventListener('keydown', 按键, true); 完成(答案)
      }
      const 按键 = (事件) => { if (事件.key === 'Escape') { 事件.preventDefault(); 收起(false) } }
      遮罩.addEventListener('click', (事件) => { if (事件.target === 遮罩) 收起(false) })
      取消.addEventListener('click', () => 收起(false)); 确认.addEventListener('click', () => 收起(true))
      document.addEventListener('keydown', 按键, true)
      requestAnimationFrame(() => 取消.focus({ preventScroll: true }))
    })
  }

  function 相关关系(键) { return 全部关系.filter((一) => 一.从键 === 键 || 一.到键 === 键) }
  function 关系另一端(关系, 键) { return 关系.从键 === 键 ? 关系.到键 : 关系.从键 }
  function 摆卡片(键) {
    const 卡 = 卡片映射.get(键), 点 = 展示位置[键]
    if (!卡 || !点) return
    卡.style.left = `${点.x}px`; 卡.style.top = `${点.y}px`
  }
  function 重置展示位置() {
    for (const 一 of 节点们) { 展示位置[一.键] = { ...位置[一.键] }; 摆卡片(一.键) }
  }

  function 居中到(键, 平滑 = true) {
    const 点 = 展示位置[键]
    if (!点) return
    世界.classList.toggle('平滑移动', 平滑)
    视图.x = 视口.clientWidth / 2 - 点.x - 卡宽 / 2
    视图.y = 视口.clientHeight / 2 - 点.y - 卡高 / 2
    应用视图()
    if (平滑) setTimeout(() => 世界.classList.remove('平滑移动'), 480)
  }

  function 设置卡片状态() {
    const 关联键 = new Set(相关关系(焦点键).map((一) => 关系另一端(一, 焦点键)))
    for (const [键, 卡] of 卡片映射) {
      卡.classList.toggle('选中记忆', !!焦点键 && 键 === 焦点键)
      卡.classList.toggle('关联记忆', !!焦点键 && 关联键.has(键))
      卡.classList.toggle('非关联记忆', !!焦点键 && 键 !== 焦点键 && !关联键.has(键))
      const 标签 = 卡.querySelector('.关系图关联标签')
      if (!标签) continue
      const 这张的关系 = 相关关系(焦点键).filter((一) => 关系另一端(一, 焦点键) === 键)
      标签.textContent = 这张的关系.map((一) => `${一.类型}${一.候选 ? ' · 建议' : 一.来源 === '自动整理' ? ' · 自动' : ''}`).join(' / ')
      标签.hidden = !这张的关系.length
    }
  }

  function 聚焦记忆(节点) {
    if (!节点 || 正在连接) return
    if (!焦点键) 聚焦前视图 = { x: 视图.x, y: 视图.y }
    焦点键 = 节点.键
    重置展示位置()
    const 关系 = 相关关系(焦点键)
    const 关联键们 = [...new Set(关系.map((一) => 关系另一端(一, 焦点键)).filter((键) => 节点映射.has(键)))]
    const 中心 = { x: 1280, y: 760 }
    展示位置[焦点键] = { ...中心 }
    const 数量 = 关联键们.length
    关联键们.forEach((键, i) => {
      let x, y
      if (数量 === 1) { x = 中心.x + 420; y = 中心.y }
      else if (数量 === 2) { x = 中心.x + (i === 0 ? -430 : 430); y = 中心.y }
      else {
        const 圈 = Math.floor(i / 8), 圈内数量 = Math.min(8, 数量 - 圈 * 8), 圈内序号 = i % 8
        const 角度 = -Math.PI / 2 + 圈内序号 * Math.PI * 2 / 圈内数量
        x = 中心.x + Math.cos(角度) * (430 + 圈 * 300)
        y = 中心.y + Math.sin(角度) * (245 + 圈 * 190)
      }
      展示位置[键] = { x, y }
    })
    for (const 一 of 节点们) 摆卡片(一.键)
    设置卡片状态()
    聚焦标题.textContent = String(节点.内容 || '').replace(/\s+/g, ' ').slice(0, 34) + (String(节点.内容 || '').length > 34 ? '…' : '')
    聚焦说明.textContent = 关联键们.length ? `${关联键们.length} 张直接关联记忆环绕显示` : '暂时没有直接关联，可使用“建立连接”补充'
    聚焦条.hidden = false
    壳.classList.add('聚焦模式')
    画线()
    requestAnimationFrame(() => 居中到(焦点键, true))
  }

  function 退出聚焦(恢复视图 = true) {
    if (!焦点键) return
    焦点键 = ''
    重置展示位置(); 设置卡片状态(); 聚焦条.hidden = true; 壳.classList.remove('聚焦模式'); 画线()
    if (恢复视图 && 聚焦前视图) {
      世界.classList.add('平滑移动'); 视图.x = 聚焦前视图.x; 视图.y = 聚焦前视图.y; 应用视图()
      setTimeout(() => 世界.classList.remove('平滑移动'), 480)
    }
    聚焦前视图 = null
  }

  function 显示关系编辑器(关系, 是候选 = false) {
    关编辑器()
    const 从 = 节点映射.get(关系.从键), 到 = 节点映射.get(关系.到键)
    if (!从 || !到) return
    编辑器 = document.createElement('aside'); 编辑器.className = '关系图编辑器'
    const 头 = document.createElement('div'); 头.className = '关系图编辑器头'
    const 是自动 = !是候选 && 关系.来源 === '自动整理'
    const 标题 = document.createElement('strong'); 标题.textContent = 是候选 ? '关系建议' : 是自动 ? '自动整理的关系' : '编辑关系'
    const 关闭 = document.createElement('button'); 关闭.textContent = '×'; 关闭.setAttribute('aria-label', '关闭关系编辑器'); 关闭.addEventListener('click', 关编辑器)
    头.append(标题, 关闭)
    const 摘要 = document.createElement('p'); 摘要.textContent = `${从.内容.slice(0, 42)}${从.内容.length > 42 ? '…' : ''}  →  ${到.内容.slice(0, 42)}${到.内容.length > 42 ? '…' : ''}`
    const 选择 = 类型选择.cloneNode(true); 选择.value = 关系.类型
    const 操作 = document.createElement('div'); 操作.className = '关系图编辑操作'
    const 保存 = document.createElement('button'); 保存.className = '主要'; 保存.textContent = 是候选 ? '采纳建议' : 是自动 ? '确认并保存' : '保存修改'
    保存.addEventListener('click', async () => {
      保存.disabled = true
      const 请求 = 是候选
        ? window.爱莉.新增长期记忆关系({ 类型: 选择.value, 从: 关系图端点(从), 到: 关系图端点(到) })
        : window.爱莉.修改长期记忆关系({ 编号: 关系.编号, 类型: 选择.value })
      const 结果 = await 请求.catch((错误) => ({ 好: false, 说明: 错误.message }))
      if (结果 && 结果.好) { 提示(是候选 ? '关系建议已采纳' : '关系已修改'); await 刷新长期记忆关系图() }
      else { 提示((结果 && 结果.说明) || '关系没有保存成功', '#c9779d'); 保存.disabled = false }
    })
    操作.appendChild(保存)
    if (!是候选) {
      const 删除 = document.createElement('button'); 删除.className = '危险'; 删除.textContent = '删除连接'
      删除.addEventListener('click', async () => {
        const 要删除 = await 问关系图确认({ 标题: '删除这条记忆关系？', 正文: '只会移除两张卡片之间的连接，记忆卡片和正文都会保留。', 确认文字: '删除连接', 取消文字: '先保留' })
        if (!要删除) return
        删除.disabled = true
        const 结果 = await window.爱莉.删除长期记忆关系(关系.编号).catch((错误) => ({ 好: false, 说明: 错误.message }))
        if (结果 && 结果.好) { 提示('关系已删除'); await 刷新长期记忆关系图() }
        else { 提示((结果 && 结果.说明) || '关系没有删除成功', '#c9779d'); 删除.disabled = false }
      })
      操作.appendChild(删除)
    } else {
      const 依据 = document.createElement('small'); 依据.textContent = `仅供确认：${关系.依据 || '本地规则发现内容可能相关'}`; 编辑器.append(头, 摘要, 选择, 依据, 操作); 壳.appendChild(编辑器); return
    }
    if (是自动) {
      const 依据 = document.createElement('small')
      const 自动 = 关系.自动依据 || {}
      依据.textContent = `本地规则自动整理 · 置信度 ${Math.round(Number(自动.置信度 || 0) * 100)}% · ${自动.依据 || '高置信关系'}`
      编辑器.append(头, 摘要, 选择, 依据, 操作)
    } else 编辑器.append(头, 摘要, 选择, 操作)
    壳.appendChild(编辑器)
  }

  function 画线() {
    连线层.replaceChildren()
    const 定义 = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
    const 箭头 = document.createElementNS('http://www.w3.org/2000/svg', 'marker')
    箭头.setAttribute('id', '记忆关系箭头'); 箭头.setAttribute('markerWidth', '7'); 箭头.setAttribute('markerHeight', '7'); 箭头.setAttribute('refX', '6'); 箭头.setAttribute('refY', '3.5'); 箭头.setAttribute('orient', 'auto'); 箭头.setAttribute('markerUnits', 'strokeWidth')
    const 箭形 = document.createElementNS('http://www.w3.org/2000/svg', 'path'); 箭形.setAttribute('d', 'M 0 0 L 7 3.5 L 0 7 z'); 箭形.setAttribute('fill', 'context-stroke')
    箭头.appendChild(箭形); 定义.appendChild(箭头); 连线层.appendChild(定义)
    const 成对总数 = new Map(), 成对序号 = new Map()
    for (const 一 of 全部关系) {
      const 对 = [一.从键, 一.到键].sort().join('|')
      成对总数.set(对, (成对总数.get(对) || 0) + 1)
    }
    for (const 一 of 全部关系) {
      const 起 = 展示位置[一.从键], 终 = 展示位置[一.到键]
      if (!起 || !终) continue
      const x1 = 起.x + 卡宽 / 2, y1 = 起.y + 卡高 / 2, x2 = 终.x + 卡宽 / 2, y2 = 终.y + 卡高 / 2
      const 弯 = Math.max(50, Math.abs(x2 - x1) * 0.38)
      const 对 = [一.从键, 一.到键].sort().join('|'), 序号 = 成对序号.get(对) || 0
      成对序号.set(对, 序号 + 1)
      const 偏移 = (序号 - (成对总数.get(对) - 1) / 2) * 34
      const 路径值 = `M ${x1} ${y1} C ${x1 + (x2 >= x1 ? 弯 : -弯)} ${y1 + 偏移}, ${x2 - (x2 >= x1 ? 弯 : -弯)} ${y2 + 偏移}, ${x2} ${y2}`
      const 组 = document.createElementNS('http://www.w3.org/2000/svg', 'g'); 组.classList.add('关系图连线'); if (一.候选) 组.classList.add('候选')
      组.dataset.从键 = 一.从键; 组.dataset.到键 = 一.到键
      if (焦点键) 组.classList.add(一.从键 === 焦点键 || 一.到键 === 焦点键 ? '焦点关系' : '淡出关系')
      const 线 = document.createElementNS('http://www.w3.org/2000/svg', 'path'); 线.setAttribute('d', 路径值); 线.setAttribute('stroke', 关系图关系颜色(一.类型)); 线.setAttribute('marker-end', 'url(#记忆关系箭头)')
      const 命中 = document.createElementNS('http://www.w3.org/2000/svg', 'path'); 命中.setAttribute('d', 路径值); 命中.classList.add('关系图连线命中')
      const 标签 = document.createElementNS('http://www.w3.org/2000/svg', 'text'); 标签.setAttribute('x', String((x1 + x2) / 2)); 标签.setAttribute('y', String((y1 + y2) / 2 + 偏移 * 0.75 - 7)); 标签.textContent = 一.候选 ? `${一.类型} · 建议` : 一.来源 === '自动整理' ? `${一.类型} · 自动` : 一.类型
      命中.addEventListener('click', (事件) => { 事件.stopPropagation(); 显示关系编辑器(一, !!一.候选) })
      标签.addEventListener('click', (事件) => { 事件.stopPropagation(); 显示关系编辑器(一, !!一.候选) })
      组.append(线, 命中, 标签); 连线层.appendChild(组)
    }
  }

  async function 选择连接卡片(节点, 卡) {
    if (!正在连接) return
    if (!连接起点) {
      连接起点 = 节点
      卡.classList.add('连接起点')
      建立.textContent = '请选择终点'
      return
    }
    if (连接起点.键 === 节点.键) return
    建立.disabled = true
    const 结果 = await window.爱莉.新增长期记忆关系({ 类型: 类型选择.value, 从: 关系图端点(连接起点), 到: 关系图端点(节点) }).catch((错误) => ({ 好: false, 说明: 错误.message }))
    if (结果 && 结果.好) { 提示(结果.没变化 ? '这条关系已经存在' : '关系已建立'); await 刷新长期记忆关系图() }
    else { 提示((结果 && 结果.说明) || '关系没有保存成功', '#c9779d'); 建立.disabled = false }
  }

  for (const 节点 of 节点们) {
    const 卡 = document.createElement('article'); 卡.className = `关系图卡片 类别-${节点.类别}`; 卡.dataset.键 = 节点.键
    const 头 = document.createElement('header')
    const 类别 = document.createElement('strong'); 类别.textContent = 节点.类别
    const 时间 = document.createElement('time'); 时间.textContent = 节点.事件时间 && 节点.事件时间.状态 === '明确' ? 节点.事件时间.开始 : '时间未确定'
    头.append(类别, 时间)
    const 正文 = document.createElement('p'); 正文.textContent = 节点.内容
    const 脚 = document.createElement('footer'); 脚.textContent = `${记忆类型名字[节点.记忆类型] || '记忆'}${节点.人物 ? ` · ${节点.人物}` : ''}`
    const 关联标签 = document.createElement('div'); 关联标签.className = '关系图关联标签'; 关联标签.hidden = true
    卡.append(头, 正文, 脚, 关联标签); 卡片层.appendChild(卡); 卡片映射.set(节点.键, 卡); 摆卡片(节点.键)
    卡.addEventListener('click', (事件) => {
      事件.stopPropagation()
      if (正在连接) void 选择连接卡片(节点, 卡)
      else if (焦点键 === 节点.键) 退出聚焦(true)
      else 聚焦记忆(节点)
    })
  }

  视口.addEventListener('wheel', (事件) => {
    事件.preventDefault()
    if (事件.shiftKey) 视图.x -= 事件.deltaY || 事件.deltaX
    else { 视图.x -= 事件.deltaX; 视图.y -= 事件.deltaY }
    世界.classList.remove('平滑移动'); 应用视图(); 保存关系图布局()
  }, { passive: false })
  视口.addEventListener('pointerdown', (事件) => {
    if (事件.button !== 0 || 事件.target.closest('.关系图卡片') || 事件.target.closest('.关系图连线')) return
    关编辑器(); 视口.setPointerCapture(事件.pointerId)
    世界.classList.remove('平滑移动')
    const 起 = { x: 事件.clientX, y: 事件.clientY, vx: 视图.x, vy: 视图.y }; let 动了 = false
    const 移动 = (e) => { if (Math.abs(e.clientX - 起.x) + Math.abs(e.clientY - 起.y) > 3) 动了 = true; 视图.x = 起.vx + e.clientX - 起.x; 视图.y = 起.vy + e.clientY - 起.y; 应用视图() }
    const 放开 = () => { 视口.removeEventListener('pointermove', 移动); 视口.removeEventListener('pointerup', 放开); 视口.removeEventListener('pointercancel', 放开); if (!动了 && 焦点键) 退出聚焦(true); else 保存关系图布局() }
    视口.addEventListener('pointermove', 移动); 视口.addEventListener('pointerup', 放开); 视口.addEventListener('pointercancel', 放开)
  })
  建立.addEventListener('click', () => {
    if (焦点键) {
      退出聚焦(false)
      视图.x = 18; 视图.y = 18; 应用视图()
    }
    正在连接 = !正在连接; 连接起点 = null; 建立.disabled = false; 建立.classList.toggle('选中', 正在连接); 建立.textContent = 正在连接 ? '请选择起点' : '建立连接'; 壳.classList.toggle('连接模式', 正在连接)
    for (const 卡 of 卡片映射.values()) 卡.classList.remove('连接起点')
  })
  全图.addEventListener('click', () => {
    if (焦点键) 退出聚焦(false)
    世界.classList.add('平滑移动'); 视图.x = 18; 视图.y = 18; 视图.缩放 = 1; 应用视图(); 保存关系图布局()
    setTimeout(() => 世界.classList.remove('平滑移动'), 480)
  })
  退出聚焦按钮.addEventListener('click', (事件) => { 事件.stopPropagation(); 退出聚焦(true) })
  应用视图(); 画线()
}

function 临时操作按钮(文字, 类名 = '') {
  const 按钮 = document.createElement('button')
  按钮.textContent = 文字
  if (类名) 按钮.className = 类名
  return 按钮
}

function 开始编辑临时记忆(卡, 一, 内容节点, 操作节点) {
  if (!一.编号 || 一.生命周期 !== '有效' || 卡.querySelector('.临时记忆编辑区')) return
  内容节点.hidden = true
  操作节点.hidden = true
  const 区 = document.createElement('div')
  区.className = '记忆编辑区 临时记忆编辑区'
  const 分类 = document.createElement('select')
  分类.setAttribute('aria-label', '修改临时记忆分类')
  for (const 名 of 临时分类们) {
    const 项 = document.createElement('option')
    项.value = 名
    项.textContent = 名
    项.selected = 名 === 一.类别
    分类.appendChild(项)
  }
  const 输入框 = document.createElement('textarea')
  输入框.maxLength = 4000
  输入框.value = 一.内容 || ''
  输入框.setAttribute('aria-label', '修改临时记忆内容')
  const 标签 = document.createElement('input')
  标签.maxLength = 500
  标签.value = Array.isArray(一.标签) ? 一.标签.join('，') : ''
  标签.placeholder = '标签，用逗号分开'
  标签.setAttribute('aria-label', '临时记忆标签')
  const 到期 = document.createElement('input')
  到期.type = 'datetime-local'
  到期.value = 输入框日期时间(一.到期于)
  到期.setAttribute('aria-label', '临时记忆到期时间')
  const 重要性 = 重要性选择(一.重要性)
  const 记忆类型 = 记忆类型选择(一.记忆类型)
  const 字段 = document.createElement('div')
  字段.className = '临时记忆编辑字段'
  字段.append(分类, 记忆类型, 重要性, 到期, 标签)
  const 按钮区 = document.createElement('div')
  按钮区.className = '记忆编辑按钮'
  const 保存 = 临时操作按钮('保存', '记忆保存')
  const 取消 = 临时操作按钮('取消')
  按钮区.append(保存, 取消)
  区.append(字段, 输入框, 按钮区)
  卡.appendChild(区)

  const 收起 = () => { 区.remove(); 内容节点.hidden = false; 操作节点.hidden = false }
  取消.addEventListener('click', 收起)
  保存.addEventListener('click', async () => {
    const 正文 = 输入框.value.trim()
    if (!正文) return 记忆卡提示(卡, '临时记忆内容不能为空。', true)
    if (!到期.value) return 记忆卡提示(卡, '请填写到期时间。', true)
    保存.disabled = true
    取消.disabled = true
    try {
      const 果 = await window.爱莉.修改临时记忆({
        编号: 一.编号,
        内容: 正文,
        类别: 分类.value,
        记忆类型: 记忆类型.value,
        重要性: Number(重要性.value),
        标签: 标签数组(标签.value),
        到期于: new Date(到期.value).toISOString(),
      })
      if (!果 || !果.好) {
        记忆卡提示(卡, (果 && 果.说明) || '没有保存成功。', true)
        保存.disabled = false
        取消.disabled = false
        return
      }
      await 刷新临时记忆()
    } catch (错误) {
      记忆卡提示(卡, '保存失败：' + 错误.message, true)
      保存.disabled = false
      取消.disabled = false
    }
  })
  输入框.focus({ preventScroll: true })
  输入框.setSelectionRange(输入框.value.length, 输入框.value.length)
}

function 画临时记忆(果) {
  记忆管理列表.replaceChildren()
  if (!果 || !果.好) {
    记忆管理统计.textContent = (果 && 果.说明) || '暂时读不到'
    const 空 = document.createElement('div')
    空.className = '记忆管理空态'
    空.textContent = '临时记忆暂时读不到。'
    记忆管理列表.appendChild(空)
    return
  }
  const 条们 = Array.isArray(果.列表) ? 果.列表 : []
  记忆管理统计.textContent = `找到 ${果.总数 || 0} 条 · 仅已确认且相关的有效记录可用于聊天${果.截断 ? ' · 先显示最近 500 条' : ''}`
  if (!条们.length) {
    const 空 = document.createElement('div')
    空.className = '记忆管理空态'
    空.textContent = 记忆搜索.value.trim() || 临时记忆分类.value || 临时记忆确认状态.value
      ? '没有符合条件的临时记忆。'
      : '还没有临时记忆。可以手动新增，后续也会由后台提取。'
    记忆管理列表.appendChild(空)
    return
  }

  for (const 一 of 条们) {
    const 卡 = document.createElement('article')
    卡.className = '记忆卡 临时记忆卡'
    const 头 = document.createElement('div')
    头.className = '记忆卡头'
    const 类别 = document.createElement('strong')
    类别.textContent = `${一.类别 || '临时记忆'} · ${记忆类型名字[一.记忆类型] || 一.记忆类型 || '类型未记录'}`
    const 状态组 = document.createElement('div')
    状态组.className = '临时记忆状态组'
    const 生命周期 = document.createElement('span')
    生命周期.className = `临时状态 ${一.生命周期 || ''}`
    生命周期.textContent = 一.生命周期 || '状态未知'
    const 确认 = document.createElement('span')
    确认.className = `临时状态 ${一.确认状态 || ''}`
    确认.textContent = 一.确认状态 || '确认状态未知'
    const 重要 = document.createElement('span')
    const 重要级 = Number.isInteger(Number(一.重要性)) ? Math.max(0, Math.min(3, Number(一.重要性))) : 1
    重要.className = `临时状态 重要性-${重要级}`
    重要.textContent = `${重要性名字[重要级]} ${重要级}`
    状态组.append(生命周期, 确认, 重要)
    const 关系状态 = 一.关系 && 一.关系.状态 || '当前'
    if (关系状态 !== '当前' || (一.关系 && Array.isArray(一.关系.替代编号) && 一.关系.替代编号.length)) {
      const 关系徽章 = document.createElement('span')
      关系徽章.className = `临时状态 关系-${关系状态}`
      关系徽章.textContent = 关系状态 === '待处理' ? '可能冲突' : 关系状态 === '已被替代' ? '已被替代' : '当前更正'
      状态组.appendChild(关系徽章)
    }
    头.append(类别, 状态组)

    const 内容 = document.createElement('div')
    内容.className = '记忆内容'
    内容.textContent = 一.内容 || ''
    if (Array.isArray(一.标签) && 一.标签.length) {
      const 标签 = document.createElement('div')
      标签.className = '临时记忆标签'
      for (const 名 of 一.标签) {
        const 一个 = document.createElement('span')
        一个.textContent = 名
        标签.appendChild(一个)
      }
      内容.appendChild(标签)
    }

    const 来源 = document.createElement('div')
    来源.className = '记忆来源'
    const 方式 = 一.来源 && 一.来源.提取方式 ? 一.来源.提取方式 : '来源未记录'
    const 会话 = 一.来源 && 一.来源.对话 ? ` · 会话 ${一.来源.对话}` : ' · 会话来源未记录'
    const 到期 = 一.生命周期 === '已归档'
      ? ` · 归档于 ${显示日期时间(一.归档于)}`
      : 一.生命周期 === '已晋升'
        ? ` · 已晋升到${一.晋升 && 一.晋升.去向 || '长期记忆'}`
        : ` · 到期 ${显示日期时间(一.到期于)}`
    const 人物信息 = 一.元数据 ? ` · 关于${一.元数据.person || '人物未记录'}（${一.元数据.relationship || '关系未记录'}）` : ''
    const 记录缘由 = 一.元数据 && 一.元数据.backstory ? ` · ${一.元数据.backstory}` : ''
    const 自主说明 = 一.自主评估 && 一.自主评估.分数
      ? ` · 自动评估 ${一.自主评估.分数} 分（${(一.自主评估.依据 || []).join('；')}）`
      : 一.评估账本 && Number.isFinite(Number(一.评估账本.当前分数))
        ? ` · 当前评估 ${一.评估账本.当前分数} 分（累计 ${一.评估账本.提及次数 || 0} 次，${一.评估账本.最近决定 || '继续观察'}）`
      : ''
    来源.textContent = `${方式}${人物信息}${记录缘由}${自主说明}${会话}${到期}`

    let 关系说明 = null
    if (关系状态 === '待处理' || 关系状态 === '已被替代' || (一.关系 && 一.关系.替代编号 && 一.关系.替代编号.length)) {
      关系说明 = document.createElement('div')
      关系说明.className = `临时记忆关系 关系-${关系状态}`
      const 关联内容 = String(一.关系 && 一.关系.关联内容 || '').trim()
      if (关系状态 === '待处理') {
        关系说明.textContent = `可能更正旧记忆：${关联内容 || '关联内容暂时不可见'}。决定前，新候选不会进入聊天。`
      } else if (关系状态 === '已被替代') {
        关系说明.textContent = `已由新记忆替代：${关联内容 || '关联内容暂时不可见'}。本条保留用于追溯，不再召回。`
      } else {
        关系说明.textContent = `这是当前版本，已替代旧记忆：${关联内容 || '关联内容暂时不可见'}。删除本条会自动恢复仍存在的旧条。`
      }
    }

    const 操作 = document.createElement('div')
    操作.className = '记忆操作'
    if (一.生命周期 === '有效' && 关系状态 !== '已被替代') {
      const 编辑 = 临时操作按钮('编辑')
      编辑.addEventListener('click', () => 开始编辑临时记忆(卡, 一, 内容, 操作))
      操作.appendChild(编辑)
      if (关系状态 === '待处理') {
        const 替代 = 临时操作按钮('替代旧条', '确认临时记忆')
        const 并存 = 临时操作按钮('两条并存')
        const 做决定 = async (选择) => {
          const 旧内容 = String(一.关系 && 一.关系.关联内容 || '').replace(/\s+/g, ' ').slice(0, 80)
          const 提问 = 选择 === '替代旧条'
            ? `确认用当前候选替代旧记忆？\n旧：${旧内容 || '关联内容暂时不可见'}\n旧条会保留用于追溯，但不再进入召回。`
            : '确认两条内容都成立？\n当前候选会被确认，两条记忆以后都可以参与召回。'
          if (!window.confirm(提问)) return
          替代.disabled = true
          并存.disabled = true
          const 果 = await window.爱莉.处理临时记忆关系({ 编号: 一.编号, 选择 }).catch((错误) => ({ 好: false, 说明: 错误.message }))
          if (果 && 果.好) { 提示(选择 === '替代旧条' ? '已切换到新的记忆版本' : '已保留两条记忆'); await 刷新临时记忆() }
          else { 记忆卡提示(卡, (果 && 果.说明) || '关系没有处理成功。', true); 替代.disabled = false; 并存.disabled = false }
        }
        替代.addEventListener('click', () => 做决定('替代旧条'))
        并存.addEventListener('click', () => 做决定('两条并存'))
        操作.append(替代, 并存)
      } else if (一.确认状态 === '待确认') {
        const 确认按钮 = 临时操作按钮('确认', '确认临时记忆')
        确认按钮.addEventListener('click', async () => {
          确认按钮.disabled = true
          const 果 = await window.爱莉.修改临时记忆({ 编号: 一.编号, 确认状态: '已确认' }).catch((错误) => ({ 好: false, 说明: 错误.message }))
          if (果 && 果.好) await 刷新临时记忆()
          else { 记忆卡提示(卡, (果 && 果.说明) || '确认失败。', true); 确认按钮.disabled = false }
        })
        操作.appendChild(确认按钮)
      } else {
        const 去向 = document.createElement('select')
        去向.className = '临时晋升去向'
        去向.setAttribute('aria-label', '晋升去向')
        for (const 名 of ['事实', '经历', '小本子']) {
          const 项 = document.createElement('option'); 项.value = 名; 项.textContent = 名; 去向.appendChild(项)
        }
        const 晋升 = 临时操作按钮('晋升', '晋升临时记忆')
        晋升.addEventListener('click', async () => {
          if (!window.confirm(`把这条临时记忆晋升到“${去向.value}”？\n晋升后会进入长期记忆，并从有效临时记忆中移出。`)) return
          晋升.disabled = true
          去向.disabled = true
          const 果 = await window.爱莉.晋升临时记忆(一.编号, 去向.value).catch((错误) => ({ 好: false, 说明: 错误.message }))
          if (果 && 果.好) { 提示(`已晋升到${去向.value}`); await 刷新临时记忆() }
          else { 记忆卡提示(卡, (果 && 果.说明) || '晋升失败。', true); 晋升.disabled = false; 去向.disabled = false }
        })
        操作.append(去向, 晋升)
      }
    } else if (一.生命周期 === '已归档') {
      const 恢复 = 临时操作按钮('恢复 7 天', '恢复临时记忆')
      恢复.addEventListener('click', async () => {
        恢复.disabled = true
        const 果 = await window.爱莉.恢复临时记忆(一.编号, 7).catch((错误) => ({ 好: false, 说明: 错误.message }))
        if (果 && 果.好) await 刷新临时记忆()
        else { 记忆卡提示(卡, (果 && 果.说明) || '恢复失败。', true); 恢复.disabled = false }
      })
      操作.appendChild(恢复)
    }
    const 删除 = 临时操作按钮('删除', '遗忘记忆')
    删除.addEventListener('click', async () => {
      const 摘要 = String(一.内容 || '').replace(/\s+/g, ' ').slice(0, 48)
      if (!window.confirm(`删除这条临时记忆？\n“${摘要}${String(一.内容 || '').length > 48 ? '…' : ''}”`)) return
      删除.disabled = true
      const 果 = await window.爱莉.删除临时记忆(一.编号).catch((错误) => ({ 好: false, 说明: 错误.message }))
      if (果 && 果.好) await 刷新临时记忆()
      else { 记忆卡提示(卡, (果 && 果.说明) || '删除失败。', true); 删除.disabled = false }
    })
    操作.appendChild(删除)
    卡.append(头, 内容, 来源)
    if (关系说明) 卡.appendChild(关系说明)
    卡.appendChild(操作)
    记忆管理列表.appendChild(卡)
  }
}

async function 刷新临时记忆() {
  const 这次 = ++记忆请求号
  记忆管理统计.textContent = '读取中……'
  try {
    const 果 = await window.爱莉.问临时记忆({
      类别: 临时记忆分类.value,
      生命周期: 临时记忆生命周期.value,
      确认状态: 临时记忆确认状态.value,
      搜索: 记忆搜索.value,
    })
    if (这次 === 记忆请求号) 画临时记忆(果)
  } catch (错误) {
    if (这次 === 记忆请求号) 画临时记忆({ 好: false, 说明: 错误.message })
  }
}

function 画记忆日记(果) {
  记忆管理列表.replaceChildren()
  if (!果 || !果.好) {
    记忆管理统计.textContent = (果 && 果.说明) || '暂时读不到'
    const 空 = document.createElement('div')
    空.className = '记忆管理空态'
    空.textContent = '日记档案暂时读不到。'
    记忆管理列表.appendChild(空)
    return
  }
  const 条们 = Array.isArray(果.列表) ? 果.列表 : []
  记忆管理统计.textContent = `找到 ${果.总数 || 0} 个周期 · 日记不会自动进入聊天上下文${果.截断 ? ' · 先显示最近 200 个' : ''}`
  if (!条们.length) {
    const 空 = document.createElement('div')
    空.className = '记忆管理空态'
    空.textContent = 记忆搜索.value.trim() || 当前日记类型 ? '没有符合条件的日记。' : '还没有日记。后台会在跨日或跨周后自动整理。'
    记忆管理列表.appendChild(空)
    return
  }

  for (const 一 of 条们) {
    const 卡 = document.createElement('article')
    卡.className = `记忆卡 日记卡 日记状态-${一.状态 || '未知'}`
    const 头 = document.createElement('div')
    头.className = '记忆卡头 日记卡头'
    const 标题区 = document.createElement('div')
    const 标题 = document.createElement('strong')
    标题.textContent = 一.标题 || `${一.周期 || '未标日期'}${一.类型 === '周' ? ' 周记' : ' 日记'}`
    const 周期 = document.createElement('div')
    周期.className = '日记周期'
    周期.textContent = `${一.周期 || '周期未记录'}${一.生成于 ? ` · 生成于 ${显示日期时间(一.生成于)}` : ''}${一.用户修改 ? ` · 人工修改${一.修改于 ? ` ${显示日期时间(一.修改于)}` : ''}` : ''}`
    标题区.append(标题, 周期)
    const 状态 = document.createElement('span')
    状态.className = `日记状态 ${一.状态 || ''}`
    状态.textContent = 一.状态 || '状态未知'
    头.append(标题区, 状态)
    卡.appendChild(头)

    if (Array.isArray(一.模块) && 一.模块.length) {
      const 来源表 = new Map((Array.isArray(一.来源) ? 一.来源 : []).map((来源) => [来源.编号, 来源]))
      for (const 模块 of 一.模块) {
        const 区 = document.createElement('section')
        区.className = '日记模块'
        const 名 = document.createElement('h3')
        名.textContent = 模块.名字 || '回顾'
        const 正文 = document.createElement('div')
        正文.className = '日记正文'
        正文.textContent = 模块.正文 || ''
        区.append(名, 正文)

        const 引用们 = Array.isArray(模块.来源) ? 模块.来源 : []
        if (引用们.length) {
          const 详情 = document.createElement('details')
          详情.className = '日记来源详情'
          const 摘要 = document.createElement('summary')
          摘要.textContent = `查看来源（${引用们.length}）`
          详情.appendChild(摘要)
          for (const 编号 of 引用们) {
            const 来源 = 来源表.get(编号)
            const 行 = document.createElement('div')
            行.className = '日记来源条'
            if (来源) {
              const 来源头 = document.createElement('strong')
              来源头.textContent = `${来源.类型 || '来源'}${来源.时间 ? ` · ${来源.时间}` : ''}${来源.标题 ? ` · ${来源.标题}` : ''}`
              const 来源摘要 = document.createElement('p')
              来源摘要.textContent = 来源.摘要 || '这条来源没有保存摘要。'
              行.append(来源头, 来源摘要)
            } else {
              行.textContent = `来源编号：${编号}`
            }
            详情.appendChild(行)
          }
          区.appendChild(详情)
        }
        卡.appendChild(区)
      }
    } else {
      const 说明 = document.createElement('div')
      说明.className = '日记空周期'
      说明.textContent = 一.说明 || '这个周期还没有可显示的内容。'
      卡.appendChild(说明)
    }
    if (一.状态 === '已完成') {
      const 操作 = document.createElement('div')
      操作.className = '记忆操作 日记操作'
      const 编辑 = 临时操作按钮('编辑')
      const 删除 = 临时操作按钮('删除', '遗忘记忆')
      编辑.addEventListener('click', () => 开始编辑日记(卡, 一))
      删除.addEventListener('click', () => void 删除一篇日记(卡, 一, 删除))
      操作.append(编辑, 删除)
      卡.appendChild(操作)
    }
    记忆管理列表.appendChild(卡)
  }
}

function 开始编辑日记(卡, 日记) {
  if (卡.querySelector('.日记编辑区')) return
  const 表单 = document.createElement('div')
  表单.className = '记忆编辑区 日记编辑区'
  const 标题 = document.createElement('input')
  标题.type = 'text'; 标题.maxLength = 120; 标题.value = 日记.标题 || ''; 标题.placeholder = '日记标题'; 标题.setAttribute('aria-label', '日记标题')
  表单.appendChild(标题)
  const 编辑模块们 = []
  for (const 模块 of (Array.isArray(日记.模块) ? 日记.模块 : [])) {
    const 区 = document.createElement('label')
    区.className = '日记编辑模块'
    const 名 = document.createElement('span')
    名.textContent = `${模块.名字}（清空正文会移除这一模块）`
    const 正文 = document.createElement('textarea')
    正文.maxLength = 4000; 正文.value = 模块.正文 || ''; 正文.setAttribute('aria-label', `${模块.名字}正文`)
    区.append(名, 正文); 表单.appendChild(区)
    编辑模块们.push({ 名字: 模块.名字, 正文, 来源: Array.isArray(模块.来源) ? 模块.来源.slice() : [] })
  }
  const 操作 = document.createElement('div')
  操作.className = '记忆编辑按钮'
  const 保存 = 临时操作按钮('保存', '记忆保存')
  const 取消 = 临时操作按钮('取消')
  操作.append(保存, 取消); 表单.appendChild(操作); 卡.appendChild(表单)
  取消.addEventListener('click', () => 表单.remove())
  保存.addEventListener('click', async () => {
    const 模块 = 编辑模块们.filter((一) => 一.正文.value.trim()).map((一) => ({ 名字: 一.名字, 正文: 一.正文.value, 来源: 一.来源 }))
    if (!标题.value.trim()) return 记忆卡提示(表单, '标题不能为空。', true)
    if (!模块.length) return 记忆卡提示(表单, '至少保留一个有正文的模块。', true)
    保存.disabled = true
    const 果 = await window.爱莉.修改记忆日记({ 编号: 日记.编号, 版本标记: 日记.版本标记, 标题: 标题.value, 模块 }).catch((错误) => ({ 好: false, 说明: 错误.message }))
    if (果 && 果.好) { 提示('日记已保存，后台不会覆盖人工修改'); await 刷新记忆日记() }
    else { 记忆卡提示(表单, (果 && 果.说明) || '日记没有保存成功。', true); 保存.disabled = false }
  })
  标题.focus({ preventScroll: true }); 标题.select()
}

async function 删除一篇日记(卡, 日记, 按钮) {
  if (按钮.disabled) return
  按钮.disabled = true
  const 果 = await window.爱莉.删除记忆日记({ 编号: 日记.编号, 版本标记: 日记.版本标记, 标题: 日记.标题 }).catch((错误) => ({ 好: false, 说明: 错误.message }))
  if (果 && 果.好) { 提示('日记已删除，这一周期不会被后台重新生成'); await 刷新记忆日记() }
  else if (!(果 && 果.取消了)) 记忆卡提示(卡, (果 && 果.说明) || '日记没有删除成功。', true)
  按钮.disabled = false
}

async function 刷新记忆日记() {
  const 这次 = ++记忆请求号
  记忆管理统计.textContent = '读取中……'
  try {
    const 果 = await window.爱莉.问记忆日记({ 类型: 当前日记类型, 搜索: 记忆搜索.value })
    if (这次 === 记忆请求号) 画记忆日记(果)
  } catch (错误) {
    if (这次 === 记忆请求号) 画记忆日记({ 好: false, 说明: 错误.message })
  }
}

function 刷新记忆管理() {
  if (当前记忆层 === '临时') return 刷新临时记忆()
  if (当前记忆层 === '日记') return 刷新记忆日记()
  return 刷新长期记忆()
}

function 新增临时记忆表单() {
  if (记忆管理列表.querySelector('.临时新增表单')) return
  const 卡 = document.createElement('article')
  卡.className = '记忆卡 临时新增表单 记忆编辑区'
  const 分类 = document.createElement('select')
  for (const 名 of 临时分类们) { const 项 = document.createElement('option'); 项.value = 名; 项.textContent = 名; 分类.appendChild(项) }
  const 天数 = document.createElement('input')
  天数.type = 'number'; 天数.min = '1'; 天数.max = '30'; 天数.value = '7'; 天数.title = '保留天数（1–30）'; 天数.setAttribute('aria-label', '保留天数')
  const 标签 = document.createElement('input')
  标签.maxLength = 500; 标签.placeholder = '标签，用逗号分开'
  const 重要性 = 重要性选择(1)
  const 记忆类型 = 记忆类型选择('semantic')
  分类.addEventListener('change', () => {
    记忆类型.value = ['近期计划', '未完话题', '近期事件'].includes(分类.value) ? 'episodic' : 'semantic'
  })
  const 字段 = document.createElement('div')
  字段.className = '临时记忆编辑字段'; 字段.append(分类, 记忆类型, 重要性, 天数, 标签)
  const 正文 = document.createElement('textarea')
  正文.maxLength = 4000; 正文.placeholder = '写下近期状态、计划或还没聊完的事……'; 正文.setAttribute('aria-label', '新临时记忆内容')
  const 操作 = document.createElement('div')
  操作.className = '记忆编辑按钮'
  const 保存 = 临时操作按钮('保存', '记忆保存')
  const 取消 = 临时操作按钮('取消')
  操作.append(保存, 取消)
  卡.append(字段, 正文, 操作)
  记忆管理列表.prepend(卡)
  取消.addEventListener('click', () => 卡.remove())
  保存.addEventListener('click', async () => {
    if (!正文.value.trim()) return 记忆卡提示(卡, '请先写下内容。', true)
    保存.disabled = true
    const 果 = await window.爱莉.新增临时记忆({
      类别: 分类.value, 记忆类型: 记忆类型.value, 内容: 正文.value, 保留天数: Number(天数.value), 重要性: Number(重要性.value), 标签: 标签数组(标签.value),
    }).catch((错误) => ({ 好: false, 说明: 错误.message }))
    if (果 && 果.好) await 刷新临时记忆()
    else { 记忆卡提示(卡, (果 && 果.说明) || '没有保存成功。', true); 保存.disabled = false }
  })
  正文.focus({ preventScroll: true })
}

function 开记忆管理() {
  记忆管理遮罩.classList.remove('收着')
  记忆管理遮罩.setAttribute('aria-hidden', 'false')
  void 刷新记忆管理()
  setTimeout(() => 记忆搜索.focus(), 0)
}

function 关记忆管理() {
  记忆管理遮罩.classList.add('收着')
  记忆管理遮罩.setAttribute('aria-hidden', 'true')
}

async function 导出全部长期记忆() {
  if (记忆导出.disabled) return
  const 原文字 = 记忆导出.textContent
  记忆导出.disabled = true
  记忆导出.textContent = '导出中…'
  try {
    const 果 = await window.爱莉.导出长期记忆()
    if (果 && 果.好) 提示(`已导出 ${果.条数 || 0} 条长期记忆`)
    else if (!(果 && 果.取消了)) 提示((果 && 果.说明) || '长期记忆没有导出成功', '#c9779d')
  } catch (错误) {
    提示('长期记忆没有导出成功：' + 错误.message, '#c9779d')
  } finally {
    记忆导出.disabled = false
    记忆导出.textContent = 原文字
  }
}

async function 导出全部记忆日记() {
  if (记忆导出.disabled) return
  const 原文字 = 记忆导出.textContent
  记忆导出.disabled = true
  记忆导出.textContent = '导出中…'
  try {
    const 果 = await window.爱莉.导出记忆日记()
    if (果 && 果.好) 提示(`已导出 ${果.条数 || 0} 篇记忆日记`)
    else if (!(果 && 果.取消了)) 提示((果 && 果.说明) || '记忆日记没有导出成功', '#c9779d')
  } catch (错误) {
    提示('记忆日记没有导出成功：' + 错误.message, '#c9779d')
  } finally {
    记忆导出.disabled = false
    记忆导出.textContent = 原文字
  }
}

async function 清空全部长期记忆() {
  if (记忆清空.disabled) return
  const 原文字 = 记忆清空.textContent
  记忆清空.disabled = true
  记忆清空.textContent = '处理中…'
  try {
    const 果 = await window.爱莉.清空长期记忆()
    if (果 && 果.好) {
      提示(果.没变化 ? '长期记忆本来就是空的' : `已清空 ${果.条数 || 0} 条长期记忆，并保留清空前备份`)
      await 刷新长期记忆()
    } else if (!(果 && 果.取消了)) {
      提示((果 && 果.说明) || '长期记忆没有清空成功', '#c9779d')
    }
  } catch (错误) {
    提示('长期记忆没有清空成功：' + 错误.message, '#c9779d')
  } finally {
    记忆清空.disabled = false
    记忆清空.textContent = 原文字
  }
}

/**
 * 工作模式的第一道门。
 * 这张卡完全由本地界面生成，不多请求一次模型。只有点了“开始”才提交原请求。
 */
function 弹工作任务卡(文字, 附件们, 来自语音 = false) {
  收开场()
  const 任务工作区 = 当前工作区 || null

  const 条 = document.createElement('div')
  条.className = '一条 工作任务卡'
  const 框 = document.createElement('div')
  框.className = '工作任务框'
  const 标题 = document.createElement('div')
  标题.className = '工作任务标题'
  标题.textContent = '工作任务确认'
  const 状态字 = document.createElement('div')
  状态字.className = '工作任务状态'

  const 字段 = (名字, 内容) => {
    const 一项 = document.createElement('div')
    一项.className = '工作任务字段'
    const 名 = document.createElement('span')
    名.className = '工作任务字段名'
    名.textContent = 名字
    const 值 = document.createElement('span')
    值.className = '工作任务字段值'
    值.textContent = 内容
    一项.append(名, 值)
    return 一项
  }

  const 附件说明 = 附件们.length ? `；附件 ${附件们.length} 个` : ''
  const 按钮们 = document.createElement('div')
  按钮们.className = '工作任务按钮'
  const 开始 = document.createElement('button')
  开始.className = '开始任务'
  开始.textContent = '开始'
  const 取消 = document.createElement('button')
  取消.className = '取消任务'
  取消.textContent = '取消'
  按钮们.append(开始, 取消)

  框.append(
    标题,
    状态字,
    字段('目标', 文字 || '处理已附上的文件'),
    字段('范围', `当前这段工作对话${附件说明}`),
    字段('工作目录', 任务工作区 || '默认（爱莉希雅工作区）'),
    字段('风险动作', '新建、覆盖文件或运行命令时，会再逐项请求确认'),
    字段('预计产物', '实际文件、命令结果或可核对的结论'),
    按钮们,
  )
  条.appendChild(框)
  聊天区.appendChild(条)
  滚到底()

  const 任务 = { 条, 状态字, 状态: '待确认' }
  当前工作任务 = 任务
  改工作任务状态(任务, '待确认')

  取消.addEventListener('click', () => {
    开始.disabled = true
    取消.disabled = true
    附件们.length = 0
    改工作任务状态(任务, '已取消')
    if (当前工作任务 === 任务) 当前工作任务 = null
  })

  开始.addEventListener('click', async () => {
    开始.disabled = true
    取消.disabled = true
    if (当前模式 !== 'work' || (当前工作区 || null) !== 任务工作区) {
      附件们.length = 0
      改工作任务状态(任务, '失败', '模式或工作目录已变化，请重新提交')
      if (当前工作任务 === 任务) 当前工作任务 = null
      return
    }
    改工作任务状态(任务, '执行中')
    const 回执 = await 说一句(文字, { 已确认工作: true, 附件们, 来自语音 })
    附件们.length = 0
    const 成功 = !!(回执 && 回执.成功)
    const 最终状态 = 回执 && 回执.已停止 ? '已取消' : 成功 ? (回执.工作状态 || '已完成') : '失败'
    const 最终说明 = 最终状态 === '部分完成' ? '部分工具没有成功，请检查回复' : 最终状态 === '失败' ? '请检查下方结果' : '结果已返回'
    改工作任务状态(任务, 最终状态, 最终说明)
    if (回执 && 回执.工作索引编号) void 刷新工作索引()
    if (当前工作任务 === 任务) 当前工作任务 = null
  })
}

async function 说一句(话, 选项 = {}) {
  const 文字 = (话 !== undefined ? 话 : 输入.value).trim()
  const 已确认工作 = Boolean(选项.已确认工作)
  const 来自语音 = Boolean(选项.来自语音 || (话 === undefined && 输入含语音草稿))
  const 带上的 = 选项.附件们 ? 选项.附件们.slice() : 待发的.slice()
  let 自动只读工作 = false
  // 【只有附件、一个字没打，也算数】他看到个东西想让她看，不一定有话说。
  if ((!文字 && !带上的.length) || 她正在说) return
  if (
    当前模式 === 'work' &&
    !已确认工作 &&
    当前工作任务 &&
    ['待确认', '执行中', '等待权限'].includes(当前工作任务.状态)
  ) {
    提示('先确认或取消上一张工作任务卡')
    return false
  }

  if (当前模式 === 'work' && !已确认工作) {
    try {
      const 判断 = await window.爱莉.判断只读工作(文字)
      自动只读工作 = !!(判断 && 判断.只读)
    } catch {
      // 判断失败时按普通工作处理，继续显示任务确认卡。
      自动只读工作 = false
    }
  }

  if (!已确认工作) {
    输入.value = ''
    输入含语音草稿 = false
    输入.style.height = 'auto'

    // 界面上先把这一条画出来（带上附件的样子）。
    // 【这里给的显示名是"原名"】主进程存盘时会在前面加一截时间戳防重名，
    //   但那是存盘用的；重画记录时会自动把那截去掉，所以前后看着一样。
    加一条(
      '他的',
      文字,
      带上的.map((x) => ({
        显示名: x.名字,
        存成: '',
        大小字: 人话大小(x.大小),
        是图片: x.是图片,
        预览: x.预览,
      })),
    )
    清空待发()

    if (当前模式 === 'work' && !自动只读工作) {
      弹工作任务卡(文字, 带上的, 来自语音)
      return false
    }
  }

  她正在说 = true
  发送按钮.classList.add('停止中')
  发送按钮.textContent = '■'
  发送按钮.title = '停止当前回复或任务'
  发送按钮.setAttribute('aria-label', '停止当前回复或任务')
  状态.textContent = '她在想…'

  // 新回复会取消上一轮尚未播放完的句子。声音关闭时也清掉旧队列，
  // 避免稍后重新打开声音却突然念出上一轮内容。
  if (要出声) 流式朗读.开始()
  else 流式朗读.取消()

  加一个在打字()

  try {
    // 一边生成一边显示：主进程每收到一小段就通过"她说到一半"送过来，
    // 那个回调会开一个气泡并把它记在 流式把手 里。
    const 结果 = await window.爱莉.说话(
      文字,
      // 只把这些给主进程 —— 预览地址、是图片这些是界面自己的事，不用搬过去
      带上的.map((x) => ({ 名字: x.名字, 类型: x.类型, 字节: x.字节 })),
      { 已确认工作, 来自语音 },
    )

    if (结果.成功) 收起故障()
    收下工具记录(结果.工具记录)
    const 被权限挡住 = 权限故障(结果.工具记录)
    if (被权限挡住) 显示故障(被权限挡住)

    // 三个点收走。要是她一个字都没吐出来（出错、或者回空），
    // 那就现在补一个气泡，别让界面白等着。
    const 点 = 聊天区.querySelector('.在打字')
    if (点) 点.remove()

    if (结果.已停止) {
      const 已有 = 流式把手 ? String(流式把手.读文字() || '').trim() : ''
      const 停止文字 = 已有 ? 已有 + '\n\n（已停止）' : '（已停止）'
      if (流式把手) 流式把手.改文字(停止文字)
      else 加一条('她的', 停止文字)
      流式把手 = null
      流式朗读.取消()
      状态.textContent = '在的'
      提示('已停止当前回复')
      return { 成功: false, 已停止: true }
    }

    const 显示文字 = 结果.成功 ? 结果.她说的话 : '（' + 结果.说明 + '）'
    if (流式把手) {
      // 正常情况：流式那个气泡已经在了，把最终版（标记抠干净的）填进去就行
      流式把手.改文字(显示文字)
    } else {
      加一条('她的', 显示文字)
    }
    流式把手 = null
    状态.textContent = '在的'

    if (结果.成功) {
      // 她说完了 → 让桌面上的她做表情（表情是主进程去按的快捷键，这儿不用管）
      if (结果.表情 && 结果.表情.length) {
        提示('桌面上的她：' + 结果.表情.join('、'))
      }
      // 聊天模式已经在文字流里提前交付了完整句；工作/学习模式没有草稿流，
      // 会在这里把最终稿整段交给同一队列。最后一个没标点的尾句也在这里补上。
      if (要出声) 流式朗读.完成(结果.她说的话)
      if (结果.工作索引编号) void 刷新工作索引()
      return { 成功: true, 工作状态: 结果.工作状态 || '', 工作索引编号: 结果.工作索引编号 || '' }
    } else {
      流式朗读.取消()
      提示(结果.说明 || '她没能回话', '#c9779d')
      显示故障(结果.故障 || {
        类别: '模型', 标题: '这次回复失败了', 说明: 结果.说明 || '她没能回话', 建议: '稍后再试。',
      })
      return { 成功: false }
    }
  } catch (错误) {
    流式朗读.取消()
    // 出错了也要让她"说一句"，不然界面上会一直转圈
    const 点 = 聊天区.querySelector('.在打字')
    if (点) 点.remove()
    if (流式把手) {
      流式把手.改文字('（出问题了：' + 错误.message + '）')
      流式把手 = null
    } else {
      加一条('她的', '（出问题了：' + 错误.message + '）')
    }
    提示('出错了：' + 错误.message, '#c9779d')
    显示故障({ 类别: '本地', 标题: '界面与主程序通信失败', 说明: 错误.message, 建议: '重新打开窗口；反复出现时重启爱莉希雅。' })
    return { 成功: false }
  } finally {
    她正在说 = false
    发送按钮.classList.remove('停止中')
    发送按钮.textContent = '↵'
    发送按钮.title = '发送（回车）'
    发送按钮.setAttribute('aria-label', '发送')
    状态.textContent = 流式朗读.忙吗() ? '在说话…' : '在的'
    输入.focus()
    if (通话模式 && !流式朗读.忙吗()) 安排通话监听(350)
  }
}

async function 停止当前回复() {
  if (!她正在说) return
  发送按钮.disabled = true
  流式朗读.取消()
  状态.textContent = '正在停止…'
  try {
    const 结果 = await window.爱莉.停止回复()
    if (!结果 || !结果.停止了) 提示((结果 && 结果.说明) || '当前没有可停止的回复')
  } catch (错误) {
    提示('停止失败：' + 错误.message, '#c9779d')
  } finally {
    发送按钮.disabled = false
  }
}

// 她说到一半 —— 把正在生成的字实时显示出来
// 第一次收到的时候开一个气泡，之后就一直改那个
window.爱莉.她说到一半((到现在) => {
  // 对话层只会把不会被工具流程重写的正式文字送到这里。
  // 队列只取已经闭合的句子；没有标点的尾巴要等最终稿。
  if (要出声) 流式朗读.收到(到现在)
  if (!流式把手) {
    const 点 = 聊天区.querySelector('.在打字')
    if (点) 点.remove()
    流式把手 = 加一条('她的', 到现在)
  } else {
    流式把手.改文字(到现在)
  }
})

// 说明一下这里为什么没有监听"她说完了"：
// 那个消息和"说话"这个请求的返回是同时到的，谁先到不一定。
// 要是它的回调里把 流式把手 清掉了，紧接着"说话"的返回就会以为
// 还没开过气泡，于是又开一个 —— 界面上就变成同样的两句话。
// 所以清空这件事只在 说一句() 里面做，一处负责，不会打架。

// 她要用工具了 —— 界面上得有点动静。
//
// 【为什么需要这个】
//   她查东西的时候要两三秒（联网搜索、读文件）。那几秒里屏幕上什么都不变，
//   看着像卡死了。她自己会先说一句"我翻翻小本子……"，
//   那句话就从这儿冒出来，底下那行小字同时换成"她正在查……"。
window.爱莉.她动手了((送来的) => {
  const 数据 = typeof 送来的 === 'string' ? { 一句话: 送来的, 工具们: [] } : (送来的 || {})
  const 名字们 = Array.isArray(数据.工具们) ? 数据.工具们.map((x) => x && x.名字).filter(Boolean) : []
  状态.textContent = '她在忙…'
  工具记录入口.hidden = false
  工具记录入口.classList.add('执行中')
  工具记录入口.textContent = 名字们.length ? `正在调用：${名字们.join('、')}` : '正在调用工具…'
  if (数据.一句话) 提示(数据.一句话)
})

// ============================================================
// 她要动手之前，弹一张卡片让他点头
// ============================================================
//
// 【为什么这个不能省】
//   写文件和跑命令是"会改动他硬盘"的事。她是在生成文字，可能写错路径、
//   可能把文件覆盖掉、可能跑一条不该跑的命令。**程序这边必须有一道闸**，
//   而且这道闸得让他看得见"她要干什么"再决定。
//
// 【卡片上要有什么】
//   类型（新建 / 覆盖 / 跑命令）、路径或命令、以及能看到的内容预览。
//   覆盖还要告诉他"原来多少行" —— 让他有个判断依据。
//
// 【他点了之后】
//   回一个"我点完了"，她那边才继续。**不点她就一直等** ——
//   所以卡片得显眼，而且不能自动消失。

/** 把一张卡片放到聊天区最底下 */
function 弹确认卡片(请求) {
  收开场()

  const 条 = document.createElement('div')
  条.className = '一条 确认卡'
  条.dataset.编号 = 请求.编号

  const 类型名 = { 新建: '想新建一个文件', 覆盖: '想覆盖一个文件', 跑命令: '想跑一条命令' }[请求.类型] || '想动一下手'

  let 详情 = ''
  if (请求.路径) 详情 += `<div class="确认路径">${转义(请求.路径)}</div>`
  if (请求.命令) 详情 += `<div class="确认命令">${转义(请求.命令)}</div>`
  if (请求.类型 === '覆盖' && 请求.原内容行数) {
    详情 += `<div class="确认提示">原来 ${请求.原内容行数} 行</div>`
  }

  let 预览 = ''
  if (请求.内容) {
    预览 =
      `<div class="确认预览">${转义(请求.内容)}${请求.内容太长 ? '\n……（还有更多，写下去会比这里显示的长）' : ''}</div>`
  }

  // 【第三个按钮："以后别问" —— 2026-10-07 加的】
  //   他的原话："明明就是写一个文件却还要我同意。"
  //   所以同意的时候可以顺手说一句"这个文件夹以后别问了"，
  //   那个目录就进放行清单，下次新建/覆盖不再弹卡片。
  //
  //   只有写文件的卡片有它（主进程会给 能记住 + 要记住的目录）。
  //   跑命令永远不给 —— 写文件最坏是改坏一个文件，跑命令最坏是干任何事。
  const 记住的目录 = 请求.要记住的目录 || ''
  const 记住按钮 = 请求.能记住
    ? `<button class="记住了" title="以后往 ${转义(记住的目录 || '这个文件夹')} 里写东西，不再问你">以后别问</button>`
    : ''

  条.innerHTML = `
    <div class="确认框">
      <div class="确认头">爱莉希雅${转义(类型名)}</div>
      ${详情}
      ${预览}
      <div class="确认按钮">
        <button class="准了">让她做</button>
        ${记住按钮}
        <button class="算了">先别</button>
      </div>
    </div>
  `

  // 【点了之后状态必须跟着走 —— 2026-10-01 晚上他真被唬住过一次】
  //   原来这里只把卡片从界面上拿掉，底下那行"等你点头"没人管。
  //   他点完同意，抬头一看还写着"等你点头"，就以为她还在等，
  //   以为是自己没点到 —— 而那晚**确实**有个请求卡住了（另一个 bug），
  //   两个症状叠在一起，根本分不清哪个是哪个。
  //   所以：**界面上还剩几张卡片，状态就说什么话。**
  const 收掉 = () => {
    条.remove()
    if (!聊天区.querySelector('.确认卡')) {
      if (当前工作任务 && 当前工作任务.状态 === '等待权限') {
        改工作任务状态(当前工作任务, '执行中')
      } else {
        状态.textContent = '她在想…'
      }
    }
  }

  条.querySelector('.准了').addEventListener('click', () => {
    window.爱莉.我点完了(请求.编号, true)
    收掉()
    提示('好，让她做')
  })
  条.querySelector('.算了').addEventListener('click', () => {
    window.爱莉.我点完了(请求.编号, false)
    收掉()
    提示('你跟她说先别做')
  })

  // 第三个按钮：同意，并且以后这个文件夹不再问
  const 记住钮 = 条.querySelector('.记住了')
  if (记住钮) {
    记住钮.addEventListener('click', () => {
      // 第三个参数才是"记住" —— 少传它的话，界面上看着点了，
      // 主进程收到的还是普通的"同意"，下次照样弹卡片。
      window.爱莉.我点完了(请求.编号, true, true)
      收掉()
      提示('好 —— ' + (记住的目录 || '这个文件夹') + ' 以后不用问我了')
    })
  }

  聊天区.appendChild(条)
  滚到底()
  状态.textContent = '等你点头'
}

/** 把 HTML 里有特殊意思的字符转义掉（她的内容里可能有尖括号） */
function 转义(文本) {
  return String(文本 == null ? '' : 文本)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

window.爱莉.要我点头((请求) => {
  if (当前工作任务 && 当前工作任务.状态 === '执行中') {
    改工作任务状态(当前工作任务, '等待权限', '请检查下方动作')
  }
  弹确认卡片(请求)
})

// 主进程把"以后别问"落实之后会推一条 —— 用它把话说准（带完整路径）。
// 卡片上那个按钮点完也会先提示一句，可那时候还不知道主进程记没记上、记成了哪一条。
window.爱莉.放行了(({ 目录 }) => 提示('记住了 —— ' + 目录 + ' 以后不用问你'))

// 她那边不等了（比如被叫停了）—— 卡片要跟着撤，不能留一张点了没用的
window.爱莉.卡片撤了((编号) => {
  const 卡片 = 聊天区.querySelector(`.确认卡[data-编号="${编号}"]`)
  if (卡片) {
    卡片.remove()
    提示('那次请求作废了')
    // 撤掉的是最后一张的话，别让"等你点头"留在那儿
    if (!聊天区.querySelector('.确认卡')) 状态.textContent = '她在想…'
  }
})

// ============================================================
// 界面上的几个按钮
// ============================================================

// 发送
发送按钮.addEventListener('click', () => 她正在说 ? void 停止当前回复() : void 说一句())

通话开关.addEventListener('click', () => {
  if (!通话模式 && (输入.value.trim() || 待发的.length)) {
    提示('输入框或附件还没发送，请先处理后再开启通话')
    return
  }
  const 要开启 = !通话模式
  摆通话开关(要开启)
  if (要开启) {
    提示('通话模式已开启：正在等你说话')
    安排通话监听(150)
  } else {
    clearTimeout(通话重听钟)
    通话重听钟 = null
    if (语音输入状态 !== '空闲') 取消语音输入('通话模式已关闭')
    else 提示('通话模式已关闭')
  }
})

麦克风.addEventListener('pointerdown', (事件) => {
  if (事件.button !== 0) return
  if (通话模式) { 事件.preventDefault(); return }
  麦克风.setPointerCapture?.(事件.pointerId)
  void 开始语音输入(事件)
})
麦克风.addEventListener('pointerup', (事件) => {
  if (通话模式) { 事件.preventDefault(); return }
  const 框 = 麦克风.getBoundingClientRect()
  const 在按钮里 = 事件.clientX >= 框.left && 事件.clientX <= 框.right && 事件.clientY >= 框.top && 事件.clientY <= 框.bottom
  void 结束语音输入(!在按钮里)
})
麦克风.addEventListener('pointercancel', () => { if (!通话模式) void 结束语音输入(true) })
麦克风.addEventListener('keydown', (事件) => {
  if (通话模式) { 事件.preventDefault(); return }
  if ((事件.key === ' ' || 事件.key === 'Enter') && !事件.repeat) void 开始语音输入(事件)
})
麦克风.addEventListener('keyup', (事件) => {
  if (通话模式) { 事件.preventDefault(); return }
  if (事件.key === ' ' || 事件.key === 'Enter') { 事件.preventDefault(); void 结束语音输入(false) }
})
window.addEventListener('blur', () => {
  clearTimeout(通话重听钟)
  通话重听钟 = null
  if (语音输入状态 !== '空闲') 取消语音输入(通话模式 ? '通话已暂停，回到窗口后继续' : '窗口失去焦点，录音已取消')
})
window.addEventListener('focus', () => { if (通话模式) 安排通话监听(250) })

// 回车发送，Shift+回车换行
输入.addEventListener('keydown', (事件) => {
  if (事件.key === 'Enter' && !事件.shiftKey) {
    事件.preventDefault()
    说一句()
  }
})

// 输入框跟着内容长高（最多到 CSS 里定的那个 max-height）
输入.addEventListener('input', () => {
  输入.style.height = 'auto'
  输入.style.height = Math.min(输入.scrollHeight, 96) + 'px'
})

async function 等声音就绪() {
  const 到点 = Date.now() + 5 * 60 * 1000
  while (正在启动声音 && Date.now() < 到点) {
    await new Promise((停) => setTimeout(停, 3000))
    let 状态结果
    try {
      状态结果 = await window.爱莉.声音状态()
    } catch {
      continue
    }
    if (!状态结果.在) continue

    正在启动声音 = false
    要出声 = true
    喇叭.classList.remove('加载中')
    喇叭.classList.add('开着')
    喇叭.title = '声音已在线；点一下静音'
    收起故障('服务')
    提示('声音加载好了，她现在可以出声')
    弹声音提示('声音准备好了，爱莉希雅现在可以出声 ♪', '成功')
    return
  }

  if (!正在启动声音) return
  正在启动声音 = false
  要出声 = false
  喇叭.classList.remove('加载中', '开着')
  喇叭.title = '声音还没就绪，点一下重新检查或启动'
  提示('声音加载超过 5 分钟仍未就绪，请检查声音窗口或日志', '#c9779d')
}

// 声音按钮：在线时切换静音；离线时由用户手动启动声音服务。
喇叭.addEventListener('click', async () => {
  if (正在启动声音) {
    提示('声音还在加载，请稍等')
    return
  }

  if (要出声) {
    要出声 = false
    流式朗读.取消()
    喇叭.classList.remove('开着')
    喇叭.title = '现在是静音，点一下打开'
    提示('静音了（只是不说话，不是不理你）')
    return
  }

  try {
    const 状态结果 = await window.爱莉.声音状态()
    if (!状态结果.在) {
      要出声 = false
      喇叭.classList.remove('开着')
      const 启动结果 = await window.爱莉.启动声音服务()
      if (!启动结果 || !启动结果.成功) {
        喇叭.title = '声音启动失败，点一下重试'
        提示('声音没能启动：' + ((启动结果 && 启动结果.说明) || '没反应'), '#c9779d')
        显示故障((启动结果 && 启动结果.故障) || { 类别: '服务', 标题: '声音服务没有启动', 说明: (启动结果 && 启动结果.说明) || '', 建议: '检查声音启动脚本和日志。' })
        return
      }
      if (启动结果.已就绪) {
        要出声 = true
        喇叭.classList.add('开着')
        喇叭.title = '声音已在线；点一下静音'
        提示('她会出声')
        return
      }
      正在启动声音 = true
      喇叭.classList.add('加载中')
      喇叭.title = '声音正在加载，通常需要约两分半'
      提示(启动结果.说明 || '声音开始加载，请稍等')
      弹声音提示('声音服务已在后台启动，正在加载模型…')
      void 等声音就绪()
      return
    }

    要出声 = true
    喇叭.classList.add('开着')
    喇叭.title = '让她说话（点一下可以关掉声音）'
    收起故障('服务')
    提示('她会出声')
  } catch (错误) {
    显示故障({ 类别: '本地', 标题: '没能检查声音服务', 说明: 错误.message, 建议: '重新打开窗口后再试。' })
  }
})

// 账本开关（旁边那个小面板）
const 账本开关 = document.getElementById('账本开关')

账本开关.addEventListener('click', () => window.爱莉.切换账本())

// 面板真开 / 真关的时候主进程会说一声，按钮跟着亮或暗
window.爱莉.账本开关((开着) => {
  账本开关.classList.toggle('开着', 开着)
  账本开关.title = 开着
    ? '账本开着呢（点一下收起来）'
    : '账本：看她花了多少 token、多少钱'
})

// ============================================================
// 上次聊到哪儿了 —— 把聊天记录显示回窗口里
// ============================================================
//
// 【这是"她记得"和"你看得见"两件事】
//   她本来就一直记得：每次开口，程序都把最近二十句递给她。
//   可窗口里是空的 —— 你看不见她记得的东西，于是会觉得"她失忆了"。
//   他 2026-09-27 问的就是这个："我怎么才能保留一轮对话"。
//
//   所以窗口一打开，主进程会把最近 40 条记录送过来（preload 里的
//   "聊天记录"那个口子），这儿负责画出来。
//   记录本身一直在 记忆\聊天记录.jsonl 里，一行一条，你也能直接用记事本打开。

const 更早 = document.getElementById('更早')
// 【这个节点只能从 HTML 里来，谁也不许重新赋值给它】
//   按钮里的 <span id="更早条数"> 是个真元素。哪天有人图省事给按钮整个
//   重新赋 textContent，它就会被冲掉，这个变量变成 null，
//   下一句 `null.textContent` 当场抛 —— 而且抛在回调里，
//   只会安静地少做几件事。2026-10-03 就这么犯过一次。
const 更早条数 = document.getElementById('更早条数')
const 看更早按钮 = document.getElementById('看更早')

/** 画出来的记录里，最后一条是哪天 —— 用来决定要不要插日期分隔 */
let 上次画到哪天 = ''

/** 已经在窗口里的记录条数（用来算"还有多少条更早的"） */
let 已画条数 = 0

function 画记录(条们) {
  for (const 条 of 条们) {
    if (!条 || !条.内容) continue
    const 这天 = String(条.时间 || '').slice(0, 10)
    if (这天 && 这天 !== 上次画到哪天) {
      加日期分隔(这天)
      上次画到哪天 = 这天
    }
    画一条(条.角色 === 'user' ? '他的' : '她的', 条.内容, 只留时刻(条.时间), null, 条.来源)
    已画条数++
  }
}

// ============================================================
// 收到聊天记录 —— 每次都整个重画
// ============================================================
//
// 【为什么改成"每次重画"，原来是"第一次追加、之后重画"】
//   加这段之前只有一条路：窗口打开时送一次记录，点"看更早的"再送一次全量。
//   现在多了**换对话** —— 换一次就送一次**另一段**的记录。
//   再按老办法追加的话，上一段的内容会留在屏幕上，
//   他会以为"换过来了可她还记得"。
//   干脆每次都清空重画：屏幕上是哪一段，就跟她记得的完全一致。
let 画过几次 = 0

window.爱莉.聊天记录((数据) => {
  画过几次++
  const 条们 = (数据 && 数据.条们) || []
  const 一共 = (数据 && 数据.一共) || 条们.length

  重画聊天区(条们)

  const 还剩 = Math.max(0, 一共 - 已画条数)
  更早.hidden = 还剩 <= 0
  // 【只改那个数字，别碰按钮本身的文字 —— 2026-10-03 踩过一次】
  //
  //   原来这里写的是：
  //     看更早按钮.textContent = '看更早的（还有 ' + 还剩 + ' 条）'
  //   想的是"把数字更新一下"。可 textContent 赋值是**整个替换**：
  //   按钮里那个 <span id="更早条数"> 是**元素**，不是文字，
  //   一赋值就被冲掉了，变成一串纯文本。
  //   于是下一句 getElementById('更早条数') 拿到 null，
  //   再下一次 `null.textContent = ...` 就抛 —— 日志里那串
  //   "Cannot set properties of null" 就是这么来的，每换一次对话报一次。
  //
  //   教训：**要改一个元素里的局部，就只改那个局部。**
  //   给整个容器重新赋文字，等于把里面的东西全砸了重建 ——
  //   而重建出来的只有文字，没有元素。
  更早条数.textContent = 还剩

  if (!条们.length) {
    // 这一段还一句话都没有 —— 保持开场那个样子
    提示(画过几次 === 1 ? '她在这儿呢' : '这一段还是空的 —— 说吧')
    return
  }

  if (画过几次 === 1) 提示('上次聊到这儿 —— 这一段一共 ' + 一共 + ' 条记录')
})

// 「看更早的」：跟主进程要**这一段**的全部记录，画在最上面
看更早按钮.addEventListener('click', () => {
  看更早按钮.disabled = true
  // 进度提示走底下那行小字，不动按钮的文字（理由见上面那一段）
  提示('正在翻这一段更早的记录……')
  window.爱莉.要全部聊天记录()
})

// ============================================================
// 上下文那个小圈
// ============================================================
//
// 【它画的是什么 —— 2026-10-03 改过一次，之前画错了】
//   第一版画的是"这一发总共多大 ÷ 窗口"。他一看就问：
//   "为什么对话一次上下文占用这么多？"
//   查下去：一发 7786 token，其中 **6356 是她那份人设**（系统提示），
//   真正的对话只有一千四 —— **82% 是雷打不动的那一块**。
//   也就是说那个圈**永远不会低于 10%**，跟他聊多聊少没关系。
//   圈上混着这么一块，他看见的"占用"就没有意义了 ——
//   那不是他造成的，他也改不了。
//
//   现在画的是**"对话的"占"额度的"多少**：
//     对话的 = 现在 − 固定的（系统提示 + 时间，那两块他改不了）
//     额度的 = 线 − 固定的（到线为止还能装多少对话）
//   这样它从 0 起，**满了就是程序开始收拾桌子的那一刻**。固定的那块在提示里交代清楚。
//
// 【为什么让它动，而不是只在最后显示一个数】
//   干活一轮要发好几次请求，中间那几次（工具结果堆着的时候）最大，
//   收尾那一发反而小。只显示最后一次，他看着圈是空的，会以为一直很安全 ——
//   危险恰恰在中间那几下。所以每一次请求完都刷新一遍，看得见它涨。

const 上下文环 = document.getElementById('上下文环')
const 环面 = document.getElementById('环面')
const 上下文遮罩 = document.getElementById('上下文遮罩')
const 上下文记录 = document.getElementById('上下文记录')
const 上下文统计 = document.getElementById('上下文统计')

function 画上下文账本() {
  const 数 = 算占位(上下文情况)
  上下文统计.textContent = 数 ? `总输入约 ${数.现在} token · 固定提示约 ${数.固定} token` : '这一段暂无本轮记录'
  上下文记录.replaceChildren()
  const 账 = 上下文情况 && 上下文情况.召回账本
  const 说明 = document.createElement('p')
  说明.className = '工具记录摘要'
  说明.textContent = 账
    ? `临时记忆 ${账.条目.length}/${账.最多条数} 条，正文 ${账.使用字符}/${账.字符预算} 字。${账.说明 || ''}`
    : '尚无临时记忆召回记录。'
  上下文记录.appendChild(说明)
  const 范围 = document.createElement('p')
  范围.className = '工具记录摘要'
  范围.textContent = '下列是本轮发送的记忆资料，不代表模型一定采用。长期关系只允许从直接命中沿已保存关系走一跳；候选、冲突和二跳不会发送。此处不列出完整人设和聊天历史。记录仅在本次运行保留。'
  上下文记录.appendChild(范围)
  for (const 一 of (账 && 账.条目) || []) {
    const 卡 = document.createElement('article')
    卡.className = '工具记录卡'
    const 标题 = document.createElement('strong')
    标题.textContent = `${一.类别} · ${记忆类型名字[一.记忆类型] || 一.记忆类型 || '类型未记录'}`
    const 内容 = document.createElement('div')
    内容.className = '工具记录参数'
    内容.textContent = 一.内容
    const 依据 = document.createElement('div')
    依据.className = '工具记录摘要'
    依据.textContent = `评分：${一.评分 ?? '未记录'} · ${一.选择原因 || `匹配：${一.命中词.join('、')}`}\n` +
      `分项：相关 ${一.分项 && 一.分项.相关分 || 0} + 类型 ${一.分项 && 一.分项.类型分 || 0} + 意图 ${一.分项 && 一.分项.意图分 || 0} + 语义 ${一.分项 && 一.分项.语义分 || 0} + 重要 ${一.分项 && 一.分项.重要分 || 0} + 时间 ${一.分项 && 一.分项.时间分 || 0}（因子 ${一.分项?.时间因子 ?? '未记录'}，半衰期 ${一.分项 && 一.分项.半衰期天数 || '未记录'} 天）\n` +
      `到期：${显示日期时间(一.到期于)} · 编号：${一.编号} · 来源：${一.来源对话 || '未记录'}`
    卡.append(标题, 内容, 依据)
    上下文记录.appendChild(卡)
  }
  if (账 && !账.条目.length) {
    const 空 = document.createElement('div')
    空.className = '工具记录空态'
    空.textContent = 账.好 ? '本轮没有使用临时记忆。' : '临时记忆读取失败，已跳过。'
    上下文记录.appendChild(空)
  }
  const 长 = 账 && 账.长期关系
  const 长摘要 = document.createElement('p')
  长摘要.className = '工具记录摘要'
  长摘要.textContent = 长
    ? `长期记忆直接命中 ${长.种子.length}/${长.最多种子} 条，一跳补充 ${长.条目.length}/${长.最多条数} 条，正文 ${长.使用字符}/${长.字符预算} 字。${长.说明 || ''}`
    : '尚无长期记忆关系召回记录。'
  上下文记录.appendChild(长摘要)
  for (const 一 of (长 && 长.种子) || []) {
    const 卡 = document.createElement('article')
    卡.className = '工具记录卡'
    const 标题 = document.createElement('strong')
    标题.textContent = `${一.类别} · 直接命中`
    const 内容 = document.createElement('div')
    内容.className = '工具记录参数'
    内容.textContent = 一.内容
    const 依据 = document.createElement('div')
    依据.className = '工具记录摘要'
    依据.textContent = `${一.选择原因}\n编号：${一.编号}`
    卡.append(标题, 内容, 依据)
    上下文记录.appendChild(卡)
  }
  for (const 一 of (长 && 长.条目) || []) {
    const 卡 = document.createElement('article')
    卡.className = '工具记录卡'
    const 标题 = document.createElement('strong')
    标题.textContent = `${一.类别} · 一跳${一.关系 && 一.关系.类型 || '关系'}`
    const 内容 = document.createElement('div')
    内容.className = '工具记录参数'
    内容.textContent = 一.内容
    const 依据 = document.createElement('div')
    依据.className = '工具记录摘要'
    依据.textContent = `${一.选择原因}\n路径：${一.路径}\n关系编号：${一.关系 && 一.关系.编号 || '未记录'} · 记忆编号：${一.编号}`
    卡.append(标题, 内容, 依据)
    上下文记录.appendChild(卡)
  }
  if (长 && !长.条目.length) {
    const 空 = document.createElement('div')
    空.className = '工具记录空态'
    空.textContent = 长.好 ? '本轮没有安全的一跳长期记忆补充。' : '长期记忆关系读取失败，已跳过。'
    上下文记录.appendChild(空)
  }
}
function 关上下文账本() {
  上下文遮罩.classList.add('收着')
  上下文遮罩.setAttribute('aria-hidden', 'true')
  上下文环.focus()
}
document.getElementById('上下文关闭').addEventListener('click', 关上下文账本)
上下文遮罩.addEventListener('click', (事件) => { if (事件.target === 上下文遮罩) 关上下文账本() })

/** 圆周：2π × r（r = 15.5，写在 index.html 的 svg 里） */
const 环长 = 2 * Math.PI * 15.5

/** 手上这份上下文情况（点圈的时候要展开给它看） */
let 上下文情况 = null

/**
 * 把原始数据算成"对话占了多少 / 还能装多少"。
 *
 * 【额度为什么算到"线"为止，不算到窗口顶】
 *   圈满的时候应该是**一个能说清楚的时刻**。
 *   要是拿整个窗口当额度，那么程序开始收拾桌子的那一发（线的位置）
 *   圈才画到 81% —— 看着像"还没满就红了"，两个数对不上，人就懵了。
 *   现在额度 = 线 − 固定的：**圈满 = 她开始收拾桌子**，一个意思一个数。
 *
 *   线本身是窗口的 80%，剩下那 20%（一万三千多 token）留着她最多 2000 的回复
 *   和一堆余量 —— 所以圈满了也不危险，只是"我开始动手了"。
 */
function 算占位(数据) {
  const 现在 = 数据 && typeof 数据.现在 === 'number' ? 数据.现在 : null
  if (现在 === null) return null

  const 窗口 = 数据.窗口 || 65536
  const 固定 = 数据.固定 || 0
  const 线 = 数据.线 || Math.floor(窗口 * 0.8)
  const 额度 = Math.max(1, 线 - 固定)
  const 对话 = Math.max(0, 现在 - 固定)
  return { 现在, 窗口, 固定, 线, 额度, 对话, 占: 对话 / 额度, 该收拾了: 现在 >= 线 }
}

function 画上下文环(数据) {
  上下文情况 = 数据 || null
  if (!上下文遮罩.classList.contains('收着')) 画上下文账本()
  const 数 = 算占位(数据)

  if (!数) {
    上下文环.className = '上下文环 还没说过话'
    环面.style.strokeDashoffset = String(环长)
    上下文环.title = '上下文：这一段还没说过话 —— 说一句就有了'
    return
  }

  const 占 = Math.min(1, 数.占)
  环面.style.strokeDashoffset = String(环长 * (1 - 占))
  上下文环.className = '上下文环' + (数.该收拾了 ? ' 该收拾了' : 占 >= 0.6 ? ' 注意' : '')

  // 提示里两套数都给：他一眼能看懂的（对话占多少），和能对账的（总共多少）
  上下文环.title =
    `对话占了额度的 ${Math.round(数.占 * 100)}%　（${数.对话} / ${数.额度} token）\n` +
    `\n` +
    `这一发总共 ${数.现在} / ${数.窗口}\n` +
    `其中约 ${数.固定} 是固定提示（含人设与长期记忆）\n` +
    `到 ${数.线} 她会开始收拾桌子（裁掉最老的工具结果）\n` +
    (数据.这一轮最大 && 数据.这一轮最大 > 数.现在 ? `\n这一轮最大到过 ${数据.这一轮最大}` : '') +
    `\n\n点一下看详细`
}

// 点圈查看本轮实际发送的临时记忆快照；切换对话时跟随该段记录刷新。
上下文环.addEventListener('click', () => {
  const 数 = 算占位(上下文情况)
  if (!数) {
    提示('这一段还没说过话，没法量')
    return
  }
  画上下文账本()
  上下文遮罩.classList.remove('收着')
  上下文遮罩.setAttribute('aria-hidden', 'false')
  document.getElementById('上下文关闭').focus()
})

window.爱莉.上下文(画上下文环)

//
// 【这是什么东西】
//   她跟他的说话是**一段一段**的。每一段只记得自己那几句，
//   段与段之间**互不干扰** —— 在一段里说的话，另一段里的她看不见。
//   但**长期记忆是共用的**（关于你的事实、你们一起经历的、她的小本子），
//   所以换一段她不会忘了你是谁。
//   跟 DSH 网页左边那个对话列表是一回事。
//
// 【为什么切换的时候要把聊天区整个重画】
//   不重画的话，上一条消息还挂在那儿 —— 他会以为"换过来了可她还记得"。
//   重画之后屏幕上也干净了：这一段有几句就画几句。

const 对话列表 = document.getElementById('对话列表')
const 开新对话按钮 = document.getElementById('开新对话')
const 开临时对话按钮 = document.getElementById('开临时对话')
const 选模型面板 = document.getElementById('选模型')

/** 现在正说着的是哪一段（主进程推过来的时候会更新） */
let 当前对话编号 = ''
let 当前是临时对话 = false

/** 这把钥匙上真有哪些模型（**运行时问来的，不是写死的**）+ 她默认用哪个 */
let 模型名单 = []
let 默认模型 = ''
let 模型名单说明 = ''
let 模型名单请求 = null
let 模型名单更新时间 = 0

// 模型名单是环境事实，仍会在后台向主进程刷新；但新建面板不能每次都等网络。
// 上一次成功结果只作“先画出来”的短缓存，随后由本次运行的真实名单覆盖。
const 模型名单缓存键 = 'elysia:model-list:v1'
try {
  const 缓存 = JSON.parse(localStorage.getItem(模型名单缓存键) || 'null')
  if (缓存 && Array.isArray(缓存.名单) && 缓存.名单.length) {
    模型名单 = [...new Set(缓存.名单.map((一) => String(一 || '')).filter(Boolean))]
    默认模型 = String(缓存.默认 || '')
    模型名单更新时间 = Number(缓存.时间) || 0
  }
} catch {
  // 缓存坏了就当没有；真实名单仍会在后台重取。
}

function 收起新建面板() {
  选模型面板.classList.add('收着')
  选模型面板.setAttribute('aria-hidden', 'true')
  开新对话按钮.setAttribute('aria-expanded', 'false')
}

function 记下模型名单(果) {
  const 名单 = [...new Set(((果 && 果.名单) || []).map((一) => String(一 || '').trim()).filter(Boolean))]
  模型名单说明 = String((果 && 果.说明) || '')
  if (!名单.length) return false
  模型名单 = 名单
  默认模型 = String((果 && 果.现在用的) || 默认模型 || '')
  模型名单更新时间 = Date.now()
  if (果 && 果.好) {
    try {
      localStorage.setItem(模型名单缓存键, JSON.stringify({ 名单: 模型名单, 默认: 默认模型, 时间: 模型名单更新时间 }))
    } catch {
      // localStorage 不可用不影响新建对话。
    }
  }
  return true
}

/** 同一时刻只问一次；界面始终先用缓存画，不把网络等待塞进点击手势。 */
function 刷新可用模型({ 强制 = false } = {}) {
  const 仍新鲜 = 模型名单.length && Date.now() - 模型名单更新时间 < 10 * 60 * 1000
  if (!强制 && 仍新鲜) return Promise.resolve({ 好: true, 名单: 模型名单, 现在用的: 默认模型 })
  if (模型名单请求) return 模型名单请求

  模型名单请求 = window.爱莉
    .有哪些模型()
    .then((果) => {
      记下模型名单(果)
      if (!选模型面板.classList.contains('收着')) 画新建面板()
      if (最后一次的对话们) 画对话们(最后一次的对话们)
      return 果
    })
    .catch((错误) => {
      模型名单说明 = '暂时没读到模型：' + 错误.message
      if (!选模型面板.classList.contains('收着')) 画新建面板()
      return null
    })
    .finally(() => {
      模型名单请求 = null
    })
  return 模型名单请求
}

/** 最后一次收到的对话列表 —— 模型名单晚一步回来时，要拿它把列表重画一遍 */
let 最后一次的对话们 = null

/** 'deepseek-flash' → 'flash'。左边那一列才 158px 宽，全名放不下 */
function 短模型名(全名) {
  return String(全名 || '').replace(/^deepseek-/, '')
}

/** 把聊天区整个清空重画（换段、翻全部记录都走它） */
function 重画聊天区(条们) {
  for (const 节点 of Array.from(聊天区.children)) {
    // 「更早」和「开场」留着 —— 一个是要给旧记录留入口，一个是还没聊过时的样子
    if (节点.id !== '更早' && 节点.id !== '开场') 节点.remove()
  }
  已画条数 = 0
  上次画到哪天 = ''
  if (条们.length) 收开场()
  画记录(条们)
}

/** 把左边那一列画出来 */
function 画对话们(数据) {
  const 列表 = (数据 && 数据.列表) || []
  当前对话编号 = (数据 && 数据.现在) || ''
  void 刷新情感状态()
  最后一次的对话们 = 数据 || null

  const 当前项 = 列表.find((一) => 一.编号 === 当前对话编号)
  // 第一次启动若网络名单还在路上，先拿历史对话里真实用过的模型兜底，
  // 面板仍可立即选择；后台结果回来后会无缝换成完整名单。
  if (!模型名单.length) {
    模型名单 = [...new Set(列表.map((一) => String(一.模型 || '').trim()).filter(Boolean))]
  }
  当前是临时对话 = !!(当前项 && 当前项.临时)
  if (当前项) 摆长期记忆(当前项.写长期记忆 !== false)
  记忆开关.disabled = 当前是临时对话
  记忆开关.classList.toggle('临时锁定', 当前是临时对话)

  对话列表.innerHTML = ''
  for (const 一 of 列表) {
    const 行 = document.createElement('div')
    行.className = '对话行' + (一.临时 ? ' 临时' : '')

    const 按钮 = document.createElement('button')
    按钮.className = '对话' + (一.编号 === 当前对话编号 ? ' 当前' : '') + (一.临时 ? ' 临时' : '')
    按钮.dataset.编号 = 一.编号
    按钮.title = 一.标题 + '（' + (一.建于 || '') + '）'

    const 标题 = document.createElement('span')
    标题.className = '对话标题'
    标题.textContent = 一.标题

    const 小字 = document.createElement('span')
    小字.className = '对话小字'
    // 日期 + 条数 + 这一段用的哪个脑子
    //
    // 【为什么要标模型】他新建的时候是选过，可过两天就忘了哪段是哪个。
    //   没选过的段显示默认那个 —— "没选过"和"选了默认那个"对他是同一个意思，
    //   硬要区分只会让他多想一层。
    const 这段模型 = 一.模型 || 默认模型
    // 【模式排在模型前面 —— 2026-10-07 加的】
    //   它比模型要紧：模式决定"她能不能动手"，模型只是"哪个脑子"。
    //   老对话没记过模式（这个字段是后加的），当聊天处理。
    const 这段模式 = 模式表[一.模式] ? 一.模式 : 'chat'
    小字.textContent =
      (一.临时 ? '临时' : 短日期(一.建于)) +
      ' · ' +
      模式表[这段模式].中文 +
      ' · ' +
      一.条数 +
      ' 条' +
      (一.临时 ? ' · 不保存' : 一.写长期记忆 === false ? ' · 不写记忆' : '') +
      (这段模型 ? ' · ' + 短模型名(这段模型) : '')

    按钮.appendChild(标题)
    按钮.appendChild(小字)
    行.appendChild(按钮)

    if (一.临时) {
      const 删除 = document.createElement('button')
      删除.className = '删临时'
      删除.dataset.编号 = 一.编号
      删除.dataset.标题 = 一.标题
      删除.title = '删除这段临时对话'
      删除.setAttribute('aria-label', '删除临时对话：' + 一.标题)
      删除.textContent = '×'
      行.appendChild(删除)
    }
    对话列表.appendChild(行)
  }

  // 列表见底的时候，把当前那一段滚进视野 —— 新对话在最上面，
  // 可他要是在跟"最早"那段说话，那条在下面，不滚就看不见。
  const 当前 = 对话列表.querySelector('.对话.当前')
  if (当前) 当前.scrollIntoView({ block: 'nearest' })
}

/** "2026-09-26 21:11" → "9月26日" */
function 短日期(时间) {
  const 部分 = String(时间 || '').split(' ')[0].split('-')
  if (部分.length !== 3) return '——'
  return Number(部分[1]) + '月' + Number(部分[2]) + '日'
}

// 点列表里某一段 → 换过去
对话列表.addEventListener('click', async (事件) => {
  const 删除 = 事件.target.closest('.删临时')
  if (删除) {
    const 编号 = 删除.dataset.编号
    const 标题 = 删除.dataset.标题 || '临时对话'
    if (!编号 || !window.confirm(`删除「${标题}」？\n这段临时聊天和它的缓存附件会立即消失。`)) return
    删除.disabled = true
    try {
      const 果 = await window.爱莉.删临时对话(编号)
      if (!果 || !果.好) {
        提示('删不了：' + ((果 && 果.说明) || '临时对话已经不在了'), '#c9779d')
        return
      }
      提示('临时对话已删除')
      输入.focus()
    } catch (错误) {
      提示('删除临时对话出错：' + 错误.message, '#c9779d')
    } finally {
      删除.disabled = false
    }
    return
  }

  const 按钮 = 事件.target.closest('.对话')
  if (!按钮) return
  const 编号 = 按钮.dataset.编号
  if (!编号 || 编号 === 当前对话编号) return // 已经在这一段了

  按钮.disabled = true
  try {
    const 果 = await window.爱莉.换对话(编号)
    if (!果 || !果.好) {
      提示('换不过去：' + ((果 && 果.说明) || '那一段不在了'), '#c9779d')
      return
    }
    提示('换到「' + (按钮.querySelector('.对话标题') || {}).textContent + '」了')
    输入.focus()
  } catch (错误) {
    提示('换对话出错：' + 错误.message, '#c9779d')
  } finally {
    按钮.disabled = false
  }
})

// ---- 点 ＋ → 只挑这一段用哪个脑子，再建 ----
//
// 【为什么不让 ＋ 直接建】
//   他 2026-10-04 要的是"像 DSH 一样，可以在对话开始时调模型"。
//   先建再改的话，还得在别处再开一个入口；而"这一段用哪个脑子"
//   本来就是**建的时候**定最自然 —— 跟 DSH 新建对话时选模型是一回事。
//
// 【为什么不再让点击等主进程】
//   名单仍是运行时问来的，但请求在启动时后台完成并留下短缓存。
//   点击只负责立即展开；需要刷新时也在面板已经出现后悄悄刷新。
开新对话按钮.setAttribute('aria-haspopup', 'dialog')
开新对话按钮.setAttribute('aria-expanded', 'false')
选模型面板.setAttribute('aria-hidden', 'true')
开新对话按钮.addEventListener('click', () => {
  // 已经开着 → 再点一下就收起来
  if (!选模型面板.classList.contains('收着')) {
    收起新建面板()
    return
  }

  画新建面板()
  选模型面板.classList.remove('收着')
  选模型面板.setAttribute('aria-hidden', 'false')
  开新对话按钮.setAttribute('aria-expanded', 'true')
  requestAnimationFrame(() => (选模型面板.querySelector('button[data-模型], button[data-关闭模型]') || 选模型面板).focus?.({ preventScroll: true }))
  void 刷新可用模型()
})

// 临时对话继承当前模式和模型，点一下立即进入，不必先等模型名单。
开临时对话按钮.addEventListener('click', async () => {
  开临时对话按钮.disabled = true
  try {
    const 果 = await window.爱莉.开临时对话()
    if (!果 || !果.好) {
      提示('没能打开临时对话', '#c9779d')
      return
    }
    提示('临时对话：关闭程序后消失，不写聊天记录、长期记忆或学习进度')
    输入.focus()
  } catch (错误) {
    提示('开临时对话出错：' + 错误.message, '#c9779d')
  } finally {
    开临时对话按钮.disabled = false
  }
})

/**
 * 画"新建一段对话"那个面板。
 *
 * 【为什么只剩模型】
 *   模式本来就属于当前对话状态，主界面上已有独立入口；新对话直接继承
 *   当前模式，不在这个小面板里再做一套容易误解、还会拖慢操作的选择器。
 *
 * 【为什么按钮是当场画的，不写死在页面里】
 *   模型名单是运行时问来的（真的会变），画死的那份过一阵就是假的。
 */
function 画新建面板() {
  选模型面板.innerHTML = ''
  选模型面板.setAttribute('role', 'dialog')
  选模型面板.setAttribute('aria-label', '选择新对话模型')

  const 头 = document.createElement('div')
  头.className = '选模型头'
  const 标题 = document.createElement('strong')
  标题.textContent = '选择模型'
  const 关闭 = document.createElement('button')
  关闭.type = 'button'
  关闭.className = '选模型关闭'
  关闭.dataset.关闭模型 = '1'
  关闭.title = '收起'
  关闭.setAttribute('aria-label', '收起模型选择')
  关闭.textContent = '×'
  头.append(标题, 关闭)

  const 说明 = document.createElement('div')
  说明.className = '选模型说明'
  说明.textContent = `新对话沿用当前的${模式表[当前模式].中文}模式`
  选模型面板.append(头, 说明)

  if (!模型名单.length) {
    const 空 = document.createElement('div')
    空.className = '模型加载'
    空.textContent = 模型名单说明 || '正在读取可用模型…'
    选模型面板.appendChild(空)
    return
  }

  for (const 名 of 模型名单) {
    const 钮 = document.createElement('button')
    钮.type = 'button'
    钮.className = '模型选项' + (名 === 默认模型 ? ' 默认的' : '')
    钮.dataset.模型 = 名
    钮.title = 名
    const 名字 = document.createElement('span')
    名字.textContent = 短模型名(名)
    钮.appendChild(名字)
    if (名 === 默认模型) {
      const 默认 = document.createElement('small')
      默认.textContent = '默认'
      钮.appendChild(默认)
    }
    选模型面板.appendChild(钮)
  }
}

// 面板里只剩模型：点一下就按当前模式建新对话。
选模型面板.addEventListener('click', async (事件) => {
  if (事件.target.closest('button[data-关闭模型]')) {
    收起新建面板()
    开新对话按钮.focus({ preventScroll: true })
    return
  }

  const 按钮 = 事件.target.closest('button[data-模型]')
  if (!按钮) return
  const 模型 = 按钮.dataset.模型
  const 继承模式 = 当前模式

  收起新建面板()
  开新对话按钮.disabled = true
  try {
    const 果 = await window.爱莉.开新对话(模型)
    if (!果 || !果.好) {
      提示('没能开新对话 —— 她的记忆文件夹写不进去？', '#c9779d')
      return
    }
    提示(
      `新的一段（${模式表[继承模式].中文} · ${短模型名(模型)}）—— 刚才聊的她不带过来了，人她还是记得的`,
    )
    输入.focus()
  } catch (错误) {
    提示('开新对话出错：' + 错误.message, '#c9779d')
  } finally {
    开新对话按钮.disabled = false
  }
})

// 点别处就把面板收起来
//
// 【为什么要排除 ＋ 自己】
//   点 ＋ 的时候，它自己的处理先跑，事件还会继续往上冒到 document ——
//   不排除的话，刚展开就被这一下收掉了，看起来就是"点了没反应"。
document.addEventListener('click', (事件) => {
  if (选模型面板.classList.contains('收着')) return
  if (事件.target.closest('#选模型') || 事件.target.closest('#开新对话')) return
  收起新建面板()
})

// 主进程推过来的列表（启动、开新的、换段之后都会来一条）
window.爱莉.对话们(画对话们)
window.爱莉.情感状态变了(摆情感状态)
setInterval(() => void 刷新情感状态(), 30000)

// 开机后台刷新一次。点击“新对话”只读现有缓存，不再被这条网络请求卡住。
void 刷新可用模型({ 强制: true })

// 【注意】要全部记录回来的时候，主进程会重新发一条"聊天记录"，
// 里面是全量的。这时候窗口里已经有后 40 条了，直接再画一遍就重复了。
// 所以下面这个标记负责"重画"：第二次收到记录时，把聊天区清空重画。
let 收到过几次 = 0
window.爱莉.聊天记录((数据) => {
  收到过几次++
  if (收到过几次 === 1) return // 第一次已经在上面那个回调里处理了

  const 条们 = (数据 && 数据.条们) || []
  const 一共 = (数据 && 数据.一共) || 条们.length

  // 清空聊天区（但把开场那段留着 —— 它可能已经被移除了，那就重建不了，
  // 所以只在有记录的时候清）
  for (const 节点 of Array.from(聊天区.children)) {
    if (节点.id !== '更早' && 节点.id !== '开场') 节点.remove()
  }

  已画条数 = 0
  上次画到哪天 = ''
  if (条们.length) 收开场()
  画记录(条们)

  更早.hidden = 一共 <= 已画条数
  提示(`全部 ${一共} 条记录都在上面了`)
})

// ============================================================
// 模式和干活目录
// ============================================================
//
// 【为什么这两个要固定摆在左侧】
//   "她现在能不能动手"（模式）和"她会动哪个文件夹"（目录）——
//   看不见这两个，他会以为她能查、或者以为她要动他别的文件。
//   而且这两件事在程序层面是真的会变的（chat 模式连工具说明都不给她），
//   所以放进“当前对话”状态卡；顶栏只留全局操作。

const 模式开关 = document.getElementById('模式开关')
const 工作区按钮 = document.getElementById('工作区按钮')
const 工作区名 = document.getElementById('工作区名')
const 学习状态板 = document.getElementById('学习状态板')
const 学习状态刷新 = document.getElementById('学习状态刷新')
const 学习课程 = document.getElementById('学习课程')
const 学习章节 = document.getElementById('学习章节')
const 学习下一步 = document.getElementById('学习下一步')
const 学习复习时间 = document.getElementById('学习复习时间')

/** 刷新当前对话的长期记忆开关；聊天记录始终另存。 */
function 摆长期记忆(要写) {
  当前写长期记忆 = 要写 !== false
  记忆开关.textContent = 当前是临时对话 ? '不保存' : 当前写长期记忆 ? '开启' : '关闭'
  记忆开关.classList.toggle('关着', !当前写长期记忆)
  记忆开关.title = 当前是临时对话
    ? '临时对话不会写聊天记录、长期记忆或学习进度'
    : 当前写长期记忆
      ? '会从这段对话新增长期记忆；聊天记录也会保存'
      : '不从这段对话新增长期记忆；聊天记录仍会保存'
}

let 当前模式 = 'chat'
let 当前工作区 = null
let 正在刷新学习状态 = false

/** 空字符串就是进度.md 没写，界面只说“还没定”，不替他补。 */
function 画学习状态(果) {
  const 读不到 = !果 || 果.好 === false
  const 空态 = 读不到 ? '暂时读不到' : '还没定'
  const 摆 = (元素, 值) => {
    const 有值 = typeof 值 === 'string' && 值.trim()
    元素.textContent = 有值 ? 值.trim() : 空态
    元素.classList.toggle('空态', !有值)
  }

  摆(学习课程, 果 && 果.课程)
  摆(学习章节, 果 && 果.当前章节)
  摆(学习下一步, 果 && 果.下一步)
  摆(学习复习时间, 果 && 果.复习时间)
  学习状态板.classList.toggle('读不到', 读不到)
  学习状态板.title = 读不到 ? (果 && 果.说明) || '学习进度暂时读不到' : '来自学习区的进度.md'
}

/** 每次都从主进程现读进度.md，不缓存。 */
async function 刷新学习状态(要提示 = false) {
  if (正在刷新学习状态) return
  正在刷新学习状态 = true
  学习状态刷新.classList.add('转着')
  try {
    const 果 = await window.爱莉.问学习状态()
    画学习状态(果)
    if (要提示) 提示(果 && 果.好 === false ? 果.说明 : '学习进度已刷新')
  } catch (错误) {
    画学习状态({ 好: false, 说明: 错误.message })
    if (要提示) 提示('学习进度读不出来：' + 错误.message, '#c9779d')
  } finally {
    正在刷新学习状态 = false
    学习状态刷新.classList.remove('转着')
  }
}

/**
 * 三种模式各自的样子（2026-10-07 从两种加到三种）
 *
 * 顺序也有讲究：点左侧模式行就是照 模式顺序 这个圈转。
 * 三种模式的时候，转圈比弹菜单省事，而且他按两下就能到想去的那个。
 */
const 模式表 = {
  chat: {
    中文: '聊天',
    开关说明: '现在只能说话 · 点一下切到干活',
    小字: '聊天模式：她只跟你说话（想让她干活、或者陪你学，点左侧的模式）',
    开场: '呀，你来了♪ 我刚刚还在想，今天要不要讲点什么呢。',
    开场小字: '想说什么就说吧，我在这儿呢。',
    输入提示: '跟她说点什么……（回车发送；图片可以直接粘贴）',
  },
  work: {
    中文: '干活',
    开关说明: '现在能用工具（写文件、跑命令要你点头）· 点一下切到学习',
    小字: '干活模式：她能查、能读、能写、能跑 —— 写和跑会先问你',
    开场: '今天要动点什么呀♪ 写点什么、跑一段、还是先去翻翻看？',
    开场小字: '要写文件、跑命令之前，我会先问你一声。',
    输入提示: '让她做点什么……（回车发送；图片可以直接粘贴）',
  },
  learn: {
    中文: '学习',
    开关说明: '现在陪你学课（能读材料、记笔记、跑例子，要你点头）· 点一下切回聊天',
    小字: '学习模式：陪你学课 —— 课件放进学习区，她读得到；记笔记会先问你',
    开场: '今天想学哪一门呀？',
    开场小字: '课件放进学习区就行 —— 讲过的我会记进账本，不会让你从头再来。',
    输入提示: '问点什么……（回车发送；课件、截图都能直接发我）',
  },
}

/** 点开关的时候按这个顺序转：聊天 → 干活 → 学习 → 聊天 */
const 模式顺序 = ['chat', 'work', 'learn']

/** 把模式的显示刷新一下 */
function 摆模式(模式) {
  // 认不出来的一律当聊天 —— 主进程那边也是这么兜的，两头一致
  当前模式 = 模式表[模式] ? 模式 : 'chat'
  const 这 = 模式表[当前模式]
  const 能动手 = 当前模式 !== 'chat'

  模式开关.textContent = 这.中文
  模式开关.classList.toggle('干活模式', 当前模式 === 'work')
  模式开关.classList.toggle('学习模式', 当前模式 === 'learn')
  模式开关.title = 这.开关说明

  // 干活目录只在会动手的模式下露出来 —— 聊天模式下那个目录没有意义
  工作区按钮.hidden = !能动手

  // 【背景图跟着模式换 —— 2026-10-07 加的】
  //   三张图，三种模式各一张：文件名和位置都写在 style.css 的 .背景层 那一段。
  //   这儿只负责给 body 这个标签挂上 / 拿掉类名，不碰图片本身。
  //
  //   【为什么改过一次】原来这儿写的是"能动手就用干活那张"——
  //     那时候只有两张图，学习模式借用了干活那张。
  //     后来他给学习单独挑了一张（她比取景框手势那张），就改成各挂各的了。
  //
  //   为什么放在 摆模式() 里，不放在下面"模式变了"的回调里：
  //   启动时也要走这一趟 —— 不然刚打开那一瞬间背景是聊天那张，
  //   哪怕她其实在干活模式。而 摆模式() 两边都会经过。
  document.body.classList.toggle('干活', 当前模式 === 'work')
  document.body.classList.toggle('学习', 当前模式 === 'learn')

  // 底下那行小字说一句，免得他忘了自己在哪个模式
  提示(这.小字)

  // 开场白也跟着模式换 —— 不然切了模式，中间那句还是"今天要不要讲点什么呢"，
  // 看着就像"换了但没换"。台词在 模式表 里。
  //
  // 【为什么要判空】说过话之后，开场那一整块会被 收开场() 从页面上摘掉
  // （`开场.remove()`），那时候这两个元素就不存在了，直接赋值会报错。
  // 而 摆模式() 是随时可能被叫的（切模式、托盘切、启动）。
  const 开场白 = document.getElementById('开场白')
  const 开场小字 = document.getElementById('开场小字')
  if (开场白) 开场白.textContent = 这.开场
  if (开场小字) 开场小字.textContent = 这.开场小字

  // 输入框里那句灰字也跟着换 —— 它原来三个模式共用一句
  // （"跟她说点什么"放在干活模式里也不太对：那会儿他是让她做点什么）
  输入.placeholder = 这.输入提示

  // 【任务按钮只在学习模式下露出来】—— 那张清单是"这门课接下来做什么"，
  //   聊天和干活模式下它没有意义，摆在那儿只会占地方。
  //   （跟旁边那个"干活目录"一个道理，那个也是按模式露的。）
  任务开关.hidden = 当前模式 !== 'learn'
  工作索引入口.hidden = 当前模式 !== 'work'
  学习状态板.hidden = 当前模式 !== 'learn'
  if (当前模式 === 'learn') void 刷新学习状态()
  if (当前模式 === 'work') void 刷新工作索引()

  // 切走的时候把抽屉收起来 —— 不收的话它会一直盖在聊天区上，
  // 而那时候他已经不在学习模式了，那个抽屉对他是个碍事的东西。
  if (当前模式 !== 'learn') 收起任务抽屉()
  if (当前模式 !== 'work') 收起工作索引抽屉()
}

/** 把干活目录的显示刷新一下 */
function 摆工作区(目录) {
  当前工作区 = 目录 || null
  // 太长的话只留最后一节 —— 认得出是哪个文件夹的是尾巴，不是盘符
  if (!目录) {
    工作区名.textContent = '默认'
    工作区按钮.title = '现在在她自己那层干活 · 点一下换一个文件夹'
  } else {
    const 节 = 目录.split(/[\\/]/).filter(Boolean)
    工作区名.textContent = 节[节.length - 1] || 目录
    工作区按钮.title = '干活目录：' + 目录 + '（点一下换）'
  }
}

// 窗口一打开先问一次：现在什么模式、在哪个目录
window.爱莉
  .问模式和目录()
  .then(({ 模式, 工作区, 写长期记忆, 临时 }) => {
    当前是临时对话 = !!临时
    摆模式(模式)
    摆工作区(工作区)
    摆长期记忆(写长期记忆)
    记忆开关.disabled = 当前是临时对话
    记忆开关.classList.toggle('临时锁定', 当前是临时对话)
  })
  .catch(() => {
    /* 问不到就按默认的显示 */
    摆模式('chat')
    摆长期记忆(true)
  })

记忆开关.addEventListener('click', async () => {
  const 原来 = 当前写长期记忆
  const 要写 = !原来
  摆长期记忆(要写)
  记忆开关.disabled = true
  try {
    const 结果 = await window.爱莉.设长期记忆(要写)
    摆长期记忆(结果.写长期记忆)
    提示(结果.写长期记忆 ? '这段会写入新的长期记忆' : '这段不写长期记忆，聊天记录仍会保存')
  } catch (错误) {
    摆长期记忆(原来)
    提示('记忆开关没改成：' + 错误.message, '#c9779d')
  } finally {
    记忆开关.disabled = false
  }
})

// 点模式按钮：按 聊天 → 干活 → 学习 → 聊天 转一圈
//
// 【2026-10-08 改的：先本地切，再跟主进程对账】
//   原来只在 await 回来之后才 摆模式()，"现在这一格是什么"得等一个来回才知道。
//   他连点两下（想从聊天一路点到学习）的时候，第二下读到的 当前模式 还是旧的 ——
//   两次算出同一个"下一个"，**两下只前进了一格**。
//   他手感上是"点了没反应"，其实是被自己第一次点击的延迟追上了。
//   现在点下去先本地摆好，连点两下就稳稳前进两格。
//   主进程答复回来若跟本地不一致，以它为准（它那边才是真的）。
模式开关.addEventListener('click', async () => {
  const 下一个 = 模式顺序[(模式顺序.indexOf(当前模式) + 1) % 模式顺序.length]
  摆模式(下一个)
  try {
    const 结果 = await window.爱莉.换模式(下一个)
    摆模式(结果.模式)
    摆工作区(结果.工作区)
  } catch (错误) {
    提示('换模式失败：' + 错误.message, '#c9779d')
    // 本地先摆的那个不算数了 —— 问主进程现在到底是什么，
    // 别让他停在一个界面上写着"学习"、实际还是"聊天"的假模式上。
    try {
      const 现在 = await window.爱莉.问模式和目录()
      摆模式(现在.模式)
      摆工作区(现在.工作区)
    } catch {
      /* 问都问不到就先这样 */
    }
  }
})

// 点目录按钮：弹系统的选文件夹框
工作区按钮.addEventListener('click', async () => {
  try {
    const 结果 = await window.爱莉.选工作区()
    if (结果 && 结果.工作区) {
      摆工作区(结果.工作区)
      提示('干活目录换成：' + 结果.工作区)
    }
  } catch (错误) {
    提示('选目录失败：' + 错误.message, '#c9779d')
  }
})

// 托盘菜单里也能改模式和目录 —— 改了他那边要跟着变
window.爱莉.模式变了(({ 模式, 工作区 }) => {
  摆模式(模式)
  摆工作区(工作区)
})

学习状态刷新.addEventListener('click', () => void 刷新学习状态(true))

// 他在编辑器里手改进度.md 后，不用重启。学习模式可见时每两秒现读一次；
// 窗口重新获得焦点也马上读，通常切回来的那一下就能看到。
setInterval(() => {
  if (当前模式 === 'learn' && !document.hidden) void 刷新学习状态()
}, 2000)
window.addEventListener('focus', () => {
  if (当前模式 === 'learn') void 刷新学习状态()
})

// ============================================================
// 设置：DeepSeek API Key
// ============================================================

let 上次陪伴活动上报 = 0

function 当前陪伴界面状态() {
  const 焦点 = document.activeElement
  const 正在写输入框 = 焦点 === 输入 && Boolean(输入.value.trim())
  return {
    正在录音: 语音输入状态 !== '空闲',
    正在播放语音: 流式朗读.忙吗(),
    正在编辑: !设置遮罩.classList.contains('收着') || 正在写输入框,
    全屏: Boolean(document.fullscreenElement),
    勿扰: false,
  }
}

function 报告陪伴活动(强制 = false) {
  const 现在 = Date.now()
  if (!强制 && 现在 - 上次陪伴活动上报 < 2000) return
  上次陪伴活动上报 = 现在
  window.爱莉.报告主动陪伴活动(当前陪伴界面状态())
}

function 同步陪伴界面状态() {
  window.爱莉.报告主动陪伴界面状态(当前陪伴界面状态())
}

// 只把真实的人机交互当作活动；模型吐字和回复完成不会重置空闲计时。
document.addEventListener('pointerdown', () => 报告陪伴活动(), { capture: true })
document.addEventListener('keydown', () => 报告陪伴活动(), { capture: true })
document.addEventListener('input', () => 报告陪伴活动(), { capture: true })
document.addEventListener('fullscreenchange', 同步陪伴界面状态)
window.addEventListener('focus', () => 报告陪伴活动(true))
setInterval(同步陪伴界面状态, 30000)
同步陪伴界面状态()

let 可以加密保存 = true
let 可以加密保存搜索密钥 = true

function 设置忙着(忙) {
  保存密钥.disabled = 忙 || !可以加密保存
  测试密钥.disabled = 忙
  清除密钥.disabled = 忙
  保存搜索密钥.disabled = 忙 || !可以加密保存搜索密钥
  测试搜索密钥.disabled = 忙
  清除搜索密钥.disabled = 忙
  保存主动陪伴.disabled = 忙
  测试主动陪伴.disabled = 忙
  打开数据目录.disabled = 忙
  导出备份.disabled = 忙
}

function 画搜索密钥状态(一个) {
  if (!一个) {
    搜索密钥状态字.textContent = '没有读到搜索凭据状态。'
    return
  }
  搜索密钥状态字.textContent = 一个.有可用密钥
    ? `正在使用：${一个.遮住的密钥}　·　来源：${一个.来源}`
    : '还没有配置 SerpAPI Key；联网搜索会明确失败，不会回退到旧网页抓取。'
  可以加密保存搜索密钥 = Boolean(一个.可加密保存)
  保存搜索密钥.disabled = !可以加密保存搜索密钥
  if (!一个.可加密保存) 设置结果.textContent = 'Windows 加密存储暂时不可用，不能保存新 Key。'
}

async function 刷新搜索密钥状态() {
  try {
    画搜索密钥状态(await window.爱莉.搜索密钥状态())
  } catch (错误) {
    搜索密钥状态字.textContent = '读取失败：' + 错误.message
  }
}

/** 读回当前搜索后端，并把状态说清楚（尤其：选了 SerpAPI 却还没填 Key）。 */
function 画搜索供应商状态(一个) {
  if (!一个) {
    搜索供应商状态字.textContent = '没有读到搜索后端状态。'
    return
  }
  const 当前 = 一个.当前 === 'serpapi' ? 'serpapi' : 'deepseek'
  if (搜索供应商下拉) 搜索供应商下拉.value = 当前
  搜索供应商状态字.textContent = 当前 === 'serpapi'
    ? (一个.有SerpAPI密钥
      ? '当前：SerpAPI Google Search（已填 Key）'
      : '当前：SerpAPI Google Search —— 还没有填 SerpAPI Key，联网搜索会明确失败')
    : '当前：DeepSeek 原生搜索，与聊天共用同一把钥匙'
}

async function 刷新搜索供应商() {
  try {
    画搜索供应商状态(await window.爱莉.搜索供应商状态())
  } catch (错误) {
    搜索供应商状态字.textContent = '读取失败：' + 错误.message
  }
}

if (搜索供应商下拉) {
  搜索供应商下拉.addEventListener('change', async () => {
    const 想要 = 搜索供应商下拉.value
    搜索供应商下拉.disabled = true
    try {
      const 结果 = await window.爱莉.设置搜索供应商(想要)
      if (!结果 || !结果.好) {
        搜索供应商状态字.textContent = '切换失败：' + ((结果 && 结果.说明) || '未知原因')
      } else {
        画搜索供应商状态(结果)
      }
    } catch (错误) {
      搜索供应商状态字.textContent = '切换失败：' + 错误.message
    } finally {
      搜索供应商下拉.disabled = false
      // 切到 SerpAPI 时，Key 状态那句提示也要跟着变
      await 刷新搜索密钥状态()
    }
  })
}

function 画密钥状态(一个) {
  if (!一个) {
    密钥状态字.textContent = '没有读到凭据状态。'
    return
  }
  if (!一个.有可用密钥) {
    密钥状态字.textContent = '还没有可用的 API Key。填好后点“保存”。'
  } else {
    密钥状态字.textContent = `正在使用：${一个.遮住的密钥}　·　来源：${一个.来源}`
  }
  可以加密保存 = Boolean(一个.可加密保存)
  保存密钥.disabled = !可以加密保存
  if (!一个.可加密保存) 设置结果.textContent = 'Windows 加密存储暂时不可用，不能保存新 Key。'
}

async function 刷新密钥状态() {
  try {
    画密钥状态(await window.爱莉.密钥状态())
  } catch (错误) {
    密钥状态字.textContent = '读取失败：' + 错误.message
  }
}

async function 载入麦克风偏好() {
  try {
    const 一个 = await window.爱莉.语音输入设置()
    麦克风设备编号 = String(一个 && 一个.麦克风设备 || '')
  } catch (错误) {
    麦克风设备编号 = ''
    if (麦克风设备状态) 麦克风设备状态.textContent = '读取麦克风设置失败：' + 错误.message
  }
}

let 主动陪伴界面数据 = null

function 画主动陪伴设置(一个) {
  主动陪伴界面数据 = 一个 ? { ...一个 } : null
  const 配置 = (一个 && 一个.配置) || {}
  主动陪伴开启.checked = 配置.开启 === true
  陪伴最短.value = Number(配置.最短分钟) || 45
  陪伴最长.value = Number(配置.最长分钟) || 120
  安静时段开启.checked = 配置.安静时段开启 !== false
  安静开始.value = 配置.安静开始 || '23:30'
  安静结束.value = 配置.安静结束 || '08:00'
  陪伴每日上限.value = Number(配置.每日上限) || 3
  画主动陪伴状态(一个)
}

function 画主动陪伴状态(一个) {
  const 配置 = (一个 && 一个.配置) || {
    开启: 主动陪伴开启.checked,
    每日上限: Number(陪伴每日上限.value) || 3,
  }
  const 次数 = Number(一个 && 一个.今日次数) || 0
  const 上限 = Number(配置.每日上限) || 3
  let 首行 = ''
  if (!配置.开启) 首行 = `当前已关闭 · 今天 ${次数}/${上限}`
  else {
    const 到期 = Number(一个 && 一个.下次到期)
    const 时间 = 到期 ? new Date(到期).toLocaleString('zh-CN', { hour12: false }) : '等待活动后安排'
    首行 = `已开启 · 今天 ${次数}/${上限} · 下次检查 ${时间}。只发送文字，不自动朗读。`
  }
  const 最近 = 一个 && 一个.最近结果
  const 最近时间 = 最近 && 最近.时间 ? new Date(最近.时间).toLocaleTimeString('zh-CN', { hour12: false }) : ''
  const 次行 = 最近 && 最近.状态 && 最近.状态 !== '尚未尝试'
    ? `最近：${最近.状态}${最近时间 ? ` · ${最近时间}` : ''}${最近.说明 ? ` · ${最近.说明}` : ''}`
    : '最近：尚未尝试'
  主动陪伴状态字.textContent = `${首行}\n${次行}`
}

async function 载入主动陪伴设置() {
  try {
    画主动陪伴设置(await window.爱莉.主动陪伴设置())
  } catch (错误) {
    主动陪伴状态字.textContent = '读取主动陪伴设置失败：' + 错误.message
  }
}

window.爱莉.主动陪伴状态变了((最近结果) => {
  主动陪伴界面数据 = {
    ...(主动陪伴界面数据 || {}),
    配置: (主动陪伴界面数据 && 主动陪伴界面数据.配置) || { 开启: 主动陪伴开启.checked, 每日上限: Number(陪伴每日上限.value) || 3 },
    最近结果,
  }
  画主动陪伴状态(主动陪伴界面数据)
})

function 画麦克风设备(设备们) {
  const 选中的 = 麦克风设备编号
  麦克风设备.replaceChildren(new Option('系统默认', ''))
  let 序号 = 0
  for (const 设备 of 设备们) {
    if (设备.kind !== 'audioinput' || !设备.deviceId || 设备.deviceId === 'default') continue
    序号++
    麦克风设备.add(new Option(设备.label || `麦克风 ${序号}`, 设备.deviceId))
  }
  if (选中的 && !设备们.some((一项) => 一项.kind === 'audioinput' && 一项.deviceId === 选中的)) {
    const 失效项 = new Option('上次选择的麦克风（当前未找到）', 选中的, true, true)
    失效项.disabled = true
    麦克风设备.add(失效项)
    麦克风设备状态.textContent = '上次选择的设备当前不可用；请选择系统默认或点刷新。'
  } else {
    麦克风设备.value = 选中的
    麦克风设备状态.textContent = 序号 ? `找到 ${序号} 个可选麦克风。` : '暂时只能使用系统默认；点刷新可请求权限并显示设备名称。'
  }
}

async function 刷新麦克风列表(申请权限 = false) {
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== 'function') {
    麦克风设备状态.textContent = '这台设备不能列出麦克风。'
    return
  }
  if (申请权限 && 语音输入状态 !== '空闲') {
    麦克风设备状态.textContent = '请先关闭通话或结束当前录音，再刷新设备。'
    return
  }
  刷新麦克风.disabled = true
  麦克风设备状态.textContent = 申请权限 ? '正在读取麦克风设备…' : '正在读取设备…'
  let 临时流 = null
  try {
    if (申请权限) 临时流 = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    画麦克风设备(await navigator.mediaDevices.enumerateDevices())
  } catch (错误) {
    麦克风设备状态.textContent = 错误 && (错误.name === 'NotAllowedError' || 错误.name === 'SecurityError')
      ? '没有获得麦克风权限，设备名称无法读取。'
      : '读取设备失败：' + String(错误 && 错误.message || '未知原因')
  } finally {
    if (临时流) for (const 轨 of 临时流.getTracks()) 轨.stop()
    刷新麦克风.disabled = false
  }
}

// ---------- 表达反馈查看页（只读） ----------

let 表达反馈条目 = []
let 当前表达标签 = ''

function 画表达反馈() {
  const 给 = 当前表达标签
    ? 表达反馈条目.filter((一) => Array.isArray(一.标签) && 一.标签.includes(当前表达标签))
    : 表达反馈条目
  表达反馈统计.textContent = 当前表达标签
    ? `${给.length} 条带“${当前表达标签}”的真实回复 · 当前只读`
    : `${表达反馈条目.length} 条真实回复 · 当前只读`
  表达反馈列表.textContent = ''
  if (!给.length) {
    const 空 = document.createElement('div')
    空.className = '表达反馈空态'
    空.textContent = 表达反馈条目.length
      ? '这个标签下还没有样本。'
      : '还没有样本。回到聊天，把鼠标移到她的回复下方，点 ◇ 标记一条。'
    表达反馈列表.appendChild(空)
    return
  }
  for (const 条 of 给) {
    const 卡 = document.createElement('article')
    卡.className = '表达反馈卡'
    const 标签区 = document.createElement('div')
    标签区.className = '表达反馈卡标签'
    for (const 标签 of 条.标签 || []) {
      const 小 = document.createElement('span')
      小.textContent = 标签
      标签区.appendChild(小)
    }
    const 正文 = document.createElement('div')
    正文.className = '表达反馈正文'
    正文.textContent = 条.内容 || ''
    const 来源 = document.createElement('div')
    来源.className = '表达反馈来源'
    来源.textContent = `${条.消息时间 || '时间未记录'} · 会话 ${条.对话 || '未记录'}`
    卡.append(标签区, 正文, 来源)
    表达反馈列表.appendChild(卡)
  }
}

async function 打开表达反馈页() {
  关设置()
  表达反馈遮罩.classList.remove('收着')
  表达反馈遮罩.setAttribute('aria-hidden', 'false')
  表达反馈统计.textContent = '正在读取……'
  表达反馈列表.innerHTML = '<div class="表达反馈空态">正在读取反馈……</div>'
  try {
    const 结果 = await window.爱莉.列出表达反馈()
    if (!结果 || !结果.好) throw new Error((结果 && 结果.说明) || '读取失败')
    表达反馈条目 = Array.isArray(结果.条目) ? 结果.条目 : []
    画表达反馈()
  } catch (错误) {
    表达反馈条目 = []
    表达反馈统计.textContent = '读取失败'
    表达反馈列表.innerHTML = ''
    const 空 = document.createElement('div')
    空.className = '表达反馈空态 错误'
    空.textContent = 错误.message
    表达反馈列表.appendChild(空)
  }
}

function 关表达反馈页() {
  表达反馈遮罩.classList.add('收着')
  表达反馈遮罩.setAttribute('aria-hidden', 'true')
}

表达反馈筛选.addEventListener('click', (事件) => {
  const 按钮 = 事件.target.closest('[data-表达标签]')
  if (!按钮) return
  当前表达标签 = 按钮.dataset.表达标签 || ''
  for (const 一 of 表达反馈筛选.querySelectorAll('[data-表达标签]')) 一.classList.toggle('选中', 一 === 按钮)
  画表达反馈()
})
查看表达反馈.addEventListener('click', () => void 打开表达反馈页())
表达反馈关闭.addEventListener('click', 关表达反馈页)
表达反馈遮罩.addEventListener('click', (事件) => {
  if (事件.target === 表达反馈遮罩) 关表达反馈页()
})

async function 打开设置() {
  设置遮罩.classList.remove('收着')
  设置遮罩.setAttribute('aria-hidden', 'false')
  设置结果.textContent = ''
  await Promise.all([刷新密钥状态(), 刷新搜索供应商(), 刷新搜索密钥状态(), 载入麦克风偏好(), 载入主动陪伴设置()])
  await 刷新麦克风列表(false)
  同步陪伴界面状态()
}

麦克风设备.addEventListener('change', async () => {
  const 新编号 = String(麦克风设备.value || '')
  麦克风设备.disabled = true
  try {
    const 结果 = await window.爱莉.保存麦克风设备(新编号)
    if (!结果 || !结果.好) throw new Error(结果 && 结果.说明 || '保存失败')
    麦克风设备编号 = 新编号
    麦克风设备状态.textContent = 新编号 ? '已保存；下一次录音会使用这个麦克风。' : '已改为使用系统默认麦克风。'
  } catch (错误) {
    麦克风设备.value = 麦克风设备编号
    麦克风设备状态.textContent = '保存失败：' + 错误.message
  } finally {
    麦克风设备.disabled = false
  }
})

刷新麦克风.addEventListener('click', () => void 刷新麦克风列表(true))
void 载入麦克风偏好()

保存主动陪伴.addEventListener('click', async () => {
  设置忙着(true)
  主动陪伴状态字.textContent = '正在保存……'
  try {
    const 结果 = await window.爱莉.保存主动陪伴设置({
      开启: 主动陪伴开启.checked,
      最短分钟: 陪伴最短.value,
      最长分钟: 陪伴最长.value,
      安静时段开启: 安静时段开启.checked,
      安静开始: 安静开始.value,
      安静结束: 安静结束.value,
      每日上限: 陪伴每日上限.value,
    })
    if (!结果 || !结果.好) throw new Error((结果 && 结果.说明) || '保存失败')
    画主动陪伴设置(结果)
    设置结果.textContent = 结果.配置.开启
      ? '主动陪伴已开启；达到条件后会向当前正式对话发送一条文字。'
      : '主动陪伴已彻底关闭。'
  } catch (错误) {
    主动陪伴状态字.textContent = '保存失败：' + 错误.message
  } finally {
    设置忙着(false)
  }
})

测试主动陪伴.addEventListener('click', async () => {
  if (!主动陪伴开启.checked) {
    主动陪伴状态字.textContent = '请先开启并保存主动陪伴，再测试。'
    return
  }
  关设置()
  提示('正在生成一条主动陪伴测试消息……')
  try {
    const 结果 = await window.爱莉.测试主动陪伴()
    提示(结果 && 结果.好 ? '主动陪伴测试消息已写入当前对话' : '这次没有发送：' + ((结果 && 结果.说明) || '未知原因'), 结果 && 结果.好 ? undefined : '#c9779d')
  } catch (错误) {
    提示('主动陪伴测试失败：' + 错误.message, '#c9779d')
  }
})

function 关设置() {
  设置遮罩.classList.add('收着')
  设置遮罩.setAttribute('aria-hidden', 'true')
  密钥输入.value = ''
  密钥输入.type = 'password'
  显示密钥.textContent = '显示'
  搜索密钥输入.value = ''
  搜索密钥输入.type = 'password'
  显示搜索密钥.textContent = '显示'
  设置结果.textContent = ''
  同步陪伴界面状态()
}

设置开关.addEventListener('click', 打开设置)
设置关闭.addEventListener('click', 关设置)
设置遮罩.addEventListener('click', (事件) => {
  if (事件.target === 设置遮罩) 关设置()
})

显示密钥.addEventListener('click', () => {
  const 要显示 = 密钥输入.type === 'password'
  密钥输入.type = 要显示 ? 'text' : 'password'
  显示密钥.textContent = 要显示 ? '隐藏' : '显示'
  密钥输入.focus()
})

显示搜索密钥.addEventListener('click', () => {
  const 要显示 = 搜索密钥输入.type === 'password'
  搜索密钥输入.type = 要显示 ? 'text' : 'password'
  显示搜索密钥.textContent = 要显示 ? '隐藏' : '显示'
  搜索密钥输入.focus()
})

保存密钥.addEventListener('click', async () => {
  const 值 = 密钥输入.value.trim()
  if (!值) {
    设置结果.textContent = '请先填写 API Key。'
    密钥输入.focus()
    return
  }
  设置忙着(true)
  设置结果.textContent = '正在加密保存……'
  try {
    const 结果 = await window.爱莉.保存密钥(值)
    if (!结果.好) throw new Error(结果.说明 || '保存失败')
    密钥输入.value = ''
    画密钥状态(结果.状态)
    设置结果.textContent = '保存好了，下一次对话会直接使用。'
  } catch (错误) {
    设置结果.textContent = '保存失败：' + 错误.message
  } finally {
    设置忙着(false)
  }
})

测试密钥.addEventListener('click', async () => {
  设置忙着(true)
  设置结果.textContent = '正在连接 DeepSeek（会产生极少量 token）……'
  try {
    const 结果 = await window.爱莉.测试密钥()
    设置结果.textContent = 结果.通 ? '连接成功：' + 结果.说明 : '连接失败：' + 结果.说明
  } catch (错误) {
    设置结果.textContent = '测试失败：' + 错误.message
  } finally {
    设置忙着(false)
  }
})

清除密钥.addEventListener('click', async () => {
  if (!window.confirm('清除设置界面保存的 API Key？环境变量或 DSH 凭据仍可能继续生效。')) return
  设置忙着(true)
  try {
    const 结果 = await window.爱莉.清除密钥()
    if (!结果.好) throw new Error(结果.说明 || '清除失败')
    画密钥状态(结果.状态)
    设置结果.textContent = 结果.状态.有可用密钥
      ? '已清除加密保存的 Key，现在会使用其他可用来源。'
      : '已清除。现在没有可用的 API Key。'
  } catch (错误) {
    设置结果.textContent = '清除失败：' + 错误.message
  } finally {
    设置忙着(false)
  }
})

保存搜索密钥.addEventListener('click', async () => {
  const 值 = 搜索密钥输入.value.trim()
  if (!值) {
    设置结果.textContent = '请先填写 SerpAPI Key。'
    搜索密钥输入.focus()
    return
  }
  设置忙着(true)
  设置结果.textContent = '正在加密保存 SerpAPI Key……'
  try {
    const 结果 = await window.爱莉.保存搜索密钥(值)
    if (!结果.好) throw new Error(结果.说明 || '保存失败')
    搜索密钥输入.value = ''
    画搜索密钥状态(结果.状态)
    设置结果.textContent = '搜索 Key 保存好了，下一次联网查询会使用 SerpAPI。'
  } catch (错误) {
    设置结果.textContent = '保存搜索 Key 失败：' + 错误.message
  } finally {
    设置忙着(false)
  }
})

测试搜索密钥.addEventListener('click', async () => {
  设置忙着(true)
  设置结果.textContent = '正在执行一次 SerpAPI Google Search（命中缓存时免费，否则通常计 1 次）……'
  try {
    const 结果 = await window.爱莉.测试搜索密钥()
    设置结果.textContent = 结果.通 ? '搜索连接成功：' + 结果.说明 : '搜索连接失败：' + 结果.说明
  } catch (错误) {
    设置结果.textContent = '测试搜索失败：' + 错误.message
  } finally {
    设置忙着(false)
  }
})

清除搜索密钥.addEventListener('click', async () => {
  if (!window.confirm('清除设置界面保存的 SerpAPI Key？环境变量仍可能继续生效。')) return
  设置忙着(true)
  try {
    const 结果 = await window.爱莉.清除搜索密钥()
    if (!结果.好) throw new Error(结果.说明 || '清除失败')
    画搜索密钥状态(结果.状态)
    设置结果.textContent = 结果.状态.有可用密钥
      ? '已清除加密保存的搜索 Key，现在会使用环境变量。'
      : '已清除。联网搜索会停止，不会回退到旧 Bing 抓取。'
  } catch (错误) {
    设置结果.textContent = '清除搜索 Key 失败：' + 错误.message
  } finally {
    设置忙着(false)
  }
})

打开数据目录.addEventListener('click', async () => {
  设置结果.textContent = '正在打开数据目录……'
  try {
    const 结果 = await window.爱莉.打开用户数据目录()
    设置结果.textContent = 结果.好 ? '数据目录已经打开。' : '打开失败：' + (结果.说明 || '未知原因')
  } catch (错误) {
    设置结果.textContent = '打开失败：' + 错误.message
  }
})

导出备份.addEventListener('click', async () => {
  设置忙着(true)
  设置结果.textContent = '请选择保存位置。选择后会在后台压缩，不影响聊天。'
  try {
    const 结果 = await window.爱莉.导出用户备份()
    if (结果.取消了) {
      设置结果.textContent = '已取消导出。'
    } else if (!结果.好) {
      throw new Error(结果.说明 || '导出失败')
    } else {
      const 大小 = (结果.压缩字节 / 1024 / 1024).toFixed(1)
      设置结果.textContent = `备份完成：${结果.文件数} 个文件，${大小} MB。`
    }
  } catch (错误) {
    设置结果.textContent = '导出失败：' + 错误.message
  } finally {
    设置忙着(false)
  }
})

// 收起来（她还在托盘上）
收起按钮.addEventListener('click', () => window.爱莉.收起来('—按钮'))

// × ：全部关掉 —— 她 + 桌宠 + 声音，一个不留。
//
// 【2026-10-03 改的：以前 × 跟「—」一模一样】
//   他提的："那个界面上的 - 和 x 的功能重复了。"
//   那时候 `—`、`×`、双击顶栏、Esc 四个入口全是"收起来"。
//
//   当初为什么那么做：9 月 27 号他点 × 之后程序退了，可 python 还在后台
//   啃着一千多兆，托盘上那朵花也没了 —— 既进不去、也没关干净。
//   于是干脆让 × 也收起来，把"真退"挪到托盘菜单里。
//   但那个理由现在不成立了：**"全部关掉"已经能把声音和桌宠一起带走。**
//
// 【为什么还是要问一句】
//   关掉容易，回来贵 —— 声音要重新加载两分半。
//   而这一个键就在窗口角上，鼠标滑一下就点到了。
//   挡一下的成本是一秒钟，不挡的成本是两分半。
const 退出按钮 = document.getElementById('退出')
退出按钮.addEventListener('click', async () => {
  const 准了 = await 问一句('爱莉希雅、桌宠和声音服务会一起退出。下次启动声音需要约两分半。', '全部关掉', '继续运行')
  if (准了) window.爱莉.全部关掉()
})

/**
 * 在窗口中央弹一张小卡片问一句，等他点。
 *
 * 【为什么不复用工具审批那套（弹确认卡片）】
 *   那套是"她要动手、要他点头"，带着编号、结果要递给工具那边。
 *   这个是纯界面上的事，跟工具、跟她的对话都没关系。
 *   硬套过去会让"编号"和"等答复"那套机制多一个来路不明的成员 ——
 *   那种东西最难查。
 *
 * @returns {Promise<boolean>}
 */
function 问一句(问题, 准了的字, 算了的字) {
  return new Promise((完成) => {
    const 先前焦点 = document.activeElement
    const 遮罩 = document.createElement('div')
    遮罩.className = '退出确认遮罩'
    const 卡 = document.createElement('section')
    卡.className = '退出确认卡'
    卡.setAttribute('role', 'alertdialog')
    卡.setAttribute('aria-modal', 'true')
    卡.setAttribute('aria-labelledby', '退出确认标题')
    卡.setAttribute('aria-describedby', '退出确认说明')
    const 图标 = document.createElement('div')
    图标.className = '退出确认图标'
    图标.setAttribute('aria-hidden', 'true')
    图标.textContent = '◇'
    const 标题 = document.createElement('strong')
    标题.id = '退出确认标题'
    标题.textContent = '要全部关掉吗？'
    const 说明 = document.createElement('p')
    说明.id = '退出确认说明'
    说明.textContent = 问题
    const 操作 = document.createElement('div')
    操作.className = '退出确认操作'
    const 算了 = document.createElement('button')
    算了.type = 'button'
    算了.className = '继续运行'
    算了.textContent = 算了的字
    const 准了 = document.createElement('button')
    准了.type = 'button'
    准了.className = '全部关掉'
    准了.textContent = 准了的字
    操作.append(算了, 准了)
    卡.append(图标, 标题, 说明, 操作)
    遮罩.appendChild(卡)

    const 收 = (答复) => {
      document.removeEventListener('keydown', 按键, true)
      遮罩.remove()
      if (!答复 && 先前焦点 && typeof 先前焦点.focus === 'function') 先前焦点.focus({ preventScroll: true })
      完成(答复)
    }
    const 按键 = (事件) => {
      if (事件.key !== 'Escape') return
      事件.preventDefault()
      事件.stopImmediatePropagation()
      收(false)
    }
    遮罩.addEventListener('click', (事件) => {
      if (事件.target === 遮罩) 收(false)
    })
    准了.addEventListener('click', () => 收(true))
    算了.addEventListener('click', () => 收(false))
    document.addEventListener('keydown', 按键, true)

    document.body.appendChild(遮罩)
    算了.focus({ preventScroll: true })
  })
}

// 【双击顶栏 = 收起来 —— 这条 2026-10-08 撤掉了】
//
//   原来这儿绑着 `dblclick → 收起来`。想法是：窗口没有系统标题栏，
//   但人习惯双击顶上那一条，与其让它什么都不发生，不如让它收窗口。
//
//   他的原话："快速点击学习或者干活两次就会关掉窗口（没有退出）"。
//   连点两下本来就是一次双击，而模式按钮整条长在顶栏里 ——
//   这个"顺手加的"便利功能，跟顶栏上**所有**按钮抢同一个手势。
//   我先把按钮排除掉，他说还是照掉不误。
//
//   那就别争了：**这个功能本来就不是他要的，是我自己加的。**
//   收窗口有「—」按钮，还有 Esc，两个入口都好好的，一个都不少。
//   删掉它，这个手势从此归按钮。
//
//   【结案 —— 2026-10-08 凌晨，日志里查出来的】
//     元凶就是这条规则。我第一轮"只把按钮排除掉"**没管用**，原因是：
//     切模式的时候，模式条里会**多出一个胶囊**（干活目录 / 任务），按钮会位移 ——
//     他连点的第二下落在了按钮**之间的空隙**上。
//     那种地方 target 是 模式条 自己，`closest('button')` 一个都命中不了，
//     于是照样冒到顶栏、照样把窗口收走。所以他说"都没解决"。
//     现在整条规则没了：这个手势归按钮，怎么点都不会收窗口。
//
//   （教训：往一条全是按钮的栏上挂"整条"手势，它不是不生效 ——
//     是**在不该生效的时候生效**。而且"把按钮排除掉"这种补丁堵不住空隙，
//     该堵的是那个手势本身。）
//
// 【2026-10-09：这个手势又有人要了 —— 不过这次是它本来该干的事】
//   他提的："按界面边框也无法双击放大了。"
//   对，撤掉上面那条之后，双击顶栏就**什么都不做**了。
//   而"双击标题栏 = 最大化 / 还原"是 Windows 上人人都有的肌肉记忆 ——
//   可我们这条顶栏是自己画的（main.js 里 frame:false），
//   系统只认**真的**标题栏，不会替我们做这件事。
//
//   所以现在补上它：双击放大，再双击还原。
//   跟上次那条"收起来"的区别是 —— **这次是他的习惯，不是我顺手加的**。
//
//   ⚠ 按钮上不算：双击按钮 = 他想点两下按钮，不是想放大窗口。
//     而且切模式时按钮会位移，所以这一下必须按 target 判，不能靠坐标。
document.querySelector('.顶栏').addEventListener('dblclick', (事件) => {
  if (事件.target.closest('button, input, textarea, select, a')) return
  window.爱莉.最大化切换()
})

// 按 Esc 也是收起来 —— 说话说到一半想收手，不用去够那个小横杠
document.addEventListener('keydown', (事件) => {
  if (事件.key === 'Escape') {
    if (语音输入状态 !== '空闲') {
      事件.preventDefault()
      取消语音输入()
    } else if (!选模型面板.classList.contains('收着')) {
      事件.preventDefault()
      收起新建面板()
      开新对话按钮.focus({ preventScroll: true })
    } else if (!表达反馈遮罩.classList.contains('收着')) 关表达反馈页()
    else if (!设置遮罩.classList.contains('收着')) 关设置()
    else if (!记忆管理遮罩.classList.contains('收着')) 关记忆管理()
    else if (!上下文遮罩.classList.contains('收着')) 关上下文账本()
    else if (!工具记录遮罩.classList.contains('收着')) 关工具记录()
    else if (!工作索引抽屉.classList.contains('收着')) 收起工作索引抽屉()
    else window.爱莉.收起来('Esc键')
  }
  // 菜单栏被拆掉了，开发者工具得自己绑一个：Ctrl+Shift+I
  if (事件.ctrlKey && 事件.shiftKey && (事件.key === 'I' || 事件.key === 'i')) {
    事件.preventDefault()
    window.爱莉.开发者工具()
  }
})

// 点底下那行小字 = 体检
小状态.addEventListener('click', async () => {
  提示('正在看她那边的情况……')
  try {
    const 情况 = await window.爱莉.体检()
    const 行 = []
    行.push('模型：' + (情况.模型.通 ? '通' : '不通 —— ' + 情况.模型.说明))
    行.push('声音：' + (情况.声音.在 ? '在线' : '没开'))
    行.push('桌宠：' + (情况.桌宠 ? '在跑' : '没在跑'))
    行.push(`记忆：事实 ${情况.记忆.事实} 条 / 经历 ${情况.记忆.经历} 条`)
    提示(行.join('　·　'))
    console.log('体检结果：', 情况)
  } catch (错误) {
    提示('体检失败：' + 错误.message, '#c9779d')
  }
})

// ============================================================
// 老板把她叫出来的时候
// ============================================================

// ============================================================
// 她写出的文件（右侧预览栏）
// ============================================================

const 文件开关 = document.getElementById('文件开关')
const 文件抽屉 = document.getElementById('文件抽屉')
const 文件刷新 = document.getElementById('文件刷新')
const 文件系统打开 = document.getElementById('文件系统打开')
const 文件收起钮 = document.getElementById('文件收起')
const 产物列表 = document.getElementById('产物列表')
const 文件预览 = document.getElementById('文件预览')

let 当前产物 = null

function 人话文件大小(字节) {
  const 数 = Number(字节) || 0
  if (数 < 1024) return 数 + ' B'
  if (数 < 1024 * 1024) return Math.round(数 / 1024) + ' KB'
  return (数 / 1024 / 1024).toFixed(1) + ' MB'
}

function 文件空态(文字) {
  文件预览.innerHTML = ''
  const 空 = document.createElement('div')
  空.className = '文件空态'
  空.textContent = 文字
  文件预览.appendChild(空)
}

async function 预览一个产物(一个) {
  当前产物 = 一个 || null
  文件系统打开.disabled = !当前产物
  for (const 按钮 of 产物列表.querySelectorAll('.产物项')) {
    按钮.classList.toggle('选中', !!当前产物 && 按钮.dataset.路径 === 当前产物.路径)
  }
  if (!当前产物) {
    文件空态('她写出的文件会出现在这里。')
    return
  }

  文件空态('正在读取……')
  try {
    const 果 = await window.爱莉.预览产物(当前产物.路径)
    if (!果 || !果.好) {
      文件空态('读不到这个文件：' + ((果 && 果.说明) || '不知道为什么'))
      return
    }

    文件预览.innerHTML = ''
    if (果.类型 === '文本') {
      const 正文 = document.createElement('pre')
      正文.className = '文件正文'
      正文.textContent = 果.内容
      文件预览.appendChild(正文)
      return
    }
    if (果.类型 === '图片') {
      const 图 = document.createElement('img')
      图.className = '文件图片'
      图.alt = 果.名字
      图.src = 果.dataUrl
      文件预览.appendChild(图)
      return
    }

    const 说明 = document.createElement('div')
    说明.className = '文件不能预览'
    说明.textContent = `${果.名字}（${人话文件大小(果.大小)}）\n${果.说明}\n可以点右上角 ↗ 打开。`
    文件预览.appendChild(说明)
  } catch (错误) {
    文件空态('预览失败：' + 错误.message)
  }
}

function 画产物列表(项们, 选第一项 = false) {
  const 清单 = Array.isArray(项们) ? 项们 : []
  产物列表.innerHTML = ''
  if (!清单.length) {
    const 空 = document.createElement('div')
    空.className = '文件空态'
    空.textContent = '还没有文件'
    产物列表.appendChild(空)
    void 预览一个产物(null)
    return
  }

  for (const 一个 of 清单) {
    const 按钮 = document.createElement('button')
    按钮.className = '产物项'
    按钮.dataset.路径 = 一个.路径
    按钮.title = 一个.路径

    const 名字 = document.createElement('span')
    名字.className = '产物名字'
    名字.textContent = 一个.名字 + ' · ' + 人话文件大小(一个.大小)
    const 目录 = document.createElement('span')
    目录.className = '产物目录'
    目录.textContent = 一个.目录
    按钮.append(名字, 目录)
    按钮.addEventListener('click', () => void 预览一个产物(一个))
    产物列表.appendChild(按钮)
  }

  const 还在 = 当前产物 && 清单.find((一个) => 一个.路径 === 当前产物.路径)
  void 预览一个产物(选第一项 || !还在 ? 清单[0] : 还在)
}

async function 刷新产物(选第一项 = false) {
  try {
    const 果 = await window.爱莉.问产物()
    if (!果 || !果.好) {
      文件空态('文件列表读不到：' + ((果 && 果.说明) || '不知道为什么'))
      return
    }
    画产物列表(果.产物们, 选第一项)
  } catch (错误) {
    文件空态('文件列表读不到：' + 错误.message)
  }
}

function 开着文件抽屉吗() {
  return !文件抽屉.classList.contains('收着')
}

async function 打开文件抽屉(指定路径 = '') {
  收起任务抽屉()
  收起工作索引抽屉()
  文件抽屉.classList.remove('收着')
  文件开关.classList.add('文件开着')
  文件开关.classList.remove('有新文件')
  await 刷新产物()
  if (指定路径) await 预览一个产物({ 路径: 指定路径 })
}

function 收起文件抽屉() {
  文件抽屉.classList.add('收着')
  文件开关.classList.remove('文件开着')
}

文件开关.addEventListener('click', () => {
  if (开着文件抽屉吗()) 收起文件抽屉()
  else void 打开文件抽屉()
})

工具记录入口.addEventListener('click', (事件) => {
  事件.stopPropagation()
  开工具记录()
})
工具记录关闭.addEventListener('click', 关工具记录)
工具记录遮罩.addEventListener('click', (事件) => {
  if (事件.target === 工具记录遮罩) 关工具记录()
})
记忆管理入口.addEventListener('click', 开记忆管理)
记忆管理关闭.addEventListener('click', 关记忆管理)
记忆导出.addEventListener('click', () => void (当前记忆层 === '日记' ? 导出全部记忆日记() : 导出全部长期记忆()))
记忆清空.addEventListener('click', () => void 清空全部长期记忆())
临时记忆新增.addEventListener('click', 新增临时记忆表单)
记忆管理遮罩.addEventListener('click', (事件) => {
  if (事件.target === 记忆管理遮罩) 关记忆管理()
})
记忆层切换.addEventListener('click', (事件) => {
  const 按钮 = 事件.target.closest('button[data-记忆层]')
  if (!按钮 || 按钮.dataset.记忆层 === 当前记忆层) return
  当前记忆层 = 按钮.dataset.记忆层
  for (const 一 of 记忆层切换.querySelectorAll('button')) {
    const 选中 = 一 === 按钮
    一.classList.toggle('选中', 选中)
    一.setAttribute('aria-selected', String(选中))
  }
  const 是临时 = 当前记忆层 === '临时'
  const 是日记 = 当前记忆层 === '日记'
  const 是长期 = !是临时 && !是日记
  长期记忆筛选.classList.toggle('收着', 是临时 || 是日记)
  长期记忆视图切换.classList.toggle('收着', !是长期)
  临时记忆筛选.classList.toggle('收着', !是临时)
  日记筛选.classList.toggle('收着', !是日记)
  记忆管理面板.classList.toggle('图谱模式', 是长期 && 当前长期视图 === '关系图')
  记忆导出.hidden = 是临时
  记忆导出.textContent = 是日记 ? '导出日记' : '导出全部'
  记忆导出.title = 是日记 ? '导出全部记忆日记为 Markdown' : '导出全部长期记忆'
  记忆清空.hidden = 是临时 || 是日记
  临时记忆新增.hidden = !是临时
  记忆搜索.placeholder = 是日记
    ? '搜索日记、模块或来源摘要……'
    : 是临时 ? '搜索内容、标签或来源会话……' : '搜索内容、来源或会话……'
  void 刷新记忆管理()
})
长期记忆视图切换.addEventListener('click', (事件) => {
  const 按钮 = 事件.target.closest('button[data-长期视图]')
  if (!按钮 || 按钮.dataset.长期视图 === 当前长期视图) return
  当前长期视图 = 按钮.dataset.长期视图
  for (const 一 of 长期记忆视图切换.querySelectorAll('button')) {
    const 选中 = 一 === 按钮
    一.classList.toggle('选中', 选中)
    一.setAttribute('aria-selected', String(选中))
  }
  记忆管理面板.classList.toggle('图谱模式', 当前长期视图 === '关系图')
  记忆搜索.placeholder = 当前长期视图 === '关系图' ? '筛选关系图中的记忆卡片……' : '搜索内容、来源或会话……'
  void 刷新长期记忆()
})
长期记忆筛选.addEventListener('click', (事件) => {
  const 按钮 = 事件.target.closest('button[data-类别]')
  if (!按钮) return
  当前记忆类别 = 按钮.dataset.类别 || ''
  for (const 一 of 长期记忆筛选.querySelectorAll('button')) 一.classList.toggle('选中', 一 === 按钮)
  void 刷新长期记忆()
})
for (const 选择 of [临时记忆分类, 临时记忆生命周期, 临时记忆确认状态]) {
  选择.addEventListener('change', () => void 刷新临时记忆())
}
日记筛选.addEventListener('click', (事件) => {
  const 按钮 = 事件.target.closest('button[data-日记类型]')
  if (!按钮) return
  当前日记类型 = 按钮.dataset.日记类型 || ''
  for (const 一 of 日记筛选.querySelectorAll('button')) 一.classList.toggle('选中', 一 === 按钮)
  void 刷新记忆日记()
})
记忆搜索.addEventListener('input', () => {
  clearTimeout(记忆搜索计时)
  记忆搜索计时 = setTimeout(() => void 刷新记忆管理(), 180)
})
文件刷新.addEventListener('click', () => void 刷新产物())
文件收起钮.addEventListener('click', 收起文件抽屉)
文件系统打开.addEventListener('click', async () => {
  if (!当前产物) return
  const 果 = await window.爱莉.打开产物(当前产物.路径)
  if (!果 || !果.好) 提示('打不开：' + ((果 && 果.说明) || '不知道为什么'), '#c9779d')
})

window.爱莉.产物变了((项们) => {
  if (开着文件抽屉吗()) 画产物列表(项们, true)
  else 文件开关.classList.add('有新文件')
})

// ============================================================
// 正式工作索引（只读）
// ============================================================

let 当前工作索引状态 = ''
let 工作索引搜索计时 = null

function 工作索引空态(文字, 是错误 = false) {
  工作索引列表.replaceChildren()
  const 空 = document.createElement('div')
  空.className = '工作索引空态' + (是错误 ? ' 错误' : '')
  空.textContent = 文字
  工作索引列表.appendChild(空)
}

function 工作索引文件名(路径) {
  const 节 = String(路径 || '').split(/[\\/]/).filter(Boolean)
  return 节[节.length - 1] || String(路径 || '')
}

/**
 * 失败任务重来时只恢复原目标，不直接发送。
 * 这样仍会重新经过任务卡、工作区检查和每一项写入/命令权限确认。
 */
function 把工作草稿放进输入框(草稿, 替换问法, 成功提示) {
  const 新草稿 = String(草稿 || '').trim()
  if (!新草稿) return false
  const 现有草稿 = 输入.value.trim()
  if (现有草稿 && 现有草稿 !== 新草稿 && !window.confirm(替换问法)) return false
  输入.value = 新草稿
  输入.dispatchEvent(new Event('input'))
  收起工作索引抽屉()
  输入.focus()
  提示(成功提示)
  return true
}

function 重新准备工作(一) {
  const 原目标 = String((一 && 一.目标) || '').trim()
  if (!原目标) {
    提示('这条记录没有可重新提交的目标', '#c9779d')
    return
  }
  把工作草稿放进输入框(
    原目标,
    '输入框里已有内容，要用这项工作的原目标替换吗？',
    '原目标已放回输入框；可以修改，发送后仍需确认任务卡',
  )
}

async function 继续准备工作产物(一) {
  const 历史路径 = Array.isArray(一 && 一.产物) ? 一.产物 : []
  if (!历史路径.length) return
  提示('正在核对这些产物现在还能不能用……')
  try {
    const 果 = await window.爱莉.核对工作产物(历史路径)
    const 可用 = 果 && 果.好 && Array.isArray(果.产物们) ? 果.产物们 : []
    if (!可用.length) {
      const 说明 = '这些历史产物已经不存在，或当前没有读取权限。\n输入框没有改变。'
      window.alert(说明)
      提示('这些历史产物已经不存在，或不在当前读取权限内', '#c9779d')
      return
    }
    const 草稿 = [
      '继续处理上一项工作的现有产物：',
      ...可用.map((产物) => '- ' + 产物.路径),
      '',
      '原目标：' + String(一.目标 || '未记录'),
      '',
      '接下来请：',
    ].join('\n')
    const 少了 = Number(果.失效数) || 0
    把工作草稿放进输入框(
      草稿,
      '输入框里已有内容，要用这项工作的产物继续草稿替换吗？',
      少了
        ? `已放回 ${可用.length} 个可用产物，另有 ${少了} 个已失效；补完要求后再发送`
        : `已放回 ${可用.length} 个产物；补完“接下来请”后再发送`,
    )
  } catch (错误) {
    提示('产物核对失败：' + 错误.message, '#c9779d')
  }
}

function 画工作索引(果) {
  const 清单 = Array.isArray(果.列表) ? 果.列表 : []
  工作索引统计.textContent = `找到 ${Number(果.总数) || 0} 条${果.截断 ? ' · 只显示前 100 条' : ''}`
  if (!工作索引搜索.value.trim() && !当前工作索引状态) {
    工作索引入口.textContent = 果.总数 ? `${果.总数} 条` : '查看'
  }
  工作索引列表.replaceChildren()
  if (!清单.length) {
    工作索引空态(工作索引搜索.value.trim() || 当前工作索引状态 ? '没有符合条件的工作记录。' : '还没有正式工作记录。')
    return
  }

  for (const 一 of 清单) {
    const 卡 = document.createElement('article')
    卡.className = '工作索引卡 ' + (一.状态 || '')
    卡.dataset.编号 = 一.编号 || ''

    const 头 = document.createElement('div')
    头.className = '工作索引卡头'
    const 状态字 = document.createElement('span')
    状态字.className = '工作索引状态'
    状态字.textContent = 一.状态 || '状态未记录'
    const 时间 = document.createElement('time')
    时间.className = '工作索引时间'
    时间.textContent = 一.完成时间 || '时间未记录'
    头.append(状态字, 时间)

    const 目标 = document.createElement('div')
    目标.className = '工作索引目标'
    目标.textContent = 一.目标 || '目标未记录'
    卡.append(头, 目标)

    if (一.结果摘要) {
      const 结果 = document.createElement('div')
      结果.className = '工作索引结果'
      结果.textContent = 一.结果摘要
      卡.appendChild(结果)
    }

    const 元信息们 = []
    if (一.对话) 元信息们.push('对话 ' + 一.对话)
    if (一.工作区) 元信息们.push('工作区 ' + 一.工作区)
    if (元信息们.length) {
      const 元信息 = document.createElement('div')
      元信息.className = '工作索引元信息'
      元信息.textContent = 元信息们.join(' · ')
      卡.appendChild(元信息)
    }

    if (Array.isArray(一.工具) && 一.工具.length) {
      const 工具们 = document.createElement('div')
      工具们.className = '工作索引工具'
      for (const 工具 of 一.工具) {
        const 标签 = document.createElement('span')
        标签.className = 工具.成功 ? '成功' : '失败'
        标签.textContent = `${工具.名字 || '未知工具'} · ${工具.成功 ? '成功' : '失败'}`
        工具们.appendChild(标签)
      }
      卡.appendChild(工具们)
    }

    if (Array.isArray(一.产物) && 一.产物.length) {
      const 产物们 = document.createElement('div')
      产物们.className = '工作索引产物'
      for (const 路径 of 一.产物) {
        const 按钮 = document.createElement('button')
        按钮.type = 'button'
        按钮.title = 路径
        按钮.textContent = '打开 · ' + 工作索引文件名(路径)
        按钮.addEventListener('click', () => void 打开文件抽屉(路径))
        产物们.appendChild(按钮)
      }
      卡.appendChild(产物们)

      const 继续按钮 = document.createElement('button')
      继续按钮.type = 'button'
      继续按钮.className = '工作索引继续'
      继续按钮.textContent = '继续处理这些产物…'
      继续按钮.title = '先重新核对路径，只把仍可读取的产物放回输入框'
      继续按钮.addEventListener('click', () => void 继续准备工作产物(一))
      卡.appendChild(继续按钮)
    }

    if (一.状态 === '失败' || 一.状态 === '部分完成') {
      const 重试 = document.createElement('button')
      重试.type = 'button'
      重试.className = '工作索引重试'
      重试.textContent = 一.状态 === '部分完成' ? '重新准备未完成工作…' : '重新提交…'
      重试.title = '只把原目标放回输入框，不会自动发送或沿用旧权限'
      重试.addEventListener('click', () => 重新准备工作(一))
      卡.appendChild(重试)
    }
    工作索引列表.appendChild(卡)
  }
}

async function 刷新工作索引() {
  工作索引统计.textContent = '读取中……'
  try {
    const 果 = await window.爱莉.问工作索引({
      搜索: 工作索引搜索.value,
      状态: 当前工作索引状态,
    })
    if (!果 || !果.好) {
      工作索引统计.textContent = '读取失败'
      工作索引空态('工作索引读不到：' + ((果 && 果.说明) || '不知道为什么'), true)
      return
    }
    画工作索引(果)
  } catch (错误) {
    工作索引统计.textContent = '读取失败'
    工作索引空态('工作索引读不到：' + 错误.message, true)
  }
}

function 开着工作索引抽屉吗() {
  return !工作索引抽屉.classList.contains('收着')
}

async function 打开工作索引抽屉() {
  收起任务抽屉()
  收起文件抽屉()
  工作索引抽屉.classList.remove('收着')
  工作索引入口.classList.add('开着')
  await 刷新工作索引()
}

function 收起工作索引抽屉() {
  工作索引抽屉.classList.add('收着')
  工作索引入口.classList.remove('开着')
}

工作索引入口.addEventListener('click', () => {
  if (开着工作索引抽屉吗()) 收起工作索引抽屉()
  else void 打开工作索引抽屉()
})
工作索引刷新.addEventListener('click', () => void 刷新工作索引())
工作索引收起.addEventListener('click', 收起工作索引抽屉)
工作索引搜索.addEventListener('input', () => {
  clearTimeout(工作索引搜索计时)
  工作索引搜索计时 = setTimeout(() => void 刷新工作索引(), 180)
})
工作索引筛选.addEventListener('click', (事件) => {
  const 按钮 = 事件.target.closest('button[data-状态]')
  if (!按钮) return
  当前工作索引状态 = 按钮.dataset.状态 || ''
  for (const 一 of 工作索引筛选.querySelectorAll('button')) 一.classList.toggle('选中', 一 === 按钮)
  void 刷新工作索引()
})

// ============================================================
// 学习任务（2026-10-08 加的）
// ============================================================
//
// 【它是什么】学习模式那张待办清单的**界面**。
//   清单本身住在配置中学习区的 `任务.md`，
//   他随时能自己打开改（就是 markdown 的勾选框）——
//   这个抽屉只是它的一扇门，不是它的家。
//
// 【所以每次打开都重新读一遍，不缓存】
//   他刚在编辑器里改完、回到这儿一看还是旧的 —— 那种事最让人火大，
//   而且他会以为"这个抽屉改了没用"。宁可多读一次盘（几毫秒的事）。

const 任务开关 = document.getElementById('任务开关')
const 任务角标 = document.getElementById('任务角标')
const 任务抽屉 = document.getElementById('任务抽屉')
const 任务计数 = document.getElementById('任务计数')
const 任务进度面 = document.getElementById('任务进度面')
const 任务列表 = document.getElementById('任务列表')
const 任务输入 = document.getElementById('任务输入')
const 任务添加 = document.getElementById('任务添加')
const 任务收起钮 = document.getElementById('任务收起')

/** 手上这份清单（勾的时候要拿它的原话去对上） */
let 手上的任务 = []

/** 把清单画出来（开抽屉、勾一条、加一条之后都走它） */
function 画任务(果) {
  const 任务们 = (果 && 果.任务们) || []
  const 统计 = (果 && 果.统计) || { 一共: 0, 做完: 0 }
  手上的任务 = 任务们

  const 全做完 = 统计.一共 > 0 && 统计.做完 === 统计.一共

  // 顶栏那个角标：有任务就显示"2/5"，一条都没有就写"任务"
  任务角标.textContent = 统计.一共 ? `${统计.做完}/${统计.一共}` : '任务'
  任务开关.classList.toggle('全做完', 全做完)
  任务开关.title = 统计.一共
    ? `学习任务：${统计.做完}/${统计.一共} 做完了${全做完 ? '（这门课清干净了）' : ''}`
    : '学习任务：还没有任务，点一下加一条'

  任务计数.textContent = 统计.一共 ? `${统计.做完}/${统计.一共}` : '还没有'
  任务进度面.style.width = 统计.一共 ? Math.round((统计.做完 / 统计.一共) * 100) + '%' : '0%'

  任务列表.innerHTML = ''
  if (!任务们.length) {
    const 空 = document.createElement('div')
    空.className = '任务空空的'
    空.textContent = '还没有任务。底下加一条，或者跟她说一句也行 —— 她也能往上加。'
    任务列表.appendChild(空)
    return
  }

  for (const 一个 of 任务们) {
    const 条 = document.createElement('div')
    条.className = '任务' + (一个.完成 ? ' 做完' : '')
    条.title = 一个.完成 ? '点一下变回没做' : '点一下算做完了'

    const 格子 = document.createElement('span')
    格子.className = '格子'
    格子.textContent = 一个.完成 ? '✓' : ''

    const 字 = document.createElement('span')
    字.className = '字'
    字.textContent = 一个.文字

    const 删掉 = document.createElement('button')
    删掉.className = '删掉'
    删掉.textContent = '✕'
    删掉.title = '删掉这一条（她删不掉，只有你能删）'

    条.appendChild(格子)
    条.appendChild(字)
    条.appendChild(删掉)

    条.addEventListener('click', () => 勾一条(一个))
    // 【这个 stopPropagation 不能省】不拦的话，点 ✕ 会先冒泡到整条上 ——
    // 于是"删掉"的同时还把它勾了一下，两件事一起发生。
    删掉.addEventListener('click', (事件) => {
      事件.stopPropagation()
      删一条(一个)
    })

    任务列表.appendChild(条)
  }
}

async function 刷新任务() {
  try {
    画任务(await window.爱莉.问任务())
  } catch (错误) {
    提示('任务清单读不出来：' + 错误.message, '#c9779d')
  }
}

async function 勾一条(一个) {
  try {
    const 果 = await window.爱莉.勾任务(一个.文字, !一个.完成)
    if (果 && 果.好) {
      画任务(果)
      提示(一个.完成 ? '又变回没做了：' + 一个.文字 : '做完了：' + 一个.文字)
    } else {
      提示('勾不上：' + ((果 && 果.说明) || '不知道为啥'), '#c9779d')
    }
  } catch (错误) {
    提示('勾任务出错：' + 错误.message, '#c9779d')
  }
}

async function 删一条(一个) {
  try {
    const 果 = await window.爱莉.删任务(一个.文字)
    if (果 && 果.好) {
      画任务(果)
      提示('删掉了：' + 一个.文字)
    } else {
      提示('删不掉：' + ((果 && 果.说明) || '不知道为啥'), '#c9779d')
    }
  } catch (错误) {
    提示('删任务出错：' + 错误.message, '#c9779d')
  }
}

async function 加一条任务() {
  const 文字 = 任务输入.value.trim()
  if (!文字) return
  任务添加.disabled = true
  try {
    const 果 = await window.爱莉.加任务(文字)
    if (果 && 果.好) {
      任务输入.value = ''
      画任务(果)
      提示('加上了：' + 文字)
    } else {
      提示('加不上：' + ((果 && 果.说明) || '不知道为啥'), '#c9779d')
    }
  } catch (错误) {
    提示('加任务出错：' + 错误.message, '#c9779d')
  } finally {
    任务添加.disabled = false
  }
}

function 开着任务抽屉吗() {
  return !任务抽屉.classList.contains('收着')
}

async function 打开任务抽屉() {
  收起文件抽屉()
  收起工作索引抽屉()
  任务抽屉.classList.remove('收着')
  // 【每次打开都重读】理由见上面那段 —— 他可能在编辑器里刚改过
  await 刷新任务()
  任务输入.focus()
}

function 收起任务抽屉() {
  任务抽屉.classList.add('收着')
}

任务开关.addEventListener('click', () => {
  if (开着任务抽屉吗()) 收起任务抽屉()
  else 打开任务抽屉()
})

任务收起钮.addEventListener('click', 收起任务抽屉)
任务添加.addEventListener('click', 加一条任务)
任务输入.addEventListener('keydown', (事件) => {
  if (事件.key !== 'Enter') return
  事件.preventDefault() // 不然回车会冒到输入框那边，把任务当成话发出去
  加一条任务()
})

// 开机先读一次，把顶栏那个角标填上（不然它一直写着"任务"）
void 刷新任务()

window.爱莉.快聊模式变了((开) => {
  document.body.classList.toggle('快聊模式', 开)
  if (!开) return
  滚到底()
  输入.focus()
})

window.爱莉.叫我出来(() => {
  输入.focus()
  // 窗口每次被叫出来，顺手看一眼声音服务在不在
  void 看一眼声音()
})

async function 看一眼声音() {
  try {
    const 状态结果 = await window.爱莉.声音状态()
    if (!状态结果.在) {
      要出声 = false
      提示('声音服务没开 —— 她这会儿只能打字。（双击 tools\\voice\\start-voice.cmd 就能开）')
      喇叭.classList.remove('开着')
      喇叭.title = '声音服务没开，点一下启动'
    } else {
      要出声 = true
      喇叭.classList.add('开着')
      喇叭.title = '声音已在线；点一下静音'
      提示('她在的，说句话试试吧')
    }
  } catch {
    /* 问不出来就不问了 */
  }
}

故障关闭.addEventListener('click', () => 收起故障())
故障操作.addEventListener('click', () => {
  if (当前故障 && 当前故障.操作 === '打开设置') 开设置()
})

// 打开窗口就先看一圈
void 看一眼声音()
输入.focus()

// 再看一眼：上次有没有没干完的活儿
//
// 【为什么要晚 600 毫秒才问】
//   底下那行小字只有一行，而 看一眼声音() 也往那儿写（"声音服务没开"那些）。
//   两个都是异步的，谁先回来不一定 —— 要是纸条的提示先显示、
//   接着被"她在的，说句话试试吧"盖掉，他就永远看不见了。
//   晚一点问，让声音那边先说，这条压轴。
//
// 【他看|不看得到重要吗】
//   重要。她那边虽然也会知道（便条会塞进她的上下文），但她可能不提，
//   或者提了他没留意。底下这行字是**不依赖她**的那条路。
setTimeout(async () => {
  try {
    const 果 = await window.爱莉.没干完的活儿()
    if (果 && 果.有) 提示(果.一句话, '#c9779d')
  } catch {
    /* 问不出来就算了，那只是个提醒 */
  }
}, 600)
