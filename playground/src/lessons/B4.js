// B4 · 可破坏场景 I：像素/体素破坏
export default {
  id: 'B4',
  title: '可破坏场景 I：像素/体素破坏',
  est: '2.5 小时',
  coreQuestions: [
    '为什么说「破坏」的本质是「数据结构的可变性」？炸一个坑，引擎里真正被改掉的到底是什么？',
    '孤岛判定为什么是「连通域分析」（图问题），而不是逐个格子查邻居？',
    '一份「格子实心/空心」数据，如何同时驱动渲染、物理、寻路三套系统而不互相打架？'
  ],
  sections: [
    {
      type: 'text',
      title: '破坏的最小实现：可写地形 + 连通域分析',
      html: `<p>玩家一炮轰塌一堵墙、一锹挖掉一块地，在引擎内部到底发生了什么？把这件事拆到最小，答案朴素得惊人：<b>破坏 = 一份格子数据的减法运算</b>。</p>
<p>把地形看成一块二维网格，每格一个布尔值：<code>实心</code> 或 <code>空心</code>。炸一个半径 R 的坑，就是把这个圆形范围内的格子从实改成空——一次 <b>mask 减法</b>。这在引擎谱系里有精确的对应：Godot 的 CSG（构造实体几何）用 <b>OPERATION_SUBTRACTION</b> 把一块凸体从另一块里剜掉，本课只是把同一思想从「连续网格」降维到「离散格子」。可破坏地形、Minecraft 式的体素世界、2D 的 Worms 挖洞，全是这套逻辑。</p>
<p>但「减法」只是开胃菜。真正的引擎级问题在减法之后冒出来：<b>减掉之后，剩下的地形还站得住吗？</b>一堵墙中间被炸掉一圈，墙顶就悬空了——它该掉下来。判断「哪一块该掉下来」，靠的不是局部规则（挨个格子看上面有没有支撑），而是 <b>连通域分析</b>：从「永不可破坏的地基」出发做一次图遍历，凡是走不到的实心格子，就是断了根的孤岛，应该整体坠落。</p>
<table>
  <tr><th>游戏里的动作</th><th>引擎里的操作</th><th>数据结构</th></tr>
  <tr><td>炸坑 / 挖洞</td><td>mask 减法（CSG subtract）</td><td>格子 solide=false</td></tr>
  <tr><td>墙被炸断</td><td>连通域分析（flood fill）</td><td>BFS 标记组件编号</td></tr>
  <tr><td>碎块坠落</td><td>孤岛转简单刚体</td><td>一块自由落体的 cell 集合</td></tr>
  <tr><td>一格数据管三套系统</td><td>渲染 + 物理 + 寻路各自读同一份 grid</td><td>单一真源（single source of truth）</td></tr>
</table>
<p>这一课我们先把 2D 打穿，回答一个更底层的问题：<b>为什么「破坏」天然是一件「数据结构」的事，而不是「美术素材」的事。</b>渲染、物理、寻路三份数据如何同步是后话（B5 接物理联动），本课先证明：只要数据结构是可写的，破坏就免费。</p>`
    },
    {
      type: 'text',
      title: '孤岛判定：从「该掉下来」到「怎么算出来」',
      html: `<p>「炸断之后墙顶该掉」是一句人话，翻译成算法却是三个连环扣。</p>
<p><b>第一扣：为什么必须是连通域，而不是逐个格子查邻居？</b>逐个查邻居是<b>局部</b>判断，它会得到无数自相矛盾的结论：A 格有 B 格撑、B 格又只有 A 格撑——两个格子悬空却互相「支撑」，谁也掉不下来。连通域分析把问题换成<b>全局</b>的图问题：把「实心格子 + 四邻接」看成一张图，从地基格子出发 flood fill（广度优先搜索），能到达的格子组成一个连通组件——<b>它们通过某种路径接住了地</b>；到不了的格子自成孤岛，无论它内部看起来多坚固，整体没有根，就该整块坠落。</p>
<p><b>第二扣：为什么 BFS 而不是随便扫？</b>flood fill 每个格子恰好入队一次，总访问次数是 <b>O(格子数)</b>——这就是本课实验左上角那个「BFS 访问」计数器的意义：你可以亲眼看到，一次分析的成本只和格子总数成正比，和「炸了多少次」「岛有多少块」都无关。这正是引擎愿意在每帧（或每次破坏事件）重算连通域的原因：它便宜、可预测。</p>
<p><b>第三扣：孤岛坠落的物理怎么做？</b>不必给每个孤岛建一套完整刚体。孤岛是一个刚性的格子集合，把它当成一个<b>整体</b>：整块用一个 y 速度做自由落体（简化刚体），落地即停。这就是主线 L5.2 里「坠落物」的雏形——你正在把 B4 的孤岛，变成 L5.2 的 body。而它「从地形里被摘出来」这一步，本质是同一份 grid 数据里某一组格子被改标记、挪进了另一个容器。</p>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'destruct',
      title: '实验：2D 可破坏地形——炸坑 · 连通域 · 孤岛坠落',
      height: 600,
      code: `// 可破坏地形的最小实现：每格实/空 + 颜色层，炸坑是 mask 减法
// 单击 = 放炸弹，炸出半径 R 的坑；按住拖动 = 导弹拖尾开槽
// 每次破坏后 BFS 连通域分析：没连到地底基座的孤岛 → 金色高亮 → 整体坠落
// 键：R 重置地形 · [ / ] 炸弹半径 · C 连通域染色 · G 网格线

var cell = 12, cols = 52, rows = 26;   // 格子边长 / 列数 / 行数
var ox = 24, oy = 80;                   // 地形格 (0,0) 的屏幕坐标
var groundY = oy + rows * cell;         // 地板基准线（孤岛落点）
var GRAV = 1300;                        // 坠落体重力 px/s²

var COLORS = ['#3a4a5a', '#5a9e4f', '#8a6242', '#8f97a3'];  // 基岩 / 草皮 / 泥土 / 石心

function makeRng(seed) {               // 自带种子的伪随机，不用 Math.random
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

engine.run({
  setup: function (state) {
    state.seed = 2026;
    state.bombR = 3;
    state.showGrid = true;
    state.showComp = false;
    state.solid = new Array(rows * cols);       // 实/空
    state.color = new Array(rows * cols);       // 颜色层
    state.mark = new Array(rows * cols).fill(0);   // BFS 访问标记
    state.compArr = new Array(rows * cols).fill(0); // 每格的连通域编号
    state.cells = 0; state.components = 0; state.islands = 0; state.bfsVisits = 0;
    state.lastOp = '初始地形：单击炸坑，按住拖尾开槽';
    state.lastOpT = 4;
    state.falling = [];     // 坠落的孤岛块 [{cells,maxY,oy,vy}]
    state.rubble = [];      // 落地碎块（屏幕坐标）
    state.prevMouse = null;
    buildTerrain(state);
    analyze(state);
  },

  update: function (state, dt, input) {
    var didCarve = false;
    if (input.pressed('KeyR')) {
      state.falling = []; state.rubble = []; state.prevMouse = null;
      buildTerrain(state); analyze(state);
      setOp(state, '地形重置（种子 ' + state.seed + '）'); return;
    }
    if (input.pressed('BracketRight')) { state.bombR = Math.min(8, state.bombR + 1); setOp(state, '炸弹半径 → ' + state.bombR + ' 格'); }
    if (input.pressed('BracketLeft'))  { state.bombR = Math.max(1, state.bombR - 1); setOp(state, '炸弹半径 → ' + state.bombR + ' 格'); }
    if (input.pressed('KeyC')) { state.showComp = !state.showComp; setOp(state, state.showComp ? '连通域染色开：每个连通块一色' : '连通域染色关'); }
    if (input.pressed('KeyG')) { state.showGrid = !state.showGrid; }

    var m = input.mouse;
    if (m.down) {                       // 按住拖动 = 导弹拖尾
      var g = mouseToGrid(m.x, m.y);
      if (g) {
        if (state.prevMouse && (state.prevMouse.gx !== g.gx || state.prevMouse.gy !== g.gy)) {
          carveLine(state, state.prevMouse.gx, state.prevMouse.gy, g.gx, g.gy, 1);
        } else {
          carveBall(state, g.gx, g.gy, 1);
        }
        state.prevMouse = { gx: g.gx, gy: g.gy };
        didCarve = true;
      }
    } else {
      state.prevMouse = null;
    }
    if (m.clicked) {                    // 单击 = 放炸弹
      var g2 = mouseToGrid(m.x, m.y);
      if (g2) { carveBall(state, g2.gx, g2.gy, state.bombR); didCarve = true; }
    }

    if (didCarve) {                     // 每次破坏后重跑连通域分析
      analyze(state);
      setOp(state, '破坏完成：BFS 访问 ' + state.bfsVisits + ' 格 · 连通域 ' + state.components + ' · 孤岛 ' + state.islands);
    }

    for (var i = state.falling.length - 1; i >= 0; i--) {   // 孤岛整体自由落体
      var b = state.falling[i];
      b.vy += GRAV * dt;
      b.oy += b.vy * dt;
      var bottom = oy + b.maxY * cell + cell + b.oy;
      if (bottom >= groundY) {          // 落地：转成静态碎块
        var land = groundY - (oy + b.maxY * cell + cell);
        for (var k = 0; k < b.cells.length; k++) {
          var c = b.cells[k];
          if (state.rubble.length < 700) state.rubble.push({ sx: ox + c.x * cell, sy: oy + c.y * cell + land, col: c.col });
        }
        state.falling.splice(i, 1);
      }
    }
    state.lastOpT -= dt;
  },

  draw: function (state, ctx) {
    var gx, gy, i;
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);

    for (gy = 0; gy < rows; gy++) {     // 地形
      for (gx = 0; gx < cols; gx++) {
        var idx = gy * cols + gx;
        if (!state.solid[idx]) continue;
        ctx.fillStyle = state.showComp ? "hsl(" + ((state.compArr[idx] * 67) % 360) + ",65%,55%)" : COLORS[state.color[idx]];
        ctx.fillRect(ox + gx * cell, oy + gy * cell, cell, cell);
      }
    }
    if (state.showGrid) {               // 网格线
      ctx.strokeStyle = 'rgba(77,143,214,0.10)';
      ctx.beginPath();
      for (gx = 0; gx <= cols; gx++) { ctx.moveTo(ox + gx * cell, oy); ctx.lineTo(ox + gx * cell, groundY); }
      for (gy = 0; gy <= rows; gy++) { ctx.moveTo(ox, oy + gy * cell); ctx.lineTo(ox + cols * cell, oy + gy * cell); }
      ctx.stroke();
    }

    for (i = 0; i < state.falling.length; i++) {  // 孤岛：金色高亮 + 坠落
      var b = state.falling[i];
      for (var k = 0; k < b.cells.length; k++) {
        var c = b.cells[k];
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(ox + c.x * cell, oy + c.y * cell + b.oy, cell, cell);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1;
        ctx.strokeRect(ox + c.x * cell, oy + c.y * cell + b.oy, cell, cell);
      }
    }
    for (i = 0; i < state.rubble.length; i++) {   // 落地碎块（压暗一档）
      var r = state.rubble[i];
      ctx.fillStyle = COLORS[r.col];
      ctx.globalAlpha = 0.55;
      ctx.fillRect(r.sx, r.sy, cell, cell);
      ctx.globalAlpha = 1;
    }

    ctx.font = '13px monospace';
    ctx.fillStyle = '#9db4d0';
    ctx.fillText('格子 ' + state.cells + ' · 连通域 ' + state.components + ' · 孤岛 ' + state.islands + ' · BFS 访问 ' + state.bfsVisits, 12, 22);
    ctx.fillText('单击炸坑(半径' + state.bombR + ') · 按住拖尾开槽 · R 重置 · [ ] 半径 · C 染色 · G 网格', 12, 40);
    ctx.fillStyle = state.lastOpT > 0 ? '#fbbf24' : '#5b7397';
    ctx.fillText(state.lastOp, 12, 60);
  }
});

function mouseToGrid(mx, my) {
  var gx = Math.floor((mx - ox) / cell), gy = Math.floor((my - oy) / cell);
  if (gx < 0 || gx >= cols || gy < 0 || gy >= rows) return null;
  return { gx: gx, gy: gy };
}

function buildTerrain(state) {         // 多倍频 sin + 种子抖动生成山丘
  var rnd = makeRng(state.seed), gx, gy, k;
  var phase = rnd() * 6.283;
  var height = new Array(cols);
  for (gx = 0; gx < cols; gx++) {
    var h = 8 + Math.sin(gx * 0.16) * 3.5 + Math.sin(gx * 0.31 + phase) * 2.5 + (rnd() - 0.5) * 5;
    height[gx] = Math.max(4, Math.min(rows - 1, Math.round(h)));
  }
  for (var i = 0; i < rows * cols; i++) { state.solid[i] = false; state.color[i] = 0; }
  for (gx = 0; gx < cols; gx++) {
    var h = height[gx];
    for (k = 0; k < h; k++) {
      gy = rows - 1 - k;
      var idx = gy * cols + gx;
      state.solid[idx] = true;
      var col = 3;                     // 石心
      if (k <= 1) col = 0;             // 基岩（底 2 行，不可破坏）
      else if (k >= h - 1) col = 1;    // 草皮
      else if (k >= h - 4) col = 2;    // 泥土
      state.color[idx] = col;
    }
  }
}

function carveBall(state, gx, gy, r) {  // 圆形减法：把圆内格子置空（基岩除外）
  for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy > r * r) continue;
    var x = gx + dx, y = gy + dy;
    if (x < 0 || x >= cols || y < 0 || y >= rows) continue;
    if (y >= rows - 2) continue;       // 地底基座不可破坏
    state.solid[y * cols + x] = false;
  }
}

function carveLine(state, x0, y0, x1, y1, r) {
  var steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (var s = 0; s <= steps; s++) {
    var t = steps ? s / steps : 0;
    carveBall(state, Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), r);
  }
}

function analyze(state) {              // BFS 连通域分析，O(cells)
  var i, gx, gy;
  for (i = 0; i < state.mark.length; i++) { state.mark[i] = 0; state.compArr[i] = 0; }
  var q = [], compId = 0, visits = 0, cells = 0, groundComp = -1, islands = 0;

  for (gy = 0; gy < rows; gy++) for (gx = 0; gx < cols; gx++) {
    var idx = gy * cols + gx;
    if (!state.solid[idx] || state.mark[idx]) continue;
    compId++;
    var head = 0; q.length = 0;
    state.mark[idx] = 1; state.compArr[idx] = compId; q.push(idx); visits++; cells++;
    var touchesGround = false;
    while (head < q.length) {
      var cur = q[head++];
      var cx = cur % cols, cy = (cur - cx) / cols;
      if (cy >= rows - 2) touchesGround = true;   // 摸到地底基座
      if (cy > 0 && state.solid[cur - cols] && !state.mark[cur - cols]) { state.mark[cur - cols] = 1; state.compArr[cur - cols] = compId; q.push(cur - cols); visits++; cells++; }
      if (cy < rows - 1 && state.solid[cur + cols] && !state.mark[cur + cols]) { state.mark[cur + cols] = 1; state.compArr[cur + cols] = compId; q.push(cur + cols); visits++; cells++; }
      if (cx > 0 && state.solid[cur - 1] && !state.mark[cur - 1]) { state.mark[cur - 1] = 1; state.compArr[cur - 1] = compId; q.push(cur - 1); visits++; cells++; }
      if (cx < cols - 1 && state.solid[cur + 1] && !state.mark[cur + 1]) { state.mark[cur + 1] = 1; state.compArr[cur + 1] = compId; q.push(cur + 1); visits++; cells++; }
    }
    if (touchesGround) groundComp = compId; else islands++;
  }
  state.bfsVisits = visits; state.components = compId; state.islands = islands;

  var removed = 0;
  if (islands > 0) {                    // 收集孤岛格子 → 摘出网格 → 转坠落块
    var collect = {};
    for (gy = 0; gy < rows; gy++) for (gx = 0; gx < cols; gx++) {
      idx = gy * cols + gx;
      if (state.solid[idx] && state.compArr[idx] !== groundComp) {
        var cid = state.compArr[idx];
        if (!collect[cid]) collect[cid] = [];
        collect[cid].push({ x: gx, y: gy, col: state.color[idx] });
        state.solid[idx] = false;
        removed++;
      }
    }
    for (var cid2 in collect) spawnIslandChunk(state, collect[cid2]);
  }
  state.cells = cells - removed;
}

function spawnIslandChunk(state, cells) {
  var maxY = -1;
  for (var i = 0; i < cells.length; i++) if (cells[i].y > maxY) maxY = cells[i].y;
  state.falling.push({ cells: cells, maxY: maxY, oy: 0, vy: 0 });
}

function setOp(state, s) { state.lastOp = s; state.lastOpT = 3; }
`
    },
    {
      type: 'text',
      title: '试一试（课内可选项，不是作业）',
      html: `<ul>
  <li>按住鼠标从地表斜着划一道到山腰：拖尾开槽会沿整条线挖空，划出的会不会形成孤岛？观察左上角「孤岛」计数从 0 跳到 1 的瞬间——那条槽把墙顶和地底切断了。</li>
  <li>对着同一根「柱子」连续单击放炸弹，把柱腰炸细：第一次连通域仍为 1（还连着），再炸一下柱子应声而断，孤岛整块坠落。体会「破坏」不是一瞬间的美术效果，而是<b>连通性被一次减法击穿</b>的那个临界点。</li>
  <li>打开 <b>C</b> 连通域染色：炸断前只有一色（大地一块），炸断后瞬间出现第二种颜色（孤岛）。这就是 flood fill 在引擎里「看见」的东西。</li>
  <li>狂按 <b>]</b> 把半径顶到 8，再在地表一角连点三下：看「BFS 访问」计数只随格子总数变，不随炸的次数变——连通域分析是 O(格子数)，这是引擎敢每帧重算的底气。</li>
  <li>看每一块坠落的孤岛都是<b>金色、整块下落</b>：它不是逐个格子各掉各的，而是一个刚性的 cell 集合。这正是 L5.2 里「坠落物」的雏形——孤岛就是未来的 body。</li>
</ul>`
    },
    {
      type: 'source',
      files: [
        { path: 'modules/tilemap/tile_map_layer.cpp', note: '2D 的「tile 即数据」：看成员变量 HashMap<Vector2i, CellData> tile_map_layer_data（tile_map_layer.h 约 390 行）——稀疏哈希表只存「有格子的坐标」，空地零内存；set_cell / erase_cell 两个函数就是「写入」与「破坏」。搜 erase_cell 看一格的删除怎么触发渲染/物理/导航三套 quadrant 失效重算。' },
        { path: 'modules/gridmap/grid_map.cpp', note: '3D 体素的同构实现：HashMap<IndexKey, Cell> cell_map（grid_map.h 约 187 行）存每个实心格；set_cell_item（约 512 行）做 has/erase/insert——破坏 = 从哈希表删键。再看 _update_octants 一族：同一份 cell_map 被渲染、物理（get_physics_body_from_octant_coord）、寻路（update_octant_navigation）三个子系统各自读——本课「单一真源」的引擎级证据。' },
        { path: 'modules/csg/csg_shape.cpp', note: '炸坑 = 布尔减法：搜 OPERATION_SUBTRACTION（约 473、1222 行）与 _build_brush——CSG 用「凸体减凸体」挖洞。本课是格子级减法，CSG 是网格级减法，同一思想的两档精度；对照读能看清「减法」如何从离散升维到连续。' }
      ]
    },
    {
      type: 'text',
      title: '小结',
      html: `<p>用一个 50 行的网格就把「破坏」讲透了，因为它底子上不是渲染问题，而是<b>数据问题</b>。</p>
<p>回到贯穿全课的三个灵魂拷问，给本课各答一句：</p>
<p><b>数据怎么流动？</b>玩家的鼠标坐标 → 转成格子坐标 → 对 <code>solid[]</code> 做一次圆形减法 → BFS 读 <code>solid[]</code> 算连通域 → 孤岛格子被摘进 <code>falling[]</code> 交给坠落物理——全程只有两份数组（实/空 + 颜色）在流动。</p>
<p><b>所有权归谁？</b>格子数据只有一份真源（grid 数组）；孤岛从「地形的 <code>solid[]</code>」移栋到「坠落块的 <code>cells[]</code>」的那一刻，是一次所有权的显式转移——谁持有这组格子，谁负责画它、移它、落地后归档进 <code>rubble[]</code>。</p>
<p><b>什么时候发生？</b>破坏不是每帧都在算的持续过程，而是<b>事件驱动</b>：只有当一次减法发生，才重跑一次 O(格子数) 的连通域分析；坠落则是此后的每帧物理积分。引擎里同样的分工——菜单式的按需重算 + 每帧的物理推进。</p>
<p>下一课 B5 我们把这个「孤岛坠落」接入真正的 PhysicsServer 碰撞事件，让它撞碎墙、砸到人——那时你会看见，本课的 <code>falling[]</code> 如何一步步长成一个刚体世界。</p>`
    }
  ]
}