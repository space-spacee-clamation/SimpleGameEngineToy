// H3 · 时间系统架构:timeScale 与分层时间
export default {
  id: 'H3',
  title: '时间系统架构：timeScale 与分层时间',
  est: '2 小时',
  coreQuestions: [
    '子弹时间只是「dt 变小」吗？全局缩放与实体分层各管什么？',
    'hit-stop（顿帧）为什么是「让世界停 0.15 秒」而不是「停 9 帧」？',
    '每个实体一块自己的时钟，实现上要防什么坑？',
    '表现层时钟和逻辑层时钟为什么必须分开？'
  ],
  sections: [
  {
    type: 'text',
    title: '时间缩放的两级结构',
    html: `<p>子弹时间/时停/慢镜的实现入口是<b>全局 timeScale</b>：主循环把真实 dt 乘上 scale 再喂给一切系统（Godot 的 Engine.time_scale 就在这一级）。但真正好用的手感来自<b>第二级：每实体自己的时钟</b>——玩家在子弹时间里保持 0.6 倍速可以还手，敌人掉到 0.2 倍速，UI 动画照常 1.0 跑——「世界一起慢，但不一起笨」。</p>
<table>
  <tr><th>层级</th><th>作用域</th><th>典型用途</th></tr>
  <tr><td>全局 timeScale</td><td>一切系统</td><td>全局慢镜/暂停/回放</td></tr>
  <tr><td>实体时钟</td><td>单个角色/区域</td><td>玩家子弹时间、区域时停、敌人各自减速</td></tr>
  <tr><td>顿帧 hit-stop</td><td>全局或受击双方</td><td>打击停顿 0.05~0.2 秒（H2 的三件套之一）</td></tr>
  <tr><td>表现时钟</td><td>动画/粒子/特效</td><td>逻辑停了特效还在飘（或反之）</td></tr>
</table>`
  },
  {
    type: 'text',
    title: '分层时钟的三条工程纪律',
    html: `<p><b>①dt 逐层缩放，不逐层累积。</b>实体时钟只改「自己消费的 dt」，绝不去改全局时间——否则互相改成一锅粥。传递链：真实 dt → 全局 scale → 实体 scale → 该实体 update。</p>
<p><b>②暂停≠不渲染。</b>逻辑时钟停了，表现层（待机动画、粒子余韵、UI 脉动）应继续用自己的时钟跑——「世界静止但画面没死」是高级感的来源。这也是逻辑时钟与表现时钟分开的最大理由。</p>
<p><b>③顿帧用计时器不用帧数。</b>「停 9 帧」在高刷屏上是 0.075 秒、在 30 帧屏上是 0.3 秒——手感完全不同。正确姿势：hitStopTimer 以<b>真实秒</b>倒数，期间全局 scale=0，归零后恢复。</p>`
  },
  {
    type: 'lab',
    lab: 'code',
    key: 'timearch',
    title: '实验：多实体异构时间流（主角慢、敌人各自快）',
    height: 620,
    code: `// WASD=移动主角  Tab=主角子弹时间(按住持续)  1/2/3=敌人减速开关  空格=顿帧  Q/E=全局缩放
// 右侧:每个实体一条「节拍带」——圆点表示它这一帧真的 update 了

engine.run({
  setup: function (state) {
    state.globalScale = 1;
    state.playerSlow = false;
    state.enemySlow = [false, false, false];
    state.hitStop = 0;
    state.px = 200;
    state.py = 240;
    state.t = 0;
    state.rng = mulberry32(20260903);
    state.enemies = [];
    for (var i = 0; i < 3; i++) {
      state.enemies.push({
        x: 480 + i * 40, y: 120 + i * 120, ang: i * 2.1,
        tick: 0, trail: []
      });
    }
    state.ticks = { player: 0 };
    state.log = ['Tab 按住=主角子弹时间;空格=顿帧'];
  },

  update: function (state, dt, input) {
    state.t += dt;
    if (input.pressed('KeyQ')) { state.globalScale = Math.max(0.1, state.globalScale - 0.1); pushLog(state, '全局缩放=' + state.globalScale.toFixed(1)); }
    if (input.pressed('KeyE')) { state.globalScale = Math.min(2, state.globalScale + 0.1); pushLog(state, '全局缩放=' + state.globalScale.toFixed(1)); }
    if (input.pressed('Digit1')) { state.enemySlow[0] = !state.enemySlow[0]; }
    if (input.pressed('Digit2')) { state.enemySlow[1] = !state.enemySlow[1]; }
    if (input.pressed('Digit3')) { state.enemySlow[2] = !state.enemySlow[2]; }
    if (input.pressed('Space')) { state.hitStop = 0.15; clog(state, '顿帧 0.15s(真实秒)'); }
    // 顿帧:真实秒倒数,期间一切 scale 归零
    if (state.hitStop > 0) {
      state.hitStop -= dt;
      return;
    }
    state.playerSlow = input.down('Tab');
    // 主角:全局缩放 × 自身(子弹时间 0.4)
    var pScale = state.globalScale * (state.playerSlow ? 0.4 : 1);
    var pdt = dt * pScale;
    var sp = 150;
    if (input.down('KeyA')) state.px -= sp * pdt;
    if (input.down('KeyD')) state.px += sp * pdt;
    if (input.down('KeyW')) state.py -= sp * pdt;
    if (input.down('KeyS')) state.py += sp * pdt;
    state.px = clamp(state.px, 14, 570);
    state.py = clamp(state.py, 14, 420);
    state.ticks.player++;
    // 敌人:各自 0.25 或 1 倍再乘全局
    for (var i = 0; i < 3; i++) {
      var e = state.enemies[i];
      var esc = state.globalScale * (state.enemySlow[i] ? 0.25 : 1);
      var edt = dt * esc;
      e.ang += edt * 1.6;
      e.x += Math.cos(e.ang) * 60 * edt;
      e.y += Math.sin(e.ang * 0.7) * 40 * edt;
      e.x = clamp(e.x, 380, 590);
      e.y = clamp(e.y, 14, 420);
      if (edt > 0) e.tick++;
      e.trail.push({ x: e.x, y: e.y, on: edt > 0 });
      if (e.trail.length > 60) e.trail.shift();
    }
    while (state.log.length > 3) state.log.shift();
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    // 场地
    ctx.fillStyle = '#101826';
    ctx.fillRect(12, 12, 586, 420);
    ctx.strokeStyle = '#2c3e55';
    ctx.strokeRect(12, 12, 586, 420);
    // 主角(子弹时间时发蓝)
    ctx.fillStyle = state.playerSlow ? '#5b8fd6' : '#ffd479';
    ctx.beginPath();
    ctx.arc(state.px, state.py, 9, 0, 6.2832);
    ctx.fill();
    // 敌人+节拍带
    for (var i = 0; i < 3; i++) {
      var e = state.enemies[i];
      ctx.fillStyle = state.enemySlow[i] ? '#f87171' : '#f59e0b';
      ctx.fillRect(e.x - 6, e.y - 6, 12, 12);
      for (var k = 0; k < e.trail.length; k++) {
        var tp = e.trail[k];
        ctx.fillStyle = tp.on ? 'rgba(245,158,11,0.4)' : 'rgba(90,110,140,0.2)';
        ctx.fillRect(tp.x - 1, tp.y - 1, 2, 2);
      }
      // 节拍带:它这一帧是否真的 update
      ctx.fillStyle = '#2c3e55';
      ctx.fillRect(612, 100 + i * 60, 90, 24);
      ctx.fillStyle = state.enemySlow[i] ? '#f87171' : '#6ee7b7';
      var beat = (Math.floor(state.t * 60) % (state.enemySlow[i] ? 4 : 1)) === 0;
      ctx.fillRect(614 + (Math.floor(state.t * 60) % 21) * 4, 106 + i * 60, 3, 12);
      ctx.fillStyle = '#8fa7c7';
      ctx.font = '10px monospace';
      ctx.fillText('敌' + (i + 1) + (state.enemySlow[i] ? ' 0.25x' : ' 1x'), 612, 96 + i * 60);
    }
    ctx.fillStyle = '#6ee7b7';
    ctx.fillRect(612, 286, (state.playerSlow ? 40 : 90), 12);
    ctx.fillStyle = '#8fa7c7';
    ctx.fillText('主角 ' + (state.playerSlow ? '0.4x' : '1x'), 612, 282);
    drawHud(state, ctx);
  }
});

// ---------- 工具 ----------

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pushLog(state, s) {
  state.log.push(s);
  if (state.log.length > 3) state.log.shift();
}

function clog(state, s) {
  pushLog(state, s);
}

function drawHud(state, ctx) {
  ctx.fillStyle = 'rgba(11,15,23,0.92)';
  ctx.fillRect(8, 6, 704, 24);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('全局 scale=' + state.globalScale.toFixed(1) + '  主角=' + (state.playerSlow ? '0.4x(子弹时间)' : '1x') +
    '  敌1=' + (state.enemySlow[0] ? '0.25x' : '1x') + ' 敌2=' + (state.enemySlow[1] ? '0.25x' : '1x') +
    ' 敌3=' + (state.enemySlow[2] ? '0.25x' : '1x') + (state.hitStop > 0 ? '  [顿帧中]' : ''), 16, 24);
  ctx.fillStyle = '#5b7397';
  ctx.font = '11px monospace';
  ctx.fillText('WASD=移动  按住 Tab=主角子弹时间  1/2/3=敌人减速  空格=顿帧  Q/E=全局缩放', 16, 448);
  ctx.fillStyle = '#5b7397';
  ctx.fillText('右侧节拍带=各实体这帧是否真的 update(减速的实体拍子变稀)', 16, 464);
}`
  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>按住 Tab：</b>主角发蓝变慢但操作依然跟手，敌人照常速度——「世界一起慢，你不一起笨」的子弹时间，本质是实体级 scale 叠在全局之上。</li>
  <li><b>按 1/2/3：</b>对应敌人的节拍带拍子变稀（每 4 帧才 update 一次）、轨迹点也稀疏——「每个实体一块自己的时钟」从抽象变成看得见的节拍。</li>
  <li><b>空格顿帧：</b>一切归零 0.15 个<b>真实秒</b>——在高刷屏和低刷屏上手感一致；试着把它想成「停 9 帧」感受一下差别。</li>
  <li><b>Q 把全局拉到 0.2：</b>主角和敌人都慢，但节拍带的比例关系不变——全局缩放是乘在最上面的一级，不改各层配比。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：缩放发生在哪一级',
    files: [
      { path: 'scene/main/scene_tree.cpp', note: 'time_scale 的官方宿主：SceneTree 把缩放后的 dt 分发给节点处理——全局一级缩放的实现处。建议搜索：time_scale、process、physics_frame。' },
      { path: 'main/main.cpp', note: 'Main::iteration 的固定步累积器：缩放发生在「累积多少时间」这一层，物理步长本身不变——顿帧/慢镜不会破坏物理稳定性。建议搜索：advance、fixed_fps、process_step。' },
      { path: 'core/os/os.cpp', note: '系统时间源：get_ticks_usec 是一切 dt 的上游——真实秒计时（顿帧计时器）的锚点。建议搜索：get_ticks_usec、get_ticks_msec。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>时间系统 = 全局缩放（一层旋钮）+ 实体分层（各自的 dt）+ 顿帧（真实秒计时器）+ 表现/逻辑分离（特效有自己的心跳）。四件套齐了，子弹时间、时停、打击停顿、区域减速都是组装题。</p>
<ul>
  <li><b>数据怎么流动？</b>真实 dt → 全局 scale → 实体 scale → 该实体的 update；表现层从旁另取一份不缩放或另缩放的 dt。</li>
  <li><b>所有权归谁？</b>真实时间归 OS，缩放策略归游戏规则，实体时钟归实体自己——上游永远不改下游的表。</li>
  <li><b>什么时候发生？</b>缩放每帧计算、顿帧用真实秒倒数、节拍差在连续帧上显现——所有「时间魔法」的会计单位都是帧与真实秒，绝不用「帧数」。</li>
</ul>`
  }
  ]
};
