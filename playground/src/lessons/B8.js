// B8 · Raymarching 专题：没有网格的渲染
export default {
  id: 'B8',
  title: 'Raymarching 专题：没有网格的渲染',
  est: '2 小时',
  coreQuestions: [
    '场景里一个三角形都没有，GPU 每一步是怎么知道「该走多远」的？距离值、法线、颜色各自在哪一步、被谁算出来？（数据怎么流动）',
    '没有顶点缓冲、没有索引、没有 mesh 资产，几何到底「存在哪里」、归谁所有？把同一个场景搬回传统管线，哪些数据要凭空造出来？（所有权归谁）',
    '传统管线的几何在顶点阶段一次定死；这里每像素、每步、每帧都在重新「发明」几何——这份开销发生在管线的哪个阶段？步数上限 80 步买断的是什么？（什么时候发生）'
  ],
  sections: [
    {
      type: 'text',
      title: '没有网格的渲染：几何从「数据」变成「函数」',
      html: `<p>到目前为止，平台所有渲染实验都有一个共同前提：<b>几何是一份数据</b>——顶点缓冲、索引、三角形列表，引擎把它们搬进显存，光栅化把三角形铺满屏幕。L4.1 的三角形、L4.2 的假球、B3 的高度场水面，都还在这条世界线上。本课换一条路：<b>几何是一个函数</b>。定义 d(p)：输入空间任意一点 p，返回它到「最近表面」的<b>带符号距离</b>——约定外部为正、内部为负；表面就是 d(p) = 0 的零等值面。这份数据叫 <b>SDF（Signed Distance Field，有向距离场）</b>。</p>
<p>基本体的 SDF 一行一个，值得背下来（本课实验全部用到）：</p>
<table>
  <tr><th>几何</th><th>SDF</th><th>读法</th></tr>
  <tr><td>球（半径 r）</td><td><code>length(p) − r</code></td><td>到中心的距离减去半径</td></tr>
  <tr><td>平面（y = h）</td><td><code>p.y − h</code></td><td>离地多高，地下为负</td></tr>
  <tr><td>轴对齐盒（半边长 b）</td><td><code>length(max(abs(p) − b, 0)) + min(max(p.x−b.x, p.y−b.y, p.z−b.z), 0)</code></td><td>外部距离 + 内部距离两段拼成（见下）</td></tr>
  <tr><td>圆环（主半径 R、管半径 r）</td><td><code>length(float2(length(p.xz) − R, p.y)) − r</code></td><td>先把点压进「过轴的竖直平面」，再按二维圆处理</td></tr>
</table>
<p>盒子那行为什么这么啰嗦？因为距离场必须<b>内外都正确</b>：只写前半段（外部距离），盒子内部每一点的值都会错成 0。单纯做并集时无所谓（反正被 min 盖住），可一旦做<b>减法</b>（下一段），这些「假 0」会让光线在盒壁内侧大步跨出去——穿墙。引擎代码里那种「看起来能省的一行不敢省」，这是活例子。</p>
<p>三个灵魂拷问先预演：<b>数据怎么流动</b>——场景里没有一块几何缓冲；每条光线每走一步都现场调用一次函数，要一个数、走一步。<b>所有权归谁</b>——几何「存在」shader 源码文本里，编译进 GPU 程序，显存里只占三个 uniform。<b>什么时候发生</b>——全部发生在片元着色阶段、每像素、每帧，现算现用。下面把每一条做实。</p>`
    },
    {
      type: 'text',
      title: 'sphere tracing 与三件白送的礼物',
      html: `<p><b>礼物零：sphere tracing（球体追踪，光线步进的本名）。</b>光栅化没有三角形可画，就逐像素发射视线，把「可见性」变成一场沿视线的行走。依据是距离场的 Lipschitz 性质：<b>沿任何方向走一步 s，d 值的变化量不会超过 s</b>。于是以当前点的 d 值为半径画一个球，球内保证没有任何表面，可以放心把整段距离跨过去，落点再问一次：</p>
<pre>反复 {
    h = d(p)                 // 问场：离最近表面还有多远
    若 h &lt; 阈值 → 命中（p 已贴在表面上）
    p += 视线方向 × h        // 整步跨过去——「以场值为步长」的全部含义
}</pre>
<p>两个工程细节：命中阈值要<b>随距离放宽</b>（远处光线一步跨 3 米，还要求 0.001 精度等于强迫走满步数）；步数必须设上限（本课 80 步）——视线擦着表面滑行时 h 始终很小，永远凑不齐收敛条件，步数上限就是这段计算的预算，也是 raymarching 画面里「边缘碎裂」的来源。</p>
<p><b>礼物一：布尔运算白送 CSG（实体几何构造）。</b>两个 SDF 做一次 min / max 就是布尔运算——不需要建模工具、不需要布尔库、不需要关心拓扑：</p>
<table>
  <tr><th>运算</th><th>公式</th><th>读法</th></tr>
  <tr><td>并 A ∪ B</td><td>min(dA, dB)</td><td>离哪个近算哪个（结果是精确距离）</td></tr>
  <tr><td>交 A ∩ B</td><td>max(dA, dB)</td><td>两个都得「在内」</td></tr>
  <tr><td>差 A − B</td><td>max(dA, −dB)</td><td>在内 A 且不在 B 内——被减出的是一张凹面，法线朝里</td></tr>
</table>
<p>诚实备注：min 是精确的；max 出来的交与差会<b>高估</b>真实距离（Lipschitz 在「两表面夹缝」处被破坏），边界偶尔多跨半步。经典补救是给步长乘保险系数、或改用 smooth min 做过渡——本课场景里看不出来，知道有这回事即可。</p>
<p><b>礼物二：法线不用存，微分就行。</b>距离场的梯度 ∇d 天然是单位向量、指向「离表面变远最快的方向」——正是外法线。没有顶点法线可读，就数值差分；最省的是<b>四面体技巧</b>：沿 (1,−1,−1)、(−1,−1,1)、(−1,1,−1)、(1,1,1) 四个方向各采一次 SDF，加权求和再归一化——4 次采样代替 6 次轴向差分，和 B3 从高度图中心差分重建法线是同一家族的手艺。点缀两件小东西也全靠同一个函数：<b>软阴影</b> = 从命中点向光源再做一遍小规模 sphere tracing，记录光线「最贴近其他表面的程度」，越贴越黑，半影自然出现；<b>AO 近似</b> = 沿法线抬头看 5 次，SDF 抬升比理论慢多少，就被周围挤压多少。</p>
<p>实验怎么读：场景函数写成 5 个宏（转译器不允许在 main 外定义函数，宏是 L4.4 用过的合规替身）——四个基本体加一个总组合 MAP。渲染顺序：相机 → 80 步 sphere tracing → 4 次采样法线 → <b>材质认领</b>（谁的 SDF 在脚下过零，这个面就归谁；盒减球减出来的凹面会亮出球的颜色，一眼看出「这块脸属于球」）→ 软阴影 16 步 → AO 5 次 → Lambert + Blinn 高光 + 距离雾。左缘竖条是<b>步数计</b>：这条视线走了几步才收敛。</p>`
    },
    {
      type: 'lab',
      lab: 'shader',
      key: 'raymarch',
      title: '实验：SDF 场景 raymarching——盒减球在转、球并环在呼吸、影子跟着鼠标走',
      height: 620,
      code: `// ═══════════════════════════════════════════════════════════════
// SDF 场景 raymarching：没有网格、没有三角形，几何 = 一个返回距离的函数
// 鼠标左右 = 光源方位，上下 = 光源高度；场景自动呼吸，盒减球缓慢旋转
// 左缘竖条 = 该像素的步进次数 / 80（越高 = 这条视线收敛得越辛苦）
// ═══════════════════════════════════════════════════════════════
float4 main(float2 uv : TEXCOORD0) : SV_TARGET {

    // ───────── 场景参数（改完 Ctrl+Enter 重编译）─────────
    const float3 C1 = float3(-0.75, -0.45, 0.10);    // 组合体1「盒减球」中心（盒底贴地 y=-1）
    const float  BH = 0.55;                          // 盒子半边长
    const float  PLIFT = 0.20;                       // 珍珠球在环心上方的高度
    float3 C2  = float3(0.95, -0.86 + 0.05 * sin(u_time * 0.8), -0.45);   // 组合体2「球并环」中心（缓慢起伏 = 呼吸）
    float3 C2P = float3(0.95, C2.y + PLIFT, -0.45);  // 珍珠球中心
    float  SRB = 0.34 + 0.07 * sin(u_time * 1.4);    // 被减球的半径（呼吸 → 凹洞开合）
    float  SRP = 0.28 + 0.04 * sin(u_time * 1.1 + 2.1);   // 珍珠球半径（与凹洞反相呼吸）
    float  A1  = u_time * 0.22;                      // 组合体1 的旋转角（弧度）
    float  cs  = cos(A1);                            // 正余弦在帧首只算一次：
    float  sn  = sin(A1);                            // 80 步里每步只做乘加，不付三角函数的钱

    // ───────── 用宏顶替函数（转译器不允许在 main 外定义函数）─────────
    // ROTY(v)：把点 v 绕 y 轴转 A1 角。旋转是等距变换，不破坏距离场的 Lipschitz 性质
    #define ROTY(v) float3(cs * (v).x + sn * (v).z, (v).y, -sn * (v).x + cs * (v).z)

    // 四个基本体的带符号距离（内负外正，表面 = 0）
    #define D_GND(pt) ((pt).y + 1.0)
    // 轴对齐盒：外部距离 + 内部距离。内部项绝不能省——减法要靠它防穿墙
    #define D_BOX(pt) (length(max(abs(ROTY((pt) - C1)) - BH, 0.0)) + min(max(max(ROTY((pt) - C1).x, ROTY((pt) - C1).y), ROTY((pt) - C1).z) - BH, 0.0))
    #define D_SPH(pt) (length((pt) - C1) - SRB)
    #define D_TOR(pt) (length(float2(length(((pt) - C2).xz) - 0.48, ((pt) - C2).y)) - 0.14)
    #define D_PRL(pt) (length((pt) - C2P) - SRP)

    // 场景总距离 = 布尔组合：并 = min，差 = max(A, -B)。CSG 全在这两行里
    #define MAP(pt) (min(min(D_GND(pt), max(D_BOX(pt), -D_SPH(pt))), min(D_TOR(pt), D_PRL(pt))))

    // 天空底色 + 光晕（r 是视线方向）。引用了下面才声明的 LDIR——宏在用到处才展开
    #define SKY(r) (lerp(float3(0.16, 0.19, 0.26), float3(0.045, 0.055, 0.085), clamp((r).y * 1.5, 0.0, 1.0)) + float3(1.0, 0.70, 0.42) * 0.55 * pow(max(dot((r), LDIR), 0.0), 30.0) + float3(1.0, 0.55, 0.30) * 0.14 * pow(max(dot((r), LDIR), 0.0), 5.0))

    // ───────── 相机与光 ─────────
    float aspect = u_resolution.x / u_resolution.y;
    float2 p = (uv - float2(0.5, 0.5)) * float2(aspect, 1.0);
    float3 ro = float3(0.0, 0.65, -3.7);             // 相机（固定，专心看几何）
    float3 ta = float3(0.0, -0.42, 0.0);             // 注视点
    float3 ww = normalize(ta - ro);
    float3 uu = normalize(cross(float3(0.0, 1.0, 0.0), ww));
    float3 vv = cross(ww, uu);
    float3 rd = normalize(p.x * uu + p.y * vv + 1.6 * ww);

    // 光源方向：鼠标左右 = 方位，上下 = 高度（压到最下 = 贴地，影子会拉长到夸张）
    float2 lm = (u_mouse - float2(0.5, 0.5)) * float2(aspect, 1.0) * 2.2;
    float3 LDIR = normalize(float3(lm.x, 0.42 + 0.50 * lm.y, 0.60));

    // ───────── 光线步进（sphere tracing 本体，就这 9 行）─────────
    float t = 0.0;                                   // 沿视线已走的距离
    float hitF = 0.0;                                // 命中旗标
    float stp = 0.0;                                 // 步数计（纯 UI）
    float3 pos = ro;
    for (int i = 0; i < 80; i++) {
        pos = ro + rd * t;
        float h = MAP(pos);                          // 问场：离最近表面还有多远
        stp += 1.0;
        if (h < 0.0008 + 0.0012 * t) { hitF = 1.0; break; }   // 命中（阈值随距离放宽）
        t += h;                                      // 敢整步跨过去：距离场沿任何方向变化率不超过 1
        if (t > 11.0) { break; }                     // 走出场景 → 天空
    }

    float3 col = SKY(rd);                            // 未命中 = 天空（自带光晕，能看出灯在哪）
    if (hitF > 0.5) {
        // ───────── 数值法线：四面体技巧，4 次 MAP 代替求导 ─────────
        float3 n = normalize(
            float3( 1.0, -1.0, -1.0) * MAP(pos + float3( 1.0, -1.0, -1.0) * 0.002) +
            float3(-1.0, -1.0,  1.0) * MAP(pos + float3(-1.0, -1.0,  1.0) * 0.002) +
            float3(-1.0,  1.0, -1.0) * MAP(pos + float3(-1.0,  1.0, -1.0) * 0.002) +
            float3( 1.0,  1.0,  1.0) * MAP(pos + float3( 1.0,  1.0,  1.0) * 0.002));

        // ───────── 材质认领：谁的 SDF 在脚下过零，这个面就归谁 ─────────
        float aG = abs(D_GND(pos));
        float aB = abs(D_BOX(pos));
        float aS = abs(D_SPH(pos));
        float aT = abs(D_TOR(pos));
        float aP = abs(D_PRL(pos));
        float best = aG;
        float mId = 0.0;                             // 0 地面 / 1 盒面 / 2 被减球面 / 3 圆环 / 4 珍珠
        if (aB < best) { best = aB; mId = 1.0; }
        if (aS < best) { best = aS; mId = 2.0; }
        if (aT < best) { best = aT; mId = 3.0; }
        if (aP < best) { best = aP; mId = 4.0; }

        float3 albedo = float3(1.0, 0.0, 1.0);
        if (mId < 0.5) {
            float ck = mod(floor(pos.x * 1.1) + floor(pos.z * 1.1), 2.0);
            albedo = lerp(float3(0.34, 0.36, 0.40), float3(0.16, 0.18, 0.22), ck);   // 地面棋盘
        } else if (mId < 1.5) {
            albedo = float3(0.66, 0.20, 0.14);       // 盒子的外表面
        } else if (mId < 2.5) {
            albedo = float3(0.98, 0.58, 0.16);       // 被减出来的凹面——颜色认领：这块其实属于球
        } else if (mId < 3.5) {
            albedo = float3(0.14, 0.52, 0.50);       // 圆环
        } else {
            albedo = float3(0.85, 0.76, 0.58);       // 珍珠球
        }

        // ───────── 软阴影近似：沿光方向把 sphere tracing 再走 16 步 ─────────
        float sof = 1.0;
        float ts = 0.05;
        for (int i = 0; i < 16; i++) {
            float h2 = MAP(pos + LDIR * ts);
            sof = min(sof, smoothstep(0.0, 1.0, 9.0 * h2 / ts));   // 光线越贴表面，影越实
            ts += clamp(h2, 0.04, 0.30);
            if (ts > 3.0 || sof < 0.02) { break; }
        }

        // ───────── AO 近似：沿法线抬头 5 次，场抬升越慢 = 被挤得越狠 ─────────
        float occ = 0.0;
        float sca = 1.0;
        for (int i = 0; i < 5; i++) {
            float hh = 0.02 + 0.11 * float(i) / 4.0;
            occ += (hh - MAP(pos + n * hh)) * sca;
            sca *= 0.80;
        }
        float ao = clamp(1.0 - 2.4 * occ, 0.0, 1.0);

        // ───────── 光照：Lambert + Blinn 高光 + 天光环境 + 距离雾 ─────────
        float dif = max(dot(n, LDIR), 0.0);
        float3 hv = normalize(LDIR - rd);            // 半程向量（视线方向是 -rd）
        float spe = pow(max(dot(n, hv), 0.0), 44.0);
        float fre = pow(1.0 - max(dot(n, -rd), 0.0), 4.0);
        float3 LC  = float3(1.30, 1.05, 0.80);       // 暖色主光
        float3 amb = float3(0.16, 0.19, 0.24) * (0.55 + 0.45 * n.y);

        col = albedo * (amb * ao + dif * sof * LC);
        col += spe * sof * LC * 0.9;
        col += fre * ao * amb * 0.8;
        col = lerp(col, SKY(rd), 1.0 - exp(-0.012 * t * t));   // 距离雾：远处淡入天空
    }

    // ───────── 收尾：左缘步数计 + gamma + 暗角 ─────────
    if (uv.x < 0.012) {
        col = lerp(col, float3(1.0, 0.62, 0.18), step(uv.y, clamp(stp / 80.0, 0.0, 1.0)) * 0.75);
    }
    col = pow(clamp(col, 0.0, 1.0), float3(0.4545, 0.4545, 0.4545));
    col *= 1.0 - 0.20 * length(uv - float2(0.5, 0.5));
    return float4(col, 1.0);
}
`
    },
    {
      type: 'text',
      title: '试一试（课内可选）',
      html: `<ul>
  <li>拖鼠标：左右改光源方位、上下改高度。压到画布最下沿，影子被拉到地平线那么长；举到顶上变成正午硬顶光。全程没改一行代码——影子形态是光线与场「商量」出来的，这是无网格渲染最直观的「当场有感觉」。</li>
  <li>盯左缘步数计：天空矮（几大步就走出去）、平面中心中等、<b>物体轮廓边缘最高</b>——视线与表面近切线时收敛最慢。步数上限是按最坏情况给的预算。</li>
  <li>把主循环的 <code>i &lt; 80</code> 改成 <code>i &lt; 24</code> 重编译：盒子远端开始被「啃掉」、边缘破碎——预算花完，光线还没收敛只能按未命中处理。看完改回去。</li>
  <li>把 MAP 里的 <code>max(D_BOX(pt), -D_SPH(pt))</code> 改成 <code>max(D_BOX(pt), D_SPH(pt))</code>（去掉负号）：差变交，盒子里只剩一圈球形坑壁；再改成 <code>min(D_BOX(pt), D_SPH(pt))</code>：变并。一行符号切换三种布尔运算——CSG 白送的含义就在这。</li>
  <li>把 SRB 一行的 0.07 改成 0.16：凹洞随时间明显开合。网格管线里这要重建拓扑、更新缓冲；这里只是换了个半径数值——「几何是函数」的动态红利。</li>
  <li>源码验证：打开 voxel_gi.glsl 的 raymarch 函数（约 180 行起），对照实验主循环——结构逐行同构，唯独「问场」那行是 texture 采样而不是函数求值：引擎把 SDF 烘成 3D 纹理换 O(1) 查询，代价是构建期烘焙加体素精度。</li>
</ul>`
    },
    {
      type: 'source',
      title: '源码走读：引擎里的 SDF——烘出来的场、走出来的光、撞出来的粒子',
      files: [
        { path: 'servers/rendering/renderer_rd/shaders/environment/voxel_gi.glsl', note: '引擎里字面意义的 sphere tracing。搜 raymarch（约 180 行）：烘焙进 3D 纹理的 SDF，advance = texture(sampler3D(texture_sdf, ...)).r * 255.0 - 1.0 拿场值当步长；advance < 0 即走进表面，遮挡归零——与实验主循环逐行同构。差异也在这一行：Godot 的 SDF 是构建期按体素烘的数据（查表一次到位），我们的 SDF 是解析公式（每步现算）；它步进是为 GI 算光照遮挡，我们是为可见性求交。再搜 distance_adv 看它为什么强制「按倍数前进」——把步长对齐体素尺度，防止在格子之间抖动，这是离散距离场特有的工程细节。' },
        { path: 'servers/rendering/renderer_rd/shaders/canvas_sdf.glsl', note: '2D 世界的 SDF 制造厂：compute shader 把 canvas 的遮挡位图烘成 r16_snorm 距离场。搜 MODE_PROCESS（约 75 行）：每个像素记「指向最近实心像素的向量」，在 8 邻域间反复传播收敛（8SSEDT 家族），配合 stride 分层加速；MODE_STORE（约 134 行）收尾——d = length(rel - pos)，实心侧取负（d = -d）才有「带符号」，最后按 SDF_MAX_LENGTH 压进 [-1,1]。它的消费者在 canvas.glsl：搜 texture_sdf / texture_sdf_normal（约 366~387 行）——2D 光照软阴影查这张表，法线同样是中心差分：本课数值法线的 2D 引擎版。关系：同一个「距离场」数据结构；差异：烘一次、全场景反复查询，而实验根本不存场——每像素直接求函数值。' },
        { path: 'servers/rendering/renderer_rd/shaders/particles.glsl', note: '无网格路线之二：整个粒子模拟（发射、力场、碰撞）住在 compute shader 里，CPU 每帧只喂参数。妙处是它也用 SDF：搜 USE_COLLISION_SCALE / colliders（约 500 行起）——GPU 粒子拿 2D SDF 纹理做碰撞：采样距离 d、差分求法线 n、sdf_pos2 = sdf_pos + n * d 把粒子推回表面（约 530 行），3D 版本在约 608~620 行同样套路（采样 3D SDF、中心差分重建法线）——正是本课「SDF + 数值法线」的物理用法，且推回那一步相当于 sphere tracing 的最末一步。关系：同为「没有网格」的渲染家族；差异：粒子仍是逐个积分的状态数据（位置、速度存在 buffer 里），SDF 连状态都没有——几何彻底退化成一个函数。' }
      ]
    },
    {
      type: 'text',
      title: '小结',
      html: `<p><b>数据怎么流动</b>：一条视线从相机出发，每步向场景函数 d(p) 要一个数并拿它当步长；命中之后还是这个函数——4 次采样给法线、16 步给软阴影、5 次给 AO，最后喂给与 J1 同一条光照公式。全程没有任何几何缓冲参与，「场景」只是每像素临时求值出来的临时值。</p>
<p><b>所有权归谁</b>：几何住在 shader 源码里，编译进 GPU 程序，随程序生灭；显存里只有 u_time / u_mouse / u_resolution 三个 uniform。没有顶点缓冲，也就没有 mesh 资产的加载、驻留、卸载问题——这是 SDF 的自由；代价是改场景等于改代码重编译，而网格资产是数据、运行时可热换。引擎侧的折中在 voxel_gi 里看得见：把函数<b>烘焙</b>成 3D 纹理（函数变数据），运行时查表——「函数」与「数据」原来可以互相翻译，选哪边取决于你更要灵活还是要省。</p>
<p><b>什么时候发生</b>：一切发生在片元着色阶段、每像素、每帧、最多 80 步。这个上限就是 raymarching 的帧预算：超支的像素按未命中处理（试一试里你已经见过 24 步的破碎现场）。对比传统管线——几何在顶点阶段一次定死、片元阶段只做插值——raymarching 把几何的诞生推迟到最后一刻，也就把成本从「全场景一次」摊成了「每像素每步一次」。</p>
<p>最后接回主线：L4.2 画球走的是「网格 + 假法线」，B8 是第二条路（每像素现算），J1 的光照公式两条路通用——变的只是法线从哪来。B6 的 shadow mapping 在这里也不需要了：没有 shadow map，软阴影是光线直接向场「问」出来的。想再看引擎怎样把这套思想用于 2D 光照与粒子碰撞，走读的三个文件就是入口。</p>`
    }
  ]
}
