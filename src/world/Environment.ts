import * as THREE from 'three';
import { FOG } from '../config';

/** Cena, névoa e iluminação. O chão/pistas vivem no ChunkManager (pooling). */
export class Environment {
  readonly scene: THREE.Scene;

  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(FOG.COLOR);
    this.scene.fog = new THREE.FogExp2(FOG.COLOR, FOG.DENSITY);

    this.buildLights();
  }

  private buildLights(): void {
    const directional = new THREE.DirectionalLight(0xffa860, 1.4);
    directional.position.set(-4, 8, -6);
    directional.castShadow = true;
    directional.shadow.mapSize.set(1024, 1024);
    directional.shadow.camera.near = 1;
    directional.shadow.camera.far = 30;
    directional.shadow.camera.left = -10;
    directional.shadow.camera.right = 10;
    directional.shadow.camera.top = 10;
    directional.shadow.camera.bottom = -10;
    this.scene.add(directional);

    const ambient = new THREE.AmbientLight(0x4060ff, 0.6);
    this.scene.add(ambient);
  }
}
