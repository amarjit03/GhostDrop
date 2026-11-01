# GhostDrop UI design plan

## 1) Subject, audience and primary job
- Subject: zero-knowledge secret sharing with self-destructing links.
- Audience: developers and IT staff sending API keys, passwords and .env snippets; recipients who open a link from chat.
- Primary job: get a first-time sender from the landing page to a created link in under 30 seconds, and keep a recipient calm and focused on one action.

## 2) Design direction
- Direction: sealed paper.
- Why: it reads as trustworthy and calm instead of gimmicky; the envelope/seal metaphor matches a secret being sent once and then closed forever, while still feeling light and legible.
- Rejected: redaction feels hidden and document-heavy; vapor is too decorative and weak for a trust signal; the link and used state need something clear and memorable, not just ambient translucency.
- Signature element: a subtle “seal” ring around the share link and the “used” state, with a restrained paper-like surface and a single accent glow.

## 3) Tokens
### Color system
- Light theme: background `#F6F7F9`, surface `#FFFFFF`, surface-strong `#EEF1F7`, text `#111827`, muted `#5A6475`, accent `#5B4EF6`, accent-soft `#E9E4FF`, danger `#B42318`, success `#106C45`, focus `#4F46E5`.
- Dark theme: background `#09090B`, surface `#111318`, surface-strong `#171A22`, text `#F5F7FB`, muted `#A3ADBD`, accent `#A78BFA`, accent-soft `#221B3D`, danger `#FCA5A5`, success `#34D399`, focus `#A78BFA`.
- Semantic mapping: `--surface`, `--surface-strong`, `--text`, `--muted`, `--accent`, `--accent-soft`, `--danger`, `--success`, `--focus-ring`.
- Contrast: text on dark surface ~ 15:1; text on light surface ~ 14:1; muted on dark surface ~ 7:1; muted on light surface ~ 6.7:1; all meet WCAG AA for body text.

### Type system
- Display: `Fraunces`, `display: swap`, latin subset only.
- Body/UI: `IBM Plex Sans`, `display: swap`, latin subset only.
- Mono: `IBM Plex Mono`, `display: swap`, latin subset only, for secret text and link display.
- Scale: 12/14/16/18/24/32/48/64 with 1.4–1.7 line-height; max line length 68–72 characters for prose.
- Rule: use no more than 2 font files for display/body, plus the mono face for code-like text. Keep total font files at 3 or fewer.

### Spacing, radii and elevation
- Spacing: 4, 8, 12, 16, 24, 32, 48, 64.
- Radius: 12 for inputs, 16 for cards, 24 for feature blocks, 9999 for pills.
- Elevation: low 0 8px 24px rgba(0,0,0,0.08), medium 0 18px 40px rgba(17,24,39,0.12), high 0 30px 64px rgba(17,24,39,0.18). No single radius or shadow used everywhere.

## 4) Layout
### Home (desktop)
```text
[Header: GhostDrop / Security / Repo] 

[Hero: headline + subhead] [live Create form demo]

[Link anatomy: server part | browser key]

[How it works: 1 Write / 2 Share / 3 Opened once / 4 Gone]

[What we can and can't see]

[FAQ details]

[Footer: Security / Terms / Privacy / contact]
```

### Home (mobile)
```text
[Header]
[Hero headline]
[Create form]
[Link anatomy]
[How it works]
[What we can and can't see]
[FAQ]
[Footer]
```

### Create (idle / working / error)
```text
Idle:      [Textarea] [counter]
           [Expiry segmented] [Views segmented]
           [Create link button]
Working:   [spinner] Preparing / Encrypting / Uploading / Finishing
Error:     [alert] message + fix action
```

### Result
```text
[Success banner]
[LinkDisplay with copy button]
[Warning: one-time link]
[Expiry local time]
[Delete now button + confirm step]
```

### Reveal (ready / revealing / shown / gone / error)
```text
Ready:       [quiet headline] [Open drop button]
Revealing:   [spinner + status]
Shown:       [secret in mono panel] [Send your own secret link]
Gone:        [status + home link]
Error:       [alert + retry/home]
```

### Security
```text
[Header compact]
[Intro: how it works in plain language]
[Server can see / cannot see]
[Honest limits]
[Audit status]
[FAQ]
[Footer]
```

State alignment: home and security are left-aligned for wide screens; create and reveal are centered on narrow screens, with the secret panel left-aligned when shown.

## 5) Signature element and motion
- Signature: a subtle seal badge on the share link panel and on the “used” state, rendered as a single soft ring with a tiny check or vanish icon.
- Motion: only on actual actions (spinner, seal pulse when a link is copied, secret reveal transition) and on reduced-motion fallback to no motion. No fade-up on every section; no hover animation on every card.

## 6) Copy deck
- Headline: “Send a secret. Keep the key to yourself.”
- Subhead: “GhostDrop encrypts in your browser before it reaches the server, so the message can vanish after one open.”
- CTA: “Create link”, “Copy link”, “Delete now”, “Open drop”, “Send your own secret”.
- Result: “Link created”, “This link can only be opened once”, “Expires at 7:42 PM” (local time).
- Errors: “This link is invalid or already used.” / “This drop is not available right now.” / “We could not connect. Check your connection and try again.” / “The password was wrong.” (only when password mode is present — not in this launch UI).
- FAQ answers: plain, active and honest; no scare-copy, no superlatives.
- Rules: sentence case; no all-caps eyebrow labels; no “A · B · C”; no arrows in button labels.

## 7) Component inventory
- `Header`: wordmark, navigation, compact variant for reveal.
- `Footer`: Security, Terms, Privacy, optional contact link.
- `Button`: primary, secondary, destructive, small icon CTA.
- `Field` and `Textarea`: tokenized states for hover, focus and error.
- `SegmentedControl`: expiry and view selector.
- `Alert`: error and ephemeral status banners.
- `CopyButton`: simple copy interaction with success microstate.
- `Spinner`: centered and understated.
- `LinkDisplay`: monospace key display with clear server/browser split.
- `SecretView`: reveal container with “shown”, “gone” and “error” variants.
- Existing UI maps cleanly onto these; no logic or state shape changes are required.

## 8) Accessibility floor
- Keyboard: full tab order, visible focus ring, no hover-only action.
- Semantic structure: `header`, `main`, `section`, `footer`, `nav` and `aria-live` for status updates.
- Skip link: “Skip to content” as the first interactive element.
- Zoom: layout stays usable at 200% and from 360 px up.
- Reduced motion: `prefers-reduced-motion` disables non-essential animations.

## 9) Self-review against generic defaults
- Rejected cream + serif + terracotta because it reads historical and warm, not precise and zero-knowledge.
- Rejected near-black + acid accent because it can feel loud and generic; we keep the dark shell but use a calmer violet and softer contrast.
- Rejected broad hairlines and identical cards because this product should signal trust, not sameness.
- Rejected gradient washing as the main visual because it hides the clarity the product needs.
- Rejected all-caps labels because they make the interface feel like a dashboard rather than a calm, private interaction.

## 10) Verified sources to quote
- `docs/FORMAT.md`: password/key rules, browser-side encryption, optional URL fragment key.
- `docs/architecture.md`: server stores only ciphertext, zero-knowledge browser flow, no accounts, browser encryption via WebCrypto.
- `web/next.config.ts`: CSP and noindex behavior.
- `backend/` and `web/src/lib/**`: current verified flows and state handling, not changing logic.
- `frontend_plan.md` was not present in this checkout, so the design uses `docs/frontend.md` as the closest authoritative plan.

## 11) Scope and guardrails
- Do not add password mode, files, report link or analytics.
- Do not touch `src/lib/**`, tests or backend logic.
- Keep the home and public pages honest about limits and what the site can and cannot see.
- Use `next/font` and local CSS, not external fonts or scripts.
