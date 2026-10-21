// diagnose.js —— 用 Electron 偷偷把页面跑一遍，把控制台的报错全抓出来
//
// 为什么需要它：页面里的报错只有开发者工具（F12）能看到，
// 但那样得靠人复述。这个脚本自己开一个隐藏窗口加载页面，
// 监听所有 console 输出和错误，打印到命令行——这样一眼就能看到真相。
//
// 用法: node_modules\.bin\electron.cmd tools/diagnose.js
//      （或者双击 tools\诊断.cmd）

const { app, BrowserWindow } = require("electron")
const path = require("path")

const PAGE = path.join(__dirname, "..", "renderer", "index.html")

// 把窗口藏起来跑，不打扰你
app.on("ready", () => {
  const win = new BrowserWindow({
    width: 420,
    height: 560,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      // 诊断时打开沙箱外的权限，方便看更多报错
      contextIsolation: true,
    },
  })

  console.log("=== 诊断开始 ===")
  console.log("页面: " + PAGE)
  console.log("")

  // ---- 抓页面里的 console.log / warn / error ----
  win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    const tag = ["LOG", "WARN", "ERROR", "DEBUG"][level] || "?"
    const where = sourceId ? ` (${path.basename(sourceId)}:${line})` : ""
    console.log(`[页面 ${tag}]${where} ${message}`)
  })

  // ---- 抓页面里的 JS 异常 ----
  win.webContents.on("render-process-gone", (_e, details) => {
    console.log("")
    console.log("!!! 渲染进程崩了:", JSON.stringify(details))
  })

  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.log("")
    console.log(`!!! 页面加载失败: ${desc} (${code})  ${url}`)
  })

  // ---- 页面加载过程中的"预加载脚本"报错 ----
  win.webContents.on("preload-error", (_e, preloadPath, error) => {
    console.log("")
    console.log(`!!! preload 出错: ${preloadPath}`)
    console.log("    " + error.message)
  })

  win.loadFile(PAGE)

  // ---- 给它 20 秒，然后把页面里的状态也问一遍 ----
  setTimeout(async () => {
    console.log("")
    console.log("=== 20 秒后的现场 ===")
    try {
      const report = await win.webContents.executeJavaScript(`
        (function () {
          const canvas = document.querySelector("canvas")
          return {
            pixi版本: typeof PIXI !== "undefined" ? PIXI.VERSION : "PIXI 没加载",
            live2d命名空间: typeof PIXI !== "undefined" ? typeof PIXI.live2d : "无",
            cubism核心: typeof Live2DCubismCore,
            有canvas: !!canvas,
            canvas尺寸: canvas ? canvas.width + "x" + canvas.height : "无",
            页面上有几个元素: document.body.children.length,
            加载提示还在吗: !!document.getElementById("loading"),
            加载提示文字: (document.getElementById("loading") || {}).textContent || "(已移除)",
            模型对象在吗: typeof window.模型,
            模型信息: window.模型 ? {
              宽: Math.round(window.模型.width),
              高: Math.round(window.模型.height),
              可见: window.模型.visible,
              缩放: window.模型.scale.x,
            } : null,
          }
        })()
      `)
      console.log(JSON.stringify(report, null, 2))
    } catch (e) {
      console.log("问不出来:", e.message)
    }
    console.log("")
    console.log("=== 诊断结束 ===")
    app.quit()
  }, 20000)
})
