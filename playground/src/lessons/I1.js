// I1 · 噪声大观:Perlin、Simplex 与 Worley
export default {
  id: 'I1',
  title: '噪声大观：Perlin、Simplex 与 Worley',
  est: '2 小时',
  coreQuestions: [
    'value / Perlin / Simplex / Worley 四种噪声各长什么样、贵在哪？',
    '「插值随机数」和「梯度随机数」的视觉差别从哪来？',
    'Worley 的细胞感是怎么用「最近特征点距离」造出来的？',
    '倍频叠加（fbm）在买什么？FastNoiseLite 为什么一统江湖？'
  ],
  sections: [
  {
    type: 'text',
    title: '四种噪声的性格图谱',
    html: `<table>
  <tr><th>噪声</th><th>做法</th><th>长相</th><th>成本</th></tr>
  <tr><td>value</td><td>格点存随机数，格内平滑插值</td><td>块状、略「方」</td><td>最便宜</td></tr>
  <tr><td>Perlin</td><td>格点存随机「梯度」，投影出噪声</td><td>经典山峦，方向感强</td><td>中</td></tr>
  <tr><td>Simplex</td><td>斜格+单形（三角形）梯度</td><td>更圆润、各向同性</td><td>中低（高维更省）</td></tr>
  <tr><td>Worley</td><td>每格一个特征点，取「最近距离」</td><td>细胞/鹅卵石</td><td>要搜邻格</td></tr>
</table>
<p>value 与 Perlin 的差别在「格点存什么」：存数值（value）只能靠插值抹平，天然有格状对齐痕迹；存<b>梯度向量</b>（Perlin/Simplex）则在格间做投影，等值线更自然。Worley 完全是另一种思路——不插值，而是<b>「我离最近的种子点有多远」</b>，距离场天然长成细胞。</p>`
  },
  {
    type: 'text',
    title: 'fbm 与 FastNoiseLite',
    html: `<p>单一频率的噪声只有「一种粗细」。把同一噪声按<b>频率翻倍、振幅减半</b>叠很多层，就是 <b>fbm（分形布朗运动）</b>——低频给轮廓、高频给细节，D1 的地形、云图、大理石纹全是它。层数越多细节越富，成本线性上涨。</p>
<p>Godot 的答案是把全家桶装进一个类：<b>FastNoiseLite</b>——一个 noise_type 字段在 value/perlin/open-simplex/cellular 之间切换，再加 fbm 参数组（octaves/gain/frequency），配上 NoiseTexture2D 直接烘成贴图。本课四联屏就是它的「接口预览」。</p>`
  },
  {
    type: 'lab',
    lab: 'shader',
    key: 'noisefamily',
    title: '实验：四噪声全家福（四联屏 + fbm 混合）',
    height: 620,
    code: `float4 main(float2 uv : TEXCOORD0) : SV_TARGET {
  // 四联屏:从左到右 value / Perlin / Simplex(斜格梯度) / Worley
  // 鼠标 Y 越高=fbm 层数越足;u_time 缓慢流动(z 维)
  float panel = floor(uv.x * 4.0);
  float2 p;
  p.x = (frac(uv.x * 4.0)) * 7.0;
  p.y = uv.y * 7.0;
  float z = u_time * 0.15;

  // ---- 通用 hash ----
  // h(i) = fract(sin(dot(i,k))*BIG)

  // ---- 1) value 噪声 ----
  float2 iv = floor(p), fv = frac(p);
  float2 sv = fv * fv * (3.0 - 2.0 * fv);
  float v00 = frac(sin(dot(iv + float2(0, 0), float2(127.1, 311.7))) * 43758.5453);
  float v10 = frac(sin(dot(iv + float2(1, 0), float2(127.1, 311.7))) * 43758.5453);
  float v01 = frac(sin(dot(iv + float2(0, 1), float2(127.1, 311.7))) * 43758.5453);
  float v11 = frac(sin(dot(iv + float2(1, 1), float2(127.1, 311.7))) * 43758.5453);
  float nValue = lerp(lerp(v00, v10, sv.x), lerp(v01, v11, sv.x), sv.y);

  // ---- 2) Perlin(梯度) ----
  float2 ip = floor(p), fp = frac(p);
  float2 up = fp * fp * fp * (fp * (fp * 6.0 - 15.0) + 10.0);
  float a1 = frac(sin(dot(ip + float2(0, 0), float2(127.1, 311.7))) * 43758.5453) * 6.2832;
  float a2 = frac(sin(dot(ip + float2(1, 0), float2(127.1, 311.7))) * 43758.5453) * 6.2832;
  float a3 = frac(sin(dot(ip + float2(0, 1), float2(127.1, 311.7))) * 43758.5453) * 6.2832;
  float a4 = frac(sin(dot(ip + float2(1, 1), float2(127.1, 311.7))) * 43758.5453) * 6.2832;
  float g00 = dot(float2(cos(a1), sin(a1)), fp - float2(0, 0));
  float g10 = dot(float2(cos(a2), sin(a2)), fp - float2(1, 0));
  float g01 = dot(float2(cos(a3), sin(a3)), fp - float2(0, 1));
  float g11 = dot(float2(cos(a4), sin(a4)), fp - float2(1, 1));
  float nPerlin = lerp(lerp(g00, g10, up.x), lerp(g01, g11, up.x), up.y) * 0.7 + 0.5;

  // ---- 3) Simplex 风味(斜格梯度) ----
  float skew = 0.3660254;
  float2 sp = p + (p.x + p.y) * skew;
  float2 si = floor(sp);
  float2 q = si - (si.x + si.y) * 0.2113249;
  float2 c0 = p - q;
  float2 c1 = c0 - float2(0.2113249, -0.2113249) * 2.0;
  float2 c2 = c0 - float2(0.5773503, 0.5773503);
  float h0 = frac(sin(dot(si + float2(0, 0), float2(127.1, 311.7))) * 43758.5453) * 6.2832;
  float h1 = frac(sin(dot(si + float2(1, 0), float2(127.1, 311.7))) * 43758.5453) * 6.2832;
  float h2 = frac(sin(dot(si + float2(0, 1), float2(127.1, 311.7))) * 43758.5453) * 6.2832;
  float n0 = dot(float2(cos(h0), sin(h0)), c0);
  float n1 = dot(float2(cos(h1), sin(h1)), c1);
  float n2v = dot(float2(cos(h2), sin(h2)), c2);
  float rad = 0.5;
  n0 = max(0.0, rad - dot(c0, c0)) * n0;
  n1 = max(0.0, rad - dot(c1, c1)) * n1;
  n2v = max(0.0, rad - dot(c2, c2)) * n2v;
  float nSimplex = (n0 + n1 + n2v) * 6.0 + 0.5;

  // ---- 4) Worley(细胞) ----
  float2 wi = floor(p), wf = frac(p);
  float minD = 8.0;
  for (int oy = -1; oy <= 1; oy++) {
    for (int ox = -1; ox <= 1; ox++) {
      float2 cell = wi + float2(ox, oy);
      float ha = frac(sin(dot(cell, float2(127.1, 311.7))) * 43758.5453);
      float hb = frac(sin(dot(cell, float2(269.5, 183.3))) * 43758.5453);
      float2 fp2 = cell + float2(ha, hb) - p;
      minD = min(minD, dot(fp2, fp2));
    }
  }
  float nWorley = sqrt(minD);

  // ---- 选屏 + fbm 混合(鼠标 Y 控制细节层强度) ----
  float n = nValue;
  if (panel > 2.5) n = nWorley;
  else if (panel > 1.5) n = nSimplex;
  else if (panel > 0.5) n = nPerlin;
  float oct = clamp((u_mouse.y - 0.1) * 1.4, 0.0, 1.0);
  float2 p2 = p * 2.03 + float2(z * 0.7, -z);
  float fine = frac(sin(dot(floor(p2) + float2(31.7, 91.3), float2(127.1, 311.7))) * 43758.5453);
  n = n * (1.0 - oct * 0.55) + fine * oct * 0.55;
  // 缓慢流动
  n += z * 0.05;

  // 每屏轻微色相区分
  float3 tint = float3(0.5 + 0.5 * cos(6.2832 * (panel * 0.25 + 0.1)), 0.75, 0.5 + 0.35 * sin(panel * 2.0));
  float3 col = n * tint;
  // 屏间分隔线
  if (frac(uv.x * 4.0) < 0.012) col = float3(0.05, 0.07, 0.1);
  return float4(col, 1);
}`
  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>对比第 1、2 屏：</b>value 屏有隐约的方块对齐感，Perlin 屏的等值线更「山峦」——「格点存数值 vs 存梯度」的视觉差。</li>
  <li><b>看第 3 屏：</b>Simplex 风味的噪声没有明显轴向痕迹（各向同性），而且比 Perlin 少查两个格点。</li>
  <li><b>看第 4 屏：</b>Worley 完全不像噪声，像鹅卵石/细胞壁——「最近特征点距离」的天然产物；它天生适合石纹、闪电、破碎纹路。</li>
  <li><b>鼠标从下往上滑：</b>高频细节层渗入，四屏同时变「毛躁」——这就是 fbm 的第 2 倍频；真实引擎里这个旋钮叫 octaves。</li>
  <li><b>等 u_time 流动：</b>噪声整体缓慢演变——3D 噪声的 z 轴采样，云与火焰的「活着」全靠它。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：FastNoiseLite 全家桶',
    files: [
      { path: 'modules/noise/noise.cpp', note: 'Noise 抽象基类：get_image/get_seamless 等统一接口——「噪声」在引擎里是一种可替换的 Resource。建议搜索：get_image、get_noise_2d。' },
      { path: 'modules/noise/fastnoise_lite.cpp', note: '本课四联屏的官方完全体：noise_type 切换 value/perlin/open-simplex/cellular，fbm 参数组一应俱全。建议搜索：noise_type、set_fractal_octaves、cellular。' },
      { path: 'modules/noise/noise_texture_2d.cpp', note: '噪声烘成贴图：seamless 无缝、颜色 ramp 映射——「预计算成资产」的噪声使用姿势。建议搜索：_update_texture、seamless、color_ramp。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>噪声家族的选型逻辑：要便宜选 value、要经典山峦选 Perlin、要各向同性和高维省钱选 Simplex、要细胞结构选 Worley；再叠 fbm 补细节，最后烘成贴图当资产。D1 的地形、I2 的 WFC、程序化贴图——全宇宙的程序化内容一半从这里出发。</p>
<ul>
  <li><b>数据怎么流动？</b>整数格点→hash→（数值插值 / 梯度投影 / 距离场）→噪声值→fbm 叠加→贴图或直接采样。</li>
  <li><b>所有权归谁？</b>噪声是纯函数：同坐标同参数必同值——无状态是它最大的美德（回扣 I4：hash 就是它的「种子」）。</li>
  <li><b>什么时候发生？</b>运行时逐像素采样（shader）或预烘焙（NoiseTexture2D）——「实时算还是烘成资产」是噪声使用的第一决策。</li>
</ul>`
  }
  ]
};
