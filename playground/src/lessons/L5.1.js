// L5.1 · 碰撞检测：空间网格 vs 暴力 O(n²)
export default {
  id: 'L5.1',
  title: '碰撞检测：空间网格 vs 暴力 O(n²)',
  est: '2 小时',
  coreQuestions: [
    '为什么碰撞检测要分 broadphase / narrowphase 两阶段？',
    '空间网格用「空间换时间」的具体方式是什么？',
    '格子的疏密对性能有什么影响？（工程参数永远有代价）'
  ],
  sections: [
    {
      type: 'text',
      title: '一个问题：40 个球要查多少对？',
      html: `<p>40 个球两两检查 = <b>780 对</b>，还行。1000 个球 = <b>499,500 对</b>，每帧都查就崩了。而真相是：绝大多数球对离得十万八千里，根本不必细查。</p>
<p>于是物理引擎分两阶段：</p>
<ul>
  <li><b>broadphase（粗筛）</b>：用空间结构快速排除「根本不可能相撞」的对——快而粗。</li>
  <li><b>narrowphase（细查）</b>：对疑似相撞的对做精确几何计算——慢而准。</li>
</ul>
<p>最直观的粗筛就是<b>空间网格</b>：把世界切成格子，每个球登记进所在格，只对「同格 + 相邻格」的球做细查。按 N 切换模式，看左上角配对数差多少倍。</p>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'broadphase',
      title: '实验：空间网格 vs 暴力 O(n²)',
      height: 520,
      code: `// 40 个球乱飞，每帧要回答：谁和谁碰上了？
// G：开关网格线   N：切换 空间网格 / 暴力 O(n²)
// 点击画布：加一个球，看左上角「配对检查次数」的变化

engine.run({
  setup: function (state) {
    state.cell = 80;          // 格子边长 ← 试着改成 20 或 200
    state.useGrid = true;
    state.showGrid = true;
    state.balls = [];
    for (var i = 0; i < 40; i++) state.balls.push(makeBall());
  },

  update: function (state, dt, input) {
    if (input.pressed('KeyG')) state.showGrid = !state.showGrid;
    if (input.pressed('KeyN')) state.useGrid = !state.useGrid;
    if (input.mouse.clicked) state.balls.push(makeBall(input.mouse.x, input.mouse.y));

    var balls = state.balls;
    var i, j, b;
    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      b.x += b.vx * dt;  b.y += b.vy * dt;
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); }
      if (b.x > engine.W - b.r) { b.x = engine.W - b.r; b.vx = -Math.abs(b.vx); }
      if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy); }
      if (b.y > engine.H - b.r) { b.y = engine.H - b.r; b.vy = -Math.abs(b.vy); }
      b.hit = false;
    }
    state.overlaps = 0;

    // —— 方式一：暴力，所有配对都查 ——
    state.naiveCount = 0;
    for (i = 0; i < balls.length; i++)
      for (j = i + 1; j < balls.length; j++) {
        state.naiveCount++;
        if (overlap(balls[i], balls[j])) { balls[i].hit = true; balls[j].hit = true; state.overlaps++; }
      }

    // —— 方式二：空间网格，只查同格与右/下三个邻格（避免重复计对） ——
    state.gridCount = 0;
    var grid = {};
    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      var key = Math.floor(b.x / state.cell) + ',' + Math.floor(b.y / state.cell);
      if (!grid[key]) grid[key] = [];
      grid[key].push(b);
    }
    var offs = [[1, 0], [-1, 1], [0, 1], [1, 1]];
    for (var key in grid) {
      var p = key.split(',');
      var cx = +p[0], cy = +p[1];
      var cellBalls = grid[key];
      var m, n;
      for (m = 0; m < cellBalls.length; m++)
        for (n = m + 1; n < cellBalls.length; n++) {
          state.gridCount++;
          if (overlap(cellBalls[m], cellBalls[n])) { cellBalls[m].hit = true; cellBalls[n].hit = true; }
        }
      for (var o = 0; o < 4; o++) {
        var others = grid[(cx + offs[o][0]) + ',' + (cy + offs[o][1])];
        if (!others) continue;
        for (m = 0; m < cellBalls.length; m++)
          for (n = 0; n < others.length; n++) {
            state.gridCount++;
            if (overlap(cellBalls[m], others[n])) { cellBalls[m].hit = true; others[n].hit = true; }
          }
      }
    }
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    if (state.showGrid) {
      ctx.strokeStyle = 'rgba(77,143,214,0.16)';
      ctx.beginPath();
      for (var gx = state.cell; gx < engine.W; gx += state.cell) { ctx.moveTo(gx, 0); ctx.lineTo(gx, engine.H); }
      for (var gy = state.cell; gy < engine.H; gy += state.cell) { ctx.moveTo(0, gy); ctx.lineTo(engine.W, gy); }
      ctx.stroke();
    }
    for (var i = 0; i < state.balls.length; i++) {
      var b = state.balls[i];
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = 'hsl(' + b.hue + ', 70%, 55%)';
      ctx.fill();
      if (b.hit) {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    }
    ctx.fillStyle = '#9db4d0';
    ctx.font = '13px monospace';
    ctx.fillText('网格检查 ' + state.gridCount + ' 对 / 暴力检查 ' + state.naiveCount + ' 对 / 重叠 ' + state.overlaps, 12, 22);
    ctx.fillText('G 网格线 · N 切换模式（当前 ' + (state.useGrid ? '空间网格' : '暴力') + '）· 点击加球', 12, 40);
  }
});

function makeBall(x, y) {
  return {
    x: (x !== undefined) ? x : 30 + Math.random() * (engine.W - 60),
    y: (y !== undefined) ? y : 30 + Math.random() * (engine.H - 60),
    vx: (Math.random() - 0.5) * 240,
    vy: (Math.random() - 0.5) * 240,
    r: 10 + Math.random() * 12,
    hue: Math.floor(Math.random() * 360),
    hit: false
  };
}

function overlap(a, b) {
  var dx = a.x - b.x, dy = a.y - b.y, r = a.r + b.r;
  return dx * dx + dy * dy < r * r;
}
`
    },
    {
      type: 'text',
      title: '试一试',
      html: `<ul>
  <li>连续点击加到 80 个球：看两种方式的检查数比值拉到多少倍。</li>
  <li>把 <code>state.cell</code> 改成 20（太细）：球跨多格、重复登记，优势缩水；改成 200（太粗）：一格塞太多球，一样退化。<b>经验值：格子边长 ≈ 2~3 倍平均直径</b>——工程参数永远有代价。</li>
  <li>思考：球特别大（横跨很多格）怎么办？——这正是 Godot 2D/3D broadphase 用 <b>BVH（包围盒层级树）</b> 而不是网格的原因之一：树能自适应物体大小与分布。</li>
</ul>`
    },
    {
      type: 'source',
      files: [
        { path: 'modules/godot_physics_2d/', note: 'Godot 2D 物理引擎的实现层（broadphase 用 BVH）。「网格之外的答案」就在这个模块里。' }
      ]
    },
    {
      type: 'text',
      title: '小结',
      html: `<p>broadphase 的本质是<b>用空间结构换计算</b>。这个思想是引擎级通用模式：渲染剔除（视锥/遮挡）、场景管理（四叉树）、粒子系统……全都在回答同一个问题——如何不去计算那 99% 不需要计算的东西。</p>`
    }
  ]
}
