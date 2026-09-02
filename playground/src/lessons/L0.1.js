// L0.1 · 用 100 行代码造一个「引擎」
export default {
  id: 'L0.1',
  title: '用 100 行代码造一个「引擎」',
  est: '60–90 分钟',
  coreQuestions: [
    '引擎的最小内核是什么？没有它，游戏代码为什么写不下去？',
    '一帧（frame）里到底发生了什么？',
    '游戏逻辑代码和引擎代码的边界画在哪里？'
  ],
  sections: [
    {
      type: 'text',
      title: '从一个空循环说起',
      html: `<p>所有游戏引擎剥到最内核，都是同一个东西：<b>一个永不停止的循环</b>。Unreal、Unity、Godot，还是你未来要写的引擎，心脏都是它：</p>
<pre>初始化（建世界、载资源）
循环 {
    处理输入  →  更新世界（dt）  →  绘制画面
}
退出（清理）</pre>
<p>三个问题贯穿本课：</p>
<ul>
  <li>循环为什么要一直转？—— 屏幕每秒刷新几十次，画面是「骗过眼睛的连续幻灯片」。</li>
  <li>dt 是什么？—— 本帧距离上帧经过的<b>秒数</b>。所有运动都要乘它，否则换台机器速度就变了。</li>
  <li>边界在哪？—— <b>引擎提供「循环 + 时间 + 输入 + 画笔」，游戏逻辑只填回调</b>。这个分层就是引擎设计的第一课。</li>
</ul>`
    },
    {
      type: 'text',
      title: '5 分钟 JS 速览（给 C++ / C# 的脑子）',
      html: `<p>浏览器实验用 JS：零环境、即改即跑。语法差异 5 分钟就能上手，之后边用边教：</p>
<table>
  <tr><th>你熟悉的</th><th>JS 对应</th><th>备注</th></tr>
  <tr><td>class</td><td>对象字面量 { } + 函数</td><td>本课先不用 class</td></tr>
  <tr><td>std::vector / List&lt;T&gt;</td><td>数组 [ ]，push() ≈ push_back</td><td>无类型约束</td></tr>
  <tr><td>nullptr</td><td>null / undefined</td><td>两个「空」</td></tr>
  <tr><td>模板 / 泛型</td><td>没有，动态类型</td><td>变量随时换类型</td></tr>
  <tr><td>编译期报错</td><td>运行时才炸</td><td>所以勤按「运行」</td></tr>
  <tr><td>lambda</td><td>function (a) { ... }</td><td>本课用普通函数</td></tr>
</table>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'main',
      title: '实验：你的第一个「引擎」',
      height: 520,
      code: `// ============ 你的第一个「引擎」 ============
// 引擎只负责三件事：循环、时间、输入。
// 游戏逻辑写进下面的 setup / update / draw ——
// 它们正是 Godot 里 _ready / _process / _draw 的原型。

engine.run({
  // 初始化：只执行一次 —— Godot: _ready()
  setup: function (state) {
    state.gravity = 900;      // 重力（像素/秒²） ← 改成 300 或 2000 试试
    state.bounce  = 0.82;     // 反弹系数 0~1     ← 改成 1.0 甚至 1.05 试试
    state.balls = [];
    for (var i = 0; i < 6; i++) spawn(state);
  },

  // 每帧逻辑：dt 是本帧经过的秒数 —— Godot: _process(delta)
  update: function (state, dt, input) {
    if (input.pressed('KeyR')) state.balls = [];      // R：清空
    if (input.pressed('Space')) state.gravity *= -1;  // 空格：反转重力
    if (input.mouse.clicked) spawn(state, input.mouse.x, input.mouse.y);

    for (var i = 0; i < state.balls.length; i++) {
      var b = state.balls[i];
      b.vy += state.gravity * dt;   // 1) 力 → 速度
      b.x  += b.vx * dt;            // 2) 速度 → 位置（半隐式欧拉，物理课细讲）
      b.y  += b.vy * dt;

      // 边界反弹
      var r = b.r;
      if (b.x < r)          { b.x = r;          b.vx = -b.vx * state.bounce; }
      if (b.x > engine.W-r) { b.x = engine.W-r; b.vx = -b.vx * state.bounce; }
      if (b.y < r)          { b.y = r;          b.vy = -b.vy * state.bounce; }
      if (b.y > engine.H-r) { b.y = engine.H-r; b.vy = -b.vy * state.bounce; }
    }
  },

  // 每帧绘制 —— Godot: _draw()
  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);

    for (var i = 0; i < state.balls.length; i++) {
      var b = state.balls[i];
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = 'hsl(' + b.hue + ', 80%, 60%)';
      ctx.fill();
    }

    ctx.fillStyle = '#7d93b3';
    ctx.font = '13px monospace';
    ctx.fillText('点击画布：生成小球 · 空格：反转重力 · R：清空', 12, 22);
  }
});

// 生成一个随机小球
function spawn(state, x, y) {
  state.balls.push({
    x: (x !== undefined) ? x : Math.random() * engine.W,
    y: (y !== undefined) ? y : -20,
    vx: (Math.random() - 0.5) * 300,
    vy: Math.random() * 100,
    r: 8 + Math.random() * 14,
    hue: Math.floor(Math.random() * 360)
  });
}
`
    },
    {
      type: 'text',
      title: '试一试（边改边感受，随手改坏也没关系）',
      html: `<ul>
  <li>把 gravity 改成 2000、bounce 改成 1.0：球永远弹跳，像能量守恒。</li>
  <li>bounce = 1.05：每次反弹都「凭空加能」，球越弹越高——想一想 update 里哪一行注入了能量？（这就是物理引擎要钳制速度的原因）</li>
  <li>空格反转重力 + bounce = 1.0：上下永动机？换个刷新率的屏幕还成立吗？——这正是下一课的主题。</li>
  <li>用 input.down('ArrowLeft') 给所有球加一个横向推力，做一个「重力球风」。</li>
</ul>`
    },
    {
      type: 'text',
      title: '这个循环和 Godot 有什么关系',
      html: `<p>你刚写的每一行，在 Godot 里都有严格对应：</p>
<table>
  <tr><th>你刚写的</th><th>Godot 对应</th><th>说明</th></tr>
  <tr><td>setup(state)</td><td>_ready()</td><td>进入场景树时调用一次</td></tr>
  <tr><td>update(state, dt, input)</td><td>_process(delta)</td><td>每渲染帧一次，delta 单位秒</td></tr>
  <tr><td>draw(state, ctx)</td><td>_draw()</td><td>提交绘制命令</td></tr>
  <tr><td>input</td><td>Input 单例</td><td>轮询式输入抽象</td></tr>
  <tr><td>引擎的 rAF 循环</td><td>Main::iteration()</td><td>引擎心跳，C++ 写在 main/main.cpp</td></tr>
</table>
<p>差别在于：Godot 把 state 换成了「成千上万个 Node 组成的场景树」，把 ctx 换成了 RenderingServer 的绘制命令队列——但每帧 <b>输入 → 更新 → 绘制</b> 的次序一模一样。所有引擎皆如此。</p>`
    },
    {
      type: 'source',
      files: [
        { path: 'main/main.cpp', note: '搜索 iteration —— 引擎每一帧的心跳在 Main::iteration() 里。第一遍只看它依次调用了哪几大块（输入、物理步、渲染），不看细节。' }
      ]
    },
    {
      type: 'text',
      title: '小结与下一课',
      html: `<p>你现在拥有一个「微型引擎」：循环 + 时间 + 输入 + 绘制回调。接下来两条线：</p>
<ul>
  <li><b>纵向钻时间</b>：下一课 L1.1，你刚看到「帧率不同、弹跳不同」的伏笔，我们去把时间这件事做对（固定步长、螺旋死亡）。</li>
  <li><b>横向看全貌</b>：L0.2 引擎解剖图——循环之外，引擎还分哪几层？</li>
</ul>`
    }
  ]
}
