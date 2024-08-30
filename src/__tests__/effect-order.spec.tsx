import '@testing-library/jest-dom/jest-globals'
import { test, expect, jest } from "@jest/globals"
import { render, screen } from "@testing-library/react"
import { useEffect, useState } from 'react'
import userEvent from '@testing-library/user-event'

test('Parent/Child 的 effect 执行和清理过程测试', async () => {
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

    function Page() {
        const [show, setShow] = useState(true);

        return <>
            {show && <Parent />}
            <button onClick={() => { setShow(false) }}>hide</button>
        </>
    }

    const user = userEvent.setup()

    render(<Page />)

    await user.click(screen.getByText('hide'));

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