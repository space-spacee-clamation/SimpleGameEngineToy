// L2.2 · Godot 对象模型：Object / Variant / 信号
export default {
  id: 'L2.2',
  title: 'Godot 对象模型：Object / Variant / 信号',
  est: '2 小时',
  coreQuestions: [
    'C++ 有 RTTI，Godot 为什么弃用它，自己造一套 ClassDB？',
    '脚本按名字调用的 C++ 方法，中间经过怎样的注册与转发链路？',
    '信号和直接持有回调函数指针相比，到底解耦在哪里？',
    '一个值从脚本传进 C++，为什么说 Variant 是「通用货币」？成本在哪？'
  ],
  sections: [
    {
      type: 'text',
      title: '没有 RTTI 的反射：Object + ClassDB',
      html: `<p>编辑器的 Inspector 要枚举任意节点的属性，GDScript 要按名字调用任意 C++ 方法，场景要把自己序列化成 .tscn 文本——这三件事背后是同一个能力：<b>运行时知道「这个对象是什么、有什么、怎么调」</b>，也就是反射。问题在于：C++ 不是动态语言，标准 RTTI 又指望不上。</p>
<p><b>为什么 Godot 弃用 C++ RTTI 和异常？</b>编译器 RTTI 只给类名和继承链，给不出「每个属性叫什么、方法签名长什么样」；它的体积开销却要全平台背（包括 Web 与嵌入式），部分平台工具链干脆默认关闭，开不开还会破坏插件 ABI 的稳定；异常的栈展开跨模块（插件、脚本绑定）边界更是性能与兼容的双重雷区。于是 Godot 全程按 <code>-fno-rtti -fno-exceptions</code> 编译。</p>
<p>Godot 的答案：所有引擎类继承 <b>Object</b> 基类，用 <code>GDCLASS</code> / <code>ClassDB::bind_method</code> 系列宏，在启动时把「类名、父类、属性、方法」登记进全局注册表 <b>ClassDB</b>——编译器不肯给的元数据，宏手写补齐，这就是<b>穷人版反射</b>。注册链路一句话：<b>宏声明 → ClassDB_bind_method 把每个方法包成 MethodBind 存进哈希表 → 脚本按名字查表、拆箱参数、转调真正的 C++ 成员函数</b>。Inspector 枚举属性、.tscn 序列化，走的全是同一张表。</p>
<table>
  <tr><th>引擎想要</th><th>C++ 原生给不了</th><th>Godot 的答案</th></tr>
  <tr><td>按名字调方法</td><td>RTTI 没有方法表</td><td>ClassDB + MethodBind</td></tr>
  <tr><td>枚举/读写属性</td><td>完全没有</td><td>属性宏 + PropertyInfo</td></tr>
  <tr><td>跨语言传值</td><td>类型系统不互通</td><td>Variant 统一装箱</td></tr>
  <tr><td>对象间解耦通知</td><td>回调指针强耦合</td><td>信号 connect/emit</td></tr>
</table>`
    },
    {
      type: 'text',
      title: 'Variant 与信号：跨边界的通用货币',
      html: `<p><b>Variant 是脚本与引擎之间的通用货币。</b>GDScript 动态类型（万物皆 Variant），C++ 静态强类型，两套类型系统互不相通，边界上必须有一个双方都认识的集装箱：Variant 用一个 <code>type</code> 标签加一块 union 存储，装得下 int、float、String、Vector2 直到 Object 引用。代价是<b>装箱/拆箱</b>：每次跨边界传值都可能发生内存分配与类型判定，热循环里把数据在脚本和 C++ 之间搬来搬去，成本肉眼可见。</p>
<p><b>信号是观察者模式的引擎级实现。</b>回调函数指针要求发送者持有接收者的地址和签名——按钮必须认识血条，强耦合。信号相反：<code>connect</code> 由第三方（搭建场景的人）把「发射源.信号名」接到「接收者.方法名」上，<b>发送者 emit 时根本不知道谁在听、有几个在听</b>；同一信号可接任意多个接收者，接收者销毁时连接自动断开。HUD、成就、音效全挂在按钮上，按钮一行代码不用改。</p>
<p>最后是生命周期：节点继承 Object，由场景树与手动释放管理；资源类对象继承 <b>RefCounted</b>——引用计数归零自动释放。细节留给 L2.3，这里先记住分工。</p>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'signals',
      title: '实验：信号连接沙盘',
      height: 520,
      code: `// 信号连接沙盘：亲眼看「发送者不知道接收者」的解耦
// 数字键 1~5 选发射源 → 再按 1~5 选接收者 → 回车建立一条有向连接
// 空格：当前发射源 emit，信号沿出边按建立顺序逐个点亮（每 200ms 一条）
// V：右侧 Variant 换装 int→float→String，体会装箱成本

engine.run({
  setup: function (state) {
    state.nodes = [
      { name: 'Button', x: 90,  y: 100, flash: 0 },
      { name: 'Timer',  x: 90,  y: 240, flash: 0 },
      { name: 'Player', x: 330, y: 100, flash: 0 },
      { name: 'HUD',    x: 330, y: 240, flash: 0 },
      { name: 'Enemy',  x: 210, y: 350, flash: 0 }
    ];
    state.edges = []; state.total = 0; state.queue = []; state.t = 0;  // 连接表 / 触发数 / 点亮队列
    state.src = 0; state.pick = -1; state.picking = false;             // 先选源，再选接收者
    state.msg = '先按 1~5 选发射源'; state.msgT = 4;
    state.vCycle = [{ type: 'int', text: '42' }, { type: 'float', text: '42.0' }, { type: 'String', text: '"42"' }];
    state.v = state.vCycle[0]; state.vIdx = 0; state.count = 0;        // Variant 演示箱
    addEdge(state, 0, 2);   // 预置连接一：Button pressed → Player
    addEdge(state, 0, 3);   // 预置连接二：Button pressed → HUD
  },

  update: function (state, dt, input) {
    var i;
    for (i = 0; i < 5; i++) {                       // 数字键：两级选择，先源后收
      if (!input.pressed('Digit' + (i + 1))) continue;
      if (!state.picking) { state.src = i; state.picking = true; state.pick = -1; setMsg(state, '发射源 = ' + state.nodes[i].name + '，再按 1~5 选接收者'); }
      else { state.pick = i; setMsg(state, '回车连接：' + state.nodes[state.src].name + ' → ' + state.nodes[i].name); }
    }
    if (input.pressed('Enter') && state.picking && state.pick >= 0) {   // 回车：connect()
      if (hasEdge(state, state.src, state.pick)) setMsg(state, '这条连接已存在，换个接收者吧');
      else { addEdge(state, state.src, state.pick); setMsg(state, 'connect 成功！同一个源还能连多个接收者'); }
      state.picking = false; state.pick = -1;
    }
    if (input.pressed('Space')) {                   // 空格：当前发射源 emit
      state.queue = [];
      for (i = 0; i < state.edges.length; i++) if (state.edges[i].from === state.src) state.queue.push(i);
      state.t = 0.2;                                // 立刻点亮第一条
      setMsg(state, state.queue.length === 0
        ? state.nodes[state.src].name + ' 没有出边：信号发了也没人听'
        : state.nodes[state.src].name + ' emit！沿 ' + state.queue.length + ' 条出边依次送达');
    }
    if (state.queue.length > 0) {                   // 点亮节拍：每 200ms 送达一条出边
      state.t += dt;
      while (state.t >= 0.2 && state.queue.length > 0) {
        state.t -= 0.2;
        var e = state.edges[state.queue.shift()];
        e.flash = 0.6;
        state.nodes[e.to].flash = 0.6;
        state.total++;                              // 一次送达 = 一次触发
      }
    }
    if (input.pressed('KeyV')) {                    // V：Variant 换装 int→float→String→int
      state.vIdx = (state.vIdx + 1) % 3;
      state.v = state.vCycle[state.vIdx];
      state.count++;                                // 每次转换 = 一次装箱/拆箱开销
    }
    for (i = 0; i < 5; i++) state.nodes[i].flash = Math.max(0, state.nodes[i].flash - dt * 1.4);
    for (i = 0; i < state.edges.length; i++) state.edges[i].flash = Math.max(0, state.edges[i].flash - dt * 1.4);
    state.msgT -= dt;
  },

  draw: function (state, ctx) {
    var i, n;
    ctx.fillStyle = '#0b0f17'; ctx.fillRect(0, 0, engine.W, engine.H);
    ctx.font = '14px monospace';
    ctx.fillStyle = '#8fa7c7';
    ctx.fillText('连接数: ' + state.edges.length + '   累计触发: ' + state.total, 12, 24);
    ctx.fillStyle = '#f59e0b';
    ctx.fillText('发射源: ' + state.nodes[state.src].name, 240, 24);
    for (i = 0; i < state.edges.length; i++) {      // 先画线，节点方块后画刚好压住端头
      var e = state.edges[i], a = state.nodes[e.from], b = state.nodes[e.to], hot = e.flash > 0;
      if (e.from === e.to) drawLoop(b, hot, ctx);   // 自连接：头顶小回环
      else drawArrow(a.x, a.y, b.x, b.y, hot ? '#fbbf24' : '#2f4468', hot ? 3 : 1.5, ctx);
    }
    if (state.picking && state.pick >= 0 && state.pick !== state.src) {   // 选接收者的预览线
      drawArrow(state.nodes[state.src].x, state.nodes[state.src].y, state.nodes[state.pick].x, state.nodes[state.pick].y, '#34d399', 1, ctx);
    }
    for (i = 0; i < 5; i++) {                       // 五个节点方块
      n = state.nodes[i];
      ctx.fillStyle = '#16233a';
      ctx.fillRect(n.x - 55, n.y - 22, 110, 44);
      if (n.flash > 0) { ctx.fillStyle = 'rgba(251,191,36,' + (n.flash * 0.9).toFixed(2) + ')'; ctx.fillRect(n.x - 55, n.y - 22, 110, 44); }
      ctx.strokeStyle = (i === state.src) ? '#f59e0b' : (state.picking && i === state.pick ? '#34d399' : '#4a5f80');
      ctx.lineWidth = (i === state.src) ? 2.5 : 1.5;
      ctx.strokeRect(n.x - 55, n.y - 22, 110, 44);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText((i + 1) + ' ' + n.name, n.x - 26, n.y + 5);
    }
    ctx.strokeStyle = '#1e2a3d'; ctx.lineWidth = 1; ctx.strokeRect(512, 44, 196, 190);
    ctx.fillStyle = '#9b8cff'; ctx.fillText('Variant 装箱演示', 532, 70);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText('当前值: ' + state.v.text + '   类型: ' + state.v.type, 532, 102);
    ctx.fillText('装箱转换次数: ' + state.count, 532, 126);
    ctx.fillStyle = '#7d93b3'; ctx.fillText('按 V 换装：每次都要拆箱再装箱', 532, 160);
    ctx.fillText('跨语言传值不是免费的', 532, 184);
    ctx.fillStyle = state.msgT > 0 ? '#fbbf24' : '#5b7397';
    ctx.fillText(state.msg, 12, 430);
  }
});

function addEdge(state, from, to) { state.edges.push({ from: from, to: to, flash: 0 }); }   // push = 记录建立顺序

function hasEdge(state, from, to) {                     // 查重：同一条连接只建一次
  for (var i = 0; i < state.edges.length; i++) { if (state.edges[i].from === from && state.edges[i].to === to) return true; }
  return false;
}

function setMsg(state, s) { state.msg = s; state.msgT = 4; }

function drawArrow(ax, ay, bx, by, color, w, ctx) {   // 端点裁剪到方块边缘的有向箭头
  var dx = bx - ax, dy = by - ay, len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return;
  dx /= len; dy /= len;
  var t = rayHit(dx, dy), sx = ax + dx * t, sy = ay + dy * t, ex = bx - dx * t, ey = by - dy * t;
  var ang = Math.atan2(ey - sy, ex - sx);
  ctx.strokeStyle = color; ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - Math.cos(ang - 0.45) * 11, ey - Math.sin(ang - 0.45) * 11);
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - Math.cos(ang + 0.45) * 11, ey - Math.sin(ang + 0.45) * 11);
  ctx.stroke();
}

function rayHit(dx, dy) {   // 方向 (dx,dy) 从矩形中心（半宽55 半高22）到边缘的距离
  var tx = Math.abs(dx) < 0.0001 ? 1e9 : 55 / Math.abs(dx), ty = Math.abs(dy) < 0.0001 ? 1e9 : 22 / Math.abs(dy);
  return Math.min(tx, ty);
}

function drawLoop(n, hot, ctx) {   // 自连接（Button→Button 的环）：头顶画个小回环
  ctx.strokeStyle = hot ? '#fbbf24' : '#2f4468'; ctx.lineWidth = hot ? 3 : 1.5;
  ctx.beginPath();
  ctx.arc(n.x, n.y - 38, 13, Math.PI * 0.15, Math.PI * 1.55, false);
  ctx.stroke();
}
`
    },
    {
      type: 'text',
      title: '试一试',
      html: `<ul>
  <li>连一条 <code>Button → Button</code> 的自环再 emit：连接本身是合法的。但想象接收者的响应函数里又 emit 同一个信号——它会立刻再次触发自己，无限接力直到栈溢出。这就是引擎必须<b>防循环发射</b>的原因。</li>
  <li>把 <code>Button → Timer</code> 和 <code>Timer → Button</code> 连成一个环：如果每次「送达」都引起下一次 emit，信号会在环上永远跑圈。Godot 的对策是把这类调用推迟到帧末（deferred call / <code>set_deferred</code>），把「同步接力」变成「排队接力」。</li>
  <li>反向连一条 <code>HUD → Button</code>：信号是<b>有向</b>的，箭头方向反了就收不到——发射源永远是主动的一方，这正是「发送者不知道接收者，接收者知道发送者」的单向契约。</li>
  <li>狂按 V 看转换次数上涨：int→float→String 每一步都是一次真实的装箱开销，GDScript 与 C++ 每次跨语言传值都在做同样的事。</li>
</ul>`
    },
    {
      type: 'source',
      files: [
        { path: 'core/object/object.h', note: '一切皆 Object：看 GDCLASS 宏——类名、父类、类型元数据全在这一行声明里完成登记。' },
        { path: 'core/object/class_db.h', note: '全局类库 ClassDB：bind_method 注册的 MethodBind 按名字挂进哈希表，供脚本与编辑器查表调用。' },
        { path: 'core/variant/variant.h', note: '通用货币 Variant：type 标签 + union 存储，看它怎么把 int/String/Object 装进同一个箱子。' },
        { path: 'core/object/ref_counted.h', note: '引用计数基类：reference/unreference 两个方法撑起 Godot 的自动内存管理。' }
      ]
    },
    {
      type: 'text',
      title: '小结',
      html: `<p>这一课的三件套——<b>ClassDB（元数据表）、Variant（通用货币）、信号（解耦通知）</b>——共同回答了开头的问题：一个 C++ 类如何在不依赖 RTTI 和异常的前提下，长出反射、脚本与序列化能力。记住那条链路：宏注册 → ClassDB 查表 → MethodBind 拆箱转调。下节课 L2.4 我们让一次 GDScript 调用真正穿透到 C++，把这条链走完全程。</p>`
    }
  ]
}
