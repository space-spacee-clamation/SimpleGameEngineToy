// E2 · 增量压缩与快照:带宽经济学
export default {
  id: 'E2',
  title: '增量压缩与快照：带宽经济学',
  est: '2 小时',
  coreQuestions: [
    '同一个世界状态，「发什么、怎么编码」能差出多少倍？',
    '增量（delta）为什么在游戏状态上特别有效？',
    '量化降精度卖掉什么、买回什么？位打包怎么数着比特过日子？',
    'MTU 预算下，快照频率与内容怎么取舍？'
  ],
  sections: [
  {
    type: 'text',
    title: '同一份状态，三种账单',
    html: `<p>状态同步每秒要发很多次「世界现在的样子」。同一份 60 个实体的快照，编码方式不同，账单能差出一个数量级：</p>
<table>
  <tr><th>编码</th><th>思路</th><th>典型体积</th></tr>
  <tr><td>① 文本全量</td><td>每个实体拼一段带字段名的描述，全部照发</td><td>字段名重复是纯税，最大</td></tr>
  <tr><td>② 定长量化</td><td>坐标降成 0~1000 的整数（2 字节）、速度降成 1 字节有符号数，定长排列</td><td>骤降；精度换带宽</td></tr>
  <tr><td>③ 增量+位打包</td><td>每个实体 1 字节掩码记录「哪些字段变了」，只发改变的字段</td><td>安静时最小；乱起来向②靠拢</td></tr>
</table>
<p>③有效的前提是<b>状态大多是惰性的</b>——多数实体多数帧没什么可说。这正好是游戏世界的常态，也是 delta sync 在引擎复制系统里无处不在的原因。</p>`
  },
  {
    type: 'text',
    title: '量化的账与 MTU 的墙',
    html: `<p><b>量化</b>是把「float 精度」换成「字节预算」：坐标 0~1000 的整数已经比像素还细，玩家根本看不出 2 字节和 4 字节的区别——<b>卖掉看不见的精度，买回 50% 带宽</b>。速度用 1 字节有符号数（-128~127），对「每秒几米」的量纲绰绰有余。</p>
<p><b>MTU 的墙。</b>以太网单包 payload 约 1200 字节是安全线，超了就拆包、丢一个就等重传。快照 4KB 意味着一帧拆 4 包、丢包放大 4 倍——所以带宽经济学最终服务于<b>「把每次快照塞进尽量少的包」</b>：要么降频、要么降质、要么增量。</p>`
  },
  {
    type: 'lab',
    lab: 'code',
    key: 'delta',
    title: '实验：三编码同屏对账（字节/秒实时统计）',
    height: 620,
    code: `// 空格=注入一阵混乱  回车=清空统计  三条曲线=三种编码的快照体积
// 10Hz 快照,右侧账本实时换算 KB/s 与 MTU 包数,下方展示 0 号实体的变更掩码

var N = 60, SNAP_HZ = 10;

engine.run({
  setup: function (state) {
    state.t = 0;
    state.snapTimer = 0;
    state.chaos = 0;
    state.series1 = []; state.series2 = []; state.series3 = [];
    state.lastMask = 0; state.changedEntities = 0;
    state.ents = [];
    var rng = mulberry32(20260903);
    for (var i = 0; i < N; i++) {
      state.ents.push({
        x: rng() * 1000, y: rng() * 1000,
        vx: (rng() * 2 - 1) * 20, vy: (rng() * 2 - 1) * 20,
        hp: 40 + Math.floor(rng() * 60), flags: Math.floor(rng() * 4)
      });
    }
    state.prev = deepCopy(state.ents);
    state.log = ['安静世界:看增量路线有多小'];
  },

  update: function (state, dt, input) {
    state.t += dt;
    if (input.pressed('Space')) { state.chaos = 2; pushLog(state, '注入混乱:全员乱动 2 秒'); }
    if (input.pressed('Enter')) {
      state.series1 = []; state.series2 = []; state.series3 = [];
      state.lastMask = 0; state.changedEntities = 0;
      pushLog(state, '统计已清空');
    }
    if (state.chaos > 0) state.chaos -= dt;
    // 模拟:安静漂移或混乱乱动
    var rng = state.rng || (state.rng = mulberry32(777));
    for (var i = 0; i < N; i++) {
      var e = state.ents[i];
      if (state.chaos > 0) {
        e.vx += (rng() * 2 - 1) * 60; e.vy += (rng() * 2 - 1) * 60;
        if (rng() > 0.9) e.hp = Math.max(0, e.hp - 1);
        if (rng() > 0.95) e.flags = Math.floor(rng() * 4);
      } else if (rng() > 0.995) {
        e.vx += (rng() * 2 - 1) * 4; e.vy += (rng() * 2 - 1) * 4;
      }
      e.x = clamp(e.x + e.vx * dt, 0, 1000);
      e.y = clamp(e.y + e.vy * dt, 0, 1000);
    }
    // 10Hz 快照:三种编码各自记账
    state.snapTimer += dt;
    if (state.snapTimer >= 1 / SNAP_HZ) {
      state.snapTimer -= 1 / SNAP_HZ;
      takeSnapshot(state);
    }
    while (state.log.length > 3) state.log.shift();
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    drawChart(state, ctx);
    drawLedger(state, ctx);
    drawMask(state, ctx);
    drawFooter(state, ctx);
  }
});

// ---------- 三种编码 ----------

function encNaive(state) {
  var bytes = 0;
  for (var i = 0; i < N; i++) {
    var e = state.ents[i];
    bytes += ('{"id":' + i + ',"x":' + e.x.toFixed(3) + ',"y":' + e.y.toFixed(3) +
      ',"vx":' + e.vx.toFixed(3) + ',"vy":' + e.vy.toFixed(3) +
      ',"hp":' + e.hp + ',"flags":' + e.flags + '},').length;
  }
  return bytes;
}

function quantByte(v) { return Math.max(0, Math.min(255, Math.round(v))); }

function encQuant(state) {
  // 每实体定长 10B:x2+y2+vx1+vy1+hp1+flags1+id2
  return N * 10;
}

function encDelta(state) {
  // 每实体:1B 掩码 + 变化字段(x/y 各2B,vx/vy/hp/flags 各1B)
  var bytes = 0, changedEntities = 0;
  for (var i = 0; i < N; i++) {
    var e = state.ents[i], p = state.prev[i];
    var mask = 0, size = 0;
    if (Math.abs(e.x - p.x) > 0.5) { mask |= 1; size += 2; }
    if (Math.abs(e.y - p.y) > 0.5) { mask |= 2; size += 2; }
    if (Math.abs(e.vx - p.vx) > 0.5) { mask |= 4; size += 1; }
    if (Math.abs(e.vy - p.vy) > 0.5) { mask |= 8; size += 1; }
    if (e.hp !== p.hp) { mask |= 16; size += 1; }
    if (e.flags !== p.flags) { mask |= 32; size += 1; }
    if (mask) { bytes += 1 + size; changedEntities++; }
    state.lastMask = i === 0 ? mask : state.lastMask;
  }
  state.changedEntities = changedEntities;
  return bytes;
}

function takeSnapshot(state) {
  var b1 = encNaive(state);
  var b2 = encQuant(state);
  var b3 = encDelta(state);
  state.series1.push(b1); state.series2.push(b2); state.series3.push(b3);
  if (state.series1.length > 150) state.series1.shift();
  if (state.series2.length > 150) state.series2.shift();
  if (state.series3.length > 150) state.series3.shift();
  state.prev = deepCopy(state.ents);
}

function deepCopy(list) {
  var out = [];
  for (var i = 0; i < list.length; i++) {
    out.push({ x: list[i].x, y: list[i].y, vx: list[i].vx, vy: list[i].vy, hp: list[i].hp, flags: list[i].flags });
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

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

function pushLog(state, s) {
  state.log.push(s);
}

// ---------- 绘制 ----------

function drawChart(state, ctx) {
  var x0 = 16, y0 = 60, w = 688, h = 200;
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText('快照体积(字节,最近 150 次@10Hz)  顶栏=MTU 1200B 参考线', x0, y0 - 8);
  ctx.strokeStyle = '#2c3e55';
  ctx.strokeRect(x0, y0, w, h);
  var mtuY = y0 + h - (1200 / 4500) * h;
  ctx.strokeStyle = '#f87171';
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(x0, mtuY);
  ctx.lineTo(x0 + w, mtuY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#f87171';
  ctx.fillText('MTU 1200B', x0 + 4, mtuY + 12);
  drawSeries(state.series1, ctx, x0, y0, w, h, '#f59e0b', 4500);
  drawSeries(state.series2, ctx, x0, y0, w, h, '#5b8fd6', 4500);
  drawSeries(state.series3, ctx, x0, y0, w, h, '#6ee7b7', 4500);
}

function drawSeries(arr, ctx, x0, y0, w, h, color, mx) {
  if (arr.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (var i = 0; i < arr.length; i++) {
    var px = x0 + i / 149 * w;
    var py = y0 + h - Math.min(1, arr[i] / mx) * h;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.lineWidth = 1;
}

function drawLedger(state, ctx) {
  var x = 16, y = 296;
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  var n1 = state.series1, n2 = state.series2, n3 = state.series3;
  var b1 = n1.length ? n1[n1.length - 1] : 0;
  var b2 = n2.length ? n2[n2.length - 1] : 0;
  var b3 = n3.length ? n3[n3.length - 1] : 0;
  ctx.fillStyle = '#f59e0b';
  ctx.fillText('① 文本全量  ' + b1 + 'B/snap = ' + (b1 * SNAP_HZ / 1024).toFixed(2) + 'KB/s = ' + Math.ceil(b1 / 1200) + ' 包', x, y);
  ctx.fillStyle = '#5b8fd6';
  ctx.fillText('② 定长量化  ' + b2 + 'B/snap = ' + (b2 * SNAP_HZ / 1024).toFixed(2) + 'KB/s = ' + Math.ceil(b2 / 1200) + ' 包', x, y + 20);
  ctx.fillStyle = '#6ee7b7';
  ctx.fillText('③ 增量位打包 ' + b3 + 'B/snap = ' + (b3 * SNAP_HZ / 1024).toFixed(2) + 'KB/s = ' + Math.ceil(b3 / 1200) + ' 包', x, y + 40);
  ctx.fillStyle = '#ffd479';
  ctx.fillText('③ 相对 ① 的压缩比 ' + (b1 > 0 ? (b1 / Math.max(b3, 1)).toFixed(1) : '-') + 'x   本拍有变化的实体 ' + (state.changedEntities || 0) + '/' + N, x, y + 66);
}

function drawMask(state, ctx) {
  var x = 16, y = 420;
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText('0 号实体的变更掩码(绿=本拍变了,只发变了的字段):', x, y - 10);
  var labels = ['x', 'y', 'vx', 'vy', 'hp', 'flags'];
  for (var i = 0; i < 6; i++) {
    var on = (state.lastMask & (1 << i)) !== 0;
    ctx.fillStyle = on ? '#14301f' : '#141a24';
    ctx.fillRect(x + i * 92, y, 84, 30);
    ctx.strokeStyle = on ? '#6ee7b7' : '#3b4d6b';
    ctx.strokeRect(x + i * 92, y, 84, 30);
    ctx.fillStyle = on ? '#6ee7b7' : '#5b7397';
    ctx.fillText(labels[i] + (on ? ' 变了' : ' 没动'), x + i * 92 + 8, y + 19);
  }
}

function drawFooter(state, ctx) {
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText('空格=注入混乱  回车=清空统计', 16, 500);
  for (var i = 0; i < state.log.length; i++) {
    ctx.fillStyle = i === state.log.length - 1 ? '#ffd479' : '#5b7397';
    ctx.fillText(state.log[i], 260, 500 + i * 0 + i * 14);
  }
  ctx.fillStyle = '#5b7397';
  ctx.fillText('安静世界里 ③ 通常只剩零头;混乱一阵后 ③ 向 ② 收敛——delta 的成本与「变化量」成正比', 16, 560);
}`
  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>安静对比：</b>刚进课室什么都不按——绿线（增量）贴地飞行，黄线（文本）高悬 3~4KB/s：同一份世界，账单差十几倍。</li>
  <li><b>空格注入混乱：</b>全员乱动的 2 秒里，绿线蹿向蓝线——delta 的成本正比于变化量，天下没有免费的增量。</li>
  <li><b>看掩码：</b>安静时 0 号实体的 6 格大多灰着（只有 x/y 偶尔变绿）；混乱时 6 格全绿——「只发改了的字段」在两种世界里的体积差就是两条线之间的距离。</li>
  <li><b>数包：</b>右账本每行的「包数」是把快照塞进 1200B MTU 的代价——①在 60 实体就要拆 4 包，②③全绿单包走。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：引擎复制系统的增量与量化',
    files: [
      { path: 'modules/multiplayer/multiplayer_synchronizer.cpp', note: '属性同步器：配置哪些属性同步、以什么频率与规则同步——delta 思想在节点属性层的落点。建议搜索：replication_config、_update_sync、SYNC_TIME。' },
      { path: 'modules/multiplayer/scene_replication_interface.cpp', note: '场景复制协议帧：实体出现/消失/状态更新的打包与分发，对应本课「掩码+只发变化」的协议层。建议搜索：on_replication_start、_update_spawned_state。' },
      { path: 'modules/multiplayer/multiplayer_spawner.cpp', note: '按需生成：只把玩家看得见的实体加入同步集合——带宽经济学的第一刀是「少发实体」。建议搜索：spawn、track、_track_object。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>带宽经济学三级火箭：<b>少发</b>（AOI/按需生成，E3 的近亲）、<b>发小</b>（量化/位打包）、<b>发变化</b>（delta 掩码）。三级全开，4KB/snap 的账单能压到几百字节——这正是引擎复制系统的日常。</p>
<ul>
  <li><b>数据怎么流动？</b>状态→与上一拍比对→掩码标记变化字段→量化降精度→按掩码只发变化→对端按掩码重组。</li>
  <li><b>所有权归谁？</b>「上一拍状态」由同步器持有（delta 的参照物）；掩码协议双方共同约定——协议即合同。</li>
  <li><b>什么时候发生？</b>快照按固定频率（本课 10Hz），比对在发送前一刻，重组在接收端下一拍前完成——频率×体积的乘积才是带宽的真账单。</li>
</ul>`
  }
  ]
};
