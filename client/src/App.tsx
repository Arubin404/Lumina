import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Sidebar from "@/components/layout/sidebar";
import Dashboard from "@/pages/dashboard";
import Ingresos from "@/pages/ingresos";
import Salidas from "@/pages/salidas";
import Movimientos from "@/pages/movimientos";
import Reportes from "@/pages/reportes";
import Configuracion from "@/pages/configuracion";
import NotFound from "@/pages/not-found";
import UpdateBanner from "@/components/UpdateBanner";

function Router() {
  const [location] = useLocation();
  return (
    <div key={location} className="page-in">
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/ingresos" component={Ingresos} />
        <Route path="/salidas" component={Salidas} />
        <Route path="/movimientos" component={Movimientos} />
        <Route path="/reportes" component={Reportes} />
        <Route path="/configuracion" component={Configuracion} />
        <Route component={NotFound} />
      </Switch>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="flex h-screen overflow-hidden bg-background text-foreground">
          <Sidebar />
          <main className="flex-1 overflow-auto bg-slate-950/20">
            <Router />
          </main>
        </div>
        <Toaster />
        {/* Banner de actualizaciones automáticas via Firebase */}
        <UpdateBanner />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
