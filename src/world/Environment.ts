import * as THREE from 'three';
import { FOG } from '../config';
import { BIOME_PRESETS, type BiomePreset } from './biomes';

/** Cena, névoa e iluminação. O chão/pistas vivem no ChunkManager (pooling). */
export class Environment {
  readonly scene: THREE.Scene;
  private readonly directional: THREE.DirectionalLight;
  private readonly ambient: THREE.AmbientLight;
  private readonly hemisphere: THREE.HemisphereLight;
  private readonly fog: THREE.FogExp2;

  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(FOG.COLOR);
    this.fog = new THREE.FogExp2(FOG.COLOR, FOG.DENSITY);
    this.scene.fog = this.fog;

    this.directional = new THREE.DirectionalLight(0xffa860, 1.4);
    this.directional.position.set(-4, 8, -6);
    this.directional.castShadow = true;
    this.directional.shadow.mapSize.set(1024, 1024);
    this.directional.shadow.camera.near = 1;
    this.directional.shadow.camera.far = 30;
    this.directional.shadow.camera.left = -10;
    this.directional.shadow.camera.right = 10;
    this.directional.shadow.camera.top = 10;
    this.directional.shadow.camera.bottom = -10;
    this.scene.add(this.directional);

    this.ambient = new THREE.AmbientLight(0x4060ff, 0.6);
    this.scene.add(this.ambient);

    this.hemisphere = new THREE.HemisphereLight(0x4a2f6e, 0x140a22, 0.5);
    this.scene.add(this.hemisphere);

    this.applyBiome(BIOME_PRESETS.canyon);
  }

  /** Muta as cores já existentes de névoa/luzes — nunca recria objetos. */
  applyBiome(preset: BiomePreset): void {
    (this.scene.background as THREE.Color).setHex(preset.fogColor);
    this.fog.color.setHex(preset.fogColor);
    this.ambient.color.setHex(preset.ambientColor);
    this.directional.color.setHex(preset.directionalColor);
    this.hemisphere.color.setHex(preset.hemisphereSkyColor);
    this.hemisphere.groundColor.setHex(preset.hemisphereGroundColor);
  }
}
