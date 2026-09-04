// J2 · 颜色空间:gamma 的骗局
export default {
  id: 'J2',
  title: '颜色空间：gamma 的骗局',
  est: 2,
  coreQuestions: [
    'sRGB 和 linear 差在哪？为什么混合会变糊？',
    '为什么光照必须在线性空间算？',
    'gamma 2.2 的编码/解码在管线哪两级发生？',
    'HDR 与线性工作流是什么关系？'
  ],
  sections: [
  {
    type: 'text',
    title: '骗局的开场：0.5 的中间灰去哪了',
    html: `<p>人眼对暗部更敏感，所以存储颜色时用 <b>sRGB 编码</b>（约等于 gamma 1/2.2 压缩）：物理亮度 0.5 的灰，存下来大约是 0.73。所有图片、所有取色器给你的数字<b>都不是线性光</b>——这就是骗局的起点。</p>
<p>骗局生效的时刻是<b>混合</b>：两个 0.5 的灰在屏幕上做 50/50 混合，正确答案（线性空间混合后编码）是 0.73；直接在 sRGB 数字上混合得到 0.5——<b>凭空暗了一档，边缘发糊发脏</b>。半透明混合、光照叠加、抗锯齿，全都在被这个骗局收割。</p>`
  },
  {
    type: 'text',
    title: '解药：线性工作流',
    html: `<table>
  <tr><th>管线阶段</th><th>颜色空间</th><th>原因</th></tr>
  <tr><td>读入贴图</td><td>sRGB → 解码为 linear</td><td>硬件 sRGB 采样格式免费完成</td></tr>
  <tr><td>光照计算</td><td>linear</td><td>光是物理量，加法/乘法只在上线性成立</td></tr>
  <tr><td>写回帧缓冲</td><td>linear → sRGB 编码</td><td>编码还原给显示器</td></tr>
</table>
<p>「解码→线性算→编码」三步缺一不可：只解码不编码画面会泛白（J1 的 PBR 输出也要过这一步）；只编码不解码会糊。Godot 里 3D 管线默认 linear 工作流（HDR 后缓冲 + tonemap 时编码），2D canvas 默认直通 sRGB——所以 2D 混合发糊是历史遗留的日常。</p>`
  },
  {
    type: 'lab',
    lab: 'shader',
    key: 'gamma',
    title: '实验：三联对比——糊的正确打开方式',
    height: 620,
    code: `float4 main(float2 uv : TEXCOORD0) : SV_TARGET {
  // 三联屏:左=在 sRGB 上直接混合(错误) 中=线性混合+正确编码(正确) 右=只解码不编码(泛白)
  // 场景:黑白棋盘上放大渐缩的黑条,观察半透明边缘的糊与净
  float panel = floor(uv.x * 3.0);
  float u = frac(uv.x * 3.0);

  // 底:棋盘格(0.18 线性灰 与 0.73 线性灰交替)
  float check = frac(floor(uv.x * 14) + floor(uv.y * 14)) < 0.5 ? 1.0 : 0.0;
  float3 bg = check > 0.5 ? float3(0.73, 0.73, 0.73) : float3(0.18, 0.18, 0.18);

  // 前景:半透明黑条(不透明度 0.5,数值在 sRGB 空间取 0.5 —— 骗局的原料)
  float bar = smoothstep(0.25, 0.3, u) * smoothstep(0.75, 0.7, u);
  float alpha = bar * 0.5;

  // 骗局的原料:sRGB 空间的 0.5 黑(人眼里「半透明黑」的直觉值)
  float srgbBlack = 0.0;                       // 黑条颜色=sRGB 0
  float3 fgSrgb = float3(srgbBlack, srgbBlack, srgbBlack);

  float3 col;
  if (panel < 0.5) {
    // 错误:直接在 sRGB 数字上混合
    col = lerp(bg, fgSrgb, alpha);
  } else if (panel < 1.5) {
    // 正确:bg 解码→线性混合→再编码
    float3 bgLin = pow(bg, 2.2);
    float3 fgLin = pow(fgSrgb, 2.2);
    float3 lin = lerp(bgLin, fgLin, alpha);
    col = pow(lin, 1.0 / 2.2);
  } else {
    // 只解码不编码:线性混合后直接输出(忘记编码)
    float3 bgLin = pow(bg, 2.2);
    float3 fgLin = pow(fgSrgb, 2.2);
    col = lerp(bgLin, fgLin, alpha);
  }
  // 分隔线
  if (frac(uv.x * 3.0) < 0.01) col = float3(0.05, 0.07, 0.1);
  return float4(col, 1);
}`
  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>左屏 vs 中屏：</b>同样 50% 黑条盖在棋盘上——左屏的条「又厚又糊」，中屏的条薄而干净（能透出棋盘格）。因为 sRGB 0.5 的黑其实挺「亮」，直接混等于盖了 73% 的黑。</li>
  <li><b>中屏 vs 右屏：</b>右屏忘编码，整屏泛白发灰——半数初学者的第一个「线性工作流」就是这个样子，白瞎了解码。</li>
  <li><b>把 2.2 改成 1.0：</b>左右屏突然一样——gamma 骗局的开关就是这一个数字。</li>
  <li><b>盯条的两条竖边：</b>只有中屏的边缘锐利干净——抗锯齿/半透明/光晕全部受益于线性混合，这就是「光照必须线性」的直观版。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：颜色空间在引擎里的落点',
    files: [
      { path: 'servers/rendering/renderer_rd/storage_rd/texture_storage.cpp', note: '贴图的 sRGB 标记与格式转换：读贴图时硬件解码的开关就在格式选择里。建议搜索：srgb、SRGB8_ALPHA8。' },
      { path: 'servers/rendering/renderer_rd/shaders/effects/tonemap.glsl', note: '输出编码的现场：tonemap 之后的线性→sRGB 编码就在这里（找那个 pow）。建议搜索：tonemap、pow、linear_to_srgb。' },
      { path: 'servers/rendering/renderer_rd/shaders/canvas.glsl', note: '2D canvas 的着色：2D 直通 sRGB 的现状与 3D 线性管线的差异一眼可辨。建议搜索：COLOR、srgb。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>gamma 骗局的完整剧本：存储用 sRGB（人眼友好）、计算要 linear（物理正确）、输出再编码（显示还原）。三步各就各位，混合/光照/半透明全部自动变干净。</p>
<ul>
  <li><b>数据怎么流动？</b>sRGB 资产→硬件解码→线性光照/混合→tonemap→编码→显示器。</li>
  <li><b>所有权归谁？</b>解码/编码归管线（采样格式与输出 shader），「在线性空间计算」的责任归写光照的你。</li>
  <li><b>什么时候发生？</b>解码在采样瞬间、计算在整个光照阶段、编码在写回帧缓冲那一刻——整条管线的纪律，缺一步就糊。</li>
</ul>`
  }
  ]
};
