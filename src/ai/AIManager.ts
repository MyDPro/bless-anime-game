import * as tf from '@tensorflow/tfjs';
import { ModelsLoader } from '../utils/loadModels';
import { Vector3 } from 'three';

// Veri tipi tanımları (ModelsLoader.ts’den)
interface CharacterData {
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

interface CityData {
  buildings: { id: string; name: string; modelPath: string; type: string; size: { width: number; height: number; depth: number }; region: string[] }[];
  roads: { id: string; name: string; modelPath: string; type: string; size: { width: number; height: number; depth: number }; region: string[] }[];
  props: { id: string; name: string; modelPath: string; type: string; size: { width: number; height: number; depth: number }; region: string[]; effect?: string; effectDescription?: string }[];
}

export class AIManager {
  private modelsLoader: ModelsLoader;
  private scene: THREE.Scene;
  private enemyModel: tf.LayersModel | null = null;
  private structureModel: tf.LayersModel | null = null;
  private enemies: { model: THREE.Object3D; health: number; speed: number; damage: number }[] = [];

  constructor(modelsLoader: ModelsLoader, scene: THREE.Scene) {
    this.modelsLoader = modelsLoader;
    this.scene = scene;
    this.loadModels();
  }

  private async loadModels(): Promise<void> {
    try {
      this.enemyModel = await tf.loadLayersModel('localstorage://enemy-selection-model');
      this.structureModel = await tf.loadLayersModel('localstorage://structure-placement-model');
    } catch (error) {
      console.error('Model yükleme hatası:', error);
    }
  }

  async spawnEnemy(level: number, enemyCount: number, mapDensity: number): Promise<void> {
    if (!this.enemyModel) return;

    const input = tf.tensor2d([[level, enemyCount, mapDensity]]);
    const prediction = this.enemyModel.predict(input) as tf.Tensor;
    const [enemyType, spawnCount] = await prediction.data();
    input.dispose();
    prediction.dispose();

    const characterData: CharacterData[] = this.modelsLoader.getCharacterData();
    const characterIds = characterData.map(c => c.id);
    for (let i = 0; i < Math.round(spawnCount); i++) {
      const id = characterIds[Math.floor(Math.random() * characterIds.length)];
      const model = this.modelsLoader.getModel(id).scene.clone();
      const position = new Vector3(Math.random() * 20 - 10, 0, Math.random() * 20 - 10);
      model.position.copy(position);

      const enemy = {
        model,
        health: 50,
        speed: enemyType > 0.5 ? 80 : 50,
        damage: enemyType > 0.5 ? 15 : 20,
      };

      // Zigzag hareket (AI özelliği)
      if (enemyType > 0.5) {
        this.applyZigzagMovement(enemy, level);
      }

      this.enemies.push(enemy);
      this.scene.add(model);
    }
  }

  private applyZigzagMovement(enemy: { model: THREE.Object3D; speed: number }, level: number): void {
    let direction = 1;
    setInterval(() => {
      const offset = direction * 0.5; // Zigzag genişliği
      enemy.model.position.x += offset * enemy.speed * 0.01;
      direction *= -1; // Yön değiştir
    }, 1000 / level); // Seviyeye bağlı hız
  }

  async addStructure(level: number, buildingCount: number, region: string): Promise<void> {
    if (!this.structureModel) return;

    const regionId = region === 'suburb' ? 0 : 1;
    const input = tf.tensor2d([[level, buildingCount, regionId]]);
    const prediction = this.structureModel.predict(input) as tf.Tensor;
    const [buildingIdx, xNorm, zNorm] = await prediction.data();
    input.dispose();
    prediction.dispose();

    const buildingIds = ['building-type-a', 'building-type-b', 'building-type-c', 'building-type-d'];
    const id = buildingIds[Math.round(buildingIdx * (buildingIds.length - 1))];
    const x = xNorm * 100 - 50; // Denormalize: -50 to 50
    const z = zNorm * 100 - 50;

    // Harita optimizasyonu: Çakışma kontrolü
    const cityData: CityData = this.modelsLoader.getCityData();
    const building = cityData.buildings.find(b => b.id === id);
    if (!building) return;

    const newPosition = new Vector3(x, 0, z);
    const isValid = this.checkCollision(newPosition, building.size);
    if (!isValid) return; // Çakışma varsa ekleme

    const model = this.modelsLoader.getModel(id).scene.clone();
    model.position.copy(newPosition);
    this.scene.add(model);
  }

  private checkCollision(position: Vector3, size: { width: number; depth: number }): boolean {
    // Basit çakışma kontrolü: Mevcut binalarla mesafe
    const minDistance = 5; // Minimum mesafe
    for (const building of this.scene.children.filter(obj => obj.userData.type === 'building')) {
      const dist = position.distanceTo(building.position);
      if (dist < minDistance + Math.max(size.width, size.depth)) {
        return false;
      }
    }
    return true;
  }

  spawnEvent(level: number): void {
    if (level === 3) {
      const model = this.modelsLoader.getModel('detail-parasol').scene.clone();
      const position = new Vector3(Math.random() * 20 - 10, 0, Math.random() * 20 - 10);
      model.position.copy(position);
      this.scene.add(model);
    }
  }

  generateDynamicTask(level: number): { description: string; xp: number } {
    // Dinamik görev (AI özelliği)
    const tasks = [
      { description: `Seviye ${level} için ${level * 2} düşman yen`, xp: level * 20 },
      { description: `Bir sağlık kiti bul`, xp: level * 15 },
      { description: `${level} bina keşfet`, xp: level * 25 },
    ];
    return tasks[Math.floor(Math.random() * tasks.length)];
  }
}
