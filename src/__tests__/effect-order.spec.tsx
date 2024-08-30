import '@testing-library/jest-dom/jest-globals'
import { test, expect, jest } from "@jest/globals"
import { cleanup, render } from "@testing-library/react"
import { useEffect } from 'react'

test('Parent/Child 的 effect 执行和清理过程测试', () => {
    const traceEffect = jest.fn();
    const traceEffectCleanup = jest.fn();
    function Child() {
        traceEffect('child')
        useEffect(() => {
            return () => {
                traceEffectCleanup('child')
            }
        }, [])

        return <></>
    }

    function Parent() {
        traceEffect('parent')
        useEffect(() => {
            return () => {
                traceEffectCleanup('parent')
            }
        }, [])

        return <Child />
    }

    render(<Parent />)

    cleanup()

    /**
     * Parent 的 effect 先执行
     */
    expect(traceEffect).toHaveBeenNthCalledWith(1, 'parent')
    expect(traceEffect).toHaveBeenNthCalledWith(2, 'child')

    /**
     * 可以看到是 Parent 中的 effect 先被清理
     */
    expect(traceEffectCleanup).toHaveBeenNthCalledWith(1, 'parent')
    expect(traceEffectCleanup).toHaveBeenNthCalledWith(2, 'child')
})