// src/ai/AIManager.ts
import * as tf from '@tensorflow/tfjs';
import * as THREE from 'three';
import { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ModelsLoader, CharacterData, CityData } from '../utils/loadModels';
import { ErrorManager } from '../core/ErrorManager';

interface Task {
  id: number;
  description: string;
  target: number;
  progress: number;
  reward: number;
}

export class AIManager {
  private modelsLoader: ModelsLoader;
  private scene: THREE.Scene;
  private enemyModel: tf.LayersModel | null = null;
  private structureModel: tf.LayersModel | null = null;
  private enemies: { id: string; model: THREE.Object3D; health: number; speed: number; damage: number; type: string }[] = [];
  private structures: THREE.Object3D[] = [];
  private currentTask: Task | null = null;
  private nextTaskId: number = 1;

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
        const model: GLTF | undefined = this.modelsLoader.getModel(id);
        if (!model) continue;

        const instance = model.scene.clone();
        const position = new THREE.Vector3(
          Math.random() * 500 - 250, // 500x500 harita: [-250, 250]
          0,
          Math.random() * 500 - 250
        );
        instance.position.copy(position);

        const enemy = {
          id: id,
          model: instance,
          health: level * 50,
          speed: enemyType > 0.5 ? 80 : 50,
          damage: enemyType > 0.5 ? 15 : 20,
          type: enemyType > 0.5 ? 'fast' : 'basic',
        };

        if (enemy.type === 'fast') {
          this.applyZigzagMovement(enemy.id, level);
        }

        this.enemies.push(enemy);
        this.scene.add(instance);
      }
    } catch (error) {
      ErrorManager.getInstance().handleError(error as Error, 'AIManager.spawnEnemy');
    }
  }

  private applyZigzagMovement(id: string, level: number): void {
    let direction = 1;
    const interval = setInterval(() => {
      const enemy = this.enemies.find(e => e.id === id);
      if (!enemy) {
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
      const x = (xNorm * 100 - 50) * 5; // [0, 1] -> [-50, 50] -> [-250, 250]
      const z = (zNorm * 100 - 50) * 5; // [0, 1] -> [-50, 50] -> [-250, 250]

      const cityData: CityData = this.modelsLoader.getCityData();
      const building = cityData.buildings.find(b => b.id === id);
      if (!building) return;

      const position = new THREE.Vector3(x, 0, z);
      if (!this.checkCollision(position, building.size)) {
        console.log('Çarpışma tespit edildi, yapı eklenmedi');
        return;
      }

      const model: GLTF | undefined = this.modelsLoader.getModel(id);
      if (!model) return;

      const instance = model.scene.clone();
      instance.position.copy(position);
      instance.scale.setScalar(3); // Büyük harita için ölçek
      instance.userData = { type: 'building', id };
      this.structures.push(instance);
      this.scene.add(instance);
    } catch (error) {
      ErrorManager.getInstance().handleError(error as Error, 'AIManager.addStructure');
    }
  }

  private checkCollision(position: THREE.Vector3, size: { width: number; depth: number }): boolean {
    const minDistance = Math.max(size.width, size.depth) * 3 + 10; // 500x500 harita için optimize
    for (const obj of this.structures) {
      const dist = position.distanceTo(obj.position);
      if (dist < minDistance) {
        return false;
      }
    }
    return true;
  }

  spawnEvent(level: number): void {
    if (level === 3) {
      const model: GLTF | undefined = this.modelsLoader.getModel('detail-parasol');
      if (!model) return;

      const instance = model.scene.clone();
      const position = new THREE.Vector3(
        Math.random() * 500 - 250, // 500x500 harita
        0,
        Math.random() * 500 - 250
      );
      instance.position.copy(position);
      instance.scale.setScalar(3);
      instance.userData = { type: 'prop', effect: 'health_kit' };
      this.scene.add(instance);
    }
  }

  generateDynamicTask(level: number): void {
    const target = level * 2;
    const reward = level * 50;
    this.currentTask = {
      id: this.nextTaskId++,
      description: `Seviye ${level} için ${target} düşman yen`,
      target,
      progress: 0,
      reward,
    };
  }

  updateTaskProgress(increment: boolean): void {
    if (this.currentTask && increment) {
      this.currentTask.progress++;
    }
  }

  getCurrentTask(): Task | null {
    return this.currentTask;
  }

  getEnemies(): { id: string; model: THREE.Object3D; health: number; speed: number; damage: number; type: string }[] {
    return this.enemies;
  }

  getStructures(): THREE.Object3D[] {
    return this.structures;
  }
}
