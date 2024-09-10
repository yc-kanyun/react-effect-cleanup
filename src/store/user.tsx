import { create } from "zustand";
import { EffectContext } from "../effect";

export interface UserState {
    name: string,
    _loading: boolean,
    fetch: (ctx: EffectContext) => Promise<void>
}

export function createUserStore() {
    return create<UserState>((set) => ({
        name: '',
        _loading: false,
        fetch: async (ctx) => {
            const { value, removeCleanup, aborted } = await ctx.action(async () => {
                set({ _loading: true })

                const res = await fetch('/api/users/current');
                return await res.json() as UserState
            }, () => {
                set({ _loading: false })
            })

            if (aborted) {
                return;
            }
            removeCleanup()
            set({ _loading: false, name: value.name })
        }
    }))
}