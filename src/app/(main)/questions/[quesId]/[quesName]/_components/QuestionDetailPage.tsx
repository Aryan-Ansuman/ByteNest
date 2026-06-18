"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { Models } from "appwrite";
import { useAuthStore } from "@/store/Auth";
import { QuestionDetailProvider } from "./QuestionDetailContext";
import QuestionHero from "./QuestionHero";
import QuestionSidebar from "./QuestionSidebar";
import ContentTabs from "./ContentTabs";

interface Props {
    question: Models.Document;
    author: Models.User<any>;
    answers: any;
    upvotes: any;
    downvotes: any;
    comments: any;
    attachmentUrl: string;
    similarQuestions?: any[];
}

export default function QuestionDetailPage({
    question,
    author,
    answers,
    upvotes,
    downvotes,
    comments,
    attachmentUrl,
    similarQuestions,
}: Props) {
    const { user } = useAuthStore();

    const breadcrumbLabel = question.tags && question.tags[0] 
        ? question.tags[0].charAt(0).toUpperCase() + question.tags[0].slice(1)
        : "Uncategorized";

    return (
        <QuestionDetailProvider
            question={question as any}
            author={author as any}
            currentUser={user as any}
            answers={answers}
            upvotes={upvotes}
            downvotes={downvotes}
            comments={comments}
            attachmentUrl={attachmentUrl}
            similarQuestions={similarQuestions}
        >
            <div className="relative mx-auto w-full max-w-[1420px] pb-20">
                {/* Ambient glow */}
                <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[500px] bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(207,232,213,0.08),transparent)]" />

                {/* Breadcrumbs */}
                <div className="mb-7 flex items-center gap-2 text-sm text-zinc-500">
                    <Link href="/questions" className="transition-colors hover:text-zinc-200">
                        All Questions
                    </Link>
                    <ChevronRight className="size-3.5" />
                    <Link href={`/questions?tag=${encodeURIComponent(breadcrumbLabel.toLowerCase())}`} className="transition-colors hover:text-zinc-200">
                        {breadcrumbLabel}
                    </Link>
                    <ChevronRight className="size-3.5" />
                    <span className="truncate text-zinc-400">{question.title}</span>
                </div>

                {/* Two-column grid */}
                <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
                    <main className="min-w-0 space-y-5">
                        <QuestionHero />
                        <ContentTabs />
                    </main>

                    <QuestionSidebar />
                </div>
            </div>
        </QuestionDetailProvider>
    );
}
