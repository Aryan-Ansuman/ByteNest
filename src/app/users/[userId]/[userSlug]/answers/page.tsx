import { answerCollection, db, questionCollection, voteCollection } from "@/models/name";
import { databases, users } from "@/models/server/config";
import { UserPrefs } from "@/store/Auth";
import { Query } from "node-appwrite";
import React from "react";
import AnswersClient, { AnswerItem } from "./AnswersClient";

const Page = async ({
    params,
    searchParams,
}: {
    params: { userId: string; userSlug: string };
    searchParams: { page?: string };
}) => {
    const limit = 25;
    const currentPage = Math.max(1, Number(searchParams.page ?? "1"));

    // 1. Fetch the user to get their display name
    const user = await users.get<UserPrefs>(params.userId);

    // 2. Fetch paginated answers for this user
    const answers = await databases.listDocuments(db, answerCollection, [
        Query.equal("authorId", params.userId),
        Query.orderDesc("$createdAt"),
        Query.offset((currentPage - 1) * limit),
        Query.limit(limit),
    ]);

    // 3. Enrich each answer with question info + vote count
    const enriched: AnswerItem[] = await Promise.all(
        answers.documents.map(async (ans) => {
            const [question, votes] = await Promise.all([
                databases.getDocument(db, questionCollection, ans.questionId as string),
                databases.listDocuments(db, voteCollection, [
                    Query.equal("type", "answer"),
                    Query.equal("typeId", ans.$id),
                    Query.limit(1),
                ]),
            ]);

            // Net votes: count upvotes minus downvotes properly
            const [upvotes, downvotes] = await Promise.all([
                databases.listDocuments(db, voteCollection, [
                    Query.equal("type", "answer"),
                    Query.equal("typeId", ans.$id),
                    Query.equal("voteStatus", "upvoted"),
                    Query.limit(1),
                ]),
                databases.listDocuments(db, voteCollection, [
                    Query.equal("type", "answer"),
                    Query.equal("typeId", ans.$id),
                    Query.equal("voteStatus", "downvoted"),
                    Query.limit(1),
                ]),
            ]);

            return {
                $id: ans.$id,
                content: ans.content as string,
                $createdAt: ans.$createdAt,
                authorId: ans.authorId as string,
                questionId: ans.questionId as string,
                questionTitle: question.title as string,
                questionTags: (question.tags as string[]) ?? [],
                totalVotes: upvotes.total - downvotes.total,
                voteStatus: null, // server-side render; client would check against current user
            };
        })
    );

    return (
        <AnswersClient
            answers={enriched}
            total={answers.total}
            currentPage={currentPage}
            limit={limit}
            profileName={user.name}
            userId={params.userId}
            userSlug={params.userSlug}
        />
    );
};

export default Page;
