/**
 * 测一整轮.cjs —— 不开窗口，先把"说一句话"这条链子整根试一遍
 *
 * 【为什么要这么测】
 *   窗口那一步在 DSH 的沙箱里跑不起来（Electron 要建内部管道，被拦）。
 *   所以我先把**窗口之外的部分**全部串起来跑一遍：
 *     拆标记 → 递话给模型 → 一边收一边拼 → 记录记忆 → 交给桌宠
 *   这一段要是通的，剩下的风险就只落在"窗口显示"上，
 *   而那一小块你自己点开就能看出来。
 *
 * 用法: node tools\测一整轮.cjs "她说句话我看看"
 */
'use strict'

const path = require('node:path')

const 脑 = path.resolve(__dirname, '..', '脑')
const { 说话, 拆标记 } = require(path.join(脑, '对话.cjs'))
const { 做表情, 查表 } = require(path.join(__dirname, 'bridge.cjs'))
const 记忆 = require(path.join(脑, '记忆.cjs'))

const 话 = process.argv.slice(2).join(' ') || '随便说点什么吧，笑一个'

async function main() {
  console.log('')
  console.log('══════ 第一关：拆标记 ══════')
  const 例子 = '好呀，那我笑给你看。\n\n[表情:星星眼]\n[记住:他今天心情不错]'
  const 拆的 = 拆标记(例子)
  console.log('原话: ' + JSON.stringify(例子))
  console.log('正文: ' + JSON.stringify(拆的.正文))
  console.log('表情: ' + JSON.stringify(拆的.表情))
  console.log('记住: ' + JSON.stringify(拆的.记住))
  const 过关 = 拆的.正文 === '好呀，那我笑给你看。' && 拆的.表情[0] === '星星眼'
  console.log(过关 ? '✓ 过了' : '✗ 没拆干净！')

  console.log('')
  console.log('══════ 第二关：表情名字对不对得上 ══════')
  for (const 名 of ['星星眼', '脸红', '超级爱莉', '爱门', '不存在的表情']) {
    const 找到 = 查表(名)
    console.log(`  ${名.padEnd(8, ' ')} → ${找到 ? 找到.类别 + ' Alt+' + 找到.键 : '✗ 表里没有'}`)
  }

  console.log('')
  console.log('══════ 第三关：真的跟她聊一句 ══════')
  console.log('我说: ' + 话)
  console.log('')

  const 开始 = Date.now()
  let 最后一次 = ''
  const 结果 = await 说话({
    他说的话: 话,
    吐字: (到现在) => {
      最后一次 = 到现在
    },
  })
  const 用时 = ((Date.now() - 开始) / 1000).toFixed(1)

  console.log('她说:')
  console.log('  ' + 结果.她说的话.split('\n').join('\n  '))
  console.log('')
  console.log(`用时 ${用时}s`)
  if (结果.用了) {
    const u = 结果.用了
    console.log(
      `用量: 输入 ${u.prompt_tokens}（缓存命中 ${u.prompt_cache_hit_tokens ?? '?'}）输出 ${u.completion_tokens}`,
    )
  }
  console.log('流式最后停在: ' + JSON.stringify(最后一次.slice(-40)))
  if (结果.表情.length) console.log('她要做的表情: ' + 结果.表情.join('、'))
  else console.log('（她这次没要做表情）')

  console.log('')
  console.log('══════ 第四关：记忆有没有落进去 ══════')
  const 记忆片段 = 记忆.取记忆()
  console.log('事实 ' + 记忆片段.关于他.split('\n').length + ' 行 / 经历 ' + 记忆片段.共同经历.split('\n').length + ' 行')
  const 最近聊天 = 记忆.读最近聊天(4)
  console.log('最近的聊天记录:')
  for (const 条 of 最近聊天) {
    console.log(`  ${条.角色 === 'user' ? '他' : '她'}: ${条.内容.slice(0, 50)}`)
  }

  console.log('')
  console.log('══════ 第五关：让桌面上的她动一下 ══════')
  const 回执 = 做表情('超级爱莉')
  console.log((回执.成功 ? '✓ ' : '✗ ') + 回执.说明)
  console.log('  （通道「' + 回执.通道 + '」—— 直接按键说明桌宠能立刻收到；')
  console.log('    队列说明得先双击 run-bridge.cmd 把桌宠服务起起来）')

  console.log('')
  console.log('整条链子跑完了。')
}

main().catch((错误) => {
  console.log('✗ 出错了: ' + 错误.message)
  console.log(错误.stack)
  process.exit(1)
})
