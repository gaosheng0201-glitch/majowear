'use client'

import { useState } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { 
  Sparkles, 
  FileText, 
  Maximize2, 
  Image as ImageIcon,
  Loader2, 
  Send,
  Check,
  Clipboard,
  History,
  FolderPlus,
  AlertTriangle,
  Award
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useStudioStore, GarmentCard, ChatMessage } from "@/lib/store"
import { translations } from "@/lib/translations"

export default function GarmentCanvas() {
  const { id: projectId } = useParams() as { id: string }
  const supabase = createClient()

  // Store state
  const {
    activeGarment,
    setActiveGarment,
    garmentCards,
    addGarmentCard,
    collections,
    updateCollection,
    activeStyleDnaId,
    activeFabricCardId,
    setMessages,
    setChatLoading,
    language
  } = useStudioStore()

  const t = translations[language]

  // Local state
  const [copySuccess, setCopySuccess] = useState(false)
  const [quickPrompt, setQuickPrompt] = useState("")
  const [variantLoading, setVariantLoading] = useState(false)
  const [variantError, setVariantError] = useState<string | null>(null)
  
  // Model & Mode selections (will bind to dashboard defaults if we want, or local states)
  const [displayMode] = useState<'white_background' | 'on_body'>('white_background')
  const [imageGenModel] = useState<string>('gemini-3.1-flash-image')

  if (!activeGarment) {
    // Return empty ready state
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-muted/10">
        <div className="text-center max-w-sm animate-in fade-in-50">
          <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-8 h-8 animate-pulse" />
          </div>
          <h2 className="text-xl font-semibold mb-2">{t.readyToDesign}</h2>
          <p className="text-muted-foreground text-sm mb-6">
            {t.readyToDesignSub}
          </p>
          <div className="space-y-2 text-xs text-left bg-muted/40 border border-border p-4 rounded-xl">
            <div className="font-medium text-foreground mb-1">{t.checklist}</div>
            <div className="flex items-center space-x-2">
              <span className={`w-2 h-2 rounded-full ${activeStyleDnaId ? 'bg-green-500' : 'bg-amber-500'}`} />
              <span>{t.styleDnaSelected} <strong>{activeStyleDnaId ? (language === 'zh' ? '已激活' : 'Active') : t.none}</strong></span>
            </div>
            <div className="flex items-center space-x-2">
              <span className={`w-2 h-2 rounded-full ${activeFabricCardId ? 'bg-green-500' : 'bg-amber-500'}`} />
              <span>{t.fabricSelected} <strong>{activeFabricCardId ? (language === 'zh' ? '已激活' : 'Active') : t.none}</strong></span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Calculate version history (lineage tree)
  const getVersionHistory = (current: GarmentCard): GarmentCard[] => {
    // Helper to find root ID for any garment node
    const getRootId = (garment: GarmentCard): string => {
      let node = garment
      let parentId = garment.parent_version_id
      let safety = 0
      while (parentId && safety < 10) {
        const parent = garmentCards.find(g => g.id === parentId)
        if (parent) {
          node = parent
          parentId = parent.parent_version_id
        } else {
          break
        }
        safety++
      }
      return node.id
    }

    const currentRootId = getRootId(current)
    
    // Find all garments in the project sharing the same root ID
    const family = garmentCards.filter(g => getRootId(g) === currentRootId)
    
    // Sort chronologically ascending
    return family.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }

  const versions = getVersionHistory(activeGarment)

  // Export Tech Sheet as Markdown
  const handleExportMarkdown = () => {
    const spec = activeGarment.schema
    const review = spec.review

    const markdownText = `# 服装设计技术规格单 (Tech Sheet) - ${activeGarment.title}
品类 (Category): ${activeGarment.category}
创建日期 (Created): ${new Date(activeGarment.created_at).toLocaleDateString()}

## 1. 设计概述 (Design Rationale)
${activeGarment.design_rationale}

## 2. 结构规格参数 (Structural Specifications)
* **版型 (Fit):** ${spec.fit || 'Regular'}
* **领型 (Collar):** ${spec.collar || 'Classic'}
* **袖型 (Sleeves):** ${spec.sleeves || 'Standard'}
* **口袋 (Pockets):** ${spec.pockets || 'None'}
* **门襟 (Closures):** ${spec.closures || 'None'}

## 3. 设计亮点 (Details & Highlights)
${spec.details && spec.details.length > 0 
  ? spec.details.map(d => `- ${d}`).join('\n') 
  : '无 (None)'}

## 4. AI 智能评审建议 (AI Review & Score)
${review ? `
* 风格匹配度 (Style Match): ${review.style_match_score}/100
* 面料吻合度 (Fabric Match): ${review.fabric_match_score}/100
* 结构清晰度 (Structure Clarity): ${review.structure_clarity_score}/100
* 指令合规度 (Prompt Compliance): ${review.prompt_compliance_score}/100

### 发现的问题 (Issues):
${review.issues && review.issues.length > 0 ? review.issues.map(i => `- ${i}`).join('\n') : '无发现明显问题。'}

### 优化建议 (Suggested Revision):
> ${review.suggested_revision}
` : '暂无 AI 评审数据。'}

## 5. 生图指令 (Image Generation Prompt)
\`\`\`text
${activeGarment.prompt}
\`\`\`
`

    navigator.clipboard.writeText(markdownText)
    setCopySuccess(true)
    setTimeout(() => setCopySuccess(false), 3000)
  }

  // Handle Quick Edit Local Adjustment
  const handleQuickEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!quickPrompt.trim() || variantLoading) return

    const promptText = quickPrompt
    setQuickPrompt("")
    setVariantLoading(true)
    setVariantError(null)

    // Add user and agent messages to chat store to reflect progress
    const userMsgId = Date.now().toString()
    const agentMsgId = (Date.now() + 1).toString()

    setMessages([
      { id: 'welcome', role: 'agent', text: t.agentIntro },
      { id: userMsgId, role: 'user', text: `${t.createVariant} (${activeGarment.title}): ${promptText}` },
      { 
        id: agentMsgId, 
        role: 'agent', 
        text: language === 'zh'
          ? '正在基于当前款式迭代变体，请稍候...'
          : 'Generating variant based on active garment, please wait...',
        loading: true
      }
    ])
    setChatLoading(true)

    try {
      const response = await fetch('/api/agent/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `基于已有款式做修改: ${promptText}`,
          styleDnaId: activeGarment.style_dna_id || activeStyleDnaId || undefined,
          fabricCardId: activeGarment.fabric_card_id || activeFabricCardId || undefined,
          parentVersionId: activeGarment.id,
          projectId,
          displayMode,
          imageGenModel
        })
      })

      const result = await response.json()
      if (!response.ok || result.error) {
        throw new Error(result.error || "Failed to generate variant.")
      }

      const generated = result.data as GarmentCard
      addGarmentCard(generated)
      setActiveGarment(generated)

      // Update chat messages
      setMessages([
        { id: 'welcome', role: 'agent', text: t.agentIntro },
        { id: userMsgId, role: 'user', text: `${t.createVariant} (${activeGarment.title}): ${promptText}` },
        {
          id: agentMsgId,
          role: 'agent',
          text: language === 'zh'
            ? `已生成变体款式 "${generated.title}"。以下为迭代设计：\n\n${generated.design_rationale}`
            : `Variant generated: "${generated.title}". Rationale:\n\n${generated.design_rationale}`,
          garmentCard: generated
        }
      ])
    } catch (err: any) {
      console.error(err)
      setVariantError(err.message || "Failed to generate variant.")
      
      setMessages([
        { id: 'welcome', role: 'agent', text: t.agentIntro },
        { id: userMsgId, role: 'user', text: `${t.createVariant} (${activeGarment.title}): ${promptText}` },
        {
          id: agentMsgId,
          role: 'agent',
          error: true,
          text: `Error generating variant: ${err.message}`
        }
      ])
    } finally {
      setVariantLoading(false)
      setChatLoading(false)
    }
  }

  // Handle adding active garment to a collection
  const handleToggleCollection = async (collectionId: string) => {
    try {
      const col = collections.find(c => c.id === collectionId)
      if (!col) return

      const isIncluded = col.garment_ids?.includes(activeGarment.id)
      const newGarmentIds = isIncluded
        ? col.garment_ids.filter(id => id !== activeGarment.id)
        : [...(col.garment_ids || []), activeGarment.id]

      const { error } = await supabase
        .from('collections')
        .update({ garment_ids: newGarmentIds })
        .eq('id', collectionId)

      if (error) throw error

      updateCollection({
        ...col,
        garment_ids: newGarmentIds
      })
    } catch (err) {
      console.error("Failed to update collection association:", err)
    }
  }

  const review = activeGarment.schema?.review

  return (
    <div className="w-full max-w-5xl bg-card border border-border rounded-2xl overflow-hidden shadow-xl flex flex-col lg:flex-row h-auto lg:h-[calc(100vh-8.5rem)] animate-in fade-in-30 duration-300">
      {/* Left Column: Image and Version history */}
      <div className="lg:w-1/2 bg-muted relative flex flex-col min-h-[400px] lg:min-h-0">
        <div className="flex-1 relative flex items-center justify-center bg-zinc-900/10">
          {activeGarment.images?.[0] ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={activeGarment.images[0]} 
                alt={activeGarment.title} 
                className="object-contain w-full h-full max-h-[50vh] lg:max-h-full p-2 animate-in fade-in duration-300"
              />
              <a 
                href={activeGarment.images[0]} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="absolute bottom-4 right-4 bg-background/80 hover:bg-background text-foreground p-2 rounded-lg border border-border backdrop-blur shadow-md hover:scale-105 transition-all"
              >
                <Maximize2 className="w-4 h-4" />
              </a>
            </>
          ) : (
            <div className="text-center text-muted-foreground p-8">
              <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>Image not generated properly</p>
            </div>
          )}
        </div>

        {/* Compact AI Review TIP Panel */}
        {review && (
          <div className="bg-indigo-500/5 border-t border-indigo-500/10 p-4 shrink-0 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-500 flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-indigo-500" />
                {t.aiReview}
              </span>
              <span className="text-[10px] font-mono bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full font-bold">
                {language === 'zh' ? '综合匹配度' : 'Overall Match'}: {Math.round((review.style_match_score + review.fabric_match_score + review.structure_clarity_score + review.prompt_compliance_score) / 4)}%
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2 text-[10px] text-muted-foreground text-center">
              <div className="bg-card/40 border border-border/40 p-1.5 rounded">
                <span className="block text-[8px] uppercase tracking-tight">{language === 'zh' ? '风格' : 'Style'}</span>
                <span className="font-semibold text-foreground">{review.style_match_score}%</span>
              </div>
              <div className="bg-card/40 border border-border/40 p-1.5 rounded">
                <span className="block text-[8px] uppercase tracking-tight">{language === 'zh' ? '面料' : 'Fabric'}</span>
                <span className="font-semibold text-foreground">{review.fabric_match_score}%</span>
              </div>
              <div className="bg-card/40 border border-border/40 p-1.5 rounded">
                <span className="block text-[8px] uppercase tracking-tight">{language === 'zh' ? '结构' : 'Struct'}</span>
                <span className="font-semibold text-foreground">{review.structure_clarity_score}%</span>
              </div>
              <div className="bg-card/40 border border-border/40 p-1.5 rounded">
                <span className="block text-[8px] uppercase tracking-tight">{language === 'zh' ? '合规' : 'Comply'}</span>
                <span className="font-semibold text-foreground">{review.prompt_compliance_score}%</span>
              </div>
            </div>
            
            {review.issues && review.issues.length > 0 && (
              <div className="text-[11px] bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 p-2.5 rounded-lg flex gap-1.5 items-start">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block mb-0.5 text-[10px]">{t.issuesDetected}:</span>
                  <ul className="list-disc pl-3.5 space-y-0.5">
                    {review.issues.map((issue, idx) => <li key={idx}>{issue}</li>)}
                  </ul>
                </div>
              </div>
            )}

            {review.suggested_revision && (
              <div className="text-[11px] border border-indigo-500/20 bg-indigo-500/5 p-2.5 rounded-lg flex flex-col space-y-1">
                <span className="font-semibold text-indigo-500 text-[10px]">{t.aiSuggestedRevision}:</span>
                <p className="italic text-muted-foreground text-[10px]">"{review.suggested_revision}"</p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setQuickPrompt(review.suggested_revision)}
                  className="h-6 text-[10px] hover:bg-indigo-500/10 text-indigo-500 py-0.5 px-2 self-start border border-indigo-500/20"
                >
                  {language === 'zh' ? '套用修改参数' : 'Apply changes'}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Version History iterations panel */}
        {versions.length > 1 && (
          <div className="bg-card/90 border-t border-border p-3 flex flex-col space-y-1.5 shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <History className="w-3.5 h-3.5" />
              {t.versions}
            </span>
            <div className="flex items-center gap-1 overflow-x-auto py-1">
              {versions.map((ver, idx) => (
                <Button
                  key={ver.id}
                  variant={activeGarment.id === ver.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveGarment(ver)}
                  className="text-xs h-7 py-1 px-2.5 rounded-full shrink-0 font-mono"
                >
                  v{idx + 1} {activeGarment.id === ver.id ? `(${t.versionCurrent.split(' ')[0]})` : ''}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right Column: Spec Specifications, Review scores, Export/Edit options */}
      <div className="lg:w-1/2 p-5 overflow-y-auto border-t lg:border-t-0 lg:border-l border-border flex flex-col justify-between space-y-6">
        <div>
          {/* Header metadata */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-outfit font-bold tracking-tight text-foreground">{activeGarment.title}</h2>
              <span className="text-[10px] text-muted-foreground block mt-0.5">
                {t.created} {new Date(activeGarment.created_at).toLocaleDateString()}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-md font-mono font-medium capitalize">
                {activeGarment.category}
              </span>
            </div>
          </div>

          {/* Rationale */}
          <div className="mb-5 bg-muted/20 p-3.5 rounded-xl border border-border/40">
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" /> {t.designRationale}
            </h4>
            <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-line">
              {activeGarment.design_rationale}
            </p>
          </div>

          {/* Technical Specs Grid */}
          <div className="space-y-3 mb-5">
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-primary" /> {language === 'zh' ? '设计参数表 (Tech Spec)' : 'Technical Specifications'}
            </h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-card border border-border/80 p-2 rounded-lg">
                <span className="text-[10px] text-muted-foreground block mb-0.5">{t.fit}</span>
                <span className="font-semibold text-foreground">{activeGarment.schema?.fit || 'Regular'}</span>
              </div>
              <div className="bg-card border border-border/80 p-2 rounded-lg">
                <span className="text-[10px] text-muted-foreground block mb-0.5">{t.collar}</span>
                <span className="font-semibold text-foreground">{activeGarment.schema?.collar || 'Classic'}</span>
              </div>
              <div className="bg-card border border-border/80 p-2 rounded-lg">
                <span className="text-[10px] text-muted-foreground block mb-0.5">{t.sleeves}</span>
                <span className="font-semibold text-foreground">{activeGarment.schema?.sleeves || 'Standard'}</span>
              </div>
              <div className="bg-card border border-border/80 p-2 rounded-lg">
                <span className="text-[10px] text-muted-foreground block mb-0.5">{t.pockets}</span>
                <span className="font-semibold text-foreground">{activeGarment.schema?.pockets || 'None'}</span>
              </div>
              <div className="col-span-2 bg-card border border-border/80 p-2 rounded-lg">
                <span className="text-[10px] text-muted-foreground block mb-0.5">{t.closures}</span>
                <span className="font-semibold text-foreground">{activeGarment.schema?.closures || 'None'}</span>
              </div>
            </div>

            {/* Design Highlights */}
            {activeGarment.schema?.details && activeGarment.schema.details.length > 0 && (
              <div className="mt-2.5">
                <span className="text-[10px] text-muted-foreground block mb-1.5 font-medium">{t.details}</span>
                <div className="flex flex-wrap gap-1">
                  {activeGarment.schema.details.map((detail, index) => (
                    <span 
                      key={index} 
                      className="text-[10px] bg-secondary/80 text-secondary-foreground border border-border/60 px-2 py-0.5 rounded-md"
                    >
                      {detail}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Collection Management Association */}
          <div className="mb-5 border border-border p-3.5 rounded-xl space-y-2.5">
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <FolderPlus className="w-3.5 h-3.5 text-primary" /> {t.addToCollection}
            </h4>
            {collections.length === 0 ? (
              <p className="text-[10px] text-muted-foreground italic">{t.noCollectionHelp}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {collections.map((col) => {
                  const isAssociated = col.garment_ids?.includes(activeGarment.id)
                  return (
                    <Button
                      key={col.id}
                      size="sm"
                      variant={isAssociated ? "default" : "outline"}
                      onClick={() => handleToggleCollection(col.id)}
                      className="text-[10px] h-6 py-0.5 px-2 rounded-md shrink-0 flex items-center gap-1"
                    >
                      {isAssociated && <Check className="w-3 h-3" />}
                      {col.name}
                    </Button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Quick Local Adjustments Input Form & Copy spec */}
        <div className="space-y-4 pt-4 border-t border-border/60">
          <form onSubmit={handleQuickEdit} className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              {t.quickEdit}
            </Label>
            {variantError && (
              <p className="text-[10px] text-destructive flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {variantError}
              </p>
            )}
            <div className="flex gap-2">
              <Input
                value={quickPrompt}
                onChange={(e) => setQuickPrompt(e.target.value)}
                placeholder={t.quickEditPlaceholder}
                disabled={variantLoading}
                className="text-xs bg-muted/30 focus-visible:ring-primary/40 h-8"
              />
              <Button
                type="submit"
                size="sm"
                disabled={variantLoading || !quickPrompt.trim()}
                className="h-8 shrink-0 flex items-center gap-1"
              >
                {variantLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Send className="w-3 h-3" />
                )}
                {t.createVariant}
              </Button>
            </div>
          </form>

          <div className="flex justify-between items-center pt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportMarkdown}
              className="text-xs font-semibold border-primary/20 hover:bg-primary/5 flex items-center gap-1.5"
            >
              <Clipboard className="w-3.5 h-3.5" />
              {copySuccess ? (language === 'zh' ? '已复制！' : 'Copied!') : t.exportMarkdown}
            </Button>
            <span className="text-[9px] text-muted-foreground font-mono truncate max-w-[220px]">
              Prompt: {activeGarment.prompt}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
