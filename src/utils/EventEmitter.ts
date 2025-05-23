type EventCallback = (...args: any[]) => void;

export class EventEmitter {
    private events: Map<string, Set<EventCallback>>;

    constructor() {
        console.log("EventEmitter başlatılıyor");
        this.events = new Map();
    }

    on(event: string, callback: EventCallback): void {
        if (!callback) {
            console.error('Event callback tanımlanmamış');
            return;
        }

        if (!this.events.has(event)) {
            this.events.set(event, new Set());
        }
        
        this.events.get(event)!.add(callback);
        console.log(`Event listener eklendi: ${event}`);
    }

    emit(event: string, ...args: any[]): void {
        const callbacks = this.events.get(event);
        if (!callbacks || callbacks.size === 0) {
            console.log(`'${event}' için listener bulunamadı`);
            return;
        }

        callbacks.forEach(callback => {
            try {
                callback(...args);
            } catch (error) {
                console.error(`Event handler hatası (${event}):`, error);
            }
        });
    }

    off(event: string, callback: EventCallback): void {
        const callbacks = this.events.get(event);
        if (!callbacks) {
            console.log(`'${event}' için listener bulunamadı`);
            return;
        }

        const removed = callbacks.delete(callback);
        if (removed) {
            console.log(`Event listener kaldırıldı: ${event}`);
            // Eğer set boşsa, event'i tamamen kaldır
            if (callbacks.size === 0) {
                this.events.delete(event);
            }
        }
    }

    // Yeni: Belirli bir event'in tüm listener'larını temizle
    clearEvent(event: string): void {
        if (this.events.delete(event)) {
            console.log(`Tüm listener'lar temizlendi: ${event}`);
        }
    }

    // Yeni: Event listener sayısını öğren
    listenerCount(event: string): number {
        return this.events.get(event)?.size || 0;
    }
        }
