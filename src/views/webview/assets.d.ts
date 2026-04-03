declare module '*.html' {
    const content: string;
    export default content;
}
declare module '*.css' {
    const content: string;
    export default content;
}
// Scoped to webview assets only (webpack include restricts to src/views/webview/)
declare module '*.js' {
    const content: string;
    export default content;
}
