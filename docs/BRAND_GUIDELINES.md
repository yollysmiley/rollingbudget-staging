# Rolling Budget Brand Guidelines

This document is the source of truth for visual brand decisions in the Rolling Budget web application and its authentication communications. Update it whenever the approved logo, palette, typography, or brand voice changes.

## Brand identity

- **Product name:** Rolling Budget
- **Tagline:** Plan smarter. Grow stronger.
- **Brand personality:** Clear, calm, confident, practical, and encouraging.
- Use the exact product name "Rolling Budget". Do not substitute generic names such as "Budget App" in customer-facing UI.

## Logo

The approved primary mark is the three-bar Rolling Budget symbol introduced in PR #18.

### Construction

The mark is currently implemented as CSS in `rollover-budget-app.html`:

- Three vertical bars aligned to a shared baseline.
- Bar widths: 9px on desktop; 8px at the mobile breakpoint.
- Desktop heights: 17px, 26px, and 36px.
- Mobile heights: 15px, 23px, and 32px.
- Desktop gap: 5px; mobile gap: 4px.
- Rounded corners: 3px.
- Short and medium bars use `#8B7CFF`; the tallest bar uses `#B1A6FF`.

The logo must be reused in the site header and all authentication dialogs (sign in, account creation, and password recovery). Keep all three bars in their original order and proportions. Do not stretch, crop, rotate, redraw as a generic finance icon, or replace it with a text glyph.

If the mark is later moved into a shared SVG or image asset, preserve this approved geometry and update this document with the asset path.

## Color palette

### Brand and header colors

| Token / use | Value |
| --- | --- |
| Header background | `#17152B` |
| Header border | `#302D4B` |
| Primary logo bars | `#8B7CFF` |
| Highlight logo bar | `#B1A6FF` |
| Wordmark highlight | `#A99CFF` |
| Header text | `#FFFFFF` |
| Header supporting text | `#C8C3E2` |
| Mobile header controls | `#24213D` |
| Mobile header control border | `#494465` |
| Mobile header hover background | `#302C50` |

### Application interface palette

The current application also retains functional UI colors defined in the `:root` CSS variables. These are interface colors, not replacements for the approved logo/header colors:

| Token | Current value |
| --- | --- |
| `--bg` | `#f8f7fc` |
| `--panel` | `#ffffff` |
| `--panel-2` | `#f3f0fa` |
| `--border` | `#e5e1f2` |
| `--text` | `#181326` |
| `--muted` | `#645e78` |
| `--accent` | `#7c3aed` |
| `--accent-hover` | `#6d28d9` |
| `--accent-soft` | `#ede9fe` |

When modernizing controls, favor the approved brand purple family while preserving contrast and the existing meaning of status colors (success, warning, and destructive actions). Do not silently change the functional palette globally; make coordinated palette changes through a reviewed UI update.

## Typography

The application currently declares this system font stack:

```css
font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
```

- Prefer the existing stack for consistency across platforms.
- Inter is a preferred available font, not a guaranteed downloaded web font. Do not claim it is always loaded unless a font asset or approved font service is added.
- Use clear hierarchy: strong, compact headings; readable body copy; restrained uppercase labels for metadata.
- Preserve the application's existing antialiasing and line-height conventions unless a reviewed accessibility or responsive change requires otherwise.
- Avoid introducing a second unrelated font family.

## Authentication dialog rules

- Display the approved three-bar mark above the heading in Sign In, Create Account, and Forgot Password views.
- Use the exact product name and supportive, plain-language copy.
- Keep labels visible; placeholders are examples, not substitutes for labels.
- Use the brand palette for primary actions and accessible contrast for all text.
- Show validation and authentication feedback close to the relevant form where possible.
- Keep the dialog usable on narrow screens, with full-width controls and no horizontal overflow.

## Buttons and responsive use

- Use a consistent hierarchy: primary, secondary, tertiary/text, and destructive.
- Keep button typography, radius, height, focus, hover, and disabled states consistent.
- Provide touch targets of at least 44px on mobile where practical.
- Avoid crowded button rows; stack actions when the viewport is narrow.
- Preserve distinct desktop and mobile navigation/layout implementations. Shared brand tokens may be reused, but responsive interaction logic should remain separated.

## Brand voice and content

- Be concise, reassuring, and action-oriented.
- Prefer familiar language over technical jargon.
- Explain the benefit of an action before asking the user to take it.
- Avoid unsupported security promises or claims such as "100% secure".

## Change control

Before introducing a new logo, color, font, or brand phrase:
1. Check this document and the current approved UI.
2. Reuse existing brand assets and tokens where possible.
3. Update this document when the approved standard changes.
4. Add or update regression tests for brand-critical UI, including desktop and mobile.
