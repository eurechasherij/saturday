import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import EquityChart from "@/components/EquityChart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, type SignalRecord } from "@/lib/api";
import { fmtDate, fmtNum, fmtPct } from "@/lib/utils";

type RunEvent = {
  type: string;
  [k: string]: any;
};

export default function RunViewerPage() {
  const { runId } = useParams<{ runId: string }>();
  const qc = useQueryClient();
  const [streamLog, setStreamLog] = useState<string[]>([]);
  const cursorRef = useRef(0);

  const summary = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api.getRun(runId!),
    enabled: !!runId,
    refetchInterval: 2000,
  });

  const isRunning = summary.data?.status === "running" || summary.data?.status === "pending";

  // Poll the engine event log while the run is active. Cursor advances so we
  // never re-render the same event twice. Stops automatically when run isn't running.
  useQuery({
    queryKey: ["run-log", runId],
    queryFn: async () => {
      const res = await api.runLog(runId!, cursorRef.current);
      cursorRef.current = res.cursor;
      if (res.events.length > 0) {
        setStreamLog((l) => [...l, ...res.events.map(formatEvent)].slice(-100));
        qc.invalidateQueries({ queryKey: ["run", runId] });
      }
      return res;
    },
    enabled: !!runId && isRunning,
    refetchInterval: 1000,
  });

  const equity = useQuery({
    queryKey: ["run-equity", runId],
    queryFn: () => api.equity(runId!),
    enabled: !!runId && summary.data?.status === "completed",
  });
  const trades = useQuery({
    queryKey: ["run-trades", runId],
    queryFn: () => api.trades(runId!),
    enabled: !!runId && (summary.data?.status === "completed" || summary.data?.status === "cancelled"),
  });
  const signals = useQuery({
    queryKey: ["run-signals", runId],
    queryFn: () => api.signals(runId!),
    enabled: !!runId,
    refetchInterval: isRunning ? 3000 : false,
  });

  const [selectedSignal, setSelectedSignal] = useState<SignalRecord | null>(null);

  const cancelMut = useMutation({
    mutationFn: () => api.cancelRun(runId!),
    onSuccess: (r) => {
      setStreamLog((l) => [...l, r.cancelled ? "cancel sent" : `cancel ignored: ${r.reason}`]);
      setTimeout(() => qc.invalidateQueries({ queryKey: ["run", runId] }), 500);
    },
    onError: (e) => setStreamLog((l) => [...l, `cancel failed: ${(e as Error).message}`]),
  });

  if (!summary.data) return <div className="p-8">Loading…</div>;
  const r = summary.data;

  const statusVariant: "success" | "destructive" | "secondary" | "default" =
    r.status === "completed"
      ? "success"
      : r.status === "failed"
      ? "destructive"
      : r.status === "cancelled"
      ? "secondary"
      : "default";

  return (
    <div>
      <PageHeader
        title={`Run ${r.run_id}`}
        subtitle={`${r.config.symbol} · ${r.config.timeframes.join("/")} · ${r.config.provider}/${r.config.model}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={statusVariant}>{r.status}</Badge>
            {isRunning && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => cancelMut.mutate()}
                disabled={cancelMut.isPending}
              >
                <X className="h-3.5 w-3.5 mr-1" />
                {cancelMut.isPending ? "Cancelling…" : "Cancel"}
              </Button>
            )}
          </div>
        }
      />

      <div className="px-8 py-6 space-y-6">
        {(r.status === "cancelled" || r.status === "failed") && r.error && (
          <Card className="border-destructive/40">
            <CardContent className="p-4">
              <div className="text-[10px] uppercase tracking-wider text-destructive">
                {r.status === "failed" ? "Failure reason" : "Cancellation reason"}
              </div>
              <div className="text-sm font-mono mt-1 text-muted-foreground">{r.error}</div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <Stat label="Bars" value={`${fmtNum(r.bars_processed, 0)} / ${fmtNum(r.bars_total, 0)}`} />
          <Stat label="Triggers" value={fmtNum(r.triggers_fired, 0)} />
          <Stat label="LLM calls" value={fmtNum(r.llm_calls, 0)} />
          <Stat label="Cache hits" value={fmtNum(r.cache_hits, 0)} />
          <Stat label="Trades" value={fmtNum(r.trades, 0)} />
          <Stat label="Win rate" value={fmtPct(r.win_rate)} />
          <Stat label="Return" value={fmtPct(r.total_return)} />
          <Stat label="Max DD" value={fmtPct(r.max_drawdown)} tone="bad" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-6 gap-y-3 text-xs font-mono">
              <ConfigItem k="symbol" v={r.config.symbol} />
              <ConfigItem k="timeframes" v={r.config.timeframes.join(", ")} />
              <ConfigItem k="range" v={`${r.config.start.slice(0, 10)} → ${r.config.end.slice(0, 10)}`} />
              <ConfigItem k="provider" v={r.config.provider} />
              <ConfigItem k="model" v={r.config.model} />
              <ConfigItem k="prompt_version" v={r.config.prompt_version ?? "—"} />
              <ConfigItem k="starting_equity" v={fmtNum(r.config.starting_equity ?? 0, 0)} />
              <ConfigItem k="position_pct" v={fmtPct(r.config.position_pct ?? 0)} />
              <ConfigItem k="leverage" v={`${r.config.leverage ?? 1}×`} />
              <ConfigItem k="confidence ≥" v={String(r.config.confidence_threshold ?? 60)} />
              <ConfigItem k="trigger" v={r.config.use_trigger === false ? "every bar" : "FVG/OB tap"} />
              <ConfigItem
                k="trigger proximity"
                v={fmtPct(r.config.trigger_proximity_pct ?? 0.001, 3)}
              />
              {r.final_equity != null && (
                <ConfigItem k="final_equity" v={fmtNum(r.final_equity, 2)} />
              )}
              {r.profit_factor != null && (
                <ConfigItem k="profit_factor" v={fmtNum(r.profit_factor, 2)} />
              )}
              {r.sharpe != null && <ConfigItem k="sharpe" v={fmtNum(r.sharpe, 2)} />}
              <ConfigItem k="started" v={fmtDate(r.started_at)} />
              {r.finished_at && <ConfigItem k="finished" v={fmtDate(r.finished_at)} />}
            </div>
          </CardContent>
        </Card>

        {isRunning && (
          <Card>
            <CardHeader>
              <CardTitle>Live progress (polling /log every second)</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs font-mono text-muted-foreground bg-secondary/40 rounded-md p-3 max-h-48 overflow-auto">
                {streamLog.slice(-20).join("\n") || "waiting for first event…"}
              </pre>
            </CardContent>
          </Card>
        )}

        {r.status === "completed" && equity.data?.equity && (
          <Card>
            <CardHeader>
              <CardTitle>Equity curve</CardTitle>
            </CardHeader>
            <CardContent>
              <EquityChart points={equity.data.equity} />
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="signals">
          <TabsList>
            <TabsTrigger value="signals">Signals ({signals.data?.signals.length ?? 0})</TabsTrigger>
            <TabsTrigger value="trades">Trades ({trades.data?.trades.length ?? 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="signals">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="lg:col-span-2">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Trigger</TableHead>
                        <TableHead>Direction</TableHead>
                        <TableHead className="text-right">Entry</TableHead>
                        <TableHead className="text-right">Conf</TableHead>
                        <TableHead>Outcome</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(signals.data?.signals ?? []).map((s: any) => (
                        <TableRow
                          key={s.id + s.time}
                          className="cursor-pointer"
                          onClick={() => setSelectedSignal(s)}
                        >
                          <TableCell>{fmtDate(s.time)}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{s.trigger_reason}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                s.direction === "LONG"
                                  ? "success"
                                  : s.direction === "SHORT"
                                  ? "destructive"
                                  : "secondary"
                              }
                            >
                              {s.direction}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{fmtNum(s.entry, 4)}</TableCell>
                          <TableCell className="text-right">{s.confidence}</TableCell>
                          <TableCell>
                            {s.position_opened ? (
                              <Badge variant="success" className="text-[10px]">opened</Badge>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">
                                {s.rejection_reason || "—"}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Inspector</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!selectedSignal && (
                    <p className="text-sm text-muted-foreground">
                      Click a signal to see the AI's reasoning and the features it cited.
                    </p>
                  )}
                  {selectedSignal && (
                    <>
                      <div className="text-xs space-y-1 font-mono">
                        <Row k="time" v={fmtDate(selectedSignal.time)} />
                        <Row k="direction" v={selectedSignal.direction} />
                        <Row k="entry" v={fmtNum(selectedSignal.entry, 4)} />
                        <Row k="stop_loss" v={fmtNum(selectedSignal.stop_loss, 4)} />
                        <Row k="take_profit" v={fmtNum(selectedSignal.take_profit, 4)} />
                        <Row k="risk_reward" v={fmtNum((selectedSignal as any).risk_reward, 2)} />
                        <Row k="confidence" v={String(selectedSignal.confidence)} />
                        <Row k="trigger" v={selectedSignal.trigger_reason} />
                        <Row
                          k="position_opened"
                          v={(selectedSignal as any).position_opened ? "yes" : "no"}
                        />
                        {(selectedSignal as any).rejection_reason && (
                          <Row k="rejection" v={(selectedSignal as any).rejection_reason} />
                        )}
                      </div>
                      <div>
                        <Label2>Features used</Label2>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {selectedSignal.features_used.length === 0 && (
                            <span className="text-xs text-muted-foreground">none</span>
                          )}
                          {selectedSignal.features_used.map((f, i) => (
                            <Badge key={i} variant="outline" className="text-[10px]">{f}</Badge>
                          ))}
                        </div>
                      </div>
                      <div>
                        <Label2>Thoughts</Label2>
                        <p className="text-xs whitespace-pre-wrap text-muted-foreground mt-1 leading-relaxed">
                          {selectedSignal.thoughts || "—"}
                        </p>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="trades">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Entry</TableHead>
                      <TableHead>Exit</TableHead>
                      <TableHead>Direction</TableHead>
                      <TableHead className="text-right">Entry px</TableHead>
                      <TableHead className="text-right">Exit px</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead className="text-right">PnL</TableHead>
                      <TableHead className="text-right">PnL %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(trades.data?.trades ?? []).map((t, i) => (
                      <TableRow key={i}>
                        <TableCell>{fmtDate(t.entry_time)}</TableCell>
                        <TableCell>{fmtDate(t.exit_time)}</TableCell>
                        <TableCell>
                          <Badge variant={t.direction === "LONG" ? "success" : "destructive"}>
                            {t.direction}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{fmtNum(t.entry_price, 4)}</TableCell>
                        <TableCell className="text-right">{fmtNum(t.exit_price, 4)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{t.exit_reason}</Badge>
                        </TableCell>
                        <TableCell
                          className={`text-right ${t.pnl >= 0 ? "text-success" : "text-destructive"}`}
                        >
                          {fmtNum(t.pnl)}
                        </TableCell>
                        <TableCell
                          className={`text-right ${t.pnl >= 0 ? "text-success" : "text-destructive"}`}
                        >
                          {fmtPct(t.pnl_pct)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function formatEvent(ev: RunEvent): string {
  if (ev.type === "started") return "stream opened";
  if (ev.type === "data-loaded") return `data loaded · engine_tf=${ev.engine_tf} · ${ev.bars_total} bars`;
  if (ev.type === "loop-start") return "loop start";
  if (ev.type === "progress") {
    const sig = ev.last_signal
      ? ` · ${ev.last_signal.direction}@${ev.last_signal.confidence} (${ev.last_signal.trigger}${ev.last_signal.cache_hit ? ", cache" : ""})`
      : "";
    const bps = ev.bars_per_s ? ` · ${ev.bars_per_s} b/s` : "";
    return `${ev.bars_processed}/${ev.bars_total} · LLM ${ev.llm_calls} (cache ${ev.cache_hits}) · eq ${fmtNum(ev.equity)}${bps}${sig}`;
  }
  if (ev.type === "llm-start") return `↑ LLM call: trigger=${ev.trigger} @ ${ev.bar_time}`;
  if (ev.type === "warning") return `⚠ ${ev.bar_time}: ${ev.message}`;
  if (ev.type === "completed") return "completed";
  if (ev.type === "cancelled") return `cancelled (${ev.reason})`;
  if (ev.type === "failed") return `failed: ${ev.error}`;
  return JSON.stringify(ev);
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`text-lg font-semibold mt-1 ${tone === "bad" ? "text-destructive" : ""}`}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/50 py-1">
      <span className="text-muted-foreground">{k}</span>
      <span>{v}</span>
    </div>
  );
}

function Label2({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{children}</div>;
}

function ConfigItem({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
      <div className="mt-0.5 truncate">{v}</div>
    </div>
  );
}
