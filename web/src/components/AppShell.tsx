"use client";

import { AppSidebar } from "@/components/AppSidebar";
import { PaneSeparator } from "@/components/PaneSeparator";
import { usePanelLayoutStorage } from "@/components/panelLayoutStorage";
import { useCallback, useState, type ReactNode } from "react";
import {
  Group,
  Panel,
  useDefaultLayout,
  usePanelRef,
} from "react-resizable-panels";

/** App chrome: resizable nav | main content. */
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
  const storage = usePanelLayoutStorage();

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "mv-nav",
    panelIds: ["nav", "main"],
    storage,
  });

  return (
    <Group
      id="mv-nav"
      orientation="horizontal"
      className="h-full w-full"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
    >
      <Panel
        id="nav"
        panelRef={navPanelRef}
        defaultSize={200}
        minSize={160}
        maxSize={360}
        collapsible
        collapsedSize={40}
        className="min-h-0"
      >
        <AppSidebar
          active={active}
          groups={groups}
          navPanelRef={navPanelRef}
          onCollapsedChange={onCollapsedChange}
        />
      </Panel>
      <PaneSeparator orientation="vertical" disabled={navCollapsed} />
      <Panel id="main" minSize="30%" className="min-h-0 min-w-0">
        {children}
      </Panel>
    </Group>
  );
}
