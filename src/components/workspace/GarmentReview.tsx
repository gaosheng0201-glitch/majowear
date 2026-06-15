'use client'

import { useState } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { 
  Lightbulb, 
  Award, 
  AlertTriangle, 
  Loader2,
  X
} from "lucide-react"
import { useStudioStore, GarmentCard } from "@/lib/store"
import { translations } from "@/lib/translations"

export default function GarmentReview() {
  const { id: projectId } = useParams() as { id: string }

  // Store state
  const {
    activeGarment,
    setActiveGarment,
    addGarmentCard,
    activeStyleDnaId,
    activeFabricCardId,
    setMessages,
    setChatLoading,
    language,
    displayMode,
    imageGenModel
  } = useStudioStore()

  const t = translations[language]

  // Local state
  const [isOpen, setIsOpen] = useState(false)
  const [variantLoading, setVariantLoading] = useState(false)
  const [variantError, setVariantError] = useState<string | null>(null)

  if (!activeGarment || !activeGarment.schema?.review) {
    return null
  }

  const review = activeGarment.schema.review

  const handleApplySuggestedRevision = async (suggestedPrompt: string) => {
    if (variantLoading || !activeGarment) return
    setVariantLoading(true)
    setVariantError(null)

    const userMsgId = Date.now().toString()
    const agentMsgId = (Date.now() + 1).toString()

    setMessages([
      { id: 'welcome', role: 'agent', text: t.agentIntro },
      { id: userMsgId, role: 'user', text: `${t.createVariant} (${activeGarment.title}): ${suggestedPrompt}` },
      { 
        id: agentMsgId, 
        role: 'agent', 
        text: language === 'zh'
          ? '正在基于建议迭代变体，请稍候...'
          : 'Generating variant based on suggestion, please wait...',
        loading: true
      }
    ])
    setChatLoading(true)

    try {
      const response = await fetch('/api/agent/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `基于建议修改: ${suggestedPrompt}`,
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

      setMessages([
        { id: 'welcome', role: 'agent', text: t.agentIntro },
        { id: userMsgId, role: 'user', text: `${t.createVariant} (${activeGarment.title}): ${suggestedPrompt}` },
        {
          id: agentMsgId,
          role: 'agent',
          text: language === 'zh'
            ? `已根据AI评审建议生成变体款式 "${generated.title}"。\n\n${generated.design_rationale}`
            : `Variant generated based on AI review: "${generated.title}". Rationale:\n\n${generated.design_rationale}`,
          garmentCard: generated
        }
      ])
    } catch (err: any) {
      console.error(err)
      setVariantError(err.message || "Failed to generate variant.")
      setMessages([
        { id: 'welcome', role: 'agent', text: t.agentIntro },
        { id: userMsgId, role: 'user', text: `${t.createVariant} (${activeGarment.title}): ${suggestedPrompt}` },
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

  const averageScore = Math.round(
    (review.style_match_score + 
     review.fabric_match_score + 
     review.structure_clarity_score + 
     review.prompt_compliance_score) / 4
  )

  return (
    <div className="absolute top-4 right-4 z-30 flex flex-col items-end">
      {/* Glow bulb button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-10 h-10 rounded-full bg-background border border-border shadow-md flex items-center justify-center hover:scale-105 transition-all focus:outline-none focus:ring-2 focus:ring-primary/40"
        title={language === 'zh' ? 'AI 设计评审贴士' : 'AI Review Insights'}
      >
        <Lightbulb className={`w-5 h-5 ${isOpen ? 'text-indigo-500 fill-indigo-500/25 animate-pulse' : 'text-indigo-400'}`} />
      </button>

      {/* Collapsible Panel */}
      {isOpen && (
        <div className="w-80 mt-2 bg-card border border-border rounded-xl p-4 shadow-2xl space-y-3 animate-in fade-in slide-in-from-top-3 duration-200">
          <div className="flex justify-between items-center pb-2 border-b border-border">
            <h4 className="text-xs font-bold text-indigo-500 flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5" />
              {t.aiReview}
            </h4>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full font-bold">
                {language === 'zh' ? '得分' : 'Score'}: {averageScore}
              </span>
              <button 
                onClick={() => setIsOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[10px] text-center">
            <div className="bg-muted/40 p-1.5 rounded">
              <span className="block text-muted-foreground text-[8px] uppercase">{language === 'zh' ? '风格匹配' : 'Style DNA'}</span>
              <span className="font-semibold">{review.style_match_score}%</span>
            </div>
            <div className="bg-muted/40 p-1.5 rounded">
              <span className="block text-muted-foreground text-[8px] uppercase">{language === 'zh' ? '面料吻合' : 'Fabric'}</span>
              <span className="font-semibold">{review.fabric_match_score}%</span>
            </div>
            <div className="bg-muted/40 p-1.5 rounded">
              <span className="block text-muted-foreground text-[8px] uppercase">{language === 'zh' ? '结构清晰' : 'Structure'}</span>
              <span className="font-semibold">{review.structure_clarity_score}%</span>
            </div>
            <div className="bg-muted/40 p-1.5 rounded">
              <span className="block text-muted-foreground text-[8px] uppercase">{language === 'zh' ? '指令合规' : 'Compliance'}</span>
              <span className="font-semibold">{review.prompt_compliance_score}%</span>
            </div>
          </div>

          {review.issues && review.issues.length > 0 && (
            <div className="text-[10px] bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 p-2 rounded flex gap-1.5 items-start">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block mb-0.5">{t.issuesDetected}:</span>
                <ul className="list-disc pl-3.5 space-y-0.5">
                  {review.issues.map((issue, idx) => <li key={idx}>{issue}</li>)}
                </ul>
              </div>
            </div>
          )}

          {review.suggested_revision && (
            <div className="text-[10px] border border-indigo-500/20 bg-indigo-500/5 p-2.5 rounded flex flex-col space-y-1">
              <span className="font-semibold text-indigo-500">{t.aiSuggestedRevision}:</span>
              <p className="italic text-muted-foreground text-[10px]">"{review.suggested_revision}"</p>
              {variantError && <p className="text-[9px] text-destructive">{variantError}</p>}
              <Button
                size="sm"
                onClick={() => handleApplySuggestedRevision(review.suggested_revision)}
                disabled={variantLoading}
                className="h-6 text-[9px] bg-indigo-600 hover:bg-indigo-700 text-white py-0.5 px-2 self-start flex items-center gap-1 mt-1"
              >
                {variantLoading ? (
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                ) : (
                  <Award className="w-2.5 h-2.5" />
                )}
                {language === 'zh' ? '套用修改参数' : 'Apply changes'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
