import * as Y from "yjs";
import {
    Awareness,
    encodeAwarenessUpdate,
    applyAwarenessUpdate,
    removeAwarenessStates,
} from "y-protocols/awareness";
import { ID } from "appwrite";
import type { Databases } from "appwrite";
import { uint8ToBase64, base64ToUint8 } from "./utils";

interface ProviderOptions {
    doc: Y.Doc;
    awareness: Awareness;
    sessionId: string;
    roomId: string;
    senderId: string;
    databases: Databases;
    realtime: any;
    databaseId: string;
    collectionId: string;
}

export class AppwriteProvider {
    doc: Y.Doc;
    awareness: Awareness;

    private sessionId: string;
    private roomId: string;
    private senderId: string;
    private databases: Databases;
    private databaseId: string;
    private collectionId: string;
    private unsubscribe: (() => void) | null = null;
    private destroyed = false;

    constructor(opts: ProviderOptions) {
        this.doc = opts.doc;
        this.awareness = opts.awareness;
        this.sessionId = opts.sessionId;
        this.roomId = opts.roomId;
        this.senderId = opts.senderId;
        this.databases = opts.databases;
        this.databaseId = opts.databaseId;
        this.collectionId = opts.collectionId;

        this._setupDocListener();
        this._setupAwarenessListener();
        this._setupRealtime(opts.realtime);
    }

    // ── Doc listener ─────────────────────────────────────────────────

    private _setupDocListener() {
        this.doc.on("update", (update: Uint8Array, origin: unknown) => {
            // Don't re-broadcast updates that came from remote (origin === this)
            if (origin === this || this.destroyed) return;
            this._send(update, 0);
        });
    }

    // ── Awareness listener ────────────────────────────────────────────

    private _setupAwarenessListener() {
        this.awareness.on(
            "update",
            ({
                added,
                updated,
                removed,
            }: {
                added: number[];
                updated: number[];
                removed: number[];
            }) => {
                if (this.destroyed) return;
                const changed = [...added, ...updated, ...removed];
                const update = encodeAwarenessUpdate(this.awareness, changed);
                this._send(update, 1);
            }
        );
    }

    // ── Write to collab_messages ──────────────────────────────────────

    private async _send(update: Uint8Array, type: 0 | 1) {
        if (this.destroyed) return;
        try {
            await this.databases.createDocument(
                this.databaseId,
                this.collectionId,
                ID.unique(),
                {
                    sessionId: this.sessionId,
                    roomId: this.roomId,
                    senderId: this.senderId,
                    update: uint8ToBase64(update),
                    type,
                }
            );
        } catch {
            // fire-and-forget — best effort
        }
    }

    // ── Realtime subscription ─────────────────────────────────────────

    private _setupRealtime(realtime: any) {
        const channel = `databases.${this.databaseId}.collections.${this.collectionId}.documents`;

        this.unsubscribe = realtime.subscribe(channel, (event: any) => {
            const payload = event.payload;

            // Filter by session
            if (payload.sessionId !== this.sessionId) return;
            // Don't apply our own updates back
            if (payload.senderId === this.senderId) return;

            const isCreate = event.events.some((e: string) =>
                e.includes(".create")
            );
            if (!isCreate) return;

            try {
                const update = base64ToUint8(payload.update);

                if (payload.type === 0) {
                    // origin=this prevents doc listener from re-broadcasting
                    Y.applyUpdate(this.doc, update, this);
                } else if (payload.type === 1) {
                    applyAwarenessUpdate(this.awareness, update, this);
                }
            } catch {
                // malformed — ignore
            }
        });
    }

    // ── Cleanup ───────────────────────────────────────────────────────

    destroy() {
        this.destroyed = true;
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
        removeAwarenessStates(this.awareness, [this.doc.clientID], this);
    }
}
