// Static image imports (incl. *.svg via next/image) are typed by Next's image-types.
// next-env.d.ts carries this reference too, but it is gitignored and therefore absent
// in CI before `next build` runs — so tsc in the `typecheck` gate couldn't resolve
// `import logo from "@/assets/*.svg"`. Committing the reference makes the gate green in
// CI and is idempotent locally (the same ambient module, referenced once).
/// <reference types="next/image-types/global" />
