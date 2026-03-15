import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export function FallbackCube({
    position,
    rotation,
    scale,
    isSelected,
    onSelect,
}: {
    position: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
    isSelected: boolean;
    onSelect: () => void;
}) {
    const meshRef = useRef<THREE.Mesh>(null!);

    useFrame((state) => {
        if (meshRef.current) {
            const baseScaleX = scale ? scale[0] : 0.5;
            const baseScaleY = scale ? scale[1] : 0.5;
            const baseScaleZ = scale ? scale[2] : 0.5;

            if (isSelected) {
                const bounce = 1 + Math.sin(state.clock.elapsedTime * 5) * 0.1;
                meshRef.current.scale.set(baseScaleX * bounce, baseScaleY * bounce, baseScaleZ * bounce);
            } else {
                meshRef.current.scale.set(baseScaleX, baseScaleY, baseScaleZ);
            }
        }
    });

    return (
        <mesh
            ref={meshRef}
            position={position}
            rotation={rotation || [0, 0, 0]}
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
        >
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color={isSelected ? 'orange' : '#a855f7'} />
        </mesh>
    );
}
