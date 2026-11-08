# Requirements

Each requirement has a stable ID that tests, commits (`Refs:`) and the roadmap reference.
Format: `FR-<AREA>-<NN>` for functional, `NFR-<AREA>-<NN>` for non-functional. Never renumber;
retire an ID by marking it `(withdrawn)`.

Write each as one observable behaviour with its acceptance criteria, so it maps to tests:

## <Area name> (AREA)
- **FR-AREA-01** — <actor> can <do something> so that <outcome>.
  - Given <state>, when <action>, then <observable result>.
  - Edge: <boundary or failure case and the expected result>.

TODO(kickoff): replace this template with the project's requirements.
