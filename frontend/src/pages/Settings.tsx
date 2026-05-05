import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, AlertCircle } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

export default function SettingsPage() {
  const providers = useQuery({
    queryKey: ["providers"],
    queryFn: api.providers,
    refetchInterval: 5000,
  });

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Provider availability is read-only here. Configure API keys via the backend's .env file."
      />
      <div className="px-8 py-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        {(providers.data ?? []).map((p) => (
          <Card key={p.name}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="capitalize">{p.name}</span>
                {p.available ? (
                  <Badge variant="success" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" /> ready
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1">
                    <AlertCircle className="h-3 w-3" /> unavailable
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div>
                <div className="text-muted-foreground">Default model</div>
                <div className="font-mono mt-0.5">{p.default_model}</div>
              </div>
              {p.models.length > 0 && (
                <div>
                  <div className="text-muted-foreground">Available models</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {p.models.map((m) => (
                      <Badge key={m} variant="outline" className="text-[10px] font-mono">{m}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {p.note && (
                <p className="text-muted-foreground border-t border-border/50 pt-3 mt-3 leading-relaxed">
                  {p.note}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="px-8 pb-8">
        <Card>
          <CardHeader><CardTitle>Environment variables</CardTitle></CardHeader>
          <CardContent className="text-xs font-mono space-y-1.5 text-muted-foreground">
            <div>SATURDAY_DEFAULT_PROVIDER=ollama</div>
            <div>SATURDAY_DEFAULT_MODEL=qwen2.5:7b-instruct</div>
            <div>SATURDAY_OLLAMA_HOST=http://localhost:11434</div>
            <div>SATURDAY_OPENAI_API_KEY=...</div>
            <div>SATURDAY_ANTHROPIC_API_KEY=...</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
