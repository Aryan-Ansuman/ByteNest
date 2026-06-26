"use client";

import { useState } from "react";
import { useRoomStore } from "@/store/roomStore";
import {
    Hash, Folder, File, FolderOpen, ChevronDown,
    MessageSquare, Settings, Bell, Radio, Plus, Code2
} from "lucide-react";
import { SiJavascript, SiTypescript, SiPython, SiRust, SiGo, SiHtml5, SiCss3 } from "@icons-pack/react-simple-icons";
import { cn } from "@/lib/utils";

const FILE_ICONS: Record<string, React.ElementType> = {
    js: SiJavascript,
    ts: SiTypescript,
    py: SiPython,
    rs: SiRust,
    go: SiGo,
    html: SiHtml5,
    css: SiCss3,
};

const FILE_LANG_COLOR: Record<string, string> = {
    js:   "text-yellow-400",
    ts:   "text-blue-400",
    py:   "text-blue-300",
    rs:   "text-orange-400",
    go:   "text-cyan-400",
    html: "text-orange-300",
    css:  "text-purple-400",
    md:   "text-zinc-400",
    json: "text-yellow-300",
};

const FILE_LANG_LABEL: Record<string, string> = {
    js: "JS", ts: "TS", py: "PY", rs: "RS",
    go: "GO", html: "HT", css: "CS", md: "MD", json: "{}",
};

function getExt(name: string) {
    return name.split(".").pop()?.toLowerCase() ?? "";
}

interface Props {
    roomId: string;
}

export default function LeftNav({ roomId }: Props) {
    const room        = useRoomStore((s) => s.room);
    const codeSession = useRoomStore((s) => s.codeSession);

    const [filesOpen, setFilesOpen] = useState(true);
    const [activeFile, setActiveFile] = useState<string | null>(null);

    const parsedFiles: Array<{ name: string; language: string }> = (() => {
        try { return JSON.parse(codeSession?.files ?? "[]"); }
        catch { return []; }
    })();



    return (
        <aside className="w-full h-full shrink-0 bg-[#111113] flex flex-col overflow-hidden select-none">
            {/* FILES section */}
            <div className="px-4 py-4 flex-1 min-h-0 flex flex-col">
                <div className="flex items-center justify-between w-full mb-3 px-1">
                    <button
                        className="flex items-center gap-1 group"
                        onClick={() => setFilesOpen((v) => !v)}
                    >
                        <ChevronDown className={cn(
                            "w-3 h-3 text-zinc-500 transition-transform",
                            !filesOpen ? "-rotate-90" : ""
                        )} />
                        <h2 className="text-[15px] font-[600] text-zinc-200 group-hover:text-white transition-colors">
                            Files
                        </h2>
                    </button>
                    <button className="p-1 rounded hover:bg-zinc-800/60 text-zinc-500 hover:text-zinc-300 transition-colors" title="New File">
                        <Plus className="w-3.5 h-3.5" />
                    </button>
                </div>

                {filesOpen && (
                    <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.06) transparent" }}>
                        {parsedFiles.length === 0 ? (
                            <div className="px-4 py-8 text-center text-zinc-600 text-[11px]">
                                No files yet.
                            </div>
                        ) : (
                            <div className="px-1 space-y-1 mt-2">
                                <FolderRow label="src" defaultOpen={true}>
                                    <div className="mt-1 space-y-1">
                                        {parsedFiles.map((f) => (
                                            <FileRow
                                                key={f.name}
                                                name={f.name}
                                                active={activeFile === f.name}
                                                onClick={() => setActiveFile(f.name)}
                                            />
                                        ))}
                                    </div>
                                </FolderRow>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </aside>
    );
}

function NavChannel({ label, active = false }: { label: string; active?: boolean }) {
    return (
        <button className={cn(
            "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[13px] transition-colors text-left",
            active
                ? "bg-zinc-800/70 text-zinc-100 font-medium"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30"
        )}>
            <Hash className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{label}</span>
        </button>
    );
}

function FolderRow({
    label,
    children,
    defaultOpen = false,
}: {
    label: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div>
            <button
                onClick={() => setOpen((v) => !v)}
                className="group flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-[13px] hover:bg-white/[0.03] transition-colors"
            >
                <ChevronDown className={cn("w-3.5 h-3.5 transition-transform text-zinc-500 group-hover:text-zinc-400", !open ? "-rotate-90" : "")} />
                <span className="font-[600] text-zinc-300 group-hover:text-zinc-100 transition-colors tracking-wide">{label}</span>
            </button>
            {open && <div className="ml-3.5 border-l border-white/[0.08] pl-2.5 mt-0.5">{children}</div>}
        </div>
    );
}

function FileRow({
    name,
    active = false,
    onClick,
}: {
    name: string;
    active?: boolean;
    onClick?: () => void;
}) {
    const ext = getExt(name);
    const color = FILE_LANG_COLOR[ext] ?? "text-zinc-500";
    const Icon = FILE_ICONS[ext] ?? File;

    return (
        <button
            onClick={onClick}
            className={cn(
                "relative flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-[13px] text-left transition-colors group",
                active
                    ? "bg-[#a7c8b3]/[0.12] text-[#a7c8b3] font-[500]"
                    : "text-zinc-400 font-[400] hover:text-zinc-200 hover:bg-white/[0.03]"
            )}
        >
            {active && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[18px] bg-[#a7c8b3] rounded-r-full shadow-[0_0_8px_rgba(167,200,179,0.4)]" />
            )}
            <Icon className={cn("w-3.5 h-3.5 shrink-0", active ? "text-[#a7c8b3]" : color)} />
            <span className="truncate font-mono tracking-tight">{name}</span>
        </button>
    );
}


