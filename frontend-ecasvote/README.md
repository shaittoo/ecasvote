# eCASVote frontend (Next.js)

Student, admin (SEB), and validator UIs for the eCASVote project. Communicates with the **gateway API** via `lib/ecasvoteApi.ts` (browser default base URL: `/ecasvote-gateway` rewrite to the real gateway unless `NEXT_PUBLIC_GATEWAY_URL` is set).

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Start the **gateway** (`ecasvote/gateway-api`, port **4000**) and the Fabric network first — see the repo root **[SETUP.md](../SETUP.md)**.

## Notable app paths

| Area | Path | Notes |
|------|------|--------|
| Public landing | `app/page.tsx` | Election **chooser**; defaults to latest **OPEN** (`lib/studentElectionDefaults.ts`); links pass `?election=` to student routes |
| Student candidates | `app/studentvoter/candidates/page.tsx` | Honors `?election=`; `CandidatesPositionsPanel` loads positions for selection |
| Student results | `app/studentvoter/results/page.tsx` | Honors `?election=` |
| Admin scanning | `app/admin/ballot-scanning/` | Paper scan / confirm flow (OMR optional via gateway `OMR_WORKER_URL`) |

## Stack

Next.js App Router, React, Tailwind, shadcn-style UI components under `components/`.

## Default template

This tree started from `create-next-app`; eCASVote-specific behavior lives under `app/` and `lib/` as above. For deployment and env vars, use **[../SETUP.md](../SETUP.md)** and **[../CONNECT.md](../CONNECT.md)**.
