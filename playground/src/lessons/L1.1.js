// L1.1 · 时间步长实验台：固定步长与螺旋死亡
export default {
  id: 'L1.1',
  title: '时间步长实验台：固定步长与螺旋死亡',
  est: '90 分钟',
  coreQuestions: [
    '为什么直接用本帧 dt 积分不可靠？（同样的代码，60fps 和 30fps 结果不同）',
    '「固定步长 + 累积器」的标准写法是什么？',
    '什么是螺旋死亡（spiral of death）？工业引擎怎么防它？'
  ],
  sections: [
    {
      type: 'text',
      title: 'dt 不可靠：数值积分的宿命',
      html: `<p>上一课我们用 dt 直接积分：<code>位置 += 速度 * dt</code>。它有一个隐藏代价：<b>dt 忽大忽小，同一段逻辑在不同帧率下走出不同轨迹</b>。物理模拟、碰撞判定、录像回放、网络同步，全都依赖「模拟结果只跟模拟时间走，跟渲染帧率无关」。</p>
<p>工业标准解法：<b>模拟时钟与渲染时钟分离</b>。渲染帧率随便波动，物理永远走固定步长，多余的时间攒进累积器：</p>
<pre>frameDt = 本帧耗时（忽长忽短）
accumulator += frameDt
while (accumulator &gt;= FIXED_DT) {
    world.step(FIXED_DT)     // 物理每次走一模一样的小步
    accumulator -= FIXED_DT
}
if (帧太慢，循环次数超上限) accumulator = 0   // 防螺旋死亡
render()</pre>
<p><b>螺旋死亡</b>：帧变慢 → 每帧要补的物理步变多 → 更慢 → 恶性循环。所以必须设上限，「时间债还不完就赖账」（画面慢一点，但系统不崩）。Godot 的 <code>main_timer_sync.cpp</code> 就是这个算法的工业级实现。</p>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'timestep',
      title: '实验：同一场雨，两种时间观',
      height: 520,
      code: `// 左（红）：可变步长 —— 直接用本帧 dt 积分
// 右（绿）：固定步长 1/120 + 累积器 —— 引擎的标准做法
// 空格：注入一次 300ms 的「卡顿帧」，看谁乱了阵脚
// R：重置位置

engine.run({
  setup: function (state) {
    reset(state);
  },

  update: function (state, dt, input) {
    if (input.pressed('KeyR')) reset(state);
    if (input.pressed('Space')) state.spike = 0.3;  // 注入 300ms 卡顿
    var frameDt = dt + state.spike;
    state.spike = 0;

    // A：可变步长 —— 一次跨一大步
    step(state.a, frameDt, 24, 336);
    // B：固定步长 + 累积器 —— 把时间切成固定小块
    state.acc += frameDt;
    var h = 1 / 120;
    var n = 0;
    while (state.acc >= h && n < 40) {
      step(state.b, h, 384, 696);
      state.acc -= h;
      n++;
    }
    if (n >= 40) state.acc = 0;  // 防螺旋死亡：时间债还不完就赖账

    pushTrail(state.a.trail, state.a);
    pushTrail(state.b.trail, state.b);
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    ctx.strokeStyle = '#1e2a3d';
    ctx.beginPath();
    ctx.moveTo(360, 0);
    ctx.lineTo(360, 440);
    ctx.stroke();
    drawBall(state.a, ctx, '#f87171', '可变步长');
    drawBall(state.b, ctx, '#34d399', '固定步长 1/120');
    ctx.fillStyle = '#7d93b3';
    ctx.font = '13px monospace';
    ctx.fillText('空格：注入 300ms 卡顿帧 · R：重置', 12, 22);
  }
});

function reset(state) {
  state.a = { x: 60,  y: 300, vx: 300, vy: -240, trail: [] };
  state.b = { x: 420, y: 300, vx: 300, vy: -240, trail: [] };
  state.acc = 0;
  state.spike = 0;
}

// 两边物理一模一样，唯一的区别是传入的 dt
function step(b, dt, minX, maxX) {
  b.vy += 500 * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  if (b.x < minX) { b.x = minX; b.vx = Math.abs(b.vx); }
  if (b.x > maxX) { b.x = maxX; b.vx = -Math.abs(b.vx); }
  if (b.y < 24)  { b.y = 24;  b.vy = Math.abs(b.vy); }
  if (b.y > 416) { b.y = 416; b.vy = -Math.abs(b.vy) * 0.98; }
}

function pushTrail(trail, b) {
  trail.push({ x: b.x, y: b.y });
  if (trail.length > 260) trail.shift();
}

function drawBall(b, ctx, color, label) {
  for (var i = 0; i < b.trail.length; i++) {
    ctx.fillStyle = color;
    ctx.globalAlpha = (i / b.trail.length) * 0.35;
    ctx.fillRect(b.trail[i].x - 1, b.trail[i].y - 1, 2, 2);
  }
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(b.x, b.y, 10, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.font = '12px monospace';
  ctx.fillStyle = color;
  ctx.fillText(label, b.x - 40, b.y - 18);
}
`
    },
    {
      type: 'text',
      title: '试一试',
      html: `<ul>
  <li>把 <code>h = 1 / 120</code> 改成 <code>1 / 30</code>：步长越粗，同样一次卡顿后偏差越大。</li>
  <li>删掉 <code>if (n >= 40) ...</code> 这行防波堤，然后狂按空格：时间债越欠越多、帧率崩塌——你刚亲手制造了螺旋死亡。</li>
  <li>把重力 500 改成 0 再试：匀速直线几乎不发散（欧拉法对匀速是精确的），<b>误差来自加速度 + 反弹这种不连续</b>——理解误差从哪来，比背公式重要。</li>
  <li>一个思考题：可变步长的球在卡顿帧里一步跨了 0.3 秒，如果这步足够大，它可能直接「穿墙」——这就是碰撞检测里 <b>tunneling</b> 问题的根源之一。</li>
</ul>`
    },
    {
      type: 'source',
      files: [
        { path: 'main/main.cpp', note: 'Main::iteration()：找 physics_steps 变量——物理步如何由固定 tick 切片出来，正是本课累积器的 C++ 版。' },
        { path: 'main/main_timer_sync.cpp', note: 'process 与 physics 两张时间表的对表器：本课「累积器」的工业级完整版（还处理了时钟漂移）。' }
      ]
    },
    {
      type: 'text',
      title: '小结',
      html: `<p>引擎内部不是一个时钟，而是<b>多个时钟的编舞</b>：渲染帧（每秒浮动）、物理 tick（固定 60）、定时器、动画采样……架构上这叫「解耦模拟频率与渲染频率」。后面讲网络同步、动画混合时，这个累积器还会反复出现。</p>`
    }
  ]
}
