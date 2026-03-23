import { Html } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type { Mesh, PointLight } from "three";
import { DoubleSide, MathUtils, Shape } from "three";
import type { Plan } from "~/features/subscription/subscription.provider";
import {
  CardFaceContent,
  handleToSerial,
  PLAN_ACCENT,
  PLAN_GRADIENTS,
  PlanLandscape,
  RangerPassCard,
  toPlan,
} from "./RangerPassCard";

const PLAN_COLOR: Record<Plan, string> = {
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

  const safePlan = toPlan(plan);
  const baseColor = PLAN_COLOR[safePlan];
  const accent = PLAN_ACCENT[safePlan];
  const gradient = PLAN_GRADIENTS[safePlan];
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
          <CardFaceContent plan={plan} accent={accent} handle={handle} serial={serial} />
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
    const rect = e.currentTarget.getBoundingClientRect();
    setPointer({
      x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
    });
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (!touch) return;
    const rect = e.currentTarget.getBoundingClientRect();
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
