export type AABB = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

export function intersects(a: AABB, b: AABB): boolean {
  return (
    a.minX <= b.maxX &&
    a.maxX >= b.minX &&
    a.minY <= b.maxY &&
    a.maxY >= b.minY &&
    a.minZ <= b.maxZ &&
    a.maxZ >= b.minZ
  );
}

export type CollisionOutcome = 'none' | 'scrape' | 'fatal';

/**
 * Uma sobreposição durante a troca de pista é um raspão (perdoável); fora
 * disso, qualquer sobreposição é colisão frontal (fatal). Ver item 4.5 do
 * spec: "colisão levemente perdoadora sempre parece mais justa ao jogador".
 */
export function resolveCollision(
  playerBox: AABB,
  obstacleBoxes: readonly AABB[],
  isChangingLane: boolean,
): CollisionOutcome {
  const hit = obstacleBoxes.some((box) => intersects(playerBox, box));
  if (!hit) return 'none';
  return isChangingLane ? 'scrape' : 'fatal';
}
