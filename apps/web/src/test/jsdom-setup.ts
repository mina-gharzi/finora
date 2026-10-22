/**
 * jsdom test-environment setup.
 *
 * jsdom implements no `window.matchMedia`, so any component that reads a
 * media query (`prefers-reduced-motion`, `prefers-color-scheme`, ...) throws
 * `window.matchMedia is not a function` while rendering. Real browsers have
 * had it for years, so the gap belongs to the test environment, not to the
 * component.
 *
 * The stub below reports "no match" for every query and is inert: it never
 * fires change events, so a component that subscribes to one keeps its
 * initial value — the behaviour a test asserts against.
 *
 * Registered in `vitest.config.mts` as `setupFiles`. The guard keeps it a no-op
 * in the node environment (tests that declare `@vitest-environment node`).
 */
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  });
}
