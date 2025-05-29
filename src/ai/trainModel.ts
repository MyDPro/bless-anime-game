// src/ai/trainModel.ts
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-wasm';
import { ErrorManager } from '../core/ErrorManager';
import { NotificationManager } from '../core/NotificationManager';

// Veri tipleri
interface EnemyData {
  level: number;
  enemy_count: number;
  map_density: number;
  enemy_type: number; // 0: temel, 1: hızlı
  spawn_count: number; // 1-3
}

interface StructureData {
  level: number;
  building_count: number;
  region: number; // 0: suburb, 1: city_center
  building_id: string;
  x: number; // [-50, 50]
  z: number; // [-50, 50]
}

interface NormalizedData {
  inputs: number[];
  outputs: number[];
}

interface DataSplit {
  train: NormalizedData[];
  test: NormalizedData[];
}

// Veri yükleme ve doğrulama
async function loadData<T>(file: string): Promise<T[]> {
  try {
    const response = await fetch(`/data/${file}`);
    if (!response.ok) {
      throw new Error(`Veri dosyası yüklenemedi: ${file} (${response.status})`);
    }
    
    const text = await response.text();
    try {
      const data = JSON.parse(text);
      validateData(data, file);
      return data;
    } catch (e) {
      console.error('JSON parse hatası:', e);
      console.log('Problematik içerik:', text.substring(0, 200));
      throw new Error(`JSON parse hatası: ${e.message}`);
    }
  } catch (error) {
    ErrorManager.getInstance().handleError(error as Error, 'loadData');
    throw error;
  }
}

function validateData(data: any[], file: string): void {
  if (!Array.isArray(data)) {
    throw new Error('Veri array formatında değil');
  }
  
  if (data.length === 0) {
    throw new Error('Veri seti boş');
  }
  
  const sample = data[0];
  const requiredFields = file.includes('enemy') 
    ? ['level', 'enemy_count', 'map_density', 'enemy_type', 'spawn_count']
    : ['level', 'building_count', 'region', 'building_id', 'x', 'z'];
    
  for (const field of requiredFields) {
    if (!(field in sample)) {
      throw new Error(`Eksik alan: ${field}`);
    }
  }
}

// Veri normalizasyonu
function normalizeEnemyData(data: EnemyData[]): NormalizedData[] {
  return data.map(d => ({
    inputs: [
      d.level / 10,
      d.enemy_count / 100,
      d.map_density
    ],
    outputs: [
      d.enemy_type,
      d.spawn_count / 3
    ]
  }));
}

function normalizeStructureData(data: StructureData[]): NormalizedData[] {
  const buildingIds = ['building-type-a', 'building-type-b', 'building-type-c', 'building-type-d'];
  
  return data.map(d => ({
    inputs: [
      d.level / 10,
      d.building_count / 100,
      d.region
    ],
    outputs: [
      buildingIds.indexOf(d.building_id) / (buildingIds.length - 1),
      (d.x + 50) / 100,
      (d.z + 50) / 100
    ]
  }));
}

function splitData(data: NormalizedData[], trainRatio: number): DataSplit {
  const shuffled = [...data].sort(() => 0.5 - Math.random());
  const trainSize = Math.floor(data.length * trainRatio);
  return {
    train: shuffled.slice(0, trainSize),
    test: shuffled.slice(trainSize)
  };
}

// Model oluşturma
function createEnemyModel(): tf.Sequential {
  const model = tf.sequential({
    layers: [
      tf.layers.dense({
        units: 32,
        activation: 'relu',
        inputShape: [3],
        kernelRegularizer: tf.regularizers.l2({ l2: 0.01 })
      }),
      tf.layers.dropout({ rate: 0.2 }),
      tf.layers.dense({ units: 16, activation: 'relu' }),
      tf.layers.dense({ units: 2, activation: 'softmax' })
    ]
  });

  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: 'meanSquaredError',
    metrics: ['accuracy']
  });

  return model;
}

function createStructureModel(): tf.Sequential {
  const model = tf.sequential({
    layers: [
      tf.layers.dense({
        units: 32,
        activation: 'relu',
        inputShape: [3],
        kernelRegularizer: tf.regularizers.l2({ l2: 0.01 })
      }),
      tf.layers.dropout({ rate: 0.2 }),
      tf.layers.dense({ units: 16, activation: 'relu' }),
      tf.layers.dense({ units: 3, activation: 'sigmoid' })
    ]
  });

  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: 'meanSquaredError',
    metrics: ['accuracy']
  });

  return model;
}

// Model eğitimi
async function trainEnemyModel(): Promise<void> {
  try {
    const data = await loadData<EnemyData>('enemy_selection_data.json');
    console.log(`Düşman verisi yüklendi: ${data.length} adet`);

    const normalizedData = normalizeEnemyData(data);
    const { train, test } = splitData(normalizedData, 0.8);

    const model = createEnemyModel();

    const history = await model.fit(
      tf.tensor2d(train.map(d => d.inputs)),
      tf.tensor2d(train.map(d => d.outputs)),
      {
        epochs: 50,
        batchSize: 32,
        validationSplit: 0.2,
        shuffle: true,
        callbacks: [
          tf.callbacks.earlyStopping({ patience: 5 }),
          {
            onEpochEnd: (epoch, logs) => {
              console.log(
                `Epoch ${epoch + 1}: ` +
                `loss = ${logs?.loss.toFixed(4)}, ` +
                `acc = ${logs?.acc.toFixed(4)}, ` +
                `val_loss = ${logs?.val_loss.toFixed(4)}`
              );
            }
          }
        ]
      }
    );

    const evaluation = await model.evaluate(
      tf.tensor2d(test.map(d => d.inputs)),
      tf.tensor2d(test.map(d => d.outputs))
    );

    console.log('Düşman modeli test sonuçları:', evaluation);
    await model.save('localstorage://enemy-selection-model');
    console.log('Düşman modeli kaydedildi');

  } catch (error) {
    ErrorManager.getInstance().handleError(error as Error, 'trainEnemyModel');
    throw error;
  }
}

async function trainStructureModel(): Promise<void> {
  try {
    const data = await loadData<StructureData>('structure_placement_data.json');
    console.log(`Yapı verisi yüklendi: ${data.length} adet`);

    const normalizedData = normalizeStructureData(data);
    const { train, test } = splitData(normalizedData, 0.8);

    const model = createStructureModel();

    const history = await model.fit(
      tf.tensor2d(train.map(d => d.inputs)),
      tf.tensor2d(train.map(d => d.outputs)),
      {
        epochs: 50,
        batchSize: 32,
        validationSplit: 0.2,
        shuffle: true,
        callbacks: [
          tf.callbacks.earlyStopping({ patience: 5 }),
          {
            onEpochEnd: (epoch, logs) => {
              console.log(
                `Epoch ${epoch + 1}: ` +
                `loss = ${logs?.loss.toFixed(4)}, ` +
                `acc = ${logs?.acc.toFixed(4)}, ` +
                `val_loss = ${logs?.val_loss.toFixed(4)}`
              );
            }
          }
        ]
      }
    );

    const evaluation = await model.evaluate(
      tf.tensor2d(test.map(d => d.inputs)),
      tf.tensor2d(test.map(d => d.outputs))
    );

    console.log('Yapı modeli test sonuçları:', evaluation);
    await model.save('localstorage://structure-placement-model');
    console.log('Yapı modeli kaydedildi');

  } catch (error) {
    ErrorManager.getInstance().handleError(error as Error, 'trainStructureModel');
    throw error;
  }
}

// Ana eğitim fonksiyonu
export async function trainModels(): Promise<void> {
  try {
    NotificationManager.getInstance().show('AI modelleri eğitiliyor...', 'info');
    await Promise.all([trainEnemyModel(), trainStructureModel()]);
    NotificationManager.getInstance().show('AI modelleri başarıyla eğitildi!', 'success');
    console.log('Tüm modeller eğitildi ve kaydedildi.');
  } catch (error) {
    NotificationManager.getInstance().show('Model eğitimi başarısız!', 'error');
    ErrorManager.getInstance().handleError(error as Error, 'trainModels');
    throw error;
  }
}
