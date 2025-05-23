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

export class Game {
    private readonly scene: THREE.Scene;
    private readonly camera: THREE.PerspectiveCamera;
    private readonly renderer: THREE.WebGLRenderer;
    private readonly controls: OrbitControls;
    private readonly modelsLoader: ModelsLoader;
    private readonly eventEmitter: EventEmitter;
    private readonly menuManager: MenuManager;
    private readonly CURRENT_USER = 'MyDemir';
    private readonly CURRENT_TIME = '2025-05-23 21:15:47';

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
        
        // Core initialization
        this.eventEmitter = new EventEmitter();
        this.menuManager = new MenuManager();
        this.scene = this.createScene();
        [this.camera, this.renderer] = this.createRenderer(canvas);
        this.controls = this.createControls();
        this.modelsLoader = new ModelsLoader(this.scene);
        this.ui = this.initializeUI();

        // Setup and initialization
        this.setupWorld();
        this.setupEventListeners();
        this.loadHighScore();
        
        // Initial UI state
        this.ui.uiContainer.classList.add('hidden');

        // Start loading process
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
                this.modelsLoader.loadBlasterModels()
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
                this.menuManager.showMenu('main');
            }, this.GAME_CONFIG.LOADING_FADE_DURATION);
        } else {
            this.menuManager.showMenu('main');
        }
        NotificationManager.getInstance().show('Modeller başarıyla yüklendi!', 'success');
    }

    private setupWorld(): void {
        // Lights
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

    // Event handlers
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

    // Event handler implementations
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
            this.menuManager.showMenu('character');
            return;
        }
        this.startGame();
    }

    // Game state management
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

    // UI updates
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

    // Game loop and rendering
    private animate(): void {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    // Public methods
    public getCurrentUser(): string {
        return this.gameState.currentUser;
    }

    public getLastPlayTime(): string {
        return this.gameState.lastPlayTime;
    }

    public showMenu(menuId: string): void {
        this.menuManager.showMenu(menuId);
    }

    // Implementation of remaining methods...
    // Note: The rest of the methods (shoot, togglePause, etc.) would follow 
    // similar patterns of organization and error handling
}
