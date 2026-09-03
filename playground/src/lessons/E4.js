// E4 · 录制与回放:反外挂的引擎地基
export default {
  id: 'E4',
  title: '录制与回放：反外挂的引擎地基',
  est: '2 小时',
  coreQuestions: [
    '只录输入就能重跑全世界，前提条件是什么？',
    '录像为什么录输入而不是录状态？体积差多少？',
    '哈希对账怎么从一条链上指出「作弊发生在第几帧」？',
    '回放的另一个名字为什么叫「时光机」？'
  ],
  sections: [
  {
    type: 'text',
    title: '只录输入，就能重放全世界',
    html: `<p>把一局游戏录下来要多少空间？笨办法是每一帧都存整个世界状态；聪明办法是<b>只存输入</b>：「第 137 帧按了左、第 138 帧什么都没按……」。回放时把这份输入带重新喂给<b>同一个确定性模拟</b>，世界就会一帧不差地重演——前提是 E1 那套地基：固定步长、种子化随机、无挂钟依赖。</p>
<table>
  <tr><th>录像方式</th><th>10 秒的体积（量级）</th><th>能做什么</th></tr>
  <tr><td>录状态</td><td>几十 MB</td><td>只能看</td></tr>
  <tr><td>录输入</td><td>几 KB</td><td>重演、快进、回溯、对账、改一帧看崩盘</td></tr>
</table>`
  },
  {
    type: 'text',
    title: '哈希对账：给「作弊帧」定位',
    html: `<p>回放反外挂的经典流程：服务器也按同样的输入跑一份影子模拟，每 N 帧对世界状态做一次<b>哈希</b>，与客户端上报的哈希链逐格比对——<b>第一个变红的格子，就是作弊（或 bug）发生的那一帧</b>，误差不超过 N 帧。本课实验允许你亲手「篡改录像中的某一帧输入」，然后看着轨迹从篡改点崩开、哈希链从那一格转红——定位原理一次看懂。</p>`
  },
  {
    type: 'lab',
    lab: 'code',
    key: 'replay',
    title: '实验：输入录制回放器（改一步，看全盘崩）',
    height: 620,
    code: `// 方向键=开车  1=开始/停止录制  2=回放  3=篡改模式(方向键选帧,再按3执行翻转)  R=重置
// 回放时橙色幽灵=原局轨迹,白色=回放轨迹,理应完全重合;哈希链每30帧一格

engine.run({
  setup: function (state) {
    resetAll(state);
  },

  update: function (state, dt, input) {
    if (input.pressed('KeyR')) { resetAll(state); return; }
    if (input.pressed('Digit1')) toggleRecord(state);
    if (input.pressed('Digit2')) startReplay(state);
    if (input.pressed('Digit3')) toggleTamper(state);
    var mask = 0;
    if (input.down('ArrowLeft')) mask |= 1;
    if (input.down('ArrowRight')) mask |= 2;
    if (input.down('ArrowUp')) mask |= 4;

    if (state.tamperMode) {
      // 篡改模式:方向键在录像带上移动光标
      if (input.pressed('ArrowLeft')) state.tamperIdx = Math.max(0, state.tamperIdx - 5);
      if (input.pressed('ArrowRight')) state.tamperIdx = Math.min(state.tapeLen - 1, state.tamperIdx + 5);
      if (state.tamperArmed) {
        applyTamper(state);
        state.tamperMode = false;
        state.tamperArmed = false;
        pushLog(state, '已篡改第 ' + state.tamperFrame + ' 帧的输入(左右翻转),按 2 回放看崩盘');
      }
      return;
    }

    if (state.phase === 'replay') {
      // 回放:输入来自录像带,世界重演
      var m = state.tape[state.frame] || 0;
      stepRover(state, m, dt);
      state.frame++;
      if (state.frame % 30 === 0) checkHash(state);
      if (state.frame > state.tapeLen) {
        state.phase = 'ready';
        pushLog(state, state.diverged ? '回放结束:分叉于哈希第 ' + state.divergeCell + ' 格(约第 ' + (state.divergeCell * 30) + ' 帧)' : '回放结束:哈希链全绿,完全重演');
      }
    } else {
      // 实时驾驶(或录制中)
      stepRover(state, mask, dt);
      if (state.phase === 'recording') {
        if (mask !== 0) state.tape[state.frame] = mask;
        state.frame++;
        if (state.frame % 30 === 0) {
          var h = worldHash(state);
          state.hashChain.push({ h: h, ok: true });
        }
      }
    }
  },

  draw: function (ctxState, ctx) {
    var state = ctxState;
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    drawWorld(state, ctx);
    drawPanel(state, ctx);
    drawFooter(state, ctx);
  }
});

// ---------- 确定性小车 ----------

var BOX = 320, OX = 16, OY = 52;

function resetRover(state) {
  state.rx = BOX / 2;
  state.ry = BOX / 2;
  state.heading = -1.5708;
  state.speed = 0;
  state.trail = [[state.rx, state.ry]];
  state.trailTick = 0;
}

function stepRover(state, mask, dt) {
  if (mask & 1) state.heading -= 2.6 * dt;
  if (mask & 2) state.heading += 2.6 * dt;
  if (mask & 4) state.speed += 120 * dt;
  state.speed *= (1 - 0.35 * dt);
  if (state.speed > 130) state.speed = 130;
  state.rx += Math.cos(state.heading) * state.speed * dt;
  state.ry += Math.sin(state.heading) * state.speed * dt;
  if (state.rx < 8) { state.rx = 16 - state.rx; }
  if (state.rx > BOX - 8) { state.rx = 2 * (BOX - 8) - state.rx; }
  if (state.ry < 8) { state.ry = 16 - state.ry; }
  if (state.ry > BOX - 8) { state.ry = 2 * (BOX - 8) - state.ry; }
  state.trailTick++;
  if (state.trailTick % 3 === 0 && state.trail.length < 4000) {
    state.trail.push([state.rx, state.ry]);
  }
}

function worldHash(state) {
  var h = 0;
  h = (Math.imul(h, 31) + (state.rx * 16) | 0) | 0;
  h = (Math.imul(h, 31) + (state.ry * 16) | 0) | 0;
  h = (Math.imul(h, 31) + (state.heading * 1000) | 0) | 0;
  h = (Math.imul(h, 31) + (state.speed * 100) | 0) | 0;
  return h;
}

// ---------- 阶段与录像带 ----------

function resetAll(state) {
  state.phase = 'live';          // live | recording | ready | replay
  state.frame = 0;
  state.tape = {};
  state.tapeLen = 0;
  state.hashChain = [];
  state.replayHashes = [];
  state.diverged = false;
  state.divergeCell = -1;
  state.tamperMode = false;
  state.tamperArmed = false;
  state.tamperIdx = 0;
  state.tamperFrame = -1;
  state.tampered = false;
  state.log = ['方向键开车;按 1 开始录制'];
  resetRover(state);
}

function toggleRecord(state) {
  if (state.phase === 'live' || state.phase === 'ready') {
    resetAll(state);
    state.phase = 'recording';
    state.tape = {};
    state.tapeLen = 0;
    pushLog(state, '录制中:开车吧,再按 1 停止');
  } else if (state.phase === 'recording') {
    state.phase = 'ready';
    var last = 0;
    for (var k in state.tape) { var f = +k; if (f > last) last = f; }
    state.tapeLen = last + 1;
    state.replayHashes = [];
    state.diverged = false;
    state.divergeCell = -1;
    pushLog(state, '录制完成:' + state.tapeLen + ' 帧,稀疏条目 ' + Object.keys(state.tape).length + ' 条≈' + (Object.keys(state.tape).length * 4) + ' 字节,按 2 回放');
  }
}

function startReplay(state) {
  if (state.phase !== 'ready') { pushLog(state, '先录制(按 1)再回放'); return; }
  state.phase = 'replay';
  state.frame = 0;
  state.replayHashes = [];
  state.diverged = false;
  state.divergeCell = -1;
  state.liveTrail = state.trail.slice();
  resetRover(state);
  pushLog(state, state.tampered ? '回放(录像带已被篡改)…' : '回放中:白线应与橙线完全重合');
}

function toggleTamper(state) {
  if (state.phase !== 'ready') { pushLog(state, '篡改要在「录制完成待回放」时进行'); return; }
  if (!state.tamperMode) {
    state.tamperMode = true;
    state.tamperArmed = false;
    state.tamperIdx = Math.floor(state.tapeLen / 2);
    pushLog(state, '篡改模式:方向键选帧(黄针),再按 3 执行左右翻转');
  } else {
    state.tamperArmed = true;
  }
}

function applyTamper(state) {
  var f = state.tamperIdx;
  var old = state.tape[f] || 0;
  var flipped = 0;
  if (old & 1) flipped |= 2; else if (old & 2) flipped |= 1;
  if (old & 4) flipped |= 4;
  state.tape[f] = flipped;
  state.tamperFrame = f;
  state.tampered = true;
}

function checkHash(state) {
  var h = worldHash(state);
  var idx = state.replayHashes.length;
  state.replayHashes.push(h);
  var live = state.hashChain[idx];
  if (state.hashChain.length && live && live.h !== h && !state.diverged) {
    state.diverged = true;
    state.divergeCell = idx;
  }
}

function pushLog(state, s) {
  state.log.push(s);
  if (state.log.length > 3) state.log.shift();
}

// ---------- 绘制 ----------

function drawWorld(state, ctx) {
  ctx.fillStyle = '#101826';
  ctx.fillRect(OX, OY, BOX, BOX);
  ctx.strokeStyle = '#3b4d6b';
  ctx.strokeRect(OX, OY, BOX, BOX);
  // 原局轨迹(橙) 与 回放轨迹(白)
  if (state.liveTrail) {
    ctx.strokeStyle = 'rgba(245,158,11,0.5)';
    ctx.beginPath();
    for (var i = 0; i < state.liveTrail.length; i++) {
      var p = state.liveTrail[i];
      if (i === 0) ctx.moveTo(OX + p[0], OY + p[1]); else ctx.lineTo(OX + p[0], OY + p[1]);
    }
    ctx.stroke();
  }
  if (state.phase === 'replay' && state.trail.length > 1) {
    ctx.strokeStyle = '#e8f4ff';
    ctx.beginPath();
    for (var j = 0; j < state.trail.length; j++) {
      var q = state.trail[j];
      if (j === 0) ctx.moveTo(OX + q[0], OY + q[1]); else ctx.lineTo(OX + q[0], OY + q[1]);
    }
    ctx.stroke();
  }
  // 小车
  ctx.fillStyle = state.phase === 'replay' ? '#e8f4ff' : '#ffd479';
  ctx.beginPath();
  ctx.arc(OX + state.rx, OY + state.ry, 4, 0, 6.2832);
  ctx.fill();
}

function drawPanel(state, ctx) {
  var x = 360, y = 58;
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  var phaseName = { live: '实时驾驶', recording: '● 录制中', ready: '待回放', replay: '回放中' }[state.phase];
  ctx.fillText('阶段:' + phaseName + '  帧 ' + state.frame + '/' + state.tapeLen, x, y);
  var entries = 0;
  for (var k in state.tape) entries++;
  ctx.fillStyle = '#5b7397';
  ctx.fillText('录像带:稀疏 ' + entries + ' 条 ≈ ' + entries * 4 + ' 字节(录状态要 MB 级)', x, y + 20);
  // 哈希链
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('哈希对账链(每 30 帧一格):', x, y + 48);
  var cells = Math.max(state.hashChain.length, state.replayHashes.length);
  for (var i = 0; i < cells; i++) {
    var cx = x + (i % 9) * 38, cy = y + 60 + Math.floor(i / 9) * 40;
    var liveH = state.hashChain[i] ? state.hashChain[i].h : null;
    var repH = state.replayHashes[i];
    var ok = (repH === undefined) || (liveH === null) || (liveH === repH);
    var isDiverge = state.divergeCell === i;
    ctx.fillStyle = isDiverge ? '#7f1d1d' : (repH === undefined ? '#1a2537' : (ok ? '#14301f' : '#7f1d1d'));
    ctx.fillRect(cx, cy, 34, 32);
    ctx.strokeStyle = isDiverge ? '#f87171' : '#3b4d6b';
    ctx.strokeRect(cx, cy, 34, 32);
    ctx.fillStyle = isDiverge ? '#f87171' : (repH === undefined ? '#5b7397' : (ok ? '#6ee7b7' : '#f87171'));
    ctx.font = '10px monospace';
    ctx.fillText(i * 30 + '~' + (i * 30 + 29), cx + 3, cy + 14);
    ctx.fillText(isDiverge ? '分叉!' : (repH === undefined ? '待' : (ok ? '一致' : '异')), cx + 3, cy + 27);
    ctx.font = '12px monospace';
  }
  if (state.diverged) {
    ctx.fillStyle = '#f87171';
    ctx.fillText('首个分叉:第 ' + state.divergeCell + ' 格 → 约 ' + (state.divergeCell * 30) + ' 帧' + (state.tampered ? '(你篡改的是第 ' + state.tamperFrame + ' 帧)' : ''), x, y + 160);
  }
  if (state.tamperMode) {
    var tx = x + (state.tamperIdx % 9) * 38;
    var ty = y + 60 + Math.floor(state.tamperIdx / 9) * 40;
    ctx.strokeStyle = '#ffd479';
    ctx.lineWidth = 2;
    ctx.strokeRect(tx - 2, ty - 2, 38, 36);
    ctx.lineWidth = 1;
    ctx.fillStyle = '#ffd479';
    ctx.fillText('光标:第 ' + state.tamperIdx + ' 帧(←/→ 移动,3=翻转左右输入)', x, y + 176);
  }
}

function drawFooter(state, ctx) {
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText('方向键=开车  1=录制开/停  2=回放  3=篡改模式  R=重置', 360, 596 - 0);
  for (var i = 0; i < state.log.length; i++) {
    ctx.fillStyle = i === state.log.length - 1 ? '#ffd479' : '#5b7397';
    ctx.fillText(state.log[i], 16, 400 + i * 14);
  }
  ctx.fillStyle = '#5b7397';
  ctx.fillText('录状态 vs 录输入的体积差,就是「时光机」的售价差', 16, 450);
  ctx.fillText('轨迹重合=确定性成立;篡改一帧,崩盘从那一帧开始', 16, 466);
}`
  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>录一段 8 秒驾驶：</b>按 1 开始，随意开几秒，再按 1 停止——看右栏「稀疏 N 条 ≈ 几十字节」：没按键的帧一个字节都不花。</li>
  <li><b>按 2 回放：</b>白线沿橙线逐像素重合，哈希链全绿——同一份输入喂同一个确定性世界，世界就肯原样重演。</li>
  <li><b>改一步看全盘崩：</b>按 3 进篡改模式，←/→ 把黄针移到中段某帧，再按 3 执行翻转，然后按 2 回放——轨迹从篡改点岔开，哈希链在那格转红，「首个分叉帧」被点名。这就是反外挂对账的全部原理。</li>
  <li><b>体会体积不变：</b>篡改前后录像带字节数一个不多——证据的体积与行为的体积无关，这正是对账能抓「微小修改」的原因。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：回放的三大支柱',
    files: [
      { path: 'core/input/input.cpp', note: '输入单例：录制系统录的就是从这里流过的离散输入事件——「按帧采样的输入」是回放世界的唯一原料。建议搜索：parse_input_event、action_press、flush_buffered_events。' },
      { path: 'main/main.cpp', note: 'Main::iteration 固定步主循环：回放就是「同一份输入、同一个循环、再来一遍」——循环的确定性是回放确定性的骨架。建议搜索：iteration、fixed_fps。' },
      { path: 'core/math/math_funcs.cpp', note: '平台数学函数：sin/sqrt 的平台差异是回放分叉的隐形源头（回扣 E1），lockstep 与回放引擎都对他严防死守。建议搜索：sin、sqrt、mergesort。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>录制回放把「游戏过程」压缩成「输入序列」，把「验证」变成「重跑+对账」。它同时是三种东西的地下基座：帧同步网游的带宽方案、反外挂的取证机器、以及开发者最爱的 bug 时光机。</p>
<ul>
  <li><b>数据怎么流动？</b>输入帧→稀疏录像带→回放器按帧号取输入→确定性模拟重演→周期哈希→与原局哈希链逐格比对。</li>
  <li><b>所有权归谁？</b>录像带是只读证据（篡改要显式标记）；模拟本身无外部依赖、可整体丢弃重来——它对「重演」毫无意见。</li>
  <li><b>什么时候发生？</b>录制在输入采样点、重演在固定步、对账在每 30 帧边界——全部钉在帧尺上，与时钟无关（回扣 E1 的第三诫）。</li>
</ul>`
  }
  ]
};
