export function tarjanScc(
  nodes: string[],
  adjacency: ReadonlyMap<string, ReadonlySet<string>>
): string[][] {
  const indexMap = new Map<string, number>();
  const lowLink = new Map<string, number>();
  const stack: string[] = [];
  const inStack = new Set<string>();
  const components: string[][] = [];
  let index = 0;

  const visit = (node: string): void => {
    indexMap.set(node, index);
    lowLink.set(node, index);
    index += 1;
    stack.push(node);
    inStack.add(node);

    const edges = adjacency.get(node);
    if (edges) {
      for (const neighbor of edges) {
        if (!indexMap.has(neighbor)) {
          visit(neighbor);
          lowLink.set(node, Math.min(lowLink.get(node) ?? 0, lowLink.get(neighbor) ?? 0));
        } else if (inStack.has(neighbor)) {
          lowLink.set(node, Math.min(lowLink.get(node) ?? 0, indexMap.get(neighbor) ?? 0));
        }
      }
    }

    if (lowLink.get(node) === indexMap.get(node)) {
      const component: string[] = [];
      while (stack.length > 0) {
        const top = stack.pop();
        if (!top) break;
        inStack.delete(top);
        component.push(top);
        if (top === node) break;
      }
      components.push(component.sort((a, b) => a.localeCompare(b)));
    }
  };

  for (const node of nodes) {
    if (!indexMap.has(node)) {
      visit(node);
    }
  }

  return components.sort(
    (a, b) => b.length - a.length || (a[0] ?? "").localeCompare(b[0] ?? "")
  );
}
