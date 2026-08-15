import * as THREE from 'three';
import { AIRSTRIP, SCENERY, TERRAIN } from '../config';
import { hash1D } from './noise';
import { distanceToAirstrip, terrainHeight, zoneAt, type ZoneId } from './Terrain';

const ZONE_COLOR: Record<ZoneId, number> = {
  valley: 0x4a9450,
  coast: 0xd9c98f,
  canyon: 0xaa6a38,
  mountains: 0x8fa3ac,
};

const SNOW_COLOR = new THREE.Color(0xf4faff);
const SAND_COLOR = new THREE.Color(0xe8d9a0);
const SNOW_LINE = 150;
const SNOW_BLEND = 55;

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t));
}

function colorForVertex(out: THREE.Color, x: number, z: number, y: number): THREE.Color {
  const zone = zoneAt(x, z);
  out.setHex(ZONE_COLOR[zone]);
  if (zone === 'mountains' && y > SNOW_LINE) {
    out.lerp(SNOW_COLOR, clamp01((y - SNOW_LINE) / SNOW_BLEND));
  }
  if (y < TERRAIN.WATER_LEVEL + 6) {
    out.lerp(SAND_COLOR, clamp01(1 - (y - TERRAIN.WATER_LEVEL) / 6) * 0.85);
  }
  return out;
}

/** Malha única do terreno (vértices deslocados por `terrainHeight`, coloridos por vértice) + água + cenário instanciado. Tudo construído uma vez — sem realocação por frame. */
export class TerrainMesh {
  readonly group: THREE.Group;
  private readonly terrainMaterial: THREE.MeshStandardMaterial;
  private readonly waterMaterial: THREE.MeshStandardMaterial;

  constructor() {
    this.group = new THREE.Group();

    const geometry = new THREE.PlaneGeometry(
      TERRAIN.SIZE,
      TERRAIN.SIZE,
      TERRAIN.SEGMENTS,
      TERRAIN.SEGMENTS,
    );
    geometry.rotateX(-Math.PI / 2);

    const position = geometry.attributes.position;
    if (!position) throw new Error('Geometria do terreno sem atributo de posição');
    const colors = new Float32Array(position.count * 3);
    const tmpColor = new THREE.Color();

    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const y = terrainHeight(x, z);
      position.setY(i, y);
      colorForVertex(tmpColor, x, z, y);
      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    position.needsUpdate = true;
    geometry.computeVertexNormals();

    this.terrainMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    const terrain = new THREE.Mesh(geometry, this.terrainMaterial);
    terrain.receiveShadow = true;
    this.group.add(terrain);

    const waterGeometry = new THREE.PlaneGeometry(TERRAIN.SIZE, TERRAIN.SIZE);
    waterGeometry.rotateX(-Math.PI / 2);
    this.waterMaterial = new THREE.MeshStandardMaterial({
      color: 0x2f7bb0,
      transparent: true,
      opacity: 0.75,
      roughness: 0.3,
      metalness: 0.1,
    });
    const water = new THREE.Mesh(waterGeometry, this.waterMaterial);
    water.position.y = TERRAIN.WATER_LEVEL;
    this.group.add(water);

    this.group.add(this.buildAirstrip());
    this.group.add(this.buildTrees());
    this.group.add(this.buildRocks());
  }

  private buildAirstrip(): THREE.Group {
    const group = new THREE.Group();
    const surfaceGeometry = new THREE.PlaneGeometry(AIRSTRIP.WIDTH, AIRSTRIP.LENGTH);
    surfaceGeometry.rotateX(-Math.PI / 2);
    const surfaceMaterial = new THREE.MeshStandardMaterial({ color: 0x3a3a42, roughness: 0.9 });
    const surface = new THREE.Mesh(surfaceGeometry, surfaceMaterial);
    surface.position.set(AIRSTRIP.CENTER_X, AIRSTRIP.ELEVATION + 0.03, AIRSTRIP.CENTER_Z);
    surface.receiveShadow = true;
    group.add(surface);

    const stripeGeometry = new THREE.PlaneGeometry(1.2, 12);
    stripeGeometry.rotateX(-Math.PI / 2);
    const stripeMaterial = new THREE.MeshStandardMaterial({ color: 0xf5f5f0, emissive: 0xf5f5f0, emissiveIntensity: 0.15 });
    const stripeCount = 8;
    for (let i = 0; i < stripeCount; i++) {
      const stripe = new THREE.Mesh(stripeGeometry, stripeMaterial);
      const t = i / (stripeCount - 1) - 0.5;
      stripe.position.set(
        AIRSTRIP.CENTER_X,
        AIRSTRIP.ELEVATION + 0.05,
        AIRSTRIP.CENTER_Z + t * (AIRSTRIP.LENGTH - 24),
      );
      group.add(stripe);
    }
    return group;
  }

  private buildTrees(): THREE.InstancedMesh {
    const trunkHeight = 2.4;
    const canopyHeight = 3.6;
    const geometry = mergeTree(trunkHeight, canopyHeight);
    const material = new THREE.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 0.9 });
    const mesh = new THREE.InstancedMesh(geometry, material, SCENERY.TREE_COUNT);
    mesh.castShadow = true;

    const matrix = new THREE.Matrix4();
    let placed = 0;
    for (let i = 0; placed < SCENERY.TREE_COUNT && i < SCENERY.TREE_COUNT * 4; i++) {
      const angle = hash1D(i * 3.11) * Math.PI * 2;
      const radius =
        SCENERY.MIN_DISTANCE_FROM_ORIGIN + hash1D(i * 7.77 + 1) * (SCENERY.SCATTER_RADIUS - SCENERY.MIN_DISTANCE_FROM_ORIGIN);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = terrainHeight(x, z);
      const zone = zoneAt(x, z);
      if (zone === 'coast' || y < TERRAIN.WATER_LEVEL + 4) continue;
      if (distanceToAirstrip(x, z) < AIRSTRIP.BLEND_MARGIN) continue;

      const scale = 0.7 + hash1D(i * 5.13 + 2) * 0.7;
      matrix.compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash1D(i * 9.31) * Math.PI * 2),
        new THREE.Vector3(scale, scale, scale),
      );
      mesh.setMatrixAt(placed, matrix);
      placed++;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  private buildRocks(): THREE.InstancedMesh {
    const geometry = new THREE.DodecahedronGeometry(1, 0);
    const material = new THREE.MeshStandardMaterial({ color: 0x76726c, roughness: 1 });
    const mesh = new THREE.InstancedMesh(geometry, material, SCENERY.ROCK_COUNT);
    mesh.castShadow = true;

    const matrix = new THREE.Matrix4();
    let placed = 0;
    for (let i = 0; placed < SCENERY.ROCK_COUNT && i < SCENERY.ROCK_COUNT * 4; i++) {
      const angle = hash1D(i * 2.03 + 100) * Math.PI * 2;
      const radius =
        SCENERY.MIN_DISTANCE_FROM_ORIGIN + hash1D(i * 6.29 + 101) * (SCENERY.SCATTER_RADIUS - SCENERY.MIN_DISTANCE_FROM_ORIGIN);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = terrainHeight(x, z);
      if (y < TERRAIN.WATER_LEVEL + 2) continue;
      if (distanceToAirstrip(x, z) < AIRSTRIP.BLEND_MARGIN) continue;

      const scale = 0.6 + hash1D(i * 4.71 + 102) * 1.8;
      matrix.compose(
        new THREE.Vector3(x, y + scale * 0.4, z),
        new THREE.Quaternion().setFromEuler(
          new THREE.Euler(hash1D(i * 1.9) * Math.PI, hash1D(i * 3.7) * Math.PI, hash1D(i * 5.5) * Math.PI),
        ),
        new THREE.Vector3(scale, scale, scale),
      );
      mesh.setMatrixAt(placed, matrix);
      placed++;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  /** Muta cores já existentes (névoa/água) — nunca recria a malha do terreno. */
  applyTint(waterColor: number): void {
    this.waterMaterial.color.setHex(waterColor);
  }
}

/** Uma única geometria fundida tronco+copa (cone) por árvore, pra caber num InstancedMesh. */
function mergeTree(trunkHeight: number, canopyHeight: number): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.18, 0.24, trunkHeight, 6);
  trunk.translate(0, trunkHeight / 2, 0);
  const canopy = new THREE.ConeGeometry(1.3, canopyHeight, 8);
  canopy.translate(0, trunkHeight + canopyHeight / 2 - 0.3, 0);

  const trunkPos = trunk.attributes.position;
  const canopyPos = canopy.attributes.position;
  if (!trunkPos || !canopyPos) throw new Error('Geometria de árvore incompleta');

  const merged = new THREE.BufferGeometry();
  const positions = new Float32Array(trunkPos.count * 3 + canopyPos.count * 3);
  positions.set(trunkPos.array as Float32Array, 0);
  positions.set(canopyPos.array as Float32Array, trunkPos.count * 3);
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const trunkIndex = trunk.getIndex();
  const canopyIndex = canopy.getIndex();
  if (trunkIndex && canopyIndex) {
    const indices = new Uint32Array(trunkIndex.count + canopyIndex.count);
    indices.set(trunkIndex.array as Uint32Array, 0);
    for (let i = 0; i < canopyIndex.count; i++) {
      indices[trunkIndex.count + i] = (canopyIndex.array as Uint32Array)[i]! + trunkPos.count;
    }
    merged.setIndex(new THREE.BufferAttribute(indices, 1));
  }
  merged.computeVertexNormals();
  return merged;
}
