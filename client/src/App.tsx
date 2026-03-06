import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Home from "./pages/Home";
import Simulator from "./pages/Simulator";
import Results from "./pages/Results";
import HowItWorks from "./pages/HowItWorks";
import Pricing from "./pages/Pricing";
import SampleReport from "./pages/SampleReport";
import BlogIndex from "./pages/BlogIndex";
import BlogPost from "./pages/BlogPost";
import RerunRedirect from "./pages/RerunRedirect";
import Terms from "./pages/Terms";
import Contact from "./pages/Contact";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/app" component={Simulator} />
      <Route path="/simulator" component={Simulator} />
      <Route path="/how-it-works" component={HowItWorks} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/sample-report" component={SampleReport} />
      <Route path="/blog" component={BlogIndex} />
      <Route path="/blog/:slug" component={BlogPost} />
      <Route path="/results/:id" component={Results} />
      <Route path="/rerun/:token" component={RerunRedirect} />
      <Route path="/terms" component={Terms} />
      <Route path="/contact" component={Contact} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
