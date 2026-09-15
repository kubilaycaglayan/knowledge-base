# Session Tracker Acceptance Criteria

## Path dropdown

- [ ] The path control uses the same visual language as the Knowledge Base application, including borders, colors, typography, spacing, corner radius, and chevron treatment.
- [ ] The path control has the same height as the labels control when displayed side by side.
- [ ] The selected path text is vertically centered within the control.
- [ ] Opening the path dropdown does not show “Choose a path” as an option.
- [ ] “＋ Add a new path…” is the first item in the dropdown.
- [ ] A visible separator appears immediately after “＋ Add a new path…”.
- [ ] Active paths appear after the separator and remain selectable.
- [ ] Selecting an existing path updates the control to show that path.
- [ ] Selecting “＋ Add a new path…” preserves the existing create-path flow.
- [ ] Keyboard users can open the dropdown, move through options, select an option, and close the dropdown.

## Labels picker

- [ ] The labels control preserves the existing application design, including chip styling, colors, borders, padding, margins, and chevron treatment.
- [ ] When closed, labels are displayed as chips in a compact single-row area.
- [ ] Selected labels have priority over unselected labels in the visible closed area.
- [ ] Unselected labels remain visible when there is room after selected labels are displayed.
- [ ] When open, labels are displayed as a wrapping flex list so multiple chips can appear on each row.
- [ ] Selecting a label expands the labels picker when it is collapsed.
- [ ] Unselecting a label expands the labels picker when it is collapsed.
- [ ] Selecting a label marks it as selected without removing other selected labels.
- [ ] Unselecting a label removes only that label from the selected set.
- [ ] Clicking the labels chevron toggles the picker between open and closed states.
- [ ] Clicking outside the labels picker closes it.
- [ ] Moving focus away from the labels picker closes it where the existing interaction supports focus-based dismissal.
- [ ] Closing the picker restores the compact visible area instead of retaining the expanded height.
- [ ] The labels summary displays the available count, for example `7 available`.
- [ ] When labels are selected, the summary also displays the selected count, for example `7 available · 3 selected`.
- [ ] The create-label input and “Create label” button remain available in both picker states.
- [ ] Creating a label keeps the existing behavior and makes the new label available for selection.
- [ ] Keyboard users can focus the label chips, select and unselect them, toggle the picker, and dismiss it without a pointer.
- [ ] Label buttons expose their selected state through an accessible pressed-state attribute.
- [ ] The chevron exposes whether the labels picker is expanded or collapsed.

## Cross-client consistency

- [ ] The path dropdown behavior and styling are applied consistently in the web application, Chrome extension, and iOS application where the session tracker is available.
- [ ] The labels picker behavior and styling are applied consistently in the web application, Chrome extension, and iOS application where labels are available.
- [ ] The controls remain usable at mobile touch target sizes and do not require precise tapping.
- [ ] The controls remain usable with long path names, long label names, many labels, and no available labels.

## Verification

- [ ] Unit/component tests cover path ordering and separator rendering.
- [ ] Unit/component tests cover label selection, unselection, selected-label prioritization, summary counts, expansion, and outside-click collapse.
- [ ] Integration or regression tests cover opening and closing the path dropdown and labels picker through user interaction.
- [ ] Tests cover the corresponding Chrome extension behavior where the session tracker is exposed.
- [ ] Tests cover the corresponding iOS behavior where the session tracker is exposed.
- [ ] Frontend type-checking, build, and relevant accessibility checks pass.
- [ ] Chrome extension JavaScript syntax checks pass.
- [ ] iOS package/build tests pass in an Xcode-capable environment.
