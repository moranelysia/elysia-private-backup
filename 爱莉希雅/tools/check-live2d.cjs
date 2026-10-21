// check-live2d.cjs —— 不动 Electron，纯静态检查 Live2D 这套东西配齐了没有
//
// 检查四件事：
//   1. 三个库文件在不在、暴露的 API 对不对
//   2. 模型文件齐不齐（model3.json 里引用的每个文件都真的存在吗）
//   3. index.html 里的路径写得对不对
//   4. 模型尺寸（太大会不会拖垮渲染）
//
// 用法: node tools/check-live2d.cjs

const fs = require("fs")
const path = require("path")

const ROOT = path.resolve(__dirname, "..")
const problems = []
const notes = []

function ok(msg) {
  console.log("  ✓ " + msg)
}
function bad(msg) {
  console.log("  ✗ " + msg)
  problems.push(msg)
}
function note(msg) {
  console.log("  · " + msg)
  notes.push(msg)
}

console.log("=== 1. 三个库文件 ===")
const libs = [
  ["pixi.js", "node_modules/pixi.js/dist/pixi.js"],
  ["Cubism 核心", "renderer/lib/live2dcubismcore.min.js"],
  ["pixi-live2d-display", "node_modules/pixi-live2d-display/dist/cubism4.js"],
]
for (const [name, rel] of libs) {
  const p = path.join(ROOT, rel)
  if (fs.existsSync(p)) {
    ok(`${name}  ${rel}  (${Math.round(fs.statSync(p).size / 1024)} KB)`)
  } else {
    bad(`${name} 缺文件: ${rel}`)
  }
}

console.log("")
console.log("=== 2. 桥都提供了哪些 API（找 registerTicker / Live2DModel / InteractionManager）===")
const bridge = path.join(ROOT, "node_modules/pixi-live2d-display/dist/cubism4.js")
if (fs.existsSync(bridge)) {
  const src = fs.readFileSync(bridge, "utf8")
  for (const api of ["registerTicker", "Live2DModel", "InteractionManager", "config"]) {
    const n = src.split(api).length - 1
    if (n > 0) ok(`${api}  出现 ${n} 次`)
    else bad(`${api}  在这个文件里找不到 —— 说明这个版本没有这个 API`)
  }
  // 它到底挂到哪个全局变量上？
  const m = src.match(/exports\.(\w+)\s*=/g)
  if (m) {
    const names = [...new Set(m.map((s) => s.replace(/exports\.|=/g, "").trim()))]
    note("它导出的名字: " + names.slice(0, 20).join(", "))
  }
}

console.log("")
console.log("=== 3. 模型文件 ===")
const modelJson = path.join(ROOT, "renderer/models/elysia/cat.model3.json")
if (!fs.existsSync(modelJson)) {
  bad("找不到 " + modelJson)
} else {
  const json = JSON.parse(fs.readFileSync(modelJson, "utf8"))
  const base = path.dirname(modelJson)
  const refs = json.FileReferences || {}
  const toCheck = []
  if (refs.Moc) toCheck.push(["Moc", refs.Moc])
  if (refs.Physics) toCheck.push(["Physics", refs.Physics])
  if (refs.DisplayInfo) toCheck.push(["DisplayInfo", refs.DisplayInfo])
  for (const t of refs.Textures || []) toCheck.push(["贴图", t])
  for (const [groupName, motions] of Object.entries(refs.Motions || {})) {
    for (const mtn of motions) toCheck.push(["动作 " + groupName, mtn.File])
  }
  for (const [kind, rel] of toCheck) {
    const p = path.join(base, rel.replace(/\//g, path.sep))
    if (fs.existsSync(p)) {
      const kb = Math.round(fs.statSync(p).size / 1024)
      ok(`${kind}: ${rel}  (${kb} KB)`)
    } else {
      bad(`${kind}: ${rel} —— 文件不存在！`)
    }
  }

  console.log("")
  console.log("=== 4. 模型里绑定的参数 ===")
  const groups = json.Groups || []
  for (const g of groups) {
    note(`${g.Name}: [${(g.Ids || []).join(", ")}]`)
  }
}

console.log("")
console.log("=== 5. index.html 里的引用路径 ===")
const html = path.join(ROOT, "renderer/index.html")
if (fs.existsSync(html)) {
  const src = fs.readFileSync(html, "utf8")
  const scripts = [...src.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1])
  for (const s of scripts) {
    // 相对 renderer/ 解析
    const p = path.resolve(path.join(ROOT, "renderer"), s)
    if (fs.existsSync(p)) ok(`script ${s}`)
    else bad(`script ${s} —— 解析成 ${p}，不存在！`)
  }
  const fromMatch = src.match(/Live2DModel\.from\(\s*"([^"]+)"/)
  if (fromMatch) {
    const p = path.resolve(path.join(ROOT, "renderer"), fromMatch[1])
    if (fs.existsSync(p)) ok(`模型路径 ${fromMatch[1]}`)
    else bad(`模型路径 ${fromMatch[1]} —— 解析成 ${p}，不存在！`)
  } else {
    note("index.html 里没找到 Live2DModel.from(...) 的调用")
  }
} else {
  bad("找不到 renderer/index.html")
}

console.log("")
if (problems.length === 0) {
  console.log("静态检查全部通过。那问题出在运行时 —— 需要看控制台（F12）的报错。")
} else {
  console.log(`发现 ${problems.length} 个问题：`)
  problems.forEach((p, i) => console.log(`  ${i + 1}. ${p}`))
}
