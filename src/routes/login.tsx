import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { SignInSection } from "~/features/auth/components/SignInSection";
import { AcornIcon } from "~/features/media/components/AcornIcon";
import { ogTags, pageTitle } from "~/lib/og";

export const Route = createFileRoute("/login")({
  beforeLoad: ({ context }) => {
    if (context.auth) throw redirect({ to: "/" });
  },
  head: () => ({
    meta: [
      { title: pageTitle("Sign in — donguri") },
      { name: "description", content: "Sign in to donguri with your Bluesky account." },
      ...ogTags({
        title: "Sign in — donguri",
        description: "Sign in with your Bluesky account to track movies, TV, anime, and games.",
        path: "/login",
      }),
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  return (
    <div className="dg-page-enter text-dg-text flex-1 overflow-y-auto font-body grid place-items-center">
      <div className="w-full max-w-[400px] px-g3 py-6 sm:py-16">
        <div className="flex flex-col items-center mb-5 sm:mb-8">
          <Link to="/" className="flex flex-col items-center gap-2 no-underline">
            <span className="text-dg-accent leading-[0]">
              <AcornIcon size={28} />
            </span>
            <span className="font-display text-[1.3rem] sm:text-[1.5rem] text-dg-text">
              donguri
            </span>
          </Link>
        </div>

        <SignInSection />

        <p className="text-[0.75rem] text-dg-text-tertiary mt-3 leading-relaxed px-1">
          All sign-in methods give you full access to donguri. AT Protocol accounts get additional
          benefits like data portability and cross-app interoperability.
        </p>

        <div className="text-center mt-4 sm:mt-6">
          <Link
            to="/"
            className="text-[0.8rem] text-dg-text-tertiary no-underline hover:text-dg-text-secondary transition-colors"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
