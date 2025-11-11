import { FieldCheckbox, SpaceVertical } from '@looker/components';
import React from 'react';
import { IHierarchyValues } from '../api/filters/route';
import { isPathSelected } from './handleToggle';

const CheckboxTree: React.FC<{
    nodes: IHierarchyValues[];
    selectedPaths: string[][];
    parent: string[];
    onToggle: (path: string[]) => void;
}> = ({ nodes, selectedPaths, onToggle, parent }) => {
    return (
        <SpaceVertical marginLeft="small" gap="none">
            {nodes.map((node, i) => (
                <React.Fragment key={`${node.value}-${i}`}>
                    <FieldCheckbox
                        key={`${node.value}-${i}`}
                        checked={isPathSelected(selectedPaths, [
                            ...parent,
                            node.value,
                        ])}
                        label={node.value}
                        onChange={() => onToggle([...parent, node.value])}
                    />
                    {node.children?.length ? (
                        <CheckboxTree
                            nodes={node.children}
                            selectedPaths={selectedPaths}
                            onToggle={onToggle}
                            parent={[...parent, node.value]}
                        />
                    ) : null}
                </React.Fragment>
            ))}
        </SpaceVertical>
    );
};

export default React.memo(CheckboxTree);
