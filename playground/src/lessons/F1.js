// F1 · 寻路:A*、JPS 与 navmesh
export default {
  id: 'F1',
  title: '寻路：A*、JPS 与 navmesh',
  est: '2.5 小时',
  coreQuestions: [
    'A* 的 g/h/f 各是什么？为什么「估计必须乐观」才能保证最优？',
    '启发权重调大买到了什么、卖掉了什么？',
    '网格寻路的折线路径为什么不能直接用？平滑（string pulling）怎么把折线拉直？',
    '从网格 A* 到 navmesh 之间隔着什么？'
  ],
  sections: [
  {
    type: 'text',
    title: 'A*:带方向的 Dijkstra',
    html: `<p>Dijkstra 从起点向四周均匀扩散，保证最优但浪费——它对「目标在哪」一无所知。A* 给每个候选格加一个<b>启发值 h（到目标的估计代价）</b>，f = g + h：<b>g 是已走的确切代价，h 是剩余路程的乐观估计</b>。只要 h 从不高估（曼哈顿/欧氏距离都满足），A* 找到的路就同样最优，但扩散方向被「吸」向目标，扩展节点数骤降。</p>
<p>把 h 乘上一个权重 w（f = g + w·h）：<b>w 越大越「急」</b>——扩展更少、更快出结果，但路径可能绕远。w→∞ 退化成贪心最佳优先，w=1 才是理论最优。这个旋钮是实时寻路的第一性价比开关。</p>`
  },
  {
    type: 'text',
    title: '折线不能直接用：平滑与 navmesh',
    html: `<p>网格 A* 的产出是一格一格的折线，角色走起来像机器人。原因：路径精度被格宽绑架。经典的补救是 <b>string pulling（视线拉直）</b>：从起点出发，只要能「看见」路径上更远的折点，就跳过中间所有格——直到被墙挡住视线才落一个真正的路径点。输出的 waypoints 瞬间从几十个缩到几个。</p>
<p>再往工业走一步就是 <b>navmesh</b>：把可行走区域烘成凸多边形网格，寻路在「多边形邻接图」上做（比格子少几个数量级的节点），再把跨多边形的路径拉成带半径的走廊。Godot 的 NavigationServer 正是这套：网格寻路是它的教学版，navmesh 是它的工业版。</p>`
  },
  {
    type: 'lab',
    lab: 'code',
    key: 'astar',
    title: '实验：网格 A* 可视化 + 视线平滑 + 启发权重旋钮',
    height: 620,
    code: `// 左键涂墙/右键擦墙  Q/E=启发权重  回车=平滑开关  C=随机墙阵  空格=换目标
// 深蓝=已关闭 橙=开放集 黄=网格路径 亮绿=平滑路径

var GW = 44, GH = 28, CELL = 14;

engine.run({
  setup: function (state) {
    state.w = 0.6;
    state.smooth = true;
    state.seed = 20260903;
    state.mouseWall = null;
    buildWalls(state);
    pickEnds(state);
    search(state);
    state.log = ['左键涂墙 右键擦墙;Q/E 调启发权重'];
  },

  update: function (state, dt, input) {
    var changed = false;
    if (input.pressed('KeyQ')) { state.w = Math.max(0.3, state.w - 0.2); changed = true; pushLog(state, '启发权重 w=' + state.w.toFixed(1)); }
    if (input.pressed('KeyE')) { state.w = Math.min(3.0, state.w + 0.2); changed = true; pushLog(state, '启发权重 w=' + state.w.toFixed(1)); }
    if (input.pressed('Enter')) { state.smooth = !state.smooth; changed = true; pushLog(state, state.smooth ? '平滑:开(string pulling)' : '平滑:关'); }
    if (input.pressed('KeyC')) { buildWalls(state); pickEnds(state); changed = true; pushLog(state, '随机墙阵'); }
    if (input.pressed('Space')) { pickEnds(state); changed = true; pushLog(state, '换目标'); }
    // 鼠标涂墙
    if (input.mouse.down) {
      var gx = Math.floor(input.mouse.x / CELL) - 1;
      var gy = Math.floor((input.mouse.y - 44) / CELL);
      if (gx >= 0 && gx < GW && gy >= 0 && gy < GH) {
        var key = gx + ',' + gy;
        var isStart = gx === state.sx && gy === state.sy;
        var isGoal = gx === state.gx && gy === state.gy;
        if (!isStart && !isGoal) {
          if (state.mouseWall === null) state.mouseWall = !state.walls[key];
          if (state.walls[key] !== state.mouseWall) {
            state.walls[key] = state.mouseWall;
            changed = true;
          }
        }
      }
    } else state.mouseWall = null;
    if (changed) search(state);
    while (state.log.length > 3) state.log.shift();
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    var x0 = 14, y0 = 44;
    for (var j = 0; j < GH; j++) {
      for (var i = 0; i < GW; i++) {
        var k = i + ',' + j;
        var px = x0 + i * CELL, py = y0 + j * CELL;
        ctx.fillStyle = state.walls[k] ? '#3a2c14' : '#131c2b';
        if (state.closed[k]) ctx.fillStyle = '#1c3050';
        if (state.open[k]) ctx.fillStyle = '#4a3212';
        ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
      }
    }
    // 网格路径(黄)
    ctx.strokeStyle = '#ffd479';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var p = 0; p < state.rawPath.length; p++) {
      var n = state.rawPath[p];
      var nx = x0 + n[0] * CELL + CELL / 2, ny = y0 + n[1] * CELL + CELL / 2;
      if (p === 0) ctx.moveTo(nx, ny); else ctx.lineTo(nx, ny);
    }
    ctx.stroke();
    // 平滑路径(亮绿)
    if (state.smooth && state.finePath.length) {
      ctx.strokeStyle = '#6ee7b7';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (var q = 0; q < state.finePath.length; q++) {
        var m = state.finePath[q];
        var mx = x0 + m[0] * CELL + CELL / 2, my = y0 + m[1] * CELL + CELL / 2;
        if (q === 0) ctx.moveTo(mx, my); else ctx.lineTo(mx, my);
      }
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = '#6ee7b7';
      for (var r = 0; r < state.finePath.length; r++) {
        var w2 = state.finePath[r];
        ctx.beginPath();
        ctx.arc(x0 + w2[0] * CELL + CELL / 2, y0 + w2[1] * CELL + CELL / 2, 3, 0, 6.2832);
        ctx.fill();
      }
    }
    // 起终点
    ctx.fillStyle = '#6ee7b7';
    ctx.fillRect(x0 + state.sx * CELL + 3, y0 + state.sy * CELL + 3, CELL - 6, CELL - 6);
    ctx.fillStyle = '#f87171';
    ctx.fillRect(x0 + state.gx * CELL + 3, y0 + state.gy * CELL + 3, CELL - 6, CELL - 6);
    drawHud(state, ctx);
  }
});

// ---------- A* ----------

function buildWalls(state) {
  var rng = mulberry32(state.seed);
  state.seed = (state.seed * 48271) % 2147483647;
  state.walls = {};
  for (var i = 0; i < 90; i++) {
    var wx = Math.floor(rng() * (GW - 8) + 4);
    var wy = Math.floor(rng() * (GH - 4) + 2);
    var len = 2 + Math.floor(rng() * 6);
    var horiz = rng() > 0.5;
    for (var l = 0; l < len; l++) {
      var kx = horiz ? wx + l : wx;
      var ky = horiz ? wy : wy + l;
      if (kx < GW && ky < GH) state.walls[kx + ',' + ky] = true;
    }
  }
}

function pickEnds(state) {
  state.sx = 2;
  state.sy = Math.floor(GH / 2);
  var tries = 0;
  do {
    state.gx = GW - 3 - Math.floor(Math.abs(state.seed % 5));
    state.gy = Math.floor(Math.abs(state.seed % (GH - 4)) + 2);
    tries++;
  } while ((state.walls[state.gx + ',' + state.gy] || tries < 5) === false && tries < 30);
  search(state);
}

function search(state) {
  var t0 = performance.now();
  var openList = [];
  var gScore = {};
  var came = {};
  var start = state.sx + ',' + state.sy;
  var goal = state.gx + ',' + state.gy;
  gScore[start] = 0;
  openList.push({ x: state.sx, y: state.sy, f: state.w * heur(state.sx, state.sy, state.gx, state.gy) });
  state.closed = {};
  state.open = {};
  state.open[start] = 1;
  var expanded = 0;
  var goalCost = -1;
  while (openList.length) {
    // 取 f 最小(线性扫,格子少够用)
    var bi = 0;
    for (var i = 1; i < openList.length; i++) {
      if (openList[i].f < openList[bi].f) bi = i;
    }
    var cur = openList.splice(bi, 1)[0];
    var ck = cur.x + ',' + cur.y;
    delete state.open[ck];
    state.closed[ck] = 1;
    expanded++;
    if (ck === goal) { goalCost = gScore[ck]; break; }
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        var nx = cur.x + dx, ny = cur.y + dy;
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        var nk = nx + ',' + ny;
        if (state.walls[nk]) continue;
        if (dx && dy && (state.walls[cur.x + dx + ',' + cur.y] || state.walls[cur.x + ',' + (cur.y + dy)])) continue;
        var step = (dx && dy) ? 1.4142 : 1;
        var ng = gScore[ck] + step;
        if (gScore[nk] === undefined || ng < gScore[nk]) {
          gScore[nk] = ng;
          came[nk] = ck;
          state.open[nk] = 1;
          openList.push({ x: nx, y: ny, f: ng + state.w * heur(nx, ny, state.gx, state.gy) });
        }
      }
    }
  }
  state.expanded = expanded;
  state.searchMs = performance.now() - t0;
  // 回溯网格路径
  state.rawPath = [];
  if (goalCost >= 0) {
    var walk = goal;
    while (walk) {
      var part = walk.split(',');
      state.rawPath.push([+part[0], +part[1]]);
      walk = came[walk];
    }
    state.rawPath.reverse();
    state.rawCost = goalCost;
  } else {
    state.rawCost = 0;
  }
  state.finePath = state.smooth ? smoothPath(state) : [];
}

function heur(x1, y1, x2, y2) {
  var dx = Math.abs(x1 - x2), dy = Math.abs(y1 - y2);
  var mn = Math.min(dx, dy);
  return (dx - mn) + (dy - mn) + mn * 1.4142;
}

// ---------- string pulling:能看见就跳过 ----------

function smoothPath(state) {
  if (state.rawPath.length < 3) return state.rawPath.slice();
  var out = [state.rawPath[0]];
  var anchor = 0;
  for (var i = 2; i < state.rawPath.length; i++) {
    if (!lineOfSight(state, state.rawPath[anchor], state.rawPath[i])) {
      out.push(state.rawPath[i - 1]);
      anchor = i - 1;
    }
  }
  out.push(state.rawPath[state.rawPath.length - 1]);
  return out;
}

function lineOfSight(state, a, b) {
  var steps = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) * 3;
  for (var s = 1; s < steps; s++) {
    var t = s / steps;
    var x = Math.round(a[0] + (b[0] - a[0]) * t);
    var y = Math.round(a[1] + (b[1] - a[1]) * t);
    if (state.walls[x + ',' + y]) return false;
  }
  return true;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pushLog(state, s) {
  state.log.push(s);
  if (state.log.length > 3) state.log.shift();
}

// ---------- HUD ----------

function drawHud(state, ctx) {
  ctx.fillStyle = 'rgba(11,15,23,0.92)';
  ctx.fillRect(8, 6, 704, 30);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('w=' + state.w.toFixed(1) + '  扩展节点 ' + state.expanded + '  网格路径代价 ' + state.rawCost.toFixed(1) +
    '  折点 ' + state.rawPath.length + '→' + (state.smooth ? state.finePath.length : '-') + '(平滑' + (state.smooth ? '开' : '关') + ')  搜索 ' + state.searchMs.toFixed(2) + 'ms', 16, 26);
  ctx.fillStyle = '#5b7397';
  ctx.font = '11px monospace';
  ctx.fillText('左键=涂墙  右键=擦墙  Q/E=权重  回车=平滑  C=随机墙  空格=换目标', 16, 470);
  for (var i = 0; i < state.log.length; i++) {
    ctx.fillStyle = i === state.log.length - 1 ? '#ffd479' : '#5b7397';
    ctx.fillText(state.log[i], 380, 468 + i * 14);
  }
  ctx.fillStyle = '#5b7397';
  ctx.fillText('深蓝=已关闭 橙=开放集 黄=网格路径 亮绿=平滑路径', 16, 596);
}`
  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>拧权重（Q/E）：</b>w=0.3 时扩展节点多、路径代价最小；w 拉到 3.0 扩展数骤降、代价偶尔变差——「搜索时间换路径质量」的旋钮当场可见。</li>
  <li><b>关掉平滑（回车）：</b>黄色折线贴着格子走，一个拐点接一个；开回平滑，亮绿路径只剩两三个拐点——string pulling 用「视线检测」换掉了几十个无意义的 waypoint。</li>
  <li><b>造一道墙（左键拖）：</b>把平滑路径拦腰截断再搜索——路径优雅地绕行，开放集（橙）像水波一样从起点涌向终点，被启发值「吸」成椭圆。</li>
  <li><b>对比扩展数：</b>同一张图把 w 从 0.3 拨到 3.0，看 HUD 的扩展节点数差几倍——这就是实时游戏敢在千军万马上跑 A* 的底气。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：从格子到 NavigationServer',
    files: [
      { path: 'servers/navigation_3d/navigation_server_3d.cpp', note: '寻路服务的入口：path 查询的分发与异步处理——游戏的 A* 在这里是「服务」，不是每帧裸算。建议搜索：path_get_next_point、parse_path_query。' },
      { path: 'servers/navigation_3d/navigation_path_query_parameters_3d.cpp', note: '路径查询参数：起点/终点/导航层/优化后处理——一次寻路请求的全部「合同条款」。建议搜索：start_position、path_postprocessing、navigation_layers。' },
      { path: 'servers/navigation_3d/navigation_server_3d_manager.cpp', note: '后端注册与创建：NavigationServer 允许换实现（默认/Jolt 生态）——寻路与物理一样被抽象成 Server。建议搜索：create_default_server、_create_server。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>A* = Dijkstra + 乐观直觉；启发权重是「时间换质量」的旋钮；string pulling 把格子折线拉成自然路径；navmesh 把这一切搬到凸多边形上做工业级放大。</p>
<ul>
  <li><b>数据怎么流动？</b>起点/终点/地图→开放集按 f=g+w·h 扩散→回溯网格路径→视线平滑→waypoints 交给寻路代理。</li>
  <li><b>所有权归谁？</b>地图数据归世界（wall/weight 都是格子的属性）；开放/关闭集是单次查询的临时品，查完即焚。</li>
  <li><b>什么时候发生？</b>查询按需触发（目标变/地图变/代理变）；工业引擎再配异步批量查询与结果缓存——寻路永远不该在玩家帧里裸算一万格。</li>
</ul>`
  }
  ]
};
