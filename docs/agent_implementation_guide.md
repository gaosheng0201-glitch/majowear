# MajoWear 双 Agent 协同设计与极速资产抢跑实现指南
> **面向课件制作与架构复现的保姆级代码级技术手册**

本指南完全基于项目实际运行的代码，对 **“设计 Agent”（主）与“助手 Agent”（子）协同工作流**、**分歧决策反馈环路** 以及 **工作区状态透明度 UX** 的实现细节进行代码级深度拆解，用于视频课件编写和逻辑复现。

---

## 目录
1. [Supabase 数据库物理表结构 (DDL)](#1-supabase-数据库物理表结构-ddl)
2. [后端 NLP 判定与助手 Agent 抢跑设计 (`route.ts`)](#2-后端-nlp-判定与助手-agent-抢跑设计-routets)
3. [流式推送与 ReadableStream 架构](#3-流式推送与-readablestream-架构)
4. [前端流式解析与双 Agent 状态联动 (`AgentChat.tsx`)](#4-前端流式解析与双-agent-状态联动-agentchattsx)
5. [零到一系统复现与课件讲授大纲建议](#5-零到一系统复现与课件讲授大纲建议)

---

## 1. Supabase 数据库物理表结构 (DDL)

复现这套逻辑首先需要在数据库中建立支持关系约束与 Grounding 历史记录的表结构。以下是核心 DDL：

```sql
-- 1. 面料卡预设表 (fabric_cards)
CREATE TABLE fabric_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  project_id UUID,
  name TEXT NOT NULL,
  image TEXT, -- 面料样照/色卡 URL
  composition TEXT, -- 纤维成分 (如 80% Neoprene)
  weight_gsm INTEGER, -- 克重
  texture TEXT, -- 纹理肌理 (如 smooth synthetic matte)
  drape TEXT, -- 悬垂性 (如 crisp structural)
  stretch TEXT, -- 弹性 (如 4-way stretch)
  sheen TEXT, -- 光泽 (如 matte)
  transparency TEXT, -- 透光度 (如 opaque)
  prompt_description TEXT, -- 专用于生图提示词中渲染此纹理的描述段
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. 风格 DNA 表 (style_dnas)
CREATE TABLE style_dnas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  project_id UUID,
  name TEXT NOT NULL,
  reference_images TEXT[] DEFAULT '{}'::TEXT[],
  keywords TEXT[] DEFAULT '{}'::TEXT[],
  colors TEXT[] DEFAULT '{}'::TEXT[],
  silhouettes TEXT[] DEFAULT '{}'::TEXT[],
  materials TEXT[] DEFAULT '{}'::TEXT[],
  details TEXT[] DEFAULT '{}'::TEXT[],
  avoid TEXT[] DEFAULT '{}'::TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. 款式卡表 (garment_cards)
CREATE TABLE garment_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  project_id UUID,
  parent_id UUID REFERENCES garment_cards(id) ON DELETE SET NULL, -- 迭代前身 ID
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  images TEXT[] NOT NULL,
  design_rationale TEXT, -- 设计阐述
  schema JSONB, -- 包含 fit, collar, sleeves, pockets, closures, details
  fabric_card_id UUID REFERENCES fabric_cards(id) ON DELETE SET NULL, -- 强外键关联
  style_dna_id UUID REFERENCES style_dnas(id) ON DELETE SET NULL, -- 强外键关联
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. 聊天记录表 (chat_messages)
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'agent')),
  text TEXT,
  image_urls TEXT[] DEFAULT '{}'::TEXT[],
  grounding_metadata JSONB, -- 【核心】用于保存决策选项、新建卡片关联、以及 resolved 状态
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
```

---

## 2. 后端 NLP 判定与助手 Agent 抢跑设计 (`route.ts`)

后端入口路由 [route.ts](file:///d:/majowear/src/app/api/agent/generate/route.ts) 是整个架构的核心，集成了 NLP 语义分歧拦截和助手 Agent。

### 2.1 极速助手 Agent 规格生成器
当收到非 UUID 参数（如设计师在决策卡片中选取的 `custom_neoprene` 面料）时，前置拦截器拦截请求，交由 **助手 Agent** 极速推导规格并入库。

```typescript
// 使用 Google Gen AI SDK 进行强类型 JSON 规格推导
import { ai } from '@/lib/gemini';
import { Type } from '@google/genai';

async function generateFabricCardSpecs(conceptId: string, userPrompt: string) {
  const prompt = `You are a professional textile expert and fashion studio assistant.
The user is designing a garment with the request: "${userPrompt}".
The selected concept fabric/material is identified as: "${conceptId}".

Please define the detailed physical specifications of this fabric:
1. Determine a clean, professional, and elegant name for this fabric (e.g. "Neoprene" or "专业潜水料").
2. Estimate a realistic fiber composition (e.g. "85% Neoprene, 15% Nylon").
3. Choose a realistic weight in GSM (grams per square meter, an integer like 320).
4. Describe its texture, drape, stretch, sheen, and transparency.
5. Write an optimized English texturing prompt description.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.5-flash', // 使用 flash 极速响应，延迟降至 0.6s
    contents: prompt,
    config: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          composition: { type: Type.STRING },
          weight_gsm: { type: Type.INTEGER },
          texture: { type: Type.STRING },
          drape: { type: Type.STRING },
          stretch: { type: Type.STRING },
          sheen: { type: Type.STRING },
          transparency: { type: Type.STRING },
          prompt_description: { type: Type.STRING }
        },
        required: ['name', 'composition', 'weight_gsm', 'texture', 'drape', 'stretch', 'sheen', 'transparency', 'prompt_description']
      }
    }
  });

  return JSON.parse(response.text || '{}');
}
```

### 2.2 工作流拦截与 Fail-fast 入库实现
在 `runWorkflow` 最开端，系统对传入的面料 ID（`fabricCardId`）进行校验，若是概念名而非合法的 UUID 格式，则抢跑运行助手 Agent：

```typescript
const isUuid = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

// 在 runWorkflow 启动时的前置逻辑：
if (fabricCardId && !isUuid(fabricCardId)) {
  // 1. 触发协作状态推送：设计 Agent 显示等待，助手 Agent 进场
  onStatus('waiting_subagent_fabric', fabricCardId);
  onStatus('subagent_generating_fabric', fabricCardId);

  // 2. 调用助手 Agent 快速推导
  const specs = await generateFabricCardSpecs(fabricCardId, userPrompt);
  
  // 3. 进入保存状态
  onStatus('subagent_saving_fabric', fabricCardId);

  // 4. 强校验数据库插入 (Fail-fast 原则)
  const { data: newFabric, error: insertErr } = await supabase
    .from('fabric_cards')
    .insert({
      ...specs,
      user_id: user.id,
      project_id: projectId || null
    })
    .select()
    .single();

  // 拒绝降级，有错立熔
  if (insertErr) {
    throw new Error(`Failed to save dynamic fabric card: ${insertErr.message}`);
  }

  // 5. 替换上下文中的外键变量以传给后续主 Agent 生成
  if (newFabric) {
    fabricCardId = newFabric.id;
    fabricCardData = newFabric;
    createdFabricCard = newFabric;

    // 6. 核心：提前将生成卡片流式写入流，实现前端提前从骨架屏渲染为实物卡
    if (stream && onCustomChunk) {
      onCustomChunk('created_fabric', newFabric);
    }
  }
}
```

---

## 3. 流式推送与 ReadableStream 架构

为了在复杂的双 Agent 运行中，将状态和卡片以低延迟、高响应的形式渲染给设计师，API 使用 `ReadableStream` 响应格式，支持连续的事件输出块（以 `\n` 分隔）：

```typescript
if (stream) {
  const encoder = new TextEncoder();
  const customStream = new ReadableStream({
    async start(controller) {
      // 1. 发送中间工作状态
      const sendStatus = (status: string, target?: string) => {
        const data = JSON.stringify({ type: 'status', status, target });
        controller.enqueue(encoder.encode(data + '\n'));
      };
      
      // 2. 发送 Fail-fast 错误信息，直接截断
      const sendError = (message: string) => {
        const data = JSON.stringify({ type: 'error', message });
        controller.enqueue(encoder.encode(data + '\n'));
      };

      // 3. 推送局部临时生成资产 (created_fabric / created_style)
      const sendCustomChunk = (type: string, data: any) => {
        const payload = JSON.stringify({ type, data });
        controller.enqueue(encoder.encode(payload + '\n'));
      };

      const sendResult = (resultData: any) => {
        const data = JSON.stringify({ type: 'result', data: resultData });
        controller.enqueue(encoder.encode(data + '\n'));
      };

      try {
        await runWorkflow(sendStatus, sendResult, sendCustomChunk);
      } catch (err: any) {
        sendError(err?.message || 'Server execution error');
      } finally {
        controller.close();
      }
    }
  });

  return new Response(customStream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
```

---

## 4. 前端流式解析与双 Agent 状态联动 (`AgentChat.tsx`)

前端 [AgentChat.tsx](file:///d:/majowear/src/components/workspace/AgentChat.tsx) 需要完成三大任务：
1. 捕获流中**随时到达**的 `created_fabric`/`created_style` 并保存到本地消息状态。
2. 重构排他性的 `if-else` 实现并列数据加载与高亮激活。
3. 渲染主/子 Agent 协作透明面板，并无缝将骨架屏转换为原生卡片。

### 4.1 readStream 流解析重构
```typescript
const readStream = async (response: Response, agentMsgId: string) => {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body stream.");

  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let finalResult: any = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const chunk = JSON.parse(line);
        if (chunk.type === 'status') {
          // 更新主 Agent 实时状态词条
          setMessages(prev => prev.map(m => m.id === agentMsgId ? {
            ...m,
            loadingStatus: chunk.status,
            loadingTarget: chunk.target || m.loadingTarget
          } : m));
        } else if (chunk.type === 'created_fabric') {
          // 【核心】助手 Agent 生成卡片到达，立即刷入全局 store 并在左侧侧边栏激活
          addFabricCard(chunk.data);
          setActiveFabricCardId(chunk.data.id);
          
          // 局部更新消息气泡中的实物卡片属性，触发前端“骨架屏平滑消失，面料卡浮现”
          setMessages(prev => prev.map(m => m.id === agentMsgId ? {
            ...m,
            createdFabricCard: chunk.data
          } : m));
        } else if (chunk.type === 'created_style') {
          addStyleDna(chunk.data);
          setActiveStyleDnaId(chunk.data.id);
          setMessages(prev => prev.map(m => m.id === agentMsgId ? {
            ...m,
            createdStyleDna: chunk.data
          } : m));
        } else if (chunk.type === 'error') {
          throw new Error(chunk.message || "Backend streamed error");
        } else if (chunk.type === 'result') {
          finalResult = chunk.data;
        }
      } catch (e: any) {
        console.error("Failed to parse stream chunk:", e);
      }
    }
  }

  // 终点并列处理：确保流结束后，款式卡片与动态生成的面料/风格卡片能同时被激活
  if (finalResult && finalResult.isToolCalled) {
    const resData = finalResult;
    if (resData.createdFabricCard) {
      addFabricCard(resData.createdFabricCard);
      setActiveFabricCardId(resData.createdFabricCard.id);
    }
    if (resData.createdStyleDna) {
      addStyleDna(resData.createdStyleDna);
      setActiveStyleDnaId(resData.createdStyleDna.id);
    }
    if (resData.garmentCard) {
      addGarmentCard(resData.garmentCard);
      setActiveGarment(resData.garmentCard);
    }
  }
};
```

### 4.2 双 Agent 协作与骨架屏/实卡无缝转换 UI 结构
在聊天历史气泡的 `msg.loading` 状态下进行条件渲染，助手 Agent 看板使用 **SVG Sparkles 旋转动效** 配合原生卡片组件复用：

```tsx
{msg.loading && (
  <div className="space-y-3 mt-3">
    {/* 1. 主状态指示器：显示“设计 Agent”的当前情况 */}
    <div className="flex items-center space-x-2 text-xs text-muted-foreground">
      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
      <span>{getStatusLabel(msg.loadingStatus || 'understanding', language)}</span>
    </div>

    {/* 2. 助手 Agent 协作区面板 */}
    {(msg.loadingStatus?.includes('subagent') || msg.loadingStatus?.includes('waiting_subagent_')) && (
      <div className="mt-2 border border-primary/10 rounded-lg p-3 bg-primary/5 space-y-3">
        {/* SVG Sparkles 精致旋转徽标，严禁使用 unicode emoji */}
        <div className="flex items-center space-x-2 text-primary font-medium text-xs">
          <Sparkles className="w-3.5 h-3.5 animate-spin text-primary shrink-0" style={{ animationDuration: '3.5s' }} />
          <span>{language === 'zh' ? '助手 Agent 协同中' : 'Assistant Agent Active'}</span>
        </div>
        
        {/* 面料处理分支 */}
        {(msg.loadingStatus?.includes('fabric') || msg.loadingTarget === 'fabric') && (
          <div>
            {msg.createdFabricCard ? (
              // 骨架屏退场，原地渲染出真实的面料卡片（完全沿用系统原本的卡片样式设计）
              <div 
                onClick={() => setActiveFabricCardId(msg.createdFabricCard.id)}
                className={`cursor-pointer rounded-lg border p-2 flex items-center justify-between transition-all duration-200 ${
                  activeFabricCardId === msg.createdFabricCard.id 
                    ? 'bg-primary/5 border-primary/30 shadow-sm' 
                    : 'bg-background/40 border-border hover:bg-background/80'
                }`}
              >
                <div className="flex items-center space-x-2.5 truncate mr-2">
                  <div className="truncate">
                    <span className="text-[9px] uppercase font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                      {language === 'zh' ? '面料卡已录入' : 'Fabric Saved'}
                    </span>
                    <h4 className="text-xs font-semibold mt-1 text-foreground truncate">{msg.createdFabricCard.name}</h4>
                  </div>
                </div>
                <Button size="sm" variant={activeFabricCardId === msg.createdFabricCard.id ? "default" : "ghost"} className="h-6 text-[9px] px-2">
                  {activeFabricCardId === msg.createdFabricCard.id ? '已激活' : '激活'}
                </Button>
              </div>
            ) : (
              // 原生骨架屏加载态，样式必须和系统资产库列表骨架屏完全一致
              <div className="p-3 rounded-lg border border-border bg-background/25 space-y-2.5 animate-pulse">
                <div className="h-4 w-28 bg-muted rounded" />
                <div className="grid grid-cols-2 gap-2">
                  <div className="h-3.5 w-full bg-muted rounded" />
                  <div className="h-3.5 w-full bg-muted rounded" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )}

    {/* 3. 设计 Agent 款式生成骨架屏 */}
    {msg.loadingTarget === 'garment' && (
      <div className="p-3 rounded-lg border border-border bg-background/25 flex items-center justify-between animate-pulse">
        <div className="flex items-center space-x-2.5 truncate mr-2 flex-1">
          <div className="w-10 h-10 rounded bg-muted shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-16 bg-muted rounded" />
            <div className="h-4 w-28 bg-muted rounded" />
          </div>
        </div>
      </div>
    )}
  </div>
)}
```

---

## 5. 零到一系统复现与课件讲授大纲建议

在做视频课件或进行二次复现时，可参考以下大纲进行阶段式拆解讲授：

### 第一阶段：单系统与非结构化输入冲突 (The Pain Point)
1.  **痛点引入**：说明当设计师要求使用“面料 A”，但侧边栏激活的是“面料 B”时，若直接生图会导致图纸与资产卡片发生“状态漂移”和“体验割裂”。
2.  **分歧判定**：讲解如何通过在后台添加 `detectAndResolveConflict` NLP 拦截器。展示如何编写 System Instruction 让 `gemini-3.5-flash` 输出确定性的 JSON，并讲解低温度（`temperature: 0.0`）在判定中的重要作用。
3.  **防重复与状态回溯**：讲解流式响应中的 `conflictResolved` 标记，以及如何通过在 `grounding_metadata` 存储已解决（`resolved`）的历史来防止二次点击。

### 第二阶段：非 UUID 的自定义临时选项与 22P02 报错 (The Blocker)
1.  **报错剖析**：当决策卡片支持设计师自定义新面料（如选项值为字符串 `custom_neoprene`）时，分析为何直接在 Postgres 中对其进行 UUID 外键关联会爆发 `22P02 invalid input syntax` 语法报错。
2.  **UUID 守护**：讲解如何通过正则 `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` 做前置条件判断，实现外键列防卫性写入 `null`。

### 第三阶段：助手 Agent（Sub-agent）极速抢跑建卡 (The Sub-agent Pipeline)
1.  **子 Agent 概念引入**：讲解为何引入一个专注且独立的“助手 Agent”能保证数据的高一致性。
2.  **JSON Schema 强校验**：使用 `gemini-3.5-flash` 对面料物理特征（克重、纤维成分）做规格生成，并利用 **Fail-fast** 强熔断设计写回 Supabase 获取真实的数据库 UUID。
3.  **主子接力**：主 “设计 Agent” 使用推导出的规格 UUID 接力生图，实现 100% 的渲染质感对应。

### 第四阶段：多 Agent 工作状态透明度与骨架屏变幻 (The UX Wow Effect)
1.  **状态流解析**：解析前端如何读取由 `ReadableStream` 依次返回的 status 状态线。
2.  **流包捕获与 store 注入**：如何在流跑完之前，捕获 `created_fabric` 流数据，提前注入全局状态，防止阻塞。
3.  **SVG 精致动效与卡片平滑转换**：讲解如何复用原生卡片和骨架屏样式，通过三元表达式做局部渲染，在助手 Agent 任务完成时瞬间让骨架屏平滑“幻化”为精美面料卡，展现出双 Agent 密切协同的科技感。
