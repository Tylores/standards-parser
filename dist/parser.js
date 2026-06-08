import { PDFParse } from 'pdf-parse';
import { readFileSync } from 'node:fs';
// Regex to match headings like:
// "1.0 Introduction to ESI"
// "4.1.2 Physical layer"
// "Annex A (informative) - Title"
// "A.1 General"
export const HEADING_REGEX = /^\s*((?:Annex\s+[A-Z]\b\.?\s*)?(?:\d+(?:\.\d+)+|\d+|\b[A-Z](?:\.\d+)*))\.?\s+([A-Z\d_].*)$/;
// Regex to match list items like "• Bullet", "1) First", "a. Item"
export const LIST_PREFIX_REGEX = /^\s*(•|[*+-]|\b\d+[\.\)]|\b[a-zA-Z][\.\)]|\(\d+\)|\([a-zA-Z]\))\s+(.*)$/;
export function normalizeSection(secNum) {
    const parts = secNum.split('.');
    while (parts.length > 1 && parts[parts.length - 1] === '0') {
        parts.pop();
    }
    return parts.join('.');
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
export class PDFParser {
    pdfPath;
    cleanHeaders;
    constructor(pdfPath, cleanHeaders) {
        this.pdfPath = pdfPath;
        this.cleanHeaders = cleanHeaders;
    }
    async getSampleText() {
        try {
            const data = readFileSync(this.pdfPath);
            const pdfParser = new PDFParse({ data });
            const textResult = await pdfParser.getText();
            // Concatenate the first few pages to detect standard type
            return (textResult.pages || []).slice(0, 3).map((p) => p.text || "").join("\n");
        }
        catch {
            return "";
        }
    }
    async parse() {
        const pagesLinesAndTypes = [];
        try {
            const data = readFileSync(this.pdfPath);
            const pdfParser = new PDFParse({ data });
            const textResult = await pdfParser.getText();
            for (const page of textResult.pages) {
                const pageNum = page.num;
                const text = page.text;
                if (!text)
                    continue;
                const rawLines = text.split('\n');
                const cleanedLines = cleanPageLines(rawLines, this.cleanHeaders);
                for (const line of cleanedLines) {
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
        }
        catch (e) {
            throw new Error(`Error reading PDF page contents: ${e.message}`);
        }
        return this.assembleBlocks(pagesLinesAndTypes);
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
                    if (!(norm.startsWith(k + '.') || norm === k)) {
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
