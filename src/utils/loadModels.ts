// src/utils/loadModels.ts

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { NotificationManager } from '../core/NotificationManager';

// Model tipi tanımlamaları
interface BaseModelData {
    id: string;
    name: string;
    modelPath: string;
}

interface CharacterData extends BaseModelData {
    stats: { speed: number; power: number };
}

interface KitData extends BaseModelData {
    type: 'blaster' | 'city';
    properties?: {
        damage?: number;
        size?: { width: number; height: number };
    };
}

export class ModelsLoader {
    private gltfLoader: GLTFLoader;
    private loadedModels: Map<string, any> = new Map();
    private charactersData: CharacterData[] = [];
    private kitsData: KitData[] = [];

    constructor() {
        this.gltfLoader = new GLTFLoader();
        this.setupTextureHandler();
    }

    private setupTextureHandler(): void {
        this.gltfLoader.load = ((originalLoad) => {
            return (url, onLoad, onProgress, onError) => {
                const cleanUrl = url.replace(/\.\.\/public/g, '');
                
                originalLoad.call(this.gltfLoader, cleanUrl, (gltf) => {
                    gltf.scene.traverse((child) => {
                        if (child.isMesh && child.material) {
                            if (Array.isArray(child.material)) {
                                child.material.forEach(mat => this.handleMaterial(mat));
                            } else {
                                this.handleMaterial(child.material);
                            }
                        }
                    });
                    onLoad(gltf);
                }, onProgress, onError);
            };
        })(this.gltfLoader.load);
    }

    private handleMaterial(material: THREE.Material): void {
        if ('map' in material && material.map) {
            const texturePath = material.map.source?.data?.currentSrc || 
                               material.map.image?.src || 
                               material.map.sourceFile || 
                               material.map.name;

            if (!material.map.image || texturePath?.includes('colormap.png')) {
                new THREE.TextureLoader().load(
                    '/models/Textures/colormap.png',
                    (texture) => {
                        if ('map' in material) {
                            material.map = texture;
                            material.needsUpdate = true;
                        }
                    },
                    undefined,
                    () => {
                        material.map = null;
                        if ('color' in material) {
                            material.color = new THREE.Color(0x808080);
                        }
                        material.needsUpdate = true;
                    }
                );
            }
        }
    }

    private async loadData<T>(path: string): Promise<T[]> {
        try {
            const response = await fetch(path);
            if (!response.ok) throw new Error(`Veri yüklenemedi: ${response.statusText}`);
            return await response.json();
        } catch (error) {
            console.error(`Veri yükleme hatası (${path}):`, error);
            NotificationManager.getInstance().show('Veri yüklenemedi!', 'error');
            throw error;
        }
    }

    private async loadSingleModel(modelPath: string, modelId: string): Promise<void> {
        try {
            const gltf = await new Promise((resolve, reject) => {
                this.gltfLoader.load(
                    modelPath,
                    resolve,
                    (xhr) => {
                        if (xhr.lengthComputable) {
                            const percent = Math.round((xhr.loaded / xhr.total) * 100);
                            console.log(`${modelId}: %${percent} yüklendi`);
                        }
                    },
                    reject
                );
            });
            this.loadedModels.set(modelId, gltf);
        } catch (error) {
            console.error(`Model yükleme hatası (${modelId}):`, error);
            throw error;
        }
    }

    async loadCharacterModels(): Promise<void> {
        try {
            this.charactersData = await this.loadData<CharacterData>('/data/characters.json');
            await Promise.all(
                this.charactersData.map(char => 
                    this.loadSingleModel(char.modelPath, char.id)
                )
            );
        } catch (error) {
            NotificationManager.getInstance().show('Karakterler yüklenemedi!', 'error');
            throw error;
        }
    }

    async loadGameAssets(): Promise<void> {
        try {
            await Promise.all([
                this.loadSingleModel('/models/kit/blaster-a.glb', 'sci-fi_blaster'),
                this.loadSingleModel('/models/city-kit/fence-1x4.glb', 'buildingA')
            ]);
        } catch (error) {
            NotificationManager.getInstance().show('Bazı oyun modelleri yüklenemedi!', 'warning');
            // Fallback: Boş gruplar oluştur
            ['sci-fi_blaster', 'buildingA'].forEach(id => {
                if (!this.loadedModels.has(id)) {
                    this.loadedModels.set(id, { scene: new THREE.Group() });
                }
            });
        }
    }

    getModel(id: string): any | undefined {
        return this.loadedModels.get(id);
    }

    getAllCharacterData(): CharacterData[] {
        return this.charactersData;
    }
}
