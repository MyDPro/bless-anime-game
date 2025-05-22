// src/core/Game.ts

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MenuManager } from './MenuManager';
import { ModelsLoader } from '../utils/loadModels';
import { EventEmitter } from '../utils/EventEmitter';
import { NotificationManager } from './NotificationManager';

export class Game {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private controls: OrbitControls;

    private modelsLoader: ModelsLoader;
    private eventEmitter: EventEmitter;
    private menuManager: MenuManager;

    private gameState = {
        isStarted: false,
        isPaused: false,
        score: 0,
        health: 100,
        ammo: 30,
        selectedCharacter: null as string | null,
        highScore: 0,
        currentUser: 'MyDemir',
        lastPlayTime: '2025-05-16 00:33:50'
    };

    private ui = {
        score: document.getElementById('score') as HTMLElement,
        health: document.getElementById('health') as HTMLElement,
        ammo: document.getElementById('ammo') as HTMLElement,
        uiContainer: document.getElementById('ui') as HTMLElement,
        loadingScreen: document.getElementById('loading-screen') as HTMLElement
    };

    private player: THREE.Object3D | null = null;
    private blasters: THREE.Object3D[] = [];
    private enemies: THREE.Object3D[] = [];

    constructor(canvas: HTMLCanvasElement) {
        console.log("Game sınıfı başlatılıyor");
        this.eventEmitter = new EventEmitter();
        this.modelsLoader = new ModelsLoader(); // ModelsLoader artık scene parametresi almıyor
        this.menuManager = new MenuManager(this.modelsLoader); // MenuManager'a modelsLoader'ı geçiyoruz
        
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xbfd1e5);
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(5, 5, 5);
        this.camera.lookAt(0, 0, 0);
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.target.set(0, 1, 0);
        
        this.setupWorld();
        this.setupEventListeners();
        this.loadHighScore();
        this.setCurrentDateTime();
        
        this.loadGameModels().then(() => {
            console.log("Modeller yüklendi, ana menü gösteriliyor");
            this.animate();
            NotificationManager.getInstance().show('Oyun yüklendi!', 'success');
        }).catch(error => {
            console.error('Oyun modelleri yüklenemedi:', error);
            NotificationManager.getInstance().show('Oyun başlatılamadı! Lütfen sayfayı yenileyin.', 'error');
        });
        this.ui.uiContainer.classList.add('hidden');
    }

    private setCurrentDateTime(): void {
        const now = new Date();
        const year = now.getUTCFullYear();
        const month = String(now.getUTCMonth() + 1).padStart(2, '0');
        const day = String(now.getUTCDate()).padStart(2, '0');
        const hours = String(now.getUTCHours()).padStart(2, '0');
        const minutes = String(now.getUTCMinutes()).padStart(2, '0');
        const seconds = String(now.getUTCSeconds()).padStart(2, '0');
        this.gameState.lastPlayTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    private loadHighScore(): void {
        const savedHighScore = localStorage.getItem('highScore');
        if (savedHighScore) {
            this.gameState.highScore = parseInt(savedHighScore);
        }
    }

    private saveHighScore(): void {
        if (this.gameState.score > this.gameState.highScore) {
            this.gameState.highScore = this.gameState.score;
            localStorage.setItem('highScore', this.gameState.highScore.toString());
            NotificationManager.getInstance().show('Yeni yüksek skor kaydedildi! 🏆', 'success');
        }
    }

    private async loadGameModels(): Promise<void> {
        try {
            console.log('Model yükleme başlıyor...');
            await Promise.all([
                this.modelsLoader.loadCharacterModels(), // Karakter modelleri yükleniyor
                this.modelsLoader.loadBlasterModels(),    // Blaster modelleri yükleniyor
                this.modelsLoader.loadCityKitModels()     // Şehir kiti modelleri de burada yüklenebilir (isteğe bağlı)
            ]);
            console.log('Modeller başarıyla yüklendi');
            NotificationManager.getInstance().show('Modeller başarıyla yüklendi!', 'success');
            if (this.ui.loadingScreen) {
                this.ui.loadingScreen.classList.add('fade-out');
                setTimeout(() => {
                    if (this.ui.loadingScreen) {
                        this.ui.loadingScreen.classList.add('hidden');
                        console.log("Yükleme ekranı gizlendi");
                    }
                    this.menuManager.showMenu('main');
                    console.log("Ana menü gösterildi");
                }, 500);
            } else {
                console.error("Yükleme ekranı bulunamadı");
                this.menuManager.showMenu('main');
            }
        } catch (error) {
            console.error('Oyun modelleri yüklenemedi:', error);
            NotificationManager.getInstance().show('Oyun başlatılamadı! Lütfen sayfayı yenileyin.', 'error');
            throw error;
        }
    }

    private setupWorld(): void {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 1);
        dirLight.position.set(5, 10, 5);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 50;
        dirLight.shadow.camera.left = -10;
        dirLight.shadow.camera.right = 10;
        dirLight.shadow.camera.top = 10;
        dirLight.shadow.camera.bottom = -10;
        this.scene.add(dirLight);
        const platform = new THREE.Mesh(
            new THREE.BoxGeometry(10, 0.5, 10),
            new THREE.MeshStandardMaterial({
                color: 0x808080,
                roughness: 0.7,
                metalness: 0.1
            })
        );
        platform.receiveShadow = true;
        platform.position.y = -0.25;
        this.scene.add(platform);
    }

    private setupEventListeners(): void {
        window.addEventListener('resize', () => this.onWindowResize());
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.onKeyUp(e));
        document.addEventListener('mousedown', (e) => this.onMouseDown(e));
        document.addEventListener('mouseup', (e) => this.onMouseUp(e));
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.eventEmitter.on('playerDamage', (damage: number) => {
            this.gameState.health -= damage;
            if (this.gameState.health <= 30) {
                NotificationManager.getInstance().show('Kritik hasar! Can düşük!', 'warning');
            }
            this.updateUI();
            if (this.gameState.health <= 0) {
                NotificationManager.getInstance().show('Öldünüz!', 'error');
                this.endGame();
            }
        });
        this.eventEmitter.on('scoreUpdate', (points: number) => {
            this.gameState.score += points;
            if (points > 0) {
                NotificationManager.getInstance().show(`+${points} puan!`, 'success');
            }
            this.updateUI();
        });
        document.getElementById('startBtn')?.addEventListener('click', () => {
            console.log("Oyun başlat düğmesine tıklandı");
            this.startGame();
        });
        document.getElementById('resumeBtn')?.addEventListener('click', () => {
            console.log("Oyun devam ettiriliyor");
            this.resumeGame();
        });
        document.getElementById('restartBtn')?.addEventListener('click', () => {
            console.log("Oyun yeniden başlatılıyor");
            this.restartGame();
        });
        document.getElementById('exitToMainBtn')?.addEventListener('click', () => {
            console.log("Ana menüye dönülüyor");
            this.exitToMain();
        });
        document.getElementById('confirmCharacter')?.addEventListener('click', () => {
            const selectedChar = this.menuManager.getSelectedCharacter();
            if (selectedChar) {
                NotificationManager.getInstance().show(`${selectedChar} karakteri seçildi!`, 'success');
            }
        });
    }

    private onWindowResize(): void {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    private onKeyDown(event: KeyboardEvent): void {
        if (!this.gameState.isStarted || this.gameState.isPaused) return;
        switch (event.code) {
            case 'KeyW':
            case 'ArrowUp':
                // İleri hareket
                break;
            case 'KeyS':
            case 'ArrowDown':
                // Geri hareket
                break;
            case 'KeyA':
            case 'ArrowLeft':
                // Sola hareket
                break;
            case 'KeyD':
            case 'ArrowRight':
                // Sağa hareket
                break;
            case 'Space':
                // Zıplama
                break;
            case 'Escape':
                this.togglePause();
                break;
        }
    }

    private onKeyUp(event: KeyboardEvent): void {
        // Tuş bırakma işlemleri
    }

    private onMouseDown(event: MouseEvent): void {
        if (!this.gameState.isStarted || this.gameState.isPaused) return;
        if (event.button === 0) { // Sol tık
            this.shoot();
        }
    }

    private onMouseUp(event: MouseEvent): void {
        // Mouse bırakma işlemleri
    }

    private onMouseMove(event: MouseEvent): void {
        if (!this.gameState.isStarted || this.gameState.isPaused) return;
        // Karakter döndürme
    }

    public startGame(): void {
        const selectedCharacterId = this.menuManager.getSelectedCharacter();
        if (!selectedCharacterId) {
            NotificationManager.getInstance().show('Lütfen bir karakter seçin!', 'error');
            this.menuManager.showMenu('character');
            return;
        }

        const characterModelGltf = this.modelsLoader.getModel(selectedCharacterId);
        if (!characterModelGltf || !characterModelGltf.scene) {
            NotificationManager.getInstance().show(`Karakter modeli yüklenemedi: ${selectedCharacterId}`, 'error');
            this.menuManager.showMenu('character');
            return;
        }

        NotificationManager.getInstance().show(`${this.gameState.currentUser} olarak oyuna başlandı!`, 'success');

        // Önceki oyuncu modelini sahneden kaldır
        if (this.player) {
            this.scene.remove(this.player);
            // Three.js kaynaklarını temizle (isteğe bağlı ama önerilir)
            this.player.traverse((obj: any) => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    if (Array.isArray(obj.material)) {
                        obj.material.forEach( (mat: any) => mat.dispose() );
                    } else {
                        obj.material.dispose();
                    }
                }
                if (obj.texture) obj.texture.dispose();
            });
        }
        
        // Yeni oyuncu modelini sahneye ekle
        const newPlayer = characterModelGltf.scene.clone(); // Modeli klonla
        if (!newPlayer) {
            NotificationManager.getInstance().show('Karakter modeli klonlanamadı!', 'error');
            return;
        }
        this.player = newPlayer;
        this.player.name = selectedCharacterId; // Karakter ID'sini name olarak ata
        this.player.position.set(0, 0, 0); // Başlangıç pozisyonu
        this.player.scale.set(1.5, 1.5, 1.5); // Önizlemedekiyle aynı ölçekte olabilir veya ayarlanabilir
        this.player.castShadow = true; // Oyuncunun gölge bırakmasını sağla
        this.scene.add(this.player);

        this.gameState.isStarted = true;
        this.gameState.isPaused = false;
        this.gameState.score = 0;
        this.gameState.health = 100;
        this.gameState.ammo = 30;
        this.gameState.selectedCharacter = selectedCharacterId;
        this.setCurrentDateTime();

        this.ui.uiContainer.classList.remove('hidden');
        this.menuManager.showMenu('none'); // Tüm menüleri gizle
        this.updateUI();
    }

    private resumeGame(): void {
        this.gameState.isPaused = false;
        NotificationManager.getInstance().show('Oyun devam ediyor', 'success');
        this.menuManager.showMenu('none');
    }

    private restartGame(): void {
        this.saveHighScore();
        NotificationManager.getInstance().show('Oyun yeniden başlatılıyor...', 'success');
        // Oyuncu ve düşmanları sıfırla, sahneyi temizle vs.
        if (this.player) {
            this.scene.remove(this.player);
            this.player = null;
        }
        this.blasters = [];
        this.enemies.forEach(enemy => this.scene.remove(enemy));
        this.enemies = [];
        // Gerekirse diğer oyun varlıklarını da sıfırla
        
        this.startGame();
    }

    private exitToMain(): void {
        this.gameState.isStarted = false;
        this.gameState.isPaused = false;
        this.saveHighScore();
        NotificationManager.getInstance().show('Ana menüye dönülüyor...', 'warning');
        this.ui.uiContainer.classList.add('hidden');
        this.menuManager.showMenu('main');
        // Sahnedeki oyuncu ve diğer oyun varlıklarını kaldır
        if (this.player) {
            this.scene.remove(this.player);
            this.player = null;
        }
        this.blasters = [];
        this.enemies.forEach(enemy => this.scene.remove(enemy));
        this.enemies = [];
    }

    private endGame(): void {
        this.gameState.isStarted = false;
        if (this.gameState.score > this.gameState.highScore) {
            NotificationManager.getInstance().show('Yeni yüksek skor! 🏆', 'success');
        }
        this.saveHighScore();
        NotificationManager.getInstance().show(`Oyun bitti! Skorunuz: ${this.gameState.score}`, 'error');
        const finalScoreElement = document.getElementById('final-score');
        const highScoreElement = document.getElementById('high-score');
        if (finalScoreElement) {
            finalScoreElement.textContent = `Skor: ${this.gameState.score}`;
        }
        if (highScoreElement) {
            highScoreElement.textContent = `En Yüksek Skor: ${this.gameState.highScore}`;
        }
        this.menuManager.showMenu('gameOver');
        // Oyun bittiğinde sahnedeki oyuncuyu kaldır (isteğe bağlı)
        if (this.player) {
            this.scene.remove(this.player);
            this.player = null;
        }
    }

    private shoot(): void {
        if (this.gameState.ammo <= 0) {
            NotificationManager.getInstance().show('Mermi bitti!', 'error');
            this.eventEmitter.emit('outOfAmmo');
            return;
        }
        this.gameState.ammo--;
        if (this.gameState.ammo <= 5) {
            NotificationManager.getInstance().show('Mermi azalıyor!', 'warning');
        }
        this.eventEmitter.emit('weaponFired', this.gameState.ammo);
        this.updateUI();
        // Silah sesi çal
        // Mermi objesi oluştur ve sahneye ekle
    }

    private togglePause(): void {
        this.gameState.isPaused = !this.gameState.isPaused;
        if (this.gameState.isPaused) {
            NotificationManager.getInstance().show('Oyun duraklatıldı', 'warning');
            this.menuManager.showMenu('pause');
        } else {
            NotificationManager.getInstance().show('Oyun devam ediyor', 'success');
            this.menuManager.showMenu('none');
        }
    }

    private updateUI(): void {
        if (this.ui.score) this.ui.score.textContent = `Skor: ${this.gameState.score}`;
        if (this.ui.health) this.ui.health.textContent = `Can: ${this.gameState.health}`;
        if (this.ui.ammo) this.ui.ammo.textContent = `Mermi: ${this.gameState.ammo}`;
        
        // Kullanıcı bilgisini güncelle (her frame yeniden oluşturmak yerine var olanı güncelle)
        const userInfoDiv = this.ui.uiContainer.querySelector('.user-info');
        if (userInfoDiv) {
            const playerSpan = userInfoDiv.querySelector('.user-info-value:nth-child(2)'); // Oyuncu adı span'i
            const characterSpan = userInfoDiv.querySelector('.user-info-value:nth-child(4)'); // Karakter adı span'i
            const lastPlaySpan = userInfoDiv.querySelector('.user-info-value:nth-child(6)'); // Son oynama span'i

            if (playerSpan) playerSpan.textContent = this.gameState.currentUser;
            if (characterSpan) characterSpan.textContent = this.gameState.selectedCharacter || 'Seçilmedi';
            if (lastPlaySpan) lastPlaySpan.textContent = this.gameState.lastPlayTime;
        } else {
            // Eğer yoksa (ilk yüklemede), oluştur
            const newUserInfoDiv = document.createElement('div');
            newUserInfoDiv.classList.add('user-info');
            newUserInfoDiv.innerHTML = `
                <div class="user-info-item">
                    <span class="user-info-label">Oyuncu:</span>
                    <span class="user-info-value">${this.gameState.currentUser}</span>
                </div>
                <div class="user-info-item">
                    <span class="user-info-label">Karakter:</span>
                    <span class="user-info-value">${this.gameState.selectedCharacter || 'Seçilmedi'}</span>
                </div>
                <div class="user-info-item">
                    <span class="user-info-label">Son Oynama:</span>
                    <span class="user-info-value">${this.gameState.lastPlayTime}</span>
                </div>
            `;
            this.ui.uiContainer.querySelector('.ui-panel')?.appendChild(newUserInfoDiv);
        }
    }

    private animate(): void {
        requestAnimationFrame(() => this.animate());
        if (!this.gameState.isPaused && this.gameState.isStarted) {
            const deltaTime = 1/60; // Geçici olarak sabit deltaTime
            this.gameLoop(deltaTime);
        }
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    private gameLoop(deltaTime: number): void {
        this.updatePlayerMovement(deltaTime);
        this.updateEnemies(deltaTime);
        this.checkCollisions();
    }

    private updatePlayerMovement(deltaTime: number): void {
        // Karakter hareket mantığı buraya gelecek
    }

    private updateEnemies(deltaTime: number): void {
        // Düşman hareket mantığı buraya gelecek
    }

    private checkCollisions(): void {
        // Çarpışma kontrol mantığı buraya gelecek
    }

    // main.ts için gerekli metodlar
    getCurrentUser() {
        return this.gameState.currentUser;
    }

    getLastPlayTime() {
        return this.gameState.lastPlayTime;
    }

    // MenuManager için gerekli metod (Game sınıfı içindeki menuManager instance'ını kullanır)
    showMenu(menuId: string): void {
        this.menuManager.showMenu(menuId);
    }
