// K1 · DSP 基础:采样、量化与混叠
export default {
  id: 'K1',
  title: 'DSP 基础：采样、量化与混叠',
  est: '2 小时',
  coreQuestions: [
    '连续的声波怎么变成一串数字？采样和量化各丢失什么？',
    '奈奎斯特为什么是铁律？超过采样率一半的频率去哪了？',
    '「假频率」（混叠）是怎么无中生有的？为什么事后无法补救？',
    '引擎音频里谁在负责「每秒 48000 次」的节拍？'
  ],
  sections: [
  {
    type: 'text',
    title: '采样与量化：两条时间轴上的降级',
    html: `<p>声音是空气压力的连续波动。进计算机要过两道降级：<b>采样</b>（时间上每 1/48000 秒记一次值）与<b>量化</b>（幅度上把连续值四舍五入到 16/24 bit）。采样丢了「两次采样之间」的信息，量化丢了「两个档位之间」的精度——前者处理不好会产生<b>混叠</b>这种假频率，后者表现为温和的底噪。</p>
<p><b>奈奎斯特定理</b>：采样率 f_s 只能无损还原 f_s/2 以下的频率。超过 Nyquist 线的成分不会消失，而是<b>折返</b>：f_signal 折成 |f_signal − k·f_s| 的低频假音——6kHz 的哨音在 8kHz 采样率下变成 2kHz 的嗡嗡声。<b>且事后无法滤除</b>：假频率和真频率在样本里长得一模一样。所以必须在采样前用抗混叠低通滤波器把高频砍掉。</p>`
  },
  {
    type: 'text',
    title: '引擎音频的节拍器',
    html: `<p>游戏以 60fps 跑，声卡按 48kHz 吞样本——<b>两台钟（E5 的老朋友）</b>。引擎的音频线程按固定块（如 512 样本）混合出数据塞进环形缓冲，声卡驱动按自己的节奏取走：缓冲太浅会爆音（underrun），太深则延迟变长。所有音频效果（滤波/EQ/混响）都以「样本」为单位逐个处理——本课的示波器让你看清这个最小单位。</p>`
  },
  {
    type: 'lab',
    lab: 'code',
    key: 'dsp',
    title: '实验：波形合成 + 混叠现场 + 量化阶梯',
    height: 620,
    code: `// Q/E=信号频率  W=切采样率  A=加二次谐波  C=量化开关(3bit)  空格=冻结
// 三层画面:细线=真实连续波  点=采样点  粗线=样本连成的「你听到的波」

var VIEW_MS = 20;                // 时间窗 20ms

engine.run({
  setup: function (state) {
    state.fSig = 300;            // 信号频率 Hz
    state.fs = 8000;             // 采样率
    state.harm2 = false;
    state.quantize = false;
    state.frozen = false;
    state.snap = null;
    state.alias = 0;
    state.log = ['Q/E 调频率:超过奈奎斯特线看假频率'];
  },

  update: function (state, dt, input) {
    if (input.pressed('KeyQ')) { state.fSig = Math.max(100, state.fSig - 150); pushLog(state, '信号 ' + state.fSig + 'Hz'); }
    if (input.pressed('KeyE')) { state.fSig = Math.min(9000, state.fSig + 150); pushLog(state, '信号 ' + state.fSig + 'Hz'); }
    if (input.pressed('KeyW')) { state.fs = state.fs === 8000 ? 22050 : (state.fs === 22050 ? 44100 : 8000); pushLog(state, '采样率 ' + state.fs + 'Hz'); }
    if (input.pressed('KeyA')) { state.harm2 = !state.harm2; pushLog(state, state.harm2 ? '加二次谐波' : '纯基波'); }
    if (input.pressed('KeyC')) { state.quantize = !state.quantize; pushLog(state, state.quantize ? '量化:3bit(8 档)' : '量化:关'); }
    if (input.pressed('Space')) { state.frozen = !state.frozen; if (state.frozen) state.snap = synthWave(state); }
    if (!state.frozen) state.snap = synthWave(state);
    // 混叠频率:折返公式
    var f = state.fSig, fs = state.fs;
    var alias = f % fs;
    state.alias = Math.min(alias, fs - alias);
    while (state.log.length > 3) state.log.shift();
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    var data = state.snap;
    var x0 = 16, y0 = 60, w = 688, h = 260, midY = y0 + h / 2;
    // 连续真实波(细)
    ctx.strokeStyle = 'rgba(91,143,214,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var i = 0; i <= w; i++) {
      var tt = i / w * VIEW_MS / 1000;
      var v = waveAt(state, tt);
      var py = midY - v * (h / 2 - 10);
      if (i === 0) ctx.moveTo(x0 + i, py); else ctx.lineTo(x0 + i, py);
    }
    ctx.stroke();
    // 采样点
    var nS = Math.floor(state.fs * VIEW_MS / 1000);
    var prevY = null;
    for (var s = 0; s <= nS; s++) {
      var ts = s / state.fs;
      var px = x0 + ts / (VIEW_MS / 1000) * w;
      var vs = waveAt(state, ts);
      if (state.quantize) vs = Math.round(vs * 3.5) / 3.5;
      var sy = midY - vs * (h / 2 - 10);
      ctx.fillStyle = '#ffd479';
      ctx.fillRect(px - 2, sy - 2, 4, 4);
      // 样本连线=重建波(粗)
      if (prevY !== null) {
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px - (w / (nS * 1.0)), prevY);
        ctx.lineTo(px, sy);
        ctx.stroke();
        ctx.lineWidth = 1;
      }
      prevY = sy;
    }
    // 量化阶梯参考
    if (state.quantize) {
      ctx.strokeStyle = 'rgba(110,231,183,0.25)';
      for (var q = -3; q <= 3; q++) {
        var qy = midY - q / 3.5 * (h / 2 - 10);
        ctx.beginPath();
        ctx.moveTo(x0, qy);
        ctx.lineTo(x0 + w, qy);
        ctx.stroke();
      }
      ctx.fillStyle = '#6ee7b7';
      ctx.fillText('3bit=8 档:幅度被四舍五入=量化噪声', x0 + 4, y0 + 16);
    }
    // 奈奎斯特线说明
    ctx.fillStyle = '#8fa7c7';
    ctx.font = '12px monospace';
    ctx.fillText('细线=真实连续波   黄点=采样点   橙粗线=样本重建(你听到的)', x0, y0 - 10);
    drawSpectrum(state, ctx);
    drawHud(state, ctx);
  }
});

// ---------- 波形与合成 ----------

function waveAt(state, t) {
  var w = Math.sin(2 * Math.PI * state.fSig * t);
  if (state.harm2) w += 0.5 * Math.sin(2 * Math.PI * state.fSig * 2 * t);
  return w / (state.harm2 ? 1.5 : 1);
}

// 离线合成一个窗口的样本(示波器数据源)
function synthWave(state) {
  var nS = Math.floor(state.fs * VIEW_MS / 1000);
  var samples = [];
  for (var s = 0; s <= nS; s++) {
    var v = waveAt(state, s / state.fs);
    if (state.quantize) v = Math.round(v * 3.5) / 3.5;
    samples.push(v);
  }
  return samples;
}

function pushLog(state, s) {
  state.log.push(s);
  if (state.log.length > 3) state.log.shift();
}

// 简化频谱条:按「能量集中在哪些频率」直接标注(不做完整 FFT,示意频域视角)
function drawSpectrum(state, ctx) {
  var x0 = 16, y0 = 350, w = 688, h = 200;
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText('频域视角(0 ~ ' + state.fs + 'Hz,奈奎斯特线 ' + state.fs / 2 + 'Hz):', x0, y0 - 8);
  ctx.strokeStyle = '#2c3e55';
  ctx.strokeRect(x0, y0, w, h);
  var nyX = x0 + 0.5 * w;
  ctx.strokeStyle = '#f87171';
  ctx.beginPath();
  ctx.moveTo(nyX, y0);
  ctx.lineTo(nyX, y0 + h);
  ctx.stroke();
  ctx.fillStyle = '#f87171';
  ctx.fillText('奈奎斯特 ' + state.fs / 2 + 'Hz', nyX + 4, y0 + 14);
  // 基波与谐波(真实位置或折返位置)
  var spikes = [{ f: state.fSig, amp: 1, real: state.fSig <= state.fs / 2 }];
  if (state.harm2) spikes.push({ f: state.fSig * 2, amp: 0.5, real: state.fSig * 2 <= state.fs / 2 });
  for (var i = 0; i < spikes.length; i++) {
    var sp = spikes[i];
    var folded = sp.f % state.fs;
    var fAlias = Math.min(folded, state.fs - folded);
    var bx = x0 + (fAlias / state.fs) * w;
    var bh = sp.amp * (h - 30);
    ctx.fillStyle = sp.real ? '#6ee7b7' : '#f87171';
    ctx.fillRect(bx - 5, y0 + h - bh, 10, bh);
    ctx.fillStyle = sp.real ? '#a7f3d0' : '#f87171';
    ctx.font = '10px monospace';
    ctx.fillText((sp.f / 1000).toFixed(1) + 'k' + (sp.real ? '' : '→假音' + fAlias.toFixed(0) + 'Hz'), bx - 30, y0 + h - bh - 4);
  }
  ctx.fillStyle = '#5b7397';
  ctx.font = '10px monospace';
  ctx.fillText('绿=落在奈奎斯特内(真频率)  红=已折返成假频率', x0, y0 + h - 6);
}

function drawHud(state, ctx) {
  ctx.fillStyle = 'rgba(11,15,23,0.92)';
  ctx.fillRect(8, 6, 704, 30);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('信号 ' + state.fSig + 'Hz  采样率 ' + state.fs + 'Hz  奈奎斯特 ' + state.fs / 2 + 'Hz  混叠假音 ' +
    Math.round(state.alias) + 'Hz ' + (state.fSig > state.fs / 2 ? '[欠采样!]' : ''), 16, 26);
  ctx.fillStyle = '#5b7397';
  ctx.font = '11px monospace';
  ctx.fillText('Q/E=信号频率  W=采样率  A=二次谐波  C=3bit量化  空格=冻结', 16, 596);
}`
  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>E 把信号推过奈奎斯特线：</b>橙色重建波突然变成一条低频慢波——假频率从天而降；频域视角里基波条「折返」成红色假音。这就是欠采样：高频假装成低频，且无法事后滤除。</li>
  <li><b>W 换 44100 采样率：</b>奈奎斯特线推到 22kHz，9000Hz 的信号安然落线内——采样率是「预算」，频率是「开销」。</li>
  <li><b>C 开 3bit 量化：</b>波形变成 8 档阶梯——幅度精度换成了体积；底噪就是量化误差的听感。</li>
  <li><b>A 加二次谐波：</b>频域多出一根 2 倍频条——波形与频谱的一一对应，就是「音色=谐波结构」的示波器版。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：引擎的音频时钟与频域',
    files: [
      { path: 'servers/audio/audio_server.cpp', note: '音频服务器：混音步进与音频线程——「按样本为单位的固定节拍」从这里分发（回扣 E5 双时钟）。建议搜索：mix_step、_mix_audio、thread。' },
      { path: 'servers/audio/audio_rb_resampler.cpp', note: '环形缓冲重采样：两个采样率之间的转换器——混叠防治的工程现场。建议搜索：resample、rb、offset。' },
      { path: 'servers/audio/effects/audio_effect_spectrum_analyzer.cpp', note: '频谱分析效果：时域样本→频域幅度的窗口化过程——本课频谱条的工业版。建议搜索：spectrum、buffer、fft。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>DSP 的第一课是「有损的艺术」：采样锁时间分辨率、量化锁幅度分辨率，奈奎斯特圈定可表达频率的天花板。混叠之所以危险，是它把高频伪装成低频且不可逆——一切防治都发生在采样之前。</p>
<ul>
  <li><b>数据怎么流动？</b>连续声波→（抗混叠低通）→采样→量化→样本流→效果器逐样本处理→混音→声卡。</li>
  <li><b>所有权归谁？</b>采样率归设备与工程设置，样本缓冲归音频线程，游戏逻辑只递交「要播什么」。</li>
  <li><b>什么时候发生？</b>混音按固定块周期进行、效果逐样本连续、量化在写入瞬间——音频是一台永远不能迟到 1ms 的机器（E5 的双时钟在这里最凶）。</li>
</ul>`
  }
  ]
};
