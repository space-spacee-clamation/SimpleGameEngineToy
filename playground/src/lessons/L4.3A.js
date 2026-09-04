// L4.3A · 工业级剔除：BVH 分层与 GPU 驱动
export default {
  id: 'L4.3A',
  title: '工业级剔除：BVH 分层与 GPU 驱动',
  est: '2 小时',
  coreQuestions: [
    '10 万个物体逐个测视锥，一帧就破产——剔除成本怎么从 O(物体数) 变成 O(视锥扫过的块数)？',
    'BVH / 八叉树 / 网格都在分空间，渲染侧为什么偏爱 BVH？树怎么跟着会动的物体活下来？',
    '候选名单本身也排不动时，剔除为什么搬进 compute shader？分簇与时间相干各救哪一摊？',
    '从 Quake 的 PVS 到 Godot 的 HZB，遮挡剔除的谱系是怎么一路演进的？'
  ],
  sections: [
    {
      type: 'text',
      title: '逐个测的天花板：O(n) 这笔账先算清',
      html: `<p>L4.3 实验 B 的世界只有 42 个物体，逐个测一遍连 0.1ms 都用不掉——但把数字换成开放世界的真实规模：<b>10 万个渲染实例</b>，哪怕单个 AABB 六平面测试只要 0.3µs，一帧就是 30ms，而整帧预算才 16ms。更扎心的是：这 10 万次测试里九成以上的结论都是「看不见」。<b>剔除的悖论</b>在此：为了少画而算，算着算着比画还贵。</p>
<p>工业界的解法不是把单次测试写得更聪明（SIMD 能省 4~8 倍，省不回 50 倍），而是换一个问题：<b>别对 10 万个物体逐个提问，把空间组织起来，按「块」提问</b>。这就是空间加速结构（spatial acceleration structure）——L5.1 的物理 broadphase 网格是它在物理侧的表亲，这里说的是渲染侧的正主。</p>
<p>还有一条前提别忘了（L4.3 已铺过）：剔除的对象是<b>渲染实例表</b>，不是场景树节点——没有层级、没有脚本回调、数据平铺缓存友好。加速结构解决的是「表太长」的问题，不是「树不好扫」的问题。</p>`
    },
    {
      type: 'text',
      title: '分层：一棵树的三种结局',
      html: `<p>包围体积层级（<b>BVH</b>，Bounding Volume Hierarchy）：物体套进小包围盒，相邻的小盒再套进大盒，层层向上直到根。视锥测试从根往下走，每个节点只有三种结局：</p>
<ul>
<li><b>整体在外</b>：节点包围盒与视锥不相交 → 整棵子树一个都不测，整砍；</li>
<li><b>整体在内</b>：包围盒整个躺在视锥里（视锥是凸的，四个角都在内则全在内）→ 子树全体通过，一个都不测，全收；</li>
<li><b>骑在边界</b>：只有这种节点才值得继续往下拆。</li>
</ul>
<p>视锥只是屏幕投出的一小块锥体，世界里绝大多数子树属于前两种。于是剔除成本从 O(物体数) 变成 <b>O(视锥扫过的节点数)</b>——与世界大小无关，只与视野内容有关。这就是「物体翻十倍、剔除没慢十倍」的全部秘密。</p>
<table>
  <tr><th>结构</th><th>思路</th><th>强项</th><th>弱项与归属</th></tr>
  <tr><td>均匀网格</td><td>空间切等大格子，只测视锥压到的格子</td><td>实现最简，增删 O(1)</td><td>密度不均时有的格子爆满——L5.1 物理 broadphase 的选择</td></tr>
  <tr><td>八叉树</td><td>空间递归八分</td><td>稀疏大世界友好</td><td>深度失控、跨界物体要重复挂——开放世界流式（D3）常用</td></tr>
  <tr><td>BVH</td><td>按物体位置递归对半切，盒套盒</td><td>不依赖空间均匀性，物体大小悬殊也稳，可增量更新</td><td>更新比网格贵——渲染剔除主流：Godot 4 的 DynamicBVH、Embree、光追全线</td></tr>
</table>
<p>Godot 4 选的是最后一列：每个 scenario 一棵 <b>Dynamic BVH</b>（core/math/dynamic_bvh.h），渲染实例插入即成叶子；物体挪动走增量 refit 而不是重建整棵树，所以「会动的世界」养得起这棵树。L4.3 你在 _scene_cull 里看到的那次「线性扫描」，扫的其实是 <b>BVH 凸查询交出来的候选名单</b>——先粗（树上出候选）后细（对候选过 layer mask、六平面、遮挡），标准两段式。</p>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'bvhcull',
      title: '实验：蛮力 vs BVH——同一帧，测试次数差出一个数量级',
      height: 560,
      code: `// 俯视 2D 世界 + 相机视锥扇形（与 L4.3 实验 B 同一套手感）
// A/D 转向  W/S 前进后退  Q/E 拉远拉近  C 切模式：0 无剔除 / 1 蛮力逐测 / 2 BVH 分层
// T 显示/隐藏 BVH 节点框  R 换世界规模（300 → 900 → 2000）
// 红框=子树整体在外(整砍免检)  紫框=子树整体在内(全收免检)  黄框=骑在边界(继续下拆)
// 物体色：绿=逐测后提交  紫=免检全收  红=逐测被砍  灰=在整砍子树里连测都没测
// 底部「对账」每帧拿全量重算验证 BVH 的提交数——分层是加速，不是近似

var LEAF_SIZE = 8;

engine.run({
  setup: function (state) {
    state.mode = 1;               // 0 无剔除 1 蛮力 2 BVH
    state.density = 1;            // 0/1/2 → 300/900/2000 个物体
    state.showTree = true;
    state.cam = { x: 360, y: 220, ang: -Math.PI / 2, half: 0.6, far: 250 };
    state.msg = '先看蛮力(模式1)逐个测完全部物体，再按 C 切到 BVH';
    state.msgT = 4;
    buildWorld(state);
  },

  update: function (state, dt, input) {
    if (input.pressed('KeyC')) {
      state.mode = (state.mode + 1) % 3;
      setMsg(state, ['模式 0：无剔除——0 次测试，全部提交',
                     '模式 1：蛮力——每帧一个不落逐个测',
                     '模式 2：BVH 分层——整砍/全收子树，只精测骑界的'][state.mode]);
    }
    if (input.pressed('KeyT')) { state.showTree = !state.showTree; }
    if (input.pressed('KeyR')) {
      state.density = (state.density + 1) % 3;
      buildWorld(state);
      setMsg(state, '世界规模：' + state.objs.length + ' 个物体（BVH 已重建）');
    }
    var sp = 190 * dt;
    if (input.down('KeyA')) state.cam.ang -= 2.4 * dt;
    if (input.down('KeyD')) state.cam.ang += 2.4 * dt;
    if (input.down('KeyW')) { state.cam.x += Math.cos(state.cam.ang) * sp; state.cam.y += Math.sin(state.cam.ang) * sp; }
    if (input.down('KeyS')) { state.cam.x -= Math.cos(state.cam.ang) * sp; state.cam.y -= Math.sin(state.cam.ang) * sp; }
    if (input.down('KeyQ')) state.cam.far = Math.max(100, state.cam.far - 260 * dt);
    if (input.down('KeyE')) state.cam.far = Math.min(430, state.cam.far + 260 * dt);
    state.cam.x = Math.min(706, Math.max(14, state.cam.x));
    state.cam.y = Math.min(430, Math.max(36, state.cam.y));
    runCull(state);
    state.msgT -= dt;
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17'; ctx.fillRect(0, 0, engine.W, engine.H);
    ctx.strokeStyle = '#141d2e'; ctx.lineWidth = 1;
    for (var gx = 0; gx < 720; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 30); ctx.lineTo(gx, 360); ctx.stroke(); }
    for (var gy = 40; gy < 360; gy += 40) { ctx.beginPath(); ctx.moveTo(8, gy); ctx.lineTo(712, gy); ctx.stroke(); }

    // 视锥扇形
    var c = state.cam;
    ctx.fillStyle = 'rgba(90,169,230,0.12)';
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.arc(c.x, c.y, c.far, c.ang - c.half, c.ang + c.half);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#5aa9e6'; ctx.lineWidth = 1.5; ctx.stroke();

    // 物体（方点：2000 个一起画不卡）
    for (var i = 0; i < state.objs.length; i++) {
      var o = state.objs[i];
      ctx.fillStyle = o.state === 2 ? '#34d399' : (o.state === 3 ? '#9b8cff' : (o.state === 1 ? '#f87171' : '#3d5273'));
      ctx.fillRect(o.x - o.r, o.y - o.r, o.r * 2, o.r * 2);
    }

    // BVH 节点框：全树淡描 + 本帧三色标注
    if (state.showTree && state.mode === 2) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(60,84,120,0.28)';
      for (i = 0; i < state.nodes.length; i++) {
        var n = state.nodes[i];
        ctx.strokeRect(n.x0, n.y0, n.x1 - n.x0, n.y1 - n.y0);
      }
      drawNodes(state, ctx, state.cutNodes, 'rgba(248,113,113,0.10)', 'rgba(248,113,113,0.6)');
      drawNodes(state, ctx, state.freeNodes, 'rgba(155,140,255,0.10)', 'rgba(155,140,255,0.65)');
      ctx.strokeStyle = 'rgba(251,191,36,0.7)';
      for (i = 0; i < state.strNodes.length; i++) {
        var s = state.strNodes[i];
        ctx.strokeRect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0);
      }
    }

    // 相机本体
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath(); ctx.arc(c.x, c.y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x + Math.cos(c.ang) * 16, c.y + Math.sin(c.ang) * 16); ctx.stroke();

    // HUD
    ctx.font = '12px monospace';
    ctx.fillStyle = '#7d93b3';
    ctx.fillText('A/D 转向 · W/S 移动 · Q/E 远近 · C 切模式 · T 节点框 · R 换规模', 12, 20);
    var N = state.objs.length;
    var modes = ['无剔除(全画)', '蛮力逐测', 'BVH 分层'];
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText('模式 ' + state.mode + ':' + modes[state.mode] + '    物体: ' + N + '    提交: ' + state.submitted, 12, 386);
    ctx.fillStyle = '#9db4d0';
    ctx.fillText('逐个测试 ' + state.perTests + ' 次 · 免检全收 ' + state.freeAccepted + ' 个 · 整砍子树 ' + state.cutNodes.length +
      ' 棵 · 访问节点 ' + state.nodeVisits, 12, 404);
    if (state.mode === 2 && N > 0) {
      var pct = Math.round((1 - state.perTests / N) * 100);
      ctx.fillStyle = '#34d399';
      ctx.fillText('蛮力基准每帧要测 ' + N + ' 次 → BVH 只测 ' + state.perTests + ' 次，省 ' + pct + '%', 12, 422);
      ctx.fillStyle = state.match ? '#34d399' : '#f87171';
      ctx.fillText(state.match ? '对账 ✓ BVH 提交数 = 全量重算（分层是加速，不是近似）' : '对账 ✗ 有 bug', 12, 436);
    } else if (state.mode === 1) {
      ctx.fillStyle = '#f87171';
      ctx.fillText('蛮力:每帧把 ' + N + ' 个物体全测一遍——成本只跟物体总数走', 12, 422);
      ctx.fillStyle = '#7d93b3';
      ctx.fillText('按 C 切到 BVH，回来对比「逐个测试」', 12, 436);
    } else {
      ctx.fillStyle = '#7d93b3';
      ctx.fillText('无剔除:0 次几何测试——但 ' + N + ' 个全要画，GPU 在替你付账', 12, 422);
    }
    if (state.msgT > 0) { ctx.fillStyle = '#fbbf24'; ctx.fillText(state.msg, 12, 36); }
  }
});

function setMsg(state, s) { state.msg = s; state.msgT = 3.5; }

function normAng(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 世界：成簇撒物体（簇状分布让 BVH 的块优势肉眼可见） ----------

function buildWorld(state) {
  var counts = [300, 900, 2000];
  var N = counts[state.density];
  state.rng = mulberry32(424242 + state.density * 777);
  state.objs = [];
  var clusters = [];
  var nc = 12 + state.density * 4;
  for (var i = 0; i < nc; i++) {
    clusters.push({ x: 45 + state.rng() * 610, y: 45 + state.rng() * 265 });
  }
  for (i = 0; i < N; i++) {
    var cc = clusters[Math.floor(state.rng() * clusters.length)];
    var a = state.rng() * 6.2832;
    var rr = state.rng() * state.rng() * 55;   // 往簇心聚拢
    state.objs.push({ x: cc.x + Math.cos(a) * rr, y: cc.y + Math.sin(a) * rr, r: 3 + state.rng() * 4, state: 0 });
  }
  buildBVH(state);
}

// ---------- BVH：中位数对半切，叶子最多 LEAF_SIZE 个 ----------

function buildBVH(state) {
  var idx = [];
  for (var i = 0; i < state.objs.length; i++) idx.push(i);
  state.nodes = [];
  buildNode(state, idx, 0);
  state.root = 0;
}

function buildNode(state, idx, axis) {
  var me = state.nodes.length;
  state.nodes.push({ x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9, left: -1, right: -1, list: null });
  var n = state.nodes[me];
  for (var i = 0; i < idx.length; i++) {
    var o = state.objs[idx[i]];
    if (o.x - o.r < n.x0) n.x0 = o.x - o.r;
    if (o.x + o.r > n.x1) n.x1 = o.x + o.r;
    if (o.y - o.r < n.y0) n.y0 = o.y - o.r;
    if (o.y + o.r > n.y1) n.y1 = o.y + o.r;
  }
  if (idx.length > LEAF_SIZE) {
    idx.sort(function (a, b) {
      var oa = state.objs[a], ob = state.objs[b];
      return axis === 0 ? oa.x - ob.x : oa.y - ob.y;
    });
    var mid = idx.length >> 1;
    n.left = buildNode(state, idx.slice(0, mid), 1 - axis);
    n.right = buildNode(state, idx.slice(mid), 1 - axis);
  } else {
    n.list = idx;   // 叶子直接持有这撮物体
  }
  return me;
}

// ---------- 视锥几何：节点三种结局 + 物体逐测 ----------

// 节点分类：-1 整体在外(整砍) / 0 骑在边界(下拆) / 1 整体在内(全收)
// 扇形是凸的：四个角全在扇形内 ⇒ 整个盒子在内（全收的合法性所在）
function classify(state, n) {
  var c = state.cam;
  var nx = Math.max(n.x0, Math.min(c.x, n.x1));
  var ny = Math.max(n.y0, Math.min(c.y, n.y1));
  var ddx = c.x - nx, ddy = c.y - ny;
  if (ddx * ddx + ddy * ddy > c.far * c.far) return -1;   // 最近点都超出 far
  var cx = [n.x0, n.x1, n.x0, n.x1];
  var cy = [n.y0, n.y0, n.y1, n.y1];
  var inAll = true, minA = 1e9, maxA = -1e9;
  for (var i = 0; i < 4; i++) {
    var dx = cx[i] - c.x, dy = cy[i] - c.y;
    var a = normAng(Math.atan2(dy, dx) - c.ang);
    if (a < minA) minA = a;
    if (a > maxA) maxA = a;
    if (dx * dx + dy * dy > c.far * c.far || Math.abs(a) > c.half) inAll = false;
  }
  if (minA > c.half || maxA < -c.half) return -1;         // 角区间整段在扇形外
  return inAll ? 1 : 0;
}

function inFrustum(state, o) {
  // 纯「中心点在扇形内」判定：与 classify 的盒子四角判定严格同一语义，
  // 不加任何 r 余量——否则蛮力与 BVH 的对账就会打架
  var c = state.cam, dx = o.x - c.x, dy = o.y - c.y;
  var d2 = dx * dx + dy * dy;
  if (d2 > c.far * c.far) return false;
  return Math.abs(normAng(Math.atan2(dy, dx) - c.ang)) <= c.half;
}

// ---------- 三种模式的每帧剔除 ----------

function runCull(state) {
  var i;
  state.perTests = 0; state.nodeVisits = 0; state.freeAccepted = 0;
  state.cutNodes = []; state.freeNodes = []; state.strNodes = [];
  if (state.mode === 0) {
    for (i = 0; i < state.objs.length; i++) state.objs[i].state = 2;
    state.submitted = state.objs.length;
    return;
  }
  if (state.mode === 1) {
    var pass = 0;
    for (i = 0; i < state.objs.length; i++) {
      state.perTests++;
      var o = state.objs[i];
      o.state = inFrustum(state, o) ? 2 : 1;
      if (o.state === 2) pass++;
    }
    state.submitted = pass;
    return;
  }
  // 模式 2：BVH。先全部标成「没测过」，树说了算
  for (i = 0; i < state.objs.length; i++) state.objs[i].state = 0;
  visit(state, state.nodes[state.root]);
  var p2 = 0;
  for (i = 0; i < state.objs.length; i++) if (state.objs[i].state === 2 || state.objs[i].state === 3) p2++;
  state.submitted = p2;
  // 对账：悄悄全量重算一遍提交数（不计入展示用的测试数）
  var truth = 0;
  for (i = 0; i < state.objs.length; i++) if (inFrustum(state, state.objs[i])) truth++;
  state.match = truth === p2;
}

function visit(state, n) {
  state.nodeVisits++;
  var c = classify(state, n);
  if (c === -1) { state.cutNodes.push(n); return; }
  if (c === 1) {
    state.freeNodes.push(n);
    acceptAll(state, n);   // 内部节点也能整体在内——递归整棵子树全收
    return;
  }
  state.strNodes.push(n);
  if (n.list) {
    for (var j = 0; j < n.list.length; j++) {
      state.perTests++;
      var o = state.objs[n.list[j]];
      o.state = inFrustum(state, o) ? 2 : 1;
    }
  } else {
    visit(state, state.nodes[n.left]);
    visit(state, state.nodes[n.right]);
  }
}

// 全收：子树内所有物体免检通过，逐个标紫（不计数、不测试）
function acceptAll(state, n) {
  if (n.list) {
    for (var i = 0; i < n.list.length; i++) { state.objs[n.list[i]].state = 3; state.freeAccepted++; }
    return;
  }
  acceptAll(state, state.nodes[n.left]);
  acceptAll(state, state.nodes[n.right]);
}

function drawNodes(state, ctx, arr, fill, stroke) {
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  for (var i = 0; i < arr.length; i++) {
    var n = arr[i];
    ctx.fillRect(n.x0, n.y0, n.x1 - n.x0, n.y1 - n.y0);
    ctx.strokeRect(n.x0, n.y0, n.x1 - n.x0, n.y1 - n.y0);
  }
}
`
    },
    {
      type: 'text',
      title: '试一试（课内可选）',
      html: `<ul>
<li><b>默认 900 个物体，按 C 切到模式 2：</b>盯住「逐个测试」一栏——蛮力要测 900 次，BVH 往往只测一两百次，且底部对账恒为 ✓（分层是加速，不是近似）。</li>
<li><b>把相机开进最密的物体簇、正对它们：</b>看「免检全收」上涨——整棵子树躺在视锥里时，里面的物体一个都没被单独测过。</li>
<li><b>按两下 R 换到 2000 个物体再对比：</b>蛮力的测试数线性翻倍，BVH 只多一点点——树深是对数的，可见数不变，这就是「物体翻十倍剔除不翻倍」的现场版。</li>
<li><b>T 关掉节点框只看颜色：</b>紫=免检全收，绿=骑界后逐测通过，红=逐测被砍，灰=在整砍子树里连测都没轮到。</li>
<li><b>Q 把 far 拉到 430：</b>远平面以外的整片子树被一次整砍（红框成片扩大）——距离维度的免检；再把视野扫过全场，注意视锥越宽、整砍越少：分块收益与「视野内容」强相关，视锥盖住世界时逐测数就逼近蛮力。</li>
</ul>`
    },
    {
      type: 'text',
      title: 'CPU 也不够时：分簇、搬 GPU、吃相干性',
      html: `<p>BVH 把 O(n) 砍成 O(树深 + 可见数) 之后，工业界还在往上叠三层狠活：</p>
<ul>
<li><b>按距离/大小分簇</b>（Unreal 的 distance-size culling）：草、石子这类小物件数以百万计，先把它们按位置并成簇，一簇一个 AABB——先用 SIMD 测簇（几千次），簇过了才轮到簇内实例。测试次数从百万级塌到千级。</li>
<li><b>GPU-driven culling</b>：实例数据常驻显存，compute shader 逐实例/逐簇做视锥+遮挡测试，结果直接写 indirect draw 的参数——CPU 只说一句「去画」，从不下场逐个过手。UE5 Nanite、Doom Eternal、Unity 的 GPU Resident Drawer 都是这条路：<b>剔除从「CPU 的每帧作业」变成「GPU 管线里的一个 pass」</b>，顺便连多线程调度都省了。</li>
<li><b>时间相干性</b>：相机是连续转的，上一帧可见的这帧大概率还可见——结果复用、增量更新、隔帧轮换抽测一部分，都是合法的瞒天过海。</li>
</ul>
<p>遮挡剔除也早已自成谱系（L4.3 只摸到今天的 HZB 一环）：<b>Quake 的 PVS/portal</b>（离线预计算「从这个房间能看见哪些房间」，运行时查表）→ <b>软件光栅遮挡体</b>（Umbra/CryEngine，把大件遮挡物光栅化成小深度图）→ <b>HZB 深度金字塔</b>（Godot 4 的 renderer_scene_occlusion_cull）→ GPU 逐簇查询。哲学从没变过：<b>遮挡判定也分层，大块被挡则块内免测</b>。最后别忘了几种最便宜的「剔除」：LOD、距离淡出、instancing 直接把 n 本身压小（D5）、雾遮远山，以及 E3 那个网络版剔除——兴趣管理。</p>`
    },
    {
      type: 'source',
      title: '源码走读：剔除的工业化现场',
      files: [
        { path: 'core/math/dynamic_bvh.h', note: 'DynamicBVH 本尊：insert/aabb_query/convex_query，物体挪动走增量更新而不是重建——「会动的树」怎么不塌，工业动态 BVH 的完整实现。建议搜索：insert、convex_query、aabb_query。' },
        { path: 'servers/rendering/renderer_scene_cull.cpp', note: '剔除的调度台：先拿相机平面组对 scenario 的 BVH 做凸查询收候选名单，_scene_cull 再逐候选过 layer/可见标志/六平面——「先粗后细」两段式，L4.3 那个大 if 是第二段。建议搜索：_scene_cull、cull_convex。' },
        { path: 'servers/rendering/renderer_scene_occlusion_cull.cpp', note: '遮挡谱系的现代一环：HZB 深度金字塔 + is_occluded 的 O(1) 粗判——遮挡判定同样先大块后小块，与视锥剔除共用「分层免检」哲学。建议搜索：HZBuffer、update_mips、is_occluded。' }
      ]
    },
    {
      type: 'text',
      title: '小结',
      html: `<p>三个老问题的剔除版答案。<b>数据怎么流动</b>：相机平面组 → BVH 自根向下凸查询 → 候选名单 → 逐实例精测（layer/标志/遮挡）→ 本帧可见列表交给 draw call。<b>所有权归谁</b>：scenario 拥有整棵 Dynamic BVH，实例拥有自己的叶子，物体挪动走增量 refit——树是索引不是本体，L4.3 那张平铺实例表才是。<b>什么时候发生</b>：插入/移动时增量更新树（按需），剔除在渲染线程每帧出图前（每帧），GPU-driven 版本则整个搬进 command list（并行）。</p>
<p>一句话带走：<b>先粗后细、按块免检——剔除成本正比于视锥扫过的块数，而不是世界的物体数</b>。这就是工业界敢往场景里塞一百万个物体的底气。下一课 L4.4 后处理，我们走出剔除，看画出来的像素怎么被一张张贴布再加工。</p>`
    }
  ]
}
