// F4 · 行为树与 AI 决策:BT vs GOAP vs HTN
export default {
  id: 'F4',
  title: '行为树与 AI 决策：BT vs GOAP vs HTN',
  est: '2 小时',
  coreQuestions: [
    '行为树的 selector/sequence/decorator 各在回答什么问题？',
    '黑板（blackboard）为什么是行为树的「工作记忆」？',
    '打断（interrupt）怎么让 AI 不至于把旧计划执行到底？',
    'GOAP/HTN 用「规划自由」换走了 BT 的什么？'
  ],
  sections: [
  {
    type: 'text',
    title: '行为树：把 AI 的「下一步」写成树',
    html: `<p>状态机在 AI 行为一多就会「边爆炸」（每个状态两两连线）。行为树（BT）把它改成树形组合：<b>selector（或）</b>逐个尝试子节点直到一个成功——「优先做更重要的」；<b>sequence（且）</b>依次执行全部子节点——「按步骤完成一件事」；<b>decorator（装饰）</b>包裹节点改变语义——重试 N 次、限频、取反。</p>
<p>每帧从根 tick 一次：这带来 BT 最大的美德——<b>天生可打断</b>。高优先级分支（「血量低了逃跑」）排在 selector 前面，条件一满足立即接管，AI 永远不会「沉浸」在旧计划里。</p>`
  },
  {
    type: 'text',
    title: '黑板与三兄弟',
    html: `<p><b>黑板（blackboard）</b>是树的所有节点共享的工作记忆：hp、目标距离、可见性、上次攻击时间……条件节点读它，动作节点写它。打断的本质是「黑板变了，树这一帧 tick 出不同的路径」。</p>
<table>
  <tr><th>流派</th><th>怎么决定下一步</th><th>换来什么/失去什么</th></tr>
  <tr><td>BT</td><td>设计者手排优先级，每帧 tick</td><td>可控直观 / 复杂目标要手写很多分支</td></tr>
  <tr><td>GOAP</td><td>给定目标自动搜索动作序列（A* over actions）</td><td>涌现式灵活 / 规划成本+难调试</td></tr>
  <tr><td>HTN</td><td>把「意图」递归分解成任务清单再执行</td><td>计划可审查 / 领域建模成本高</td></tr>
</table>
<p>工业现实：多数游戏 AI 用 BT 做骨架，在关键节点局部引入 GOAP 式规划。</p>`
  },
  {
    type: 'lab',
    lab: 'code',
    key: 'bt',
    title: '实验：巡逻兵行为树沙盘（黑板 + 打断 + 调试视图）',
    height: 620,
    code: `// WASD=移动玩家( intruder )  E=朝玩家方向开火(触发 NPC 的交战/撤退)  Tab=调试视图  空格=暂停
// NPC 行为树:血量低撤退 > 玩家可见则交战 > 玩家最近出现在附近则搜索 > 巡逻
// 右侧实时高亮树的正 tick 路径 + 黑板内容

var TREE = [
  { id: 'root', kind: 'sel', name: '根(选择)', ch: [1, 4, 7, 9] },
  { id: 1, kind: 'dec', name: '血量<30%?', ch: [2] },
  { id: 2, kind: 'seq', name: '撤退序列', ch: [3] },
  { id: 3, kind: 'act', name: '跑向出生点', act: 'flee' },
  { id: 4, kind: 'dec', name: '玩家可见?', ch: [5] },
  { id: 5, kind: 'seq', name: '交战序列', ch: [6] },
  { id: 6, kind: 'act', name: '追踪并射击', act: 'combat' },
  { id: 7, kind: 'dec', name: '有搜索线索?', ch: [8] },
  { id: 8, kind: 'act', name: '去线索位置', act: 'search' },
  { id: 9, kind: 'act', name: '巡逻', act: 'patrol' }
];

engine.run({
  setup: function (state) {
    state.t = 0;
    state.paused = false;
    state.npc = { x: 420, y: 120, hp: 100, home: { x: 420, y: 120 } };
    state.pl = { x: 120, y: 380 };
    state.shots = [];
    state.shotTimer = 0;
    state.clue = null;
    state.clueTimer = 0;
    state.bb = { hp: 100, dist: 0, visible: false, hasClue: false };
    state.activePath = [];
    state.debug = true;
    state.patrolDir = 1;
    state.log = ['E=朝 NPC 方向开火;靠近 NPC 看它交战'];
  },

  update: function (state, dt, input) {
    state.t += dt;
    if (input.pressed('Space')) { state.paused = !state.paused; }
    if (input.pressed('Tab')) { state.debug = !state.debug; }
    var sp = 120;
    if (input.down('KeyA')) state.pl.x -= sp * dt;
    if (input.down('KeyD')) state.pl.x += sp * dt;
    if (input.down('KeyW')) state.pl.y -= sp * dt;
    if (input.down('KeyS')) state.pl.y += sp * dt;
    state.pl.x = clamp(state.pl.x, 12, 348);
    state.pl.y = clamp(state.pl.y, 12, 388);
    // 玩家开火:命中则 NPC 掉血+产生搜索线索
    state.shotTimer -= dt;
    if (input.pressed('KeyE') && state.shotTimer <= 0) {
      state.shotTimer = 0.4;
      var dx = state.npc.x - state.pl.x, dy = state.npc.y - state.pl.y;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      state.shots.push({ x: state.pl.x, y: state.pl.y, vx: dx / d * 420, vy: dy / d * 420, life: 1.2 });
      state.clue = { x: state.npc.x, y: state.npc.y };
      state.clueTimer = 6;
    }
    for (var i = state.shots.length - 1; i >= 0; i--) {
      var s = state.shots[i];
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      if (dist(s.x, s.y, state.npc.x, state.npc.y) < 12) {
        state.npc.hp = Math.max(0, state.npc.hp - 12);
        s.life = 0;
      }
      if (s.life <= 0) state.shots.splice(i, 1);
    }
    if (state.clueTimer > 0) { state.clueTimer -= dt; if (state.clueTimer <= 0) state.clue = null; }
    if (state.npc.hp < 100 && state.t % 4 < dt) state.npc.hp = Math.min(100, state.npc.hp + 6);  // 缓慢回血

    // 黑板
    var d2p = dist(state.npc.x, state.npc.y, state.pl.x, state.pl.y);
    state.bb.hp = state.npc.hp;
    state.bb.dist = Math.round(d2p);
    state.bb.visible = d2p < 150;
    state.bb.hasClue = !!state.clue;

    // tick 行为树(每帧从根开始,记录实际走的路径=调试视图)
    if (!state.paused) {
      state.activePath = [];
      var action = tickNode(state, 'root');
      runAction(state, action, dt);
    }
    while (state.log.length > 3) state.log.shift();
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    drawArena(state, ctx);
    if (state.debug) drawTree(state, ctx);
    drawHud(state, ctx);
  }
});

// ---------- 行为树 tick ----------

function tickNode(state, id) {
  var node = findNode(id);
  state.activePath.push(id);
  if (node.kind === 'dec') {
    var cond = true;
    if (id === 1) cond = state.bb.hp < 30;
    if (id === 4) cond = state.bb.visible;
    if (id === 7) cond = state.bb.hasClue;
    if (!cond) return null;
    for (var i = 0; i < node.ch.length; i++) {
      var r = tickNode(state, node.ch[i]);
      if (r) return r;
    }
    return null;
  }
  if (node.kind === 'sel') {
    for (var s = 0; s < node.ch.length; s++) {
      var r2 = tickNode(state, node.ch[s]);
      if (r2) return r2;
    }
    return null;
  }
  if (node.kind === 'seq') {
    for (var q = 0; q < node.ch.length; q++) {
      var r3 = tickNode(state, node.ch[q]);
      if (!r3) return null;
    }
    return node.name;
  }
  if (node.kind === 'act') return node.act;
  return null;
}

function findNode(id) {
  for (var i = 0; i < TREE.length; i++) if (TREE[i].id === id) return TREE[i];
  return null;
}

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

function dist(x1, y1, x2, y2) {
  var dx = x1 - x2, dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

function runAction(state, action, dt) {
  var sp = 90;
  if (action === 'patrol') {
    state.npc.x += state.patrolDir * sp * 0.5 * dt;
    if (state.npc.x > 500 || state.npc.x < 300) state.patrolDir *= -1;
  } else if (action === 'combat') {
    var dx = state.pl.x - state.npc.x, dy = state.pl.y - state.npc.y;
    var d = Math.sqrt(dx * dx + dy * dy) || 1;
    if (d > 70) { state.npc.x += dx / d * sp * dt; state.npc.y += dy / d * sp * dt; }
  } else if (action === 'search') {
    if (state.clue) {
      var cx = state.clue.x - state.npc.x, cy = state.clue.y - state.npc.y;
      var cd = Math.sqrt(cx * cx + cy * cy) || 1;
      if (cd > 6) { state.npc.x += cx / cd * sp * dt; state.npc.y += cy / cd * sp * dt; }
    }
  } else if (action === 'flee') {
    var fx = state.npc.home.x - state.npc.x, fy = state.npc.home.y - state.npc.y;
    var fd = Math.sqrt(fx * fx + fy * fy) || 1;
    state.npc.x += fx / fd * sp * 1.3 * dt;
    state.npc.y += fy / fd * sp * 1.3 * dt;
  }
}

// ---------- 绘制 ----------

function drawArena(state, ctx) {
  var x0 = 16, y0 = 52;
  ctx.fillStyle = '#101826';
  ctx.fillRect(x0, y0, 360, 400);
  ctx.strokeStyle = '#2c3e55';
  ctx.strokeRect(x0, y0, 360, 400);
  if (state.clue && state.clueTimer > 0) {
    ctx.strokeStyle = 'rgba(245,158,11,0.6)';
    ctx.beginPath();
    ctx.arc(x0 + state.clue.x, y0 + state.clue.y, 10 + Math.sin(state.t * 6) * 3, 0, 6.2832);
    ctx.stroke();
  }
  for (var i = 0; i < state.shots.length; i++) {
    ctx.fillStyle = '#f87171';
    ctx.fillRect(x0 + state.shots[i].x - 2, y0 + state.shots[i].y - 2, 4, 4);
  }
  ctx.fillStyle = '#5b8fd6';
  ctx.fillRect(x0 + state.pl.x - 6, y0 + state.pl.y - 6, 12, 12);
  ctx.fillStyle = state.bb.hp < 30 ? '#f87171' : '#f59e0b';
  ctx.fillRect(x0 + state.npc.x - 8, y0 + state.npc.y - 8, 16, 16);
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '10px monospace';
  ctx.fillText('NPC hp ' + Math.round(state.bb.hp), x0 + state.npc.x - 24, y0 + state.npc.y - 14);
  if (state.bb.visible) {
    ctx.strokeStyle = 'rgba(248,113,113,0.3)';
    ctx.beginPath();
    ctx.moveTo(x0 + state.npc.x, y0 + state.npc.y);
    ctx.lineTo(x0 + state.pl.x, y0 + state.pl.y);
    ctx.stroke();
  }
  ctx.fillStyle = '#5b7397';
  ctx.fillText('蓝=玩家( WASD 移动 E 开火 )  橙=巡逻兵  虚线=视野', x0 + 6, y0 + 390);
}

function drawTree(state, ctx) {
  var x = 400, y = 64;
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText('行为树(实时高亮本帧 tick 路径):', x, y - 12);
  var active = {};
  for (var i = 0; i < state.activePath.length; i++) active[state.activePath[i]] = 1;
  for (var n = 0; n < TREE.length; n++) {
    var node = TREE[n];
    var indent = node.kind === 'root' ? 0 : 1 + (node.id >= 2 && node.id <= 3 ? 1 : 0) + (node.id === 3 ? 1 : 0) + (node.id >= 5 && node.id <= 6 ? 1 : 0) + (node.id === 6 ? 1 : 0) + (node.id >= 8 ? 1 : 0);
    var ny = y + n * 24;
    var on = active[node.id] === 1;
    ctx.fillStyle = on ? '#14301f' : '#141a24';
    ctx.fillRect(x + indent * 18, ny - 2, 300 - indent * 18, 20);
    ctx.strokeStyle = on ? '#6ee7b7' : '#3b4d6b';
    ctx.strokeRect(x + indent * 18, ny - 2, 300 - indent * 18, 20);
    ctx.fillStyle = on ? '#a7f3d0' : '#5b7397';
    ctx.fillText(node.name, x + indent * 18 + 6, ny + 12);
  }
  // 黑板
  var by = y + TREE.length * 24 + 16;
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('黑板:', x, by);
  ctx.fillStyle = '#9db4d0';
  ctx.fillText('hp=' + state.bb.hp + '  dist=' + state.bb.dist + '  可见=' + (state.bb.visible ? '是' : '否') + '  线索=' + (state.bb.hasClue ? '有' : '无'), x + 48, by);
}

function drawHud(state, ctx) {
  ctx.fillStyle = 'rgba(11,15,23,0.92)';
  ctx.fillRect(8, 6, 704, 34);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('E=开火(打断 AI 计划)  Tab=调试视图  空格=暂停  打断演示:把 NPC 打到 30% 以下,撤退分支立即接管', 16, 20);
  for (var i = 0; i < state.log.length; i++) {
    ctx.fillStyle = i === state.log.length - 1 ? '#ffd479' : '#5b7397';
    ctx.fillText(state.log[i], 16, 620 - 24 + i * 0 + i * 14);
  }
  ctx.fillStyle = '#5b7397';
  ctx.font = '11px monospace';
  ctx.fillText('-selector 逐个试:优先级从上到下;sequence 全成才算成;条件不满足=该分支死亡', 16, 620 - 8);
}`

  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>靠近巡逻兵：</b>「玩家可见?」点亮、交战分支接管，NPC 追着你打——selector 的优先级让「交战」天然压过「巡逻」。</li>
  <li><b>打它到 30% 以下（E 连发）：</b>注意树的高亮：顶层条件「血量<30%?」一满足，<b>同一帧内</b>撤退分支接管——打断不是事件回调，是每帧重新 tick 的天然结果。</li>
  <li><b>打一枪就跑：</b>你离开视野但留下射击位置——「有搜索线索?」分支点亮，NPC 去线索处踱步；6 秒线索过期（黑板变化），它回巡逻。</li>
  <li><b>Tab 关调试视图：</b>你看到的是玩家看到的；开回来，你看到的是 AI 工程师看到的——调试视图是行为树工作流的标配。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：树、信号与延迟队列',
    files: [
      { path: 'core/object/object.h', note: '信号（signal）机制：黑板变化的广播底层——「血量变了」如何叫醒关心它的系统。建议搜索：signal_emit、connect。' },
      { path: 'core/object/message_queue.cpp', note: '延迟消息队列：帧末统一派发的调用缓存——与行为树的「帧末结算、下一帧生效」同款思想。建议搜索：push_call、flush。' },
      { path: 'scene/main/node.cpp', note: 'Node 树的递归结构：行为树也是一种树，tick 的深度优先遍历与这里的 _propagate 系列同构。建议搜索：_propagate_notification、children。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>行为树 = 优先级选择器（谁重要做谁）+ 序列（步骤感）+ 黑板（工作记忆）+ 每 tick 重走（天然可打断）。GOAP/HTN 用规划换灵活，BT 用可控换省心——工业 AI 常是 BT 骨架 + 局部规划。</p>
<ul>
  <li><b>数据怎么流动？</b>世界变化→黑板更新→树从根 tick→条件分支实时筛选→胜出动作改变 NPC。</li>
  <li><b>所有权归谁？</b>树结构是策划的资产，黑板是运行时状态，动作是程序的能力——三者解耦，改优先级不用动代码。</li>
  <li><b>什么时候发生？</b>每帧从根重 tick（或事件驱动局部重 tick）——「打断」之所以免费，正因为决策不是一次性的而是每帧刷新的。</li>
</ul>`
  }
  ]
};
