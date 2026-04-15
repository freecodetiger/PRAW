export function getSelectionTextWithin(container: HTMLElement | null): string {
  if (!container) {
    return "";
  }

  const selection = window.getSelection();
  if (!selection) {
    return "";
  }

  const text = selection.toString().trim();
  if (!text) {
    return "";
  }

  const anchorNode = selection.anchorNode;
  const focusNode = selection.focusNode;
  const anchorWithin = anchorNode ? container.contains(anchorNode) : false;
  const focusWithin = focusNode ? container.contains(focusNode) : false;

  return anchorWithin || focusWithin ? text : "";
}
