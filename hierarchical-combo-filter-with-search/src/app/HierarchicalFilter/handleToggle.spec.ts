import {
    isPathSelected,
    toggleSelection,
    createDashboardParameterValue,
} from './handleToggle';

type TSelections = string[][];

describe('toggleSelection', () => {
    it('should toggle a selection', () => {
        const current: TSelections = [];
        const toggle1 = ['1', '2'];
        const current1 = toggleSelection(current, toggle1);
        expect(current1).toEqual([['1', '2']]);
        const toggle2 = ['1', '3'];
        const current2 = toggleSelection(current1, toggle2);
        expect(current2).toEqual([
            ['1', '2'],
            ['1', '3'],
        ]);
        const toggle3 = ['1'];
        const current3 = toggleSelection(current2, toggle3);
        expect(current3).toEqual([['1']]);
        const toggle4 = ['2', '2'];
        const current4 = toggleSelection(current3, toggle4);
        expect(current4).toEqual([['1'], ['2', '2']]);
        const toggle5 = ['2', '2', '3'];
        const current5 = toggleSelection(current4, toggle5);
        expect(current5).toEqual([['1'], ['2', '2', '3']]);
    });
});

describe('isPathSelected', () => {
    it('should return true if the path is selected', () => {
        const selections: TSelections = [['1', '2'], ['1', '3'], ['3']];
        const path = ['1', '2'];
        const result = isPathSelected(selections, path);
        expect(result).toEqual(true);
        const path2 = ['1', '4'];
        const result2 = isPathSelected(selections, path2);
        expect(result2).toEqual(false);
        const path3 = ['3'];
        const result3 = isPathSelected(selections, path3);
        expect(result3).toEqual(true);
        const path4 = ['3', '4'];
        const result4 = isPathSelected(selections, path4);
        expect(result4).toEqual(true);
        const path5 = ['1', '2', '3'];
        const result5 = isPathSelected(selections, path5);
        expect(result5).toEqual(true);
        const path6 = ['1', '2', '3', '4'];
        const result6 = isPathSelected(selections, path6);
        expect(result6).toEqual(true);
        const path7 = ['1'];
        const result7 = isPathSelected(selections, path7);
        expect(result7).toEqual('mixed');
    });
});

describe('createDashboardParameterValue', () => {
    it('should update the dashboard filters', () => {
        const selections: TSelections = [['1', '2'], ['1', '3'], ['3']];
        const dashboard_parameter = 'A';
        const expected = {
            A: '1__2..1__3..3',
        };
        const result = createDashboardParameterValue(
            selections,
            dashboard_parameter,
            '..',
            '__'
        );
        expect(result).toEqual(expected);
        const selections2: TSelections = [
            ['1', '2'],
            ['1', '3'],
            ['3'],
            ['1', '4', '5'],
        ];
        const dashboard_parameter2 = 'A';
        const expected2 = {
            A: '1__2..1__3..3..1__4__5',
        };
        const result2 = createDashboardParameterValue(
            selections2,
            dashboard_parameter2,
            '..',
            '__'
        );
        expect(result2).toEqual(expected2);
    });
});
