// components/ThemeScript.tsx
// Inline script runs before React hydrates — prevents flash of unstyled content
export function ThemeScript() {
  const script = `
    (function() {
      try {
        var t = localStorage.getItem('stratum-theme') || 'light';
        document.documentElement.dataset.theme = t;
      } catch(e) {}
    })();
  `
  return <script dangerouslySetInnerHTML={{ __html: script }} />
}
