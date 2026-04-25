'use client';

import React, { useEffect, useState, useRef } from 'react';
import { ArrowUpRight } from 'lucide-react';

export default function OzsolLanding() {
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  const [time, setTime] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });

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

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      const x = e.clientX / window.innerWidth;
      const y = e.clientY / window.innerHeight;
      setMousePos({ x, y });
      mouseRef.current = { x, y };
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

  // Canvas O2 molecule animation - scaled up and shifted upward to sit
  // behind the wordmark rather than between wordmark and tagline.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let rotation = 0;
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

      // Molecule centre - sits ABOVE viewport centre so it's behind the
      // wordmark, not between wordmark and tagline. The wordmark sits at
      // roughly 45% of viewport height in the hero; place the molecule
      // there so it surrounds the wordmark.
      const cx = w / 2;
      const cy = h * 0.45;

      const tiltX = (mouseRef.current.x - 0.5) * 0.3;
      const tiltY = (mouseRef.current.y - 0.5) * 0.2;

      rotation += 0.002;

      // Larger bond length and orbital radius - molecule envelops the
      // wordmark area instead of sitting inside the tagline gap.
      const bondLength = Math.min(w, h) * 0.42;
      const baseRadius = Math.min(w, h) * 0.16;

      const cosY = Math.cos(tiltX);
      const sinY = Math.sin(tiltX);
      const cosP = Math.cos(tiltY);
      const sinP = Math.sin(tiltY);

      const project = (lx: number, ly: number, lz: number) => {
        const x1 = lx * cosY + lz * sinY;
        const z1 = -lx * sinY + lz * cosY;
        const y2 = ly * cosP - z1 * sinP;
        const z2 = ly * sinP + z1 * cosP;
        const perspective = 1200;
        const scale = perspective / (perspective + z2);
        return { x: cx + x1 * scale, y: cy + y2 * scale, scale, z: z2 };
      };

      const n1 = project(-bondLength, 0, 0);
      const n2 = project(bondLength, 0, 0);

      // Bond between the two nuclei (double bond - two parallel lines)
      // Lower opacity since the molecule is now ambient backdrop rather
      // than focal element.
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.08)';
      ctx.lineWidth = 1;
      const bondOffset = 10;
      ctx.beginPath();
      ctx.moveTo(n1.x, n1.y - bondOffset);
      ctx.lineTo(n2.x, n2.y - bondOffset);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(n1.x, n1.y + bondOffset);
      ctx.lineTo(n2.x, n2.y + bondOffset);
      ctx.stroke();

      type Nucleus = {
        x: number;
        y: number;
        scale: number;
        z: number;
        color: string;
      };

      const drawNucleus = (nucleus: Nucleus, originLocal: [number, number, number]) => {
        const ringCount = 3;
        for (let r = 0; r < ringCount; r++) {
          const ringAngle = (Math.PI / ringCount) * r + rotation * (r === 1 ? -1 : 1);
          const samples = 80;
          ctx.beginPath();
          for (let s = 0; s <= samples; s++) {
            const ang = (Math.PI * 2 * s) / samples;
            const lx = Math.cos(ang) * baseRadius;
            const ly = Math.sin(ang) * baseRadius * 0.35;
            const rx = lx * Math.cos(ringAngle) - ly * Math.sin(ringAngle);
            const ry = lx * Math.sin(ringAngle) + ly * Math.cos(ringAngle);
            const wx = originLocal[0] + rx;
            const wy = originLocal[1] + ry;
            const wz =
              originLocal[2] +
              (Math.sin(ang) * Math.cos(ringAngle) -
                Math.cos(ang) * Math.sin(ringAngle)) *
                baseRadius *
                0.35;
            const p = project(wx, wy, wz);
            if (s === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          }
          // Lower opacity so orbital rings are present but not assertive
          ctx.strokeStyle = nucleus.color + ', 0.10)';
          ctx.lineWidth = 0.6;
          ctx.stroke();

          const electronAng = rotation * (r + 1) * 1.5 + r * 2;
          const lx = Math.cos(electronAng) * baseRadius;
          const ly = Math.sin(electronAng) * baseRadius * 0.35;
          const rx = lx * Math.cos(ringAngle) - ly * Math.sin(ringAngle);
          const ry = lx * Math.sin(ringAngle) + ly * Math.cos(ringAngle);
          const wx = originLocal[0] + rx;
          const wy = originLocal[1] + ry;
          const wz = originLocal[2];
          const p = project(wx, wy, wz);

          // Slightly smaller, dimmer electrons to reduce focal pull
          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 6 * p.scale);
          grad.addColorStop(0, nucleus.color + ', 0.65)');
          grad.addColorStop(0.5, nucleus.color + ', 0.25)');
          grad.addColorStop(1, nucleus.color + ', 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 6 * p.scale, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = nucleus.color + ', 0.7)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.2 * p.scale, 0, Math.PI * 2);
          ctx.fill();
        }

        // Nucleus core - softer glow, smaller hard core
        const coreRadius = baseRadius * 0.22 * nucleus.scale;
        const coreGrad = ctx.createRadialGradient(
          nucleus.x,
          nucleus.y,
          0,
          nucleus.x,
          nucleus.y,
          coreRadius * 4
        );
        coreGrad.addColorStop(0, nucleus.color + ', 0.4)');
        coreGrad.addColorStop(0.4, nucleus.color + ', 0.12)');
        coreGrad.addColorStop(1, nucleus.color + ', 0)');
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(nucleus.x, nucleus.y, coreRadius * 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = nucleus.color + ', 0.55)';
        ctx.beginPath();
        ctx.arc(nucleus.x, nucleus.y, coreRadius, 0, Math.PI * 2);
        ctx.fill();
      };

      const pairs = [
        { proj: n1, local: [-bondLength, 0, 0] as [number, number, number], color: 'rgba(34, 211, 238' },
        { proj: n2, local: [bondLength, 0, 0] as [number, number, number], color: 'rgba(139, 92, 246' },
      ].sort((a, b) => b.proj.z - a.proj.z);

      for (const p of pairs) {
        drawNucleus(
          { x: p.proj.x, y: p.proj.y, scale: p.proj.scale, z: p.proj.z, color: p.color },
          p.local
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

        <section className="min-h-screen relative flex flex-col justify-center px-8 md:px-16">
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
              <span className="ml-2">O₂ - Foundational</span>
            </div>
          </div>

          <div
            className="reveal reveal-2 mx-auto wordmark-shadow relative"
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

          <div className="reveal reveal-3 mt-12 max-w-3xl mx-auto text-center px-4 relative">
            <p className="serif italic text-3xl md:text-4xl lg:text-5xl leading-[1.05] opacity-95 wordmark-shadow">
              Software for industries
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
                    /01 - Premise
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
                      practice, healthcare, infrastructural data - domains
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
                    /02 - Domains
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
                    /03 - Method
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
                      body="Headquartered in Melbourne. Compliant with Australian regulatory frameworks from day one. Data residency is not a setting - it is the default."
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
                    /04 - Contact
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
                <span>System operational - Melbourne {time}</span>
              </div>
              <div className="mono text-xs tracking-widest uppercase opacity-40">
                © {new Date().getFullYear()} - All ventures reserved
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