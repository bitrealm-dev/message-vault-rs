"use client";

import { AppSidebar } from "@/components/AppSidebar";
import {
  HistoryProvider,
  HistoryToast,
} from "@/components/history";
import { NavRail } from "@/components/NavRail";
import { PaneSeparator } from "@/components/PaneSeparator";
import { usePanelLayoutStorage } from "@/components/panelLayoutStorage";
import { SettingsSidebar } from "@/components/SettingsSidebar";
import { useNavCollapse } from "@/components/useNavCollapse";
import { usePathname } from "next/navigation";
import { useCallback, useState, type ReactNode } from "react";
import {
  Group,
  Panel,
  useDefaultLayout,
  usePanelRef,
} from "react-resizable-panels";

/** App chrome: fixed nav rail | resizable nav drawer | main content. */
export function AppShell({
  active,
  groups = [],
  children,
}: {
  active: string;
  groups?: string[];
  children: ReactNode;
}) {
  const navPanelRef = usePanelRef();
  const [navCollapsed, setNavCollapsed] = useState(false);
  const onCollapsedChange = useCallback((c: boolean) => {
    setNavCollapsed(c);
  }, []);
  const { collapsed, toggleCollapsed } = useNavCollapse(
    navPanelRef,
    onCollapsedChange,
  );
  const storage = usePanelLayoutStorage();
  const pathname = usePathname();
  const settingsMode = pathname.startsWith("/settings");

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "mv-nav",
    panelIds: ["nav", "main"],
    storage,
  });

  return (
    <HistoryProvider>
      <div className="flex h-full w-full overflow-visible">
        <NavRail collapsed={collapsed} onToggle={toggleCollapsed} />
        <Group
          id="mv-nav"
          orientation="horizontal"
          className="min-h-0 min-w-0 flex-1"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
        >
          <Panel
            id="nav"
            panelRef={navPanelRef}
            defaultSize={200}
            minSize={120}
            maxSize={360}
            collapsible
            collapsedSize={0}
            className="min-h-0"
          >
            {settingsMode ? (
              <SettingsSidebar collapsed={collapsed} />
            ) : (
              <AppSidebar
                active={active}
                groups={groups}
                collapsed={collapsed}
              />
            )}
          </Panel>
          <PaneSeparator orientation="vertical" disabled={navCollapsed} />
          <Panel id="main" minSize="30%" className="min-h-0 min-w-0">
            {children}
          </Panel>
        </Group>
      </div>
      <HistoryToast />
    </HistoryProvider>
  );
}
