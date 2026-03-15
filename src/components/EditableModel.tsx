import { useRef } from 'react';
import { TransformControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { ARModelInstance } from '../ar/types';

export function EditableModel({
    model,
    isSelected,
    onSelect,
    onUpdate,
    mode,
    onDragStart,
    onDragEnd,
}: {
    model: ARModelInstance;
    isSelected: boolean;
    onSelect: () => void;
    onUpdate: (updates: Partial<ARModelInstance>) => void;
    mode: 'translate' | 'rotate' | 'scale';
    onDragStart: () => void;
    onDragEnd: () => void;
}) {
    const { scene } = useGLTF(
        model.url !== 'fallback'
            ? model.url
            : 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Box/glTF-Binary/Box.glb',
    );
    const meshRef = useRef<THREE.Group>(null!);

    const onTransformChange = () => {
        if (!meshRef.current) return;
        const pos = meshRef.current.position.toArray() as [number, number, number];
        const rot = meshRef.current.rotation.toArray().slice(0, 3) as [number, number, number];
        const scl = meshRef.current.scale.toArray() as [number, number, number];
        onUpdate({ position: pos, rotation: rot, scale: scl });
    };

    return (
        <>
            {isSelected && (
                <TransformControls
                    object={meshRef.current}
                    mode={mode}
                    onMouseDown={onDragStart}
                    onMouseUp={() => {
                        onTransformChange();
                        onDragEnd();
                    }}
                />
            )}
            <group
                ref={meshRef}
                position={model.position}
                rotation={model.rotation || [0, 0, 0]}
                scale={model.scale || [0.5, 0.5, 0.5]}
                onClick={(e) => {
                    e.stopPropagation();
                    onSelect();
                }}
            >
                {model.url === 'fallback' ? (
                    <mesh>
                        <boxGeometry args={[1, 1, 1]} />
                        <meshStandardMaterial color={isSelected ? 'orange' : '#a855f7'} />
                    </mesh>
                ) : (
                    <primitive object={scene.clone()} />
                )}
            </group>
        </>
    );
}
