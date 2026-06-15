import { databases, users } from "@/models/server/config";
import { answerCollection, db, voteCollection, questionCollection } from "@/models/name";
import { Query } from "node-appwrite";
import React from "react";
import Link from "next/link";
import { UserPrefs } from "@/store/Auth";
import slugify from "@/utils/slugify";
import convertDateToRelativeTime from "@/utils/relativeTime";
import QuestionsClient from "./QuestionsClient";

const Page = async ({
    searchParams,
}: {
    searchParams: { page?: string; tag?: string; search?: string; filter?: string };
}) => {
    searchParams.page ||= "1";
    const currentPage = Number(searchParams.page);
    const limit = 20;

    const queries: any[] = [
        Query.orderDesc("$createdAt"),
        Query.offset((currentPage - 1) * limit),
        Query.limit(limit),
    ];

    if (searchParams.tag) queries.push(Query.equal("tags", searchParams.tag));
    if (searchParams.search)
        queries.push(
            Query.or([
                Query.search("title", searchParams.search),
                Query.search("content", searchParams.search),
            ])
        );

    const questions = await databases.listDocuments(db, questionCollection, queries);

    const enriched = await Promise.all(
        questions.documents.map(async (ques) => {
            const [author, answers, votes] = await Promise.all([
                users.get<UserPrefs>(ques.authorId),
                databases.listDocuments(db, answerCollection, [
                    Query.equal("questionId", ques.$id),
                    Query.limit(1),
                ]),
                databases.listDocuments(db, voteCollection, [
                    Query.equal("type", "question"),
                    Query.equal("typeId", ques.$id),
                    Query.limit(1),
                ]),
            ]);

            return {
                $id: ques.$id,
                title: ques.title,
                content: ques.content,
                tags: ques.tags as string[],
                $createdAt: ques.$createdAt,
                totalAnswers: answers.total,
                totalVotes: votes.total,
                author: {
                    $id: author.$id,
                    name: author.name,
                    reputation: author.prefs.reputation,
                },
            };
        })
    );

    return (
        <QuestionsClient
            questions={enriched}
            total={questions.total}
            currentPage={currentPage}
            limit={limit}
            initialSearch={searchParams.search || ""}
            initialTag={searchParams.tag || ""}
            initialFilter={searchParams.filter || "Newest"}
        />
    );
};

export default Page;
