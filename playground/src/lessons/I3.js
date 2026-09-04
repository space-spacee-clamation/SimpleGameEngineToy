// I3 · L-system 与结构生长
export default {
  id: 'I3',
  title: 'L-system 与结构生长',
  est: '2 小时',
  coreQuestions: [
    '一条重写规则凭什么能「长出」一棵树？',
    '龟绘图（turtle graphics）怎么把字符串变成线段？',
    '角度、长度衰减、迭代次数三个旋钮各控制形态的什么？',
    'L-system 和「程序化生成的另一半」（噪声/WFC）分工在哪？'
  ],
  sections: [
  {
    type: 'text',
    title: '重写系统：一行规则长出一棵树',
    html: `<p>L-system 是 1968 年植物学家 Lindenmayer 发明的形式语言，核心只有一句话：<b>每个符号按规则替换成一段新符号，重复迭代</b>。比如「F → F[+F]F[-F]F」：每根枝条都长出五根新枝——迭代 5 次后就是一棵 5 层的树。规则是 DNA，迭代是生长。</p>
<p>生成的符号串交给<b>龟绘图（turtle graphics）</b>翻译成图形：F=前进画线、+/-=转角度、[=记下位置入栈、]=出栈回到记号处。三维的分支、城市的街区、河流的支流——换个规则与角度而已。</p>`
  },
  {
    type: 'text',
    title: '三个旋钮与一张对照表',
    html: `<table>
  <tr><th>旋钮</th><th>管什么</th><th>常见区间</th></tr>
  <tr><td>角度</td><td>枝条开叉的舒展程度</td><td>15°~35°（树）、60°/90°（分形）</td></tr>
  <tr><td>长度衰减</td><td>往末梢逐级变短的比例</td><td>0.6~0.8（越少越纤细）</td></tr>
  <tr><td>迭代次数</td><td>结构复杂度（指数爆炸！）</td><td>3~6 层（字符串长度指数级增长）</td></tr>
</table>
<p>和「程序化生成的另一半」分工明确：<b>噪声</b>管连续的起伏（地形、云），<b>WFC</b> 管邻接拼块（地图/I2），<b>L-system</b> 管递归分支结构（植物、河流、街区、科技树纹样）。三者常组合使用：L-system 长出主干，噪声让枝条抖动。</p>`
  },
  {
    type: 'lab',
    lab: 'code',
    key: 'lsystem',
    title: '实验：龟绘图沙盘（规则/角度/衰减实时调，渐进生长）',
    height: 620,
    code: `// 1=二元树 2=蕨枝 3=六角雪晶  Q/E=角度  Z/X=长度衰减  空格=重新生长  A=迭代+1

var GRAMMARS = [
  { name: '二元树', axiom: 'F', rules: { F: 'F[+F]F[-F]F' }, angle: 25 },
  { name: '蕨枝', axiom: 'X', rules: { X: 'F+[[X]-X]-F[-FX]+X', F: 'FF' }, angle: 22 },
  { name: '六角雪晶', axiom: 'F++F++F', rules: { F: 'F-F++F-F' }, angle: 60 }
];

engine.run({
  setup: function (state) {
    state.g = 0;
    state.angleDeg = GRAMMARS[0].angle;
    state.decay = 0.72;
    state.iters = 4;
    state.progress = 1;
    state.rng = mulberry32(20260903);
    state.log = ['空格=重新生长  1/2/3=换文法'];
    build(state);
  },

  update: function (state, dt, input) {
    if (input.pressed('Digit1') && state.g !== 0) { state.g = 0; state.angleDeg = GRAMMARS[0].angle; build(state); pushLog(state, '文法:二元树'); }
    if (input.pressed('Digit2') && state.g !== 1) { state.g = 1; state.angleDeg = GRAMMARS[1].angle; build(state); pushLog(state, '文法:蕨枝'); }
    if (input.pressed('Digit3') && state.g !== 2) { state.g = 2; state.angleDeg = GRAMMARS[2].angle; build(state); pushLog(state, '文法:六角雪晶'); }
    if (input.pressed('KeyQ')) { state.angleDeg = Math.max(8, state.angleDeg - 2); build(state); pushLog(state, '角度=' + state.angleDeg); }
    if (input.pressed('KeyE')) { state.angleDeg = Math.min(60, state.angleDeg + 2); build(state); pushLog(state, '角度=' + state.angleDeg); }
    if (input.pressed('KeyZ')) { state.decay = Math.max(0.5, state.decay - 0.04); build(state); pushLog(state, '衰减=' + state.decay.toFixed(2)); }
    if (input.pressed('KeyX')) { state.decay = Math.min(0.85, state.decay + 0.04); build(state); pushLog(state, '衰减=' + state.decay.toFixed(2)); }
    if (input.pressed('KeyA')) { if (state.iters < 6) { state.iters++; build(state); pushLog(state, '迭代=' + state.iters + ' (串长 ' + state.strLen + ')'); } }
    if (input.pressed('Space')) { state.progress = 0; pushLog(state, '重新生长'); }
    state.progress = Math.min(1, state.progress + dt * 0.35);
    while (state.log.length > 3) state.log.shift();
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    var visible = Math.floor(state.segs.length * state.progress);
    var maxY = 0, minY = 1e9, maxX = -1e9, minX = 1e9;
    for (var s = 0; s < visible; s++) {
      var seg = state.segs[s];
      if (seg.y1 < minY) minY = seg.y1;
      if (seg.y1 > maxY) maxY = seg.y1;
      if (seg.x1 < minX) minX = seg.x1;
      if (seg.x1 > maxX) maxX = seg.x1;
    }
    for (var i = 0; i < visible; i++) {
      var g = state.segs[i];
      var f = i / Math.max(1, state.segs.length);
      ctx.strokeStyle = 'rgb(' + Math.floor(90 + f * 100) + ',' + Math.floor(160 - f * 60) + ',90)';
      ctx.lineWidth = Math.max(0.6, 3.2 * (1 - f));
      ctx.beginPath();
      ctx.moveTo(g.x1, g.y1);
      ctx.lineTo(g.x2, g.y2);
      ctx.stroke();
    }
    ctx.lineWidth = 1;
    drawHud(state, ctx, visible);
  }
});

// ---------- L-system:字符串重写 + 龟绘图 ----------

function build(state) {
  var gm = GRAMMARS[state.g];
  // 1) 重写
  var str = gm.axiom;
  for (var it = 0; it < state.iters; it++) {
    var out = '';
    for (var c = 0; c < str.length; c++) {
      var ch = str[c];
      out += gm.rules[ch] !== undefined ? gm.rules[ch] : ch;
      if (out.length > 60000) break;
    }
    str = out;
  }
  state.strLen = str.length;
  // 2) 龟绘图
  state.segs = [];
  var ang = -Math.PI / 2;
  var len = 60;
  var x = 360, y = 560;
  var stack = [];
  for (var i = 0; i < str.length; i++) {
    var ch2 = str[i];
    if (ch2 === 'F' || ch2 === 'X' || ch2 === 'G') {
      if (ch2 === 'F' || ch2 === 'G') {
        var nx = x + Math.cos(ang) * len;
        var ny = y + Math.sin(ang) * len;
        state.segs.push({ x1: x, y1: y, x2: nx, y2: ny });
        x = nx; y = ny;
      }
    } else if (ch2 === '+') ang += state.angleDeg * Math.PI / 180;
    else if (ch2 === '-') ang -= state.angleDeg * Math.PI / 180;
    else if (ch2 === '[') { stack.push({ x: x, y: y, a: ang, l: len }); len *= state.decay; }
    else if (ch2 === ']') {
      var st = stack.pop();
      if (!st) break;
      x = st.x; y = st.y; ang = st.a; len = st.l;
    }
  }
  state.progress = state.progress < 1 ? 0 : 1;
}

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
  if (state.log.length > 3) state.log.shift();
}

function drawHud(state, ctx, visible) {
  ctx.fillStyle = 'rgba(11,15,23,0.92)';
  ctx.fillRect(8, 6, 704, 30);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('文法:' + GRAMMARS[state.g].name + '  迭代 ' + state.iters + '  串长 ' + state.strLen +
    '  角度 ' + state.angleDeg + '°  衰减 ' + state.decay.toFixed(2) + '  已生长 ' + Math.floor(state.progress * 100) + '%', 16, 26);
  ctx.fillStyle = '#5b7397';
  ctx.font = '11px monospace';
  ctx.fillText('1/2/3=文法  Q/E=角度  Z/X=长度衰减  A=迭代+1  空格=重新生长', 16, 596);
  ctx.fillStyle = '#ffd479';
  ctx.fillText('当前规则:' + (state.g === 0 ? 'F→F[+F]F[-F]F' : (state.g === 1 ? 'X→F+[[X]-X]-F[-FX]+X ; F→FF' : 'F→F-F++F-F')), 430, 596 - 0 + 0);
}`
  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>空格看「生长」：</b>线段按序点亮——L-system 天然是「从根部往末梢」的顺序，动画白送。</li>
  <li><b>角度旋钮（Q/E）：</b>二元树 25°→12° 变白杨、→40° 变老槐——形态的差异只是开叉角。</li>
  <li><b>衰减旋钮（Z/X）：</b>0.5 时末梢纤细如柳，0.85 时粗壮如橡——枝条长度衰减就是「营养分配」。</li>
  <li><b>迭代 +1（A）：</b>串长从几百跳到几千再跳到几万——指数爆炸让它优雅又危险：迭代 8 次足以卡死任何机器。</li>
  <li><b>切到雪晶（3）：</b>60° 角 + 无衰减 + 无栈——同一套解释器，只是规则不同，长出的却是分形雪花。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：递归结构的容器与路径',
    files: [
      { path: 'core/templates/vector.h', note: '引擎万能容器 Vector：龟绘图的位置栈、重写缓冲全靠它——递归结构与动态数组的黄金组合。建议搜索：push_back、pop、ptrw。' },
      { path: 'scene/resources/curve.cpp', note: '把「生成的点列」资产化为 Curve：L-system 长出的路径可以烘成曲线供相机/巡逻复用。建议搜索：add_point、bake、sample_baked。' },
      { path: 'core/math/geometry_2d.h', note: '2D 几何工具集：生成线段后做相交/包围盒/最近点——L-system 结果落进物理与渲染前的整理工序。建议搜索：segment_intersects、make_atlas。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>L-system 的全部魔法是「重写」：规则即 DNA、迭代即生长、龟绘图即表达。它与噪声（连续起伏）、WFC（邻接拼块）三分程序化生成天下——组合使用才是完全体。</p>
<ul>
  <li><b>数据怎么流动？</b>公理+规则→迭代重写→符号串→龟绘图解释→线段列表→渲染/资产化。</li>
  <li><b>所有权归谁？</b>规则与公理是「设计资产」，符号串与线段是每次生长的派生品——参数一动全部重来（本课每次按键都全量重建，量小无碍）。</li>
  <li><b>什么时候发生？</b>重写与绘制分离：先一次性生成（贵、指数级），再渐进播放（便宜）——「生长动画」只是按序显示已有线段。</li>
</ul>`
  }
  ]
};
