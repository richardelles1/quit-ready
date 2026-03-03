import { Component, ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center py-24 px-4 text-center">
          <p className="text-sm font-semibold text-foreground mb-2">Something didn't load.</p>
          <p className="text-sm text-muted-foreground mb-6">Refresh or restart your simulation.</p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => window.location.reload()}>Refresh page</Button>
            <Button onClick={() => { this.setState({ hasError: false }); window.location.href = '/simulator'; }}>
              Restart simulation
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
