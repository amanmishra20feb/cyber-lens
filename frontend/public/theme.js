// Set the theme before first paint so dark mode does not flash light. An external file, because the API's
// Content-Security-Policy (helmet) blocks inline scripts when it serves the built app.
try { if (localStorage.getItem('theme') === 'dark') document.documentElement.dataset.theme = 'dark'; } catch {}
