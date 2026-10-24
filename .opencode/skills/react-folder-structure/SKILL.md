---
name: react-folder-structure
description: Standards and guidelines for React folder structure (Beginner, Intermediate, Advanced/Feature-driven) for OpenCode.
---

# OpenCode Skill: React Folder Structure & Codebase Organization

This skill equips OpenCode with rules, patterns, and workflows to organize React codebases cleanly. Grounded in React best practices, it provides exact rules for three project tiers: Beginner (Small), Intermediate (Medium), and Advanced (Enterprise/Feature-driven).

---

## 1. Project Scale Assessment

Before generating code or refactoring directories, determine the application scale:

| Tier | Project Scope | Component Count | Recommended Architecture |
| :--- | :--- | :--- | :--- |
| **Tier 1: Beginner** | Toy apps, simple single-purpose tools (e.g., simple To-Do) | < 20 components | Flat / Basic Structure |
| **Tier 2: Intermediate** | Medium apps with 5–15 distinct pages (e.g., Dashboard, Settings) | 20–50 components | Page-based Co-location |
| **Tier 3: Advanced** | Large/Enterprise multi-feature platforms | 50+ components | Feature-based Encapsulated Architecture |

---

## 2. Directory Specifications

### Tier 1: Beginner (Small Projects)
Best for small apps to keep overhead minimal.

```
src/
├── components/          # All components (buttons, modals, forms)
├── hooks/               # Custom React hooks
├── tests/               # Centralized tests (acceptable for small apps)
├── App.jsx              # Main app container
├── index.jsx            # Entry point
└── [utils/context]      # Simple utilities & context floating in src/
```

---

### Tier 2: Intermediate (Medium Projects)
Focuses on concern separation and page-level co-location.

```
src/
├── assets/              # Static assets (images, SVGs, global CSS)
├── components/          # Shared presentation components (ui/, form/)
├── context/             # Global React contexts + co-located tests
├── data/                # Static JSON data, constants
├── hooks/               # Global custom hooks + co-located tests
├── pages/               # Page-specific domain folders
│   ├── Home/            # Page folder co-locating page-only code
│   │   ├── Home.jsx
│   │   ├── Home.test.jsx
│   │   ├── HomeContext.jsx
│   │   ├── HomeForm.jsx
│   │   └── useHomeData.js
│   └── Settings/
├── utils/               # Small, pure helper functions (e.g., formatDate)
└── App.jsx
```

**Key Principle (Co-location):**
- If a component, hook, or context is **only used on one page**, place it inside that specific page's folder (`src/pages/[PageName]/`).
- Place test files (`*.test.jsx`) directly beside the source file being tested.

---

### Tier 3: Advanced (Enterprise / Feature-driven)
Encapsulates application domains into self-contained features.

```
src/
├── assets/              # Global static assets
├── components/          # General shared UI primitives (ui/Button, form/Input)
├── context/             # App-wide global contexts
├── data/                # App-wide static data/constants
├── features/            # Self-contained domain feature modules
│   ├── auth/            # Authentication feature domain
│   │   ├── components/  # Feature-specific components
│   │   ├── hooks/       # Feature-specific hooks
│   │   ├── services/    # Feature-specific API calls
│   │   └── index.js     # PUBLIC BARREL EXPORT (strict encapsulation boundary)
│   ├── todos/
│   └── projects/
├── hooks/               # Global utility hooks (e.g., useLocalStorage)
├── layouts/             # Multi-page layouts (Navbar, Sidebar, Footer)
├── lib/                 # Facade wrappers for 3rd party libraries (axios, fetch)
├── pages/               # Clean, thin page components
│   ├── Home.jsx         # Imports feature components via feature barrels
│   └── Settings.jsx
├── services/            # Global API services (analytics, global logging)
└── utils/               # Pure, global utility functions
```

---

## 3. Strict OpenCode Code Generation Rules

### Rule 1: Feature Encapsulation & Public API Barrels
- Each folder inside `src/features/[feature-name]/` MUST contain an `index.js` (or `index.ts`).
- `index.js` defines the **public interface** of the feature. Only export components, hooks, or types intended for external consumption.
- **NEVER** import internal files directly from another feature or page (e.g., DO NOT do `import X from '@/features/auth/components/LoginForm'`). Always import through the barrel: `import { LoginForm } from '@/features/auth'`.

### Rule 2: Facade Pattern for Third-Party Libraries (`src/lib/`)
- Wrap external libraries (Axios, TanStack Query, Analytics SDKs) inside custom abstractions in `src/lib/`.
- Example: Create `src/lib/axios.js` to configure HTTP defaults and interceptors. Rest of codebase imports from `src/lib/axios` rather than raw `axios`.
- Benefit: Upgrading or replacing external libraries only requires modifying a single wrapper file in `src/lib/`.

### Rule 3: Test Co-location
- Do not create a central `src/tests/` folder for Tier 2 and Tier 3 projects.
- Place unit/integration test files directly beside the source file:
  - Component: `Button.jsx` -> `Button.test.jsx`
  - Hook: `useAuth.js` -> `useAuth.test.js`

### Rule 4: Pure Utilities in `src/utils/`
- Functions in `src/utils/` must be small, pure functions (same input always produces the same output with zero side effects, e.g., currency formatters, date string manipulators).
- Side-effectful or stateful logic belongs in `services/` or `hooks/`.

### Rule 5: Thin Pages in Feature Architecture
- In Tier 3, `src/pages/` components should be lightweight orchestrators. They assemble feature exports into page layouts rather than housing complex inline business logic.

---

## 4. OpenCode Refactoring & Project Generation Workflow

When instructed to set up or refactor a React repository:

1. **Assess Scale:** Evaluate the project scale (Beginner / Intermediate / Advanced).
2. **Audit Structure:** Analyze existing folders against target tier specifications.
3. **Migrate Logic:**
   - Move page-isolated code into `src/pages/[Page]/` (Intermediate) or `src/features/[feature]/` (Advanced).
   - Move third-party SDK calls into `src/lib/`.
   - Co-locate tests next to target files.
4. **Create Feature Barrels:** Ensure every feature folder exposes an `index.js` barrel.
5. **Enforce Import Boundaries:** Fix relative/absolute imports to route through feature barrels.
