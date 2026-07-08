import { IndexType } from "node-appwrite";
import { db, githubWebhookRegistrationsCollection } from "../name";
import { databases } from "./config";

/**
 * PR-Linked Q&A — Phase 7.
 *
 * One document per (repoOwner, repoName) pair ByteNest has attempted to
 * register a webhook for. `githubWebhookId` is null when
 * `webhookRegistrationStatus` is "failed_no_permission" — there's no real
 * GitHub-side webhook to reference in that case.
 */
export default async function createGithubWebhookRegistrationsCollection() {
    await databases.createCollection(
        db,
        githubWebhookRegistrationsCollection,
        githubWebhookRegistrationsCollection,
        [] // Server-key-only — never read or written directly by a client.
    );
    console.log("GitHub Webhook Registrations Collection Created");

    await Promise.all([
        databases.createStringAttribute(db, githubWebhookRegistrationsCollection, "repoOwner", 100, true),
        databases.createStringAttribute(db, githubWebhookRegistrationsCollection, "repoName", 100, true),
        databases.createIntegerAttribute(db, githubWebhookRegistrationsCollection, "githubWebhookId", false),
        databases.createEnumAttribute(
            db,
            githubWebhookRegistrationsCollection,
            "webhookRegistrationStatus",
            ["registered", "failed_no_permission"],
            true
        ),
        databases.createDatetimeAttribute(db, githubWebhookRegistrationsCollection, "registeredAt", true),
        databases.createDatetimeAttribute(db, githubWebhookRegistrationsCollection, "lastEventAt", false),
    ]);
    console.log("GitHub Webhook Registrations Attributes Created");

    await databases.createIndex(
        db,
        githubWebhookRegistrationsCollection,
        "repo_owner_name_unique",
        IndexType.Unique,
        ["repoOwner", "repoName"]
    );
    console.log("GitHub Webhook Registrations Indexes Created");
}
