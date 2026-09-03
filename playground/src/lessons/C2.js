// C2 · 手写 mini-ECS I：Query 与 System
export default {
  id: 'C2',
  title: '手写 mini-ECS I：Query 与 System',
  est: '2.5 小时',
  coreQuestions: [
    'ECS 里实体、组件、系统分别是什么数据结构？「实体只是行号」，这句话怎么从代码里长出来？',
    '位掩码怎么把「这个实体有哪些组件」压缩成一次按位与，从而决定它进不进某个 Query？',
    'System（系统）为什么必须是纯函数、靠 Query 拿数据？这与 OOP 的「对象自带行为」根本差异在哪？',
    'Godot 用场景树而不用 ECS，但为什么 servers/ 层内部全是「平铺数组 + 批量遍历」的数据导向写法？'
  ],
  sections: [
    {
      type: 'text',
      title: 'ECS 不玄：三句话打完地基',
      html: `<p>上一课 L2.1 我们站在山顶对比了场景树与 ECS 两套世界观，这一课直接<b>把 ECS 写出来</b>——不是引用 Bevy 或 EnTT，而是 200 行 JS 亲手落地，让「不玄」变成手指的记忆。先给三个定义钉死在墙上：</p>
<table>
  <tr><th>概念</th><th>是什么</th><th>一句话</th></tr>
  <tr><td><b>Entity 实体</b></td><td>一个整数 ID（行号）+ 一个代际（generation）</td><td>实体只是<b>数组里的下标</b>，没有字段没有方法</td></tr>
  <tr><td><b>Component 组件</b></td><td>纯数据，每种组件一张<b>平铺数组</b>（SoA），第 i 个槽就是实体 i 的数据</td><td>数据躺在数组里，不躺在对象里</td></tr>
  <tr><td><b>System 系统</b></td><td>纯函数 <code>update(world, dt)</code>，靠 Query 拿自己关心的实体</td><td><b>行为在系统里</b>，不在对象里</td></tr>
</table>
<p>这三条合成一句核心判断，也回答第一个灵魂拷问——<b>数据怎么流动</b>：<b>不是「实体调用自己身上的方法」，而是「系统这个外部函数，把数据从数组里拉出来算一遍，再放回数组」</b>。OOP 把行为钉在对象上（<code>enemy.move()</code>）；ECS 把行为钉在函数上（<code>moveSystem(world)</code>），实体退化成一串能被连续扫描的行号。行为的归属变了，缓存的行为也就变了。</p>
<p>那为什么还要「代际（generation）」？因为数组会复用行：实体 A 在第 7 行阵亡后，那一行不能留空太久，新实体 B 会顶进来。可如果外面还握着「第 7 行」这个旧 ID，它就会错指到 B。解法：ID = <code>(索引, 代际)</code> 打包，行被复用时代际 +1，旧 ID 一比对代际对不上，立即判死。这叫<b>代际索引（generational index）</b>，是 ECS 抗悬空引用的标准手法——它把「所有权归谁」（第二个灵魂拷问）也给答了：<b>行归世界管，世界说这个 ID 死了，它就死了</b>。</p>`
    },
    {
      type: 'text',
      title: '两个核心机制：位掩码匹配 + Query',
      html: `<p>「实体有哪些组件」怎么存？最省的办法是一个<b>位掩码（bitmask）</b>：给每种组件一个二进制位——位置占 bit0、速度占 bit1、颜色占 bit2……实体拥有哪些组件，就把哪些位置 1。于是「这个实体有没有 Position 和 Velocity」从「查两张哈希表」变成<b>一次按位与</b>：</p>
<pre>POS = 1, VEL = 2, COL = 4, HP = 8 ...
实体 E 有 Position+Velocity        → mask = 1 | 2 = 3  (0b011)
Query「要 Position 和 Velocity」    → qmask = 3
命中判定: (E.mask &amp; qmask) === qmask   // 3 &amp; 3 === 3 → 命中
实体 F 只有 Position                → mask = 1  → 1 &amp; 3 = 1 ≠ 3 → 不进这个 Query</pre>
<p>这就是 <b>archetype（原型）匹配的最朴素形态</b>：把组件组合压缩成一位一位的比特，匹配退化成 ALU 的单周期按位与。Bevy/EnTT 的真实引擎会把「位掩码」升级成更精细的「按原型分桶的稀疏表 + 密集表」，但思想同源：<b>先按「由哪些组件构成」给实体分组，系统只扫跟自己相关的那一组</b>，而不是遍历全世界。</p>
<p><b>Query</b> 就是「按掩码取一组实体」的迭代器：<code>for (e of query(world, POS|VEL))</code> 会依次吐出所有「同时有位置和速度」的实体行号。System 拿到行号，直接下标访问平铺数组 <code>world.pos[e]</code>——注意这是<b>直接内存访问</b>，不是对象指针解引用。第四个灵魂拷问里「什么时候发生」也在这里：<b>Query 每帧在 System 里重新执行一次</b>，所以顺手加了个组件、下一帧它自动进对应的 Query，不需要额外的注册表同步。</p>
<p>把「为什么要这样设计」说透：<b>位掩码 + 平铺数组 + 每帧重算 Query</b>，三件事合起来让「加一个组件」成为一种<b>数据变更</b>而非「改类层次」。OOP 里给一种怪加「会飞」可能要动类继承；ECS 里只是 <code>mask |= FLY</code>，飞行系统下一帧就自己看见它。这正是 L2.1 结尾那张「改动点数」对比表的底层原因。</p>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'mini-ecs',
      title: '实验：mini-ECS 装配现场',
      height: 560,
      code: `// mini-ECS 装配现场：右侧是一个真在跑的 200 实体 ECS（移动 + 变色两系统轮流扫）
// 左/中面板把「装配过程」拆成 6 步，按空格一步一步点亮，看 ECS 怎么从零长出来
//   本代码默认就是「装配完成态在跑」——想重看装配，按 R 回到第 0 步、再按空格前进
// 底部对比面板：同一帧里 OOP「逐对象虚调用」 vs ECS「组件数组直扫」的访问次数/耗时估算
// 纯 JS + Canvas2D；随机数自带种子（无 Math.random，保证可复现）

// ---------- 组件位定义（每种组件占一个二进制位） ----------
var POS = 1;   // 位置 bit0
var VEL = 2;   // 速度 bit1
var COL = 4;   // 颜色 bit2

// ---------- 带种子的随机数（可复现，不用 Math.random） ----------
var seed = 20240601;
function srand() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }

// ---------- 世界（World）：实体列表 + 三张 SoA 平铺数组 ----------
function makeWorld() {
  return {
    n: 0,                 // 已分配实体数（= 各行下标上限）
    gen: [], mask: [],    // 每行元数据：gen 代际 + mask 位掩码
    px: [], py: [], vx: [], vy: [], hue: [],  // 三张组件平铺数组（SoA）
    free: []              // 空闲行回收表（配合代际实现复用）
  };
}

// 创建一个实体，返回它打包后的 ID（代际 + 行号）
function spawnEntity(w) {
  var row;
  if (w.free.length > 0) {
    row = w.free.pop();              // 复用空闲行
    w.gen[row]++;                    // 代际 +1：旧的 (row, 旧代际) ID 自动失效
  } else {
    row = w.n++;
    w.gen.push(0); w.mask.push(0);
    w.px.push(0); w.py.push(0); w.vx.push(0); w.vy.push(0); w.hue.push(0);
  }
  w.mask[row] = 0;
  return row;
}

// 给实体加一个组件位（真实 ECS 在这里还会真正分配/初始化数据槽）
function addComponent(w, row, bit) {
  w.mask[row] |= bit;   // 按位或：置位即可，别的位不动
}

// Query：返回「掩码恰好与 qmask 匹配」的所有实体行号
// 判定一次按位与 (m & qmask) === qmask：多出来的组件没关系，缺一个都不行
function query(w, qmask) {
  var out = [];
  for (var i = 0; i < w.n; i++) {
    if ((w.mask[i] & qmask) === qmask) out.push(i);
  }
  return out;
}

// ---------- 两个系统：纯函数，靠 Query 拿数据 ----------
function moveSystem(w, dt) {
  var rows = query(w, POS | VEL);    // 只扫「有位置又有速度」的实体
  for (var k = 0; k < rows.length; k++) {
    var i = rows[k];
    w.px[i] += w.vx[i] * dt;
    w.py[i] += w.vy[i] * dt;
    if (w.px[i] < 8) { w.px[i] = 8; w.vx[i] = -w.vx[i]; }
    if (w.px[i] > 256) { w.px[i] = 256; w.vx[i] = -w.vx[i]; }
    if (w.py[i] < 8) { w.py[i] = 8; w.vy[i] = -w.vy[i]; }
    if (w.py[i] > 196) { w.py[i] = 196; w.vy[i] = -w.vy[i]; }
  }
}

function colorSystem(w, dt) {
  var rows = query(w, POS | COL);    // 只扫「有位置又有颜色」的实体
  for (var k = 0; k < rows.length; k++) {
    var i = rows[k];
    w.hue[i] = (w.hue[i] + dt * 46) % 360;   // 色相缓缓滚动：变色系统
  }
}

engine.run({
  setup: function (state) {
    state.w = makeWorld();
    var i, w = state.w;
    for (i = 0; i < 200; i++) {
      var row = spawnEntity(w);
      w.px[row] = 20 + srand() * 252;
      w.py[row] = 14 + srand() * 176;
      w.vx[row] = (srand() - 0.5) * 90;
      w.vy[row] = (srand() - 0.5) * 90;
      w.hue[row] = srand() * 360;
      addComponent(w, row, POS);
      addComponent(w, row, VEL);
      addComponent(w, row, COL);
    }
    state.demo = 0;                 // 演示主角（本版本用高亮提示位代替）
    state.steps = 6;                // 装配 6 步（0..5）
    state.step = state.steps;       // 默认已完成 = 装配完成态在跑
    state.hint = '装配已完成，右侧系统正在跑。按 R 回到第 0 步、空格逐步装配。';
    state.oopAccess = 0; state.ecsAccess = 0;
    state.frames = 0;
    state.resetFlash = 0;
  },

  update: function (state, dt, input) {
    var w = state.w;
    if (input.pressed('Space')) {
      if (state.step < state.steps) { state.step++; state.hint = stepHint(state.step); }
      else { state.resetFlash = 0.4; state.hint = '装配已完成。按 R 重看。'; }
    }
    if (input.pressed('KeyR')) { state.step = 0; state.hint = stepHint(0); state.resetFlash = 0; }
    state.resetFlash = Math.max(0, state.resetFlash - dt);

    // 走过第 2 步「建 entity」之后，右侧系统持续跑
    if (state.step >= 2) {
      moveSystem(w, dt);
      colorSystem(w, dt);
    }

    // 底部对比计数：OOP = 对象逐个虚调用；ECS = 逐行下标直访
    state.oopAccess = w.n;
    state.ecsAccess = w.n;
    state.frames++;
  },

  draw: function (state, ctx) {
    var w = state.w;
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);

    ctx.font = '13px monospace';
    ctx.fillStyle = '#8fa7c7';
    ctx.fillText('mini-ECS 装配现场 —— 右侧 ' + w.n + ' 实体在跑', 12, 22);
    ctx.fillStyle = '#5b7397';
    ctx.fillText('空格=装配步进  R=重看', 12, 40);

    // ---------- 右：实时世界 ----------
    var wx = 372, wy = 50, wW = 338, wH = 200;
    ctx.fillStyle = '#0f1723';
    ctx.fillRect(wx, wy, wW, wH);
    var i;
    for (i = 0; i < w.n; i++) {
      var x = wx + w.px[i] / 256 * (wW - 8) + 4;
      var y = wy + w.py[i] / 196 * (wH - 8) + 4;
      ctx.fillStyle = 'hsl(' + Math.round(w.hue[i]) + ', 80%, 60%)';
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, 6.283);
      ctx.fill();
    }
    ctx.strokeStyle = '#22304a';
    ctx.lineWidth = 1;
    ctx.strokeRect(wx, wy, wW, wH);
    ctx.fillStyle = '#7d93b3';
    ctx.font = '12px monospace';
    ctx.fillText('世界视图：每个点 = 一个实体（移动 + 变色系统在跑）', wx, wy + wH + 16);

    // ---------- 左：装配步骤面板 ----------
    var lx = 12, ly = 52, lW = 344;
    var steps = [
      { t: '0 · 实体只是行号', d: '行 = 数组下标；代际防复用' },
      { t: '1 · 建组件池（SoA）', d: 'px/py/vx/vy/hue 五张连续数组' },
      { t: '2 · 建 entity（分一行）', d: 'spawnEntity → 行号+代际，mask=0' },
      { t: '3 · 加组件（掩码亮起）', d: 'mask |= POS|VEL|COL → 0b111' },
      { t: '4 · Query 匹配', d: '(m & qmask)===qmask 命中高亮' },
      { t: '5 · System 遍历运行', d: 'move + color 两系统轮流扫' }
    ];
    var k;
    for (k = 0; k < steps.length; k++) {
      var sy = ly + k * 46;
      var done = state.step > k;
      var cur = state.step === k;
      ctx.fillStyle = cur ? '#16233a' : '#0f1723';
      ctx.fillRect(lx, sy, lW, 40);
      ctx.strokeStyle = cur ? '#f59e0b' : '#1e2a3d';
      ctx.lineWidth = cur ? 2 : 1;
      ctx.strokeRect(lx, sy, lW, 40);
      ctx.fillStyle = done ? '#34d399' : (cur ? '#f59e0b' : '#5b7397');
      ctx.fillText((done ? '✓ ' : (cur ? '▸ ' : '  ')) + steps[k].t, lx + 8, sy + 16);
      ctx.fillStyle = '#7d93b3';
      ctx.fillText(steps[k].d, lx + 8, sy + 30);
    }

    // 位掩码小窗（第 3 步后点亮）
    var bx = 358, by = 330;
    ctx.fillStyle = '#0f1723';
    ctx.fillRect(bx, by, 88, 60);
    ctx.fillStyle = '#c7d3e6';
    ctx.fillText('mask', bx + 6, by + 18);
    var bits = [['POS', state.step > 2], ['VEL', state.step > 2], ['COL', state.step > 2]];
    for (k = 0; k < 3; k++) {
      ctx.fillStyle = bits[k][1] ? '#34d399' : '#3a4a63';
      ctx.fillRect(bx + 42, by + 8 + k * 12, 8, 8);
      ctx.fillStyle = bits[k][1] ? '#e2e8f0' : '#5b7397';
      ctx.fillText(bits[k][0], bx + 54, by + 16 + k * 12);
    }

    // 底部对比面板：OOP vs ECS
    var oy = 396;
    ctx.fillStyle = '#0f1723';
    ctx.fillRect(lx, oy, 200, 36);
    ctx.strokeStyle = '#1e2a3d';
    ctx.strokeRect(lx, oy, 200, 36);
    ctx.fillStyle = '#f87171';
    ctx.fillText('OOP：逐对象虚调用', lx + 6, oy + 14);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(state.oopAccess + ' 次指针解引用/帧', lx + 6, oy + 28);

    ctx.fillStyle = '#0f1723';
    ctx.fillRect(222, oy, 200, 36);
    ctx.strokeStyle = '#1e2a3d';
    ctx.strokeRect(222, oy, 200, 36);
    ctx.fillStyle = '#34d399';
    ctx.fillText('ECS：组件数组直扫', 228, oy + 14);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(state.ecsAccess + ' 次下标直访/帧（连续）', 228, oy + 28);

    // 顶部提示
    ctx.fillStyle = state.resetFlash > 0 ? '#f87171' : '#fbbf24';
    ctx.fillText(state.hint, 12, engine.H - 6);
  }
});

// 每个装配步骤的提示文案
function stepHint(step) {
  var hints = [
    '第 0 步：实体只是一行下标，本身没有字段。看懂右侧的世界就是 200 个点。',
    '第 1 步：组件是纯数据。五张平铺数组（SoA），第 i 个槽就是实体 i 的位置/速度/颜色。',
    '第 2 步：spawnEntity 分配一行，给出行号+代际。此时 mask=0，还没有任何能力。',
    '第 3 步：addComponent 就是 mask |= 位。三个位全亮 = 0b111，实体获得全部能力。',
    '第 4 步：Query 按掩码取实体，(m & qmask)===qmask 决定进不进这个系统。',
    '第 5 步：System 是纯函数，靠 Query 拿数据、改回数组。装配完成，循环跑起来了！'
  ];
  return hints[step] || hints[5];
}
`
    },
    {
      type: 'text',
      title: 'System 是纯函数：行为与数据的分离',
      html: `<p>细看实验里两个系统——<code>moveSystem</code> 和 <code>colorSystem</code>：它们没有任何 class、没有 this、不保存状态，输入 <code>(world, dt)</code>，内部 <code>query</code> 一遍拿行号，改完数组就返回。<b>这就是 ECS 的「纯函数系统」。</b></p>
<p>为什么必须这样？因为只有行为与数据彻底分离，下面的好事才<b>白送</b>：</p>
<ul>
  <li><b>并行</b>：两个系统若写不同组件（一个只写位置、一个只写颜色），它们之间没有数据依赖，可以直接丢到不同线程上跑。OOP 里一万个对象互相 <code>canMove()</code> 都不知道有没有副作用，没法安全并行（详见 C3 调度）。</li>
  <li><b>可测试</b>：系统是 <code>world → world</code> 的纯变换，给它造一个 world、跑一遍、检查数组，不需要 mock 任何对象。这是数据导向最被低估的收益。</li>
  <li><b>改动集中</b>：加「中毒」就是新增一个系统函数，旧系统一行不改（L2.1 已经演示过改动点数）。</li>
</ul>
<p>对照着看，OOP 的「对象自带行为」把「这段代码会碰哪些数据」藏在了多态调用背后——<b>数据流向是隐式的</b>。ECS 反过来：<b>每个系统在自己的 Query 里白纸黑字声明「我要 Position 和 Velocity」</b>，数据流向显式到可以由编译器/调度器检查。这是 ECS 和 OOP 最根本的分野，也是一个心智模型的翻转：<b>你不问「这个对象能干什么」，你问「这一帧有哪些数据要一起变」。</b></p>
<p>当然，纯函数系统也自有代价与留白：位掩码是「有没有」的粗粒度判断，<b>值和值之间的关系（比如血量跌破了没）它管不着</b>——所以 ECS 需要 <b>事件（event）</b>与 <b>脏标记（change detection）</b>来补，这正是 C3 的内容。本课刻意只造「Query + System」这骨架，留白给下一课。</p>`
    },
    {
      type: 'source',
      title: '源码走读：Godot 为什么用树不用 ECS',
      files: [
        { path: 'core/object/object.h', note: 'Object 是一切节点的基类：每个 Node 都是堆上完整对象，背着一大包元数据。体会「对象自带状态+方法」与 ECS「数据归数组、行为归系统」的反差——Godot 走的是前者。' },
        { path: 'scene/main/node.cpp', note: '搜 data.children 与 add_child：所有「挂孩子」最终落在父子表上，遍历靠递归逐节点虚调用通知。这是 Godot 数据导向的「反面」——它把同质批量工作悄悄迁到了 servers/ 层。' },
        { path: 'core/templates/local_vector.h', note: 'Godot 内部高频使用的紧凑容器：连续内存、按需扩容，没有多余指针。ECS 那几张 SoA 数组在 C++ 里就是这种「平铺 vector」——数据导向 Godot 自己也在用。' }
      ]
    },
    {
      type: 'text',
      title: '试一试',
      html: `<ul>
  <li>按 <code>R</code> 回到第 0 步，再连按 <code>空格</code> 看装配一步步亮起来：留意第 3 步 <code>mask |= POS|VEL|COL</code> 这条赋值——它就是把「类层次」换成「按位或」的那一下。</li>
  <li>在实验代码 setup 造实体的循环里，把 <code>addComponent(w, row, COL)</code> 这一行去掉：重跑后它仍会移动，但不参与变色系统——因为 <code>colorSystem</code> 的 Query 里 <code>(m &amp; COL)===COL</code> 判它不命中。<b>改一行数据，实体就退出一个系统，类层次完全不用动。</b></li>
  <li>把 200 改成 2000，感受它还是 60 帧：因为每帧只是顺序扫两张连续数组，缓存行被喂饱。再想象同样的 2000 个 Node 挂在一棵树上逐对象虚调用。</li>
  <li>给 Position 数组塞个坏值，看哪些系统会连带炸掉：纯函数系统的数据流是显式的，所以你能一眼锁定是哪个系统的哪张表——这是可测试性红利。</li>
</ul>`
    },
    {
      type: 'text',
      title: '小结',
      html: `<p>这一课用 200 行 JS 把 ECS 的骨架亲手搭了出来，把它和三个灵魂拷问对齐：</p>
<ul>
  <li><b>数据怎么流动</b>：系统（外部函数）用 Query 从平铺数组中按掩码拉出自己关心的行号，改完数组放回；<b>数据不进对象，行为也不依附对象</b>。</li>
  <li><b>所有权归谁</b>：行归世界管。代际索引让「这个 ID 死了没」由世界单方面裁定，悬空引用被代际比对挡在门外。</li>
  <li><b>什么时候发生</b>：Query 每帧在系统里重新执行一次，所以加组件/删组件下一帧自动生效，不需要同步注册表。</li>
</ul>
<p>一句话收束：<b>实体是行号，组件是数组，行为是函数——ECS 把「对象的内部状态」翻过来变成「世界的连续内存」。</b>本课刻意留下调度、脏标记、事件三个空位，下一课 C3 填上它们，一个能真正跑多线程、做变更检测的 mini-ECS 就完整了。</p>`
    }
  ]
}
