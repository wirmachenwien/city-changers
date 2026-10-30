## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Design assets

Do not re-render mascot videos unless the user explicitly instructs you to do so.
Dependency upgrades, still-pose edits, packaging and freshness checks are not
permission to regenerate videos. Inspect `npm run design:plan` before generation;
avoid the broad `design:build` command when it would render videos. Preserve the
existing MOV files and generate only the requested assets.
For static-only edits, use `python3 design/scripts/build-design.py --stills`.

## Colors

`design/colors.json` is the color source of truth. Use semantic CSS variables
in interface and export styles, not hardcoded colors or ad-hoc mixes. Update
the registry and run `npm run colors:generate`, then `npm run colors:check`.
Do not edit generated color CSS/JSON, the generated Colors section of the
brand guide, or `design/colors-reference.md` by hand. Artwork colors are
protected references; changing the registry is not permission to recolor or
regenerate mascots. Exceptions need an explicit reason in the registry.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
