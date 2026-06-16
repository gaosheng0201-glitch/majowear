# MajoWear AI 设计助手系统设计架构与交互设计规范

本文件系统性归纳了 MajoWear 项目中 **AI 设计助手（Design Agent）** 的核心功能、技术架构及优秀人机交互（UX/UI）设计。这些设计共同构建了一个高效、直观且符合服装设计师直觉的数字化协同创作环境。

---

## 一、 系统核心理念：双向闭环创作流

传统的 AI 辅助设计通常是单向的（通过提示词生成图纸/规格）。MajoWear 创新地实现了 **“顺向约束”** 与 **“逆向沉淀”** 的双向闭环创作模型：

```mermaid
graph TD
    subgraph 顺向约束生成 (Forward Constraint)
        A[选择风格 DNA] --> C[AI 整合约束条件]
        B[选择面料样卡] --> C
        C --> D[生成高保真款式与规格单]
    end
    
    subgraph 逆向提炼沉淀 (Reverse Abstraction)
        E[AI 自由灵感发挥] --> F[生成优秀款式]
        F --> G[设计师要求提炼 DNA/面料]
        G --> H[保存为结构化资产库]
        H --> A
        H --> B
    end
```

*   **顺向约束**：设计师选定特定面料（如羊绒）和风格 DNA（如极简），AI 严格按照这些材料的物理属性（克重、悬垂性、拉伸性）与美学规范，生成图纸与工艺规格单，确保设计与生产可行性。
*   **逆向沉淀**：当 AI 自由发挥产生令人满意的效果时，设计师可令其根据当前款式逆向提取风格 DNA 或面料卡。AI 通过工具调用，将非结构化灵感沉淀为系统结构化预设资产，供未来设计继承使用。

---

## 二、 卓越交互设计 (UX/UI Best Practices)

为保证极致的专业级软件体验，Agent 模块在交互细节上进行了深度打磨：

### 1. 输入框内的 `@-Mention` 标签化（Pill 块化）
*   **富文本插入**：设计师在聊天输入框内输入 `@` 字符会触发款式联想菜单。选择款式后，会将原本的纯文本替换为高亮背景的“胶囊块（Pill 标签）”。
*   **整体删除防破坏**：Pill 标签设置 `contenteditable="false"`，并添加专用的退格键处理逻辑。当用户按 `Backspace` 键删除时，会将其作为一个整体一次性删除，防止出现传统 `@` 功能字符碎裂、残留碎片的情况。
*   **焦点保护**：联想下拉列表的交互绑定了 `onMouseDown={(e) => e.preventDefault()}`，有效防止焦点从输入框移出，保障流畅的输入体验。

### 2. 聊天历史中的互动式实体 Pills
*   **渲染流匹配**：对话历史（包括用户发送的和 Agent 回复的）中，任何 `@款式名称` 文本都会被动态正则解析，重新渲染为带精致边框、圆角的交互式 Button Pill 标签。
*   **一键画布定位**：点击聊天历史中的 Pill，主画布（Garment Canvas）会自动聚焦、激活并定位到该款服装，打通了“对话上下文”与“主画布工作区”之间的快速切换通道。

### 3. 生成结果的“摘要卡片化”（Card-based UI）
*   **降低视觉认知负载**：当 Agent 生成新款式、新面料或新风格 DNA 时，AI 通常会返回极其冗长的 JSON 或技术规格文本。如果全部展示在聊天气泡中，会严重污染对话流，阻碍正常阅读。
*   **精致卡片呈现**：MajoWear 采用**摘要卡片化**交互。
    *   **款式卡片**：展示款式效果缩略图、标题、分类，并提供“定位”按钮。
    *   **面料卡片**：展示面料成分、生图渲染描述、克重等关键属性摘要，提供“激活”按钮。
    *   **风格卡片**：展示风格名称、代表性色盘、廓形要素，提供“应用”按钮。
*   **完整记忆保留**：前端隐藏冗长细节只展示精美卡片的同时，**数据库后端完整保留了 AI 的原始文本回复**。这样既满足了用户的阅读爽感，又不会破坏 Agent 的大语言模型历史上下文记忆，再次对话时仍能准确指代细节。

---

## 三、 技术架构与工具链设计

后端基于 Google Gen AI SDK (`@google/genai`) 配合多模态能力与功能调用，实现了精密的意图分流与状态同步架构：

```mermaid
graph TD
    User([用户输入]) --> Classifier[意图分类器: gemini-3.5-flash]
    
    Classifier -->|DEEP_THINK 推理意图| ProModel[gemini-3.1-pro-preview]
    Classifier -->|TOOL 生图/保存资产| FlashModel[gemini-3.5-flash]
    Classifier -->|SEARCH 事实问答| FlashSearch[gemini-3.5-flash + Google Search]
    
    ProModel -->|开启 thinkingConfig| StreamOutput[ReadableStream 流式输出]
    FlashModel -->|调用 Fuction Call| StreamOutput
    
    StreamOutput -->|推送状态/渲染骨架屏| Frontend((前端 AgentChat))
```

### 1. 结构化工具调用 (Tools Declarations)
系统为 Agent 装备了三组核心生产力工具：
*   `generate_garment_design`：款式生成与迭代工具。包含详细的款式部位参数（fit, collar, sleeves, pockets, closures, details）以及 AI 设计评审模块（style_match_score 等）。
*   `create_style_dna`：风格基因提取工具。将审美风格沉淀为数据库记录。
*   `create_fabric_card`：面料参数生成工具。沉淀面料物理属性与对应的渲染提示词。

### 2. 双模型分级智能路由 (Tiered Routing)
为兼顾执行效率与深层推理能力，系统采用两步意图分类路由策略：
*   **前置意图分类**：使用极速模型 `gemini-3.5-flash` 对用户输入进行前置分类，划分为 `DEEP_THINK`、`TOOL` 或 `SEARCH` 意图，防止 Gemini 内部 API 工具与 Search Grounding 发生冲突。
*   **深度推理分流 (`DEEP_THINK`)**：若用户请求涉及复杂设计分析或包含“思考”、“对比”、“为什么”等强推理词，自动流转至 **`gemini-3.1-pro-preview`**，并激活大模型的原生思考能力（`thinkingConfig` 设为 `HIGH` 级别），以输出详尽的推理思维链。
*   **常规工具执行 (`TOOL` / `SEARCH`)**：若是常规款式/面料卡生成，则交由 `gemini-3.5-flash` 直连工具集，极大缩减生成延迟。

### 3. 真实状态事件流 (Status Streaming)
*   **基于 API 的流输出**：在 `/api/agent/generate` API 中支持 `stream: true` 传参，启用底层 Node.js 读写流。
*   **业务进度即时推送**：随着后端编排逻辑的运转，AI 依次向流中写入当前业务节点的 JSON 事件状态：
    1. `understanding` (正在理解设计诉求...)
    2. `thinking` / `searching` (正在深度推理 / 正在联网搜索中...)
    3. `rendering` (包含 `target` 属性：正在调用生图引擎渲染效果图...)
    4. `saving` (正在将设计资产沉淀至数据库...)
*   **卡片级高保真骨架屏 (Shimmering Skeletons)**：
    *   在耗时最长的生图与写入阶段 (`rendering` 状态)，前端聊天界面根据流中携带的 `target` 类型（款式、面料、风格），立即渲染出对应的 **Shimmering 骨架占位卡片**（如款式卡片呈现左图右文横线闪烁，面料卡片呈现物理数据排版占位）。
    *   流彻底结束后，卡片骨架屏以微小的渐变动画平滑替换为真实的互动卡片，彻底消除了页面的“假进度”与突兀感。

### 4. 极致 Markdown 渲染与 Mention 融合
*   聊天对话泡集成了轻量级 React Markdown 渲染引擎，自动将后端返回的 MD 格式进行语法块级（Block-level）渲染。
*   支持在加粗或列表容器内，完美解析并排版交互式的 `@款式` Pill 标签，保证 HTML DOM 树完全合规。

---

## 四、 生图提示词现代优化与图像编辑 API 分析

### 1. Gemini 3.1 Flash Image 生图提示词优化 (Prompt Modernization)
旧式图像模型常依赖关键字堆砌（如 `8k`、`photorealistic` 等），但这些词汇在面对现代多模态模型（Imagen 3 / Nano Banana 2）时，极易破坏大模型的自然理解并降低细节输出质量。
因此，后端去除了所有堆砌的“垃圾修饰词”，升级为以**自然语言**形式约束的“光影、材质与商业级排版”后缀：
*   **款式平铺图 (`white_background`)**：
    `... clean solid white background, flat lay composition, soft diffused ambient light, micro-texture details visible, high-end commercial aesthetic`
*   **模特上身图 (`on_body`)**：
    `... full body shot, natural light, soft focus background, organic texture, high-end fashion magazine look`

### 2. Gemini 专门图像编辑 API (models.editImage) 技术路线分析
*   **API 概况**：Google Gen AI SDK 在 Vertex AI 环境下提供了 `models.editImage` 方法，支持通过传入**参考图像 (reference_images)** 和**局部遮罩 (mask)** 来做精细的局部重绘 (Inpainting) 与画幅拓宽 (Outpainting)。
*   **MajoWear 的架构选择**：
    *   目前系统专注于 **“元数据驱动的服装设计”**：用户通过自然语言调整领子或口袋，Agent 会先修改数据库中该服装的结构化 Schema (如 collar 改为 V 领)，然后**重新渲染**款式图。这保证了设计参数与视觉呈现的强一致性。
    *   **未来局部画布修改路径**：若后续引入“局部画笔重绘涂抹”，系统可通过 Canvas 导出涂抹蒙版，直接调用 `models.editImage` 在原图的基础坐标上对局部进行修饰，提供像素级画笔编辑的扩展接口。

---

## 五、 数据库与工程持久化

为保障页面刷新或重新进入项目后卡片展示与关联关系的持久化，系统在 Supabase PostgreSQL 层面进行了优化设计：

*   **`chat_messages.grounding_metadata` (JSONB)**：
    用于存放卡片特征数据。例如创建风格 DNA 时，将生成的 `createdStyleDnaId` 存储在 `grounding_metadata` 中。
*   **状态还原机制**：
    前端在加载历史聊天记录时，会自动解析 `grounding_metadata` 并与当前 Zustand 状态库中的 `styleDnas` 和 `fabricCards` 进行匹配，重新渲染出与当时生成一模一样的交互式摘要卡片，实现状态的可回溯性。

---

> [!TIP]
> **后续优化方向**：
> 1. 可以为 `@` 联想列表添加键盘上下键选取和回车选取的辅助控制。
> 2. 当风格库或面料库越来越庞大时，可以在弹窗列表或下拉联想中添加快速模糊搜索过滤功能。

