import { create } from 'zustand'

export interface SceneObject {
  id: number
  position: [number, number, number]
  type: string
}

interface SceneState {
  objects: SceneObject[]
  addObject: (obj: SceneObject) => void
  updateObjectPosition: (id: number, position: [number, number, number]) => void
  getSceneGraph: () => string
}

export const useSceneStore = create<SceneState>((set, get) => ({
  objects: [],
  
  addObject: (obj) => set((state) => ({ 
    objects: [...state.objects, obj] 
  })),

  updateObjectPosition: (id, position) => set((state) => ({
    objects: state.objects.map(obj => 
      obj.id === id ? { ...obj, position } : obj
    )
  })),

  getSceneGraph: () => {
    const { objects } = get()
    return JSON.stringify({
      version: 1,
      objects: objects.map(obj => ({
        mesh_id: obj.id,
        world_coordinates: obj.position,
        type: obj.type
      }))
    }, null, 2)
  }
}))
