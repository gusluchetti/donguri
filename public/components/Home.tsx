export const Home = () => {
  return (
    <div className="px-4 py-3">
      {/* TUI-style header */}
      <div className="mb-6 pb-3 border-b dark:border-kanagawa-bg-surface light:border-kanagawa-light-bg-surface">
        <h1 className="text-lg font-medium dark:text-kanagawa-text-primary light:text-kanagawa-light-text-primary">
          my watch list
        </h1>
      </div>

      {/* Empty state with TUI box */}
      <div className="max-w-md mx-auto">
        <div className="border rounded p-6 text-center dark:border-kanagawa-bg-surface dark:bg-kanagawa-bg-elevated light:border-kanagawa-light-bg-surface light:bg-kanagawa-light-bg-elevated">
          {/* ASCII art empty box */}
          <pre className="mb-4 text-xs dark:text-kanagawa-text-secondary light:text-kanagawa-light-text-secondary leading-tight">
{`    .--------.
   /        /|
  /________/ |
  |        | |
  |  (  )  | /
  |________|/`}
          </pre>

          <p className="text-sm dark:text-kanagawa-text-secondary light:text-kanagawa-light-text-secondary mb-4">
            no items in your watch list yet
          </p>

          <p className="text-xs dark:text-kanagawa-text-secondary light:text-kanagawa-light-text-secondary">
            browse the{' '}
            <a
              href="/catalog"
              className="dark:text-kanagawa-accent-cyan dark:hover:text-kanagawa-accent-blue light:text-kanagawa-light-accent-cyan light:hover:text-kanagawa-light-accent-blue transition-colors duration-100"
            >
              [catalog]
            </a>
            {' '}to add media
          </p>
        </div>
      </div>

      {/* Placeholder for future watch list items */}
      <div className="mt-8 text-xs dark:text-kanagawa-text-secondary light:text-kanagawa-light-text-secondary text-center">
        <span className="px-2 py-1 border rounded dark:border-kanagawa-bg-surface light:border-kanagawa-light-bg-surface">
          coming soon: save and track your media
        </span>
      </div>
    </div>
  )
}
