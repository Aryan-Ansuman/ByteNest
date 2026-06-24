import { Client, Databases, Query } from "node-appwrite";

const COLLECTION = {
    ROOMS: process.env.COLLECTION_DISCUSSION_ROOMS,
    MEMBERS: process.env.COLLECTION_ROOM_MEMBERS,
    MESSAGES: process.env.COLLECTION_ROOM_MESSAGES,
    CODE_SESSIONS: process.env.COLLECTION_CODE_SESSIONS,
    COLLAB_MESSAGES: process.env.COLLECTION_COLLAB_MESSAGES,
    TYPING: process.env.COLLECTION_TYPING_INDICATORS,
};

const DB_ID = process.env.DATABASE_ID;

export default async ({ log, error }) => {
    const client = new Client()
        .setEndpoint(process.env.APPWRITE_ENDPOINT)
        .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
        .setKey(process.env.APPWRITE_API_KEY);

    const db = new Databases(client);

    const results = {
        membersMarkedOffline: 0,
        roomsArchived: 0,
        collabMsgsDeleted: 0,
        typingDocsDeleted: 0,
    };

    // ── Step 1: Mark stale members offline ─────────────────────────
    // Threshold: 35s = 15s heartbeat interval + 20s buffer
    await step1_markOffline(db, results, log, error);

    // ── Step 2: Archive inactive rooms ─────────────────────────────
    // Rooms with no activity in 24h AND no online members
    await step2_archiveRooms(db, results, log, error);

    // ── Step 3: Delete stale collab_messages (older than 1 hour) ───
    await step3_cleanCollabMessages(db, results, log, error);

    // ── Step 4: Delete stale typing_indicators (older than 60s) ────
    await step4_cleanTypingIndicators(db, results, log, error);

    log(
        `Done — offline: ${results.membersMarkedOffline}, ` +
            `archived: ${results.roomsArchived}, ` +
            `collab: ${results.collabMsgsDeleted}, ` +
            `typing: ${results.typingDocsDeleted}`
    );

    return { ok: true, ...results };
};

// ── Step 1 ────────────────────────────────────────────────────────

async function step1_markOffline(db, results, log, error) {
    const STALE_THRESHOLD_MS = 35_000;
    const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();

    try {
        // Page through all stale online members
        let cursor = null;
        while (true) {
            const queries = [
                Query.equal("status", "online"),
                Query.lessThan("lastSeenAt", cutoff),
                Query.limit(100),
            ];
            if (cursor) queries.push(Query.cursorAfter(cursor));

            const page = await db.listDocuments(DB_ID, COLLECTION.MEMBERS, queries);
            if (page.documents.length === 0) break;

            // Mark all offline in parallel
            await Promise.allSettled(
                page.documents.map((m) =>
                    db.updateDocument(DB_ID, COLLECTION.MEMBERS, m.$id, {
                        status: "offline",
                    })
                )
            );

            results.membersMarkedOffline += page.documents.length;
            log(`Marked ${page.documents.length} members offline`);

            if (page.documents.length < 100) break;
            cursor = page.documents[page.documents.length - 1].$id;
        }
    } catch (err) {
        error(`step1_markOffline failed: ${err.message}`);
    }
}

// ── Step 2 ────────────────────────────────────────────────────────

async function step2_archiveRooms(db, results, log, error) {
    const INACTIVE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24h
    const cutoff = new Date(Date.now() - INACTIVE_THRESHOLD_MS).toISOString();

    try {
        let cursor = null;
        while (true) {
            const queries = [
                Query.equal("status", "active"),
                Query.lessThan("lastActivityAt", cutoff),
                Query.limit(50),
            ];
            if (cursor) queries.push(Query.cursorAfter(cursor));

            const page = await db.listDocuments(DB_ID, COLLECTION.ROOMS, queries);
            if (page.documents.length === 0) break;

            for (const room of page.documents) {
                try {
                    // Verify no online members before archiving
                    const online = await db.listDocuments(DB_ID, COLLECTION.MEMBERS, [
                        Query.equal("roomId", room.$id),
                        Query.equal("status", "online"),
                        Query.limit(1),
                    ]);

                    if (online.total > 0) {
                        log(`Room ${room.$id} skipped — still has online members`);
                        continue;
                    }

                    // End any active code session
                    const ops = [
                        db.updateDocument(DB_ID, COLLECTION.ROOMS, room.$id, {
                            status: "archived",
                            activeCodeSessionId: null,
                        }),
                    ];

                    if (room.activeCodeSessionId) {
                        ops.push(
                            db.updateDocument(
                                DB_ID,
                                COLLECTION.CODE_SESSIONS,
                                room.activeCodeSessionId,
                                { status: "ended", endedAt: new Date().toISOString() }
                            )
                        );
                    }

                    await Promise.all(ops);
                    results.roomsArchived++;
                    log(`Archived room ${room.$id} (${room.name})`);
                } catch (err) {
                    error(`Failed to archive room ${room.$id}: ${err.message}`);
                }
            }

            if (page.documents.length < 50) break;
            cursor = page.documents[page.documents.length - 1].$id;
        }
    } catch (err) {
        error(`step2_archiveRooms failed: ${err.message}`);
    }
}

// ── Step 3 ────────────────────────────────────────────────────────

async function step3_cleanCollabMessages(db, results, log, error) {
    const COLLAB_TTL_MS = 60 * 60 * 1000; // 1 hour
    const cutoff = new Date(Date.now() - COLLAB_TTL_MS).toISOString();

    try {
        let cursor = null;
        while (true) {
            const queries = [Query.lessThan("$createdAt", cutoff), Query.limit(100)];
            if (cursor) queries.push(Query.cursorAfter(cursor));

            const page = await db.listDocuments(
                DB_ID,
                COLLECTION.COLLAB_MESSAGES,
                queries
            );
            if (page.documents.length === 0) break;

            await Promise.allSettled(
                page.documents.map((d) =>
                    db.deleteDocument(DB_ID, COLLECTION.COLLAB_MESSAGES, d.$id)
                )
            );

            results.collabMsgsDeleted += page.documents.length;

            if (page.documents.length < 100) break;
            cursor = page.documents[page.documents.length - 1].$id;
        }
    } catch (err) {
        error(`step3_cleanCollabMessages failed: ${err.message}`);
    }
}

// ── Step 4 ────────────────────────────────────────────────────────

async function step4_cleanTypingIndicators(db, results, log, error) {
    const TYPING_TTL_MS = 60_000; // 60 seconds
    const cutoff = new Date(Date.now() - TYPING_TTL_MS).toISOString();

    try {
        let cursor = null;
        while (true) {
            const queries = [Query.lessThan("$updatedAt", cutoff), Query.limit(100)];
            if (cursor) queries.push(Query.cursorAfter(cursor));

            const page = await db.listDocuments(DB_ID, COLLECTION.TYPING, queries);
            if (page.documents.length === 0) break;

            await Promise.allSettled(
                page.documents.map((d) =>
                    db.deleteDocument(DB_ID, COLLECTION.TYPING, d.$id)
                )
            );

            results.typingDocsDeleted += page.documents.length;

            if (page.documents.length < 100) break;
            cursor = page.documents[page.documents.length - 1].$id;
        }
    } catch (err) {
        error(`step4_cleanTypingIndicators failed: ${err.message}`);
    }
}
