export function isWebKitBrowser() {
  return (
    typeof window !== 'undefined'
    && typeof window.webkitConvertPointFromNodeToPage === 'function'
  );
}
