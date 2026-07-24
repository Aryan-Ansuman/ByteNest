import { databases } from "@/models/server/config";
import { answerCollection, db, questionCollection } from "@/models/name";
import { Query } from "node-appwrite";
import QuestionsClient from "./QuestionsClient";
import type { Question } from "./QuestionsClient";
import { deletedAuthor, getAuthorsById } from "@/lib/authors";
import { getTopSystemTags } from "@/lib/smells/top-tags-cache";
export const dynamic = "force-dynamic";

const FILTERS = ["Newest", "Active", "Most Voted", "Unanswered", "PR Questions"] as const;
type QuestionFilter = (typeof FILTERS)[number];

type QuestionsSearchParams = {
    page?: string;
    cursor?: string;
    direction?: string;
    tag?: string | string[];
    systemTag?: string;
    search?: string;
    filter?: string;
    adr?: string;
    adrStatus?: string;
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
    const systemTag = searchParams.systemTag?.trim() || undefined;

    const adrOnly = searchParams.adr === "true";
    const activeAdrStatus =
        searchParams.adrStatus === "open" || searchParams.adrStatus === "concluded"
            ? (searchParams.adrStatus as "open" | "concluded")
            : undefined;

    const queries: string[] = [Query.limit(limit)];

    if (activeFilter === "Most Voted") queries.push(Query.orderDesc("totalVotes"));
    else if (activeFilter === "Active") queries.push(Query.orderDesc("activityAt"));
    else queries.push(Query.orderDesc("$createdAt"));

    if (activeFilter === "Unanswered") queries.push(Query.equal("totalAnswers", 0));
    // Uses the `isPr` boolean index added in Phase 4 Pivot
    if (activeFilter === "PR Questions") queries.push(Query.equal("isPr", true));
    // Separate contains clauses are ANDed by Appwrite. Passing the whole array
    // to one contains query matches any tag, which is not a true multi-tag filter.
    tags.forEach((tag) => queries.push(Query.contains("tags", tag)));
    if (systemTag) queries.push(Query.contains("systemTags", systemTag));
    if (adrOnly) {
        queries.push(Query.equal("isAdr", true));
    }
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

    // Fetch authors, system tags, and sidecar PR/ADR metadata for the current page
    const [authorById, topSystemTags, prMetadataList, adrMetadataList] = await Promise.all([
        getAuthorsById(questions.documents.map((question) => question.authorId as string)),
        getTopSystemTags(),
        questionIds.length > 0 
            ? databases.listDocuments(db, "pr_question_metadata", [
                Query.equal("questionId", questionIds),
                Query.limit(questionIds.length)
              ]).catch(() => ({ documents: [] }))
            : Promise.resolve({ documents: [] }),
        questionIds.length > 0 
            ? databases.listDocuments(db, "adr_question_metadata", [
                Query.equal("questionId", questionIds),
                Query.limit(questionIds.length)
              ]).catch(() => ({ documents: [] }))
            : Promise.resolve({ documents: [] })
    ]);

    const prMetaByQuestionId = new Map(
        prMetadataList.documents.map((meta) => [meta.questionId as string, meta])
    );
    const adrMetaByQuestionId = new Map(
        adrMetadataList.documents.map((meta) => [meta.questionId as string, meta])
    );

    const enriched: Question[] = questions.documents.map((question) => {
        const author = authorById.get(question.authorId as string) ?? deletedAuthor;
        const prMeta = prMetaByQuestionId.get(question.$id);
        const adrMeta = adrMetaByQuestionId.get(question.$id);
        
        // Use the sidecar metadata to filter adrStatus in memory since we can't query it on the main collection
        // Not ideal for pagination if there are many ADRs with different statuses, but works given the architecture constraints.
        
        return {
            $id: question.$id,
            title: String(question.title),
            content: String(question.content),
            tags: ((question.tags as string[]) ?? []).filter(Boolean),
            systemTags: ((question.systemTags as string[]) ?? []).filter(Boolean),
            $createdAt: question.$createdAt,
            $updatedAt: question.$updatedAt,
            activityAt: String(question.activityAt || question.$updatedAt),
            totalAnswers: Number(question.totalAnswers ?? 0),
            totalVotes: Number(question.totalVotes ?? 0),
            totalViews: Number(question.views ?? question.totalViews ?? 0),
            hasAcceptedAnswer: Boolean(question.acceptedAnswerId),
            answerFreshnessIndicator:
                (question.answerFreshnessIndicator as "fresh" | "outdated" | "none" | undefined) ?? "none",
            questionType: (question.isAdr ? "adr" : question.isPr ? "pr_linked" : "standard") as "adr" | "pr_linked" | "standard",
            prStatus: prMeta ? (prMeta.prStatus as "open" | "merged" | "closed") : undefined,
            optionA: adrMeta ? (adrMeta.optionA as string) : null,
            optionB: adrMeta ? (adrMeta.optionB as string) : null,
            adrStatus: adrMeta ? (adrMeta.adrStatus as "open" | "concluded") : null,
            adrSubmissionCount: adrMeta ? Number(adrMeta.adrSubmissionCount ?? 0) : null,
            author,
        };
    }).filter(q => {
        // In-memory filter for activeAdrStatus since we fetch from questionCollection where it doesn't exist
        if (adrOnly && activeAdrStatus && q.questionType === "adr") {
            return q.adrStatus === activeAdrStatus;
        }
        return true;
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
            topSystemTags={topSystemTags}
            activeSystemTag={systemTag}
            prOnly={activeFilter === "PR Questions"}
            adrOnly={adrOnly}
            activeAdrStatus={activeAdrStatus}
        />
    );
}
