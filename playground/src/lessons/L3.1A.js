// L3.1A · 四元数的数学原理:从复数到旋转公式
export default {
  id: 'L3.1A',
  title: '四元数的数学原理：从复数到旋转公式',
  est: '2 小时',
  coreQuestions: [
    '复数乘法能转 2D 平面，哈密顿为什么找了十几年才给 3D 找到「三个 i」？',
    'q v q* 这个三明治公式为什么恰好是旋转？半角从哪来？',
    'q 和 -q 是同一个旋转——双倍覆盖（double cover）的几何真相是什么？',
    'slerp 的公式为什么长那样？nlerp 便宜在哪、差在哪？'
  ],
  sections: [
  {
    type: 'text',
    title: '从复数到四元数：一次失败的推广与一次顿悟',
    html: `<p>复数乘法天生会旋转：<code>(cosθ + i·sinθ)·1 = cosθ + i·sinθ</code>——乘上一个模长为 1 的复数，就是把平面上的点转 θ 角。i 的代数本质只有一条：<code>i² = −1</code>。于是哈密顿自然地想：3D 旋转，是不是再来两个「i」就行？他试了 <code>i² = j² = k² = −1</code>、试图让它们各管一个轴——发现乘法关不上门（三个虚轴两两相乘会互相污染，除法闭不上）。</p>
<p>1837 年那个「咔哒」：三个虚数<b>不该各管一轴，而该合起来管一根轴</b>。四元数是<b>1 个实部 + 3 个虚部</b>的四维数：q = w + x·i + y·j + z·k，其中</p>
<p><code>i² = j² = k² = ijk = −1</code>　（由此推出 ij = k、jk = i、ki = j、ji = −k……乘法不可交换）</p>
<p>不可交换不是 bug——3D 旋转本身就不可交换（先绕 X 再绕 Y ≠ 先 Y 后 X）。四元数把「旋转的代数」原封不动搬进了代数结构。</p>`
  },
  {
    type: 'text',
    title: '三明治公式：q v q* 为什么恰好是旋转',
    html: `<p>把 3D 向量 v 塞进虚部（w=0 的纯四元数），用「四元数 × 纯量 × 共轭」夹一下：</p>
<p><code>v′ = q · v · q*</code>，其中 <code>q = [cos(θ/2), sin(θ/2)·â]</code>（â 是单位转轴）</p>
<p>展开哈密顿乘积可以验证：v′ 就是 v 绕 â 转 θ 角的结果。<b>为什么是 θ/2？</b>因为夹心要转两次（左乘转一次、右乘共轭再转一次），每次转半角，合起来正好 θ。<b>为什么右乘共轭？</b>共轭 q* = [w, −x, −y, −z] 是反向旋转——两次旋转的「伸缩/歪斜」成分互相抵消，只留下纯旋转。这也是为什么模长必须为 1：|q|≠1 时夹心还会附赠一次缩放。</p>
<p>三个附赠结论：①<b>组合=乘法</b>：先转 q 再转 p 等于 p·q（注意顺序）；②<b>双倍覆盖</b>：q 与 −q 的夹心结果完全相同（sin/cos 的半角在 S³ 球面上是对径点），所以单位四元数生活在 3 维球面 S³ 上，旋转群是它的「二对一」像；③<b>逆=共轭</b>（单位时），比矩阵求逆便宜一个数量级。</p>`
  },
  {
    type: 'text',
    title: '插值：球面上的路',
    html: `<p>L3.1 已经比较过 slerp 与 lerp 的手感，这里是它的数学身份：单位四元数是 S³ 球面上的点，<b>正确的插值是球面上的大圆弧</b>：</p>
<p><code>slerp(q₀, q₁, t) = (sin((1−t)Ω)·q₀ + sin(tΩ)·q₁) / sinΩ</code>，Ω 是两四元数的夹角（cosΩ = dot(q₀,q₁)）</p>
<p>sin 加权保证角速度恒定。便宜替身 <b>nlerp</b>（线性插值再归一化）在 Ω 小时几乎无差，Ω 大时中段会「加速赶路」——代价是非恒定角速度。以及双倍覆盖的实用守则：插值前若 <code>dot(q₀,q₁) &lt; 0</code>，把 q₁ 取负——沿短弧走。</p>`
  },
  {
    type: 'lab',
    lab: 'code',
    key: 'quatmath',
    title: '实验：四元数组件验证台（夹心旋转 / 合成 / 双覆盖 / slerp）',
    height: 620,
    code: `// 拖动=增量旋转(左乘小转,亲眼验证合成=乘法)  A=切换 slerp/nlerp  空格=重置
// 左=线框立方体+三轴架(实时夹心旋转)  右上=四元数分量/轴角/矩阵  右下=q 与 -q 双覆盖 + 插值对比

engine.run({
  setup: function (state) {
    state.q = { w: 1, x: 0, y: 0, z: 0 };       // 当前姿态(单位四元数)
    state.q0 = { w: 1, x: 0, y: 0, z: 0 };      // 插值起点
    state.q1 = normQ({ w: 0.7071, x: 0, y: 0.7071, z: 0 });  // 插值终点(绕Y 90°)
    state.slerpMode = true;
    state.t = 0;
    state.animT = 0;
    state.drag = false;
    state.lastMx = 0;
    state.lastMy = 0;
    state.log = ['拖动立方体=左乘增量旋转;A=切换 slerp/nlerp'];
  },

  update: function (state, dt, input) {
    state.t += dt;
    if (input.pressed('KeyA')) { state.slerpMode = !state.slerpMode; state.animT = 0; pushLog(state, state.slerpMode ? '插值:slerp(恒定角速度)' : '插值:nlerp(便宜,大角度会变速)'); }
    if (input.pressed('Space')) {
      state.q = { w: 1, x: 0, y: 0, z: 0 };
      state.animT = 0;
      pushLog(state, '姿态重置为单位四元数');
    }
    // 拖动:每帧左乘一个「小转」——合成的代数现场
    if (input.mouse.down) {
      if (!state.drag) { state.drag = true; state.lastMx = input.mouse.x; state.lastMy = input.mouse.y; }
      var dx = input.mouse.x - state.lastMx, dy = input.mouse.y - state.lastMy;
      state.lastMx = input.mouse.x; state.lastMy = input.mouse.y;
      if (dx || dy) {
        var angY = dx * 0.008, angX = dy * 0.008;
        var dq = mulQ(axisQ({ x: 0, y: 1, z: 0 }, angY), axisQ({ x: 1, y: 0, z: 0 }, angX));
        state.q = normQ(mulQ(dq, state.q));   // 增量在左:世界轴旋转
      }
    } else state.drag = false;
    // 插值演示循环
    state.animT = (state.animT + dt * 0.5) % 1;
    while (state.log.length > 3) state.log.shift();
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    // 左:旋转中的立方体
    var S = 78, CX = 210, CY = 240;
    var corners = [];
    for (var i = 0; i < 8; i++) {
      var vx = (i & 1 ? 1 : -1) * S;
      var vy = (i & 2 ? 1 : -1) * S;
      var vz = (i & 4 ? 1 : -1) * S;
      var r = sandwich(state.q, vx, vy, vz);
      corners.push(proj(r, CX, CY, 300));
    }
    var edges = [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
    ctx.strokeStyle = '#6ee7b7';
    ctx.lineWidth = 1.6;
    for (var e = 0; e < edges.length; e++) {
      var a = corners[edges[e][0]], b = corners[edges[e][1]];
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // 三轴架(旋转后的 X/Y/Z)
    var axes = [{ v: { x: 1.35, y: 0, z: 0 }, c: '#f87171' }, { v: { x: 0, y: 1.35, z: 0 }, c: '#5b8fd6' }, { v: { x: 0, y: 0, z: 1.35 }, c: '#ffd479' }];
    for (var ai = 0; ai < 3; ai++) {
      var ar = sandwich(state.q, axes[ai].v.x * S, axes[ai].v.y * S, axes[ai].v.z * S);
      var ap = proj(ar, CX, CY, 300);
      ctx.strokeStyle = axes[ai].c;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(CX, CY);
      ctx.lineTo(ap.x, ap.y);
      ctx.stroke();
      ctx.fillStyle = axes[ai].c;
      ctx.font = '10px monospace';
      ctx.fillText(['X', 'Y', 'Z'][ai], ap.x + 3, ap.y - 3);
    }
    ctx.lineWidth = 1;
    ctx.fillStyle = '#5b7397';
    ctx.font = '11px monospace';
    ctx.fillText('拖动立方体旋转(增量左乘)', 60, 470);
    // 右上:四元数分量/轴角/矩阵
    drawReadout(state, ctx);
    // 右下:双覆盖 + slerp/nlerp
    drawCoverage(state, ctx);
    drawHud(state, ctx);
  }
});

// ---------- 四元数代数(本课的数学主角) ----------

function mulQ(a, b) {
  // 哈密顿积:(w1,w2),(v1·v2) 展开——i²=j²=k²=ijk=-1 直接代入整理
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w
  };
}

function conj(q) { return { w: q.w, x: -q.x, y: -q.y, z: -q.z }; }

function normQ(q) {
  var l = Math.sqrt(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z) || 1;
  return { w: q.w / l, x: q.x / l, y: q.y / l, z: q.z / l };
}

// 三明治:v' = q · v · q*(v 进虚部,出来还是虚部)
function sandwich(q, vx, vy, vz) {
  var v = { w: 0, x: vx, y: vy, z: vz };
  var r = mulQ(mulQ(q, v), conj(q));
  return { x: r.x, y: r.y, z: r.z };
}

// 轴角 → 四元数(注意半角!)
function axisQ(axis, ang) {
  var l = Math.sqrt(axis.x * axis.x + axis.y * axis.y + axis.z * axis.z) || 1;
  var h = ang / 2;
  return { w: Math.cos(h), x: axis.x / l * Math.sin(h), y: axis.y / l * Math.sin(h), z: axis.z / l * Math.sin(h) };
}

function quatToAxisAngle(q) {
  var sinH = Math.sqrt(1 - Math.min(1, q.w * q.w));
  if (sinH < 0.0001) return { ax: 0, ay: 0, az: 1, ang: 0 };
  var ang = 2 * Math.acos(Math.min(1, Math.max(-1, q.w)));
  return { ax: q.x / sinH, ay: q.y / sinH, az: q.z / sinH, ang: ang };
}

// slerp:球面大圆弧,恒定角速度
function slerp(a, b, t) {
  var d = a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z;
  var bb = b;
  if (d < 0) { bb = { w: -b.w, x: -b.x, y: -b.y, z: -b.z }; d = -d; }  // 双覆盖:走短弧
  var om = Math.acos(Math.min(1, d));
  if (om < 0.0005) return normQ({ w: a.w + (bb.w - a.w) * t, x: a.x + (bb.x - a.x) * t, y: a.y + (bb.y - a.y) * t, z: a.z + (bb.z - a.z) * t });
  var so = Math.sin(om);
  var w0 = Math.sin((1 - t) * om) / so, w1 = Math.sin(t * om) / so;
  return { w: a.w * w0 + bb.w * w1, x: a.x * w0 + bb.x * w1, y: a.y * w0 + bb.y * w1, z: a.z * w0 + bb.z * w1 };
}

// nlerp:线性插值+归一化(便宜,角速度非恒定)
function nlerp(a, b, t) {
  var d = a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z;
  var s = d < 0 ? -1 : 1;
  return normQ({
    w: a.w + s * (b.w - a.w) * t, x: a.x + s * (b.x - a.x) * t,
    y: a.y + s * (b.y - a.y) * t, z: a.z + s * (b.z - a.z) * t
  });
}

// ---------- 工具 ----------

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

function proj(v, cx, cy, dist) {
  var w = dist / (dist + v.z);
  return { x: cx + v.x * w, y: cy - v.y * w };
}

function pushLog(state, s) {
  state.log.push(s);
  if (state.log.length > 3) state.log.shift();
}

// ---------- 绘制面板 ----------

function drawReadout(state, ctx) {
  var x = 400, y = 56;
  var q = state.q;
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText('当前姿态四元数:', x, y);
  ctx.fillStyle = '#a7f3d0';
  ctx.fillText('w=' + q.w.toFixed(3) + '  x=' + q.x.toFixed(3), x, y + 22);
  ctx.fillText('y=' + q.y.toFixed(3) + '  z=' + q.z.toFixed(3), x, y + 40);
  ctx.fillStyle = Math.abs(Math.sqrt(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z) - 1) < 0.001 ? '#6ee7b7' : '#f87171';
  ctx.fillText('|q|=1 ✓(单位化保证纯旋转)', x, y + 62);
  var aa = quatToAxisAngle(q);
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('等效轴角:轴(' + aa.ax.toFixed(2) + ',' + aa.ay.toFixed(2) + ',' + aa.az.toFixed(2) + ') 角 ' + (aa.ang * 180 / Math.PI).toFixed(1) + '°', x, y + 88);
  ctx.fillStyle = '#5b7397';
  ctx.fillText('夹心 q·v·q*:两次半角旋转,伸缩抵消', x, y + 108);
  // -q 同姿态验证:用 -q 夹心同一顶点,结果一致
  var v0 = sandwich(q, 1, 0, 0);
  var v1 = sandwich({ w: -q.w, x: -q.x, y: -q.y, z: -q.z }, 1, 0, 0);
  ctx.fillStyle = '#ffd479';
  ctx.fillText('-q 旋转 X 轴: (' + v1.x.toFixed(3) + ',' + v1.y.toFixed(3) + ',' + v1.z.toFixed(3) + ')', x, y + 132);
  ctx.fillText(' q 旋转 X 轴: (' + v0.x.toFixed(3) + ',' + v0.y.toFixed(3) + ',' + v0.z.toFixed(3) + ')', x, y + 150);
  ctx.fillStyle = '#f87171';
  ctx.fillText('完全一致 → 双倍覆盖:q ≡ -q', x, y + 172);
}

function drawCoverage(state, ctx) {
  var x = 400, y = 330;
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText('插值对比 q₀ → q₁ (绕Y 90°):', x, y);
  // slerp vs nlerp 的角速度对比曲线
  var gx = x, gy = y + 14, gw = 290, gh = 90;
  ctx.strokeStyle = '#2c3e55';
  ctx.strokeRect(gx, gy, gw, gh);
  ctx.strokeStyle = '#6ee7b7';
  ctx.beginPath();
  for (var i = 0; i <= 60; i++) {
    var t = i / 60;
    var q = slerp(state.q0, state.q1, t);
    var ang = 2 * Math.acos(Math.min(1, Math.abs(q.w))) * 180 / Math.PI;
    var px = gx + t * gw, py = gy + gh - ang / 90 * gh;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.strokeStyle = '#f59e0b';
  ctx.beginPath();
  for (var j = 0; j <= 60; j++) {
    var t2 = j / 60;
    var q2 = nlerp(state.q0, state.q1, t2);
    var ang2 = 2 * Math.acos(Math.min(1, Math.abs(q2.w))) * 180 / Math.PI;
    var px2 = gx + t2 * gw, py2 = gy + gh - ang2 / 90 * gh;
    if (j === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
  }
  ctx.stroke();
  ctx.fillStyle = '#6ee7b7';
  ctx.fillText('slerp:直线(恒定角速度)', gx, gy + gh + 16);
  ctx.fillStyle = '#f59e0b';
  ctx.fillText('nlerp:中间快两端慢', gx + 160, gy + gh + 16);
  // 走动的插值小球
  var qi = state.slerpMode ? slerp(state.q0, state.q1, state.animT) : nlerp(state.q0, state.q1, state.animT);
  var r = sandwich(qi, 90, 0, 0);
  ctx.fillStyle = '#ffd479';
  ctx.beginPath();
  ctx.arc(gx + 8 + state.animT * (gw - 16), gy + gh - 12, 5, 0, 6.2832);
  ctx.fill();
  ctx.fillStyle = '#9db4d0';
  ctx.font = '10px monospace';
  ctx.fillText('t=' + state.animT.toFixed(2) + '  X轴投影 (' + r.x.toFixed(0) + ',' + r.y.toFixed(0) + ',' + r.z.toFixed(0) + ')', gx, gy + gh + 34);
  ctx.fillStyle = '#5b7397';
  ctx.fillText('dot(q0,q1)<0 时取负 q₁ → 沿短弧插值(双覆盖守则)', gx, gy + gh + 52);
}

function drawHud(state, ctx) {
  ctx.fillStyle = 'rgba(11,15,23,0.92)';
  ctx.fillRect(8, 6, 704, 22);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('拖动=旋转  A=slerp/nlerp  空格=重置姿态', 16, 22);
  for (var i = 0; i < state.log.length; i++) {
    ctx.fillStyle = i === state.log.length - 1 ? '#ffd479' : '#5b7397';
    ctx.font = '10px monospace';
    ctx.fillText(state.log[i], 60, 490 + i * 13);
  }
  ctx.fillStyle = '#5b7397';
  ctx.font = '11px monospace';
  ctx.fillText('ij=k, ji=-k:乘法不可交换——因为 3D 旋转本身不可交换', 60, 470 + 120);
}`
  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>拖动旋转，盯住 w 分量：</b>转得越多 w 越小（转 180° 时 w=0）——w=cos(θ/2)，四元数分量本身就是「半角」的三角函数。</li>
  <li><b>验证双覆盖：</b>右上角用 q 与 −q 各夹一次同一向量，输出完全一致——所以动画系统比较姿态前都要做 dot 取负的守则（slerp 代码第 3 行就是它）。</li>
  <li><b>A 切换 slerp/nlerp：</b>看对比曲线——slerp 是完美直线（恒定角速度），nlerp 中段凸起（大角度时中间赶路）。90° 的例子差距已经肉眼可见，180° 时更夸张。</li>
  <li><b>空格重置后只朝一个方向拖：</b>体验「增量左乘」——每一次拖动都是一个新的轴角小四元数乘上当前姿态，这就是 L3.1 说的「合成=乘法」的代数现场。</li>
  <li><b>把 |q| 监视当裁判：</b>无论怎么拖，|q| 恒为 1——每帧 normQ 的账（L3.1 提过的长度漂移）在这套代数里就是这么结的。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：Quaternion 与 Basis 的互译',
    files: [
      { path: 'core/math/quaternion.cpp', note: 'Quaternion 类：哈密顿积 operator*、axis_angle 构造、slerp 的官方实现（含短弧取负守则）——本课全部公式的工业版。建议搜索：slerp、operator*、set_axis_angle。' },
      { path: 'core/math/basis.cpp', note: 'Basis（3×3 旋转矩阵）与四元数的互译：set_quaternion 展开的就是夹心公式的矩阵形态（含数值稳定的分支处理）。建议搜索：set_quaternion、get_quaternion。' },
      { path: 'core/math/quaternion.h', note: '头文件里的内联运算：xform()（即夹心对向量的作用）与 get_angle——看引擎怎么把「半角」藏在接口之下。建议搜索：xform、get_angle。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>四元数不是玄学，是「把 3D 旋转的代数结构找出来」的必然结果：三个虚数合成一根轴、半角换来夹心公式、S³ 球面送来免费的双倍覆盖与球面插值。L3.1 展示了它「用起来为什么不坏」，本课证明了它「数学上为什么对」。</p>
<ul>
  <li><b>数据怎么流动？</b>轴角→(cos半角, sin半角·轴)→哈密顿积夹心→新向量；姿态合成=四元数相乘；插值=S³ 上的大圆弧。</li>
  <li><b>所有权归谁？</b>姿态以单位四元数唯一持有（|q|=1 是纪律）；−q 与 q 等价——比较/插值前先做 dot 符号守则。</li>
  <li><b>什么时候发生？</b>夹心在每次变换向量时发生、乘法在姿态合成时发生、归一化在每帧末尾兜底——矩阵只在「交给渲染」的那一刻才被请求。</li>
</ul>`
  }
  ]
};
