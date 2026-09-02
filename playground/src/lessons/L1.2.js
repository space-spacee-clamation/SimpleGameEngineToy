// L1.2 · 走读 Godot 的一帧：Main::iteration
export default {
  id: 'L1.2',
  title: '走读 Godot 的一帧：Main::iteration',
  est: '2 小时',
  coreQuestions: [
    '从按下运行到屏幕亮起，一帧要经过哪几站？你的 _process 是被谁调用的？',
    '为什么 Godot 把物理步安排在 process 之前？「物理 N 步 + 渲染 1 次」是什么结构？',
    '为什么说渲染只是「提交命令」？CPU 提交完和屏幕亮起之间隔了什么？',
    '卡顿之后引擎怎么把时间追回来？上限在哪里？'
  ],
  sections: [
    {
      type: 'text',
      title: '一帧的旅程：从 OS 消息循环到你的 _process',
      html: `<p>L1.1 我们在玩具引擎里搭好了累积器，现在看它真正的样子。<b>Godot 的每一帧都从操作系统的消息循环开始</b>：OS 层每处理完一轮消息，就调用一次 <code>Main::iteration()</code>——全引擎的总调度台，一帧里所有事都由它排程。</p>
<p><code>Main::iteration()</code>（在 <code>main/main.cpp</code> 里）按固定顺序干三件事：<b>先按固定 tick 补物理步</b>（L1.1 的累积器就埋在这里，C++ 变量名就叫 <code>physics_steps</code>）；再调 <code>SceneTree::process()</code>，让它遍历场景树、逐节点调用你的 <code>_process</code>；最后把绘制命令交给 RenderingServer 提交、交换缓冲。记住这条链，你就拿到了引擎的骨架图：</p>
<pre>OS 消息循环（每轮一次）
 └─ Main::iteration()               main/main.cpp
     ├─ 1. 物理步 × N               按 1/60s 固定 tick 切片，L1.1 的累积器
     ├─ 2. SceneTree::process()     scene/main/scene_tree.cpp
     │      └─ 沿场景树逐节点调用 _process(delta)
     └─ 3. 渲染提交 + 缓冲交换       RenderingServer 收命令，GPU 异步绘制</pre>
<p>所以「一次 _process 调用从哪来」的完整答案是：OS 唤醒 → <code>Main::iteration</code> → <code>SceneTree::process</code> 沿树下行 → 你的节点。它一帧最多被调一次，且永远排在物理步之后。</p>`
    },
    {
      type: 'text',
      title: '为什么物理排在 process 之前',
      html: `<p>因为<b>模拟是原因，画面是结果</b>。一帧开始时，真实时间已经往前走了（可能卡顿、可能欠了时间债）；引擎必须先用物理步把这个差距追平，让世界状态对齐到「现在」，然后才轮到 _process 读写这个状态、渲染把它画出来。顺序反过来，你就是在拿一份过期的世界做逻辑。</p>
<p>这就是「<b>物理 N 步 + 渲染 1 次</b>」的双时钟结构：物理时钟固定 60Hz，欠了一帧就下一帧连补 N 步；渲染时钟跟着显示器走，一帧只画一次，哪怕物理刚补了 8 步。两条时钟各走各的，靠累积器对表——对表器就是 <code>main_timer_sync.cpp</code>，L1.1 那个玩具累积器的工业级完整版。</p>`
    },
    {
      type: 'text',
      title: '渲染：不是画完，而是提交命令',
      html: `<p>第三步常被误解：「渲染」不是把画面画完，而是<b>把「画什么」翻译成命令提交</b>。场景树不直接持有 GPU 数据——它把节点变换、材质整理好，向 RenderingServer（独立于场景树的另一层，还记得 L0.2 说的 servers/ 吗）发出一串绘制命令；RenderingServer 把命令攒进队列，真正的 GPU 绘制异步进行。</p>
<p>CPU 提交完命令就交换缓冲，<b>不等 GPU 画完</b>。所以引擎里有两个进度条：CPU 在准备第 N+1 帧时，GPU 可能还在画第 N 帧。这也解释了下面 lab 里的现象：render 计数永远和 process 同步、却和 physics 不同步——渲染是自己的时钟，不跟着物理步数走。</p>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'frame',
      title: '实验：一帧调度台',
      height: 480,
      code: `// 一帧调度台：模拟 Godot 一帧的四个阶段 —— 物理 N 步 → process → 渲染提交 → 缓冲交换
// 一格 = 16.6ms（60FPS 预算）；绿色小格数量 = 本帧补的物理步数
// 空格：注入一次 150ms 卡顿帧（下一格物理步暴增）
// 回车：暂停 / 继续

var TICK = 1000 / 60;   // 物理 tick：固定 60Hz
var BASE = 17;          // 普通帧的墙钟时间：模拟一台约 58.8fps 的显示器
var SPIKE = 150;        // 空格注入的卡顿时长（ms）
var MAX_STEPS = 10;     // 每帧最多补 10 步：防螺旋死亡的上限
var CELL_W = 72, CELL_H = 64, GAP = 6;
var CAP = 8;            // 时间轴最多显示 8 格

// 四个阶段的配色
var C = { phys: '#34d399', proc: '#fbbf24', render: '#60a5fa', swap: '#c084fc' };

engine.run({
  setup: function (state) {
    state.acc = 0;        // 时间债（累积器，L1.1 的老朋友）
    state.spike = 0;      // 待注入的卡顿
    state.paused = false;
    state.flash = 0;      // 卡顿提示剩余帧数
    state.frames = [];    // 时间轴：每帧一条记录 { steps, over }
    state.cnt = { phys: 0, proc: 0, render: 0 };
    state.last = { steps: 0 };
  },

  update: function (state, dt, input) {
    if (input.pressed('Enter')) state.paused = !state.paused;
    if (state.paused) return;
    if (input.pressed('Space')) state.spike = SPIKE;

    // 本帧墙钟时间 = 普通帧 + 注入的卡顿，计入时间债
    var wall = BASE + state.spike;
    if (state.spike > 0) state.flash = 50;
    state.spike = 0;
    state.acc += wall;

    // 攒够一个 tick 就补一步物理（最多 MAX_STEPS 步）
    var steps = 0;
    while (state.acc >= TICK && steps < MAX_STEPS) {
      state.acc -= TICK;
      steps++;
    }
    if (state.acc > TICK * 2) state.acc = TICK * 2; // 还不完就赖账：防螺旋死亡

    // 本帧记录：物理 steps 步 + process 1 次 + 渲染 1 次 + 交换 1 次
    var seg = steps * 6 + 56;                       // 各阶段色块的总像素宽
    state.frames.push({ steps: steps, over: seg > 72 });
    if (state.frames.length > CAP) state.frames.shift();

    state.cnt.phys += steps;
    state.cnt.proc += 1;
    state.cnt.render += 1;
    state.last.steps = steps;
    if (state.flash > 0) state.flash--;
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);

    // 顶部：操作提示 + 暂停标记
    ctx.font = '13px monospace';
    ctx.fillStyle = '#7d93b3';
    ctx.fillText('空格：注入 150ms 卡顿帧 · 回车：暂停/继续', 24, 28);
    if (state.paused) {
      ctx.fillStyle = '#fbbf24';
      ctx.fillText('【已暂停】', 560, 28);
    }

    // 时间轴：左旧右新，一格 = 16.6ms 预算
    ctx.fillStyle = '#55677f';
    ctx.fillText('一格 = 16.6ms（60FPS 预算）→ 时间', 24, 66);
    for (var i = 0; i < state.frames.length; i++) {
      drawCell(state.frames[i], 24 + i * (CELL_W + GAP), 78, ctx);
    }

    drawLegend(ctx);
    drawCounters(state, ctx);

    // 底部：本帧摘要 + 卡顿提醒
    ctx.font = '14px monospace';
    if (state.flash > 0) {
      ctx.fillStyle = '#ef4444';
      ctx.fillText('卡顿帧！时间债 +' + SPIKE + 'ms，本帧补了 ' + state.last.steps + ' 个物理步', 24, 386);
    } else {
      ctx.fillStyle = '#7d93b3';
      ctx.fillText('本帧：物理 ' + state.last.steps + ' 步 · process 1 次 · 渲染 1 次', 24, 386);
    }
    ctx.fillStyle = '#55677f';
    ctx.fillText('时间债 acc = ' + state.acc.toFixed(1) + 'ms（攒够 16.67ms 就多补一步）', 24, 414);
  }
});

// 画一格：格内自左到右 = 物理小格 → process → 渲染提交 → 缓冲交换
function drawCell(cell, x, y, ctx) {
  ctx.fillStyle = '#121b2a';
  ctx.fillRect(x, y, CELL_W, CELL_H);
  var ix = x + 4, iy = y + 21;
  ctx.fillStyle = C.phys;               // 物理步：一格内 0~N 个小格
  for (var i = 0; i < cell.steps; i++) {
    ctx.fillRect(ix, iy, 5, 22);
    ix += 6;
  }
  ctx.fillStyle = C.proc;               // process 场景逻辑
  ctx.fillRect(ix, iy, 20, 22); ix += 22;
  ctx.fillStyle = C.render;             // 渲染提交
  ctx.fillRect(ix, iy, 24, 22); ix += 26;
  ctx.fillStyle = C.swap;               // 缓冲交换
  ctx.fillRect(ix, iy, 6, 22);
  // 色块总宽超过一格预算：卡顿帧描红边
  ctx.strokeStyle = cell.over ? '#ef4444' : '#24344d';
  ctx.strokeRect(x + 0.5, y + 0.5, CELL_W - 1, CELL_H - 1);
  if (cell.steps > 1) {                 // 补步数标注
    ctx.fillStyle = C.phys;
    ctx.fillText('补' + cell.steps + '步', x + 8, y + CELL_H + 16);
  }
}

// 图例：四种色块各自的含义
function drawLegend(ctx) {
  var items = [
    [C.phys, '物理步 · 固定 1/60s'], [C.proc, 'process 逻辑'],
    [C.render, '渲染提交'], [C.swap, '缓冲交换']
  ];
  var xs = [24, 216, 384, 528];
  for (var i = 0; i < items.length; i++) {
    ctx.fillStyle = items[i][0];
    ctx.fillRect(xs[i], 178, 12, 12);
    ctx.fillStyle = '#a9bcd4';
    ctx.fillText(items[i][1], xs[i] + 18, 189);
  }
}

// HUD：三个累计计数
function drawCounters(state, ctx) {
  var boxes = [
    ['physics_steps', state.cnt.phys, '物理步累计'],
    ['process', state.cnt.proc, '场景帧累计'],
    ['render', state.cnt.render, '渲染提交累计']
  ];
  var xs = [24, 260, 496];
  for (var i = 0; i < boxes.length; i++) {
    ctx.fillStyle = '#121b2a';
    ctx.fillRect(xs[i], 210, 200, 92);
    ctx.strokeStyle = '#24344d';
    ctx.strokeRect(xs[i] + 0.5, 210.5, 199, 91);
    ctx.fillStyle = '#55677f';
    ctx.font = '13px monospace';
    ctx.fillText(boxes[i][0], xs[i] + 14, 234);
    ctx.fillStyle = '#e6eefb';
    ctx.font = '26px monospace';
    ctx.fillText(String(boxes[i][1]), xs[i] + 14, 268);
    ctx.fillStyle = '#7d93b3';
    ctx.font = '12px monospace';
    ctx.fillText(boxes[i][2], xs[i] + 14, 290);
  }
}
`
    },
    {
      type: 'text',
      title: '试一试',
      html: `<ul>
  <li>把 <code>TICK = 1000 / 60</code> 改成 <code>1000 / 120</code>：物理升到 120Hz，普通帧也要补 2 步，一格里的绿色小格立刻变密——<b>物理频率高于渲染频率时，「N 步 + 1 次」的 N 起步就是 2</b>。</li>
  <li>在 update 末尾手动加一行 <code>state.cnt.phys += 1;</code>（模拟「在 process 里再调一次物理」）：计数涨了，时间债 acc 却没动，账实不符。真实引擎里物理步只由 Main::iteration 排程，脚本不能私自加步，防的就是这种账。</li>
  <li>把 <code>SPIKE</code> 改成 500 再按空格：10 步上限兜不住 500ms 的债，超出部分被「赖账」那行清掉——这正是 L1.1 防螺旋死亡的那道防波堤在 Godot 里的对应物。</li>
</ul>`
    },
    {
      type: 'source',
      files: [
        { path: 'main/main.cpp', note: 'Main::iteration()：一帧的总调度台，搜 physics_steps 看物理步如何被固定 tick 切片。' },
        { path: 'main/main_timer_sync.cpp', note: '物理与渲染两张时间表的对表器：L1.1 累积器的工业级完整版。' },
        { path: 'scene/main/scene_tree.cpp', note: 'SceneTree::process(double)（约 688 行起）：从这里遍历场景树，逐节点触发 _process。' }
      ]
    },
    {
      type: 'text',
      title: '小结',
      html: `<p>一帧 = 物理补步 → process 逻辑 → 渲染提交 → 缓冲交换，四站顺序固定。以后你可以从任何现象倒着查回引擎：画面撕裂查缓冲交换、逻辑卡顿查 _process、碰撞穿透查物理 tick。阶段一「时间与主循环」到此完结——累积器、双时钟、螺旋死亡、一帧链路，引擎的时间观你已经全部拿到。下一阶段我们打开引擎的骨架：对象系统与架构模式。</p>`
    }
  ]
}
