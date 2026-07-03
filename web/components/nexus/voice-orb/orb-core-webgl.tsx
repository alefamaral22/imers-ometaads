'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Núcleo do VoiceOrb em WebGL: um GLOBO DE NEURÔNIOS — nós distribuídos numa esfera, ligados por
 * "fios" (linhas) — girando sobre um centro branco-quente com bloom ciano. É o "cérebro com fios" do
 * print. Geometria real (LINES + POINTS), não SDF por pixel: leve e nítido. A energia (áudio do
 * usuário/IA OU agentes trabalhando) acelera a rotação e faz os neurônios "dispararem" (brilho pulsa e
 * viaja pelos fios).
 *
 * Guardas: trava de FPS (~30), DPR ≤ 2, pausa em aba oculta (Page Visibility), e fallback CSS estático
 * para prefers-reduced-motion / ausência de WebGL. Decorativo: aria-hidden.
 */

const TARGET_FRAME_MS = 1000 / 30;
const PROJ = 0.74; // raio do globo em NDC (deixa folga para o bloom)

// ── shaders ────────────────────────────────────────────────────────────────
const QUAD_VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos; gl_Position = vec4(aPos, 0.0, 1.0); }`;

// centro branco-quente PEQUENO e suave + halo ciano amplo (não um disco chapado)
const CORE_FRAG = `
precision mediump float;
varying vec2 vUv;
uniform float uEnergy;
void main() {
  float r = length(vUv);
  float hot = smoothstep(0.17 + 0.06 * uEnergy, 0.0, r);   // núcleo branco intenso
  float glow = exp(-r * r * 2.4) * (0.5 + 0.8 * uEnergy);   // halo ciano que vaza largo
  float ball = smoothstep(0.76, 0.04, r) * (0.10 + 0.12 * uEnergy); // volume ciano DENTRO do globo
  vec3 col = mix(vec3(0.18, 0.74, 1.0), vec3(1.0, 1.0, 1.0), hot);
  col += vec3(0.10, 0.50, 0.95) * ball;
  float a = clamp(hot * 0.95 + glow * 0.85 + ball, 0.0, 1.0);
  gl_FragColor = vec4(col * (0.7 + 0.5 * uEnergy), a);
}`;

const GRAPH_VERT = `
attribute vec2 aPos;
attribute float aShade;   // 0 (fundo) .. 1 (frente do globo)
attribute float aGlow;    // intensidade do neurônio / fio
varying float vShade;
varying float vGlow;
uniform float uPointScale;
void main() {
  vShade = aShade;
  vGlow = aGlow;
  gl_Position = vec4(aPos, 0.0, 1.0);
  gl_PointSize = (1.4 + 5.0 * aShade) * uPointScale;
}`;

const GRAPH_FRAG = `
precision mediump float;
varying float vShade;
varying float vGlow;
uniform int uIsPoint;
void main() {
  vec3 c = mix(vec3(0.12, 0.62, 1.0), vec3(0.90, 0.99, 1.0), vShade);
  float a = 1.0;
  if (uIsPoint == 1) {
    float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
    a = smoothstep(1.0, 0.0, d);
    a *= a;
  }
  // queda de profundidade: trás mais apagada, frente brilhante → lê como esfera girando
  float depth = 0.22 + 0.85 * vShade;
  float bright = vGlow * depth * 1.9;
  gl_FragColor = vec4(c * bright, a * bright);
}`;

// ── geometria do globo ───────────────────────────────────────────────────────
interface Sphere {
  n: number;
  base: Float32Array; // x,y,z por nó (achatado)
  phase: Float32Array;
  edges: Array<[number, number]>;
}

function buildSphere(n: number, k: number): Sphere {
  const base = new Float32Array(n * 3);
  const phase = new Float32Array(n);
  const pts: Array<[number, number, number]> = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2; // 1 .. -1
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    const x = Math.cos(theta) * rad;
    const z = Math.sin(theta) * rad;
    base[i * 3] = x;
    base[i * 3 + 1] = y;
    base[i * 3 + 2] = z;
    phase[i] = i * 1.3;
    pts.push([x, y, z]);
  }
  // liga cada nó aos k vizinhos mais próximos em 3D (a distância não muda na rotação)
  const seen = new Set<string>();
  const edges: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const pi = pts[i]!;
    const near = pts
      .map((p, j) => ({ j, d: (p[0] - pi[0]) ** 2 + (p[1] - pi[1]) ** 2 + (p[2] - pi[2]) ** 2 }))
      .filter((o) => o.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, k);
    for (const { j } of near) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([i, j]);
    }
  }
  return { n, base, phase, edges };
}

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function link(gl: WebGLRenderingContext, vsSrc: string, fsSrc: string): WebGLProgram | null {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return gl.getProgramParameter(prog, gl.LINK_STATUS) ? prog : null;
}

/** Fallback sem WebGL: globo de fios ESTÁTICO em SVG (ainda parece "cérebro com fios", sem animação). */
export function OrbCoreFallback({ size }: { size: number }) {
  const n = 14;
  const R = 46;
  const nodes = Array.from({ length: n }, (_, i) => {
    const a = i * 2.399963;
    const rad = R * Math.sqrt((i + 0.5) / n);
    return { x: 50 + Math.cos(a) * rad, y: 50 + Math.sin(a) * rad };
  });
  return (
    <svg aria-hidden viewBox="0 0 100 100" style={{ width: size, height: size }}>
      <defs>
        <radialGradient id="orb-fb-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="40%" stopColor="#38e6ff" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
      <circle cx={50} cy={50} r={46} fill="url(#orb-fb-core)" opacity={0.5} />
      {nodes.map((p, i) =>
        nodes.slice(i + 1).map((q, j) => {
          const d = Math.hypot(p.x - q.x, p.y - q.y);
          return d < 34 ? (
            <line
              key={`${i}-${j}`}
              x1={p.x}
              y1={p.y}
              x2={q.x}
              y2={q.y}
              stroke="rgba(56,230,255,0.45)"
              strokeWidth={0.5}
            />
          ) : null;
        }),
      )}
      {nodes.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={1.1} fill="#9af2ff" />
      ))}
      <circle cx={50} cy={50} r={9} fill="#ffffff" opacity={0.9} />
    </svg>
  );
}

export function OrbCoreWebGL({
  size,
  detail,
  levelRef,
  active = false,
}: {
  size: number;
  detail: 'full' | 'min';
  levelRef: { current: number };
  /** Força energia alta (agentes trabalhando / Nexus falando) mesmo sem áudio captado. */
  active?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  const [webgl, setWebgl] = useState(true);

  // espelha props mutáveis em refs — o loop lê sem reconstruir o contexto WebGL
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Reduzir-animações NÃO remove o globo (pedido do produto): só desacelera para um movimento sutil.
    const reduce = Boolean(
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    );
    const gl =
      (canvas.getContext('webgl', {
        alpha: true,
        premultipliedAlpha: false,
        antialias: true,
      }) as WebGLRenderingContext | null) ?? null;
    if (!gl) {
      setWebgl(false);
      return;
    }

    const coreProg = link(gl, QUAD_VERT, CORE_FRAG);
    const graphProg = link(gl, GRAPH_VERT, GRAPH_FRAG);
    if (!coreProg || !graphProg) {
      setWebgl(false);
      return;
    }

    // quad do bloom
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const sphere = buildSphere(detail === 'full' ? 52 : 22, 3);
    const lineBuf = gl.createBuffer();
    const pointBuf = gl.createBuffer();
    // stride 4 floats: x, y, shade, glow
    const lineData = new Float32Array(sphere.edges.length * 2 * 4);
    const pointData = new Float32Array(sphere.n * 4);
    const proj = new Float32Array(sphere.n * 3); // x,y projetados + shade por nó
    const intensity = new Float32Array(sphere.n);

    const uCoreEnergy = gl.getUniformLocation(coreProg, 'uEnergy');
    const aQuad = gl.getAttribLocation(coreProg, 'aPos');
    const gAPos = gl.getAttribLocation(graphProg, 'aPos');
    const gAShade = gl.getAttribLocation(graphProg, 'aShade');
    const gAGlow = gl.getAttribLocation(graphProg, 'aGlow');
    const uPointScale = gl.getUniformLocation(graphProg, 'uPointScale');
    const uIsPoint = gl.getUniformLocation(graphProg, 'uIsPoint');

    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
    const px = Math.round(size * dpr);
    canvas.width = px;
    canvas.height = px;
    gl.viewport(0, 0, px, px);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // aditivo: o brilho soma sobre o fundo escuro

    let energy = 0;
    let angY = 0;
    let angX = 0.4;
    let raf: number | null = null;
    let lastFrame = performance.now();
    let lastTick = lastFrame;
    const startedAt = lastFrame;

    const bindGraph = (buf: WebGLBuffer | null) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(gAPos);
      gl.vertexAttribPointer(gAPos, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(gAShade);
      gl.vertexAttribPointer(gAShade, 1, gl.FLOAT, false, 16, 8);
      gl.enableVertexAttribArray(gAGlow);
      gl.vertexAttribPointer(gAGlow, 1, gl.FLOAT, false, 16, 12);
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - lastTick) / 1000, 0.1);
      lastTick = now;
      if (now - lastFrame < TARGET_FRAME_MS) return; // trava de FPS
      lastFrame = now;
      const t = (now - startedAt) / 1000;

      // energia: áudio ao vivo OU "ativo" (agentes/IA), com respiração de repouso
      const target = Math.max(levelRef.current, activeRef.current ? 0.6 : 0);
      energy += (target - energy) * (target > energy ? 0.3 : 0.05);
      const breath = 0.18 + 0.05 * (0.5 + 0.5 * Math.sin(t * 0.8));
      const e = Math.min(1, breath + 0.85 * energy);

      // gira o globo (mais rápido quando há energia; bem devagar em reduzir-animações)
      angY += dt * (reduce ? 0.04 : 0.15 + 1.1 * e);
      angX += dt * (reduce ? 0.01 : 0.05);
      const cY = Math.cos(angY);
      const sY = Math.sin(angY);
      const cX = Math.cos(angX);
      const sX = Math.sin(angX);

      for (let i = 0; i < sphere.n; i++) {
        const bx = sphere.base[i * 3]!;
        const by = sphere.base[i * 3 + 1]!;
        const bz = sphere.base[i * 3 + 2]!;
        // rotação Y depois X
        const x1 = bx * cY + bz * sY;
        const z1 = -bx * sY + bz * cY;
        const y2 = by * cX - z1 * sX;
        const z2 = by * sX + z1 * cX;
        proj[i * 3] = x1 * PROJ;
        proj[i * 3 + 1] = y2 * PROJ;
        proj[i * 3 + 2] = (z2 + 1) * 0.5; // shade: frente = 1
        // neurônio "disparando": pulso base + spikes que viajam quando há energia
        const ph = sphere.phase[i]!;
        const firing = reduce ? 0 : Math.pow(0.5 + 0.5 * Math.sin(t * 3.0 - ph), 5.0);
        intensity[i] = 0.45 + 0.25 * Math.sin(t * 1.3 + ph) + e * (0.35 + 0.6 * firing);
      }

      // monta buffer das linhas (fios)
      sphere.edges.forEach(([ia, ib], idx) => {
        const o = idx * 8;
        lineData[o] = proj[ia * 3]!;
        lineData[o + 1] = proj[ia * 3 + 1]!;
        lineData[o + 2] = proj[ia * 3 + 2]!;
        lineData[o + 3] = intensity[ia]! * 0.7;
        lineData[o + 4] = proj[ib * 3]!;
        lineData[o + 5] = proj[ib * 3 + 1]!;
        lineData[o + 6] = proj[ib * 3 + 2]!;
        lineData[o + 7] = intensity[ib]! * 0.7;
      });
      // monta buffer dos nós
      for (let i = 0; i < sphere.n; i++) {
        const o = i * 4;
        pointData[o] = proj[i * 3]!;
        pointData[o + 1] = proj[i * 3 + 1]!;
        pointData[o + 2] = proj[i * 3 + 2]!;
        pointData[o + 3] = intensity[i]!;
      }

      gl.clear(gl.COLOR_BUFFER_BIT);

      // 1) bloom/centro
      gl.useProgram(coreProg);
      gl.uniform1f(uCoreEnergy, e);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(aQuad);
      gl.vertexAttribPointer(aQuad, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // 2) fios + nós
      gl.useProgram(graphProg);
      gl.uniform1f(uPointScale, dpr * (0.7 + 0.7 * e));
      gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
      gl.bufferData(gl.ARRAY_BUFFER, lineData, gl.DYNAMIC_DRAW);
      bindGraph(lineBuf);
      gl.uniform1i(uIsPoint, 0);
      gl.drawArrays(gl.LINES, 0, sphere.edges.length * 2);

      gl.bindBuffer(gl.ARRAY_BUFFER, pointBuf);
      gl.bufferData(gl.ARRAY_BUFFER, pointData, gl.DYNAMIC_DRAW);
      bindGraph(pointBuf);
      gl.uniform1i(uIsPoint, 1);
      gl.drawArrays(gl.POINTS, 0, sphere.n);
    };

    const onVisibility = () => {
      if (document.hidden) {
        if (raf !== null) cancelAnimationFrame(raf);
        raf = null;
      } else if (raf === null) {
        lastFrame = performance.now();
        lastTick = lastFrame;
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    raf = requestAnimationFrame(frame);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (raf !== null) cancelAnimationFrame(raf);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      gl.deleteProgram(coreProg);
      gl.deleteProgram(graphProg);
      gl.deleteBuffer(quad);
      gl.deleteBuffer(lineBuf);
      gl.deleteBuffer(pointBuf);
    };
  }, [size, detail, levelRef]);

  if (!webgl) return <OrbCoreFallback size={size} />;

  return (
    <canvas ref={canvasRef} aria-hidden style={{ width: size, height: size, display: 'block' }} />
  );
}
