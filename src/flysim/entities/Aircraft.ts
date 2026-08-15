import * as THREE from 'three';
import { AIRCRAFT, FLIGHT } from '../config';
import {
  integrateAirspeed,
  stallFactor,
  stallPitchBias,
  stallSinkRate,
  turnRateFromRoll,
  wrapAngle,
  type FlightConfig,
} from '../systems/FlightPhysics';

export type FlightAxes = {
  pitch: number; // -1..1, positivo = nariz pra cima
  roll: number; // -1..1, positivo = rola pra direita
  yaw: number; // -1..1, positivo = guina pra direita (leme)
};

const FLIGHT_CONFIG: FlightConfig = {
  throttleAccel: FLIGHT.THROTTLE_ACCEL,
  dragCoefficient: FLIGHT.DRAG_COEFFICIENT,
  gravity: FLIGHT.GRAVITY,
  minSpeed: FLIGHT.MIN_SPEED,
  maxSpeed: FLIGHT.MAX_SPEED,
  stallSpeed: FLIGHT.STALL_SPEED,
};

const UP_AXIS = new THREE.Vector3(0, 1, 0);
const RIGHT_AXIS = new THREE.Vector3(1, 0, 0);
const FORWARD_AXIS_LOCAL = new THREE.Vector3(0, 0, 1);
const FUSELAGE_COLOR = 0xf5f6f8;
const STRIPE_COLOR = 0x2f6bff;
const ACCENT_COLOR = 0xffa83d;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Avião silhueta genérica de monomotor asa-alta — 100% geometria primitiva,
 * pintura própria (branco + azul + laranja), sem referência a marca real.
 */
export class Aircraft {
  readonly group: THREE.Group;

  private readonly propellerPivot: THREE.Group;
  private readonly wheelPivots: THREE.Group[] = [];

  private pitch = 0;
  private roll = 0;
  private yaw = 0;
  private airspeed = 0;
  private throttle = AIRCRAFT.START_THROTTLE;
  private verticalSpeed = 0;

  private readonly forward = new THREE.Vector3(0, 0, -1);
  private readonly right = new THREE.Vector3(1, 0, 0);
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly qYaw = new THREE.Quaternion();
  private readonly qPitch = new THREE.Quaternion();
  private readonly qRoll = new THREE.Quaternion();

  constructor() {
    this.group = new THREE.Group();

    const fuselageMaterial = new THREE.MeshStandardMaterial({ color: FUSELAGE_COLOR, roughness: 0.4, metalness: 0.15 });
    const stripeMaterial = new THREE.MeshStandardMaterial({ color: STRIPE_COLOR, roughness: 0.4 });
    const accentMaterial = new THREE.MeshStandardMaterial({ color: ACCENT_COLOR, roughness: 0.5 });
    const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.6 });
    const glassMaterial = new THREE.MeshStandardMaterial({
      color: 0x9fd8ff,
      transparent: true,
      opacity: 0.55,
      roughness: 0.1,
      metalness: 0.3,
    });

    const fuselageGeometry = new THREE.CylinderGeometry(0.62, 0.52, 5.6, 12);
    fuselageGeometry.rotateX(Math.PI / 2);
    const fuselage = new THREE.Mesh(fuselageGeometry, fuselageMaterial);
    fuselage.castShadow = true;
    this.group.add(fuselage);

    const stripeGeometry = new THREE.CylinderGeometry(0.64, 0.64, 0.6, 12, 1, true);
    stripeGeometry.rotateX(Math.PI / 2);
    const stripe = new THREE.Mesh(stripeGeometry, stripeMaterial);
    stripe.position.z = 0.2;
    this.group.add(stripe);

    const noseGeometry = new THREE.ConeGeometry(0.62, 1.1, 12);
    noseGeometry.rotateX(-Math.PI / 2);
    const nose = new THREE.Mesh(noseGeometry, darkMaterial);
    nose.position.z = -3.35;
    nose.castShadow = true;
    this.group.add(nose);

    const tailConeGeometry = new THREE.ConeGeometry(0.52, 1.0, 12);
    tailConeGeometry.rotateX(Math.PI / 2);
    const tailCone = new THREE.Mesh(tailConeGeometry, fuselageMaterial);
    tailCone.position.z = 3.3;
    this.group.add(tailCone);

    const canopyGeometry = new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const canopy = new THREE.Mesh(canopyGeometry, glassMaterial);
    canopy.position.set(0, 0.55, -0.7);
    this.group.add(canopy);

    const wingGeometry = new THREE.BoxGeometry(8.8, 0.16, 1.35);
    const wing = new THREE.Mesh(wingGeometry, fuselageMaterial);
    wing.position.y = 0.95;
    wing.castShadow = true;
    this.group.add(wing);

    const wingTipGeometry = new THREE.BoxGeometry(0.7, 0.2, 1.4);
    for (const side of [-1, 1] as const) {
      const tip = new THREE.Mesh(wingTipGeometry, accentMaterial);
      tip.position.set(side * 4.4, 0.95, 0);
      this.group.add(tip);
    }

    const strutGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.95, 6);
    for (const side of [-1, 1] as const) {
      const strut = new THREE.Mesh(strutGeometry, darkMaterial);
      strut.position.set(side * 1.3, 0.45, 0.1);
      strut.rotation.z = side * 0.35;
      this.group.add(strut);
    }

    const stabilizerGeometry = new THREE.BoxGeometry(2.9, 0.12, 0.75);
    const stabilizer = new THREE.Mesh(stabilizerGeometry, fuselageMaterial);
    stabilizer.position.set(0, 0.05, 3.05);
    this.group.add(stabilizer);

    const finGeometry = new THREE.BoxGeometry(0.12, 1.15, 0.95);
    const fin = new THREE.Mesh(finGeometry, stripeMaterial);
    fin.position.set(0, 0.65, 3.25);
    fin.castShadow = true;
    this.group.add(fin);

    this.propellerPivot = new THREE.Group();
    this.propellerPivot.position.z = -3.9;
    const hubGeometry = new THREE.CylinderGeometry(0.12, 0.12, 0.3, 8);
    hubGeometry.rotateX(Math.PI / 2);
    const hub = new THREE.Mesh(hubGeometry, darkMaterial);
    this.propellerPivot.add(hub);
    const bladeGeometry = new THREE.BoxGeometry(0.14, 1.6, 0.04);
    for (let i = 0; i < 2; i++) {
      const blade = new THREE.Mesh(bladeGeometry, darkMaterial);
      blade.rotation.z = (i * Math.PI) / 1;
      this.propellerPivot.add(blade);
    }
    this.group.add(this.propellerPivot);

    this.buildLandingGear(darkMaterial);
  }

  private buildLandingGear(material: THREE.Material): void {
    const wheelGeometry = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 12);
    const strutGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6);

    const positions: Array<[number, number]> = [
      [-1.1, -0.4],
      [1.1, -0.4],
    ];
    for (const [x, z] of positions) {
      const pivot = new THREE.Group();
      pivot.position.set(x, -0.5, z);
      const strut = new THREE.Mesh(strutGeometry, material);
      strut.position.y = -0.4;
      pivot.add(strut);
      const wheel = new THREE.Mesh(wheelGeometry, material);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.y = -0.85;
      pivot.add(wheel);
      this.group.add(pivot);
      this.wheelPivots.push(pivot);
    }

    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, -0.35, 3.1);
    const tailStrut = new THREE.Mesh(strutGeometry.clone(), material);
    tailStrut.scale.set(0.5, 0.4, 0.5);
    tailStrut.position.y = -0.18;
    tailPivot.add(tailStrut);
    const tailWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.1, 8), material);
    tailWheel.rotation.x = Math.PI / 2;
    tailWheel.position.y = -0.36;
    tailPivot.add(tailWheel);
    this.group.add(tailPivot);
    this.wheelPivots.push(tailPivot);
  }

  reset(x: number, y: number, z: number, yaw: number): void {
    this.pitch = 0;
    this.roll = 0;
    this.yaw = yaw;
    this.airspeed = FLIGHT.STALL_SPEED + 4;
    this.throttle = AIRCRAFT.START_THROTTLE;
    this.verticalSpeed = 0;
    this.group.position.set(x, y, z);
    this.updateOrientation();
  }

  setThrottleDelta(direction: -1 | 0 | 1, dt: number): void {
    this.throttle = clamp(this.throttle + direction * FLIGHT.THROTTLE_RATE * dt, 0, 1);
  }

  update(dt: number, axes: FlightAxes): void {
    this.roll += axes.roll * FLIGHT.ROLL_RATE * dt;
    if (Math.abs(axes.roll) < 0.02) {
      this.roll -= wrapAngle(this.roll) * Math.min(1, FLIGHT.ROLL_DAMPING * dt);
    }
    this.roll = wrapAngle(this.roll);

    const factor = stallFactor(this.airspeed, FLIGHT.STALL_SPEED);
    const bias = stallPitchBias(factor, FLIGHT.STALL_MAX_PITCH_BIAS);
    this.pitch = wrapAngle(this.pitch + axes.pitch * FLIGHT.PITCH_RATE * dt - bias * dt);

    const yawFromRoll = turnRateFromRoll(this.roll, FLIGHT.TURN_RATE_FROM_ROLL);
    this.yaw = wrapAngle(this.yaw + (axes.yaw * FLIGHT.YAW_RATE + yawFromRoll) * dt);

    this.airspeed = integrateAirspeed(this.airspeed, this.throttle, this.pitch, dt, FLIGHT_CONFIG);

    this.updateOrientation();

    const sink = stallSinkRate(factor, FLIGHT.STALL_MAX_SINK_SPEED);
    this.group.position.addScaledVector(this.forward, this.airspeed * dt);
    this.group.position.y -= sink * dt;
    this.verticalSpeed = this.forward.y * this.airspeed - sink;

    this.propellerPivot.rotation.z += (0.6 + this.throttle) * AIRCRAFT.PROPELLER_SPIN_SPEED * dt;
  }

  private updateOrientation(): void {
    this.qYaw.setFromAxisAngle(UP_AXIS, this.yaw);
    this.qPitch.setFromAxisAngle(RIGHT_AXIS, this.pitch);
    this.qRoll.setFromAxisAngle(FORWARD_AXIS_LOCAL, this.roll);
    this.group.quaternion.copy(this.qYaw).multiply(this.qPitch).multiply(this.qRoll);
    this.forward.set(0, 0, -1).applyQuaternion(this.group.quaternion);
    this.right.set(1, 0, 0).applyQuaternion(this.group.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(this.group.quaternion);
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  get forwardVector(): THREE.Vector3 {
    return this.forward;
  }

  get upVector(): THREE.Vector3 {
    return this.up;
  }

  get airspeedValue(): number {
    return this.airspeed;
  }

  get throttleValue(): number {
    return this.throttle;
  }

  get verticalSpeedValue(): number {
    return this.verticalSpeed;
  }

  get isStalling(): boolean {
    return this.airspeed < FLIGHT.STALL_SPEED;
  }

  get pitchAngle(): number {
    return this.pitch;
  }

  get rollAngle(): number {
    return this.roll;
  }

  get yawAngle(): number {
    return this.yaw;
  }

  /** Rumo em graus (0..360) só pro mostrador de bússola do HUD — não tem "norte" de verdade, é relativo à orientação inicial. */
  get headingDegrees(): number {
    const degrees = (-this.yaw * 180) / Math.PI;
    return ((degrees % 360) + 360) % 360;
  }
}
