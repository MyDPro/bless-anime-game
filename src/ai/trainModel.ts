// src/ai/trainModel.ts
async function trainEnemyModel(): Promise<void> {
  const data: EnemyData[] = await loadData<EnemyData>('enemy_selection_data.json');
  
  // Veri normalizasyonu
  const normalizedData = normalizeData(data);
  
  // Veriyi eğitim ve test setlerine ayır
  const [trainData, testData] = splitData(normalizedData, 0.8);
  
  const model = tf.sequential({
    layers: [
      tf.layers.dense({
        units: 32,
        activation: 'relu',
        inputShape: [3],
        kernelRegularizer: tf.regularizers.l2({ l2: 0.01 })
      }),
      tf.layers.dropout({ rate: 0.2 }), // Overfitting önleme
      tf.layers.dense({ units: 16, activation: 'relu' }),
      tf.layers.dense({ units: 2, activation: 'softmax' })
    ]
  });

  // Model konfigürasyonu
  const optimizer = tf.train.adam(0.001);
  model.compile({
    optimizer,
    loss: 'meanSquaredError',
    metrics: ['accuracy']
  });

  // Eğitim
  const history = await model.fit(
    tf.tensor2d(trainData.inputs),
    tf.tensor2d(trainData.outputs),
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

  // Model değerlendirme
  const evaluation = await model.evaluate(
    tf.tensor2d(testData.inputs),
    tf.tensor2d(testData.outputs)
  );
  console.log('Test sonuçları:', evaluation);

  await model.save('localstorage://enemy-selection-model');
}

// Yardımcı fonksiyonlar
function normalizeData(data: EnemyData[]) {
  return data.map(d => ({
    inputs: [
      d.level / 10, // Seviye normalizasyonu
      d.enemy_count / 100, // Düşman sayısı normalizasyonu
      d.map_density // Zaten 0-1 arası
    ],
    outputs: [d.enemy_type, d.spawn_count / 3] // spawn_count'u 0-1 arasına normalize et
  }));
}

function splitData(data: any[], trainRatio: number) {
  const shuffled = [...data].sort(() => 0.5 - Math.random());
  const trainSize = Math.floor(data.length * trainRatio);
  return {
    train: shuffled.slice(0, trainSize),
    test: shuffled.slice(trainSize)
  };
}
