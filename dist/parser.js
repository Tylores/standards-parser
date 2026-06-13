import { PDFParse } from 'pdf-parse';
import { readFileSync } from 'node:fs';
import { askLLM } from './llm.js';
// Regex to match headings like:
// "1.0 Introduction to ESI"
// "4.1.2 Physical layer"
// "Annex A (informative) - Title"
// "A.1 General"
export const HEADING_REGEX = /^\s*((?:Annex\s+[A-Z](?:\.\d+)*|\d+(?:\.\d+)*|[A-Z](?:\.\d+)*))\.?\s+([a-zA-Z\d_\(\)\"\'“‘].*)$/i;
// Regex to match list items like "• Bullet", "1) First", "a. Item"
export const LIST_PREFIX_REGEX = /^\s*(•|[*+-]|\b\d+[\.\)]|\b[a-zA-Z][\.\)]|\(\d+\)|\([a-zA-Z]\))\s+(.*)$/;
export function normalizeSection(secNum) {
    const clean = secNum.trim().replace(/^Annex\s+/i, '');
    const parts = clean.split('.');
    while (parts.length > 1 && parts[parts.length - 1] === '0') {
        parts.pop();
    }
    return parts.join('.');
}
export function isAncestorSection(ancestor, descendent) {
    const aParts = ancestor.split('.');
    const dParts = descendent.split('.');
    if (aParts.length >= dParts.length)
        return false;
    return aParts.every((part, idx) => dParts[idx] === part);
}
export function isTableRow(line) {
    const lineStrip = line.trim();
    if (lineStrip.includes('|')) {
        return true;
    }
    const parts = lineStrip.split(/\s{3,}/);
    return parts.length >= 2 && parts.every(p => p.length > 0);
}
export function cleanPageLines(lines, cleanHeaders) {
    const cleaned = [];
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
        }
        else {
            if (lowerLine.includes("energy services interface") ||
                lowerLine.includes("ieee std") ||
                lowerLine.includes("prepared by")) {
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
export async function validateHeadingsWithLLM(candidates, ctx, signal) {
    const falseHeadingIds = new Set();
    if (candidates.length === 0)
        return falseHeadingIds;
    const batchSize = 100;
    for (let i = 0; i < candidates.length; i += batchSize) {
        if (signal?.aborted) {
            throw new Error("Heading validation aborted by user request.");
        }
        const batch = candidates.slice(i, i + batchSize);
        const systemPrompt = `You are an expert technical document structure parser.
Your task is to analyze a list of lines extracted from a technical standard that matched a rough heading pattern, and identify which ones are FALSE headings.

A GENUINE section heading is a title of a section, clause, annex, or sub-clause (e.g. "1 Overview", "1.1 Scope", "Annex A (informative) - Security").
A FALSE heading is text that is NOT a section title, such as:
1. Math formulas or code snippets starting with decimal numbers (e.g., "0.012 Wh can be expressed as...").
2. Table rows, pricing matrix values, or text columns starting with numbers (e.g., "150 \t$0.84", "PM to midnight...").
3. Steps in a numbered sequence, footnotes, or list items (e.g., "9. Recall that no activation time...", "11. The LD waits...").
4. Normal text paragraphs that happen to start with numbers.

Analyze the list and return a JSON array containing only the "id" numbers of the FALSE headings.
Respond with valid JSON ONLY. Do not wrap in markdown or backticks. If all candidates are genuine headings, return an empty array [].`;
        const userPrompt = `Here are the candidate headings to validate:\n\n${JSON.stringify(batch, null, 2)}`;
        try {
            const text = await askLLM({ systemPrompt, userPrompt, signal }, ctx);
            if (!text) {
                continue;
            }
            let cleanText = text.trim();
            if (cleanText.startsWith("```json")) {
                cleanText = cleanText.substring(7);
            }
            else if (cleanText.startsWith("```")) {
                cleanText = cleanText.substring(3);
            }
            if (cleanText.endsWith("```")) {
                cleanText = cleanText.substring(0, cleanText.length - 3);
            }
            const parsed = JSON.parse(cleanText.trim());
            if (Array.isArray(parsed)) {
                for (const id of parsed) {
                    if (typeof id === 'number') {
                        falseHeadingIds.add(id);
                    }
                }
            }
        }
        catch (err) {
            console.error("Failed to validate headings batch via LLM:", err.message);
        }
    }
    return falseHeadingIds;
}
export class PDFParser {
    pdfPath;
    cleanHeaders;
    constructor(pdfPath, cleanHeaders) {
        this.pdfPath = pdfPath;
        this.cleanHeaders = cleanHeaders;
    }
    async getSampleText(signal) {
        let pdfParser = null;
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
            return (textResult.pages || []).slice(0, 3).map((p) => p.text || "").join("\n");
        }
        catch (err) {
            if (err.message === "PDF parsing aborted by user request.") {
                throw err;
            }
            return "";
        }
        finally {
            if (pdfParser) {
                await pdfParser.destroy().catch(() => { });
            }
        }
    }
    async parse(signal, ctx) {
        const rawLinesInfo = [];
        const candidateHeadings = [];
        let candidateIdCounter = 1;
        let pdfParser = null;
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
                if (!text)
                    continue;
                const rawLines = text.split('\n');
                const cleanedLines = cleanPageLines(rawLines, this.cleanHeaders);
                for (const line of cleanedLines) {
                    if (signal?.aborted) {
                        throw new Error("PDF parsing aborted by user request.");
                    }
                    const lineStr = line.trim();
                    if (!lineStr) {
                        rawLinesInfo.push([pageNum, "", "empty", null, 0]);
                        continue;
                    }
                    // Match Heading
                    const headingMatch = HEADING_REGEX.exec(lineStr);
                    if (headingMatch) {
                        const cid = candidateIdCounter++;
                        candidateHeadings.push({ id: cid, line: lineStr });
                        rawLinesInfo.push([pageNum, lineStr, "heading", [headingMatch[1], headingMatch[2]], cid]);
                        continue;
                    }
                    // Match List
                    const listMatch = LIST_PREFIX_REGEX.exec(lineStr);
                    if (listMatch) {
                        rawLinesInfo.push([pageNum, lineStr, "list_item", [listMatch[1], listMatch[2]], 0]);
                        continue;
                    }
                    // Match Table
                    if (isTableRow(lineStr)) {
                        rawLinesInfo.push([pageNum, lineStr, "table_row", null, 0]);
                        continue;
                    }
                    // Fallback to normal text
                    rawLinesInfo.push([pageNum, lineStr, "text", null, 0]);
                }
            }
        }
        catch (e) {
            if (e.message === "PDF parsing aborted by user request.") {
                throw e;
            }
            throw new Error(`Error reading PDF page contents: ${e.message}`);
        }
        finally {
            if (pdfParser) {
                await pdfParser.destroy().catch(() => { });
            }
        }
        // Call LLM Heading validation if model context is available
        let falseHeadingIds = new Set();
        if (ctx && candidateHeadings.length > 0) {
            try {
                falseHeadingIds = await validateHeadingsWithLLM(candidateHeadings, ctx, signal);
                console.error(`LLM Heading Validator flagged ${falseHeadingIds.size} / ${candidateHeadings.length} candidate headings as false headings.`);
            }
            catch (e) {
                console.warn("LLM heading validation failed, falling back to regex behavior:", e.message);
            }
        }
        // Process lines info, converting false headings to normal text/table row
        const linesInfoToSend = rawLinesInfo.map(([pageNum, lineStr, lineType, groups, cid]) => {
            if (lineType === "heading" && falseHeadingIds.has(cid)) {
                if (isTableRow(lineStr)) {
                    return [pageNum, lineStr, "table_row", null];
                }
                return [pageNum, lineStr, "text", null];
            }
            return [pageNum, lineStr, lineType, groups];
        });
        return this.assembleBlocks(linesInfoToSend);
    }
    assembleBlocks(linesInfo) {
        const blocks = [];
        let currentBlock = null;
        // Hierarchy state
        const activeSections = {};
        let currentSection = "0.0";
        let currentParents = [];
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
                const parentHierarchy = [];
                const headingContext = [];
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
            }
            else if (lineType === "list_item") {
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
            }
            else if (lineType === "table_row") {
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
                }
                else {
                    currentBlock.rows.push(lineStr);
                    currentBlock.text += "\n" + lineStr;
                }
            }
            else { // Normal text
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
                }
                else if (currentBlock.type === "paragraph") {
                    currentBlock.text += " " + lineStr;
                }
                else if (currentBlock.type === "list_item") {
                    currentBlock.text += " " + lineStr;
                }
                else if (currentBlock.type === "table") {
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
export function buildHierarchyTree(blocks) {
    const root = {
        title: "Document Root",
        section: "0.0",
        type: "root",
        children: [],
        content: []
    };
    const pathMap = { "": root };
    for (const block of blocks) {
        if (block.type === "heading") {
            const secNum = block.section_number;
            const norm = normalizeSection(secNum);
            const parts = block.text.split(/\s+/);
            const title = parts.length > 1 ? parts.slice(1).join(' ') : block.text;
            const node = {
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
        }
        else {
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
function treeToMarkdownLines(node, depth = 1) {
    const lines = [];
    if (node.type === "section") {
        const hashes = "#".repeat(Math.min(depth, 6));
        lines.push(`${hashes} ${node.section} ${node.title}\n`);
    }
    for (const block of node.content) {
        if (block.type === "paragraph") {
            lines.push(`${block.text}\n`);
        }
        else if (block.type === "list_item") {
            const prefix = block.prefix || "-";
            lines.push(`${prefix} ${block.text}\n`);
        }
        else if (block.type === "table") {
            lines.push(`\`\`\`\n${block.text}\n\`\`\`\n`);
        }
    }
    for (const child of node.children) {
        lines.push(...treeToMarkdownLines(child, depth + 1));
    }
    return lines;
}
export function treeToMarkdown(tree) {
    const mdParts = [];
    for (const child of tree.children) {
        mdParts.push(...treeToMarkdownLines(child, 1));
        mdParts.push("\n");
    }
    return mdParts.join("\n").trim();
}
