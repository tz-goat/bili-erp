/**
 * 库里统一存 ISO（UTC）串，接口层统一转成本地展示时间。
 * 边界：空值与非法时间都返回 null，避免把 "Invalid Date" 渲染到界面上。
 */
export function formatDateTime(isoString) {
    if (!isoString) {
        return null
    }

    const date = new Date(isoString)

    if (Number.isNaN(date.getTime())) {
        return null
    }

    return [
        `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`,
        `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
    ].join(' ')
}

function pad2(value) {
    return String(value).padStart(2, '0')
}
