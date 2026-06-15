'use client'

import { useState, useEffect, useRef } from "react"
import { 
  X, 
  GitCompare, 
  Sliders, 
  Layers, 
  Columns2,
  ZoomIn,
  ZoomOut
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
  // 'none' | 'divider' | 'pan'
  const [activeDragMode, setActiveDragMode] = useState<'none' | 'divider' | 'pan'>('none')
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  // Zoom and Pan states
  const [zoomScale, setZoomScale] = useState(1)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })

  // Layout refs for measuring width
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState<number | null>(null)

  // Zoom & Pan refs to keep wheel event listener synced with latest values
  const zoomScaleRef = useRef(zoomScale)
  const panOffsetRef = useRef(panOffset)

  useEffect(() => {
    zoomScaleRef.current = zoomScale
    panOffsetRef.current = panOffset
  }, [zoomScale, panOffset])

  useEffect(() => {
    if (!isOpen) return
    
    // Measure initial width
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

  // Mouse wheel zoom centered on cursor
  useEffect(() => {
    if (!isOpen) return

    const container = containerRef.current
    if (!container) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = container.getBoundingClientRect()
      // Mouse coordinates relative to the center of the image container viewport
      const mx = e.clientX - (rect.left + rect.width / 2)
      const my = e.clientY - (rect.top + rect.height / 2)

      const zoomFactor = 1.15
      const s1 = zoomScaleRef.current
      let s2 = s1

      if (e.deltaY < 0) {
        s2 = Math.min(4, s1 * zoomFactor)
      } else {
        s2 = Math.max(0.5, s1 / zoomFactor)
      }

      if (s2 === s1) return

      const ratio = s2 / s1
      const tx = panOffsetRef.current.x * ratio + mx * (1 - ratio)
      const ty = panOffsetRef.current.y * ratio + my * (1 - ratio)

      setPanOffset({ x: tx, y: ty })
      setZoomScale(s2)
    }

    container.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      container.removeEventListener('wheel', onWheel)
    }
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
    // Check if target or parent is the divider handle
    const target = e.target as HTMLElement
    if (target.closest('.divider-handle')) {
      e.preventDefault()
      setActiveDragMode('divider')
      return
    }

    // Otherwise, drag to pan both images
    e.preventDefault()
    setActiveDragMode('pan')
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (activeDragMode === 'none' || !containerRef.current) return

    if (activeDragMode === 'divider') {
      const rect = containerRef.current.getBoundingClientRect()
      const offsetX = e.clientX - rect.left
      const percentage = Math.max(0, Math.min(100, (offsetX / rect.width) * 100))
      setSlidePercentage(percentage)
    } else if (activeDragMode === 'pan') {
      setPanOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      })
    }
  }

  const handleMouseUp = () => {
    setActiveDragMode('none')
  }

  const handleZoomButton = (zoomIn: boolean) => {
    const s1 = zoomScale
    let s2 = s1
    const step = 0.25
    if (zoomIn) {
      s2 = Math.min(4, s1 + step)
    } else {
      s2 = Math.max(0.5, s1 - step)
    }
    if (s2 === s1) return
    const ratio = s2 / s1
    setPanOffset(prev => ({
      x: prev.x * ratio,
      y: prev.y * ratio
    }))
    setZoomScale(s2)
  }

  const handleReset = () => {
    setZoomScale(1)
    setPanOffset({ x: 0, y: 0 })
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
              {language === 'zh' ? '支持滚轮缩放与鼠标拖拽漫游' : 'Supports mouse wheel zoom & click-drag pan'}
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

      {/* Main Interactive Comparison Display Area */}
      <div 
        ref={containerRef}
        onMouseDown={handleMouseDown}
        className="w-full h-full flex items-center justify-center overflow-hidden relative cursor-grab select-none"
        style={{ cursor: activeDragMode === 'pan' ? 'grabbing' : 'grab' }}
      >
        {imgA && imgB ? (
          <div 
            className="relative aspect-[3/4] h-full max-h-[72vh] w-full max-w-[90vw] md:max-w-2xl bg-zinc-900/40 rounded-2xl overflow-hidden shadow-2xl border border-white/10 select-none pointer-events-none"
          >
            {compareMode === 'slide' ? (
              <>
                {/* Image B (Base - right side) */}
                <img 
                  src={imgB} 
                  alt="Version B" 
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                  style={{ 
                    transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`,
                    transformOrigin: 'center',
                    transition: activeDragMode === 'pan' ? 'none' : 'transform 0.15s ease-out',
                  }}
                  draggable={false}
                />
                
                {/* Image A (Clipped Overlay - left side) */}
                <div 
                  className="absolute inset-0 overflow-hidden pointer-events-none"
                  style={{ width: `${slidePercentage}%` }}
                >
                  <img 
                    src={imgA} 
                    alt="Version A" 
                    className="absolute inset-0 h-full object-contain max-w-none pointer-events-none"
                    style={{ 
                      width: containerWidth ? `${containerWidth}px` : '100%',
                      height: '100%',
                      transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`,
                      transformOrigin: 'center',
                      transition: activeDragMode === 'pan' ? 'none' : 'transform 0.15s ease-out',
                    }}
                    draggable={false}
                  />
                </div>
                
                {/* Vertical slider divider bar */}
                <div 
                  className="absolute inset-y-0 w-[2px] bg-indigo-500 cursor-ew-resize z-20 flex items-center justify-center divider-handle pointer-events-auto"
                  style={{ left: `${slidePercentage}%` }}
                >
                  <div className="w-8 h-8 rounded-full bg-indigo-500 border-4 border-zinc-950 flex items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition-transform text-white">
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
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                  style={{ 
                    transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`,
                    transformOrigin: 'center',
                    transition: activeDragMode === 'pan' ? 'none' : 'transform 0.15s ease-out',
                  }}
                  draggable={false}
                />
                
                {/* Image B (Top Overlay with variable opacity) */}
                <img 
                  src={imgB} 
                  alt="Version B" 
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                  style={{ 
                    opacity: opacity / 100,
                    transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`,
                    transformOrigin: 'center',
                    transition: activeDragMode === 'pan' ? 'none' : 'transform 0.15s ease-out',
                  }}
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

        {/* Zoom controls */}
        <div className="flex items-center space-x-3 bg-zinc-900/85 border border-white/10 rounded-full px-4 py-1.5 backdrop-blur-md shadow-2xl">
          <button 
            onClick={() => handleZoomButton(false)}
            className="hover:text-indigo-400 transition-colors p-1 cursor-pointer pointer-events-auto"
            title={language === 'zh' ? '缩小' : 'Zoom Out'}
          >
            <ZoomOut className="w-4 h-4 text-white" />
          </button>
          <span className="text-xs font-mono w-12 text-center text-white">
            {Math.round(zoomScale * 100)}%
          </span>
          <button 
            onClick={() => handleZoomButton(true)}
            className="hover:text-indigo-400 transition-colors p-1 cursor-pointer pointer-events-auto"
            title={language === 'zh' ? '放大' : 'Zoom In'}
          >
            <ZoomIn className="w-4 h-4 text-white" />
          </button>
          <div className="h-3 w-px bg-white/15" />
          <button 
            onClick={handleReset}
            className="hover:text-indigo-400 transition-colors text-xs font-medium px-1 cursor-pointer pointer-events-auto text-white"
          >
            {language === 'zh' ? '重置' : 'Reset'}
          </button>
        </div>

        {/* Guide Tip */}
        <div className="text-white/40 text-[9px] pointer-events-none text-center leading-relaxed">
          {compareMode === 'slide' 
            ? (language === 'zh' 
                ? '提示：左右拖动黄色滑块对比；在画布上按住并移动鼠标拖拽漫游；滚动滚轮缩放' 
                : 'Tip: Drag divider to compare; hold-drag on canvas to pan; scroll wheel to zoom')
            : (language === 'zh' 
                ? '提示：在画布上按住并移动鼠标拖拽漫游；滚动滚轮以缩放' 
                : 'Tip: Hold-drag on canvas to pan; scroll wheel to zoom')}
        </div>
      </div>
    </div>
  )
}
