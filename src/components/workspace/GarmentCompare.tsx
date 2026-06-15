'use client'

import { useState, useEffect, useRef } from "react"
import { 
  X, 
  GitCompare, 
  Sliders, 
  Layers, 
  Columns2 
} from "lucide-react"
import { useStudioStore, GarmentCard } from "@/lib/store"
import { translations } from "@/lib/translations"
import { Button } from "@/components/ui/button"

interface GarmentCompareProps {
  isOpen: boolean
  onClose: () => void
}

export default function GarmentCompare({ isOpen, onClose }: GarmentCompareProps) {
  const { garmentCards, activeGarment, language } = useStudioStore()
  const t = translations[language]

  // Filter garments in the same version tree
  const getFamilyGarments = (): GarmentCard[] => {
    if (!activeGarment) return []
    
    // Find root ID for any garment node
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

    const currentRootId = getRootId(activeGarment)
    
    // Find all garments in the project sharing the same root ID
    const family = garmentCards.filter(g => getRootId(g) === currentRootId)
    
    // Sort chronologically ascending
    return family.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }

  const familyGarments = getFamilyGarments()

  // Selectable A and B versions
  const [versionAId, setVersionAId] = useState<string>("")
  const [versionBId, setVersionBId] = useState<string>("")

  // Default selection: A is parent (or first version) and B is active
  useEffect(() => {
    if (familyGarments.length > 0) {
      const activeIdx = familyGarments.findIndex(g => g.id === activeGarment?.id)
      const prevGarment = activeIdx > 0 ? familyGarments[activeIdx - 1] : familyGarments[0]
      setVersionAId(prevGarment.id)
      setVersionBId(activeGarment?.id || familyGarments[familyGarments.length - 1].id)
    }
  }, [activeGarment, garmentCards])

  // Mode selection: 'slide' (split screen) | 'overlay' (onion skin opacity)
  const [compareMode, setCompareMode] = useState<'slide' | 'overlay'>('slide')

  // Slider control states
  const [slidePercentage, setSlidePercentage] = useState(50)
  const [opacity, setOpacity] = useState(50)
  const [isDragging, setIsDragging] = useState(false)

  // Layout refs for measuring width
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState<number | null>(null)

  useEffect(() => {
    if (!isOpen || !containerRef.current) return
    setContainerWidth(containerRef.current.clientWidth)
    
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [isOpen])

  if (!isOpen || !activeGarment || familyGarments.length < 2) {
    return null
  }

  const garmentA = familyGarments.find(g => g.id === versionAId) || familyGarments[0]
  const garmentB = familyGarments.find(g => g.id === versionBId) || familyGarments[familyGarments.length - 1]

  const imgA = garmentA?.images?.[0]
  const imgB = garmentB?.images?.[0]

  // Drag handler for Split Slider
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const offsetX = e.clientX - rect.left
    const percentage = Math.max(0, Math.min(100, (offsetX / rect.width) * 100))
    setSlidePercentage(percentage)
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  return (
    <div 
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-200 p-4 overflow-y-auto"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className="w-full max-w-4xl bg-card border border-border rounded-2xl shadow-2xl p-6 flex flex-col max-h-[95vh] lg:max-h-[90vh]">
        {/* Header toolbar */}
        <div className="flex justify-between items-center pb-4 border-b border-border">
          <div className="flex items-center space-x-2">
            <GitCompare className="w-5 h-5 text-primary" />
            <h3 className="font-outfit font-bold text-foreground text-sm uppercase tracking-wide">
              {language === 'zh' ? '设计变体差异对比 (A/B Compare)' : 'Design Variant A/B Comparison'}
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-muted/80 hover:bg-muted text-foreground flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Setup parameters & Dropdown Selectors */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-4 bg-muted/30 border-b border-border/80 px-4 rounded-xl mt-4 shrink-0 text-xs">
          {/* Version A Selection */}
          <div className="flex flex-col space-y-1.5">
            <label className="font-semibold text-muted-foreground uppercase text-[10px]">
              {language === 'zh' ? '对比版本 A (左/底层)' : 'Version A (Left/Under)'}
            </label>
            <select
              value={versionAId}
              onChange={(e) => setVersionAId(e.target.value)}
              className="bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary w-full"
            >
              {familyGarments.map((g, idx) => (
                <option key={g.id} value={g.id}>
                  v{idx + 1} - {g.title} ({new Date(g.created_at).toLocaleDateString()})
                </option>
              ))}
            </select>
          </div>

          {/* Version B Selection */}
          <div className="flex flex-col space-y-1.5">
            <label className="font-semibold text-muted-foreground uppercase text-[10px]">
              {language === 'zh' ? '对比版本 B (右/表层)' : 'Version B (Right/Over)'}
            </label>
            <select
              value={versionBId}
              onChange={(e) => setVersionBId(e.target.value)}
              className="bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary w-full"
            >
              {familyGarments.map((g, idx) => (
                <option key={g.id} value={g.id}>
                  v{idx + 1} - {g.title} ({new Date(g.created_at).toLocaleDateString()})
                </option>
              ))}
            </select>
          </div>

          {/* Comparison Mode Toggles */}
          <div className="flex flex-col space-y-1.5 justify-end">
            <label className="font-semibold text-muted-foreground uppercase text-[10px]">
              {language === 'zh' ? '对比查看模式' : 'Comparison View Mode'}
            </label>
            <div className="flex bg-muted p-0.5 rounded-lg border border-border/80">
              <Button
                variant={compareMode === 'slide' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setCompareMode('slide')}
                className="flex-1 text-[10px] h-7 px-2"
              >
                <Columns2 className="w-3.5 h-3.5 mr-1" />
                {language === 'zh' ? '划动拆分' : 'Split Slider'}
              </Button>
              <Button
                variant={compareMode === 'overlay' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setCompareMode('overlay')}
                className="flex-1 text-[10px] h-7 px-2"
              >
                <Layers className="w-3.5 h-3.5 mr-1" />
                {language === 'zh' ? '透明重叠' : 'Opacity Overlay'}
              </Button>
            </div>
          </div>
        </div>

        {/* Visual Comparison Area */}
        <div className="flex-1 min-h-[300px] lg:min-h-[400px] flex items-center justify-center p-4 bg-zinc-950/20 border border-border/40 rounded-2xl mt-4 overflow-hidden relative">
          {imgA && imgB ? (
            <div 
              ref={containerRef}
              className="relative aspect-[3/4] h-full max-h-[50vh] lg:max-h-[60vh] bg-zinc-900 rounded-xl overflow-hidden shadow-lg select-none border border-border"
            >
              {compareMode === 'slide' ? (
                <>
                  {/* Image A (Base/Left) */}
                  <img 
                    src={imgA} 
                    alt="Version A" 
                    className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                    draggable={false}
                  />
                  
                  {/* Image B (Overlay/Right, clipped by width) */}
                  <div 
                    className="absolute inset-y-0 left-0 overflow-hidden pointer-events-none"
                    style={{ width: `${slidePercentage}%` }}
                  >
                    <img 
                      src={imgB} 
                      alt="Version B" 
                      className="absolute inset-0 h-full object-contain max-w-none pointer-events-none"
                      style={{ width: containerWidth ? `${containerWidth}px` : '100%' }}
                      draggable={false}
                    />
                  </div>
                  
                  {/* Vertical Slider Handle */}
                  <div 
                    className="absolute inset-y-0 w-1 bg-primary cursor-ew-resize z-20 flex items-center justify-center"
                    style={{ left: `${slidePercentage}%` }}
                    onMouseDown={handleMouseDown}
                  >
                    <div className="w-7 h-7 rounded-full bg-primary border-2 border-background flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-transform text-white">
                      <Sliders className="w-3.5 h-3.5 rotate-90" />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Image A (Base) */}
                  <img 
                    src={imgA} 
                    alt="Version A" 
                    className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                    draggable={false}
                  />
                  
                  {/* Image B (Top Overlay with variable opacity) */}
                  <img 
                    src={imgB} 
                    alt="Version B" 
                    className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                    style={{ opacity: opacity / 100 }}
                    draggable={false}
                  />
                </>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              {language === 'zh' ? '加载对比图片错误' : 'Failed to load images for comparison'}
            </p>
          )}
        </div>

        {/* Footer controls */}
        {compareMode === 'overlay' && (
          <div className="w-full max-w-md mx-auto pt-4 shrink-0 flex flex-col space-y-1">
            <div className="flex justify-between text-[10px] text-muted-foreground font-mono select-none px-1">
              <span>{language === 'zh' ? '版本 A (100% 原始)' : 'Version A (100% Original)'}</span>
              <span className="font-semibold text-primary">{language === 'zh' ? `B重叠度: ${opacity}%` : `B Opacity: ${opacity}%`}</span>
              <span>{language === 'zh' ? '版本 B (100% 变体)' : 'Version B (100% Variant)'}</span>
            </div>
            <input 
              type="range" 
              min="0" 
              max="100" 
              value={opacity} 
              onChange={(e) => setOpacity(Number(e.target.value))}
              className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
            />
          </div>
        )}

        {compareMode === 'slide' && (
          <p className="text-center text-[10px] text-muted-foreground pt-4 shrink-0 select-none">
            {language === 'zh' 
              ? '提示：在图片上左右拖动中间的黄色滑块以划动展示设计图差异' 
              : 'Tip: Drag the vertical divider left or right on the image to view design details'}
          </p>
        )}
      </div>
    </div>
  )
}
