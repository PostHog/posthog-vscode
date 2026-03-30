Review the UX of a feature or component in this extension.

For every element under review, evaluate against our design principles:

1. **User problem**: What problem does this solve? If the answer is unclear, flag it for removal or simplification.

2. **Usability**:
   - Is the information hierarchy clear?
   - Can the user accomplish their goal without thinking?
   - Are there unnecessary steps or clicks?
   - Is the feedback immediate and obvious?

3. **Visual quality**:
   - Does it look polished and intentional?
   - Is spacing, alignment, and typography consistent?
   - Does it feel native to VS Code while being distinctly PostHog?

4. **PostHog brand**:
   - Are we using brand colors correctly? (#1D4AFF blue, #F9BD2B yellow, #F54E00 orange)
   - Does the tone match PostHog's personality (direct, developer-friendly, slightly playful)?
   - Are icons and visual metaphors consistent?

5. **Information density**:
   - Are we showing too much? Too little?
   - What's the minimum information needed for the user to make a decision?
   - Can anything be moved to a hover, detail view, or dropped entirely?

6. **Edge cases**:
   - Empty states — what does the user see when there's no data?
   - Error states — what happens when the API fails?
   - Loading states — is there feedback while data loads?
   - Long content — does text truncate gracefully?

Output a concrete list of issues with severity (critical / should-fix / nice-to-have) and specific recommendations for each.
