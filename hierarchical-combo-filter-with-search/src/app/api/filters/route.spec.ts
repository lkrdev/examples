import {
    createFilterExpression,
    trandlateRowsToHierarchyValues,
} from './route';

describe('trandlateRowsToHierarchyValues', () => {
    it('should translate rows to hierarchy values', () => {
        const input: Record<string, string>[] = [
            { a: '1', b: '2', c: '3' },
            { a: '1', b: '2', c: '4' },
            { a: '1', b: '3', c: '3' },
            { a: '1', b: '3', c: '4' },
            { a: '2', b: '2', c: '3' },
        ];

        const outout = [
            {
                value: '1',
                children: [
                    { value: '2', children: [{ value: '3' }, { value: '4' }] },
                    { value: '3', children: [{ value: '3' }, { value: '4' }] },
                ],
            },
            {
                value: '2',
                children: [{ value: '2', children: [{ value: '3' }] }],
            },
        ];
        expect(trandlateRowsToHierarchyValues(input, ['a', 'b', 'c'])).toEqual(
            outout
        );
    });
    it('should return an empty array if the rows are empty', () => {
        const input: Record<string, string>[] = [];
        expect(trandlateRowsToHierarchyValues(input, ['a', 'b', 'c'])).toEqual(
            []
        );
    });
    it('should approppriately handle single rows', () => {
        const input: Record<string, string>[] = [{ a: '1', b: '2', c: '3' }];
        expect(trandlateRowsToHierarchyValues(input, ['a', 'b', 'c'])).toEqual([
            {
                value: '1',
                children: [{ value: '2', children: [{ value: '3' }] }],
            },
        ]);
    });
});

describe('createFilterExpression', () => {
    it('should create a filter expression', () => {
        expect(createFilterExpression('products.brand', '1')).toEqual(
            'matches_filter(${products.brand}, `%1%`)'
        );
        expect(createFilterExpression('products.brand', '1 2')).toEqual(
            'matches_filter(${products.brand}, `%1%2%`)'
        );
        expect(createFilterExpression('products.brand', '1 2 3')).toEqual(
            'matches_filter(${products.brand}, `%1%2%3%`)'
        );
    });
});
