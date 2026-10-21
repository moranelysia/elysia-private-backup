'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('爱莉身体', {
  表现变了: (回调) => ipcRenderer.on('live2d-表现', (_事件, 状态) => 回调(状态)),
  说话变了: (回调) => ipcRenderer.on('live2d-说话', (_事件, 在说) => 回调(Boolean(在说))),
  口型变了: (回调) => ipcRenderer.on('live2d-口型', (_事件, 强度) => 回调(Math.max(0, Math.min(1, Number(强度) || 0)))),
  切换快聊: () => ipcRenderer.send('live2d-快聊切换'),
  手势: (阶段, 类型, x, y) => ipcRenderer.send('live2d-手势', {
    阶段: String(阶段 || ''),
    类型: String(类型 || ''),
    x: Number(x),
    y: Number(y),
  }),
  准备好了: () => ipcRenderer.send('live2d-准备好了'),
})
