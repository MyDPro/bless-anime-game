// src/core/main.ts
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-wasm';

async function initializeTfBackend() {
  try {
    await tf.ready(); // Backend hazır olana kadar bekle
    if (await tf.setBackend('wasm')) {
      console.log('TensorFlow.js WASM backend başlatıldı');
      // WASM bellek yapılandırması
      const wasmConfig = {
        simd: true,
        threads: true,
        memoryInitialSizeMB: 50,
        memoryMaximumSizeMB: 1000,
      };
      await tf.env().setFlags(wasmConfig);
    } else {
      throw new Error('WASM backend başlatılamadı');
    }
  } catch (error) {
    console.error('TensorFlow.js backend hatası:', error);
    console.log('CPU backend\'e geçiliyor...');
    await tf.setBackend('cpu');
    NotificationManager.getInstance().show('AI yavaş modda çalışıyor', 'warning');
  }
}
