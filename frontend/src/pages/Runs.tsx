import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { fmtDate, fmtNum, fmtPct } from "@/lib/utils";

const statusVariant = (s: string) =>
  s === "completed"
    ? "success"
    : s === "failed"
    ? "destructive"
    : s === "running"
    ? "default"
    : s === "cancelled"
    ? "secondary"
    : "secondary";

export default function RunsPage() {
  const runs = useQuery({ queryKey: ["runs"], queryFn: api.listRuns, refetchInterval: 4000 });

  return (
    <div>
      <PageHeader title="Runs" subtitle="All backtest runs, newest first." />
      <div className="px-8 py-6">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Provider · Model</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Trades</TableHead>
                  <TableHead className="text-right">Return</TableHead>
                  <TableHead className="text-right">Drawdown</TableHead>
                  <TableHead className="text-right">Win rate</TableHead>
                  <TableHead className="text-right">PF</TableHead>
                  <TableHead className="text-right">Sharpe</TableHead>
                  <TableHead>Started</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(runs.data ?? []).map((r) => (
                  <TableRow key={r.run_id}>
                    <TableCell>
                      <Link to={`/runs/${r.run_id}`} className="text-primary hover:underline">
                        {r.run_id}
                      </Link>
                    </TableCell>
                    <TableCell>{r.config.symbol}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.config.provider} · {r.config.model}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(r.status) as never}>{r.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{fmtNum(r.trades, 0)}</TableCell>
                    <TableCell className={`text-right font-medium ${r.total_return != null ? (r.total_return >= 0 ? "text-green-500" : "text-destructive") : ""}`}>
                      {fmtPct(r.total_return)}
                    </TableCell>
                    <TableCell className="text-right text-destructive">{fmtPct(r.max_drawdown)}</TableCell>
                    <TableCell className="text-right">{fmtPct(r.win_rate)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {r.profit_factor != null ? fmtNum(r.profit_factor, 2) : "—"}
                    </TableCell>
                    <TableCell className={`text-right ${r.sharpe != null ? (r.sharpe >= 1 ? "text-green-500" : r.sharpe >= 0 ? "text-muted-foreground" : "text-destructive") : ""}`}>
                      {r.sharpe != null ? fmtNum(r.sharpe, 2) : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{fmtDate(r.started_at)}</TableCell>
                  </TableRow>
                ))}
                {runs.data && runs.data.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-muted-foreground py-12">
                      No runs yet. Configure one on the Backtest page.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
