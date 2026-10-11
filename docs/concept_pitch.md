# Examance pitch index

Audience-specific decks (16:9) and posters (A3 portrait) in German. Each audience gets one deck and one poster; all six share the theme in [`pitches/examance-theme.css`](pitches/examance-theme.css), which reuses the app's dark-theme colour tokens, navbar, chips and step markers so the material reads as part of the product. Screenshots are taken in the app's dark theme to match.

| Audience | Deck | Poster | Focus |
|---|---|---|---|
| Computer science teachers (beta testers) | [PDF](pitches/examance-beta-cs.pdf) · [source](pitches/examance-beta-cs.md) | [PDF](posters/examance-beta-cs.pdf) · [source](posters/examance-beta-cs.md) | Pipeline, LaTeX, OMR, crypto architecture, known limits, how the beta works |
| Teachers | [PDF](pitches/examance-teachers.pdf) · [source](pitches/examance-teachers.md) | [PDF](posters/examance-teachers.pdf) · [source](posters/examance-teachers.md) | The workflow step by step, blind grading, privacy in plain words |
| School leadership, DPO, IT | [PDF](pitches/examance-administration.pdf) · [source](pitches/examance-administration.md) | [PDF](posters/examance-administration.pdf) · [source](posters/examance-administration.md) | What the server can and cannot read, admin role, operating models, open decisions, pilot |

## Rules for these materials

- Inform, don't advertise: state what the product does, what it does not do and what is still open. Every claim must match the code and [`data_flow_and_security.md`](data_flow_and_security.md) / [`legal_audit_dsgvo.md`](legal_audit_dsgvo.md); update the decks when those change.
- Screenshots are real captures of the current UI with demo data only ([inventory](screenshots/pitch/README.md)), produced by the reproducible [demo instance](demo-instance/README.md). No mock-ups, no real pupil data.
- Teachers mostly care about creating exams and may keep grading on paper: lead with the library, editor and exam builder, and present scanning as an option.
- The legal documents are working templates; the decks say so and must keep saying so.

## Rendering

Run from the source's directory (input file first, since `--theme-set` takes several values):

```
npx @marp-team/marp-cli <source.md> --pdf --html --allow-local-files \
  --theme-set ../pitches/examance-theme.css --theme-set ../posters/examance-poster.css -o <source.pdf>
```

Posters use the `examance-poster` theme (A3, `size: a3`), which imports the slide theme and overrides the colours with a higher-contrast print palette (dark greys print muddy on office printers).

UI tour poster for all audiences: [1 page](posters/examance-ui-tour.pdf) · [2 pages](posters/examance-ui-tour-2p.pdf) (sources alongside). Screenshots sit in justified rows (each figure's `flex-grow` is its aspect ratio), so dense screens get more width; captions are one line of what is shown plus the benefit in green.
