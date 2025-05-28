import * as tf from '@tensorflow/tfjs';

// Veri tipi tanımları
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
  x: number;
  z: number;
}

// Veri yükleme
async function loadData<T>(file: string): Promise<T[]> {
  const response = await fetch(`/data/${file}`);
  return await response.json();
}

// Düşman seçimi modeli
async function trainEnemyModel(): Promise<void> {
  const data: EnemyData[] = await loadData<EnemyData>('enemy_selection_data.json');

  const xs = tf.tensor2d(data.map(d => [d.level, d.enemy_count, d.map_density]));
  const ys = tf.tensor2d(data.map(d => [d.enemy_type, d.spawn_count]));

  const model = tf.sequential();
  model.add(tf.layers.dense({ units: 16, activation: 'relu', inputShape: [3] }));
  model.add(tf.layers.dense({ units: 8, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 2, activation: 'softmax' }));

  model.compile({
    optimizer: 'adam',
    loss: 'meanSquaredError',
    metrics: ['accuracy'],
  });

  await model.fit(xs, ys, {
    epochs: 50,
    shuffle: true,
    callbacks: {
      onEpochEnd: (epoch, logs) => console.log(`Epoch ${epoch}: loss = ${logs?.loss}`),
    },
  });

  await model.save('localstorage://enemy-selection-model');
  xs.dispose();
  ys.delete();
}

// Yapı yerleşimi modeli
async function trainStructureModel(): Promise<void> {
  const data: StructureData[] = await loadData<StructureData>('structure_placement_data.json');
  const buildingIds = ['building-type-a', 'building-type-b', 'building-type-c', 'building-type-d'];

  const xs = tf.tensor2d(data.map(d => [d.level, d.building_count, d.region]));
  const ys = tf.tensor2d(data.map(d => [
    buildingIds.indexOf(d.building_id) / (buildingIds.length - 1), // Normalize: 0-1
    (d.x + 50) / 100, // Normalize: -50 to 50 -> 0 to 1
    (d.z + 50) / 100,
  ]));

  const model = tf.sequential();
  model.add(tf.layers.dense({ units: 16, activation: 'relu', inputShape: [3] }));
  model.add(tf.layers.dense({ units: 8, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 3, activation: 'sigmoid' }));

  model.compile({
    optimizer: 'adam',
    loss: 'meanSquaredError',
    metrics: ['accuracy'],
  });

  await model.fit(xs, ys, {
    epochs: 50,
    shuffle: true,
    callbacks: {
      onEpochEnd: (epoch, logs) => console.log(`Epoch ${epoch}: loss = ${logs?.loss}`),
    },
  });

  await model.save('localstorage://structure-placement-model');
  xs.dispose();
  ys.delete();
}

// Eğitim başlat
export async function trainModels(): Promise<void> {
  await Promise.all([trainEnemyModel(), trainStructureModel()]);
  console.log('Modeller eğitildi ve kaydedildi.');
}
