import * as THREE from 'three';
import { ModelsLoader } from '../utils/loadModels';
import { NotificationManager } from './NotificationManager';
import { EventEmitter } from '../utils/EventEmitter';

// Arayüz tanımlamaları
interface Character {
    id: string;
    name: string;
    modelPath: string;
    stats: { speed: number; power: number };
}

interface CharacterPreview {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    model?: THREE.Object3D;
    animationId?: number; // Animasyon frame ID'si için
}

type MenuId = 'main' | 'character' | 'scoreboard' | 'settings' | 'pause' | 'gameOver' | 'none';

export class MenuManager {
    private readonly menus: Map<string, HTMLElement>;
    private activeMenu: MenuId | null = null;
    private selectedCharacter: string | null = null;
    private characterPreviews: Map<string, CharacterPreview> = new Map();
    private currentCarouselIndex: number = 0;
    private characters: Character[] = [];
    private readonly modelsLoader: ModelsLoader;
    private readonly eventEmitter: EventEmitter;

    // Sabit değerler
    private readonly CAMERA_SETTINGS = {
        FOV: 45,
        NEAR: 0.1,
        FAR: 1000,
        POSITION: { x: 0, y: 1.5, z: 3 },
        LOOKAT: { x: 0, y: 1, z: 0 }
    };

    private readonly LIGHT_SETTINGS = {
        AMBIENT: { color: 0xffffff, intensity: 0.6 },
        DIRECTIONAL: { color: 0xffffff, intensity: 1, position: { x: 2, y: 2, z: 2 } }
    };

    constructor() {
        console.log(`MenuManager başlatılıyor - ${new Date().toISOString()} - User: MyDemir`);
        this.modelsLoader = new ModelsLoader();
        this.eventEmitter = new EventEmitter();
        this.menus = new Map();
        
        // DOM yüklendikten sonra başlat
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initializeMenus());
        } else {
            this.initializeMenus();
        }
    }

    private async initializeMenus(): Promise<void> {
        try {
            await this.modelsLoader.loadCharacterModels();
            this.characters = this.modelsLoader.getAllCharacterData();
            
            if (!this.characters.length) {
                throw new Error("Karakter verileri yüklenemedi");
            }

            // Menüleri kaydet
            const menuIds: MenuId[] = ['main', 'character', 'scoreboard', 'settings', 'pause', 'gameOver'];
            menuIds.forEach(id => {
                const element = document.getElementById(id === 'main' ? 'main-menu' : id);
                if (element) {
                    this.menus.set(id, element);
                } else {
                    console.warn(`${id} menüsü bulunamadı`);
                }
            });

            await Promise.all([
                this.createCharacterCarousel(),
                this.setupEventListeners()
            ]);

        } catch (error) {
            console.error("Menü başlatma hatası:", error);
            NotificationManager.getInstance().show(
                "Menü sistemi başlatılamadı!", 
                'error'
            );
        }
    }

    private createCharacterCarousel(): void {
        const characterGrid = document.querySelector('.character-grid');
        if (!characterGrid) {
            throw new Error("Karakter gridi bulunamadı (.character-grid)");
        }

        // HTML şablonu
        characterGrid.innerHTML = this.generateCarouselHTML();

        // Karakter önizlemeleri ve dinleyicileri kur
        Promise.all([
            ...this.characters.map(char => this.setupCharacterPreview(char.id, char.modelPath)),
            this.setupCharacterCardListeners(),
            this.setupCarouselListeners()
        ]).then(() => {
            this.updateCarousel();
        }).catch(error => {
            console.error("Carousel kurulum hatası:", error);
            NotificationManager.getInstance().show(
                'Karakter seçim ekranı hazırlanamadı!', 
                'error'
            );
        });
    }

    private generateCarouselHTML(): string {
        return `
            <div class="character-carousel-container">
                <div class="character-carousel">
                    <div class="character-cards-wrapper">
                        ${this.characters.map(this.generateCharacterCardHTML).join('')}
                    </div>
                </div>
                <button class="carousel-button prev" aria-label="Önceki karakter">◄</button>
                <button class="carousel-button next" aria-label="Sonraki karakter">►</button>
                <div class="character-nav-dots">
                    ${this.generateNavDotsHTML()}
                </div>
            </div>
        `;
    }

    private generateCharacterCardHTML(char: Character): string {
        return `
            <div class="character-card" data-character="${char.id}">
                <div class="character-preview">
                    <canvas id="${char.id}-preview" class="character-canvas"></canvas>
                </div>
                <div class="character-info">
                    <h3>${char.name}</h3>
                    <div class="character-stats">
                        ${this.generateStatHTML('Hız', char.stats.speed)}
                        ${this.generateStatHTML('Güç', char.stats.power)}
                    </div>
                </div>
            </div>
        `;
    }

    private generateStatHTML(label: string, value: number): string {
        return `
            <div class="stat">
                <span class="stat-label">${label}</span>
                <div class="stat-bar">
                    <div class="stat-fill" style="width: ${value}%"></div>
                </div>
            </div>
        `;
    }

    private generateNavDotsHTML(): string {
        return this.characters
            .map((_, i) => `<span class="nav-dot${i === 0 ? ' active' : ''}" data-index="${i}"></span>`)
            .join('');
    }

    private async setupCharacterPreview(characterId: string, modelPath: string): Promise<void> {
        const canvas = document.getElementById(`${characterId}-preview`) as HTMLCanvasElement;
        if (!canvas) {
            throw new Error(`Canvas bulunamadı: ${characterId}-preview`);
        }

        // WebGL kontrolü
        if (!canvas.getContext('webgl') && !canvas.getContext('experimental-webgl')) {
            throw new Error('WebGL desteği bulunamadı');
        }

        // Sahne kurulumu
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(
            this.CAMERA_SETTINGS.FOV,
            canvas.clientWidth / canvas.clientHeight || 1,
            this.CAMERA_SETTINGS.NEAR,
            this.CAMERA_SETTINGS.FAR
        );

        const renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
        renderer.setSize(canvas.clientWidth || 300, canvas.clientHeight || 200);
        
        // Kamera pozisyonu
        camera.position.set(
            this.CAMERA_SETTINGS.POSITION.x,
            this.CAMERA_SETTINGS.POSITION.y,
            this.CAMERA_SETTINGS.POSITION.z
        );
        camera.lookAt(
            this.CAMERA_SETTINGS.LOOKAT.x,
            this.CAMERA_SETTINGS.LOOKAT.y,
            this.CAMERA_SETTINGS.LOOKAT.z
        );

        // Işıklandırma
        const ambientLight = new THREE.AmbientLight(
            this.LIGHT_SETTINGS.AMBIENT.color,
            this.LIGHT_SETTINGS.AMBIENT.intensity
        );
        scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(
            this.LIGHT_SETTINGS.DIRECTIONAL.color,
            this.LIGHT_SETTINGS.DIRECTIONAL.intensity
        );
        dirLight.position.set(
            this.LIGHT_SETTINGS.DIRECTIONAL.position.x,
            this.LIGHT_SETTINGS.DIRECTIONAL.position.y,
            this.LIGHT_SETTINGS.DIRECTIONAL.position.z
        );
        scene.add(dirLight);

        this.characterPreviews.set(characterId, { scene, camera, renderer });

        // Model yükleme
        const gltf = this.modelsLoader.getModel(characterId);
        if (gltf) {
            const model = gltf.scene.clone();
            model.scale.set(1, 1, 1);
            model.position.set(0, 0, 0);
            scene.add(model);

            const preview = this.characterPreviews.get(characterId);
            if (preview) {
                preview.model = model;
                this.animatePreview(characterId);
            }
        } else {
            throw new Error(`Model yüklenemedi: ${characterId}`);
        }
    }

    private animatePreview(characterId: string): void {
        const preview = this.characterPreviews.get(characterId);
        if (!preview) return;

        const animate = () => {
            if (!this.characterPreviews.has(characterId)) return;
            
            preview.animationId = requestAnimationFrame(animate);
            
            if (preview.model) {
                preview.model.rotation.y += 0.01;
            }
            
            preview.renderer.render(preview.scene, preview.camera);
        };

        animate();
    }

    // Event Listeners
    private setupEventListeners(): void {
        this.setupCharacterConfirmation();
        this.setupNavigationButtons();
        this.setupBackButtons();
        this.setupGameStartButton();
    }

    private setupCharacterConfirmation(): void {
        const confirmBtn = document.getElementById('confirmCharacter');
        if (!confirmBtn) {
            throw new Error("Karakter onay butonu bulunamadı");
        }

        confirmBtn.addEventListener('click', () => {
            if (this.selectedCharacter) {
                this.eventEmitter.emit('characterConfirmed', this.selectedCharacter);
                this.showMenu('main');
                NotificationManager.getInstance().show(
                    `Karakter seçildi: ${this.selectedCharacter}`, 
                    'success'
                );
            } else {
                NotificationManager.getInstance().show(
                    'Lütfen bir karakter seçin!', 
                    'warning'
                );
            }
        });
    }

    private setupNavigationButtons(): void {
        const buttons = {
            characterSelect: document.getElementById('characterSelectBtn'),
            scoreboard: document.getElementById('scoreboardBtn'),
            settings: document.getElementById('settingsBtn')
        };

        Object.entries(buttons).forEach(([key, button]) => {
            button?.addEventListener('click', () => {
                const menuId = key.replace('Btn', '') as MenuId;
                this.showMenu(menuId);
            });
        });
    }

    private setupBackButtons(): void {
        ['Character', 'Scoreboard', 'Settings'].forEach(menu => {
            document.getElementById(`backFrom${menu}`)?.addEventListener('click', () => {
                this.showMenu('main');
            });
        });
    }

    private setupGameStartButton(): void {
        document.getElementById('startBtn')?.addEventListener('click', () => {
            this.eventEmitter.emit('gameStart');
            this.showMenu('none');
            NotificationManager.getInstance().show('Oyun başlatılıyor...', 'success');
        });
    }

    public showMenu(menuId: MenuId): void {
        if (this.activeMenu) {
            this.menus.get(this.activeMenu)?.classList.add('hidden');
        }

        if (menuId !== 'none') {
            const newMenu = this.menus.get(menuId);
            if (newMenu) {
                newMenu.classList.remove('hidden');
                this.activeMenu = menuId;
                
                if (menuId === 'character') {
                    this.updateCarousel();
                }
            } else {
                console.error(`Menü bulunamadı: ${menuId}`);
            }
        } else {
            this.activeMenu = null;
        }
    }

    // Public methods
    public getSelectedCharacter(): string | null {
        return this.selectedCharacter;
    }

    public getEventEmitter(): EventEmitter {
        return this.eventEmitter;
    }

    // Cleanup method
    public dispose(): void {
        // Animasyonları temizle
        this.characterPreviews.forEach((preview, id) => {
            if (preview.animationId) {
                cancelAnimationFrame(preview.animationId);
            }
            preview.renderer.dispose();
        });
        this.characterPreviews.clear();

        // Event listener'ları temizle
        this.eventEmitter = new EventEmitter();
    }
              }
