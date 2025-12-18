/**
 * EXTRACTION PROMPTS
 *
 * Prompts for parsing and extracting structured data.
 * Used for intake chunking and entity extraction.
 */

export const EXTRACTION_PROMPTS = {
  /**
   * CASE_STUDY_EXTRACTION
   * Extract structured case study data from freeform text
   */
  CASE_STUDY_EXTRACTION: `Extract structured case study data from the following text. Return a JSON array where each object has these fields:

- company_name: Name of the client company
- company_type: Type of business (e.g., "Corporate MSP", "ML insights company")
- headcount: Number of employees (e.g., "6", "~8")
- revenue: Revenue if mentioned (e.g., "$1.2M", "$2M")
- location: Location if mentioned
- target_company: If there's a secondary company involved (acquisition target, etc.)
- buyer_name: Primary buyer/champion name
- buyer_title: Buyer's job title
- buyer_persona: Brief description of buyer type
- relationship_origin: How the relationship started
- trigger_event: What triggered the engagement
- stated_need: What they said they needed
- actual_need: What they actually needed
- deliverables: What was delivered
- key_insight: The key insight or proof point from the engagement
- outcome: The business outcome
- differentiator: Why you vs alternatives
- hours: Hours spent if mentioned
- price: Price if mentioned
- match_signals: Characteristics that signal a similar prospect would be a good fit

Return ONLY valid JSON, no explanation.`,

  /**
   * ICP_EXTRACTION
   * Extract structured ICP data from freeform text
   */
  ICP_EXTRACTION: `Extract structured ICP (Ideal Customer Profile) data from the following text. Return a JSON array where each object has these fields:

- summary: One-line summary of the ICP
- fits: Types of companies/personas that fit
- does_not_fit: Types that don't fit (negative signals)
- buyer_persona: Description of the ideal buyer persona
- buyer_description: More detail about the buyer

Return ONLY valid JSON, no explanation.`,

  /**
   * LEAD_EXTRACTION
   * Extract lead data from conversational input
   */
  LEAD_EXTRACTION: `Extract lead/prospect data from the user's message. Return a JSON object:

{
  "company_name": "string or null",
  "contact_name": "string or null",
  "contact_title": "string or null",
  "contact_email": "string or null",
  "source": "string or null (how they met/found this lead)",
  "notes": "string or null (any other context)",
  "confidence": "high|medium|low"
}

If information is not mentioned, use null.
Return ONLY valid JSON.`,

  /**
   * INTENT_CLASSIFICATION
   * Classify user intent into mode
   */
  INTENT_CLASSIFICATION: `Classify the user's intent. Return JSON:

{
  "mode": "ASK" | "BUILD" | "ENRICH",
  "confidence": "high" | "medium" | "low",
  "entities": {
    "company_names": ["list of mentioned companies"],
    "person_names": ["list of mentioned people"],
    "action_words": ["key verbs indicating intent"]
  },
  "reasoning": "brief explanation"
}

Return ONLY valid JSON.`,
};
