"use client";

/**
 * InkCanvas — Codex's signature ambient backdrop.
 *
 * A slow, domain-warped fbm flow field ("ink diffusing in water") tinted by the
 * current accent, printed with fine film grain. Rendered at reduced resolution
 * and ~24fps; pauses when hidden and when reduced-motion is requested.
 *
 * Adapted from 21st.dev "Background Gradient Shader" (ChromaTide) and
 * "Grain Gradient" (Paper Shaders, Apache-2.0).
 */

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface InkCanvasProps {
  className?: string;
  /** Changing these re-reads the CSS tokens (accent / appearance / tint). */
  accentKey?: string;
  /** 0–1 how visible the accent ink is. */
  intensity?: number;
  /** Disable animation (renders a single still frame). */
  still?: boolean;
}

const VERT = `attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FRAG = `precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_base;
uniform vec3 u_ink;
uniform vec3 u_deep;
uniform float u_intensity;
uniform float u_light;

float hash21(vec2 p) {
  p = fract(p * vec2(419.2, 371.9));
  p += dot(p, p + 19.19);
  return fract(p.x * p.y);
}
float grainHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = p * 2.07 + 5.3;
    a *= 0.5;
  }
  return s;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0) * 0.9;
  float t = u_time;
  p += vec2(t * 0.018, -t * 0.012);

  // Two-level domain warp — ink curling through water.
  vec2 q = vec2(fbm(p + t * 0.03), fbm(p - t * 0.025 + 7.1));
  vec2 r = vec2(fbm(p + 2.2 * q + vec2(1.7, 9.2) + t * 0.02),
                fbm(p + 2.2 * q + vec2(8.3, 2.8) - t * 0.018));
  float f = fbm(p + 2.6 * r);
  f = clamp(0.5 + (f - 0.5) * 1.5, 0.0, 1.0);

  // Ink pools concentrate toward the upper-left and lower-right like light.
  float bias = smoothstep(1.25, 0.0, length(uv - vec2(0.08, 1.05)))
             + 0.6 * smoothstep(1.1, 0.0, length(uv - vec2(1.0, -0.05)));
  float ink = smoothstep(0.3, 1.0, f) * (0.15 + 0.85 * bias);

  vec3 col = mix(u_base, u_deep, (1.0 - smoothstep(0.2, 0.8, f)) * 0.3);
  col = mix(col, u_ink, ink * u_intensity);

  // Fine veins where the warp folds over itself.
  float vein = smoothstep(0.012, 0.0, abs(fract(f * 6.0 + length(r)) - 0.5) - 0.48);
  col = mix(col, u_ink, vein * 0.025 * u_intensity);

  // Vignette (darkens in dark mode, lifts nothing in light).
  float vd = length(uv - 0.5) * 1.3;
  col *= mix(1.0, 1.0 - 0.28 * smoothstep(0.4, 1.1, vd), 1.0 - u_light);

  // Film grain.
  float g = grainHash(gl_FragCoord.xy + fract(t) * 91.0) - 0.5;
  col += g * mix(0.018, 0.012, u_light);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

type RGB = [number, number, number];

function resolveColor(el: HTMLElement, cssVar: string, fallback: RGB): RGB {
  const probe = document.createElement("span");
  probe.style.color = `var(${cssVar})`;
  probe.style.display = "none";
  el.appendChild(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  const nums = value.match(/[\d.]+/g)?.map(Number);
  if (!nums || nums.length < 3) return fallback;
  // "color(srgb r g b)" reports 0–1, "rgb(r, g, b)" reports 0–255
  if (value.startsWith("color(")) return [nums[0], nums[1], nums[2]];
  return [nums[0] / 255, nums[1] / 255, nums[2] / 255];
}

const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

export function InkCanvas({ className, accentKey, intensity = 0.42, still = false }: InkCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const program = gl.createProgram()!;
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const u = {
      res: gl.getUniformLocation(program, "u_res"),
      time: gl.getUniformLocation(program, "u_time"),
      base: gl.getUniformLocation(program, "u_base"),
      ink: gl.getUniformLocation(program, "u_ink"),
      deep: gl.getUniformLocation(program, "u_deep"),
      intensity: gl.getUniformLocation(program, "u_intensity"),
      light: gl.getUniformLocation(program, "u_light"),
    };

    // Colors come from tokens on the nearest themed ancestor.
    const host = canvas.parentElement ?? document.body;
    const base = resolveColor(host, "--canvas", [0.047, 0.047, 0.055]);
    const accent = resolveColor(host, "--accent-brand", [0.04, 0.52, 1]);
    const lum = 0.2126 * base[0] + 0.7152 * base[1] + 0.0722 * base[2];
    const isLight = lum > 0.5;
    const ink = isLight ? mix(base, accent, 0.55) : mix(base, accent, 0.62);
    const deep = isLight ? mix(base, [1, 1, 1], 0.5) : mix(base, [0, 0, 0], 0.55);
    gl.uniform3f(u.base, ...base);
    gl.uniform3f(u.ink, ...ink);
    gl.uniform3f(u.deep, ...deep);
    gl.uniform1f(u.intensity, intensity * (isLight ? 0.6 : 1));
    gl.uniform1f(u.light, isLight ? 1 : 0);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      // Render at half resolution — the field is soft, grain is fine at 0.5x.
      const scale = Math.min(window.devicePixelRatio || 1, 2) * 0.5;
      const w = Math.max(1, Math.round(rect.width * scale));
      const h = Math.max(1, Math.round(rect.height * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
        gl.uniform2f(u.res, w, h);
      }
    };

    const start = performance.now();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animate = !still && !reduced;
    let raf = 0;
    let last = 0;
    const FRAME = 1000 / 24;

    const draw = (now: number) => {
      resize();
      gl.uniform1f(u.time, ((now - start) / 1000) * 0.35 + 12.0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < FRAME) return;
      last = now;
      draw(now);
    };

    const ro = new ResizeObserver(() => draw(performance.now()));
    ro.observe(canvas);
    draw(performance.now());
    if (animate) raf = requestAnimationFrame(loop);

    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && animate) raf = requestAnimationFrame(loop);
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      gl.deleteBuffer(buf);
      gl.deleteProgram(program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [accentKey, intensity, still]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn("pointer-events-none block h-full w-full", className)}
    />
  );
}

export default InkCanvas;
