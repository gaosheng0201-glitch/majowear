'use client'

import { useEffect, useState, useRef } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { 
  Sparkles, 
  Loader2, 
  Send,
  Shirt,
  Paperclip,
  X
} from "lucide-react"
import { useStudioStore, ChatMessage, GarmentCard } from "@/lib/store"
import { translations } from "@/lib/translations"
import { createClient } from "@/lib/supabase/client"

const getRightmostTextNode = (node: Node): Node => {
  if (node.nodeType === Node.TEXT_NODE) return node
  const children = node.childNodes
  if (children.length === 0) return node
  return getRightmostTextNode(children[children.length - 1])
}

const deleteTriggerAndQuery = (range: Range, editor: HTMLDivElement): boolean => {
  let node = range.startContainer
  let offset = range.startOffset

  if (node.nodeType === Node.ELEMENT_NODE) {
    const children = node.childNodes
    if (offset > 0) {
      node = children[offset - 1]
      if (node.nodeType === Node.TEXT_NODE) {
        offset = node.nodeValue?.length || 0
      }
    }
  }

  let found = false
  let currentNode: Node | null = node
  let currentOffset = offset

  while (currentNode && !found) {
    if (currentNode.nodeType === Node.TEXT_NODE) {
      const val = currentNode.nodeValue || ""
      const atIndex = val.lastIndexOf('@', currentOffset - 1)
      if (atIndex !== -1) {
        range.setStart(currentNode, atIndex)
        found = true
        break
      }
      
      const lastSpace = val.lastIndexOf(' ', currentOffset - 1)
      const lastNbs = val.lastIndexOf('\u00A0', currentOffset - 1)
      const lastSpaceIndex = Math.max(lastSpace, lastNbs)
      if (lastSpaceIndex !== -1) {
        break
      }
    }

    let prev: Node | null = currentNode.previousSibling
    if (!prev) {
      let parent = currentNode.parentNode
      while (parent && parent !== editor && !prev) {
        prev = parent.previousSibling
        parent = parent.parentNode
      }
    }
    
    if (prev) {
      currentNode = getRightmostTextNode(prev)
      if (currentNode) {
        currentOffset = currentNode.nodeValue?.length || 0
      }
    } else {
      currentNode = null
    }
  }

  if (found) {
    range.deleteContents()
    return true
  }
  return false
}

export default function AgentChat() {
  const { id: projectId } = useParams() as { id: string }
  const supabase = createClient()

  // Store state
  const {
    activeStyleDnaId,
    setActiveStyleDnaId,
    activeFabricCardId,
    setActiveFabricCardId,
    activeGarment,
    setActiveGarment,
    addGarmentCard,
    addStyleDna,
    addFabricCard,
    garmentCards,
    messages,
    setMessages,
    addMessage,
    chatLoading,
    setChatLoading,
    language,
    displayMode,
    imageGenModel
  } = useStudioStore()

  const t = translations[language]

  const renderMessageText = (text: string, garments: GarmentCard[]) => {
    if (!text) return ""
    const validGarments = [...garments]
      .filter(g => g.title && g.title.trim().length > 0)
      .sort((a, b) => b.title.length - a.title.length)

    if (validGarments.length === 0) return text

    const escapeRegExp = (str: string) => {
      return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }

    const pattern = validGarments.map(g => `@${escapeRegExp(g.title)}`).join('|')
    const regex = new RegExp(`(${pattern})`, 'g')
    const parts = text.split(regex)

    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        const titleWithoutAt = part.slice(1)
        const matchedGarment = validGarments.find(g => g.title === titleWithoutAt)
        if (matchedGarment) {
          return (
            <button
              key={index}
              type="button"
              onClick={() => setActiveGarment(matchedGarment)}
              className="inline-flex items-center gap-1 bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors mx-0.5 align-middle mb-0.5 select-none"
            >
              {part}
            </button>
          )
        }
      }
      return <span key={index}>{part}</span>
    })
  }

  // Local UI state
  const editorRef = useRef<HTMLDivElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const [attachedUrls, setAttachedUrls] = useState<string[]>([])
  const [uploadingAttachment, setUploadingAttachment] = useState(false)

  // Local state for mention dropdown
  const [showMentionDropdown, setShowMentionDropdown] = useState(false)
  const [mentionSearch, setMentionSearch] = useState("")
  const [mentionIndex, setMentionIndex] = useState(-1)

  const filteredGarments = garmentCards.filter(g => 
    g.title.toLowerCase().includes(mentionSearch.toLowerCase())
  )

  const savedRangeRef = useRef<Range | null>(null)

  const saveSelection = () => {
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      if (editorRef.current && editorRef.current.contains(range.commonAncestorContainer)) {
        savedRangeRef.current = range.cloneRange()
      }
    }
  }

  const handleEditorInput = () => {
    saveSelection()
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      const textNode = range.startContainer
      if (textNode.nodeType === Node.TEXT_NODE) {
        const offset = range.startOffset
        const nodeVal = textNode.nodeValue || ""
        const beforeCursor = nodeVal.slice(0, offset)
        const lastAtIndex = beforeCursor.lastIndexOf('@')
        if (lastAtIndex !== -1 && (lastAtIndex === 0 || beforeCursor[lastAtIndex - 1] === ' ' || beforeCursor[lastAtIndex - 1] === '\u00A0')) {
          const query = beforeCursor.slice(lastAtIndex + 1)
          if (!query.includes(' ')) {
            setShowMentionDropdown(true)
            setMentionSearch(query)
            setMentionIndex(lastAtIndex)
            return
          }
        }
      }
    }
    setShowMentionDropdown(false)
  }

  const handleSelectMention = (garment: GarmentCard) => {
    const editor = editorRef.current
    if (!editor) return

    const selection = window.getSelection()
    if (!selection) return

    let range: Range | null = null
    if (savedRangeRef.current) {
      range = savedRangeRef.current.cloneRange()
      selection.removeAllRanges()
      selection.addRange(range)
    } else if (selection.rangeCount > 0) {
      range = selection.getRangeAt(0)
    }

    if (!range) return

    // 1. Delete the "@query" text from the DOM node
    deleteTriggerAndQuery(range, editor)

    // 2. Create the Pill span
    const span = document.createElement('span')
    span.contentEditable = 'false'
    span.className = 'inline-flex items-center gap-1 bg-primary/10 text-primary border border-primary/20 rounded px-1.5 py-0.5 text-[10px] font-medium select-none mx-0.5 align-middle mb-0.5'
    span.setAttribute('data-id', garment.id)
    span.setAttribute('data-title', garment.title)
    span.innerText = `@${garment.title}`

    // 3. Insert the span node
    range.insertNode(span)

    // 4. Create and insert a trailing space node so user can type after it
    const spaceNode = document.createTextNode('\u00A0') // non-breaking space
    span.parentNode?.insertBefore(spaceNode, span.nextSibling)

    // 5. Move caret cursor after the space node
    const newRange = document.createRange()
    newRange.setStartAfter(spaceNode)
    newRange.collapse(true)
    selection.removeAllRanges()
    selection.addRange(newRange)

    // Update saved selection range
    savedRangeRef.current = newRange.cloneRange()

    // 6. Close dropdown state
    setShowMentionDropdown(false)
    setMentionIndex(-1)
    setMentionSearch("")
    
    // 7. Focus back on editor
    editor.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendPrompt(e as any)
    }
  }

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Load chat history from Supabase on mount
  useEffect(() => {
    async function loadChatHistory() {
      try {
        const { data, error } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: true })

        if (error) throw error

        if (data && data.length > 0) {
          const chatMsgs = data.map((msg: any) => {
            // Find related garment card from Zustand store if associated
            const gCard = msg.garment_card_id 
              ? useStudioStore.getState().garmentCards.find(g => g.id === msg.garment_card_id)
              : undefined

            return {
              id: msg.id,
              role: msg.role as 'agent' | 'user',
              text: msg.text || '',
              garmentCard: gCard,
              garment_card_id: msg.garment_card_id || undefined,
              image_urls: msg.image_urls || [],
              grounding_metadata: msg.grounding_metadata || undefined
            }
          })
          setMessages(chatMsgs)
        } else {
          // Fallback welcome message
          setMessages([
            {
              id: 'welcome',
              role: 'agent',
              text: translations[language].agentIntro
            }
          ])
        }
      } catch (err) {
        console.error("Failed to load chat history", err)
      }
    }

    if (projectId) {
      loadChatHistory()
    }
  }, [projectId, supabase, setMessages, language, garmentCards])

  // Handle Design Agent Request
  const handleSendPrompt = async (e: React.FormEvent) => {
    e.preventDefault()
    const editor = editorRef.current
    if (!editor || chatLoading) return

    const promptText = editor.innerText || ""
    if (!promptText.trim()) return

    const currentAttachments = [...attachedUrls]
    
    // Extract referenced garment card IDs from DOM spans
    const referencedGarmentIds: string[] = []
    const spans = editor.querySelectorAll('span[data-id]')
    spans.forEach(span => {
      const id = span.getAttribute('data-id')
      if (id) referencedGarmentIds.push(id)
    })

    // Reset input states
    editor.innerHTML = ""
    setAttachedUrls([])
    setChatLoading(true)

    // Add user message
    const userMsgId = Date.now().toString()
    addMessage({ 
      id: userMsgId, 
      role: 'user', 
      text: promptText,
      image_urls: currentAttachments
    })

    // Add agent thinking placeholder
    const agentMsgId = (Date.now() + 1).toString()
    addMessage({ 
      id: agentMsgId, 
      role: 'agent', 
      text: language === 'zh' 
        ? '正在处理您的指令，结合上下文和风格特征进行智能决策。请稍候...' 
        : 'Processing your request and checking constraints. Please wait...',
      loading: true
    })

    try {
      const response = await fetch('/api/agent/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptText,
          styleDnaId: activeGarment?.style_dna_id || activeStyleDnaId || undefined,
          fabricCardId: activeGarment?.fabric_card_id || activeFabricCardId || undefined,
          parentVersionId: activeGarment?.id || undefined,
          referencedGarmentIds,
          projectId,
          displayMode,
          imageGenModel,
          imageUrls: currentAttachments
        })
      })

      const result = await response.json()
      if (!response.ok || result.error) {
        throw new Error(result.error || "Generation request failed.")
      }

      const resData = result.data
      const currentMessages = useStudioStore.getState().messages
      const updated = [...currentMessages]
      const index = updated.findIndex(m => m.id === agentMsgId)

      if (index !== -1) {
        if (resData.isToolCalled) {
          if (resData.garmentCard) {
            // Tool generate_garment_design was called
            const gCard = resData.garmentCard as GarmentCard
            addGarmentCard(gCard)
            setActiveGarment(gCard)
            
            updated[index] = {
              id: agentMsgId,
              role: 'agent',
              text: resData.replyText,
              garmentCard: gCard,
              garment_card_id: gCard.id,
              loading: false
            }
          } else if (resData.createdStyleDna) {
            // Tool create_style_dna was called
            const sDna = resData.createdStyleDna
            addStyleDna(sDna)
            setActiveStyleDnaId(sDna.id)

            updated[index] = {
              id: agentMsgId,
              role: 'agent',
              text: resData.replyText,
              loading: false
            }
          } else if (resData.createdFabricCard) {
            // Tool create_fabric_card was called
            const fCard = resData.createdFabricCard
            addFabricCard(fCard)
            setActiveFabricCardId(fCard.id)

            updated[index] = {
              id: agentMsgId,
              role: 'agent',
              text: resData.replyText,
              loading: false
            }
          }
        } else {
          // General text reply / search grounding
          updated[index] = {
            id: agentMsgId,
            role: 'agent',
            text: resData.replyText,
            grounding_metadata: resData.groundingMetadata || undefined,
            loading: false
          }
        }
      }
      setMessages(updated)

    } catch (err: any) {
      console.warn("Agent generate failed:", err)
      const currentMessages = useStudioStore.getState().messages
      const updated = [...currentMessages]
      const index = updated.findIndex(m => m.id === agentMsgId)
      if (index !== -1) {
        updated[index] = {
          id: agentMsgId,
          role: 'agent',
          error: true,
          text: `${language === 'zh' ? '设计助手执行失败：' : 'Agent failed: '}${err.message || "An unexpected error occurred."}`,
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
        {messages.map((msg) => {
          const groundingChunks = msg.grounding_metadata?.groundingChunks || []
          const sources = groundingChunks.map((chunk: any) => {
            const web = chunk.web || chunk
            return {
              title: web.title || web.uri || "Source Link",
              uri: web.uri
            }
          }).filter((s: any) => s.uri)

          return (
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
              
              <p className="leading-relaxed whitespace-pre-line text-xs">
                {renderMessageText(msg.text, garmentCards)}
              </p>
              
              {/* Multimodal user uploaded image attachment list */}
              {msg.image_urls && msg.image_urls.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {msg.image_urls.map((url, uidx) => (
                    <a 
                      key={uidx} 
                      href={url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="w-16 h-16 rounded-md border border-border overflow-hidden bg-background hover:opacity-80 transition-opacity block shrink-0"
                    >
                      <img src={url} alt="attached attachment" className="w-full h-full object-cover" />
                    </a>
                  ))}
                </div>
              )}

              {/* Citations section for search grounding */}
              {sources.length > 0 && (
                <div className="mt-3 pt-2 border-t border-border/50 text-[10px] text-muted-foreground space-y-1">
                  <div className="font-semibold uppercase tracking-wider text-[9px] text-muted-foreground/80">{language === 'zh' ? '参考引用' : 'Sources'}</div>
                  <ul className="grid grid-cols-1 gap-1">
                    {sources.map((src: any, idx: number) => (
                      <li key={idx} className="truncate">
                        <a 
                          href={src.uri} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-primary hover:underline inline-flex items-center gap-1 truncate max-w-full"
                        >
                          <span className="bg-primary/10 text-primary px-1 rounded mr-0.5 shrink-0 text-[9px] font-mono">[{idx + 1}]</span>
                          <span className="truncate flex-1">{src.title}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
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
          )
        })}
        <div ref={chatEndRef} />
      </div>

      <div className="p-4 border-t border-border bg-background relative">
        {/* Mention Dropdown Popover */}
        {showMentionDropdown && filteredGarments.length > 0 && (
          <div className="absolute bottom-[60px] left-4 right-4 bg-popover border border-border rounded-lg shadow-lg max-h-32 overflow-y-auto z-50 p-1 divide-y divide-border/30">
            {filteredGarments.map((g) => (
              <button
                key={g.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault() // Prevents editor focus loss
                }}
                onClick={() => handleSelectMention(g)}
                className="w-full text-left px-3 py-1.5 hover:bg-accent hover:text-accent-foreground text-xs rounded transition-colors flex items-center justify-between"
              >
                <span className="font-medium truncate mr-2">{g.title}</span>
                <span className="text-[10px] text-muted-foreground shrink-0 uppercase tracking-wide bg-muted px-1.5 py-0.5 rounded">{g.category}</span>
              </button>
            ))}
          </div>
        )}

        {/* Active attachment preview zone */}
        {attachedUrls.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2 p-2 bg-muted/30 border border-border/50 rounded-lg max-h-24 overflow-y-auto">
            {attachedUrls.map((url, idx) => (
              <div key={idx} className="relative group w-12 h-12 rounded border border-border overflow-hidden bg-card shrink-0">
                <img src={url} alt="attachment preview" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setAttachedUrls(prev => prev.filter((_, i) => i !== idx))}
                  className="absolute top-0 right-0 bg-destructive text-destructive-foreground p-0.5 rounded-bl opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSendPrompt} className="flex space-x-2 items-center">
          {/* File upload selector and triggers */}
          <input 
            type="file" 
            id="chat-file-input" 
            multiple 
            accept="image/*" 
            className="hidden" 
            onChange={async (e) => {
              const files = e.target.files
              if (!files || files.length === 0) return
              setUploadingAttachment(true)
              try {
                const { data: { user } } = await supabase.auth.getUser()
                if (!user) throw new Error("No authenticated user session")
                
                const newUrls: string[] = []
                for (let i = 0; i < files.length; i++) {
                  const file = files[i]
                  const fileExt = file.name.split('.').pop()
                  const fileName = `${user.id}/chat_attachments/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`
                  
                  const { error: uploadError } = await supabase.storage
                    .from('design_assets')
                    .upload(fileName, file, {
                      cacheControl: '3600',
                      upsert: true
                    })
                  if (uploadError) throw uploadError
                  
                  const { data: { publicUrl } } = supabase.storage
                    .from('design_assets')
                    .getPublicUrl(fileName)
                  newUrls.push(publicUrl)
                }
                setAttachedUrls(prev => [...prev, ...newUrls])
              } catch (err) {
                console.error("Failed to upload attachment", err)
              } finally {
                setUploadingAttachment(false)
              }
            }} 
            disabled={uploadingAttachment || chatLoading}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={uploadingAttachment || chatLoading}
            onClick={() => document.getElementById('chat-file-input')?.click()}
            className="shrink-0 text-muted-foreground hover:text-foreground h-9 w-9"
          >
            {uploadingAttachment ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <Paperclip className="w-4 h-4" />}
          </Button>

          <div
            ref={editorRef}
            contentEditable={!chatLoading && !!activeStyleDnaId && !!activeFabricCardId}
            onInput={handleEditorInput}
            onKeyDown={handleKeyDown}
            onKeyUp={saveSelection}
            onMouseUp={saveSelection}
            onFocus={saveSelection}
            data-placeholder={
              !activeStyleDnaId 
                ? (language === 'zh' ? "请先在左侧选择风格 DNA..." : "Select a Style DNA first...") 
                : !activeFabricCardId 
                  ? (language === 'zh' ? "请先在左侧选择面料样卡..." : "Select a Fabric Card first...") 
                  : t.agentInputPlaceholder
            }
            className="flex-1 bg-muted/50 border border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/50 rounded-lg px-2.5 py-1.5 min-h-[36px] max-h-36 overflow-y-auto text-xs outline-none cursor-text empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/60 select-text leading-relaxed whitespace-pre-wrap break-all py-2"
          />
          <Button 
            type="submit" 
            size="icon" 
            disabled={chatLoading || !activeStyleDnaId || !activeFabricCardId} 
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
