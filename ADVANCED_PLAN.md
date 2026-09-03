# 《游戏引擎设计》进阶专题规划

> v1.0 · 2026-09-03 · 前置：主线 26 课（COURSE_PLAN.md）已全部 ready，本文件是「毕业之后」的深水区。
> 定位差异：主线是「一阶段吃透一个系统」，进阶是「**一课打穿一个细节**」。
> 约定与主线完全一致：三个灵魂拷问贯穿；实验用 CodeLab / ShaderLab / PhysicsLab 课内完成；shader 一律 HLSL；界面与注释全中文；不布置课后作业；每课制作流程复用 §4（lessons/XX.Y.js → check-lesson → 注册 → build）。

---

## 0. 选题四原则

1. **一课一个细节，打穿它**——不再求系统全景，只求该细节的来龙去脉 + 亲手造一遍。
2. **降维优先**：再复杂的效果也先做 2D/降维实验建立直觉（流体先做 1000 粒子 SPH，不是 Navier-Stokes 全解）。
3. **改变心智模型才算数**：做完这课，你会重新理解主线某课的结论（如做完 A3 才懂 L5.2 迭代次数在买什么）。
4. **⭐ = 建议优先制作**（点名方向 / 高价值 / 现有实验组件完全可覆盖）。

## 1. 专题总览（6 方向 · 34 课）

| 方向 | 主题 | 课数 | 备注 |
|---|---|---|---|
| A | 碰撞与物理深水区 | 5 | ⭐ 点名方向：处理策略远不止离散一步 |
| B | 渲染深水区 | 8 | ⭐ 含点名专题：液体渲染三部曲、可破坏场景 |
| C | ECS 与数据导向专题 | 4 | ⭐ 点名方向：独立成系，手写 mini-ECS |
| D | 大世界与粒子 | 6 | 地形、流式加载、instancing、大气 |
| E | 网络与确定性 | 5 | 定点数、增量压缩、AOI、录制回放、时间同步 |
| F | 玩法算法与工具链 | 6 | 寻路、群集、相机、行为树、UI 合批、调试工具链 |

## 2. A · 碰撞与物理深水区（5 课）⭐

| 课 | 标题 | 一句话 | 实验（可跑） | 走读候选（制作时核验） |
|---|---|---|---|---|
| A1 ⭐ | 连续碰撞检测 CCD：子弹为什么能穿过薄墙 ✅ | 离散检测的时间盲区；子步外推 vs speculative contacts 的取舍 | CodeLab：炮弹 vs 薄墙，三策略切换看穿透率与开销曲线 | modules/godot_physics_3d/（body CCD 段）、godot_physics_2d/ |
| A2 ⭐ | 接触流形：两个盒子的接触不止一个点 | SAT 之后还要 reference-face 裁剪；多点接触决定堆叠稳不稳 | CodeLab：单步演示裁剪生成接触点；PhysicsLab：1 点 vs 多点堆叠对比 | modules/godot_physics_3d/ 的 SAT/collision solver 文件 |
| A3 ⭐ | 求解器进阶：迭代、暖启动与 island ✅ | sequential impulse 全景；为什么塔会抖、会果冻 | CodeLab：迭代次数 × 暖启动开关的堆叠稳定性矩阵 | modules/godot_physics_3d/ 的 step/body/solver |
| A4 | 约束的艺术：关节、马达与布娃娃 | 关节=方程，马达=驱动项，可断关节=阈值 | CodeLab：链条/布娃娃 + 断裂阈值调节 | modules/godot_physics_3d/ 的 joints 文件 |
| A5 | 软体入门：PBD——把「力」换成「位置」 | Verlet 布料、距离约束、XPBD 一瞥 | CodeLab：可撕的布料（鼠标撕裂约束） | 外部经典算法为主，Godot 锚点弱（如实标注） |

## 3. B · 渲染深水区（8 课）⭐

| 课 | 标题 | 一句话 | 实验（可跑） | 走读候选（制作时核验） |
|---|---|---|---|---|
| B1 ⭐ | 液体渲染 I：2D 粒子流体 ✅ | SPH/PBF 降维版：密度、压强、黏性三项力 | CodeLab：1000 粒子 SPH 实时互动 | servers/rendering/.../particles_storage（GPU 粒子对照） |
| B2 ⭐ | 液体渲染 II：让粒子看起来像水 ✅ | metaball 挤出 → 屏幕空间平滑 → 法线重建 → 折射配色 | CodeLab metaball + ShaderLab 屏幕空间水体近似 | servers/rendering/renderer_rd/effects/ |
| B3 ⭐ | 液体渲染 III：波动方程水面 ✅ | heightfield 波动方程 + 法线重建 + 折射反射 | ShaderLab：u_mouse 搅动的交互水面 | servers/rendering/renderer_rd/（screen space 类效果） |
| B4 ⭐ | 可破坏场景 I：像素/体素破坏 ✅ | 破坏 mask → 连通域分裂 → 孤岛掉落 | CodeLab：2D 可破坏地形（炸坑、孤岛坠落） | modules/（tilemap 与体素思路对照） |
| B5 ⭐ | 可破坏场景 II：预分片与运行时切割 ✅ | Voronoi 预切、凸分解、破坏层级与物理联动 | CodeLab：预分片墙被撞碎（接 PhysicsLab 碰撞事件） | modules/godot_physics_3d/（body 事件） |
| B6 | 阴影专题：shadow mapping 的十大坑 | 深度偏差、彼得潘、走样、PCF、CSM 级联 | ShaderLab：2D 场景 shadow map + PCF 对比 | servers/rendering/renderer_rd/（light/shadow 存储） |
| B7 | 透明物排序与 OIT 一瞥 | 画家算法为何不可靠；sort key 与 OI 思想 | CodeLab：排序错误现场可视化 | servers/rendering/（transparent 排序段） |
| B8 | Raymarching 专题：没有网格的渲染 | sphere tracing、SDF 布尔白送 CSG、数值法线 | ShaderLab：SDF 场景（u_mouse 移动光源） | servers/rendering/renderer_rd/shaders/ |

## 4. C · ECS 与数据导向专题（4 课）⭐ 独立成系

| 课 | 标题 | 一句话 | 实验（可跑） | 走读候选（制作时核验） |
|---|---|---|---|---|
| C1 | ECS 世界观：archetype vs sparse set vs Node | 三种存储的内存布局与遍历命运 | CodeLab：三种存储遍历成本沙盘（呼应 L3.2） | core/object/object.h、scene/main/node.cpp（对照） |
| C2 ⭐ | 手写 mini-ECS I：Query 与 System ✅ | 200 行 JS 造 archetype 存储 + 查询 | CodeLab：mini-ECS 骨架现场写 | （外部 Bevy/EnTT 概念对照，无源码依赖） |
| C3 | 手写 mini-ECS II：调度、脏标记与事件 | system 依赖图、change detection、deferred 事件 | CodeLab：调度图 + 脏标记演示 | servers 的 RID 世界（无 Node 的数据导向） |
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

## 8. 平台增强 backlog（不阻塞以上任何一课）

- 现有三组件（CodeLab / ShaderLab / PhysicsLab）已可覆盖全部 26 节进阶课的降维实验。
- 若后续想做「真 3D 交互实验」（3D 阴影视角、地形漫游、3D 剔除），需新增 **Viewport3D 组件**（Three.js/regl）；建议届时独立立项。
- L7.3 只做了音频可视化；若要真实发声需新增 **AudioOut 组件**（WebAudio），同属 backlog。
- 专题课号建议以 A1/B1/C1… 命名，在 course.js 追加「P10 进阶专题」阶段分组（平台首页自动渲染新阶段）。

## 9. 建议制作顺序（若先做 8 课）

**A1 → A3 → B1 → B2 → B3 → B4 → B5 → C2**
（点名方向全覆盖：碰撞策略、液体渲染、可破坏场景；C2 交付后 ECS 系列即具备骨架）

制作流程与主线一致：见 COURSE_PLAN.md §4；每课产出 lessons/XX.Y.js → node tools/check-lesson.mjs 通过 → 注册 → build。
