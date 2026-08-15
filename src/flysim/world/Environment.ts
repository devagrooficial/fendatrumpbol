import * as THREE from 'three';
import { FOG } from '../config';

/** Cena, céu, névoa linear (mais natural em campo aberto que a exponencial do runner) e iluminação. */
export class Environment {
  readonly scene: THREE.Scene;
  readonly sun: THREE.DirectionalLight;

  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(FOG.COLOR);
    this.scene.fog = new THREE.Fog(FOG.COLOR, FOG.NEAR, FOG.FAR);

    this.sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
    this.sun.position.set(-260, 340, -180);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = 900;
    this.sun.shadow.camera.left = -200;
    this.sun.shadow.camera.right = 200;
    this.sun.shadow.camera.top = 200;
    this.sun.shadow.camera.bottom = -200;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    const hemisphere = new THREE.HemisphereLight(0xbfe0ff, 0x3f4a2a, 0.9);
    this.scene.add(hemisphere);

    const ambient = new THREE.AmbientLight(0xffffff, 0.25);
    this.scene.add(ambient);
  }

  /** Mantém o sol projetando sombra na direção do avião, sem recriar a luz. */
  followTarget(position: THREE.Vector3): void {
    this.sun.position.set(position.x - 260, position.y + 340, position.z - 180);
    this.sun.target.position.copy(position);
  }
}
