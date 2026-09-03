# 《游戏引擎设计》课程规划

> v1.1 · 2026-09-02 · 配套学习平台已上线：根目录 python start.py（或双击 start.bat）启动本地服务
> 学员画像：熟悉 C++ / C#，用过一些游戏引擎；目标不是「会用 Godot」，而是借 Godot 开源源码吃透 **游戏引擎设计与复杂系统架构**。
> 教学方式：导师随堂制作课程页 —— 每课必有「写完就能跑」的实践板块；**没有课后作业**，一切练习都在课内即时完成。

---

## 0. 三个灵魂拷问（贯穿全课的读码框架）

读任何引擎代码，先问：
1. **数据怎么流动？** —— 一帧内，谁把什么数据交给了谁。
2. **所有权归谁？** —— 谁创建、持有、销毁；生命周期如何保证。
3. **什么时候发生？** —— 启动时 / 每帧 / 按需 / 后台线程。

## 1. 上课方式

- **平台**：工作区根目录 python start.py（或双击 start.bat）—— 自动起本地服务并打开浏览器，服务指向 playground/dist（ES module 产物不能从 file:// 直接打开）。开发模式：playground/ 下 pnpm dev。
- **每课形态**：概念（短）→ 实践小板块（实时改代码、即时运行）→ Godot 源码走读（每课 2~3 个文件，不贪多）→ 试一试（课内可选项，不是作业）。
- **语言约定**：浏览器实验用 JavaScript（随堂教语法）；Shader 一律用 **HLSL**（平台内置 HLSL→GLSL 实时转译器，跑在浏览器 WebGL 上；与 DirectX / Godot shader 语法同源）；源码走读用 C++。
- **进度**：平台首页/顶部打卡，存浏览器 localStorage。

## 2. 课程总览（9 阶段 · 26 课）

| 阶段 | 主题 | 课 | 状态 |
|---|---|---|---|
| P0 | 引擎全景 | L0.1 用 100 行代码造一个「引擎」 ✅ · L0.2 引擎解剖图 ✅ | 2/2 |
| P1 | 时间与主循环 | L1.1 时间步长实验台 ✅ · L1.2 走读 Godot 的一帧 ✅ | 2/2 |
| P2 | 对象系统与架构模式 | L2.1 场景树 vs ECS ✅ · L2.2 Object/Variant/信号 ✅ · **L2.3 内存管理 ✅** · **L2.4 脚本绑定 ✅** | 4/4 |
| P3 | 数学与空间 | **L3.1 变换与四元数 ✅** · **L3.2 引擎数学库设计 ✅** | 2/2 |
| P4 | 渲染系统 | **L4.1 GPU 管线+第一个三角形 ✅** · **L4.2 Shader 实验室（HLSL）✅** · **L4.3 渲染器架构 ✅** · **L4.4 后处理 ✅** | 4/4 |
| P5 | 物理系统 | **L5.1 空间网格 vs 暴力 ✅** · **L5.2 刚体求解 ✅** · **L5.3 PhysicsServer 与 Jolt ✅** | 3/3 |
| P6 | 资源系统 | **L6.1 资源与导入管线 ✅** | 1/1 |
| P7 | 玩法支撑 | **L7.1 输入与 UI ✅** · **L7.2 动画系统 ✅** · **L7.3 音频系统 ✅** | 3/3 |
| P8 | 引擎级进阶 | **L8.1 Job System ✅** · **L8.2 网络同步 ✅** · **L8.3 编辑器架构 ✅** | 3/3 |
| P9 | 毕业实战 | **L9.1 大型 C++ 阅读方法论 ✅** · **L9.2 毕业项目 ✅** | 2/2 |

✅ = 平台已有实践课，可直接上。其余课按学习节奏由导师**随堂现做**（见 §4）。

## 3. 实践板块类型（平台三种实验组件）

| 组件 | 用途 | 学员接口 |
|---|---|---|
| CodeLab | 通用 JS 实验台 | engine.run({ setup, update(state,dt,input), draw(state,ctx) }) |
| ShaderLab | HLSL 片元着色器实时编辑 | float4 main(float2 uv : TEXCOORD0) : SV_TARGET { ... }；uniform: u_time / u_mouse / u_resolution |
| PhysicsLab | 2D 刚体物理沙盒 | physics.run({ collide(a,b), resolve(a,b,hit,params) }) |

## 4. 给未来 AI 会话的工作流

### 学员开场白（复制即可）
- 继续学习：「打开 COURSE_PLAN.md 看进度，我们继续上下一课。」
- 指定课程：「给我现做 L4.1（GPU 管线 + 第一个三角形），按平台规范加一节带实践板块的课程页。」
- 深化实验：「L0.1 的实验我想再加一个 … 效果。」
- 问题答疑：「L5.2 里 velN > 0 为什么就跳过？给我现场写个小实验验证。」

### 导师（AI）做新课流程
1. 读本文件与 playground/src/data/course.js，确认课号、标题、定位。
2. 新建 playground/src/lessons/LX.Y.js：导出 { id, title, est, coreQuestions, sections }；sections 为 text / lab(code|shader|physics) / source 块序列；实验默认代码必须可直接运行。
3. 在 playground/src/lessons/index.js 注册；把 course.js 与本文 §2 对应课改成 ready。
4. playground/ 下 pnpm build，然后用 start.py 启动查看。
5. 导师须知：**不布置课后作业**；每课必有可动手板块；单课体量 60~150 分钟；shader 用 HLSL；界面与注释全中文。

## 5. 进度

以平台打卡为准（localStorage）。当前 ready：全部 26 课（L0.1 ~ L9.2）。

## 6. Godot 源码地图（工作区 godot/，浅克隆主干）

| 目录 | 内容 |
|---|---|
| core/ | 一切的地基：对象模型、Variant、数学、IO、OS 抽象、模板容器 |
| servers/ | 无头服务层：渲染 / 物理 / 音频的抽象 API 与实现（重点研究对象） |
| scene/ | 场景层：Node、Control、2D、3D —— 游戏里一切节点的基类 |
| editor/ | 编辑器本身（它也是一个场景） |
| main/ | 程序入口与主循环（Main::iteration） |
| modules/ | 可选模块：GDScript、Jolt、multiplayer 等 |
| platform/ | 平台层：windows / linux 等窗口与输入适配 |
| drivers/ | 图形后端（Vulkan / OpenGL 等） |
| thirdparty/ | 第三方库 |

读法：先垂直后水平 —— 每课只沿一条数据流走到底，不贪全景。

## 7. 进阶专题

主线 26 课毕业后的深水区大纲（碰撞策略 / 液体渲染 / 可破坏场景 / ECS 专题等 6 方向 26 课）见 **ADVANCED_PLAN.md**；制作流程与本文 §4 相同，课号改用 A1/B1/C1… 前缀。
