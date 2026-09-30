import { ChromaConfig, LogoConfig, TickerConfig } from '../types';

// Matrix drop list state
interface MatrixDrop {
  x: number;
  y: number;
  speed: number;
  chars: string[];
}
let matrixDrops: MatrixDrop[] = [];

// Synthwave grid offset
let synthwaveOffset = 0;

export function initRenderer(width: number) {
  // Initialize matrix drops
  matrixDrops = [];
  const columns = Math.ceil(width / 16);
  for (let i = 0; i < columns; i++) {
    matrixDrops.push({
      x: i * 16,
      y: Math.random() * -500,
      speed: 2 + Math.random() * 4,
      chars: Array.from({ length: 15 }, () => (Math.random() > 0.5 ? '1' : '0')),
    });
  }
}

/**
 * Draws the selected interactive background preset on the background canvas buffer.
 */
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  type: string,
  time: number,
  solidColor: string,
  customImageUrl?: string
) {
  ctx.save();
  ctx.clearRect(0, 0, width, height);

  if (type === 'solid') {
    ctx.fillStyle = solidColor || '#121214';
    ctx.fillRect(0, 0, width, height);
  } else if (type === 'nature') {
    // Elegant warm mountain sunset background
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#1a0b2e'); // Deep outer space
    grad.addColorStop(0.4, '#3b154c'); // Deep violet
    grad.addColorStop(0.7, '#8c2d58'); // Sunset magenta
    grad.addColorStop(0.9, '#d15a3c'); // Vivid orange
    grad.addColorStop(1, '#f79f45'); // Golden yellow
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Glowing sun
    ctx.beginPath();
    const sunX = width * 0.5;
    const sunY = height * 0.65 + Math.sin(time * 0.5) * 5;
    const sunRad = Math.min(width, height) * 0.22;
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, sunRad);
    sunGrad.addColorStop(0, 'rgba(255, 244, 200, 1)');
    sunGrad.addColorStop(0.3, 'rgba(255, 180, 50, 0.9)');
    sunGrad.addColorStop(1, 'rgba(255, 80, 0, 0)');
    ctx.fillStyle = sunGrad;
    ctx.arc(sunX, sunY, sunRad, 0, Math.PI * 2);
    ctx.fill();

    // Mountain silhouettes
    ctx.fillStyle = '#0f051c';
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, height * 0.82);
    // Draw mountain peak 1
    ctx.quadraticCurveTo(width * 0.25, height * 0.72, width * 0.45, height * 0.85);
    // Draw mountain peak 1.5
    ctx.quadraticCurveTo(width * 0.65, height * 0.76, width * 0.8, height * 0.89);
    // Draw peak 2
    ctx.quadraticCurveTo(width * 0.9, height * 0.84, width, height * 0.9);
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();

    // Foreground mountains (layered dark purple)
    ctx.fillStyle = '#1e0c33';
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, height * 0.9);
    ctx.quadraticCurveTo(width * 0.15, height * 0.85, width * 0.35, height * 0.91);
    ctx.quadraticCurveTo(width * 0.6, height * 0.82, width * 0.75, height * 0.93);
    ctx.quadraticCurveTo(width * 0.88, height * 0.88, width, height * 0.94);
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();
    
    // Add subtle ambient stars
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    for (let i = 0; i < 15; i++) {
      const starX = (Math.sin(i * 1234.5) * 0.5 + 0.5) * width;
      const starY = (Math.cos(i * 5432.1) * 0.5 + 0.5) * height * 0.5;
      const flare = Math.abs(Math.sin(time + i)) * 1.5;
      ctx.fillRect(starX, starY, flare, flare);
    }
  } else if (type === 'matrix') {
    // Dark terminal green digital cascade background
    ctx.fillStyle = '#040705';
    ctx.fillRect(0, 0, width, height);

    ctx.font = '11px monospace';
    ctx.fillStyle = 'rgba(0, 255, 70, 0.45)';

    // Initialize drops if they cleared
    if (matrixDrops.length === 0) {
      initRenderer(width);
    }

    matrixDrops.forEach((drop) => {
      // Draw standard column chars
      for (let index = 0; index < drop.chars.length; index++) {
        const char = drop.chars[index];
        const opacity = (index + 1) / drop.chars.length;
        ctx.fillStyle = index === drop.chars.length - 1 
          ? 'rgba(220, 255, 220, 1.0)' // Bright glowing head
          : `rgba(0, 240, 60, ${opacity * 0.55})`;
        
        ctx.fillText(char, drop.x, drop.y + index * 14);
      }

      // Move drops down
      drop.y += drop.speed;
      if (drop.y > height) {
        drop.y = -200;
        drop.speed = 2 + Math.random() * 4;
      }

      // Occasionally randomize chars
      if (Math.random() > 0.92) {
        drop.chars.shift();
        drop.chars.push(Math.random() > 0.5 ? '1' : '0');
      }
    });

    // Retro grid overlay on top of matrix
    ctx.strokeStyle = 'rgba(0, 255, 70, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 18) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  } else if (type === 'neon') {
    // Synthwave Neon Perspective Grid background
    ctx.fillStyle = '#10051e';
    ctx.fillRect(0, 0, width, height);

    // Neon glowing striped sun in the background
    const sunX = width * 0.5;
    const sunY = height * 0.45;
    const sunRadius = Math.min(width, height) * 0.25;

    // Glowing pink-yellow radial center
    const neonGrad = ctx.createLinearGradient(0, sunY - sunRadius, 0, sunY + sunRadius);
    neonGrad.addColorStop(0, '#ff0276');
    neonGrad.addColorStop(1, '#ffd000');
    ctx.fillStyle = neonGrad;

    // Draw retro sun with horizon scanline cutouts
    ctx.save();
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillRect(sunX - sunRadius, sunY - sunRadius, sunRadius * 2, sunRadius * 2);
    
    // Draw black cutting bands (slits getting bigger towards the bottom)
    ctx.fillStyle = '#10051e';
    for (let y = sunY - sunRadius + 10; y < sunY + sunRadius; y += 14) {
      const depthRatio = (y - (sunY - sunRadius)) / (sunRadius * 2);
      const bandHeight = depthRatio * 6;
      if (depthRatio > 0.4) {
        ctx.fillRect(sunX - sunRadius, y, sunRadius * 2, bandHeight);
      }
    }
    ctx.restore();

    // Perspective Grid floor at Y > height * 0.5
    const horizon = height * 0.55;
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 1.5;
    
    // Horizontal lines expanding downwards
    synthwaveOffset = (synthwaveOffset + 0.8) % 24;
    let gridCount = 0;
    for (let y = horizon; y < height; y += 4 + gridCount * 2.5) {
      // Offset position for smooth scroll
      const scrolledY = y + (synthwaveOffset * (1 + gridCount * 0.15));
      if (scrolledY < height && scrolledY >= horizon) {
        ctx.beginPath();
        const lineAlpha = ((scrolledY - horizon) / (height - horizon));
        ctx.strokeStyle = `rgba(244, 63, 94, ${lineAlpha * 0.85})`;
        ctx.moveTo(0, scrolledY);
        ctx.lineTo(width, scrolledY);
        ctx.stroke();
      }
      gridCount++;
    }

    // Perspective vertical lines emanating from the horizon center
    const vpX = width * 0.5;
    for (let i = -12; i <= 12; i++) {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(244, 63, 94, 0.45)`;
      ctx.moveTo(vpX + i * 1.5, horizon);
      ctx.lineTo(vpX + i * 50, height);
      ctx.stroke();
    }
  } else if (type === 'city') {
    // Cyberpunk Abstract Laser Grid / Grid waves
    const cyGrad = ctx.createLinearGradient(0, 0, width, height);
    cyGrad.addColorStop(0, '#02010c');
    cyGrad.addColorStop(1, '#1b021a');
    ctx.fillStyle = cyGrad;
    ctx.fillRect(0, 0, width, height);

    // Dynamic waving light bands
    ctx.lineWidth = 2;
    for (let waveIndex = 0; waveIndex < 3; waveIndex++) {
      ctx.beginPath();
      ctx.strokeStyle = waveIndex === 0 
        ? 'rgba(0, 240, 255, 0.35)' // Cyan
        : waveIndex === 1 
          ? 'rgba(240, 0, 255, 0.25)' // Violet
          : 'rgba(255, 230, 0, 0.15)'; // Yellow

      ctx.moveTo(0, height * 0.4);
      for (let x = 0; x <= width + 20; x += 20) {
        const offsetMultiplier = 15 + waveIndex * 15;
        const waveSpeed = time * (1 + waveIndex * 0.3) * 0.8;
        const waveY = height * 0.5 + Math.sin(x * 0.01 + waveSpeed) * offsetMultiplier + Math.cos(x * 0.005 - waveSpeed * 0.5) * 8;
        ctx.lineTo(x, waveY);
      }
      ctx.stroke();
    }

    // Aesthetic giant vector wireframe grid in background
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
    ctx.save();
    ctx.translate(width * 0.2, height * 0.2);
    ctx.rotate(time * 0.05);
    ctx.beginPath();
    const cubeSz = 120;
    for (let i = -2; i <= 2; i++) {
      ctx.moveTo(i * 40, -cubeSz);
      ctx.lineTo(i * 40, cubeSz);
      ctx.moveTo(-cubeSz, i * 40);
      ctx.lineTo(cubeSz, i * 40);
    }
    ctx.stroke();
    ctx.restore();
  } else if (type === 'cozy') {
    // Cozy Studio with bookshelves and bokeh circle particles
    const czGrad = ctx.createRadialGradient(width * 0.5, height * 0.3, 50, width * 0.5, height * 0.6, width * 0.7);
    czGrad.addColorStop(0, '#4a2516'); // Warm focus light (terracotta)
    czGrad.addColorStop(0.4, '#241009'); // Rich mahogany
    czGrad.addColorStop(1, '#0e0503'); // Dark espresso frame
    ctx.fillStyle = czGrad;
    ctx.fillRect(0, 0, width, height);

    // Warm cozy floating bokeh dust particles
    ctx.fillStyle = 'rgba(235, 175, 110, 0.12)';
    for (let i = 0; i < 8; i++) {
      const posX = ((Math.sin(time * 0.25 + i * 3) + 1) * 0.5) * width;
      const posY = ((Math.cos(time * 0.15 + i * 7) + 1) * 0.5) * height;
      const sizeRatio = Math.abs(Math.sin(time * 0.4 + i)) * 14 + 10;
      ctx.beginPath();
      ctx.arc(posX, posY, sizeRatio, 0, Math.PI * 2);
      ctx.fill();
    }

    // Shadowy silhouettes of studio microphones and lights on the periphery
    ctx.fillStyle = 'rgba(10, 5, 3, 0.35)';
    // Left side soft box outline
    ctx.fillRect(-10, height * 0.1, width * 0.08, height * 0.5);
    // Soft glow outline
    ctx.strokeStyle = 'rgba(224, 137, 72, 0.1)';
    ctx.lineWidth = 4;
    ctx.strokeRect(-10, height * 0.1, width * 0.08, height * 0.5);
  } else if (type === 'custom' && customImageUrl) {
    // Custom background image loading must be drawn
    // If we have an image element cache, we draw it here
    const imgObj = new Image();
    imgObj.src = customImageUrl;
    if (imgObj.complete) {
      ctx.drawImage(imgObj, 0, 0, width, height);
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Loading background asset...', width / 2, height / 2);
    }
  }

  ctx.restore();
}

/**
 * Draws the high-fidelity webcam/green screen virtual presenter.
 * Includes shoulders, head, hair, headphones, breathing, blinking,
 * and a speaking mouth matched to audio amplitude levels.
 */
export function drawVirtualPresenter(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  chromaColorType: string,
  customChromaColor: string,
  audioLevel: number,
  time: number
) {
  ctx.save();

  // 1. Draw flat chroma background
  let chromaClr = '#00ff00'; // preset green
  if (chromaColorType === 'blue') chromaClr = '#0000ff';
  else if (chromaColorType === 'magenta') chromaClr = '#ff00ff';
  else if (chromaColorType === 'custom') chromaClr = customChromaColor || '#00ff00';

  ctx.fillStyle = chromaClr;
  ctx.fillRect(0, 0, width, height);

  // 2. Compute dynamic presenter movement (breathing & head sway)
  const breathing = Math.sin(time * 2.5) * 2.5; // Up-down travel
  const headSway = Math.cos(time * 1.5) * 3; // Left-right shift
  const speakingLipHeight = (audioLevel / 100) * 18 + Math.abs(Math.sin(time * 12)) * 3;

  const centerRefX = width * 0.5;
  const torsoY = height * 0.52 + breathing;

  // Let's draw some technical background grids inside the virtual scene representation to look immersive
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  ctx.strokeRect(width * 0.1, height * 0.1, width * 0.8, height * 0.8);

  // A. DRAW TORSO / SHOULDERS (Dark suit / jacket)
  ctx.fillStyle = '#1e293b'; // Sleek charcoal jacket
  ctx.beginPath();
  ctx.moveTo(centerRefX - 90, height);
  // Curve up to left shoulder
  ctx.quadraticCurveTo(centerRefX - 80, torsoY + 40, centerRefX - 45, torsoY + 40);
  // Curve into neck
  ctx.lineTo(centerRefX - 18, torsoY + 12);
  ctx.lineTo(centerRefX + 18, torsoY + 12);
  // Right shoulder
  ctx.lineTo(centerRefX + 45, torsoY + 40);
  ctx.quadraticCurveTo(centerRefX + 80, torsoY + 40, centerRefX + 90, height);
  ctx.closePath();
  ctx.fill();

  // Subtle interior details (suit lapels)
  ctx.fillStyle = '#0f172a'; // Deep slate tie/collar
  ctx.beginPath();
  ctx.moveTo(centerRefX - 18, torsoY + 12);
  ctx.lineTo(centerRefX, torsoY + 35);
  ctx.lineTo(centerRefX + 18, torsoY + 12);
  ctx.fill();

  // Skin neck
  ctx.fillStyle = '#ffbe93'; // Warm peach skin
  ctx.beginPath();
  ctx.moveTo(centerRefX - 14, torsoY - 5);
  ctx.lineTo(centerRefX - 14, torsoY + 14);
  ctx.lineTo(centerRefX + 14, torsoY + 14);
  ctx.lineTo(centerRefX + 14, torsoY - 5);
  ctx.closePath();
  ctx.fill();

  // B. DRAW HEAD & FACE (bobs left-right and up-down)
  const headX = centerRefX + headSway;
  const headY = height * 0.44 + breathing;

  // Head base oval
  ctx.fillStyle = '#ffd1b3'; // Highlighted peach skin
  ctx.beginPath();
  ctx.arc(headX, headY, 32, 0, Math.PI * 2);
  ctx.fill();

  // Ears
  ctx.fillStyle = '#ffbe93';
  ctx.beginPath();
  ctx.arc(headX - 32, headY, 6, 0, Math.PI * 2); // Left ear
  ctx.arc(headX + 32, headY, 6, 0, Math.PI * 2); // Right ear
  ctx.fill();

  // Modern chic hair (brushed forward crop)
  ctx.fillStyle = '#2d1a12'; // Rich dark brown
  ctx.beginPath();
  // Hair line top arc
  ctx.arc(headX, headY - 14, 34, Math.PI, Math.PI * 2);
  ctx.lineTo(headX + 33, headY);
  ctx.quadraticCurveTo(headX + 22, headY - 8, headX + 18, headY - 14);
  ctx.quadraticCurveTo(headX - 5, headY - 10, headX - 25, headY - 14);
  ctx.lineTo(headX - 33, headY);
  ctx.closePath();
  ctx.fill();

  // C. EYES
  ctx.fillStyle = '#0f172a'; // Eye color
  const blinkState = Math.sin(time * 0.7) > 0.95; // Blinks naturally
  const eyeOffsetY = -5;
  const eyeRadiusX = 2;

  if (blinkState) {
    // Drawn closed
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(headX - 15, headY + eyeOffsetY);
    ctx.lineTo(headX - 9, headY + eyeOffsetY);
    ctx.moveTo(headX + 9, headY + eyeOffsetY);
    ctx.lineTo(headX + 15, headY + eyeOffsetY);
    ctx.stroke();
  } else {
    // Open eyes
    ctx.beginPath();
    ctx.arc(headX - 12, headY + eyeOffsetY, eyeRadiusX, 0, Math.PI * 2);
    ctx.arc(headX + 12, headY + eyeOffsetY, eyeRadiusX, 0, Math.PI * 2);
    ctx.fill();
    
    // Eyebrows
    ctx.strokeStyle = '#2d1a12';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(headX - 16, headY - 10);
    ctx.lineTo(headX - 8, headY - 9);
    ctx.moveTo(headX + 8, headY - 9);
    ctx.lineTo(headX + 16, headY - 10);
    ctx.stroke();
  }

  // Glasses (Sleek minimalist black frames)
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(headX - 18, headY - 10, 10, 8); // Left lens
  ctx.strokeRect(headX + 8, headY - 10, 10, 8); // Right lens
  // Bridge
  ctx.beginPath();
  ctx.moveTo(headX - 8, headY - 6);
  ctx.lineTo(headX + 8, headY - 6);
  ctx.stroke();

  // D. TALKING MOUTH (Synced lip sink)
  ctx.fillStyle = '#ba2b3c'; // Rosy red interior
  if (speakingLipHeight > 2.5) {
    ctx.beginPath();
    ctx.ellipse(headX, headY + 14, 6, Math.max(1.5, speakingLipHeight * 0.4), 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Smiling/Standard tiny ellipse
    ctx.beginPath();
    ctx.ellipse(headX, headY + 14, 4, 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // E. BROADCASTER HEADPHONES (Sleek side arc & neon cushions)
  ctx.strokeStyle = '#cbd5e1'; // Metal headband
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(headX, headY - 5, 34, Math.PI, 0); // Headband arc
  ctx.stroke();

  // Glowing Neon Blue earcups
  ctx.fillStyle = '#06b6d4'; // Cyan glowing cushion
  ctx.beginPath();
  ctx.roundRect(headX - 37, headY - 13, 7, 26, 3);
  ctx.roundRect(headX + 30, headY - 13, 7, 26, 3);
  ctx.fill();

  // Microphone boom arm extending to mouth
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(headX - 34, headY + 8);
  ctx.quadraticCurveTo(headX - 30, headY + 28, headX - 10, headY + 22);
  ctx.stroke();
  // Mic head
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(headX - 9, headY + 22, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // 3. Render dynamic green indicator grid so users can visualize pixel scanning
  ctx.strokeStyle = 'rgba(0, 255, 0, 0.15)';
  ctx.lineWidth = 1;
  const scannerY = (time * 125) % (height * 1.5);
  if (scannerY <= height) {
    ctx.beginPath();
    ctx.moveTo(0, scannerY);
    ctx.lineTo(width, scannerY);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Composites the camera/presenter pixels on top of the background image,
 * matching pixel-by-pixel for color clearance.
 */
export function applyChromaKey(
  sourceCtx: CanvasRenderingContext2D,
  bgCtx: CanvasRenderingContext2D,
  targetCtx: CanvasRenderingContext2D,
  width: number,
  height: number,
  config: ChromaConfig
) {
  if (width <= 0 || height <= 0) return;

  const srcImgData = sourceCtx.getImageData(0, 0, width, height);
  const bgImgData = bgCtx.getImageData(0, 0, width, height);
  
  // Create an output imageData canvas buffer
  const outImgData = targetCtx.createImageData(width, height);
  
  const dSrc = srcImgData.data;
  const dBg = bgImgData.data;
  const dOut = outImgData.data;
  const len = dSrc.length;

  // Determine chroma color key to lock on
  let keyR = 0, keyG = 255, keyB = 0;
  if (config.colorType === 'blue') {
    keyR = 0; keyG = 0; keyB = 255;
  } else if (config.colorType === 'magenta') {
    keyR = 255; keyG = 0; keyB = 255;
  } else if (config.colorType === 'custom') {
    const hex = config.customColor.replace('#', '');
    keyR = parseInt(hex.substring(0, 2), 16) || 0;
    keyG = parseInt(hex.substring(2, 4), 16) || 0;
    keyB = parseInt(hex.substring(4, 6), 16) || 0;
  }

  const tol = config.tolerance;
  const smooth = config.smoothing;

  for (let i = 0; i < len; i += 4) {
    const r = dSrc[i];
    const g = dSrc[i + 1];
    const b = dSrc[i + 2];
    const a = dSrc[i + 3];

    // Compute pixel distance to target chroma color using perception-weighted distance formula
    const dr = r - keyR;
    const dg = g - keyG;
    const db = b - keyB;
    // Perceptually weighted Euclidean distance is highly accurate for canvas chroma keyers
    const dist = Math.sqrt(0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db);

    if (!config.enabled) {
      // Just keep full source video
      dOut[i] = r;
      dOut[i + 1] = g;
      dOut[i + 2] = b;
      dOut[i + 3] = a;
    } else {
      if (dist < tol) {
        // Completely transparency-cleared: use background pixels directly
        dOut[i] = dBg[i];
        dOut[i + 1] = dBg[i + 1];
        dOut[i + 2] = dBg[i + 2];
        dOut[i + 3] = dBg[i + 3];
      } else if (dist < tol + smooth) {
        // Linear blending at edge interface transitions for alpha anti-aliasing
        const t = (dist - tol) / smooth; 
        const invT = 1 - t;
        
        // Spill reduction calculations (desaturating green or blue close components)
        let redOut = r;
        let greenOut = g;
        let blueOut = b;
        
        if (config.colorType === 'green') {
          // Desaturate excess raw green components
          greenOut = Math.min(g, (r + b) * 0.5);
        } else if (config.colorType === 'blue') {
          // Desaturate excess raw blue components
          blueOut = Math.min(b, (r + g) * 0.5);
        }

        dOut[i] = Math.max(0, Math.min(255, Math.ceil(t * redOut + invT * dBg[i])));
        dOut[i + 1] = Math.max(0, Math.min(255, Math.ceil(t * greenOut + invT * dBg[i + 1])));
        dOut[i + 2] = Math.max(0, Math.min(255, Math.ceil(t * blueOut + invT * dBg[i + 2])));
        dOut[i + 3] = Math.max(0, Math.min(255, Math.ceil(t * a + invT * dBg[i + 3])));
      } else {
        // Keep pure foreground source
        dOut[i] = r;
        dOut[i + 1] = g;
        dOut[i + 2] = b;
        dOut[i + 3] = a;
      }
    }
  }

  targetCtx.putImageData(outImgData, 0, 0);
}

/**
 * Renders the chosen branded dynamic logo overlay on the encoded target stream.
 */
export function drawLogo(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  config: LogoConfig
) {
  if (!config.enabled) return;

  ctx.save();
  ctx.globalAlpha = config.opacity;

  const sizePx = width * (config.size / 100);
  const logoHeight = sizePx * 0.55; // Aspect aspect ratio index 
  const p = config.padding;

  // Compute position coordinates
  let x = p;
  let y = p;

  if (config.position === 'top-right') {
    x = width - sizePx - p;
  } else if (config.position === 'bottom-left') {
    y = height - logoHeight - p - 18; // Leave room for ticker
  } else if (config.position === 'bottom-right') {
    x = width - sizePx - p;
    y = height - logoHeight - p - 18; // Leave room for ticker
  }

  const presetName = config.preset;

  if (presetName === 'news') {
    // Elegant standard News badge
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 6;

    // Red backing bar
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(x, y, sizePx * 0.65, logoHeight);

    // Dynamic inner accent stripe
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + sizePx * 0.65, y, sizePx * 0.35, logoHeight);

    // Dark outline frame
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, sizePx, logoHeight);

    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${Math.ceil(logoHeight * 0.65)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NEWS', x + sizePx * 0.32, y + logoHeight * 0.52);

    ctx.fillStyle = '#0f172a';
    ctx.font = `bold ${Math.ceil(logoHeight * 0.5)}px sans-serif`;
    ctx.fillText('LIVE', x + sizePx * 0.82, y + logoHeight * 0.52);

  } else if (presetName === 'gaming') {
    // Gamer retro neon violet tag
    ctx.shadowColor = '#d946ef';
    ctx.shadowBlur = 8;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#d946ef';

    ctx.beginPath();
    ctx.moveTo(x + 10, y);
    ctx.lineTo(x + sizePx, y);
    ctx.lineTo(x + sizePx - 10, y + logoHeight);
    ctx.lineTo(x, y + logoHeight);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Small gaming cross pad visual
    ctx.fillStyle = '#06b6d4';
    ctx.fillRect(x + 14, y + logoHeight * 0.35, 12, 4);
    ctx.fillRect(x + 18, y + logoHeight * 0.15, 4, 12);

    ctx.fillStyle = '#fdfdfd';
    ctx.font = `italic 900 ${Math.ceil(logoHeight * 0.45)}px monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('GAME-ON', x + 34, y + logoHeight * 0.5);

  } else if (presetName === 'sports') {
    // Hyper sporty dynamic shield
    const grad = ctx.createLinearGradient(x, y, x + sizePx, y + logoHeight);
    grad.addColorStop(0, '#eab308'); // gold
    grad.addColorStop(1, '#ca8a04');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + sizePx - 8, y);
    ctx.lineTo(x + sizePx, y + logoHeight * 0.7);
    ctx.lineTo(x + sizePx * 0.5, y + logoHeight);
    ctx.lineTo(x, y + logoHeight * 0.7);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#000000';
    ctx.font = `900 italic ${Math.ceil(logoHeight * 0.45)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CHAMP', x + sizePx * 0.5, y + logoHeight * 0.45);

  } else if (presetName === 'cooking') {
    // Cozy warm orange foodie logotype
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(x + logoHeight * 0.5, y + logoHeight * 0.5, logoHeight * 0.45, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🍳', x + logoHeight * 0.5, y + logoHeight * 0.48);

    ctx.fillStyle = '#ea580c';
    ctx.font = `bold ${Math.ceil(logoHeight * 0.45)}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText('Studio', x + logoHeight * 1.15, y + logoHeight * 0.6);

  } else if (presetName === 'custom' && config.customUrl) {
    // Try to draw custom image source URL
    const logoImg = new Image();
    logoImg.src = config.customUrl;
    if (logoImg.complete) {
      ctx.drawImage(logoImg, x, y, sizePx, logoHeight);
    } else {
      // Fallback nice placeholder badge during load
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(x, y, sizePx, logoHeight);
      ctx.fillStyle = '#ffffff';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('[Logo Loading]', x + sizePx/2, y + logoHeight/2);
    }
  } else {
    // Simple modern tech badge
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.roundRect(x, y, sizePx, logoHeight, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(x + 12, y + logoHeight * 0.5, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.ceil(logoHeight * 0.45)}px monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('STUDIO', x + 22, y + logoHeight * 0.5);
  }

  ctx.restore();
}

/**
 * Draws the ticker banner that moves horizontally along the bottom of the stream.
 */
export function drawTicker(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  config: TickerConfig,
  currentOffset: number
) {
  if (!config.enabled) return;

  ctx.save();

  const tickerHeight = Math.ceil(height * 0.08);
  const tickerY = height - tickerHeight;

  // Background box
  ctx.fillStyle = config.bgColor || '#ff0000';
  ctx.fillRect(0, tickerY, width, tickerHeight);

  // Decorative "TICKER NEWS" label tag locked on the left margin
  const tagWidth = width * 0.18;
  ctx.fillStyle = '#1e293b'; // slate dark badge
  ctx.fillRect(0, tickerY, tagWidth, tickerHeight);

  ctx.fillStyle = '#22c55e'; // neon green bullet dot
  ctx.beginPath();
  ctx.arc(10, tickerY + tickerHeight * 0.5, 3.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.ceil(tickerHeight * 0.45)}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('TICKER', 18, tickerY + tickerHeight * 0.52);

  // Moving text panel clipped to visible width
  ctx.save();
  ctx.beginPath();
  ctx.rect(tagWidth + 4, tickerY, width - tagWidth - 4, tickerHeight);
  ctx.clip();

  // Scroll text contents
  ctx.fillStyle = config.textColor || '#ffffff';
  ctx.font = `${Math.ceil(tickerHeight * 0.42)}px sans-serif`;
  ctx.textBaseline = 'middle';

  // Measure text to wrap offset properly
  const txt = `${config.text}    •    STREAMING LIVE VIA ${config.fontSize}kbps ENGINE    •    PROTOCRAFT PIPELINE ACTIVE    •        `;
  const textW = ctx.measureText(txt).width;

  // Render text thrice in chains to make a flawless continuous loop
  const cycleOffset = currentOffset % textW;
  
  ctx.fillText(txt, tagWidth + 10 - cycleOffset, tickerY + tickerHeight * 0.52);
  ctx.fillText(txt, tagWidth + 10 - cycleOffset + textW, tickerY + tickerHeight * 0.52);
  ctx.fillText(txt, tagWidth + 10 - cycleOffset + textW * 2, tickerY + tickerHeight * 0.52);

  ctx.restore();
  ctx.restore();
}
