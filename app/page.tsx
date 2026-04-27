'use client';

import React, { useEffect, useState, useRef } from 'react';
import { ArrowUpRight } from 'lucide-react';

// ============================================================================
// Tunable constants — all in one place
// ============================================================================
const AUTONOMOUS_RATE = 0.0008;
const SPRING_STIFFNESS = 0.10;       // anchor-frame return spring
const SPRING_DAMPING = 0.84;
const NUCLEUS_STIFFNESS = 0.14;      // nuclei chase the anchor frame
const NUCLEUS_DAMPING = 0.78;        // damping on per-nucleus motion
const NUCLEUS_LAG_FACTOR = 0.85;     // 0..1 — fraction of anchor each nucleus targets
const DRAG_LAG = 0.18;
const DRAG_SENSITIVITY_X = 320;
const DRAG_SENSITIVITY_Y = 400;
const VERTICAL_SCROLL_THRESHOLD = 30;
const AGITATION_DECAY = 0.92;
const AGITATION_SENSITIVITY = 0.0008;
const AGITATION_RADIUS = 280;

export default function OzsolLanding() {
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  const [time, setTime] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const heroRef = useRef<HTMLElement | null>(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const mousePixelRef = useRef({
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    vx: 0,
    vy: 0,
  });

  // The "anchor frame" is the user-applied rotation target. The nuclei
  // spring toward this anchor, but each independently and with damping —
  // so during fast motion they visibly lag and oscillate.
  const dragStateRef = useRef({
    isDragging: false,
    isTouchHorizontal: false,
    captured: false,
    lastX: 0,
    lastY: 0,
    // Anchor-frame state
    anchorTargetYaw: 0,
    anchorTargetPitch: 0,
    anchorYaw: 0,
    anchorPitch: 0,
    anchorVelYaw: 0,
    anchorVelPitch: 0,
    cursorOverHero: false,
  });

  // Each nucleus has its own rotation state, springing toward the anchor.
  // Nucleus index 0 = left (cyan), 1 = right (violet).
  const nucleiRef = useRef<{
    // Identity (set once)
    ringPhases: number[];
    ringDirections: number[];
    electronOffsets: number[];
    electronSpeeds: number[];
    // Dynamics (per frame)
    yaw: number;
    pitch: number;
    velYaw: number;
    velPitch: number;
    // Bond-axis distortion: the projected position can be pushed slightly
    // off the ideal bond axis by independent dynamics.
    agitation: number;
  }[]>([]);

  // Persisted ring count — same for both nuclei to keep them visually paired.
  const RING_COUNT = 3;

  useEffect(() => {
    const link = document.createElement('link');
    link.href =
      'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@300;400;500&family=Inter+Tight:wght@300;400;500;600&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  // Initialise per-nucleus randomisation once. Both nuclei have the same
  // ring count (3) so they look like the same kind of object; everything
  // else differs so they have independent dynamics and personalities.
  useEffect(() => {
    const makeNucleus = () => {
      const ringPhases: number[] = [];
      const ringDirections: number[] = [];
      const electronOffsets: number[] = [];
      const electronSpeeds: number[] = [];
      for (let i = 0; i < RING_COUNT; i++) {
        ringPhases.push(Math.random() * Math.PI * 2);
        ringDirections.push(Math.random() > 0.5 ? 1 : -1);
        electronOffsets.push(Math.random() * Math.PI * 2);
        electronSpeeds.push(0.8 + Math.random() * 1.4);
      }
      return {
        ringPhases,
        ringDirections,
        electronOffsets,
        electronSpeeds,
        yaw: 0,
        pitch: 0,
        velYaw: 0,
        velPitch: 0,
        agitation: 0,
      };
    };
    nucleiRef.current = [makeNucleus(), makeNucleus()];
  }, []);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      const x = e.clientX / window.innerWidth;
      const y = e.clientY / window.innerHeight;
      setMousePos({ x, y });
      mouseRef.current = { x, y };
      mousePixelRef.current.x = e.clientX;
      mousePixelRef.current.y = e.clientY;
    };
    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, []);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const melbourneTime = now.toLocaleTimeString('en-AU', {
        timeZone: 'Australia/Melbourne',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      setTime(melbourneTime);
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  // Pointer drag handlers — supports mouse free orbit and touch diagonal-aware
  useEffect(() => {
    const isInsideHero = (clientY: number) => {
      const hero = heroRef.current;
      if (!hero) return false;
      const rect = hero.getBoundingClientRect();
      return clientY >= rect.top && clientY <= rect.bottom;
    };

    const isOverInteractive = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return !!target.closest('a, button, [role="button"]');
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!isInsideHero(e.clientY)) return;
      if (isOverInteractive(e.target)) return;
      const ds = dragStateRef.current;
      ds.isDragging = true;
      ds.captured = e.pointerType === 'mouse';
      ds.isTouchHorizontal = false;
      ds.lastX = e.clientX;
      ds.lastY = e.clientY;
      ds.anchorTargetYaw = ds.anchorYaw;
      ds.anchorTargetPitch = ds.anchorPitch;
      ds.anchorVelYaw = 0;
      ds.anchorVelPitch = 0;
      if (e.pointerType === 'mouse') {
        document.body.style.cursor = 'grabbing';
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const ds = dragStateRef.current;
      const overHero = isInsideHero(e.clientY) && !isOverInteractive(e.target);
      ds.cursorOverHero = overHero;

      if (!ds.isDragging) {
        if (e.pointerType === 'mouse') {
          document.body.style.cursor = overHero ? 'grab' : '';
        }
        return;
      }

      const dx = e.clientX - ds.lastX;
      const dy = e.clientY - ds.lastY;

      if (e.pointerType !== 'mouse' && !ds.captured) {
        const movedEnough = Math.abs(dx) + Math.abs(dy) > 6;
        if (!movedEnough) return;
        const angleFromVertical = Math.abs(
          (Math.atan2(dx, -dy) * 180) / Math.PI
        );
        const angleFromVerticalNormalised =
          angleFromVertical > 90 ? 180 - angleFromVertical : angleFromVertical;
        if (angleFromVerticalNormalised < VERTICAL_SCROLL_THRESHOLD) {
          ds.isDragging = false;
          return;
        }
        ds.captured = true;
        try {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        } catch {
          // ignore
        }
      }

      ds.lastX = e.clientX;
      ds.lastY = e.clientY;

      ds.anchorTargetYaw += (dx / DRAG_SENSITIVITY_X) * Math.PI * 2;
      const allowPitch =
        e.pointerType === 'mouse' || Math.abs(dy) > Math.abs(dx) * 0.4;
      if (allowPitch) {
        ds.anchorTargetPitch += (dy / DRAG_SENSITIVITY_Y) * Math.PI * 1.2;
        ds.anchorTargetPitch = Math.max(
          -Math.PI / 2,
          Math.min(Math.PI / 2, ds.anchorTargetPitch)
        );
      }
    };

    const onPointerUp = () => {
      const ds = dragStateRef.current;
      if (!ds.isDragging) return;
      ds.isDragging = false;
      ds.captured = false;
      ds.anchorTargetYaw = 0;
      ds.anchorTargetPitch = 0;
      document.body.style.cursor = ds.cursorOverHero ? 'grab' : '';
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      document.body.style.cursor = '';
    };
  }, []);

  // Canvas O2 molecule animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let autonomousRotation = 0;
    type Dust = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      alpha: number;
      phase: number;
    };
    let dust: Dust[] = [];

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    const initDust = () => {
      dust = [];
      const count = Math.min(180, Math.floor((window.innerWidth * window.innerHeight) / 14000));
      for (let i = 0; i < count; i++) {
        dust.push({
          x: Math.random() * window.innerWidth,
          y: Math.random() * window.innerHeight,
          vx: (Math.random() - 0.5) * 0.15,
          vy: (Math.random() - 0.5) * 0.15,
          r: Math.random() * 1.2 + 0.2,
          alpha: Math.random() * 0.4 + 0.1,
          phase: Math.random() * Math.PI * 2,
        });
      }
    };
    initDust();

    const draw = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      // Mouse velocity tracking
      const mp = mousePixelRef.current;
      mp.vx = mp.x - mp.prevX;
      mp.vy = mp.y - mp.prevY;
      mp.prevX = mp.x;
      mp.prevY = mp.y;
      const mouseSpeed = Math.sqrt(mp.vx * mp.vx + mp.vy * mp.vy);

      // Atmospheric dust
      const t = performance.now() * 0.001;
      for (const d of dust) {
        d.x += d.vx;
        d.y += d.vy;
        if (d.x < 0) d.x = w;
        if (d.x > w) d.x = 0;
        if (d.y < 0) d.y = h;
        if (d.y > h) d.y = 0;
        const flicker = 0.5 + Math.sin(t * 1.5 + d.phase) * 0.5;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(186, 230, 253, ${d.alpha * flicker * 0.5})`;
        ctx.fill();
      }

      // ----- Anchor-frame physics -----
      const ds = dragStateRef.current;
      if (ds.isDragging) {
        // Elastic chase during drag
        ds.anchorYaw += (ds.anchorTargetYaw - ds.anchorYaw) * DRAG_LAG;
        ds.anchorPitch += (ds.anchorTargetPitch - ds.anchorPitch) * DRAG_LAG;
        ds.anchorVelYaw = 0;
        ds.anchorVelPitch = 0;
      } else {
        // Damped spring back to home pose with overshoot
        const fY = (ds.anchorTargetYaw - ds.anchorYaw) * SPRING_STIFFNESS;
        const fP = (ds.anchorTargetPitch - ds.anchorPitch) * SPRING_STIFFNESS;
        ds.anchorVelYaw = (ds.anchorVelYaw + fY) * SPRING_DAMPING;
        ds.anchorVelPitch = (ds.anchorVelPitch + fP) * SPRING_DAMPING;
        ds.anchorYaw += ds.anchorVelYaw;
        ds.anchorPitch += ds.anchorVelPitch;
      }

      // ----- Per-nucleus physics -----
      // Each nucleus springs toward the anchor frame, but with its own
      // mass/damping so the two nuclei drift slightly during fast motion
      // and oscillate independently as they settle.
      const nuclei = nucleiRef.current;
      if (nuclei.length === 2) {
        for (let i = 0; i < 2; i++) {
          const n = nuclei[i];
          // Each nucleus has a slightly different effective lag, making the
          // pair feel like coupled but not identical bodies. Index 0 leads,
          // index 1 trails by ~10%.
          const lagFactor = i === 0 ? 1.0 : NUCLEUS_LAG_FACTOR;
          const targetYaw = ds.anchorYaw * lagFactor;
          const targetPitch = ds.anchorPitch * lagFactor;
          const fY = (targetYaw - n.yaw) * NUCLEUS_STIFFNESS;
          const fP = (targetPitch - n.pitch) * NUCLEUS_STIFFNESS;
          n.velYaw = (n.velYaw + fY) * NUCLEUS_DAMPING;
          n.velPitch = (n.velPitch + fP) * NUCLEUS_DAMPING;
          n.yaw += n.velYaw;
          n.pitch += n.velPitch;
        }
      }

      // Molecule centre
      const cx = w / 2;
      const cy = h * 0.43;

      const parallaxYaw = ds.isDragging ? 0 : (mouseRef.current.x - 0.5) * 0.3;
      const parallaxPitch = ds.isDragging ? 0 : (mouseRef.current.y - 0.5) * 0.2;

      autonomousRotation += AUTONOMOUS_RATE;

      const bondLength = Math.min(w, h) * 0.42;
      const baseRadius = Math.min(w, h) * 0.16;

      // Project a point through a specific nucleus's rotation frame.
      const makeProjector = (yaw: number, pitch: number) => {
        const cosY = Math.cos(yaw);
        const sinY = Math.sin(yaw);
        const cosP = Math.cos(pitch);
        const sinP = Math.sin(pitch);
        return (lx: number, ly: number, lz: number) => {
          const x1 = lx * cosY + lz * sinY;
          const z1 = -lx * sinY + lz * cosY;
          const y2 = ly * cosP - z1 * sinP;
          const z2 = ly * sinP + z1 * cosP;
          const perspective = 1200;
          const scale = perspective / (perspective + z2);
          return { x: cx + x1 * scale, y: cy + y2 * scale, scale, z: z2 };
        };
      };

      // Each nucleus is positioned using its own rotation frame — that's
      // what makes them visibly independent during fast motion.
      const n1Frame = nuclei.length === 2
        ? makeProjector(nuclei[0].yaw + parallaxYaw, nuclei[0].pitch + parallaxPitch)
        : makeProjector(parallaxYaw, parallaxPitch);
      const n2Frame = nuclei.length === 2
        ? makeProjector(nuclei[1].yaw + parallaxYaw, nuclei[1].pitch + parallaxPitch)
        : makeProjector(parallaxYaw, parallaxPitch);

      const n1 = n1Frame(-bondLength, 0, 0);
      const n2 = n2Frame(bondLength, 0, 0);

      // Update per-nucleus agitation (velocity × proximity)
      if (nuclei.length === 2) {
        for (let i = 0; i < 2; i++) {
          const np = i === 0 ? n1 : n2;
          const dx = mp.x - np.x;
          const dy = mp.y - np.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const proximity = Math.max(0, 1 - dist / AGITATION_RADIUS);
          const pump = mouseSpeed * proximity * proximity * AGITATION_SENSITIVITY;
          nuclei[i].agitation = nuclei[i].agitation * AGITATION_DECAY + pump;
          if (nuclei[i].agitation > 1.5) nuclei[i].agitation = 1.5;
        }
      }

      // Bond between the two nuclei — drawn directly from the projected
      // positions, so when nuclei are out of phase the bond visibly tilts.
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.08)';
      ctx.lineWidth = 1;
      const bondOffset = 10;
      // Compute perpendicular offset for the double bond
      const bx = n2.x - n1.x;
      const by = n2.y - n1.y;
      const blen = Math.sqrt(bx * bx + by * by) || 1;
      const px = (-by / blen) * bondOffset;
      const py = (bx / blen) * bondOffset;
      ctx.beginPath();
      ctx.moveTo(n1.x + px, n1.y + py);
      ctx.lineTo(n2.x + px, n2.y + py);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(n1.x - px, n1.y - py);
      ctx.lineTo(n2.x - px, n2.y - py);
      ctx.stroke();

      type Nucleus = {
        x: number;
        y: number;
        scale: number;
        z: number;
        color: string;
      };

      const drawNucleus = (
        nucleus: Nucleus,
        originLocal: [number, number, number],
        identity: typeof nuclei[number],
        projector: (lx: number, ly: number, lz: number) => { x: number; y: number; scale: number; z: number }
      ) => {
        const { ringPhases, ringDirections, electronOffsets, electronSpeeds, agitation } = identity;

        const speedMult = 1 + agitation * 2.5;
        const radiusContraction = 1 - agitation * 0.18;
        const ringBrightness = 0.10 + agitation * 0.18;
        const electronGlow = 1 + agitation * 0.6;

        for (let r = 0; r < RING_COUNT; r++) {
          const ringAngle =
            ringPhases[r] +
            autonomousRotation * ringDirections[r] * (1 + agitation * 0.5);
          const samples = 80;
          ctx.beginPath();
          const ringRadius = baseRadius * radiusContraction;
          for (let s = 0; s <= samples; s++) {
            const ang = (Math.PI * 2 * s) / samples;
            const lx = Math.cos(ang) * ringRadius;
            const ly = Math.sin(ang) * ringRadius * 0.35;
            const rx = lx * Math.cos(ringAngle) - ly * Math.sin(ringAngle);
            const ry = lx * Math.sin(ringAngle) + ly * Math.cos(ringAngle);
            const wx = originLocal[0] + rx;
            const wy = originLocal[1] + ry;
            const wz =
              originLocal[2] +
              (Math.sin(ang) * Math.cos(ringAngle) -
                Math.cos(ang) * Math.sin(ringAngle)) *
                ringRadius *
                0.35;
            const p = projector(wx, wy, wz);
            if (s === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          }
          ctx.strokeStyle = nucleus.color + `, ${ringBrightness})`;
          ctx.lineWidth = 0.6;
          ctx.stroke();

          const electronAng =
            electronOffsets[r] +
            autonomousRotation * electronSpeeds[r] * speedMult * (r + 1) * 1.5;
          const lx = Math.cos(electronAng) * ringRadius;
          const ly = Math.sin(electronAng) * ringRadius * 0.35;
          const rx = lx * Math.cos(ringAngle) - ly * Math.sin(ringAngle);
          const ry = lx * Math.sin(ringAngle) + ly * Math.cos(ringAngle);
          const wx = originLocal[0] + rx;
          const wy = originLocal[1] + ry;
          const wz =
            originLocal[2] +
            (Math.sin(electronAng) * Math.cos(ringAngle) -
              Math.cos(electronAng) * Math.sin(ringAngle)) *
              ringRadius *
              0.35;
          const p = projector(wx, wy, wz);

          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 6 * p.scale * electronGlow);
          grad.addColorStop(0, nucleus.color + ', 0.65)');
          grad.addColorStop(0.5, nucleus.color + ', 0.25)');
          grad.addColorStop(1, nucleus.color + ', 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 6 * p.scale * electronGlow, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = nucleus.color + ', 0.7)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.2 * p.scale, 0, Math.PI * 2);
          ctx.fill();
        }

        const coreRadius = baseRadius * 0.22 * nucleus.scale;
        const coreIntensity = 1 + agitation * 0.4;
        const coreGrad = ctx.createRadialGradient(
          nucleus.x,
          nucleus.y,
          0,
          nucleus.x,
          nucleus.y,
          coreRadius * 4 * coreIntensity
        );
        coreGrad.addColorStop(0, nucleus.color + `, ${0.4 * coreIntensity})`);
        coreGrad.addColorStop(0.4, nucleus.color + `, ${0.12 * coreIntensity})`);
        coreGrad.addColorStop(1, nucleus.color + ', 0)');
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(nucleus.x, nucleus.y, coreRadius * 4 * coreIntensity, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = nucleus.color + ', 0.55)';
        ctx.beginPath();
        ctx.arc(nucleus.x, nucleus.y, coreRadius, 0, Math.PI * 2);
        ctx.fill();
      };

      const pairs = [
        {
          proj: n1,
          local: [-bondLength, 0, 0] as [number, number, number],
          color: 'rgba(34, 211, 238',
          identity: nuclei[0],
          projector: n1Frame,
        },
        {
          proj: n2,
          local: [bondLength, 0, 0] as [number, number, number],
          color: 'rgba(139, 92, 246',
          identity: nuclei[1],
          projector: n2Frame,
        },
      ].sort((a, b) => b.proj.z - a.proj.z);

      for (const p of pairs) {
        if (!p.identity) continue;
        drawNucleus(
          { x: p.proj.x, y: p.proj.y, scale: p.proj.scale, z: p.proj.z, color: p.color },
          p.local,
          p.identity,
          p.projector
        );
      }

      animationId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const styles = `
    .ozsol-root {
      font-family: 'Inter Tight', system-ui, sans-serif;
      background: #0a0a0f;
      color: #fafaf7;
      min-height: 100vh;
      overflow-x: hidden;
    }
    .serif {
      font-family: 'Instrument Serif', serif;
      font-weight: 400;
      letter-spacing: -0.01em;
    }
    .mono {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 400;
      letter-spacing: 0.02em;
    }
    .aurora-container {
      position: fixed;
      inset: 0;
      overflow: hidden;
      pointer-events: none;
      z-index: 0;
    }
    .aurora-blob {
      position: absolute;
      border-radius: 50%;
      filter: blur(100px);
      mix-blend-mode: screen;
      will-change: transform;
    }
    .blob-1 {
      width: 700px; height: 700px;
      background: radial-gradient(circle, rgba(6, 182, 212, 0.45), rgba(6, 182, 212, 0) 70%);
      top: -200px; left: -150px;
      animation: drift1 28s ease-in-out infinite alternate;
    }
    .blob-2 {
      width: 900px; height: 900px;
      background: radial-gradient(circle, rgba(139, 92, 246, 0.38), rgba(139, 92, 246, 0) 70%);
      top: 30%; right: -250px;
      animation: drift2 34s ease-in-out infinite alternate;
    }
    .blob-3 {
      width: 600px; height: 600px;
      background: radial-gradient(circle, rgba(249, 115, 22, 0.22), rgba(249, 115, 22, 0) 70%);
      bottom: 20%; left: 30%;
      animation: drift3 40s ease-in-out infinite alternate;
    }
    .blob-4 {
      width: 500px; height: 500px;
      background: radial-gradient(circle, rgba(34, 211, 238, 0.32), rgba(34, 211, 238, 0) 70%);
      bottom: -100px; right: 20%;
      animation: drift4 24s ease-in-out infinite alternate;
    }
    @keyframes drift1 {
      0% { transform: translate(0, 0) scale(1); }
      100% { transform: translate(150px, 100px) scale(1.3); }
    }
    @keyframes drift2 {
      0% { transform: translate(0, 0) scale(1.1); }
      100% { transform: translate(-120px, -80px) scale(0.9); }
    }
    @keyframes drift3 {
      0% { transform: translate(0, 0) scale(0.95); }
      100% { transform: translate(80px, -120px) scale(1.2); }
    }
    @keyframes drift4 {
      0% { transform: translate(0, 0) scale(1); }
      100% { transform: translate(-100px, -150px) scale(1.15); }
    }
    .grain {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 2;
      opacity: 0.05;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    }
    .vignette {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 2;
      background: radial-gradient(ellipse at center, transparent 30%, rgba(10, 10, 15, 0.85) 100%);
    }
    .hero-canvas {
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      z-index: 1;
      pointer-events: none;
    }
    .reveal {
      opacity: 0;
      transform: translateY(20px);
      animation: reveal 1.2s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
    }
    .reveal-1 { animation-delay: 0.2s; }
    .reveal-2 { animation-delay: 0.5s; }
    .reveal-3 { animation-delay: 0.8s; }
    .reveal-4 { animation-delay: 1.1s; }
    .reveal-5 { animation-delay: 1.4s; }
    @keyframes reveal {
      to { opacity: 1; transform: translateY(0); }
    }
    .orbit-spin {
      animation: spin 24s linear infinite;
      transform-origin: center;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .blink {
      animation: blink 1.6s step-end infinite;
    }
    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }
    .underline-grow {
      position: relative;
    }
    .underline-grow::after {
      content: '';
      position: absolute;
      left: 0; bottom: -2px;
      width: 0; height: 1px;
      background: currentColor;
      transition: width 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    .underline-grow:hover::after {
      width: 100%;
    }
    .domain-card {
      transition: all 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
      border: 1px solid rgba(250, 250, 247, 0.08);
      background: rgba(10, 10, 15, 0.4);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
    }
    .domain-card:hover {
      border-color: rgba(250, 250, 247, 0.18);
      background: rgba(10, 10, 15, 0.55);
      transform: translateY(-2px);
    }
    .domain-card:hover .arrow {
      transform: translate(4px, -4px);
    }
    .arrow {
      transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    .marker-line {
      width: 1px;
      background: linear-gradient(to bottom, transparent, rgba(250, 250, 247, 0.3), transparent);
    }
    .marker-line-h {
      height: 1px;
      background: linear-gradient(to right, transparent, rgba(250, 250, 247, 0.2), transparent);
    }
    .scroll-indicator {
      animation: scroll-bounce 2.4s ease-in-out infinite;
    }
    @keyframes scroll-bounce {
      0%, 100% { transform: translateY(0); opacity: 0.4; }
      50% { transform: translateY(8px); opacity: 1; }
    }
    .number-pulse {
      animation: pulse 4s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }
    .wordmark-shadow {
      text-shadow: 0 0 100px rgba(10, 10, 15, 0.85), 0 0 40px rgba(10, 10, 15, 0.6);
    }
    .content-bg {
      background: linear-gradient(to bottom, transparent 0%, rgba(10, 10, 15, 0.85) 8%, rgba(10, 10, 15, 0.95) 100%);
    }
    .hero-section {
      touch-action: pan-y;
    }
  `;

  const heroX = (mousePos.x - 0.5) * 8;
  const heroY = (mousePos.y - 0.5) * 5;

  return (
    <div className="ozsol-root">
      <style>{styles}</style>

      <div className="aurora-container">
        <div className="aurora-blob blob-1"></div>
        <div className="aurora-blob blob-2"></div>
        <div className="aurora-blob blob-3"></div>
        <div className="aurora-blob blob-4"></div>
      </div>

      <canvas ref={canvasRef} className="hero-canvas" />

      <div className="grain"></div>
      <div className="vignette"></div>

      <div className="relative z-10">
        <nav className="fixed top-0 left-0 right-0 z-50 px-6 md:px-8 py-6 flex items-center justify-between mix-blend-difference gap-4">
          <div className="reveal reveal-1 mono text-xs tracking-widest uppercase flex items-center gap-2 shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" className="orbit-spin">
              <circle cx="12" cy="12" r="2" fill="currentColor" />
              <ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke="currentColor" strokeWidth="0.6" />
              <ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke="currentColor" strokeWidth="0.6" transform="rotate(60 12 12)" />
              <ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke="currentColor" strokeWidth="0.6" transform="rotate(120 12 12)" />
            </svg>
            <span>OZSOL</span>
          </div>
          <div className="reveal reveal-1 mono text-xs tracking-widest uppercase hidden lg:flex items-center gap-6 xl:gap-8 shrink-0">
            <span className="opacity-60 whitespace-nowrap">Melbourne {time}</span>
            <span className="opacity-60 whitespace-nowrap">EST. 2016</span>
            <a href="#contact" className="underline-grow">Contact</a>
          </div>
          <div className="reveal reveal-1 mono text-xs tracking-widest uppercase hidden md:flex lg:hidden items-center gap-4 shrink-0">
            <span className="opacity-60 whitespace-nowrap">EST. 2016</span>
            <a href="#contact" className="underline-grow">Contact</a>
          </div>
          <div className="reveal reveal-1 mono text-xs tracking-widest uppercase md:hidden">
            <a href="#contact" className="underline-grow">Contact</a>
          </div>
        </nav>

        <section
          ref={heroRef}
          className="hero-section min-h-screen relative flex flex-col justify-center px-8 md:px-16"
        >
          <div className="hidden md:flex absolute left-8 top-1/2 -translate-y-1/2 flex-col items-center gap-4">
            <div className="marker-line h-32"></div>
            <span className="mono text-xs tracking-widest uppercase opacity-50 [writing-mode:vertical-rl] rotate-180">
              Australia Solutions
            </span>
            <div className="marker-line h-32"></div>
          </div>

          <div className="hidden md:block absolute right-8 top-1/2 -translate-y-1/2">
            <div className="mono text-xs tracking-widest uppercase opacity-50 [writing-mode:vertical-rl]">
              <span className="opacity-100">●</span>
              <span className="ml-2">O₂ — Drag to rotate</span>
            </div>
          </div>

          <div
            className="reveal reveal-2 mx-auto wordmark-shadow relative pointer-events-none"
            style={{
              transform: `translate(${heroX}px, ${heroY}px)`,
              transition: 'transform 1.5s cubic-bezier(0.2, 0.8, 0.2, 1)',
            }}
          >
            <h1 className="serif text-center leading-[0.85] tracking-tight">
              <span className="block text-[20vw] md:text-[18vw] lg:text-[15vw]">
                Oz<span className="italic">sol</span>
                <sub className="text-[0.35em] align-baseline ml-1 opacity-60">₂</sub>
              </span>
            </h1>
          </div>

          <div className="reveal reveal-3 mt-12 max-w-3xl mx-auto text-center px-4 relative pointer-events-none">
            <p className="serif italic text-3xl md:text-4xl lg:text-5xl leading-[1.05] opacity-95 wordmark-shadow">
              Software for industries{' '}
              <br className="hidden md:block" />
              that don&apos;t get to fail.
            </p>
          </div>

          <div className="reveal reveal-4 mt-16 mx-auto flex flex-col items-center gap-3 relative">
            <span className="mono text-[10px] tracking-[0.3em] uppercase opacity-50">Scroll</span>
            <div className="scroll-indicator">
              <svg width="12" height="20" viewBox="0 0 12 20" fill="none">
                <path d="M6 2 L6 16 M2 12 L6 16 L10 12" stroke="currentColor" strokeWidth="0.8" />
              </svg>
            </div>
          </div>
        </section>

        <div className="content-bg">
          <section className="relative px-8 md:px-16 py-32 md:py-48">
            <div className="max-w-6xl mx-auto">
              <div className="grid grid-cols-12 gap-8">
                <div className="col-span-12 md:col-span-2">
                  <span className="mono text-xs tracking-widest uppercase opacity-50">
                    /01 — Premise
                  </span>
                </div>
                <div className="col-span-12 md:col-span-10">
                  <h2 className="serif text-4xl md:text-6xl lg:text-7xl leading-[1.05] tracking-tight">
                    Some software is judged on
                    <span className="italic opacity-80"> conversion rates</span>.
                    Other software is judged on whether the
                    <span className="italic opacity-80"> file</span> still
                    holds up at the appeal hearing.
                  </h2>
                  <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-12 max-w-4xl">
                    <p className="text-lg leading-relaxed opacity-70">
                      Ozsol builds for the second category. Regulated
                      practice, healthcare, infrastructural data — domains
                      where a missing record is not a metric, it is a
                      person whose case fell through.
                    </p>
                    <p className="text-lg leading-relaxed opacity-70">
                      We work as a small studio. Each venture is built by
                      hand, against a real operational need we have lived
                      with first. We do not chase categories. We ship into
                      domains where the cost of getting it wrong is not
                      measured in churn.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="marker-line-h max-w-6xl mx-auto"></div>

          <section className="relative px-8 md:px-16 py-32 md:py-48">
            <div className="max-w-6xl mx-auto">
              <div className="grid grid-cols-12 gap-8 mb-16">
                <div className="col-span-12 md:col-span-2">
                  <span className="mono text-xs tracking-widest uppercase opacity-50">
                    /02 — Domains
                  </span>
                </div>
                <div className="col-span-12 md:col-span-10">
                  <h3 className="serif text-3xl md:text-5xl leading-tight tracking-tight max-w-3xl">
                    Three operating fronts.
                    <span className="italic opacity-70"> One philosophy.</span>
                  </h3>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-white/5">
                <DomainCard
                  index="01"
                  kicker="Practice since 2016"
                  title="Data"
                  body="Principal-led data engineering for organisations that need their numbers to be both correct and auditable. Long engagements, narrow scope, durable systems."
                />
                <DomainCard
                  index="02"
                  kicker="In active build"
                  title="Operations"
                  body="Vertical software for regulated professional services. Where workflows are governed by codes of conduct and the wrong record loses the file."
                />
                <DomainCard
                  index="03"
                  kicker="Roadmap"
                  title="Health"
                  body="A line of clinical-adjacent products serving allied health and primary care. Designed in collaboration with practitioners, sized for clinics not enterprises."
                />
              </div>

              <div className="mt-12 max-w-2xl">
                <p className="mono text-xs tracking-wide uppercase opacity-50 leading-relaxed">
                  Specific products are not surfaced publicly until they
                  are ready to take customers. Operators and prospective
                  collaborators may enquire directly.
                </p>
              </div>
            </div>
          </section>

          <div className="marker-line-h max-w-6xl mx-auto"></div>

          <section className="relative px-8 md:px-16 py-32 md:py-48">
            <div className="max-w-6xl mx-auto">
              <div className="grid grid-cols-12 gap-8">
                <div className="col-span-12 md:col-span-2">
                  <span className="mono text-xs tracking-widest uppercase opacity-50">
                    /03 — Method
                  </span>
                </div>
                <div className="col-span-12 md:col-span-10">
                  <div className="space-y-12">
                    <Principle
                      n="i."
                      title="Build for one before building for ten"
                      body="Every Ozsol venture begins with a real operator solving a real problem in front of us. The first ten customers shape the product more than any market analysis."
                    />
                    <Principle
                      n="ii."
                      title="Boring infrastructure, deliberate craft"
                      body="We choose tools that will still be supported in fifteen years. PostgreSQL over the latest datastore. Django over the latest framework. The interesting decisions are the product ones."
                    />
                    <Principle
                      n="iii."
                      title="Slow is a feature"
                      body="We do not raise venture capital. We do not optimise for hockey-stick growth. The goal is products that earn their keep and stay in service for the long horizon."
                    />
                    <Principle
                      n="iv."
                      title="Australia first, by design"
                      body="Headquartered in Melbourne. Compliant with Australian regulatory frameworks from day one. Data residency is not a setting — it is the default."
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="marker-line-h max-w-6xl mx-auto"></div>

          <section className="relative px-8 md:px-16 py-24">
            <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-12">
              <FactBlock label="Established" value="2016" />
              <FactBlock label="Headquarters" value="Melbourne" />
              <FactBlock label="Operating Domains" value="03" />
              <FactBlock label="Status" value="Selective" pulse />
            </div>
          </section>

          <div className="marker-line-h max-w-6xl mx-auto"></div>

          <section id="contact" className="relative px-8 md:px-16 py-32 md:py-48">
            <div className="max-w-6xl mx-auto">
              <div className="grid grid-cols-12 gap-8">
                <div className="col-span-12 md:col-span-2">
                  <span className="mono text-xs tracking-widest uppercase opacity-50">
                    /04 — Contact
                  </span>
                </div>
                <div className="col-span-12 md:col-span-10">
                  <h3 className="serif text-4xl md:text-6xl leading-tight tracking-tight max-w-3xl">
                    Ozsol does not advertise.
                    <span className="italic opacity-70"> Introductions are welcome.</span>
                  </h3>
                  <div className="mt-12 flex flex-col md:flex-row gap-8 md:gap-16">
                    <div>
                      <span className="mono text-xs tracking-widest uppercase opacity-50 block mb-2">
                        Studio
                      </span>
                      <a
                        href="mailto:info@ozsol.com.au"
                        className="serif text-2xl md:text-3xl underline-grow"
                      >
                        info@ozsol.com.au
                      </a>
                    </div>
                    <div>
                      <span className="mono text-xs tracking-widest uppercase opacity-50 block mb-2">
                        Located
                      </span>
                      <span className="serif text-2xl md:text-3xl">
                        Melbourne, Australia
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <footer className="relative px-8 md:px-16 py-12 border-t border-white/5">
            <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="flex items-center gap-3">
                <svg width="14" height="14" viewBox="0 0 24 24" className="orbit-spin opacity-60">
                  <circle cx="12" cy="12" r="2" fill="currentColor" />
                  <ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke="currentColor" strokeWidth="0.6" />
                  <ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke="currentColor" strokeWidth="0.6" transform="rotate(60 12 12)" />
                  <ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke="currentColor" strokeWidth="0.6" transform="rotate(120 12 12)" />
                </svg>
                <span className="mono text-xs tracking-widest uppercase opacity-60">
                  Ozsol Pty Ltd · ABN 97 618 614 654
                </span>
              </div>
              <div className="mono text-xs tracking-widest uppercase opacity-60 flex items-center gap-2">
                <span className="blink">●</span>
                <span>System operational — Melbourne {time}</span>
              </div>
              <div className="mono text-xs tracking-widest uppercase opacity-40">
                © {new Date().getFullYear()} — All ventures reserved
              </div>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

function DomainCard({
  index,
  kicker,
  title,
  body,
}: {
  index: string;
  kicker: string;
  title: string;
  body: string;
}) {
  return (
    <div className="domain-card p-10 md:p-12 group cursor-default relative">
      <div className="flex items-start justify-between mb-12">
        <span className="mono text-xs tracking-widest uppercase opacity-50">
          {index}
        </span>
        <ArrowUpRight
          className="arrow opacity-30 group-hover:opacity-100 transition-opacity"
          size={18}
          strokeWidth={1}
        />
      </div>
      <span className="mono text-[10px] tracking-[0.25em] uppercase opacity-40 block mb-3">
        {kicker}
      </span>
      <h4 className="serif text-5xl md:text-6xl mb-6 tracking-tight">
        {title}
      </h4>
      <p className="text-sm leading-relaxed opacity-70 max-w-xs">
        {body}
      </p>
    </div>
  );
}

function Principle({
  n,
  title,
  body,
}: {
  n: string;
  title: string;
  body: string;
}) {
  return (
    <div className="grid grid-cols-12 gap-4 md:gap-8 group">
      <div className="col-span-2 md:col-span-1">
        <span className="serif italic text-2xl md:text-3xl opacity-50 group-hover:opacity-90 transition-opacity">
          {n}
        </span>
      </div>
      <div className="col-span-10 md:col-span-11">
        <h4 className="serif text-2xl md:text-3xl mb-3 tracking-tight">
          {title}
        </h4>
        <p className="text-base md:text-lg leading-relaxed opacity-65 max-w-3xl">
          {body}
        </p>
      </div>
    </div>
  );
}

function FactBlock({
  label,
  value,
  pulse = false,
}: {
  label: string;
  value: string;
  pulse?: boolean;
}) {
  return (
    <div>
      <span className="mono text-[10px] tracking-[0.25em] uppercase opacity-50 block mb-3">
        {label}
      </span>
      <span
        className={`serif text-4xl md:text-5xl block tracking-tight ${
          pulse ? 'number-pulse' : ''
        }`}
      >
        {value}
      </span>
    </div>
  );
}