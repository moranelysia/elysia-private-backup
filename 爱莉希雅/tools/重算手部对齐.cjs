// 重算手部对齐.cjs —— 用心部大小（而不是格间距）来算缩放
//
// 【上一次错在哪】
//   我拿"素材格间距 79px"比"她键盘格间距 46px"，算出 0.582。
//   但真正该比的是"爱心的宽度"：
//     素材里的爱心 278px 宽，她键盘上按键 46px 宽
//     → 缩放 = 46 / 278 = 0.165
//   0.582 是 0.165 的 3.5 倍 —— 所以手大得夸张。
//
// 【这次的做法】
//   对每个键，用原图里的实测数据分别算出：
//     · 爱心该多大、摆哪儿
//     · 手该多大、相对于爱心的偏移是多少
//
// 用法: node tools/重算手部对齐.cjs

const fs = require("fs")

// 从测量.json 读实测数据（爱心和手在每张原图里的位置与大小）
const 测量 = JSON.parse(fs.readFileSync("renderer/assets/keyboard/测量.json", "utf8"))

const 她键盘 = {
  格宽: 46,          // 她键盘上每个键显示多大
}

// 原图里爱心的宽度（25 张都一样）
const 素材爱心宽 = 278
const 缩放 = 她键盘.格宽 / 素材爱心宽

console.log(`素材爱心 ${素材爱心宽}px  →  她键盘按键 ${她键盘.格宽}px`)
console.log(`缩放 = ${缩放.toFixed(4)}（上次错用了 0.582，大了 3.5 倍）\n`)

const 键序 = [
  "Shift", "Ctrl", "Alt", "Space", "Enter",
  "Z", "X", "C", "V", "B",
  "A", "S", "D", "F", "G",
  "Q", "W", "E", "R", "T",
  "1", "2", "3", "4", "5",
]

const 表 = {}

for (const 项 of 测量) {
  const 键名 = 项.键名
  const 网格键 = /^[1-5]$/.test(键名) ? "Digit" + 键名 : 键名

  // 爱心中心（在素材图里的坐标）
  const 爱心中心X = 项.爱心.x + 项.爱心.宽 / 2
  const 爱心中心Y = 项.爱心.y + 项.爱心.高 / 2

  // 手相对于爱心的偏移（素材图坐标）→ 缩放到页面尺寸
  const 手偏移X = (项.手.x + 项.手.宽 / 2 - 爱心中心X) * 缩放
  const 手偏移Y = (项.手.y + 项.手.高 / 2 - 爱心中心Y) * 缩放

  // 手在页面上的大小
  const 手宽 = 项.手.宽 * 缩放
  const 手高 = 项.手.高 * 缩放

  表[网格键] = {
    手宽: Number(手宽.toFixed(1)),
    手高: Number(手高.toFixed(1)),
    偏移X: Number(手偏移X.toFixed(1)),
    偏移Y: Number(手偏移Y.toFixed(1)),
  }
}

fs.writeFileSync(
  "renderer/assets/keyboard/对齐表.json",
  JSON.stringify(
    {
      说明: "手的显示尺寸，以及它相对于爱心中心的偏移（都已换算成页面像素）",
      缩放: Number(缩放.toFixed(4)),
      她键盘格宽: 她键盘.格宽,
      表,
    },
    null,
    2
  ),
  "utf8"
)

console.log("对齐表（前 8 个）：")
for (const 键 of ["Shift", "Ctrl", "Alt", "Space", "Enter", "Z", "X", "C"]) {
  const t = 表[键]
  console.log(`  ${键.padEnd(6)} 手 ${t.手宽}x${t.手高}px   相对爱心偏移 (${t.偏移X}, ${t.偏移Y})`)
}
console.log("\n存到: renderer/assets/keyboard/对齐表.json")
