# Keystone Music HQ

Studio operations prototype for teachers and families.

## Development

Requires [Bun](https://bun.sh).

```sh
git clone <this-repository-url>
cd <repository-name>
bun install
bun run dev
```

Other scripts:

```sh
bun run test
bun run build
bun run lint
```

## Deploy

`main` deploys to Vercel (Nitro preset `vercel`). Pull requests get Vercel preview deployments.
