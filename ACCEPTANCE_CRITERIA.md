# Session Tracker Acceptance Criteria

## Path dropdown

- [x] The path control uses the same visual language as the Knowledge Base application, including borders, colors, typography, spacing, corner radius, and chevron treatment.
- [x] The path control has the same height as the labels control when displayed side by side.
- [x] The selected path text is vertically centered within the control.
- [x] Opening the path dropdown does not show “Choose a path” as an option.
- [x] “＋ Add a new path…” is the first item in the dropdown.
- [x] A visible separator appears immediately after “＋ Add a new path…”.
- [x] Active paths appear after the separator and remain selectable.
- [x] Selecting an existing path updates the control to show that path.
- [x] Selecting “＋ Add a new path…” preserves the existing create-path flow.
- [x] Keyboard users can open the dropdown, move through options, select an option, and close the dropdown.

## Labels picker

- [x] The labels control preserves the existing application design, including chip styling, colors, borders, padding, margins, and chevron treatment.
- [x] When closed, labels are displayed as chips in a compact single-row area.
- [x] Selected labels have priority over unselected labels in the visible closed area.
- [x] Unselected labels remain visible when there is room after selected labels are displayed.
- [x] When open, labels are displayed as a wrapping flex list so multiple chips can appear on each row.
- [x] Selecting a label expands the labels picker when it is collapsed.
- [x] Unselecting a label expands the labels picker when it is collapsed.
- [x] Selecting a label marks it as selected without removing other selected labels.
- [x] Unselecting a label removes only that label from the selected set.
- [x] Clicking the labels chevron toggles the picker between open and closed states.
- [x] Clicking outside the labels picker closes it.
- [x] Moving focus away from the labels picker closes it where the existing interaction supports focus-based dismissal.
- [x] Closing the picker restores the compact visible area instead of retaining the expanded height.
- [x] The labels summary displays the available count, for example `7 available`.
- [x] When labels are selected, the summary also displays the selected count, for example `7 available · 3 selected`.
- [x] The create-label input and “Create label” button remain available in both picker states.
- [x] Creating a label keeps the existing behavior and makes the new label available for selection.
- [x] Keyboard users can focus the label chips, select and unselect them, toggle the picker, and dismiss it without a pointer.
- [x] Label buttons expose their selected state through an accessible pressed-state attribute.
- [x] The chevron exposes whether the labels picker is expanded or collapsed.

## Cross-client consistency

- [x] The path dropdown behavior and styling are applied consistently in the web application, Chrome extension, and iOS application where the session tracker is available.
- [x] The labels picker behavior and styling are applied consistently in the web application, Chrome extension, and iOS application where labels are available.
- [x] The controls remain usable at mobile touch target sizes and do not require precise tapping.
- [x] The controls remain usable with long path names, long label names, many labels, and no available labels.

## Verification

- [x] Unit/component tests cover path ordering and separator rendering.
- [x] Unit/component tests cover label selection, unselection, selected-label prioritization, summary counts, expansion, and outside-click collapse.
- [x] Integration or regression tests cover opening and closing the path dropdown and labels picker through user interaction.
- [x] Tests cover the corresponding Chrome extension behavior where the session tracker is exposed.
- [x] Tests cover the corresponding iOS behavior where the session tracker is exposed.
- [x] Frontend type-checking, build, and relevant accessibility checks pass.
- [x] Chrome extension JavaScript syntax checks pass.
- [ ] iOS package/build tests pass in an Xcode-capable environment (added UI coverage; execution is pending an Apple toolchain).
