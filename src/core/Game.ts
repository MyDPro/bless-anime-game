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
    selectedKit: string | null;
    highScore: number;
    currentUser: string;
    lastPlayTime: string;
}

interface GameResources {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
}

export class Game extends EventEmitter {
    private resources: GameResources;
    private modelsLoader: ModelsLoader;
    private menuManager: MenuManager | null = null;
    private lastTime: number = 0;
    private readonly targetFPS = 50;
    private readonly frameInterval = 1000 / this.targetFPS;
    private animationFrameId: number | null = null;
    private platform: THREE.Mesh;

    private gameState: GameState = {
        isStarted: false,
        isPaused: false,
        score: 0,
        health: 100,
        ammo: 30,
        selectedCharacter: null,
        selectedKit: null,
        highScore: 0,
        currentUser: 'MyDemir',
        lastPlayTime: '2025-05-27 19:58:00'
    };

    private ui = {
        score: document.getElementById('score') as HTMLElement,
        health: document.getElementById('health') as HTMLElement,
        ammo: document.getElementById('ammo') as HTMLElement,
        uiContainer: document.getElementById('ui') as HTMLElement,
        loadingScreen: document.getElementById('loading-screen') as HTMLElement,
        finalScore: document.getElementById('final-score') as HTMLElement,
        highScore: document.getElementById('high-score') as HTMLElement
    };

    private player: THREE.Object3D | null = null;
    private weapon: THREE.Object3D | null = null;
    private blasters: THREE.Object3D[] = [];
    private enemies: THREE.Object3D[] = [];
    private moveState = {
        forward: false,
        backward: false,
        left: false,
        right: false,
        jump: false
    };

    private readonly MOVEMENT_SPEED = 5;
    private readonly ROTATION_SPEED = 2;
    private readonly raycaster = new THREE.Raycaster();
    private readonly moveDirection = new THREE.Vector3();

    constructor(canvas: HTMLCanvasElement) {
        super();
        console.log("Game sınıfı başlatılıyor");
        
        this.resources = this.initializeResources(canvas);
        this.modelsLoader = new ModelsLoader(this.resources.scene);
        
        this.platform = this.setupWorld();
        this.loadGameState();
        this.setCurrentDateTime();
        
        this.initializeGame();
    }

    private initializeResources(canvas: HTMLCanvasElement): GameResources {
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xbfd1e5);

        const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(5, 5, 5);
        camera.lookAt(0, 0, 0);

        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.target.set(0, 1, 0);

        return { scene, camera, renderer, controls };
    }

    private async initializeGame(): Promise<void> {
        this.ui.uiContainer.classList.add('hidden');
        
        try {
            this.menuManager = new MenuManager(this.modelsLoader);
            this.setupMenuListeners();
            if (this.ui.loadingScreen) {
                this.ui.loadingScreen.classList.add('fade-out');
                await new Promise(resolve => setTimeout(resolve, 500));
                this.ui.loadingScreen.classList.add('hidden');
                this.menuManager.showMenu('main');
            }
            this.animate();
            NotificationManager.getInstance().show('Oyun yüklendi!', 'success');
        } catch (error) {
            console.error('Oyun başlatılamadı:', error);
            NotificationManager.getInstance().show('Oyun başlatılamadı! Lütfen sayfayı yenileyin.', 'error');
        }
    }

    private setCurrentDateTime(): void {
        const now = new Date();
        const year = now.getUTCFullYear();
        const month = String(now.getUTCMonth() + 1).padStart(2, '0');
        const day = String(now.getUTCDate()).padStart(2, '0');
        const hours = String(now.getUTCHours() + 3).padStart(2, '0');
        const minutes = String(now.getUTCMinutes()).padStart(2, '0');
        const seconds = String(now.getUTCSeconds()).padStart(2, '0');
        this.gameState.lastPlayTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    private loadGameState(): void {
        const savedState = localStorage.getItem('gameState');
        if (savedState) {
            const parsedState = JSON.parse(savedState);
            this.gameState = { ...this.gameState, ...parsedState };
        }
        
        const savedHighScore = localStorage.getItem('highScore');
        if (savedHighScore) {
            this.gameState.highScore = parseInt(savedHighScore);
        }
    }

    private saveGameState(): void {
        const stateToSave = {
            highScore: this.gameState.highScore,
            lastPlayTime: this.gameState.lastPlayTime,
            selectedCharacter: this.gameState.selectedCharacter,
            selectedKit: this.gameState.selectedKit
        };
        localStorage.setItem('gameState', JSON.stringify(stateToSave));
        localStorage.setItem('highScore', this.gameState.highScore.toString());
    }

    private setupMenuListeners(): void {
        if (this.menuManager) {
            this.menuManager.on('startGame', () => {
                console.log("Oyun başlatılıyor");
                const selectedCharacter = this.menuManager!.getSelectedCharacterId();
                const selectedKit = this.menuManager!.getSelectedKit();
                if (!selectedCharacter || !selectedKit) {
                    NotificationManager.getInstance().show('Lütfen bir karakter ve silah seçin!', 'error');
                    this.menuManager!.showMenu('character');
                    return;
                }
                this.startGame();
            });

            this.menuManager.on('characterSelected', (characterId: string, kitId: string) => {
                console.log(`Karakter ve silah seçildi: ${characterId}, ${kitId}`);
                this.gameState.selectedCharacter = characterId;
                this.gameState.selectedKit = kitId;
                this.saveGameState();
            });

            this.menuManager.on('resumeGame', () => {
                console.log("Oyun devam ettiriliyor");
                this.resumeGame();
            });

            this.menuManager.on('restartGame', () => {
                console.log("Oyun yeniden başlatılıyor");
                this.restartGame();
            });

            this.menuManager.on('exitToMain', () => {
                console.log("Ana menüye dönülüyor");
                this.exitToMain();
            });
        }
    }

    private animate(currentTime: number = 0): void {
        this.animationFrameId = requestAnimationFrame((time) => this.animate(time));

        const deltaTime = (currentTime - this.lastTime) / 1000;
        if (deltaTime < this.frameInterval) return;

        if (this.gameState.isStarted && !this.gameState.isPaused) {
            this.gameLoop(deltaTime);
            this.resources.controls.update();
            this.resources.renderer.render(this.resources.scene, this.resources.camera);
        }

        this.lastTime = currentTime;
    }

    private updatePlayerMovement(deltaTime: number): void {
        if (!this.player) return;

        this.moveDirection.set(0, 0, 0);

        if (this.moveState.forward) this.moveDirection.z -= 1;
        if (this.moveState.backward) this.moveDirection.z += 1;
        if (this.moveState.left) this.moveDirection.x -= 1;
        if (this.moveState.right) this.moveDirection.x += 1;

        if (this.moveDirection.length() > 0) {
            this.moveDirection.normalize().multiplyScalar(this.MOVEMENT_SPEED * deltaTime);
            this.player.position.add(this.moveDirection);
            this.checkCollisions();
        }

        if (this.weapon && this.player) {
            this.weapon.position.copy(this.player.position);
            this.weapon.rotation.copy(this.player.rotation);
            this.weapon.position.y += 0.5;
            this.weapon.position.z -= 0.3;
        }
    }

    private checkCollisions(): void {
        if (!this.player) return;

        this.raycaster.set(
            this.player.position,
            new THREE.Vector3(0, -1, 0)
        );

        const intersects = this.raycaster.intersectObjects([this.platform]);
        if (intersects.length > 0) {
            const distance = intersects[0].distance;
            if (distance < 0.5) {
                this.player.position.y = intersects[0].point.y + 0.5;
            }
        }
    }

    public cleanup(): void {
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        window.removeEventListener('resize', this.onWindowResize.bind(this));
        document.removeEventListener('keydown', this.onKeyDown.bind(this));
        document.removeEventListener('keyup', this.onKeyUp.bind(this));
        document.removeEventListener('mousedown', this.onMouseDown.bind(this));
        document.removeEventListener('mouseup', this.onMouseUp.bind(this));
        document.removeEventListener('mousemove', this.onMouseMove.bind(this));

        while (this.resources.scene.children.length > 0) {
            const object = this.resources.scene.children[0];
            this.resources.scene.remove(object);
            if (object instanceof THREE.Mesh) {
                object.geometry.dispose();
                if (Array.isArray(object.material)) {
                    object.material.forEach(material => material.dispose());
                } else {
                    object.material.dispose();
                }
            }
        }

        this.resources.renderer.dispose();
        this.resources.controls.dispose();
        this.modelsLoader.cleanup();
        if (this.menuManager) this.menuManager.cleanup();

        this.gameState.isStarted = false;
        this.gameState.isPaused = false;
        this.gameState.score = 0;
        this.gameState.health = 100;
        this.gameState.ammo = 30;
        this.player = null;
        this.weapon = null;
        this.blasters = [];
        this.enemies = [];

        this.saveGameState();
    }

    private setupWorld(): THREE.Mesh {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.resources.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1);
        dirLight.position.set(5, 10, 5);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 512;
        dirLight.shadow.mapSize.height = 512;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 50;
        dirLight.shadow.camera.left = -10;
        dirLight.shadow.camera.right = 10;
        dirLight.shadow.camera.top = 10;
        dirLight.shadow.camera.bottom = -10;
        this.resources.scene.add(dirLight);

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
        this.resources.scene.add(platform);
        return platform;
    }

    private onWindowResize(): void {
        this.resources.camera.aspect = window.innerWidth / window.innerHeight;
        this.resources.camera.updateProjectionMatrix();
        this.resources.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    private onKeyDown(event: KeyboardEvent): void {
        if (!this.gameState.isStarted || this.gameState.isPaused) return;

        switch (event.code) {
            case 'KeyW':
            case 'ArrowUp':
                this.moveState.forward = true;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.moveState.backward = true;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.moveState.left = true;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.moveState.right = true;
                break;
            case 'Space':
                this.moveState.jump = true;
                break;
            case 'Escape':
                this.togglePause();
                break;
        }
    }

    private onKeyUp(event: KeyboardEvent): void {
        switch (event.code) {
            case 'KeyW':
            case 'ArrowUp':
                this.moveState.forward = false;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.moveState.backward = false;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.moveState.left = false;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.moveState.right = false;
                break;
            case 'Space':
                this.moveState.jump = false;
                break;
        }
    }

    private onMouseDown(event: MouseEvent): void {
        if (!this.gameState.isStarted || this.gameState.isPaused) return;
        if (event.button === 0) {
            this.shoot();
        }
    }

    private onMouseUp(event: MouseEvent): void {}

    private onMouseMove(event: MouseEvent): void {
        if (!this.gameState.isStarted || this.gameState.isPaused) return;
        if (this.player) {
            const movementX = event.movementX || 0;
            this.player.rotation.y -= movementX * 0.002 * this.ROTATION_SPEED;
        }
    }

    private updateUI(): void {
        if (this.ui.score.textContent !== `Skor: ${this.gameState.score}`) {
            this.ui.score.textContent = `Skor: ${this.gameState.score}`;
            this.ui.health.textContent = `Can: ${this.gameState.health}`;
            this.ui.ammo.textContent = `Mermi: ${this.gameState.ammo}`;
            this.ui.finalScore.textContent = `Skor: ${this.gameState.score}`;
            this.ui.highScore.textContent = `En Yüksek Skor: ${this.gameState.highScore}`;

            const userInfoDiv = document.createElement('div');
            userInfoDiv.classList.add('user-info-item');
            userInfoDiv.innerHTML = `
                <div class="user-info-item">
                    <span class="user-info-label">Oyuncu:</span>
                    <span class="user-info-value">${this.gameState.currentUser}</span>
                </div>
                <div class="user-info-item">
                    <span class="user-info-label">Karakter:</span>
                    <span class="user-info-value">${this.gameState.selectedCharacter || 'Seçilmedi'}</span>
                </div>
                <div class="user-info-item">
                    <span class="user-info-label">Silah:</span>
                    <span class="user-info-value">${this.gameState.selectedKit || 'Seçilmedi'}</span>
                </div>
                <div class="user-info-item">
                    <span class="user-info-label">Son Oynama:</span>
                    <span class="user-info-value">${this.gameState.lastPlayTime}</span>
                </div>
            `;
            const existingUserInfo = this.ui.uiContainer.querySelector('.user-info');
            if (!existingUserInfo) {
                this.ui.uiContainer.querySelector('.ui-panel')?.appendChild(userInfoDiv);
            } else {
                existingUserInfo.innerHTML = userInfoDiv.innerHTML;
            }
        }
    }

    private gameLoop(deltaTime: number): void {
        this.updatePlayerMovement(deltaTime);
        this.updateEnemies(deltaTime);
        this.checkCollisions();
    }

    private updateEnemies(deltaTime: number): void {
        this.enemies.forEach(enemy => {
            // Düşman güncelleme mantığı
        });
    }

    public startGame(): void {
        const selectedCharacter = this.menuManager?.getSelectedCharacterId();
        const selectedKit = this.menuManager?.getSelectedKit();
        if (!selectedCharacter || !selectedKit) {
            NotificationManager.getInstance().show('Lütfen bir karakter ve silah seçin!', 'error');
            this.menuManager?.showMenu('character');
            return;
        }

        this.gameState.selectedCharacter = selectedCharacter;
        this.gameState.selectedKit = selectedKit;

        Promise.all([
            this.modelsLoader.loadCharacterModels([selectedCharacter]),
            this.modelsLoader.loadKitModels([selectedKit])
        ]).then(() => {
            const characterModel = this.modelsLoader.getModel(selectedCharacter);
            const kitModel = this.modelsLoader.getModel(selectedKit);
            if (!characterModel || !kitModel) {
                NotificationManager.getInstance().show(`Karakter veya silah modeli yüklenemedi: ${selectedCharacter}, ${selectedKit}`, 'error');
                this.menuManager?.showMenu('character');
                return;
            }

            NotificationManager.getInstance().show(`${this.gameState.currentUser} olarak ${selectedCharacter} ve ${selectedKit} ile oyuna başlandı!`, 'success');

            if (this.player) {
                this.resources.scene.remove(this.player);
            }
            if (this.weapon) {
                this.resources.scene.remove(this.weapon);
            }

            this.player = characterModel.scene.clone();
            if (!this.player) {
                NotificationManager.getInstance().show('Karakter modeli klonlanamadı!', 'error');
                return;
            }
            this.player.name = selectedCharacter;
            this.player.position.set(0, 1, 0);
            this.resources.scene.add(this.player);

            this.weapon = kitModel.scene.clone();
            if (!this.weapon) {
                NotificationManager.getInstance().show('Silah modeli klonlanamadı!', 'error');
                return;
            }
            this.weapon.name = selectedKit;
            this.resources.scene.add(this.weapon);

            this.gameState.isStarted = true;
            this.gameState.isPaused = false;
            this.gameState.score = 0;
            this.gameState.health = 100;
            this.gameState.ammo = 30;
            this.setCurrentDateTime();

            this.ui.uiContainer.classList.remove('hidden');
            this.menuManager?.showMenu('none');
            this.updateUI();
        }).catch(error => {
            console.error('Model yükleme hatası:', error);
            NotificationManager.getInstance().show('Model yüklenemedi!', 'error');
        });
    }

    private shoot(): void {
        if (this.gameState.ammo <= 0) {
            NotificationManager.getInstance().show('Mermi bitti!', 'error');
            this.emit('outOfAmmo');
            return;
        }

        this.gameState.ammo--;
        if (this.gameState.ammo <= 5) {
            NotificationManager.getInstance().show('Mermi azalıyor!', 'warning');
        }

        this.emit('weaponFired', this.gameState.ammo);
        this.updateUI();

        if (this.player && this.weapon) {
            const direction = new THREE.Vector3(0, 0, -1);
            direction.applyQuaternion(this.weapon.quaternion);
            this.raycaster.set(this.player.position, direction);
            const intersects = this.raycaster.intersectObjects(this.enemies);
            
            if (intersects.length > 0) {
                const hitEnemy = intersects[0].object;
                this.emit('scoreUpdate', 10);
            }
        }
    }

    private togglePause(): void {
        this.gameState.isPaused = !this.gameState.isPaused;
        if (this.gameState.isPaused) {
            NotificationManager.getInstance().show('Oyun duraklatıldı');
            this.menuManager?.showMenu('pause');
        } else {
            NotificationManager.getInstance().show('Oyun devam ediyor', 'success');
            this.menuManager?.showMenu('none');
        }
    }

    private resumeGame(): void {
        this.gameState.isPaused = false;
        NotificationManager.getInstance().show('Oyun devam ediyor', 'success');
        this.menuManager?.showMenu('none');
    }

    private restartGame(): void {
        console.log("Oyun yeniden başlatılıyor");
        this.cleanup();
        this.resources.renderer = new THREE.WebGLRenderer({
            canvas: this.resources.renderer.domElement,
            antialias: true,
            powerPreference: 'high-performance'
        });
        this.resources.renderer.setSize(window.innerWidth, window.innerHeight);
        this.resources.renderer.shadowMap.enabled = true;
        this.resources.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.resources.controls = new OrbitControls(this.resources.camera, this.resources.renderer.domElement);
        this.resources.controls.enableDamping = true;
        this.resources.controls.dampingFactor = 0.05;
        this.resources.controls.target.set(0, 1, 0);

        this.platform = this.setupWorld();
        this.initializeGame();
    }

    private endGame(): void {
        this.gameState.isStarted = false;
        if (this.gameState.score > this.gameState.highScore) {
            this.gameState.highScore = this.gameState.score;
            this.saveGameState();
        }
        this.updateUI();
        this.menuManager?.showMenu('gameOver');
    }

    private exitToMain(): void {
        console.log("Ana menüye dönülüyor");
        this.gameState.isStarted = false;
        this.gameState.isPaused = false;
        this.ui.uiContainer.classList.add('hidden');
        if (this.menuManager) {
            this.menuManager.showMenu('main');
        } else {
            console.error("MenuManager mevcut değil!");
            NotificationManager.getInstance().show('Ana menüye geçiş başarısız!', 'error');
        }
    }
}
