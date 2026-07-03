"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-fetch";
import { cn } from "@/lib/utils";
import { FileText, LayoutTemplate, Check } from "lucide-react";
import { SiJavascript, SiTypescript, SiPython, SiRust, SiGo, SiHtml5, SiCss } from "@icons-pack/react-simple-icons";
import { motion } from "framer-motion";
import { validateSessionFilename } from "@/lib/rooms/files";

const LANGUAGES = [
    { label: "JavaScript", value: "javascript", file: "index.js", icon: SiJavascript },
    { label: "TypeScript", value: "typescript", file: "index.ts", icon: SiTypescript },
    { label: "Python", value: "python", file: "main.py", icon: SiPython },
    { label: "Rust", value: "rust", file: "main.rs", icon: SiRust },
    { label: "Go", value: "go", file: "main.go", icon: SiGo },
    { label: "HTML", value: "html", file: "index.html", icon: SiHtml5 },
    { label: "CSS", value: "css", file: "style.css", icon: SiCss },
];

interface Template {
    id: string;
    label: string;
    description: string;
    language: string;
    filename: string;
    initialContent: string;
}

const TEMPLATES: Template[] = [
    {
        id: "blank",
        label: "Blank file",
        description: "Start from an empty file",
        language: "javascript",
        filename: "index.js",
        initialContent: "",
    },
    {
        id: "react-component",
        label: "React Component",
        description: "Functional component with useState",
        language: "typescript",
        filename: "Component.tsx",
        initialContent:
`import { useState } from "react";

interface Props {
  // define props here
}

export default function Component({}: Props) {
  const [count, setCount] = useState(0);

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount((c) => c + 1)}>
        Increment
      </button>
    </div>
  );
}
`,
    },
    {
        id: "express-api",
        label: "Express API",
        description: "Minimal REST endpoint",
        language: "javascript",
        filename: "server.js",
        initialContent:
`const express = require("express");
const app = express();

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/items", (req, res) => {
  res.json([]);
});

app.post("/api/items", (req, res) => {
  const item = req.body;
  res.status(201).json(item);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});
`,
    },
    {
        id: "leetcode",
        label: "LeetCode Problem",
        description: "Function stub + test harness",
        language: "python",
        filename: "solution.py",
        initialContent:
`from typing import List


class Solution:
    def solve(self, nums: List[int]) -> int:
        # write your solution here
        pass


if __name__ == "__main__":
    sol = Solution()
    print(sol.solve([1, 2, 3]))
`,
    },
    {
        id: "rust-cli",
        label: "Rust CLI",
        description: "Basic argument-parsing skeleton",
        language: "rust",
        filename: "main.rs",
        initialContent:
`use std::env;

fn main() {
    let args: Vec<String> = env::args().collect();

    if args.len() < 2 {
        eprintln!("Usage: {} <input>", args[0]);
        std::process::exit(1);
    }

    println!("Input: {}", args[1]);
}
`,
    },
    {
        id: "go-http",
        label: "Go HTTP Server",
        description: "net/http with one handler",
        language: "go",
        filename: "main.go",
        initialContent:
`package main

import (
	"fmt"
	"net/http"
)

func handler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintln(w, "Hello, world!")
}

func main() {
	http.HandleFunc("/", handler)
	fmt.Println("Listening on :8080")
	http.ListenAndServe(":8080", nil)
}
`,
    },
    {
        id: "html-page",
        label: "HTML Page",
        description: "Boilerplate document",
        language: "html",
        filename: "index.html",
        initialContent:
`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Document</title>
</head>
<body>
  <h1>Hello, world!</h1>
</body>
</html>
`,
    },
];

interface Props {
    roomId: string;
    onClose: () => void;
}

export default function SessionStartModal({ roomId, onClose }: Props) {
    const [template, setTemplate] = useState<Template>(TEMPLATES[0]);
    const [lang, setLang] = useState(
        LANGUAGES.find((l) => l.value === TEMPLATES[0].language) ?? LANGUAGES[0]
    );
    const [customFilename, setCustomFilename] = useState(TEMPLATES[0].filename);
    const [loading, setLoading] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    function pickTemplate(t: Template) {
        setTemplate(t);
        setCustomFilename(t.filename);
        const matchingLang = LANGUAGES.find((l) => l.value === t.language);
        if (matchingLang) setLang(matchingLang);
    }

    function pickLanguage(l: (typeof LANGUAGES)[number]) {
        setLang(l);
        setCustomFilename(l.file);
        setTemplate({
            id: "blank",
            label: "Blank file",
            description: "Start from an empty file",
            language: l.value,
            filename: l.file,
            initialContent: "",
        });
    }

    async function handleStart() {
        const filenameResult = validateSessionFilename(customFilename.trim() || lang.file);
        if (filenameResult.error) {
            toast.error(filenameResult.error);
            return;
        }

        setLoading(true);
        try {
            await apiFetch(`/api/rooms/${roomId}/session`, {
                method: "POST",
                body: JSON.stringify({
                    language: lang.value,
                    filename: filenameResult.name,
                    initialContent: template.initialContent,
                }),
            });

            onClose();
        } catch (error: any) {
            toast.error(error?.message ?? "Failed to start session");
        } finally {
            setLoading(false);
        }
    }

    if (!mounted) return null;

    const filenameValidation = validateSessionFilename(customFilename.trim() || lang.file);

    return createPortal(
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[8px] p-4"
        >
            <motion.div
                initial={{ scale: 0.96 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-6 w-full max-w-[480px] space-y-5 shadow-2xl max-h-[88vh] overflow-y-auto"
            >
                <div>
                    <h2 className="text-[28px] leading-tight font-[700] text-tx tracking-tight">
                        Start Code Session
                    </h2>
                    <p className="text-[14px] text-[#9fa0a7] mt-1.5">
                        Pick a template to start with boilerplate, or begin from a blank file.
                    </p>
                </div>

                <div className="space-y-1.5">
                    <p className="text-[11px] font-medium text-tx-muted flex items-center gap-1.5">
                        <LayoutTemplate className="w-3 h-3" />
                        Template
                    </p>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                        {TEMPLATES.map((t) => (
                            <button
                                key={t.id}
                                onClick={() => pickTemplate(t)}
                                className={cn(
                                    "relative text-left px-3 py-2.5 rounded-[14px] border transition-all focus-visible:ring-[3px] focus-visible:ring-[#a7c8b3]/[0.18] focus-visible:outline-none",
                                    template.id === t.id
                                        ? "bg-[#a7c8b3]/[0.12] border-[#a7c8b3]"
                                        : "bg-[#141416] border-white/[0.08] hover:bg-[#1b1b1f]"
                                )}
                            >
                                {template.id === t.id && (
                                    <Check className="w-3 h-3 text-[#a7c8b3] absolute top-2.5 right-2.5" />
                                )}
                                <p className={cn(
                                    "text-[12px] font-semibold pr-4",
                                    template.id === t.id ? "text-[#ddf4e5]" : "text-zinc-200"
                                )}>
                                    {t.label}
                                </p>
                                <p className="text-[10px] text-zinc-500 mt-0.5 leading-snug">
                                    {t.description}
                                </p>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-1.5">
                    <p className="text-[11px] font-medium text-tx-muted">
                        Starting language
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                        {LANGUAGES.map((l) => (
                            <button
                                key={l.value}
                                onClick={() => pickLanguage(l)}
                                className={cn(
                                    "flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-[14px] border transition-all font-medium focus-visible:ring-[3px] focus-visible:ring-[#a7c8b3]/[0.18] focus-visible:outline-none",
                                    lang.value === l.value
                                        ? "bg-[#a7c8b3]/[0.12] border-[#a7c8b3] text-[#ddf4e5]"
                                        : "bg-[#141416] border-white/[0.08] text-[#cfcfd3] hover:bg-[#1b1b1f]"
                                )}
                            >
                                <l.icon className="w-3.5 h-3.5" />
                                {l.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 bg-[#141416] border border-white/[0.08] rounded-xl p-3.5 mt-2">
                    <div>
                        <p className="text-[10px] font-medium text-tx-muted mb-2 uppercase tracking-wider">Workspace</p>
                        <div className="flex items-center gap-1.5 focus-within:ring-1 focus-within:ring-[#a7c8b3]/30 rounded-md bg-[#0a0a0a] px-2 py-1.5 border border-white/5 transition-all">
                            <FileText className="w-4 h-4 text-zinc-500 shrink-0" />
                            <input
                                type="text"
                                value={customFilename}
                                onChange={(e) => setCustomFilename(e.target.value)}
                                className="bg-transparent text-[12px] text-zinc-300 font-mono focus:outline-none w-full min-w-0"
                                spellCheck={false}
                            />
                        </div>
                        {filenameValidation.error && (
                            <p className="mt-1.5 text-[10px] text-rose-400">
                                {filenameValidation.error}
                            </p>
                        )}
                    </div>
                    <div>
                        <p className="text-[10px] font-medium text-tx-muted mb-2 uppercase tracking-wider">Language</p>
                        <div className="flex items-center gap-1.5">
                            <lang.icon className="w-3.5 h-3.5 text-[#a7c8b3]" />
                            <span className="text-[12px] text-zinc-300">{lang.label}</span>
                        </div>
                    </div>
                </div>

                {template.initialContent && (
                    <div>
                        <p className="text-[10px] font-medium text-tx-muted mb-1.5 uppercase tracking-wider">Preview</p>
                        <pre className="bg-[#0a0a0a] border border-white/5 rounded-xl p-3 text-[10.5px] leading-relaxed text-zinc-400 font-mono overflow-x-auto max-h-[120px] overflow-y-auto whitespace-pre">
                            {template.initialContent}
                        </pre>
                    </div>
                )}

                <div className="flex gap-2 pt-5 border-t border-white/5 mt-4">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2 rounded-lg text-xs font-medium text-tx-secondary hover:text-tx hover:bg-surface transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleStart}
                        disabled={loading || !!filenameValidation.error}
                        className="flex-1 py-2 rounded-lg text-xs font-medium bg-brand text-[#0a0a0a] hover:bg-[#8eb09a] disabled:opacity-50 transition-colors"
                    >
                        {loading ? "Starting…" : "Start"}
                    </button>
                </div>
            </motion.div>
        </motion.div>,
        document.body
    );
}
