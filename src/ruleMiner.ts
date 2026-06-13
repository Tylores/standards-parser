import { Block } from './parser.js';
import { askLLM } from './llm.js';

// Regex to match potential sentence boundaries: punctuation + optional closing quote,
// followed by spacing, followed by a capital letter/quote/parenthesis.
export const BOUNDARY_REGEX = /([.!?]["'”’\)]?)\s+(["'“‘\(]?[A-Z])/g;

// Pattern to check if the text preceding the punctuation ends in a common abbreviation.
export const ABBREVIATION_PATTERN = /\b(?:e\.g|i\.e|vs|std|fig|no|approx|ref|et\s+al)$/i;

// Rule keyword definitions with word boundaries
export const RULE_PATTERNS: Record<string, RegExp[]> = {
  Prohibition: [
    /\bshall\s+not\b/i,
    /\bmust\s+not\b/i,
    /\bshould\s+not\b/i
  ],
  Mandatory: [
    /\bshall\b/i,
    /\bmust\b/i
  ],
  Recommendation: [
    /\bshould\b/i
  ],
  Permission: [
    /\bmay\b/i
  ]
};

export function splitSentences(text: string): string[] {
  if (!text) {
    return [];
  }

  // Replace newlines with spaces for sentence processing
  const textClean = text.replace(/\n/g, ' ');

  const sentences: string[] = [];
  let startIdx = 0;

  // Create a local thread-safe instance of the stateful global regex
  const localBoundaryRegex = new RegExp(BOUNDARY_REGEX.source, BOUNDARY_REGEX.flags);
  let match: RegExpExecArray | null;

  while ((match = localBoundaryRegex.exec(textClean)) !== null) {
    const matchStart1 = match.index;
    const precedingText = textClean.slice(startIdx, matchStart1).trim();

    // Check if the preceding text ends with an abbreviation or single letter/digit
    if (ABBREVIATION_PATTERN.test(precedingText)) {
      continue;
    }

    // Found a valid sentence boundary
    const matchEnd1 = match.index + match[1].length;
    const sentence = textClean.slice(startIdx, matchEnd1).trim();
    sentences.push(sentence);

    // Next sentence starts at the capital letter/quote/paren
    const matchStart2 = match.index + match[0].length - match[2].length;
    startIdx = matchStart2;

    // Advance global search position to avoid getting stuck or skipping parts
    localBoundaryRegex.lastIndex = matchStart2;
  }

  // Append any remaining text
  const remaining = textClean.slice(startIdx).trim();
  if (remaining) {
    sentences.push(remaining);
  }

  return sentences;
}

export interface Rule {
  id: string;
  section_number: string;
  parent_hierarchy: string[];
  heading_context: string[];
  constraint_type: "Prohibition" | "Mandatory" | "Recommendation" | "Permission";
  all_matched_constraints: string[];
  text: string;
  source_block_id: string;
  page_number: number;
}

export class RuleMiner {
  private reqCounter: number;
  private lastValidSection: string;

  constructor(startId = 1) {
    this.reqCounter = startId;
    this.lastValidSection = "UNKNOWN";
  }

  mineRules(blocks: Block[]): Rule[] {
    const ledger: Rule[] = [];

    for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
      const block = blocks[blockIdx];
      let sectionNumber = block.section_number;

      if (!sectionNumber || sectionNumber === "0.0" || sectionNumber.trim() === "") {
        // Fallback to the last known valid section, or use "UNKNOWN"
        sectionNumber = this.lastValidSection;
      } else {
        this.lastValidSection = sectionNumber;
      }

      // Skip heading blocks unless they contain requirement statements (misclassified paragraphs)
      if (block.type === "heading") {
        const hasConstraints = block.text ? this.analyzeSentence(block.text).length > 0 : false;
        if (!hasConstraints) {
          continue;
        }
      }

      const blockText = block.text;
      if (!blockText) {
        continue;
      }

      // Split paragraph/list/table into individual sentences
      const sentences = splitSentences(blockText);

      for (const sentence of sentences) {
        try {
          const matchedConstraints = this.analyzeSentence(sentence);
          if (matchedConstraints.length > 0) {
            // Determine dominant constraint type
            // Precedence: Prohibition > Mandatory > Recommendation > Permission
            let dominantType: "Prohibition" | "Mandatory" | "Recommendation" | "Permission" = "Permission";
            for (const cType of ["Prohibition", "Mandatory", "Recommendation"] as const) {
              if (matchedConstraints.includes(cType)) {
                dominantType = cType;
                break;
              }
            }

            const reqId = `REQ-${this.reqCounter.toString().padStart(3, '0')}`;
            this.reqCounter++;

            ledger.push({
              id: reqId,
              section_number: sectionNumber,
              parent_hierarchy: [...block.parent_hierarchy],
              heading_context: [...block.heading_context],
              constraint_type: dominantType,
              all_matched_constraints: matchedConstraints,
              text: sentence,
              source_block_id: block.id,
              page_number: block.page_number
            });
          }
        } catch (e: any) {
          // Silent or log error
          console.error(`Error parsing text line for rules in block ${block.id}: ${e.message}`);
        }
      }
    }

    return ledger;
  }

  private analyzeSentence(sentence: string): string[] {
    const matches: string[] = [];
    for (const [cType, patterns] of Object.entries(RULE_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(sentence)) {
          matches.push(cType);
          break; // Found match for this constraint category, move to next category
        }
      }
    }
    return matches;
  }

  async mineImplicitRules(
    blocks: Block[],
    existingRules: Rule[],
    ctx: any,
    signal?: AbortSignal
  ): Promise<Rule[]> {
    const matchedBlockIds = new Set(existingRules.map(r => r.source_block_id));
    const candidateBlocks = blocks.filter(b => {
      if (b.type === "heading" || b.type === "table") return false;
      if (matchedBlockIds.has(b.id)) return false;
      return /\b(required|mandatory|ensure|strictly|necessary|obligation|responsible|is\s+to|are\s+to|has\s+to|have\s+to)\b/i.test(b.text);
    });

    if (candidateBlocks.length === 0) {
      return [];
    }

    const batchSize = 8;
    const implicitRules: Rule[] = [];

    for (let i = 0; i < candidateBlocks.length; i += batchSize) {
      if (signal?.aborted) {
        throw new Error("Implicit requirement mining aborted by user request.");
      }
      const batch = candidateBlocks.slice(i, i + batchSize);
      const batchPromptBlocks = batch.map(b => ({
        id: b.id,
        section: b.section_number,
        text: b.text
      }));

      const systemPrompt = `You are an expert systems engineer and compliance analyst.
Your task is to analyze technical document text blocks and extract any compliance requirements, obligations, or design constraints that are NOT matched by simple keyword regexes (such as shall/must/should/may).

For each extracted requirement, you must return:
1. "blockId": The ID of the block the requirement was extracted from.
2. "constraintType": The severity/type of the requirement:
   - "Mandatory" (if it is a strict requirement, e.g. "is required to", "is mandatory", "strictly necessary")
   - "Prohibition" (if it is strictly forbidden)
   - "Recommendation" (if it is a strong recommendation, e.g. "is recommended", "ought to")
   - "Permission" (if it is allowed/optional, e.g. "is permitted", "can optionally")
3. "requirementText": The exact sentence or a slightly cleaned sentence containing the requirement.

Output must be a JSON array of objects with fields "blockId", "constraintType", and "requirementText".
If no requirements are found in the blocks, return an empty array [].
Respond with valid JSON ONLY. Do not wrap in markdown or backticks.`;

      const userPrompt = `Here are the candidate text blocks to analyze:\n\n${JSON.stringify(batchPromptBlocks, null, 2)}`;

      try {
        const text = await askLLM({ systemPrompt, userPrompt, signal }, ctx);
        if (!text) {
          console.warn("No LLM context/keys found or LLM failed. Skipping implicit requirement mining.");
          break;
        }

        let cleanText = text.trim();
        if (cleanText.startsWith("```json")) {
          cleanText = cleanText.substring(7);
        } else if (cleanText.startsWith("```")) {
          cleanText = cleanText.substring(3);
        }
        if (cleanText.endsWith("```")) {
          cleanText = cleanText.substring(0, cleanText.length - 3);
        }

        const parsed = JSON.parse(cleanText.trim());
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            const blockId = item.blockId;
            const originalBlock = batch.find(b => b.id === blockId);
            if (!originalBlock) continue;

            const cType = item.constraintType;
            const validTypes = ["Prohibition", "Mandatory", "Recommendation", "Permission"];
            if (!validTypes.includes(cType)) continue;

            const reqText = item.requirementText;
            if (!reqText || typeof reqText !== "string") continue;

            const reqId = `REQ-${this.reqCounter.toString().padStart(3, '0')}`;
            this.reqCounter++;

            implicitRules.push({
              id: reqId,
              section_number: originalBlock.section_number || "UNKNOWN",
              parent_hierarchy: [...originalBlock.parent_hierarchy],
              heading_context: [...originalBlock.heading_context],
              constraint_type: cType as any,
              all_matched_constraints: ["LLM_EXTRACTED"],
              text: reqText,
              source_block_id: originalBlock.id,
              page_number: originalBlock.page_number
            });
          }
        }
      } catch (err: any) {
        console.error(`Failed to mine implicit rules for batch starting at index ${i}:`, err.message);
      }
    }

    return implicitRules;
  }

  async mineTabularRules(
    blocks: Block[],
    ctx: any,
    signal?: AbortSignal
  ): Promise<Rule[]> {
    if (!ctx) return [];
    
    const tableBlocks = blocks.filter(b => b.type === "table");
    if (tableBlocks.length === 0) return [];

    const batchSize = 5;
    const tabularRules: Rule[] = [];

    for (let i = 0; i < tableBlocks.length; i += batchSize) {
      if (signal?.aborted) {
        throw new Error("Tabular rule mining aborted by user request.");
      }
      const batch = tableBlocks.slice(i, i + batchSize);
      const batchPromptBlocks = batch.map(b => ({
        id: b.id,
        section: b.section_number,
        page: b.page_number,
        text: b.text
      }));

      const systemPrompt = `You are an expert systems engineer and compliance analyst.
Your task is to analyze technical document table blocks and extract any compliance requirements, design limits, configuration defaults, state constraints, or protocol parameters defined in them.

For each extracted requirement, you must return:
1. "blockId": The ID of the table block the requirement was extracted from.
2. "constraintType": The severity/type of the requirement:
   - "Mandatory" (strict requirement/limit, e.g. "The default timeout is 10 seconds")
   - "Prohibition" (forbidden state/value)
   - "Recommendation" (preferred default/option)
   - "Permission" (optional choice)
3. "requirementText": A clear, self-contained sentence describing the requirement/limit. Make sure to specify the actor, parameters, and context so the sentence makes sense out-of-context (e.g. "In Section 4.6, the Response Server default port limit is 443.").

Output must be a JSON array of objects with fields "blockId", "constraintType", and "requirementText".
If no requirements are found in the tables, return an empty array [].
Respond with valid JSON ONLY. Do not wrap in markdown or backticks.`;

      const userPrompt = `Here are the table blocks to analyze:\n\n${JSON.stringify(batchPromptBlocks, null, 2)}`;

      try {
        const text = await askLLM({ systemPrompt, userPrompt, signal }, ctx);
        if (!text) continue;

        let cleanText = text.trim();
        if (cleanText.startsWith("```json")) {
          cleanText = cleanText.substring(7);
        } else if (cleanText.startsWith("```")) {
          cleanText = cleanText.substring(3);
        }
        if (cleanText.endsWith("```")) {
          cleanText = cleanText.substring(0, cleanText.length - 3);
        }

        const parsed = JSON.parse(cleanText.trim());
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            const blockId = item.blockId;
            const originalBlock = batch.find(b => b.id === blockId);
            if (!originalBlock) continue;

            const cType = item.constraintType;
            const validTypes = ["Prohibition", "Mandatory", "Recommendation", "Permission"];
            if (!validTypes.includes(cType)) continue;

            const reqText = item.requirementText;
            if (!reqText || typeof reqText !== "string") continue;

            const reqId = `REQ-${this.reqCounter.toString().padStart(3, '0')}`;
            this.reqCounter++;

            tabularRules.push({
              id: reqId,
              section_number: originalBlock.section_number || "UNKNOWN",
              parent_hierarchy: [...originalBlock.parent_hierarchy],
              heading_context: [...originalBlock.heading_context],
              constraint_type: cType as any,
              all_matched_constraints: ["LLM_TABULAR_EXTRACTED"],
              text: reqText,
              source_block_id: originalBlock.id,
              page_number: originalBlock.page_number
            });
          }
        }
      } catch (err: any) {
        console.error(`Failed to mine tabular rules for batch starting at index ${i}:`, err.message);
      }
    }

    return tabularRules;
  }
}

export async function filterBoilerplateRules(
  rules: Rule[],
  ctx: any,
  signal?: AbortSignal
): Promise<Rule[]> {
  if (rules.length === 0 || !ctx) return rules;

  const boilerplateIds = new Set<string>();
  const batchSize = 100;

  for (let i = 0; i < rules.length; i += batchSize) {
    if (signal?.aborted) {
      throw new Error("Boilerplate filtering aborted by user request.");
    }
    const batch = rules.slice(i, i + batchSize);
    const batchPromptData = batch.map(r => ({
      id: r.id,
      page: r.page_number,
      text: r.text
    }));

    const systemPrompt = `You are an expert Technical Standards Compliance Auditor.
Your task is to identify requirements in the provided list that represent LEGAL BOILERPLATE, COPYRIGHT NOTICES, PATENT DISCLAIMERS, STANDARDS ORGANIZATION DISCLAIMERS, PARTICIPANTS, COMMITTEE MEMBERSHIP, or news releases rather than technical/engineering compliance requirements of the standard itself.

Examples of boilerplate to flag:
- "No part of this publication may be reproduced..."
- "Use by artificial intelligence systems In no event..."
- "Any person utilizing any IEEE Standards document should rely upon their own independent judgment..."
- "At lectures, symposia, seminars, or educational courses..."
- "The Working Group gratefully acknowledges the contributions..."
- "Suggestions for changes in documents should be in the form of..."

Return a JSON array containing only the "id" values of the requirements that are boilerplate/irrelevant and should be removed.
Respond with valid JSON ONLY. Do not wrap in markdown or backticks. If none are boilerplate, return [].`;

    const userPrompt = `Here are the candidate requirements to check:\n\n${JSON.stringify(batchPromptData, null, 2)}`;

    try {
      const text = await askLLM({ systemPrompt, userPrompt, signal }, ctx);
      if (!text) continue;

      let cleanText = text.trim();
      if (cleanText.startsWith("```json")) {
        cleanText = cleanText.substring(7);
      } else if (cleanText.startsWith("```")) {
        cleanText = cleanText.substring(3);
      }
      if (cleanText.endsWith("```")) {
        cleanText = cleanText.substring(0, cleanText.length - 3);
      }

      const parsed = JSON.parse(cleanText.trim());
      if (Array.isArray(parsed)) {
        for (const id of parsed) {
          if (typeof id === 'string') {
            boilerplateIds.add(id);
          }
        }
      }
    } catch (err: any) {
      console.error("Failed to filter boilerplate rules batch via LLM:", err.message);
    }
  }

  const filtered = rules.filter(r => !boilerplateIds.has(r.id));
  console.error(`Filtered out ${boilerplateIds.size} boilerplate requirements. Mined requirements left: ${filtered.length}`);
  return filtered;
}

