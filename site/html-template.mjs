import { parse, serialize } from 'parse5';

export function elements(node, tagName) {
  const found = [];
  const visit = current => {
    if (current.tagName === tagName) found.push(current);
    for (const child of current.childNodes || []) visit(child);
  };
  visit(node);
  return found;
}
export const attribute = (node, name) => node.attrs?.find(attr => attr.name === name)?.value;

// This removes the trusted Vite entry point; it is not a general HTML sanitizer.
export function withoutModuleEntry(html) {
  const document = parse(html);
  const removeEntries = node => {
    if (!node.childNodes) return;
    node.childNodes = node.childNodes.filter(child => {
      if (child.tagName === 'script' && attribute(child, 'type')?.trim().toLowerCase() === 'module') return false;
      if (child.tagName === 'link' && attribute(child, 'rel')?.toLowerCase().split(/\s+/).includes('modulepreload')) return false;
      return true;
    });
    for (const child of node.childNodes) removeEntries(child);
  };
  removeEntries(document);
  return serialize(document);
}
