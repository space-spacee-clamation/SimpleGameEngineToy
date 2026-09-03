// I2 · 波函数坍缩 WFC：从瓦片到无限城市
export default {
  id: 'I2',
  title: '波函数坍缩 WFC：从瓦片到无限城市',
  est: '2.5 小时',
  coreQuestions: [
    '为什么「每格只遵守邻居规则」的局部约束，能涌现出全局看起来合理的大结构？',
    '「最小熵优先」到底在买什么——为什么先坍缩候选最少的格子，比随机挑一个更快也更少翻车？',
    '传播（propagate）和回溯（backtrack）分别在防什么？只留一个行不行？',
    'Godot 的 TileMap terrain 是「半个 WFC」——它差的那一步是什么？为什么说它是贪心版而不是完备版？'
  ],
  sections: [
    {
      type: 'text',
      title: '把量子力学借来当生成器：叠加、观测、坍缩',
      html: `<p>程序化生成有两条大路。一条是<b>噪声</b>（同方向的 I1 课）：先造一个连续场，再阈值化成地形——它擅长「氛围」，不擅长「语义」。另一条就是本课的 <b>WFC（Wave Function Collapse，波函数坍缩）</b>：名字借自量子力学的比喻——每个未决定的格子处于「所有可能瓦片的叠加态」；你观测（选定）它一次，它就<b>坍缩</b>成一个确定值，并且这个观测结果会立刻改变周围所有还没观测的格子的叠加内容。</p>
<p>剥掉比喻，WFC 就是一个三步循环，简单到可以背下来：</p>
<table>
  <tr><th>步骤</th><th>做什么</th><th>一句话本质</th></tr>
  <tr><td>① 维护候选集</td><td>每个未坍缩格子手里拿着一张「我还允许放哪些瓦片」的清单，初始 = 全部瓦片</td><td>未知 = 一个集合，不是一个值</td></tr>
  <tr><td>② 选最小熵格子</td><td>挑候选清单<u>最短</u>的那个格子（并列则随机打破平局），按权重抽一个瓦片钉死</td><td>先解决最容易出错的决策</td></tr>
  <tr><td>③ 约束传播</td><td>把「这格定了」推给四邻：邻居清单里凡是跟本格<u>边缘不兼容</u>的选项全部删掉；谁被删了就让它继续向外传</td><td>一次观测，涟漪式地缩小远方的可能性</td></tr>
</table>
<p>如果某一步传播把某个邻居的清单删成了<b>空集</b>——矛盾了，说明刚才那次「观测」选错了，于是<b>回溯</b>：撤销上一步坍缩，换一个候选重来。循环往复，直到全盘每格只剩一个候选：生成完成。</p>
<p>为什么这套东西能画出「看起来像模像样」的城市、洞穴、管道？核心思想一句话：<b>局部邻接规则 + 全局约束传播 = 大尺度结构</b>。没有任何一行代码写着「道路要连成网」「房子要临街」，但只要「路的边缘只能接路/房/场的边缘」这类口对口规则成立，传播机制就会逼着道路自己蜿蜒出去、房子自己沿路排开——结构是<b>被约束挤出来的</b>，不是被画出来的。这和 L5.1 里「接触对只在同格+邻格里找」是同一种世界观：全局问题拆成局部邻接判定。</p>`
    },
    {
      type: 'text',
      title: '两个关键设计：为什么是最小熵？为什么要传播？',
      html: `<p><b>最小熵优先（minimum entropy first）不是玄学，是止损策略。</b>「熵」在这里粗糙地等于候选数：候选越少，越接近被迫定死，也越容易一步走错全盘皆输。先坍缩候选最少的格子，意味着<b>把风险最高的决策最早做掉</b>——如果它错了，回溯栈还很浅，代价小；反过来若先挑候选最多的格子随便定，等于把一个暂时无关痛痒的选择提前锁死，错误要拖很久才暴露，回溯就要撤销一大片。这就是约束求解领域经典的 <b>fail-first 启发式</b>：先碰壁，趁早碰。</p>
<p><b>传播则是「让每次观测立刻物尽其用」。</b>不做传播会怎样？每格各自随机选瓦片，邻居对不上就整盘重掷——这叫拒绝采样，在密网格上成功率指数级低。做了传播，一格定死后，它的四邻立刻砍掉不合法选项；被砍瘦的邻居又去砍自己的邻居……信息像波纹一样扩散，<b>很多格子其实是被传播「顺便」定死的，根本轮不到你猜</b>。实验里你会看到：一百多格的棋盘，往往十几步空格就全亮了——中间大量格子是传播直接判定的单候选链式反应。</p>
<p>但传播也有阴暗面：它可能把某个邻居剪到<b>零候选</b>（矛盾）。所以完整的 WFC = 传播负责「能不猜就不猜」+ 最小熵负责「必须猜时先猜险的」+ 回溯负责「猜错了体面地反悔」。三者缺一不可，下面的沙盘会把这三件事全部可视化。</p>
<p>还有一个常被忽略的参数：<b>权重</b>。坍缩时不是均匀抽签，而是按每个瓦片的权重加权随机——草地权重高就草原辽阔，房屋权重高就城市化密集。权重是你对「涌现世界」有限的直接话语权之一：你不能命令「这里盖栋房」，但你能调「房子出现的倾向」（另一半话语权是邻接规则表本身）。</p>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'wfc-sandbox',
      title: '实验：瓦片坍缩沙盘（12×12）',
      height: 600,
      code: `
// WFC 坍缩沙盘：12x12 格，7 种瓦片，边缘用「凹凸口」规则定义邻接
// 空格 单步一轮（选最小熵 -> 按权重坍缩 -> 传播裁剪；蓝框 = 本轮被裁剪的格子）
// A 自动连播   R 重掷换种子   上下键 调连播速度
// 未坍缩格显示：前四个候选符号 + 候选数；底色越亮 = 候选越少 = 熵越低
// 冲突（某格候选被剪空）时红字提示并自动回溯一步改选
// 随机数自带种子（线性同余），同一种子同一序列，可复现

engine.run({
  setup: function (state) {
    state.W = 12; state.H = 12;
    resetBoard(state, nextSeed());
    state.auto = false;
    state.speed = 14;
    state.msg = '空格单步：选最小熵格 -> 按权重坍缩它 -> 传播裁剪邻居';
  },

  update: function (state, dt, input) {
    if (input.pressed('Space')) doStep(state);
    if (input.pressed('KeyA')) state.auto = !state.auto;
    if (input.pressed('KeyR')) { resetBoard(state, nextSeed()); state.msg = '重掷：换了随机种子，全盘候选集恢复满格'; }
    if (input.pressed('ArrowUp')) state.speed = Math.min(60, state.speed + 4);
    if (input.pressed('ArrowDown')) state.speed = Math.max(2, state.speed - 4);
    if (state.auto && !isFull(state)) {
      state.autoT += dt;
      var guard = 0;
      while (state.autoT >= 1 / state.speed && guard < 4) { state.autoT -= 1 / state.speed; guard++; doStep(state); }
    }
    tickAnims(state, dt);
    if (state.conflictFlash > 0) state.conflictFlash -= dt;
  },

  draw: function (state, ctx) {
    var i;
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    for (i = 0; i < state.cand.length; i++) drawCell(state, ctx, i);
    drawLegend(ctx);
    drawPanel(state, ctx);
  }
});

// ---------- 瓦片表：sym=显示符号，w=坍缩权重，EDGE=四边端口 [东,南,西,北] ----------
var TILES = [
  { name: '草地', sym: '草', w: 3, color: '#4a7c43' },
  { name: '森林', sym: '林', w: 1, color: '#274d2b' },
  { name: '水面', sym: '水', w: 2, color: '#2f6ea8' },
  { name: '沙滩', sym: '沙', w: 2, color: '#c9a86a' },
  { name: '道路', sym: '路', w: 2, color: '#7b8494' },
  { name: '房屋', sym: '房', w: 2, color: '#a4553b' },
  { name: '广场', sym: '场', w: 1, color: '#d9c9a3' }
];
var EDGE = [
  ['G','G','G','G'],
  ['G','F','G','G'],
  ['W','W','W','W'],
  ['G','S','W','S'],
  ['R','R','R','R'],
  ['R','H','H','H'],
  ['R','R','R','R']
];
var DIRS = [[1,0],[0,1],[-1,0],[0,-1]];
var OPP = [2,3,0,1];
// 互容对表：同名端口天然相接；异名对查这张表（草-沙、水-沙、路-房、路-场、房-场、沙-场）
function compFor(a, b) {
  if (a === b) return true;
  var p = { GS:1, SG:1, WS:1, SW:1, RH:1, HR:1, RP:1, PR:1, HP:1, PH:1, SP:1, PS:1 };
  return !!p[a + b];
}
// COMPAT[d][t1][t2]：t1 放在 d 方向上紧邻 t2 是否合法（启动时预计算成查找表）
var COMPAT = [];
(function () {
  for (var d = 0; d < 4; d++) {
    COMPAT[d] = [];
    for (var a = 0; a < 7; a++) {
      COMPAT[d][a] = [];
      for (var b = 0; b < 7; b++) COMPAT[d][a][b] = compFor(EDGE[a][d], EDGE[b][OPP[d]]);
    }
  }
})();

// ---------- 带种子的随机数（线性同余，不用 Math.random，可复现） ----------
var seedState = 1;
function nextSeed() { seedState = (seedState * 1664525 + 1013904223) >>> 0; return seedState; }
function rnd(state) { state.seed = (state.seed * 1664525 + 1013904223) >>> 0; return state.seed / 4294967296; }

function resetBoard(state, seed) {
  state.seed = seed >>> 0;
  state.cand = [];
  var n = state.W * state.H;
  for (var i = 0; i < n; i++) state.cand.push([0, 1, 2, 3, 4, 5, 6]);
  state.history = [];
  state.propTotal = 0;
  state.btTotal = 0;
  state.anims = [];
  state.lastPicked = -1;
  state.conflictFlash = 0;
  state.autoT = 0;
}

function isFull(state) {
  for (var i = 0; i < state.cand.length; i++) if (state.cand[i].length !== 1) return false;
  return true;
}

// 步骤②：最小熵选择——候选最少者优先；候选为 0（矛盾）优先级最高；平局随机打破
function pickMinEntropy(state) {
  var bestN = 99, ties = [], i;
  for (i = 0; i < state.cand.length; i++) {
    var n = state.cand[i].length;
    if (n === 0) return i;
    if (n > 1) {
      if (n < bestN) { bestN = n; ties = [i]; }
      else if (n === bestN) ties.push(i);
    }
  }
  if (ties.length === 0) return -1;
  return ties[Math.floor(rnd(state) * ties.length) % ties.length];
}

// 加权随机坍缩：权重高的瓦片更容易被选中（对内容世界的直接话语权）
function weightedPick(state, cands) {
  var tot = 0, i;
  for (i = 0; i < cands.length; i++) tot += TILES[cands[i]].w;
  var r = rnd(state) * tot;
  for (i = 0; i < cands.length; i++) { r -= TILES[cands[i]].w; if (r <= 0) return cands[i]; }
  return cands[cands.length - 1];
}

function snapshot(state) {
  var s = [];
  for (var i = 0; i < state.cand.length; i++) s.push(state.cand[i].slice());
  return s;
}

// 步骤③：约束传播（BFS 波纹）——邻居候选集被裁剪则继续向外传；返回本轮被裁剪的格子
function propagateFrom(state, idx) {
  var queue = [idx], changed = {}, head = 0;
  while (head < queue.length) {
    var cur = queue[head++];
    var x = cur % state.W, y = (cur - x) / state.W;
    for (var d = 0; d < 4; d++) {
      var nx = x + DIRS[d][0], ny = y + DIRS[d][1];
      if (nx < 0 || ny < 0 || nx >= state.W || ny >= state.H) continue;
      var nidx = ny * state.W + nx;
      var nc = state.cand[nidx];
      if (!nc.length) continue;
      var mc = state.cand[cur];
      var out = [];
      for (var k = 0; k < nc.length; k++) {
        var t = nc[k], ok = false;
        for (var m = 0; m < mc.length && !ok; m++) ok = COMPAT[d][mc[m]][t];
        if (ok) out.push(t);
      }
      if (out.length !== nc.length) {
        state.cand[nidx] = out;
        state.propTotal++;
        changed[nidx] = 1;
        queue.push(nidx);
      }
    }
  }
  var list = [];
  for (var key in changed) list.push(+key);
  return list;
}

// 一轮完整循环：选 -> 存快照 -> 坍缩 -> 传播
function doStep(state) {
  if (isFull(state)) { state.msg = '全部坍缩完成！按 R 换种子再来一局'; return; }
  var idx = pickMinEntropy(state);
  if (idx < 0) { state.msg = '没有可坍缩的格子了'; return; }
  if (state.cand[idx].length === 0) { handleConflict(state); return; }
  state.history.push(snapshot(state));
  if (state.history.length > 80) state.history.shift();
  var chosen = weightedPick(state, state.cand[idx]);
  state.cand[idx] = [chosen];
  state.lastPicked = idx;
  state.anims.push({ idx: idx, kind: 'pick', t: 0 });
  var changed = propagateFrom(state, idx);
  for (var i = 0; i < changed.length; i++) state.anims.push({ idx: changed[i], kind: 'clip', t: 0 });
  var cx = idx % state.W, cy = (idx - cx) / state.W;
  state.msg = '第 ' + state.history.length + ' 步：坍缩 (' + cx + ',' + cy + ')=' + TILES[chosen].name + '，裁剪 ' + changed.length + ' 个邻居';
}

// 冲突处理：候选被剪空 -> 弹回溯栈恢复快照 -> 在同一格改选另一个候选再传播
function handleConflict(state) {
  state.btTotal++;
  state.conflictFlash = 0.6;
  if (state.history.length === 0) {
    resetBoard(state, nextSeed());
    state.btTotal = 1;
    state.msg = '回溯栈空 -> 整盘重掷（相当于反悔到第一步之前）';
    return;
  }
  var snap = state.history.pop();
  for (var i = 0; i < snap.length; i++) state.cand[i] = snap[i].slice();
  var fix = pickMinEntropy(state);
  if (fix >= 0 && state.cand[fix].length > 1) {
    state.history.push(snapshot(state));
    var ch = weightedPick(state, state.cand[fix]);
    state.cand[fix] = [ch];
    state.lastPicked = fix;
    state.anims.push({ idx: fix, kind: 'pick', t: 0 });
    var changed = propagateFrom(state, fix);
    for (var i = 0; i < changed.length; i++) state.anims.push({ idx: changed[i], kind: 'clip', t: 0 });
    state.msg = '冲突！回溯一步，改选 ' + TILES[ch].name;
  } else {
    state.msg = '冲突！已回退一步快照，再按空格换个选择';
  }
}

function tickAnims(state, dt) {
  var keep = [];
  for (var i = 0; i < state.anims.length; i++) {
    var a = state.anims[i];
    a.t += dt;
    if (a.t < 0.8) keep.push(a);
  }
  state.anims = keep;
}

function drawCell(state, ctx, i) {
  var x = i % state.W, y = (i - x) / state.W;
  var px = 12 + x * 30, py = 44 + y * 30;
  var c = state.cand[i];
  var anim = null;
  for (var k = 0; k < state.anims.length; k++) if (state.anims[k].idx === i) anim = state.anims[k];
  if (c.length === 1) {
    var t = TILES[c[0]];
    ctx.fillStyle = t.color;
    ctx.fillRect(px, py, 28, 28);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '13px sans-serif';
    ctx.fillText(t.sym, px + 8, py + 19);
  } else {
    var heat = 1 - (c.length - 1) / 6;
    ctx.fillStyle = 'rgb(' + Math.round(11 + heat * 60) + ',' + Math.round(15 + heat * 30) + ',' + Math.round(23 + heat * 20) + ')';
    ctx.fillRect(px, py, 28, 28);
    ctx.strokeStyle = '#1e2a3d';
    ctx.strokeRect(px + 0.5, py + 0.5, 27, 27);
    ctx.fillStyle = '#8fa7c7';
    ctx.font = '9px sans-serif';
    var shown = '';
    for (var j = 0; j < c.length && j < 4; j++) shown += TILES[c[j]].sym;
    if (c.length > 4) shown += '..';
    ctx.fillText(shown, px + 3, py + 12);
    ctx.fillStyle = '#5b7397';
    ctx.fillText('' + c.length, px + 3, py + 24);
  }
  if (anim) {
    var al = 1 - anim.t / 0.8;
    ctx.strokeStyle = anim.kind === 'pick' ? 'rgba(251,191,36,' + al.toFixed(2) + ')' : 'rgba(96,165,250,' + al.toFixed(2) + ')';
    ctx.lineWidth = 2;
    ctx.strokeRect(px - 1, py - 1, 30, 30);
    ctx.lineWidth = 1;
  }
  if (i === state.lastPicked) {
    ctx.strokeStyle = '#f59e0b';
    ctx.strokeRect(px - 2.5, py - 2.5, 33, 33);
  }
}

function drawLegend(ctx) {
  ctx.font = '11px monospace';
  for (var i = 0; i < TILES.length; i++) {
    var lx = 386 + (i % 4) * 82, ly = 52 + Math.floor(i / 4) * 22;
    ctx.fillStyle = TILES[i].color;
    ctx.fillRect(lx, ly - 9, 12, 12);
    ctx.fillStyle = '#9db4d0';
    ctx.fillText(TILES[i].sym + ' w' + TILES[i].w, lx + 16, ly + 1);
  }
  ctx.fillStyle = '#7d93b3';
  ctx.fillText('邻接：同口相接；草-沙/水-沙/', 386, 112);
  ctx.fillText('路-房/路-场/房-场/沙-场 互容', 386, 126);
  ctx.fillText('水不挨路、林只连草', 386, 140);
  ctx.fillText('底色越亮=候选越少=熵越低', 386, 160);
}

function drawPanel(state, ctx) {
  var done = 0;
  for (var i = 0; i < state.cand.length; i++) if (state.cand[i].length === 1) done++;
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '13px monospace';
  ctx.fillText('已坍缩 ' + done + '/' + state.cand.length + '   传播裁剪 ' + state.propTotal + ' 次   回溯 ' + state.btTotal + ' 次', 12, 24);
  ctx.fillStyle = '#7d93b3';
  ctx.fillText('连播速度 ' + state.speed + ' 步/秒（上下键调）', 386, 24);
  ctx.fillStyle = state.conflictFlash > 0 ? '#ef4444' : '#9db4d0';
  ctx.font = '12px monospace';
  ctx.fillText(state.msg, 12, 414);
  ctx.fillStyle = '#5b7397';
  ctx.fillText('空格 单步 · A 自动连播 · R 重掷换种子', 12, 430);
}
`
    },
    {
      type: 'text',
      title: '读沙盘：三个必看的现象',
      html: `<p>把沙盘玩通一轮（空格从头点到位，或 A 连播后 R 重掷几次），你应该能盯住三件事：</p>
<ol>
  <li><b>橙框与蓝框的分工</b>：橙框是你刚刚「观测」的那一格（坍缩），蓝框是本轮传播中被裁剪候选集的格子。注意很多轮里蓝框一圈圈往外扩——那就是约束的涟漪。有时一轮之后「已坍缩」猛涨一截：那些格子没被你猜过，是传播把候选剪到只剩一个、自动定死的。<b>「传播替你做掉的决策」远多于「你亲手做的决策」</b>，这正是 WFC 高效的根源。</li>
  <li><b>底色热力图 = 熵地图</b>：越亮的空格候选越少。下一轮被坍缩的，几乎总是此刻最亮的那几格之一。盯着看几步，「最小熵优先」就从口号变成直觉。</li>
  <li><b>回溯很少见，但一旦见到就值钱</b>：面板上的「回溯」计数多数时候是 0——传播 + 最小熵已经把大部分坑提前避开了。等你撞上下一步就把某格剪成空集的运气（多掷几次种子总会遇到），红字闪烁、棋盘肉眼可见地「退回」一小步再换个瓦片继续。回溯次数低不等于回溯不重要：它是保证<b>一定出结果</b>的安全网。</li>
</ol>
<p>再对照顶部统计：144 个格子，「传播裁剪次数」通常几百，而你的「猜测次数」（坍缩操作）只有几十次——<b>推理做得多、赌博做得少</b>，这是 WFC 和「纯随机撒瓦片」的本质差距。</p>`
    },
    {
      type: 'text',
      title: '试一试（课内可选）',
      html: `<ul>
  <li>改 <code>TILES</code> 里的权重 <code>w</code>：把房屋改成 w:8、草地改成 w:1，观察「城市密度」如何整体变化——你没写任何「哪里该有房」的代码，但世界的性格变了。这就是权重的杠杆。</li>
  <li>往 <code>compFor</code> 的互容表里加一对（比如让水也能接路——想象码头），或者删掉一对，比较生成结果的连通感差异。<b>规则表就是这个世界全部的物理学。</b></li>
  <li>把 <code>pickMinEntropy</code> 换成「随机挑一个候选数大于 1 的格子」（跳过最小熵逻辑），对比回溯计数与总步数：多数情况下回溯明显变多——fail-first 在替你省钱。</li>
  <li>极端实验：把某瓦片的 EDGE 四边全改成独一无二的端口（谁都不接），看传播如何迅速把它周围的候选剪光、触发连环回溯——理解「死局怎么产生」最快的方式，就是亲手造一个死局。</li>
</ul>`
    },
    {
      type: 'source',
      title: '源码走读：Godot 的 terrain——一台只装了半程的 WFC 机器',
      files: [
        { path: 'modules/tilemap/tile_set.h', note: '搜 enum CellNeighbor（约 218 行）：16 个 peering bits——四边 + 四角各记一份「这个方向属于哪种地形」。再看紧随其后的 TerrainMode 三个枚举值：MATCH_CORNERS_AND_SIDES / MATCH_CORNERS / MATCH_SIDES——这就是我们实验里「凹凸口」规则的引擎版，只是 Godot 连角都管。对照 TerrainsPattern 类（约 272 行）：一个 int bits[16] 数组，就是一只瓦片的「边缘插头签名」。' },
        { path: 'modules/tilemap/tile_map_layer.cpp', note: '核心三个符号顺着读：set_cells_terrain_connect（约 3042 行，编辑器画笔入口）→ terrain_fill_connect（约 2437 行，把笔刷扩张成 can_modify「可修改区」并为每个方向生成 TerrainConstraint，注意 priority 分级：中心 bit 10 分、连接 bit 5 分）→ _get_best_terrain_pattern_for_constraints（约 1852 行，给每格从全体 pattern 里打分挑违规最小的那个）。这就是「传播 + 择优」的 Godot 分身。' },
        { path: 'modules/tilemap/tile_set.cpp', note: '看 _update_terrains_cache（约 397 行）：遍历全部 TileData，把「pattern → 可用瓦片集合」建进 per_terrain_pattern_tiles 这张 RBMap——即「给定边缘约束，哪些瓦片能上场」的候选表。get_random_tile_from_terrains_pattern（约 1412 行）再从集合里随机兑现一只：对应我们的「加权坍缩」那一步（Godot 是均匀随机，没有权重）。' },
        { path: 'modules/noise/fastnoise_lite.h', note: '对照组（呼应 I1）：TYPE_SIMPLEX / TYPE_PERLIN / TYPE_CELLULAR 一长串枚举 + get_noise_2d——逐点求值的连续场。噪声不问邻居、不留候选集、不会冲突，也就永远不可能「保证」道路连通；WFC 反之。两条生成路线的性格差异，两份头文件摆在一起一眼看穿。' }
      ]
    },
    {
      type: 'text',
      title: 'Godot terrain 与真 WFC 差在哪',
      html: `<p>读完上面几个文件，可以把 Godot 的 terrain 系统精确定性了：<b>它有 WFC 的「约束表示」和「一次局部传播」，但没有「全局搜索」。</b></p>
<p>相同的部分：TileSet 里每张瓦片带 16 个 peering bits（候选兼容性的数据基础）；画笔涂一块草地时，<code>terrain_fill_connect</code> 会收集笔刷<b>及其四邻</b>构成 can_modify 集合，为它们重建 TerrainConstraint，再逐格用 <code>_get_best_terrain_pattern_for_constraints</code> 在所有合法 pattern 里挑「违规得分最小」的一个，最后 <code>get_random_tile_from_terrains_pattern</code> 随机兑现成具体瓦片——这就是「定一处、修邻居」的传播波纹，和我们沙盘里 propagateFrom 的 BFS 一模一样的形状。</p>
<p>不同的部分恰恰是我们实验的后两步：<b>第一，没有最小熵排序</b>——它按笔刷顺序逐格处理，不存在「全局挑最危险的格子先解」；<b>第二，没有回溯</b>——如果某格的约束无解，它不推翻前面的决定，而是接受「得分最高（违规最少）」的近似 pattern，宁可留下一个不完美的接缝，也不重算。换句话说：<b>Godot terrain 是交互工具里的贪心局部求解器，WFC 是离线/运行时生成用的完备搜索算法。</b>取舍理由也很「引擎」：编辑器画笔必须毫秒级响应、且必须尊重美术师已经画下的每一笔——回溯撤销别人的笔触是不可接受的体验；而关卡生成器可以慢慢搜，因为它没有「用户已有作品」要保护。</p>
<p>顺带一提：真正完整的 WFC 实现需要的全部零件——pattern 候选表、兼容性查找、传播队列——Godot 的数据结构都已备好，缺的只是外面套一层「选择顺序 + 回溯栈」。看懂这一点，你就同时看懂了一个算法和一个引擎的边界：<b>引擎提供数据结构原语，算法住在其上。</b></p>`
    },
    {
      type: 'text',
      title: '三个灵魂拷问：回到 WFC 上',
      html: `<p><b>数据怎么流动？</b>单向三级：候选集数组（每格一个集合）→ 坍缩把其中一个集合收缩为一 → 传播沿着四邻方向表把「收缩」翻译成邻居的「删减」，被删过的格子再作为新源头继续传。整个过程没有任何「最终像素」参与决策——<b>流动的是可能性空间本身</b>，画面只是候选集状态的投影。这和 L2.2 里信号沿连接表扩散是同构的形状，只不过载荷从「事件」换成了「约束」。</p>
<p><b>所有权归谁？</b>候选集（cand）、历史栈（history）、随机种子（seed）全部归<b>生成器</b>所有，格子本身是无主的数据槽。回溯的本质就是所有权演练：snapshot 是生成器对自己状态的深拷贝产权，pop 恢复 = 主动放弃一段已做的决定。Godot terrain 里对应关系一目了然：候选表 per_terrain_pattern_tiles 归 <b>TileSet</b>（资源，作者编辑期持有、缓存复用），约束集合归 <b>TileMapLayer</b> 的一次调用（栈上临时变量，函数返回即销毁）——所以它天然没有跨调用的回溯栈。</p>
<p><b>什么时候发生？</b>三种时钟各有其位：静态部分（COMPAT 查找表、Godot 的 terrains 缓存）在<b>启动/资源变更时</b>一次性预计算；搜索循环（选格→坍缩→传播）发生在<b>生成时刻</b>——可以是编辑器里点一下画笔（Godot terrain：按需、增量），也可以是游戏启动或流式区块加载时跑一整盘（真 WFC：批量）；动画与展示只是事后回放。工程上最常见的追问是「能不能边玩边生成」——答案是可以：WFC 的状态全是数据，把一次 doStep 摊进若干帧即可，我们的沙盘就是这么干的。</p>`
    },
    {
      type: 'text',
      title: '小结',
      html: `<p>这一课把 WFC 拆到了螺丝刀级别，记住三层：</p>
<ul>
  <li><b>机制层</b>：候选集 + 最小熵 + 传播 + 回溯，四件套各司其职——候选集表达「未知」，最小熵决定「先问哪个」，传播负责「能不猜就不猜」，回溯兜底「猜错了能反悔」。</li>
  <li><b>思想层</b>：大结构不是画出来的，是局部邻接规则经全局传播<b>挤</b>出来的；你对内容的控制权集中在两张表——权重表和邻接规则表。</li>
  <li><b>引擎层</b>：Godot terrain 证明了一个成熟引擎如何「只实现算法的一半」——保留传播与候选表、砍掉全局搜索与回溯，换取交互工具的即时性与对用户创作的尊重。读懂缺口，你就能在需要时把那半台机器自己补上。</li>
</ul>
<p>它与 I1 噪声互为镜像：噪声快、连续、不可保证；WFC 慢、离散、约束即真理——高级生成管线常常两者接力（噪声定大势、WFC 填细节）。本方向下一课 I3 我们看第三条路线：L-system 用重写规则生长结构，那是「时间展开的约束传播」。</p>`
    }
  ]
}
