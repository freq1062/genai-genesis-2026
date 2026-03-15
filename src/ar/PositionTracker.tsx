import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { telemetrySync } from './telemetry';

export function PositionTracker() {
    const lastUpdate = useRef(0);
    const lastPos = useRef<[number, number, number]>([0, 0, 0]);
    const lastRot = useRef<[number, number, number]>([0, 0, 0]);

    useFrame((state) => {
        if (!document.hasFocus()) return;

        const now = Date.now();
        if (now - lastUpdate.current > 33) {
            const pos = state.camera.position.toArray() as [number, number, number];
            const rot = (state.camera.rotation.toArray() as any).slice(0, 3) as [number, number, number];

            const dPos = Math.sqrt(
                Math.pow(pos[0] - lastPos.current[0], 2) +
                Math.pow(pos[1] - lastPos.current[1], 2) +
                Math.pow(pos[2] - lastPos.current[2], 2)
            );
            const dRot = Math.abs(rot[1] - lastRot.current[1]);

            if (dPos > 0.001 || dRot > 0.002) {
                localStorage.setItem('genai_user_pos', JSON.stringify({ position: pos, rotation: rot }));
                telemetrySync.send({ type: 'telemetry_pos', position: pos, rotation: rot });

                lastPos.current = [pos[0], pos[1], pos[2]];
                lastRot.current = [rot[0], rot[1], rot[2]];
            }
            lastUpdate.current = now;
        }
    });

    return null;
}
