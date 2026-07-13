// isomorphic-git's index codepath expects a Buffer global in the browser.
import { Buffer } from 'buffer'
if (typeof globalThis.Buffer === 'undefined') globalThis.Buffer = Buffer
