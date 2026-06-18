# MajoWear 设计 Agent 提示词与路由整改建议

本文档基于 `CHANGELOG.md`、`src/app/api/agent/generate/route.ts`、`src/components/workspace/AgentChat.tsx`、`docs/agent_implementation_guide.md` 与 `docs/agent_maintenance_manual.md` 的实际实现，对设计 Agent 当前提示词、工具调用路由、冲突处理与款式生成稳定性进行整改梳理。

目标不是增加更多提示词，而是让提示词、工具 schema、意图分类器和后端兜底逻辑形成一致的执行链路。

---

## 一、 当前架构理解与需要整改的点

从 changelog 可以看出，当前 Agent 编排不是单次工具调用，而是逐步演化出的设计闭环：

1. **1.3.0** 引入 immediate predecessor 原则，让改款使用上一版或 @ 指定款式图作为视觉编辑基础。
2. **1.5.0** 引入参数冲突拦截器和设计师决策卡片，让关键面料/风格取舍交给用户决定。
3. **1.6.0** 引入助手 Agent 抢跑建卡：用户选择 `custom_*` 临时概念后，子 Agent 先创建真实 Fabric Card / Style DNA，再由主 Agent 接力生成款式。
4. **1.6.2 - 1.6.3** 修复流式状态、前端消息 ID、卡片去重、历史消息回溯等协作一致性问题。
5. **1.6.4** 重点调优 `design_rationale`，要求先讲服装设计，再讲材料如何服务设计。

因此，整改目标不是推翻“冲突前置确认”或“子 Agent 抢跑”，而是让提示词、路由和上下文传递更准确地服务这套既有编排。

在此基础上，下一阶段的产品目标应从“分类后执行工具”升级为“意图优先、Agent 驱动的设计编排”：

1. Agent 先理解用户要直接生成、先分析、对比、融合、改款，还是创建资产。
2. 如果用户需要“先分析再决定”，Agent 使用思考模型输出专业分析，并生成设计方向决策卡。
3. 用户选择某个方向，或手动输入新的方向。
4. 系统携带原始 prompt、分析结果、用户选择、@ 款式、图片、父款、面料和风格上下文进入后续设计生成。
5. 如后续又遇到面料/风格冲突，继续使用现有 conflict resolution 卡片和子 Agent 建卡链路。

### 1. 提示词要求与代码路由不一致

系统提示词中写明：

- 用户想设计、修改、创建变体时，必须调用 `generate_garment_design`。
- 如果用户确认了面料/风格选择，主 Agent 应继续完成设计生成；如果用户选择的面料/风格概念尚不存在，子 Agent 应先创建对应资产，再回到主流程继续生成。

但实际代码先通过分类器把用户输入分为：

- `DEEP_THINK`
- `TOOL`
- `SEARCH`

只有 `intent === 'TOOL'` 时才挂载 `generate_garment_design`、`create_style_dna`、`create_fabric_card` 三个工具。若用户说“分析一下这个版型并帮我改成更硬挺的夹克”，分类器可能判为 `DEEP_THINK`，此时模型根本没有工具可调用。

这会导致提示词中的强制工具调用规则在运行时失效。

### 2. 冲突检测前置确认是产品设计，但提示词需与之对齐

`detectAndResolveConflict` 返回 `hasConflict: true` 时，后端会保存一条冲突确认消息并提前 `return`。这不是问题本身，而是符合当前产品设计：当面料、风格 DNA 与用户需求存在明显冲突或需要设计取舍时，应弹窗让用户选择。

当前实际产品链路应被明确写进提示词和文档：

1. 用户提出设计请求。
2. 后端检测到面料/风格冲突。
3. 系统弹出选择或确认，让用户决定保留当前预设、切换已有预设，或选择新的概念预设。
4. 如果用户选择已有预设，主 Agent 使用该预设继续设计。
5. 如果用户选择的面料或风格概念不存在数据库中，子 Agent 先根据用户选择创建 Fabric Card 或 Style DNA。
6. 子 Agent 创建完成后，主 Agent 使用新资产继续完成原始设计任务。

因此需要整改的不是“取消冲突弹窗”，而是删除或修正提示词中“不要阻塞生成”的表述，避免模型误以为兼容性冲突只能写入 `review_issues`。

### 3. `is_new_design` 不是必填，缺省行为偏向改款

`generate_garment_design` 的 tool schema 中，`is_new_design` 和 `parent_id` 都不是 required 字段。

后端使用：

```ts
const isNewDesign = args.is_new_design === true;
```

这意味着只要模型漏填 `is_new_design`，就会被当作 `false` 处理。如果当前上下文存在父款，系统可能错误地加载父款图片并进入“基于前身图片编辑”的流程。

### 4. Silent match 后数据字段不完整

冲突检测中，为了匹配项目已有预设，查询 Style DNA 时只取了：

- `id`
- `name`
- `keywords`
- `materials`

但后续系统提示词会访问：

- `colors`
- `silhouettes`
- `details`
- `avoid`

如果 silent match 命中 Style DNA，后续拼接系统提示词时可能出现字段缺失或 `.join` 报错。

Fabric Card 也存在类似问题：候选查询只取了部分字段，但系统提示词需要完整的 `composition`、`weight_gsm`、`texture`、`drape`、`stretch`、`sheen`、`transparency`、`prompt_description`。

### 5. 父款和引用款查询缺少用户/项目边界

当前通过 `parentVersionId`、`referencedGarmentIds`、`args.parent_id` 查询 `garment_cards` 时，主要按 UUID 查询，没有同步限制 `user_id` 或 `project_id`。

如果某个 garment UUID 泄露，存在跨用户或跨项目读取款式卡的风险。

### 6. 冲突弹窗重提交会丢失 @ 引用款式上下文

`handleSendPrompt` 会从 contenteditable DOM 中提取 `span[data-id]`，并把 `referencedGarmentIds` 传给后端。

但如果本轮先触发冲突弹窗，用户选择选项后，`handleSelectConflictOption` 的二次提交中使用：

```ts
referencedGarmentIds: []
```

这意味着：用户原始请求如果是“把 @夹克A 的领型和 @夹克B 的口袋融合，并换成更硬挺面料”，第一次请求会带上两个 @ 款式 ID；但一旦触发面料冲突确认，用户选择面料后，第二次真正生成时 @ 款式上下文会丢失。

这会影响：

- @ 指定父款覆盖默认 active garment。
- 多款合成设计。
- 多款对比后继续生成。
- 基于 @ 款式的结构继承。

该问题比 review score 更重要，因为它会直接改变主 Agent 看到的设计上下文。

### 7. 缺少“分析后决策再生成”的通用设计决策层

当前 `DEEP_THINK` 能把分析结果返回给用户，但它只是普通文本回复；`conflict_resolution` 能让用户选择，但它只服务于面料/Style DNA 参数冲突。

用户设想的体验是：

1. 用户提出“先分析一下，然后给我几个方向”。
2. Agent 使用思考模型分析版型、结构、风格、商业性或改款路径。
3. Agent 给出若干可执行设计方向，并附带“是否按这个思路继续”的决策选项。
4. 最后一个选项固定为用户手动输入。
5. 用户选择后，主 Agent 带着前面的分析和选择继续生成款式。

这不是现有 conflict card 的语义。它需要一个新的通用 `design_decision` 工作流，与 fabric/style 冲突卡并列：

- `design_decision`：决定设计思路、版型策略、融合优先级、系列路线。
- `conflict_resolution`：决定面料或 Style DNA 参数取舍。

如果直接把这种能力塞进现有 `conflictResolution`，后续会混淆“设计方向决策”和“资产参数冲突”，不利于扩展。

---

## 二、 提示词工程整改建议

### 1. 减少互相冲突的强指令

当前提示词同时存在：

- `When appropriate, use the tools.`
- `If the user wants to design... you MUST call the tool.`
- `For fashion history, fabric queries... answer with plain text.`

这些规则本身合理，但应分层表达，避免模型在“分析并生成”“解释并修改”“比较并合成”等混合意图中摇摆。

建议拆成五段：

1. **Intent Routing**
2. **Context Priority**
3. **Design Generation Rules**
4. **Design Decision Rules**
5. **Plain Text Response Cases**

不要把路由规则、设计质量规则和面料清洁规则混写在同一段里。

### 1.1 将三分类升级为设计工作流意图

当前 `DEEP_THINK / TOOL / SEARCH` 是技术路由分类，不是设计任务分类。它导致“分析”和“工具”互斥，而真实设计请求经常是“先分析，再生成”。

建议把意图分类升级为工作流级别：

```text
DIRECT_GENERATE: 用户要直接生成新款或改款。
ANALYZE_THEN_DECIDE: 用户要先分析、推导、比较方向，然后由用户选择后再生成。
COMPARE_GARMENTS: 用户只想比较 @ 款式，不生成。
MERGE_GARMENTS: 用户要融合多个 @ 款式并生成。
MODIFY_PARENT: 用户要基于父款或 @ 款式改款。
CREATE_ASSET: 用户要创建或保存 Fabric Card / Style DNA。
SEARCH_OR_EXPLAIN: 用户问知识、历史、趋势、解释或闲聊。
```

技术层可以继续映射到不同模型和工具，但不要让技术分类覆盖产品意图。尤其是 `ANALYZE_THEN_DECIDE` 应该先走思考模型，再返回结构化决策卡，而不是直接退化成普通文本。

### 2. 明确上下文优先级

建议在系统提示词中加入固定优先级：

```text
Context Priority:
1. User's latest explicit request
2. Active Fabric Card
3. Active Style DNA
4. Explicitly @-referenced garment card
5. Active Parent Garment Card
6. General fashion knowledge
```

这能解决父款描述覆盖当前面料、历史上下文覆盖最新用户要求的问题。

### 3. 固定 Active Fabric 的覆盖原则

建议保留并强化这一条：

```text
The Active Fabric Card always overrides any fabric information from parent or referenced garments.
Parent garments may contribute silhouette, construction, details, and styling direction, but their outdated fabric composition, texture, or handfeel must not leak into the new design.
```

原因：服装改款中，父款通常会携带旧面料信息。如果不明确覆盖原则，模型很容易把旧款的 Merino-Cotton、Nylon Ripstop 等描述混入新款。

### 4. 让设计阐述先讲衣服，再讲材料

当前已经有 “Balance in Design Rationale” 规则，但可以更结构化。

建议要求 `design_rationale` 按以下顺序组织：

1. 核心设计概念与穿着场景
2. 廓形、比例与 fit
3. 结构细节：裁片、分割线、领型、袖型、口袋、门襟、下摆、腰部处理等
4. 与 Style DNA 的审美关系
5. Active Fabric 如何服务这些设计选择

关键原则：

```text
Design first, fabric as enabler.
```

也就是说，材料只能作为支撑廓形、功能、触感、保暖性、垂坠、挺括或视觉肌理的手段，不应把 `design_rationale` 写成一段面料规格说明。

### 5. 将 review score 定位为轻量参考

服装设计的好坏最终由用户和设计语境主观判断，`review_style_match_score`、`review_fabric_match_score` 等字段不应被设计成重型质量裁判。它们更适合作为轻量反馈、趣味化评价，或给用户一个快速参考。

建议只给模型一个轻量评分口径，避免把评分写得像严格审核系统：

```text
review_fabric_match_score:
- High score: The selected fabric naturally supports the garment's silhouette, structure, comfort, and visual mood.
- Medium score: The fabric is usable, but some design details require compromise.
- Low score: The fabric choice creates clear construction or styling tension.

review_style_match_score:
- High score: The garment clearly expresses the active Style DNA.
- Medium score: The garment is mostly aligned but introduces some deviation.
- Low score: The garment noticeably departs from the active Style DNA.
```

评分不应替代用户判断，也不应阻止生成。真正重要的设计决策应通过冲突弹窗、用户选择、面料/风格资产状态和最终视觉结果来闭环。

### 6. 去掉主观风格词

例如：

```text
beautifully structured markdown comparison table
```

建议改成：

```text
Use a concise markdown comparison table with fixed columns.
```

“beautifully” 对输出稳定性帮助不大，还会增加风格漂移。固定列名、固定顺序、固定分析维度更可靠。

### 7. 增加 Design Decision Card 提示词规则

新增设计决策层时，提示词需要明确：

```text
Design Decision Workflow:
If the user asks to analyze before designing, compare possible directions, think through a modification, or asks whether to proceed with a concept, do not directly generate the garment. First produce a design decision card.

The design decision card should include:
1. A concise professional analysis.
2. 2-4 actionable design direction options created by the LLM.
3. Each option should include a label, design strategy, expected visual effect, and prompt addition.
4. The final option must always allow manual user input.

After the user selects an option, continue the original garment design task using the selected direction, the prior analysis, the original prompt, referenced garments, parent garment, active Fabric Card, active Style DNA, and uploaded images.
```

这条规则的重点是：Agent 可以提出方向，但最终由用户拍板；系统必须记住用户拍板后的选择，并让主 Agent 执行。

---

## 三、 后端代码整改建议

### P0：让工具调用路由与提示词一致

当前：

```ts
const isToolBranch = intent === 'TOOL';
const tools = isToolBranch
  ? [{ functionDeclarations: [generateGarmentTool, createStyleDnaTool, createFabricCardTool] }]
  : [{ googleSearch: {} }];
```

建议把“是否需要深度推理”和“是否允许工具调用”解耦。

推荐路由：

- `SEARCH`：挂载 Google Search。
- `WORK`：挂载 garment/style/fabric tools。
- `WORK_WITH_REASONING`：使用更强模型或更高 thinking level，同时也挂载 tools。

也就是说，深度分析不应该排斥工具调用。很多真实请求会是“先分析，再生成”。

如果引入设计决策层，推荐路由进一步升级为：

```text
SEARCH_OR_EXPLAIN     -> googleSearch 或普通文本
COMPARE_GARMENTS      -> 思考模型 + markdown 对比，不挂生成工具
ANALYZE_THEN_DECIDE   -> 思考模型 + present_design_decision 工具/结构化响应
DIRECT_GENERATE       -> 现有冲突检测 + generate_garment_design
MODIFY_PARENT         -> 现有冲突检测 + generate_garment_design
MERGE_GARMENTS        -> 可先 design_decision，也可直接 generate_garment_design
CREATE_ASSET          -> create_style_dna / create_fabric_card
```

这里的关键是：`ANALYZE_THEN_DECIDE` 不是终态，它是一个暂停点。用户选择方向后，再进入 `DIRECT_GENERATE` / `MODIFY_PARENT` / `MERGE_GARMENTS`。

### P0：设计生成类请求强制 function call

如果已判定为设计生成、改款、合成、保存资产，应使用 function calling config 强制工具调用，而不是只靠系统提示词。

可参考 `@google/genai` 的 `FunctionCallingConfigMode.ANY`。

目标行为：

- 设计/改款请求：必须返回 `generate_garment_design`。
- 保存 Style DNA：必须返回 `create_style_dna`。
- 保存 Fabric Card：必须返回 `create_fabric_card`。
- 普通问答：不挂载这些工具。

注意：这里的“强制工具调用”只应发生在已确认是工作流请求的分支中，不应影响 Google Search 问答分支，也不应跳过前置冲突确认。冲突确认仍然应优先发生；用户选择完成后，重提交的工作流请求再强制进入对应工具。

### P0：新增 `present_design_decision` 结构化响应

为了实现“分析后决策再生成”，建议新增一个工具或等价的结构化响应类型：

```ts
const presentDesignDecisionTool = {
  name: 'present_design_decision',
  description: 'Present professional design analysis and actionable direction options before garment generation.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      analysis_markdown: { type: Type.STRING },
      decision_question: { type: Type.STRING },
      options: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            label: { type: Type.STRING },
            summary: { type: Type.STRING },
            design_strategy: { type: Type.STRING },
            prompt_addition: { type: Type.STRING },
            value: { type: Type.STRING }
          },
          required: ['id', 'label', 'summary', 'design_strategy', 'prompt_addition', 'value']
        }
      }
    },
    required: ['analysis_markdown', 'decision_question', 'options']
  }
};
```

约束：

- 前 2-4 个选项由 LLM 根据上下文生成。
- 最后一个选项固定为手动输入，例如 `value: "manual"`。
- `prompt_addition` 应该是后续生成可直接拼入最终设计任务的英文设计方向补充。
- 该工具不创建 garment card，只创建用户决策暂停点。

### P0：前端新增 `designDecision` 消息类型

不要复用 `conflictResolution`，建议在 `ChatMessage` 中新增：

```ts
designDecision?: {
  analysisMarkdown: string
  question: string
  resolved: boolean
  selectedOptionLabel?: string
  selectedPromptAddition?: string
  options: Array<{
    id: string
    label: string
    summary: string
    design_strategy: string
    prompt_addition: string
    value: string
  }>
  contextSnapshot?: AgentContextSnapshot
}
```

UI 可以复用现有 conflict card 的视觉语言，但文案应表达“设计方向确认”，而不是“参数冲突确认”。

最后一个“手动输入”选项应内嵌输入框，输入内容会变成新的 `prompt_addition`。

### P0：重提交时传递 `decisionContext`

用户选择设计方向后，前端应向 `/api/agent/generate` 发送：

```ts
{
  prompt: originalPrompt,
  decisionResolved: true,
  decisionContext: {
    analysisMarkdown,
    selectedOptionLabel,
    selectedPromptAddition,
    originalPrompt,
    referencedGarmentIds,
    parentVersionId,
    imageUrls,
    styleDnaId,
    fabricCardId
  }
}
```

后端在构建主 Agent prompt 时，应显式加入：

```text
Original user request:
...

Prior design analysis:
...

User selected design direction:
...

Continue the garment design according to the selected direction while respecting active Fabric Card, active Style DNA, parent garment, referenced garments, and uploaded images.
```

这样“先分析”不会变成只给用户看过的一段文本，而会真正进入主 Agent 的设计上下文。

### P0：引入 Agent Context Snapshot

为了避免多轮决策、冲突卡、子 Agent 建卡后上下文丢失，建议在进入生成前构建统一快照：

```ts
type AgentContextSnapshot = {
  originalPrompt: string
  workflowIntent: string
  parentVersionId?: string
  referencedGarmentIds: string[]
  imageUrls: string[]
  activeFabricCardId?: string
  activeStyleDnaId?: string
  decisionContext?: any
  conflictResolution?: any
}
```

这个 snapshot 可以存入：

- 前端 `ChatMessage`
- 后端 `generation_tasks.input`
- 决策卡 `grounding_metadata`

主 Agent 不应只依赖聊天历史来恢复上下文。

### P0：把 `is_new_design` 加入 required

当前 required 中没有：

- `is_new_design`
- `parent_id`
- `negative_prompt`

建议至少把 `is_new_design` 加入 required。

```ts
required: [
  'title',
  'category',
  'design_rationale',
  'prompt',
  'fit',
  'collar',
  'sleeves',
  'pockets',
  'closures',
  'details',
  'is_new_design',
  'review_style_match_score',
  'review_fabric_match_score',
  'review_structure_clarity_score',
  'review_prompt_compliance_score',
  'review_issues',
  'review_suggested_revision'
]
```

`parent_id` 可以保持可选，因为只有明确引用某个非默认父款时才需要填写。

### P1：服务端兜底判定 `is_new_design`

即使 schema 要求模型填字段，服务端仍应兜底。

建议逻辑：

```ts
const wantsNewDesign = args.is_new_design === true;
const hasParentContext = Boolean(parentVersionId || args.parent_id);
const isNewDesign = wantsNewDesign || !hasParentContext;
```

同时可以加入更保守的保护：

- 如果用户明确说“新设计”“从零设计”“不要基于上一款”，强制 `isNewDesign = true`。
- 如果用户明确说“改一下”“变体”“基于这件”“沿用上一款”，强制 `isNewDesign = false`。

### P1：Silent match 后重新 fetch 完整记录

命中 `matchedEntityId` 后，不应直接使用候选列表里的裁剪对象。

建议：

```ts
if (conflictResult.conflictType === 'fabric') {
  const { data } = await supabase
    .from('fabric_cards')
    .select('*')
    .eq('id', conflictResult.matchedEntityId)
    .eq('user_id', user.id)
    .single();
  fabricCardData = data;
  fabricCardId = data?.id;
}
```

Style DNA 同理，重新 `.select('*')`，并加 `user_id` 限制。

根据 changelog 1.1.0，Style DNA 与 Fabric Card 已经被调整为用户级全局预设，而不是严格项目级预设。因此候选列表查询也应优先按 `user_id` 取数；如果后续需要“项目内优先、用户全局兜底”，可以在排序或过滤策略中体现，而不是只用 `project_id`。

当前代码中：

```ts
supabase.from('fabric_cards').select(...).eq('project_id', projectId)
supabase.from('style_dnas').select(...).eq('project_id', projectId)
```

可能漏掉用户在其他项目创建但按产品设计应全局可用的面料/风格预设。

### P1：为父款、引用款、parent_id 查询加权限边界

所有 `garment_cards` 查询建议至少加：

```ts
.eq('user_id', user.id)
```

如果业务上款式卡必须属于当前项目，则再加：

```ts
.eq('project_id', projectId)
```

涉及位置：

- `parentVersionId` 加载父款
- `referencedGarmentIds` 加载引用款
- `args.parent_id` 覆盖默认父款

这属于数据隔离问题，优先级高于提示词优化。

### P1：冲突重提交时保留 @ 引用 ID

前端需要在冲突卡二次提交时保留原始请求的 `referencedGarmentIds`。

建议做法：

1. 在用户消息写入 Zustand `messages` 时，把本次提取出的 `referencedGarmentIds` 一起保存在消息对象上。
2. 扩展 `ChatMessage` 类型，增加可选字段：

```ts
referencedGarmentIds?: string[]
```

3. `handleSelectConflictOption` 找到 predecessor user message 后，从该消息读取原始 `referencedGarmentIds`，而不是传空数组。

```ts
referencedGarmentIds: userMsg?.referencedGarmentIds || []
```

4. 后端保存 `chat_messages` 时也可以将引用 ID 放入 `grounding_metadata`，方便历史回溯和调试。

这样能保证“@ 引用款式 + 冲突确认 + 子 Agent 建卡 + 主 Agent 生成”的长链路上下文不丢失。

同样原则也适用于 `designDecision` 重提交：无论是设计决策卡，还是面料/风格冲突卡，都必须保留原始 `referencedGarmentIds`、图片、父款和用户 prompt。

### P2：保留冲突前置确认，并补齐继续任务链路

当前产品应明确采用“冲突前置确认”策略：

- 当用户需求与当前 active fabric / active Style DNA 产生明显冲突时，先让用户选择。
- 用户选择已有预设时，主 Agent 使用该预设继续任务。
- 用户选择不存在于数据库的新概念时，子 Agent 先创建 Fabric Card 或 Style DNA。
- 子 Agent 创建完成后，主 Agent 使用新资产继续原始设计请求。

这条链路比“直接生成并把问题写进 review_issues”更符合设计软件的交互：设计师应该在关键材料和风格取舍上拥有主动权。

需要整改的是提示词和代码注释里的表达：

- 删除“不要阻塞生成”或“兼容性问题只能写入 review”的表达。
- 明确写成“冲突由后端前置拦截并交给用户选择”。
- 明确写成“选择新概念时由子 Agent 创建资产，之后主 Agent 继续任务”。
- `review_issues` 只保留为轻量提示，不承担主要决策职责。

### P2：升级 @ 引用为语义角色

当前 @ 引用只是把 garment card 列入 `Referenced Garment Cards`。如果要增强 Agent 驱动体验，可以让 Agent 在分析阶段判断每个 @ 款式的语义角色：

```text
@A as silhouette source
@B as pocket/detail source
@C as style mood reference
@D as avoid reference
```

这特别适用于：

- 多款融合
- 对比后生成
- 基于 A 的廓形但使用 B 的细节
- 用户说“像这件，但不要它的领子”

该能力可以先在 `ANALYZE_THEN_DECIDE` 分支中实现，不必一开始影响所有生成请求。

---

## 四、 建议替换的核心提示词段落

以下段落可替换当前 `Constraint Alignment Guidelines`、`Intent Guidelines` 和 `Semantic Mentions & Comparison Guidelines` 的主体内容。

```text
Garment Design Agent Guidelines

Core Principle:
The garment design must align with the active Fabric Properties and active Style DNA. Design decisions come first; fabric must be described as supporting the garment's silhouette, structure, function, comfort, and aesthetic, not as a standalone material specification.

Context Priority:
1. User's latest explicit request
2. Active Fabric Card
3. Active Style DNA
4. Explicitly @-referenced garment card
5. Active Parent Garment Card
6. General fashion knowledge

The Active Fabric Card always overrides any fabric information from parent or referenced garments. Parent garments may contribute silhouette, construction, details, and styling direction, but their outdated fabric composition, texture, or handfeel must not leak into the new design.

Intent Routing:
- If the user asks to design, generate, modify, tweak, create a variant, combine garments, or produce an actionable garment concept directly, call generate_garment_design.
- If the user asks to analyze, think through, compare possible directions, or decide whether to proceed before designing, first call present_design_decision instead of generating the garment immediately.
- If the user asks to modify, tweak, iterate, or create a variant from a Parent Garment Card, set is_new_design to false.
- If the user explicitly @-references a garment and asks to modify or iterate it, treat that garment as the parent, set is_new_design to false, and set parent_id to that garment's ID.
- If the user explicitly asks for a brand new garment that does not iterate from any parent or referenced garment, set is_new_design to true.
- Translate casual or short user prompts into a detailed English garment design prompt before calling the tool.

Design Decision Workflow:
Use present_design_decision when the user wants analysis before generation, design strategy options, or a recommendation that requires user approval.
The response must include:
1. Concise professional analysis.
2. 2-4 actionable direction options.
3. A final manual-input option.
4. For each generated option: label, summary, design strategy, and prompt addition for later generation.
After the user selects an option, continue the original garment design task using the selected option, prior analysis, original prompt, referenced garments, parent garment, active Fabric Card, active Style DNA, and uploaded images.

Style DNA and Fabric Card Saving:
- If the user asks to save, create, or record a Style DNA, call create_style_dna.
- If the user asks to save, create, or record a Fabric Card, call create_fabric_card.

Design Rationale Requirements:
The design_rationale must explain:
1. Core garment concept and intended use
2. Silhouette, proportion, and fit
3. Structural features such as cuts, seams, closures, pockets, panels, hems, collar, sleeves, waist treatment, or layering system
4. Aesthetic mood and relationship to the active Style DNA
5. How the active fabric's weight, drape, stretch, texture, warmth, structure, or surface quality supports those specific design choices

The rationale must not read like a plain fabric specification. Mention fabric only in relation to design function, visual effect, comfort, construction, or wearability.

Review Scoring:
Review scores are lightweight references, not final judgments of design quality. The user's subjective evaluation is the final authority.
- High fabric score: The selected fabric naturally supports silhouette, construction, comfort, and visual mood.
- Medium fabric score: The fabric is usable, but some details require compromise.
- Low fabric score: The fabric creates clear construction or styling tension.
- High style score: The garment clearly expresses the active Style DNA.
- Medium style score: The garment is mostly aligned but introduces some deviation.
- Low style score: The garment noticeably departs from the active Style DNA.

Conflict Resolution:
If fabric or Style DNA compatibility requires a user decision, the backend may pause generation and present a conflict-resolution dialog. After the user selects an existing preset, continue generation with that preset. If the selected fabric or style concept does not exist in the database, a sub-agent should create the corresponding Fabric Card or Style DNA first, then the main agent should continue the original garment design task with the newly created asset.

Referenced Garment Handling:
- Match @mentions in the user prompt against the Referenced Garment Cards list.
- If the user compares two or more @-referenced garments, reply in plain text with a concise markdown comparison table.
- The comparison table must include: Fit, Collar, Sleeves, Pockets, Closures, Key Details, Fabric/Material Direction, and Design Rationale.
- After the table, provide a concise professional fashion studio analysis covering aesthetic differences, fabric compatibility, and styling synergy.
- If the user asks to combine or merge referenced garments, call generate_garment_design and synthesize the selected features into one coherent garment.

Plain Text Response Cases:
For fashion history, fabric education, styling explanation, greetings, or non-actionable discussion, answer in plain text. Use Google Search grounding when factual current information is needed.
```

---

## 五、 推荐整改顺序

### 第一阶段：意图优先工作流路由

1. 将 `DEEP_THINK / TOOL / SEARCH` 升级为设计工作流意图，如 `DIRECT_GENERATE`、`ANALYZE_THEN_DECIDE`、`COMPARE_GARMENTS`、`MERGE_GARMENTS`、`MODIFY_PARENT`、`CREATE_ASSET`、`SEARCH_OR_EXPLAIN`。
2. 新增 `present_design_decision` 工具或结构化响应。
3. 前端新增 `designDecision` 卡片。
4. 用户选择后通过 `decisionContext` 重提交，并保留原始 prompt、@ 引用、图片、父款、面料和风格上下文。

预期收益：Agent 能先理解任务形态，主动组织“分析 -> 用户拍板 -> 执行”的设计流程。

### 第二阶段：稳定工具调用

1. 将 `is_new_design` 加入 tool schema required。
2. 把“需要思考”和“需要工具”从互斥关系改成可组合关系。
3. 对用户已经确认的设计/改款/保存资产请求启用强制 function calling。
4. 增加服务端 `is_new_design` 兜底判定。
5. 冲突卡和设计决策卡重提交时都保留原始 `referencedGarmentIds`，避免 @ 款式上下文丢失。

预期收益：减少“用户明明要生成，Agent 却只聊天分析”的问题。

### 第三阶段：修复数据安全与字段完整性

1. Silent match 后重新读取完整 Fabric/Style DNA。
2. Fabric/Style DNA 候选查询优先使用 `user_id`，匹配用户级全局预设的产品设计。
3. 所有 garment 查询加 `user_id` 和必要的 `project_id` 过滤。
4. 对缺失字段做空数组或空字符串兜底，避免 `.join` 报错。

预期收益：减少运行时异常和跨用户数据读取风险。

### 第四阶段：收敛提示词

1. 用“上下文优先级 + 生成规则 + 设计决策链路 + 冲突确认链路 + 轻量评分规则”替换当前大段混合规则。
2. 删除主观、不稳定表达，如 `beautifully structured`。
3. 明确当前产品采用“冲突前置确认 + 用户选择 + 子 Agent 补齐资产 + 主 Agent 继续生成”的链路。
4. 明确新增产品链路：“分析先行 + 设计方向决策卡 + 用户选择 + 主 Agent 生成”。

预期收益：让模型输出更稳定，减少父款旧面料污染新设计。

---

## 六、 验收用例

建议整改后至少验证以下场景：

1. **新设计**  
   用户：“重新设计一件廓形硬挺的短夹克。”  
   期望：调用 `generate_garment_design`，`is_new_design: true`。

2. **基于父款改款**  
   用户：“把这件改成更适合秋冬通勤。”  
   期望：调用 `generate_garment_design`，`is_new_design: false`，使用父款图片作为编辑基础。

3. **明确不要基于父款**  
   用户：“不要沿用上一件，从零做一件连衣裙。”  
   期望：`is_new_design: true`，不加载父款图片。

4. **@引用款改款**  
   用户：“把 @宽松短夹克 的口袋改得更机能一点。”  
   期望：`is_new_design: false`，`parent_id` 为被引用款 ID。

5. **@引用款改款 + 面料冲突弹窗**  
   用户：“把 @宽松短夹克 改成更硬挺的建筑感面料。”  
   期望：第一次请求触发冲突弹窗；用户选择面料后，二次提交仍保留 @ 宽松短夹克的 garment ID，最终生成时 `parent_id` 指向该引用款。

6. **@多款对比**  
   用户：“对比 @夹克A 和 @夹克B 的结构差异。”  
   期望：纯文本 markdown 表格，不调用生成工具。

7. **@多款合成**  
   用户：“融合 @夹克A 的领型和 @夹克B 的口袋，做一件新外套。”  
   期望：调用 `generate_garment_design`，输出合成后的统一设计，而不是简单拼贴。

8. **面料冲突**  
   当前面料为轻薄真丝，用户要求“做硬挺建筑感机能夹克”。  
   期望：先弹出冲突确认，让用户选择保留当前面料、切换已有面料，或选择新的概念面料。

9. **选择新概念面料**  
   用户在冲突弹窗中选择一个数据库中不存在的新概念面料。  
   期望：子 Agent 先创建 Fabric Card，创建完成后主 Agent 使用该 Fabric Card 继续原始款式生成任务。

10. **用户级全局预设匹配**  
   用户在项目 A 创建过“重磅尼龙”，项目 B 中请求“用重磅尼龙做一件夹克”。  
   期望：冲突检测和 silent match 能识别该用户级全局面料，而不是只查当前 `project_id`。

11. **旧面料污染检查**  
   父款 rationale 中含 Merino-Cotton，当前 active fabric 为 Baby Cashmere。  
   期望：新款 prompt、details、rationale 不出现 Merino-Cotton。

12. **分析后决策再生成**  
   用户：“先分析一下这件夹克还能怎么改，再给我几个方向选择。”  
   期望：先使用思考模型返回 `designDecision` 卡片，包含专业分析、2-4 个设计方向和手动输入选项；不立即生成 garment。

13. **选择设计方向后继续生成**  
   用户在 `designDecision` 卡片中选择“强化建筑感短夹克”。  
   期望：二次提交携带 `decisionContext`，主 Agent 根据原始 prompt、分析结果、所选方向、父款、@ 款式、图片、面料和 Style DNA 生成 garment。

14. **设计决策后仍触发面料冲突**  
   用户选择的设计方向需要硬挺面料，但当前 active fabric 是轻薄真丝。  
   期望：设计方向选择完成后，进入现有 conflict resolution 卡片，让用户决定保留真丝、切换已有面料或创建新面料。

15. **手动输入设计方向**  
   用户选择 `designDecision` 的最后一个“手动输入”选项，并输入“更像秀场款，但保留实穿口袋”。  
   期望：该输入作为 `selectedPromptAddition` 进入后续生成，而不是丢失在聊天文本中。

---

## 七、 结论

当前问题的根源不是提示词不够强，而是提示词、分类器、工具挂载和后端执行策略之间没有完全对齐。

优先整改方向：

1. 将三分类 intent 升级为设计工作流意图，让 Agent 先判断任务形态，而不是先判断是否有工具。
2. 新增 `designDecision` 通用设计决策卡，实现“分析 -> 用户拍板 -> 继续生成”。
3. 让设计类请求在用户确认后始终拥有并强制使用对应工具。
4. 保留冲突前置确认，并在提示词中明确“用户选择后继续任务”的链路。
5. 把 `is_new_design` 从模型自由发挥变成 schema 必填和服务端兜底。
6. 冲突卡和设计决策卡重提交时都保留 @ 引用款式上下文，保证决策卡不会切断原始设计意图。
7. 按用户级全局预设的产品设计修正 Fabric/Style DNA 候选查询和 silent match 完整读取。
8. 强化 Active Fabric 覆盖 Parent Fabric 的规则，避免父款旧材质污染新设计。
9. 将 review score 定位为轻量参考，不把它当作设计质量的重型裁判。
