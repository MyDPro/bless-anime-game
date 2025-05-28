import * as tf from '@tensorflow/tfjs';
import * as THREE from 'three';
import { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ModelsLoader, CharacterData, CityData } from '../utils/loadModels';
import { ErrorManager } from '../core/ErrorManager';

export class AIManager {
  private modelsLoader: ModelsLoader;
  private scene: THREE.Scene;
  private enemyModel: tf.LayersModel | null = null;
  private structureModel: tf.LayersModel | null = null;
  private enemies: { model: THREE.Object3D; health: number; speed: number; damage: number; type: 'basic' | 'fast' }[] = [];

  constructor(modelsLoader: ModelsLoader, scene: THREE.Scene) {
    this.modelsLoader = modelsLoader;
    this.scene = scene;
    this.loadModels();
  }

  private async loadModels(): Promise<void> {
    try {
      this.enemyModel = await tf.loadLayersModel('localstorage://enemy-selection-model');
      this.structureModel = await tf.loadLayersModel('localstorage://structure-placement-model');
      console.log('AI modelleri yüklendi');
    } catch (error) {
      ErrorManager.getInstance().handleError(error as Error, 'AIManager.loadModels');
    }
  }

  async spawnEnemy(level: number, enemyCount: number, mapDensity: number): Promise<void> {
    if (!this.enemyModel) {
      ErrorManager.getInstance().handleError(new Error('Düşman modeli yüklenmedi'), 'AIManager.spawnEnemy');
      return;
    }

    try {
      const input = tf.tensor2d([[level, enemyCount, mapDensity]]);
      const prediction = this.enemyModel.predict(input) as tf.Tensor;
      const [enemyType, spawnCount] = await prediction.data();
      input.dispose();
      prediction.dispose();

      const characterData: CharacterData[] = this.modelsLoader.getAllCharacterData();
      const characterIds = characterData.map(c => c.id);

      for (let i = 0; i < Math.round(spawnCount); i++) {
        const id = characterIds[Math.floor(Math.random() * characterIds.length)];
        const model: GLTF = this.modelsLoader.getModel(id);
        if (!model) continue;

        const instance = model.scene.clone();
        const position = new THREE.Vector3(Math.random() * 20 - 10, 0, Math.random() * 20 - 10);
        instance.position.copy(position);

        const enemy = {
          model: instance,
          health: 50,
          speed: enemyType > 0.5 ? 80 : 50,
          damage: enemyType > 0.5 ? 15 : 20,
          type: enemyType > 0.5 ? 'fast' : 'basic',
        };

        // Zigzag hareket
        if (enemy.type === 'fast') {
          this.applyZigzagMovement(enemy, level);
        }

        this.enemies.push(enemy);
        this.scene.add(instance);
      }
    } catch (error) {
      ErrorManager.getInstance().handleError(error as Error, 'AIManager.spawnEnemy');
    }
  }

  private applyZigzagMovement(enemy: { model: THREE.Object3D; speed: number }, level: number): void {
    let direction = 1;
    const interval = setInterval(() => {
      if (!this.enemies.includes(enemy)) {
        clearInterval(interval);
        return;
      }
      const offset = direction * 0.5;
      enemy.model.position.x += offset * enemy.speed * 0.01;
      direction *= -1;
    }, 1000 / level);
  }

  async addStructure(level: number, buildingCount: number, region: string): Promise<void> {
    if (!this.structureModel) {
      ErrorManager.getInstance().handleError(new Error('Yapı modeli yüklenmedi'), 'AIManager.addStructure');
      return;
    }

    try {
      const regionId = region === 'suburb' ? 0 : 1;
      const input = tf.tensor2d([[level, buildingCount, regionId]]);
      const prediction = this.structureModel.predict(input) as tf.Tensor;
      const [buildingIdx, xNorm, zNorm] = await prediction.data();
      input.dispose();
      prediction.dispose();

      const buildingIds = ['building-type-a', 'building-type-b', 'building-type-c', 'building-type-d'];
      const id = buildingIds[Math.round(buildingIdx * (buildingIds.length - 1))];
      const x = xNorm * 100 - 50; // Denormalize
      const z = zNorm * 100 - 50;

      const cityData: CityData = this.modelsLoader.getCityData();
      const building = cityData.buildings.find(b => b.id === id);
      if (!building) return;

      const position = new THREE.Vector3(x, 0, z);
      if (!this.checkCollision(position, building.size)) {
        console.log('Çakışma tespit edildi, yapı eklenmedi');
        return;
      }

      const model: GLTF = this.modelsLoader.getModel(id);
      if (!model) return;

      const instance = model.scene.clone();
      instance.position.copy(position);
      instance.userData.type = 'building';
      this.scene.add(instance);
    } catch (error) {
      ErrorManager.getInstance().handleError(error as Error, 'AIManager.addStructure');
    }
  }

  private checkCollision(position: THREE.Vector3, size: { width: number; depth: number }): boolean {
    const minDistance = 5;
    for (const obj of this.scene.children.filter(o => o.userData.type === 'building')) {
      const dist = position.distanceTo(obj.position);
      if (dist < minDistance + Math.max(size.width, size.depth)) {
        return false;
      }
    }
    return true;
  }

  spawnEvent(level: number): void {
    if (level === 3) {
      const model: GLTF = this.modelsLoader.getModel('detail-parasol');
      if (!model) return;

      const instance = model.scene.clone();
      const position = new THREE.Vector3(Math.random() * 20 - 10, 0, Math.random() * 20 - 10);
      instance.position.copy(position);
      instance.userData.type = 'prop';
      instance.userData.effect = 'health_kit';
      this.scene.add(instance);
    }
  }

  generateDynamicTask(level: number): { description: string; xp: number } {
    const tasks = [
      { description: `Seviye ${level} için ${level * 2} düşman yen`, xp: level * 20 },
      { description: `Bir sağlık kiti bul`, xp: level * 15 },
      { description: `${level} bina keşfet`, xp: level * 25 },
    ];
    return tasks[Math.floor(Math.random() * tasks.length)];
  }
}
