// I4 · 引擎级随机数:种子流与确定性
export default {
  id: 'I4',
  title: '引擎级随机数：种子流与确定性',
  est: '2 小时',
  coreQuestions: [
    'RNG 为什么是状态机而不是「随机」？种子决定什么？',
    '流分离（stream separation）防的是什么事故？',
    '劣质算法的「条纹」在散点图上长什么样？',
    '哪些随机必须可复现、哪些随机故意不可复现？'
  ],
  sections: [
  {
    type: 'text',
    title: 'RNG 是状态机，不是随机',
    html: `<p>计算机里的「随机」全是<b>伪随机</b>：一个状态机，种子决定初始状态，之后每次取数做一次确定性的状态转移——<b>同种子必同序列</b>。这不是缺陷，是帧同步、回放、程序化生成的地基（E1/E4 敢押注的就是它）。</p>
<p>PCG（Godot 的 RandomPCG 默认算法）在 LCG 外加了一层「置换输出」：内部状态照常线性推进，但输出经过位翻转/移位映射，统计性质大幅改善、还支持「跳过 N 步」实现多流。引擎里要分清两类随机：<b>游戏逻辑随机（掉落/暴击/生成）必须种子化可复现</b>；<b>装饰随机（灰尘飘向、屏幕噪点）故意不种子化</b>——免得污染序列。</p>`
  },
  {
    type: 'text',
    title: '流分离：别让「飘落叶」毁掉你的掉落表',
    html: `<table>
  <tr><th>做法</th><th>后果</th></tr>
  <tr><td>全游戏共享一个全局 RNG</td><td>任何新系统的取数都会「插队」，改变之后所有子系统的序列——存档回放全乱</td></tr>
  <tr><td>每子系统独立实例+派生种子（流分离）</td><td>互相零干扰；存档只需存主种子，全部序列可重建</td></tr>
</table>
<p>派生种子的常用手法：主种子 + 子系统 ID 再 hash 一次（如 <code>subSeed = hash(master, 'loot')</code>）。本课实验把「共享流」与「独立流」并排演示：看两条序列被插队的现场。</p>`
  },
  {
    type: 'lab',
    lab: 'code',
    key: 'rng',
    title: '实验：直方图 + 流分离 + 散点条纹（三联沙盘）',
    height: 620,
    code: `// 1=均匀直方图 2=三骰求和 3=双值散点对比  Tab=共享/独立流  C=好/坏算法  Q=重新播种
// 左=直方图 中=流分离现场 右=散点(相邻数对)——劣质算法的条纹藏不住

engine.run({
  setup: function (state) {
    state.mode = 1;              // 1=均匀 2=三骰 3=散点对比
    state.shared = false;
    state.good = true;
    state.master = 20260903;
    state.hist = new Float32Array(24);
    state.streamA = [];
    state.streamB = [];
    state.scatter = [];
    state.rolls = 0;
    state.log = ['同种子=同序列;Q 重新播种验证'];
    reseed(state);
  },

  update: function (state, dt, input) {
    if (input.pressed('Digit1')) { state.mode = 1; state.hist = new Float32Array(24); pushLog(state, '直方图:均匀'); }
    if (input.pressed('Digit2')) { state.mode = 2; state.hist = new Float32Array(24); pushLog(state, '直方图:三骰求和(中心极限)'); }
    if (input.pressed('Digit3')) { state.mode = 3; state.scatter = []; pushLog(state, '散点:相邻数对(r[i],r[i+1])'); }
    if (input.pressed('Tab')) { state.shared = !state.shared; state.streamA = []; state.streamB = []; pushLog(state, state.shared ? '流:共享一个 RNG(危险示范)' : '流:独立实例(流分离)'); }
    if (input.pressed('KeyC')) { state.good = !state.good; state.scatter = []; state.hist = new Float32Array(24); pushLog(state, state.good ? '算法:mulberry32(好)' : '算法:劣质 LCG(条纹警告)'); }
    if (input.pressed('KeyQ')) { reseed(state); pushLog(state, '重新播种 master=' + state.master); }
    // 每帧推进 120 次取数
    for (var i = 0; i < 120; i++) tick(state);
    while (state.log.length > 3) state.log.shift();
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    if (state.mode !== 3) drawHist(state, ctx);
    drawStreams(state, ctx);
    drawScatter(state, ctx);
    drawHud(state, ctx);
  }
});

// ---------- 两种算法:好的与故意写坏的 ----------

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function badLcg(seed) {
  var s = seed % 2147483648;
  return function () {
    s = (s * 65539) % 2147483648;      // RANDU 血统:低三位周期 3,平面条纹
    return s / 2147483648;
  };
}

function makeRng(state, streamId) {
  // 流分离:派生种子=master 异或流 ID 的黄金比例常数
  var seed = (state.master ^ Math.floor(streamId * 2654435761)) | 0;
  return state.good ? mulberry32(seed) : badLcg(Math.abs(seed) % 2147483647 + 1);
}

function reseed(state) {
  state.master = (state.master * 16807 + 1013904223) % 2147483647;
  state.hist = new Float32Array(24);
  state.streamA = [];
  state.streamB = [];
  state.scatter = [];
  state.rolls = 0;
  state.rA = makeRng(state, 1);
  state.rB = makeRng(state, 2);
  state.rShared = makeRng(state, 0);
}

function tick(state) {
  state.rolls++;
  if (state.mode === 3) {
    // 散点:只吃一个流的相邻数对
    var v = nextShared(state);
    state.scatter.push(v);
    if (state.scatter.length > 2) {
      var n = state.scatter.length;
      state.pts = state.pts || [];
      state.pts.push([state.scatter[n - 2], state.scatter[n - 1]]);
      if (state.pts.length > 3000) state.pts.shift();
    }
    return;
  }
  // 流分离演示:A/B 两子系统取数
  var a, b;
  if (state.shared) {
    a = nextShared(state);
    b = nextShared(state);
  } else {
    a = state.rA();
    b = state.rB();
  }
  state.streamA.push(a);
  state.streamB.push(b);
  if (state.streamA.length > 10) state.streamA.shift();
  if (state.streamB.length > 10) state.streamB.shift();
  // 直方图
  var v2;
  if (state.mode === 1) v2 = a;
  else v2 = (Math.floor(a * 6) + 1 + Math.floor(b * 6) + 1 + Math.floor(((a + b) % 1) * 6) + 1) / 18;
  var bin = Math.min(23, Math.floor(v2 * 24));
  state.hist[bin]++;
}

function nextShared(state) {
  return state.shared ? state.rShared() : state.rA();
}

// ---------- 绘制 ----------

function drawHist(state, ctx) {
  var x0 = 16, y0 = 60, w = 210, h = 380;
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText(state.mode === 1 ? '均匀直方图' : '三骰求和直方图', x0, y0 - 10);
  ctx.strokeStyle = '#2c3e55';
  ctx.strokeRect(x0, y0, w, h);
  var mx = 1;
  for (var i = 0; i < 24; i++) if (state.hist[i] > mx) mx = state.hist[i];
  for (var b = 0; b < 24; b++) {
    var bh = state.hist[b] / mx * (h - 10);
    ctx.fillStyle = '#5b8fd6';
    ctx.fillRect(x0 + 4 + b * (w - 8) / 24, y0 + h - bh, (w - 8) / 24 - 2, bh);
  }
  ctx.fillStyle = '#5b7397';
  ctx.font = '10px monospace';
  if (state.mode === 1) ctx.fillText('理想:平顶(均匀)', x0 + 4, y0 + h + 16);
  else ctx.fillText('理想:钟形(中心极限)', x0 + 4, y0 + h + 16);
}

function drawStreams(state, ctx) {
  var x = 260, y = 60;
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText(state.shared ? '共享流(两个系统抢一个 RNG)' : '独立流(各持一个实例)', x, y - 10);
  ctx.fillStyle = '#6ee7b7';
  ctx.fillText('子系统A 最近取数:', x, y + 18);
  for (var i = 0; i < state.streamA.length; i++) {
    ctx.fillStyle = '#a7f3d0';
    ctx.fillText(state.streamA[i].toFixed(3), x, y + 36 + i * 16);
  }
  ctx.fillStyle = '#f59e0b';
  ctx.fillText('子系统B 最近取数:', x + 110, y + 18);
  for (var j = 0; j < state.streamB.length; j++) {
    ctx.fillStyle = '#fcd34d';
    ctx.fillText(state.streamB[j].toFixed(3), x + 110, y + 36 + j * 16);
  }
  if (state.shared) {
    ctx.fillStyle = '#f87171';
    ctx.fillText('↑ 取数被插队,序列互相干扰', x, y + 220);
  } else {
    ctx.fillStyle = '#6ee7b7';
    ctx.fillText('↑ 各取各的,互不影响', x, y + 220);
  }
}

function drawScatter(state, ctx) {
  var x0 = 490, y0 = 60, w = 214, h = 380;
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText('散点:(r[i],r[i+1])', x0, y0 - 10);
  ctx.strokeStyle = '#2c3e55';
  ctx.strokeRect(x0, y0, w, h);
  var pts = state.pts || [];
  for (var i = 0; i < pts.length; i++) {
    ctx.fillStyle = state.good ? 'rgba(110,231,183,0.5)' : 'rgba(248,113,113,0.6)';
    ctx.fillRect(x0 + pts[i][0] * w, y0 + h - pts[i][1] * h, 1.6, 1.6);
  }
  ctx.fillStyle = '#5b7397';
  ctx.font = '10px monospace';
  ctx.fillText(state.good ? '好算法:均匀雾状' : '坏算法:条纹/平面', x0, y0 + h + 16);
}

function drawHud(state, ctx) {
  ctx.fillStyle = 'rgba(11,15,23,0.92)';
  ctx.fillRect(8, 6, 704, 30);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('master=' + state.master + '  取数 ' + state.rolls + ' 次  算法:' + (state.good ? 'mulberry32' : '劣质 LCG') +
    '  流:' + (state.shared ? '共享' : '独立'), 16, 26);
  ctx.fillStyle = '#5b7397';
  ctx.font = '11px monospace';
  ctx.fillText('1/2=直方图模式  3=散点  Tab=共享/独立  C=好/坏算法  Q=重新播种', 16, 596);
  ctx.fillStyle = '#ffd479';
  ctx.fillText('同种子必同序列——按 Q 换种子,按 C 看坏算法的条纹', 430, 596);
}`
  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>Q 重新播种：</b>所有图清空重来——同一 master 之下，直方图形状、散点分布每次都一样；换种子一切重演。这就是「确定性」的可触摸版。</li>
  <li><b>C 切坏算法再按 3：</b>散点从均匀雾状塌成几条斜线/平面——RANDU 血统的著名丑闻：伪随机其实在 3D 空间里躺在一打平面上。</li>
  <li><b>Tab 切共享流：</b>子系统 A 的取数序列被打乱（B 在中间插队）——某天你加了一个「背景飘叶」系统用了全局 RNG，掉落表就悄悄变了样。</li>
  <li><b>2 的三骰直方图：</b>三个均匀骰子相加，钟形自动浮现——中心极限定理的免费演示，伤害公式设计的数学底座。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：Godot 的随机数栈',
    files: [
      { path: 'core/math/random_pcg.cpp', note: 'RandomPCG：Godot 默认 RNG（PCG32），种子+流双参数的状态机，支持跳步实现流分离。建议搜索：set_seed、set_state、rand。' },
      { path: 'core/math/random_number_generator.cpp', note: 'RandomNumberGenerator 封装：randi_range/randfn 等友好 API；种子可序列化——存档存一个 int 就能重建全部随机历史。建议搜索：randi_range、randfn、get_state。' },
      { path: 'core/os/os.cpp', note: '系统熵源：默认种子从 OS 时间来——「播种一次，之后全靠状态机」的分界线就在这里。建议搜索：get_ticks_usec、set_seed。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>引擎级随机的三诫：<b>种子化</b>（游戏逻辑随机必须可复现）、<b>流分离</b>（子系统各持独立实例）、<b>选好算法</b>（PCG/mulberry 起步，别碰 RANDU 血统）。做到这三条，存档、回放、帧同步、程序化生成全部免费获得确定性。</p>
<ul>
  <li><b>数据怎么流动？</b>主种子→派生子种子→各子系统 RNG 实例→序列消费；存档只存主种子与状态机状态。</li>
  <li><b>所有权归谁？</b>RNG 实例归子系统私有（谁污染谁负责），种子归存档/回放系统所有——全局 RNG 是公共领土，谁都想插队。</li>
  <li><b>什么时候发生？</b>播种在开局/读档一次性完成，取数按需进行——绝不在帧循环里重新播种（那会让序列永远停在第一步附近）。</li>
</ul>`
  }
  ]
};
