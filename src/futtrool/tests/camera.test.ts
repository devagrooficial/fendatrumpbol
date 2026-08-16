import { describe, expect, it } from 'vitest';
import { Camera } from '../render/camera';
import { FIELD } from '../core/constants';

describe('camera', () => {
  it('mapeia o centro do campo pro centro do viewport', () => {
    const camera = new Camera();
    camera.resize(1600, 900);
    const screen = camera.worldToScreen(FIELD.WIDTH / 2, FIELD.HEIGHT / 2);
    expect(screen.x).toBeCloseTo(800);
    expect(screen.y).toBeCloseTo(450);
  });

  it('usa "fit": campo inteiro sempre visível, escala = menor eixo', () => {
    const camera = new Camera();
    // Viewport mais largo que o campo (16:9 vs. 3:2) -> escala limitada pela altura.
    camera.resize(1600, 900);
    const expectedScale = 900 / FIELD.HEIGHT;
    expect(camera.worldScale).toBeCloseTo(expectedScale);
  });

  it('zoom escala proporcionalmente', () => {
    const camera = new Camera();
    camera.resize(1600, 900);
    const baseScale = camera.worldScale;
    camera.zoom = 2;
    camera.resize(1600, 900);
    expect(camera.worldScale).toBeCloseTo(baseScale * 2);
  });

  it('cantos opostos do campo ficam simétricos em torno do centro da tela', () => {
    const camera = new Camera();
    camera.resize(1200, 800);
    const topLeft = camera.worldToScreen(0, 0);
    const bottomRight = camera.worldToScreen(FIELD.WIDTH, FIELD.HEIGHT);
    expect(topLeft.x + bottomRight.x).toBeCloseTo(1200);
    expect(topLeft.y + bottomRight.y).toBeCloseTo(800);
  });
});

describe('camera.worldRectVisibleFraction (telemetria de anúncio, seção 10.4)', () => {
  it('1.0 quando o retângulo cabe inteiro no viewport', () => {
    const camera = new Camera();
    camera.resize(1600, 1200); // viewport bem maior que o campo -> tudo visível
    expect(camera.worldRectVisibleFraction(0, 0, 100, 100)).toBeCloseTo(1, 5);
  });

  it('0 quando o retângulo está totalmente fora do viewport', () => {
    const camera = new Camera();
    camera.resize(1200, 800);
    camera.zoom = 3;
    camera.centerX = FIELD.WIDTH / 2;
    camera.centerY = FIELD.HEIGHT / 2;
    // Um retângulo bem longe do centro, fora da área visível com esse zoom.
    expect(camera.worldRectVisibleFraction(-5000, -5000, 10, 10)).toBe(0);
  });

  it('fração parcial quando só parte do retângulo está visível', () => {
    const camera = new Camera();
    camera.resize(1200, 800);
    // Retângulo que cruza a borda esquerda do viewport pela metade.
    const halfWorldW = 1200 / camera.worldScale / 2;
    const fraction = camera.worldRectVisibleFraction(-halfWorldW, 0, halfWorldW * 2, 10);
    expect(fraction).toBeGreaterThan(0.3);
    expect(fraction).toBeLessThan(0.7);
  });
});
