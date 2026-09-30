// Vercel serverless function: GET /api/minted -> {"minted": N}
// Reads the SHOUTZ collection's own on-chain counter, so it is exact and needs
// no marketplace. Set in Vercel -> Project -> Settings -> Environment Variables:
//   SOLANA_RPC   a Helius (or other) mainnet RPC URL
//   COLLECTION   the Metaplex Core collection address
//
// A Core CollectionV1 account is laid out as:
//   key u8 | update_authority [32] | name (u32 len + bytes) | uri (u32 len + bytes) | num_minted u32 | current_size u32
// Values pasted into Vercel's dashboard often pick up a space, newline or quotes.
const clean = (v) => (v || "").trim().replace(/^["']|["']$/g, "").trim();

export default async function handler(req, res) {
  const SOLANA_RPC = clean(process.env.SOLANA_RPC);
  const COLLECTION = clean(process.env.COLLECTION);
  // for error messages: the RPC host only, never its api-key
  const rpcHost = (() => { try { return new URL(SOLANA_RPC).host; } catch { return "(not a URL)"; } })();
  try {
    if (!SOLANA_RPC || !COLLECTION) throw new Error("SOLANA_RPC and COLLECTION are not set");
    const r = await fetch(SOLANA_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getAccountInfo",
        params: [COLLECTION, { encoding: "base64", commitment: "confirmed" }] }),
    });
    const j = await r.json();
    if (j.error) throw new Error(`rpc error: ${j.error.message}`);
    const b64 = j.result?.value?.data?.[0];
    if (!b64) throw new Error(`collection account not found (looked up "${COLLECTION}" on ${rpcHost})`);
    const buf = Buffer.from(b64, "base64");
    let o = 1 + 32;                       // key + update authority
    o += 4 + buf.readUInt32LE(o);         // name
    o += 4 + buf.readUInt32LE(o);         // uri
    const minted = buf.readUInt32LE(o);   // num_minted: never goes down, even if a SHOUT is burned
    // Vercel's edge caches this for 15s, so the RPC is hit at most ~4 times a minute
    res.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=30");
    res.status(200).json({ minted });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e), collection: COLLECTION, rpc: rpcHost });
  }
}
