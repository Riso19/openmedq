# Markdown Rendering & Lightbox Dialog Standards

This document establishes development standards for rendering formatted text (Markdown) and high-fidelity media overlays (Lightboxes) within the OpenMedQ web platform.

## 1. Markdown Rendering Standards

### Core Setup & Library
- **Vite & React 19 Compatibility**: Use the lightweight `marked` library to compile markdown string fields. Avoid ESM-only or complex dependency-tree components that trigger React 19 compiler warnings.
- **Pre-processing Custom Notations**: Medical questions frequently contain subscripts (chemical symbols, e.g. $H_2O$) and superscripts (ions, e.g. $Ca^{2+}$). Before parsing, convert markdown standard notations (`~sub~` and `^super^`) to safe HTML tags:
  ```typescript
  const processed = text
    .replace(/~([^~]+)~/g, '<sub>$1</sub>')
    .replace(/\^([^^]+)\^/g, '<sup>$1</sup>');
  ```
- **Inline Rendering (Option Choices)**: For list elements, option targets, or short badges, use the `inline` flag to parse markdown and strip the root `<p>` tag, preventing line-break gaps inside clickable buttons.

### Styling Constraints (Clay Design System)
- Target markdown tags using child-selector nesting under the `.markdown-content` CSS class:
  - Paragraphs: `.markdown-content p:not(:last-child) { margin-bottom: 0.75rem; }`
  - Inline Code: Styled with a soft background (`var(--clay-surface-soft)`) and a thin border (`var(--clay-hairline)`).
  - Images: Constrain max width (`max-width: 100%`) and add a pointer cursor to indicate zoom-on-click capability.

---

## 2. Lightbox Zoom Overlay Standards

To provide a premium clinical illustration zoom experience, we use native browser elements and modern CSS.

### Native HTML5 `<dialog>`
- **Top-layer Rendering**: Use `<dialog className="lightbox-dialog">` rather than generic `fixed` divs. Open it programmatically using `dialogRef.current?.showModal()`. This natively manages focus trapping, viewport scaling, and overlays in the top layer.
- **Native Dismiss**: Esc key closes the modal by default.

### Entry/Exit Animations
- Animate elements going to/from the top layer utilizing CSS `@starting-style` and discrete transition settings:
  ```css
  dialog.lightbox-dialog {
    opacity: 0;
    transform: scale(0.95);
    /* Allow transition of display and overlay discrete properties */
    transition: opacity 0.2s, transform 0.2s, display 0.2s allow-discrete, overlay 0.2s allow-discrete;
  }
  dialog.lightbox-dialog[open] {
    opacity: 1;
    transform: scale(1);
    @starting-style {
      opacity: 0;
      transform: scale(0.95);
    }
  }
  ```

### Light Dismiss Fallback
- Since `closedby` attribute support is still limited, implement a coordinate-based click handler on the dialog element itself to detect if a click occurred outside the image boundaries, programmatically calling `.close()`:
  ```typescript
  const handleDialogClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target !== lightboxRef.current) return;
    const rect = lightboxRef.current.getBoundingClientRect();
    const isInDialog = (
      rect.top <= e.clientY &&
      e.clientY <= rect.top + rect.height &&
      rect.left <= e.clientX &&
      e.clientX <= rect.left + rect.width
    );
    if (!isInDialog) {
      lightboxRef.current.close();
    }
  };
  ```
- Prevent event bubbling when clicking on the zoomed image itself.
