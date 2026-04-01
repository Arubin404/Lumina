import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Plus, 
  Minus, 
  List, 
  BarChart3, 
  Settings,
  Banknote,
  Wifi
} from "lucide-react";
import { cn } from "@/lib/utils";

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

export default function Sidebar() {
  const [location] = useLocation();

  return (
    <nav className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col sidebar-transition">
      {/* Logo and Title */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-sidebar-primary rounded-lg flex items-center justify-center">
            <Banknote className="text-sidebar-primary-foreground h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-sidebar-foreground">Sistema de Caja</h1>
            <p className="text-sm text-muted-foreground">Profesional</p>
          </div>
        </div>
      </div>
      
      {/* Navigation Menu */}
      <div className="flex-1 p-4 space-y-2">
        {navigation.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.name} href={item.href}>
              <button 
                className={cn(
                  "w-full flex items-center space-x-3 px-4 py-3 text-left rounded-lg font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent"
                )}
                data-testid={`nav-${item.name.toLowerCase()}`}
              >
                <item.icon className="w-5 h-5" />
                <span>{item.name}</span>
              </button>
            </Link>
          );
        })}
        
        <div className="pt-4 border-t border-sidebar-border mt-4">
          {secondaryNavigation.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.name} href={item.href}>
                <button 
                  className={cn(
                    "w-full flex items-center space-x-3 px-4 py-3 text-left rounded-lg font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent"
                  )}
                  data-testid={`nav-${item.name.toLowerCase()}`}
                >
                  <item.icon className="w-5 h-5" />
                  <span>{item.name}</span>
                </button>
              </Link>
            );
          })}
        </div>
      </div>
      
      {/* Real-time sync indicator */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center space-x-2 text-sm">
          <div className="w-2 h-2 bg-success rounded-full pulse-success"></div>
          <Wifi className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">Sincronizado</span>
        </div>
      </div>
    </nav>
  );
}
