# bun-react-tailwind-shadcn-template

To install dependencies:

```bash
bun install
```

To start a development server:

```bash
bun dev
```

To run for production:

```bash
bun start
```

## GitHub Pages

This repo includes a GitHub Actions workflow that builds and deploys `dist` to
GitHub Pages on push to `main` or `master`.

Setup steps:

1. Push this repo to GitHub.
2. In GitHub, open Settings → Pages.
3. Set Source to "GitHub Actions".
4. The site will be available at `https://<user>.github.io/<repo>/`.

Local build for Pages:

```bash
bun run build.ts --public-path=/<repo>/
```

This project was created using `bun init` in bun v1.3.3. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
