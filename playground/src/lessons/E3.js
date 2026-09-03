// E3 · 兴趣管理 AOI:只发看得见的
export default {
  id: 'E3',
  title: '兴趣管理 AOI：只发看得见的',
  est: '2 小时',
  coreQuestions: [
    '200 个实体为什么不该全发？「兴趣」是谁的兴趣？',
    'AOI 集合怎么维护？跨越格子边界那一刻发生了什么？',
    '优先级分层（近密远疏）在带宽曲线上买到了什么？',
    '传送为什么是 AOI 的最坏情况？'
  ],
  sections: [
  {
    type: 'text',
    title: '大世界的网络裁剪：不发看不见的',
    html: `<p>E2 解决了「一份状态怎么发得小」，本课解决更根本的问题：<b>压根别发</b>。玩家对屏幕外的 190 个 NPC 毫无兴趣，为他们花带宽是纯浪费——这就是<b>兴趣管理（AOI, Area of Interest）</b>：以玩家为中心圈一个「兴趣集」，<b>只有集合内的实体进入同步管线</b>。</p>
<p>AOI 是大世界的网络版视锥剔除：渲染剔除省的是 draw call，AOI 省的是字节。两者的哲学完全一致——<b>把有限资源花在感知得到的地方</b>。</p>`
  },
  {
    type: 'text',
    title: '兴趣集、优先级与传送尖峰',
    html: `<table>
  <tr><th>机制</th><th>做什么</th><th>代价</th></tr>
  <tr><td>半径 AOI</td><td>距离内才算「有兴趣」，出圈即出集</td><td>边界抖动：贴着圈走会反复进出——用滞回/格子边界重建压制</td></tr>
  <tr><td>网格化维护</td><td>世界划格子，玩家跨格才重建一次兴趣集</td><td>重建那一帧有一小撮 CPU 尖峰</td></tr>
  <tr><td>优先级分层</td><td>近处 10Hz、中距 2Hz、远处不发</td><td>带宽曲线随距离三次方下降</td></tr>
</table>
<p><b>传送是 AOI 的最坏情况</b>：兴趣集瞬间清空重造，新旧集合完全没有交集——新位置的「入场快照」必须一次性补发全量，否则玩家看到一片虚无。这也是为什么传送门加载和 AOI 重建总被设计在一起。</p>`
  },
  {
    type: 'lab',
    lab: 'code',
    key: 'aoi',
    title: '实验：AOI 开关下的包量对比（200 实体）',
    height: 620,
    code: `// WASD 移动  Q/E=调半径  Tab=AOI 开/关  空格=传送  R=重撒 NPC
// 左=世界(亮=在兴趣集/灰=不发)  右=带宽账本  黄圈=AOI 半径

var CW = 14, COLS = 44, ROWS = 30;

engine.run({
  setup: function (state) {
    state.px = COLS * CW / 2;
    state.py = ROWS * CW / 2;
    state.radius = 4.5;
    state.aoiOn = true;
    state.seed = 20260903;
    state.log = ['AOI 开启:只发圈内实体'];
    state.rebuildFlash = 0;
    state.lastCell = 'x';
    state.bytesHistory = [];
    spawnNpcs(state);
  },

  update: function (state, dt, input) {
    if (input.pressed('KeyR')) { spawnNpcs(state); pushLog(state, 'NPC 重撒'); }
    if (input.pressed('Tab')) { state.aoiOn = !state.aoiOn; pushLog(state, state.aoiOn ? 'AOI:开(只发圈内)' : 'AOI:关(200 全发,当心账本)'); }
    if (input.pressed('KeyQ')) { state.radius = Math.max(2, state.radius - 0.5); state.lastCell = 'x'; }
    if (input.pressed('KeyE')) { state.radius = Math.min(8, state.radius + 0.5); state.lastCell = 'x'; }
    if (input.pressed('Space')) {
      state.px = 20 + (state.px * 7919) % (COLS * CW - 40);
      state.py = 20 + (state.py * 104729) % (ROWS * CW - 40);
      state.lastCell = 'x';
      state.rebuildFlash = 0.6;
      pushLog(state, '传送:兴趣集整体重建(入场快照补发)');
    }
    var sp = 4.2;
    if (input.down('KeyA') || input.down('ArrowLeft')) state.px -= sp;
    if (input.down('KeyD') || input.down('ArrowRight')) state.px += sp;
    if (input.down('KeyW') || input.down('ArrowUp')) state.py -= sp;
    if (input.down('KeyS') || input.down('ArrowDown')) state.py += sp;
    state.px = clamp(state.px, 8, COLS * CW - 8);
    state.py = clamp(state.py, 8, ROWS * CW - 8);
    if (state.rebuildFlash > 0) state.rebuildFlash -= dt;

    // 网格化:玩家跨格才重建兴趣集
    var cellW = 4 * CW;
    var cx = Math.floor(state.px / cellW), cy = Math.floor(state.py / cellW);
    var cellKey = cx + ',' + cy;
    if (cellKey !== state.lastCell) {
      state.lastCell = cellKey;
      state.rebuildFlash = 0.35;
    }

    // 兴趣集与优先级:近10Hz 中2Hz 远不发
    wanderNpcs(state, dt);
    var sent = 0, bytes = 0, i, d;
    for (i = 0; i < state.npcs.length; i++) {
      var n = state.npcs[i];
      d = dist(n.x, n.y, state.px, state.py);
      if (!state.aoiOn) {
        bytes += 8 * 10 * dt;
        n.tier = 1;
      } else if (d <= state.radius * CW) {
        bytes += 8 * 10 * dt;
        n.tier = 2;
        sent++;
      } else if (d <= state.radius * CW * 1.8) {
        bytes += 8 * 2 * dt;
        n.tier = 1;
        sent++;
      } else {
        n.tier = 0;
      }
    }
    state.sent = state.aoiOn ? sent : state.npcs.length;
    state.bytes = bytes;
    state.bytesHistory.push(state.bytes);
    if (state.bytesHistory.length > 150) state.bytesHistory.shift();
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    drawWorld(state, ctx);
    drawLedger(state, ctx);
    drawFooter(state, ctx);
  }
});

// ---------- NPC 与工具 ----------

function spawnNpcs(state) {
  var r = mulberry32(state.seed);
  state.npcs = [];
  for (var i = 0; i < 200; i++) {
    state.npcs.push({
      x: 8 + r() * (COLS * CW - 16),
      y: 8 + r() * (ROWS * CW - 16),
      wa: r() * 6.2832,
      tier: 0
    });
  }
}

function wanderNpcs(state, dt) {
  var r = state.wrng || (state.wrng = mulberry32(424242));
  for (var i = 0; i < state.npcs.length; i++) {
    var n = state.npcs[i];
    n.wa += (r() - 0.5) * 0.6;
    n.x += Math.cos(n.wa) * 9 * dt;
    n.y += Math.sin(n.wa) * 9 * dt;
    if (n.x < 8 || n.x > COLS * CW - 8) n.wa = Math.PI - n.wa;
    if (n.y < 8 || n.y > ROWS * CW - 8) n.wa = -n.wa;
    n.x = clamp(n.x, 8, COLS * CW - 8);
    n.y = clamp(n.y, 8, ROWS * CW - 8);
  }
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

function dist(x1, y1, x2, y2) {
  var dx = x1 - x2, dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

function pushLog(state, s) {
  state.log.push(s);
  if (state.log.length > 3) state.log.shift();
}

// ---------- 绘制 ----------

function drawWorld(state, ctx) {
  var x0 = 16, y0 = 44;
  ctx.fillStyle = '#0d1420';
  ctx.fillRect(x0, y0, COLS * CW, ROWS * CW);
  for (var i = 0; i < state.npcs.length; i++) {
    var n = state.npcs[i];
    var px = x0 + n.x, py = y0 + n.y;
    if (n.tier === 2) ctx.fillStyle = '#6ee7b7';
    else if (n.tier === 1) ctx.fillStyle = '#5b8fd6';
    else ctx.fillStyle = '#232d3f';
    ctx.fillRect(px - 2, py - 2, 4, 4);
  }
  if (state.aoiOn) {
    ctx.strokeStyle = state.rebuildFlash > 0 ? '#ffd479' : 'rgba(255,212,121,0.45)';
    ctx.lineWidth = state.rebuildFlash > 0 ? 3 : 1.5;
    ctx.beginPath();
    ctx.arc(x0 + state.px, y0 + state.py, state.radius * CW, 0, 6.2832);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(245,158,11,0.25)';
    ctx.beginPath();
    ctx.arc(x0 + state.px, y0 + state.py, state.radius * CW * 1.8, 0, 6.2832);
    ctx.stroke();
    ctx.lineWidth = 1;
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x0 + state.px - 3, y0 + state.py - 3, 6, 6);
}

function drawLedger(state, ctx) {
  var x = 592, y = 52;
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText('AOI:' + (state.aoiOn ? '开' : '关') + '  半径 ' + state.radius + ' 格(Q/E)', x, y);
  ctx.fillStyle = '#6ee7b7';
  ctx.fillText('本帧同步实体 ' + state.sent + '/' + state.npcs.length, x, y + 24);
  var kbs = state.bytes / 1024;
  ctx.fillStyle = state.aoiOn ? '#6ee7b7' : '#f87171';
  ctx.fillText('带宽 ' + kbs.toFixed(2) + ' KB/s', x, y + 46);
  var x0 = 592, y0 = y + 64, w = 112, h = 90;
  ctx.strokeStyle = '#2c3e55';
  ctx.strokeRect(x0, y0, w, h);
  var mx = 16;
  ctx.strokeStyle = '#5b8fd6';
  ctx.beginPath();
  for (var i = 0; i < state.bytesHistory.length; i++) {
    var px = x0 + i / 149 * w;
    var py = y0 + h - Math.min(1, state.bytesHistory[i] / mx) * h;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.fillStyle = '#5b7397';
  ctx.font = '10px monospace';
  ctx.fillText('0', x0 - 10, y0 + h + 3);
  ctx.fillText('16K', x0 - 14, y0 + 10);
  ctx.fillText('带宽历史', x0, y0 + h + 14);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#9db4d0';
  ctx.fillText('绿=10Hz 蓝=2Hz 灰=不发', x, y0 + h + 32);
}

function drawFooter(state, ctx) {
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText('WASD=移动  Q/E=半径  Tab=AOI开关  空格=传送  R=重撒', 16, 500);
  for (var i = 0; i < state.log.length; i++) {
    ctx.fillStyle = i === state.log.length - 1 ? '#ffd479' : '#5b7397';
    ctx.fillText(state.log[i], 16, 520 + i * 14);
  }
  ctx.fillStyle = '#5b7397';
  ctx.fillText('Tab 关掉 AOI:带宽立刻钉死在 16KB/s——200 个实体全发就是这个价钱', 16, 572);
}`
  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>Tab 关掉 AOI：</b>右账本的带宽瞬间钉死 16KB/s，图上所有 NPC 变蓝（全员 10Hz）——这就是「全发」的定价。</li>
  <li><b>再开回来：</b>带宽掉回 1~2KB/s，亮绿的只有圈内一圈——省下的每一 KB 都是玩家感知不到的字节。</li>
  <li><b>贴着圈边走：</b>兴趣集随你流动；走到格子边界那一刻触发一次「重建」（黄圈闪一下）——网格化把重建频率从每帧压到「每跨格一次」。</li>
  <li><b>空格传送：</b>兴趣集整体清空重建——观察圆圈位置突变和那一下重建闪光，这就是入场快照必须全量补发的原因。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：Godot 复制系统的「按需」哲学',
    files: [
      { path: 'modules/multiplayer/multiplayer_spawner.cpp', note: '按需生成实体：只有被追踪/可见的节点才会进入同步——AOI「少发实体」思想的第一道闸门。建议搜索：spawn、track、_track_object。' },
      { path: 'modules/multiplayer/scene_cache_interface.cpp', note: '可见性缓存：节点对哪个 peer「可见」的登记与通知——兴趣集在 Godot 里的真身。建议搜索：visibility、on_visibility_changed、send_ack。' },
      { path: 'modules/multiplayer/scene_replication_interface.cpp', note: '复制协议帧：按可见集合打包状态更新，与可见性通知协同出帧。建议搜索：on_replication_start、_update_sync、visibility。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>AOI 的三件套：格子化维护（重建不贵）、半径+滞回（集合不抖）、优先级分层（带宽随距离骤降）。它与 E2 的增量压缩正交——一个少发实体，一个发小状态，合起来才是大世界网络的全账本。</p>
<ul>
  <li><b>数据怎么流动？</b>玩家位置→跨格检测→重建兴趣集→集合内实体按距离分层→各层按各自频率进同步管线。</li>
  <li><b>所有权归谁？</b>兴趣集归「每个观察者」一份——同一 NPC 对 A 可见对 B 不可见；可见性登记由服务端统一仲裁。</li>
  <li><b>什么时候发生？</b>移动每帧、跨格重建偶发、分层更新按各自节拍——传送是唯一允许「整集重造」的特权时刻。</li>
</ul>`
  }
  ]
};
