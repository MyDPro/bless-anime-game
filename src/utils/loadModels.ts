import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
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
    private scene: Scene;
    private models: Map<string, GLTF>;
    private characterData: CharacterData[] = [];
    private loadingPromises: Map<string, Promise<GLTF>> = new Map();

    constructor(scene: Scene) {
        super();
        console.log("ModelsLoader başlatılıyor");
        this.loader = new GLTFLoader();
        this.scene = scene;
        this.models = new Map();
    }

    async loadCharacterModels(): Promise<void> {
        try {
            console.log('Karakter modelleri yükleme başlıyor...');
            this.emit(MODEL_EVENTS.LOAD_START);

            const response = await fetch('/data/characters.json');
            if (!response.ok) {
                throw new Error('Characters.json dosyası bulunamadı');
            }

            this.characterData = await response.json();
            const totalCharacters = this.characterData.length;
            let loadedCount = 0;

            const loadPromises = this.characterData.map(async (char) => {
                if (this.loadingPromises.has(char.id)) {
                    return this.loadingPromises.get(char.id);
                }

                const loadPromise = this.loader.loadAsync(char.modelPath)
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
            this.emit(MODEL_EVENTS.LOAD_SUCCESS, this.characterData);
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
            const blasterModel = await this.loader.loadAsync(blasterPath);
            blasterModel.scene.name = 'blaster';
            this.scene.add(blasterModel.scene);
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
}
