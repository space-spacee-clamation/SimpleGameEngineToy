// L7.2 · 动画系统：骨骼、蒙皮与状态机
export default {
  id: 'L7.2',
  title: '动画系统：骨骼、蒙皮与状态机',
  est: '2.5 小时',
  coreQuestions: [
    '一条动画在内存里到底是什么？轨道、关键帧、插值器各存了什么，所有权归谁？',
    '一帧之内，数据怎样从 Animation 资源流到骨骼变换上？混合权重是每帧现算还是缓存的？',
    '混合树解决什么问题——为什么两套姿态不能靠 if-else 硬切？',
    '过渡期间同时存在多套采样结果，最终的「那一帧姿态」由谁拍板写回节点？'
  ],
  sections: [
    {
      type: 'text',
      title: '动画数据长什么样：轨道 × 关键帧 × 插值器',
      html: `<p>先破除一个错觉：<b>引擎里没有「一段动画」，只有一堆数字。</b>打开任意 .tscn / .tres，动画是一行行 <code>[keyframes]</code> 文本；装进内存后，Godot 给它一个类叫 <code>Animation</code>——注意它继承的是 <b>Resource</b>（scene/resources/animation.h），不是 Node。这意味着动画资产<b>不属于任何角色</b>：十个怪物可以共享同一份 walk 资源，改一份处处生效。这正是 L6.1 要讲的资源观，这里先用起来。</p>
<p>一条 <code>Animation</code> = N 条<b>轨道（Track）</b>；每条轨道 = 目标路径（NodePath + 属性名）+ 一串<b>关键帧（KeyValue）</b> + 一种<b>插值方式</b>。关键帧只有两样东西：时间 t 和值 v；两个关键帧之间的值不存在——它是播放时<b>现场算</b>出来的。Godot 4 的枚举把这件事写得明明白白：</p>
<table>
  <tr><th>轨道类型 TrackType</th><th>驱动什么</th><th>典型用途</th></tr>
  <tr><td>VALUE</td><td>任意 Variant 属性</td><td>透明度、颜色、自定义数值</td></tr>
  <tr><td>TRANSFORM_3D / POSITION_3D / ROTATION_3D / SCALE_3D</td><td>空间变换拆成独立轨道</td><td>骨骼旋转、位移</td></tr>
  <tr><td>BLEND_SHAPE</td><td>网格变形系数</td><td>表情、口型</td></tr>
  <tr><td>METHOD / AUDIO / ANIMATION</td><td>到点触发的事件</td><td>脚步声、打击判定帧</td></tr>
</table>
<p>插值方式同样是一个小枚举：<code>INTERPOLATION_NONE / LINEAR / CUBIC / LINEAR_ANGLE / CUBIC_ANGLE</code>。角度为什么要单独的 _ANGLE 档？因为普通线性插值对 -170°→170° 会傻乎乎地扫过 340°，而角度插值走最短的 20°——这是 L3.1「旋转不能用朴素欧拉角」的余震：只要表示里带「绕一圈回到原点」的拓扑，插值就必须知道自己是插在圆上。贝塞尔缓动则记在每个关键帧自带的 in/out 曲率上，曲线本体在 scene/animation/easing_equations.h（Robert Penner 那套经典方程）。</p>
<p>所以「动画 = 数据」的完整展开是：<b>轨道数组 + 关键帧数组 + 纯函数插值器</b>。没有状态，没有副作用——播放头推进多少、取到什么值，全由外部时钟决定。把这个想清楚，下面的流水线就是水到渠成。</p>`
    },
    {
      type: 'text',
      title: '每帧三件事：采样 → 混合 → 写回',
      html: `<p>动画系统每一帧的工作可以压缩成一行公式：<b>pose = mix( sample(track, time), weights )</b>，然后 <code>node.set(property, pose)</code>。拆开看是一条清晰的单向数据流：</p>
<pre>Animation 资源（不可变数据，被多方共享）
   │  ① 采样：按播放头时间在两枚关键帧之间插值
   ▼
PlaybackInfo（一次采样的输出包：值 + 权重）
   │  ② 混合：多个来源按权重加权平均
   ▼
最终姿态（每个属性一个确定值）
   │  ③ 写回：Object::set 打到目标节点
   ▼
Skeleton 骨骼变换 ──► 渲染端蒙皮 ──► 这一帧的画面</pre>
<p>三个角色分工要背下来。<b>AnimationPlayer 是生产者</b>：持有播放头，每帧推进时间、查表插值，产出一套「值 + 权重」。它继承自 <b>AnimationMixer</b>——后者才是干活的基类，负责累积所有输入并统一写回。<b>AnimationTree 是调度者</b>：它不产生新动画，而是把若干 PlaybackInfo 组织成一棵<b>混合树</b>递归求值。<b>骨骼节点是消费者</b>：它根本不知道动画的存在，只是属性被人 set 了而已。生产者和消费者互不认识，中间全靠 Mixer 这张「待写回账本」衔接——这就是本课的数据流主线。</p>
<p><b>混合树解决什么？</b>最朴素的方案是 if-else：当前状态是 Walk 就播 Walk。但游戏需要的是「速度 3.2 m/s 时，idle 占 10%、walk 占 90%，并且重心随步频起伏」这类<b>连续、可叠加</b>的姿态。if-else 只能表达离散切换，权重却需要同时评估多个分支再加权。于是 Godot 把「怎么混」做成了一棵数据驱动的树：叶子是 Animation 节点，中间是 blend2 / Add / OneShot / TimeScale 等组合节点，根节点输出唯一一套混合结果。状态机（AnimationNodeStateMachine）也只是树上的一种特殊节点——它的每条边带着过渡时长和条件，过渡期间做的事依然只有一件：<b>给新旧两个状态各算一个权重，交给 blend 逻辑</b>。换句话说，状态机的「过渡」和混合空间的「连续映射」，在底层是同一行加权平均。</p>
<p>时机上，这一切发生在主循环的固定阶段：Godot 4 里 AnimationMixer 通过内部处理通知调用 <code>_process_animation(delta)</code>，默认排在物理 tick 之后、场景 _process 附近，且可由 callback_mode 调到物理帧——和 L1.1 说的一样，动画也是「多时钟编舞」中的一员。下一节实验台，我们把这条流水线画出来跑。</p>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'boneanim',
      title: '实验：2D 骨骼动画 × 混合树实验台',
      height: 560,
      code: `// 左半屏：动画数据的解剖 —— 一条角度轨道 + 关键帧 + 插值器
//   Space 播放/暂停 · ,/. 播放头 ±0.08s · T 切换线性/缓动 · R 重置
// 右半屏：状态机 Idle/Walk/Jump + 2D 混合空间（速度 x/y → 四步态权重）
//   方向键 ←→ 走起来 · ↑ 跳一下 · ↓ 停下 · Tab 换面板 · [ ] 调过渡秒数
// 中间骨架永远只画「混合后的最终姿态」——它就是这条流水线的输出

var DEG = Math.PI / 180;

engine.run({
  setup: function (state) {
    state.time = 0.4;            // 左侧演示轨道的播放头
    state.playing = true;
    state.easeOn = false;          // 插值器开关：false=线性 true=缓动
    state.mode = 0;                // 右侧面板：0 状态机 / 1 混合空间
    state.transT = 0.3;            // 过渡时长（秒），[ ] 可调
    state.t = 0;                   // 全局时间
    state.msg = ''; state.msgT = 0;

    // ---- 左侧演示轨道：一条角度轨道，4 枚关键帧 ----
    state.track = {
      name: 'arm.rotation',
      keys: [ { t: 0.0, v: -30 }, { t: 0.4, v: 50 }, { t: 0.8, v: -30 }, { t: 1.2, v: 50 } ],
      loop: 1.2
    };

    // ---- 右侧动画库：每条动画 = 一组关节的正弦参数 ----
    // amp=振幅(deg) freq=频率(hz) ph=相位 offset=中位(deg)
    var A = {
      idle: { label: 'Idle', color: '#5aa9e6', j: { bodyY: [3, 0.5, 0, 0], lean: [2, 0.5, 1.0, 4], lA: [6, 0.5, 0.2, -12], rA: [6, 0.5, 3.4, 12] } },
      walkL: { label: 'Walk←', color: '#f59e0b', j: { bodyY: [7, 2.0, 0, 0], lean: [3, 2.0, 1.5, -6], lA: [34, 2.0, 0.0, 0], rA: [34, 2.0, 3.14, 0] } },
      walkR: { label: 'Walk→', color: '#34d399', j: { bodyY: [7, 2.0, 0, 0], lean: [3, 2.0, 1.5, 6], lA: [34, 2.0, 3.14, 0], rA: [34, 2.0, 0.0, 0] } },
      jump:  { label: 'Jump', color: '#f472b6', j: { bodyY: [0, 0, 0, 0], lean: [0, 0, 0, 10], lA: [0, 0, 0, -150], rA: [0, 0, 0, 150] } }
    };
    state.A = A;

    // 关节清单：混合时逐关节做加权平均（真实引擎对骨骼做的是同样的事）
    state.joints = ['bodyY', 'lean', 'lA', 'rA'];

    // ---- 混合树运行时：每个激活源一个槽位 ----
    state.slots = [];              // { anim, pos, rate, weight, target, fading, fadeT, fadeDur, fadeFrom, oneShot, dead }
    addSlot(state, A.idle, 0, 1);  // 初始：Idle 满权重
  },

  update: function (state, dt, input) {
    var i;
    state.t += dt;
    if (state.msgT > 0) state.msgT -= dt;

    // ---------- 左：播放头推进 ----------
    if (input.pressed('Space')) { state.playing = !state.playing; say(state, state.playing ? '播放头推进：每帧时间 += dt' : '暂停：数据静止，随时可 seek'); }
    if (input.pressed('KeyT')) { state.easeOn = !state.easeOn; say(state, state.easeOn ? '插值器 = smoothstep（缓动）' : '插值器 = linear（线性）'); }
    if (input.pressed('KeyR')) { state.time = 0; say(state, 'seek 到 0：播放头可以直接设值，不必快进'); }
    if (input.pressed('Comma')) state.time -= 0.08;
    if (input.pressed('Period')) state.time += 0.08;
    if (state.playing) {
      state.time += dt;
      if (state.time >= state.track.loop) state.time -= state.track.loop;
      if (state.time < 0) state.time += state.track.loop;
    }

    // ---------- 右：玩法层（输入 → 意图）----------
    var vx = 0;
    if (input.down('ArrowLeft')) vx -= 1;
    if (input.down('ArrowRight')) vx += 1;
    var wantJump = input.pressed('ArrowUp');
    var wantStop = input.down('ArrowDown');
    if (input.pressed('Tab')) { state.mode = 1 - state.mode; say(state, state.mode === 0 ? '面板：状态机（离散切换 + 过渡混合）' : '面板：混合空间（连续速度 → 四权重）'); }
    if (input.pressed('BracketLeft')) { state.transT = Math.max(0.05, state.transT - 0.05); say(state, '过渡时长 = ' + state.transT.toFixed(2) + 's'); }
    if (input.pressed('BracketRight')) { state.transT = Math.min(1.2, state.transT + 0.05); say(state, '过渡时长 = ' + state.transT.toFixed(2) + 's'); }

    var speed = Math.abs(vx);

    if (state.mode === 0) {
      // ===== 状态机模式：travel 请求 → 找合法转移 → 起过渡 =====
      var cur = null;
      for (i = 0; i < state.slots.length; i++) {
        var s = state.slots[i];
        if (!s.oneShot && s.target === 1 && !s.fading) cur = s.anim.label;
      }
      if (cur === null) cur = 'Idle';
      var next = cur;
      if (wantJump) next = 'Jump';
      else if (vx !== 0) next = vx > 0 ? 'Walk→' : 'Walk←';
      else if (wantStop || cur.indexOf('Walk') === 0) next = 'Idle';
      travelTo(state, cur, next);
    } else {
      // ===== 混合空间模式：速度向量 → 四个角落的双线性权重 =====
      var tx = vx * 0.5 + 0.5, ty = speed * 0.5 + 0.5;
      tx = clamp(tx, 0, 1); ty = clamp(ty, 0, 1);
      syncBlend(state, state.A.idle, (1 - tx) * (1 - ty));
      syncBlend(state, state.A.walkL, tx * (1 - ty));
      syncBlend(state, state.A.walkR, (1 - tx) * ty);
      syncBlend(state, state.A.jump, tx * ty);
      if (wantJump) fireOneShot(state, state.A.jump, 0.6);
    }

    // ---------- 推进所有槽位（过渡计时 + 播放头 + 一次性回收）----------
    for (i = 0; i < state.slots.length; i++) {
      var sl = state.slots[i];
      if (sl.fading) {
        sl.fadeT += dt;
        var k = clamp(sl.fadeT / Math.max(0.0001, sl.fadeDur), 0, 1);
        sl.weight = sl.fadeFrom + (sl.target - sl.fadeFrom) * k;
        if (k >= 1) { sl.fading = false; sl.weight = sl.target; }
      }
      if (sl.weight > 0.0001) sl.pos += dt * sl.rate;
      if (sl.oneShot) {
        sl.hold -= dt;
        if (sl.hold <= 0 && sl.target !== 0) startFade(sl, 0, state.transT);
        if (!sl.fading && sl.target === 0 && sl.weight <= 0.0001) sl.dead = true;
      }
    }
    state.slots = state.slots.filter(function (x) { return !x.dead; });

    // ---------- 混合：逐关节 Σ(w·v)，写回 state.pose ----------
    var pose = {};
    for (i = 0; i < state.joints.length; i++) pose[state.joints[i]] = 0;
    for (i = 0; i < state.slots.length; i++) {
      var a = state.slots[i];
      if (a.weight <= 0.0001) continue;
      var jp = sampleAnim(a);
      for (var j = 0; j < state.joints.length; j++) {
        var J = state.joints[j];
        pose[J] += jp[J] * a.weight;
      }
    }
    state.pose = pose;
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    ctx.strokeStyle = '#1e2a3d'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(360, 0); ctx.lineTo(360, engine.H); ctx.stroke();
    drawTrackPanel(state, ctx);
    drawSkeleton(state, ctx);
    if (state.mode === 0) drawSM(state, ctx); else drawBS(state, ctx);
    ctx.font = '12px monospace';
    ctx.fillStyle = '#7d93b3';
    ctx.fillText('左：轨道+关键帧+插值器（动画的本体）  右：混合策略（状态机/混合空间）  中：Σ(权重×采样) 的最终姿态', 12, engine.H - 10);
    if (state.msgT > 0) { ctx.fillStyle = '#fbbf24'; ctx.fillText(state.msg, 12, engine.H - 30); }
  }
});

// ================= 核心小函数 =================

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function easeIO(x) { return x * x * (3 - 2 * x); }   // smoothstep：两端慢中间快
function say(state, s) { state.msg = s; state.msgT = 3; }

// 采样一条角度轨道：定位区间 → 归一化 u → 插值器
function sampleTrack(tr, time) {
  var ks = tr.keys, n = ks.length;
  var i = 0;
  while (i < n - 1 && ks[i + 1].t <= time) i++;
  var k0 = ks[i], k1 = ks[Math.min(i + 1, n - 1)];
  if (k1 === k0) return k0.v;
  var u = (time - k0.t) / (k1.t - k0.t);
  return k0.v + (k1.v - k0.v) * u;
}

// 采样一条动画：每个关节 = 正弦轨道（amp/freq/ph/offset），pos 是播放头
function sampleAnim(slot) {
  var out = {}, J = ['bodyY', 'lean', 'lA', 'rA'];
  for (var i = 0; i < J.length; i++) {
    var p = slot.anim.j[J[i]];
    out[J[i]] = p[3] + p[0] * Math.sin(slot.pos * p[1] * 2 * Math.PI + p[2]);
  }
  return out;
}

function addSlot(state, anim, pos, target) {
  state.slots.push({ anim: anim, pos: pos, rate: 1, weight: 0, target: target, fading: true, fadeT: 0, fadeDur: 0.0001, fadeFrom: 0, oneShot: false, hold: 0, dead: false });
}

function startFade(slot, target, dur) {
  slot.target = target;
  slot.fading = true;
  slot.fadeT = 0;
  slot.fadeDur = dur;
  slot.fadeFrom = slot.weight;
}

// 状态机 travel：校验转移合法性，旧常驻槽淡出、新槽淡入
function travelTo(state, cur, next) {
  if (cur === next) return;
  var edges = {
    'Idle|Walk→': 1, 'Idle|Walk←': 1, 'Walk→|Idle': 1, 'Walk←|Idle': 1,
    'Walk→|Walk←': 1, 'Walk←|Walk→': 1,
    'Idle|Jump': 1, 'Walk→|Jump': 1, 'Walk←|Jump': 1
  };
  if (edges[cur + '|' + next] !== 1) return;   // Jump 的回落由 oneShot 自动完成
  if (next === 'Jump') { fireOneShot(state, state.A.jump, 0.6); return; }
  var key = next === 'Walk→' ? 'walkR' : next === 'Walk←' ? 'walkL' : 'idle';
  var has = false;
  for (var i = 0; i < state.slots.length; i++) {
    var s = state.slots[i];
    if (s.oneShot) continue;
    if (s.anim === state.A[key]) { if (s.target !== 1) startFade(s, 1, state.transT); has = true; }
    else if (s.target !== 0) startFade(s, 0, state.transT);
  }
  if (!has) {
    var ns = { anim: state.A[key], pos: 0, rate: 1, weight: 0, target: 1, fading: true, fadeT: 0, fadeDur: state.transT, fadeFrom: 0, oneShot: false, hold: 0, dead: false };
    state.slots.push(ns);
  }
}

// 混合空间：为某条动画设定目标权重（常驻槽立即跟随，无过渡——连续映射本身就是平滑的）
function syncBlend(state, anim, w) {
  for (var i = 0; i < state.slots.length; i++) {
    var s = state.slots[i];
    if (!s.oneShot && s.anim === anim) { s.weight = w; s.target = w; s.fading = false; return; }
  }
  state.slots.push({ anim: anim, pos: 0, rate: 1, weight: w, target: w, fading: false, fadeT: 0, fadeDur: 0, fadeFrom: 0, oneShot: false, hold: 0, dead: false });
}

// 一次性动画（跳跃）：满权重插入，hold 秒后淡出自毁 —— 对应 AnimationNodeOneShot
function fireOneShot(state, anim, dur) {
  for (var i = 0; i < state.slots.length; i++) {
    var s = state.slots[i];
    if (s.oneShot && s.anim === anim) { s.pos = 0; s.hold = dur; startFade(s, 1, 0.05); return; }
  }
  state.slots.push({ anim: anim, pos: 0, rate: 1, weight: 1, target: 1, fading: false, fadeT: 0, fadeDur: 0, fadeFrom: 0, oneShot: true, hold: dur, dead: false });
}

// ================= 绘制 =================

function drawTrackPanel(state, ctx) {
  var X = 14, Y = 14, W = 330;
  ctx.font = '13px monospace';
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('① 轨道 arm.rotation（单位 °）', X, Y + 12);
  var axisX = X + 46, axisW = W - 60, top = Y + 30, h = 120;
  var tr = state.track, tmax = tr.loop;
  ctx.strokeStyle = '#2f4468'; ctx.lineWidth = 1;
  ctx.strokeRect(axisX, top, axisW, h);
  ctx.beginPath(); ctx.moveTo(axisX, top + h / 2); ctx.lineTo(axisX + axisW, top + h / 2); ctx.stroke();
  ctx.fillStyle = '#5b7397'; ctx.font = '10px monospace';
  ctx.fillText('+50', X + 12, top + 8); ctx.fillText('0', X + 24, top + h / 2 + 3); ctx.fillText('-30', X + 10, top + h - 2);
  // 采样曲线（整条轨道 = 插值器的图像）
  ctx.strokeStyle = '#5aa9e6'; ctx.lineWidth = 2;
  ctx.beginPath();
  for (var px = 0; px <= axisW; px++) {
    var tv = px / axisW * tmax;
    var v = sampleTrack(tr, tv);
    var yy = top + h / 2 - (v / 50) * (h / 2 - 6);
    if (px === 0) ctx.moveTo(axisX + px, yy); else ctx.lineTo(axisX + px, yy);
  }
  ctx.stroke();
  // 关键帧菱形
  for (var i = 0; i < tr.keys.length; i++) {
    var k = tr.keys[i];
    var kx = axisX + k.t / tmax * axisW, ky = top + h / 2 - (k.v / 50) * (h / 2 - 6);
    ctx.fillStyle = '#fbbf24';
    ctx.save(); ctx.translate(kx, ky); ctx.rotate(Math.PI / 4); ctx.fillRect(-4, -4, 8, 8); ctx.restore();
  }
  // 播放头
  var hx = axisX + state.time / tmax * axisW;
  var hv = sampleTrack(tr, state.time);
  var hy = top + h / 2 - (hv / 50) * (h / 2 - 6);
  ctx.strokeStyle = '#f87171'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(hx, top); ctx.lineTo(hx, top + h); ctx.stroke();
  ctx.fillStyle = '#f87171';
  ctx.beginPath(); ctx.arc(hx, hy, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e2e8f0'; ctx.font = '11px monospace';
  ctx.fillText('time=' + state.time.toFixed(2) + 's  value=' + hv.toFixed(1) + '°', axisX, top + h + 16);
  ctx.fillStyle = state.easeOn ? '#34d399' : '#7d93b3';
  ctx.fillText('插值器: ' + (state.easeOn ? '缓动 smoothstep' : '线性 linear'), axisX + 172, top + h + 16);

  // ② 两种插值器对比
  var g2 = top + h + 30;
  ctx.fillStyle = '#8fa7c7'; ctx.font = '13px monospace';
  ctx.fillText('② 同一个区间，两种插值器', X, g2 + 12);
  var gx = axisX, gw = axisW, gy = g2 + 22, gh = 70;
  ctx.strokeStyle = '#2f4468'; ctx.strokeRect(gx, gy, gw, gh);
  ctx.strokeStyle = '#7d93b3'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(gx, gy + gh); ctx.lineTo(gx + gw, gy); ctx.stroke();
  ctx.strokeStyle = '#34d399';
  ctx.beginPath();
  for (var q = 0; q <= gw; q += 2) {
    var u = q / gw, e = easeIO(u);
    var y2 = gy + gh - e * gh;
    if (q === 0) ctx.moveTo(gx + q, y2); else ctx.lineTo(gx + q, y2);
  }
  ctx.stroke();
  var pu = state.time / tmax; pu = pu - Math.floor(pu);
  var pe = state.easeOn ? easeIO(pu) : pu;
  ctx.fillStyle = '#f87171';
  ctx.beginPath(); ctx.arc(gx + pu * gw, gy + gh - pe * gh, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5b7397'; ctx.font = '10px monospace';
  ctx.fillText('灰=linear 绿=smoothstep 红点=当前 u', gx, gy + gh + 14);

  // ③ 关键帧原始数据
  var g3 = gy + gh + 26;
  ctx.fillStyle = '#8fa7c7'; ctx.font = '13px monospace';
  ctx.fillText('③ 轨道里的全部数据（其余都是算出来的）', X, g3 + 12);
  ctx.font = '11px monospace';
  for (var r = 0; r < tr.keys.length; r++) {
    var kk = tr.keys[r];
    ctx.fillStyle = r % 2 === 0 ? '#e2e8f0' : '#9fb4cf';
    ctx.fillText('{ t: ' + kk.t.toFixed(2) + ', v: ' + pad4(kk.v) + ' }', X + 8 + (r % 2) * 160, g3 + 32 + Math.floor(r / 2) * 18);
  }
  ctx.fillStyle = '#5b7397';
  ctx.fillText('Space 播放 · ,/. 单步 · T 换插值器 · R 归零', X, engine.H - 46);
}

function pad4(v) { var s = '' + v; while (s.length < 3) s = ' ' + s; return s; }

function drawSkeleton(state, ctx) {
  var cx = 470, hipY = 260;
  var p = state.pose || { bodyY: 0, lean: 0, lA: 0, rA: 0 };
  var bob = p.bodyY, lean = p.lean * DEG;
  var headY = hipY - 58 - bob;
  ctx.font = '13px monospace';
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('最终姿态 = Σ( 权重 × 采样 )', 372, 24);
  ctx.strokeStyle = '#1e2a3d'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(372, 330); ctx.lineTo(568, 330); ctx.stroke();
  var sx = Math.sin(lean) * 20;
  ctx.strokeStyle = '#9fb4cf'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  line(ctx, cx, hipY - bob, cx - sx * 1.6, headY);
  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath(); ctx.arc(cx - sx * 1.9, headY - 12, 11, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#5b7397'; ctx.lineWidth = 4;
  line(ctx, cx, hipY - bob, cx - 14, 328);
  line(ctx, cx, hipY - bob, cx + 14, 328);
  var shX = cx - sx * 0.4, shY = hipY - bob - 12;
  ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 4;
  var la = p.lA * DEG, ra = p.rA * DEG;
  line(ctx, shX, shY, shX + Math.sin(la) * 34, shY + Math.cos(la) * 34);
  ctx.strokeStyle = '#34d399';
  line(ctx, shX, shY, shX + Math.sin(ra) * 34, shY + Math.cos(ra) * 34);
  dot(ctx, cx, hipY - bob, '#fbbf24');
  dot(ctx, shX, shY, '#fbbf24');
  ctx.fillStyle = '#5b7397'; ctx.font = '10px monospace';
  ctx.fillText('● 骨骼节点（Transform 的消费者）', 372, 348);
  ctx.fillText('hip.y=' + (-bob).toFixed(1) + '  lean=' + p.lean.toFixed(1) + '°', 372, 364);
  ctx.fillText('lArm=' + p.lA.toFixed(1) + '°  rArm=' + p.rA.toFixed(1) + '°', 372, 380);
}

function line(ctx, ax, ay, bx, by) { ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); }
function dot(ctx, x, y, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); }

function hexOf(label) {
  var m = { Idle: '#5aa9e6', 'Walk←': '#f59e0b', 'Walk→': '#34d399', Jump: '#f472b6' };
  return m[label] || '#7d93b3';
}
function rgba(hex, a) {
  var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a.toFixed(2) + ')';
}

function drawSM(state, ctx) {
  var X = 620, Y = 80, W = 100, H = 38;
  ctx.font = '13px monospace';
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('状态机（Tab 切到混合空间）', 596, 30);
  ctx.fillStyle = '#7d93b3'; ctx.font = '11px monospace';
  ctx.fillText('过渡时长 ' + state.transT.toFixed(2) + 's（[ ] 调整）', 596, 46);
  var box = {
    'Idle': { x: X + 40, y: Y },
    'Walk→': { x: X + 40, y: Y + 110 },
    'Walk←': { x: X - 90, y: Y + 110 },
    'Jump': { x: X + 170, y: Y }
  };
  var edges = [['Idle', 'Walk→'], ['Idle', 'Walk←'], ['Walk→', 'Idle'], ['Walk←', 'Idle'], ['Walk→', 'Walk←'], ['Walk←', 'Walk→'], ['Idle', 'Jump'], ['Walk→', 'Jump'], ['Walk←', 'Jump']];
  for (var i = 0; i < edges.length; i++) {
    var a = box[edges[i][0]], b = box[edges[i][1]];
    arrowBox(a.x + W / 2, a.y + H / 2, b.x + W / 2, b.y + H / 2, '#2f4468', 1, ctx);
  }
  var active = {};
  for (var s = 0; s < state.slots.length; s++) {
    var sl = state.slots[s];
    if (sl.weight > 0.02) active[sl.anim.label] = sl.weight;
  }
  var names = ['Idle', 'Walk→', 'Walk←', 'Jump'];
  for (var n = 0; n < names.length; n++) {
    var bb = box[names[n]], wt = active[names[n]] || 0;
    ctx.fillStyle = '#16233a';
    ctx.fillRect(bb.x, bb.y, W, H);
    if (wt > 0) { ctx.fillStyle = rgba(hexOf(names[n]), wt * 0.55); ctx.fillRect(bb.x, bb.y, W, H); }
    ctx.strokeStyle = wt > 0.9 ? hexOf(names[n]) : '#4a5f80';
    ctx.lineWidth = wt > 0.9 ? 2.5 : 1.2;
    ctx.strokeRect(bb.x, bb.y, W, H);
    ctx.fillStyle = '#e2e8f0'; ctx.font = '12px monospace';
    ctx.fillText(names[n], bb.x + 10, bb.y + 17);
    if (wt > 0.02) { ctx.fillStyle = hexOf(names[n]); ctx.font = '10px monospace'; ctx.fillText('w=' + wt.toFixed(2), bb.x + 10, bb.y + 31); }
  }
  ctx.fillStyle = '#5b7397'; ctx.font = '11px monospace';
  ctx.fillText('↑ 跳（OneShot，自动回落）', 506, Y + 200);
  ctx.fillText('↓ 站定回 Idle；←→ 行走', 506, Y + 218);
  ctx.fillText('过渡期两态并存、各持权重', 506, Y + 236);
  barRow(state, ctx, 506, Y + 258, 200);
}

function drawBS(state, ctx) {
  var X = 660, Y = 90, S = 140;
  ctx.font = '13px monospace';
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('混合空间 BlendSpace2D（Tab 切回状态机）', 596, 30);
  ctx.fillStyle = '#7d93b3'; ctx.font = '11px monospace';
  ctx.fillText('横轴=水平速度 纵轴=速度大小', 596, 46);
  ctx.fillText('→ 双线性四权重（连续映射即天然平滑）', 596, 60);
  ctx.strokeStyle = '#2f4468'; ctx.lineWidth = 1;
  ctx.strokeRect(X - S / 2, Y, S, S);
  ctx.beginPath(); ctx.moveTo(X - S / 2, Y + S / 2); ctx.lineTo(X + S / 2, Y + S / 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X, Y + S); ctx.stroke();
  var pts = { Idle: [X - S / 2 + 6, Y + S - 6], 'Walk←': [X - S / 2 + 6, Y + 6], 'Walk→': [X + S / 2 - 6, Y + S - 6], Jump: [X + S / 2 - 6, Y + 6] };
  var wx = 0, wy = 0, tot = 0;
  for (var i = 0; i < state.slots.length; i++) {
    var sl = state.slots[i];
    if (sl.weight <= 0.02) continue;
    var P = pts[sl.anim.label];
    if (!P) continue;
    wx += (P[0] - X) / (S / 2) * sl.weight;
    wy += (Y + S / 2 - P[1]) / (S / 2) * sl.weight;
    tot += sl.weight;
  }
  if (tot > 0) { wx /= tot; wy /= tot; }
  ctx.strokeStyle = '#f87171'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(X + wx * S / 2, Y + S / 2 - wy * S / 2, 6, 0, Math.PI * 2); ctx.stroke();
  var labels = ['Idle', 'Walk←', 'Walk→', 'Jump'];
  for (var L = 0; L < labels.length; L++) {
    var lb = labels[L], pt = pts[lb];
    ctx.fillStyle = hexOf(lb);
    ctx.beginPath(); ctx.arc(pt[0], pt[1], 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#9fb4cf'; ctx.font = '10px monospace';
    ctx.fillText(lb, pt[0] - 18, pt[1] + (lb === 'Idle' || lb === 'Walk←' ? 16 : -8));
  }
  ctx.fillStyle = '#5b7397'; ctx.font = '11px monospace';
  ctx.fillText('←→ 移动指针；↑ 触发 Jump 分量', 596, Y + S + 24);
  barRow(state, ctx, 596, Y + S + 44, 200);
}

function barRow(state, ctx, X, Y, W) {
  ctx.font = '10px monospace';
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('混合槽（每帧 Σ 前的账本）', X, Y);
  var rowH = 16;
  for (var i = 0; i < state.slots.length && i < 5; i++) {
    var sl = state.slots[i], y = Y + 12 + i * rowH;
    ctx.fillStyle = '#9fb4cf';
    ctx.fillText(sl.anim.label + (sl.oneShot ? '*' : ''), X, y + 9);
    var bx = X + 64, bw = W - 100;
    ctx.fillStyle = '#16233a'; ctx.fillRect(bx, y, bw, 9);
    ctx.fillStyle = hexOf(sl.anim.label); ctx.fillRect(bx, y, bw * clamp(sl.weight, 0, 1), 9);
    ctx.fillStyle = '#5b7397'; ctx.fillText(sl.weight.toFixed(2), bx + bw + 6, y + 9);
  }
}

function arrowBox(ax, ay, bx, by, color, w, ctx) {
  var dx = bx - ax, dy = by - ay, len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return;
  dx /= len; dy /= len;
  var ex = bx - dx * 26, ey = by - dy * 14;
  ctx.strokeStyle = color; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(ax + dx * 26, ay + dy * 14); ctx.lineTo(ex, ey); ctx.stroke();
  var ang = Math.atan2(ey - ay, ex - ax);
  ctx.beginPath();
  ctx.moveTo(ex, ey); ctx.lineTo(ex - Math.cos(ang - 0.4) * 8, ey - Math.sin(ang - 0.4) * 8);
  ctx.moveTo(ex, ey); ctx.lineTo(ex - Math.cos(ang + 0.4) * 8, ey - Math.sin(ang + 0.4) * 8);
  ctx.stroke();
}
`
    },
    {
      type: 'text',
      title: '试一试',
      html: `<ul>
  <li>左半屏按 <code>T</code> 来回切换插值器，盯住红点在曲线上的位置：数据（关键帧）没变，只是「取值函数」换了——Godot 轨道上的 <code>interpolation_type</code> 与逐帧贝塞尔曲率就是这两个开关的工业版。</li>
  <li>右半屏把过渡时长按 <code>]</code> 拉到最大再狂按方向键：你会看到两个状态同时亮着、权重此消彼长——所谓「过渡」没有任何魔法，就是一段受控的加权混合。</li>
  <li>切到混合空间面板按住 <code>←</code> 或 <code>→</code>：指针滑向哪个角落，哪条动画权重就涨。Unity 的 Blend Tree、UE 的 Blend Space 与 Godot 的 <code>AnimationNodeBlendSpace2D</code> 是同一个思想：把「离散动画列表」变成「连续参数空间上的插值场」。</li>
  <li>按 <code>↑</code> 起跳时注意权重条里带 <code>*</code> 的一次性槽：它盖住走路，播完自己淡出销毁——对应 <code>AnimationNodeOneShot</code>。想想为什么跳跃不该做成普通状态：因为它可能从任何状态发生，也随时该让位回去。</li>
  <li>思考题：实验里 Idle 和 Walk 共用同一个 <code>bodyY</code> 关节，混合结果是算术平均——这在 3D 旋转上会产生「转圈抄近路」甚至翻转的错误。真实引擎对四元数用球面插值（slerp），对欧拉角要先换算——这就是为什么 ROTATION 类轨道单独有 <code>INTERPOLATION_LINEAR_ANGLE</code> 这一档。</li>
</ul>`
    },
    {
      type: 'source',
      title: '源码走读：从播放头到写回',
      files: [
        { path: 'scene/animation/animation_player.cpp', note: '生产者本体：play() 如何设置播放头与混合秒数、queue() 排队下一段动画；advance() 每帧推进 active 动画的时间。对照左半屏的播放头找这些代码。' },
        { path: 'scene/animation/animation_mixer.cpp', note: 'Player 与 Tree 的共同基类：advance(p_time) → _process_animation → 遍历 track cache 逐轨道插值 → _blend_apply() 统一写回目标属性。「采样→混合→写回」三步的 C++ 原文。' },
        { path: 'scene/animation/animation_tree.cpp', note: 'AnimationNode 基类的 process 递归与 blendw 权重数组：混合结果如何在父子节点间逐轨道加权传递。同目录 animation_blend_tree.cpp 是其图容器（blend2/Add/OneShot 节点都注册在那里）。' },
        { path: 'scene/animation/animation_node_state_machine.cpp', note: '状态机 = 混合树上的一个节点：AnimationNodeStateMachinePlayback::travel(to) 切换目标状态，transition 的 seconds 即过渡时长，advance_condition 把「何时走这条边」外包给条件。对照实验右屏逐一找这三个概念。' }
      ]
    },
    {
      type: 'text',
      title: '小结',
      html: `<p>回到三个灵魂拷问。<b>数据怎么流动</b>：Animation 资源是不可变的纯数据（轨道+关键帧+插值器），Mixer 每帧把它采样成带权重的 PlaybackInfo，经混合树递归加权，最后以 Object::set 落到骨骼节点——生产者、调度者、消费者三段单向流。<b>所有权归谁</b>：动画资产归 Resource（共享、可热重载）；播放头与混合槽归 Mixer/Tree（实例状态，每个角色一份）；最终姿态在「写回那一刻」移交给了骨骼本身。<b>什么时候发生</b>：采样与混合发生在每帧的内部处理通知里，可按 callback_mode 挪到物理帧；关键帧上的 METHOD/AUDIO 轨道则是「按需」——时间越过阈值才发射。</p>
<p>留一个钩子：实验里的混合是逐关节算术平均，简单但对旋转不严谨。真实的 3D 蒙皮还要再走两步——骨骼局部变换沿层级累乘出全局姿势（Skeleton3D 的姿势求值），再由 GPU 把顶点绑到多根骨头上加权变换（蒙皮）。这两步分别是 L3.1 变换链和 L4.2 shader 的舞台，到时再见。</p>`
    }
  ]
}
