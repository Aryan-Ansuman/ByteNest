export const uint8ToBase64 = (arr: Uint8Array): string => {
    let binary = "";
    for (let i = 0; i < arr.byteLength; i++) {
        binary += String.fromCharCode(arr[i]);
    }
    return btoa(binary);
};

export const base64ToUint8 = (b64: string): Uint8Array =>
    Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export function debounce<T extends (...args: any[]) => any>(
    fn: T,
    delay: number
): (...args: Parameters<T>) => void {
    let timer: ReturnType<typeof setTimeout>;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}
