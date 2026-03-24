# eCASVote OMR worker (Python / OpenCV)

Reads **eCASVote paper ballots** (`PrintableBallotSheet`): QR JSON + bubble marks, using the same **OpenCV** stack family as **[Open MCR](https://github.com/iansan5653/open-mcr)**.

> **Why not call Open MCR directly?**  
> Open MCR is built for its own **75-question / 150-question** PDF forms. eCASVote uses a **custom OMR layout**: scan-frame fiducials, contests **stacked vertically**, each contest in a **row-major 3-column** candidate grid, round bubbles, and a **footer QR** (with legacy top-right QR crops still tried). This worker implements that layout in `app/ballot_omr.py`.

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

## Optional ML correction

The worker includes an optional ML post-processor to reduce false positives on ambiguous marks.

Enable it with environment variables:

```env
OMR_ML_ENABLE=1
OMR_ML_MODEL_PATH=/absolute/path/to/bubble_mark_model.joblib
```

Notes:
- Model should be a sklearn-compatible binary classifier with `predict_proba(X)`.
- Feature vector per option is:
  - absolute darkness score
  - relative score in contest
  - score minus second-best
  - score minus median contest score
  - is-abstain flag
  - distance from top score
- If ML is disabled/missing, worker uses rule-based OMR only.
- `bubbleRead.raw_scores` includes `_ml_probs` and `_ml_override` when used.

## API

- `GET /health` — liveness  
- `POST /scan` — JSON body `{ "image_base64": "...", "template": { ... } }`

## License

eCASVote project code (ISC / your repo). Open MCR is **GPL-3.0** — this worker does **not** copy Open MCR source; it only targets a similar problem domain.
