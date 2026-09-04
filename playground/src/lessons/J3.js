// J3 · mipmap 与纹理走样:远处为什么闪烁
export default {
  id: 'J3',
  title: 'mipmap 与纹理走样：远处为什么闪烁',
  est: 2,
  coreQuestions: [
    '远处的棋盘格为什么会闪成一片花纹？采样定理的图形学版本说了什么？',
    'mipmap 的「每级减半」在买什么？三线性混合补的是什么缝？',
    '各向异性过滤为什么「顺着压缩方向多采几刀」就有效？',
    '引擎在哪个瞬间决定用哪一级 mip？'
  ],
  sections: [
  {
    type: 'text',
    title: '闪烁的数学身份：欠采样',
    html: `<p>一张 512×512 的棋盘贴图铺在无限远的平面上：离相机越远，<b>一个屏幕像素要代表的纹素越多</b>。当密度超过「每像素 1 个纹素」，采样定理亮红灯——像素只能每帧「抽签」一个纹素，抽到黑还是白几乎随机：画面开始<b>闪烁（shimmering/moiré）</b>。</p>
<p>这不是渲染 bug，是信息论：<b>一个像素装不下两个纹素的信息</b>。唯一正确的处理是——先在纹素空间做低通滤波（把细节平均掉），再采样。mipmap 就是这套滤波的工业实现。</p>`
  },
  {
    type: 'text',
    title: 'mipmap、三线性与各向异性',
    html: `<table>
  <tr><th>技术</th><th>做法</th><th>补什么</th></tr>
  <tr><td>mipmap</td><td>预生成 1/2、1/4、1/8… 每级把 2×2 纹素平均成 1 个</td><td>「远处有合适的低频版本可采」</td></tr>
  <tr><td>三线性过滤</td><td>在相邻两级 mip 各双线性采样一次，再按小数部分混合</td><td>级与级之间的「跳变缝」</td></tr>
  <tr><td>各向异性过滤</td><td>沿纹理被压缩的方向多采几个 tap（2x/4x/8x/16x）</td><td>斜视角下的方向性模糊（地板远端）</td></tr>
</table>
<p>硬件怎么知道该用哪级 mip？光栅器以 <b>2×2 像素为一个小队（quad）</b>，用相邻像素的 UV 差分（ddx/ddy）估算密度，取 log2 选级——所以 mipmap 是「GPU 替你算好该糊多少」的服务。本课实验用解析方法手算这个密度（透视平面的密度 ∝ 1/深度²），把三档策略并排画给你看。</p>`
  },
  {
    type: 'lab',
    lab: 'shader',
    key: 'mipmap',
    title: '实验：透视棋盘三联对比（无 mip / 三线性 / 各向异性）',
    height: 620,
    code: `float4 main(float2 uv : TEXCOORD0) : SV_TARGET {
  // 三联屏:无 mip / 三线性 mip / 三线性+各向异性(4tap)
  // 鼠标 Y=纹理密度倍率(拉高更远处开始闪烁)  u_time=轻微滑动让闪烁可见
  float panel = floor(uv.x * 3.0);
  float u = frac(uv.x * 3.0);

  // 透视地面:屏幕 y∈(0,0.75) 映射到地面,深度随 1/y 增长
  float horizon = 0.18;
  float groundT = clamp((horizon - uv.y) / (horizon + 0.05), 0.0, 1.0);
  float depth = 0.35 / max(groundT, 0.012);          // 越靠上越远(1/y 透视)
  float slide = u_time * 0.25;
  float wx = (u - 0.5) * depth * 2.2 + slide;        // 世界横向坐标
  float wy = depth + slide * 0.6;                    // 世界纵向坐标
  float densityMul = 6.0 + clamp((u_mouse.y - 0.15) * 14.0, 0.0, 12.0);

  // 纹素密度:每像素多少个棋盘格周期(解析算出,硬件里等价于 ddx/ddy)
  float density = depth * densityMul;
  float level = clamp(density, 0.0, 4.0);            // mip 级别 0~4(每级频率减半)

  // 棋盘函数:level=0 全频;level 每翻一级,对比度向均值坍缩一层
  float checker = frac(floor(wx + wy) + floor(wx - wy)) < 0.5 ? 1.0 : 0.0;
  float contrast = exp(-level * 0.85);               // 对比度随 mip 级衰减
  float mean = 0.5;
  float sampled = lerp(mean, checker, contrast);

  // 各向异性:沿横向(被压缩方向)取 4 个 tap 平均,再过一次棋盘阈值
  float aniso = 0.0;
  for (int k = 0; k < 4; k++) {
    float off = (k / 4.0 - 0.375) * density * 0.55;
    float ck = frac(floor(wx + off + wy) + floor(wx + off - wy)) < 0.5 ? 1.0 : 0.0;
    aniso += ck;
  }
  aniso /= 4.0;
  float anisoSampled = lerp(mean, aniso, exp(-level * 0.45));

  // 天空区
  float3 col = float3(0.06, 0.08, 0.12);
  if (uv.y > horizon) {
    if (panel < 0.5) col = float3(sampled, sampled, sampled) * 0.85;
    else if (panel < 1.5) col = float3(sampled, sampled, sampled);
    else col = float3(anisoSampled, anisoSampled, anisoSampled);
  } else {
    col = float3(0.35, 0.45, 0.6) * smoothstep(0.0, horizon, uv.y);
  }
  // 地平线亮线与分隔线
  if (abs(uv.y - horizon) < 0.004) col = float3(0.8, 0.85, 0.9);
  if (frac(uv.x * 3.0) < 0.01) col = float3(0.05, 0.07, 0.1);
  return float4(col, 1);
}`
  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>鼠标拉到最高密度：</b>左屏（无 mip）远端变成狂闪的摩尔纹烟花——「一个像素抽签一个纹素」的现场；中屏稳如老狗。</li>
  <li><b>中屏 vs 右屏：</b>把视角压扁看地面两侧——中屏横向糊得均匀（各向同性），右屏沿透视方向保留更多清晰条纹（各向异性多 tap）。3D 游戏里「地板远端纹理干净」全是它的功劳。</li>
  <li><b>等 u_time 滑动：</b>左屏远端的花纹在「爬」——时间一维暴露了静态截图看不见的闪烁。</li>
  <li><b>鼠标拉到最低：</b>密度小到三屏几乎一样——采样定理只在密度超限时才说话；mipmap 不是让画面变糊，是让「必然要糊的部分」糊得安静。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：mip 的生成与消费',
    files: [
      { path: 'servers/rendering/renderer_rd/storage_rd/texture_storage.cpp', note: '纹理存储与 generate_mipmaps：上传贴图时硬件 mip 链的分配与逐级平均。建议搜索：generate_mipmaps、mipmap。' },
      { path: 'core/io/image.cpp', note: 'CPU 侧的 mipmap 生成（Image::generate_mipmaps）：盒子滤波逐级减半——mip「每级 2×2 并 1」的算法本体。建议搜索：generate_mipmaps、_resize。' },
      { path: 'scene/resources/image_texture.cpp', note: 'Image → GPU 纹理的桥：CPU 生成的 mip 链如何随纹理一起上传。建议搜索：create_from_image、ImageTexture。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>远处的闪烁不是玄学，是欠采样定理在屏幕上的示威。mipmap 预先备好低频版本、三线性抹平级间跳变、各向异性照顾斜视方向——三件套合起来，就是「该糊的地方安静地糊」。</p>
<ul>
  <li><b>数据怎么流动？</b>UV 差分→密度→log2 选级→两级各双线性→按小数混合→（各向异性则先多 tap）。</li>
  <li><b>所有权归谁？</b>mip 链归纹理资产（加载时生成/随包携带），级数选择归光栅器，各向异性档位归用户设置。</li>
  <li><b>什么时候发生？</b>mip 链在导入/上传时生成一次；运行时每像素每帧做一次级选择——GPU 用 2×2 quad 的差分把它摊到几乎免费。</li>
</ul>`
  }
  ]
};
