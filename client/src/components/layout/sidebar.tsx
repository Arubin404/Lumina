import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Plus, 
  Minus, 
  List, 
  BarChart3, 
  Settings,
  Banknote,
  Wifi,
  WifiOff,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect, useCallback } from "react";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Ingresos", href: "/ingresos", icon: Plus },
  { name: "Salidas", href: "/salidas", icon: Minus },
  { name: "Movimientos", href: "/movimientos", icon: List },
  { name: "Reportes", href: "/reportes", icon: BarChart3 },
];

const secondaryNavigation = [
  { name: "Configuración", href: "/configuracion", icon: Settings },
];

type ConnectionStatus = "online" | "offline" | "reconnecting";

function useConnectionStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>("online");
  const [failCount, setFailCount] = useState(0);

  const checkConnection = useCallback(async () => {
    if (!navigator.onLine) {
      setStatus("offline");
      return;
    }
    try {
      // Ping the local API to confirm the backend is alive
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch("/api/cashbox", { 
        method: "HEAD", 
        signal: controller.signal,
        cache: "no-store"
      });
      clearTimeout(timeout);
      if (res.ok || res.status === 405) {
        setStatus("online");
        setFailCount(0);
      } else {
        throw new Error("non-ok response");
      }
    } catch {
      setFailCount(prev => {
        const next = prev + 1;
        if (next >= 2) {
          setStatus("offline");
        } else {
          setStatus("reconnecting");
        }
        return next;
      });
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setStatus("reconnecting");
      // Confirm with an actual ping
      checkConnection();
    };
    const handleOffline = () => setStatus("offline");

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Poll every 15 seconds
    const interval = setInterval(checkConnection, 15_000);
    // Initial check
    checkConnection();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, [checkConnection]);

  return status;
}

export default function Sidebar() {
  const [location] = useLocation();
  const connectionStatus = useConnectionStatus();

  const statusConfig = {
    online: {
      dot: "bg-success",
      dotClass: "animate-pulse",
      icon: Wifi,
      iconClass: "text-success",
      label: "Sincronizado",
      labelClass: "text-success",
    },
    offline: {
      dot: "bg-destructive",
      dotClass: "",
      icon: WifiOff,
      iconClass: "text-destructive",
      label: "Sin Conexión",
      labelClass: "text-destructive",
    },
    reconnecting: {
      dot: "bg-warning",
      dotClass: "animate-pulse",
      icon: Loader2,
      iconClass: "text-warning animate-spin",
      label: "Reconectando...",
      labelClass: "text-warning",
    },
  };

  const sc = statusConfig[connectionStatus];
  const StatusIcon = sc.icon;

  return (
    <nav className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col sidebar-transition">
      {/* Logo and Title */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-x-3">
          <div className="size-10 flex items-center justify-center">
            <img src="/icon.png" alt="Lumina Logo" className="size-10 object-contain" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-sidebar-foreground">Sistema de Caja</h1>
            <p className="text-sm text-muted-foreground">Profesional</p>
          </div>
        </div>
      </div>
      
      {/* Navigation Menu */}
      <div className="flex-1 p-4 gap-y-2">
        {navigation.map((item) => {
          const isActive = location === item.href;
          return (
            <Link 
              key={item.name} 
              href={item.href}
              className={cn(
                "w-full flex items-center gap-x-3 px-4 py-3 text-left rounded-lg font-medium transition-colors cursor-pointer",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent"
              )}
              data-testid={`nav-${item.name.toLowerCase()}`}
            >
              <item.icon className="size-5" />
              <span>{item.name}</span>
            </Link>
          );
        })}
        
        <div className="pt-4 border-t border-sidebar-border mt-4">
          {secondaryNavigation.map((item) => {
            const isActive = location === item.href;
            return (
              <Link 
                key={item.name} 
                href={item.href}
                className={cn(
                  "w-full flex items-center gap-x-3 px-4 py-3 text-left rounded-lg font-medium transition-colors cursor-pointer",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent"
                )}
                data-testid={`nav-${item.name.toLowerCase()}`}
              >
                <item.icon className="size-5" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </div>
      </div>
      
      {/* Real-time connection indicator */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-x-2 text-sm transition-all duration-300">
          <div className={cn("size-2 rounded-full shrink-0", sc.dot, sc.dotClass)} />
          <StatusIcon className={cn("size-4 shrink-0", sc.iconClass)} />
          <span className={cn("font-medium transition-colors duration-300", sc.labelClass)}>
            {sc.label}
          </span>
        </div>
      </div>
    </nav>
  );
}
