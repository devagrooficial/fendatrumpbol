// Ruído determinístico "value noise" via hash trigonométrico (idioma clássico
// de shader) — sem dependência nova, sem Math.random, mesmo resultado sempre
// para o mesmo (x, z).

function hash2(x: number, z: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Ruído por valor 2D em [0, 1], interpolado suavemente entre os 4 cantos da célula. */
export function valueNoise2D(x: number, z: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = smoothstep(x - x0);
  const tz = smoothstep(z - z0);

  const a = hash2(x0, z0);
  const b = hash2(x0 + 1, z0);
  const c = hash2(x0, z0 + 1);
  const d = hash2(x0 + 1, z0 + 1);

  const ab = a + (b - a) * tx;
  const cd = c + (d - c) * tx;
  return ab + (cd - ab) * tz;
}

/** Fractal Brownian motion: soma oitavas de ruído em frequência crescente/amplitude decrescente, retorna em [-1, 1]. */
export function fbm2D(x: number, z: number, octaves: number): number {
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let totalAmplitude = 0;
  for (let i = 0; i < octaves; i++) {
    sum += (valueNoise2D(x * frequency, z * frequency) * 2 - 1) * amplitude;
    totalAmplitude += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return totalAmplitude > 0 ? sum / totalAmplitude : 0;
}

/** Hash 1D determinístico em [0, 1] — usado pra espalhar cenário (árvores/rochas) sem Math.random. */
export function hash1D(seed: number): number {
  const n = Math.sin(seed * 12.9898) * 43758.5453123;
  return n - Math.floor(n);
}
