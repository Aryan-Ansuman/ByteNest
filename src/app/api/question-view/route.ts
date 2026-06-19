import { db, questionCollection } from "@/models/name";
import { databases } from "@/models/server/config";
import { cookies, headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BOT_USER_AGENT_PATTERN =
    /bot|crawler|spider|slurp|facebookexternalhit|whatsapp|slackbot|twitterbot|discordbot|telegrambot|linkedinbot|embedly|quora link preview|pinterest|vkshare|w3c_validator|baiduspider|yandexbot|duckduckbot|ahrefsbot|semrush|mj12bot|petalbot|skypeuripreview|redditbot|applebot|gptbot|claude-web|claudebot|amazonbot|bytespider|perplexitybot|ccbot/i;

export async function POST(request: NextRequest) {
    const body = await request.json().catch(() => null);
    const questionId = typeof body?.questionId === "string" ? body.questionId.trim() : "";

    if (!questionId) {
        return NextResponse.json({ error: "questionId is required" }, { status: 400 });
    }

    const cookieName = `bn_viewed_${questionId}`;
    const alreadyViewed = cookies().get(cookieName)?.value === "1";
    const requestHeaders = headers();
    const userAgent = requestHeaders.get("user-agent") ?? "";
    const purpose = `${requestHeaders.get("purpose") ?? ""} ${requestHeaders.get("sec-purpose") ?? ""}`;
    const isPrefetch =
        purpose.toLowerCase().includes("prefetch") ||
        requestHeaders.get("next-router-prefetch") === "1";
    const shouldCount = !alreadyViewed && !BOT_USER_AGENT_PATTERN.test(userAgent) && !isPrefetch;

    if (!shouldCount) {
        return NextResponse.json({ counted: false }, { status: 200 });
    }

    const question = await databases
        .getDocument(db, questionCollection, questionId)
        .catch(() => null);

    if (!question) {
        return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    const views = Number(question.views ?? 0) + 1;
    await databases.updateDocument(db, questionCollection, questionId, { views });

    const response = NextResponse.json({ counted: true, views }, { status: 200 });
    response.cookies.set(cookieName, "1", {
        httpOnly: true,
        maxAge: 60 * 60 * 24,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
    });
    return response;
}
