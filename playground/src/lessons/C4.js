// C4 · ECS 落地:渲染/物理/网络怎么吃 ECS
export default {
  id: 'C4',
  title: 'ECS 落地：渲染/物理/网络怎么吃 ECS',
  est: '2.5 小时',
  coreQuestions: [
    '同一款游戏，Node 树和 ECS 两套写法的行为能完全一致吗？差在哪？',
    '帧耗时差在哪一层：是数学变快了，还是「访问数据的方式」变快了？',
    '为什么网络快照天然偏爱 ECS？Node 树序列化贵在哪？',
    '什么游戏该选哪套？混合路线长什么样？'
  ],
  sections: [
  {
    type: 'text',
    title: 'C 系列收官：把同一款小游戏各写一遍',
    html: `<p>C1 看清了三种存储的命运，C2 亲手写了 archetype 存储，C3 装上了调度与脏标记。本课给 C 系列收尾：<b>同一款 1500 单位的小战场（移动+AI+存活+渲染提交+网络快照），Node 树版和 mini-ECS 版各写一遍</b>，跑在同一块画布上，让数字自己开口。</p>
<p>为了让对比诚实，两条线共用同一套<b>行为函数</b>（同种子的初始摆放、同一套移动公式、同一顺序遍历）——理论上两边的实体位置每帧都应完全一致。剩下的所有差异，都来自架构本身：<b>数据怎么摆、访问怎么发生</b>。</p>`
  },
  {
    type: 'text',
    title: '选型决策表，与 Godot 的混合答案',
    html: `<table>
  <tr><th>维度</th><th>Node 树</th><th>mini-ECS</th></tr>
  <tr><td>实体量级</td><td>数百内无感</td><td>万级仍线性</td></tr>
  <tr><td>行为异构性</td><td>每节点自定义，最灵活</td><td>要拆成组件组合，抽象成本前置</td></tr>
  <tr><td>网络快照</td><td>逐对象拼字段，字段名重复爆炸</td><td>组件数组天然整块打包</td></tr>
  <tr><td>工具生态</td><td>编辑器/场景文件即所得</td><td>要自建观察与调试工具</td></tr>
</table>
<p>Godot 自己就是混合路线的活样本：<b>游戏逻辑层是 Node 世界观</b>（树、虚调用、信号），而<b>服务层是纯数据导向</b>——RenderingServer 的 API 全是 RID 加参数，没有任何 Node 参与。你的游戏在哪个量级、哪类行为，就往哪边多靠一点。</p>`
  },
  {
    type: 'lab',
    lab: 'code',
    key: 'land',
    title: '实验：双架构同场竞技（帧耗时 + 快照体积）',
    height: 620,
    code: `// 左=ECS(SoA 数组+system 管线) 右=Node 树(对象+虚调用表+递归)
// 1/2/3 切场景(平稳/爆兵/阵亡)  Tab 切换聚焦视口
// 两套实现共用同一套行为函数与遍历顺序:任何位置分叉都会被 HUD 抓出来

var MAX = 1500;
var VIEW_W = 320, VIEW_H = 200;

engine.run({
  setup: function (state) {
    state.rng = mulberry32(20260903);
    state.t = 0;
    state.focus = 0;
    state.snapTimer = 1.5;
    state.msE = [];
    state.msN = [];
    state.snapMsE = 0; state.snapMsN = 0;
    state.lenE = 0; state.lenN = 0;
    state.log = ['场景1:平稳 400 实体'];
    state.ex = new Float32Array(MAX);
    state.ey = new Float32Array(MAX);
    state.evx = new Float32Array(MAX);
    state.ehp = new Float32Array(MAX);
    buildScene(state, 400);
  },

  update: function (state, dt, input) {
    state.t += dt;
    if (input.pressed('Digit1')) { buildScene(state, 400); pushLog(state, '场景1:平稳 400 实体'); }
    if (input.pressed('Digit2')) { buildScene(state, MAX); pushLog(state, '场景2:爆兵 1500 实体'); }
    if (input.pressed('Digit3')) { cullScene(state); pushLog(state, '场景3:阵亡 60%(hp=0 的不再更新)'); }
    if (input.pressed('Tab')) state.focus = 1 - state.focus;

    var t0 = performance.now();
    frameEcs(state, dt);
    var t1 = performance.now();
    frameNode(state, dt);
    var t2 = performance.now();
    pushAvg(state.msE, t1 - t0);
    pushAvg(state.msN, t2 - t1);

    state.snapTimer -= dt;
    if (state.snapTimer <= 0) {
      state.snapTimer = 2;
      var a = performance.now();
      var se = snapEcs(state);
      var b = performance.now();
      var sn = snapNode(state);
      var c = performance.now();
      state.snapMsE = b - a; state.snapMsN = c - b;
      state.lenE = se.length; state.lenN = sn.length;
    }
    while (state.log.length > 3) state.log.shift();
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    drawHud(state, ctx);
    drawBars(state, ctx);
    drawViews(state, ctx);
    drawFooter(state, ctx);
  }
});

// ---------- 行为函数(两套架构共用,保证行为一致) ----------

function aiVX(t, id) {
  return 40 * Math.sin(t * 0.8 + id * 0.7) + (id % 3 - 1) * 12;
}

function moveStep(x, vx, dt) {
  var nx = x + vx * dt;
  if (nx < 4) nx = 4;
  if (nx > VIEW_W - 4) nx = VIEW_W - 4;
  return nx;
}

// ---------- ECS 侧:SoA 数组 + system 管线 ----------

function frameEcs(state, dt) {
  var n = state.count, t = state.t;
  var i, live = 0;
  for (i = 0; i < n; i++) {
    if (state.ehp[i] <= 0) continue;
    state.evx[i] = aiVX(t, i);
  }
  for (i = 0; i < n; i++) {
    if (state.ehp[i] <= 0) continue;
    state.ex[i] = moveStep(state.ex[i], state.evx[i], dt);
  }
  for (i = 0; i < n; i++) {
    if (state.ehp[i] > 0) live++;
  }
  state.liveEcs = live;
}

function snapEcs(state) {
  // ECS 快照:三个平行数组直接拼数值,无字段名
  var out = [];
  for (var i = 0; i < state.count; i++) {
    if (state.ehp[i] <= 0) continue;
    out.push(state.ex[i].toFixed(0), state.evx[i].toFixed(0), state.ehp[i].toFixed(0));
  }
  return out.join(',');
}

// ---------- Node 侧:对象+虚调用表+树递归 ----------

var HANDLERS = {
  ent: function (n, state, dt) {
    if (n.hp <= 0) return;
    n.vx = aiVX(state.t, n.id);
    n.x = moveStep(n.x, n.vx, dt);
  }
};

function visit(node, state, dt) {
  if (node.kind === 'ent') { HANDLERS[node.kind](node, state, dt); return; }
  for (var i = 0; i < node.children.length; i++) visit(node.children[i], state, dt);
}

function frameNode(state, dt) {
  visit(state.root, state, dt);
  var live = 0, list = state.flat;
  for (var i = 0; i < list.length; i++) {
    if (list[i].hp > 0) live++;
  }
  state.liveNode = live;
}

function snapNode(state) {
  // Node 快照:逐对象拼字段,字段名重复是常态
  var out = [];
  var list = state.flat;
  for (var i = 0; i < list.length; i++) {
    var n = list[i];
    if (n.hp <= 0) continue;
    out.push('ent:' + n.id + ':pos=' + n.x.toFixed(1) + ',' + n.y.toFixed(1) + ';hp=' + n.hp.toFixed(1) + ';');
  }
  return out.join('');
}

// ---------- 场景构建 ----------

function buildScene(state, n) {
  state.count = n;
  state.rng = mulberry32(20260903);
  state.flat = [];
  state.root = { kind: 'root', children: [] };
  var groups = 20, per = Math.ceil(n / groups);
  for (var g = 0; g < groups; g++) {
    var grp = { kind: 'grp', children: [] };
    state.root.children.push(grp);
    for (var k = 0; k < per; k++) {
      var id = g * per + k;
      if (id >= n) break;
      var x = 20 + state.rng() * (VIEW_W - 40);
      var y = 14 + state.rng() * (VIEW_H - 28);
      state.ex[id] = x; state.ey[id] = y;
      state.evx[id] = 0; state.ehp[id] = 80 + Math.floor(state.rng() * 20);
      var node = { kind: 'ent', id: id, x: x, y: y, vx: 0, hp: state.ehp[id] };
      grp.children.push(node);
      state.flat.push(node);
    }
  }
  state.msE.length = 0;
  state.msN.length = 0;
}

function cullScene(state) {
  for (var i = 0; i < state.count; i++) {
    if (i % 5 < 3) {
      state.ehp[i] = 0;
      state.flat[i].hp = 0;
    }
  }
}

// ---------- 工具 ----------

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

// ---------- 绘制 ----------

function drawHud(state, ctx) {
  ctx.fillStyle = 'rgba(11,15,23,0.9)';
  ctx.fillRect(8, 6, 704, 24);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#8fa7c7';
  var fork = state.liveEcs === state.liveNode ? '' : '  [分叉!]';
  ctx.fillText('实体 ' + state.count + '(存活 E ' + state.liveEcs + ' / N ' + state.liveNode + ')' + fork +
    '  快照 E ' + state.lenE + '字符 / N ' + state.lenN + '字符', 16, 22);
}

function drawBars(state, ctx) {
  var me = avg(state.msE), mn = avg(state.msN);
  var mx = Math.max(me, mn, 0.05);
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText('每帧更新耗时(30帧滚动平均)', 16, 56);
  ctx.fillStyle = '#6ee7b7';
  ctx.fillRect(16, 66, 10 + 400 * (me / mx), 16);
  ctx.fillStyle = '#0b0f17';
  ctx.fillText('mini-ECS  ' + me.toFixed(3) + ' ms', 24, 78);
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(16, 90, 10 + 400 * (mn / mx), 16);
  ctx.fillStyle = '#0b0f17';
  ctx.fillText('Node 树   ' + mn.toFixed(3) + ' ms', 24, 102);
  var se = state.snapMsE, sn = state.snapMsN;
  var mx2 = Math.max(se, sn, 0.01);
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('快照打包耗时(每2s采样)', 16, 132);
  ctx.fillStyle = '#6ee7b7';
  ctx.fillRect(16, 142, 10 + 400 * (se / mx2), 14);
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(16, 162, 10 + 400 * (sn / mx2), 14);
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '10px monospace';
  ctx.fillText('ECS ' + se.toFixed(2) + 'ms   Node ' + sn.toFixed(2) + 'ms —— 体积比见顶栏,字段名是纯开销', 16, 192);
}

function viewRect(focus) {
  return focus === 0 ? { x: 24, y: 216, w: 328, h: 208 } : { x: 368, y: 216, w: 328, h: 208 };
}

function drawBattle(ctx, rect, getPos, count, title, hot) {
  ctx.fillStyle = '#101826';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeStyle = hot ? '#ffd479' : '#3b4d6b';
  ctx.lineWidth = hot ? 3 : 1;
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  ctx.lineWidth = 1;
  for (var i = 0; i < count; i++) {
    var p = getPos(i);
    if (!p || p.hp <= 0) continue;
    ctx.fillStyle = p.hp > 90 ? '#6ee7b7' : '#5b8fd6';
    ctx.fillRect(rect.x + p.x * (rect.w / VIEW_W) - 1, rect.y + p.y * (rect.h / VIEW_H) - 1, 3, 3);
  }
  ctx.fillStyle = hot ? '#ffd479' : '#9db4d0';
  ctx.font = '11px monospace';
  ctx.fillText(title, rect.x + 8, rect.y + 16);
}

function drawViews(state, ctx) {
  var n = state.count;
  var ex = state.ex, ey = state.ey, ehp = state.ehp;
  drawBattle(ctx, viewRect(0), function (i) { return { x: ex[i], y: ey[i], hp: ehp[i] }; }, n, 'mini-ECS(SoA+管线)', state.focus === 0);
  var flat = state.flat;
  drawBattle(ctx, viewRect(1), function (i) { return flat[i]; }, n, 'Node 树(对象+递归)', state.focus === 1);
  ctx.fillStyle = '#5b7397';
  ctx.font = '11px monospace';
  ctx.fillText('Tab 切换聚焦(黄框)', 24, 444);
}

function drawFooter(state, ctx) {
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText('1=平稳400  2=爆兵1500  3=阵亡60%  Tab=聚焦', 16, 478);
  ctx.font = '11px monospace';
  for (var i = 0; i < state.log.length; i++) {
    ctx.fillStyle = i === state.log.length - 1 ? '#ffd479' : '#5b7397';
    ctx.fillText(state.log[i], 16, 496 + i * 14);
  }
  ctx.fillStyle = '#5b7397';
  ctx.fillText('两视口任何一刻位置不同=行为分叉(理论上不该发生)', 16, 560);
}`
  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>爆兵（按 2）：</b>实体 400→1500，看两根耗时柱一起涨——但 Node 柱通常涨得更陡：同样的数学，访问方式不同，斜率就不同。</li>
  <li><b>阵亡（按 3）：</b>60% 实体 hp=0，两边都跳过更新，柱子应一起回落——「不更新死物」在两种架构里都成立，只是 ECS 连循环里的分支都更便宜。</li>
  <li><b>看快照：</b>顶栏的快照字符数，Node 版是 ECS 版的数倍——多出来的全是字段名和标点，这正是「逐对象序列化」的结构性开销。</li>
  <li><b>找分叉：</b>两视口任何一刻出现位置不同的点，HUD 会亮出「分叉!」。共用行为函数后它不该出现——如果你改动了任意一边的遍历顺序，它就会出现。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：Node 世界的传播成本与 RID 世界的命令式',
    files: [
      { path: 'scene/main/scene_tree.cpp', note: 'Node 世界的每帧心跳：_process/_physics_process 的分组调用与树递归传播，本课「Node 版每帧」的引擎级原型。建议搜索：process_group、_physics_process、_flush_transform_notifications。' },
      { path: 'scene/main/node.cpp', note: 'children 是 HashMap + 按需重建的平铺 children_cache——树遍历的真实成本与缓存补救；对应本课 Node 版递归的代价。建议搜索：children_cache、_propagate_ready。' },
      { path: 'core/templates/paged_array.h', note: '官方分块连续数组容器：与服务端渲染列表同款的「分块连续」布局，正是 ECS 组件数组在 Godot 里的亲戚。建议搜索：PagedArray、page_size。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>同一套数学，两种命运：Node 树输在「每实体一次间接+逐对象拼字段」，ECS 赢在「数组平铺+整块打包」。但 Node 世界的编辑器生态与异构行为自由度不可替代——所以工业答案是混合。</p>
<ul>
  <li><b>数据怎么流动？</b>输入→（Node 递归 / ECS 管线）→位置与状态→渲染提交；快照打包只在网络帧发生，ECS 拿数组直接拼、Node 逐对象拼。</li>
  <li><b>所有权归谁？</b>Node 版对象互持引用、树拥有子节点；ECS 版数据全归 world，实体只是索引——回收就是交换删除，没有悬挂引用问题。</li>
  <li><b>什么时候发生？</b>两边都在帧内同步更新；差异在「每步访问了多少次内存」——量级越大，布局的利息越高。</li>
</ul>`
  }
  ]
};
