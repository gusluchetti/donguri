import { Html } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type { Mesh, PointLight } from "three";
import { DoubleSide, MathUtils, Shape } from "three";
import {
  handleToSerial,
  PLAN_ACCENT,
  PLAN_GRADIENTS,
  PlanLandscape,
  RangerPassCard,
} from "./RangerPassCard";

const ACORN_PATH =
  "M232,104a56.06,56.06,0,0,0-56-56H136a24,24,0,0,1,24-24,8,8,0,0,0,0-16,40,40,0,0,0-40,40H80a56.06,56.06,0,0,0-56,56,16,16,0,0,0,8,13.83V128c0,35.53,33.12,62.12,59.74,83.49C103.66,221.07,120,234.18,120,240a8,8,0,0,0,16,0c0-5.82,16.34-18.93,28.26-28.51C190.88,190.12,224,163.53,224,128V117.83A16,16,0,0,0,232,104ZM80,64h96a40.06,40.06,0,0,1,40,40H40A40,40,0,0,1,80,64Zm74.25,135c-10.62,8.52-20,16-26.25,23.37-6.25-7.32-15.63-14.85-26.25-23.37C77.8,179.79,48,155.86,48,128v-8H208v8C208,155.86,178.2,179.79,154.25,199Z";

const PLAN_COLOR: Record<string, string> = {
  monthly: "#225a3a",
  annual: "#4d3418",
  lifetime: "#3a2050",
};

const CARD_W = 2.8;
const CARD_H = CARD_W * (53.98 / 85.6);

// Flat rounded-rectangle shape — no sides, no dark edges
const CARD_RADIUS = 0.08;
const cardShape = (() => {
  const s = new Shape();
  const hw = CARD_W / 2,
    hh = CARD_H / 2,
    r = CARD_RADIUS;
  s.moveTo(-hw + r, -hh);
  s.lineTo(hw - r, -hh);
  s.quadraticCurveTo(hw, -hh, hw, -hh + r);
  s.lineTo(hw, hh - r);
  s.quadraticCurveTo(hw, hh, hw - r, hh);
  s.lineTo(-hw + r, hh);
  s.quadraticCurveTo(-hw, hh, -hw, hh - r);
  s.lineTo(-hw, -hh + r);
  s.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  return s;
})();

// distanceFactor=1.5 → 1 Three.js unit = 400/1.5 ≈ 266.67 CSS px
const DISTANCE_FACTOR = 1.5;
const pxW = CARD_W * (400 / DISTANCE_FACTOR);
const pxH = CARD_H * (400 / DISTANCE_FACTOR);
const designScale = pxW / 280;

function CardMesh({
  plan,
  handle,
  pointer,
}: {
  plan: string;
  handle: string;
  pointer: { x: number; y: number };
}) {
  const meshRef = useRef<Mesh>(null);
  const lightRef = useRef<PointLight>(null);
  const rotX = useRef(0);
  const rotY = useRef(0);
  const { invalidate } = useThree();

  const baseColor = PLAN_COLOR[plan] ?? PLAN_COLOR.monthly;
  const accent = PLAN_ACCENT[plan] ?? PLAN_ACCENT.monthly;
  const gradient = PLAN_GRADIENTS[plan] ?? PLAN_GRADIENTS.monthly;
  const serial = handleToSerial(handle);

  useFrame(() => {
    if (!meshRef.current) return;
    const targetX = -pointer.y * 0.2;
    const targetY = pointer.x * 0.2;
    const newRotX = MathUtils.lerp(rotX.current, targetX, 0.1);
    const newRotY = MathUtils.lerp(rotY.current, targetY, 0.1);

    // Only dirty the frame if something actually changed
    if (Math.abs(newRotX - rotX.current) > 0.0001 || Math.abs(newRotY - rotY.current) > 0.0001) {
      rotX.current = newRotX;
      rotY.current = newRotY;
      meshRef.current.rotation.x = rotX.current;
      meshRef.current.rotation.y = rotY.current;

      if (lightRef.current) {
        lightRef.current.position.x = MathUtils.lerp(
          lightRef.current.position.x,
          pointer.x * 1.5,
          0.08,
        );
        lightRef.current.position.y = MathUtils.lerp(
          lightRef.current.position.y,
          pointer.y * 1.0,
          0.08,
        );
      }
      invalidate();
    }
  });

  return (
    <mesh ref={meshRef}>
      <shapeGeometry args={[cardShape]} />
      <meshStandardMaterial color={baseColor} metalness={0.35} roughness={0.35} side={DoubleSide} />

      <Html
        transform
        distanceFactor={DISTANCE_FACTOR}
        position={[0, 0, 0.001]}
        style={{ width: pxW, height: pxH, overflow: "hidden", pointerEvents: "none" }}
        zIndexRange={[0, 0]}
      >
        <div
          style={{
            width: 280,
            height: 178,
            position: "relative",
            overflow: "hidden",
            borderRadius: 8,
            background: gradient,
            transform: `scale(${designScale})`,
            transformOrigin: "0 0",
            backfaceVisibility: "hidden",
          }}
        >
          <PlanLandscape plan={plan} accent={accent} />

          <div
            style={{
              position: "relative",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              padding: "14px",
              fontFamily: "inherit",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-display, serif)",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  color: accent,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 256 256"
                  width={13}
                  height={13}
                  fill={accent}
                  aria-hidden="true"
                >
                  <path d={ACORN_PATH} />
                </svg>
                RANGER PASS
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono, monospace)",
                  fontSize: "0.6rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  borderRadius: 2,
                  padding: "1px 6px",
                  border: `1px solid ${accent}40`,
                  background: `${accent}10`,
                  color: accent,
                }}
              >
                {plan}
              </span>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-body, sans-serif)",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.9)",
                  maxWidth: 160,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {handle.replace(/\.bsky\.social$/, "")}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono, monospace)",
                  fontSize: "0.6rem",
                  letterSpacing: "0.08em",
                  color: `${accent}99`,
                }}
              >
                {serial}
              </span>
            </div>
          </div>
        </div>
      </Html>

      <pointLight ref={lightRef} position={[0, 0, 3]} intensity={1.2} color={accent} distance={5} />
    </mesh>
  );
}

function Scene({
  plan,
  handle,
  onReady,
  dpr,
}: {
  plan: string;
  handle: string;
  onReady: () => void;
  dpr: [number, number];
}) {
  const [pointer, setPointer] = useState({ x: 0, y: 0 });

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPointer({
      x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
    });
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (!touch) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPointer({
      x: ((touch.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((touch.clientY - rect.top) / rect.height) * 2 + 1,
    });
  };

  return (
    <div
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setPointer({ x: 0, y: 0 })}
      onTouchMove={handleTouchMove}
      onTouchEnd={() => setPointer({ x: 0, y: 0 })}
      style={{ width: "100%", height: "100%" }}
    >
      <Canvas
        camera={{ position: [0, 0, 3], fov: 40 }}
        gl={{ alpha: true, antialias: true }}
        dpr={dpr}
        frameloop="demand"
        style={{ background: "transparent" }}
        onCreated={() => {
          // Wait for the Html overlay to actually paint before crossfading
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              onReady();
            });
          });
        }}
      >
        <ambientLight intensity={0.6} color="#ffe8cc" />
        <directionalLight position={[2, 3, 4]} intensity={0.6} color="#ffffff" />
        <CardMesh plan={plan} handle={handle} pointer={pointer} />
      </Canvas>
    </div>
  );
}

export default function RangerPassCard3D({
  handle,
  plan,
  maxWidth = 280,
  dpr = [1, 2] as [number, number],
}: {
  handle: string;
  plan: string;
  maxWidth?: number;
  dpr?: [number, number];
}) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);

  useEffect(() => {
    setMounted(true);
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  // At small sizes 3D adds nothing and wastes GPU
  const use3D = mounted && !reducedMotion && maxWidth >= 180;

  return (
    <div
      style={{
        width: "100%",
        maxWidth,
        aspectRatio: "85.6 / 53.98",
        position: "relative",
      }}
    >
      {/* Flat card underneath — fades out when 3D canvas is ready */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: use3D && canvasReady ? 0 : 1,
          transition: use3D ? "opacity 400ms ease" : "none",
          pointerEvents: "none",
        }}
      >
        <RangerPassCard handle={handle} plan={plan} maxWidth={maxWidth} />
      </div>

      {use3D && (
        <div
          style={{
            position: "absolute",
            // Extended beyond card bounds so the tilted card never clips at canvas edges
            inset: "-12%",
            opacity: canvasReady ? 1 : 0,
            transition: "opacity 400ms ease",
          }}
        >
          <Scene plan={plan} handle={handle} onReady={() => setCanvasReady(true)} dpr={dpr} />
        </div>
      )}
    </div>
  );
}
