import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { persist } from "zustand/middleware";

import {AppwriteException, ID, Models} from "appwrite"
import { account } from "@/models/client/config";


export interface UserPrefs {
  reputation: number;
  bookmarks?: string[];
  defaultAnswerSort?: string;
  followedTags?: string[];
}

interface IAuthStore {
  session: Models.Session | null;
  jwt: string | null
  user: Models.User<UserPrefs> | null
  hydrated: boolean

  setHydrated(): void;
  verfiySession(): Promise<void>;
  login(
    email: string,
    password: string
  ): Promise<
  {
    success: boolean;
    error?: AppwriteException| null
  }>
  createAccount(
    name: string,
    email: string,
    password: string
  ): Promise<
  {
    success: boolean;
    error?: AppwriteException| null
  }>
  logout(): Promise<void>;
  toggleBookmark(questionId: string): Promise<void>;
  updateAnswerSort(sort: string): Promise<void>;
  toggleFollowTag(tag: string): Promise<void>;
}


export const useAuthStore = create<IAuthStore>()(
  persist(
    immer((set, get) => ({
      session: null,
      jwt: null,
      user: null,
      hydrated: false,

      setHydrated() {
        set({hydrated: true})
      },

      async verfiySession() {
        try {
          const [session, user] = await Promise.all([
            account.getSession("current"),
            account.get<UserPrefs>(),
          ]);

          const currentPrefs = user.prefs || {};
          let needsUpdate = false;
          if (typeof currentPrefs.reputation !== "number") {
            currentPrefs.reputation = 0;
            needsUpdate = true;
          }
          if (!currentPrefs.bookmarks) {
            currentPrefs.bookmarks = [];
            needsUpdate = true;
          }
          if (!currentPrefs.defaultAnswerSort) {
            currentPrefs.defaultAnswerSort = "highest-score";
            needsUpdate = true;
          }
          
          if (needsUpdate) {
             const updatedUser = await account.updatePrefs<UserPrefs>(currentPrefs);
             user.prefs = updatedUser.prefs;
          }

          set({session, user, jwt: null})

        } catch {
          set({session: null, jwt: null, user: null})
        }
      },

      async login(email: string, password: string) {
        try {
          const session = await account.createEmailPasswordSession(email, password)
          const user = await account.get<UserPrefs>()
          const currentPrefs = user.prefs || {};
          let needsUpdate = false;
          if (typeof currentPrefs.reputation !== "number") {
            currentPrefs.reputation = 0;
            needsUpdate = true;
          }
          if (!currentPrefs.bookmarks) {
            currentPrefs.bookmarks = [];
            needsUpdate = true;
          }
          if (!currentPrefs.defaultAnswerSort) {
            currentPrefs.defaultAnswerSort = "highest-score";
            needsUpdate = true;
          }
          
          if (needsUpdate) {
             const updatedUser = await account.updatePrefs<UserPrefs>(currentPrefs);
             user.prefs = updatedUser.prefs;
          }

          set({session, user, jwt: null})
          
          return { success: true}

        } catch (error: any) {
          if (error?.message?.includes("Creation of a session is prohibited when a session is active")) {
            try {
              await account.deleteSession("current");
              return await get().login(email, password);
            } catch (_) {}
          }

          console.log(error)
          return {
            success: false,
            error: error instanceof AppwriteException ? error: null,
          }
        }
      },

      async createAccount(name:string, email: string, password: string) {
        try {
          await account.create(ID.unique(), email, password, name)
          return {success: true}
        } catch (error: any) {
          if (error?.message?.includes("Creation of a session is prohibited when a session is active")) {
            try {
              await account.deleteSession("current");
              return await get().createAccount(name, email, password);
            } catch (_) {}
          }

          console.log(error)
          return {
            success: false,
            error: error instanceof AppwriteException ? error: null,
          }
        }
      },

      async logout() {
        try {
          await account.deleteSessions()
          set({session: null, jwt: null, user: null})
          
        } catch (error) {
          console.log(error)
        }
      },

      async toggleBookmark(questionId: string) {
        const user = get().user;
        if (!user) return;
        
        const prefs = user.prefs || { reputation: 0 };
        const bookmarks = Array.isArray(prefs.bookmarks) ? [...prefs.bookmarks] : [];
        
        const index = bookmarks.indexOf(questionId);
        if (index > -1) {
            bookmarks.splice(index, 1);
        } else {
            bookmarks.push(questionId);
        }
        
        const newPrefs = { ...prefs, bookmarks };
        
        // Optimistic UI update
        set((state) => {
            if (state.user) state.user.prefs = newPrefs;
        });
        
        try {
            await account.updatePrefs<UserPrefs>(newPrefs);
        } catch (err) {
            // Revert on failure
            set((state) => {
                if (state.user) state.user.prefs = prefs;
            });
            throw err;
        }
      },

      async updateAnswerSort(sort: string) {
        const user = get().user;
        if (!user) return;
        
        const prefs = user.prefs || { reputation: 0 };
        const newPrefs = { ...prefs, defaultAnswerSort: sort };
        
        set((state) => {
            if (state.user) state.user.prefs = newPrefs;
        });
        
        try {
            await account.updatePrefs<UserPrefs>(newPrefs);
        } catch (err) {
            set((state) => {
                if (state.user) state.user.prefs = prefs;
            });
            throw err;
        }
      },

      async toggleFollowTag(tag: string) {
        const user = get().user;
        if (!user) return;
    
        const prefs = user.prefs || { reputation: 0 };
        const followed = Array.isArray(prefs.followedTags) ? [...prefs.followedTags] : [];
    
        const idx = followed.indexOf(tag);
        if (idx > -1) {
            followed.splice(idx, 1);
        } else {
            followed.push(tag);
        }
    
        const newPrefs = { ...prefs, followedTags: followed };
    
        set((state) => {
            if (state.user) state.user.prefs = newPrefs;
        });
    
        try {
            await account.updatePrefs<UserPrefs>(newPrefs);
        } catch (err) {
            set((state) => {
                if (state.user) state.user.prefs = prefs;
            });
            throw err;
        }
      },
    })),
    {
      name: "auth",
      partialize(state) {
        return {
          user: state.user,
          session: null,
          jwt: null,
          hydrated: state.hydrated,
        } as Partial<IAuthStore>;
      },
      onRehydrateStorage(){
        return (state, error) => {
          if (!error) state?.setHydrated()
        }
      }
    }
  )
)
