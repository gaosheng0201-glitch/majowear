'use client'

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Globe, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useStudioStore } from "@/lib/store"
import { translations } from "@/lib/translations"
import AssetSidebar from "@/components/workspace/AssetSidebar"
import GarmentCanvas from "@/components/workspace/GarmentCanvas"
import AgentChat from "@/components/workspace/AgentChat"

export default function ProjectWorkspace() {
  const { id: projectId } = useParams() as { id: string }
  const router = useRouter()
  const supabase = createClient()

  // Store state
  const {
    activeProject,
    setActiveProject,
    setStyleDnas,
    setActiveStyleDnaId,
    setFabricCards,
    setActiveFabricCardId,
    setGarmentCards,
    setActiveGarment,
    setCollections,
    language,
    setLanguage
  } = useStudioStore()

  const t = translations[language]
  const [loading, setLoading] = useState(true)

  // Load project details and assets once on mount
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
        setActiveProject(projectData)

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

        // 6. Fetch Collections
        const { data: collectionData } = await supabase
          .from('collections')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })

        setCollections(collectionData || [])

      } catch (err) {
        console.error("Error loading workspace details:", err)
      } finally {
        setLoading(false)
      }
    }

    if (projectId) {
      loadWorkspaceData()
    }
  }, [
    projectId, 
    supabase, 
    router, 
    setActiveProject, 
    setStyleDnas, 
    setFabricCards, 
    setGarmentCards, 
    setActiveGarment, 
    setCollections, 
    setActiveStyleDnaId, 
    setActiveFabricCardId
  ])

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* 1. Left Sidebar - Asset Library & Modals */}
      <AssetSidebar />

      {/* 2. Main Work Area (Header + Canvas) */}
      <main className="flex-1 flex flex-col relative bg-muted/20 overflow-hidden">
        {/* Header toolbar */}
        <header className="h-14 border-b border-border flex items-center justify-between px-4 bg-background/50 backdrop-blur-md shrink-0 animate-in fade-in-30">
          <div className="flex items-center space-x-3">
            <Link href="/" className="hover:text-primary transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="font-outfit font-semibold truncate text-sm">
              {loading ? t.loading : activeProject?.name || "Project Workspace"}
            </h1>
          </div>

          <div className="flex items-center space-x-4">
            {/* Language Switcher */}
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
              className="flex items-center gap-1.5 h-8"
            >
              <Globe className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium font-sans">
                {language === 'zh' ? 'EN' : '中文'}
              </span>
            </Button>
          </div>
        </header>

        {/* Workspace Design Canvas */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center">
          {loading ? (
            <div className="text-center">
              <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-4" />
              <p className="text-muted-foreground text-sm">{t.loading}</p>
            </div>
          ) : (
            <GarmentCanvas />
          )}
        </div>
      </main>

      {/* 3. Right Sidebar - AI Assistant Chat Panel */}
      <AgentChat />
    </div>
  )
}
