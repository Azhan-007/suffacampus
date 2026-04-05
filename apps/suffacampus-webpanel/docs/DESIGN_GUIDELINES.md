# SuffaCampus Design Guidelines

> Internal reference for maintaining visual consistency across the SuffaCampus admin panel.

---

## Design Principles

1. **Calm over clever** â€” No gimmicks. Every visual choice should reduce noise, not add it.
2. **Consistent density** â€” Use the 8pt grid. Spacing should feel rhythmic and predictable.
3. **Hierarchy through weight, not color** â€” Use font-weight and size to guide attention. Reserve color for status and CTAs.
4. **Flat and functional** â€” No gradients on backgrounds, no heavy shadows. Depth comes from borders and subtle elevation.

---

## Color Tokens

| Token | Value | Usage |
|-------|-------|-------|
| Page background | `#F8FAFC` (`bg-[#F8FAFC]`) | Main content area |
| Card background | `#FFFFFF` | All cards, modals, dropdowns |
| Primary | `#2563EB` (`blue-600`) | CTAs, active nav, links |
| Border | `#E2E8F0` (`slate-200`) | Cards, inputs, table rows |
| Section header bg | `bg-slate-50` | Card headers, table headers |
| Text primary | `text-slate-900` | Headings, important values |
| Text secondary | `text-slate-500` | Descriptions, helper text |
| Text muted | `text-slate-400` | Timestamps, captions |

### Status Colors

| Status | Text | Background |
|--------|------|------------|
| Success | `text-emerald-700` | `bg-emerald-50` |
| Warning | `text-amber-700` | `bg-amber-50` |
| Error | `text-red-700` | `bg-red-50` |
| Info | `text-blue-700` | `bg-blue-50` |

---

## Typography

| Element | Class | Example |
|---------|-------|---------|
| Page title | `text-2xl font-semibold text-slate-900 tracking-tight` | Dashboard heading |
| Section title | `text-sm font-semibold text-slate-800` | Card headers |
| Body text | `text-sm text-slate-600` | Table cells, descriptions |
| Small / caption | `text-xs text-slate-500` | Badges, timestamps |
| Input label | `text-sm font-medium text-slate-700` | Form labels |

### Forbidden Patterns

- `text-[13px]`, `text-[11px]`, `text-[10px]` â€” Use `text-sm` or `text-xs` instead
- `font-bold` on UI elements â€” Use `font-semibold` for headings, `font-medium` for buttons and labels
- Gradient text (`bg-clip-text text-transparent`) â€” Use solid `text-slate-900`

---

## Spacing

All spacing follows an **8pt grid** using Tailwind's default scale:

| Use case | Value |
|----------|-------|
| Card padding | `p-6` |
| Section gaps | `gap-6` |
| Grid gaps | `gap-6` |
| Input height | `h-11` |
| Button height | `h-10` (default), `h-11` (large) |
| Page container | `mx-auto max-w-7xl p-6 lg:p-8` |

---

## Border Radius

| Element | Radius |
|---------|--------|
| Cards, modals | `rounded-xl` |
| Inputs, buttons, badges | `rounded-lg` |
| Pill toggles | `rounded-full` |

### Forbidden

- `rounded-2xl` â€” Too soft for enterprise UI
- `rounded-3xl` â€” Never use

---

## Shadows

Shadows are intentionally subtle. Defined as CSS variables in `globals.css`:

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-card` | `0 1px 2px rgba(0,0,0,0.04)` | Cards, stat boxes |
| `--shadow-dropdown` | `0 4px 16px rgba(0,0,0,0.08)` | Dropdowns, popovers |

### Forbidden

- `shadow-lg`, `shadow-xl` â€” Too heavy for a professional panel
- `shadow-blue-500/25` or any colored shadows â€” Not enterprise standard
- `shadow-inner` â€” Not used

---

## Component Patterns

### Cards

```html
<div className="bg-white rounded-xl border border-slate-200"
     style={{ boxShadow: 'var(--shadow-card)' }}>
  <!-- Header -->
  <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
    <h3 className="text-sm font-semibold text-slate-800">Title</h3>
  </div>
  <!-- Body -->
  <div className="p-6">
    ...
  </div>
</div>
```

### Buttons

- Primary: `bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg h-10`
- Secondary: `bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-lg h-10`
- No `active:scale-*` transforms
- No colored shadows on buttons

### Inputs

```
h-11 rounded-lg border border-slate-200 text-sm
focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500
```

### Tables

- Sticky header: `bg-slate-50 sticky top-0`
- Header text: `text-xs font-medium text-slate-500 uppercase tracking-wider`
- Cell text: `text-sm text-slate-600`
- Row padding: `px-6 py-4`
- Container: `rounded-xl border border-slate-200`

### Badges

- Background + text only (e.g., `bg-emerald-50 text-emerald-700`)
- `text-xs font-medium rounded-lg px-2.5 py-1`
- No `ring-*` borders

### Modals

- `rounded-xl` container
- Header: `bg-slate-50 border-b border-slate-200`
- Shadow: `var(--shadow-dropdown)`

---

## Sidebar Navigation

- **Active item**: `border-l-2 border-l-blue-600 bg-blue-50 text-blue-700`
- **Inactive item**: `text-slate-500 hover:bg-slate-50`
- **Section labels**: `text-[11px] font-medium text-slate-400 uppercase tracking-wider`
- **No colored icon chips** â€” Icons inherit the text color

---

## Animation & Motion

### Allowed

- `transition-colors` on hover states
- `animate-ping` for live indicators only
- `transition-all duration-700 ease-out` for progress bars

### Forbidden

- `hover:scale-*`, `active:scale-*`, `hover:-translate-y-*` â€” No scale transforms on cards/buttons
- `animate-fade-in` on page containers â€” Pages should render instantly
- `transition-all duration-300` for layout-level effects â€” Too dramatic

---

## File Reference

| File | Purpose |
|------|---------|
| `app/globals.css` | CSS variables and utility classes |
| `lib/designTokens.ts` | JS-accessible tokens (shadows, colors, formatters) |
| `tailwind.config.ts` | Extended Tailwind theme |
| `components/common/` | Shared UI primitives |

---

*Last updated: 2025*

