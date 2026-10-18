# Ghostdrop Format Specification

**Status:** Draft for implementation and review  
**Format version:** `0x01`  
**Scope:** Browser/Python interoperable encrypted drops for text and files

> **Implementation warning:** This is a proposed format, not a security audit. Review the design with an applied-cryptography specialist before relying on it for high-value secrets. Do not invent alternatives to the specified algorithms or silently change constants within version 1.

## Assumptions and decisions

1. Each drop gets a fresh uniformly random 32-byte URL key and a fresh 7-byte nonce prefix.
2. The server stores encrypted records and a small public envelope. It never receives the URL key through an HTTP request; the key is in the URL fragment.
3. The format uses AES-256-GCM with 96-bit nonces and 128-bit tags.
4. File data is divided into 2 MiB chunks. Text secrets are UTF-8 and limited to one data chunk (at most 2 MiB).
5. Records are independently authenticated and include authenticated record indexes and a final-record flag. A client MUST verify the complete record sequence before presenting a file as successfully decrypted.
6. Optional password protection is an additional factor, not a replacement for the URL key. Version 1 uses Argon2id and HKDF-SHA-256 with fixed parameters.
7. The public envelope and record framing below are normative. The server's database/API representation may differ, but it MUST preserve the exact bytes and values required by this format.
8. The server-assigned drop ID is an ASCII string restricted to `[A-Za-z0-9_-]`, 1–128 bytes, and is included in each record's AAD. The ID is case-sensitive and MUST be used exactly as returned by the server.
9. This specification chooses a Tink-inspired segmented nonce layout (random prefix, big-endian segment counter, final flag). It is not wire-compatible with Google Tink's Streaming AEAD formats.

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, **SHOULD NOT**, and **MAY** are normative.

---

## 1. Goals, non-goals, and threat model

### 1.1 Goals

- Encrypt text and file content in the browser before upload.
- Keep plaintext content, filename, MIME type, and plaintext size out of server-readable storage.
- Detect tampering, record swapping, cross-drop substitution, and incomplete streams.
- Support expiring drops and server-enforced retrieval/view limits.
- Define one byte format for browser WebCrypto and a future Python CLI.
- Use established primitives: AES-GCM, HKDF-SHA-256, and Argon2id.

### 1.2 Non-goals

Version 1 does not provide identity verification, sender authentication, forward secrecy, deniable sharing, metadata anonymity, traffic-flow confidentiality, or protection against a compromised recipient device. A shared link is a bearer capability: anyone who obtains the complete link and any required password can decrypt the drop.

The server's expiry and view-count enforcement is an availability/access policy, not cryptographic erasure. A recipient can save plaintext or ciphertext before expiry, take screenshots, or redistribute the key.

### 1.3 What an attacker can learn

A passive network attacker who cannot break TLS can normally observe the service's IP/domain, connection timing, approximate traffic volume, and network endpoints. The server can see the public envelope and all server-side fields listed in Section 9.

The server MUST NOT receive the URL key or plaintext as part of the intended protocol. However, **this is not protection against a malicious server that serves the JavaScript application**. A server that changes the delivered JavaScript can read the URL fragment, read the password, or exfiltrate plaintext at decryption time. The format alone cannot solve this. Stronger assurance requires independently verifiable client code, a signed/packaged client, reproducible builds, or another trusted delivery mechanism.

A compromised browser, malicious extension, clipboard manager, screen recorder, or recipient endpoint can also disclose secrets.

---

## 2. Terminology and byte conventions

- **Drop:** One shared secret/file and its encrypted record sequence.
- **URL key:** A random 32-byte secret placed after `#` in the share URL.
- **Content key:** The 32-byte AES key derived from the URL key and, optionally, a password.
- **Record:** One encrypted header or data chunk.
- **AAD:** Additional authenticated data. It is authenticated by AES-GCM but is not encrypted.
- **BE32 / BE16:** Unsigned 32-/16-bit integer encoded big-endian.
- **U64:** Unsigned 64-bit integer encoded big-endian wherever this format explicitly uses a fixed-width U64.
- **Concatenation:** `A || B` means append the bytes of `B` to `A`.
- **Hex:** Lowercase hexadecimal, two characters per byte, used only for diagnostics and test vectors.
- **Base64url:** RFC 4648 URL-safe Base64 using `-` and `_`, **without `=` padding**.

All lengths are byte lengths, not character counts, unless stated otherwise. Binary strings MUST NOT be implicitly converted through a locale-dependent encoding. Text values use UTF-8. Integers MUST use the byte order stated for the field.

### 2.1 Versioning

The only defined version is `0x01`. A reader MUST reject any other version. A future incompatible format MUST use a new version; implementations MUST NOT guess a version or silently fall back to a weaker format.

### 2.2 Cryptographic constants

| Constant | Version 1 value |
|---|---:|
| Cipher | AES-256-GCM |
| AES key | 32 bytes |
| GCM nonce/IV | 12 bytes (96 bits) |
| GCM authentication tag | 16 bytes (128 bits) |
| URL key | 32 random bytes |
| KDF salt | 32 random bytes |
| Nonce prefix | 7 random bytes |
| Password salt | 16 random bytes |
| Data chunk size | 2,097,152 bytes (2 MiB) |
| Maximum data chunks | \(2^{20}\) (1,048,576) |
| Maximum file plaintext size | 2 TiB |
| Maximum encrypted metadata plaintext | 65,536 bytes |
| Maximum text secret | 2 MiB of UTF-8 bytes |

The 2 TiB file limit is an application limit, not an AES-GCM primitive limit. Implementations MUST reject larger files and MUST NOT wrap counters.

---

## 3. URL key generation and handling

### 3.1 Generation and encoding

Generate the URL key with the browser's cryptographically secure random generator:

- Generate exactly 32 bytes using `crypto.getRandomValues`.
- Encode those bytes as unpadded Base64url.
- A valid 32-byte key encodes to exactly 43 Base64url characters.
- Decoding MUST produce exactly 32 bytes; reject malformed input, padding, or an incorrect decoded length.

Do not use `Math.random`, timestamps, UUIDs as substitutes, user passwords, or a non-cryptographic PRNG.

The shared URL has this shape:

```text
https://app.example/d/{drop-id}#{43-character-base64url-key}
```

The fragment is client-side only and is not included in the HTTP request target. It is not sent in the normal HTTP `Referer` header, but that does not make it safe from client-side scripts or browser extensions.

### 3.2 Browser read-and-remove procedure

1. Read the fragment as early as possible on the share page.
2. Parse and strictly validate the Base64url key.
3. Copy the decoded bytes into the crypto module's short-lived memory.
4. Immediately replace the current history entry with the same origin/path/query but an empty fragment, using `history.replaceState`.
5. Do this before analytics, third-party scripts, external images, or other nonessential resources run.
6. Do not log the full URL, fragment, URL key, password, or derived key.
7. Clear references to key material when practical. JavaScript does not guarantee reliable zeroization of all copies.

`replaceState` removes the fragment from the current address-bar entry; it cannot guarantee removal from synced browser history, extensions, screenshots, clipboard history, or any copy of the original link.

### 3.3 Leak mitigations

- Do not load third-party analytics, advertising, chat widgets, fonts, or scripts on the decrypt page.
- Set a restrictive Content Security Policy; avoid `unsafe-inline` and `unsafe-eval` where practical.
- Set `Referrer-Policy: no-referrer`.
- Use HTTPS only.
- Do not place the key in query parameters, API paths, server logs, telemetry, error reports, or crash dumps.
- Link preview bots normally request the URL without the fragment, but messaging platforms may store the full link when a user pastes or sends it. Treat the full link as a secret.
- Browser extensions and injected scripts may access the URL before it is removed.
- Do not include the URL key in copyable server-generated HTML or server-rendered props.

---

## 4. Optional password mode and key derivation

### 4.1 Password representation

When password mode is enabled, convert the password to Unicode NFC, then encode it as UTF-8. Browser and Python implementations MUST use the same normalization rule. Do not trim whitespace or change case.

The password is an additional secret. It MUST NOT be sent to the server or included in any request, telemetry, or log.

### 4.2 Argon2id parameters

Version 1 uses Argon2id version `0x13` with:

| Parameter | Value |
|---|---:|
| Variant | Argon2id |
| Version | `0x13` |
| Memory `m` | 65,536 KiB (64 MiB) |
| Iterations `t` | 3 |
| Parallelism `p` | 4 lanes |
| Output | 32 bytes |
| Salt | 16 random bytes |

These are RFC 9106's second recommended parameter set. A client MUST reject unsupported KDF parameters rather than accepting arbitrary values from untrusted data. Version 1 parameters are fixed; they are not negotiated from server input.

The password salt is public and is stored in the public envelope. It MUST be generated independently and randomly for each drop.

### 4.3 Content-key derivation

Always use HKDF-SHA-256. Generate an independent random 32-byte `kdf_salt` for every drop, whether or not password mode is enabled.

Let `url_key` be the decoded 32-byte URL key.

- **No password:** `IKM = url_key`.
- **Password mode:** `password_key = Argon2id(NFC(password).UTF8, password_salt, m=65536, t=3, p=4, outLen=32)` and `IKM = url_key || password_key`.

Then derive:

```text
content_key = HKDF-SHA-256(
    IKM  = IKM,
    salt = kdf_salt,
    info = UTF8("Ghostdrop/v1/content-encryption-key"),
    L    = 32
)
```

Here HKDF means RFC 5869 Extract-and-Expand using SHA-256. The literal `info` label is exactly the UTF-8 bytes shown, without a terminating NUL.

Both factors are required in password mode. The URL key alone or password alone MUST NOT be sufficient to derive the content key. A wrong password produces a different content key and MUST result in an authentication failure, not partial plaintext.

The server can see that password mode is enabled and can see both salts. The server does not get the password key, URL key, or content key through the intended protocol. If both ciphertext and URL key are obtained, a weak password may be tested offline; users should choose strong passwords.

---

## 5. Public envelope and record format

A drop consists of a **public envelope**, followed by one encrypted header record, followed by zero or more encrypted data records. The backend may store each record as a separate object, but it MUST preserve these logical bytes and indexes.

### 5.1 Public envelope

All envelope fields are public. The envelope is a fixed 49-byte prefix, followed by the optional 16-byte password salt when the password flag is set.

| Offset | Length | Field | Rule |
|---:|---:|---|---|
| 0 | 4 | Magic | ASCII `GSDP` (`47 53 44 50`) |
| 4 | 1 | Version | `0x01` |
| 5 | 1 | Flags | Bit 0 = password mode; bits 1–7 MUST be zero |
| 6 | 4 | Chunk size | BE32; MUST equal `2097152` |
| 10 | 7 | Nonce prefix | 7 random bytes |
| 17 | 32 | KDF salt | 32 random bytes |
| 49 | 16, conditional | Password salt | Present iff flags bit 0 is set |

If password mode is disabled, the envelope length is 49 bytes. If enabled, it is 65 bytes. The password salt MUST NOT be inferred from ciphertext or supplied in another encoding.

The envelope is not itself encrypted. Its fields are authenticated indirectly where used in key derivation, the nonce, or AAD. Implementations MUST validate magic, version, flags, lengths, and fixed constants before processing records.

### 5.2 Record frame

Every encrypted record is framed as:

```text
+----------------------+----------------------------+
| 10-byte frame header | ciphertext || 16-byte tag  |
+----------------------+----------------------------+
```

The frame header is:

| Offset in frame | Length | Field | Rule |
|---:|---:|---|---|
| 0 | 4 | Record index | BE32 |
| 4 | 1 | Record type | `0x00` = encrypted metadata header; `0x01` = data |
| 5 | 1 | Flags | Bit 0 = final record; bits 1–7 MUST be zero |
| 6 | 4 | Plaintext length | BE32; does not include the 16-byte tag |

The ciphertext body has exactly `plaintext_length + 16` bytes. AES-GCM's 16-byte tag is appended directly to ciphertext. The frame header is unencrypted, but the corresponding values are authenticated through AAD. The actual frame length MUST exactly match the declared length plus 16 bytes.

### 5.3 Record sequence

- Record index `0` MUST be the metadata header, type `0x00`.
- Data records have type `0x01` and indexes `1` through `N`, where `N` is the encrypted header's `data_chunk_count`.
- Indexes MUST be contiguous. Duplicate, missing, or out-of-order records MUST cause failure.
- For `N > 0`, the metadata header's final flag MUST be `0`; data record `N` MUST have final flag `1`; all other data records MUST have final flag `0`.
- For a zero-byte file, `N = 0`, the header record itself MUST have final flag `1`, and there are no data records.
- A text secret MUST have exactly one data record, including when the text is empty. Its data record has index `1` and final flag `1`.
- The maximum data chunk count is `2^20`; the maximum record index is therefore `2^20`.

### 5.4 Encrypted metadata plaintext

The plaintext of record 0 MUST be a deterministic/canonical CBOR map as defined by RFC 8949 deterministic encoding. Integer keys are used to avoid string-key ordering ambiguity:

| CBOR key | Type | Meaning |
|---:|---|---|
| `0` | unsigned integer | Content kind: `0` = file, `1` = text |
| `1` | text string | Filename; empty string for text secrets |
| `2` | text string | MIME type; `text/plain` for text secrets |
| `3` | unsigned integer | Exact plaintext size in bytes |
| `4` | unsigned integer | Number of data records |
| `5` | unsigned integer | Metadata schema version; MUST be `1` |

Rules:

- The CBOR map MUST contain exactly keys `0` through `5`, with no duplicate keys or unknown keys in version 1.
- Use deterministic/canonical CBOR encoding. Do not use JSON, language-specific object serialization, or a noncanonical CBOR representation.
- Filename and MIME type are encrypted inside this header. Filenames MUST be valid Unicode normalized to NFC. MIME type MUST be a lowercase ASCII media type without parameters; use `application/octet-stream` when unknown.
- For text, encode the secret as UTF-8, use filename `""`, and MIME type `text/plain`.
- The plaintext size MUST equal the total number of decrypted data bytes.
- The data chunk count MUST match the plaintext size and content kind as described in Section 6.
- Metadata plaintext MUST be at most 65,536 bytes.
- A parser MUST reject unsupported schema versions, invalid UTF-8, invalid metadata types, and inconsistent sizes/counts.

---

## 6. Chunking rules

The data chunk size is exactly 2,097,152 bytes (2 MiB), except the last chunk, which may be smaller. All non-final file data chunks MUST be exactly 2 MiB.

For a file with `S` plaintext bytes:

- If `S = 0`, `N = 0`.
- Otherwise, `N = ceil(S / 2,097,152)`.
- `N` MUST be no greater than `2^20`.
- The sum of all decrypted data-record plaintext lengths MUST equal `S`.
- Each data record length MUST be from 1 to 2,097,152 bytes, except a text secret's sole data record MAY be zero bytes.
- A nonempty file whose size is an exact multiple of the chunk size has a full-sized final chunk.
- The encrypted header record is separate from data chunks and does not count toward `N`.

For a text secret, UTF-8 encode the text and put all bytes in one data record. Reject text larger than 2 MiB. This restriction keeps text secrets single-record and avoids ambiguity around line endings or text normalization of the secret itself. The text payload MUST NOT be Unicode-normalized unless the application explicitly defines that as a user-facing behavior; the default is to preserve the user's string's UTF-8 encoding as provided by the UI.

---

## 7. Nonce construction and uniqueness

### 7.1 Construction

Every record uses a 96-bit nonce:

```text
  7 bytes          4 bytes, BE          1 byte
+---------------+--------------------+-------------+
| nonce_prefix  | record_index       | final_flag  |
+---------------+--------------------+-------------+
```

Formally:

```text
nonce = nonce_prefix || BE32(record_index) || byte(final_flag)
```

`final_flag` is exactly `0x00` for a non-final record and `0x01` for a final record. No other value is valid.

This layout follows the general segmented-nonce idea used in Google Tink's AES-GCM-HKDF Streaming AEAD (random prefix, big-endian segment counter, final-segment byte), but this specification's framing and AAD are its own and are **not compatible with Tink's wire format**.

### 7.2 Uniqueness argument

Within one correctly generated drop, each record index occurs exactly once. For any fixed 7-byte prefix, the tuple `(record_index, final_flag)` is encoded injectively into the final five nonce bytes. Therefore, two different records in that drop have different nonces, including the zero-data-chunk case where the header is final.

This proof depends on the protocol rules: an implementation MUST NOT encrypt different plaintext under the same content key, prefix, index, and final flag. If an upload must be retried, retransmit the exact already-generated frame bytes; do not encrypt again. If content is edited, regenerated, or re-encrypted, generate a fresh URL key, KDF salt, nonce prefix, and password salt (when applicable), and create a new drop.

Random prefix generation alone is not a mathematical guarantee against reuse if an implementation reuses a content key. The operational rule is one content key for one immutable stream, with unique record indexes and one encryption pass. Do not reuse keys across drops.

### 7.3 Limits and overflow

The frame index is a 32-bit unsigned integer, but the version 1 application limit is much lower: at most `2^20` data records, indexes `0..2^20`. An encoder MUST reject an input exceeding the maximum size before starting encryption. It MUST NOT wrap a counter, truncate an index, or continue after overflow. A decoder MUST reject indexes outside the version 1 limit.

AES-GCM nonce uniqueness is critical. See NIST SP 800-38D and RFC 5116. Never change the nonce format or tag length within version 1.

---

## 8. Associated data (AAD)

AAD is constructed identically for every record. `drop_id` is the exact ASCII identifier supplied by the server, not a decoded or normalized variant.

```text
AAD =
    ASCII("Ghostdrop/AEAD/v1") ||
    0x00 ||
    version_byte ||
    BE16(length(drop_id_ascii)) ||
    drop_id_ascii ||
    record_type_byte ||
    BE32(record_index) ||
    final_flag_byte ||
    BE32(plaintext_length) ||
    BE32(chunk_size)
```

Field values:

- `version_byte`: `0x01`.
- `record_type_byte`: `0x00` for metadata header, `0x01` for data.
- `final_flag_byte`: exactly `0x00` or `0x01`, matching the frame and nonce.
- `plaintext_length`: length in bytes before encryption, excluding the tag.
- `chunk_size`: `2097152`.

The fixed label and unambiguous length prefixes provide domain separation and field boundaries. Binding the drop ID prevents a valid record from being moved to another drop. Binding record index and final flag prevents record reordering and final-flag manipulation. The GCM tag authenticates the AAD, ciphertext, and IV's use in the encryption invocation.

A decoder MUST reconstruct AAD from validated frame fields and the requested drop ID; it MUST NOT trust a separately supplied AAD blob.

---

## 9. Server-visible metadata and leakage

### 9.1 Expected server-side fields

The server necessarily sees or stores:

- Drop ID.
- Format version and public envelope bytes.
- Whether password mode is enabled (flags bit 0).
- Nonce prefix, KDF salt, and optional Argon2id salt.
- Chunk size and record indexes/types/final flags.
- Number of records and ciphertext lengths, including tag overhead.
- Total ciphertext bytes and upload/download timing.
- Expiration timestamp and configured maximum views.
- Current server-side view/retrieval count and whether the drop is deleted/expired.
- Creation time, request IP address, user-agent, rate-limit identifiers, or access logs **if the application chooses to collect them**.

The server MUST NOT store plaintext filename, MIME type, plaintext size as a separate plaintext field, URL key, password, Argon2 output, content key, or decrypted content. Filename, MIME type, and plaintext size live only in the encrypted metadata header. The server can still infer approximate or exact plaintext size from ciphertext lengths and chunk count.

### 9.2 Size and timing leakage

Because each GCM record adds 16 tag bytes, the server sees record lengths. It can infer the size of the last chunk and therefore often the exact plaintext size. The encrypted metadata header's ciphertext length also leaks its length approximately. Upload duration, download duration, access time, IP address, and request frequency can reveal user behavior.

Padding to fixed-size records could reduce length leakage, but it increases storage and bandwidth and is not part of version 1. Do not claim metadata anonymity.

### 9.3 View count semantics

The server cannot know whether a client successfully decrypted the content. Therefore, version 1 defines a **view as a successful server-side retrieval authorization**, not a successful decryption. The server MUST atomically reserve/decrement a view before releasing the ciphertext records so concurrent requests cannot exceed the limit. A client that enters the wrong password or has a broken network may still consume a view. This limitation MUST be made clear in the product UI.

---

## 10. Decryption and failure handling

A client MUST NOT present a file as successfully decrypted until the full stream has passed all checks.

Recommended order:

1. Read and strictly parse the public envelope. Reject wrong magic/version, invalid flags, invalid lengths, unsupported constants, or malformed password salt.
2. Read the drop ID from the trusted URL path and validate its allowed ASCII syntax.
3. Parse and strictly validate the 43-character URL key from the fragment, then remove the fragment from the current history entry immediately.
4. If password mode is set, obtain the password, normalize to NFC, UTF-8 encode it, and derive the password key using the exact Argon2id parameters. If not set, do not prompt for a password.
5. Derive the content key using the HKDF procedure in Section 4.
6. Retrieve the record list and verify that indexes, types, lengths, and ordering are structurally valid. Do not trust server-supplied counts over the decrypted header.
7. Decrypt record 0 using the prescribed nonce and AAD. On any tag failure, stop and show a generic “Unable to decrypt this drop” error. Do not reveal whether the key, password, ciphertext, or AAD was wrong.
8. Parse canonical CBOR metadata and validate every field, size, content kind, and expected chunk count.
9. Verify the record sequence is exactly header index 0 plus data indexes `1..N`, with no duplicates, gaps, extras, or reordering. Verify final flags according to Section 5.3.
10. Decrypt every data record with its derived nonce and AAD. Do not release unauthenticated plaintext. If streaming to disk, write to a temporary destination and only finalize/rename it after every record and total size have passed validation.
11. Verify the sum of data plaintext lengths equals the authenticated metadata size, each chunk length is valid, and no data follows the final record.
12. Only then expose the completed plaintext/file to the user.

### 10.1 Tag failure

On any AES-GCM authentication failure, the client MUST stop processing that drop. It MUST NOT display, save, or execute the unauthenticated plaintext from the failing record. Do not attempt to “repair” ciphertext or retry with altered AAD/nonces. Report a generic error to avoid leaking a password oracle through distinct messages.

### 10.2 Missing final record and truncation

The authenticated header declares the expected data chunk count. If any expected record is missing, if the final record is absent, if a non-final record is marked final, if a record follows the final record, or if the server count conflicts with the authenticated header, reject the entire drop. Never treat transport EOF as a valid end-of-file unless it agrees with the authenticated count and final flag.

### 10.3 Refuse conditions

The client MUST refuse: unknown versions; malformed envelope/frame; invalid reserved flag bits; wrong nonce or tag length; oversized metadata; unsupported KDF parameters; incorrect record type/index; duplicate or missing records; invalid canonical CBOR; invalid UTF-8 where required; impossible sizes/counts; chunk overflow; missing final record; extra records; size mismatch; and any tag failure.

---

## 11. Browser WebCrypto and Python compatibility

### 11.1 WebCrypto

Use `crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt", "decrypt"])`. Use a 12-byte IV and `tagLength: 128`.

WebCrypto AES-GCM returns `ciphertext || tag` from `subtle.encrypt`; the 16-byte tag is appended to the ciphertext. The frame's encrypted body stores these bytes unchanged. `subtle.decrypt` expects that combined representation. WebCrypto does not define Argon2id, so use a maintained, audited Argon2id WASM implementation and verify its parameter semantics and test vectors.

For large files, read and encrypt one chunk at a time. Do not buffer the whole file in memory. Metadata is small and encrypted as its own record.

### 11.2 Python

Use a maintained implementation of AES-GCM, for example `cryptography.hazmat.primitives.ciphers.aead.AESGCM`. Its `encrypt(nonce, data, associated_data)` result is `ciphertext || tag`, matching WebCrypto. `decrypt` accepts the same combined bytes. Use a 12-byte nonce and 16-byte tag.

Use a maintained HKDF-SHA-256 implementation matching RFC 5869 and an Argon2id implementation matching RFC 9106. Use a deterministic CBOR library configured for RFC 8949 deterministic encoding.

The Python CLI MUST NOT invent alternate framing, endianness, string normalization, password handling, or metadata serialization. Both implementations MUST consume the same binary fixtures.

---

## 12. Test vectors and conformance

### 12.1 Vector generation requirements

The repository MUST contain versioned, language-neutral fixtures that include:

- URL key bytes and Base64url encoding.
- Password (in a test-only fixture), password salt, Argon2id parameters, Argon2id output, and derived content key for password mode.
- KDF salt, nonce prefix, drop ID, record type/index/final flag, chunk size, plaintext length, exact AAD bytes, nonce bytes, plaintext, and expected ciphertext-plus-tag.
- Public envelope bytes, canonical CBOR metadata bytes, frame header bytes, and full serialized record bytes.
- Expected successful decryption output and expected rejection reason for negative cases.

Fixtures MUST be generated independently or checked against established primitive test vectors. Never generate expected output at runtime using the same implementation being tested.

### 12.2 Fixed AES-GCM/HKDF data-record vector

This vector checks the no-password HKDF path, nonce layout, AAD encoding, and AES-GCM combined output. It is a data record with index 1 and final flag 1; it is not a complete drop.

| Input | Value |
|---|---|
| URL key | `000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f` |
| KDF salt | `a0a1a2a3a4a5a6a7a8a9aaabacadaeafb0b1b2b3b4b5b6b7b8b9babbbcbdbebf` |
| HKDF info | UTF-8 `Ghostdrop/v1/content-encryption-key` |
| Derived AES key | `cd12dd1230882b16941d09612c81fe488bbf7c1bb702d44e893da0a182ec0232` |
| Nonce prefix | `01020304050607` |
| Drop ID (ASCII) | `00112233445566778899aabbccddeeff` |
| Record type | `0x01` |
| Record index | `1` |
| Final flag | `0x01` |
| Chunk size | `2097152` |
| Plaintext | UTF-8 `hello` (`68656c6c6f`) |
| Nonce | `010203040506070000000101` |
| AAD | `47686f737464726f702f414541442f76310001002030303131323233333434353536363737383839396161626263636464656566660100000001010000000500200000` |
| AES-GCM output (`ciphertext || tag`) | `f2012492d7227b9baf5700f382809f4667858db6f9` |

The output is 5 bytes of ciphertext plus a 16-byte tag (21 bytes total). Implementations MUST reproduce it exactly.

### 12.3 Required edge cases

Positive tests:

1. Empty file: metadata header is final, zero data records, size zero.
2. Empty text: one zero-length data record, which is final.
3. One-byte file.
4. Exactly one full 2 MiB chunk.
5. A file exactly two chunks long.
6. A file one byte larger than a full chunk.
7. Last chunk smaller than 2 MiB.
8. Maximum supported file/chunk count boundaries.
9. Password disabled and password enabled.
10. Unicode filename/password with NFC normalization.
11. Text with newline, NUL byte in file content, and arbitrary binary file data.

Negative tests:

1. Flip one bit in ciphertext.
2. Flip one bit in the tag.
3. Flip one bit in AAD-bound fields.
4. Wrong URL key.
5. Wrong password.
6. Wrong drop ID.
7. Reorder two records.
8. Duplicate a record index.
9. Remove a middle record.
10. Remove the final record.
11. Set final flag on a non-final record.
12. Add bytes after the final record.
13. Change declared plaintext length or frame length.
14. Change the metadata chunk count or total size.
15. Invalid magic/version/reserved flags.
16. Malformed Base64url key, wrong key length, malformed CBOR, invalid UTF-8, unsupported KDF values, and counter overflow.

All negative tests MUST fail closed without returning partial plaintext as a successful result.

---

## 13. Security checklist

- [ ] Generate URL keys, salts, and nonce prefixes only with a cryptographically secure random generator.
- [ ] Use AES-256-GCM with 96-bit nonces and 128-bit tags exactly as specified.
- [ ] Never reuse a content key for a second encryption pass.
- [ ] Bind every record to version, drop ID, record type/index, final flag, plaintext length, and chunk size using AAD.
- [ ] Verify the entire stream and final record before treating output as complete.
- [ ] Keep URL key and password out of server requests, logs, analytics, and crash reports.
- [ ] Remove the fragment from the visible URL as early as possible.
- [ ] Avoid third-party scripts on the decryption page and deploy a restrictive CSP.
- [ ] Keep `.env`, production secrets, and test-only passwords out of source control.
- [ ] Enforce upload size, record count, KDF parameter, and rate limits before expensive work.
- [ ] Use constant, generic client-facing decryption errors.
- [ ] Test WebCrypto and Python against the same committed fixtures in CI.
- [ ] Audit the WASM Argon2id dependency and CBOR implementation.
- [ ] Make the malicious-JavaScript limitation explicit to users.
- [ ] Review dependency updates and cryptographic changes; any wire-format change requires a new version and new vectors.

## 14. Known limitations and alternatives

- **Server-delivered JavaScript:** The server can serve malicious code that steals the fragment/password. This is the largest limitation of the browser-only trust model.
- **Password strength:** Argon2id slows guessing but cannot make a weak password strong. If an attacker obtains the URL key too, password guesses can be tested offline against the authenticated ciphertext.
- **Metadata leakage:** Chunk sizes, ciphertext lengths, timing, view count, and IP logs can reveal information. Padding is a possible future-version mitigation.
- **View count:** The server can count retrieval authorizations, not successful decryptions. A wrong password may consume a view.
- **No sender identity:** Anyone with write access to a drop-creation API can create a drop. AES-GCM does not identify the sender.
- **No recovery:** If the URL key or password is lost, the server cannot recover the plaintext.
- **Nonce reuse after implementation bugs:** The construction proves uniqueness within a correctly generated immutable stream, not if an implementation deliberately reuses a key and repeats indexes.
- **Alternatives:** A reviewed, established streaming AEAD such as Google Tink's Streaming AEAD may reduce design burden, but adopting it would require using its format and implementation as specified rather than mixing its nonce design into a custom format. Do not casually substitute a different cipher or KDF under version 1.

---

## 15. Standards and references

- **NIST SP 800-38D**, *Recommendation for Block Cipher Modes of Operation: Galois/Counter Mode (GCM) and GMAC*. Defines GCM, IV requirements, and the importance of IV uniqueness.  
  https://csrc.nist.gov/pubs/sp/800/38/d/final
- **RFC 5116**, *An Interface and Algorithms for Authenticated Encryption*. AEAD interface and nonce requirements.  
  https://www.rfc-editor.org/rfc/rfc5116
- **RFC 5869**, *HMAC-based Extract-and-Expand Key Derivation Function (HKDF)*.  
  https://www.rfc-editor.org/rfc/rfc5869
- **RFC 9106**, *Argon2 Memory-Hard Function for Password Hashing and Proof-of-Work Applications*. Defines Argon2id and recommended parameter sets.  
  https://www.rfc-editor.org/rfc/rfc9106
- **RFC 8949**, *Concise Binary Object Representation (CBOR)*. Use deterministic encoding for metadata interoperability.  
  https://www.rfc-editor.org/rfc/rfc8949
- **RFC 4648**, *The Base16, Base32, and Base64 Data Encodings*. Defines Base64url.  
  https://www.rfc-editor.org/rfc/rfc4648
- **Google Tink**, *AES-GCM-HKDF Streaming AEAD*. Reference for the general segment nonce layout idea; Ghostdrop is not wire-compatible with Tink.  
  https://developers.google.com/tink/streaming-aead/aes_gcm_hkdf_streaming
- **Web Cryptography API**, W3C Recommendation.  
  https://www.w3.org/TR/WebCryptoAPI/
- **Python cryptography documentation**, AEAD interfaces.  
  https://cryptography.io/en/latest/hazmat/primitives/aead/

Before a production release, review this format and its threat model with an independent cryptography reviewer. A format specification and test vectors are necessary but are not a substitute for a security audit.