import { PDFParse } from 'pdf-parse';
import { readFileSync } from 'node:fs';

// Regex to match headings like:
// "1.0 Introduction to ESI"
// "4.1.2 Physical layer"
// "Annex A (informative) - Title"
// "A.1 General"
export const HEADING_REGEX = /^\s*((?:Annex\s+[A-Z](?:\.\d+)*|\d+(?:\.\d+)*|[A-Z](?:\.\d+)*))\.?\s+([a-zA-Z\d_\(\)\"\'“‘].*)$/i;

// Regex to match list items like "• Bullet", "1) First", "a. Item"
export const LIST_PREFIX_REGEX = /^\s*(•|[*+-]|\b\d+[\.\)]|\b[a-zA-Z][\.\)]|\(\d+\)|\([a-zA-Z]\))\s+(.*)$/;

export function normalizeSection(secNum: string): string {
  const clean = secNum.trim().replace(/^Annex\s+/i, '');
  const parts = clean.split('.');
  while (parts.length > 1 && parts[parts.length - 1] === '0') {
    parts.pop();
  }
  return parts.join('.');
}

export function isAncestorSection(ancestor: string, descendent: string): boolean {
  const aParts = ancestor.split('.');
  const dParts = descendent.split('.');
  if (aParts.length >= dParts.length) return false;
  return aParts.every((part, idx) => dParts[idx] === part);
}

export function isTableRow(line: string): boolean {
  const lineStrip = line.trim();
  if (lineStrip.includes('|')) {
    return true;
  }
  const parts = lineStrip.split(/\s{3,}/);
  return parts.length >= 2 && parts.every(p => p.length > 0);
}

export function cleanPageLines(lines: string[], cleanHeaders?: string[]): string[] {
  const cleaned: string[] = [];
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const lineStr = line.trim();
    if (!lineStr) {
      cleaned.push("");
      continue;
    }

    // Never clean a line that matches the HEADING_REGEX
    if (HEADING_REGEX.test(lineStr)) {
      cleaned.push(line);
      continue;
    }

    // Check if line consists solely of a page number (digits or Roman numerals)
    if (/^(?:\d+|[ivxldcmIVXLDCM]+)$/.test(lineStr)) {
      if (idx <= 2 || idx >= lines.length - 3) {
        continue;
      }
    }

    // Check for common running headers/footers
    const lowerLine = lineStr.toLowerCase();
    let isHeader = false;

    if (cleanHeaders && cleanHeaders.length > 0) {
      for (const h of cleanHeaders) {
        if (lowerLine.includes(h.toLowerCase())) {
          isHeader = true;
          break;
        }
      }
    } else {
      if (
        lowerLine.includes("energy services interface") ||
        lowerLine.includes("ieee std") ||
        lowerLine.includes("prepared by")
      ) {
        isHeader = true;
      }
    }

    if (isHeader) {
      if (idx <= 2 || idx >= lines.length - 3) {
        continue;
      }
    }

    cleaned.push(line);
  }
  return cleaned;
}

export interface Block {
  id: string;
  type: "heading" | "list_item" | "table" | "paragraph";
  text: string;
  section_number: string;
  parent_hierarchy: string[];
  heading_context: string[];
  page_number: number;
  prefix?: string;
  rows?: string[];
}

export interface TreeNode {
  title: string;
  section: string;
  type: "root" | "section";
  children: TreeNode[];
  content: Block[];
}

export class PDFParser {
  private pdfPath: string;
  private cleanHeaders?: string[];

  constructor(pdfPath: string, cleanHeaders?: string[]) {
    this.pdfPath = pdfPath;
    this.cleanHeaders = cleanHeaders;
  }

  async getSampleText(signal?: AbortSignal): Promise<string> {
    let pdfParser: PDFParse | null = null;
    try {
      if (signal?.aborted) {
        throw new Error("PDF parsing aborted by user request.");
      }
      const data = readFileSync(this.pdfPath);
      pdfParser = new PDFParse({ data });
      if (signal?.aborted) {
        throw new Error("PDF parsing aborted by user request.");
      }
      const textResult = await pdfParser.getText();
      // Concatenate the first few pages to detect standard type
      return (textResult.pages || []).slice(0, 3).map((p: any) => p.text || "").join("\n");
    } catch (err: any) {
      if (err.message === "PDF parsing aborted by user request.") {
        throw err;
      }
      return "";
    } finally {
      if (pdfParser) {
        await pdfParser.destroy().catch(() => {});
      }
    }
  }

  async parse(signal?: AbortSignal): Promise<Block[]> {
    const pagesLinesAndTypes: Array<[number, string, string, any]> = [];
    let pdfParser: PDFParse | null = null;

    try {
      if (signal?.aborted) {
        throw new Error("PDF parsing aborted by user request.");
      }
      const data = readFileSync(this.pdfPath);
      pdfParser = new PDFParse({ data });
      if (signal?.aborted) {
        throw new Error("PDF parsing aborted by user request.");
      }
      const textResult = await pdfParser.getText();

      for (const page of textResult.pages) {
        if (signal?.aborted) {
          throw new Error("PDF parsing aborted by user request.");
        }
        const pageNum = page.num;
        const text = page.text;
        if (!text) continue;

        const rawLines = text.split('\n');
        const cleanedLines = cleanPageLines(rawLines, this.cleanHeaders);

        for (const line of cleanedLines) {
          if (signal?.aborted) {
            throw new Error("PDF parsing aborted by user request.");
          }
          const lineStr = line.trim();
          if (!lineStr) {
            pagesLinesAndTypes.push([pageNum, "", "empty", null]);
            continue;
          }

          // Match Heading
          const headingMatch = HEADING_REGEX.exec(lineStr);
          if (headingMatch) {
            pagesLinesAndTypes.push([pageNum, lineStr, "heading", [headingMatch[1], headingMatch[2]]]);
            continue;
          }

          // Match List
          const listMatch = LIST_PREFIX_REGEX.exec(lineStr);
          if (listMatch) {
            pagesLinesAndTypes.push([pageNum, lineStr, "list_item", [listMatch[1], listMatch[2]]]);
            continue;
          }

          // Match Table
          if (isTableRow(lineStr)) {
            pagesLinesAndTypes.push([pageNum, lineStr, "table_row", null]);
            continue;
          }

          // Fallback to normal text
          pagesLinesAndTypes.push([pageNum, lineStr, "text", null]);
        }
      }
    } catch (e: any) {
      if (e.message === "PDF parsing aborted by user request.") {
        throw e;
      }
      throw new Error(`Error reading PDF page contents: ${e.message}`);
    } finally {
      if (pdfParser) {
        await pdfParser.destroy().catch(() => {});
      }
    }

    return this.assembleBlocks(pagesLinesAndTypes);
  }

  private assembleBlocks(linesInfo: Array<[number, string, string, any]>): Block[] {
    const blocks: Block[] = [];
    let currentBlock: any = null;

    // Hierarchy state
    const activeSections: Record<string, [string, string]> = {};
    let currentSection = "0.0";
    let currentParents: string[] = [];
    let currentContext = ["Document Root"];

    let blockIdCounter = 1;

    for (const [pageNum, lineStr, lineType, groups] of linesInfo) {
      if (lineType === "empty") {
        if (currentBlock) {
          blocks.push(currentBlock);
          currentBlock = null;
        }
        continue;
      }

      if (lineType === "heading") {
        if (currentBlock) {
          blocks.push(currentBlock);
          currentBlock = null;
        }

        const sectionNumber = groups[0];
        const headingTitle = groups[1];

        // Normalize and update the hierarchy path
        const norm = normalizeSection(sectionNumber);
        activeSections[norm] = [sectionNumber, headingTitle];

        // Deactivate sections that are not ancestors of the current heading
        for (const k of Object.keys(activeSections)) {
          if (!(isAncestorSection(k, norm) || norm === k)) {
            delete activeSections[k];
          }
        }

        // Reconstruct parent hierarchy and heading context
        const parts = norm.split('.');
        const parentHierarchy: string[] = [];
        const headingContext: string[] = [];
        for (let i = 1; i < parts.length; i++) {
          const parentPrefix = parts.slice(0, i).join('.');
          if (parentPrefix in activeSections) {
            parentHierarchy.push(activeSections[parentPrefix][0]);
            headingContext.push(activeSections[parentPrefix][1]);
          }
        }

        headingContext.push(headingTitle);

        currentSection = sectionNumber;
        currentParents = parentHierarchy;
        currentContext = headingContext;

        blocks.push({
          id: `BLK-${blockIdCounter.toString().padStart(4, '0')}`,
          type: "heading",
          text: `${sectionNumber} ${headingTitle}`,
          section_number: currentSection,
          parent_hierarchy: [...currentParents],
          heading_context: [...currentContext],
          page_number: pageNum
        });
        blockIdCounter++;

      } else if (lineType === "list_item") {
        if (currentBlock) {
          blocks.push(currentBlock);
        }

        const prefix = groups[0];
        const content = groups[1];
        currentBlock = {
          id: `BLK-${blockIdCounter.toString().padStart(4, '0')}`,
          type: "list_item",
          prefix,
          text: content,
          section_number: currentSection,
          parent_hierarchy: [...currentParents],
          heading_context: [...currentContext],
          page_number: pageNum
        };
        blockIdCounter++;

      } else if (lineType === "table_row") {
        if (currentBlock && currentBlock.type !== "table") {
          blocks.push(currentBlock);
          currentBlock = null;
        }

        if (currentBlock === null) {
          currentBlock = {
            id: `BLK-${blockIdCounter.toString().padStart(4, '0')}`,
            type: "table",
            rows: [lineStr],
            text: lineStr,
            section_number: currentSection,
            parent_hierarchy: [...currentParents],
            heading_context: [...currentContext],
            page_number: pageNum
          };
          blockIdCounter++;
        } else {
          currentBlock.rows.push(lineStr);
          currentBlock.text += "\n" + lineStr;
        }

      } else { // Normal text
        if (currentBlock === null) {
          currentBlock = {
            id: `BLK-${blockIdCounter.toString().padStart(4, '0')}`,
            type: "paragraph",
            text: lineStr,
            section_number: currentSection,
            parent_hierarchy: [...currentParents],
            heading_context: [...currentContext],
            page_number: pageNum
          };
          blockIdCounter++;
        } else if (currentBlock.type === "paragraph") {
          currentBlock.text += " " + lineStr;
        } else if (currentBlock.type === "list_item") {
          currentBlock.text += " " + lineStr;
        } else if (currentBlock.type === "table") {
          blocks.push(currentBlock);
          currentBlock = {
            id: `BLK-${blockIdCounter.toString().padStart(4, '0')}`,
            type: "paragraph",
            text: lineStr,
            section_number: currentSection,
            parent_hierarchy: [...currentParents],
            heading_context: [...currentContext],
            page_number: pageNum
          };
          blockIdCounter++;
        }
      }
    }

    if (currentBlock) {
      blocks.push(currentBlock);
    }

    // Post-process to clean up duplicate spaces in paragraphs/lists
    for (const block of blocks) {
      if (block.type === "paragraph" || block.type === "list_item") {
        block.text = block.text.replace(/\s+/g, ' ').trim();
      }
    }

    return blocks;
  }
}

export function buildHierarchyTree(blocks: Block[]): TreeNode {
  const root: TreeNode = {
    title: "Document Root",
    section: "0.0",
    type: "root",
    children: [],
    content: []
  };

  const pathMap: Record<string, TreeNode> = { "": root };

  for (const block of blocks) {
    if (block.type === "heading") {
      const secNum = block.section_number;
      const norm = normalizeSection(secNum);

      const parts = block.text.split(/\s+/);
      const title = parts.length > 1 ? parts.slice(1).join(' ') : block.text;

      const node: TreeNode = {
        title,
        section: secNum,
        type: "section",
        children: [],
        content: []
      };

      // Find the closest active parent in pathMap
      const normParts = norm.split('.');
      let parentNode = root;
      for (let i = normParts.length - 1; i > 0; i--) {
        const parentPrefix = normParts.slice(0, i).join('.');
        if (parentPrefix in pathMap) {
          parentNode = pathMap[parentPrefix];
          break;
        }
      }

      parentNode.children.push(node);
      pathMap[norm] = node;
    } else {
      const secNum = block.section_number;
      const norm = normalizeSection(secNum);

      const normParts = norm.split('.');
      let targetNode = root;
      for (let i = normParts.length; i > 0; i--) {
        const prefix = normParts.slice(0, i).join('.');
        if (prefix in pathMap) {
          targetNode = pathMap[prefix];
          break;
        }
      }

      targetNode.content.push(block);
    }
  }

  return root;
}

function treeToMarkdownLines(node: TreeNode, depth = 1): string[] {
  const lines: string[] = [];
  if (node.type === "section") {
    const hashes = "#".repeat(Math.min(depth, 6));
    lines.push(`${hashes} ${node.section} ${node.title}\n`);
  }

  for (const block of node.content) {
    if (block.type === "paragraph") {
      lines.push(`${block.text}\n`);
    } else if (block.type === "list_item") {
      const prefix = block.prefix || "-";
      lines.push(`${prefix} ${block.text}\n`);
    } else if (block.type === "table") {
      lines.push(`\`\`\`\n${block.text}\n\`\`\`\n`);
    }
  }

  for (const child of node.children) {
    lines.push(...treeToMarkdownLines(child, depth + 1));
  }

  return lines;
}

export function treeToMarkdown(tree: TreeNode): string {
  const mdParts: string[] = [];
  for (const child of tree.children) {
    mdParts.push(...treeToMarkdownLines(child, 1));
    mdParts.push("\n");
  }
  return mdParts.join("\n").trim();
}
