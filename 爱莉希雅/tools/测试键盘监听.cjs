// 测试键盘监听.cjs —— 单独验证 node-global-key-listener 能不能工作
//
// 不启动 Electron，就跑这个脚本。跑起来之后你随便敲几个键，
// 屏幕上应该打印出键名。敲 15 秒后自动结束。
//
// 用法: node tools/测试键盘监听.cjs

let GlobalKeyboardListener
try {
  ;({ GlobalKeyboardListener } = require("node-global-key-listener"))
} catch (e) {
  console.log("✗ 库没装好: " + e.message)
  console.log("  跑一下: npm.cmd install node-global-key-listener")
  process.exit(1)
}

console.log("=== 键盘监听测试 ===")
console.log("库加载成功，正在挂键盘钩子……")
console.log("")
console.log("挂上之后，请随便敲几个键（字母、数字、空格都行）。")
console.log("15 秒后自动结束。")
console.log("")

async function main() {
  const 监听器 = new GlobalKeyboardListener()

  let 收到几个 = 0

  try {
    await 监听器.addListener((事件) => {
      收到几个++
      const 原始名 = 事件.name || 事件.rawKey?.name || "?"
      console.log(`  [${收到几个}] 键名="${原始名}"  状态=${事件.state}  vKey=${事件.vKey}`)
      return false
    })
    console.log("✓ 钩子挂上了\n")
  } catch (err) {
    console.log("✗ 挂钩子失败: " + err.message)
    if (err.stack) console.log(err.stack.split("\n").slice(0, 5).join("\n"))
    process.exit(1)
  }

  setTimeout(() => {
    console.log("")
    console.log("=== 结果 ===")
    if (收到几个 === 0) {
      console.log("✗ 15 秒里一个按键都没收到。")
      console.log("  可能的原因：")
      console.log("   · 你在这 15 秒里没敲键盘")
      console.log("   · 杀毒软件 / Windows 安全中心拦了键盘钩子")
      console.log("   · 当前这个终端窗口没有焦点（要在这个窗口里敲）")
    } else {
      console.log(`✓ 收到了 ${收到几个} 个按键事件 —— 库工作正常！`)
    }
    try {
      监听器.kill()
    } catch {
      /* 忽略 */
    }
    process.exit(0)
  }, 15000)
}

main().catch((e) => {
  console.log("出错: " + e.message)
  process.exit(1)
})
