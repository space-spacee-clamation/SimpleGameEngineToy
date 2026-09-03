# 《游戏引擎设计》进阶专题规划

> v1.1 · 2026-09-03 · 前置：主线 26 课（COURSE_PLAN.md）已全部 ready，本文件是「毕业之后」的深水区。v1.1 扩充 G~L 六个新方向。
> 定位差异：主线是「一阶段吃透一个系统」，进阶是「**一课打穿一个细节**」。
> 约定与主线完全一致：三个灵魂拷问贯穿；实验用 CodeLab / ShaderLab / PhysicsLab 课内完成；shader 一律 HLSL；界面与注释全中文；不布置课后作业；每课制作流程复用 §4（lessons/XX.Y.js → check-lesson → 注册 → build）。

---

## 0. 选题四原则

1. **一课一个细节，打穿它**——不再求系统全景，只求该细节的来龙去脉 + 亲手造一遍。
2. **降维优先**：再复杂的效果也先做 2D/降维实验建立直觉（流体先做 1000 粒子 SPH，不是 Navier-Stokes 全解）。
3. **改变心智模型才算数**：做完这课，你会重新理解主线某课的结论（如做完 A3 才懂 L5.2 迭代次数在买什么）。
4. **⭐ = 建议优先制作**（点名方向 / 高价值 / 现有实验组件完全可覆盖）。

## 1. 专题总览（12 方向 · 57 课）

| 方向 | 主题 | 课数 | 备注 |
|---|---|---|---|
| A | 碰撞与物理深水区 | 5 | ⭐ 点名方向：处理策略远不止离散一步 |
| B | 渲染深水区 | 8 | ⭐ 含点名专题：液体渲染三部曲、可破坏场景 |
| C | ECS 与数据导向专题 | 4 | ⭐ 点名方向：独立成系，手写 mini-ECS |
| D | 大世界与粒子 | 6 | 地形、流式加载、instancing、大气 |
| E | 网络与确定性 | 5 | 定点数、增量压缩、AOI、录制回放、时间同步 |
| F | 玩法算法与工具链 | 6 | 寻路、群集、相机、行为树、UI 合批、调试工具链 |
| G | 角色与动画深水区 | 4 | IK、弹簧骨骼、样条路径、变形目标 |
| H | 手感与反馈专题 | 4 | ⭐ 输入缓冲、打击感三件套、时间系统、反馈色光 |
| I | 程序化生成专题 | 4 | 噪声大观、WFC、L-system、引擎级随机数 |
| J | 图形管线补充 | 4 | PBR、颜色空间、mipmap、2D 光照与视野 |
| K | 音频与 DSP | 3 | 采样混叠、程序化合成、混响 |
| L | 引擎系统补遗 | 4 | profiler、存档迁移、Mod API、贴花 |

## 2. A · 碰撞与物理深水区（5 课）⭐

| 课 | 标题 | 一句话 | 实验（可跑） | 走读候选（制作时核验） |
|---|---|---|---|---|
| A1 ⭐ | 连续碰撞检测 CCD：子弹为什么能穿过薄墙 ✅ | 离散检测的时间盲区；子步外推 vs speculative contacts 的取舍 | CodeLab：炮弹 vs 薄墙，三策略切换看穿透率与开销曲线 | modules/godot_physics_3d/（body CCD 段）、godot_physics_2d/ |
| A2 ⭐ | 接触流形：两个盒子的接触不止一个点 ✅ | SAT 之后还要 reference-face 裁剪；多点接触决定堆叠稳不稳 | CodeLab：单步演示裁剪生成接触点；PhysicsLab：1 点 vs 多点堆叠对比 | modules/godot_physics_3d/ 的 SAT/collision solver 文件 |
| A3 ⭐ | 求解器进阶：迭代、暖启动与 island ✅ | sequential impulse 全景；为什么塔会抖、会果冻 | CodeLab：迭代次数 × 暖启动开关的堆叠稳定性矩阵 | modules/godot_physics_3d/ 的 step/body/solver |
| A4 | 约束的艺术：关节、马达与布娃娃 ✅ | 关节=方程，马达=驱动项，可断关节=阈值 | CodeLab：链条/布娃娃 + 断裂阈值调节 | modules/godot_physics_3d/ 的 joints 文件 |
| A5 | 软体入门：PBD——把「力」换成「位置」 ✅ | Verlet 布料、距离约束、XPBD 一瞥 | CodeLab：可撕的布料（鼠标撕裂约束） | 已核验：godot_soft_body_3d（内置即 PBD 求解器）+ jolt_soft_body_3d（XPBD，源码注释含公式换算） |

## 3. B · 渲染深水区（8 课）⭐

| 课 | 标题 | 一句话 | 实验（可跑） | 走读候选（制作时核验） |
|---|---|---|---|---|
| B1 ⭐ | 液体渲染 I：2D 粒子流体 ✅ | SPH/PBF 降维版：密度、压强、黏性三项力 | CodeLab：1000 粒子 SPH 实时互动 | servers/rendering/.../particles_storage（GPU 粒子对照） |
| B2 ⭐ | 液体渲染 II：让粒子看起来像水 ✅ | metaball 挤出 → 屏幕空间平滑 → 法线重建 → 折射配色 | CodeLab metaball + ShaderLab 屏幕空间水体近似 | servers/rendering/renderer_rd/effects/ |
| B3 ⭐ | 液体渲染 III：波动方程水面 ✅ | heightfield 波动方程 + 法线重建 + 折射反射 | ShaderLab：u_mouse 搅动的交互水面 | servers/rendering/renderer_rd/（screen space 类效果） |
| B4 ⭐ | 可破坏场景 I：像素/体素破坏 ✅ | 破坏 mask → 连通域分裂 → 孤岛掉落 | CodeLab：2D 可破坏地形（炸坑、孤岛坠落） | modules/（tilemap 与体素思路对照） |
| B5 ⭐ | 可破坏场景 II：预分片与运行时切割 ✅ | Voronoi 预切、凸分解、破坏层级与物理联动 | CodeLab：预分片墙被撞碎（接 PhysicsLab 碰撞事件） | modules/godot_physics_3d/（body 事件） |
| B6 | 阴影专题：shadow mapping 的十大坑 ✅ | 深度偏差、彼得潘、走样、PCF、CSM 级联 | ShaderLab：2D 场景 shadow map + PCF 对比 | servers/rendering/renderer_rd/（light/shadow 存储） |
| B7 | 透明物排序与 OIT 一瞥 ✅ | 画家算法为何不可靠；sort key 与 OI 思想 | CodeLab：排序错误现场可视化 | servers/rendering/（transparent 排序段） |
| B8 | Raymarching 专题：没有网格的渲染 ✅ | sphere tracing、SDF 布尔白送 CSG、数值法线 | ShaderLab：SDF 场景（u_mouse 移动光源） | servers/rendering/renderer_rd/shaders/ |

## 4. C · ECS 与数据导向专题（4 课）⭐ 独立成系

| 课 | 标题 | 一句话 | 实验（可跑） | 走读候选（制作时核验） |
|---|---|---|---|---|
| C1 | ECS 世界观：archetype vs sparse set vs Node ✅ | 三种存储的内存布局与遍历命运 | CodeLab：三种存储遍历成本沙盘（呼应 L3.2） | core/object/object.h、scene/main/node.cpp（对照） |
| C2 ⭐ | 手写 mini-ECS I：Query 与 System ✅ | 200 行 JS 造 archetype 存储 + 查询 | CodeLab：mini-ECS 骨架现场写 | （外部 Bevy/EnTT 概念对照，无源码依赖） |
| C3 | 手写 mini-ECS II：调度、脏标记与事件 ✅ | system 依赖图、change detection、deferred 事件 | CodeLab：调度图 + 脏标记演示 | servers 的 RID 世界（无 Node 的数据导向） |
| C4 | ECS 落地：渲染/物理/网络怎么吃 ECS | 同一游戏两套实现的帧耗时与快照对比 | CodeLab：Node 树 vs mini-ECS 的实测对比 | scene/main/scene_tree.cpp（对照） |

## 5. D · 大世界与粒子（6 课）

| 课 | 标题 | 一句话 | 实验（可跑） | 走读候选（制作时核验） |
|---|---|---|---|---|
| D1 | 高度场地形 I：从噪声到法线 | heightmap 管线全景：多倍频噪声、法线与坡度、贴图按坡度分层 | CodeLab：2D 高度图生成器（倍频/持续度/阈值实时调） | （外部经典为主，制作时找 Godot 地形锚点） |
| D2 | 高度场地形 II：LOD 与裙边 | chunk LOD、视距分级；接缝裂缝为什么必须用裙边补 | CodeLab：LOD 分级沙盘（放大接缝看裂缝消失） | servers/ 下地形/网格相关文件 |
| D3 | 无限世界流式加载：cell 与内存预算 | 坐标系怎么划 cell、异步队列优先级、预算爆掉是什么体验 | CodeLab：流式加载模拟（预算条 + 加载队列 + 卡顿现场） | core/io/resource_loader.cpp（线程加载） |
| D4 | 粒子系统架构：CPU vs GPU 粒子 | emitter→affector 管线；GPU 粒子把「模拟」整体搬进显存 | CodeLab：万级 CPU 粒子池 + affector 参数曲线 | servers/rendering/.../particles_storage.cpp |
| D5 | 植被与 instancing：一棵草到一万棵草 | instancing 思想：数据只存一份、位置走属性流 | CodeLab：逐个画 vs 批量画同一万棵草的帧耗时实测 | servers/rendering/（multi_mesh / instancing） |
| D6 | 天空与大气一瞥：为什么天是渐变的 | 天空盒 → 大气散射近似；预积分与实时的取舍 | ShaderLab：昼夜渐变天空（u_time 驱动太阳高度） | servers/rendering/（sky 相关文件） |

## 6. E · 网络与确定性（5 课）

| 课 | 标题 | 一句话 | 实验（可跑） | 走读候选（制作时核验） |
|---|---|---|---|---|
| E1 | 定点数与确定性：帧同步的地基 | 浮点误差如何滚成雪崩；定点运算的加减乘除与平方根 | CodeLab：float vs 定点对照跑万帧，哈希对账分叉现场 | （外部经典 + 回扣主线 L8.2） |
| E2 | 增量压缩与快照：带宽经济学 | delta、位打包、量化降精度；MTU 预算下的取舍 | CodeLab：位打包演示（KB/s 实时统计） | modules/multiplayer/（delta 通道） |
| E3 | 兴趣管理 AOI：只发看得见的 | grid/AOI/优先级：大世界的网络裁剪 | CodeLab：AOI 开关下的包量与卡顿对比 | modules/multiplayer/ |
| E4 | 录制与回放：反外挂的引擎地基 | 只录输入就能重跑全世界——确定性回放、哈希对账、定位首个分叉帧 | CodeLab：输入录制回放器（改一步看全盘崩） | （外部经典；回扣 E1） |
| E5 | 时间同步与时钟漂移 | 两台机器的时间对不上：ping 估延迟、偏移估计、平滑校正 | CodeLab：双时钟漂移与渐进对齐演示 | modules/multiplayer/（sync 时间戳） |

## 7. F · 玩法算法与工具链（6 课）

| 课 | 标题 | 一句话 | 实验（可跑） | 走读候选（制作时核验） |
|---|---|---|---|---|
| F1 | 寻路：A*、JPS 与 navmesh | 启发式与开放集；网格寻路到导航网格之间的鸿沟 | CodeLab：网格 A* + 路径平滑（权重地图实时涂改） | servers/navigation_3d/ |
| F2 | 群体避障：boids、flow field 与 RVO 一瞥 | 三种群集思路各自的成本、效果与翻车场景 | CodeLab：500 单位实时避障（三种算法切换） | （外部经典算法为主） |
| F3 | 相机系统：跟随、震屏与遮挡处理 | 相机是「手感」的引擎级来源：阻尼、look-ahead、预测 | CodeLab：多策略相机对比沙盘（同一操作不同手感） | scene/（camera 相关文件） |
| F4 | 行为树与 AI 决策：BT vs GOAP vs HTN | 行为树三板斧：节点复用、黑板、中断；GOAP 换来规划自由 | CodeLab：行为树沙盘（黑板 + 打断 + 调试视图） | （外部经典为主） |
| F5 | UI 深水区：合批、裁剪与 9-slice | retained UI 怎么把一万控件画成十个 draw call | CodeLab：合批与裁剪可视化（回扣主线 L7.1） | scene/gui/（Control 渲染与合批） |
| F6 | 引擎调试工具链：debug draw、控制台与 HUD | 引擎怎么「看见」自己；一次性把观察手段体系化 | CodeLab：给之前课程实验补一个 debug-draw 层 | scene/ 的 debug 形状实现 |

## 8. G · 角色与动画深水区（4 课）

| 课 | 标题 | 一句话 | 实验（可跑） | 走读候选（制作时核验） |
|---|---|---|---|---|
| G1 | IK 反向运动学：脚要踩在地上 ✅ | 两骨骼解析解 + FABRIK/CCD 迭代法；IK 是「给结果反推动作」 | CodeLab：脚部贴地沙盘（起伏地形+重量感过渡） | scene/3d/（SkeletonIK/SkeletonModifier 对照） |
| G2 | 程序化动画与弹簧骨骼 | 二级运动：弹簧-阻尼让头发、尾巴、配饰「活」起来 | CodeLab：弹簧骨骼链（刚度/阻尼实时调） | scene/animation/（动画修改器对照） |
| G3 | 样条与路径：Catmull-Rom 与 Bézier | 相机轨迹、运动路径、UI 动效的共同数学底座 | CodeLab：样条编辑器（拖控制点、张量/阶数切换） | （外部经典） |
| G4 | 变形目标：BlendShape 与表情 | morph target 权重混合：顶点的另一条动画路 | CodeLab：2D 网格形变插值（权重滑杆） | servers/rendering/（blend shape 存储） |

## 9. H · 手感与反馈专题（4 课）⭐ 最容易被低估的引擎级内容

| 课 | 标题 | 一句话 | 实验（可跑） | 走读候选（制作时核验） |
|---|---|---|---|---|
| H1 ⭐ | 输入手感：缓冲窗口与土狼时间 ✅ | 为什么有的跳跃「就是舒服」：input buffer、coyote time、预测 | CodeLab：平台跳跃对照沙盘（每项技巧独立开关） | core/input/（回扣主线 L7.1） |
| H2 ⭐ | 打击感三件套：hit-stop、震屏、闪白 ✅ | 打击停顿的时间艺术；三件套参数如何叠加成「打击感」 | CodeLab：连击沙盘（三件套独立开关+衰减参数） | （外部经典） |
| H3 | 时间系统架构：timeScale 与分层时间 | 子弹时间/时停/慢镜：引擎级时间缩放与「每个实体自己的时钟」 | CodeLab：多实体异构时间流（主角慢、敌人快） | main/（time scale 相关） |
| H4 | 反馈色光语言：闪白、暗角与色偏 | 屏幕效果如何「报告」游戏状态：低血量暗角、受击闪白 | ShaderLab：暗角+色偏+闪白合成 | servers/rendering/（environment） |

## 10. I · 程序化生成专题（4 课）

| 课 | 标题 | 一句话 | 实验（可跑） | 走读候选（制作时核验） |
|---|---|---|---|---|
| I1 | 噪声大观：Perlin、Simplex 与 Worley | 每种噪声的性格；倍频叠加与域扭曲 | ShaderLab：四噪声全家福（参数化切换） | modules/noise/（FastNoiseLite） |
| I2 ⭐ | 波函数坍缩 WFC：从瓦片到无限城市 ✅ | 约束传播+最小熵：程序化生成的瑞士军刀 | CodeLab：瓦片坍缩沙盘（逐步坍缩+回溯可视化） | modules/tilemap/（相邻约束对照） |
| I3 | L-system 与结构生长 | 重写系统：树、河流、街区一把抓 | CodeLab：龟绘图（角度/长度/迭代实时调） | （外部经典） |
| I4 | 引擎级随机数：种子流与确定性 | 种子管理、流分离、可复现（回扣 E1 与主线质检） | CodeLab：RNG 分布与流分离可视化 | core/math/（RandomPCG） |

## 11. J · 图形管线补充（4 课）

| 课 | 标题 | 一句话 | 实验（可跑） | 走读候选（制作时核验） |
|---|---|---|---|---|
| J1 ⭐ | PBR：从 Blinn-Phong 到金属度/粗糙度 ✅ | 能量守恒、菲涅尔、微表面——L4.2 的直系进阶 | ShaderLab：PBR 球（金属度/粗糙度滑杆） | servers/rendering/（PBR 材质 shader） |
| J2 | 颜色空间：gamma 的骗局 | sRGB vs linear：为什么混合会变糊、光照必须在线性空间算 | ShaderLab：gamma 混合对比（一眨眼就懂） | servers/rendering/（sRGB 转换段） |
| J3 | mipmap 与纹理走样：远处为什么闪烁 | 采样定理的图形学版本；三线性与各向异性过滤 | ShaderLab：棋盘格 mip 演示 | servers/rendering/（mip 生成） |
| J4 | 2D 光照与视野多边形 | 阴影投射+可见性：roguelike FOV 的经典算法 | CodeLab：光源遮挡沙盘（墙线段→可见多边形） | servers/rendering/（canvas light 遮挡） |

## 12. K · 音频与 DSP（3 课）

| 课 | 标题 | 一句话 | 实验（可跑） | 走读候选（制作时核验） |
|---|---|---|---|---|
| K1 | DSP 基础：采样、量化与混叠 | 奈奎斯特为什么是铁律；欠采样如何制造假频率 | CodeLab：波形合成+混叠可视化 | servers/audio/ |
| K2 | 程序化音效：振荡器、包络与滤波 | 音色=波形+包络+滤波；合成器三件套 | CodeLab：迷你合成器面板（波形图实时演算） | servers/audio/effects/ |
| K3 | 混响与空间声学一瞥 | 卷积思想：脉冲响应如何给房间「签名」 | CodeLab：脉冲响应与反射衰减可视化 | servers/audio/effects/（reverb） |

## 13. L · 引擎系统补遗（4 课）

| 课 | 标题 | 一句话 | 实验（可跑） | 走读候选（制作时核验） |
|---|---|---|---|---|
| L1 | 性能剖析器怎么做 | 插桩 vs 采样、时间线、热点：引擎怎么给自己做体检 | CodeLab：迷你 profiler（帧时间线+热点榜） | editor/debugger/（profiler 对照） |
| L2 | 存档系统深水区：版本迁移 | 格式演进、向后兼容、迁移链：玩家进度凭什么十年不丢 | CodeLab：存档版本迁移沙盘 | core/io/（序列化） |
| L3 | Mod 与脚本 API 设计 | 怎么让别人安全地扩展你的游戏：沙箱、钩子、能力白名单 | CodeLab：迷你 mod 加载器（受限 API 演示） | modules/gdscript/（沙箱 VM 对照） |
| L4 | 贴花系统：弹孔怎么贴上去 | 投影 decal：裁剪、深度冲突、合批 | CodeLab：2D 投影贴花沙盘 | servers/rendering/（decal） |

## 14. 平台增强 backlog（不阻塞以上任何一课）

- 现有三组件（CodeLab / ShaderLab / PhysicsLab）已可覆盖全部 26 节进阶课的降维实验。
- 若后续想做「真 3D 交互实验」（3D 阴影视角、地形漫游、3D 剔除），需新增 **Viewport3D 组件**（Three.js/regl）；建议届时独立立项。
- L7.3 只做了音频可视化；若要真实发声需新增 **AudioOut 组件**（WebAudio），同属 backlog。
- 专题课号建议以 A1/B1/C1… 命名，在 course.js 追加「P10 进阶专题」阶段分组（平台首页自动渲染新阶段）。

## 15. 建议制作顺序

**第一批（已完成 ✅）**：A1 → A3 → B1 → B2 → B3 → B4 → B5 → C2

**第二批建议**：H1 → H2 → I2 → J1 → G1 → A2 → A4 → B6（已完成 ✅）

**第三批（已完成 ✅）**：A5 → B7 → B8 → C1 → C3
（B7/B8 收尾渲染深水区；A5 补完碰撞系；C1+C3 收完 ECS 三部曲）
（手感专题性价比最高；I2/J1 是各自方向的门面；A2/A4 补完碰撞系；B6 补阴影盲区）

制作流程与主线一致：见 COURSE_PLAN.md §4；每课产出 lessons/XX.Y.js → node tools/check-lesson.mjs 通过 → 注册 → build。
