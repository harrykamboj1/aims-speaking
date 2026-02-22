import re

with open("public/styles.css", "r") as f:
    css = f.read()

# Replace fonts
css = css.replace("https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap", "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@500;600;700;800&display=swap")
css = css.replace("'Outfit', 'Inter', -apple-system", "'Inter', system-ui")
css = css.replace("'Playfair Display', serif", "'Poppins', sans-serif")

# Core variables
css = css.replace("--brand-primary: #3b82f6;", "--brand-primary: #3C83F6;")
css = css.replace("--brand-secondary: #8b5cf6;", "--brand-secondary: #2563EB;")
css = css.replace("--bg-deep: #030712;", "--bg-deep: #F8FAFC;")
css = css.replace("--bg-surface: #111827;", "--bg-surface: #FFFFFF;")
css = css.replace("--bg-surface-glass: rgba(17, 24, 39, 0.65);", "--bg-surface-glass: rgba(255, 255, 255, 0.85);")
css = css.replace("--bg-surface-glass-light: rgba(31, 41, 55, 0.4);", "--bg-surface-glass-light: rgba(255, 255, 255, 0.6);")
css = css.replace("--border-subtle: rgba(255, 255, 255, 0.05);", "--border-subtle: rgba(0, 0, 0, 0.05);")
css = css.replace("--border-default: rgba(255, 255, 255, 0.1);", "--border-default: rgba(0, 0, 0, 0.1);")
css = css.replace("--border-highlight: rgba(255, 255, 255, 0.2);", "--border-highlight: rgba(60, 131, 246, 0.4);")
css = css.replace("--text-primary: #f9fafb;", "--text-primary: #020817;")
css = css.replace("--text-secondary: #9ca3af;", "--text-secondary: #475569;")
css = css.replace("--text-tertiary: #6b7280;", "--text-tertiary: #94A3B8;")

# Specific styles
css = re.sub(r'background: radial-gradient\(circle at top, #0f172a 0%, var\(--bg-deep\) 100%\);', r'background: linear-gradient(135deg, #F0F4FF 0%, #F8FAFC 100%);', css)
css = re.sub(r'background: linear-gradient\(180deg, rgba\(31, 41, 55, 0.4\) 0%, rgba\(17, 24, 39, 0.8\) 100%\);', r'background: linear-gradient(180deg, #FFFFFF 0%, #FAFAFA 100%);', css)

# Fix dark backgrounds appearing white on light mode
css = css.replace("rgba(3, 7, 18, 0.8)", "rgba(255, 255, 255, 0.9)")
css = css.replace("background: rgba(0, 0, 0, 0.3);", "background: rgba(0, 0, 0, 0.03);")
css = css.replace("background: rgba(0, 0, 0, 0.5);", "background: rgba(0, 0, 0, 0.05);")
css = css.replace("rgba(255, 255, 255, 0.05)", "rgba(0, 0, 0, 0.03)")
css = css.replace("rgba(255, 255, 255, 0.1)", "rgba(0, 0, 0, 0.06)")

# Fix the big text linear gradients designed for dark mode
css = re.sub(r'background-image: linear-gradient\(to right, #60a5fa, #c084fc\);', r'background-image: linear-gradient(to right, #020817, #1E293B);', css)
css = re.sub(r'background-image: linear-gradient\(to right, #c084fc, #f472b6\);', r'background-image: linear-gradient(to right, #3C83F6, #2563EB);', css)

# Button primary
css = re.sub(r'background: linear-gradient\(to right, var\(--brand-primary\), var\(--brand-secondary\)\);', r'background: var(--brand-primary);', css)

# Timer prep text which uses gradient designed for white text
css = css.replace("background: linear-gradient(135deg, #fff, #9ca3af);", "background: linear-gradient(135deg, #020817, #334155);")

# Update orb mix blend mode for light background
css = css.replace("mix-blend-mode: screen;", "mix-blend-mode: multiply;")

with open("public/styles.css", "w") as f:
    f.write(css)

print("Styles updated!")
