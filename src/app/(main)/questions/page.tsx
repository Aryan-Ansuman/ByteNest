import { databases, users } from "@/models/server/config";
import { answerCollection, db, questionCollection, voteCollection } from "@/models/name";
import { UserPrefs } from "@/store/Auth";
import { Query } from "node-appwrite";
import QuestionsClient from "./QuestionsClient";
import type { Question } from "./QuestionsClient";

const FILTERS = ["Newest", "Active", "Most Voted", "Unanswered"] as const;
type QuestionFilter = (typeof FILTERS)[number];

const getFilter = (filter?: string): QuestionFilter =>
    FILTERS.includes(filter as QuestionFilter) ? (filter as QuestionFilter) : "Newest";

const Page = async ({
    searchParams,
}: {
    searchParams: { page?: string; tag?: string; search?: string; filter?: string };
}) => {
    const currentPage = Math.max(1, Number(searchParams.page ?? "1"));
    const limit = 20;
    const activeFilter = getFilter(searchParams.filter);
    const search = searchParams.search?.trim() ?? "";
    const tag = searchParams.tag?.trim() ?? "";

    const queries: string[] = [
        activeFilter === "Active" ? Query.orderDesc("$updatedAt") : Query.orderDesc("$createdAt"),
        Query.offset((currentPage - 1) * limit),
        Query.limit(limit),
    ];

    if (tag) queries.push(Query.contains("tags", [tag]));
    if (search) {
        queries.push(
            Query.or([
                Query.search("title", search),
                Query.search("content", search),
            ])
        );
    }

    const questions = await databases.listDocuments(db, questionCollection, queries);

    const enriched: Question[] = await Promise.all(
        questions.documents.map(async (ques) => {
            const [author, answers, latestAnswer, upvotes, downvotes] = await Promise.all([
                users.get<UserPrefs>(ques.authorId),
                databases.listDocuments(db, answerCollection, [
                    Query.equal("questionId", ques.$id),
                    Query.limit(1),
                ]),
                databases.listDocuments(db, answerCollection, [
                    Query.equal("questionId", ques.$id),
                    Query.orderDesc("$createdAt"),
                    Query.limit(1),
                ]),
                databases.listDocuments(db, voteCollection, [
                    Query.equal("type", "question"),
                    Query.equal("typeId", ques.$id),
                    Query.equal("voteStatus", "upvoted"),
                    Query.limit(1),
                ]),
                databases.listDocuments(db, voteCollection, [
                    Query.equal("type", "question"),
                    Query.equal("typeId", ques.$id),
                    Query.equal("voteStatus", "downvoted"),
                    Query.limit(1),
                ]),
            ]);

            const lastAnswerAt = latestAnswer.documents[0]?.$createdAt;
            const activityAt =
                lastAnswerAt && new Date(lastAnswerAt) > new Date(ques.$updatedAt)
                    ? lastAnswerAt
                    : ques.$updatedAt;

            return {
                $id: ques.$id,
                title: String(ques.title),
                content: String(ques.content),
                tags: ((ques.tags as string[]) ?? []).filter(Boolean),
                $createdAt: ques.$createdAt,
                $updatedAt: ques.$updatedAt,
                activityAt,
                totalAnswers: answers.total,
                totalVotes: upvotes.total - downvotes.total,
                totalViews: Number(ques.views ?? ques.totalViews ?? 0),
                author: {
                    $id: author.$id,
                    name: author.name,
                    reputation: Number(author.prefs.reputation ?? 0),
                },
            };
        })
    );

    const sortedQuestions = [...enriched].sort((a, b) => {
        if (activeFilter === "Most Voted") return b.totalVotes - a.totalVotes;
        if (activeFilter === "Unanswered") return a.totalAnswers - b.totalAnswers;
        if (activeFilter === "Active") {
            return new Date(b.activityAt).getTime() - new Date(a.activityAt).getTime();
        }
        return new Date(b.$createdAt).getTime() - new Date(a.$createdAt).getTime();
    });

    const displayedQuestions =
        activeFilter === "Unanswered"
            ? sortedQuestions.filter((question) => question.totalAnswers === 0)
            : sortedQuestions;



    return (
        <QuestionsClient
            questions={displayedQuestions}
            total={questions.total}
            currentPage={currentPage}
            limit={limit}
            initialSearch={search}
            initialTag={tag}
            initialFilter={activeFilter}
        />
    );
};

export default Page;
