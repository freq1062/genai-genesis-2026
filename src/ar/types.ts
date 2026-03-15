export interface ARModelInstance {
    id: string;
    name: string;
    url: string;
    position: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
}
