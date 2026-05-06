import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Plus, RefreshCw, X } from "lucide-react";
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

type IngestState = {
  active: boolean;
  symbol: string;
  timeframe: string;
  monthsTotal: number;
  monthsDone: number;
  monthsMissing: number;
  rowsTotal: number;
  currentMonth: string;
  log: string[];
  finished: boolean;
  error: string | null;
};

const emptyIngest: IngestState = {
  active: false,
  symbol: "",
  timeframe: "",
  monthsTotal: 0,
  monthsDone: 0,
  monthsMissing: 0,
  rowsTotal: 0,
  currentMonth: "",
  log: [],
  finished: false,
  error: null,
};

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

  const [ingest, setIngest] = useState<IngestState>(emptyIngest);
  const esRef = useRef<EventSource | null>(null);

  const refresh = useMutation({
    mutationFn: ({ s, t }: { s: string; t: string }) => api.refresh(s, t),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["symbols"] }),
  });

  function startIngest() {
    if (esRef.current) esRef.current.close();
    const url = api.ingestStreamUrl({
      symbol: form.symbol,
      timeframe: form.timeframe,
      start: form.start,
      end: form.end || undefined,
    });
    setIngest({
      ...emptyIngest,
      active: true,
      symbol: form.symbol,
      timeframe: form.timeframe,
      log: [`opening stream for ${form.symbol} ${form.timeframe} from ${form.start}…`],
    });
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener("started", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      setIngest((s) => ({
        ...s,
        monthsTotal: d.months_total,
        log: [...s.log, `started: ${d.months_total} months from ${d.start} to ${d.end}`],
      }));
    });
    es.addEventListener("month_done", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      setIngest((s) => ({
        ...s,
        monthsDone: d.index,
        rowsTotal: d.rows_total,
        currentMonth: d.month,
        log: [...s.log, `✓ ${d.month} — ${d.rows} rows (cumulative ${d.rows_total})`].slice(-50),
      }));
      qc.invalidateQueries({ queryKey: ["symbols"] });
    });
    es.addEventListener("month_missing", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      setIngest((s) => ({
        ...s,
        monthsMissing: s.monthsMissing + 1,
        currentMonth: d.month,
        log: [...s.log, `· ${d.month} — not on Vision (${d.reason})`].slice(-50),
      }));
    });
    es.addEventListener("month_failed", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      setIngest((s) => ({
        ...s,
        monthsMissing: s.monthsMissing + 1,
        log: [...s.log, `× ${d.month} — ${d.reason}`].slice(-50),
      }));
    });
    es.addEventListener("completed", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      setIngest((s) => ({
        ...s,
        active: false,
        finished: true,
        rowsTotal: d.rows_total,
        log: [...s.log, `done: ${d.rows_total} rows total`],
      }));
      es.close();
      esRef.current = null;
      qc.invalidateQueries({ queryKey: ["symbols"] });
    });
    es.addEventListener("error", (e: Event) => {
      const data = (e as MessageEvent).data;
      const msg = typeof data === "string" ? data : "stream error";
      setIngest((s) => ({ ...s, active: false, error: msg, log: [...s.log, `error: ${msg}`] }));
      es.close();
      esRef.current = null;
    });
  }

  function cancelIngest() {
    esRef.current?.close();
    esRef.current = null;
    setIngest((s) => ({ ...s, active: false, log: [...s.log, "cancelled"] }));
  }

  useEffect(() => () => esRef.current?.close(), []);

  const pct = ingest.monthsTotal > 0
    ? Math.min(100, ((ingest.monthsDone + ingest.monthsMissing) / ingest.monthsTotal) * 100)
    : 0;

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
                disabled={ingest.active}
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
                disabled={ingest.active}
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
                  disabled={ingest.active}
                />
              </div>
              <div>
                <Label>End (optional)</Label>
                <Input
                  value={form.end}
                  onChange={(e) => setForm({ ...form, end: e.target.value })}
                  placeholder="2025-04"
                  disabled={ingest.active}
                />
              </div>
            </div>

            {!ingest.active && (
              <Button className="w-full" onClick={startIngest}>
                Ingest
              </Button>
            )}
            {ingest.active && (
              <Button className="w-full" variant="destructive" onClick={cancelIngest}>
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
            )}

            {(ingest.active || ingest.finished || ingest.error) && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {ingest.symbol} · {ingest.timeframe}
                    {ingest.currentMonth && <> · <span className="font-mono">{ingest.currentMonth}</span></>}
                  </span>
                  <span>
                    {ingest.monthsDone + ingest.monthsMissing}/{ingest.monthsTotal}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      ingest.error ? "bg-destructive" : ingest.finished ? "bg-success" : "bg-primary"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>✓ {ingest.monthsDone}</span>
                  <span>· {ingest.monthsMissing} missing</span>
                  <span>{fmtNum(ingest.rowsTotal, 0)} rows</span>
                </div>
                <pre className="text-[10px] font-mono text-muted-foreground bg-secondary/40 rounded-md p-2 max-h-40 overflow-auto">
                  {ingest.log.slice(-12).join("\n")}
                </pre>
              </div>
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
