# context/updates/mobile_ui_parity_assets_standards.md

## 🔍 New Information (React Native & Metro Bundler Constraints)
When building high-fidelity visual parity between React web applications and React Native mobile apps, developers must address native bundler limits and type constraints:
1. **Static Asset Imports in Metro**:
   Unlike web packagers which support dynamic string imports, Metro bundlers do not support dynamic `require()` paths (e.g. `require('../../assets/badge/' + name)`). All required assets must be declared statically.
2. **Strict Theme Type Constraints**:
   React Native theme objects often narrow their property types to specific literal color values (e.g. `theme.backgroundElement: '#f5f0e0' | '#1a2a2a'`). Reassigning these properties to other theme colors or generic color strings triggers compiler errors (`TS2322`).
3. **Emoji Visual Accents**:
   To create premium visual feedback matching modern 3D designs, replacing standard flat Lucide icons (like `Flame`) with high-resolution native emojis (like `🔥`) provides a vibrant, lightweight mobile feel.

## 🛠️ Correct Implementation

### 1. Static Asset Mapping
Declare a static map helper function for dynamic assets (such as levels, ranks, or achievements):
```typescript
const getBadgeSource = (badgeUrl: string) => {
  if (badgeUrl.includes('seeker-badge-1')) return require('../../../assets/images/badge/seeker-badge-1.png');
  if (badgeUrl.includes('scribe-badge-2')) return require('../../../assets/images/badge/scribe-badge-2.png');
  // ...
  return require('../../../assets/images/badge/seeker-badge-1.png');
};
```

### 2. Broad Type Annotations for Style Variables
Avoid implicit variable typing when capturing theme variables that will be dynamically reassigned:
```typescript
// Correct
let cardBg: string = theme.backgroundElement;
if (isGold) {
  cardBg = theme.teal; // compiles successfully
}
```

### 3. Native Emoji Overlays
Render native emojis directly in `Text` tags with adjusted font sizes to present colorful, native 3D visual cues:
```tsx
<Text style={{ fontSize: 28 }}>🔥</Text>
```
