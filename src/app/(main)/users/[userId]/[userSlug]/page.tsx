import { databases, users } from "@/models/server/config";
import { UserPrefs } from "@/store/Auth";
import {
    answerCollection,
    db,
    questionCollection,
    voteCollection,
    commentCollection,
    adrScoreSubmissionsCollection,
} from "@/models/name";
import { Query } from "node-appwrite";
import React from "react";
import UserProfileClient from "./UserProfileClient";
import { getSocraticSessionSummary } from "@/lib/socratic/sessionHistory";

const Page = async ({ params }: { params: { userId: string; userSlug: string } }) => {
    const [user, questions, answers, votes, comments, adrSubmissions, socraticSessions] = await Promise.all([
        users.get<UserPrefs>(params.userId),
        databases.listDocuments(db, questionCollection, [
            Query.equal("authorId", params.userId),
            Query.orderDesc("$createdAt"),
            Query.limit(10),
        ]),
        databases.listDocuments(db, answerCollection, [
            Query.equal("authorId", params.userId),
            Query.orderDesc("$createdAt"),
            Query.limit(10),
        ]),
        databases.listDocuments(db, voteCollection, [
            Query.equal("votedById", params.userId),
            Query.orderDesc("$createdAt"),
            Query.limit(10),
        ]),
        databases.listDocuments(db, commentCollection, [
            Query.equal("authorId", params.userId),
            Query.orderDesc("$createdAt"),
            Query.limit(10),
        ]),
        databases.listDocuments(db, adrScoreSubmissionsCollection, [
            Query.equal("userId", params.userId),
            Query.orderDesc("$createdAt"),
            Query.limit(6),
        ]),
        getSocraticSessionSummary(params.userId).catch(() => null),
    ]);

    // Enrich questions with vote + answer counts
    const enrichedQuestions = await Promise.all(
        questions.documents.map(async (q) => {
            const qAnswers = await databases.listDocuments(db, answerCollection, [
                Query.equal("questionId", q.$id),
                Query.limit(1),
            ]);
            return {
                $id: q.$id,
                title: q.title as string,
                tags: q.tags as string[],
                $createdAt: q.$createdAt,
                totalVotes: Number(q.totalVotes ?? 0),
                totalAnswers: qAnswers.total,
            };
        })
    );

    // Enrich answers with question title
    const enrichedAnswers = await Promise.all(
        answers.documents.map(async (a) => {
            const question = await databases.getDocument(db, questionCollection, a.questionId as string, [
                Query.select(["title"]),
            ]);
            return {
                $id: a.$id,
                content: a.content as string,
                $createdAt: a.$createdAt,
                questionId: a.questionId as string,
                questionTitle: question.title as string,
                totalVotes: Number(a.totalVotes ?? 0),
            };
        })
    );

    // Enrich votes with linked question title
    const enrichedVotes = await Promise.all(
        votes.documents.map(async (v) => {
            try {
                if (v.type === "question") {
                    const q = await databases.getDocument(db, questionCollection, v.typeId as string, [
                        Query.select(["title"]),
                    ]);
                    return {
                        $id: v.$id,
                        voteStatus: v.voteStatus as string,
                        type: v.type as string,
                        typeId: v.typeId as string,
                        $createdAt: v.$createdAt,
                        questionId: v.typeId as string,
                        questionTitle: q.title as string,
                    };
                } else {
                    const a = await databases.getDocument(db, answerCollection, v.typeId as string);
                    const q = await databases.getDocument(
                        db,
                        questionCollection,
                        a.questionId as string,
                        [Query.select(["title"])]
                    );
                    return {
                        $id: v.$id,
                        voteStatus: v.voteStatus as string,
                        type: v.type as string,
                        typeId: v.typeId as string,
                        $createdAt: v.$createdAt,
                        questionId: a.questionId as string,
                        questionTitle: q.title as string,
                    };
                }
            } catch {
                return null;
            }
        })
    );

    // Enrich ADR score submissions with the comparison's question context
    const enrichedAdrSubmissions = await Promise.all(
        adrSubmissions.documents.map(async (s) => {
            try {
                const q = await databases.getDocument(db, questionCollection, s.questionId as string, [
                    Query.select(["title"]),
                ]);
                const adrMetaList = await databases.listDocuments(db, "adr_question_metadata", [
                    Query.equal("questionId", s.questionId as string),
                    Query.limit(1)
                ]);
                const adrMeta = adrMetaList.documents[0];
                
                return {
                    $id: s.$id,
                    questionId: s.questionId as string,
                    questionTitle: q.title as string,
                    optionA: adrMeta ? (adrMeta.optionA as string) : null,
                    optionB: adrMeta ? (adrMeta.optionB as string) : null,
                    submittedAt: (s.submittedAt as string | undefined) ?? s.$createdAt,
                };
            } catch {
                return null;
            }
        })
    );

    const profileData = {
        userId: params.userId,
        userSlug: params.userSlug,
        name: user.name,
        email: user.email,
        reputation: user.prefs?.reputation ?? 0,
        createdAt: user.$createdAt,
        updatedAt: user.$updatedAt,
        totalQuestions: questions.total,
        totalAnswers: answers.total,
        totalVotes: votes.total,
        totalAdrContributions: adrSubmissions.total,
        questions: enrichedQuestions,
        answers: enrichedAnswers,
        votes: enrichedVotes.filter(Boolean) as any[],
        adrContributions: enrichedAdrSubmissions.filter(Boolean) as any[],
        socraticSessions,
    };

    return <UserProfileClient profile={profileData} />;
};

export default Page;
