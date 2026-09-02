<template>
  <section class="phys-lab">
    <!-- 标题行 -->
    <header class="pl-head">
      <span class="pl-title">{{ title }}</span>
      <span class="pl-sub">2D 刚体物理沙盒 · 在编辑器里实现 / 改进 collide 与 resolve</span>
    </header>

    <!-- 工具条：滑条实时调参 + 操作按钮 -->
    <div class="pl-toolbar">
      <label class="pl-ctl">
        <span class="pl-ctl-name">重力</span>
        <input type="range" min="0" max="2000" step="10" :value="gravity" @input="gravity = Number($event.target.value)" />
        <span class="pl-ctl-val">{{ gravity }}</span>
      </label>
      <label class="pl-ctl">
        <span class="pl-ctl-name">反弹</span>
        <input type="range" min="0" max="1" step="0.05" :value="restitution" @input="restitution = Number($event.target.value)" />
        <span class="pl-ctl-val">{{ restitution.toFixed(2) }}</span>
      </label>
      <label class="pl-ctl">
        <span class="pl-ctl-name">子步</span>
        <input type="range" min="1" max="8" step="1" :value="substeps" @input="substeps = Number($event.target.value)" />
        <span class="pl-ctl-val">{{ substeps }}</span>
      </label>

      <span class="pl-spring" aria-hidden="true"></span>

      <button class="pl-btn" type="button" @click="toggleRun">{{ running ? '⏸ 暂停' : '▶ 继续' }}</button>
      <button class="pl-btn" type="button" @click="stepOnce">单步</button>
      <button class="pl-btn" type="button" @click="spawnTop">🎲 生成 20 球</button>
      <button class="pl-btn" type="button" @click="clearBalls">🗑 清空</button>
      <button class="pl-btn pl-btn-primary" type="button" @click="reloadCode">▶ 重载代码</button>
      <button class="pl-btn" type="button" @click="resetCode">↺ 重置</button>
      <button class="pl-btn" type="button" @click="saveCode">💾 保存</button>
    </div>

    <!-- 主体：左编辑器 + 右画布（窄屏自动换行） -->
    <div class="pl-main">
      <div ref="editorHost" class="pl-editor" :style="{ height: height + 'px' }"></div>
      <div class="pl-stage">
        <canvas ref="canvasEl" class="pl-canvas" width="720" height="440"></canvas>
        <div class="pl-hud">
          <span>fps <b>{{ fps }}</b></span>
          <span>球数 <b>{{ ballCount }}</b></span>
          <span>本帧接触对数 <b>{{ contacts }}</b></span>
        </div>
      </div>
    </div>

    <!-- 错误面板：编译 / 执行 / 帧回调错误都显示在这里 -->
    <div v-if="errorMsg" class="pl-error">
      <span class="pl-error-tag">⚠ 错误</span>
      <pre class="pl-error-msg">{{ errorMsg }}</pre>
      <button class="pl-error-close" type="button" title="关闭错误提示" @click="errorMsg = ''">✕</button>
    </div>

    <!-- 底部 API 说明 -->
    <details class="pl-api">
      <summary>physics API 说明</summary>
      <div class="pl-api-body">
        <p><code>physics.run({ collide, resolve })</code>：注册你实现的两个函数，两者必填。</p>
        <p>球体对象：<code>{ x, y, vx, vy, r, m }</code> —— 位置、速度、半径、质量（质量 ∝ r²，由运行器生成）。</p>
        <p><code>collide(a, b)</code>：返回 <code>null</code> 或 <code>{ nx, ny, depth }</code>。nx / ny 是从 a 指向 b 的单位法线，depth 是穿透深度（两球半径之和减去圆心距）。</p>
        <p><code>resolve(a, b, hit, params)</code>：直接改写 a / b 的位置与速度完成响应。hit 是 collide 的返回值；<code>params = { gravity, restitution, substeps }</code> 是上方滑条的实时值。</p>
        <p>运行器已内置：固定步长 1/60 秒 + 累积器（帧 dt 钳制 0.1 秒），每个固定步细分为 substeps 个子步；四壁按 restitution 反弹并夹回边界；渲染与 fps 统计。</p>
        <p>提示：先做按质量反比的位置分离，再施加法向冲量；只在两球相互靠近时施加冲量，否则会粘连或能量爆炸。</p>
      </div>
    </details>

    <!-- 轻提示 -->
    <transition name="pl-fade">
      <div v-if="toast" class="pl-toast">{{ toast }}</div>
    </transition>
  </section>
</template>

<script setup>
// ---------------------------------------------------------------
// PhysicsLab · 2D 刚体物理沙盒
// 运行器内置：固定步长积分、四壁反弹、渲染与 fps 统计；
// 学员在左侧编辑器里实现 / 改进 collide（碰撞检测）与 resolve（冲量响应）。
// 注意：本组件可能同页多实例，所有可变状态都是实例级，模块级只放常量。
// ---------------------------------------------------------------
import { ref, onMounted, onUnmounted } from 'vue';
import CodeMirror from 'codemirror';
import 'codemirror/lib/codemirror.css';
import 'codemirror/mode/javascript/javascript.js';

// ===== 模块级常量（只读，不放可变状态，保证多实例互不影响）=====
// 画布逻辑尺寸（像素）
const VIEW_W = 720;
const VIEW_H = 440;
// 固定物理步长：1/60 秒
const FIXED_H = 1 / 60;
// localStorage 键前缀
const STORAGE_PREFIX = 'ged-lab:';

// 内置参考实现：props.code 为空时作为编辑器初始代码（父组件也可直接传入同等内容）。
// 本身可运行：圆-圆检测 + 位置修正 + 冲量法。
const DEFAULT_CODE = `// ============================================================
// 2D 刚体物理沙盒 · 参考实现，试着改进它！
// 运行器已内置：重力积分、四壁反弹、固定步长与子步细分、渲染。
// 你要实现 / 改进的是下面两个函数：
//   collide(a, b)  -> null 或 { nx, ny, depth }
//       nx / ny：从 a 指向 b 的单位法线；depth：穿透深度
//   resolve(a, b, hit, params) -> 直接改写 a/b 的位置与速度
// 球体字段：x, y, vx, vy, r（半径）, m（质量）
// params：{ gravity, restitution, substeps }，来自上方滑条，实时生效
// ============================================================

// 圆-圆碰撞检测
function collide(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const rSum = a.r + b.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rSum * rSum) return null; // 圆心距不小于半径和：未接触
  const d = Math.sqrt(d2);
  if (d < 0.0001) {
    // 两球几乎完全重合：任取一个法线，避免除零
    return { nx: 0, ny: -1, depth: rSum };
  }
  return { nx: dx / d, ny: dy / d, depth: rSum - d };
}

// 冲量响应：先位置分离，再法向冲量
function resolve(a, b, hit, params) {
  const nx = hit.nx;
  const ny = hit.ny;

  // 1) 位置修正：按质量反比分配 0.8 * depth 的分离量
  //    （只推开 80%，留一点穿透可显著减少堆叠抖动；越轻挪得越多）
  const totalM = a.m + b.m;
  const corr = 0.8 * hit.depth;
  a.x -= nx * corr * (b.m / totalM);
  a.y -= ny * corr * (b.m / totalM);
  b.x += nx * corr * (a.m / totalM);
  b.y += ny * corr * (a.m / totalM);

  // 2) 法向冲量：velN > 0 表示两球正在相互靠近，才需要响应
  const velN = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (velN > 0) {
    // 冲量大小：j = -(1+e) * velN / (1/ma + 1/mb)
    const j = (-(1 + params.restitution) * velN) / (1 / a.m + 1 / b.m);
    // 沿法线分配：a 沿 -n 方向弹开，b 沿 +n 方向弹开
    a.vx += (j * nx) / a.m;
    a.vy += (j * ny) / a.m;
    b.vx -= (j * nx) / b.m;
    b.vy -= (j * ny) / b.m;
  }
}

physics.run({ collide, resolve });
`;

// ===== Props =====
const props = defineProps({
  // 用户物理脚本（内容为调用 physics.run({ collide, resolve }) 的代码）
  code: { type: String, required: true },
  title: { type: String, default: '物理沙盒' },
  // localStorage 存档键：实际 key 为 'ged-lab:' + persistKey
  persistKey: { type: String, required: true },
  // 编辑器区域高度（像素）
  height: { type: Number, default: 460 },
});

// ===== 响应式 UI 状态（每个实例独立）=====
const gravity = ref(900);     // 重力加速度 0~2000
const restitution = ref(0.8); // 反弹系数 0~1
const substeps = ref(2);      // 每个固定步的细分次数 1~8
const running = ref(false);   // 是否运行中
const fps = ref(0);
const ballCount = ref(0);
const contacts = ref(0);      // 本帧接触对数（取所有子步的最大值）
const errorMsg = ref('');     // 错误面板内容（空串表示隐藏）
const toast = ref('');        // 轻提示内容

const editorHost = ref(null);
const canvasEl = ref(null);

// ===== 实例内部可变状态（非响应式，物理循环专用）=====
let cm = null;           // CodeMirror 实例
let ctx = null;          // 2D 画布上下文
let balls = [];          // 球体数组 { x, y, vx, vy, r, m }
let contactPairs = [];   // 本帧接触对 [{ i, j }]，渲染橙色连线用
let collideFn = null;    // 用户实现的 collide(a, b)
let resolveFn = null;    // 用户实现的 resolve(a, b, hit, params)
let rafId = 0;           // requestAnimationFrame 句柄
let lastTime = 0;        // 上一帧时间戳
let acc = 0;             // 固定步长累积器
let fpsFrames = 0;       // fps 统计：窗口内帧数
let fpsTime = 0;         // fps 统计：窗口内累计时间
let toastTimer = 0;      // 轻提示定时器

// ===== 小工具 =====

// 基准代码：props.code 优先，为空时退回内置参考实现
function baseCode() {
  return typeof props.code === 'string' && props.code.length > 0 ? props.code : DEFAULT_CODE;
}

// 显示错误面板
function showError(err) {
  errorMsg.value = err instanceof Error ? err.name + ': ' + err.message : String(err);
}

// 轻提示，1.8 秒后自动消失
function showToast(msg) {
  toast.value = msg;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = '';
    toastTimer = 0;
  }, 1800);
}

// ===== 用户代码编译 =====

// 用 new Function 在严格模式下执行用户脚本，取出 collide / resolve。
// 编译或执行阶段的任何错误都会向上抛出，由调用方显示到错误面板。
function compileUserCode(src) {
  let nextCollide = null;
  let nextResolve = null;
  const factory = new Function('physics', '"use strict";\n' + src);
  factory({
    run(handlers) {
      if (!handlers || typeof handlers.collide !== 'function' || typeof handlers.resolve !== 'function') {
        throw new Error('physics.run({ collide, resolve })：collide 与 resolve 两个函数必填');
      }
      nextCollide = handlers.collide;
      nextResolve = handlers.resolve;
    },
  });
  if (typeof nextCollide !== 'function' || typeof nextResolve !== 'function') {
    throw new Error('必须调用 physics.run({ collide, resolve }) 注册两个函数');
  }
  return { collide: nextCollide, resolve: nextResolve };
}

// ===== 世界管理 =====

// 生成 count 个随机球：半径 12~22，质量 ∝ r²；fromTop 时集中在顶部（下落演示用）
function spawnBalls(count, fromTop) {
  for (let k = 0; k < count; k++) {
    const r = 12 + Math.random() * 10;
    const x = r + Math.random() * (VIEW_W - 2 * r);
    const y = fromTop ? r + Math.random() * 60 : r + Math.random() * (VIEW_H - 2 * r);
    balls.push({
      x: x,
      y: y,
      vx: (Math.random() * 2 - 1) * 150,
      vy: (Math.random() * 2 - 1) * 80,
      r: r,
      m: r * r,
    });
  }
  ballCount.value = balls.length;
}

// 重建世界：重新生成 18 个随机球并重置累积器（滑条值保留）
function rebuildWorld() {
  balls = [];
  contactPairs = [];
  acc = 0;
  contacts.value = 0;
  spawnBalls(18, false);
  if (!running.value) draw();
}

// ===== 物理循环 =====

// 执行一个固定步（h = 1/60），内部按滑条值细分为 substeps 个子步。
// 每个子步：① 重力 + 位置积分 → ② 四壁碰撞 → ③ 双重循环 i<j 做球-球碰撞。
// 返回该固定步中单个子步的最大接触对数；用户代码抛错会向上传播。
function fixedStep() {
  const sub = Math.min(8, Math.max(1, Math.round(Number(substeps.value) || 1)));
  const h = FIXED_H / sub; // 子步步长
  const g = Number(gravity.value) || 0;
  const e = Math.min(1, Math.max(0, Number(restitution.value) || 0));
  const params = { gravity: g, restitution: e, substeps: sub };
  let maxContacts = 0;

  for (let s = 0; s < sub; s++) {
    let contactsInSub = 0;

    // ① 每球 vy += gravity * h 并做位置积分
    for (let k = 0; k < balls.length; k++) {
      const b = balls[k];
      b.vy += g * h;
      b.x += b.vx * h;
      b.y += b.vy * h;
    }

    // ② 四壁碰撞：按 restitution 反弹并夹回边界
    for (let k = 0; k < balls.length; k++) {
      const b = balls[k];
      if (b.x < b.r) { b.x = b.r; if (b.vx < 0) b.vx = -b.vx * e; }
      else if (b.x > VIEW_W - b.r) { b.x = VIEW_W - b.r; if (b.vx > 0) b.vx = -b.vx * e; }
      if (b.y < b.r) { b.y = b.r; if (b.vy < 0) b.vy = -b.vy * e; }
      else if (b.y > VIEW_H - b.r) { b.y = VIEW_H - b.r; if (b.vy > 0) b.vy = -b.vy * e; }
    }

    // ③ 球-球：双重循环 i < j，collide 命中则调用 resolve，并记录接触对
    if (collideFn && resolveFn) {
      for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) {
          const a = balls[i];
          const b = balls[j];
          const hit = collideFn(a, b);
          if (hit) {
            // 返回值形状校验：帮助学员尽早发现字段拼写错误
            if (typeof hit.nx !== 'number' || typeof hit.ny !== 'number' || typeof hit.depth !== 'number') {
              throw new Error('collide 命中时必须返回 { nx, ny, depth }（均为数字）');
            }
            resolveFn(a, b, hit, params);
            contactsInSub++;
            contactPairs.push({ i: i, j: j });
          }
        }
      }
    }

    if (contactsInSub > maxContacts) maxContacts = contactsInSub;
  }
  return maxContacts;
}

// 渲染：清屏 → 接触对半透明橙线 → 球体（按 index 取 hsl 色相）
function draw() {
  if (!ctx) return;
  ctx.fillStyle = '#0b0f17';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  if (contactPairs.length > 0) {
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.25)'; // #f59e0b @ alpha 0.25
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let k = 0; k < contactPairs.length; k++) {
      const pa = balls[contactPairs[k].i];
      const pb = balls[contactPairs[k].j];
      if (!pa || !pb) continue;
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
    }
    ctx.stroke();
  }

  for (let k = 0; k < balls.length; k++) {
    const b = balls[k];
    const hue = (k * 47) % 360;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fillStyle = 'hsl(' + hue + ', 65%, 60%)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'hsl(' + hue + ', 60%, 38%)';
    ctx.stroke();
  }
}

// 帧回调：累积器驱动固定步 + 渲染 + fps 统计；任何异常都会停止循环并显示错误面板
function frame(now) {
  if (!running.value) { rafId = 0; return; }
  rafId = requestAnimationFrame(frame); // 先排队下一帧，出错时可统一取消
  try {
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.1) dt = 0.1; // 帧间隔钳制，防止切后台回来后补帧风暴
    acc += dt;

    // fps：每 0.5 秒统计一次窗口平均值
    fpsFrames++;
    fpsTime += dt;
    if (fpsTime >= 0.5) {
      fps.value = Math.round(fpsFrames / fpsTime);
      fpsFrames = 0;
      fpsTime = 0;
    }

    // 执行本帧所有到期的固定步，接触对取全帧最大值
    contactPairs = [];
    let frameMax = 0;
    while (acc >= FIXED_H) {
      const c = fixedStep();
      if (c > frameMax) frameMax = c;
      acc -= FIXED_H;
    }
    contacts.value = frameMax;

    draw();
  } catch (err) {
    // 出错停止循环，绝不让异常逃逸到全局
    pauseLoop();
    showError(err);
  }
}

function startLoop() {
  if (running.value) return;
  running.value = true;
  lastTime = performance.now();
  rafId = requestAnimationFrame(frame);
}

function pauseLoop() {
  running.value = false;
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
}

// ===== 工具条行为 =====

// ⏸ 暂停 / ▶ 继续
function toggleRun() {
  if (running.value) pauseLoop();
  else startLoop();
}

// 单步：暂停态下执行一个固定步（含全部子步）并渲染
function stepOnce() {
  if (running.value) pauseLoop();
  try {
    contactPairs = [];
    contacts.value = fixedStep();
    draw();
  } catch (err) {
    showError(err);
  }
}

// 🎲 在顶部随机生成 20 球
function spawnTop() {
  spawnBalls(20, true);
  if (!running.value) draw();
}

// 🗑 清空所有球
function clearBalls() {
  balls = [];
  contactPairs = [];
  ballCount.value = 0;
  contacts.value = 0;
  if (!running.value) draw();
}

// ▶ 重载代码：重新编译执行编辑器当前代码并重建世界（滑条值保留）。
// 解析 / 执行失败时保留旧世界与旧函数，把错误显示到错误面板。
function reloadCode() {
  if (!cm) return;
  try {
    const fns = compileUserCode(cm.getValue());
    collideFn = fns.collide;
    resolveFn = fns.resolve;
    errorMsg.value = '';
    rebuildWorld();
  } catch (err) {
    showError(err);
  }
}

// ↺ 重置：恢复 props.code 并重载
function resetCode() {
  if (!cm) return;
  cm.setValue(baseCode());
  reloadCode();
}

// 💾 保存当前编辑器代码到 localStorage（读写均 try/catch）
function saveCode() {
  if (!cm) return;
  try {
    localStorage.setItem(STORAGE_PREFIX + props.persistKey, cm.getValue());
    showToast('已保存');
  } catch (err) {
    showToast('保存失败：' + (err && err.message ? err.message : String(err)));
  }
}

// ===== 生命周期 =====

onMounted(() => {
  // 初始代码：props.code 优先，为空则用内置参考实现
  let initial = baseCode();
  // localStorage 存档优先：有则替换代码
  try {
    const saved = localStorage.getItem(STORAGE_PREFIX + props.persistKey);
    if (typeof saved === 'string') initial = saved;
  } catch (err) {
    // 读取失败（隐私模式等）时忽略，使用默认代码
  }

  // 创建 CodeMirror 编辑器（不设 theme，配色由 scoped :deep 覆盖）
  cm = CodeMirror(editorHost.value, {
    value: initial,
    mode: 'javascript',
    lineNumbers: true,
    indentUnit: 2,
    tabSize: 2,
    extraKeys: {
      'Ctrl-Enter': reloadCode, // 等价 ▶ 重载代码
      'Cmd-Enter': reloadCode,
    },
  });

  // 初始化画布上下文
  const canvas = canvasEl.value;
  ctx = canvas ? canvas.getContext('2d') : null;

  // 编译用户代码：失败也照常生成球体（以“仅墙壁”模式运行）并显示错误
  try {
    const fns = compileUserCode(cm.getValue());
    collideFn = fns.collide;
    resolveFn = fns.resolve;
  } catch (err) {
    showError(err);
  }

  // 生成 18 个随机球并自动运行
  rebuildWorld();
  startLoop();
});

onUnmounted(() => {
  // 停止帧循环（cancelAnimationFrame）
  pauseLoop();
  // 清理轻提示定时器（本组件未添加 window 级监听，无需移除）
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = 0;
  }
  // 释放引用，帮助垃圾回收
  cm = null;
  ctx = null;
  balls = [];
  contactPairs = [];
  collideFn = null;
  resolveFn = null;
});
</script>

<style scoped>
.phys-lab {
  position: relative;
  background: #111a2a;
  border: 1px solid #1e2a3d;
  border-radius: 10px;
  padding: 12px 14px 14px;
  color: #d7e0ea;
  font-size: 13px;
  line-height: 1.5;
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
.phys-lab,
.phys-lab *,
.phys-lab *::before,
.phys-lab *::after {
  box-sizing: border-box;
}

/* 标题行 */
.pl-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
}
.pl-title {
  font-size: 15px;
  font-weight: 600;
}
.pl-sub {
  font-size: 12px;
  color: #7d93b3;
}

/* 工具条 */
.pl-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  margin-top: 8px;
  padding: 8px 0 10px;
  border-bottom: 1px solid #1e2a3d;
}
.pl-ctl {
  display: flex;
  align-items: center;
  gap: 6px;
}
.pl-ctl-name {
  font-size: 12px;
  color: #7d93b3;
  white-space: nowrap;
}
.pl-ctl input[type='range'] {
  width: 110px;
  accent-color: #4d8fd6;
  cursor: pointer;
}
.pl-ctl-val {
  min-width: 46px;
  text-align: right;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
  color: #d7e0ea;
}
.pl-spring {
  flex: 1 1 0;
  min-width: 0;
}

.pl-btn {
  padding: 5px 11px;
  background: #16223a;
  border: 1px solid #1e2a3d;
  border-radius: 8px;
  color: #d7e0ea;
  font-size: 12.5px;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, border-color 0.15s;
}
.pl-btn:hover {
  background: #1b2a47;
  border-color: #4d8fd6;
}
.pl-btn:active {
  transform: translateY(1px);
}
.pl-btn-primary {
  background: #4d8fd6;
  border-color: #4d8fd6;
  color: #0b0f17;
  font-weight: 600;
}
.pl-btn-primary:hover {
  background: #63a1e0;
  border-color: #63a1e0;
}

/* 主体：左编辑器 + 右画布，窄屏自动换行 */
.pl-main {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 12px;
  margin-top: 10px;
}
.pl-editor {
  flex: 1 1 360px;
  min-width: 320px;
  border: 1px solid #1e2a3d;
  border-radius: 8px;
  overflow: hidden;
}
.pl-stage {
  flex: 1 1 430px;
  min-width: 340px;
  align-self: stretch;
  display: flex;
  flex-direction: column;
}
.pl-canvas {
  width: 100%;
  height: auto;
  display: block;
  background: #0b0f17;
  border: 1px solid #1e2a3d;
  border-radius: 8px;
}
.pl-hud {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  padding: 8px 2px 0;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
  color: #7d93b3;
}
.pl-hud b {
  color: #d7e0ea;
  font-weight: 600;
}

/* 错误面板 */
.pl-error {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 10px;
  padding: 8px 10px;
  background: rgba(248, 113, 113, 0.08);
  border: 1px solid rgba(248, 113, 113, 0.45);
  border-radius: 8px;
}
.pl-error-tag {
  flex: none;
  padding-top: 1px;
  font-size: 12px;
  font-weight: 600;
  color: #f87171;
}
.pl-error-msg {
  flex: 1;
  margin: 0;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
  color: #f87171;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 150px;
  overflow: auto;
}
.pl-error-close {
  flex: none;
  padding: 0 4px;
  background: none;
  border: none;
  color: #7d93b3;
  font-size: 13px;
  cursor: pointer;
}
.pl-error-close:hover {
  color: #f87171;
}

/* 底部 API 说明 */
.pl-api {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid #1e2a3d;
}
.pl-api summary {
  cursor: pointer;
  user-select: none;
  font-size: 12.5px;
  color: #4d8fd6;
}
.pl-api-body {
  margin-top: 6px;
  font-size: 12.5px;
  line-height: 1.8;
  color: #7d93b3;
}
.pl-api-body p {
  margin: 0 0 4px;
}
.pl-api-body code {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 11.5px;
  color: #d7e0ea;
  background: #0d1420;
  border: 1px solid #1e2a3d;
  border-radius: 4px;
  padding: 1px 5px;
}

/* 轻提示 */
.pl-toast {
  position: absolute;
  right: 16px;
  bottom: 16px;
  padding: 6px 14px;
  background: #16223a;
  border: 1px solid #34d399;
  border-radius: 8px;
  color: #34d399;
  font-size: 12.5px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
  pointer-events: none;
}
.pl-fade-enter-active,
.pl-fade-leave-active {
  transition: opacity 0.25s ease;
}
.pl-fade-enter-from,
.pl-fade-leave-to {
  opacity: 0;
}

/* CodeMirror 深度覆盖（未引入主题 css，手动配色） */
:deep(.CodeMirror) { background:#0d1420; color:#d7e0ea; height:100%; font-family: ui-monospace, Consolas, monospace; font-size:13px; line-height:1.5; }
:deep(.CodeMirror-gutters) { background:#0d1420; border-right:1px solid #1e2a3d; }
:deep(.CodeMirror-cursor) { border-left:2px solid #9fc3ff; }
:deep(.CodeMirror-selected) { background:#24405f; }
:deep(.cm-keyword){color:#c792ea}
:deep(.cm-number){color:#f78c6c}
:deep(.cm-string){color:#a5d6a7}
:deep(.cm-comment){color:#5c7292;font-style:italic}
:deep(.cm-def){color:#82aaff}
:deep(.cm-variable){color:#d7e0ea}
:deep(.cm-property){color:#80cbc4}
:deep(.cm-atom){color:#f78c6c}
:deep(.cm-operator){color:#89ddff}
:deep(.CodeMirror-linenumber) { color: #3d5273; }
</style>
