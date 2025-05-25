import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { NotificationManager } from './NotificationManager';
import { EventEmitter } from '../utils/EventEmitter';
import { ModelsLoader, CharacterData } from '../utils/loadModels';

interface CharacterPreview {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    model?: THREE.Object3D;
    animationFrameId?: number;
}

interface CharacterSelectState {
    selectedId: string | null;
    previousId: string | null;
    selectionTime: string | null;
    isConfirmed: boolean;
}

export class MenuManager extends EventEmitter {
    private menus: Map<string, HTMLElement>;
    private activeMenu: string | null = null;
    private characterPreviews: Map<string, CharacterPreview> = new Map();
    private currentCarouselIndex: number = 0;
    private isLoading: boolean = false;
    private loadingPromises: Promise<any>[] = [];
    private modelsLoader: ModelsLoader;
    private characters: CharacterData[] = [];

    private characterSelectState: CharacterSelectState = {
        selectedId: null,
        previousId: null,
        selectionTime: null,
        isConfirmed: false
    };

    private readonly CURRENT_USER = 'MyDemir';
    private readonly CURRENT_TIME = '2025-05-25 17:07:00';

    constructor(modelsLoader: ModelsLoader) {
        super();
        this.modelsLoader = modelsLoader;
        console.log("MenuManager başlatılıyor");
        this.menus = new Map();
        this.loadSavedState();
        this.initializeMenus();
    }

    private loadSavedState(): void {
        const savedState = localStorage.getItem('characterSelectState');
        if (savedState) {
            this.characterSelectState = JSON.parse(savedState);
        }
    }

    private async showLoadingState(): Promise<void> {
        this.isLoading = true;
        document.body.classList.add('loading');
    }

    private async hideLoadingState(): Promise<void> {
        await Promise.all(this.loadingPromises);
        this.isLoading = false;
        document.body.classList.remove('loading');
    }

    private setupMenuListeners(): void {
    console.log("Menü dinleyicileri ayarlanıyor");
    const buttons = [
        { id: 'startBtn', action: () => this.emit('startGame') },
        { id: 'characterSelectBtn', action: () => {
            console.log('Karakter seçim ekranına geçiş');
            this.showMenu('character');
        }},
        { id: 'scoreboardBtn', action: () => this.showMenu('scoreboard') },
        { id: 'settingsBtn', action: () => this.showMenu('settings') },
        { id: 'backFromCharSelect', action: () => {
            console.log('Karakter seçiminden ana menüye dönüş');
            this.showMenu('main');
        }},
        { id: 'backFromScoreboard', action: () => this.showMenu('main') },
        { id: 'backFromSettings', action: () => this.showMenu('main') },
        { id: 'confirmCharacter', action: () => this.confirmCharacterSelection() },
        { id: 'resumeBtn', action: () => this.emit('resumeGame') },
        { id: 'restartBtn', action: () => this.emit('restartGame') },
        { id: 'exitToMainBtn', action: () => this.emit('exitToMain') }
    ];

    buttons.forEach(({ id, action }) => {
        const button = document.getElementById(id);
        if (button) {
            // Eski dinleyicileri kaldır
            button.removeEventListener('click', action);
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                console.log(`Düğme tıklandı: ${id}`);
                action();
            }, { once: false });
        } else {
            console.warn(`Düğme bulunamadı: ${id}`);
            NotificationManager.getInstance().show(`Düğme bulunamadı: ${id}`, 'warning');
        }
    });
}

    private async initializeMenus(): Promise<void> {
        console.log("Menüler başlatılıyor");
        this.characters = this.modelsLoader.getAllCharacterData();
        if (!this.characters.length) {
            console.warn("Karakter verileri yüklenemedi, modellerin yüklendiğinden emin olun.");
        }

        const menuIds = [
            { key: 'main', id: 'main-menu' },
            { key: 'character', id: 'character-select' },
            { key: 'scoreboard', id: 'scoreboard' },
            { key: 'settings', id: 'settings' },
            { key: 'pause', id: 'pause-menu' },
            { key: 'gameOver', id: 'game-over' }
        ];

        menuIds.forEach(({ key, id }) => {
            const element = document.getElementById(id);
            if (element) {
                this.menus.set(key, element);
            } else {
                console.error(`${key} menüsü bulunamadı (ID: ${id})`);
                NotificationManager.getInstance().show(`Menü bulunamadı: ${id}`, 'error');
            }
        });

        this.setupMenuListeners();
        this.createCharacterCarousel();
    }

    private createCharacterCarousel(): void {
        console.log("Karakter carousel'i oluşturuluyor");
        const characterGrid = document.querySelector('.character-grid');
        if (!characterGrid) {
            console.error("Karakter gridi bulunamadı (.character-grid)");
            NotificationManager.getInstance().show('Karakter seçim ekranı yüklenemedi! HTML yapısını kontrol edin.', 'error');
            this.showMenu('main');
            return;
        }

        if (!this.characters.length) {
            console.warn("Karakter verileri boş, carousel oluşturulamıyor");
            this.characters = this.modelsLoader.getAllCharacterData();
            if (!this.characters.length) {
                console.error("Karakter verileri hala yok!");
                NotificationManager.getInstance().show('Karakter verileri yüklenemedi!', 'error');
                return;
            }
        }

        characterGrid.innerHTML = this.generateCarouselHTML();
        this.characters.forEach(char => {
            this.setupCharacterPreview(char.id, char.modelPath);
        });

        this.setupCharacterCardListeners();
        this.setupCarouselListeners();
        this.updateCarousel();
    }

    private generateCarouselHTML(): string {
        return `
            <div class="character-carousel-container">
                <div class="character-carousel">
                    <div class="character-cards-wrapper">
                        ${this.characters.map(char => this.generateCharacterCardHTML(char)).join('')}
                    </div>
                </div>
                <button class="carousel-button prev">◄</button>
                <button class="carousel-button next">►</button>
                <div class="character-nav-dots">
                    ${this.characters.map((_, i) => 
                        `<span class="nav-dot${i === 0 ? ' active' : ''}" data-index="${i}"></span>`
                    ).join('')}
                </div>
            </div>
        `;
    }

    private generateCharacterCardHTML(char: CharacterData): string {
        return `
            <div class="character-card" data-character="${char.id}">
                <div class="character-preview">
                    <canvas id="${char.id}-preview" class="character-canvas"></canvas>
                </div>
                <div class="character-info">
                    <h3>${char.name}</h3>
                    <div class="character-stats">
                        <div class="stat">
                            <span class="stat-label">Hız</span>
                            <div class="stat-bar">
                                <div class="stat-fill" style="width: ${char.stats.speed}%"></div>
                            </div>
                        </div>
                        <div class="stat">
                            <span class="stat-label">Güç</span>
                            <div class="stat-bar">
                                <div class="stat-fill" style="width: ${char.stats.power}%"></div>
                            </div>
                        </div>
                    </div>
                    <div class="character-selection-info">
                        <small>Son Seçen: ${this.CURRENT_USER}</small>
                        <small>Son Seçim: ${this.CURRENT_TIME}</small>
                    </div>
                </div>
            </div>
        `;
    }

    private setupCharacterPreview(characterId: string, modelPath: string): void {
    const canvas = document.getElementById(`${characterId}-preview`) as HTMLCanvasElement;
    if (!canvas) {
        console.error(`Karakter önizleme canvas'ı bulunamadı: ${characterId}-preview`);
        NotificationManager.getInstance().show(`Canvas bulunamadı: ${characterId}`, 'error');
        return;
    }

    // Canvas boyutlarını ebeveyninden al
    const parent = canvas.parentElement;
    const width = parent?.clientWidth || 300;
    const height = parent?.clientHeight || 200;
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 1.5, 3);
    camera.lookAt(0, 1, 0);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);

    // Işıklandırma
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(2, 2, 2);
    scene.add(ambientLight, dirLight);

    this.characterPreviews.set(characterId, { scene, camera, renderer });

    // Modeli yükle
    const model = this.modelsLoader.getModel(characterId);
    if (model) {
        const clonedModel = model.scene.clone();
        clonedModel.scale.set(1, 1, 1);
        clonedModel.position.set(0, 0, 0);
        scene.add(clonedModel);
        this.characterPreviews.get(characterId)!.model = clonedModel;
        this.animatePreview(characterId);
        console.log(`Model yüklendi ve eklendi: ${characterId}`);
    } else {
        console.warn(`Model bulunamadı, yükleniyor: ${characterId}`);
        this.loadingPromises.push(
            new GLTFLoader().loadAsync(modelPath)
                .then(gltf => {
                    const model = gltf.scene;
                    model.scale.set(1, 1, 1);
                    model.position.set(0, 0, 0);
                    scene.add(model);
                    const preview = this.characterPreviews.get(characterId);
                    if (preview) {
                        preview.model = model;
                        this.animatePreview(characterId);
                        console.log(`Model asenkron yüklendi: ${characterId}`);
                    }
                })
                .catch(error => {
                    console.error(`Karakter modeli yüklenemedi: ${characterId}`, error);
                    NotificationManager.getInstance().show(`Model yüklenemedi: ${characterId}`, 'error');
                })
        );
    }
}

private animatePreview(characterId: string): void {
    const preview = this.characterPreviews.get(characterId);
    if (!preview || !document.getElementById(`${characterId}-preview`)?.offsetParent) return;

    const animate = () => {
        if (!this.characterPreviews.has(characterId)) return;

        preview.animationFrameId = requestAnimationFrame(animate);
        if (preview.model) {
            preview.model.rotation.y += 0.01;
        }
        preview.renderer.render(preview.scene, preview.camera);
    };

    animate();
}

    private disposeCharacterPreview(characterId: string): void {
    const preview = this.characterPreviews.get(characterId);
    if (preview) {
        if (preview.animationFrameId) {
            cancelAnimationFrame(preview.animationFrameId);
        }
        preview.renderer.dispose();
        preview.scene.clear();
        this.characterPreviews.delete(characterId);
    }
}
    
    private updateCharacterSelection(characterId: string): void {
        this.characterSelectState = {
            selectedId: characterId,
            previousId: this.characterSelectState.selectedId,
            selectionTime: new Date().toISOString(),
            isConfirmed: false
        };
        
        localStorage.setItem('characterSelectState', JSON.stringify(this.characterSelectState));
    }

    private confirmCharacterSelection(): void {
        if (!this.characterSelectState.selectedId) {
            NotificationManager.getInstance().show('Lütfen bir karakter seçin!', 'error');
            return;
        }

        this.characterSelectState.isConfirmed = true;
        localStorage.setItem('characterSelectState', JSON.stringify(this.characterSelectState));
        NotificationManager.getInstance().show('Karakter seçimi onaylandı!', 'success');
        this.emit('characterConfirmed', this.characterSelectState.selectedId);
        this.showMenu('main');
    }

    public cleanup(): void {
        console.log("MenuManager temizleniyor");
        
        this.characterPreviews.forEach((preview, characterId) => {
            if (preview.animationFrameId) {
                cancelAnimationFrame(preview.animationFrameId);
            }
            
            preview.scene.traverse((object: any) => {
                if (object.geometry) object.geometry.dispose();
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach((material: any) => material.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
                if (object.texture) object.texture.dispose();
            });
            preview.scene.clear();
            preview.renderer.dispose();
        });
        this.characterPreviews.clear();
        this.isLoading = false;
        document.body.classList.remove('loading');
        this.loadingPromises = [];
    }

    private setupCharacterCardListeners(): void {
        console.log("Karakter kartı dinleyicileri ayarlanıyor");
        const cards = document.querySelectorAll('.character-card');
        cards.forEach(card => {
            card.addEventListener('click', () => {
                const characterId = card.getAttribute('data-character');
                if (characterId) {
                    console.log(`Karakter seçildi: ${characterId}`);
                    this.selectCharacter(characterId);
                }
            });
        });
    }

    private setupCarouselListeners(): void {
        console.log("Carousel dinleyicileri ayarlanıyor");
        const prevBtn = document.querySelector('.carousel-button.prev');
        const nextBtn = document.querySelector('.carousel-button.next');
        const navDots = document.querySelectorAll('.nav-dot');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                console.log("Önceki karaktere geçiş");
                this.currentCarouselIndex = (this.currentCarouselIndex - 1 + this.characters.length) % this.characters.length;
                this.updateCarousel();
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                console.log("Sonraki karaktere geçiş");
                this.currentCarouselIndex = (this.currentCarouselIndex + 1) % this.characters.length;
                this.updateCarousel();
            });
        }

        navDots.forEach(dot => {
            dot.addEventListener('click', () => {
                const index = parseInt(dot.getAttribute('data-index') || '0');
                console.log(`Nav dot tıklandı: ${index}`);
                this.currentCarouselIndex = index;
                this.updateCarousel();
            });
        });
    }

    private updateCarousel(): void {
        console.log(`Carousel güncelleniyor: index ${this.currentCarouselIndex}`);
        const wrapper = document.querySelector('.character-cards-wrapper') as HTMLElement;
        if (wrapper) {
            wrapper.style.transform = `translateX(-${this.currentCarouselIndex * 320}px)`;
        }

        const cards = document.querySelectorAll('.character-card');
        cards.forEach((card, index) => {
            if (index === this.currentCarouselIndex) {
                card.classList.add('active');
            } else {
                card.classList.remove('active');
            }
        });

        const navDots = document.querySelectorAll('.nav-dot');
        navDots.forEach((dot, index) => {
            if (index === this.currentCarouselIndex) {
                dot.classList.add('active');
            } else {
                dot.classList.remove('active');
            }
        });
    }

    public showMenu(menuId: string): void {
    console.log(`Menü gösteriliyor: ${menuId}`);
    // Tüm menüleri gizle
    this.menus.forEach((menu, key) => {
        if (menu) {
            menu.classList.add('hidden');
            console.log(`Menü gizlendi: ${key}`);
        }
    });

    if (menuId !== 'none') {
        const newMenu = this.menus.get(menuId);
        if (newMenu) {
            newMenu.classList.remove('hidden');
            this.activeMenu = menuId;
            console.log(`Yeni menü gösterildi: ${menuId}`);
            if (menuId === 'character') {
                this.updateCarousel();
            }
        } else {
            console.error(`Menü bulunamadı: ${menuId}`);
            NotificationManager.getInstance().show(`Menü bulunamadı: ${menuId}`, 'error');
            this.showMenu('main');
        }
    } else {
        this.activeMenu = null;
        console.log("Tüm menüler gizlendi");
    }
}

    private selectCharacter(characterId: string): void {
        console.log(`Karakter seçimi: ${characterId}`);
        document.querySelectorAll('.character-card').forEach(card => {
            card.classList.remove('selected');
        });

        const selectedCard = document.querySelector(`[data-character="${characterId}"]`);
        if (selectedCard) {
            selectedCard.classList.add('selected');
            this.updateCharacterSelection(characterId);
            
            console.log(`Karakter seçildi: ${characterId}`);
            const index = this.characters.findIndex(char => char.id === characterId);
            if (index !== -1) {
                this.currentCarouselIndex = index;
                this.updateCarousel();
            }
        } else {
            console.error(`Karakter kartı bulunamadı: ${characterId}`);
            NotificationManager.getInstance().show(`Karakter kartı bulunamadı: ${characterId}`, 'error');
        }
    }

    public getSelectedCharacter(): string | null {
        return this.characterSelectState.isConfirmed ? this.characterSelectState.selectedId : null;
    }
}
