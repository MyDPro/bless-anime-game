// src/core/main.ts
import * as tf from '@tensorflow/tfjs';
import { setWasmPaths } from '@tensorflow/tfjs-backend-wasm';
import '@tensorflow/tfjs-backend-wasm';
import { Game } from './Game';
import { NotificationManager } from './NotificationManager';
import { trainModels } from '../ai/trainModel';

// WASM dosyalarının yolunu ayarla
setWasmPaths('/');

// TensorFlow.js WASM backend'ini başlat
async function initializeTfBackend() {
  try {
    await tf.setBackend('wasm');
    console.log('TensorFlow.js WASM backend başlatıldı');
  } catch (error) {
    console.error('TensorFlow.js backend hatası:', error);
    NotificationManager.getInstance().show('AI başlatılamadı!', 'error');
    throw error;
  }
}

// Global bildirim fonksiyonu
(window as any).showNotification = (
  message: string,
  type: 'success' | 'error' | 'warning' = 'success',
  duration: number = 3000
) => {
  NotificationManager.getInstance().show(message, type, duration);
};

async function checkModelsExist(): Promise<boolean> {
  try {
    await tf.loadLayersModel('localstorage://enemy-selection-model');
    await tf.loadLayersModel('localstorage://structure-placement-model');
    return true;
  } catch (error) {
    console.warn('Modeller bulunamadı, eğitim başlatılacak:', error);
    return false;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  console.log('Sayfa yüklendi');
  const canvas = document.querySelector('#webgl-canvas') as HTMLCanvasElement;

  if (!canvas) {
    console.error('Canvas elementi bulunamadı!');
    NotificationManager.getInstance().show('Oyun başlatılamadı!', 'error');
    return;
  }

  try {
    await initializeTfBackend();
    const modelsExist = await checkModelsExist();
    if (!modelsExist) {
      NotificationManager.getInstance().show('AI modelleri eğitiliyor...', 'warning');
      await trainModels();
      NotificationManager.getInstance().show('AI modelleri hazır!', 'success');
    } else {
      console.log('AI modelleri zaten eğitilmiş, eğitim atlanıyor.');
    }

    const game = new Game(canvas);
    NotificationManager.getInstance().show('Hoş geldin!', 'success');
  } catch (error) {
    console.error('Oyun başlatma hatası:', error);
    NotificationManager.getInstance().show('Oyun başlatılamadı!', 'error');
  }
});
