# Codex

A desktop application built with Next.js, Electron, and shadcn/ui.

## Prerequisites

- [Node.js](https://nodejs.org) (v18+)
- [Yarn](https://yarnpkg.com)

## Setup

```bash
yarn install
```

## Development

```bash
# Next.js only
yarn dev

# Full Electron + Next.js
yarn electron:dev
```

## Build

```bash
yarn electron:build
```

## Preview Production Build

```bash
yarn electron:preview
```

## Tech Stack

- **Next.js 16** — App Router, TypeScript, Tailwind v4
- **Electron** — Desktop shell with secure context isolation
- **shadcn/ui** — Component library
