// L5.1A · 工业级碰撞检测：broadphase 谱系、GJK 与玩法机制
export default {
  id: 'L5.1A',
  title: '工业级碰撞检测：broadphase 谱系、GJK 与玩法机制',
  est: '2.5 小时',
  coreQuestions: [
    '均匀网格只是 broadphase 的入门——四叉树、动态 BVH、扫掠剪除各在什么场合称王？时间相干性白送的性能你吃到了吗？',
    '两形状相交 ⇔ 原点落在 Minkowski 差里——GJK 为什么成了现代引擎窄相的通用语？',
    '凹形、百万三角的大地形怎么过 narrowphase？midphase 和凸分解各补哪一刀？',
    '层掩码、触发器、单向平台、hitbox/hurtbox——现实游戏的碰撞机制都长在管线的哪一层？'
  ],
  sections: [
    {
      type: 'text',
      title: '从一节课到一条管线：碰撞不是 if，是流水线',
      html: `<p>L5.1 用 40 个球回答了「谁和谁可能相撞」——但那只是把管线第一环单独拿出来看。真实引擎里，碰撞从来不是一个 <code>if</code>，而是一条每帧都要走完的流水线：</p>
<pre>broadphase 粗筛   →   narrowphase 细查   →   接触生成      →   求解响应       →   事件派发
(网格/BVH/SAP…)      (圆/SAT/GJK…)        (法线/流形/深度)    (冲量/位置修正)    (body_entered)
   L5.1             本课 §2–§3              A2 专题           L5.2 / A3       L5.3 的窗口</pre>
<p>再往上还有一层<b>玩法机制</b>——层掩码过滤、触发器、单向平台——它们不是某个算法，而是长在管线缝隙里的规则（§4）。本课把整张图铺开。你只需要带着 L5.1 那个直觉进来：<b>碰撞检测的一切设计，都在回答「如何不去算那 99% 不必算的东西」，以及「真要算时用哪把刀」</b>。</p>`
    },
    {
      type: 'text',
      title: 'broadphase 谱系：网格之外的五个家族',
      html: `<p>网格在 L5.1 的球海里表现完美，但三种真实场景它会把持不住：</p>
<ul>
<li><b>尺寸悬殊</b>：一颗 2px 的子弹和一艘 2000px 的母舰同场——格子按小的切，母舰跨几百格重复登记；按大的切，一格塞进上千个同伙。L5.1 结尾留的那个问题，答案在这。</li>
<li><b>密度不均</b>：开放世界 99% 的格子是空的，1% 的格子里正打着一场大战。</li>
<li><b>静态巨物</b>：关卡里几十万面墙全是静止的，每帧重新登记纯属浪费。</li>
</ul>
<table>
  <tr><th>家族</th><th>一句话思路</th><th>强项</th><th>软肋</th><th>谁在用</th></tr>
  <tr><td>均匀网格</td><td>等大格子登记-查询</td><td>O(1) 增删，实现最简</td><td>尺寸/密度敏感，参数定生死</td><td>粒子模拟、tile 世界（L5.1 本尊）</td></tr>
  <tr><td>层次网格 / 空间哈希</td><td>粗细两层格子，或 hash(格坐标) 进桶</td><td>尺寸悬殊时各层自配</td><td>多一层参数，调参地狱</td><td>大型 MMO、PhysX 的老 grid</td></tr>
  <tr><td>四叉树 / 八叉树</td><td>空间递归对半，空处不展开</td><td>自适应密度，大世界友好</td><td>跨界物体重挂、增删要再平衡</td><td>Jolt 的 broadphase（四叉树）</td></tr>
  <tr><td>动态 BVH</td><td>物体套盒、盒套盒，挪动走 refit 不重建</td><td>不依赖均匀性，增量更新便宜</td><td>实现复杂，查询要递归</td><td>Godot 内置 2D/3D、Box2D、Bullet</td></tr>
  <tr><td>扫掠剪除 SAP</td><td>轴投影成区间，排序后「区间重叠即候选」</td><td>吃相干性红利，近乎 O(n)</td><td>单轴投影有假候选（x 近 y 远）</td><td>Bullet 可选、大量自研引擎</td></tr>
</table>
<p>注意最右列的分化：<b>物理引擎几乎全倒向了「树」</b>。Godot 内置引擎 2D/3D 的 broadphase 都是一棵 BVH（L5.1 源码走读卖的那个关子在这兑现）；Box2D 的 dynamic AABB tree、Bullet 的 btDbvt 同源；Jolt 选四叉树还加了一层狠活——<b>broadphase layers</b>：静态世界与动态物体分家、按层建查询，配对在树这一层就过滤掉大半，连候选都不生成。</p>
<p>而 SAP 独享一张王牌：<b>时间相干性（temporal coherence）</b>。物体一帧只挪一点，上一帧的排序这一帧几乎不用动——插入排序 O(n + k)，k 是交换次数，通常个位数。这是物理引擎最大的隐藏红利：<b>静止的世界里，一切增量算法都在白吃相干性</b>。下面现场称一称它值多少。</p>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'sap',
      title: '实验：扫掠剪除与时间相干性——「几乎有序」就是性能',
      height: 560,
      code: `// 实验：broadphase 三国杀——暴力 O(n²) / 空间网格 / 扫掠剪除 SAP
// M 切模式(0暴力 1网格 2SAP)   G 网格线   V 底部X轴投影条   点击加球   K 重置
// 三种算法每帧都各自数一遍候选对（不管模式是谁），模式只决定谁说了算（标黄）
// 看点一：SAP 的候选对为何少；看点二：SAP 每帧「交换次数」为何几乎不涨——时间相干性

engine.run({
  setup: function (state) {
    state.cell = 80;
    state.mode = 2;                 // 0 暴力 1 网格 2 SAP
    state.showGrid = true;
    state.showStrip = true;
    state.balls = [];
    state.order = [];               // SAP 的有序表：按 minX 排序的球下标
    for (var i = 0; i < 40; i++) addBall(state);
  },

  update: function (state, dt, input) {
    if (input.pressed('KeyM')) state.mode = (state.mode + 1) % 3;
    if (input.pressed('KeyG')) state.showGrid = !state.showGrid;
    if (input.pressed('KeyV')) state.showStrip = !state.showStrip;
    if (input.pressed('KeyK')) { state.balls = []; state.order = []; for (var q = 0; q < 40; q++) addBall(state); }
    if (input.mouse.clicked && state.balls.length < 160) addBall(state, input.mouse.x, input.mouse.y);

    var balls = state.balls, i, b;
    var floorH = engine.H - 120;    // 底部留给投影条
    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      b.x += b.vx * dt;  b.y += b.vy * dt;
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); }
      if (b.x > engine.W - b.r) { b.x = engine.W - b.r; b.vx = -Math.abs(b.vx); }
      if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy); }
      if (b.y > floorH - b.r) { b.y = floorH - b.r; b.vy = -Math.abs(b.vy); }
      b.minx = b.x - b.r;  b.maxx = b.x + b.r;   // AABB 在 X 轴上的投影区间
      b.hit = false;  b.cand = false;
    }
    state.overlaps = 0;

    // —— ① 暴力：所有配对都查 ——
    state.naiveCount = 0;
    for (i = 0; i < balls.length; i++)
      for (var j = i + 1; j < balls.length; j++) {
        state.naiveCount++;
        if (state.mode === 0 && overlap(balls[i], balls[j])) mark(state, balls[i], balls[j]);
      }

    // —— ② 空间网格：同格 + 右/下三邻格（同 L5.1，防重复计对） ——
    state.gridCount = 0;
    state.maxCell = 0;
    var grid = {};
    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      var key = Math.floor(b.x / state.cell) + ',' + Math.floor(b.y / state.cell);
      if (!grid[key]) grid[key] = [];
      grid[key].push(b);
      if (grid[key].length > state.maxCell) state.maxCell = grid[key].length;
    }
    var offs = [[1, 0], [-1, 1], [0, 1], [1, 1]];
    for (var k in grid) {
      var p = k.split(',');
      var cx = +p[0], cy = +p[1];
      var cellBalls = grid[k], m, n;
      for (m = 0; m < cellBalls.length; m++)
        for (n = m + 1; n < cellBalls.length; n++) {
          state.gridCount++;
          if (state.mode === 1 && overlap(cellBalls[m], cellBalls[n])) mark(state, cellBalls[m], cellBalls[n]);
        }
      for (var o = 0; o < 4; o++) {
        var others = grid[(cx + offs[o][0]) + ',' + (cy + offs[o][1])];
        if (!others) continue;
        for (m = 0; m < cellBalls.length; m++)
          for (n = 0; n < others.length; n++) {
            state.gridCount++;
            if (state.mode === 1 && overlap(cellBalls[m], others[n])) mark(state, cellBalls[m], others[n]);
          }
      }
    }

    // —— ③ 扫掠剪除 SAP：插入排序维护 minX 有序（吃相干性）+ 区间重叠扫描 ——
    var order = state.order;
    var swaps = 0;
    for (i = 1; i < order.length; i++) {
      var oi = order[i], kv = balls[oi].minx, w = i - 1;
      while (w >= 0 && balls[order[w]].minx > kv) { order[w + 1] = order[w]; w--; swaps++; }
      order[w + 1] = oi;
    }
    state.swaps = swaps;
    state.sapCount = 0;
    for (i = 0; i < order.length; i++) {
      var bi = balls[order[i]];
      // 排好序后只需向后扫到第一个不重叠的区间为止——这就是 SAP 的全部
      for (var j2 = i + 1; j2 < order.length && balls[order[j2]].minx <= bi.maxx; j2++) {
        state.sapCount++;
        if (state.mode === 2) {
          bi.cand = true;  balls[order[j2]].cand = true;
          if (overlap(bi, balls[order[j2]])) mark(state, bi, balls[order[j2]]);
        }
      }
    }
  },

  draw: function (state, ctx) {
    var balls = state.balls;
    var floorH = engine.H - 120;
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    if (state.showGrid && state.mode === 1) {
      ctx.strokeStyle = 'rgba(77,143,214,0.16)';
      ctx.beginPath();
      for (var gx = state.cell; gx < engine.W; gx += state.cell) { ctx.moveTo(gx, 0); ctx.lineTo(gx, floorH); }
      for (var gy = state.cell; gy < floorH; gy += state.cell) { ctx.moveTo(0, gy); ctx.lineTo(engine.W, gy); }
      ctx.stroke();
    }
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = 'hsl(' + b.hue + ', 70%, 55%)';
      ctx.fill();
      if (b.hit) { ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1; }
    }

    // 底部投影条：每球一根 [x−r, x+r] 区间，按 minX 排成楼梯
    if (state.showStrip) {
      var top = floorH + 16, stripH = engine.H - top - 14;
      var n = balls.length, rowH = stripH / Math.max(1, n);
      ctx.strokeStyle = '#22304a';
      ctx.beginPath(); ctx.moveTo(0, top - 3); ctx.lineTo(engine.W, top - 3); ctx.stroke();
      for (var r = 0; r < n; r++) {
        var sb = balls[state.order[r]];
        var y = top + r * rowH, hh = Math.max(1, rowH - 1);
        ctx.fillStyle = 'hsl(' + sb.hue + ', 50%, 38%)';
        ctx.fillRect(sb.minx, y, sb.maxx - sb.minx, hh);
        if (state.mode === 2 && sb.cand) {
          ctx.strokeStyle = '#fbbf24';
          ctx.strokeRect(sb.minx, y, sb.maxx - sb.minx, hh);
        }
      }
      ctx.fillStyle = '#7d93b3';
      ctx.font = '11px monospace';
      ctx.fillText('X 轴投影条：按 minX 排序后的区间楼梯——横向重叠的相邻条 = SAP 交出的候选(黄框)', 12, engine.H - 2);
    }

    // HUD
    var names = ['暴力 O(n²)', '空间网格', '扫掠剪除 SAP'];
    var fullSort = Math.round(balls.length * Math.log(Math.max(2, balls.length)) / Math.LN2);
    ctx.fillStyle = '#9db4d0';
    ctx.font = '13px monospace';
    ctx.fillText('候选对 → 暴力 ' + state.naiveCount + ' / 网格 ' + state.gridCount + ' (最挤一格 ' + state.maxCell + ' 球) / SAP ' + state.sapCount + ' · 真重叠 ' + state.overlaps, 12, 22);
    ctx.fillText('模式 ' + state.mode + ':' + names[state.mode] + ' · M 切换 · G 网格线 · V 投影条 · 点击加球 · K 重置', 12, 40);
    if (state.mode === 2) {
      ctx.fillStyle = '#34d399';
      ctx.fillText('相干性账本：本帧插入排序只交换 ' + state.swaps + ' 次——若每帧从头快排约 ' + fullSort + ' 次比较', 12, 58);
    } else {
      ctx.fillStyle = '#7d93b3';
      ctx.fillText('按 M 切到 SAP，盯住「交换次数」一栏——上一帧的顺序这一帧几乎不用动', 12, 58);
    }
  }
});

function addBall(state, x, y) {
  state.balls.push(makeBall(x, y));
  state.order.push(state.balls.length - 1);
}
function makeBall(x, y) {
  return {
    x: (x !== undefined) ? x : 30 + Math.random() * (engine.W - 60),
    y: (y !== undefined) ? y : 30 + Math.random() * (engine.H - 180),
    vx: (Math.random() - 0.5) * 240,
    vy: (Math.random() - 0.5) * 240,
    r: 10 + Math.random() * 12,
    hue: Math.floor(Math.random() * 360),
    hit: false, cand: false
  };
}
function overlap(a, b) {
  var dx = a.x - b.x, dy = a.y - b.y, r = a.r + b.r;
  return dx * dx + dy * dy < r * r;
}
function mark(state, a, b) { a.hit = true; b.hit = true; state.overlaps++; }
`
    },
    {
      type: 'text',
      title: '试一试',
      html: `<ul>
<li><b>默认就在 SAP 模式：</b>候选对往往不到暴力的 1/5。连续点球加到 120+，盯绿色那行「交换次数」——还是个位数。这就是相干性：从头快排一次要 ~n·log₂n 次比较，而相干的世界每帧只还几次利息。</li>
<li><b>按 V 开底部投影条：</b>每个球是一根横条 [x−r, x+r]，按 minX 排成楼梯。横向重叠的相邻条 = SAP 交出的候选（黄框）。楼梯左端永远整齐——排序被「增量维护」了。</li>
<li><b>故意制造假候选：</b>把球都点在画面最上与最下两条带里（x 接近、y 很远），看 SAP 候选数虚高——单轴投影的天然软肋。真实引擎会选「方差最大」的轴，或干脆上树。</li>
<li><b>按 M 回网格模式对比：</b>L5.1 的结论依然成立——没有银弹，只有适配。网格赢在增删 O(1)，SAP 赢在相干性，树赢在不挑场景。</li>
</ul>`
    },
    {
      type: 'text',
      title: 'narrowphase 谱系：SAT、GJK 与 midphase',
      html: `<p>broadphase 只说「可能有戏」，narrowphase 要交出精确答案：<b>碰没碰、法线朝哪、穿多深、接触点在哪几个</b>。刀要按形状挑：</p>
<table>
  <tr><th>形状对</th><th>武器</th><th>成本</th><th>备注</th></tr>
  <tr><td>圆 / AABB / 胶囊</td><td>距离公式直接算</td><td>常数</td><td>L5.1 的 dx²+dy² &lt; r² 就是其中最便宜的一把</td></tr>
  <tr><td>两个凸多边形</td><td>SAT（分离轴定理）</td><td>O(顶点数)</td><td>逐轴投影找缝隙；再裁剪出接触流形——A2 的主菜</td></tr>
  <tr><td>任意两个凸体</td><td>GJK（+ EPA 求深度）</td><td>迭代，通常几轮收敛</td><td>现代引擎窄相的通用语，下面实验手走一遍</td></tr>
  <tr><td>凹形 / 大三角网格</td><td>midphase：形状内部再套 BVH 先筛三角形，再逐三角形上 SAT/GJK</td><td>三角形数 × 查询</td><td>Godot 的 ConcavePolygonShape 只给静态体——它太慢，动不起</td></tr>
</table>
<p><b>GJK 为什么成了通用语？</b>它证明了一个惊人的等价：<b>A 与 B 相交 ⇔ 原点落在 Minkowski 差 A⊖B = { a − b | a∈A, b∈B } 里</b>。MD 是两个形状「互相碾过」扫出的所有相对位置——原点在里面，就存在一组 a、b 让 a = b，即相交。而 GJK 的魔法在于<b>根本不用算出整个 MD</b>：它只需要支撑函数</p>
<pre>support(d) = (A 上沿方向 d 最远的点) − (B 上沿方向 −d 最远的点)</pre>
<p>任何形状只要能回答「沿 d 你最远的点是谁」，就能参与碰撞：<b>凸包、胶囊、凸多面体，一套代码通吃，2D/3D 同构，数值稳健</b>。GJK 的迭代就是拿支撑点喂出一个不断逼近原点的单纯形（点 → 线段 → 三角形/四面体）：原点被包住 = 碰撞；新支撑点越不过原点 = 分离。EPA 负责追问「穿多深」。</p>
<p>组合拳也在这一层：<b>compound shape</b>（一个身体挂多个简单形状）覆盖 99% 的角色与载具；真凹的要么<b>凸分解</b>（VHACD 切成十几块凸体），要么老实当静态 trimesh 吃 midphase。Godot 2D 模块里 SAT 与 GJK 两套求解器<b>并存、按形状对挑刀</b>——刀库比一招鲜健康得多。</p>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'gjk',
      title: '实验：亲手走一遍 GJK——原点、Minkowski 差与单纯形',
      height: 560,
      code: `// 实验：亲手走一遍 GJK——「两凸形相交 ⇔ 原点落在 Minkowski 差里」
// 拖动=移动多边形 A   空格=单步一次迭代   F=自动连步   T=让 B 慢转   R=重置迭代
// 左图：世界中的 A(蓝)与 B(紫)，青点=当前方向上的支撑顶点
// 右图：Minkowski 差(黄) + 当前单纯形(红) + 查询方向(青箭头) + 原点(白十字)
// 底部对账：GJK 的结论每帧拿「原点是否真在 MD 内」实测验证——算法可以优雅，结论必须对账

engine.run({
  setup: function (state) {
    state.A = makePoly(220, 200, 64, 6, 0.35, true);    // 六边形
    state.B = makePoly(470, 240, 52, 4, 0.785, false);  // 不规则四边形
    state.spin = false;
    state.auto = false;
    state.drag = false;
    state.autoT = 0;
    resetGJK(state);
  },

  update: function (state, dt, input) {
    if (input.pressed('KeyR')) { resetGJK(state); state.msg = '已重置：单纯形清空，方向回到 B中心−A中心'; }
    if (input.pressed('KeyT')) { state.spin = !state.spin; resetGJK(state); }
    if (input.pressed('KeyF')) state.auto = !state.auto;

    if (state.spin) { state.B.rot += dt * 0.4; syncPoly(state.B); resetGJK(state); }

    if (input.mouse.down) {
      if (!state.drag) { state.drag = true; state.gx = state.A.cx - input.mouse.x; state.gy = state.A.cy - input.mouse.y; }
      state.A.cx = input.mouse.x + state.gx;
      state.A.cy = input.mouse.y + state.gy;
      syncPoly(state.A);
      resetGJK(state);
    } else state.drag = false;

    if (state.auto && !state.done) {
      state.autoT += dt;
      if (state.autoT > 0.55) { state.autoT = 0; gjkStep(state); }
    }
  },

  draw: function (state, ctx) {
    var W = engine.W, H = engine.H, i, j;
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, W, H);
    var mainW = Math.min(W * 0.56, 460);

    // —— 左：世界 ——
    drawPoly(ctx, state.A, 'rgba(96,165,250,0.22)', '#60a5fa');
    drawPoly(ctx, state.B, 'rgba(167,139,250,0.22)', '#a78bfa');
    if (!state.done && state.simplex.length < 3) {
      dot(ctx, supportPoly(state.A, state.dir), '#22d3ee');
      dot(ctx, supportPoly(state.B, neg(state.dir)), '#22d3ee');
    }
    if (state.done) {
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = state.hit ? '#f87171' : '#34d399';
      drawPolyPath(ctx, state.A); ctx.stroke();
      drawPolyPath(ctx, state.B); ctx.stroke();
      ctx.lineWidth = 1;
    }

    // —— 右：Minkowski 差面板 ——
    var px = mainW + 26, pw = W - px - 14, py = 34, ph = H - 140;
    var diffs = [];
    for (i = 0; i < state.A.pts.length; i++)
      for (j = 0; j < state.B.pts.length; j++)
        diffs.push(sub(state.A.pts[i], state.B.pts[j]));
    var hullP = convexHull(diffs);

    // 视口：把 hull 与原点一起包住，居中缩放
    var minx = 0, maxx = 0, miny = 0, maxy = 0;
    for (i = 0; i < hullP.length; i++) {
      if (hullP[i].x < minx) minx = hullP[i].x;
      if (hullP[i].x > maxx) maxx = hullP[i].x;
      if (hullP[i].y < miny) miny = hullP[i].y;
      if (hullP[i].y > maxy) maxy = hullP[i].y;
    }
    var spanX = Math.max(40, maxx - minx), spanY = Math.max(40, maxy - miny);
    var s = Math.min(pw / spanX, ph / spanY) * 0.82;
    var ox = px + pw / 2 - (minx + maxx) / 2 * s;
    var oy = py + ph / 2 - (miny + maxy) / 2 * s;
    function T(p) { return { x: ox + p.x * s, y: oy + p.y * s }; }

    ctx.fillStyle = 'rgba(20,29,46,0.5)';
    ctx.fillRect(px - 12, py - 12, pw + 24, ph + 24);

    ctx.beginPath();
    for (i = 0; i < hullP.length; i++) {
      var t = T(hullP[i]);
      if (i === 0) ctx.moveTo(t.x, t.y); else ctx.lineTo(t.x, t.y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(251,191,36,0.13)';
    ctx.fill();
    ctx.strokeStyle = '#fbbf24';
    ctx.stroke();

    var o0 = T({ x: 0, y: 0 });
    for (i = 0; i < state.trail.length; i++) {
      var tp = T(state.trail[i].p);
      arrow(ctx, o0.x, o0.y, tp.x, tp.y, 'rgba(34,211,238,0.28)');
    }
    if (!state.done) {
      var d0 = T({ x: state.dir.x * 60, y: state.dir.y * 60 });
      arrow(ctx, o0.x, o0.y, d0.x, d0.y, '#22d3ee');
    }
    crossMark(ctx, o0.x, o0.y, '#e2e8f0');

    ctx.fillStyle = '#f87171';
    for (i = 0; i < state.simplex.length; i++) {
      var sp = T(state.simplex[i]);
      ctx.fillRect(sp.x - 3, sp.y - 3, 6, 6);
    }
    if (state.simplex.length >= 2) {
      ctx.strokeStyle = '#f87171';
      ctx.beginPath();
      for (i = 0; i < state.simplex.length; i++) {
        var q = T(state.simplex[i]);
        if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
      }
      if (state.simplex.length === 3) ctx.closePath();
      ctx.stroke();
    }
    ctx.fillStyle = '#ffd479';
    ctx.font = '12px monospace';
    ctx.fillText('Minkowski 差 A⊖B = {a − b}', px - 8, py - 20);

    // —— HUD ——
    if (state.done && state.hit) {
      ctx.fillStyle = '#f87171'; ctx.font = 'bold 15px monospace';
      ctx.fillText('● 碰撞：原点被单纯形包住 ⇔ 原点在 Minkowski 差内', 12, 24);
    } else if (state.done && !state.hit) {
      ctx.fillStyle = '#34d399'; ctx.font = 'bold 15px monospace';
      ctx.fillText('● 分离：支撑点够不到原点 ⇔ MD 不含原点', 12, 24);
    }
    ctx.fillStyle = '#9db4d0'; ctx.font = '12px monospace';
    ctx.fillText('拖动A · 空格单步 · F自动连步 · T让B慢转 · R重置', 12, H - 64);
    var inside = pointInHull(hullP, { x: 0, y: 0 });
    var verdict = state.done ? (state.hit ? '碰撞' : '分离') : '迭代中(' + state.simplex.length + '点)';
    var matchTxt = state.done ? (state.hit === inside ? '✓ 一致' : '✗ 有 bug!') : '—';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText('GJK 第 ' + state.iter + ' 步 · 判定: ' + verdict + ' · 对账(原点实测在MD内=' + (inside ? '是' : '否') + '): ' + matchTxt, 12, H - 44);
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(state.msg, 12, H - 24);
  }
});

// ---------- GJK 本体（2D 版：单纯形最多 3 个点） ----------

function resetGJK(state) {
  state.simplex = [];        // 单纯形：MD 上的点，最多长到 3
  state.done = false;
  state.hit = false;
  state.iter = 0;
  state.trail = [];
  state.dir = norm(sub(polyCenter(state.B), polyCenter(state.A)));
  state.msg = '按空格走第一步：方向 d = normalize(B中心 − A中心)';
}

function gjkStep(state) {
  if (state.done) return;
  state.iter++;
  var p = supportMD(state, state.dir);
  state.trail.push(p);
  if (p.x * state.dir.x + p.y * state.dir.y < 0) {
    state.done = true;
    state.msg = '第 ' + state.iter + ' 步：新支撑点没越过原点 → MD 够不到原点 → 分离（提前终止）';
    return;
  }
  for (var q = 0; q < state.simplex.length; q++) {
    if (state.simplex[q].x === p.x && state.simplex[q].y === p.y) {
      state.done = true;
      state.msg = '第 ' + state.iter + ' 步：支撑点原地踏步 → 无法再逼近原点 → 分离';
      return;
    }
  }
  state.simplex.push(p);
  if (state.simplex.length === 1) {
    state.dir = neg(state.dir);
    state.msg = '第 ' + state.iter + ' 步：拿到第 1 个支撑点，反向再找一个';
  } else if (state.simplex.length === 2) {
    lineCase(state);
  } else {
    triCase(state);
  }
  if (state.iter > 24) { state.done = true; state.msg = '迭代上限——数值退化（真实引擎会在此兜底）；按 R 重来'; }
}

function lineCase(state) {
  var a = state.simplex[1], b = state.simplex[0];
  state.dir = perpToward(sub(b, a), neg(a));
  state.msg = '第 ' + state.iter + ' 步：线段情形——新方向 = 垂直于 AB、指向原点一侧';
}

function triCase(state) {
  var a = state.simplex[2], b = state.simplex[1], c = state.simplex[0];
  var ao = neg(a), ab = sub(b, a), ac = sub(c, a);
  if (cross(ab, ao) * cross(ab, sub(c, a)) < 0) {
    state.simplex = [b, a];
    state.dir = perpToward(ab, ao);
    state.msg = '第 ' + state.iter + ' 步：原点在 AB 边外侧 → 丢掉 C，缩回线段继续';
    return;
  }
  if (cross(ac, ao) * cross(ac, sub(b, a)) < 0) {
    state.simplex = [c, a];
    state.dir = perpToward(ac, ao);
    state.msg = '第 ' + state.iter + ' 步：原点在 AC 边外侧 → 丢掉 B，缩回线段继续';
    return;
  }
  state.done = true;
  state.hit = true;
  state.msg = '第 ' + state.iter + ' 步：原点被三角形包住 → 碰撞！追问「穿多深」是 EPA 的活（A2 专题）';
}

function supportMD(state, d) {
  // MD 的支撑点 = A 上沿 d 最远的点 − B 上沿 −d 最远的点（不用算出整个 MD！）
  return sub(supportPoly(state.A, d), supportPoly(state.B, neg(d)));
}
function supportPoly(poly, d) {
  var best = poly.pts[0], bd = best.x * d.x + best.y * d.y;
  for (var i = 1; i < poly.pts.length; i++) {
    var v = poly.pts[i], dd = v.x * d.x + v.y * d.y;
    if (dd > bd) { bd = dd; best = v; }
  }
  return best;
}

// ---------- 几何小工具 ----------

function makePoly(cx, cy, r, n, phase, regular) {
  var base = [];
  var rr4 = [1.0, 0.8, 1.05, 0.85];
  for (var i = 0; i < n; i++) {
    base.push({ ang: phase + i / n * Math.PI * 2, rr: regular ? r : r * rr4[i % 4] });
  }
  var p = { cx: cx, cy: cy, rot: 0, base: base, pts: [] };
  syncPoly(p);
  return p;
}
function syncPoly(p) {
  p.pts = [];
  for (var i = 0; i < p.base.length; i++) {
    p.pts.push({ x: p.cx + Math.cos(p.rot + p.base[i].ang) * p.base[i].rr,
                 y: p.cy + Math.sin(p.rot + p.base[i].ang) * p.base[i].rr });
  }
}
function polyCenter(p) { return { x: p.cx, y: p.cy }; }
function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
function neg(a) { return { x: -a.x, y: -a.y }; }
function norm(a) {
  var l = Math.sqrt(a.x * a.x + a.y * a.y);
  if (l < 0.000001) return { x: 1, y: 0 };
  return { x: a.x / l, y: a.y / l };
}
function cross(a, b) { return a.x * b.y - a.y * b.x; }
function perpToward(ab, ao) {
  var n = { x: -ab.y, y: ab.x };
  if (n.x * ao.x + n.y * ao.y < 0) n = neg(n);
  return n;
}
function convexHull(pts) {   // Andrew 单调链
  var p = pts.slice().sort(function (a, b) { return a.x - b.x || a.y - b.y; });
  var h = [], i;
  for (i = 0; i < p.length; i++) {
    while (h.length >= 2 && cross(sub(h[h.length - 1], h[h.length - 2]), sub(p[i], h[h.length - 2])) <= 0) h.pop();
    h.push(p[i]);
  }
  var lower = h.length + 1;
  for (i = p.length - 2; i >= 0; i--) {
    while (h.length >= lower && cross(sub(h[h.length - 1], h[h.length - 2]), sub(p[i], h[h.length - 2])) <= 0) h.pop();
    h.push(p[i]);
  }
  h.pop();
  return h;
}
function pointInHull(h, p) {
  for (var i = 0; i < h.length; i++) {
    var a = h[i], b = h[(i + 1) % h.length];
    if (cross(sub(b, a), sub(p, a)) < -0.01) return false;
  }
  return true;
}
function drawPoly(ctx, poly, fill, stroke) {
  drawPolyPath(ctx, poly);
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = stroke; ctx.stroke();
}
function drawPolyPath(ctx, poly) {
  ctx.beginPath();
  for (var i = 0; i < poly.pts.length; i++) {
    if (i === 0) ctx.moveTo(poly.pts[i].x, poly.pts[i].y); else ctx.lineTo(poly.pts[i].x, poly.pts[i].y);
  }
  ctx.closePath();
}
function dot(ctx, v, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(v.x, v.y, 4, 0, Math.PI * 2); ctx.fill(); }
function crossMark(ctx, x, y, c) {
  ctx.strokeStyle = c;
  ctx.beginPath();
  ctx.moveTo(x - 6, y); ctx.lineTo(x + 6, y);
  ctx.moveTo(x, y - 6); ctx.lineTo(x, y + 6);
  ctx.stroke();
}
function arrow(ctx, x0, y0, x1, y1, color) {
  ctx.strokeStyle = color;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  var a = Math.atan2(y1 - y0, x1 - x0);
  ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(x1 - 8 * Math.cos(a - 0.4), y1 - 8 * Math.sin(a - 0.4));
  ctx.moveTo(x1, y1); ctx.lineTo(x1 - 8 * Math.cos(a + 0.4), y1 - 8 * Math.sin(a + 0.4));
  ctx.stroke();
}
`
    },
    {
      type: 'text',
      title: '试一试',
      html: `<ul>
<li><b>拖 A 逼近 B，空格单步：</b>第 1 步方向 = B中心−A中心；第 2 步线段情形；第 3 步三角形包住原点 = 碰撞。右侧黄色多边形是 Minkowski 差——<b>原点进了它就是进了碰撞区</b>，而左边两个图形只是它的「投影来源」。</li>
<li><b>拖 A 远离后再走一遍：</b>某一步新支撑点「没越过原点」，GJK 提前终止——<b>分离比碰撞判得更快</b>，这正是引擎把 broadphase 放在前面的又一个理由：大多数对连 GJK 都不用进。</li>
<li><b>看底部对账一行：</b>GJK 的结论每帧拿「原点是否真在 MD 内」实测验证。算法可以优雅，结论必须对账——这也是给任何「聪明算法」上保险的方式。</li>
<li><b>按 T 让 B 慢转、F 自动连步：</b>看单纯形每帧从零重新长出来。真实引擎会缓存上一帧的单纯形做暖启动——又见相干性。</li>
</ul>`
    },
    {
      type: 'text',
      title: '玩法机制层：现实游戏每天在用的碰撞处理',
      html: `<p>算法之上，现实游戏每天在用的「碰撞处理」其实是下面这张清单。注意它们的共同点：<b>都不是新算法，而是在管线的某道缝里插规则</b>：</p>
<table>
  <tr><th>机制</th><th>插在管线的哪一刀</th><th>Godot 里的脸</th><th>典型用法</th></tr>
  <tr><td>层 / 掩码过滤</td><td>配对生成时（broadphase 之后、narrowphase 之前）；Jolt 干脆上提到 broadphase 层</td><td><code>collision_layer</code>（我是谁）/ <code>collision_mask</code>（我碰谁）</td><td>玩家子弹不伤玩家；敌人尸体只与地面碰撞</td></tr>
  <tr><td>碰撞例外</td><td>配对生成的黑名单</td><td><code>add_collision_exception_with</code></td><td>举起的箱子不把自己挤下楼</td></tr>
  <tr><td>触发器 / Sensor</td><td>检测照走、响应阉割：只记录不求解</td><td>Area2D/3D、<code>body_entered</code></td><td>拾取圈、毒圈、过场、hitbox</td></tr>
  <tr><td>单向碰撞</td><td>接触生成时按法线方向丢弃</td><td><code>one_way_collision</code>（+ margin）</td><td>平台跳跃：跳上去、落下来、从下面穿过去</td></tr>
  <tr><td>接触上报</td><td>帧末窗口派发（L5.3 五行里的 ②）</td><td><code>contact_monitor</code> + <code>max_contacts_reported</code></td><td>落地音效、压敏机关。默认关——每帧收集接触是有账的</td></tr>
  <tr><td>空间查询</td><td>检测管线的「对外接口」复用</td><td><code>intersect_ray / intersect_shape / cast_motion</code></td><td>枪线、技能范围圈、移动预检</td></tr>
  <tr><td>休眠与岛</td><td>求解前按接触图分 island，静者休眠</td><td><code>sleeping</code></td><td>堆积如山的箱子静止后一帧都不白算（A3 深入）</td></tr>
</table>
<p>动作游戏还有一条祖传架构：<b>hitbox / hurtbox 分离</b>——攻击判定框（Area）与物理身体（Body）彻底分家，伤害结算与物理求解互不过问。打击感的顿帧与闪白（H2），扣动的正是这套分离扳机。看懂了吗？<b>碰撞检测是基础设施，玩法语义（「这算不算打到」「这算不算踩上」）永远是管线外的一层薄规则</b>——引擎不知道什么是伤害，它只知道两个凸体在 t 时刻以法线 n 相交、深 d。</p>`
    },
    {
      type: 'source',
      title: '源码走读：碰撞管线的工业化现场',
      files: [
        { path: 'modules/godot_physics_2d/godot_broadphase_2d.cpp', note: '内置 2D 引擎的 broadphase 本尊：一棵 BVH。L5.1 结尾问的「球特别大怎么办」——官方答案是压根没用网格。建议搜索：BVH、cull。' },
        { path: 'core/math/bvh_tree.h', note: '物理侧 BVH 的实现层（渲染侧那棵在 core/math/dynamic_bvh.h，L4.3A 走读过）：插入/挪动/refit 与查询模板都在这——「会动的树」的通用底座。建议搜索：BVH_Tree、refit。' },
        { path: 'modules/godot_physics_2d/', note: '窄相刀库的所在：collision_solver_2d 负责按形状对调度，SAT 与 GJK 两套窄相求解器并存，接触生成都挂在这条链上。建议搜索：sat、gjk、solve。' },
        { path: 'modules/godot_physics_2d/godot_body_pair_2d.cpp', note: '玩法机制的实现现场：layer/mask 过滤、碰撞例外表、单向碰撞的方向丢弃全在「配对」这一层——§4 那张表的源码落点。建议搜索：one_way、exception、layer。' },
        { path: 'modules/godot_physics_3d/godot_broadphase_3d.cpp', note: '3D 版同款思路：2D/3D 是两套独立引擎，但 broadphase 共享同一棵树的心智模型。建议搜索：BVH。' },
        { path: 'modules/jolt_physics/', note: '换后端的现场（L5.3 接过）：Godot 的 collision_layer 在这里映射成 Jolt 的 ObjectLayer/BroadPhaseLayer——「过滤上提到 broadphase」不是理论，是 Jolt 的日常。建议搜索：ObjectLayer、BroadPhaseLayer。' }
      ]
    },
    {
      type: 'text',
      title: '小结',
      html: `<p>三个老问题的碰撞版答案。<b>数据怎么流动</b>：每步 broadphase 交出保守候选对（宁滥勿缺）→ narrowphase 按形状挑刀，交出法线/深度/接触点 → 求解器消费（L5.2）→ 事件在帧末窗口派发（L5.3）。<b>所有权归谁</b>：broadphase 结构由 space 持有，物体挪动只提交增量（refit），相干性让增量便宜到近乎免费；接触对由 body_pair 持有并跨步复用——它的别名叫暖启动（A3）。<b>什么时候发生</b>：粗筛与细查在 step 内每帧一次；玩法规则（过滤/触发/单向）钉在配对与接触生成的缝隙里，每帧都过、但便宜到可以忽略。</p>
<p>一句话带走：<b>碰撞是一条「粗筛宁滥勿缺、细查按形选刀、规则长在缝里」的管线，不是一个 if</b>。想继续深挖：A1 看时间维度的漏检（CCD——子弹为什么穿过薄墙），A2 看接触流形与裁剪（两个盒子的接触不止一个点），A3 看求解器怎么把接触清单变成稳定堆叠。</p>`
    }
  ]
}
