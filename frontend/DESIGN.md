# AutonomousOps Command Center — Design System

This document records the visual and interaction contract for the Next.js command center. It is an original system informed by, not copied from, the references researched for this project.

## Product intent

AutonomousOps should feel like an operational instrument rather than a generic dashboard. The UI must communicate four ideas immediately:

1. an event starts the system;
2. specialist agents form an observable chain;
3. deterministic governance owns permission to act;
4. every outcome can be inspected and reproduced.

## Design pre-flight

The Taste Skill guidance was used as a critique framework: wide editorial headings, cinematic chapter spacing, dense grids without dead cells, visible hover/scroll feedback, strong button contrast, and a clear Attention → Interest → Desire → Action narrative. The external skill asks for GSAP specifically; this project intentionally uses the MIT-licensed `motion` core instead so the runtime has no paid add-on requirement.

The selected composition is:

- Hero: editorial split, with a wide two-line statement and an interactive orchestration object.
- Typography: Geist-first system stack; no remote font request is required.
- Components: dense bento capability grid, live incident workbench, 3D agent graph, evaluation matrix.
- Motion: progressive entrance, active-agent pulse, live shader movement, hover elevation.
- Reduced motion: WebGL gradient removed and transitions collapsed when the OS requests reduced motion.

The hero heading is deliberately given an ultra-wide measure and `clamp()` sizing so it stays within two lines at desktop widths. The bento uses a 12-column `grid-auto-flow: dense` layout: 8 + 4 columns fill row one, the 8-column card spans two rows while the two 4-column cards fill the remaining cells, and the final 8-column card consumes the final lower span without dead grid space.

## Visual language

### Palette

- Canvas: `#070908`
- Elevated canvas: `#0d1110`
- Ink: `#f3f7f5`
- Secondary text: `#a7b3ae`
- Hairline: translucent cool white
- Operational emerald: `#00d992`
- Secondary signal lavender: `#7d82ff`
- Human-approval amber: `#ffc66d`
- Blocked / P1 red: `#ff667a`

The near-black, code-adjacent surface hierarchy is informed by the VoltAgent and Linear design analyses in `awesome-design-md`. Emerald is the dominant operational accent; lavender appears only as a secondary depth signal.

### Glass surfaces

`liquid-glass-js` was studied for its WebGL refraction direction, but the application does not ship it as a dependency. Its repository still lists package/wrapper/accessibility work on its roadmap, so critical controls use resilient CSS `backdrop-filter` surfaces with a no-filter fallback. This preserves the liquid-glass impression without coupling the app to an immature runtime dependency.

### Liquid core

The central 3D object is an original React Three Fiber shader. It borrows only the conceptual language of `liquid-logo` — moving edge highlights, metallic bands and fluid displacement — while using project-specific GLSL code and the AutonomousOps palette. It represents the orchestrator, not a decorative brand logo.

## Interaction contract

### Navigation

A floating glass navigation bar stays available during long command-center sessions. The GitHub control is an ordinary link and remains keyboard accessible.

### Incident simulator

The simulator must always support:

- preset scenarios;
- fully editable incident fields;
- production/staging/development environment choice;
- recent-change toggle;
- server-side incident execution;
- visible agent progression;
- approval and rejection decisions;
- complete tool trace;
- stakeholder-update copy action;
- local-only history of the five most recent runs.

No account, cloud database or third-party analytics is required.

### Agent graph

The graph is an explanatory visualization, not the source of truth. Textual agent status is always rendered alongside it so WebGL failure does not hide workflow state.

### Evaluation

Evaluation metrics are fetched from `/api/evaluation`; they are not literal marketing text. The web engine is required to match the eight checked-in Python evaluation fixtures for severity, runbook selection and approval requirement.

## Accessibility and performance

- Semantic headings, forms, labels, table structure and navigation.
- Keyboard-operable controls.
- Strong focus rings and high-contrast CTA text.
- `prefers-reduced-motion` support.
- No essential information exists only in motion or color.
- React Three Fiber canvas uses bounded DPR and no post-processing chain.
- ShaderGradient uses lazy loading and pixel density `1`.
- No remote image or font payload is necessary to render the product.

## Free-runtime rule

The application itself has no mandatory paid API, model, database, auth provider, observability service or asset CDN. It can run locally with Node.js alone. A Vercel Hobby deployment is an optional public demo target and is subject to Vercel's free-tier quotas; the code does not require Vercel to function.
