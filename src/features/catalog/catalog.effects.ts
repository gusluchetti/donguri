type StatusTransition = { from: string | null; to: string };

const effects: Array<{
  match: (t: StatusTransition) => boolean;
  run: () => void;
}> = [
  {
    match: (t) => t.to === "completed" && t.from !== "completed",
    run: () => {
      import("canvas-confetti").then(({ default: confetti }) =>
        confetti({
          particleCount: 80,
          spread: 60,
          origin: { y: 0.7 },
          colors: ["#d4a44a", "#e8702e", "#2aaba0"],
        }),
      );
    },
  },
];

export function onStatusTransition(from: string | null, to: string): void {
  const t = { from, to };
  for (const fx of effects) {
    if (fx.match(t)) fx.run();
  }
}
