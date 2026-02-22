import re

# Update index.html
with open('public/index.html', 'r') as f:
    html = f.read()

# Add theme script in head to prevent flash
head_script = """
  <link rel="stylesheet" href="styles.css">
  <script>
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  </script>
</head>
"""
html = html.replace('  <link rel="stylesheet" href="styles.css">\n</head>', head_script)

toggle_btn = """
  <!-- ─── Status Bar ─── -->
  <div id="status-bar" class="status-bar">
    <div style="display: flex; align-items: center; gap: 8px;">
      <div class="status-dot"></div>
      <span id="status-text">Checking connection...</span>
    </div>
    <button id="theme-toggle" class="theme-toggle" onclick="toggleTheme()" title="Toggle Dark/Light Mode">
      <span class="icon-sun" style="display: none;">☀️</span>
      <span class="icon-moon">🌙</span>
    </button>
  </div>
"""

html = re.sub(r'<!-- ─── Status Bar ─── -->.*?</div>', toggle_btn.strip(), html, flags=re.DOTALL)

with open('public/index.html', 'w') as f:
    f.write(html)

print("Updated index.html")

# Update styles.css
dark_rules = """
/* ═══════════════════════════════════════════════════════════
   DARK THEME OVERRIDES
   ═══════════════════════════════════════════════════════════ */
[data-theme="dark"] {
  --bg-deep: #030712;
  --bg-surface: #111827;
  --bg-surface-glass: rgba(17, 24, 39, 0.65);
  --bg-surface-glass-light: rgba(31, 41, 55, 0.4);
  --border-subtle: rgba(255, 255, 255, 0.05);
  --border-default: rgba(255, 255, 255, 0.1);
  --border-highlight: rgba(255, 255, 255, 0.2);
  --text-primary: #f9fafb;
  --text-secondary: #9ca3af;
  --text-tertiary: #6b7280;
}

[data-theme="dark"] .bg-effects {
  background: radial-gradient(circle at top, #0f172a 0%, var(--bg-deep) 100%);
}

[data-theme="dark"] .gradient-orb {
  mix-blend-mode: screen;
}

[data-theme="dark"] .status-bar {
  background: rgba(3, 7, 18, 0.8);
}

[data-theme="dark"] .title-line-1 {
  background-image: linear-gradient(to right, #60a5fa, #c084fc);
}

[data-theme="dark"] .title-line-2 em {
  background-image: linear-gradient(to right, #c084fc, #f472b6);
}

[data-theme="dark"] .task-card {
  background: linear-gradient(180deg, rgba(31, 41, 55, 0.4) 0%, rgba(17, 24, 39, 0.8) 100%);
  box-shadow: 0 4px 24px -1px rgba(0, 0, 0, 0.3);
}

[data-theme="dark"] .task-card::before {
  background: linear-gradient(to bottom right, rgba(255, 255, 255, 0.1), transparent);
}

[data-theme="dark"] .task-card:hover {
  box-shadow: 0 12px 40px -10px rgba(0, 0, 0, 0.5);
}

[data-theme="dark"] .task-meta span {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
}

[data-theme="dark"] .diff-dot {
  background: rgba(255, 255, 255, 0.1);
}

[data-theme="dark"] .badge {
  background: rgba(255, 255, 255, 0.03);
  border-color: var(--border-default);
}
[data-theme="dark"] .badge:hover {
  background: rgba(255, 255, 255, 0.08);
}

[data-theme="dark"] .btn-back {
  background: rgba(255, 255, 255, 0.05);
}
[data-theme="dark"] .btn-back:hover {
  background: rgba(255, 255, 255, 0.1);
}

[data-theme="dark"] .prep-timer-bg {
  stroke: rgba(255, 255, 255, 0.05);
}

[data-theme="dark"] #prep-timer {
  background: linear-gradient(135deg, #fff, #9ca3af);
  -webkit-background-clip: text;
}

[data-theme="dark"] #prep-notepad {
  background: rgba(0, 0, 0, 0.3);
  box-shadow: inset 0 2px 10px rgba(0, 0, 0, 0.5);
}
[data-theme="dark"] #prep-notepad:focus {
  box-shadow: inset 0 2px 10px rgba(0, 0, 0, 0.5), 0 0 0 2px rgba(59, 130, 246, 0.2);
}

[data-theme="dark"] .exam-top-bar {
  background: rgba(17, 24, 39, 0.8);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}

[data-theme="dark"] .exam-timer {
  background: rgba(0, 0, 0, 0.2);
}

[data-theme="dark"] .timer-ring-bg {
  stroke: rgba(255, 255, 255, 0.05);
}

[data-theme="dark"] .message-avatar {
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
}

[data-theme="dark"] .message.user .message-bubble {
  background: linear-gradient(135deg, #2563eb, #4f46e5);
}

[data-theme="dark"] .msg-action-btn,
[data-theme="dark"] .btn-speak {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.08);
}
[data-theme="dark"] .msg-action-btn:hover,
[data-theme="dark"] .btn-speak:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.15);
}

[data-theme="dark"] .input-area {
  background: linear-gradient(to top, rgba(3, 7, 18, 0.95), rgba(17, 24, 39, 0.85));
  border-top-color: rgba(255, 255, 255, 0.06);
}

[data-theme="dark"] .speech-status {
  background: rgba(255, 255, 255, 0.03);
  border-color: rgba(255, 255, 255, 0.03);
}

[data-theme="dark"] #text-input {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15), inset 0 1px 3px rgba(0, 0, 0, 0.1);
}
[data-theme="dark"] #text-input:focus {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(59, 130, 246, 0.5);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12), 0 2px 12px rgba(0, 0, 0, 0.15);
}

[data-theme="dark"] .btn-mic {
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02));
  border-color: rgba(255, 255, 255, 0.06);
  color: var(--text-primary);
}
[data-theme="dark"] .btn-mic:hover {
  background: linear-gradient(145deg, rgba(0, 0, 0, 0.06), rgba(255, 255, 255, 0.04));
}

[data-theme="dark"] .input-hints kbd {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.06);
}

[data-theme="dark"] .feedback-header {
  background: rgba(17, 24, 39, 0.9);
}

[data-theme="dark"] .feedback-close {
  background: rgba(255, 255, 255, 0.06);
}
[data-theme="dark"] .feedback-close:hover {
  background: rgba(255, 255, 255, 0.2);
}

[data-theme="dark"] .eval-spinner {
  border-color: rgba(255, 255, 255, 0.06);
  border-top-color: var(--brand-primary);
}

[data-theme="dark"] .btn-secondary {
  background: rgba(255, 255, 255, 0.05);
}
[data-theme="dark"] .btn-secondary:hover {
  background: rgba(255, 255, 255, 0.1);
}

[data-theme="dark"] ::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
}
[data-theme="dark"] ::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}

/* Theme Toggle Button Styles */
.theme-toggle {
  background: transparent;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 4px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform var(--transition-fast), background 0.2s;
  color: var(--text-primary);
}
.theme-toggle:hover {
  transform: scale(1.1);
  background: rgba(128, 128, 128, 0.1);
}

"""

with open('public/styles.css', 'a') as f:
    f.write(f"\n{dark_rules}")
    
# Let's fix status bar flex in styles.css
with open('public/styles.css', 'r') as f:
    css = f.read()

css = css.replace("justify-content: space-between;", "") # In case we already added it
css = css.replace("  gap: 8px;\n  padding: 8px 24px;\n  background: rgba(255, 255, 255, 0.9);", "  justify-content: space-between;\n  padding: 8px 24px;\n  background: rgba(255, 255, 255, 0.9);")

with open('public/styles.css', 'w') as f:
    f.write(css)

print("Updated public/styles.css")
