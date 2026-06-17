// src/app/page.tsx
import { databases, users } from "@/models/server/config";
import { answerCollection, db, voteCollection, questionCollection } from "@/models/name";
import { Query } from "node-appwrite";
import { UserPrefs } from "@/store/Auth";
import HomeClient from "./HomeClient";

const Page = async ({
    searchParams,
}: {
    searchParams: { filter?: string };
}) => {
    const filter = searchParams.filter || "Newest";
    const limit = 10;

    // Build query based on filter
    const queries: any[] = [Query.limit(limit)];

    if (filter === "Newest" || filter === "Unanswered") {
        queries.push(Query.orderDesc("$createdAt"));
    } else if (filter === "Trending") {
        queries.push(Query.orderDesc("$createdAt")); // We'll sort by votes client-side
    }

    const questions = await databases.listDocuments(db, questionCollection, queries);

    const enriched = await Promise.all(
        questions.documents.map(async (q) => {
            const [author, answers, upvotes, downvotes] = await Promise.all([
                users.get<UserPrefs>(q.authorId),
                databases.listDocuments(db, answerCollection, [
                    Query.equal("questionId", q.$id),
                    Query.limit(1),
                ]),
                databases.listDocuments(db, voteCollection, [
                    Query.equal("type", "question"),
                    Query.equal("typeId", q.$id),
                    Query.equal("voteStatus", "upvoted"),
                    Query.limit(1),
                ]),
                databases.listDocuments(db, voteCollection, [
                    Query.equal("type", "question"),
                    Query.equal("typeId", q.$id),
                    Query.equal("voteStatus", "downvoted"),
                    Query.limit(1),
                ]),
            ]);

            return {
                $id: q.$id,
                title: q.title as string,
                content: q.content as string,
                tags: (q.tags as string[]) ?? [],
                $createdAt: q.$createdAt,
                totalAnswers: answers.total,
                totalVotes: upvotes.total - downvotes.total,
                author: {
                    $id: author.$id,
                    name: author.name,
                    reputation: author.prefs?.reputation ?? 0,
                },
            };
        })
    );

    // Fetch stats for hero section
    const [totalQuestions, totalAnswers] = await Promise.all([
        databases.listDocuments(db, questionCollection, [Query.limit(1)]),
        databases.listDocuments(db, answerCollection, [Query.limit(1)]),
    ]);

    return (
        <HomeClient
            questions={enriched}
            totalQuestions={totalQuestions.total}
            totalAnswers={totalAnswers.total}
            initialFilter={filter}
        />
    );
};

export default Page;
