"use client";

import { useState } from "react";
import type { SessionFile } from "@/types/rooms";

const LANG_BADGE: Record<string, string> = {
    javascript: "JS",
    typescript: "TS",
    python: "PY",
    rust: "RS",
    go: "GO",
    html: "HT",
    css: "CS",
};

interface Props {
    files: SessionFile[];
    activeFile: string;
    isHost: boolean;
    roomId: string;
    sessionId: string;
    onSwitch: (filename: string) => void;
    onAddFile: (name: string, language: string) => void;
}

export default function FileTabBar({
    files,
    activeFile,
    isHost,
    onSwitch,
    onAddFile,
}: Props) {
    const [adding, setAdding] = useState(false);
    const [newName, setNewName] = useState("");
    const [newLang, setNewLang] = useState("javascript");

    function handleAdd() {
        const name = newName.trim();
        if (!name) return;
        onAddFile(name, newLang);
        setNewName("");
        setAdding(false);
    }

    return (
        <div
            className="flex items-center h-9 px-2 gap-1 bg-[#0a0a0a] border-b border-zinc-800 overflow-x-auto shrink-0"
            style={{ scrollbarWidth: "none" }}
        >
            {files.map((file) => {
                const isActive = file.name === activeFile;
                return (
                    <button
                        key={file.name}
                        onClick={() => onSwitch(file.name)}
                        className={[
                            "flex items-center gap-1.5 px-3 h-7 rounded-md text-xs shrink-0 transition-colors font-medium",
                            isActive
                                ? "bg-zinc-800 text-zinc-100"
                                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50",
                        ].join(" ")}
                    >
                        <span className="text-[9px] font-bold opacity-60 text-indigo-400">
                            {LANG_BADGE[file.language] ?? "  "}
                        </span>
                        <span className="font-mono">{file.name}</span>
                    </button>
                );
            })}

            {/* Add file — host only */}
            {isHost &&
                (adding ? (
                    <div className="flex items-center gap-1.5 ml-1 shrink-0 bg-zinc-900 rounded-md p-0.5 border border-zinc-700">
                        <input
                            autoFocus
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleAdd();
                                if (e.key === "Escape") setAdding(false);
                            }}
                            placeholder="filename.js"
                            className="bg-transparent text-[11px] text-zinc-200 px-1.5 py-0.5 w-28 font-mono outline-none placeholder:text-zinc-600"
                        />
                        <select
                            value={newLang}
                            onChange={(e) => setNewLang(e.target.value)}
                            className="bg-transparent text-[11px] text-zinc-400 px-1 outline-none border-l border-zinc-800 cursor-pointer"
                        >
                            {[
                                "javascript",
                                "typescript",
                                "python",
                                "rust",
                                "go",
                                "html",
                                "css",
                            ].map((l) => (
                                <option key={l} value={l} className="bg-zinc-900">
                                    {l}
                                </option>
                            ))}
                        </select>
                        <div className="flex items-center gap-0.5 ml-1 border-l border-zinc-800 pl-1.5 pr-0.5">
                            <button
                                onClick={handleAdd}
                                className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 hover:text-indigo-300 transition-colors"
                            >
                                Add
                            </button>
                            <button
                                onClick={() => setAdding(false)}
                                className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors px-1"
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={() => setAdding(true)}
                        title="Add file"
                        className="ml-1 w-6 h-6 rounded flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 shrink-0 transition-colors"
                    >
                        +
                    </button>
                ))}
        </div>
    );
}
