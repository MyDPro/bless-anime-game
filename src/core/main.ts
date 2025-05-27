// src/core/main.ts
import { Game } from './Game';
import { NotificationManager } from './NotificationManager';

// Global bildirim fonksiyonu
(window as any).showNotification = (message: string, type: 'success' | 'error' | 'warning' = 'success', duration: number = 3000) => {
    NotificationManager.getInstance().show(message, type, duration);
};

// Oyun başlatma
document.addEventListener('DOMContentLoaded', () => {
    console.log("Sayfa yüklendi");
    const canvas = document.querySelector('#webgl-canvas') as HTMLCanvasElement;
    if (canvas) {
        const game = new Game(canvas);
        NotificationManager.getInstance().show('Hoş geldin!', 'success');
    } else {
        console.error('Canvas elementi bulunamadı!');
        NotificationManager.getInstance().show('Oyun başlatılamadı!', 'error');
    }
});
