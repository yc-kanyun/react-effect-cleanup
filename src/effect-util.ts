import { EffectContext, EffectController } from "./effect";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunc = (...args: any[]) => any;

export type AbortSwitchCallback<Func extends AnyFunc> = (
    effectContext: EffectContext,
    ...args: Parameters<Func>
) => ReturnType<Func>;
export type AbortSwitchWrapperFn<Func extends AnyFunc> = (cb: AbortSwitchCallback<Func>) => Func

export function createAbortSwitchWrapper<Func extends AnyFunc>(effectContext: EffectContext, options?: EffectControllerOptions): AbortSwitchWrapperFn<Func> {
    let currCtrl: EffectController | null = null;
    effectContext.onAbort(() => {
        if (currCtrl) {
            currCtrl.abort();
            currCtrl = null;
        }
    })

    const retFunc: AbortSwitchWrapperFn<Func> = (cb: AbortSwitchCallback<Func>) => {
        return ((...args: Parameters<Func>): ReturnType<Func> => {
            if (currCtrl) {
                currCtrl.abort();
            }
            currCtrl = effectContext.createController(options);

            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return cb(currCtrl, ...args);
        }) as Func;
    };

    return retFunc;
}