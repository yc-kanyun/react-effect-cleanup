import { EffectContext, EffectTransaction } from '@react-effect-cleanup/effect-controller';
import { create } from "zustand";

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
            const txn = new EffectTransaction(ctx)
            const { value, aborted, removeCleanup } = await txn.actAsync(async () => {
                console.log('set loading')
                set({ _loading: true })

                const res = await fetch('/api/users/current');
                return await res.json() as UserState
            }, () => {
                console.log('set loading false')
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