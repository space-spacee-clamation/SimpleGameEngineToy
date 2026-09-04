// K3 · 混响与空间声学一瞥
export default {
  id: 'K3',
  title: '混响与空间声学一瞥',
  est: '2 小时',
  coreQuestions: [
    '「房间的签名」是什么？混响尾音为什么能听出澡堂和音乐厅？',
    '卷积混响与算法混响（梳状+全通）各在算什么？',
    '早期反射与后期混响尾巴为什么分开处理？',
    '游戏里混响量随空间切换，是怎么「不穿帮」地过渡的？'
  ],
  sections: [
  {
    type: 'text',
    title: '混响 = 一屋子回声的叠加',
    html: `<p>在浴室唱过歌的人都知道：房间会给声音「签名」。直达声之后，声音在墙面间反复反射，每次都晚一点、弱一点、闷一点——这几百上千个反射叠加成<b>混响尾音（reverb tail）</b>。房间大小（反射间隔）、墙面材质（吸收高频的快慢）、形状（扩散模式）共同决定签名，所以耳朵能分辨澡堂和音乐厅。</p>
<table>
  <tr><th>流派</th><th>做法</th><th>代价</th></tr>
  <tr><td>卷积混响</td><td>拿真实房间的脉冲响应（IR）与信号做卷积</td><td>最真实；计算量大、IR 要实地录</td></tr>
  <tr><td>算法混响</td><td>梳状滤波器（comb）×4 + 全通滤波器（allpass）×2（Schroeder 结构）</td><td>便宜实时；参数难调但够用</td></tr>
</table>`
  },
  {
    type: 'text',
    title: '梳状、全通与游戏里的切换',
    html: `<p><b>梳状滤波器</b>把信号延迟 D 毫秒再叠加回来（带反馈）——频率响应像梳子齿：某些频率被加强、某些被抵消，这就是「金属感」的来源。<b>全通滤波器</b>只改变相位不改幅度，负责把梳齿「打散」成更自然的糊。四个不同长度的梳并联、两个全通串联（Schroeder 1975），就是教科书算法混响。</p>
<p>游戏里更关键的是<b>混响量的调度</b>：角色从街巷走进教堂，混响参数要过渡——大房间里湿声（wet）占比高、干湿比缓慢插值；「定位声学区（reverb zone）」+参数插值，避免穿帮的瞬间跳变。E5 的缓调思想再次出场：一切过渡都要滑。</p>`
  },
  {
    type: 'lab',
    lab: 'code',
    key: 'reverb',
    title: '实验：算法混响沙盘（梳状×4 + 全通×2，脉冲响应可视化）',
    height: 620,
    code: `// 空格=打一个「拍手」脉冲  W=切房间(澡堂/卧室/大厅)  Q/E=干湿比  A=瀑布模式(连续脉冲)
// 上=脉冲响应(IR,房间的签名)  中=原始 vs 混响后波形  下=能量衰减曲线(RT60 直觉)

var ROOMS = [
  { name: '卧室', combs: [29, 37, 41, 47], aps: [17, 23], decay: 0.55 },
  { name: '澡堂', combs: [53, 67, 79, 97], aps: [31, 43], decay: 0.82 },
  { name: '大厅', combs: [131, 149, 173, 197], aps: [89, 113], decay: 0.93 }
];

engine.run({
  setup: function (state) {
    state.room = 2;
    state.wet = 0.4;
    state.mode = 0;              // 0=单次脉冲 1=瀑布
    state.pulseTimer = 0;
    state.rng = mulberry32(20260903);
    state.log = ['空格=拍手脉冲  W=切房间  Q/E=干湿比'];
    renderIR(state);
  },

  update: function (state, dt, input) {
    if (input.pressed('KeyW')) { state.room = (state.room + 1) % 3; renderIR(state); pushLog(state, '房间:' + ROOMS[state.room].name + '(梳长变了,签名就变了)'); }
    if (input.pressed('KeyQ')) { state.wet = Math.max(0, state.wet - 0.1); pushLog(state, '湿声比 ' + Math.round(state.wet * 100) + '%'); }
    if (input.pressed('KeyE')) { state.wet = Math.min(1, state.wet + 0.1); pushLog(state, '湿声比 ' + Math.round(state.wet * 100) + '%'); }
    if (input.pressed('KeyA')) { state.mode = 1 - state.mode; pushLog(state, state.mode === 1 ? '瀑布模式:每 0.5s 一拍' : '单次脉冲'); }
    if (state.mode === 1) {
      state.pulseTimer -= dt;
      if (state.pulseTimer <= 0) { state.pulseTimer = 0.5; renderIR(state); }
    }
    if (input.pressed('Space')) renderIR(state);
    while (state.log.length > 3) state.log.shift();
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    // IR
    var x0 = 16, y0 = 56, w = 688, h = 120;
    ctx.fillStyle = '#8fa7c7';
    ctx.font = '12px monospace';
    ctx.fillText('脉冲响应 IR(' + ROOMS[state.room].name + '的签名:梳×4+全通×2):', x0, y0 - 8);
    ctx.fillStyle = '#101826';
    ctx.fillRect(x0, y0, w, h);
    ctx.strokeStyle = '#2c3e55';
    ctx.strokeRect(x0, y0, w, h);
    for (var i = 0; i < state.ir.length; i++) {
      var v = state.ir[i];
      var bh = Math.abs(v) * (h / 2 - 4);
      ctx.fillStyle = v >= 0 ? '#6ee7b7' : '#f59e0b';
      ctx.fillRect(x0 + i, y0 + h / 2 - (v >= 0 ? bh : 0), 1, bh);
    }
    // 波形对比
    var wy = y0 + h + 34;
    ctx.fillStyle = '#8fa7c7';
    ctx.fillText('原始信号(干) vs 混响后(湿 ' + Math.round(state.wet * 100) + '%):', x0, wy - 8);
    ctx.fillStyle = '#101826';
    ctx.fillRect(x0, wy, w, 110);
    ctx.strokeStyle = '#2c3e55';
    ctx.strokeRect(x0, wy, w, 110);
    for (var k = 0; k < state.dry.length; k++) {
      var px = x0 + k;
      var dy = wy + 55 - state.dry[k] * 50;
      var ry = wy + 55 - state.wetSig[k] * 50;
      ctx.fillStyle = 'rgba(91,143,214,0.5)';
      ctx.fillRect(px, dy, 1, 1);
      ctx.fillStyle = '#ffd479';
      ctx.fillRect(px, ry, 1, 1);
    }
    // 衰减曲线
    var ey = wy + 130;
    ctx.fillStyle = '#8fa7c7';
    ctx.fillText('混响能量衰减(瀑布感来自长尾):', x0, ey - 8);
    ctx.strokeStyle = '#2c3e55';
    ctx.strokeRect(x0, ey, w, 60);
    ctx.strokeStyle = '#f87171';
    ctx.beginPath();
    for (var e = 0; e < state.env.length; e++) {
      var ex = x0 + e / state.env.length * w;
      var eyy = ey + 60 - state.env[e] * 58;
      if (e === 0) ctx.moveTo(ex, eyy); else ctx.lineTo(ex, eyy);
    }
    ctx.stroke();
    drawHud(state, ctx);
  }
});

// ---------- 算法混响:梳×4 + 全通×2 ----------

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 干信号:一个短促拍手(几毫秒的噪声爆发)
function makeDry(state) {
  var rng = mulberry32(20260903);
  var dry = new Float32Array(600);
  for (var i = 0; i < 40; i++) dry[i] = (rng() - 0.5) * 2 * (1 - i / 40);
  return dry;
}

function renderIR(state) {
  var room = ROOMS[state.room];
  state.dry = makeDry(state);
  var net = runNet(state, state.dry);
  state.wetSig = net.wet;
  state.wetOnly = net.wetOnly;
  // IR:单个单位脉冲过同一网络——房间的签名本体
  var imp = new Float32Array(600);
  imp[0] = 1;
  state.ir = runNet(state, imp).wetOnly;
  // 能量衰减曲线(每 4 样本一档的 RMS 近似)
  var env = [];
  for (var e = 0; e < 150; e++) {
    var sum = 0;
    for (var q = 0; q < 4; q++) {
      var idx2 = e * 4 + q;
      if (idx2 < state.wetOnly.length) sum += state.wetOnly[idx2] * state.wetOnly[idx2];
    }
    env.push(Math.sqrt(sum / 4));
  }
  state.env = env;
}

// 梳×4 并联 + 全通×2 串联:混响网络本体(dry 为输入信号)
function runNet(state, dry) {
  var room = ROOMS[state.room];
  var combs = [];
  for (var c = 0; c < room.combs.length; c++) {
    combs.push({ buf: new Float32Array(room.combs[c]), idx: 0, fb: room.decay });
  }
  var aps = [];
  for (var a = 0; a < room.aps.length; a++) {
    aps.push({ buf: new Float32Array(room.aps[a]), idx: 0 });
  }
  var wet = new Float32Array(600);
  var wetOnly = new Float32Array(600);
  for (var i = 0; i < 600; i++) {
    var input = dry[i];
    var acc = 0;
    for (var k = 0; k < combs.length; k++) {
      var cb = combs[k];
      var delayed = cb.buf[cb.idx];
      var outc = input + delayed * cb.fb;
      cb.buf[cb.idx] = outc;
      cb.idx = (cb.idx + 1) % cb.buf.length;
      acc += delayed * 0.25;
    }
    var v = acc;
    for (var m = 0; m < aps.length; m++) {
      var ap = aps[m];
      var d2 = ap.buf[ap.idx];
      var v2 = v + d2 * 0.5;
      ap.buf[ap.idx] = v2 - d2 * 0.5;
      ap.idx = (ap.idx + 1) % ap.buf.length;
      v = v2;
    }
    wetOnly[i] = clamp(v * 1.4, -1, 1);
    wet[i] = clamp(dry[i] * (1 - state.wet) + wetOnly[i] * state.wet * 2.4, -1, 1);
  }
  return { wet: wet, wetOnly: wetOnly };
}

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

function pushLog(state, s) {
  state.log.push(s);
  if (state.log.length > 3) state.log.shift();
}

function drawHud(state, ctx) {
  ctx.fillStyle = 'rgba(11,15,23,0.92)';
  ctx.fillRect(8, 6, 704, 30);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('房间:' + ROOMS[state.room].name + '  梳长 [' + ROOMS[state.room].combs.join(',') + ']  衰减 ' + ROOMS[state.room].decay +
    '  湿声比 ' + Math.round(state.wet * 100) + '%', 16, 26);
  ctx.fillStyle = '#5b7397';
  ctx.font = '11px monospace';
  ctx.fillText('空格=拍手  W=切房间  Q/E=干湿比  A=瀑布模式  蓝=干信号 黄=混响后', 16, 596);
  ctx.fillStyle = '#ffd479';
  ctx.fillText('换房间=换梳长:签名变了,同一记拍手听出三种空间', 430, 596);
}`
  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>空格打一记拍手，看 IR 图：</b>绿黄相间的短刺逐渐稀疏——这就是房间的「签名」；IR 图越密越长，房间听起来越大。</li>
  <li><b>W 在三个房间间切换：</b>同一记拍手，卧室一眨眼收干、大厅拖出长尾——梳状滤波器的延迟长度就是「房间尺寸」的数学化身。</li>
  <li><b>E 把湿声推到 100%：</b>黄线（混响后）完全盖过蓝线（干）——澡堂感拉满；回 40% 是游戏里最常见的「有空间感但不糊」甜点区。</li>
  <li><b>A 开瀑布模式：</b>连续脉冲下观察衰减曲线稳定成形——RT60（能量衰 60dB 的时间）就是这条曲线的工程读法。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：引擎的混响与延迟',
    files: [
      { path: 'servers/audio/effects/audio_effect_reverb.cpp', note: '混响效果：干湿比、房间大小/阻尼等参数到滤波器系数的映射——本课 Schroeder 结构的工业版。建议搜索：set_room_size、wet、combine。' },
      { path: 'servers/audio/effects/reverb_filter.cpp', note: '混响的 DSP 核心：梳状与全通滤波器的实际实现（ReverbWG 结构）。建议搜索：Comb、Allpass、fb。' },
      { path: 'servers/audio/effects/audio_effect_delay.cpp', note: '延迟效果：延迟线的读/写头管理——梳状滤波器的单体细胞。建议搜索：set_delay_ms、buffer。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>混响是「空间的声音签名」：卷积流派拿真实 IR 付算力，算法流派用梳状+全通搭积木。游戏 Audio 设计的核心不是调出完美混响，而是<b>让混响参数跟随空间平滑过渡</b>——声学区的插值又见 E5 的缓调哲学。</p>
<ul>
  <li><b>数据怎么流动？</b>干信号→梳状×4 并联（房间尺寸）→全通×2（打散）→干湿混合→输出；参数（房间/湿比）由空间区域驱动插值。</li>
  <li><b>所有权归谁？</b>混响参数归「声学区」资产，滤波器状态归音频线程逐样本私有——切换房间时参数插值、状态连续。</li>
  <li><b>什么时候发生？</b>逐样本处理永不间断，参数按帧插值——听感连续的秘密依然是「缓」。</li>
</ul>`
  }
  ]
};
