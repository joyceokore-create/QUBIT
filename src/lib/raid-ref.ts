/** Short, stable reference for a risk or issue: the first characters of its id
 * ("#3F9A1C"). Shown in the Issues ID column and the custom reports. Client-safe. */
export function raidRef(id: string): string {
  return `#${id.slice(0, 6).toUpperCase()}`;
}
