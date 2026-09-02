// L2.1 · 场景树 vs ECS：两种世界观
export default {
  id: 'L2.1',
  title: '场景树 vs ECS：两种世界观',
  est: '2.5 小时',
  coreQuestions: [
    '场景树的「组合优于继承」怎么落地？它擅长什么，又在哪里力不从心？',
    'ECS 的实体、组件、系统分别是什么数据结构？「加一个 buff」为什么只改一处？',
    '为什么顺序扫数组比遍历对象指针快得多？用 CPU 缓存解释。',
    'Godot 为什么至今不内置官方 ECS？它把数据导向藏在了哪里？'
  ],
  sections: [
    {
      type: 'text',
      title: '场景树：把「继承」换成「挂孩子」',
      html: `<p>上一阶段我们看引擎怎么<b>跑</b>，这一阶段看它怎么<b>组织对象</b>。Godot 的答案是把万物做成 Node：父节点装孩子，能力来自「挂了什么」，而不是「继承了谁」——想给骑士加血条？挂一个 Control 子节点；想加音效？挂一个 AudioStreamPlayer2D。想给怪物加血条，同样挂上同一个场景即可。这就是<b>组合优于继承</b>在场景树里的落地：<b>能力横向插拔，类层次保持浅平</b>。</p>
<pre>Knight (Node2D)            ← 能力 = 孩子之和，而非基类链
├─ Sprite2D                外观
├─ CollisionShape2D        碰撞
├─ HealthBar (Control)     血条（怪物也能挂同一份）
└─ AudioStreamPlayer2D     音效</pre>
<p>树还免费送了两样东西。<b>生命周期</b>：_enter_tree → _ready → _process → _exit_tree，且 _ready 自底向上——孩子先就绪，父节点初始化时可以放心用它们，初始化顺序被树结构唯一确定。<b>信号（signal）</b>：发出者广播事件、不关心谁在听，节点之间因此解耦——血条不必持有骑士的引用，监听 health_changed 就够了。</p>
<p>但树也有天生短板。每个 Node 都是堆上的完整对象，背着急名字、变换、信号连接、处理模式等一大包元数据；「每帧让所有敌人移动一下」这个语义，在代码里<b>不存在</b>——它散落在一万个各自的 _process 里，引擎只能递归遍历树、逐个虚调用。节点一多（上万），指针跳跃和逐对象调用的开销就开始咬人，而这正是下一节 ECS 的主场。</p>`
    },
    {
      type: 'text',
      title: 'ECS：三张表的世界',
      html: `<p>ECS 把同一个问题反过来答：<b>实体（Entity）只是一个 ID</b>，没有任何逻辑；<b>组件（Component）是纯数据</b>，每种组件存成一张连续的表，第 i 行就是实体 i；<b>系统（System）是普通函数</b>，声明自己要读写哪几张表，每帧按固定顺序批量执行。组合优于继承在这里落地得更狠：给实体加能力 = 往表里插一行数据，改类层次？不存在的。</p>
<pre>实体:      0      1      2      3   ...
Position:  [x,y]  [x,y]  [x,y]  [x,y]   ← 一张连续的表
Velocity:  [vx,vy][vx,vy][vx,vy][vx,vy]
Health:    [hp]   [hp]   [--]   [hp]    ← 实体 2 没有血量，系统跳过
每帧:      moveSystem(Position, Velocity) → combatSystem(Health) → ...</pre>
<p>为什么快？CPU 读内存不是按字节，而是按 <b>cache line</b>（通常 64 字节）整块搬进缓存。moveSystem 顺序扫两张 float 数组，搬一次就能喂饱几十个实体，内存带宽被打满；而遍历一万个对象，等于把一万个随机堆地址挨个拉进缓存——一次 cache miss 上百纳秒，够 CPU 做几百次乘加。这就是<b>数据导向设计（DOD）</b>：先按访问模式布局数据，让热数据在内存里手拉手，再谈代码优雅。</p>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'army',
      title: '实验：同一支部队，两种写法',
      height: 520,
      code: `// L2.1 · 同一支部队两种写法：左 = 继承树（对象各自覆写 update），右 = ECS（数组三张表 + 系统遍历）
// 空格：暂停/继续   B：给全体加「中毒 buff」——第一次按下才产生“代码改动”，盯住底部改动点数
var POISON = 9;        // 中毒扣血速率（每秒）：两种写法吃同一数值，保证公平
var POISON_ON = false; // buff 开关：两侧共享
engine.run({
  setup: function (state) {
    state.paused = false;
    state.poisonOn = false;        // 运行时开关
    state.poisonInstalled = false; // 是否已「改过代码」装上 buff
    state.leftChanges = 0;  state.rightChanges = 0; // 改动点数：左=每改一个子类+1，右=每加一个系统+1
    state.left = [];
    // ---- 左：继承树写法。基类管公共行为，子类覆写 update ----
    function Unit(x, y, kind) { // kind: 0=战士 1=弓手
      this.x = x; this.y = y; this.kind = kind;
      this.hp = 100; this.max = 100; this.a = Math.random() * 6.283; // a=游走朝向
    }
    Unit.prototype.wander = function (dt) {
      this.a += (Math.random() - 0.5) * 4 * dt;
      this.x = clamp(this.x + Math.cos(this.a) * 42 * dt, 14, 346);
      this.y = clamp(this.y + Math.sin(this.a) * 42 * dt, 44, 408);
    };
    Unit.prototype.hurt = function (n) { // 阵亡满血重生，战斗永不落幕
      this.hp -= n;
      if (this.hp <= 0) { this.hp = this.max; this.x = rand(20, 340); this.y = rand(50, 400); }
    };
    Unit.prototype.attack = function (list, dt) { // 打射程内的异类
      for (var i = 0; i < list.length; i++) {
        var o = list[i];
        if (o !== this && o.kind !== this.kind && dist(this, o) < this.range) o.hurt(this.dmg * dt);
      }
    };
    function Fighter(x, y) { Unit.call(this, x, y, 0); this.dmg = 18; this.range = 18; }
    Fighter.prototype = Object.create(Unit.prototype);
    Fighter.prototype.update = function (dt) { this.wander(dt); this.attack(state.left, dt); }; // 覆写①近战
    function Archer(x, y) { Unit.call(this, x, y, 1); this.dmg = 7; this.range = 64; }
    Archer.prototype = Object.create(Unit.prototype);
    Archer.prototype.update = function (dt) { this.wander(dt); this.attack(state.left, dt); };  // 覆写②远射
    state.klasses = [Fighter, Archer]; // 毒要改几处？数这个数组的长度
    for (var i = 0; i < 30; i++) {
      var x = rand(20, 340), y = rand(50, 400);
      state.left.push(i % 2 ? new Archer(x, y) : new Fighter(x, y));
    }
    state.right = makeWorld();
  },
  update: function (state, dt, input) {
    if (input.pressed('Space')) state.paused = !state.paused;
    if (input.pressed('KeyB')) {
      if (!state.poisonInstalled) {
        // —— 扩展时刻：左侧必须动每一个子类，右侧只登记一个新系统 ——
        for (var c = 0; c < state.klasses.length; c++) patchPoison(state.klasses[c].prototype);
        state.leftChanges = state.klasses.length; // 继承树：+2（有几个子类就改几处）
        state.right.systems.push(poisonSystem);
        state.rightChanges = 1;                   // ECS：+1（永远只有一个入口）
        state.poisonInstalled = true;
        state.poisonOn = true;
      } else {
        state.poisonOn = !state.poisonOn; // 装好后再按只是开关，改动点数不再增长
      }
    }
    POISON_ON = state.poisonOn; // 同步给两侧
    if (state.paused) return;
    for (var i = 0; i < state.left.length; i++) state.left[i].update(dt); // 左：逐对象虚调用
    var w = state.right;
    for (var s = 0; s < w.systems.length; s++) w.systems[s](w, dt);       // 右：按序跑系统
  },
  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    ctx.strokeStyle = '#1e2a3d';
    ctx.beginPath(); ctx.moveTo(360, 0); ctx.lineTo(360, engine.H); ctx.stroke();
    var i, u, w = state.right;
    for (i = 0; i < state.left.length; i++) {
      u = state.left[i];
      drawUnit(ctx, u.x, u.y, u.hp / u.max, u.kind, state.poisonOn);
    }
    for (i = 0; i < w.n; i++) drawUnit(ctx, w.x[i], w.y[i], w.hp[i] / 100, w.kind[i], state.poisonOn);
    ctx.font = '12px monospace';
    ctx.fillStyle = '#f87171';
    ctx.fillText('左 · 继承树：30 个对象，子类各自覆写 update', 14, 20);
    ctx.fillStyle = '#34d399';
    ctx.fillText('右 · ECS：位置/速度/血量数组 + 系统遍历', 374, 20);
    ctx.fillStyle = '#ffd166';
    ctx.fillText('中毒:' + (state.poisonOn ? '开' : state.poisonInstalled ? '关' : '未装') + ' · 改动点数 继承树 +' + state.leftChanges + ' / ECS +' + state.rightChanges + ' · 空格暂停 B加毒', 14, 432);
  }
});
// ==== 右侧 ECS：三张表 + 只碰数组的系统函数 ====
function makeWorld() { // 实体不是对象，只是数组下标 i
  var w = { n: 30, kind: [], x: [], y: [], a: [], hp: [], dmg: [], range: [], systems: [] };
  for (var i = 0; i < w.n; i++) {
    w.kind.push(i % 2); w.hp.push(100); w.a.push(Math.random() * 6.283);
    w.x.push(rand(380, 700)); w.y.push(rand(50, 400));
    if (i % 2) { w.dmg.push(7); w.range.push(64); } else { w.dmg.push(18); w.range.push(18); }
  }
  w.systems.push(moveSystem);  // 一帧 = 按顺序把系统列表跑一遍
  w.systems.push(combatSystem);
  return w;
}
function moveSystem(w, dt) { // 游走系统：顺序扫连续数组
  for (var i = 0; i < w.n; i++) {
    w.a[i] += (Math.random() - 0.5) * 4 * dt;
    w.x[i] = clamp(w.x[i] + Math.cos(w.a[i]) * 42 * dt, 384, 706);
    w.y[i] = clamp(w.y[i] + Math.sin(w.a[i]) * 42 * dt, 44, 408);
  }
}
function combatSystem(w, dt) { // 战斗系统：i 打 j，hp 归零下帧重生
  for (var i = 0; i < w.n; i++)
    for (var j = 0; j < w.n; j++)
      if (w.kind[i] !== w.kind[j] && distIdx(w, i, j) < w.range[i]) w.hp[j] -= w.dmg[i] * dt;
  for (var k = 0; k < w.n; k++)
    if (w.hp[k] <= 0) { w.hp[k] = 100; w.x[k] = rand(384, 700); w.y[k] = rand(50, 400); }
}
function poisonSystem(w, dt) { // 新 buff = 新增一个系统：旧系统一行不动
  if (!POISON_ON) return;
  for (var i = 0; i < w.n; i++) w.hp[i] -= POISON * dt;
}
function patchPoison(proto) { // 左侧的代价：模拟「编辑子类源码」，把原 update 包一层
  var old = proto.update;
  proto.update = function (dt) {
    old.call(this, dt);
    if (POISON_ON) this.hurt(POISON * dt); // 新插入的毒逻辑
  };
}
function drawUnit(ctx, x, y, hpFrac, kind, poisoned) {
  ctx.fillStyle = kind ? '#60a5fa' : '#f87171'; // 弓手蓝 / 战士红
  ctx.beginPath(); ctx.arc(x, y, 5, 0, 6.283); ctx.fill();
  if (poisoned) { ctx.strokeStyle = '#86efac'; ctx.beginPath(); ctx.arc(x, y, 8, 0, 6.283); ctx.stroke(); }
  ctx.fillStyle = '#22304a'; ctx.fillRect(x - 8, y - 14, 16, 3);
  ctx.fillStyle = '#4ade80'; ctx.fillRect(x - 8, y - 14, 16 * Math.max(0, hpFrac), 3);
}
function rand(a, b) { return a + Math.random() * (b - a); }
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function dist(p, q) { var dx = p.x - q.x, dy = p.y - q.y; return Math.sqrt(dx * dx + dy * dy); }
function distIdx(w, i, j) { var dx = w.x[i] - w.x[j], dy = w.y[i] - w.y[j]; return Math.sqrt(dx * dx + dy * dy); }
`
    },
    {
      type: 'text',
      title: 'Godot 的选择：树在外面，表在里面',
      html: `<p>既然 ECS 这么快，Godot 为什么至今不内置官方 ECS？因为场景树和编辑器深度绑死：Inspector、场景停靠栏、.tscn 文件、复制粘贴节点，全都假设「对象 = 节点 = 可挂孩子」。而 Godot 定位的典型游戏是<b>少量复杂个体</b>——几百上千个节点，每个都很聪明，此时指针跳跃的代价可以忽略，层级组合的表达力却无可替代。官方的判断是：不为极少数跑极限的项目，让所有用户背上 ECS 的复杂度（对比把 ECS 当一等公民的 Unity DOTS、Bevy）。</p>
<p>但数据导向并没有缺席，它被藏进了 <b>servers/ 层</b>：RenderingServer、PhysicsServer 内部全是平铺数据 + 批量遍历，后面渲染、物理阶段的课会反复看到这种「表思维」。你的 1 万发子弹不该是 1 万个节点：一个 MultiMesh 或直接对 Server 提交数据就好。所以结论不是谁优谁劣，而是<b>边界画在哪</b>：树服务少量复杂个体和人的编辑体验，表服务大量同质个体和机器吞吐——成熟引擎两边都要。</p>`
    },
    {
      type: 'text',
      title: '试一试',
      html: `<ul>
  <li>再加一个「冰冻 buff」（移速减半）：左边要再包几个 update？右边要加几个系统？改动点数差距变成多少？</li>
  <li>把两处 30 改成 3000（顺带把画点半径改小），感受哪边先撑不住——结合 cache line 想想为什么。</li>
  <li>给左边新增一个「骑射手」子类继承 Archer：为什么右边只是把 dmg/range 推入一对新数字？</li>
  <li>反过来想：做 UI、关卡结构、剧情节点，你愿意用哪边？——取舍而非优劣。下一课看 Godot 如何用 Object / Variant 支撑这棵树。</li>
</ul>`
    },
    {
      type: 'source',
      files: [
        { path: 'scene/main/node.cpp', note: 'Node::add_child 与 data.children：组合模式的边界——一切「挂孩子」最终都落在这张父子表和通知链上。' },
        { path: 'core/object/class_db.h', note: 'ClassDB 用宏逐个注册类与方法（手写反射）：Godot 的对象模型建立在类继承之上，从这里体会它为何没有内置 ECS。' }
      ]
    },
    {
      type: 'text',
      title: '小结',
      html: `<p>两种世界观回答同一个问题——「大量个体如何协作」，但优化的对象不同：场景树优化<b>人的认知</b>（所见即所得、层级复用、信号解耦），ECS 优化<b>机器的吞吐</b>（连续内存、批量遍历、改动集中）。判断题于是变成选择题：个体少而复杂、结构常变，用树；个体多而同质、逻辑规整，用表。剩下的问题是 Godot 如何在 C++ 层支撑这棵树——下一课拆 Object / Variant / 信号的对象模型。</p>`
    }
  ]
}
