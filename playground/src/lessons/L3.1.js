// L3.1 · 变换与四元数：万向节死锁可视化
export default {
  id: 'L3.1',
  title: '变换与四元数：万向节死锁可视化',
  est: '2 小时',
  coreQuestions: [
    '一帧里姿态数据以什么形态流动？Inspector 里的欧拉三数由谁、在什么时刻被翻译成什么？翻译会丢东西吗？',
    '为什么用三个数记录姿态必然存在 ±90° 奇异点——是旋转本身的错，还是「图表坐标」的错？',
    '把一帧输入合进朝向，为什么用四元数乘法 + 归一化而不是累加三个角？长度漂移这笔账归谁负责？',
    '欧拉角取平均、四元数 lerp 再归一化分别坏在哪？slerp 的「匀速」是用什么换来的？定步插值（L1.1）什么时候必须用它？'
  ],
  sections: [
    {
      type: 'text',
      title: '姿态的真身：引擎里存的不是三个数',
      html: `<p>先给「数据怎么流动」一个明确答复：Godot 里每个节点的姿态，存储字段是 <code>Transform3D local_transform</code>（node_3d.h:114）。而 Transform3D 只有两个成员：<b>Basis——3×3 矩阵，存三个互相正交的行向量（Godot 3 里 Matrix3 的改名继任者）</b>，加 origin 平移（transform_3d.h:43-44）。你在 Inspector 里编辑的 Rotation 三数 XYZ？那是派生视图，不是存储。</p>
<p>node_3d.h 顶部的注释（69–84 行）把三种表示的分工写得极其坦白，两条结论原样端走：<b>四元数根本不被存储</b>——“quaternion is not really stored, but converted back/forth from 3x3 matrix on demand”（按需从 3×3 矩阵换进换出）；<b>欧拉角之所以要单独缓存一份，恰恰因为它不可靠</b>——从欧拉转成 Basis 再分解回来「may result in a different vector」（可能得到不同的向量），还可能丢圈数——0→720° 这种冗余旋转恰恰是动画想要的。</p>
<table>
  <tr><th>表示</th><th>组成</th><th>在引擎里的角色</th><th>什么时候出场</th></tr>
  <tr><td>YXZ 三数</td><td>3 floats</td><td>编辑器的面子：人手调参、动画曲线显示</td><td>只在赋值 / 回读那一瞬（看下行）</td></tr>
  <tr><td>Basis</td><td>9 floats</td><td>姿态真身：存储、父子级联、渲染都走它</td><td>每帧：local 逐级乘到 global</td></tr>
  <tr><td>Quaternion</td><td>4 floats</td><td>合成与插值的临时货币（slerp 专用）</td><td>每次插值调用现转、用完即焚</td></tr>
</table>
<p>时间线全在两个 _update_ 前缀的函数里：改 <code>rotation.x</code> 只置一个 DIRTY 标志，真正要用姿态时才执行 <code>basis.set_euler_scale(...)</code> 重建（node_3d.cpp:92-96）；反过来直接改 basis，就置另一个标志，等编辑器<b>回读显示值</b>的那一帧才现场 <code>get_euler_normalized(...)</code> 分解（node_3d.cpp:98-104）。<b>惰性、双向、按需翻译</b>——两本账永远只有一本是活的，另一本是缓存。连编辑器 UI 都自认：rotation_edit_mode 把 Euler / Quaternion / Basis 做成三档下拉，你选哪档，另外两档的属性直接不显示（node_3d.cpp:1349-1360）。“三个数”自始至终只是一张给人看的脸。</p>`
    },
    {
      type: 'text',
      title: '万向节退化：三个数为什么必然坏一次',
      html: `<p>三个数记姿态，等价于指挥<b>三个嵌套环</b>（gimbal，万向节）：第一环的轴世界固定；第二环的轴被第一环转过去；第三环的轴被前两环先后转过去。于是<b>第一、第三根转轴之间的夹角，是中间那个数的函数</b>——事故的全部来源都在这里。</p>
<p>在 Godot 默认的 <b>YXZ</b> 顺序（node_3d.h:119 的初值）下算笔账：轴 1 恒为世界 Y；轴 3 被 Ry(yaw)·Rx(pitch) 转过之后，它的世界 Y 分量恰为 −sin(Pitch)。所以 <b>轴 1 与轴 3 夹角的余弦 = |sin(Pitch)|</b>：Pitch=0 时两轴垂直（90°，三个旋钮三个自由度）；<b>Pitch=±90° 时夹角塌缩到 0°——第一、第三号旋钮拧的是同一根世界轴</b>。丢掉的那个自由度不是 bug，是几何事实。此刻若机头正指天：转第一环＝原地打转，转第三环＝还是原地打转，<b>机头方向被钉死在天顶</b>——想让它指向任何别的方向，唯一出路是把第二个数反着拖回 ±90° 以内。实验一里你会亲手试一次「怎么按都回不去」。</p>
<p>这是拓扑定律，不是 Godot 写不好：SO(3) 无法被三个欧氏坐标全局平滑覆盖，<b>任何</b>「三数记姿态」都必有奇异点。换顺序只是挪地雷——EulerOrder 共 6 种排列（math_defs.h:129 起），Node3D 还真有 rotation_order 属性随便换，可 6 种各自都有 ±90°。证据直接烙在分解代码里：basis.cpp 的 get_euler（YXZ 分支 527–564 行）一旦碰到矩阵退化到极点（中间量 = ±1），就把欧拉角硬编码成「中间角 ±90°、第三个数 0」——<b>在奇异点上，引擎不是算不出第三个数，而是粗暴地瞎补一个</b>。这就是万向节死锁在源码里的长相。</p>
<p>那「换一组更好的三个数」有出路吗？没有。出路是<b>从此不再拿三个数当账本</b>：合成用乘法、插值沿弧——没有第二根可退化的轴，就没有任何角度的 ±90°。下面先看实验台：两本账并排记账，同样的按键，当场对质。</p>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'gimbal',
      title: '实验：万向节死锁实验台（三嵌套环 vs 四元数）',
      height: 520,
      code: `
// 万向节死锁实验台：一本「欧拉三数」的账 vs 一本「四元数」的账
// 蓝环 = Yaw(轴1·世界Y) · 橙环 = Pitch(轴2·中间轴，惹祸的那根) · 紫环 = Roll(轴3·内环)
// 每环外端的箭头 = 那根转轴此刻在空间里的指向；两个箭头共线 = 死锁
// Q/E 改 Yaw · W/S 改 Pitch · A/D 改 Roll（按住连发）· M 换账本 · G 设目标 · R 重置
// 玩法：欧拉模式按住 W 把 Pitch 顶到 +90°，按 G 设一个不在天顶的目标，
//       再 Q/E/A/D 挨个按——机头纹丝不动，怎么都回不到目标；
//       按 M 换四元数记账：同样的键 = 绕自身轴的一小步乘法，没有 ±90°，永远不锁。

var CAMD = 5.3;

engine.run({
  setup: function (state) {
    reset(state);
    state.hint = '欧拉记账：按住 W，把 Pitch 顶到 +90°（右侧 HUD：轴1 与 轴3 夹角正在塌向 0°）';
    state.hintT = 8; state.msg = ''; state.msgT = 0;
  },

  update: function (state, dt, input) {
    var s = state;
    s.time += dt; s.hintT -= dt; s.msgT -= dt;
    if (input.pressed('KeyR')) { reset(s); s.hint = '重置：两本账都回到起始姿态'; s.hintT = 2.5; }
    if (input.pressed('KeyM')) {
      s.mode = 1 - s.mode;
      s.hint = s.mode === 0 ? '换到欧拉记账：键 = 直写 YXZ 三个数' : '换到四元数记账：键 = 绕自身轴乘一小步（右乘）';
      s.hintT = 2.6;
    }
    if (input.pressed('KeyG')) {
      s.goal = !s.goal; s.tT = -1; s.won = false;
      s.hint = s.goal ? '绿箭头 = 目标机头方向：把白色机头点搬过去' : '目标已收起';
      s.hintT = 2.4;
    }
    var sp = 66 * Math.PI / 180 * dt;
    var iY = (input.down('KeyQ') ? 1 : 0) - (input.down('KeyE') ? 1 : 0);
    var iP = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
    var iR = (input.down('KeyA') ? 1 : 0) - (input.down('KeyD') ? 1 : 0);
    var act = (iY !== 0) || (iP !== 0) || (iR !== 0);
    if (s.mode === 0) {
      s.yaw += iY * sp; s.roll += iR * sp; s.pitch += iP * sp;
      if (s.pitch > Math.PI / 2) s.pitch = Math.PI / 2;   // 钳在 ±90°：和 Inspector 的 Pitch 滑条同款
      if (s.pitch < -Math.PI / 2) s.pitch = -Math.PI / 2;
      s.align = Math.abs(Math.sin(s.pitch));              // 轴1·轴3 夹角余弦 = |sin(中间角)|
      s.locked = s.align > 0.997;                         // 夹角小于 4.4° 即视为退化
      if (s.locked && (iY !== 0 || iR !== 0) && s.hintT <= 0) {
        s.hint = '蓝箭头和紫箭头在同一条线上：Q/E 与 A/D 现在拧的是同一根轴';
        s.hintT = 3.4;
      }
    } else {
      var q = s.q;                                        // 四元数记账：同样按键 = 绕【自身轴】的增量
      if (iY !== 0) q = qmul(q, qAxis([0, 1, 0], iY * sp));
      if (iP !== 0) q = qmul(q, qAxis([1, 0, 0], iP * sp));
      if (iR !== 0) q = qmul(q, qAxis([0, 0, 1], iR * sp));
      s.q = qnorm(q);                                     // 乘法攒出 ‖q‖≠1：漂移这笔账，每帧自己付清
      s.locked = false; s.align = 0.5;
      if (act && s.hintT <= 0 && Math.abs(s.q[0]) > 0.7) {
        s.hint = '「中间角 90°」？这里没有任何数需要跨过 90°——继续按，机头照走';
        s.hintT = 3.2;
      }
    }
    var nose = s.mode === 0 ? eulXf(s, [0, 0, -1]) : qv(s.q, [0, 0, -1]);
    if (s.goal) {
      var d = dot3(nose, s.G);
      if (d > 0.985) {
        s.tT = s.tT < 0 ? 0 : s.tT + dt;
        if (s.tT > 0.5 && !s.won) {
          s.won = true;
          s.hint = s.mode === 0 ? '达成！现在把 Pitch 顶到 90°，看你还在不在目标上' : '达成——这种任意角随时可达就是「无奇异」的全部含义';
          s.hintT = 3;
        }
      } else { s.tT = -1; s.won = false; }
    }
    if (act) {
      s.trail.push([nose[0] * 1.5, nose[1] * 1.5, nose[2] * 1.5]);
      if (s.trail.length > 240) s.trail.shift();
    }
  },

  draw: function (state, ctx) {
    var s = state;
    var W = engine.W, H = engine.H, i;
    s.cx = W * 0.31; s.cy = H * 0.50;
    ctx.fillStyle = '#0b0f17'; ctx.fillRect(0, 0, W, H);
    ctx.font = '13px monospace';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(s.mode === 0 ? '模式 A · 欧拉记账：YXZ 三个数 = 万向节三根旋钮' : '模式 B · 四元数记账：一个 q（x,y,z,w），没有角度参数', 12, 22);
    if (s.mode === 0 && s.locked) {
      ctx.fillStyle = 'rgba(248,113,113,0.16)'; ctx.fillRect(0, 30, W, 24);
      ctx.fillStyle = '#f87171';
      ctx.fillText('PITCH = ±90° · Yaw 轴与 Roll 轴共线 —— 转动自由度 3 → 2：万向节死锁', 12, 47);
    }
    if (s.mode === 0) {
      ringYaw(s, ctx, s.locked ? '#f87171' : '#5aa9e6');
      ringPit(s, ctx, '#f59e0b');
      ringRol(s, ctx, s.locked ? '#f87171' : '#9b8cff');
      shaft(s, ctx, [0, 1.74, 0], '#5aa9e6', '轴1 Yaw');
      shaft(s, ctx, rotYv([1.58, 0, 0], s.yaw), '#f59e0b', '轴2 Pitch');
      shaft(s, ctx, rotYv(rotXv([0, 0, 1.48], s.pitch), s.yaw), s.locked ? '#f87171' : '#9b8cff', '轴3 Roll');
    }
    for (i = 0; i < s.trail.length; i++) {
      var tp = proj(s, s.trail[i]);
      ctx.globalAlpha = (i / s.trail.length) * 0.35;
      ctx.fillStyle = '#7d93b3';
      ctx.fillRect(tp.x - 1, tp.y - 1, 2, 2);
    }
    ctx.globalAlpha = 1;
    if (s.goal) goal(s, ctx);
    if (s.mode === 0) drawAero(s, ctx, function (v) { return eulXf(s, v); }, s.locked ? '#f87171' : '#e2e8f0');
    else drawAero(s, ctx, function (v) { return qv(s.q, v); }, '#9fe8c9');
    var nose = s.mode === 0 ? eulXf(s, [0, 0, -1.08]) : qv(s.q, [0, 0, -1.08]);
    var np = proj(s, nose);
    ctx.beginPath(); ctx.arc(np.x, np.y, 4, 0, 6.29);
    ctx.fillStyle = s.won ? '#fbbf24' : (s.mode === 0 ? '#e2e8f0' : '#22c55e');
    ctx.fill();
    panel(s, ctx, W);
    ctx.font = '12px monospace';
    ctx.fillStyle = '#7d93b3';
    ctx.fillText('Q/E Yaw · W/S Pitch · A/D Roll · M 换账本 · G 目标 · R 重置', 12, H - 34);
    if (s.hintT > 0) { ctx.fillStyle = '#fbbf24'; ctx.fillText(s.hint, 12, H - 14); }
  }
});

function reset(s) {
  s.yaw = 0.32; s.pitch = 0.12; s.roll = -0.18;
  s.q = qFromYXZ([s.yaw, s.pitch, s.roll]);   // 两本账从同一个姿态出发
  s.mode = 0; s.time = 0; s.locked = false; s.align = 0.12;
  s.goal = false; s.tT = -1; s.won = false; s.trail = [];
  var g = [0.58, 0.50, -0.64];
  var l = Math.sqrt(g[0] * g[0] + g[1] * g[1] + g[2] * g[2]);
  s.G = [g[0] / l, g[1] / l, g[2] / l];
}

function rotXv(pt, a) { var c = Math.cos(a), n = Math.sin(a); return [pt[0], pt[1] * c - pt[2] * n, pt[1] * n + pt[2] * c]; }
function rotYv(pt, a) { var c = Math.cos(a), n = Math.sin(a); return [pt[0] * c + pt[2] * n, pt[1], -pt[0] * n + pt[2] * c]; }
function rotZv(pt, a) { var c = Math.cos(a), n = Math.sin(a); return [pt[0] * c - pt[1] * n, pt[0] * n + pt[1] * c, pt[2]]; }
function eulXf(s, v) { return rotYv(rotXv(rotZv(v, s.roll), s.pitch), s.yaw); }  // Godot YXZ：R = Ry·Rx·Rz
function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cr3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

// ---- qv 逐行对应 quaternion.h:96-103 的 xform：v + 2·(u×(u×v) + w·(u×v)) ----
function qv(q, v) {
  var u = [q[0], q[1], q[2]], w = q[3];
  var uv = cr3(u, v), uuv = cr3(u, uv);
  return [v[0] + (uv[0] * w + uuv[0]) * 2, v[1] + (uv[1] * w + uuv[1]) * 2, v[2] + (uv[2] * w + uuv[2]) * 2];
}
function qmul(a, b) {   // Hamilton 积：a⊗b = 先转 b 再转 a（列向量约定，同 Godot operator*）
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
  ];
}
function qAxis(axs, ang) {   // 轴角 → 单位四元数：轴×sin(θ/2) | cos(θ/2)
  var l = Math.sqrt(axs[0] * axs[0] + axs[1] * axs[1] + axs[2] * axs[2]);
  if (l < 1e-9) return [0, 0, 0, 1];
  var h = Math.sin(ang / 2) / l;
  return [axs[0] * h, axs[1] * h, axs[2] * h, Math.cos(ang / 2)];
}
function qnormLen(q) { return Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]); }
function qnorm(q) {
  var l = qnormLen(q);
  if (l < 1e-9) return [0, 0, 0, 1];
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}
function qFromYXZ(a) {   // 与 basis.h from_euler(YXZ) 等价：q = qY⊗qX⊗qZ
  return qnorm(qmul(qmul(qAxis([0, 1, 0], a[0]), qAxis([1, 0, 0], a[1])), qAxis([0, 0, 1], a[2])));
}

function proj(s, pt) {   // 手写透视投影（轨道相机）：先绕 Y 再倾 X，focal/depth
  var v = rotYv(pt, 0.62);
  v = rotXv(v, 0.30);
  var d = CAMD - v[2];
  if (d < 0.8) d = 0.8;
  var f = 460 / d;
  return { x: s.cx + v[0] * f, y: s.cy - v[1] * f };
}
function ringYaw(s, ctx, col) {   // 外环：绕世界 Y 转，圆在 XZ 平面
  ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.beginPath();
  for (var i = 0; i <= 28; i++) {
    var a = i / 28 * Math.PI * 2;
    var q = proj(s, [Math.cos(a) * 1.6, 0, Math.sin(a) * 1.6]);
    if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
  }
  ctx.stroke();
}
function ringPit(s, ctx, col) {   // 中环：轴被外环转过 → 整圈跟着 yaw 旋转
  ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.beginPath();
  for (var i = 0; i <= 26; i++) {
    var a = i / 26 * Math.PI * 2;
    var pt = rotYv([0, Math.cos(a) * 1.36, Math.sin(a) * 1.36], s.yaw);
    var q = proj(s, pt);
    if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
  }
  ctx.stroke();
}
function ringRol(s, ctx, col) {   // 内环：轴被外环+中环各转过一次
  ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.beginPath();
  for (var i = 0; i <= 24; i++) {
    var a = i / 24 * Math.PI * 2;
    var pt = rotYv(rotXv([Math.cos(a) * 1.12, Math.sin(a) * 1.12, 0], s.pitch), s.yaw);
    var q = proj(s, pt);
    if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
  }
  ctx.stroke();
}
function shaft(s, ctx, tip, col, lab) {
  var a = proj(s, [0, 0, 0]), b = proj(s, tip);
  ctx.strokeStyle = col; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, 6.29); ctx.fillStyle = col; ctx.fill();
  ctx.font = '11px monospace'; ctx.fillStyle = col;
  ctx.fillText(lab, b.x + 5, b.y - 5);
}
function goal(s, ctx) {
  var a = proj(s, [0, 0, 0]);
  var b = proj(s, [s.G[0] * 1.95, s.G[1] * 1.95, s.G[2] * 1.95]);
  ctx.strokeStyle = '#34d399'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, 6.29);
  ctx.fillStyle = 'rgba(52,211,153,0.35)'; ctx.fill();
  ctx.strokeStyle = '#34d399'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.font = '11px monospace'; ctx.fillStyle = '#34d399';
  ctx.fillText('目标机头', b.x + 8, b.y);
}
function drawAero(s, ctx, xf, col) {   // 机鼻 = -Z（和 Godot 节点朝向约定一致）
  var segs = [
    [[0, 0, -1.0], [0, 0, 0.36]],
    [[-0.56, 0, -0.08], [0.56, 0, -0.08]],
    [[-0.56, 0, -0.08], [0, 0, -1.0]],
    [[0.56, 0, -0.08], [0, 0, -1.0]],
    [[-0.56, 0, -0.08], [0, 0, 0.36]],
    [[0.56, 0, -0.08], [0, 0, 0.36]],
    [[-0.26, 0, 0.32], [0.26, 0, 0.32]],
    [[0, 0.26, 0.24], [0, 0, 0.36]]
  ];
  ctx.strokeStyle = col; ctx.lineWidth = 1.8; ctx.beginPath();
  for (var i = 0; i < segs.length; i++) {
    var a = proj(s, xf(segs[i][0])), b = proj(s, xf(segs[i][1]));
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
}
function dfmt(a) {
  var d = a * 180 / Math.PI;
  return (d >= 0 ? '+' : '') + d.toFixed(1) + '°';
}
function panel(s, ctx, W) {
  var x = W - 240, y = 56, tx = x + 12;
  ctx.fillStyle = 'rgba(13,20,33,0.88)'; ctx.fillRect(x, y, 228, 226);
  ctx.strokeStyle = '#233149'; ctx.lineWidth = 1; ctx.strokeRect(x, y, 228, 226);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(s.mode === 0 ? '姿态存储 = 三个数' : '姿态存储 = 一个四元数', tx, y + 20);
  if (s.mode === 0) {
    ctx.fillStyle = '#5aa9e6'; ctx.fillText('Yaw   ' + dfmt(s.yaw), tx, y + 44);
    ctx.fillStyle = '#f59e0b';
    ctx.fillText('Pitch ' + dfmt(s.pitch) + (s.locked ? ' ←钳死在极限' : ''), tx, y + 62);
    ctx.fillStyle = '#9b8cff'; ctx.fillText('Roll  ' + dfmt(s.roll), tx, y + 80);
    ctx.fillStyle = '#33475f'; ctx.fillText('------------------', tx, y + 96);
    var gap = Math.acos(Math.min(1, s.align)) * 180 / Math.PI;
    ctx.fillStyle = s.locked ? '#f87171' : '#8fa7c7';
    ctx.fillText('轴1 与 轴3 夹角：' + gap.toFixed(1) + '°', tx, y + 114);
    ctx.fillText('（90° = 健康；0° = 退化）', tx, y + 130);
    ctx.fillStyle = s.locked ? '#f87171' : '#34d399';
    ctx.fillText('转动自由度：' + (s.locked ? '2 / 3 ← 丢了一个' : '3 / 3'), tx, y + 148);
    ctx.fillStyle = '#54688a'; ctx.fillText('三数这笔账，迟早要还', tx, y + 176);
  } else {
    var a = s.q;
    ctx.fillStyle = '#9fe8c9';
    ctx.fillText('q = (' + a[0].toFixed(3) + ', ' + a[1].toFixed(3), tx, y + 44);
    ctx.fillText('      ' + a[2].toFixed(3) + ', ' + a[3].toFixed(3) + ')', tx, y + 60);
    ctx.fillStyle = '#8fa7c7';
    ctx.fillText('‖q‖ = ' + qnormLen(a).toFixed(4) + '（每帧已归一化）', tx, y + 80);
    var n = qv(a, [0, 0, -1]);
    ctx.fillText('机头 = (' + n[0].toFixed(2) + ', ' + n[1].toFixed(2) + ', ' + n[2].toFixed(2) + ')', tx, y + 96);
    ctx.fillStyle = '#34d399';
    ctx.fillText('没有「中间轴」→ 没有 ±90°', tx, y + 148);
    ctx.fillStyle = '#54688a'; ctx.fillText('代价：每帧一次归一化防漂移', tx, y + 176);
  }
  ctx.fillStyle = '#33475f'; ctx.fillText('------------------', tx, y + 192);
  if (!s.goal) { ctx.fillStyle = '#54688a'; ctx.fillText('目标：未设（按 G）', tx, y + 210); }
  else {
    var nv = s.mode === 0 ? eulXf(s, [0, 0, -1]) : qv(s.q, [0, 0, -1]);
    var c = Math.max(-1, Math.min(1, dot3(nv, s.G)));
    var ang = Math.acos(c) * 180 / Math.PI;
    ctx.fillStyle = ang < 6 ? '#34d399' : '#fbbf24';
    ctx.fillText('目标夹角：' + ang.toFixed(1) + '°' + (ang < 6 ? ' ✓' : ''), tx, y + 210);
  }
}
`
    },
    {
      type: 'text',
      title: '试一试 · 实验一（课内完成，不是作业）',
      html: `<ul>
  <li>按住 W 把 Pitch 顶到 +90°：看 HUD 里「轴1 与 轴3 夹角」从 90° 一路塌向 0°，横幅变红。按 G 设一个<b>不在天顶</b>的目标，再 Q/E/A/D 挨个试——机头纹丝不动。此刻你手里的三个旋钮，只剩两个自由度：这就是万向节死锁。<b>唯一出路是反拖 Pitch 退回 ±90° 以内</b>——注意退出来之后机头的朝向，和你进锁之前的意图已经毫无关系。</li>
  <li>死锁时观察三个环：蓝环（外）与紫环（内）的轴箭头并成一条线，两个旋钮拧的是同一根世界轴。把这幅画面记在心里：它就是 scene/3d 里真实发生的事，Godot 只是从不让你在 <b>Basis 层</b>看到它。</li>
  <li>按 M 换四元数账本，重复同样的操作：没有 Pitch 滑条、没有 ±90°、没有「钉死的机头」——同样的按键此刻变成「绕自身三轴各一小步」的右乘。把同一个目标用键追到：随时可达。</li>
  <li>动手改一行代码做破坏实验：把 update 里的 <code>s.q = qnorm(q)</code> 改成 <code>s.q = q</code>（删掉归一化），按住键数秒，看 HUD 里 ‖q‖ 离开 1.0000。这就是 quaternion.h 里有关旋转的函数都要先断言 <code>is_normalized()</code>、slerp 甚至直接 ERR_FAIL 的原因——<b>漂移这笔账引擎不替你付，但引擎会查账</b>。</li>
</ul>`
    },
    {
      type: 'text',
      title: '四元数与 slerp：没有奇异点的记账，和按弧等分的插值',
      html: `<p>四元数把姿态装进 4 个 float：虚部 = 转轴 × sin(θ/2)，实部 w = cos(θ/2)（quaternion.h:38-41 就是这四个数；它转动向量的公式在两叉积那行——本实验的 qv 函数逐行照抄 quaternion.h:102）。它撑起三件欧拉角做不到的事：</p>
<p><b>① 合成用乘法，没有可塌的轴。</b>把这一帧输入的微小旋转 δq 右乘进来：q ← q ⊗ δq（右乘 = 绕<b>自身</b>轴转，左乘 = 绕<b>世界</b>轴转——乘法不可交换，先转谁后转谁结果不同，这正是旋转的本性）。没有「第二根相对角度」可退化，就没有任何角度的 ±90°。</p>
<p><b>② 单位长度 = 旋转的纯度，漂移自理。</b>浮点误差会让 ‖q‖ 慢慢离开 1，标准做法是每帧归一化 <code>q ← q/‖q‖</code>——实验台里每帧一次、且只一次。所有权分工清晰：引擎负责在消费四元数的地方查账（inverse/slerp 都断言 is_normalized），生产者（你的游戏代码、物理积分器）负责别让账烂掉。</p>
<p><b>③ 插值沿弧，不沿坐标。</b>四元数是 <b>4 维单位球面 S³ 上的点</b>，两个朝向之间 = 一段大圆弧。三种插法，病与药一目了然：</p>
<table>
  <tr><th>做法</th><th>路径</th><th>角速度</th><th>致命处</th></tr>
  <tr><td>欧拉三数各自取平均</td><td>离开大圆，中段外凸</td><td>乱走</td><td>路径失真，还会撞上 ±90°</td></tr>
  <tr><td>四分量 lerp 再归一化（nlerp）</td><td>碰巧还是那条弧</td><td>两端慢、中段快</td><td>碰到对映端点就改走远路；弦近原点时数值爆炸</td></tr>
  <tr><td>slerp 球面插值</td><td>大圆弧（精确）</td><td><b>全程恒定</b></td><td>要算 acos/sin；端点要修号——引擎全包了</td></tr>
</table>
<p>slerp「安全」的完整定义就藏在 Godot 实现（quaternion.cpp:106-145）的三个动作里，每一行都是防御：</p>
<pre>cosom = dot(qA, qB);
if (cosom &lt; 0) { cosom = -cosom; qB = -qB; }     // 防御① q 与 -q 同一旋转：翻到同侧，必走近路
if (1 - cosom &gt; eps) {                           // 标准球面加权：按转角等分
    omega  = acos(cosom);
    scale0 = sin((1 - t) * omega) / sin(omega);
    scale1 = sin(t * omega) / sin(omega);
} else { scale0 = 1 - t; scale1 = t; }           // 防御② 两端几乎重合：退回 lerp，防 0/0</pre>
<p>为什么不能「lerp 完再 normalize 凑合」？第一，<b>双覆盖</b>：q 与 −q 是同一旋转，lerp 不认识这对孪生——端点取错一副，弦就<b>穿过原点附近走远路</b>，中途姿态乱飞；slerp 防御①一行修号把雷拆了。第二，<b>匀速</b>：lerp 在弦上匀速，投回球面就两端慢、中段快，动画里就是「转头先肉后猛」。nlerp 确实便宜，误差也随角度差变小而消失——所以引擎留着它（TransformInterpolator 的 INTERP_LERP 档），但那是<b>量出两端够近之后的特权</b>，不是默认档。</p>
<p>这条链在源码里已经定稿：节点存 Basis；插值调用现场 <code>get_rotation_quaternion()</code> 转四元数、<code>slerp</code>、再装回 Basis——transform_3d.cpp 的 interpolate_with（96-111 行）白纸黑字：<b>旋转走 slerp，平移走 lerp</b>，两种数据两种待遇（平移空间是线性的，旋转空间是球面的）。高频场景更进一步：TransformInterpolator 在两根物理 Keyframe 之间<b>先预判</b>该用 LERP / SLERP / SCALED_SLERP 哪档，之后每渲染帧只执行选定那档——「一次决定、多次执行」（头文件 36-44 行注释原文）。L1.1 累积器算出的 alpha，喂的就是这条管线：两课在此汇合。下面上赛道。</p>`
    },
    // @@NEXT@@
  ]
}