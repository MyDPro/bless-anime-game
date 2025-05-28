// src/core/main.ts
import { Game } from './Game';
import { NotificationManager } from './NotificationManager';
import { trainModels } from '../ai/trainModel'; // trainModel.ts'den import
import * as tf from '@tensorflow/tfjs';

// Global bildirim fonksiyonu
(window as any).showNotification = (message: string, type: 'success' | 'error' | 'warning' = 'success', duration: number = 3000) => {
    NotificationManager.getInstance().show(message, type, duration);
};

// Modellerin varlığını kontrol eden yardımcı fonksiyon
async function checkModelsExist(): Promise<boolean> {
    try {
        // AIManager'da kullanılan model yollarını kontrol et
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
        // Modellerin varlığını kontrol et
        const modelsExist = await checkModelsExist();
        if (!modelsExist) {
            // Modeller yoksa eğitimi başlat
            NotificationManager.getInstance().show('AI modelleri eğitiliyor...', 'warning');
            await trainModels();
            NotificationManager.getInstance().show('AI modelleri hazır!', 'success');
        } else {
            console.log('AI modelleri zaten eğitilmiş, eğitim atlanıyor.');
        }

        // Oyun başlat
        const game = new Game(canvas);
        NotificationManager.getInstance().show('Hoş geldin!', 'success');
    } catch (error) {
        console.error('Oyun başlatma hatası:', error);
        NotificationManager.getInstance().show('Oyun başlatılamadı!', 'error');
    }
});
