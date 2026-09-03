// L8.2 · 网络同步：状态同步、帧同步与回滚
export default {
  id: 'L8.2',
  title: '网络同步：状态同步、帧同步与回滚',
  est: '2.5 小时',
  coreQuestions: [
    '一帧里哪些字节真的上了线？快照、增量、输入指令各传什么？（数据怎么流动）',
    '角色的位置到底谁说了算——本地客户端还是服务器？所有权错位要付出什么代价？（所有权归谁）',
    '延迟、抖动、丢包各自在什么时候咬你一口？插值、外推、锁定帧、回滚分别治哪一种病？（什么时候发生）'
  ],
  sections: [
    {
      type: 'text',
      title: '真相在哪里：三种同步策略的取舍',
      html: `<p>先把问题说穿：<b>网络不会变快，物理定律也不允许它变快</b>。光速限制下，跨大洋往返就是两三百毫秒，任何引擎都改不掉这个下限。所以网络同步的全部工作不是消灭延迟，而是<b>决定让延迟在哪里显形</b>——这是本课的主线。</p>
<p>一个多人游戏必须回答三个问题，答案的不同组合就是三种流派：</p>
<ul>
  <li><b>真相存在哪？</b>权威在服务器，还是在每个客户端自己的模拟里？</li>
  <li><b>线上跑什么？</b>是「结果」（位置和血量），还是「原因」（按键和指令）？</li>
  <li><b>时间怎么对齐？</b>各端各走各的时钟靠快照缝合，还是锁到同一个帧号上齐步走？</li>
</ul>
<table>
  <tr><th></th><th>状态同步</th><th>帧同步（锁定帧）</th><th>预测 + 回滚</th></tr>
  <tr><td>权威在哪</td><td>服务器持有世界真相</td><td>没有中心服务器，每端各自模拟同一份输入流</td><td>服务器仍是真相，但客户端被授权提前猜</td></tr>
  <tr><td>线上传什么</td><td>实体属性快照 / 增量（字节多）</td><td>只传输入指令（字节极少）</td><td>输入上行 + 权威结果下行</td></tr>
  <tr><td>延迟显形成什么</td><td>别人是残影，自己是橡皮筋</td><td>全局慢动作、卡帧停摆</td><td>平时无感，猜错时瞬间纠正</td></tr>
  <tr><td>对数值的要求</td><td>宽松（浮点随便用）</td><td>苛刻：全整数确定性定点数，跨平台逐位一致</td><td>苛刻：本地模拟必须可重放</td></tr>
  <tr><td>反外挂</td><td>强（服务器裁决一切）</td><td>弱（需额外的校验节点观战）</td><td>强（服务器裁决）</td></tr>
  <tr><td>典型场景</td><td>MMO、FPS、开放世界</td><td>MOBA、RTS、格斗联机</td><td>格斗、赛车等强操作游戏</td></tr>
</table>
<p>注意这张表里没有一行写着「零延迟」。<b>三种模式只是把延迟搬到不同的地方</b>：状态同步把它搬进「别人的位置」，帧同步把它搬进「整个世界的节拍」，回滚把它搬进「偶尔一闪的纠正」。下面的实验室里，你要亲手做三次搬运工。</p>`,
    },
    {
      type: 'text',
      title: '延迟预算表：插值、外推、预测、回滚各治哪种病',
      html: `<p>网络有三类病症，症状完全不同，药也不同。先建立一张诊断表：</p>
<table>
  <tr><th>病因</th><th>你看到的现象</th><th>标准药方</th></tr>
  <tr><td><b>延迟（latency）</b></td><td>画面里的对手永远停在过去的某个位置；你打他，要等一个 RTT 才有反馈</td><td>渲染层<b>插值</b>（往回看一拍）+ 本地<b>预测</b>（往前猜一步）</td></tr>
  <tr><td><b>抖动（jitter）</b></td><td>包有时早到有时晚到，动画一顿一顿、忽快忽慢</td><td><b>缓冲队列</b>：宁可固定多等几十毫秒，也不按到达时刻直接播</td></tr>
  <tr><td><b>丢包（loss）</b></td><td>状态缺一段（瞬移），或输入缺一帧（全体卡住）</td><td>可靠通道重传、关键帧兜底、输入冗余打包</td></tr>
</table>
<p>四个核心手法，本质都是<b>拿时间换空间</b>的交易：</p>
<ul>
  <li><b>插值（interpolation）</b>：渲染时刻刻意比最新快照旧一拍，在两帧快照之间平滑过渡。代价是「你看到的敌人永远是过去的敌人」——这正是所有 FPS 的命中判定必须回到服务器去算的根本原因。</li>
  <li><b>外推（extrapolation）</b>：新快照还没到，就拿上一帧的速度继续往前猜。猜对了顺滑，猜错了硬拉——拉扯感的直接来源。</li>
  <li><b>客户端预测（prediction）</b>：本地不等确认，按下键立刻动；同时把这段本地模拟存进<b>回放缓冲区</b>，等待服务器裁决。</li>
  <li><b>回滚重放（reconciliation + replay）</b>：权威结果落地后，若与自己猜的不一致，就把角色瞬移回权威状态，再<b>把缓冲区里尚未被确认的输入重新模拟一遍</b>。因为重放的步数很少（通常几帧），视觉上几乎看不出来。</li>
</ul>
<p>还有一味常被忽略的药：<b>延迟补偿（lag compensation / entity lag）</b>——服务器裁决时回放到「攻击者当时看到的世界」，或者干脆给本地角色也叠一层与网络等量的延迟，让「我打中你」和「你打中我」在同一时间基准上结算，双方手感对称。听起来反直觉，却是服务器权威射击游戏的标配。</p>
<p>帧同步那边是另一套哲学：<b>不掩盖延迟，而是让所有人一起等</b>。锁定帧（frame lock）规定第 N 帧必须收齐所有人第 N 帧的输入才准推进，于是延迟表现为全局慢动作；乐观帧（optimistic frame）允许最多落后 K 帧先跑、靠冗余输入对冲丢包，落后太多才补等。Gaffer on Games 那篇 Deterministic Lockstep 讲的就是这条权衡线。</p>`,
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'netsim',
      title: '实验：本地延迟模拟竞技场（状态同步 / 帧同步 / 回滚）',
      height: 620,
      code: `
// 本地延迟模拟竞技场：所有「网络」都在这一台机器上模拟，不碰真网络。
// 上屏 = 玩家 A 眼中的世界（你，按住 A / D 左右移动）；下屏 = 玩家 B 眼中的世界（脚本 AI 自动巡逻）。
// 中间两条横线是网线：小方块 = 一个数据包，按延迟从左往右流动；变红坠落 = 这个包被丢了。
// 灰白小人 = 权威真相；彩色小人 = 屏幕上看到的它。两者拉开的距离，就是拉扯本身。
// 快捷键：1 / 2 / 3 切模式 · 方括号调延迟 · 分号与引号键调抖动 · 逗号句号调丢包 · R 重置

var STEP = 1 / 60;        // 每个端的固定模拟步长（L1.1 那套累积器）
var TICK_MS = 100;        // 服务器广播快照的周期
var SPEED = 240;          // 移动速度（像素每秒）
var INTERP_AGE = 120;     // 渲染刻意往回看的时间（毫秒）：抖动的解药
var SMOOTH = 8;           // 橡皮筋系数：显示位置向目标靠拢有多急
var STALL_MAX = 260;      // 锁定帧最多空等这么久，之后拿上一帧输入顶上
var BATCH = 3;            // 攒几个输入帧打成一个包（批量发送）
var INPUT_DELAY = 2;      // 锁定帧的输入延迟：执行第 N 帧只需对方第 N-2 帧的输入
var MIN_X = 24, MAX_X = 696;
var LANES = [148, 186];   // 上行 / 下行两条车道

function mulberry32(seed) {   // 自带种子的随机数：每次运行都能复现
  var a = seed | 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

engine.run({
  setup: function (state) { init(state); },
  update: function (state, dt, input) { stepAll(state, dt, input); },
  draw: function (state, ctx) { paint(state, ctx); }
});

// ---------------- 初始化 ----------------
function init(state) {
  state.rng = mulberry32(20260903);
  state.time = 0;
  state.mode = 'state';           // state | lockstep | rollback
  state.latency = 150;
  state.jitter = 60;
  state.loss = 0.1;
  state.wire = [];               // 网线上正在飞的包
  state.debris = [];             // 丢掉后坠落的红方块
  state.sent = 0; state.bytes = 0; state.dropped = 0;
  state.rollbacks = 0; state.stalls = 0; state.pads = 0;
  state.pps = 0; state.kbps = 0; state.meterT = 0; state.markSent = 0; state.markBytes = 0;
  state.tickAcc = 0; state.tick = 0;
  state.auth = { a: 120, b: 600, av: 0, bv: 0, doneA: 0, doneB: 0 };   // 服务器权威世界
  state.A = makeView('a');
  state.B = makeView('b');
  state.msg = '模式一：服务器权威状态同步，两端都没有预测'; state.msgT = 5;
  state.keyL = false; state.keyR = false;
}

function makeView(slot) {
  var x = slot === 'a' ? 120 : 600;
  return {
    slot: slot, pred: x, dispOwn: x, dispRemote: x, ghostOwn: x, ghostRemote: x,
    intent: 0, aiDir: slot === 'a' ? 1 : -1, acc: 0, batch: [], sentN: 0, hist: [],
    cur: null, prev: null, curAt: 0, prevAt: 0, flash: 0,
    lsFrame: 0, inbox: {}, lastPeerMv: 0, stallUntil: 0, stalled: false,
    world: { a: 120, b: 600 }   // 帧同步模式下本端持有的那份确定性世界
  };
}

function other(s) { return s === 'a' ? 'b' : 'a'; }
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function say(state, s) { state.msg = s; state.msgT = 4; }

// ---------------- 主循环 ----------------
function stepAll(state, dt, input) {
  if (dt > 0.1) dt = 0.1;
  state.time += dt * 1000;
  controls(state, input);
  if (input.pressed('KeyR')) { init(state); return; }
  intents(state);
  if (state.mode === 'lockstep') {
    simLockstep(state, state.A, dt);
    simLockstep(state, state.B, dt);
  } else {
    simNetcode(state, state.A, dt);
    simNetcode(state, state.B, dt);
    serverTick(state, dt);
  }
  flow(state, dt);
  render(state, state.A, dt);
  render(state, state.B, dt);
  meter(state, dt);
}

// ---------------- 控制面板 ----------------
function controls(state, input) {
  state.keyL = input.down('KeyA');
  state.keyR = input.down('KeyD');
  if (input.pressed('Digit1')) setMode(state, 'state');
  if (input.pressed('Digit2')) setMode(state, 'lockstep');
  if (input.pressed('Digit3')) setMode(state, 'rollback');
  if (input.pressed('BracketLeft')) { state.latency = clamp(state.latency - 25, 0, 500); say(state, '单程延迟 = ' + state.latency + ' ms'); }
  if (input.pressed('BracketRight')) { state.latency = clamp(state.latency + 25, 0, 500); say(state, '单程延迟 = ' + state.latency + ' ms'); }
  if (input.pressed('Semicolon')) { state.jitter = clamp(state.jitter - 20, 0, 200); say(state, '抖动 = ±' + state.jitter + ' ms'); }
  if (input.pressed('Quote')) { state.jitter = clamp(state.jitter + 20, 0, 200); say(state, '抖动 = ±' + state.jitter + ' ms'); }
  if (input.pressed('Comma')) { state.loss = clamp(state.loss - 0.05, 0, 0.3); say(state, '丢包率 = ' + Math.round(state.loss * 100) + '%'); }
  if (input.pressed('Period')) { state.loss = clamp(state.loss + 0.05, 0, 0.3); say(state, '丢包率 = ' + Math.round(state.loss * 100) + '%'); }
}

function setMode(state, m) {
  state.mode = m;
  state.wire = []; state.debris = [];
  resetView(state.A); resetView(state.B);
  var names = { state: '① 状态同步：服务器权威 + 客户端插值（无预测）', lockstep: '② 帧同步：只传输入 + 锁定帧', rollback: '③ 客户端预测 + 服务器回滚重放' };
  say(state, '模式 → ' + names[m]);
}

function resetView(v) {
  v.cur = null; v.prev = null; v.hist = []; v.inbox = {}; v.lsFrame = 0;
  v.batch = []; v.sentN = 0; v.stalled = false; v.stallUntil = 0; v.acc = 0;
}

// ---------------- 意图：A 读键盘，B 是脚本 AI ----------------
function intents(state) {
  var mv = 0;
  if (state.keyL) mv -= 1;
  if (state.keyR) mv += 1;
  state.A.intent = mv;
  var bx = truthPos(state, 'b');
  if (bx < 110) state.B.aiDir = 1;
  if (bx > 610) state.B.aiDir = -1;
  state.B.intent = state.B.aiDir;
}

function truthPos(state, slot) { return state.mode === 'lockstep' ? state.A.world[slot] : state.auth[slot]; }

// ---------------- 联网模拟：客户端预测 + 批量上报输入 ----------------
function simNetcode(state, v, dt) {
  v.acc += dt;
  while (v.acc >= STEP) {
    v.acc -= STEP;
    v.pred = clamp(v.pred + v.intent * SPEED * STEP, MIN_X, MAX_X);   // 本地立刻就走
    v.sentN++;
    v.batch.push(v.intent);
    v.hist.push({ n: v.sentN, mv: v.intent });
    while (v.hist.length > 90) v.hist.shift();
    if (v.batch.length >= BATCH) {
      sendPacket(state, 0, { kind: "cmd", slot: v.slot, base: v.sentN - v.batch.length + 1, mvs: v.batch.slice() }, 8 + 2 * v.batch.length);
      v.batch = [];
    }
  }
}

// ---------------- 服务器：攒够 tick 就广播快照 ----------------
function serverTick(state, dt) {
  state.tickAcc += dt * 1000;
  while (state.tickAcc >= TICK_MS) {
    state.tickAcc -= TICK_MS;
    state.tick++;
    var a = state.auth;
    sendPacket(state, 1, { kind: "snap", to: "a", tick: state.tick, a: a.a, b: a.b, av: a.av, bv: a.bv, doneA: a.doneA, doneB: a.doneB }, 34);
    sendPacket(state, 1, { kind: "snap", to: "b", tick: state.tick, a: a.a, b: a.b, av: a.av, bv: a.bv, doneA: a.doneA, doneB: a.doneB }, 34);
  }
}

function serverRecv(state, q) {
  var a = state.auth;
  var done = q.slot === 'a' ? a.doneA : a.doneB;
  var i;
  if (q.base + q.mvs.length - 1 <= done) return;   // 重复批次：丢掉的冗余直接扔
  for (i = 0; i < q.mvs.length; i++) {
    var n = q.base + i;
    if (n <= done) continue;
    done = n;
    if (q.slot === 'a') { a.a = clamp(a.a + q.mvs[i] * SPEED * STEP, MIN_X, MAX_X); a.av = q.mvs[i] * SPEED; }
    else { a.b = clamp(a.b + q.mvs[i] * SPEED * STEP, MIN_X, MAX_X); a.bv = q.mvs[i] * SPEED; }
  }
  if (q.slot === 'a') a.doneA = done; else a.doneB = done;
}

// ---------------- 帧同步：锁定帧 ----------------
function simLockstep(state, v, dt) {
  v.acc += dt;
  if (v.acc > 0.5) v.acc = 0.5;                   // 防螺旋死亡：等太久也别把债越欠越多
  var guard = 0;
  while (v.acc >= STEP && guard++ < 8) {
    var need = v.lsFrame + 1;
    var want = need - INPUT_DELAY;              // 只要对方晚两帧的输入，给网络留出余量
    var got = v.inbox[want];
    if (want > 0 && got === undefined) {
      if (v.stallUntil <= 0) { v.stallUntil = state.time + STALL_MAX; state.stalls++; }
      if (state.time < v.stallUntil) { v.stalled = true; return; }   // 全体停摆：谁都不许推进
      got = v.lastPeerMv; state.pads++;                              // 等崩了：拿上一帧输入顶上（这就是 desync 的种子）
    }
    if (got === undefined) got = 0;
    v.acc -= STEP;
    v.stallUntil = 0; v.stalled = false;
    v.lsFrame = need; v.lastPeerMv = got;
    var mine = v.slot, theirs = other(v.slot);
    v.world[mine] = clamp(v.world[mine] + v.intent * SPEED * STEP, MIN_X, MAX_X);
    v.world[theirs] = clamp(v.world[theirs] + got * SPEED * STEP, MIN_X, MAX_X);
    sendPacket(state, 0, { kind: "ls", to: theirs, f: need, mv: v.intent }, 8);
  }
}

// ---------------- 网线：发包、飞行、投递、丢包 ----------------
function sendPacket(state, lane, payload, bytes) {
  var j = (state.rng() * 2 - 1) * state.jitter;
  var due = state.time + Math.max(0, state.latency + j);
  state.wire.push({ born: state.time, due: due, lane: lane, payload: payload, tint: lane === 0 ? '#4d8fd6' : '#c084fc' });
  state.sent++; state.bytes += bytes;
}

function flow(state, dt) {
  var i;
  for (i = state.wire.length - 1; i >= 0; i--) {
    var p = state.wire[i];
    if (state.time >= p.due) { deliver(state, p); state.wire.splice(i, 1); }
  }
  for (i = state.debris.length - 1; i >= 0; i--) {
    var d = state.debris[i];
    d.vy += 900 * dt; d.y += d.vy * dt; d.life -= dt;
    if (d.life <= 0) state.debris.splice(i, 1);
  }
}

function deliver(state, p) {
  if (state.rng() < state.loss) {
    state.dropped++;
    var span = Math.max(1, p.due - p.born);
    var k = clamp((state.time - p.born) / span, 0, 1);
    state.debris.push({ x: 12 + (engine.W - 24) * k, y: LANES[p.lane], vy: 0, life: 0.9 });
    return;
  }
  var q = p.payload;
  if (q.kind === 'cmd') serverRecv(state, q);
  else if (q.kind === 'snap') recvSnap(state, q);
  else if (q.kind === 'ls') { var v = q.to === 'a' ? state.A : state.B; v.inbox[q.f] = q.mv; }
}

function recvSnap(state, q) {
  var v = q.to === 'a' ? state.A : state.B;
  if (q.tick <= (v.cur ? v.cur.tick : 0)) return;   // 拒绝旧状态：Godot 的 update_inbound_sync_time 同款
  v.prev = v.cur; v.prevAt = v.curAt;
  v.cur = q; v.curAt = state.time;
  if (state.mode === 'rollback') reconcile(state, v, q);
}

// 回滚：权威结果落地 → 瞬移回服务器说的位置 → 把未确认的输入重放一遍 → 还跟眼前对不上才算一次真正的纠正
function reconcile(state, v, q) {
  var ack = v.slot === 'a' ? q.doneA : q.doneB;
  var auth = v.slot === 'a' ? q.a : q.b;
  while (v.hist.length && v.hist[0].n <= ack) v.hist.shift();   // 已被确认的输入不必重放
  var fixed = auth;                                             // 回到权威时间点
  var i;
  for (i = 0; i < v.hist.length; i++) fixed = clamp(fixed + v.hist[i].mv * SPEED * STEP, MIN_X, MAX_X);   // 重放到现在
  if (Math.abs(fixed - v.pred) < 4) { v.pred = fixed; return; } // 猜对了：静默吸收，肉眼看不出来
  v.pred = fixed;                                                 // 猜错了：这一跳就是玩家看到的纠正
  v.flash = 0.35; state.rollbacks++;
}

// ---------------- 表现层 ----------------
function render(state, v, dt) {
  if (state.mode === 'lockstep') {
    v.dispOwn = v.world[v.slot];
    v.dispRemote = v.world[other(v.slot)];
    v.ghostOwn = state.A.world[v.slot];        // 对照另一端的本地副本：本该逐位相同
    v.ghostRemote = state.A.world[other(v.slot)];
  } else {
    var ownT = state.mode === 'state' ? snapVal(v, v.slot) : v.pred;   // 模式一无预测：自己也等服务器
    v.dispOwn = approach(v.dispOwn, ownT, dt);
    v.dispRemote = approach(v.dispRemote, remoteInterp(state, v), dt);
    v.ghostOwn = state.auth[v.slot];
    v.ghostRemote = state.auth[other(v.slot)];
  }
  if (v.flash > 0) v.flash -= dt;
}

function snapVal(v, slot) { return v.cur ? v.cur[slot] : v.pred; }

function approach(cur, tgt, dt) {
  if (Math.abs(cur - tgt) < 0.4) return tgt;
  return cur + (tgt - cur) * Math.min(1, SMOOTH * dt);
}

// 往回看 INTERP_AGE 毫秒，在两张快照之间线性插值；快照太旧就外推兜底
function remoteInterp(state, v) {
  if (!v.cur) return state.auth[other(v.slot)];
  var os = other(v.slot);
  var curV = v.cur[os], prevV = v.prev ? v.prev[os] : curV;
  var t = state.time - INTERP_AGE;
  var span = Math.max(1, v.curAt - v.prevAt);
  var k = clamp((t - v.prevAt) / span, 0, 1);
  var val = prevV + (curV - prevV) * k;
  if (t > v.curAt) val += v.cur[os + 'v'] * (t - v.curAt) / 1000;
  return val;
}

// ---------------- 绘制 ----------------
function paint(state, ctx) {
  ctx.fillStyle = '#0b0f17';
  ctx.fillRect(0, 0, engine.W, engine.H);
  drawView(state, ctx, state.A, 112);
  drawWire(state, ctx);
  drawView(state, ctx, state.B, 296);
  drawPanel(state, ctx);
}

function drawView(state, ctx, v, floorY) {
  var i;
  ctx.strokeStyle = '#16233a'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, floorY + 1); ctx.lineTo(engine.W, floorY + 1); ctx.stroke();

  ctx.font = '12px monospace'; ctx.fillStyle = '#7d93b3';
  ctx.fillText(v.slot === 'a' ? '玩家 A 的屏幕（你：按住 A / D 移动）' : '玩家 B 的屏幕（脚本 AI 自动巡逻）', 12, floorY - 74);

  // 模式专属状态行
  if (state.mode === 'lockstep') {
    ctx.fillStyle = v.stalled ? '#f87171' : '#5c7292';
    ctx.fillText(v.stalled ? '等待对方第 ' + (v.lsFrame + 1) + ' 帧输入…全场停摆' : '锁定帧推进中 · 本端帧号 ' + v.lsFrame, 12, floorY - 56);
  } else if (state.mode === 'rollback') {
    ctx.fillStyle = '#5c7292';
    ctx.fillText('回放缓冲区（尚未被服务器确认的输入）: ' + v.hist.length + ' 帧', 12, floorY - 56);
    for (i = 0; i < v.hist.length && i < 60; i++) {
      ctx.fillStyle = 'rgba(109,231,183,' + (0.15 + i * 0.012).toFixed(2) + ')';
      ctx.fillRect(12 + i * 5, floorY - 48, 3, 8);
    }
  } else {
    ctx.fillStyle = '#5c7292';
    ctx.fillText('无预测：连你自己的位置也要等服务器裁决 → 自己也是残影', 12, floorY - 56);
  }

  // 权威真相（灰白幽灵）
  drawGuy(ctx, v.ghostOwn, floorY, 'rgba(150,165,185,0.4)', false);
  drawGuy(ctx, v.ghostRemote, floorY, 'rgba(150,165,185,0.4)', false);
  // 屏幕上看到的（彩色）
  drawGuy(ctx, v.dispOwn, floorY, '#5aa9e6', v.flash > 0 && v.slot === 'a');
  drawGuy(ctx, v.dispRemote, floorY, '#f59e0b', v.flash > 0 && v.slot === 'b');

  // 拉扯指示线：看到的 vs 真相
  pull(ctx, v.ghostOwn, v.dispOwn, floorY);
  pull(ctx, v.ghostRemote, v.dispRemote, floorY);

  ctx.font = '11px monospace'; ctx.fillStyle = '#40587a';
  ctx.fillText('蓝 = A    橙 = B    灰白 = 权威真相', 520, floorY - 74);
}

function pull(ctx, gx, dx, floorY) {
  if (Math.abs(gx - dx) < 7) return;
  ctx.strokeStyle = 'rgba(248,113,113,0.6)';
  ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(gx, floorY - 14); ctx.lineTo(dx, floorY - 14); ctx.stroke();
  ctx.setLineDash([]);
}

function drawGuy(ctx, x, y, color, flashing) {
  ctx.fillStyle = flashing ? '#f87171' : color;
  ctx.fillRect(x - 7, y - 26, 14, 26);
  ctx.beginPath();
  ctx.arc(x, y - 32, 6, 0, Math.PI * 2);
  ctx.fill();
}

function drawWire(state, ctx) {
  var i;
  ctx.strokeStyle = '#1e2a3d'; ctx.lineWidth = 1;
  for (i = 0; i < 2; i++) {
    ctx.beginPath(); ctx.moveTo(0, LANES[i]); ctx.lineTo(engine.W, LANES[i]); ctx.stroke();
  }
  ctx.font = '11px monospace'; ctx.fillStyle = '#5c7292';
  ctx.fillText('网线 · 上行（客户端 → 服务器 / 对端）', 12, LANES[0] - 7);
  ctx.fillText('网线 · 下行（服务器 → 客户端）', 12, LANES[1] + 18);
  for (i = 0; i < state.wire.length; i++) {
    var p = state.wire[i];
    var span = Math.max(1, p.due - p.born);
    var k = clamp((state.time - p.born) / span, 0, 1);
    ctx.fillStyle = p.tint;
    ctx.fillRect(12 + (engine.W - 24) * k - 5, LANES[p.lane] - 5, 10, 10);
  }
  for (i = 0; i < state.debris.length; i++) {
    var d = state.debris[i];
    ctx.globalAlpha = clamp(d.life / 0.9, 0, 1);
    ctx.fillStyle = '#f87171';
    ctx.fillRect(d.x - 5, d.y - 5, 10, 10);
    ctx.globalAlpha = 1;
  }
}

function drawPanel(state, ctx) {
  ctx.strokeStyle = '#1e2a3d'; ctx.lineWidth = 1;
  ctx.strokeRect(12, 320, 696, 46);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#8fa7c7';
  var mn = state.mode === 'state' ? '① 状态同步' : (state.mode === 'lockstep' ? '② 帧同步（锁定帧）' : '③ 预测 + 回滚');
  ctx.fillText(mn + '    延迟 ' + state.latency + 'ms    抖动 ±' + state.jitter + 'ms    丢包 ' + Math.round(state.loss * 100) + '%', 22, 337);
  ctx.fillStyle = '#5b7397';
  ctx.fillText('包 ' + state.sent + ' 个 / 累计 ' + Math.round(state.bytes / 1024) + ' KB / 当前 ' + state.pps + ' 包每秒 ' + state.kbps + ' KB每秒    丢弃 ' + state.dropped + '    回滚 ' + state.rollbacks + ' 次    停摆 ' + state.stalls + ' 次    补帧 ' + state.pads, 22, 355);

  ctx.fillStyle = '#7d93b3';
  ctx.fillText('1 / 2 / 3 切模式 · 方括号 调延迟 · 分号与引号键 调抖动 · 逗号与句号 调丢包 · R 重置', 12, 382);
  ctx.fillStyle = state.msgT > 0 ? '#fbbf24' : '#5b7397';
  ctx.fillText(state.msg, 12, 402);
  ctx.fillStyle = '#40587a';
  ctx.fillText('对比着看：同一条网线，三种模式把延迟搬去了三个不同的地方。', 12, 424);
}

function meter(state, dt) {
  if (state.msgT > 0) state.msgT -= dt;
  state.meterT += dt;
  if (state.meterT >= 1) {
    state.pps = state.sent - state.markSent;
    state.kbps = Math.round((state.bytes - state.markBytes) / 1024);
    state.markSent = state.sent; state.markBytes = state.bytes; state.meterT = 0;
  }
}
`,
    },
    {
      type: 'text',
      title: '试一试',
      html: `<ul>
  <li>模式①把延迟拉到 400ms：你的小人变成橡皮筋（本地只能靠平滑去追已知的事实），对手的灰白真相与彩色身影之间拉开一条红色虚线——那就是「你看到的敌人是过去的敌人」。再降回 0 对比一下。</li>
  <li>模式①把抖动推到 ±160ms：盯着对手的移动速度，会看到忽快忽慢。工业实现为此维护一个<b>随抖动自适应增长的缓冲</b>，而不是包一到就画；这里的 INTERP_AGE 就是它的定值简化版。</li>
  <li>切到模式②，按住 D 不放：整场变成慢动作，屏幕上反复出现「等待对方第 N 帧输入…全场停摆」。延迟加到 300ms 只会更夸张——<b>帧同步不藏延迟，它把延迟变成所有人的共同成本</b>。</li>
  <li>模式②把丢包推到 30%：停摆次数和补帧次数一起飙升。真实做法是把最近 K 帧输入冗余打进同一个包；这里为了让你看清病灶，故意只做单帧输入。</li>
  <li>切到模式③，按住 D 冲一段然后突然松手：预测冲出去、权威结果追上来对不上，小人闪红并瞬移回去——那一闪就是回滚；面板上的回滚计数告诉你猜错了多少回。</li>
  <li>模式③ + 延迟 350ms + 丢包 25%，试着追上对手。你会亲身理解为什么格斗游戏宁可用回滚，也不肯让延迟出现在玩家的手指上。</li>
  <li>最后看一眼带宽数字：同样一场追逐，模式②的 KB/s 远低于模式①。这就是「传原因」相对「传结果」省下的钱——代价写在停摆计数里。</li>
</ul>`,
    },
    {
      type: 'source',
      title: '源码走读：Godot 的高级多人 API 站在光谱哪一格',
      files: [
        { path: 'modules/multiplayer/scene_multiplayer.cpp', note: '先看 _process_packet：包的第 0 字节低 3 位是命令码（CMD_MASK = 7），NETWORK_COMMAND_SPAWN / DESPAWN / SYNC / REMOTE_CALL 各转给对应接口；高位再塞标志（CMD_FLAG_0_SHIFT = 4）。再看 _process_meta：逐包读 get_packet_mode 与 get_packet_channel，鉴权包 SYS_COMMAND_AUTH 单独走 pending_peers 分支。「服务器权威」在代码里的形状就是这两处：一条命令分发总线 + 一份 peer 记账表。' },
        { path: 'modules/multiplayer/scene_replication_interface.cpp', note: '三处必看：(1) on_network_process() 对每个 peer 先 _send_sync 再 _send_delta——快照与增量两条流水线并行；(2) _send_delta 把多个 synchronizer 的变化属性拼进同一个 packet_cache，塞满 delta_mtu 就先 flush 一包（开头的 MAKE_ROOM 宏负责扩容），单个属性超 MTU 直接报错放弃；(3) on_sync_receive 里 is_delta 由 CMD_FLAG_0 那一位判定，且 sync->update_inbound_sync_time(time) 返回 false 就丢掉旧 tick——和本课 recvSnap 里那句 tick 比较完全同构。' },
        { path: 'modules/multiplayer/multiplayer_synchronizer.cpp', note: '脏检查的实现细节：_watch_changes 逐个 get_indexed 取值，与 watchers 里缓存的旧值 hash_compare，变了才刷新 last_change_usec；get_delta_state 只挑「变化时刻晚于上次发送」的属性，并把属性序号压进位掩码 r_indexes（1ULL << i），收端再用 get_delta_properties(indexes) 还原是哪几个属性上网。另有 replication_interval 与 delta_interval 两级节流，分别管快照频率和增量频率。' },
        { path: 'core/io/packet_peer.cpp', note: 'put_var：先 encode_variant 试算长度，缓冲不够就按 next_power_of_2 扩 encode_buffer，最后 put_packet 交出去。上面所有同步包最终都从这一层变成字节；想省流量，省的是 Variant 编码的内容，不是调用次数。' }
      ]
    },
    {
      type: 'text',
      title: 'Godot 的取舍：它有状态同步，但没有回滚',
      html: `<p>走完源码可以下一个准确结论：<b>Godot 的 High-level Multiplayer 是彻底的服务器权威状态同步；整个 modules/multiplayer 目录里搜不到 rollback 这个词</b>。这不是遗漏，而是分层判断——「重放一局游戏模拟」要求整套玩法逻辑能确定地重演一遍，那是游戏层给出的契约，引擎替你保证不了。</p>
<p>但它把状态同步这一格做得很扎实，四件事值得记住：</p>
<ul>
  <li><b>生命周期与属性分离</b>：spawn / despawn（MultiplayerSpawner）管「这个节点该不该存在于你屏幕上」，sync（MultiplayerSynchronizer）管「它的哪些属性要上网」，RPC 管「一次性事件」。三类命令各走各的路径，互不阻塞。</li>
  <li><b>声明式复制</b>：你在 Inspector 里勾选属性即可，等价于 Unreal 的属性复制。代价是不懂 watch 机制的人根本不知道自己的带宽花在了哪一帧、哪一个字段。</li>
  <li><b>快照 + 增量双轨</b>：定期完整关键帧、高频只发变化的属性，收端靠 tick 单调性拒绝乱序的旧状态——Quake 网络模型的后裔，也是本课模式①的完整版。</li>
  <li><b>语义与投递解耦</b>：SceneMultiplayer 只管「说什么」，底下换成 ENetMultiplayerPeer（带通道的可靠 / 不可靠 UDP）、WebRTCMultiplayerPeer（P2P），或自写的 PacketPeerUDP 都行。<b>引擎管内容，peer 管送达</b>——这正是 L0.2 那张解剖图上的分层思想在网络模块的重演。</li>
</ul>
<p>顺带区分一件事：Godot 4.3 起的 physics interpolation（scene/main/scene_tree_fti.cpp）解决的是「渲染帧率不等于物理 tick」的通用插值，和本课的<b>网络</b>插值用的是同一套数学、却是两个不同的动机，别混为一谈。</p>`,
    },
    {
      type: 'text',
      title: '小结：延迟守恒定律',
      html: `<p>把三个灵魂拷问在这一课上收拢成一句话：<b>延迟无法消灭，只能搬运；搬到哪里，取决于你把真相交给谁</b>。</p>
<ul>
  <li><b>数据怎么流动</b>：状态同步传「结果」（快照 + 增量，字节多、容错好）；帧同步传「原因」（输入指令，字节极少、要求确定性）；预测回滚两头都传，还要额外背一份回放缓冲区。</li>
  <li><b>所有权归谁</b>：服务器权威 = 服务器持有真相，客户端只做表现；帧同步 = 没有中心，真相等于「所有人一致同意的那串输入」；回滚 = 真相仍在服务器，但客户端被临时授权去猜。拉扯、慢动作、瞬移纠正，分别是三种所有权开出的账单。</li>
  <li><b>什么时候发生</b>：插值发生在<b>渲染那一刻</b>（刻意往回看一拍）；预测发生在<b>输入落地的这一帧</b>（立刻动）；回滚发生在<b>权威结果落地的那一刻</b>（重放未确认的输入）；锁定帧发生在<b>每帧推进之前</b>（不齐步就不走）。</li>
</ul>
<p>下一课 L8.3 我们离开网络走进编辑器：Undo / Redo 如何用命令模式把「时间的可逆性」做成数据结构——那和本课的回滚缓冲区，其实是同一个想法的两个化身。</p>`,
    }
  ]
}