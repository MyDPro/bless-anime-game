import * as THREE from 'three';
import { ModelsLoader } from '../utils/loadModels';
import { NotificationManager } from './NotificationManager';
import { EventEmitter } from '../utils/EventEmitter';

interface Character {
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
    model?: THREE.Object3D 
  }> = new Map();
  private currentCarouselIndex: number = 0;
  private characters: Character[] = [];
  private modelsLoader: ModelsLoader;
  private eventEmitter: EventEmitter;

  constructor() {
    console.log("MenuManager başlatılıyor");
    this.modelsLoader = new ModelsLoader();
    this.eventEmitter = new EventEmitter();
    this.menus = new Map();
    document.addEventListener('DOMContentLoaded', () => {
      this.initializeMenus();
    });
  }

  private async initializeMenus(): Promise<void> {
    console.log("Menüler başlatılıyor");
    await this.modelsLoader.loadCharacterModels();
    this.characters = this.modelsLoader.getAllCharacterData();
    if (!this.characters.length) {
      console.error("Karakter verileri yüklenemedi");
      NotificationManager.getInstance().show("Karakter verileri yüklenemedi!", "error");
      return;
    }

    this.menus.set('main', document.getElementById('main-menu')!);
    this.menus.set('character', document.getElementById('character-select')!);
    this.menus.set('scoreboard', document.getElementById('scoreboard')!);
    this.menus.set('settings', document.getElementById('settings')!);
    this.menus.set('pause', document.getElementById('pause-menu')!);
    this.menus.set('gameOver', document.getElementById('game-over')!);

    this.createCharacterCarousel();
    this.setupEventListeners();
  }

  private createCharacterCarousel(): void {
    console.log("Karakter carousel'i oluşturuluyor");
    const characterGrid = document.querySelector('.character-grid');
    if (!characterGrid) {
      console.error("Karakter gridi bulunamadı (.character-grid)");
      NotificationManager.getInstance().show('Karakter carousel yüklenemedi!', 'error');
      return;
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

    this.characters.forEach(char => {
      this.setupCharacterPreview(char.id, char.modelPath);
    });

    this.setupCharacterCardListeners();
    this.setupCarouselListeners();
    this.updateCarousel();
  }

  private setupCharacterPreview(characterId: string, modelPath: string): void {
    console.log(`Karakter önizlemesi ayarlanıyor: ${characterId}`);
    const canvas = document.getElementById(`${characterId}-preview`) as HTMLCanvasElement;
    if (!canvas) {
      console.error(`Karakter önizleme canvas'ı bulunamadı: ${characterId}-preview`);
      NotificationManager.getInstance().show(`Karakter önizlemesi yüklenemedi: ${characterId}`, 'error');
      return;
    }

    if (!canvas.getContext('webgl') && !canvas.getContext('experimental-webgl')) {
      console.error('WebGL desteği bulunamadı');
      NotificationManager.getInstance().show('Tarayıcınız WebGL’yi desteklemiyor!', 'error');
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight || 1, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
    renderer.setSize(canvas.clientWidth || 300, canvas.clientHeight || 200);
    camera.position.set(0, 1.5, 3);
    camera.lookAt(0, 1, 0);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(2, 2, 2);
    scene.add(dirLight);

    this.characterPreviews.set(characterId, { scene, camera, renderer });

    const gltf = this.modelsLoader.getModel(characterId);
    if (gltf) {
      console.log(`Karakter modeli alındı: ${characterId}`);
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
      console.error(`Karakter modeli bulunamadı: ${characterId}`);
      NotificationManager.getInstance().show(`Karakter modeli yüklenemedi: ${characterId}`, 'error');
    }
  }

  private animatePreview(characterId: string): void {
    const preview = this.characterPreviews.get(characterId);
    if (!preview) return;
    const animate = () => {
      if (!this.characterPreviews.has(characterId)) return;
      requestAnimationFrame(animate);
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
    if (cards.length === 0) {
      console.error("Karakter kartları bulunamadı!");
      NotificationManager.getInstance().show("Karakter kartları yüklenemedi!", 'error');
      return;
    }
    cards.forEach(card => {
      card.addEventListener('click', () => {
        const characterId = card.getAttribute('data-character');
        if (characterId) {
          console.log(`Karakter seçildi: ${characterId}`);
          this.selectCharacter(characterId);
        } else {
          console.error("data-character atributu eksik!");
        }
      });
    });
  }

  private setupCarouselListeners(): void {
    console.log("Carousel dinleyicileri ayarlanıyor");
    const prevBtn = document.querySelector('.carousel-button.prev');
    const nextBtn = document.querySelector('.carousel-button.next');
    const navDots = document.querySelectorAll('.nav-dot');

    if (!prevBtn || !nextBtn) {
      console.error("Carousel butonları bulunamadı!");
      NotificationManager.getInstance().show("Carousel butonları yüklenemedi!", 'error');
      return;
    }

    prevBtn.addEventListener('click', () => {
      console.log("Önceki karaktere geçiş");
      this.currentCarouselIndex = (this.currentCarouselIndex - 1 + this.characters.length) % this.characters.length;
      this.updateCarousel();
    });

    nextBtn.addEventListener('click', () => {
      console.log("Sonraki karaktere geçiş");
      this.currentCarouselIndex = (this.currentCarouselIndex + 1) % this.characters.length;
      this.updateCarousel();
    });

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
      const card = document.querySelector('.character-card') as HTMLElement;
      const cardWidth = card ? card.offsetWidth + (2 * parseFloat(getComputedStyle(card).marginRight)) : 320;
      wrapper.style.transform = `translateX(-${this.currentCarouselIndex * cardWidth}px)`;
    }

    const cards = document.querySelectorAll('.character-card');
    cards.forEach((card, index) => {
      card.classList.toggle('active', index === this.currentCarouselIndex);
    });

    const navDots = document.querySelectorAll('.nav-dot');
    navDots.forEach((dot, index) => {
      dot.classList.toggle('active', index === this.currentCarouselIndex);
    });
  }

  private setupEventListeners(): void {
    console.log("Menü olay dinleyicileri ayarlanıyor");
    const confirmBtn = document.getElementById('confirmCharacter');
    if (!confirmBtn) {
      console.error("confirmCharacter butonu bulunamadı!");
      NotificationManager.getInstance().show("Karakter onay butonu bulunamadı!", 'error');
      return;
    }
    confirmBtn.addEventListener('click', () => {
      if (this.selectedCharacter) {
        console.log(`Karakter onaylandı: ${this.selectedCharacter}`);
        NotificationManager.getInstance().show(`Karakter onaylandı: ${this.selectedCharacter}`, 'success');
        this.eventEmitter.emit('characterConfirmed', this.selectedCharacter);
        this.showMenu('main');
      } else {
        console.error("Karakter seçilmedi");
        NotificationManager.getInstance().show('Lütfen bir karakter seçin!', 'error');
      }
    });

    document.getElementById('characterSelectBtn')?.addEventListener('click', () => {
      console.log("Karakter seçimi menüsü açılıyor");
      this.showMenu('character');
    });
    document.getElementById('scoreboardBtn')?.addEventListener('click', () => {
      console.log("Skor tablosu menüsü açılıyor");
      this.showMenu('scoreboard');
    });
    document.getElementById('settingsBtn')?.addEventListener('click', () => {
      console.log("Ayarlar menüsü açılıyor");
      this.showMenu('settings');
    });

    document.getElementById('backFromCharSelect')?.addEventListener('click', () => {
      console.log("Karakter seçiminden ana menüye dönülüyor");
      this.showMenu('main');
    });
    document.getElementById('backFromScoreboard')?.addEventListener('click', () => {
      console.log("Skor tablosundan ana menüye dönülüyor");
      this.showMenu('main');
    });
    document.getElementById('backFromSettings')?.addEventListener('click', () => {
      console.log("Ayarlardan ana menüye dönülüyor");
      this.showMenu('main');
    });

    document.getElementById('startBtn')?.addEventListener('click', () => {
      console.log("Oyun başlatılıyor");
      this.eventEmitter.emit('gameStart');
      this.showMenu('none');
      NotificationManager.getInstance().show('Oyun başlatılıyor...', 'success');
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
      this.selectedCharacter = characterId;
      console.log(`Karakter seçildi: ${characterId}`);
      const index = this.characters.findIndex(char => char.id === characterId);
      if (index !== -1) {
        this.currentCarouselIndex = index;
        this.updateCarousel();
      }
    } else {
      console.error(`Karakter kartı bulunamadı: ${characterId}`);
    }
  }

  public getSelectedCharacter(): string | null {
    return this.selectedCharacter;
  }

  public getEventEmitter(): EventEmitter {
    return this.eventEmitter;
  }
            }
