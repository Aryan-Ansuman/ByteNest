import { answerCollection, db, questionCollection, voteCollection } from "@/models/name";
import { databases, users } from "@/models/server/config";
import { UserPrefs } from "@/store/Auth";
import { Query } from "node-appwrite";
import React from "react";
import QuestionsClient, { QuestionItem } from "./QuestionsClient";

const Page = async ({
    params,
    searchParams,
}: {
    params: { userId: string; userSlug: string };
    searchParams: { page?: string };
}) => {
    const limit = 20;
    const currentPage = Math.max(1, Number(searchParams.page ?? "1"));

    // 1. Fetch the user for display name
    const user = await users.get<UserPrefs>(params.userId);

    // 2. Fetch paginated questions by this user
    const questions = await databases.listDocuments(db, questionCollection, [
        Query.equal("authorId", params.userId),
        Query.orderDesc("$createdAt"),
        Query.offset((currentPage - 1) * limit),
        Query.limit(limit),
    ]);

    // 3. Enrich each question with answer count and net vote count
    const enriched: QuestionItem[] = await Promise.all(
        questions.documents.map(async (q) => {
            const [upvotes, downvotes, answers] = await Promise.all([
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
                databases.listDocuments(db, answerCollection, [
                    Query.equal("questionId", q.$id),
                    Query.limit(1),
                ]),
            ]);

            return {
                $id: q.$id,
                title: q.title as string,
                content: q.content as string,
                tags: (q.tags as string[]) ?? [],
                $createdAt: q.$createdAt,
                $updatedAt: q.$updatedAt,
                authorId: q.authorId as string,
                totalVotes: upvotes.total - downvotes.total,
                totalAnswers: answers.total,
                hasAcceptedAnswer: false,
            };
        })
    );

    return (
        <QuestionsClient
            questions={enriched}
            total={questions.total}
            currentPage={currentPage}
            limit={limit}
            profileName={user.name}
            userId={params.userId}
            userSlug={params.userSlug}
        />
    );
};

export default Page;
