"use client";

/**
 * InkCanvas — Codex's signature ambient backdrop.
 *
 * A slow, domain-warped fbm flow field ("ink diffusing in water") tinted by the
 * current accent. Rendered at half CSS resolution (never above) and ~20fps;
 * pauses while the window is hidden or not focused (`window` blur/focus —
 * every glass surface above re-blurs on each frame, so an idle window should
 * not animate) and when reduced-motion is requested. Texture comes from a full-resolution
 * `.grain` overlay on the wrapper, not from the shader (upsampled shader grain
 * reads as JPEG blocks).
 *
 * Lifecycle: the GL context, program and buffer are created once per mounted
 * canvas. Theme changes are picked up by a MutationObserver on `<html>` (where
 * the theme lives); they and intensity changes only re-resolve tokens and
 * crossfade the colour uniforms over 600ms — the context is never thrown away
 * while the canvas is still in the document.
 *
 * Main window extras: a soft cursor light (+4% luminance, 240px radius) that
 * trails the pointer. Off for `still` canvases and under reduced motion.
 *
 * Adapted from 21st.dev "Background Gradient Shader" (ChromaTide) and
 * "Grain Gradient" (Paper Shaders, Apache-2.0).
 */

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface InkCanvasProps {
  className?: string;
  /** 0–1 how visible the accent ink is. */
  intensity?: number;
  /** Disable animation (renders a single still frame). */
  still?: boolean;
  /** Pointer-following light. Defaults to on for animated canvases. */
  cursorLight?: boolean;
  /** Full-resolution paper grain overlay (`.grain`). Default true. */
  grain?: boolean;
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
uniform vec3 u_mouse;   // xy: pointer in canvas px (GL origin), z: 0–1 amount
uniform float u_radius; // cursor light radius in canvas px

float hash21(vec2 p) {
  p = fract(p * vec2(419.2, 371.9));
  p += dot(p, p + 19.19);
  return fract(p.x * p.y);
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
  f = clamp(0.5 + (f - 0.5) * 1.25, 0.0, 1.0);

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

  // Cursor light — a quiet +4% luminance lift around the pointer.
  float glow = u_mouse.z * smoothstep(u_radius, 0.0, distance(gl_FragCoord.xy, u_mouse.xy));
  col += 0.04 * glow * glow * (3.0 - 2.0 * glow);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

type RGB = [number, number, number];

interface Palette {
  base: RGB;
  ink: RGB;
  deep: RGB;
  intensity: number;
  light: number;
}

const FALLBACK_BASE: RGB = [0.047, 0.047, 0.055];
const FALLBACK_ACCENT: RGB = [0.04, 0.52, 1];
const CROSSFADE_MS = 600;
const RADIUS_PX = 240;
const MOUSE_LERP = 0.08;
const FRAME_MS = 1000 / 20;
const STILL_TIME = 12.0;

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

const mixRGB = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const mixPalette = (a: Palette, b: Palette, t: number): Palette => ({
  base: mixRGB(a.base, b.base, t),
  ink: mixRGB(a.ink, b.ink, t),
  deep: mixRGB(a.deep, b.deep, t),
  intensity: lerp(a.intensity, b.intensity, t),
  light: lerp(a.light, b.light, t),
});

const samePalette = (a: Palette, b: Palette) => {
  const d = (x: RGB, y: RGB) => Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]);
  return (
    d(a.base, b.base) + d(a.ink, b.ink) + d(a.deep, b.deep) < 0.002 &&
    Math.abs(a.intensity - b.intensity) < 0.001 &&
    a.light === b.light
  );
};

const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

/**
 * Tokens resolve through `host`, which inherits from `<html>` (where theme
 * attributes live) and from any themed ancestor.
 */
function resolvePalette(host: HTMLElement, intensity: number): Palette {
  const base = resolveColor(host, "--canvas", FALLBACK_BASE);
  const accent = resolveColor(host, "--accent-brand", FALLBACK_ACCENT);
  const lum = 0.2126 * base[0] + 0.7152 * base[1] + 0.0722 * base[2];
  const isLight = lum > 0.5;
  // Light: a visible but quiet 6–8% luminance swing in the ink pools.
  const ink = isLight ? mixRGB(base, accent, 0.6) : mixRGB(base, accent, 0.62);
  const deep = isLight ? mixRGB(base, [1, 1, 1], 0.5) : mixRGB(base, [0, 0, 0], 0.55);
  return { base, ink, deep, intensity, light: isLight ? 1 : 0 };
}

interface InkApi {
  /** Re-read tokens; crossfade unless `instant`. */
  refresh: (instant?: boolean) => void;
  /** Re-evaluate the animation loop (after `still` / `cursorLight` change). */
  sync: () => void;
}

export function InkCanvas({
  className,
  intensity = 0.32,
  still = false,
  cursorLight,
  grain = true,
}: InkCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const apiRef = useRef<InkApi | null>(null);
  const optsRef = useRef({ intensity, still, cursor: cursorLight ?? !still });

  /* ── Mount once: GL context, program, buffer, loop ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const reducedMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mountedAt = performance.now();
    // Animation clock (ms). Advances only while animating, so pausing on blur
    // freezes the field where it is instead of snapping to the still frame.
    let clock = 0;
    let lastTick: number | null = null;

    let gl: WebGLRenderingContext | null = null;
    let program: WebGLProgram | null = null;
    let buf: WebGLBuffer | null = null;
    let u: Record<
      "res" | "time" | "base" | "ink" | "deep" | "intensity" | "light" | "mouse" | "radius",
      WebGLUniformLocation | null
    > | null = null;
    let scale = 1;

    let current = resolvePalette(wrap, optsRef.current.intensity);
    let tween: { from: Palette; to: Palette; start: number } | null = null;

    // Pointer state in CSS px relative to the viewport.
    const target = { x: -9999, y: -9999, amt: 0 };
    const mouse = { x: -9999, y: -9999, amt: 0 };

    let raf = 0;
    let last = 0;
    let refreshRaf = 0;
    // Window focus: an unfocused (but visible) window holds a still frame.
    let focused = document.hasFocus();

    const animating = () => !optsRef.current.still && !reducedMq.matches && focused;
    const cursorOn = () => optsRef.current.cursor && animating();

    const applyPalette = (p: Palette) => {
      if (!gl || !u) return;
      gl.uniform3f(u.base, ...p.base);
      gl.uniform3f(u.ink, ...p.ink);
      gl.uniform3f(u.deep, ...p.deep);
      gl.uniform1f(u.intensity, p.intensity);
      gl.uniform1f(u.light, p.light);
    };

    const init = (): boolean => {
      gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
      if (!gl || gl.isContextLost()) return false;
      const g = gl;

      const compile = (type: number, src: string) => {
        const s = g.createShader(type)!;
        g.shaderSource(s, src);
        g.compileShader(s);
        return s;
      };
      const prog = g.createProgram()!;
      const vs = compile(g.VERTEX_SHADER, VERT);
      const fs = compile(g.FRAGMENT_SHADER, FRAG);
      g.attachShader(prog, vs);
      g.attachShader(prog, fs);
      g.linkProgram(prog);
      g.deleteShader(vs);
      g.deleteShader(fs);
      if (!g.getProgramParameter(prog, g.LINK_STATUS)) {
        g.deleteProgram(prog);
        return false;
      }
      program = prog;
      g.useProgram(prog);

      buf = g.createBuffer();
      g.bindBuffer(g.ARRAY_BUFFER, buf);
      g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
      const loc = g.getAttribLocation(prog, "a_pos");
      g.enableVertexAttribArray(loc);
      g.vertexAttribPointer(loc, 2, g.FLOAT, false, 0, 0);

      u = {
        res: g.getUniformLocation(prog, "u_res"),
        time: g.getUniformLocation(prog, "u_time"),
        base: g.getUniformLocation(prog, "u_base"),
        ink: g.getUniformLocation(prog, "u_ink"),
        deep: g.getUniformLocation(prog, "u_deep"),
        intensity: g.getUniformLocation(prog, "u_intensity"),
        light: g.getUniformLocation(prog, "u_light"),
        mouse: g.getUniformLocation(prog, "u_mouse"),
        radius: g.getUniformLocation(prog, "u_radius"),
      };
      // Force the size + resolution uniforms to be (re)written.
      canvas.width = 0;
      canvas.height = 0;
      applyPalette(current);
      g.uniform3f(u.mouse, -9999, -9999, 0);
      return true;
    };

    const resize = () => {
      if (!gl || !u) return;
      const rect = canvas.getBoundingClientRect();
      // Half CSS resolution, capped — the field is soft; grain lives in the CSS
      // overlay. Hi-DPI screens don't buy anything here but fill-rate.
      scale = Math.min(window.devicePixelRatio || 1, 1) * 0.5;
      const w = Math.max(1, Math.round(rect.width * scale));
      const h = Math.max(1, Math.round(rect.height * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
        gl.uniform2f(u.res, w, h);
        gl.uniform1f(u.radius, RADIUS_PX * scale);
      }
    };

    /** Draws one frame; returns true while a transition still needs frames. */
    const draw = (now: number): boolean => {
      if (!gl || !u || gl.isContextLost()) return false;
      resize();

      let busy = false;
      if (tween) {
        const k = Math.min(1, (now - tween.start) / CROSSFADE_MS);
        current = mixPalette(tween.from, tween.to, easeInOut(k));
        applyPalette(current);
        if (k >= 1) tween = null;
        else busy = true;
      }

      if (cursorOn()) {
        mouse.x = lerp(mouse.x, target.x, MOUSE_LERP);
        mouse.y = lerp(mouse.y, target.y, MOUSE_LERP);
        mouse.amt = lerp(mouse.amt, target.amt, MOUSE_LERP);
        // Snap instead of easing in from off-screen on first entry.
        if (mouse.amt < 0.01) {
          mouse.x = target.x;
          mouse.y = target.y;
        }
      } else {
        mouse.amt = 0;
      }
      const rect = canvas.getBoundingClientRect();
      gl.uniform3f(
        u.mouse,
        (mouse.x - rect.left) * scale,
        (rect.bottom - mouse.y) * scale,
        mouse.amt,
      );

      if (animating()) {
        if (lastTick !== null) clock += Math.max(0, now - lastTick);
        lastTick = now;
      } else {
        lastTick = null;
      }
      const t = (clock / 1000) * 0.35 + STILL_TIME;
      gl.uniform1f(u.time, t);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return busy;
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < FRAME_MS) return;
      last = now;
      draw(now);
    };

    /** Frames on demand (still canvases, reduced motion) until a crossfade ends. */
    const pump = (now: number) => {
      raf = draw(now) ? requestAnimationFrame(pump) : 0;
    };

    const sync = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      if (document.hidden || !gl) return;
      if (animating()) raf = requestAnimationFrame(loop);
      else raf = requestAnimationFrame(pump);
    };

    const refresh = (instant = false) => {
      // Defer one frame: parent effects (which mirror theme attributes onto
      // <html>) run after this component's effects in the same commit.
      cancelAnimationFrame(refreshRaf);
      refreshRaf = requestAnimationFrame((now) => {
        const next = resolvePalette(wrap, optsRef.current.intensity);
        if (samePalette(next, tween?.to ?? current)) return;
        if (instant || now - mountedAt < 400) {
          tween = null;
          current = next;
          applyPalette(current);
        } else {
          tween = { from: current, to: next, start: now };
        }
        if (!animating() || raf === 0) sync();
      });
    };

    apiRef.current = { refresh, sync };

    /* Context-loss resilience (GPU reset, driver update). */
    const onLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(raf);
      raf = 0;
      program = null;
      buf = null;
      u = null;
    };
    const onRestored = () => {
      if (init()) sync();
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);

    /* Pointer → cursor light. The canvas itself is pointer-events-none. */
    const onMove = (e: PointerEvent) => {
      target.x = e.clientX;
      target.y = e.clientY;
      target.amt = 1;
    };
    const onOut = (e: PointerEvent) => {
      if (!e.relatedTarget) target.amt = 0;
    };
    const onBlur = () => {
      target.amt = 0;
      focused = false;
      sync();
    };
    const onFocus = () => {
      focused = true;
      sync();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerout", onOut, { passive: true });
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);

    /* Theme changes: attributes and custom-accent vars live on <html>. */
    const mo = new MutationObserver(() => refresh());
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-accent", "data-appearance", "data-tint", "style", "class"],
    });

    const ro = new ResizeObserver(() => draw(performance.now()));
    ro.observe(canvas);

    const onVis = () => sync();
    document.addEventListener("visibilitychange", onVis);
    reducedMq.addEventListener("change", sync);

    if (init()) {
      draw(performance.now());
      sync();
    }

    return () => {
      apiRef.current = null;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(refreshRaf);
      ro.disconnect();
      mo.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      reducedMq.removeEventListener("change", sync);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerout", onOut);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      const g = gl;
      if (g && !g.isContextLost()) {
        if (buf) g.deleteBuffer(buf);
        if (program) g.deleteProgram(program);
      }
      // Only release the context once the canvas has actually left the
      // document. A remount on the same <canvas> (Strict Mode, Fast Refresh)
      // must keep a live context, or it renders white.
      setTimeout(() => {
        if (!canvas.isConnected && g && !g.isContextLost()) {
          g.getExtension("WEBGL_lose_context")?.loseContext();
        }
      }, 0);
    };
  }, []);

  /* ── Accent / appearance / intensity: re-resolve + crossfade ── */
  useEffect(() => {
    optsRef.current.intensity = intensity;
    apiRef.current?.refresh();
  }, [intensity]);

  /* ── Loop mode ── */
  useEffect(() => {
    optsRef.current.still = still;
    optsRef.current.cursor = cursorLight ?? !still;
    apiRef.current?.sync();
  }, [still, cursorLight]);

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      className={cn("pointer-events-none relative h-full w-full", grain && "grain", className)}
    >
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
    </div>
  );
}

export default InkCanvas;
