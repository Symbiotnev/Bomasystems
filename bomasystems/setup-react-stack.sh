#!/usr/bin/env bash
# setup-react-stack.sh
# Run from the ROOT of an existing React project (Vite / CRA style, with src/).
# Installs: Tailwind CSS (v3), Framer Motion, Lucide React, React Toastify,
#           React Router, Lottie (lottie-react)
# Configures: tailwind.config.js, postcss.config.js, src/index.css

set -e

# ---------- checks ----------
if [ ! -f package.json ]; then
  echo "❌ No package.json found. Run this inside your React project root."
  echo "   Tip: npm create vite@latest my-app -- --template react"
  exit 1
fi

mkdir -p src

# ---------- install packages ----------
echo "📦 Installing runtime dependencies..."
npm install framer-motion lucide-react react-toastify react-router-dom lottie-react

echo "🎨 Installing Tailwind CSS v3 + PostCSS + Autoprefixer..."
npm install -D tailwindcss@3 postcss autoprefixer

# ---------- tailwind.config.js ----------
echo "⚙️  Writing tailwind.config.js..."
if grep -q '"type": *"module"' package.json; then
  MODULE_TYPE="esm"
else
  MODULE_TYPE="cjs"
fi

if [ "$MODULE_TYPE" = "esm" ]; then
cat > tailwind.config.js <<'EOF'
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
EOF

cat > postcss.config.js <<'EOF'
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
EOF
else
cat > tailwind.config.js <<'EOF'
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
EOF

cat > postcss.config.js <<'EOF'
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
EOF
fi

# ---------- src/index.css ----------
echo "🖌️  Setting up src/index.css..."
DIRECTIVES='@tailwind base;
@tailwind components;
@tailwind utilities;
'

if [ -f src/index.css ]; then
  if grep -q "@tailwind base" src/index.css; then
    echo "   index.css already has Tailwind directives, leaving it as is."
  else
    cp src/index.css src/index.css.bak
    { printf "%s\n" "$DIRECTIVES"; cat src/index.css.bak; } > src/index.css
    echo "   Prepended Tailwind directives (backup: src/index.css.bak)."
  fi
else
  printf "%s" "$DIRECTIVES" > src/index.css
  echo "   Created src/index.css."
fi

# ---------- done ----------
echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Make sure src/main.jsx (or index.js) has:  import './index.css'"
echo "  2. Start the dev server:  npm run dev"
echo ""
echo "Quick imports:"
echo "  import { BrowserRouter, Routes, Route } from 'react-router-dom'"
echo "  import { motion } from 'framer-motion'"
echo "  import { Home } from 'lucide-react'"
echo "  import { ToastContainer, toast } from 'react-toastify'"
echo "  import 'react-toastify/dist/ReactToastify.css'"
echo "  import Lottie from 'lottie-react'"
