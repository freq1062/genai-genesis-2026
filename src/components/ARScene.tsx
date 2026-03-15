import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { OrbitControls, Environment, Grid, ContactShadows } from '@react-three/drei'
import * as THREE from 'three'
import { useXRHitTest, useXR } from '@react-three/xr'
import { useSceneStore } from '../store'

const matrixHelper = new THREE.Matrix4()
const hitTestPosition = new THREE.Vector3()

export function ARScene() {
  const reticleRef = useRef<THREE.Mesh>(null)
  const objects = useSceneStore((state) => state.objects)
  const addObject = useSceneStore((state) => state.addObject)
  const [draggingId, setDraggingId] = useState<number | null>(null)

  const mode = useXR((state) => state.mode)
  const isDesktop = mode !== 'immersive-ar'

  useXRHitTest(
    (results, getWorldMatrix) => {
      if (!isDesktop && reticleRef.current) {
        if (results.length > 0) {
          reticleRef.current.visible = true
          getWorldMatrix(matrixHelper, results[0])
          hitTestPosition.setFromMatrixPosition(matrixHelper)
        } else {
          reticleRef.current.visible = false
        }
      }
    },
    'viewer'
  )

  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

  useFrame(({ raycaster, pointer, camera }) => {
    if (isDesktop && reticleRef.current) {
      // Desktop fallback: raycast to y=0 plane
      raycaster.setFromCamera(pointer, camera)
      const intersectionPoint = new THREE.Vector3()
      if (raycaster.ray.intersectPlane(floorPlane, intersectionPoint)) {
        reticleRef.current.visible = true
        hitTestPosition.copy(intersectionPoint)
        reticleRef.current.position.copy(hitTestPosition)
        reticleRef.current.rotation.x = -Math.PI / 2
      } else {
        reticleRef.current.visible = false
      }
    } else if (!isDesktop && reticleRef.current && reticleRef.current.visible) {
      reticleRef.current.position.copy(hitTestPosition)
      reticleRef.current.rotation.x = -Math.PI / 2
    }
  })

  // Placing a new object
  const handleReticleTap = (e: any) => {
    e.stopPropagation()
    if (draggingId) {
      // Drop current dragging object
      setDraggingId(null)
      return
    }
    
    // Instantiate new
    if (reticleRef.current?.visible) {
      addObject({
        id: Date.now(),
        type: "cube_placeholder",
        position: [hitTestPosition.x, hitTestPosition.y, hitTestPosition.z]
      })
    }
  }

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1.5} castShadow />
      
      {/* Sample Room for exploration */}
      {isDesktop && (
        <>
          {/* Floor */}
          <mesh position={[0, 0, 0]} receiveShadow>
            <planeGeometry args={[8, 8]} />
            <meshStandardMaterial color="#1a1a1a" />
          </mesh>

          {/* Wall 1 - Back */}
          <mesh position={[0, 2, -4]} castShadow receiveShadow>
            <boxGeometry args={[8, 4, 0.2]} />
            <meshStandardMaterial color="#2a2a2a" />
          </mesh>

          {/* Wall 2 - Left */}
          <mesh position={[-4, 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.2, 4, 8]} />
            <meshStandardMaterial color="#333333" />
          </mesh>

          {/* Wall 3 - Right */}
          <mesh position={[4, 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.2, 4, 8]} />
            <meshStandardMaterial color="#333333" />
          </mesh>

          {/* Sample Sofa */}
          <mesh position={[0, 0.5, 1]} castShadow receiveShadow>
            <boxGeometry args={[2, 1, 1]} />
            <meshStandardMaterial color="#4a5568" />
          </mesh>

          {/* Sample Coffee Table */}
          <mesh position={[0, 0.4, -0.5]} castShadow receiveShadow>
            <boxGeometry args={[1.2, 0.8, 0.6]} />
            <meshStandardMaterial color="#8b7355" />
          </mesh>

          {/* Sample Lamp Base */}
          <mesh position={[-2.5, 0.5, 1.5]} castShadow receiveShadow>
            <cylinderGeometry args={[0.3, 0.3, 1, 16]} />
            <meshStandardMaterial color="#2a2a2a" />
          </mesh>

          {/* Sample Lamp Top */}
          <mesh position={[-2.5, 1.3, 1.5]} castShadow receiveShadow>
            <coneGeometry args={[0.4, 0.8, 16]} />
            <meshStandardMaterial color="#e8d5b7" emissive="#e8d5b7" emissiveIntensity={0.3} />
          </mesh>

          {/* Sample Plant (tall box as placeholder) */}
          <mesh position={[2.5, 1, 1.5]} castShadow receiveShadow>
            <boxGeometry args={[0.5, 2, 0.5]} />
            <meshStandardMaterial color="#2d5016" />
          </mesh>
        </>
      )}
      
      {/* Desktop Fallback rendering */}
      {isDesktop && (
        <>
          <OrbitControls makeDefault />
          <Grid infiniteGrid fadeDistance={20} sectionColor={"#444"} cellColor={"#222"} position={[0, -0.01, 0]} />
          <Environment preset="city" />
          <ContactShadows position={[0, 0, 0]} opacity={0.4} scale={10} blur={2} far={4} />
        </>
      )}

      {/* Reticle / Ghost Place UI */}
      <mesh 
        ref={reticleRef} 
        visible={false} 
        onPointerUp={handleReticleTap}
      >
        <ringGeometry args={[0.08, 0.12, 32]} />
        <meshBasicMaterial color={draggingId ? "orange" : "lime"} opacity={0.6} transparent side={THREE.DoubleSide} />
      </mesh>

      {/* Placed Objects */}
      {objects.map((obj) => (
        <PlacedObject 
           key={obj.id}
           id={obj.id}
           initialPosition={obj.position} 
           isDragging={draggingId === obj.id}
           onToggleDrag={(e) => {
             e.stopPropagation()
             setDraggingId(draggingId === obj.id ? null : obj.id)
           }}
        />
      ))}
    </>
  )
}

function PlacedObject({ 
  initialPosition, 
  isDragging, 
  onToggleDrag,
  id
}: { 
  initialPosition: [number, number, number], 
  isDragging: boolean, 
  onToggleDrag: (e: any) => void,
  id: number
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const updateObjectPosition = useSceneStore(state => state.updateObjectPosition)

  useFrame(() => {
    if (isDragging && meshRef.current) {
      // Smoothly move towards the hit test position
      meshRef.current.position.lerp(hitTestPosition, 0.2)
    }
  })

  return (
    <mesh 
       ref={meshRef} 
       position={initialPosition} 
       castShadow 
       receiveShadow
       onClick={(e) => {
         onToggleDrag(e);
         // If we are currently dragging and just clicked to stop, commit the new position!
         if (isDragging && meshRef.current) {
           updateObjectPosition(id, [
             meshRef.current.position.x, 
             meshRef.current.position.y, 
             meshRef.current.position.z
           ])
         }
       }}
    >
      <boxGeometry args={[0.2, 0.2, 0.2]} />
      <meshStandardMaterial color={isDragging ? "orange" : "#3b82f6"} roughness={0.2} metalness={0.8} />
    </mesh>
  )
}
