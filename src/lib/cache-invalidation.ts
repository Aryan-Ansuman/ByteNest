import { revalidatePath } from "next/cache";
import { db, questionCollection } from "@/models/name";
import { databases } from "@/models/server/config";
import slugify from "@/utils/slugify";

const QUESTION_DETAIL_ROUTE = "/questions/[quesId]/[quesName]";

export async function revalidateQuestionCaches(
    questionId?: string | null,
    knownTitles: Array<string | null | undefined> = []
) {
    revalidatePath("/");
    revalidatePath("/questions");

    if (!questionId) return;

    const titles = new Set(
        knownTitles
            .map((title) => (typeof title === "string" ? title.trim() : ""))
            .filter(Boolean)
    );

    if (titles.size === 0) {
        const question = await databases
            .getDocument(db, questionCollection, questionId)
            .catch(() => null);
        const title = typeof question?.title === "string" ? question.title.trim() : "";
        if (title) titles.add(title);
    }

    Array.from(titles).forEach((title) => {
        revalidatePath(`/questions/${questionId}/${slugify(title)}`);
    });

    if (titles.size === 0) {
        revalidatePath(QUESTION_DETAIL_ROUTE, "page");
    }
}
