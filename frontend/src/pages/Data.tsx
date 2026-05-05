import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import CandleChart from "@/components/CandleChart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type SymbolStatus } from "@/lib/api";
import { fmtDate, fmtNum } from "@/lib/utils";

const TIMEFRAMES = ["5m", "15m", "1h", "4h", "1d"];

export default function DataPage() {
  const qc = useQueryClient();
  const symbols = useQuery({ queryKey: ["symbols"], queryFn: api.symbols, refetchInterval: 5000 });
  const defaults = useQuery({ queryKey: ["defaults"], queryFn: api.defaults });

  const [previewSym, setPreviewSym] = useState<string | null>(null);
  const [previewTf, setPreviewTf] = useState<string | null>(null);

  const klines = useQuery({
    queryKey: ["klines", previewSym, previewTf],
    queryFn: () => api.klines(previewSym!, previewTf!, 300),
    enabled: !!previewSym && !!previewTf,
  });

  const [form, setForm] = useState({
    symbol: "BTCUSDT",
    timeframe: "1h",
    start: "2024-01",
    end: "",
  });

  const ingest = useMutation({
    mutationFn: () =>
      api.ingest({
        symbol: form.symbol,
        timeframe: form.timeframe,
        start: form.start,
        end: form.end || undefined,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["symbols"] }),
  });

  const refresh = useMutation({
    mutationFn: ({ s, t }: { s: string; t: string }) => api.refresh(s, t),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["symbols"] }),
  });

  return (
    <div>
      <PageHeader
        title="Data"
        subtitle="Historical OHLCV from Binance Vision, queryable via DuckDB."
      />
      <div className="px-8 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Ingested data</CardTitle>
          </CardHeader>
          <CardContent>
            {(!symbols.data || symbols.data.length === 0) && (
              <div className="text-sm text-muted-foreground py-12 text-center">
                Nothing ingested yet. Use the panel on the right to pull data from Binance Vision.
              </div>
            )}
            {symbols.data && symbols.data.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>TF</TableHead>
                    <TableHead className="text-right">Rows</TableHead>
                    <TableHead>Range</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {symbols.data.map((s: SymbolStatus) => (
                    <TableRow
                      key={`${s.symbol}-${s.timeframe}`}
                      className="cursor-pointer"
                      onClick={() => {
                        setPreviewSym(s.symbol);
                        setPreviewTf(s.timeframe);
                      }}
                    >
                      <TableCell className="font-semibold">{s.symbol}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{s.timeframe}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{fmtNum(s.rows, 0)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {fmtDate(s.first_open_time)} → {fmtDate(s.last_open_time)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            refresh.mutate({ s: s.symbol, t: s.timeframe });
                          }}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4" /> Ingest from Binance Vision
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Symbol</Label>
              <Select
                value={form.symbol}
                onValueChange={(v) => setForm({ ...form, symbol: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(defaults.data?.symbols ?? []).map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Timeframe</Label>
              <Select
                value={form.timeframe}
                onValueChange={(v) => setForm({ ...form, timeframe: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIMEFRAMES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start (YYYY-MM)</Label>
                <Input
                  value={form.start}
                  onChange={(e) => setForm({ ...form, start: e.target.value })}
                  placeholder="2024-01"
                />
              </div>
              <div>
                <Label>End (optional)</Label>
                <Input
                  value={form.end}
                  onChange={(e) => setForm({ ...form, end: e.target.value })}
                  placeholder="2025-04"
                />
              </div>
            </div>
            <Button
              className="w-full"
              disabled={ingest.isPending}
              onClick={() => ingest.mutate()}
            >
              {ingest.isPending ? "Scheduled…" : "Ingest"}
            </Button>
            {ingest.isSuccess && (
              <p className="text-xs text-muted-foreground">
                Running in the background — table on the left will refresh as data lands.
              </p>
            )}
            {ingest.isError && (
              <p className="text-xs text-destructive">{(ingest.error as Error).message}</p>
            )}
          </CardContent>
        </Card>

        {previewSym && previewTf && (
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>
                {previewSym} · {previewTf}
                <span className="text-xs text-muted-foreground ml-3">last 300 candles</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {klines.data?.candles && klines.data.candles.length > 0 ? (
                <CandleChart candles={klines.data.candles} />
              ) : (
                <div className="text-sm text-muted-foreground py-12 text-center">No candles.</div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
