/* SHA-256 for publish, off the main thread.

   saveComic() used to digest every page blob on the UI thread before a single
   byte was sent, which is where the freeze came from on a comic of any size.
   Blobs are structured-cloneable, so they cross to the worker without a copy
   of the underlying bytes. */
self.onmessage = async (e) => {
  const { id, blob } = e.data;
  try{
    const buf = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    self.postMessage({ id, hex });
  }catch(err){
    self.postMessage({ id, error: (err && err.message) || String(err) });
  }
};
