// A3 · 求解器进阶：迭代、暖启动与 island
export default {
  id: 'A3',
  title: '求解器进阶：迭代、暖启动与 island',
  est: '2.5 小时',
  coreQuestions: [
    '一个接触一次就解到「完美」，为什么整摞塔还要翻来覆去迭代很多遍？',
    'warm starting 用上一帧的冲量当这一帧初值，凭什么省出 20 次迭代？代价是什么？',
    'island 拆出去的到底是什么？并行、隔离、休眠各换来了什么？',
    '三个病灶——迭代不足 / 无暖启动 / 无 island——各自的典型病征是什么？'
  ],
  sections: [
    {
      type: 'text',
      title: '从 L5.2 往前推一步：迭代在买什么',
      html: `<p>回到 L5.2：两个球撞上，一个冲量就把它俩沿法线的相对速度归零，「一次解对」。可一摞 10 个盒子叠在地上，是<b> 10 个接触同时互相较劲</b>：把最底下那个盒子的穿透修对了，上面的盒子因此又歪了；回过头修上面，底下又变了。这不是 10 个独立问题，而是一个<b>全局耦合的方程</b>，而且约束还互相<b>欠定、互补</b>——接触只能推、不能拉。</p>
<p>工业界把它变成一个反复「扫」的过程，叫 <b>Sequential Impulse（顺序冲量）</b>，本质上是 <b>Gauss–Seidel 迭代</b>：</p>
<pre>for (iter in 0..N):            // 迭代次数 N
    for 每个接触 c:            // 按固定顺序扫一遍
        看 c 还剩多少相对速度 → 补一个冲量（只满足 c 自己）</pre>
<p>每一遍扫过去，每个接触<b>只把自己的需求满足到局部最小</b>——它一扫完，别的接触又「不满意」了，于是下一遍再来。误差按几何级数衰减：<b>每迭代一次，残差约乘一个折扣</b>。所以「迭代次数」买的不是「更准的公式」，而是「离收敛更近」。</p>
<p><b>为什么这样设计？</b>因为它收敛的过程虽然和真实物理不同，却<b>无条件稳定</b>：迭代越少，塔越「软」越「果冻」，但绝不会像显式欧拉那样一步发散爆炸。正确性可以用「调大迭代」赎回，稳定性却是白送的——对跑在玩家机器上、哪怕丢帧也不许飞天的引擎而言，这是天大的优点。</p>
<table>
  <tr><th>做法</th><th>一次解对？</th><th>代价</th><th>出问题时的样子</th></tr>
  <tr><td>直接解全局方程组（求逆）</td><td>是（一步到位）</td><td>矩阵求逆，又慢又有奇异</td><td>—</td></tr>
  <tr><td>顺序冲量（迭代）</td><td>近似，逐次逼近</td><td>O(N × 接触数)，便宜、可并行</td><td>迭代不足 → 软、抖、塌</td></tr>
</table>`
    },
    {
      type: 'text',
      title: '暖启动：把 20 次迭代存进一个标量',
      html: `<p>顺序冲量的代价是「得扫很多遍才够硬」。但观察一下现实：游戏里的接触几乎<b>每帧都不变</b>——桌上那摞书，这一帧和上一帧承受的支持力没差多少。既然如此，上一帧辛苦迭代二十遍才攒出的冲量，<b>凭什么扔掉、这一帧从头再攒？</b></p>
<p><b>Warm starting（暖启动）</b>的答案：给每个接触留一个<b>累加器</b>，存下它上一帧收敛到的总冲量；新一帧开始时，<b>先把这笔存好的冲量原样施加一遍</b>，再开始当帧的迭代。等于把「上一帧的 20 次迭代」直接当成了这一帧的初值。</p>
<pre>接触 c.impulse:              // 跨帧常驻的累加器
新帧开始：若 warmStart，先施加 c.impulse（当初值）
然后迭代：每次都在 c.impulse 上继续 += jn（而不是从 0 起）</pre>
<p>效果立竿见影：有暖启动，一摞塔一整帧只做 3~5 次迭代就能像 20 次一样硬；<b>关掉暖启动，每一帧都等于「第一次看见这摞塔」</b>，塔会整体下沉、抖动——「20 次迭代」的效果再也存不住了。</p>
<p><b>代价与工程细节：</b>累加器是按接触「身份」索引的，接触一旦消失或换边就得作废重来；接触点滑动了，旧冲量的方向也得跟着转。所以引擎里这个缓存挂在「接触点」而非「物体」上，失配就丢弃——这是「看着简单、做对却烧脑」的典型工程细节。</p>`
    },
    {
      type: 'text',
      title: 'island：接触图的连通域',
      html: `<p>把场景里所有接触画成一张图：每个刚体是一个节点，每对接触是一条边。这张图会断成若干个<b>连通域</b>——彼此之间没有任何接触、也没有任何约束相连的一团团物体。物理引擎管这些连通域叫 <b>island（岛）</b>。</p>
<p>岛的意义来自一个朴素事实：<b>岛内部通过约束耦合，必须一起解；岛与岛之间零耦合，分开解毫不损失精度。</b>于是三样红利一起解锁：</p>
<ul>
  <li><b>并行</b>：不同岛互不干扰，可以丢给不同线程各算各的（L8.1 的 Job System 正好有用武之地）。</li>
  <li><b>隔离</b>：一个岛的抖动不会把迭代「消耗」在另一个岛上；无关物体不再互相拖累。</li>
  <li><b>休眠粒度</b>：睡眠判定的单位是「岛」而不是单个物体——<b>桌上的一摞书，要睡一起睡、要醒一起醒</b>。若混成一个大岛，哪怕远处一个物体轻微颤动，也会让整岛保持清醒、被反复计算。</li>
</ul>
<p><b>为什么这样设计？</b>因为「分开做」在这里不是优化技巧，而是一次<b>无损失分解</b>：约束图的连通性，既是求解的正确边界，也是并行与睡眠的自然边界，一石三鸟。</p>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'stackmatrix',
      title: '实验：堆叠稳定性矩阵（迭代 × 暖启动 × island）',
      height: 600,
      code: `// 堆叠稳定性矩阵：同一摞盒子，三张牌——迭代次数 / 暖启动 / island
// → 左/右：迭代 1~24         ↑/↓：盒数 3~20
// → W：暖启动开关   R：restitution+0.1   B：bias-0.05   S：island 合/分
// → 鼠标按住盒子：推它一把（唤醒所在岛）   空格：重置
// 盯三样：穿透色阶（红=深穿）· 塔顶抖动曲线 · island 着色（不同连通域不同色）

engine.run({
  setup: function (state) {
    state.rng = mulberry32(20240903);          // 自带种子的随机源（只用于初始微扰，保证可复现）
    state.boxW = 44; state.boxH = 16; state.groundY = 320; state.gravity = 900;
    state.slop = 0.5; state.sleepLin = 0.4; state.sleepTime = 0.6;
    state.fixed = 1 / 60; state.acc = 0;
    state.params = { iterations: 10, warmStart: true, rest: 0.0, bias: 0.2, islands: true, n: 8 };
    state.cache = {};        // 接触冲量累加器（暖启动的「记忆」，按接触身份索引）
    state.history = [];      // 塔顶 vy 抖动曲线（环形缓冲）
    state.bodyColor = [];
    state.islands = [];
    state.contacts = [];
    state.islandCount = 1;
    reset(state);
  },

  update: function (state, dt, input) {
    var p = state.params;
    if (input.pressed('ArrowRight')) p.iterations = Math.min(24, p.iterations + 1);
    if (input.pressed('ArrowLeft'))  p.iterations = Math.max(1,  p.iterations - 1);
    if (input.pressed('ArrowUp'))    { p.n = Math.min(20, p.n + 1); reset(state); }
    if (input.pressed('ArrowDown'))  { p.n = Math.max(3,  p.n - 1); reset(state); }
    if (input.pressed('KeyW')) p.warmStart = !p.warmStart;
    if (input.pressed('KeyR')) p.rest = p.rest > 0.85 ? 0 : p.rest + 0.1;
    if (input.pressed('KeyB')) p.bias = Math.max(0, p.bias - 0.05);
    if (input.pressed('KeyS')) p.islands = !p.islands;
    if (input.pressed('Space')) reset(state);

    // 鼠标按住：给最近的盒子一个向上冲量，唤醒它所在的岛
    if (input.mouse.down || input.mouse.clicked) {
      var j = nearestBox(state, input.mouse.x, input.mouse.y);
      if (j >= 0) { var bj = state.boxes[j]; bj.asleep = false; bj.vy -= 300; }
    }

    // 固定步长累积（可变速帧率下保持确定）
    state.acc += dt;
    var guard = 0;
    while (state.acc >= state.fixed && guard < 4) {
      step(state, state.fixed);
      state.acc -= state.fixed;
      guard++;
    }

    var top = state.boxes[p.n - 1];          // 主塔最上面的盒子
    state.history.push(top.vy);
    if (state.history.length > 240) state.history.shift();
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17'; ctx.fillRect(0, 0, engine.W, engine.H);
    var i, k, c, b;

    // 岛着色：每个岛的盒子罩一层淡色底
    for (k = 0; k < state.islands.length; k++) {
      var isl = state.islands[k];
      ctx.fillStyle = isl.color;
      ctx.globalAlpha = 0.06;
      for (i = 0; i < isl.bodies.length; i++) {
        b = state.boxes[isl.bodies[i]];
        ctx.fillRect(b.x - b.w / 2 - 4, b.y - b.h / 2 - 4, b.w + 8, b.h + 8);
      }
      ctx.globalAlpha = 1;
    }

    // 地面
    ctx.fillStyle = '#1c2739'; ctx.fillRect(0, state.groundY, engine.W, engine.H - state.groundY);
    ctx.strokeStyle = '#3b4d6b'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, state.groundY); ctx.lineTo(engine.W, state.groundY); ctx.stroke();

    // 接触点（小点，越红穿透越深）
    for (i = 0; i < state.contacts.length; i++) {
      c = state.contacts[i];
      var bx = state.boxes[c.i].x;
      var px = bx + (c.nx !== 0 ? c.nx * c.depth * 0.5 : 0);
      var py = c.j < 0 ? state.groundY : (state.boxes[c.i].y + state.boxes[c.j].y) / 2;
      var t = Math.min(1, c.depth / 6);
      ctx.fillStyle = 'rgba(248,113,113,' + (0.3 + t * 0.7).toFixed(2) + ')';
      ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
    }

    // 盒子：穿透色阶填色 + 岛色描边
    for (i = 0; i < state.boxes.length; i++) {
      b = state.boxes[i];
      var dp = maxDepthOf(state, i);
      var tt = Math.min(1, dp / 5);
      var r = Math.round(56 + tt * 180);
      var g = Math.round(190 - tt * 150);
      ctx.fillStyle = b.asleep ? 'rgb(70,80,95)' : 'rgb(' + r + ',' + g + ',60)';
      ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
      ctx.strokeStyle = state.bodyColor[i] || '#888';
      ctx.lineWidth = b.asleep ? 1 : 2;
      ctx.strokeRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
    }

    drawCurve(state, ctx, 324, 428);   // 塔顶抖动曲线
    drawPanel(state, ctx);             // 参数面板
  }
});

// ---- 下面是求解器本体与绘制辅助（纯函数，不碰 DOM/定时器）----

function mulberry32(seed) {
  var s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    var t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

var PALETTE = ['#f59e0b', '#34d399', '#60a5fa', '#f472b6', '#a78bfa', '#fbbf24'];

function reset(state) {
  var p = state.params;
  var i;
  state.boxes = [];
  var baseX = 240, sx = 520;                  // 主塔 x / 旁塔 x
  for (i = 0; i < p.n; i++) {
    state.boxes.push({
      x: baseX + (state.rng() - 0.5) * 0.6,   // 极小扰动，避免完美对齐的退化
      y: state.groundY - state.boxH / 2 - i * state.boxH,
      vx: 0, vy: 0, w: state.boxW, h: state.boxH, inv: 1, asleep: false
    });
  }
  for (i = 0; i < 4; i++) {                    // 旁塔 = 独立的第二个岛
    state.boxes.push({
      x: sx + (state.rng() - 0.5) * 0.6,
      y: state.groundY - state.boxH / 2 - i * state.boxH,
      vx: 0, vy: 0, w: state.boxW, h: state.boxH, inv: 1, asleep: false
    });
  }
  state.cache = {};
  state.history = [];
  state.islands = [];
  state.contacts = [];
  state.bodyColor = [];
  for (i = 0; i < state.boxes.length; i++) state.bodyColor[i] = '#888';
}

function step(state, dt) {
  var p = state.params;
  var i, k, c, a, b;

  // 1) 积分：先速度后位置（半隐式，更稳）
  for (i = 0; i < state.boxes.length; i++) {
    a = state.boxes[i];
    if (a.asleep) continue;
    a.vy += state.gravity * dt;
    a.x += a.vx * dt;
    a.y += a.vy * dt;
  }

  // 2) 生成接触（盒-地 / 盒-盒）
  var cs = genContacts(state);

  // 3) 建 island（接触图连通域）
  var islands = buildIslands(state, cs);
  state.contacts = cs;
  state.islands = islands;
  state.islandCount = islands.length;
  for (i = 0; i < state.boxes.length; i++) state.bodyColor[i] = '#888';
  for (k = 0; k < islands.length; k++) {
    var isl = islands[k];
    for (i = 0; i < isl.bodies.length; i++) state.bodyColor[isl.bodies[i]] = isl.color;
    if (allAsleep(state, isl)) {              // 睡着的岛：冻结速度，跳过求解
      for (i = 0; i < isl.bodies.length; i++) { state.boxes[isl.bodies[i]].vx = 0; state.boxes[isl.bodies[i]].vy = 0; }
      continue;
    }

    // 4a) 暖启动：先施加上一帧缓存好的累加冲量
    if (p.warmStart) {
      for (i = 0; i < isl.contacts.length; i++) {
        c = isl.contacts[i];
        var mem = state.cache[c.id] || 0;
        c.impulse = mem;
        if (mem > 0) applyImpulse(state, c, mem);
      }
    } else {
      for (i = 0; i < isl.contacts.length; i++) isl.contacts[i].impulse = 0;
    }

    // 4b) 顺序冲量：iterations 遍扫过全部接触，每遍只「部分满足」
    for (var it = 0; it < p.iterations; it++) {
      for (i = 0; i < isl.contacts.length; i++) {
        c = isl.contacts[i];
        a = state.boxes[c.i]; b = c.j >= 0 ? state.boxes[c.j] : null;
        var vnx = (b ? b.vx : 0) - a.vx;
        var vny = (b ? b.vy : 0) - a.vy;
        var vn = vnx * c.nx + vny * c.ny;      // 沿法线相对速度，vn<0 表示在靠近
        if (vn < 0) {
          var jn = -(1 + p.rest) * vn / (c.invA + c.invB);
          var oldI = c.impulse;
          c.impulse = Math.max(oldI + jn, 0);
          applyImpulse(state, c, c.impulse - oldI);
        }
        // 位置修正（bias）：把残余穿透按比例硬顶出去
        var pen = c.depth - state.slop;
        if (pen > 0) {
          var corr = p.bias * pen;
          var invSum = c.invA + c.invB;
          a.x -= c.nx * corr * c.invA / invSum;
          a.y -= c.ny * corr * c.invA / invSum;
          if (b) { b.x += c.nx * corr * c.invB / invSum; b.y += c.ny * corr * c.invB / invSum; }
        }
      }
    }

    // 4c) 写回缓存（供下一帧暖启动）
    if (p.warmStart) {
      for (i = 0; i < isl.contacts.length; i++) {
        c = isl.contacts[i];
        if (c.impulse > 0) state.cache[c.id] = c.impulse;
      }
    }

    // 5) 岛的休眠判定（一起睡 / 一起醒）
    updateSleep(state, isl, dt);
  }
}

function genContacts(state) {
  var cs = [];
  var i, j, a, b, n = state.boxes.length;
  // 盒-地（地是静态，invB=0）
  for (i = 0; i < n; i++) {
    a = state.boxes[i];
    var depth = (a.y + a.h / 2) - state.groundY;
    if (depth > 0) cs.push({ i: i, j: -1, nx: 0, ny: 1, depth: depth, invA: a.inv, invB: 0, id: i + '_g' });
  }
  // 盒-盒（AABB，取最小穿透轴为法线）
  for (i = 0; i < n; i++) {
    for (j = i + 1; j < n; j++) {
      a = state.boxes[i]; b = state.boxes[j];
      var dx = b.x - a.x; var dy = b.y - a.y;
      var ox = (a.w / 2 + b.w / 2) - Math.abs(dx);
      var oy = (a.h / 2 + b.h / 2) - Math.abs(dy);
      if (ox <= 0 || oy <= 0) continue;
      if (ox < oy) {
        var sn = dx >= 0 ? 1 : -1;
        cs.push({ i: i, j: j, nx: sn, ny: 0, depth: ox, invA: a.inv, invB: b.inv, id: i + '_' + j });
      } else {
        var sn2 = dy >= 0 ? 1 : -1;
        cs.push({ i: i, j: j, nx: 0, ny: sn2, depth: oy, invA: a.inv, invB: b.inv, id: i + '_' + j });
      }
    }
  }
  return cs;
}

function buildIslands(state, cs) {
  var n = state.boxes.length;
  var parent = [];
  var i, c;
  for (i = 0; i < n; i++) parent[i] = i;
  function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
  function union(x, y) { parent[find(x)] = find(y); }
  for (i = 0; i < cs.length; i++) { c = cs[i]; if (c.j >= 0) union(c.i, c.j); }
  if (!state.params.islands) {                 // 关掉 island：假装全部相连（病态演示）
    for (i = 0; i < n; i++) union(0, i);
  }
  var groups = {};
  for (i = 0; i < n; i++) {
    var r = find(i);
    if (!groups[r]) groups[r] = { bodies: [], contacts: [], asleep: false, still: 0 };
    groups[r].bodies.push(i);
  }
  var keys = Object.keys(groups);
  for (i = 0; i < keys.length; i++) groups[keys[i]].color = PALETTE[i % PALETTE.length];
  for (i = 0; i < cs.length; i++) {            // 接触按主体归属放入对应岛
    c = cs[i];
    groups[find(c.i)].contacts.push(c);
  }
  var list = [];
  for (i = 0; i < keys.length; i++) list.push(groups[keys[i]]);
  return list;
}

function allAsleep(state, isl) {
  for (var i = 0; i < isl.bodies.length; i++) if (!state.boxes[isl.bodies[i]].asleep) return false;
  return true;
}

function updateSleep(state, isl, dt) {
  var maxV = 0, i, b;
  for (i = 0; i < isl.bodies.length; i++) {
    b = state.boxes[isl.bodies[i]];
    var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    if (sp > maxV) maxV = sp;
  }
  if (maxV < state.sleepLin) {
    isl.still = (isl.still || 0) + dt;
  } else {
    isl.still = 0;
    for (i = 0; i < isl.bodies.length; i++) state.boxes[isl.bodies[i]].asleep = false;
  }
  if (isl.still > state.sleepTime) {
    for (i = 0; i < isl.bodies.length; i++) {
      b = state.boxes[isl.bodies[i]];
      b.asleep = true; b.vx = 0; b.vy = 0;
    }
  }
}

function applyImpulse(state, c, j) {
  var a = state.boxes[c.i];
  var b = c.j >= 0 ? state.boxes[c.j] : null;
  a.vx -= c.nx * j * c.invA; a.vy -= c.ny * j * c.invA;
  if (b) { b.vx += c.nx * j * c.invB; b.vy += c.ny * j * c.invB; }
}

function nearestBox(state, mx, my) {
  var best = -1, bd = 1e9, i, b, d;
  for (i = 0; i < state.boxes.length; i++) {
    b = state.boxes[i];
    var dx = b.x - mx, dy = b.y - my;
    d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = i; }
  }
  if (best >= 0 && bd > 40 * 40) return -1;
  return best;
}

function maxDepthOf(state, idx) {
  var m = 0, i, c;
  for (i = 0; i < state.contacts.length; i++) {
    c = state.contacts[i];
    if (c.i === idx || c.j === idx) { if (c.depth > m) m = c.depth; }
  }
  return m;
}

function drawCurve(state, ctx, top, bottom) {
  ctx.fillStyle = '#0d1522';
  ctx.fillRect(40, top, engine.W - 80, bottom - top);
  ctx.strokeStyle = '#24344d'; ctx.lineWidth = 1;
  ctx.strokeRect(40, top, engine.W - 80, bottom - top);
  var mid = (top + bottom) / 2;
  ctx.strokeStyle = '#2c3e55';
  ctx.beginPath(); ctx.moveTo(44, mid); ctx.lineTo(engine.W - 44, mid); ctx.stroke();
  var h = state.history;
  if (h.length < 2) return;
  var maxA = 0.001, i;
  for (i = 0; i < h.length; i++) if (Math.abs(h[i]) > maxA) maxA = Math.abs(h[i]);
  var scale = (bottom - top - 10) / 2 / maxA * 0.9;
  var x0 = 44, x1 = engine.W - 44;
  ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (i = 0; i < h.length; i++) {
    var fx = x0 + (i / (h.length - 1)) * (x1 - x0);
    var fy = mid - h[i] * scale;
    if (fy < top + 2) fy = top + 2;
    if (fy > bottom - 2) fy = bottom - 2;
    if (i === 0) ctx.moveTo(fx, fy); else ctx.lineTo(fx, fy);
  }
  ctx.stroke();
  ctx.fillStyle = '#7d93b3'; ctx.font = '11px monospace';
  ctx.fillText('塔顶垂直速度 vy（抖动曲线，中线=0）', 48, top + 14);
}

function drawPanel(state, ctx) {
  var p = state.params;
  ctx.font = '12px monospace';
  var rows = [
    ['迭代次数', p.iterations, '←/→'],
    ['盒数', p.n, '↑/↓'],
    ['暖启动', p.warmStart ? '开' : '关', 'W'],
    ['restitution', p.rest.toFixed(1), 'R'],
    ['bias', p.bias.toFixed(2), 'B'],
    ['island', p.islands ? '分开' : '合并', 'S'],
    ['空格=重置', '', '']
  ];
  ctx.fillStyle = 'rgba(11,15,23,0.85)';
  ctx.fillRect(10, 10, 220, 150);
  var y = 24, i;
  for (i = 0; i < rows.length; i++) {
    ctx.fillStyle = '#8fa7c7';
    ctx.fillText(rows[i][0], 20, y);
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(String(rows[i][1]), 120, y);
    ctx.fillStyle = '#5b7397';
    ctx.fillText(rows[i][2], 175, y);
    y += 19;
  }
}
`
    },
    {
      type: 'text',
      title: '试一试',
      html: `<ul>
  <li><b>找「迭代不足」的病征：</b>按 ← 把迭代减到 1，盯塔顶抖动曲线与穿透色阶——塔变「果冻」，曲线高频抖动、盒子出现红色深穿；再按 → 提到 24，曲线趋于平直。每一步迭代买到的就是「收敛」，回扣 L5.2 的疑问。</li>
  <li><b>找「无暖启动」的病征：</b>把迭代留在 24、按 W 关掉暖启动，再打开对比：关掉时塔整体<b>先下沉一截、再持续抖动</b>（每一帧都像第一次看见这摞塔）；打开时塔稳稳站住——「20 次迭代」被存进了标量累加器。</li>
  <li><b>找「无 island」的病征：</b>按 S 切成「合并」，两塔同色、共享一个岛；此时去推旁塔，主塔的睡眠判定被拖累、无法入睡（天天被重算）；再切回「分开」，两塔异色，推旁塔时主塔纹丝不动、照常入睡。</li>
  <li><b>调 bias 到 0：</b>位置修正关掉，穿透只靠冲量顶不回来，塔会慢慢「陷」进地里（色阶全红）；<b>restitution 拉到 0.9</b>：塔一碰就弹个不停——弹性本质是一个「分离速度目标」。</li>
</ul>`
    },
    {
      type: 'source',
      files: [
        { path: 'modules/godot_physics_3d/godot_step_3d.cpp', note: 'step() 一帧全流程：integrate_forces → _populate_island 沿约束图递归走连通域（静态物体不连接岛）→ WorkerThreadPool 并行 _setup_constraint / _pre_solve_island / _solve_island → integrate_velocities → _check_suspend 按岛一起睡。重点看 _solve_island 里那个 for(i < iterations) 双层循环，就是顺序冲量的扫。' },
        { path: 'modules/godot_physics_3d/godot_body_pair_3d.cpp', note: 'solve() 就是顺序冲量本体：normal impulse 用 jn = -(c.bounce + vn) * mass_normal，c.acc_normal_impulse = MAX(jn_old + jn, 0) 这个累加器跨帧常驻——它就是暖启动的缓存；bias impulse 单独一条通道修穿透。搜 acc_normal_impulse，看它如何被保存、又如何在下一次 warm start 时被施加。' },
        { path: 'modules/godot_physics_3d/godot_body_3d.cpp', note: 'sleep_test()：线速度、角速度都低于阈值时 still_time 累加，超过 time_to_sleep 才允许睡；配合 step 里「全岛一起 _check_suspend」，看休眠粒度 = island。搜 sleep_test 与 still_time 看阈值定义。' }
      ]
    },
    {
      type: 'text',
      title: '小结',
      html: `<p>这一课把 L5.2 的一对一冲量推到了工业形态，三个词各回答一个工程痛点：<b>迭代</b>（顺序冲量 / Gauss–Seidel）把「一堆耦合约束」拆成「扫多少遍买多少收敛」，无条件稳定；<b>暖启动</b>把上一帧收敛的冲量存进累加器、当这一帧的初值，省下大半迭代；<b>island</b>是接触图的连通域，把求解、并行、睡眠的边界一次性划对。</p>
<p>回到三个灵魂拷问：</p>
<ul>
  <li><b>数据怎么流动？</b>一帧内：gravity 积分进速度 → 检测产出接触（法线 / 深度 / 身份）→ 求解器按岛反复「读相对速度、写冲量到两边刚体的速度」→ 速度再积分回位置。</li>
  <li><b>所有权归谁？</b>冲量累加器由「接触」持有、按接触身份在 cache 里跨帧常驻（暖启动的根）；岛是每帧由约束图<b>临时重组</b>的视图，不拥有刚体、只引用它们。</li>
  <li><b>什么时候发生？</b>积分与求解<b>每个固定步</b>都发生一次；岛划分每步重建；暖启动的写回在每次 solve 末尾、施加在下一帧 solve 开头；休眠是「持续慢于阈值一段时间」之后的延迟动作。</li>
</ul>`
    }
  ]
}