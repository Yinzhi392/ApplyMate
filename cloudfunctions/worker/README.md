# Worker Cloud Function

This asynchronous function owns document extraction, Tencent OCR, deterministic masking, TokenHub text calls, parsing, generation, rewriting, and quality gates. Phase 6 adds ordered JD OCR/text parsing, strict `JobDescription` output, a masked text-only greeting context, primary/fallback model behavior, one correction attempt, and deterministic greeting checks. Provider logs contain only metadata and hashes.

The OCR and model implementations remain injected local substitutes. No Tencent credentials, TokenHub client, CloudBase repository, deployed handler, or real external request exists yet.
