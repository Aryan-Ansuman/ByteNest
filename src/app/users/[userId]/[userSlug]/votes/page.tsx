import { answerCollection, db, questionCollection, voteCollection } from "@/models/name";
import { databases, users } from "@/models/server/config";
import { UserPrefs } from "@/store/Auth";
import { Query } from "node-appwrite";
import React from "react";
import VotesClient, { VoteItem } from "./VotesClient";

const Page = async ({
    params,
    searchParams,
}: {
    params: { userId: string; userSlug: string };
    searchParams: { page?: string; voteStatus?: "upvoted" | "downvoted" };
}) => {
    const limit = 25;
    const currentPage = Math.max(1, Number(searchParams.page ?? "1"));

    // 1. Fetch the user for display name
    const profileUser = await users.get<UserPrefs>(params.userId);

    // 2. Build the query — optionally filtered by vote status server-side
    const query: any[] = [
        Query.equal("votedById", params.userId),
        Query.orderDesc("$createdAt"),
        Query.offset((currentPage - 1) * limit),
        Query.limit(limit),
    ];

    if (searchParams.voteStatus) {
        query.push(Query.equal("voteStatus", searchParams.voteStatus));
    }

    const votes = await databases.listDocuments(db, voteCollection, query);

    // 3. Also fetch unfiltered totals for the stat cards (up/down counts), cheaply via limit(1)
    const [allTotal, upvotedTotal, downvotedTotal] = await Promise.all([
        databases.listDocuments(db, voteCollection, [
            Query.equal("votedById", params.userId),
            Query.limit(1),
        ]),
        databases.listDocuments(db, voteCollection, [
            Query.equal("votedById", params.userId),
            Query.equal("voteStatus", "upvoted"),
            Query.limit(1),
        ]),
        databases.listDocuments(db, voteCollection, [
            Query.equal("votedById", params.userId),
            Query.equal("voteStatus", "downvoted"),
            Query.limit(1),
        ]),
    ]);

    // 4. Enrich each vote with the linked question/answer info
    const enriched: (VoteItem | null)[] = await Promise.all(
        votes.documents.map(async (vote) => {
            try {
                if (vote.type === "question") {
                    const question = await databases.getDocument(
                        db,
                        questionCollection,
                        vote.typeId as string,
                        [Query.select(["title", "tags"])]
                    );
                    return {
                        $id: vote.$id,
                        voteStatus: vote.voteStatus as "upvoted" | "downvoted",
                        type: "question" as const,
                        typeId: vote.typeId as string,
                        $createdAt: vote.$createdAt,
                        questionId: vote.typeId as string,
                        questionTitle: question.title as string,
                        questionTags: (question.tags as string[]) ?? [],
                    };
                }

                // vote.type === "answer"
                const answer = await databases.getDocument(
                    db,
                    answerCollection,
                    vote.typeId as string
                );
                const question = await databases.getDocument(
                    db,
                    questionCollection,
                    answer.questionId as string,
                    [Query.select(["title", "tags"])]
                );
                return {
                    $id: vote.$id,
                    voteStatus: vote.voteStatus as "upvoted" | "downvoted",
                    type: "answer" as const,
                    typeId: vote.typeId as string,
                    $createdAt: vote.$createdAt,
                    questionId: answer.questionId as string,
                    questionTitle: question.title as string,
                    questionTags: (question.tags as string[]) ?? [],
                };
            } catch {
                // The underlying question/answer may have been deleted since the vote was cast
                return null;
            }
        })
    );

    return (
        <VotesClient
            votes={enriched.filter(Boolean) as VoteItem[]}
            total={votes.total}
            allTotal={allTotal.total}
            upvotedTotal={upvotedTotal.total}
            downvotedTotal={downvotedTotal.total}
            currentPage={currentPage}
            limit={limit}
            activeVoteStatus={searchParams.voteStatus}
            profileName={profileUser.name}
            userId={params.userId}
            userSlug={params.userSlug}
        />
    );
};

export default Page;
