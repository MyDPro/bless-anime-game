import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { NotificationManager } from '../core/NotificationManager';

interface CharacterData {
    id: string;
    name: string;
    modelPath: string;
    stats: { speed: number; power: number };
}

export class ModelsLoader {
    private gltfLoader: GLTFLoader;
    private loadedModels: Map<string, any> = new Map();
    private charactersData: CharacterData[] = [];

    constructor() {
        this.gltfLoader = new GLTFLoader();
        this.setupTextureHandler();
    }

    private setupTextureHandler(): void {
        this.gltfLoader.load = ((originalLoad) => {
            return (url, onLoad, onProgress, onError) => {
                const cleanUrl = this.cleanModelPath(url);
                
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

    private cleanModelPath(path: string): string {
        return path.replace(/\.\.\/public/g, '')  // "../public" ifadelerini kaldır
                  .replace(/^\.?\/?/, '/')        // Başındaki "./" veya "/" işaretlerini düzelt
                  .replace(/\/+/g, '/');          // Çift slash'ları tekli hale getir
    }

private handleMaterial(material: THREE.Material): void {
    if ('map' in material && material.map) {
        // material.map'in Texture olduğundan emin olalım
        const texture = material.map as THREE.Texture;
        if (!texture.image) {
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
    private async loadCharacterData(): Promise<void> {
        try {
            const response = await fetch('/data/characters.json');
            if (!response.ok) {
                throw new Error(`Karakter verileri yüklenemedi: ${response.statusText}`);
            }
            const rawData = await response.json();
            
            this.charactersData = Array.isArray(rawData) ? rawData.map(char => ({
                ...char,
                modelPath: this.cleanModelPath(char.modelPath)
            })) : [];

            if (this.charactersData.length === 0) {
                throw new Error('Karakter verisi bulunamadı!');
            }

            console.log('Karakter verileri yüklendi:', this.charactersData.length);
        } catch (error) {
            console.error('Karakter verileri yüklenirken hata:', error);
            NotificationManager.getInstance().show('Karakter verileri yüklenemedi!', 'error');
            throw error;
        }
    }

    private async loadModelWithFallback(path: string, id: string, createFallback: () => THREE.Object3D = () => new THREE.Group()): Promise<void> {
        try {
            if (!this.loadedModels.has(id)) {
                const gltf = await new Promise((resolve, reject) => {
                    this.gltfLoader.load(
                        this.cleanModelPath(path),
                        resolve,
                        (xhr) => {
                            if (xhr.lengthComputable) {
                                const percent = Math.round((xhr.loaded / xhr.total) * 100);
                                console.log(`${id}: %${percent} yüklendi`);
                            }
                        },
                        reject
                    );
                });
                this.loadedModels.set(id, gltf);
            }
        } catch (error) {
            console.warn(`${id} modeli yüklenemedi, fallback kullanılıyor`);
            this.loadedModels.set(id, { scene: createFallback() });
        }
    }

    async loadCharacterModels(): Promise<void> {
        await this.loadCharacterData();
        try {
            await Promise.all(
                this.charactersData.map(char => 
                    this.loadModelWithFallback(char.modelPath, char.id)
                )
            );
        } catch (error) {
            NotificationManager.getInstance().show('Bazı karakterler yüklenemedi!', 'warning');
        }
    }

    async loadGameAssets(): Promise<void> {
        const assets = [
            { id: 'sci-fi_blaster', path: '/models/kit/blaster-a.glb' },
            { id: 'buildingA', path: '/models/city-kit/fence-1x4.glb' }
        ];

        try {
            await Promise.all(
                assets.map(asset => 
                    this.loadModelWithFallback(asset.path, asset.id)
                )
            );
        } catch (error) {
            NotificationManager.getInstance().show('Bazı oyun modelleri yüklenemedi!', 'warning');
        }
    }

    getModel(id: string): any | undefined {
        return this.loadedModels.get(id);
    }

    getAllCharacterData(): CharacterData[] {
        return this.charactersData;
    }
                }
