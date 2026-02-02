export const Home = () => {
  return (
    <div className="px-4 py-3">
      {/* TUI-style header */}
      <div className="mb-6 pb-3 border-b border-cream-300 dark:border-espresso-800">
        <h1 className="text-lg font-medium text-ink-600 dark:text-sand-300">
          my watch list
        </h1>
      </div>

      {/* Empty state with TUI box */}
      <div className="max-w-md mx-auto">
        <div className="border rounded p-6 text-center border-cream-300 dark:border-espresso-800 bg-cream-200 dark:bg-espresso-900">
          {/* ASCII art empty box */}
          <pre className="mb-4 text-xs text-ink-400 dark:text-sand-500 leading-tight">
{`    .--------.
   /        /|
  /________/ |
  |        | |
  |  (  )  | /
  |________|/`}
          </pre>

          <p className="text-sm text-ink-400 dark:text-sand-500 mb-4">
            no items in your watch list yet
          </p>

          <p className="text-xs text-ink-400 dark:text-sand-500">
            browse the{' '}
            <a
              href="/catalog"
              className="text-accent-cyan dark:text-glow-cyan hover:text-accent-blue dark:hover:text-glow-blue transition-colors duration-100"
            >
              [catalog]
            </a>
            {' '}to add media
          </p>
        </div>
      </div>

      {/* Placeholder for future watch list items */}
      <div className="mt-8 text-xs text-ink-400 dark:text-sand-500 text-center">
        <span className="px-2 py-1 border rounded border-cream-300 dark:border-espresso-800">
          coming soon: save and track your media
        </span>
      </div>
    </div>
  )
}
