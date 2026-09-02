// L4.2 · Shader 实验室：用 HLSL 手写光照
export default {
  id: 'L4.2',
  title: 'Shader 实验室：用 HLSL 手写光照',
  est: '2–3 小时',
  coreQuestions: [
    '片元着色器（fragment shader）里「每个像素各执行一次」到底是什么意思？',
    '光照公式 N·L 的几何意义是什么？高光为什么要用半程向量？',
    '我们写的 HLSL 是怎么跑到浏览器 GPU 上的？'
  ],
  sections: [
    {
      type: 'text',
      title: '每像素编程：片元着色器',
      html: `<p>GPU 渲染管线的最后一段叫<b>片元着色器</b>：对屏幕上（几乎）每个像素，GPU 都会并行执行一遍你写的这个小程序，输出这个像素的颜色。「整个画面」就是你这段代码跑几百万次的产物。</p>
<p>本课用 <b>HLSL</b>（DirectX 世界的着色器语言，语法与 Godot shader、Unity ShaderLab 同源）。平台内置了一个 HLSL→GLSL 转译器，把你的代码实时翻译给浏览器的 WebGL —— 这件事本身就和引擎做的一样：<b>着色器语言只是前端，真正跑在 GPU 上的是编译后的字节码</b>（引擎里是 SPIR-V/DXIL，浏览器里是 GLSL）。</p>
<p>可用 uniform（引擎传给你的全局量）：<code>u_time</code> 运行秒数 · <code>u_mouse</code> 鼠标位置 0~1（y 向上）· <code>u_resolution</code> 画布像素尺寸。</p>`
    },
    {
      type: 'lab',
      lab: 'shader',
      key: 'warmup',
      title: '实验 1：用数学画图（渐变与圆盘）',
      height: 480,
      code: `float4 main(float2 uv : TEXCOORD0) : SV_TARGET {
    // uv：画布坐标，左下 (0,0)，右上 (1,1)

    float3 col = float3(uv.x * 0.25, uv.y * 0.5, 0.25);  // 1) 底色渐变

    float2 p = uv - 0.5;                                 // 2) 中心圆盘
    float d = sqrt(dot(p, p));                           // 到圆心的距离
    if (d < 0.25) {
        col = float3(1.0, 0.8, 0.2);                     // 圆内换颜色
    }

    return float4(col, 1.0);                             // 我就是屏幕上的一个像素
}
`
    },
    {
      type: 'text',
      title: '光照公式：从 N·L 到 Blinn-Phong',
      html: `<p>颜色有了，怎么让它「立体」？光照其实就三个叠加项：</p>
<pre>ambient  = 基色 × 0.12                       // 环境光：没有光源也有的底亮
diffuse  = 基色 × N·L × 强度                 // 漫反射：面朝光才亮（N 法线，L 指向光源）
specular = 高光色 × (N·H)^s                  // 高光：视线与反射方向越接近越亮
                                         H = normalize(L + V)  半程向量</pre>
<ul>
  <li><b>N·L</b> 的几何意义：法线与光线夹角越小（点积越接近 1），单位面积接收的光越多——这就是「正午比黄昏亮」。</li>
  <li><b>半程向量 H</b>：光反射方向与视线方向的「中间人」，H 越对齐法线，高光越强。比逐像素算反射便宜，效果接近——典型的引擎取舍。</li>
  <li><b>菲涅尔</b>：视线越掠射（n.z 越小），反射越强——湖面远看是镜子、近看是水。</li>
</ul>`
    },
    {
      type: 'lab',
      lab: 'shader',
      key: 'light',
      title: '实验 2：给一个「假球」打光',
      height: 480,
      code: `float4 main(float2 uv : TEXCOORD0) : SV_TARGET {
    // 用 uv 伪造一个球面法线，然后手写一遍完整光照
    float2 p = uv * 2.0 - 1.0;              // 映射到 [-1, 1]
    float r2 = dot(p, p);
    if (r2 > 1.0) return float4(0.043, 0.059, 0.09, 1.0);   // 球外：背景色

    float3 n = float3(p.x, p.y, sqrt(1.0 - r2));            // 球面法线（假球）
    float3 lightDir = normalize(float3(0.5, 0.7, 0.6));     // 光从哪来
    float3 viewDir  = float3(0.0, 0.0, 1.0);                // 眼睛在正前方

    float ndl = saturate(dot(n, lightDir));                 // 漫反射 N·L
    float3 base = float3(0.85, 0.35, 0.35);                 // 物体本色
    float3 col = base * (0.12 + 0.88 * ndl);                // 环境 + 漫反射

    float3 h = normalize(lightDir + viewDir);               // 半程向量
    float spec = pow(saturate(dot(n, h)), 48.0);            // Blinn-Phong 高光
    col += spec;

    float fres = pow(1.0 - saturate(n.z), 3.0);             // 菲涅尔边缘光
    col += fres * float3(0.2, 0.45, 0.8) * 0.6;

    return float4(col, 1.0);
}
`
    },
    {
      type: 'text',
      title: '试一试',
      html: `<ul>
  <li>让光源转起来：<code>lightDir = normalize(float3(cos(u_time), 0.7, sin(u_time)))</code> —— uniform 让画面「活」了，这就是引擎每帧传数据给 GPU 的意义。</li>
  <li>高光指数 48.0 改成 4.0：高光变大变软（指数 = 表面粗糙度的反面）。</li>
  <li>用 <code>u_mouse</code> 控制光源方向：光源跟着鼠标走。</li>
  <li>进阶：在球下方加一个椭圆暗斑当「影子」，只靠数学，不靠任何模型。</li>
</ul>`
    },
    {
      type: 'source',
      files: [
        { path: 'servers/rendering/shader_language.cpp', note: 'Godot 自带着色器语言的词法/语法解析器——你今天写的 HLSL 也被平台转译器做了同样的事：语言只是前端。' },
        { path: 'servers/rendering/renderer_rd/', note: 'Vulkan 后端目录，shader 在这里被编译成 SPIR-V；浏览器里我们编译成 GLSL，思路相同。' }
      ]
    },
    {
      type: 'text',
      title: '小结',
      html: `<p>你已经会「每像素编程」了：这是渲染课的手感基础。接下来：L4.1 补全 GPU 管线全貌（你的 shader 只是最末端一环）；L4.3 看引擎如何把十万像素调用组织成高效渲染（RenderingServer 与剔除）。</p>`
    }
  ]
}
