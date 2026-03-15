import { useSceneStore } from '../store'

export function ARScene() {
  const models = useSceneStore((state) => state.models)
  
  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} />
      {models.map((model) => (
        <mesh key={model.id} position={model.position} rotation={model.rotation} scale={model.scale}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="orange" />
        </mesh>
      ))}
    </>
  )
}
