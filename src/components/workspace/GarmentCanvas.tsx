'use client'

import { useState, useRef, useEffect } from "react"
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
  Award,
  X,
  ZoomIn,
  ZoomOut,
  GitCompare
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useStudioStore, GarmentCard, ChatMessage, StyleDna, FabricCard } from "@/lib/store"
import { translations } from "@/lib/translations"
import GarmentReview from "./GarmentReview"
import GarmentCompare from "./GarmentCompare"

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
    styleDnas,
    fabricCards,
    setMessages,
    setChatLoading,
    language,
    displayMode,
    imageGenModel
  } = useStudioStore()

  const t = translations[language]

  // Local state
  const [copySuccess, setCopySuccess] = useState(false)
  const [quickPrompt, setQuickPrompt] = useState("")
  const [variantLoading, setVariantLoading] = useState(false)
  const [variantError, setVariantError] = useState<string | null>(null)

  // Associated DNA and Fabric Card modal view states
  const [activeViewDna, setActiveViewDna] = useState<StyleDna | null>(null)
  const [activeViewFabric, setActiveViewFabric] = useState<FabricCard | null>(null)

  // Find associated Style DNA and Fabric Card
  const associatedDna = styleDnas?.find(d => d.id === activeGarment?.style_dna_id)
  const associatedFabric = fabricCards?.find(f => f.id === activeGarment?.fabric_card_id)

  // Image viewer zoom & pan state
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [isCompareOpen, setIsCompareOpen] = useState(false)
  const [zoomScale, setZoomScale] = useState(1)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomScale <= 1) return
    setIsDragging(true)
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    setPanOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  // Zoom & Pan refs to keep wheel event listener synced with latest values
  const zoomScaleRef = useRef(zoomScale)
  const panOffsetRef = useRef(panOffset)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    zoomScaleRef.current = zoomScale
    panOffsetRef.current = panOffset
  }, [zoomScale, panOffset])

  useEffect(() => {
    if (!isPreviewOpen) return

    const container = containerRef.current
    if (!container) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = container.getBoundingClientRect()
      // Mouse coordinates relative to the center of the image container viewport
      const mx = e.clientX - (rect.left + rect.width / 2)
      const my = e.clientY - (rect.top + rect.height / 2)

      const zoomFactor = 1.15
      const s1 = zoomScaleRef.current
      let s2 = s1

      if (e.deltaY < 0) {
        s2 = Math.min(4, s1 * zoomFactor)
      } else {
        s2 = Math.max(0.5, s1 / zoomFactor)
      }

      if (s2 === s1) return

      const ratio = s2 / s1
      const tx = panOffsetRef.current.x * ratio + mx * (1 - ratio)
      const ty = panOffsetRef.current.y * ratio + my * (1 - ratio)

      setPanOffset({ x: tx, y: ty })
      setZoomScale(s2)
    }

    container.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      container.removeEventListener('wheel', onWheel)
    }
  }, [isPreviewOpen])

  const handleZoomButton = (zoomIn: boolean) => {
    const s1 = zoomScale
    let s2 = s1
    const step = 0.25
    if (zoomIn) {
      s2 = Math.min(4, s1 + step)
    } else {
      s2 = Math.max(0.5, s1 - step)
    }
    if (s2 === s1) return
    const ratio = s2 / s1
    setPanOffset(prev => ({
      x: prev.x * ratio,
      y: prev.y * ratio
    }))
    setZoomScale(s2)
  }

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

      const generated = result.data.garmentCard as GarmentCard
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
    <div className="relative w-full max-w-5xl animate-in fade-in-30 duration-300">
      <div className="w-full bg-card border border-border rounded-2xl overflow-hidden shadow-xl flex flex-col lg:flex-row h-auto lg:h-[calc(100vh-8.5rem)]">
        {/* Left Column: Image and Version history */}
        <div className="lg:w-1/2 bg-muted relative flex flex-col min-h-[400px] lg:min-h-0">
          <GarmentReview />
          <div className="flex-1 relative flex items-center justify-center bg-zinc-900/10">
          {activeGarment.images?.[0] ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={activeGarment.images[0]} 
                alt={activeGarment.title} 
                className="object-contain w-full h-full max-h-[50vh] lg:max-h-full p-2 animate-in fade-in duration-300"
              />
              <button 
                onClick={() => setIsPreviewOpen(true)}
                className="absolute bottom-4 right-4 bg-background/80 hover:bg-background text-foreground p-2 rounded-lg border border-border backdrop-blur shadow-md hover:scale-105 transition-all cursor-pointer"
                title={language === 'zh' ? '放大查看' : 'Zoom view'}
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </>
          ) : (
            <div className="text-center text-muted-foreground p-8">
              <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>Image not generated properly</p>
            </div>
          )}
        </div>


        {/* Version History iterations panel */}
        {versions.length > 1 && (
          <div className="bg-card/90 border-t border-border p-3 flex flex-col space-y-1.5 shrink-0">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1 select-none">
                <History className="w-3.5 h-3.5" />
                {t.versions}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsCompareOpen(true)}
                className="text-[10px] h-6 py-0.5 px-2 text-indigo-500 hover:text-indigo-600 hover:bg-indigo-500/5 font-semibold flex items-center gap-1 cursor-pointer"
                title={language === 'zh' ? '开启 A/B 对比视图' : 'Open A/B Comparison'}
              >
                <GitCompare className="w-3.5 h-3.5" />
                {language === 'zh' ? '设计差异对比' : 'Compare Versions'}
              </Button>
            </div>
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

              {/* STYLE DNA REFERENCE */}
              <div className="bg-card border border-border/80 p-2 rounded-lg flex flex-col justify-between">
                <div>
                  <span className="text-[10px] text-muted-foreground block mb-0.5">
                    {language === 'zh' ? '关联风格 DNA' : 'Associated Style DNA'}
                  </span>
                  {associatedDna ? (
                    <span className="font-semibold text-foreground block truncate">
                      {associatedDna.name}
                    </span>
                  ) : (
                    <span className="text-muted-foreground italic block text-[11px]">
                      {language === 'zh' ? '无' : 'None'}
                    </span>
                  )}
                </div>
                {associatedDna && (
                  <button
                    type="button"
                    onClick={() => setActiveViewDna(associatedDna)}
                    className="text-[9px] text-indigo-500 hover:text-indigo-600 font-semibold text-left mt-1.5 self-start cursor-pointer hover:underline"
                  >
                    {language === 'zh' ? '查看风格基因 →' : 'View Style DNA →'}
                  </button>
                )}
              </div>

              {/* FABRIC CARD REFERENCE */}
              <div className="bg-card border border-border/80 p-2 rounded-lg flex flex-col justify-between">
                <div>
                  <span className="text-[10px] text-muted-foreground block mb-0.5">
                    {language === 'zh' ? '关联面料样卡' : 'Associated Fabric'}
                  </span>
                  {associatedFabric ? (
                    <span className="font-semibold text-foreground block truncate">
                      {associatedFabric.name}
                    </span>
                  ) : (
                    <span className="text-muted-foreground italic block text-[11px]">
                      {language === 'zh' ? '无' : 'None'}
                    </span>
                  )}
                </div>
                {associatedFabric && (
                  <button
                    type="button"
                    onClick={() => setActiveViewFabric(associatedFabric)}
                    className="text-[9px] text-indigo-500 hover:text-indigo-600 font-semibold text-left mt-1.5 self-start cursor-pointer hover:underline"
                  >
                    {language === 'zh' ? '查看面料参数 →' : 'View Fabric Specs →'}
                  </button>
                )}
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

    {/* Floating preview zoom & pan modal overlay */}
    {isPreviewOpen && activeGarment.images?.[0] && (
      <div 
        ref={containerRef}
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 backdrop-blur-md animate-in fade-in duration-200"
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Top toolbar */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-50 text-white select-none">
          <span className="text-sm font-semibold tracking-wide truncate pr-4">
            {activeGarment.title}
          </span>
          <div className="flex items-center space-x-3 bg-zinc-950/60 border border-white/10 rounded-full px-4 py-1.5 backdrop-blur-md shadow-lg">
            <button 
              onClick={() => handleZoomButton(false)}
              className="hover:text-indigo-400 transition-colors p-1 cursor-pointer"
              title={language === 'zh' ? '缩小' : 'Zoom Out'}
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono w-12 text-center">
              {Math.round(zoomScale * 100)}%
            </span>
            <button 
              onClick={() => handleZoomButton(true)}
              className="hover:text-indigo-400 transition-colors p-1 cursor-pointer"
              title={language === 'zh' ? '放大' : 'Zoom In'}
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <div className="h-3 w-px bg-white/10" />
            <button 
              onClick={() => {
                setZoomScale(1)
                setPanOffset({ x: 0, y: 0 })
              }}
              className="hover:text-indigo-400 transition-colors text-xs font-medium px-1 cursor-pointer"
            >
              {language === 'zh' ? '重置' : 'Reset'}
            </button>
          </div>
          
          <button 
            onClick={() => {
              setIsPreviewOpen(false)
              setZoomScale(1)
              setPanOffset({ x: 0, y: 0 })
            }}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center transition-all hover:scale-105 shadow-md cursor-pointer"
            title={language === 'zh' ? '关闭' : 'Close'}
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Interactive Image Container */}
        <div 
          className="w-full h-full flex items-center justify-center overflow-hidden relative"
          onMouseMove={handleMouseMove}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img 
            src={activeGarment.images[0]} 
            alt={activeGarment.title} 
            onMouseDown={handleMouseDown}
            style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`,
              transition: isDragging ? 'none' : 'transform 0.15s ease-out',
              cursor: zoomScale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default'
            }}
            className="max-w-[90%] max-h-[85%] object-contain select-none shadow-2xl rounded"
            draggable={false}
          />
        </div>
        
        {/* Help tip at the bottom */}
        <div className="absolute bottom-6 text-white/50 text-[10px] select-none pointer-events-none text-center">
          {language === 'zh' 
            ? '提示：放大后，可在屏幕上按住鼠标左键拖动图片' 
            : 'Tip: Hold left mouse button and drag to pan when zoomed in'}
        </div>
      </div>
    )}

    {/* Standalone A/B comparison view modal */}
    <GarmentCompare isOpen={isCompareOpen} onClose={() => setIsCompareOpen(false)} />

    {/* View Style DNA Detail Modal */}
    {activeViewDna && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div className="bg-card border border-border rounded-xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-5 relative flex flex-col text-left">
          <button
            onClick={() => setActiveViewDna(null)}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground hover:scale-105 transition-all"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center space-x-2.5 mb-4 border-b border-border pb-3">
            <Sparkles className="w-5 h-5 text-primary" />
            <h3 className="text-base font-bold text-foreground">
              {language === 'zh' ? '风格 DNA 详情' : 'Style DNA Details'}
            </h3>
          </div>

          <div className="space-y-4 flex-1">
            <div>
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold block mb-1 text-left">
                {language === 'zh' ? '风格名称' : 'Style Name'}
              </Label>
              <div className="text-sm font-semibold text-foreground bg-muted/30 px-3 py-2 rounded-lg border border-border/30">
                {activeViewDna.name}
              </div>
            </div>

            {activeViewDna.reference_images && activeViewDna.reference_images.length > 0 && (
              <div>
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold block mb-1.5 text-left">
                  {language === 'zh' ? '灵感参考图' : 'Inspiration Images'}
                </Label>
                <div className="grid grid-cols-5 gap-2 max-h-36 overflow-y-auto p-1 border border-border/30 rounded-lg bg-muted/10">
                  {activeViewDna.reference_images.map((img, idx) => (
                    <a 
                      key={idx} 
                      href={img} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="aspect-square rounded border border-border/60 overflow-hidden bg-background hover:opacity-85 transition-opacity"
                    >
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold block mb-1 text-left">
                  {language === 'zh' ? '风格关键词' : 'Keywords'}
                </Label>
                <div className="flex flex-wrap gap-1 bg-muted/20 p-2 rounded-lg border border-border/20 min-h-[50px]">
                  {activeViewDna.keywords?.map((kw, i) => (
                    <span key={i} className="bg-primary/5 text-primary border border-primary/10 rounded px-1.5 py-0.5 text-[10px]">
                      {kw}
                    </span>
                  )) || <span className="text-muted-foreground italic text-[10px]">None</span>}
                </div>
              </div>

              <div>
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold block mb-1 text-left">
                  {language === 'zh' ? '色彩搭配' : 'Colors'}
                </Label>
                <div className="flex flex-wrap gap-1 bg-muted/20 p-2 rounded-lg border border-border/20 min-h-[50px]">
                  {activeViewDna.colors?.map((col, i) => (
                    <span key={i} className="bg-muted text-muted-foreground border border-border/60 rounded px-1.5 py-0.5 text-[10px]">
                      {col}
                    </span>
                  )) || <span className="text-muted-foreground italic text-[10px]">None</span>}
                </div>
              </div>

              <div>
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold block mb-1 text-left">
                  {language === 'zh' ? '版型廓形' : 'Silhouettes'}
                </Label>
                <div className="flex flex-wrap gap-1 bg-muted/20 p-2 rounded-lg border border-border/20 min-h-[50px]">
                  {activeViewDna.silhouettes?.map((sil, i) => (
                    <span key={i} className="bg-muted text-muted-foreground border border-border/60 rounded px-1.5 py-0.5 text-[10px]">
                      {sil}
                    </span>
                  )) || <span className="text-muted-foreground italic text-[10px]">None</span>}
                </div>
              </div>

              <div>
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold block mb-1 text-left">
                  {language === 'zh' ? '面料材质' : 'Materials'}
                </Label>
                <div className="flex flex-wrap gap-1 bg-muted/20 p-2 rounded-lg border border-border/20 min-h-[50px]">
                  {activeViewDna.materials?.map((mat, i) => (
                    <span key={i} className="bg-muted text-muted-foreground border border-border/60 rounded px-1.5 py-0.5 text-[10px]">
                      {mat}
                    </span>
                  )) || <span className="text-muted-foreground italic text-[10px]">None</span>}
                </div>
              </div>
            </div>

            <div>
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold block mb-1 text-left">
                {language === 'zh' ? '结构设计亮点' : 'Design Details'}
              </Label>
              <div className="flex flex-wrap gap-1 bg-muted/20 p-2 rounded-lg border border-border/20 min-h-[40px]">
                {activeViewDna.details?.map((det, i) => (
                  <span key={i} className="bg-muted text-muted-foreground border border-border/60 rounded px-1.5 py-0.5 text-[10px]">
                    {det}
                  </span>
                )) || <span className="text-muted-foreground italic text-[10px]">None</span>}
              </div>
            </div>

            <div>
              <Label className="text-[10px] text-destructive uppercase tracking-wider font-semibold block mb-1 text-left">
                {language === 'zh' ? '避雷元素 (Strictly Avoid)' : 'Avoid elements'}
              </Label>
              <div className="flex flex-wrap gap-1 bg-red-500/5 border border-red-500/20 p-2 rounded-lg min-h-[40px]">
                {activeViewDna.avoid?.map((av, i) => (
                  <span key={i} className="bg-destructive/10 text-destructive border border-destructive/20 rounded px-1.5 py-0.5 text-[10px]">
                    {av}
                  </span>
                )) || <span className="text-muted-foreground italic text-[10px]">None</span>}
              </div>
            </div>
          </div>

          <Button 
            type="button" 
            onClick={() => setActiveViewDna(null)}
            className="mt-6 w-full"
          >
            {language === 'zh' ? '关闭' : 'Close'}
          </Button>
        </div>
      </div>
    )}

    {/* View Fabric Card Detail Modal */}
    {activeViewFabric && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div className="bg-card border border-border rounded-xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-5 relative flex flex-col text-left">
          <button
            onClick={() => setActiveViewFabric(null)}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground hover:scale-105 transition-all"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center space-x-2.5 mb-4 border-b border-border pb-3">
            <FileText className="w-5 h-5 text-primary" />
            <h3 className="text-base font-bold text-foreground">
              {language === 'zh' ? '面料样卡参数' : 'Fabric Card Specifications'}
            </h3>
          </div>

          <div className="space-y-4 flex-1">
            <div className="flex items-start gap-4">
              {activeViewFabric.image && (
                <a 
                  href={activeViewFabric.image} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-24 h-24 rounded-lg border border-border overflow-hidden bg-muted hover:opacity-85 transition-opacity shrink-0"
                >
                  <img src={activeViewFabric.image} alt="" className="w-full h-full object-cover" />
                </a>
              )}
              <div className="flex-1 space-y-3">
                <div>
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold block mb-0.5 text-left">
                    {language === 'zh' ? '面料名称' : 'Fabric Name'}
                  </Label>
                  <div className="text-sm font-semibold text-foreground bg-muted/30 px-2.5 py-1.5 rounded-lg border border-border/30">
                    {activeViewFabric.name}
                  </div>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold block mb-0.5 text-left">
                    {language === 'zh' ? '成分占比' : 'Composition'}
                  </Label>
                  <div className="text-xs text-foreground bg-muted/30 px-2.5 py-1.5 rounded-lg border border-border/30">
                    {activeViewFabric.composition || (language === 'zh' ? '未指定' : 'Not specified')}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold block mb-1 text-left">
                  {language === 'zh' ? '面料克重 (GSM)' : 'Weight (GSM)'}
                </Label>
                <div className="bg-muted/20 p-2.5 rounded-lg border border-border/20 font-semibold text-foreground">
                  {activeViewFabric.weight_gsm ? `${activeViewFabric.weight_gsm} GSM` : (language === 'zh' ? '未指定' : 'Not specified')}
                </div>
              </div>

              <div>
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold block mb-1 text-left">
                  {language === 'zh' ? '外观表面纹理' : 'Texture'}
                </Label>
                <div className="bg-muted/20 p-2.5 rounded-lg border border-border/20 font-semibold text-foreground">
                  {activeViewFabric.texture || (language === 'zh' ? '未指定' : 'Not specified')}
                </div>
              </div>

              <div>
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold block mb-1 text-left">
                  {language === 'zh' ? '垂坠物理特性' : 'Drape'}
                </Label>
                <div className="bg-muted/20 p-2.5 rounded-lg border border-border/20 font-semibold text-foreground">
                  {activeViewFabric.drape || (language === 'zh' ? '未指定' : 'Not specified')}
                </div>
              </div>

              <div>
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold block mb-1 text-left">
                  {language === 'zh' ? '拉伸弹性' : 'Stretch'}
                </Label>
                <div className="bg-muted/20 p-2.5 rounded-lg border border-border/20 font-semibold text-foreground">
                  {activeViewFabric.stretch || (language === 'zh' ? '未指定' : 'Not specified')}
                </div>
              </div>

              <div>
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold block mb-1 text-left">
                  {language === 'zh' ? '光泽表现' : 'Sheen'}
                </Label>
                <div className="bg-muted/20 p-2.5 rounded-lg border border-border/20 font-semibold text-foreground">
                  {activeViewFabric.sheen || (language === 'zh' ? '未指定' : 'Not specified')}
                </div>
              </div>

              <div>
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold block mb-1 text-left">
                  {language === 'zh' ? '透明度' : 'Transparency'}
                </Label>
                <div className="bg-muted/20 p-2.5 rounded-lg border border-border/20 font-semibold text-foreground">
                  {activeViewFabric.transparency || (language === 'zh' ? '未指定' : 'Not specified')}
                </div>
              </div>
            </div>

            <div>
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold block mb-1 text-left">
                {language === 'zh' ? '优化生成式纹理描述' : 'Texture Prompt Description'}
              </Label>
              <div className="text-xs text-foreground bg-muted/30 p-2.5 rounded-lg border border-border/30 font-mono leading-relaxed whitespace-pre-wrap">
                {activeViewFabric.prompt_description || (language === 'zh' ? '未指定' : 'Not specified')}
              </div>
            </div>
          </div>

          <Button 
            type="button" 
            onClick={() => setActiveViewFabric(null)}
            className="mt-6 w-full"
          >
            {language === 'zh' ? '关闭' : 'Close'}
          </Button>
        </div>
      </div>
    )}

    {/* Standalone A/B comparison view modal */}
    <GarmentCompare isOpen={isCompareOpen} onClose={() => setIsCompareOpen(false)} />
  </div>
)
}


