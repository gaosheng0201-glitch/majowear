'use client'

import { useEffect, useState, useRef } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { 
  Sparkles, 
  Loader2, 
  Send,
  Shirt
} from "lucide-react"
import { useStudioStore, ChatMessage, GarmentCard } from "@/lib/store"
import { translations } from "@/lib/translations"

export default function AgentChat() {
  const { id: projectId } = useParams() as { id: string }

  // Store state
  const {
    activeStyleDnaId,
    activeFabricCardId,
    setActiveGarment,
    addGarmentCard,
    messages,
    setMessages,
    addMessage,
    chatLoading,
    setChatLoading,
    language
  } = useStudioStore()

  const t = translations[language]

  // Local UI state
  const [chatInput, setChatInput] = useState("")
  const [displayMode] = useState<'white_background' | 'on_body'>('white_background')
  const [imageGenModel] = useState<string>('gemini-3.1-flash-image')
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Sync initial welcome message if empty
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: 'welcome',
          role: 'agent',
          text: translations[language].agentIntro
        }
      ])
    }
  }, [language, messages.length, setMessages])

  // Handle Design Agent Request
  const handleSendPrompt = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim() || chatLoading) return

    const promptText = chatInput
    setChatInput("")
    setChatLoading(true)

    // Add user message
    const userMsgId = Date.now().toString()
    addMessage({ id: userMsgId, role: 'user', text: promptText })

    // Add agent thinking placeholder
    const agentMsgId = (Date.now() + 1).toString()
    addMessage({ 
      id: agentMsgId, 
      role: 'agent', 
      text: language === 'zh' 
        ? '正在处理您的指令，提取风格与面料特征并调用画质渲染模型。请稍候，这大约需要 10-15 秒...' 
        : 'Processing your prompt, synthesizing styles, and calling image rendering models. Please wait, this may take 10-15 seconds...',
      loading: true
    })

    try {
      const response = await fetch('/api/agent/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptText,
          styleDnaId: activeStyleDnaId || undefined,
          fabricCardId: activeFabricCardId || undefined,
          projectId,
          displayMode,
          imageGenModel
        })
      })

      const result = await response.json()
      if (!response.ok || result.error) {
        throw new Error(result.error || "Generation request failed.")
      }

      const generatedGarment = result.data as GarmentCard
      
      // Update state and active view
      addGarmentCard(generatedGarment)
      setActiveGarment(generatedGarment)

      // Update agent message
      const updated = [...messages]
      const index = updated.findIndex(m => m.id === agentMsgId)
      if (index !== -1) {
        const introText = language === 'zh' 
          ? `我已为您生成了 "${generatedGarment.title}" 的设计款式卡。以下是设计原理：`
          : `I have generated the design card for "${generatedGarment.title}". Here is the design rationale:`;
        updated[index] = {
          id: agentMsgId,
          role: 'agent',
          text: `${introText}\n\n${generatedGarment.design_rationale}`,
          garmentCard: generatedGarment,
          loading: false
        }
      }
      setMessages(updated)

    } catch (err: any) {
      console.error(err)
      const updated = [...messages]
      const index = updated.findIndex(m => m.id === agentMsgId)
      if (index !== -1) {
        updated[index] = {
          id: agentMsgId,
          role: 'agent',
          error: true,
          text: `${language === 'zh' ? '设计生成失败：' : 'Failed to generate design: '}${err.message || "An unexpected error occurred."}`,
          loading: false
        }
      }
      setMessages(updated)
    } finally {
      setChatLoading(false)
    }
  }

  return (
    <aside className="w-80 lg:w-96 border-l border-border bg-card flex flex-col shrink-0">
      <div className="h-14 border-b border-border flex items-center justify-between px-4 bg-background/50">
        <div className="flex items-center">
          <Sparkles className="w-4 h-4 text-primary mr-2" />
          <h2 className="font-outfit font-medium">{t.agent}</h2>
        </div>
        {chatLoading && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`rounded-lg p-3 text-sm ${
              msg.role === 'user' 
                ? 'bg-primary/10 border border-primary/20 ml-8 text-foreground' 
                : msg.error 
                  ? 'bg-destructive/15 border border-destructive/20 mr-8 text-destructive'
                  : 'bg-muted/50 border border-border mr-8 text-foreground'
            }`}
          >
            <p className="font-semibold text-xs mb-1 uppercase tracking-wide opacity-80">
              {msg.role === 'user' ? (language === 'zh' ? '设计师' : 'Designer') : (language === 'zh' ? '设计 Agent' : 'Agent')}
            </p>
            <p className="leading-relaxed whitespace-pre-line text-xs">{msg.text}</p>
            
            {msg.loading && (
              <div className="flex items-center space-x-2 mt-3 text-xs text-muted-foreground animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{t.aiGeneratingHelp}</span>
              </div>
            )}

            {msg.garmentCard && (
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => setActiveGarment(msg.garmentCard!)}
                className="mt-3 w-full justify-start text-xs border-primary/20 hover:bg-primary/5"
              >
                <Shirt className="w-3.5 h-3.5 mr-2 text-primary" />
                {t.viewSpecBtn}
              </Button>
            )}
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      <div className="p-4 border-t border-border bg-background">
        <form onSubmit={handleSendPrompt} className="flex space-x-2">
          <Input 
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder={
              !activeStyleDnaId 
                ? (language === 'zh' ? "请先在左侧选择风格 DNA..." : "Select a Style DNA first...") 
                : !activeFabricCardId 
                  ? (language === 'zh' ? "请先在左侧选择面料样卡..." : "Select a Fabric Card first...") 
                  : t.agentInputPlaceholder
            }
            disabled={chatLoading || !activeStyleDnaId || !activeFabricCardId}
            className="flex-1 bg-muted/50 focus-visible:ring-primary/50 text-xs"
          />
          <Button 
            type="submit" 
            size="icon" 
            disabled={chatLoading || !chatInput.trim() || !activeStyleDnaId || !activeFabricCardId} 
            className="shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
        <div className="mt-2 text-[10px] text-muted-foreground text-center">
          {t.generationModelHelp}
        </div>
      </div>
    </aside>
  )
}
