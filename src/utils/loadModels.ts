// src/utils/loadModels.ts

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
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
    private loadedModels: Map<string, any> = new Map(); // GLTF nesnelerini saklamak için
    private charactersData: CharacterData[] = []; // Karakter verilerini saklamak için

    constructor() {
        this.gltfLoader = new GLTFLoader();

        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('.trashed-1750004157-colormap.png'); // Draco çözümleyicisinin yolu
        this.gltfLoader.setDRACOLoader(dracoLoader);
    }

    // JSON dosyasından karakter verilerini yükler
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
            throw error; // Hata fırlat, çünkü kritik
        }
    }

    async loadModel(path: string, name: string): Promise<any> {
        return new Promise((resolve, reject) => {
            if (this.loadedModels.has(name)) {
                resolve(this.loadedModels.get(name));
                return;
            }

            console.log(`Model yükleniyor: ${name} (${path})`);
            this.gltfLoader.load(path, (gltf) => {
                console.log(`Model yüklendi: ${name}`);
                this.loadedModels.set(name, gltf);
                resolve(gltf);
            }, (xhr) => {
                // Yükleme ilerlemesi (isteğe bağlı: yükleme ekranında kullanabilirsin)
                if (xhr.lengthComputable) {
                    const percentComplete = Math.round(xhr.loaded / xhr.total * 100);
                    // console.log(`Model ${name}: ${percentComplete}% yüklendi`);
                }
            }, (error) => {
                console.error(`Model yükleme hatası: ${name}`, error);
                NotificationManager.getInstance().show(`Model yüklenemedi: ${name}!`, 'error');
                reject(error);
            });
        });
    }

    async loadCharacterModels(): Promise<void> {
        // Önce karakter verilerini yükle
        await this.loadCharacterData(); 

        console.log('Karakter modelleri yükleniyor...');
        const loadPromises = this.charactersData.map(char => this.loadModel(char.modelPath, char.id));
        await Promise.all(loadPromises);
        console.log('Tüm karakter modelleri yüklendi.');
    }

    async loadBlasterModels(): Promise<void> {
        console.log('Blaster modelleri yükleniyor...');
        // Örnek bir blaster modeli yüklemesi
        await this.loadModel('/models/kit/blaster_sci-fi.glb', 'sci-fi_blaster');
        console.log('Tüm blaster modelleri yüklendi.');
    }

    async loadCityKitModels(): Promise<void> {
        console.log('Şehir kiti modelleri yükleniyor...');
        // Buraya şehir kiti modellerinin yollarını characters.json gibi bir data dosyasından alabilirsin.
        // Şimdilik sabit bıraktım.
        const cityKitPaths = [
            { id: 'buildingA', path: '/models/city-kit/building_A.glb' },
            { id: 'buildingB', path: '/models/city-kit/building_B.glb' },
            // ... diğer şehir kiti modelleri
            // Örnek:
            // { id: 'roadStraight', path: '/models/city-kit/road_straight.glb' },
            // { id: 'trafficLight', path: '/models/city-kit/traffic_light.glb' }
        ];
        const loadPromises = cityKitPaths.map(item => this.loadModel(item.path, item.id));
        await Promise.all(loadPromises);
        console.log('Tüm şehir kiti modelleri yüklendi.');
    }

    getModel(name: string): any | undefined {
        return this.loadedModels.get(name);
    }

    // Karakter verilerini dışarıya açan metod
    getAllCharacterData(): CharacterData[] {
        return this.charactersData;
    }
}
