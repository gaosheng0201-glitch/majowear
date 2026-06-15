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
  Tags,
  Edit3
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
    updateStyleDna,
    fabricCards,
    addFabricCard,
    updateFabricCard,
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

  // Edit Style DNA Form State
  const [editingStyle, setEditingStyle] = useState<StyleDna | null>(null)
  const [editStyleName, setEditStyleName] = useState("")
  const [editStyleKeywords, setEditStyleKeywords] = useState("")
  const [editStyleColors, setEditStyleColors] = useState("")
  const [editStyleSilhouettes, setEditStyleSilhouettes] = useState("")
  const [editStyleMaterials, setEditStyleMaterials] = useState("")
  const [editStyleDetails, setEditStyleDetails] = useState("")
  const [editStyleAvoid, setEditStyleAvoid] = useState("")
  const [editStyleLoading, setEditStyleLoading] = useState(false)
  const [editStyleError, setEditStyleError] = useState<string | null>(null)

  // Edit Fabric Card Form State
  const [editingFabric, setEditingFabric] = useState<FabricCard | null>(null)
  const [editFabricName, setEditFabricName] = useState("")
  const [editFabricComposition, setEditFabricComposition] = useState("")
  const [editFabricWeight, setEditFabricWeight] = useState("")
  const [editFabricTexture, setEditFabricTexture] = useState("")
  const [editFabricDrape, setEditFabricDrape] = useState("")
  const [editFabricStretch, setEditFabricStretch] = useState("")
  const [editFabricSheen, setEditFabricSheen] = useState("")
  const [editFabricTransparency, setEditFabricTransparency] = useState("")
  const [editFabricPromptDesc, setEditFabricPromptDesc] = useState("")
  const [editFabricLoading, setEditFabricLoading] = useState(false)
  const [editFabricError, setEditFabricError] = useState<string | null>(null)

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

  const handleOpenStyleEdit = (style: StyleDna) => {
    setEditingStyle(style)
    setEditStyleName(style.name)
    setEditStyleKeywords(style.keywords ? style.keywords.join(", ") : "")
    setEditStyleColors(style.colors ? style.colors.join(", ") : "")
    setEditStyleSilhouettes(style.silhouettes ? style.silhouettes.join(", ") : "")
    setEditStyleMaterials(style.materials ? style.materials.join(", ") : "")
    setEditStyleDetails(style.details ? style.details.join(", ") : "")
    setEditStyleAvoid(style.avoid ? style.avoid.join(", ") : "")
    setEditStyleError(null)
  }

  const handleUpdateStyleDna = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingStyle) return
    setEditStyleLoading(true)
    setEditStyleError(null)
    try {
      const updatedStyleData = {
        name: editStyleName,
        keywords: editStyleKeywords.split(',').map(s => s.trim()).filter(Boolean),
        colors: editStyleColors.split(',').map(s => s.trim()).filter(Boolean),
        silhouettes: editStyleSilhouettes.split(',').map(s => s.trim()).filter(Boolean),
        materials: editStyleMaterials.split(',').map(s => s.trim()).filter(Boolean),
        details: editStyleDetails.split(',').map(s => s.trim()).filter(Boolean),
        avoid: editStyleAvoid.split(',').map(s => s.trim()).filter(Boolean),
        updated_at: new Date().toISOString()
      }
      
      const { data, error } = await supabase
        .from('style_dnas')
        .update(updatedStyleData)
        .eq('id', editingStyle.id)
        .select()
        .single()
        
      if (error) throw error
      
      updateStyleDna(data)
      setEditingStyle(null)
    } catch (err: any) {
      console.error(err)
      setEditStyleError(err.message || "Failed to update Style DNA")
    } finally {
      setEditStyleLoading(false)
    }
  }

  const handleOpenFabricEdit = (fabric: FabricCard) => {
    setEditingFabric(fabric)
    setEditFabricName(fabric.name || "")
    setEditFabricComposition(fabric.composition || "")
    setEditFabricWeight(fabric.weight_gsm ? fabric.weight_gsm.toString() : "")
    setEditFabricTexture(fabric.texture || "")
    setEditFabricDrape(fabric.drape || "")
    setEditFabricStretch(fabric.stretch || "")
    setEditFabricSheen(fabric.sheen || "")
    setEditFabricTransparency(fabric.transparency || "")
    setEditFabricPromptDesc(fabric.prompt_description || "")
    setEditFabricError(null)
  }

  const handleUpdateFabricCard = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingFabric) return
    setEditFabricLoading(true)
    setEditFabricError(null)
    try {
      const updatedFabricData = {
        name: editFabricName,
        composition: editFabricComposition,
        weight_gsm: editFabricWeight ? parseInt(editFabricWeight) : null,
        texture: editFabricTexture,
        drape: editFabricDrape,
        stretch: editFabricStretch,
        sheen: editFabricSheen,
        transparency: editFabricTransparency,
        prompt_description: editFabricPromptDesc
      }
      
      const { data, error } = await supabase
        .from('fabric_cards')
        .update(updatedFabricData)
        .eq('id', editingFabric.id)
        .select()
        .single()
        
      if (error) throw error
      
      updateFabricCard(data)
      setEditingFabric(null)
    } catch (err: any) {
      console.error(err)
      setEditFabricError(err.message || "Failed to update Fabric Card")
    } finally {
      setEditFabricLoading(false)
    }
  }

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
                <li key={style.id} className="group flex items-center justify-between space-x-1">
                  <Button 
                    variant={activeStyleDnaId === style.id ? "secondary" : "ghost"}
                    className="flex-1 justify-start text-left text-sm h-auto py-1.5 px-2.5 align-middle truncate"
                    onClick={() => setActiveStyleDnaId(style.id)}
                  >
                    <span className="truncate pr-2 flex-1">{style.name}</span>
                    {activeStyleDnaId === style.id && <Check className="w-3.5 h-3.5 text-primary shrink-0 ml-auto" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-7 h-7 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-muted shrink-0"
                    onClick={() => handleOpenStyleEdit(style)}
                  >
                    <Edit3 className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
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
                <li key={fabric.id} className="group flex items-center justify-between space-x-1">
                  <Button 
                    variant={activeFabricCardId === fabric.id ? "secondary" : "ghost"}
                    className="flex-1 justify-start text-left text-sm h-auto py-1.5 px-2.5 align-middle truncate"
                    onClick={() => setActiveFabricCardId(fabric.id)}
                  >
                    <span className="truncate pr-2 flex-1">{fabric.name}</span>
                    {activeFabricCardId === fabric.id && <Check className="w-3.5 h-3.5 text-primary shrink-0 ml-auto" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-7 h-7 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-muted shrink-0"
                    onClick={() => handleOpenFabricEdit(fabric)}
                  >
                    <Edit3 className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
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
      {/* Style DNA Edit Modal */}
      {editingStyle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-300">
          <div className="w-full max-w-lg bg-card border border-border rounded-xl p-6 shadow-2xl relative animate-in fade-in-50 zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-outfit font-bold">{language === 'zh' ? '编辑风格基因' : 'Edit Style DNA'}</h3>
              <Button variant="ghost" size="icon" onClick={() => setEditingStyle(null)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            <form onSubmit={handleUpdateStyleDna} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {editStyleError && (
                <div className="flex items-center space-x-2 text-xs bg-destructive/15 text-destructive p-3 rounded-lg border border-destructive/20">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{editStyleError}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="editStyleName">{t.styleFormName}</Label>
                <Input
                  id="editStyleName"
                  value={editStyleName}
                  onChange={(e) => setEditStyleName(e.target.value)}
                  required
                  className="bg-muted/50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="editStyleKeywords">{language === 'zh' ? '风格关键词 (逗号分隔)' : 'Keywords (comma separated)'}</Label>
                <Input
                  id="editStyleKeywords"
                  value={editStyleKeywords}
                  onChange={(e) => setEditStyleKeywords(e.target.value)}
                  className="bg-muted/50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="editStyleColors">{language === 'zh' ? '色彩搭配 (逗号分隔)' : 'Colors (comma separated)'}</Label>
                <Input
                  id="editStyleColors"
                  value={editStyleColors}
                  onChange={(e) => setEditStyleColors(e.target.value)}
                  className="bg-muted/50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="editStyleSilhouettes">{language === 'zh' ? '廓形特点 (逗号分隔)' : 'Silhouettes (comma separated)'}</Label>
                <Input
                  id="editStyleSilhouettes"
                  value={editStyleSilhouettes}
                  onChange={(e) => setEditStyleSilhouettes(e.target.value)}
                  className="bg-muted/50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="editStyleMaterials">{language === 'zh' ? '面料材质 (逗号分隔)' : 'Materials (comma separated)'}</Label>
                <Input
                  id="editStyleMaterials"
                  value={editStyleMaterials}
                  onChange={(e) => setEditStyleMaterials(e.target.value)}
                  className="bg-muted/50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="editStyleDetails">{language === 'zh' ? '结构细节 (逗号分隔)' : 'Details (comma separated)'}</Label>
                <Input
                  id="editStyleDetails"
                  value={editStyleDetails}
                  onChange={(e) => setEditStyleDetails(e.target.value)}
                  className="bg-muted/50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="editStyleAvoid">{language === 'zh' ? '避免元素 (逗号分隔)' : 'Avoid elements (comma separated)'}</Label>
                <Input
                  id="editStyleAvoid"
                  value={editStyleAvoid}
                  onChange={(e) => setEditStyleAvoid(e.target.value)}
                  className="bg-muted/50"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-border mt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setEditingStyle(null)}
                  disabled={editStyleLoading}
                >
                  {t.cancel}
                </Button>
                <Button type="submit" disabled={editStyleLoading}>
                  {editStyleLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <span>{language === 'zh' ? '保存修改' : 'Save Changes'}</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fabric Card Edit Modal */}
      {editingFabric && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-300">
          <div className="w-full max-w-lg bg-card border border-border rounded-xl p-6 shadow-2xl relative animate-in fade-in-50 zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-outfit font-bold">{language === 'zh' ? '编辑面料属性' : 'Edit Fabric Properties'}</h3>
              <Button variant="ghost" size="icon" onClick={() => setEditingFabric(null)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            <form onSubmit={handleUpdateFabricCard} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {editFabricError && (
                <div className="flex items-center space-x-2 text-xs bg-destructive/15 text-destructive p-3 rounded-lg border border-destructive/20">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{editFabricError}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="editFabricName">{t.fabricFormName}</Label>
                <Input
                  id="editFabricName"
                  value={editFabricName}
                  onChange={(e) => setEditFabricName(e.target.value)}
                  required
                  className="bg-muted/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="editFabricComposition">{t.fabricFormComp}</Label>
                  <Input
                    id="editFabricComposition"
                    value={editFabricComposition}
                    onChange={(e) => setEditFabricComposition(e.target.value)}
                    className="bg-muted/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editFabricWeight">{t.fabricFormWeight}</Label>
                  <Input
                    id="editFabricWeight"
                    type="number"
                    value={editFabricWeight}
                    onChange={(e) => setEditFabricWeight(e.target.value)}
                    className="bg-muted/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="editFabricTexture">{language === 'zh' ? '面料纹理' : 'Texture'}</Label>
                  <Input
                    id="editFabricTexture"
                    value={editFabricTexture}
                    onChange={(e) => setEditFabricTexture(e.target.value)}
                    className="bg-muted/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editFabricDrape">{language === 'zh' ? '垂坠感' : 'Drape'}</Label>
                  <Input
                    id="editFabricDrape"
                    value={editFabricDrape}
                    onChange={(e) => setEditFabricDrape(e.target.value)}
                    className="bg-muted/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="editFabricStretch">{language === 'zh' ? '弹性描述' : 'Stretch'}</Label>
                  <Input
                    id="editFabricStretch"
                    value={editFabricStretch}
                    onChange={(e) => setEditFabricStretch(e.target.value)}
                    className="bg-muted/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editFabricSheen">{language === 'zh' ? '光泽度' : 'Sheen'}</Label>
                  <Input
                    id="editFabricSheen"
                    value={editFabricSheen}
                    onChange={(e) => setEditFabricSheen(e.target.value)}
                    className="bg-muted/50"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="editFabricTransparency">{language === 'zh' ? '透明度' : 'Transparency'}</Label>
                <Input
                  id="editFabricTransparency"
                  value={editFabricTransparency}
                  onChange={(e) => setEditFabricTransparency(e.target.value)}
                  className="bg-muted/50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="editFabricPromptDesc">{language === 'zh' ? 'AI 生图提示词纹理优化描述 (Prompt)' : 'Image Gen Prompt Description'}</Label>
                <textarea
                  id="editFabricPromptDesc"
                  value={editFabricPromptDesc}
                  onChange={(e) => setEditFabricPromptDesc(e.target.value)}
                  rows={3}
                  className="w-full bg-muted/50 border border-border rounded-lg p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-border mt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setEditingFabric(null)}
                  disabled={editFabricLoading}
                >
                  {t.cancel}
                </Button>
                <Button type="submit" disabled={editFabricLoading}>
                  {editFabricLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <span>{language === 'zh' ? '保存修改' : 'Save Changes'}</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </aside>
  )
}
