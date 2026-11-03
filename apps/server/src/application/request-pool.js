/**
 * 以固定并发数消费一组异步任务，结果顺序与输入顺序保持一致。
 * 这里不用第三方依赖，先把导入场景需要的最小并发控制收口在一处。
 */
export async function mapWithConcurrencyLimit(items, { concurrency, worker }) {
    // 并发数一旦为 0、负数或小数，请求池的行为就不再可预测，所以在入口处直接拒绝。
    if (!Number.isInteger(concurrency) || concurrency < 1) {
        throw new Error(`invalid concurrency: ${concurrency}`)
    }
    if (items.length === 0) {
        return []
    }


    const results = new Array(items.length)
    let nextIndex = 0

    async function runWorker() {
        while (true) {
            const currentIndex = nextIndex
            nextIndex += 1

            if (currentIndex >= items.length) {
                return
            }

            results[currentIndex] = await worker(items[currentIndex], currentIndex)
        }
    }

    const runnerCount = Math.min(concurrency, items.length)
    await Promise.all(Array.from({ length: runnerCount }, () => runWorker()))

    return results
}
