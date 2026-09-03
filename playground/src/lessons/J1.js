// J1 · PBR：从 Blinn-Phong 到金属度/粗糙度
export default {
  id: 'J1',
  title: 'PBR：从 Blinn-Phong 到金属度/粗糙度',
  est: '2.5 小时',
  coreQuestions: [
    'Blinn-Phong 的 (N·H)^shininess 与 GGX 的 D 项，究竟谁在决定高光「有多锐」？把 roughness 换成 alpha = roughness² 又是在买什么？（数据怎么流动）',
    'albedo、metallic、roughness 这三个数是谁生产的、以什么格式存成哪张贴图、被谁读走？为什么引擎宁可塞进一张 ORM 纹理也不发三个标量 uniform？（所有权归谁）',
    '菲涅尔、能量守恒补偿、GGX 的 1/(4·NoL·NoV) 奇点——这些修正各自发生在光照公式的哪一步？少了它们分别会看到什么画面？（什么时候发生）'
  ],
  sections: [
    {
      type: 'text',
      title: '先审一遍 L4.2 那个球：它错在哪',
      html: `<p>L4.2 我们手写过一个假球光照：<code>col = base * (0.12 + 0.88 * NdotL) + pow(NdotH, 48)</code>。打开看很立体，闭上眼想一下就会发现三处说不通：</p>
<ul>
  <li><b>能量没有上限。</b>漫反射项加高光项，想加多少加多少。一个 roughness 很低的光滑塑料，被算出来的总亮度可以远超它接收到的光；反过来把高光指数从 48 改成 4，高光变大变糊，但<b>总能量也跟着涨了</b>——而现实中磨粗一块塑料，它只是反光散开，不会整体变亮。</li>
  <li><b>高光颜色与材质无关。</b>那行 <code>col += spec</code> 加的是纯白。现实里金子的高光是橙黄色，铜是高光带红，玻璃的高光是白的——高光颜色是材质的属性，不是免费的常数。</li>
  <li><b>参数靠审美调。</b>「shininess 48、环境 0.12、高光强度 0.6」这些数字没有任何物理含义，换个美术、换个光源强度就得全部重调，而且调好的值不能复用到另一个物体上。</li>
</ul>
<p>这就是所谓<b>经验模型</b>：公式的形状来自观察，系数来自手感，能画出「像那么回事」的画面，但不受任何约束管束。PBR（Physically Based Rendering，严格说是 physically based <b>shading</b>）不是一套新魔法，而是给经验模型<b>套上三条物理约束，再把剩下的自由度整理成两个可测量的旋钮</b>。</p>
<p>顺带先把一个误会掐掉：名字里的 Physical 不等于「解了光的方程」。真实材质的 BRDF（双向反射分布函数：给定入射方向和观察方向，表面往你眼睛里弹多少能量）没有闭式解，实时渲染也求不起。PBR 的「物理」指的是<b>不许违反已知的守恒律和统计规律</b>。用一句话概括这次范式转移：</p>
<pre>Blinn-Phong：这个像素看起来多亮？        （问审美）
PBR        ：按这种材质结构，物理上最多能有多少能量进入眼睛？（问预算）</pre>`
    },
    {
      type: 'text',
      title: '支柱一：微表面——roughness 是一把尺子的读数',
      html: `<p>第一条支柱要回答的问题是：<b>为什么同一个面，正看是纯色、斜看有高光？</b>答案在放大倍数里。任何「光滑」的表面——抛光的钢、塑料车漆、你的屏幕——在显微镜下都是连绵的山谷，每一小粒都是一个小小的镜面，叫<b>微表面（microfacet）</b>。肉眼看到的一个像素，其实是成千上万个微镜子的<b>统计平均</b>。</p>
<p>于是「粗糙」变成一个可以定义的统计量：微镜子的朝向有多分散。工程上用 <b>NDF（法线分布函数）D(h)</b> 描述这件事——沿某个半程向量 h 方向的微镜子密度有多大。GGX / Trowbridge-Reitz 是目前工业默认的那个形状：</p>
<pre>D_GGX(n·h, α) = α² / ( π · ( (n·h)² · (α² − 1) + 1 )² )        其中 α = roughness²</pre>
<p>不用推，只要读出它的三个脾气：</p>
<ul>
  <li>α 很小（镜面抛光）时，分母只在 n·h≈1 附近才不被压平 → D 在正对的位置炸出一个<b>极高极窄</b>的尖峰：小而硬的高光。</li>
  <li>α 变大时尖峰塌下来、摊开成大而软的裙边。<b>注意它是「塌」不是「降」</b>：峰变矮的同时裙边变宽，曲线下面积守恒——这正是能量守恒在数学形状上的体现，也是 Blinn-Phong 的幂函数做不到的（幂次降低时整条曲线一起缩，能量凭空消失）。</li>
  <li>GGX 的裙边衰减得比 Blinn-Phong 慢得多（尾部更「胖」），所以掠射角上仍能看到一圈柔和的拉丝状余光——这是很多人第一次换 PBR 时觉得「质感突然对了」的直接原因。</li>
</ul>
<p>最后是那个著名的平方：<b>为什么 α = roughness²，而不是直接用 roughness？</b>因为 roughness 是美术手上的滑杆（0 到 1 线性拖动），α 是进公式的统计量。滑杆中段对应的是「从镜面过渡到半哑光」这段最需要分辨率的区间；取平方把线性输入压成非线性参数，让滑杆的手感接近人眼对光泽变化的感知——顺带还有一个副作用：α 是微镜子的<b>斜率标准差</b>，而方差天生是标准差的平方，所以这个平方有一半是量纲决定的，不是调出来的。</p>
<p>Godot 源码里那一行就是铁证（下一节源码走读会带你找到它，就夹在「算不算漫反射」和「算不算镜面」那两个 if 之间）：</p>
<pre>// scene_forward_lights_inc.glsl 内，SPECULAR_SCHLICK_GGX 分支
half alpha_ggx = roughness * roughness;</pre>
<p>一个细节值得记住：Godot 的 D_GGX 实现写成了 <code>k = α / (1 − NoH² + (NoH·α)²); d = k²/π</code> 的形式，和上面的教科书公式代数等价，但避免了显式的 α² 除法在小数处抖动——<b>同一条物理公式，工程写法要为数值精度让步</b>，这是引擎代码的常态。</p>`
    },
    {
      type: 'lab',
      lab: 'shader',
      key: 'pbrball',
      title: '实验 1：PBR 球——同一颗球、同一束光，三种算法同台',
      height: 620,
      code: `float4 main(float2 uv : TEXCOORD0) : SV_TARGET {
    // ══════════ 材质旋钮（改完 Ctrl+Enter 重编译，三栏同时生效）══════════
    const float METALLIC  = 0.0;     // 金属度 0~1：试 0 / 0.35 / 0.7 / 1.0
    const float ROUGHNESS = 0.22;    // 粗糙度 0~1：试 0.02 / 0.22 / 0.6 / 1.0
    const float SHININESS = 48.0;    // 只喂给中间那栏 Blinn-Phong（L4.2 的老朋友）
    const int   MODE      = 0;       // 0 三栏对比 / 1 只看左 / 2 只看中 / 3 只看右

    // 基色 albedo：程序化的方格布纹，方便看清「金属没有漫反射」到底意味着什么
    float2 cell = floor(uv * 7.0);
    float check = frac(cell.x * 0.5 + cell.y * 0.5);
    float3 ALBEDO = lerp(float3(0.72, 0.16, 0.12), float3(0.92, 0.86, 0.78), check);

    float aspect = u_resolution.x / u_resolution.y;
    float2 p = (uv - float2(0.5, 0.5)) * float2(aspect, 1.0);   // 世界系坐标，y 向上
    float seg = floor(uv.x * 3.0);                              // 0 左 / 1 中 / 2 右
    if (MODE > 0) { seg = float(MODE - 1); p.x = uv.x * aspect - aspect * 0.5; }

    // ─── 假球面：由屏幕位置解析出法线（L4.2 的手法）───
    float r2 = dot(p, p);
    if (r2 > 1.0) return float4(0.045, 0.055, 0.075, 1.0);     // 球外背景
    float zz = sqrt(max(1.0 - r2, 0.0));
    float3 N = normalize(float3(p.x, p.y, zz));
    float3 V = float3(0.0, 0.0, 1.0);                           // 眼睛在正前方

    // ─── 光源方向：鼠标相对画布中心的向量决定光从哪来（z 固定，保证光在半球内）───
    float2 lp = (u_mouse - float2(0.5, 0.5)) * float2(aspect, 1.0) * 2.0;
    float ll = sqrt(dot(lp, lp));
    float3 L = normalize(float3(lp, max(0.35, 1.0 - ll * 0.6)));
    float3 H = normalize(L + V);

    float NoL = saturate(dot(N, L));
    float NoV = max(dot(N, V), 1e-4);
    float NoH = saturate(dot(N, H));
    float LoH = saturate(dot(L, H));

    float3 col = ALBEDO * 0.03;                                 // 一点点环境底光
    float3 tint = float3(1.0, 0.78, 0.55);                      // 暖色平行光

    if (seg < 0.5) {
        // ══════════ 左栏：Lambert 漫反射（无高光、无菲涅尔、不守恒）══════════
        col += ALBEDO * NoL * tint;
    } else if (seg < 1.5) {
        // ══════════ 中栏：Blinn-Phong（L4.2 原版：三项拍脑袋相加）══════════
        col += ALBEDO * NoL * tint;
        col += pow(NoH, SHININESS) * tint;                       // 高光恒为白色，与材质无关
    } else {
        // ══════════ 右栏：完整金属度/粗糙度工作流（BRDF 逐项内联展开）══════════
        float F0 = 0.04;                                         // 非金属的垂直反射率（约 IOR 1.5）
        float3 Spec0 = lerp(float3(F0, F0, F0), ALBEDO, METALLIC);   // 金属：镜面色 = 基色
        float3 DiffCol = ALBEDO * (1.0 - METALLIC);                 // 金属：漫反射归零

        float alpha = ROUGHNESS * ROUGHNESS;                     // ← Godot 同款平方
        float a2 = alpha * alpha;
        float dd = NoH * NoH * (a2 - 1.0) + 1.0;
        float D = a2 / max(3.14159 * dd * dd, 1e-7);             // GGX 法线分布

        // Smith-Schlick 可见性（Hammon 形式，Godot 的 V_GGX 就是这个）
        float Vterm = 0.5 / mix(2.0 * NoL * NoV, NoL + NoV, alpha);

        float Fmix = pow(1.0 - LoH, 5.0);                        // Schlick 菲涅尔多项
        float f90 = clamp(50.0 * Spec0.g, METALLIC, 1.0);         // Godot 的掠射端近似
        float3 F = Spec0 + (f90 - Spec0) * Fmix;

        col += DiffCol * NoL * tint * (1.0 - F.r) * 0.318;        // 漫反射 ×(1−F)：能量守恒（0.318 ≈ 1/π）
        col += DiffCol * NoL * tint * 0.25 * (1.0 - METALLIC) * pow(1.0 - NoV, 5.0);  // 补一点漏掉的多散射
        col += (D * Vterm) * F * NoL * tint;                      // 镜面：D·V·F·NoL
    }

    // ─── 面板标识：身份色条 + 分隔缝 + 暗角（纯 UI，不属于光照计算）───
    if (uv.y < 0.055) {
        float3 tag = float3(0.92, 0.30, 0.20);
        if (seg > 0.5) tag = float3(0.25, 0.58, 0.95);
        if (seg > 1.5) tag = float3(0.30, 0.88, 0.45);
        col = tag;
    }
    float gap = step(0.992, frac(uv.x * 3.0)) + step(frac(uv.x * 3.0), 0.004);
    col = mix(col, float3(0.02, 0.02, 0.03), clamp(gap, 0.0, 1.0));
    col *= 1.0 - 0.25 * length(uv - 0.5);
    return float4(clamp(col, 0.0, 1.0), 1.0);
}
`
    },
    {
      type: 'text',
      title: '支柱二：菲涅尔——掠射角上人人都是镜子',
      html: `<p>第二条支柱要回答的问题是：<b>不管什么材质，只要你看得够斜，它就反光。</b>湖面平视时你能看见水底的石头，远望却是一面天空的镜子；手机屏幕正看是黑的、侧看照出人影。物理原因是入射角趋近 90° 时，任何两种折射率之间的界面反射率都趋近 1。</p>
<p>实时渲染用的是 Schlick 拟合——一个五次多项式，全场景只用一次乘法和几次减法：</p>
<pre>F(θ) = F0 + (1 − F0) · (1 − cos θ)^5</pre>
<ul>
  <li><b>F0</b>：垂直视角下的反射率，由材质的折射率决定。绝大多数非金属（塑料、清漆、皮肤、水、木头）的 F0 都挤在 0.02~0.05 之间，于是工业界统一取 <b>0.04</b> 当默认值——Godot 的 <code>F0()</code> 里写作 <code>0.16 × specular²</code>，specular 滑杆停在 0.5 时正好等于 0.04，两边是同一个约定。</li>
  <li><b>(1 − cosθ)^5</b>：那个 5 次方不是拟合出来的，是 Fresnel 方程在角度域的行为决定的：低阶多项式贴不住「正面几乎不变、掠射急速抬起」这条曲线的形状。Godot 的 <code>SchlickFresnel()</code> 干脆连 pow 都不调用，写成 <code>m2·m2·m</code>（m = 1−u），纯粹为了省一次超越函数。</li>
  <li>cosθ 取哪个夹角？严格说该取视线与法线的，工程上常取 <b>L·H</b>（半程向量与光线），因为它和高光项共用一个量，而且高光强的地方本来就该反射强。上面实验用的就是 LoH。</li>
</ul>
<p>菲涅尔真正的杀伤力不在高光那一项，而在它<b>逼出了第三条支柱</b>：如果掠射角上表面反射掉了 80% 的能量，剩下 20% 还能进漫反射吗？不能——能量已经交给镜面了。这就是下一段。</p>`
    },
    {
      type: 'text',
      title: '支柱三：能量守恒——F 拿走的那份必须有人还',
      html: `<p>把「预算」这个词认真用起来。一束光打到一个像素上，能量只有三个去向：<b>被镜面立刻反射走（specular）、钻进材质被散射出来（diffuse）、变成热（吸收）</b>。所以任何时刻都必须满足</p>
<pre>漫反射 + 镜面 + 吸收 ≤ 入射</pre>
<p>Blinn-Phong 从没守过这条规矩，它只是碰巧在中等参数下看着不太离谱。一旦你开始用低 roughness（大高光）或者加很多灯，超支就肉眼可见：整个物体过曝、白得像塑料玩具。</p>
<p>PBR 里最省事的一条守恒做法，就是拿菲涅尔结果去<b>削减漫反射</b>：</p>
<pre>diffuse = albedo × (1 − metallic) × (1 − F) × N·L / π</pre>
<p>这里有两个 (1−…)。第一个属于<b>金属度工作流的定义</b>：金属内部有大量自由电子，光一钻进去就被短路掉，几乎没有次表面散射——所以<b>金属没有漫反射</b>，它的 albedo 不再充当漫反射颜色，而是直接充当<b>镜面反射的颜色</b>（金子的 F0 本身就是橙黄色）。第二个 (1−F) 才是通用的记账：镜面在这个角度拿走了多少比例，漫反射就只能用剩下的。</p>
<p>还有一笔常被忘掉的账：GGX 是<b>单次散射</b>模型。微表面山谷里被挡住的光会反弹第二次、第三次，这部分能量在单散射积分里凭空消失了——表现为高 roughness 的金属变得死气沉沉地黑。业界叫它 multi-scatter 问题。Godot 的处理很务实：不做完整的多散射积分，而是在 IBL 那一段乘一个<b>能量补偿因子</b>（Filament 的做法）：</p>
<pre>// forward_clustered/scene_forward_clustered_inc.glsl
vec3 get_energy_compensation(vec3 f0, float env) {
    return 1.0 + f0 * (1.0 / env - 1.0);   // env 越小（漏得越多），补得越狠
}</pre>
<p>本课实验 1 的右栏里那一行「补一点漏掉的多散射」就是这个思想的极简版：只在掠射角、只对漫反射补一点，够你看懂「为什么要补」，不足以拿去生产。</p>`
    },
    {
      type: 'text',
      title: '把三根柱子装进一个公式：渲染方程与 BRDF',
      html: `<p>三条支柱本身不是公式，它们是<b>约束条件</b>。真正把它们组装起来的是那条渲染方程。去掉体积项，只剩两坨积分：</p>
<pre>L_o(ωo) = L_e(自发光)  +  ∫_Ω  f_r(ωi, ωo) · L_i(ωi) · (n·ωi)  dωi
                            └材质怎么分配┘  └来的光多强┘  └投影面积┘</pre>
<p>读法：对这个像素来说，输出亮度 = 所有可能方向来的入射光，各自乘以「这个材质朝你把能量分了多大比例」（BRDF），再乘以「这个方向的光斜着打过来的有效面积」（N·L），在半球上累加。那个 <code>dωi</code> 的积分是全场最贵的东西——一个像素要对上半球积分成千上万个方向，实时渲染绝不可能真算。</p>
<p>于是工业界的经典拆分（Karis / Epic 的 split-sum 近似）把它劈成两半：</p>
<table>
  <tr><th>来源</th><th>怎么处理</th><th>本课在哪看到</th></tr>
  <tr><td>少数几盏强灯（太阳、聚光、点光）</td><td>不退化成积分，直接逐灯求和：每盏灯算一次 f_r·L·N·L</td><td>实验 1 右栏（一盏鼠标灯）</td></tr>
  <tr><td>环境（天空、间接光）</td><td>预积分：辐照度用球谐或漫反射探针，镜面用预滤波 cubemap × 一张 DFG 查找表</td><td>实验 2 的环境项；源码走读里的 prefiltered_dfg</td></tr>
</table>
<p>拆完之后，BRDF 的标准形状是 Cook-Torrance：</p>
<pre>f_r = D(h, α)/(4·NoL·NoV)  ·  G(l, v, α)  ·  F(l, v, F0)      （再加一项漫反射）
        └微表面里有多少镜子朝向 h┘ └其中有多少没被邻居挡住┘ └这个角度能反多少┘</pre>
<p>三项分别就是三根柱子的化身：<b>D 管形状（微表面）、G 管遮挡（几何/可见性）、F 管份额（菲涅尔）</b>。分母那个 4·NoL·NoV 是为了让 D 的积分归一化，但它在 NoL 或 NoV 趋近 0 时会爆炸，所以工程上都把它折进 G 里——Godot 的 <code>V_GGX()</code> 名字里的 V 就是 visibility（= G/(4·NoL·NoV) 合并后的产物），一个 0.5 除上去收场。这类「公式漂亮、代码保守」的落差，正是引擎源码最值得看的地方。</p>`
    },
    {
      type: 'text',
      title: '金属度工作流：为什么是这两个旋钮',
      html: `<p>把上面所有约束折叠成美术能操作的东西，最后剩下两个数加一张颜色图：<b>albedo、metallic、roughness</b>。这套叫 metallic-roughness 工作流（另一派是 specular-glossiness，本质等价，只是把 F0 和掠射光泽分开存，Godot 的 StandardMaterial3D 两套都支持，默认前者）。</p>
<p>关键在于<b>每个通道都要能被测量</b>，这样不同美术、不同项目做出来的资产才能拼在一起而不打架：</p>
<table>
  <tr><th>通道</th><th>物理含义</th><th>怎么测 / 常见坑</th></tr>
  <tr><td>albedo</td><td>表面反射掉的比例（不含阴影、不含高光）</td><td>用分光光度计测。坑：把环境明暗烘进贴图 → 引擎再打一次光就双重照明。下限别低于 0.04，上限别高于 0.95，否则物理上不存在这种材料</td></tr>
  <tr><td>metallic</td><td>电导率的二值近似</td><td>自然界基本只有「是金属」和「不是金属」两极，中间值只代表脏污/磨损的边缘。所以这张图应该接近黑白，灰蒙蒙的金属度图通常是错误</td></tr>
  <tr><td>roughness</td><td>微表面朝向的分散程度</td><td>0 = 完美镜面（现实里几乎没有），0.5 ≈ 磨砂塑料，1 = 完全哑光。注意它进公式前会被平方，所以滑杆感觉「前半段没变化」是正常的</td></tr>
</table>
<p>对比 L4.2 的参数清单就能看出这次换代买了什么：<b>shininess 换成 roughness，高光颜色从常数变成 albedo 的派生量，强度靠菲涅尔自动配平。</b>结果是同一套材质参数在夕阳下、在室内弱光下、在 HDR 曝光拉高之后依然成立——因为参数不再是「此刻看起来对」的手感值，而是「这种材料是什么」的描述值。这也是为什么现代引擎的材质系统能把材质资产跨项目复用。</p>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'budget',
      title: '实验 2：能量预算台——一束光进来，谁分走多少',
      height: 600,
      code: `// 能量预算台：把「入射 = 漫反射 + 镜面 + 吸收」这笔账画成一摞堆叠柱。
// 左上圆盘：入射光方向自动巡游（按住鼠标可冻结，随时看清某一帧的分配）
// 上下方向键 调 roughness   左右方向键 调 metallic   R 回到初始值
// 柱子从左到右 = 越来越掠射的观察角；金色虚线 = 「如果没有能量守恒会怎样」
engine.run({
  setup: function (state) {
    state.rough = 0.22;      // 粗糙度
    state.metal = 0.0;       // 金属度
    state.theta = 0.0;       // 入射光方位角（自动巡游）
    state.freeze = false;    // 鼠标按住时冻结巡游
    state.cols = 9;          // 观察角数量
    state.t = 0;
  },

  update: function (state, dt, input) {
    state.freeze = !!input.mouse.down;
    if (!state.freeze) state.theta += dt * 0.55;
    if (input.down('ArrowUp'))    state.rough = Math.min(state.rough + dt * 0.5, 1);
    if (input.down('ArrowDown'))  state.rough = Math.max(state.rough - dt * 0.5, 0.02);
    if (input.down('ArrowRight')) state.metal = Math.min(state.metal + dt * 0.5, 1);
    if (input.down('ArrowLeft'))  state.metal = Math.max(state.metal - dt * 0.5, 0);
    if (input.pressed('KeyR')) { state.rough = 0.22; state.metal = 0; }
    state.t += dt;
  },

  draw: function (state, ctx) {
    var W = engine.W, H = engine.H;
    var i, j;
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, W, H);

    // ─── 左上：入射光示意盘 ───
    var cx = 118, cy = 132, rad = 78;
    ctx.strokeStyle = '#243149'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 6.2832); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - rad, cy); ctx.lineTo(cx + rad, cy); ctx.stroke();
    var th = Math.sin(state.theta) * 0.92;                 // 入射角（偏离法线，约 0..82°）
    var sx = cx + Math.sin(th) * rad, sy = cy - Math.cos(th) * rad;
    ctx.strokeStyle = '#ffb74d'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(cx, cy); ctx.stroke();
    ctx.fillStyle = '#ffd54f';
    ctx.beginPath(); ctx.arc(sx, sy, 7, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = '#34d399'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - Math.sin(th) * rad * 0.7, cy - Math.cos(th) * rad * 0.7); ctx.stroke();
    ctx.fillStyle = '#8fa7c7'; ctx.font = '12px sans-serif';
    ctx.fillText('法线 N', cx + 4, cy - rad - 6);
    ctx.fillText('入射 L', sx + 8, sy + 4);
    ctx.fillText('反射 R', cx - Math.sin(th) * rad * 0.7 - 46, cy - Math.cos(th) * rad * 0.7);
    ctx.fillStyle = '#e2e8f0'; ctx.font = '14px sans-serif';
    ctx.fillText('入射角 ' + Math.round(Math.abs(th) * 57.2958) + '°', 12, 236);

    // ─── BRDF 内核（与实验 1 右栏同一套公式，这里是标量版）───
    function fresnelShare(cosang, metal) {
      var m = 1 - Math.max(0, Math.min(1, cosang));
      var m2 = m * m;
      var f0v = metal * 0.72 + (1 - metal) * 0.04;   // 金属：镜面色取自基色（这里用 0.72 代表红的亮度）
      var f90 = Math.min(1, Math.max(metal, 50 * f0v * 0.33));
      return f0v + (f90 - f0v) * m2 * m2 * m;
    }
    function ggxD(noH, alpha) {
      var a2 = alpha * alpha;
      var d = noH * noH * (a2 - 1) + 1;
      return a2 / Math.max(3.14159 * d * d, 1e-7);
    }
    function visGGX(nol, nov, alpha) {
      var mixv = 2 * nol * nov;
      var w = alpha * (nol + nov - mixv) + mixv;
      return 0.5 / Math.max(w, 1e-5);
    }

    var alpha = state.rough * state.rough;
    var plotX = 286, plotW = W - plotX - 22;
    var baseY = H - 104, topY = 74;
    var barW = plotW / state.cols;

    // 网格与轴
    ctx.strokeStyle = '#1b2436'; ctx.lineWidth = 1;
    for (i = 0; i <= 4; i++) {
      var gy = baseY - (baseY - topY) * i / 4;
      ctx.beginPath(); ctx.moveTo(plotX, gy); ctx.lineTo(plotX + plotW, gy); ctx.stroke();
      ctx.fillStyle = '#5b6c8c'; ctx.font = '11px monospace';
      ctx.fillText((i / 4).toFixed(2), plotX - 34, gy + 4);
    }
    ctx.fillStyle = '#8fa7c7'; ctx.font = '12px sans-serif';
    ctx.fillText('观察角 →  0°          30°          55°          80°', plotX, H - 84);
    ctx.fillText('一束光的能量预算 = 1.00', plotX, 46);

    for (i = 0; i < state.cols; i++) {
      var view = (i / (state.cols - 1)) * 1.40;            // 观察角 0..80°
      var halfA = Math.abs(th - view) * 0.5 + 0.0001;     // 半程向量与法线的夹角
      var noh = Math.cos(halfA);
      var nol = Math.max(0.05, Math.cos(th));
      var nov = Math.max(0.05, Math.cos(view));
      var F = fresnelShare(noh, state.metal);
      var specRaw = ggxD(noh, alpha) * visGGX(nol, nov, alpha) * nol;
      // 归一化到高光峰值，只为把「份额」画清楚（真实幅度还要乘光强与立体角）
      var specShare = Math.min(1, F * Math.min(1, specRaw * 1.2));
      var diffShare = (1 - state.metal) * (1 - F) * nol * 0.32;
      var absorb = Math.max(0, 1 - specShare - diffShare);

      var x = plotX + i * barW + barW * 0.16;
      var w = barW * 0.68;
      var acc = baseY;
      var segs = [
        [diffShare, 'rgba(220,90,70,0.92)'],
        [specShare, 'rgba(120,190,255,0.92)'],
        [absorb,    'rgba(38,50,70,0.95)']
      ];
      for (j = 0; j < segs.length; j++) {
        var hh = (baseY - topY) * Math.max(0, Math.min(1, segs[j][0]));
        acc -= hh;
        ctx.fillStyle = segs[j][1];
        ctx.fillRect(x, acc, w, hh);
      }
      // 没有能量守恒时的总量（Blinn-Phong：镜面加在旁边，谁也不扣谁）
      var naiveTop = baseY - (baseY - topY) * Math.min(1, (1 - state.metal) * nol * 0.32 + specShare);
      ctx.strokeStyle = 'rgba(255,200,90,0.85)'; ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(x - 3, naiveTop); ctx.lineTo(x + w + 3, naiveTop); ctx.stroke();
      ctx.setLineDash([]);
    }

    // 图例
    var lg = [['漫反射 diffuse', 'rgba(220,90,70,0.92)'], ['镜面 specular', 'rgba(120,190,255,0.92)'], ['吸收 / 未回收', 'rgba(38,50,70,1)'], ['若无守恒（BP）', 'rgba(255,200,90,1)']];
    for (i = 0; i < lg.length; i++) {
      var lx = plotX + i * 112;
      if (i < 3) { ctx.fillStyle = lg[i][1]; ctx.fillRect(lx, H - 60, 12, 12); }
      else { ctx.strokeStyle = lg[i][1]; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(lx, H - 54); ctx.lineTo(lx + 14, H - 54); ctx.stroke(); ctx.setLineDash([]); }
      ctx.fillStyle = '#9db4d0'; ctx.font = '12px sans-serif';
      ctx.fillText(lg[i][0], lx + 18, H - 50);
    }

    // 当前读数
    ctx.fillStyle = '#e8b04b'; ctx.font = '15px sans-serif';
    ctx.fillText('roughness ' + state.rough.toFixed(2) + '   metallic ' + state.metal.toFixed(2), 12, 268);
    ctx.fillStyle = '#9db4d0'; ctx.font = '13px sans-serif';
    ctx.fillText('alpha = rough² = ' + alpha.toFixed(3), 12, 290);
    ctx.fillText('↑↓ 粗糙度 · ←→ 金属度 · R 复位 · 按住鼠标冻结光路', 12, 314);
    ctx.fillText('掠射角上蓝条涨、红条塌：那就是菲涅尔在抢预算。', 12, 336);
    ctx.fillText('metallic 拉满 → 红条整排消失（金属没有漫反射）。', 12, 356);
    ctx.fillText('漫反射剩 ' + ((1 - state.metal) * 100).toFixed(0) + '%', 12, 380);
  }
});
`
    },
    {
      type: 'text',
      title: '拆解实验 2：三个你一定会看到的现场',
      html: `<p><b>① 掠射角上红塌蓝涨。</b>把入射光停在小角度（比如 20°），看横排柱子的最右边几根：菲涅尔把预算几乎全给了镜面，漫反射塌成薄薄一层。这不是调色，是记账——所以「远处地面变亮变镜面」在任何 PBR 场景里都是自动发生的，不需要美术做任何事。</p>
<p><b>② 把 metallic 拉到 1。</b>整排的红色（漫反射）瞬间归零，柱子上只剩蓝色与吸收。同时如果你回头改实验 1 的基色，会发现金属的外观完全由 albedo 的色调决定——这就是「金属的漫反射是黑的、镜面是彩色的」这句美术口诀的物理版本。反过来，把 metallic 保持 0 而狂改 albedo，高光始终是淡淡的白：非金属的 F0 是固定 0.04，跟颜色无关。</p>
<p><b>③ 金色虚线跑在最上面。</b>那是「如果不做守恒会怎样」的 Blinn-Phong 高度：漫反射和镜面各算各的，直接相加。低 roughness、掠射角两处，虚线和实心的差距最大——超出 1 的那部分，在真实世界里根本不可能存在，但在老管线里会以过曝的形式出现在你的画面上。这也解释了为什么 PBR 必须配 HDR：真实的镜面高光亮度可以远高于漫反射，把它压进 0~1 之前，你得先有一张允许超过 1 的缓冲（L4.4 的第一站）。</p>
<p>还有一处细节值得盯：<b>吸收（深灰段）随 roughness 增大而变厚</b>。这不代表材质真的吸收了更多，而是我们的归一化很粗糙——GGX 的单次散射积分本身就随 roughness 丢失能量，加上我们没有把 D 项严格归一化到份额。这个「看起来像 bug 的东西」恰恰是真问题：它就是上一节说的 multi-scatter 缺失，Godot 用一个查表得到的 <code>energy_compensation</code> 去还这笔债。</p>`
    },
    {
      type: 'source',
      title: '源码走读 1：三根柱子在 Godot 里的六行代码',
      files: [
        { path: 'servers/rendering/renderer_rd/shaders/scene_forward_lights_inc.glsl', note: '本课的主菜。开头几行就是三大支柱的实现：D_GGX()（第 18 行起，注意它写成 k = roughness / (1 − NoH² + (NoH·roughness)²) 再平方的形式，与教科书公式等价但更抗小数抖动）、V_GGX()（第 56 行，Smith 可见性，注释直接署名 Hammon 的 GDC 讲稿）、SchlickFresnel()（第 76 行，pow(m,5) 手写成 m2·m2·m 省一次超越函数）、F0()（第 82 行，dielectric = 0.16 × specular²，然后 mix(dielectric, albedo, metallic) —— 一行代码同时表达「非金属恒定 4%」和「金属的镜面色 = 基色」）。再往下搜 light_compute：第 220 行的 if (metallic &lt; 1.0) 守卫决定要不要算漫反射，第 251 行的 if (roughness &gt; 0.0) 才算镜面，第 268~292 行把 D、G、F 三项乘起来（alpha_ggx = roughness * roughness 就在第 270 行）。' },
        { path: 'servers/rendering/renderer_rd/shaders/forward_clustered/scene_forward_clustered.glsl', note: '装配现场。搜 SPECULAR_SCHLICK_GGX（约 1042 行）看默认 specular 模式怎么选（真正的 D·G·F 组装在上一节那份 include 里，这里只负责选分支）；搜 "apply metallic"（约 3135 行）看到 diffuse_light *= 1.0 − metallic 与 ambient_light *= 1.0 − metallic —— 金属没有漫反射，在着色器层就是一句乘法；搜 SCENE_DATA_FLAGS_USE_ROUGHNESS_LIMITER（约 1666 行）是个彩蛋级细节：法线贴图让相邻像素法线剧变时，用 dFdx/dFdy 估出法线方差、反向抬高 roughness 来抑制高光闪烁（Square Enix 的 Geometric Specular AA），旁边还有「roughness⁴ 会塌成 0 导致除零」的防御性钳制（约 1675 行）。' },
        { path: 'servers/rendering/renderer_rd/shaders/forward_clustered/scene_forward_clustered_inc.glsl', note: '环境光那半边账。搜 get_energy_compensation（约 511 行）：1.0 + f0 * (1/env − 1)，注释直指 Filament 的多散射补偿章节；紧邻的 prefiltered_dfg（约 505 行）就是 split-sum 里那张 DFG 查找表的采样——把「半球积分」预先烘焙成一次 texture 读取，是本课「渲染方程算不起怎么办」的最终答案。' }
      ]
    },
    {
      type: 'text',
      title: '走读提示：三个灵魂拷问在这一课的答案',
      html: `<p><b>数据怎么流动。</b>沿着三个旋钮追一遍就通了整条材质链。你在编辑器里填的 metallic/roughness 数值或贴图，被打包进一个叫 <b>ORM</b> 的复合纹理：R 通道放 AO、G 放 roughness、B 放 metallic（Godot 导入时自动合成，MODE_RENDER_MATERIAL 路径甚至专门输出一张 orm_output_buffer，见 scene_forward_clustered.glsl 第 3091~3093 行）。到了着色器里，material 代码段把值写进 <code>roughness_highp / metallic_highp / albedo_highp</code>（同文件第 1187~1195 行是它们的默认值），第 1317~1319 行转成交给光照函数的局部量，然后原封不动送进 <code>light_compute(...)</code>。贴花还能覆盖它们（搜 decal_orm：ao/roughness/metallic 三个 mix 连着写）——同一个变量一路被覆写，最后一次说了算。</p>
<p><b>所有权归谁。</b>这些值不属于任何 Node。Node 持有的是 Material <b>资源</b>（引用计数）；RenderingDevice 持有 buffer 与纹理（真正的 GPU 内存）；材质参数通过 push constant / uniform buffer 下发，逐实例不同的量走 instance 数据。特别注意 ORM 这张图：它是<b>导入产物的资产</b>，生命周期跟着 Resource 走，而不是跟着某一次 draw 走——所以三张 8bit 灰度图合成一张，省下的是「每帧三次独立采样 + 三份显存 + 三套 mip 缓存」，这笔账是资源级的，不是像素级的。</p>
<p><b>什么时候发生。</b>逐灯求和发生在片元里、每帧、每盏被分配到本簇的光一次（这是 forward clustered 的调度粒度）；而环境的半球积分发生在<b>构建期/后台</b>：radiance octmap 的预滤波（effects/octmap_roughness.glsl 里的 ImportanceSampleGGX 与 DistributionGGX）以及 DFG 表，都是「离线算好、运行时只查表」。同一个积分，直光在帧内算、间接光在帧外算——理解了这个时间差，就理解了为什么加第十盏灯会掉帧、而换一张 HDRI 不会。</p>`
    },
    {
      type: 'text',
      title: '边界与现实：PBR 没解决的那些事',
      html: `<p>诚实地列出这套模型的裂缝，比记住它的公式更有价值：</p>
<ul>
  <li><b>metallic 是二值的，现实不是。</b>涂了清漆的金属、氧化层、湿沙子都处在中间。硬套 metallic 会得到「要么太塑料要么太镜子」，工业界为此加了 coat（Godot 的 clearcoat 分支就在 light_compute 里，自己单独走一套 D/G/F，再乘 cc_attenuation 扣掉底层能量）。</li>
  <li><b>各向同性假设。</b>拉丝金属、头发、织物沿某个方向有条纹，GGX 需要换成双 α 的版本——Godot 里就是 D_GGX_anisotropic / V_GGX_anisotropic 那两个函数，代价是多一套切线空间。</li>
  <li><b>半程向量 H 是近似。</b>它假设光源在无穷远（平行光）。点光源很近时微镜子的正确朝向不再是 L 与 V 的角平分线，高光会歪——近距离大面积光源还得靠 area light 的可视化球体或 LTC 查找表。</li>
  <li><b>albedo 不该含任何明暗。</b>这是最常见的资产错误：把环境阴影烘进基色，引擎再乘一次光照，物体会黑得像烧过。判据很简单——一张合格的 albedo 图，它的平均值应该接近该材料的实测反射率（0.04~0.95 之间）。</li>
  <li><b>线性空间是前置条件。</b>上面所有公式都假定颜色是线性辐射值。如果在 sRGB 编码值上做光照，菲涅尔的幂次、GGX 的平方全都失真（这正是下一课 J2 的主题）。</li>
</ul>`
    },
    {
      type: 'source',
      title: '源码走读 2：出口在 tone mapping',
      files: [
        { path: 'servers/rendering/renderer_rd/shaders/effects/tonemap.glsl', note: '接 L4.4 的那一课。搜 apply_tonemapping（约 246 行，注释写明 inputs are LINEAR）与 tonemap_aces（约 119 行）：PBR 算出的镜面高光可以是几十甚至上百（低 roughness 的 GGX 峰值本来就高），它们必须在 HDR 缓冲里活着走到这里才被压进显示器范围。第 893 行的调用顺序（glow 合成之后才 tonemap）也印证了后处理那批课的结论：守恒算得再准，压幅压早了照样毁掉高光层次。' }
      ]
    },
    {
      type: 'text',
      title: '试一试（课内可选）',
      html: `<ul>
  <li>实验 1：ROUGHNESS 依次设 0.02 / 0.22 / 0.6 / 1.0，只盯右栏。你会发现高光不只是「变糊」，而是<b>变暗且摊开</b>，同时边缘那圈菲涅尔余光越来越明显——这就是 D 项面积守恒的视觉表现。同样四组值看左栏和中栏：它们只会「变糊」，不会变暗。</li>
  <li>实验 1：METALLIC 从 0 拉到 1（其余不动）。右栏会从「暗红布 + 白高光」变成「橙红金属 + 彩色高光」，中栏的 Blinn-Phong 却几乎毫无反应——因为它压根没有 metallic 这个概念。这一步最能说明「参数可测量」的价值。</li>
  <li>实验 1：把 MODE 改成 3 只看右栏，然后把鼠标拖到画布最边缘（光源掠射）。整个球会开始像镜子一样亮起边缘，即使 roughness 很高。那就是 F 项在掠射角趋近 1。</li>
  <li>实验 1：删掉右栏那两行 <code>× (1.0 - F.r)</code> 与补偿项，只留裸的 Lambert + GGX。对比一下：高光变强、暗部失去过渡，物体看起来「油腻」。少一条守恒律，画面立刻露馅。</li>
  <li>实验 2：把 metallic 顶到 1、roughness 降到 0.05，此时蓝条几乎吃掉全部预算、金色虚线与实心几乎重合（因为漫反射本来就没了）。再慢慢把 roughness 加回 1.0，观察吸收段的厚度变化，并解释它为什么不是真实物理。</li>
  <li>源码：在 scene_forward_lights_inc.glsl 里把 D_GGX、V_GGX、SchlickFresnel、F0 四个函数各自的行数标在旁边，然后回到实验 1 右栏，把你的每一行对号入座——你会发现除了归一化系数，两者一一对应。</li>
</ul>`
    },
    {
      type: 'text',
      title: '小结',
      html: `<p>PBR 不是「更贵的光照公式」，而是<b>给光照套上三条不许违反的约束，再把自由度收敛成三个可测量的资产通道</b>：微表面统计（D，配 α = roughness²）、掠射反射率（F，Schlick 五次多项式，F0 由 metallic 在 0.04 与 albedo 之间插出来）、能量预算（漫反射乘 (1−metallic)(1−F)，多散射漏掉的债用 energy_compensation 还）。</p>
<p><b>数据怎么流动</b>：albedo/metallic/roughness 打包成一张 ORM 纹理 → material 代码段写进 *_highp → light_compute 里 D·G·F 相乘 → 直光逐灯累加、环境光查预积分表 → 结果连同可能远超 1 的高光写进 HDR 场景缓冲 → 最后由 tonemap 压进显示器范围。</p>
<p><b>所有权归谁</b>：Node 只持有 Material 资源的引用；uniform buffer 与 ORM 纹理归 RenderingDevice / 导入管线所有，跨帧复用；参数下发是逐 pass 的 push constant。三个旋钮的生命周期是「资产级」的，不是「像素级」的——这正是把它们合成一张图的动机。</p>
<p><b>什么时候发生</b>：菲涅尔与能量削减发生在每次 light_compute 内部、逐灯逐帧；GGX 的平方换算在同一处；而环境半球积分（radiance 预滤波、DFG 表）发生在构建期与后台线程，运行时只是一次 texture 读取；tone mapping 永远殿后。</p>
<p>带着这套心智模型回头看 L4.2：那个假球其实只差三行就升级成 PBR——你已经在本课实验 1 里亲手补上了。往前看 J2：所有这些公式都要求输入是线性辐射值，而你的贴图默认是 sRGB，这一步搞错会让整套物理约束白搭；再看 B6/B8：阴影与 raymarching 用的仍是同一条 BRDF，换的只是「哪些方向参与积分」。</p>`
    }
  ]
}
