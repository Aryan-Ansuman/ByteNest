import { Client, Databases, IndexType, Query } from "node-appwrite";

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_HOST_URL;
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

if (!endpoint || !projectId || !apiKey) {
    throw new Error("Missing Appwrite environment variables; check .env");
}

const databaseId = "6a2bbffd00190eccf0b8";
const questionCollection = "questions";
const answerCollection = "answers";
const databases = new Databases(
    new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
);

async function ensureAttribute(key, create) {
    try {
        await databases.getAttribute(databaseId, questionCollection, key);
    } catch (error) {
        if (error?.code !== 404) throw error;
        await create();
    }

    for (let attempt = 0; attempt < 120; attempt++) {
        const attribute = await databases.getAttribute(databaseId, questionCollection, key);
        if (attribute.status === "available") return;
        if (attribute.status === "failed") throw new Error(`Attribute ${key} failed to initialize`);
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Timed out waiting for attribute ${key}`);
}

async function ensureIndex(key, type, attributes) {
    try {
        await databases.getIndex(databaseId, questionCollection, key);
        return;
    } catch (error) {
        if (error?.code !== 404) throw error;
    }
    await databases.createIndex(databaseId, questionCollection, key, type, attributes);
}

async function listAll(collectionId, queries = []) {
    const documents = [];
    let cursor;
    for (;;) {
        const page = await databases.listDocuments(databaseId, collectionId, [
            ...queries,
            Query.limit(100),
            ...(cursor ? [Query.cursorAfter(cursor)] : []),
        ]);
        documents.push(...page.documents);
        if (page.documents.length < 100 || documents.length >= page.total) return documents;
        cursor = page.documents.at(-1).$id;
    }
}

await ensureAttribute("totalAnswers", () =>
    databases.createIntegerAttribute(
        databaseId,
        questionCollection,
        "totalAnswers",
        false,
        0,
        undefined,
        0
    )
);
await ensureAttribute("activityAt", () =>
    databases.createDatetimeAttribute(databaseId, questionCollection, "activityAt", false)
);

const [questions, answers] = await Promise.all([
    listAll(questionCollection),
    listAll(answerCollection),
]);
const metadata = new Map();

for (const answer of answers) {
    const current = metadata.get(answer.questionId) ?? { count: 0, latestAt: undefined };
    current.count += 1;
    if (!current.latestAt || new Date(answer.$createdAt) > new Date(current.latestAt)) {
        current.latestAt = answer.$createdAt;
    }
    metadata.set(answer.questionId, current);
}

for (let index = 0; index < questions.length; index += 10) {
    await Promise.all(
        questions.slice(index, index + 10).map((question) => {
            const answerMetadata = metadata.get(question.$id);
            const existingActivityAt =
                typeof question.activityAt === "string" && question.activityAt
                    ? question.activityAt
                    : undefined;
            const activityAt =
                existingActivityAt ??
                [question.$updatedAt, answerMetadata?.latestAt]
                    .filter(Boolean)
                    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
            const totalAnswers = answerMetadata?.count ?? 0;

            if (
                Number(question.totalAnswers ?? 0) === totalAnswers &&
                existingActivityAt === activityAt
            ) {
                return Promise.resolve();
            }
            return databases.updateDocument(databaseId, questionCollection, question.$id, {
                totalAnswers,
                activityAt,
            });
        })
    );
}

await Promise.all([
    ensureIndex("title_fulltext", IndexType.Fulltext, ["title"]),
    ensureIndex("content_fulltext", IndexType.Fulltext, ["content"]),
    ensureIndex("votes_sort", IndexType.Key, ["totalVotes"]),
    ensureIndex("answers_filter", IndexType.Key, ["totalAnswers"]),
    ensureIndex("activity_sort", IndexType.Key, ["activityAt"]),
]);

console.log(`Backfilled ${questions.length} questions from ${answers.length} answers.`);
