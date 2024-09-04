import { create } from "zustand";
import { AbortContext } from "../abort";

export interface UserState {
    name: string,
    _loading: boolean,
    fetch: (ctx: AbortContext) => Promise<void>
}

export function createUserStore() {
    return create<UserState>((set) => ({
        name: '',
        _loading: false,
        fetch: async (ctx) => {
            set({ _loading: true })
            const res = await fetch('/api/users/current')
            if (ctx.aborted()) {
                return
            }
            set({ _loading: false })

            const data = await res.json() as UserState
            if (ctx.aborted()) {
                return
            }

            set({ name: data.name })
        }
    }))
}