import { Switch, Route } from "wouter";
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

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/ingresos" component={Ingresos} />
      <Route path="/salidas" component={Salidas} />
      <Route path="/movimientos" component={Movimientos} />
      <Route path="/reportes" component={Reportes} />
      <Route path="/configuracion" component={Configuracion} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="flex h-screen overflow-hidden bg-background text-foreground">
          <Sidebar />
          <main className="flex-1 overflow-auto">
            <Router />
          </main>
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
