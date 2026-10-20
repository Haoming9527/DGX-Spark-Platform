"use client";

import { useCallback, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useModels, useScrollSpy } from "./hooks";
import { groupIdForSection, navGroups, scrollToSection, type NavGroupId } from "./nav";
import { Chat, Streaming, Vision } from "./sections/Chat";
import { Embeddings, SystemOne } from "./sections/Data";
import { Authentication, Models, Overview, Quickstart } from "./sections/GetStarted";
import { Endpoints, ErrorsUsage, Roadmap, Terms } from "./sections/Reference";
import { Structured, Tools } from "./sections/Tools";

export function DocsView() {
  const models = useModels();
  const [activeSection, setActiveSection] = useState("overview");
  const [peekGroup, setPeekGroup] = useState<NavGroupId | null>(null);
  const activeGroup = groupIdForSection(activeSection);

  const onVisible = useCallback((sectionId: string) => {
    setActiveSection(sectionId);
    const group = groupIdForSection(sectionId);
    setPeekGroup((current) => current === group ? null : current);
  }, []);
  useScrollSpy(onVisible);

  const open = (groupId: NavGroupId) => groupId === activeGroup || groupId === peekGroup;
  const toggle = (groupId: NavGroupId) => {
    if (groupId !== activeGroup) setPeekGroup((current) => current === groupId ? null : groupId);
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-24 lg:h-[calc(100vh-7rem)] lg:overflow-y-auto">
        <nav className="space-y-1 rounded-lg border border-border bg-panel p-2" aria-label="Documentation">
          {navGroups.map((group) => (
            <div key={group.id}>
              <button type="button" onClick={() => toggle(group.id)} aria-expanded={open(group.id)}
                className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-bold uppercase transition-colors ${group.id === activeGroup ? "text-nvidia-green hover:bg-panel-hover" : "text-foreground/40 hover:bg-panel-hover hover:text-foreground/70"}`}>
                <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open(group.id) ? "" : "-rotate-90"}`} />
                <span className="min-w-0 flex-1">{group.label}</span>
              </button>
              {open(group.id) && (
                <div className="pb-1">
                  {group.items.map((section) => (
                    <a key={section.id} href={`#${section.id}`}
                      onClick={(event) => { event.preventDefault(); setActiveSection(section.id); setPeekGroup(null); scrollToSection(section.id); }}
                      className={`ml-2 flex items-center rounded-md px-3 py-2 text-sm font-semibold transition-colors ${activeSection === section.id ? "bg-nvidia-green/10 text-nvidia-green" : "text-foreground/65 hover:bg-panel-hover hover:text-foreground"}`}>
                      {section.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 space-y-14">
        <Overview />
        <Quickstart />
        <Authentication />
        <Models state={models} />
        <Chat />
        <Streaming />
        <Vision />
        <Embeddings />
        <SystemOne state={models} />
        <Tools />
        <Structured />
        <Endpoints />
        <ErrorsUsage />
        <Roadmap />
        <Terms />
      </div>
    </div>
  );
}
