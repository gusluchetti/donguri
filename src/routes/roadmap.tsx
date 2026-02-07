import { createFileRoute } from "@tanstack/react-router";
import { getRoadmap } from "../lib/roadmap.functions";

export const Route = createFileRoute("/roadmap")({
  loader: () => getRoadmap(),
  head: () => ({
    meta: [{ title: "Roadmap — donguri" }],
  }),
  component: RoadmapPage,
});

function RoadmapPage() {
  const html = Route.useLoaderData();

  return (
    <div className="bg-dg-bg text-dg-text min-h-screen font-mono">
      <div className="max-w-[700px] mx-auto px-6 py-10">
        <div
          className="roadmap-prose"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
