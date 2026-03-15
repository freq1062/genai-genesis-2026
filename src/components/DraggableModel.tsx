import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { ARModelInstance } from '../ar/types';

export function DraggableModel({
    model,
    isSelected,
    onSelect,
}: {
    model: ARModelInstance;
    isSelected: boolean;
    onSelect: () => void;
}) {
    const { scene } = useGLTF(model.url);
    const meshRef = useRef<THREE.Group>(null!);
    const clonedScene = useMemo(() => scene.clone(), [scene]);

    useFrame((state) => {
        if (meshRef.current) {
            const baseScaleX = model.scale ? model.scale[0] : 0.5;
            const baseScaleY = model.scale ? model.scale[1] : 0.5;
            const baseScaleZ = model.scale ? model.scale[2] : 0.5;

            if (isSelected) {
                const bounce = 1 + Math.sin(state.clock.elapsedTime * 5) * 0.1;
                meshRef.current.scale.set(baseScaleX * bounce, baseScaleY * bounce, baseScaleZ * bounce);
            } else {
                meshRef.current.scale.set(baseScaleX, baseScaleY, baseScaleZ);
            }
        }
    });

    return (
        <group
            ref={meshRef}
            position={model.position}
            rotation={model.rotation || [0, 0, 0]}
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
        >
            <primitive object={clonedScene} />
        </group>
    );
}
