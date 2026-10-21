// pixi-live2d-display 的浏览器构建会探测这两个 Node 全局；只给它最小只读形状。
window.global = window
window.process = Object.freeze({ env: Object.freeze({ NODE_ENV: 'production' }) })
