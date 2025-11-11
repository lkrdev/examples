import { MixedBoolean } from '@looker/components';

export type TSelections = string[][];

// Helper function to check if path1 is a prefix of path2 (path1 is parent of path2)
const isPrefix = (path1: string[], path2: string[]): boolean => {
    if (path1.length >= path2.length) return false;
    for (let i = 0; i < path1.length; i++) {
        if (path1[i] !== path2[i]) return false;
    }
    return true;
};

// Helper function to check if two paths are equal
const pathsEqual = (path1: string[], path2: string[]): boolean => {
    if (path1.length !== path2.length) return false;
    for (let i = 0; i < path1.length; i++) {
        if (path1[i] !== path2[i]) return false;
    }
    return true;
};

const toggleSelectionImpl = (selections: TSelections, path: string[]) => {
    const pathLength = path.length;
    let exactIndex = -1;
    let parentIndex = -1;
    const childIndices: number[] = [];

    // Single pass through selections to find exact match, parent, and children
    for (let i = 0; i < selections.length; i++) {
        const s = selections[i];
        const sLength = s.length;

        // Check for exact match
        if (exactIndex === -1 && pathsEqual(s, path)) {
            exactIndex = i;
            continue; // Exact match found, no need to check other conditions
        }

        // Check if current selection is a child of path (path is parent)
        if (sLength > pathLength && isPrefix(path, s)) {
            childIndices.push(i);
            continue;
        }

        // Check if path is a child of current selection (s is parent)
        if (parentIndex === -1 && pathLength > sLength && isPrefix(s, path)) {
            parentIndex = i;
        }
    }

    // If exact path exists, remove it
    if (exactIndex !== -1) {
        const result = new Array(selections.length - 1);
        for (let i = 0, j = 0; i < selections.length; i++) {
            if (i !== exactIndex) {
                result[j++] = selections[i];
            }
        }
        return result;
    }

    // If there are children, remove all children and add the parent
    if (childIndices.length > 0) {
        const result: string[][] = [];
        const childSet = new Set(childIndices);
        for (let i = 0; i < selections.length; i++) {
            if (!childSet.has(i)) {
                result.push(selections[i]);
            }
        }
        result.push(path);
        return result;
    }

    // If path is a child of an existing selection, replace the parent with the child
    if (parentIndex !== -1) {
        const result = [...selections];
        result[parentIndex] = path;
        return result;
    }

    // Otherwise, just add the new path
    return [...selections, path];
};

export const toggleSelection = (selections: TSelections, path: string[]) => {
    return toggleSelectionImpl(selections, path);
};

export const isPathSelected = (
    selections: TSelections,
    path: string[]
): MixedBoolean => {
    const pathLength = path.length;
    let hasExactMatch = false;
    let hasParent = false;
    let hasChild = false;

    // Single pass with early exits and length checks to avoid unnecessary function calls
    for (const selection of selections) {
        const selectionLength = selection.length;

        // Check for exact match (fast path: length check first)
        if (selectionLength === pathLength) {
            if (pathsEqual(selection, path)) {
                hasExactMatch = true;
                break; // Exact match means fully selected
            }
            continue; // Same length but not equal, skip other checks
        }

        // Check if selection is a parent (prefix) of path
        // Only check if selection is shorter than path
        if (selectionLength < pathLength) {
            if (isPrefix(selection, path)) {
                hasParent = true;
                break; // Parent selected means fully selected
            }
            continue; // Not a parent, skip child check
        }

        // Check if path is a parent (prefix) of selection (path has a child selected)
        // Only check if path is shorter than selection
        if (pathLength < selectionLength) {
            if (isPrefix(path, selection)) {
                hasChild = true;
                // Don't break here - need to check all for potential exact match or parent
            }
        }
    }

    if (hasExactMatch || hasParent) {
        return true;
    }
    if (hasChild) {
        return 'mixed';
    }
    return false;
};

export const createDashboardParameterValue = (
    selections: TSelections,
    dashboard_parameter: string,
    value_seperator: string = '..',
    hierarchy_seperator: string = '__'
) => {
    const values = selections.map((path) => path.join(hierarchy_seperator));
    const value = values.join(value_seperator);
    return {
        [dashboard_parameter]: value,
    };
};
