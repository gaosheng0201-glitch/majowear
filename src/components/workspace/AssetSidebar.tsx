'use client'

import { useState } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { 
  PlusCircle, 
  Loader2, 
  Check, 
  AlertCircle, 
  X,
  FolderOpen,
  Shirt,
  Tags
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useStudioStore, StyleDna, FabricCard, Collection } from "@/lib/store"
import { translations } from "@/lib/translations"

export default function AssetSidebar() {
  const { id: projectId } = useParams() as { id: string }
  const supabase = createClient()

  // Store state
  const {
    styleDnas,
    addStyleDna,
    fabricCards,
    addFabricCard,
    garmentCards,
    activeStyleDnaId,
    setActiveStyleDnaId,
    activeFabricCardId,
    setActiveFabricCardId,
    activeGarment,
    setActiveGarment,
    collections,
    addCollection,
    language
  } = useStudioStore()

  const t = translations[language]

  // Modal States
  const [isStyleModalOpen, setIsStyleModalOpen] = useState(false)
  const [isFabricModalOpen, setIsFabricModalOpen] = useState(false)
  const [isCollectionModalOpen, setIsCollectionModalOpen] = useState(false)
  
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

  // Collection Form state
  const [colName, setColName] = useState("")
  const [colDesc, setColDesc] = useState("")
  const [colLoading, setColLoading] = useState(false)
  const [colError, setColError] = useState<string | null>(null)

  // Active filter
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null)

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
      const uploadedUrls: string[] = []
      for (let i = 0; i < styleFiles.length; i++) {
        const file = styleFiles[i]
        const url = await uploadFileToStorage(file, 'styles')
        uploadedUrls.push(url)
      }

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
      const swatchUrl = await uploadFileToStorage(fabricFile, 'fabrics')

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

  // Handle Collection creation
  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!colName.trim()) {
      setColError("Collection name is required.")
      return
    }

    setColLoading(true)
    setColError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("No authenticated session")

      const { data, error } = await supabase
        .from('collections')
        .insert({
          user_id: user.id,
          project_id: projectId,
          name: colName,
          description: colDesc || null,
          garment_ids: []
        })
        .select()
        .single()

      if (error) throw error

      addCollection(data)
      setIsCollectionModalOpen(false)
      setColName("")
      setColDesc("")
    } catch (err: any) {
      console.error(err)
      setColError(err.message || "Failed to create collection.")
    } finally {
      setColLoading(false)
    }
  }

  // Filter garments by selected collection
  const activeCollection = collections.find(c => c.id === selectedCollectionId)
  const filteredGarments = selectedCollectionId && activeCollection
    ? garmentCards.filter(g => activeCollection.garment_ids.includes(g.id))
    : garmentCards

  return (
    <aside className="w-66 border-r border-border bg-card/50 flex flex-col hidden md:flex shrink-0">
      <div className="p-4 border-b border-border flex items-center space-x-2">
        <Tags className="w-5 h-5 text-primary" />
        <span className="font-outfit font-semibold text-sm truncate uppercase tracking-wider">{language === 'zh' ? '设计资产库' : 'Asset Library'}</span>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Style DNA Library */}
        <div>
          <div className="flex items-center justify-between mb-2">
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
                    className="w-full justify-between text-left text-sm h-auto py-1.5 px-2.5 align-middle"
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
          <div className="flex items-center justify-between mb-2">
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
                    className="w-full justify-between text-left text-sm h-auto py-1.5 px-2.5 align-middle"
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

        {/* Collections (Folder groups) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t.collections}</h3>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setIsCollectionModalOpen(true)}
              className="h-6 w-6 text-primary hover:bg-primary/10"
            >
              <PlusCircle className="w-4 h-4" />
            </Button>
          </div>

          {collections.length === 0 ? (
            <p className="text-xs text-muted-foreground italic px-2">{t.noCollectionHelp}</p>
          ) : (
            <ul className="space-y-1 mb-4">
              <li>
                <Button 
                  variant={selectedCollectionId === null ? "secondary" : "ghost"}
                  className="w-full justify-start text-left text-sm h-auto py-1.5 px-2.5"
                  onClick={() => setSelectedCollectionId(null)}
                >
                  <FolderOpen className="w-3.5 h-3.5 mr-2 text-primary" />
                  <span className="truncate">{language === 'zh' ? '所有设计款式' : 'All Generated Designs'}</span>
                </Button>
              </li>
              {collections.map((col) => (
                <li key={col.id}>
                  <Button 
                    variant={selectedCollectionId === col.id ? "secondary" : "ghost"}
                    className="w-full justify-start text-left text-sm h-auto py-1.5 px-2.5"
                    onClick={() => setSelectedCollectionId(col.id)}
                  >
                    <FolderOpen className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                    <span className="truncate">{col.name} ({col.garment_ids?.length || 0})</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Garments Collection list */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            {selectedCollectionId && activeCollection ? `${activeCollection.name}` : (language === 'zh' ? '所有生成款式' : 'Garments List')}
          </h3>
          {filteredGarments.length === 0 ? (
            <p className="text-xs text-muted-foreground italic px-2">{t.noGarmentsHelp}</p>
          ) : (
            <ul className="space-y-1">
              {filteredGarments.map((garment) => (
                <li key={garment.id}>
                  <Button 
                    variant={activeGarment?.id === garment.id ? "secondary" : "ghost"}
                    className="w-full justify-start text-left text-sm h-auto py-1.5 px-2.5 text-ellipsis"
                    onClick={() => setActiveGarment(garment)}
                  >
                    <Shirt className="w-3.5 h-3.5 mr-2 text-primary shrink-0" />
                    <span className="truncate">{garment.title}</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

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

      {/* Collection Creation Modal */}
      {isCollectionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-300">
          <div className="w-full max-w-md bg-card border border-border rounded-xl p-6 shadow-2xl relative animate-in fade-in-50 zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-outfit font-bold">{t.createCollection}</h3>
              <Button variant="ghost" size="icon" onClick={() => setIsCollectionModalOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            <form onSubmit={handleCreateCollection} className="space-y-4">
              {colError && (
                <div className="flex items-center space-x-2 text-xs bg-destructive/15 text-destructive p-3 rounded-lg border border-destructive/20">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{colError}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="colName">{t.collectionName}</Label>
                <Input
                  id="colName"
                  placeholder="e.g. 2026 Spring Jackets"
                  value={colName}
                  onChange={(e) => setColName(e.target.value)}
                  required
                  className="bg-muted/50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="colDesc">{t.collectionDesc}</Label>
                <Input
                  id="colDesc"
                  placeholder="e.g. Techwear windbreakers and outerwear"
                  value={colDesc}
                  onChange={(e) => setColDesc(e.target.value)}
                  className="bg-muted/50"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsCollectionModalOpen(false)}
                  disabled={colLoading}
                >
                  {t.cancel}
                </Button>
                <Button type="submit" disabled={colLoading}>
                  {colLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <span>{t.create}</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </aside>
  )
}
