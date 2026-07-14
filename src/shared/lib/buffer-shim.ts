// isomorphic-git expects a Buffer global in the browser.
import { Buffer as BufferPolyfill } from 'buffer'

globalThis.Buffer = BufferPolyfill as unknown as typeof globalThis.Buffer
