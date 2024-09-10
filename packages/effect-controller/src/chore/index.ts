import {
    EffectControllerOptions,
    AnyFunc,
    EffectSwitchWrapperFn,
    EffectSwitchCallback,
    EffectContext,
    ActionResult,
    ActionErrorResult,
    ActionSuccessResult,
    ActionCleanupFn,
    AbortFn,
} from '../types'

export class EffectController implements EffectContext {
    private readonly cleanupCallbacks: AbortFn[] = [];
    private readonly childControllers: EffectController[] = [];
    private _aborted = false;

    constructor(options?: EffectControllerOptions) {
        if (options?.debugLabel) {
            console.log(`[CREATE] id=${options.debugLabel}`)
        }

        this.onAbort(() => {
            if (options?.debugLabel) {
                console.log(`[ABORTED] id=${options.debugLabel}`)
            }
        })
    }

    private createChildController(options?: EffectControllerOptions): EffectController {
        const ctrl = new EffectController(options);
        this.childControllers.push(ctrl);

        ctrl.onAbort(() => {
            const idx = this.childControllers.indexOf(ctrl);
            if (idx >= 0) {
                this.childControllers.splice(idx, 1);
            }
        });

        return ctrl;
    }

    abort(): void {
        if (this._aborted) {
            return;
        }

        for (let i = this.childControllers.length - 1; i >= 0; i--) {
            this.childControllers[i].abort();
        }
        this.childControllers.length = 0;

        for (let i = this.cleanupCallbacks.length - 1; i >= 0; i--) {
            const cb = this.cleanupCallbacks[i];
            cb();
        }

        if (this.cleanupCallbacks.length > 0) {
            throw new Error('cleanup callbacks not empty');
        }

        this._aborted = true;
    }

    aborted(): boolean {
        return this._aborted;
    }

    onAbort(cleanup: AbortFn): AbortFn {
        const wrappedCleanup = () => {
            cleanup();
            removeCleanup();
        };

        const removeCleanup = () => {
            const idx = this.cleanupCallbacks.indexOf(wrappedCleanup);
            if (idx >= 0) {
                this.cleanupCallbacks.splice(idx, 1);
            }
        };

        this.cleanupCallbacks.push(wrappedCleanup);
        return removeCleanup;
    }

    createController(options?: EffectControllerOptions): EffectController {
        if (this._aborted) {
            throw new Error('aborted controller can\'t create child controller');
        }

        return this.createChildController(options);
    }

}

export class EffectTransaction {
    private readonly context: EffectContext;

    constructor(context: EffectContext) {
        this.context = context;
    }

    act<RET>(callback: () => RET, cleanup?: ActionCleanupFn<RET>): ActionResult<RET> {
        if (this.context.aborted()) {
            return { aborted: true, removeCleanup: () => void 0 };
        }

        const ret = callback()

        const removeCleanup = cleanup ? this.context.onAbort(() => {
            cleanup(ret)
        }) : () => void 0;

        return { aborted: false, value: ret, removeCleanup: removeCleanup };
    }

    actAsync<RET>(callback: () => PromiseLike<RET>, cleanup?: ActionCleanupFn<RET>): Promise<ActionResult<RET>> {
        if (this.context.aborted()) {
            return Promise.resolve({ aborted: true, removeCleanup: () => void 0 })
        }

        return callback().then(value => {
            if (this.context.aborted()) {
                cleanup?.(value);
                return { aborted: true, removeCleanup: () => { void 0 } } as ActionErrorResult<RET>
            };

            const removeCleanup = cleanup ? this.context.onAbort(() => { cleanup(value) }) : () => void 0;
            return { value, aborted: false, removeCleanup } as ActionSuccessResult<RET>
        }) as Promise<ActionResult<RET>>
    }
}

export function createEffectController(options?: EffectControllerOptions): EffectController {
    return new EffectController(options);
}

export function createEffectSwitchWrapper<Func extends AnyFunc>(effectContext: EffectContext, options?: EffectControllerOptions): EffectSwitchWrapperFn<Func> {
    let currCtrl: EffectController | null = null;
    effectContext.onAbort(() => {
        if (currCtrl) {
            currCtrl.abort();
            currCtrl = null;
        }
    })

    const retFunc: EffectSwitchWrapperFn<Func> = (cb: EffectSwitchCallback<Func>) => {
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
