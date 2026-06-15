import { create } from 'zustand'

export interface Project {
  id: string
  user_id: string
  name: string
  description?: string
  cover_image?: string
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
  language: 'zh' | 'en'
  
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
  setLanguage: (lang: 'zh' | 'en') => void
}

export const useStudioStore = create<StudioState>((set) => ({
  projects: [],
  activeProject: null,
  styleDnas: [],
  fabricCards: [],
  garmentCards: [],
  activeStyleDnaId: null,
  activeFabricCardId: null,
  language: 'zh', // Default to Chinese

  setProjects: (projects) => set({ projects }),
  addProject: (project) => set((state) => ({ projects: [project, ...state.projects] })),
  setActiveProject: (activeProject) => set({ activeProject }),
  setStyleDnas: (styleDnas) => set({ styleDnas }),
  addStyleDna: (styleDna) => set((state) => ({ styleDnas: [styleDna, ...state.styleDnas] })),
  setFabricCards: (fabricCards) => set({ fabricCards }),
  addFabricCard: (fabricCard) => set((state) => ({ fabricCards: [fabricCard, ...state.fabricCards] })),
  setGarmentCards: (garmentCards) => set({ garmentCards }),
  addGarmentCard: (garmentCard) => set((state) => ({ garmentCards: [garmentCard, ...state.garmentCards] })),
  setActiveStyleDnaId: (activeStyleDnaId) => set({ activeStyleDnaId }),
  setActiveFabricCardId: (activeFabricCardId) => set({ activeFabricCardId }),
  setLanguage: (language) => set({ language }),
}))
