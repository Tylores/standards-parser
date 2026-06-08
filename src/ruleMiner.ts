import { Block } from './parser.js';

// Regex to match potential sentence boundaries: punctuation + optional closing quote,
// followed by spacing, followed by a capital letter/quote/parenthesis.
export const BOUNDARY_REGEX = /([.!?]["'”’\)]?)\s+(["'“‘\(]?[A-Z])/g;

// Pattern to check if the text preceding the punctuation ends in a common abbreviation
// or a single letter/digit (e.g. section number or list prefix).
export const ABBREVIATION_PATTERN = /\b(?:e\.g|i\.e|vs|std|fig|no|approx|ref|et\s+al|[A-Za-z]|\d)$/i;

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

  BOUNDARY_REGEX.lastIndex = 0; // reset regex
  let match: RegExpExecArray | null;

  while ((match = BOUNDARY_REGEX.exec(textClean)) !== null) {
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
    BOUNDARY_REGEX.lastIndex = matchStart2;
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

      // Skip heading blocks as they don't contain requirement statements
      if (block.type === "heading") {
        continue;
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
}
