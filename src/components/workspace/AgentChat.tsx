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
  X,
  Settings,
  ChevronRight,
  CheckCircle2
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
  return false;
}

const getStatusLabel = (status: string, lang: 'zh' | 'en') => {
  if (lang === 'zh') {
    switch (status) {
      case 'classifying_intent': return '正在识别您的意图...';
      case 'understanding': return '正在解析输入参数与设计上下文...';
      case 'thinking': return '正在调用 3.1 Pro 展开深度思考与工艺推导...';
      case 'generating_tool_call': return '正在分析设计需求，生成设计工具指令...';
      case 'preparing_response': return '正在调用搜索接口并准备答复...';
      case 'executing_tool:generate_garment_design': return '正在运行款式设计工具 (generate_garment_design)，调用生图引擎渲染效果图...';
      case 'executing_tool:create_style_dna': return '正在运行风格基因录入工具 (create_style_dna)，保存风格参数...';
      case 'executing_tool:create_fabric_card': return '正在运行面料卡录入工具 (create_fabric_card)，保存面料参数...';
      case 'saving_garment': return '正在归档新生成的款式设计卡到项目数据库...';
      case 'saving_style_dna': return '正在归档风格基因预设到项目数据库...';
      case 'saving_fabric_card': return '正在归档面料卡预设到项目数据库...';
      case 'saving_chat_message': return '正在将答复和关联数据保存到聊天历史...';
      case 'rendering': return '正在调用生图引擎渲染效果图...';
      case 'saving': return '正在归档设计图并编写工艺规格单...';
      case 'searching': return '正在检索流行趋势与相关信源...';
      case 'waiting_subagent_fabric': return '正在等待助手 Agent 创建面料...';
      case 'waiting_subagent_style': return '正在等待助手 Agent 创建风格基因...';
      case 'subagent_generating_fabric': return '助手 Agent：正在设计面料物理参数 (成分、克重、纹理等)...';
      case 'subagent_saving_fabric': return '助手 Agent：正在将新面料样卡归档建卡入库...';
      case 'subagent_generating_style': return '助手 Agent：正在推导新风格的基因参数 (色彩、细节、廓形等)...';
      case 'subagent_saving_style': return '助手 Agent：正在将新风格基因归档入库...';
      default: return '设计助手正在运行中...';
    }
  } else {
    switch (status) {
      case 'classifying_intent': return 'Classifying user intent...';
      case 'understanding': return 'Analyzing input parameters and design context...';
      case 'thinking': return 'Invoking 3.1 Pro for deep thinking and reasoning...';
      case 'generating_tool_call': return 'Generating design tool instructions...';
      case 'preparing_response': return 'Calling search APIs and preparing response...';
      case 'executing_tool:generate_garment_design': return 'Executing garment design tool (generate_garment_design), rendering image...';
      case 'executing_tool:create_style_dna': return 'Executing Style DNA tool (create_style_dna), saving preferences...';
      case 'executing_tool:create_fabric_card': return 'Executing Fabric Card tool (create_fabric_card), saving attributes...';
      case 'saving_garment': return 'Archiving newly generated garment card to database...';
      case 'saving_style_dna': return 'Archiving Style DNA preset to database...';
      case 'saving_fabric_card': return 'Archiving Fabric Card preset to database...';
      case 'saving_chat_message': return 'Saving response and metadata to chat history...';
      case 'rendering': return 'Rendering high-fidelity swatches...';
      case 'saving': return 'Saving specifications and files...';
      case 'searching': return 'Searching trends and citations...';
      case 'waiting_subagent_fabric': return 'Waiting for Assistant Agent to create fabric...';
      case 'waiting_subagent_style': return 'Waiting for Assistant Agent to create style...';
      case 'subagent_generating_fabric': return 'Assistant Agent: Designing fabric physical parameters (composition, GSM, texture)...';
      case 'subagent_saving_fabric': return 'Assistant Agent: Saving new fabric card to database...';
      case 'subagent_generating_style': return 'Assistant Agent: Deriving new style DNA parameters...';
      case 'subagent_saving_style': return 'Assistant Agent: Saving new style DNA to database...';
      default: return 'AI Assistant is running...';
    }
  }
};

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
    styleDnas,
    fabricCards,
    messages,
    setMessages,
    addMessage,
    chatLoading,
    setChatLoading,
    language,
    displayMode,
    imageGenModel,
    activeProject
  } = useStudioStore()

  const t = translations[language]

  const renderPillsAndText = (text: string, garments: GarmentCard[]) => {
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

  const parseInlineElements = (text: string, garments: GarmentCard[]) => {
    if (!text) return ""
    // Split by markdown bold tags **
    const boldParts = text.split(/\*\*([\s\S]*?)\*\*/g)
    
    return boldParts.map((part, index) => {
      const isBold = index % 2 === 1
      const parsedPart = renderPillsAndText(part, garments)
      if (isBold) {
        return <strong key={index} className="font-semibold text-foreground">{parsedPart}</strong>
      }
      return <span key={index}>{parsedPart}</span>
    })
  }

  const renderMessageText = (text: string, garments: GarmentCard[]) => {
    if (!text) return ""
    const lines = text.split('\n')
    
    const blocks: React.ReactNode[] = []
    let currentListItems: React.ReactNode[] = []

    const flushList = (key: number) => {
      if (currentListItems.length > 0) {
        blocks.push(
          <ul key={`list-${key}`} className="list-disc pl-5 my-2 space-y-1.5 text-xs text-muted-foreground/90">
            {...currentListItems}
          </ul>
        )
        currentListItems = []
      }
    }

    lines.forEach((line, idx) => {
      const trimmed = line.trim()

      if (trimmed.startsWith('##### ')) {
        flushList(idx)
        blocks.push(
          <h5 key={idx} className="text-[10px] font-semibold text-foreground mt-2 mb-1">
            {parseInlineElements(trimmed.slice(6), garments)}
          </h5>
        )
      } else if (trimmed.startsWith('#### ')) {
        flushList(idx)
        blocks.push(
          <h4 key={idx} className="text-xs font-semibold text-foreground mt-3 mb-1">
            {parseInlineElements(trimmed.slice(5), garments)}
          </h4>
        )
      } else if (trimmed.startsWith('### ')) {
        flushList(idx)
        blocks.push(
          <h3 key={idx} className="text-xs font-bold text-foreground mt-4 mb-1.5">
            {parseInlineElements(trimmed.slice(4), garments)}
          </h3>
        )
      } else if (trimmed.startsWith('## ')) {
        flushList(idx)
        blocks.push(
          <h2 key={idx} className="text-sm font-bold text-foreground mt-5 mb-2">
            {parseInlineElements(trimmed.slice(3), garments)}
          </h2>
        )
      } else if (trimmed.startsWith('# ')) {
        flushList(idx)
        blocks.push(
          <h1 key={idx} className="text-base font-extrabold text-foreground mt-6 mb-2.5">
            {parseInlineElements(trimmed.slice(2), garments)}
          </h1>
        )
      } else if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
        currentListItems.push(
          <li key={idx} className="pl-0.5">
            {parseInlineElements(trimmed.slice(2), garments)}
          </li>
        )
      } else if (trimmed === '') {
        flushList(idx)
        blocks.push(<div key={idx} className="h-1.5" />)
      } else {
        flushList(idx)
        blocks.push(
          <p key={idx} className="text-xs leading-relaxed text-muted-foreground/90 my-2 last:mb-0">
            {parseInlineElements(line, garments)}
          </p>
        )
      }
    })

    flushList(lines.length)

    return <div className="space-y-0.5">{blocks}</div>
  }

  // Local UI state
  const editorRef = useRef<HTMLDivElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const [attachedUrls, setAttachedUrls] = useState<string[]>([])
  const [uploadingAttachment, setUploadingAttachment] = useState(false)

  // Agent Settings local states
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [settingsModel, setSettingsModel] = useState<'auto' | 'gemini-3.5-flash' | 'gemini-3.1-pro-preview'>('auto')
  const [settingsStyle, setSettingsStyle] = useState<'default' | 'friendly' | 'professional'>('default')
  const [settingsResolution, setSettingsResolution] = useState<'1024x1024' | '2048x2048' | '4096x4096'>('1024x1024')
  const [savingSettings, setSavingSettings] = useState(false)

  // Conflict resolution inline custom input states
  const [activeCustomInputMsgId, setActiveCustomInputMsgId] = useState<string | null>(null)
  const [customInputValue, setCustomInputValue] = useState('')

  // Sync settings when activeProject changes
  useEffect(() => {
    if (activeProject) {
      setSettingsModel((activeProject.agent_model as any) || 'auto')
      setSettingsStyle((activeProject.agent_style as any) || 'default')
      setSettingsResolution((activeProject.image_resolution as any) || '1024x1024')
    }
  }, [activeProject])

  const handleSaveSettings = async () => {
    if (!projectId) return
    setSavingSettings(true)
    try {
      const { error } = await supabase
        .from('projects')
        .update({
          agent_model: settingsModel,
          agent_style: settingsStyle,
          image_resolution: settingsResolution
        })
        .eq('id', projectId)

      if (error) throw error

      useStudioStore.getState().updateProjectSettings(settingsModel, settingsStyle, settingsResolution)
      setIsSettingsOpen(false)
    } catch (err) {
      console.error("Failed to save agent settings:", err)
      alert("保存设置失败，请重试。")
    } finally {
      setSavingSettings(false)
    }
  }

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

            // Find related style dna or fabric card from Zustand store if associated
            const createdStyleDnaId = msg.grounding_metadata?.createdStyleDnaId
            const createdFabricCardId = msg.grounding_metadata?.createdFabricCardId

            const sDna = createdStyleDnaId
              ? styleDnas.find(s => s.id === createdStyleDnaId)
              : undefined

            const fCard = createdFabricCardId
              ? fabricCards.find(f => f.id === createdFabricCardId)
              : undefined

            const conflictResolution = msg.grounding_metadata?.type === 'conflict_resolution'
              ? {
                  conflictType: msg.grounding_metadata.conflictType,
                  question: msg.grounding_metadata.question,
                  resolved: msg.grounding_metadata.resolved === true,
                  selectedOptionLabel: msg.grounding_metadata.selectedOptionLabel,
                  options: msg.grounding_metadata.options || []
                }
              : undefined

            return {
              id: msg.id,
              role: msg.role as 'agent' | 'user',
              text: msg.text || '',
              garmentCard: gCard,
              garment_card_id: msg.garment_card_id || undefined,
              createdStyleDna: sDna,
              createdFabricCard: fCard,
              image_urls: msg.image_urls || [],
              grounding_metadata: msg.grounding_metadata || undefined,
              conflictResolution
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
  }, [projectId, supabase, setMessages, language, garmentCards, styleDnas, fabricCards])

  // Helper to read and process chunk stream from backend
  const readStream = async (response: Response, agentMsgId: string) => {
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error("No response body stream.")
    }

    const decoder = new TextDecoder("utf-8")
    let buffer = ""
    let finalResult: any = null

    while (true) {
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const chunk = JSON.parse(line)
          if (chunk.type === 'status') {
            const currentMessages = useStudioStore.getState().messages
            const updated = currentMessages.map(m => {
              if (m.id === agentMsgId) {
                return {
                  ...m,
                  loadingStatus: chunk.status,
                  loadingTarget: chunk.target || m.loadingTarget
                }
              }
              return m
            })
            setMessages(updated)
          } else if (chunk.type === 'created_fabric') {
            addFabricCard(chunk.data)
            setActiveFabricCardId(chunk.data.id)
            const currentMessages = useStudioStore.getState().messages
            const updated = currentMessages.map(m => {
              if (m.id === agentMsgId) {
                return {
                  ...m,
                  createdFabricCard: chunk.data
                }
              }
              return m
            })
            setMessages(updated)
          } else if (chunk.type === 'created_style') {
            addStyleDna(chunk.data)
            setActiveStyleDnaId(chunk.data.id)
            const currentMessages = useStudioStore.getState().messages
            const updated = currentMessages.map(m => {
              if (m.id === agentMsgId) {
                return {
                  ...m,
                  createdStyleDna: chunk.data
                }
              }
              return m
            })
            setMessages(updated)
          } else if (chunk.type === 'error') {
            throw new Error(chunk.message || "Backend streamed error")
          } else if (chunk.type === 'result') {
            finalResult = chunk.data
          }
        } catch (e: any) {
          console.error("Failed to parse stream chunk:", e, "Line:", line)
        }
      }
    }

    if (!finalResult) {
      throw new Error("No result received from stream.")
    }

    const resData = finalResult
    const currentMessages = useStudioStore.getState().messages
    const updated = [...currentMessages]
    const index = updated.findIndex(m => m.id === agentMsgId)

    if (index !== -1) {
      if (resData.type === 'conflict_resolution') {
        updated[index] = {
          id: agentMsgId,
          role: 'agent',
          text: resData.question,
          conflictResolution: {
            conflictType: resData.conflictType,
            question: resData.question,
            resolved: false,
            options: resData.options
          },
          loading: false
        }
      } else if (resData.isToolCalled) {
        if (resData.createdFabricCard) {
          addFabricCard(resData.createdFabricCard)
          setActiveFabricCardId(resData.createdFabricCard.id)
        }
        if (resData.createdStyleDna) {
          addStyleDna(resData.createdStyleDna)
          setActiveStyleDnaId(resData.createdStyleDna.id)
        }

        if (resData.garmentCard) {
          const gCard = resData.garmentCard as GarmentCard
          addGarmentCard(gCard)
          setActiveGarment(gCard)
          
          updated[index] = {
            id: agentMsgId,
            role: 'agent',
            text: resData.replyText,
            garmentCard: gCard,
            garment_card_id: gCard.id,
            createdFabricCard: resData.createdFabricCard || updated[index]?.createdFabricCard || null,
            createdStyleDna: resData.createdStyleDna || updated[index]?.createdStyleDna || null,
            loading: false
          }
        } else if (resData.createdStyleDna) {
          const sDna = resData.createdStyleDna
          updated[index] = {
            id: agentMsgId,
            role: 'agent',
            text: resData.replyText,
            createdStyleDna: sDna,
            loading: false
          }
        } else if (resData.createdFabricCard) {
          const fCard = resData.createdFabricCard
          updated[index] = {
            id: agentMsgId,
            role: 'agent',
            text: resData.replyText,
            createdFabricCard: fCard,
            loading: false
          }
        }
      } else {
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
  }

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
          styleDnaId: activeStyleDnaId || activeGarment?.style_dna_id || undefined,
          fabricCardId: activeFabricCardId || activeGarment?.fabric_card_id || undefined,
          parentVersionId: activeGarment?.id || undefined,
          referencedGarmentIds,
          projectId,
          displayMode,
          imageGenModel,
          imageUrls: currentAttachments,
          stream: true,
          agentModel: activeProject?.agent_model || 'auto',
          agentStyle: activeProject?.agent_style || 'default',
          imageResolution: activeProject?.image_resolution || '1024x1024'
        })
      })

      if (!response.ok) {
        throw new Error("Generation request failed.")
      }

      await readStream(response, agentMsgId)

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

  // Handle confirming inline custom input
  const handleConfirmCustomInput = async (messageId: string) => {
    const cleanVal = customInputValue.trim()
    if (!cleanVal) return

    const currentMessages = useStudioStore.getState().messages
    const msg = currentMessages.find(m => m.id === messageId)
    if (!msg || !msg.conflictResolution) return

    const { conflictType } = msg.conflictResolution

    // Reset inline input state
    setActiveCustomInputMsgId(null)
    setCustomInputValue('')

    // Assemble virtual option object
    const customOption = {
      id: 'custom_input',
      label: conflictType === 'fabric'
        ? `${language === 'zh' ? '自定义面料' : 'Custom Fabric'}: ${cleanVal}`
        : `${language === 'zh' ? '自定义风格' : 'Custom Style'}: ${cleanVal}`,
      value: `custom_${cleanVal}`
    }

    // Call handleSelectConflictOption to resolve and resubmit
    await handleSelectConflictOption(messageId, customOption)
  }

  // Handle click on dynamic conflict card option
  const handleSelectConflictOption = async (
    messageId: string, 
    option: { id: string; label: string; value: string }
  ) => {
    const currentMessages = useStudioStore.getState().messages
    const msg = currentMessages.find(m => m.id === messageId)
    if (!msg || !msg.conflictResolution) return

    const { conflictType } = msg.conflictResolution

    // 1. If it's custom selection, focus on chat input editor
    if (option.value === 'custom' || option.id === 'custom') {
      const editor = editorRef.current
      if (editor) {
        editor.focus()
        // Insert placeholder guidance text
        editor.innerHTML = language === 'zh' 
          ? '<b>用手动描述的面料特征：</b>请在这里描述您的要求。' 
          : '<b>Manual description:</b> Describe your requirement here.'
      }
      return
    }

    // 2. Sync Zustand stores based on selection (updates sidebar checkboxes automatically)
    if (conflictType === 'fabric') {
      setActiveFabricCardId(option.value)
    } else if (conflictType === 'style_dna') {
      setActiveStyleDnaId(option.value)
    }

    // 3. Find the predecessor user message to find the original prompt & images
    const msgIndex = currentMessages.findIndex(m => m.id === messageId)
    const userMsg = msgIndex > 0 ? currentMessages[msgIndex - 1] : null
    const originalPrompt = userMsg ? userMsg.text : ''
    const originalImageUrls = userMsg ? userMsg.image_urls : []

    setChatLoading(true)

    // 4. Update the conflict card to resolved state in DB (resolved: true)
    try {
      const resolvedMetadata = {
        ...msg.grounding_metadata,
        resolved: true,
        selectedOptionLabel: option.label
      }

      await supabase
        .from('chat_messages')
        .update({ grounding_metadata: resolvedMetadata })
        .eq('id', messageId)
    } catch (dbErr) {
      console.error('Failed to update conflict message resolution state in DB:', dbErr)
    }

    // 5. Append new Agent placeholder message and update conflict resolution state locally
    const newAgentMsgId = Date.now().toString()
    const updatedMessages = useStudioStore.getState().messages.map(m => {
      if (m.id === messageId && m.conflictResolution) {
        return {
          ...m,
          conflictResolution: {
            ...m.conflictResolution,
            resolved: true,
            selectedOptionLabel: option.label
          }
        }
      }
      return m
    })

    setMessages([
      ...updatedMessages,
      {
        id: newAgentMsgId,
        role: 'agent',
        text: language === 'zh'
          ? `已选择: "${option.label}"。正在重新生成设计，请稍候...`
          : `Selected: "${option.label}". Resubmitting design request, please wait...`,
        loading: true
      }
    ])

    // 6. Resubmit generate POST request with conflictResolved: true
    try {
      const response = await fetch('/api/agent/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: originalPrompt,
          styleDnaId: conflictType === 'style_dna' ? option.value : activeStyleDnaId || activeGarment?.style_dna_id || undefined,
          fabricCardId: conflictType === 'fabric' ? option.value : activeFabricCardId || activeGarment?.fabric_card_id || undefined,
          parentVersionId: activeGarment?.id || undefined,
          referencedGarmentIds: [],
          projectId,
          displayMode,
          imageGenModel,
          imageUrls: originalImageUrls || [],
          stream: true,
          conflictResolved: true, // Bypass interceptor!
          agentModel: activeProject?.agent_model || 'auto',
          agentStyle: activeProject?.agent_style || 'default',
          imageResolution: activeProject?.image_resolution || '1024x1024'
        })
      })

      if (!response.ok) {
        throw new Error("Resubmission request failed.")
      }

      await readStream(response, newAgentMsgId)

    } catch (err: any) {
      console.error("Agent resubmission failed:", err)
      const latestMessages = useStudioStore.getState().messages
      const finalMsgs = latestMessages.map(m => {
        if (m.id === newAgentMsgId) {
          return {
            ...m,
            error: true,
            text: `${language === 'zh' ? '设计助手重新提交失败：' : 'Agent resubmission failed: '}${err.message || "An unexpected error occurred."}`,
            loading: false
          }
        }
        return m
      })
      setMessages(finalMsgs)
    } finally {
      setChatLoading(false)
    }
  }

  return (
    <aside className="w-80 lg:w-96 border-l border-border bg-card flex flex-col shrink-0">
      <div className="h-14 border-b border-border flex items-center justify-between px-4 bg-background/50 shrink-0 select-none">
        <div className="flex items-center">
          <Sparkles className="w-4 h-4 text-primary mr-2" />
          <h2 className="font-outfit font-medium">{t.agent}</h2>
        </div>
        <div className="flex items-center space-x-2">
          {chatLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsSettingsOpen(true)}
            className="w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
            title={language === 'zh' ? '设计 Agent 设置' : 'Agent Settings'}
          >
            <Settings className="w-4 h-4" />
          </Button>
        </div>
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
              <p className="font-semibold text-xs mb-1.5 uppercase tracking-wide opacity-80">
                {msg.role === 'user' ? (language === 'zh' ? '设计师' : 'Designer') : (language === 'zh' ? '设计 Agent' : 'Agent')}
              </p>
              
              {msg.role === 'agent' && msg.conflictResolution ? (
                <div className="mt-2 border border-primary/20 rounded-lg p-3.5 bg-primary/5 space-y-3">
                  <div className="flex items-center space-x-2 text-foreground font-medium text-xs">
                    <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse shrink-0" />
                    <span>{msg.conflictResolution.question}</span>
                  </div>
                  {msg.conflictResolution.resolved ? (
                    <div className="flex items-center space-x-2 text-muted-foreground bg-background/40 border border-border/50 rounded-md p-2.5 text-xs">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>
                        {language === 'zh' 
                          ? `已选用: ${msg.conflictResolution.selectedOptionLabel}` 
                          : `Selected: ${msg.conflictResolution.selectedOptionLabel}`}
                      </span>
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      {activeCustomInputMsgId === msg.id ? (
                        <div className="space-y-2 border border-primary/20 rounded-md p-2.5 bg-background/50">
                          <input
                            type="text"
                            value={customInputValue}
                            onChange={(e) => setCustomInputValue(e.target.value)}
                            placeholder={msg.conflictResolution.conflictType === 'fabric' 
                              ? (language === 'zh' ? "请输入您想要的面料..." : "Enter your desired fabric...") 
                              : (language === 'zh' ? "请输入您想要的风格..." : "Enter your desired style...")}
                            className="w-full text-xs bg-background border border-border rounded-md px-2.5 py-1.5 focus:outline-none focus:border-primary/50 text-foreground"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleConfirmCustomInput(msg.id);
                              }
                            }}
                          />
                          <div className="flex justify-end space-x-2">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveCustomInputMsgId(null)
                                setCustomInputValue('')
                              }}
                              className="text-[10px] border border-border bg-background hover:bg-accent text-foreground px-2.5 py-1 rounded-md transition-colors"
                            >
                              {language === 'zh' ? '取消' : 'Cancel'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleConfirmCustomInput(msg.id)}
                              className="text-[10px] bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-2.5 py-1 rounded-md transition-colors"
                            >
                              {language === 'zh' ? '确定' : 'Confirm'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        msg.conflictResolution.options.map((opt: any) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              if (opt.value === 'custom' || opt.id === 'custom') {
                                setActiveCustomInputMsgId(msg.id)
                                setCustomInputValue('')
                              } else {
                                handleSelectConflictOption(msg.id, opt)
                              }
                            }}
                            className="w-full text-left text-xs bg-background/50 hover:bg-background border border-border hover:border-primary/40 rounded-md p-2.5 transition-all duration-200 cursor-pointer text-muted-foreground hover:text-foreground font-medium flex justify-between items-center group"
                          >
                            <span>{opt.label}</span>
                            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0 ml-1.5" />
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ) : msg.role === 'agent' && (msg.garmentCard || msg.createdStyleDna || msg.createdFabricCard) ? (
                <div className="mt-1">
                  {msg.garmentCard && (() => {
                    const isActive = activeGarment?.id === msg.garmentCard.id
                    return (
                      <div 
                        onClick={() => msg.garmentCard && setActiveGarment(msg.garmentCard)}
                        className={`cursor-pointer rounded-lg border p-2 flex items-center justify-between transition-all duration-200 ${
                          isActive 
                            ? 'bg-primary/5 border-primary/30 shadow-sm' 
                            : 'bg-background/40 border-border hover:bg-background/80 hover:border-muted-foreground/30'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5 truncate mr-2">
                          {msg.garmentCard.images?.[0] && (
                            <div className="w-10 h-10 rounded border border-border overflow-hidden bg-muted shrink-0">
                              <img src={msg.garmentCard.images[0]} alt="" className="w-full h-full object-cover" />
                            </div>
                          )}
                          <div className="truncate">
                            <div className="flex items-center space-x-1.5">
                              <span className="text-[9px] uppercase font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded tracking-wide shrink-0">
                                {language === 'zh' ? '设计已生成' : 'Design Generated'}
                              </span>
                              <span className="text-[8px] text-muted-foreground uppercase font-mono tracking-wider shrink-0 bg-muted px-1 rounded">
                                {msg.garmentCard.category}
                              </span>
                            </div>
                            <h4 className="text-xs font-semibold mt-1 text-foreground truncate max-w-[120px] lg:max-w-[150px]">
                              {msg.garmentCard.title}
                            </h4>
                          </div>
                        </div>
                        <Button 
                          size="sm" 
                          type="button"
                          variant={isActive ? "default" : "ghost"}
                          className="h-6 text-[9px] shrink-0 font-medium px-2"
                        >
                          {isActive 
                            ? (language === 'zh' ? '查看中' : 'Viewing') 
                            : (language === 'zh' ? '定位' : 'Navigate')}
                        </Button>
                      </div>
                    )
                  })()}

                  {msg.createdStyleDna && (() => {
                    const isDnaActive = activeStyleDnaId === msg.createdStyleDna.id
                    return (
                      <div 
                        onClick={() => msg.createdStyleDna && setActiveStyleDnaId(msg.createdStyleDna.id)}
                        className={`cursor-pointer rounded-lg border p-2 flex items-center justify-between transition-all duration-200 ${
                          isDnaActive 
                            ? 'bg-primary/5 border-primary/30 shadow-sm' 
                            : 'bg-background/40 border-border hover:bg-background/80 hover:border-muted-foreground/30'
                        }`}
                      >
                        <div className="truncate mr-2">
                          <div className="flex items-center space-x-1.5">
                            <span className="text-[9px] uppercase font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded tracking-wide shrink-0">
                              {language === 'zh' ? '风格 DNA 已录入' : 'Style DNA Saved'}
                            </span>
                          </div>
                          <h4 className="text-xs font-semibold mt-1 text-foreground truncate max-w-[120px] lg:max-w-[150px]">
                            {msg.createdStyleDna.name}
                          </h4>
                        </div>
                        <Button 
                          size="sm" 
                          type="button"
                          variant={isDnaActive ? "default" : "ghost"}
                          className="h-6 text-[9px] shrink-0 font-medium px-2"
                        >
                          {isDnaActive 
                            ? (language === 'zh' ? '已激活' : 'Active') 
                            : (language === 'zh' ? '激活' : 'Activate')}
                        </Button>
                      </div>
                    )
                  })()}

                  {msg.createdFabricCard && (() => {
                    const isFabricActive = activeFabricCardId === msg.createdFabricCard.id
                    return (
                      <div 
                        onClick={() => msg.createdFabricCard && setActiveFabricCardId(msg.createdFabricCard.id)}
                        className={`cursor-pointer rounded-lg border p-2 flex items-center justify-between transition-all duration-200 ${
                          isFabricActive 
                            ? 'bg-primary/5 border-primary/30 shadow-sm' 
                            : 'bg-background/40 border-border hover:bg-background/80 hover:border-muted-foreground/30'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5 truncate mr-2">
                          {msg.createdFabricCard.image && (
                            <div className="w-10 h-10 rounded border border-border overflow-hidden bg-muted shrink-0">
                              <img src={msg.createdFabricCard.image} alt="" className="w-full h-full object-cover" />
                            </div>
                          )}
                          <div className="truncate">
                            <div className="flex items-center space-x-1.5">
                              <span className="text-[9px] uppercase font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded tracking-wide shrink-0">
                                {language === 'zh' ? '面料卡已录入' : 'Fabric Saved'}
                              </span>
                            </div>
                            <h4 className="text-xs font-semibold mt-1 text-foreground truncate max-w-[120px] lg:max-w-[150px]">
                              {msg.createdFabricCard.name}
                            </h4>
                          </div>
                        </div>
                        <Button 
                          size="sm" 
                          type="button"
                          variant={isFabricActive ? "default" : "ghost"}
                          className="h-6 text-[9px] shrink-0 font-medium px-2"
                        >
                          {isFabricActive 
                            ? (language === 'zh' ? '已激活' : 'Active') 
                            : (language === 'zh' ? '激活' : 'Activate')}
                        </Button>
                      </div>
                    )
                  })()}
                </div>
              ) : (
                <div className="leading-relaxed text-xs">
                  {renderMessageText(msg.text, garmentCards)}
                </div>
              )}
              
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
                <div className="space-y-3 mt-3">
                  {/* Main Status Indicator */}
                  <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
                    <span>{getStatusLabel(msg.loadingStatus || 'understanding', language)}</span>
                  </div>

                  {/* 1. Assistant Agent Collaboration Panel */}
                  {(msg.loadingStatus?.includes('subagent') || msg.loadingStatus?.includes('waiting_subagent_')) && (
                    <div className="mt-2 border border-primary/10 rounded-lg p-3 bg-primary/5 space-y-3">
                      <div className="flex items-center space-x-2 text-primary font-medium text-xs">
                        <Sparkles className="w-3.5 h-3.5 animate-spin text-primary shrink-0" style={{ animationDuration: '3.5s' }} />
                        <span>
                          {language === 'zh' ? '助手 Agent 协同中' : 'Assistant Agent Active'}
                        </span>
                      </div>
                      
                      {/* Fabric Target */}
                      {(msg.loadingStatus?.includes('fabric') || msg.loadingTarget === 'fabric') && (
                        <div>
                          {msg.createdFabricCard ? (
                            (() => {
                              const isFabricActive = activeFabricCardId === msg.createdFabricCard.id;
                              return (
                                <div 
                                  onClick={() => msg.createdFabricCard && setActiveFabricCardId(msg.createdFabricCard.id)}
                                  className={`cursor-pointer rounded-lg border p-2 flex items-center justify-between transition-all duration-200 ${
                                    isFabricActive 
                                      ? 'bg-primary/5 border-primary/30 shadow-sm' 
                                      : 'bg-background/40 border-border hover:bg-background/80 hover:border-muted-foreground/30'
                                  }`}
                                >
                                  <div className="flex items-center space-x-2.5 truncate mr-2">
                                    {msg.createdFabricCard.image && (
                                      <div className="w-10 h-10 rounded border border-border overflow-hidden bg-muted shrink-0">
                                        <img src={msg.createdFabricCard.image} alt="" className="w-full h-full object-cover" />
                                      </div>
                                    )}
                                    <div className="truncate">
                                      <div className="flex items-center space-x-1.5">
                                        <span className="text-[9px] uppercase font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded tracking-wide shrink-0">
                                          {language === 'zh' ? '面料卡已录入' : 'Fabric Saved'}
                                        </span>
                                      </div>
                                      <h4 className="text-xs font-semibold mt-1 text-foreground truncate max-w-[120px] lg:max-w-[150px]">
                                        {msg.createdFabricCard.name}
                                      </h4>
                                    </div>
                                  </div>
                                  <Button 
                                    size="sm" 
                                    type="button"
                                    variant={isFabricActive ? "default" : "ghost"}
                                    className="h-6 text-[9px] shrink-0 font-medium px-2"
                                  >
                                    {isFabricActive 
                                      ? (language === 'zh' ? '已激活' : 'Active') 
                                      : (language === 'zh' ? '激活' : 'Activate')}
                                  </Button>
                                </div>
                              );
                            })()
                          ) : (
                            <div className="p-3 rounded-lg border border-border bg-background/25 space-y-2.5 animate-pulse">
                              <div className="h-4 w-28 bg-muted rounded" />
                              <div className="grid grid-cols-2 gap-2">
                                <div className="h-3.5 w-full bg-muted rounded" />
                                <div className="h-3.5 w-full bg-muted rounded" />
                                <div className="h-3.5 w-full bg-muted rounded" />
                                <div className="h-3.5 w-full bg-muted rounded" />
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Style DNA Target */}
                      {(msg.loadingStatus?.includes('style') || msg.loadingTarget === 'style') && (
                        <div>
                          {msg.createdStyleDna ? (
                            (() => {
                              const isDnaActive = activeStyleDnaId === msg.createdStyleDna.id;
                              return (
                                <div 
                                  onClick={() => msg.createdStyleDna && setActiveStyleDnaId(msg.createdStyleDna.id)}
                                  className={`cursor-pointer rounded-lg border p-2 flex items-center justify-between transition-all duration-200 ${
                                    isDnaActive 
                                      ? 'bg-primary/5 border-primary/30 shadow-sm' 
                                      : 'bg-background/40 border-border hover:bg-background/80 hover:border-muted-foreground/30'
                                  }`}
                                >
                                  <div className="truncate mr-2">
                                    <div className="flex items-center space-x-1.5">
                                      <span className="text-[9px] uppercase font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded tracking-wide shrink-0">
                                        {language === 'zh' ? '风格 DNA 已录入' : 'Style DNA Saved'}
                                      </span>
                                    </div>
                                    <h4 className="text-xs font-semibold mt-1 text-foreground truncate max-w-[120px] lg:max-w-[150px]">
                                      {msg.createdStyleDna.name}
                                    </h4>
                                  </div>
                                  <Button 
                                    size="sm" 
                                    type="button"
                                    variant={isDnaActive ? "default" : "ghost"}
                                    className="h-6 text-[9px] shrink-0 font-medium px-2"
                                  >
                                    {isDnaActive 
                                      ? (language === 'zh' ? '已激活' : 'Active') 
                                      : (language === 'zh' ? '激活' : 'Activate')}
                                  </Button>
                                </div>
                              );
                            })()
                          ) : (
                            <div className="p-3 rounded-lg border border-border bg-background/25 space-y-2.5 animate-pulse">
                              <div className="h-4 w-32 bg-muted rounded" />
                              <div className="flex flex-wrap gap-1">
                                <div className="h-4 w-12 bg-muted rounded-full" />
                                <div className="h-4 w-16 bg-muted rounded-full" />
                                <div className="h-4 w-10 bg-muted rounded-full" />
                              </div>
                              <div className="flex items-center space-x-1">
                                <div className="w-3.5 h-3.5 rounded-full bg-muted" />
                                <div className="w-3.5 h-3.5 rounded-full bg-muted" />
                                <div className="w-3.5 h-3.5 rounded-full bg-muted" />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 2. Design Agent Skeletons */}
                  {msg.loadingTarget === 'garment' && (
                    <div className="p-3 rounded-lg border border-border bg-background/25 flex items-center justify-between animate-pulse">
                      <div className="flex items-center space-x-2.5 truncate mr-2 flex-1">
                        <div className="w-10 h-10 rounded bg-muted shrink-0" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 w-16 bg-muted rounded" />
                          <div className="h-4 w-28 bg-muted rounded" />
                        </div>
                      </div>
                      <div className="h-6 w-12 bg-muted rounded shrink-0" />
                    </div>
                  )}

                  {msg.loadingTarget?.startsWith('garment_edit') && (() => {
                    const parts = msg.loadingTarget.split(':')
                    const parentTitle = parts[1] || ''
                    const parentImageUrl = parts.slice(2).join(':') || ''
                    return (
                      <div className="p-3 rounded-lg border border-border bg-background/25 flex items-center justify-between animate-pulse">
                        <div className="flex items-center space-x-2.5 truncate mr-2 flex-1">
                          <div className="w-10 h-10 rounded border border-border overflow-hidden bg-muted shrink-0 relative flex items-center justify-center">
                            {parentImageUrl ? (
                              <img src={parentImageUrl} alt="" className="w-full h-full object-cover opacity-40 grayscale" />
                            ) : (
                              <div className="w-full h-full bg-muted" />
                            )}
                            <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                            </div>
                          </div>
                          <div className="truncate flex-1">
                            <div className="flex items-center space-x-1.5">
                              <span className="text-[9px] uppercase font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded tracking-wide shrink-0">
                                {language === 'zh' ? '正在重塑设计' : 'Inpainting Design'}
                              </span>
                            </div>
                            <h4 className="text-xs font-semibold mt-1 text-foreground truncate max-w-[120px] lg:max-w-[150px]">
                              {parentTitle}
                            </h4>
                          </div>
                        </div>
                        <div className="h-6 w-12 bg-muted rounded shrink-0" />
                      </div>
                    )
                  })()}

                  {msg.loadingTarget === 'fabric' && !msg.loadingStatus?.includes('subagent') && !msg.loadingStatus?.includes('waiting_') && (
                    <div className="p-3 rounded-lg border border-border bg-background/25 space-y-2.5 animate-pulse">
                      <div className="h-4 w-28 bg-muted rounded" />
                      <div className="grid grid-cols-2 gap-2">
                        <div className="h-3.5 w-full bg-muted rounded" />
                        <div className="h-3.5 w-full bg-muted rounded" />
                        <div className="h-3.5 w-full bg-muted rounded" />
                        <div className="h-3.5 w-full bg-muted rounded" />
                      </div>
                    </div>
                  )}

                  {msg.loadingTarget === 'style' && !msg.loadingStatus?.includes('subagent') && !msg.loadingStatus?.includes('waiting_') && (
                    <div className="p-3 rounded-lg border border-border bg-background/25 space-y-2.5 animate-pulse">
                      <div className="h-4 w-32 bg-muted rounded" />
                      <div className="flex flex-wrap gap-1">
                        <div className="h-4 w-12 bg-muted rounded-full" />
                        <div className="h-4 w-16 bg-muted rounded-full" />
                        <div className="h-4 w-10 bg-muted rounded-full" />
                      </div>
                      <div className="flex items-center space-x-1">
                        <div className="w-3.5 h-3.5 rounded-full bg-muted" />
                        <div className="w-3.5 h-3.5 rounded-full bg-muted" />
                        <div className="w-3.5 h-3.5 rounded-full bg-muted" />
                      </div>
                    </div>
                  )}

                  {/* Render any created card while loading is still true (e.g. main agent is generating garment, but sub-agent has already created the fabric card) */}
                  {!msg.loadingStatus?.includes('subagent') && !msg.loadingStatus?.includes('waiting_') && msg.createdFabricCard && (
                    (() => {
                      const isFabricActive = activeFabricCardId === msg.createdFabricCard.id;
                      return (
                        <div 
                          onClick={() => msg.createdFabricCard && setActiveFabricCardId(msg.createdFabricCard.id)}
                          className={`cursor-pointer rounded-lg border p-2 flex items-center justify-between transition-all duration-200 ${
                            isFabricActive 
                              ? 'bg-primary/5 border-primary/30 shadow-sm' 
                              : 'bg-background/40 border-border hover:bg-background/80 hover:border-muted-foreground/30'
                          }`}
                        >
                          <div className="flex items-center space-x-2.5 truncate mr-2">
                            {msg.createdFabricCard.image && (
                              <div className="w-10 h-10 rounded border border-border overflow-hidden bg-muted shrink-0">
                                <img src={msg.createdFabricCard.image} alt="" className="w-full h-full object-cover" />
                              </div>
                            )}
                            <div className="truncate">
                              <div className="flex items-center space-x-1.5">
                                <span className="text-[9px] uppercase font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded tracking-wide shrink-0">
                                  {language === 'zh' ? '面料卡已录入' : 'Fabric Saved'}
                                </span>
                              </div>
                              <h4 className="text-xs font-semibold mt-1 text-foreground truncate max-w-[120px] lg:max-w-[150px]">
                                {msg.createdFabricCard.name}
                              </h4>
                            </div>
                          </div>
                          <Button 
                            size="sm" 
                            type="button"
                            variant={isFabricActive ? "default" : "ghost"}
                            className="h-6 text-[9px] shrink-0 font-medium px-2"
                          >
                            {isFabricActive 
                              ? (language === 'zh' ? '已激活' : 'Active') 
                              : (language === 'zh' ? '激活' : 'Activate')}
                          </Button>
                        </div>
                      );
                    })()
                  )}

                  {!msg.loadingStatus?.includes('subagent') && !msg.loadingStatus?.includes('waiting_') && msg.createdStyleDna && (
                    (() => {
                      const isDnaActive = activeStyleDnaId === msg.createdStyleDna.id;
                      return (
                        <div 
                          onClick={() => msg.createdStyleDna && setActiveStyleDnaId(msg.createdStyleDna.id)}
                          className={`cursor-pointer rounded-lg border p-2 flex items-center justify-between transition-all duration-200 ${
                            isDnaActive 
                              ? 'bg-primary/5 border-primary/30 shadow-sm' 
                              : 'bg-background/40 border-border hover:bg-background/80 hover:border-muted-foreground/30'
                          }`}
                        >
                          <div className="truncate mr-2">
                            <div className="flex items-center space-x-1.5">
                              <span className="text-[9px] uppercase font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded tracking-wide shrink-0">
                                {language === 'zh' ? '风格 DNA 已录入' : 'Style DNA Saved'}
                              </span>
                            </div>
                            <h4 className="text-xs font-semibold mt-1 text-foreground truncate max-w-[120px] lg:max-w-[150px]">
                              {msg.createdStyleDna.name}
                            </h4>
                          </div>
                          <Button 
                            size="sm" 
                            type="button"
                            variant={isDnaActive ? "default" : "ghost"}
                            className="h-6 text-[9px] shrink-0 font-medium px-2"
                          >
                            {isDnaActive 
                              ? (language === 'zh' ? '已激活' : 'Active') 
                              : (language === 'zh' ? '激活' : 'Activate')}
                          </Button>
                        </div>
                      );
                    })()
                  )}
                </div>
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

      {/* Agent Settings Modal Overlay */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in duration-200">
          <div className="bg-background border border-border rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-5 relative text-foreground select-none">
            <button 
              type="button"
              onClick={() => setIsSettingsOpen(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <h3 className="font-outfit font-bold text-base text-foreground flex items-center gap-1.5">
                <Settings className="w-4 h-4 text-primary" />
                {language === 'zh' ? '设计 Agent 配置' : 'Agent Settings'}
              </h3>
              <p className="text-[10px] text-muted-foreground mt-1">
                {language === 'zh' ? '个性化调整您的专属服装设计助理' : 'Customize your AI fashion design assistant'}
              </p>
            </div>

            <div className="space-y-4 text-xs">
              {/* Model Choice */}
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground block">
                  {language === 'zh' ? '聊天推理模型' : 'Inference Model'}
                </label>
                <select 
                  value={settingsModel}
                  onChange={(e: any) => setSettingsModel(e.target.value)}
                  className="w-full bg-muted/60 border border-border rounded-lg px-3 py-2 outline-none focus:border-primary/50 text-foreground text-xs"
                >
                  <option value="auto">{language === 'zh' ? '智能自动路由 (推荐)' : 'Auto Routing (Recommended)'}</option>
                  <option value="gemini-3.5-flash">Gemini 3.5 Flash ({language === 'zh' ? '极速生成' : 'Fast & Snappy'})</option>
                  <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro ({language === 'zh' ? '工艺推理' : 'Deep Reasoning'})</option>
                </select>
              </div>

              {/* Chat Style */}
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground block">
                  {language === 'zh' ? '对话语气风格' : 'Conversation Style'}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSettingsStyle('default')}
                    className={`border rounded-lg py-2 text-center transition-all cursor-pointer font-semibold text-xs ${
                      settingsStyle === 'default' 
                        ? 'border-primary bg-primary/10 text-primary' 
                        : 'border-border bg-muted/30 hover:bg-muted/60 text-muted-foreground'
                    }`}
                  >
                    {language === 'zh' ? '默认风格' : 'Default'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettingsStyle('friendly')}
                    className={`border rounded-lg py-2 text-center transition-all cursor-pointer font-semibold text-xs ${
                      settingsStyle === 'friendly' 
                        ? 'border-primary bg-primary/10 text-primary' 
                        : 'border-border bg-muted/30 hover:bg-muted/60 text-muted-foreground'
                    }`}
                  >
                    {language === 'zh' ? '亲切热情' : 'Warm'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettingsStyle('professional')}
                    className={`border rounded-lg py-2 text-center transition-all cursor-pointer font-semibold text-xs ${
                      settingsStyle === 'professional' 
                        ? 'border-primary bg-primary/10 text-primary' 
                        : 'border-border bg-muted/30 hover:bg-muted/60 text-muted-foreground'
                    }`}
                  >
                    {language === 'zh' ? '专业干练' : 'Crisp'}
                  </button>
                </div>
              </div>

              {/* Image Resolution */}
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground block">
                  {language === 'zh' ? '生图分辨率' : 'Image Resolution'}
                </label>
                <select
                  value={settingsResolution}
                  onChange={(e: any) => setSettingsResolution(e.target.value)}
                  className="w-full bg-muted/60 border border-border rounded-lg px-3 py-2 outline-none focus:border-primary/50 text-foreground text-xs"
                >
                  <option value="1024x1024">{language === 'zh' ? '1K (1024 x 1024)' : '1K (1024 x 1024)'}</option>
                  <option value="2048x2048">{language === 'zh' ? '2K (2048 x 2048)' : '2K (2048 x 2048)'}</option>
                  <option value="4096x4096">{language === 'zh' ? '4K (4096 x 4096)' : '4K (4096 x 4096)'}</option>
                </select>
                <p className="text-[9px] text-muted-foreground leading-normal mt-1">
                  {language === 'zh' 
                    ? '注：Gemini 生图模型默认输出 1K 尺寸。选择 2K/4K 会在调用 API 时传入原生高分辨率参数，以提供更清晰的高清面料与款式细节表现。'
                    : 'Note: Gemini image model outputs 1K by default. Choosing 2K/4K passes native high-resolution parameters to the API to provide clearer detail representation.'}
                </p>
              </div>
            </div>

            <div className="flex space-x-2 pt-2 text-xs">
              <Button 
                variant="outline" 
                onClick={() => setIsSettingsOpen(false)}
                className="flex-1 cursor-pointer"
                disabled={savingSettings}
              >
                {language === 'zh' ? '取消' : 'Cancel'}
              </Button>
              <Button 
                onClick={handleSaveSettings}
                className="flex-1 cursor-pointer"
                disabled={savingSettings}
              >
                {savingSettings ? (language === 'zh' ? '保存中...' : 'Saving...') : (language === 'zh' ? '确认保存' : 'Save Settings')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
