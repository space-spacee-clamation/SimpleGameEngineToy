// L4 · 贴花系统:弹孔怎么贴上去
export default {
  id: 'L4',
  title: '贴花系统：弹孔怎么贴上去',
  est: '2 小时',
  coreQuestions: [
    '弹孔/血迹/涂鸦为什么不直接画进墙面纹理，而要用「投影贴花」？',
    '贴花的三大工程难题——深度冲突、越界渗透、图集预算——各怎么解？',
    '淡出（fade）参数在救哪两个场？',
    '「超过预算最旧的淡出」——这又是哪个老朋友的配方？'
  ],
  sections: [
  {
    type: 'text',
    title: '贴花：往已有表面上「投影」一张小图',
    html: `<p>枪战游戏的墙面满是弹孔血迹，可墙面纹理根本没画过它们——这些痕迹全靠<b>贴花（decal）</b>：命中瞬间生成一个「投影盒」，把小图（弹孔+裂纹）投影贴到表面上。两大流派：</p>
<table>
  <tr><th>流派</th><th>做法</th><th>代价</th></tr>
  <tr><td>投影式（Godot Decal）</td><td>实时投影盒裁剪，不修改原纹理</td><td>灵活可增删；要解决深度冲突/越界</td></tr>
  <tr><td>烘焙式</td><td>直接把贴花画进表面纹理</td><td>永久且免费；毁图集、无法单独移除</td></tr>
</table>`
  },
  {
    type: 'text',
    title: '三大工程难题与「预算」的回归',
    html: `<p><b>①深度冲突（z-fighting）</b>：贴花与墙面共面会闪，解法是沿法线把贴花往外偏移几毫米。<b>②越界渗透</b>：投影盒是方的，墙角/门框会「漂」出贴花的一半——用 fade（按距离衰减）让越界部分淡出。<b>③图集预算</b>：每张贴花都要占图集页的一格，贴多了就要合并/淘汰——<b>超过预算最旧的先淡出</b>，E3 的 LRU 与 E5 的预算思想在贴花系统里第三次会师。</p>`
  },
  {
    type: 'lab',
    lab: 'code',
    key: 'decal',
    title: '实验：2D 投影贴花沙盘（预算 + 越界渗透 + fade）',
    height: 620,
    code: `// 左键=打弹孔  Q/E=投影盒大小  Z/X=淡出距离  W=发光弹孔  空格=连发三发  R=重置
// 贴花上限 12:超预算最旧的淡出;打到门框边缘会「越界渗透」(红圈警告)

var BUDGET = 12;

engine.run({
  setup: function (state) {
    state.decals = [];
    state.size = 26;
    state.fade = 0.5;
    state.glow = false;
    state.seed = 20260903;
    state.rng = mulberry32(state.seed);
    state.age = [];
    state.log = ['左键打弹孔;Q/E 调投影盒,试打门框边缘'];
  },

  update: function (state, dt, input) {
    state.t = (state.t || 0) + dt;
    if (input.pressed('KeyR')) { state.decals = []; state.rng = mulberry32(state.seed); pushLog(state, '墙面已重刷'); }
    if (input.pressed('KeyQ')) { state.size = Math.max(12, state.size - 6); pushLog(state, '投影盒=' + state.size); }
    if (input.pressed('KeyE')) { state.size = Math.min(54, state.size + 6); pushLog(state, '投影盒=' + state.size); }
    if (input.pressed('KeyZ')) { state.fade = Math.max(0.1, state.fade - 0.1); pushLog(state, '淡出距离=' + state.fade.toFixed(1)); }
    if (input.pressed('KeyX')) { state.fade = Math.min(0.9, state.fade + 0.1); pushLog(state, '淡出距离=' + state.fade.toFixed(1)); }
    if (input.pressed('KeyW')) { state.glow = !state.glow; pushLog(state, state.glow ? '发光弹孔:贴花也有自发光通道' : '普通弹孔'); }
    if (input.pressed('Space')) {
      for (var b = 0; b < 3; b++) addDecal(state, 80 + state.rng() * 300, 120 + state.rng() * 300);
    }
    if (input.mouse.down) addDecal(state, input.mouse.x, input.mouse.y);
    // 年龄与淘汰
    for (var i = 0; i < state.decals.length; i++) state.decals[i].t += dt;
    while (state.decals.length > BUDGET) {
      var oldest = state.decals[0];
      oldest.dying = 0;
      state.decals.shift();
      state.decals.push(oldest);
      pushLog(state, '超预算:最旧贴花淡出(LRU)');
    }
    for (var d = state.decals.length - 1; d >= 0; d--) {
      var dc = state.decals[d];
      if (dc.dying !== undefined) {
        dc.dying -= dt;
        if (dc.dying <= 0) state.decals.splice(d, 1);
      }
    }
    while (state.log.length > 3) state.log.shift();
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    drawWall(state, ctx);
    for (var i = 0; i < state.decals.length; i++) {
      drawDecal(state, ctx, state.decals[i]);
    }
    drawHud(state, ctx);
  }
});

// ---------- 墙与贴花 ----------

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawWall(state, ctx) {
  // 砖墙:错缝砖排
  var bh = 26, bw = 54;
  for (var row = 0; row < 21; row++) {
    var off = row % 2 ? bw / 2 : 0;
    for (var col = -1; col < 13; col++) {
      var shade = ((row * 7 + col * 13) % 5) * 0.03;
      ctx.fillStyle = 'rgb(' + Math.floor(120 - shade * 300) + ',' + Math.floor(70 - shade * 120) + ',' + Math.floor(52 - shade * 80) + ')';
      ctx.fillRect(14 + col * bw + off, 10 + row * bh, bw - 2, bh - 2);
    }
  }
  // 门框:贴花「越界渗透」的受害现场
  ctx.fillStyle = '#3d2c17';
  ctx.fillRect(500, 130, 110, 330);
  ctx.fillStyle = '#241a10';
  ctx.fillRect(514, 144, 82, 302);
  ctx.strokeStyle = '#8fa7c7';
  ctx.strokeRect(500, 130, 110, 330);
  ctx.fillStyle = '#5b7397';
  ctx.font = '10px monospace';
  ctx.fillText('门框(立体物)', 516, 478);
}

function addDecal(state, mx, my) {
  if (mx < 10 || mx > 710 || my < 10 || my > 610) return;
  var seed = Math.floor(state.rng() * 1e9);
  var bleeding = mx + state.size / 2 > 498 && mx - state.size / 2 < 612 && my + state.size / 2 > 128 && my - state.size / 2 < 462;
  state.decals.push({ x: mx, y: my, size: state.size, t: 0, glow: state.glow, seed: seed, fade: state.fade, bleeding: bleeding });
  if (bleeding) pushLog(state, '越界渗透:贴花漂过门框边缘(fade 会淡化它)');
}

function drawDecal(state, ctx, d) {
  var dying = d.dying !== undefined ? Math.max(0, d.dying) : 1;
  var fadeAlpha = dying === 1 ? 1 : dying;
  // 外圈:淡出边(fade)
  var rings = 3;
  for (var r = rings; r >= 1; r--) {
    var f = r / rings;
    ctx.globalAlpha = fadeAlpha * (1 - d.fade) * (r === 1 ? 0.9 : 0.35);
    ctx.fillStyle = d.glow ? '#f59e0b' : '#1a1a1a';
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.size / 2 * f, 0, 6.2832);
    ctx.fill();
  }
  // 中心
  ctx.globalAlpha = fadeAlpha;
  ctx.fillStyle = d.glow ? '#fbbf24' : '#000000';
  ctx.beginPath();
  ctx.arc(d.x, d.y, d.size / 5, 0, 6.2832);
  ctx.fill();
  // 放射裂纹(种子化,每颗弹孔的裂纹独一无二)
  var rng = mulberry32(d.seed);
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.lineWidth = 1.2;
  for (var c = 0; c < 6; c++) {
    var a = rng() * 6.2832;
    var len = d.size * (0.4 + rng() * 0.35) * fadeAlpha;
    ctx.beginPath();
    ctx.moveTo(d.x + Math.cos(a) * d.size / 5, d.y + Math.sin(a) * d.size / 5);
    ctx.lineTo(d.x + Math.cos(a) * len, d.y + Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  ctx.globalAlpha = 1;
  // 越界警告
  if (d.bleeding) {
    ctx.strokeStyle = 'rgba(248,113,113,0.8)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.size / 2 + 2, 0, 6.2832);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function pushLog(state, s) {
  state.log.push(s);
  if (state.log.length > 3) state.log.shift();
}

function drawHud(state, ctx) {
  ctx.fillStyle = 'rgba(11,15,23,0.92)';
  ctx.fillRect(8, 6, 704, 30);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('贴花 ' + state.decals.length + '/' + BUDGET + '  投影盒 ' + state.size + 'px(Q/E)  淡出 ' + state.fade.toFixed(1) +
    '(Z/X)  模式:' + (state.glow ? '发光弹孔' : '普通弹孔'), 16, 26);
  ctx.fillStyle = '#5b7397';
  ctx.font = '11px monospace';
  ctx.fillText('左键=打弹孔  空格=连发三发  W=发光  R=重刷墙面', 16, 596);
  ctx.fillStyle = '#ffd479';
  ctx.fillText('贴满 12 个再打一颗:最旧的淡出——「图集预算」是贴花系统的 LRU 课堂', 430, 596);
}`
  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>左键连点墙：</b>弹孔带放射裂纹、边缘渐淡——投影盒+fade 的标准成片；每颗的裂纹因种子不同而独一无二。</li>
  <li><b>把弹孔打在门框边缘：</b>红圈警告「越界渗透」——投影盒是方的，它不管底下有没有立体物，一半贴到框上去了。fade 拉低（Z）能让越界部分更明显、拉高（X）则淡化救场。</li>
  <li><b>贴满预算（打 12+ 颗）：</b>再打新的瞬间，最旧的一颗开始淡出——图集页有限，LRU 淘汰让弹孔「近的新、远的旧」，顺便省了显存。</li>
  <li><b>W 切发光弹孔：</b>自发光通道让弹孔「烫」起来——贴花不只是暗色贴片，它同样可以贡献光。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：Decal 的引擎实现',
    files: [
      { path: 'scene/3d/decal.cpp', note: 'Decal 节点：投影盒尺寸（extents）、纹理通道（albedo/normal/emission）与 fade 参数的家——本课全部旋钮的官方版本。建议搜索：set_size、set_texture、set_fade。' },
      { path: 'servers/rendering/renderer_rd/storage_rd/texture_storage.cpp', note: '渲染后端的贴花管理：decal_allocate 登记与贴花图集（decal atlas）的分页分配——图集预算的现场。建议搜索：decal_allocate、decal_atlas。' },
      { path: 'servers/rendering/renderer_rd/shaders/decal_data_inc.glsl', note: '贴花数据进 shader 的接口：场景着色时按投影盒采样贴花图集。建议搜索：decal、params、interpolate。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>贴花系统的全部工程学：投影盒定义「贴多大」，fade 解决「贴歪了怎么办」，图集预算解决「贴多少」——弹孔虽小，背后是渲染、资产、内存三线合围的调度艺术。</p>
<ul>
  <li><b>数据怎么流动？</b>命中点+法线→投影盒→（越界裁剪/淡出）→图集登记→场景着色时逐像素采样。</li>
  <li><b>所有权归谁？</b>贴花纹理归图集页（共享），投影参数归每个 Decal 实例，淘汰策略归图集预算系统。</li>
  <li><b>什么时候发生？</b>命中瞬间登记、每帧按年龄衰减透明度、超预算 LRU 淘汰——「预算」思想的第 N 次胜利（E3 兴趣集、E5 带宽、D3 内存，这里是图集）。</li>
</ul>`
  }
  ]
};
