# MedNet AI Coding Guidelines
- Stack: Next.js (App Router strictly), TypeScript, Tailwind CSS, Supabase, React-Leaflet.
- Scope: Patient-side web MVP only (Auth, optional HMO onboarding with Leadway Health, Facility Discovery, Map & Location filtering, Patient Dashboard).
- Architecture: Default to React Server Components. Only use "use client" when hooks (useState, useEffect) or browser APIs (geolocation, Leaflet map) are strictly required.
- Routing: Never use the deprecated `pages/` directory. Place all routes inside `src/app/`.
- Styling: Use Tailwind CSS utility classes. Keep UI clean, accessible, and responsive.
- Privacy & Security: Never hardcode API keys or secrets. Use `.env.local` for all credentials. Never use real patient data.
