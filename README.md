# AI Personal Fashion Studio (MajoWear)

一个面向独立设计师、服装学生及 AI 创作者的轻量化个人服装设计工作台。本项目通过大语言模型、服装生图模型、风格记忆（Style DNA）和面料参数（Fabric Card），帮助用户持续生成、迭代和管理服装设计方案。

> [!IMPORTANT]
> **版权声明**：本项目采用自定义非商业使用许可，**严禁任何形式的商业用途**。详情请参阅 [LICENSE](LICENSE)。

## 核心功能

*   **项目管理**：支持多项目并行管理，方便管理不同系列的设计资产。
*   **Style DNA（风格基因）**：支持上传多张风格参考图，通过 Gemini 3.5 Flash 自动提取并总结其色彩、廓形、材质、结构细节，沉淀为可复用的 Style DNA，在后续生成中保持风格一致性。
*   **Fabric Library（面料库）**：上传面料图片并填写克重、弹力、垂坠感等物理参数，由 AI 自动生成面料描述并作为设计约束。
*   **Design Agent（AI 设计助手）**：在 Design Agent 对话框中输入设计目标，结合 Style DNA 和 Fabric Card，自动进行结构化款式设计，并调用 Gemini 3.1 Flash/Pro Image 模型渲染出高品质服装设计图/效果图。
*   **款式卡与版本管理**：每个设计方案都是包含廓形、领型、袖型、口袋等结构化数据的“款式卡”，支持版本迭代历史追溯与变体生成（例如：改领型、换面料等）。
*   **Tech Sheet（技术规格单导出）**：一键导出款式说明、结构描述及面料建议。
*   **双语支持**：全局支持中英文一键切换。

## 技术栈

*   **前端框架**：Next.js 16 (App Router), React 19, TailwindCSS, Lucide React
*   **状态管理**：Zustand
*   **数据库 & 存储**：Supabase (本地 Docker 部署或 Cloud)
*   **AI SDK**：Google Gen AI SDK (`@google/genai`)
*   **AI 模型**：
    *   **文本/多模态分析**：Gemini 3.5 Flash / Gemini 3.1 Pro Preview
    *   **服装生图**：Gemini 3.1 Flash Image (`gemini-3-flash-image`) / Gemini 3 Pro Image (`gemini-3-pro-image`)

## 快速开始

### 1. 环境依赖

确保本地已安装以下环境：
- Node.js (推荐 v18+)
- Docker (用于运行本地 Supabase，如使用 Supabase Cloud 可忽略)

### 2. 配置环境变量

在项目根目录下创建 `.env.local` 文件，配置如下环境变量：

```env
# Gemini API Key (用于调用 Google Gemini 接口)
GEMINI_API_KEY=your_gemini_api_key_here

# Supabase 配置 (本地或 Cloud 实例)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
```

> [!WARNING]
> **安全警示**：请勿将包含真实 `GEMINI_API_KEY` 或 Supabase 密钥的 `.env.local` 文件提交至 GitHub。项目自带的 `.gitignore` 已默认忽略 `.env*` 文件。

### 3. 初始化 Supabase 数据库

如果使用本地 Supabase 开发环境：
```bash
# 启动本地 Supabase 服务
npx supabase start

# 应用数据库迁移脚本 (如有)
npx supabase db reset
```

### 4. 启动开发服务器

在根目录下运行：
```bash
# 安装依赖
npm install

# 运行开发环境
npm run dev
```
打开 [http://localhost:3000](http://localhost:3000) 即可访问应用。

## 许可协议

本项目仅供学习、研究和个人娱乐使用，**严禁用于任何商业目的**。详细内容请参阅项目根目录下的 [LICENSE](LICENSE) 文件。
