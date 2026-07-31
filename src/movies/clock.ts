/** Single injectable clock seam for all movie timestamps and flow expiry checks. */
let source: () => number = () => Date.now();

export function now(): number {
  return source();
}

/** Test hook. Production code never changes the clock. */
export function setNowForTest(next?: () => number): void {
  source = next ?? (() => Date.now());
}
