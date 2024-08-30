/**
 * 这个文件用来测一些 Jotai 的行为，比如 atom 的创建、更新等
 * 关注以下几个问题:
 * 1. Atom 的更新逻辑写在哪？怎么阻止？
 * 2. Atom 的级联更新怎么写？
 * 3. Atom 的变化怎么 watch？
 */

import { expect, test } from "@jest/globals";
import { atom, createStore } from "jotai";

test("简单的 atom 例子", () => {
    const userAtom = atom({ name: "Tom", age: 18 });
    const store = createStore()

    expect(store.get(userAtom)).toEqual({ name: "Tom", age: 18 });
})

test("只读 atom", () => {
    const userAtom = atom(() => {
        return {
            name: "Tom",
            age: 18
        }
    });
    const store = createStore()

    expect(store.get(userAtom)).toEqual({ name: "Tom", age: 18 });
    const currValue = store.get(userAtom)
    currValue.age = 19

    // Atom 返回的 object 是同一份引用
    expect(store.get(userAtom)).toEqual({ name: "Tom", age: 19 });
})

test('通过 write only atom 来实现副作用和清理', () => {
    let effect = false;
    const effectAtom = atom(null, () => {
        effect = true;
    })
    const clearEffectAtom = atom(null, () => {
        effect = false;
    })

    const store = createStore();
    expect(effect).toBeFalsy()

    store.set(effectAtom)
    expect(effect).toBeTruthy()

    store.set(clearEffectAtom)
    expect(effect).toBeFalsy()
})

/**
 * 实现一个写入时倍乘的 atom
 */
test('可读可写的 atom', () => {
    const costAtom = atom(0)
    const priceAtom = atom(
        (get) => get(costAtom) * 2,
        (_, set, price: number) => {
            set(costAtom, price / 2)
        },
    )

    const store = createStore();
    store.set(costAtom, 10)
    expect(store.get(priceAtom)).toBe(20)

    store.set(priceAtom, 30)
    expect(store.get(costAtom)).toBe(15)
})

test('测试一下 onMount', () => {
    const countAtom = atom(0)
    countAtom.onMount = (setAtom) => {
        setAtom(c => c + 1)

        return () => {
            setAtom(c => c - 1)
        }
    }

    const store = createStore();
    expect(store.get(countAtom)).toBe(0) // store 的 get 方法不触发 onMount
    expect(store.get(countAtom)).toBe(0) // store 的 get 方法不触发 onMount
})