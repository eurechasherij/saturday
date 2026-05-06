"""Run manager: backtest runs as background asyncio tasks.

Decouples the run lifecycle from any HTTP request. Once started, a run keeps
going even if the client navigates away or the SSE connection drops. The
frontend polls /log for recent events and /runs/{id} for the summary.
"""

from __future__ import annotations

import asyncio
import logging
from collections import deque
from typing import Any

from app.backtest.engine import run_backtest
from app.backtest.runs import get_run, update_run
from app.schemas.backtest import BacktestRunSummary

log = logging.getLogger(__name__)

_LOG_BUFFER_SIZE = 500


class RunManager:
    """Singleton: tracks background run tasks and their event logs in memory."""

    def __init__(self) -> None:
        self._tasks: dict[str, asyncio.Task] = {}
        self._logs: dict[str, deque[dict[str, Any]]] = {}
        self._counters: dict[str, int] = {}  # monotonic event index per run
        self._user_cancelled: set[str] = set()

    def is_running(self, run_id: str) -> bool:
        t = self._tasks.get(run_id)
        return t is not None and not t.done()

    def start(self, summary: BacktestRunSummary) -> None:
        run_id = summary.run_id
        if self.is_running(run_id):
            log.info("run %s already running, skip", run_id)
            return

        self._logs[run_id] = deque(maxlen=_LOG_BUFFER_SIZE)
        self._counters[run_id] = 0

        async def _runner() -> None:
            try:
                async for ev in run_backtest(summary):
                    if ev.get("type", "").startswith("_"):
                        continue
                    self._append(run_id, ev)
            except asyncio.CancelledError:
                user_initiated = run_id in self._user_cancelled
                reason = "user-cancelled" if user_initiated else "external-cancellation"
                log.warning("MANAGER: run %s cancelled (%s)", run_id, reason)
                self._append(run_id, {"type": "cancelled", "reason": reason})
                raise
            except Exception as e:  # noqa: BLE001
                log.exception("MANAGER: run %s exited with exception", run_id)
                self._append(
                    run_id,
                    {"type": "failed", "error": f"{type(e).__name__}: {e}"},
                )
                # The engine's exception handler already marked status=failed with
                # error string. Don't overwrite.

        self._tasks[run_id] = asyncio.create_task(_runner(), name=f"run-{run_id}")

    def cancel(self, run_id: str) -> bool:
        t = self._tasks.get(run_id)
        if t is None or t.done():
            return False
        # Mark intent so the engine's finally block can distinguish user-cancel
        # from "the asyncio task got killed for some other reason".
        self._user_cancelled.add(run_id)
        summary = get_run(run_id)
        if summary is not None and summary.status == "running":
            summary.error = "cancelled by user"
            update_run(summary)
        t.cancel()
        return True

    def was_user_cancelled(self, run_id: str) -> bool:
        return run_id in self._user_cancelled

    def sweep_zombies(self) -> int:
        """Scan disk for runs stuck in 'running' with no live task.

        Called at backend startup — uvicorn --reload (or any crash) leaves
        previously-running summaries with the wrong status. Mark them so the
        UI shows what happened.
        """
        from app.backtest.runs import list_runs

        n = 0
        for s in list_runs():
            if s.status == "running" and not self.is_running(s.run_id):
                s.status = "cancelled"
                s.error = "backend restarted or crashed during this run"
                update_run(s)
                n += 1
        return n

    def get_log(self, run_id: str, since: int = 0) -> tuple[list[dict[str, Any]], int]:
        """Return events recorded after `since` (monotonic index), plus the new cursor."""
        events = self._logs.get(run_id)
        if events is None:
            return [], since
        # Each entry is (idx, payload). Build events newer than since.
        out: list[dict[str, Any]] = []
        last_idx = since
        for idx, payload in events:
            if idx > since:
                out.append(payload)
                last_idx = idx
        return out, last_idx

    def _append(self, run_id: str, ev: dict[str, Any]) -> None:
        self._counters[run_id] = self._counters.get(run_id, 0) + 1
        self._logs[run_id].append((self._counters[run_id], ev))

    def reattach(self, run_id: str) -> bool:
        """If a summary on disk says running but no task is alive, reset it.
        Used by the manager startup to recover from a backend restart.
        """
        if self.is_running(run_id):
            return True
        summary = get_run(run_id)
        if summary is None:
            return False
        if summary.status == "running":
            summary.status = "failed"
            summary.error = "backend restarted while running"
            update_run(summary)
        return False


manager = RunManager()
