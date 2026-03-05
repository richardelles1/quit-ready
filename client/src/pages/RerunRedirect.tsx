import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { Loader2, AlertCircle } from "lucide-react";
import Layout from "../components/Layout";

export default function RerunRedirect() {
  const { token } = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Invalid link.");
      return;
    }

    fetch(`/api/rerun/${token}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 410) {
            setError("This rerun link has already been used. Each discounted rerun link is single-use. Start a new simulation at the full rate from the homepage.");
          } else if (res.status === 404) {
            setError("This rerun link is not valid. It may have expired or been entered incorrectly.");
          } else {
            setError(data.message || "Something went wrong. Please try again.");
          }
          return;
        }
        if (data.url) {
          window.location.href = data.url;
        } else {
          setError("Could not generate checkout session. Please try again.");
        }
      })
      .catch(() => {
        setError("Network error. Please check your connection and try again.");
      });
  }, [token]);

  return (
    <Layout>
      <div className="flex-1 flex items-center justify-center p-12">
        {error ? (
          <div className="max-w-md text-center space-y-4">
            <AlertCircle className="w-10 h-10 text-destructive mx-auto" />
            <h1 className="text-lg font-semibold text-foreground">Discount Link Issue</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">{error}</p>
            <button
              onClick={() => setLocation("/app")}
              className="mt-4 text-sm font-medium text-foreground underline underline-offset-4"
              data-testid="button-rerun-go-home"
            >
              Start a new analysis at full price →
            </button>
          </div>
        ) : (
          <div className="text-center space-y-4">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">Preparing your discounted new analysis session…</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
