import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export function UserIndicator({
    position,
    rotation,
    active,
}: {
    position?: [number, number, number];
    rotation?: [number, number, number];
    active?: boolean;
}) {
    const groupRef = useRef<THREE.Group>(null!);

    const targetPos = useMemo(() => {
        const p = position || [0, 0, 0];
        return new THREE.Vector3(p[0], 0, p[2]);
    }, [position]);

    const targetQuat = useMemo(() => {
        const r = rotation || [0, 0, 0];
        const euler = new THREE.Euler(0, r[1], 0, 'YXZ');
        return new THREE.Quaternion().setFromEuler(euler);
    }, [rotation]);

    useFrame((_state, delta) => {
        if (!groupRef.current) return;
        const dampFactor = 1 - Math.exp(-15 * delta);
        groupRef.current.position.lerp(targetPos, dampFactor);
        groupRef.current.quaternion.slerp(targetQuat, dampFactor);
    });

    return (
        <group ref={groupRef}>
            <mesh position={[0, 0.8, 0]}>
                <capsuleGeometry args={[0.25, 0.8, 4, 8]} />
                <meshStandardMaterial
                    color={active ? '#10b981' : '#6366f1'}
                    emissive={active ? '#10b981' : '#6366f1'}
                    emissiveIntensity={0.5}
                    transparent
                    opacity={0.8}
                />
            </mesh>
            <mesh position={[0, 1.4, 0]}>
                <sphereGeometry args={[0.18, 16, 16]} />
                <meshStandardMaterial
                    color={active ? '#10b981' : '#6366f1'}
                    emissive={active ? '#10b981' : '#6366f1'}
                    emissiveIntensity={0.8}
                />
            </mesh>
            <mesh position={[0, 1.45, -0.15]}>
                <boxGeometry args={[0.2, 0.05, 0.1]} />
                <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={2} />
            </mesh>
            <mesh position={[0, 1.4, -0.4]} rotation={[Math.PI / 2, 0, 0]}>
                <coneGeometry args={[0.1, 0.4, 16]} />
                <meshStandardMaterial color={active ? '#34d399' : '#818cf8'} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
                <ringGeometry args={[0.4, 0.45, 32]} />
                <meshBasicMaterial
                    color={active ? '#10b981' : '#6366f1'}
                    transparent
                    opacity={0.5}
                />
            </mesh>
        </group>
    );
}
