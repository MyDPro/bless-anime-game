// src/ai/trainModel.ts
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-wasm';
import { NotificationManager } from '../core/NotificationManager';

interface EnemyData {
  level: number;
  enemy_count: number;
  map_density: number;
  enemy_type: number;
  spawn_count: number;
}

interface StructureData {
  level: number;
  building_count: number;
  region: number;
  building_id: string;
  x: number;
  z: number;
}

interface TrainingMetrics {
  epoch: number;
  loss: number;
  accuracy: number;
  validationLoss: number;
  validationAccuracy: number;
}

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
    console.error(`Veri yükleme hatası (${file}):`, error);
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

function normalizeData(data: any[], type: 'enemy' | 'structure'): any[] {
  return data.map(d => {
    if (type === 'enemy') {
      return {
        input: [
          d.level / 10,
          d.enemy_count / 100,
          d.map_density
        ],
        output: [
          d.enemy_type,
          d.spawn_count / 3
        ]
      };
    } else {
      return {
        input: [
          d.level / 10,
          d.building_count / 100,
          d.region
        ],
        output: [
          ['building-type-a', 'building-type-b', 'building-type-c', 'building-type-d']
            .indexOf(d.building_id) / 3,
          (d.x + 50) / 100,
          (d.z + 50) / 100
        ]
      };
    }
  });
}

function splitData(data: any[], trainRatio: number = 0.8) {
  const shuffled = [...data].sort(() => 0.5 - Math.random());
  const trainSize = Math.floor(data.length * trainRatio);
  return {
    train: shuffled.slice(0, trainSize),
    test: shuffled.slice(trainSize)
  };
}

async function trainEnemyModel(): Promise<void> {
  const data: EnemyData[] = await loadData<EnemyData>('enemy_selection_data.json');
  console.log(`Düşman verisi yüklendi: ${data.length} adet`);

  const normalizedData = normalizeData(data, 'enemy');
  const { train, test } = splitData(normalizedData);

  const model = tf.sequential({
    layers: [
      tf.layers.dense({
        units: 32,
        activation: 'relu',
        inputShape: [3],
        kernelRegularizer: tf.regularizers.l2({ l2: 0.01 })
      }),
      tf.layers.dropout({ rate: 0.2 }),
      tf.layers.dense({
        units: 16,
        activation: 'relu'
      }),
      tf.layers.dense({
        units: 2,
        activation: 'softmax'
      })
    ]
  });

  const optimizer = tf.train.adam(0.001);
  model.compile({
    optimizer,
    loss: 'meanSquaredError',
    metrics: ['accuracy']
  });

  const trainXs = tf.tensor2d(train.map(d => d.input));
  const trainYs = tf.tensor2d(train.map(d => d.output));
  const testXs = tf.tensor2d(test.map(d => d.input));
  const testYs = tf.tensor2d(test.map(d => d.output));

  try {
    await model.fit(trainXs, trainYs, {
      epochs: 50,
      batchSize: 32,
      validationData: [testXs, testYs],
      shuffle: true,
      callbacks: [
        tf.callbacks.earlyStopping({
          monitor: 'val_loss',
          patience: 5
        }),
        {
          onEpochEnd: (epoch, logs) => {
            const metrics: TrainingMetrics = {
              epoch: epoch + 1,
              loss: logs?.loss || 0,
              accuracy: logs?.acc || 0,
              validationLoss: logs?.val_loss || 0,
              validationAccuracy: logs?.val_acc || 0
            };
            console.log(
              `Epoch ${metrics.epoch}: ` +
              `loss = ${metrics.loss.toFixed(4)}, ` +
              `acc = ${metrics.accuracy.toFixed(4)}, ` +
              `val_loss = ${metrics.validationLoss.toFixed(4)}, ` +
              `val_acc = ${metrics.validationAccuracy.toFixed(4)}`
            );
          }
        }
      ]
    });

    await model.save('localstorage://enemy-selection-model');
    console.log('Düşman modeli kaydedildi');
  } finally {
    trainXs.dispose();
    trainYs.dispose();
    testXs.dispose();
    testYs.dispose();
  }
}

async function trainStructureModel(): Promise<void> {
  const data: StructureData[] = await loadData<StructureData>('structure_placement_data.json');
  console.log(`Yapı verisi yüklendi: ${data.length} adet`);

  const normalizedData = normalizeData(data, 'structure');
  const { train, test } = splitData(normalizedData);

  const model = tf.sequential({
    layers: [
      tf.layers.dense({
        units: 32,
        activation: 'relu',
        inputShape: [3],
        kernelRegularizer: tf.regularizers.l2({ l2: 0.01 })
      }),
      tf.layers.dropout({ rate: 0.2 }),
      tf.layers.dense({
        units: 16,
        activation: 'relu'
      }),
      tf.layers.dense({
        units: 3,
        activation: 'sigmoid'
      })
    ]
  });

  const optimizer = tf.train.adam(0.001);
  model.compile({
    optimizer,
    loss: 'meanSquaredError',
    metrics: ['accuracy']
  });

  const trainXs = tf.tensor2d(train.map(d => d.input));
  const trainYs = tf.tensor2d(train.map(d => d.output));
  const testXs = tf.tensor2d(test.map(d => d.input));
  const testYs = tf.tensor2d(test.map(d => d.output));

  try {
    await model.fit(trainXs, trainYs, {
      epochs: 50,
      batchSize: 32,
      validationData: [testXs, testYs],
      shuffle: true,
      callbacks: [
        tf.callbacks.earlyStopping({
          monitor: 'val_loss',
          patience: 5
        }),
        {
          onEpochEnd: (epoch, logs) => {
            const metrics: TrainingMetrics = {
              epoch: epoch + 1,
              loss: logs?.loss || 0,
              accuracy: logs?.acc || 0,
              validationLoss: logs?.val_loss || 0,
              validationAccuracy: logs?.val_acc || 0
            };
            console.log(
              `Epoch ${metrics.epoch}: ` +
              `loss = ${metrics.loss.toFixed(4)}, ` +
              `acc = ${metrics.accuracy.toFixed(4)}, ` +
              `val_loss = ${metrics.validationLoss.toFixed(4)}, ` +
              `val_acc = ${metrics.validationAccuracy.toFixed(4)}`
            );
          }
        }
      ]
    });

    await model.save('localstorage://structure-placement-model');
    console.log('Yapı modeli kaydedildi');
  } finally {
    trainXs.dispose();
    trainYs.dispose();
    testXs.dispose();
    testYs.dispose();
  }
}

export async function trainModels(): Promise<void> {
  try {
    await tf.ready();
    console.log('TensorFlow.js başlatıldı');
    
    NotificationManager.getInstance().show('AI modelleri eğitiliyor...', 'info');
    
    await Promise.all([
      trainEnemyModel(),
      trainStructureModel()
    ]);
    
    console.log('Tüm modeller eğitildi ve kaydedildi');
    NotificationManager.getInstance().show('AI modelleri hazır!', 'success');
  } catch (error) {
    console.error('Model eğitimi hatası:', error);
    NotificationManager.getInstance().show('Model eğitimi başarısız!', 'error');
    throw error;
  }
}
