// B3 · 液体渲染 III：波动方程水面
export default {
  id: 'B3',
  title: '液体渲染 III：波动方程水面',
  est: '2 小时',
  coreQuestions: [
    '波动方程 u_tt = c²∇²u 为什么要二阶时间导数？换成一阶衰减，水面会失去什么物理？',
    '高度场只存一个标量 h(x,y)，法线、折射、反射这些「假 3D」信息是怎么从它重建出来的？（数据怎么流动）',
    '在 GPU 上模拟波动方程，height 与 velocity 两个场住在哪里、谁每帧读写、谁负责生命周期？（所有权归谁）',
    '离散化之后，波速 c、网格间距 dx、时间步 dt 之间为什么要满足 CFL 硬约束？（什么时候发生）'
  ],
  sections: [
    {
      type: 'text',
      title: '另一条流体路线：高度场与波动方程',
      html: `<p>B1/B2 用一百个粒子挤在一起冒充水：那条路线擅长<b>飞溅、破碎、翻卷</b>——水滴脱离母体、砸成水花，粒子天生干这个。但轮到「一片海面」这种<b>连续、整膜、永远连在一起</b>的水，粒子立刻笨拙起来：你要几万个粒子才盖得住视场里的一片海，而且它们挤出来的表面坑坑洼洼，永远不「平」。</p>
<p>所以工业界对海面、湖面、水面走的是<b>另一条路线：高度场（heightfield）</b>。核心假设一句话：<b>水面是一张只沿竖直方向起伏的膜</b>，每个水平位置 (x,y) 只能有一个高度 h(x,y)——不允许悬垂、不允许翻卷。这一个假设换来了极致的便宜：整片海就存一张二维标量图，不是几十万个粒子。代价也写在脸上：<b>飞溅这种东西高度场永远做不了</b>（水花会脱离表面，而膜表面每个点只有一个高度）。两条路线各管一摊，本课打穿高度场这一摊。</p>
<p>膜怎么动？物理给的是<b>波动方程</b>。水面的每一小片都被邻居牵着往中间拉——凸起来的地方想凹下去，凹下去的地方想弹回来——这就是二阶时间导数的来源：</p>
<pre>u_tt = c² · ∇²u   （u 是高度，c 是波速，∇²u 是高度的拉普拉斯 = 局部弯曲程度）</pre>
<ul>
  <li><b>为什么要二阶（加速度）而不是一阶（速度）？</b>因为水面有惯性：位置改变靠速度，速度改变靠邻居的拉力。一阶方程只会「衰减到平」，永远不会来回振荡；二阶才允许能量在动能（起伏）与势能（弯度）之间来回倒——那才是波。</li>
  <li><b>∇²u 是什么？</b>它是「这个点比邻居的平均高出多少」：高得越多，越被用力拉下来。<code>∇²u ≈ u[左] + u[右] + u[上] + u[下] − 4·u[中]</code>——纯粹的<b>局部算子</b>，一个点只看自己的四邻。这正是「每个点只跟邻居耦合」能在 GPU 上并行的原因。</li>
  <li><b>c² 决定了什么？</b>波速的平方。波速 c 进入「色散关系」ω = c·k：波长越短的波，频率越高、传得越快（对深水波还是 c 自己随波长变，浅水近似才近似常数——这里先取常数，后面实验你亲眼看到 c 怎么改变波纹疏密）。</li>
</ul>
<p>三个灵魂拷问在这里已经能预演：<b>数据怎么流动</b>——每帧每个像素读四邻高度、更新自己的高度与速度；<b>所有权归谁</b>——height 与 velocity 两张场纹理由渲染器持有、跨帧循环翻转（ping-pong），不是每帧新建；<b>什么时候发生</b>——模拟步严格发生在着色之前，且时间步长被稳定性条件锁死（CFL）。下面先把画面做出来，再逐条对源码。</p>`
    },
    {
      type: 'lab',
      lab: 'shader',
      key: 'surface',
      title: '实验 1：交互水面——滴雨、搅动、法线重建与菲涅尔配色',
      height: 600,
      code: `float4 main(float2 uv : TEXCOORD0) : SV_TARGET {
    // ══════════ 可编辑旋钮（改完 Ctrl+Enter 重编译）══════════
    const float C_SPEED = 0.55;    // 波速 c：越大波纹越密、传得越快（色散关系 ω=c·k）
    const float DAMPING = 0.85;    // 阻尼：无阻尼的波动方程能量守恒，水面永远停不下来
    const float2 LIGHT  = float2(0.45, 0.85);   // 假光源方向（高光的朝向）

    float aspect = u_resolution.x / u_resolution.y;
    float2 p = float2(uv.x * aspect, uv.y);     // 校正宽高比，波纹才是圆的
    float e = 0.004;                            // 中心差分的采样步长

    // ─── 高度场：把「水面高度标量」写成若干点源的解析叠加 ───
    // 真实引擎：ping-pong 两张大纹理，compute shader 每帧采样 4 邻域做显式欧拉步，
    //          存的是 h（位移）与 v（速度）两个场；上一帧纹理作这次的输入。
    // 片元着色器无状态、拿不到前帧纹理，于是我们仰仗线性波动方程的「叠加性」：
    //          每个点源独立演化（阻尼谐振 + 外向行波），把它们的响应加起来 = 完整水面。
    // 这就是「采样邻域」在无状态世界里的替身——本质仍是同一个离散波动方程的解。

    // 源 0：鼠标搅动（连续源）—— 一个在原地做衰减振动的点，鼠标指哪它就在哪
    float2 m = float2(clamp(u_mouse.x, 0.02, 0.98) * aspect, u_mouse.y);
    float rm  = length(p - m) + 0.0001;
    float rmx = length(p + float2(e, 0.0) - m) + 0.0001;
    float rmy = length(p + float2(0.0, e) - m) + 0.0001;
    float h  = 0.4 * sin(rm  * 52.0 - u_time * 8.0) * exp(-rm  * 8.0);
    float hx = 0.4 * sin(rmx * 52.0 - u_time * 8.0) * exp(-rmx * 8.0);
    float hy = 0.4 * sin(rmy * 52.0 - u_time * 8.0) * exp(-rmy * 8.0);

    // 源 1..7：周期性雨滴（离散点源）——每个落点由 hash 决定，到点才出现、渐渐平息
    for (int k = 0; k < 7; k++) {
        float seed = float(k);
        float2 dp = float2(frac(sin(seed * 127.1) * 43758.5), frac(sin(seed * 311.7) * 269.5)) * float2(aspect, 1.0);
        float tk = 2.0 + float(k) * 1.9;                       // 第 k 滴落下的时刻
        float age = u_time - tk;                               // 滴落后经过多久
        float ringR  = length(p - dp) + 0.0001;
        float ringRx = length(p + float2(e, 0.0) - dp) + 0.0001;
        float ringRy = length(p + float2(0.0, e) - dp) + 0.0001;
        float front = age * C_SPEED * 13.0;                    // 波前半径随时间向外扩
        float life = exp(-age * DAMPING * 2.0) * saturate(age) * step(0.0, age);
        h  += sin((ringR  - front) * 30.0) * exp(-abs(ringR  - front) * 14.0) * life;
        hx += sin((ringRx - front) * 30.0) * exp(-abs(ringRx - front) * 14.0) * life;
        hy += sin((ringRy - front) * 30.0) * exp(-abs(ringRy - front) * 14.0) * life;
    }

    // ─── 法线重建：从高度场用「中心差分」算出表面斜率的负值 ───
    // 一张高度图 h(x,y) 本身没有朝向信息；法线是 h 的梯度推出来的：
    //     n = normalize( -dh/dx, -dh/dy, 1 )，dh/dx ≈ (h(x+e)-h(x-e))/(2e)
    // 我们在 p / p+e·x / p+e·y 三处各采了一次样，三个高度一减就是梯度。
    float gx = (hx - h) / e;      // dh/dx（世界单位）
    float gy = (hy - h) / e;      // dh/dy
    float3 n = normalize(float3(-gx * 0.06, -gy * 0.06, 1.0));   // 0.06 是「多陡」的显示尺度

    // ─── 假 3D 之一：折射（光线穿过水面时被法线掰弯）───
    // 池底瓷砖图案被折射偏移扰动——水面越斜，池底看起来越「错位」。
    float2 tuv = p * 6.0 + float2(gx, gy) * 0.22;            // 折射：采样坐标被梯度搬动
    float2 cell = floor(tuv);
    float2 ff = frac(tuv) - 0.5;
    float grout = step(0.46, max(abs(ff.x), abs(ff.y)));     // 瓷砖缝
    float3 sand = float3(0.84, 0.70, 0.44) * (0.85 + 0.15 * frac(sin(dot(cell, float2(7.0, 13.0))) * 43758.5));
    float3 bottom = lerp(sand, float3(0.08, 0.15, 0.24), grout);   // 缝是深蓝

    // ─── 假 3D 之二：反射 + 菲涅尔 ───
    // 视线越掠射（n.z 越小），反射率越高——湖面远看是镜子，近看是水。
    float fres = pow(1.0 - saturate(n.z), 3.0);
    float3 sky = float3(0.90, 0.94, 1.00) - p.y * float3(0.16, 0.19, 0.22);   // 渐变天空
    float3 water = lerp(bottom * 0.55, sky, fres);            // 折射(池底) ↔ 反射(天空)

    // ─── 假 3D 之三：高光 + 高度明暗 ───
    float spec = pow(saturate(dot(normalize(n), normalize(float3(LIGHT, 0.1)))), 96.0);
    water += spec * 0.9;
    water += h * 0.18;                                          // 波峰亮、波谷暗

    // ─── 收尾：轻暗角，把视线聚到水面中心 ───
    water *= 1.0 - 0.22 * length(uv - 0.5);

    return float4(clamp(water, 0.0, 1.0), 1.0);
}
`
    },
    {
      type: 'text',
      title: '拆解：一张高度图怎么「长出」立体感',
      html: `<p>实验 1 里水面其实只有一张标量图——每个像素一个高度 h。你看到的立体、折射、反射，全是<b>从这一个标量重建</b>出来的，顺序是死的：</p>
<ul>
  <li><b>① 梯度 → 法线</b>：高度图本身没有「朝向」。法线不是存出来的，是<b>微分算出来</b>的：<code>n = normalize(−dh/dx, −dh/dy, 1)</code>。dh/dx 用中心差分 <code>(h(x+e) − h(x−e)) / 2e</code> 估计——这正是「采样邻域」的本义：要一个点的法线，就得看它左右上下的高度。这也是为什么实验里 h、hx、hy 三个高度同时累加。</li>
  <li><b>② 法线 → 折射</b>：光线进水面时朝法线方向弯。我们没法真算光线，就<b>假装</b>：把「池底瓷砖」的采样坐标沿梯度搬动一下——水面越斜，池底越错位，看着就像折射。这是一个彻头彻尾的骗局，但便宜到几乎免费，而且是所有 2.5D 水面折射的祖传套路。</li>
  <li><b>③ 法线 → 反射 + 菲涅尔</b>：反射天空还是看穿深水，取决于视角。物理上反射率随掠射角增大——菲涅尔。我们用 <code>fres = (1 − n.z)</code> 的幂次近似：正面看（n.z≈1）几乎全折射，斜着看（n.z≈0）几乎全反射。一个 n.z 同时喂给折射和反射，水就「活」了。</li>
  <li><b>④ 法线 → 高光</b>：镜面反射方向与光源对齐的程度，还是 N·L。</li>
</ul>
<p>把这一串记成一个心智模型：<b>一张标量高度图 → 梯度 → 法线 → 一切光照</b>。后面你会看到，Godot 的屏幕空间反射做得一模一样——它从深度缓冲里用中心差分重建几何法线，再拿法线去追踪反射光线。高度场换成了深度图，套路完全不变。</p>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'chain1d',
      title: '实验 2：一维质点链——把波动方程拆到「每个点只看左右邻居」',
      height: 540,
      code: `// 一维质点链：把 u_tt = c²·u_xx 拆到每个点只看左右两个邻居。
// 每个点是一条竖直线，高度 h[i] 就是它的位移；v[i] 是它的速度。
// 一帧内：先算加速度（只看当前 h 的左右邻），再更新速度、位移——这就是显式欧拉步。
// 拖动鼠标持续搅动 / 点击注入一个冲量 / 空格在链中央滴一滴。
// 上下方向键调波速 c，左右方向键调阻尼。两端固定（h[0]=h[N-1]=0），波到边界会反射。
engine.run({
  setup: function (state) {
    state.N = 160;                 // 链上有多少个质点
    state.h = new Array(state.N);
    state.v = new Array(state.N);
    state.c = 0.55;                // 波速 c
    state.damp = 0.9980;           // 每子步速度保留率（阻尼：1.0 = 永不衰减）
    var i;
    for (i = 0; i < state.N; i++) { state.h[i] = 0; state.v[i] = 0; }
    // 初始高斯鼓包：一打开就能看到它分裂成左右两路行波
    var mid = 80, w = 6;
    for (i = 0; i < state.N; i++) {
      var d = (i - mid) / w;
      state.h[i] = 1.0 * Math.exp(-d * d);
    }
    state.msg = '拖动搅动 · 点击冲量 · 空格滴一滴';
    state.hint = '↑↓ 波速 c · ←→ 阻尼';
  },

  update: function (state, dt, input) {
    var i, s;
    // 半步进：显式欧拉对波动方程有时间步上限（CFL：c·dt/dx < 1），拆小步保证稳定
    var sub = 4, dts = dt / sub;
    for (s = 0; s < sub; s++) {
      // 第一步：由当前 h 的左右邻算每个点的加速度（离散拉普拉斯 ∇²u）
      for (i = 1; i < state.N - 1; i++) {
        var lap = state.h[i - 1] - 2.0 * state.h[i] + state.h[i + 1];
        state.v[i] += state.c * state.c * lap * dts;   // u_tt = c²·∇²u
      }
      // 第二步：阻尼 + 用速度更新位移
      for (i = 1; i < state.N - 1; i++) {
        state.v[i] *= state.damp;
        state.h[i] += state.v[i] * dts;
      }
      // 两端固定：h[0] 与 h[N-1] 恒为 0 —— 这就是「边界反射」的来源
    }
    // 交互
    if (input.mouse.down || input.mouse.clicked) {
      var idx = Math.round((input.mouse.x / engine.W) * (state.N - 1));
      if (idx >= 2 && idx <= state.N - 3) {
        if (input.mouse.clicked) state.h[idx] += 1.4;                       // 点击：一次性冲量
        else state.h[idx] += 0.25 * Math.sin(state.t ? 10 : 0);             // 拖动：连续搅动
      }
    }
    if (input.pressed('Space')) {
      var mid2 = Math.round(state.N / 2);
      state.h[mid2] += 1.2;                                               // 滴一滴
      state.msg = '在链中央注入了一个冲量：看它分成两路、撞边界、反射回来';
    }
    if (input.down('ArrowUp'))    state.c = Math.min(state.c + 0.015, 1.40);
    if (input.down('ArrowDown'))  state.c = Math.max(state.c - 0.015, 0.10);
    if (input.down('ArrowRight')) state.damp = Math.min(state.damp + 0.0006, 1.0);
    if (input.down('ArrowLeft'))  state.damp = Math.max(state.damp - 0.0006, 0.990);
    state.t = (state.t || 0) + dt;
  },

  draw: function (state, ctx) {
    var W = engine.W, H = engine.H, i;
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, W, H);
    var base = H * 0.56, amp = H * 0.30;             // 基线位置与振幅像素
    var dx = W / (state.N - 1), x, y;

    // 水面填充：沿链画多边形，波峰亮、波谷暗
    ctx.beginPath();
    ctx.moveTo(0, base - state.h[0] * amp);
    for (i = 1; i < state.N; i++) {
      x = i * dx;
      y = base - state.h[i] * amp;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    ctx.fillStyle = '#123b5e';
    ctx.fill();

    // 波峰高亮线（描在位移曲线上，颜色随高度）
    for (i = 0; i < state.N; i++) {
      x = i * dx;
      y = base - state.h[i] * amp;
      var t = (state.h[i] + 2.5) / 5.0;               // 映射到 0~1
      ctx.fillStyle = 'rgba(' + Math.round(150 + t * 100) + ',' + Math.round(190 + t * 60) + ',250,0.9)';
      ctx.fillRect(x - 1, y - 1, 3, 3);
    }

    // 两端固定端标记：波到这就反弹
    ctx.fillStyle = '#ffb74d';
    ctx.fillRect(0, base - 8, 3, 16);
    ctx.fillRect(W - 3, base - 8, 3, 16);

    // 每点只跟左右邻居耦合的示意：选链中央画三段「邻居」关系
    var c0 = Math.round(state.N / 2);
    ctx.strokeStyle = '#34d399'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo((c0 - 1) * dx, base - state.h[c0 - 1] * amp);
    ctx.lineTo(c0 * dx, base - state.h[c0] * amp);
    ctx.lineTo((c0 + 1) * dx, base - state.h[c0 + 1] * amp);
    ctx.stroke();
    ctx.fillStyle = '#34d399';
    ctx.fillText('中央三点：u_tt = c²(u[左] - 2u[中] + u[右])', 8, 22);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '15px sans-serif';
    ctx.fillText('波速 c = ' + state.c.toFixed(2) + '   阻尼 = ' + state.damp.toFixed(4), 8, 46);
    ctx.fillStyle = '#8fa7c7';
    ctx.font = '13px sans-serif';
    ctx.fillText(state.msg, 8, 68);
    ctx.fillText(state.hint, 8, 86);
  }
});
`
    },
    {
      type: 'text',
      title: '离散化之后：稳定性、阻尼、边界反射',
      html: `<p>实验 2 是波动方程最诚实的形态：一个点的下一步，只由它和左右邻居的当前高度决定。正是从这份「诚实」里长出三个必踩的坑——</p>
<p><b>① CFL 条件（什么时候发生）</b>：显式欧拉步对波动方程有硬性稳定上限——信息在一个时间步里传过的距离，不能超过一个网格：<code>c · dt ≤ dx</code>。波速 c 越大，dt 就必须越小。违反它，波不会「错一点」，而是<b>指数爆炸</b>——涟漪迅速抖成一片雪花。这就是为什么引擎的 GPU 水面模拟要精心选网格分辨率和子步数，也为什么实验 1 的雨滴用解析解绕开了这个坑、而实验 2 老老实实分子步。</p>
<p><b>② 阻尼（能量去哪了）</b>：无阻尼的波动方程<b>能量守恒</b>——你滴的那一下永远在链上跑来跑去，水面永远平静不下来。真实水面是有摩擦的，把动能逐渐消成热。实验里的 <code>damp</code> 每子步把速度乘一个略小于 1 的数，就是最简单的黏性阻尼。把它调到 1.0，你会看到那滴雨「永远活在链上」。</p>
<p><b>③ 边界反射（所有权之外的「边界条件」）</b>：到底发生了反射还是穿透，取决于<b>边界上设了什么</b>。实验里两端固定（h=0），波撞上去会反弹且<b>相位翻转</b>（峰变谷）；若改成「自由端」（让 h[0] 跟着 h[1] 走），波会原相位弹回。一片真实的海洋不是「墙围起来的池子」，所以现代海面用<b>周期性边界</b>（右边绕回左边）让波从边缘滚出又滚回——三种边界，三种现场。</p>
<table>
  <tr><th>边界类型</th><th>约束写法</th><th>反射行为</th></tr>
  <tr><td>固定端</td><td>h[0] = 0</td><td>反弹，相位翻转（峰变谷）</td></tr>
  <tr><td>自由端</td><td>h[0] = h[1]</td><td>反弹，相位不变</td></tr>
  <tr><td>周期边界</td><td>h[0] = h[N-1]</td><td>滚出边缘、从对侧滚回（海面</td></tr>
</table>`
    },
    {
      type: 'source',
      title: '源码走读：Godot 从深度图重建法线、再追踪反射',
      files: [
        { path: 'servers/rendering/renderer_rd/shaders/effects/screen_space_reflection.glsl', note: '教科书级对照：compute_geometric_normal() 从深度缓冲(HiZ)用中心差分重建几何法线——texelFetch 左右上下各采一次，跟本课「从高度图用中心差分算 n」是同一件事，只是把高度场换成了深度图。整段 main() 就是：取法线 → reflect(view_dir, normal) 算出反射方向 → 沿 HiZ 逐层步进找命中点（数据怎么流动，一眼到底）。' },
        { path: 'servers/rendering/renderer_rd/effects/ss_effects.cpp', note: '搜 screen_space_reflection：看 SSR 的完整调度——先把深度/法线粗糙度纹理准备好（数据从哪来、归谁分配），再依次 dispatch downsample / hiz / trace / filter / resolve 五个 compute kernel（什么时候发生、顺序为何不可逆）。这就是「一张高度图 → 法线 → 反射」在真实引擎管线里的工业化版本。' },
        { path: 'servers/rendering/renderer_rd/shaders/effects/screen_space_reflection_resolve.glsl', note: 'normal_diff = 1 - dot(normal, sample_normal) 然后 exp(-normal_diff · 32)：用邻域法线的夹角做双边滤波权重，抹掉反射的高频噪声——法线不仅用来「追光」，还用来「决定反射对谁可见」。NORMAL_FACTOR=32 就是一个取舍旋钮。' }
      ]
    },
    {
      type: 'text',
      title: '试一试（课内可选）',
      html: `<ul>
  <li>实验 1 把 <code>C_SPEED</code> 从 0.55 拉到 2.0：雨滴的波纹立刻变密、同心环变挤——这就是「波速进色散关系，短波跑得快」在眼前的直译。</li>
  <li>把 <code>DAMPING</code> 改成 0.3：雨滴的涟漪「永远」扩散下去，几乎不衰减——对应无阻尼波动方程的能量守恒，水面再也安静不下来。</li>
  <li>把折射强度 <code>0.22</code> 改成 1.5：池底瓷砖被掰得惨不忍睹——那是「折射角过大」，你正在亲眼体会折射偏移量的上限。</li>
  <li>实验 2 按住方向键上把 c 顶到 1.40 附近再滴一滴：波纹传得飞快。c 再大你就会撞 CFL 上限——所以实验里给 c 设了 1.40 的上限，保护你的数值稳定性。</li>
  <li>把 <code>damp</code> 调回 1.0（按住右键不松，它涨到 1.0 封顶），滴一滴水滴：那滴水在两端固定的链上<b>永远</b>来回反射，永不消失——能量守恒的最直观证据。</li>
  <li>回去读 screen_space_reflection.glsl 的 compute_geometric_normal，把「深度图的中心差分」和本课「高度图的中心差分」并排看：一行是 texelFetch，一行是 length，本质是同一个梯度公式。</li>
</ul>`
    },
    {
      type: 'text',
      title: '小结',
      html: `<p>这一课把「海面」这条与 B1/B2 粒子路线并列的流体流派打穿了：<b>高度场假设（每个 (x,y) 只有一个 h）换来了整片海 = 一张标量图的极省，代价是永远做不出飞溅</b>。要让它动，就解波动方程 u_tt = c²∇²u——一个纯局部的二阶方程，每个点只看四邻，天然适合 GPU 并行。</p>
<p><b>数据怎么流动</b>：每帧每个网格点读四邻高度算出 ∇²u（加速度）→ 更新自己的速度 → 更新自己的高度；接着从高度场的梯度重建法线，法线再喂给折射（搬动采样坐标）、反射（菲涅尔混合）、高光（N·L）。</p>
<p><b>所有权归谁</b>：height 与 velocity 两个场是两张 ping-pong 纹理，由渲染器持有、跨帧原地翻转复用（本轮输出作下轮输入），不每帧新建；Godot 里对应的是 SSR 链上那批由视口分配的纹理，生命周期跟着渲染资源走。</p>
<p><b>什么时候发生</b>：模拟步严格排在着色之前，且步长被 CFL 条件 c·dt ≤ dx 锁死；边界上还欠一个「边界条件」（固定 / 自由 / 周期），它决定波是翻转反射、原相位反射，还是滚出边缘绕回来。</p>
<p>把「一张标量场 → 梯度 → 法线 → 光照」这条链焊进脑子：它不只属于水面——任何从「高度/深度」起步的效果（地形阴影、SSAO、视差贴图）都走同一条路。下一课 B4 我们把这个心智模型换个战场：破坏场景里那块可以被炸出坑、炸掉的逐像素地形。</p>`
    }
  ]
};
