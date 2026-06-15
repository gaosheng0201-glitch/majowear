'use client'

import { useEffect, useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { 
  ArrowLeft, 
  Sparkles, 
  SlidersHorizontal, 
  Image as ImageIcon, 
  Shirt, 
  PlusCircle, 
  Loader2, 
  Send, 
  Check, 
  AlertCircle, 
  FileText, 
  X,
  Maximize2,
  Globe
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useStudioStore, StyleDna, FabricCard, GarmentCard, Project } from "@/lib/store"
import { translations } from "@/lib/translations"

interface ChatMessage {
  id: string
  role: 'agent' | 'user'
  text: string
  garmentCard?: GarmentCard
  loading?: boolean
  error?: boolean
}

export default function ProjectWorkspace() {
  const { id: projectId } = useParams() as { id: string }
  const router = useRouter()
  const supabase = createClient()

  // Store state
  const {
    styleDnas,
    setStyleDnas,
    addStyleDna,
    fabricCards,
    setFabricCards,
    addFabricCard,
    garmentCards,
    setGarmentCards,
    addGarmentCard,
    activeStyleDnaId,
    setActiveStyleDnaId,
    activeFabricCardId,
    setActiveFabricCardId,
    language,
    setLanguage
  } = useStudioStore()

  // Translations
  const t = translations[language]

  // Local UI state
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeGarment, setActiveGarment] = useState<GarmentCard | null>(null)
  
  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState("")
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Upload/Modal States
  const [isStyleModalOpen, setIsStyleModalOpen] = useState(false)
  const [isFabricModalOpen, setIsFabricModalOpen] = useState(false)
  
  // Style DNA Upload Form state
  const [styleName, setStyleName] = useState("")
  const [styleFiles, setStyleFiles] = useState<FileList | null>(null)
  const [styleUploadLoading, setStyleUploadLoading] = useState(false)
  const [styleFormError, setStyleFormError] = useState<string | null>(null)

  // Fabric Card Upload Form state
  const [fabricName, setFabricName] = useState("")
  const [fabricComp, setFabricComp] = useState("")
  const [fabricWeight, setFabricWeight] = useState("")
  const [fabricFile, setFabricFile] = useState<File | null>(null)
  const [fabricUploadLoading, setFabricUploadLoading] = useState(false)
  const [fabricFormError, setFabricFormError] = useState<string | null>(null)

  // Display configuration
  const [displayMode, setDisplayMode] = useState<'white_background' | 'on_body'>('white_background')
  const [imageGenModel, setImageGenModel] = useState<string>('gemini-3.1-flash-image')

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Sync initial welcome message translation when language changes
  useEffect(() => {
    setMessages([
      {
        id: 'welcome',
        role: 'agent',
        text: translations[language].agentIntro
      }
    ])
  }, [language])

  // Load project details and assets
  useEffect(() => {
    async function loadWorkspaceData() {
      try {
        setLoading(true)
        
        // 1. Verify User Session
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError || !user) {
          router.push('/login')
          return
        }

        // 2. Fetch Project Info
        const { data: projectData, error: projectError } = await supabase
          .from('projects')
          .select('*')
          .eq('id', projectId)
          .single()

        if (projectError || !projectData) {
          console.error("Project not found", projectError)
          router.push('/')
          return
        }
        setProject(projectData)

        // 3. Fetch Style DNAs
        const { data: styleData } = await supabase
          .from('style_dnas')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
        
        setStyleDnas(styleData || [])
        if (styleData && styleData.length > 0) {
          setActiveStyleDnaId(styleData[0].id)
        }

        // 4. Fetch Fabric Cards
        const { data: fabricData } = await supabase
          .from('fabric_cards')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
        
        setFabricCards(fabricData || [])
        if (fabricData && fabricData.length > 0) {
          setActiveFabricCardId(fabricData[0].id)
        }

        // 5. Fetch Garment Cards
        const { data: garmentData } = await supabase
          .from('garment_cards')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
        
        setGarmentCards(garmentData || [])
        if (garmentData && garmentData.length > 0) {
          setActiveGarment(garmentData[0])
        }

      } catch (err) {
        console.error("Error loading workspace details:", err)
      } finally {
        setLoading(false)
      }
    }

    if (projectId) {
      loadWorkspaceData()
    }
  }, [projectId, supabase, router, setStyleDnas, setFabricCards, setGarmentCards, setActiveStyleDnaId, setActiveFabricCardId])

  // Helper function to upload file to Storage
  const uploadFileToStorage = async (file: File, folderName: string): Promise<string> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("No authenticated user session")

    const fileExt = file.name.split('.').pop()
    const fileName = `${user.id}/${folderName}/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`

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

    return publicUrl
  }

  // Handle Style DNA creation
  const handleCreateStyleDna = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!styleName.trim() || !styleFiles || styleFiles.length === 0) {
      setStyleFormError("Style name and reference images are required.")
      return
    }

    setStyleUploadLoading(true)
    setStyleFormError(null)

    try {
      // 1. Upload reference images to Storage
      const uploadedUrls: string[] = []
      for (let i = 0; i < styleFiles.length; i++) {
        const file = styleFiles[i]
        const url = await uploadFileToStorage(file, 'styles')
        uploadedUrls.push(url)
      }

      // 2. Call AI parsing route
      const response = await fetch('/api/analyze-style', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrls: uploadedUrls,
          projectId
        })
      })

      const result = await response.json()
      if (!response.ok || result.error) {
        throw new Error(result.error || "AI failed to extract style features.")
      }

      // 3. Add to store, set active and reset form
      addStyleDna(result.data)
      setActiveStyleDnaId(result.data.id)
      setIsStyleModalOpen(false)
      setStyleName("")
      setStyleFiles(null)
    } catch (err: any) {
      console.error(err)
      setStyleFormError(err.message || "Something went wrong.")
    } finally {
      setStyleUploadLoading(false)
    }
  }

  // Handle Fabric Card creation
  const handleCreateFabricCard = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fabricName.trim() || !fabricFile) {
      setFabricFormError("Fabric name and a swatch image are required.")
      return
    }

    setFabricUploadLoading(true)
    setFabricFormError(null)

    try {
      // 1. Upload swatch image to Storage
      const swatchUrl = await uploadFileToStorage(fabricFile, 'fabrics')

      // 2. Call AI parsing route
      const response = await fetch('/api/analyze-fabric', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fabricName,
          imageUrl: swatchUrl,
          composition: fabricComp || undefined,
          weightGsm: fabricWeight ? parseInt(fabricWeight) : undefined,
          projectId
        })
      })

      const result = await response.json()
      if (!response.ok || result.error) {
        throw new Error(result.error || "AI failed to analyze fabric.")
      }

      // 3. Add to store, set active and reset form
      addFabricCard(result.data)
      setActiveFabricCardId(result.data.id)
      setIsFabricModalOpen(false)
      setFabricName("")
      setFabricComp("")
      setFabricWeight("")
      setFabricFile(null)
    } catch (err: any) {
      console.error(err)
      setFabricFormError(err.message || "Something went wrong.")
    } finally {
      setFabricUploadLoading(false)
    }
  }

  // Handle Design Agent Request
  const handleSendPrompt = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim() || chatLoading) return

    const promptText = chatInput
    setChatInput("")
    setChatLoading(true)

    // Add user message
    const userMsgId = Date.now().toString()
    setMessages(prev => [...prev, { id: userMsgId, role: 'user', text: promptText }])

    // Add agent thinking placeholder
    const agentMsgId = (Date.now() + 1).toString()
    setMessages(prev => [...prev, { 
      id: agentMsgId, 
      role: 'agent', 
      text: language === 'zh' 
        ? '正在处理您的指令，提取风格与面料特征并调用画质渲染模型。请稍候，这大约需要 10-15 秒...' 
        : 'Processing your prompt, synthesizing styles, and calling image rendering models. Please wait, this may take 10-15 seconds...',
      loading: true
    }])

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
      setMessages(prev => prev.map(msg => {
        if (msg.id === agentMsgId) {
          const introText = language === 'zh' 
            ? `我已为您生成了 "${generatedGarment.title}" 的设计款式卡。以下是设计原理：`
            : `I have generated the design card for "${generatedGarment.title}". Here is the design rationale:`;
          return {
            ...msg,
            loading: false,
            text: `${introText}\n\n${generatedGarment.design_rationale}`,
            garmentCard: generatedGarment
          }
        }
        return msg
      }))

    } catch (err: any) {
      console.error(err)
      setMessages(prev => prev.map(msg => {
        if (msg.id === agentMsgId) {
          return {
            ...msg,
            loading: false,
            error: true,
            text: `${language === 'zh' ? '设计生成失败：' : 'Failed to generate design: '}${err.message || "An unexpected error occurred."}`
          }
        }
        return msg
      }))
    } finally {
      setChatLoading(false)
    }
  }

  // Active Style DNA object helper
  const selectedStyleDna = styleDnas.find(dna => dna.id === activeStyleDnaId)
  // Active Fabric Card object helper
  const selectedFabricCard = fabricCards.find(fab => fab.id === activeFabricCardId)

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Left Sidebar - Asset Library */}
      <aside className="w-64 border-r border-border bg-card/50 flex flex-col hidden md:flex shrink-0">
        <div className="p-4 border-b border-border flex items-center space-x-3">
          <Link href="/" className="hover:text-primary transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h2 className="font-outfit font-semibold truncate">
            {loading ? t.loading : project?.name || "Project Workspace"}
          </h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Style DNA Library */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t.styleDna}</h3>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setIsStyleModalOpen(true)}
                className="h-6 w-6 text-primary hover:bg-primary/10"
              >
                <PlusCircle className="w-4 h-4" />
              </Button>
            </div>
            
            {styleDnas.length === 0 ? (
              <p className="text-xs text-muted-foreground italic px-2">{t.noStylesHelp}</p>
            ) : (
              <ul className="space-y-1">
                {styleDnas.map((style) => (
                  <li key={style.id}>
                    <Button 
                      variant={activeStyleDnaId === style.id ? "secondary" : "ghost"}
                      className="w-full justify-between text-left text-sm h-auto py-2 px-3 align-middle"
                      onClick={() => setActiveStyleDnaId(style.id)}
                    >
                      <span className="truncate pr-2">{style.name}</span>
                      {activeStyleDnaId === style.id && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Fabric Library */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t.fabricLibrary}</h3>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setIsFabricModalOpen(true)}
                className="h-6 w-6 text-primary hover:bg-primary/10"
              >
                <PlusCircle className="w-4 h-4" />
              </Button>
            </div>

            {fabricCards.length === 0 ? (
              <p className="text-xs text-muted-foreground italic px-2">{t.noFabricsHelp}</p>
            ) : (
              <ul className="space-y-1">
                {fabricCards.map((fabric) => (
                  <li key={fabric.id}>
                    <Button 
                      variant={activeFabricCardId === fabric.id ? "secondary" : "ghost"}
                      className="w-full justify-between text-left text-sm h-auto py-2 px-3 align-middle"
                      onClick={() => setActiveFabricCardId(fabric.id)}
                    >
                      <span className="truncate pr-2">{fabric.name}</span>
                      {activeFabricCardId === fabric.id && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Garments Collection list */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t.collections}</h3>
            {garmentCards.length === 0 ? (
              <p className="text-sm text-muted-foreground italic px-2">{t.noGarmentsHelp}</p>
            ) : (
              <ul className="space-y-1">
                {garmentCards.map((garment) => (
                  <li key={garment.id}>
                    <Button 
                      variant={activeGarment?.id === garment.id ? "secondary" : "ghost"}
                      className="w-full justify-start text-left text-sm h-auto py-2 px-3 text-ellipsis"
                      onClick={() => setActiveGarment(garment)}
                    >
                      <Shirt className="w-4 h-4 mr-2 text-primary shrink-0" />
                      <span className="truncate">{garment.title}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </aside>

      {/* Center Canvas - Working Area */}
      <main className="flex-1 flex flex-col relative bg-muted/20 overflow-hidden">
        <header className="h-14 border-b border-border flex items-center justify-between px-4 bg-background/50 backdrop-blur-md shrink-0 animate-in fade-in-30">
          <div className="flex items-center space-x-2">
            <h1 className="font-outfit font-medium">{t.canvas}</h1>
            {activeGarment && (
              <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full font-mono">
                {activeGarment.category}
              </span>
            )}
          </div>
          <div className="flex items-center space-x-4">
            {/* Language Switcher */}
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
              className="flex items-center gap-1"
            >
              <Globe className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">
                {language === 'zh' ? 'EN' : '中文'}
              </span>
            </Button>

            <div className="flex items-center space-x-2 text-xs">
              <span className="text-muted-foreground">{t.layout}:</span>
              <select 
                value={displayMode}
                onChange={(e: any) => setDisplayMode(e.target.value)}
                className="bg-card border border-border rounded px-2 py-1 focus:ring-1 focus:ring-primary"
              >
                <option value="white_background">{t.studioFlatLay}</option>
                <option value="on_body">{t.onBodyModel}</option>
              </select>
            </div>
            
            <div className="flex items-center space-x-2 text-xs">
              <span className="text-muted-foreground">{t.model}:</span>
              <select 
                value={imageGenModel}
                onChange={(e: any) => setImageGenModel(e.target.value)}
                className="bg-card border border-border rounded px-2 py-1 focus:ring-1 focus:ring-primary"
              >
                <option value="gemini-3.1-flash-image">{t.geminiImage31}</option>
                <option value="gemini-3-pro-image">{t.geminiImage3Pro}</option>
              </select>
            </div>
          </div>
        </header>
        
        <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center">
          {loading ? (
            <div className="text-center">
              <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-4" />
              <p className="text-muted-foreground text-sm">{t.loading}</p>
            </div>
          ) : activeGarment ? (
            <div className="w-full max-w-4xl bg-card border border-border rounded-2xl overflow-hidden shadow-xl flex flex-col lg:flex-row h-auto lg:h-[calc(100vh-12rem)] animate-in fade-in-30 duration-300">
              {/* Garment Image view */}
              <div className="lg:w-1/2 bg-muted relative flex items-center justify-center min-h-[300px] lg:min-h-0">
                {activeGarment.images?.[0] ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src={activeGarment.images[0]} 
                      alt={activeGarment.title} 
                      className="object-contain w-full h-full max-h-[50vh] lg:max-h-full animate-in fade-in duration-300"
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

              {/* Garment details spec sheet */}
              <div className="lg:w-1/2 p-6 overflow-y-auto border-t lg:border-t-0 lg:border-l border-border flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-2xl font-outfit font-bold">{activeGarment.title}</h2>
                    <span className="text-xs bg-muted border border-border px-2.5 py-1 rounded-md font-medium capitalize">
                      {activeGarment.category}
                    </span>
                  </div>

                  {/* Rationale */}
                  <div className="mb-6">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center">
                      <Sparkles className="w-3.5 h-3.5 text-primary mr-1" /> {t.designRationale}
                    </h4>
                    <p className="text-sm text-foreground/90 bg-muted/30 p-3 rounded-lg border border-border/50 leading-relaxed whitespace-pre-line">
                      {activeGarment.design_rationale}
                    </p>
                  </div>

                  {/* Schema specifications */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center">
                      <FileText className="w-3.5 h-3.5 text-primary mr-1" /> {language === 'zh' ? '设计参数表 / Specification' : 'Specifications'}
                    </h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="bg-muted/40 p-2.5 rounded-lg border border-border/50">
                        <span className="text-xs text-muted-foreground block">{t.fit}</span>
                        <span className="font-medium">{activeGarment.schema?.fit || 'Regular'}</span>
                      </div>
                      <div className="bg-muted/40 p-2.5 rounded-lg border border-border/50">
                        <span className="text-xs text-muted-foreground block">{t.collar}</span>
                        <span className="font-medium">{activeGarment.schema?.collar || 'Classic'}</span>
                      </div>
                      <div className="bg-muted/40 p-2.5 rounded-lg border border-border/50">
                        <span className="text-xs text-muted-foreground block">{t.sleeves}</span>
                        <span className="font-medium">{activeGarment.schema?.sleeves || 'Standard'}</span>
                      </div>
                      <div className="bg-muted/40 p-2.5 rounded-lg border border-border/50">
                        <span className="text-xs text-muted-foreground block">{t.pockets}</span>
                        <span className="font-medium">{activeGarment.schema?.pockets || 'None'}</span>
                      </div>
                      <div className="col-span-2 bg-muted/40 p-2.5 rounded-lg border border-border/50">
                        <span className="text-xs text-muted-foreground block">{t.closures}</span>
                        <span className="font-medium">{activeGarment.schema?.closures || 'None'}</span>
                      </div>
                    </div>

                    {/* Highlights */}
                    {activeGarment.schema?.details && activeGarment.schema.details.length > 0 && (
                      <div className="mt-4">
                        <span className="text-xs text-muted-foreground block mb-2">{t.details}</span>
                        <div className="flex flex-wrap gap-1.5">
                          {activeGarment.schema.details.map((detail, index) => (
                            <span 
                              key={index} 
                              className="text-xs bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded-md"
                            >
                              {detail}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-8 pt-4 border-t border-border/60 text-[10px] text-muted-foreground flex justify-between items-center">
                  <span className="truncate max-w-[200px]">Prompt: {activeGarment.prompt}</span>
                  <span>{t.created} {new Date(activeGarment.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          ) : (
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
                  <span className={`w-2 h-2 rounded-full ${selectedStyleDna ? 'bg-green-500' : 'bg-amber-500'}`} />
                  <span>{t.styleDnaSelected} <strong>{selectedStyleDna?.name || t.none}</strong></span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`w-2 h-2 rounded-full ${selectedFabricCard ? 'bg-green-500' : 'bg-amber-500'}`} />
                  <span>{t.fabricSelected} <strong>{selectedFabricCard?.name || t.none}</strong></span>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Right Sidebar - Agent Chat */}
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
              <p className="leading-relaxed whitespace-pre-line">{msg.text}</p>
              
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
              className="flex-1 bg-muted/50 focus-visible:ring-primary/50"
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

      {/* Style DNA Upload Modal */}
      {isStyleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-300">
          <div className="w-full max-w-md bg-card border border-border rounded-xl p-6 shadow-2xl relative animate-in fade-in-50 zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-outfit font-bold">{t.addStyleDna}</h3>
              <Button variant="ghost" size="icon" onClick={() => setIsStyleModalOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            <form onSubmit={handleCreateStyleDna} className="space-y-4">
              {styleFormError && (
                <div className="flex items-center space-x-2 text-xs bg-destructive/15 text-destructive p-3 rounded-lg border border-destructive/20">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{styleFormError}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="styleName">{t.styleFormName}</Label>
                <Input
                  id="styleName"
                  placeholder="e.g. Techwear Gorpcore, Minimalist Drape"
                  value={styleName}
                  onChange={(e) => setStyleName(e.target.value)}
                  required
                  className="bg-muted/50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="styleFiles">{t.styleFormImages}</Label>
                <Input
                  id="styleFiles"
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => setStyleFiles(e.target.files)}
                  required
                  className="bg-muted/50 cursor-pointer"
                />
                <p className="text-[10px] text-muted-foreground">{t.styleFormFilesHelp}</p>
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsStyleModalOpen(false)}
                  disabled={styleUploadLoading}
                >
                  {t.cancel}
                </Button>
                <Button type="submit" disabled={styleUploadLoading}>
                  {styleUploadLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <span>{t.analyzeStyleBtn}</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fabric Card Upload Modal */}
      {isFabricModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-300">
          <div className="w-full max-w-md bg-card border border-border rounded-xl p-6 shadow-2xl relative animate-in fade-in-50 zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-outfit font-bold">{t.addFabricTitle}</h3>
              <Button variant="ghost" size="icon" onClick={() => setIsFabricModalOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            <form onSubmit={handleCreateFabricCard} className="space-y-4">
              {fabricFormError && (
                <div className="flex items-center space-x-2 text-xs bg-destructive/15 text-destructive p-3 rounded-lg border border-destructive/20">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{fabricFormError}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="fabricName">{t.fabricFormName}</Label>
                <Input
                  id="fabricName"
                  placeholder="e.g. Tyvek Waterproof Ripstop"
                  value={fabricName}
                  onChange={(e) => setFabricName(e.target.value)}
                  required
                  className="bg-muted/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="fabricComp">{t.fabricFormComp}</Label>
                  <Input
                    id="fabricComp"
                    placeholder="e.g. 100% Nylon"
                    value={fabricComp}
                    onChange={(e) => setFabricComp(e.target.value)}
                    className="bg-muted/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fabricWeight">{t.fabricFormWeight}</Label>
                  <Input
                    id="fabricWeight"
                    type="number"
                    placeholder="e.g. 120"
                    value={fabricWeight}
                    onChange={(e) => setFabricWeight(e.target.value)}
                    className="bg-muted/50"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fabricFile">{t.fabricFormImage}</Label>
                <Input
                  id="fabricFile"
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const files = e.target.files
                    if (files && files.length > 0) {
                      setFabricFile(files[0])
                    }
                  }}
                  required
                  className="bg-muted/50 cursor-pointer"
                />
                <p className="text-[10px] text-muted-foreground">{t.fabricFormImageHelp}</p>
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsFabricModalOpen(false)}
                  disabled={fabricUploadLoading}
                >
                  {t.cancel}
                </Button>
                <Button type="submit" disabled={fabricUploadLoading}>
                  {fabricUploadLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <span>{t.analyzeFabricBtn}</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
