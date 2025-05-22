// src/utils/loadModels.ts

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { NotificationManager } from '../core/NotificationManager';

// Karakter verisi tipi
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

        // Texture yükleme için fallback
        this.gltfLoader.load = ((originalLoad) => {
            return (url, onLoad, onProgress, onError) => {
                originalLoad.call(this.gltfLoader, url, (gltf) => {
                    gltf.scene.traverse((child) => {
                        if (child.isMesh && child.material && child.material.map) {
                            const texturePath = child.material.map.sourceFile || child.material.map.name;
                            if (texturePath.includes('colormap.png')) {
                                console.warn(`Texture bulunamadı: ${texturePath}, varsayılan texture uygulanıyor`);
                                child.material.map = new THREE.TextureLoader().load('/models/Textures/colormap.png');
                                child.material.needsUpdate = true;
                            }
                        }
                    });
                    onLoad(gltf);
                }, onProgress, (error) => {
                    console.error(`Model yükleme hatası: ${url}`, error);
                    Error(error);
                });
            };
        })(this.gltfLoader.load);
    }

    private async loadCharacterData(): Promise<void> {
        try {
            console.log('Karakter verileri yükleniyor...');
            const response = await fetch('/data/characters.json');
            if (!response.ok) {
                throw new Error(`Karakter verileri yüklenemedi: ${response.statusText}`);
            }
            this.charactersData = await response.json();
            console.log('Karakter verileri başarıyla yüklendi:', this.charactersData.length);
        } catch (error) {
            console.error('Karakter verileri yüklenirken hata:', error);
            NotificationManager.getInstance().show('Karakter verileri yüklenemedi!', 'error');
            throw error;
        }
    }

    async loadModel(path: string, name: string): Promise<any> {
        return new Promise((resolve) => {
            if (this.loadedModels.has(name)) {
                resolve(this.loadedModels.get(name));
                return;
            }

            console.log(`Model yükleniyor: ${name} (${path})`);
            this.gltfLoader.load(
                path,
                (gltf) => {
                    console.log(`Model yüklendi: ${name}`);
                    this.loadedModels.set(name, gltf);
                    resolve(gltf);
                },
                (xhr) => {
                    if (xhr.lengthComputable) {
                        const percentComplete = Math.round((xhr.loaded / xhr.total) * 100);
                    }
                },
                (error) => {
                    console.error(`Model yükleme hatası: ${name}`, error);
                    NotificationManager.getInstance().show(`Model yüklenemedi: ${name}!`, 'error');
                    resolve(null); // Fallback: Hata durumunda null döndür
                }
            );
        });
    }

    async loadCharacterModels(): Promise<void> {
        await this.loadCharacterData();
        console.log('Karakter modelleri yükleniyor...');
        const loadPromises = this.charactersData.map((char) =>
            this.loadModel(char.modelPath, char.id)
        );
        const results = await Promise.allSettled(loadPromises);
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                const charId = this.charactersData[index].id;
                console.error(`Karakter modeli yüklenemedi: ${charId}`, result.reason);
                NotificationManager.getInstance().show(`Karakter modeli yüklenemedi: ${charId}`, 'error');
            }
        });
        console.log('Karakter modelleri yükleme tamamlandı.');
    }

    async loadBlasterModels(): Promise<void> {
        console.log('Blaster modelleri yükleniyor...');
        const result = await this.loadModel('/models/kit/blaster-a.glb', 'sci-fi_blaster');
        if (!result) {
            console.warn('Blaster modeli yüklenemedi, varsayılan obje kullanılacak');
            const fallback = new THREE.Group();
            this.loadedModels.set('sci-fi_blaster', { scene: fallback });
        }
        console.log('Blaster modelleri yükleme tamamlandı.');
    }

    async loadCityKitModels(): Promise<void> {
        console.log('Şehir kiti modelleri yükleniyor...');
        const cityKitPaths = [
            { id: 'buildingA', path: '/models/city-kit/fence-1x4.glb' },
        ];
        const loadPromises = cityKitPaths.map((item) => this.loadModel(item.path, item.id));
        const results = await Promise.allSettled(loadPromises);
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                const id = cityKitPaths[index].id;
                console.error(`Şehir kiti modeli yüklenemedi: ${id}`, result.reason);
                NotificationManager.getInstance().show(`Şehir kiti modeli yüklenemedi: ${id}`, 'error');
                const fallback = new THREE.Group();
                this.loadedModels.set(id, { scene: fallback });
            }
        });
        console.log('Şehir kiti modelleri yükleme tamamlandı.');
    }

    getModel(name: string): any | undefined {
        return this.loadedModels.get(name);
    }

    getAllCharacterData(): CharacterData[] {
        return this.charactersData;
    }
}
