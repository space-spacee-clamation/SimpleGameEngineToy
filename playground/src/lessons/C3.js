// C3 · 手写 mini-ECS II:调度、脏标记与事件
export default {
  id: 'C3',
  title: '手写 mini-ECS II：调度、脏标记与事件',
  est: '2.5 小时',
  coreQuestions: [
    'System 的执行顺序谁来定？为什么声明顺序不可信？',
    '「每帧全跑」浪费在哪？版本号怎么把全量帧变成增量帧？',
    '为什么遍历中不能直接发事件？帧末派发买到了什么、又付出了什么？',
    '调度器看不见的依赖（事件边）靠什么保证正确？'
  ],
  sections: [
  {
    type: 'text',
    title: 'C2 造好了仓库，本课装上「管家婆」三层',
    html: `<p>C2 的 mini-ECS 解决了「数据怎么存、怎么查」：archetype 存储、位掩码 Query、System 遍历。但真实的引擎帧还有一整层<b>编排问题</b>没回答：<b>谁先跑？跑几次？怎么不打架？</b>本课给 mini-ECS 装上三件管理工具：</p>
<table>
  <tr><th>机制</th><th>解决什么</th><th>一句话原理</th></tr>
  <tr><td>调度</td><td>执行顺序</td><td>每个 system 声明读集/写集，A 写的组件被 B 读，就产生一条 A→B 边；拓扑排序=无冲突执行序</td></tr>
  <tr><td>脏标记</td><td>执行次数</td><td>每次写组件就把版本号 +1；system 记住上次见过的版本，启动前查一眼——没变就整帧 SKIP</td></tr>
  <tr><td>deferred 事件</td><td>遍历安全</td><td>遍历中改结构=过河拆桥；事件先入队，帧末统一结算</td></tr>
</table>
<p>三者拼出的心智模型：<b>帧 = 沿 DAG 走一遍；每个节点出发前先看「我的原料变了吗」；所有副作用里最危险的那种（事件）被推到帧边界统一落账。</b></p>`
  },
  {
    type: 'text',
    title: '三条暗线：可见边、版本号、看不见的边',
    html: `<p><b>可见边与不可见边。</b>读写集推出的边是调度器「看得见」的；但事件是隐藏依赖——碰撞系统发事件、受击系统消费事件，两边都不体现在读写集里。调度器看不见它，只能靠<b>帧边界保序</b>：事件在帧末结算，下游最快也要下一帧才读到新值。这是延迟派发的代价，也是它的正确性来源。</p>
<p><b>版本号的粒度。</b>本课按「组件类型 × 实体」记版本，system 记住自己读过的最大版本号。工业实现（Bevy 的 change detection）同样是这个思路：World 维护 tick，Query 拿上次运行点之后的变更流。</p>
<p><b>量化写入。</b>脏标记的省钱前提是「写」要诚实：值没变就不要碰版本号。所以本课实验里移动系统会先算出新位置、和旧值相等就<b>不写不标记</b>——「空转帧」就是这么被省成零成本的。</p>`
  },
  {
    type: 'lab',
    lab: 'code',
    key: 'sched',
    title: '实验：调度 DAG + 脏标记账本 + 帧末事件派发',
    height: 620,
    code: `// mini-ECS II 实验台:上半=依赖 DAG 与拓扑调度,下半=脏标记账本+世界条带+帧末事件派发
// 空格=单步(含帧末派发步)  回车=自动连跑  M=随机改一个组件  R=重置
// 执行顺序不按声明顺序:由每个 system 的读集/写集自动推出拓扑序

engine.run({
  setup: function (state) {
    initWorld(state);
  },

  update: function (state, dt, input) {
    state.t += dt;
    if (state.dispatchFlash > 0) state.dispatchFlash -= dt;
    if (input.pressed('KeyR')) { initWorld(state); return; }
    if (input.pressed('KeyM')) mutateRandom(state, '手动');
    if (input.pressed('Space')) stepFrame(state);
    if (input.pressed('Enter')) {
      state.auto = !state.auto;
      state.autoTimer = 0;
      pushLog(state, state.auto ? '自动连跑:开启(每0.3s一步)' : '自动连跑:暂停');
    }
    if (state.auto) {
      state.autoTimer += dt;
      if (state.autoTimer >= 0.3) { state.autoTimer = 0; stepFrame(state); }
    }
    // 摇杆:每 2.5s 换一次意图,制造「有变化的帧」和「全 SKIP 的帧」
    state.joyTimer -= dt;
    if (state.joyTimer <= 0) {
      state.joyTimer = 2.5;
      state.joyIdx++;
      state.joy = [30, -22, 0, 14][state.joyIdx % 4];
      pushLog(state, '摇杆输入变化: vx=' + state.joy);
    }
    for (var i = 0; i < state.entities.length; i++) {
      if (state.entities[i].aniT > 0) state.entities[i].aniT -= dt;
    }
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    drawHud(state, ctx);
    drawDag(state, ctx);
    drawOrder(state, ctx);
    drawBoard(state, ctx);
    drawWorldStrip(state, ctx);
    drawEventTrack(state, ctx);
    drawFooter(state, ctx);
  }
});

// ---------- 世界与数据 ----------

var SIM_DT = 1 / 60;
var WALL_X = 120;

// 六个 system:声明顺序故意打乱,执行序由调度器推出
var SYSTEM_DEFS = [
  { key: 'render',  name: '渲染同步', reads: ['POS', 'SPR'], writes: [], tag: '读POS SPR' },
  { key: 'collide', name: '碰撞检测', reads: ['POS'], writes: [], tag: '读POS 发事件' },
  { key: 'input',   name: '输入意图', reads: [], writes: ['VEL'], tag: '写VEL' },
  { key: 'anim',    name: '动画推进', reads: ['ANI'], writes: ['SPR'], tag: '读ANI 写SPR' },
  { key: 'move',    name: '移动积分', reads: ['VEL'], writes: ['POS'], tag: '读VEL 写POS' },
  { key: 'hurt',    name: '受击反应', reads: ['HP'], writes: ['ANI'], tag: '读HP 写ANI' }
];

var NODE_POS = {
  input: [46, 44], move: [216, 44], collide: [386, 44],
  hurt: [46, 136], anim: [216, 136], render: [386, 136]
};
var NODE_W = 132, NODE_H = 54;
var EDGES = [['input', 'move'], ['move', 'collide'], ['move', 'render'], ['hurt', 'anim'], ['anim', 'render']];
var GHOST_EDGES = [['collide', 'hurt']];

function initWorld(state) {
  state.rng = mulberry32(20260903);
  state.t = 0;
  state.frame = 1;
  state.cursor = 0;            // 0..5=拓扑序各系统, 6=帧末派发步
  state.auto = false;
  state.autoTimer = 0;
  state.dispatchFlash = 0;
  state.joy = 30;
  state.joyIdx = 0;
  state.joyTimer = 2.5;
  state.entities = makeEntities();
  state.versions = { VEL: {}, POS: {}, HP: {}, ANI: {}, SPR: {} };
  state.pending = [];
  state.log = ['世界已就位:初始摆放记为版本1'];
  state.stats = { ran: 0, skipped: 0 };
  var defs = SYSTEM_DEFS;
  state.order = topoSort(defs);
  state.systems = [];
  state.byKey = {};
  for (var i = 0; i < defs.length; i++) {
    var seen = {};
    for (var r = 0; r < defs[i].reads.length; r++) seen[defs[i].reads[r]] = 0;
    var sys = { def: defs[i], seen: seen, status: 'wait', dirty: true };
    state.systems.push(sys);
    state.byKey[defs[i].key] = sys;
  }
  // 初始摆放写一遍全部组件版本:首帧全体按脏处理,完整跑一遍
  var comps = ['VEL', 'POS', 'HP', 'ANI', 'SPR'];
  for (var e = 0; e < state.entities.length; e++) {
    for (var c = 0; c < comps.length; c++) touch(state, state.entities[e], comps[c]);
  }
}

var NAMES = ['勇者', '蝙蝠', '史莱姆A', '史莱姆B', '史莱姆C', '骷髅', '哥布林', '史莱姆D'];
var SPAWN_X = [420, 360, 132, 104, 300, 520, 250, 92];
var SPAWN_HP = [100, 80, 60, 46, 70, 90, 55, 40];

function makeEntities() {
  var out = [];
  for (var i = 0; i < NAMES.length; i++) {
    out.push({ id: i, name: NAMES[i], x: SPAWN_X[i], vx: 0, hp: SPAWN_HP[i], aniT: 0, spr: 0, cd: 0 });
  }
  return out;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 版本号与脏检查 ----------

function touch(state, ent, comp) {
  var v = state.versions[comp];
  v[ent.id] = (v[ent.id] || 0) + 1;
}

function maxVer(state, comp) {
  var m = 0, v = state.versions[comp];
  for (var k in v) if (v[k] > m) m = v[k];
  return m;
}

function isDirty(state, sys) {
  for (var r = 0; r < sys.def.reads.length; r++) {
    if (maxVer(state, sys.def.reads[r]) > sys.seen[sys.def.reads[r]]) return true;
  }
  return false;
}

// ---------- 调度:稳定拓扑排序 ----------

function topoSort(defs) {
  var order = [], done = {}, progress = true;
  function satisfied(d) {
    for (var r = 0; r < d.reads.length; r++) {
      for (var j = 0; j < defs.length; j++) {
        if (done[defs[j].key]) continue;
        for (var w = 0; w < defs[j].writes.length; w++) {
          if (defs[j].writes[w] === d.reads[r]) return false;
        }
      }
    }
    return true;
  }
  while (order.length < defs.length && progress) {
    progress = false;
    for (var i = 0; i < defs.length; i++) {
      if (done[defs[i].key]) continue;
      if (satisfied(defs[i])) { done[defs[i].key] = true; order.push(defs[i].key); progress = true; break; }
    }
  }
  return order;
}

// ---------- 帧推进 ----------

function stepFrame(state) {
  var n = state.order.length;
  if (state.cursor === 0) {
    state.stats = { ran: 0, skipped: 0 };
    for (var i = 0; i < state.systems.length; i++) state.systems[i].status = 'wait';
    if (state.auto && state.frame % 3 === 0) mutateRandom(state, '自动注入');
  }
  if (state.cursor < n) {
    var sys = state.byKey[state.order[state.cursor]];
    if (isDirty(state, sys)) runSystem(state, sys);
    else {
      sys.status = 'skip';
      state.stats.skipped++;
      pushLog(state, 'SKIP ' + sys.def.name + '(读集版本没变)');
    }
    state.cursor++;
  } else {
    dispatchEvents(state);
    state.cursor = 0;
  }
}

function runSystem(state, sys) {
  var k = sys.def.key, ents = state.entities, i, e;
  if (k === 'input') {
    for (i = 0; i < ents.length; i++) {
      e = ents[i];
      if (e.vx !== state.joy) { e.vx = state.joy; touch(state, e, 'VEL'); }
    }
  } else if (k === 'move') {
    for (i = 0; i < ents.length; i++) {
      e = ents[i];
      var nx = e.x + e.vx * SIM_DT;
      if (nx < 20) nx = 20;
      if (nx > 700) nx = 700;
      if (nx !== e.x) { e.x = nx; touch(state, e, 'POS'); }
    }
  } else if (k === 'collide') {
    for (i = 0; i < ents.length; i++) {
      e = ents[i];
      e.cd -= SIM_DT;
      if (e.x <= WALL_X && e.cd <= 0 && e.hp > 0) {
        state.pending.push({ ent: e.id, name: e.name, dmg: 6 });
        e.cd = 1.6;
        pushLog(state, '碰撞检测:' + e.name + ' 撞墙,事件入队(不动组件)');
      }
    }
  } else if (k === 'hurt') {
    for (i = 0; i < ents.length; i++) {
      e = ents[i];
      if (e.hp < 55 && e.hp > 0) { e.aniT = 0.5; touch(state, e, 'ANI'); }
    }
  } else if (k === 'anim') {
    for (i = 0; i < ents.length; i++) {
      e = ents[i];
      var ns = (Math.floor(state.t * 6) + e.id) % 2;
      if (ns !== e.spr) { e.spr = ns; touch(state, e, 'SPR'); }
    }
  } else if (k === 'render') {
    var count = 0;
    for (i = 0; i < ents.length; i++) if (ents[i].hp > 0) count++;
    pushLog(state, '渲染同步:提交 ' + count + ' 个可见实体');
  }
  for (var r = 0; r < sys.def.reads.length; r++) sys.seen[sys.def.reads[r]] = maxVer(state, sys.def.reads[r]);
  sys.status = 'ran';
  state.stats.ran++;
}

function dispatchEvents(state) {
  var n = state.pending.length, i, e;
  if (n > 0) {
    for (i = 0; i < n; i++) {
      e = state.entities[state.pending[i].ent];
      e.hp = Math.max(0, e.hp - state.pending[i].dmg);
      touch(state, e, 'HP');
    }
    pushLog(state, '帧末派发:' + n + ' 个事件结算,HP 版本号+1(下游下帧响应)');
    state.dispatchFlash = 0.6;
  } else {
    pushLog(state, '帧末派发:队列为空,零成本翻页');
  }
  state.pending = [];
  state.frame++;
}

function mutateRandom(state, label) {
  var pool = ['VEL', 'POS', 'HP'];
  var comp = pool[Math.floor(state.rng() * pool.length)];
  var e = state.entities[Math.floor(state.rng() * state.entities.length)];
  if (comp === 'VEL') {
    e.vx = Math.round((state.rng() * 2 - 1) * 40);
    pushLog(state, label + ':改 ' + e.name + ' 的 VEL=' + e.vx);
  } else if (comp === 'POS') {
    e.x = Math.round(90 + state.rng() * 520);
    pushLog(state, label + ':改 ' + e.name + ' 的 POS=' + e.x);
  } else {
    e.hp = Math.max(0, e.hp - (3 + Math.floor(state.rng() * 10)));
    pushLog(state, label + ':改 ' + e.name + ' 的 HP=' + e.hp);
  }
  touch(state, e, comp);
}

function pushLog(state, s) {
  state.log.push(s);
  if (state.log.length > 3) state.log.shift();
}

// ---------- 绘制 ----------

function drawHud(state, ctx) {
  var cur = state.cursor < state.order.length ? state.byKey[state.order[state.cursor]].def.name : '帧末派发事件';
  ctx.fillStyle = 'rgba(11,15,23,0.9)';
  ctx.fillRect(8, 6, 704, 24);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('帧 ' + state.frame + '  当前步:' + cur + '  实跑 ' + state.stats.ran + ' / 跳过 ' + state.stats.skipped +
    '  pending ' + state.pending.length + '  摇杆 ' + state.joy + (state.auto ? '  [自动]' : '  [手动]'), 16, 22);
}

function nodeBox(key) {
  var p = NODE_POS[key];
  return { x: p[0], y: p[1], w: NODE_W, h: NODE_H };
}

function drawEdge(ctx, a, b, ghost) {
  var ba = nodeBox(a), bb = nodeBox(b);
  var x1 = ba.x + ba.w, y1 = ba.y + ba.h / 2, x2 = bb.x, y2 = bb.y + bb.h / 2;
  if (bb.y > ba.y) { x2 = bb.x + bb.w / 2; y2 = bb.y; }
  ctx.strokeStyle = ghost ? '#f87171' : '#5b8fd6';
  ctx.lineWidth = ghost ? 1.5 : 2;
  if (ghost) ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
  var ang = Math.atan2(y2 - y1, x2 - x1);
  ctx.fillStyle = ghost ? '#f87171' : '#5b8fd6';
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - 8 * Math.cos(ang - 0.4), y2 - 8 * Math.sin(ang - 0.4));
  ctx.lineTo(x2 - 8 * Math.cos(ang + 0.4), y2 - 8 * Math.sin(ang + 0.4));
  ctx.closePath();
  ctx.fill();
}

function drawDag(state, ctx) {
  var i, key;
  for (i = 0; i < EDGES.length; i++) drawEdge(ctx, EDGES[i][0], EDGES[i][1], false);
  for (i = 0; i < GHOST_EDGES.length; i++) drawEdge(ctx, GHOST_EDGES[i][0], GHOST_EDGES[i][1], true);
  for (i = 0; i < state.order.length; i++) {
    key = state.order[i];
    var sys = state.byKey[key];
    var b = nodeBox(key);
    var isCur = state.cursor < state.order.length && state.order[state.cursor] === key;
    var fill = '#16202f', border = '#5b8fd6', tc = '#9db4d0';
    if (sys.status === 'ran') { fill = '#14301f'; border = '#6ee7b7'; tc = '#a7f3d0'; }
    if (sys.status === 'skip') { fill = '#141a24'; border = '#3b4d6b'; tc = '#5b7397'; }
    if (isCur) { fill = '#3d2f10'; border = '#ffd479'; tc = '#ffd479'; }
    ctx.fillStyle = fill;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = border;
    ctx.lineWidth = isCur ? 3 : 1.5;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = tc;
    ctx.font = '12px monospace';
    ctx.fillText(sys.def.name, b.x + 10, b.y + 20);
    ctx.font = '9px monospace';
    ctx.fillText(sys.def.tag, b.x + 10, b.y + 38);
    if (sys.status === 'skip') {
      ctx.fillStyle = '#f87171';
      ctx.font = '10px monospace';
      ctx.fillText('SKIP', b.x + b.w - 38, b.y + 20);
    }
  }
  ctx.fillStyle = '#f87171';
  ctx.font = '10px monospace';
  ctx.fillText('红虚线=事件依赖(调度器看不见,靠帧末派发保序)', 46, 208);
}

function drawOrder(state, ctx) {
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText('执行顺序(拓扑序)', 556, 40);
  for (var i = 0; i < state.order.length; i++) {
    var key = state.order[i];
    var sys = state.byKey[key];
    var isCur = state.cursor < state.order.length && state.order[state.cursor] === key;
    ctx.fillStyle = isCur ? '#ffd479' : (sys.status === 'ran' ? '#6ee7b7' : '#5b7397');
    ctx.font = '12px monospace';
    var mark = sys.status === 'ran' ? '√' : (sys.status === 'skip' ? '-' : ' ');
    ctx.fillText((i + 1) + '. ' + sys.def.name + ' ' + mark, 556, 64 + i * 24);
  }
  var last = state.cursor >= state.order.length;
  ctx.fillStyle = last ? '#ffd479' : '#5b7397';
  ctx.fillText('7. 帧末派发事件' + (last ? ' ←空格执行' : ''), 556, 64 + state.order.length * 24);
}

function drawBoard(state, ctx) {
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText('脏标记账本(执行前检查:读集当前版本 / 上次见过)', 20, 238);
  for (var i = 0; i < state.systems.length; i++) {
    var sys = state.systems[i];
    var y = 260 + i * 26;
    var reads = [];
    for (var r = 0; r < sys.def.reads.length; r++) {
      var c = sys.def.reads[r];
      reads.push(c + ' ' + maxVer(state, c) + '/' + sys.seen[c]);
    }
    var readStr = sys.def.reads.length ? reads.join(' ') : '(无输入)';
    var dirty = isDirty(state, sys);
    var st = sys.status === 'ran' ? '已跑√' : (sys.status === 'skip' ? '跳过' : (dirty ? '脏·待跑' : '净·待跑'));
    var color = sys.status === 'ran' ? '#6ee7b7' : (sys.status === 'skip' ? '#5b7397' : (dirty ? '#f87171' : '#5b7397'));
    ctx.fillStyle = '#9db4d0';
    ctx.font = '12px monospace';
    ctx.fillText(pad(sys.def.name, 10) + readStr, 20, y);
    ctx.fillStyle = color;
    ctx.fillText(st, 380, y);
    if (sys.def.key === 'collide') {
      ctx.fillStyle = '#f59e0b';
      ctx.fillText('只发事件,不写组件', 470, y);
    }
    if (sys.def.key === 'hurt') {
      ctx.fillStyle = '#f59e0b';
      ctx.fillText('HP 由帧末派发写', 470, y);
    }
  }
}

function drawWorldStrip(state, ctx) {
  ctx.fillStyle = 'rgba(28,39,57,0.5)';
  ctx.fillRect(16, 428, 688, 64);
  ctx.strokeStyle = '#3b4d6b';
  ctx.strokeRect(16, 428, 688, 64);
  ctx.strokeStyle = '#f59e0b';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(WALL_X, 432);
  ctx.lineTo(WALL_X, 488);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#f59e0b';
  ctx.font = '10px monospace';
  ctx.fillText('墙/触发区', 46, 444);
  for (var i = 0; i < state.entities.length; i++) {
    var e = state.entities[i];
    var dead = e.hp <= 0;
    ctx.fillStyle = dead ? '#2c3646' : (e.aniT > 0 ? '#ffffff' : '#5b8fd6');
    ctx.fillRect(e.x - 6, 452, 12, 12);
    if (e.aniT > 0 && !dead) {
      ctx.strokeStyle = '#f87171';
      ctx.lineWidth = 2;
      ctx.strokeRect(e.x - 9, 449, 18, 18);
      ctx.lineWidth = 1;
    }
    if (dead) {
      ctx.strokeStyle = '#f87171';
      ctx.beginPath();
      ctx.moveTo(e.x - 5, 453);
      ctx.lineTo(e.x + 5, 463);
      ctx.moveTo(e.x + 5, 453);
      ctx.lineTo(e.x - 5, 463);
      ctx.stroke();
    }
    ctx.fillStyle = '#6ee7b7';
    ctx.fillRect(e.x - 10, 470, Math.max(0, e.hp) * 0.24, 3);
  }
  ctx.fillStyle = '#5b7397';
  ctx.font = '10px monospace';
  ctx.fillText('世界条带:白闪=受击反应写了ANI,绿条=HP', 180, 444);
}

function drawEventTrack(state, ctx) {
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText('deferred 事件队列(帧中入队 → 帧末统一派发)', 20, 516);
  for (var i = 0; i < state.pending.length; i++) {
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(20 + i * 20, 526, 14, 14);
  }
  if (state.dispatchFlash > 0) {
    ctx.fillStyle = '#14301f';
    ctx.fillRect(16, 522, 688, 22);
    ctx.strokeStyle = '#6ee7b7';
    ctx.strokeRect(16, 522, 688, 22);
    ctx.fillStyle = '#6ee7b7';
    ctx.fillText('帧末派发!事件一次结算,版本号落账', 200, 537);
  } else if (state.pending.length > 0) {
    ctx.fillStyle = '#f59e0b';
    ctx.fillText('帧中已入队 ' + state.pending.length + ' 个,等待帧末(遍历中绝不直接改)', 300, 537);
  } else {
    ctx.fillStyle = '#5b7397';
    ctx.fillText('队列空', 20, 537);
  }
}

function drawFooter(state, ctx) {
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText('空格=单步(最后一步是帧末派发)  回车=自动连跑  M=随机改一个组件  R=重置', 20, 572);
  for (var i = 0; i < state.log.length; i++) {
    ctx.fillStyle = i === state.log.length - 1 ? '#ffd479' : '#5b7397';
    ctx.fillText(state.log[i], 20, 590 + i * 14);
  }
}

function pad(s, n) {
  var out = s;
  while (out.length < n) out += ' ';
  return out;
}`
  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>看调度纠正声明顺序：</b>代码里 SYSTEM_DEFS 的声明顺序是 渲染→碰撞→输入→动画→移动→受击（故意打乱），右侧执行序却是 输入→移动→碰撞→受击→动画→渲染——顺序由读写集推出，跟写代码的顺序无关。</li>
  <li><b>看脏标记省钱：</b>回车自动连跑，等摇杆归零（vx=0）的那两三秒：账本一片「跳过」，实跑数几乎归零——没变化就一分钱不花，这就是 change detection 的意义。</li>
  <li><b>看隐藏依赖的代价：</b>有事件入队的那一帧之后，「受击反应」要等下一帧才点亮：它读的 HP 由帧末派发写入，而派发发生在所有 system 之后。事件边是调度器看不见的边——它买到的安全，用的正是「下游慢一帧」这枚硬币。</li>
  <li><b>亲手造增量帧：</b>按 M 随机改一个组件，观察只有读到它的 system 点亮（其余整帧 SKIP），HUD 的实跑/跳过比就是这一帧的「增量程度」。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：RID 世界——无 Node 的命令式数据导向',
    files: [
      { path: 'core/templates/rid.h', note: 'RID 是引擎句柄的极致形态：只有内部 ID+所属 Owner 指针，不背任何对象方法——数据导向世界的通行证。本课的「system 无状态、只碰数据」在 RID 世界里是常态。建议搜索：class RID、get_data、operator<。' },
      { path: 'core/templates/rid_owner.h', note: 'RID_Owner 家族管理「句柄→真实数据」的分配与回收（分页存储），对应本课的命令缓冲思想：帧中记录操作、由 owner 端统一落地。建议搜索：RID_PtrOwner、allocate、remove。' },
      { path: 'servers/rendering/rendering_server.h', note: 'RenderingServer 的 API 全是「canvas_item_create() 返回 RID + 一串 set 参数」的命令式调用，没有 Node 参与——「帧中记录、后端统一消费」的工业级命令缓冲。建议搜索：canvas_item_create、free。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>调度、脏标记、deferred 事件——三件工具把 C2 的「能跑」升级成「跑得对、跑得省」：读写集推出执行序，版本号把全量帧压成增量帧，帧末派发让遍历永远安全。</p>
<ul>
  <li><b>数据怎么流动？</b>读写集 → 依赖 DAG → 拓扑执行序；每次写组件 bump 版本号；下游 system 执行前查版本决定跑/跳；事件帧中入队、帧末一次结算、下帧被读到。</li>
  <li><b>所有权归谁？</b>System 本体无状态（ seen 版本表除外），可随意重入与并行调度；版本表、事件队列、实体数据全归 world 所有；事件结算后即焚，不留在队列里过夜。</li>
  <li><b>什么时候发生？</b>调度在帧内沿拓扑序逐个进行；脏检查发生在每个 system 启动前的那一瞬间，成本 O(读集大小)；派发固定在帧边界——遍历中绝不改结构，这是整栋房子的地基。</li>
</ul>`
  }
  ]
};
