// L0.2 · 引擎解剖图：Godot / Unity / Unreal 分层对比
export default {
  id: 'L0.2',
  title: '引擎解剖图：Godot / Unity / Unreal 分层对比',
  est: '90 分钟',
  coreQuestions: [
    '引擎源码里，哪些代码玩家「随身携带」，哪些只有开发者看得到？',
    'Godot 为什么要在 scene 和 drivers 之间夹一层 servers/？',
    '「上层依赖下层、下层不知道上层」这条铁律，到底买到了什么？',
    '同一件事，Godot / Unity / Unreal 各自怎么分层？'
  ],
  sections: [
    {
      type: 'text',
      title: '先画一条边界线：运行时 vs 工具链',
      html: `<p>打开引擎源码，最先要找的不是「渲染怎么写」，而是一条<b>边界线</b>：一边是<b>运行时（runtime）</b>——游戏跑起来真正需要的那部分：主循环、场景管理、渲染、物理、音频、内存管理；另一边是<b>工具链（toolchain）</b>——只有开发者才见得到的部分：编辑器界面、资源导入器、构建工具。Godot 把这条线切得极干净：<code>editor/</code> 整个目录可以连根拔掉，剩下的引擎照样能把游戏跑起来——你导出的游戏包里本来就没有它。</p>
<p>为什么这条边界是生死线？因为两者的出错代价完全不对称：运行时崩一次，玩家就流失一批；编辑器崩了，重启即可。所以工具链可以复杂、可以频繁重构、可以偶尔失败；运行时只认<b>稳定</b>和<b>性能</b>。以后读引擎源码，先问一句「游戏跑起来时这段代码在吗？」——目录结构立刻从迷宫变成地图。</p>`
    },
    {
      type: 'text',
      title: 'Godot 的分层地图',
      html: `<p>Godot 源码根目录本身就是一张解剖图，从上到下读：</p>
<pre>editor      工具链：编辑器界面（可选，不随游戏发布）
main        程序入口：启动参数、Main::iteration() 主循环
scene       场景层：Node / SceneTree，游戏世界的组织方式
servers     服务层：渲染 / 物理 / 音频的「无头」服务
core        基础层：数学、容器、内存、Variant、IO
modules     插件层：GDScript、网格生成……横切各层的功能包
platform    系统移植层 + drivers 图形 API 封装（最底层）</pre>
<p>本课的主角是 <code>servers/</code>：它把「渲染、物理、音频」做成<b>不认识任何 Node 的纯服务</b>——你递给它「画这个三角形、在这个位置」，它不问也不管场景树长什么样。好处立竿见影：Godot 甚至能在没有场景树的服务器上纯当渲染库用（headless 模式）。「为什么有 servers/ 这一层」的答案就是：把<b>怎么画一个三角形</b>和<b>场景里谁该被画</b>拆开，下层才能独立替换、独立测试。</p>`
    },
    {
      type: 'text',
      title: '依赖方向：只准向下，以及三引擎对照',
      html: `<p>分层图上真正的铁律是<b>箭头方向</b>：<b>上层依赖下层，下层不知道上层</b>。scene 可以调 servers 画一个矩形；servers 却绝不反过来调 scene——它连 Node 的头文件都不 include。下层向上层说话只有两条合法通道：返回值，以及 Godot 的信号（本质是回调）。这笔买卖买到三样东西：每层能单独编译、单独测试；后端能整层替换——Vulkan / OpenGL 之所以共存于一个引擎，正因为 servers 只认抽象接口，drivers 各自落地；工具链能整个拔掉——editor 依赖 scene 来摆节点，但 scene 永远不知道 editor 存在。</p>
<table>
  <tr><th>引擎</th><th>分层方式一句话对照</th></tr>
  <tr><td>Godot</td><td>运行时 main/scene/servers/core 分层清晰，editor 独立成目录，拔掉照样跑。</td></tr>
  <tr><td>Unity</td><td>C++ 引擎内核 + 托管脚本层（Mono/IL2CPP）叠成两界，编辑器与运行时同进程、靠程序集划界。</td></tr>
  <tr><td>Unreal</td><td>体量最大的单体：Engine/Runtime 多模块协作，Editor 是挂在同一个可执行体上的巨型模块。</td></tr>
</table>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'layers',
      title: '实验：分层微缩引擎可视化',
      height: 480,
      code: `// ============ 分层微缩引擎可视化 ============
// 左：main → scene → servers → core 四层横条（自上而下）
// 右：platform / drivers 竖条
// 空格切换：分层模式（令牌逐层下行）⇄ 面条模式（令牌乱窜）

engine.run({
  setup: function (state) {                 // 初始化 —— Godot: _ready()
    state.mode = 0;          // 0=分层模式 1=面条模式
    state.t = 0;             // 模式内计时
    state.layer = 0;         // 令牌当前所在层
    state.radius = 0;        // 「改动爆炸半径」计数
    state.spark = 0;         // 面条模式：距下次乱跳的倒计时
    state.trail = [];        // 面条轨迹
    state.pos = { x: 255, y: 93 };
    state.layers = [         // 目录名 / 中文身份 / 该层典型调用
      { name: 'main',    zh: '主循环层', call: 'Main::iteration()' },
      { name: 'scene',   zh: '场景层',   call: 'process(delta) · _ready()' },
      { name: 'servers', zh: '服务层',   call: '绘制命令 · 物理步 · 音频' },
      { name: 'core',    zh: '基础层',   call: '数学与容器 · 内存 · IO' }
    ];
  },
  update: function (state, dt, input) {     // —— Godot: _process(delta)
    if (input.pressed('Space')) {           // 空格边沿触发：切换模式
      state.mode = 1 - state.mode;
      state.t = 0; state.trail = [];
      if (state.mode === 1) state.radius = 0;
    }
    state.t += dt;
    if (state.mode === 0) {
      // 令牌每 0.4 秒下行一层，到 core 后回 main —— 一帧的缩影
      state.layer = Math.floor(state.t / 0.4) % state.layers.length;
      var r = boxRect(state.layer);
      state.pos = { x: 255, y: r.y + r.h / 2 };
    } else {
      // 面条模式：随机挑个盒子乱跳，scene 也能一把抓住 drivers
      state.spark -= dt;
      if (state.spark <= 0) {
        state.spark = 0.22;
        var boxes = [0, 1, 2, 3, 10, 11];   // 10=platform 11=drivers
        var b = boxRect(boxes[Math.floor(Math.random() * boxes.length)]);
        var c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
        if (state.trail.length > 0) {
          var dx = c.x - state.pos.x, dy = c.y - state.pos.y;
          var len = Math.sqrt(dx * dx + dy * dy) || 1;
          var off = (Math.random() - 0.5) * 160;   // 随机弯一点，像失控依赖
          state.trail.push({ ax: state.pos.x, ay: state.pos.y, bx: c.x, by: c.y,
            cx: (state.pos.x + c.x) / 2 - dy / len * off,
            cy: (state.pos.y + c.y) / 2 + dx / len * off, life: 1 });
          state.radius++;                     // 一条乱线 = 一次跨层乱改
        }
        state.pos = c;
      }
    }
    for (var i = state.trail.length - 1; i >= 0; i--) {   // 轨迹淡出
      state.trail[i].life -= dt * 0.55;
      if (state.trail[i].life <= 0) state.trail.splice(i, 1);
    }
  },
  draw: function (state, ctx) {             // —— Godot: _draw()
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#cfe3ff';
    ctx.fillText(state.mode === 0 ? '分层模式：一帧沿依赖链下行' : '面条模式：依赖乱成一锅粥', 30, 34);
    ctx.textAlign = 'right';                // 右上角：爆炸半径读数
    if (state.mode === 0) {
      ctx.fillStyle = '#9be7a0';
      ctx.fillText('改动爆炸半径：可控（只向下一层传播）', engine.W - 30, 34);
    } else {
      ctx.fillStyle = '#ff7a7a';
      ctx.fillText('改动爆炸半径：' + state.radius + ' 处，还在涨 ↑', engine.W - 30, 34);
    }
    drawBar(ctx, boxRect(10), 'platform', '系统移植层', false, true);
    drawBar(ctx, boxRect(11), 'drivers', '图形 API 封装', false, true);
    for (var i = 0; i < state.layers.length; i++) {
      var L = state.layers[i], r = boxRect(i);
      var lit = (state.mode === 0 && i === state.layer);
      drawBar(ctx, r, L.name, L.zh, lit, false);
      if (lit) {                            // 亮层：显示该层典型调用
        ctx.fillStyle = '#9be7a0';
        ctx.font = '13px monospace';
        ctx.textAlign = 'right';
        ctx.fillText('调用 → ' + L.call, r.x + r.w - 12, r.y + 35);
      }
    }
    if (state.mode === 0) {                 // 层间下行箭头：只准向下
      ctx.fillStyle = '#4a7ab5';
      ctx.strokeStyle = '#4a7ab5';
      for (var g = 0; g < 3; g++) {
        var gy = 64 + g * 82 + 58;
        ctx.beginPath();
        ctx.moveTo(255, gy + 2);
        ctx.lineTo(255, gy + 16);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(255, gy + 23);
        ctx.lineTo(250, gy + 14);
        ctx.lineTo(260, gy + 14);
        ctx.fill();
      }
    } else {
      for (var k = 0; k < state.trail.length; k++) {    // 乱线轨迹
        var s = state.trail[k];
        ctx.strokeStyle = 'rgba(255, 110, 110, ' + s.life.toFixed(2) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(s.ax, s.ay);
        ctx.quadraticCurveTo(s.cx, s.cy, s.bx, s.by);
        ctx.stroke();
      }
    }
    ctx.beginPath();                        // 令牌：发光小圆点
    ctx.arc(state.pos.x, state.pos.y, 9, 0, Math.PI * 2);
    ctx.fillStyle = state.mode === 0 ? '#7ec8ff' : '#ff5c5c';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(state.pos.x, state.pos.y, 16, 0, Math.PI * 2);
    ctx.strokeStyle = state.mode === 0 ? 'rgba(126,200,255,0.35)' : 'rgba(255,92,92,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#7d93b3';
    ctx.font = '13px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('空格：切换模式 · 依赖铁律 main → scene → servers → core → platform/drivers', 30, engine.H - 16);
  }
});

// 盒子几何：0~3 = 左侧四层横条；10/11 = 右侧竖条两段
function boxRect(id) {
  if (id <= 3) return { x: 30, y: 64 + id * 82, w: 450, h: 58 };
  if (id === 10) return { x: 560, y: 64, w: 130, h: 140 };
  return { x: 560, y: 214, w: 130, h: 140 };
}

// 画一个层条；vertical=true 时按竖条排版
function drawBar(ctx, r, name, zh, lit, vertical) {
  ctx.fillStyle = lit ? '#28496b' : (vertical ? '#1d2233' : '#151b29');
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = lit ? '#7ec8ff' : (vertical ? '#5d4d86' : '#33415e');
  ctx.lineWidth = lit ? 2.5 : 1.5;
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.textAlign = vertical ? 'center' : 'left';
  var tx = vertical ? r.x + r.w / 2 : r.x + 14;
  ctx.fillStyle = lit ? '#dff1ff' : '#8fa3c0';
  ctx.font = 'bold 15px monospace';
  ctx.fillText(name, tx, r.y + (vertical ? 62 : 24));
  ctx.font = '12px monospace';
  ctx.fillStyle = lit ? '#a8d4f0' : '#67789a';
  if (vertical) {
    ctx.fillText(zh, tx, r.y + 84);
  } else {
    ctx.fillText(zh, r.x + 96, r.y + 24);
  }
}
`
    },
    {
      type: 'text',
      title: '试一试（边切边想，lab 会替你记着爆炸半径）',
      html: `<ul>
  <li>切到面条模式，看「改动爆炸半径」飙升。然后回答：如果把 <code>servers/</code> 这层抽掉，让 scene 直接去调 drivers 会怎样？（提示：每换一个图形后端，所有 Node 代码都要跟着重写一遍。）</li>
  <li>为什么 editor 依赖 scene 天经地义，反过来 scene 依赖 editor 就是灾难？（提示：想想导出的游戏包里能不能装得下一个编辑器。）</li>
  <li>回头看 L0.1 你写的引擎：setup / update / draw 这组回调，相当于这张解剖图里哪一层在向游戏代码「要服务」？你的 100 行引擎缺了 servers 这一层吗？</li>
</ul>`
    },
    {
      type: 'source',
      files: [
        { path: 'main/', note: '程序入口与主循环：解析启动参数，Main::iteration() 在这里驱动每一帧。' },
        { path: 'scene/', note: '场景层：Node、SceneTree 与各类节点都住这里——游戏世界的组织方式。' },
        { path: 'servers/', note: '服务层：渲染 / 物理 / 音频的「无头」服务，不认识任何 Node，本课主角。' },
        { path: 'core/', note: '基础层：数学、容器、内存分配器、Variant、IO，被所有层依赖却不依赖任何人。' },
        { path: 'modules/', note: '插件层：GDScript、网格生成等横切各层的功能包，按目录一插一拔。' },
        { path: 'editor/', note: '工具链：整个编辑器界面。整目录拔掉运行时毫发无伤——本课那条边界线。' },
        { path: 'platform/', note: '系统移植层：Windows / Linux / Android 各自的窗口、输入与文件系统适配。' },
        { path: 'drivers/', note: '驱动层：Vulkan / OpenGL 等图形 API 的封装，servers 只认抽象、这里负责落地。' }
      ]
    }
  ]
}
