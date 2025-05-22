// src/core/MenuManager.ts

import * as THREE from 'three';
import { NotificationManager } from './NotificationManager';
import { ModelsLoader } from '../utils/loadModels';

// Karakter verisi tipi (ModelsLoader ile aynı olmalı)
interface CharacterData {
    id: string;
    name: string;
    modelPath: string;
    stats: { speed: number; power: number };
}

export class MenuManager {
    private menus: Map<string, HTMLElement>;
    private activeMenu: string | null = null;
    private selectedCharacter: string | null = null;
    private characterPreviews: Map<string, {
        scene: THREE.Scene,
        camera: THREE.PerspectiveCamera,
        renderer: THREE.WebGLRenderer,
        model?: THREE.Object3D,
        animationFrameId?: number
    }> = new Map();
    private currentCarouselIndex: number = 0;
    private characters: CharacterData[];
    private modelsLoader: ModelsLoader;

    constructor(modelsLoader: ModelsLoader) {
        console.log("MenuManager başlatılıyor");
        this.modelsLoader = modelsLoader;
        this.characters = this.modelsLoader.getAllCharacterData();
        console.log('Karakter verileri:', this.characters);
        this.menus = new Map();
        this.initializeMenus();
        this.setupEventListeners();
    }

    private async initializeMenus(): Promise<void> {
        console.log("Menüler başlatılıyor");
        this.menus.set('main', document.getElementById('main-menu')!);
        this.menus.set('character', document.getElementById('character-select')!);
        this.menus.set('scoreboard', document.getElementById('scoreboard')!);
        this.menus.set('settings', document.getElementById('settings')!);
        this.menus.set('pause', document.getElementById('pause-menu')!);
        this.menus.set('gameOver', document.getElementById('game-over')!);

        try {
            await this.createCharacterCarousel();
            console.log("Karakter carousel'i ve önizlemeler hazır.");
        } catch (error) {
            console.error("Karakter carousel veya önizlemeleri oluşturulurken hata:", error);
            NotificationManager.getInstance().show('Karakter seçim ekranı yüklenemedi!', 'error');
        }
    }

    private async createCharacterCarousel(): Promise<void> {
        console.log("Karakter carousel'i oluşturuluyor");
        const characterGrid = document.querySelector('.character-grid');
        if (!characterGrid) {
            console.error("Karakter gridi bulunamadı (.character-grid)");
            throw new Error("Karakter gridi bulunamadı.");
        }

        characterGrid.innerHTML = `
            <div class="character-carousel-container">
                <div class="character-carousel">
                    <div class="character-cards-wrapper">
                        ${this.characters.map(char => `
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
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <button class="carousel-button prev">◄</button>
                <button class="carousel-button next">►</button>
                <div class="character-nav-dots">
                    ${this.characters.map((_, i) => `<span class="nav-dot${i === 0 ? ' active' : ''}" data-index="${i}"></span>`).join('')}
                </div>
            </div>
        `;

        await new Promise(resolve => setTimeout(resolve, 0));

        const previewPromises = this.characters.map(char => this.setupCharacterPreview(char.id));
        await Promise.all(previewPromises);

        this.setupCharacterCardListeners();
        this.setupCarouselListeners();
        this.updateCarousel();
    }

    private async setupCharacterPreview(characterId: string): Promise<void> {
        console.log(`Karakter önizlemesi ayarlanıyor: ${characterId}`);
        const canvas = document.getElementById(`${characterId}-preview`) as HTMLCanvasElement;
        if (!canvas) {
            console.error(`Karakter önizleme canvas'ı bulunamadı: ${characterId}-preview`);
            NotificationManager.getInstance().show(`Karakter önizleme canvas'ı bulunamadı: ${characterId}`, 'error');
            return;
        }

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });

        const resizeCanvas = () => {
            const parent = canvas.parentElement;
            if (!parent) return;
            const width = parent.clientWidth;
            const height = parent.clientHeight;
            if (width === 0 || height === 0) {
                console.warn(`Canvas boyutları sıfır, yeniden deneniyor: ${characterId}`);
                requestAnimationFrame(resizeCanvas);
                return;
            }
            renderer.setSize(width, height);
            renderer.setPixelRatio(window.devicePixelRatio);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
        };
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        camera.position.set(0, 1.5, 3);
        camera.lookAt(0, 1, 0);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        dirLight.position.set(2, 3, 2);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 1024;
        dirLight.shadow.mapSize.height = 1024;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 10;
        dirLight.shadow.camera.left = -3;
        dirLight.shadow.camera.right = 3;
        dirLight.shadow.camera.top = 3;
        dirLight.shadow.camera.bottom = -3;
        scene.add(dirLight);

        this.characterPreviews.set(characterId, { scene, camera, renderer });

        const gltf = this.modelsLoader.getModel(characterId);
        if (!gltf || !gltf.scene) {
            console.error(`Karakter modeli alınamadı: ${characterId}`);
            NotificationManager.getInstance().show(`Karakter modeli yüklenemedi: ${characterId}`, 'error');
            const fallbackGeometry = new THREE.BoxGeometry(1, 1, 1);
            const fallbackMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
            const fallbackModel = new THREE.Mesh(fallbackGeometry, fallbackMaterial);
            fallbackModel.position.y = 0.5;
            scene.add(fallbackModel);
            const preview = this.characterPreviews.get(characterId);
            if (preview) preview.model = fallbackModel;
        } else {
            console.log(`Karakter modeli alındı: ${characterId}`);
            const model = gltf.scene.clone();
            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            model.position.y = -box.min.y * model.scale.y;
            model.scale.set(1.5, 1.5, 1.5);
            scene.add(model);
            const preview = this.characterPreviews.get(characterId);
            if (preview) preview.model = model;
        }

        this.animatePreview(characterId);
    }

    private animatePreview(characterId: string): void {
        const preview = this.characterPreviews.get(characterId);
        if (!preview) return;

        const animate = () => {
            if (!this.characterPreviews.has(characterId)) {
                if (preview.animationFrameId) {
                    cancelAnimationFrame(preview.animationFrameId);
                }
                return;
            }

            preview.animationFrameId = requestAnimationFrame(animate);
            if (preview.model) {
                preview.model.rotation.y += 0.01;
            }
            preview.renderer.render(preview.scene, preview.camera);
        };

        animate();
    }

    private setupCharacterCardListeners(): void {
        console.log("Karakter kartı dinleyicileri ayarlanıyor");
        const cards = document.querySelectorAll('.character-card');
        cards.forEach(card => {
            card.addEventListener('click', () => {
                const characterId = card.getAttribute('data-character');
                if (characterId) {
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
                this.currentCarouselIndex = (this.currentCarouselIndex - 1 + this.characters.length) % this.characters.length;
                this.updateCarousel();
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                this.currentCarouselIndex = (this.currentCarouselIndex + 1) % this.characters.length;
                this.updateCarousel();
            });
        }

        navDots.forEach(dot => {
            dot.addEventListener('click', () => {
                const index = parseInt(dot.getAttribute('data-index') || '0');
                this.currentCarouselIndex = index;
                this.updateCarousel();
            });
        });
    }

    private updateCarousel(): void {
        console.log(`Carousel güncelleniyor: index ${this.currentCarouselIndex}`);
        const wrapper = document.querySelector('.character-cards-wrapper') as HTMLElement;
        const firstCard = document.querySelector('.character-card') as HTMLElement;
        const cardWidth = firstCard ? firstCard.offsetWidth : 300;
        const parentStyle = window.getComputedStyle(wrapper.parentElement || wrapper);
        const gap = parseFloat(parentStyle.gap) || 20;

        if (wrapper) {
            wrapper.style.transform = `translateX(-${this.currentCarouselIndex * (cardWidth + gap)}px)`;
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

        if (this.selectedCharacter) {
            document.querySelectorAll('.character-card').forEach(card => {
                if (card.getAttribute('data-character') === this.selectedCharacter) {
                    card.classList.add('selected');
                } else {
                    card.classList.remove('selected');
                }
            });
        }
    }

    private setupEventListeners(): void {
        console.log("Menü olay dinleyicileri ayarlanıyor");
        document.getElementById('characterSelectBtn')?.addEventListener('click', () => {
            this.showMenu('character');
        });
        document.getElementById('scoreboardBtn')?.addEventListener('click', () => {
            this.showMenu('scoreboard');
        });
        document.getElementById('settingsBtn')?.addEventListener('click', () => {
            this.showMenu('settings');
        });

        document.getElementById('backFromCharSelect')?.addEventListener('click', () => {
            this.showMenu('main');
        });
        document.getElementById('backFromScoreboard')?.addEventListener('click', () => {
            this.showMenu('main');
        });
        document.getElementById('backFromSettings')?.addEventListener('click', () => {
            this.showMenu('main');
        });

        document.getElementById('confirmCharacter')?.addEventListener('click', () => {
            if (this.selectedCharacter) {
                NotificationManager.getInstance().show(`Karakter onaylandı: ${this.selectedCharacter}`, 'success');
                this.showMenu('main');
            } else {
                NotificationManager.getInstance().show('Lütfen bir karakter seçin!', 'error');
            }
        });
    }

    public showMenu(menuId: string): void {
        console.log(`Menü gösteriliyor: ${menuId}`);
        if (this.activeMenu) {
            const currentMenu = this.menus.get(this.activeMenu);
            if (currentMenu) {
                currentMenu.classList.add('hidden');
            }
        }

        if (menuId !== 'none') {
            const newMenu = this.menus.get(menuId);
            if (newMenu) {
                newMenu.classList.remove('hidden');
                this.activeMenu = menuId;
                if (menuId === 'character') {
                    this.updateCarousel();
                    if (!this.selectedCharacter && this.characters.length > 0) {
                        this.selectCharacter(this.characters[0].id);
                    }
                }
            } else {
                NotificationManager.getInstance().show(`Menü bulunamadı: ${menuId}`, 'error');
            }
        } else {
            this.activeMenu = null;
        }
    }

    private selectCharacter(characterId: string): void {
        document.querySelectorAll('.character-card').forEach(card => {
            card.classList.remove('selected');
        });

        const selectedCard = document.querySelector(`[data-character="${characterId}"]`);
        if (selectedCard) {
            selectedCard.classList.add('selected');
            this.selectedCharacter = characterId;
            const index = this.characters.findIndex(char => char.id === characterId);
            if (index !== -1) {
                this.currentCarouselIndex = index;
                this.updateCarousel();
            }
        } else {
            NotificationManager.getInstance().show(`Karakter kartı bulunamadı: ${characterId}`, 'error');
        }
    }

    public getSelectedCharacter(): string | null {
        return this.selectedCharacter;
    }

    public cleanup(): void {
        this.characterPreviews.forEach((preview) => {
            if (preview.animationFrameId) {
                cancelAnimationFrame(preview.animationFrameId);
            }
            preview.renderer.dispose();
            preview.scene.clear();
            if (preview.model) {
                preview.model.traverse((obj: any) => {
                    if (obj.isMesh) {
                        if (obj.geometry) obj.geometry.dispose();
                        if (obj.material) {
                            if (Array.isArray(obj.material)) {
                                obj.material.forEach((mat: any) => {
                                    if (mat.map) mat.map.dispose();
                                    mat.dispose();
                                });
                            } else {
                                if (obj.material.map) obj.material.map.dispose();
                                obj.material.dispose();
                            }
                        }
                    }
                    if (obj.texture) obj.texture.dispose();
                });
            }
        });
        this.characterPreviews.clear();
    }
    }
