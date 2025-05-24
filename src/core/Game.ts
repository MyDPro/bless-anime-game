import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MenuManager } from './MenuManager';
import { ModelsLoader } from '../utils/loadModels';
import { EventEmitter } from '../utils/EventEmitter';
import { NotificationManager } from './NotificationManager';

interface GameState {
    isStarted: boolean;
    isPaused: boolean;
    score: number;
    health: number;
    ammo: number;
    selectedCharacter: string | null;
    highScore: number;
    currentUser: string;
    lastPlayTime: string;
}

interface GameUI {
    score: HTMLElement;
    health: HTMLElement;
    ammo: HTMLElement;
    uiContainer: HTMLElement;
    loadingScreen: HTMLElement;
}

type MenuId = 'main' | 'character' | 'scoreboard' | 'settings' | 'pause' | 'gameOver' | 'none';

export class Game {
    private readonly scene: THREE.Scene;
    private readonly camera: THREE.PerspectiveCamera;
    private readonly renderer: THREE.WebGLRenderer;
    private readonly controls: OrbitControls;
    private readonly modelsLoader: ModelsLoader;
    private readonly eventEmitter: EventEmitter;
    private readonly menuManager: MenuManager;
    private readonly CURRENT_USER = 'MyDemir';
    private readonly CURRENT_TIME = '2025-05-24 16:15:28';

    private player: THREE.Object3D | null = null;
    private readonly blasters: THREE.Object3D[] = [];
    private readonly enemies: THREE.Object3D[] = [];

    private readonly GAME_CONFIG = {
        INITIAL_HEALTH: 100,
        INITIAL_AMMO: 30,
        LOW_HEALTH_THRESHOLD: 30,
        LOW_AMMO_THRESHOLD: 5,
        LOADING_FADE_DURATION: 500
    };

    private readonly CAMERA_CONFIG = {
        FOV: 60,
        NEAR: 0.1,
        FAR: 1000,
        POSITION: new THREE.Vector3(5, 5, 5),
        LOOK_AT: new THREE.Vector3(0, 0, 0)
    };

    private readonly LIGHT_CONFIG = {
        AMBIENT: {
            COLOR: 0xffffff,
            INTENSITY: 0.6
        },
        DIRECTIONAL: {
            COLOR: 0xffffff,
            INTENSITY: 1,
            POSITION: new THREE.Vector3(5, 10, 5),
            SHADOW_MAP_SIZE: 2048,
            SHADOW_CAMERA: {
                NEAR: 0.5,
                FAR: 50,
                LEFT: -10,
                RIGHT: 10,
                TOP: 10,
                BOTTOM: -10
            }
        }
    };

    private gameState: GameState = {
        isStarted: false,
        isPaused: false,
        score: 0,
        health: this.GAME_CONFIG.INITIAL_HEALTH,
        ammo: this.GAME_CONFIG.INITIAL_AMMO,
        selectedCharacter: null,
        highScore: 0,
        currentUser: this.CURRENT_USER,
        lastPlayTime: this.CURRENT_TIME
    };

    private readonly ui: GameUI;

    constructor(canvas: HTMLCanvasElement) {
        console.log(`Game sınıfı başlatılıyor - ${this.CURRENT_TIME} - User: ${this.CURRENT_USER}`);
        
        this.eventEmitter = new EventEmitter();
        this.menuManager = new MenuManager();
        this.scene = this.createScene();
        [this.camera, this.renderer] = this.createRenderer(canvas);
        this.controls = this.createControls();
        this.modelsLoader = new ModelsLoader();
        this.ui = this.initializeUI();

        this.setupWorld();
        this.setupEventListeners();
        this.loadHighScore();
        
        this.ui.uiContainer.classList.add('hidden');

        this.initializeGame().catch(error => {
            console.error('Oyun başlatma hatası:', error);
            NotificationManager.getInstance().show('Oyun başlatılamadı! Lütfen sayfayı yenileyin.', 'error');
        });
    }

    private createScene(): THREE.Scene {
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xbfd1e5);
        return scene;
    }

    private createRenderer(canvas: HTMLCanvasElement): [THREE.PerspectiveCamera, THREE.WebGLRenderer] {
        const camera = new THREE.PerspectiveCamera(
            this.CAMERA_CONFIG.FOV,
            window.innerWidth / window.innerHeight,
            this.CAMERA_CONFIG.NEAR,
            this.CAMERA_CONFIG.FAR
        );
        camera.position.copy(this.CAMERA_CONFIG.POSITION);
        camera.lookAt(this.CAMERA_CONFIG.LOOK_AT);

        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        return [camera, renderer];
    }

    private createControls(): OrbitControls {
        const controls = new OrbitControls(this.camera, this.renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.target.set(0, 1, 0);
        return controls;
    }

    private initializeUI(): GameUI {
        return {
            score: document.getElementById('score') as HTMLElement,
            health: document.getElementById('health') as HTMLElement,
            ammo: document.getElementById('ammo') as HTMLElement,
            uiContainer: document.getElementById('ui') as HTMLElement,
            loadingScreen: document.getElementById('loading-screen') as HTMLElement
        };
    }

    private async initializeGame(): Promise<void> {
        try {
            await this.loadGameModels();
            this.animate();
            NotificationManager.getInstance().show('Oyun yüklendi!', 'success');
        } catch (error) {
            throw new Error(`Oyun başlatma hatası: ${error}`);
        }
    }

    private async loadGameModels(): Promise<void> {
        try {
            console.log('Model yükleme başlıyor...');
            await Promise.all([
                this.modelsLoader.loadCharacterModels(),
                this.modelsLoader.loadGameAssets()
            ]);

            this.handleLoadingComplete();
        } catch (error) {
            throw new Error(`Model yükleme hatası: ${error}`);
        }
    }

    private handleLoadingComplete(): void {
        if (this.ui.loadingScreen) {
            this.ui.loadingScreen.classList.add('fade-out');
            setTimeout(() => {
                this.ui.loadingScreen?.classList.add('hidden');
                this.menuManager.showMenu('main' as MenuId);
            }, this.GAME_CONFIG.LOADING_FADE_DURATION);
        } else {
            this.menuManager.showMenu('main' as MenuId);
        }
        NotificationManager.getInstance().show('Modeller başarıyla yüklendi!', 'success');
    }

    private setupWorld(): void {
        this.addAmbientLight();
        this.addDirectionalLight();
        this.addPlatform();
    }

    private addAmbientLight(): void {
        const ambientLight = new THREE.AmbientLight(
            this.LIGHT_CONFIG.AMBIENT.COLOR,
            this.LIGHT_CONFIG.AMBIENT.INTENSITY
        );
        this.scene.add(ambientLight);
    }

    private addDirectionalLight(): void {
        const dirLight = new THREE.DirectionalLight(
            this.LIGHT_CONFIG.DIRECTIONAL.COLOR,
            this.LIGHT_CONFIG.DIRECTIONAL.INTENSITY
        );
        dirLight.position.copy(this.LIGHT_CONFIG.DIRECTIONAL.POSITION);
        dirLight.castShadow = true;
        
        const shadowConfig = this.LIGHT_CONFIG.DIRECTIONAL.SHADOW_CAMERA;
        Object.assign(dirLight.shadow.camera, {
            near: shadowConfig.NEAR,
            far: shadowConfig.FAR,
            left: shadowConfig.LEFT,
            right: shadowConfig.RIGHT,
            top: shadowConfig.TOP,
            bottom: shadowConfig.BOTTOM
        });

        dirLight.shadow.mapSize.width = this.LIGHT_CONFIG.DIRECTIONAL.SHADOW_MAP_SIZE;
        dirLight.shadow.mapSize.height = this.LIGHT_CONFIG.DIRECTIONAL.SHADOW_MAP_SIZE;

        this.scene.add(dirLight);
    }

    private addPlatform(): void {
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
        this.setupWindowListeners();
        this.setupGameplayListeners();
        this.setupMenuListeners();
        this.setupButtonListeners();
    }

    private setupWindowListeners(): void {
        window.addEventListener('resize', this.onWindowResize.bind(this));
        document.addEventListener('keydown', this.onKeyDown.bind(this));
        document.addEventListener('mousedown', this.onMouseDown.bind(this));
    }

    private onWindowResize(): void {
        const width = window.innerWidth;
        const height = window.innerHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    private onKeyDown(event: KeyboardEvent): void {
        if (!this.gameState.isStarted) return;

        switch (event.code) {
            case 'Escape':
                this.togglePause();
                break;
            case 'Space':
                if (!this.gameState.isPaused) {
                    this.shoot();
                }
                break;
        }
    }

    private onMouseDown(event: MouseEvent): void {
        if (!this.gameState.isPaused && this.gameState.isStarted) {
            this.shoot();
        }
    }

    private setupGameplayListeners(): void {
        this.eventEmitter.on('playerDamage', this.handlePlayerDamage.bind(this));
        this.eventEmitter.on('scoreUpdate', this.handleScoreUpdate.bind(this));
    }

    private setupMenuListeners(): void {
        const menuEventEmitter = this.menuManager.getEventEmitter();
        menuEventEmitter.on('characterConfirmed', this.handleCharacterConfirmed.bind(this));
        menuEventEmitter.on('gameStart', this.handleGameStart.bind(this));
    }

    private setupButtonListeners(): void {
        document.getElementById('resumeBtn')?.addEventListener('click', () => this.resumeGame());
        document.getElementById('restartBtn')?.addEventListener('click', () => this.restartGame());
        document.getElementById('exitToMainBtn')?.addEventListener('click', () => this.exitToMain());
    }

    private handlePlayerDamage(damage: number): void {
        this.gameState.health -= damage;
        
        if (this.gameState.health <= this.GAME_CONFIG.LOW_HEALTH_THRESHOLD) {
            NotificationManager.getInstance().show('Kritik hasar! Can düşük!', 'warning');
        }
        
        this.updateUI();
        
        if (this.gameState.health <= 0) {
            this.endGame();
        }
    }

    private handleScoreUpdate(points: number): void {
        this.gameState.score += points;
        if (points > 0) {
            NotificationManager.getInstance().show(`+${points} puan!`, 'success');
        }
        this.updateUI();
    }

    private handleCharacterConfirmed(characterId: string): void {
        this.gameState.selectedCharacter = characterId;
        this.startGame();
    }

    private handleGameStart(): void {
        if (!this.gameState.selectedCharacter) {
            NotificationManager.getInstance().show('Lütfen önce bir karakter seçin!', 'error');
            this.menuManager.showMenu('character' as MenuId);
            return;
        }
        this.startGame();
    }

    private resumeGame(): void {
        if (this.gameState.isPaused) {
            this.gameState.isPaused = false;
            this.ui.uiContainer.classList.remove('hidden');
            this.menuManager.showMenu('none' as MenuId);
            NotificationManager.getInstance().show('Oyun devam ediyor...', 'success');
        }
    }

    private restartGame(): void {
        this.resetGameState();
        this.startGame();
        NotificationManager.getInstance().show('Oyun yeniden başlatıldı!', 'success');
    }

    private exitToMain(): void {
        this.resetGameState();
        this.menuManager.showMenu('main' as MenuId);
        this.ui.uiContainer.classList.add('hidden');
        NotificationManager.getInstance().show('Ana menüye dönüldü', 'success');
    }

    private startGame(): void {
        this.gameState.isStarted = true;
        this.gameState.isPaused = false;
        this.ui.uiContainer.classList.remove('hidden');
        this.setupPlayer();
        NotificationManager.getInstance().show('Oyun başladı!', 'success');
    }

    private endGame(): void {
        this.gameState.isStarted = false;
        this.saveHighScore();
        this.menuManager.showMenu('gameOver' as MenuId);
        this.ui.uiContainer.classList.add('hidden');
        NotificationManager.getInstance().show('Oyun bitti!', 'warning');
    }

    private togglePause(): void {
        if (!this.gameState.isStarted) return;

        this.gameState.isPaused = !this.gameState.isPaused;
        if (this.gameState.isPaused) {
            this.menuManager.showMenu('pause' as MenuId);
            this.ui.uiContainer.classList.add('hidden');
        } else {
            this.menuManager.showMenu('none' as MenuId);
            this.ui.uiContainer.classList.remove('hidden');
        }
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

    private resetGameState(): void {
        this.gameState = {
            ...this.gameState,
            isStarted: false,
            isPaused: false,
            score: 0,
            health: this.GAME_CONFIG.INITIAL_HEALTH,
            ammo: this.GAME_CONFIG.INITIAL_AMMO,
            lastPlayTime: this.CURRENT_TIME
        };
        this.updateUI();
    }

private setupPlayer(): void {
    if (!this.gameState.selectedCharacter) {
        console.warn('Karakter seçilmemiş!');
        return;
    }

    const model = this.modelsLoader.getModel(this.gameState.selectedCharacter);
    if (!model || !model.scene) {
        console.error('Karakter modeli yüklenemedi!');
        return;
    }

    try {
        const playerModel = model.scene.clone();
        playerModel.position.set(0, 0, 0);
        this.scene.add(playerModel);
        this.player = playerModel;
        
        NotificationManager.getInstance().show(
            `${this.gameState.selectedCharacter} karakteri yüklendi!`, 
            'success'
        );
    } catch (error) {
        console.error('Karakter kurulumu başarısız:', error);
        NotificationManager.getInstance().show(
            'Karakter yüklenirken hata oluştu!', 
            'error'
        );
    }
}

    private shoot(): void {
        if (this.gameState.ammo > 0) {
            this.gameState.ammo--;
            this.updateUI();
            
            if (this.gameState.ammo <= this.GAME_CONFIG.LOW_AMMO_THRESHOLD) {
                NotificationManager.getInstance().show('Mermi azalıyor!', 'warning');
            }
        } else {
            NotificationManager.getInstance().show('Mermi bitti!', 'error');
        }
    }

    private updateUI(): void {
        this.updateGameStats();
        this.updateUserInfo();
    }

    private updateGameStats(): void {
        this.ui.score.textContent = `Skor: ${this.gameState.score}`;
        this.ui.health.textContent = `Can: ${this.gameState.health}`;
        this.ui.ammo.textContent = `Mermi: ${this.gameState.ammo}`;
    }

    private updateUserInfo(): void {
        const userInfoHTML = `
            <div class="user-info">
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
            </div>
        `;

        const uiPanel = this.ui.uiContainer.querySelector('.ui-panel');
        const existingUserInfo = this.ui.uiContainer.querySelector('.user-info');

        if (existingUserInfo) {
            existingUserInfo.innerHTML = userInfoHTML;
        } else if (uiPanel) {
            uiPanel.insertAdjacentHTML('beforeend', userInfoHTML);
        }
    }

    private animate(): void {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    public getCurrentUser(): string {
        return this.gameState.currentUser;
    }

    public getLastPlayTime(): string {
        return this.gameState.lastPlayTime;
    }

    public showMenu(menuId: MenuId): void {
        this.menuManager.showMenu(menuId);
    }
}
