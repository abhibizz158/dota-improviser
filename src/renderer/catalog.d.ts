declare module 'virtual:dota-catalog' {
  const catalog: import('../shared/model').Catalog
  export default catalog
}
declare module 'virtual:dota-items' {
  const items: Record<string, import('../shared/items').ItemInfo>
  export default items
}
