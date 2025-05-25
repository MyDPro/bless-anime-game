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
    private renderer: THREE.WebGLRenderer;
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
        this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
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
            // Mevcut dinleyicileri kaldır
            button.removeEventListener('click', action); // Güvenli kaldırma
            button.addEventListener('click', (event) => {
                event.stopPropagation(); // Olayın yayılmasını durdur
                console.log(`Düğme tıklandı: ${id}`);
                action();
            }, { once: false }); // Tekrar eklenmesini önle
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
        // Bildirimi kaldır, çünkü modeller zaten yüklendi
        // NotificationManager.getInstance().show('Karakter verileri yüklenemedi! Lütfen sayfayı yenileyin.', 'error');
        // Yedek karakteri kaldır
        // this.characters = [{ id: 'fallback', name: 'Varsayılan Karakter', modelPath: '/models/character/character-female-a.glb', stats: { speed: 50, power: 50 } }];
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
        console.error("Karakter verileri boş, carousel oluşturulamıyor");
        NotificationManager.getInstance().show('Karakter verileri bulunamadı!', 'error');
        return;
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
            return;
        }

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
        camera.position.set(0, 1.5, 3);
        camera.lookAt(0, 1, 0);

        this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
        canvas.appendChild(this.renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        const dirLight = new THREE.DirectionalLight(0xffffff, 1);
        dirLight.position.set(2, 2, 2);
        scene.add(ambientLight);
        scene.add(dirLight);

        this.characterPreviews.set(characterId, { scene, camera, renderer: this.renderer });

        const loader = new GLTFLoader();
         this.loadingPromises.push(
        loader.loadAsync(modelPath)
            .then(gltf => {
                const model = gltf.scene;
                model.scale.set(1, 1, 1);
                model.position.set(0, 0, 0);
                scene.add(model);
                const preview = this.characterPreviews.get(characterId);
                if (preview) preview.model = model;
                this.animatePreview(characterId);
            })
            .catch(error => {
                console.error(`Karakter modeli yüklenemedi: ${characterId}`, error);
                NotificationManager.getInstance().show(
                    `Model yüklenemedi: ${characterId} - Doku eksik olabilir!`,
                    'error'
                );
            })
    );
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
            this.renderer.render(preview.scene, preview.camera);
        };

        animate();
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
        });
        this.characterPreviews.clear();
        this.renderer.dispose();
        this.renderer.forceContextLoss();

        document.querySelectorAll('.character-card').forEach(card => {
            card.replaceWith(card.cloneNode(true));
        });

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
            wrapper.style.transform = `translateX(-${this.currentCarouselIndex * 320}px)`; // 300px kart + 20px boşluk
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
        if (this.activeMenu) {
            const currentMenu = this.menus.get(this.activeMenu);
            if (currentMenu) {
                currentMenu.classList.add('hidden');
                console.log(`Önceki menü gizlendi: ${this.activeMenu}`);
            }
        }

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
