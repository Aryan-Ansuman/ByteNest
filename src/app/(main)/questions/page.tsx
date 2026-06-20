import { databases } from "@/models/server/config";
import { answerCollection, db, questionCollection } from "@/models/name";
import { Query } from "node-appwrite";
import QuestionsClient from "./QuestionsClient";
import type { Question } from "./QuestionsClient";
import { deletedAuthor, getAuthorsById } from "@/lib/authors";
export const dynamic = "force-dynamic";

const FILTERS = ["Newest", "Active", "Most Voted", "Unanswered"] as const;
type QuestionFilter = (typeof FILTERS)[number];

type QuestionsSearchParams = {
    page?: string;
    cursor?: string;
    direction?: string;
    tag?: string | string[];
    search?: string;
    filter?: string;
};

const getFilter = (filter?: string): QuestionFilter =>
    FILTERS.includes(filter as QuestionFilter) ? (filter as QuestionFilter) : "Newest";

const getTags = (tag?: string | string[]) =>
    Array.from(
        new Set((Array.isArray(tag) ? tag : tag ? [tag] : []).map((value) => value.trim()).filter(Boolean))
    ).slice(0, 5);

export default async function Page({ searchParams }: { searchParams: QuestionsSearchParams }) {
    const limit = 20;
    const activeFilter = getFilter(searchParams.filter);
    const search = searchParams.search?.trim() ?? "";
    const tags = getTags(searchParams.tag);
    const cursor = searchParams.cursor?.trim();
    const direction = searchParams.direction === "before" ? "before" : "after";
    const requestedPage = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);
    const currentPage = cursor ? requestedPage : 1;

    const queries: string[] = [Query.limit(limit)];

    if (activeFilter === "Most Voted") queries.push(Query.orderDesc("totalVotes"));
    else if (activeFilter === "Active") queries.push(Query.orderDesc("activityAt"));
    else queries.push(Query.orderDesc("$createdAt"));

    if (activeFilter === "Unanswered") queries.push(Query.equal("totalAnswers", 0));
    // Separate contains clauses are ANDed by Appwrite. Passing the whole array
    // to one contains query matches any tag, which is not a true multi-tag filter.
    tags.forEach((tag) => queries.push(Query.contains("tags", tag)));
    if (search) {
        queries.push(
            Query.or([Query.search("title", search), Query.search("content", search)])
        );
    }
    if (cursor) {
        queries.push(direction === "before" ? Query.cursorBefore(cursor) : Query.cursorAfter(cursor));
    }

    const questions = await databases.listDocuments(db, questionCollection, queries);
    const questionIds = questions.documents.map((question) => question.$id);

    const [authorById] = await Promise.all([
        getAuthorsById(questions.documents.map((question) => question.authorId as string)),
    ]);

    const enriched: Question[] = questions.documents.map((question) => {
        const author = authorById.get(question.authorId as string) ?? deletedAuthor;
        
        return {
            $id: question.$id,
            title: String(question.title),
            content: String(question.content),
            tags: ((question.tags as string[]) ?? []).filter(Boolean),
            $createdAt: question.$createdAt,
            $updatedAt: question.$updatedAt,
            activityAt: String(question.activityAt || question.$updatedAt),
            totalAnswers: Number(question.totalAnswers ?? 0),
            totalVotes: Number(question.totalVotes ?? 0),
            totalViews: Number(question.views ?? question.totalViews ?? 0),
            hasAcceptedAnswer: Boolean(question.acceptedAnswerId),
            author,
        };
    });

    const firstQuestionId = enriched[0]?.$id;
    const lastQuestionId = enriched[enriched.length - 1]?.$id;
    const rangeStart = questions.total === 0 ? 0 : (currentPage - 1) * limit + 1;
    const rangeEnd = Math.min(rangeStart + enriched.length - 1, questions.total);

    return (
        <QuestionsClient
            questions={enriched}
            total={questions.total}
            currentPage={currentPage}
            rangeStart={rangeStart}
            rangeEnd={Math.max(0, rangeEnd)}
            previousCursor={currentPage > 1 ? firstQuestionId : undefined}
            nextCursor={rangeEnd < questions.total ? lastQuestionId : undefined}
        />
    );
}
