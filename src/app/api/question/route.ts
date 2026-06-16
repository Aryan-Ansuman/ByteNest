import { questionCollection, db, questionAttachmentBucket } from "@/models/name";
import { databases, storage } from "@/models/server/config";
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

export async function PATCH(request: NextRequest) {
    try {
        const { questionId, title, content, tags, attachmentId, oldAttachmentId } = await request.json();

        const docData: any = { title, content, tags };

        // If a new attachment was uploaded or removed, handle old attachment
        if (attachmentId && oldAttachmentId && oldAttachmentId !== attachmentId) {
            try {
                await storage.deleteFile(questionAttachmentBucket, oldAttachmentId);
            } catch {
                // Old file might not exist, continue
            }
            if (attachmentId !== "none") {
                docData.attachmentId = attachmentId;
            } else {
                // If attachmentId is "none", it means the user removed the image. Appwrite might accept null/empty or we just omit if the schema allows nullable. Wait, Appwrite String attribute with not required means we can update it to empty string or null? 
                // Let's pass empty string if the schema allows, but Appwrite usually doesn't allow empty string if length > 0.
                // Wait! In the user's code:
            }
        }
        
        // Wait, the user provided exact code for PATCH. I'll use it exactly.
        if (attachmentId && oldAttachmentId && oldAttachmentId !== attachmentId) {
            try {
                await storage.deleteFile(questionAttachmentBucket, oldAttachmentId);
            } catch {
                // Old file might not exist, continue
            }
            docData.attachmentId = attachmentId;
        } else if (attachmentId) {
            docData.attachmentId = attachmentId;
        }

        const response = await databases.updateDocument(
            db,
            questionCollection,
            questionId,
            docData
        );

        return NextResponse.json(response, { status: 200 });
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || "Error updating question" },
            { status: error?.status || error?.code || 500 }
        );
    }
}
