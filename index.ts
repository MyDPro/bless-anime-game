import WebServer from '@blockless/sdk-ts/dist/lib/web';

const server = new WebServer();

try {
  server.statics('public', '/');
  server.start(3000); // bls.toml'deki port ile uyumlu
  console.log('Blockless web sunucusu başlatıldı: http://localhost:3000');
} catch (error) {
  console.error('Web sunucusu başlatma hatası:', error);
  throw error;
}
