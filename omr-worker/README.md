# eCASVote OMR worker (Python / OpenCV)

Reads **eCASVote paper ballots** (`PrintableBallotSheet`): QR JSON + bubble marks, using the same **OpenCV** stack family as **[Open MCR](https://github.com/iansan5653/open-mcr)**.

> **Why not call Open MCR directly?**  
> Open MCR is built for its own **75-question / 150-question** PDF forms. eCASVote uses **custom** 3-column contest blocks and six corner fiducials, so we run this worker instead. You can still compare algorithms with Open MCR’s source for ideas.

> **[ExamGrader](https://sites.google.com/site/examgrader/downloads)** is a separate desktop bubble-sheet tool. It is **not** wired into this API; use it offline if you prefer that workflow.

## Run

### Option A — Docker (no `python3-venv` on the host)

```bash
cd omr-worker
docker compose up --build
```

Service listens on **http://127.0.0.1:8090** (same as `OMR_WORKER_URL` in gateway `.env`).

### Option B — Local venv

```bash
cd omr-worker
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8090
```

### Ubuntu / Debian: `ensurepip is not available`

Install the venv module for your Python version, then recreate `.venv`:

```bash
sudo apt update
sudo apt install python3-venv    # or: python3.10-venv
rm -rf .venv
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Gateway

Set on **gateway-api**:

```env
OMR_WORKER_URL=http://127.0.0.1:8090
```

The admin **Scan ballots** page POSTs images to `POST /scanner/scan-image`, which forwards to `POST http://127.0.0.1:8090/scan` with `{ image_base64, template }`.

`template` must be **`ecasvote-scanner-template/1`** JSON (same as **Download scanner template JSON** in the UI).

## API

- `GET /health` — liveness  
- `POST /scan` — JSON body `{ "image_base64": "...", "template": { ... } }`

## License

eCASVote project code (ISC / your repo). Open MCR is **GPL-3.0** — this worker does **not** copy Open MCR source; it only targets a similar problem domain.
