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

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
