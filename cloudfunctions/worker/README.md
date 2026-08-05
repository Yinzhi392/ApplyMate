# Worker Cloud Function

This asynchronous function owns document extraction, Tencent OCR, deterministic masking, TokenHub text calls, parsing, generation, rewriting, and quality gates. Phase 5 implements and tests DOCX/PDF extraction, a Tencent OCR provider contract, a mandatory masking gateway, strict structured-resume parsing with one fallback, and the four-input resume pipeline.

The OCR and model implementations remain injected local substitutes. No Tencent credentials, TokenHub client, CloudBase repository, deployed handler, or real external request exists yet.
