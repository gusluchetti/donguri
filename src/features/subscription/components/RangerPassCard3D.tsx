import { Float, Html, RoundedBox } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RangerPassCard } from "./RangerPassCard";

const PLAN_COLOR: Record<string, string> = {
  monthly: "#1a3a2a",
  annual: "#2a1a0a",
  lifetime: "#1a1028",
};

const PLAN_ACCENT: Record<string, string> = {
  monthly: "#4ade80",
  annual: "#e8702e",
  lifetime: "#c084fc",
};

// Card dimensions: 85.6:53.98 aspect ratio scaled to scene units
const CARD_W = 2.8;
const CARD_H = CARD_W * (53.98 / 85.6);
const CARD_D = 0.04;

function CardMesh({
  plan,
  handle,
  entriesCount,
  pointer,
}: {
  plan: string;
  handle: string;
  entriesCount: number;
  pointer: { x: number; y: number };
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const rotX = useRef(0);
  const rotY = useRef(0);
  const { size } = useThree();

  const baseColor = PLAN_COLOR[plan] ?? PLAN_COLOR.monthly;
  const accent = PLAN_ACCENT[plan] ?? PLAN_ACCENT.monthly;

  useFrame(() => {
    if (!meshRef.current) return;
    const targetX = -pointer.y * 0.22;
    const targetY = pointer.x * 0.22;
    rotX.current = THREE.MathUtils.lerp(rotX.current, targetX, 0.08);
    rotY.current = THREE.MathUtils.lerp(rotY.current, targetY, 0.08);
    meshRef.current.rotation.x = rotX.current;
    meshRef.current.rotation.y = rotY.current;

    if (lightRef.current) {
      lightRef.current.position.x = THREE.MathUtils.lerp(
        lightRef.current.position.x,
        pointer.x * 3,
        0.06,
      );
      lightRef.current.position.y = THREE.MathUtils.lerp(
        lightRef.current.position.y,
        pointer.y * 2,
        0.06,
      );
    }
  });

  // pixel size of the card in screen space — used by Html to size its overlay
  const pxW = (CARD_W / 3.5) * size.width;
  const pxH = (CARD_H / 3.5) * size.height;

  return (
    <mesh ref={meshRef}>
      <RoundedBox args={[CARD_W, CARD_H, CARD_D]} radius={0.08} smoothness={4}>
        <meshPhysicalMaterial
          color={baseColor}
          metalness={0.6}
          roughness={0.3}
          clearcoat={0.8}
          clearcoatRoughness={0.15}
          reflectivity={0.5}
        />
      </RoundedBox>

      {/* Overlay: preserve flat card's typography exactly */}
      <Html
        transform
        distanceFactor={1.5}
        position={[0, 0, CARD_D / 2 + 0.001]}
        style={{ width: pxW, height: pxH, pointerEvents: "none" }}
        zIndexRange={[0, 0]}
      >
        <div
          style={{
            width: pxW,
            height: pxH,
            position: "relative",
            overflow: "hidden",
            borderRadius: 8,
          }}
        >
          {/* SVG waves from flat card */}
          <svg
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              opacity: 0.12,
            }}
            viewBox="0 0 280 178"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d="M0 140 Q50 120 100 132 T200 122 T280 138 V178 H0Z"
              fill="none"
              stroke={accent}
              strokeWidth="0.6"
            />
            <path
              d="M0 158 Q60 148 120 154 T240 148 T280 156 V178 H0Z"
              fill={accent}
              opacity="0.15"
            />
          </svg>

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
              style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}
            >
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span
                  style={{
                    fontFamily: "var(--font-mono, monospace)",
                    fontSize: "0.6rem",
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    color: `${accent}90`,
                  }}
                >
                  donguri
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-display, serif)",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                    color: accent,
                  }}
                >
                  RANGER PASS
                </span>
              </div>
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
              style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}
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
                  fontVariantNumeric: "tabular-nums",
                  color: `${accent}50`,
                }}
              >
                NO. {String(entriesCount).padStart(4, "0")}
              </span>
            </div>
          </div>
        </div>
      </Html>

      <pointLight ref={lightRef} position={[0, 0, 3]} intensity={2} color={accent} distance={6} />
    </mesh>
  );
}

function Scene({
  plan,
  handle,
  entriesCount,
}: {
  plan: string;
  handle: string;
  entriesCount: number;
}) {
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

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
      ref={canvasRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setPointer({ x: 0, y: 0 })}
      onTouchMove={handleTouchMove}
      onTouchEnd={() => setPointer({ x: 0, y: 0 })}
      style={{ width: "100%", height: "100%" }}
    >
      <Canvas
        camera={{ position: [0, 0, 3.5], fov: 40 }}
        gl={{ alpha: true, antialias: true }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.4} color="#ffe8cc" />
        <directionalLight position={[2, 3, 4]} intensity={0.6} color="#ffffff" />
        <Float speed={1.5} rotationIntensity={0.3} floatIntensity={0.2}>
          <CardMesh plan={plan} handle={handle} entriesCount={entriesCount} pointer={pointer} />
        </Float>
      </Canvas>
    </div>
  );
}

export default function RangerPassCard3D({
  handle,
  plan,
  entriesCount,
}: {
  handle: string;
  plan: string;
  entriesCount: number;
}) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  if (!mounted || reducedMotion) {
    return <RangerPassCard handle={handle} plan={plan} entriesCount={entriesCount} />;
  }

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 280,
        aspectRatio: "85.6 / 53.98",
      }}
    >
      <Scene plan={plan} handle={handle} entriesCount={entriesCount} />
    </div>
  );
}
