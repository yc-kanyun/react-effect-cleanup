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
            const { value, removeCleanup } = await ctx.action(async () => {
                set({ _loading: true })

                const res = await fetch('/api/users/current');
                return await res.json() as UserState
            }, () => {
                set({ _loading: false })
            })

            await ctx.action(() => {
                removeCleanup?.()
                set({ name: value?.name ?? '' })
            }, () => {
                set({ name: '' })
            })
        }
    }))
}