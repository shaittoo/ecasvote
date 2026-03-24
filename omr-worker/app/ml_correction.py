from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

import numpy as np


@dataclass
class MlCorrectionResult:
    picks: list[str]
    probabilities: dict[str, float]


class BubbleMlCorrector:
    """
    Optional ML correction layer for ambiguous OMR bubble decisions.

    The model is loaded only when:
    - OMR_ML_ENABLE=1
    - and OMR_ML_MODEL_PATH points to a valid sklearn-compatible model.
    """

    def __init__(self) -> None:
        self._enabled = os.getenv("OMR_ML_ENABLE", "").strip() == "1"
        self._model_path = os.getenv("OMR_ML_MODEL_PATH", "").strip()
        self._model: Any | None = None
        self._load_error: str | None = None
        if self._enabled and self._model_path:
            self._try_load_model()

    def _try_load_model(self) -> None:
        try:
            import joblib  # type: ignore

            self._model = joblib.load(self._model_path)
        except Exception as exc:  # pragma: no cover - best effort load
            self._model = None
            self._load_error = str(exc)

    @property
    def active(self) -> bool:
        return self._model is not None

    @property
    def status(self) -> dict[str, Any]:
        return {
            "enabled": self._enabled,
            "modelPath": self._model_path or None,
            "active": self.active,
            "loadError": self._load_error,
        }

    def refine(
        self,
        scores: dict[str, float],
        max_marks: int,
    ) -> MlCorrectionResult | None:
        if not self.active or not scores:
            return None
        model = self._model
        if model is None:
            return None

        sorted_opts = sorted(scores.items(), key=lambda x: -x[1])
        values = np.array([v for _, v in sorted_opts], dtype=np.float32)
        vmin = float(values.min()) if values.size else 0.0
        vmax = float(values.max()) if values.size else 1.0
        span = max(vmax - vmin, 1e-6)
        top = float(values[0]) if values.size else 0.0
        second = float(values[1]) if values.size > 1 else 0.0
        median = float(np.median(values)) if values.size else 0.0

        feats: list[list[float]] = []
        option_ids: list[str] = []
        for oid, sc in sorted_opts:
            rel = (float(sc) - vmin) / span
            feats.append(
                [
                    float(sc),  # absolute darkness
                    rel,  # relative darkness in contest
                    float(sc) - second,  # separation from second-best
                    float(sc) - median,  # separation from contest baseline
                    1.0 if oid.startswith("abstain:") else 0.0,
                    float(top - sc),  # distance from top
                ]
            )
            option_ids.append(oid)

        probs_arr = model.predict_proba(np.array(feats, dtype=np.float32))[:, 1]
        probs: dict[str, float] = {
            oid: float(p) for oid, p in zip(option_ids, probs_arr, strict=False)
        }

        if max_marks > 1:
            picks = [
                oid
                for oid, p in sorted(probs.items(), key=lambda x: -x[1])
                if p >= 0.62
            ][:max_marks]
        else:
            ranked = sorted(probs.items(), key=lambda x: -x[1])
            if not ranked:
                picks = []
            elif ranked[0][1] < 0.72:
                picks = []
            elif len(ranked) > 1 and (ranked[0][1] - ranked[1][1]) < 0.1:
                picks = []
            else:
                picks = [ranked[0][0]]

        return MlCorrectionResult(picks=picks, probabilities=probs)


bubble_ml_corrector = BubbleMlCorrector()
