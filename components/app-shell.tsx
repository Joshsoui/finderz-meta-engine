"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  BrainCircuit, ImageIcon, LayoutDashboard, Megaphone, Settings2, Zap,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";
import { Toaster, toast } from "sonner";

export type NavKey = "overzicht" | "pipeline" | "creatives" | "optimalisaties" | "automatisering";

const NAV_ITEMS: Array<{ key: NavKey; label: string; icon: typeof LayoutDashboard; href?: string; badge?: string }> = [
  { key: "overzicht", label: "Overzicht", icon: LayoutDashboard, href: "/" },
  { key: "pipeline", label: "Pipeline", icon: Megaphone, href: "/pipeline" },
  { key: "creatives", label: "Creatives", icon: ImageIcon },
  { key: "optimalisaties", label: "Optimalisaties", icon: BrainCircuit, badge: "3" },
  { key: "automatisering", label: "Automatisering", icon: Zap },
];

export function FinderzMark({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return <div className="finderz-symbol" aria-hidden="true"><span>F</span></div>;
  }
  return <img src="/finderzkeeperz-logo.png" alt="Finderz Keeperz" className="h-9 w-auto" />;
}

export function AppShell({
  active, title, subtitle, headerActions, children,
}: {
  active: NavKey;
  title: string;
  subtitle?: string;
  headerActions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="border-r border-white/8 bg-[#0d2b45]">
        <SidebarHeader className="h-[74px] justify-center border-b border-white/8 px-5">
          <div className="group-data-[collapsible=icon]:hidden"><FinderzMark /></div>
          <div className="hidden group-data-[collapsible=icon]:block"><FinderzMark compact /></div>
        </SidebarHeader>
        <SidebarContent className="px-3 py-5">
          <SidebarGroup>
            <SidebarGroupLabel className="px-3 text-[11px] font-bold uppercase tracking-[0.15em] text-[#506a7c] group-data-[collapsible=icon]:hidden">Meta Engine</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_ITEMS.map((item) => (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton
                      asChild={Boolean(item.href)}
                      isActive={item.key === active}
                      tooltip={item.label}
                      className="h-10 text-[#91aabb] data-[active=true]:bg-[#134b6c] data-[active=true]:text-white hover:bg-white/5 hover:text-white"
                      onClick={item.href ? undefined : () => toast.info(item.label + " is onderdeel van de volgende bouwslag.")}
                    >
                      {item.href ? (
                        <Link href={item.href}>
                          <item.icon /><span>{item.label}</span>
                          {item.badge && <span className="ml-auto rounded-full bg-[#df9826]/15 px-2 py-0.5 text-xs font-bold text-[#f0ad3d]">{item.badge}</span>}
                        </Link>
                      ) : (
                        <>
                          <item.icon /><span>{item.label}</span>
                          {item.badge && <span className="ml-auto rounded-full bg-[#df9826]/15 px-2 py-0.5 text-xs font-bold text-[#f0ad3d]">{item.badge}</span>}
                        </>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup className="mt-auto">
            <SidebarGroupLabel className="px-3 text-[11px] font-bold uppercase tracking-[0.15em] text-[#506a7c] group-data-[collapsible=icon]:hidden">Beheer</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu><SidebarMenuItem>
                <SidebarMenuButton tooltip="Instellingen" className="h-10 text-[#91aabb] hover:bg-white/5 hover:text-white" onClick={() => toast.info("Meta-koppeling wordt actief zodra de accountgegevens zijn toegevoegd.")}>
                  <Settings2 /><span>Instellingen</span>
                </SidebarMenuButton>
              </SidebarMenuItem></SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t border-white/8 p-4">
          <div className="flex items-center gap-3 rounded-xl bg-white/[0.035] p-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#006192] text-xs font-bold text-white">JS</div>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden"><p className="truncate text-sm font-semibold text-white">Joshua</p><p className="truncate text-xs text-[#6f8798]">Brand & Growth</p></div>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-w-0 bg-[#113047]">
        <header className="sticky top-0 z-30 flex h-[74px] items-center border-b border-white/8 bg-[#113047]/95 px-4 backdrop-blur md:px-7">
          <SidebarTrigger className="mr-3 text-[#91aabb] hover:bg-white/5 hover:text-white" />
          <div className="min-w-0"><h1 className="truncate text-lg font-semibold tracking-tight text-white">{title}</h1>{subtitle && <p className="hidden text-xs text-[#6f8798] sm:block">{subtitle}</p>}</div>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-[#256184] bg-[#13425e] px-3 py-1.5 text-xs font-semibold text-[#82cbe1] sm:flex"><span className="size-1.5 rounded-full bg-[#35b7df] shadow-[0_0_8px_#35b7df]" />Sandbox actief</div>
            {headerActions}
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1560px] space-y-6 p-4 md:p-7">{children}</main>
      </SidebarInset>
      <Toaster theme="dark" richColors position="bottom-right" />
    </SidebarProvider>
  );
}
