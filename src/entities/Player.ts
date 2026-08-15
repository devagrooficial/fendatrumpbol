import * as THREE from 'three';
import { COLLISION, JUMP, PLAYER_JUICE, SLIDE, TRACK } from '../config';
import { Track, type Lane } from '../world/Track';
import type { AABB } from '../systems/Collision';
import { CHARACTER_PRESETS, DEFAULT_CHARACTER, type CharacterId } from './characters';

type VerticalState = 'grounded' | 'jumping' | 'falling';

const STANDING_HEIGHT = 1.6;
const HIP_Y = 0.8;
const LEG_LENGTH = 0.8;
const TORSO_HEIGHT = 0.6;
const SHOULDER_Y = HIP_Y + TORSO_HEIGHT - 0.05;
const ARM_LENGTH = 0.6;
const MAX_LIMB_SWING = Math.PI / 3.2;
const RUN_CYCLE_SPEED = 9;
const HITBOX_WIDTH = 0.9;
const HITBOX_DEPTH = 0.4;

function easeOutQuad(t: number): number {
  return t * (2 - t);
}

/** Cria um pivô no ombro/quadril com o membro deslocado para baixo, para girar como uma junta real. */
function buildLimb(color: number, length: number, radius: number, pivotY: number): {
  pivot: THREE.Group;
  mesh: THREE.Mesh;
} {
  const pivot = new THREE.Group();
  pivot.position.y = pivotY;
  const geometry = new THREE.CylinderGeometry(radius, radius * 0.85, length, 8);
  const material = new THREE.MeshStandardMaterial({ color });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = -length / 2;
  mesh.castShadow = true;
  pivot.add(mesh);
  return { pivot, mesh };
}

export class Player {
  readonly group: THREE.Group;

  private readonly bodyGroup: THREE.Group;
  private readonly leftLegPivot: THREE.Group;
  private readonly rightLegPivot: THREE.Group;
  private readonly leftArmPivot: THREE.Group;
  private readonly rightArmPivot: THREE.Group;
  private readonly headMaterial: THREE.MeshStandardMaterial;
  private readonly handMaterial: THREE.MeshStandardMaterial;
  private readonly hairMaterial: THREE.MeshStandardMaterial;
  private readonly shortHair: THREE.Mesh;
  private readonly longHair: THREE.Mesh;
  private character: CharacterId = DEFAULT_CHARACTER;

  private impactScale = 1;
  private impactTimer = 0;

  private lane: Lane = 0;
  private targetLane: Lane = 0;
  private queuedLaneDelta: -1 | 1 | null = null;
  private isChangingLane = false;
  private laneChangeElapsedMs = 0;
  private laneChangeFromX = 0;
  private laneChangeToX = 0;

  private vertical: VerticalState = 'grounded';
  private vy = 0;
  private currentY = 0;
  private readonly groundY = 0;

  private isSliding = false;
  private slideElapsed = 0;
  private pendingSlideOnLand = false;

  private runPhase = 0;
  private invulnerableTimer = 0;

  constructor(characterId: CharacterId = DEFAULT_CHARACTER) {
    this.group = new THREE.Group();
    this.bodyGroup = new THREE.Group();
    this.group.add(this.bodyGroup);

    const torsoGeometry = new THREE.BoxGeometry(0.62, TORSO_HEIGHT, 0.36);
    const torsoMaterial = new THREE.MeshStandardMaterial({ color: 0x22e5ff });
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.y = HIP_Y + TORSO_HEIGHT / 2;
    torso.castShadow = true;
    this.bodyGroup.add(torso);

    const headCenterY = HIP_Y + TORSO_HEIGHT + 0.22;
    const headGeometry = new THREE.BoxGeometry(0.36, 0.36, 0.36);
    this.headMaterial = new THREE.MeshStandardMaterial({ color: 0xffe08a });
    const head = new THREE.Mesh(headGeometry, this.headMaterial);
    head.position.y = headCenterY;
    head.castShadow = true;
    this.bodyGroup.add(head);

    // Duas malhas de cabelo pré-construídas (curto/longo); `setCharacter`
    // só alterna visibilidade e cor — nenhuma geometria nova em runtime.
    this.hairMaterial = new THREE.MeshStandardMaterial({ color: 0xffd23f });
    this.shortHair = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.4), this.hairMaterial);
    this.shortHair.position.y = headCenterY + 0.18 + 0.07;
    this.shortHair.castShadow = true;
    this.longHair = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.5, 0.14), this.hairMaterial);
    this.longHair.position.set(0, headCenterY - 0.05, 0.16);
    this.longHair.castShadow = true;
    this.bodyGroup.add(this.shortHair, this.longHair);

    const shoeMaterial = new THREE.MeshStandardMaterial({ color: 0x0d0d14 });
    const shoeGeometry = new THREE.BoxGeometry(0.17, 0.1, 0.26);

    const leftLeg = buildLimb(0x151a2e, LEG_LENGTH, 0.11, HIP_Y);
    leftLeg.pivot.position.x = -0.16;
    const rightLeg = buildLimb(0x151a2e, LEG_LENGTH, 0.11, HIP_Y);
    rightLeg.pivot.position.x = 0.16;
    this.leftLegPivot = leftLeg.pivot;
    this.rightLegPivot = rightLeg.pivot;
    this.bodyGroup.add(leftLeg.pivot, rightLeg.pivot);

    for (const legPivot of [leftLeg.pivot, rightLeg.pivot]) {
      const shoe = new THREE.Mesh(shoeGeometry, shoeMaterial);
      shoe.position.set(0, -LEG_LENGTH, 0.05);
      shoe.castShadow = true;
      legPivot.add(shoe);
    }

    this.handMaterial = new THREE.MeshStandardMaterial({ color: 0xffe08a });
    const handGeometry = new THREE.SphereGeometry(0.09, 8, 8);

    const leftArm = buildLimb(0x2f6bff, ARM_LENGTH, 0.08, SHOULDER_Y);
    leftArm.pivot.position.x = -0.42;
    const rightArm = buildLimb(0x2f6bff, ARM_LENGTH, 0.08, SHOULDER_Y);
    rightArm.pivot.position.x = 0.42;
    this.leftArmPivot = leftArm.pivot;
    this.rightArmPivot = rightArm.pivot;
    this.bodyGroup.add(leftArm.pivot, rightArm.pivot);

    for (const armPivot of [leftArm.pivot, rightArm.pivot]) {
      const hand = new THREE.Mesh(handGeometry, this.handMaterial);
      hand.position.y = -ARM_LENGTH;
      hand.castShadow = true;
      armPivot.add(hand);
    }

    this.group.position.x = Track.laneToX(this.lane);
    this.group.position.y = this.groundY;

    this.setCharacter(characterId);
  }

  /** Troca skin/cabelo sem recriar geometria — só recolore e alterna visibilidade. */
  setCharacter(id: CharacterId): void {
    const preset = CHARACTER_PRESETS[id];
    this.character = id;
    this.headMaterial.color.setHex(preset.skinColor);
    this.handMaterial.color.setHex(preset.skinColor);
    this.hairMaterial.color.setHex(preset.hairColor);
    this.shortHair.visible = preset.hairStyle === 'short';
    this.longHair.visible = preset.hairStyle === 'long';
  }

  get characterId(): CharacterId {
    return this.character;
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  get sliding(): boolean {
    return this.isSliding;
  }

  get airborne(): boolean {
    return this.vertical !== 'grounded';
  }

  get changingLane(): boolean {
    return this.isChangingLane;
  }

  get invulnerable(): boolean {
    return this.invulnerableTimer > 0;
  }

  /** Altura atual da hitbox, reduzida durante o deslize. */
  get hitboxHeight(): number {
    return this.isSliding ? STANDING_HEIGHT * SLIDE.HITBOX_HEIGHT_SCALE : STANDING_HEIGHT;
  }

  /** Caixa de colisão em coordenadas de mundo, ~15% menor que a malha visual. */
  getWorldAABB(): AABB {
    const shrink = 1 - COLLISION.PLAYER_HITBOX_SHRINK;
    const height = this.hitboxHeight * shrink;
    const halfWidth = (HITBOX_WIDTH * shrink) / 2;
    const halfDepth = (HITBOX_DEPTH * shrink) / 2;
    const x = this.group.position.x;
    const y = this.group.position.y;
    const z = this.group.position.z;
    return {
      minX: x - halfWidth,
      maxX: x + halfWidth,
      minY: y,
      maxY: y + height,
      minZ: z - halfDepth,
      maxZ: z + halfDepth,
    };
  }

  /** Raspão ao trocar de pista: empurra de volta para a pista anterior e concede invulnerabilidade breve. */
  applySideScrape(): void {
    if (this.isChangingLane) {
      this.queuedLaneDelta = null;
      this.beginLaneChange(this.lane);
    }
    this.grantInvulnerability(COLLISION.SIDE_SCRAPE_INVULN_S);
  }

  /** Concede invulnerabilidade por N segundos — usado pelo raspão e pelo escudo/impulso. */
  grantInvulnerability(seconds: number): void {
    this.invulnerableTimer = Math.max(this.invulnerableTimer, seconds);
  }

  requestLaneChange(direction: -1 | 1): void {
    const currentTarget = this.isChangingLane ? this.targetLane : this.lane;
    const desired = Track.clampLane(currentTarget + direction);
    if (desired === currentTarget) return;

    if (this.isChangingLane) {
      this.queuedLaneDelta = direction;
    } else {
      this.beginLaneChange(desired);
    }
  }

  /** Retorna se o pulo realmente aconteceu (para o chamador decidir se toca o som). */
  jump(): boolean {
    if (this.vertical !== 'grounded' || this.isSliding) return false;
    this.vertical = 'jumping';
    this.vy = JUMP.INITIAL_VY;
    this.triggerImpact(PLAYER_JUICE.TAKEOFF_STRETCH_SCALE);
    return true;
  }

  /** Retorna se o deslize realmente aconteceu (para o chamador decidir se toca o som). */
  slide(): boolean {
    if (this.isSliding) return false;

    if (this.vertical !== 'grounded') {
      this.vy = SLIDE.CANCEL_FALL_VY;
      this.vertical = 'falling';
      this.pendingSlideOnLand = true;
      return true;
    }
    this.startSlide();
    return true;
  }

  update(dt: number): void {
    this.updateLaneChange(dt);
    this.updateVertical(dt);
    this.updateSlide(dt);
    this.updateAnimation(dt);
    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer = Math.max(0, this.invulnerableTimer - dt);
    }
  }

  /** Reinício limpo: reaproveita a malha, apenas zera todo o estado transiente. */
  reset(): void {
    this.lane = 0;
    this.targetLane = 0;
    this.queuedLaneDelta = null;
    this.isChangingLane = false;
    this.laneChangeElapsedMs = 0;

    this.vertical = 'grounded';
    this.vy = 0;
    this.currentY = this.groundY;

    this.isSliding = false;
    this.slideElapsed = 0;
    this.pendingSlideOnLand = false;

    this.invulnerableTimer = 0;
    this.runPhase = 0;
    this.impactScale = 1;
    this.impactTimer = 0;

    this.group.position.set(Track.laneToX(0), this.groundY, 0);
    this.bodyGroup.scale.y = 1;
    this.bodyGroup.rotation.x = 0;
    this.bodyGroup.rotation.z = 0;
    this.leftLegPivot.rotation.x = 0;
    this.rightLegPivot.rotation.x = 0;
    this.leftArmPivot.rotation.x = 0;
    this.rightArmPivot.rotation.x = 0;
  }

  /** Dispara um impulso curto de squash/stretch que decai de volta ao normal. */
  private triggerImpact(scale: number): void {
    this.impactScale = scale;
    this.impactTimer = PLAYER_JUICE.IMPACT_DURATION_S;
  }

  private beginLaneChange(target: Lane): void {
    this.targetLane = target;
    this.isChangingLane = true;
    this.laneChangeElapsedMs = 0;
    this.laneChangeFromX = this.group.position.x;
    this.laneChangeToX = Track.laneToX(target);
  }

  private startSlide(): void {
    this.isSliding = true;
    this.slideElapsed = 0;
  }

  private updateLaneChange(dt: number): void {
    if (!this.isChangingLane) return;

    this.laneChangeElapsedMs += dt * 1000;
    const t = Math.min(this.laneChangeElapsedMs / TRACK.LANE_CHANGE_DURATION_MS, 1);
    const eased = easeOutQuad(t);
    this.group.position.x = THREE.MathUtils.lerp(this.laneChangeFromX, this.laneChangeToX, eased);

    const direction = Math.sign(this.laneChangeToX - this.laneChangeFromX);
    this.bodyGroup.rotation.z = Math.sin(t * Math.PI) * PLAYER_JUICE.LANE_LEAN_ANGLE * direction;

    if (t >= 1) {
      this.bodyGroup.rotation.z = 0;
      this.lane = this.targetLane;
      this.isChangingLane = false;
      const queued = this.queuedLaneDelta;
      this.queuedLaneDelta = null;
      if (queued !== null) {
        this.requestLaneChange(queued);
      }
    }
  }

  private updateVertical(dt: number): void {
    if (this.vertical === 'grounded') return;

    this.vy += JUMP.GRAVITY * dt;
    this.currentY += this.vy * dt;

    if (this.currentY <= this.groundY) {
      this.currentY = this.groundY;
      this.vy = 0;
      this.vertical = 'grounded';
      this.triggerImpact(PLAYER_JUICE.LAND_SQUASH_SCALE);
      if (this.pendingSlideOnLand) {
        this.pendingSlideOnLand = false;
        this.startSlide();
      }
    } else if (this.vy < 0) {
      this.vertical = 'falling';
    }

    this.group.position.y = this.currentY;
  }

  private updateSlide(dt: number): void {
    if (!this.isSliding) return;
    this.slideElapsed += dt;
    if (this.slideElapsed >= SLIDE.DURATION_S) {
      this.isSliding = false;
    }
  }

  private updateAnimation(dt: number): void {
    const crouch = this.isSliding ? SLIDE.HITBOX_HEIGHT_SCALE : 1;

    if (this.impactTimer > 0) {
      this.impactTimer = Math.max(0, this.impactTimer - dt);
    }
    const impactBlend = this.impactTimer / PLAYER_JUICE.IMPACT_DURATION_S;
    const scaleTarget = THREE.MathUtils.lerp(crouch, this.impactScale, impactBlend);
    this.bodyGroup.scale.y = THREE.MathUtils.lerp(this.bodyGroup.scale.y, scaleTarget, 0.35);
    this.bodyGroup.rotation.x = THREE.MathUtils.lerp(
      this.bodyGroup.rotation.x,
      this.isSliding ? -0.9 : 0,
      0.35,
    );

    if (this.vertical === 'grounded' && !this.isSliding) {
      this.runPhase += dt * RUN_CYCLE_SPEED;
      const swing = Math.sin(this.runPhase) * MAX_LIMB_SWING;
      this.leftLegPivot.rotation.x = swing;
      this.rightLegPivot.rotation.x = -swing;
      this.leftArmPivot.rotation.x = -swing;
      this.rightArmPivot.rotation.x = swing;
    } else {
      const tuck = this.vertical !== 'grounded' ? -0.9 : 0;
      this.leftLegPivot.rotation.x = THREE.MathUtils.lerp(this.leftLegPivot.rotation.x, tuck, 0.3);
      this.rightLegPivot.rotation.x = THREE.MathUtils.lerp(this.rightLegPivot.rotation.x, tuck, 0.3);
      this.leftArmPivot.rotation.x = THREE.MathUtils.lerp(this.leftArmPivot.rotation.x, 0.4, 0.3);
      this.rightArmPivot.rotation.x = THREE.MathUtils.lerp(this.rightArmPivot.rotation.x, -0.4, 0.3);
    }
  }
}
