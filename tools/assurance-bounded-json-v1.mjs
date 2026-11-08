/** Bounded GitHub metadata parser: no source/tree/blob downloads or writes. */
export async function boundedGitHubJson(response, maxBytes = 2 * 1024 * 1024) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 2 * 1024 * 1024)
    throw Error('INVALID_RESPONSE_LIMIT');
  if (!response?.ok) throw Error('UNSUCCESSFUL_GITHUB_RESPONSE');
  const length = response.headers?.get?.('content-length');
  if (typeof length === 'string' && /^\d+$/.test(length) && Number(length) > maxBytes)
    throw Error('GITHUB_RESPONSE_TOO_LARGE');
  // Simple read-only provider stubs in unit tests intentionally expose json().
  if (typeof response.body?.getReader !== 'function') {
    if (typeof response.json !== 'function') throw Error('MISSING_GITHUB_RESPONSE');
    const value = await response.json();
    const bytes = JSON.stringify(value);
    if (typeof bytes !== 'string' || Buffer.byteLength(bytes, 'utf8') > maxBytes)
      throw Error('GITHUB_RESPONSE_TOO_LARGE');
    return value;
  }
  const reader = response.body.getReader();
  const chunks=[];
  let size=0, complete=false;
  try {
    while (true) {
      const {done,value} = await reader.read();
      if (done) { complete=true; break; }
      if (!(value instanceof Uint8Array)) throw Error('INVALID_GITHUB_RESPONSE_CHUNK');
      size += value.byteLength;
      if (size > maxBytes) throw Error('GITHUB_RESPONSE_TOO_LARGE');
      chunks.push(Buffer.from(value));
    }
  } finally {
    if (!complete) { try { await reader.cancel(); } catch { /* best effort */ } }
    reader.releaseLock();
  }
  const bytes = Buffer.concat(chunks,size);
  let parsed;
  try { parsed = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); }
  catch { throw Error('INVALID_GITHUB_RESPONSE_JSON'); }
  return parsed;
}
