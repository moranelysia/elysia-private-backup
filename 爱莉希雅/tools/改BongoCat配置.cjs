// 改BongoCat配置.cjs —— 精确修改 Bongo Cat 的 config.json
//
// 【为什么不用 JSON.parse + 重新生成】
//   它那个文件用的是"制表符缩进 + "键" : 值" 这种特殊排版，
//   用程序重新生成会改掉每一个空格 —— Bongo Cat 可能就认不出来了。
//   所以这里只做**文本替换**：改一个词，其他一个字符都不动。
//
// 用法:
//   node tools/改BongoCat配置.cjs 看          看现在的设置
//   node tools/改BongoCat配置.cjs 开网络      把 network 改成 true
//   node tools/改BongoCat配置.cjs 关网络      改回 false
//   node tools/改BongoCat配置.cjs 收按键      改成"接收方"模式（让它听我们的）
//   node tools/改BongoCat配置.cjs 复原        从备份恢复

'use strict'

const fs = require('fs')

const 配置 = 'D:\\新建文件夹\\zhuochong\\A-爱莉-无表情版\\config.json'
const 备份 = 配置 + '.原始备份'

const 动作 = process.argv[2] || '看'

function 读() {
  return fs.readFileSync(配置, 'utf8')
}

function 看设置() {
  const 内容 = 读()
  // 从文本里直接抠出 network 那一段，不解析成对象（保持原样看）
  const m = 内容.match(/"network"\s*:\s*\{[\s\S]*?\}/)
  console.log('=== 现在的网络设置 ===')
  console.log(m ? m[0] : '（没找到 network 段）')
  console.log('')
  const mode = 内容.match(/"mode"\s*:\s*(\d+)/)
  console.log('mode = ' + (mode ? mode[1] : '?'))
  console.log('文件大小 = ' + 内容.length + ' 字符')
}

/**
 * 替换一个键的值 —— 用正则，不管它写成 "key":false 还是 "key" : false
 *
 * 为什么这么小心：Bongo Cat 的配置文件排版很讲究（制表符缩进、冒号周围有空格），
 * 上次我用 JSON 重新生成整个文件，格式全变了，它就报错读不了。
 * 现在改成：只动"值"那几个字符，其他一个字节都不碰。
 */
function 改一个键(键, 新值, 说明) {
  const 内容 = 读()
  // 匹配  "键"  :  值   （冒号两边可有可无空格）
  const 模式 = new RegExp(`("${键}"\\s*:\\s*)(true|false|"[^"]*"|\\d+)`)
  const m = 内容.match(模式)
  if (!m) {
    console.log(`✗ 没找到键「${键}」`)
    return false
  }
  const 旧值 = m[2]
  if (旧值 === String(新值)) {
    console.log(`· 「${键}」已经是 ${新值} 了，不用改`)
    return true
  }
  const 新的 = 内容.replace(模式, `$1${新值}`)
  fs.writeFileSync(配置, 新的, 'utf8')
  console.log(`✓ ${说明}`)
  console.log(`  "${键}" : ${旧值}  →  ${新值}`)
  console.log(`  文件大小 ${内容.length} → ${新的.length} 字符`)
  return true
}

switch (动作) {
  case '看':
    看设置()
    break

  case '开网络':
    if (!fs.existsSync(备份)) {
      fs.copyFileSync(配置, 备份)
      console.log('（顺手备份了一份: config.json.原始备份）')
    }
    改一个键('network', 'true', '已打开网络')
    console.log('')
    console.log('⚠ 要重启 Bongo Cat 才生效（配置是启动时读的）')
    break

  case '关网络':
    改一个键('network', 'false', '已关闭网络')
    break

  case '发本机':
    // 把发送目标改成回环地址 —— 这样它发的消息我们本机就能收到
    if (!fs.existsSync(备份)) fs.copyFileSync(配置, 备份)
    改一个键('send_ip', '"127.0.0.1"', '发送目标改成本机')
    console.log('')
    console.log('⚠ 重启 Bongo Cat 生效')
    break

  case '收按键':
    // 让它当"接收方"：这样我们可以给它发消息，控制它显示什么
    if (!fs.existsSync(备份)) fs.copyFileSync(配置, 备份)
    改一个键('is_sender', 'false', '已改成接收方模式')
    console.log('')
    console.log('现在它是"听别人指挥"的那一方了。')
    console.log('下一步：我们往 50001 端口发消息，看它有什么反应。')
    break

  case '发出按键':
    if (!fs.existsSync(备份)) fs.copyFileSync(配置, 备份)
    改一个键('is_sender', 'true', '已改成发送方模式')
    break

  case '复原':
    if (!fs.existsSync(备份)) {
      console.log('✗ 没有备份文件，无法复原')
      process.exit(1)
    }
    fs.copyFileSync(备份, 配置)
    console.log('✓ 已从备份恢复成原始配置')
    break

  default:
    console.log('用法: node tools/改BongoCat配置.cjs [看|开网络|关网络|收按键|发出按键|复原]')
}
