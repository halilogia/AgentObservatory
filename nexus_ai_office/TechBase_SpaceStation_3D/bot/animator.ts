import * as THREE from 'three';
import { Bot } from './model';

export type BotPose = 'idle' | 'walking' | 'coding' | 'testing' | 'reasoning' | 'reading' | 'resting';

interface JointRotation {
  x: number;
  y: number;
  z: number;
}

const J = (x = 0, y = 0, z = 0): JointRotation => ({ x, y, z });

export interface BotAnimator {
  readonly pose: BotPose;
  setPose(next: BotPose): void;
  update(dt: number, t: number, walkSpeed?: number): void;
}

export function createAnimator(bot: Bot, initialPose: BotPose = 'idle'): BotAnimator {
  let pose: BotPose = initialPose;
  let walkPhase = 0;
  const ph = bot.blinkOffset;
  const baseColor = new THREE.Color(bot.opts.accent);

  function updateJoint(target: THREE.Group, desired: JointRotation, speed: number) {
    target.rotation.x += (desired.x - target.rotation.x) * speed;
    target.rotation.y += (desired.y - target.rotation.y) * speed;
    target.rotation.z += (desired.z - target.rotation.z) * speed;
  }

  return {
    get pose() {
      return pose;
    },
    setPose(next: BotPose) {
      pose = next;
    },
    update(dt: number, t: number, walkSpeed = 1.0) {
      let armL = J();
      let armR = J();
      let head = J();
      let legL = J();
      let legR = J();
      let eyeScaleY = 1.35;
      let bulbIntensity = 1.0;
      let bulbColor = baseColor;
      let bounceY = 0;

      // Natural eye blinking
      const blinkCycle = (t * 0.8 + ph) % 4;
      if (blinkCycle < 0.15) {
        eyeScaleY = 0.1;
      }

      switch (pose) {
        case 'coding':
          // Rapid typing on holographic keys
          armL = J(-1.3 + Math.sin(t * 14 + ph) * 0.12, 0.1, 0.1);
          armR = J(-1.3 + Math.sin(t * 13 + ph + 1.8) * 0.12, -0.1, -0.1);
          head = J(0.12 + Math.sin(t * 1.5 + ph) * 0.04, Math.sin(t * 0.8 + ph) * 0.08, 0);
          bulbIntensity = 1.4 + Math.sin(t * 8) * 0.4;
          break;

        case 'testing':
          // Operating test consoles and levers
          armL = J(-1.0 + Math.sin(t * 3.5 + ph) * 0.3, 0.2, 0.4);
          armR = J(-1.4 + Math.cos(t * 4.2 + ph) * 0.3, -0.2, -0.4);
          head = J(0.08 + Math.sin(t * 2) * 0.08, Math.sin(t * 2.5) * 0.2, 0);
          bulbIntensity = Math.sin(t * 6 + ph) > 0 ? 1.8 : 0.6;
          bulbColor = new THREE.Color(0xf59e0b); // Amber test alert
          break;

        case 'reasoning':
          // Right hand on chin, head tilted in deep thought
          armL = J(-0.3, 0, 0.15);
          armR = J(-1.85 + Math.sin(t * 2 + ph) * 0.04, 0.35, -0.6);
          head = J(-0.12 + Math.sin(t * 1.2 + ph) * 0.04, 0.22, 0.14);
          bulbIntensity = 0.8 + (Math.sin(t * 3.5 + ph) * 0.5 + 0.5) * 1.6;
          bulbColor = new THREE.Color(0xa855f7); // Purple thought wave
          break;

        case 'reading':
          // Reviewing floating documentation
          armL = J(-1.1, 0.15, 0.12);
          armR = J(-1.1, -0.15, -0.12);
          head = J(0.18, Math.sin(t * 1.2 + ph) * 0.25, 0);
          bulbIntensity = 1.2;
          break;

        case 'resting':
          // Sleepy, relaxed posture in lounge
          armL = J(-0.25, 0, 0.25);
          armR = J(-0.25, 0, -0.25);
          head = J(-0.18, 0, 0.08);
          eyeScaleY = 0.35 + Math.max(0, Math.sin(t * 0.5 + ph)) * 0.1;
          bulbIntensity = 0.4 + Math.sin(t * 1.2 + ph) * 0.2; // Gentle breathing glow
          break;

        case 'walking': {
          walkPhase += dt * 7.5 * walkSpeed;
          const swing = Math.sin(walkPhase);
          armL = J(-swing * 0.7);
          armR = J(swing * 0.7);
          legL = J(swing * 0.65);
          legR = J(-swing * 0.65);
          head = J(0.04, Math.sin(walkPhase * 0.5) * 0.08, 0);
          bounceY = Math.abs(Math.cos(walkPhase)) * 0.06;
          bulbIntensity = 1.2;
          break;
        }

        default: // 'idle'
          armL = J(Math.sin(t * 1.5 + ph) * 0.05);
          armR = J(Math.sin(t * 1.5 + ph + 1) * 0.05);
          head = J(0, Math.sin(t * 0.6 + ph) * 0.12, Math.sin(t * 1.2 + ph) * 0.04);
          bounceY = Math.sin(t * 2 + ph) * 0.02;
          bulbIntensity = 0.9 + Math.sin(t * 2.5 + ph) * 0.25;
          break;
      }

      // Smooth interpolation to target joints
      const lerpSpeed = Math.min(1.0, dt * 10);
      updateJoint(bot.armL, armL, lerpSpeed);
      updateJoint(bot.armR, armR, lerpSpeed);
      updateJoint(bot.head, head, lerpSpeed);
      updateJoint(bot.legL, legL, lerpSpeed);
      updateJoint(bot.legR, legR, lerpSpeed);

      // Eye height
      bot.eyes.forEach((e) => {
        e.scale.y = eyeScaleY;
      });

      // Pure emissive bulb pulse (Zero PointLight GPU overhead!)
      (bot.bulb.material as THREE.MeshStandardMaterial).emissive = bulbColor;
      (bot.bulb.material as THREE.MeshStandardMaterial).emissiveIntensity = bulbIntensity;

      // Group subtle bounce
      if (pose === 'walking') {
        bot.group.position.y = bounceY;
      }
    }
  };
}
