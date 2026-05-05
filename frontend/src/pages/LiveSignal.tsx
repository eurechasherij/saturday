import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type TradingSignal } from "@/lib/api";
import { fmtNum } from "@/lib/utils";

const TIMEFRAMES = ["5m", "15m", "1h", "4h", "1d"];

export default function LiveSignalPage() {
  const symbols = useQuery({ queryKey: ["symbols"], queryFn: api.symbols });
  const providers = useQuery({ queryKey: ["providers"], queryFn: api.providers });
  const symbolOptions = Array.from(new Set((symbols.data ?? []).map((s) => s.symbol)));

  const [symbol, setSymbol] = useState("BTCUSDT");
  const [tfs, setTfs] = useState<string[]>(["1h", "4h"]);
  const [provider, setProvider] = useState("ollama");
  const [model, setModel] = useState("qwen2.5:7b-instruct");
  const [signal, setSignal] = useState<TradingSignal | null>(null);

  const gen = useMutation({
    mutationFn: () => api.generateSignal({ symbol, timeframes: tfs, provider, model }),
    onSuccess: (s) => setSignal(s),
  });

  const activeProvider = providers.data?.find((p) => p.name === provider);

  return (
    <div>
      <PageHeader
        title="Live signal"
        subtitle="Generate one signal against the latest data on disk. Cache disabled — always fresh."
      />
      <div className="px-8 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader><CardTitle>Inputs</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Symbol</Label>
              <Select value={symbol} onValueChange={setSymbol}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {symbolOptions.length === 0 && <SelectItem value="BTCUSDT">BTCUSDT</SelectItem>}
                  {symbolOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Timeframes</Label>
              <div className="flex gap-1.5 mt-1.5 flex-wrap">
                {TIMEFRAMES.map((tf) => {
                  const on = tfs.includes(tf);
                  return (
                    <button
                      key={tf}
                      onClick={() => setTfs(on ? tfs.filter((t) => t !== tf) : [...tfs, tf])}
                      className={`px-2.5 py-1 rounded-md text-xs font-mono ${
                        on ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"
                      }`}
                    >
                      {tf}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label>Provider</Label>
              <Select
                value={provider}
                onValueChange={(v) => {
                  setProvider(v);
                  const p = providers.data?.find((x) => x.name === v);
                  if (p) setModel(p.default_model);
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
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(activeProvider?.models ?? []).map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button className="w-full" disabled={gen.isPending} onClick={() => gen.mutate()}>
              {gen.isPending ? "Thinking…" : "Generate signal"}
            </Button>
            {gen.isError && (
              <p className="text-xs text-destructive">{(gen.error as Error).message}</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Signal
              {signal && (
                <Badge variant={signal.direction === "LONG" ? "success" : signal.direction === "SHORT" ? "destructive" : "secondary"}>
                  {signal.direction}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!signal && (
              <p className="text-sm text-muted-foreground py-12 text-center">
                Click <strong>Generate signal</strong>. Output appears here.
              </p>
            )}
            {signal && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono text-xs">
                  <Stat k="entry" v={fmtNum(signal.entry, 4)} />
                  <Stat k="stop_loss" v={fmtNum(signal.stop_loss, 4)} />
                  <Stat k="take_profit" v={fmtNum(signal.take_profit, 4)} />
                  <Stat k="rr" v={fmtNum(signal.risk_reward, 2)} />
                  <Stat k="confidence" v={String(signal.confidence)} />
                  <Stat k="provider" v={signal.provider} />
                  <Stat k="model" v={signal.model} />
                  <Stat k="prompt" v={signal.prompt_version} />
                </div>

                <div>
                  <Label>Features used</Label>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {signal.features_used.map((f, i) => (
                      <Badge key={i} variant="outline" className="text-[10px]">{f}</Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <Label>Thoughts</Label>
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground mt-1.5 leading-relaxed">
                    {signal.thoughts}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="border border-border/50 rounded-md p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
      <div className="mt-1 text-sm">{v}</div>
    </div>
  );
}
