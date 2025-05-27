import * as THREE from 'three';
import { CharacterData } from '../utils/loadModels';

export interface BoardLayout {
  platformPositions: { x: number; y: number; z: number }[];
  platformSizes: { width: number; height: number; depth: number }[];
  enemyPositions: { x: number; y: number; z: number; characterId: string }[];
}

export class AIManager {
  private characterData: CharacterData[];

  constructor(characterData: CharacterData[]) {
    this.characterData = characterData;
    console.log('AIManager başlatıldı.');
  }

  public async generateBoardLayout(inputData: number[]): Promise<BoardLayout> {
    // inputData: [score, health, level] gibi oyun durumunu temsil eder
    const [score = 0, health = 100, level = 1] = inputData;

    // Platform sayısı ve düşman sayısı, oyun durumuna göre dinamik olarak belirlenir
    const platformCount = Math.min(5 + Math.floor(score / 100), 10); // Skora bağlı platform sayısı
    const enemyCount = Math.min(3 + Math.floor(level / 2), 8); // Seviyeye bağlı düşman sayısı

    const platformPositions: { x: number; y: number; z: number }[] = [];
    const platformSizes: { width: number; height: number; depth: number }[] = [];
    const enemyPositions: { x: number; y: number; z: number; characterId: string }[] = [];

    // Platformları oluştur
    for (let i = 0; i < platformCount; i++) {
      const width = 5 + Math.random() * 5; // 5-10 arası rastgele genişlik
      const depth = 5 + Math.random() * 5; // 5-10 arası rastgele derinlik
      const height = 0.5 + Math.random() * 0.5; // 0.5-1 arası yükseklik
      const x = (Math.random() - 0.5) * 20; // -10 ile 10 arasında rastgele x
      const z = (Math.random() - 0.5) * 20; // -10 ile 10 arasında rastgele z
      const y = -0.25 + height / 2; // Platformun y konumu

      platformPositions.push({ x, y, z });
      platformSizes.push({ width, height, depth });
    }

    // Düşmanları platformlar üzerine yerleştir
    for (let i = 0; i < enemyCount; i++) {
      const platformIndex = Math.floor(Math.random() * platformCount);
      const pos = platformPositions[platformIndex];
      const size = platformSizes[platformIndex];
      const character = this.characterData[Math.floor(Math.random() * this.characterData.length)];

      // Düşmanı platformun üzerine yerleştir
      const enemyX = pos.x + (Math.random() - 0.5) * size.width * 0.8;
      const enemyZ = pos.z + (Math.random() - 0.5) * size.depth * 0.8;
      const enemyY = pos.y + size.height / 2 + 1; // Platformun üstünde, karakter yüksekliği kadar yukarıda

      enemyPositions.push({
        x: enemyX,
        y: enemyY,
        z: enemyZ,
        characterId: character.id,
      });
    }

    return { platformPositions, platformSizes, enemyPositions };
  }

  public cleanup(): void {
    console.log('AIManager temizlendi.');
  }
}
