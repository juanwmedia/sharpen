// just-bash's browser bundle imports node:zlib for its gzip/gunzip coreutils.
// The arena does not whitelist those commands, so a throwing stub is enough.
function unavailable() {
  throw new Error('gzip is not available in this arena')
}
export const gunzipSync = unavailable
export const gzipSync = unavailable
export const inflateSync = unavailable
export const deflateSync = unavailable
export const constants = {}
export default { gunzipSync, gzipSync, inflateSync, deflateSync, constants }
