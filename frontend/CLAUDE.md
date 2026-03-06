# frontend/ — React Rules

## Stack
- React 18 · Vite · plain JavaScript (JSX) — no TypeScript
- Check `package.json` for installed libraries before adding new ones

## Structure (grow into this as project expands)
```
src/
├── components/      # Reusable UI components (PascalCase filenames)
├── pages/           # One component per route/page
├── hooks/           # Custom hooks — always prefixed with `use`
├── api/             # API call functions (axios or fetch wrappers)
├── utils/           # Pure helper functions
├── App.jsx          # Root component & routes
└── main.jsx         # Entry point — do not put logic here
```

## Rules
- Use functional components only — no class components
- One component per file, filename matches component name (PascalCase)
- Custom hooks always start with `use` (e.g. `useReviews`)
- API calls go in `src/api/` — never inline fetch/axios inside components
- Use `npm run build` to build into `frontend/dist/` for Django to serve

## State
- Local UI state → `useState` / `useReducer`
- Shared app state → React Context or a state lib if added later
- Server data → fetch in a custom hook or a library if added (e.g. TanStack Query)

## Styling
- Currently using `App.css` / `index.css` — keep styles co-located or in a `styles/` folder
- No inline `style={{}}` unless value is dynamic

## Dev vs Production
- Dev: `npm run dev` runs on `http://localhost:5173`
- Prod: `npm run build` → Django serves `frontend/dist/`
- API base URL comes from `frontend/.env` — check `.env.example`
