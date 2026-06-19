"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle } from "lucide-react";

interface Props {
    children?: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                this.props.fallback || (
                    <div className="flex w-full items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 p-6 text-center text-red-400">
                        <div className="flex flex-col items-center gap-2">
                            <AlertCircle className="size-6" />
                            <h3 className="font-semibold">Something went wrong</h3>
                            <p className="text-sm opacity-80">
                                {this.state.error?.message || "Failed to load content."}
                            </p>
                            <button
                                className="mt-2 text-sm font-medium hover:underline"
                                onClick={() => this.setState({ hasError: false })}
                            >
                                Try again
                            </button>
                        </div>
                    </div>
                )
            );
        }

        return this.props.children;
    }
}
