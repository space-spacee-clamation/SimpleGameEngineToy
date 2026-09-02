<template>
  <section class="lab-panel">
    <!-- ① 头部：标题 + 操作按钮 + 保存轻提示 -->
    <header class="lab-head">
      <h3 class="lab-title">{{ title }}</h3>
      <div class="lab-actions">
        <button class="btn" type="button" @click="run">▶ 运行<span class="kbd">Ctrl+Enter</span></button>
        <button class="btn" type="button" @click="stopRun">⏹ 停止</button>
        <button class="btn" type="button" @click="resetLab">↺ 重置</button>
        <button class="btn" type="button" @click="saveCode">💾 保存</button>
        <transition name="toast-fade">
          <span v-if="toastVisible" class="toast">已保存 ✓</span>
        </transition>
      </div>
    </header>

    <!-- ② 主体：左编辑器 / 右画布，flex 布局，窄屏自动换行 -->
    <div class="lab-body">
      <div class="editor-wrap" :style="{ height: height + 'px' }">
        <div ref="editorEl" class="editor-host"></div>
      </div>
      <div class="stage-wrap">
        <canvas ref="canvasEl" class="stage-canvas" :width="CANVAS_W" :height="CANVAS_H"></canvas>
        <!-- ③ HUD：帧率 / dt / 帧号（每帧直接写 DOM，避免触发 Vue 重渲染） -->
        <div class="hud">
          帧率 <b ref="hudFpsEl">0</b> fps · dt <b ref="hudDtEl">0.0</b> ms · 帧号 <b ref="hudFrameEl">0</b>
        </div>
      </div>
    </div>

    <!-- ④ 错误面板：默认隐藏，出错时显示 message 与 stack 首行 -->
    <pre v-if="hasError" class="error-panel">{{ errorText }}</pre>

    <!-- ⑤ engine API 说明（折叠面板） -->
    <details class="api-docs">
      <summary>engine API 说明</summary>
      <pre>{{ API_DOC }}</pre>
    </details>
  </section>
</template>

<script setup>
// ============================================================
// CodeLab —— 通用 JS 代码实验台
// 左侧 CodeMirror 编辑代码，右侧 canvas 即时看到运行效果。
// 本组件允许同一页面多次实例化：所有可变状态都保存在
// setup 闭包内，不使用任何模块级可变全局（只读常量除外）。
// ============================================================
import { ref, onMounted, onUnmounted } from 'vue'
import CodeMirror from 'codemirror'
import 'codemirror/lib/codemirror.css'
import 'codemirror/mode/javascript/javascript.js'

// ---------- 只读常量（可安全共享） ----------
const CANVAS_W = 720 // 画布内部分辨率：宽
const CANVAS_H = 440 // 画布内部分辨率：高
const STORAGE_PREFIX = 'ged-lab:' // localStorage 键前缀
const TOAST_MS = 1500 // 「已保存 ✓」轻提示时长（毫秒）
// 运行中需要 preventDefault、防止页面滚动的按键
const SCROLL_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

// 「engine API 说明」折叠面板正文（用字符串拼接，避免模板空白处理影响排版）
const API_DOC = [
  'engine.W / engine.H              画布内部宽 / 高（720 × 440）',
  'engine.run(app)                  启动主循环；app 的三个回调全部必填：',
  '    app.setup(state)             启动时调用一次，用于初始化 state',
  '    app.update(state, dt, input) 每帧逻辑；dt 单位秒（上限 0.1）',
  '    app.draw(state, ctx)         每帧绘制；ctx 为画布 2D 上下文',
  'input.keys                       按键表：e.code -> true / false',
  'input.down(code)                 电平检测：这个键当前是否被按住',
  'input.pressed(code)              边沿检测：这个键是否本帧刚刚按下',
  'input.mouse                      鼠标状态 { x, y, down, clicked }，画布坐标系',
  '',
  '快捷键：Ctrl / Cmd + Enter 重新运行 · Esc 停止运行',
].join('\n')

// ---------- Props ----------
const props = defineProps({
  code: { type: String, required: true }, // 初始用户代码
  title: { type: String, default: '代码实验' }, // 面板标题
  persistKey: { type: String, required: true }, // localStorage 键：'ged-lab:' + persistKey
  height: { type: Number, default: 460 }, // 编辑器高度（px）
})

// ---------- 模板引用 ----------
const editorEl = ref(null) // CodeMirror 挂载点
const canvasEl = ref(null) // 画布
const hudFpsEl = ref(null) // HUD：帧率数字
const hudDtEl = ref(null) // HUD：dt 毫秒数
const hudFrameEl = ref(null) // HUD：帧号

// ---------- 响应式 UI 状态 ----------
const hasError = ref(false) // 是否显示错误面板
const errorText = ref('') // 错误内容（message + stack 首行）
const toastVisible = ref(false) // 「已保存 ✓」轻提示开关

// ---------- 每实例独立的运行时状态（全部在 setup 闭包内） ----------
let editor = null // CodeMirror 实例
let ctx = null // 画布 2D 上下文
let running = false // 主循环是否在运行
let rafId = 0 // requestAnimationFrame 句柄
let lastTime = 0 // 上一帧时间戳
let frameNo = 0 // 帧号
let emaFps = 0 // EMA 平滑后的帧率
let appRef = null // 当前用户的 app 对象
let stateRef = null // 当前用户的 state 对象
let loopGen = 0 // 运行代数：每次启动 +1，旧循环回调凭它自行退出
let runCalled = false // 本次 run() 中用户代码是否调用了 engine.run
let toastTimer = null // 轻提示定时器

// 按键表：e.code -> true/false。对象身份恒定，input.keys 直接暴露它。
const keys = {}
// 上一帧按键快照（每帧末浅拷贝重建），用于边沿检测。
let prevKeys = {}
// 鼠标状态（画布坐标系），input.mouse 直接暴露它。
const mouse = { x: 0, y: 0, down: false, clicked: false }

// ---------- 输入 API（同一实例内常驻，重启运行时只清空内容） ----------
const inputApi = {
  keys, // 按键表
  // 电平检测：当前是否按着
  down(code) {
    return !!keys[code]
  },
  // 边沿检测：本帧刚刚按下
  pressed(code) {
    return !!keys[code] && !prevKeys[code]
  },
  mouse, // 鼠标状态
}

// ---------- 工具函数 ----------
function storageKey() {
  return STORAGE_PREFIX + props.persistKey
}

/** 读取已保存代码；localStorage 一律 try/catch，异常时视为没有保存 */
function readSavedCode() {
  try {
    return localStorage.getItem(storageKey())
  } catch (err) {
    return null
  }
}

/** 显示错误面板：message + stack 首行 */
function showError(err) {
  hasError.value = true
  const msg = err && err.message ? String(err.message) : String(err)
  let firstLine = ''
  if (err && typeof err.stack === 'string' && err.stack) {
    firstLine = err.stack.split('\n')[0].trim()
  }
  errorText.value = firstLine && firstLine !== msg ? msg + '\n' + firstLine : msg
}

function clearError() {
  hasError.value = false
  errorText.value = ''
}

/** 「已保存 ✓」轻提示，1.5 秒后自动消失（不用 alert） */
function showToast() {
  if (toastTimer !== null) clearTimeout(toastTimer)
  toastVisible.value = true
  toastTimer = setTimeout(() => {
    toastVisible.value = false
    toastTimer = null
  }, TOAST_MS)
}

/** 清空输入状态（原地清空，保持 keys / mouse 对象身份不变） */
function clearInputState() {
  for (const k in keys) delete keys[k]
  prevKeys = {}
  mouse.x = 0
  mouse.y = 0
  mouse.down = false
  mouse.clicked = false
}

/** 停止主循环：置位标志 + 取消 rAF */
function haltLoop() {
  running = false
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = 0
  }
}

// ---------- engine API（每次运行构造全新对象交给用户代码） ----------
function buildEngine() {
  return {
    W: CANVAS_W,
    H: CANVAS_H,
    // 用户代码通过 engine.run(app) 启动主循环
    run(app) {
      startWithApp(app)
    },
  }
}

/** 校验 app 的三个必填回调，缺失即抛中文错误（由 run() 捕获后显示） */
function startWithApp(app) {
  runCalled = true // 先标记 engine.run 已被调用（校验失败也会显示对应错误）
  if (!app || typeof app !== 'object') {
    throw new TypeError('engine.run(app) 需要传入一个 app 对象，例如 engine.run({ setup, update, draw })')
  }
  if (typeof app.setup !== 'function') {
    throw new TypeError('engine.run(app) 缺少必填回调：app.setup(state)')
  }
  if (typeof app.update !== 'function') {
    throw new TypeError('engine.run(app) 缺少必填回调：app.update(state, dt, input)')
  }
  if (typeof app.draw !== 'function') {
    throw new TypeError('engine.run(app) 缺少必填回调：app.draw(state, ctx)')
  }
  bootLoop(app)
}

/** 启动主循环；同一时刻本实例只允许一个循环存活 */
function bootLoop(app) {
  haltLoop() // 先停掉可能存在的旧循环
  clearInputState() // 清空按键 / 鼠标残留
  clearError()
  stateRef = {} // 每次运行都使用全新的 state
  appRef = app
  frameNo = 0
  emaFps = 0
  try {
    app.setup(stateRef) // setup 只在启动时调用一次
  } catch (err) {
    showError(err)
    return
  }
  const gen = ++loopGen // 本次运行的代数号
  lastTime = performance.now()
  running = true
  rafId = requestAnimationFrame((now) => tick(now, gen))
}

/**
 * 主循环单帧：update -> draw -> 帧末记账 -> 排下一帧。
 * 回调一律 try/catch：出错立即停循环并显示错误面板，异常绝不逃逸到全局。
 */
function tick(now, gen) {
  if (!running || gen !== loopGen) return // 已停止，或已被更新的运行取代
  const dt = Math.min((now - lastTime) / 1000, 0.1)
  lastTime = now
  frameNo += 1
  try {
    appRef.update(stateRef, dt, inputApi)
    appRef.draw(stateRef, ctx)
  } catch (err) {
    running = false
    showError(err)
    return
  }
  // 帧率 EMA：0.9 旧 + 0.1 新（首帧用瞬时值做种子）
  const instFps = dt > 0 ? 1 / dt : 0
  emaFps = frameNo === 1 ? instFps : emaFps * 0.9 + instFps * 0.1
  // HUD 直接写 DOM 文本，避免每帧触发 Vue 重渲染
  if (hudFpsEl.value) hudFpsEl.value.textContent = String(Math.round(emaFps))
  if (hudDtEl.value) hudDtEl.value.textContent = (dt * 1000).toFixed(1)
  if (hudFrameEl.value) hudFrameEl.value.textContent = String(frameNo)
  // 帧末记账：按键快照供下一帧边沿检测；clicked 只维持一帧
  prevKeys = { ...keys }
  mouse.clicked = false
  rafId = requestAnimationFrame((t) => tick(t, gen))
}

// ---------- 对外动作（按钮 / 快捷键共用） ----------
/** ▶ 运行：编译并执行编辑器里的代码，用户代码通过 engine.run(app) 启动循环 */
function run() {
  if (!editor) return
  haltLoop()
  clearError()
  runCalled = false
  const src = editor.getValue() || ''
  try {
    // 约定：new Function('engine', '"use strict";\n' + src)(api)
    const factory = new Function('engine', '"use strict";\n' + src)
    factory(buildEngine())
  } catch (err) {
    // 启动阶段错误（编译错误 / 同步执行错误 / 参数校验错误）一律捕获显示
    showError(err)
    return
  }
  if (!runCalled) {
    // 代码同步执行完了却没有启动循环，给出明确提示
    showError(new Error('代码已执行，但没有调用 engine.run(app)，主循环无法启动。请在代码末尾调用 engine.run({ setup, update, draw })。'))
  }
}

/** ⏹ 停止：取消 rAF */
function stopRun() {
  haltLoop()
}

/** ↺ 重置：恢复 props.code，保存并重新运行 */
function resetLab() {
  if (!editor) return
  editor.setValue(props.code)
  saveCode()
  run()
}

/** 💾 保存：写入 localStorage，成功显示轻提示，失败显示错误面板 */
function saveCode() {
  if (!editor) return
  try {
    localStorage.setItem(storageKey(), editor.getValue())
    showToast()
  } catch (err) {
    showError(new Error('保存失败：' + (err && err.message ? err.message : String(err))))
  }
}

// ---------- 全局事件 ----------
/** 判断事件目标是否在可编辑控件里（此时不抢占空格 / 方向键，保证编辑器可正常打字） */
function isEditableTarget(ev) {
  const t = ev.target
  if (!t || typeof t.closest !== 'function') return false
  return !!t.closest('input, textarea, select, button, [contenteditable], .CodeMirror')
}

function onGlobalKeydown(ev) {
  // 记录按键电平
  keys[ev.code] = true
  // Ctrl / Cmd + Enter：重新运行（编辑器内的按键由 CodeMirror extraKeys 先处理，已处理则跳过，避免双重启动）
  if ((ev.key === 'Enter' || ev.code === 'Enter') && (ev.ctrlKey || ev.metaKey)) {
    if (!ev.defaultPrevented) {
      ev.preventDefault()
      run()
    }
    return
  }
  // Esc：停止
  if (running && ev.code === 'Escape') {
    haltLoop()
    return
  }
  // 运行中阻止空格 / 方向键滚动页面（在编辑器等可编辑区域打字时除外）
  if (running && SCROLL_KEYS.has(ev.code) && !isEditableTarget(ev)) {
    ev.preventDefault()
  }
}

function onGlobalKeyup(ev) {
  keys[ev.code] = false
}

/** 窗口失焦：清空按键，避免「按键卡住」 */
function onWindowBlur() {
  for (const k in keys) delete keys[k]
  mouse.down = false
}

// ---------- 画布鼠标 ----------
/** 把指针事件换算到画布坐标系（720 × 440） */
function updateMouseFromEvent(ev) {
  const canvas = canvasEl.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const w = rect.width || CANVAS_W
  const h = rect.height || CANVAS_H
  mouse.x = ((ev.clientX - rect.left) / w) * CANVAS_W
  mouse.y = ((ev.clientY - rect.top) / h) * CANVAS_H
}

function onCanvasPointerDown(ev) {
  updateMouseFromEvent(ev)
  mouse.down = true
  mouse.clicked = true
}

function onCanvasPointerMove(ev) {
  updateMouseFromEvent(ev)
}

function onWindowPointerUp() {
  mouse.down = false
}

// ---------- 生命周期 ----------
onMounted(() => {
  // 先读 localStorage：有保存代码则替换初始代码
  const saved = readSavedCode()
  const initial = saved ? saved : props.code
  // 初始化画布 2D 上下文
  ctx = canvasEl.value.getContext('2d')
  // 初始化编辑器（不设置 theme，外观全部由 scoped 样式 + :deep() 覆盖）
  editor = CodeMirror(editorEl.value, {
    value: initial,
    mode: 'javascript',
    lineNumbers: true,
    indentUnit: 2,
    tabSize: 2,
    // 焦点在编辑器内时也能用 Ctrl/Cmd+Enter 运行
    extraKeys: {
      'Ctrl-Enter': () => run(),
      'Cmd-Enter': () => run(),
    },
  })
  // window 级监听（onUnmounted 一一移除）
  window.addEventListener('keydown', onGlobalKeydown)
  window.addEventListener('keyup', onGlobalKeyup)
  window.addEventListener('pointerup', onWindowPointerUp)
  window.addEventListener('blur', onWindowBlur)
  // 画布级监听
  canvasEl.value.addEventListener('pointerdown', onCanvasPointerDown)
  canvasEl.value.addEventListener('pointermove', onCanvasPointerMove)
  // 自动运行一次
  run()
})

onUnmounted(() => {
  // 停止主循环
  haltLoop()
  // 移除 window 级监听
  window.removeEventListener('keydown', onGlobalKeydown)
  window.removeEventListener('keyup', onGlobalKeyup)
  window.removeEventListener('pointerup', onWindowPointerUp)
  window.removeEventListener('blur', onWindowBlur)
  // 移除画布级监听
  const canvas = canvasEl.value
  if (canvas) {
    canvas.removeEventListener('pointerdown', onCanvasPointerDown)
    canvas.removeEventListener('pointermove', onCanvasPointerMove)
  }
  // 清理轻提示定时器与内部引用（本组件是 2D 画布，无 WebGL 资源需要释放）
  if (toastTimer !== null) {
    clearTimeout(toastTimer)
    toastTimer = null
  }
  editor = null
  ctx = null
  appRef = null
  stateRef = null
})
</script>

<style scoped>
/* ---------- 面板与头部（UI 基调） ---------- */
.lab-panel {
  background: #111a2a;
  border: 1px solid #1e2a3d;
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: #d7e0ea;
}
.lab-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.lab-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
.lab-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-left: auto;
}
.btn {
  background: #16233a;
  border: 1px solid #1e2a3d;
  color: #d7e0ea;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 13px;
  font-family: ui-monospace, Consolas, monospace;
  cursor: pointer;
}
.btn:hover {
  border-color: #4d8fd6;
}
.btn:active {
  transform: translateY(1px);
}
.kbd {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 11px;
  color: #7d93b3;
  border: 1px solid #1e2a3d;
  border-radius: 4px;
  padding: 1px 5px;
  margin-left: 6px;
}
.toast {
  color: #34d399;
  font-size: 12px;
  font-family: ui-monospace, Consolas, monospace;
}
.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 0.25s ease;
}
.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
}

/* ---------- 主体：编辑器 + 画布（flex，可换行） ---------- */
.lab-body {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}
.editor-wrap {
  flex: 1 1 380px;
  min-width: 300px;
  border: 1px solid #1e2a3d;
  border-radius: 8px;
  overflow: hidden;
}
.editor-host {
  height: 100%;
}
.stage-wrap {
  flex: 1 1 420px;
  min-width: 320px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.stage-canvas {
  width: 100%;
  height: auto;
  display: block;
  background: #0d1420;
  border: 1px solid #1e2a3d;
  border-radius: 8px;
  touch-action: none; /* 触屏拖拽时不滚动页面 */
}
.hud {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
  color: #7d93b3;
}
.hud b {
  color: #d7e0ea;
}

/* ---------- 错误面板 ---------- */
.error-panel {
  margin: 0;
  padding: 10px 12px;
  background: #2a1218;
  border: 1px solid #f87171;
  border-radius: 8px;
  color: #f87171;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}

/* ---------- API 说明折叠块 ---------- */
.api-docs {
  font-size: 12px;
  color: #7d93b3;
}
.api-docs summary {
  cursor: pointer;
  color: #4d8fd6;
}
.api-docs pre {
  margin: 8px 0 0;
  padding: 10px 12px;
  background: #0b0f17;
  border: 1px solid #1e2a3d;
  border-radius: 8px;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-wrap;
}

/* ---------- CodeMirror 5 外观覆盖（未引入主题 css，全部用 :deep() 定制） ---------- */
:deep(.CodeMirror) { background:#0d1420; color:#d7e0ea; height:100%; font-family: ui-monospace, Consolas, monospace; font-size:13px; line-height:1.5; }
:deep(.CodeMirror-gutters) { background:#0d1420; border-right:1px solid #1e2a3d; }
:deep(.CodeMirror-cursor) { border-left:2px solid #9fc3ff; }
:deep(.CodeMirror-selected) { background:#24405f; }
:deep(.cm-keyword){color:#c792ea} :deep(.cm-number){color:#f78c6c} :deep(.cm-string){color:#a5d6a7} :deep(.cm-comment){color:#5c7292;font-style:italic} :deep(.cm-def){color:#82aaff} :deep(.cm-variable){color:#d7e0ea} :deep(.cm-property){color:#80cbc4} :deep(.cm-atom){color:#f78c6c} :deep(.cm-operator){color:#89ddff}
</style>
