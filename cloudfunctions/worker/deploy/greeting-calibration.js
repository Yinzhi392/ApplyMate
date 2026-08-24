"use strict";

const PLAN_KEYS = Object.freeze([
  "jobTitle",
  "companyName",
  "coreFunctions",
  "domainContext",
  "matchMode",
  "directFactIds",
  "transferableEvidence",
  "supportingFactIds",
  "gaps",
  "paragraphs",
]);

const JD_LIST_KEYS = Object.freeze([
  "responsibilities",
  "hardSkills",
  "experienceEducation",
  "locationWorkMode",
  "availabilityDuration",
]);

const DOMAIN_TERMS = Object.freeze([
  "投研",
  "研报",
  "估值",
  "DCF",
  "尽职调查",
  "并购",
  "SEO",
  "SEM",
  "Google Search Console",
  "Google Analytics",
  "关键词研究",
  "自然搜索",
  "模型评测",
  "Badcase",
  "Prompt",
  "Agent",
  "RAG",
  "合规",
]);

const CONTROLLED_PROFESSIONAL_TERMS = Object.freeze([
  "Excel",
  "PPT",
  "SQL",
  "Python",
  "Power BI",
  "Figma",
  "DCF",
  "WACC",
  "CAPM",
  "Beta",
  "PE/PB",
  "P/E",
  "Google Search Console",
  "Google Analytics",
  "证券从业资格",
]);

const NAMED_ORGANIZATION_PATTERN = /[\p{Script=Han}A-Za-z0-9]{2,24}(?:大学|学院|研究院|有限公司)/gu;

const ORGANIZATION_INTRO_PREFIXES = Object.freeze([
  "本人目前就读于",
  "本人就读于",
  "我目前就读于",
  "我就读于",
  "目前就读于",
  "就读于",
  "我目前是",
  "本人目前是",
  "目前是",
  "我是",
  "本人是",
  "本人来自",
  "我来自",
  "来自",
  "本人毕业于",
  "我毕业于",
  "毕业于",
  "本人任职于",
  "我任职于",
  "任职于",
  "本人供职于",
  "我供职于",
  "供职于",
  "我关注",
  "关注",
  "我申请",
  "我应聘",
  "希望加入",
  "学校是",
  "院校是",
  "毕业院校为",
  "公司是",
  "任职公司为",
]);

const DIRECT_EXPERIENCE_PATTERNS = Object.freeze([
  /(?:独立|实际)?负责过/iu,
  /(?:独立|实际)?开展过/iu,
  /(?:独立|实际)?完成过/iu,
  /(?:独立|实际)?搭建过/iu,
  /(?:独立|实际)?主导过/iu,
  /(?:做过|参与过)/iu,
  /(?:有|拥有|具备).{0,12}(?:经验|实践)/iu,
  /(?:熟悉|熟练|熟练掌握|精通|掌握).{0,20}(?:SEO|SEM|RAG|Agent|尽职调查|并购)/iu,
]);

const NEGATED_DIRECT_PATTERN = /(?:没有|尚未|暂未|并未|不曾|未曾).{0,16}(?:负责过|开展过|完成过|搭建过|主导过|做过|参与过|经验|实践|熟悉|熟练|熟练掌握|精通|掌握)/iu;

const AFFIRMING_NEGATION_PATTERN = /(?:不仅|不但|不是没有|并非没有|不是没|并非没).{0,16}(?:负责过|开展过|完成过|搭建过|主导过|做过|参与过|经验|实践|熟悉|熟练|熟练掌握|精通|掌握)/iu;

function fail(gate) {
  const error = new Error("MODEL_INVALID_OUTPUT");
  error.validationGate = gate;
  throw error;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalized(value) {
  return String(value ?? "")
    .replace(/\s+/gu, "")
    .replace(/[^\p{Letter}\p{Number}+#.]/gu, "")
    .toLowerCase();
}

function bigrams(value) {
  const text = normalized(value);
  if (text.length < 2) return new Set(text ? [text] : []);
  return new Set(Array.from({ length: text.length - 1 }, (_, index) => text.slice(index, index + 2)));
}

function isSupportedPhrase(candidate, source, minimumCoverage = 0.55) {
  const candidateText = normalized(candidate);
  const sourceText = normalized(source);
  if (!candidateText || !sourceText) return false;
  if (sourceText.includes(candidateText)) return true;
  const candidateBigrams = bigrams(candidateText);
  const sourceBigrams = bigrams(sourceText);
  const shared = Array.from(candidateBigrams).filter((token) => sourceBigrams.has(token)).length;
  return candidateBigrams.size > 0 && shared / candidateBigrams.size >= minimumCoverage;
}

function numericTokens(value) {
  return new Set(
    (String(value).match(/\d+(?:[.,]\d+)?%?/gu) || [])
      .map((token) => token.replaceAll(",", "")),
  );
}

function isFaithfulJdExtraction(candidate, source) {
  if (!isSupportedPhrase(candidate, source, 0.25)) return false;
  const unsupportedDomainTerm = DOMAIN_TERMS.some((term) =>
    containsProfessionalTerm(candidate, term) && !containsProfessionalTerm(source, term),
  );
  if (unsupportedDomainTerm) return false;
  const unsupportedProfessionalTerm = CONTROLLED_PROFESSIONAL_TERMS.some((term) =>
    containsProfessionalTerm(candidate, term) && !containsProfessionalTerm(source, term),
  );
  if (unsupportedProfessionalTerm) return false;
  if (extractNamedOrganizations(candidate).some((name) => !isOrganizationSupported(name, source))) {
    return false;
  }
  const sourceNumbers = numericTokens(source);
  return Array.from(numericTokens(candidate)).every((token) => sourceNumbers.has(token));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function containsProfessionalTerm(text, term) {
  if (/\p{Script=Han}/u.test(term)) {
    return normalized(text).includes(normalized(term));
  }
  // OCR commonly joins Latin product terms (for example "AI Agent" ->
  // "AIAgent"). Compare the compact token first, then retain the stricter
  // boundary matcher for ordinary prose.
  const compactTerm = normalized(term);
  const compactText = normalized(text);
  if (compactTerm.length >= 3 && compactText.includes(compactTerm)) return true;
  const termPattern = escapeRegExp(term).replace(/\s+/gu, "\\s*");
  return new RegExp(`(?:^|[^A-Za-z0-9])${termPattern}(?=$|[^A-Za-z0-9])`, "iu").test(text);
}

function completeOrganizationName(value) {
  const candidate = normalized(value);
  const prefix = ORGANIZATION_INTRO_PREFIXES
    .map((item) => normalized(item))
    .find((item) => candidate.startsWith(item));
  return prefix ? candidate.slice(prefix.length) : candidate;
}

function extractNamedOrganizations(value) {
  return (String(value).match(NAMED_ORGANIZATION_PATTERN) || [])
    .map(completeOrganizationName)
    .filter(Boolean);
}

function isOrganizationSupported(candidate, source) {
  const candidateName = completeOrganizationName(candidate);
  return extractNamedOrganizations(source).includes(candidateName);
}

function stringArray(value, minimum, maximum, gate) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) fail(gate);
  const result = value.map((item) => typeof item === "string" ? item.trim() : "");
  if (result.some((item) => !item)) fail(gate);
  return result;
}

function collectGreetingFactIds(plan) {
  return Array.from(new Set([
    ...(Array.isArray(plan?.directFactIds) ? plan.directFactIds : []),
    ...(Array.isArray(plan?.transferableEvidence)
      ? plan.transferableEvidence.map((item) => item?.factId)
      : []),
    ...(Array.isArray(plan?.supportingFactIds) ? plan.supportingFactIds : []),
  ].filter((item) => typeof item === "string" && item)));
}

function normalizeGreetingPlan(input, { facts, jd, rawJdText }) {
  if (!isPlainObject(input)) fail("match_plan_schema");
  const responseKeys = new Set([
    ...PLAN_KEYS,
    "responsibilities",
    "hardSkills",
    "experienceEducation",
    "locationWorkMode",
    "availabilityDuration",
  ]);
  if (
    PLAN_KEYS.some((key) => !(key in input)) ||
    Object.keys(input).some((key) => !responseKeys.has(key))
  ) fail("match_plan_keys");
  if (typeof input.jobTitle !== "string" || typeof input.companyName !== "string") {
    fail("target_field_type");
  }

  const factIds = new Set(facts.map(({ factId }) => factId));
  if (typeof rawJdText !== "string" || !rawJdText.trim()) fail("raw_jd_missing");
  const rawNormalized = normalized(rawJdText);
  const extractedJobTitle = jd.jobTitle?.text;
  const extractedCompanyName = jd.companyName?.text;
  const trustedJobTitle = typeof extractedJobTitle === "string" &&
    rawNormalized.includes(normalized(extractedJobTitle))
    ? extractedJobTitle
    : "该岗位";
  const trustedCompanyName = typeof extractedCompanyName === "string" &&
    rawNormalized.includes(normalized(extractedCompanyName))
    ? extractedCompanyName
    : "";
  if (trustedJobTitle === "该岗位") delete jd.jobTitle;
  if (!trustedCompanyName) delete jd.companyName;
  // Auxiliary extraction fields are suggestions, not all-or-nothing output.
  // Drop an ungrounded field before it can be cited; only a field selected as
  // a core function is allowed to decide whether the generation must fail.
  const originalJdLists = new Map();
  const trustedIndexMaps = new Map();
  for (const key of JD_LIST_KEYS) {
    const original = Array.isArray(jd[key]) ? jd[key] : [];
    const trusted = [];
    const indexMap = new Map();
    original.forEach((field, originalIndex) => {
      if (field && typeof field.text === "string" && isFaithfulJdExtraction(field.text, rawJdText)) {
        indexMap.set(originalIndex, trusted.length);
        trusted.push(field);
      }
    });
    originalJdLists.set(key, original);
    trustedIndexMaps.set(key, indexMap);
    jd[key] = trusted;
  }
  const proposedCoreFunctions = Array.isArray(input.coreFunctions)
    ? input.coreFunctions.slice(0, 5)
    : [];
  let coreFunctions = proposedCoreFunctions.flatMap((item) => {
    if (
      !isPlainObject(item) ||
      !JD_LIST_KEYS.includes(item.requirementType) ||
      !Number.isInteger(item.requirementIndex) ||
      typeof item.summary !== "string" ||
      !item.summary.trim()
    ) return [];
    const originalRequirement = originalJdLists.get(item.requirementType)?.[item.requirementIndex];
    const trustedIndex = trustedIndexMaps.get(item.requirementType)?.get(item.requirementIndex);
    return !originalRequirement || trustedIndex === undefined ||
      !isSupportedPhrase(item.summary, originalRequirement.text, 0.35)
      ? []
      : [{
          requirementType: item.requirementType,
          requirementIndex: trustedIndex,
          summary: item.summary.trim(),
        }];
  });
  if (coreFunctions.length === 0) {
    coreFunctions = JD_LIST_KEYS.flatMap((requirementType) =>
      (Array.isArray(jd[requirementType]) ? jd[requirementType] : [])
        .map((field, requirementIndex) => ({
          requirementType,
          requirementIndex,
          summary: field.text.slice(0, 120),
        })),
    ).slice(0, 2);
  }
  if (coreFunctions.length === 0) {
    const fallbackText = rawJdText.replace(/\s+/gu, " ").trim().slice(0, 200);
    jd.responsibilities = [{
      fieldId: "jd_fallback_raw_input",
      text: fallbackText,
      confidence: 0.5,
    }];
    coreFunctions = [{
      requirementType: "responsibilities",
      requirementIndex: 0,
      summary: "岗位相关职责与要求",
    }];
  }
  const coreFunctionReferences = coreFunctions.map(
    ({ requirementType, requirementIndex }) => `${requirementType}:${requirementIndex}`,
  );
  if (new Set(coreFunctionReferences).size !== coreFunctionReferences.length) {
    fail("core_function_duplicate");
  }

  const directFactIds = stringArray(input.directFactIds, 0, 4, "direct_fact_ids");
  const supportingFactIds = stringArray(input.supportingFactIds, 0, 4, "supporting_fact_ids");
  const transferableEvidence = Array.isArray(input.transferableEvidence)
    ? input.transferableEvidence
    : fail("transferable_evidence");
  if (transferableEvidence.length > 4 || transferableEvidence.some((item) =>
    !isPlainObject(item) ||
    typeof item.factId !== "string" ||
    typeof item.capability !== "string" ||
    !item.capability.trim() ||
    !["transferable", "foundation"].includes(item.wordingStrength)
  )) fail("transferable_evidence");

  const allFactIds = [
    ...directFactIds,
    ...transferableEvidence.map(({ factId }) => factId),
    ...supportingFactIds,
  ];
  if (new Set(allFactIds).size !== allFactIds.length) fail("fact_tier_duplicate");
  if (allFactIds.some((factId) => !factIds.has(factId))) fail("fact_source");

  const matchMode = input.matchMode;
  if (!["strong", "partial", "low"].includes(matchMode)) fail("match_mode");
  const gaps = stringArray(input.gaps, 0, 5, "gaps");
  if (matchMode === "strong" && directFactIds.length === 0) fail("strong_without_direct");
  if (matchMode === "partial" && (transferableEvidence.length === 0 || gaps.length === 0)) {
    fail("partial_without_transfer");
  }
  if (
    matchMode === "low" &&
    (directFactIds.length > 0 ||
      transferableEvidence.some(({ wordingStrength }) => wordingStrength !== "foundation") ||
      (supportingFactIds.length === 0 && transferableEvidence.length === 0) ||
      gaps.length === 0)
  ) fail("low_evidence_invalid");

  const replaceTarget = (value, candidates, fallback) => candidates.reduce(
    (result, candidate) => typeof candidate === "string" && candidate.trim()
      ? result.split(candidate.trim()).join(fallback)
      : result,
    value,
  );
  const paragraphs = stringArray(input.paragraphs, 2, 5, "paragraph_count")
    .map((paragraph) => replaceTarget(
      replaceTarget(
        paragraph,
        trustedJobTitle === "该岗位" ? [input.jobTitle, extractedJobTitle] : [input.jobTitle],
        trustedJobTitle,
      ),
      trustedCompanyName ? [input.companyName] : [input.companyName, extractedCompanyName],
      trustedCompanyName || "贵司",
    ));
  const domainContext = stringArray(input.domainContext, 0, 4, "domain_context")
    .filter((item) => rawNormalized.includes(normalized(item)));

  return {
    jobTitle: trustedJobTitle,
    companyName: trustedCompanyName,
    coreFunctions,
    domainContext,
    matchMode,
    directFactIds,
    transferableEvidence: transferableEvidence.map(({ factId, capability, wordingStrength }) => ({
      factId,
      capability: capability.trim(),
      wordingStrength,
    })),
    supportingFactIds,
    gaps,
    paragraphs,
  };
}

function assertDomainTermsSupported(body, { jdText, factTexts }) {
  const source = normalized([jdText, ...factTexts].join("\n"));
  for (const term of DOMAIN_TERMS) {
    if (normalized(body).includes(normalized(term)) && !source.includes(normalized(term))) {
      fail("cross_jd_domain_term");
    }
  }
}

function assertNamedTermsSupported(body, { companyName, factTexts }) {
  const factSource = factTexts.join("\n");
  const organizationSource = [companyName, ...factTexts].join("\n");
  const controlledTerms = CONTROLLED_PROFESSIONAL_TERMS.filter((term) =>
    containsProfessionalTerm(body, term),
  );
  const namedOrganizations = body.match(NAMED_ORGANIZATION_PATTERN) || [];
  for (const term of controlledTerms) {
    if (!containsProfessionalTerm(factSource, term)) fail("unsupported_professional_term");
  }
  for (const organization of namedOrganizations) {
    if (!isOrganizationSupported(organization, organizationSource)) {
      fail("unsupported_organization");
    }
  }
}

function blockedTermsFromGaps(gaps) {
  const gapText = normalized(gaps.join("\n"));
  return DOMAIN_TERMS.filter((term) => gapText.includes(normalized(term)));
}

function assertParagraphWording(paragraph, tier, blockedTerms) {
  if (tier === "direct") return;
  for (const clause of paragraph.split(/[。！？!?；;，,:：]/u).map((item) => item.trim()).filter(Boolean)) {
    const mentionsBlockedTerm = blockedTerms.some((term) =>
      normalized(clause).includes(normalized(term)),
    );
    if (
      mentionsBlockedTerm &&
      DIRECT_EXPERIENCE_PATTERNS.some((pattern) => pattern.test(clause)) &&
      (AFFIRMING_NEGATION_PATTERN.test(clause) || !NEGATED_DIRECT_PATTERN.test(clause))
    ) {
      fail("evidence_strength_mismatch");
    }
  }
}

function evidenceTierForFact(plan, factId) {
  if (plan.directFactIds.includes(factId)) return "direct";
  if (plan.transferableEvidence.some((item) => item.factId === factId)) return "transferable";
  return "supporting";
}

module.exports = {
  PLAN_KEYS,
  assertDomainTermsSupported,
  assertNamedTermsSupported,
  assertParagraphWording,
  blockedTermsFromGaps,
  collectGreetingFactIds,
  evidenceTierForFact,
  normalizeGreetingPlan,
};
