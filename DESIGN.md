# ApplyMate Visual System

This file records the approved stage 9 visual system shared by the browser prototype and native WXML/WXSS. Product requirements remain authoritative in `memory-bank/design-document.md`; native device acceptance is tracked separately in `memory-bank/progress.md`.

## Direction

Mode: **Operate**. ApplyMate should feel calm, trustworthy, and efficient during a repetitive mobile job-search task. It uses a warm paper-like canvas, precise dividers, and a single muted teal action color. It does not use gradients, decorative motion, large shadows, nested cards, or unsupported success claims.

The signature element is the **fact match line**: a thin line and teal nodes connecting confirmed resume facts, JD requirements, and the generated greeting. It appears only where source traceability helps the task.

## Tokens

- Canvas `#F2F4EF`, surface `#FFFFFF`, quiet surface `#EDF2EE`.
- Primary text `#17343B`, secondary text `#53676B`, faint text `#758589`.
- Primary action `#26766C`, pressed `#1D5F57`, soft state `#DEECE7`.
- Warning `#7C5428` on `#F8EAD7`; danger `#92483F` on `#F7E6E3`.
- Page gutter 32rpx, section gap 48rpx, content gap 20rpx.
- Main controls are at least 88rpx high. Corners use 16–32rpx according to hierarchy; pills are reserved for compact status labels.

## Typography and Structure

Use the native Chinese system stack. Page titles are compact and decisive; body text is at least 28–32rpx with comfortable line height. Each page has one primary action. Related rows form divided groups instead of separate cards. Secondary evidence and record operations use progressive disclosure.

## Interaction

Controls provide immediate opacity or color feedback without layout movement. Errors appear beside the affected field and retain user input. Loading disables duplicate submission. Keyboard focus is visible in the browser prototype; native implementation must preserve screen-reader order, system text scaling, safe areas, and platform back behavior.

Resume confirmation is a one-time fact review rather than a form-filling task. The page leads with AI-ranked strengths, separates low-confidence facts for review, and keeps one final save action visible. Market weights are explanatory priors only; every JD re-ranks confirmed facts automatically.

## Prototype Source

- `docs/phase-9-v2-preview/index.html`: review shell and direction contract.
- `docs/phase-9-v2-preview/styles.css`: tokens, components, responsive behavior, and states.
- `docs/phase-9-v2-preview/preview.js`: 13 synthetic screens and interactive review states; resume facts use lightweight confirmation, and JD submission proceeds directly to generation.
