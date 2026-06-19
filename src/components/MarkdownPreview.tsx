"use client";

import dynamic from "next/dynamic";
import "@uiw/react-md-editor/markdown-editor.css";

const MarkdownPreview = dynamic(
    () => import("@uiw/react-md-editor").then((m) => m.default.Markdown),
    { ssr: false }
);

export default MarkdownPreview;
