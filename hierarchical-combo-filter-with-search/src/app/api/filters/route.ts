import { NextRequest, NextResponse } from 'next/server';
import { LookerNodeSDK } from '@looker/sdk-node';
import { IWriteQuery } from '@looker/sdk';

const FIELDS = ['products.brand', 'products.category', 'products.item_name'];

export async function GET(request: NextRequest) {
    const sdk = LookerNodeSDK.init40();
    try {
        const searchParams = request.nextUrl.searchParams;
        const q = searchParams.get('q') || '';

        const query: IWriteQuery = {
            model: 'thelook',
            view: 'order_items',
            fields: FIELDS,
            limit: '100',
            sorts: FIELDS.map((f) => `${f} asc`),
            filters: Object.fromEntries(FIELDS.map((f) => [f, '-EMPTY'])),
        };

        if (q?.length) {
            query.filter_expression = FIELDS.map((f) =>
                createFilterExpression(f, q)
            ).join(' OR ');
        }

        const result = (await sdk.ok(
            sdk.run_inline_query({
                result_format: 'json',
                body: query,
            })
        )) as unknown as { [key: string]: string }[];

        return NextResponse.json(
            trandlateRowsToHierarchyValues(result, FIELDS)
        );
    } catch (error) {
        console.error('Looker query error:', error);
        return NextResponse.json(
            {
                error: 'Failed to run query',
                details:
                    error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}

export const createFilterExpression = (field_name: string, value: string) => {
    const field_ref = '${' + field_name + '}';
    const spaces_to_wildcards = value.replace(/ /g, '%');
    return `matches_filter(${field_ref}, \`%${spaces_to_wildcards}%\`)`;
};

export interface IHierarchyValues {
    value: string;
    children?: IHierarchyValues[];
}

export const trandlateRowsToHierarchyValues = (
    rows: { [key: string]: string }[],
    keys: string[]
) => {
    if (keys.length === 0 || rows.length === 0) {
        return [];
    }

    // Build a map to group rows by the first key's value
    // Optimized: single lookup per row instead of has() + get()
    const grouped = new Map<string, { [key: string]: string }[]>();

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const firstKeyValue = row[keys[0]];
        let groupRows = grouped.get(firstKeyValue);
        if (!groupRows) {
            groupRows = [];
            grouped.set(firstKeyValue, groupRows);
        }
        groupRows.push(row);
    }

    // Convert map to hierarchy structure
    // Pre-allocate array size for better performance
    const hierarchy_values: IHierarchyValues[] = new Array(grouped.size);
    let index = 0;

    // Use for...of for better performance than forEach
    for (const [firstKeyValue, groupRows] of grouped) {
        const node: IHierarchyValues = {
            value: firstKeyValue,
        };

        // If there are more keys, recursively build children
        if (keys.length > 1) {
            const childKeys = keys.slice(1);
            node.children = trandlateRowsToHierarchyValues(
                groupRows,
                childKeys
            );
        }

        hierarchy_values[index++] = node;
    }

    return hierarchy_values;
};
