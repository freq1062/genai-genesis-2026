import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface ARModelInstance {
  id: string
  name: string
  url: string
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
}

interface SceneState {
  models: ARModelInstance[]
  addModel: (model: ARModelInstance) => void
  updateModel: (id: string, updates: Partial<ARModelInstance>) => void
  deleteModel: (id: string) => void
  resetScene: () => void
}

export const useSceneStore = create<SceneState>()(
  persist(
    (set) => ({
      models: [],
      addModel: (model) => set((state) => ({ 
        models: [...state.models, model] 
      })),
      updateModel: (id, updates) => set((state) => ({
        models: state.models.map(m => m.id === id ? { ...m, ...updates } : m)
      })),
      deleteModel: (id) => set((state) => ({
        models: state.models.filter(m => m.id !== id)
      })),
      resetScene: () => set({ models: [] })
    }),
    {
      name: 'genai_ar_store'
    }
  )
)
