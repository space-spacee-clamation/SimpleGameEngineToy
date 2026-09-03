// F2 · 群体避障:boids、flow field 与 RVO 一瞥
export default {
  id: 'F2',
  title: '群体避障：boids、flow field 与 RVO 一瞥',
  est: '2 小时',
  coreQuestions: [
    'boids 的分离/对齐/聚合各在模拟什么？为什么它天然「抱团」？',
    'flow field 为什么能完全绕开两两配对？它把成本转移到了哪里？',
    'RVO 的「速度障碍」比直接弹开聪明在哪？',
    '三种算法各适合什么场景？模拟成本差在哪一阶？'
  ],
  sections: [
  {
    type: 'text',
    title: '三种群体思路，三种成本结构',
    html: `<table>
  <tr><th>算法</th><th>核心思想</th><th>成本</th><th>翻车场景</th></tr>
  <tr><td>boids</td><td>分离/对齐/聚合三条局域规则，群体行为「涌现」</td><td>O(n·邻居数)，需要邻居网格提速</td><td>全挤成一团；对目标不敏感</td></tr>
  <tr><td>flow field</td><td>预先算好「每格该往哪流」的向量场，个体只查表</td><td>场预计算一次，个体 O(1) 查表</td><td>目标一变要重算场；个体之间无互动</td></tr>
  <tr><td>RVO</td><td>速度障碍：把「会撞的相对速度」划成禁区，取禁区外的最优速度</td><td>O(n·邻居数)，几何计算更重</td><td>对称僵局（双方同时让路互相横跳）</td></tr>
</table>
<p>本课沙盘 500 个单位同场竞技，Tab 一键切换三种大脑——<b>同样的世界，三种走位性格</b>；HUD 的模拟耗时告诉你各自信了多少脑力。</p>`
  },
  {
    type: 'text',
    title: '邻居网格：群集模拟的生命线',
    html: `<p>不管哪种算法，「找邻居」都是大头：500 个单位两两配对是 25 万次距离判断。工程解法是<b>空间网格</b>（回扣主线 L5.1 的 broadphase）：把场地划成 32px 格子，每个单位只跟自己所在格+8邻格里的单位配对——邻居数从 499 掉到十几个。boids 和 RVO 都靠它续命；flow field 干脆不需要它。</p>`
  },
  {
    type: 'lab',
    lab: 'code',
    key: 'flock',
    title: '实验：500 单位 × 三种大脑（实时切换）',
    height: 620,
    code: `// Tab=切算法(boids/flow/RVO)  空格=惊散  按住左键=把目标拖到指针处  G=重掷障碍
// 圆圈=障碍物  脉动圆=目标  右栏=模拟耗时与碰撞计数

var N = 500, W = 620, H = 456, OX = 16, OY = 44;
var R = 4;

engine.run({
  setup: function (state) {
    state.mode = 0;             // 0=boids 1=flow 2=rvo
    state.t = 0;
    state.target = { x: W * 0.72, y: H * 0.5 };
    state.obstacles = [];
    state.simMs = [];
    state.collisions = 0;
    state.rng = mulberry32(20260903);
    buildObstacles(state);
    spawnAll(state);
    buildField(state);
    state.log = ['boids:分离/对齐/聚合三条规则'];
  },

  update: function (state, dt, input) {
    state.t += dt;
    if (input.pressed('Tab')) {
      state.mode = (state.mode + 1) % 3;
      pushLog(state, ['boids:分离+对齐+聚合', 'flow field:查表走位', 'RVO:速度障碍避让'][state.mode]);
    }
    if (input.pressed('KeyG')) { buildObstacles(state); buildField(state); pushLog(state, '重掷障碍,流场已重算'); }
    if (input.pressed('Space')) {
      for (var s = 0; s < N; s++) {
        state.vx[s] += (state.rng() - 0.5) * 260;
        state.vy[s] += (state.rng() - 0.5) * 260;
      }
      pushLog(state, '惊散!');
    }
    if (input.mouse.down) { state.target.x = input.mouse.x - OX; state.target.y = input.mouse.y - OY; }
    // flow 模式且障碍变了才重算场:这里每 2s 轻刷一次(目标可拖动)
    state.fieldTimer = (state.fieldTimer || 0) - dt;
    if (state.mode === 1 && state.fieldTimer <= 0) { buildField(state); state.fieldTimer = 2; }

    var t0 = performance.now();
    stepAll(state, dt);
    var t1 = performance.now();
    pushAvg(state.simMs, t1 - t0);
    while (state.log.length > 3) state.log.shift();
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    ctx.fillStyle = '#101826';
    ctx.fillRect(OX, OY, W, H);
    for (var o = 0; o < state.obstacles.length; o++) {
      var ob = state.obstacles[o];
      ctx.fillStyle = '#3a2c14';
      ctx.beginPath();
      ctx.arc(OX + ob.x, OY + ob.y, ob.r, 0, 6.2832);
      ctx.fill();
    }
    var pul = 8 + Math.sin(state.t * 4) * 2.5;
    ctx.strokeStyle = '#ffd479';
    ctx.beginPath();
    ctx.arc(OX + state.target.x, OY + state.target.y, pul, 0, 6.2832);
    ctx.stroke();
    var cols = ['#6ee7b7', '#5b8fd6', '#f59e0b'];
    for (var i = 0; i < N; i++) {
      ctx.fillStyle = cols[state.mode];
      ctx.fillRect(OX + state.x[i] - 2, OY + state.y[i] - 2, 4, 4);
    }
    drawHud(state, ctx);
  }
});

// ---------- 数据 ----------

function spawnAll(state) {
  state.x = new Float32Array(N);
  state.y = new Float32Array(N);
  state.vx = new Float32Array(N);
  state.vy = new Float32Array(N);
  for (var i = 0; i < N; i++) {
    state.x[i] = 10 + state.rng() * (W - 20);
    state.y[i] = 10 + state.rng() * (H - 20);
  }
}

function buildObstacles(state) {
  state.obstacles = [];
  for (var i = 0; i < 5; i++) {
    state.obstacles.push({ x: 90 + state.rng() * (W - 180), y: 60 + state.rng() * (H - 120), r: 24 + state.rng() * 26 });
  }
}

// 邻居网格:32px 格子,只配对同格+邻格
function neighborGrid(state) {
  var gw = Math.ceil(W / 32), gh = Math.ceil(H / 32);
  var buckets = {};
  for (var i = 0; i < N; i++) {
    var key = Math.floor(state.x[i] / 32) + ',' + Math.floor(state.y[i] / 32);
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(i);
  }
  return buckets;
}

function forNeighbors(state, buckets, i, fn) {
  var gx = Math.floor(state.x[i] / 32), gy = Math.floor(state.y[i] / 32);
  for (var oy = -1; oy <= 1; oy++) {
    for (var ox = -1; ox <= 1; ox++) {
      var arr = buckets[(gx + ox) + ',' + (gy + oy)];
      if (!arr) continue;
      for (var k = 0; k < arr.length; k++) {
        var j = arr[k];
        if (j === i) continue;
        fn(j);
      }
    }
  }
}

// ---------- 三种大脑 ----------

function stepAll(state, dt) {
  state.collisions = 0;
  if (state.mode === 0) stepBoids(state, dt);
  else if (state.mode === 1) stepFlow(state, dt);
  else stepRvo(state, dt);
  // 边界回弹 + 障碍硬约束 + 到达回收
  for (var i = 0; i < N; i++) {
    state.x[i] += state.vx[i] * dt;
    state.y[i] += state.vy[i] * dt;
    if (state.x[i] < R) { state.x[i] = R; state.vx[i] = Math.abs(state.vx[i]); }
    if (state.x[i] > W - R) { state.x[i] = W - R; state.vx[i] = -Math.abs(state.vx[i]); }
    if (state.y[i] < R) { state.y[i] = R; state.vy[i] = Math.abs(state.vy[i]); }
    if (state.y[i] > H - R) { state.y[i] = H - R; state.vy[i] = -Math.abs(state.vy[i]); }
    for (var o = 0; o < state.obstacles.length; o++) {
      var ob = state.obstacles[o];
      var dx = state.x[i] - ob.x, dy = state.y[i] - ob.y;
      var d2 = dx * dx + dy * dy, rr = ob.r + R;
      if (d2 < rr * rr && d2 > 0.01) {
        var d = Math.sqrt(d2);
        state.x[i] = ob.x + dx / d * rr;
        state.y[i] = ob.y + dy / d * rr;
      }
    }
    var tx = state.x[i] - state.target.x, ty = state.y[i] - state.target.y;
    if (tx * tx + ty * ty < 144) {
      state.x[i] = 6;
      state.y[i] = 10 + state.rng() * (H - 20);
      state.vx[i] = 60; state.vy[i] = 0;
    }
  }
}

function stepBoids(state, dt) {
  var buckets = neighborGrid(state);
  for (var i = 0; i < N; i++) {
    var sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, cnt = 0;
    forNeighbors(state, buckets, i, function (j) {
      var dx = state.x[i] - state.x[j], dy = state.y[i] - state.y[j];
      var d2 = dx * dx + dy * dy;
      if (d2 < 196 && d2 > 0.01) { sx += dx / d2 * 40; sy += dy / d2 * 40; }
      ax += state.vx[j]; ay += state.vy[j];
      cx += state.x[j]; cy += state.y[j];
      cnt++;
    });
    var vx = state.vx[i], vy = state.vy[i];
    if (cnt) {
      vx += (sx + (ax / cnt - vx) * 0.6 + (cx / cnt - state.x[i]) * 0.4) * dt;
      vy += (sy + (ay / cnt - vy) * 0.6 + (cy / cnt - state.y[i]) * 0.4) * dt;
    }
    vx += (state.target.x - state.x[i]) * 0.5 * dt;
    vy += (state.target.y - state.y[i]) * 0.5 * dt;
    var sp = Math.sqrt(vx * vx + vy * vy);
    var mx = 90;
    if (sp > mx) { vx = vx / sp * mx; vy = vy / sp * mx; }
    state.vx[i] = vx; state.vy[i] = vy;
  }
}

function buildField(state) {
  // 32px 流场:指向目标 + 绕障偏转(简单的势场推离)
  state.fw = Math.ceil(W / 32);
  state.fh = Math.ceil(H / 32);
  state.fx = new Float32Array(state.fw * state.fh);
  state.fy = new Float32Array(state.fw * state.fh);
  for (var gy = 0; gy < state.fh; gy++) {
    for (var gx = 0; gx < state.fw; gx++) {
      var cx2 = gx * 32 + 16, cy2 = gy * 32 + 16;
      var dx = state.target.x - cx2, dy = state.target.y - cy2;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      var ux = dx / d, uy = dy / d;
      for (var o = 0; o < state.obstacles.length; o++) {
        var ob = state.obstacles[o];
        var ox2 = cx2 - ob.x, oy2 = cy2 - ob.y;
        var od = Math.sqrt(ox2 * ox2 + oy2 * oy2) || 1;
        if (od < ob.r + 90) {
          var push = (1 - od / (ob.r + 90)) * 2.2;
          ux += ox2 / od * push;
          uy += oy2 / od * push;
        }
      }
      var m = Math.sqrt(ux * ux + uy * uy) || 1;
      state.fx[gy * state.fw + gx] = ux / m;
      state.fy[gy * state.fw + gx] = uy / m;
    }
  }
}

function stepFlow(state, dt) {
  for (var i = 0; i < N; i++) {
    var gx = clamp(Math.floor(state.x[i] / 32), 0, state.fw - 1);
    var gy = clamp(Math.floor(state.y[i] / 32), 0, state.fh - 1);
    state.vx[i] = state.fx[gy * state.fw + gx] * 95;
    state.vy[i] = state.fy[gy * state.fw + gx] * 95;
  }
}

function stepRvo(state, dt) {
  var buckets = neighborGrid(state);
  for (var i = 0; i < N; i++) {
    var px = state.target.x - state.x[i], py = state.target.y - state.y[i];
    var pd = Math.sqrt(px * px + py * py) || 1;
    var vx = px / pd * 95, vy = py / pd * 95;
    var adjx = 0, adjy = 0;
    forNeighbors(state, buckets, i, function (j) {
      var dx = state.x[j] - state.x[i], dy = state.y[j] - state.y[i];
      var d2 = dx * dx + dy * dy;
      if (d2 > 400 || d2 < 0.01) return;
      if (d2 < 64) state.collisions++;
      var rel = (state.vx[i] - state.vx[j]) * dx + (state.vy[i] - state.vy[j]) * dy;
      if (rel > 0) {
        // 会在最近 0.5s 内接近:往切线方向让
        adjx += -dy / Math.sqrt(d2) * rel * 0.35;
        adjy += dx / Math.sqrt(d2) * rel * 0.35;
      }
      var d = Math.sqrt(d2);
      if (d < 16) { adjx -= dx / d * 60; adjy -= dy / d * 60; }
    });
    state.vx[i] = vx + adjx * dt * 6;
    state.vy[i] = vy + adjy * dt * 6;
  }
}

// ---------- 工具与 HUD ----------

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

function drawHud(state, ctx) {
  ctx.fillStyle = 'rgba(11,15,23,0.92)';
  ctx.fillRect(8, 6, 704, 30);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#8fa7c7';
  var modeName = ['boids(分离/对齐/聚合)', 'flow field(查表)', 'RVO(速度障碍)'][state.mode];
  ctx.fillText('模式:' + modeName + '  500 单位  模拟 ' + avg(state.simMs).toFixed(2) + 'ms  本帧近距离对 ' + state.collisions, 16, 26);
  ctx.fillStyle = '#5b7397';
  ctx.font = '11px monospace';
  ctx.fillText('Tab=切算法  空格=惊散  左键拖目标  G=重掷障碍', 16, 596);
}`
  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>boids 模式：</b>把目标拖到角落——群体呈鸟群状蜿蜒挪动、中途抱团犹豫；这是「涌现」的美，也是它的低效。</li>
  <li><b>切 flow field：</b>同样的目标，单位瞬间排成顺滑的流线绕过障碍——预计算的场替它们想好了一切；把目标拖远，等 2 秒重算场再看「思潮」转向。</li>
  <li><b>切 RVO：</b>对开而行的单位会互相「侧身让路」而不是挤成一团——速度障碍让「让路」成为几何最优解；盯紧两个迎面相遇的单位，看它们谁先侧身。</li>
  <li><b>空格惊散：</b>boids 会重新聚拢（聚合规则在召唤），flow 单位无视同伴直接回流场，RVO 各走各的最优——三种「性格」一眼可辨。</li>
  <li><b>看右栏数字：</b>boids 与 RVO 靠邻居网格续命，flow 完全不需要配对——模拟耗时差的就是这一阶。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：Godot 的避障服务',
    files: [
      { path: 'scene/2d/navigation/navigation_agent_2d.cpp', note: '导航代理节点：velocity → avoidance_callback → 安全速度——RVO 思想在节点层的封装。建议搜索：set_velocity、avoidance、_avoidance_done。' },
      { path: 'scene/2d/navigation/navigation_obstacle_2d.cpp', note: '导航障碍：把「会动的 obstruction」注册进避障世界，让 RVO 也看得见静态/动态阻挡。建议搜索：obstacle、set_vertices、add_to_map。' },
      { path: 'servers/navigation_2d/navigation_server_2d.cpp', note: '避障的步进服务：代理注册/参数设置/统一步进——「所有代理同拍计算」避免先算的占便宜。建议搜索：agent_set_velocity、sync、avoidance。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>boids 卖「涌现的活感」、flow field 卖「规划好的秩序」、RVO 卖「几何上聪明的礼让」——没有全能王者，只有场景匹配。它们的共同前提是确定性节奏：所有代理同拍思考、同拍移动。</p>
<ul>
  <li><b>数据怎么流动？</b>位置/速度 → （boids：邻居规则 / flow：查表 / RVO：速度障碍几何）→ 新速度 → 位置积分 → 障碍硬约束。</li>
  <li><b>所有权归谁？</b>邻居网格是一次查询的临时品；流场归「目标+障碍集」所有，二者一变即重算；代理状态各自持有。</li>
  <li><b>什么时候发生？</b>群体模拟每帧固定步进；流场按目标/障碍变化重算；工业引擎还会把避障步进统一在服务器一拍里——先算后算都会破坏公平。</li>
</ul>`
  }
  ]
};
