import * as tf from '@tensorflow/tfjs';
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

async function loadData<T>(file: string, fallbackData: T[] = []): Promise<T[]> {
  try {
    const response = await fetch(`/data/${file}`, { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`Veri dosyası yüklenemedi: ${file} (${response.status})`);
    }
    const text = await response.text();
    try {
      const data = JSON.parse(text);
      console.log(`${file} yüklendi: ${data.length} kayıt`);
      return data;
    } catch (e) {
      console.error(`JSON parse hatası (${file}):`, e);
      console.log('Problematik içerik:', text.slice(-200));
      NotificationManager.getInstance().show(`${file} sözdizimi hatası!`, 'error');
      return fallbackData;
    }
  } catch (error) {
    console.error(`Veri yükleme hatası (${file}):`, error);
    NotificationManager.getInstance().show(`${file} yüklenemedi!`, 'error');
    return fallbackData;
  }
}

function validateData(data: any[], file: string): void {
  if (!Array.isArray(data)) {
    throw new Error(`Geçersiz veri formatı: ${file} bir dizi olmalı`);
  }
  data.forEach((item, index) => {
    if (typeof item !== 'object') {
      throw new Error(`Geçersiz veri: ${file} [${index}] bir nesne olmalı`);
    }
  });
}

async function trainEnemyModel(): Promise<tf.LayersModel> {
  const data: EnemyData[] = await loadData<EnemyData>('enemy_selection_data.json', [
    { level: 1, enemy_count: 1, map_density: 0.3, enemy_type: 0, spawn_count: 1 }
  ]);
  if (!data.length) {
    console.warn('Düşman verisi boş, yedek model kullanılıyor');
    NotificationManager.getInstance().show('Düşman verisi eksik!', 'warning');
  }

  const xs = tf.tensor2d(data.map(d => [d.level, d.enemy_count, d.map_density]));
  const ys = tf.tensor2d(data.map(d => [d.enemy_type, d.spawn_count]));
  const model = tf.sequential();
  model.add(tf.layers.dense({ units: 64, activation: 'relu', inputShape: [3] }));
  model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 2 }));
  model.compile({ optimizer: 'adam', loss: 'meanSquaredError' });

  await model.fit(xs, ys, {
    epochs: 50,
    batchSize: 32,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        console.log(`Epoch ${epoch}: loss = ${logs?.loss}`);
      }
    }
  });

  xs.dispose();
  ys.dispose();
  await model.save('localstorage://enemy-selection-model');
  return model;
}

async function trainStructureModel(): Promise<tf.LayersModel> {
  const data: StructureData[] = await loadData<StructureData>('structure_placement_data.json', [
    {
      level: 1,
      building_count: 1,
      region: 0,
      building_id: 'building-type-a',
      x: 0,
      z: 0
    }
  ]);
  if (!data.length) {
    console.warn('Yapı verisi boş, yedek model kullanılıyor');
    NotificationManager.getInstance().show('Yapı verisi eksik!', 'warning');
  }

  const buildingIdMap: { [key: string]: number } = {
    'building-type-a': 0,
    'building-type-b': 1,
    'building-type-c': 2,
    'building-type-d': 3
  };
  const xs = tf.tensor2d(data.map(d => [d.level, d.building_count, d.region]));
  const ys = tf.tensor2d(
    data.map(d => [buildingIdMap[d.building_id] || 0, d.x, d.z])
  );
  const model = tf.sequential();
  model.add(tf.layers.dense({ units: 64, activation: 'relu', inputShape: [3] }));
  model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 3 }));
  model.compile({ optimizer: 'adam', loss: 'meanSquaredError' });

  await model.fit(xs, ys, {
    epochs: 50,
    batchSize: 32,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        console.log(`Epoch ${epoch}: loss = ${logs?.loss}`);
      }
    }
  });

  xs.dispose();
  ys.dispose();
  await model.save('localstorage://structure-placement-model');
  return model;
}

async function trainModels(): Promise<void> {
  try {
    await Promise.all([trainEnemyModel(), trainStructureModel()]);
    console.log('Modeller eğitildi ve kaydedildi');
    NotificationManager.getInstance().show('AI modelleri eğitildi!', 'success');
  } catch (error) {
    console.error('Model eğitimi hatası:', error);
    NotificationManager.getInstance().show('Model eğitimi başarısız!', 'error');
    throw error;
  }
}

export { trainModels, trainEnemyModel, trainStructureModel };
