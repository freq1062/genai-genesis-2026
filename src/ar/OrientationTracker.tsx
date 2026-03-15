import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export function OrientationTracker({ enabled }: { enabled: boolean }) {
    const orientation = useRef({ alpha: 0, beta: 0, gamma: 0 });
    const damped = useRef({ alpha: 0, beta: 0, gamma: 0 });
    const initialYaw = useRef<number | null>(null);

    useFrame((state) => {
        if (!enabled) return;

        const lerpAngle = (a: number, b: number, t: number) => {
            const da = (b - a) % 360;
            const shortestDiff = 2 * da % 360 - da;
            return a + shortestDiff * t;
        };

        damped.current.alpha = lerpAngle(damped.current.alpha, orientation.current.alpha, 0.05);
        damped.current.beta = lerpAngle(damped.current.beta, orientation.current.beta, 0.05);
        damped.current.gamma = lerpAngle(damped.current.gamma, orientation.current.gamma, 0.05);

        const { alpha, beta, gamma } = damped.current;

        if (initialYaw.current === null && alpha !== 0) {
            initialYaw.current = alpha;
        }

        const alphaRad = THREE.MathUtils.degToRad(alpha - (initialYaw.current || 0));
        const betaRad = THREE.MathUtils.degToRad(beta);
        const gammaRad = THREE.MathUtils.degToRad(gamma);

        state.camera.rotation.set(betaRad - Math.PI / 2, alphaRad, gammaRad, 'YXZ');
    });

    useEffect(() => {
        if (!enabled) return;

        const handleOrientation = (e: DeviceOrientationEvent) => {
            if (e.alpha !== null) orientation.current.alpha = e.alpha;
            if (e.beta !== null) orientation.current.beta = e.beta;
            if (e.gamma !== null) orientation.current.gamma = e.gamma;
        };
        window.addEventListener('deviceorientation', handleOrientation);
        return () => window.removeEventListener('deviceorientation', handleOrientation);
    }, [enabled]);

    return null;
}
