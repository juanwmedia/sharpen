// just-bash's browser bundle imports node:zlib for its gzip coreutils, which
// the arena does not expose. Vite aliases node:zlib here.
function unavailable(): never {
  throw new Error('gzip is not available in this arena')
}

export const gunzipSync = unavailable
export const gzipSync = unavailable
export const inflateSync = unavailable
export const deflateSync = unavailable
export const constants = {}
export default { gunzipSync, gzipSync, inflateSync, deflateSync, constants }
