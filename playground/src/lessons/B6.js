// B6 · 阴影专题：shadow mapping 的十大坑
export default {
  id: 'B6',
  title: '阴影专题：shadow mapping 的十大坑',
  est: '2.5 小时',
  coreQuestions: [
    '为什么 bias 永远在「漏检」与「误伤」之间走钢丝——normal offset 和 depth bias 各偏的是哪个方向？（数据怎么流动）',
    '光源深度图、shadow atlas、级联切片这些纹理谁分配、谁持有、什么时候回收？（所有权归谁）',
    '从光源渲染一遍、主 pass 投影采样比较、PCF 多次查表——这三步在一帧内的严格顺序是什么？换光源、相机移动时又何时重算？（什么时候发生）'
  ],
  sections: [
    {
      type: 'text',
      title: '一句话原理与标准管线：从光源看一遍世界',
      html: `<p>阴影的全部原理一句话就能说完：<b>从光源的角度再看一遍世界，凡是光源「看不见」的地方就是暗的</b>。难点从来不在原理，而在把它变成 GPU 每帧可算的东西——于是有了 shadow mapping 这条标准管线：</p>
<pre>第 1 趟（光源视角）  把场景按「离光源多远」画进一张深度图（shadow map）
第 2 趟（相机视角）  每个片元把自己变换到光源空间，得到参考深度 z_ref
第 3 步（查表比较）  采样深度图读出 z_map；z_ref 大于 z_map + bias → 被挡 → 打阴
第 4 步（可选软化）  围绕该像素多采几次深度图，取平均 → PCF 软阴影</pre>
<p>三个灵魂拷问在这条管线里长得非常具体。<b>数据怎么流动</b>：一趟深度光栅化产出一张纹理，下一趟把它当普通贴图读——两趟渲染不共享任何内存，只隔着一张图的握手；而「深度」是<b>非线性存储</b>的：透视投影下近处密、远处疏，同一个 texel 的高度误差，在近处和远处差着量级。<b>所有权归谁</b>：深度图不归场景对象持有，而是渲染器内部的资产——方向光的整张 atlas 由 LightStorage 分配、随设置重建；点光/聚光各占 atlas 的一块格子，生命周期跟着灯实例走。<b>什么时候发生</b>：光源 pass 严格排在主 pass 之前且同帧完成（延迟一帧阴影就会「游动」）；灯与相机都没动时深度图整帧复用，级联切片的划分则每帧跟着相机距离重算。</p>
<p>本课把这趟管线拆成十个坑逐个过刀。每个坑都遵守同一个句式：<b>症状 → 病根 → 药方 → 药方的副作用</b>。先上总览，之后逐组展开。</p>`
    },
    {
      type: 'text',
      title: '病灶一：acne 与 peter-panning——bias 这根钢丝',
      html: `<p><b>坑 1：shadow acne（自阴影条纹）。</b>地面明明朝着太阳，却出现一条条斑马纹。病根：深度图以 texel 为粒度量化，地面的采样点和写入点几乎重合，理论上 z_ref 应恰好等于 z_map——但浮点误差加上表面相对 texel 的倾角，让一半像素被判成「在遮挡物后面」。这是<b>深度比较精度不够</b>的病，典型出现在斜面与远处（texel 覆盖的物理面积大）。药方：给比较加一点余量，z_ref 超出 z_map 一段距离才算遮挡。</p>
<p><b>坑 2：peter-panning（物体悬空）。</b>余量加多了反过来发作：脚底那一圈本该在影子里的地面被判成「看得见光源」，阴影和物体脱开，角色像吊了威亚。两个坑共用同一个旋钮，所以 bias 的本质是一句话：<b>在漏检（该黑的没黑）与误伤（不该白的太白）之间走钢丝</b>。固定常数 bias 治不了本，因为误差大小随倾角和距离变化。工业界的主流解法是把偏差拆开：</p>
<table>
  <tr><th>偏差类型</th><th>沿哪个方向挪</th><th>治什么</th><th>代价</th></tr>
  <tr><td>常数 depth bias</td><td>只推深度值</td><td>最粗暴的止血</td><td>近处过大悬空、远处盖不住误差</td></tr>
  <tr><td>slope-scaled</td><td>按表面倾角放大深度偏移</td><td>斜面条纹</td><td>参数难调，陡面易误伤</td></tr>
  <tr><td>normal offset（法线偏差）</td><td>沿法线把采样点在<b>三维空间</b>里挪出去再投影</td><td>acne 主力药，误差随几何自适应</td><td>薄物、高墙后方会「漏光」</td></tr>
  <tr><td>Reversed Shadow Maps</td><td>翻转深度存储方向</td><td>把远处的精度悬崖救回来</td><td>需要引擎级支持</td></tr>
</table>
<p>Godot 4 的主力正是 normal offset：Inspector 里 DirectionalLight3D 的 shadow_normal_bias 单位是「texel 数」，引擎再乘上一个 texel 的世界尺寸换算成长度——这个换算发生在 CPU 侧打包 uniform 的时候，GPU 拿到的已经是世界长度。后面源码走读会亲眼看到这两处。</p>`
    },
    {
      type: 'text',
      title: '病灶二：锯齿与 PCF——把一次比较变成一片投票',
      html: `<p><b>坑 3：分辨率不足的大块锯齿。</b>深度图是有限的格子：一块 texel 覆盖多大世界范围，阴影边界就有多粗。方向光的 texel 覆盖范围 = 级联体积 ÷ 边长 texel 数，近处尚可、远处糊得没法看。</p>
<p><b>坑 4：双线性插值帮不上硬边。</b>有人想：贴图为啥不开 linear filter？开了你会发现它没用——深度图上的「跳变」是两个 texel 之间真实的高度断层，插值只会造出一排中间深度的假值，硬边照样存在。想糊就得<b>在屏幕空间糊</b>：对最终二值的「遮/不遮」结果做多次采样取平均。这就是 <b>PCF</b>（Percentage-Closer Filtering，百分比渐近滤波）：名字里的 percentage-closer 说的就是「邻域里有多大比例落在 closer 一侧」。它软的其实不是深度场，是<b>判决的边界</b>——和主线 L4.4 里 bloom 在屏幕空间糊亮度的思路一脉相承。</p>
<p><b>坑 5：taps 太少出规则图案。</b>早期 PCF 用 3×3 网格 taps，阴影边缘带明显的格状人工纹理；现代做法是圆盘（disk）核 + 每像素随机旋转：核形状均匀铺满圆盘，旋转角由屏幕坐标哈希决定，噪声被打碎成细沙。再加一层时间维：每帧换一个哈希种子（配合 TAA），静态锯齿变成时域噪点，再由抗锯齿顺手抹掉——「用噪声打散规则图案」这一招，你在 J 系列的走样主题里还会反复遇到。</p>
<p>Godot 的对应实现集中在一个 shader 文件里：soft_shadow_kernel / directional_soft_shadow_kernel 是预生成的圆盘核数组，quick_hash 提供逐像素旋转角，samples 为 0 时退化为单 tap 硬阴影——正好对应实验里「采样数」滑杆从 1 拧到 N 的过程。</p>`
    },
    {
      type: 'text',
      title: '病灶三：视野之外——CSM 级联、图集与杂症',
      html: `<p><b>坑 6：一张图罩不住整个视野。</b>方向光平行投影，理论上要覆盖相机视锥的整个世界；把这么大的体积塞进一张 2048² 的图，每块 texel 能盖几十米——阴影彻底糊掉。解法：<b>级联阴影（CSM / PSSM）</b>，沿视线把视锥切成几段，近段用小体积高分辨率，远段用大体积低分辨率，保证「屏幕上每块像素对应的 texel 密度」大致均匀。Godot 默认四段，切片偏移量就是灯属性里的 shadow_split_1..4_offset 四个参数。</p>
<p><b>坑 7：切片接缝。</b>相邻两段的 texel 密度不同，交界处会出现一条可见的「质量断崖」。药方是<b>混合带</b>：在接缝附近一小段范围内同时采样两张切片，按距离插值过渡（blend_splits 开关）；另一派做法是把切片的投影框对齐 texel 网格并随相机稳定，压住「走一步阴影抖一格」的 crawl 现象。</p>
<p><b>坑 8：每盏灯一张图，显存爆炸。</b>点光要六面 cube、聚光要一张透视图，几十个投影灯各发一张深度图根本存不下。工业解法是 <b>shadow atlas</b>：一整张大深度图切成象限、象限再细分格子，每盏灯占一格，按灯的优先级动态调整所属格的 subdivision。Godot 里 atlas 的容量档位、每档的格子布局、以及「装不下就把最大格劈成四倍」的调度逻辑都在 light_storage.cpp；每盏灯写进 uniform 的 uv_rect 就是它在图集里的门牌号，采样端拿它把局部坐标映射回全局 texel。</p>
<p>剩下两个坑归入「杂症」。<b>坑 9 接收者依赖</b>——shadow mapping 判的是「深度图里有没有东西」，所以透明材质默认不投影（alpha 不参与深度光栅化，除非开 alpha 投影或用 shadow_to_opacity），双面墙的正反面在深度图上只留最近那层，薄墙后方可能漏光；Godot 另有 pancake shadow 专治超大范围方向光的深度精度。<b>坑 10 光源半径与接触阴影</b>——现实光源不是点：离遮挡物越远影子边缘越糊（半影），而深度图是个零半径点光源，树根、墙角那种「越贴近越黑」的接触阴影完全出不来。补法一是 penumbra 估计：先在邻域找「比参考深度更近的遮挡物」（blocker），用 blocker 与接收面的距离推出半影宽度再放大采样盘——Godot 的 directional_penumbra_shadow_kernel 就是这条路；补法二是屏幕空间 AO。</p>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'shadow2d',
      title: '实验：2D 阴影投射沙盘——一盏灯、几道墙、三个病灶滑杆',
      height: 600,
      code: `// 2D 阴影投射沙盘：一盏可拖动的灯 + 线段障碍，实时画出本影与半影
// 鼠标在左区按下/拖动 = 移动光源；R = 重新布置障碍（自带种子，结果确定）
// 右侧三个滑杆（在滑杆上按住左右拖）：
//   光源半径 R —— 0 时只有刀锐的本影；R 变大 → 出现半影 = PCF 的几何本质
//   采样数 N   —— 半影里投多少票；N=1 时半影塌回硬边（单 tap 硬阴影）
//   深度偏移 B —— 把遮挡判定整体推远：0 正常，过大 → 影子脱离物体（peter-panning 现场）
// 键盘 1/2/3 = 一键对照三种病症：1 硬阴影 / 2 PCF 软阴影 / 3 bias 过大悬空
// 面板上的「半像素」计数 = percentage closer 的字面含义

var W = 720, H = 440;
var SLIDER_X = 572;            // 右侧滑杆轨道左缘
var PANEL_W = 132;             // 滑杆轨道宽
var SIM_R = 552;               // 仿真区右界

function mulberry32(a) {       // 自带种子的确定性随机数（不用 Math.random）
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function segDist(px, py, ax, ay, bx, by) {  // 点到线段最短距离（= 该像素方向的遮挡深度）
  var abx = bx - ax, aby = by - ay;
  var apx = px - ax, apy = py - ay;
  var tt = abx * abx + aby * aby;
  if (tt <= 0.000001) return Math.sqrt(apx * apx + apy * apy);
  var s = (apx * abx + apy * aby) / tt;
  s = Math.max(0, Math.min(1, s));
  var dx = apx - abx * s, dy = apy - aby * s;
  return Math.sqrt(dx * dx + dy * dy);
}

engine.run({
  setup: function (state) {
    state.seed = 20260903;
    state.light = { x: 190, y: 130 };
    state.sliders = [
      { key: 'radius', v: 0.55 },
      { key: 'taps',   v: 0.45 },
      { key: 'bias',   v: 0.06 }
    ];
    state.dragSlider = -1;
    state.halfCount = 0;
    buildWalls(state);
  },

  update: function (state, dt, input) {
    var i;
    // 灯跟随鼠标（鼠标在仿真区内按下即拖动）
    if (input.mouse.x < SIM_R && input.mouse.down && state.dragSlider < 0) {
      state.light.x = Math.max(8, Math.min(SIM_R - 8, input.mouse.x));
      state.light.y = Math.max(8, Math.min(H - 8, input.mouse.y));
    }
    if (input.pressed('KeyR')) {
      state.seed = (state.seed * 1664525 + 1013904223) | 0;
      buildWalls(state);
    }
    // 滑杆交互：在某根滑杆上按下则拖动它
    for (i = 0; i < 3; i++) {
      var sy = 96 + i * 84;
      if (input.mouse.down && state.dragSlider < 0 && input.mouse.x > SLIDER_X - 12 &&
          input.mouse.y > sy - 16 && input.mouse.y < sy + 26) state.dragSlider = i;
    }
    if (!input.mouse.down) state.dragSlider = -1;
    if (state.dragSlider >= 0) {
      var sv = (input.mouse.x - SLIDER_X) / PANEL_W;
      state.sliders[state.dragSlider].v = Math.max(0, Math.min(1, sv));
    }
    if (input.pressed('Digit1')) preset(state, 0);
    if (input.pressed('Digit2')) preset(state, 1);
    if (input.pressed('Digit3')) preset(state, 2);
  },

  draw: function (state, ctx) {
    var i, j;
    var radius = state.sliders[0].v * 90;                    // 光源半径（像素）
    var taps = 1 + Math.round(state.sliders[1].v * 15);     // 半影内采样数 1..16
    var bias = state.sliders[2].v * 46;                      // 深度偏移（像素）
    var lx = state.light.x, ly = state.light.y;
    var walls = state.walls;

    ctx.fillStyle = '#0b0f17'; ctx.fillRect(0, 0, W, H);

    // ── 光照层：逐格判遮挡，画本影/半影 ──
    var CELL = 4;
    state.halfCount = 0;
    for (var gy = 0; gy < H; gy += CELL) {
      for (var gx = 0; gx < SIM_R; gx += CELL) {
        var cx = gx + CELL * 0.5, cy = gy + CELL * 0.5;
        var ddx = cx - lx, ddy = cy - ly;
        var dist = Math.sqrt(ddx * ddx + ddy * ddy) + 0.0001;
        var minD = 1e9;                                       // 最近的遮挡物距离（≈ z_map）
        for (i = 0; i < walls.length; i++) {
          var wd = segDist(cx, cy, walls[i][0], walls[i][1], walls[i][2], walls[i][3]);
          if (wd < minD) minD = wd;
        }
        var lit = 1;
        if (minD < dist - bias) {                             // 深度比较 + bias
          if (radius < 0.5) {
            lit = 0;                                          // 点光源：非黑即白（硬阴影）
          } else {
            // PCF 的几何版：在半影盘内沿垂直方向撒 taps 针，各自做一次同样的深度比较
            var px = -ddy / dist, py = ddx / dist;            // 垂直于光线的单位向量
            var votes = 0;
            for (j = 0; j < taps; j++) {
              var off = (taps === 1 ? 0 : (j / (taps - 1) - 0.5) * 2 * radius);
              var sx = cx + px * off, sy = cy + py * off;
              var md = 1e9;
              for (i = 0; i < walls.length; i++) {
                var sd = segDist(sx, sy, walls[i][0], walls[i][1], walls[i][2], walls[i][3]);
                if (sd < md) md = sd;
              }
              var sdist = Math.sqrt((sx - lx) * (sx - lx) + (sy - ly) * (sy - ly));
              if (!(md < sdist - bias)) votes++;              // 这针没被挡 → 记一票「见光」
            }
            lit = votes / taps;
            if (lit > 0.02 && lit < 0.98) state.halfCount++;
          }
        }
        var base = 232 * lit * lit + 18;                     // 平方一下更像明暗衰减
        ctx.fillStyle = 'rgb(' + (base * 0.98 | 0) + ',' + (base * 0.93 | 0) + ',' + (base * 0.82 | 0) + ')';
        ctx.fillRect(gx, gy, CELL, CELL);
      }
    }

    // ── 墙体：朝光的涂亮面，背光面留暗 ──
    for (i = 0; i < walls.length; i++) {
      var w = walls[i];
      var mx = (w[0] + w[2]) * 0.5, my = (w[1] + w[3]) * 0.5;
      var toL = Math.atan2(ly - my, lx - mx);
      var nrm = Math.atan2(-(w[3] - w[1]), w[2] - w[0]);
      var face = Math.cos(toL - nrm) > 0 ? 1 : -1;
      ctx.strokeStyle = face > 0 ? '#c9d6ea' : '#5a6a84';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(w[0], w[1]); ctx.lineTo(w[2], w[3]); ctx.stroke();
    }

    // ── 光源：半径可视化 ──
    ctx.fillStyle = '#ffd76a';
    ctx.beginPath(); ctx.arc(lx, ly, Math.max(3, radius * 0.18 + 3), 0, 6.2832); ctx.fill();
    ctx.strokeStyle = 'rgba(255,215,106,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(lx, ly, radius, 0, 6.2832); ctx.stroke();

    // ── 右侧控制面板 ──
    ctx.fillStyle = '#111827'; ctx.fillRect(SLIDER_X - 20, 0, W - SLIDER_X + 20, H);
    ctx.font = '13px monospace';
    ctx.fillStyle = '#8fa7c7';
    ctx.fillText('病灶滑杆', SLIDER_X, 34);
    ctx.fillText('1 硬阴影  2 PCF', SLIDER_X, 52);
    ctx.fillText('3 bias过大', SLIDER_X, 68);
    var names = ['光源半径 R', '采样数 N', '深度偏移 B'];
    var vals = [radius.toFixed(0), String(taps), bias.toFixed(0)];
    var hints = ['0=点光源', '=PCF taps', '悬空警告'];
    for (i = 0; i < 3; i++) {
      var yy = 96 + i * 84;
      ctx.fillStyle = '#9fc3ff'; ctx.fillText(names[i] + ': ' + vals[i], SLIDER_X, yy - 8);
      ctx.fillStyle = '#2f4468'; ctx.fillRect(SLIDER_X, yy, PANEL_W, 6);
      ctx.fillStyle = '#f59e0b'; ctx.fillRect(SLIDER_X + state.sliders[i].v * (PANEL_W - 8), yy - 4, 8, 14);
      ctx.fillStyle = '#5b7397'; ctx.fillText(hints[i], SLIDER_X, yy + 28);
    }
    ctx.fillStyle = '#8fa7c7';
    ctx.fillText('半像素: ' + state.halfCount, SLIDER_X, 356);
    ctx.fillText('(closer 比例)', SLIDER_X, 374);
    ctx.fillStyle = '#5b7397';
    ctx.fillText('鼠标拖灯 / R 换图', SLIDER_X, 404);
  }
});

function preset(state, which) {   // 一键对照三种病症
  if (which === 0) { state.sliders[0].v = 0; state.sliders[1].v = 0; state.sliders[2].v = 0.06; }
  if (which === 1) { state.sliders[0].v = 0.55; state.sliders[1].v = 0.6; state.sliders[2].v = 0.06; }
  if (which === 2) { state.sliders[0].v = 0; state.sliders[1].v = 0; state.sliders[2].v = 0.95; }
}

function buildWalls(state) {     // 用当前种子生成一组线段障碍（确定性）
  var rnd = mulberry32(state.seed >>> 0);
  state.walls = [];
  var cx = 320, cy = 230;
  for (var i = 0; i < 6; i++) {
    var ang = rnd() * 6.2832;
    var len = 60 + rnd() * 130;
    var ox = cx + (rnd() - 0.5) * 300;
    var oy = cy + (rnd() - 0.5) * 220;
    state.walls.push([
      ox - Math.cos(ang) * len * 0.5, oy - Math.sin(ang) * len * 0.5,
      ox + Math.cos(ang) * len * 0.5, oy + Math.sin(ang) * len * 0.5
    ]);
  }
  state.walls.push([240, 330, 460, 300]);   // 固定一道长墙，保证画面里总有一把「大伞」
}
`
    },
    {
      type: 'text',
      title: '沙盘 ↔ shadow map：翻译词典与取舍说明',
      html: `<p>先把翻译词典摆出来——2D 沙盘和真 shadow mapping 是同构的：</p>
<table>
  <tr><th>沙盘里的东西</th><th>shadow mapping 里的对应物</th></tr>
  <tr><td>每格向所有墙取最短距离 minD</td><td>从光源渲染一遍得到的深度图 z_map</td></tr>
  <tr><td>像素到灯的距离 dist</td><td>片元变换到光源空间的参考深度 z_ref</td></tr>
  <tr><td>minD &lt; dist − B 判遮挡</td><td>z_ref &gt; z_map + bias 的深度比较</td></tr>
  <tr><td>半影盘内撒 N 针投票取平均</td><td>PCF：邻域 N taps 的 closer 比例</td></tr>
  <tr><td>「半像素」计数</td><td>percentage closer 的字面数值</td></tr>
  <tr><td>B 拉满后影子脱离墙根</td><td>peter-panning（bias 误伤）</td></tr>
</table>
<p>动手路线建议：先把 R 归零、B 拧小——这就是最早的硬阴影：边界刀锐、贴着墙根呈阶梯锯齿（坑 3）；再把 B 一点点加大，盯住墙根那条缝——先出现斑驳的「假亮斑」（bias 盖 acne 却没盖匀的反面示意），继续加就成了阴影与墙整体脱开的 peter-panning。钢丝的两端你都亲手摸到了。最后拧 R 和 N：R 给出半影锥的<b>几何</b>，N 决定你把这条几何<b>解析</b>到什么程度——R 大而 N 小时半影里全是粗颗粒假条纹，这正是低 taps PCF 的样子。</p>
<p><b>关于第二实验（shader lab）的取舍说明：</b>原计划在 ShaderLab 里再做一版「逐像素连线求交」的解析遮挡。核对平台转译器子集后放弃了：ShaderLab 没有纹理采样（无法真的「查一张深度图」）、main 外不能定义函数、常量数组受限，硬写出来会是循环堆砌的伪 shadow map，教学价值不如上面这个可交互沙盘完整。故本课只保留一个 CodeLab 主实验，请把剩下的功夫花在源码走读上。</p>`
    },
    {
      type: 'source',
      title: '源码走读：Godot 4.8-dev 的阴影管线（四处，各司一职）',
      files: [
        { path: 'servers/rendering/renderer_rd/shaders/scene_forward_lights_inc.glsl', note: 'GPU 端的判决现场。搜 sample_pcf_shadow：sc_soft_shadow_samples()==0 时单 tap 直接 textureProj 比较（=实验里 taps=1 的硬阴影）；否则 quick_hash(gl_FragCoord) 出旋转角，绕 soft_shadow_kernel 圆盘核循环累加取平均（=实验的半影投票）。再看 local_light_process_directional：pos += normal * shadow_normal_bias——法线偏差在这里把采样点沿法线挪出去；omni 分支还有 depth = shadow_len - shadow_bias 的双保险；搜 penumbra 看 blocker 两遍循环的接触阴影。' },
        { path: 'servers/rendering/renderer_rd/storage_rd/light_storage.cpp', note: 'CPU 端打包现场。搜 shadow_normal_bias：light_data.shadow_normal_bias = param × shadow_texel_size——编辑器里那个「texel 数」在这里换算成世界长度，印证「bias 的正确单位是 texel」。再看 light_directional_set_blend_splits（级联接缝混合开关）、update_directional_shadow_atlas 与 _get_directional_shadow_rect（方向光 atlas 按灯数切格子）、shadow_atlas 槽位分配（坑 8 的家）。' },
        { path: 'servers/rendering/renderer_rd/forward_clustered/render_forward_clustered.cpp', note: '帧调度现场。看 _render_shadow_pass：方向光按 p_pass 0..3 选级联切片（PARALLEL_4_SPLITS 时把 atlas 矩形四分之一地挪位），点光走 shadow atlas 的 quadrant+subdivision 定位；搜 use_pancake 看超大范围方向光的 pancake 处理。这一趟跑在主场景 pass 之前——「什么时候发生」的答案就在它的调用点上。' },
        { path: 'servers/rendering/renderer_rd/effects/copy_effects.cpp', note: '附录（坑 10 的另一半）：blur_shadow_atlas 把刚渲染的方向光深度图做高斯模糊——Godot 除 PCF 外还备了「直接糊深度图」这条软化路线（对应实验里 R 大 N 小的粗颗粒对比）；它只在硬件不支持 sampler2DShadow 比较采样时兜底启用。' }
      ]
    },
    {
      type: 'text',
      title: '试一试（课内可选）',
      html: `<ul>
  <li>实验里把 R 拉到最大、N 拉到最小：半影变成一根根粗条纹——低 taps PCF 的规则图案病（坑 5），再慢慢加 N 看条纹如何碎成沙。</li>
  <li>把灯拖到某道墙正上方很近处再拉 B：接触处的阴影最先「断裂悬空」——bias 误差随 texel 覆盖的世界面积放大，这正是 CSM 必须分级的直观理由。</li>
  <li>按 R 换几种布局，找一道「薄而斜」的墙：小 R 时它的影子几乎是一条线；再加点 B，影子整个消失——薄物 + normal offset 的漏光副作用。</li>
  <li>源码验证：在 scene_forward_lights_inc.glsl 里找到 disk_rotation 那几行，确认旋转角来自 gl_FragCoord 而非任何随机纹理——「每像素自己的旋转角」是免费的。</li>
</ul>`
    },
    {
      type: 'text',
      title: '小结',
      html: `<p>十个坑背下来只需一句骨架：<b>shadow mapping 是「拿深度图这张有损照片去回答可见性问题」</b>——照片分辨率不够就锯齿（坑 3、6），量化误差就 acne（坑 1），余量给多就悬空（坑 2），点光源假设丢了半影（坑 10），一张照片装不下全场就得上图集与级联（坑 7、8），而 PCF 承认「判决边界可以在屏幕空间糊」（坑 4、5）。bias 这根钢丝没有最优解，只有随距离、倾角、几何厚度自适应的平衡点——这也是为什么 Godot 把 normal_bias 的单位定成 texel：让偏差跟着照片的颗粒走。</p>
<p>带着这张地图回看主线：L4.3 说渲染器是「数据的搬运与调度」，阴影管线就是最典型的两趟搬运（场景→深度图、深度图→主 pass）；L4.4 的多 pass 链在阴影这里是固定的两站再加一站 PCF。下一步 B7 讲透明排序——同样是「一次渲染产出的数据喂给下一次」，但那次的病名叫做画家算法不可靠。</p>`
    }
  ]
}
