import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';

export function RoomShell({ url }: { url: string }) {
    const { scene } = useGLTF(url);
    const cloned = useMemo(() => scene.clone(), [scene]);
    return <primitive object={cloned} position={[0, 0, 0]} />;
}
