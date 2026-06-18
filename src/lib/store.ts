import { create } from 'zustand'

export interface Project {
  id: string
  user_id: string
  name: string
  description?: string
  cover_image?: string
  agent_model?: string
  agent_style?: string
  image_resolution?: string
  created_at: string
  updated_at: string
}

export interface StyleDna {
  id: string
  user_id: string
  project_id?: string
  name: string
  reference_images: string[]
  keywords: string[]
  colors: string[]
  silhouettes: string[]
  materials: string[]
  details: string[]
  avoid: string[]
  created_at: string
  updated_at: string
}

export interface FabricCard {
  id: string
  user_id: string
  project_id?: string
  name: string
  image?: string
  composition?: string
  weight_gsm?: number
  texture?: string
  drape?: string
  stretch?: string
  sheen?: string
  transparency?: string
  prompt_description?: string
  created_at: string
}

export interface Collection {
  id: string
  user_id: string
  project_id?: string
  name: string
  description?: string
  garment_ids: string[]
  cover_image?: string
  created_at: string
}

export interface ChatMessage {
  id: string
  role: 'agent' | 'user'
  text: string
  garmentCard?: GarmentCard
  garment_card_id?: string
  createdStyleDna?: StyleDna
  createdFabricCard?: FabricCard
  image_urls?: string[]
  referencedGarmentIds?: string[]
  grounding_metadata?: any
  loading?: boolean
  loadingStatus?: string
  loadingTarget?: 'garment' | 'fabric' | 'style'
  error?: boolean
  conflictResolution?: {
    conflictType: 'fabric' | 'style_dna'
    question: string
    resolved: boolean
    selectedOptionLabel?: string
    options: Array<{ id: string; label: string; value: string }>
  }
  designDecision?: {
    analysisMarkdown: string
    question: string
    resolved: boolean
    selectedOptionLabel?: string
    selectedPromptAddition?: string
    options: Array<{
      id: string; label: string; summary: string
      design_strategy: string; prompt_addition: string; value: string
    }>
    contextSnapshot?: any
  }
  garmentPreview?: {
    title: string; category: string; fit: string; collar: string
    sleeves: string; review: any
    imageLoading: boolean
  }
}

export interface GarmentCard {
  id: string
  user_id: string
  project_id?: string
  style_dna_id?: string
  fabric_card_id?: string
  title: string
  category: string
  images: string[]
  schema: {
    fit?: string
    collar?: string
    sleeves?: string
    pockets?: string
    closures?: string
    details?: string[]
    displayMode?: 'white_background' | 'on_body'
    review?: {
      style_match_score: number
      fabric_match_score: number
      structure_clarity_score: number
      prompt_compliance_score: number
      issues: string[]
      suggested_revision: string
    }
  }
  prompt?: string
  negative_prompt?: string
  design_rationale?: string
  parent_version_id?: string
  created_at: string
}

interface StudioState {
  projects: Project[]
  activeProject: Project | null
  styleDnas: StyleDna[]
  fabricCards: FabricCard[]
  garmentCards: GarmentCard[]
  activeStyleDnaId: string | null
  activeFabricCardId: string | null
  activeGarment: GarmentCard | null
  collections: Collection[]
  messages: ChatMessage[]
  chatLoading: boolean
  language: 'zh' | 'en'
  displayMode: 'white_background' | 'on_body'
  imageGenModel: string
  
  setProjects: (projects: Project[]) => void
  addProject: (project: Project) => void
  setActiveProject: (project: Project | null) => void
  setStyleDnas: (styleDnas: StyleDna[]) => void
  addStyleDna: (styleDna: StyleDna) => void
  setFabricCards: (fabricCards: FabricCard[]) => void
  addFabricCard: (fabricCard: FabricCard) => void
  setGarmentCards: (garmentCards: GarmentCard[]) => void
  addGarmentCard: (garmentCard: GarmentCard) => void
  setActiveStyleDnaId: (id: string | null) => void
  setActiveFabricCardId: (id: string | null) => void
  setActiveGarment: (garment: GarmentCard | null) => void
  setCollections: (collections: Collection[]) => void
  addCollection: (collection: Collection) => void
  updateCollection: (collection: Collection) => void
  setMessages: (messages: ChatMessage[]) => void
  addMessage: (message: ChatMessage) => void
  updateMessageById: (id: string, patch: Partial<ChatMessage>) => void
  setChatLoading: (loading: boolean) => void
  setLanguage: (lang: 'zh' | 'en') => void
  setDisplayMode: (mode: 'white_background' | 'on_body') => void
  setImageGenModel: (model: string) => void
  updateStyleDna: (styleDna: StyleDna) => void
  updateFabricCard: (fabricCard: FabricCard) => void
  updateProjectSettings: (agent_model: string, agent_style: string, image_resolution: string) => void
}

export const useStudioStore = create<StudioState>((set) => ({
  projects: [],
  activeProject: null,
  styleDnas: [],
  fabricCards: [],
  garmentCards: [],
  activeStyleDnaId: null,
  activeFabricCardId: null,
  activeGarment: null,
  collections: [],
  messages: [],
  chatLoading: false,
  language: 'zh', // Default to Chinese
  displayMode: 'white_background',
  imageGenModel: 'gemini-3.1-flash-image',

  setProjects: (projects) => set({ projects }),
  addProject: (project) => set((state) => ({ projects: [project, ...state.projects] })),
  setActiveProject: (activeProject) => set({ activeProject }),
  setStyleDnas: (styleDnas) => set({ styleDnas }),
  addStyleDna: (styleDna) => set((state) => {
    if (state.styleDnas.some(s => s.id === styleDna.id)) return {};
    return { styleDnas: [styleDna, ...state.styleDnas] };
  }),
  setFabricCards: (fabricCards) => set({ fabricCards }),
  addFabricCard: (fabricCard) => set((state) => {
    if (state.fabricCards.some(f => f.id === fabricCard.id)) return {};
    return { fabricCards: [fabricCard, ...state.fabricCards] };
  }),
  setGarmentCards: (garmentCards) => set({ garmentCards }),
  addGarmentCard: (garmentCard) => set((state) => {
    if (state.garmentCards.some(g => g.id === garmentCard.id)) return {};
    return { garmentCards: [garmentCard, ...state.garmentCards] };
  }),
  setActiveStyleDnaId: (activeStyleDnaId) => set({ activeStyleDnaId }),
  setActiveFabricCardId: (activeFabricCardId) => set({ activeFabricCardId }),
  setActiveGarment: (activeGarment) => set((state) => ({
    activeGarment,
    activeFabricCardId: activeGarment ? (activeGarment.fabric_card_id || state.activeFabricCardId) : state.activeFabricCardId,
    activeStyleDnaId: activeGarment ? (activeGarment.style_dna_id || state.activeStyleDnaId) : state.activeStyleDnaId
  })),
  setCollections: (collections) => set({ collections }),
  addCollection: (collection) => set((state) => ({ collections: [collection, ...state.collections] })),
  updateCollection: (collection) => set((state) => ({
    collections: state.collections.map(c => c.id === collection.id ? collection : c)
  })),
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  updateMessageById: (id, patch) => set((state) => ({
    messages: state.messages.map(m => m.id === id ? { ...m, ...patch } : m)
  })),
  setChatLoading: (chatLoading) => set({ chatLoading }),
  setLanguage: (language) => set({ language }),
  setDisplayMode: (displayMode) => set({ displayMode }),
  setImageGenModel: (imageGenModel) => set({ imageGenModel }),
  updateStyleDna: (styleDna) => set((state) => ({
    styleDnas: state.styleDnas.map(s => s.id === styleDna.id ? styleDna : s)
  })),
  updateFabricCard: (fabricCard) => set((state) => ({
    fabricCards: state.fabricCards.map(f => f.id === fabricCard.id ? fabricCard : f)
  })),
  updateProjectSettings: (agent_model, agent_style, image_resolution) => set((state) => ({
    activeProject: state.activeProject 
      ? { ...state.activeProject, agent_model, agent_style, image_resolution }
      : null
  })),
}))

