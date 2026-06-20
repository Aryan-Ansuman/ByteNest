import { useEffect } from "react";
import { client } from "@/models/client/config";
import { db, questionCollection } from "@/models/name";
import { RealtimeResponseEvent } from "appwrite";

export interface NewQuestionEvent {
    $id: string;
    [key: string]: any;
}

interface Props {
    visibleQuestionIds: string[];
    onNewQuestion: (q: NewQuestionEvent) => void;
    onVoteUpdate: (id: string, newTotalVotes: number) => void;
    enabled?: boolean;
}

export function useRealtimeFeed({
    visibleQuestionIds,
    onNewQuestion,
    onVoteUpdate,
    enabled = true,
}: Props) {
    useEffect(() => {
        if (!enabled) return;

        // Subscribe to all changes in the questions collection
        const unsubscribe = client.subscribe(
            `databases.${db}.collections.${questionCollection}.documents`,
            (response: RealtimeResponseEvent<any>) => {
                // If it's a create event, trigger onNewQuestion
                if (
                    response.events.includes("databases.*.collections.*.documents.*.create")
                ) {
                    onNewQuestion(response.payload);
                }

                // If it's an update event, check if the question is currently visible
                // and if the totalVotes has changed.
                if (
                    response.events.includes("databases.*.collections.*.documents.*.update")
                ) {
                    const doc = response.payload;
                    if (visibleQuestionIds.includes(doc.$id)) {
                        if (typeof doc.totalVotes === "number") {
                            onVoteUpdate(doc.$id, doc.totalVotes);
                        }
                    }
                }
            }
        );

        return () => {
            unsubscribe();
        };
    }, [enabled, onNewQuestion, onVoteUpdate, visibleQuestionIds]);
}
