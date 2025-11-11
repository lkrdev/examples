'use client';
import {
    Button,
    InputText,
    Popover,
    PopoverContent,
    PopoverFooter,
} from '@looker/components';
import { FilterList, Search } from '@styled-icons/material';
import React, { useEffect, useState } from 'react';
import { IHierarchyValues } from '../api/filters/route';
import CheckboxTree from './CheckboxTree';
import { toggleSelection, TSelections } from './handleToggle';
import ProgressBar from './ProgressBar';

const CheckboxPopover: React.FC<{
    updateDashboardFilters: (filters: string[][]) => void;
    search: string;
    loading: boolean;
    open: boolean;
    onClose: () => void;
    searchResults: IHierarchyValues[];
    setSearchValue: (value: string) => void;
    selections: string[][];
    updateSelections: (selections: string[][]) => void;
}> = ({
    updateDashboardFilters,
    search,
    loading,
    open,
    onClose,
    searchResults,
    setSearchValue,
    updateSelections,
    selections,
}) => {
    const [new_selections, setNewSelections] =
        useState<TSelections>(selections);

    useEffect(() => {
        // eslint-disable-next-line
        setNewSelections([...selections]);
    }, [selections]);

    const handleApply = () => {
        onClose();
        updateSelections(new_selections);
        updateDashboardFilters(new_selections);
    };

    const handleToggle = (path: string[]) => {
        setNewSelections((prev) => toggleSelection(prev, path));
    };

    return (
        <Popover
            focusTrap={false}
            isOpen={open}
            onClose={() => {
                onClose();
                handleApply();
            }}
            content={
                <>
                    <PopoverContent width="100%">
                        <InputText
                            iconBefore={<Search />}
                            width="100%"
                            defaultValue={search}
                            placeholder="Search for a brand, category, or item"
                            onChange={(
                                e: React.ChangeEvent<HTMLInputElement>
                            ) => {
                                setSearchValue(e.target.value || '');
                            }}
                        />
                        <ProgressBar
                            width="100%"
                            margin="xxsmall"
                            visibility={loading ? 'visible' : 'hidden'}
                        />
                        <CheckboxTree
                            nodes={searchResults}
                            selectedPaths={new_selections}
                            onToggle={handleToggle}
                            parent={[]}
                        />
                    </PopoverContent>
                    <PopoverFooter></PopoverFooter>
                </>
            }
        >
            <Button
                iconAfter={<FilterList />}
                onClick={() => {
                    onClose();
                }}
            >
                Apply Hierarchical Filters
            </Button>
        </Popover>
    );
};

export default CheckboxPopover;
