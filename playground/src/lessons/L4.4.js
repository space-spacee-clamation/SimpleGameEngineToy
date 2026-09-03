// L4.4 · 帧缓冲与后处理：HDR、Bloom 与阴影
export default {
  id: 'L4.4',
  title: '帧缓冲与后处理：HDR、Bloom 与阴影',
  est: '2 小时',
  coreQuestions: [
    '一帧画面的「最终图像」到底在哪里拼出来？为什么是多个全屏 Pass 首尾相接？（数据怎么流动）',
    '场景缓冲、亮度缓冲、模糊缓冲这些中间纹理，谁分配、谁写、谁读、帧末谁回收？（所有权归谁）',
    '为什么顺序必须是「提取高热 → 降采样模糊 → 在 HDR 域合成 → 最后色调映射」，倒过来会失去什么？（什么时候发生）'
  ],
  sections: [
    {
      type: 'text',
      title: '一帧远不止一次绘制：帧缓冲与多 Pass',
      html: `<p>L4.2 留过一条结论：片元着色器是「每像素一个小程序」，它<b>不知道屏幕别处长什么样</b>。可后处理效果偏偏要「看到整帧」：泛光（Bloom/Glow）要感知全画面哪里热、自动曝光要统计平均亮度、抗锯齿要看邻居像素判边缘。一次 draw call 回答不了这些问题。</p>
<p>工业解法简单粗暴：<b>先把整帧画进一张离屏纹理</b>——帧缓冲（framebuffer / RenderTexture），而且是允许像素值超过 1 的 HDR 格式；然后启动一串「全屏三角形 + 片元着色器」的小绘制，每一站都<b>把上一站的输出当输入贴图</b>，逐站加工，最后一站才交给屏幕。所谓后处理管线，就是这条首尾相接的帧缓冲链。</p>
<p>三个灵魂拷问在这里长得非常具体：</p>
<ul>
  <li><b>数据怎么流动</b>——一帧依次路过：场景 HDR → 亮度缓冲 → 若干级模糊缓冲 → 合成缓冲 → 屏幕。谁读谁写，一站一图；</li>
  <li><b>所有权归谁</b>——这些中间纹理不是每帧 new 出来的裸资源：引擎按「附件组合」做缓存复用（Godot 的 framebuffer_cache 与每视口一套 blur 纹理池），帧末统一释放回池子；</li>
  <li><b>什么时候发生</b>——每个 Pass 都有严格的帧内排位（场景画完之后、上屏之前），而且顺序不可逆：先压成 LDR 再泛光，物理上就不对。</li>
</ul>
<p>本课不需要真实贴图：我们在一个片元着色器里用函数<b>程序化生成一张「场景 HDR」</b>，带偏移地调用它就等于「采样上一站的纹理」。改一个 PASS 数字换一站，整条链你亲手彩排一遍，再去对 Godot 的真实调度源码。</p>`
    },
    {
      type: 'lab',
      lab: 'shader',
      key: 'chain',
      title: '实验 1：迷你后处理链——改一个 PASS，从第 0 站走到第 4 站',
      height: 540,
      code: `float4 main(float2 uv : TEXCOORD0) : SV_TARGET {
    // ════════ 可编辑旋钮（改完 Ctrl+Enter 重编译；左下角指示牌亮到第几格 = 第几站）════════
    // PASS：0 场景直出 / 1 亮度提取 / 2 降采样模糊 / 3 Bloom 合成(HDR域) / 4 +色调映射
    #define PASS 3
    const float THRESH = 0.7;   // 亮度提取阈值：低于它的不配发光
    const float RADIUS = 0.03;  // 模糊半径（uv 单位）
    const float BLOOM  = 0.6;   // 泛光强度
    #if PASS < 4
    const float TONE   = 0.0;   // 只有第 4 站用到它：0=ACES 曲线，1=Reinhard
    #endif

    // ════════ 第 0 站的原料：「场景 HDR 缓冲」（程序化生成）════════
    // 真实引擎里这张纹理是场景 Pass 画了半秒的产物，存的是辐射亮度：太阳能到 9，夜空只有 0.01。
    // 这里用一个宏 SCENE(q) 冒充它：给任意坐标 q 返回一个颜色——换成 texture(场景RT, q) 一模一样。
    // 下面所有带偏移的 SCENE(...) 调用，就是在「采样上一站的贴图」——这就是多 Pass 的全部秘密。
    float aspect = u_resolution.x / u_resolution.y;
    float2 aw = float2(aspect, 1.0);                                   // 宽高比校正：圆盘不变椭圆
    float2 p = uv * aw;
    const float3 GROUND = float3(0.004, 0.005, 0.007);                // 地面：黑暗
    float3 SKY = float3(0.010, 0.014, 0.028) + p.y * float3(0.008, 0.012, 0.022);  // 夜空：HDR 里也只千分之几
    float2 sunP = clamp(u_mouse, 0.04, 0.96) * aw;                    // 主光源（高热）：鼠标拖着走
    float2 lampP = float2(0.30, 0.30) * aw + float2(0.030 * sin(u_time * 1.7), 0.012 * cos(u_time * 2.3));   // 油灯：游走摇曳
    float2 emberP = lampP + float2(0.0, -0.13 + 0.02 * sin(u_time * 2.1));          // 火苗：恰好卡在阈值附近
    float2 moonP = float2(0.76, 0.80) * aw;                           // 冷色小球
#define SCENE(q) (lerp(GROUND, SKY, step(0.45, (q).y)) + float3(1.0, 0.62, 0.26) * 9.0 * exp(-dot((q) - sunP, (q) - sunP) * 340.0 * aspect) + float3(1.0, 0.78, 0.42) * 4.5 * exp(-dot((q) - lampP, (q) - lampP) * 6000.0 * aspect) + float3(1.0, 0.45, 0.15) * 1.6 * exp(-dot((q) - emberP, (q) - emberP) * 22000.0 * aspect) + float3(0.62, 0.72, 1.0) * 2.6 * exp(-dot((q) - moonP, (q) - moonP) * 5000.0 * aspect))

    float3 base = SCENE(p);                       // 「读场景纹理」：中心点那一次采样
    float3 col = clamp(base, 0.0, 1.0);           // 第 0 站：HDR 暴力截断成 LDR——高光全炸白

    // —— 以下是后处理链本体：每一段 ≈ 引擎里一整个全屏 Pass ——
    #if PASS >= 1
    // ════ 第 1 站：亮度提取（bright pass）════
    // 整条链的哲学在这一站：后处理不产生新信息，全是对上一张贴图的重采样。
    // 软阈值（knee）让「够不够亮」渐入，避免硬边界在光晕上留下一圈轮廓线。
    float lo = THRESH * 0.6;
    float hi = THRESH * 1.4;
    float3 bright = base * smoothstep(lo, hi, dot(base, float3(0.2126, 0.7152, 0.0722)));
    #endif
    #if PASS == 1
    col = clamp(bright, 0.0, 1.0);                // 只看这张「亮度缓冲」：黑夜全黑，只剩光的内核
    #endif

    #if PASS >= 2
    // ════ 第 2 站：模糊（降采样金字塔的替身）════
    // 真引擎不在全分辨率上半径 0.03 地糊：先缩到 1/2、1/4……逐级高斯（同半径像素数 ÷4，
    // 而低分辨率下同样的核天然覆盖更大的 uv 范围——降采样本身就是最优的低通）。
    // 这里用「一圈圈大步幅重采样 + 呼吸的半径」替身演示：每次 tap 都在重新读上一张图。
    float3 glow = float3(0.0, 0.0, 0.0);
    float tot = 0.0;
    for (int ring = 0; ring < 3; ring++) {        // 环 0=中心 / 1=近环 / 2=远环
        float fr = ring == 0 ? 0.0 : (ring == 1 ? 0.45 : 1.0);
        float wr = exp(-fr * fr * 1.3);
        for (int i = 0; i < 8; i++) {
            float ang = 6.2832 * float(i) / 8.0 + float(ring) * 0.39;   // 每环错开半格，消星形伪影
            float rr = fr * RADIUS * (1.0 + 0.55 * sin(u_time * 1.2 + float(ring)));  // 呼吸 = 各级 mip 在闪
            float2 off = float2(cos(ang), sin(ang)) * rr * aw;
            float3 h = SCENE(p + off);            // ← 这一行就是「采样上一 Pass 的贴图」（在偏移坐标处）
            float lum = dot(h, float3(0.2126, 0.7152, 0.0722));
            glow += h * smoothstep(lo, hi, lum) * wr;   // 提取+模糊 fused：Godot 的 gaussian_glow 第一趟也这么干
            tot += wr;
        }
    }
    glow = glow / max(tot, 0.0001);
    #endif
    #if PASS == 2
    col = clamp(glow, 0.0, 1.0);                  // 只看这张「模糊缓冲」：光被抹成一团晕
    #endif

    #if PASS >= 3
    // ════ 第 3 站：在 HDR 域合成（scene + glow × 强度）════
    // 注意还没 tone map！若先把画面压成 0~1 再加光晕，太阳内核早已全是 1，
    // 泛光只能往白色上叠白色——层次全丢。「先加后压」是铁律（见 tonemap.glsl 的顺序）。
    float3 comp = base + glow * BLOOM;
    #endif
    #if PASS == 3
    col = clamp(comp, 0.0, 1.0);                  // 和第 0 站对比：光晕有了，但高光仍被截断
    #endif

    #if PASS >= 4
    // ════ 第 4 站：tone mapping：把 0.001~十几的辐射亮度压进 0~1 ════
    float3 x = max(comp, float3(0.0, 0.0, 0.0));
    if (TONE < 0.5) {
        col = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);  // ACES 近似（Narkowicz 拟合）
        col = clamp(col, 0.0, 1.0);
    } else {
        col = x / (x + 1.0);                      // Reinhard：无肩部，亮部整体发灰
    }
    #endif

    // ════ 左下角站位指示牌：第 PASS 站亮（纯 UI，不属于渲染链）════
    if (uv.y < 0.11 && uv.x > 0.13) {
        for (int s = 0; s < 5; s++) {
            float cx = 0.155 + float(s) * 0.038;
            float dd = max(abs(uv.x - cx), abs(uv.y - 0.055));
            float cell = 1.0 - smoothstep(0.008, 0.011, dd);
            float lit = (s <= PASS) ? 1.0 : 0.12;
            col += cell * lit * float3(1.0, 0.72, 0.35) * 0.85;
        }
    }

    return float4(clamp(col, 0.0, 1.0), 1.0);
}
`
    },
    {
      type: 'text',
      title: '逐站拆解：为什么链是这么排的',
      html: `<p>把实验 1 的五个站位逐个讲透。每一站的本质都是同一件事：<b>一块小全屏画布，读一张图、写一张图</b>——差别只在读谁、怎么算、写给谁。</p>
<ul>
  <li><b>① 亮度提取（bright pass）</b>：按亮度阈值剪出「够热」的像素。Godot 不单独跑这张图，而是把它融进降采样第一趟（copy_effects.cpp 的 gaussian_glow 第一趟带 luminance_cap / hdr_bleed_threshold——阈值的软硬决定光晕有没有「脏边」）。</li>
  <li><b>② 降采样 + 模糊</b>：高斯的代价约正比于半径²。在全分辨率上半径 64px 的模糊是灾难；先缩到 1/2、1/4、1/8 再各糊一小下，总像素量骤减，等效半径反而更大。Godot 沿 mipmap 链最多 7 级（Environment 的 glow_levels[0..6] 就是各级权重），升采样时双三次插值放大（tonemap.glsl 里的 bicubic 滤镜段）。</li>
  <li><b>③ 合成必须在 tone mapping 之前</b>：泛光是物理现象——镜头里的强光会在传感器/镜片上散射，它叠加发生在「辐射亮度」层面。tonemap.glsl 的 main 写得明明白白：gather_glow → apply_glow（add/screen/softlight…）→ apply_tonemapping。反过来先压后加，高光区已经全是 1，光晕无处着力。</li>
  <li><b>④ Tone mapping 殿后</b>：这是全链唯一一次「有损压缩」，把 HDR 的动态范围折进显示器的 0~1。曲线各有脾气：Reinhard 简单但整体发灰；ACES 有「肩部」——极亮处缓慢趋近纯白，保住色相和高光层次；Filmic/AgX 是另外几种取舍（Godot 的 Environment 里那个下拉框，背后就是 tonemap.glsl 的分支）。</li>
</ul>
<p>顺带一提标题里的「阴影」：暗部细节正是被 tone mapping 曲线的 toe（趾部）照顾的对象——压早了漆黑一团、压晚了灰雾一片；而 Godot 真正的阴影贴图在 shaders/effects/ 目录里同样是「先生成深度图、再多趟滤波、最后作为贴图供场景 Pass 采样」——一模一样的多 Pass 思想，只是数据从颜色换成了深度。</p>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'flow',
      title: '实验 2：帧缓冲流转播放器——看一帧数据怎样逐级搬家',
      height: 520,
      code: `// 帧缓冲数据流播放台：六个 Pass 逐站走，看附件被一张张读过来。
// SPACE 单步 · P 暂停/播放 · R 重置 —— 橙框=这一帧正在写，蓝框=正在被读；光点=数据在流
engine.run({
  setup: function (state) {
    state.step = 0;
    state.time = 0;
    state.auto = true;
  },

  update: function (state, dt, input) {
    if (input.pressed('Space')) { state.auto = false; state.step = (state.step + 1) % 6; state.time = 0; }
    if (input.pressed('KeyP')) state.auto = !state.auto;
    if (input.pressed('KeyR')) { state.step = 0; state.time = 0; state.auto = true; }
    state.time += dt;
    if (state.auto && state.time > 1.6) { state.time = 0; state.step = (state.step + 1) % 6; }
  },

  draw: function (state, ctx) {
    var W = engine.W, H = engine.H;
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, W, H);

    // 附件布局：名字 / 位置 / 内容预览参数（sun/lamp/halo 控制假贴图里亮斑的大小与亮度）
    var N = [
      { name: 'hdr_scene', size: 'full res · 16F', x: 40,  y: 78,  w: 112, h: 84, read: -1, write: 0, sun: 5.0, lamp: 3.0, halo: 0.0, floor: true },
      { name: 'bright',    size: 'full res',       x: 222, y: 86,  w: 88,  h: 66, read: 0,  write: 1, sun: 4.0, lamp: 2.4, halo: 0.0, floor: false },
      { name: 'blur_1/2',  size: 'half res',       x: 372, y: 92,  w: 72,  h: 54, read: 1,  write: 2, sun: 1.4, lamp: 0.9, halo: 0.9, floor: false },
      { name: 'blur_1/4',  size: 'quarter res',    x: 506, y: 98,  w: 56,  h: 42, read: 2,  write: 3, sun: 0.8, lamp: 0.5, halo: 1.4, floor: false },
      { name: 'combine',   size: 'full res · HDR', x: 222, y: 268, w: 96,  h: 72, read: 0,  write: 4, sun: 5.0, lamp: 3.0, halo: 1.6, floor: true, read2: 3 },
      { name: 'screen',    size: 'LDR 0~1',        x: 470, y: 268, w: 96,  h: 72, read: 4,  write: 5, sun: 1.0, lamp: 0.8, halo: 0.7, floor: true }
    ];
    var E = [[0, 1], [1, 2], [2, 3], [0, 4], [3, 4], [4, 5]];
    var INFO = [
      ['Pass 0 · 场景渲染', '全部 draw call 写入：场景 HDR 附件（值域远超 0~1，太阳=9）'],
      ['Pass 1 · 亮度提取', '读 hdr_scene → 写 bright：只留过阈值的高热像素，即 glow 的原料'],
      ['Pass 2 · ½ 降采样模糊', '读 bright → 写 blur_1/2：¼ 的像素做同样功——降采样就是低通'],
      ['Pass 3 · ¼ 降采样模糊', '读 blur_1/2 → 写 blur_1/4：更小更晕，Godot 沿 mipmap 链最多 7 级'],
      ['Pass 4 · Bloom 合成', '读 hdr_scene + blur_1/4 → 写 combine：仍在 HDR 域相加！'],
      ['Pass 5 · 色调映射', '读 combine → 写 screen：最后一步才压回 0~1（ACES/Filmic/Reinhard）']
    ];

    var tt = Math.min(state.time / 1.6, 1);
    var i, e, a, b;

    // 连线：本 Pass 激活的边高亮并跑一个光点
    for (i = 0; i < E.length; i++) {
      e = E[i]; a = N[e[0]]; b = N[e[1]];
      var active = (b.write === state.step);
      ctx.strokeStyle = active ? 'rgba(249,168,37,0.9)' : 'rgba(77,143,214,0.25)';
      ctx.lineWidth = active ? 2 : 1;
      var ax = a.x + a.w, ay = a.y + a.h * 0.5;
      var bx = b.x, by = b.y + b.h * 0.5;
      if (ax > bx) { ax = a.x + a.w * 0.5; ay = a.y + a.h; bx = b.x + b.w * 0.5; by = b.y; }
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      if (active) {
        ctx.beginPath();
        ctx.arc(ax + (bx - ax) * tt, ay + (by - ay) * tt, 4, 0, 6.2832);
        ctx.fillStyle = '#ffd54f'; ctx.fill();
      }
    }

    // 附件方块：底色=内容预览（亮的画亮），描边=这一帧谁在读谁在写
    for (i = 0; i < N.length; i++) {
      var n = N[i];
      ctx.fillStyle = '#0d1322';
      ctx.fillRect(n.x, n.y, n.w, n.h);
      if (n.floor) { ctx.fillStyle = '#05070c'; ctx.fillRect(n.x, n.y + n.h * 0.55, n.w, n.h * 0.45); }
      blob(ctx, n.x + n.w * 0.62, n.y + n.h * 0.34, n.w * 0.10 + n.halo * 9, n.sun, '#ff9a3c');
      blob(ctx, n.x + n.w * 0.26, n.y + n.h * 0.62, n.w * 0.07 + n.halo * 6, n.lamp, '#ffd9a0');
      if (n.halo > 0) blob(ctx, n.x + n.w * 0.62, n.y + n.h * 0.34, n.w * 0.30 + n.halo * 14, 0.5, '#ff7a1a');
      var writing = (n.write === state.step), reading = (n.read === state.step || n.read2 === state.step);
      ctx.strokeStyle = writing ? '#ffb74d' : (reading ? '#4fa0d6' : '#243149');
      ctx.lineWidth = (writing || reading) ? 3 : 1;
      ctx.strokeRect(n.x - 2, n.y - 2, n.w + 4, n.h + 4);
      ctx.lineWidth = 1;
      ctx.fillStyle = writing ? '#e8b04b' : (reading ? '#7fb3e0' : '#8aa2c0');
      ctx.font = '13px monospace';
      ctx.fillText(n.name, n.x, n.y - 8);
      ctx.fillStyle = '#5b6c8c';
      ctx.font = '11px monospace';
      ctx.fillText(n.size, n.x, n.y + n.h + 14);
      if (writing) { ctx.fillStyle = '#ffb74d'; ctx.fillText('← 写 WRITE', n.x + n.w + 8, n.y + 12); }
      if (reading) { ctx.fillStyle = '#4fa0d6'; ctx.fillText('读 READ', n.x + n.w + 8, n.y + 28); }
    }

    // HUD：当前 Pass 的名字与一句话说明
    ctx.fillStyle = '#e8b04b';
    ctx.font = '15px sans-serif';
    ctx.fillText(INFO[state.step][0], 16, 40);
    ctx.fillStyle = '#9db4d0';
    ctx.font = '13px sans-serif';
    ctx.fillText(INFO[state.step][1], 16, 60);
    ctx.fillStyle = '#5b6c8c';
    ctx.font = '12px monospace';
    ctx.fillText('SPACE 单步 · P 播放/暂停 · R 重置' + (state.auto ? '（自动播放中）' : '（已暂停）'), 16, H - 14);
  }
});

function blob(ctx, x, y, r, strength, color) {
  if (strength <= 0.01) return;
  ctx.globalAlpha = Math.min(strength / 5.0, 1.0);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(r, 2), 0, 6.2832);
  ctx.fill();
  ctx.globalAlpha = 1;
}
`
    },
    {
      type: 'text',
      title: 'HDR 是什么，以及最后那一下「压」掉了什么',
      html: `<p>「HDR 缓冲」不是说颜色更鲜艳，而是说<b>像素是一个可以超过 1 的亮度值</b>：物理光度学里蜡烛约 1cd/m²、晴天路面 2000+、太阳 16 亿——游戏不必这么极端，但「太阳比墙面亮几十倍」这个量级关系必须留住，否则一切依赖亮度的后期（泛光、自动曝光、景深的光斑）都无从谈起。所以现代引擎的场景缓冲通常是 RGBA16F：每通道 16 位浮点，一帧全屏就是几十 MB 的带宽大户。</p>
<p>显示器只认 0~1。<b>Tone mapping 是全链唯一的有损环节</b>：一条单调递增曲线把 [0, 白点] 映到 [0,1]，三种典型脾气——</p>
<table>
  <tr><th>曲线</th><th>公式骨架</th><th>性格</th></tr>
  <tr><td>Linear + clamp</td><td>min(x, 1)</td><td>最偷懒：高光炸成纯白洞，色彩全丢（实验 1 的第 0 站）</td></tr>
  <tr><td>Reinhard</td><td>x/(1+x)</td><td>温和不死白，但没有「肩」，整幅偏灰、亮部褪色</td></tr>
  <tr><td>Filmic / ACES</td><td>有理分式 + 肩部</td><td>toe 抬暗部、shoulder 缓压极亮，高光保留色相与层次；业界默认审美</td></tr>
</table>
<p>曲线之外还有一组「摄影机参数」：曝光（exposure）、白点（white，多少亮度算「刺眼」）、自动曝光（按亮度链的统计结果平滑调节）。在 Godot 里它们全部住在 Environment 资源上，随 push constant 喂给最后一个 Pass——下一节的源码走读你会亲眼看到这条喂参数的代码。</p>`
    },
    {
      type: 'lab',
      lab: 'shader',
      key: 'tonemap',
      title: '实验 3：三栏同台——clamp / Reinhard / ACES 抢同一张 HDR',
      height: 480,
      code: `float4 main(float2 uv : TEXCOORD0) : SV_TARGET {
    // ════════ 可编辑旋钮 ════════
    const float EXPOSURE = 1.0;   // 全局曝光：改成 0.1 / 5.0 对比三条曲线的肩部差异
    const float BLOB     = 1.0;   // 「白日头」亮度乘数（试 4.0 看各条曲线怎么抢救白色）

    // ════════ 一份 HDR 素材，三种压法 ════════
    // 左中右三栏是同一条亮度爬坡：从左缘 0.02 指数涨到右缘 18（×EXPOSURE），
    // 外加一颗固定位置的暖白太阳（值可达几十）和一条会扫过的扫描线。
    // 底部色带提示：红=直接截断 / 蓝=Reinhard / 绿=ACES（各自面板内横向同一场景）。
    float aspect = u_resolution.x / u_resolution.y;
    float u = frac(uv.x * 3.0);                     // 本栏内的局部横坐标 0..1
    float t = pow(400.0, u);                        // 1..400：指数爬坡，模拟动态范围
    float3 h = float3(1.0, 0.72, 0.42) * (t * 0.045 * EXPOSURE);   // 暖调：最高约 18
    float sy = 0.5 + 0.42 * sin(u_time * 0.4);      // 扫描线：一条 30 倍亮的白带纵向巡游
    float scan = 1.0 - smoothstep(0.0, 0.012, abs(uv.y - sy));
    h = h * (1.0 + 30.0 * scan);
    float2 bp = float2((u - 0.52) * aspect / 3.0, uv.y - 0.60);     // 太阳：三栏同位置，方便横向对比
    h += float3(1.0, 0.95, 0.85) * 40.0 * EXPOSURE * BLOB * (1.0 - smoothstep(0.0006, 0.0030, dot(bp, bp)));
    float2 mp = float2((u - 0.80) * aspect / 3.0, uv.y - (0.30 + 0.16 * cos(u_time * 0.5)));  // 冷色小球
    h += float3(0.55, 0.70, 1.0) * 3.0 * (1.0 - smoothstep(0.0004, 0.0016, dot(mp, mp)));

    float seg = floor(uv.x * 3.0);                  // 0 左 / 1 中 / 2 右
    float3 col;
    if (seg < 0.5) {
        col = clamp(h, 0.0, 1.0);                                  // 左：暴力截断——高潮段整块炸白
    } else if (seg < 1.5) {
        col = h / (h + 1.0);                                       // 中：Reinhard——保住了细节但一路压向灰
    } else {
        float3 x = max(h, float3(0.0, 0.0, 0.0));
        col = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);  // 右：ACES 近似（Narkowicz）
        col = clamp(col, 0.0, 1.0);                                // 肩部：极亮处缓缓趋白，色相留到最后
    }

    if (uv.y < 0.045) {                                            // 底部身份色带
        float3 tag = float3(0.92, 0.30, 0.20);
        if (seg > 0.5) tag = float3(0.25, 0.58, 0.95);
        if (seg > 1.5) tag = float3(0.30, 0.88, 0.45);
        col = tag;
    }
    float gap = step(0.988, u) + step(u, 0.006);                   // 栏间黑缝
    col = mix(col, float3(0.02, 0.02, 0.03), clamp(gap, 0.0, 1.0));
    return float4(col, 1.0);
}
`
    },
    {
      type: 'text',
      title: '所有权与时机：这些缓冲从哪来、活多久',
      html: `<p>把镜头拉回引擎侧。你在实验里看到的每张「中间纹理」，在 Godot 里对应一段真实的资源管理代码，三个拷问逐一落地：</p>
<p><b>数据怎么流动</b>：renderer_scene_render_rd.cpp 的 Glow 段（搜 RENDER_TIMESTAMP("Glow")）是教科书：rb-&gt;allocate_blur_textures() 备好两套带 mip 的纹理 RB_TEX_BLUR_1/0，然后 for 循环逐级 source=dest、dest=下一级——C++ 层一眼就能读懂的「前一站喂后一站」；亮度链同理，luminance_reduction 用 compute shader 沿 mip 一路归约到 1×1，喂自动曝光。</p>
<p><b>所有权归谁</b>：这些纹理属于<b>该视口的 RenderBuffers</b>，懒分配、跨帧复用，不是每帧新建销毁（GPU 资源创建极贵）；而「附件组合 → 帧缓冲对象」的映射由 FramebufferCacheRD 全局单例做哈希缓存，纹理销毁时靠失效回调自动剔除缓存项——<b>缓存的生命周期跟着附件走</b>，这是典型的「谁持有底层资源，谁负责让上层键失效」。场景缓冲本身则归 Viewport/RID 所有。</p>
<p><b>什么时候发生</b>：glow 链在场景画完、tonemap 之前，环境开了才跑（按需）；自动曝光每帧都跑且要求持续重绘（代码里那句 redraw_request()）；而 tone mapping 永远压轴——它是唯一面向显示器输出的 Pass。时序不是风格问题：泛光必须在 HDR 域、压幅必须在最后，前两节已经推完了原因。</p>`
    },
    {
      type: 'source',
      title: '源码走读：Godot 把这条链写在哪',
      files: [
        { path: 'servers/rendering/renderer_rd/renderer_scene_render_rd.cpp', note: '搜 "Glow"：约 580~670 行是降采样链的完整调度——allocate_blur_textures 备纹理池，for 循环里 source=dest、dest=下一级 slice，gaussian_glow 逐级往下糊再往上叠（移动路径 downsample/upsample_raster），末尾把结果挂进 tonemap 的 settings。多 Pass 数据流在 C++ 层就这么直白。' },
        { path: 'servers/rendering/renderer_rd/effects/copy_effects.cpp', note: 'gaussian_glow（810 行起）与 gaussian_glow_downsample_raster / upsample_raster：每个方法就是一个全屏小 draw——绑定源纹理、设视口为目标的半尺寸、dispatch。注意第一趟额外带 luminance_cap / hdr_bleed_threshold / bloom 参数：亮度提取就融合在这趟降采样里，没有单独的 bright pass。' },
        { path: 'servers/rendering/renderer_rd/shaders/effects/tonemap.glsl', note: '全链终点站：同一个 fragment 里 gather_glow（把 7 级模糊按 glow_levels 加权求和）→ apply_glow（add/screen/softlight，在 tone map 之前！注释写明 FXAA/glow 的先后都是讲究）→ apply_tonemapping（LINEAR/REINHARD/FILMIC/ACES/AGX 分支）。本课实验 1 的第 3、4 站合体就是它。' }
      ]
    },
    {
      type: 'text',
      title: '试一试（课内可选）',
      html: `<ul>
  <li>实验 1 从 PASS 0 一路改到 4，用一两句话描述 0→3→4 各发生了什么——这三级差异就是后处理的存在理由。</li>
  <li>把 THRESH 降到 0.05：连夜空都「够亮」，全屏糊成一片——阈值就是「多亮才算灯」的定义。</li>
  <li>PASS 4 下切换 TONE 0/1：ACES 的太阳芯带暖橙色，Reinhard 洗成灰白；拖鼠标把太阳移到地平线上，看泛光如何漫过地面（那是「读像素」，不是灯光照的）。</li>
  <li>实验 3：EXPOSURE 拉到 5.0，观察三栏里「抢救白色」的能力差距；把 BLOB 调到 4.0 看太阳变成白洞的过程。</li>
  <li>实验 2：按 SPACE 逐站走，盯住橙框（写）与蓝框（读）：任何一站，把它的「写」想象成 texture2D 里别人的「读」——这条链就通了。</li>
</ul>`
    },
    {
      type: 'text',
      title: '小结',
      html: `<p>本课你把「后处理」祛了魅：它不是什么魔法系统，就是<b>一串全屏三角形，每张都把上一张贴图当 sampler 再画一张</b>；链的顺序（提取→降采样模糊→HDR 域合成→tone mapping 殿后）由数据的值域决定，不由审美决定；中间纹理是引擎的昂贵资产，按视口持有、按帧复用、由缓存统一管理生命周期。</p>
<p>带着这张「帧缓冲链」的心智模型，你可以回头看 L4.2：那个假球若放进这条链，光照写进 HDR 缓冲后才会被泛光点亮；往前看 L4.3：RenderingServer 组织的正是「哪些 draw 属于哪一站」；而阴影贴图、SSAO、景深、TAA，全都是这条链上的新站——换个数据，套路不变。</p>`
    }
  ]
}
