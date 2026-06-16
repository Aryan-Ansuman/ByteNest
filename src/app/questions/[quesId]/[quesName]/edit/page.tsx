import { db, questionCollection, questionAttachmentBucket } from "@/models/name";
import { databases } from "@/models/server/config";
import { storage } from "@/models/client/config";
import React from "react";
import EditQues from "./EditQues";

const Page = async ({ params }: { params: { quesId: string; quesName: string } }) => {
    const question = await databases.getDocument(db, questionCollection, params.quesId);

    const attachmentUrl =
        question.attachmentId && question.attachmentId !== "none"
            ? storage.getFilePreview(questionAttachmentBucket, question.attachmentId).href
            : "";

    return <EditQues question={question} existingAttachmentUrl={attachmentUrl} />;
};

export default Page;
