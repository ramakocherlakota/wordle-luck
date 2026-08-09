# Feature Specification: Wordle Luck (wordle-pal-2.0)

**Feature Branch**: `001-wordle-luck-rater`

**Created**: 2026-07-28

**Status**: Draft

**Input**: User description: "follow the instructions in ./app.md — a stripped-down modern rebuild of the Wordle Pal 'Luck' experience: pick a target answer, pick the words that were guessed, submit to the existing wordle-svc backend, and see each guess rated for how lucky it was, with per-guess access to the remaining possible answers."

## Clarifications

### Session 2026-08-08

- Q: Should Submit be enabled as soon as one guess is entered (i.e., without a target selected)? → A: No — Submit is enabled only when a target **and** at least one guess are selected (confirms existing FR-006; no change).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Rate the luck of a completed Wordle game (Priority: P1)

A player has just finished a standard Wordle puzzle. They open the app, choose the puzzle's target answer, enter the sequence of words they guessed, and submit. After a short wait, the app shows a table with one row per guess: the guess word, the score (color pattern) that guess would have produced against the target, and a luck rating that tells them how lucky or unlucky that guess was.

**Why this priority**: This is the core reason the app exists. Without it, nothing else has value. It is the minimum viable product on its own.

**Independent Test**: Select a valid target word, enter one or more valid guess words, submit, and confirm the app displays a rating row for each guess containing the guess, its score, and a numeric luck value truncated to 3 decimal places.

**Acceptance Scenarios**:

1. **Given** the app is open with no selections, **When** the user selects a target word and enters at least one guess word and clicks Submit, **Then** the app calls the backend and displays a results table with a row for each rated guess showing GUESS, SCORE, LUCK, and REMAINING columns.
2. **Given** a target and guesses are selected, **When** the user clicks Submit, **Then** the app shows clear "waiting" feedback (e.g., a progress indicator with elapsed time) until results return, because the backend call can take a long time.
3. **Given** results have been returned, **When** the user views the LUCK column, **Then** each luck value is displayed truncated to 3 decimal places.
4. **Given** the user has not selected a target, or has not entered any guesses, **When** they look at the Submit control, **Then** Submit is unavailable (disabled) until both a target and at least one guess are provided.

---

### User Story 2 - Inspect remaining possible answers after a guess (Priority: P2)

While reviewing the ratings, the player wants to understand which answers were still possible at each point in the game. For any guess row, they click a control in the REMAINING column and see a popup listing every answer word that was still consistent with the guesses (and their scores) up to and including that guess.

**Why this priority**: This deepens the insight the app provides and is explicitly requested, but the app still delivers value without it. It builds directly on the results table from Story 1.

**Independent Test**: With a results table displayed, click the REMAINING control on a specific guess row and confirm a popup appears listing the remaining possible answer words for that point in the game, and that the popup can be dismissed.

**Acceptance Scenarios**:

1. **Given** a results table is displayed, **When** the user activates the REMAINING control on a guess row, **Then** a popup opens showing the list of answer words still possible after that guess.
2. **Given** the remaining-answers popup is open, **When** the user dismisses it, **Then** the popup closes and the results table remains visible and unchanged.
3. **Given** a guess that solved the puzzle (the target itself), **When** the user views its remaining list, **Then** the list contains only the target word.

---

### User Story 3 - Enter more than six guesses (Priority: P3)

A player who used a non-standard variant (or simply wants to record more attempts) needs to enter more than the six guesses a standard Wordle allows. The app shows six guess entry slots by default and lets the player add additional slots on demand.

**Why this priority**: Standard Wordle is capped at six guesses, so six slots cover the common case. Supporting extra guesses is a convenience for variants and edge cases and is not required for the core experience.

**Independent Test**: Confirm six empty guess slots are shown initially, use the "add guess" control to create additional slots beyond six, and confirm a guess entered in an added slot is included when submitting.

**Acceptance Scenarios**:

1. **Given** the app is open, **When** the user views the guess entry area, **Then** exactly six guess entry slots are shown by default.
2. **Given** six guess slots are shown, **When** the user activates the "add guess" control, **Then** an additional guess entry slot appears.
3. **Given** the user has added extra slots and filled some of them, **When** they submit, **Then** all non-empty guesses (including those in added slots) are sent to the backend and rated.

---

### User Story 4 - Clear the target and guesses (Priority: P3)

After reviewing one game, the player wants to start fresh. They click Clear and the target selection and all guess selections are emptied so they can enter a new game.

**Why this priority**: A convenience that improves repeat use but is not essential to delivering the core rating value.

**Independent Test**: With a target and several guesses selected, click Clear and confirm the target and all guess slots are reset to empty.

**Acceptance Scenarios**:

1. **Given** a target and one or more guesses are selected, **When** the user clicks Clear, **Then** the target selection and all guess selections are reset to empty.
2. **Given** results are displayed, **When** the user clicks Clear, **Then** the input is reset ready for a new game.

---

### Edge Cases

- **Word not in the allowed list**: The target selector offers only valid answer words; the guess selectors offer only valid guess words (the union of the answer list and the guess list). A word that is not in the relevant list cannot be selected/submitted.
- **Guess list bug in legacy data**: Because the legacy guess list is missing some words that are valid answers, the allowed guess set MUST be the union of the answer words and the guess words, so any valid answer can also be entered as a guess.
- **Empty guess slots between filled ones**: Blank guess slots are ignored; only non-empty guesses are submitted, preserving their order.
- **No guesses entered / no target selected**: Submit is unavailable until both a target and at least one guess are present.
- **A guess equal to the target (solved)**: The game is solved at that guess; ratings stop being meaningful after a solved guess, and the solved guess's remaining list is just the target.
- **Long-running backend call**: The backend computation can take a long time; the app must keep showing responsive waiting feedback and not appear frozen, and must tolerate a long response window without prematurely giving up.
- **Backend error or unreachable service**: If the backend returns an error or cannot be reached, the app must show a clear, human-readable error message rather than failing silently, and allow the user to retry.
- **Re-submitting after changing inputs**: Changing the target or guesses after viewing results lets the user submit again to get updated ratings.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST let the user select a single target word from the list of valid Wordle answer words, using a type-to-filter word selection widget (choosing from a list, not free-form typing of arbitrary words).
- **FR-002**: The app MUST let the user select each guessed word from the set of valid guess words, using the same type-to-filter word selection widget.
- **FR-003**: The set of valid guess words MUST be the union of the answer word list and the guess word list, so that every valid answer is also selectable as a guess.
- **FR-004**: The lists of valid answer words and valid guess words MAY be bundled with the app (hardcoded) rather than fetched from the backend.
- **FR-005**: The app MUST display six guess entry slots by default and provide a control to add additional guess slots beyond six.
- **FR-006**: The app MUST provide a Submit control that is enabled only when a target word and at least one guess word have been selected.
- **FR-007**: On Submit, the app MUST send the selected target and the non-empty guesses (in order) to the existing wordle-svc backend to obtain a luck rating for each guess. Scores for each guess are derived from the target and do not need to be entered by the user.
- **FR-008**: While the backend request is in progress, the app MUST show clear waiting feedback that indicates work is ongoing (e.g., a progress indicator and elapsed time) and MUST tolerate a long response time without appearing frozen.
- **FR-009**: On a successful response, the app MUST display a results table with the columns, in order: GUESS, SCORE, LUCK, REMAINING.
- **FR-010**: In the results table, GUESS MUST show the guessed word, SCORE MUST show the score/color pattern for that guess against the target, and LUCK MUST show the backend-provided luck value truncated to 3 decimal places.
- **FR-011**: The REMAINING column MUST provide, for each guess row, a control that opens a popup listing the answer words still possible after that guess (given the guesses and scores up to and including that row).
- **FR-012**: The remaining-answers popup MUST be dismissible and MUST return the user to the unchanged results table when closed.
- **FR-013**: The app MUST provide a Clear control that resets the target selection and all guess selections to empty.
- **FR-014**: The app MUST handle backend errors and unreachable-service conditions gracefully by showing a clear, human-readable message and allowing the user to try again.
- **FR-015**: The app MUST scope its functionality to standard Wordle (a single target answer with an ordered list of guesses); variant modes (e.g., Quordle, Sequence) and settings such as hard mode are out of scope for this version.
- **FR-016**: The app MUST present a clean, aesthetically pleasing, responsive interface suitable for reviewing a completed puzzle.

### Key Entities *(include if feature involves data)*

- **Target Word**: The puzzle's answer for this game. A single five-letter word chosen from the valid answer list.
- **Guess Word**: A word the player entered during the game. Chosen from the valid guess set (union of answers and guesses). An ordered list of guesses forms the game to be rated.
- **Answer Word List**: The complete set of words that can be a Wordle answer; the source of target choices.
- **Guess Word List**: The complete set of words that can be entered as a guess; combined (unioned) with the answer list to form the selectable guess set.
- **Score**: The color/letter pattern a guess produces against the target (e.g., which letters are correct, present, or absent). Provided by the backend per guess; not entered by the user.
- **Luck Rating**: A numeric measure, returned by the backend for each guess, of how lucky that guess was relative to what was expected. Displayed truncated to 3 decimal places.
- **Remaining Answers**: For a given point in the game, the set of answer words still consistent with all guesses and their scores up to and including that guess. Retrieved from the backend and shown in a popup.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user who has just finished a Wordle game can select the target, enter their guesses, and reach a fully populated ratings table in fewer than 5 interaction steps beyond entering their words.
- **SC-002**: For every submitted game, the results table shows exactly one row per **rated** guess — the backend rates each guess up to and including the one that solves the puzzle; any guesses entered after the solve are not rated — each with a guess, a score, and a luck value truncated to 3 decimal places.
- **SC-003**: 100% of luck values displayed are shown to exactly 3 decimal places.
- **SC-004**: During any backend call, the user always sees an active waiting indicator within 1 second of pressing Submit and continuously until results or an error appear, so the app never appears frozen.
- **SC-005**: From any results table, a user can open the remaining-answers list for any guess row and close it again, returning to the same table, in at most two interactions.
- **SC-006**: The guess selector accepts every valid answer word as a guess (verifying the union requirement), including words missing from the raw legacy guess list.
- **SC-007**: When the backend is unreachable or returns an error, 100% of such cases result in a visible, human-readable message rather than a blank or frozen screen.
- **SC-008**: A user can go from a completed, rated game to a cleared, ready-for-new-input state with a single Clear action.
- **SC-009**: The app's core logic is covered by automated unit tests demonstrating the rating flow, the union guess set, luck truncation, and error handling.

## Assumptions

- **Backend reuse**: The app is front-end only and relies on the existing wordle-svc backend (the same service used by the legacy Wordle Pal) for luck ratings and remaining-answer lists. The backend contract mirrors the legacy app's `rate_solution` (target + guesses → per-guess luck ratings) and `remaining_answers` (guesses + scores → remaining answer words) requests. The backend's location/base URL is a deployment/configuration detail resolved during implementation.
- **Standard Wordle only**: Scope is limited to single-target standard Wordle. Legacy variant modes (Quordle, Sequence), "all guesses" mode, and hard mode are excluded from this version.
- **Score entry not required**: Because a target is always chosen, the backend can derive each guess's score from the target, so the user does not manually enter color/score patterns for the luck flow. The scores returned for each guess are reused to fetch that row's remaining-answers list.
- **Remaining list fetched on demand**: The list of remaining possible words for a row is retrieved when the user opens that row's popup, rather than all lists being fetched up front (an implementation detail chosen for responsiveness; either approach satisfies the requirements).
- **Bundled word lists**: The valid answer and guess word lists are bundled with the app (derived from the legacy `AnswerOptions` and `GuessOptions` data), not fetched from the backend.
- **Default six guesses**: Six guess slots is the sensible default for standard Wordle; additional slots are opt-in via an add-guess control with no fixed upper bound implied by the core experience.
- **Modern front-end**: The app is a modern, TypeScript-based front-end with unit-test coverage and pleasing, responsive styling (specific technology choices to be finalized in planning; not part of this spec's scope).
- **Connectivity**: Users have network access to reach the backend service.
