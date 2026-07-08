"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/useAuth";
import {
  UtensilsCrossed,
  BookOpen,
  ShoppingCart,
  Database,
  BarChart2,
  LogOut,
  Menu,
  X,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/accueil",          label: "Accueil",                  icon: UtensilsCrossed },
  { href: "/composer",         label: "Composer un repas",        icon: UtensilsCrossed },
  { href: "/meals",            label: "Mes repas enregistrés",    icon: BookOpen },
  { href: "/shopping",         label: "Liste de courses",         icon: ShoppingCart },
  { href: "/referentiel",      label: "Référentiel aliments",     icon: Database },
  { href: "/comptage-calories",label: "Comptage calories",        icon: BarChart2 },
];

export default function Sidebar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const onLogout = () => {
    logout();
    router.replace("/login");
  };

  const SidebarContent = () => (
    <aside className="flex flex-col h-full w-64 bg-gray-950 border-r border-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-gray-800">
        <span className="text-white font-semibold text-base tracking-tight">🥦 MealPrep</span>
        <button onClick={() => setOpen(false)} className="md:hidden text-gray-500 hover:text-white">
          <X size={18} />
        </button>
      </div>

      {/* User */}
      <div className="px-5 py-4 border-b border-gray-800">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-0.5">Connecté en tant que</p>
        <p className="text-sm font-medium text-gray-200 truncate">{user?.nickname || user?.email}</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-gray-800 text-white font-medium"
                  : "text-gray-400 hover:bg-gray-800/60 hover:text-gray-100"
              }`}
            >
              <Icon size={16} className={active ? "text-white" : "text-gray-500"} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-gray-800">
        <button
          onClick={onLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-gray-800/60 hover:text-gray-100 transition-colors"
        >
          <LogOut size={16} className="text-gray-500" />
          Se déconnecter
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Mobile top bar — sticky, pleine largeur, fond opaque */}
      <div className="md:hidden sticky top-0 left-0 right-0 z-40 bg-gray-950 border-b border-gray-800 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => setOpen(true)}
          className="w-9 h-9 rounded-lg bg-gray-900 border border-gray-700 flex items-center justify-center text-gray-300"
          aria-label="Ouvrir le menu"
        >
          <Menu size={18} />
        </button>
        <span className="text-white font-semibold text-sm">🥦 MealPrep</span>
      </div>

      {/* Mobile overlay */}
      {open && (
        <div className="md:hidden fixed inset-0 bg-black/70 z-40" onClick={() => setOpen(false)} />
      )}

      {/* Mobile drawer */}
      <div
        className={`md:hidden fixed top-0 left-0 h-full z-50 transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <SidebarContent />
      </div>

      {/* Desktop sticky */}
      <div className="hidden md:flex h-screen sticky top-0">
        <SidebarContent />
      </div>
    </>
  );
}