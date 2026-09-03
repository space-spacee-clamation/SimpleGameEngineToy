// E5 · 时间同步与时钟漂移
export default {
  id: 'E5',
  title: '时间同步与时钟漂移',
  est: '2 小时',
  coreQuestions: [
    '两台机器的「现在」凭什么对得上？ping 估偏移的公式错在哪一半？',
    '时钟漂移从哪来？为什么每台机器的晶振都不一样快？',
    '校时为什么不能硬跳？slew（缓调）买到了什么？',
    '网络克隆角色的卡顿，和时间校正有什么关系？'
  ],
  sections: [
  {
    type: 'text',
    title: '两台机器，两台钟',
    html: `<p>网络游戏的「同时」是个奢侈品：每台机器的晶振都有微小频率差（<b>漂移</b>，通常几十到几百 ppm），开机时刻还各不相同（<b>初始偏移</b>）。跑得久了两台钟能差出几十上百毫秒——对「第 N 帧大家同时放技能」的帧同步游戏，这就是灾难。</p>
<p>经典校时法（NTP 思想）：发一个 ping，记下发送时刻 t0 与收到回复的时刻 t1，服务器在回复里盖上自己的钟 t_s。于是<b>偏移估计 = t_s + RTT/2 − t1</b>。它假设「去程=回程」——网络一抖，估计就带着噪声，直接信它就会来回跳。</p>`
  },
  {
    type: 'text',
    title: '硬跳 vs 缓调：校时的两种性格',
    html: `<table>
  <tr><th>策略</th><th>做法</th><th>后果</th></tr>
  <tr><td>硬跳 snap</td><td>客户端钟直接设成估计值</td><td>时间轴瞬间断崖：按客户端钟驱动的角色会瞬移/倒放</td></tr>
  <tr><td>缓调 slew</td><td>临时加速/减速客户端钟（几百 ppm），慢慢滑向正确偏移</td><td>时间轴连续、角色顺滑；收敛需要几秒到几十秒</td></tr>
  <tr><td>放任 none</td><td>不校</td><td>偏移按漂移速率线性恶化</td></tr>
</table>
<p>游戏音频是「双时钟」的教科书案例：游戏以 60fps 产样本、声卡按 48kHz 独立吞样本——两个钟没有主从关系，靠缓冲与重采样互相迁就。网络校时是同一出戏：服务器钟与客户端钟各自走各自的，协议负责让它们「名义上」一致。</p>`
  },
  {
    type: 'lab',
    lab: 'code',
    key: 'clocks',
    title: '实验：双时钟漂移与三种校时策略',
    height: 620,
    code: `// Tab=切换策略(无/硬跳/缓调)  空格=换一组漂移  Q/E=调漂移速率  回车=重置
// 上=服务器钟 下=客户端钟(刻度线滚动)  中图=偏移历史  底部=按客户端钟走动的克隆角色

engine.run({
  setup: function (state) {
    state.t = 0;
    state.mode = 0;              // 0=无同步 1=硬跳 2=缓调
    state.driftPpm = 500;        // 客户端相对服务器每秒快多少 ppm
    state.off = 700;             // 当前偏移 ms(客户端-服务器)
    state.pingTimer = 0;
    state.rtt = 80;
    state.est = 0;
    state.estNoise = 0;
    state.slew = 0;
    state.offHist = [];
    state.jumpMarks = [];
    state.cloneX = 40;
    state.lastOff = 700;
    state.log = ['Tab 切换策略;看克隆角色与偏移图'];
  },

  update: function (state, dt, input) {
    state.t += dt;
    if (input.pressed('Tab')) { state.mode = (state.mode + 1) % 3; state.slew = 0; state.jumpMarks.push({ t: state.t, mode: state.mode }); pushLog(state, ['策略:无同步', '策略:硬跳(注意克隆角色瞬移)', '策略:缓调(几百ppm慢慢滑)'][state.mode]); }
    if (input.pressed('KeyQ')) { state.driftPpm = Math.max(100, state.driftPpm - 100); pushLog(state, '漂移=' + state.driftPpm + 'ppm'); }
    if (input.pressed('KeyE')) { state.driftPpm = Math.min(1200, state.driftPpm + 100); pushLog(state, '漂移=' + state.driftPpm + 'ppm'); }
    if (input.pressed('Space')) { state.off += (state.rng() || 0.5) > 0.5 ? 300 : -300; pushLog(state, '漂移突变:当前偏移 ' + Math.round(state.off) + 'ms'); }
    if (input.pressed('Enter')) { state.off = 700; state.offHist = []; state.jumpMarks = []; state.cloneX = 40; pushLog(state, '重置'); }

    // 漂移:偏移按 ppm 恶化
    state.off += state.driftPpm / 1e6 * dt * 1000 * 8;   // 8 倍时率,让漂移肉眼可见

    // 每 2 秒 ping 一次校时
    state.pingTimer += dt;
    if (state.pingTimer >= 2) {
      state.pingTimer = 0;
      state.rtt = 80 + (sinNoise(state.t * 1.7) + sinNoise(state.t * 0.9 + 5)) * 40;
      var jitter = (sinNoise(state.t * 2.3 + 1) + sinNoise(state.t * 3.1 + 2)) * 25;
      state.est = state.off + jitter;      // NTP 估计:真偏移+路径不对称噪声
      if (state.mode === 1) {
        state.off = state.est;             // 硬跳:直接设钟
        state.jumpMarks.push({ t: state.t, mode: 1 });
      } else if (state.mode === 2) {
        state.slew = clamp(state.est / 8, -300, 300);   // 缓调:目标每秒最多滑 300ms
      }
    }
    if (state.mode === 2) {
      var step = state.slew * dt * 8;
      var remain = state.est - state.off;
      if (Math.abs(step) >= Math.abs(remain) && Math.abs(remain) < 5) { state.off = state.est; state.slew = 0; }
      else state.off += step;
    }
    state.estNoise = state.est - state.off;

    // 克隆角色:按客户端钟的增量走(钟一跳它就抽搐/倒放)
    var dtClient = dt * (1 + state.driftPpm / 1e6 * 8) + (state.off - state.lastOff) / 1000;
    state.lastOff = state.off;
    state.cloneX += 60 * dtClient;
    if (state.cloneX > 690) state.cloneX = 30;

    state.offHist.push(state.off);
    if (state.offHist.length > 300) state.offHist.shift();
    while (state.log.length > 3) state.log.shift();
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    drawTimelines(state, ctx);
    drawChart(state, ctx);
    drawClone(state, ctx);
    drawHud(state, ctx);
  }
});

// ---------- 工具 ----------

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

function sinNoise(x) { return Math.sin(x) * 0.5 + Math.sin(x * 2.7 + 1.3) * 0.3 + Math.sin(x * 6.1 + 2.1) * 0.2; }

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
}

// ---------- 绘制 ----------

function drawTimelines(state, ctx) {
  var y0 = 64, W = 688, x0 = 16;
  // 服务器钟
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText('服务器钟(权威)', x0, y0 - 6);
  ctx.strokeStyle = '#2c3e55';
  ctx.strokeRect(x0, y0, W, 26);
  drawTicks(ctx, x0, y0, W, state.t * 1000, '#5b8fd6');
  // 客户端钟
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('客户端钟(有漂移+偏移)', x0, y0 + 40);
  ctx.strokeStyle = '#2c3e55';
  ctx.strokeRect(x0, y0 + 46, W, 26);
  drawTicks(ctx, x0, y0 + 46, W, (state.t * 1000 + state.off), '#f59e0b');
  // 服务器当前时刻指针
  ctx.strokeStyle = '#6ee7b7';
  ctx.lineWidth = 2;
  var nowPx = x0 + (state.t % 5) / 5 * W;
  ctx.beginPath();
  ctx.moveTo(nowPx, y0);
  ctx.lineTo(nowPx, y0 + 72);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.fillStyle = '#6ee7b7';
  ctx.fillText('↑两边刻度对齐时,钟就同步了;下条相对上条的错位=偏移', x0, y0 + 90);
}

function drawTicks(ctx, x0, y0, W, ms, color) {
  ctx.strokeStyle = color;
  var per = 100;
  var phase = (ms % per) / per;
  for (var i = -1; i < W / 40 + 2; i++) {
    var x = x0 + (i - phase) * 40;
    if (x < x0) continue;
    ctx.beginPath();
    ctx.moveTo(x, y0 + 4);
    ctx.lineTo(x, y0 + 22);
    ctx.stroke();
  }
}

function drawChart(state, ctx) {
  var x0 = 16, y0 = 210, w = 688, h = 170;
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText('偏移历史(ms,客户端-服务器;0 线=完全同步)', x0, y0 - 6);
  ctx.strokeStyle = '#2c3e55';
  ctx.strokeRect(x0, y0, w, h);
  var zeroY = y0 + h / 2;
  ctx.strokeStyle = '#3b4d6b';
  ctx.beginPath();
  ctx.moveTo(x0, zeroY);
  ctx.lineTo(x0 + w, zeroY);
  ctx.stroke();
  // 跳变标记
  for (var m = 0; m < state.jumpMarks.length; m++) {
    var mx = x0 + clamp((state.jumpMarks[m].t - Math.max(0, state.t - 37.5)) / 37.5, 0, 1) * w;
    if (state.jumpMarks[m].t < state.t - 37.5) continue;
    ctx.strokeStyle = state.jumpMarks[m].mode === 1 ? '#f87171' : '#6ee7b7';
    ctx.beginPath();
    ctx.moveTo(mx, y0);
    ctx.lineTo(mx, y0 + h);
    ctx.stroke();
  }
  var n = state.offHist.length;
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  var scale = h / 2 / 1500;
  for (var i = 0; i < n; i++) {
    var px = x0 + i / 299 * w;
    var py = zeroY - clamp(state.offHist[i], -1500, 1500) * scale;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.lineWidth = 1;
  // 估计值点
  var ex = x0 + w - 2;
  ctx.fillStyle = '#6ee7b7';
  ctx.fillRect(ex - 2, zeroY - clamp(state.est, -1500, 1500) * scale - 2, 4, 4);
  ctx.fillStyle = '#5b7397';
  ctx.fillText('+1500ms', x0 + 4, y0 + 14);
  ctx.fillText('-1500ms', x0 + 4, y0 + h - 4);
}

function drawClone(state, ctx) {
  var y = 430;
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText('网络克隆角色(位置完全由客户端钟驱动;钟一跳它就抽搐/倒放):', 16, y - 8);
  ctx.fillStyle = '#101826';
  ctx.fillRect(16, y, 688, 40);
  ctx.strokeStyle = '#2c3e55';
  ctx.strokeRect(16, y, 688, 40);
  ctx.fillStyle = '#e8f4ff';
  ctx.fillRect(state.cloneX - 5, y + 12, 10, 16);
  for (var i = 0; i < 12; i++) {
    ctx.fillStyle = '#1c2739';
    ctx.fillRect(28 + i * 56, y + 30, 2, 8);
  }
}

function drawHud(state, ctx) {
  ctx.fillStyle = 'rgba(11,15,23,0.92)';
  ctx.fillRect(8, 6, 704, 34);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#8fa7c7';
  var modeName = ['无同步', '硬跳', '缓调'][state.mode];
  ctx.fillText('策略:' + modeName + '  真偏移 ' + Math.round(state.off) + 'ms  NTP估计 ' + Math.round(state.est) + 'ms  估计噪声 ±' + Math.abs(Math.round(state.estNoise)) + 'ms  RTT ' + Math.round(state.rtt) + 'ms', 16, 20);
  ctx.fillStyle = '#f59e0b';
  ctx.fillText('漂移 ' + state.driftPpm + 'ppm(Q/E 调)  空格=突变  Tab=换策略', 16, 34);
}`
  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>先看无同步：</b>偏移图一条斜线直奔 ±1500ms——漂移虽小（每秒零点几毫秒），架不住时间不回头。</li>
  <li><b>切硬跳：</b>每 2 秒一次校时，图上出现绿色/红色竖线，偏移被拽回 0 附近——但注意底部的克隆角色：每次硬跳它都抽搐一下甚至倒走两步。钟可以跳，位置不能跳。</li>
  <li><b>切缓调：</b>偏移是平滑的斜坡滑向 0，克隆角色只是轻微变速、绝不倒放——几百 ppm 的临时加速，肉眼无感。</li>
  <li><b>调大漂移（E 到 1200ppm）：</b>缓调的收敛速度跟不上了——这就是「漂移太大需要硬跳兜底」的工程现实。</li>
  <li><b>看估计噪声：</b>NTP 估计点（绿点）永远围着真偏移抖——路径不对称是估计精度的天花板，所以工业方案要做多次采样取最小 RTT。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：引擎里的两台钟',
    files: [
      { path: 'modules/multiplayer/multiplayer_synchronizer.cpp', note: '属性同步器：同步自带时间戳与插值期限——客户端钟上的「显示时间」从哪来、往哪对齐。建议搜索：time_left、SYNC_TIME、delta。' },
      { path: 'scene/main/scene_tree.cpp', note: 'time_scale 缩放的是哪台钟：主循环 dt 与场景树时长的关系——缓调(slew)在引擎里等价于「动态 time_scale」。建议搜索：time_scale、process。' },
      { path: 'servers/audio/audio_rb_resampler.cpp', note: '环形缓冲重采样：游戏钟产样本、声卡钟吞样本，两台无主从关系的钟靠缓冲深度互相迁就——双时钟问题的最老资格案例。建议搜索：resample、read、buffer。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>时间同步 = 估计（ping+RTT/2，永远带噪声）+ 校正（硬跳省事但抽搐、缓调丝滑但慢）+ 接受（漂移永远存在，协议只是让它别太离谱）。所有网络同步的「丝滑感」，本质都是校时策略的性格。</p>
<ul>
  <li><b>数据怎么流动？</b>两台钟各自走→ping 采样估计偏移→校正策略作用于客户端钟→一切按客户端钟驱动的表现层（克隆角色）承担校正的后果。</li>
  <li><b>所有权归谁？</b>服务器钟是唯一权威；客户端钟是「被驯服的本地钟」；表现层只有权读钟、无权改钟。</li>
  <li><b>什么时候发生？</b>采样按秒级周期、缓调每帧连续、硬跳离散瞬间——好策略让玩家感觉「什么都没发生过」。</li>
</ul>`
  }
  ]
};
