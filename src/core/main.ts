// src/core/main.ts
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-wasm';
import { setWasmPaths } from '@tensorflow/tfjs-backend-wasm';
import { Game } from './Game';
import { NotificationManager } from './NotificationManager';
import { trainModels } from '../ai/trainModel';

// WASM backend için yolu ayarla
setWasmPaths('/');

// Global bildirim fonksiyonu
(window as any).showNotification = (
    message: string,
    type: 'success' | 'error' | 'warning' = 'success',
    duration: number = 3000
) => {
    NotificationManager.getInstance().show(message, type, duration);
};

// TensorFlow backend başlatma
async function initializeTfBackend() {
    try {
        await tf.setBackend('wasm');
        console.log('TensorFlow.js WASM backend başlatıldı');
    } catch (error) {
        console.error('TensorFlow.js backend hatası:', error);
        // CPU backend'e geç
        await tf.setBackend('cpu');
        console.log('CPU backend kullanılıyor');
    }
}

// Model kontrolü
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

// Oyun başlatma
document.addEventListener('DOMContentLoaded', async () => {
    console.log("Sayfa yüklendi");
    const canvas = document.querySelector('#webgl-canvas') as HTMLCanvasElement;

    if (!canvas) {
        console.error('Canvas elementi bulunamadı!');
        NotificationManager.getInstance().show('Oyun başlatılamadı!', 'error');
        return;
    }

    try {
        // AI sistemlerini başlat
        await initializeTfBackend();
        
        // Model kontrolü ve eğitimi
        const modelsExist = await checkModelsExist();
        if (!modelsExist) {
            NotificationManager.getInstance().show('AI modelleri eğitiliyor...', 'warning');
            try {
                await trainModels();
                NotificationManager.getInstance().show('AI modelleri hazır!', 'success');
            } catch (trainError) {
                console.error('Model eğitimi hatası:', trainError);
                NotificationManager.getInstance().show('Model eğitimi başarısız!', 'error');
            }
        } else {
            console.log('AI modelleri zaten eğitilmiş');
        }

        // Oyunu başlat
        const game = new Game(canvas);
        NotificationManager.getInstance().show('Hoş geldin!', 'success');
    } catch (error) {
        console.error('Oyun başlatma hatası:', error);
        NotificationManager.getInstance().show('Oyun başlatılamadı!', 'error');
    }
});
