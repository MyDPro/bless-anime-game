import * as THREE from 'three';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { Scene } from 'three';
import { NotificationManager } from '../core/NotificationManager';
import { EventEmitter } from './EventEmitter';

export const MODEL_EVENTS = {
    LOAD_START: 'modelLoadStart',
    LOAD_PROGRESS: 'modelLoadProgress',
    LOAD_SUCCESS: 'modelLoadSuccess',
    LOAD_ERROR: 'modelLoadError'
} as const;

export interface CharacterData {
    id: string;
    name: string;
    modelPath: string;
    stats: {
        speed: number;
        power: number;
    };
}

export class ModelsLoader extends EventEmitter {
    private loader: GLTFLoader;
    private dracoLoader: DRACOLoader;
    private scene: Scene;
    private models: Map<string, GLTF>;
    private characterData: CharacterData[] = [];
    private loadingPromises: Map<string, Promise<GLTF>> = new Map();
    private readonly MAX_RETRIES = 3;
    private readonly RETRY_DELAY = 1000;

    constructor(scene: Scene) {
        super();
        console.log("ModelsLoader başlatılıyor");
        this.loader = new GLTFLoader();
        this.dracoLoader = new DRACOLoader();
        this.dracoLoader.setDecoderPath('/draco/');
        this.loader.setDRACOLoader(this.dracoLoader);
        this.scene = scene;
        this.models = new Map();
        // characters.json'ı constructor'da yükle
        this.loadCharacterData();
    }

    private async loadCharacterData(): Promise<void> {
        try {
            const response = await fetch('/data/characters.json');
            if (!response.ok) {
                throw new Error('Characters.json dosyası bulunamadı');
            }
            this.characterData = await response.json();
            console.log('Karakter verileri yüklendi:', this.characterData.length, 'karakter');
        } catch (error) {
            console.error('Karakter verileri yüklenemedi:', error);
            NotificationManager.getInstance().show('Karakter verileri yüklenemedi!', 'error');
        }
    }

    private async loadModelWithRetry(modelPath: string, retryCount = 0): Promise<GLTF> {
        try {
            const model = await this.loader.loadAsync(modelPath);
            this.optimizeModel(model);
            return model;
        } catch (error) {
            if (retryCount < this.MAX_RETRIES) {
                console.warn(`Model yükleme denemesi ${retryCount + 1}/${this.MAX_RETRIES}: ${modelPath}`);
                await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY * (retryCount + 1)));
                return this.loadModelWithRetry(modelPath, retryCount + 1);
            }
            throw error;
        }
    }

    private optimizeModel(model: GLTF): void {
        model.scene.traverse((object) => {
            if (object instanceof THREE.Mesh) {
                object.frustumCulled = true;
                object.castShadow = true;
                object.receiveShadow = true;
            }
        });
    }

    async loadCharacterModels(characters?: string[]): Promise<void> {
        try {
            console.log('Karakter modelleri yükleme başlıyor...');
            this.emit(MODEL_EVENTS.LOAD_START);

            if (!this.characterData.length) {
                await this.loadCharacterData();
                if (!this.characterData.length) {
                    throw new Error('Karakter verileri yüklenemedi');
                }
            }

            const modelsToLoad = characters 
                ? this.characterData.filter(char => characters.includes(char.id))
                : this.characterData;

            const totalCharacters = modelsToLoad.length;
            let loadedCount = 0;

            const loadPromises = modelsToLoad.map(async (char) => {
                if (this.loadingPromises.has(char.id)) {
                    return this.loadingPromises.get(char.id);
                }

                const loadPromise = this.loadModelWithRetry(char.modelPath)
                    .then(model => {
                        model.scene.name = char.id;
                        this.models.set(char.id, model);
                        loadedCount++;
                        
                        this.emit(MODEL_EVENTS.LOAD_PROGRESS, {
                            characterId: char.id,
                            progress: (loadedCount / totalCharacters) * 100,
                            total: totalCharacters,
                            loaded: loadedCount
                        });

                        console.log(`${char.name} modeli yüklendi (${loadedCount}/${totalCharacters})`);
                        return model;
                    })
                    .catch(error => {
                        console.error(`${char.name} yüklenirken hata:`, error);
                        NotificationManager.getInstance().show(`${char.name} yüklenemedi!`, 'error');
                        this.emit(MODEL_EVENTS.LOAD_ERROR, char.id, error);
                        throw error;
                    });

                this.loadingPromises.set(char.id, loadPromise);
                return loadPromise;
            });

            await Promise.all(loadPromises);
            this.emit(MODEL_EVENTS.LOAD_SUCCESS, modelsToLoad);
            console.log('Tüm karakter modelleri yüklendi');
            NotificationManager.getInstance().show('Tüm karakterler yüklendi!', 'success');

        } catch (error) {
            console.error('Karakter modelleri yüklenirken genel hata:', error);
            NotificationManager.getInstance().show('Karakter modelleri yüklenemedi!', 'error');
            this.emit(MODEL_EVENTS.LOAD_ERROR, 'all', error);
            throw error;
        }
    }

    async loadBlasterModels(): Promise<void> {
        try {
            console.log('Silah modelleri yükleme başlıyor...');
            const blasterPath = '/models/kit/blaster-r.glb';

            console.log('Blaster modeli yükleme denemesi...');
            const blasterModel = await this.loadModelWithRetry(blasterPath);
            blasterModel.scene.name = 'blaster';
            this.models.set('blaster', blasterModel);
            console.log('Blaster modeli başarıyla yüklendi');

            blasterModel.scene.scale.set(1, 1, 1);
        } catch (error) {
            console.error('Silah modeli yüklenirken spesifik hata:', error);
            NotificationManager.getInstance().show('Silah modeli yüklenemedi!', 'error');
            if (error instanceof Error) {
                throw new Error(`Silah modeli yüklenemedi: ${error.message}`);
            }
            throw new Error('Silah modeli yüklenemedi: Bilinmeyen hata');
        }
    }

    getModel(modelId: string): GLTF | undefined {
        return this.models.get(modelId);
    }

    getAllCharacterData(): CharacterData[] {
        return this.characterData;
    }

    getCharacterData(characterId: string): CharacterData | undefined {
        return this.characterData.find(char => char.id === characterId);
    }

    isModelLoaded(modelId: string): boolean {
        return this.models.has(modelId);
    }

    getLoadedModelsCount(): number {
        return this.models.size;
    }

    cleanup(): void {
        console.log("ModelsLoader temizleniyor");
        this.loadingPromises.clear();
        this.models.forEach((model) => {
            model.scene.traverse((object: any) => {
                if (object.geometry) object.geometry.dispose();
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach((material: any) => material.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
                if (object.texture) object.texture.dispose();
            });
            this.scene.remove(model.scene);
        });
        this.models.clear();
        this.characterData = [];
        this.dracoLoader.dispose();
    }
}
