# Decks and posters: sources

How the info material is made and maintained. Readers find the PDFs on the [Info material](user/material.md) page.

Two sets of material in German, each a deck (16:9) and a poster (A3 portrait), written as [Marp](https://marp.app) Markdown: sources in [`pitches/`](pitches/) and [`posters/`](posters/). All share the theme in [`pitches/examance-theme.css`](pitches/examance-theme.css), which reuses the app's dark-theme colour tokens, navbar, chips and step markers so the material reads as part of the product. Screenshots are taken in the app's dark theme to match. Keep it at these two sets; adapt them instead of adding audience variants.

| Set | Deck | Poster | Audience and focus |
|---|---|---|---|
| UI | [PDF](pitches/examance-ui.pdf) · [source](pitches/examance-ui.md) | [PDF](posters/examance-ui.pdf) · [source](posters/examance-ui.md) (2 pages) | Everyone. A screenshot tour: creating exams, grading on paper or screen, results; privacy in one card |
| Information | [PDF](pitches/examance-info.pdf) · [source](pitches/examance-info.md) | [PDF](posters/examance-info.pdf) · [source](posters/examance-info.md) (2 pages) | People who evaluate critically: computer science teachers, school leadership, data protection officer, IT. Workflow, architecture, what the server can read, key hierarchy, sign-in, storage modes, admin role, operating models, known limits, open decisions, pilot |

## Rules for these materials

- Inform, don't advertise: state what the product does, what it does not do and what is still open. Every claim must match the code and [`data_flow_and_security.md`](data_flow_and_security.md) / [`legal_audit_dsgvo.md`](legal_audit_dsgvo.md); update the decks and diagrams when those change.
- Screenshots are real captures of the current UI with demo data only ([inventory](screenshots/pitch/README.md)), produced by the reproducible [demo instance](demo-instance/README.md). No mock-ups, no real pupil data.
- Teachers mostly care about creating exams and may keep grading on paper: lead with the library, editor and exam builder, and present scanning as an option.
- The legal documents are working templates; the decks say so and must keep saying so.

## Generated sources

- `posters/make-ui.py` writes both UI sources (poster and deck) from one caption list. The poster layout is sized to the page: justified rows (each figure's `flex-grow` is its aspect ratio) or two columns whose widths make both fill the height, whichever leaves less blank space. Captions are one line of what is shown plus the benefit in green.
- `pitches/diagrams/make-diagrams.py` writes the SVG diagrams of the information set (pipeline, pseudonymisation, key hierarchy, sign-in, what the server sees, storage modes, roles, deployment). They use the poster's print palette, so they work in both deck and poster.

## Rendering

Run from the source's directory (input file first, since `--theme-set` takes several values):

```
npx @marp-team/marp-cli <source.md> --pdf --html --allow-local-files \
  --theme-set ../pitches/examance-theme.css --theme-set ../posters/examance-poster.css -o <source.pdf>
```

Posters use the `examance-poster` theme (A3, `size: a3`), which imports the slide theme and overrides the colours with a higher-contrast print palette (dark greys print muddy on office printers).

The app ships the two committed poster PDFs on its public posters page (`/about`, linked from the sign-in page as "Posters: features & privacy"; `frontend/src/lib/about/posters.ts`, issue #119). They are bundled at build time, so re-render and commit the PDF whenever a poster's `.md` changes; the next deployment picks it up.
