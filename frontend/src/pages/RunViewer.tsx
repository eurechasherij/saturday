import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import PageHeader from "@/components/PageHeader";
import EquityChart from "@/components/EquityChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, type SignalRecord } from "@/lib/api";
import { fmtDate, fmtNum, fmtPct } from "@/lib/utils";

export default function RunViewerPage() {
  const { runId } = useParams<{ runId: string }>();
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const [streamLog, setStreamLog] = useState<string[]>([]);

  const summary = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api.getRun(runId!),
    enabled: !!runId,
    refetchInterval: 2000,
  });

  const equity = useQuery({
    queryKey: ["run-equity", runId],
    queryFn: () => api.equity(runId!),
    enabled: !!runId && summary.data?.status === "completed",
  });
  const trades = useQuery({
    queryKey: ["run-trades", runId],
    queryFn: () => api.trades(runId!),
    enabled: !!runId && summary.data?.status === "completed",
  });
  const signals = useQuery({
    queryKey: ["run-signals", runId],
    queryFn: () => api.signals(runId!),
    enabled: !!runId,
    refetchInterval: summary.data?.status === "running" ? 3000 : false,
  });

  const [selectedSignal, setSelectedSignal] = useState<SignalRecord | null>(null);

  useEffect(() => {
    if (!runId) return;
    const autostart = params.get("autostart") === "1";
    if (!autostart) return;
    if (summary.data && summary.data.status !== "pending") return;

    const es = new EventSource(api.streamUrl(runId));
    es.addEventListener("started", (e) => setStreamLog((l) => [...l, `started: ${e.data}`]));
    es.addEventListener("progress", (e) => {
      const d = JSON.parse(e.data);
      setStreamLog((l) => [
        ...l.slice(-20),
        `${d.bars_processed}/${d.bars_total} bars · LLM ${d.llm_calls} (cache ${d.cache_hits}) · equity ${fmtNum(d.equity)}`,
      ]);
      qc.invalidateQueries({ queryKey: ["run", runId] });
    });
    es.addEventListener("completed", () => {
      setStreamLog((l) => [...l, "completed"]);
      es.close();
      qc.invalidateQueries({ queryKey: ["run", runId] });
    });
    es.addEventListener("failed", (e) => {
      setStreamLog((l) => [...l, `failed: ${e.data}`]);
      es.close();
    });
    es.addEventListener("error", () => {
      es.close();
    });
    return () => es.close();
  }, [runId, params, qc, summary.data]);

  if (!summary.data) return <div className="p-8">Loading…</div>;
  const r = summary.data;

  return (
    <div>
      <PageHeader
        title={`Run ${r.run_id}`}
        subtitle={`${r.config.symbol} · ${r.config.timeframes.join("/")} · ${r.config.provider}/${r.config.model}`}
        actions={<Badge variant={r.status === "completed" ? "success" : r.status === "failed" ? "destructive" : "default"}>{r.status}</Badge>}
      />

      <div className="px-8 py-6 space-y-6">
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

        {r.status === "running" && (
          <Card>
            <CardHeader><CardTitle>Live progress</CardTitle></CardHeader>
            <CardContent>
              <pre className="text-xs font-mono text-muted-foreground bg-secondary/40 rounded-md p-3 max-h-48 overflow-auto">
                {streamLog.join("\n") || "waiting…"}
              </pre>
            </CardContent>
          </Card>
        )}

        {r.status === "completed" && equity.data?.equity && (
          <Card>
            <CardHeader><CardTitle>Equity curve</CardTitle></CardHeader>
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
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(signals.data?.signals ?? []).map((s) => (
                        <TableRow
                          key={s.id + s.time}
                          className="cursor-pointer"
                          onClick={() => setSelectedSignal(s)}
                        >
                          <TableCell>{fmtDate(s.time)}</TableCell>
                          <TableCell><Badge variant="outline">{s.trigger_reason}</Badge></TableCell>
                          <TableCell>
                            <Badge variant={s.direction === "LONG" ? "success" : s.direction === "SHORT" ? "destructive" : "secondary"}>
                              {s.direction}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{fmtNum(s.entry, 4)}</TableCell>
                          <TableCell className="text-right">{s.confidence}</TableCell>
                          <TableCell>{s.cache_hit && <Badge variant="outline" className="text-[10px]">cache</Badge>}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Inspector</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {!selectedSignal && (
                    <p className="text-sm text-muted-foreground">Click a signal to see the AI's reasoning and the features it cited.</p>
                  )}
                  {selectedSignal && (
                    <>
                      <div className="text-xs space-y-1 font-mono">
                        <Row k="time" v={fmtDate(selectedSignal.time)} />
                        <Row k="direction" v={selectedSignal.direction} />
                        <Row k="entry" v={fmtNum(selectedSignal.entry, 4)} />
                        <Row k="stop_loss" v={fmtNum(selectedSignal.stop_loss, 4)} />
                        <Row k="take_profit" v={fmtNum(selectedSignal.take_profit, 4)} />
                        <Row k="confidence" v={String(selectedSignal.confidence)} />
                        <Row k="trigger" v={selectedSignal.trigger_reason} />
                      </div>
                      <div>
                        <Label2>Features used</Label2>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {selectedSignal.features_used.length === 0 && <span className="text-xs text-muted-foreground">none</span>}
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
                          <Badge variant={t.direction === "LONG" ? "success" : "destructive"}>{t.direction}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{fmtNum(t.entry_price, 4)}</TableCell>
                        <TableCell className="text-right">{fmtNum(t.exit_price, 4)}</TableCell>
                        <TableCell><Badge variant="outline">{t.exit_reason}</Badge></TableCell>
                        <TableCell className={`text-right ${t.pnl >= 0 ? "text-success" : "text-destructive"}`}>
                          {fmtNum(t.pnl)}
                        </TableCell>
                        <TableCell className={`text-right ${t.pnl >= 0 ? "text-success" : "text-destructive"}`}>
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

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`text-lg font-semibold mt-1 ${tone === "bad" ? "text-destructive" : ""}`}>{value}</div>
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
