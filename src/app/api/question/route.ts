import { questionCollection, db } from "@/models/name";
import { databases } from "@/models/server/config";
import { NextRequest, NextResponse } from "next/server";
import { ID } from "node-appwrite";

export async function POST(request: NextRequest) {
    try {
        const { title, content, authorId, tags, attachmentId } = await request.json();

        const docData: any = {
            title,
            content,
            authorId,
            tags,
        };

        if (attachmentId) {
            docData.attachmentId = attachmentId;
        }

        const response = await databases.createDocument(
            db,
            questionCollection,
            ID.unique(),
            docData
        );

        return NextResponse.json(response, { status: 201 });
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || "Error creating question" },
            { status: error?.status || error?.code || 500 }
        );
    }
}
