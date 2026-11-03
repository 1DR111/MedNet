# MedNet AI Coding Guidelines
- Stack: Next.js (App Router strictly), TypeScript, Tailwind CSS, Supabase, React-Leaflet.
- Scope: Patient-side web MVP only (Auth, optional HMO onboarding with Leadway Health, Facility Discovery, Map & Location filtering, Patient Dashboard).
- Architecture: Default to React Server Components. Only use "use client" when hooks (useState, useEffect) or browser APIs (geolocation, Leaflet map) are strictly required.
- Routing: Never use the deprecated `pages/` directory. Place all routes inside `src/app/`.
- Styling: Use Tailwind CSS utility classes. Keep UI clean, accessible, and responsive.
- Privacy & Security: Never hardcode API keys or secrets. Use `.env.local` for all credentials. Never use real patient data.

## Product Quality & Anti-Vibecoding Standards (STRICT)
These rules apply to all current and future code and copy in MedNet.
- NO purple or neon gradients anywhere in the app. Use solid, high-contrast medical neutrals (slate/zinc) with clinical teal/emerald (`#0d9488` / `#059669`, brand mark `#0f766e`) and semantic status colours: red for errors, amber for warnings, emerald for success.
- NO pill-shaped buttons or filter chips. `rounded-full` is banned on buttons, inputs, selects, filter chips, badges and tags. Use `rounded-md` or `rounded-lg` (6px to 8px) across all buttons, badges and filter chips for a crisp, engineered look like Linear or Zocdoc. The only permitted uses of `rounded-full` are small status dots (about 8px) and, only when strictly necessary, circular map control icon buttons.
- NO emoji icons anywhere in the UI. Always use `lucide-react` SVG icons with a consistent stroke width.
- NO em dashes (`—`) or double hyphens (`--`) in any UI text, headings, labels, placeholders, error messages or legal copy. Use commas, colons, periods or middots (`·`) instead.
- NO vague hero text or marketing fluff (for example "Revolutionizing healthcare", "Seamless journey", "Empowering your wellness"). Write direct, factual, utility-first copy for patients in Nigeria.
- NO fake reviews, fake star ratings, fake counters or fake metrics. Only display real database counts and verified facility attributes (operating hours, verified status, specialties, accepted HMO plans).
- NO decorative scroll animations, cursor animations or bounce effects. Keep transitions purely functional: 150ms opacity or colour transitions, plus loading spinners where something is genuinely in progress.
- NO "Made with AI" tags, badges or placeholder AI images.
