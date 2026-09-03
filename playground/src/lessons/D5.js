// D5 · 植被与 instancing:一棵草到一万棵草
export default {
  id: 'D5',
  title: '植被与 instancing：一棵草到一万棵草',
  est: '2 小时',
  coreQuestions: [
    '同一万棵草，「逐个画」和「批量画」差在哪一步？',
    'instancing 的本质为什么是「数据存一份、位置走属性流」？',
    'draw call 的开销到底贵在哪？为什么批量能把 N 次压成 1 次？',
    '实例数据要改一帧（风摆动画）时，批量路线怎么不破坏批？'
  ],
  sections: [
  {
    type: 'text',
    title: '一棵草的画法，与一万棵草的画法',
    html: `<p>画一棵草：算出它的三个顶点，交给 GPU。画一万棵草如果照此办理，就是一万次「设置参数+提交」——<b>贵的不在三角形，在提交本身</b>（状态切换、驱动调用、CPU/GPU 通信）。这就是 <b>draw call 开销</b>。</p>
<p><b>instancing</b> 的答案：草的<b>几何只有一份</b>（一个三顶点的小三角），一万棵草只是<b>一万份位置/旋转/缩放数据</b>——把这份实例数据整块交给 GPU，让它自己循环着画。<b>数据只存一份、位置走属性流</b>，一万次提交被压成一次。</p>`
  },
  {
    type: 'text',
    title: '批量之后，动画怎么办？',
    html: `<p>instancing 最大的顾虑：「每棵草都随风摆动，位置每帧都变，还能保持批吗？」能——这正是它的精髓：<b>改实例数据缓冲，不动 draw call</b>。CPU 端只更新每实例的相位/摆幅字段（或干脆把风摆公式写进 shader，用实例 ID 算偏移），批次本身永不拆散。</p>
<table>
  <tr><th>路线</th><th>一万棵草的提交</th><th>风摆</th></tr>
  <tr><td>逐个画</td><td>~10000 次 draw call</td><td>随便改，反正每次都是独立提交</td></tr>
  <tr><td>instancing</td><td>1~2 次 draw call</td><td>改实例缓冲（或 shader 内算），批次不散</td></tr>
</table>
<p>本课沙盘把两条管线并排跑在同一画布上，各画一万棵同样的草——提交次数的差异你看得见，<b>帧耗时的差异你数得出来</b>。</p>`
  },
  {
    type: 'lab',
    lab: 'code',
    key: 'grass',
    title: '实验：左=逐个画 vs 右=批量画（同一万棵草）',
    height: 620,
    code: `// 左半=逐个画(每草一次提交) 右半=批量画(整场一次提交)
// 1/2/3=每侧 1000/5000/10000 棵  Tab=交换左右管线  R=重播种  风力自动缓变

var COLORS = ['#3f7d4c', '#5a9a5f', '#2f5d3a'];

engine.run({
  setup: function (state) {
    state.n = 5000;
    state.swapped = false;
    state.seed = 20260903;
    state.msInd = []; state.msBat = [];
    buildField(state);
    state.log = ['每侧 ' + state.n + ' 棵:左=逐个画 右=批量画'];
  },

  update: function (state, dt, input) {
    state.t = (state.t || 0) + dt;
    if (input.pressed('Digit1')) { state.n = 1000; rebuild(state); pushLog(state, '每侧 1000 棵'); }
    if (input.pressed('Digit2')) { state.n = 5000; rebuild(state); pushLog(state, '每侧 5000 棵'); }
    if (input.pressed('Digit3')) { state.n = 10000; rebuild(state); pushLog(state, '每侧 10000 棵'); }
    if (input.pressed('Tab')) { state.swapped = !state.swapped; pushLog(state, state.swapped ? '左右管线已交换' : '恢复:左=逐个 右=批量'); }
    if (input.pressed('KeyR')) { state.seed = (state.seed * 48271) % 2147483647; rebuild(state); pushLog(state, '重播种草地'); }
    while (state.log.length > 3) state.log.shift();
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    var leftIsInd = !state.swapped;
    var t0 = performance.now();
    if (leftIsInd) drawIndividual(state, ctx, 16, 336); else drawBatched(state, ctx, 16, 336);
    var t1 = performance.now();
    if (leftIsInd) drawBatched(state, ctx, 368, 336); else drawIndividual(state, ctx, 368, 336);
    var t2 = performance.now();
    var msInd = t1 - t0, msBat = t2 - t1;
    pushAvg(state.msInd, msInd); pushAvg(state.msBat, msBat);
    drawHud(state, ctx, msInd, msBat, leftIsInd);
  }
});

// ---------- 草地数据:一份几何 + N 份实例 ----------

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 实例数据走平行数组(SoA):位置/高度/相位/颜色组
function buildField(state) {
  var rng = mulberry32(state.seed);
  var n = state.n;
  state.px = new Float32Array(n);
  state.py = new Float32Array(n);
  state.ht = new Float32Array(n);
  state.ph = new Float32Array(n);
  state.ci = new Uint8Array(n);
  for (var i = 0; i < n; i++) {
    state.px[i] = rng();
    state.py[i] = rng();
    state.ht[i] = 5 + rng() * 12;
    state.ph[i] = rng() * 6.2832;
    state.ci[i] = Math.floor(rng() * 3);
  }
  state.msInd.length = 0;
  state.msBat.length = 0;
}

function rebuild(state) {
  buildField(state);
}

// 左管线:逐个画——每棵草一次独立提交(带状态保护,模拟每对象开销)
function drawIndividual(state, ctx, ox, oy) {
  var W = 336, H = 250;
  ctx.fillStyle = '#16211a';
  ctx.fillRect(ox, oy, W, H);
  var rng = mulberry32(state.seed);
  var n = state.n, t = state.t;
  for (var i = 0; i < n; i++) {
    var x = rng() * (W - 8) + 4;
    var y = rng() * (H - 16) + 14;
    var h = 5 + rng() * 12;
    var ph = rng() * 6.2832;
    var ci = Math.floor(rng() * 3);
    ctx.save();
    ctx.translate(ox + x, oy + y);
    var sway = Math.sin(t * 2 + ph) * 2.2;
    ctx.fillStyle = COLORS[ci];
    ctx.beginPath();
    ctx.moveTo(-1.5, 0);
    ctx.lineTo(1.5, 0);
    ctx.lineTo(sway, -h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

// 右管线:批量画——一份几何+N 份实例,整场一次提交(按颜色组分 3 次 fill)
function drawBatched(state, ctx, ox, oy) {
  var W = 336, H = 250;
  ctx.fillStyle = '#16211a';
  ctx.fillRect(ox, oy, W, H);
  var rng = mulberry32(state.seed);
  var n = state.n, t = state.t;
  var g0 = [], g1 = [], g2 = [];
  for (var i = 0; i < n; i++) {
    var x = rng() * (W - 8) + 4;
    var y = rng() * (H - 16) + 14;
    var h = 5 + rng() * 12;
    var ph = rng() * 6.2832;
    var sway = Math.sin(t * 2 + ph) * 2.2;
    var tri = [x - 1.5, y, x + 1.5, y, x + sway, y - h];
    var ci = Math.floor(rng() * 3);
    if (ci === 0) g0.push(tri); else if (ci === 1) g1.push(tri); else g2.push(tri);
  }
  ctx.beginPath();
  fillGroup(ctx, g0, ox, oy, COLORS[0]);
  ctx.beginPath();
  fillGroup(ctx, g1, ox, oy, COLORS[1]);
  ctx.beginPath();
  fillGroup(ctx, g2, ox, oy, COLORS[2]);
}

function fillGroup(ctx, group, ox, oy, color) {
  for (var i = 0; i < group.length; i++) {
    var v = group[i];
    ctx.moveTo(ox + v[0], oy + v[1]);
    ctx.lineTo(ox + v[2], oy + v[3]);
    ctx.lineTo(ox + v[4], oy + v[5]);
    ctx.closePath();
  }
  ctx.fillStyle = color;
  ctx.fill();
}

// ---------- 工具与 HUD ----------

function pushAvg(arr, v) {
  arr.push(v);
  if (arr.length > 30) arr.shift();
}

function avg(arr) {
  if (!arr.length) return 0;
  var s = 0;
  for (var i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

function pushLog(state, s) {
  state.log.push(s);
}

function drawHud(state, ctx, msInd, msBat, leftIsInd) {
  ctx.fillStyle = 'rgba(11,15,23,0.92)';
  ctx.fillRect(8, 6, 704, 44);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('每侧 ' + state.n + ' 棵  风摆相位逐实例不同  draw call: 左≈' + state.n + ' 次 / 右=3 次', 16, 24);
  var lms = leftIsInd ? msInd : msBat;
  var rms = leftIsInd ? msBat : msInd;
  ctx.fillStyle = '#f59e0b';
  ctx.fillText('左 ' + lms.toFixed(2) + 'ms', 16, 42);
  ctx.fillStyle = '#6ee7b7';
  ctx.fillText('右 ' + rms.toFixed(2) + 'ms', 120, 42);
  ctx.fillStyle = '#ffd479';
  ctx.fillText('差 ' + (Math.max(lms - rms, 0)).toFixed(2) + 'ms', 224, 42);
  ctx.fillStyle = leftIsInd ? '#f59e0b' : '#6ee7b7';
  ctx.fillText(leftIsInd ? '左=逐个画' : '左=批量画', 320, 42);
  ctx.fillStyle = leftIsInd ? '#6ee7b7' : '#f59e0b';
  ctx.fillText(leftIsInd ? '右=批量画' : '右=逐个画', 400, 42);
  ctx.fillStyle = '#5b7397';
  ctx.font = '11px monospace';
  ctx.fillText('1=1000棵  2=5000棵  3=10000棵  Tab=交换左右  R=重播种', 16, 596);
}`
  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>按 3 上到一万棵：</b>左管线（逐个画）的毫秒数飞起、右管线纹丝不动——同一份数据、同一种草，差的全是提交方式。</li>
  <li><b>Tab 交换左右：</b>毫秒数跟着管线走而不是跟着半边画布走——排除「恰好画在左边」的一切侥幸。</li>
  <li><b>对比 1000 与 10000（1→3）：</b>批量柱几乎水平，逐个柱线性上扬——instancing 把 O(N) 次提交摊成了 O(1)。</li>
  <li><b>看风摆：</b>两边草浪同步起伏——批量路线的风摆照样逐实例相位不同：实例数据变了，批次没散。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：MultiMesh——Godot 的 instancing 本尊',
    files: [
      { path: 'servers/rendering/renderer_rd/storage_rd/mesh_storage.h', note: 'MultiMesh 的数据结构：一份几何 + N 份实例 transform/自定义数据缓冲的定义处。建议搜索：multimesh、instance_buffer。' },
      { path: 'servers/rendering/renderer_rd/storage_rd/mesh_storage.cpp', note: 'multimesh_allocate_data 一次分配 N 份实例槽位，multimesh_instance_set_transform 只写自己那份——「改实例不拆批」的落点。建议搜索：multimesh_allocate_data、multimesh_instance_set_transform。' },
      { path: 'servers/rendering/rendering_server.h', note: 'multimesh_create 等命令式 RID API：节点层一行代码背后是服务层的实例缓冲管理。建议搜索：multimesh_create、multimesh_set_mesh。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>instancing 不是「画得快」，是「提交得少」：几何存一份，实例数据整块走属性流，draw call 从 N 塌缩到常数。风摆动画靠改实例缓冲而非拆批次——这是它区别于「合并网格」的关键。</p>
<ul>
  <li><b>数据怎么流动？</b>实例缓冲（位置/相位/颜色）→一次批量提交→GPU 循环画同一份几何；风摆只改缓冲或全在 shader 内算。</li>
  <li><b>所有权归谁？</b>几何归 MultiMesh 一份所有，实例槽位各归各的 offset；CPU 端只写自己的槽位，批次对所有实例一视同仁。</li>
  <li><b>什么时候发生？</b>实例缓冲在数据变化时上传（本课每帧都在上传相位，GPU 粒子/植被引擎会把这一步也搬到显存）；提交每帧一次，与实例数无关。</li>
</ul>`
  }
  ]
};
