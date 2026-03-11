"use client";

import { useMemo, useState } from "react";
import { html, Diff2HtmlConfig } from "diff2html";
import "diff2html/bundles/css/diff2html.min.css";

interface RepoDiff {
  repo: string;
  diff: string;
}

interface DiffViewerProps {
  diffs: RepoDiff[];
}

const DIFF_CONFIG: Diff2HtmlConfig = {
  outputFormat: "side-by-side",
  drawFileList: true,
  matching: "lines",
  renderNothingWhenEmpty: false,
};

export function DiffViewer({ diffs }: DiffViewerProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const renderedDiffs = useMemo(() => {
    return diffs.map((d) => ({
      repo: d.repo,
      html: html(d.diff, DIFF_CONFIG),
    }));
  }, [diffs]);

  if (diffs.length === 0) {
    return (
      <div className="rounded border bg-gray-50 px-4 py-3 text-sm text-gray-500">
        No file changes detected.
      </div>
    );
  }

  return (
    <>
      <style>{`
        .diff-root,
        .diff-root * {
          position: relative !important;
        }
        .diff-root .d2h-wrapper {
          display: block !important;
        }
        .diff-root .d2h-file-wrapper {
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          margin-bottom: 8px;
          overflow: hidden;
        }
        .diff-root .d2h-file-header {
          padding: 4px 8px;
          font-size: 12px;
        }
        .diff-root .d2h-code-line-ctn {
          white-space: pre;
        }
        .diff-root .d2h-code-side-line {
          padding: 0 4px;
        }
        .diff-root table.d2h-diff-table {
          font-size: 11px;
        }
        .diff-root .d2h-file-side-diff {
          overflow-x: auto;
          display: inline-block;
          width: 50%;
          vertical-align: top;
        }
        .diff-root .d2h-file-list-wrapper {
          margin-bottom: 4px;
        }
      `}</style>
      <div className="space-y-3">
        {renderedDiffs.map(({ repo, html: diffHtml }) => (
          <div key={repo} className="overflow-hidden rounded border">
            <button
              onClick={() => setCollapsed((prev) => ({ ...prev, [repo]: !prev[repo] }))}
              className="flex w-full items-center justify-between bg-gray-100 px-4 py-2 text-left text-sm font-medium hover:bg-gray-200"
            >
              <span>{repo.replace(/_/g, "/")}</span>
              <span className="text-xs text-gray-500">
                {collapsed[repo] ? "Show" : "Hide"}
              </span>
            </button>
            {!collapsed[repo] && (
              <div
                className="diff-root overflow-x-auto"
                dangerouslySetInnerHTML={{ __html: diffHtml }}
              />
            )}
          </div>
        ))}
      </div>
    </>
  );
}
