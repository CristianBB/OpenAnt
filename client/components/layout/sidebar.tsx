"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface Project {
  id: string;
  name: string;
}

const navItems = [
  { label: "Tasks", path: "tasks" },
  { label: "Work Groups", path: "work-groups" },
  { label: "Plans", path: "plans" },
  { label: "Repositories", path: "repositories" },
  { label: "Channels", path: "channels" },
  { label: "Integrations", path: "integrations" },
  { label: "Settings", path: "settings" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");

  useEffect(() => {
    apiFetch<Project[]>("/api/projects")
      .then((p) => {
        setProjects(p);
        // Auto-select from URL or first project
        const match = pathname.match(/\/projects\/([^/]+)/);
        if (match) {
          setSelectedProject(match[1]);
        } else if (p.length > 0) {
          setSelectedProject(p[0].id);
        }
      })
      .catch(() => {});
  }, [pathname]);

  function handleProjectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newProjectId = e.target.value;
    setSelectedProject(newProjectId);
    if (newProjectId) {
      const sectionMatch = pathname.match(/\/projects\/[^/]+\/(.+)/);
      const section = sectionMatch ? sectionMatch[1] : "tasks";
      router.push(`/projects/${newProjectId}/${section}`);
    }
  }

  return (
    <aside className="flex h-full w-56 flex-col border-r bg-gray-50">
      <div className="border-b p-4">
        <Link href="/" className="text-lg font-bold text-gray-900">
          OpenAnt
        </Link>
      </div>

      <div className="border-b p-3">
        <select
          value={selectedProject}
          onChange={handleProjectChange}
          className="w-full rounded border bg-white px-2 py-1.5 text-sm"
        >
          <option value="">Select project...</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {selectedProject && (
        <nav className="flex-1 overflow-auto p-2">
          {navItems.map((item) => {
            const href = `/projects/${selectedProject}/${item.path}`;
            const isActive = pathname.startsWith(href);
            return (
              <Link
                key={item.path}
                href={href}
                className={`block rounded px-3 py-2 text-sm ${
                  isActive
                    ? "bg-gray-200 font-medium text-gray-900"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}

      <div className="border-t p-2">
        <Link
          href="/projects"
          className="block rounded px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
        >
          All Projects
        </Link>
      </div>
    </aside>
  );
}
