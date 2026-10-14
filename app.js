import {
  HandLandmarker,
  FilesetResolver
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest';

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', {
  willReadFrequently: true
});

// CONTROLE DE FILTROS

const filters = ['gray', 'sepia', 'invert', 'pixel'];
let currentFilter = 0;

// Controle da pinça
let pinching = false;


// AJUSTE DO CANVAS

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// =====================
// CÂMERA
// =====================
const stream = await navigator.mediaDevices.getUserMedia({
  video: {
    width: 640,
    height: 480
  }
});

video.srcObject = stream;
await video.play();

// =====================
// MEDIAPIPE
// =====================
const vision = await FilesetResolver.forVisionTasks(
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
);

const handLandmarker = await HandLandmarker.createFromOptions(vision, {
  baseOptions: {
    modelAssetPath:
      'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
  },
  runningMode: 'VIDEO',
  numHands: 2
});

// =====================
// LOOP PRINCIPAL
// =====================
function render() {

  // Limpa o canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Desenha o vídeo espelhado
  ctx.save();
  ctx.scale(-1, 1);
  ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
  ctx.restore();

  // Detecta mãos
  const results = handLandmarker.detectForVideo(
    video,
    performance.now()
  );

  // Precisamos de duas mãos
  if (results.landmarks.length === 2) {

    const handA = results.landmarks[0];
    const handB = results.landmarks[1];

    // Pontas dos dedos
    const indexA = handA[8];
    const indexB = handB[8];

    const thumbA = handA[4];
    const thumbB = handB[4];

    // Coordenadas espelhadas
    const ix1 = canvas.width - indexA.x * canvas.width;
    const iy1 = indexA.y * canvas.height;

    const ix2 = canvas.width - indexB.x * canvas.width;
    const iy2 = indexB.y * canvas.height;

    const tx1 = canvas.width - thumbA.x * canvas.width;
    const ty1 = thumbA.y * canvas.height;

    const tx2 = canvas.width - thumbB.x * canvas.width;
    const ty2 = thumbB.y * canvas.height;

    // =====================
    // DETECÇÃO DA PINÇA
    // =====================
    const distA = Math.hypot(ix1 - tx1, iy1 - ty1);
    const distB = Math.hypot(ix2 - tx2, iy2 - ty2);

    const PINCH_START = 40;
    const PINCH_END = 70;

    if (distA < PINCH_START &&
        distB < PINCH_START &&
        !pinching) {

      pinching = true;

      currentFilter =
        (currentFilter + 1) % filters.length;

      console.log('Filtro:', filters[currentFilter]);
    }

    if (distA > PINCH_END ||
        distB > PINCH_END) {

      pinching = false;
    }

    // =====================
    // POLÍGONO
    // =====================
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(0,255,136,0.6)';
    ctx.shadowBlur = 15;

    ctx.beginPath();
    ctx.moveTo(ix1, iy1);
    ctx.lineTo(ix2, iy2);
    ctx.lineTo(tx2, ty2);
    ctx.lineTo(tx1, ty1);
    ctx.closePath();
    ctx.stroke();

    ctx.shadowBlur = 0;

    // =====================
    // PONTOS
    // =====================
    ctx.fillStyle = '#ff3b30';

    const points = [
      [ix1, iy1],
      [ix2, iy2],
      [tx1, ty1],
      [tx2, ty2]
    ];

    points.forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
    });

    // =====================
    // TEXTO DO FILTRO
    // =====================
    ctx.fillStyle = '#00ff88';
    ctx.font = '24px Arial';
    ctx.fillText(
      `Filtro: ${filters[currentFilter]}`,
      20,
      40
    );

    // =====================
    // ÁREA DELIMITADORA
    // =====================
    const left = Math.max(0,
      Math.floor(Math.min(ix1, ix2, tx1, tx2))
    );

    const right = Math.min(canvas.width,
      Math.ceil(Math.max(ix1, ix2, tx1, tx2))
    );

    const top = Math.max(0,
      Math.floor(Math.min(iy1, iy2, ty1, ty2))
    );

    const bottom = Math.min(canvas.height,
      Math.ceil(Math.max(iy1, iy2, ty1, ty2))
    );

    const width = right - left;
    const height = bottom - top;

    // =====================
    // FILTRO COM MÁSCARA
    // =====================
    if (width > 10 && height > 10) {

      const imageData =
        ctx.getImageData(left, top, width, height);

      const data = imageData.data;

      const filterName = filters[currentFilter];

      for (let i = 0; i < data.length; i += 4) {

        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];

        switch (filterName) {

          case 'gray': {
            const gray = (r + g + b) / 3;
            r = g = b = gray;
            break;
          }

          case 'sepia': {
            const nr =
              Math.min(255,
                0.393*r + 0.769*g + 0.189*b);

            const ng =
              Math.min(255,
                0.349*r + 0.686*g + 0.168*b);

            const nb =
              Math.min(255,
                0.272*r + 0.534*g + 0.131*b);

            r = nr;
            g = ng;
            b = nb;
            break;
          }

          case 'invert': {
            r = 255 - r;
            g = 255 - g;
            b = 255 - b;
            break;
          }

          case 'pixel': {
            const gray = (r + g + b) / 3;
            const v = gray > 128 ? 255 : 0;
            r = g = b = v;
            break;
          }
        }

        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
      }

      // Canvas temporário
      const tempCanvas =
        document.createElement('canvas');

      tempCanvas.width = width;
      tempCanvas.height = height;

      const tempCtx =
        tempCanvas.getContext('2d');

      tempCtx.putImageData(imageData, 0, 0);

      // Aplica máscara do polígono
      ctx.save();

      ctx.beginPath();
      ctx.moveTo(ix1, iy1);
      ctx.lineTo(ix2, iy2);
      ctx.lineTo(tx2, ty2);
      ctx.lineTo(tx1, ty1);
      ctx.closePath();
      ctx.clip();

      ctx.drawImage(tempCanvas, left, top);

      ctx.restore();
    }
  }

  requestAnimationFrame(render);
}

render();