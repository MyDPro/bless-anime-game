// src/utils/loadModels.ts
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
    photoPath: string;
    stats: {
        speed: number;
        power: number;
        health: number;
        ability: string;
        abilityDescription: string;
    };
}

export interface KitData {
    id: string;
    name: string;
    modelPath: string;
    photoPath: string;
    stats: {
        fireRate: number;
        damage: number;
        effect: string;
        effectDescription: string;
    };
}

export interface CityData {
    buildings: {
        id: string;
        name: string;
        modelPath: string;
        type: string;
        size: { width: number; height: number; depth: number };
        region: string[];
    }[];
    roads: {
        id: string;
        name: string;
        modelPath: string;
        type: string;
        size: { width: number; height: number; depth: number };
        region: string[];
    }[];
    props: {
        id: string;
        name: string;
        modelPath: string;
        type: string;
        size: { width: number; height: number; depth: number };
        region: string[];
        effect?: string;
        effectDescription?: string;
    }[];
}

export class ModelsLoader extends EventEmitter {
    private loader: GLTFLoader;
    private dracoLoader: DRACOLoader;
    private scene: Scene;
    private models: Map<string, GLTF>;
    private characterData: CharacterData[] = [];
    private kitData: KitData[] = [];
    private cityData: CityData = { buildings: [], roads: [], props: [] };
    private loadingPromises: Map<string, Promise<GLTF>> = new Map();
    private readonly MAX_RETRIES = 3;
    private readonly RETRY_DELAY = 1000;
    private isDataLoaded: boolean = false;

    constructor(scene: Scene) {
        super();
        console.log("ModelsLoader başlatılıyor");
        this.loader = new GLTFLoader();
        this.dracoLoader = new DRACOLoader();
        this.dracoLoader.setDecoderPath('/draco/');
        this.loader.setDRACOLoader(this.dracoLoader);
        this.scene = scene;
        this.models = new Map();
    }

    public async initialize(): Promise<void> {
        try {
            await Promise.all([this.loadCharacterData(), this.loadKitData(), this.loadCityData()]);
            this.isDataLoaded = true;
            console.log(`Veri yükleme tamamlandı: ${this.characterData.length} karakter, ${this.kitData.length} silah, şehir verileri yüklendi`);
            NotificationManager.getInstance().show('Veriler yüklendi!', 'success');
        } catch (error) {
            console.error('Veri yükleme hatası:', error);
            NotificationManager.getInstance().show('Veriler yüklenemedi!', 'error');
            throw error;
        }
    }

    public isLoaded(): boolean {
        return this.isDataLoaded;
    }

    private async loadCharacterData(): Promise<void> {
        try {
            const response = await fetch('/data/characters.json', { cache: 'no-cache' });
            if (!response.ok) {
                throw new Error(`Characters.json dosyası bulunamadı: ${response.status}`);
            }
            this.characterData = await response.json();
            console.log('Karakter verileri yüklendi:', this.characterData.length, 'karakter');
        } catch (error) {
            console.error('Karakter verileri yüklenemedi:', error);
            NotificationManager.getInstance().show('Karakter verileri yüklenemedi!', 'error');
            throw error;
        }
    }

    private async loadKitData(): Promise<void> {
        try {
            const response = await fetch('/data/kits.json', { cache: 'no-cache' });
            if (!response.ok) {
                throw new Error(`Kits.json dosyası bulunamadı: ${response.status}`);
            }
            this.kitData = await response.json();
            console.log('Silah verileri yüklendi:', this.kitData.length, 'silah');
        } catch (error) {
            console.error('Silah verileri yüklenemedi:', error);
            NotificationManager.getInstance().show('Silah verileri yüklenemedi!', 'error');
            throw error;
        }
    }

    private async loadCityData(): Promise<void> {
        try {
            const response = await fetch('/data/citys.json', { cache: 'no-cache' });
            if (!response.ok) {
                throw new Error(`Citys.json dosyası bulunamadı: ${response.status}`);
            }
            this.cityData = await response.json();
            console.log('Şehir verileri yüklendi:', this.cityData.buildings.length, 'bina,', this.cityData.roads.length, 'yol,', this.cityData.props.length, 'çevre elemanı');
        } catch (error) {
            console.error('Şehir verileri yüklenemedi:', error);
            NotificationManager.getInstance().show('Şehir verileri yüklenemedi!', 'error');
            throw error;
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

    async loadKitModels(kits?: string[]): Promise<void> {
        try {
            console.log('Silah modelleri yükleme başlıyor...');
            this.emit(MODEL_EVENTS.LOAD_START);

            if (!this.kitData.length) {
                await this.loadKitData();
                if (!this.kitData.length) {
                    throw new Error('Silah verileri yüklenemedi');
                }
            }

            const kitsToLoad = kits 
                ? this.kitData.filter(kit => kits.includes(kit.id))
                : this.kitData;

            const totalKits = kitsToLoad.length;
            let loadedCount = 0;

            const loadPromises = kitsToLoad.map(async (kit) => {
                if (this.loadingPromises.has(kit.id)) {
                    return this.loadingPromises.get(kit.id);
                }

                const loadPromise = this.loadModelWithRetry(kit.modelPath)
                    .then(model => {
                        model.scene.name = kit.id;
                        this.models.set(kit.id, model);
                        loadedCount++;
                        this.emit(MODEL_EVENTS.LOAD_PROGRESS, {
                            kitId: kit.id,
                            progress: (loadedCount / totalKits) * 100,
                            total: totalKits,
                            loaded: loadedCount
                        });
                        console.log(`${kit.name} modeli yüklendi (${loadedCount}/${totalKits})`);
                        return model;
                    })
                    .catch(error => {
                        console.error(`${kit.name} yüklenirken hata:`, error);
                        NotificationManager.getInstance().show(`${kit.name} yüklenemedi!`, 'error');
                        this.emit(MODEL_EVENTS.LOAD_ERROR, kit.id, error);
                        throw error;
                    });

                this.loadingPromises.set(kit.id, loadPromise);
                return loadPromise;
            });

            await Promise.all(loadPromises);
            this.emit(MODEL_EVENTS.LOAD_SUCCESS, kitsToLoad);
            console.log('Tüm silah modelleri yüklendi');
            NotificationManager.getInstance().show('Tüm silahlar yüklendi!', 'success');
        } catch (error) {
            console.error('Silah modelleri yüklenirken genel hata:', error);
            NotificationManager.getInstance().show('Silah modelleri yüklenemedi!', 'error');
            this.emit(MODEL_EVENTS.LOAD_ERROR, 'all', error);
            throw error;
        }
    }

    async loadCityModels(): Promise<void> {
        try {
            console.log('Şehir modelleri yükleme başlıyor...');
            this.emit(MODEL_EVENTS.LOAD_START);

            if (!this.cityData.buildings.length && !this.cityData.roads.length && !this.cityData.props.length) {
                await this.loadCityData();
                if (!this.cityData.buildings.length && !this.cityData.roads.length && !this.cityData.props.length) {
                    throw new Error('Şehir verileri yüklenemedi');
                }
            }

            const modelsToLoad = [
                ...this.cityData.buildings.map(b => ({ id: b.id, path: b.modelPath, name: b.name })),
                ...this.cityData.roads.map(r => ({ id: r.id, path: r.modelPath, name: r.name })),
                ...this.cityData.props.map(p => ({ id: p.id, path: p.modelPath, name: p.name })),
            ];

            const totalModels = modelsToLoad.length;
            let loadedCount = 0;

            const loadPromises = modelsToLoad.map(async (item) => {
                if (this.loadingPromises.has(item.id)) {
                    return this.loadingPromises.get(item.id);
                }

                const loadPromise = this.loadModelWithRetry(item.path)
                    .then(model => {
                        model.scene.name = item.id;
                        this.models.set(item.id, model);
                        loadedCount++;
                        this.emit(MODEL_EVENTS.LOAD_PROGRESS, {
                            modelId: item.id,
                            progress: (loadedCount / totalModels) * 100,
                            total: totalModels,
                            loaded: loadedCount,
                        });
                        console.log(`${item.name} modeli yüklendi (${loadedCount}/${totalModels})`);
                        return model;
                    })
                    .catch(error => {
                        console.error(`${item.name} yüklenirken hata:`, error);
                        NotificationManager.getInstance().show(`${item.name} yüklenemedi!`, 'error');
                        this.emit(MODEL_EVENTS.LOAD_ERROR, item.id, error);
                        throw error;
                    });

                this.loadingPromises.set(item.id, loadPromise);
                return loadPromise;
            });

            await Promise.all(loadPromises);
            this.emit(MODEL_EVENTS.LOAD_SUCCESS, modelsToLoad);
            console.log('Tüm şehir modelleri yüklendi');
            NotificationManager.getInstance().show('Tüm şehir modelleri yüklendi!', 'success');
        } catch (error) {
            console.error('Şehir modelleri yüklenirken hata:', error);
            NotificationManager.getInstance().show('Şehir modelleri yüklenemedi!', 'error');
            this.emit(MODEL_EVENTS.LOAD_ERROR, 'all', error);
            throw error;
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

    getAllKitData(): KitData[] {
        return this.kitData;
    }

    getKitData(kitId: string): KitData | undefined {
        return this.kitData.find(kit => kit.id === kitId);
    }

    getCityData(): CityData {
        return this.cityData;
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
        this.kitData = [];
        this.cityData = { buildings: [], roads: [], props: [] };
        this.isDataLoaded = false;
        this.dracoLoader.dispose();
    }
}
