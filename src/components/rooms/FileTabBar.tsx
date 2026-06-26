"use client";

import { useState } from "react";
import type { SessionFile } from "@/types/rooms";
import { cn } from "@/lib/utils";
import { SiJavascript, SiTypescript, SiPython, SiRust, SiGo, SiHtml5, SiCss3 } from "@icons-pack/react-simple-icons";
import { File } from "lucide-react";

const FILE_ICONS: Record<string, React.ElementType> = {
    javascript: SiJavascript,
    typescript: SiTypescript,
    python: SiPython,
    rust: SiRust,
    go: SiGo,
    html: SiHtml5,
    css: SiCss3,
};

const FILE_LANG_COLOR: Record<string, string> = {
    javascript: "text-yellow-400",
    typescript: "text-blue-400",
    python:   "text-blue-300",
    rust:   "text-orange-400",
    go:   "text-cyan-400",
    html: "text-orange-300",
    css:  "text-purple-400",
};

interface Props {
    files: SessionFile[];
    activeFile: string;
    isHost: boolean;
    roomId: string;
    sessionId: string;
    onSwitch: (filename: string) => void;
    onAddFile: (name: string, language: string) => void;
    onEndSession?: () => void;
    ending?: boolean;
}

export default function FileTabBar({
    files,
    activeFile,
    isHost,
    onSwitch,
    onAddFile,
    onEndSession,
    ending,
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
            className="flex items-center h-10 px-2 gap-1 bg-[#111113] border-b border-white/5 overflow-x-auto shrink-0"
            style={{ scrollbarWidth: "none" }}
        >
            {files.map((file) => {
                const isActive = file.name === activeFile;
                const Icon = FILE_ICONS[file.language] ?? File;
                const color = FILE_LANG_COLOR[file.language] ?? "text-zinc-500";
                return (
                    <button
                        key={file.name}
                        onClick={() => onSwitch(file.name)}
                        className={[
                            "flex items-center gap-2 px-3 h-full text-[13px] shrink-0 transition-all duration-150 font-[500] relative",
                            isActive
                                ? "text-zinc-100 bg-white/[0.04]"
                                : "text-zinc-500 hover:text-zinc-300",
                        ].join(" ")}
                    >
                        {isActive && (
                            <div className="absolute left-0 right-0 bottom-0 h-[2px] bg-[#a7c8b3] rounded-t-full shadow-[0_-1px_6px_rgba(167,200,179,0.3)]" />
                        )}
                        <Icon className={cn("w-[14px] h-[14px] shrink-0", isActive ? color : "text-zinc-500 opacity-60")} />
                        <span className="font-mono tracking-tight">{file.name}</span>
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
                                className="text-[10px] font-[600] uppercase tracking-widest text-[#a7c8b3] hover:text-white transition-colors"
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
                        className="ml-1 w-6 h-6 rounded flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 shrink-0 transition-all duration-150 hover:-translate-y-0.5 active:scale-95"
                    >
                        +
                    </button>
                ))}
                
            <div className="flex-1" />
            
            {isHost && onEndSession && (
                <button
                    onClick={onEndSession}
                    disabled={ending}
                    className="text-[11px] font-[600] px-3 py-1.5 rounded-md text-white bg-[#E65454] hover:bg-[#EF4444] transition-colors shadow-sm shrink-0 whitespace-nowrap ml-4 disabled:opacity-50"
                >
                    {ending ? "Ending…" : "End Coding Session"}
                </button>
            )}
        </div>
    );
}
