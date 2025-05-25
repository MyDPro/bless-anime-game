bless-anime-game/
├── bls.toml              # Bless project config
├── index.ts               # Entry point
├── src/                  # Source files
│   ├── core/            # Core game systems
│   │   ├── Game.ts      # Main game logic
│   │   └── MenuManager.ts
│   │   └── ErrorManager.ts
│   │   └── main.ts         
│   │   └── NotificationManager.ts
│   ├── utils/           # Utility functions
│   │   ├── EventEmitter.ts
│   │   └── loadModels.ts
├── public/              # Static assets
│   └── index.html
│   └── style.css
│   └── data/
│      ├── characters.json
│   └── models/
│      ├── character
│               ├── Textures
│      ├── city-kit/
│      └── kit/
├── tsconfig.base.json   # Base TS config
├── tsconfig.debug.json  # Debug TS config
├── tsconfig.release.json# Release TS config
└── package.json         # Dependencies
