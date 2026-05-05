import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type BacktestConfig } from "@/lib/api";

const TIMEFRAMES = ["5m", "15m", "1h", "4h", "1d"];

export default function BacktestPage() {
  const nav = useNavigate();
  const symbols = useQuery({ queryKey: ["symbols"], queryFn: api.symbols });
  const providers = useQuery({ queryKey: ["providers"], queryFn: api.providers });

  const symbolOptions = Array.from(new Set((symbols.data ?? []).map((s) => s.symbol)));

  const [cfg, setCfg] = useState<BacktestConfig>({
    symbol: "BTCUSDT",
    timeframes: ["1h", "4h"],
    start: "2024-01-01",
    end: "2024-12-31",
    provider: "ollama",
    model: "qwen2.5:7b-instruct",
    starting_equity: 10000,
    position_pct: 0.1,
    leverage: 1,
    confidence_threshold: 60,
    use_trigger: true,
    trigger_proximity_pct: 0.001,
  });

  const create = useMutation({
    mutationFn: (c: BacktestConfig) =>
      api.createRun({
        ...c,
        start: new Date(c.start).toISOString(),
        end: new Date(c.end).toISOString(),
      }),
    onSuccess: (run) => nav(`/runs/${run.run_id}?autostart=1`),
  });

  const activeProvider = providers.data?.find((p) => p.name === cfg.provider);

  return (
    <div>
      <PageHeader
        title="Backtest"
        subtitle="Configure a run. Defaults reflect DESIGN.md decisions: 10% sizing, 1× leverage, trigger-based evaluation."
      />
      <div className="px-8 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Symbol</Label>
                <Select
                  value={cfg.symbol}
                  onValueChange={(v) => setCfg({ ...cfg, symbol: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {symbolOptions.length === 0 && (
                      <SelectItem value="BTCUSDT">BTCUSDT (no data)</SelectItem>
                    )}
                    {symbolOptions.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Timeframes (engine TF + context)</Label>
                <div className="flex gap-1.5 mt-1.5 flex-wrap">
                  {TIMEFRAMES.map((tf) => {
                    const on = cfg.timeframes.includes(tf);
                    return (
                      <button
                        key={tf}
                        onClick={() =>
                          setCfg({
                            ...cfg,
                            timeframes: on
                              ? cfg.timeframes.filter((t) => t !== tf)
                              : [...cfg.timeframes, tf],
                          })
                        }
                        className={`px-2.5 py-1 rounded-md text-xs font-mono ${
                          on
                            ? "bg-primary text-primary-foreground"
                            : "border border-border text-muted-foreground hover:bg-accent/40"
                        }`}
                      >
                        {tf}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start</Label>
                <Input
                  type="date"
                  value={cfg.start}
                  onChange={(e) => setCfg({ ...cfg, start: e.target.value })}
                />
              </div>
              <div>
                <Label>End</Label>
                <Input
                  type="date"
                  value={cfg.end}
                  onChange={(e) => setCfg({ ...cfg, end: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Provider</Label>
                <Select
                  value={cfg.provider}
                  onValueChange={(v) => {
                    const p = providers.data?.find((x) => x.name === v);
                    setCfg({ ...cfg, provider: v, model: p?.default_model ?? cfg.model });
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(providers.data ?? []).map((p) => (
                      <SelectItem key={p.name} value={p.name} disabled={!p.available}>
                        {p.name} {!p.available && "(unavailable)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Model</Label>
                <Select value={cfg.model} onValueChange={(v) => setCfg({ ...cfg, model: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(activeProvider?.models ?? []).map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div>
                <Label>Starting equity</Label>
                <Input
                  type="number"
                  value={cfg.starting_equity}
                  onChange={(e) => setCfg({ ...cfg, starting_equity: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Position %</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={cfg.position_pct}
                  onChange={(e) => setCfg({ ...cfg, position_pct: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Leverage</Label>
                <Input
                  type="number"
                  value={cfg.leverage}
                  onChange={(e) => setCfg({ ...cfg, leverage: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Confidence ≥</Label>
                <Input
                  type="number"
                  value={cfg.confidence_threshold}
                  onChange={(e) => setCfg({ ...cfg, confidence_threshold: Number(e.target.value) })}
                />
              </div>
            </div>

            <Button
              className="w-full"
              disabled={create.isPending || cfg.timeframes.length === 0}
              onClick={() => create.mutate(cfg)}
            >
              {create.isPending ? "Creating run…" : "Create & start run"}
            </Button>
            {create.isError && (
              <p className="text-xs text-destructive">{(create.error as Error).message}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-3 text-muted-foreground leading-relaxed">
            <p>
              Trigger-based evaluation: the engine only calls the LLM when price taps an
              unmitigated FVG or Order Block. Cuts LLM calls 50–100× vs every-bar.
            </p>
            <p>
              Cache is on by default. The first run pays the LLM cost; identical re-runs
              after fixing a simulator bug are free.
            </p>
            <p>
              You need ingested data for the symbol + timeframes. If a TF is missing,
              it's silently dropped.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
