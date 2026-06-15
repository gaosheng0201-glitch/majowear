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
  
  // Dragging states
  const [isDragging, setIsDragging] = useState(false)

  // Layout refs for measuring width of the actual image container card
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState<number | null>(null)

  useEffect(() => {
    if (!isOpen) return
    
    // Measure initial width of the image container card
    if (containerRef.current) {
      setContainerWidth(containerRef.current.clientWidth)
    }
    
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })
    
    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    return () => observer.disconnect()
  }, [isOpen])

  if (!isOpen || !activeGarment || familyGarments.length < 2) {
    return null
  }

  const garmentA = familyGarments.find(g => g.id === versionAId) || familyGarments[0]
  const garmentB = familyGarments.find(g => g.id === versionBId) || familyGarments[familyGarments.length - 1]

  const imgA = garmentA?.images?.[0]
  const imgB = garmentB?.images?.[0]

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('.divider-handle')) {
      e.preventDefault()
      setIsDragging(true)
    }
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

  const handleReset = () => {
    setSlidePercentage(50)
    setOpacity(50)
  }

  return (
    <div 
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 backdrop-blur-md animate-in fade-in duration-200"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Floating Header Toolbar */}
      <div className="absolute top-4 left-4 right-4 flex flex-col md:flex-row items-center justify-between gap-3 bg-zinc-900/85 border border-white/10 rounded-2xl px-6 py-3.5 backdrop-blur-md shadow-2xl z-30 text-white select-none">
        <div className="flex items-center space-x-2.5">
          <GitCompare className="w-5 h-5 text-indigo-400" />
          <div>
            <h3 className="font-outfit font-bold text-sm leading-none">
              {language === 'zh' ? '设计变体差异对比' : 'Variant Comparison'}
            </h3>
            <span className="text-[9px] text-zinc-400 font-mono mt-1 block">
              {language === 'zh' ? '已锁定的缩放与位移，纯对比视图' : 'Locked scale & position, dedicated comparison view'}
            </span>
          </div>
        </div>

        {/* Dropdowns Configuration */}
        <div className="flex flex-wrap items-center gap-3 text-xs w-full md:w-auto">
          {/* Select A */}
          <div className="flex items-center space-x-1.5 flex-1 md:flex-initial">
            <span className="text-[10px] text-zinc-400 uppercase font-semibold">A:</span>
            <select
              value={versionAId}
              onChange={(e) => setVersionAId(e.target.value)}
              className="bg-zinc-800 border border-white/10 rounded-lg px-2.5 py-1 text-xs outline-none focus:ring-1 focus:ring-primary w-full md:w-44 text-white"
            >
              {familyGarments.map((g, idx) => (
                <option key={g.id} value={g.id} className="bg-zinc-900">
                  v{idx + 1} - {g.title}
                </option>
              ))}
            </select>
          </div>

          {/* Select B */}
          <div className="flex items-center space-x-1.5 flex-1 md:flex-initial">
            <span className="text-[10px] text-zinc-400 uppercase font-semibold">B:</span>
            <select
              value={versionBId}
              onChange={(e) => setVersionBId(e.target.value)}
              className="bg-zinc-800 border border-white/10 rounded-lg px-2.5 py-1 text-xs outline-none focus:ring-1 focus:ring-primary w-full md:w-44 text-white"
            >
              {familyGarments.map((g, idx) => (
                <option key={g.id} value={g.id} className="bg-zinc-900">
                  v{idx + 1} - {g.title}
                </option>
              ))}
            </select>
          </div>

          {/* Mode Toggles */}
          <div className="flex bg-zinc-800/80 p-0.5 rounded-lg border border-white/10 h-8 shrink-0">
            <Button
              variant={compareMode === 'slide' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setCompareMode('slide')}
              className="text-[10px] h-full px-2.5 border-none"
            >
              <Columns2 className="w-3.5 h-3.5 mr-1" />
              {language === 'zh' ? '划动拆分' : 'Split'}
            </Button>
            <Button
              variant={compareMode === 'overlay' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setCompareMode('overlay')}
              className="text-[10px] h-full px-2.5 border-none"
            >
              <Layers className="w-3.5 h-3.5 mr-1" />
              {language === 'zh' ? '透明重叠' : 'Overlay'}
            </Button>
          </div>
        </div>

        {/* Close trigger */}
        <button 
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center transition-all hover:scale-105 shadow-md cursor-pointer shrink-0"
        >
          <X className="w-4.5 h-4.5 text-white" />
        </button>
      </div>

      {/* Main Comparison Display Area */}
      <div 
        className="w-full h-full flex items-center justify-center overflow-hidden relative select-none p-6"
        onMouseDown={handleMouseDown}
      >
        {imgA && imgB ? (
          <div 
            ref={containerRef}
            className="relative aspect-square h-full max-h-[72vh] w-full max-w-[90vw] md:max-w-[72vh] bg-zinc-900/40 rounded-2xl overflow-hidden shadow-2xl border border-white/10 select-none pointer-events-none"
          >
            {compareMode === 'slide' ? (
              <>
                {/* Image B (Base - right/under side) */}
                <img 
                  src={imgB} 
                  alt="Version B" 
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                  draggable={false}
                />
                
                {/* Image A (Clipped Overlay - left/over side) */}
                <div 
                  className="absolute inset-y-0 left-0 overflow-hidden pointer-events-none"
                  style={{ width: `${slidePercentage}%` }}
                >
                  <img 
                    src={imgA} 
                    alt="Version A" 
                    className="absolute top-0 left-0 h-full object-cover max-w-none pointer-events-none"
                    style={{ width: containerWidth ? `${containerWidth}px` : '100%' }}
                    draggable={false}
                  />
                </div>
                
                {/* Vertical slider divider bar */}
                <div 
                  className="absolute inset-y-0 w-[1.5px] bg-white/40 cursor-ew-resize z-20 flex items-center justify-center divider-handle pointer-events-auto"
                  style={{ left: `${slidePercentage}%` }}
                >
                  <div className="w-8 h-8 rounded-full bg-white border border-zinc-200 flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-transform text-zinc-950">
                    <Sliders className="w-3.5 h-3.5 rotate-90" />
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Image A (Base/Bottom) */}
                <img 
                  src={imgA} 
                  alt="Version A" 
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                  draggable={false}
                />
                
                {/* Image B (Top Overlay with variable opacity) */}
                <img 
                  src={imgB} 
                  alt="Version B" 
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                  style={{ opacity: opacity / 100 }}
                  draggable={false}
                />
              </>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic select-none">
            {language === 'zh' ? '加载对比图片错误' : 'Failed to load images for comparison'}
          </p>
        )}
      </div>

      {/* Floating Bottom Zoom & Opacity Controls */}
      <div className="absolute bottom-6 flex flex-col items-center space-y-3 z-30 w-full max-w-md px-4 select-none">
        
        {/* Opacity Control slider (Overlay Mode) */}
        {compareMode === 'overlay' && (
          <div className="w-full bg-zinc-900/85 border border-white/10 rounded-full px-5 py-2.5 backdrop-blur-md shadow-2xl flex flex-col space-y-1 text-white">
            <div className="flex justify-between text-[9px] text-zinc-400 font-mono select-none px-1">
              <span>{language === 'zh' ? '版本 A (100%)' : 'A (100%)'}</span>
              <span className="font-semibold text-indigo-400">{language === 'zh' ? `B叠加度: ${opacity}%` : `B Opacity: ${opacity}%`}</span>
              <span>{language === 'zh' ? '版本 B (100%)' : 'B (100%)'}</span>
            </div>
            <input 
              type="range" 
              min="0" 
              max="100" 
              value={opacity} 
              onChange={(e) => setOpacity(Number(e.target.value))}
              className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 pointer-events-auto"
            />
          </div>
        )}

        {/* Action reset controls */}
        <div className="flex items-center space-x-3 bg-zinc-900/85 border border-white/10 rounded-full px-4 py-1.5 backdrop-blur-md shadow-2xl">
          <button 
            onClick={handleReset}
            className="hover:text-indigo-400 transition-colors text-xs font-medium px-2 cursor-pointer pointer-events-auto text-white"
          >
            {language === 'zh' ? '重置滑块' : 'Reset Slider'}
          </button>
        </div>

        {/* Guide Tip */}
        <div className="text-white/40 text-[9px] pointer-events-none text-center leading-relaxed">
          {compareMode === 'slide' 
            ? (language === 'zh' 
                ? '提示：在图片上左右拖动中间的白色滑块以划动展示设计图差异' 
                : 'Tip: Drag divider to compare designs')
            : (language === 'zh' 
                ? '提示：使用下方的叠加度滑块以透视重合对比差异' 
                : 'Tip: Use the opacity slider below to overlay designs')}
        </div>
      </div>
    </div>
  )
}
