// K2 · 程序化音效:振荡器、包络与滤波
export default {
  id: 'K2',
  title: '程序化音效：振荡器、包络与滤波',
  est: '2 小时',
  coreQuestions: [
    '音色三件套「波形+包络+滤波」各塑造声音的哪个维度？',
    '方波为什么是「鼻音复古」、锯齿是「明亮粗糙」？谐波结构说了什么？',
    '低通滤波把截止频率从高拉到低，频谱上发生了什么？',
    '8-bit 游戏机没有采样，凭什么也能做出上千种音效？'
  ],
  sections: [
  {
    type: 'text',
    title: '音色 = 波形 × 包络 × 滤波',
    html: `<p>合成器三件套，缺一不可：</p>
<table>
  <tr><th>部件</th><th>管什么</th><th>关键参数</th></tr>
  <tr><td>振荡器</td><td>给基波与谐波结构</td><td>波形类型 + 基频</td></tr>
  <tr><td>包络 ADSR</td><td>给时间形状</td><td>起音 A / 衰减 D / 延音 S / 释放 R</td></tr>
  <tr><td>滤波器</td><td>给频谱塑形</td><td>截止频率(低通最常用)</td></tr>
</table>
<p><b>波形的差别=谐波结构</b>：正弦只有基波（纯净）；方波只有奇次谐波、幅度按 1/n 衰减（复古鼻音）；锯齿包含全部谐波（明亮粗糙）；三角介于正弦与方波之间（柔和）。低通滤波则像频谱的「砂纸」：截止频率从高拉低，高频谐波逐个消失——锋利变圆润。</p>`
  },
  {
    type: 'text',
    title: '芯片音：8-bit 时代的程序化音频',
    html: `<p>红白机时代没有采样库存，音效全靠<b>振荡器+包络</b>现场合成：「爆机声」=方波+快速下降的音高+急促包络；「拾取叮」=方波两个上行音+短包络。这套「芯片音」美学至今流行——因为它证明了：<b>音色的信息量极小，表现力极大</b>。本课实验按 44100Hz 离线合成 0.6 秒波形，用示波器与谐波条把三件套的作用可视化（WebAudio 不在本平台三件套内，我们「画出声音」）。</p>`
  },
  {
    type: 'lab',
    lab: 'code',
    key: 'synth',
    title: '实验：可视化合成器（波形/包络/滤波三旋钮）',
    height: 620,
    code: `// 空格=触发一个音符(离线合成0.6s)  1/2/3/4=正弦/方/锯/三角
// Q/E=基频半音  Z/X=起音Attack  A/D=延音电平  W=低通档位
// 上=示波器(合成波形)  下=谐波条(频谱:1f~8f)

var FS = 44100, DUR = 0.6;

engine.run({
  setup: function (state) {
    state.wave = 1;              // 1正弦 2方 3锯 4三角
    state.semi = 0;              // 相对 A4 的半音数
    state.attack = 0.02;
    state.sustain = 0.7;
    state.cutoffIdx = 3;         // 0=500 1=2k 2=8k 3=不限
    state.cutoffs = [500, 2000, 8000, 20000];
    state.samples = [];
    state.harm = [];
    state.t = 0;
    state.log = ['空格触发音符;1/2/3/4 切波形对比谐波条'];
  },

  update: function (state, dt, input) {
    state.t += dt;
    if (input.pressed('Digit1')) { state.wave = 1; pushLog(state, '波形:正弦(纯)'); }
    if (input.pressed('Digit2')) { state.wave = 2; pushLog(state, '波形:方波(奇次谐波)'); }
    if (input.pressed('Digit3')) { state.wave = 3; pushLog(state, '波形:锯齿(全谐波)'); }
    if (input.pressed('Digit4')) { state.wave = 4; pushLog(state, '波形:三角(柔和)'); }
    if (input.pressed('KeyQ')) { state.semi--; pushLog(state, '基频 ' + freqOf(state).toFixed(0) + 'Hz'); }
    if (input.pressed('KeyE')) { state.semi++; pushLog(state, '基频 ' + freqOf(state).toFixed(0) + 'Hz'); }
    if (input.pressed('KeyZ')) { state.attack = Math.max(0.005, state.attack - 0.02); pushLog(state, 'Attack=' + Math.round(state.attack * 1000) + 'ms'); }
    if (input.pressed('KeyX')) { state.attack = Math.min(0.3, state.attack + 0.02); pushLog(state, 'Attack=' + Math.round(state.attack * 1000) + 'ms'); }
    if (input.pressed('KeyA')) { state.sustain = Math.max(0.1, state.sustain - 0.15); pushLog(state, 'Sustain=' + state.sustain.toFixed(2)); }
    if (input.pressed('KeyD')) { state.sustain = Math.min(1, state.sustain + 0.15); pushLog(state, 'Sustain=' + state.sustain.toFixed(2)); }
    if (input.pressed('KeyW')) { state.cutoffIdx = (state.cutoffIdx + 1) % 4; pushLog(state, '低通截止=' + state.cutoffs[state.cutoffIdx] + 'Hz'); }
    if (input.pressed('Space')) {
      renderNote(state);
      pushLog(state, '触发音符:合成 ' + state.samples.length + ' 个样本');
    }
    while (state.log.length > 3) state.log.shift();
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    // 示波器
    var x0 = 16, y0 = 56, w = 688, h = 180;
    ctx.fillStyle = '#8fa7c7';
    ctx.font = '12px monospace';
    ctx.fillText('示波器(离线合成 0.6s @44100Hz):', x0, y0 - 8);
    ctx.fillStyle = '#101826';
    ctx.fillRect(x0, y0, w, h);
    ctx.strokeStyle = '#2c3e55';
    ctx.strokeRect(x0, y0, w, h);
    if (state.samples.length) {
      ctx.strokeStyle = '#6ee7b7';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      var skip = Math.max(1, Math.floor(state.samples.length / w));
      for (var i = 0; i < state.samples.length; i += skip) {
        var px = x0 + i / state.samples.length * w;
        var py = y0 + h / 2 - state.samples[i] * (h / 2 - 8);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.lineWidth = 1;
      // 包络轮廓
      ctx.strokeStyle = 'rgba(245,158,11,0.6)';
      ctx.beginPath();
      for (var j = 0; j <= 60; j++) {
        var tt = j / 60 * DUR;
        var ev = envelope(state, tt);
        var ex = x0 + j / 60 * w;
        var ey = y0 + 12 - ev * 8 + 0;
        if (j === 0) ctx.moveTo(ex, y0 + h - 12 - ev * (h / 2 - 12)); else ctx.lineTo(ex, y0 + h - 12 - ev * (h / 2 - 12));
      }
      ctx.stroke();
    }
    // 谐波条
    var hy = 300;
    ctx.fillStyle = '#8fa7c7';
    ctx.fillText('谐波条(1f~8f 相对幅度):', x0, hy - 8);
    ctx.fillStyle = '#131c2b';
    ctx.fillRect(x0, hy, w, 150);
    var n = state.harm.length || 8;
    for (var k2 = 0; k2 < 8; k2++) {
      var amp = k2 < state.harm.length ? Math.min(1, state.harm[k2]) : 0;
      var bh = amp * 140;
      ctx.fillStyle = k2 === 0 ? '#ffd479' : '#5b8fd6';
      ctx.fillRect(x0 + 24 + k2 * 82, hy + 146 - bh, 60, bh);
      ctx.fillStyle = '#5b7397';
      ctx.font = '10px monospace';
      ctx.fillText((k2 + 1) + 'f', x0 + 46 + k2 * 82, hy + 160 - bh - 4 > hy + 10 ? hy + 156 : hy + 156);
      ctx.font = '12px monospace';
    }
    drawHud(state, ctx);
  }
});

// ---------- 合成三件套 ----------

function freqOf(state) {
  return 440 * Math.pow(2, state.semi / 12);
}

function osc(state, ph) {
  // 波形查表:同一相位,四种谐波性格
  if (state.wave === 1) return Math.sin(2 * Math.PI * ph);
  if (state.wave === 2) return Math.sin(2 * Math.PI * ph) >= 0 ? 0.6 : -0.6;
  if (state.wave === 3) return 2 * (ph - Math.floor(ph + 0.5));
  return 2 * Math.abs(2 * (ph - Math.floor(ph + 0.5))) - 1;
}

function envelope(state, t) {
  // ADSR:0.6s 的音符,A 可调,释放固定在最后 0.2s
  var rel = DUR - 0.2;
  if (t < state.attack) return t / state.attack;
  if (t < rel - 0.1) return state.sustain;
  var rt = (t - (rel - 0.1)) / 0.2;
  return state.sustain * (1 - clamp(rt, 0, 1));
}

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

function renderNote(state) {
  var f = freqOf(state);
  var n = Math.floor(FS * DUR);
  var out = new Float32Array(n);
  var lpState = 0;
  var cutoff = state.cutoffs[state.cutoffIdx];
  var alpha = cutoff >= FS / 2 ? 1 : cutoff / (cutoff + FS / 6.28);
  for (var i = 0; i < n; i++) {
    var t = i / FS;
    var raw = osc(state, f * t);
    var env = envelope(state, t);
    var v = raw * env;
    lpState += alpha * (v - lpState);      // 单极点低通:简单的一阶滤波
    out[i] = lpState;
  }
  state.samples = out;
  // 谐波分析:对前 0.4s(延音段)做简化 DFT,取 1f~8f
  var harm = [];
  var ana = Math.floor(FS * 0.4);
  for (var h = 1; h <= 8; h++) {
    var re = 0, im = 0;
    for (var k = 0; k < ana; k += 4) {
      var sv = out[k];
      var ph = 2 * Math.PI * h * f * (k / FS);
      re += sv * Math.cos(ph);
      im -= sv * Math.sin(ph);
    }
    harm.push(Math.sqrt(re * re + im * im) / (ana / 4) * 1.2);
  }
  var mx = 0.001;
  for (var m = 0; m < harm.length; m++) if (harm[m] > mx) mx = harm[m];
  for (var mm = 0; mm < harm.length; mm++) harm[mm] /= mx;
  state.harm = harm;
}

function pushLog(state, s) {
  state.log.push(s);
  if (state.log.length > 3) state.log.shift();
}

function drawHud(state, ctx) {
  var waveName = ['正弦', '方波', '锯齿', '三角'][state.wave - 1];
  ctx.fillStyle = 'rgba(11,15,23,0.92)';
  ctx.fillRect(8, 6, 704, 30);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('波形:' + waveName + '  基频 ' + freqOf(state).toFixed(0) + 'Hz  Attack ' + Math.round(state.attack * 1000) +
    'ms  Sustain ' + state.sustain.toFixed(2) + '  低通 ' + state.cutoffs[state.cutoffIdx] + 'Hz', 16, 26);
  ctx.fillStyle = '#5b7397';
  ctx.font = '11px monospace';
  ctx.fillText('空格=触发音符  1/2/3/4=波形  Q/E=基频  Z/X=Attack  A/D=Sustain  W=低通档', 16, 596);
  ctx.fillStyle = '#ffd479';
  ctx.fillText('橙色轮廓=ADSR包络;谐波条=频谱——低通拉低时,高频条逐个「倒下」', 380, 596);
}`
  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>四种波形各触发一次（1→空格…4→空格）：</b>正弦只有 1f 一根柱、方波 1f/3f/5f/7f 齐刷刷、锯齿 1f~8f 全有、三角只有奇次但衰减更快——「音色=谐波结构」从此可量化。</li>
  <li><b>W 拉低低通：</b>方波的高次谐波条逐个倒下，示波器的「方角」被磨圆——滤波器在频谱上的动作，波形上一眼看出「变钝」。</li>
  <li><b>Z 把 Attack 拉到 200ms：</b>示波器左端从「戛然起音」变成「缓缓涌入」——同一振荡器，包络一改就是弦乐感。</li>
  <li><b>Q/E 半音上下：</b>频谱整体平移——基频决定音高，谐波结构决定「是什么乐器」，两者的分工从此分明。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：效果器三兄弟',
    files: [
      { path: 'servers/audio/effects/audio_effect_filter.cpp', note: '滤音器效果：截止频率/谐振参数如何进 DSP 滤波结构——低通塑形的引擎版。建议搜索：set_cutoff、set_resonance、Filter。' },
      { path: 'servers/audio/effects/eq_filter.cpp', note: '六段 EQ：把频段增益做成滤波器组——「谐波条逐段调音量」的工业实现。建议搜索：EQ6、set_band_cutoff、set_band_gain。' },
      { path: 'servers/audio/effects/audio_effect_distortion.cpp', note: '失真效果：drive 参数对样本做非线性映射——波形「压瘪=谐波增生」的频谱代价。建议搜索：set_drive、process。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>合成器三件套是一台「声音的 3D 打印机」：振荡器打骨架（谐波结构）、包络打时间（生命感）、滤波打磨表面（频谱塑形）。8-bit 时代靠它做出全部声音，今天的音效设计只是在这台机器上叠了采样与卷积。</p>
<ul>
  <li><b>数据怎么流动？</b>参数→振荡器逐样本出波→包络逐样本调制→滤波逐样本塑形→样本数组→（示波器/声卡）。</li>
  <li><b>所有权归谁？</b>参数归音效设计师的面板，样本缓冲是合成的临时产物，效果器只读输入样本产出新样本。</li>
  <li><b>什么时候发生？</b>本课是「按键触发、离线合成」；引擎里是「实时逐缓冲合成」——同一条管线，不同的时间表。</li>
</ul>`
  }
  ]
};
