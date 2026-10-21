/** v13 Live2D 身体：完整头饰已进入原生 ArtMesh，只消费主进程的统一表现事件。 */
(() => {
  'use strict'

  const MODEL_URL = 'models/elysia-v13/seethrough_blink.model3.json'
  const 表情参数 = {
    平静: { 眼: 1, 眉: 0, 嘴型: 0.08, 头X: 0, 头Y: 0, 头Z: 0, 眼球Y: 0 },
    开心: { 眼: 0.82, 眉: 0.16, 嘴型: 0.58, 头X: 2, 头Y: 1, 头Z: -2, 眼球Y: 0.08 },
    好奇: { 眼: 1, 眉: 0.28, 嘴型: 0.16, 头X: 4, 头Y: 2, 头Z: -7, 眼球Y: 0.16 },
    认真: { 眼: 0.88, 眉: -0.20, 嘴型: -0.08, 头X: 0, 头Y: -1, 头Z: 0, 眼球Y: 0 },
    担心: { 眼: 0.90, 眉: 0.34, 嘴型: -0.18, 头X: -2, 头Y: -2, 头Z: 2, 眼球Y: -0.10 },
    惊讶: { 眼: 1, 眉: 0.48, 嘴型: 0.05, 头X: 0, 头Y: 5, 头Z: 0, 眼球Y: 0.16 },
  }
  const 类型到情绪 = {
    待机: '平静', 思考: '好奇', 执行: '认真', 说话: '平静',
    开心: '开心', 关心: '担心', 认真: '认真', 疑惑: '好奇', 惊讶: '惊讶',
  }
  const 模型基准下移比例 = 0.085

  let 应用 = null
  let 模型 = null
  let 表现 = { 类型: '待机', 强度: 0.2, 活跃度: 0.25, 温度: 0.72, 表情: '' }
  let 在说话 = false
  let 目标口型 = 0
  let 实际口型 = 0
  let 上一帧 = performance.now()
  let 当前 = { ...表情参数.平静 }
  let 下次眨眼 = performance.now() + 1800
  let 眨眼开始 = 0
  let 当前动作 = null
  let 动作开始 = 0
  let 待机摆动权重 = 0

  const 限制 = (值, 最小, 最大) => Math.max(最小, Math.min(最大, Number(值) || 0))
  const 靠近 = (a, b, 比例) => a + (b - a) * 比例

  let 鼠标手势 = null
  const 画布 = document.getElementById('live2d')
  画布.addEventListener('contextmenu', (事件) => 事件.preventDefault())
  画布.addEventListener('dblclick', (事件) => {
    if (事件.button !== 0) return
    window.爱莉身体.切换快聊()
    事件.preventDefault()
  })
  画布.addEventListener('pointerdown', (事件) => {
    if (![0, 2].includes(事件.button)) return
    const 类型 = 事件.button === 0 ? '移动' : '缩放'
    鼠标手势 = { 指针: 事件.pointerId, 类型 }
    画布.setPointerCapture(事件.pointerId)
    document.body.classList.toggle('拖动中', 类型 === '移动')
    document.body.classList.toggle('缩放中', 类型 === '缩放')
    window.爱莉身体.手势('开始', 类型, 事件.screenX, 事件.screenY)
    事件.preventDefault()
  })
  画布.addEventListener('pointermove', (事件) => {
    if (!鼠标手势 || 鼠标手势.指针 !== 事件.pointerId) return
    window.爱莉身体.手势('移动', 鼠标手势.类型, 事件.screenX, 事件.screenY)
    事件.preventDefault()
  })
  const 结束鼠标手势 = (事件) => {
    if (!鼠标手势 || 鼠标手势.指针 !== 事件.pointerId) return
    window.爱莉身体.手势('结束', 鼠标手势.类型, 事件.screenX, 事件.screenY)
    鼠标手势 = null
    document.body.classList.remove('拖动中', '缩放中')
    事件.preventDefault()
  }
  画布.addEventListener('pointerup', 结束鼠标手势)
  画布.addEventListener('pointercancel', 结束鼠标手势)

  function 缩放() {
    if (!应用 || !模型) return
    应用.renderer.resize(innerWidth, innerHeight)
    模型.scale.set(1)
    模型.scale.set(Math.min((innerWidth * 0.98) / 模型.width, (innerHeight * 0.99) / 模型.height))
    模型.anchor.set(0.5, 0.5)
    模型.position.set(innerWidth / 2, innerHeight * (0.5 + 模型基准下移比例))
  }

  function 当前口型(dt) {
    const 目标 = 在说话 ? 目标口型 : 0
    // 开口略快、闭口略慢，既跟得上音节又不让嘴唇逐帧抖动。
    const 追随 = 1 - Math.pow(目标 > 实际口型 ? 0.00003 : 0.003, dt / 1000)
    实际口型 = 靠近(实际口型, 目标, 追随)
    if (实际口型 < 0.003) 实际口型 = 0
    return 实际口型
  }

  function 眨眼值(现在) {
    if (!眨眼开始 && 现在 >= 下次眨眼) 眨眼开始 = 现在
    if (!眨眼开始) return 1
    const 进度 = (现在 - 眨眼开始) / 180
    if (进度 >= 1) {
      眨眼开始 = 0
      下次眨眼 = 现在 + 2800 + Math.random() * 3600
      return 1
    }
    return Math.abs(进度 * 2 - 1)
  }

  function 应用一帧() {
    if (!模型) return
    const 现在 = performance.now()
    const dt = Math.min(50, 现在 - 上一帧); 上一帧 = 现在
    const 核心 = 模型.internalModel.coreModel
    // 原内部更新刚刚跑完 Idle 动作与物理。先保存预览器同款的分层参数，
    // 再混入 Agent 表情；不能再用整个 PIXI 容器代替头发/身体各自的动态。
    const 预览待机 = {
      头X: Number(核心.getParameterValueById('ParamAngleX') || 0),
      头Y: Number(核心.getParameterValueById('ParamAngleY') || 0),
      头Z: Number(核心.getParameterValueById('ParamAngleZ') || 0),
      身X: Number(核心.getParameterValueById('ParamBodyAngleX') || 0),
      身Y: Number(核心.getParameterValueById('ParamBodyAngleY') || 0),
      身Z: Number(核心.getParameterValueById('ParamBodyAngleZ') || 0),
      呼吸: Number(核心.getParameterValueById('ParamBreath') || 0),
    }
    const 情绪 = 类型到情绪[表现.类型] || '平静'
    const 目标原 = 表情参数[情绪] || 表情参数.平静
    const 强度 = 限制(表现.强度, 0.18, 1)
    const 目标 = {}
    for (const 键 of Object.keys(当前)) 目标[键] = 靠近(表情参数.平静[键], 目标原[键], 强度)
    const 追随 = 1 - Math.pow(0.001, dt / 1000)
    for (const 键 of Object.keys(当前)) 当前[键] = 靠近(当前[键], 目标[键], 追随)

    const 秒 = 现在 / 1000
    const 活跃 = 限制(表现.活跃度, 0, 1)
    // 回复完成后也属于待机；思考、执行、说话时平滑收起 Idle 曲线，交给主动表情。
    const 忙碌中 = ['思考', '执行', '说话'].includes(String(表现.阶段 || 表现.类型 || ''))
    const 摆动追随 = 1 - Math.pow(0.002, dt / 1000)
    待机摆动权重 = 靠近(待机摆动权重, 忙碌中 ? 0 : 1, 摆动追随)
    模型.position.set(innerWidth / 2, innerHeight * (0.5 + 模型基准下移比例))
    模型.rotation = 0
    const 主动权重 = 1 - 待机摆动权重
    const 漂X = Math.sin(秒 * 0.72) * (1.2 + 活跃 * 1.7) * 主动权重
    const 漂Y = Math.sin(秒 * 0.53 + 1.1) * (0.5 + 活跃 * 0.8) * 主动权重
    let 动作X = 0; let 动作Y = 0
    if (当前动作) {
      const 进度 = (现在 - 动作开始) / 1150
      if (进度 >= 1) 当前动作 = null
      else {
        const 收束 = 1 - 进度
        if (当前动作 === 'Nod') 动作Y = Math.sin(进度 * Math.PI * 3) * 6.5 * 收束
        if (当前动作 === 'Shake') 动作X = Math.sin(进度 * Math.PI * 4) * 9 * 收束
      }
    }
    const 头X = 限制(当前.头X + 预览待机.头X * 0.9 * 待机摆动权重 + 漂X + 动作X, -24, 24)
    const 头Y = 限制(当前.头Y + 预览待机.头Y * 0.9 * 待机摆动权重 + 漂Y + 动作Y, -12, 12)
    const 头Z = 限制(当前.头Z + 预览待机.头Z * 0.8 * 待机摆动权重 + Math.sin(秒 * 0.41) * 0.8 * 主动权重, -10, 10)
    // 身体沿用预览 Idle 的独立曲线，但压到约 55%，保持轻微重心变化且不拉坏肩颈。
    const 身X = 限制(当前.头X / 15 + 预览待机.身X * 0.55 * 待机摆动权重, -2.2, 2.2)
    const 身Y = 限制(预览待机.身Y * 0.55 * 待机摆动权重, -1.2, 1.2)
    const 身Z = 限制(预览待机.身Z * 0.55 * 待机摆动权重 + Math.sin(秒 * 0.38) * 0.45 * 主动权重, -1.5, 1.5)
    核心.setParameterValueById('ParamAngleX', 头X)
    核心.setParameterValueById('ParamAngleY', 头Y)
    核心.setParameterValueById('ParamAngleZ', 头Z)
    核心.setParameterValueById('ParamBodyAngleX', 身X)
    核心.setParameterValueById('ParamBodyAngleY', 身Y)
    核心.setParameterValueById('ParamBodyAngleZ', 身Z)
    核心.setParameterValueById('ParamBreath', 靠近((Math.sin(秒 * 1.15) + 1) / 2, 预览待机.呼吸, 待机摆动权重))
    核心.setParameterValueById('ParamEyeBallX', 限制((当前.头X + 漂X) / 18, -0.7, 0.7))
    核心.setParameterValueById('ParamEyeBallY', 当前.眼球Y)
    const 眼 = 限制(当前.眼 * 眨眼值(现在), 0, 1)
    核心.setParameterValueById('ParamEyeLOpen', 眼)
    核心.setParameterValueById('ParamEyeROpen', 眼)
    核心.setParameterValueById('ParamBrowLY', 当前.眉)
    核心.setParameterValueById('ParamBrowRY', 当前.眉)
    核心.setParameterValueById('ParamMouthForm', 当前.嘴型)
    const 嘴开合 = 当前口型(dt)
    核心.setParameterValueById('ParamMouthOpenY', 嘴开合)
    // Cubism 会在内部 update 末尾恢复参数，所以物理必须放在 Agent 参数之后、
    // core.update 之前执行，前后发才会真正吃到这一帧的头部与身体运动。
    模型.internalModel.physics?.evaluate(核心, dt / 1000)
    const 原前发 = Number(核心.getParameterValueById('ParamHairFront') || 0)
    const 原后发 = Number(核心.getParameterValueById('ParamHairBack') || 0)
    // 只在待机阶段把物理解算后的头发输出略微放大；身体输入和物理延迟保持不变。
    // 进入思考/执行/说话时倍率会随待机权重平滑回到 1，不干扰主动动作。
    const 头发倍率 = 靠近(1, 1.6, 待机摆动权重)
    const 前发 = 限制(原前发 * 头发倍率, -1, 1)
    const 后发 = 限制(原后发 * 头发倍率, -1, 1)
    核心.setParameterValueById('ParamHairFront', 前发)
    核心.setParameterValueById('ParamHairBack', 后发)
    核心.update()
    window.__live2d待机摆动 = {
      容器X: 0, 容器Y: 0, 容器角度: 0,
      头X: Number(头X.toFixed(3)), 头Y: Number(头Y.toFixed(3)), 头Z: Number(头Z.toFixed(3)),
      身X: Number(身X.toFixed(3)), 身Y: Number(身Y.toFixed(3)), 身Z: Number(身Z.toFixed(3)),
      前发: Number(前发.toFixed(4)), 后发: Number(后发.toFixed(4)),
      原前发: Number(原前发.toFixed(4)), 原后发: Number(原后发.toFixed(4)), 头发倍率: Number(头发倍率.toFixed(3)),
      权重: Number(待机摆动权重.toFixed(3)),
    }
    window.__live2d口型 = { 在说话, 目标: Number(目标口型.toFixed(3)), 实际: Number(嘴开合.toFixed(3)) }
  }

  function 收表现(新的) {
    if (!新的 || typeof 新的 !== 'object') return
    表现 = { ...表现, ...新的 }
    const 表情 = String(表现.表情 || '')
    if (/点头|同意/.test(表情)) 当前动作 = 'Nod'
    else if (/摇头|否定/.test(表情)) 当前动作 = 'Shake'
    else return
    动作开始 = performance.now()
  }

  async function 启动() {
    if (!window.PIXI?.live2d?.Live2DModel) throw new Error('Live2D 运行库没有载入')
    应用 = new PIXI.Application({
      view: document.getElementById('live2d'), width: innerWidth, height: innerHeight,
      backgroundAlpha: 0, antialias: true, autoDensity: true,
      resolution: Math.min(devicePixelRatio || 1, 2),
    })
    模型 = await PIXI.live2d.Live2DModel.from(MODEL_URL, {
      autoHitTest: false, autoFocus: false, ticker: PIXI.Ticker.shared,
    })
    if (!模型.internalModel.renderer._clippingManager) {
      const 原更新上下文 = 模型.internalModel.updateWebGLContext.bind(模型.internalModel)
      模型.internalModel.updateWebGLContext = (gl, id) => {
        const 渲染器 = 模型.internalModel.renderer
        渲染器._clippingManager = { setGL() {}, _currentFrameNo: 0, _maskTexture: undefined }
        try { 原更新上下文(gl, id) } finally { 渲染器._clippingManager = undefined }
      }
    }
    应用.stage.addChild(模型)
    缩放()
    addEventListener('resize', 缩放)

    const 原内部更新 = 模型.internalModel.update.bind(模型.internalModel)
    模型.internalModel.update = (dt, now) => {
      // 原更新会在物理之后 loadParameters，把 ParamHairFront/Back 恢复为 0。
      // 暂时取下物理，先让 Idle 动作算出分层输入；物理在 应用一帧() 末尾只跑一次。
      const 内部 = 模型.internalModel
      const 物理 = 内部.physics
      if (物理) 内部.physics = undefined
      let 结果
      try { 结果 = 原内部更新(dt, now) } finally { if (物理) 内部.physics = 物理 }
      应用一帧()
      return 结果
    }
    void 模型.motion('Idle', 0, 1).catch(() => {})

    window.爱莉身体.表现变了(收表现)
    window.爱莉身体.说话变了((开) => {
      在说话 = Boolean(开)
      if (!在说话) {
        目标口型 = 0
        实际口型 = 0
      }
    })
    window.爱莉身体.口型变了((强度) => { 目标口型 = 限制(强度, 0, 1) })
    window.爱莉身体.准备好了()
    document.getElementById('加载状态').classList.add('好了')
    window.__live2d已就绪 = true
  }

  启动().catch((错误) => {
    const 提示 = document.getElementById('加载状态')
    提示.textContent = '身体加载失败：' + (错误.message || 错误)
    console.error(错误)
  })
})()
