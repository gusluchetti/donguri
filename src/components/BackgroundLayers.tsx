/**
 * Four fixed atmosphere layers that create depth and visual texture.
 * Mounts once in __root.tsx. All layers are fixed + pointer-events-none.
 */
export function BackgroundLayers() {
  return (
    <>
      <div className="bg-grid" />
      <div className="bg-topo" />
      <div className="bg-vig" />
      <div className="noise" />
    </>
  );
}
