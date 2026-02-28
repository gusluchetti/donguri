import { useEffect, useRef } from "react";
import type { Media } from "~/db/schema";
import { MediaCard } from "./MediaCard";

export function InfiniteCarousel({ items }: { items: Media[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const posRef = useRef(0);
  const dragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartPos = useRef(0);
  const rafRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Duplicate items for seamless infinite loop
  const doubled = [...items, ...items];

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const SPEED = 0.03; // px per ms (~30px/s, frame-rate independent)
    let halfWidth = 0;
    let lastTime = 0;

    function measure() {
      if (!track) return;
      halfWidth = track.scrollWidth / 2;
    }

    // Measure after paint
    requestAnimationFrame(() => {
      measure();
    });

    window.addEventListener("resize", measure);

    function animate(now: number) {
      if (lastTime) {
        const dt = now - lastTime;
        if (!pausedRef.current && halfWidth > 0) {
          posRef.current += SPEED * dt;
          if (posRef.current >= halfWidth) posRef.current -= halfWidth;
          if (track) track.style.transform = `translateX(${-posRef.current}px)`;
        }
      }
      lastTime = now;
      rafRef.current = requestAnimationFrame(animate);
    }

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", measure);
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    };
  }, []);

  function pauseAndResume() {
    pausedRef.current = true;
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => {
      pausedRef.current = false;
    }, 1500);
  }

  function onMouseDown(e: React.MouseEvent) {
    dragging.current = true;
    dragStartX.current = e.clientX;
    dragStartPos.current = posRef.current;
    pausedRef.current = true;
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!dragging.current || !trackRef.current) return;
    const half = trackRef.current.scrollWidth / 2;
    let next = dragStartPos.current + (dragStartX.current - e.clientX);
    if (next < 0) next += half;
    if (next >= half) next -= half;
    posRef.current = next;
    trackRef.current.style.transform = `translateX(${-next}px)`;
  }

  function onMouseUp() {
    if (!dragging.current) return;
    dragging.current = false;
    pauseAndResume();
  }

  function onTouchStart(e: React.TouchEvent) {
    dragStartX.current = e.touches[0].clientX;
    dragStartPos.current = posRef.current;
    pausedRef.current = true;
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!trackRef.current) return;
    const half = trackRef.current.scrollWidth / 2;
    let next = dragStartPos.current + (dragStartX.current - e.touches[0].clientX);
    if (next < 0) next += half;
    if (next >= half) next -= half;
    posRef.current = next;
    trackRef.current.style.transform = `translateX(${-next}px)`;
  }

  function onTouchEnd() {
    pauseAndResume();
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: carousel drag requires mouse/touch on container
    <div
      className="overflow-hidden cursor-grab active:cursor-grabbing select-none"
      style={{ height: "200px", animation: "fadeIn 500ms ease-out both" }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        ref={trackRef}
        className="flex gap-3 h-full items-start"
        style={{ width: "max-content" }}
      >
        {doubled.map((item, i) => (
          <MediaCard key={`${item.id}-${i}`} item={item} index={i % items.length} />
        ))}
      </div>
    </div>
  );
}
