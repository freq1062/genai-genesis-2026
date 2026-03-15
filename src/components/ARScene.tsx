import { useRef, useState, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei'
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
  const camera = useThree((state) => state.camera)

  const mode = useXR((state) => state.mode)
  const isDesktop = mode !== 'immersive-ar'

  // Set bird's eye view camera position on mount
  useEffect(() => {
    camera.position.set(0, 10, 8)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  }, [camera])

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
      {/* Modern Lighting Setup */}
      <ambientLight intensity={0.6} color="#ffffff" />
      <directionalLight position={[5, 8, 4]} intensity={1.2} castShadow color="#f5f5f5" />
      <pointLight position={[-3, 3.2, -1]} intensity={0.8} color="#fff9e6" castShadow />
      <pointLight position={[4, 2.5, 2]} intensity={0.5} color="#ffffff" />
      
      {/* Sample Room for exploration - Modern Sleek Design */}
      {isDesktop && (
        <>
          {/* Floor - Light polished concrete */}
          <mesh position={[0, 0, 0]} receiveShadow>
            <boxGeometry args={[10, 0.05, 10]} />
            <meshStandardMaterial color="#e8e8e8" roughness={0.3} metalness={0.1} />
          </mesh>

          {/* Back Wall - White minimalist */}  
          <mesh position={[0, 2.5, -5]} castShadow receiveShadow>
            <boxGeometry args={[10, 5, 0.2]} />
            <meshStandardMaterial color="#f5f5f5" roughness={0.9} />
          </mesh>

          {/* Left Wall - Soft gray accent */}
          <mesh position={[-5, 2.5, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.2, 5, 10]} />
            <meshStandardMaterial color="#d4d4d4" roughness={0.8} />
          </mesh>

          {/* Right Wall - White clean */}
          <mesh position={[5, 2.5, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.2, 5, 10]} />
            <meshStandardMaterial color="#f5f5f5" roughness={0.9} />
          </mesh>

          {/* Front Wall - Closes the room */}
          <mesh position={[0, 2.5, 5]} castShadow receiveShadow>
            <boxGeometry args={[10, 5, 0.2]} />
            <meshStandardMaterial color="#f5f5f5" roughness={0.9} />
          </mesh>

          {/* Modern Sectional Sofa - Slate Gray */}
          <mesh position={[-1, 0.45, 2]} castShadow receiveShadow>
            <boxGeometry args={[2.5, 0.9, 1.2]} />
            <meshStandardMaterial color="#3d4451" roughness={0.7} />
          </mesh>

          {/* Sofa Back Cushion */}
          <mesh position={[-1, 1.25, 2.3]} castShadow receiveShadow>
            <boxGeometry args={[2.5, 0.8, 0.3]} />
            <meshStandardMaterial color="#3d4451" roughness={0.7} />
          </mesh>

          {/* Modern Coffee Table - Walnut wood */}
          <mesh position={[0.5, 0.35, 0.5]} castShadow receiveShadow>
            <boxGeometry args={[1.4, 0.7, 0.8]} />
            <meshStandardMaterial color="#6b4423" roughness={0.5} metalness={0.1} />
          </mesh>

          {/* Table Top Glass Reflection */}
          <mesh position={[0.5, 0.36, 0.5]} receiveShadow>
            <boxGeometry args={[1.35, 0.05, 0.75]} />
            <meshStandardMaterial color="#ffffff" roughness={0.1} metalness={0.8} />
          </mesh>

          {/* Modern Floor Lamp Base - Wide weighted base on ground */}
          <mesh position={[-3, 0.04, -1]} castShadow receiveShadow>
            <cylinderGeometry args={[0.15, 0.16, 0.08, 12]} />
            <meshStandardMaterial color="#333333" roughness={0.5} metalness={0.3} />
          </mesh>

          {/* Lamp Pole - Thin steel rod */}
          <mesh position={[-3, 1.54, -1]} castShadow receiveShadow>
            <cylinderGeometry args={[0.04, 0.04, 3.0, 12]} />
            <meshStandardMaterial color="#7a7a7a" roughness={0.2} metalness={0.8} />
          </mesh>

          {/* Lamp Head - Realistic fabric shade */}
          <mesh position={[-3, 3.14, -1]} castShadow>
            <coneGeometry args={[0.4, 0.6, 16]} />
            <meshStandardMaterial color="#f5ede1" emissive="#f5ede1" emissiveIntensity={0.3} roughness={0.7} />
          </mesh>

          {/* TV - Wall mounted on back wall */}
          <mesh position={[0, 1.8, -4.92]} castShadow>
            <boxGeometry args={[1.6, 0.95, 0.08]} />
            <meshStandardMaterial color="#0a0a0a" roughness={0.1} metalness={0.2} />
          </mesh>

          {/* TV Screen with slight glow */}
          <mesh position={[0, 1.8, -4.915]} receiveShadow>
            <boxGeometry args={[1.5, 0.85, 0.01]} />
            <meshStandardMaterial color="#1a1a2e" emissive="#0a1a3e" emissiveIntensity={0.2} roughness={0.05} />
          </mesh>

          {/* TV Stand - Modern sleek pedestal */}
          <mesh position={[0, 0.25, -4.9]} castShadow receiveShadow>
            <boxGeometry args={[0.4, 0.5, 0.3]} />
            <meshStandardMaterial color="#2c2c2c" roughness={0.6} />
          </mesh>

          {/* Modern Accent Chair - Charcoal */}
          <mesh position={[3, 0.4, 1.5]} castShadow receiveShadow>
            <boxGeometry args={[1, 0.8, 1]} />
            <meshStandardMaterial color="#2c2c2c" roughness={0.8} />
          </mesh>

          {/* Chair Back */}
          <mesh position={[3, 1, 1.8]} castShadow receiveShadow>
            <boxGeometry args={[1, 0.6, 0.2]} />
            <meshStandardMaterial color="#2c2c2c" roughness={0.8} />
          </mesh>

          {/* Decorative Plant - Modern Tall with pot */}
          <mesh position={[4, 0.225, 4]} castShadow receiveShadow>
            <cylinderGeometry args={[0.25, 0.28, 0.4, 12]} />
            <meshStandardMaterial color="#d4a574" roughness={0.6} />
          </mesh>

          {/* Plant stem and leaves */}
          <mesh position={[4, 1.025, 4]} castShadow receiveShadow>
            <boxGeometry args={[0.6, 1.2, 0.4]} />
            <meshStandardMaterial color="#4a7c3f" roughness={0.6} />
          </mesh>

          {/* Modern Glass Side Table */}
          <mesh position={[-3.5, 0.35, 0.5]} castShadow receiveShadow>
            <boxGeometry args={[0.8, 0.7, 0.8]} />
            <meshStandardMaterial color="#d0e8f7" roughness={0.05} metalness={0.2} transparent opacity={0.7} />
          </mesh>
        </>
      )}
      
      {/* Desktop Fallback rendering */}
      {isDesktop && (
        <>
          <OrbitControls makeDefault />
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
