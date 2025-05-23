import { Game } from './Game';
import { NotificationManager } from './NotificationManager';

// Tip tanımlamaları
type NotificationType = 'success' | 'error' | 'warning';

interface GameConfig {
    canvasId: string;
    initialMessage: string;
    errorMessage: string;
    welcomeMessage: string;
}

// Global window interface genişletmesi
declare global {
    interface Window {
        showNotification(
            message: string, 
            type?: NotificationType, 
            duration?: number
        ): void;
        gameInstance?: Game;
    }
}

class GameInitializer {
    private static instance: GameInitializer;
    private readonly config: GameConfig = {
        canvasId: '#webgl-canvas',
        initialMessage: 'Oyun yükleniyor...',
        errorMessage: 'Oyun başlatılamadı!',
        welcomeMessage: 'Hoş geldin!'
    };

    private constructor() {
        console.log(`GameInitializer başlatılıyor - ${new Date().toISOString()} - User: MyDemir`);
    }

    static getInstance(): GameInitializer {
        if (!GameInitializer.instance) {
            GameInitializer.instance = new GameInitializer();
        }
        return GameInitializer.instance;
    }

    private setupGlobalNotification(): void {
        window.showNotification = (
            message: string,
            type: NotificationType = 'success',
            duration: number = 3000
        ): void => {
            try {
                NotificationManager.getInstance().show(message, type, duration);
            } catch (error) {
                console.error('Bildirim gösterme hatası:', error);
            }
        };
    }

    private initializeGame(): void {
        console.log('Oyun başlatılıyor...');
        
        const canvas = document.querySelector(this.config.canvasId);
        
        if (!(canvas instanceof HTMLCanvasElement)) {
            this.handleError('Canvas elementi bulunamadı!');
            return;
        }

        try {
            window.gameInstance = new Game(canvas);
            this.showWelcomeMessage();
        } catch (error) {
            this.handleError(`Oyun başlatma hatası: ${error}`);
        }
    }

    private handleError(message: string): void {
        console.error(message);
        NotificationManager.getInstance().show(
            this.config.errorMessage,
            'error'
        );
    }

    private showWelcomeMessage(): void {
        const currentTime = new Date().toISOString();
        console.log(`Kullanıcı girişi - ${currentTime} - MyDemir`);
        
        NotificationManager.getInstance().show(
            `${this.config.welcomeMessage} MyDemir!`,
            'success'
        );
    }

    public start(): void {
        try {
            this.setupGlobalNotification();
            
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    this.initializeGame();
                });
            } else {
                this.initializeGame();
            }
            
        } catch (error) {
            this.handleError(`Başlatma hatası: ${error}`);
        }
    }

    public static cleanup(): void {
        if (window.gameInstance) {
            // Game sınıfında dispose metodu olduğunu varsayıyoruz
            // window.gameInstance.dispose();
            delete window.gameInstance;
        }
    }
}

// Oyunu başlat
GameInitializer.getInstance().start();

// Sayfa kapatılırken temizlik
window.addEventListener('beforeunload', () => {
    GameInitializer.cleanup();
});
